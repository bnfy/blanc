'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_GROUP_NAME,
  normalizeGroupName,
  groupNameKey,
  sameGroupName,
  capitalizeFirst,
  recaseSessionData,
  recaseWorkspacesFile,
} = require('../../src/main/group-name-case');

test('normalizeGroupName trims, caps and keeps case', () => {
  assert.equal(MAX_GROUP_NAME, 40);
  assert.equal(normalizeGroupName('  Research '), 'Research');
  assert.equal(normalizeGroupName('x'.repeat(41)), 'x'.repeat(40));
  assert.equal(normalizeGroupName(null), '');
  assert.equal(normalizeGroupName(42), '42');
});

test('names compare without regard to case or edge spaces', () => {
  assert.equal(groupNameKey(' Work '), 'work');
  assert.equal(sameGroupName('Work', 'work '), true);
  assert.equal(sameGroupName('Work', 'Works'), false);
  assert.equal(sameGroupName('', ''), true);
});

test('capitalizeFirst raises only the first character', () => {
  assert.equal(capitalizeFirst('projects'), 'Projects');
  assert.equal(capitalizeFirst('éclair'), 'Éclair');
  assert.equal(capitalizeFirst('2fa'), '2fa');
  assert.equal(capitalizeFirst('iOS apps'), 'IOS apps');
  assert.equal(capitalizeFirst(''), '');
});

const group = (id, name) => ({ id, name, collapsed: false });

test('recaseSessionData capitalizes every window and the rollback mirror alike', () => {
  const data = {
    version: 2,
    windows: [
      { id: 'primary', groups: [group('g1', 'projects'), group('g2', 'tools')] },
      { id: 'w2', groups: [group('g3', 'shopping')] },
    ],
    groups: [group('g1', 'projects'), group('g2', 'tools')],
    urls: [], activeIndex: 0, groupIds: [], pinned: [],
  };
  const { data: next, changed } = recaseSessionData(data);
  assert.equal(changed, true);
  assert.deepEqual(next.windows[0].groups.map((g) => g.name), ['Projects', 'Tools']);
  assert.deepEqual(next.windows[1].groups.map((g) => g.name), ['Shopping']);
  assert.deepEqual(next.groups, next.windows[0].groups, 'the loader compares the mirror with the focused window');
  assert.equal(data.windows[0].groups[0].name, 'projects', 'the input is not mutated');
});

test('recaseSessionData leaves a future format and an already-cased file alone', () => {
  const future = { version: 3, windows: [{ groups: [group('g', 'projects')] }] };
  assert.deepEqual(recaseSessionData(future), { data: future, changed: false });
  const cased = { version: 2, windows: [{ groups: [group('g', 'Projects')] }], groups: [group('g', 'Projects')] };
  assert.equal(recaseSessionData(cased).changed, false);
  assert.equal(recaseSessionData(null).changed, false);
});

test('recaseWorkspacesFile covers every Space and the recently deleted', () => {
  const file = {
    version: 2,
    workspaces: [{ id: 'ws1', groups: [group('g1', 'work')] }, { id: 'ws2', groups: [] }],
    deleted: [{ workspace: { id: 'ws3', groups: [group('g2', 'reading')] }, index: 0, deletedAt: 1 }],
  };
  const { file: next, changed } = recaseWorkspacesFile(file);
  assert.equal(changed, true);
  assert.equal(next.workspaces[0].groups[0].name, 'Work');
  assert.equal(next.deleted[0].workspace.groups[0].name, 'Reading');
  assert.equal(file.workspaces[0].groups[0].name, 'work', 'the input is not mutated');
});

test('the pass only touches names saved all lowercase, so a lost stamp is harmless', () => {
  const data = {
    version: 2,
    windows: [{ id: 'primary', groups: [group('a', 'projects'), group('b', 'iOS'), group('c', 'eBay'), group('d', 'Work')] }],
    groups: [group('a', 'projects'), group('b', 'iOS'), group('c', 'eBay'), group('d', 'Work')],
  };
  const { data: next } = recaseSessionData(data);
  assert.deepEqual(next.windows[0].groups.map((g) => g.name), ['Projects', 'iOS', 'eBay', 'Work']);
  const { file } = recaseWorkspacesFile({ version: 2, workspaces: [{ id: 'ws', groups: [group('x', 'macOS'), group('y', 'reading')] }], deleted: [] });
  assert.deepEqual(file.workspaces[0].groups.map((g) => g.name), ['macOS', 'Reading']);
});
