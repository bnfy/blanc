'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const root = path.join(__dirname, '../..');

test('reader preload matches its contract and never exposes capabilities to source pages or subframes', () => {
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'browser-api/reader.json')));
  const script = fs.readFileSync(path.join(root, contract.preload), 'utf8');
  const run = (href, isMainFrame = true) => {
    const exposed = {}; const calls = [];
    const electron = { contextBridge: { exposeInMainWorld: (name, value) => { exposed[name] = value; } },
      ipcRenderer: { invoke: (...args) => { calls.push(args); return 'promise'; } } };
    vm.runInNewContext(script, { require: () => electron, window: { location: { href } }, process: { isMainFrame } });
    return { exposed, calls };
  };
  for (const href of ['https://example.com/', 'blanc://newtab/', 'blanc-chrome://index/', 'blanc-reader://abc/reader.js']) {
    assert.deepEqual(Object.keys(run(href).exposed), []);
  }
  assert.deepEqual(Object.keys(run('blanc-reader://abc/', false).exposed), []);
  const { exposed, calls } = run('blanc-reader://abc/');
  assert.deepEqual(Object.keys(exposed), [contract.global]);
  const api = exposed.readerAPI;
  assert.deepEqual(Object.keys(api), Object.keys(contract.members));
  for (const [name, member] of Object.entries(contract.members)) {
    assert.equal(api[name]('https://example.com/', true), 'promise');
    assert.equal(calls.at(-1)[0], member.channel);
  }
  api.openLink('https://example.com/', 'truthy');
  assert.equal(calls.at(-1)[2], null);
  for (const disposition of ['current-tab', 'background-tab', 'foreground-tab', 'new-window']) {
    api.openLink('https://example.com/', disposition);
    assert.equal(calls.at(-1)[2], disposition);
  }
});

function serviceHarness() {
  const handlers = new Map();
  const readerSession = { setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, on() {},
    webRequest: { onBeforeRequest() {} }, protocol: { handle() {} } };
  const views = [];
  const menus = [], links = [], glance = [];
  class Contents extends EventEmitter {
    constructor() { super(); this.mainFrame = {}; this.session = readerSession; this.dead = false; }
    isDestroyed() { return this.dead; }
    getURL() { return this.url; }
    loadURL(url) { this.url = url; queueMicrotask(() => this.emit('dom-ready')); return Promise.resolve(); }
    setWindowOpenHandler() {}
    close() { this.dead = true; this.emit('destroyed'); }
  }
  class View {
    constructor() { this.webContents = new Contents(); views.push(this); }
    setVisible() {}
  }
  class Store { constructor(_name, defaults) { this.data = { ...defaults }; } update(fn) { fn(this.data); } }
  const module = { exports: {} };
  const source = { isDestroyed: () => false, getURL: () => 'https://example.com/article',
    executeJavaScriptInIsolatedWorld: async () => ({ content: '<p>Article</p>', textContent: 'a'.repeat(300), images: [] }) };
  const tab = { id: 'one', profileId: 'default', navEpoch: 1, view: { webContents: source } };
  const dependencies = {
    electron: { WebContentsView: View, session: { fromPartition: () => readerSession } },
    './store': { JsonStore: Store }, './local-profile-context': { withLocalProfile: (_id, work) => work() },
    './reader-extract': { buildReaderProbe: () => '', buildReaderExtraction: () => '' },
    './context-menu': { attachContextMenu: (_wc, actions) => menus.push(actions) },
  };
  const localRequire = name => dependencies[name] || require(name.startsWith('./') ? path.join(root, 'src/main', name) : name);
  localRequire.resolve = require.resolve;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/main/reader-mode.js'), 'utf8'), {
    module, exports: module.exports, require: localRequire, __dirname: path.join(root, 'src/main'),
    setTimeout, clearTimeout, AbortController, Response, URL,
  });
  const mode = module.exports.createReaderMode({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, tab: id => id === tab.id ? tab : null,
    visible: () => true, wire() {}, changed() {}, detach() {}, broadcast() {}, focused() {}, findResult() {},
    stringsScript: () => '', t: key => key, allowImage: async () => false,
    openLink: (tab, url, disposition) => links.push({ tab, url, disposition }),
    openInGlance: (tab, url) => glance.push({ tab, url }),
  });
  return { handlers, mode, tab, views, menus, links, glance };
}

test('reader initialization and settings require the exact reader and current source generation', async () => {
  const { handlers, mode, tab, views } = serviceHarness();
  assert.equal(await mode.toggle(tab), true);
  const reader = views[0].webContents;
  const event = { sender: reader, senderFrame: reader.mainFrame };
  reader.mainFrame.url = reader.getURL();
  const init = handlers.get('reader:initialize');
  assert.equal(init(event).sourceUrl, 'https://example.com/article');
  assert.equal(init({ sender: reader, senderFrame: { url: reader.getURL() } }), null, 'subframe refused');
  const forged = { mainFrame: {}, session: reader.session, getURL: () => reader.getURL() };
  assert.equal(init({ sender: forged, senderFrame: forged.mainFrame }), null, 'matching URL does not confer ownership');
  reader.url += '#article-section'; reader.mainFrame.url = reader.url;
  assert.ok(init(event), 'local fragment navigation retains the narrow reader bridge');
  tab.navEpoch++;
  assert.equal(init(event), null, 'stale source refused');
  assert.equal(handlers.get('reader:appearance')(event, { theme: 'dark' }), null);
  mode.invalidate(tab);
  assert.equal(reader.isDestroyed(), true);
  assert.equal(mode.active(tab), false);
});


test('reader navigation validates dispositions and wires every offered link action', async () => {
  const { handlers, mode, tab, views, menus, links, glance } = serviceHarness();
  assert.equal(await mode.toggle(tab), true);
  const reader = views[0].webContents;
  reader.mainFrame.url = reader.getURL();
  const event = { sender: reader, senderFrame: reader.mainFrame };
  const navigate = handlers.get('reader:open-link');
  for (const invalid of [true, false, null, {}, 'forged']) navigate(event, 'https://example.com/next', invalid);
  navigate(event, 'file:///tmp/private', 'foreground-tab');
  assert.equal(links.length, 0);
  for (const disposition of ['current-tab', 'background-tab', 'foreground-tab', 'new-window']) {
    navigate(event, 'https://example.com/next', disposition);
    assert.equal(links.at(-1).disposition, disposition);
    assert.equal(links.at(-1).tab, tab);
  }
  menus[0].openTab('https://example.com/search');
  assert.equal(links.at(-1).disposition, 'foreground-tab');
  const { linkMenuItems } = require('../../src/main/glance-open-link');
  const items = linkMenuItems({ linkURL: 'https://example.com/glance' }, { ...menus[0], copyLink() {} }, key => key);
  assert.doesNotThrow(() => items.find(item => item.label === 'contextMenu.openLinkInGlance').click());
  assert.deepEqual(glance, [{ tab, url: 'https://example.com/glance' }]);
  mode.exit(tab);
});
