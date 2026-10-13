'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { harness, settle } = require('../support/workspace-ui-dom');
test('anyone reaches both creation editors, and no Patron path remains', () => {
  const h = harness();
  h.ui.begin('create'); assert.equal(h.ui.state.kind, 'create'); h.ui.cancel();
  h.ui.begin('save'); assert.equal(h.ui.state.kind, 'save'); h.ui.cancel();
  h.ui.open();
  assert.equal(h.button('Patron settings'), undefined);
  assert.doesNotMatch(h.text(), /Patron/);
});
test('a new slash-command name opens the save editor prefilled, and an existing one switches', async () => {
  let opens = 0; const h = harness({ openWorkspace: async () => { opens++; return { ok: true }; } });
  h.ui.command('Fresh'); assert.equal(h.doc.getElementById('workspaceName').value, 'Fresh');
  h.ui.cancel(); h.ui.command('First'); await settle(); assert.equal(opens, 1);
});
test('an empty switcher offers the Arc import to everyone', () => {
  const empty = harness({}, { items: [] });
  empty.ui.open();
  empty.button('Import Spaces from Arc').emit('click');
  assert.deepEqual(empty.calls, [['page', 'tab-import']]);
  const existing = harness();
  existing.ui.open();
  assert.equal(existing.button('Import Spaces from Arc'), undefined);
});
test('creation commands show for everyone but hide on a storage error', () => {
  const ids = ['wsSwitcherSep', 'wsSwitcherNew', 'wsSwitcherSaveAs'];
  const ok = harness(); ok.ui.open();
  for (const id of ids) assert.equal(ok.doc.getElementById(id).hidden, false, id);
  const broken = harness({}, { status: 'read-failed' }); broken.ui.open();
  for (const id of ids) assert.equal(broken.doc.getElementById(id).hidden, true, id);
});
test('the switch decision offers Save first whenever an ordinary tab is at risk', async () => {
  const h = harness({ openWorkspace: async () => ({ ok: false, error: 'unsaved-scratch', tabCount: 2, privateCount: 1, decision: 'token' }) });
  h.ui.switchTo({ id: 'b', name: 'Other' }); await settle();
  assert.ok(h.button('Save this window first…'));
});
