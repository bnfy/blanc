'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { harness, settle } = require('../support/workspace-ui-dom');
test('create editor focuses a connected field after opening', () => {
  const h = harness(); h.ui.begin('create'); assert.equal(h.doc.activeElement.id, 'workspaceName'); assert.equal(h.doc.activeElement.isConnected, true);
});
test('rename validation preserves value, selection and focus through a rejected save', async () => {
  const h = harness({ renameWorkspace: async () => ({ ok: false, error: 'duplicate-name' }) }); h.ui.begin('rename', { id: 'a', name: 'First' });
  const field = h.doc.getElementById('workspaceName'); field.value = 'Second'; field.emit('input'); field.setSelectionRange(2, 4);
  field.parent.emit('submit'); await settle();
  assert.equal(h.doc.getElementById('workspaceName').value, 'Second'); assert.equal(h.doc.activeElement.id, 'workspaceName');
  assert.equal(h.doc.activeElement.selectionStart, 2); assert.equal(h.doc.activeElement.selectionEnd, 4); assert.equal(h.doc.activeElement.attrs['aria-invalid'], 'true'); assert.match(h.text(), /already in use/);
});
test('broadcast preserves editor value and does not steal address focus', () => {
  const h = harness(); h.ui.begin('save'); const field = h.doc.getElementById('workspaceName'); field.value = 'In progress'; field.emit('input'); h.trigger.focus();
  h.ui.apply({ items: [], deleted: [], patronActive: true, status: 'pending' }); assert.equal(h.doc.activeElement, h.trigger); assert.equal(h.doc.getElementById('workspaceName').value, 'In progress');
});
test('IME Enter prevents native form submission and pending writes reject duplicate submissions', async () => {
  let resolve; let calls = 0; const h = harness({ saveWorkspaceAs: () => { calls++; return new Promise((r) => { resolve = r; }); } }); h.ui.begin('save'); let prevented = false;
  h.doc.getElementById('workspaceName').emit('keydown', { key: 'Enter', isComposing: true, preventDefault() { prevented = true; } }); assert.equal(prevented, true); assert.equal(calls, 0);
  h.doc.getElementById('workspaceName').parent.emit('submit'); h.doc.getElementById('workspaceName').parent.emit('submit'); assert.equal(calls, 1); resolve({ ok: true }); await settle();
});
test('popover bounds are constrained and closing returns focus to its invoker', () => {
  const h = harness(); h.ui.open(); assert.equal(h.popup.style.maxHeight, '584px'); h.ui.cancel(); assert.equal(h.doc.activeElement, h.trigger);
});
test('failed editor remains visible while the address field is used; explicit cancel dismisses it', async () => {
  const h = harness({ renameWorkspace: async () => ({ ok: false, error: 'duplicate-name' }) }); h.ui.begin('rename', { id: 'a', name: 'First' });
  h.doc.getElementById('workspaceName').parent.emit('submit'); await settle(); h.trigger.focus(); h.ui.close(); assert.equal(h.ui.opened, true); assert.match(h.text(), /already in use/);
  h.ui.cancel(); assert.equal(h.ui.state.kind, 'list');
});
test('a saved workspace with a failed binding returns to the list instead of inviting a duplicate retry', async () => {
  const h = harness({ saveWorkspaceAs: async () => ({
    ok: false,
    error: 'saved-not-opened',
    cause: 'storage-failed',
    workspaceId: 'saved',
    items: [
      { id: 'a', name: 'First', active: true, tabCount: 1 },
      { id: 'saved', name: 'Saved copy', active: false, tabCount: 1 },
    ],
    deleted: [],
    status: 'saved',
    patronActive: true,
  }) });
  h.ui.begin('save'); const field = h.doc.getElementById('workspaceName'); field.value = 'Saved copy'; field.emit('input'); field.parent.emit('submit'); await settle();
  assert.equal(h.ui.state.kind, 'list'); assert.equal(h.doc.getElementById('workspaceName').isConnected, false);
  assert.match(h.text(), /Saved copy/); assert.match(h.text(), /was saved, but Blanc couldn’t open it/);
});
