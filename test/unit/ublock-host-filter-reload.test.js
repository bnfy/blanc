'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../src/main/ublock-host-mainworld.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

// uBO empties its engine for the whole of loadFilterLists(); its webRequest
// listener allows whatever it decides meanwhile.
function host() {
  const connect = []; const values = {}; const messages = []; let receive;
  const runtime = {
    id: 'managed-extension', getURL: value => `chrome-extension://managed-extension/${value}`,
    onConnect: { addListener: callback => connect.push(callback) },
    onMessage: { addListener() {} },
  };
  const local = Object.fromEntries(['get', 'set', 'remove', 'clear'].map(name => [name, (value, callback) => {
    if (name === 'set') Object.assign(values, value);
    if (name === 'remove') delete values[value];
    callback(name === 'get' ? { ...values } : undefined);
  }]));
  const engine = { loads: 0, reload: null, get full() { return !this.reload; } };
  const µBlock = {
    loadFilterLists() {
      if (engine.reload) return engine.reload.promise;
      engine.loads++;
      let resolve, reject;
      const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
      const entry = { promise, finish: () => { if (engine.reload === entry) engine.reload = null; resolve(); }, fail: error => reject(error) };
      engine.reload = entry;
      return promise;
    },
  };
  const chrome = { runtime, storage: { local }, tabs: {}, webRequest: { ResourceType: {} } };
  const self = { chrome, µBlock };
  vm.runInNewContext(source, { self, chrome, location: { pathname: '/background.html' }, URL, setTimeout, clearTimeout });
  chrome.webRequest.onBeforeRequest.addListener(() => engine.full ? { cancel: true } : undefined, { urls: ['<all_urls>'] }, ['blocking']);
  const port = { name: 'blanc-host-v1', sender: { id: runtime.id, url: runtime.getURL('blanc-bridge.html') },
    onDisconnect: { addListener() {} }, onMessage: { addListener: callback => { receive = callback; } },
    postMessage: message => messages.push(JSON.parse(JSON.stringify(message))),
  };
  for (const listener of connect) listener(port);
  let id = 0;
  const request = () => {
    const message = { kind: 'request', id: ++id, name: 'onBeforeRequest', details: { url: 'https://ads.test/a.js', tabId: 3, type: 'script' } };
    receive(message);
    return message.id;
  };
  const decision = requestId => messages.find(message => message.kind === 'decision' && message.id === requestId);
  const reloading = () => messages.filter(message => message.kind === 'filters-reloading').map(message => message.value);
  return { self, engine, request, decision, reloading };
}

test('decisions wait for a filter reload instead of using the emptied engine', async () => {
  const f = host();
  await f.self.BlancUboHost.ready();
  const first = f.request(); await settle();
  assert.deepEqual(f.decision(first).value, { cancel: true });

  const loading = f.self.µBlock.loadFilterLists();
  assert.equal(f.self.µBlock.loadFilterLists(), loading, 'a repeated call joins the same reload');
  assert.deepEqual(f.reloading(), [true]);
  const held = f.request(); await settle();
  assert.equal(f.decision(held), undefined, 'no decision while the engine is incomplete');

  f.engine.reload.finish(); await settle();
  assert.deepEqual(f.decision(held).value, { cancel: true });
  assert.deepEqual(f.reloading(), [true, false]);
  assert.equal(f.engine.loads, 1);

  const later = f.request(); await settle();
  assert.deepEqual(f.decision(later).value, { cancel: true });
});

test('a reload that starts as another settles keeps decisions held until the last one', async () => {
  const f = host();
  await f.self.BlancUboHost.ready();
  f.self.µBlock.loadFilterLists();
  const held = f.request(); await settle();
  const first = f.engine.reload;
  // uBO clears its own loading state before the returned promise settles.
  f.engine.reload = null;
  f.self.µBlock.loadFilterLists();
  first.finish(); await settle();
  assert.equal(f.decision(held), undefined);
  assert.deepEqual(f.reloading(), [true]);
  f.engine.reload.finish(); await settle();
  assert.deepEqual(f.decision(held).value, { cancel: true });
  assert.deepEqual(f.reloading(), [true, false]);
});

test('a failed reload keeps decisions held so the provider deadline fails closed', async () => {
  const f = host();
  await f.self.BlancUboHost.ready();
  f.self.µBlock.loadFilterLists().catch(() => {});
  const held = f.request();
  f.engine.reload.fail(new Error('list unavailable')); await settle();
  assert.equal(f.decision(held), undefined);
  const next = f.request(); await settle();
  assert.equal(f.decision(next), undefined);
  assert.deepEqual(f.reloading(), [true]);
});
