'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const batchPolicy = require('../../src/main/tab-import-batch');

const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const between = (start, end) => main.slice(main.indexOf(start), main.indexOf(end, main.indexOf(start)));

// Execute the shipping acceptance and batch functions with native resources
// replaced by fakes, so failures can be injected after partial creation/wake.
function harness() {
  const tabs = new Map();
  const owners = new Map();
  const runtimes = [];
  let current;
  let serial = 0;
  const calls = { closes: [], broadcasts: 0, hidden: 0, sheetFocused: 0 };
  const control = { failCreate: 0, failActivation: false, createCount: 0 };
  function runtime(id, profileId) {
    const value = { id, profileId, tabOrder: [], activeTabId: null, groups: [],
      activationHistory: [], lastActiveByCluster: new Map() };
    value.window = { destroyed: false, isDestroyed() { return this.destroyed; },
      show() {}, focus() {}, destroy() { this.destroyed = true; } };
    runtimes.push(value);
    return value;
  }
  const owner = runtime('review', 'work');
  owner.tabOrder = ['existing'];
  owner.activeTabId = 'existing';
  owner.groups = [{ id: 'group', name: 'project', collapsed: true }];
  owner.activationHistory = ['existing'];
  owner.lastActiveByCluster.set('group', 'existing');
  const existing = { id: 'existing', url: 'https://existing.test', live: true, pinned: true, groupId: 'group' };
  tabs.set(existing.id, existing);
  owners.set(existing.id, owner);
  current = owner;
  const context = vm.createContext({
    ...batchPolicy, Map, tabs, popupChildCounts: new Map(),
    MAX_TAB_IMPORT_TABS: 100, DEFAULT_PROFILE_ID: 'default',
    sessionPersistenceSuspended: false, tabStateBroadcastSuppressionDepth: 0, tabCreationBatchDepth: 0,
    pendingTabHandoff: { state: 'ready', runtimeId: owner.id, profileId: 'work', payload: { tabs: [
      { url: 'https://one.test', title: 'One' }, { url: 'https://two.test', title: 'Two', active: true },
    ] } },
    focusedRuntime: runtime('other-focused-window', 'default'),
    localProfiles: { getLocalProfile: (id) => ['default', 'work'].includes(id) ? { id } : null },
    profileDeletions: { hasPendingProfileDeletion: () => false },
    rt: () => current,
    withWindowRuntime(target, fn) { const previous = current; current = target; try { return fn(); } finally { current = previous; } },
    windowRuntimes: {
      createRuntime: ({ id, profileId }) => runtime(id, profileId),
      runtimeForTab: (id) => owners.get(id), detachTab: (id) => owners.delete(id),
    },
    createWindowRuntimeId: () => `new-${++serial}`,
    createMainWindow() {},
    forgetTabWebContentsIds() {},
    createTab(url, options) {
      if (++control.createCount === control.failCreate) return null;
      const id = `tab-${++serial}`;
      tabs.set(id, { id, url, ...options, live: false }); owners.set(id, current); current.tabOrder.push(id);
      return id;
    },
    setActiveTab(id, options) {
      assert.equal(options.dismissUtilitySheet, false);
      current.activeTabId = id;
      tabs.get(id).live = true;
      current.activationHistory.push(id);
      current.lastActiveByCluster.set('ungrouped', id);
      if (control.failActivation && id !== 'existing') throw new Error('native attach failed after wake');
    },
    liveContents: (tab) => tab?.live ? {} : null,
    closeTab(id, options) {
      calls.closes.push({ id, ...options });
      tabs.delete(id); owners.delete(id); current.tabOrder = current.tabOrder.filter((value) => value !== id);
      if (current.activeTabId === id) current.activeTabId = null;
    },
    liveUtilitySheet: () => ({ wc: { focus: () => calls.sheetFocused++ } }),
    setFocusedLocalProfile() {}, buildMenu() {},
    broadcastTabs: () => calls.broadcasts++,
    hideUtilitySheet: () => calls.hidden++,
  });
  vm.runInContext([
    between('function destroyQuietTabRecord(', 'function broadcastTabImportSurfaceOnce('),
    between('function acceptPendingTabHandoff(', "app.on('open-url'"),
    between('function openTabHandoffWindow(', 'function openNewWindow(options'),
  ].join('\n'), context);
  return { context, owner, tabs, runtimes, calls, control, existing,
    accept: (destination) => context.acceptPendingTabHandoff(destination) };
}

test('default appends to the review owner, preserving its existing group and pin', () => {
  const h = harness();
  const result = h.accept();
  assert.equal(result.ok, true);
  assert.equal(result.runtimeId, h.owner.id);
  assert.equal(h.runtimes.length, 2);
  assert.deepEqual([...h.owner.tabOrder], ['existing', ...result.tabIds]);
  assert.equal(h.tabs.get('existing'), h.existing);
  assert.equal(h.owner.groups[0].collapsed, true);
  assert.equal(h.owner.activeTabId, result.tabIds[1]);
  assert.equal(h.tabs.get(result.tabIds[0]).live, false);
  assert.equal(h.tabs.get(result.tabIds[1]).groupId, null);
  assert.equal(h.calls.broadcasts, 1);
  assert.equal(h.context.pendingTabHandoff, null);
  assert.equal(h.accept().error, 'unavailable');
});

test('explicit new-window uses the review profile and leaves the owner intact', () => {
  const h = harness();
  const result = h.accept('new-window');
  assert.equal(result.ok, true);
  assert.notEqual(result.runtimeId, h.owner.id);
  assert.equal(h.runtimes.at(-1).profileId, 'work');
  assert.deepEqual(h.owner.tabOrder, ['existing']);
  assert.equal(h.owner.activeTabId, 'existing');
});

for (const destination of ['current-window', 'new-window']) {
  for (const failure of ['insertion', 'activation']) {
    test(`${destination}: ${failure} failure rolls back and permits a single retry`, () => {
      const h = harness();
      if (failure === 'insertion') h.control.failCreate = 2;
      else h.control.failActivation = true;
      const pending = h.context.pendingTabHandoff;
      const result = h.accept(destination);
      assert.equal(result.ok, false);
      assert.equal(result.retryable, true);
      assert.equal(h.context.pendingTabHandoff, pending);
      assert.equal(h.calls.hidden, 0);
      assert.equal(h.calls.broadcasts, 0);
      assert.deepEqual([...h.tabs.keys()], ['existing']);
      assert.deepEqual([...h.owner.tabOrder], ['existing']);
      assert.equal(h.owner.activeTabId, 'existing');
      assert.deepEqual([...h.owner.activationHistory], ['existing']);
      assert.deepEqual([...h.owner.lastActiveByCluster], [['group', 'existing']]);
      assert.equal(h.owner.window.destroyed, false);
      if (destination === 'new-window') assert.equal(h.runtimes.at(-1).window.destroyed, true);
      for (const close of h.calls.closes) {
        assert.equal(close.record, false);
        assert.equal(close.selectReplacement, false);
      }
      assert.equal(h.context.sessionPersistenceSuspended, false);
      assert.equal(h.context.tabStateBroadcastSuppressionDepth, 0);
      h.control.failCreate = 0;
      h.control.failActivation = false;
      const retried = h.accept(destination);
      assert.equal(retried.ok, true);
      assert.equal(h.tabs.size, 3);
      assert.equal(h.accept(destination).error, 'unavailable');
    });
  }
}

test('rejects invalid destinations and closed/mismatched review windows without consuming the handoff', () => {
  for (const destination of [null, {}, 1, 'other']) {
    const h = harness();
    assert.equal(h.accept(destination).error, 'invalid-destination');
    assert.equal(h.context.pendingTabHandoff.state, 'ready');
    assert.equal(h.tabs.size, 1);
  }
  for (const change of [(owner) => { owner.window.destroyed = true; }, (owner) => { owner.profileId = 'default'; }]) {
    const h = harness(); change(h.owner);
    assert.equal(h.accept().error, 'unavailable');
    assert.equal(h.context.pendingTabHandoff.state, 'ready');
    assert.equal(h.tabs.size, 1);
  }
});
