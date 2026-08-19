'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// applyWorkspaceToWindow, deriveWorkspaceBindings, and applyWorkspaceBindings
// live in main.js (Electron-only, not require()-able under node --test) —
// lifted here the same way persistSession/closeTab/clearSessionMeta already
// are (session-meta.test.js, close-tab-shutdown.test.js). filterRestoredSession/
// restoreTargetId and workspaces-model/window-runtime-registry are genuinely
// pure (no require('electron')) and imported for real, not stubbed.
const { filterRestoredSession, restoreTargetId } = require('../../src/main/session-restore');
const { resolveOpen, bindingsAfterSwap } = require('../../src/main/workspaces-model');
const windowRuntimes = require('../../src/main/window-runtime-registry');

const NEW_TAB_URL = 'blanc://newtab/';

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

function slice(startMarker, endMarker) {
  const start = mainSource.indexOf(startMarker);
  const end = mainSource.indexOf(endMarker, start);
  return start >= 0 && end >= 0 ? mainSource.slice(start, end) : null;
}

const applySource = slice(
  'function applyWorkspaceToWindow(runtime, workspace) {',
  '\nfunction removeNamedWorkspace'
);
const deriveSource = slice(
  'function deriveWorkspaceBindings() {',
  '\nfunction applyWorkspaceBindings'
);
const applyBindingsSource = slice(
  'function applyWorkspaceBindings(bindings) {',
  '\nfunction autosaveWorkspaceBindings'
);

test('applyWorkspaceToWindow, deriveWorkspaceBindings, and applyWorkspaceBindings are still liftable from main.js', () => {
  assert.ok(applySource, 'applyWorkspaceToWindow not found — update this test with it');
  assert.ok(deriveSource, 'deriveWorkspaceBindings not found — update this test with it');
  assert.ok(applyBindingsSource, 'applyWorkspaceBindings not found — update this test with it');
});

// ---------------------------------------------------------------------------
// applyWorkspaceToWindow: the 9-point apply checklist's tab-churn half
// (points 1, 2, 4-8 — points 3 and 9 belong to switchWindowToWorkspace as of
// review round 2's Fix 1). A recording sandbox stands in for every
// Electron-coupled helper it calls, so these tests observe call ORDER and
// call ARGUMENTS — the exact things review round 2's Important-1 finding
// hinged on, and that a real Electron harness can't assert cheaply.
// ---------------------------------------------------------------------------

function applyHarness(runtime) {
  const calls = [];
  let nextCreatedId = 0;
  let sawFirstCreate = false;
  let groupsAtFirstCreate;
  const sandbox = {
    withWindowRuntime: (_runtime, work) => work(),
    hideOverlay: (opts) => calls.push(['hideOverlay', opts]),
    hideUtilitySheet: (opts) => calls.push(['hideUtilitySheet', opts]),
    closeGlance: (opts) => calls.push(['closeGlance', opts]),
    closeTab: (id, opts) => calls.push(['closeTab', id, opts]),
    createTab: (url, opts) => {
      if (!sawFirstCreate) {
        sawFirstCreate = true;
        // Snapshot BY VALUE: runtime.groups may be reassigned again later in
        // the same call, and a live reference would silently "see" that
        // later value instead of proving what it was at THIS moment.
        groupsAtFirstCreate = Array.isArray(runtime.groups)
          ? runtime.groups.map((g) => ({ ...g }))
          : runtime.groups;
      }
      const id = `created_${nextCreatedId++}`;
      calls.push(['createTab', url, opts, id]);
      return id;
    },
    pruneEmptyGroups: () => calls.push(['pruneEmptyGroups']),
    setActiveTab: (id, opts) => calls.push(['setActiveTab', id, opts]),
    filterRestoredSession,
    restoreTargetId,
    isUtilityUrl: () => false,
    isForbiddenTopLevelUrl: () => false,
    NEW_TAB_URL,
  };
  vm.runInNewContext(`${applySource}\nthis.__apply = applyWorkspaceToWindow;`, sandbox);
  return {
    calls,
    apply: (workspace) => sandbox.__apply(runtime, workspace),
    groupsAtFirstCreate: () => groupsAtFirstCreate,
  };
}

const WORKSPACE = (over) => ({
  urls: ['https://a.test/', 'https://b.test/'],
  groupIds: [null, null],
  pinned: [false, false],
  meta: [{ title: 'A', favicon: null }, { title: 'B', favicon: null }],
  activeIndex: 0,
  groups: [],
  ...over,
});

test('every outgoing tab is closed with { record: false, selectReplacement: false }', () => {
  const runtime = { tabOrder: ['old_1', 'old_2', 'old_3'], groups: [] };
  const h = applyHarness(runtime);
  h.apply(WORKSPACE());
  const closes = h.calls.filter((c) => c[0] === 'closeTab');
  assert.deepEqual(closes.map((c) => c[1]), ['old_1', 'old_2', 'old_3'],
    'every tab that was open when the swap started must be closed, in order');
  for (const [, , opts] of closes) {
    // Per-property, not deepEqual: `opts` is a literal constructed INSIDE
    // the lifted (vm-realm) source, so it has a different Object.prototype
    // than this file's own {} literals — deepStrictEqual's prototype check
    // fails on that alone even when every enumerable value matches.
    assert.equal(opts.record, false, 'no Recently Closed pollution during a switch');
    assert.equal(opts.selectReplacement, false, 'no mid-swap replacement tab');
    assert.deepEqual(Object.keys(opts).sort(), ['record', 'selectReplacement']);
  }
});

test('runtime.groups is assigned from the workspace before the first createTab', () => {
  const runtime = { tabOrder: [], groups: [{ id: 'stale', name: 'stale', collapsed: false }] };
  const workspace = WORKSPACE({ groups: [{ id: 'g1', name: 'work', collapsed: true }] });
  const h = applyHarness(runtime);
  h.apply(workspace);
  assert.deepEqual(h.groupsAtFirstCreate(), [{ id: 'g1', name: 'work', collapsed: true }],
    'checklist point 5: createTab silently drops groupId unless the group already exists ' +
    'on the runtime, so groups must be swapped in before the FIRST createTab, not after');
});

test('an empty filtered set still yields exactly one createTab (blanc://newtab, never tabless)', () => {
  const runtime = { tabOrder: ['old_1'], groups: [] };
  const workspace = WORKSPACE({ urls: [], groupIds: [], pinned: [], meta: [], activeIndex: 0 });
  const h = applyHarness(runtime);
  h.apply(workspace);
  const creates = h.calls.filter((c) => c[0] === 'createTab');
  assert.equal(creates.length, 1, 'exactly one fallback tab — never zero (tabless) and never more than one');
  assert.equal(creates[0][1], NEW_TAB_URL, "the floor is the blank internal newtab, not the user's home page");
});

test('overlay/sheet dismissal and Glance collapse happen before any closeTab', () => {
  const runtime = { tabOrder: ['old_1', 'old_2'], groups: [] };
  const h = applyHarness(runtime);
  h.apply(WORKSPACE());
  const names = h.calls.map((c) => c[0]);
  assert.deepEqual(names.slice(0, 3), ['hideOverlay', 'hideUtilitySheet', 'closeGlance'],
    'checklist points 1-2 must run before ANY tab is touched (point 4)');
  assert.ok(names.indexOf('closeTab') >= 3, 'no closeTab before overlay/sheet/glance are dismissed');
});

// ---------------------------------------------------------------------------
// deriveWorkspaceBindings / applyWorkspaceBindings: the review round 2
// correction. A windowless (macOS dock-close) holder of a workspace must
// still show up in the derived bindings map, so resolveOpen reports 'focus'
// — never 'swap' — against it. An earlier version of this fix filtered
// these out (liveOnly) and let a second window steal the workspace out from
// under its real owner; these are the regression tests for that.
// ---------------------------------------------------------------------------

test('deriveWorkspaceBindings includes a windowless holder, so resolveOpen says focus, never swap', () => {
  windowRuntimes.resetForTests();
  const holder = windowRuntimes.createRuntime({ id: 'primary' }); // window stays null: never attached
  holder.workspaceId = 'ws_work';
  windowRuntimes.createRuntime({ id: 'window_2' }); // the requester — unbound

  const sandbox = { windowRuntimes };
  vm.runInNewContext(`${deriveSource}\nthis.__derive = deriveWorkspaceBindings;`, sandbox);
  const bindings = sandbox.__derive();

  assert.equal(holder.window, null, 'sanity: the holder really is windowless in this test');
  assert.equal(bindings.ws_work, 'primary', 'a windowless holder must still appear in the derived map');
  assert.deepEqual(
    resolveOpen(bindings, 'ws_work', 'window_2'),
    { action: 'focus', windowId: 'primary' },
    'opening a workspace already held by a windowless runtime must focus (and recreate) it, never steal it'
  );
});

test('applyWorkspaceBindings reconciles a bindingsAfterSwap result onto every runtime, live or not', () => {
  windowRuntimes.resetForTests();
  const dockClosed = windowRuntimes.createRuntime({ id: 'primary' });
  dockClosed.workspaceId = 'ws_other'; // unrelated binding — must survive untouched
  const switching = windowRuntimes.createRuntime({ id: 'window_2' });
  switching.workspaceId = 'ws_stale'; // this window's own previous workspace

  const before = { ws_other: 'primary', ws_stale: 'window_2' };
  const after = bindingsAfterSwap(before, { workspaceId: 'ws_new', windowId: 'window_2' });

  const sandbox = { windowRuntimes };
  vm.runInNewContext(`${applyBindingsSource}\nthis.__applyBindings = applyWorkspaceBindings;`, sandbox);
  sandbox.__applyBindings(after);

  assert.equal(dockClosed.workspaceId, 'ws_other', 'an unrelated windowless holder is left alone');
  assert.equal(switching.workspaceId, 'ws_new',
    "the switching window is bound to its new workspace, its old one released");
});

// ---------------------------------------------------------------------------
// Regression: saveCurrentWindowAsWorkspace must PERSIST the binding pointer.
//
// Found by live quit->relaunch verification, not by any unit test: binding a
// window only mutates memory, and persistSession runs off tab activity — so
// saving a workspace and quitting without touching a tab left session.json
// holding workspaceId: null. The window came back scratch, later edits went
// only to session.json, and reopening the workspace applied its stale
// snapshot over the newer work. That is precisely the data loss the binding
// pointer exists to prevent, so it is locked here.
// ---------------------------------------------------------------------------

const saveAsSource = slice(
  'function saveCurrentWindowAsWorkspace(runtime, name) {',
  '\nfunction switchWindowToWorkspace'
);

test('saveCurrentWindowAsWorkspace is still liftable from main.js', () => {
  assert.ok(saveAsSource, 'saveCurrentWindowAsWorkspace not found — update this test with it');
});

function runSaveAs({ createResult }) {
  const calls = [];
  const runtime = { id: 'win_1', workspaceId: null };
  const sandbox = {
    withWindowRuntime: (_runtime, fn) => fn(),
    workspaceCapture: () => ({ urls: ['https://a.test/'] }),
    namedWorkspaces: {
      create: (args) => { calls.push(['create', args.name]); return createResult; },
    },
    persistSession: () => { calls.push(['persistSession']); },
  };
  vm.runInNewContext(`${saveAsSource}\nthis.__fn = saveCurrentWindowAsWorkspace;`, sandbox);
  const result = sandbox.__fn(runtime, 'Work');
  return { calls, runtime, result };
}

test('a successful save-as binds the window AND persists the pointer', () => {
  const { calls, runtime } = runSaveAs({
    createResult: { ok: true, workspace: { id: 'ws_work' } },
  });
  assert.equal(runtime.workspaceId, 'ws_work', 'window is bound in memory');
  assert.ok(
    calls.some(([name]) => name === 'persistSession'),
    'persistSession must run so session.json carries the pointer — without it the binding is lost on quit',
  );
  // Order matters: the pointer has to be set before the session is written,
  // or persistSession captures the pre-bind (null) value.
  const bindIndex = calls.findIndex(([name]) => name === 'create');
  const persistIndex = calls.findIndex(([name]) => name === 'persistSession');
  assert.ok(persistIndex > bindIndex, 'persist happens after the create/bind');
});

test('a rejected save-as neither binds nor persists', () => {
  const { calls, runtime, result } = runSaveAs({
    createResult: { ok: false, error: 'duplicate-name' },
  });
  assert.equal(runtime.workspaceId, null, 'no binding on failure');
  assert.equal(result.error, 'duplicate-name', 'the error is returned verbatim');
  assert.ok(
    !calls.some(([name]) => name === 'persistSession'),
    'a failed save-as must not write a session entry',
  );
});
