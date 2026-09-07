import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { encryptHandoff, HANDOFF_TTL_MS } from '../src/model.js';
import { encryptSelectedTabs } from '../../../extensions/blanc-tab-import/web-extension/handoff.mjs';
import desktop from '../../../src/main/tab-import-handoff.js';

// Run the checked-in Wrangler config, bundle, migrations, and SQLite-backed
// Durable Objects. No fake storage, deployed endpoint, account, or secrets.
process.env.WRANGLER_SEND_METRICS = 'false';
const { createTestHarness } = await import('wrangler');
const root = fileURLToPath(new URL('../', import.meta.url));
const tabs = [
  { url: 'https://example.test/path#fragment', title: 'First', active: false },
  { url: 'https://example.test/path#fragment', title: 'Duplicate', active: true },
];
const genericUnavailable = { error: 'unavailable' };

test('tab handoff works through the real local Workers runtime', { timeout: 45_000 }, async (t) => {
  const server = createTestHarness({ root, workers: [{ configPath: './wrangler.toml' }] });
  t.after(() => server.close());
  await server.listen();
  const worker = server.getWorker();
  const upload = (id, envelope) => worker.fetch(`/v1/handoffs/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope),
  });
  const claim = (id) => worker.fetch(`/v1/handoffs/${id}/claim`, { method: 'POST' });

  await t.test('both companion encryptors survive concurrent stage/claim and object eviction', async () => {
    for (const sourceBrowser of ['firefox', 'safari']) {
      const encrypted = await encryptSelectedTabs({ sourceBrowser, tabs });
      const staged = await Promise.all(Array.from({ length: 4 }, () => upload(encrypted.id, encrypted.envelope)));
      assert.deepEqual(staged.map((r) => r.status).sort(), [201, 409, 409, 409]);
      for (const response of staged) await response.arrayBuffer();
      await worker.evictDurableObject('HANDOFFS', { name: encrypted.id });
      const claimed = await Promise.all(Array.from({ length: 8 }, () => claim(encrypted.id)));
      assert.equal(claimed.filter((r) => r.status === 200).length, 1);
      for (const response of claimed) {
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        const body = await response.json();
        if (response.status === 200) {
          assert.deepEqual(body, encrypted.envelope);
          assert.deepEqual(await desktop.decryptTabHandoffEnvelope(body, encrypted.key, encrypted.id),
            { v: 1, sourceBrowser, tabs });
        } else {
          assert.equal(response.status, 404);
          assert.deepEqual(body, genericUnavailable);
        }
      }
      await worker.evictDurableObject('HANDOFFS', { name: encrypted.id });
      const replay = await upload(encrypted.id, encrypted.envelope);
      assert.equal(replay.status, 409);
      assert.deepEqual(await replay.json(), genericUnavailable);

      // A different object ID must not make the same ciphertext usable.
      const changedId = randomBytes(16).toString('base64url');
      assert.equal((await upload(changedId, encrypted.envelope)).status, 201);
      const rebound = await (await claim(changedId)).json();
      await assert.rejects(desktop.decryptTabHandoffEnvelope(rebound, encrypted.key, changedId), /decryption-failed/);
    }
  });

  await t.test('MCP HTTP result round-trips to the desktop without exposing metadata in the link', async () => {
    const response = await worker.fetch('/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: {
        name: 'create_tab_handoff', arguments: { sourceBrowser: 'chrome', tabs },
      } }),
    });
    assert.equal(response.status, 200);
    const rpc = await response.json();
    assert.equal(rpc.id, 7);
    assert.notEqual(rpc.result.isError, true);
    const output = rpc.result.structuredContent;
    assert.equal(output.acceptedCount, 2);
    assert.equal(output.skippedCount, 0);
    assert.doesNotMatch(output.launchUrl, /example\.test|First|Duplicate/);
    const fragment = new URLSearchParams(new URL(output.launchUrl).hash.slice(1));
    const id = fragment.get('id');
    const envelope = await (await claim(id)).json();
    assert.equal(output.expiresAt, new Date(envelope.expiresAt).toISOString());
    assert.deepEqual(await desktop.decryptTabHandoffEnvelope(envelope, fragment.get('key'), id),
      { v: 1, sourceBrowser: 'chrome', tabs });
    assert.deepEqual(await (await claim(id)).json(), genericUnavailable);
  });

  await t.test('legacy, oversized, and expired uploads are refused', async () => {
    const encrypted = await encryptHandoff({ v: 1, sourceBrowser: 'safari', tabs });
    assert.equal((await upload(encrypted.id, { ...encrypted.envelope, v: 1 })).status, 400);
    assert.equal((await upload(encrypted.id, { ...encrypted.envelope, expiresAt: Date.now() - 1 })).status, 422);
    assert.equal((await upload(encrypted.id, { ...encrypted.envelope, expiresAt: Date.now() + 2 * HANDOFF_TTL_MS })).status, 422);
    const large = await worker.fetch(`/v1/handoffs/${encrypted.id}`, {
      method: 'PUT', body: 'x'.repeat(400_000),
    });
    assert.equal(large.status, 413);
    assert.deepEqual(await large.json(), { error: 'too-large' });
    assert.deepEqual(await (await claim(encrypted.id)).json(), genericUnavailable);
  });

  await t.test('the real alarm removes a used marker without making its ciphertext replayable', async () => {
    const encrypted = await encryptHandoff({ v: 1, sourceBrowser: 'firefox', tabs }, {
      now: Date.now() - HANDOFF_TTL_MS + 2_000,
    });
    assert.equal((await upload(encrypted.id, encrypted.envelope)).status, 201);
    assert.equal((await claim(encrypted.id)).status, 200);
    assert.equal((await upload(encrypted.id, encrypted.envelope)).status, 409);
    // Stage does not prune records. A successful re-stage proves the actual
    // runtime alarm removed the marker; no mocked clock or direct DB deletion.
    await delay(Math.max(0, encrypted.envelope.expiresAt - Date.now()) + 50);
    assert.equal((await upload(encrypted.id, encrypted.envelope)).status, 422);
    const changedExpiry = { ...encrypted.envelope, expiresAt: Date.now() + HANDOFF_TTL_MS };
    const deadline = Date.now() + 8_000;
    let restaged;
    do {
      restaged = await upload(encrypted.id, changedExpiry);
      if (restaged.status !== 409) break;
      await restaged.arrayBuffer();
      await delay(250);
    } while (Date.now() < deadline);
    assert.equal(restaged.status, 201, 'alarm must remove the used marker after original expiry');
    await restaged.arrayBuffer();
    const replay = await (await claim(encrypted.id)).json();
    await assert.rejects(desktop.decryptTabHandoffEnvelope(replay, encrypted.key, encrypted.id), /decryption-failed/);
  });
});
