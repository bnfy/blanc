'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { shouldSamplePageTint } = require('../../src/main/page-tint-policy');

test('samples web pages and the Sunrise Start Page for the Island faux header', () => {
  assert.equal(shouldSamplePageTint({ url: 'https://example.com/', private: false }), true);
  assert.equal(shouldSamplePageTint({ url: 'http://localhost:3000/', private: false }), true);
  assert.equal(shouldSamplePageTint({ url: 'blanc://newtab/', private: false }), true);
  assert.equal(shouldSamplePageTint({ url: 'blanc://newtab/?layout=billboard', private: false }), true);
});

test('leaves private tabs and other internal surfaces on their chrome theme', () => {
  assert.equal(shouldSamplePageTint({ url: 'blanc://newtab/?private=1', private: true }), false);
  assert.equal(shouldSamplePageTint({ url: 'blanc://settings/', private: false }), false);
  assert.equal(shouldSamplePageTint({ url: 'file:///tmp/page.html', private: false }), false);
  assert.equal(shouldSamplePageTint({ url: 'not a url', private: false }), false);
});

test('accepts only marker signals from the owned foreground main frame', () => {
  const { isPageTintSignal } = require('../../src/main/page-tint-policy');
  const frame = {};
  const sender = { mainFrame: frame };
  const tab = { id: 3, runtimeId: 2, url: 'https://example.com/', private: false };
  const runtime = { id: 2, activeTabId: 3, closing: false };
  const event = { sender, senderFrame: frame };
  const inputs = { tab, runtime, webContents: sender };
  assert.equal(isPageTintSignal(event, inputs), true);
  assert.equal(isPageTintSignal({ ...event, senderFrame: {} }, inputs), false, 'iframes cannot request a capture');
  assert.equal(isPageTintSignal(event, { ...inputs, webContents: {} }), false, 'stale or held views cannot request a capture');
  assert.equal(isPageTintSignal(event, { ...inputs, runtime: { ...runtime, activeTabId: 4 } }), false, 'background tabs cannot request a capture');
  assert.equal(isPageTintSignal(event, { ...inputs, runtime: { ...runtime, id: 5 } }), false, 'another window cannot request a capture');
  assert.equal(isPageTintSignal(event, { ...inputs, runtime: { ...runtime, closing: true } }), false);
  assert.equal(isPageTintSignal(event, { ...inputs, tab: { ...tab, private: true } }), false);
  assert.equal(isPageTintSignal(event, { ...inputs, tab: { ...tab, url: 'blanc://settings/' } }), false);
  assert.equal(isPageTintSignal({ sender: {} }, { tab, runtime, webContents: {} }), false);
});
