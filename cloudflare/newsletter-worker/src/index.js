// Newsletter signup store for blancbrowser.com's footer form. Holds ONLY the
// email address and when it arrived — no IPs at rest, no names, no tracking,
// mirroring the honesty of cloudflare/ping-worker and sync-worker. Blanc's
// newsletter is release notes at most; sending happens elsewhere (export via
// GET /subscribers), this Worker just keeps the list.

const MAX_EMAIL_LENGTH = 254; // RFC 5321 path limit
// Deliberately loose: real validation is the confirmation reality of sending
// mail there. This only rejects obvious non-addresses before they hit KV.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

// The form posts cross-origin (Pages site → workers.dev), so CORS is required.
// localhost is Astro's dev server.
const ALLOWED_ORIGINS = new Set([
  'https://blancbrowser.com',
  'http://localhost:4321',
]);

const SUBSCRIBE_RATE_LIMIT = 6; // per client IP per minute

const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// Same coarse KV counter as sync-worker's bumpLimited: the IP appears only in
// a rate-limit key that expires within two minutes — never in the subscriber
// records themselves.
async function ipRateLimited(env, ip) {
  if (!ip) return false;
  const key = `ip:${ip}:${Math.floor(Date.now() / 60000)}`;
  const n = parseInt((await env.SUBSCRIBERS.get(key)) ?? '0', 10);
  if (n >= SUBSCRIBE_RATE_LIMIT) return true;
  await env.SUBSCRIBERS.put(key, String(n + 1), { expirationTtl: 120 });
  return false;
}

async function handleSubscribe(request, env, cors) {
  if (await ipRateLimited(env, request.headers.get('CF-Connecting-IP'))) {
    return json({ error: 'rate-limited' }, 429, cors);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad request' }, 400, cors);
  }
  if (!body || typeof body !== 'object') return json({ error: 'bad request' }, 400, cors);

  // Honeypot: the form ships a visually-hidden "website" field humans never
  // fill. A bot that does gets a cheerful 200 and writes nothing.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json({ ok: true }, 200, cors);
  }

  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    return json({ error: 'invalid email' }, 400, cors);
  }

  // Idempotent: re-subscribing an existing address keeps the original record
  // (first-seen timestamp survives) and returns the same 200, so the response
  // never leaks whether an address was already on the list.
  const key = `sub:${email}`;
  if ((await env.SUBSCRIBERS.get(key)) === null) {
    await env.SUBSCRIBERS.put(key, JSON.stringify({ ts: new Date().toISOString() }));
  }
  return json({ ok: true }, 200, cors);
}

const authorized = (request, env) =>
  env.ADMIN_TOKEN && request.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}`;

// GET /subscribers — bearer-token-gated export for whatever actually sends the
// newsletter. Plain JSON: count + [{email, ts}].
async function handleExport(env) {
  const subscribers = [];
  let cursor;
  do {
    const res = await env.SUBSCRIBERS.list({ prefix: 'sub:', cursor });
    const entries = await Promise.all(
      res.keys.map(async ({ name }) => ({
        email: name.slice('sub:'.length),
        ...(await env.SUBSCRIBERS.get(name, { type: 'json' })),
      }))
    );
    subscribers.push(...entries);
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  subscribers.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  return json({ count: subscribers.length, subscribers });
}

// DELETE /subscriber?email=… — bearer-token-gated removal, for unsubscribe and
// data-deletion requests (they arrive at support@blancbrowser.com; every sent
// mail links there). 204 either way — deleting an absent address is a no-op.
async function handleRemove(env, url) {
  const email = (url.searchParams.get('email') ?? '').trim().toLowerCase();
  if (!email) return json({ error: 'email required' }, 400);
  await env.SUBSCRIBERS.delete(`sub:${email}`);
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'POST' && url.pathname === '/subscribe') {
      return handleSubscribe(request, env, cors);
    }
    if (url.pathname === '/subscribers' || url.pathname === '/subscriber') {
      if (!authorized(request, env)) return new Response('unauthorized', { status: 401 });
      if (request.method === 'GET' && url.pathname === '/subscribers') return handleExport(env);
      if (request.method === 'DELETE' && url.pathname === '/subscriber') return handleRemove(env, url);
    }
    return new Response('not found', { status: 404 });
  },
};
