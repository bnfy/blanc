'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const reg = require('../../src/main/window-runtime-registry');

beforeEach(() => reg.resetForTests());

test('createRuntime initializes the per-window inventory to main.js defaults', () => {
  const r = reg.createRuntime();
  assert.equal(r.window, null);
  assert.deepEqual(r.tabOrder, []);
  assert.equal(r.activeTabId, null);
  assert.deepEqual(r.groups, []);
  assert.equal(r.glanceTabId, null);
  assert.equal(r.glanceRatio, 0.62);
  assert.deepEqual(r.recentlyClosedUrls, []);
  assert.equal(r.overlayView, null);
  assert.equal(r.overlayMode, null);
  assert.equal(r.overlayPrefill, null);
  assert.equal(r.overlayPurpose, null);
  assert.equal(r.shieldAnchorRight, null);
  assert.equal(r.shieldPopoverHost, null);
  assert.equal(r.shieldTrigger, null);
  assert.equal(r.utilitySheetView, null);
  assert.equal(r.utilitySheetUrl, null);
  assert.ok(r.tabsWantingAddressBarFocus instanceof Set);
  assert.equal(r.chromeHeight, 64);
  assert.equal(r.tabsBroadcastTimer, null);
  assert.equal(r.themeTintRefreshGeneration, 0);
  assert.ok(r.lastActiveByCluster instanceof Map);
  assert.equal(r.railActivationSerial, 0);
  assert.ok(r.permissionPrompts instanceof Map);
  assert.equal(r.addressMenuTicket, 0);
  assert.equal(r.addressMenuSeq, 0);
  assert.ok(Number.isInteger(r.id));
  assert.equal(r.profileId, 'default');
  assert.equal(reg.all().length, 1);
});

test('tab ownership: attach, resolve, detach', () => {
  const r = reg.createRuntime();
  reg.attachTab(r, 7);
  assert.equal(reg.runtimeForTab(7), r);
  reg.detachTab(7);
  assert.equal(reg.runtimeForTab(7), null);
  assert.equal(reg.runtimeForTab(99), null);
});

test('chrome surfaces: register both, resolve either, unregister independently', () => {
  const r = reg.createRuntime();
  reg.registerChromeSurface(r, 11); // strip
  reg.registerChromeSurface(r, 22); // overlay
  assert.equal(reg.runtimeForChromeWebContentsId(11), r);
  assert.equal(reg.runtimeForChromeWebContentsId(22), r);
  reg.unregisterChromeSurface(22); // overlay destroyed, strip lives on
  assert.equal(reg.runtimeForChromeWebContentsId(22), null);
  assert.equal(reg.runtimeForChromeWebContentsId(11), r);
});

test('detachWindow: workspace survives, window and surfaces do not', () => {
  const r = reg.createRuntime();
  const fakeWin = {};
  reg.attachWindow(r, { window: fakeWin });
  reg.registerChromeSurface(r, 11);
  reg.registerChromeSurface(r, 22);
  reg.attachTab(r, 7);
  r.tabOrder.push(7);
  r.activeTabId = 7;
  r.groups.push({ id: 'g1', name: 'work', collapsed: false });
  r.glanceTabId = 8;

  reg.detachWindow(r);

  assert.equal(r.window, null);
  assert.equal(r.overlayView, null);
  assert.equal(r.utilitySheetView, null);
  // Late IPC from the dying chrome resolves to nothing:
  assert.equal(reg.runtimeForChromeWebContentsId(11), null);
  assert.equal(reg.runtimeForChromeWebContentsId(22), null);
  // The workspace is untouched (macOS dock-reopen contract):
  assert.deepEqual(r.tabOrder, [7]);
  assert.equal(r.activeTabId, 7);
  assert.equal(r.groups.length, 1);
  // Glance is view/window state, not a restored workspace surface.
  assert.equal(r.glanceTabId, null);
  assert.equal(reg.runtimeForTab(7), r);
});

test('auxiliary content: register, resolve, unregister', () => {
  const r = reg.createRuntime();
  reg.registerAuxiliaryContent(r, 44); // popup child webContents id
  assert.equal(reg.runtimeForAuxiliaryContent(44), r);
  reg.unregisterAuxiliaryContent(44);
  assert.equal(reg.runtimeForAuxiliaryContent(44), null);
  assert.equal(reg.runtimeForAuxiliaryContent(99), null);
});

test('auxiliary content is NOT a chrome surface: a registered aux id must never resolve via runtimeForChromeWebContentsId', () => {
  const r = reg.createRuntime();
  reg.registerAuxiliaryContent(r, 55);
  // This is the security-critical separation: registering a popup child for
  // permission-prompt ownership must never confer chrome-IPC trust on it.
  assert.equal(reg.runtimeForChromeWebContentsId(55), null);
  // And the reverse must also hold: a chrome surface id is not an aux owner.
  reg.registerChromeSurface(r, 66);
  assert.equal(reg.runtimeForAuxiliaryContent(66), null);
});

test('detachWindow sweeps auxiliary entries for that runtime, leaves other runtimes untouched', () => {
  const r1 = reg.createRuntime();
  const r2 = reg.createRuntime();
  reg.registerAuxiliaryContent(r1, 77);
  reg.registerAuxiliaryContent(r2, 88);

  reg.detachWindow(r1);

  assert.equal(reg.runtimeForAuxiliaryContent(77), null);
  assert.equal(reg.runtimeForAuxiliaryContent(88), r2);
});

test('resetForTests clears auxiliary content along with tab and surface ownership', () => {
  const r = reg.createRuntime();
  reg.registerAuxiliaryContent(r, 99);
  reg.resetForTests();
  assert.equal(reg.runtimeForAuxiliaryContent(99), null);
  assert.equal(reg.all().length, 0);
});

// The permission prompter in main.js resolves ownership as:
//   const owner = tab ? runtimeForTab(tab.id) : runtimeForAuxiliaryContent(wcId);
// (I1 fix.) The prompter itself lives in main.js and can't be required by a
// unit test, so these exercise the registry's resolution-order contract
// directly — see fix-i1-report.md for why a vm-lifted-source test wasn't
// pursued for the prompter closure itself.
test('resolution order contract: a managed tab match wins over any auxiliary registration', () => {
  const tabRuntime = reg.createRuntime();
  reg.attachTab(tabRuntime, 5);
  const auxRuntime = reg.createRuntime();
  reg.registerAuxiliaryContent(auxRuntime, 5); // same numeric id, disjoint key space

  const tab = { id: 5 }; // tabForWebContents found a managed tab
  const owner = tab ? reg.runtimeForTab(tab.id) : reg.runtimeForAuxiliaryContent(5);
  assert.equal(owner, tabRuntime);
});

test('resolution order contract: auxiliary content resolves when no managed tab matches', () => {
  const auxRuntime = reg.createRuntime();
  reg.registerAuxiliaryContent(auxRuntime, 9);

  const tab = null; // tabForWebContents found nothing — a real popup child
  const owner = tab ? reg.runtimeForTab(tab?.id) : reg.runtimeForAuxiliaryContent(9);
  assert.equal(owner, auxRuntime);
});

test('resolution order contract: neither a tab nor auxiliary registration resolves to null', () => {
  const tab = null;
  const owner = tab ? reg.runtimeForTab(tab?.id) : reg.runtimeForAuxiliaryContent(404);
  assert.equal(owner, null);
});

test('detach then reattach: replacement window binds, new surfaces resolve', () => {
  const r = reg.createRuntime();
  reg.attachWindow(r, { window: {} });
  reg.registerChromeSurface(r, 11);
  reg.detachWindow(r);

  const replacement = {};
  reg.attachWindow(r, { window: replacement });
  reg.registerChromeSurface(r, 33);
  assert.equal(r.window, replacement);
  assert.equal(reg.runtimeForChromeWebContentsId(33), r);
  assert.equal(reg.runtimeForChromeWebContentsId(11), null, 'stale id must stay dead');
});

test('explicit runtime ids are stable and duplicate ids are rejected', () => {
  const primary = reg.createRuntime({ id: 'primary' });
  assert.equal(primary.id, 'primary');
  assert.throws(() => reg.createRuntime({ id: 'primary' }), /already exists/);
});

test('runtime profile identity is explicit, stable, and validated', () => {
  const named = reg.createRuntime({ id: 'window_work', profileId: 'profile_work' });
  assert.equal(named.profileId, 'profile_work');
  reg.detachWindow(named);
  reg.attachWindow(named, { window: {} });
  assert.equal(named.profileId, 'profile_work');
  assert.throws(
    () => reg.createRuntime({ id: 'bad', profileId: '../escape' }),
    /Invalid local profile id/
  );
});

test('discardRuntime removes a secondary runtime and all ownership edges', () => {
  const primary = reg.createRuntime({ id: 'primary' });
  const secondary = reg.createRuntime({ id: 'window_2' });
  reg.attachWindow(secondary, { window: {} });
  reg.registerChromeSurface(secondary, 201);
  reg.registerAuxiliaryContent(secondary, 202);
  reg.attachTab(secondary, 'tab-2');

  assert.equal(reg.discardRuntime(secondary), secondary);
  assert.deepEqual(reg.all(), [primary]);
  assert.equal(reg.runtimeForTab('tab-2'), null);
  assert.equal(reg.runtimeForChromeWebContentsId(201), null);
  assert.equal(reg.runtimeForAuxiliaryContent(202), null);
  assert.equal(reg.discardRuntime(secondary), null);
});
