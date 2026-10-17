'use strict';
// A tab group header's right-click menu (spec 2026-10-16-island-lower-section §9.3).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const groupNameCase = require('../../src/main/group-name-case');
const { buildGroupContextMenu } = require('../../src/main/group-context-menu-model');

const t = (key) => ({ 'groupMenu.rename': 'Rename Group…', 'groupMenu.ungroup': 'Ungroup', 'groupMenu.close': 'Close Group' })[key];

test('the header menu offers Rename Group…, Ungroup and Close Group', () => {
  assert.deepEqual(buildGroupContextMenu(t), [
    { id: 'rename', label: 'Rename Group…' },
    { type: 'separator' },
    { id: 'ungroup', label: 'Ungroup' },
    { id: 'close-group', label: 'Close Group' },
  ]);
});

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

test('the panel and the rail record the right-clicked group header for main', () => {
  const overlay = read('src/renderer/overlay.js');
  assert.match(overlay, /window\.__blancCtxGroupId = /);
  assert.match(overlay, /CLOSED_SECTION_ID/, 'the Recently closed band has no group menu');
  assert.match(overlay, /window\.__blancCtxGroupId == null/, 'a recorded header keeps the native menu');
  const renderer = read('src/renderer/renderer.js');
  assert.match(renderer, /\.vertical-tabs-group-header\[data-group-id\]/);
  assert.match(renderer, /window\.__blancCtxGroupId == null/);
});

// main.js cannot be required under node --test; lift the shipped functions.
const mainSource = read('src/main/main.js');
const lift = (name) => mainSource.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
const sources = ['renameGroup', 'ungroupGroup'].map(lift);

test('renameGroup and ungroupGroup could be lifted from main.js', () => {
  assert.ok(sources.every(Boolean), 'a function was not found in main.js — update this test with it');
});

function harness(groups, tabList) {
  const runtime = { groups, tabOrder: tabList.map((tab) => tab.id) };
  const calls = [];
  const sandbox = {
    tabs: new Map(tabList.map((tab) => [tab.id, tab])),
    rt: () => runtime,
    crypto,
    pruneEmptyGroups: () => {
      runtime.groups = runtime.groups.filter((g) => [...sandbox.tabs.values()].some((tab) => tab.groupId === g.id));
    },
    broadcastTabs: () => calls.push('broadcast'),
    scheduleMenuRebuild: () => calls.push('menu'),
    ...groupNameCase,
  };
  vm.runInNewContext(`${sources.join('\n')}\nthis.fns = { renameGroup, ungroupGroup };`, sandbox);
  return { ...sandbox.fns, runtime, tabs: sandbox.tabs, calls };
}
const g = (id, name) => ({ id, name, collapsed: false });
// Results come from the sandbox's realm; compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));

test('a rename keeps case, trims and caps at 40', () => {
  const h = harness([g('a', 'Ios')], [{ id: 1, groupId: 'a' }]);
  assert.deepEqual(plain(h.renameGroup('a', '  iOS  ')), { ok: true });
  assert.equal(h.runtime.groups[0].name, 'iOS');
  h.renameGroup('a', 'x'.repeat(41));
  assert.equal(h.runtime.groups[0].name, 'x'.repeat(40));
  assert.deepEqual(h.calls.slice(0, 2), ['broadcast', 'menu']);
});

test('an empty or unchanged name changes nothing', () => {
  const h = harness([g('a', 'Work')], [{ id: 1, groupId: 'a' }]);
  assert.deepEqual(plain(h.renameGroup('a', '   ')), { ok: true });
  assert.deepEqual(plain(h.renameGroup('a', 'Work')), { ok: true });
  assert.equal(h.runtime.groups[0].name, 'Work');
  assert.deepEqual(h.calls, []);
});

test('a name another group in the window already has is refused', () => {
  const h = harness([g('a', 'Work'), g('b', 'Play')], [{ id: 1, groupId: 'a' }, { id: 2, groupId: 'b' }]);
  assert.deepEqual(plain(h.renameGroup('b', 'work')), { ok: false, error: 'duplicate' });
  assert.equal(h.runtime.groups[1].name, 'Play');
  assert.deepEqual(plain(h.renameGroup('zz', 'Anything')), { ok: false, error: 'unknown' });
});

test('Ungroup moves every member to the ungrouped tabs and the group goes away', () => {
  const h = harness([g('a', 'Work'), g('b', 'Play')], [{ id: 1, groupId: 'a' }, { id: 2, groupId: 'a' }, { id: 3, groupId: 'b' }]);
  h.ungroupGroup('a');
  assert.deepEqual([...h.tabs.values()].map((tab) => tab.groupId), [null, null, 'b']);
  assert.deepEqual(h.runtime.groups.map((group) => group.id), ['b']);
});
