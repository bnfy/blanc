'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { harness, settle } = require('../support/workspace-ui-dom');
test('lapsed Patron cannot enter creation editors but can open existing workspaces', async () => {
  let opens = 0; const h = harness({ openWorkspace: async () => { opens++; return { ok: true }; } }, { patronActive: false });
  h.ui.begin('create'); assert.equal(h.ui.state.kind, 'list'); assert.ok(h.button('Patron settings'));
  h.ui.begin('save'); assert.equal(h.ui.state.kind, 'list'); h.ui.command('First'); await settle(); assert.equal(opens, 1);
});
test('active Patron reaches both editors and a new slash-command name is editable', () => {
  const h = harness(); h.ui.begin('create'); assert.equal(h.ui.state.kind, 'create'); h.ui.begin('save'); assert.equal(h.ui.state.kind, 'save'); h.ui.command('Fresh'); assert.equal(h.doc.getElementById('workspaceName').value, 'Fresh');
});
test('an empty switcher offers Patrons the Arc import, and only Patrons', () => {
  const patron = harness({}, { items: [] });
  patron.ui.open();
  patron.button('Import Spaces from Arc').emit('click');
  assert.deepEqual(patron.calls, [['page', 'tab-import']]);
  const lapsed = harness({}, { items: [], patronActive: false });
  lapsed.ui.open();
  assert.ok(lapsed.button('Patron settings'));
  assert.equal(lapsed.button('Import Spaces from Arc'), undefined);
  const existing = harness();
  existing.ui.open();
  assert.equal(existing.button('Import Spaces from Arc'), undefined);
});
