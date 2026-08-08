'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shieldChipState, shieldPopoverModel } = require('../../src/main/shield-model');

const HTTP = 'https://www.theverge.com/article';

test('chip is hidden without a blockable host', () => {
  for (const url of ['blanc://newtab/', 'view-source:https://a.com/', '', null, 'devtools://x']) {
    assert.equal(shieldChipState({ url, blockedCount: 5, excepted: false, adblockEnabled: true }).mode, 'hidden');
  }
});

test('chip is quiet at zero blocked while protected', () => {
  const s = shieldChipState({ url: HTTP, blockedCount: 0, excepted: false, adblockEnabled: true });
  assert.deepEqual(s, { mode: 'quiet', count: 0, title: 'Protected — click for site controls' });
});

test('chip counts while protected, singular at 1', () => {
  const many = shieldChipState({ url: HTTP, blockedCount: 12, excepted: false, adblockEnabled: true });
  assert.equal(many.mode, 'count');
  assert.equal(many.count, 12);
  assert.equal(many.title, 'Blanc blocked 12 ads & trackers on this page — click for site controls');
  const one = shieldChipState({ url: HTTP, blockedCount: 1, excepted: false, adblockEnabled: true });
  assert.equal(one.title, 'Blanc blocked 1 ad or tracker on this page — click for site controls');
});

test('chip is off when the site is excepted — site tooltip wins over global', () => {
  for (const adblockEnabled of [true, false]) {
    const s = shieldChipState({ url: HTTP, blockedCount: 0, excepted: true, adblockEnabled });
    assert.deepEqual(s, { mode: 'off', count: 0, title: 'Ads allowed on this site — click for site controls' });
  }
});

test('chip is off with the global tooltip when blocking is off everywhere', () => {
  const s = shieldChipState({ url: HTTP, blockedCount: 0, excepted: false, adblockEnabled: false });
  assert.deepEqual(s, { mode: 'off', count: 0, title: 'Ad blocking is off — click for details' });
});

test('popover is null without a blockable host', () => {
  assert.equal(shieldPopoverModel({ url: 'blanc://settings/', blockedCount: 0, excepted: false, adblockEnabled: true }), null);
});

test('popover site variant, protection on, count lines', () => {
  const zero = shieldPopoverModel({ url: HTTP, blockedCount: 0, excepted: false, adblockEnabled: true });
  assert.deepEqual(zero, { variant: 'site', host: 'theverge.com', on: true, countLine: 'Nothing blocked on this page yet' });
  const one = shieldPopoverModel({ url: HTTP, blockedCount: 1, excepted: false, adblockEnabled: true });
  assert.equal(one.countLine, '1 ad or tracker blocked on this page');
  const many = shieldPopoverModel({ url: HTTP, blockedCount: 12, excepted: false, adblockEnabled: true });
  assert.equal(many.countLine, '12 ads & trackers blocked on this page');
});

test('popover site variant when excepted — even with global blocking off', () => {
  for (const adblockEnabled of [true, false]) {
    const v = shieldPopoverModel({ url: HTTP, blockedCount: 0, excepted: true, adblockEnabled });
    assert.deepEqual(v, { variant: 'site', host: 'theverge.com', on: false, countLine: 'Ads allowed on this site' });
  }
});

test('popover global-off variant when not excepted and blocking is off', () => {
  const v = shieldPopoverModel({ url: HTTP, blockedCount: 0, excepted: false, adblockEnabled: false });
  assert.deepEqual(v, { variant: 'global-off', host: 'theverge.com', on: false, countLine: 'Ad blocking is off everywhere' });
});
