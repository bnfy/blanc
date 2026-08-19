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
// Task 9 follow-up (scratch guard + blank create). switchSource is sliced up
// to createBlankWorkspaceAndSwitch's own declaration (inserted immediately
// after it in main.js) rather than up to applyWorkspaceToWindow, so this
// slice can never accidentally swallow the new function's body too.
const switchSource = slice(
  'function switchWindowToWorkspace(runtime, workspaceId, { force = false } = {}) {',
  '\nfunction createBlankWorkspaceAndSwitch'
);
const createBlankSource = slice(
  'function createBlankWorkspaceAndSwitch(runtime, name, { force = false } = {}) {',
  '\nfunction applyWorkspaceToWindow'
);

test('applyWorkspaceToWindow, deriveWorkspaceBindings, and applyWorkspaceBindings are still liftable from main.js', () => {
  assert.ok(applySource, 'applyWorkspaceToWindow not found — update this test with it');
  assert.ok(deriveSource, 'deriveWorkspaceBindings not found — update this test with it');
  assert.ok(applyBindingsSource, 'applyWorkspaceBindings not found — update this test with it');
});

test('switchWindowToWorkspace and createBlankWorkspaceAndSwitch are still liftable from main.js', () => {
  assert.ok(switchSource, 'switchWindowToWorkspace not found — update this test with it');
  assert.ok(createBlankSource, 'createBlankWorkspaceAndSwitch not found — update this test with it');
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
    // Record the binding AS PERSIST SEES IT. Asserting only that persist
    // runs after create would still pass if someone reordered the two lines
    // so persistSession() ran before the field was set — and that reordering
    // reintroduces the exact bug, because persistSession would capture the
    // pre-bind null.
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

// ---------------------------------------------------------------------------
// Scratch guard integration (Task 9 follow-up, found by hands-on testing):
// switchWindowToWorkspace must consult scratchGuardResult BEFORE resolving
// bindings or applying anything, and force:true must skip that call
// entirely. The DECISION itself (scratchSwitchNeedsGuard) is pure and
// covered in workspaces-model.test.js; what matters here is the WIRING —
// that main.js's switchWindowToWorkspace actually stops at the guard, in
// the right order, and that force really means "skip", not "ignore the
// result".
// ---------------------------------------------------------------------------

function switchHarness({ getWorkspace, guardResult }) {
  const calls = [];
  const sandbox = {
    withWindowRuntime: (_runtime, fn) => fn(),
    namedWorkspaces: {
      get: (id) => { calls.push(['get', id]); return getWorkspace(id); },
      saveCapture: (id) => calls.push(['saveCapture', id]),
    },
    workspaceCapture: () => ({ urls: [] }),
    scratchGuardResult: () => { calls.push(['scratchGuardResult']); return guardResult; },
    deriveWorkspaceBindings: () => { calls.push(['deriveWorkspaceBindings']); return {}; },
    resolveOpen, // real pure function
    windowRuntimes: { all: () => [] },
    createMainWindow: () => calls.push(['createMainWindow']),
    applyWorkspaceToWindow: (_rt, ws) => calls.push(['applyWorkspaceToWindow', ws.id]),
    applyWorkspaceBindings: (bindings) => calls.push(['applyWorkspaceBindings', bindings]),
    bindingsAfterSwap, // real pure function
    persistSession: () => calls.push(['persistSession']),
    sessionPersistenceSuspended: false,
  };
  vm.runInNewContext(`${switchSource}\nthis.__switch = switchWindowToWorkspace;`, sandbox);
  return { calls, run: (runtime, id, opts) => sandbox.__switch(runtime, id, opts) };
}

test('switchWindowToWorkspace returns the scratch guard result untouched, before resolving bindings', () => {
  const h = switchHarness({
    getWorkspace: (id) => (id === 'ws_1' ? { id: 'ws_1', activeIndex: 0 } : null),
    guardResult: { ok: false, error: 'unsaved-scratch', tabCount: 2 },
  });
  const runtime = { id: 'win_1', workspaceId: null, tabOrder: [] };
  const result = h.run(runtime, 'ws_1');
  assert.deepEqual(result, { ok: false, error: 'unsaved-scratch', tabCount: 2 });
  assert.deepEqual(
    h.calls.map((c) => c[0]), ['get', 'scratchGuardResult'],
    'must stop at the guard — no outbound save, no binding resolution, no apply'
  );
});

test('switchWindowToWorkspace with force:true skips the guard call entirely and completes the swap', () => {
  const h = switchHarness({
    getWorkspace: (id) => (id === 'ws_1' ? { id: 'ws_1', activeIndex: 0 } : null),
    guardResult: { ok: false, error: 'unsaved-scratch', tabCount: 2 }, // would fire if checked
  });
  const runtime = { id: 'win_1', workspaceId: null, tabOrder: [] };
  const result = h.run(runtime, 'ws_1', { force: true });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'swap');
  assert.ok(!h.calls.some(([name]) => name === 'scratchGuardResult'), 'force:true must never call the guard');
  assert.ok(h.calls.some(([name]) => name === 'applyWorkspaceToWindow'), 'the swap must actually apply');
});

test('switchWindowToWorkspace with no guard hit (bound window, or nothing worth confirming) proceeds normally', () => {
  const h = switchHarness({
    getWorkspace: (id) => (id === 'ws_1' ? { id: 'ws_1', activeIndex: 0 } : null),
    guardResult: null, // scratchGuardResult's own "safe to proceed" answer
  });
  const runtime = { id: 'win_1', workspaceId: null, tabOrder: [] };
  const result = h.run(runtime, 'ws_1');
  assert.equal(result.ok, true);
  assert.deepEqual(h.calls[0], ['get', 'ws_1']);
  assert.deepEqual(h.calls[1], ['scratchGuardResult']);
  assert.ok(h.calls.some(([name]) => name === 'applyWorkspaceToWindow'));
});

// ---------------------------------------------------------------------------
// createBlankWorkspaceAndSwitch (Task 9 follow-up): the missing "create"
// operation. Patron-gated, scratch-guarded BEFORE the record is created (a
// cancelled confirmation must never leave an orphan empty workspace behind),
// and delegates the actual bind+apply to switchWindowToWorkspace itself —
// these tests stub that delegate rather than re-verifying its internals
// (already covered above and in the applyWorkspaceToWindow tests).
// ---------------------------------------------------------------------------

function createBlankHarness({ patronActive, guardResult, createResult, switchResult }) {
  const calls = [];
  const sandbox = {
    withWindowRuntime: (_runtime, fn) => fn(),
    settings: { isPatronActive: () => { calls.push(['isPatronActive']); return patronActive; } },
    scratchGuardResult: () => { calls.push(['scratchGuardResult']); return guardResult; },
    namedWorkspaces: { create: (args) => { calls.push(['create', args]); return createResult; } },
    switchWindowToWorkspace: (_rt, id, opts) => { calls.push(['switchWindowToWorkspace', id, opts]); return switchResult; },
  };
  vm.runInNewContext(`${createBlankSource}\nthis.__fn = createBlankWorkspaceAndSwitch;`, sandbox);
  return { calls, run: (runtime, name, opts) => sandbox.__fn(runtime, name, opts) };
}

test('createBlankWorkspaceAndSwitch refuses a non-Patron before touching the guard or the store', () => {
  const h = createBlankHarness({ patronActive: false });
  const result = h.run({ id: 'win_1', workspaceId: null }, 'Work');
  // JSON round-trip, not a bare deepEqual: this literal is constructed
  // INSIDE the vm-lifted source, so it carries the vm realm's
  // Object.prototype — deepStrictEqual's reference check on that alone
  // fails even though every enumerable value matches (see the file header's
  // "opts" comment on the very first test above for the same reasoning).
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, error: 'not-patron' });
  assert.deepEqual(
    h.calls.map((c) => c[0]), ['isPatronActive'],
    'a lapsed Patron must be refused before the scratch guard runs or a record is created'
  );
});

test('createBlankWorkspaceAndSwitch returns the scratch guard result and never creates a record', () => {
  const h = createBlankHarness({
    patronActive: true,
    guardResult: { ok: false, error: 'unsaved-scratch', tabCount: 3 },
  });
  const result = h.run({ id: 'win_1', workspaceId: null }, 'Work');
  assert.deepEqual(result, { ok: false, error: 'unsaved-scratch', tabCount: 3 });
  assert.ok(
    !h.calls.some(([name]) => name === 'create'),
    'a cancelled confirmation must never leave an orphan empty workspace'
  );
});

test('createBlankWorkspaceAndSwitch with force:true skips the guard, creates an EMPTY capture, and switches with force:true', () => {
  const h = createBlankHarness({
    patronActive: true,
    guardResult: { ok: false, error: 'unsaved-scratch', tabCount: 3 }, // would fire if checked
    createResult: { ok: true, workspace: { id: 'ws_new' } },
    switchResult: { ok: true, action: 'swap' },
  });
  const result = h.run({ id: 'win_1', workspaceId: null }, 'Work', { force: true });
  // JSON round-trips below: both the final result (built via `{ ...switched,
  // workspaceId }` inside the lifted source) and the create() call's args
  // (a nested object literal, also written inside that source) carry the vm
  // realm's Object.prototype — see the "refuses a non-Patron" test above.
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, action: 'swap', workspaceId: 'ws_new' });
  assert.ok(!h.calls.some(([name]) => name === 'scratchGuardResult'), 'force:true must skip the guard');
  assert.deepEqual(
    JSON.parse(JSON.stringify(h.calls.find((c) => c[0] === 'create')[1])),
    { name: 'Work', capture: { urls: [], activeIndex: 0, groups: [], groupIds: [], pinned: [], meta: [] } },
  );
  const switchCall = h.calls.find((c) => c[0] === 'switchWindowToWorkspace');
  assert.equal(switchCall[1], 'ws_new');
  assert.equal(switchCall[2].force, true, 'binds+applies through the SAME path a normal switch uses');
});

test('createBlankWorkspaceAndSwitch surfaces a create failure without ever switching', () => {
  const h = createBlankHarness({
    patronActive: true,
    guardResult: null,
    createResult: { ok: false, error: 'duplicate-name' },
  });
  const result = h.run({ id: 'win_1', workspaceId: null }, 'Work');
  assert.deepEqual(result, { ok: false, error: 'duplicate-name' });
  assert.ok(!h.calls.some(([name]) => name === 'switchWindowToWorkspace'));
});
