'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { matchBrowserShortcut } = require('../../src/main/browser-shortcuts');
const source = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const start = source.indexOf('function installHeldFirewall(');
const end = source.indexOf('\n/** Park a closing tab', start);

test('parked guests consume accelerators without invoking active browser commands', () => {
  const wc = Object.assign(new EventEmitter(), { setWindowOpenHandler() {} });
  const sandbox = { matchBrowserShortcut: input => matchBrowserShortcut(input, 'win32'),
    bindWindowRuntime: (_owner, callback) => callback, downgradeHeldEntry() {},
    hasLiveWindow: () => false, scheduleBroadcastTabs() {},
  };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.install = installHeldFirewall; this.remove = removeHeldFirewall;`, sandbox);
  const entry = { seed: {} };
  sandbox.install(entry, wc, {});
  let prevented = 0;
  const emit = key => wc.emit('before-input-event', { preventDefault: () => prevented++ }, { type: 'keyDown', key, control: true });
  emit('w'); emit('Tab'); emit('c');
  assert.equal(prevented, 2);
  sandbox.remove(entry, wc);
  emit('w');
  assert.equal(prevented, 2, 'adoption removes exactly the held firewall');
});
