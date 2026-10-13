'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { harness, settle } = require('../support/workspace-ui-dom');
const submit = (h) => h.doc.getElementById('workspaceEditor').emit('submit');
test('the new-space editor focuses a connected name field after opening', () => {
  const h = harness(); h.ui.begin('new'); assert.equal(h.doc.activeElement.id, 'workspaceName'); assert.equal(h.doc.activeElement.isConnected, true);
});
test('a rejected save keeps the typed name, its selection and focus', async () => {
  const h = harness({ saveWorkspaceAs: async () => ({ ok: false, error: 'duplicate-name' }) }, { items: [] }); h.ui.begin('new');
  const field = h.doc.getElementById('workspaceName'); field.value = 'Second'; field.emit('input'); field.setSelectionRange(2, 4);
  submit(h); await settle();
  assert.equal(h.doc.getElementById('workspaceName').value, 'Second'); assert.equal(h.doc.activeElement.id, 'workspaceName');
  assert.equal(h.doc.activeElement.selectionStart, 2); assert.equal(h.doc.activeElement.selectionEnd, 4); assert.equal(h.doc.activeElement.attrs['aria-invalid'], 'true'); assert.match(h.text(), /already in use/);
});
test('a broadcast keeps the editor value and does not steal address focus', () => {
  const h = harness(); h.ui.begin('new'); const field = h.doc.getElementById('workspaceName'); field.value = 'In progress'; field.emit('input'); h.trigger.focus();
  h.ui.apply({ items: [], deleted: [], status: 'pending' }); assert.equal(h.doc.activeElement, h.trigger); assert.equal(h.doc.getElementById('workspaceName').value, 'In progress');
});
test('IME Enter never submits and a pending write rejects a second submission', async () => {
  let resolve; let calls = 0; const h = harness({ saveWorkspaceAs: () => { calls++; return new Promise((r) => { resolve = r; }); } }, { items: [] }); h.ui.begin('new'); let prevented = false;
  const field = h.doc.getElementById('workspaceName'); field.value = 'Name'; field.emit('input');
  field.emit('keydown', { key: 'Enter', isComposing: true, preventDefault() { prevented = true; } }); assert.equal(prevented, true); assert.equal(calls, 0);
  submit(h); submit(h); assert.equal(calls, 1); resolve({ ok: true }); await settle();
});
test('the menu height is bounded and closing returns focus to its invoker', () => {
  const h = harness(); h.ui.open(); assert.equal(h.popup.props['--ws-max-height'], '584px'); h.ui.cancel(); assert.equal(h.doc.activeElement, h.trigger);
});
test('a saved space with a failed binding returns to the list instead of inviting a duplicate retry', async () => {
  const h = harness({ saveWorkspaceAs: async () => ({
    ok: false, error: 'saved-not-opened', cause: 'storage-failed', workspaceId: 'saved',
    items: [
      { id: 'a', name: 'First', active: true, tabCount: 1, color: '#426c4c', symbol: 'briefcase' },
      { id: 'saved', name: 'Saved copy', active: false, tabCount: 1, color: '#376694', symbol: 'house' },
    ],
    deleted: [], status: 'saved',
  }) }, { items: [] });
  h.ui.begin('new'); const field = h.doc.getElementById('workspaceName'); field.value = 'Saved copy'; field.emit('input'); submit(h); await settle();
  assert.equal(h.ui.state.kind, 'list'); assert.equal(h.doc.getElementById('workspaceName').isConnected, false);
  assert.match(h.text(), /Saved copy/); assert.match(h.text(), /was saved, but Blanc couldn’t open it/);
});
