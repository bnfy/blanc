# Drag to Reorder Tabs and Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drag (and ⌥⇧↑/↓) to reorder tabs, move tabs between groups and the loose section, and reorder groups, with one shared gesture in the vertical tab rail and the expanded island.

**Architecture:** Main stays the only mutator. Two new validated IPC calls (`tabs:move`, `groups:reorder`) sit on pure policy in `src/main/tab-order.js`. One new renderer script, `src/renderer/tab-drag.js`, holds pure drop resolvers, a pure keyboard helper, a pure drag-session state machine with injected effects (all unit-tested in a vm), and a thin DOM adapter that both surfaces attach to their list. A main-side `overlay:drag-state` guard suspends the island's Escape/blur dismissal only while an island drag is active.

**Tech Stack:** Electron (main + sandboxed chrome renderers), plain browser JS (IIFE globals, no bundler), `node --test` unit tests run in `vm`, Cucumber + Playwright-Electron acceptance.

**Spec:** `docs/superpowers/specs/2026-10-07-drag-reorder-tabs-groups-design.md` (read it before starting; this plan argues from it).

## Global Constraints

- A drag or keyboard move may change a tab's position and group, **never its pinned state**. The target bucket is always `{target groupId, source.pinned}`.
- Renderer requests are proposals: main re-validates every id against its own window runtime and returns a boolean.
- `beforeId === id` is an accepted no-op **only** when `groupId` equals the tab's current group; otherwise it is rejected.
- Drag starts after **4px** of pointer movement; below that a press stays a click.
- Collapsed groups are skipped by keyboard moves; a drop on any group header appends to that group and leaves `collapsed` unchanged.
- While a drag is active or settling, only the draggable list's redraw is deferred; the latest payload is applied exactly once at the end.
- `overlay:drag-state` is accepted only from the sender runtime's own registered overlay `webContents`, as a boolean, and reset on hide, overlay destruction, render-process-gone and every renderer end path.
- No HTML5 drag-and-drop and no `DataTransfer` payloads anywhere in this feature.
- Indicator: the rail's existing 2px `var(--accent)` insertion line. No thick focus rings (hairline `:focus-visible` only).
- Use CSS (classes, custom properties) rather than hard-coded inline styles; dynamic geometry goes through `--drag-*` custom properties.
- Internal identifiers keep existing names (`bookmarks`, `bowserPages`, etc.). User-visible copy says "group", "tab".
- Changing `preload.js` requires the matching `browser-api/contract.json` edit and `npm run browser-api:build`; commit the regenerated `browser-api/generated/*`.
- A new `blanc-chrome://` file must be added to the exact allowlist in `src/main/chrome-protocol.js`.
- Policy changes update their guard tests in the same commit.
- Work happens in the worktree `/Users/anthonyjloria/Projects/Blanc-drag-reorder` on branch `feat/drag-reorder-tabs-groups`. Run `npm ci` there once before Task 1 (never symlink `node_modules`).

## File map

| File | Responsibility |
|---|---|
| `src/main/tab-order.js` | Pure `moveTab` / `reorderGroup` policy (replaces `reorderWithinBucket`). |
| `src/main/overlay-drag-state.js` (new) | Pure accept/reset/query for the island drag flag. |
| `src/main/main.js` | `moveTabTo`, `reorderGroupBefore`, IPC handlers, drag-flag wiring in the overlay Escape/blur/hide/destroy paths. |
| `src/main/preload.js` | `moveTab`, `reorderGroup`, `setOverlayDragState`; remove `reorderTab`, `reorderTabWithinBucket`. |
| `src/main/window-runtime-registry.js` | `overlayDragging: false` default. |
| `src/main/test-hook.js` | Hook methods `moveTab`, `reorderGroup`, `overlayDragging`. |
| `src/main/chrome-protocol.js` | Allowlist `/tab-drag.js` for both chrome hosts. |
| `browser-api/contract.json` (+ generated) | Contract for the three members. |
| `security/audit-surface-inventory.json` | IPC channel inventory. |
| `src/renderer/tab-drag.js` (new) | Resolvers, keyboard helper, `describeMove`, session state machine, DOM adapter. |
| `src/renderer/styles.css` | Shared drag CSS; remove the rail's old drop CSS. |
| `src/renderer/vertical-tabs.js` | Rail markup attributes, empty zones, deferral, attach, keyboard. |
| `src/renderer/overlay.js`, `overlay.html`, `index.html` | Island markup, sections, deferral, drag-state reporting, keyboard; script tags; live region. |
| `test/unit/tab-order.test.js`, `test/unit/overlay-drag-state.test.js` (new), `test/unit/overlay-blur-shutdown.test.js`, `test/unit/overlay-escape-drag.test.js` (new), `test/unit/tab-drag.test.js` (new) | Unit coverage. |
| `spec/features.md`, `spec/acceptance/tab-drag.feature` (new), `spec/acceptance/vertical-tabs.feature`, `spec/acceptance/index.md`, `test/desktop/steps/tab-drag.steps.js` (new), `test/desktop/steps/vertical-tabs.steps.js`, `test/desktop/support/fixtures-server.js`, `test/desktop/cucumber.mjs` | Acceptance. |

---

### Task 1: Pure move and group-reorder policy

**Files:**
- Modify: `src/main/tab-order.js`
- Test: `test/unit/tab-order.test.js`

**Interfaces:**
- Produces: `moveTab(order: string[], tabs: Map|Record, groups: {id}[], id: string, target: { groupId: string|null, beforeId: string|null }) → { order: string[], groupId: string|null } | null`
- Produces: `reorderGroup(groups: {id}[], id: string, beforeGroupId: string|null) → {id}[] | null`
- Keeps (until Task 2 removes it): `reorderWithinBucket`, `sameBucket`.

- [ ] **Step 1: Write the failing tests** — append to `test/unit/tab-order.test.js` (keep the existing `reorderWithinBucket` tests for now) and change the import line to `const { reorderWithinBucket, moveTab, reorderGroup } = require('../../src/main/tab-order');`:

```js
const groupsOf = (...ids) => ids.map((id) => ({ id, name: id, collapsed: false }));

test('moveTab reorders inside the current bucket', () => {
  const model = tabs([['a', 'work'], ['b', 'work'], ['c', 'work']]);
  assert.deepEqual(
    moveTab(['a', 'b', 'c'], model, groupsOf('work'), 'c', { groupId: 'work', beforeId: 'a' }),
    { order: ['c', 'a', 'b'], groupId: 'work' }
  );
});

test('moveTab moves loose → group, group → loose and group → group', () => {
  const model = tabs([['a', 'work'], ['b', 'play'], ['l', null]]);
  const groups = groupsOf('work', 'play');
  assert.deepEqual(
    moveTab(['a', 'b', 'l'], model, groups, 'l', { groupId: 'work', beforeId: 'a' }),
    { order: ['l', 'a', 'b'], groupId: 'work' }
  );
  assert.deepEqual(
    moveTab(['a', 'b', 'l'], model, groups, 'a', { groupId: null, beforeId: null }),
    { order: ['b', 'l', 'a'], groupId: null }
  );
  assert.deepEqual(
    moveTab(['a', 'b', 'l'], model, groups, 'a', { groupId: 'play', beforeId: null }),
    { order: ['b', 'a', 'l'], groupId: 'play' }
  );
});

test('moveTab moves a standalone pin into a group\'s pinned rows and back', () => {
  const model = tabs([['p', null, true], ['gp', 'work', true], ['g', 'work']]);
  const groups = groupsOf('work');
  assert.deepEqual(
    moveTab(['p', 'gp', 'g'], model, groups, 'p', { groupId: 'work', beforeId: 'gp' }),
    { order: ['p', 'gp', 'g'], groupId: 'work' }
  );
  assert.deepEqual(
    moveTab(['p', 'gp', 'g'], model, groups, 'gp', { groupId: null, beforeId: 'p' }),
    { order: ['gp', 'p', 'g'], groupId: null }
  );
});

test('moveTab appends into an empty target bucket, including a pins-only group', () => {
  const model = tabs([['gp', 'work', true], ['l', null], ['x', null]]);
  assert.deepEqual(
    moveTab(['l', 'gp', 'x'], model, groupsOf('work'), 'l', { groupId: 'work', beforeId: null }),
    { order: ['gp', 'x', 'l'], groupId: 'work' }
  );
});

test('moveTab rejects pin-crossing, missing groups, wrong buckets and bad input', () => {
  const model = tabs([['p', null, true], ['a', 'work'], ['b', 'play'], ['l', null]]);
  const groups = groupsOf('work', 'play');
  const order = ['p', 'a', 'b', 'l'];
  assert.equal(moveTab(order, model, groups, 'l', { groupId: null, beforeId: 'p' }), null, 'unpinned → pinned');
  assert.equal(moveTab(order, model, groups, 'p', { groupId: null, beforeId: 'l' }), null, 'pinned → unpinned');
  assert.equal(moveTab(order, model, groups, 'a', { groupId: 'gone', beforeId: null }), null, 'missing group');
  assert.equal(moveTab(order, model, groups, 'a', { groupId: 'play', beforeId: 'l' }), null, 'beforeId outside target');
  assert.equal(moveTab(order, model, groups, 'missing', { groupId: null, beforeId: null }), null);
  assert.equal(moveTab(order, model, groups, 'a', { groupId: 'work', beforeId: undefined }), null);
  assert.equal(moveTab(order, model, groups, 'a', null), null);
  assert.deepEqual(order, ['p', 'a', 'b', 'l'], 'rejected requests never mutate the input');
});

test('moveTab self-target is a no-op only inside the current group', () => {
  const model = tabs([['a', 'work'], ['b', 'play']]);
  const groups = groupsOf('work', 'play');
  assert.deepEqual(
    moveTab(['a', 'b'], model, groups, 'a', { groupId: 'work', beforeId: 'a' }),
    { order: ['a', 'b'], groupId: 'work' }
  );
  assert.equal(
    moveTab(['a', 'b'], model, groups, 'a', { groupId: 'play', beforeId: 'a' }),
    null,
    'a self-target never bypasses target-bucket validation during a group change'
  );
});

test('moveTab null beforeId on a sole-member bucket keeps its slot', () => {
  const model = tabs([['a', 'work'], ['b', 'play']]);
  assert.deepEqual(
    moveTab(['a', 'b'], model, groupsOf('work', 'play'), 'a', { groupId: 'work', beforeId: null }),
    { order: ['a', 'b'], groupId: 'work' }
  );
});

test('reorderGroup moves a group before another or to the end', () => {
  const groups = groupsOf('a', 'b', 'c');
  assert.deepEqual(reorderGroup(groups, 'c', 'a').map((g) => g.id), ['c', 'a', 'b']);
  assert.deepEqual(reorderGroup(groups, 'a', null).map((g) => g.id), ['b', 'c', 'a']);
  assert.deepEqual(reorderGroup(groups, 'b', 'b').map((g) => g.id), ['a', 'b', 'c']);
  assert.equal(reorderGroup(groups, 'zz', null), null);
  assert.equal(reorderGroup(groups, 'a', 'zz'), null);
  assert.equal(reorderGroup(groups, 'a', undefined), null);
  assert.deepEqual(groups.map((g) => g.id), ['a', 'b', 'c'], 'input never mutated');
  assert.equal(reorderGroup(groups, 'c', 'a')[0], groups[2], 'group records are moved, not copied');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/tab-order.test.js`
Expected: FAIL — `moveTab is not a function`.

- [ ] **Step 3: Implement** — in `src/main/tab-order.js`, add above `module.exports` and export both:

```js
/**
 * Move `id` into the bucket {target.groupId, source.pinned}, before
 * target.beforeId (null = end of that bucket). A drag may change position and
 * group, never pinned state. Returns { order, groupId } (fresh array) or null
 * for an invalid request. Never mutates its inputs.
 */
function moveTab(order, tabs, groups, id, target) {
  if (!Array.isArray(order) || !target || typeof target !== 'object') return null;
  const source = tabFor(tabs, id);
  if (!source || !order.includes(id)) return null;
  const groupId = target.groupId ?? null;
  if (groupId !== null && !(Array.isArray(groups) && groups.some((g) => g.id === groupId))) return null;
  const { beforeId } = target;
  if (beforeId !== null && typeof beforeId !== 'string') return null;

  const pinned = !!source.pinned;
  const inTarget = (tabId) => {
    const tab = tabFor(tabs, tabId);
    return !!tab && (tab.groupId ?? null) === groupId && !!tab.pinned === pinned;
  };
  const sameGroup = (source.groupId ?? null) === groupId;

  // Self-target: only meaningful inside the bucket the tab already occupies.
  if (beforeId === id) return sameGroup ? { order: [...order], groupId } : null;
  if (beforeId !== null && (!order.includes(beforeId) || !inTarget(beforeId))) return null;

  const next = order.filter((tabId) => tabId !== id);
  if (beforeId !== null) {
    next.splice(next.indexOf(beforeId), 0, id);
    return { order: next, groupId };
  }
  let last = -1;
  for (let i = 0; i < next.length; i += 1) if (inTarget(next[i])) last = i;
  if (last === -1) {
    // Sole member of its own bucket: no meaningful "end" — keep its slot.
    if (sameGroup) return { order: [...order], groupId };
    // Empty target bucket: rendering filters by group and leads with pins,
    // so only order relative to bucket members matters.
    next.push(id);
    return { order: next, groupId };
  }
  next.splice(last + 1, 0, id);
  return { order: next, groupId };
}

/** Move group `id` before `beforeGroupId` (null = end). Returns a fresh array
 * holding the same group records, or null for an invalid request. */
function reorderGroup(groups, id, beforeGroupId) {
  if (!Array.isArray(groups)) return null;
  const from = groups.findIndex((g) => g.id === id);
  if (from === -1) return null;
  if (beforeGroupId !== null && typeof beforeGroupId !== 'string') return null;
  if (beforeGroupId === id) return [...groups];
  if (beforeGroupId !== null && !groups.some((g) => g.id === beforeGroupId)) return null;
  const next = groups.filter((g) => g.id !== id);
  const at = beforeGroupId === null ? next.length : next.findIndex((g) => g.id === beforeGroupId);
  next.splice(at, 0, groups[from]);
  return next;
}

module.exports = { sameBucket, reorderWithinBucket, moveTab, reorderGroup };
```

(Replace the existing `module.exports` line.)

- [ ] **Step 4: Run tests**

Run: `node --test test/unit/tab-order.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/tab-order.js test/unit/tab-order.test.js
git commit -m "Add pure moveTab and reorderGroup policy"
```

---

### Task 2: Main wiring and the `browserAPI` surface for moves

**Files:**
- Modify: `src/main/main.js` (require at ~257; `reorderTab`/`reorderTabWithinBucket` at ~6527–6552; handlers at ~7175–7177; hook deps at ~9813)
- Modify: `src/main/preload.js:35-37`
- Modify: `src/main/test-hook.js` (deps destructure ~84; method ~542)
- Modify: `src/main/tab-order.js` (remove `reorderWithinBucket`)
- Modify: `src/renderer/vertical-tabs.js` (the drop handler's `api.reorderTabWithinBucket` call — temporary bridge until Task 6)
- Modify: `browser-api/contract.json` (+ regenerate), `security/audit-surface-inventory.json`
- Test: `test/unit/tab-order.test.js`

**Interfaces:**
- Consumes: `moveTab`, `reorderGroup` from Task 1.
- Produces (renderer API): `browserAPI.moveTab(id: TabId, target: { groupId: GroupId|null, beforeId: TabId|null }) → Promise<boolean>`; `browserAPI.reorderGroup(id: GroupId, beforeGroupId: GroupId|null) → Promise<boolean>`.
- Produces (main): `moveTabTo(id, target) → boolean`, `reorderGroupBefore(id, beforeGroupId) → boolean`.
- Produces (test hook): `hook.moveTab(id, target)`, `hook.reorderGroup(id, beforeGroupId)`.
- Removes: `browserAPI.reorderTab`, `browserAPI.reorderTabWithinBucket`, channels `tabs:reorder`, `tabs:reorder-within-bucket`, hook `reorderWithinBucket`.

- [ ] **Step 1: Remove `reorderWithinBucket` tests and implementation.** Delete the five `reorderWithinBucket` tests from `test/unit/tab-order.test.js` (their cases are covered by Task 1's `moveTab` tests), change the import to `const { moveTab, reorderGroup } = require('../../src/main/tab-order');`, delete `reorderWithinBucket` from `src/main/tab-order.js`, and set `module.exports = { sameBucket, moveTab, reorderGroup };`. Update the file's header comment to: `// Pure tab/group order policy for drag and keyboard moves. The main process remains the sole mutator; these helpers only return a proposed order.`

- [ ] **Step 2: Main functions.** In `src/main/main.js` replace `const { reorderWithinBucket } = require('./tab-order');` with:

```js
const { moveTab: resolveTabMove, reorderGroup: resolveGroupReorder } = require('./tab-order');
```

Replace the whole `function reorderTabWithinBucket(id, beforeId) { … }` with:

```js
function moveTabTo(id, target) {
  if (windowRuntimes.runtimeForTab(id) !== rt()) return false;
  const beforeId = target?.beforeId;
  if (typeof beforeId === 'string' && windowRuntimes.runtimeForTab(beforeId) !== rt()) return false;
  // Renderer input is only a proposal. Main re-resolves every id against its
  // live model; a stale/cross-window/pin-crossing target is rejected.
  const result = resolveTabMove(rt().tabOrder, tabs, rt().groups, id, target);
  if (!result) return false;
  const tab = tabs.get(id);
  const groupChanged = (tab.groupId ?? null) !== result.groupId;
  const orderChanged = result.order.some((tabId, index) => rt().tabOrder[index] !== tabId);
  if (!groupChanged && !orderChanged) return true;
  rt().tabOrder = result.order;
  if (groupChanged) {
    // Same effect as Move to Group (setTabGroup): a group whose last tab
    // left dissolves; the target keeps its collapsed state.
    tab.groupId = result.groupId;
    pruneEmptyGroups();
  }
  broadcastTabs();
  scheduleMenuRebuild();
  return true;
}

function reorderGroupBefore(id, beforeGroupId) {
  // rt().groups is per-window, so another window's group id simply fails.
  const next = resolveGroupReorder(rt().groups, id, beforeGroupId);
  if (!next) return false;
  if (next.some((group, index) => rt().groups[index] !== group)) {
    rt().groups = next;
    broadcastTabs();
    scheduleMenuRebuild();
  }
  return true;
}
```

Keep `function reorderTab(id, toIndex)` (tab duplication calls it at ~5425).

- [ ] **Step 3: Handlers.** Replace the two lines

```js
  chromeHandle('tabs:reorder', (_e, id, toIndex) => reorderTab(id, toIndex));
  chromeHandle('tabs:reorder-within-bucket', (_e, id, beforeId) =>
    reorderTabWithinBucket(id, beforeId));
```

with

```js
  chromeHandle('tabs:move', (_e, id, target) => moveTabTo(id, target));
  chromeHandle('groups:reorder', (_e, id, beforeGroupId) => reorderGroupBefore(id, beforeGroupId));
```

In the test-hook dependency list (~9813) replace `reorderTabWithinBucket` with `moveTabTo, reorderGroupBefore`. Search for any other `reorderTabWithinBucket` reference: `grep -n "reorderTabWithinBucket" src/main/main.js` must print nothing.

- [ ] **Step 4: Test hook.** In `src/main/test-hook.js` replace `reorderTabWithinBucket,` in the deps destructure with `moveTabTo, reorderGroupBefore,` and replace the method

```js
    reorderWithinBucket(id, beforeId) { return reorderTabWithinBucket(id, beforeId); },
```

with

```js
    moveTab(id, target) { return moveTabTo(id, target); },
    reorderGroup(id, beforeGroupId) { return reorderGroupBefore(id, beforeGroupId); },
```

Run `grep -rn "reorderWithinBucket" test/desktop src` — any step still calling the old hook must be switched to `moveTab(id, { groupId: <that tab's current groupId>, beforeId })`.

- [ ] **Step 5: Preload.** In `src/main/preload.js` replace lines 35–37 with:

```js
  moveTab: (id, target) => ipcRenderer.invoke('tabs:move', id, target),
  reorderGroup: (id, beforeGroupId) => ipcRenderer.invoke('groups:reorder', id, beforeGroupId),
```

- [ ] **Step 6: Temporary rail bridge.** In `src/renderer/vertical-tabs.js`'s `drop` handler replace `api.reorderTabWithinBucket(source.id, beforeId)` with `api.moveTab(source.id, { groupId: tab.groupId ?? null, beforeId })`. (Task 6 replaces this code entirely.)

- [ ] **Step 7: Contract.** In `browser-api/contract.json`:
  - In the `types` map add after `CreateTabOptions`:

```json
    "TabMoveTarget": {
      "doc": "Where a dragged or keyboard-moved tab should land. The pinned state never changes.",
      "fields": {
        "groupId": { "type": "GroupId | null", "doc": "Target group, or null for the loose section / standalone pins." },
        "beforeId": { "type": "TabId | null", "doc": "Land before this tab of the target bucket; null means that bucket's end." }
      }
    },
```

  - Delete the `reorderTab` and `reorderTabWithinBucket` member objects and insert in their place:

```json
    {
      "name": "moveTab",
      "group": "tabs",
      "kind": "invoke",
      "channel": "tabs:move",
      "params": [
        { "name": "id", "type": "TabId" },
        { "name": "target", "type": "TabMoveTarget" }
      ],
      "returns": "boolean",
      "doc": "Move a tab within its bucket or into another group's matching bucket. Never changes pinned state. Resolves false for a rejected request."
    },
    {
      "name": "reorderGroup",
      "group": "tabs",
      "kind": "invoke",
      "channel": "groups:reorder",
      "params": [
        { "name": "id", "type": "GroupId" },
        { "name": "beforeGroupId", "type": "GroupId | null" }
      ],
      "returns": "boolean",
      "doc": "Move a group before another group, or to the end with null."
    },
```

  Run `npm run browser-api:build && npm run browser-api:check`. If the check reports that main reads `target.groupId`/`target.beforeId` (object parameter checked from both ends) and wants a different shape, follow its message exactly; do not loosen the check.

- [ ] **Step 8: Audit inventory.** In `security/audit-surface-inventory.json`, in both lists (~330 and ~488) replace `"tabs:reorder",` and `"tabs:reorder-within-bucket",` with `"tabs:move",` and add `"groups:reorder",` keeping each list's existing sort order. Find its guard: `grep -rln "audit-surface-inventory" test/unit` and run that file.

- [ ] **Step 9: Run guards**

Run: `npm run test:unit && npm run browser-api:check && npm run lint`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add src/main src/renderer/vertical-tabs.js browser-api security test/unit
git commit -m "Route tab and group moves through validated tabs:move and groups:reorder"
```

---

### Task 3: Island drag-state guard in main

**Files:**
- Create: `src/main/overlay-drag-state.js`
- Modify: `src/main/window-runtime-registry.js` (~68: add default), `src/main/main.js` (overlay `before-input-event` ~3201, `blur` ~3215, `createOverlay` destroyed/render-process-gone ~3165–3172, `hideOverlay` ~3383, IPC registration near the `tabs:move` handler), `src/main/preload.js`, `src/main/test-hook.js`, `browser-api/contract.json` (+ regenerate), `security/audit-surface-inventory.json`
- Test: `test/unit/overlay-drag-state.test.js` (new), `test/unit/overlay-blur-shutdown.test.js`, `test/unit/overlay-escape-drag.test.js` (new)

**Interfaces:**
- Produces: `acceptOverlayDragState(runtime, sender, value) → boolean`, `resetOverlayDragState(runtime) → void`, `overlayDragActive(runtime) → boolean`.
- Produces (renderer API): `browserAPI.setOverlayDragState(active: boolean) → void` (send on `overlay:drag-state`).
- Produces (test hook): `hook.overlayDragging() → boolean`.

- [ ] **Step 1: Failing unit tests** — create `test/unit/overlay-drag-state.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  acceptOverlayDragState, resetOverlayDragState, overlayDragActive,
} = require('../../src/main/overlay-drag-state');

const contents = (destroyed = false) => ({ isDestroyed: () => destroyed });
function runtime(mode = 'panel') {
  return { overlayMode: mode, overlayDragging: false, overlayView: { webContents: contents() } };
}

test('the runtime\'s own overlay may set and clear the flag', () => {
  const rt = runtime();
  assert.equal(acceptOverlayDragState(rt, rt.overlayView.webContents, true), true);
  assert.equal(overlayDragActive(rt), true);
  assert.equal(acceptOverlayDragState(rt, rt.overlayView.webContents, false), true);
  assert.equal(overlayDragActive(rt), false);
});

test('forged or wrong senders change no runtime\'s flag', () => {
  const a = runtime();
  const b = runtime();
  const strip = contents();
  const tab = contents();
  for (const sender of [strip, tab, b.overlayView.webContents, null, undefined]) {
    assert.equal(acceptOverlayDragState(a, sender, true), false);
  }
  assert.equal(overlayDragActive(a), false);
  assert.equal(overlayDragActive(b), false, 'B\'s overlay cannot set B\'s flag through A');
});

test('non-boolean payloads, destroyed overlays and non-panel modes are ignored', () => {
  const rt = runtime();
  for (const value of ['true', 1, null, undefined, {}]) {
    assert.equal(acceptOverlayDragState(rt, rt.overlayView.webContents, value), false);
  }
  const dead = runtime();
  dead.overlayView.webContents = contents(true);
  assert.equal(acceptOverlayDragState(dead, dead.overlayView.webContents, true), false);
  for (const mode of [null, 'find', 'shield', 'capture']) {
    const other = runtime(mode);
    assert.equal(acceptOverlayDragState(other, other.overlayView.webContents, true), false);
  }
  const palette = runtime('palette');
  assert.equal(acceptOverlayDragState(palette, palette.overlayView.webContents, true), true);
});

test('false is always accepted from the overlay, even after the mode changed', () => {
  const rt = runtime();
  acceptOverlayDragState(rt, rt.overlayView.webContents, true);
  rt.overlayMode = null;
  assert.equal(acceptOverlayDragState(rt, rt.overlayView.webContents, false), true);
  assert.equal(overlayDragActive(rt), false);
});

test('reset clears the flag and tolerates a missing runtime', () => {
  const rt = runtime();
  acceptOverlayDragState(rt, rt.overlayView.webContents, true);
  resetOverlayDragState(rt);
  assert.equal(overlayDragActive(rt), false);
  assert.doesNotThrow(() => resetOverlayDragState(null));
  assert.equal(overlayDragActive(null), false);
});
```

Run: `node --test test/unit/overlay-drag-state.test.js` → FAIL (module not found).

- [ ] **Step 2: Implement** `src/main/overlay-drag-state.js`:

```js
'use strict';
// Main-side half of the island drag guard (drag-reorder spec §2). While the
// flag is true, Escape reaches the overlay so it can cancel the drag, and
// overlay blur is not a dismissal. Only the runtime's own registered overlay
// webContents may set it; everything else is ignored.

function acceptOverlayDragState(runtime, sender, value) {
  if (!runtime || typeof value !== 'boolean') return false;
  const overlayContents = runtime.overlayView?.webContents;
  if (!overlayContents || overlayContents.isDestroyed?.() || sender !== overlayContents) return false;
  if (value && runtime.overlayMode !== 'panel' && runtime.overlayMode !== 'palette') return false;
  runtime.overlayDragging = value;
  return true;
}

function resetOverlayDragState(runtime) {
  if (runtime) runtime.overlayDragging = false;
}

function overlayDragActive(runtime) {
  return runtime?.overlayDragging === true;
}

module.exports = { acceptOverlayDragState, resetOverlayDragState, overlayDragActive };
```

Run the test → PASS.

- [ ] **Step 3: Failing blur/Escape lift tests.** In `test/unit/overlay-blur-shutdown.test.js`, add an assertion right after `const registration = …`: `assert.ok(start !== -1 && registration.includes('overlayDragActive'), 'lifted the production blur registration including the drag guard');` — put it inside a `test('lift found the blur registration', …)` so a rename fails loudly. Add `overlayDragActive: (r) => r.overlayDragging === true,` to the fixture `context`, and add:

```js
test('blur is not a dismissal while an island drag is active', () => {
  const f = fixture(); f.owner.overlayMode = 'panel'; f.owner.overlayDragging = true;
  f.blur(); f.settle(); assert.equal(f.hides(), 0);
  f.owner.overlayDragging = false;
  f.blur(); f.settle(); assert.equal(f.hides(), 1);
});
```

Create `test/unit/overlay-escape-drag.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const main = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const start = main.indexOf("  rt().overlayView.webContents.on('before-input-event', bindWindowRuntime(owner, (event, input) => {");
const end = main.indexOf('\n  // Losing focus', start);
const registration = main.slice(start, end);

test('lift found the overlay Escape registration with its drag guard', () => {
  assert.ok(start !== -1 && end !== -1, 'Escape registration moved: update this lift');
  assert.match(registration, /overlayDragActive\(rt\(\)\)/);
});

function fixture(dragging) {
  const wc = new EventEmitter();
  const sent = [];
  wc.isDestroyed = () => false;
  wc.send = (channel) => sent.push(channel);
  const owner = { overlayView: { webContents: wc }, overlayMode: 'panel', overlayDragging: dragging,
    workspaceSwitcherOpen: false };
  let hides = 0;
  vm.runInNewContext(registration, {
    owner, rt: () => owner, bindWindowRuntime: (_o, fn) => fn,
    overlayDragActive: (r) => r.overlayDragging === true,
    hideOverlay: () => { hides += 1; },
  });
  const press = () => {
    let prevented = false;
    wc.emit('before-input-event', { preventDefault: () => { prevented = true; } },
      { type: 'keyDown', key: 'Escape' });
    return prevented;
  };
  return { press, hides: () => hides, sent };
}

test('Escape during an island drag reaches the overlay and keeps the panel', () => {
  const f = fixture(true);
  assert.equal(f.press(), false, 'not swallowed by main');
  assert.equal(f.hides(), 0);
});

test('Escape without a drag still dismisses', () => {
  const f = fixture(false);
  assert.equal(f.press(), true);
  assert.equal(f.hides(), 1);
});
```

Run both files → FAIL (guard missing).

- [ ] **Step 4: Wire main.**
  - `src/main/window-runtime-registry.js`: after `workspaceSwitcherOpen: false,` add

```js
    /** An island drag is active in this window's overlay (overlay-drag-state.js):
     * Escape goes to the overlay and blur is not a dismissal. */
    overlayDragging: false,
```

  - `src/main/main.js`: add `const { acceptOverlayDragState, resetOverlayDragState, overlayDragActive } = require('./overlay-drag-state');` next to the other `./` requires.
  - In the overlay `before-input-event` handler, make the first statement inside the callback:

```js
    // An island drag owns Escape: let it reach the overlay to cancel the drag.
    if (overlayDragActive(rt())) return;
```

  - In the overlay `blur` handler's `setImmediate` callback, after the `addressMenuTicket` check add:

```js
      // Pointer capture during an island drag can move OS focus; not a dismissal.
      if (overlayDragActive(rt())) return;
```

  - In `createOverlay`, inside the `render-process-gone` handler add `resetOverlayDragState(owner);` and inside the `destroyed` handler add `resetOverlayDragState(owner);`.
  - In `hideOverlay`, make the first line `resetOverlayDragState(rt());` (before `cancelAddressBarFocusReclaim()`), so every hide path clears it even when `overlayMode` is already null.
  - Register next to the `tabs:move` handler:

```js
  chromeOn('overlay:drag-state', (event, active) => {
    acceptOverlayDragState(rt(), event.sender, active);
  });
```

  - `src/main/preload.js`, next to `setWorkspaceSwitcherOpen`: `setOverlayDragState: (active) => ipcRenderer.send('overlay:drag-state', !!active),`
  - `src/main/main.js` hook deps list (~9813, where Task 2 added `moveTabTo, reorderGroupBefore`): add `getOverlayDragging: () => overlayDragActive(rt()),`.
  - `src/main/test-hook.js`: add `getOverlayDragging,` to the deps destructure and the method `overlayDragging() { return getOverlayDragging(); },` next to `moveTab`.
  - `browser-api/contract.json`, next to `setWorkspaceSwitcherOpen`:

```json
    {
      "name": "setOverlayDragState",
      "group": "overlay",
      "kind": "send",
      "channel": "overlay:drag-state",
      "params": [ { "name": "active", "type": "boolean" } ],
      "doc": "Tell main an island drag started or ended, so Escape cancels the drag and blur does not dismiss the panel.",
      "ipcArgs": [ "bool($0)" ]
    },
```

  - `security/audit-surface-inventory.json`: add `"overlay:drag-state",` to the same lists as Task 2, sorted.

- [ ] **Step 5: Hide-path guard test.** Append to `test/unit/overlay-drag-state.test.js` a structural check that every reset site exists (the behavioural reset is covered by the module tests and the Task 8 acceptance scenario):

```js
test('main resets the drag flag on hide, destroy and render-process-gone', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  const hide = src.slice(src.indexOf('function hideOverlay('), src.indexOf('if (!rt().overlayMode) return;', src.indexOf('function hideOverlay(')));
  assert.match(hide, /resetOverlayDragState\(rt\(\)\)/, 'reset runs before hideOverlay can early-return');
  const create = src.slice(src.indexOf('function createOverlay('), src.indexOf("rt().overlayView.setBackgroundColor('#00000000')"));
  assert.match(create, /'render-process-gone'[\s\S]*resetOverlayDragState\(owner\)/);
  assert.match(create, /'destroyed'[\s\S]*resetOverlayDragState\(owner\)/);
});
```

- [ ] **Step 6: Run guards**

Run: `npm run browser-api:build && npm run test:unit && npm run browser-api:check && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main browser-api security test/unit
git commit -m "Add sender-checked overlay drag-state guard for island drags"
```

---

### Task 4: Pure drop resolvers, keyboard helper and move descriptions

**Files:**
- Create: `src/renderer/tab-drag.js` (pure section only in this task)
- Test: `test/unit/tab-drag.test.js` (new)

**Interfaces:**
- Produces on `globalThis.blancTabDrag`:
  - `constants: { DRAG_THRESHOLD_PX: 4, EDGE_PX: 24, MAX_SCROLL_STEP: 12, DROP_TIMEOUT_MS: 2000 }`
  - `resolveTabDrop(model, source, y) → { intent, indicator } | null`
  - `resolveGroupDrop(model, groupId, y) → { intent, indicator } | null`
  - `keyboardTabMove(snapshot, id, direction) → { intent } | { stop: 'top'|'bottom' } | null`
  - `keyboardGroupMove(snapshot, groupId, direction) → { intent } | { stop } | null`
  - `describeMove(snapshot, intent) → string`
- Types (documented in the file header):
  - `Model = { top, bottom, sections: Section[] }`; `Section = { kind: 'pinned'|'group'|'loose', groupId: string|null, collapsed: boolean, top, bottom, header: {top,bottom}|null, rows: {id, pinned, top, bottom}[] }` (rows in render order; a group's pinned rows first).
  - `Source = { kind: 'tab', id, pinned, groupId, title } | { kind: 'group', id, title }`
  - `Intent = { kind: 'tab', id, groupId, beforeId } | { kind: 'group', id, beforeGroupId }`
  - `Indicator = { type: 'line', y } | { type: 'header', groupId }`
  - `Snapshot = { tabs: {id, groupId, pinned, title}[], groups: {id, name, collapsed}[] }` (a `tabs:updated` payload satisfies it).

- [ ] **Step 1: Failing tests** — create `test/unit/tab-drag.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const context = { globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/renderer/tab-drag.js'), 'utf8'), context);
  return context.blancTabDrag;
}
const drag = load();

test('lift found the tab-drag API', () => {
  for (const name of ['resolveTabDrop', 'resolveGroupDrop', 'keyboardTabMove', 'keyboardGroupMove', 'describeMove']) {
    assert.equal(typeof drag[name], 'function', `${name} missing`);
  }
  assert.equal(drag.constants.DRAG_THRESHOLD_PX, 4);
});

// Rows are 20px tall. Layout, top to bottom:
//   pinned: P (0-20)
//   group work (header 20-40): W1 pinned (40-60), W2 (60-80), W3 (80-100)
//   group play collapsed (header 100-120)
//   loose: L1 (120-140), L2 (140-160)
const row = (id, top, pinned = false) => ({ id, pinned, top, bottom: top + 20 });
const model = {
  top: 0, bottom: 160,
  sections: [
    { kind: 'pinned', groupId: null, collapsed: false, top: 0, bottom: 20, header: null, rows: [row('P', 0, true)] },
    { kind: 'group', groupId: 'work', collapsed: false, top: 20, bottom: 100, header: { top: 20, bottom: 40 },
      rows: [row('W1', 40, true), row('W2', 60), row('W3', 80)] },
    { kind: 'group', groupId: 'play', collapsed: true, top: 100, bottom: 120, header: { top: 100, bottom: 120 }, rows: [] },
    { kind: 'loose', groupId: null, collapsed: false, top: 120, bottom: 160, header: null, rows: [row('L1', 120), row('L2', 140)] },
  ],
};
const tabSource = (id, pinned, groupId) => ({ kind: 'tab', id, pinned, groupId, title: id });

test('a gap inside the source bucket resolves to beforeId', () => {
  const hit = drag.resolveTabDrop(model, tabSource('W3', false, 'work'), 61);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'W3', groupId: 'work', beforeId: 'W2' });
  assert.deepEqual(hit.indicator, { type: 'line', y: 60 });
});

test('the gap after a bucket\'s last row resolves to null', () => {
  const hit = drag.resolveTabDrop(model, tabSource('W2', false, 'work'), 99);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'W2', groupId: 'work', beforeId: null });
});

test('a loose tab dropped among group rows joins that group', () => {
  const hit = drag.resolveTabDrop(model, tabSource('L2', false, null), 79);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'L2', groupId: 'work', beforeId: 'W3' });
});

test('a grouped tab dropped in the loose section leaves its group', () => {
  const hit = drag.resolveTabDrop(model, tabSource('W2', false, 'work'), 141);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'W2', groupId: null, beforeId: 'L2' });
});

test('the pin boundary inside a group is valid for both states; deeper gaps only for their own', () => {
  assert.deepEqual(drag.resolveTabDrop(model, tabSource('L1', false, null), 59).intent,
    { kind: 'tab', id: 'L1', groupId: 'work', beforeId: 'W2' });
  assert.deepEqual(drag.resolveTabDrop(model, tabSource('P', true, null), 59).intent,
    { kind: 'tab', id: 'P', groupId: 'work', beforeId: null });
  assert.equal(drag.resolveTabDrop(model, tabSource('P', true, null), 81), null, 'pinned tab among unpinned rows');
  assert.equal(drag.resolveTabDrop(model, tabSource('L1', false, null), 41), null, 'unpinned tab above a group pin');
  assert.equal(drag.resolveTabDrop(model, tabSource('L1', false, null), 1), null, 'unpinned tab into the pinned section');
});

test('the middle of a header (collapsed or not) appends to that group', () => {
  const hit = drag.resolveTabDrop(model, tabSource('L1', false, null), 110);
  assert.deepEqual(hit.intent, { kind: 'tab', id: 'L1', groupId: 'play', beforeId: null });
  assert.deepEqual(hit.indicator, { type: 'header', groupId: 'play' });
  assert.equal(drag.resolveTabDrop(model, tabSource('W2', false, 'work'), 30).intent.groupId, 'work');
});

test('outside the list resolves to nothing', () => {
  assert.equal(drag.resolveTabDrop(model, tabSource('L1', false, null), -5), null);
  assert.equal(drag.resolveTabDrop(model, tabSource('L1', false, null), 400), null);
});

test('an empty loose zone is a valid target for unpinned tabs only', () => {
  const withZone = { ...model, bottom: 190, sections: [...model.sections.slice(0, 3),
    { kind: 'loose', groupId: null, collapsed: false, top: 160, bottom: 190, header: null, rows: [] }] };
  assert.deepEqual(drag.resolveTabDrop(withZone, tabSource('W2', false, 'work'), 175).intent,
    { kind: 'tab', id: 'W2', groupId: null, beforeId: null });
  assert.equal(drag.resolveTabDrop(withZone, tabSource('W1', true, 'work'), 175), null);
});

test('group drops resolve between group bands', () => {
  assert.deepEqual(drag.resolveGroupDrop(model, 'play', 22).intent,
    { kind: 'group', id: 'play', beforeGroupId: 'work' });
  assert.deepEqual(drag.resolveGroupDrop(model, 'work', 119).intent,
    { kind: 'group', id: 'work', beforeGroupId: null });
  assert.deepEqual(drag.resolveGroupDrop(model, 'work', 22).intent,
    { kind: 'group', id: 'work', beforeGroupId: 'play' }, 'own position is an accepted no-op target');
  assert.equal(drag.resolveGroupDrop(model, 'work', 500), null);
});

// Keyboard: payload order. Groups: work (open), play (collapsed), solo (open, pins only).
const snapshot = {
  groups: [
    { id: 'work', name: 'work', collapsed: false },
    { id: 'play', name: 'play', collapsed: true },
    { id: 'solo', name: 'solo', collapsed: false },
  ],
  tabs: [
    { id: 'P', groupId: null, pinned: true, title: 'P' },
    { id: 'W1', groupId: 'work', pinned: false, title: 'W1' },
    { id: 'W2', groupId: 'work', pinned: false, title: 'W2' },
    { id: 'Y1', groupId: 'play', pinned: false, title: 'Y1' },
    { id: 'S1', groupId: 'solo', pinned: true, title: 'S1' },
    { id: 'L1', groupId: null, pinned: false, title: 'L1' },
  ],
};

test('keyboard swaps inside a bucket', () => {
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'W1', 'down').intent,
    { kind: 'tab', id: 'W1', groupId: 'work', beforeId: null });
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'W2', 'up').intent,
    { kind: 'tab', id: 'W2', groupId: 'work', beforeId: 'W1' });
});

test('keyboard crosses into the next eligible bucket, skipping collapsed groups', () => {
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'W2', 'down').intent,
    { kind: 'tab', id: 'W2', groupId: 'solo', beforeId: null },
    'play is collapsed; solo\'s empty unpinned bucket is a valid visible slot');
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'L1', 'up').intent,
    { kind: 'tab', id: 'L1', groupId: 'solo', beforeId: null });
});

test('keyboard never enters an opposite-state bucket and stops at the ends', () => {
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'P', 'down').intent,
    { kind: 'tab', id: 'P', groupId: 'work', beforeId: null }, 'pinned tab into work\'s empty pinned bucket');
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'P', 'up'), { stop: 'top' });
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'L1', 'down'), { stop: 'bottom' });
  assert.deepEqual(drag.keyboardTabMove(snapshot, 'W1', 'up'), { stop: 'top' }, 'no unpinned bucket above work');
  assert.equal(drag.keyboardTabMove(snapshot, 'nope', 'up'), null);
});

test('keyboard group moves and end stops', () => {
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'work', 'down').intent,
    { kind: 'group', id: 'work', beforeGroupId: 'solo' });
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'solo', 'up').intent,
    { kind: 'group', id: 'solo', beforeGroupId: 'play' });
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'work', 'up'), { stop: 'top' });
  assert.deepEqual(drag.keyboardGroupMove(snapshot, 'solo', 'down'), { stop: 'bottom' });
});

test('describeMove names reorders, joins, leaves and dissolving groups', () => {
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'W2', groupId: 'work', beforeId: 'W1' }), 'Moved W2');
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'L1', groupId: 'work', beforeId: null }), 'Moved to work');
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'W1', groupId: null, beforeId: null }), 'Moved out of work');
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'Y1', groupId: 'work', beforeId: null }),
    'Moved to work. Group play removed');
  assert.equal(drag.describeMove(snapshot, { kind: 'tab', id: 'Y1', groupId: null, beforeId: null }),
    'Moved out of play. Group play removed');
  assert.equal(drag.describeMove(snapshot, { kind: 'group', id: 'play', beforeGroupId: 'work' }), 'Moved group play');
});
```

Run: `node --test test/unit/tab-drag.test.js` → FAIL (file missing).

- [ ] **Step 2: Implement the pure section** — create `src/renderer/tab-drag.js`:

```js
// Shared drag-to-reorder for the vertical rail (chrome document) and the
// expanded island (overlay document). Main remains the only mutator: this file
// only turns pointer/keyboard input into a proposed intent for tabs:move or
// groups:reorder. Spec: docs/superpowers/specs/2026-10-07-drag-reorder-tabs-groups-design.md
//
// Layers, top to bottom:
//   1. pure resolvers + keyboard helper + describeMove (no DOM; unit-tested)
//   2. createDragSession: pure state machine with injected effects (unit-tested)
//   3. attach: the thin DOM adapter both surfaces use (acceptance-tested)
//
// Model   = { top, bottom, sections: Section[] }
// Section = { kind: 'pinned'|'group'|'loose', groupId, collapsed, top, bottom,
//             header: {top,bottom}|null, rows: {id,pinned,top,bottom}[] }
// Source  = { kind:'tab', id, pinned, groupId, title } | { kind:'group', id, title }
// Intent  = { kind:'tab', id, groupId, beforeId } | { kind:'group', id, beforeGroupId }
(() => {
  'use strict';

  const constants = Object.freeze({
    DRAG_THRESHOLD_PX: 4,
    EDGE_PX: 24,
    MAX_SCROLL_STEP: 12,
    DROP_TIMEOUT_MS: 2000,
  });

  const inside = (y, box) => y >= box.top && y <= box.bottom;

  /** Every gap a tab could land in, with which pinned states may use it. */
  function tabSlots(model, sourceId) {
    const slots = [];
    for (const section of model.sections) {
      if (section.kind === 'group' && section.collapsed) continue;
      const rows = section.rows;
      const pinCount = section.kind === 'group'
        ? rows.filter((r) => r.pinned).length
        : section.kind === 'pinned' ? rows.length : 0;
      const firstOther = (from, to) => {
        for (let i = from; i < to; i += 1) if (rows[i].id !== sourceId) return rows[i].id;
        return null;
      };
      if (!rows.length) {
        slots.push({
          y: (section.top + section.bottom) / 2,
          groupId: section.groupId,
          pinnedBefore: null, unpinnedBefore: null,
          pinned: section.kind !== 'loose', unpinned: section.kind !== 'pinned',
        });
        continue;
      }
      for (let i = 0; i <= rows.length; i += 1) {
        slots.push({
          y: i < rows.length ? rows[i].top : rows[rows.length - 1].bottom,
          groupId: section.groupId,
          pinned: section.kind !== 'loose' && i <= pinCount,
          unpinned: section.kind !== 'pinned' && i >= pinCount,
          pinnedBefore: firstOther(i, pinCount),
          unpinnedBefore: firstOther(Math.max(i, pinCount), rows.length),
        });
      }
    }
    return slots;
  }

  function resolveTabDrop(model, source, y) {
    if (!model || !source || !(y >= model.top && y <= model.bottom)) return null;
    for (const section of model.sections) {
      const h = section.kind === 'group' ? section.header : null;
      if (!h || !inside(y, h)) continue;
      const quarter = (h.bottom - h.top) / 4;
      if (y >= h.top + quarter && y <= h.bottom - quarter) {
        return {
          intent: { kind: 'tab', id: source.id, groupId: section.groupId, beforeId: null },
          indicator: { type: 'header', groupId: section.groupId },
        };
      }
    }
    let best = null;
    for (const slot of tabSlots(model, source.id)) {
      if (!best || Math.abs(slot.y - y) < Math.abs(best.y - y)) best = slot;
    }
    if (!best) return null;
    const allowed = source.pinned ? best.pinned : best.unpinned;
    if (!allowed) return null;
    return {
      intent: {
        kind: 'tab', id: source.id, groupId: best.groupId,
        beforeId: source.pinned ? best.pinnedBefore : best.unpinnedBefore,
      },
      indicator: { type: 'line', y: best.y },
    };
  }

  function resolveGroupDrop(model, groupId, y) {
    if (!model || !(y >= model.top && y <= model.bottom)) return null;
    const groups = model.sections.filter((s) => s.kind === 'group');
    if (!groups.some((s) => s.groupId === groupId)) return null;
    let bestIndex = 0;
    let bestY = groups[0].top;
    for (let i = 1; i <= groups.length; i += 1) {
      const slotY = i < groups.length ? groups[i].top : groups[groups.length - 1].bottom;
      if (Math.abs(slotY - y) < Math.abs(bestY - y)) { bestIndex = i; bestY = slotY; }
    }
    let beforeGroupId = null;
    for (let i = bestIndex; i < groups.length; i += 1) {
      if (groups[i].groupId !== groupId) { beforeGroupId = groups[i].groupId; break; }
    }
    return {
      intent: { kind: 'group', id: groupId, beforeGroupId },
      indicator: { type: 'line', y: bestY },
    };
  }

  /** Eligible buckets for a tab of pinned state `pinned`, in render order. */
  function eligibleBuckets(snapshot, pinned, ownGroupId) {
    const tabs = snapshot.tabs || [];
    const buckets = [];
    if (pinned) buckets.push({ groupId: null, members: tabs.filter((t) => t.pinned && !t.groupId) });
    for (const group of snapshot.groups || []) {
      if (group.collapsed && group.id !== ownGroupId) continue;
      buckets.push({
        groupId: group.id,
        members: tabs.filter((t) => t.groupId === group.id && !!t.pinned === pinned),
      });
    }
    if (!pinned) buckets.push({ groupId: null, members: tabs.filter((t) => !t.pinned && !t.groupId) });
    return buckets;
  }

  function keyboardTabMove(snapshot, id, direction) {
    const tab = (snapshot?.tabs || []).find((t) => t.id === id);
    if (!tab) return null;
    const pinned = !!tab.pinned;
    const buckets = eligibleBuckets(snapshot, pinned, tab.groupId ?? null);
    const bi = buckets.findIndex((b) => b.members.some((t) => t.id === id));
    if (bi === -1) return null;
    const members = buckets[bi].members;
    const mi = members.findIndex((t) => t.id === id);
    const intent = (groupId, beforeId) => ({ intent: { kind: 'tab', id, groupId, beforeId } });
    if (direction === 'down') {
      if (mi < members.length - 1) return intent(buckets[bi].groupId, members[mi + 2]?.id ?? null);
      const next = buckets[bi + 1];
      return next ? intent(next.groupId, next.members[0]?.id ?? null) : { stop: 'bottom' };
    }
    if (mi > 0) return intent(buckets[bi].groupId, members[mi - 1].id);
    const prev = buckets[bi - 1];
    return prev ? intent(prev.groupId, null) : { stop: 'top' };
  }

  function keyboardGroupMove(snapshot, groupId, direction) {
    const groups = snapshot?.groups || [];
    const gi = groups.findIndex((g) => g.id === groupId);
    if (gi === -1) return null;
    const intent = (beforeGroupId) => ({ intent: { kind: 'group', id: groupId, beforeGroupId } });
    if (direction === 'down') {
      return gi === groups.length - 1 ? { stop: 'bottom' } : intent(groups[gi + 2]?.id ?? null);
    }
    return gi === 0 ? { stop: 'top' } : intent(groups[gi - 1].id);
  }

  function describeMove(snapshot, intent) {
    const groups = snapshot?.groups || [];
    const tabs = snapshot?.tabs || [];
    const nameOf = (gid) => groups.find((g) => g.id === gid)?.name ?? '';
    if (intent.kind === 'group') return `Moved group ${nameOf(intent.id)}`;
    const tab = tabs.find((t) => t.id === intent.id);
    const from = tab?.groupId ?? null;
    const to = intent.groupId ?? null;
    if (from === to) return `Moved ${tab?.title || 'tab'}`;
    const base = to ? `Moved to ${nameOf(to)}` : `Moved out of ${nameOf(from)}`;
    const dissolves = from && tabs.filter((t) => t.groupId === from).length === 1;
    return dissolves ? `${base}. Group ${nameOf(from)} removed` : base;
  }

  globalThis.blancTabDrag = {
    constants, resolveTabDrop, resolveGroupDrop, keyboardTabMove, keyboardGroupMove, describeMove,
  };
})();
```

- [ ] **Step 3: Run tests**

Run: `node --test test/unit/tab-drag.test.js` → PASS. If a geometry assertion fails, fix the resolver, not the expected value — the expected values encode the spec's rules (pin boundary, header middle band, collapsed skip).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/tab-drag.js test/unit/tab-drag.test.js
git commit -m "Add pure drop resolvers and keyboard move helper for tab drag"
```

---

### Task 5: Drag session state machine

**Files:**
- Modify: `src/renderer/tab-drag.js` (add `createDragSession`, export it)
- Test: `test/unit/tab-drag.test.js`

**Interfaces:**
- Consumes: `resolveTabDrop`, `resolveGroupDrop`, `constants` (Task 4).
- Produces: `createDragSession(effects) → Session` where `effects` is:
  `{ readModel(): Model, capture(pointerId), release(pointerId), setDragging(bool), setSourceDim(bool), showGhost(source, y), moveGhost(y), removeGhost(), setIndicator(Indicator|null), scrollBy(dy), onDrop(intent) → Promise<boolean>|boolean, onActiveChange(active: bool), announce(message), requestFrame(fn) → handle, cancelFrame(handle), setTimer(fn, ms) → handle, clearTimer(handle), suppressClick() }`
- `Session`: `pointerDown({pointerId, x, y, source})`, `pointerMove({pointerId, x, y})`, `pointerUp({pointerId})`, `pointerCancel({pointerId})`, `lostCapture({pointerId})`, `escape() → boolean`, `scrolled()`, `notePayload(payload)`, `cancel()`, `isActive() → boolean`, `phase() → 'idle'|'pending'|'dragging'|'settling'`.

- [ ] **Step 1: Failing tests** — append to `test/unit/tab-drag.test.js`:

```js
function harness({ dropResult = true, modelOverride } = {}) {
  const calls = [];
  const frames = [];
  const timers = [];
  let currentModel = modelOverride || model;
  let dropResolve;
  const effects = {
    readModel: () => { calls.push(['readModel']); return currentModel; },
    capture: (id) => calls.push(['capture', id]),
    release: (id) => calls.push(['release', id]),
    setDragging: (v) => calls.push(['setDragging', v]),
    setSourceDim: (v) => calls.push(['setSourceDim', v]),
    showGhost: () => calls.push(['showGhost']),
    moveGhost: () => {},
    removeGhost: () => calls.push(['removeGhost']),
    setIndicator: (i) => calls.push(['setIndicator', i]),
    scrollBy: (dy) => calls.push(['scrollBy', dy]),
    onDrop: (intent) => {
      calls.push(['onDrop', intent]);
      if (dropResult === 'pending') return new Promise((r) => { dropResolve = r; });
      if (dropResult === 'reject') return Promise.reject(new Error('ipc'));
      return Promise.resolve(dropResult);
    },
    onActiveChange: (v) => calls.push(['active', v]),
    announce: (m) => calls.push(['announce', m]),
    // Handles are stable 1-based indices; a run or cancelled frame becomes null.
    requestFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelFrame: (h) => { frames[h - 1] = null; },
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: (h) => { if (timers[h - 1]) timers[h - 1].fn = null; },
    suppressClick: () => calls.push(['suppressClick']),
  };
  const session = drag.createDragSession(effects);
  return {
    session, calls, frames, timers,
    setModel: (m) => { currentModel = m; },
    resolveDrop: (v) => dropResolve(v),
    named: (name) => calls.filter((c) => c[0] === name),
    pendingFrames: () => frames.filter(Boolean).length,
    runFrame: (index) => { const f = frames[index]; frames[index] = null; f(); },
  };
}
const settle = () => new Promise((r) => setImmediate(r));
const L2 = tabSource('L2', false, null);

test('session: under 4px stays a click; 4px starts a drag', () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 10, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 10, y: 147 });
  assert.equal(h.session.phase(), 'pending');
  h.session.pointerUp({ pointerId: 1 });
  assert.equal(h.session.phase(), 'idle');
  assert.equal(h.named('capture').length, 0);

  h.session.pointerDown({ pointerId: 1, x: 10, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 10, y: 146 });
  assert.equal(h.session.phase(), 'dragging');
  assert.deepEqual(h.named('capture'), [['capture', 1]]);
  assert.deepEqual(h.named('active'), [['active', true]]);
  assert.equal(h.named('suppressClick').length, 1);
  assert.equal(h.named('setSourceDim')[0][1], true);
});

test('session: a valid drop keeps the source dimmed until the IPC settles', async () => {
  const h = harness({ dropResult: 'pending' });
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 79 });
  h.session.pointerUp({ pointerId: 1 });
  assert.equal(h.session.phase(), 'settling');
  assert.deepEqual(h.named('onDrop')[0][1], { kind: 'tab', id: 'L2', groupId: 'work', beforeId: 'W3' });
  assert.equal(h.named('setSourceDim').length, 1, 'still dimmed');
  assert.equal(h.session.isActive(), true);
  h.session.lostCapture({ pointerId: 1 });
  assert.equal(h.session.phase(), 'settling', 'our own release does not cancel a settling drop');
  h.resolveDrop(true);
  await settle();
  assert.equal(h.session.phase(), 'idle');
  assert.deepEqual(h.named('setSourceDim').at(-1), ['setSourceDim', false]);
  assert.deepEqual(h.named('active').at(-1), ['active', false]);
  assert.equal(h.named('announce').length, 0);
});

for (const outcome of [false, 'reject']) {
  test(`session: a drop that resolves ${outcome} restores the source and announces`, async () => {
    const h = harness({ dropResult: outcome });
    h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
    h.session.pointerMove({ pointerId: 1, x: 0, y: 79 });
    h.session.pointerUp({ pointerId: 1 });
    await settle();
    assert.equal(h.session.phase(), 'idle');
    assert.deepEqual(h.named('setSourceDim').at(-1), ['setSourceDim', false]);
    assert.ok(h.named('removeGhost').length >= 1);
    assert.deepEqual(h.named('setIndicator').at(-1), ['setIndicator', null]);
    assert.deepEqual(h.named('announce').at(-1), ['announce', 'Couldn\'t move L2']);
    assert.deepEqual(h.named('active').at(-1), ['active', false]);
  });
}

test('session: a drop that never settles times out as a failure', async () => {
  const h = harness({ dropResult: 'pending' });
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 79 });
  h.session.pointerUp({ pointerId: 1 });
  const timeout = h.timers.find((t) => t.ms === drag.constants.DROP_TIMEOUT_MS);
  assert.ok(timeout, 'drop timeout armed');
  timeout.fn();
  await settle();
  assert.equal(h.session.phase(), 'idle');
  assert.deepEqual(h.named('announce').at(-1), ['announce', 'Couldn\'t move L2']);
});

for (const [label, end] of [
  ['Escape', (s) => assert.equal(s.escape(), true)],
  ['pointercancel', (s) => s.pointerCancel({ pointerId: 1 })],
  ['lostpointercapture', (s) => s.lostCapture({ pointerId: 1 })],
  ['release over nothing', (s) => { s.pointerMove({ pointerId: 1, x: 0, y: 900 }); s.pointerUp({ pointerId: 1 }); }],
]) {
  test(`session: ${label} cancels with full teardown and no drop`, () => {
    const h = harness();
    h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
    h.session.pointerMove({ pointerId: 1, x: 0, y: 120 });
    end(h.session);
    assert.equal(h.session.phase(), 'idle');
    assert.equal(h.named('onDrop').length, 0);
    assert.deepEqual(h.named('setDragging').at(-1), ['setDragging', false]);
    assert.deepEqual(h.named('setSourceDim').at(-1), ['setSourceDim', false]);
    assert.deepEqual(h.named('setIndicator').at(-1), ['setIndicator', null]);
    assert.ok(h.named('removeGhost').length >= 1);
    assert.deepEqual(h.named('active').at(-1), ['active', false]);
  });
}

test('session: escape when idle is not handled', () => {
  assert.equal(harness().session.escape(), false);
});

test('session: an invalid gap shows no indicator', () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 2 });
  assert.deepEqual(h.named('setIndicator').at(-1), ['setIndicator', null]);
});

test('session: auto-scroll near an edge scrolls and refreshes rects before resolving', () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 158 });
  const readsBefore = h.named('readModel').length;
  assert.equal(h.pendingFrames(), 1, 'auto-scroll frame scheduled');
  // After scrolling 12px every row moved up 12px.
  const shifted = { ...model, sections: model.sections.map((s) => ({
    ...s, top: s.top - 12, bottom: s.bottom - 12,
    header: s.header && { top: s.header.top - 12, bottom: s.header.bottom - 12 },
    rows: s.rows.map((r) => ({ ...r, top: r.top - 12, bottom: r.bottom - 12 })) })) };
  h.setModel(shifted);
  h.runFrame(0);
  assert.ok(h.named('scrollBy').length === 1 && h.named('scrollBy')[0][1] > 0);
  assert.equal(h.named('readModel').length, readsBefore + 1, 'rects refreshed after the scroll step');
  // y=158 now sits past L2's shifted bottom (148) → still the loose end slot,
  // computed from the refreshed geometry.
  assert.deepEqual(h.named('setIndicator').at(-1), ['setIndicator', { type: 'line', y: 148 }]);
  assert.equal(h.pendingFrames(), 1, 'still at the edge, so the next step is scheduled');
  h.session.cancel();
  assert.equal(h.pendingFrames(), 0, 'auto-scroll stops on end');
});

test('session: scrolled() refreshes rects', () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 120 });
  const reads = h.named('readModel').length;
  h.session.scrolled();
  assert.equal(h.named('readModel').length, reads + 1);
});

test('session: a payload missing the source cancels; a present source does not', () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 120 });
  h.session.notePayload({ tabs: [{ id: 'L2' }], groups: [] });
  assert.equal(h.session.phase(), 'dragging');
  h.session.notePayload({ tabs: [{ id: 'L1' }], groups: [] });
  assert.equal(h.session.phase(), 'idle');
  const g = harness();
  g.session.pointerDown({ pointerId: 1, x: 0, y: 30, source: { kind: 'group', id: 'work', title: 'work' } });
  g.session.pointerMove({ pointerId: 1, x: 0, y: 115 });
  g.session.notePayload({ tabs: [], groups: [{ id: 'play' }] });
  assert.equal(g.session.phase(), 'idle', 'dissolved source group cancels');
});

test('session: a group drag drops a group intent', async () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 0, y: 110, source: { kind: 'group', id: 'play', title: 'play' } });
  h.session.pointerMove({ pointerId: 1, x: 0, y: 22 });
  h.session.pointerUp({ pointerId: 1 });
  await settle();
  assert.deepEqual(h.named('onDrop')[0][1], { kind: 'group', id: 'play', beforeGroupId: 'work' });
});

test('session: events for another pointer are ignored', () => {
  const h = harness();
  h.session.pointerDown({ pointerId: 1, x: 0, y: 150, source: L2 });
  h.session.pointerMove({ pointerId: 2, x: 0, y: 100 });
  assert.equal(h.session.phase(), 'pending');
});
```

Run: `node --test test/unit/tab-drag.test.js` → FAIL (`createDragSession is not a function`).

- [ ] **Step 2: Implement** — inside the IIFE in `src/renderer/tab-drag.js`, before `globalThis.blancTabDrag = …`, add:

```js
  function createDragSession(fx) {
    let phase = 'idle';
    let pointerId = null;
    let source = null;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let model = null;
    let hit = null;
    let frame = 0;
    let dropTimer = 0;

    const resolve = () => {
      hit = source.kind === 'group'
        ? resolveGroupDrop(model, source.id, lastY)
        : resolveTabDrop(model, source, lastY);
      fx.setIndicator(hit ? hit.indicator : null);
    };

    const edgeSpeed = () => {
      if (!model) return 0;
      const { EDGE_PX, MAX_SCROLL_STEP } = constants;
      if (lastY < model.top + EDGE_PX) {
        return -Math.ceil(((model.top + EDGE_PX - lastY) / EDGE_PX) * MAX_SCROLL_STEP);
      }
      if (lastY > model.bottom - EDGE_PX) {
        return Math.ceil(((lastY - (model.bottom - EDGE_PX)) / EDGE_PX) * MAX_SCROLL_STEP);
      }
      return 0;
    };

    const tick = () => {
      frame = 0;
      if (phase !== 'dragging') return;
      const speed = edgeSpeed();
      if (!speed) return;
      fx.scrollBy(Math.max(-constants.MAX_SCROLL_STEP, Math.min(constants.MAX_SCROLL_STEP, speed)));
      model = fx.readModel();
      resolve();
      frame = fx.requestFrame(tick);
    };

    const scheduleScroll = () => {
      if (!frame && edgeSpeed()) frame = fx.requestFrame(tick);
    };

    function end() {
      const wasActive = phase === 'dragging' || phase === 'settling';
      const wasDragging = phase === 'dragging';
      if (frame) fx.cancelFrame(frame);
      if (dropTimer) fx.clearTimer(dropTimer);
      frame = 0;
      dropTimer = 0;
      const id = pointerId;
      phase = 'idle';
      pointerId = null;
      hit = null;
      if (!wasActive) { source = null; return; }
      if (wasDragging) fx.release(id);
      fx.removeGhost();
      fx.setIndicator(null);
      fx.setSourceDim(false);
      fx.setDragging(false);
      source = null;
      model = null;
      fx.onActiveChange(false);
    }

    function start() {
      phase = 'dragging';
      fx.capture(pointerId);
      fx.setDragging(true);
      model = fx.readModel();
      fx.setSourceDim(true);
      fx.showGhost(source, lastY);
      fx.suppressClick();
      fx.onActiveChange(true);
    }

    function drop() {
      const intent = hit?.intent;
      if (!intent) { end(); return; }
      const title = source.title || (source.kind === 'group' ? 'group' : 'tab');
      // Settling first: releasing capture can fire lostpointercapture
      // synchronously, and that must not cancel the drop being committed.
      phase = 'settling';
      fx.release(pointerId);
      fx.removeGhost();
      fx.setIndicator(null);
      if (frame) { fx.cancelFrame(frame); frame = 0; }
      let settled = false;
      const finish = (ok) => {
        if (settled || phase !== 'settling') return;
        settled = true;
        if (ok !== true) fx.announce(`Couldn't move ${title}`);
        end();
      };
      dropTimer = fx.setTimer(() => finish(false), constants.DROP_TIMEOUT_MS);
      let result;
      try { result = fx.onDrop(intent); } catch { finish(false); return; }
      Promise.resolve(result).then(finish, () => finish(false));
    }

    return {
      phase: () => phase,
      isActive: () => phase === 'dragging' || phase === 'settling',
      pointerDown(event) {
        if (phase !== 'idle' || !event.source) return;
        phase = 'pending';
        pointerId = event.pointerId;
        source = event.source;
        startX = event.x;
        startY = event.y;
        lastY = event.y;
      },
      pointerMove(event) {
        if (event.pointerId !== pointerId) return;
        lastY = event.y;
        if (phase === 'pending') {
          const { DRAG_THRESHOLD_PX } = constants;
          if (Math.abs(event.y - startY) < DRAG_THRESHOLD_PX
            && Math.abs(event.x - startX) < DRAG_THRESHOLD_PX) return;
          start();
        }
        if (phase !== 'dragging') return;
        fx.moveGhost(lastY);
        resolve();
        scheduleScroll();
      },
      pointerUp(event) {
        if (event.pointerId !== pointerId) return;
        if (phase === 'pending') { end(); return; }
        if (phase === 'dragging') drop();
      },
      pointerCancel(event) {
        if (event.pointerId === pointerId && phase !== 'settling') end();
      },
      lostCapture(event) {
        if (event.pointerId === pointerId && phase === 'dragging') end();
      },
      escape() {
        if (phase !== 'dragging') return false;
        end();
        return true;
      },
      scrolled() {
        if (phase !== 'dragging') return;
        model = fx.readModel();
        resolve();
      },
      notePayload(payload) {
        if (phase !== 'dragging' || !source) return;
        const present = source.kind === 'group'
          ? (payload?.groups || []).some((g) => g.id === source.id)
          : (payload?.tabs || []).some((t) => t.id === source.id);
        if (!present) end();
      },
      cancel() {
        if (phase === 'settling') return;
        end();
      },
    };
  }
```

Add `createDragSession` to the `globalThis.blancTabDrag` object.

- [ ] **Step 3: Run tests**

Run: `node --test test/unit/tab-drag.test.js` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/tab-drag.js test/unit/tab-drag.test.js
git commit -m "Add drag session state machine with failure and teardown paths"
```

---

### Task 6: DOM adapter, shared CSS, allowlist, and the rail

**Files:**
- Modify: `src/renderer/tab-drag.js` (add `attach`)
- Modify: `src/main/chrome-protocol.js` (`SHARED_ASSETS`)
- Modify: `src/renderer/index.html:145-147`, `src/renderer/overlay.html:214-215`
- Modify: `src/renderer/styles.css` (replace `.vertical-tab-row.dragging` / `.drop-before` / `.drop-after` rules at ~813–836; add shared drag rules)
- Modify: `src/renderer/vertical-tabs.js`
- Test: `test/unit/chrome-protocol.test.js`

**Interfaces:**
- Consumes: `createDragSession`, `keyboardTabMove`, `keyboardGroupMove`, `describeMove` (Tasks 4–5); `browserAPI.moveTab`, `browserAPI.reorderGroup` (Task 2).
- Produces: `blancTabDrag.attach({ list, document, window, enabled?: () => boolean, onDrop(intent) → Promise<boolean>, onActiveChange(active), announce(message) }) → { isActive(), cancel(), notePayload(payload) }`.
- DOM contract both surfaces must follow:
  - list element gets `data-drag-root`;
  - sections: `[data-drag-section="pinned"|"group"|"loose"]`, group sections also `data-group-id` and `data-collapsed="true"` when collapsed; empty pinned/loose zones are `.drag-empty-zone[data-drag-section]`;
  - group header: `[data-drag-header]` with `data-group-id`, `data-drag-title`;
  - tab row: `[data-drag-tab]` with `data-tab-id`, `data-pinned="true|false"`, `data-group-id` (empty string for none), `data-drag-title`;
  - secondary controls inside rows: `[data-no-drag]`.

- [ ] **Step 1: Allowlist test (failing).** In `test/unit/chrome-protocol.test.js`, add a test that `chromeResourcePath('blanc-chrome://index/tab-drag.js')` and `chromeResourcePath('blanc-chrome://overlay/tab-drag.js')` both resolve to a path ending in `src/renderer/tab-drag.js` (copy the assertion style the file already uses for `/pages/type-to-open.js`). Run `node --test test/unit/chrome-protocol.test.js` → FAIL.

- [ ] **Step 2: Allowlist.** In `src/main/chrome-protocol.js` `SHARED_ASSETS` add:

```js
  // Pure drag-to-reorder controller shared by the rail and the island so the
  // two surfaces cannot disagree. No IPC of its own and no application data.
  '/tab-drag.js',
```

Confirm how `SHARED_ASSETS` paths map to files (the `/pages/…` entries map into `src/renderer/pages/`); `/tab-drag.js` must map to `src/renderer/tab-drag.js`. Run the test → PASS.

- [ ] **Step 3: Script tags.** `src/renderer/index.html`: insert `<script src="tab-drag.js"></script>` before `<script src="vertical-tabs.js"></script>`. `src/renderer/overlay.html`: insert it before `<script src="workspace-ui.js"></script>`. Check both documents' CSP `script-src` already allows `'self'` (it does for the existing local scripts); no CSP change is expected.

- [ ] **Step 4: Adapter.** In `src/renderer/tab-drag.js`, before the `globalThis.blancTabDrag` assignment, add and export `attach`:

```js
  function attach({ list, document: doc, window: win, enabled = () => true, onDrop, onActiveChange, announce }) {
    list.dataset.dragRoot = '';
    let ghost = null;
    let grabOffset = 0;
    let sourceEl = null;
    let headerTarget = null;
    let suppressClickArmed = false;
    const line = doc.createElement('div');
    line.className = 'tab-drag-line';
    line.hidden = true;
    line.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(line);

    const rectOf = (el) => el.getBoundingClientRect();
    const visible = (r) => r.height > 0;

    function readModel() {
      const listRect = rectOf(list);
      const sections = [];
      for (const el of list.querySelectorAll('[data-drag-section]')) {
        const r = rectOf(el);
        if (!visible(r)) continue;
        const headerEl = el.querySelector('[data-drag-header]');
        const hr = headerEl ? rectOf(headerEl) : null;
        sections.push({
          kind: el.dataset.dragSection,
          groupId: el.dataset.groupId || null,
          collapsed: el.dataset.collapsed === 'true',
          top: r.top, bottom: r.bottom,
          header: hr && visible(hr) ? { top: hr.top, bottom: hr.bottom } : null,
          rows: [...el.querySelectorAll('[data-drag-tab]')]
            .map((row) => ({ row, r: rectOf(row) }))
            .filter(({ r: rr }) => visible(rr))
            .map(({ row, r: rr }) => ({
              id: row.dataset.tabId, pinned: row.dataset.pinned === 'true', top: rr.top, bottom: rr.bottom,
            })),
        });
      }
      return { top: listRect.top, bottom: listRect.bottom, sections };
    }

    function sourceFor(target) {
      if (!target?.closest || target.closest('[data-no-drag]')) return null;
      const header = target.closest('[data-drag-header]');
      if (header && list.contains(header)) {
        return { el: header.closest('[data-drag-section]') || header, grab: header,
          source: { kind: 'group', id: header.dataset.groupId, title: header.dataset.dragTitle || '' } };
      }
      const row = target.closest('[data-drag-tab]');
      if (row && list.contains(row)) {
        return { el: row, grab: row, source: {
          kind: 'tab', id: row.dataset.tabId, pinned: row.dataset.pinned === 'true',
          groupId: row.dataset.groupId || null, title: row.dataset.dragTitle || '',
        } };
      }
      return null;
    }

    const session = createDragSession({
      readModel,
      capture: (id) => { try { list.setPointerCapture(id); } catch {} },
      release: (id) => { try { if (list.hasPointerCapture(id)) list.releasePointerCapture(id); } catch {} },
      setDragging: (on) => { if (on) list.dataset.tabDragging = 'true'; else delete list.dataset.tabDragging; },
      setSourceDim: (on) => sourceEl?.classList.toggle('tab-drag-source', on),
      showGhost: (_source, y) => {
        const grab = sourceEl.matches('[data-drag-section]') ? sourceEl.querySelector('[data-drag-header]') : sourceEl;
        const r = rectOf(grab);
        grabOffset = y - r.top;
        ghost = grab.cloneNode(true);
        ghost.classList.add('tab-drag-ghost');
        ghost.removeAttribute('id');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.setProperty('--drag-left', `${r.left}px`);
        ghost.style.setProperty('--drag-width', `${r.width}px`);
        ghost.style.setProperty('--drag-y', `${y - grabOffset}px`);
        doc.body.appendChild(ghost);
      },
      moveGhost: (y) => ghost?.style.setProperty('--drag-y', `${y - grabOffset}px`),
      removeGhost: () => { ghost?.remove(); ghost = null; },
      setIndicator: (indicator) => {
        headerTarget?.classList.remove('tab-drag-target');
        headerTarget = null;
        line.hidden = !(indicator && indicator.type === 'line');
        if (indicator?.type === 'line') {
          const r = rectOf(list);
          line.style.setProperty('--drag-left', `${r.left + 7}px`);
          line.style.setProperty('--drag-width', `${Math.max(0, r.width - 14)}px`);
          line.style.setProperty('--drag-y', `${indicator.y - 1}px`);
        } else if (indicator?.type === 'header') {
          headerTarget = list.querySelector(`[data-drag-header][data-group-id="${CSS.escape(indicator.groupId)}"]`);
          headerTarget?.classList.add('tab-drag-target');
        }
      },
      scrollBy: (dy) => { list.scrollTop += dy; },
      onDrop,
      onActiveChange: (active) => {
        if (!active) sourceEl = null;
        onActiveChange?.(active);
      },
      announce,
      requestFrame: (fn) => win.requestAnimationFrame(fn),
      cancelFrame: (h) => win.cancelAnimationFrame(h),
      setTimer: (fn, ms) => win.setTimeout(fn, ms),
      clearTimer: (h) => win.clearTimeout(h),
      suppressClick: () => { suppressClickArmed = true; },
    });

    list.addEventListener('pointerdown', (event) => {
      suppressClickArmed = false;
      if (event.button !== 0 || !event.isPrimary || !enabled()) return;
      const found = sourceFor(event.target);
      if (!found) return;
      sourceEl = found.el;
      session.pointerDown({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, source: found.source });
    });
    list.addEventListener('pointermove', (event) => {
      session.pointerMove({ pointerId: event.pointerId, x: event.clientX, y: event.clientY });
    });
    list.addEventListener('pointerup', (event) => session.pointerUp({ pointerId: event.pointerId }));
    list.addEventListener('pointercancel', (event) => session.pointerCancel({ pointerId: event.pointerId }));
    list.addEventListener('lostpointercapture', (event) => session.lostCapture({ pointerId: event.pointerId }));
    list.addEventListener('scroll', () => session.scrolled(), { passive: true });
    // A completed drag must not also activate the row or fold the header the
    // press started on.
    doc.addEventListener('click', (event) => {
      if (!suppressClickArmed) return;
      suppressClickArmed = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    // window capture runs before any document-level key handler.
    win.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && session.escape()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    win.addEventListener('pagehide', () => session.cancel());

    return {
      isActive: () => session.isActive(),
      cancel: () => session.cancel(),
      notePayload: (payload) => session.notePayload(payload),
    };
  }
```

- [ ] **Step 5: Shared CSS.** In `src/renderer/styles.css` delete the `.vertical-tab-row.dragging`, `.vertical-tab-row.drop-before::before, .vertical-tab-row.drop-after::after`, `.vertical-tab-row.drop-before::before` and `.vertical-tab-row.drop-after::after` rules, and add (near the rail rules):

```css
/* Drag to reorder (tab-drag.js) — shared by the rail and the island. */
[data-drag-root] * {
  -webkit-user-drag: none;
}

[data-drag-root][data-tab-dragging] {
  user-select: none;
  cursor: grabbing;
}

.tab-drag-source {
  opacity: 0.45;
}

.tab-drag-ghost {
  position: fixed;
  z-index: 50;
  top: var(--drag-y);
  left: var(--drag-left);
  width: var(--drag-width);
  margin: 0;
  pointer-events: none;
  opacity: 0.92;
  background: var(--bg);
  border-radius: 8px;
  box-shadow: var(--shadow-popover);
}

.tab-drag-line {
  position: fixed;
  z-index: 51;
  top: var(--drag-y);
  left: var(--drag-left);
  width: var(--drag-width);
  height: 2px;
  border-radius: 999px;
  background: var(--accent);
  pointer-events: none;
}

.tab-drag-target {
  box-shadow: inset 0 0 0 1px var(--accent);
}

.drag-empty-zone {
  display: none;
}

[data-tab-dragging] .drag-empty-zone {
  display: block;
  min-height: 28px;
}
```

Check `--bg` is the surface token used by both the rail and the island panel (`grep -n "^\s*--bg:" src/renderer/styles.css`); if the panel uses a different surface token, use that one. Run `npm run substrate:check` — the tokens checker must stay green (no token values changed).

- [ ] **Step 6: Rail markup.** In `src/renderer/vertical-tabs.js`:
  - Delete `dragState`, `beforeIdForDrop`, `addDragBehavior`, the `addDragBehavior(...)` call site, `primary.draggable = true`, and both `dragState = null;` lines in `render`.
  - In `tabRow(tab, …)` after `row.dataset.bucket = bucketKey(tab);` add:

```js
    row.dataset.dragTab = '';
    row.dataset.pinned = String(!!tab.pinned);
    row.dataset.groupId = tab.groupId ?? '';
    row.dataset.dragTitle = titleFor(tab);
```

    and add `closeButton.dataset.noDrag = '';` (and on any other secondary button in the row).
  - `staticBucket(label, …)`: add a `kind` parameter (`'pinned'` or `'loose'`) and set `section.dataset.dragSection = kind;`. When `tabs` is empty, return an empty zone instead of `null`:

```js
  function emptyZone(kind) {
    const zone = document.createElement('div');
    zone.className = 'drag-empty-zone';
    zone.dataset.dragSection = kind;
    zone.setAttribute('aria-hidden', 'true');
    return zone;
  }
```

    Update the two call sites: `staticBucket('pinned', 'pinned', standalonePins, activeTabId)` and `staticBucket('tabs', 'loose', looseTabs, activeTabId)`; `render` appends whatever is returned (no more `if (section)` null checks for these two).
  - `groupSection`: `section.dataset.dragSection = 'group'; section.dataset.groupId = group.id; section.dataset.collapsed = String(!!group.collapsed);` and on the header `header.dataset.dragHeader = ''; header.dataset.groupId = group.id; header.dataset.dragTitle = group.name;`.

- [ ] **Step 7: Rail wiring.** In `src/renderer/vertical-tabs.js`:

```js
  const dragApi = window.blancTabDrag;
  let lastPayload = null;
  let deferredPayload = null;

  async function railMove(intent) {
    const message = dragApi.describeMove(lastPayload, intent);
    pendingFocusKey = intent.kind === 'group' ? `group:${intent.id}` : `tab:${intent.id}`;
    let ok = false;
    try {
      ok = intent.kind === 'group'
        ? await api.reorderGroup(intent.id, intent.beforeGroupId)
        : await api.moveTab(intent.id, { groupId: intent.groupId, beforeId: intent.beforeId });
    } catch (error) {
      console.error('Vertical tabs: move failed', error);
    }
    if (ok === true) announce(message);
    else window.setTimeout(() => { if (pendingFocusKey?.endsWith(intent.id)) pendingFocusKey = null; }, 100);
    return ok === true;
  }

  const drag = dragApi.attach({
    list,
    document,
    window,
    onDrop: railMove,
    announce,
    onActiveChange(active) {
      if (active) return;
      const payload = deferredPayload;
      deferredPayload = null;
      if (payload) renderNow(payload);
    },
  });

  function keyboardMove(kind, id, direction) {
    if (!lastPayload) return;
    const result = kind === 'group'
      ? dragApi.keyboardGroupMove(lastPayload, id, direction)
      : dragApi.keyboardTabMove(lastPayload, id, direction);
    if (!result) return;
    if (result.stop) { announce(result.stop === 'top' ? 'Already at the top' : 'Already at the bottom'); return; }
    invoke('move with keyboard', () => railMove(result.intent));
  }
```

  Rename the existing `function render(payload = {})` to `function renderNow(payload = {})`, set `lastPayload = payload;` as its first line, and add the deferring entry point:

```js
  function render(payload = {}) {
    if (drag.isActive()) {
      deferredPayload = payload;
      if (payload.tabLayout !== 'vertical') { drag.cancel(); return; }
      drag.notePayload(payload);
      return;
    }
    renderNow(payload);
  }
```

  (`drag.cancel()` / a cancelling `notePayload` end the session, whose `onActiveChange(false)` renders the deferred payload once. A settling drag ignores `cancel()`; its own end flushes.)
  Keep `window.blancVerticalTabs = Object.freeze({ render });` exporting the deferring `render`.
  - Keyboard: at the top of `primaryKeydown(event, tab, …)`:

```js
    if (event.altKey && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      keyboardMove('tab', tab.id, event.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }
```

    and at the top of the group header's `keydown` listener the same block calling `keyboardMove('group', group.id, …)`. Place both checks before the existing unmodified ArrowUp/ArrowDown branches so the modified keys never fall through to focus movement.

- [ ] **Step 8: Verify unit + guards**

Run: `npm run test:unit && npm run lint && npm run substrate:check && npm run browser-api:check`
Expected: PASS.

- [ ] **Step 9: Manual check in the app.** Kill any running dev instance, `npm start`, switch to vertical tabs, create two groups with three tabs each, and confirm: reorder inside a group; drag into the other group; drag onto a collapsed header (tab joins, group stays collapsed); drag a group header above another; drag a tab out over the page and release (nothing happens); ⌥⇧↓ across a group boundary. Leave the app running.

- [ ] **Step 10: Commit**

```bash
git add src/main/chrome-protocol.js src/renderer test/unit/chrome-protocol.test.js
git commit -m "Move the rail to the shared pointer-based tab drag"
```

---

### Task 7: The island

**Files:**
- Modify: `src/renderer/overlay.js` (`tabRow` ~491, `pinnedHeaderRow` ~628, `groupHeaderRow` ~642, `focusedRowAnchor`/`restoreRowFocus` ~1213, `renderList` ~1323–1430, `releasePointerHold` ~120, input listener ~2262, `onTabsUpdated` ~2370, the `overlay:hide` handler)
- Modify: `src/renderer/overlay.html` (live region next to `#glancePickerLive`)
- Modify: `src/renderer/styles.css` (`.island-drag-section`, focusable `.island-ghead`)

**Interfaces:**
- Consumes: `blancTabDrag.attach`, `keyboardTabMove`, `keyboardGroupMove`, `describeMove`; `browserAPI.moveTab`, `reorderGroup`, `setOverlayDragState`.

- [ ] **Step 1: Live region.** In `src/renderer/overlay.html`, next to `#glancePickerLive`, add `<div id="islandDragLive" class="sr-only" aria-live="polite" aria-atomic="true"></div>`.

- [ ] **Step 2: Row and header markup.**
  - `tabRow(tab)`: after `row.dataset.tabId = tab.id;` add

```js
    row.dataset.dragTab = '';
    row.dataset.pinned = String(!!tab.pinned);
    row.dataset.groupId = tab.groupId ?? '';
    row.dataset.dragTitle = tab.title || 'New Tab';
```

    and set `dataset.noDrag = ''` on each secondary control created in this function (`.row-pin`, `.row-mute`, `.row-glance`, `.row-close`).
  - `groupHeaderRow(group, …)`: add

```js
    row.dataset.dragHeader = '';
    row.dataset.groupId = group.id;
    row.dataset.dragTitle = group.name;
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-expanded', String(!group.collapsed));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        window.browserAPI.toggleGroupCollapsed(group.id);
      }
    });
```

  - New helpers next to `groupBand`:

```js
  /** A drag section wrapper for the standalone pinned and loose rows, so the
   * shared drag controller can measure them like group bands. */
  function dragSection(kind, nodes) {
    const section = document.createElement('div');
    section.className = 'island-drag-section';
    section.dataset.dragSection = kind;
    section.append(...nodes);
    return section;
  }
  function dragEmptyZone(kind) {
    const zone = document.createElement('div');
    zone.className = 'drag-empty-zone';
    zone.dataset.dragSection = kind;
    zone.setAttribute('aria-hidden', 'true');
    return zone;
  }
```

  - `groupBand(nodes)` gains a `group` parameter: `band.dataset.dragSection = 'group'; band.dataset.groupId = group.id; band.dataset.collapsed = String(!!group.collapsed);`. Update its call site to `groupBand(group, bandNodes)`.
  - In `renderList`'s resting branch replace

```js
      if (pinned.length) {
        rows.push(pinnedHeaderRow(pinned.length));
        rows.push(...pinned.map(tabRow));
      }
```

    with

```js
      rows.push(pinned.length
        ? dragSection('pinned', [pinnedHeaderRow(pinned.length), ...pinned.map(tabRow)])
        : dragEmptyZone('pinned'));
```

    and replace the loose branch `rows.push(...gtabs.map(tabRow));` with `rows.push(dragSection('loose', gtabs.map(tabRow)));`. After the cluster loop, if no loose cluster was pushed, push `dragEmptyZone('loose')` (track with a `let sawLoose = false;` set in the `else` branch).
  - CSS in `src/renderer/styles.css` next to `.island-group-band`:

```css
.island-drag-section {
  display: flex;
  flex-direction: column;
}

.island-ghead:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: -1px;
}
```

  Before committing, compare the resting island at rest against `main` (same tabs/groups, before/after crop) to confirm the wrapper changed no spacing.

- [ ] **Step 3: Header focus restore.** Extend `focusedRowAnchor()`:

```js
  function focusedRowAnchor() {
    const el = document.activeElement;
    const header = el?.closest?.('[data-drag-header]');
    if (header && islandList.contains(header)) return { groupId: header.dataset.groupId };
    const row = el && el.closest && el.closest('.island-row[data-tab-id]');
    …existing body…
  }
```

  and at the top of `restoreRowFocus(anchor)`:

```js
    if (anchor?.groupId) {
      islandList.querySelector(`[data-drag-header][data-group-id="${CSS.escape(anchor.groupId)}"]`)?.focus();
      return;
    }
```

- [ ] **Step 4: Attach, defer, report.** Near the pointer-hold code:

```js
  const dragApi = window.blancTabDrag;
  const islandDragLive = document.getElementById('islandDragLive');
  function announceIsland(message) {
    islandDragLive.textContent = '';
    requestAnimationFrame(() => { islandDragLive.textContent = message; });
  }
  /** The resting list (pinned, groups, loose) — the only list mode that can be dragged. */
  function restingList() {
    if (mode !== 'panel' && mode !== 'palette') return false;
    if (siteInfoOpen || commandNotice) return false;
    const value = addressInput.value;
    return !(inputTouched && (value.startsWith('/') || value.trim()));
  }
  async function islandMove(intent) {
    const message = dragApi.describeMove(state, intent);
    let ok = false;
    try {
      ok = intent.kind === 'group'
        ? await window.browserAPI.reorderGroup(intent.id, intent.beforeGroupId)
        : await window.browserAPI.moveTab(intent.id, { groupId: intent.groupId, beforeId: intent.beforeId });
    } catch (error) {
      console.error('Island: move failed', error);
    }
    if (ok === true) announceIsland(message);
    return ok === true;
  }
  const islandDrag = dragApi.attach({
    list: islandList,
    document,
    window,
    enabled: restingList,
    onDrop: islandMove,
    announce: announceIsland,
    onActiveChange(active) {
      window.browserAPI.setOverlayDragState(active);
      if (!active && renderQueued && !pointerHeld) {
        renderQueued = false;
        renderList();
      }
    },
  });
```

  - `renderList()`: change the guard to `if (pointerHeld || islandDrag.isActive()) { renderQueued = true; return; }`. Because `islandDrag` is declared after `renderList` is defined but before any render runs, this is safe; if lint flags use-before-define, move the attach block above `renderList`.
  - `releasePointerHold()`: change `if (!renderQueued) return;` to `if (!renderQueued || islandDrag.isActive()) return;` (the drag's own end flushes).
  - `onTabsUpdated`: right after `state = payload;` add `islandDrag.notePayload(payload);`.
  - In the `addressInput` `input` listener, first statement: `if (islandDrag.isActive()) islandDrag.cancel();`.
  - Wherever `commandNotice` is set to a non-empty value (lines ~849, ~853), add `islandDrag.cancel();` immediately before.
  - In the `overlay:hide` handler, first statement: `islandDrag.cancel();`.

- [ ] **Step 5: Keyboard.**

```js
  islandList.addEventListener('keydown', (event) => {
    if (!event.altKey || !event.shiftKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    if (!restingList()) return;
    const direction = event.key === 'ArrowUp' ? 'up' : 'down';
    const header = event.target.closest?.('[data-drag-header]');
    const row = event.target.closest?.('.island-row[data-tab-id]');
    const result = header
      ? dragApi.keyboardGroupMove(state, header.dataset.groupId, direction)
      : row ? dragApi.keyboardTabMove(state, row.dataset.tabId, direction) : null;
    if (!result) return;
    event.preventDefault();
    event.stopPropagation();
    if (result.stop) {
      announceIsland(result.stop === 'top' ? 'Already at the top' : 'Already at the bottom');
      return;
    }
    islandMove(result.intent);
  });
```

  (Focus follows: `focusedRowAnchor` records the focused row/header by id before the re-render and `restoreRowFocus` re-focuses it.)

- [ ] **Step 6: Verify**

Run: `npm run test:unit && npm run lint && npm run browser-api:check && npm run substrate:check`
Expected: PASS.

Manual: kill and relaunch `npm start`. In the island (⌘L) repeat the Task 6 Step 9 checklist, plus: Escape mid-drag cancels the drag and the panel stays open; typing during a drag cancels it; drag disabled while a slash command list shows. Leave the app running.

- [ ] **Step 7: Commit**

```bash
git add src/renderer
git commit -m "Add drag and keyboard reordering to the expanded island"
```

---

### Task 8: Specs and acceptance coverage on both surfaces

**Files:**
- Modify: `spec/features.md` (F3, F28 pointer-actions bullet at ~559–564)
- Create: `spec/acceptance/tab-drag.feature`
- Modify: `spec/acceptance/vertical-tabs.feature` (F28-10, F28-11), `spec/acceptance/index.md`
- Create: `test/desktop/steps/tab-drag.steps.js`
- Modify: `test/desktop/steps/vertical-tabs.steps.js` (`dragRow` and F28-10/11 steps), `test/desktop/support/fixtures-server.js`, `test/desktop/cucumber.mjs`

**Interfaces:**
- Consumes: hook `moveTab`, `reorderGroup`, `overlayDragging`, `groupTabByName`, `toggleGroup`, `openTab`, `workspacePageScript`, `state`; `overlayPage()` from `test/desktop/support/overlay.js`; `openOverlaySurface` from `test/desktop/support/poll.js`.

- [ ] **Step 1: Spec text.**
  - `spec/features.md` F3: add a bullet:

```md
- **Drag to reorder** (rail and expanded island, same gesture): drag a tab
  within its section, into another group's section or onto any group header
  (appends; a collapsed group stays collapsed), or out to the loose section.
  Dragging never changes pinned state. Drag a group header to reorder groups;
  cluster order (⌘1–9, ⌥⌘↑/↓, pill dots) follows. ⌥⇧↑/↓ does the same from the
  keyboard, skipping collapsed groups and stopping at either end. Dragging out
  over page content does nothing and gives the page no data.
```

  - F28: replace the sentence starting "Drag reorder is accepted only within the same `{groupId,pinned}` bucket…" through "…changing order or membership." with: "Drag reorder follows F3's rule: tabs may move between groups and the loose section, never across the pinned boundary; a pin-crossing drop is rejected without changing order, membership or pinned state."
  - `spec/acceptance/vertical-tabs.feature`: rewrite F28-11:

```gherkin
  @F28-11 @F28 @desktop @D19
  Scenario: Drag reorder rejects pin-crossing drops
    Given rail rows span different groups and pinned states
    When I drag a pinned row into an unpinned bucket
    Then the drop is rejected
    And canonical tab order and pinned state are unchanged
```

  - Create `spec/acceptance/tab-drag.feature` (ids continue after `@F3-5`):

```gherkin
Feature: Drag to reorder tabs and groups
  The vertical rail and the expanded island share one drag gesture and one
  keyboard path. Every behaviour is checked on both surfaces.

  Background:
    Given groups "work" and "play" each hold three loaded tabs
    And two loose tabs are open

  @F3-6 @F3 @desktop
  Scenario Outline: Reorder within a group
    When I drag the third "work" tab before the first "work" tab in the <surface>
    Then "work" lists that tab first

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-7 @F3 @desktop
  Scenario Outline: Move a tab from one group to another
    When I drag the first "play" tab before the second "work" tab in the <surface>
    Then that tab belongs to "work" at that position

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-8 @F3 @desktop
  Scenario Outline: Move a grouped tab to the loose section
    When I drag the first "work" tab before the first loose tab in the <surface>
    Then that tab is loose and leads the loose section

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-9 @F3 @desktop
  Scenario Outline: Move a loose tab into a group
    When I drag the first loose tab before the first "play" tab in the <surface>
    Then that tab belongs to "play" at that position

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-10 @F3 @desktop
  Scenario Outline: Drop on a collapsed group header
    Given "play" is collapsed
    When I drag the first loose tab onto the "play" header in the <surface>
    Then that tab is the last tab of "play"
    And "play" is still collapsed

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-11 @F3 @desktop
  Scenario Outline: Reorder groups
    When I drag the "play" header above the "work" header in the <surface>
    Then the group order is "play", "work"
    And the first cluster shortcut selects the first "play" tab

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-12 @F3 @desktop
  Scenario Outline: The source group dissolves when its last tab leaves
    Given group "solo" holds one loaded tab
    When I drag the "solo" tab before the first loose tab in the <surface>
    Then group "solo" no longer exists

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-13 @F3 @desktop
  Scenario Outline: Pin-crossing drops are rejected
    Given the first loose tab is pinned
    When I drag that pinned tab before the second loose tab in the <surface>
    Then canonical tab order, groups and pinned state are unchanged

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-14 @F3 @desktop
  Scenario Outline: Keyboard moves skip collapsed groups
    Given group "mid" holds one loaded tab and sits between "work" and "play"
    And "mid" is collapsed
    When I focus the last "work" tab in the <surface> and press Alt+Shift+ArrowDown
    Then that tab belongs to "play" as its first tab

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-15 @F3 @desktop
  Scenario Outline: Dragging out over page content has no page effect
    Given the active tab is the drag probe page
    When I drag the first "work" tab out over the page and release it in the <surface>
    Then the probe page did not navigate
    And the probe page saw no drag, drop or paste events and no tab id
    And canonical tab order and groups are unchanged

    Examples:
      | surface |
      | rail    |
      | island  |

  @F3-16 @F3 @desktop
  Scenario: Escape mid-drag keeps the island open
    When I start dragging the first "work" tab in the island
    And I press Escape
    Then the island panel is still open
    And the island drag flag is clear
    And canonical tab order and groups are unchanged
```

  - `spec/acceptance/index.md`: add a row `| Drag to reorder | \`tab-drag.feature\` | F3, F28 |` next to the tabs-and-groups row.

- [ ] **Step 2: Drag probe fixture.** In `test/desktop/support/fixtures-server.js` `pageBody`, add (before the `return`):

```js
  // Drag-out probe (F3-15): records anything a page could learn from a tab
  // drag released over it. Read back with workspacePageScript.
  const dragProbe = raw.includes('dragprobe=1')
    ? '<script>window.__dragProbe={events:[],data:[]};' +
      "for(const t of ['dragenter','dragover','drop','paste']){" +
      'document.addEventListener(t,(e)=>{window.__dragProbe.events.push(t);' +
      "const d=e.dataTransfer||e.clipboardData;if(d){for(const k of d.types)window.__dragProbe.data.push(d.getData(k));}},true);}" +
      '</script>'
    : '';
```

  and include `dragProbe +` in the returned body next to `loginForm +`.

- [ ] **Step 3: Shared pointer helper and steps.** Create `test/desktop/steps/tab-drag.steps.js`:

```js
'use strict';
const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { overlayPage } = require('../support/overlay');
const { openOverlaySurface } = require('../support/poll');

// Real pointer input through Playwright: down on the source, a move past the
// 4px threshold, stepped moves to the target, up. No DragEvent synthesis.
async function pointerDrag(page, sourceLocator, target) {
  const from = await sourceLocator.boundingBox();
  assert.ok(from, 'drag source has a box');
  const x = from.x + Math.min(40, from.width / 2);
  await page.mouse.move(x, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, from.y + from.height / 2 + 6);
  await page.mouse.move(target.x ?? x, target.y, { steps: 8 });
  if (target.hold) return;
  await page.mouse.up();
}

async function surfacePage(world, surface) {
  if (surface === 'rail') {
    await world.call('setTabLayout', 'vertical');
    const pages = world.app.windows();
    const page = pages.find((p) => p.url() === 'blanc-chrome://index/');
    await page.locator('#verticalTabsRail:not([hidden])').waitFor();
    return { page, list: page.locator('#verticalTabsList') };
  }
  await openOverlaySurface(world, 'openPanel', 'panel');
  const page = await overlayPage();
  return { page, list: page.locator('#islandList') };
}

const rowFor = (list, id) => list.locator(`[data-drag-tab][data-tab-id="${id}"]`);
const headerFor = (list, groupId) => list.locator(`[data-drag-header][data-group-id="${groupId}"]`);
async function topOf(locator) { const b = await locator.boundingBox(); return b.y + 2; }
async function middleOf(locator) { const b = await locator.boundingBox(); return b.y + b.height / 2; }

async function groupIdByName(world, name) {
  const state = await world.state();
  return state.groups.find((g) => g.name === name)?.id;
}
async function tabsOf(world, groupName) {
  const state = await world.state();
  const gid = groupName ? await groupIdByName(world, groupName) : null;
  return state.tabOrder.map((id) => state.tabs.find((t) => t.id === id))
    .filter((t) => (t.groupId ?? null) === gid && !(groupName === null && t.pinned));
}
```

  Then implement every step used by `tab-drag.feature`, each one: resolve ids from `world.state()`, record `this.before = { tabOrder, groups, tabs }` (for "unchanged" steps), open the surface with `surfacePage`, and call `pointerDrag` with:
  - "before X" → `{ y: await topOf(rowFor(list, X)) }`;
  - "onto the header" → `{ y: await middleOf(headerFor(list, gid)) }`;
  - "above the header" (groups) → `{ y: await topOf(headerFor(list, gid)) - 1 }`;
  - "out over the page" → rail: `{ x: <rail right edge> + 200, y: <same y> }`; island: `{ y: <panel bottom> + 120 }` (below the panel, over page content);
  - "start dragging" → `{ y: <source y> + 40, hold: true }`, then the Escape step uses `page.keyboard.press('Escape')` and finally `page.mouse.up()`.

  After each drop, `await this.waitForState(...)` on the expected condition (use the existing `waitForState`/`waitForValue` helpers the rail steps use), never a fixed sleep. Background/Given steps use the hook (`openTab` with `this.fixtureUrl(name)`, `groupTabByName`, `toggleGroup`, `setTabPinned` if present — otherwise run `/pin` through `runSlashCommand`). Assertions:
  - "the first cluster shortcut selects the first play tab": press the platform's ⌘/Ctrl+1 via the existing shortcut helper used by `@F2` steps, then assert `state.activeTabId` is that tab.
  - "the probe page did not navigate": compare `workspacePageScript(id, 'location.href + "|" + history.length')` before and after.
  - "saw no drag, drop or paste events and no tab id": `workspacePageScript(id, 'JSON.stringify(window.__dragProbe)')` → `events` empty, and neither `data` nor `document.body.innerText` contains any tab id from `state.tabs`.
  - "the island drag flag is clear": `this.call('overlayDragging') === false`.
  - "the island panel is still open": the renderer mode is still `panel` (use the same check `openOverlaySurface` waits on).

  Front the window before each pointer drag with the same best-effort `frontChromeWindow` helper used in `vertical-tabs.steps.js` (export it from there or move it to `test/desktop/support/` and import it in both files).

- [ ] **Step 4: Rewrite the rail's synthetic drag.** In `test/desktop/steps/vertical-tabs.steps.js` replace `dragRow`'s DragEvent dispatches with a call to `pointerDrag` (import it from `tab-drag.steps.js` or move it to `test/desktop/support/pointer-drag.js` and import it in both). `dropAccepted` becomes "canonical state changed as expected" — remove the `dropAccepted` assertions and keep the order assertions. Remove the `When I drag a row across a group boundary` step and its "rejected" expectations (cross-group is now allowed and is covered by F3-7).

- [ ] **Step 5: Runnable profile.** In `test/desktop/cucumber.mjs` add `'@F3-6', '@F3-7', '@F3-8', '@F3-9', '@F3-10', '@F3-11', '@F3-12', '@F3-13', '@F3-14', '@F3-15', '@F3-16',` to `RUNNABLE` next to the existing F3 ids.

- [ ] **Step 6: Dry run, then real run**

Run: `npm run test:acceptance:dry`
Expected: every step resolves (no undefined/ambiguous steps).

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F3-6 or @F3-7 or @F3-8 or @F3-9 or @F3-10 or @F3-11 or @F3-12 or @F3-13 or @F3-14 or @F3-15 or @F3-16 or @F28-10 or @F28-11 or @F28-12"`
Expected: all PASS on both examples of each outline. Do not run other Electron suites at the same time. If a scenario fails, compare against `main` before assuming the change caused it (some local acceptance steps fail on untouched `main` on this Mac).

Positive control: temporarily make `islandMove` return `false` without calling IPC, run `@F3-7`, confirm it fails for the island example, then revert.

- [ ] **Step 7: Commit**

```bash
git add spec test/desktop
git commit -m "Cover tab and group drag on both surfaces in acceptance"
```

---

### Task 9: Full gates, packaged sanity and before/after proof

**Files:** none new.

- [ ] **Step 1: Full local gates**

Run: `npm run lint && npm run test:unit && npm run substrate:check && npm run browser-api:check && npm run test:acceptance:dry`
Expected: all PASS.

- [ ] **Step 2: Wider acceptance regression.** Run the F2, F3, F28 and island (`@F12-*`) runnable scenarios:
`npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F2 or @F3 or @F28 or @F12"`
Expected: PASS, or failures that also fail on `main` (record which).

- [ ] **Step 3: Packaged sanity.** `npm run dist:dir`, launch the unpacked app with a scratch `--user-data-dir`, and confirm a rail drag and an island drag both work (catches a missing allowlist entry or a script that only resolves in dev). Delete the scratch profile afterwards.

- [ ] **Step 4: Before/after proof.** Relaunch `npm start` and capture full-resolution crops of the resting island and the rail on `main` and on this branch with the same tabs, stacked before-over-after, plus one mid-drag capture of each surface (indicator line and header highlight visible). State where to look.

- [ ] **Step 5: Clean up.** Remove any Playwright `output/` or test artifacts created during the run.

- [ ] **Step 6: Hand-off notes.** Record in the PR description: the Win/Linux pointer-capture hand-check is pending for the next Windows VM validation (with the Glance divider check). Do not merge until the owner approves.

---

## Self-review notes

- Spec §1 rule, self-target, empty bucket, prune, collapsed untouched, boolean return, broadcast-only-on-change → Tasks 1–2. `groups:reorder` → Tasks 1–2. Cleanup of `reorderTab`/`reorderTabWithinBucket`/contract/test-hook/inventory → Task 2.
- Spec §2 controller, threshold, capture, ghost, line/header indicator, invalid gaps, group drag, auto-scroll with refresh, Escape/pointercancel/lostpointercapture, release outside, no DataTransfer → Tasks 5–6. Drop outcome (true/false/reject, timeout) → Task 5. Live re-render deferral and source-missing cancel → Tasks 5–7. Island list-mode change cancels → Task 7. Overlay drag-state sender/reset contract → Task 3 (+ renderer side Task 7). Per-surface rules → Tasks 6–7. Keyboard rule (collapsed skip, empty same-state bucket, stops, announcements, focus) → Tasks 4, 6, 7.
- Spec §3 unit list → Tasks 1, 3, 4, 5; guards → Tasks 2, 3, 6, 9; acceptance matrix incl. drag-out probe and Escape → Task 8; manual → Tasks 6, 7, 9.
- Interpretation recorded: the island has no "selected row" at rest, so island ⌥⇧↑/↓ acts on the row or header holding keyboard focus (reached with Tab). It never acts from the address input, which removes any text-selection clash. Group headers in the island become focusable buttons to support this.
