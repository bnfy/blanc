'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { harness, settle } = require('../support/workspace-ui-dom');
test('anyone reaches the new-space editor, and no Patron path remains', () => {
  const h = harness();
  h.ui.begin('new'); assert.equal(h.ui.state.kind, 'new'); h.ui.cancel();
  h.ui.open();
  assert.equal(h.button('Patron settings'), undefined);
  assert.doesNotMatch(h.text(), /Patron/);
});
test('a new slash-command name opens the editor prefilled, and an existing one switches', async () => {
  let opens = 0; const h = harness({ openWorkspace: async () => { opens++; return { ok: true }; } });
  h.ui.command('Fresh'); assert.equal(h.doc.getElementById('workspaceName').value, 'Fresh');
  h.ui.cancel(); h.ui.command('First'); await settle(); assert.equal(opens, 1);
});
test('an empty menu offers the Arc import to everyone', () => {
  const empty = harness({}, { items: [] });
  empty.ui.open();
  empty.byKey('import-arc').click();
  assert.deepEqual(empty.calls, [['page', 'tab-import']]);
  const existing = harness();
  existing.ui.open();
  assert.equal(existing.byKey('import-arc'), undefined);
});
test('New space shows for everyone but hides on a storage error', () => {
  const ok = harness(); ok.ui.open(); assert.ok(ok.byKey('new'));
  const broken = harness({}, { status: 'read-failed' }); broken.ui.open(); assert.equal(broken.byKey('new'), undefined);
});
test('the switch decision offers saving whenever an ordinary tab is at risk', async () => {
  const h = harness({ openWorkspace: async () => ({ ok: false, error: 'unsaved-scratch', tabCount: 2, privateCount: 1, decision: 'token' }) });
  h.ui.switchTo({ id: 'b', name: 'Other' }); await settle();
  assert.ok(h.byKey('save-first'));
});
