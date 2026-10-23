'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDrmRuntime } = require('../../src/main/drm-runtime');
const app = { whenReady: async () => {} };
function components(overrides = {}) {
  return { WIDEVINE_CDM_ID: 'widevine', updatesEnabled: true,
    status: () => ({ widevine: { version: '4.10', status: 'registered' } }),
    whenReady: async () => [], ...overrides };
}
test('official Electron is unsupported without any component operation', async () => {
  const runtime = createDrmRuntime({ app });
  assert.equal((await runtime.inspect()).state, 'unsupported');
  assert.equal((await runtime.prepare()).supported, false);
});
test('waits for app readiness and coalesces concurrent component preparation', async () => {
  let ready;
  let calls = 0;
  const runtime = createDrmRuntime({ app: { whenReady: () => new Promise(resolve => { ready = resolve; }) },
    components: components({ whenReady: async ids => { calls++; assert.deepEqual(ids, ['widevine']); } }) });
  const first = runtime.prepare();
  assert.equal(first, runtime.prepare());
  assert.equal(calls, 0);
  ready();
  assert.equal((await first).state, 'ready');
  assert.equal((await runtime.prepare()).playbackVerified, false);
  assert.equal(calls, 1);
});
test('disabled updates do not trigger installation', async () => {
  const runtime = createDrmRuntime({ app, components: components({ updatesEnabled: false,
    whenReady: () => assert.fail('must not install') }) });
  assert.equal((await runtime.prepare()).state, 'updates-disabled');
});
test('Linux first install requests restart; existing component does not', async () => {
  for (const version of [null, '4.10']) {
    const runtime = createDrmRuntime({ app, platform: 'linux', components: components({
      status: () => ({ widevine: { version } }) }) });
    assert.equal((await runtime.prepare()).state, version ? 'ready' : 'restart-required');
  }
});
test('timeout ignores late completion and never launches overlapping installs', async () => {
  let finish;
  let calls = 0;
  const runtime = createDrmRuntime({ app, timeoutMs: 10, components: components({
    whenReady: () => { calls++; return new Promise(resolve => { finish = resolve; }); } }) });
  assert.equal((await runtime.prepare()).state, 'timed-out');
  finish([]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await runtime.prepare()).state, 'timed-out');
  assert.equal(calls, 1);
});
test('vendor errors and status data do not leak paths or license details', async () => {
  const runtime = createDrmRuntime({ app, components: components({
    whenReady: async () => { throw new Error('/secret/license?token=private'); },
    status: () => ({ widevine: { version: '4.10', status: 'registered', path: '/secret' } }),
  }) });
  assert.equal((await runtime.prepare()).state, 'installation-failed');
  assert.equal(JSON.stringify(await runtime.inspect()).includes('/secret'), false);
});
test('status failure is sanitized', async () => {
  const runtime = createDrmRuntime({ app, components: components({ status: () => { throw Error('/private'); } }) });
  assert.equal((await runtime.inspect()).error, 'status-unavailable');
});
