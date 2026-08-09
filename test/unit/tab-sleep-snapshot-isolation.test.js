'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const fnSource = mainSource.match(/function serializeTabs\(\) \{[\s\S]*?\n\}/)?.[0];

test('serializeTabs is still liftable from main.js', () => {
  assert.ok(fnSource, 'serializeTabs not found — update this test with it');
});

function serialize(tabList) {
  const sandbox = {
    settings: { getSettings: () => ({ adblockEnabled: true }) },
    rt: () => ({ tabOrder: tabList.map((tab) => tab.id) }),
    tabs: new Map(tabList.map((tab) => [tab.id, tab])),
    isHostnameExcepted: () => false,
    shieldChipState: () => ({ kind: 'stub' }),
    connectionFor: () => 'secure',
    committedUrlOf: () => 'https://committed.example/',
  };
  vm.runInNewContext(`${fnSource}\nthis.__fn = serializeTabs;`, sandbox);
  return sandbox.__fn();
}

const EXPECTED_KEYS = [
  'id', 'title', 'url', 'isLoading', 'canGoBack', 'canGoForward', 'favicon',
  'bookmarked', 'blockedCount', 'private', 'pinned', 'muted', 'audible',
  'groupId', 'pageBg', 'themeColor', 'asleep', 'excepted', 'shield', 'connection',
].sort();

const record = (over = {}) => ({
  id: 't1', runtimeId: 9, view: { marker: 'a WebContentsView' }, title: 'A page',
  url: 'https://example.com/', isLoading: false, canGoBack: true, canGoForward: false,
  favicon: 'https://example.com/favicon.ico', bookmarked: false, blockedCount: 3,
  private: false, pinned: false, muted: false, audible: false, groupId: null,
  pageBg: '#ffffff', themeColor: null, asleep: false, historyEligible: true, navEpoch: 7, ...over,
});

test('the broadcast payload is exactly the allowlist', () => {
  const [row] = serialize([record()]);
  assert.deepEqual(Object.keys(row).sort(), EXPECTED_KEYS);
});

test('main-process-only state on the record never reaches the payload', () => {
  const [row] = serialize([record({
    view: { webContents: { secret: true } },
    lastActiveAt: 1723200000000,
    sleepSnapshot: { entries: [{ url: 'https://example.com/', pageState: 'BASE64…' }], index: 0 },
    pageState: 'BASE64…', runtimeId: 42, historyEligible: false, navEpoch: 99,
  })]);
  for (const forbidden of [
    'view', 'lastActiveAt', 'sleepSnapshot', 'pageState',
    'runtimeId', 'historyEligible', 'navEpoch',
  ]) {
    assert.ok(!(forbidden in row), `${forbidden} must not be broadcast`);
  }
  assert.ok(!JSON.stringify(row).includes('BASE64'), 'no page state may appear anywhere in the payload');
});

test('a private tab still has its remote favicon nulled', () => {
  const [row] = serialize([record({ private: true, favicon: 'https://tracker.example/f.ico' })]);
  assert.equal(row.favicon, null);
  assert.equal(row.private, true);
});

test('tab order drives the payload order, and unknown ids are skipped', () => {
  const rows = serialize([record({ id: 'a' }), record({ id: 'b' })]);
  assert.deepEqual(rows.map((row) => row.id), ['a', 'b']);
});
