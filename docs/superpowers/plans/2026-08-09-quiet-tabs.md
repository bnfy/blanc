# Quiet Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`
> to implement this plan task-by-task, with checkpoints between phases. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discard the renderer process of a tab left untouched past a
configurable delay, and rebuild it — with scroll, form values, and back-history —
when the user returns to it.

**Architecture:** Sleep policy is a pure, Electron-free module (`tab-sleep.js`)
tested in isolation; orchestration lives in `main.js` and re-uses the `tab-view.js`
wiring extracted by the prerequisite plan, so a woken tab is wired identically to a
freshly created one. The navigation snapshot lives in a main-process-only Map, never
on the tab record, so it cannot reach IPC, disk, or tab sync. Waking runs as a
generation-scoped transaction that owns its commit point, history suppression, and a
single fallback.

**Tech Stack:** Electron 43, CommonJS main process, `node --test` unit tests,
Cucumber + Playwright acceptance via `src/main/test-hook.js`, plus three codegen
substrates (`settings-schema/`, `copy/`, `tokens/`) guarded by `npm run substrate:check`.

**Prerequisite:** `docs/superpowers/plans/2026-08-09-quiet-tabs-extraction.md` must be
merged first. This plan's tasks consume `createTabView`, `wireTabView`, `initTabView`,
`liveContents`, and the `serializeTabs` allowlist as **pre-existing**, and its edit
anchors assume the extracted file layout.

**Design:** `docs/superpowers/specs/2026-08-09-quiet-tabs-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Electron 43.3.0.** No new runtime dependencies. Typings for reference live at
  `/Users/anthony/Projects/Blanc/node_modules/electron/electron.d.ts` — `node_modules`
  is not installed inside the worktree.
- **Vocabulary split.** User-visible and assistive-technology strings say **`quiet`**.
  Internals say `asleep` / `tabSleep` / `sleepTab` / `wakeTab` / `sleepSnapshots`.
  This is the documented Favorites-vs-`bookmarks` rule in CLAUDE.md, not a preference.
- **The `/sleep` hint is locked, verbatim:**
  `Put background tabs to sleep and free their memory`
- **Never hand-edit any file under a `*/generated/` directory.** Run the substrate
  build that produces it.
- **`npm run substrate:check` must stay green.** No `tokens:build` should be needed —
  express the quiet state with existing `--border` / `--text-dim` on non-`:root`
  selectors.
- **`session.json` `version` stays `1`**, and `hasMirror` stays at five keys. Both
  are load-bearing for rollback to 1.0.x/1.1.0.
- **The snapshot never crosses IPC, never reaches disk, and never enters tab sync.**
  It lives only in the main-process `sleepSnapshots` Map.
- **The active tab is never quiet**, on any code path.
- **Spec ids are `F31` and `D23`.** `F29`/`D21` look free but `spec/README.md`
  forbids id reuse.
- **`CLAUDE.md` and `AGENTS.md` are hand-mirrored** with no automated guard — edit
  both or neither.

---

## Corrections to apply before / during execution

**Post-implementation correction (2026-08-10): non-empty `sessionStorage` is
not unsaved user work, but destroying it is data loss.** Task 207 and Task 213
below encode the original blanket rule and the `?nostore=1` escape hatch. A
real-browser check disproved that premise: routine site-owned load counters made
ordinary pages permanently ineligible, while the acceptance suite passed only
because it suppressed them. A second Electron probe then showed that closing
and recreating the WebContents loses that storage. The implemented correction
uses a retained-WebContents renderer discard for storage-bearing tabs, guarded
by an all-frame beforeunload inspection and an exclusive renderer-PID check.
The same-WebContents reload preserves the browser-process storage namespace
without copying site data into Blanc. The ordinary fixture remains part of the
Quiet Tabs acceptance path and asserts its load counter advances across wake.

Three independent audits ran over the draft of this plan. The blocking defects with
an exact fix were applied to the tasks below. These five remain, and each is called
out here because it is **invisible at write time** — the code looks right and fails
later.

**1. Task 210's nine edits, and Task 203 Edit 3c, are anchored on pre-extraction
source.** They quote `main.js` line ranges that the extraction plan either moves into
`tab-view.js` or rewrites. Do not force the quoted anchors. Re-locate each edit by
searching the *current* file for the surrounding code, after the extraction plan is
merged. This is deferred deliberately rather than guessed: after extraction the real
text exists to anchor against, where predicting it now would encode a fiction.

**2. Acceptance scenarios `@F31-1` … `@F31-9` are authored by no task.** Only
`@F31-10` (Task 213) and the `@F28-7` extension (Task 308) exist. Author each in the
phase whose behaviour it exercises, appending to `spec/acceptance/quiet-tabs.feature`:

| Scenario | Phase | What it pins down |
| --- | --- | --- |
| `@F31-1` sleep/wake identity | 2 | address, title, back-history after a wake |
| `@F31-2` active never sleeps | 2 | the invariant every path depends on |
| `@F31-3` exclusion outline | 2 | audio / pinned / muted / dirty-input / adopted / POST |
| `@F31-8` private sleep→wake | 2 | `sessionKind === 'private'` after waking |
| `@F31-5` quiet affordance | 3 | the string is "quiet"; dots are not the private treatment |
| `@F31-7` lazy restore | 4 | only the active tab holds a live webContents |
| `@F31-9` no page state escapes | 4 | session.json, sync snapshot, `tabs:updated` |
| `@F31-4` `/sleep` with panel open | 5 | rows go dim as the receipt |
| `@F31-6` settings outline | 5 | each delay value |

Plus the five scenarios design §12 singles out as *corrections invisible to unit
tests* — redirect-chain wake, setting switched to Off, unsaved control state,
oversized `pageState`, and `beforeunload` polarity. The last of these must assert the
tab is still **functional**, not merely present: an inverted `preventDefault()` passes
a naive "did it stay awake" check by accident.

Until they exist, Task 509 Step 3(d) must add **only** the tags whose scenarios were
written, and Tasks 506/508's `Acceptance:` and `SHIPPED` claims must be trimmed to
match. A grid row marked ✅ for a scenario that does not exist is a false claim in the
parity matrix.

**3. Task 411's test-hook anchors were superseded by Task 212.** Anchor on
`getSleepSnapshots,\n  } = refs;` and insert before the closing brace; anchor Step 2
on the single line `getChromeUrl: () => rt().window?.webContents.getURL() ?? '',`.
Likewise Task 407 Edit F: anchor on `windowRuntimes.attachTab(owner, id);` alone,
because Task 203 Edit 3d already inserted a line into the block it quotes.

**4. Task 409 is already satisfied by Task 209.** Task 209's `wakeTab` has the exact
three-way branch Task 409 describes, differing only in local variable names. Read it,
confirm, check the box, move on — do not re-implement.

**5. Several Step 3s bundle 5–17 edits into one "step".** Where a step lists lettered
edits (3a, 3b, …), treat each letter as its own step: apply it, re-read the
surrounding code, and only then move to the next. The step numbering is optimistic
about how much fits in one action.

---

## Phase 2: Policy and plumbing

At the end of this phase Blanc can actually discard and rebuild a tab's renderer: the pure
policy module `src/main/tab-sleep.js` decides *which* tabs may go quiet, `sleepTab`/`wakeTab`
in `main.js` perform the teardown and the wake transaction, a 30-second sweep drives them,
and a `sleepSnapshots` Map holds each quiet tab's navigation history under strict lifetime
rules. Verify with `npm run test:unit` (the new `test/unit/tab-sleep.test.js` must pass, and
nothing else may regress) and `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable
--tags @F31-10`, which proves via `app.getAppMetrics()` that quieting a tab really releases
an OS renderer process and that waking it brings one back.

## What this phase assumes Phase 1 already landed

Every task below is written against these Phase-1 artifacts. If one is missing, stop and
finish Phase 1 first — do not re-create them here.

- `src/main/tab-view.js` exporting `createTabView(tab)`, `wireTabView(tab, view, { owner, adopted })`,
  `initTabView(deps)`, `liveContents(tab)`, `TAB_WEB_PREFERENCES`, `getPrivateBrowsingSession`,
  `PRIVATE_PARTITION`.
- `main.js` calls `initTabView({...})` once at module scope, passing the no-op stubs
  `onMainFrameCommit`, `noteWakeSuppressed`, `notePopupChild` (Phase 2 fills their bodies in).
- `main.js` has `const tabIdByWebContentsId = new Map();` maintained in `createTab` and `closeTab`.
- `serializeTabs` is an explicit allowlist that includes `asleep` and excludes
  `sleeping`, `waking`, `wakeGeneration`, `lastActiveAt`, `adopted`, `openerTabId`,
  `usedMedia`, `restorableCommit`, `deepScrolled`, `httpEntryCount`.
- `src/main/test-hook.js` is sleep-aware (`state()` guards `t.view`).

Vocabulary rule that holds for the whole phase: internals say `sleep`/`asleep`; **no string a
user or screen reader ever receives contains the word "asleep"**. Phase 2 ships no user-visible
strings at all, so this is only a reminder not to add any.

---

### Task 201: `tab-sleep.js` — constants and `trimSnapshot`

**Files:**
- Create: `src/main/tab-sleep.js`
- Test: `test/unit/tab-sleep.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `TAB_SLEEP_DELAY_MS` (object), `MAX_SLEEP_SNAPSHOTS = 50`, `MAX_PAGE_STATE_BYTES = 524288`,
  `trimSnapshot(entries, index, options) -> {entries, index, droppedPageState} | null`.

This module must never `require('electron')` — that is what lets it be unit-tested with a plain
`require()`. `Buffer` is a Node global and is allowed (and required — see the byte-measurement test).

- [ ] **Step 1: Write the failing test**

Create `test/unit/tab-sleep.test.js`:

```js
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  trimSnapshot,
  TAB_SLEEP_DELAY_MS,
  MAX_SLEEP_SNAPSHOTS,
  MAX_PAGE_STATE_BYTES,
} = require('../../src/main/tab-sleep');

// The delay table is the ONLY setting-id -> milliseconds mapping in the app.
// settings.js holds the enum of ids; this holds what they mean.
test('the delay table maps every setting id, and "off" means never', () => {
  assert.deepEqual(Object.keys(TAB_SLEEP_DELAY_MS), ['off', '30m', '1h', '6h']);
  assert.equal(TAB_SLEEP_DELAY_MS.off, null);
  assert.equal(TAB_SLEEP_DELAY_MS['30m'], 1800000);
  assert.equal(TAB_SLEEP_DELAY_MS['1h'], 3600000);
  assert.equal(TAB_SLEEP_DELAY_MS['6h'], 21600000);
  assert.equal(MAX_SLEEP_SNAPSHOTS, 50);
  assert.equal(MAX_PAGE_STATE_BYTES, 512 * 1024);
});

// An empty history means the tab has nothing worth restoring. Returning a
// snapshot here would let sleepTab overwrite a good one with an empty one and
// strand the tab on a blank page after wake.
test('an empty or missing entry list produces no snapshot at all', () => {
  assert.equal(trimSnapshot([], 0), null);
  assert.equal(trimSnapshot(null, 0), null);
  assert.equal(trimSnapshot(undefined, 0), null);
});

// pageState on a BACK entry carries the verbatim POST body of a past form
// submission plus stale form values. Only the active entry may keep it.
test('non-active entries are rebuilt as exactly {url, title}', () => {
  const snap = trimSnapshot([
    { url: 'https://a/', title: 'A', pageState: 'aaa' },
    { url: 'https://b/', title: 'B', pageState: 'bbb' },
    { url: 'https://c/', title: 'C', pageState: 'ccc' },
  ], 1);
  assert.deepEqual(Object.keys(snap.entries[0]), ['url', 'title']);
  assert.deepEqual(Object.keys(snap.entries[2]), ['url', 'title']);
  assert.equal('pageState' in snap.entries[0], false, 'the key must be ABSENT, not undefined');
  assert.deepEqual(snap.entries[1], { url: 'https://b/', title: 'B', pageState: 'bbb' });
  assert.equal(snap.index, 1);
  assert.equal(snap.droppedPageState, false);
});

test('an active entry with no pageState is not reported as dropped', () => {
  const snap = trimSnapshot([{ url: 'https://a/', title: 'A' }], 0);
  assert.deepEqual(snap.entries, [{ url: 'https://a/', title: 'A' }]);
  assert.equal(snap.droppedPageState, false);
});

// The ceiling exists to bound real heap, so it is measured in UTF-8 BYTES.
// '€' is 1 JS char but 3 bytes: a String.length check would keep this.
test('the pageState ceiling is measured in UTF-8 bytes, not string length', () => {
  const snap = trimSnapshot(
    [{ url: 'https://a/', title: 'A', pageState: '€€€€' }],
    0,
    { maxPageStateBytes: 10 }
  );
  assert.equal('pageState' in snap.entries[0], false);
  assert.equal(snap.droppedPageState, true);
});

// Oversized still returns a snapshot: the tab is quieted anyway and wake goes
// through navigationHistory.restore() with pageState-free entries, preserving
// the back stack. Returning null here would degrade wake to loadURL().
test('an oversized pageState is dropped but the snapshot survives', () => {
  const snap = trimSnapshot([
    { url: 'https://a/', title: 'A' },
    { url: 'https://b/', title: 'B', pageState: 'x'.repeat(600 * 1024) },
  ], 1);
  assert.notEqual(snap, null);
  assert.equal(snap.entries.length, 2);
  assert.equal(snap.index, 1);
  assert.equal('pageState' in snap.entries[1], false);
  assert.equal(snap.droppedPageState, true);
});

test('a private tab keeps no pageState on any entry', () => {
  const snap = trimSnapshot([
    { url: 'https://a/', title: 'A', pageState: 'aaa' },
    { url: 'https://b/', title: 'B', pageState: 'bbb' },
  ], 1, { private: true });
  assert.equal('pageState' in snap.entries[0], false);
  assert.equal('pageState' in snap.entries[1], false);
  assert.equal(snap.droppedPageState, true);
  assert.equal(snap.index, 1);
});

test('the index is clamped into range, and a non-integer index clamps to 0', () => {
  const entries = [
    { url: 'https://a/', title: 'A', pageState: 'aaa' },
    { url: 'https://b/', title: 'B', pageState: 'bbb' },
  ];
  assert.equal(trimSnapshot(entries, 9).index, 1);
  assert.equal(trimSnapshot(entries, -4).index, 0);
  assert.equal(trimSnapshot(entries, 1.5).index, 0);
  assert.equal(trimSnapshot(entries, undefined).index, 0);
  // and the clamped index is the entry that keeps its pageState
  assert.equal(trimSnapshot(entries, 9).entries[1].pageState, 'bbb');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && node --test test/unit/tab-sleep.test.js`

Expected: FAIL — every test errors with `Cannot find module '../../src/main/tab-sleep'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/main/tab-sleep.js`:

```js
// Pure Quiet Tabs policy: which tabs may lose their renderer, and what of a
// tab's navigation history is worth retaining while it has none. No electron
// import — this file must stay requireable from `node --test` (precedent:
// session-snapshot.js, tabsync-model.js). The clock is injected, never read.
// See docs/superpowers/specs/2026-08-09-quiet-tabs-design.md §4.2, §6.

/** Delay-setting id -> idle threshold in ms. `off` => null (never auto-quiet).
 *  This is the ONLY setting-id -> milliseconds mapping in the app; settings.js
 *  owns the enum of ids and nothing else. */
const TAB_SLEEP_DELAY_MS = {
  off: null,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
};

/** Hard ceiling on retained snapshots. Refuse the 51st; never evict — eviction
 *  would silently downgrade an already-quiet tab's recovery data with no
 *  signal to the user (spec §6). */
const MAX_SLEEP_SNAPSHOTS = 50;

/** Ceiling on a retained entry's pageState, in UTF-8 BYTES (spec §6). */
const MAX_PAGE_STATE_BYTES = 512 * 1024;

/**
 * Shape a navigationHistory snapshot for retention.
 *
 * @param {Array<{url:string,title:string,pageState?:string}>} entries getAllEntries() result
 * @param {number} index navigationHistory.getActiveIndex()
 * @param {object} [options]
 * @param {boolean} [options.private=false] private tab => NO pageState on any entry
 * @param {number} [options.maxPageStateBytes=MAX_PAGE_STATE_BYTES]
 * @returns {{entries: Array<{url:string,title:string,pageState?:string}>,
 *            index: number, droppedPageState: boolean} | null}
 */
function trimSnapshot(entries, index, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const { private: isPrivate = false, maxPageStateBytes = MAX_PAGE_STATE_BYTES } = options;
  const activeIndex = Number.isInteger(index)
    ? Math.max(0, Math.min(entries.length - 1, index))
    : 0;
  let droppedPageState = false;
  const out = entries.map((entry, i) => {
    const url = entry?.url ?? '';
    const title = entry?.title ?? '';
    // Back entries carry the verbatim POST body of past submissions and stale
    // form values; only the active entry may keep page state at all.
    if (i !== activeIndex) return { url, title };
    const pageState = entry?.pageState;
    if (typeof pageState !== 'string' || pageState === '') return { url, title };
    // Buffer.byteLength on the base64 string — String.length differs, and the
    // ceiling exists to bound real heap.
    if (isPrivate || Buffer.byteLength(pageState, 'utf8') > maxPageStateBytes) {
      droppedPageState = true;
      return { url, title };
    }
    return { url, title, pageState };
  });
  return { entries: out, index: activeIndex, droppedPageState };
}

module.exports = {
  trimSnapshot,
  TAB_SLEEP_DELAY_MS,
  MAX_SLEEP_SNAPSHOTS,
  MAX_PAGE_STATE_BYTES,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && node --test test/unit/tab-sleep.test.js`

Expected: PASS — 8 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/tab-sleep.js test/unit/tab-sleep.test.js
git commit -m "Quiet Tabs: pure snapshot shaping (trimSnapshot) and the delay table"
```

---

### Task 202: `sleepCandidates` — the eligibility predicate

**Files:**
- Modify: `src/main/tab-sleep.js` (add one function, extend `module.exports`)
- Test: `test/unit/tab-sleep.test.js` (append)

**Interfaces:**
- Consumes: `MAX_SLEEP_SNAPSHOTS` from Task 201.
- Produces: `sleepCandidates(tabList, options) -> string[]`.

The options shape is fixed and must not be changed:
`{ now, thresholdMs, activeTabId, ignoreThreshold?, snapshotCount?, maxSnapshots?,
permissionPendingTabIds?, popupChildCounts? }`.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/tab-sleep.test.js`:

```js
const { sleepCandidates, MAX_SLEEP_SNAPSHOTS: CEILING } = require('../../src/main/tab-sleep');

const NOW = 10_000_000;
const THRESHOLD = 1000;

/** A tab record that passes every exclusion. Each test spoils exactly one thing. */
const tab = (over = {}) => ({
  id: 'a',
  asleep: false, sleeping: false, waking: false, isLoading: false,
  audible: false, muted: false, usedMedia: false,
  pinned: false, adopted: false, openerTabId: null,
  restorableCommit: true, deepScrolled: false, httpEntryCount: 1,
  lastActiveAt: NOW - THRESHOLD, url: 'https://a/',
  ...over,
});

const run = (list, opts = {}) => sleepCandidates(list, {
  now: NOW, thresholdMs: THRESHOLD, activeTabId: null, ...opts,
});

test('a plain idle background tab is a candidate', () => {
  assert.deepEqual(run([tab()]), ['a']);
});

test('no tabs, or no threshold, means no candidates and no other work', () => {
  assert.deepEqual(run([]), []);
  assert.deepEqual(run(null), []);
  assert.deepEqual(run([tab()], { thresholdMs: null }), []);
});

// "off" only stops WAITING; /sleep must still work with the setting off.
test('ignoreThreshold quiets eligible tabs even when the delay is off', () => {
  assert.deepEqual(run([tab()], { thresholdMs: null, ignoreThreshold: true }), ['a']);
});

test('the active tab is never a candidate', () => {
  assert.deepEqual(run([tab()], { activeTabId: 'a' }), []);
  assert.deepEqual(run([tab()], { activeTabId: 'a', ignoreThreshold: true }), []);
});

// Each of these is a documented safety exclusion (spec §4.2). A regression in
// any one of them loses user work or breaks an OAuth/media flow.
for (const [field, value] of [
  ['asleep', true], ['sleeping', true], ['waking', true], ['isLoading', true],
  ['audible', true], ['muted', true], ['usedMedia', true],
  ['pinned', true], ['adopted', true], ['deepScrolled', true],
  ['restorableCommit', false], ['httpEntryCount', 0],
]) {
  test(`a tab with ${field} = ${value} is excluded`, () => {
    assert.deepEqual(run([tab({ [field]: value })]), []);
    // and /sleep does not override a safety exclusion, only the wait
    assert.deepEqual(run([tab({ [field]: value })], { ignoreThreshold: true }), []);
  });
}

// restorableCommit is deliberately NOT historyEligible, which is false for
// every private tab. This is the direct regression test for that conflation.
test('a private tab with an ordinary GET commit IS a candidate', () => {
  assert.deepEqual(run([tab({ private: true, historyEligible: false })]), ['a']);
});

test('a tab with a pending permission prompt is excluded', () => {
  assert.deepEqual(run([tab()], { permissionPendingTabIds: new Set(['a']) }), []);
});

// The 'new-window' disposition returns allow with no createWindow, so these
// popups never enter the tabs Map — a family check over tabs alone is blind
// to them, and quieting the opener mid-OAuth severs the callback.
test('a tab with a live popup child window is excluded', () => {
  assert.deepEqual(run([tab()], { popupChildCounts: new Map([['a', 1]]) }), []);
  assert.deepEqual(run([tab()], { popupChildCounts: new Map([['a', 0]]) }), ['a']);
});

test('a tab with a live opener, or a live child, in the list is excluded', () => {
  const parent = tab({ id: 'p' });
  const child = tab({ id: 'c', openerTabId: 'p' });
  assert.deepEqual(run([parent, child]), []);
});

test('an openerTabId pointing at a tab that is gone does not exclude', () => {
  assert.deepEqual(run([tab({ id: 'c', openerTabId: 'closed-long-ago' })]), ['c']);
});

// Never epoch 0: an unstamped tab is "not yet idle", or the first sweep after
// launch would quiet everything at once.
test('a missing or NaN lastActiveAt counts as not yet idle', () => {
  for (const v of [undefined, null, NaN, 'soon']) {
    assert.deepEqual(run([tab({ lastActiveAt: v })]), [], String(v));
  }
  // but /sleep skips the idle test entirely, so it still picks them up
  assert.deepEqual(run([tab({ lastActiveAt: NaN })], { ignoreThreshold: true }), ['a']);
});

test('the idle threshold is inclusive at the boundary', () => {
  assert.deepEqual(run([tab({ lastActiveAt: NOW - THRESHOLD })]), ['a']);
  assert.deepEqual(run([tab({ lastActiveAt: NOW - THRESHOLD + 1 })]), []);
});

test('candidates come back longest-idle first, ties in list order', () => {
  const list = [
    tab({ id: 'recent', lastActiveAt: NOW - THRESHOLD }),
    tab({ id: 'oldest', lastActiveAt: NOW - 9 * THRESHOLD }),
    tab({ id: 'tie-b', lastActiveAt: NOW - 5 * THRESHOLD }),
    tab({ id: 'tie-a', lastActiveAt: NOW - 5 * THRESHOLD }),
  ];
  assert.deepEqual(run(list), ['oldest', 'tie-b', 'tie-a', 'recent']);
});

// Refuse the 51st rather than evict an existing snapshot.
test('the snapshot ceiling stops quieting instead of evicting', () => {
  const list = [tab({ id: 'x' }), tab({ id: 'y' })];
  assert.deepEqual(run(list, { snapshotCount: CEILING }), []);
  assert.deepEqual(run(list, { snapshotCount: CEILING + 5 }), []);
  assert.deepEqual(run(list, { snapshotCount: CEILING - 1 }), ['x']);
  assert.deepEqual(run(list, { snapshotCount: 0, maxSnapshots: 1 }), ['x']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && node --test test/unit/tab-sleep.test.js`

Expected: FAIL — `TypeError: sleepCandidates is not a function` on every new test.

- [ ] **Step 3: Write minimal implementation**

In `src/main/tab-sleep.js`, insert this function immediately **above** `function trimSnapshot`:

```js
const NO_IDS = new Set();
const NO_COUNTS = new Map();

/**
 * Which tabs may lose their renderer right now, longest-idle first.
 *
 * Reads ONLY these record fields — never a webContents: id, asleep, sleeping,
 * waking, isLoading, audible, muted, pinned, usedMedia, adopted, openerTabId,
 * restorableCommit, deepScrolled, httpEntryCount, lastActiveAt.
 *
 * @param {Array<object>} tabList tab records in tabOrder order
 * @param {object} options
 * @param {number} options.now Date.now(), injected
 * @param {number|null} options.thresholdMs idle threshold; null => [] unless ignoreThreshold
 * @param {string|null} options.activeTabId never a candidate
 * @param {boolean} [options.ignoreThreshold=false] `/sleep`: skip the idle test ONLY
 * @param {number} [options.snapshotCount=0] sleepSnapshots.size at call time
 * @param {number} [options.maxSnapshots=MAX_SLEEP_SNAPSHOTS]
 * @param {Set<string>} [options.permissionPendingTabIds]
 * @param {Map<string, number>} [options.popupChildCounts] openerTabId -> live popup count
 * @returns {string[]}
 */
function sleepCandidates(tabList, options) {
  const {
    now,
    thresholdMs,
    activeTabId = null,
    ignoreThreshold = false,
    snapshotCount = 0,
    maxSnapshots = MAX_SLEEP_SNAPSHOTS,
    permissionPendingTabIds = NO_IDS,
    popupChildCounts = NO_COUNTS,
  } = options ?? {};

  if (thresholdMs === null && ignoreThreshold !== true) return [];
  if (!Array.isArray(tabList) || tabList.length === 0) return [];
  // Refuse, never evict: a full Map means we stop quieting new tabs.
  const room = maxSnapshots - snapshotCount;
  if (room <= 0) return [];

  const liveIds = new Set();
  const liveOpenerIds = new Set();
  for (const t of tabList) {
    if (!t || !t.id) continue;
    liveIds.add(t.id);
    if (t.openerTabId) liveOpenerIds.add(t.openerTabId);
  }

  const survivors = [];
  tabList.forEach((t, index) => {
    if (!t || !t.id) return;
    if (t.id === activeTabId) return;
    if (t.asleep || t.sleeping || t.waking || t.isLoading) return;
    // audible is isCurrentlyAudible(), so a paused video passes it; usedMedia
    // means "this document has played media", and muted is a user gesture in
    // the same class as pinned. pageState carries no media currentTime.
    if (t.audible || t.muted || t.usedMedia) return;
    if (t.pinned) return;
    // Rebuilding an adopted window.open child from a URL severs window.opener
    // permanently, and an about:blank + document.write child has no URL at all.
    if (t.adopted) return;
    // A POST result would silently re-submit or fail into blanc://error/.
    if (t.restorableCommit !== true) return;
    if (permissionPendingTabIds.has(t.id)) return;
    if ((popupChildCounts.get(t.id) ?? 0) !== 0) return;
    if (t.openerTabId && liveIds.has(t.openerTabId)) return; // live opener
    if (liveOpenerIds.has(t.id)) return;                     // live child
    if (t.deepScrolled) return;
    if (!(t.httpEntryCount >= 1)) return;
    if (ignoreThreshold !== true) {
      // Never epoch 0: unstamped means "not yet idle".
      if (!Number.isFinite(t.lastActiveAt)) return;
      if (!(now - t.lastActiveAt >= thresholdMs)) return;
    }
    survivors.push({ id: t.id, index, at: Number.isFinite(t.lastActiveAt) ? t.lastActiveAt : Infinity });
  });

  survivors.sort((a, b) => (a.at !== b.at ? a.at - b.at : a.index - b.index));
  return survivors.slice(0, room).map((s) => s.id);
}
```

Then change the exports block at the bottom of the file to:

```js
module.exports = {
  sleepCandidates,
  trimSnapshot,
  TAB_SLEEP_DELAY_MS,
  MAX_SLEEP_SNAPSHOTS,
  MAX_PAGE_STATE_BYTES,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && node --test test/unit/tab-sleep.test.js`

Expected: PASS — all tests pass (the `for` loop generates 12 exclusion tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/tab-sleep.js test/unit/tab-sleep.test.js
git commit -m "Quiet Tabs: sleepCandidates eligibility policy"
```

---

### Task 203: Tab-record sleep fields and `lastActiveAt` stamping

**Files:**
- Modify: `src/main/main.js` (the tab record literal in `createTab`; `setActiveTab`'s deactivation branch)
- Test: existing suite (`npm run test:unit`)

**Interfaces:**
- Consumes: nothing.
- Produces: on every tab record — `asleep`, `sleeping`, `waking`, `wakeGeneration`, `lastActiveAt`,
  `adopted`, `openerTabId`, `usedMedia`, `restorableCommit`, `deepScrolled`, `httpEntryCount`;
  plus `createTab`'s new `openerTabId` option.

`lastActiveAt` measures time since the tab was last **visible**, not since it was created or
navigated. Stamping it only at creation would quiet a tab the user spent three hours in, seconds
after they switched away.

- [ ] **Step 1: Check what Phase 1 already added**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && grep -n "restorableCommit\|wakeGeneration\|lastActiveAt" src/main/main.js`

If the grep prints the field declarations inside `createTab`'s tab-record literal, Phase 1 added
them: skip Step 3's first edit and go straight to Step 3's second and third edits. If it prints
nothing, apply all three edits.

- [ ] **Step 2: Confirm the suite is green before you start**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit`

Expected: PASS (this is the baseline — this task is a pure state addition and must not change it).

- [ ] **Step 3: Write minimal implementation**

**Edit 3a** — in `src/main/main.js`, inside `createTab`'s tab-record object literal, find:

```js
    // SPIKE (1Password fill feasibility) — bumped on any main-frame navigation
    // start/commit so the async fill can detect a page swap mid-flow.
    navEpoch: 0,
  };
```

and replace with:

```js
    // SPIKE (1Password fill feasibility) — bumped on any main-frame navigation
    // start/commit so the async fill can detect a page swap mid-flow.
    navEpoch: 0,
    // --- Quiet Tabs (spec §3). None of these are serialized except `asleep`;
    // serializeTabs is an explicit allowlist precisely so they cannot leak. ---
    asleep: false,            // renderer discarded; tab.view is null
    sleeping: false,          // teardown in progress
    waking: false,            // a wake generation is open
    wakeGeneration: 0,        // monotonic, never reset
    lastActiveAt: null,       // ms epoch; null until first stamp
    adopted,                  // an adopted window.open child is never quietable
    openerTabId,              // family-awareness for sleepCandidates
    usedMedia: false,         // 'media-started-playing'; cleared ONLY on main-frame nav
    // Fail-safe false: a tab with no committed main frame is not quietable.
    // Deliberately NOT historyEligible, which is false for every private tab.
    restorableCommit: false,
    deepScrolled: false,      // probe result: scrollY > 3 * innerHeight
    httpEntryCount: 0,        // http(s) entries in navigationHistory
  };
```

**Edit 3b** — in the same file, find `createTab`'s signature line:

```js
function createTab(url = newTabUrl(), { private: isPrivate = false, groupId = null, view = null, pinned = false, muted = false, restoreHistory = null } = {}) {
```

and replace with:

```js
function createTab(url = newTabUrl(), { private: isPrivate = false, groupId = null, view = null, pinned = false, muted = false, restoreHistory = null, openerTabId = null } = {}) {
```

**Edit 3c** — stamp `lastActiveAt` when a tab leaves the foreground. In `setActiveTab`, find:

```js
  if (prev) {
    rt().window.contentView.removeChildView(prev.view);
```

and replace with:

```js
  if (prev) {
    // Quiet Tabs: the tab is leaving the foreground — this is the ONLY moment
    // that defines "idle since" (spec §4.3). Stamped before the detach so a
    // throw below cannot leave it unstamped.
    prev.lastActiveAt = Date.now();
    rt().window.contentView.removeChildView(prev.view);
```

**Edit 3d** — stamp a tab born in the background (no `setActiveTab` follows it). In `createTab`,
find the line that pushes the id into the tab order:

```js
  tabs.set(id, tab);
  rt().tabOrder.push(id);
```

and replace with:

```js
  tabs.set(id, tab);
  // A background-created tab (cmd-click, session restore, window.open child)
  // never passes through setActiveTab, so it would otherwise never be stamped.
  // A foreground creation overwrites this the moment it is deactivated.
  tab.lastActiveAt = Date.now();
  rt().tabOrder.push(id);
```

- [ ] **Step 4: Run the suite to verify nothing regressed**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit && node -e "require('/Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a/src/main/main.js')" 2>&1 | head -3`

Expected: `npm run test:unit` PASSes. The `node -e` line will print an Electron-related error
(main.js is not loadable outside Electron) — that is expected and fine; what you are checking is
that it is **not** a `SyntaxError`.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/main.js
git commit -m "Quiet Tabs: sleep fields on the tab record and lastActiveAt stamping"
```

---

### Task 204: Commit-time eligibility signals (`restorableCommit`, `usedMedia`, `httpEntryCount`)

**Files:**
- Modify: `src/main/main.js` (the `onMainFrameCommit` stub; the `onBeforeSendHeaders` block)
- Modify: `src/main/tab-view.js` (add a `media-started-playing` listener inside `wireTabView`)
- Test: existing suite (`npm run test:unit`)

**Interfaces:**
- Consumes: `tabIdByWebContentsId` (Phase 1), `liveContents` (Phase 1), the record fields from Task 203.
- Produces: a working `onMainFrameCommit(tab, { url, httpResponseCode })`; the module-level
  `lastMainFrameMethod` Map.

`restorableCommit` is `method === 'GET' && (httpResponseCode ?? 200) < 400`. The method is only
observable in `onBeforeSendHeaders`, and Electron allows exactly **one** listener per
`webRequest` event per session — so this composes inside the existing Client Hints handler
rather than registering a second one.

- [ ] **Step 1: Confirm the baseline**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit`

Expected: PASS. (This task has no unit test of its own — the behaviour lives inside Electron
webRequest callbacks that no unit harness can reach. It is covered by Task 213's acceptance
scenario, which cannot quiet anything unless `restorableCommit` and `httpEntryCount` are being
maintained.)

- [ ] **Step 2: Prove the stub is inert first**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && grep -n "onMainFrameCommit" src/main/main.js src/main/tab-view.js`

Expected: `main.js` shows a no-op stub (Phase 1) and `tab-view.js` shows the call site inside its
`did-navigate` handler. If `tab-view.js` has no call site, add one: inside `wireTabView`'s
`did-navigate` handler, immediately after the existing `tab.historyEligible = ...` assignment, add
`onMainFrameCommit(tab, { url, httpResponseCode });`.

- [ ] **Step 3: Write minimal implementation**

**Edit 3a** — in `src/main/main.js`, next to the `const tabIdByWebContentsId = new Map();`
declaration Phase 1 added, add:

```js
/** webContents id -> the HTTP method of its last main-frame REQUEST. The only
 *  place a method is observable is onBeforeSendHeaders, and it is needed at
 *  did-navigate time. Deliberately not on the tab record: the record is an
 *  explicit serialization allowlist and this is pure main-process bookkeeping. */
const lastMainFrameMethod = new Map(); // Map<number, string>
```

**Edit 3b** — replace the `onMainFrameCommit` no-op stub in `main.js` with the real body. Find the
stub (Phase 1 left it near the `initTabView({...})` call) and replace it with:

```js
/**
 * Quiet Tabs: refresh every eligibility signal that a main-frame commit
 * invalidates (spec §4.2). Called from tab-view.js's did-navigate handler.
 */
function onMainFrameCommit(tab, { url, httpResponseCode }) {
  // "This document has played media" — cleared ONLY here, deliberately not on
  // media-paused: clearing on pause would leave unprotected exactly the paused
  // video this rule exists to protect.
  tab.usedMedia = false;
  // The scroll depth belongs to the document that just went away.
  tab.deepScrolled = false;
  const wc = liveContents(tab);
  const isHttp = /^https?:/i.test(url ?? '');
  // Non-http(s) commits (blanc://, file:) never reach onBeforeSendHeaders, so
  // there is no observed method for them; they are GETs by construction. An
  // http(s) commit with NO observed method fails safe to un-quietable.
  const method = wc ? lastMainFrameMethod.get(wc.id) : undefined;
  const effectiveMethod = method ?? (isHttp ? null : 'GET');
  tab.restorableCommit = effectiveMethod === 'GET' && (httpResponseCode ?? 200) < 400;
  try {
    tab.httpEntryCount = wc
      ? wc.navigationHistory.getAllEntries().filter((e) => /^https?:/i.test(e?.url ?? '')).length
      : 0;
  } catch {
    tab.httpEntryCount = 0;
  }
}
```

**Edit 3c** — record the method. In `main.js`'s Client Hints `onBeforeSendHeaders` registration,
find:

```js
      browsingSession.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
        const h = details.requestHeaders;
```

and replace with:

```js
      browsingSession.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
        // Quiet Tabs composes here rather than registering a second listener —
        // Electron allows exactly one per webRequest event per session. A POST
        // result is not safely refetchable, so its method must reach
        // onMainFrameCommit (spec §4.2).
        if (details.resourceType === 'mainFrame' && Number.isInteger(details.webContentsId)) {
          lastMainFrameMethod.set(details.webContentsId, details.method);
        }
        const h = details.requestHeaders;
```

**Edit 3d** — forget the method when the webContents dies. In `main.js`'s `closeTab`, find:

```js
  const wc = tab.view?.webContents;
  if (wc && !wc.isDestroyed()) wc.close();
```

and replace with:

```js
  const wc = tab.view?.webContents;
  if (wc) lastMainFrameMethod.delete(wc.id);
  if (wc && !wc.isDestroyed()) wc.close();
```

**Edit 3e** — track media. In `src/main/tab-view.js`, inside `wireTabView`, immediately after the
existing `wc.on('audio-state-changed', ...)` registration, add:

```js
  // Quiet Tabs: "this document has played media" (spec §4.2). pageState carries
  // no media currentTime, so waking a media tab lands at 0:00 — never quiet one.
  // Cleared only by onMainFrameCommit, never on pause.
  wc.on('media-started-playing', boundToTab(() => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    tab.usedMedia = true;
  }));
```

(`boundToTab` is the local binder `wireTabView` already defines for every other listener; use
whatever name it carries in the file.)

- [ ] **Step 4: Run the suite and start the app**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit`

Expected: PASS.

Then run `npm start`, load any https page, and confirm the app behaves normally (no crash, pages
load). Quit it.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/main.js src/main/tab-view.js
git commit -m "Quiet Tabs: maintain restorableCommit, usedMedia and httpEntryCount"
```

---

### Task 205: Family signals — `openerTabId`, `popupChildCounts`, permission-prompt ownership

**Files:**
- Modify: `src/main/main.js` (the `notePopupChild` stub; `flushPermissionPrompts`; the permission
  prompter; the `permissions:respond` handler)
- Modify: `src/main/tab-view.js` (the `createWindow` branch; the `did-create-window` branch)
- Test: existing suite (`npm run test:unit`)

**Interfaces:**
- Consumes: `createTab`'s `openerTabId` option (Task 203).
- Produces: `const popupChildCounts = new Map();` in main.js; a working `notePopupChild(openerTabId, childWindow)`;
  `runtime.permissionPrompts` values become `{ resolve, tabId }`.

Both window-open paths set `outlivesOpener: true`, and a discarded opener leaves the child's
`window.opener` unusable — waking does not repair it, because it is a different object.

- [ ] **Step 1: Confirm the baseline**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit && npm run test:acceptance:dry`

Expected: both PASS. Permission prompting is covered by the existing acceptance suite
(`@F16-*`), so the dry run plus a later full run is the regression net for the
`{ resolve, tabId }` change.

- [ ] **Step 2: Prove the stub is inert**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && grep -n "notePopupChild\|permissionPrompts" src/main/main.js src/main/tab-view.js`

Expected: `notePopupChild` is a no-op in main.js and is called from `tab-view.js`'s
`did-create-window` handler; `permissionPrompts` values are bare `resolve` functions in three
places (`flushPermissionPrompts`, the prompter, `permissions:respond`).

- [ ] **Step 3: Write minimal implementation**

**Edit 3a** — in `src/main/main.js`, next to `const tabIdByWebContentsId = new Map();`, add:

```js
/** openerTabId -> number of live popup BrowserWindows it spawned that are NOT
 *  tabs. The `disposition === 'new-window'` branch returns allow with no
 *  createWindow, so those windows never enter `tabs` — a family check over
 *  `tabs` alone is blind to them, and that branch is the OAuth/SSO popup path.
 *  Quieting an opener mid-OAuth would sever the callback (spec §4.2). */
const popupChildCounts = new Map(); // Map<string, number>
```

**Edit 3b** — replace the `notePopupChild` no-op stub in `main.js` with:

```js
/** Quiet Tabs: count a real popup child window against its opener tab, and
 *  uncount it when the popup dies. Called from tab-view.js's did-create-window
 *  handler on the !isManagedTab branch. */
function notePopupChild(openerTabId, childWindow) {
  if (!openerTabId || !childWindow) return;
  popupChildCounts.set(openerTabId, (popupChildCounts.get(openerTabId) ?? 0) + 1);
  childWindow.webContents.once('destroyed', bindWindowRuntime(primaryRuntime, () => {
    const next = (popupChildCounts.get(openerTabId) ?? 1) - 1;
    // Never leave a 0 entry behind — the read is `(get(id) ?? 0) === 0`.
    if (next <= 0) popupChildCounts.delete(openerTabId);
    else popupChildCounts.set(openerTabId, next);
  }));
}
```

**Edit 3c** — delete an opener's entry when it closes. In `main.js`'s `closeTab`, find:

```js
  tabs.delete(id);
  windowRuntimes.detachTab(id);
```

and replace with:

```js
  tabs.delete(id);
  popupChildCounts.delete(id);
  windowRuntimes.detachTab(id);
```

**Edit 3d** — in `src/main/tab-view.js`'s `createWindow` callback, find the `createTab` call:

```js
          const newId = createTab(targetUrl, { private: tab.private, groupId: tab.groupId, view });
```

and replace with:

```js
          // Quiet Tabs: record the family link. A discarded opener leaves this
          // child's window.opener permanently unusable (spec §4.2).
          const newId = createTab(targetUrl, {
            private: tab.private, groupId: tab.groupId, view, openerTabId: tab.id,
          });
```

**Edit 3e** — in `src/main/tab-view.js`'s `did-create-window` handler, inside the `if (!isManagedTab)`
branch, add the `notePopupChild` call right after `applyWindowOpenPolicy(childWindow.webContents);`:

```js
        notePopupChild(tab.id, childWindow);
```

(If Phase 1 already placed this call, leave it.)

**Edit 3f** — associate a permission prompt with its tab. In `main.js`, find:

```js
      const promptId = ++permissionPromptCounter;
      owner.permissionPrompts.set(promptId, resolve);
```

and replace with:

```js
      const promptId = ++permissionPromptCounter;
      // Quiet Tabs: the tab id rides along so the sweep can exclude a tab with
      // a prompt open. Answering a quiet tab's prompt would call back into a
      // destroyed frame AND persist a decision for an origin the user can no
      // longer see (spec §4.2).
      owner.permissionPrompts.set(promptId, { resolve, tabId: tab?.id ?? null });
```

**Edit 3g** — update the two readers. Find:

```js
  chromeOn('permissions:respond', (_e, { id, allow }) => {
    const sender = rt(); // the sender's runtime, established by chromeOn
    const resolve = sender.permissionPrompts.get(id);
    if (!resolve) return; // wrong window's chrome, or a stale prompt — ignore
    sender.permissionPrompts.delete(id);
    resolve(!!allow);
  });
```

and replace with:

```js
  chromeOn('permissions:respond', (_e, { id, allow }) => {
    const sender = rt(); // the sender's runtime, established by chromeOn
    const pending = sender.permissionPrompts.get(id);
    if (!pending) return; // wrong window's chrome, or a stale prompt — ignore
    sender.permissionPrompts.delete(id);
    pending.resolve(!!allow);
  });
```

Then find:

```js
function flushPermissionPrompts(runtime) {
  for (const resolve of runtime.permissionPrompts.values()) resolve(null); // null = never answered
  runtime.permissionPrompts.clear();
}
```

and replace with:

```js
function flushPermissionPrompts(runtime) {
  // Values are { resolve, tabId } — the tab id is what lets the sleep sweep
  // exclude a tab with a prompt open (spec §4.2).
  for (const { resolve } of runtime.permissionPrompts.values()) resolve(null); // null = never answered
  runtime.permissionPrompts.clear();
}
```

Finally run `grep -n "permissionPrompts" src/main/*.js` and confirm there is no **fourth** reader
that still treats a value as a function. If there is, update it the same way.

- [ ] **Step 4: Run the suite and the permission scenarios**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F16-2 or @F16-3 or @F16-4"`

Expected: unit PASS; the three permission scenarios PASS (prefix the cucumber command with
`xvfb-run -a` on headless Linux).

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/main.js src/main/tab-view.js
git commit -m "Quiet Tabs: opener families, popup child counts, prompt-to-tab association"
```

---

### Task 206: The `sleepSnapshots` Map and its four lifetime deletions

**Files:**
- Modify: `src/main/main.js`
- Test: existing suite (`npm run test:unit`)

**Interfaces:**
- Consumes: nothing.
- Produces: `const sleepSnapshots = new Map();` and the `SleepSnapshot` typedef; deletions in
  `closeTab`, the window `closed` handler, and `app.on('before-quit')`.

The snapshot lives outside the tab record on purpose: `serializeTabs` broadcasts the record ~10
times a second, so anything on it ships to both renderers for free. This Map holds POST bodies and
form values in the main heap — it is the process-boundary trade the spec records, and no
`crashReporter.start()` may be introduced while it exists.

Only three of the four deletion points land here. The fourth — a wake generation's commit — is
part of `wakeTab` (Task 210).

- [ ] **Step 1: Confirm the baseline**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit`

Expected: PASS. (No new unit test: an empty Map's deletions are only observable once something
fills it, which Task 209 does; the acceptance scenario in Task 213 is the real net.)

- [ ] **Step 2: Confirm there is no auxiliary-map hook in closeTab yet**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && sed -n '/^function closeTab/,/^}/p' src/main/main.js | head -12`

Expected: `closeTab` starts with `const tab = tabs.get(id); if (!tab) return;` and the
recently-closed-URL bookkeeping — no auxiliary-map cleanup. That is why the deletion goes in as
the **first statement**: an early `return` below it must not strand a snapshot.

- [ ] **Step 3: Write minimal implementation**

**Edit 3a** — declare the Map. In `src/main/main.js`, immediately below the `const tabs = new Map();`
declaration, add:

```js
/**
 * @typedef {object} SleepSnapshot
 * @property {import('electron').WebContentsView|null} view
 *   The discarded view, held ONLY between wc.close() and the observed
 *   'destroyed' — dropping the reference reclaims nothing, destruction must be
 *   OBSERVED (spec §1). Nulled inside the destroyed observer. Never assigned
 *   back onto the tab record.
 * @property {Array<{url:string,title:string,pageState?:string}>} entries
 * @property {number} index
 * @property {boolean} droppedPageState  pageState was oversized or private
 */

/** MAIN-PROCESS ONLY. Never on the tab record (serializeTabs would broadcast
 *  it ~10x/s), never serialized, never persisted. Holds form values and POST
 *  bodies — no crashReporter.start() may be introduced while this exists
 *  without scrubbing it (spec §6.1). */
const sleepSnapshots = new Map(); // Map<string /* tab.id */, SleepSnapshot>
```

**Edit 3b** — delete on close. In `closeTab`, find:

```js
function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
```

and replace with:

```js
function closeTab(id) {
  // FIRST statement: every early return below must still have released the
  // snapshot, and this function has no other auxiliary-map hook (spec §6.1).
  sleepSnapshots.delete(id);
  const tab = tabs.get(id);
  if (!tab) return;
```

**Edit 3c** — delete on window close. In the `rt().window.on('closed', ...)` handler, find:

```js
    windowRuntimes.detachWindow(runtime);
```

and replace with:

```js
    windowRuntimes.detachWindow(runtime);
    // Quiet Tabs: the window's tabs are gone with it; their retained page
    // state must not outlive them in the main heap (spec §6.1).
    sleepSnapshots.clear();
```

**Edit 3d** — delete on quit. Find:

```js
app.on('before-quit', () => { isQuitting = true; });
```

and replace with:

```js
app.on('before-quit', () => {
  isQuitting = true;
  sleepSnapshots.clear(); // retained POST bodies / form values (spec §6.1)
});
```

**Edit 3e** — a comment that stops a future "cleanup". Directly under the `sleepSnapshots`
declaration from Edit 3a, add:

```js
// Deleted at exactly four points: closeTab, a wake generation's successful (or
// deliberate error-page) commit, the window 'closed' handler, and before-quit.
// Switching the tabSleep setting to Off deletes NOTHING — Off stops future
// auto-quieting; already-quiet tabs keep their snapshots and wake normally.
```

- [ ] **Step 4: Run the suite**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit && npm start`

Expected: unit PASS; the app launches, opens and closes tabs normally. Quit it.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/main.js
git commit -m "Quiet Tabs: the sleepSnapshots Map and its lifetime invariants"
```

---

### Task 207: The unsaved-input probe

**Files:**
- Modify: `src/main/main.js` (add `probeTabDirty`)
- Test: existing suite (`npm run test:unit`)

**Interfaces:**
- Consumes: `liveContents` (Phase 1).
- Produces: `async function probeTabDirty(tab, wc) -> boolean` (also sets `tab.deepScrolled`).

`executeJavaScript` on a webContents is **top-frame only**, so every cross-origin payment or SSO
iframe would be structurally invisible. The probe therefore runs over
`wc.mainFrame.framesInSubtree`, with a 250 ms budget for the whole set, and **any frame that
fails to answer counts as dirty**.

The three control-state cases matter as much as the text case: `value` is untouched by checkbox,
radio and select interaction, so a `value`-only predicate silently loses a half-filled form.

- [ ] **Step 1: Confirm the baseline**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit`

Expected: PASS. (No unit test: the probe is `webFrameMain.executeJavaScript` end to end. Its
correctness is asserted by later acceptance scenarios — including the checkbox/select case — which
belong to a later phase; it is exercised here by Task 213, which cannot quiet anything if the
probe wrongly reports dirty.)

- [ ] **Step 2: Confirm the API exists in this Electron**

Run: `cd /Users/anthony/Projects/Blanc && grep -n "framesInSubtree" node_modules/electron/electron.d.ts`

Expected: one hit, `readonly framesInSubtree: WebFrameMain[];`.

- [ ] **Step 3: Write minimal implementation**

In `src/main/main.js`, add this function immediately above where `sleepTab` will live (anywhere in
module scope after `liveContents` is in scope is fine — put it just below the `sleepSnapshots`
declaration):

```js
// Evaluated in EVERY frame of the tab. Returns true when the frame holds work
// a reload would destroy. Never keyed on interaction events — a 1Password fill
// is programmatic and fires none. Also reports scroll depth, because a deep
// scroll makes wake WORSE than page top on a virtualized feed (spec §7).
const DIRTY_PROBE_SOURCE = `(() => {
  try {
    const d = document;
    for (const el of d.querySelectorAll('input, textarea')) {
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked !== el.defaultChecked) return { dirty: true };
      } else if (el.type === 'password') {
        if (el.value) return { dirty: true };
      } else if (el.value !== el.defaultValue) {
        return { dirty: true };
      }
    }
    for (const sel of d.querySelectorAll('select')) {
      for (const opt of sel.options) {
        if (opt.selected !== opt.defaultSelected) return { dirty: true };
      }
    }
    for (const el of d.querySelectorAll('[contenteditable]')) {
      if ((el.textContent || '').trim()) return { dirty: true };
    }
    if (d.designMode === 'on' && (d.body?.textContent || '').trim()) return { dirty: true };
    if (window.sessionStorage && window.sessionStorage.length > 0) return { dirty: true };
    if (d.pictureInPictureElement) return { dirty: true };
    return {
      dirty: false,
      deepScrolled: window.scrollY > 3 * window.innerHeight,
    };
  } catch (e) {
    return { dirty: true };
  }
})()`;

/**
 * Quiet Tabs: is there unsaved work in this tab? Fail-safe: any frame that
 * fails to answer within the 250 ms budget counts as DIRTY (spec §4.4).
 * Side effect: records tab.deepScrolled from whichever frame reports it.
 * @returns {Promise<boolean>} true => do not quiet this tab
 */
async function probeTabDirty(tab, wc) {
  // A tab sitting on our own error page holds nothing to lose, and the
  // fail-safe-to-dirty rule would otherwise exclude exactly the tabs this
  // feature exists to reclaim (spec §4.2).
  if (typeof tab.url === 'string' && tab.url.startsWith('blanc://error')) {
    tab.deepScrolled = false;
    return false;
  }
  let frames;
  try {
    frames = wc.mainFrame?.framesInSubtree ?? [];
  } catch {
    return true;
  }
  if (frames.length === 0) return true;
  // ONE budget for the whole set, not per frame.
  const budget = new Promise((resolve) => setTimeout(() => resolve('timeout'), 250));
  const answers = await Promise.race([
    Promise.all(frames.map((frame) => {
      // executeJavaScript is top-frame only on a webContents; the frame-level
      // call is what makes a cross-origin payment/SSO iframe visible at all.
      try { return frame.executeJavaScript(DIRTY_PROBE_SOURCE).catch(() => null); }
      catch { return Promise.resolve(null); }
    })),
    budget,
  ]);
  if (answers === 'timeout') return true;
  let deepScrolled = false;
  for (const answer of answers) {
    if (!answer || typeof answer !== 'object') return true; // a frame failed to answer
    if (answer.dirty) return true;
    if (answer.deepScrolled) deepScrolled = true;
  }
  tab.deepScrolled = deepScrolled;
  return deepScrolled ? true : false;
}
```

- [ ] **Step 4: Verify the module still parses and the suite is green**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && node --check src/main/main.js && npm run test:unit`

Expected: `node --check` prints nothing (a clean parse); unit PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/main.js
git commit -m "Quiet Tabs: the per-frame unsaved-input probe"
```

---

### Task 208: `sleepTab` — the canonical teardown

**Files:**
- Modify: `src/main/main.js`
- Test: existing suite (`npm run test:unit`) plus a manual `npm start` check

**Interfaces:**
- Consumes: `trimSnapshot` (Task 201), `sleepSnapshots` (Task 206), `probeTabDirty` (Task 207),
  `liveContents` + `wireTabView` (Phase 1), `tabIdByWebContentsId` (Phase 1).
- Produces: `async function sleepTab(id) -> Promise<boolean>`; `let sleepTeardownInProgress`.

Three things in this task are easy to get wrong and expensive to get wrong:

1. **`wc.close()` is asynchronous** (~13 ms). In that window the tab's own listeners keep firing:
   `did-stop-loading` would clobber `tab.url` to `''`, poisoning both the wake fallback and the
   next `persistSession()`; `did-fail-load` and `render-process-gone` would call `loadURL` and
   **resurrect the renderer you just discarded**. Hence `removeAllListeners()`.
2. **Destruction must be observed.** Dropping the JS reference reclaims 0 bytes (measured). The
   view is held in the snapshot record until `destroyed` fires.
3. **`will-prevent-unload` polarity is inverted from the intuitive reading.** The event fires when
   the page *objects* to unloading; calling `event.preventDefault()` **overrides the objection and
   lets the unload proceed** — Blanc documents this inline in its own modal handler. The temporary
   handler here must **record the abort and return**, calling nothing.

- [ ] **Step 1: Confirm the baseline and read the polarity precedent**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit && grep -n "preventing the prevention" src/main/tab-view.js src/main/main.js`

Expected: unit PASS, and the grep prints
`if (choice === 0) event.preventDefault(); // preventing the prevention lets the unload proceed`.
Read that line before writing Step 3 — it is the same polarity, used the opposite way.

- [ ] **Step 2: Confirm nothing named sleepTab exists yet**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && grep -n "function sleepTab" src/main/main.js`

Expected: no output.

- [ ] **Step 3: Write minimal implementation**

At the top of `src/main/main.js`, add `tab-sleep` to the requires (next to the other
`require('./...')` lines):

```js
const {
  sleepCandidates,
  trimSnapshot,
  TAB_SLEEP_DELAY_MS,
  MAX_SLEEP_SNAPSHOTS,
} = require('./tab-sleep');
```

Then add, immediately below `probeTabDirty`:

```js
/** True while sleepTab has swapped a tab's listener set for the silent
 *  teardown pair. A user-initiated closeTab arriving in that window cancels
 *  the sleep intent rather than racing the re-wire (spec §4.4.1). */
let sleepTeardownInProgress = false;

/**
 * Discard one tab's renderer. BEST-EFFORT by contract: it never throws, never
 * surfaces an error, and never wakes anything. A throwing probe or a wedged
 * getAllEntries() simply leaves the tab awake for the next sweep.
 *
 * There is no options object: `/sleep` bypasses the idle threshold through
 * sleepCandidates({ ignoreThreshold: true }), never through here (spec §9).
 *
 * @param {string} id
 * @returns {Promise<boolean>} true iff the tab is now asleep
 */
async function sleepTab(id) {
  const tab = tabs.get(id);
  const wc = liveContents(tab);
  if (!tab || !wc) return false;
  if (tab.asleep || tab.sleeping || tab.waking) return false;

  // Existing TOCTOU pattern (the 1Password flow uses the same epoch).
  const epochAtProbe = tab.navEpoch;

  // 1. Snapshot first — it needs a live webContents, and refusing an empty one
  //    is what stops a good snapshot being overwritten with nothing (§4.5).
  let snapshot = null;
  try {
    const nav = wc.navigationHistory;
    snapshot = trimSnapshot(nav.getAllEntries(), nav.getActiveIndex(), { private: !!tab.private });
  } catch {
    return false;
  }
  if (!snapshot) return false;

  // 2. The unsaved-input probe. Any failure is dirty.
  let dirty = true;
  try { dirty = await probeTabDirty(tab, wc); } catch { dirty = true; }
  if (dirty) return false;

  // 3. Re-validate, ONE synchronous block, immediately before teardown. The
  //    probe's 250 ms let the user activate this tab; setActiveTab is fully
  //    synchronous once entered, so a naive continuation would discard the
  //    VISIBLE tab and leave a dead view inside contentView (spec §4.5).
  if (!tabs.has(id) || id === rt().activeTabId || tab.navEpoch !== epochAtProbe
      || tab.isLoading || tab.sleeping || !liveContents(tab)) return false;

  if (snapshot.droppedPageState) {
    console.debug(`[quiet-tabs] ${id}: page state dropped (oversized or private)`);
  }
  if (sleepSnapshots.size >= MAX_SLEEP_SNAPSHOTS) {
    console.debug('[quiet-tabs] snapshot ceiling reached; refusing to quiet further tabs');
    return false;
  }

  // 4. Teardown. The view is held in the record — dropping the reference
  //    reclaims nothing; destruction must be OBSERVED (spec §1, §4.1).
  sleepSnapshots.set(id, {
    view: tab.view,
    entries: snapshot.entries,
    index: snapshot.index,
    droppedPageState: snapshot.droppedPageState,
  });
  tab.sleeping = true;
  sleepTeardownInProgress = true;
  const wcId = wc.id;
  const owner = windowRuntimes.runtimeForTab(id) ?? primaryRuntime;
  // The authoritative teardown set is ALL of them: did-stop-loading would
  // clobber tab.url to '' and poison the wake fallback AND persistSession;
  // did-fail-load and render-process-gone would loadURL and resurrect the
  // renderer this function just discarded.
  wc.removeAllListeners();

  let aborted = false;
  const outcome = await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };

    // Both temporary listeners attach BEFORE the close call.
    wc.once('destroyed', bindWindowRuntime(owner, () => {
      tab.view = null;
      tab.asleep = true;
      tab.sleeping = false;
      // Zero exactly what described the discarded renderer. A stale
      // blockedCount feeds shieldChipState; a stale audible:true makes the tab
      // permanently ineligible for every later sweep.
      tab.blockedCount = 0;
      tab.audible = false;
      tab.isLoading = false;
      tab.pageBg = null;
      tab.themeColor = null;
      const record = sleepSnapshots.get(id);
      if (record) record.view = null; // the retention window is over
      tabIdByWebContentsId.delete(wcId);
      lastMainFrameMethod.delete(wcId);
      finish('quiet');
    }));

    // POLARITY: this fires when the page OBJECTS to unloading. Calling
    // event.preventDefault() here would OVERRIDE the objection and destroy the
    // very tab we are trying to spare. Record and return — nothing else.
    wc.on('will-prevent-unload', () => { aborted = true; finish('aborted'); });

    // The ONLY close call in this path. Bare close() does not run beforeunload
    // at all; waitForBeforeUnload is destructive by contract, which is why it
    // is the teardown rather than an exploratory probe (spec §4.4.1).
    wc.close({ waitForBeforeUnload: true });

    // Safety valve: a wedged renderer must not strand tab.sleeping = true,
    // which would exclude it from every future sweep. Treated as an abort.
    setTimeout(() => finish('unresponsive'), 5000);
  });

  if (outcome === 'quiet') {
    sleepTeardownInProgress = false;
    broadcastTabs();
    return true;
  }

  // Abort: the page has unsaved work (or never answered). Restore the full
  // listener set removeAllListeners() took away and leave the tab awake; the
  // next sweep retries it.
  tab.sleeping = false;
  sleepSnapshots.delete(id);
  const stillThere = sleepTeardownInProgress && tabs.has(id) && liveContents(tab);
  sleepTeardownInProgress = false;
  if (stillThere) {
    wireTabView(tab, tab.view, {
      owner: windowRuntimes.runtimeForTab(id) ?? primaryRuntime,
      adopted: false,
    });
  }
  console.debug(`[quiet-tabs] ${id}: teardown ${outcome} — left awake${aborted ? ' (beforeunload)' : ''}`);
  return false;
}
```

Then, so a concurrent user close cancels the sleep intent rather than racing the re-wire, in
`closeTab` find:

```js
  sleepSnapshots.delete(id);
  const tab = tabs.get(id);
  if (!tab) return;
```

and replace with:

```js
  sleepSnapshots.delete(id);
  // A user-initiated close during a sleep teardown wins: cancel the sleep
  // intent so its abort branch does not re-wire a tab that is going away.
  sleepTeardownInProgress = false;
  const tab = tabs.get(id);
  if (!tab) return;
```

- [ ] **Step 4: Verify parse and suite, then check the app still runs**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && node --check src/main/main.js && npm run test:unit`

Expected: clean parse; unit PASS. Then `npm start`, open two tabs, switch between them, close
one — normal behaviour, no crash. Quit.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/main.js
git commit -m "Quiet Tabs: sleepTab and the canonical one-close teardown"
```

---

### Task 209: `wakeTab` and the wake generation

**Files:**
- Modify: `src/main/main.js`
- Modify: `src/main/tab-view.js` (implement nothing — verify the `noteWakeSuppressed` call sites)
- Test: existing suite (`npm run test:unit`)

**Interfaces:**
- Consumes: `createTabView`, `wireTabView`, `liveContents` (Phase 1); `sleepSnapshots` (Task 206);
  `webrtcPolicyFor` (existing import).
- Produces: `async function wakeTab(id, { navigateTo, atIndex }) -> Promise<boolean>`;
  the real `noteWakeSuppressed(tab)`; `const pendingWakes = new Set()`.

Two failure modes this task exists to prevent:

- **A one-shot suppression flag is not sufficient.** `did-navigate` fires once per hop of a
  redirect chain, and `history.addVisit` dedupes only against `entries[0]` — so a one-shot flag is
  spent on hop 1 and every later hop writes a phantom history row timestamped *now*. Suppression is
  therefore a *generation window*, not a flag.
- **Commit is promise resolution, never a `did-navigate`.** Clearing `asleep` on the first
  `did-navigate` would make the UI claim a blank tab is awake, and would drop the snapshot before
  the final page succeeded.

- [ ] **Step 1: Confirm the baseline and the stub**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit && grep -n "noteWakeSuppressed" src/main/main.js src/main/tab-view.js`

Expected: unit PASS. `main.js` shows a stub returning `false`; `tab-view.js` shows it guarding
history recording (`addVisit`/`updateTitle`) **and** the `did-fail-load` handler. If any of those
three call sites is missing in `tab-view.js`, add it — each is `if (noteWakeSuppressed(tab)) return;`
at the top of the relevant branch (for `addVisit`/`updateTitle`, `&& !noteWakeSuppressed(tab)` on
the existing condition is equivalent and tidier).

- [ ] **Step 2: Confirm nothing named wakeTab exists yet**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && grep -n "function wakeTab" src/main/main.js`

Expected: no output.

- [ ] **Step 3: Write minimal implementation**

**Edit 3a** — replace the `noteWakeSuppressed` stub in `main.js` with:

```js
/** Quiet Tabs: is a wake generation open on this tab? While one is, that tab's
 *  history recording (addVisit AND updateTitle) and its normal did-fail-load
 *  handling are suppressed — for EVERY hop of a redirect chain, not just the
 *  first (spec §5.1 rule 1). */
function noteWakeSuppressed(tab) {
  return !!tab?.waking;
}
```

**Edit 3b** — add `wakeTab` and its helpers immediately below `sleepTab`:

```js
/** Wakes deferred because the startup navigation gate was up. The gate cancels
 *  the request and replays it with a plain loadURL keyed by webContents id,
 *  which would discard the restored {entries, index} and leave the tab
 *  permanently blank with no error page (spec §5). */
const pendingWakes = new Set();

/** End a wake generation successfully. */
function commitWake(tab, generation) {
  if (tab.wakeGeneration !== generation) return false; // superseded
  tab.asleep = false;
  tab.waking = false;
  tab.lastActiveAt = Date.now();
  sleepSnapshots.delete(tab.id);
  broadcastTabs();
  return true;
}

/** End a wake generation in failure: deliberately commit the error page (whose
 *  query carries the tab's stored title), and only THEN drop the snapshot, so a
 *  retry re-restores rather than degrading to a bare URL load (spec §5.1 r3/r4). */
async function failWake(tab, generation) {
  if (tab.wakeGeneration !== generation) return false;
  const wc = liveContents(tab);
  if (wc) {
    const q = new URLSearchParams({
      url: tab.url ?? '',
      code: 'wake-failed',
      desc: 'The page could not be reloaded',
      title: tab.title ?? '',
    });
    await wc.loadURL(`blanc://error/?${q}`).catch(() => {});
  }
  if (tab.wakeGeneration !== generation) return false;
  tab.asleep = false;
  tab.waking = false;
  tab.lastActiveAt = Date.now();
  sleepSnapshots.delete(tab.id);
  broadcastTabs();
  return false;
}

/**
 * Rebuild a quiet tab's renderer inside a wake generation (spec §5.1).
 *
 * The SYNCHRONOUS PREFIX — createTabView, wireTabView, `tab.view = view` — runs
 * before the first await, so a caller that re-reads tab.view in the same turn
 * (openInternalPage's reload) sees a live view, and a synchronous caller
 * (setActiveTab) can call this WITHOUT awaiting.
 *
 * @param {string} id
 * @param {object} [opts]
 * @param {string|null} [opts.navigateTo=null] load this INSTEAD of restore();
 *   mutually exclusive with restore(), which must be a tab's first navigation.
 * @param {number|null} [opts.atIndex=null] restore at this entry index instead
 *   of the snapshot's own — back/forward on a quiet tab passes index ± 1 so one
 *   navigation does both. Ignored when navigateTo is set; clamped to range.
 * @returns {Promise<boolean>} true iff the generation committed successfully
 */
async function wakeTab(id, { navigateTo = null, atIndex = null } = {}) {
  const tab = tabs.get(id);
  if (!tab) return false;
  if (!tab.asleep) return true; // already awake — nothing to do
  if (startupNavigationGateActive) {
    pendingWakes.add(id);
    return false;
  }

  const owner = windowRuntimes.runtimeForTab(id) ?? primaryRuntime;
  const snapshot = sleepSnapshots.get(id);

  // ---- synchronous prefix ----
  // createTabView is the ONLY place the private-session ternary lives: a woken
  // private tab built with plain TAB_WEB_PREFERENCES would join
  // session.defaultSession while the chrome still paints the private pill.
  const view = createTabView(tab);
  tab.view = view;
  // A tab woken without applyWindowOpenPolicy FAILS OPEN — Electron's default
  // window.open action is allow. wireTabView is what re-installs it.
  // Deliberately NOT createTab: that hardcodes title 'New Tab' and its
  // broadcast drives persistSession() + tabsync.noteTabsChanged() (spec §5).
  wireTabView(tab, view, { owner, adopted: false });
  const wc = view.webContents;
  tabIdByWebContentsId.set(wc.id, id);
  wc.setAudioMuted(!!tab.muted);
  // Read LIVE at wake time, never replayed from sleep time. Blanc's default
  // (default_public_interface_only) is not Chromium's, and a woken tab without
  // it leaks local interface addresses while Settings still reads "Standard".
  wc.setWebRTCIPHandlingPolicy(webrtcPolicyFor(settings.getSettings().webrtcPolicy));
  tab.waking = true;
  const generation = ++tab.wakeGeneration;
  // ---- end synchronous prefix ----

  let first;
  if (navigateTo) {
    // restore() and navigation are mutually exclusive; the snapshot is spent.
    sleepSnapshots.delete(id);
    first = wc.loadURL(navigateTo);
  } else if (snapshot && snapshot.entries.length > 0) {
    const index = atIndex === null
      ? snapshot.index
      : Math.max(0, Math.min(snapshot.entries.length - 1, atIndex));
    first = wc.navigationHistory.restore({ entries: snapshot.entries, index });
  } else {
    first = wc.loadURL(tab.url);
  }

  try {
    await first;
    return commitWake(tab, generation);
  } catch {
    if (tab.wakeGeneration !== generation) return false; // superseded
    // EXACTLY ONE fallback, and only after a rejected restore() — a rejected
    // loadURL must not be retried with another loadURL.
    const canFallBack = !navigateTo && snapshot && snapshot.entries.length > 0;
    if (!canFallBack) return failWake(tab, generation);
    const live = liveContents(tab);
    if (!live) return failWake(tab, generation);
    try {
      await live.loadURL(tab.url);
      return commitWake(tab, generation);
    } catch {
      return failWake(tab, generation);
    }
  }
}
```

**Edit 3c** — drain the deferred wakes when the gate lifts. In `releaseStartupNavigationGate`, find:

```js
  const queued = [...startupQueuedNavigations.entries()];
```

and replace with:

```js
  // Quiet Tabs: wakes refused while the gate was up (spec §5).
  const deferredWakes = [...pendingWakes];
  pendingWakes.clear();
  for (const tabId of deferredWakes) wakeTab(tabId).catch(() => {});

  const queued = [...startupQueuedNavigations.entries()];
```

- [ ] **Step 4: Verify parse and suite**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && node --check src/main/main.js && npm run test:unit`

Expected: clean parse; unit PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/main.js src/main/tab-view.js
git commit -m "Quiet Tabs: wakeTab and the wake generation"
```

---

### Task 210: Wake choke points — `setActiveTab` and the arbitrary-id handlers

**Files:**
- Modify: `src/main/main.js`
- Test: existing acceptance suite

**Interfaces:**
- Consumes: `wakeTab` (Task 209), `liveContents` (Phase 1), `sleepSnapshots` (Task 206).
- Produces: nothing new — this makes quiet tabs reachable without crashing.

Without this task the app is broken the moment a tab goes quiet: `setActiveTab` dereferences
`next.view.webContents.isDestroyed()` as its very first act. `setActiveTab` is the **single wake
choke point** — every activation path in the app funnels through it.

- [ ] **Step 1: Confirm the baseline**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable`

Expected: PASS (this is the full regression net for a change that touches tab activation; prefix
with `xvfb-run -a` on headless Linux). Note the runtime — you will run it again in Step 4.

- [ ] **Step 2: List the sites you must change**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && grep -n "?.view.webContents\|next.view.webContents\|source.view.webContents" src/main/main.js`

Expected: the handlers named in Step 3 (`tabs:back`, `tabs:forward`, `tabs:reload`, `tabs:stop`,
`tabs:find`, `tabs:find-stop`, `tabs:search`, `navigateTabToAddress`, `toggleTabMuted`,
`duplicateTab`) plus `setActiveTab` and `activateTabFromRail`. Every one of them uses an optional
chain that stops at the **tab**, not at the **view** — which is exactly the bug.

- [ ] **Step 3: Write minimal implementation**

**Edit 3a** — `setActiveTab`. Find:

```js
function setActiveTab(id, { focusContent = true, focusAddress = false } = {}) {
  const next = tabs.get(id);
  if (!next) return;
  // A script-closed adopted tab prunes itself via its 'destroyed' handler,
  // but a deferred activation (the window-open setImmediate) can race the
  // event — never attach or focus a dead webContents.
  if (next.view.webContents.isDestroyed()) return;
```

and replace with:

```js
function setActiveTab(id, { focusContent = true, focusAddress = false } = {}) {
  const next = tabs.get(id);
  if (!next) return;
  // Quiet Tabs: the SINGLE wake choke point, and it must come before the first
  // guard below — that line dereferences next.view.webContents ahead of
  // everything else. Not awaited: wakeTab's synchronous prefix has already set
  // tab.view by the time it returns its promise (spec §5).
  if (next.asleep) wakeTab(id).catch(() => {});
  // A script-closed adopted tab prunes itself via its 'destroyed' handler,
  // but a deferred activation (the window-open setImmediate) can race the
  // event — never attach or focus a dead webContents.
  if (!liveContents(next)) return;
```

Then, further down in the same function, find:

```js
  if (!hasLiveWindow()) {
    rt().activeTabId = id;
    scheduleMenuRebuild();
    return;
  }
```

and leave it exactly as it is — but confirm the wake above it is **outside** this branch, so a
dock-reopen on a quiet tab wakes rather than hitting the dereference. (If you moved the wake, move
it back.)

**Edit 3b** — `activateTabFromRail`. Find:

```js
function activateTabFromRail(id) {
  const tab = tabs.get(id);
  if (!tab || tab.view.webContents.isDestroyed()) return false;
```

and replace with:

```js
function activateTabFromRail(id) {
  const tab = tabs.get(id);
  if (!tab) return false;
  // The rail activates BACKGROUND ids by definition, so this is the path a
  // quiet tab is most often reached through.
  if (tab.asleep) wakeTab(id).catch(() => {});
  if (!liveContents(tab)) return false;
```

**Edit 3c** — `navigateTabToAddress`. Find:

```js
  tab.view.webContents.loadURL(target).catch(() => {});
```

(inside `navigateTabToAddress`) and replace with:

```js
  // A quiet tab navigates in ONE step: restore() and a navigation are mutually
  // exclusive, so the snapshot is discarded and the target loaded directly.
  if (tab.asleep) { wakeTab(id, { navigateTo: target }).catch(() => {}); return; }
  liveContents(tab)?.loadURL(target).catch(() => {});
```

**Edit 3d** — `tabs:search`. Find:

```js
    return tab.view.webContents.loadURL(target);
```

and replace with:

```js
    if (tab.asleep) return wakeTab(id, { navigateTo: target });
    return liveContents(tab)?.loadURL(target);
```

**Edit 3e** — back/forward/reload/stop/find. Find:

```js
  chromeHandle('tabs:back', (_e, id) => tabs.get(id)?.view.webContents.navigationHistory.goBack());
  chromeHandle('tabs:forward', (_e, id) => tabs.get(id)?.view.webContents.navigationHistory.goForward());
  chromeHandle('tabs:reload', (_e, id) => tabs.get(id)?.view.webContents.reload());
  chromeHandle('tabs:stop', (_e, id) => tabs.get(id)?.view.webContents.stop());
```

and replace with:

```js
  // Quiet Tabs: all four take an arbitrary id, so a quiet tab is reachable.
  // Back/forward on a quiet tab restore at index ± 1 — ONE navigation that
  // both wakes and moves, instead of a wake followed by a second load.
  chromeHandle('tabs:back', (_e, id) => {
    const tab = tabs.get(id);
    if (!tab) return;
    if (tab.asleep) {
      const snapshot = sleepSnapshots.get(id);
      return wakeTab(id, { atIndex: snapshot ? snapshot.index - 1 : null });
    }
    return liveContents(tab)?.navigationHistory.goBack();
  });
  chromeHandle('tabs:forward', (_e, id) => {
    const tab = tabs.get(id);
    if (!tab) return;
    if (tab.asleep) {
      const snapshot = sleepSnapshots.get(id);
      return wakeTab(id, { atIndex: snapshot ? snapshot.index + 1 : null });
    }
    return liveContents(tab)?.navigationHistory.goForward();
  });
  chromeHandle('tabs:reload', (_e, id) => {
    const tab = tabs.get(id);
    if (!tab) return;
    if (tab.asleep) return wakeTab(id);
    return liveContents(tab)?.reload();
  });
  // Stopping a quiet tab is a no-op — never a throw, never a wake.
  chromeHandle('tabs:stop', (_e, id) => liveContents(tabs.get(id))?.stop());
```

**Edit 3f** — find. Find:

```js
  chromeHandle('tabs:find', (_e, id, query, options) => tabs.get(id)?.view.webContents.findInPage(query, options));
  chromeHandle('tabs:find-stop', (_e, id) => tabs.get(id)?.view.webContents.stopFindInPage('clearSelection'));
```

and replace with:

```js
  chromeHandle('tabs:find', (_e, id, query, options) => {
    const tab = tabs.get(id);
    if (!tab) return;
    if (tab.asleep) return wakeTab(id); // find on the rebuilt page, never a throw
    return liveContents(tab)?.findInPage(query, options);
  });
  chromeHandle('tabs:find-stop', (_e, id) =>
    liveContents(tabs.get(id))?.stopFindInPage('clearSelection'));
```

**Edit 3g** — `toggleTabMuted`. Find:

```js
function toggleTabMuted(id) {
  const tab = tabs.get(id);
  if (!tab) return false;
  tab.muted = !tab.muted;
  tab.view.webContents.setAudioMuted(tab.muted);
```

and replace with:

```js
function toggleTabMuted(id) {
  const tab = tabs.get(id);
  if (!tab) return false;
  tab.muted = !tab.muted;
  // The panel renders a mute button for any audible-or-muted tab, so this is
  // reached with background ids today. A quiet tab just records the intent —
  // wakeTab re-applies setAudioMuted from the record.
  liveContents(tab)?.setAudioMuted(tab.muted);
```

**Edit 3h** — `duplicateTab`. Find:

```js
function duplicateTab(id) {
  const source = tabs.get(id);
  if (!source) return;
  const insertAt = rt().tabOrder.indexOf(id) + 1;
  const history = source.view.webContents.navigationHistory;
  const entries = history.getAllEntries();
```

and replace with:

```js
function duplicateTab(id) {
  const source = tabs.get(id);
  if (!source) return;
  const insertAt = rt().tabOrder.indexOf(id) + 1;
  // A quiet source duplicates straight out of its snapshot — better than
  // today's behaviour, and it avoids a spurious wake.
  const snapshot = source.asleep ? sleepSnapshots.get(id) : null;
  const wc = liveContents(source);
  const history = snapshot ? null : wc?.navigationHistory;
  const entries = snapshot ? snapshot.entries : (history?.getAllEntries() ?? []);
  const activeIndex = snapshot ? snapshot.index : (history?.getActiveIndex() ?? 0);
```

Then, a few lines below in the same function, find:

```js
    restoreHistory: entries.length > 1 ? { entries, index: history.getActiveIndex() } : null,
```

and replace with:

```js
    restoreHistory: entries.length > 1 ? { entries, index: activeIndex } : null,
```

**Edit 3i** — `openInternalPage`. Find:

```js
    tab.view.webContents.reload(); // pick up fresh data
```

and replace with:

```js
    // wakeTab's synchronous prefix has already set tab.view by the time
    // setActiveTab returned, but a quiet tab is being navigated anyway —
    // hand it the URL directly rather than restore-then-reload.
    if (tab.asleep) wakeTab(existing, { navigateTo: url }).catch(() => {});
    else liveContents(tab)?.reload(); // pick up fresh data
```

- [ ] **Step 4: Run the full acceptance suite**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable`

Expected: PASS, with the same scenario count as Step 1. Every one of these edits is on a hot tab
path; a regression here shows up as a failing activation/navigation scenario, not as a subtle bug.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/main.js
git commit -m "Quiet Tabs: wake choke points for every arbitrary-id tab handler"
```

---

### Task 211: The 30-second sweep

**Files:**
- Modify: `src/main/main.js`
- Test: existing suite; driven for real by Task 212's `runSleepSweep()`

**Interfaces:**
- Consumes: `sleepCandidates`, `TAB_SLEEP_DELAY_MS`, `MAX_SLEEP_SNAPSHOTS` (Tasks 201–202);
  `sleepTab` (Task 208); `popupChildCounts` (Task 205); `sleepSnapshots` (Task 206).
- Produces: `let sleepThresholdOverrideMs = null`; `currentSleepThresholdMs()`;
  `async function runSleepSweep() -> {quieted: string[], skippedReason: string|null}`;
  the registered interval.

Three rules that are not optional:

- The interval **must** be registered wrapped in `bindWindowRuntime(primaryRuntime, ...)`. An
  unbound `setInterval` is an AsyncLocalStorage boundary, and the sweep touches `rt().activeTabId`
  and `broadcastTabs()`.
- **Never quiet or wake from inside the settings fan-out.** `setSettings()` runs
  `onSettingsChanged` synchronously and webContents lifecycle work in that turn is a reproducible
  main-process crash. Hence `setImmediate`.
- **Broadcast only on actual transitions**, or the rail's `list.replaceChildren` churns every
  30 seconds.

- [ ] **Step 1: Confirm the baseline**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit`

Expected: PASS.

- [ ] **Step 2: Check the imports you are about to need**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && sed -n '1p' src/main/main.js`

Expected: the destructured `require('electron')` line, which does **not** yet include `net` or
`powerMonitor`. You add both in Step 3.

- [ ] **Step 3: Write minimal implementation**

**Edit 3a** — line 1 of `src/main/main.js`. Replace:

```js
const { app, BrowserWindow, WebContentsView, session, ipcMain, Menu, nativeTheme, nativeImage, dialog, shell } = require('electron');
```

with:

```js
const { app, BrowserWindow, WebContentsView, session, ipcMain, Menu, nativeTheme, nativeImage, dialog, shell, net, powerMonitor } = require('electron');
```

**Edit 3b** — add the sweep, immediately below `wakeTab`:

```js
// ─── Quiet Tabs sweep (spec §4.3) ────────────────────────────────────────
const SLEEP_SWEEP_INTERVAL_MS = 30_000;

/** Acceptance-only threshold override, in ms (or null to follow settings). */
let sleepThresholdOverrideMs = null;
/** Wall-clock time of the previous sweep, for the clock-jump check. */
let lastSleepSweepAt = 0;

/** The idle threshold now in force, in ms, or null for "never auto-quiet". */
function currentSleepThresholdMs() {
  if (sleepThresholdOverrideMs !== null) return sleepThresholdOverrideMs;
  const key = settings.getSettings().tabSleep;
  // Deliberately NOT `?? DEFAULT`: 'off' maps to null, and `??` would turn the
  // user's explicit Off into the default delay. Presence is the test.
  return Object.hasOwn(TAB_SLEEP_DELAY_MS, key)
    ? TAB_SLEEP_DELAY_MS[key]
    : TAB_SLEEP_DELAY_MS['1h']; // the setting ships in a later phase
}

/** Ids of tabs whose permission prompt is still open, for this runtime. */
function permissionPendingTabIds() {
  const ids = new Set();
  for (const pending of rt().permissionPrompts.values()) {
    if (pending?.tabId) ids.add(pending.tabId);
  }
  return ids;
}

/**
 * One pass of the idle sweep. Returns what it did so the acceptance harness can
 * drive the REAL body rather than a reimplementation.
 * @param {object} [opts]
 * @param {boolean} [opts.ignoreThreshold=false] `/sleep`: skip the wait only
 * @returns {Promise<{quieted: string[], skippedReason: string|null}>}
 */
async function runSleepSweep({ ignoreThreshold = false } = {}) {
  const skip = (reason) => ({ quieted: [], skippedReason: reason });
  if (isQuitting) return skip('quitting');
  if (sessionPersistenceSuspended) return skip('persistence-suspended');
  if (startupNavigationGateActive) return skip('startup-gate');
  // Wake is a network re-fetch; there is no point discarding anything we
  // cannot bring back.
  if (!net.isOnline()) return skip('offline');

  const now = Date.now();
  // Wall-clock lastActiveAt means a lid closed at 6pm discards every tab at
  // 9am — all at once, a dozen simultaneous probes into just-unthrottled
  // renderers, when the network is least reliable. Re-stamp and skip.
  if (lastSleepSweepAt && now - lastSleepSweepAt > 2 * SLEEP_SWEEP_INTERVAL_MS) {
    lastSleepSweepAt = now;
    restampBackgroundTabs();
    return skip('clock-jump');
  }
  lastSleepSweepAt = now;

  const tabList = rt().tabOrder.map((id) => tabs.get(id)).filter(Boolean);
  const candidates = sleepCandidates(tabList, {
    now,
    thresholdMs: currentSleepThresholdMs(),
    activeTabId: rt().activeTabId,
    ignoreThreshold,
    snapshotCount: sleepSnapshots.size,
    maxSnapshots: MAX_SLEEP_SNAPSHOTS,
    permissionPendingTabIds: permissionPendingTabIds(),
    popupChildCounts,
  });

  const quieted = [];
  for (const id of candidates) {
    // Sequential, not Promise.all: each sleepTab re-validates against the live
    // active tab, and a burst of concurrent 250 ms probes is exactly what the
    // clock-jump rule exists to avoid.
    if (await sleepTab(id)) quieted.push(id);
  }
  // Broadcast ONLY on an actual transition — sleepTab already broadcasts per
  // tab, so an empty pass must stay silent or the rail's replaceChildren
  // churns every 30 seconds.
  return { quieted, skippedReason: null };
}

/** Re-stamp every background tab as "active just now" (clock-jump / resume). */
function restampBackgroundTabs() {
  const now = Date.now();
  for (const tab of tabs.values()) {
    if (tab.id === rt().activeTabId || tab.asleep) continue;
    tab.lastActiveAt = now;
  }
}
```

**Edit 3c** — register the interval and the power hook. In `app.whenReady()`'s body, immediately
after the `initSpikePackaging();` line, add:

```js
  // Quiet Tabs: ONE 30s sweep, registered WRAPPED — an unbound setInterval is
  // an AsyncLocalStorage boundary and this touches rt().activeTabId and
  // broadcastTabs(). Deferred with setImmediate so it can never execute inside
  // a settings fan-out turn, where webContents lifecycle work is a documented
  // reproducible main-process crash (spec §4.3).
  setInterval(bindWindowRuntime(primaryRuntime, () => {
    setImmediate(bindWindowRuntime(primaryRuntime, () => {
      runSleepSweep().catch((err) => console.warn('[quiet-tabs] sweep:', err?.message));
    }));
  }), SLEEP_SWEEP_INTERVAL_MS);

  powerMonitor.on('resume', bindWindowRuntime(primaryRuntime, () => {
    // The machine was asleep, not the user idle: every background tab's
    // lastActiveAt is meaningless now.
    lastSleepSweepAt = Date.now();
    restampBackgroundTabs();
  }));
```

- [ ] **Step 4: Verify parse and suite, then watch a real launch**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && node --check src/main/main.js && npm run test:unit`

Expected: clean parse; unit PASS.

Then run `npm start`, open two or three tabs, and leave the app running for two minutes. Expected:
nothing happens (the default threshold is an hour), no console warnings, no CPU spike, and tab
switching still works. Quit.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/main.js
git commit -m "Quiet Tabs: the 30s idle sweep, bound and clock-jump safe"
```

---

### Task 212: The test-hook surface

**Files:**
- Modify: `src/main/test-hook.js`
- Modify: `src/main/main.js` (the `install({...})` refs object)
- Test: existing acceptance dry run

**Interfaces:**
- Consumes: `sleepTab`, `wakeTab`, `runSleepSweep`, `sleepSnapshots`, `sleepThresholdOverrideMs`
  (Tasks 208–211).
- Produces: `globalThis.__blanc.sleepTab/wakeTab/sleepState/setTabIdleSince/runSleepSweep/
  setSleepThresholdOverride/tabProcessCount`; a sleep-aware `reset()`.

`tabProcessCount()` is the falsifiability hook. Nothing in this repo reads process metrics today,
so a regression that closes the view but fails to release the OS process would be
**indistinguishable from success** in every test and in the UI. This is the only reader of
`getAppMetrics` in the codebase — keep it that way.

`sleepState()` must never return `entries`: the Map holds POST bodies and form values, and a test
surface that hands them out defeats the process-boundary rule they live under.

- [ ] **Step 1: Write the failing check**

There is no unit harness for `test-hook.js` (it is Electron-only). The failing check is the dry
run against the acceptance step that Task 213 will add — so instead, prove the methods are absent
right now:

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && grep -c "tabProcessCount\|sleepState\|setTabIdleSince" src/main/test-hook.js`

Expected: `0`.

- [ ] **Step 2: Confirm the mechanical bindRoot wrap you must not touch**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && sed -n '/Mechanical, generic wrap/,/^}/p' src/main/test-hook.js`

Expected: the loop over `Object.keys(globalThis.__blanc)`. Every method you add is picked up by it
automatically — **do not add anything to that loop**.

- [ ] **Step 3: Write minimal implementation**

**Edit 3a** — add the new refs to the destructure at the top of `install(refs)` in
`src/main/test-hook.js`. Find:

```js
    attemptChromeNavigation,
    getChromeUrl,
  } = refs;
```

and replace with:

```js
    attemptChromeNavigation,
    getChromeUrl,
    sleepTab,
    wakeTab,
    runSleepSweep,
    setSleepThresholdOverride,
    getSleepSnapshots,
  } = refs;
```

**Edit 3b** — add `require('electron')`'s `app` to the file's imports. Find:

```js
const { Menu, clipboard } = require('electron');
```

and replace with:

```js
const { app, Menu, clipboard } = require('electron');
```

**Edit 3c** — add the methods. In `globalThis.__blanc`, immediately above the
`// ---- isolation between scenarios ----` comment, insert:

```js
    // ---- Quiet Tabs ----
    // Every method drives the REAL main-process function; a mirror here would
    // keep the suite green with the shipping implementation reverted.
    async sleepTab(id) { return sleepTab(id); },
    async wakeTab(id) { return wakeTab(id); },
    /** With an id: that tab's state or null. Without: every tab, in tabOrder.
     *  NEVER returns `entries` — the snapshot holds POST bodies and form
     *  values (spec §6.1). */
    sleepState(id) {
      const snapshots = getSleepSnapshots();
      const one = (tabId, t) => ({
        id: tabId,
        asleep: !!t.asleep,
        hasSnapshot: snapshots.has(tabId),
        entryCount: snapshots.get(tabId)?.entries.length ?? 0,
      });
      if (typeof id === 'string') {
        const t = tabs.get(id);
        return t ? one(id, t) : null;
      }
      return getTabOrder()
        .map((tabId) => (tabs.get(tabId) ? one(tabId, tabs.get(tabId)) : null))
        .filter(Boolean);
    },
    /** Backdate a tab's idle clock so a sweep can see it as idle. */
    setTabIdleSince(id, msAgo) {
      const t = tabs.get(id);
      if (!t) return false;
      t.lastActiveAt = Date.now() - Number(msAgo || 0);
      return true;
    },
    async runSleepSweep() { return runSleepSweep(); },
    setSleepThresholdOverride(ms) { return setSleepThresholdOverride(ms); },
    /** THE falsifiability hook (spec §11). Quieting N tabs must drop this by N;
     *  without it, "closed the view but never released the process" is
     *  indistinguishable from success. The only getAppMetrics reader in the
     *  repo — keep it that way. */
    tabProcessCount() {
      return app.getAppMetrics().filter((p) => p.type === 'Tab').length;
    },
```

**Edit 3d** — make `reset()` sleep-aware. In `reset()`, find:

```js
    reset() {
      clearFocusObservation();
```

and replace with:

```js
    async reset() {
      clearFocusObservation();
      // Quiet tabs first: closeTab on a quiet tab is safe, but a scenario must
      // never inherit another's quiet state or its retained page state.
      for (const [id, t] of tabs) if (t.asleep) await wakeTab(id);
      getSleepSnapshots().clear();
      setSleepThresholdOverride(null);
```

and in the same function's `settings.setSettings({...})` block, add one line after
`adblockExceptions: [],`:

```js
        tabSleep: '1h',
```

(That key is ignored by `sanitize()` until the setting ships in a later phase — harmless now, and
it means `reset()` needs no second edit then.)

Finally check the callers of `reset()`: run
`grep -rn "'reset'\|\"reset\"" test/desktop/support/hooks.js` and confirm the `Before` hook
`await`s it. If it does not, add the `await`.

**Edit 3e** — pass the refs from `main.js`. In the `require('./test-hook').install({ ... })` call,
find:

```js
      getChromeUrl: () => rt().window?.webContents.getURL() ?? '',
    });
```

and replace with:

```js
      getChromeUrl: () => rt().window?.webContents.getURL() ?? '',
      sleepTab, wakeTab, runSleepSweep,
      getSleepSnapshots: () => sleepSnapshots,
      setSleepThresholdOverride: (ms) => {
        sleepThresholdOverrideMs = Number.isFinite(ms) && ms >= 0 ? Number(ms) : null;
        return sleepThresholdOverrideMs;
      },
    });
```

- [ ] **Step 4: Verify the harness still resolves and runs**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && node --check src/main/test-hook.js && node --check src/main/main.js && npm run test:acceptance:dry && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F2-1 or @F28-1"`

Expected: clean parses; the dry run PASSes; the two live scenarios PASS — which is what proves the
now-`async` `reset()` did not break scenario isolation.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/test-hook.js src/main/main.js
git commit -m "Quiet Tabs: test-hook surface incl. the getAppMetrics process count"
```

---

### Task 213: The falsifiability scenario — quieting really releases a renderer process

**Files:**
- Create: `spec/acceptance/quiet-tabs.feature`
- Create: `test/desktop/steps/quiet-tabs.steps.js`
- Modify: `test/desktop/cucumber.mjs` (add `@F31-10` to `RUNNABLE`)
- Modify: `test/desktop/support/fixtures-server.js` (a page variant with no `sessionStorage` write)

**Interfaces:**
- Consumes: `__blanc.sleepTab`, `__blanc.wakeTab`, `__blanc.sleepState`, `__blanc.tabProcessCount`
  (Task 212).
- Produces: the `@F31-10` scenario and its steps. Later phases append scenarios `@F31-1`…`@F31-9`
  to the same feature file and the same `RUNNABLE` list.

Why the fixture change: today's fixture page writes `sessionStorage` on load, and
`sessionStorage.length > 0` is one of the probe's dirty conditions — so **no existing fixture page
is quietable**. The `?nostore=1` variant is the smallest honest fix and leaves every existing
scenario byte-identical.

- [ ] **Step 1: Write the failing test**

Create `spec/acceptance/quiet-tabs.feature`:

```gherkin
@quiet-tabs
Feature: Quiet Tabs
  Blanc discards the renderer process of a tab you have not opened in a while
  and rebuilds it when you come back to it. The tab keeps its identity — title,
  address, favicon, and back history — the whole time.

  @F31-10 @F31 @desktop @D8
  Scenario: Quieting a tab releases a real renderer process, and waking brings one back
    Given a background tab on a quietable page
    And the renderer process count is recorded
    When I quiet that background tab
    Then that tab is quiet
    And the renderer process count has dropped by 1
    When I activate that quiet tab
    Then that tab is awake
    And the renderer process count has returned to what it was
```

Create `test/desktop/steps/quiet-tabs.steps.js`:

```js
const assert = require('node:assert');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('./../support/poll');

// F31 — Quiet Tabs. These steps drive the REAL sleepTab/wakeTab through the
// test hook. The process-count assertions are the feature's falsifiability
// net: without them, "closed the view but never released the OS process" looks
// exactly like success in every other assertion and in the UI.

Given('a background tab on a quietable page', async function () {
  const previouslyActive = (await this.state()).activeTabId;
  // ?nostore=1 suppresses the fixture's sessionStorage write — a non-empty
  // sessionStorage is one of the unsaved-work conditions that (correctly)
  // keeps a tab awake.
  const url = `${this.fixtureUrl('quietable')}?nostore=1`;
  this.quietCandidateId = await this.call('openTab', url);
  await this.waitForState((s) =>
    (s.tabs.find((t) => t.id === this.quietCandidateId)?.loadedUrl || '').includes('quietable'));
  // Put it in the background: the active tab is never quietable.
  await this.call('activateTab', previouslyActive);
  await this.waitForState((s) => s.activeTabId === previouslyActive);
});

Given('the renderer process count is recorded', async function () {
  // Process teardown from earlier scenarios settles asynchronously; take the
  // reading only once it has been stable across two polls.
  let previous = -1;
  this.baselineProcessCount = await waitForValue(
    async () => {
      const now = await this.call('tabProcessCount');
      const stable = now === previous;
      previous = now;
      return stable ? now : null;
    },
    (v) => v !== null,
    'the renderer process count to settle'
  );
});

When('I quiet that background tab', async function () {
  const ok = await this.call('sleepTab', this.quietCandidateId);
  assert.strictEqual(ok, true, 'sleepTab refused to quiet the tab');
});

When('I activate that quiet tab', async function () {
  await this.call('activateTab', this.quietCandidateId);
});

Then('that tab is quiet', async function () {
  const state = await this.call('sleepState', this.quietCandidateId);
  assert.ok(state, 'no sleep state for the tab');
  assert.strictEqual(state.asleep, true);
  assert.strictEqual(state.hasSnapshot, true, 'a quiet tab must retain its snapshot');
  assert.ok(state.entryCount >= 1, `expected at least one retained entry, got ${state.entryCount}`);
});

Then('that tab is awake', async function () {
  await waitForValue(
    () => this.call('sleepState', this.quietCandidateId),
    (s) => s && s.asleep === false && s.hasSnapshot === false,
    'the tab to finish waking and release its snapshot'
  );
});

Then('the renderer process count has dropped by {int}', async function (n) {
  await waitForValue(
    () => this.call('tabProcessCount'),
    (count) => count === this.baselineProcessCount - n,
    `the renderer process count to drop from ${this.baselineProcessCount} by ${n}`
  );
});

Then('the renderer process count has returned to what it was', async function () {
  await waitForValue(
    () => this.call('tabProcessCount'),
    (count) => count === this.baselineProcessCount,
    `the renderer process count to return to ${this.baselineProcessCount}`
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @F31-10`

Expected: FAIL — `0 scenarios` selected, because `@F31-10` is not in `RUNNABLE` yet. Add it (Step 3
edit 3a) and re-run: it then FAILs inside the scenario, at
`the renderer process count to drop from N by 1`, because the fixture page's `sessionStorage`
write makes the probe report dirty and `sleepTab` returns `false` — the assertion in
`I quiet that background tab` fires first with
`AssertionError: sleepTab refused to quiet the tab`.

- [ ] **Step 3: Write minimal implementation**

**Edit 3a** — in `test/desktop/cucumber.mjs`, find:

```js
  '@F30-1', '@F30-2', '@F30-3',
].join(' or ');
```

and replace with:

```js
  '@F30-1', '@F30-2', '@F30-3',
  '@F31-10',
].join(' or ');
```

**Edit 3b** — in `test/desktop/support/fixtures-server.js`, replace the whole `pageBody` function
with:

```js
function pageBody(req) {
  const raw = req.url || '/';
  const name = decodeURIComponent(raw.replace(/^\/site\//, '').split('?')[0]) || 'page';
  // ?nostore=1 omits the sessionStorage write. A non-empty sessionStorage is
  // one of the Quiet Tabs unsaved-work conditions, so the default page — which
  // every other scenario depends on — is deliberately never quietable.
  const store = raw.includes('nostore=1')
    ? ''
    : `<script>` +
      `const key='acceptance-load-count';` +
      `sessionStorage.setItem(key,String(Number(sessionStorage.getItem(key)||0)+1));` +
      `</script>`;
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title></head>` +
    `<body><h1>${name}</h1><p>widget widget widget</p>` +
    `<input id="acceptance-draft" aria-label="Unsaved draft">` +
    store +
    `</body></html>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:acceptance:dry && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @F31-10`

Expected: the dry run PASSes (every step resolves), and the live run reports
`1 scenario (1 passed)`. On headless Linux prefix the second command with `xvfb-run -a`.

If the process count does not drop, the failure is real and load-bearing: something closed the
view without releasing the process. Do not "fix" it by relaxing the assertion — that assertion is
the entire point of §11.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add spec/acceptance/quiet-tabs.feature test/desktop/steps/quiet-tabs.steps.js test/desktop/cucumber.mjs test/desktop/support/fixtures-server.js
git commit -m "Quiet Tabs: prove quieting releases a renderer process (F31-10)"
```

---

### Task 213B: `asleep` reaches the chrome, and `serializedTabsPayload` reaches the tests

> **Why this task exists.** Three phases each assumed a *different* phase added
> `asleep` to `serializeTabs`' allowlist, and the answer was nobody. Without this
> task every Phase 3 affordance is a permanent no-op — `tab.asleep` is `undefined`
> in both renderers — and nothing fails at write time. Phase 1 deliberately ships
> the allowlist with 16 fields because Phase 1 has no sleep code; this is where the
> 17th is added.

**Files:**
- Modify: `src/main/main.js` (inside `serializeTabs`' projection)
- Modify: `src/main/test-hook.js`
- Test: `test/unit/tab-sleep-snapshot-isolation.test.js`

**Interfaces:**
- Consumes: `serializeTabs`' explicit allowlist and `EXPECTED_KEYS` (Phase 1 Task 107); `tab.asleep` (Task 203)
- Produces: `asleep` on every `tabs:updated` row — consumed by Phase 3 Tasks 301–307; `serializedTabsPayload()` on the test hook — consumed by acceptance `@F31-9`

- [ ] **Step 1: Extend the isolation test to demand the key**

In `test/unit/tab-sleep-snapshot-isolation.test.js`, change the `EXPECTED_KEYS` line

```js
  'groupId', 'pageBg', 'themeColor',
```

to

```js
  'groupId', 'pageBg', 'themeColor', 'asleep',
```

and add `asleep: false,` to the `record()` factory so the fixture has the field.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/unit/tab-sleep-snapshot-isolation.test.js`
Expected: FAIL — an `AssertionError` from `assert.deepEqual(Object.keys(row).sort(), EXPECTED_KEYS)` showing `asleep` present in expected and absent in actual.

- [ ] **Step 3: Add the one field to the allowlist**

In `src/main/main.js`, inside `serializeTabs`' projection, immediately after
`themeColor: tab.themeColor,`:

```js
        // The ONE Quiet Tabs field the chrome may see. sleeping/waking/
        // wakeGeneration/lastActiveAt/adopted/openerTabId/usedMedia/
        // restorableCommit/deepScrolled/httpEntryCount stay main-process-only,
        // and the snapshot never lives on the record at all (design §3.1).
        asleep: tab.asleep,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && node --test test/unit/tab-sleep-snapshot-isolation.test.js`
Expected: PASS.

- [ ] **Step 5: Add the `serializedTabsPayload` test hook**

Design §12 requires it and no phase produced it; acceptance `@F31-9` ("no page
state in session.json, the sync snapshot, or `tabs:updated`") cannot be written
without it. It lands here rather than in Phase 4 because Task 212 has just
rewritten the test-hook wiring and these anchors are current.

In `src/main/main.js`, in the `require('./test-hook').install({ … })` call, beside
the other refs:

```js
      serializedTabsPayload: () => JSON.parse(JSON.stringify(serializeTabs())),
```

In `src/main/test-hook.js`, add `serializedTabsPayload,` to the `refs` destructure
and the method to the exposed surface:

```js
    serializedTabsPayload() { return serializedTabsPayload(); },
```

The `JSON.parse(JSON.stringify(...))` round-trip is deliberate: it proves the
payload is structured-cloneable and strips anything non-serializable, which is
exactly the property `@F31-9` asserts.

- [ ] **Step 6: Verify the hook is reachable**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && grep -n "serializedTabsPayload" src/main/main.js src/main/test-hook.js`
Expected: two lines in `main.js` (the ref) and two in `test-hook.js` (the destructure and the method).

- [ ] **Step 7: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/main.js src/main/test-hook.js test/unit/tab-sleep-snapshot-isolation.test.js
git commit -m "Expose asleep to the chrome and serializedTabsPayload to the tests"
```

---

### Task 214: Phase 2 verification gate

**Files:**
- Modify: none (verification only)
- Test: the whole suite

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Run the unit suite**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:unit`

Expected: PASS, including `test/unit/tab-sleep.test.js`.

- [ ] **Step 2: Run the substrate guards**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run substrate:check`

Expected: PASS. Phase 2 adds no token, settings-enum, or slash-command copy, so this must be green
without any `*:build` run. If `settings:check` fails, you added a settings key that belongs to a
later phase — back it out.

- [ ] **Step 3: Run the acceptance dry run**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npm run test:acceptance:dry`

Expected: PASS — every tag in `RUNNABLE`, including `@F31-10`, resolves to step definitions.

- [ ] **Step 4: Run the full desktop acceptance suite**

Run: `cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable`

Expected: PASS. The suite is configured with `retry: 1` and has three known intermittent failures
unrelated to this work; a scenario that fails **both** attempts is a real regression from this
phase.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git commit --allow-empty -m "Quiet Tabs phase 2 verified: unit, substrate, acceptance green"
```

---

## Phase 3: The chrome surfaces

At the end of this phase a tab whose `asleep` field is `true` is *visible as quiet* in all four chrome surfaces — the pill dot cluster, the ⌘L panel row, the vertical tab rail, and the Quick Switcher — with a real accessible name ("quiet", never "asleep"), and a quiet row keeps its https/http connection claim instead of degrading to "no claim". Verify with `npm run test:unit` (a new `test/unit/quiet-tabs-chrome.test.js` plus the extended `@F28-7` acceptance scenario), `npm run substrate:check`, and a manual `npm start` — the chrome documents load once at window creation, so `Cmd+R` will *not* show these changes.

---

## Before you start — read this

**Working directory for every command in this plan:**
`/Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a`

**`node_modules` is not installed in this worktree.** Unit tests (`node --test`) run
without it, but Cucumber does not. Create a symlink once, at the start:

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
ln -sfn /Users/anthony/Projects/Blanc/node_modules node_modules
```

The repo's ignore rule is `node_modules/` (directory-only), so a *symlink* shows up
as untracked in `git status`. **Never `git add` it.** Every `git add` in this plan
names explicit paths for exactly that reason.

**What this codebase is, in one paragraph.** Blanc is an Electron browser. One
native window draws the "chrome" (the floating command pill at the top, called the
*Island*, and optionally a vertical tab rail down the left side); each web page is a
separate child view. The main process (`src/main/main.js`) owns all tab state and
broadcasts a serialized array of tab records to the chrome documents ~10×/second.
The chrome documents are plain browser-context JS files — `src/renderer/renderer.js`
(the pill strip), `src/renderer/overlay.js` (the expanded panel + Quick Switcher),
`src/renderer/vertical-tabs.js` (the rail) — sharing one stylesheet,
`src/renderer/styles.css`. They are IIFEs, not CommonJS modules, so they cannot be
`require()`d in a unit test; the house technique is to read the file as text and
either regex-assert on the source or lift one function into a `node:vm` sandbox and
run it. Both techniques already exist in this repo
(`test/unit/tab-layout-settings.test.js`, `test/unit/settings-fanout-reload.test.js`).

**What phases 1 and 2 already landed, that this phase consumes:**

- `tab.asleep` — a boolean on every tab record, `false` by default, `true` while the
  tab's renderer has been discarded. Phase 1 put `asleep` in `serializeTabs`'s
  explicit allowlist, so it is already present on every tab object the chrome
  renderers receive.
- `sleepTab(id)` / `wakeTab(id)` in `src/main/main.js`, and `sleepTab(id)` on the
  acceptance test hook (`src/main/test-hook.js`), returning `Promise<boolean>`.
- `state()` on the test hook reports `asleep` per tab.
- `setActiveTab` in main wakes a quiet tab. **This matters for you:** the panel
  row's switch action and the Quick Switcher's row pick both already call
  `window.browserAPI.switchTab(id)`, which funnels into `setActiveTab`. So "picking
  a quiet row wakes it" is already true — **do not add a second wake path from a
  renderer.** There is no renderer-side wake API and there must not be one.

**The vocabulary rule, which is absolute.** The internal field is `asleep`. Every
string a *user or a screen reader* receives says **"quiet"**. The only permitted
appearance of the literal `asleep` in a renderer string is the CSS class fragment
`' asleep'` on the pill dot. Task 304 adds a test that enforces this across all
three renderer files.

**Design authority.** `docs/superpowers/specs/2026-08-09-quiet-tabs-design.md` §8.
Two decisions in it are counter-intuitive and are *not* to be "improved":

1. **Quiet is expressed by SIZE, not opacity.** Opacity on the pill dot is already
   spoken for — `.island-dot.loading` animates opacity via the `island-pulse`
   keyframes, and a `prefers-reduced-motion` block kills that animation outright.
   There is also no contrast headroom: an idle dot is `--border` on
   `--surface-raised`, about 1.3:1. The approved design originally said "reduced
   opacity"; it was changed after approval, on evidence.
2. **Private dots get no quiet treatment at all.** A private dot is already hollow.
   Stacking the two treatments would make "private" and "quiet" the same shape.

---

### Task 301: Both re-render signature gates carry `asleep`

Each chrome renderer skips rebuilding its DOM when a hand-written "signature" string
is unchanged since the last broadcast. Those signatures are literal field lists. A
field that is not in the list is **invisible** — the tab data changes, the signature
does not, and the DOM is never rebuilt. So until these two functions are edited,
every other task in this phase is a silent no-op at runtime.

**Files:**
- Create: `test/unit/quiet-tabs-chrome.test.js`
- Modify: `src/renderer/renderer.js:344-360` (`dotsSignature`)
- Modify: `src/renderer/vertical-tabs.js:57-68` (`railSignature`)
- Test: `test/unit/quiet-tabs-chrome.test.js`

**Interfaces:**
- Consumes: `tab.asleep` (boolean) on every serialized tab record — landed in phases 1–2.
- Produces: nothing other tasks import. Tasks 302–306 depend on these two gates
  behaviourally (their DOM will not update without them), not by symbol.

---

- [ ] **Step 1: Write the failing test**

This test lifts the two real functions out of the shipping source with a regex and
runs them in a `node:vm` sandbox, so it can only pass if the *shipped* source
changed — a copy of the logic in the test would prove nothing. What it pins down:
two tab payloads that differ **only** in `asleep` must produce different signature
strings. That is precisely the property that makes the rest of the phase visible.

Create `test/unit/quiet-tabs-chrome.test.js`:

```js
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '../..');
const rendererSource = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');
const overlaySource = fs.readFileSync(path.join(ROOT, 'src/renderer/overlay.js'), 'utf8');
const railSource = fs.readFileSync(path.join(ROOT, 'src/renderer/vertical-tabs.js'), 'utf8');
const styles = fs.readFileSync(path.join(ROOT, 'src/renderer/styles.css'), 'utf8');

// ---------------------------------------------------------------------------
// The two re-render gates.
//
// Each renderer rebuilds its rows only when a hand-written signature string
// changes. The field lists inside them are the whole mechanism: a field that
// is not listed cannot ever trigger a redraw. Lift the REAL functions (same
// approach as test/unit/settings-fanout-reload.test.js) rather than copying
// them, so this test fails when the shipped source is missing `asleep`.
// ---------------------------------------------------------------------------

const dotsSource = rendererSource.match(/function dotsSignature\(\) \{[\s\S]*?\n  \}/)?.[0];
const railSigSource = railSource.match(/function railSignature\(payload\) \{[\s\S]*?\n  \}/)?.[0];

test('both re-render signature gates could be lifted from source', () => {
  assert.ok(dotsSource, 'dotsSignature not found in renderer.js — update this test with it');
  assert.ok(railSigSource, 'railSignature not found in vertical-tabs.js — update this test with it');
});

/** Run the real dotsSignature with a stubbed dot-cluster source. */
function runDotsSignature(shown) {
  const sandbox = {
    state: { activeTabId: 'active-tab' },
    activeGroupMembers: () => ({ shown, hidden: 0 }),
  };
  vm.runInNewContext(`${dotsSource}\nthis.__fn = dotsSignature;`, sandbox);
  return sandbox.__fn();
}

/** Run the real railSignature; it is already pure on its argument. */
function runRailSignature(payload) {
  const sandbox = {};
  vm.runInNewContext(`${railSigSource}\nthis.__fn = railSignature;`, sandbox);
  return sandbox.__fn(payload);
}

const BACKGROUND_TAB = {
  id: 'background-tab',
  title: 'Docs',
  url: 'https://example.com/',
  favicon: null,
  isLoading: false,
  private: false,
  pinned: false,
  muted: false,
  audible: false,
  groupId: null,
  asleep: false,
};

test('the pill dot gate reacts to a tab going quiet', () => {
  const awake = runDotsSignature([{ ...BACKGROUND_TAB }]);
  const quiet = runDotsSignature([{ ...BACKGROUND_TAB, asleep: true }]);
  assert.notEqual(awake, quiet, 'dotsSignature must list asleep, or the dot row never redraws');
});

test('the rail gate reacts to a tab going quiet', () => {
  const payload = { activeTabId: 'active-tab', groups: [], tabs: [{ ...BACKGROUND_TAB }] };
  const awake = runRailSignature(payload);
  const quiet = runRailSignature({ ...payload, tabs: [{ ...BACKGROUND_TAB, asleep: true }] });
  assert.notEqual(awake, quiet, 'railSignature must list asleep, or the rail row never redraws');
});
```

Ignore the four unused `const`s at the top (`overlaySource`, `styles`, …) for now —
later tasks in this phase append tests to this same file and use them.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: FAIL — two failures, with messages
`dotsSignature must list asleep, or the dot row never redraws` and
`railSignature must list asleep, or the rail row never redraws`
(reported by node's test runner as `AssertionError [ERR_ASSERTION]`). The first
test, "both re-render signature gates could be lifted from source", must PASS —
if it fails instead, the regexes no longer match the source and you should fix
the regex before going further.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/renderer.js`, inside `dotsSignature()`, add one line to the
per-tab object (after `private: t.private,`):

```js
      shown: shown.map((t) => ({
        id: t.id,
        active: t.id === state.activeTabId,
        loading: t.isLoading,
        private: t.private,
        asleep: t.asleep,
```

In `src/renderer/vertical-tabs.js`, inside `railSignature(payload)`, add one line to
the per-tab object (after `audible: tab.audible,`):

```js
        muted: tab.muted,
        audible: tab.audible,
        asleep: tab.asleep,
        groupId: tab.groupId ?? null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: PASS — 3 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/renderer/renderer.js src/renderer/vertical-tabs.js test/unit/quiet-tabs-chrome.test.js
git commit -m "Let both chrome re-render gates see a tab go quiet

dotsSignature and railSignature are hand-written field lists; a field
missing from them can never trigger a redraw, so every quiet affordance
would have been a silent no-op at runtime."
```

---

### Task 302: The pill dot — a smaller core, never on a private dot

The Island pill shows the active group's tabs as a row of 6px dots. A quiet dot
becomes a hollow 6px slot holding a 3.5px core, so the row's 10px flex gap never
reflows and the dot never borrows the loading pulse's opacity.

**Files:**
- Modify: `src/renderer/styles.css:812` (insert after the `.island-dot.loading` line, before the `/* Private tab dots are hollow. */` comment on line 813)
- Modify: `src/renderer/renderer.js:366-387` (`tabDot`)
- Test: `test/unit/quiet-tabs-chrome.test.js` (append)

**Interfaces:**
- Consumes: `tab.asleep`; the existing `.island-dot`, `.island-dot.private`,
  `.island-dot.loading` rules; `.island-dot::before` (already taken by the
  invisible hit halo — the quiet core must therefore use `::after`).
- Produces: CSS classes `.island-dot.asleep`; the aria-label suffix `, quiet` on a
  quiet dot.

---

- [ ] **Step 1: Write the failing test**

What this pins down: the treatment is *size*, delivered through `::after` (because
`::before` is the hit halo), and it is scoped away from private dots. The
`doesNotMatch` assertions are the load-bearing half — they are what stops a future
edit quietly reintroducing opacity or a new theme token.

Append to `test/unit/quiet-tabs-chrome.test.js`:

```js
// ---------------------------------------------------------------------------
// Pill dot (renderer.js tabDot + styles.css .island-dot)
// ---------------------------------------------------------------------------

test('a quiet pill dot shrinks to a core, borrowing neither opacity nor the private treatment', () => {
  // Size, not opacity: .island-dot.loading already animates opacity via
  // island-pulse, and prefers-reduced-motion kills that animation outright.
  assert.match(styles, /\.island-dot\.asleep:not\(\.private\)\s*\{[^}]*background: transparent;/s);
  assert.match(styles, /\.island-dot\.asleep:not\(\.private\)::after\s*\{[^}]*inset: 1\.25px;/s);
  assert.match(styles, /\.island-dot\.asleep:not\(\.private\)::after\s*\{[^}]*background: var\(--border\);/s);
  // ::before is the invisible hit halo (styles.css) — the core must not steal it.
  assert.doesNotMatch(styles, /\.island-dot\.asleep[^{]*::before/);
  // No opacity in any quiet-dot rule, and no new :root custom property (a new
  // token would need a light/dark/private triple and would fail tokens:check).
  assert.doesNotMatch(styles, /\.island-dot\.asleep[^{]*\{[^}]*opacity/s);
  assert.doesNotMatch(styles, /--sleep-dim/);
});

test('the pill dot marks quiet in its class and in its accessible name', () => {
  assert.match(rendererSource, /\(t\.asleep \? ' asleep' : ''\)/);
  // The dot has no text content at all, so without this the state is conveyed
  // by shape alone.
  assert.match(
    rendererSource,
    /aria-label',\s*`Switch to \$\{t\.title \|\| 'New Tab'\}\$\{t\.asleep \? ', quiet' : ''\}`/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: FAIL — two new failures. The first reports
`The input did not match the regular expression /\.island-dot\.asleep:not\(\.private\)\s*\{[^}]*background: transparent;/s`;
the second the same for `/\(t\.asleep \? ' asleep' : ''\)/`. The three tests from
Task 301 must still pass.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/styles.css`, insert directly after the line
`.island-dot.loading { animation: island-pulse 0.9s ease-in-out infinite; }`
(currently line 812) and before the comment `/* Private tab dots are hollow. */`:

```css
/* Quiet tabs read by SIZE, never opacity: .island-dot.loading already owns
   opacity through island-pulse, prefers-reduced-motion kills that animation
   outright, and an idle dot (--border on --surface-raised, ~1.3:1) has no
   contrast headroom to spend. The core sits inside the same 6px slot, so the
   10px flex gap between dots never reflows. ::before is the hit halo above,
   so the core takes ::after. Private dots are excluded outright — they are
   already hollow, and stacking the treatments would make "private" and
   "quiet" the same shape. */
.island-dot.asleep:not(.private) {
  background: transparent;
}
.island-dot.asleep:not(.private)::after {
  content: '';
  position: absolute;
  inset: 1.25px;
  border-radius: inherit;
  background: var(--border);
}
```

In `src/renderer/renderer.js`, replace the opening of `tabDot(t)` (currently lines
367–374) with:

```js
    const dot = document.createElement('button');
    dot.className =
      'island-dot' +
      (t.id === state.activeTabId ? ' active' : '') +
      (t.isLoading ? ' loading' : '') +
      (t.private ? ' private' : '') +
      (t.asleep ? ' asleep' : '');
    dot.title = t.title || 'New Tab';
    // A dot has no text, so its accessible name is the only place the quiet
    // state can be conveyed to a screen reader. "quiet" — never "asleep".
    dot.setAttribute('aria-label', `Switch to ${t.title || 'New Tab'}${t.asleep ? ', quiet' : ''}`);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/quiet-tabs-chrome.test.js && npm run tokens:check`

Expected: PASS — 5 tests pass, 0 fail, then `tokens:check` exits 0 (the quiet
treatment deliberately adds no `:root` custom property, so the token substrate is
untouched).

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/renderer/styles.css src/renderer/renderer.js test/unit/quiet-tabs-chrome.test.js
git commit -m "Show a quiet tab in the pill as a smaller dot core

Size, not opacity: the loading pulse already owns opacity and reduced
motion removes it. Private dots keep their hollow treatment untouched."
```

---

### Task 303: Restructure the panel row — a labelled group with a real primary button

This task adds **no quiet behaviour at all**. It fixes the structure that quiet
depends on. Today a ⌘L panel tab row is a bare `<div>` with a click listener and no
role, tabindex, or aria — so its visible text is not an accessible name. It already
contains four real `<button>` children (pin, mute, group, close), which is why
`role="option"` and `role="button"` are both illegal on the row: those roles take
*presentational* children and would hide all four buttons from assistive technology.
The fix is the structure the row should have had regardless: the row becomes a
labelled `role="group"`, the switch action moves into its own `.row-primary` button
holding the favicon and title, and pin/mute/group/close stay its **siblings**.

**Files:**
- Modify: `src/renderer/overlay.js:236-380` (`tabRow`)
- Modify: `src/renderer/styles.css:1271` (insert a `.row-primary` rule before `.island-row .row-title`) and `src/renderer/styles.css:1460-1463` (correct a comment that this change makes false)
- Test: `test/unit/quiet-tabs-chrome.test.js` (append)

**Interfaces:**
- Consumes: `tabDomain(tab)` (already defined in `overlay.js`, returns a bare host
  such as `example.com`, or `''` for a blank new tab);
  `window.browserAPI.switchTab(id)` and `window.browserAPI.closeOverlay()`.
- Produces: CSS class `.row-primary`; a `<button class="row-primary">` inside every
  panel tab row; `role="group"` + `aria-label` on the row. Task 304 appends the
  quiet tag and the `, quiet` name fragment to exactly this structure.

---

- [ ] **Step 1: Write the failing test**

What this pins down: the row is a *group*, never an option/button; the switch action
is its own focusable control; and the four existing action buttons are still
appended to the **row**, not swallowed into the primary button. The
`row.append(pin|mute|grp|close)` assertions are regression guards — the whole point
of the restructure is that they stay siblings.

Append to `test/unit/quiet-tabs-chrome.test.js`:

```js
// ---------------------------------------------------------------------------
// Panel row (overlay.js tabRow)
// ---------------------------------------------------------------------------

const panelRowSource = overlaySource.match(/function tabRow\(tab\) \{[\s\S]*?\n  \}/)?.[0];

test('the panel tabRow could be lifted from source', () => {
  assert.ok(panelRowSource, 'tabRow not found in overlay.js — update this test with it');
});

test('a panel tab row is a labelled group whose switch action is a button beside the other four', () => {
  assert.match(panelRowSource, /row\.setAttribute\('role', 'group'\)/);
  assert.match(panelRowSource, /row\.setAttribute\('aria-label', label\)/);
  // role=option and role=button both take presentational children, so either
  // would illegally nest — and hide — pin / mute / group / close.
  assert.doesNotMatch(panelRowSource, /'role', '(option|button)'/);

  assert.match(panelRowSource, /primary\.className = 'row-primary'/);
  assert.match(panelRowSource, /primary\.append\(faviconWrap, title\)/);
  assert.match(panelRowSource, /primary\.setAttribute\(\s*'aria-label', `Switch to \$\{parts\.join\(', '\)\}`/);

  // Siblings, not descendants.
  assert.match(panelRowSource, /row\.append\(primary\)/);
  assert.match(panelRowSource, /row\.append\(pin\)/);
  assert.match(panelRowSource, /row\.append\(mute\)/);
  assert.match(panelRowSource, /row\.append\(grp\)/);
  assert.match(panelRowSource, /row\.append\(close\)/);

  // The row's own padding stays clickable, but must not double-fire through
  // the primary button that now covers most of it.
  assert.match(panelRowSource, /if \(e\.target\.closest\('button'\)\) return;/);
});

test('the row primary button carries the row layout and does not re-reset the button element', () => {
  assert.match(styles, /\.island-row \.row-primary\s*\{[^}]*display: flex;/s);
  assert.match(styles, /\.island-row \.row-primary\s*\{[^}]*flex: 1 1 auto;/s);
  assert.match(styles, /\.island-row \.row-primary\s*\{[^}]*min-width: 0;/s);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: FAIL — the test named
`a panel tab row is a labelled group whose switch action is a button beside the other four`
fails first, reporting
`The input did not match the regular expression /row\.setAttribute\('role', 'group'\)/`.
The test `the panel tabRow could be lifted from source` must PASS.

- [ ] **Step 3: Write minimal implementation**

**3a — `src/renderer/overlay.js`.** Replace the block from
`function tabRow(tab) {` through `row.append(faviconWrap, title);` (currently lines
236–260) with:

```js
  function tabRow(tab) {
    const row = document.createElement('div');
    // .tab-row scopes the at-rest quieting (metadata joins the hover/focus
    // reveal) to list rows — Quick-Switcher/command rows keep their subs.
    row.className = 'island-row tab-row' + (tab.id === state.activeTabId ? ' active' : '');
    row.dataset.tabId = tab.id;
    // A bare <div> is not an accessible element, so its visible text never
    // becomes an accessible name. It cannot become the control either: it
    // already holds four real <button> children, and role="option"/"button"
    // both take PRESENTATIONAL children — either would nest interactive
    // controls illegally and hide pin/mute/group/close from assistive tech.
    // So: a labelled group, with a dedicated primary button carrying the
    // switch action and the name, and the four actions as its siblings.
    row.setAttribute('role', 'group');

    const faviconWrap = document.createElement('span');
    faviconWrap.className = 'row-favicon-wrap';
    const favicon = document.createElement('span');
    setFavicon(favicon, tab);
    faviconWrap.append(favicon);
    if (tab.muted) {
      const muteBadge = document.createElement('span');
      muteBadge.className = 'row-mute-badge';
      muteBadge.innerHTML = ICONS.mute;
      faviconWrap.append(muteBadge);
    }

    const label = tab.isLoading ? 'Loading…' : tab.title || 'New Tab';
    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = label;
    if (tab.title) title.title = tab.title;
    row.setAttribute('aria-label', label);

    const primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'row-primary';
    // tabDomain() is '' for a blank new tab; filter rather than emit ", ,".
    const parts = [label, tabDomain(tab)].filter(Boolean);
    primary.setAttribute('aria-label', `Switch to ${parts.join(', ')}`);
    primary.append(faviconWrap, title);
    row.append(primary);
```

Then replace the row's own click handler (currently lines 371–374) with:

```js
    primary.addEventListener('click', () => {
      window.browserAPI.switchTab(tab.id);
      window.browserAPI.closeOverlay();
    });

    // The row's padding is still a switch target, but every button inside it
    // handles its own click — without this guard, a click on the primary
    // would bubble here and switch twice.
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      window.browserAPI.switchTab(tab.id);
      window.browserAPI.closeOverlay();
    });
```

Leave `row.addEventListener('auxclick', …)` (middle-click closes) exactly as it is —
it belongs on the row.

**3b — `src/renderer/styles.css`.** Insert directly before `.island-row .row-title {`
(currently line 1271):

```css
/* The switch action is a real <button> so the row can carry an accessible
   name without swallowing pin/mute/group/close (see overlay.js tabRow). It
   inherits the global button reset near the top of this file; these are only
   the row-layout properties it needs to behave as the row's stretchy middle. */
.island-row .row-primary {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  text-align: left;
}
```

And correct the now-false comment above `.row-mute-badge svg` (currently lines
1460–1463) — the badge span now sits *inside* `.row-primary`, which is a button:

```css
/* .row-mute-badge's svg now sits inside .row-primary (a <button>), so the
   global `button svg { fill: none; stroke: currentColor; ... }` rule does
   reach it — but only weakly. This class-scoped rule outranks it and is what
   actually sizes and strokes the badge; without it the icon renders as a
   filled black shape at 16px. */
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: PASS — 8 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/renderer/overlay.js src/renderer/styles.css test/unit/quiet-tabs-chrome.test.js
git commit -m "Give each panel tab row a real accessible name

The row is now a labelled group with a dedicated primary button for the
switch action; pin, mute, group and close stay its siblings. role=option
and role=button both take presentational children and would have hidden
those four buttons from assistive technology."
```

---

### Task 304: The panel row says "quiet"

Adds the visible tag and the accessible-name fragment onto the structure Task 303
built, plus the guard that keeps the internal word `asleep` out of every user-facing
string in the chrome.

**Files:**
- Modify: `src/renderer/overlay.js` (inside `tabRow`, immediately after the existing `if (tab.private) { … }` block, and in the `parts` array added by Task 303)
- Modify: `src/renderer/styles.css:1558-1566` (add `.island-row .row-quiet` beside `.island-row .row-private`)
- Test: `test/unit/quiet-tabs-chrome.test.js` (append)

**Interfaces:**
- Consumes: `tab.asleep`; `.row-primary` and the `parts` array from Task 303;
  the existing `.island-row .row-private` rule as the visual model.
- Produces: CSS class `.row-quiet`; the user-visible string `quiet`; the accessible
  name `Switch to <title>, <host>, quiet`.

---

- [ ] **Step 1: Write the failing test**

Two things are pinned here. First, the tag is styled off `.row-private`, **not**
`.row-tag` — `.row-tag` is hover-only inside `.tab-row`, and a state you can only
see by hovering is not a state you can see. Second, the vocabulary guard: it scans
every quoted literal in all three renderer files for the word `asleep` and allows
exactly one exception, the CSS class fragment `' asleep'` on the pill dot.

Append to `test/unit/quiet-tabs-chrome.test.js`:

```js
test('a quiet panel row is tagged "quiet" and named "quiet"', () => {
  assert.match(panelRowSource, /quiet\.className = 'row-quiet'/);
  assert.match(panelRowSource, /quiet\.textContent = 'quiet'/);
  assert.match(panelRowSource, /row\.append\(quiet\)/);
  assert.match(panelRowSource, /tab\.asleep \? 'quiet' : ''/);

  // Modelled on .row-private (always visible), never on .row-tag — which is
  // opacity:0 until hover/focus inside .tab-row.
  assert.match(styles, /\.island-row \.row-quiet\s*\{[^}]*color: var\(--text-dim\);/s);
  assert.match(styles, /\.island-row \.row-quiet\s*\{[^}]*border: 1px solid var\(--border\);/s);
  assert.doesNotMatch(styles, /\.island-row\.tab-row \.row-quiet/);
});

test('no chrome surface ever says "asleep" to a user or a screen reader', () => {
  // The field is `asleep`; every string a person receives says "quiet". The
  // single permitted literal is the pill dot's CSS class fragment.
  const ALLOWED = new Set([`' asleep'`]);
  for (const [name, source] of [
    ['renderer.js', rendererSource],
    ['overlay.js', overlaySource],
    ['vertical-tabs.js', railSource],
  ]) {
    // A template interpolation is CODE, not string content — `${t.asleep ?
    // ', quiet' : ''}` reads the field without ever showing it to anyone.
    // Strip interpolations before scanning, or this guard fires on the pill
    // dot's own accessible name.
    const prose = source.replace(/\$\{[^{}]*\}/g, '');
    const literals = prose.match(
      /'[^'\n]*asleep[^'\n]*'|`[^`\n]*asleep[^`\n]*`|"[^"\n]*asleep[^"\n]*"/g
    ) ?? [];
    assert.deepEqual(
      literals.filter((literal) => !ALLOWED.has(literal)),
      [],
      `${name} must not put "asleep" into a string`
    );
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: FAIL — one new failure, `a quiet panel row is tagged "quiet" and named "quiet"`,
reporting `The input did not match the regular expression /quiet\.className = 'row-quiet'/`.
The vocabulary-guard test should already PASS (nothing says "asleep" yet); it is
there to keep passing.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/overlay.js`, inside `tabRow`, add immediately after the existing
`if (tab.private) { … }` block:

```js
    // Quiet is a state tag beside "private", not a .row-tag: .row-tag is
    // opacity:0 until hover inside .tab-row, and a state you can only see by
    // hovering is not a state you can see.
    if (tab.asleep) {
      const quiet = document.createElement('span');
      quiet.className = 'row-quiet';
      quiet.textContent = 'quiet';
      row.append(quiet);
    }
```

And extend the `parts` array added by Task 303 (a few lines above, just before
`primary.setAttribute('aria-label', …)`):

```js
    // tabDomain() is '' for a blank new tab; filter rather than emit ", ,".
    // "quiet" — never "asleep"; asleep is the internal field name only.
    const parts = [label, tabDomain(tab), tab.asleep ? 'quiet' : ''].filter(Boolean);
    primary.setAttribute('aria-label', `Switch to ${parts.join(', ')}`);
```

In `src/renderer/styles.css`, add directly after the `.island-row .row-private { … }`
block (currently ending line 1566):

```css
/* "quiet" tag on a quiet tab in the switcher list. Same pill as .row-private
   and, like it, visible at rest — .row-tag is hover-only inside .tab-row. */
.island-row .row-quiet {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 6px;
  flex: 0 0 auto;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: PASS — 10 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/renderer/overlay.js src/renderer/styles.css test/unit/quiet-tabs-chrome.test.js
git commit -m "Mark a quiet tab in the island panel

A visible \"quiet\" tag beside \"private\", and the same word in the row's
accessible name. A guard keeps the internal field name out of every
string the chrome shows."
```

---

### Task 305: The rail — quiet class, dimmed favicon, named state, marker

The vertical tab rail (left sidebar) renders one row per tab. A quiet row dims its
**favicon** — not its title, because `.loading` already dims the title and the title
span is `aria-hidden="true"` with the favicon as the primary visual scan target.

**Files:**
- Modify: `src/renderer/vertical-tabs.js:17-23` (`ICONS`), `:340-344` (row className), `:355-361` (`states`), `:388-395` (markers)
- Modify: `src/renderer/styles.css:557` (insert the quiet rules after the `.vertical-tab-audio.muted` block, before `.vertical-tab-close`)
- Test: `test/unit/quiet-tabs-chrome.test.js` (append)

**Interfaces:**
- Consumes: `tab.asleep`; `makeMarker(className, html, label)` — already defined in
  `vertical-tabs.js`, it sets `title = label` and `aria-hidden="true"`; the existing
  `.vertical-tab-state` / `.vertical-tab-state svg` rules.
- Produces: CSS classes `.vertical-tab-row.quiet` and `.vertical-tab-quiet`;
  `ICONS.quiet`; the aria-label fragment `, quiet`; the marker tooltip `Quiet`.
  Task 308's acceptance step asserts all of these by selector.

---

- [ ] **Step 1: Write the failing test**

Note the deliberate `doesNotMatch` on a title rule: dimming the title is the obvious
wrong move (it duplicates `.loading` and dims text nobody reads, since the span is
`aria-hidden`).

Append to `test/unit/quiet-tabs-chrome.test.js`:

```js
// ---------------------------------------------------------------------------
// Rail row (vertical-tabs.js tabRow)
// ---------------------------------------------------------------------------

const railRowSource = railSource.match(
  /function tabRow\(tab, bucketTabs, activeTabId\) \{[\s\S]*?\n  \}/
)?.[0];

test('the rail tabRow could be lifted from source', () => {
  assert.ok(railRowSource, 'tabRow not found in vertical-tabs.js — update this test with it');
});

test('a quiet rail row is classed, named, and marked — and dims the favicon, not the title', () => {
  assert.match(railRowSource, /\(tab\.asleep \? ' quiet' : ''\)/);
  // The field is `asleep`; the string in the accessible name is 'quiet'.
  assert.match(railRowSource, /tab\.asleep && 'quiet'/);
  assert.match(
    railRowSource,
    /makeMarker\('vertical-tab-state vertical-tab-quiet', ICONS\.quiet, 'Quiet'\)/
  );
  assert.match(railSource, /quiet: '<svg viewBox="0 0 16 16" aria-hidden="true">/);

  assert.match(styles, /\.vertical-tab-row\.quiet \.vertical-tab-favicon\s*\{[^}]*opacity: \.45;/s);
  // Not the title: .vertical-tab-row.loading already dims it, and the title
  // span is aria-hidden — the favicon is the primary scan target.
  assert.doesNotMatch(styles, /\.vertical-tab-row\.quiet \.vertical-tab-title\s*\{/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: FAIL — one new failure,
`a quiet rail row is classed, named, and marked — and dims the favicon, not the title`,
reporting `The input did not match the regular expression /\(tab\.asleep \? ' quiet' : ''\)/`.

- [ ] **Step 3: Write minimal implementation**

**3a — `src/renderer/vertical-tabs.js`.** Add a `quiet` entry to `ICONS`, after the
`muted:` line (currently line 21). The outer ring inherits `fill: none` from
`.vertical-tab-state svg`; the inner core carries its own `fill`/`stroke`
presentation attributes, which beat the inherited value. It deliberately echoes the
pill dot's "hollow slot, small core", and is not a moon or a "Zzz" — the word
throughout is *quiet*, not *asleep*:

```js
    quiet: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.25"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/></svg>',
```

Append one term to the row className (currently lines 340–344):

```js
    row.className =
      'vertical-tab-row' +
      (active ? ' active' : '') +
      (tab.private ? ' private' : '') +
      (tab.isLoading ? ' loading' : '') +
      (tab.asleep ? ' quiet' : '');
```

Add one entry to the `states` array (currently lines 355–361), which is joined into
the primary button's aria-label:

```js
    const states = [
      active && 'active',
      tab.private && 'private',
      tab.pinned && 'pinned',
      tab.isLoading && 'loading',
      tab.asleep && 'quiet',
      tab.muted ? 'muted' : tab.audible && 'playing audio',
    ].filter(Boolean);
```

Add the marker after the audio markers (currently after line 395, immediately before
`const close = document.createElement('button');`):

```js
    if (tab.asleep) {
      primary.appendChild(makeMarker('vertical-tab-state vertical-tab-quiet', ICONS.quiet, 'Quiet'));
    }
```

**3b — `src/renderer/styles.css`.** Insert after the `.vertical-tab-audio.muted { … }`
block (currently ending line 557) and before `.vertical-tab-close {`:

```css
/* A quiet row dims its FAVICON, not its title: .vertical-tab-row.loading
   already dims the title, and the title span is aria-hidden — the favicon is
   the primary scan target down the rail. The marker below carries the state
   for anyone who cannot see the dim. */
.vertical-tab-row.quiet .vertical-tab-favicon {
  opacity: .45;
}

.vertical-tab-quiet {
  color: var(--text-dim);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: PASS — 12 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/renderer/vertical-tabs.js src/renderer/styles.css test/unit/quiet-tabs-chrome.test.js
git commit -m "Mark quiet tabs in the vertical rail

Dim the favicon (the title is already dimmed by loading and is
aria-hidden), name the state in the row's accessible label, and add a
marker so the state is not carried by dimming alone."
```

---

### Task 306: The Quick Switcher result says "· quiet"

The Quick Switcher is the ⌘L list you get while typing. Its rows are **not**
`.tab-row`, so their `.row-sub` is visible at rest — which is why quiet belongs in
the sub rather than in a hover-only tag.

**Files:**
- Modify: `src/renderer/overlay.js:673` (the `kind: 'tab'` push inside `switcherResults`)
- Test: `test/unit/quiet-tabs-chrome.test.js` (append)

**Interfaces:**
- Consumes: `tab.asleep`; `tabDomain(t)`.
- Produces: the sub string `<host> · quiet` on a quiet tab result. No new class, no
  new CSS. Picking the row still goes through the existing
  `window.browserAPI.switchTab(result.tab.id)` in `pickResult`, which wakes the tab
  in main — **do not add a wake call here.**

---

- [ ] **Step 1: Write the failing test**

The second assertion is the reason this went in the sub at all: it proves `.row-sub`
is not opacity-gated, so the text is readable without hovering.

Append to `test/unit/quiet-tabs-chrome.test.js`:

```js
// ---------------------------------------------------------------------------
// Quick Switcher (overlay.js switcherResults / resultRow)
// ---------------------------------------------------------------------------

test('a quiet tab result says so in its sub, which switcher rows show at rest', () => {
  assert.match(
    overlaySource,
    /\[tabDomain\(t\), t\.asleep && 'quiet'\]\.filter\(Boolean\)\.join\(' · '\)/
  );
  // Switcher rows are not .tab-row, so .row-sub is not the hover-gated
  // .row-tag — that is precisely why quiet lives in the sub here.
  assert.doesNotMatch(styles, /\.island-row \.row-sub\s*\{[^}]*opacity: 0;/s);
});

test('the switcher does not add a second wake path from the renderer', () => {
  // Picking a tab result goes through switchTab -> main's setActiveTab, which
  // is the single wake choke point. There is no renderer-side wake API.
  assert.doesNotMatch(overlaySource, /wakeTab/);
  assert.match(overlaySource, /result\.kind === 'tab'\) window\.browserAPI\.switchTab\(result\.tab\.id\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: FAIL — one new failure,
`a quiet tab result says so in its sub, which switcher rows show at rest`, reporting
`The input did not match the regular expression /\[tabDomain\(t\), t\.asleep && 'quiet'\]\.filter\(Boolean\)\.join\(' · '\)/`.
The second new test, `the switcher does not add a second wake path from the renderer`,
must PASS immediately.

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/overlay.js`, inside `switcherResults(query)`, replace the local-tab
loop (currently lines 671–674) with:

```js
    for (const t of state.tabs) {
      const s = matchScore(query, matchableText(t.title, t.url));
      // Switcher rows are not .tab-row, so .row-sub is visible at rest —
      // the honest place for the state, unlike the hover-gated .row-tag.
      const sub = [tabDomain(t), t.asleep && 'quiet'].filter(Boolean).join(' · ');
      if (s) results.push({ kind: 'tab', title: t.title || 'New Tab', sub, tab: t, score: s + 0.2 });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: PASS — 14 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/renderer/overlay.js test/unit/quiet-tabs-chrome.test.js
git commit -m "Say \"quiet\" in the Quick Switcher result sub

Switcher rows are not .tab-row, so the sub is visible at rest — unlike
the hover-gated tag used on panel list rows."
```

---

### Task 307: A quiet row keeps its connection claim

The pill and the panel show a small "not secure" badge derived from a single value,
`tab.connection`, computed once in `serializeTabs` in the main process. It is derived
from the URL Chromium has actually *committed* for the tab's view — deliberately, so
a stored URL that has run ahead of a pending navigation cannot make a false security
claim. A quiet tab has **no view**, so that helper returns `null` and the claim
silently disappears from every quiet row.

The fix is a fallback, and only for quiet tabs: a quiet tab has a committed URL *by
construction* (it could not have been quieted otherwise), so `tab.url` is safe there
and nowhere else.

**Files:**
- Modify: `src/main/main.js:1143-1146` (the `connection` derivation inside `serializeTabs`)
- Test: `test/unit/quiet-tabs-chrome.test.js` (append)

**Interfaces:**
- Consumes: `rest.asleep` inside `serializeTabs`; `connectionFor`, `committedUrlOf`
  from `src/main/shield-model.js`.
- Produces: a non-null `connection` on quiet rows. **Do not** change
  `committedUrlOf` to return something other than `null` — its `null` default is
  load-bearing and is asserted by `test/unit/shield-model.test.js`.

---

- [ ] **Step 1: Write the failing test**

This one is behavioural rather than source-matching: it lifts the real
`serializeTabs` out of `main.js` (which cannot be `require`d in a unit test) into a
`node:vm` sandbox with the real `shield-model` helpers, and runs it over three tab
records. It proves an awake tab still reads its claim from the *view*, and a quiet
tab reads it from `tab.url` — including the negative case, `http`.

Append to `test/unit/quiet-tabs-chrome.test.js`:

```js
// ---------------------------------------------------------------------------
// serializeTabs (main.js) — the connection claim on a quiet row
// ---------------------------------------------------------------------------

const { connectionFor, committedUrlOf, shieldChipState } = require('../../src/main/shield-model');
const mainSource = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
const serializeSource = mainSource.match(/function serializeTabs\(\) \{[\s\S]*?\n\}/)?.[0];

test('serializeTabs could be lifted from main.js', () => {
  assert.ok(serializeSource, 'serializeTabs not found in main.js — update this test with it');
});

/** Run the real serializeTabs against a hand-built tab list. If this throws
 *  "X is not defined", main.js gained a collaborator — add it to the sandbox. */
function runSerializeTabs(tabList) {
  const sandbox = {
    settings: { getSettings: () => ({ adblockEnabled: true, adblockExceptions: [] }) },
    rt: () => ({ tabOrder: tabList.map((t) => t.id) }),
    tabs: new Map(tabList.map((t) => [t.id, t])),
    isHostnameExcepted: () => false,
    shieldChipState,
    connectionFor,
    committedUrlOf,
  };
  vm.runInNewContext(`${serializeSource}\nthis.__fn = serializeTabs;`, sandbox);
  return sandbox.__fn();
}

const AWAKE_HTTPS = {
  id: 'a',
  url: 'https://example.com/',
  isLoading: false,
  blockedCount: 0,
  asleep: false,
  view: { webContents: { isDestroyed: () => false, getURL: () => 'https://example.com/' } },
};

test('an awake row still reads its connection claim from the committed view', () => {
  const [row] = runSerializeTabs([{ ...AWAKE_HTTPS }]);
  assert.equal(row.connection, 'https');
});

test('a quiet row falls back to its stored url, which it has by construction', () => {
  const [secure] = runSerializeTabs([
    { ...AWAKE_HTTPS, asleep: true, view: null },
  ]);
  assert.equal(secure.connection, 'https');

  // The negative case matters more: a quiet http row must still warn.
  const [insecure] = runSerializeTabs([
    { ...AWAKE_HTTPS, url: 'http://example.com/', asleep: true, view: null },
  ]);
  assert.equal(insecure.connection, 'http');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/quiet-tabs-chrome.test.js`

Expected: FAIL — one new failure,
`a quiet row falls back to its stored url, which it has by construction`, reporting
`Expected values to be strictly equal: null !== 'https'`. The other two new tests
pass.

- [ ] **Step 3: Write minimal implementation**

In `src/main/main.js`, inside `serializeTabs`, replace the `connection` derivation
(currently lines 1141–1146) with:

```js
      // Derived exactly once, here. The popover, the pill badge, and the panel
      // badge all render this same value, so they cannot disagree.
      // A quiet tab has no view, so committedUrlOf() is null by design — and a
      // quiet tab has a committed URL by construction (it could not have been
      // quieted otherwise), so its stored url is the honest source here. Do
      // NOT "fix" committedUrlOf to a non-null default; its null is what stops
      // a URL that has run ahead of a pending navigation making a false claim.
      const connection = connectionFor({
        url: rest.asleep ? rest.url : committedUrlOf(tab.view),
        isLoading: rest.isLoading,
      });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/quiet-tabs-chrome.test.js && node --test test/unit/shield-model.test.js`

Expected: PASS — 17 tests pass in the first file, and `shield-model.test.js` stays
green (proving `committedUrlOf`'s `null` default was left alone).

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add src/main/main.js test/unit/quiet-tabs-chrome.test.js
git commit -m "Keep the connection claim on a quiet row

committedUrlOf() is null without a view, by design. A quiet tab has a
committed URL by construction, so fall back to its stored url there and
only there."
```

---

### Task 308: Extend the rail's state-and-naming acceptance scenario with quiet

The acceptance suite is Cucumber driving the real Electron app through Playwright.
Scenario `@F28-7` already covers active / loading / private / pinned / audible /
muted rail rows and asserts each has an accessible name that does not rely on colour
alone. Quiet joins that list — the spec assigns this extension to this phase.

**Files:**
- Modify: `spec/acceptance/vertical-tabs.feature:145-155`
- Modify: `test/desktop/steps/vertical-tabs.steps.js:875-896` (the `Given`) and `:945-960` (the literal expected map), plus a new `Then` step
- Test: the scenario itself

**Interfaces:**
- Consumes: `this.call('sleepTab', id)` → `Promise<boolean>` and `asleep` on each tab
  in `this.state()` — both from phase 2's test hook; `openLoadedTab(world, name)`
  and `showRail(world)`, already in this steps file; the rail classes/selectors from
  Task 305 (`.vertical-tab-row.quiet`, `.vertical-tab-quiet`, `title="Quiet"`).
- Produces: nothing later phases consume.

---

- [ ] **Step 1: Write the failing test**

The Gherkin file is the shared, platform-neutral spec; the step definitions bind it
to this desktop app. Write the scenario first, alone — that is what makes this step
fail.

Edit `spec/acceptance/vertical-tabs.feature`, replacing the `@F28-7` scenario
(currently lines 145–155) with:

```gherkin
  @F28-7 @F28 @desktop @D19
  Scenario: Rail rows expose identity, privacy, loading, pin, audio, and quiet states
    Given local tabs cover active, loading, private, pinned, audible, muted, and quiet states
    When the vertical tab rail is shown
    Then every rail row exposes its favicon and title
    And the active row is identified
    And the loading row exposes loading state
    And the private row exposes private state
    And the pinned row exposes pinned state
    And audible and muted rows expose distinct audio states
    And the quiet row exposes quiet state
    And those states have accessible names that do not rely on color alone
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:acceptance:dry`

Expected: FAIL — the dry run reports **2 undefined steps** and exits non-zero:
`Given local tabs cover active, loading, private, pinned, audible, muted, and quiet states`
(the old definition's string no longer matches) and
`And the quiet row exposes quiet state` (no definition at all). Cucumber prints
suggested snippets for both.

- [ ] **Step 3: Write minimal implementation**

Edit `test/desktop/steps/vertical-tabs.steps.js`. Rename the `Given` and add the
quiet fixture — note the ordering: the tab must be created, then the *original* tab
reactivated, and only then quieted, because the active tab can never go quiet:

```js
Given('local tabs cover active, loading, private, pinned, audible, muted, and quiet states', async function () {
  const initial = await this.state();
  const active = initial.activeTabId;
  await this.call('setTabPresentation', active, {
    title: 'Active identity',
    favicon: TEST_FAVICON,
  });

  const loading = await openLoadedTab(this, 'Loading identity');
  await this.call('setTabPresentation', loading, { isLoading: true });

  const privateTab = await openLoadedTab(this, 'Private identity', { private: true });
  const pinned = await openLoadedTab(this, 'Pinned identity');
  await this.call('pinTab', pinned);
  const audible = await openLoadedTab(this, 'Audible identity');
  await this.call('setTabPresentation', audible, { audible: true });
  const muted = await openLoadedTab(this, 'Muted identity');
  await this.call('setTabPresentation', muted, { audible: true, muted: true });
  const quiet = await openLoadedTab(this, 'Quiet identity', { query: '?nostore=1' });
  await this.call('activateTab', active, true);

  // The active tab can never be quiet, so this has to follow the reactivation
  // above. The row keeps rendering from the record — title and favicon are
  // still there once the renderer is gone.
  assert.equal(await this.call('sleepTab', quiet), true, 'the quiet fixture tab must go quiet');
  await this.waitForState((state) =>
    state.tabs.find((candidate) => candidate.id === quiet)?.asleep === true);

  this.stateRows = { active, loading, privateTab, pinned, audible, muted, quiet };
});
```

Add a new `Then` step immediately after the existing
`Then('audible and muted rows expose distinct audio states', …)` block (currently
ending line 943):

```js
Then('the quiet row exposes quiet state', async function () {
  const row = this.railPage.locator(`.vertical-tab-row[data-tab-id="${this.stateRows.quiet}"]`);
  assert.equal(await row.evaluate((element) => element.classList.contains('quiet')), true);
  assert.equal(await row.locator('.vertical-tab-quiet').count(), 1);
  assert.equal(await row.locator('.vertical-tab-quiet').getAttribute('title'), 'Quiet');
  // Quiet is its own treatment, deliberately not the private one.
  assert.equal(await row.evaluate((element) => element.classList.contains('private')), false);
});
```

And extend the literal expected map (currently lines 946–953):

```js
  const expected = new Map([
    [this.stateRows.active, /active/],
    [this.stateRows.loading, /loading/],
    [this.stateRows.privateTab, /private/],
    [this.stateRows.pinned, /pinned/],
    [this.stateRows.audible, /playing audio/],
    [this.stateRows.muted, /muted/],
    [this.stateRows.quiet, /quiet/],
  ]);
```

No production code changes are needed here — the behaviour these steps assert was
implemented in Task 305. If Step 4 fails, the cause is a mismatch between the
selectors below and what Task 305 produced; fix `vertical-tabs.js`/`styles.css` to
match the contract, not the assertions.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:acceptance:dry && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @F28-7`

Expected: PASS — the dry run reports 0 undefined steps, and `@F28-7` reports
`1 scenario (1 passed)`. Note the `runnable` profile sets `retry: 1`; a scenario
that passes only on retry is a flake — rerun it a second time before accepting it.

- [ ] **Step 5: Commit**

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git add spec/acceptance/vertical-tabs.feature test/desktop/steps/vertical-tabs.steps.js
git commit -m "Cover the quiet rail row in the state-and-naming scenario

F28-7 asserts every rail state has an accessible name that does not rely
on color alone; quiet is now one of those states."
```

---

### Task 309: Verify the phase end to end, in the running app

Not TDD-shaped: nothing is written here. This is the verification gate for the whole
phase, and it exists because of a real trap in this codebase — **the chrome
documents load their HTML/CSS exactly once, at window creation.** `Cmd+R` reloads
the *web page* in the active tab, not the chrome. Every change in this phase is
invisible until you fully restart the app, and "I reloaded and saw nothing" has
misled people here before.

**Files:**
- Modify: none.
- Test: the existing suites, plus a manual pass in the running app.

**Interfaces:**
- Consumes: everything Tasks 301–308 produced.
- Produces: nothing.

---

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test:unit`

Expected: PASS — `pass 425` or thereabouts (408 before this phase, plus the 17 new
ones), `fail 0`. Pay particular attention to `shield-model.test.js`,
`tab-layout-settings.test.js`, and `platform-main-menu.test.js` — all three
regex-assert over the same renderer files and stylesheet this phase edited.

- [ ] **Step 2: Run the substrate guards**

Run: `npm run substrate:check`

Expected: PASS — all four sub-checks (`tokens`, `settings`, `copy`, `adblock`) exit
0. This phase deliberately introduced **no** new `:root` custom property, no settings
enum, and no slash command, so nothing here should need regenerating. If
`tokens:check` fails, you added a `:root` variable that the design intentionally
avoids — express quiet with the existing `--border` / `--text-dim` on non-`:root`
selectors instead.

- [ ] **Step 3: Run the acceptance suite**

Run: `npm run test:acceptance:dry && npm run test:acceptance:desktop`

Expected: PASS — the dry run reports 0 undefined steps; the desktop run reports all
scenarios passed. (This suite has known intermittent failures unrelated to this
phase and `retry: 1` masks some of them — if something fails, rerun the single
failing tag before investigating.)

- [ ] **Step 4: Look at it in the running app**

**4a — the awake-tab regression pass.** Run `npm start`, then:

1. Open three or four tabs on ordinary https sites.
2. Press ⌘L to open the panel. Every row should look exactly as before. Click a
   row's favicon or title: it should switch tabs and close the panel **once**, not
   twice (a double-fire is the one real regression risk in Task 303 — you would see
   the panel flicker or a second `switchTab` land).
3. Press Tab repeatedly with the panel open: focus should now land on each row's
   switch action before its pin/mute/group/close buttons, and VoiceOver (⌘F5 on
   macOS) should read `Switch to <title>, <host>`.
4. Middle-click a panel row: it should still close that tab.
5. Turn on the rail (Settings → Appearance → Tab layout → Vertical tabs). Awake rows
   should be unchanged.
6. Watch the pill's dot row as you add and remove tabs — the spacing must not shift.

**4b — see an actual quiet row.** Nothing in the shipping UI can quiet a tab yet:
the `/sleep` command and the settings row are phase 5, and the idle sweep needs a
delay setting that does not exist. To eyeball the treatment, force it temporarily.
In `src/main/main.js`, inside `serializeTabs`, add this line as the **first**
statement of the `.map(...)` callback, then relaunch (`npm start` again — a reload
will not do it):

```js
      if (rest.id !== rt().activeTabId) rest.asleep = true;   // TEMPORARY — revert
```

You should see: every background dot in the pill shrink to a small core (the row
spacing unchanged); every non-active panel row carry a `quiet` pill beside where
`private` would sit; every non-active rail row's favicon dim, with a small
ring-and-core marker at the end of the row; and typing in ⌘L show `host · quiet` in
each tab result's sub. Open a private tab and confirm its dot stays **hollow at full
weight** — the two treatments must never stack.

Then delete the line and relaunch to confirm everything returns to normal.

Expected: no visual or behavioural regression on awake tabs, all five quiet
affordances visible under the temporary flag, and the private dot untouched.

**Do not commit the temporary line.** `git diff src/main/main.js` must show only
Task 307's `connection` change before you finish.

- [ ] **Step 5: Commit**

Nothing to commit unless Step 4 surfaced a regression. If it did, fix it and commit
the fix on its own:

```bash
cd /Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a
git status --porcelain   # must be clean, apart from an untracked node_modules symlink
```

---

## Phase 4: Lazy session restore

At the end of this phase Blanc persists a `meta: [{title, favicon}]` column into `session.json`'s `windows[0]` (and *only* there), and a relaunch rebuilds every saved tab **quiet** — a record with a title and a favicon and no renderer process at all — waking only the one tab the user lands on. Verify with `npm run test:unit` (all green, ~35 new assertions) plus Task 412's scripted manual relaunch, where a two-tab session restores with one live renderer, the panel shows the other row as `quiet`, and clicking it loads the page.

**Read before starting:** `docs/superpowers/specs/2026-08-09-quiet-tabs-design.md` §10 and §10.1, and the CLAUDE.md section "Persistence".

**What Phase 4 assumes already landed:**
- Phase 1: `src/main/tab-view.js` (`createTabView`, `wireTabView`, `liveContents`), `serializeTabs` as an allowlist, `test-hook.js` sleep-awareness.
- Phase 2: the tab record's Quiet Tabs fields (`asleep`, `sleeping`, `waking`, `wakeGeneration`, `lastActiveAt`, …), the `sleepSnapshots` Map, `sleepTab(id)` / `wakeTab(id, opts)`, the sweep.
- Phase 3: `asleep` rendered in the pill, the panel row, the rail, and the Quick Switcher.

Tasks 401–406 and 410 touch only files those phases do not, and can be done even if Phases 1–3 are incomplete. Tasks 407–409 edit `main.js` regions Phases 1–2 also edit; each names the anchor text to search for and what it will look like after those phases.

Every command below runs from the worktree root:
`/Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a`.
There is no `node_modules` inside the worktree — Node resolves it from the parent repo automatically, so `npm run test:unit` works as-is. Do not run `npm install`.

---

### Task 401: The `meta` column in session-workspace.js

`session.json` is written by `buildSaveShape` and read by `loadWorkspace`, both in `src/main/session-workspace.js`. The file has a **nested** `windows[0]` entry and a **flat five-key mirror** at the top level that a rolled-back 1.0.x build rewrites in place. This task adds a sixth key, `meta`, to the nested entry only — three plausible ways of doing this break the file permanently, so the shape of the code matters more than usual.

**Files:**
- Modify: `src/main/session-workspace.js:5-16` (`EMPTY_ENTRY`, `entryFrom`), `:92` (the divergence comparison)
- Test: `test/unit/session-workspace.test.js:6-13` (the two fixtures) and a new block appended at the end

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `entryFrom(source)` now returns a sixth key `meta` (`SessionTabMeta[]`, default `[]`); `loadWorkspace(data).windows[0].meta`; `buildSaveShape(entry, existing).windows[0].meta`. `@typedef {{title: string, favicon: string|null}} SessionTabMeta`.

- [ ] **Step 1: Write the failing test**

First change the two fixtures at the top of `test/unit/session-workspace.test.js` so they describe the new six-key entry shape. Replace lines 6–13:

```js
const ENTRY = {
  urls: ['https://a.example/', 'https://b.example/'],
  activeIndex: 1,
  groups: [{ id: 'g1', name: 'work', collapsed: false }],
  groupIds: ['g1', null],
  pinned: [false, true],
  // Quiet Tabs (spec §10.1). An entry always HAS the key; a file that predates
  // it — or whose array no longer lines up with urls — reads back as [].
  meta: [],
};
const EMPTY = { urls: [], activeIndex: 0, groups: [], groupIds: [], pinned: [], meta: [] };
```

Then append this block to the end of the same file:

```js

// ─── Quiet Tabs: the session.json meta column (spec §10.1) ────────────────

const META = [
  { title: 'A', favicon: 'https://a.example/favicon.ico' },
  { title: '', favicon: null },
];

test('meta is written into windows[0] only, never into the v0 mirror', () => {
  const shape = buildSaveShape({ ...ENTRY, meta: META }, {});
  assert.deepEqual(shape.windows[0].meta, META);
  assert.equal('meta' in shape, false,
    'a 1.0.x rollback rewrites the five mirror keys and would strand a stale meta array');
});

test('a v1 file with meta and an agreeing mirror still loads the NESTED workspace', () => {
  const file = { version: 1, windows: [{ ...ENTRY, meta: META }], ...ENTRY };
  const { windows } = loadWorkspace(file);
  assert.deepEqual(windows[0].urls, ENTRY.urls, 'nested must win — the mirror carries no meta by design');
  assert.deepEqual(windows[0].meta, META);
});

test('a meta array whose length no longer matches urls self-drops', () => {
  const { windows } = loadWorkspace({ version: 1, windows: [{ ...ENTRY, meta: [META[0]] }] });
  assert.deepEqual(windows[0].meta, [], 'a stale array must never zip onto different urls');
});

test('rollback → re-upgrade drops meta along with the stale nested workspace', () => {
  const staleNested = {
    ...ENTRY, urls: ['https://old.example/'], groupIds: [null], pinned: [false], activeIndex: 0,
    meta: [{ title: 'Old', favicon: null }],
  };
  const { windows } = loadWorkspace({ version: 1, windows: [staleNested], ...ENTRY });
  assert.deepEqual(windows[0].urls, ENTRY.urls, 'the legacy writer wrote last');
  assert.deepEqual(windows[0].meta, []);
});
```

What each pins down: (1) `meta` never reaches the flat mirror, because a rollback rewrites those five keys and would leave titles zipped onto different URLs; (2) **the critical one** — the mirror-divergence check must ignore `meta`, or `deepEqual` is false on every single launch, the "legacy writer won" branch fires, and the nested workspace is silently discarded forever; (3) and (4) a length mismatch self-drops the array rather than mislabelling pages.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/session-workspace.test.js`

Expected: FAIL — 14 failures. The 4 new tests fail (the first with `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal … undefined !== [ { title: 'A', … } ]`), and 10 pre-existing tests fail too because `entryFrom` still returns five keys while the fixtures now expect six. All 14 go green in Step 4 — do not "fix" the pre-existing ones any other way.

- [ ] **Step 3: Write minimal implementation**

In `src/main/session-workspace.js`, replace lines 5–16 (`EMPTY_ENTRY` through the end of `entryFrom`) with:

```js
const EMPTY_ENTRY = () => ({ urls: [], activeIndex: 0, groups: [], groupIds: [], pinned: [], meta: [] });

/** @typedef {{title: string, favicon: string|null}} SessionTabMeta */

function entryFrom(source) {
  if (!source || typeof source !== 'object') return EMPTY_ENTRY();
  const urls = Array.isArray(source.urls) ? source.urls : [];
  return {
    urls,
    activeIndex: Number.isInteger(source.activeIndex) ? source.activeIndex : 0,
    groups: Array.isArray(source.groups) ? source.groups : [],
    groupIds: Array.isArray(source.groupIds) ? source.groupIds : [],
    pinned: Array.isArray(source.pinned) ? source.pinned : [],
    // Quiet Tabs (spec §10.1): titles and favicons for tabs that come back
    // quiet, zipped onto `urls`. A length mismatch means some other writer
    // — a rolled-back 1.0.x build rewriting the flat mirror — moved the urls
    // out from under this array, so drop it rather than mislabel pages.
    meta: Array.isArray(source.meta) && source.meta.length === urls.length ? source.meta : [],
  };
}

/** The five keys the v0 mirror carries. `meta` lives only in windows[0], so
 * mirror/nested divergence must be judged on the mirror's own columns —
 * comparing whole entries would report divergence on EVERY launch and drop
 * the nested workspace forever (spec §10.1). */
const mirrorProjection = (entry) => ({
  urls: entry.urls,
  activeIndex: entry.activeIndex,
  groups: entry.groups,
  groupIds: entry.groupIds,
  pinned: entry.pinned,
});
```

Then, in `loadWorkspace`, change the one comparison line (currently `session-workspace.js:92`):

```js
    if (deepEqual(mirrorProjection(nested), mirrorProjection(entryFrom(data)))) {
```

Leave `hasMirror` (`:20-29`) at exactly five keys and leave `buildSaveShape`'s six explicit assignments (`:111-117`) untouched — it already writes `windows: [entry]` (which now carries `meta`) and the five mirror keys by name, which is precisely the required split.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/session-workspace.test.js`

Expected: PASS — `ℹ pass 16`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/session-workspace.js test/unit/session-workspace.test.js
git commit -m "Persist a title/favicon column alongside session.json's tab urls

Restored tabs come back quiet, with no webContents to ask for a title,
so windows[0] gains an optional meta array parallel to urls. It stays out
of the v0 mirror a 1.0.x rollback rewrites, and mirror divergence is now
judged on a five-key projection so the nested workspace still wins.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 402: Thread `meta` through the restore-time filter

`filterRestoredSession` drops utility URLs (`blanc://settings/` and friends) out of the restored session and re-zips the parallel arrays so nothing misaligns. `meta` must ride along or every title lands on the wrong tab.

**Files:**
- Modify: `src/main/session-restore.js:6-28`
- Test: `test/unit/session-restore.test.js:4` (the require), `:8-21`, `:50`, `:57`, `:62`

**Interfaces:**
- Consumes: the `SessionTabMeta` shape from Task 401 (`{title: string, favicon: string|null}`).
- Produces: `filterRestoredSession(saved, shouldDrop)` accepts `saved.meta` and returns a fifth key `meta` — one entry per survivor, defaulting to `{ title: '', favicon: null }`.

- [ ] **Step 1: Write the failing test**

Four edits to `test/unit/session-restore.test.js`. First, extend the zipped-alignment test (lines 8–21) so it carries meta through a dropped middle entry — replace its body:

```js
test('keeps zipped alignment when middle entries drop', () => {
  const out = filterRestoredSession({
    urls: ['https://a/', 'blanc://settings/', 'https://b/'],
    groupIds: ['g1', null, 'g2'],
    pinned: [true, false, false],
    meta: [
      { title: 'A', favicon: 'https://a/icon.png' },
      { title: 'Settings', favicon: null },
      { title: 'B', favicon: null },
    ],
    activeIndex: 0,
  }, drop);
  assert.deepEqual(out, {
    urls: ['https://a/', 'https://b/'],
    groupIds: ['g1', 'g2'],
    pinned: [true, false],
    meta: [
      { title: 'A', favicon: 'https://a/icon.png' },
      { title: 'B', favicon: null },
    ],
    activeIndex: 0,
  });
});
```

Then add `meta` to the three other whole-object assertions. Line 50:

```js
  assert.deepEqual(out, {
    urls: ['https://a/'], groupIds: ['g1'], pinned: [true],
    meta: [{ title: '', favicon: null }], activeIndex: 0,
  });
```

Line 57:

```js
  assert.deepEqual(out, { urls: [], groupIds: [], pinned: [], meta: [], activeIndex: 0 });
```

Line 62 (the missing-arrays case — this is the one that pins the per-entry default):

```js
  assert.deepEqual(out, {
    urls: ['https://a/'], groupIds: [null], pinned: [false],
    meta: [{ title: '', favicon: null }], activeIndex: 0,
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/session-restore.test.js`

Expected: FAIL — 4 failing tests, each `AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal` where the actual object has no `meta` key.

- [ ] **Step 3: Write minimal implementation**

In `src/main/session-restore.js`, replace lines 6–28 (the JSDoc block through the closing brace of `filterRestoredSession`) with:

```js
/**
 * @param {{urls?: string[], groupIds?: (string|null)[], pinned?: boolean[],
 *          meta?: {title: string, favicon: string|null}[], activeIndex?: number}} saved
 * @param {(url: string) => boolean} shouldDrop
 */
function filterRestoredSession({ urls = [], groupIds = [], pinned = [], meta = [], activeIndex = 0 } = {}, shouldDrop) {
  const survivors = [];
  for (const [i, url] of urls.entries()) {
    if (shouldDrop(url)) continue;
    survivors.push({
      url,
      groupId: groupIds[i] ?? null,
      pinned: !!pinned[i],
      // Quiet Tabs (spec §10.1). Files written before the meta column, and
      // rollbacks that dropped it, restore with a blank label rather than
      // one belonging to a different tab.
      meta: meta[i] ?? { title: '', favicon: null },
      originalIndex: i,
    });
  }
  const clamped = Math.min(Math.max(0, activeIndex), Math.max(0, urls.length - 1));
  // The survivor at the original index, else the next surviving neighbor
  // (first after, falling back to last before), else 0.
  let next = survivors.findIndex((s) => s.originalIndex >= clamped);
  if (next === -1) next = survivors.length - 1;
  if (next === -1) next = 0;
  return {
    urls: survivors.map((s) => s.url),
    groupIds: survivors.map((s) => s.groupId),
    pinned: survivors.map((s) => s.pinned),
    meta: survivors.map((s) => s.meta),
    activeIndex: next,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/session-restore.test.js`

Expected: PASS — `ℹ pass 6`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/session-restore.js test/unit/session-restore.test.js
git commit -m "Carry restored tab titles through the utility-url filter

filterRestoredSession re-zips the parallel session arrays when it drops a
utility page; the new meta column has to be zipped with them or every
title and favicon shifts onto the wrong tab.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 403: `restoreTargetId` — the restore loop's hole-tolerant index

`createTab` returns `null` for a URL it refuses (utility pages). The restore loop indexes straight into its results array to pick the tab to activate, so a `null` there becomes `setActiveTab(undefined)` and the window lands on nothing. This adds the pure helper; Task 408 wires it in.

**Files:**
- Modify: `src/main/session-restore.js` (append a function + widen the export)
- Test: `test/unit/session-restore.test.js` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `restoreTargetId(restoredIds: (string|null)[], activeIndex: number) => string|null`, exported from `src/main/session-restore.js` alongside `filterRestoredSession`.

- [ ] **Step 1: Write the failing test**

First widen the require at `test/unit/session-restore.test.js:4`:

```js
const { filterRestoredSession, restoreTargetId } = require('../../src/main/session-restore');
```

Then append to the end of the file:

```js

test('restoreTargetId skips holes at and after the saved index', () => {
  assert.equal(restoreTargetId(['a', null, 'c'], 1), 'c');
});

test('restoreTargetId falls back to the last real id before the saved index', () => {
  assert.equal(restoreTargetId(['a', null, null], 2), 'a');
});

test('restoreTargetId returns null when nothing was created', () => {
  assert.equal(restoreTargetId([null, null], 0), null);
  assert.equal(restoreTargetId([], 0), null);
  assert.equal(restoreTargetId(undefined, 0), null);
});

test('restoreTargetId clamps an out-of-range or non-integer index', () => {
  assert.equal(restoreTargetId(['a', 'b'], 99), 'b');
  assert.equal(restoreTargetId(['a', 'b'], -3), 'a');
  assert.equal(restoreTargetId(['a', 'b'], undefined), 'a');
});
```

These pin the same neighbour rule `filterRestoredSession` already uses (forward first, then back), and the all-null case that must leave the startup tab alone instead of closing it and activating nothing.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/session-restore.test.js`

Expected: FAIL — `TypeError: restoreTargetId is not a function` on the first of the four new tests.

- [ ] **Step 3: Write minimal implementation**

In `src/main/session-restore.js`, insert this function immediately after `filterRestoredSession` and before `module.exports`:

```js
/** The tab to activate after a restore. createTab returns null for a url it
 * refuses (utility pages — filtered above, but the guard is structural), so
 * the saved index can land on a hole. Walk forward, then back, exactly like
 * the survivor rule above. Null means nothing usable was created. */
function restoreTargetId(restoredIds, activeIndex) {
  const ids = Array.isArray(restoredIds) ? restoredIds : [];
  if (!ids.length) return null;
  const start = Math.min(
    Math.max(0, Number.isInteger(activeIndex) ? activeIndex : 0),
    ids.length - 1
  );
  for (let i = start; i < ids.length; i += 1) if (ids[i]) return ids[i];
  for (let i = start - 1; i >= 0; i -= 1) if (ids[i]) return ids[i];
  return null;
}
```

And replace the last line of the file:

```js
module.exports = { filterRestoredSession, restoreTargetId };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/session-restore.test.js`

Expected: PASS — `ℹ pass 10`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/session-restore.js test/unit/session-restore.test.js
git commit -m "Pick the restored active tab without indexing into a hole

createTab returns null for a url it refuses, so the saved active index can
point at a gap in the created-id list. restoreTargetId walks to the nearest
real id instead, the same neighbour rule the survivor filter uses.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 404: `sessionTabMeta` — what one tab contributes to the meta column

Two rules make this worth its own pure function: a tab sitting on Blanc's own error page must persist an **empty** title (the visible title there is Blanc's copy, not the site's, and `persistableUrl` has already unwrapped the URL back to the real destination), and an oversized `data:` favicon — the renderer's fallback glyph — must not bloat a file that is read synchronously at launch.

**Files:**
- Modify: `src/main/session-snapshot.js` (insert before `persistableEntries`, widen the export)
- Test: `test/unit/session-snapshot.test.js:4` (the require) + append

**Interfaces:**
- Consumes: nothing.
- Produces: `sessionTabMeta(tab) => {title: string, favicon: string|null}`, plus `MAX_META_TITLE = 200` and `MAX_META_FAVICON = 4096`, all exported from `src/main/session-snapshot.js`.

- [ ] **Step 1: Write the failing test**

Replace the require at `test/unit/session-snapshot.test.js:4`:

```js
const {
  persistableEntries, syncSnapshot, sessionTabMeta, MAX_META_TITLE, MAX_META_FAVICON,
} = require('../../src/main/session-snapshot');
```

Append to the end of the file:

```js

test('sessionTabMeta carries a title and an allow-listed favicon, both bounded', () => {
  assert.deepEqual(
    sessionTabMeta(tab({ title: 'A', favicon: 'https://a.example/icon.png' })),
    { title: 'A', favicon: 'https://a.example/icon.png' }
  );
  assert.equal(sessionTabMeta(tab({ title: 'x'.repeat(500) })).title.length, MAX_META_TITLE);
  assert.equal(sessionTabMeta(tab({ favicon: 'javascript:alert(1)' })).favicon, null);
  assert.equal(
    sessionTabMeta(tab({ favicon: `data:image/png;base64,${'A'.repeat(MAX_META_FAVICON)}` })).favicon,
    null,
    'an oversized data: favicon is the fallback glyph — not worth persisting'
  );
  assert.deepEqual(sessionTabMeta(undefined), { title: '', favicon: null });
});

test('sessionTabMeta persists an EMPTY title for a tab sitting on our error page', () => {
  const meta = sessionTabMeta(tab({
    url: 'blanc://error/?url=' + encodeURIComponent('https://fail.example/'),
    title: 'This page did not load',
  }));
  assert.deepEqual(meta, { title: '', favicon: null },
    'persistableUrl unwraps to the site; the title there is Blanc error page copy');
});
```

Do **not** touch the existing assertion at `test/unit/session-snapshot.test.js:56` — the four-key `syncSnapshot` shape guard is a mixed-version contract and stays exactly as it is. `persistableEntries`' shape is unchanged by this task too, deliberately: the meta lives in its own function.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/session-snapshot.test.js`

Expected: FAIL — `TypeError: sessionTabMeta is not a function` on both new tests.

- [ ] **Step 3: Write minimal implementation**

In `src/main/session-snapshot.js`, insert immediately above the `/** Exactly persistSession's session.json semantics` comment block (currently line 25):

```js
const MAX_META_TITLE = 200;
const MAX_META_FAVICON = 4096;

/** The favicon worth persisting: the same scheme allow-list favorites use
 * (bookmark-validate.js), with session.json's own, larger ceiling. A data:
 * URL past that is the renderer's fallback glyph — no information, and this
 * file is read synchronously at launch. */
function persistableFavicon(favicon) {
  return typeof favicon === 'string'
    && favicon.length <= MAX_META_FAVICON
    && /^(https?:|data:image\/)/i.test(favicon)
    ? favicon
    : null;
}

/** session.json's meta entry for one tab (Quiet Tabs spec §10.1): what the
 * pill and the rail draw for a tab restored quiet, before it has any
 * webContents. Empty title for a tab sitting on our own error page —
 * persistableUrl() unwraps that url back to the real destination, and the
 * title showing there is Blanc's error copy, not the site's. */
function sessionTabMeta(tab) {
  const onErrorPage = typeof tab?.url === 'string' && tab.url.startsWith('blanc://error');
  const title = !onErrorPage && typeof tab?.title === 'string'
    ? tab.title.slice(0, MAX_META_TITLE)
    : '';
  return { title, favicon: persistableFavicon(tab?.favicon) };
}

```

Replace the final `module.exports` line with:

```js
module.exports = {
  persistableEntries, syncSnapshot, sessionTabMeta,
  MAX_SYNC_TABS, MAX_SYNC_URL, MAX_SYNC_TITLE, MAX_META_TITLE, MAX_META_FAVICON,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/session-snapshot.test.js`

Expected: PASS — `ℹ pass 6`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/session-snapshot.js test/unit/session-snapshot.test.js
git commit -m "Derive one tab's persisted title and favicon

sessionTabMeta bounds both, refuses anything outside the favorites scheme
allow-list, and persists an empty title for a tab showing Blanc's error
page — the url is unwrapped back to the site, so that title belongs to us.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 405: persistSession writes the meta column; the restore path reads it back

Two edits in `main.js`, both small, plus the test file that pins them. The alignment rule is the whole point: `meta` is mapped over the **filtered** `entries` list, never the raw tab order, or a private/url-less tab shifts every label by one.

**Files:**
- Modify: `src/main/main.js:41` (require), `:1207` (inside `persistSession`), `:3739-3743` (the restore copy-back)
- Create: `test/unit/session-meta.test.js`

**Interfaces:**
- Consumes: `sessionTabMeta(tab)` from Task 404; `filterRestoredSession`'s new `meta` return key from Task 402.
- Produces: `session.json` files containing `windows[0].meta`; `saved.meta` available to the restore loop in Task 408.

- [ ] **Step 1: Write the failing test**

Create `test/unit/session-meta.test.js`:

```js
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// persistSession lives in main.js, which cannot be required under node --test.
// Same approach as settings-fanout-reload.test.js: lift the real source and
// run it in a sandbox, so this asserts the shipped code, not a copy of it.
const { persistableEntries, sessionTabMeta } = require('../../src/main/session-snapshot');
const { buildSaveShape } = require('../../src/main/session-workspace');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const fnSource = mainSource.match(/function persistSession\(\) \{[\s\S]*?\n\}/)?.[0];

test('persistSession is still liftable out of main.js', () => {
  assert.ok(fnSource, 'persistSession not found — update this test with it');
});

function run(tabList, activeTabId) {
  const data = {};
  const sandbox = {
    isQuitting: false,
    sessionPersistenceSuspended: false,
    sessionReadOnly: false,
    tabs: new Map(tabList.map((t) => [t.id, t])),
    rt: () => ({ tabOrder: tabList.map((t) => t.id), groups: [], activeTabId }),
    ensureSessionStore: () => ({ update: (fn) => fn(data) }),
    persistableEntries,
    sessionTabMeta,
    buildSaveShape,
  };
  vm.runInNewContext(`${fnSource}\nthis.__fn = persistSession;`, sandbox);
  sandbox.__fn();
  return data;
}

const tab = (over) => ({
  id: 'x', url: 'https://a/', title: 'A', favicon: null,
  private: false, groupId: null, pinned: false, ...over,
});

test('persistSession writes a meta entry per persisted url, in the same order', () => {
  const data = run([
    tab({ id: 'a', url: 'https://a/', title: 'Alpha', favicon: 'https://a/i.png' }),
    tab({ id: 'p', url: 'https://secret/', title: 'Secret', private: true }),
    tab({ id: 'b', url: 'https://b/', title: 'Beta' }),
  ], 'b');
  // The private tab drops out of urls; meta must drop with it or every label
  // shifts onto the wrong tab.
  assert.deepEqual(data.windows[0].urls, ['https://a/', 'https://b/']);
  assert.deepEqual(data.windows[0].meta, [
    { title: 'Alpha', favicon: 'https://a/i.png' },
    { title: 'Beta', favicon: null },
  ]);
  assert.equal('meta' in data, false, 'the v0 mirror never carries meta');
});

test('the restore copy-back threads meta through the utility-url filter', () => {
  assert.match(mainSource, /saved\.meta = cleaned\.meta;/,
    'without this a dropped utility url misaligns every title by one');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/session-meta.test.js`

Expected: FAIL — 2 failures: `persistSession writes a meta entry…` fails with `Expected values to be strictly deep-equal … undefined !== [ { title: 'Alpha', … } ]`, and `the restore copy-back…` fails with `The input did not match the regular expression`.

- [ ] **Step 3: Write minimal implementation**

Edit A — `src/main/main.js:41`, widen the require:

```js
const { persistableEntries, sessionTabMeta } = require('./session-snapshot');
```

Edit B — inside `persistSession`, find

```js
      pinned: entries.map((e) => e.pinned),
      // Groups referenced only by private tabs stay out of the file too.
```

and replace it with

```js
      pinned: entries.map((e) => e.pinned),
      // Quiet Tabs (spec §10.1): restored tabs come back quiet, with no
      // webContents to ask for a title or a favicon — so the chrome draws
      // this column instead. Mapped over `entries`, never the raw tab list:
      // a private or url-less tab is dropped from urls, and a label list
      // built from the wider list would shift onto the wrong tabs.
      meta: entries.map((e) => sessionTabMeta(tabs.get(e.id))),
      // Groups referenced only by private tabs stay out of the file too.
```

Edit C — the restore copy-back. Find

```js
  saved.pinned = cleaned.pinned;
  saved.activeIndex = cleaned.activeIndex;
```

and replace it with

```js
  saved.pinned = cleaned.pinned;
  saved.meta = cleaned.meta;
  saved.activeIndex = cleaned.activeIndex;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/session-meta.test.js && npm run test:unit`

Expected: PASS — the first command reports `ℹ pass 3`, `ℹ fail 0`; the full suite reports `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js test/unit/session-meta.test.js
git commit -m "Write the tab title/favicon column, and read it back at restore

persistSession maps the meta column over the same filtered entry list the
urls come from, so a private or url-less tab drops out of both together;
the restore path copies meta back out of the utility-url filter.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 406: Clearing history clears the persisted meta column

`history.clearHistory()` (`src/main/history.js:49-51`) rewrites `history.json` and nothing else, so the titles the meta column just started persisting would survive a history clear. Two handlers reach that call — the internal History page's IPC (`pages.js`) and the chrome's own `chrome:history-clear` (`main.js`) — and both must clear meta.

**Files:**
- Modify: `src/main/main.js` (a new `clearSessionMeta()` after `persistSession`, the `setupPages` hook, the `chrome:history-clear` handler), `src/main/pages.js:157`
- Test: `test/unit/session-meta.test.js` (append)

**Interfaces:**
- Consumes: the `meta` key written in Task 405.
- Produces: `clearSessionMeta()` in `main.js`; a new optional `setupPages` hook `onHistoryCleared`.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/session-meta.test.js`:

```js

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/session-meta.test.js`

Expected: FAIL — 3 failures. The first two fail on `clearSessionMeta not found — update this test with it` (and a `TypeError` from the undefined lifted source), the third on `The input did not match the regular expression`.

- [ ] **Step 3: Write minimal implementation**

Edit A — in `src/main/main.js`, find the last three lines of `persistSession`:

```js
    Object.assign(d, buildSaveShape(entry, d));
  });
}
```

and append the new function immediately after them:

```js
    Object.assign(d, buildSaveShape(entry, d));
  });
}

/** Clearing history must not leave the same page titles sitting in
 * session.json's meta column — history.clearHistory() only rewrites
 * history.json (Quiet Tabs spec §10.1). Scoped honestly: meta only ever
 * describes tabs that are open right now, so the next broadcast re-derives
 * it for whatever is still on screen. What this erases is the copy that
 * would otherwise outlive them on disk. */
function clearSessionMeta() {
  if (sessionReadOnly) return; // a newer format owns this file — never rewrite it
  ensureSessionStore().update((d) => {
    if (Array.isArray(d.windows)) {
      for (const w of d.windows) if (w && typeof w === 'object') delete w.meta;
    }
    delete d.meta;
  });
}
```

Edit B — `src/main/main.js`, the chrome handler. Find

```js
  chromeHandle('chrome:history-clear', () => history.clearHistory());
```

and replace with

```js
  chromeHandle('chrome:history-clear', () => {
    history.clearHistory();
    clearSessionMeta();
  });
```

Edit C — `src/main/main.js`, the `setupPages({ … })` call. Find

```js
    onDataChanged: refreshBookmarkFlagsBound,
```

and replace with

```js
    onDataChanged: refreshBookmarkFlagsBound,
    // pages.js's own IPC surface is unbound, so this hook rebinds like the rest.
    onHistoryCleared: bindWindowRuntime(primaryRuntime, clearSessionMeta),
```

Edit D — `src/main/pages.js:157`. Find

```js
  handle('pages:history:clear', () => history.clearHistory());
```

and replace with

```js
  handle('pages:history:clear', () => {
    history.clearHistory();
    // session.json's meta column holds the same page titles (Quiet Tabs
    // spec §10.1); clearHistory() does not touch that file.
    hooks.onHistoryCleared?.();
  });
```

`setupPages(hooks = {})` takes a plain bag of optional hooks (`src/main/pages.js:36`), so no signature change is needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/session-meta.test.js`

Expected: PASS — `ℹ pass 6`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js src/main/pages.js test/unit/session-meta.test.js
git commit -m "Clear the persisted tab titles when history is cleared

clearHistory() only rewrites history.json, so session.json's new title and
favicon column would outlive it. Both entry points — the History page and
the chrome's own clear — now drop that column too.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 407: `createTab` can build a tab quiet

Today `createTab` always constructs a `WebContentsView`, wires every listener onto it, and navigates it. A restored tab must do none of those things: it is a record with a URL, a title and a favicon, and no renderer process at all until the user comes back to it.

**Files:**
- Modify: `src/main/main.js` — `createTab`'s signature (currently `:1786`), the view construction (currently `:1809-1814`), the record (currently `:1816-1848`), and one early return after `windowRuntimes.attachTab` (currently `:1851`)
- Test: `test/unit/lazy-restore.test.js` (new)

**Interfaces:**
- Consumes: `createTabView({ private })` from Phase 1's `src/main/tab-view.js`; the record's `asleep` field from Phase 2.
- Produces: `createTab(url, { asleep, title, favicon, … })` — three new options. `asleep: true` yields a record with `view === null`, `asleep === true`, no wiring and no navigation, and still returns the new tab's id.

**Before you start:** Phase 1 rewrote two of these regions. Run `grep -n "createTabView\|wireTabView" src/main/main.js` and read `createTab` top to bottom once, so you edit what is actually there.

- [ ] **Step 1: Write the failing test**

Create `test/unit/lazy-restore.test.js`:

```js
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// createTab and the restore loop live in main.js, which cannot be required
// under node --test (settings-fanout-reload.test.js explains why). These lift
// the real source and assert its structure — specifically the ORDER that
// matters: a quiet-born tab must return before anything touches a webContents.
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const createTabSource = mainSource.match(/function createTab\(url = newTabUrl\(\)[\s\S]*?\n\}/)?.[0];

test('createTab is still liftable out of main.js', () => {
  assert.ok(createTabSource, 'createTab not found — update this test with it');
});

test('createTab accepts the three lazy-restore options', () => {
  const signature = createTabSource.split('\n')[0];
  for (const opt of ['asleep = false', 'title = null', 'favicon = null']) {
    assert.ok(signature.includes(opt), `${opt} missing from createTab's options`);
  }
});

test('a quiet-born tab gets no view, and returns before anything is wired', () => {
  assert.match(createTabSource, /const bornQuiet = asleep && !adopted;/,
    'an adopted window.open child is already live and can never be born quiet');
  assert.match(createTabSource, /view: bornQuiet \? null : view,/);

  const quietReturn = createTabSource.indexOf('if (bornQuiet) {');
  const wiring = createTabSource.search(/wireTabView\(|installChromeShortcuts\(|view\.webContents/);
  assert.ok(quietReturn > 0, 'no bornQuiet early return');
  assert.ok(wiring > 0, 'no wiring call found — did this move?');
  assert.ok(quietReturn < wiring,
    'the quiet return must come first: a quiet tab has no webContents to wire or navigate');
});

test('a restored title and favicon reach the record', () => {
  assert.match(createTabSource, /title: typeof title === 'string' && title \? title : 'New Tab',/);
  assert.match(createTabSource, /favicon: typeof favicon === 'string' \? favicon : null,/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/lazy-restore.test.js`

Expected: FAIL — 3 failures (`createTab accepts the three lazy-restore options` fails with `asleep = false missing from createTab's options`; the other two fail with `The input did not match the regular expression`).

- [ ] **Step 3: Write minimal implementation**

Edit A — the signature. Find the line starting `function createTab(url = newTabUrl(),` and add the three options at the end of the destructure:

```js
function createTab(url = newTabUrl(), { private: isPrivate = false, groupId = null, view = null, pinned = false, muted = false, restoreHistory = null, openerTabId = null, asleep = false, title = null, favicon = null } = {}) {
```

Edit B — the view construction. After Phase 1 the line reads `view ??= createTabView({ private: isPrivate });` (before Phase 1 it is the four-line `new WebContentsView({ webPreferences: … })` block). Replace whichever is there with:

```js
  // Session restore builds every tab quiet (spec §10): no view, no renderer
  // process, no navigation — just the record the chrome draws from. An
  // adopted window.open child arrives already live and can never be quiet.
  const bornQuiet = asleep && !adopted;
  if (!bornQuiet) view ??= createTabView({ private: isPrivate });
```

Keep the `const adopted = !!view;` line immediately above it exactly as it is — `bornQuiet` reads it.

Edit C — the record's first three fields. Find

```js
    view,
    title: 'New Tab',
    url,
```

and replace with

```js
    view: bornQuiet ? null : view,
    // A restored quiet tab wears session.json's persisted title; every other
    // tab keeps the placeholder its first navigation overwrites.
    title: typeof title === 'string' && title ? title : 'New Tab',
    url,
```

Edit D — the favicon field. Find

```js
    favicon: null,
    bookmarked: false,
```

and replace with

```js
    favicon: typeof favicon === 'string' ? favicon : null,
    bookmarked: false,
```

Edit E — the `asleep` initializer Phase 2 added to the record. Run `grep -n "asleep: false," src/main/main.js`, and on that line change the initializer to `bornQuiet`, keeping its trailing comment:

```js
    asleep: bornQuiet,        // renderer discarded; tab.view is null
```

Edit F — the early return. Find

```js
  tabs.set(id, tab);
  rt().tabOrder.push(id);
  windowRuntimes.attachTab(owner, id);
```

and replace with

```js
  tabs.set(id, tab);
  rt().tabOrder.push(id);
  windowRuntimes.attachTab(owner, id);

  // Nothing to wire and nothing to navigate: a quiet-born tab has no
  // webContents at all until wakeTab builds one (spec §10). Everything below
  // this point dereferences view.webContents.
  if (bornQuiet) {
    scheduleMenuRebuild();
    return id;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --check src/main/main.js && node --test test/unit/lazy-restore.test.js && npm run test:unit`

Expected: PASS — `node --check` prints nothing, the new file reports `ℹ pass 5`, `ℹ fail 0`, and the full suite reports `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js test/unit/lazy-restore.test.js
git commit -m "Let a tab be created quiet, with no renderer at all

createTab gains asleep/title/favicon options: a quiet-born tab is a record
with a url and a label, and returns before anything touches a webContents.
An adopted window.open child is already live and is never born quiet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 408: Restore the session quiet, and wake only the active tab

**Files:**
- Modify: `src/main/main.js:43` (require) and the restore loop (currently `:3783-3794`)
- Test: `test/unit/lazy-restore.test.js` (append)

**Interfaces:**
- Consumes: `restoreTargetId` (Task 403), `saved.meta` (Tasks 402 + 405), `createTab(url, { asleep, title, favicon })` (Task 407), `setActiveTab` as Phase 2's single wake choke point.
- Produces: after a relaunch, every restored tab has `asleep === true` and `view === null` except the one `setActiveTab` woke.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/lazy-restore.test.js`:

```js

test('session restore builds quiet tabs labelled from the meta column', () => {
  const loop = mainSource.match(/const restoredIds = saved\.urls\.map\([\s\S]*?\n    \}\)\);/)?.[0];
  assert.ok(loop, 'the restore loop moved — update this test with it');
  assert.match(loop, /asleep: true,/, 'restored tabs are born quiet (spec §10)');
  assert.match(loop, /saved\.meta\?\.\[index\]\?\.title/);
  assert.match(loop, /saved\.meta\?\.\[index\]\?\.favicon/);
});

test('the restored active tab is picked without indexing into a hole', () => {
  assert.match(mainSource, /const target = restoreTargetId\(restoredIds, saved\.activeIndex\);/);
  assert.doesNotMatch(
    mainSource,
    /restoredIds\[\s*\n?\s*Math\.min\(Math\.max\(0, saved\.activeIndex\), restoredIds\.length - 1\)/,
    'createTab returns null for a url it refuses; raw indexing activates undefined'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/lazy-restore.test.js`

Expected: FAIL — 2 failures: `The input did not match the regular expression` for `asleep: true,`, and the same for `const target = restoreTargetId(...)`.

- [ ] **Step 3: Write minimal implementation**

Edit A — `src/main/main.js:43`, widen the require:

```js
const { filterRestoredSession, restoreTargetId } = require('./session-restore');
```

Edit B — the restore loop. Find

```js
    const restoredIds = saved.urls.map((url, index) => createTab(url, {
      groupId: saved.groupIds?.[index] ?? null,
      pinned: !!saved.pinned?.[index],
    }));
    pruneEmptyGroups();
    if (restoredIds.length) {
      const target = restoredIds[
        Math.min(Math.max(0, saved.activeIndex), restoredIds.length - 1)
      ];
      if (tabs.has(startupTabId)) closeTab(startupTabId);
      setActiveTab(target, { focusContent: true });
    }
```

and replace with

```js
    // Lazy restore (spec §10): every saved tab comes back QUIET — a record
    // with a url and session.json's persisted label, and no renderer process.
    // Only the tab the user lands on rebuilds one, through setActiveTab,
    // which is Quiet Tabs' single wake choke point.
    const restoredIds = saved.urls.map((url, index) => createTab(url, {
      groupId: saved.groupIds?.[index] ?? null,
      pinned: !!saved.pinned?.[index],
      asleep: true,
      title: saved.meta?.[index]?.title ?? '',
      favicon: saved.meta?.[index]?.favicon ?? null,
    }));
    pruneEmptyGroups();
    // createTab returns null for a url it refuses, so the saved index can
    // land on a hole — and closing the startup tab with nothing to activate
    // would leave the window empty.
    const target = restoreTargetId(restoredIds, saved.activeIndex);
    if (target) {
      if (tabs.has(startupTabId)) closeTab(startupTabId);
      setActiveTab(target, { focusContent: true });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --check src/main/main.js && node --test test/unit/lazy-restore.test.js && npm run test:unit`

Expected: PASS — the new file reports `ℹ pass 7`, `ℹ fail 0`; the full suite reports `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js test/unit/lazy-restore.test.js
git commit -m "Restore a session quiet, waking only the tab you land on

A relaunch used to spin up one renderer process per saved tab. Now every
restored tab is a labelled record and only the active one is built, through
the same activation path any other wake goes through.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 409: `wakeTab` handles a tab that never had a snapshot

Phase 2's `wakeTab` restores a quiet tab from `sleepSnapshots` — the navigation entries captured when the tab was discarded. A tab restored from `session.json` was never discarded at runtime, so it has **no** snapshot entry at all. Without a branch for that, the first click on a restored tab either throws or lands on a blank page. This task is a read-then-patch, not TDD: the behaviour is proved in Task 412.

**Files:**
- Modify: `src/main/main.js` — `wakeTab`'s navigation step only
- Test: the existing suite (`npm run test:unit`) plus Task 412's manual relaunch

**Interfaces:**
- Consumes: Phase 2's `wakeTab(id, { navigateTo, atIndex })`, the `sleepSnapshots` Map, and its wake-generation mechanism.
- Produces: `wakeTab` resolves successfully for a tab with no `sleepSnapshots` entry, by loading `tab.url`.

- [ ] **Step 1: Read the existing wake path**

Run: `grep -n "async function wakeTab" src/main/main.js` then read the whole function.

Write down, before changing anything: which expression produces the navigation promise, and what happens today when `sleepSnapshots.get(id)` is `undefined`. If the function already branches to `loadURL(tab.url)` in that case — Phase 2 may have covered it — this task is already done: check the box, skip to Step 4, and commit nothing.

- [ ] **Step 2: Add the snapshot-less branch**

Inside `wakeTab`, after the snapshot is read and before the navigation is started, make the navigation a three-way choice. It must stay a single expression whose promise the wake generation already awaits — do not add a second navigation, and do not start one outside the generation:

```js
    // Three mutually exclusive first navigations, in priority order:
    //   navigateTo — the caller is going somewhere anyway, so restore() would
    //                only be overwritten (spec §5); the snapshot is dropped.
    //   snapshot   — the normal wake: entries + index, back stack intact.
    //   neither    — a tab restored from session.json (spec §10) was never
    //                discarded at runtime, so it has no snapshot. Its url is
    //                the only thing to go on.
    const navigation = navigateTo
      ? wc.loadURL(navigateTo)
      : snapshot
        ? wc.navigationHistory.restore({ entries: snapshot.entries, index: targetIndex })
        : wc.loadURL(tab.url);
```

Use whatever local names Phase 2 already established for the webContents (`wc`), the snapshot, and the clamped index — this block is the shape to reach, not a verbatim paste. The `restore()`-rejected fallback (spec §5.1 rule 3) stays exactly as Phase 2 wrote it.

- [ ] **Step 3: Check syntax**

Run: `node --check src/main/main.js`

Expected: no output (a syntax error would print `SyntaxError` and a line number).

- [ ] **Step 4: Run the existing suite**

Run: `npm run test:unit`

Expected: PASS — `ℹ fail 0`. This is a main-process behaviour change with no unit-testable seam; Task 412 is the verification that matters, and it is deliberately the next task.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js
git commit -m "Wake a restored tab that never had a snapshot

A tab restored from session.json was never discarded at runtime, so there
are no navigation entries to restore — its persisted url is the whole
story. Handled inside the same wake generation as every other wake.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 410: Tab-icon capture survives a tab with no view

`tabicons.js` derives the browsing session to fetch a favicon through from `tab.view?.webContents?.session`. For a quiet tab that is `null`, so favicon capture silently stops for every restored tab — exactly the tabs whose icons the rail most needs.

**Files:**
- Modify: `src/main/tabicons.js:7` (the require) and `:421-426` (the `cachedRaster` call)
- Test: `test/unit/tabicons.test.js` (the Electron stub near `:19`, plus one appended test)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no new exports — behaviour only.

- [ ] **Step 1: Write the failing test**

Two edits to `test/unit/tabicons.test.js`. First, give the Electron stub a default session. Find

```js
const electronId = require.resolve('electron');
```

and replace with

```js
let defaultSessionFetch = async () => { throw new Error('defaultSession.fetch not stubbed'); };
const electronId = require.resolve('electron');
```

Then find, inside that stub's `exports`,

```js
    app: { getPath: () => tmp, on: () => {} },
```

and replace with

```js
    app: { getPath: () => tmp, on: () => {} },
    session: { defaultSession: { fetch: (...args) => defaultSessionFetch(...args) } },
```

Append this test to the end of the file:

```js

test('a quiet tab has no view, so capture falls back to the default session', async () => {
  let fetched = null;
  defaultSessionFetch = async (url, options) => {
    fetched = { url, options };
    return response('image/png');
  };
  const tab = {
    id: 'quiet-1',
    url: 'https://quiet-page.example/',
    favicon: 'https://quiet-page.example/icon.png',
    private: false,
    view: null, // discarded, or restored quiet — either way there is no session here
  };
  tabicons.setSnapshotProvider(() => ({ tabList: [tab] }));

  assert.equal(await tabicons.captureTab(tab, ctx), true);
  assert.equal(fetched.url, tab.favicon);
  assert.equal(fetched.options.credentials, 'omit', 'still a cosmetic, cookie-less fetch');
  const icons = tabicons.exportForSync(ctx).devices['device-a'].icons;
  assert.ok(icons.some((i) => i.url === tab.url && i.data === PNG_DATA));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tabicons.test.js`

Expected: FAIL — 1 failure, `a quiet tab has no view…`, with `Expected values to be strictly equal: false !== true` (capture returns false because `rasterizeSource` sees no `browsingSession.fetch` and bails).

- [ ] **Step 3: Write minimal implementation**

In `src/main/tabicons.js:7`, widen the require:

```js
const { nativeImage, session } = require('electron');
```

Then find

```js
  const data = await cachedRaster(
    source,
    tab.view?.webContents?.session,
```

and replace with

```js
  const data = await cachedRaster(
    source,
    // A quiet tab has no view at all (Quiet Tabs spec §10.1), so deriving the
    // browsing session from it would silently stop icon capture for every
    // restored tab. syncablePageUrl() above already excluded private tabs, so
    // the default session is the correct — and only reachable — fallback.
    tab.view?.webContents?.session ?? session?.defaultSession,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tabicons.test.js`

Expected: PASS — `ℹ pass 15`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/tabicons.js test/unit/tabicons.test.js
git commit -m "Keep capturing favicons for tabs that have no view

Icon capture read its browsing session off the tab's view, which a quiet or
restored tab does not have — so the rows whose icons matter most stopped
updating. Private tabs are already excluded upstream.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 411: Expose the persisted session to the acceptance harness

The acceptance scenarios in a later phase assert what actually reached `session.json`. This installs the reader. **It may already exist** — Phase 1 or 2 may have added it with the rest of the test-hook surface.

**Files:**
- Modify: `src/main/test-hook.js:76-84` (the refs destructure) and `:748-749` (the method list), `src/main/main.js` (the `require('./test-hook').install({ … })` call)
- Test: the existing suite

**Interfaces:**
- Consumes: `ensureSessionStore()` in `main.js`.
- Produces: `globalThis.__blanc.persistedSessionData()` returning a JSON deep copy of `session.json`'s in-memory data; a new `install()` ref named `persistedSessionData`.

- [ ] **Step 1: Check whether this is already done**

Run: `grep -n persistedSessionData src/main/test-hook.js src/main/main.js`

If that prints matches in **both** files, this task is already complete — check every box and move on. Otherwise continue.

- [ ] **Step 2: Add the ref in main.js**

In `src/main/main.js`, inside the `require('./test-hook').install({ … })` call, find

```js
      getChromeUrl: () => rt().window?.webContents.getURL() ?? '',
```

and replace with

```js
      getChromeUrl: () => rt().window?.webContents.getURL() ?? '',
      // What actually reached session.json — Quiet Tabs' lazy restore is
      // asserted against the file, not against the live tab model.
      persistedSessionData: () => JSON.parse(JSON.stringify(ensureSessionStore().data)),
```

- [ ] **Step 3: Add the method in test-hook.js**

In `src/main/test-hook.js`, add `persistedSessionData,` to the refs destructure — find

```js
    attemptChromeNavigation,
    getChromeUrl,
  } = refs;
```

and replace with

```js
    attemptChromeNavigation,
    getChromeUrl,
    persistedSessionData,
  } = refs;
```

Then find

```js
    attemptChromeNavigation(url) { return attemptChromeNavigation(String(url)); },
    chromeUrl() { return getChromeUrl(); },
```

and replace with

```js
    attemptChromeNavigation(url) { return attemptChromeNavigation(String(url)); },
    chromeUrl() { return getChromeUrl(); },
    persistedSessionData() { return persistedSessionData(); },
```

Do not add anything to the mechanical `bindRoot` wrap at the end of `install()` — it already covers every method on the object.

- [ ] **Step 4: Verify**

Run: `node --check src/main/main.js && node --check src/main/test-hook.js && npm run test:unit`

Expected: PASS — both `node --check` calls print nothing; the suite reports `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js src/main/test-hook.js
git commit -m "Let the acceptance harness read the persisted session

Lazy restore is a claim about session.json, so the test surface hands back
a deep copy of it rather than the live tab model.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 412: Verify lazy restore against the real app

Nothing above proves a restored tab actually comes back. This runs Blanc against a throwaway profile seeded with a two-tab session. It is a manual task with exact commands and exact expected observations — do not skip it, and do not substitute a unit test for it.

**Files:**
- Modify: none (verification only)
- Test: the running app

**Interfaces:**
- Consumes: everything from Tasks 401–411, plus Phase 2's `wakeTab` and Phase 3's quiet chrome.
- Produces: nothing.

- [ ] **Step 1: Seed a throwaway profile**

```bash
rm -rf /tmp/blanc-quiet-check && mkdir -p /tmp/blanc-quiet-check
cat > /tmp/blanc-quiet-check/session.json <<'JSON'
{"version":1,
 "windows":[{"urls":["https://example.com/","https://example.org/"],
             "activeIndex":0,"groups":[],"groupIds":[null,null],"pinned":[false,false],
             "meta":[{"title":"Seeded Example Com","favicon":null},
                     {"title":"Seeded Example Org","favicon":null}]}],
 "urls":["https://example.com/","https://example.org/"],
 "activeIndex":0,"groups":[],"groupIds":[null,null],"pinned":[false,false]}
JSON
```

- [ ] **Step 2: Launch against it**

```bash
BLANC_TEST=1 /Users/anthony/Projects/Blanc/node_modules/.bin/electron . --user-data-dir=/tmp/blanc-quiet-check
```

`BLANC_TEST=1` skips the network ad-engine build, so the app launches immediately instead of waiting on EasyList; `--user-data-dir` keeps your real profile untouched.

Expected on screen:
- Two tabs restore. `https://example.com/` is active and its page renders.
- The pill's second dot renders as a small solid core rather than a filled dot — Phase 3's quiet treatment.
- Press ⌘L. The second row shows the title **Seeded Example Org** (proving the meta column round-tripped) and a `quiet` tag beside it. The first row has no tag.

If the second row says "New Tab" instead, the meta column did not reach the record — re-check Tasks 405 and 408.

- [ ] **Step 3: Wake it**

Click the second row in the ⌘L panel.

Expected: `https://example.org/` loads and becomes active, the `quiet` tag disappears from it, and the *first* row keeps its title. This is the path that fails if Task 409's snapshot-less branch is missing — a restored tab has no `sleepSnapshots` entry, so a wake that only knows how to `restore()` lands blank or throws.

- [ ] **Step 4: Check what got persisted, then clean up**

Quit the app (⌘Q), then:

```bash
python3 -m json.tool /tmp/blanc-quiet-check/session.json
```

Expected in the output:
- `windows[0].meta` is an array of two `{title, favicon}` objects, with real page titles (`Example Domain`) rather than the seeded placeholders — the running app re-derived them.
- There is **no** top-level `meta` key. The flat mirror carries exactly `urls`, `activeIndex`, `groups`, `groupIds`, `pinned`.
- `version` is still `1`.

Then clean up: `rm -rf /tmp/blanc-quiet-check`

- [ ] **Step 5: Commit**

Nothing to commit — this task changes no files. If any expectation above failed, fix the responsible task and re-run this one before moving to Phase 5.

```bash
git status --porcelain   # expect no output
```

---

## Phase 5: Controls, substrate, and product surfaces

At the end of this phase Quiet Tabs is **controllable and documented**: a *Quiet inactive tabs* row in Settings → General (key `tabSleep`, values `off | 30m | 1h | 6h`, default `1h`, guarded end-to-end by the settings substrate and never synced), a `/sleep` command wired through a new `chrome:sleep-background-tabs` IPC channel that quiets every eligible background tab even when the setting is Off, and the paper trail: `spec/` (F31, D8 amendment, D23, parity matrix, acceptance index), `CLAUDE.md`/`AGENTS.md`, a release-notes file, and a `/features/quiet-tabs` page on the marketing site.

Verify the whole phase with the §13 command sequence, in this order: `npm run copy:build && npm run copy:check`, `npm run settings:build && npm run settings:check`, `npm run substrate:check`, `npm run test:unit`, `npm run test:acceptance:dry`, `npm run test:acceptance:desktop`, `npm run site:build` — all green, and `git status --porcelain` empty afterwards (Task 514 walks this).

---

## Before you start — environment

Every path below is relative to the worktree root
`/Users/anthony/Projects/Blanc/.claude/worktrees/git-pull-39aa2a`. Run every command from
there.

`node_modules` is **not** installed in the worktree. If any `node --test` or `npm run …`
command fails with `Cannot find module 'electron'` or `command not found: cucumber-js`, run
`npm install` in the worktree root once, then retry. The site is a separate npm project: if
`npm run site:build` fails with a missing dependency, run `npm --prefix site install` first.

**Do not bump `version` in `package.json`.** `test/unit/press-kit.test.js:54` pins it to
`1.1.0` and the press page carries the same constant; the release runbook bumps both. Task 511
adds `docs/press/release-notes/v1.2.0.md` ahead of that bump, which is fine — that test only
requires a file for the *current* version to exist.

This phase consumes symbols that phases 1–4 landed in `src/main/main.js`:
`sleepCandidates` (from `src/main/tab-sleep.js`), `sleepTab(id)`, the `sleepSnapshots` Map,
the `popupChildCounts` Map, and `runtime.permissionPrompts` values shaped `{resolve, tabId}`.
If `grep -n "async function sleepTab" src/main/main.js` prints nothing, stop: phase 2 has not
landed and Tasks 504–505 cannot be verified.

---

### Task 501: The `tabSleep` setting in `settings.js`

**Files:**
- Modify: `src/main/settings.js:20` (new enum const), `:88-89` (DEFAULTS), `:197` (sanitize), `:352` (exports)
- Test: `test/unit/tab-sleep-settings.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier phases.
- Produces: `settings.TAB_SLEEP_DELAYS` (`['off', '30m', '1h', '6h']`), `getSettings().tabSleep`
  (default `'1h'`), and the guarantee that `tabSleep` never appears in `exportForSync().values`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/tab-sleep-settings.test.js`. This is house test style (2): a fake `electron`
module is pushed into `require.cache` so `settings.js` — which requires `electron` for
`app.getPath('userData')` — loads against a throwaway temp directory. Modelled line-for-line on
the existing `test/unit/tab-layout-settings.test.js`.

It pins three things that break silently if any one edit is skipped: the enum exists and has
exactly those four ids in that order; the default is `1h`; and — the one with real
consequences — a value outside the enum is **dropped** by `sanitize()` rather than stored, and
the key never reaches the sync payload.

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

// settings.js requires electron only for app.getPath('userData'); stub it so the
// store writes into a temp dir. Same shape as tab-layout-settings.test.js.
const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    app: {
      getPath: () => activeUserData,
      on: () => {},
    },
  },
};

function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  return require('../../src/main/settings');
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

test('the quiet-tabs delay defaults to 1h, validates its enum, and never syncs', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-tab-sleep-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const settings = loadSettings(userData);

  assert.deepEqual(settings.TAB_SLEEP_DELAYS, ['off', '30m', '1h', '6h']);
  assert.equal(settings.getSettings().tabSleep, '1h');

  assert.equal(settings.setSettings({ tabSleep: 'off' }).tabSleep, 'off');
  assert.equal(settings.setSettings({ tabSleep: '6h' }).tabSleep, '6h');

  // Out-of-enum values are DROPPED by sanitize(), never stored — the last good
  // value survives. Without the sanitize clause the row would appear to work in
  // the UI and persist nothing, which is the failure this pins.
  assert.equal(settings.setSettings({ tabSleep: '12h' }).tabSleep, '6h');
  assert.equal(settings.setSettings({ tabSleep: 3600000 }).tabSleep, '6h');
  assert.equal(settings.setSettings({ tabSleep: null }).tabSleep, '6h');

  // Memory policy is device-local, like tabLayout: it must never reach the sync
  // payload at any value (SYNCED_KEYS stays unchanged — assert the exclusion).
  assert.equal(
    Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'tabSleep'),
    false
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tab-sleep-settings.test.js`

Expected: FAIL on the first assertion —
`Expected values to be strictly deep-equal:` with `undefined` on one side and
`[ 'off', '30m', '1h', '6h' ]` on the other (`settings.TAB_SLEEP_DELAYS` does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Four edits to `src/main/settings.js`.

**(a)** Immediately after line 20 (`const TAB_LAYOUTS = ['island', 'vertical'];`), before the
`// Network-privacy enums` comment, insert:

```js
// Quiet Tabs idle delay. Device-local memory policy — deliberately NOT in SYNCED_KEYS.
// settings-schema/build.mjs parses this array by name, so keep it a bare
// single-quoted array literal on one line.
const TAB_SLEEP_DELAYS = ['off', '30m', '1h', '6h'];
```

**(b)** In `DEFAULTS`, between `verticalTabsWidth` and `appIcon`, insert the new key. It must be
on its own line, indented two spaces, single-quoted — `settings-schema/build.mjs` matches it
with `/^\s*tabSleep:\s*'([^']*)'/m`:

```js
  verticalTabsWidth: VERTICAL_TABS_DEFAULT_WIDTH,
  // Quiet Tabs: how long a background tab may sit untouched before Blanc frees
  // its renderer. 'off' disables auto-quieting; /sleep still works.
  tabSleep: '1h',
  appIcon: 'paper',
```

**(c)** In `sanitize()`, immediately after the `TAB_LAYOUTS` clause (line 197), insert:

```js
  if (TAB_SLEEP_DELAYS.includes(partial.tabSleep)) clean.tabSleep = partial.tabSleep;
```

**(d)** In `module.exports`, immediately after `TAB_LAYOUTS,` (line 352), insert:

```js
  TAB_SLEEP_DELAYS,
```

Do **not** touch `SYNCED_KEYS` (line 31). Its unchanged state is the assertion at the end of the
test.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tab-sleep-settings.test.js`

Expected: PASS — `# pass 1`, `# fail 0`.

`npm run settings:check` is **expected to fail** at this point with
`defaults.tabSleep: in settings.js but not schema.json — add it as a setting, or list it in schema.json "internalDefaults" if it is desktop-only`.
Task 502 fixes it. Do not run `npm run substrate:check` until then, and do not "fix" it by
adding `tabSleep` to `internalDefaults` — that is Route A, which the spec rejects.

- [ ] **Step 5: Commit**

```bash
git add src/main/settings.js test/unit/tab-sleep-settings.test.js
git commit -m "Add the tabSleep setting: a device-local Quiet Tabs idle delay"
```

---

### Task 502: Schema + mobile generation for `tabSleep` (Route B)

**Files:**
- Modify: `settings-schema/schema.json`, `settings-schema/build.mjs:24` / `:45` / `:64` / `:81` / `:94` / `:119` / `:134` / `:141` / `:153` / `:180`
- Modify (regenerated, never hand-edited): `settings-schema/generated/BlancSettings.swift`, `settings-schema/generated/BlancSettings.kt`
- Test: `test/unit/tab-sleep-settings.test.js` (extend)

**Interfaces:**
- Consumes: `TAB_SLEEP_DELAYS` and `DEFAULTS.tabSleep` from Task 501.
- Produces: `schema.json` keys `tabSleepDelays` and `defaults.tabSleep`; generated symbols
  `BlancTabSleepDelay` (Swift + Kotlin) and `BlancSettingsDefaults.tabSleep`.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/tab-sleep-settings.test.js` (top-level, after the existing test). This is
the assertion that keeps the feature on **Route B**: the setting really reaches the generated
mobile artifacts, rather than being allowlisted away as desktop-only.

```js
const settingsSchema = require('../../settings-schema/schema.json');

test('the delay enum reaches the schema and both generated mobile artifacts', () => {
  assert.deepEqual(settingsSchema.tabSleepDelays, ['off', '30m', '1h', '6h']);
  assert.equal(settingsSchema.defaults.tabSleep, '1h');
  // Route B, not Route A: tabSleep is a real cross-platform setting, so it must
  // NOT be hidden behind the desktop-only allowlist.
  assert.equal(settingsSchema.internalDefaults.includes('tabSleep'), false);
  assert.ok(settingsSchema.settings.some((s) => s.key === 'tabSleep'));

  const generated = (name) =>
    fs.readFileSync(path.join(__dirname, '../../settings-schema/generated/', name), 'utf8');
  const swift = generated('BlancSettings.swift');
  const kotlin = generated('BlancSettings.kt');

  assert.match(
    swift,
    /public enum BlancTabSleepDelay: String, CaseIterable \{ case off, m30 = "30m", h1 = "1h", h6 = "6h" \}/
  );
  assert.match(swift, /public static let tabSleep: BlancTabSleepDelay = \.h1/);
  assert.match(
    kotlin,
    /enum class BlancTabSleepDelay\(val id: String\) \{ OFF\("off"\), M30\("30m"\), H1\("1h"\), H6\("6h"\) \}/
  );
  assert.match(kotlin, /val tabSleep = BlancTabSleepDelay\.H1/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tab-sleep-settings.test.js`

Expected: FAIL on `assert.deepEqual(settingsSchema.tabSleepDelays, …)` —
`Expected values to be strictly deep-equal:` `undefined` vs `[ 'off', '30m', '1h', '6h' ]`.

- [ ] **Step 3: Write minimal implementation**

**(a) `settings-schema/schema.json`** — three insertions.

After the `"secureDnsOptions": [...]` line, add:

```json
  "$tabSleepDelays": "Quiet Tabs idle delay (F31). Device-local memory policy: never in Profile Sync. 'off' disables automatic quieting; the manual /sleep command still works.",
  "tabSleepDelays": ["off", "30m", "1h", "6h"],
```

Inside `"defaults"`, after `"usagePing": true,`, add:

```json
    "tabSleep": "1h",
```

Inside `"settings"`, after the `usagePing` entry, add:

```json
    { "key": "tabSleep", "type": "enum", "enum": "tabSleepDelays", "default": "1h", "note": "device-local; not synced; 'off' stops future quieting and never wakes an already-quiet tab" },
```

**(b) `settings-schema/build.mjs`** — six insertions.

After line 24 (`const upper = (id) => id.toUpperCase();`):

```js
// '30m' → m30, '1h' → h1: Swift and Kotlin identifiers cannot start with a digit,
// so a leading-digit delay id moves its trailing unit letter to the front.
const sleepCase = (id) => (/^\d/.test(id) ? id.slice(-1) + id.slice(0, -1) : id);
```

In `genSwift`, after line 45 (the `out += '}\n\n';` that closes `BlancSecureDns`):

```js
  const sleepCases = spec.tabSleepDelays
    .map((v) => (sleepCase(v) === v ? sleepCase(v) : `${sleepCase(v)} = "${v}"`))
    .join(', ');
  out += `public enum BlancTabSleepDelay: String, CaseIterable { case ${sleepCases} }\n\n`;
```

In `genSwift`, after line 64 (the `usagePing` default line):

```js
  out += `    public static let tabSleep: BlancTabSleepDelay = .${sleepCase(spec.defaults.tabSleep)}\n`;
```

In `genKotlin`, after line 81 (the `BlancSecureDns` enum emission):

```js
  out += `enum class BlancTabSleepDelay(val id: String) { ${spec.tabSleepDelays.map((v) => `${upper(sleepCase(v))}("${v}")`).join(', ')} }\n\n`;
```

In `genKotlin`, after line 94 (the `usagePing` default line):

```js
  out += `    val tabSleep = BlancTabSleepDelay.${upper(sleepCase(spec.defaults.tabSleep))}\n`;
```

In `parseSettingsJs`, after line 119 (the `secureDnsOptions` pair of lines):

```js
  const tabSleepBlock = (js.match(/const TAB_SLEEP_DELAYS = \[([^\]]*)\]/)?.[1] ?? '').replace(/\/\/.*$/gm, '');
  const tabSleepDelays = [...tabSleepBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
```

In the same function's `defaults` object, after the `usagePing:` line (134):

```js
    tabSleep: s(/^\s*tabSleep:\s*'([^']*)'/m),
```

In the same function's `return` (line 141), add `tabSleepDelays` to the returned object so it
reads:

```js
  return { engines, themes, webrtcPolicies, secureDnsOptions, tabSleepDelays, appIcons, supporterIcons, defaults, defaultKeys };
```

In `check()`, after line 153 (`cmp('secureDnsOptions', …)`):

```js
  cmp('tabSleepDelays', js.tabSleepDelays, spec.tabSleepDelays);
```

In `check()`, after line 180 (`eq('usagePing', …)`):

```js
  eq('tabSleep', jd.tabSleep, d.tabSleep);
```

**(c)** Regenerate — never hand-edit `settings-schema/generated/`:

```bash
npm run settings:build
```

Expected output: `wrote settings-schema/generated/BlancSettings.swift` and
`wrote settings-schema/generated/BlancSettings.kt`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tab-sleep-settings.test.js && npm run settings:check`

Expected: PASS (`# fail 0`) followed by
`settings:check OK — settings.js matches the schema, generated files current.`

- [ ] **Step 5: Commit**

```bash
git add settings-schema/schema.json settings-schema/build.mjs settings-schema/generated test/unit/tab-sleep-settings.test.js
git commit -m "Guard and generate tabSleep through the settings substrate (Route B)"
```

---

### Task 503: The Settings → General row

**Files:**
- Modify: `src/renderer/pages/settings.html:52` (after the `#tabLayoutSetting` block)
- Modify: `src/renderer/pages/settings.js:50` (after the tab-presentation block)
- Test: `test/unit/tab-sleep-settings.test.js` (extend)

**Interfaces:**
- Consumes: `settings.tabSleep` in the `pages:settings:get` payload (it rides through
  `clientSettings()`'s spread at `src/main/pages.js:168-175` for free — no main-process change),
  and `pages:settings:set` validation from Task 501.
- Produces: DOM ids `tabSleepSetting` (wrapper) and `tabSleep` (select).

- [ ] **Step 1: Write the failing test**

Append to `test/unit/tab-sleep-settings.test.js`. Reading the source is the right level here:
the row's failure modes are all textual — a missing wrapper id (so a platform that does not
support the feature cannot remove the row), option values that drift from the enum (so the
select writes a value `sanitize()` drops), and copy that promises a *resumed* page, which spec
§7 forbids because wake is a reload.

```js
test('the Settings row exposes exactly the delay enum and removes itself when unsupported', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/pages/settings.html'), 'utf8');
  const page = fs.readFileSync(
    path.join(__dirname, '../../src/renderer/pages/settings.js'), 'utf8');

  const block = html.match(/<div class="setting" id="tabSleepSetting">[\s\S]*?<\/select>/)?.[0];
  assert.ok(block, 'no #tabSleepSetting row in settings.html');
  assert.match(block, /<span>Quiet inactive tabs<\/span>/);
  assert.match(block, /reloads them when you come back to them\./);
  // Spec §7: the promise is "reload", never "resume".
  assert.doesNotMatch(block, /resume/i);
  // The internal field is `asleep`; every user-visible string says "quiet".
  assert.doesNotMatch(block, /asleep/i);

  const values = [...block.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(values, ['off', '30m', '1h', '6h']);
  const labels = [...block.matchAll(/<option value="[^"]+">([^<]+)<\/option>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Off', 'After 30 minutes', 'After 1 hour', 'After 6 hours']);

  // Guard-then-remove: a platform without the feature must never getElementById
  // into a removed container (pages/settings.js:43-50 precedent).
  assert.match(page, /if \(supports\('tabSleep'\)\)/);
  assert.match(page, /getElementById\('tabSleepSetting'\)\?\.remove\(\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tab-sleep-settings.test.js`

Expected: FAIL with `no #tabSleepSetting row in settings.html`.

- [ ] **Step 3: Write minimal implementation**

**(a)** In `src/renderer/pages/settings.html`, between the `</div>` that closes
`<div class="setting" id="tabLayoutSetting">` and `<div class="setting" id="appIconSetting">`,
insert:

```html
            <div class="setting" id="tabSleepSetting">
              <div class="label">
                <span>Quiet inactive tabs</span>
                <span class="hint">Blanc frees the memory of tabs you have not opened in a while, and reloads them when you come back to them.</span>
              </div>
              <select id="tabSleep" aria-label="Quiet inactive tabs">
                <option value="off">Off</option>
                <option value="30m">After 30 minutes</option>
                <option value="1h">After 1 hour</option>
                <option value="6h">After 6 hours</option>
              </select>
            </div>
```

**(b)** In `src/renderer/pages/settings.js`, immediately after the tab-presentation block (the
one ending `document.getElementById('tabLayoutSetting')?.remove();` plus its closing `}`),
insert:

```js
  // --- Quiet Tabs idle delay (device-local memory policy) ---
  if (supports('tabSleep')) {
    const tabSleep = document.getElementById('tabSleep');
    tabSleep.value = settings.tabSleep ?? '1h';
    tabSleep.addEventListener('change', () =>
      window.bowserPages.settings.set({ tabSleep: tabSleep.value }));
  } else {
    document.getElementById('tabSleepSetting')?.remove();
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tab-sleep-settings.test.js`

Expected: PASS — `# fail 0`.

Optional manual check (the settings page is served over `blanc://`, so a plain reload is enough
— you do **not** need to restart for this file, unlike chrome-strip changes): `npm start`, press
⌘L, run `/settings`, and confirm the row sits under Tab layout showing "After 1 hour".

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/settings.html src/renderer/pages/settings.js test/unit/tab-sleep-settings.test.js
git commit -m "Add the Quiet inactive tabs row to Settings → General"
```

---

### Task 504: `chrome:sleep-background-tabs` — the manual quiet path

**Files:**
- Modify: `src/main/main.js` (new `sleepBackgroundTabsNow()` beside `sleepTab`; new `chromeHandle` after `main.js:2930`)
- Modify: `src/main/preload.js:76` (after `allowAdsOnActiveSite`)
- Test: `test/unit/sleep-command-wiring.test.js` (create)

**Interfaces:**
- Consumes (all from phase 2, in `main.js` module scope): `sleepCandidates(tabList, options)`,
  `async sleepTab(id) => Promise<boolean>`, `sleepSnapshots` (a Map), `popupChildCounts` (a Map),
  plus the pre-existing `rt()`, `tabs`, `broadcastTabs()`, `chromeHandle(channel, handler)`.
  `rt().permissionPrompts` values are `{resolve, tabId}`.
- Produces: `async function sleepBackgroundTabsNow(): Promise<string[]>` (the ids actually
  quieted), IPC channel `chrome:sleep-background-tabs`, bridge method
  `browserAPI.sleepBackgroundTabs()`.

- [ ] **Step 1: Write the failing test**

Create `test/unit/sleep-command-wiring.test.js`. House test style (3): `main.js` cannot be
`require`d in a unit test, so the function's **real source** is lifted with a regex and run in a
`vm` sandbox against fakes (precedent: `test/unit/settings-fanout-reload.test.js:8-19`).

What this pins: `/sleep` skips the idle wait and *nothing else* — it must hand the policy
function `ignoreThreshold: true` and `thresholdMs: null` while still passing the live
active-tab id, snapshot count, popup-child map, and permission-pending ids, because every safety
exclusion lives inside `sleepCandidates`. It must also never read the `tabSleep` setting, so it
works while the setting is Off.

```js
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const mainSource = read('src/main/main.js');

// main.js can't be required in a unit test; lift the real function and run it in
// a sandbox (precedent: settings-fanout-reload.test.js).
const fnSource = mainSource.match(
  /async function sleepBackgroundTabsNow\(\) \{[\s\S]*?\n\}/
)?.[0];

test('the /sleep helper is still present in main.js', () => {
  assert.ok(fnSource, 'sleepBackgroundTabsNow not found — update this test with it');
});

/** Run the real function against fakes and report what it asked for and did. */
async function run({
  tabList, activeTabId, prompts = [], snapshotCount = 0, candidates = null, refuse = [],
}) {
  const seen = {};
  const slept = [];
  let broadcasts = 0;
  const sandbox = {
    Date, Set, Map, console,
    rt: () => ({
      tabOrder: tabList.map((t) => t.id),
      activeTabId,
      permissionPrompts: new Map(prompts.map((p, i) => [`p${i}`, p])),
    }),
    tabs: new Map(tabList.map((t) => [t.id, t])),
    sleepCandidates: (list, options) => {
      seen.list = list;
      seen.options = options;
      return candidates ?? list.filter((t) => t.id !== activeTabId).map((t) => t.id);
    },
    sleepSnapshots: { size: snapshotCount },
    popupChildCounts: new Map([['t9', 1]]),
    sleepTab: async (id) => {
      if (refuse.includes(id)) return false;
      slept.push(id);
      return true;
    },
    broadcastTabs: () => { broadcasts += 1; },
  };
  vm.runInNewContext(`${fnSource}\nthis.__fn = sleepBackgroundTabsNow;`, sandbox);
  const returned = await sandbox.__fn();
  return { seen, slept, broadcasts, returned };
}

test('the manual command bypasses the idle threshold and nothing else', async () => {
  const { seen } = await run({
    tabList: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
    activeTabId: 't1',
    snapshotCount: 7,
  });
  assert.equal(seen.options.ignoreThreshold, true);
  assert.equal(seen.options.thresholdMs, null);
  assert.equal(seen.options.activeTabId, 't1');
  assert.equal(seen.options.snapshotCount, 7, 'the 50-snapshot ceiling still applies');
  assert.equal(seen.options.popupChildCounts.get('t9'), 1);
  assert.equal(Number.isFinite(seen.options.now), true);
  // The whole tab order is offered — every exclusion belongs to sleepCandidates,
  // not to this caller.
  assert.deepEqual(seen.list.map((t) => t.id), ['t1', 't2', 't3']);
});

test('pending permission prompts are handed over by tab id', async () => {
  const { seen } = await run({
    tabList: [{ id: 't1' }, { id: 't2' }],
    activeTabId: 't1',
    prompts: [{ resolve() {}, tabId: 't2' }, { resolve() {} }],
  });
  assert.deepEqual([...seen.options.permissionPendingTabIds], ['t2']);
});

test('only tabs that actually went quiet are reported, under one broadcast', async () => {
  const r = await run({
    tabList: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
    activeTabId: 't1',
    refuse: ['t3'],
  });
  assert.deepEqual(r.slept, ['t2']);
  assert.deepEqual(r.returned, ['t2']);
  assert.equal(r.broadcasts, 1);
});

test('quieting nothing broadcasts nothing', async () => {
  const r = await run({
    tabList: [{ id: 't1' }],
    activeTabId: 't1',
    candidates: [],
  });
  assert.deepEqual(r.returned, []);
  assert.equal(r.broadcasts, 0);
});

test('the /sleep bridge and its IPC channel are wired end to end', () => {
  assert.match(
    read('src/main/preload.js'),
    /sleepBackgroundTabs: \(\) => ipcRenderer\.invoke\('chrome:sleep-background-tabs'\)/
  );
  assert.match(
    mainSource,
    /chromeHandle\('chrome:sleep-background-tabs', \(\) => sleepBackgroundTabsNow\(\)\)/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/sleep-command-wiring.test.js`

Expected: FAIL with
`sleepBackgroundTabsNow not found — update this test with it`, plus a cascade of
`TypeError: sandbox.__fn is not a function` from the four sandbox tests.

- [ ] **Step 3: Write minimal implementation**

**(a)** In `src/main/main.js`, immediately **below** the closing brace of
`async function sleepTab(id) { … }` (find it with
`grep -n "async function sleepTab" src/main/main.js`), insert:

```js
/** `/sleep`: quiet every eligible BACKGROUND tab right now.
 *
 *  The manual command skips the idle wait (spec §9) and NOTHING else — every
 *  §4.2 safety exclusion (audible, media-bearing, muted, pinned, adopted,
 *  opener families, non-refetchable commits, pending permission prompts, deep
 *  scroll, unsaved input) still runs inside sleepCandidates/sleepTab.
 *
 *  It deliberately never reads settings.tabSleep, so it works while the setting
 *  is Off. `thresholdMs: null` is safe precisely because ignoreThreshold is set.
 *  @returns {Promise<string[]>} the ids that actually went quiet.
 */
async function sleepBackgroundTabsNow() {
  const runtime = rt();
  const list = runtime.tabOrder.map((tid) => tabs.get(tid)).filter(Boolean);
  const permissionPendingTabIds = new Set(
    [...runtime.permissionPrompts.values()].map((p) => p?.tabId).filter(Boolean)
  );
  const ids = sleepCandidates(list, {
    now: Date.now(),
    thresholdMs: null,
    activeTabId: runtime.activeTabId,
    ignoreThreshold: true,
    snapshotCount: sleepSnapshots.size,
    permissionPendingTabIds,
    popupChildCounts,
  });
  const quieted = [];
  for (const id of ids) {
    if (await sleepTab(id)) quieted.push(id);
  }
  // The panel stays open (keepOverlay), so the dimmed rows are the only receipt
  // Blanc can give — make sure they land in one broadcast.
  if (quieted.length) broadcastTabs();
  return quieted;
}
```

**(b)** In `src/main/main.js`, immediately after
`chromeHandle('chrome:adblock-exempt-active', () => runAllowAdsCommand());` (line 2930),
insert:

```js
  chromeHandle('chrome:sleep-background-tabs', () => sleepBackgroundTabsNow());
```

**(c)** In `src/main/preload.js`, immediately after the `allowAdsOnActiveSite` line (76),
insert:

```js
  sleepBackgroundTabs: () => ipcRenderer.invoke('chrome:sleep-background-tabs'),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/sleep-command-wiring.test.js`

Expected: PASS — six tests, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js src/main/preload.js test/unit/sleep-command-wiring.test.js
git commit -m "Wire chrome:sleep-background-tabs for the manual quiet path"
```

---

### Task 505: `/sleep` in all four positional copies

**Files:**
- Modify: `copy/slash-commands.json` (after the `/mute` entry)
- Modify: `src/renderer/overlay.js:535` (after the `/mute` `COMMANDS` entry)
- Modify: `src/renderer/pages/shortcuts.js:16` (after the `/mute` tuple)
- Modify: `src/main/main.js:3090` (after the `/mute` tuple in `SLASH_COMMANDS`)
- Modify (regenerated): `copy/generated/SlashCommands.strings`, `copy/generated/slash_commands.xml`
- Test: `test/unit/sleep-command-wiring.test.js` (extend)

**Interfaces:**
- Consumes: `browserAPI.sleepBackgroundTabs()` from Task 504.
- Produces: the `/sleep` command at **index 11** in all four hand-synced lists.

**Why index 11:** `copy/build.mjs:54-66` (`diffList`) compares the four lists **positionally**,
element by element. `/pin` is index 9 and `/mute` is index 10 in
`copy/slash-commands.json`, so `/sleep` goes immediately after `/mute` and before `/group` — at
index 11 — in **all four**, or the check fails.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/sleep-command-wiring.test.js`:

```js
test('/sleep sits at the same index in all four hand-synced copies', () => {
  const json = JSON.parse(read('copy/slash-commands.json'));
  const index = json.commands.findIndex((c) => c.command === '/sleep');
  assert.equal(index, 11, '/sleep must follow /mute and precede /group');
  const entry = json.commands[index];
  assert.equal(entry.hint, 'Put background tabs to sleep and free their memory');
  assert.equal(entry.doc, undefined, 'no doc override: all three copies use the same hint');
  // The three JS copies are single-quoted literals; an apostrophe in the hint
  // would end the string and break copy/build.mjs's parsers.
  assert.doesNotMatch(entry.hint, /'/);

  const overlay = read('src/renderer/overlay.js');
  const overlayCommands = [...overlay.matchAll(/^\s*\{\s*cmd: '([^']+)'/gm)].map((m) => m[1]);
  assert.equal(overlayCommands.indexOf('/sleep'), index);

  const tupleIndex = (source) => {
    const block = source.match(/const SLASH_COMMANDS = \[([\s\S]*?)\];/)[1];
    return [...block.matchAll(/^\s*\['([^']+)'/gm)].map((m) => m[1]).indexOf('/sleep');
  };
  assert.equal(tupleIndex(read('src/renderer/pages/shortcuts.js')), index);
  assert.equal(tupleIndex(mainSource), index);

  // copy/build.mjs:44 reads cmd AND hint off the entry's first line, in single
  // quotes. keepOverlay keeps the panel open so the dimmed rows are the receipt
  // (Blanc has no toast surface; /find is the precedent).
  const line = overlay.split('\n').find((l) => l.includes("cmd: '/sleep'"));
  assert.match(line, /hint: 'Put background tabs to sleep and free their memory'/);
  assert.match(line, /window\.browserAPI\.sleepBackgroundTabs\(\)/);
  assert.match(line, /keepOverlay: true/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/sleep-command-wiring.test.js`

Expected: FAIL with
`/sleep must follow /mute and precede /group` — the actual value is `-1` (no `/sleep` anywhere).

**Now see the positional-index failure signature for yourself.** Add *only* the JSON entry from
Step 3(a), then run `npm run copy:check`. Expected FAIL, and the shape of the output is the
thing to learn:

```
DRIFT (desktop copy vs slash-commands.json):
  overlay.js #11: got {"/group" / "Type a space, then a group name — e.g. "work""}, source says {"/sleep" / "Put background tabs to sleep and free their memory"}
  overlay.js #12: got {"/ungroup" / "Take this tab out of its group"}, source says {"/group" / "Type a space, then a group name — e.g. "work""}
  … one line per index from 11 to 17 …
  overlay.js[18]: missing "/theme"
  shortcuts.js #11: … same cascade …
  shortcuts.js[18]: missing "/theme [system|light|dark]"
  main.js #11: … same cascade …
  main.js[18]: missing "/theme [system|light|dark]"
STALE: copy/generated/SlashCommands.strings — run `npm run copy:build`
STALE: copy/generated/slash_commands.xml — run `npm run copy:build`

copy:check failed.
```

**That cascade is the signature of a wrong positional index**: every index from the insertion
point onward is off by one and the last index reports `missing`. If you ever see it *after*
editing all four files, one file got `/sleep` at a different index — count entries from zero in
the file the message names, not in the JSON.

- [ ] **Step 3: Write minimal implementation**

**(a)** `copy/slash-commands.json` — after the `/mute` line, before `/group`:

```json
    { "command": "/sleep", "hint": "Put background tabs to sleep and free their memory" },
```

**(b)** `src/renderer/overlay.js` — in `COMMANDS`, after the `/mute` entry (line 535), before
the `/group` entry. `cmd` and `hint` must both stay on this first line, in single quotes:

```js
    { cmd: '/sleep', hint: 'Put background tabs to sleep and free their memory', run: () => window.browserAPI.sleepBackgroundTabs(), keepOverlay: true },
```

**(c)** `src/renderer/pages/shortcuts.js` — in `SLASH_COMMANDS`, after the `/mute` tuple
(line 16):

```js
  ['/sleep', 'Put background tabs to sleep and free their memory'],
```

**(d)** `src/main/main.js` — in `SLASH_COMMANDS`, after the `/mute` tuple (line 3090), the
identical tuple:

```js
  ['/sleep', 'Put background tabs to sleep and free their memory'],
```

**(e)** Regenerate the mobile string resources — never hand-edit `copy/generated/`:

```bash
npm run copy:build
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/sleep-command-wiring.test.js && npm run copy:check`

Expected: PASS (`# fail 0`) followed by
`copy:check OK — all three desktop copies match the source, generated files current.`

Manual check (chrome renderers only load once, so **restart** — a plain ⌘R will not pick this
up): `npm start`, open a second tab, switch back to the first, press ⌘L, type `/sleep`, press
Return. The panel stays open and the other row dims.

- [ ] **Step 5: Commit**

```bash
git add copy/slash-commands.json copy/generated src/renderer/overlay.js src/renderer/pages/shortcuts.js src/main/main.js test/unit/sleep-command-wiring.test.js
git commit -m "Add the /sleep command across all four hand-synced copies"
```

---

### Task 506: `spec/features.md` — F31, the F2 correction, and F18's `meta`

**Files:**
- Modify: `spec/features.md:51-53` (F2's third bullet), F18's bullet list, end of file (new F31)

**Interfaces:**
- Consumes: nothing executable.
- Produces: feature id **F31**, referenced by Tasks 507–509. (Never F29 — `spec/README.md:90`
  forbids id reuse and F29's provenance is unrecorded.)

- [ ] **Step 1: Write the failing test**

There is no automated guard on `spec/` — this is the manual obligation `spec/README.md` makes
non-optional. The "test" is the pre-edit state: run

```bash
grep -n "never destroys inactive tabs" spec/features.md; grep -c "^## F31" spec/features.md
```

Expected now: the grep prints line 51 with the stale claim, and the count prints `0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `grep -c "^## F31 — Quiet Tabs" spec/features.md`

Expected: prints `0` — F31 does not exist yet.

- [ ] **Step 3: Write minimal implementation**

**(a)** Replace F2's third bullet (lines 51-53) — the claim that desktop never destroys an
inactive tab's state is false the day this ships:

```md
- Switching tabs never loses an inactive tab's identity. On every platform an
  inactive tab may have its renderer discarded to reclaim memory — on desktop
  deliberately, after an idle delay the person controls (F31); on mobile because
  the OS evicts it (D8) — and it returns with its identity, title, address, and
  back-history intact.
```

**(b)** In F18, after the bullet beginning "The desktop shape is `session.json`", add:

```md
- The desktop file carries an optional **`meta`** array parallel to `urls`
  (`{title, favicon}` per tab) so a restored tab is scannable before it is ever
  loaded. It is written only into `windows[0]`, never into the flat mirror, and
  it is cleared whenever browsing history is cleared.
```

**(c)** Append F31 at the end of the file, after F30:

```md

## F31 — Quiet Tabs

- A tab nobody has looked at for a while may have its **renderer discarded** to
  give its memory back; the tab itself stays in the session, in the pill, in the
  rail, and in the switcher. Coming back to it rebuilds the page.
- The delay is a setting — **Quiet inactive tabs**: off / 30m / 1h / 6h,
  default 1h — plus a manual `/sleep` command that quiets every eligible
  background tab now. The command skips only the waiting; every safety exclusion
  below still applies, and it works while the setting is off. Turning the setting
  off stops *future* quieting: it never wakes an already-quiet tab and never
  discards its recovery data.
- **Never quieted:** the active tab; a tab playing, having played, or muted
  media; a pinned tab; a tab with unsaved input anywhere in its frame tree, or
  whose page objects to unloading; a tab whose last page came from a form
  submission or an error; a tab with a pending permission prompt; a tab in an
  opener/child family, including a popup window that is not a tab; a
  deep-scrolled page.
- **What coming back promises:** identity, title, address, and back-history
  return, and the page is **reloaded** — not resumed. Scroll and typed values
  return on ordinary static documents and are explicitly not promised on
  virtualized feeds (D23). A private tab comes back **where** it was, not **how**
  it was: private tabs retain no page state.
- **The state is visible, and it is called "quiet"** everywhere a person or a
  screen reader can meet it — a smaller pill dot (never the private treatment), a
  `quiet` tag on the panel row and in its accessible name, a rail marker with a
  dimmed favicon, and `· quiet` in the Quick Switcher. It is deliberately
  unmarked in the native window menu and on the start page.
- Restored sessions come back quiet: after a relaunch only the active tab loads
  (F18).
- The *behaviour* is D8; *who decides when* is D23.
- **Acceptance:** the scenarios in
  [`acceptance/quiet-tabs.feature`](./acceptance/quiet-tabs.feature) verify
  sleep/wake identity, the active tab never quieting, the exclusion outline,
  `/sleep` with the panel open, the quiet affordance and its accessible name, the
  settings outline including off, lazy restore, private sleep→wake isolation, no
  page state in `session.json` / the sync snapshot / `tabs:updated`, and a real
  drop in renderer-process count.
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
grep -c "^## F31 — Quiet Tabs" spec/features.md && grep -n "never destroys inactive tabs" spec/features.md; echo "exit=$?"
```

Expected: prints `1`, then the second grep prints nothing and `exit=1` (the stale claim is
gone). Also confirm F31 ends in an `Acceptance:` line — `grep -A2 "acceptance/quiet-tabs.feature" spec/features.md`
shows it.

- [ ] **Step 5: Commit**

```bash
git add spec/features.md
git commit -m "spec: add F31 Quiet Tabs, correct F2's lifecycle claim, name F18's meta column"
```

---

### Task 507: `spec/divergence-register.md` — amend D8, add D23

**Files:**
- Modify: `spec/divergence-register.md:189-205` (D8), end of file (new D23)

**Interfaces:**
- Consumes: F31 from Task 506.
- Produces: divergence id **D23** (never D21 — reuse is forbidden), referenced by Tasks 508–509.

- [ ] **Step 1: Write the failing test**

Run:

```bash
grep -n "every tab's view stays alive" spec/divergence-register.md; grep -c "^## D23" spec/divergence-register.md
```

Expected now: the first grep prints the stale Desktop bullet inside D8; the count prints `0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `grep -c "^## D23" spec/divergence-register.md`

Expected: prints `0`.

- [ ] **Step 3: Write minimal implementation**

**(a)** In D8, change the **Features** line to `**Features:** F2, F18, F31` and replace only the
Desktop bullet — `- **Desktop:** every tab's view stays alive; switching is attach/detach.` —
with:

```md
- **Desktop:** switching a tab is attach/detach and destroys nothing, but an
  *idle* background tab is a separate matter: its renderer is deliberately
  discarded and rebuilt on return (F31). That is a **convergence** toward the
  mobile behaviour below rather than a split from it — the difference left is who
  schedules it (D23).
```

Leave the Mobile bullet and the **Parity contract** paragraph **verbatim**. Extend the Status
line to:

```md
**Status:** Accepted; a shared "tab restore" acceptance scenario should exercise
this on mobile. Amended 2026-08-09: desktop now discards idle background
renderers by policy (F31), so the platforms differ in *when*, not *whether* — the
control surface is D23.
```

**(b)** Append at the end of the file:

```md

## D23 — Who decides when a background tab loses its renderer
**Features:** F31 (the behaviour itself is D8)

**Why:** Discarding a backgrounded web view is app-schedulable on desktop and
Android, and OS-governed on iOS — `WKWebView` suspension is not something an app
can schedule, only react to. The *behaviour* converged (D8); the *control* cannot.

- **Desktop:** app-scheduled and user-configurable — an idle delay
  (off / 30m / 1h / 6h, default 1h) plus a manual `/sleep` command that skips
  only the waiting.
- **Android:** app-scheduled and user-configurable on the same contract; the OS
  may additionally evict under memory pressure, which the app does not control.
- **iOS:** OS-governed. Surface no delay control at all; implement the restore
  path, and honour the same never-discard exclusions wherever the platform gives
  the app a say.

**Parity contract that still holds:** a backgrounded tab may lose its renderer on
any platform and returns with identity, title, and scroll intact; only the
control over *when* is platform-dependent.

**Scope of "scroll intact":** that clause, inherited from D8, is scoped to
**static documents**. A restored scroll offset is applied against a document
rebuilt from the initial response, so on an infinite-scroll or virtualized feed it
clamps to the bottom of the first page rather than returning to the same content.
Desktop's deep-scroll exclusion (F31) exists precisely so *automatic* quieting
never puts this contract in a position it cannot honour. A platform that discards
on the OS's schedule cannot make that promise for feeds and must not claim it.

**Tagging:** behaviour scenarios tag `@D8`; control-surface scenarios tag `@D23`.

**Status:** Accepted 2026-08-09.
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
grep -c "^## D23" spec/divergence-register.md && grep -n "every tab's view stays alive" spec/divergence-register.md; echo "exit=$?"
```

Expected: prints `1`, then nothing and `exit=1`. Confirm D8's parity contract is untouched:
`grep -A3 "Parity contract:.*from the user's view, a tab retains" spec/divergence-register.md`
still prints the original wording.

- [ ] **Step 5: Commit**

```bash
git add spec/divergence-register.md
git commit -m "spec: amend D8 for desktop renderer discard, add D23 for the control surface"
```

---

### Task 508: `spec/parity-matrix.md` — the F31 row and the F2/F18 cells

**Files:**
- Modify: `spec/parity-matrix.md:18` (F2 row), `:34` (F18 row), after the F30 row (new F31 row)

**Interfaces:**
- Consumes: F31 (Task 506), D23 (Task 507).
- Produces: the matrix row Task 509's coverage paragraph refers to.

- [ ] **Step 1: Write the failing test**

Run: `grep -c "^| F31 |" spec/parity-matrix.md`

Expected now: `0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `grep -c "^| F31 |" spec/parity-matrix.md`

Expected: prints `0`.

- [ ] **Step 3: Write minimal implementation**

**(a)** In the **F2** row, append to the *Parity contract* cell (before the trailing `| D8 |`):
` An inactive tab may have its renderer discarded and rebuilt (D8, F31) without losing identity, title, address, or back-history.`

**(b)** In the **F18** row, append to the *Parity contract* cell (before the trailing `| D8 |`):
` Plus an optional per-tab title/favicon \`meta\` column so restored tabs are scannable before they load.`

**(c)** Immediately after the F30 row, add:

```md
| F31 | Quiet Tabs (idle renderer discard) | SHIPPED | PLANNED | PLANNED | An idle background tab may have its renderer discarded and rebuilt on return with identity, title, address, and back-history intact; the page is reloaded, never resumed. Never applied to the active tab, media-bearing or muted tabs, pins, unsaved input, non-refetchable commits, pending permission prompts, opener families, or deep-scrolled pages. Restored sessions come back quiet. The state is called "quiet" in every user-visible and assistive string. | D8, D23 |
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
grep -c "^| F31 |" spec/parity-matrix.md && awk -F'|' '/^\| F31 \|/ {print NF}' spec/parity-matrix.md
```

Expected: prints `1`, then `9` — the same column count every other row has (leading and
trailing empty fields plus the seven columns). If it prints anything else, an unescaped `|`
crept into a cell.

- [ ] **Step 5: Commit**

```bash
git add spec/parity-matrix.md
git commit -m "spec: add the F31 parity row and amend the F2/F18 contracts"
```

---

### Task 509: `spec/acceptance/index.md` + the runnable tag list

**Files:**
- Modify: `spec/acceptance/index.md` (Files table, Grid, Coverage check)
- Modify: `test/desktop/cucumber.mjs:22-39` (`RUNNABLE`)

**Interfaces:**
- Consumes: `spec/acceptance/quiet-tabs.feature` and its step definitions, authored in phases
  2–4; F31 (Task 506) and D23 (Task 507).
- Produces: traceability rows `F31-1`…`F31-10`.

- [ ] **Step 1: Read the real scenario titles**

Run:

```bash
grep -n "^  @\|^  Scenario" spec/acceptance/quiet-tabs.feature
```

Expected: ten `@F31-n` tag lines each followed by a `Scenario:` line. **Write down the exact
titles** — the grid rows below use short labels, and where a label disagrees with the file's
real title, the file wins; edit the row to match it.

If this file does not exist, stop and finish phases 2–4 first: this task documents scenarios, it
does not author them.

- [ ] **Step 2: Run the check to verify it fails**

Run: `grep -c "F31-" spec/acceptance/index.md`

Expected: prints `0` — the scenarios exist but are untraced.

- [ ] **Step 3: Write minimal implementation**

**(a)** In the **Files** table, after the `Browser migration` row:

```md
| Quiet Tabs | `quiet-tabs.feature` | F31 (D8, D23) |
```

**(b)** In the **Grid**, after the `F30-3` row (adjust each Scenario label to the real title
from Step 1):

```md
| F31-1 | Quiet then wake restores identity, address, and back-history | D8 | ✅ | ⬜ | ⬜ |
| F31-2 | The active tab is never quieted | D8 | ✅ | ⬜ | ⬜ |
| F31-3 | Audio, pins, mutes, dirty input, adopted children, and POST results stay awake | D8 | ✅ | ⬜ | ⬜ |
| F31-4 | `/sleep` quiets background tabs with the panel open | D23 | ✅ | ➖ | ⬜ |
| F31-5 | The quiet affordance and its accessible name | D8 | ✅ | ⬜ | ⬜ |
| F31-6 | The delay setting, including Off leaving quiet tabs quiet | D23 | ✅ | ➖ | ⬜ |
| F31-7 | Relaunch restores tabs quiet and loads only the active one | D8 | ✅ | ⬜ | ⬜ |
| F31-8 | A private tab quiets and wakes inside the private session | D8 | ✅ | ⬜ | ⬜ |
| F31-9 | No page state in session.json, the sync snapshot, or tabs:updated | D8 | ✅ | ⬜ | ⬜ |
| F31-10 | Quieting N tabs drops the renderer-process count by N | D8 | ✅ | ⬜ | ⬜ |
```

(`➖` on iOS for F31-4 and F31-6: per D23 iOS surfaces no control at all, so those two scenarios
are N/A there rather than pending.)

**(c)** In **Coverage check**, first bullet, change the feature list to read
``Features `F1–F24`, `F27–F28`, `F30`, and `F31` have ≥1 Gherkin scenario.`` In the second
bullet, change `D1–D10, D12, D16, and D19` to `D1–D10, D12, D16, D19, and D23`.

**(d)** In `test/desktop/cucumber.mjs`, add to `RUNNABLE` after the `'@F30-1', '@F30-2', '@F30-3',`
line — **only the tags whose scenarios Step 1 showed in the feature file**:

```js
  '@F31-1', '@F31-2', '@F31-3', '@F31-4', '@F31-5',
  '@F31-6', '@F31-7', '@F31-8', '@F31-9', '@F31-10',
```

- [ ] **Step 4: Run the dry run to verify it passes**

Run: `npm run test:acceptance:dry`

Expected: PASS — a summary line reporting the scenario count with `0 failed` and, crucially,
**no** `Undefined` steps.

If it instead prints `Undefined. Implement with the following snippet:` followed by a step
stub, that scenario has no step definition yet: remove **that one tag** from `RUNNABLE` (leaving
its grid row with `⬜` in the Desktop column) and re-run. Never leave a tag in `RUNNABLE`
without a step definition — the dry run is exactly the guard against that.

- [ ] **Step 5: Commit**

```bash
git add spec/acceptance/index.md test/desktop/cucumber.mjs
git commit -m "spec: trace the F31 acceptance scenarios and make them runnable"
```

---

### Task 510: `CLAUDE.md` and `AGENTS.md`, in lockstep

**Files:**
- Modify: `CLAUDE.md:39` (correct the claim; add a Quiet Tabs paragraph after it)
- Modify: `AGENTS.md:39` (the identical edit — the two files are hand-mirrored with no automated guard)

**Interfaces:**
- Consumes: module names from phases 1–4 (`src/main/tab-sleep.js`, `src/main/tab-view.js`,
  `liveContents`, `sleepSnapshots`, the `session.json` `meta` column).
- Produces: nothing executable.

- [ ] **Step 1: Confirm the two files still agree on the line you are about to edit**

Run:

```bash
diff <(sed -n '39p' CLAUDE.md) <(sed -n '39p' AGENTS.md) && echo IDENTICAL
```

Expected: prints `IDENTICAL`. (The two documents have drifted elsewhere; line 39 is shared, and
that is the line carrying the now-false claim.)

- [ ] **Step 2: Run the check to verify it fails**

Run: `grep -c "Quiet Tabs" CLAUDE.md AGENTS.md`

Expected: `CLAUDE.md:0` and `AGENTS.md:0` — the architecture narrative still says switching tabs
never destroys anything, with no correction anywhere.

- [ ] **Step 3: Write minimal implementation**

In **both** files, in the line-39 paragraph, replace the exact clause

`so switching tabs is remove-one/add-another rather than destroying anything.`

with

`so switching tabs is remove-one/add-another rather than destroying anything — but an *idle background* tab is a separate matter, and its renderer is deliberately discarded (see **Quiet Tabs** below).`

Then, in **both** files, insert this paragraph immediately after that paragraph (as its own
blank-line-separated block):

```md
**Quiet Tabs.** An idle background tab's renderer is deliberately discarded to reclaim its memory (~148 MB/tab measured on Electron 43), and rebuilt when the tab is activated again. Policy is pure and unit-tested in `src/main/tab-sleep.js` (`sleepCandidates`, `trimSnapshot`, `TAB_SLEEP_DELAY_MS`) — no `require('electron')` in that file, ever. View construction and the whole per-tab listener set moved out of `createTab` into `src/main/tab-view.js` (`createTabView`, `wireTabView`, `initTabView`), which is also the single home of the private-session ternary: a woken private tab built with plain `TAB_WEB_PREFERENCES` would silently join `session.defaultSession` while the chrome still paints the dashed private pill. `main.js` owns `sleepTab`/`wakeTab`, the 30 s sweep, and the wake generation (`tab.wakeGeneration`) that suppresses history and `did-fail-load` across *every* hop of a redirect chain — a one-shot flag is not enough. **`liveContents(tab)` is the only correct liveness check**: after `wc.close()`, `view.webContents` reads back `undefined`, not destroyed, and dereferencing before testing killed the main process once (`main.js:2653-2662`). **The snapshot Map (`sleepSnapshots`) is main-process-only and must never move onto the tab record** — `serializeTabs` is an explicit allowlist precisely because anything on the record ships to both renderers ~10×/s, and the snapshot holds page state including POST bodies; don't introduce `crashReporter.start()` while it exists. `session.json` gains an optional `meta: [{title, favicon}]` array parallel to `urls`, written **only** into `windows[0]` and never into the flat mirror (a 1.0.x rollback rewrites the mirror's five keys and would strand a stale array zipped onto different URLs); `version` stays `1`. Restored tabs are born quiet and only the active one loads. Vocabulary is the Favorites/`bookmarks` split again: internals say `asleep`/`tabSleep`/`sleepSnapshots`, and **every** user-visible and assistive string says **"quiet"** — the one exception is the `/sleep` command and its hint, which are fixed copy. The delay lives in Settings → General (`tabSleep`, `off|30m|1h|6h`, default `1h`, deliberately out of `SYNCED_KEYS`); switching it to Off stops future quieting and never wakes anything or drops a snapshot.
```

- [ ] **Step 4: Run the check to verify it passes**

Run:

```bash
grep -c "Quiet Tabs" CLAUDE.md AGENTS.md && diff <(grep -n "^\*\*Quiet Tabs\.\*\*" -A0 CLAUDE.md) <(grep -n "^\*\*Quiet Tabs\.\*\*" -A0 AGENTS.md) && echo MIRRORED
```

Expected: both counts are `2` (the paragraph plus the cross-reference in the line-39 clause),
the diff is empty, and `MIRRORED` prints — the two files carry byte-identical text at the same
line number.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "Document Quiet Tabs in CLAUDE.md and AGENTS.md"
```

---

### Task 511: Release notes

**Files:**
- Create: `docs/press/release-notes/v1.2.0.md`

**Interfaces:**
- Consumes: the shipped behaviour.
- Produces: the file the release runbook picks up when `package.json` is bumped to 1.2.0.

Do **not** bump `package.json` here (`test/unit/press-kit.test.js:54` pins `1.1.0`).

- [ ] **Step 1: Read the voice you are matching**

Run: `cat docs/press/release-notes/v1.1.0.md`

Expected: `## Added` / `## Changed` / `## Fixed` sections of plain, unhyped sentences that
explain what the person will notice, closing with an `## Other platforms` line.

- [ ] **Step 2: Confirm the file does not exist yet**

Run: `ls docs/press/release-notes/v1.2.0.md`

Expected: FAIL with `No such file or directory`.

- [ ] **Step 3: Write minimal implementation**

Create `docs/press/release-notes/v1.2.0.md`:

```md
# Blanc 1.2.0

## Added

- Blanc now gives back the memory of tabs you have not opened in a while. A tab left alone past the delay you choose hands its page back to the system; it keeps its place in the Island, the rail, and the switcher, and reloads when you come back to it. Choose the delay — off, 30 minutes, 1 hour, or 6 hours — under Settings → General → Quiet inactive tabs. It is set to an hour to begin with, and the choice stays on this device.
- A quiet tab is marked as one wherever tabs are drawn: a smaller dot in the Island, a `quiet` tag on its row in the ⌘L panel, a marker in the vertical rail, and `· quiet` in the Quick Switcher. Screen readers hear the same word.
- Blanc leaves a tab alone when quieting it would cost you something: anything playing or that has played sound, anything muted or pinned, a page with something typed into it or a checkbox you ticked, a page that asks before you leave, a result of a form you submitted, a tab waiting on a permission prompt, a window it opened or was opened by, and a page you have scrolled deep into. The new `/sleep` command quiets every eligible background tab straight away — it skips the waiting and nothing else, and it works even with the delay set to off.
- Reopening Blanc is quicker. Restored tabs come back quiet with their titles and site icons already in place, and only the tab you were last using loads.

## Changed

- Turning the delay off stops Blanc quieting anything new. Tabs that are already quiet stay as they are and come back normally when you open them — switching the setting off never throws away what a quiet tab needs to return.

## Other platforms

All three platforms are built from the same `v1.2.0` source tag and published with one SHA-256 manifest.
```

- [ ] **Step 4: Verify**

Run:

```bash
node --test test/unit/press-kit.test.js && grep -ci "resume" docs/press/release-notes/v1.2.0.md
```

Expected: the press-kit test passes (`# fail 0` — it still requires only `v1.1.0.md`), and the
grep prints `0`: the notes promise a reload, never a resumed page.

- [ ] **Step 5: Commit**

```bash
git add docs/press/release-notes/v1.2.0.md
git commit -m "Add v1.2.0 release notes for Quiet Tabs"
```

---

### Task 512: The marketing site — `/features/quiet-tabs`

**Files:**
- Create: `site/src/pages/features/quiet-tabs.astro`
- Modify: `site/src/pages/features.astro` (new hub row; renumber the security row 08 → 09)
- Modify: `site/src/pages/sitemap.xml.js` (`MANIFEST`)
- Modify: `site/src/styles/site.css` (two rules for the quiet dot in the figure)

**Interfaces:**
- Consumes: `BaseLayout.astro`'s props (`title`, `description`, `path`, `page`, `current`,
  `ogDescription`, `ogImageAlt`), the existing `feature-page` / `feature-hero--text` /
  `product-capture` / `feature-copy-grid` / `truth-note` / `feature-close` classes.
- Produces: route `/features/quiet-tabs`, audited by Task 513.

Read `site/CLAUDE.md` first if you have not: the site is a self-contained Astro project with its
own `package.json`, `build.format: 'file'`, root-relative extensionless internal links, and one
stylesheet (`src/styles/site.css`, **not** under the root `tokens/` guard).

- [ ] **Step 1: Write the failing test — the sitemap manifest assertion**

The site already has the guard: `sitemap.xml.js` discovers real pages at build time and throws
if `MANIFEST` disagrees. So the failing test is a build with the page added and the manifest
not. Create only the page file for now — Step 3(a) — then build.

- [ ] **Step 2: Run the build to verify it fails**

Run: `npm run site:build`

Expected: FAIL with
`sitemap manifest out of sync — add to MANIFEST: [/features/quiet-tabs] / no page for: []`

(If it instead fails with a missing dependency, run `npm --prefix site install` and retry.)

- [ ] **Step 3: Write minimal implementation**

**(a)** Create `site/src/pages/features/quiet-tabs.astro`. It follows the
`features/vertical-tabs.astro` structure exactly: breadcrumb, text hero, one figure, a
three-article copy grid, a `truth-note` stating the honest limit, and a close CTA. No custom
`ogImage` (the `sync.astro` precedent — a bespoke OG capture is separate design work).

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
---
<BaseLayout
  title={"Quiet Tabs: Blanc Gives Back the Memory of Tabs You Are Not Using | Blanc Browser"}
  description={"Blanc frees the memory of tabs you have not opened in a while and reloads them when you come back. Choose the delay, or quiet them on demand — pinned, playing, and half-filled tabs are left alone."}
  path="/features/quiet-tabs"
  page="feature-quiet-tabs"
  current="features"
  ogDescription={"Tabs you are not using give their memory back and reload when you return. You choose the delay."}
  ogImageAlt={"Blanc Browser"}
>
  <script type="application/ld+json" is:inline slot="head">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://blancbrowser.com/"},{"@type":"ListItem","position":2,"name":"Features","item":"https://blancbrowser.com/features"},{"@type":"ListItem","position":3,"name":"Quiet tabs","item":"https://blancbrowser.com/features/quiet-tabs"}]}
</script>

<main class="feature-page feature-detail-page">
  <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">home</a><span aria-hidden="true">/</span><a href="/features">features</a><span aria-hidden="true">/</span><span aria-current="page">quiet tabs</span></nav>
  <section class="feature-hero feature-hero--detail feature-hero--text" aria-labelledby="quiet-title"><p class="section-kicker">a lighter session</p><h1 id="quiet-title">Tabs you are not using give their memory back.</h1><p>Leave a tab alone long enough and Blanc hands its page back to your computer. The tab stays exactly where it was in your session, and it reloads the moment you return to it.</p></section>
  <figure class="product-capture feature-capture">
    <div class="demo-stage island-figure" role="img" aria-label="Blanc's resting Island above a page: five tab dots, two of them drawn as smaller quiet cores for tabs whose memory has been given back.">
      <div class="demo-page" aria-hidden="true"><div class="bar w1"></div><div class="bar w2"></div><div class="bar w3"></div><div class="bar w4"></div></div>
      <div class="demo-island" aria-hidden="true">
        <div class="pill">
          <div class="dots"><span class="quiet"></span><span></span><span class="cur"></span><span></span><span class="quiet"></span></div>
          <span class="pill-fav"></span>
          <span class="domain">blancbrowser.com</span>
        </div>
      </div>
    </div>
    <figcaption>Two of these tabs are quiet. They keep their place in the Island until you go back to one.</figcaption>
  </figure>
  <section class="feature-copy-grid feature-copy-grid--top" aria-labelledby="quiet-behavior-title">
    <div><p class="section-kicker">how it works</p><h2 id="quiet-behavior-title">You choose the delay. Blanc does the rest.</h2></div>
    <div class="feature-copy-list">
      <article><h3>Set it once.</h3><p>Settings, General, Quiet inactive tabs: off, 30 minutes, 1 hour, or 6 hours. It starts at an hour, and the choice stays on this device rather than following you to another one.</p></article>
      <article><h3>Or say when.</h3><p>Type <code>/sleep</code> in the Island and every eligible background tab goes quiet immediately. It skips the waiting and nothing else, and it works even with the delay switched off.</p></article>
      <article><h3>Come back and it is there.</h3><p>Opening a quiet tab reloads the page and brings back its address, its title, and its back button. Nothing disappears from your session while it is quiet.</p></article>
    </div>
  </section>
  <section class="feature-copy-grid" aria-labelledby="quiet-safety-title">
    <div><p class="section-kicker">left alone</p><h2 id="quiet-safety-title">The tabs that would cost you something stay awake.</h2></div>
    <div class="feature-copy-list">
      <article><h3>Anything you are part way through.</h3><p>A half-filled form, a ticked checkbox, a page that asks before you leave, or the result of something you submitted. Blanc checks every frame on the page, not just the top one.</p></article>
      <article><h3>Anything playing, pinned, or connected.</h3><p>Sound, video you have paused, muted tabs, pinned tabs, a window a page opened for a sign-in, and any tab waiting on a permission prompt.</p></article>
      <article><h3>Anything you have read deep into.</h3><p>A page you have scrolled a long way down is left as it is, because a reloaded feed cannot honestly put you back where you were.</p></article>
    </div>
  </section>
  <aside class="truth-note" aria-labelledby="quiet-note-title"><p class="section-kicker">good to know</p><h2 id="quiet-note-title">A quiet tab reloads. It does not resume.</h2><p>Coming back fetches the page again, so anything the site was holding only in the browser is gone — and on an endlessly scrolling feed you land near where you were rather than exactly there. Private tabs come back where they were, not how they were: Blanc keeps no copy of a private page. Turning the setting off stops Blanc quieting anything new and leaves tabs that are already quiet exactly as they are.</p><a class="text-link" href="/features/island" data-track="feature_cta_click" data-feature="quiet-tabs" data-cta-position="truth-note">Meet the Island <span aria-hidden="true">↗</span></a></aside>
  <section class="feature-close" aria-labelledby="quiet-close-title"><p class="section-kicker">ready when you are</p><h2 id="quiet-close-title">Keep the tabs. Lose the weight.</h2><a class="cta" href="/download" data-track="feature_cta_click" data-feature="quiet-tabs" data-cta-position="feature-close">download blanc</a></section>
</main>
</BaseLayout>
```

**(b)** In `site/src/styles/site.css`, immediately after the line
`.demo-island .dots > span.cur { background: var(--accent); }` (line 140), add the two rules the
figure needs — mirroring the app's `.island-dot.asleep`, a smaller core in the same slot so the
gap never reflows:

```css
/* Quiet Tabs: a quieted tab keeps its slot and loses its weight — a smaller
   core in the same 7px cell, mirroring the app's .island-dot.asleep. */
.demo-island .dots > span.quiet { background: transparent; position: relative; }
.demo-island .dots > span.quiet::after { content: ''; position: absolute; inset: 1.75px; border-radius: 50%; background: var(--border); }
```

**(c)** In `site/src/pages/features.astro`, insert a new hub row immediately **before** the
`id="security"` article, and renumber that security row's `<p class="feature-number">08</p>` to
`09`:

```html
    <article class="feature-hub-row" id="quiet-tabs">
      <p class="feature-number">08</p>
      <div>
        <p class="feature-label">new in 1.2</p>
        <h2>Tabs you are not using give their memory back.</h2>
      </div>
      <div class="feature-row-end">
        <p>Leave a tab alone and Blanc hands its page back to your computer, then reloads it when you return. You choose the delay; anything half-finished is left awake.</p>
        <a class="text-link" href="/features/quiet-tabs" data-track="feature_cta_click" data-feature="quiet-tabs" data-cta-position="feature-hub">How quiet tabs work <span aria-hidden="true">↗</span></a>
      </div>
    </article>
```

**(d)** In `site/src/pages/sitemap.xml.js`, add to `MANIFEST` after the `/features/vertical-tabs`
line:

```js
  { path: '/features/quiet-tabs',      changefreq: 'monthly', priority: '0.7' },
```

- [ ] **Step 4: Run the build to verify it passes**

Run: `npm run site:build`

Expected: PASS — Astro reports the built routes including `/features/quiet-tabs.html`, with no
sitemap error. Then confirm the route really shipped:

```bash
ls site/dist/features/quiet-tabs.html && grep -c "features/quiet-tabs" site/dist/sitemap.xml
```

Expected: the file listed, and the grep prints `1`.

Do **not** deploy. `npm run site:deploy` is a separate, deliberate step after release.

- [ ] **Step 5: Commit**

```bash
git add site/src/pages/features/quiet-tabs.astro site/src/pages/features.astro site/src/pages/sitemap.xml.js site/src/styles/site.css
git commit -m "site: add the Quiet Tabs feature page, hub row, and sitemap entry"
```

---

### Task 513: Truth audit — `test/unit/public-truth.test.js`

**Files:**
- Modify: `test/unit/public-truth.test.js` (new test at the end)

**Interfaces:**
- Consumes: `site/src/pages/features/quiet-tabs.astro` and `features.astro` from Task 512.
- Produces: a standing guard that no public copy claims Blanc keeps every tab loaded.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/public-truth.test.js`. Two halves: the new page must make the §7 promise
(*reload*, never *resume*, never the internal word "asleep"), and **no** marketing page may
carry the claim that tabs are never discarded — that claim becomes false the day this ships,
and a future copy edit is exactly how it would sneak back in.

```js
test('quiet-tabs copy promises a reload, and no page claims tabs are never discarded', () => {
  const page = read('site/src/pages/features/quiet-tabs.astro');
  const hub = read('site/src/pages/features.astro');

  assert.match(page, /reloads? (?:it|them|the page)/i);
  // Spec §7: wake is a network re-fetch. "Resume" would be a promise Blanc
  // cannot keep — except in the truth-note, which says it does NOT resume.
  assert.match(page, /It does not resume\./);
  assert.doesNotMatch(page, /\bresumes\b|\bresumed\b|\bresuming\b/i);
  // "asleep" is the internal field name; public copy says quiet.
  assert.doesNotMatch(page, /\basleep\b/i);
  // The honest limits are stated, not omitted.
  assert.match(page, /Private tabs come back where they were, not how they were/);
  assert.match(hub, /\/features\/quiet-tabs/);

  const marketing = [
    ...fs.readdirSync(path.join(root, 'site/src/pages/features'))
      .filter((name) => name.endsWith('.astro'))
      .map((name) => `site/src/pages/features/${name}`),
    'site/src/pages/index.astro',
    'site/src/pages/features.astro',
    'site/src/pages/download.astro',
    'site/src/pages/about.astro',
  ];
  for (const file of marketing) {
    const source = read(file);
    assert.doesNotMatch(source, /never (?:discards?|unloads?|drops?) (?:a |any |your )?tabs?/i, file);
    assert.doesNotMatch(source, /every tab stays (?:live|loaded|open in memory)/i, file);
    assert.doesNotMatch(source, /keeps (?:every|all) tabs? (?:live|loaded|in memory)/i, file);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Before Task 512 lands this would fail on the missing file; run it now to confirm the guard is
live either way:

Run: `node --test test/unit/public-truth.test.js`

Expected: PASS if Task 512 is committed. To prove the guard bites, temporarily add the sentence
`Blanc keeps every tab live.` to `site/src/pages/features.astro`, re-run, and expect FAIL with
`The input did not match the regular expression … site/src/pages/features.astro`. Remove the
sentence again.

- [ ] **Step 3: Write minimal implementation**

None — the implementation is Task 512's copy. If Step 2's real run fails, fix the **copy**, not
the assertion.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/public-truth.test.js`

Expected: PASS — `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add test/unit/public-truth.test.js
git commit -m "Guard public copy against the never-discarded-tabs claim"
```

---

### Task 514: The §13 verification sequence

**Files:**
- Modify: none (verification only). This task exists because the substrate has four independent
  guards and they must be run in this order — a stale generated file fails a *later* command
  than the edit that caused it.

**Interfaces:**
- Consumes: every preceding task in this phase.
- Produces: the green state the phase claims.

- [ ] **Step 1: Regenerate and check the copy substrate**

Run: `npm run copy:build && npm run copy:check`

Expected: two `wrote copy/generated/…` lines, then
`copy:check OK — all three desktop copies match the source, generated files current.`

If it fails, read which file the message names and count entries **from zero in that file** —
the diff is positional. A cascade of `#11`, `#12`, … lines ending in
`…[18]: missing "/theme"` means `/sleep` landed at a different index in one of the four lists
(it belongs at index 11, immediately after `/mute`).

- [ ] **Step 2: Regenerate and check the settings substrate**

Run: `npm run settings:build && npm run settings:check`

Expected: two `wrote settings-schema/generated/…` lines, then
`settings:check OK — settings.js matches the schema, generated files current.`

A failure reading
`defaults.tabSleep: in settings.js but not schema.json` means Task 502's `schema.json` edit is
missing. Do not resolve it by adding `tabSleep` to `internalDefaults`.

- [ ] **Step 3: Run the whole substrate guard**

Run: `npm run substrate:check`

Expected: four OK lines in order — `tokens:check`, `settings:check`, `copy:check`,
`adblock:check`. No `tokens:build` should be needed: Quiet Tabs deliberately adds no `:root`
custom property.

- [ ] **Step 4: Run the test suites**

Run: `npm run test:unit`

Expected: PASS — `# fail 0`, including `tab-sleep-settings.test.js`,
`sleep-command-wiring.test.js`, and `public-truth.test.js`.

Run: `npm run test:acceptance:dry`

Expected: PASS, `0 failed`, no `Undefined` steps.

Run: `npm run test:acceptance:desktop`

Expected: PASS. This launches the real Electron app, so it needs a display (prefix
`xvfb-run -a` on headless Linux) and takes minutes. A `@F31-*` failure here is a real product
bug, not a documentation one — take it back to the phase that owns the behaviour.

Run: `npm run site:build`

Expected: PASS with `/features/quiet-tabs.html` among the built routes.

- [ ] **Step 5: Confirm nothing is left uncommitted, then commit if anything is**

Run: `git status --porcelain`

Expected: prints nothing. If a generated file under `copy/generated/` or
`settings-schema/generated/` shows up, a build step regenerated it after its task's commit —
commit it now:

```bash
git add copy/generated settings-schema/generated
git commit -m "Refresh generated substrate artifacts"
```
