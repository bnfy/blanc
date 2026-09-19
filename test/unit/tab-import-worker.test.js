'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decryptTabHandoffEnvelope } = require('../../src/main/tab-import-handoff');

const worker = import('../../cloudflare/tab-import-worker/src/index.js');
const model = import('../../cloudflare/tab-import-worker/src/model.js');

function fakeState() {
  const data = new Map();
  let alarm = null;
  let tail = Promise.resolve();
  const storage = {
    get: (key) => data.get(key),
    put: (key, value) => { data.set(key, value); },
    delete: (key) => { data.delete(key); },
    deleteAll: () => { data.clear(); },
    transaction: (fn) => {
      const run = tail.then(() => fn(storage));
      tail = run.catch(() => {});
      return run;
    },
    setAlarm: (value) => { alarm = value; },
    deleteAlarm: () => { alarm = null; },
  };
  return { storage, data, get alarm() { return alarm; } };
}

test('MCP tool advertises the exact handoff schema and safety annotations', async () => {
  const { CREATE_TAB_HANDOFF_TOOL, handleMcpRpc } = await worker;
  assert.deepEqual(CREATE_TAB_HANDOFF_TOOL.inputSchema.properties.sourceBrowser.enum,
    ['chrome', 'edge', 'brave', 'opera', 'vivaldi']);
  assert.equal(CREATE_TAB_HANDOFF_TOOL.inputSchema.properties.tabs.maxItems, 100);
  assert.deepEqual(CREATE_TAB_HANDOFF_TOOL.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  });
  const listed = await handleMcpRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {});
  assert.equal(listed.result.tools[0].name, 'create_tab_handoff');
});

test('worker encryption is compatible with Blanc desktop decryption', async () => {
  const { encryptHandoff, sanitizeHandoffInput } = await model;
  const clean = sanitizeHandoffInput({
    v: 1,
    sourceBrowser: 'safari',
    tabs: [{ url: 'https://example.test/path#fragment', title: 'Example', active: true }],
  });
  assert.equal(clean.ok, true);
  const encrypted = await encryptHandoff(clean.value);
  assert.deepEqual(
    await decryptTabHandoffEnvelope(encrypted.envelope, encrypted.key, encrypted.id),
    clean.value,
  );
  assert.doesNotMatch(JSON.stringify(encrypted.envelope), /example\.test|Example/);
});

test('Durable Object permits one stage and one atomic claim', async () => {
  const { TabHandoff } = await worker;
  const { encryptHandoff } = await model;
  const encrypted = await encryptHandoff({
    v: 1, sourceBrowser: 'firefox', tabs: [{ url: 'https://a.test/', title: 'A', active: true }],
  });
  const state = fakeState();
  const object = new TabHandoff(state);
  const stage = () => object.fetch(new Request('https://handoff.internal/stage', {
    method: 'POST',
    body: JSON.stringify({ envelope: encrypted.envelope }),
  }));
  assert.equal((await stage()).status, 201);
  assert.equal((await stage()).status, 409);
  const claim = () => object.fetch(new Request('https://handoff.internal/claim', { method: 'POST' }));
  const first = await claim();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), encrypted.envelope);
  assert.equal((await claim()).status, 404);
  assert.equal((await stage()).status, 409);
  assert.deepEqual(state.data.get('handoff'), { expiresAt: encrypted.envelope.expiresAt });
  assert.equal(state.alarm, encrypted.envelope.expiresAt);
});

test('concurrent claims yield the envelope exactly once', async () => {
  const { TabHandoff } = await worker;
  const { encryptHandoff } = await model;
  const encrypted = await encryptHandoff({
    v: 1, sourceBrowser: 'safari', tabs: [{ url: 'https://a.test/', title: 'A', active: true }],
  });
  const object = new TabHandoff(fakeState());
  await object.fetch(new Request('https://handoff.internal/stage', {
    method: 'POST',
    body: JSON.stringify({ envelope: encrypted.envelope }),
  }));
  const results = await Promise.all([
    object.fetch(new Request('https://handoff.internal/claim', { method: 'POST' })),
    object.fetch(new Request('https://handoff.internal/claim', { method: 'POST' })),
  ]);
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 404]);
});

test('expired handoffs are deleted and indistinguishable from replay', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { TabHandoff } = await worker;
  const { encryptHandoff } = await model;
  const encrypted = await encryptHandoff({
    v: 1, sourceBrowser: 'firefox', tabs: [{ url: 'https://a.test/', title: 'A', active: true }],
  });
  const state = fakeState();
  const object = new TabHandoff(state);
  await object.fetch(new Request('https://handoff.internal/stage', {
    method: 'POST',
    body: JSON.stringify({ envelope: encrypted.envelope }),
  }));
  t.mock.timers.tick(600_001);
  const claim = () => object.fetch(new Request('https://handoff.internal/claim', { method: 'POST' }));
  assert.equal((await claim()).status, 404);
  assert.equal(state.data.has('handoff'), false);
  assert.equal((await claim()).status, 404);
});

test('MCP validation rejects unsupported browsers, ambiguity, and oversized windows', async () => {
  const { sanitizeHandoffInput, MAX_TABS } = await model;
  assert.equal(sanitizeHandoffInput({ v: 1, sourceBrowser: 'safari', tabs: [{ url: 'https://a.test/' }] }, { chatgptOnly: true }).error, 'invalid-handoff');
  assert.equal(sanitizeHandoffInput({
    v: 1, sourceBrowser: 'chrome', tabs: [{ url: 'https://a.test/', active: true }, { url: 'https://b.test/', active: true }],
  }, { chatgptOnly: true }).error, 'multiple-active-tabs');
  assert.equal(sanitizeHandoffInput({
    v: 1, sourceBrowser: 'chrome', tabs: Array.from({ length: MAX_TABS + 1 }, () => ({ url: 'https://a.test/' })),
  }, { chatgptOnly: true }).error, 'too-many-tabs');
});

test('MCP tool asks for a smaller selection when the encrypted record exceeds its cap', async () => {
  const { handleMcpRpc } = await worker;
  const response = await handleMcpRpc({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'create_tab_handoff',
      arguments: {
        sourceBrowser: 'chrome',
        tabs: Array.from({ length: 100 }, (_, index) => ({
          url: `https://large.test/${'a'.repeat(2028)}`,
          title: '🟠'.repeat(200),
          active: index === 0,
        })),
      },
    },
  }, {});
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /Select fewer tabs/);
});

function namespaceFor(ObjectClass) {
  const objects = new Map();
  return {
    objects,
    idFromName: (id) => id,
    get(id) {
      if (!objects.has(id)) {
        const state = fakeState();
        objects.set(id, { state, object: new ObjectClass(state) });
      }
      return { fetch: (url, init) => objects.get(id).object.fetch(new Request(url, init)) };
    },
  };
}

async function testEnv() {
  const { TabHandoff, TabImportRateLimit } = await worker;
  return { HANDOFFS: namespaceFor(TabHandoff), RATE_LIMITS: namespaceFor(TabImportRateLimit) };
}

test('HTTP upload retains authenticated expiry; cleanup cannot revive an old link', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 2_000_000 });
  const { default: handler } = await worker;
  const { encryptHandoff } = await model;
  const env = await testEnv();
  const encrypted = await encryptHandoff({ v: 1, sourceBrowser: 'firefox', tabs: [{ url: 'https://a.test/' }] });
  const url = `https://tabs.blancbrowser.com/v1/handoffs/${encrypted.id}`;
  const upload = (envelope = encrypted.envelope) => handler.fetch(new Request(url, { method: 'PUT', body: JSON.stringify(envelope) }), env);
  const claim = () => handler.fetch(new Request(`${url}/claim`, { method: 'POST' }), env);
  t.mock.timers.tick(120_000);
  const staged = await upload();
  assert.equal(staged.status, 201);
  assert.equal((await staged.json()).expiresAt, new Date(encrypted.envelope.expiresAt).toISOString());
  const instance = env.HANDOFFS.objects.get(encrypted.id);
  assert.equal((await claim()).status, 200);
  assert.equal((await upload()).status, 409);
  await instance.object.alarm(); // early/retried alarm preserves the marker
  assert.deepEqual(instance.state.data.get('handoff'), { expiresAt: encrypted.envelope.expiresAt });
  t.mock.timers.tick(480_001);
  await instance.object.alarm();
  assert.equal(instance.state.data.size, 0);
  assert.equal(instance.state.alarm, null);
  assert.equal((await upload()).status, 422);
  assert.equal((await claim()).status, 404);
  // Changing the unauthenticated outer timestamp can pass relay validation,
  // but must never make the original ciphertext usable by the desktop.
  const changed = { ...encrypted.envelope, expiresAt: Date.now() + 600_000 };
  assert.equal((await upload(changed)).status, 201);
  const replay = await (await claim()).json();
  await assert.rejects(decryptTabHandoffEnvelope(replay, encrypted.key, encrypted.id), /decryption-failed/);
});

test('HTTP upload rejects old envelopes and expired or future-clock expiries', async () => {
  const { default: handler } = await worker;
  const { encryptHandoff } = await model;
  const env = await testEnv();
  const encrypted = await encryptHandoff({ v: 1, sourceBrowser: 'safari', tabs: [{ url: 'https://a.test/' }] });
  for (const [patch, expected] of [[{ v: 1 }, 400], [{ expiresAt: Date.now() - 1 }, 422], [{ expiresAt: Date.now() + 700_000 }, 422]]) {
    const result = await handler.fetch(new Request(`https://tabs.blancbrowser.com/v1/handoffs/${encrypted.id}`, {
      method: 'PUT', body: JSON.stringify({ ...encrypted.envelope, ...patch }),
    }), env);
    assert.equal(result.status, expected);
  }
});

test('concurrent staging and claims do not remove the retirement marker or alarm', async () => {
  const { TabHandoff } = await worker;
  const { encryptHandoff } = await model;
  const encrypted = await encryptHandoff({ v: 1, sourceBrowser: 'safari', tabs: [{ url: 'https://a.test/' }] });
  const state = fakeState();
  const object = new TabHandoff(state);
  const stage = () => object.fetch(new Request('https://handoff.internal/stage', { method: 'POST', body: JSON.stringify({ envelope: encrypted.envelope }) }));
  const claim = () => object.fetch(new Request('https://handoff.internal/claim', { method: 'POST' }));
  assert.equal((await stage()).status, 201);
  const results = await Promise.all([claim(), stage(), claim()]);
  assert.deepEqual(results.map((result) => result.status), [200, 409, 404]);
  assert.equal(state.alarm, encrypted.envelope.expiresAt);
  assert.deepEqual(state.data.get('handoff'), { expiresAt: encrypted.envelope.expiresAt });
});

function streamingRequest(url, { chunks = [new Uint8Array(360_000)], headers = {} } = {}) {
  let reads = 0;
  let canceled = false;
  const body = new ReadableStream({
    pull(controller) {
      reads += 1;
      if (chunks.length) controller.enqueue(chunks.shift());
      else controller.close();
    },
    cancel() { canceled = true; },
  }, { highWaterMark: 0 });
  return {
    request: new Request(url, { method: url.endsWith('/mcp') ? 'POST' : 'PUT', body, headers, duplex: 'half' }),
    get reads() { return reads; },
    get canceled() { return canceled; },
  };
}

for (const path of ['/mcp', '/v1/handoffs/AAAAAAAAAAAAAAAAAAAAAA']) {
  test(`${path} charges rejected streamed bytes and stops at the cap`, async (t) => {
    // These assertions concern one minute bucket. Real time can cross its
    // boundary between uploads and legitimately reset the production quota.
    t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const { default: handler } = await worker;
    const env = await testEnv();
    for (let index = 0; index < 12; index += 1) {
      const stream = streamingRequest(`https://tabs.blancbrowser.com${path}`);
      const result = await handler.fetch(stream.request, env);
      assert.equal(result.status, index === 11 ? 429 : 413);
      assert.equal(stream.canceled, true);
      assert.equal(stream.reads, 1);
    }
    const usage = [...env.RATE_LIMITS.objects.values()][0].state.data.get('usage');
    assert.equal(usage.requests, 12);
    assert.equal(usage.bytes, 12 * 360_000);
    const exhausted = streamingRequest(`https://tabs.blancbrowser.com${path}`);
    assert.equal((await handler.fetch(exhausted.request, env)).status, 429);
    assert.equal(exhausted.reads, 0);
    assert.equal(exhausted.canceled, true);
  });

  test(`${path} counts Content-Length rejection and checks admission before reading`, async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const { default: handler } = await worker;
    const env = await testEnv();
    for (let index = 0; index < 121; index += 1) {
      const stream = streamingRequest(`https://tabs.blancbrowser.com${path}`, { headers: { 'Content-Length': '999999' } });
      assert.equal((await handler.fetch(stream.request, env)).status, index === 120 ? 429 : 413);
      assert.equal(stream.reads, 0);
      assert.equal(stream.canceled, true);
    }
  });

  test(`${path} accounts chunked bodies without counting chunks as requests`, async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const { default: handler } = await worker;
    const env = await testEnv();
    const stream = streamingRequest(`https://tabs.blancbrowser.com${path}`, {
      chunks: [new Uint8Array(200_000), new Uint8Array(200_000), new Uint8Array(100)],
    });
    assert.equal((await handler.fetch(stream.request, env)).status, 413);
    const usage = [...env.RATE_LIMITS.objects.values()][0].state.data.get('usage');
    assert.equal(usage.requests, 1);
    assert.equal(usage.bytes, 400_000);
    assert.equal(stream.reads, 2);
  });
}

test('unavailable rate storage fails closed without reading or claiming', async () => {
  const { default: handler } = await worker;
  for (const env of [{}, { RATE_LIMITS: { idFromName: (id) => id, get: () => ({ fetch: async () => new Response(null, { status: 500 }) }) } }]) {
    for (const path of ['/mcp', '/v1/handoffs/AAAAAAAAAAAAAAAAAAAAAA']) {
      const stream = streamingRequest(`https://tabs.blancbrowser.com${path}`);
      assert.equal((await handler.fetch(stream.request, env)).status, 503);
      assert.equal(stream.reads, 0);
      assert.equal(stream.canceled, true);
    }
    const claim = await handler.fetch(new Request('https://tabs.blancbrowser.com/v1/handoffs/AAAAAAAAAAAAAAAAAAAAAA/claim', { method: 'POST' }), env);
    assert.equal(claim.status, 404);
    assert.deepEqual(await claim.json(), { error: 'unavailable' });
  }
});
