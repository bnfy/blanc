'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const groupNameCase = require('../../src/main/group-name-case');

// main.js cannot be required under node --test; lift the shipped functions.
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const lift = (name) => mainSource.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
const sources = ['groupTabByName', 'reopenGroupEntry'].map(lift);

test('groupTabByName and reopenGroupEntry could be lifted from main.js', () => {
  assert.ok(sources[0], 'groupTabByName not found in main.js — update this test with it');
  assert.ok(sources[1], 'reopenGroupEntry not found in main.js — update this test with it');
});

function harness(groups = []) {
  const runtime = { groups };
  const sandbox = {
    tabs: new Map(['t1', 't2', 't3'].map((id) => [id, { id, groupId: null }])),
    rt: () => runtime,
    crypto,
    pruneEmptyGroups: () => {},
    broadcastTabs: () => {},
    scheduleMenuRebuild: () => {},
    ...groupNameCase,
  };
  vm.runInNewContext(`${sources[0]}\nthis.groupTabByName = groupTabByName;`, sandbox);
  return { groupTabByName: sandbox.groupTabByName, runtime, tabs: sandbox.tabs };
}

test('a new group keeps the case typed', () => {
  const h = harness();
  h.groupTabByName('t1', '  Research ');
  assert.deepEqual(h.runtime.groups.map((g) => g.name), ['Research']);
});

test('a differently cased name joins the existing group', () => {
  const h = harness([{ id: 'g', name: 'Research', collapsed: false }]);
  h.groupTabByName('t1', 'research');
  assert.equal(h.runtime.groups.length, 1);
  assert.equal(h.tabs.get('t1').groupId, 'g');
  assert.equal(h.runtime.groups[0].name, 'Research', 'without adoptCase the name is left alone');
});

test('/group adopts the capitals just typed', () => {
  const h = harness([{ id: 'g', name: 'tools', collapsed: false }]);
  h.groupTabByName('t1', 'Tools', { adoptCase: true });
  assert.equal(h.runtime.groups[0].name, 'Tools');
  assert.equal(h.tabs.get('t1').groupId, 'g');
});

test('reopening a closed tab recorded under "work" rejoins "Work" without re-casing it', () => {
  const h = harness([{ id: 'g', name: 'Work', collapsed: false }]);
  h.groupTabByName('t2', 'work');
  assert.equal(h.runtime.groups[0].name, 'Work');
  assert.equal(h.tabs.get('t2').groupId, 'g');
});

test('a reopened closed group joins a group with the same name in any case', () => {
  assert.match(sources[1], /sameGroupName\(g\.name, entry\.group\.name\)/);
});
