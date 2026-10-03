'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const functions = source.slice(source.indexOf('function cancelAddressBarFocusReclaim('), source.indexOf('function refocusAddressBarIfWanted('));

function harness() {
  const wc = {};
  const tab = { id: 'tab', wc, visible: false };
  const runtime = { activeTabId: tab.id, addressFocusGeneration: 0, tabsWantingAddressBarFocus: new Set([tab.id]) };
  let owner = runtime, focusCalls = 0;
  const deferred = [];
  const sandbox = {
    rt: () => runtime, tabs: new Map([[tab.id, tab]]),
    windowRuntimes: { runtimeForTab: () => owner },
    hasLiveWindow: () => true, liveContents: tab => tab?.wc,
    setTabViewVisible: (tab, visible) => { tab.visible = visible; },
    focusAddressBar: () => { focusCalls++; },
    setImmediate: callback => deferred.push(callback),
  };
  vm.runInNewContext(`${functions}\nthis.cancel = cancelAddressBarFocusReclaim; this.reclaim = reclaimAddressBarFocus;`, sandbox);
  return { sandbox, tab, runtime, deferred, focusCalls: () => focusCalls, move: () => { owner = {}; } };
}

test('opening another surface cancels queued address focus and reveals the blank tab', () => {
  const h = harness();
  h.sandbox.reclaim('tab');
  assert.equal(h.focusCalls(), 1);
  h.sandbox.cancel();
  h.deferred.shift()();
  assert.equal(h.focusCalls(), 1);
  assert.equal(h.tab.visible, true);
  assert.equal(h.runtime.tabsWantingAddressBarFocus.size, 0);
});

test('deferred address focus refuses changed ownership, identity, and permission priority', () => {
  for (const invalidate of [h => h.move(), h => { h.tab.wc = {}; },
    h => { h.runtime.permissionViewAttached = true; }, h => { h.runtime.closing = true; }]) {
    const h = harness();
    h.sandbox.reclaim('tab');
    invalidate(h);
    h.deferred.shift()();
    assert.equal(h.focusCalls(), 1);
  }
});
