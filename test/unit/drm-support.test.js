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
test('only ECS Linux relaunch removes old mount paths and preserves profile identity', () => {
  const f = fixture();
  const env = { BLANC_ECS_LAUNCHER_ROOT: '/old/image', BLANC_ECS_FULL_PROFILE: '/fixture/profile',
    APPIMAGE: '/path/Blanc', APPDIR: '/old/image', LD_LIBRARY_PATH: '/old/image/lib', PATH: '/old/image/bin:/usr/bin' };
  const support = createDrmSupport({ ...f, platform: 'linux', env, updater: { spawnLog() {} } });
  assert.equal(env.APPDIR, '/old/image');
  support.beforeRelaunch();
  assert.equal(env.APPDIR, undefined);
  assert.equal(env.LD_LIBRARY_PATH, undefined);
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.BLANC_ECS_FULL_PROFILE, '/fixture/profile');
});
// #1634 follow-up: one refused file never stops the rest, and main learns
// which were refused and why.
test('ECS local files open one by one and report each refusal', async () => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'drm-local-'));
  try {
    const good = path.join(dir, 'good.html');
    await fs.writeFile(good, '<p>ok</p>');
    const f = fixture();
    f.app.getName = () => 'Blanc';
    const ses = new EventEmitter();
    Object.assign(ses, { protocol: { handle() {}, unhandle() {} }, webRequest: { onBeforeRequest() {} },
      setPermissionRequestHandler() {}, setPermissionCheckHandler() {} });
    f.session.fromPartition = () => ses;
    const opened = [];
    class BrowserWindow extends EventEmitter {
      constructor(options) { super(); opened.push(options.title); this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler = () => {}; }
      async loadURL() {}
    }
    const support = createDrmSupport({ ...f, BrowserWindow });
    f.ready();
    const missing = path.join(dir, 'missing.html');
    const refused = await support.openLocalFiles(['relative.html', good, missing]);
    assert.deepEqual(opened, ['Blanc'], 'the good file still opens after a refusal');
    assert.deepEqual(refused.map(({ file }) => file), ['relative.html', missing]);
    assert.deepEqual(refused.map(({ error }) => error.localHtmlRefusal), ['unreadable', 'unreadable']);
    assert.deepEqual(await support.openLocalFiles([good]), []);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
