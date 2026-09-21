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
