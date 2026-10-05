'use strict';
// Startup ordering with fake Electron views and a real verified package: the
// provider must await the install, keep web traffic held meanwhile, and
// report how long each startup stage took.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/main/ublock-provider.js'), 'utf8');
const realPackage = require('../../src/main/ublock-package');
const STAGES = ['cssHostLoad', 'cssHostReady', 'install', 'loadExtension', 'background', 'bridge', 'ready'];

function fixture(t, install) {
  const userData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubo-provider-startup-')));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const session = {};
  const appListeners = new Map();
  let ipc;
  let nextId = 1;
  function contents(type) {
    const listeners = {};
    const wc = {
      id: nextId++, session, mainFrame: {}, url: '', listeners,
      getType: () => type, getURL: () => wc.url, isDestroyed: () => false, getOSProcessId: () => 7,
      on(name, listener) { listeners[name] = listener; return wc; }, once(name, listener) { listeners[name] = listener; return wc; },
      send() {}, close() {}, setWindowOpenHandler() {}, setBackgroundThrottling() {},
      async loadURL(url) {
        wc.url = url;
        // Each bridge page reports readiness once its document has loaded.
        const kind = url.endsWith('/blanc-bridge.html') ? 'ready' : url.endsWith('/bridge.html') ? 'css-ready' : null;
        if (kind) setImmediate(() => ipc({ sender: wc, senderFrame: wc.mainFrame }, { kind, node: false }));
      },
    };
    return wc;
  }
  const background = contents('backgroundPage');
  session.extensions = {
    on() {}, removeListener() {}, removeExtension() {},
    async loadExtension(directory) {
      const id = path.basename(directory) === 'css-host' ? 'csshost' : 'ublockorigin';
      if (id === 'ublockorigin') {
        background.url = `chrome-extension://${id}/background.html`;
        appListeners.get('web-contents-created')?.({}, background);
        setImmediate(() => background.listeners['dom-ready']());
      }
      return { id, path: directory };
    },
  };
  const electron = {
    app: {
      getPath: () => userData, getAppPath: () => root, getAppMetrics: () => [{ pid: 7, sandboxed: true }],
      on: (name, listener) => appListeners.set(name, listener), removeListener: name => appListeners.delete(name),
    },
    WebContentsView: class { constructor() { this.webContents = contents('webContents'); } },
    ipcMain: { on: (_channel, listener) => { ipc = listener; } },
    webContents: { fromId: () => null, getAllWebContents: () => [background] },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, __dirname: path.join(root, 'src/main'), Buffer, URL, console, performance,
    setTimeout, clearTimeout, setImmediate, process: { platform: 'darwin' },
    require: name => {
      if (name === 'electron') return electron;
      if (name === './ublock-package') return { ...realPackage, installVerifiedPackageAsync: install };
      return require(name.startsWith('./') ? path.join(root, 'src/main', name) : name);
    },
  });
  const provider = module.exports.createUblockProvider({ session, profileId: 'personal', hooks: { listTabs: () => [], listWindows: () => [], liveContents: () => null } });
  return { provider, userData };
}

test('startup awaits the verified install, holds web traffic meanwhile and times every stage', async t => {
  let reached, release;
  const atInstall = new Promise(resolve => { reached = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const { provider, userData } = fixture(t, async options => {
    reached();
    await gate;
    return realPackage.installVerifiedPackageAsync(options);
  });
  const started = provider.initialize();
  await atInstall;
  const during = provider.status();
  assert.equal(during.phase, 'initializing');
  assert.equal(during.stage, 'install');
  assert.deepEqual(Object.keys(during.timings), ['cssHostLoad', 'cssHostReady']);
  assert.equal((await provider.decide('onBeforeRequest', { id: 1, url: 'https://example.org/', resourceType: 'mainFrame' })).cancel, true,
    'web traffic stays held while the install is pending');
  release();
  const ready = await started;
  assert.equal(ready.phase, 'ready');
  assert.equal(ready.stage, null);
  assert.deepEqual(Object.keys(ready.timings), STAGES);
  for (const name of STAGES) assert(Number.isFinite(ready.timings[name]) && ready.timings[name] >= 0, name);
  assert(fs.existsSync(path.join(userData, 'managed-ublock', 'personal', 'extension', 'manifest.json')));
});

test('a failed verified install fails closed with the unchanged error and names its stage', async t => {
  const { provider } = fixture(t, async () => { throw new Error('ubo-package-integrity'); });
  await assert.rejects(provider.initialize());
  const failed = provider.status();
  assert.equal(failed.phase, 'failed');
  assert.equal(failed.error, 'ubo-initialization-failed');
  assert.equal(failed.stage, 'install');
  assert.deepEqual(Object.keys(failed.timings), ['cssHostLoad', 'cssHostReady', 'install']);
  assert.equal((await provider.decide('onBeforeRequest', { id: 2, url: 'https://example.org/', resourceType: 'mainFrame' })).cancel, true);
});
