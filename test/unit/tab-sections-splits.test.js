'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const TabSections = require('../../src/renderer/tab-sections');

const t = (id, extra = {}) => ({ id, groupId: null, pinned: false, ...extra });

test('rowsOf collapses a split\'s consecutive tabs into one row', () => {
  const list = [t('a'), t('b', { splitId: 's' }), t('c', { splitId: 's' }), t('d')];
  assert.deepEqual(TabSections.rowsOf(['a', 'b', 'c', 'd'], list), [
    { kind: 'tab', id: 'a' },
    { kind: 'split', splitId: 's', tabIds: ['b', 'c'] },
    { kind: 'tab', id: 'd' },
  ]);
});

test('rowsOf keeps unrelated tabs as rows and ignores unknown ids', () => {
  const list = [t('a'), t('b')];
  assert.deepEqual(TabSections.rowsOf(['a', 'x', 'b'], list), [{ kind: 'tab', id: 'a' }, { kind: 'tab', id: 'b' }]);
  assert.deepEqual(TabSections.rowsOf(['b', 'a'], [t('a', { splitId: 's' }), t('b', { splitId: 's' })]), [
    { kind: 'split', splitId: 's', tabIds: ['b', 'a'] },
  ]);
});

test('numberedTabIds counts a split once, at its first tab', () => {
  const list = [t('a'), t('b', { splitId: 's' }), t('c', { splitId: 's' }), t('d')];
  assert.deepEqual(TabSections.numberedTabIds(list), ['a', 'b', 'd']);
  assert.deepEqual(TabSections.numberedTabIds([t('a'), t('b')]), ['a', 'b']);
});

test('itemsOf is unchanged by splitId', () => {
  const plain = [t('a'), t('b', { groupId: 'g' }), t('c')];
  const split = [t('a', { splitId: 's' }), t('b', { groupId: 'g' }), t('c', { splitId: 's' })];
  assert.deepEqual(TabSections.itemsOf(split), TabSections.itemsOf(plain));
});
