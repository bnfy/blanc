'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildSplitEntry, projectEntries } = require('../../src/main/closed-tabs');

const member = (url, extra = {}) => ({ url, title: url, favicon: null, pinned: false, muted: false, ...extra });

test('buildSplitEntry drops private members, keeps order, layout and focusedIndex', () => {
  const entry = buildSplitEntry({
    layout: { kind: 'columns', widths: [0.6, 0.4] },
    focusedIndex: 1,
    index: 3,
    groupId: 'g1',
  }, [member('https://a.test/'), member('https://p.test/', { private: true }), member('https://b.test/', { snapshot: { entries: [], index: 0 } })], 42);
  assert.equal(entry.kind, 'split');
  assert.equal(entry.closedAt, 42);
  assert.deepEqual(entry.tabs.map((t) => t.url), ['https://a.test/', 'https://b.test/']);
  assert.deepEqual(entry.split, { layout: { kind: 'columns', widths: [0.6, 0.4] }, focusedIndex: 1, index: 3, groupId: 'g1' });
  assert.deepEqual(entry.tabs[1].snapshot, { entries: [], index: 0 });
  assert.equal('private' in entry.tabs[0], false);
});

test('projectEntries shows a split entry as one row named by its titles', () => {
  const entry = buildSplitEntry({ layout: null, focusedIndex: 0, index: 0, groupId: null },
    [member('https://a.test/', { title: 'Docs' }), member('https://b.test/', { title: 'Preview', customTitle: 'Mine' })], 1);
  const [row] = projectEntries([entry]);
  assert.equal(row.title, 'Docs + Mine');
  assert.equal(row.tabCount, 2);
  assert.equal(row.favicon, null);
});
