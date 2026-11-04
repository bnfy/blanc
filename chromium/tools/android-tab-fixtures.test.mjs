// Blanc for Android's tab rules (A2 Task 2) are checked against desktop's own
// code: tools/android-tab-fixtures.mjs runs v1.46.0's tab-sections.js and
// group-name-case.js over generated inputs and writes Java fixtures, which must
// be current.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tabLists, groupNameInputs, encodeList} from './android-tab-fixtures.mjs';

test('the inputs are deterministic and cover pins, groups and runs', () => {
  const lists = tabLists(300);
  assert.deepEqual(lists, tabLists(300));
  assert.ok(lists.some(l => l.some(t => t.pinned && !t.groupId)), 'an ungrouped pin');
  assert.ok(lists.some(l => l.some(t => t.pinned && t.groupId)), 'a grouped pin');
  assert.ok(lists.some(l => l.length === 0), 'an empty list');
  assert.equal(encodeList([{id: 't1', groupId: 'g1', pinned: true}, {id: 't2', groupId: null, pinned: false}]), 't1:g1:p,t2::');
});

test('group names cover case, whitespace, length and Unicode', () => {
  const names = groupNameInputs();
  for (const must of ['Research', 'research', '  padded ', 'x'.repeat(41), 'İstanbul', 'ΣΟΦΟΣ', '😀'.repeat(21)])
    assert.ok(names.includes(must), must);
});

test('the committed fixtures are current', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./android-tab-fixtures.mjs', import.meta.url)), '--check'], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
});
