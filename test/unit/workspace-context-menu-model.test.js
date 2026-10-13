'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWorkspaceContextMenu } = require('../../src/main/workspace-context-menu-model');
const { runWorkspaceContextMenuItem } = require('../../src/main/workspace-context-menu');

test('a space row offers Edit… and Delete', () => {
  assert.deepEqual(buildWorkspaceContextMenu({ id: 'a' }, (key) => key),
    [{ id: 'edit', label: 'workspaceMenu.edit' }, { id: 'delete', label: 'workspaceMenu.delete' }]);
});
test('each item runs its action with the row\'s space', () => {
  const calls = [];
  const actions = { edit: (id) => calls.push(['edit', id]), remove: (id) => calls.push(['delete', id]) };
  runWorkspaceContextMenuItem('edit', { workspace: { id: 'a' }, actions });
  runWorkspaceContextMenuItem('delete', { workspace: { id: 'a' }, actions });
  assert.deepEqual(calls, [['edit', 'a'], ['delete', 'a']]);
});
