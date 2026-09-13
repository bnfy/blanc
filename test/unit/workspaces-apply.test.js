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
// Task 9 follow-up (scratch guard + blank create). switchSource is sliced up
// to createBlankWorkspaceAndSwitch's own declaration (inserted immediately
// after it in main.js) rather than up to applyWorkspaceToWindow, so this
// slice can never accidentally swallow the new function's body too.

test('persisted workspace materialization remains accessible to its behavioral harness', () => {
  assert.ok(applySource);
});

const scratchGuardSource = slice('function scratchGuardResult(runtime) {', '\nfunction saveCurrentWindowAsWorkspace');

test('scratchGuardResult feeds live tabs to the model, not persistableEntries', () => {
  assert.ok(scratchGuardSource, 'scratchGuardResult not found — update this test with it');
  assert.match(scratchGuardSource, /scratchSwitchGuardResult\(/);
  assert.doesNotMatch(scratchGuardSource, /persistableEntries/,
    'persistableEntries drops private tabs, which apply still closes with no recovery');
  assert.match(scratchGuardSource, /runtime\.tabOrder\.map/);
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

test('materialization refuses occupied runtimes without closing any page', () => {
  const runtime = { tabOrder: ['old_1', 'old_2'], groups: [] };
  const h = applyHarness(runtime);
  assert.throws(() => h.apply(WORKSPACE()), /empty runtime/);
  assert.equal(h.calls.some((c) => c[0] === 'closeTab'), false);
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
  const runtime = { tabOrder: [], groups: [] };
  const workspace = WORKSPACE({ urls: [], groupIds: [], pinned: [], meta: [], activeIndex: 0 });
  const h = applyHarness(runtime);
  h.apply(workspace);
  const creates = h.calls.filter((c) => c[0] === 'createTab');
  assert.equal(creates.length, 1, 'exactly one fallback tab — never zero (tabless) and never more than one');
  assert.equal(creates[0][1], NEW_TAB_URL, "the floor is the blank internal newtab, not the user's home page");
});

test('staging dismisses floating chrome before creating the saved tabs', () => {
  const runtime = { tabOrder: [], groups: [] };
  const h = applyHarness(runtime);
  h.apply(WORKSPACE());
  const names = h.calls.map((c) => c[0]);
  assert.deepEqual(names.slice(0, 3), ['hideOverlay', 'hideUtilitySheet', 'closeGlance'],
    'checklist points 1-2 must run before ANY tab is touched (point 4)');
  assert.ok(names.indexOf('createTab') >= 3); assert.equal(names.includes('closeTab'), false);
});

const saveAsSource = slice(
  'function saveCurrentWindowAsWorkspace(runtime, name) {',
  '\nfunction switchWindowToWorkspace'
);

test('saveCurrentWindowAsWorkspace is still liftable from main.js', () => {
  assert.ok(saveAsSource, 'saveCurrentWindowAsWorkspace not found — update this test with it');
});

function runSaveAs({ createResult, commitResult = { ok: true } }) {
  const calls = [];
  const runtime = { id: 'win_1', workspaceId: null };
  const sandbox = {
    withWindowRuntime: (_runtime, fn) => fn(),
    workspaceCapture: () => ({ urls: ['https://a.test/'] }),
    namedWorkspaces: {
      create: (args) => { calls.push(['create', args.name]); return createResult; },
    },
    // Record the binding AS PERSIST SEES IT. Asserting only that persist
    // runs after create would still pass if someone reordered the two lines
    // so persistSession() ran before the field was set — and that reordering
    // reintroduces the exact bug, because persistSession would capture the
    // pre-bind null.
    flushWorkspaceSession: () => commitResult,
    persistSession: () => { calls.push(['persistSession', runtime.workspaceId]); },
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
  // Order matters: the pointer has to be SET before the session is written,
  // or persistSession captures the pre-bind (null) value and the binding is
  // still lost on quit.
  const persistCall = calls.find(([name]) => name === 'persistSession');
  assert.equal(
    persistCall[1], 'ws_work',
    'runtime.workspaceId must already be set when persistSession runs — otherwise it writes null',
  );
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

test('a save-as whose session binding fails reports the durable workspace id truthfully', () => {
  const { calls, runtime, result } = runSaveAs({
    createResult: { ok: true, workspace: { id: 'ws_saved' } },
    commitResult: { ok: false, error: 'storage-failed' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'saved-not-opened');
  assert.equal(result.cause, 'storage-failed');
  assert.equal(result.workspaceId, 'ws_saved');
  assert.equal(runtime.workspaceId, null, 'the failed session pointer is rolled back');
  assert.equal(calls.some(([name]) => name === 'persistSession'), false);
});

// Switching/guard coverage imports workspace-controller directly.
