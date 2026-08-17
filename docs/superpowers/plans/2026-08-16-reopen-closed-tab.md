# Reopen Closed Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the URL-only reopen-closed-tab with a three-tier restore (held live view → navigation snapshot → URL) with one undo entry per user action, per the spec at `docs/superpowers/specs/2026-08-16-reopen-closed-tab-design.md`.

**Architecture:** Pure policy in a new `src/main/closed-tabs.js` (the `tab-sleep.js` pattern); parking, firewall, registry, and restore in `main.js`. Milestone A is a standalone security fix for a shipped permission-prompt race, designed to land as its own PR before the feature.

**Tech Stack:** Electron 43, plain Node (`node --test`), no new dependencies.

## Global Constraints

- Read the spec first: `docs/superpowers/specs/2026-08-16-reopen-closed-tab-design.md`. Section references (§) below point into it.
- `src/main/closed-tabs.js` must never `require('electron')` — it must load under plain `node --test` (precedent: `src/main/tab-sleep.js`).
- Private tabs are **never** recorded, held, or reopenable (§2.3). No spec/, site/, or parity file may be edited.
- `function closeTab(id` and `function reopenClosedTab()` must remain adjacent in `main.js` with those names — `test/unit/close-tab-shutdown.test.js` slices the source between them.
- `/reopen` must land in all four copy locations in the same commit or `npm run substrate:check` fails (§6).
- Closed entries' `snapshot`, `seed`, slot metadata, and view references never cross IPC; renderers get only the five-field `projectEntries()` projection (§4.1).
- User-visible strings say "closed"/"reopen"; internals may say what they like. Do not rename existing internals.
- Run `npm run test:unit` before every commit. The dev app must be relaunched (`npm start`) to see chrome changes; ⌘R only reloads the page view.
- Constants (verbatim from spec §3.1): `CLOSED_GRACE_MS = 30_000`, `MAX_CLOSED_ENTRIES = 25`, `MAX_HELD_VIEWS = 1`.

---

## Milestone A — standalone security fix (own PR)

Fixes the shipped race: `closeTab` never resolves a closed tab's pending permission prompts, so an Allow clicked after the tab closed runs `saveDecision` and persists a grant for a destroyed requester (§5.1(b)). Task 1 is self-contained and should be branched off `main` and PR'd independently; the feature milestone builds on it.

### Task 1: Cancel pending prompts on tab close; reject destroyed requesters

**Files:**
- Modify: `src/main/permissions.js` (the request handler, ~line 154–182)
- Modify: `src/main/main.js` (new `cancelPermissionPromptsForTab` near `flushPermissionPrompts` ~line 1291; one call in `closeTab` ~line 3294)
- Test: `test/unit/permission-prompt-close.test.js` (new)
- Modify: `test/unit/close-tab-shutdown.test.js` (sandbox stub)

**Interfaces:**
- Consumes: `runtime.permissionPrompts` (Map of promptId → `{ resolve, tabId, payload }`), `detachPermissionView()`, the `null` = "never answered, never persisted" sentinel from `flushPermissionPrompts`.
- Produces: `cancelPermissionPromptsForTab(tabId)` in `main.js` — Milestone B calls it and its name is referenced from `closeTab`'s source slice in tests.

- [ ] **Step 1: Write the failing regression test**

Model the fake session on `test/unit/private-permissions.test.js` (it already fakes `setPermissionRequestHandler` by capturing the handler). Create `test/unit/permission-prompt-close.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { setupPermissionPolicy, setPermissionPrompter } = require('../../src/main/permissions');

// Copy the fake-session shape from private-permissions.test.js — it captures
// each handler so the test can invoke them directly.
function fakeSession() {
  const session = {};
  session.setPermissionRequestHandler = (fn) => { session.request = fn; };
  session.setPermissionCheckHandler = (fn) => { session.check = fn; };
  session.setDisplayMediaRequestHandler = () => {};
  return session;
}

test('an Allow answered after the requesting tab closed grants nothing and persists nothing', async () => {
  const session = fakeSession();
  // persistDecisions:false doubles as the no-electron canary (see permissions.js).
  setupPermissionPolicy(session, { persistDecisions: false });

  let resolvePrompt;
  setPermissionPrompter(() => new Promise((resolve) => { resolvePrompt = resolve; }));

  const wc = { id: 1, gone: false, isDestroyed() { return this.gone; } };
  let answer = 'unset';
  const inFlight = session.request(wc, 'geolocation', (allow) => { answer = allow; },
    { requestingUrl: 'https://example.test/page' });
  await Promise.resolve(); // let the handler reach the await
  wc.gone = true;          // the tab closes while the prompt hangs
  resolvePrompt(true);     // a late Allow
  await inFlight;
  assert.equal(answer, false);

  // Nothing persisted: the same origin must prompt again, not auto-allow.
  let promptedAgain = false;
  setPermissionPrompter(() => { promptedAgain = true; return Promise.resolve(null); });
  const wc2 = { id: 2, isDestroyed: () => false };
  let answer2 = 'unset';
  await session.request(wc2, 'geolocation', (allow) => { answer2 = allow; },
    { requestingUrl: 'https://example.test/page' });
  assert.equal(promptedAgain, true, 'decision was persisted for a destroyed requester');
  assert.equal(answer2, false);
});
```

- [ ] **Step 2: Run it and confirm it fails for the right reason**

Run: `npm run test:unit -- --test-name-pattern="late Allow" 2>&1 | tail -20` (or `node --test test/unit/permission-prompt-close.test.js`)
Expected: FAIL — `promptedAgain` is `false` because the late Allow was remembered (with `persistDecisions:false` it lands in `ephemeralDecisions`, same code path).

- [ ] **Step 3: Reject destroyed requesters in permissions.js**

In `src/main/permissions.js`, immediately after `const allow = await prompter(...)` and its `null` check (~line 177):

```js
    const allow = await prompter({ origin, permission, mediaTypes, requestingWebContents: wc });
    if (allow === null) return callback(false);
    // The requester can close while the prompt hangs. A late Allow must not
    // grant to — or persist a decision for — a tab the user already discarded.
    if (wc.isDestroyed()) return callback(false);
    saveDecision(origin, permission, mediaTypes, allow);
```

- [ ] **Step 4: Run the test again**

Run: `node --test test/unit/permission-prompt-close.test.js`
Expected: PASS.

- [ ] **Step 5: Add per-tab prompt cancellation in main.js**

Next to `flushPermissionPrompts` (~line 1293), add:

```js
// A tab's pending prompts die with it. Resolving null denies WITHOUT
// persisting (the same sentinel flushPermissionPrompts uses at window
// close), so an Allow clicked after the close can no longer grant or save
// a decision for the vanished requester.
function cancelPermissionPromptsForTab(tabId) {
  const runtime = rt();
  let cancelled = false;
  for (const [promptId, pending] of runtime.permissionPrompts) {
    if (pending?.tabId !== tabId) continue;
    runtime.permissionPrompts.delete(promptId);
    pending.resolve(null);
    cancelled = true;
  }
  if (cancelled && runtime.permissionPrompts.size === 0) detachPermissionView();
}
```

In `closeTab`, directly after `forgetTabWebContentsIds(id);` (~line 3294), add:

```js
  cancelPermissionPromptsForTab(id);
```

This covers every close path — single tab, group loop, and the non-primary window-close loop all run through `closeTab`.

- [ ] **Step 6: Fix the sandbox in close-tab-shutdown.test.js**

Run: `node --test test/unit/close-tab-shutdown.test.js`
Expected: FAIL with `cancelPermissionPromptsForTab is not defined` (the test executes `closeTab`'s source in a vm). Add a no-op stub to the vm context object alongside the existing fakes:

```js
    cancelPermissionPromptsForTab: () => {},
```

Re-run; expected: PASS.

- [ ] **Step 7: Full unit suite, then commit**

Run: `npm run test:unit`
Expected: PASS.

```bash
git add src/main/permissions.js src/main/main.js test/unit/permission-prompt-close.test.js test/unit/close-tab-shutdown.test.js
git commit -m "Cancel a closed tab's pending permission prompts; reject late answers

closeTab never resolved a closed tab's prompts — they lingered in
runtime.permissionPrompts until answered or window close, so an Allow
clicked after the tab closed ran saveDecision and persisted a grant for a
destroyed requester. Cancellation now runs in the common closeTab path
with the established null sentinel, and the request handler rejects a
destroyed requester after the prompt await, before persisting."
```

**Landing note:** this commit is deliberately self-contained. To ship it ahead of the feature, cherry-pick it onto a branch off `main` and PR that branch; Milestone B then rebases on it.

---

## Milestone B — the feature

### Task 2: Pure policy module `closed-tabs.js`

**Files:**
- Create: `src/main/closed-tabs.js`
- Test: `test/unit/closed-tabs.test.js` (new)

**Interfaces:**
- Consumes: nothing (pure; injected clock).
- Produces (exact, later tasks import all of these from `./closed-tabs`):
  - `CLOSED_GRACE_MS`, `MAX_CLOSED_ENTRIES`, `MAX_HELD_VIEWS`
  - `holdEligibility(tab, opts) -> 'hold'|'snapshot'|'url'|'refuse'`
  - `sanitizeSnapshot(snapshot, { restorableCommit }) -> snapshot|null`
  - `buildTabEntry(tab, snapshot, slot, now) -> entry`
  - `buildGroupEntry(group, members, now) -> entry`
  - `expireHolds(entries, { now, graceMs }) -> string[]`
  - `projectEntries(entries) -> Array<{id,title,favicon,tier,tabCount}>`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/closed-tabs.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  holdEligibility, sanitizeSnapshot, buildTabEntry, buildGroupEntry,
  expireHolds, projectEntries, CLOSED_GRACE_MS, MAX_CLOSED_ENTRIES,
} = require('../../src/main/closed-tabs');

const SNAP = { entries: [{ url: 'https://a.test/', title: 'A' }], index: 0, droppedPageState: false };
const baseTab = (over = {}) => ({
  url: 'https://a.test/', private: false, capturing: false, captureRecord: null,
  isLoading: false, asleep: false, sleeping: false, waking: false,
  adopted: false, title: 'A', favicon: null, pinned: false, muted: false,
  groupId: null, usedMedia: false, historyEligible: true,
  restorableCommit: true, httpEntryCount: 1, deepScrolled: false, ...over,
});

test('eligibility: refuse for private, newtab, and url-less tabs', () => {
  const opts = { hasSnapshot: true };
  assert.equal(holdEligibility(baseTab({ private: true }), opts), 'refuse');
  assert.equal(holdEligibility(baseTab({ url: 'blanc://newtab/' }), opts), 'refuse');
  assert.equal(holdEligibility(baseTab({ url: '' }), opts), 'refuse');
  assert.equal(holdEligibility(baseTab({ url: 42 }), opts), 'refuse');
});

test('eligibility: hold only for a clean, snapshot-bearing, family-free tab', () => {
  assert.equal(holdEligibility(baseTab(), { hasSnapshot: true }), 'hold');
  assert.equal(holdEligibility(baseTab(), { hasSnapshot: false }), 'url');
});

test('eligibility: every Tier 1 demotion condition', () => {
  const opts = { hasSnapshot: true };
  assert.equal(holdEligibility(baseTab({ capturing: true }), opts), 'snapshot');
  // grant anchors are truth even when the capturing projection reads false (§5.1a)
  assert.equal(holdEligibility(baseTab({ captureRecord: { anchors: [{}] } }), opts), 'snapshot');
  assert.equal(holdEligibility(baseTab(), { ...opts, promptPending: true }), 'snapshot');
  assert.equal(holdEligibility(baseTab({ isLoading: true }), opts), 'snapshot');
  assert.equal(holdEligibility(baseTab({ asleep: true }), opts), 'snapshot');
  assert.equal(holdEligibility(baseTab({ sleeping: true }), opts), 'snapshot');
  assert.equal(holdEligibility(baseTab({ adopted: true }), opts), 'snapshot');
  assert.equal(holdEligibility(baseTab(), { ...opts, openerAlive: true }), 'snapshot');
  assert.equal(holdEligibility(baseTab(), { ...opts, hasManagedChild: true }), 'snapshot');
  assert.equal(holdEligibility(baseTab(), { ...opts, popupChildCount: 1 }), 'snapshot');
});

test('sanitizeSnapshot strips active pageState for a non-restorable commit', () => {
  const snap = { entries: [{ url: 'u', title: 't', pageState: 'POSTBODY' }], index: 0, droppedPageState: false };
  const clean = sanitizeSnapshot(snap, { restorableCommit: false });
  assert.equal(clean.entries[0].pageState, undefined);
  const kept = sanitizeSnapshot(snap, { restorableCommit: true });
  assert.equal(kept.entries[0].pageState, 'POSTBODY');
  assert.equal(sanitizeSnapshot(null, { restorableCommit: true }), null);
});

test('buildTabEntry captures identity, slot, and the adoption seed', () => {
  const entry = buildTabEntry(
    baseTab({ pinned: true, muted: true, usedMedia: true, groupId: 'g1' }),
    SNAP, { index: 3, groupName: 'work' }, 1000);
  assert.equal(entry.kind, 'tab');
  assert.equal(entry.closedAt, 1000);
  assert.equal(entry.index, 3);
  assert.deepEqual(
    [entry.pinned, entry.muted, entry.groupId, entry.groupName],
    [true, true, 'g1', 'work']);
  assert.equal(entry.seed.usedMedia, true);
  assert.equal(entry.view, null);
  assert.ok(entry.id && entry.id !== buildTabEntry(baseTab(), SNAP, { index: 0 }, 1000).id);
});

test('buildGroupEntry is one entry with per-member snapshots and no private members', () => {
  const members = [
    { url: 'https://a.test/', title: 'A', favicon: null, pinned: true, muted: false, private: false, snapshot: SNAP },
    { url: 'https://p.test/', title: 'P', favicon: null, pinned: false, muted: false, private: true, snapshot: SNAP },
  ];
  const entry = buildGroupEntry({ id: 'g1', name: 'work', collapsed: false, index: 2, activeMemberIndex: 0 }, members, 1000);
  assert.equal(entry.kind, 'group');
  assert.equal(entry.group.name, 'work');
  assert.equal(entry.group.index, 2);
  assert.equal(entry.tabs.length, 1); // the private member is not recorded
  assert.equal(entry.view, null);
});

test('expireHolds names only entries whose hold has aged out', () => {
  const young = { id: 'a', view: {}, heldAt: 100 };
  const old = { id: 'b', view: {}, heldAt: 0 };
  const snapshotOnly = { id: 'c', view: null, heldAt: null };
  assert.deepEqual(
    expireHolds([young, old, snapshotOnly], { now: CLOSED_GRACE_MS, graceMs: CLOSED_GRACE_MS }),
    ['b']);
});

test('projectEntries emits exactly five fields and only PNG data favicons', () => {
  const entries = [
    { kind: 'tab', id: 'e1', title: 'A', favicon: 'data:image/png;base64,AAAA', view: {}, snapshot: SNAP, tabs: null },
    { kind: 'tab', id: 'e2', title: 'B', favicon: 'https://evil.test/f.ico', view: null, snapshot: SNAP },
    { kind: 'tab', id: 'e3', title: 'C', favicon: null, view: null, snapshot: null },
    { kind: 'group', id: 'e4', group: { name: 'work' }, view: null, tabs: [{}, {}] },
  ];
  const projected = projectEntries(entries);
  assert.deepEqual(projected.map((p) => Object.keys(p).sort()),
    projected.map(() => ['favicon', 'id', 'tabCount', 'tier', 'title']));
  assert.deepEqual(projected.map((p) => p.tier), [0, 1, 2, 1]);
  assert.equal(projected[1].favicon, null); // non-PNG-data favicon never crosses
  assert.deepEqual(projected.map((p) => p.tabCount), [1, 1, 1, 2]);
  assert.equal(projected[3].title, 'work');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/closed-tabs.test.js`
Expected: FAIL — `Cannot find module '../../src/main/closed-tabs'`.

- [ ] **Step 3: Implement the module**

Create `src/main/closed-tabs.js`:

```js
// Pure Reopen Closed Tab policy: which closes may hold a live view, how a
// closed entry is shaped, and what of it a renderer may see. No electron
// import — this file must stay requireable from `node --test` (precedent:
// tab-sleep.js). The clock is injected, never read.
// See docs/superpowers/specs/2026-08-16-reopen-closed-tab-design.md.

/** Held views live this long before degrading to their snapshot (§2.1). */
const CLOSED_GRACE_MS = 30_000;
/** Per-window entry cap, matching the old recentlyClosedUrls bound. */
const MAX_CLOSED_ENTRIES = 25;
/** At most one live held view per window; a newer close takes the hold. */
const MAX_HELD_VIEWS = 1;

let entrySeq = 0;
const nextEntryId = () => `closed-${++entrySeq}`;

/**
 * Highest tier a closing tab qualifies for. 'refuse' means the close is not
 * recorded at all (§2.1): private tabs, newtab, or no usable URL.
 * The caller computes the family/prompt booleans — this module never sees
 * the tabs Map or the prompt registry.
 */
function holdEligibility(tab, {
  hasSnapshot = false,
  promptPending = false,
  openerAlive = false,
  hasManagedChild = false,
  popupChildCount = 0,
} = {}) {
  const url = typeof tab?.url === 'string' ? tab.url : '';
  if (!url || tab?.private || url.startsWith('blanc://newtab')) return 'refuse';
  if (!hasSnapshot) return 'url';
  const anchorCount = tab.captureRecord?.anchors?.length ?? 0;
  const demoted =
    tab.capturing || anchorCount > 0        // grant truth, not the projection (§5.1a)
    || promptPending                        // prompt-bearing closes are Tier 1 (§5.1b)
    || tab.isLoading                        // an in-flight navigation can't be frozen (§3.4)
    || tab.asleep || tab.sleeping || tab.waking
    || tab.adopted || openerAlive || hasManagedChild || popupChildCount > 0; // §5.6
  return demoted ? 'snapshot' : 'hold';
}

/**
 * Strip the active entry's pageState unless the commit was a successful GET.
 * pageState can carry the verbatim POST body of the submission that produced
 * the page; restoring it would resubmit (§2.1.1). Runs on EVERY snapshot,
 * held entries included, so a later downgrade needs no extra step.
 */
function sanitizeSnapshot(snapshot, { restorableCommit = false } = {}) {
  if (!snapshot || !Array.isArray(snapshot.entries)) return null;
  if (restorableCommit === true) return snapshot;
  return {
    ...snapshot,
    entries: snapshot.entries.map(({ url, title }) => ({ url, title })),
  };
}

/** One closed-tab entry. `view`/`heldAt`/`wcId` stay null here; only the
 *  impure half may park a live view into them. */
function buildTabEntry(tab, snapshot, slot = {}, now = 0) {
  return {
    kind: 'tab',
    id: nextEntryId(),
    closedAt: now,
    url: tab.url,
    title: typeof tab.title === 'string' && tab.title ? tab.title : tab.url,
    favicon: typeof tab.favicon === 'string' ? tab.favicon : null,
    pinned: !!tab.pinned,
    muted: !!tab.muted,
    groupId: tab.groupId ?? null,
    groupName: slot.groupName ?? null,
    index: Number.isInteger(slot.index) ? slot.index : 0,
    snapshot: snapshot ?? null,
    // Document-scoped fields a Tier 0 adoption must seed back (§3.3).
    // adopted/openerTabId are absent by design: family tabs never hold (§5.6).
    seed: {
      usedMedia: !!tab.usedMedia,
      historyEligible: tab.historyEligible !== false,
      restorableCommit: tab.restorableCommit === true,
      httpEntryCount: tab.httpEntryCount ?? 0,
      deepScrolled: !!tab.deepScrolled,
    },
    view: null,
    heldAt: null,
    wcId: null,
  };
}

/** One entry for a whole group close (§2.2). Private members are dropped
 *  from the record (never recorded) though the caller still closes them. */
function buildGroupEntry(group, members, now = 0) {
  return {
    kind: 'group',
    id: nextEntryId(),
    closedAt: now,
    group: {
      id: group.id,
      name: group.name,
      collapsed: !!group.collapsed,
      index: Number.isInteger(group.index) ? group.index : 0,
    },
    activeMemberIndex: Number.isInteger(group.activeMemberIndex) ? group.activeMemberIndex : 0,
    tabs: members
      .filter((m) => !m.private)
      .map((m) => ({
        url: m.url,
        title: typeof m.title === 'string' && m.title ? m.title : m.url,
        favicon: typeof m.favicon === 'string' ? m.favicon : null,
        pinned: !!m.pinned,
        muted: !!m.muted,
        snapshot: m.snapshot ?? null,
      })),
    view: null,
    heldAt: null,
    wcId: null,
  };
}

/** Ids of entries whose hold has aged out. Always a downgrade, never a
 *  destroy: every held entry carries its snapshot (§2.1). */
function expireHolds(entries, { now, graceMs = CLOSED_GRACE_MS } = {}) {
  return (entries ?? [])
    .filter((e) => e?.view && Number.isFinite(e.heldAt) && now - e.heldAt >= graceMs)
    .map((e) => e.id);
}

/** The ONLY shape a renderer may see (§4.1). Entries, page state, seeds,
 *  slot metadata, and view references never cross this projection. */
function projectEntries(entries) {
  const pngFavicon = (value) =>
    typeof value === 'string' && value.startsWith('data:image/png;base64,')
      ? value
      : null;
  return (entries ?? []).map((e) => ({
    id: e.id,
    title: e.kind === 'group' ? e.group.name : e.title,
    favicon: e.kind === 'group' ? null : pngFavicon(e.favicon),
    tier: e.view ? 0 : (e.kind === 'group' || e.snapshot) ? 1 : 2,
    tabCount: e.kind === 'group' ? e.tabs.length : 1,
  }));
}

module.exports = {
  holdEligibility,
  sanitizeSnapshot,
  buildTabEntry,
  buildGroupEntry,
  expireHolds,
  projectEntries,
  CLOSED_GRACE_MS,
  MAX_CLOSED_ENTRIES,
  MAX_HELD_VIEWS,
};
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/closed-tabs.test.js`
Expected: PASS (all 8).

- [ ] **Step 5: Commit**

```bash
git add src/main/closed-tabs.js test/unit/closed-tabs.test.js
git commit -m "Add pure closed-tabs policy module (tier selection, entry shaping, projection)"
```

### Task 3: Held registry, firewall, and permission integration

**Files:**
- Modify: `src/main/permissions.js` (new `setHeldRequesterCheck`, checks in both handlers)
- Modify: `src/main/main.js` (registry, `parkTabView`, `installHeldFirewall`, `downgradeHeldEntry`, `before-quit`)
- Test: `test/unit/permission-prompt-close.test.js` (extend)

**Interfaces:**
- Consumes: Task 2's entry shape (`entry.view`, `entry.heldAt`, `entry.wcId`, `entry.seed`).
- Produces:
  - `permissions.js` exports `setHeldRequesterCheck(fn)`; `fn(wc) -> boolean`.
  - `main.js`: `const heldWebContents = new Set()` (of `wc.id`);
    `parkTabView(tab, entry) -> boolean`; `downgradeHeldEntry(entry) -> void`
    (idempotent; destroys the view unless already destroyed, clears
    `entry.view/heldAt/wcId`, removes from registry, clears `entry.holdTimer`).

- [ ] **Step 1: Extend the permission test (failing)**

Append to `test/unit/permission-prompt-close.test.js`:

```js
const { setHeldRequesterCheck } = require('../../src/main/permissions');

test('a held requester is denied everywhere and nothing persists', async () => {
  const session = fakeSession();
  setupPermissionPolicy(session, { persistDecisions: false });
  const held = new Set([7]);
  setHeldRequesterCheck((wc) => !!wc && held.has(wc.id));
  try {
    const wc = { id: 7, isDestroyed: () => false };

    // Request path: denied before the stored-decision lookup.
    let answer = 'unset';
    await session.request(wc, 'geolocation', (allow) => { answer = allow; },
      { requestingUrl: 'https://held.test/' });
    assert.equal(answer, false);

    // Check path agrees.
    assert.equal(session.check(wc, 'geolocation', 'https://held.test/', {}), false);

    // Race: park lands during the prompt await — recheck must deny.
    held.delete(7);
    let resolvePrompt;
    setPermissionPrompter(() => new Promise((resolve) => { resolvePrompt = resolve; }));
    let raced = 'unset';
    const inFlight = session.request(wc, 'geolocation', (allow) => { raced = allow; },
      { requestingUrl: 'https://held.test/' });
    await Promise.resolve();
    held.add(7);          // parked while the prompt hung
    resolvePrompt(true);  // late Allow
    await inFlight;
    assert.equal(raced, false);
  } finally {
    setHeldRequesterCheck(null);
  }
});
```

Run: `node --test test/unit/permission-prompt-close.test.js`
Expected: FAIL — `setHeldRequesterCheck` is not exported.

- [ ] **Step 2: Implement in permissions.js**

Next to `setPermissionPrompter` (~line 37):

```js
/** Held-view firewall hook (§5.1c): while a closed tab's view is parked for
 *  reopen, EVERY permission is denied — checked before the stored-decision
 *  lookup so a remembered grant cannot reach a held page, and re-checked
 *  after the prompt await. Never persisted. */
let heldRequester = () => false;
function setHeldRequesterCheck(fn) { heldRequester = typeof fn === 'function' ? fn : () => false; }
```

In the **request** handler, first line inside the async body (before the `AUTO_ALLOWED` check):

```js
    if (heldRequester(wc)) return callback(false);
```

Widen Task 1's post-await rejection:

```js
    if (wc.isDestroyed() || heldRequester(wc)) return callback(false);
```

In the **check** handler, rename `_wc` to `wc` and add as its first line:

```js
    if (heldRequester(wc)) return false;
```

Add `setHeldRequesterCheck` to `module.exports`.

Run: `node --test test/unit/permission-prompt-close.test.js` — expected: PASS.

- [ ] **Step 3: Registry, park, firewall, downgrade in main.js**

Near the `sleepSnapshots` declaration (~line 674), add:

```js
// wc.id of every parked (held) closed-tab view, process-wide. Consulted by
// the permission handlers via setHeldRequesterCheck — the tab record is gone
// by park time, so tabIdByWebContentsId cannot answer for a held page.
const heldWebContents = new Set();
```

Where the permission policy is wired (near the `setPermissionPrompter(...)` call, ~line 5040), add:

```js
  setHeldRequesterCheck((wc) => !!wc && heldWebContents.has(wc.id));
```

(and add `setHeldRequesterCheck` to the `require('./permissions')` destructure.)

Below `sleepTab` (~line 960), add the three functions:

```js
/** Downgrade a held entry to its snapshot: destroy the view (unless the
 *  renderer already died), clear the registry, cancel the hold timer. Safe
 *  to call twice and from the firewall's own destroyed handler. */
function downgradeHeldEntry(entry) {
  clearTimeout(entry.holdTimer);
  entry.holdTimer = null;
  if (entry.wcId != null) heldWebContents.delete(entry.wcId);
  entry.wcId = null;
  const view = entry.view;
  entry.view = null;
  entry.heldAt = null;
  const wc = view?.webContents;
  if (wc && !wc.isDestroyed()) {
    wc.removeAllListeners();
    wc.close();
  }
}

/** Held-state firewall (spec §3.4): a parked page keeps executing for the
 *  grace window with no tab record, so it must never be left bare. */
function installHeldFirewall(entry, wc) {
  // Method-installed, NOT an EventEmitter listener — removeAllListeners()
  // did not clear the one wireTabView set. Without this a held page could
  // window.open into a boundToTab closure over a deleted record.
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Frozen at close: main-frame navigation is refused outright. Subframes
  // are left alone so the page survives restore intact (§3.4).
  wc.on('will-navigate', (event) => { if (event.isMainFrame) event.preventDefault(); });
  wc.on('will-redirect', (event) => { if (event.isMainFrame) event.preventDefault(); });
  // A video can BEGIN during the hold; the restored tab must not be
  // quietable mid-playback. Writes to the entry, never a tab record.
  wc.on('media-started-playing', () => { entry.seed.usedMedia = true; });
  // A crashed renderer does not destroy its WebContents; without these the
  // restore path would re-attach a sad-tab instead of using the snapshot.
  const downgrade = () => downgradeHeldEntry(entry);
  wc.on('render-process-gone', downgrade);
  wc.once('destroyed', downgrade);
}

/** Park a closing tab's live view into its closed entry (Tier 0). Returns
 *  false on any uncertainty; the caller then destroys normally (Tier 1). */
function parkTabView(tab, entry) {
  const wc = liveContents(tab);
  if (!wc) return false;
  // Final synchronous guard, same shape as sleepTab's: capture state can
  // change between eligibility selection and this call (§5.1a).
  if (tab.capturing || (tab.captureRecord?.anchors?.length ?? 0) > 0) return false;
  const view = tab.view;
  // Registry FIRST, then strip, then firewall: no instant exists in which a
  // request resolves against neither the tab record nor the firewall (§3.4).
  heldWebContents.add(wc.id);
  wc.removeAllListeners();
  installHeldFirewall(entry, wc);
  view.setVisible(false);
  wc.setAudioMuted(true);
  entry.view = view;
  entry.wcId = wc.id;
  entry.heldAt = Date.now();
  entry.holdTimer = setTimeout(() => downgradeHeldEntry(entry), CLOSED_GRACE_MS);
  tabIdByWebContentsId.delete(wc.id);
  lastMainFrameMethod.delete(wc.id);
  return true;
}
```

Add to the top-of-file requires: `const { holdEligibility, sanitizeSnapshot, buildTabEntry, buildGroupEntry, projectEntries, CLOSED_GRACE_MS, MAX_CLOSED_ENTRIES } = require('./closed-tabs');`

- [ ] **Step 4: Quit-time teardown**

In the `before-quit` handler (~line 2157), after the `sleepSnapshots` loop, add:

```js
  for (const runtime of windowRuntimes.all()) {
    for (const entry of runtime.closedEntries ?? []) {
      if (entry.view) downgradeHeldEntry(entry);
    }
  }
```

- [ ] **Step 5: Run the suite, commit**

Run: `npm run test:unit`
Expected: PASS.

```bash
git add src/main/permissions.js src/main/main.js test/unit/permission-prompt-close.test.js
git commit -m "Add held-view registry, park firewall, and blanket permission denial for held pages"
```

### Task 4: Record on close, reopen with restore, adoption seam

**Files:**
- Modify: `src/main/main.js` (`closeTab`, `reopenClosedTab`, `createTab`, menu predicate)
- Modify: `test/unit/close-tab-shutdown.test.js` (sandbox stubs)

**Interfaces:**
- Consumes: Task 2 policy functions; Task 3 `parkTabView`/`downgradeHeldEntry`/`heldWebContents`.
- Produces: `closeTab(id, { record = true, selectReplacement = true })` (Task 5 uses both options); `pushClosedEntry(entry)`; `reopenEntry(entry)`; `createTab(url, { adoptView })`; `rt().closedEntries` (replaces `rt().recentlyClosedUrls` — delete every reference to the old array).

- [ ] **Step 1: Rework closeTab's head to capture before destroying**

Replace the current opening block of `closeTab` (~lines 3286–3305) so the sleep record is captured whole (field-copied later, §2.1) and the recentlyClosedUrls block is replaced by entry recording. The new shape:

```js
function closeTab(id, { record = true, selectReplacement = true } = {}) {
  // First statement: any later early return must not strand recovery data.
  const sleepRecord = sleepSnapshots.get(id) ?? null;
  const retainedView = sleepRecord?.view ?? null;
  sleepSnapshots.delete(id);
  // A user close during a sleep teardown wins: do not rewire a tab going away.
  sleepTeardownInProgress = false;
  const tab = tabs.get(id);
  if (!tab || windowRuntimes.runtimeForTab(id) !== rt()) return;
  forgetTabWebContentsIds(id);

  // Capture the prompt condition BEFORE cancelling — cancellation erases the
  // evidence the tier check reads (§5.1b).
  const promptPending = permissionPendingTabIds().has(id);
  cancelPermissionPromptsForTab(id);

  const closedIndex = rt().tabOrder.indexOf(id);
  let parked = false;
  if (record && !isQuitting && !rt().closing) {
    // Snapshot: field-copy from the sleep record (its view is NOT ours to
    // take — the storage-bearing quiet path leaves a live view there, §2.1),
    // else shape one from the live navigation history.
    let snapshot = null;
    if (sleepRecord) {
      snapshot = { entries: sleepRecord.entries, index: sleepRecord.index, droppedPageState: sleepRecord.droppedPageState };
    } else {
      try {
        const nav = liveContents(tab)?.navigationHistory;
        if (nav) snapshot = trimSnapshot(nav.getAllEntries(), nav.getActiveIndex(), { private: !!tab.private });
      } catch {}
    }
    snapshot = sanitizeSnapshot(snapshot, { restorableCommit: tab.restorableCommit === true });

    const openerAlive = !!(tab.openerTabId && tabs.has(tab.openerTabId));
    let hasManagedChild = false;
    for (const other of tabs.values()) {
      if (other.openerTabId === id) { hasManagedChild = true; break; }
    }
    const tier = holdEligibility(tab, {
      hasSnapshot: !!snapshot,
      promptPending,
      openerAlive,
      hasManagedChild,
      popupChildCount: popupChildCounts.get(id) ?? 0,
    });
    if (tier !== 'refuse') {
      const groupName = rt().groups.find((g) => g.id === tab.groupId)?.name ?? null;
      const entry = buildTabEntry(tab, snapshot, { index: closedIndex, groupName }, Date.now());
      if (tier === 'hold') parked = parkTabView(tab, entry);
      pushClosedEntry(entry);
    }
  }
```

Then continue with the existing body **unchanged except**:
1. The old `const closedIndex = rt().tabOrder.indexOf(id);` line (~3315) is deleted (computed above).
2. The old recentlyClosedUrls block is gone.
3. The destruction line becomes hold-aware:

```js
  const wc = tab.view?.webContents ?? retainedView?.webContents;
  if (wc) lastMainFrameMethod.delete(wc.id);
  if (wc && !wc.isDestroyed() && !parked) wc.close();
```

(When `parked`, the view was already detached-from-model; still run the `removeChildView` lines above it — a parked active view must leave the contentView.)
4. In the `wasActive` branch, honor suppression — after the quitting guard:

```js
    if (!selectReplacement) { rt().activeTabId = null; return; }
```

- [ ] **Step 2: pushClosedEntry**

Add below `closeTab`-adjacent helpers (before `reopenClosedTab` — remember the slice constraint means it must sit ABOVE `function closeTab` or BELOW `reopenClosedTab`'s end; put it above `closeTab`):

```js
// One list per window runtime, newest last. At most one entry holds a live
// view; a newer hold downgrades the incumbent rather than being refused
// (§2.1), and eviction destroys any view it pushes out (§5.4).
function pushClosedEntry(entry) {
  const list = rt().closedEntries ??= [];
  if (entry.view) {
    for (const existing of list) if (existing.view) downgradeHeldEntry(existing);
  }
  list.push(entry);
  while (list.length > MAX_CLOSED_ENTRIES) {
    const evicted = list.shift();
    if (evicted.view) downgradeHeldEntry(evicted);
  }
  scheduleMenuRebuild();
}
```

- [ ] **Step 3: The adoption seam in createTab**

Extend the options destructure: `adoptView = null`. Where the view is chosen (the `bornQuiet ? null : view` region, ~line 2955), a supplied `adoptView` becomes the view and construction is skipped, mirroring how a caller-passed `view` already works — pass `adoptView` through as `view` and set a local `adopting = true`. After `wireTabView(tab, view, { owner, adopted })` (~line 3030), add:

```js
  if (adopting) {
    // The document predates this record (§3.3): re-attach chrome's listener
    // set, wake the audio path (wireTabView only ever mutes), and resync
    // what the island paints. Favicon stays the park-time value — Electron
    // has favicon events but no getter.
    wc.setAudioMuted(effectiveTabMuted(tab));
    view.setVisible(true);
    tab.url = wc.getURL() || tab.url;
    tab.title = wc.getTitle() || tab.title;
    tab.canGoBack = wc.navigationHistory.canGoBack();
    tab.canGoForward = wc.navigationHistory.canGoForward();
  }
  if (!adopted && !adopting) {
```

…so the initial `loadURL`/`restoreHistory` block is also skipped for adoption.

Before `wireTabView` runs on an adopted view, the firewall must come off:

```js
  if (adopting) wc.removeAllListeners(); // strip the held firewall; wireTabView reinstalls
```

(`wireTabView` installs its own `setWindowOpenHandler`, replacing the deny.)

- [ ] **Step 4: reopenClosedTab and reopenEntry**

Replace `reopenClosedTab` (keeping the exact function name and its position after `closeTab`):

```js
function reopenClosedTab() {
  const entry = rt().closedEntries?.pop();
  if (entry) reopenEntry(entry);
}

/** Restore one consumed entry. Tier 0 adopts the parked view; a dead or
 *  unattachable view falls through to the snapshot (§3.2). */
function reopenEntry(entry) {
  if (entry.kind === 'group') return reopenGroupEntry(entry);
  clearTimeout(entry.holdTimer);
  const resolvedGroupId = entry.groupId && rt().groups.some((g) => g.id === entry.groupId)
    ? entry.groupId
    : null;
  const common = { pinned: entry.pinned, muted: entry.muted, groupId: resolvedGroupId };

  if (entry.view && entry.view.webContents && !entry.view.webContents.isDestroyed()) {
    const wcId = entry.wcId;
    const id = createTab(entry.url, {
      ...common, adoptView: entry.view, title: entry.title, favicon: entry.favicon,
    });
    if (id) {
      heldWebContents.delete(wcId);
      const tab = tabs.get(id);
      Object.assign(tab, entry.seed); // usedMedia, historyEligible, restorableCommit, httpEntryCount, deepScrolled
      finishReopen(id, entry);
      return;
    }
  }
  downgradeHeldEntry(entry);
  const id = createTab(entry.url, {
    ...common,
    restoreHistory: entry.snapshot
      ? { entries: entry.snapshot.entries, index: entry.snapshot.index }
      : null,
  });
  if (id) finishReopen(id, entry);
}

/** Slot splice + group-by-name fallback + activation, shared by all tiers. */
function finishReopen(id, entry) {
  const order = rt().tabOrder;
  const from = order.indexOf(id);
  if (from !== -1) {
    order.splice(from, 1);
    order.splice(Math.min(entry.index, order.length), 0, id);
  }
  if (!tabs.get(id)?.groupId && entry.groupName) groupTabByName(id, entry.groupName);
  setActiveTab(id);
  broadcastTabs();
  scheduleMenuRebuild();
}
```

(`reopenGroupEntry` arrives in Task 5; until then add a stub `function reopenGroupEntry() {}` directly above `reopenClosedTab` so the file parses — Task 5 replaces it.)

- [ ] **Step 5: Menu predicate**

In the File menu template (~line 4258): `enabled: (runtime.closedEntries?.length ?? 0) > 0`. Grep for every remaining `recentlyClosedUrls` reference and delete it: `grep -n "recentlyClosedUrls" src/ test/` — expected referents are `closeTab`, `reopenClosedTab`, the menu, and possibly `window-runtime-registry.js` defaults; replace the registry default with `closedEntries: []` if one exists.

- [ ] **Step 6: Repair close-tab-shutdown.test.js**

Run: `node --test test/unit/close-tab-shutdown.test.js`
Expected: FAIL with ReferenceErrors from the vm slice. Add no-op stubs to its context for every new name `closeTab` now references:

```js
    cancelPermissionPromptsForTab: () => {},
    permissionPendingTabIds: () => new Set(),
    holdEligibility: () => 'refuse',
    sanitizeSnapshot: (s) => s,
    buildTabEntry: () => ({}),
    pushClosedEntry: () => {},
    parkTabView: () => false,
    trimSnapshot: () => null,
    popupChildCounts: new Map(),
    Date,
```

Re-run until PASS. The shutdown scenario itself must still pass unmodified — that is the test's point.

- [ ] **Step 7: Full suite + smoke, commit**

Run: `npm run test:unit` — expected PASS.
Smoke (relaunch required): `npm start`, open two tabs, ⌘W, ⌘⇧T within 30 s — the page returns instantly with scroll and form state (Tier 0); wait 30 s after another close — ⌘⇧T re-navigates with back-stack intact (Tier 1). Leave the dev instance open.

```bash
git add src/main/main.js test/unit/close-tab-shutdown.test.js
git commit -m "Record closed tabs as tiered entries; reopen restores held view or snapshot"
```

### Task 5: Atomic group close and group restore

**Files:**
- Modify: `src/main/main.js` (`closeGroup` ~line 2778, `reopenGroupEntry` stub from Task 4, window-close loop ~line 4499)

**Interfaces:**
- Consumes: `closeTab(id, { record, selectReplacement })`, `buildGroupEntry`, `pushClosedEntry`, `sleepSnapshots`.
- Produces: `reopenGroupEntry(entry)` (called by `reopenEntry`).

- [ ] **Step 1: Rewrite closeGroup as capture-first**

```js
/** Member record for a group entry: identity + field-copied snapshot. The
 *  sleep record's retained view is NOT taken — closeTab destroys it. */
function closedMemberRecord(id) {
  const tab = tabs.get(id);
  const sleepRecord = sleepSnapshots.get(id);
  let snapshot = null;
  if (sleepRecord) {
    snapshot = { entries: sleepRecord.entries, index: sleepRecord.index, droppedPageState: sleepRecord.droppedPageState };
  } else {
    try {
      const nav = liveContents(tab)?.navigationHistory;
      if (nav) snapshot = trimSnapshot(nav.getAllEntries(), nav.getActiveIndex(), { private: !!tab.private });
    } catch {}
  }
  snapshot = sanitizeSnapshot(snapshot, { restorableCommit: tab.restorableCommit === true });
  return {
    url: tab.url, title: tab.title, favicon: tab.favicon ?? null,
    pinned: !!tab.pinned, muted: !!tab.muted, private: !!tab.private, snapshot,
  };
}

function closeGroup(groupId) {
  const runtime = rt();
  const group = runtime.groups.find((g) => g.id === groupId);
  const ids = runtime.tabOrder.filter((id) => tabs.get(id)?.groupId === groupId);
  if (!group || ids.length === 0) return;
  // Capture EVERYTHING first: pruneEmptyGroups destroys the record mid-loop
  // otherwise, and quiet members must be snapshotted, never woken (§2.2).
  const entry = buildGroupEntry({
    id: group.id, name: group.name, collapsed: group.collapsed,
    index: runtime.groups.indexOf(group),
    activeMemberIndex: Math.max(0, ids.indexOf(runtime.activeTabId)),
  }, ids.map(closedMemberRecord), Date.now());
  const anchorIndex = runtime.tabOrder.indexOf(ids[0]);
  for (const id of ids) closeTab(id, { record: false, selectReplacement: false });
  if (entry.tabs.length > 0) pushClosedEntry(entry); // an all-private group records nothing
  // One replacement selection at the end, not one per member.
  if (!runtime.activeTabId) {
    if (runtime.tabOrder.length > 0) {
      setActiveTab(runtime.tabOrder[Math.min(Math.max(anchorIndex, 0), runtime.tabOrder.length - 1)]);
    } else if (hasLiveWindow()) {
      setActiveTab(createTab());
    }
  }
  broadcastTabs();
  scheduleMenuRebuild();
}
```

- [ ] **Step 2: Replace the reopenGroupEntry stub**

```js
/** Restore a group whole: record at its recorded cluster index, members
 *  born quiet with their snapshots parked in sleepSnapshots (the session-
 *  restore pattern), only the active member woken (§2.4). */
function reopenGroupEntry(entry) {
  const runtime = rt();
  let group = runtime.groups.find((g) => g.name === entry.group.name);
  if (!group) {
    group = { id: entry.group.id, name: entry.group.name, collapsed: !!entry.group.collapsed };
    runtime.groups.splice(Math.min(entry.group.index, runtime.groups.length), 0, group);
  }
  const ids = entry.tabs.map((member) => {
    const id = createTab(member.url, {
      groupId: group.id, pinned: member.pinned, muted: member.muted,
      asleep: true, title: member.title, favicon: member.favicon,
    });
    if (id && member.snapshot) {
      sleepSnapshots.set(id, {
        view: null,
        entries: member.snapshot.entries,
        index: member.snapshot.index,
        droppedPageState: member.snapshot.droppedPageState,
      });
    }
    return id;
  }).filter(Boolean);
  if (ids.length === 0) return;
  setActiveTab(ids[Math.min(entry.activeMemberIndex, ids.length - 1)]);
  broadcastTabs();
  scheduleMenuRebuild();
}
```

Verify the born-quiet wake path consumes the parked snapshot: `wakeTab` reads `sleepSnapshots.get(id)` and calls `navigationHistory.restore` (~line 1071–1118). If `wakeTab` refuses a snapshot-less born-quiet tab, members without snapshots simply wake by URL — confirm by reading that region before moving on.

- [ ] **Step 3: Suppress recording in the window-close loop**

At ~line 4499 (`for (const tabId of [...runtime.tabOrder]) closeTab(tabId);`), pass the option and drop the runtime's entries:

```js
      for (const tabId of [...runtime.tabOrder]) closeTab(tabId, { record: false });
      for (const entry of runtime.closedEntries ?? []) {
        if (entry.view) downgradeHeldEntry(entry);
      }
      runtime.closedEntries = [];
```

The `detachWindow` (primary/macOS) branch keeps its entries but must not keep a live view (§5.4):

```js
      for (const entry of runtime.closedEntries ?? []) {
        if (entry.view) downgradeHeldEntry(entry);
      }
      windowRuntimes.detachWindow(runtime);
```

- [ ] **Step 4: Tests + smoke, commit**

Run: `npm run test:unit` — expected PASS (closeGroup is exercised indirectly; the acceptance scenario lands in Task 8).
Smoke: `npm start` → make a group of 3 (`/group work`), `/close-group`, ⌘⇧T — the group returns whole, name and order intact, one keypress. Leave the instance open.

```bash
git add src/main/main.js
git commit -m "Group close records one atomic entry; reopen restores the group whole"
```

### Task 6: /reopen slash command (all four copy locations)

**Files:**
- Modify: `copy/slash-commands.json`, `src/renderer/overlay.js` (~line 762), `src/renderer/pages/shortcuts.js` (~line 17), `src/main/main.js` (`SLASH_COMMANDS` ~line 4171; new `chromeHandle`), `src/main/preload.js`

**Interfaces:**
- Produces: `browserAPI.reopenClosedTab()`; IPC `tabs:reopen-closed`.

- [ ] **Step 1: Add the command everywhere, positioned after `/close` in each list**

`copy/slash-commands.json`:
```json
    { "command": "/reopen", "hint": "Reopen the tab you just closed" },
```

`src/main/preload.js` (near `closeTab`):
```js
  reopenClosedTab: () => ipcRenderer.invoke('tabs:reopen-closed'),
```

`src/main/main.js` chromeHandle block (near `tabs:close`):
```js
  chromeHandle('tabs:reopen-closed', () => reopenClosedTab());
```

`src/renderer/overlay.js` command table (after `/close`):
```js
    { cmd: '/reopen', hint: 'Reopen the tab you just closed', run: () => window.browserAPI.reopenClosedTab() },
```

`src/renderer/pages/shortcuts.js` (after `/close`):
```js
  ['/reopen', 'Reopen the tab you just closed'],
```

`src/main/main.js` `SLASH_COMMANDS` (after `/close`):
```js
  ['/reopen', 'Reopen the tab you just closed'],
```

- [ ] **Step 2: Regenerate and check the substrate**

Run: `npm run copy:build && npm run substrate:check`
Expected: both PASS. If `copy:build` is not the script name, read `package.json`'s scripts for the copy substrate's build entry and use that — never hand-edit `copy/generated/`.

- [ ] **Step 3: Unit suite + commit**

Run: `npm run test:unit` — expected PASS.

```bash
git add copy/ src/renderer/overlay.js src/renderer/pages/shortcuts.js src/main/main.js src/main/preload.js
git commit -m "Add /reopen slash command across all four copy locations"
```

### Task 7: ⌘L panel "closed" section

**Files:**
- Modify: `src/main/main.js` (`currentTabsPayload`, `tabs:get-all`, new `tabs:reopen-entry` handler)
- Modify: `src/main/preload.js`, `src/renderer/overlay.js` (renderList ~line 1081), `src/renderer/styles.css`

**Interfaces:**
- Consumes: `projectEntries` (Task 2), `reopenEntry` (Task 4).
- Produces: broadcast field `closed` (the five-field projection); IPC `tabs:reopen-entry` (id is a renderer proposal — main re-resolves; unknown id is a no-op).

- [ ] **Step 1: Broadcast the projection**

In `currentTabsPayload()` (find it near `broadcastTabs`, ~line 2422) and in the `tabs:get-all` handler (~line 3844), add alongside `groups`:

```js
    closed: projectEntries(rt().closedEntries ?? []),
```

Recording, downgrade, and reopen paths already call `scheduleMenuRebuild`; make sure each also triggers `scheduleBroadcastTabs()` so the section updates when a hold expires (add the call inside `downgradeHeldEntry` guarded by `hasLiveWindow()`).

- [ ] **Step 2: Renderer plumbing**

`src/main/preload.js`:
```js
  reopenClosedEntry: (entryId) => ipcRenderer.invoke('tabs:reopen-entry', entryId),
```

`src/main/main.js` (near `tabs:reopen-closed`):
```js
  chromeHandle('tabs:reopen-entry', (_e, entryId) => {
    const list = rt().closedEntries ?? [];
    const at = list.findIndex((entry) => entry.id === String(entryId));
    if (at === -1) return; // stale or forged id — renderer input is a proposal
    const [entry] = list.splice(at, 1);
    reopenEntry(entry);
  });
```

- [ ] **Step 3: Render the section in overlay.js**

In `renderList()` (~line 1081), the tab-switcher branch builds `rows` (pinned header → clusters → loose). After the last rows are pushed and before the list is committed, append the closed section. Follow `pinnedHeaderRow`'s structure (~line 614) for the header and `tabRow`'s for rows:

```js
      const closed = (state.closed ?? []).slice(-4).reverse(); // newest first, max 4
      if (closed.length) {
        const header = document.createElement('div');
        header.className = 'row section-header closed-header';
        const name = document.createElement('span');
        name.className = 'section-name';
        name.textContent = 'closed';
        header.appendChild(name);
        rows.push(header);
        for (const entryItem of closed) {
          const row = document.createElement('div');
          row.className = 'row closed-row';
          row.setAttribute('role', 'button');
          const icon = document.createElement('span');
          icon.className = 'closed-glyph';
          icon.textContent = '↶';
          const title = document.createElement('span');
          title.className = 'row-title';
          title.textContent = entryItem.tabCount > 1
            ? `${entryItem.title} · ${entryItem.tabCount} tabs`
            : entryItem.title;
          row.append(icon, title);
          if (entryItem.tier === 0) {
            const held = document.createElement('span');
            held.className = 'closed-held';
            held.textContent = 'held';
            row.appendChild(held);
          }
          row.addEventListener('click', () => {
            window.browserAPI.closeOverlay();
            window.browserAPI.reopenClosedEntry(entryItem.id);
          });
          rows.push(row);
        }
      }
```

`state.closed` is populated wherever `state.tabs`/`state.groups` are assigned from the `tabs:updated` payload and `tabs:get-all` result — grep `state.groups =` in overlay.js and mirror it.

Adapt class names and row construction to match the real `tabRow`/`pinnedHeaderRow` code style on contact — the structure above is the contract (header + rows + held marker + click-to-reopen), not pixel-exact markup.

- [ ] **Step 4: Styles**

In `src/renderer/styles.css`, colocated with the existing panel row rules, using existing tokens only (no new hex values):

```css
.closed-header { opacity: 0.55; }
.closed-row { opacity: 0.7; }
.closed-row:hover { opacity: 1; }
.closed-glyph { width: 16px; text-align: center; opacity: 0.8; }
.closed-held {
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: lowercase;
  opacity: 0.6;
  margin-left: auto;
}
```

No token value changes → no `tokens/tokens.json` update needed; confirm with `npm run substrate:check`.

- [ ] **Step 5: Verify in the real chrome, get approval, commit**

Relaunch `npm start`. ⌘L → close a tab → the closed section shows it with a `held` marker for 30 s; click restores that entry. Screenshot the panel and show the user — **this is new panel chrome; explicit approval is required before any Design System push** (none is part of this plan).

Run: `npm run test:unit && npm run substrate:check` — expected PASS.

```bash
git add src/main/main.js src/main/preload.js src/renderer/overlay.js src/renderer/styles.css
git commit -m "Show recent closed entries in the command panel with click-to-reopen"
```

### Task 8: Acceptance scenario and docs

**Files:**
- Modify: `spec/acceptance/tabs-and-groups.feature`, `test/desktop/steps/` (matching step file), `src/main/test-hook.js`, `CLAUDE.md`, `AGENTS.md`

**Interfaces:**
- Consumes: `reopenClosedTab` (already exposed on the test hook), `closeGroup`.

- [ ] **Step 1: Add the F2 group-undo scenario**

In `spec/acceptance/tabs-and-groups.feature` (tags match the file's existing F2 scenarios):

```gherkin
  @F2 @all
  Scenario: Closing a group is one undo step
    Given a group "research" holding 3 tabs
    When I close the group "research"
    And I reopen the last closed tab
    Then a group named "research" holds 3 tabs
    And the group's tabs are in their original order
```

- [ ] **Step 2: Bind the steps**

In the step file that already defines "I reopen the last closed tab" (`test/desktop/steps/workspace-recovery.steps.js` or the tabs steps file — grep for the existing phrase), add the three new bindings using the same `this.call(...)` test-hook pattern as their neighbors. Expose what they need on `src/main/test-hook.js` next to `reopenClosed()`:

```js
    closeGroupByName(name) {
      const group = rt().groups.find((g) => g.name === name);
      if (group) closeGroup(group.id);
    },
    groupTabCount(name) {
      const group = rt().groups.find((g) => g.name === name);
      if (!group) return 0;
      return rt().tabOrder.filter((id) => tabs.get(id)?.groupId === group.id).length;
    },
```

(`closeGroup` is already in scope in `main.js` where the hook object is built; add it to the hook's captured functions the same way `reopenClosedTab` is.)

- [ ] **Step 3: Dry-run the scenario resolution**

Run: `npm run test:acceptance:dry`
Expected: PASS — every step resolves to a definition (the dry run doesn't launch the app). Then, if the environment allows, `npm run test:acceptance:desktop` for the real run.

- [ ] **Step 4: Documentation paragraphs**

Add a short "Reopen Closed Tab" paragraph to `CLAUDE.md` (after the Quiet Tabs paragraph) and the equivalent in `AGENTS.md`, covering: the three tiers and the 30 s hold, the held-state firewall + `heldWebContents` blanket permission denial, one-entry-per-action grain, `closed-tabs.js` as the pure module, the §4.1 projection rule, and that private tabs remain fully excluded. Keep it to one paragraph in CLAUDE.md's established voice; do **not** touch the private-tabs sentences elsewhere.

- [ ] **Step 5: Full gates, commit**

Run: `npm run test:unit && npm run substrate:check && npm run test:acceptance:dry`
Expected: all PASS.

```bash
git add spec/acceptance/tabs-and-groups.feature test/desktop/ src/main/test-hook.js CLAUDE.md AGENTS.md
git commit -m "Acceptance: group close is one undo step; document reopen-closed-tab"
```

### Task 9: Hand verification (spec §7)

**Files:** none (verification only; fix-forward anything found, smallest-diff, one commit per fix).

- [ ] **Step 1: Run the spec's hand-verification list** against `npm start` (and `npm run dist:dir` for the quit-leak check — "works in dev" is not the bar):

1. Audio stops on ⌘W of a playing tab; the restored tab is audible again.
2. Mic/camera release on ⌘W of a capturing tab (OS indicator included); a capturing tab's close is Tier 1.
3. A held page with a remembered mic grant calling `getUserMedia` is denied; no indicator lights.
4. A prompt left open at close, then answered Allow: nothing granted, nothing persisted (check `site-permissions.json`), prompt view detaches.
5. A held page calling `window.open` opens nothing.
6. A held page whose subframe navigates still restores intact.
7. POST-derived page: Tier 0 restores it faithfully; after 30 s the restore is a GET, no resubmit dialog.
8. A video started during the hold: restored tab does not go quiet afterwards.
9. Scroll + typed form content survive Tier 0; Tier 1 lands at the right scroll with working back button.
10. Kill the held renderer (`kill -9` the WebContents PID found via Activity Monitor); ⌘⇧T restores via snapshot, no sad-tab.
11. Quit with a view held; relaunch; no orphan Blanc processes.
12. macOS: close the primary window, dock-reopen; ⌘⇧T still finds prior entries; a previously held entry restores from snapshot.

- [ ] **Step 2: Report results to the user** with what passed/failed, and leave the dev instance open.

---

## Self-review notes

- Spec coverage: §2.1 (Tasks 2, 4), §2.1.1 (2, 4), §2.2 (5), §2.3 (2 — refuse; no other task touches private), §2.4 (4, 5), §3.1 (2), §3.2–3.3 (4), §3.4 (3), §4 (6, 7), §4.1 (2, 7), §5.1 (1, 3, 4), §5.2–5.3 (3), §5.4 (3, 4, 5), §5.6 (2, 4), §6 (6, 8 + slice-test repairs in 1, 4), §7 (2, 8, 9).
- The `closeTab`/`reopenClosedTab` slice constraint is honored: new helpers are placed above `closeTab` or below `reopenClosedTab`; both names survive.
- Line numbers are anchors from the planning read, not gospel — re-grep on contact.
