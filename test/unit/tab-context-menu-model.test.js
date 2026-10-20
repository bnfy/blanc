'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildTabContextMenu, closableTabIds, closableBeside } = require('../../src/main/tab-context-menu-model');
const { englishT } = require('../support/english-t');

const baseTab = {
  id: 1, url: 'https://example.com/p?utm_source=x', title: 'Example',
  pinned: false, muted: false, private: false, asleep: false,
  bookmarked: false, groupId: null, capturing: false,
};
const build = (over = {}) => buildTabContextMenu({
  tab: { ...baseTab, ...(over.tab || {}) },
  groups: over.groups ?? [],
  activeTabId: over.activeTabId ?? 1,
  glanceTabId: over.glanceTabId ?? null,
  surface: over.surface ?? 'row',
  canCloseOthers: over.canCloseOthers ?? true,
  canMoveToNewWindow: over.canMoveToNewWindow ?? true,
  canQuiet: over.canQuiet ?? true,
  canCloseAbove: over.canCloseAbove ?? true,
  canCloseBelow: over.canCloseBelow ?? true,
  siteMuted: over.siteMuted === undefined ? false : over.siteMuted,
  splitCandidates: over.splitCandidates ?? [],
  t: englishT,
});
const ids = (items) => items.filter((i) => i.id).map((i) => i.id);
const byId = (items, id) => items.find((i) => i.id === id);

test('core items present, in order, for a row on a non-active tab', () => {
  const m = build({ activeTabId: 2, surface: 'row' });
  assert.deepEqual(ids(m), [
    'copy-link', 'copy-clean-link', 'reload', 'duplicate', 'rename',
    'toggle-pin', 'toggle-mute', 'toggle-site-mute', 'toggle-favorite', 'group', 'split-with',
    'glance', 'quiet', 'new-tab-below', 'new-tab', 'new-private-tab',
    'close-others', 'close-above', 'close-below', 'move-new-window', 'reopen-closed', 'close',
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

test('pinned-home commands appear directly after pin and mirror main eligibility', () => {
  const unpinned = build();
  assert.equal(byId(unpinned, 'return-pinned-home'), undefined);
  assert.equal(byId(unpinned, 'set-pinned-home'), undefined);

  const pinned = build({
    tab: { pinned: true, pinnedHome: { canReturn: true, canSet: false } },
  });
  const itemIds = ids(pinned);
  const pinIndex = itemIds.indexOf('toggle-pin');
  assert.deepEqual(itemIds.slice(pinIndex, pinIndex + 3), [
    'toggle-pin', 'return-pinned-home', 'set-pinned-home',
  ]);
  assert.equal(byId(pinned, 'return-pinned-home').enabled, true);
  assert.equal(byId(pinned, 'set-pinned-home').enabled, false);
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

test('quiet enabled state comes from the injected canQuiet predicate', () => {
  // main computes canQuiet with the sweep's full sleepCandidates policy
  // (pinned, audible, opener families, glance, permission-pending, …) minus
  // the idle threshold — the model just renders the verdict.
  assert.equal(byId(build({ activeTabId: 2, canQuiet: false }), 'quiet').enabled, false);
  assert.equal(byId(build({ activeTabId: 2, canQuiet: true }), 'quiet').enabled, true);
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
  for (const m of [build(), build({ tab: { url: 'https://example.com/plain' } }), build({ tab: { customTitle: 'Budget' } })]) {
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

test('Rename Tab… is always offered; Reset Tab Title only on a renamed tab', () => {
  assert.equal(byId(build(), 'rename').label, 'Rename Tab…');
  assert.equal(byId(build(), 'reset-title'), undefined);
  const renamed = build({ tab: { customTitle: 'Budget' } });
  assert.equal(byId(renamed, 'reset-title').label, 'Reset Tab Title');
  assert.deepEqual(ids(renamed).slice(3, 6), ['duplicate', 'rename', 'reset-title']);
});

test('the current Glance reference offers Close Glance instead of Open in Glance', () => {
  const reference = build({ activeTabId: 2, surface: 'row', glanceTabId: 1 });
  assert.equal(byId(reference, 'glance'), undefined);
  assert.equal(byId(reference, 'close-glance').label, 'Close Glance');
  const other = build({ activeTabId: 2, surface: 'row', glanceTabId: 3 });
  assert.equal(byId(other, 'glance').label, 'Open in Glance');
  assert.equal(byId(other, 'close-glance'), undefined);
});

// Tab menu additions (spec 2026-10-17-tab-menu-additions-design.md).
test('the menu offers New Tab Below first in the new-tab section', () => {
  const m = build();
  const at = m.findIndex((i) => i.id === 'new-tab-below');
  assert.equal(m[at - 1].type, 'separator');
  assert.equal(m[at + 1].id, 'new-tab');
  assert.equal(byId(m, 'new-tab-below').label, 'New Tab Below');
});

test('Close Tabs Above and Below sit after Close Other Tabs and follow their enabled state', () => {
  const m = build({ canCloseAbove: false, canCloseBelow: true });
  assert.equal(byId(m, 'close-above').label, 'Close Tabs Above');
  assert.equal(byId(m, 'close-above').enabled, false);
  assert.equal(byId(m, 'close-below').enabled, true);
});

test('nothing to close disables the item', () => {
  assert.equal(byId(build({ canCloseBelow: false }), 'close-below').enabled, false);
});

test('the site-mute label follows the site\'s state and hides for non-web tabs', () => {
  assert.equal(byId(build({ siteMuted: false }), 'toggle-site-mute').label, 'Mute Site');
  assert.equal(byId(build({ siteMuted: true }), 'toggle-site-mute').label, 'Unmute Site');
  assert.equal(byId(build({ siteMuted: null }), 'toggle-site-mute'), undefined);
});

test('closableBeside skips pins and the kept tab', () => {
  const tabsById = new Map([['p', { pinned: true }], ['a', {}], ['k', {}], ['b', {}], ['q', { pinned: true }], ['c', {}]]);
  const tabOrder = ['p', 'a', 'k', 'b', 'q', 'c'];
  assert.deepEqual(closableBeside({ tabOrder, tabsById, keepId: 'k', direction: 'above' }), ['a']);
  assert.deepEqual(closableBeside({ tabOrder, tabsById, keepId: 'k', direction: 'below' }), ['b', 'c']);
  assert.deepEqual(closableBeside({ tabOrder, tabsById, keepId: 'c', direction: 'below' }), []);
});

// Split View (F53), spec §3.1 and §3.5.
test('menu: Split with lists eligible tabs only, each carrying its tab id', () => {
  const m = build({ splitCandidates: [{ id: 2, title: 'Docs' }, { id: 3, title: 'Preview', groupNote: 'Moves Preview out of Read' }] });
  const item = byId(m, 'split-with');
  assert.equal(item.label, 'Split with');
  assert.notEqual(item.enabled, false);
  assert.deepEqual(item.submenu.map((i) => [i.id, i.label, i.tabId]), [['split-with-tab', 'Docs', 2], ['split-with-tab', 'Preview', 3]]);
  assert.equal(item.submenu[1].sublabel, 'Moves Preview out of Read');
});

test('menu: Split with is disabled with no other tab to split with', () => {
  assert.equal(byId(build(), 'split-with').enabled, false);
});

test('menu: Split with is disabled for a pinned tab, with the reason', () => {
  const item = byId(build({ tab: { pinned: true }, splitCandidates: [{ id: 2, title: 'Docs' }] }), 'split-with');
  assert.deepEqual(item.submenu.map((i) => [i.label, i.enabled]), [["Pinned tabs can't join a split", false]]);
});

test('menu: a split tab offers Remove from Split and Close Split instead', () => {
  const m = build({ tab: { splitId: 'split-1' }, splitCandidates: [{ id: 2, title: 'Docs' }] });
  assert.equal(byId(m, 'split-with'), undefined);
  assert.equal(byId(m, 'remove-from-split').label, 'Remove from Split');
  assert.equal(byId(m, 'close-split').label, 'Close Split');
  const order = ids(m);
  assert.equal(order.indexOf('remove-from-split'), order.indexOf('group') + 1);
});
