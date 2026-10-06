# Sync Storage Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound the sync Worker's KV storage with a 12-month inactivity marker, a daily new-account budget, and a gated daily cleanup, then roll it out without deleting any active account.

**Architecture:** All Worker logic stays in the single module `cloudflare/sync-worker/src/index.js`, because the existing tests import that file through a `data:` URL, which cannot resolve relative imports. A new key family `seen:<accountId>` records activity. A counter `new:<UTC day>` enforces the budget. A `scheduled` handler deletes blobs whose account has no marker. A one-time script backfills markers for existing accounts before cleanup is switched on.

**Tech Stack:** Cloudflare Workers (module syntax), Workers KV, Cron Triggers, wrangler v4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-05-sync-storage-budget-design.md`

## Global Constraints

- Marker key `seen:<accountId>`, value `{"touchedAt": <ms>}`, `expirationTtl` 365 days (31,536,000 s).
- Marker refresh at most once every 30 days; refreshed only by a successful PUT or a GET that returns 200. A 404 GET never creates a marker.
- New-account budget: `NEW_ACCOUNT_DAILY_LIMIT`, default and configured value `100`, counted per UTC day in `new:<YYYY-MM-DD>` with `expirationTtl` 2 days.
- Over budget: HTTP 503, body `{"error":"busy"}`, `Retry-After` = whole seconds until 00:00 UTC. Nothing stored. Existing accounts (marker present) are never refused.
- Cleanup: Cron `17 4 * * *`; runs only when `CLEANUP_ENABLED` is exactly `"true"`; at most `CLEANUP_MAX_DELETES` (default and configured `1000`) deletions per run.
- `DELETE` removes the marker as well as the blobs.
- Unchanged: rate limits, blob size caps, store list, optimistic concurrency, and existing response codes.
- No desktop app change. Every production deploy needs the owner's explicit "deploy". `CLEANUP_ENABLED` is not set in `wrangler.toml` until Task 6.
- Every wrangler KV command against production passes `--remote`.

## File map

| File | Responsibility |
|---|---|
| `cloudflare/sync-worker/src/index.js` | Marker, budget, cleanup (modify) |
| `cloudflare/sync-worker/wrangler.toml` | `[vars]` limits and the cron trigger (modify) |
| `cloudflare/sync-worker/scripts/backfill-seen-markers.mjs` | One-time marker backfill and count verification (create) |
| `cloudflare/sync-worker/README.md` | Document the budget and rollout (modify) |
| `test/unit/sync-worker-budget.test.js` | Tests for marker, budget, cleanup (create) |
| `test/unit/sync-worker-backfill.test.js` | Tests for the backfill helpers (create) |
| `test/unit/sync-worker-limits.test.js` | One existing assertion counts all keys; narrow it to blobs (modify) |
| `site/src/pages/privacy.astro` | Retention sentence, only after cleanup is live (modify, Task 7) |

Work on a branch from `origin/main`, for example `claude/sync-storage-budget`.

---

### Task 1: Activity marker

**Files:**
- Modify: `cloudflare/sync-worker/src/index.js`
- Modify: `test/unit/sync-worker-limits.test.js` (the R5 test's `env.records.size` assertion)
- Test: `test/unit/sync-worker-budget.test.js` (create)

**Interfaces:**
- Produces, inside `index.js` (module-private): `SEEN_TTL_SECONDS`, `SEEN_REFRESH_MS`, `seenKey(accountId)`, `readMarker(env, accountId) → Promise<{touchedAt:number}|null>`, `touchAccount(env, accountId, marker, now = Date.now()) → Promise<void>`.
- Produces, in the test file: the `storage(vars)` and `request(...)` helpers that Tasks 2 and 3 extend.

- [ ] **Step 1: Write the failing tests**

Create `test/unit/sync-worker-budget.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const workerPromise = import(`data:text/javascript;base64,${fs.readFileSync(require.resolve('../../cloudflare/sync-worker/src/index.js')).toString('base64')}`).then((m) => m.default);

const DAY_MS = 24 * 60 * 60 * 1000;
const SEEN_TTL = 365 * 24 * 60 * 60;
const accountA = 'a'.repeat(64);
const accountB = 'b'.repeat(64);

// In-memory KV with expirationTtl capture and two-key pages, so listing
// pagination is exercised.
function storage(vars = {}) {
  const records = new Map();
  const ttl = new Map();
  const deletes = [];
  return {
    ...vars,
    records, ttl, deletes,
    SYNC: {
      get: async (key, options) => {
        const value = records.get(key) ?? null;
        return value && options?.type === 'json' ? JSON.parse(value) : value;
      },
      put: async (key, value, options) => {
        records.set(key, value);
        if (options?.expirationTtl) ttl.set(key, options.expirationTtl);
      },
      delete: async (key) => { deletes.push(key); records.delete(key); },
      list: async ({ prefix = '', cursor } = {}) => {
        const all = [...records.keys()].filter((key) => key.startsWith(prefix)).sort();
        const start = cursor ? Number(cursor) : 0;
        const next = start + 2;
        const complete = next >= all.length;
        return {
          keys: all.slice(start, next).map((name) => ({ name })),
          list_complete: complete,
          ...(complete ? {} : { cursor: String(next) }),
        };
      },
    },
  };
}

async function request(env, method, account, store, body) {
  const path = store ? `${account}/${store}` : account;
  const init = { method };
  if (body !== undefined) { init.body = JSON.stringify(body); init.duplex = 'half'; }
  return (await workerPromise).fetch(new Request(`https://sync.example.test/v1/blob/${path}`, init), env);
}

const putBlob = (env, account, store = 'bookmarks') => request(env, 'PUT', account, store, { blob: { ct: 'x' }, ifVersion: null });
const marker = (env, account) => (env.records.has(`seen:${account}`) ? JSON.parse(env.records.get(`seen:${account}`)) : null);
const blobKeys = (env) => [...env.records.keys()].filter((key) => key.startsWith('blob:'));

test('a successful read creates a missing activity marker; a 404 read does not', async () => {
  const env = storage();
  assert.equal((await request(env, 'GET', accountA, 'settings')).status, 404);
  assert.equal(marker(env, accountA), null);

  env.records.set(`blob:${accountA}:settings`, JSON.stringify({ version: 'v1', blob: { ct: 'x' } }));
  assert.equal((await request(env, 'GET', accountA, 'settings')).status, 200);
  assert.ok(marker(env, accountA).touchedAt > Date.now() - 60_000);
  assert.equal(env.ttl.get(`seen:${accountA}`), SEEN_TTL);
});

test('a marker younger than 30 days is not rewritten; an older one is', async () => {
  const env = storage();
  env.records.set(`blob:${accountA}:settings`, JSON.stringify({ version: 'v1', blob: { ct: 'x' } }));

  const fresh = Date.now() - 29 * DAY_MS;
  env.records.set(`seen:${accountA}`, JSON.stringify({ touchedAt: fresh }));
  await request(env, 'GET', accountA, 'settings');
  assert.equal(marker(env, accountA).touchedAt, fresh);

  const stale = Date.now() - 31 * DAY_MS;
  env.records.set(`seen:${accountA}`, JSON.stringify({ touchedAt: stale }));
  await request(env, 'GET', accountA, 'settings');
  assert.ok(marker(env, accountA).touchedAt > stale + DAY_MS);
});

test('an upload marks the account active with a 365-day expiry', async () => {
  const env = storage();
  assert.equal((await putBlob(env, accountA)).status, 200);
  assert.ok(marker(env, accountA));
  assert.equal(env.ttl.get(`seen:${accountA}`), SEEN_TTL);
});

test('erasing the server copy removes the activity marker', async () => {
  const env = storage();
  await putBlob(env, accountA);
  assert.equal((await request(env, 'DELETE', accountA)).status, 204);
  assert.equal(marker(env, accountA), null);
  assert.deepEqual(blobKeys(env), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/sync-worker-budget.test.js`
Expected: FAIL. The 200-GET, upload, and refresh tests find no `seen:` marker. The 404 and DELETE tests pass already; that is fine.

- [ ] **Step 3: Implement the marker in `cloudflare/sync-worker/src/index.js`**

Below `const blobKey = ...`, add:

```js
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
```

In `handleGet`, replace

```js
  if (!rec) return new Response('not found', { status: 404 });
  return json({ version: rec.version, blob: rec.blob });
```

with

```js
  if (!rec) return new Response('not found', { status: 404 });
  await touchAccount(env, accountId, await readMarker(env, accountId));
  return json({ version: rec.version, blob: rec.blob });
```

In `handlePut`, replace

```js
  const cur = await env.SYNC.get(blobKey(accountId, store), { type: 'json' });
  if ((body.ifVersion ?? null) !== (cur?.version ?? null)) return json({ version: cur?.version ?? null, error: 'conflict' }, 409);
  const version = crypto.randomUUID();
  await env.SYNC.put(blobKey(accountId, store), JSON.stringify({ version, blob: body.blob }));
  return json({ version });
```

with

```js
  const marker = await readMarker(env, accountId);
  const cur = await env.SYNC.get(blobKey(accountId, store), { type: 'json' });
  if ((body.ifVersion ?? null) !== (cur?.version ?? null)) return json({ version: cur?.version ?? null, error: 'conflict' }, 409);
  const version = crypto.randomUUID();
  await env.SYNC.put(blobKey(accountId, store), JSON.stringify({ version, blob: body.blob }));
  await touchAccount(env, accountId, marker);
  return json({ version });
```

Replace `handleDelete` with

```js
async function handleDelete(env, accountId) {
  await Promise.all([
    ...[...STORES].map((s) => env.SYNC.delete(blobKey(accountId, s))),
    env.SYNC.delete(seenKey(accountId)),
  ]);
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 4: Narrow the existing R5 assertion**

In `test/unit/sync-worker-limits.test.js`, the R5 test now also sees a `seen:` key. Replace

```js
  assert.equal(env.records.size, 1);
```

with

```js
  assert.equal([...env.records.keys()].filter((k) => k.startsWith('blob:')).length, 1);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/unit/sync-worker-budget.test.js test/unit/sync-worker-limits.test.js`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add cloudflare/sync-worker/src/index.js test/unit/sync-worker-budget.test.js test/unit/sync-worker-limits.test.js
git commit -m "Track sync account activity with a 12-month marker"
```

---

### Task 2: Daily new-account budget

**Files:**
- Modify: `cloudflare/sync-worker/src/index.js`
- Modify: `cloudflare/sync-worker/wrangler.toml`
- Test: `test/unit/sync-worker-budget.test.js`

**Interfaces:**
- Consumes: `readMarker`, `touchAccount`, and the `marker` already read in `handlePut` (Task 1).
- Produces, inside `index.js`: `limitFrom(value, fallback) → number`, `utcDay(now) → 'YYYY-MM-DD'`, `newAccountRefusal(env, now = Date.now()) → Promise<Response|null>`, `countNewAccount(env, now = Date.now()) → Promise<void>`. Task 3 reuses `limitFrom`.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/sync-worker-budget.test.js`:

```js
const counter = (env) => {
  const key = [...env.records.keys()].find((k) => k.startsWith('new:'));
  return key ? Number(env.records.get(key)) : 0;
};

test('a new account counts once toward the day’s budget, an existing one never', async () => {
  const env = storage({ NEW_ACCOUNT_DAILY_LIMIT: '5' });
  await putBlob(env, accountA, 'bookmarks');
  await putBlob(env, accountA, 'settings');
  assert.equal(counter(env), 1);
  const key = [...env.records.keys()].find((k) => k.startsWith('new:'));
  assert.match(key, /^new:\d{4}-\d{2}-\d{2}$/);
  assert.equal(env.ttl.get(key), 2 * 24 * 60 * 60);
});

test('at the limit a new account gets 503 busy with Retry-After and nothing is stored', async () => {
  const env = storage({ NEW_ACCOUNT_DAILY_LIMIT: '1' });
  assert.equal((await putBlob(env, accountA)).status, 200);
  const res = await putBlob(env, accountB);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'busy' });
  const retry = Number(res.headers.get('Retry-After'));
  assert.ok(Number.isInteger(retry) && retry >= 1 && retry <= 86_400, `Retry-After ${retry}`);
  assert.equal(env.records.has(`blob:${accountB}:bookmarks`), false);
  assert.equal(marker(env, accountB), null);
});

test('at the limit an existing account still uploads', async () => {
  const env = storage({ NEW_ACCOUNT_DAILY_LIMIT: '1' });
  await putBlob(env, accountA, 'bookmarks');
  assert.equal((await putBlob(env, accountA, 'settings')).status, 200);
});

test('a missing or unreadable limit falls back to 100', async () => {
  for (const vars of [{}, { NEW_ACCOUNT_DAILY_LIMIT: 'lots' }]) {
    const env = storage(vars);
    env.records.set(`new:${new Date().toISOString().slice(0, 10)}`, '99');
    assert.equal((await putBlob(env, accountA)).status, 200);
    assert.equal((await putBlob(env, accountB)).status, 503);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/sync-worker-budget.test.js`
Expected: FAIL. No `new:` counter is written and no request is refused.

- [ ] **Step 3: Implement the budget**

In `index.js`, below the marker block from Task 1, add:

```js
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
```

In `handlePut`, replace

```js
  const marker = await readMarker(env, accountId);
  const cur = await env.SYNC.get(blobKey(accountId, store), { type: 'json' });
```

with

```js
  const marker = await readMarker(env, accountId);
  if (!marker) {
    const busy = await newAccountRefusal(env);
    if (busy) return busy;
  }
  const cur = await env.SYNC.get(blobKey(accountId, store), { type: 'json' });
```

and replace

```js
  await env.SYNC.put(blobKey(accountId, store), JSON.stringify({ version, blob: body.blob }));
  await touchAccount(env, accountId, marker);
```

with

```js
  await env.SYNC.put(blobKey(accountId, store), JSON.stringify({ version, blob: body.blob }));
  if (!marker) await countNewAccount(env);
  await touchAccount(env, accountId, marker);
```

- [ ] **Step 4: Configure the limit**

In `cloudflare/sync-worker/wrangler.toml`, append:

```toml

[vars]
NEW_ACCOUNT_DAILY_LIMIT = "100"
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/unit/sync-worker-budget.test.js test/unit/sync-worker-limits.test.js`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add cloudflare/sync-worker/src/index.js cloudflare/sync-worker/wrangler.toml test/unit/sync-worker-budget.test.js
git commit -m "Cap new sync accounts per day without blocking existing ones"
```

---

### Task 3: Gated daily cleanup

**Files:**
- Modify: `cloudflare/sync-worker/src/index.js`
- Modify: `cloudflare/sync-worker/wrangler.toml`
- Test: `test/unit/sync-worker-budget.test.js`

**Interfaces:**
- Consumes: `limitFrom` (Task 2), the `seen:` key format (Task 1).
- Produces: the module's default export gains `scheduled(event, env, ctx)`. It calls `ctx.waitUntil(cleanupInactive(env))`, where module-private `cleanupInactive(env) → Promise<{ skipped: boolean, deleted: number }>`. Do **not** add named exports; Workers treat named exports as entrypoints.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/sync-worker-budget.test.js`:

```js
async function runCleanup(env) {
  const pending = [];
  await (await workerPromise).scheduled({ cron: '17 4 * * *' }, env, { waitUntil: (p) => pending.push(p) });
  return Promise.all(pending);
}

function seed(env, account, { live }) {
  for (const store of ['bookmarks', 'settings', 'session']) env.records.set(`blob:${account}:${store}`, '{}');
  if (live) env.records.set(`seen:${account}`, JSON.stringify({ touchedAt: Date.now() }));
}

test('cleanup does nothing unless CLEANUP_ENABLED is exactly "true"', async () => {
  for (const vars of [{}, { CLEANUP_ENABLED: 'false' }, { CLEANUP_ENABLED: '1' }]) {
    const env = storage(vars);
    seed(env, accountB, { live: false });
    await runCleanup(env);
    assert.deepEqual(env.deletes, []);
  }
});

test('cleanup deletes only accounts without a marker, across listing pages', async () => {
  const env = storage({ CLEANUP_ENABLED: 'true' });
  seed(env, accountA, { live: true });
  seed(env, accountB, { live: false });
  const accountC = 'c'.repeat(64);
  seed(env, accountC, { live: true });
  await runCleanup(env);
  assert.deepEqual(blobKeys(env).map((k) => k.split(':')[1]).sort(), [accountA, accountA, accountA, accountC, accountC, accountC].sort());
  assert.ok(env.deletes.every((k) => k.startsWith(`blob:${accountB}:`)));
  assert.equal(env.deletes.length, 3);
});

test('cleanup stops at CLEANUP_MAX_DELETES and resumes on the next run', async () => {
  const env = storage({ CLEANUP_ENABLED: 'true', CLEANUP_MAX_DELETES: '2' });
  seed(env, accountB, { live: false });
  await runCleanup(env);
  assert.equal(env.deletes.length, 2);
  await runCleanup(env);
  assert.deepEqual(blobKeys(env), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/sync-worker-budget.test.js`
Expected: FAIL with `TypeError` (`scheduled` is not a function).

- [ ] **Step 3: Implement cleanup**

In `index.js`, below the budget block, add:

```js
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
```

In the default export, after the `fetch` method, add:

```js
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanupInactive(env));
  },
```

- [ ] **Step 4: Configure the trigger and per-run cap**

In `cloudflare/sync-worker/wrangler.toml`, extend `[vars]` and add the trigger, so the tail of the file reads:

```toml
[vars]
NEW_ACCOUNT_DAILY_LIMIT = "100"
CLEANUP_MAX_DELETES = "1000"

[triggers]
crons = ["17 4 * * *"]
```

`CLEANUP_ENABLED` is deliberately absent until Task 6.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/unit/sync-worker-budget.test.js test/unit/sync-worker-limits.test.js`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add cloudflare/sync-worker/src/index.js cloudflare/sync-worker/wrangler.toml test/unit/sync-worker-budget.test.js
git commit -m "Add a gated daily cleanup for inactive sync accounts"
```

---

### Task 4: Marker backfill script and README

**Files:**
- Create: `cloudflare/sync-worker/scripts/backfill-seen-markers.mjs`
- Modify: `cloudflare/sync-worker/README.md`
- Test: `test/unit/sync-worker-backfill.test.js` (create)

**Interfaces:**
- Produces, as named exports of the `.mjs` script: `markersForBlobKeys(names, now) → Array<{key, value, expiration_ttl}>` (throws when it finds no accounts) and `verifyCounts(blobNames, seenNames) → { accounts, markers, missing: string[] }`.

- [ ] **Step 1: Write the failing tests**

Create `test/unit/sync-worker-backfill.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const scriptPromise = import('../../cloudflare/sync-worker/scripts/backfill-seen-markers.mjs');
const a = 'a'.repeat(64);
const b = 'b'.repeat(64);

test('one marker per account, with the full 365-day expiry', async () => {
  const { markersForBlobKeys } = await scriptPromise;
  const markers = markersForBlobKeys([`blob:${a}:bookmarks`, `blob:${a}:settings`, `blob:${b}:session`, 'rl:x:1'], 1_000);
  assert.deepEqual(markers, [
    { key: `seen:${a}`, value: JSON.stringify({ touchedAt: 1_000 }), expiration_ttl: 365 * 24 * 60 * 60 },
    { key: `seen:${b}`, value: JSON.stringify({ touchedAt: 1_000 }), expiration_ttl: 365 * 24 * 60 * 60 },
  ]);
});

test('refuses to write when the listing found no accounts', async () => {
  const { markersForBlobKeys } = await scriptPromise;
  assert.throws(() => markersForBlobKeys([], 1_000), /no sync accounts found/);
});

test('verification reports accounts that still lack a marker', async () => {
  const { verifyCounts } = await scriptPromise;
  assert.deepEqual(verifyCounts([`blob:${a}:bookmarks`, `blob:${b}:settings`], [`seen:${a}`]), { accounts: 2, markers: 1, missing: [b] });
  assert.deepEqual(verifyCounts([`blob:${a}:bookmarks`], [`seen:${a}`]), { accounts: 1, markers: 1, missing: [] });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/sync-worker-backfill.test.js`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the script**

Create `cloudflare/sync-worker/scripts/backfill-seen-markers.mjs`:

```js
// One-shot (design 2026-10-05 §5): give every existing sync account a seen:
// marker BEFORE the daily cleanup is enabled; otherwise cleanup would treat
// every pre-budget account as inactive and delete it. Idempotent.
// Auth: wrangler's cached OAuth on the owner's machine.
//   node scripts/backfill-seen-markers.mjs           write markers
//   node scripts/backfill-seen-markers.mjs --verify  exit 1 unless every account has one
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAMESPACE_ID = '0e6ba79c73d64d77bbb76886666c33d5';
const SEEN_TTL_SECONDS = 365 * 24 * 60 * 60;

const accountsOf = (blobNames) => [...new Set(blobNames
  .filter((name) => name.startsWith('blob:'))
  .map((name) => name.split(':')[1]))];

export function markersForBlobKeys(names, now) {
  const accounts = accountsOf(names);
  if (!accounts.length) throw new Error('no sync accounts found — refusing to write nothing');
  return accounts.map((accountId) => ({
    key: `seen:${accountId}`,
    value: JSON.stringify({ touchedAt: now }),
    expiration_ttl: SEEN_TTL_SECONDS,
  }));
}

export function verifyCounts(blobNames, seenNames) {
  const accounts = accountsOf(blobNames);
  const marked = new Set(seenNames.map((name) => name.slice('seen:'.length)));
  return {
    accounts: accounts.length,
    markers: marked.size,
    missing: accounts.filter((accountId) => !marked.has(accountId)),
  };
}

function listKeys(prefix) {
  // --remote is load-bearing: without it wrangler v4 lists a LOCAL simulated
  // namespace (empty) instead of production KV.
  const raw = execFileSync('npx', [
    'wrangler', 'kv', 'key', 'list', '--remote',
    `--namespace-id=${NAMESPACE_ID}`, `--prefix=${prefix}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(raw).map((key) => key.name);
}

function main() {
  const blobs = listKeys('blob:');
  if (process.argv.includes('--verify')) {
    const result = verifyCounts(blobs, listKeys('seen:'));
    console.log(JSON.stringify(result));
    process.exit(result.missing.length ? 1 : 0);
  }
  const markers = markersForBlobKeys(blobs, Date.now());
  const dir = mkdtempSync(join(tmpdir(), 'sync-seen-'));
  const file = join(dir, 'markers.json');
  try {
    writeFileSync(file, JSON.stringify(markers));
    console.log(`writing ${markers.length} seen: markers for ${blobs.length} blob keys`);
    execFileSync('npx', [
      'wrangler', 'kv', 'bulk', 'put', '--remote', file, `--namespace-id=${NAMESPACE_ID}`,
    ], { stdio: 'inherit' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unit/sync-worker-backfill.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Document the budget**

In `cloudflare/sync-worker/README.md`, add after the `## Deploy` section:

```markdown
## Storage budget

Design: `docs/superpowers/specs/2026-10-05-sync-storage-budget-design.md`.

- `seen:<accountId>` records activity. A successful upload or a read that
  finds data refreshes it, at most every 30 days; it expires after 365 days.
- `new:<UTC day>` counts new accounts. Past `NEW_ACCOUNT_DAILY_LIMIT`, a new
  account's upload gets `503 {"error":"busy"}` with `Retry-After`; existing
  accounts are never refused.
- A daily Cron Trigger (04:17 UTC) deletes blobs of accounts with no marker,
  at most `CLEANUP_MAX_DELETES` per run. It does nothing unless
  `CLEANUP_ENABLED = "true"`.

Never set `CLEANUP_ENABLED` until every account has a marker:
`node scripts/backfill-seen-markers.mjs`, then
`node scripts/backfill-seen-markers.mjs --verify` must exit 0.
```

- [ ] **Step 6: Commit**

```bash
git add cloudflare/sync-worker/scripts/backfill-seen-markers.mjs cloudflare/sync-worker/README.md test/unit/sync-worker-backfill.test.js
git commit -m "Add the sync marker backfill and document the storage budget"
```

---

### Task 5: Full verification and pull request

**Files:** none new.

- [ ] **Step 1: Run the whole suite and lint**

Run: `npm run test:unit && npm run lint`
Expected: every test passes; ESLint reports nothing (it covers `cloudflare/**/src/**/*.js`).

- [ ] **Step 2: Check the Worker bundles**

Run: `npx wrangler deploy --dry-run --outdir "$(mktemp -d)"` from `cloudflare/sync-worker`
Expected: completes without errors, and the printed bindings include `NEW_ACCOUNT_DAILY_LIMIT` and `CLEANUP_MAX_DELETES` but not `CLEANUP_ENABLED`. This builds locally only and deploys nothing.

- [ ] **Step 3: Run the owner's pre-commit gates**

Run `/verify` and `/simplify` before the final commit, per the owner's global instructions.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin claude/sync-storage-budget
gh pr create --base main --title "Add a storage budget to the sync Worker" --body-file <prepared body>
```

The PR body states that merging deploys nothing and that cleanup stays off until Task 6. It also links the spec.

Merging is the owner's call.

---

### Task 6: Production rollout (owner-gated)

**Files:**
- Modify: `cloudflare/sync-worker/wrangler.toml` (Step 6 only)

Each deploy below needs the owner's explicit "deploy". Stop and ask before each one.

- [ ] **Step 1: Owner confirms Cloudflare prerequisites.** The account is on the Workers Paid plan, and a billing notification exists. Record both in the PR or the rollout record.

- [ ] **Step 2: Record the starting counts**

Run from `cloudflare/sync-worker`: `node scripts/backfill-seen-markers.mjs --verify`
Expected: exit 1 with `missing` listing every existing account (42 on 2026-10-05). This proves the listing reads production, not an empty local store.

- [ ] **Step 3: Deploy with cleanup off**

Run from `cloudflare/sync-worker`: `npx wrangler deploy`
Then confirm in the Cloudflare dashboard, or with `npx wrangler deployments list`, that the new version is live and the cron trigger is listed.

- [ ] **Step 4: Backfill markers**

Run: `node scripts/backfill-seen-markers.mjs`
Expected: "writing N seen: markers", where N equals the account count from Step 2.

- [ ] **Step 5: Verify**

Wait at least 60 seconds for KV listings to settle, then run `node scripts/backfill-seen-markers.mjs --verify`.
Expected: exit 0, `missing: []`, `markers` ≥ `accounts`.

- [ ] **Step 6: Enable cleanup and deploy**

In `wrangler.toml`, add `CLEANUP_ENABLED = "true"` under `[vars]`. Commit with the message "Enable daily cleanup of inactive sync accounts", get the owner's "deploy", run `npx wrangler deploy`, and push the commit through a PR.

- [ ] **Step 7: Confirm the first run deletes nothing**

After the next 04:17 UTC run, check the Worker logs (observability or `npx wrangler tail`) for the `sync-cleanup` line.
Expected: `"deleted":0`. If it shows any deletions, set `CLEANUP_ENABLED` back to unset, deploy, and investigate before re-enabling.

---

### Task 7: Privacy page (after cleanup is live)

**Files:**
- Modify: `site/src/pages/privacy.astro`

- [ ] **Step 1: Add the retention sentence**

In the Sync paragraph, which begins "Sync content is encrypted on the device", append:

```
If no Blanc device uses a sync account for about 12 months, the server deletes it automatically. You can still erase it sooner from Settings.
```

- [ ] **Step 2: Check claims and build**

Follow `docs/marketing-claims.md`. The claim is backed by the deployed Worker and the Task 6 Step 7 log. Run the site build and checks that `site/CLAUDE.md` requires.

- [ ] **Step 3: Commit, PR, and deploy through the normal reviewed path**

Use `npm run site:deploy` only with the owner's explicit approval. Then verify Cloudflare reports the commit as Production on `main`.
