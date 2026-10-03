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
  tab.view = { getVisible: () => tab.visible };
  const runtime = { activeTabId: tab.id, addressFocusGeneration: 0, tabsWantingAddressBarFocus: new Set([tab.id]) };
  let owner = runtime, focusCalls = 0, visibilityCalls = 0;
  const deferred = [];
  const sandbox = {
    rt: () => runtime, tabs: new Map([[tab.id, tab]]),
    windowRuntimes: { runtimeForTab: () => owner },
    hasLiveWindow: () => true, liveContents: tab => tab?.wc,
    setTabViewVisible: (tab, visible) => { visibilityCalls++; tab.visible = visible; },
    focusAddressBar: () => { focusCalls++; },
    setImmediate: callback => deferred.push(callback),
  };
  vm.runInNewContext(`${functions}\nthis.cancel = cancelAddressBarFocusReclaim; this.reclaim = reclaimAddressBarFocus; this.reveal = revealAddressBarTab;`, sandbox);
  return { sandbox, tab, runtime, deferred, focusCalls: () => focusCalls, visibilityCalls: () => visibilityCalls, move: () => { owner = {}; } };
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

test('revealing an already visible address tab never reasserts native visibility', () => {
  const h = harness(); h.tab.visible = true;
  h.sandbox.cancel();
  assert.equal(h.visibilityCalls(), 0);
});

test('late address reclaim focuses the existing panel without replaying DOM focus or selection', () => {
  const focusFunction = source.slice(source.indexOf('function focusAddressBar('), source.indexOf('function cancelAddressBarFocusReclaim('));
  for (const mode of ['panel', 'palette']) {
    let overlayFocus = 0, shows = 0;
    const runtime = { overlayMode: mode, window: { isDestroyed: () => false, focus() {} }, overlayView: { wc: { focus() { overlayFocus++; } } } };
    const sandbox = { rt: () => runtime, liveViewContents: view => view?.wc, showOverlay: () => { shows++; } };
    vm.runInNewContext(`${focusFunction}\nthis.reassert = focusAddressBar;`, sandbox);
    sandbox.reassert();
    assert.equal(overlayFocus, 1);
    assert.equal(shows, 0);
    runtime.overlayMode = null;
    sandbox.reassert();
    assert.equal(shows, 1);
  }
});


test('closing cancels pending address focus without showing its hidden native guest', () => {
  const h = harness(); h.sandbox.reclaim('tab');
  h.sandbox.cancel(h.runtime, { reveal: false });
  h.deferred.shift()();
  assert.equal(h.tab.visible, false);
  assert.equal(h.visibilityCalls(), 0);
  assert.equal(h.focusCalls(), 1);
  assert.equal(h.runtime.tabsWantingAddressBarFocus.size, 0);
});
