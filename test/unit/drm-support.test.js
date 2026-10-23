'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createDrmSupport } = require('../../src/main/drm-support');
function fixture() {
  const app = new EventEmitter();
  const flags = [], queued = [], handlers = [];
  let ready;
  const whenReady = new Promise(resolve => { ready = resolve; });
  Object.assign(app, { whenReady: () => whenReady, getPath: () => '/fixture/profile',
    commandLine: { appendSwitch: flag => flags.push(flag) } });
  const processEvents = new EventEmitter();
  processEvents.nextTick = callback => queued.push(callback);
  const session = { defaultSession: { protocol: { handle: (scheme, fn) => handlers.push({ scheme, fn }) } } };
  const components = { WIDEVINE_CDM_ID: 'cdm', updatesEnabled: true,
    status: () => ({ cdm: { version: '4.10.1.0' } }), whenReady: () => new Promise(() => {}) };
  return { app, flags, queued, handlers, ready, session, components, processEvents,
    metadata: { blancRuntime: 'ecs' }, platform: 'darwin', env: {} };
}
test('ordinary Electron startup never registers ECS policy or touches components', async () => {
  const f = fixture();
  const support = createDrmSupport({ ...f, metadata: {} });
  assert.equal(support.enabled, false);
  assert.deepEqual(f.flags, []);
  assert.equal(f.app.listenerCount('session-created'), 0);
  assert.equal((await support.inspect()).state, 'unsupported');
});
test('ECS startup stays responsive while native component work remains pending', async () => {
  const f = fixture();
  const support = createDrmSupport(f);
  f.ready();
  await support.ready;
  assert.deepEqual(f.flags, ['disable-gpu-memory-buffer-video-frames']);
  assert.equal(f.handlers.length, 1);
  assert.equal(f.handlers[0].scheme, 'file');
  assert.equal(f.handlers[0].fn().status, 403);
  f.app.emit('session-created', f.session.defaultSession);
  assert.equal(f.handlers.length, 1, 'no duplicate protocol handlers');
  f.app.emit('will-quit');
  assert.equal(f.processEvents.listenerCount('unhandledRejection'), 0);
});
test('ECS navigation refuses raw local files in frames and redirects', () => {
  const f = fixture();
  createDrmSupport(f);
  const wc = new EventEmitter();
  f.app.emit('web-contents-created', {}, wc);
  for (const event of ['will-navigate', 'will-frame-navigate', 'will-redirect']) {
    let denied = false;
    wc.emit(event, { url: 'file:///private/data', preventDefault: () => { denied = true; } }, 'file:///private/data');
    assert.equal(denied, true);
  }
  let denied = false;
  wc.emit('will-navigate', { preventDefault: () => { denied = true; } }, 'https://example.com/');
  assert.equal(denied, false);
});
test('unrelated rejections are not swallowed and Linux cannot bypass the launcher', () => {
  const f = fixture();
  createDrmSupport(f);
  const error = new Error('unrelated');
  f.processEvents.emit('unhandledRejection', error);
  assert.throws(f.queued[0], error);
  assert.throws(() => createDrmSupport({ ...fixture(), platform: 'linux' }), /packaged launcher/);
});
test('Linux updater strips the old image environment before starting its successor', () => {
  const f = fixture();
  const calls = [];
  const updater = { spawnLog: (...args) => calls.push(args) };
  createDrmSupport({ ...f, platform: 'linux', updater,
    env: { BLANC_ECS_LAUNCHER_ROOT: '/image', BLANC_ECS_FULL_PROFILE: '/fixture/profile' } });
  updater.spawnLog('/new/renamed-image', ['--arg'], { APPDIR: '/old/image', LD_LIBRARY_PATH: '/old/image/lib', PATH: '/old/image/bin:/usr/bin', KEEP: 'yes' });
  assert.deepEqual(calls[0], ['/new/renamed-image', ['--arg'], { PATH: '/usr/bin', KEEP: 'yes' }, undefined]);
  assert.throws(() => updater.spawnLog('relative', [], {}), /absolute AppImage/);
});
