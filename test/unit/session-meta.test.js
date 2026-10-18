'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// persistSession lives in main.js, which cannot be required under node --test.
// Lift the real source and run it in a sandbox, so this asserts shipped code.
const { persistableEntries, sessionTabMeta } = require('../../src/main/session-snapshot');
const { PRIMARY_WINDOW_ID, loadWorkspace, buildSaveShape } = require('../../src/main/session-workspace');
const { savesSessionEntry } = require('../../src/main/window-state-persistence');
const SAFE_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVR42mNgGAWjYBSMglEwCkbBqAABBgAE/wABeV0FzgAAAABJRU5ErkJggg==';

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const fnSource = mainSource.match(/function persistSession\(\) \{[\s\S]*?\n\}/)?.[0];
// persistSession calls out to this module-level sibling (the Task 5A
// extraction, reused by Named Workspaces' capture path) — lift it too, so
// the sandbox mirrors real module scope instead of one function's text.
const captureSource = mainSource.match(/function captureWindowEntry\([\s\S]*?\n\}/)?.[0];
// captureWindowEntry reconciles the tab order and the Recently closed band first.
const syncSource = mainSource.match(/function syncTabLayout\([\s\S]*?\n\}/)?.[0];
const layoutListSource = mainSource.match(/function tabLayoutList\([\s\S]*?\n\}/)?.[0];
const closedSlotModel = require('../../src/main/closed-slot');
const tabSections = require('../../src/renderer/tab-sections');

test('persistSession is still liftable out of main.js', () => {
  assert.ok(fnSource, 'persistSession not found — update this test with it');
  assert.ok(captureSource, 'captureWindowEntry not found — update this test with it');
  assert.ok(syncSource, 'syncTabLayout not found — update this test with it');
  assert.ok(layoutListSource, 'tabLayoutList not found — update this test with it');
});

function run(tabList, activeTabId, {
  sessionHeldForQuit = false, primaryWindow = {}, primaryTabs = null, others = [], groups = [], closedSlot = 0,
} = {}) {
  const data = {};
  const runtime = {
    id: PRIMARY_WINDOW_ID,
    window: primaryWindow,
    tabOrder: primaryTabs ?? tabList.map((t) => t.id),
    groups,
    closedSlot,
    closedSlotIds: groups.map((group) => group.id),
    activeTabId,
  };
  const sandbox = {
    isQuitting: false,
    sessionHeldForQuit,
    sessionPersistenceSuspended: false,
    sessionReadOnly: false,
    tabs: new Map(tabList.map((t) => [t.id, t])),
    rt: () => runtime,
    windowRuntimes: { all: () => [runtime, ...others] },
    focusedRuntime: runtime,
    PRIMARY_WINDOW_ID,
    ensureSessionStore: () => ({ update: (fn) => fn(data) }),
    persistableEntries,
    savesSessionEntry,
    sessionTabMeta,
    loadWorkspace,
    buildSaveShape,
    // Named Workspaces autosave (Task 5B): persistSession's body calls this
    // once, unconditionally, as its last line. Its own behavior belongs to
    // the profile-scoped workspaces store, well outside what this file's
    // session.json assertions cover — stubbed inert so the lifted source
    // runs without needing to know that store exists.
    autosaveWorkspaceBindings: () => {},
    ...closedSlotModel,
    ...tabSections,
  };
  vm.runInNewContext(`${layoutListSource}\n${syncSource}\n${captureSource}\n${fnSource}\nthis.__fn = persistSession;`, sandbox);
  sandbox.__fn();
  return data;
}

const tab = (over) => ({
  id: 'x', url: 'https://a/', title: 'A', favicon: null,
  private: false, groupId: null, pinned: false, ...over,
});

test('persistSession writes a meta entry per persisted url, in the same order', () => {
  const data = run([
    tab({ id: 'a', url: 'https://a/', title: 'Alpha', favicon: SAFE_ICON }),
    tab({ id: 'p', url: 'https://secret/', title: 'Secret', private: true }),
    tab({ id: 'b', url: 'https://b/', title: 'Beta' }),
  ], 'b');
  assert.deepEqual(data.windows[0].urls, ['https://a/', 'https://b/']);
  assert.deepEqual(data.windows[0].meta, [
    { title: 'Alpha', favicon: SAFE_ICON },
    { title: 'Beta', favicon: null },
  ]);
  assert.equal('meta' in data, false, 'the v0 mirror never carries meta');
});

test('nothing rewrites the session while the last window\'s close waits for the quit', () => {
  // Closing the last Windows/Linux window saves it with its tabs, then the
  // window's pages are torn down before window-all-closed starts the quit.
  // A write in between would save the window without the pages it lost.
  const data = run([tab({ id: 'a', url: 'https://a/' })], 'a', { sessionHeldForQuit: true });
  assert.deepEqual(data, {});
});

test('an unused primary with no window and no tabs is not saved as an empty window', () => {
  // A launch that restores only a secondary window leaves the primary runtime
  // registered but unused; saving it would reopen an extra, empty window.
  const data = run([tab({ id: 'c', url: 'https://c/' })], 'c', {
    primaryWindow: null,
    primaryTabs: [],
    others: [{ id: 'window_c', window: {}, tabOrder: ['c'], groups: [], activeTabId: 'c' }],
  });
  assert.deepEqual(data.windows.map((entry) => entry.id), ['window_c']);
  assert.deepEqual(data.windows[0].urls, ['https://c/']);
});

test('the local HTML grant survives only in the v2 window, not the rollback mirror', () => {
  const data = run([
    tab({ id: 'web', url: 'https://a/' }),
    tab({ id: 'file', url: 'file:///tmp/opened.html', localFile: true }),
  ], 'file');
  assert.deepEqual(data.windows[0].localFiles, [false, true]);
  assert.equal('localFiles' in data, false);
  assert.deepEqual(loadWorkspace(data).windows[0].localFiles, [false, true]);
});

test('the restore copy-back threads meta through the utility-url filter', () => {
  assert.match(mainSource, /meta: cleaned\.meta,/,
    'without this a dropped utility url misaligns every title by one');
});

const clearSource = mainSource.match(/function clearSessionMeta\(\) \{[\s\S]*?\n\}/)?.[0];

function runClear(data, { readOnly = false } = {}) {
  const sandbox = {
    sessionReadOnly: readOnly,
    ensureSessionStore: () => ({ update: (fn) => fn(data) }),
    metaAfterHistoryClear: require('../../src/main/session-snapshot').metaAfterHistoryClear,
  };
  vm.runInNewContext(`${clearSource}\nthis.__fn = clearSessionMeta;`, sandbox);
  sandbox.__fn();
  return data;
}

test('clearing history strips the meta column from every persisted window', () => {
  assert.ok(clearSource, 'clearSessionMeta not found — update this test with it');
  const data = runClear({
    version: 1,
    windows: [{ urls: ['https://a/'], meta: [{ title: 'A', favicon: null }] }],
    urls: ['https://a/'],
  });
  assert.equal('meta' in data.windows[0], false);
  assert.deepEqual(data.windows[0].urls, ['https://a/'], 'only meta is removed — the session survives');
});

test('clearing history never rewrites a session file a newer build owns', () => {
  const data = runClear(
    { version: 9, windows: [{ meta: [{ title: 'A', favicon: null }] }] },
    { readOnly: true }
  );
  assert.equal('meta' in data.windows[0], true);
});

test('both history-clear entry points clear the persisted titles', () => {
  assert.match(mainSource, /chromeHandle\('chrome:history-clear'[\s\S]{0,160}clearSessionMeta\(\)/,
    "the chrome's own history clear must drop the meta column");
  const pagesSource = fs.readFileSync(path.join(__dirname, '../../src/main/pages.js'), 'utf8');
  assert.match(pagesSource, /pages:history:clear'[\s\S]{0,160}onHistoryCleared/,
    'the History page clears through the same hook');
});

test('clearing history keeps names the person typed and drops page titles', () => {
  const data = runClear({
    version: 2,
    windows: [
      { urls: ['https://a/', 'https://b/'], meta: [{ title: 'A', favicon: null, customTitle: 'Budget' }, { title: 'B', favicon: null }] },
      { urls: ['https://c/'], meta: [{ title: 'C', favicon: null }] },
    ],
  });
  assert.deepEqual(data.windows[0].meta, [
    { title: '', favicon: null, customTitle: 'Budget' },
    { title: '', favicon: null },
  ]);
  assert.equal('meta' in data.windows[1], false, 'a window without names loses its meta as before');
});

test('the Recently closed slot counts only groups that are written', () => {
  const groups = [{ id: 'secret', name: 'Secret', collapsed: false }, { id: 'work', name: 'Work', collapsed: false }];
  const tabsList = [
    tab({ id: 'p', url: 'https://secret/', private: true, groupId: 'secret' }),
    tab({ id: 'w', url: 'https://work/', groupId: 'work' }),
  ];
  assert.equal(run(tabsList, 'w', { groups, closedSlot: 2 }).windows[0].closedSlot, 1);
  assert.equal('closedSlot' in run(tabsList, 'w', { groups, closedSlot: 1 }).windows[0], false);
});
