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
const SAFE_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVR42mNgGAWjYBSMglEwCkbBqAABBgAE/wABeV0FzgAAAABJRU5ErkJggg==';

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const fnSource = mainSource.match(/function persistSession\(\) \{[\s\S]*?\n\}/)?.[0];
// persistSession calls out to this module-level sibling (the Task 5A
// extraction, reused by Named Workspaces' capture path) — lift it too, so
// the sandbox mirrors real module scope instead of one function's text.
const captureSource = mainSource.match(/function captureWindowEntry\([\s\S]*?\n\}/)?.[0];

test('persistSession is still liftable out of main.js', () => {
  assert.ok(fnSource, 'persistSession not found — update this test with it');
  assert.ok(captureSource, 'captureWindowEntry not found — update this test with it');
});

function run(tabList, activeTabId) {
  const data = {};
  const runtime = {
    id: PRIMARY_WINDOW_ID,
    tabOrder: tabList.map((t) => t.id),
    groups: [],
    activeTabId,
  };
  const sandbox = {
    isQuitting: false,
    sessionPersistenceSuspended: false,
    sessionReadOnly: false,
    tabs: new Map(tabList.map((t) => [t.id, t])),
    rt: () => runtime,
    windowRuntimes: { all: () => [runtime] },
    focusedRuntime: runtime,
    PRIMARY_WINDOW_ID,
    ensureSessionStore: () => ({ update: (fn) => fn(data) }),
    persistableEntries,
    sessionTabMeta,
    loadWorkspace,
    buildSaveShape,
  };
  vm.runInNewContext(`${captureSource}\n${fnSource}\nthis.__fn = persistSession;`, sandbox);
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

test('the restore copy-back threads meta through the utility-url filter', () => {
  assert.match(mainSource, /meta: cleaned\.meta,/,
    'without this a dropped utility url misaligns every title by one');
});

const clearSource = mainSource.match(/function clearSessionMeta\(\) \{[\s\S]*?\n\}/)?.[0];

function runClear(data, { readOnly = false } = {}) {
  const sandbox = {
    sessionReadOnly: readOnly,
    ensureSessionStore: () => ({ update: (fn) => fn(data) }),
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
