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
