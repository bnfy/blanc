'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { runTabContextMenuItem } = require('../../src/main/tab-context-menu');

function spyActions() {
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  const names = ['copy', 'reload', 'duplicate', 'togglePin', 'toggleMute', 'toggleFavorite',
    'setGroup', 'beginNewGroup', 'glance', 'quiet', 'newTab', 'newPrivateTab',
    'closeOthers', 'moveToNewWindow', 'reopenClosed', 'close'];
  const actions = {};
  for (const n of names) actions[n] = rec(n);
  return { actions, calls };
}
const tab = { id: 7, url: 'https://a.test/p?utm_source=x' };

test('copy-link copies the tab url; copy-clean-link copies the cleaned url', () => {
  const { actions, calls } = spyActions();
  runTabContextMenuItem('copy-link', { tab, actions });
  runTabContextMenuItem('copy-clean-link', { tab, actions });
  assert.deepEqual(calls[0], ['copy', 'https://a.test/p?utm_source=x']);
  assert.equal(calls[1][0], 'copy');
  assert.equal(calls[1][1], 'https://a.test/p'); // utm stripped by cleanLink
});

test('simple items dispatch to their action with the tab id', () => {
  const cases = [
    ['reload', 'reload'], ['duplicate', 'duplicate'], ['toggle-pin', 'togglePin'],
    ['toggle-mute', 'toggleMute'], ['toggle-favorite', 'toggleFavorite'],
    ['glance', 'glance'], ['quiet', 'quiet'], ['close-others', 'closeOthers'],
    ['move-new-window', 'moveToNewWindow'], ['close', 'close'],
  ];
  for (const [id, fn] of cases) {
    const { actions, calls } = spyActions();
    runTabContextMenuItem(id, { tab, actions });
    assert.deepEqual(calls, [[fn, 7]], `${id} → ${fn}(7)`);
  }
});

test('new-tab / new-private-tab / reopen take no id', () => {
  for (const [id, fn] of [['new-tab', 'newTab'], ['new-private-tab', 'newPrivateTab'], ['reopen-closed', 'reopenClosed']]) {
    const { actions, calls } = spyActions();
    runTabContextMenuItem(id, { tab, actions });
    assert.deepEqual(calls, [[fn]]);
  }
});

test('group items: move uses raw groupId, none clears, new begins the handoff', () => {
  let s = spyActions();
  runTabContextMenuItem('group-move', { tab, groupId: 42, actions: s.actions });
  assert.deepEqual(s.calls, [['setGroup', 7, 42]]);
  s = spyActions();
  runTabContextMenuItem('group-none', { tab, actions: s.actions });
  assert.deepEqual(s.calls, [['setGroup', 7, null]]);
  s = spyActions();
  runTabContextMenuItem('group-new', { tab, actions: s.actions });
  assert.deepEqual(s.calls, [['beginNewGroup', 7]]);
});
