'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { readVerifiedPackage, readHostSources, adaptPackage } = require('../../src/main/ublock-package');
const root = path.resolve(__dirname, '../..');
const files = adaptPackage(readVerifiedPackage(path.join(root, 'ublock')).files, readHostSources(root));
function host({ page = false } = {}) {
  const connect = [], messages = [], calls = [], broadcast = [], sent = [];
  let portMessage, portDisconnect, disconnects = 0;
  let receive;
  let documentToken = 'current-document';
  let parentFrameId = 0;
  const runtime = { id: 'owned', getURL: name => 'chrome-extension://owned/' + name,
    onConnect: { addListener: callback => connect.push(callback) },
    onMessage: { addListener: callback => messages.push(callback) },
    sendMessage(message, callback) {
      if (message.blancHostEvent === 1) { broadcast.push(message); callback?.(); return; }
      if (message.method === 'tabs.authorizeMessaging') return Promise.resolve({webContentsId:10});
    },
  };
  const chrome = { runtime, storage: { local: {} }, webRequest: { ResourceType: {} }, tabs: {
    executeScript(id, options, callback) { assert.equal(options.code, 'self.vAPI?.sessionId;'); callback([documentToken]); },
    sendMessage() {},
    connect(id) { assert.equal(id, 10); return { name:'', postMessage:message => sent.push(message),
      disconnect() { disconnects++; portDisconnect?.(); },
      onMessage:{addListener:callback => {portMessage=callback;}}, onDisconnect:{addListener:callback => {portDisconnect=callback;}} }; },
  } };
  const self = { chrome };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/main/ublock-host-mainworld.js'), 'utf8'),
    { self, chrome, location: { pathname: page ? '/logger-ui.html' : '/background.html' }, URL, crypto: webcrypto, setTimeout, clearTimeout });
  const bridge = { name: 'blanc-host-v1', sender: { id: 'owned', url: runtime.getURL('blanc-bridge.html') },
    onDisconnect: { addListener() {} }, onMessage: { addListener: callback => { receive = callback; } },
    postMessage(message) {
      calls.push(message.method);
      if (message.kind !== 'call') return;
      let value;
      if (message.method === 'tabs.authorizeMessaging') value = { webContentsId: 10 };
      if (message.method === 'webNavigation.getFrame') value = { frameId: message.args[0].frameId, parentFrameId };
      queueMicrotask(() => receive({ kind: 'reply', id: message.id, value }));
    },
  };
  if (page) return { self, messages, sent, get disconnects() {return disconnects;},
    message: value => portMessage(value), navigate: () => { documentToken = 'new-document'; } };
  for (const callback of connect) callback(bridge);
  receive({ kind: 'mapping', entries: [{ webContentsId: 10, tabId: 1 }] });
  receive({ kind: 'enabled', value: true });
  const send = (message, sender) => new Promise(resolve => {
    assert.equal(messages[0](message, sender, resolve), true);
  });
  const content = { id: 'owned', tab: { id: 10 }, frameId: 0, url: 'https://page.test/' };
  const widget = tool => ({ ...content, frameId: 12,
    url: runtime.getURL('web_accessible_resources/' + (tool === 'picker' ? 'epicker-ui.html' : 'dom-inspector.html')) });
  const issue = (sender = content, tool = 'picker') => send({ blancTool: 1, action: 'issue', tool }, sender);
  const consume = (token, sender = widget('picker'), tool = 'picker') => send({ blancTool: 1, action: 'consume', tool, token }, sender);
  return { self, content, widget, issue, consume, calls, receive, broadcast,
    navigate: () => { documentToken = 'new-document'; }, setParent: value => { parentFrameId = value; } };
}
test('tool capabilities reject forged, sibling, stale, private/unmapped and replayed handoffs', async () => {
  const f = host();
  assert.equal(await f.issue({ ...f.content, id: 'forged' }), false);
  assert.equal(await f.issue({ ...f.content, tab: { id: 99 } }), false);
  assert.equal(await f.issue(f.widget('picker')), false);
  const token = await f.issue();
  assert.match(token, /^[a-f0-9]{32}$/);
  assert.equal(await f.consume('0'.repeat(32)), false);
  assert.equal(await f.consume(token, f.widget('inspector'), 'inspector'), false);
  assert.equal(await f.consume(token, { ...f.widget('picker'), tab: { id: 99 } }), false);
  f.setParent(7); assert.equal(await f.consume(token), false); f.setParent(0);
  assert.equal(await f.consume(token), true);
  assert.equal(await f.consume(token), false);
  const stale = await f.issue(); f.navigate(); assert.equal(await f.consume(stale), false);
  const disabled = await f.issue(); f.receive({ kind: 'enabled', value: false });
  assert.equal(await f.consume(disabled), false);
  assert.equal(await f.issue(), false);
});
test('one native capability cannot be consumed by concurrent messages', async () => {
  const f = host(), token = await f.issue();
  assert.deepEqual((await Promise.all([f.consume(token), f.consume(token)])).sort(), [false, true]);
});
test('native capability storage is bounded and a departed tab cannot hand off a port', async () => {
  const f = host();
  for (let i = 0; i < 256; i++) assert.equal(typeof await f.issue(), 'string');
  assert.equal(await f.issue(), false);
  const g = host(), token = await g.issue();
  g.receive({ kind: 'mapping', entries: [] });
  assert.equal(await g.consume(token), false);
});
test('privileged navigation rejects executable, local, internal and malformed URLs', () => {
  const f = host();
  for (const input of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///secret', 'blanc://settings/', 'chrome-extension://owned/settings.html', 'https%3A%2F%2Fexample.test', '//example.test', null, '']) {
    assert.equal(f.self.BlancUboHost.navigationURL(input), null, String(input));
  }
  assert.equal(f.self.BlancUboHost.navigationURL('https://example.test/path?q=1#x'), 'https://example.test/path?q=1#x');
  assert.equal(f.self.BlancUboHost.navigationURL('http://127.0.0.1/'), 'http://127.0.0.1/');
});
for (const tool of ['picker', 'inspector']) test(`${tool} bootstrap survives a forged first message and binds only the authenticated port`, async () => {
  const file = tool === 'picker' ? 'js/epicker-ui.js' : 'js/dom-inspector.js';
  const source = files.get(file).toString();
  const begin = source.indexOf('const blancToolBootstrap =');
  const end = source.indexOf("globalThis.addEventListener('message', blancToolBootstrap);", begin) + "globalThis.addEventListener('message', blancToolBootstrap);".length;
  assert(begin > 0 && end > begin);
  let listener, removed = 0, started = 0, attached;
  const context = { self: { BlancUboHost: { authorizeToolPort: async (_tool, ev) => ev.data.blancToolCapability === 'legitimate' } },
    onPickerMessage() {}, contentInspectorChannel() {}, shutdown() {}, quitPicker() {},
    startPicker: () => started++, addEventListener: (_name, callback) => { listener = callback; },
    removeEventListener: () => removed++,
  };
  vm.runInNewContext('let pickerContentPort; let inspectorContentPort;\n' + source.slice(begin, end), context);
  const event = token => ({ data: { what: tool === 'picker' ? 'epickerStart' : 'startInspector', blancToolCapability: token },
    ports: [{ postMessage: value => { attached = value.what; }, close() {} }] });
  await listener(event('forged')); assert.equal(removed, 0); assert.equal(attached, undefined);
  await listener(event('legitimate')); assert.equal(removed, 1); assert.equal(attached, tool === 'picker' ? 'start' : 'startInspector');
  if (tool === 'picker') assert.equal(started, 1);
});
test('diff fetch targets accept only HTTP(S), including after relative resolution', () => {
  const source = files.get('js/diff-updater.js').toString();
  const begin = source.indexOf('const resolveURL ='); const end = source.indexOf('\n};', begin) + 3;
  const context = { URL }; vm.runInNewContext(source.slice(begin, end) + '\nthis.resolveURL = resolveURL;', context);
  assert.equal(context.resolveURL('../patch.diff', 'https://lists.test/assets/main.txt').href, 'https://lists.test/patch.diff');
  for (const target of ['file:///secret', 'data:text/plain,patch', 'chrome-extension://owned/x', 'javascript:alert(1)']) assert.equal(context.resolveURL(target, 'https://lists.test/'), undefined);
});
test('reverse lookup treats __proto__ as a literal filter key when structured-cloned', () => {
  const source = files.get('js/reverselookup-worker.js').toString();
  const begin = source.indexOf('    const response = Object.create(null);');
  const end = source.indexOf('\n};', begin);
  assert(begin > 0 && end > begin);
  let sent;
  vm.runInNewContext(source.slice(begin, end), { details: { rawFilter: '__proto__', id: 1 }, lists: ['matching-list'], self: { postMessage: value => { sent = structuredClone(value); } } });
  assert(Object.hasOwn(sent.response, '__proto__'));
  assert.deepEqual(sent.response.__proto__, ['matching-list']);
  assert.equal(Object.getPrototypeOf(sent.response), Object.prototype);
});

const settle = () => new Promise(resolve => setImmediate(resolve));
test('inspector ports preserve message order and close on a replaced document', async () => {
  const f = host({page:true}), received = [];
  const port = f.self.chrome.tabs.connect(1, {frameId:0});
  let closed = 0;
  port.onDisconnect.addListener(() => closed++);
  port.onMessage.addListener(message => received.push(message.sequence));
  port.postMessage({sequence:1}); port.postMessage({sequence:2});
  await settle(); assert.deepEqual(f.sent.map(message => message.sequence), [1,2]);
  f.message({sequence:3}); f.message({sequence:4});
  await settle(); assert.deepEqual(received, [3,4]);
  f.navigate(); f.message({sequence:5});
  await settle(); assert.deepEqual(received, [3,4]);
  assert.equal(closed, 1); assert.equal(f.disconnects, 1);
  assert.throws(() => port.postMessage({sequence:6}), /disconnected/);
});
test('inspector ports bound queued messages and reject oversized input', async () => {
  const f = host({page:true}), port = f.self.chrome.tabs.connect(1);
  let closed = 0; port.onDisconnect.addListener(() => closed++);
  for (let sequence = 0; sequence < 65; sequence++) port.postMessage({sequence});
  await settle(); assert.equal(closed, 1); assert.equal(f.sent.length, 0);
  const g = host({page:true}), other = g.self.chrome.tabs.connect(1);
  await settle(); g.message({data:'x'.repeat(1024*1024)});
  await settle(); assert.equal(g.disconnects, 1);
  other.disconnect(); assert.equal(g.disconnects, 1);
});
test('navigation events reach only extension pages from their own native background sender', () => {
  const f = host(); f.receive({kind:'event',name:'webNavigation.onDOMContentLoaded',args:[{tabId:1,frameId:0}]});
  assert.equal(f.broadcast.length,1);
  const g = host({page:true}), seen = [];
  g.self.chrome.webNavigation.onDOMContentLoaded.addListener(value => seen.push(value.tabId));
  const event = f.broadcast[0];
  for (const sender of [{id:'forged',url:'chrome-extension://owned/background.html'}, {id:'owned',url:'https://page.test/'}, {id:'owned',url:'chrome-extension://owned/logger-ui.html'}]) g.messages[0](event,sender);
  assert.deepEqual(seen,[]);
  g.messages[0](event,{id:'owned',url:'chrome-extension://owned/background.html'});
  assert.deepEqual(seen,[1]);
});
