# Window-Runtime Foundation (1.1 M1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every per-window global in `main.js` behind a window-runtime boundary with exactly one runtime, changing no behavior.

**Architecture:** A pure registry module owns runtime records and chrome-surface routing; `AsyncLocalStorage` carries the owning runtime through late callbacks with a strict throw under `acceptanceTestMode`; a pure session-workspace module versions `session.json` (v1 + v0 rollback mirror with legacy-writer-wins precedence). main.js state moves cluster by mechanical cluster, each sweep gated by a zero-bare-identifier grep and the full suite.

**Tech Stack:** Electron 43.3.0 main process (CommonJS), `node:async_hooks` AsyncLocalStorage, `node:test` unit tests, Cucumber/Playwright acceptance suite.

**Spec:** `docs/superpowers/specs/2026-08-08-window-runtime-foundation-design.md`
**Roadmap:** `docs/superpowers/specs/2026-08-08-blanc-1-1-roadmap.md`

## Global Constraints

- **Zero behavior change.** The existing 365 unit tests and 64 acceptance scenarios / 425 steps pass **unchanged**. No new acceptance scenario, no renderer diff, no new IPC channel.
- Strict-ALS throws only under `acceptanceTestMode` (`!app.isPackaged && process.env.BLANC_TEST === '1'`, `main.js:73`) — never the raw env var (packaged smokes launch packaged builds with `BLANC_TEST=1`).
- The state inventory in the spec is the contract: new per-window flags may be *added* as discovered, but nothing listed may be recategorized without a spec amendment.
- `recentlyClosedUrls` stays app-global. The `tabs` Map stays process-wide (tab records gain `runtimeId`).
- Session persistence guards carry over verbatim: no save while quitting / suspended / zero tabs; `activeIndex` only updates when the active tab is in the persisted list.
- The bare `win` binding is **deleted** by the end (Task 12) — no alias survives.
- Every sweep task ends with: `node --check src/main/main.js`, a **zero-count grep gate** for the bare identifiers it moved, `npm run test:unit`, and the full live acceptance suite.
- Work in a dedicated worktree branched off current `main`; never touch the shared checkout.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/main/window-runtime-registry.js` (new, pure) | Runtime records, tab-ownership index, chrome-surface registration, window attach/detach. No Electron imports. |
| `src/main/session-workspace.js` (new, pure) | v0/v1 load with legacy-writer-wins precedence, v1+mirror save shape, future-version read-only signal. No Electron imports. |
| `src/main/main.js` | Loses ~20 module globals to the runtime record; gains `currentRuntime()`/`bindWindowRuntime()` and sanctioned-root bindings. |
| `test/unit/window-runtime-registry.test.js` (new) | Registry + lifecycle fixtures. |
| `test/unit/session-workspace.test.js` (new) | Shape, precedence, mirror, guard fixtures. |
| `CLAUDE.md` | The "single source of truth" paragraph updated to describe the runtime. |

Task order: pure modules first (1–2), ALS core (3), state sweeps smallest-risk-first (4–8), routing + roots (9–10), persistence (11), `win` deletion + lifecycle (12), docs + final gates (13).

---

## Task 1: The runtime registry (pure)

**Files:**
- Create: `src/main/window-runtime-registry.js`
- Test: `test/unit/window-runtime-registry.test.js`

**Interfaces:**
- Produces: `createRuntime()`, `all()`, `attachTab(runtime, tabId)`, `detachTab(tabId)`, `runtimeForTab(tabId)`, `registerChromeSurface(runtime, wcId)`, `unregisterChromeSurface(wcId)`, `runtimeForChromeWebContentsId(wcId)`, `attachWindow(runtime, { window })`, `detachWindow(runtime)`, `resetForTests()`.

- [ ] **Step 1: Write the failing tests**

Create `test/unit/window-runtime-registry.test.js`:

```js
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const reg = require('../../src/main/window-runtime-registry');

beforeEach(() => reg.resetForTests());

test('createRuntime initializes the per-window inventory to main.js defaults', () => {
  const r = reg.createRuntime();
  assert.equal(r.window, null);
  assert.deepEqual(r.tabOrder, []);
  assert.equal(r.activeTabId, null);
  assert.deepEqual(r.groups, []);
  assert.equal(r.overlayView, null);
  assert.equal(r.overlayMode, null);
  assert.equal(r.overlayPrefill, null);
  assert.equal(r.shieldAnchorRight, null);
  assert.equal(r.shieldPopoverHost, null);
  assert.equal(r.shieldTrigger, null);
  assert.equal(r.utilitySheetView, null);
  assert.equal(r.utilitySheetUrl, null);
  assert.ok(r.tabsWantingAddressBarFocus instanceof Set);
  assert.equal(r.chromeHeight, 64);
  assert.equal(r.tabsBroadcastTimer, null);
  assert.equal(r.themeTintRefreshGeneration, 0);
  assert.ok(r.lastActiveByCluster instanceof Map);
  assert.equal(r.onePasswordFillInFlight, false);
  assert.equal(r.railActivationSerial, 0);
  assert.ok(r.permissionPrompts instanceof Map);
  assert.ok(Number.isInteger(r.id));
  assert.equal(reg.all().length, 1);
});

test('tab ownership: attach, resolve, detach', () => {
  const r = reg.createRuntime();
  reg.attachTab(r, 7);
  assert.equal(reg.runtimeForTab(7), r);
  reg.detachTab(7);
  assert.equal(reg.runtimeForTab(7), null);
  assert.equal(reg.runtimeForTab(99), null);
});

test('chrome surfaces: register both, resolve either, unregister independently', () => {
  const r = reg.createRuntime();
  reg.registerChromeSurface(r, 11); // strip
  reg.registerChromeSurface(r, 22); // overlay
  assert.equal(reg.runtimeForChromeWebContentsId(11), r);
  assert.equal(reg.runtimeForChromeWebContentsId(22), r);
  reg.unregisterChromeSurface(22); // overlay destroyed, strip lives on
  assert.equal(reg.runtimeForChromeWebContentsId(22), null);
  assert.equal(reg.runtimeForChromeWebContentsId(11), r);
});

test('detachWindow: workspace survives, window and surfaces do not', () => {
  const r = reg.createRuntime();
  const fakeWin = {};
  reg.attachWindow(r, { window: fakeWin });
  reg.registerChromeSurface(r, 11);
  reg.registerChromeSurface(r, 22);
  reg.attachTab(r, 7);
  r.tabOrder.push(7);
  r.activeTabId = 7;
  r.groups.push({ id: 'g1', name: 'work', collapsed: false });

  reg.detachWindow(r);

  assert.equal(r.window, null);
  assert.equal(r.overlayView, null);
  assert.equal(r.utilitySheetView, null);
  // Late IPC from the dying chrome resolves to nothing:
  assert.equal(reg.runtimeForChromeWebContentsId(11), null);
  assert.equal(reg.runtimeForChromeWebContentsId(22), null);
  // The workspace is untouched (macOS dock-reopen contract):
  assert.deepEqual(r.tabOrder, [7]);
  assert.equal(r.activeTabId, 7);
  assert.equal(r.groups.length, 1);
  assert.equal(reg.runtimeForTab(7), r);
});

test('detach then reattach: replacement window binds, new surfaces resolve', () => {
  const r = reg.createRuntime();
  reg.attachWindow(r, { window: {} });
  reg.registerChromeSurface(r, 11);
  reg.detachWindow(r);

  const replacement = {};
  reg.attachWindow(r, { window: replacement });
  reg.registerChromeSurface(r, 33);
  assert.equal(r.window, replacement);
  assert.equal(reg.runtimeForChromeWebContentsId(33), r);
  assert.equal(reg.runtimeForChromeWebContentsId(11), null, 'stale id must stay dead');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL — cannot find module `window-runtime-registry`.

- [ ] **Step 3: Implement**

Create `src/main/window-runtime-registry.js`:

```js
// Pure per-window runtime records for the 1.1 architecture (design:
// docs/superpowers/specs/2026-08-08-window-runtime-foundation-design.md).
// M1 instantiates exactly one runtime; M2 adds more. No Electron imports —
// windows and views are opaque references here, which is what keeps the
// lifecycle unit-testable.

let nextId = 1;
let runtimes = [];
const tabOwner = new Map(); // tabId -> runtime
const surfaceOwner = new Map(); // chrome webContents id -> runtime

/** The full per-window inventory, initialized to main.js's current defaults.
 * The spec's state-inventory table is the contract for this shape. */
function createRuntime() {
  const runtime = {
    id: nextId++,
    window: null,
    tabOrder: [],
    activeTabId: null,
    groups: [],
    overlayView: null,
    overlayMode: null,
    overlayPrefill: null,
    shieldAnchorRight: null,
    shieldPopoverHost: null,
    shieldTrigger: null,
    utilitySheetView: null,
    utilitySheetUrl: null,
    tabsWantingAddressBarFocus: new Set(),
    chromeHeight: 64,
    tabsBroadcastTimer: null,
    themeTintRefreshGeneration: 0,
    lastActiveByCluster: new Map(),
    onePasswordFillInFlight: false,
    railActivationSerial: 0,
    permissionPrompts: new Map(),
  };
  runtimes.push(runtime);
  return runtime;
}

const all = () => [...runtimes];

function attachTab(runtime, tabId) { tabOwner.set(tabId, runtime); }
function detachTab(tabId) { tabOwner.delete(tabId); }
const runtimeForTab = (tabId) => tabOwner.get(tabId) ?? null;

/** A runtime routes IPC from TWO chrome surfaces with different lifecycles:
 * the strip (window-long) and the overlay (created lazily, destroyable).
 * Each creation registers; each destruction unregisters. */
function registerChromeSurface(runtime, wcId) { surfaceOwner.set(wcId, runtime); }
function unregisterChromeSurface(wcId) { surfaceOwner.delete(wcId); }
const runtimeForChromeWebContentsId = (wcId) => surfaceOwner.get(wcId) ?? null;

function attachWindow(runtime, { window }) { runtime.window = window; }

/** macOS window close: the window, overlay, and sheet die; the workspace
 * (tabs, selection, groups) survives for dock-reopen. Every surface the
 * runtime still holds is unregistered so late IPC from the dying chrome
 * resolves to nothing rather than to a window that no longer exists. */
function detachWindow(runtime) {
  for (const [wcId, owner] of surfaceOwner) {
    if (owner === runtime) surfaceOwner.delete(wcId);
  }
  runtime.window = null;
  runtime.overlayView = null;
  runtime.overlayMode = null;
  runtime.overlayPrefill = null;
  runtime.utilitySheetView = null;
  runtime.utilitySheetUrl = null;
}

/** Test isolation only — main.js never resets. */
function resetForTests() {
  nextId = 1;
  runtimes = [];
  tabOwner.clear();
  surfaceOwner.clear();
}

module.exports = {
  createRuntime,
  all,
  attachTab,
  detachTab,
  runtimeForTab,
  registerChromeSurface,
  unregisterChromeSurface,
  runtimeForChromeWebContentsId,
  attachWindow,
  detachWindow,
  resetForTests,
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit`
Expected: PASS, count rises 365 → 370.

- [ ] **Step 5: Commit**

```bash
git add src/main/window-runtime-registry.js test/unit/window-runtime-registry.test.js
git commit -m "feat(runtime): pure window-runtime registry with surface and lifecycle contracts"
```

---

## Task 2: Session workspace (pure)

**Files:**
- Create: `src/main/session-workspace.js`
- Test: `test/unit/session-workspace.test.js`

**Interfaces:**
- Produces: `loadWorkspace(data) -> { windows: [entry], readOnly: boolean }` where `entry = { urls, activeIndex, groups, groupIds, pinned }`; `buildSaveShape(entry, existing) -> object` (v1 + mirror, preserving foreign keys it does not own).

- [ ] **Step 1: Write the failing tests**

Create `test/unit/session-workspace.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadWorkspace, buildSaveShape } = require('../../src/main/session-workspace');

const ENTRY = {
  urls: ['https://a.example/', 'https://b.example/'],
  activeIndex: 1,
  groups: [{ id: 'g1', name: 'work', collapsed: false }],
  groupIds: ['g1', null],
  pinned: [false, true],
};
const EMPTY = { urls: [], activeIndex: 0, groups: [], groupIds: [], pinned: [] };

test('v0 (version-less flat file) loads as one window', () => {
  const { windows, readOnly } = loadWorkspace({ ...ENTRY });
  assert.equal(readOnly, false);
  assert.deepEqual(windows, [ENTRY]);
});

test('empty or missing data loads as one empty window', () => {
  for (const data of [undefined, null, {}, { urls: [] }]) {
    const { windows } = loadWorkspace(data);
    assert.deepEqual(windows, [EMPTY], JSON.stringify(data));
  }
});

test('v1 with an agreeing mirror loads windows[0]', () => {
  const file = { version: 1, windows: [ENTRY], ...ENTRY };
  const { windows, readOnly } = loadWorkspace(file);
  assert.equal(readOnly, false);
  assert.deepEqual(windows, [ENTRY]);
});

test('rollback → re-upgrade: a diverged mirror wins over the stale nested workspace', () => {
  // 1.0.9's JsonStore.update() rewrote the flat fields in place and PRESERVED
  // the unknown version/windows keys — so divergence means the legacy writer
  // wrote last, and v1 is rebuilt from the mirror.
  const staleNested = { ...ENTRY, urls: ['https://old.example/'], groupIds: [null], pinned: [false], activeIndex: 0 };
  const file = { version: 1, windows: [staleNested], ...ENTRY };
  const { windows, readOnly } = loadWorkspace(file);
  assert.equal(readOnly, false);
  assert.deepEqual(windows, [ENTRY], 'mirror (legacy writer) must win');
});

test('unknown future version loads from the mirror, read-only', () => {
  const file = { version: 2, windows: [ENTRY], somethingNew: true, ...ENTRY };
  const { windows, readOnly } = loadWorkspace(file);
  assert.equal(readOnly, true, 'a 1.1 build must never rewrite a newer format');
  assert.deepEqual(windows, [ENTRY]);
});

test('unknown future version with an unparseable mirror loads empty, read-only', () => {
  const { windows, readOnly } = loadWorkspace({ version: 2, windows: 'opaque' });
  assert.equal(readOnly, true);
  assert.deepEqual(windows, [EMPTY]);
});

test('buildSaveShape writes v1 plus a mirror shape-identical to the 1.0.9 writer', () => {
  const shape = buildSaveShape(ENTRY, {});
  assert.equal(shape.version, 1);
  assert.deepEqual(shape.windows, [ENTRY]);
  // The mirror IS the 1.0.9 persistSession shape: exactly these five keys.
  assert.deepEqual(shape.urls, ENTRY.urls);
  assert.equal(shape.activeIndex, ENTRY.activeIndex);
  assert.deepEqual(shape.groups, ENTRY.groups);
  assert.deepEqual(shape.groupIds, ENTRY.groupIds);
  assert.deepEqual(shape.pinned, ENTRY.pinned);
});

test('buildSaveShape preserves foreign keys it does not own', () => {
  const shape = buildSaveShape(ENTRY, { futureKey: { keep: true } });
  assert.deepEqual(shape.futureKey, { keep: true });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:unit`
Expected: FAIL — cannot find module `session-workspace`.

- [ ] **Step 3: Implement**

Create `src/main/session-workspace.js`:

```js
// Versioned workspace persistence for session.json (design:
// docs/superpowers/specs/2026-08-08-window-runtime-foundation-design.md).
// Pure functions over plain objects; main.js owns the JsonStore.

const EMPTY_ENTRY = () => ({ urls: [], activeIndex: 0, groups: [], groupIds: [], pinned: [] });

function entryFrom(source) {
  if (!source || typeof source !== 'object') return EMPTY_ENTRY();
  return {
    urls: Array.isArray(source.urls) ? source.urls : [],
    activeIndex: Number.isInteger(source.activeIndex) ? source.activeIndex : 0,
    groups: Array.isArray(source.groups) ? source.groups : [],
    groupIds: Array.isArray(source.groupIds) ? source.groupIds : [],
    pinned: Array.isArray(source.pinned) ? source.pinned : [],
  };
}

const sameEntry = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Load with rollback → re-upgrade precedence. 1.0.9's JsonStore.update()
 * mutates the stored object in place and persists it whole, so a rolled-back
 * legacy build rewrites the flat mirror while PRESERVING the unknown
 * version/windows keys. Divergence between mirror and nested workspace
 * therefore means the legacy writer wrote last — the mirror wins and v1 is
 * rebuilt from it. Unknown future versions are read-only: best-effort load,
 * never rewritten by this build. */
function loadWorkspace(data) {
  if (!data || typeof data !== 'object') return { windows: [EMPTY_ENTRY()], readOnly: false };
  const mirror = entryFrom(data);
  if (!Number.isInteger(data.version)) {
    return { windows: [mirror], readOnly: false }; // v0: today's flat file
  }
  if (data.version > 1) {
    return { windows: [mirror], readOnly: true };
  }
  const nested = Array.isArray(data.windows) && data.windows.length
    ? entryFrom(data.windows[0])
    : null;
  if (!nested || !sameEntry(nested, mirror)) {
    return { windows: [mirror], readOnly: false }; // legacy writer won
  }
  return { windows: [nested], readOnly: false };
}

/** v1 + the v0 mirror of the focused window. The mirror is exactly the five
 * keys 1.0.9's persistSession writes, so a rollback restores tabs. Foreign
 * keys already in the store are preserved, mirroring JsonStore.update()'s
 * in-place semantics. */
function buildSaveShape(focusedEntry, existing) {
  const entry = entryFrom(focusedEntry);
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    version: 1,
    windows: [entry],
    urls: entry.urls,
    activeIndex: entry.activeIndex,
    groups: entry.groups,
    groupIds: entry.groupIds,
    pinned: entry.pinned,
  };
}

module.exports = { loadWorkspace, buildSaveShape, entryFrom };
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:unit`
Expected: PASS, count rises 370 → 378.

- [ ] **Step 5: Commit**

```bash
git add src/main/session-workspace.js test/unit/session-workspace.test.js
git commit -m "feat(runtime): versioned session workspace with legacy-writer-wins precedence"
```

---

## Task 3: ALS core in main.js

**Files:**
- Modify: `src/main/main.js` (near the top, after `acceptanceTestMode` at `:73`; and `createMainWindow`)

**Interfaces:**
- Consumes: registry from Task 1.
- Produces: `currentRuntime()`, `bindWindowRuntime(runtime, fn)`, `primaryRuntime` created in `createMainWindow()`, surfaces registered for strip and overlay.

- [ ] **Step 1: Add the core**

After the `acceptanceTestMode` block in `src/main/main.js`:

```js
const { AsyncLocalStorage } = require('node:async_hooks');
const windowRuntimes = require('./window-runtime-registry');

// The owning window-runtime for the current async execution — set by
// bindWindowRuntime at every event registration and sanctioned root, carried
// through timers and late callbacks by AsyncLocalStorage.
const windowRuntimeContext = new AsyncLocalStorage();

/** M1 has exactly one runtime; created in createMainWindow. */
let primaryRuntime = null;

/** Wrap a callback so it (and everything it schedules) resolves to `runtime`. */
function bindWindowRuntime(runtime, fn) {
  return (...args) => windowRuntimeContext.run(runtime, () => fn(...args));
}

/** The runtime owning the current execution. Outside any binding: the single
 * runtime in production, a THROW under acceptanceTestMode — so the acceptance
 * suite detects every runtime-dependent unbound path it executes. */
function currentRuntime() {
  const bound = windowRuntimeContext.getStore();
  if (bound) return bound;
  if (acceptanceTestMode) {
    throw new Error('currentRuntime() outside any bindWindowRuntime scope');
  }
  return primaryRuntime;
}
```

- [ ] **Step 2: Create the runtime and register surfaces**

In `createMainWindow()`, immediately after the `BrowserWindow` is constructed:

```js
  primaryRuntime ??= windowRuntimes.createRuntime();
  windowRuntimes.attachWindow(primaryRuntime, { window: win });
  windowRuntimes.registerChromeSurface(primaryRuntime, win.webContents.id);
```

In `createOverlay()` (where `overlayView` is constructed), after construction:

```js
  windowRuntimes.registerChromeSurface(primaryRuntime, overlayView.webContents.id);
```

Nothing consumes `currentRuntime()` yet — this task is scaffolding with the strict gate armed.

- [ ] **Step 3: Verify nothing changed**

Run: `node --check src/main/main.js && npm run test:unit && npm run test:acceptance:desktop`
Expected: 378 unit, 64/64 acceptance. The strict throw exists but no call site reaches it.

- [ ] **Step 4: Commit**

```bash
git add src/main/main.js
git commit -m "feat(runtime): ALS context, strict acceptanceTestMode gate, surface registration"
```

---

## Task 4: Sweep — shield + overlay cluster

**Files:**
- Modify: `src/main/main.js`

**Interfaces:**
- Consumes: `currentRuntime()` (aliased locally as `rt`).
- Produces: `overlayView/overlayMode/overlayPrefill/shieldAnchorRight/shieldPopoverHost/shieldTrigger` live only on the runtime.

The sweep pattern used by this and every later sweep task — mechanical, verifiable, reviewable:

- [ ] **Step 1: Add the accessor alias once** (top of main.js, next to `currentRuntime`):

```js
/** Terse accessor for per-window state. Every former module global reads
 * through here, which is what makes the ownership boundary greppable. */
const rt = currentRuntime;
```

- [ ] **Step 2: Shadow check** — confirm no local declarations shadow the names being swept:

Run: `grep -nE "(function |\()\s*(overlayView|overlayMode|overlayPrefill|shieldAnchorRight|shieldPopoverHost|shieldTrigger)\b|\b(let|const|var) (overlayView|overlayMode|overlayPrefill|shieldAnchorRight|shieldPopoverHost|shieldTrigger)\b" src/main/main.js`
Expected: ONLY the six module-level declarations (`:631-:648`). If a local shadow appears, rename it first, in its own commit.

- [ ] **Step 3: Delete the six declarations, sweep the references**

Delete lines `631–648`'s `let overlayView/overlayMode/overlayPrefill/shieldAnchorRight/shieldPopoverHost/shieldTrigger` declarations (keep their comments, moving them onto the registry fields if valuable). Then:

```bash
perl -pi -e 's/\b(overlayView|overlayMode|overlayPrefill|shieldAnchorRight|shieldPopoverHost|shieldTrigger)\b/rt().$1/g unless m{^\s*//}' src/main/main.js
perl -pi -e 's/rt\(\)\.rt\(\)\./rt()./g' src/main/main.js
```

Then hand-fix the mechanical residue — there will be a handful:
- `rt().overlayView = new WebContentsView(...)` in `createOverlay` is correct as-is.
- Any occurrence inside a template string or renderer-bound string must be reverted by hand (grep step 4 catches them).

- [ ] **Step 4: Zero-count gate + hand-audit**

```bash
grep -cE "(?<!\.)\b(overlayView|overlayMode|overlayPrefill|shieldAnchorRight|shieldPopoverHost|shieldTrigger)\b" src/main/main.js || true
grep -nE "\b(overlayView|overlayMode|overlayPrefill|shieldAnchorRight|shieldPopoverHost|shieldTrigger)\b" src/main/main.js | grep -v "rt()\." | grep -v "^\s*//"
```
Expected: the second grep prints nothing.

- [ ] **Step 5: Verify, then commit**

Run: `node --check src/main/main.js && npm run test:unit && npm run test:acceptance:desktop`
Expected: 378 unit, 64/64 acceptance — the shield scenarios (`@F12-3..9`) are the live proof this cluster still routes.

```bash
git add src/main/main.js
git commit -m "refactor(runtime): overlay and shield state lives on the runtime"
```

---

## Task 5: Sweep — utility sheet + focus + geometry cluster

**Files:**
- Modify: `src/main/main.js`

Same five-step pattern as Task 4 for: `utilitySheetView`, `utilitySheetUrl`, `tabsWantingAddressBarFocus`, `chromeHeight`, `themeTintRefreshGeneration`, `railActivationSerial`. Declarations at `:837`, `:839`, `:568`, `:613`, `:463`, `:2107`.

- [ ] Shadow check (same grep shape, these six names)
- [ ] Delete declarations; perl sweep; fix residue
- [ ] Zero-count gate: `grep -nE "\b(utilitySheetView|utilitySheetUrl|tabsWantingAddressBarFocus|chromeHeight|themeTintRefreshGeneration|railActivationSerial)\b" src/main/main.js | grep -v "rt()\." | grep -v "^\s*//"` → nothing
- [ ] `node --check` + full unit + full acceptance (the utility-sheet scenarios F16-* and vertical-tabs F28-* exercise this cluster live)
- [ ] Commit: `refactor(runtime): sheet, focus-reclaim, and chrome-geometry state on the runtime`

---

## Task 6: Sweep — workspace cluster (tabOrder, activeTabId, groups, lastActiveByCluster)

**Files:**
- Modify: `src/main/main.js`

The highest-reference sweep (30 + 67 + 34 uses). Same pattern, two extra cautions:

- [ ] Shadow check: `groups` appears as a parameter/property in session code (`d.groups`, destructures). Property accesses (`d.groups`, `s.groups`, `payload.groups`) are NOT bare identifiers and must not be swept — the perl word-boundary sweep would rewrite them; use this stricter sweep that skips property access:

```bash
perl -pi -e 's/(?<![.\w])(tabOrder|activeTabId|groups|lastActiveByCluster)\b/rt().$1/g unless m{^\s*//}' src/main/main.js
perl -pi -e 's/rt\(\)\.rt\(\)\./rt()./g' src/main/main.js
```

- [ ] Hand-audit every `groups` hit afterward — the object-literal shorthand `{ tabs: serialized, activeTabId, groups, ... }` in `broadcastTabs()` becomes invalid after sweeping; rewrite those literals explicitly:

```js
  const runtime = rt();
  const payload = {
    tabs: serialized,
    activeTabId: runtime.activeTabId,
    groups: runtime.groups,
    ...
  };
```

- [ ] Zero-count gate (same shape as Task 4) → nothing
- [ ] `node --check` + full unit + **full acceptance** — tab lifecycle, groups, session scenarios all drive this cluster
- [ ] Commit: `refactor(runtime): the tab workspace lives on the runtime`

---

## Task 7: Sweep — broadcast timer + 1Password flag

**Files:**
- Modify: `src/main/main.js`

Same pattern for `tabsBroadcastTimer` (`:1113`) and `onePasswordFillInFlight` (`:1494`).

- [ ] Sweep both; zero-count gate; hand-audit
- [ ] **1Password referent swap, same task** (spec: "runtime-scoped reads"): in the fill flow, replace each `win.isFocused()` (`:762`, `:772`, `:1553`) and `dialog.showMessageBox(win, ...)` (`:310`, `:1527`) with the *owning runtime's* window — `rt().window.isFocused()` / `dialog.showMessageBox(rt().window, ...)`. The flow runs inside tab-event bindings (Task 9 wires them), so `rt()` resolves to the tab's owner. With n=1 behavior is identical.
- [ ] `node --check` + full unit + full acceptance
- [ ] Commit: `refactor(runtime): broadcast debounce and 1Password fill state runtime-owned`

---

## Task 8: Permission prompts — ownership and scoped flush

**Files:**
- Modify: `src/main/main.js:600-610` (prompt map), `:3255-3270` (prompter + respond), `:3133` (flush in 'closed')

**Interfaces:**
- Produces: prompts stored on `runtime.permissionPrompts`; `flushPermissionPrompts(runtime)` takes the runtime explicitly.

- [ ] **Step 1: Move the prompt map**

The module-level prompt map (`:600`) moves to `runtime.permissionPrompts` (already in the registry record). The prompter (`:3259`) assigns ownership **from the requesting tab's webContents**:

```js
  setPermissionPrompter(({ origin, permission, mediaTypes, requestingWebContents }) =>
    new Promise((resolve) => {
      const owner = windowRuntimes.runtimeForTab(tabIdForWebContents(requestingWebContents)) ?? rt();
      const promptId = ++permissionPromptCounter;
      owner.permissionPrompts.set(promptId, resolve);
      owner.window.webContents.send('permissions:prompt', { id: promptId, origin, permission, mediaTypes });
    })
  );
```

(If `setupPermissionPolicy` does not currently pass the requesting webContents through, extend `src/main/permissions.js`'s prompter call with it — it holds the permission request's `webContents` already; this is a parameter addition, not a behavior change. If no tab resolves — a permission request from a non-tab surface — fall back to `rt()`, which is the single runtime.)

- [ ] **Step 2: Guard the response by sender runtime**

```js
  chromeOn('permissions:respond', (event, { id, allow }) => {
    const sender = windowRuntimes.runtimeForChromeWebContentsId(event.sender.id);
    const resolve = sender?.permissionPrompts.get(id);
    if (!resolve) return; // wrong window's chrome, or a stale prompt — ignore
    sender.permissionPrompts.delete(id);
    resolve(allow);
  });
```

- [ ] **Step 3: Scope the flush**

`flushPermissionPrompts()` (`:604`) becomes `flushPermissionPrompts(runtime)`, iterating `runtime.permissionPrompts` only; the `'closed'` handler call site (`:3133`) passes the closing runtime.

- [ ] **Step 4: Verify**

Run: full unit + full acceptance. The F13 permission scenarios are the live check.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js src/main/permissions.js
git commit -m "refactor(runtime): permission prompts owned by the requesting tab's runtime"
```

---

## Task 9: Event-binding wraps + sanctioned roots

**Files:**
- Modify: `src/main/main.js`, `src/main/test-hook.js`

**Interfaces:**
- Consumes: `bindWindowRuntime` from Task 3.

- [ ] **Step 1: Wrap native event registrations**

Every listener registration on a tab's `webContents` (in `createTab`), the overlay's `webContents` (including `before-input-event` Escape), the window (`focus`, `blur`, `resize`, `closed`, `did-finish-load`), and the utility sheet gets its handler wrapped:

```js
  wc.on('did-navigate', bindWindowRuntime(primaryRuntime, (_e, url, code) => { ... }));
```

For tab events, bind to the tab's *owner* at registration time: `bindWindowRuntime(windowRuntimes.runtimeForTab(id) ?? primaryRuntime, ...)` — in M1 both are the primary runtime; the shape is what M2 inherits.

- [ ] **Step 2: Bind the sanctioned roots** (spec's enumerated list):

- **Startup/session restore** (`app.whenReady`): wrap the restore body in `windowRuntimeContext.run(primaryRuntime, ...)`.
- **Native menu clicks**: in `buildMenu()`, every `click:` handler wraps: `click: bindWindowRuntime(primaryRuntime, () => ...)`.
- **Test-hook invocations**: in `main.js`'s `install({...})` call, wrap the ref functions that touch per-window state — simplest uniform shape: pass `bindRoot: (fn) => bindWindowRuntime(primaryRuntime, fn)` into the hook and have `test-hook.js` wrap each installed method once at install time (a mechanical `wrap(method)` loop over the returned object). Playwright calls `globalThis.__blanc` outside any ALS context; without this the strict gate would fail the whole suite instantly.
- **Settings fan-out, adblock callbacks, sync/tabsync timers**: wrap each registration site the same way.
- **Permission prompter**: already bound via Task 8's owner resolution.

- [ ] **Step 3: The strict gate proves itself**

Run: `npm run test:acceptance:desktop`
Expected: 64/64. Any `currentRuntime() outside any bindWindowRuntime scope` error names a missed root — fix it by binding that root, not by weakening the gate.

- [ ] **Step 4: Commit**

```bash
git add src/main/main.js src/main/test-hook.js
git commit -m "feat(runtime): bind native events, menu clicks, hooks, and timers to the owning runtime"
```

---

## Task 10: Sender-derived IPC routing

**Files:**
- Modify: `src/main/main.js:2397-2412`

- [ ] **Step 1: Route by sender**

```js
function chromeHandle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedChromeSender(event)) throw new Error(`${channel}: denied for untrusted sender`);
    const runtime = windowRuntimes.runtimeForChromeWebContentsId(event.sender.id);
    if (!runtime) {
      // A surface that was unregistered (window closing) — not an attack,
      // just late. Never fall back to "whichever window is focused".
      if (!app.isPackaged) console.warn(`[ipc] ${channel}: sender has no runtime`);
      return undefined;
    }
    return windowRuntimeContext.run(runtime, () => handler(event, ...args));
  });
}

function chromeOn(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedChromeSender(event)) {
      console.warn(`[ipc] ${channel}: denied for untrusted sender`);
      return;
    }
    const runtime = windowRuntimes.runtimeForChromeWebContentsId(event.sender.id);
    if (!runtime) {
      if (!app.isPackaged) console.warn(`[ipc] ${channel}: sender has no runtime`);
      return;
    }
    windowRuntimeContext.run(runtime, () => handler(event, ...args));
  });
}
```

- [ ] **Step 2: Verify** — full unit + full acceptance (every chrome interaction crosses this seam).
- [ ] **Step 3: Commit** — `feat(runtime): chrome IPC resolves its runtime from the sender`

---

## Task 11: Persistence through session-workspace

**Files:**
- Modify: `src/main/main.js` (`persistSession` `:1042`, the restore path in `app.whenReady`)

**Interfaces:**
- Consumes: `loadWorkspace`, `buildSaveShape`, `entryFrom` from Task 2.

- [ ] **Step 1: Save path**

`persistSession()` keeps its guards verbatim and delegates the shape:

```js
function persistSession() {
  if (isQuitting || sessionPersistenceSuspended || tabs.size === 0) return;
  if (sessionReadOnly) return; // a newer format owns this file — never rewrite it
  const runtime = rt();
  ensureSessionStore().update((d) => {
    const entries = persistableEntries(runtime.tabOrder.map((id) => tabs.get(id)));
    const entry = {
      urls: entries.map((e) => e.url),
      groupIds: entries.map((e) => e.groupId),
      pinned: entries.map((e) => e.pinned),
      groups: runtime.groups.filter((g) => entries.some((e) => e.groupId === g.id)),
      activeIndex: d.activeIndex ?? 0,
    };
    const idx = entries.findIndex((e) => e.id === runtime.activeTabId);
    if (idx >= 0) entry.activeIndex = idx; // else: keep last good index, as today
    Object.assign(d, buildSaveShape(entry, d));
  });
}
```

`sessionReadOnly` is a new module-level boolean set by the restore path.

- [ ] **Step 2: Restore path**

Where startup currently reads the flat store, substitute:

```js
  const { windows, readOnly } = loadWorkspace(ensureSessionStore().data);
  sessionReadOnly = readOnly;
  const restored = windows[0];
  // ...existing restore logic consumes restored.urls / restored.groups /
  // restored.groupIds / restored.pinned / restored.activeIndex unchanged.
```

- [ ] **Step 3: Verify, including the packaged smokes**

Run: full unit + full acceptance, then `npm run dist:dir` is NOT needed — but the two packaged smokes must run before M1 merges (Task 13); note it here because session.json's on-disk shape changes in this task.

- [ ] **Step 4: Commit** — `feat(runtime): session.json v1 with the v0 rollback mirror`

---

## Task 12: Window lifecycle + delete the bare `win`

**Files:**
- Modify: `src/main/main.js` (`'closed'` handler `:3120-3134`, `createMainWindow`, declaration `:430`)

- [ ] **Step 1: Lifecycle through the registry**

The `'closed'` handler's manual nulling of overlay/sheet is replaced by:

```js
    windowRuntimes.detachWindow(primaryRuntime);
    iconRaster.dispose();
    flushPermissionPrompts(primaryRuntime);
```

(`detachWindow` nulls the view fields and unregisters both surfaces — the fixture from Task 1 is the contract.) `createMainWindow()`'s existing recreate path calls `attachWindow` + surface registration (already placed in Task 3).

- [ ] **Step 2: Sweep `win` last, then delete it**

Same sweep pattern as Task 4 for `win` → `rt().window` (72 references; the property-access-safe perl variant from Task 6). Hand-audit: `hasLiveWindow()` and any `win?.` optional chains become `rt().window?.` reads; `let win = null` at `:430` is **deleted** — the binding must not survive as an alias.

- [ ] **Step 3: Zero-count gate**

```bash
grep -nE "(?<![.\w])win\b" src/main/main.js | grep -vE "rt\(\)\.window|^\s*//|windows?\b"
```
Expected: nothing.

- [ ] **Step 4: Verify** — `node --check`, full unit, full acceptance.
- [ ] **Step 5: Commit** — `refactor(runtime): window lifecycle via the registry; the bare win binding is gone`

---

## Task 13: Docs + final gates

**Files:**
- Modify: `CLAUDE.md` (the "single source of truth" architecture paragraph)

- [ ] **Step 1: Update CLAUDE.md**

The paragraph stating `main.js` owns `tabs` Map + `tabOrder` as "the single source of truth" gains the runtime sentence:

```markdown
Per-window state (workspace, overlay, shield popover, utility sheet, focus
reclaim, permission prompts) lives on a window-runtime record
(`src/main/window-runtime-registry.js`) — exactly one in 1.1 M1 — resolved
via AsyncLocalStorage bindings and sender-derived IPC; the `tabs` Map stays
process-wide with per-tab `runtimeId`. `session.json` is versioned (v1 +
a v0 mirror of the focused window so a rollback to 1.0.x keeps tabs).
```

- [ ] **Step 2: The full gate run**

```bash
npm run test:unit             # expect 378, 0 fail
npm run substrate:check       # 4/4 OK
npm run test:acceptance:dry   # 64 scenarios / 425 steps, 0 undefined
npm run test:acceptance:desktop  # 64/64 — run twice; both clean
npm run dist:dir              # packaged build for the smokes
BLANC_PACKAGED_EXECUTABLE="$PWD/dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc" node test/desktop/packaged-first-run-smoke.mjs
BLANC_PACKAGED_EXECUTABLE="$PWD/dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc" node test/desktop/packaged-migration-smoke.mjs
```

The migration smoke matters most here: it upgrades a real public-1.0.x profile, whose session.json is v0 — the live proof of the load path.

- [ ] **Step 3: Commit and open the PR**

```bash
git add CLAUDE.md
git commit -m "docs: record the window-runtime boundary in the architecture notes"
```

PR body must state: behavior-invisible by contract (suite counts unchanged); the strict-ALS soak rationale; the rollback mirror and its precedence rule; that `win` no longer exists as a binding; and that this is 1.1 M1 with M2 (windows) next.

---

## Self-Review

**Spec coverage.** Registry + lifecycle → Task 1. Workspace + precedence + read-only + guards → Tasks 2, 11. ALS + strict gate keyed on `acceptanceTestMode` → Task 3. Inventory sweeps → Tasks 4–7 (all twenty globals mapped; `recentlyClosedUrls` deliberately untouched per spec). Permission ownership from requesting tab + sender-guarded response + scoped flush → Task 8. Sanctioned roots incl. test-hook wrapping → Task 9. Sender-derived routing, no focused-window fallback → Task 10. 1Password referent → Task 7. Detach/reattach + `win` deletion → Task 12. CLAUDE.md + packaged smokes → Task 13.

**Placeholders.** None; every code step carries real code or an exact command.

**Type consistency.** `rt()` returns the runtime record whose fields are defined once in Task 1's `createRuntime()`; `loadWorkspace`/`buildSaveShape`/`entryFrom` signatures match between Tasks 2 and 11; `flushPermissionPrompts(runtime)` consistent between Tasks 8 and 12; `bindWindowRuntime(runtime, fn)` consistent across 3, 9.

**Honest risk note for the executor.** Tasks 4, 6, and 12 are mechanical sweeps over a 3,594-line file. The zero-count grep gates and full-suite runs after *each* sweep are the safety net — never batch two sweeps into one commit, and never proceed past a sweep whose acceptance run was not fully green.
