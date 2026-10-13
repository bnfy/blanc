'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { harness, settle } = require('../support/workspace-ui-dom');
const submit = (h) => h.doc.getElementById('workspaceEditor').emit('submit');
test('an all-private decision omits saving and survives an outside dismissal', async () => {
  const h = harness({ openWorkspace: async () => ({ ok: false, error: 'unsaved-scratch', tabCount: 1, privateCount: 1, decision: 'token' }) }); h.ui.switchTo({ id: 'b', name: 'Other' }); await settle();
  assert.equal(h.byKey('save-first'), undefined); assert.ok(h.button('Open in another window')); assert.equal(h.ui.close(), false); assert.equal(h.ui.opened, true);
});
test('saving first keeps the exact original action through validation and a remaining private decision', async () => {
  let saves = 0; const opens = []; const h = harness({
    openWorkspace: async (id, options) => { opens.push([id, options]); return { ok: false, error: 'unsaved-scratch', tabCount: opens.length === 1 ? 2 : 1, privateCount: 1, decision: 'token' }; },
    saveWorkspaceAs: async () => ({ ok: ++saves > 1, error: 'duplicate-name' }),
  });
  h.ui.switchTo({ id: 'target', name: 'Target' }); await settle(); h.byKey('save-first').click();
  const field = h.doc.getElementById('workspaceName'); field.value = 'Save first'; field.emit('input'); submit(h); await settle();
  assert.match(h.text(), /already in use/); assert.equal(h.ui.state.original.action.id, 'target');
  submit(h); await settle(); await settle(); assert.equal(h.ui.state.kind, 'decision'); assert.equal(opens[1][0], 'target'); assert.deepEqual(opens[1][1], {}); assert.equal(h.byKey('save-first'), undefined);
});
