'use strict';

// Mini Window: Move to Space (#1734, spec 2026-11-25). Opened from a mini
// window, the Spaces menu moves the window's tabs: it says so, lists only this
// profile's Spaces, offers no editing, and New space… makes one with them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { harness, settle } = require('../support/workspace-ui-dom');

const ITEMS = [
  { id: 'a', name: 'Reading', active: false, tabCount: 3, color: '#426c4c', symbol: 'briefcase' },
  { id: 'b', name: 'Later', active: false, tabCount: 1, color: '#974f2a', symbol: 'house' },
];
const WORK = { id: 'w', name: 'Work', status: 'saved', full: false, items: [
  { id: 'w1', name: 'Sprint', tabCount: 5, color: '#376694', symbol: 'code', openElsewhere: false },
] };
const payload = { items: ITEMS, profileName: 'Personal', otherProfiles: [WORK], deleted: [{ id: 'z', name: 'Old' }], windowTabCount: 2 };
const rows = (h) => h.list.children.filter((n) => n.className.includes('ws-row'));
const typeName = (h, name) => { const input = h.doc.getElementById('workspaceName'); input.value = name; input.emit('input', { target: input }); };

test('move mode says what it does and lists only this profile\'s Spaces', () => {
  const h = harness({}, payload); h.ui.setMoveMode(true); h.ui.open();
  assert.equal(h.list.children[0].textContent, 'Move this window to…');
  assert.deepEqual(rows(h).map((r) => r.dataset.workspaceId), ['a', 'b']);
  assert.equal(h.list.children.filter((n) => n.className === 'ws-profile-heading').length, 1, 'only the move heading');
  assert.equal(h.byKey('edit:a'), undefined, 'no ••• editor');
  assert.equal(h.byKey('recently-deleted'), undefined);
  assert.ok(h.byKey('new'), 'New space… stays');
});

test('move mode rows neither reorder nor edit; a click moves there', async () => {
  const calls = [];
  const h = harness({ openWorkspace: async (...args) => { calls.push(args); return { ok: true }; } }, payload);
  h.ui.setMoveMode(true); h.ui.open();
  const main = rows(h)[0].children[0];
  assert.equal(rows(h)[0].children.length, 1);
  main.emit('keydown', { altKey: true, key: 'ArrowDown' });
  main.emit('pointerdown', { pointerId: 1, clientY: 10 });
  assert.ok(!h.calls.some(([kind]) => kind === 'move'), 'no reorder');
  main.click(); await settle();
  assert.deepEqual(calls, [['a', {}]]);
});

test('New space… in move mode makes the Space with the window\'s tabs, never save-as', async () => {
  const calls = [];
  const h = harness({
    createBlankWorkspace: async (...args) => { calls.push(['blank', ...args]); return { ok: true }; },
    saveWorkspaceAs: async (...args) => { calls.push(['save-as', ...args]); return { ok: true }; },
  }, payload);
  h.ui.setMoveMode(true); h.ui.open(); h.byKey('new').click();
  assert.ok(!h.doc.getElementById('workspaceProfile'), 'no Profile choice');
  assert.equal(h.byKey('start:window'), undefined, 'no start choice');
  assert.match(h.text(), /With these tabs/);
  typeName(h, 'Trip'); h.doc.getElementById('workspaceEditor').emit('submit'); await settle();
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0][0], calls[0][1], calls[0][2].profileId], ['blank', 'Trip', undefined]);
});

test('turning move mode off brings the ordinary menu back', () => {
  const h = harness({}, payload); h.ui.setMoveMode(true); h.ui.setMoveMode(false); h.ui.open();
  assert.notEqual(h.list.children[0].textContent, 'Move this window to…');
  assert.ok(h.byKey('edit:a'));
});

test('the overlay turns move mode on in a mini window and opens New space… from the File menu', () => {
  const overlay = fs.readFileSync(path.join(__dirname, '../../src/renderer/overlay.js'), 'utf8');
  assert.equal(overlay.match(/workspaceUI\.setMoveMode\(payload\.miniWindow === true\);/g)?.length, 2);
  assert.match(overlay, /purpose\?\.miniNewSpace\) \{[\s\S]*?workspaceUI\.begin\('new', null, \{ start: 'mini', thisProfile: true,/);
});
