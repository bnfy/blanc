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
  assert.equal(r.overlayView, null);
  assert.equal(r.overlayMode, null);
  assert.equal(r.overlayPrefill, null);
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
  assert.equal(r.onePasswordFillInFlight, false);
  assert.equal(r.railActivationSerial, 0);
  assert.ok(r.permissionPrompts instanceof Map);
  assert.equal(r.addressMenuTicket, 0);
  assert.equal(r.addressMenuSeq, 0);
  assert.ok(Number.isInteger(r.id));
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
  assert.equal(reg.runtimeForTab(7), r);
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
