'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { buildDockMenu, installDockMenu } = require('../../src/main/dock-menu');

test('dock menu offers New Window and New Private Window, in order', () => {
  const items = buildDockMenu();
  assert.deepEqual(items.map((i) => i.id), ['new-window', 'new-private-window']);
  assert.deepEqual(items.map((i) => i.label), ['New Window', 'New Private Window']);
});

test('installDockMenu is a no-op off macOS', () => {
  let called = false;
  const app = { dock: { setMenu() { called = true; } } };
  installDockMenu({ app, Menu: { buildFromTemplate: () => ({}) }, actions: {}, platform: 'win32' });
  assert.equal(called, false);
});

test('installDockMenu wires each item click to its action on macOS', () => {
  const template = [];
  const Menu = { buildFromTemplate: (t) => { template.push(...t); return { __menu: true }; } };
  let set = null;
  const app = { dock: { setMenu: (m) => { set = m; } } };
  const hits = [];
  installDockMenu({
    app, Menu, platform: 'darwin',
    actions: { newWindow: () => hits.push('w'), newPrivateWindow: () => hits.push('p') },
  });
  assert.ok(set && set.__menu, 'dock.setMenu received the built menu');
  template.find((i) => i.label === 'New Window').click();
  template.find((i) => i.label === 'New Private Window').click();
  assert.deepEqual(hits, ['w', 'p']);
});
