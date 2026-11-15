'use strict';

// #1505: ⌘T switches to an unused New Tab page instead of opening another.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { findReusableNewTab, NEW_TAB_URL, PRIVATE_NEW_TAB_URL } = require('../../src/main/new-tab-reuse');

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

function find(list, opts = {}) {
  const tabs = new Map(list.map((tab) => [tab.id, { url: NEW_TAB_URL, private: false, ...tab }]));
  return findReusableNewTab({
    tabOrder: list.map((tab) => tab.id),
    tabs,
    isUsed: (tab) => !!tab.used,
    ...opts,
  });
}

test('an unused New Tab page is reused; with none, a new tab opens', () => {
  assert.equal(find([{ id: 'a', url: 'https://example.com/' }, { id: 'b' }]), 'b');
  assert.equal(find([{ id: 'a', url: 'https://example.com/' }]), null);
  assert.equal(find([]), null);
});

test('a page with back history or leaving the New Tab page is not reused', () => {
  assert.equal(find([{ id: 'a', used: true }]), null);
});

test('only Blanc\'s own New Tab page counts, never a custom home page or a variant', () => {
  assert.equal(find([{ id: 'a', url: 'https://home.example/' }]), null);
  assert.equal(find([{ id: 'a', url: 'blanc://newtab/?tour=1' }]), null);
});

test('pinned, grouped, split, Glance, restricted and mid-quiet tabs are never reused', () => {
  for (const extra of [{ pinned: true }, { groupId: 'g1' }, { splitId: 's1' }, { inert: true },
    { inheritsDocumentPolicy: true }, { sleeping: true }]) {
    assert.equal(find([{ id: 'a', ...extra }]), null, JSON.stringify(extra));
  }
  assert.equal(find([{ id: 'a' }], { glanceTabId: 'a' }), null);
});

test('a quiet New Tab page counts (it wakes when switched to)', () => {
  assert.equal(find([{ id: 'a', asleep: true }]), 'a');
});

test('private and regular requests never reuse each other', () => {
  const list = [{ id: 'p', url: PRIVATE_NEW_TAB_URL, private: true }, { id: 'r' }];
  assert.equal(find(list, { private: true }), 'p');
  assert.equal(find(list), 'r');
  assert.equal(find([{ id: 'p', url: PRIVATE_NEW_TAB_URL, private: true }]), null);
  assert.equal(find([{ id: 'r' }], { private: true }), null);
});

test('the active tab wins, then the most recently active, then the last in order', () => {
  const list = [{ id: 'a', lastActiveAt: 30 }, { id: 'b', lastActiveAt: 10 }, { id: 'c' }];
  assert.equal(find(list, { activeTabId: 'b' }), 'b');
  assert.equal(find(list), 'a');
  assert.equal(find([{ id: 'a' }, { id: 'b' }]), 'b');
});

test('the setting is device-local, on by default and saved only as a boolean', () => {
  const settings = read('src/main/settings.js');
  assert.match(settings, /\n  reuseNewTab: true,\n/);
  assert.match(settings, /if \(typeof partial\.reuseNewTab === 'boolean'\) clean\.reuseNewTab = partial\.reuseNewTab;/);
  assert.doesNotMatch(settings.match(/const SYNCED_KEYS = \[([^\]]*)\]/)[1], /reuseNewTab/);
  assert.ok(JSON.parse(read('settings-schema/schema.json')).internalDefaults.includes('reuseNewTab'));
  const page = read('src/renderer/pages/settings.js');
  assert.match(page, /reuseNewTab\.checked = settings\.reuseNewTab !== false;/);
  assert.match(page, /window\.bowserPages\.settings\.set\(\{ reuseNewTab: reuseNewTab\.checked \}\)/);
  assert.match(read('src/renderer/pages/settings.html'), /<input id="reuseNewTab" type="checkbox"[^>]*aria-describedby="reuseNewTabHint"/);
});

test('every plain new-tab request goes through the reuse rule, and nothing else does', () => {
  const main = read('src/main/main.js');
  assert.match(main, /'new-tab': \(\) => openOrReuseNewTab\(\)/);
  assert.match(main, /'new-private-tab': \(\) => openOrReuseNewTab\(\{ private: true \}\)/);
  assert.match(main, /newTab: b\(\(\) => openOrReuseNewTab\(\)\)/);
  assert.match(main, /newPrivateTab: b\(\(\) => openOrReuseNewTab\(\{ private: true \}\)\)/);
  assert.match(main, /if \(!url\) return openOrReuseNewTab\(\{ private: isPrivate, focusAddress: opts\?\.focusAddress \?\? true \}\);/);
  // New Tab in Group and New Tab Below always open a fresh tab.
  assert.doesNotMatch(main.match(/function newTabInGroup\([\s\S]*?\n}\n/)[0], /openOrReuseNewTab/);
  assert.doesNotMatch(main.match(/function newTabBelow\([\s\S]*?\n}\n/)[0], /openOrReuseNewTab/);
});
