// Run after npm ci --prefix cloudflare/tab-import-worker (its locked Wrangler
// supplies the local test harness). All KV state is disposable; no deployed service is used.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const runtime = process.argv[2] || require.resolve('wrangler', { paths: [path.resolve('cloudflare/tab-import-worker')] });
process.env.WRANGLER_SEND_METRICS = 'false';
const { createTestHarness } = await import(pathToFileURL(runtime));
const server = createTestHarness({ root: path.resolve('cloudflare/sync-worker'), workers: [{ configPath: './wrangler.toml' }] });
try {
  await server.listen();
  const worker = server.getWorker();
  const account = 'b'.repeat(64);
  const url = `/v1/blob/${account}/bookmarks`;
  const send = (body) => worker.fetch(url, { method: 'PUT', body, duplex: 'half' });
  const blob = { v: 1, iv: 'synthetic', ct: 'synthetic', tag: 'synthetic' };
  const first = await send(JSON.stringify({ blob, ifVersion: null }));
  assert.equal(first.status, 200);
  const { version } = await first.json();
  const get = await worker.fetch(url); assert.deepEqual(await get.json(), { version, blob });
  assert.equal((await send(JSON.stringify({ blob, ifVersion: null }))).status, 409);
  assert.equal((await send('{malformed')).status, 400);
  assert.equal((await send(JSON.stringify({ blob: { ct: 'é'.repeat(300000) } }))).status, 413);
  const oversized = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"blob":{},"extra":"'));
    for (let n = 0; n < 9; n++) controller.enqueue(new Uint8Array(64 * 1024).fill(120));
    controller.enqueue(new TextEncoder().encode('"}')); controller.close();
  } });
  assert.equal((await send(oversized)).status, 413);
  const unchanged = await worker.fetch(url); assert.deepEqual(await unchanged.json(), { version, blob });
  assert.equal((await worker.fetch(`/v1/blob/${account}`, { method: 'DELETE' })).status, 204);
  assert.equal((await worker.fetch(url)).status, 404);
  console.log('sync local Workers runtime: legacy shape, conflicts, malformed JSON, Unicode/chunked limits, unchanged blob and locator-only deletion passed');
} finally { await server.close(); }
