'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// The one-shot pairing route (design 2026-10-16 §5.3): a sender parks a
// wrapped secret under a code-derived id for ten minutes; the first GET
// returns it and deletes it. The Worker never sees the code or the key.
const workerPromise = import(`data:text/javascript;base64,${fs.readFileSync(require.resolve('../../cloudflare/sync-worker/src/index.js')).toString('base64')}`).then((m) => m.default);
const PAIR_ID = 'b'.repeat(64);
const pairUrl = (id = PAIR_ID) => `https://sync.example.test/v1/pair/${id}`;
const blobUrl = `https://sync.example.test/v1/blob/${'a'.repeat(64)}/bookmarks`;

function storage() {
  const records = new Map();
  const puts = [];
  return { records, puts, SYNC: {
    get: async (key, options) => { const value = records.get(key) ?? null; return value && options?.type === 'json' ? JSON.parse(value) : value; },
    put: async (key, value, options) => { puts.push({ key, options }); records.set(key, value); },
    delete: async (key) => records.delete(key),
  } };
}
async function send(env, method, url, body, ip = '203.0.113.9') {
  const worker = await workerPromise;
  const headers = { 'CF-Connecting-IP': ip };
  return worker.fetch(new Request(url, { method, body, headers, ...(body ? { duplex: 'half' } : {}) }), env);
}
const blob = () => JSON.stringify({ blob: { iv: 'aa', ct: 'bb', tag: 'cc' } });

test('POST stores pair:{id} with a 600 s TTL and answers 201', async () => {
  const env = storage();
  const res = await send(env, 'POST', pairUrl(), blob());
  assert.equal(res.status, 201);
  const put = env.puts.find(({ key }) => key === `pair:${PAIR_ID}`);
  assert.ok(put, 'the entry is stored under pair:{id}');
  assert.equal(put.options.expirationTtl, 600);
});

test('POST on an existing id answers 409 and leaves the entry', async () => {
  const env = storage();
  await send(env, 'POST', pairUrl(), blob());
  const before = env.records.get(`pair:${PAIR_ID}`);
  const res = await send(env, 'POST', pairUrl(), JSON.stringify({ blob: { iv: 'zz', ct: 'zz', tag: 'zz' } }));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'exists' });
  assert.equal(env.records.get(`pair:${PAIR_ID}`), before);
});

test('GET returns the blob once and deletes the entry', async () => {
  const env = storage();
  await send(env, 'POST', pairUrl(), blob());
  const first = await send(env, 'GET', pairUrl());
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { blob: { iv: 'aa', ct: 'bb', tag: 'cc' } });
  assert.equal(env.records.has(`pair:${PAIR_ID}`), false);
  const second = await send(env, 'GET', pairUrl());
  assert.equal(second.status, 404);
  assert.deepEqual(await second.json(), { error: 'not-found' });
});

test('DELETE removes the entry and answers 204', async () => {
  const env = storage();
  await send(env, 'POST', pairUrl(), blob());
  const res = await send(env, 'DELETE', pairUrl());
  assert.equal(res.status, 204);
  assert.equal(env.records.has(`pair:${PAIR_ID}`), false);
});

test('a request over 4096 bytes is refused with 413 and nothing stored', async () => {
  const env = storage();
  const big = JSON.stringify({ blob: { iv: 'aa', ct: 'x'.repeat(4100), tag: 'cc' } });
  const res = await send(env, 'POST', pairUrl(), big);
  assert.equal(res.status, 413);
  assert.equal(env.records.has(`pair:${PAIR_ID}`), false);
  const bad = await send(env, 'POST', pairUrl(), JSON.stringify({ nope: 1 }));
  assert.equal(bad.status, 400);
});

test('the eleventh pair GET from one IP in a minute is 429; blob routes are unaffected', async () => {
  const env = storage();
  for (let i = 0; i < 10; i += 1) assert.equal((await send(env, 'GET', pairUrl('c'.repeat(64)))).status, 404);
  const eleventh = await send(env, 'GET', pairUrl('c'.repeat(64)));
  assert.equal(eleventh.status, 429);
  assert.equal((await send(env, 'GET', blobUrl)).status, 404, 'blob GET still answers normally');
  assert.equal((await send(env, 'GET', pairUrl('c'.repeat(64)), null, '198.51.100.2')).status, 404, 'another IP is not limited');
});

test('a malformed pairId falls through to the plain 404', async () => {
  const env = storage();
  const res = await send(env, 'GET', pairUrl('nope'));
  assert.equal(res.status, 404);
  assert.equal(await res.text(), 'not found');
});
