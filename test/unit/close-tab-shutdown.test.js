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
    sleepTeardownInProgress: true,
    tabs,
    forgetTabWebContentsIds: () => {},
    cancelPermissionPromptsForTab: () => {},
    lastMainFrameMethod: new Map(),
    recentlyClosedUrls: [],
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
    sleepTeardownInProgress: false,
    tabs,
    forgetTabWebContentsIds: () => {},
    cancelPermissionPromptsForTab: () => {},
    lastMainFrameMethod: new Map(),
    recentlyClosedUrls: [],
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
  assert.deepEqual(sandbox.recentlyClosedUrls, []);
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
    tabs,
    forgetTabWebContentsIds: () => {},
    cancelPermissionPromptsForTab: () => {},
    lastMainFrameMethod: new Map(),
    recentlyClosedUrls: [],
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
