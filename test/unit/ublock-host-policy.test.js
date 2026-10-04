'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validBridgeSender, contextMenuMatches } = require('../../src/main/ublock-host-policy');
test('bridge rejects forged senders, child/stale frames, foreign profiles and changed documents', () => {
  const session = {};
  const frame = {};
  const url = 'chrome-extension://owned/blanc-bridge.html';
  const wc = { session, mainFrame: frame, isDestroyed: () => false, getURL: () => url };
  const event = { sender: wc, senderFrame: frame };
  assert(validBridgeSender(event, wc, session, url));
  assert(!validBridgeSender({ ...event, sender: {} }, wc, session, url));
  assert(!validBridgeSender({ ...event, senderFrame: {} }, wc, session, url));
  assert(!validBridgeSender(event, wc, {}, url));
  assert(!validBridgeSender(event, wc, session, url + '?forged'));
  wc.mainFrame = {}; assert(!validBridgeSender(event, wc, session, url));
  wc.isDestroyed = () => true; assert(!validBridgeSender(event, wc, session, url));
});
test('extension context menus honor context, visibility and document/target patterns', () => {
  const params = { pageURL: 'https://example.org/page', linkURL: 'https://target.test/item' };
  const item = { title: 'Pick', contexts: ['link'], documentUrlPatterns: ['*://*.example.org/*'], targetUrlPatterns: ['https://target.test/*'] };
  assert(contextMenuMatches(item, params));
  assert(!contextMenuMatches({ ...item, visible: false }, params));
  assert(!contextMenuMatches(item, { ...params, pageURL: 'https://forged-example.org/page' }));
  assert(!contextMenuMatches(item, { ...params, linkURL: '' }));
  assert(!contextMenuMatches({ ...item, contexts: ['image'] }, params));
  assert(contextMenuMatches({ title: 'Subscribe', contexts: ['link'], targetUrlPatterns: ['abp:*'] }, { ...params, linkURL: 'abp:subscribe?location=https://lists.test/list' }));
});
