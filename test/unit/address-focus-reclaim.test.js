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
    matchBrowserShortcut: input => input.key?.toLowerCase() === 't' && (input.control || input.meta) ? 'new-tab' : null,
    liveViewContents: view => view?.wc,
    ownsBrowserShortcutSurface: () => true,
    rt: () => runtime, tabs: new Map([[tab.id, tab]]),
    windowRuntimes: { runtimeForTab: () => owner },
    hasLiveWindow: () => true, liveContents: tab => tab?.wc,
    setTabViewVisible: (tab, visible) => { visibilityCalls++; tab.visible = visible; },
    focusAddressBar: () => { focusCalls++; },
    setImmediate: callback => deferred.push(callback),
  };
  vm.runInNewContext(`${functions}\nthis.cancel = cancelAddressBarFocusReclaim; this.reclaim = reclaimAddressBarFocus; this.overlayInput = cancelAddressBarFocusForOverlayInput; this.reveal = revealAddressBarTab;`, sandbox);
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

test('typing, composition and Tab in the current address surface cancel late reclaim without consuming input', () => {
  for (const input of [{ type: 'keyDown', key: 'h' }, { type: 'keyDown', key: 'Tab' },
    { type: 'keyDown', key: 'Process', isComposing: true }, { type: 'keyDown', key: 'v', control: true }]) {
    const h = harness();
    h.runtime.overlayMode = 'panel';
    const wc = {}; h.runtime.overlayView = { wc };
    h.sandbox.reclaim('tab');
    h.sandbox.overlayInput(input, wc);
    h.deferred.shift()();
    assert.equal(h.focusCalls(), 1);
    assert.equal(h.runtime.tabsWantingAddressBarFocus.size, 0);
    assert.equal(h.visibilityCalls(), 0, 'typing cannot reveal and refocus the native tab');
    h.sandbox.reveal();
    assert.equal(h.tab.visible, true, 'closing the address surface reveals the tab');
  }
});

test('revealing an already visible address tab never reasserts native visibility', () => {
  const h = harness(); h.tab.visible = true;
  h.sandbox.cancel();
  assert.equal(h.visibilityCalls(), 0);
});

test('modifier keys, browser commands, hidden or replaced overlays cannot invalidate address reclaim', () => {
  for (const change of [h => ({ type: 'keyDown', key: 'Control' }),
    h => ({ type: 'keyDown', key: 'T', control: true }),
    h => { h.runtime.overlayMode = null; return { type: 'keyDown', key: 'h' }; },
    h => { h.runtime.overlayView = { wc: {} }; return { type: 'keyDown', key: 'h' }; }]) {
    const h = harness(); h.runtime.overlayMode = 'panel';
    const wc = {}; h.runtime.overlayView = { wc };
    h.sandbox.overlayInput(change(h), wc);
    assert.equal(h.runtime.tabsWantingAddressBarFocus.size, 1);
  }
});
