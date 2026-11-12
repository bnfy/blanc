'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { emptySelection, selectTabs, pruneSelection, selectionRows } = require('../../src/main/tab-selection');
const list = [
  { id: 'a' }, { id: 'b', groupId: 'g' }, { id: 'c', groupId: 'g' },
  { id: 'd', splitId: 's' }, { id: 'e', splitId: 's' }, { id: 'f' },
];
const act = (state, id, mode, groups = []) => selectTabs(state, list, groups, 'a', id, mode);
test('toggle adds the current row, toggles another row off, and stays in tab order', () => {
  let s = act(emptySelection(), 'f', 'toggle'); assert.deepEqual(s.selectedTabIds, ['a', 'f']);
  s = act(s, 'b', 'toggle'); assert.deepEqual(s.selectedTabIds, ['a', 'b', 'f']);
  s = act(s, 'f', 'toggle'); assert.deepEqual(s.selectedTabIds, ['a', 'b']);
  assert.equal(s.selectionAnchorId, 'f');
});
test('range uses the last toggled anchor and skips folded groups', () => {
  let s = act(emptySelection(), 'b', 'toggle'); s = act(s, 'f', 'range');
  assert.deepEqual(s.selectedTabIds, ['a', 'b', 'c', 'd', 'e', 'f']);
  s = act(emptySelection(), 'f', 'range', [{ id: 'g', collapsed: true }]);
  assert.deepEqual(s.selectedTabIds, ['a', 'd', 'e', 'f']);
});
test('either pane selects the complete split, and arrows count it once', () => {
  let s = act(emptySelection(), 'e', 'toggle'); assert.deepEqual(s.selectedTabIds, ['a', 'd', 'e']);
  assert.deepEqual(selectionRows(list), [['a'], ['b'], ['c'], ['d', 'e'], ['f']]);
  s = act(emptySelection(), 'c', 'extend-down'); assert.equal(s.focusId, 'd');
  assert.deepEqual(s.selectedTabIds, ['a', 'b', 'c', 'd', 'e']);
});
test('plain close prunes a member; split creation or dissolution clears selection', () => {
  const s = act(emptySelection(), 'b', 'toggle');
  assert.deepEqual(pruneSelection(s, list.filter(tab => tab.id !== 'b')).selectedTabIds, ['a']);
  assert.deepEqual(pruneSelection(s, list.map(tab => tab.id === 'b' ? { ...tab, splitId: 'new' } : tab)).selectedTabIds, []);
  const split = act(emptySelection(), 'd', 'toggle');
  assert.deepEqual(pruneSelection(split, list.filter(tab => tab.id !== 'e')).selectedTabIds, []);
});
test('clear and stale rows are safe and never select a foreign tab', () => {
  const s = act(emptySelection(), 'b', 'toggle');
  assert.deepEqual(act(s, null, 'clear').selectedTabIds, []);
  assert.deepEqual(act(s, 'foreign', 'toggle').selectedTabIds, ['a', 'b']);
});

test('selection backgrounds meet 3:1 against each list background', () => {
  const { tokens } = require('../../tokens/tokens.json');
  const byName = Object.fromEntries(tokens.map(token => [token.name, token.values]));
  const luminance = hex => {
    const values = hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  for (const theme of ['light', 'dark', 'private']) {
    const a = luminance(byName['row-selected'][theme]), b = luminance(byName.bg[theme]);
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 3, theme);
  }
});
