'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildTabContextMenu, closableTabIds } = require('../../src/main/tab-context-menu-model');

const baseTab = {
  id: 1, url: 'https://example.com/p?utm_source=x', title: 'Example',
  pinned: false, muted: false, private: false, asleep: false,
  bookmarked: false, groupId: null, capturing: false,
};
const build = (over = {}) => buildTabContextMenu({
  tab: { ...baseTab, ...(over.tab || {}) },
  groups: over.groups ?? [],
  activeTabId: over.activeTabId ?? 1,
  surface: over.surface ?? 'row',
  canCloseOthers: over.canCloseOthers ?? true,
  canMoveToNewWindow: over.canMoveToNewWindow ?? true,
});
const ids = (items) => items.filter((i) => i.id).map((i) => i.id);
const byId = (items, id) => items.find((i) => i.id === id);

test('core items present, in order, for a row on a non-active tab', () => {
  const m = build({ activeTabId: 2, surface: 'row' });
  assert.deepEqual(ids(m), [
    'copy-link', 'copy-clean-link', 'reload', 'duplicate',
    'toggle-pin', 'toggle-mute', 'toggle-favorite', 'group',
    'glance', 'quiet', 'new-tab', 'new-private-tab',
    'close-others', 'move-new-window', 'reopen-closed', 'close',
  ]);
});

test('pill (active tab) omits glance and quiet', () => {
  const m = build({ activeTabId: 1, surface: 'pill' });
  assert.equal(byId(m, 'glance'), undefined);
  assert.equal(byId(m, 'quiet'), undefined);
});

test('row on the active tab omits glance and quiet', () => {
  const m = build({ activeTabId: 1, surface: 'row' });
  assert.equal(byId(m, 'glance'), undefined);
  assert.equal(byId(m, 'quiet'), undefined);
});

test('pin/mute/favorite labels reflect state', () => {
  assert.equal(byId(build(), 'toggle-pin').label, 'Pin Tab');
  assert.equal(byId(build({ tab: { pinned: true } }), 'toggle-pin').label, 'Unpin Tab');
  assert.equal(byId(build({ tab: { muted: true } }), 'toggle-mute').label, 'Unmute Tab');
  assert.equal(byId(build(), 'toggle-favorite').label, 'Save to Favorites');
  assert.equal(byId(build({ tab: { bookmarked: true } }), 'toggle-favorite').label, 'Remove from Favorites');
});

test('save-to-favorites disabled for private and non-http tabs', () => {
  assert.equal(byId(build(), 'toggle-favorite').enabled, true);
  assert.equal(byId(build({ tab: { private: true } }), 'toggle-favorite').enabled, false);
  assert.equal(byId(build({ tab: { url: 'blanc://newtab/' } }), 'toggle-favorite').enabled, false);
});

test('copy-clean-link appears only when cleaning would change the url', () => {
  assert.ok(byId(build(), 'copy-clean-link')); // has utm_source → differs
  // cleanLink returns non-http(s) input as null and tracker-free URLs
  // unchanged — the item is OMITTED (spec §4: hidden), not disabled, in both.
  assert.equal(byId(build({ tab: { url: 'blanc://newtab/' } }), 'copy-clean-link'), undefined);
  assert.equal(byId(build({ tab: { url: 'https://example.com/plain' } }), 'copy-clean-link'), undefined);
});

test('quiet disabled for capturing or already-quiet tabs', () => {
  assert.equal(byId(build({ activeTabId: 2, tab: { asleep: true } }), 'quiet').enabled, false);
  assert.equal(byId(build({ activeTabId: 2, tab: { capturing: true } }), 'quiet').enabled, false);
  assert.equal(byId(build({ activeTabId: 2 }), 'quiet').enabled, true);
});

test('close-others / move-new-window respect caps', () => {
  assert.equal(byId(build({ canCloseOthers: false }), 'close-others').enabled, false);
  assert.equal(byId(build({ canMoveToNewWindow: false }), 'move-new-window').enabled, false);
});

test('group submenu lists groups with the current one checked, plus remove/new', () => {
  const sub = byId(build({
    tab: { groupId: 'g1' },
    groups: [{ id: 'g1', name: 'projects' }, { id: 'g2', name: 'tools' }],
  }), 'group').submenu;
  assert.deepEqual(sub.filter((i) => i.type === 'radio').map((i) => [i.label, i.checked]),
    [['projects', true], ['tools', false]]);
  assert.ok(sub.find((i) => i.id === 'group-none'), 'has Remove from Group when grouped');
  assert.ok(sub.find((i) => i.id === 'group-new'), 'has New Group…');
});

test('group submenu omits Remove when ungrouped; New Group always present', () => {
  const sub = byId(build({ tab: { groupId: null }, groups: [] }), 'group').submenu;
  assert.equal(sub.find((i) => i.id === 'group-none'), undefined);
  assert.equal(sub.filter((i) => i.id === 'group-new').length, 1);
});

test('radio group items carry the raw groupId for the runner', () => {
  const sub = byId(build({ groups: [{ id: 42, name: 'nums' }] }), 'group').submenu;
  assert.equal(sub.find((i) => i.type === 'radio').groupId, 42);
});

test('no leading, trailing, or doubled separators', () => {
  // The tracker-free URL exercises the hidden copy-clean-link path too.
  for (const m of [build(), build({ tab: { url: 'https://example.com/plain' } })]) {
    assert.notEqual(m[0].type, 'separator');
    assert.notEqual(m[m.length - 1].type, 'separator');
    for (let i = 1; i < m.length; i++) {
      assert.ok(!(m[i].type === 'separator' && m[i - 1].type === 'separator'), 'no double sep');
    }
  }
});

test('closableTabIds excludes the kept tab and pinned tabs', () => {
  const tabsById = new Map([
    [1, { id: 1, pinned: false }], [2, { id: 2, pinned: true }],
    [3, { id: 3, pinned: false }], [4, { id: 4, pinned: false }],
  ]);
  assert.deepEqual(closableTabIds({ tabOrder: [1, 2, 3, 4], tabsById, keepId: 3 }), [1, 4]);
});
