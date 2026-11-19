'use strict';

// Spaces across profiles (spec 2026-11-19 §4.4): the New Space editor's
// Profile choice, and the list keeping up when other profiles go away.
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, settle } = require('../support/workspace-ui-dom');
const { createTranslator } = require('../../src/renderer/pages/i18n.js');
const t = createTranslator({ locale: 'en', messages: require('../../src/renderer/pages/strings.en.js').messages });

const PERSONAL = [{ id: 'p1', name: 'Plan', active: true, tabCount: 3, color: '#426c4c', symbol: 'briefcase' }];
const WORK = { id: 'w', name: 'Work', status: 'saved', full: false, items: [{ id: 'w1', name: 'Sprint', tabCount: 5, color: '#376694', symbol: 'code', openElsewhere: false }] };
const payload = (extra = {}) => ({ items: PERSONAL, profileName: 'Personal', otherProfiles: [WORK], ...extra });
const select = (h) => h.doc.getElementById('workspaceProfile');
const choose = (h, value) => { const node = select(h); node.value = value; node.emit('change', { target: node }); };
const help = (h) => h.popup.querySelectorAll('.ws-help').map((n) => n.textContent);
const typeName = (h, name) => { const input = h.doc.getElementById('workspaceName'); input.value = name; input.emit('input', { target: input }); };

test('no Profile row with one profile', () => {
  const h = harness({}, { items: PERSONAL }); h.ui.begin('new');
  assert.equal(select(h), undefined);
});

test('no Profile row in the editors from a tab, tabs, a group or a link', () => {
  for (const start of ['tab', 'tabs', 'link']) {
    const h = harness({}, payload()); h.ui.begin('new', null, { start, tabId: 't1', tabTitle: 'Page' });
    assert.equal(select(h), undefined, start);
  }
});

test("the Profile row defaults to this window's profile", () => {
  const h = harness({}, payload()); h.ui.begin('new');
  const node = select(h);
  assert.equal(node.tagName, 'SELECT');
  assert.deepEqual(node.children.map((o) => [o.value, o.textContent]), [['', 'Personal'], ['w', 'Work']]);
  assert.equal(node.value, '');
  assert.equal(node.attrs['aria-label'], t('ws.editor.profile'));
});

test('choosing another profile forces an empty start', () => {
  const h = harness({}, { ...payload(), items: [{ ...PERSONAL[0], active: false }] }); h.ui.begin('new');
  assert.equal(h.ui.state.start, 'window', 'a window in no Space starts from this window, as today');
  choose(h, 'w');
  assert.equal(h.byKey('start:window').disabled, true);
  assert.equal(h.byKey('start:empty').attrs['aria-checked'], 'true');
  assert.ok(help(h).includes(t('ws.editor.helpOtherProfile', { profile: 'Work' })));
  assert.equal(t('ws.editor.helpOtherProfile', { profile: 'Work' }), 'Tabs stay in their own profile, so a Space in Work starts empty.');
  choose(h, '');
  assert.equal(h.byKey('start:window').disabled, false);
  assert.ok(help(h).includes(t('ws.editor.help')));
});

test('names are checked against the chosen profile', () => {
  const h = harness({}, payload()); h.ui.begin('new');
  typeName(h, 'Plan');
  assert.equal(h.byKey('create').disabled, true, 'Plan is taken in Personal');
  choose(h, 'w');
  assert.equal(h.byKey('create').disabled, false, 'Work has no Plan');
  typeName(h, 'sprint');
  assert.equal(h.byKey('create').disabled, true, 'Sprint is taken in Work, in any case');
});

test("a full profile can't be chosen", () => {
  const h = harness({}, payload({ otherProfiles: [{ ...WORK, full: true }] })); h.ui.begin('new');
  assert.equal(select(h).children[1].disabled, true);
  assert.equal(select(h).children[0].disabled, false);
});

test('Create in another profile calls create-blank with profileId, never save-as', async () => {
  const calls = [];
  const h = harness({
    createBlankWorkspace: async (...args) => { calls.push(['blank', ...args]); return { ok: true }; },
    saveWorkspaceAs: async (...args) => { calls.push(['save-as', ...args]); return { ok: true }; },
  }, { ...payload(), items: [{ ...PERSONAL[0], active: false }] });
  h.ui.begin('new'); choose(h, 'w'); typeName(h, 'Hiring');
  h.doc.getElementById('workspaceEditor').emit('submit');
  await settle();
  assert.equal(calls.length, 1);
  const [kind, name, opts] = calls[0];
  assert.deepEqual([kind, name, opts.profileId], ['blank', 'Hiring', 'w']);
  assert.ok(opts.color && opts.symbol);
});

test("arrow keys in the select aren't stolen by the menu's roving", () => {
  const h = harness({}, payload()); h.ui.begin('new');
  const node = select(h); node.focus();
  h.popup.emit('keydown', { key: 'ArrowDown', target: node });
  assert.equal(h.doc.activeElement, node);
});

test('a result without other profiles drops their rows', async () => {
  const h = harness({ openWorkspace: async () => ({ ok: true, items: PERSONAL, deleted: [], status: 'saved' }) }, payload());
  h.ui.open();
  assert.ok(h.byKey('open:w:w1'));
  h.byKey('open:p1').click(); await settle();
  h.ui.open();
  assert.equal(h.byKey('open:w:w1'), undefined, 'Work was deleted meanwhile');
});
