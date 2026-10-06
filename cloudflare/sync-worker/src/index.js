// Blanc's E2EE profile-sync store. Holds ONLY AES-GCM ciphertext keyed by an
// opaque accountId derived client-side from a passphrase we never see — this
// Worker cannot decrypt or merge user data. The locator is a bearer capability;
// account and raw client-IP rate counters remain in KV for up to 120 seconds.
// This does not establish platform logging/metadata retention. See the design
// spec in the main repo (docs/superpowers/specs/2026-07-07-profile-sync-design.md).

const STORES = new Set(['bookmarks', 'settings', 'session', 'icons']); // history may follow later
const MAX_BLOB_BYTES = 512 * 1024;                 // favorites+settings are tiny; raise for history
const MAX_REQUEST_BYTES = 513 * 1024;              // blob plus v1 JSON envelope
const RATE_LIMIT = 30;                             // GETs per accountId per minute — anti-hammering of one account
const IP_RATE_LIMIT = 120;                         // requests per client IP per minute — the anti-guessing throttle

const blobKey = (a, s) => `blob:${a}:${s}`;

// Activity marker (storage budget design 2026-10-05): any successful read or
// write keeps the account alive; one untouched for a year expires, and the
// daily cleanup then deletes its blobs. Refreshed at most every 30 days so a
// busy account costs about one KV write a month. A separate key, because
// extending an expiry on the blob itself would mean rewriting user data
// during a GET, which can race with and undo a newer PUT.
const SEEN_TTL_SECONDS = 365 * 24 * 60 * 60;
const SEEN_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const seenKey = (a) => `seen:${a}`;
const readMarker = (env, accountId) => env.SYNC.get(seenKey(accountId), { type: 'json' });

async function touchAccount(env, accountId, marker, now = Date.now()) {
  if (marker && now - marker.touchedAt < SEEN_REFRESH_MS) return;
  await env.SYNC.put(seenKey(accountId), JSON.stringify({ touchedAt: now }), { expirationTtl: SEEN_TTL_SECONDS });
}

// Daily new-account budget (design 2026-10-05 §4.2). An account with no
// marker is new; only new accounts are ever refused, so a flood can block
// sign-ups for a day but never existing users. KV has no atomic increment,
// so like bumpLimited this is an order-of-magnitude bound, not an exact one.
const DEFAULT_NEW_ACCOUNT_DAILY_LIMIT = 100;
const NEW_COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;
const utcDay = (now) => new Date(now).toISOString().slice(0, 10);

function limitFrom(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}

async function newAccountRefusal(env, now = Date.now()) {
  const limit = limitFrom(env.NEW_ACCOUNT_DAILY_LIMIT, DEFAULT_NEW_ACCOUNT_DAILY_LIMIT);
  const used = Number.parseInt((await env.SYNC.get(`new:${utcDay(now)}`)) ?? '0', 10);
  if (used < limit) return null;
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return new Response(JSON.stringify({ error: 'busy' }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(Math.max(1, Math.ceil((midnight.getTime() - now) / 1000))),
    },
  });
}

async function countNewAccount(env, now = Date.now()) {
  const key = `new:${utcDay(now)}`;
  const used = Number.parseInt((await env.SYNC.get(key)) ?? '0', 10);
  await env.SYNC.put(key, String(used + 1), { expirationTtl: NEW_COUNTER_TTL_SECONDS });
}

// Daily cleanup (design 2026-10-05 §4.3). Deletes blobs whose account has no
// live marker. Off unless CLEANUP_ENABLED is exactly "true", which is set only
// after the backfill gives every existing account a marker. Bounded per run;
// anything left is picked up the next day.
const DEFAULT_CLEANUP_MAX_DELETES = 1000;

async function listNames(env, prefix) {
  const names = [];
  let cursor;
  do {
    const page = await env.SYNC.list({ prefix, cursor });
    for (const key of page.keys) names.push(key.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return names;
}

async function cleanupInactive(env) {
  if (env.CLEANUP_ENABLED !== 'true') return { skipped: true, deleted: 0 };
  const max = limitFrom(env.CLEANUP_MAX_DELETES, DEFAULT_CLEANUP_MAX_DELETES);
  const live = new Set((await listNames(env, 'seen:')).map((name) => name.slice('seen:'.length)));
  let deleted = 0;
  for (const name of await listNames(env, 'blob:')) {
    if (deleted >= max) break;
    if (live.has(name.split(':')[1])) continue;
    await env.SYNC.delete(name);
    deleted += 1;
  }
  console.log(JSON.stringify({ event: 'sync-cleanup', deleted, live: live.size }));
  return { skipped: false, deleted };
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

// KV has no atomic increment, so these counters are coarse (concurrent bursts
// can under-count). A Durable Object is the drop-in upgrade for a hard limit.
async function bumpLimited(env, key, max) {
  const k = `${key}:${Math.floor(Date.now() / 60000)}`;
  const n = parseInt((await env.SYNC.get(k)) ?? '0', 10);
  if (n >= max) return true;
  await env.SYNC.put(k, String(n + 1), { expirationTtl: 120 });
  return false;
}

// Per-accountId GET limit — anti-hammering of a single account. It is NOT the
// brute-force defense: a passphrase guess derives a *fresh* accountId, so
// guessing is throttled per-IP (below), not per-account.
const rateLimited = (env, accountId) => bumpLimited(env, `rl:${accountId}`, RATE_LIMIT);
const ipRateLimited = (env, ip) => (ip ? bumpLimited(env, `ip:${ip}`, IP_RATE_LIMIT) : Promise.resolve(false));

async function handleGet(env, accountId, store) {
  if (await rateLimited(env, accountId)) return json({ error: 'rate-limited' }, 429);
  const rec = await env.SYNC.get(blobKey(accountId, store), { type: 'json' });
  if (!rec) return new Response('not found', { status: 404 });
  await touchAccount(env, accountId, await readMarker(env, accountId));
  return json({ version: rec.version, blob: rec.blob });
}

// Optimistic concurrency: reject if the caller's ifVersion isn't current. The
// read-then-write isn't a transaction: racing writers can both succeed and one
// write can be lost. Reconciliation does not guarantee recovery of that data.
// Atomic concurrency and deletion fencing require a separate protocol project.
async function handlePut(env, accountId, store, body) {
  if (!body || typeof body.blob !== 'object' || body.blob === null) return json({ error: 'bad blob' }, 400);
  if (new TextEncoder().encode(JSON.stringify(body.blob)).byteLength > MAX_BLOB_BYTES) return json({ error: 'too large' }, 413);
  const marker = await readMarker(env, accountId);
  if (!marker) {
    const busy = await newAccountRefusal(env);
    if (busy) return busy;
  }
  const cur = await env.SYNC.get(blobKey(accountId, store), { type: 'json' });
  if ((body.ifVersion ?? null) !== (cur?.version ?? null)) return json({ version: cur?.version ?? null, error: 'conflict' }, 409);
  const version = crypto.randomUUID();
  await env.SYNC.put(blobKey(accountId, store), JSON.stringify({ version, blob: body.blob }));
  if (!marker) await countNewAccount(env);
  await touchAccount(env, accountId, marker);
  return json({ version });
}

async function handleDelete(env, accountId) {
  await Promise.all([
    ...[...STORES].map((s) => env.SYNC.delete(blobKey(accountId, s))),
    env.SYNC.delete(seenKey(accountId)),
  ]);
  return new Response(null, { status: 204 });
}

async function readBoundedJson(request) {
  const declared = request.headers.get('Content-Length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_REQUEST_BYTES) {
    try { await request.body?.cancel(); } catch {}
    return { response: json({ error: 'too large' }, 413) };
  }
  if (!request.body) return { response: json({ error: 'bad json' }, 400) };
  const reader = request.body.getReader();
  let size = 0;
  const bytes = new Uint8Array(MAX_REQUEST_BYTES);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        try { await reader.cancel(); } catch {}
        return { response: json({ error: 'too large' }, 413) };
      }
      bytes.set(value, size - value.byteLength);
    }
    return { body: JSON.parse(new TextDecoder().decode(bytes.subarray(0, size))) };
  } catch {
    try { await reader.cancel(); } catch {}
    return { response: json({ error: 'bad json' }, 400) };
  } finally { reader.releaseLock(); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/v1\/blob\/([0-9a-f]{64})(?:\/([a-z]+))?$/);
    if (!m) return new Response('not found', { status: 404 });
    const [, accountId, store] = m;

    // Per-IP throttle across ALL methods — the actual anti-guessing defense,
    // and it also caps unauthenticated PUT/DELETE against a known accountId.
    if (await ipRateLimited(env, request.headers.get('CF-Connecting-IP'))) {
      return json({ error: 'rate-limited' }, 429);
    }

    if (request.method === 'DELETE') return handleDelete(env, accountId);
    if (store && !STORES.has(store)) return new Response('unknown store', { status: 404 });
    // GET/PUT address one store; only DELETE is account-wide. Requiring the
    // segment stops a storeless PUT from writing an unwipeable orphan key.
    if ((request.method === 'GET' || request.method === 'PUT') && !store) {
      return new Response('store required', { status: 404 });
    }
    if (request.method === 'GET') return handleGet(env, accountId, store);
    if (request.method === 'PUT') {
      const parsed = await readBoundedJson(request);
      if (parsed.response) return parsed.response;
      return handlePut(env, accountId, store, parsed.body);
    }
    return new Response('method not allowed', { status: 405 });
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanupInactive(env));
  },
};
