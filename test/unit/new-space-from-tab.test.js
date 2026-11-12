'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { runSpaceMove, appendTabToCapture, emptiedCapture } = require('../../src/main/space-move');
const { harness, settle } = require('../support/workspace-ui-dom');
const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const sourceOf = (name) => main.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))[0];

// Run main's actual create/move adapters, including ordering, guards and
// recovery, with in-memory windows and an observable durable repository.
function setup({ fault, invalid, foreign = false, scratch = false } = {}) {
  const source = { id: 'source', workspaceId: scratch ? null : 'current', profileId: 'default', tabOrder: ['blank', 'page'], groups: [], activeTabId: 'page' };
  const target = { id: 'target', resident: true, tabOrder: [], groups: [] };
  const tab = { id: 'page', runtimeId: source.id, url: 'https://example.test/', title: 'Example' };
  let current = source, record = null, writes = 0, discarded = false;
  const capture = (r) => ({ urls: r.tabOrder.filter(id => id === 'page').map(() => tab.url), groupIds: r.tabOrder.filter(id => id === 'page').map(() => null), pinned: [], meta: [], groups: [], activeIndex: 0 });
  const sandbox = {
    runSpaceMove, appendTabToCapture, emptiedCapture,
    tabs: new Map([[tab.id, tab]]), rt: () => current,
    withWindowRuntime: (r, fn) => { const prev = current; current = r; try { return fn(); } finally { current = prev; } },
    windowRuntimes: { runtimeForTab: () => foreign ? {} : tab.runtimeId === source.id ? source : target },
    canMoveTabToSpace: () => true, groupRecord: g => g,
    namedWorkspaces: {
      get: () => null,
      validateCreate: () => invalid ? { ok: false, error: invalid } : { ok: true },
      create: ({ name, color, symbol, capture: saved }) => {
        writes++;
        assert.ok(source.tabOrder.includes(tab.id), 'the tab must stay in its source until creation is durable');
        record = { id: 'new', name, color, symbol, ...saved };
        return { ok: true, workspace: record };
      },
      saveCapture: (_id, saved) => { writes++; record = { ...record, ...saved }; return { ok: true }; },
      list: () => [],
    },
    makeResidentRuntime: () => target,
    sessionPersistenceSuspended: false,
    workspaceCapture: capture,
    persistableUrl: url => url, sessionTabMeta: () => ({ title: tab.title }),
    noteSpaceCreated() {}, NEW_TAB_URL: 'blanc://newtab/',
    takeSpaceMoveFault: step => step === fault ? 'storage-failed' : null,
    detachTabForMove: () => { source.tabOrder = source.tabOrder.filter(id => id !== tab.id); },
    rehomeTab: (_tab, r) => { tab.runtimeId = r.id; },
    disposeResident: () => { discarded = true; },
    broadcastTabs() {}, broadcastWorkspacesUpdated() {}, scheduleMakeRoomForSpaces() {},
    workspacesProjection: () => ({ items: record ? [record] : [] }),
    setActiveTab: id => { current.activeTabId = id; },
    MAX_WORKSPACES: 25,
  };
  vm.runInNewContext(`${sourceOf('moveTabToSpace')}\n${sourceOf('createSpaceWithTab')}\nthis.create = createSpaceWithTab;`, sandbox);
  return { source, target, tab, create: () => sandbox.create('Reading', { color: '#426c4c', symbol: 'book' }, 'page'), get record() { return record; }, get writes() { return writes; }, get discarded() { return discarded; } };
}

test('create writes the tab once, then moves the same live tab without switching the source space', () => {
  const h = setup(); const result = h.create();
  assert.equal(result.ok, true);
  assert.equal(h.writes, 1);
  assert.deepEqual([...h.record.urls], [h.tab.url]);
  assert.equal(h.record.color, '#426c4c'); assert.equal(h.record.symbol, 'book');
  assert.equal(h.tab.runtimeId, 'target');
  assert.equal(h.source.workspaceId, 'current');
  assert.deepEqual([...h.target.tabOrder], ['page']);
});
test('failed create writes nothing and keeps the source tab; staged runtime is disposed', () => {
  const h = setup({ fault: 'write' }); const result = h.create();
  assert.equal(result.error, 'storage-failed'); assert.equal(h.record, null);
  assert.equal(h.tab.runtimeId, 'source'); assert.ok(h.source.tabOrder.includes('page'));
  assert.equal(h.discarded, true);
});
test('validation and cross-window ownership refuse creation before writes', () => {
  for (const options of [{ invalid: 'duplicate-name' }, { invalid: 'limit' }, { foreign: true }]) {
    const h = setup(options); assert.equal(h.create().ok, false); assert.equal(h.writes, 0);
  }
});
test('a transfer fault leaves a saved space, restores the source tab, and reports saved-not-moved', () => {
  const h = setup({ fault: 'transfer' }); const result = h.create();
  assert.equal(result.error, 'saved-not-moved'); assert.equal(result.workspaceId, 'new');
  assert.equal(h.writes, 2); assert.equal(h.tab.runtimeId, 'source');
  assert.ok(h.source.tabOrder.includes('page')); assert.equal(h.source.activeTabId, 'page');
  assert.deepEqual([...h.record.urls], []);
});

test('the editor fixes the start to the context tab, passes identity, and closes after success', async () => {
  let args;
  const h = harness({ createSpaceWithTab: async (...values) => { args = values; return { ok: true }; } });
  h.ui.begin('new', null, { start: 'tab', tabId: 'background', tabTitle: 'Background page' });
  assert.match(h.text(), /With this tab.*Background page/);
  assert.equal(h.byKey('start:empty'), undefined); assert.equal(h.byKey('start:window'), undefined);
  const input = h.doc.getElementById('workspaceName'); input.value = 'Reading'; input.emit('input');
  h.popup.querySelector('#workspaceEditor').emit('submit'); await settle();
  assert.equal(args[0], 'Reading'); assert.equal(args[2], 'background');
  assert.ok(args[1].color); assert.ok(args[1].symbol); assert.equal(h.ui.opened, false);
});
test('cancelling creation from a tab closes the menu without a create call', () => {
  const h = harness({ createSpaceWithTab: () => assert.fail('cancel must not create') });
  h.ui.begin('new', null, { start: 'tab', tabId: 'page' }); h.ui.cancel();
  assert.equal(h.ui.opened, false); assert.equal(h.ui.state.kind, 'list');
});
test('create errors preserve the draft; saved-not-moved shows the new space instead of retrying', async () => {
  for (const error of ['storage-failed', 'duplicate-name', 'saved-not-moved']) {
    const h = harness({ createSpaceWithTab: async () => ({ ok: false, error, workspaceId: 'new', items: [{ id: 'new', name: 'Reading', color: '#426c4c', symbol: 'book' }] }) });
    h.ui.begin('new', null, { start: 'tab', tabId: 'page' });
    const input = h.doc.getElementById('workspaceName'); input.value = 'Reading'; input.emit('input');
    h.popup.querySelector('#workspaceEditor').emit('submit'); await settle();
    assert.equal(h.ui.opened, true);
    assert.equal(h.ui.state.kind, error === 'saved-not-moved' ? 'list' : 'new');
    assert.ok(h.ui.state.error);
    if (error === 'saved-not-moved') assert.match(h.text(), /Saved Reading/);
    else assert.equal(h.doc.getElementById('workspaceName').value, 'Reading');
  }
});


test('failed moves into existing spaces use the Spaces menu error surface', () => {
  const h = harness();
  h.ui.showMoveError('Reading', 'storage-failed');
  assert.equal(h.ui.opened, true); assert.equal(h.ui.state.kind, 'list');
  assert.match(h.text(), /Reading/); assert.ok(h.ui.state.error.length > 20);
});

test('an unbound window can create a destination without switching itself into it', () => {
  const h = setup({ scratch: true });
  assert.equal(h.create().ok, true);
  assert.equal(h.source.workspaceId, null);
});


test('the editor handoff retains the context tab in the replayable overlay purpose and enforces the cap', () => {
  const owner = {}, tab = { id: 'background' }; let count = 1, movable = true;
  const calls = [];
  const sandbox = {
    tabs: new Map([[tab.id, tab]]), rt: () => owner,
    windowRuntimes: { runtimeForTab: () => owner },
    canMoveTabToSpace: () => movable,
    namedWorkspaces: { list: () => Array(count).fill({}) }, MAX_WORKSPACES: 25,
    showOverlay: (mode, options) => calls.push([mode, options.purpose.newSpaceTabId]),
  };
  vm.runInNewContext(`${sourceOf('beginNewSpaceForTab')}\nthis.begin = beginNewSpaceForTab;`, sandbox);
  assert.equal(sandbox.begin(tab.id), true);
  assert.deepEqual(calls, [['spaces', 'background']]);
  count = 25; assert.equal(sandbox.begin(tab.id), false);
  count = 1; movable = false; assert.equal(sandbox.begin(tab.id), false);
  assert.equal(calls.length, 1);
});
