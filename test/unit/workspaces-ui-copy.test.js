'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { WORKSPACE_LIMIT, errors } = require('../../src/renderer/workspace-ui');
const { MAX_WORKSPACES } = require('../../src/main/workspaces-model');
const { harness, settle } = require('../support/workspace-ui-dom');

test('the switcher states the same workspace limit main enforces', () => {
  assert.equal(WORKSPACE_LIMIT, MAX_WORKSPACES);
  assert.equal(errors.limit, `You have ${MAX_WORKSPACES} workspaces. Delete one before adding another.`);
});

test('switch decisions pluralize private and unsaved tabs from the catalog', async () => {
  const message = async (tabCount, privateCount) => {
    const h = harness({ openWorkspace: async () => ({ ok: false, error: 'unsaved-scratch', tabCount, privateCount, decision: 'token' }) });
    h.ui.switchTo({ id: 'b', name: 'Other' }); await settle();
    const find = (node) => node.className === 'ws-switcher-confirm-msg' ? node : node.children.map(find).find(Boolean);
    return find(h.list).textContent;
  };
  assert.equal(await message(1, 1), '1 private tab will close. Page drafts are not saved to disk.');
  assert.equal(await message(3, 3), '3 private tabs will close. Page drafts are not saved to disk.');
  assert.equal(await message(1, 0), '1 unsaved tab will close. Page drafts are not saved to disk.');
  assert.equal(await message(2, 1), '2 unsaved tabs will close. Page drafts are not saved to disk.');
});

test('workspace rows name the workspace, its state and its tab count', () => {
  const h = harness({}, { items: [{ id: 'a', name: 'First', active: true, tabCount: 1 }, { id: 'b', name: 'Second', active: false, tabCount: 4 }] });
  h.ui.open();
  const titles = h.list.children.map((row) => row.children[0].title);
  assert.deepEqual(titles, ['First · Current workspace · 1 tab', 'Second · Open workspace · 4 tabs']);
});
