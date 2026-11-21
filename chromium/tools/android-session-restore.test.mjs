// The session check (tests/android/session-restore.mjs) reads the grid's selected card and fails
// on each part of the session that didn't come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import {activeCard, sessionProblems} from '../tests/android/session-restore.mjs';

const whole = {cards: 4, group: true, sky: true, pinned: true, muted: true, active: true, island: 'Switch to About us', privateTabs: false, undo: false};

test('the selected card is the active tab', () => {
  const xml = '<node content-desc="Switch to New Tab" selected="false" /><node selected="true" content-desc="Switch to About us" />';
  assert.equal(activeCard(xml), 'Switch to About us');
  assert.equal(activeCard('<node content-desc="Switch to New Tab" selected="false" />'), null);
});

test('a whole session passes and each lost part fails', () => {
  assert.deepEqual(sessionProblems(whole), []);
  for (const [field, value] of [['cards', 3], ['group', false], ['sky', false], ['pinned', false], ['muted', false],
    ['active', false], ['privateTabs', true], ['undo', true]]) {
    assert.equal(sessionProblems({...whole, [field]: value}).length, 1, field);
  }
});
