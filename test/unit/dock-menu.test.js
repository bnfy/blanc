'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildDockMenu, installDockMenu } = require('../../src/main/dock-menu');

test('dock menu offers New Window and New Private Window, in order', () => {
  const items = buildDockMenu();
  assert.deepEqual(items.map((i) => i.id), ['new-window', 'new-private-window']);
  assert.deepEqual(items.map((i) => i.label), ['New Window', 'New Private Window']);
});

test('an active tab adds a top line above a separator', () => {
  const items = buildDockMenu({ activeTab: { label: 'Example — example.com' } });
  assert.deepEqual(items.map((i) => i.id ?? i.type),
    ['active-tab', 'separator', 'new-window', 'new-private-window']);
  assert.equal(items[0].label, 'Example — example.com');
});

test('an empty active-tab label is omitted (no dangling separator)', () => {
  const items = buildDockMenu({ activeTab: { label: '' } });
  assert.deepEqual(items.map((i) => i.id), ['new-window', 'new-private-window']);
});

test('installDockMenu is a no-op off macOS and returns an inert handle', () => {
  let called = false;
  const app = { dock: { setMenu() { called = true; } } };
  const handle = installDockMenu({ app, Menu: { buildFromTemplate: () => ({}) }, actions: {}, platform: 'win32' });
  handle.update({ label: 'x' });
  assert.equal(called, false);
});

function fakeDarwin(actions) {
  const templates = [];
  const Menu = { buildFromTemplate: (t) => { templates.push(t); return { __t: t }; } };
  const menus = [];
  const app = { dock: { setMenu: (m) => menus.push(m) } };
  const handle = installDockMenu({ app, Menu, nativeImage: null, actions, platform: 'darwin' });
  return { handle, templates, menus };
}

test('installDockMenu wires each item click to its action on macOS', () => {
  const hits = [];
  const actions = {
    newWindow: () => hits.push('w'),
    newPrivateWindow: () => hits.push('p'),
    focusActiveWindow: () => hits.push('focus'),
  };
  const { handle, templates } = fakeDarwin(actions);
  handle.update({ label: 'Docs' }); // adds the active-tab line
  const t = templates[templates.length - 1];
  t.find((i) => i.label === 'Docs').click();
  t.find((i) => i.label === 'New Window').click();
  t.find((i) => i.label === 'New Private Window').click();
  assert.deepEqual(hits, ['focus', 'w', 'p']);
});

test('update rebuilds only when the visible content changes', () => {
  const { handle, menus } = fakeDarwin({});
  assert.equal(menus.length, 1); // initial install (no active tab)
  handle.update({ label: 'A' });
  assert.equal(menus.length, 2); // label appeared
  handle.update({ label: 'A' });
  assert.equal(menus.length, 2); // identical → skipped
  handle.update({ label: 'A', iconDataUrl: 'data:image/png;base64,AAA' });
  assert.equal(menus.length, 3); // favicon changed → rebuilt
  handle.update(null);
  assert.equal(menus.length, 4); // back to no active tab
  handle.update(null);
  assert.equal(menus.length, 4); // still none → skipped
});
