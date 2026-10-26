'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { WORKSPACE_LIMIT, errors } = require('../../src/renderer/workspace-ui');
const { MAX_WORKSPACES } = require('../../src/main/workspaces-model');
const { harness, settle } = require('../support/workspace-ui-dom');

test('the switcher states the same workspace limit main enforces', () => {
  assert.equal(WORKSPACE_LIMIT, MAX_WORKSPACES);
  assert.equal(errors.limit, `You have ${MAX_WORKSPACES} spaces. Delete one before adding another.`);
});

test('switch decisions pluralize private and unsaved tabs from the catalog', async () => {
  const message = async (tabCount, privateCount) => {
    const h = harness({ openWorkspace: async () => ({ ok: false, error: 'unsaved-scratch', tabCount, privateCount, decision: 'token' }) });
    h.ui.switchTo({ id: 'b', name: 'Other' }); await settle();
    const find = (node) => node.className === 'ws-switcher-confirm-msg' ? node : node.children.map(find).find(Boolean);
    return find(h.list).textContent;
  };
  assert.equal(await message(1, 1), '1 private tab will close. Page drafts are not saved to disk.');
  assert.equal(await message(3, 3), '3 private tabs will close. Page drafts are not saved to disk.');
  assert.equal(await message(1, 0), '1 unsaved tab will close. Page drafts are not saved to disk.');
  assert.equal(await message(2, 1), '2 unsaved tabs will close. Page drafts are not saved to disk.');
});

test('a refused switch names each blocking tab and can show it (#1140)', async () => {
  const blockingTabs = [
    { id: 't1', title: 'Linear', reason: 'opener' },
    { id: 't2', title: 'Inbox', reason: 'loading' },
    { id: 't3', title: 'Call', reason: 'capture' },
    { id: 't4', title: 'Docs', reason: 'popup' },
  ];
  const h = harness({
    openWorkspace: async () => ({ ok: false, error: 'protected-pages', reason: 'active-page', blockingTabs }),
    switchTab(id) { h.calls.push(['switch-tab', id]); },
  });
  h.ui.switchTo({ id: 'b', name: 'Other' }); await settle();
  const all = h.text();
  assert.match(all, /These pages need to stay open\. Finish or close them, or open the space in another window\./);
  assert.match(all, /“Linear” is still connected to the page that opened it, as during a sign-in\./);
  assert.match(all, /“Inbox” is still loading\./);
  assert.match(all, /“Call” is using your camera, microphone or screen\./);
  assert.doesNotMatch(all, /Docs/, 'only three pages are named');
  assert.match(all, /and 1 more page/);
  assert.equal(h.byKey('close-and-switch'), undefined, 'a protected page cannot be closed by switching');
  const show = h.byKey('show-tab:t2');
  assert.equal(show.getAttribute('aria-label'), 'Show Inbox');
  show.click();
  assert.deepEqual(h.calls.filter((c) => c[0] === 'switch-tab' || c[0] === 'close-overlay'), [['switch-tab', 't2'], ['close-overlay']]);
});

test('a refusal without named pages keeps the general message', async () => {
  const h = harness({ openWorkspace: async () => ({ ok: false, error: 'protected-pages', reason: 'permission-or-transition' }) });
  h.ui.switchTo({ id: 'b', name: 'Other' }); await settle();
  assert.match(h.text(), /This window has pages that need to stay open\./);
  assert.equal(h.popup.querySelector('.ws-blocking'), null);
});

test('space rows name the space, its state and its tab count', () => {
  const h = harness({}, { items: [{ id: 'a', name: 'First', active: true, tabCount: 1, color: '#426c4c', symbol: 'house' }, { id: 'b', name: 'Second', active: false, tabCount: 4, color: '#376694', symbol: 'book' }] });
  h.ui.open();
  const titles = h.list.children.filter((row) => row.className.includes('ws-row')).map((row) => row.children[0].title);
  assert.deepEqual(titles, ['First · Current space · 1 tab', 'Second · Open space · 4 tabs']);
});
