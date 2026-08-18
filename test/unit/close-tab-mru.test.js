'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { previousSurvivor } = require('../../src/main/tab-activation');

// Lift closeTab from main.js the same way close-tab-shutdown.test.js does,
// to prove the selection-after-close policy against the real code.
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const start = mainSource.indexOf('function closeTab(id) {');
const end = mainSource.indexOf('function reopenClosedTab()', start);
const closeTabSource = start >= 0 && end >= 0 ? mainSource.slice(start, end) : null;

function makeSandbox({ runtime, tabs, onSelect }) {
  return {
    sleepSnapshots: new Map(),
    sleepTeardownInProgress: false,
    tabs,
    forgetTabWebContentsIds: () => {},
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
    setActiveTab: onSelect,
    previousSurvivor,
    broadcastTabs: () => {},
    scheduleMenuRebuild: () => {},
    isQuitting: false,
  };
}

function makeTab(id) {
  return { id, url: `https://${id}.test/`, private: false, view: null };
}

test('closing the active tab returns to the previously active tab', () => {
  let selected = null;
  const runtime = {
    activeTabId: 'c',
    tabOrder: ['a', 'b', 'c'],
    // b was active before c; a before that.
    activationHistory: ['a', 'b', 'c'],
    tabsWantingAddressBarFocus: new Set(),
    window: { contentView: { removeChildView: () => {} } },
  };
  const tabs = new Map(['a', 'b', 'c'].map((id) => [id, makeTab(id)]));
  const sandbox = makeSandbox({ runtime, tabs, onSelect: (id) => { selected = id; } });
  vm.runInNewContext(`${closeTabSource}\nthis.__closeTab = closeTab;`, sandbox);

  sandbox.__closeTab('c');

  assert.equal(selected, 'b', 'must return to the previously active tab, not the right neighbor');
  assert.deepEqual(runtime.activationHistory, ['a', 'b'], 'closed id pruned from history');
});

test('empty history falls back to the right-neighbor rule', () => {
  let selected = null;
  const runtime = {
    activeTabId: 'b',
    tabOrder: ['a', 'b', 'c'],
    activationHistory: ['b'], // only the closed tab was ever activated
    tabsWantingAddressBarFocus: new Set(),
    window: { contentView: { removeChildView: () => {} } },
  };
  const tabs = new Map(['a', 'b', 'c'].map((id) => [id, makeTab(id)]));
  const sandbox = makeSandbox({ runtime, tabs, onSelect: (id) => { selected = id; } });
  vm.runInNewContext(`${closeTabSource}\nthis.__closeTab = closeTab;`, sandbox);

  sandbox.__closeTab('b');

  assert.equal(selected, 'c', 'history exhausted → the tab to the right of the closed one');
});

test('closing a background tab never changes the selection', () => {
  let selected = null;
  const runtime = {
    activeTabId: 'c',
    tabOrder: ['a', 'b', 'c'],
    activationHistory: ['a', 'b', 'c'],
    tabsWantingAddressBarFocus: new Set(),
    window: { contentView: { removeChildView: () => {} } },
  };
  const tabs = new Map(['a', 'b', 'c'].map((id) => [id, makeTab(id)]));
  const sandbox = makeSandbox({ runtime, tabs, onSelect: (id) => { selected = id; } });
  vm.runInNewContext(`${closeTabSource}\nthis.__closeTab = closeTab;`, sandbox);

  sandbox.__closeTab('a');

  assert.equal(selected, null);
  assert.deepEqual(runtime.activationHistory, ['b', 'c']);
});
