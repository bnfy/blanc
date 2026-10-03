'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { popupGeometry, validPopupSender, validPopupMessage, shouldDismissPopupOnBlur } = require('../../src/main/ublock-popup-host');
function fixture() {
  const session = {}, frame = {};
  const wc = { mainFrame: frame, session, getURL: () => 'chrome-extension://owned/popup-fenix.html?tabId=1', isDestroyed: () => false };
  const runtime = { activeTabId: 7, chromeHeight: 68, window: { isDestroyed: () => false, getContentSize: () => [1000, 800] } };
  const popup = { tabId: 7, url: wc.getURL(), view: { webContents: wc }, runtime };
  return { session, wc, runtime, popup, event: { sender: wc, senderFrame: frame } };
}
test('popup IPC requires the live owning profile, document, tab and window', () => {
  const f = fixture(); assert(validPopupSender(f.event, f.popup, f.session));
  assert(!validPopupSender({ ...f.event, sender: {} }, f.popup, f.session));
  assert(!validPopupSender({ ...f.event, senderFrame: {} }, f.popup, f.session));
  assert(!validPopupSender(f.event, f.popup, {}));
  f.wc.getURL = () => 'chrome-extension://owned/dashboard.html'; assert(!validPopupSender(f.event, f.popup, f.session));
  f.wc.getURL = () => f.popup.url;
  f.runtime.activeTabId++; assert(!validPopupSender(f.event, f.popup, f.session)); f.runtime.activeTabId--;
  f.runtime.window.isDestroyed = () => true; assert(!validPopupSender(f.event, f.popup, f.session));
  f.runtime.window.isDestroyed = () => false; f.wc.isDestroyed = () => true; assert(!validPopupSender(f.event, f.popup, f.session));
  f.popup.view.webContents = undefined; assert(!validPopupSender(f.event, f.popup, f.session));
  assert(!validPopupSender(f.event, undefined, f.session));
});
test('popup IPC accepts fixed bounded operations and rejects forged payloads', () => {
  for (const message of [{ action: 'back' }, { action: 'close' }, { action: 'layout', height: 0 }, { action: 'layout', height: 20000 }]) assert(validPopupMessage(message));
  for (const message of [null, [], { action: 'eval', code: 'x' }, { action: 'close', profile: 'foreign' }, { action: 'layout', height: NaN }, { action: 'layout', height: Infinity }, { action: 'layout', height: -1 }, { action: 'layout', height: 20001 }, { action: 'layout', height: '50' }, { action: 'layout', height: 50, tabId: 1 }]) assert(!validPopupMessage(message));
});
test('popup geometry follows the shield and clamps expansion into short windows', () => {
  const f = fixture(), anchor = { center: 760, right: 780, bottom: 48 };
  const normal = popupGeometry(f.runtime, anchor, 480);
  assert.equal(normal.bounds.width, 404); assert.equal(normal.bounds.y, 48);
  assert.equal(normal.bounds.height, 502); assert.equal(normal.bounds.x + normal.state.pointer, anchor.center);
  assert(normal.state.connected);
  f.runtime.window.getContentSize = () => [640, 400];
  const expanded = popupGeometry(f.runtime, { ...anchor, center: 620 }, 900);
  assert.equal(expanded.bounds.y + expanded.bounds.height, 400);
  assert(expanded.bounds.x + expanded.bounds.width <= 640);
  assert.equal(expanded.state.maxHeight + 22, expanded.bounds.height);
  assert(!popupGeometry(f.runtime, {}, 480).state.connected);
});

test('upstream close targets its own sender-validated popup instead of a profile-wide bridge operation', () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/ublock-host-mainworld.js'), 'utf8');
  const method = source.match(/closePopup\(\) \{[^}]+\}/)?.[0];
  assert(method);
  let closed = 0;
  vm.runInNewContext(`({ ${method} }).closePopup()`, { self: { blancUboPopup: { close: () => closed++ } } });
  assert.equal(closed, 1);
  assert.doesNotThrow(() => vm.runInNewContext(`({ ${method} }).closePopup()`, { self: {} }));
  const f = fixture(), oldEvent = f.event;
  f.popup.view.webContents = { ...f.wc, mainFrame: {} };
  assert(!validPopupSender(oldEvent, f.popup, f.session), 'old popup sender cannot close its replacement');
});

test('popup blur ignores initial loading, refocused views and stale callbacks', () => {
  const f = fixture(); f.wc.isFocused = () => false;
  assert(!shouldDismissPopupOnBlur(f.popup, f.popup));
  f.popup.ready = true;
  assert(shouldDismissPopupOnBlur(f.popup, f.popup));
  assert(!shouldDismissPopupOnBlur(f.popup, { ...f.popup }));
  f.wc.isFocused = () => true;
  assert(!shouldDismissPopupOnBlur(f.popup, f.popup));
  f.wc.isFocused = () => false; f.wc.isDestroyed = () => true;
  assert(!shouldDismissPopupOnBlur(f.popup, f.popup));
});
