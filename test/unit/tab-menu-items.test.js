'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// tabMenuItems lives in main.js, which cannot be required in a unit test. Same
// approach as settings-fanout-reload.test.js: lift the function's real source
// and run it in a sandbox, so this asserts the shipped code, not a copy.
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const fnSource = mainSource.match(/function tabMenuItems\(owner = rt\(\)\) \{[\s\S]*?\n\}/)?.[0];

test('the tab-menu builder is still present in main.js', () => {
  assert.ok(fnSource, 'tabMenuItems not found — update this test with it');
});

/**
 * Run the real function against a controllable world.
 * `slotIds` is what clusterSlots() reports; `tabsById` is what actually exists.
 * The gap between the two is the whole point — see the regression test below.
 */
function run({ slotIds, tabsById, groups = [], activeTabId = null }) {
  const tabs = new Map(Object.entries(tabsById).map(([k, v]) => [Number(k), v]));
  const sandbox = {
    clusterSlots: () => [{ tabIds: slotIds }],
    tabs,
    rt: () => ({ groups, activeTabId }),
    bindWindowRuntime: (_r, fn) => fn,
    setActiveTab: () => {},
    escapeMenuLabel: (l) => l,
    URL,
  };
  vm.runInNewContext(`${fnSource}\nthis.__fn = tabMenuItems;`, sandbox);
  return sandbox.__fn();
}

const tab = (over = {}) => ({ title: 'The Verge', url: 'https://theverge.com/', private: false, groupId: null, ...over });

test('builds one item per open tab, in slot order', () => {
  const items = run({ slotIds: [1, 2], tabsById: { 1: tab(), 2: tab({ title: 'News', url: 'https://news.example/' }) } });
  assert.equal(items.length, 2);
  assert.equal(items[0].label, 'The Verge — theverge.com');
  assert.equal(items[1].label, 'News — news.example');
});

test('private tabs are left out entirely', () => {
  const items = run({ slotIds: [1, 2], tabsById: { 1: tab(), 2: tab({ title: 'Secret', private: true }) } });
  assert.equal(items.length, 1);
  assert.equal(items[0].label, 'The Verge — theverge.com');
});

test("a tab's group name is appended when it has one", () => {
  const items = run({
    slotIds: [1], tabsById: { 1: tab({ groupId: 'g1' }) }, groups: [{ id: 'g1', name: 'work' }],
  });
  assert.equal(items[0].label, 'The Verge — theverge.com (work)');
});

// ---------------------------------------------------------------------------
// REGRESSION — hard crash of the whole main process, shipped in 1.0.10.
//
// The menu rebuild is debounced by 100ms. Close a tab and the rebuild fires
// afterwards, by which time clusterSlots() can still name an id that `tabs` no
// longer holds. The filter tolerated that (`tabs.get(id)?.private` — a missing
// tab is "not private", so its id passes through) but the very next line did
// `tab.groupId` on undefined and took the app down.
//
// Same shape as the settings-fanout crash fixed in #88: a deferred action
// outliving the tab it was scheduled for.
// ---------------------------------------------------------------------------

test('a tab that closed before the debounced rebuild does not crash the menu', () => {
  const items = run({
    slotIds: [1, 999, 2],                       // 999 closed while the rebuild was pending
    tabsById: { 1: tab(), 2: tab({ title: 'News', url: 'https://news.example/' }) },
  });
  assert.equal(items.length, 2, 'the stale id should be dropped, not rendered');
  assert.deepEqual(items.map((i) => i.label), ['The Verge — theverge.com', 'News — news.example']);
});

test('a rebuild after every tab closed produces an empty menu, not a crash', () => {
  assert.deepEqual(run({ slotIds: [7, 8], tabsById: {} }), []);
});
