'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDrmRuntime } = require('../../scripts/drm-runtime');
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
test('Linux asynchronous registration uses the required component result, not the early snapshot', async () => {
  for (const [status, version, expected] of [
    ['new', '4.10.3112.0', 'ready'], ['updated', '4.10.3112.0', 'restart-required'],
    ['new', null, 'restart-required'], ['new', '/untrusted/path', 'restart-required'],
    ['unknown', '4.10.3112.0', 'restart-required'],
  ]) {
    const runtime = createDrmRuntime({ app, platform: 'linux', components: components({
      status: () => ({}), whenReady: async () => [{ id: 'other', status: 'new', version: '1.0' }, { id: 'widevine', status, version }],
    }) });
    assert.equal((await runtime.prepare()).state, expected);
    const inspected = await runtime.inspect();
    assert.equal(inspected.registrationStatus, null);
    assert.equal(inspected.completionStatus, status);
  }
});
test('Linux CDM updates require restart even when a previous version is installed', async () => {
  for (const platform of ['linux', 'darwin']) {
    const runtime = createDrmRuntime({ app, platform, components: components({
      status: () => ({ widevine: { status: 'new', version: '4.10.10.0' } }),
      whenReady: async () => [{ id: 'widevine', status: 'updated', version: '4.10.11.0' }],
    }) });
    assert.equal((await runtime.prepare()).state, platform === 'linux' ? 'restart-required' : 'ready');
  }
});
test('Linux notices a later version change without starting another component installation', async () => {
  let version = '4.10.10.0', installs = 0;
  const runtime = createDrmRuntime({ app, platform: 'linux', components: components({
    status: () => ({ widevine: { status: 'new', version } }),
    whenReady: async () => { installs++; return [{ id: 'widevine', status: 'new', version }]; },
  }) });
  assert.equal((await runtime.prepare()).state, 'ready');
  assert.equal((await runtime.inspect()).state, 'ready');
  for (version of [undefined, '', 'not-a-version']) {
    assert.equal((await runtime.inspect()).state, 'ready', 'transient or invalid status is not a CDM replacement');
  }
  version = '4.10.11.0';
  assert.equal((await runtime.inspect()).state, 'restart-required');
  assert.equal((await runtime.prepare()).state, 'restart-required');
  assert.equal(installs, 1);
});
test('Linux registration cannot claim readiness for a different or missing preloaded CDM', async () => {
  for (const preloaded of [null, '4.10.10.0', '4.10.11.0']) {
    const runtime = createDrmRuntime({ app, platform: 'linux', linuxPreloadedVersion: preloaded,
      components: components({ status: () => ({ widevine: { version: '4.10.11.0' } }),
        whenReady: async () => [{ id: 'widevine', status: 'new', version: '4.10.11.0' }] }) });
    assert.equal((await runtime.prepare()).state, preloaded === '4.10.11.0' ? 'ready' : 'restart-required');
  }
});
test('timeout ignores late completion and never launches overlapping installs', async () => {
  let finish;
  let calls = 0;
  const runtime = createDrmRuntime({ app, timeoutMs: 10, components: components({
    whenReady: () => { calls++; return new Promise(resolve => { finish = resolve; }); } }) });
  assert.equal((await runtime.prepare()).state, 'timed-out');
  finish([{ id: 'widevine', status: 'updated', version: '4.10.99.0' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await runtime.prepare()).state, 'timed-out');
  const status = await runtime.inspect();
  assert.equal(status.registrationStatus, null);
  assert.equal(status.completionStatus, null);
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
