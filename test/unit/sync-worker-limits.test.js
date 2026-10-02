const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { encrypt, decrypt } = require('../../src/main/sync-crypto');
const workerPromise = import(`data:text/javascript;base64,${fs.readFileSync(require.resolve('../../cloudflare/sync-worker/src/index.js')).toString('base64')}`).then((m) => m.default);
const account = 'a'.repeat(64);
const key = `blob:${account}:bookmarks`;
const url = `https://sync.example.test/v1/blob/${account}/bookmarks`;
const TOTAL = 513 * 1024;
const BLOB = 512 * 1024;

function storage() {
  const records = new Map();
  const writes = [];
  return { records, writes, SYNC: {
    get: async (key, options) => { const value = records.get(key) ?? null; return value && options?.type === 'json' ? JSON.parse(value) : value; },
    put: async (key, value) => { writes.push(key); records.set(key, value); },
    delete: async (key) => records.delete(key),
  } };
}
async function send(env, body, headers = {}) {
  return (await workerPromise).fetch(new Request(url, { method: 'PUT', body, headers, duplex: 'half' }), env);
}
const blobBody = (size) => JSON.stringify({ blob: { ct: 'x'.repeat(size - 9) } });

test('serialized blob UTF-8 byte limit allows the boundary and refuses one more byte', async () => {
  assert.equal((await send(storage(), blobBody(BLOB))).status, 200);
  const env = storage();
  assert.equal((await send(env, blobBody(BLOB + 1))).status, 413);
  assert.equal(env.writes.length, 0);
  const unicode = JSON.stringify({ blob: { ct: 'é'.repeat(262141) } });
  assert.ok(unicode.length < BLOB);
  assert.ok(Buffer.byteLength(unicode) <= TOTAL, 'Unicode overflow reaches the blob check within the request cap');
  assert.equal((await send(env, unicode)).status, 413);
  assert.equal(env.records.has(key), false);
});

test('whole request limit includes ignored fields and does not trust missing or misleading lengths', async () => {
  const prefix = JSON.stringify({ blob: {}, ignored: '' });
  const atBoundary = prefix.replace('"ignored":""', `"ignored":"${'x'.repeat(TOTAL - prefix.length)}"`);
  assert.equal(Buffer.byteLength(atBoundary), TOTAL);
  assert.equal((await send(storage(), atBoundary)).status, 200);
  for (const headers of [{}, { 'Content-Length': '1' }, { 'Content-Length': 'invalid' }]) {
    const env = storage();
    assert.equal((await send(env, `${atBoundary} `, headers)).status, 413);
    assert.equal(env.writes.length, 0);
  }
});

test('declared oversize cancels before reading; streamed oversize cancels without storage', async () => {
  for (const declared of [true, false]) {
    let cancelled = false;
    let pulls = 0;
    const stream = new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(64 * 1024)); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const env = storage();
    const response = await send(env, stream, declared ? { 'Content-Length': String(TOTAL + 1) } : {});
    assert.equal(response.status, 413);
    assert.equal(cancelled, true);
    assert.equal(pulls, declared ? 0 : 9);
    assert.equal(env.records.has(key), false);
  }
});

test('chunked Unicode JSON decodes across byte boundaries and malformed JSON never stores', async () => {
  const bytes = Buffer.from(JSON.stringify({ blob: { ct: 'é' }, ifVersion: null }));
  let offset = 0;
  const stream = new ReadableStream({ pull(controller) {
    if (offset === bytes.length) controller.close();
    else controller.enqueue(bytes.subarray(offset, ++offset));
  } });
  assert.equal((await send(storage(), stream)).status, 200);
  const env = storage();
  assert.equal((await send(env, '{bad')).status, 400);
  assert.equal(env.writes.length, 0);
});

test('v1 encrypted records, version responses, conflicts and locator-only deletion stay compatible', async () => {
  const worker = await workerPromise;
  const env = storage();
  const secret = crypto.randomBytes(32);
  const blob = encrypt(secret, '{"legacy":"record"}');
  const response = await send(env, JSON.stringify({ blob, ifVersion: null }));
  const { version } = await response.json();
  assert.equal(response.status, 200);
  const read = await worker.fetch(new Request(url), env);
  const record = await read.json();
  assert.equal(record.version, version);
  assert.equal(decrypt(secret, record.blob), '{"legacy":"record"}');
  assert.equal((await send(env, JSON.stringify({ blob, ifVersion: null }))).status, 409);
  assert.equal((await send(env, JSON.stringify({ blob, ifVersion: version }))).status, 200);
  for (const store of ['settings', 'session', 'icons']) env.records.set(`blob:${account}:${store}`, '{}');
  assert.equal((await worker.fetch(new Request(`https://sync.example.test/v1/blob/${account}`, { method: 'DELETE' }), env)).status, 204);
  assert.equal([...env.records.keys()].some((key) => key.startsWith('blob:')), false, 'R3 remains: the locator alone authorizes deletion');
});

test('R5 residual concurrency: same-version writers both succeed and a pending write can survive deletion', async () => {
  const env = storage();
  const results = await Promise.all([send(env, '{"blob":{"ct":"one"}}'), send(env, '{"blob":{"ct":"two"}}')]);
  assert.deepEqual(results.map((r) => r.status), [200, 200]);
  assert.equal(env.records.size, 1);
  let finish;
  const put = env.SYNC.put;
  env.SYNC.put = async (key, value) => { await new Promise((resolve) => { finish = resolve; }); await put(key, value); };
  const version = JSON.parse(env.records.get(key)).version;
  const pending = send(env, JSON.stringify({ blob: {}, ifVersion: version }));
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  await (await workerPromise).fetch(new Request(`https://sync.example.test/v1/blob/${account}`, { method: 'DELETE' }), env);
  finish();
  assert.equal((await pending).status, 200);
  assert.equal(env.records.has(key), true, 'v1 has no atomic deletion fence');
});
