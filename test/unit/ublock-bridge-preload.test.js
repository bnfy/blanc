'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
test('sandbox preload exposes fixed typed operations, bounded payloads and one listener', () => {
  const sent = []; let api; const listeners = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/main/ublock-bridge-preload.js'), 'utf8'), {
    require: name => { assert.equal(name, 'electron'); return {
      contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
      ipcRenderer: { send: (...args) => sent.push(args), on: (...args) => listeners.push(args) },
    }; },
  });
  api.send({ kind: 'call', id: 1, method: 'tabs.query', args: [{}] });
  assert.equal(sent.length, 1);
  for (const message of [
    { kind: 'call', id: 2, method: 'evaluate', args: ['process.env'] },
    { kind: 'call', id: -1, method: 'tabs.query', args: [] },
    { kind: 'call', id: 2, method: 'tabs.query', args: [], forged: true },
    { kind: 'ready', node: 'false' },
    { kind: 'decision', id: 2, value: 'x'.repeat(3 * 1024 * 1024) },
  ]) api.send(message);
  assert.equal(sent.length, 1);
  let delivered = 0;
  api.listen(() => delivered++); api.listen(() => delivered++);
  assert.equal(listeners.length, 1);
  listeners[0][1]({}, { kind: 'request' }); listeners[0][1]({}, { kind: 'evaluate' });
  assert.equal(delivered, 1);
});
