'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const start = mainSource.indexOf('function closeTab(id) {');
const end = mainSource.indexOf('\nfunction reopenClosedTab()', start);
const closeTabSource = start >= 0 && end >= 0 ? mainSource.slice(start, end) : null;

test('closeTab is still liftable from main.js', () => {
  assert.ok(closeTabSource, 'closeTab not found — update this test with it');
});

test('a quitting active-tab teardown never selects and wakes a quiet replacement', () => {
  let selected = null;
  const runtime = {
    activeTabId: 'active',
    tabOrder: ['active', 'quiet'],
    tabsWantingAddressBarFocus: new Set(),
    window: { contentView: { removeChildView: () => {} } },
  };
  const activeWc = { id: 11, isDestroyed: () => true };
  const tabs = new Map([
    ['active', { id: 'active', url: 'https://active.test/', private: false, view: { webContents: activeWc } }],
    ['quiet', { id: 'quiet', url: 'https://quiet.test/', private: false, asleep: true, view: null }],
  ]);
  const sandbox = {
    sleepSnapshots: new Map(),
    fillHintScheduler: null,
    sleepTeardownInProgress: true,
    tabs,
    forgetTabWebContentsIds: () => {},
    cancelAddressBarFocusReclaim: () => {},
    detachTabView: () => {},
    prepareTabViewForClose: () => {},
    cancelPermissionPromptsForTab: () => {},
    permissionPendingTabIds: () => new Set(),
    lastMainFrameMethod: new Map(),
    closedEntries: [],
    holdEligibility: () => 'refuse',
    sanitizeSnapshot: (s) => s,
    buildTabEntry: () => ({}),
    pushClosedEntry: () => {},
    parkTabView: () => false,
    trimSnapshot: () => null,
    liveContents: (tab) => tab.view?.webContents ?? null,
    Date,
    rt: () => runtime,
    windowRuntimes: { runtimeForTab: () => runtime, detachTab: () => {} },
    popupChildCounts: new Map(),
    pruneEmptyGroups: () => {},
    hasLiveWindow: () => true,
    setActiveTab: (id) => { selected = id; },
    broadcastTabs: () => {},
    scheduleMenuRebuild: () => {},
    isQuitting: true,
  };
  vm.runInNewContext(`${closeTabSource}\nthis.__closeTab = closeTab;`, sandbox);

  sandbox.__closeTab('active');

  assert.equal(selected, null, 'shutdown must not activate (and wake) the quiet tab');
  assert.equal(runtime.activeTabId, null);
  assert.equal(tabs.has('quiet'), true, 'the quiet workspace survives until process exit');
});

test('closeTab tolerates a malformed provisional url during WebContents teardown', () => {
  const runtime = {
    activeTabId: null,
    tabOrder: ['malformed'],
    tabsWantingAddressBarFocus: new Set(),
  };
  const tabs = new Map([
    ['malformed', { id: 'malformed', url: { not: 'a string' }, private: false, view: null }],
  ]);
  const sandbox = {
    sleepSnapshots: new Map(),
    fillHintScheduler: null,
    sleepTeardownInProgress: false,
    tabs,
    forgetTabWebContentsIds: () => {},
    cancelAddressBarFocusReclaim: () => {},
    detachTabView: () => {},
    prepareTabViewForClose: () => {},
    cancelPermissionPromptsForTab: () => {},
    permissionPendingTabIds: () => new Set(),
    lastMainFrameMethod: new Map(),
    closedEntries: [],
    holdEligibility: () => 'refuse',
    sanitizeSnapshot: (s) => s,
    buildTabEntry: () => ({}),
    pushClosedEntry: () => {},
    parkTabView: () => false,
    trimSnapshot: () => null,
    liveContents: (tab) => tab.view?.webContents ?? null,
    Date,
    rt: () => runtime,
    windowRuntimes: { runtimeForTab: () => runtime, detachTab: () => {} },
    popupChildCounts: new Map(),
    pruneEmptyGroups: () => {},
    hasLiveWindow: () => false,
    setActiveTab: () => { throw new Error('inactive tab must not be selected'); },
    broadcastTabs: () => {},
    scheduleMenuRebuild: () => {},
    isQuitting: false,
  };
  vm.runInNewContext(`${closeTabSource}\nthis.__closeTab = closeTab;`, sandbox);

  assert.doesNotThrow(() => sandbox.__closeTab('malformed'));
  assert.equal(tabs.has('malformed'), false);
  assert.deepEqual(sandbox.closedEntries, []);
});

test('closing a quiet storage-bearing tab also closes its retained WebContents', () => {
  let closed = 0;
  const retainedWc = { id: 33, isDestroyed: () => false, close: () => { closed += 1; } };
  const runtime = {
    activeTabId: null,
    tabOrder: ['quiet'],
    tabsWantingAddressBarFocus: new Set(),
  };
  const tabs = new Map([
    ['quiet', { id: 'quiet', url: 'https://quiet.test/', private: false, asleep: true, view: null }],
  ]);
  const snapshots = new Map([
    ['quiet', { view: { webContents: retainedWc }, entries: [], index: 0 }],
  ]);
  const sandbox = {
    sleepSnapshots: snapshots,
    sleepTeardownInProgress: false,
    fillHintScheduler: null,
    tabs,
    forgetTabWebContentsIds: () => {},
    cancelAddressBarFocusReclaim: () => {},
    detachTabView: () => {},
    prepareTabViewForClose: () => {},
    cancelPermissionPromptsForTab: () => {},
    permissionPendingTabIds: () => new Set(),
    lastMainFrameMethod: new Map(),
    closedEntries: [],
    holdEligibility: () => 'refuse',
    sanitizeSnapshot: (s) => s,
    buildTabEntry: () => ({}),
    pushClosedEntry: () => {},
    parkTabView: () => false,
    trimSnapshot: () => null,
    liveContents: (tab) => tab.view?.webContents ?? null,
    Date,
    rt: () => runtime,
    windowRuntimes: { runtimeForTab: () => runtime, detachTab: () => {} },
    popupChildCounts: new Map(),
    pruneEmptyGroups: () => {},
    hasLiveWindow: () => false,
    setActiveTab: () => {},
    broadcastTabs: () => {},
    scheduleMenuRebuild: () => {},
    isQuitting: false,
  };
  vm.runInNewContext(`${closeTabSource}\nthis.__closeTab = closeTab;`, sandbox);

  sandbox.__closeTab('quiet');

  assert.equal(closed, 1);
  assert.equal(snapshots.has('quiet'), false);
});

test('active private close keeps its native parent until WebContents destruction', () => {
  const calls = [], handlers = new Map(), deferred = [];
  let destroyed = false;
  const wc = {
    id: 44, isDestroyed: () => destroyed, isFocused: () => true,
    on: (event, handler) => handlers.set(event, handler),
    once: (event, handler) => handlers.set(event, handler),
    setWindowOpenHandler: () => {},
    close: () => calls.push('close'),
  };
  const tab = { id: 'private', url: 'blanc://newtab/', private: true, view: { webContents: wc } };
  const runtime = {
    activeTabId: tab.id, tabOrder: [tab.id], tabsWantingAddressBarFocus: new Set([tab.id]),
    window: { isDestroyed: () => false, webContents: { focus: () => calls.push('focus-chrome') }, contentView: {
      children: [tab.view],
      removeChildView: view => { assert.equal(view, tab.view); calls.push('detach'); },
    } },
  };
  const tabs = new Map([[tab.id, tab]]);
  const sandbox = {
    sleepSnapshots: new Map(), sleepTeardownInProgress: false, fillHintScheduler: null,
    tabs, rt: () => runtime, isQuitting: false, process: { platform: 'win32' },
    setImmediate: task => deferred.push(task),
    windowRuntimes: { runtimeForTab: () => runtime, detachTab: () => {} },
    cancelAddressBarFocusReclaim: (owner, options) => {
      assert.equal(owner, runtime); assert.equal(options.reveal, false);
      calls.push('cancel-address-focus');
    },
    forgetTabWebContentsIds: () => {}, permissionPendingTabIds: () => new Set(),
    cancelPermissionPromptsForTab: () => {}, popupChildCounts: new Map(),
    pruneEmptyGroups: () => {}, lastMainFrameMethod: new Map(),
    liveContents: target => target?.view?.webContents ?? null,
    liveViewContents: view => view?.webContents && !destroyed ? wc : null,
    hasLiveWindow: () => true, unwireTabView: () => calls.push('unwire'), matchBrowserShortcut: () => true,
    setTabViewVisible: (target, visible) => {
      assert.equal(tabs.get(target.id), target, 'native preparation still has its verified owner');
      assert.equal(visible, false); calls.push('hide');
    },
  };
  const prepareSource = mainSource.match(/function prepareTabViewForClose\(tab\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(prepareSource);
  vm.runInNewContext(`${prepareSource}\n${closeTabSource}\nthis.__close = closeTab;`, sandbox);
  sandbox.__close(tab.id, { record: false, selectReplacement: false });
  assert.deepEqual(calls, ['cancel-address-focus', 'unwire', 'focus-chrome', 'hide', 'close']);
  assert.equal(tabs.size, 0);
  assert.equal(runtime.activeTabId, null);
  destroyed = true; handlers.get('destroyed')();
  assert.equal(calls.at(-1), 'close');
  for (const task of deferred) task();
  assert.equal(calls.at(-1), 'detach', 'detach only after native destruction');
});
