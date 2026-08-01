const assert = require('node:assert/strict');
const test = require('node:test');

const {
  httpOrigin,
  captureRequestStillValid,
} = require('../../src/main/display-share-request');

function validHarness() {
  const frame = {
    origin: 'https://meet.example',
    isDestroyed: () => false,
  };
  const wc = { id: 8, isDestroyed: () => false };
  const tab = { id: 'tab-1', navEpoch: 4, view: { webContents: wc } };
  const context = {
    frame,
    wc,
    origin: 'https://meet.example',
    tabId: tab.id,
    navEpoch: 4,
  };
  const state = {
    frameOwner: wc,
    tab,
    activeTabId: tab.id,
    sheetVisible: false,
  };
  const dependencies = {
    webContentsFromFrame: () => state.frameOwner,
    getTab: (id) => id === tab.id ? state.tab : null,
    getActiveTabId: () => state.activeTabId,
    isUtilitySheetVisible: () => state.sheetVisible,
  };
  return { frame, wc, tab, context, state, dependencies };
}

test('display request remains valid only for its live, visible, origin-bound tab', () => {
  const h = validHarness();
  assert.equal(captureRequestStillValid(h.context, h.dependencies), true);

  h.state.activeTabId = 'background';
  assert.equal(captureRequestStillValid(h.context, h.dependencies), false);
  h.state.activeTabId = h.tab.id;

  h.state.sheetVisible = true;
  assert.equal(captureRequestStillValid(h.context, h.dependencies), false);
});

test('frame ownership and origin changes invalidate display capture', () => {
  const h = validHarness();
  h.state.frameOwner = { id: 99 };
  assert.equal(captureRequestStillValid(h.context, h.dependencies), false);

  h.state.frameOwner = h.wc;
  h.frame.origin = 'https://attacker.example';
  assert.equal(captureRequestStillValid(h.context, h.dependencies), false);

  h.frame.origin = 'https://meet.example';
  h.frame.isDestroyed = () => true;
  assert.equal(captureRequestStillValid(h.context, h.dependencies), false);
});

test('navigation epoch and tab ownership changes invalidate display capture', () => {
  const h = validHarness();
  h.tab.navEpoch += 1;
  assert.equal(captureRequestStillValid(h.context, h.dependencies), false);

  h.tab.navEpoch = h.context.navEpoch;
  h.state.tab = { ...h.tab, view: { webContents: { id: 44 } } };
  assert.equal(captureRequestStillValid(h.context, h.dependencies), false);
});

test('httpOrigin accepts only concrete HTTP(S) origins', () => {
  assert.equal(httpOrigin('https://meet.example/room'), 'https://meet.example');
  assert.equal(httpOrigin('http://localhost:9000/share'), 'http://localhost:9000');
  assert.equal(httpOrigin('file:///tmp/share.html'), null);
  assert.equal(httpOrigin('null'), null);
});
