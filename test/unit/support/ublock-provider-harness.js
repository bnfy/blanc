'use strict';
// Fake-Electron harness for src/main/ublock-provider.js: the real verified
// package install, with fake views, extensions and bridge IPC. Any async step
// can be gated or made to never settle, and tests answer bridge decisions.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(root, 'src/main/ublock-provider.js'), 'utf8');
const realPackage = require('../../../src/main/ublock-package');

function createProviderHarness(t, { install = realPackage.installVerifiedPackageAsync, gates = {}, stall = {}, hooks = {}, recovery } = {}) {
  const userData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubo-provider-harness-')));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const session = {};
  const appListeners = new Map();
  const created = { views: [], extensions: [], removed: [], closed: [] };
  const sent = [];
  const states = [];
  const releases = new Map();
  let ipc; let nextId = 1; let readyNode = false;
  const never = () => new Promise(() => {});
  // Resolves when the test releases a gated step; never settles for 'never'.
  const pass = step => {
    if (stall[step] === 'never') return never();
    if (!gates[step]) return Promise.resolve();
    return new Promise(resolve => releases.set(step, resolve));
  };
  function contents(type) {
    const listeners = {};
    const wc = {
      id: nextId++, session, mainFrame: { framesInSubtree: [] }, url: '', listeners, destroyed: false,
      getType: () => type, getURL: () => wc.url, getTitle: () => '', isLoading: () => false,
      isDestroyed: () => wc.destroyed, getOSProcessId: () => 7,
      on(name, listener) { listeners[name] = listener; return wc; },
      once(name, listener) { listeners[name] = listener; return wc; },
      removeListener() { return wc; },
      send(_channel, message) { sent.push({ wc, message }); },
      close() { wc.destroyed = true; created.closed.push(wc.id); },
      setWindowOpenHandler() {}, setBackgroundThrottling() {},
      async loadURL(url) {
        wc.url = url;
        const bridge = url.endsWith('/blanc-bridge.html');
        const css = url.endsWith('/bridge.html');
        if (bridge) await pass('bridgeLoad');
        if (css) await pass('cssBridgeLoad');
        if (css) setImmediate(() => ipc({ sender: wc, senderFrame: wc.mainFrame }, { kind: 'css-ready' }));
        if (bridge) pass('ready').then(() => setImmediate(() => ipc({ sender: wc, senderFrame: wc.mainFrame }, { kind: 'ready', node: readyNode })));
      },
    };
    return wc;
  }
  const background = contents('backgroundPage');
  session.extensions = {
    on() {}, removeListener() {},
    removeExtension(id) { created.removed.push(id); },
    async loadExtension(directory) {
      const id = path.basename(directory) === 'css-host' ? 'csshost' : 'ublockorigin';
      await pass(id === 'csshost' ? 'cssLoad' : 'extensionLoad');
      created.extensions.push(id);
      if (id === 'ublockorigin') {
        background.url = `chrome-extension://${id}/background.html`;
        appListeners.get('web-contents-created')?.({}, background);
        pass('backgroundReady').then(() => setImmediate(() => background.listeners['dom-ready']?.()));
      }
      return { id, path: directory };
    },
  };
  const electron = {
    app: {
      isPackaged: false, getPath: () => userData, getAppPath: () => root, getAppMetrics: () => [{ pid: 7, sandboxed: true }],
      on: (name, listener) => appListeners.set(name, listener), removeListener: name => appListeners.delete(name),
    },
    WebContentsView: class { constructor() { this.webContents = contents('webContents'); created.views.push(this); } },
    ipcMain: { on: (_channel, listener) => { ipc = listener; } },
    webContents: { fromId: () => null, getAllWebContents: () => [background] },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, __dirname: path.join(root, 'src/main'), Buffer, URL, console, performance,
    setTimeout, clearTimeout, setImmediate, process: { platform: 'darwin', env: {} },
    require: name => {
      if (name === 'electron') return electron;
      if (name === './ublock-package') return { ...realPackage, installVerifiedPackageAsync: async options => { await pass('install'); return install(options); } };
      return require(name.startsWith('./') ? path.join(root, 'src/main', name) : name);
    },
  });
  const provider = module.exports.createUblockProvider({
    session, profileId: 'personal',
    hooks: { listTabs: () => [], listWindows: () => [], liveContents: () => null, ...hooks },
    onStateChange: state => states.push(state),
    ...(recovery ? { recovery } : {}),
  });
  const helper = () => created.views.map(view => view.webContents)
    .filter(wc => wc.url.endsWith('/blanc-bridge.html') && !wc.destroyed).at(-1);
  return {
    provider, userData, created, sent, background, states, stall,
    release: step => { releases.get(step)?.(); releases.delete(step); },
    requests: () => sent.filter(item => item.message.kind === 'request'),
    answer(id, value = {}) { const wc = helper(); ipc({ sender: wc, senderFrame: wc.mainFrame }, { kind: 'decision', id, value }); },
    crashBackground() { background.listeners['render-process-gone']?.(); },
    setReadyNode(value) { readyNode = value; },
  };
}

const settle = (promise, ms = 300) => Promise.race([
  promise.then(() => 'resolved', () => 'rejected'),
  new Promise(resolve => setTimeout(() => resolve('pending'), ms)),
]);
// A ceiling, not a delay: each restart reinstalls the real verified package,
// which takes seconds on a loaded hosted Intel runner.
const until = async (predicate, ms = 60000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error('condition not reached');
};

// Values built inside the vm sandbox have another realm's prototypes; copy
// them before structural comparison.
const plain = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

module.exports = { createProviderHarness, settle, until, plain };
