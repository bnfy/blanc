'use strict';

// downgradeHeldEntry must stay callable from OUTSIDE any bindWindowRuntime
// scope: the before-quit sweep iterates every runtime's closed entries
// unbound (main.js, app.on('before-quit')). In acceptance mode an ambient
// rt() there throws ("currentRuntime() outside any bindWindowRuntime scope"
// — found live by hand verification); in production it would silently
// resolve the focused window. The sandbox below deliberately omits rt,
// hasLiveWindow, and scheduleBroadcastTabs, so reintroducing any ambient-
// runtime access into the function fails this test as a ReferenceError.
// Bound callers (the firewall's crash observer, the hold-timer sweep) own
// the panel broadcast instead.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const fnStart = mainSource.indexOf('function downgradeHeldEntry(');
const fnEnd = mainSource.indexOf('\n}', fnStart) + 2;
const downgradeSource = fnStart >= 0 ? mainSource.slice(fnStart, fnEnd) : null;
const removeStart = mainSource.indexOf('function removeHeldFirewall(');
const removeEnd = mainSource.indexOf('\n}', removeStart) + 2;
const removeSource = removeStart >= 0 ? mainSource.slice(removeStart, removeEnd) : null;

test('downgradeHeldEntry is still liftable from main.js', () => {
  assert.ok(downgradeSource, 'downgradeHeldEntry not found — update this test');
  assert.ok(removeSource, 'removeHeldFirewall not found — update this test');
});

test('a quit-path downgrade preserves Electron listeners while destroying the view', () => {
  let closed = 0;
  let cleared = null;
  const removed = [];
  const firewallHandler = () => {};
  const entry = {
    holdTimer: 'timer-token',
    wcId: 41,
    heldAt: 12345,
    firewallListeners: [['destroyed', firewallHandler]],
    view: {
      webContents: {
        isDestroyed: () => false,
        removeListener(event, handler) { removed.push([event, handler]); },
        removeAllListeners() { throw new Error('must preserve Electron-owned listeners'); },
        close() { closed += 1; },
      },
    },
  };
  const sandbox = {
    clearTimeout: (t) => { cleared = t; },
    heldWebContents: new Set([41]),
  };
  vm.createContext(sandbox);
  vm.runInContext(`${removeSource}\n${downgradeSource}`, sandbox);
  // No rt(), hasLiveWindow, or scheduleBroadcastTabs in scope — exactly the
  // before-quit environment. A ReferenceError here is the regression.
  vm.runInContext('downgradeHeldEntry(entry);', Object.assign(sandbox, { entry }));

  assert.equal(closed, 1, 'the held view must be destroyed');
  assert.equal(cleared, 'timer-token', 'the hold timer must be cancelled');
  assert.equal(entry.view, null);
  assert.equal(entry.heldAt, null);
  assert.equal(entry.wcId, null);
  assert.equal(sandbox.heldWebContents.size, 0, 'the registry entry must be removed');
  assert.deepEqual(removed, [['destroyed', firewallHandler]],
    'only the recorded Blanc firewall listener may be removed');
  assert.equal(entry.firewallListeners, null);

  // Idempotent: the destroyed-handler path may call it again.
  vm.runInContext('downgradeHeldEntry(entry);', sandbox);
  assert.equal(closed, 1, 'a second call must not double-close');
});
