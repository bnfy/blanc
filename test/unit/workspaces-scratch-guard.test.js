'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { harness, settle } = require('../support/workspace-ui-dom');
test('all-private decision omits Save First and survives outside dismissal', async () => {
  const h = harness({ openWorkspace: async () => ({ ok: false, error: 'unsaved-scratch', tabCount: 1, privateCount: 1, decision: 'token' }) }); h.ui.switchTo({ id: 'b', name: 'Other' }); await settle();
  assert.equal(h.button('Save this window first…'), undefined); assert.ok(h.button('Open in another window')); assert.equal(h.ui.close(), false); assert.equal(h.ui.opened, true);
});
test('Save First keeps the exact original action through validation and a remaining private decision', async () => {
  let saves = 0; const opens = []; const h = harness({
    openWorkspace: async (id, options) => { opens.push([id, options]); return { ok: false, error: 'unsaved-scratch', tabCount: opens.length === 1 ? 2 : 1, privateCount: 1, decision: 'token' }; },
    saveWorkspaceAs: async () => ({ ok: ++saves > 1, error: 'duplicate-name' }),
  });
  h.ui.switchTo({ id: 'target', name: 'Target' }); await settle(); h.button('Save this window first…').emit('click');
  const field = h.doc.getElementById('workspaceName'); field.value = 'Save first'; field.emit('input'); field.parent.emit('submit'); await settle();
  assert.match(h.text(), /already in use/); assert.equal(h.ui.state.original.action.id, 'target');
  h.doc.getElementById('workspaceName').parent.emit('submit'); await settle(); await settle(); assert.equal(h.ui.state.kind, 'decision'); assert.equal(opens[1][0], 'target'); assert.deepEqual(opens[1][1], {}); assert.equal(h.button('Save this window first…'), undefined);
});
