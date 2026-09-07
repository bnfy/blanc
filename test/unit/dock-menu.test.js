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
  const Menu = {
    buildFromTemplate: (t) => {
      templates.push(t);
      return {
        __t: t,
        getMenuItemById: (id) => t.find((item) => item.id === id) ?? null,
      };
    },
  };
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
  const t = templates[0];
  t.find((i) => i.label === 'Docs').click();
  t.find((i) => i.label === 'New Window').click();
  t.find((i) => i.label === 'New Private Window').click();
  assert.deepEqual(hits, ['focus', 'w', 'p']);
});

test('update mutates one stable menu instead of replacing it under AppKit', () => {
  const { handle, menus, templates } = fakeDarwin({});
  assert.equal(menus.length, 1); // installed once for the app lifetime
  const activeItem = templates[0].find((item) => item.id === 'active-tab');
  const separator = templates[0].find((item) => item.id === 'active-tab-separator');
  assert.equal(activeItem.visible, false);
  assert.equal(separator.visible, false);
  handle.update({ label: 'A' });
  assert.equal(menus.length, 1);
  assert.equal(activeItem.label, 'A');
  assert.equal(activeItem.visible, true);
  assert.equal(separator.visible, true);
  handle.update({ label: 'A' });
  assert.equal(menus.length, 1);
  handle.update({ label: 'A', iconDataUrl: 'data:image/png;base64,AAA' });
  assert.equal(menus.length, 1);
  handle.update(null);
  assert.equal(menus.length, 1);
  assert.equal(activeItem.visible, false);
  assert.equal(separator.visible, false);
  handle.update(null);
  assert.equal(menus.length, 1);
});
