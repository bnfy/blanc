'use strict';

// Spaces across profiles (spec 2026-11-19 §4.2): the menu lists other
// profiles' Spaces under their names, and their rows only open.
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, settle } = require('../support/workspace-ui-dom');
const { createTranslator } = require('../../src/renderer/pages/i18n.js');
const t = createTranslator({ locale: 'en', messages: require('../../src/renderer/pages/strings.en.js').messages });

const TWO = [
  { id: 'a', name: 'First', active: true, tabCount: 1, color: '#426c4c', symbol: 'briefcase' },
  { id: 'b', name: 'Second', active: false, tabCount: 4, color: '#974f2a', symbol: 'house' },
];
const WORK = { id: 'w', name: 'Work', status: 'saved', full: false, items: [
  { id: 'w1', name: 'Sprint', tabCount: 5, color: '#376694', symbol: 'code', openElsewhere: false },
  { id: 'w2', name: 'Hiring', tabCount: 2, color: '#7a4f9a', symbol: 'flask', openElsewhere: true },
] };
const payload = (extra = {}) => ({ items: TWO, profileName: 'Personal', otherProfiles: [WORK], ...extra });
const headings = (h) => h.list.children.filter((n) => n.className === 'ws-profile-heading').map((n) => n.textContent);
const rows = (h) => h.list.children.filter((n) => n.className.includes('ws-row'));
const rowNamed = (h, name) => rows(h).find((r) => r.children[0].children[1].textContent === name);

test('no headings without other profiles', () => {
  const h = harness({}, { items: TWO }); h.ui.open();
  assert.deepEqual(headings(h), []);
  assert.deepEqual(rows(h).map((r) => r.dataset.workspaceId), ['a', 'b']);
});

test('no headings when other profiles have no Spaces', () => {
  const h = harness({}, payload({ otherProfiles: [{ ...WORK, items: [] }] })); h.ui.open();
  assert.deepEqual(headings(h), []);
  assert.equal(rows(h).length, 2);
});

test('headings: this profile first, then others', () => {
  const h = harness({}, payload({ otherProfiles: [WORK, { id: 's', name: 'Studio', status: 'saved', full: false, items: [{ id: 's1', name: 'Clients', tabCount: 12, color: '#426c4c', symbol: 'house', openElsewhere: false }] }] }));
  h.ui.open();
  assert.deepEqual(headings(h), ['Personal', 'Work', 'Studio']);
  const order = h.list.children.map((n) => n.className === 'ws-profile-heading' ? `# ${n.textContent}` : n.dataset.workspaceId).filter(Boolean);
  assert.deepEqual(order, ['# Personal', 'a', 'b', '# Work', 'w1', 'w2', '# Studio', 's1']);
  assert.equal('data-i18n-ignore' in h.list.children[0].attrs, true, 'profile names are never translated');
});

test("another profile's row opens only", async () => {
  const calls = [];
  const h = harness({ openWorkspace: async (...args) => { calls.push(args); return { ok: true }; } }, payload()); h.ui.open();
  const row = rowNamed(h, 'Sprint');
  assert.equal(h.byKey('edit:w1'), undefined, 'no ••• editor');
  assert.equal(row.children.length, 1, 'the row is its open button alone');
  const main = row.children[0];
  assert.notEqual(main.dataset.current, 'true');
  main.emit('keydown', { altKey: true, key: 'ArrowDown' });
  main.emit('pointerdown', { pointerId: 1, clientY: 10 });
  assert.ok(!h.calls.some(([kind]) => kind === 'move'), 'no reorder');
  main.click(); await settle();
  assert.deepEqual(calls, [['w1', { profileId: 'w' }]]);
});

test("another profile's row tooltip names the profile", () => {
  const h = harness({}, payload()); h.ui.open();
  const sprint = rowNamed(h, 'Sprint').children[0];
  assert.equal(sprint.title, t('ws.row.titleProfile', { name: 'Sprint', profile: 'Work', context: t('ws.row.openInProfile', { profile: 'Work' }), count: 5 }));
  assert.equal(sprint.title, 'Sprint · Work · Opens in a Work window · 5 tabs');
  assert.equal(sprint.attrs['aria-label'], sprint.title);
  const hiring = rowNamed(h, 'Hiring').children[0];
  assert.equal(hiring.title, 'Hiring · Work · Show window · 2 tabs');
  assert.equal(hiring.children[2].textContent, 'Show window');
});

test('same-named Spaces in two profiles stay distinct', async () => {
  const calls = [];
  const h = harness({ openWorkspace: async (...args) => { calls.push(args); return { ok: true }; } },
    payload({ items: [{ ...TWO[0], name: 'Plan', id: 'p1' }], otherProfiles: [{ ...WORK, items: [{ ...WORK.items[0], id: 'w1', name: 'Plan' }] }] }));
  h.ui.open();
  const plans = rows(h).filter((r) => r.children[0].children[1].textContent === 'Plan');
  assert.equal(plans.length, 2);
  plans[0].children[0].click(); await settle();
  h.ui.open(); rows(h).filter((r) => r.children[0].children[1].textContent === 'Plan')[1].children[0].click(); await settle();
  assert.deepEqual(calls, [['p1', {}], ['w1', { profileId: 'w' }]]);
});

test('an unreadable profile shows its heading and one line', () => {
  const h = harness({}, payload({ otherProfiles: [{ ...WORK, status: 'future-format', items: [] }] })); h.ui.open();
  assert.deepEqual(headings(h), ['Personal', 'Work']);
  const at = h.list.children.findIndex((n) => n.textContent === 'Work');
  assert.equal(h.list.children[at + 1].textContent, 'Couldn’t read this profile’s Spaces.');
});

test("empty this-profile with another profile's Spaces", () => {
  const h = harness({}, payload({ items: [] })); h.ui.open();
  assert.deepEqual(headings(h), ['Personal', 'Work']);
  const texts = h.list.children.map((n) => n.textContent || n.dataset.workspaceId);
  assert.deepEqual(texts.slice(0, 3), ['Personal', t('ws.list.emptyHint'), 'Work']);
  assert.equal(h.byKey('import-arc'), undefined, 'the Arc import shows only when no profile has a Space');
});

test('keyboard roves across profiles', () => {
  const h = harness({}, payload()); h.ui.open();
  h.byKey('open:b').focus();
  h.popup.emit('keydown', { key: 'ArrowDown', target: h.byKey('open:b') });
  assert.equal(h.doc.activeElement, h.byKey('edit:b'), 'the row\'s own ••• first, as today');
  h.popup.emit('keydown', { key: 'ArrowDown', target: h.byKey('edit:b') });
  assert.equal(h.doc.activeElement, h.byKey('open:w:w1'), 'then the first Work row');
});

test('a refused open keeps the menu open on the list with the error', async () => {
  const h = harness({ openWorkspace: async () => ({ ok: false, error: 'profile-unavailable' }) }, payload()); h.ui.open();
  rowNamed(h, 'Sprint').children[0].click(); await settle();
  assert.equal(h.ui.state.kind, 'list');
  assert.match(h.text(), /That profile is no longer available\./);
  assert.ok(!h.calls.some(([kind]) => kind === 'close-overlay'));
});
