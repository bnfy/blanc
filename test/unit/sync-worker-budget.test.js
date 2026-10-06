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
