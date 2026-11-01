'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planTabEdits, runPerTab } = require('../../src/main/tabs-batch');
const { buildTabsContextMenu } = require('../../src/main/tab-context-menu-model');
const { buildBatchEntry } = require('../../src/main/closed-tabs');
const { englishT } = require('../support/english-t');
const members = [{ id: 'a', url: 'https://a.test/', groupId: 'g', pinned: false, muted: false, canQuiet: false, canReload: true },
  { id: 'b', url: 'https://b.test/', groupId: 'g', pinned: true, muted: true, canQuiet: true, canReload: true }];
test('menu contains only batch actions; all-tabs eligibility differs from per-tab actions', () => {
  const menu = buildTabsContextMenu({ members, groups: [{ id: 'g', name: 'Group' }], spaces: [{ id: 's', name: 'Space' }], canPlace: false, t: englishT });
  assert.equal(menu[0].label, '2 tabs');
  assert.equal(menu.find(item => item.id === 'batch-space').enabled, false);
  assert.equal(menu.find(item => item.id === 'batch-new-window').enabled, false);
  assert.equal(menu.find(item => item.id === 'batch-quiet').enabled, true);
  assert.equal(menu.some(item => /duplicate|favorite|rename|split-with/.test(item.id ?? '')), false);
});
test('pin, mute and group plans change no live state while computing the complete result', () => {
  const original = structuredClone(members);
  for (const action of ['pin', 'mute', 'group']) {
    const plan = planTabEdits(members, ['a', 'b'], action, { groupId: 'new', pinnedHome: tab => tab.url });
    assert.equal(plan.patches.length, 2); assert.deepEqual(members, original);
  }
  assert.equal(planTabEdits(members, ['a', 'foreign'], 'pin'), null);
});
test('failure computing the second patch exposes no partial change', () => {
  let calls = 0; const original = structuredClone(members);
  assert.throws(() => planTabEdits(members, ['a', 'b'], 'pin', { pinnedHome: () => { if (++calls === 2) throw new Error('fault'); return ''; } }));
  assert.deepEqual(members, original);
});
test('quiet/reload retain exactly members that failed after the first success', async () => {
  assert.deepEqual(await runPerTab(['a', 'b', 'c'], id => { if (id === 'b') throw new Error('fault'); return true; }), { done: ['a', 'c'], remaining: ['b'] });
});
test('a closed batch preserves complete splits and drops a partially closed split', () => {
  const tabs = [{ id: 'a', url: 'https://a.test/' }, { id: 'b', url: 'https://b.test/' }, { id: 'c', url: 'https://c.test/' }];
  const splits = [{ id: 's', tabIds: ['a', 'b'], focusedIndex: 1, layout: { kind: 'columns', widths: [0.4, 0.6] } }];
  const entry = buildBatchEntry(tabs, 10, splits);
  assert.deepEqual(entry.splitIds, ['s', 's', null]); assert.equal(entry.splits[0].focusedIndex, 1);
  assert.equal(buildBatchEntry(tabs.filter(t => t.id !== 'b'), 10, splits).splits, undefined);
});

test('a mixed private selection disables Move to Space instead of moving a subset', () => {
  const menu = buildTabsContextMenu({ members: [{ ...members[0], private: true }, members[1]], spaces: [{ id: 's', name: 'Space' }], canPlace: false, t: englishT });
  assert.equal(menu.find(item => item.id === 'batch-space').enabled, false);
});

test('Remove from Group lands the tabs directly below the group they left, as for one tab', () => {
  const tab = (id, groupId) => ({ id, groupId, pinned: false });
  const list = [tab('a', 'G'), tab('b', 'G'), tab('c', 'G'), tab('x', null), tab('y', 'H'), tab('z', 'H')];
  const order = ids => planTabEdits(list, ids, 'group', { groupId: null }).order;
  assert.deepEqual(order(['a', 'b']), ['c', 'a', 'b', 'x', 'y', 'z']);
  // From two groups at once: each set lands below its own group.
  assert.deepEqual(order(['a', 'y']), ['b', 'c', 'a', 'x', 'z', 'y']);
  // A group they empty leaves them in place; an ungrouped selected tab stays put.
  assert.deepEqual(order(['y', 'z', 'x']), ['a', 'b', 'c', 'x', 'y', 'z']);
});
