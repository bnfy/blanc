'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../src/main/ublock-host-mainworld.js'), 'utf8');
function host(mode) {
  const records = []; const connect = []; const values = {}; const messages = [];
  const runtime = {
    id: 'managed-extension', getURL: value => `chrome-extension://managed-extension/${value}`,
    onConnect: { addListener: callback => connect.push(callback) },
    onMessage: { addListener() {} },
  };
  const local = Object.fromEntries(['get', 'set', 'remove', 'clear'].map(name => [name, (value, callback) => {
    records.push(name);
    if (name === 'clear') callback = value;
    if (mode === 'quota' && name === 'set') {
      runtime.lastError = { message: 'sensitive native detail' }; callback(); delete runtime.lastError; return;
    }
    if (name === 'set') Object.assign(values, value);
    if (name === 'remove') delete values[value];
    callback(name === 'get' ? { ...values, ...(mode === 'mismatch' ? { blancHostStorageProbe: 'wrong' } : {}) } : undefined);
  }]));
  const chrome = { runtime, storage: { local }, tabs: {}, webRequest: { ResourceType: {} } };
  const self = { chrome };
  vm.runInNewContext(source, { self, chrome, location: { pathname: '/background.html' },
    URL, setTimeout, clearTimeout });
  const attach = () => {
    const port = { name: 'blanc-host-v1', sender: { id: runtime.id, url: runtime.getURL('blanc-bridge.html') },
      onDisconnect: { addListener() {} }, onMessage: { addListener() {} },
      postMessage: message => messages.push(JSON.parse(JSON.stringify(message))),
    };
    for (const listener of connect) listener(port);
  };
  return { self, local, records, messages, attach };
}
test('native extension readiness requires successful storage write/read/remove and excludes Node access', async () => {
  const fixture = host();
  await fixture.self.BlancUboHost.ready(); fixture.attach();
  assert.deepEqual(fixture.records, ['set', 'get', 'remove']);
  assert(fixture.messages.some(message => message.kind === 'ready' && message.node === false));
  assert(!fixture.messages.some(message => message.kind === 'storage-failed'));
});
for (const mode of ['quota', 'mismatch']) test(`native extension storage ${mode} prevents readiness with bounded diagnostics`, async () => {
  const fixture = host(mode);
  await fixture.self.BlancUboHost.ready(); fixture.attach();
  assert(!fixture.messages.some(message => message.kind === 'ready'));
  assert(fixture.messages.some(message => message.kind === 'storage-failed'));
  assert(fixture.messages.every(message => Object.keys(message).length === 1));
  assert(!JSON.stringify(fixture.messages).includes('sensitive native detail'));
});
