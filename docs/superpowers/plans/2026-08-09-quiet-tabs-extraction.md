# Tab-view Extraction and Null-safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`
> to implement this plan task-by-task, with checkpoints between phases. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract every per-tab `WebContentsView` construction and listener
registration out of `createTab` into `src/main/tab-view.js`, and make every
`tab.view` dereference null-safe — as a strictly behaviour-preserving refactor.

**Architecture:** `main.js` currently assumes, everywhere and silently, that every
tab in the `tabs` Map has a live view. Six unattended whole-map walks and two
timer-reached dereferences would throw a `TypeError` inside a native callback — which
kills the main process — the moment that assumption breaks. This plan makes the
assumption explicit and checkable via a shared `liveContents(tab)` helper, and moves
the ~340 lines of per-tab wiring into a module that can be re-run against a fresh
view. `createTab` drops from roughly 420 lines to 70.

**Tech Stack:** Electron 43, CommonJS main process, `node --test` unit tests,
Cucumber + Playwright acceptance via `src/main/test-hook.js`.

**This ships and is valuable on its own.** It fixes a real latent crash class
regardless of whether Quiet Tabs is ever built — one of the unguarded walks throws
out of `releaseStartupNavigationGate`, which would strand the browser behind the
startup gate. It is also the prerequisite for
`docs/superpowers/plans/2026-08-09-quiet-tabs.md`, which must not begin until this
is merged.

**Completion criterion:** `npm run test:unit`, `npm run substrate:check`,
`npm run test:acceptance:dry`, and `npm run test:acceptance:desktop` all green, plus
the manual `npm start` smoke in Task 109. No behaviour change is observable.

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

At the end of this phase the repo has a new `src/main/tab-view.js` owning every
per-tab `WebContentsView` construction and listener registration, a shared
`liveContents(tab)` two-step liveness helper applied at every dereference that a
timer/`await`/unattended map-walk can reach, a maintained `webContents.id → tab.id`
index replacing the per-request linear scan in the ad-blocker counter, a
`serializeTabs` that projects an explicit allowlist instead of spreading the whole
record, and a `test-hook.js` that tolerates a tab with `view === null`. **Nothing
about the app's behaviour changes** — verify with `npm run test:unit`,
`npm run substrate:check`, `npm run test:acceptance:dry`,
`npm run test:acceptance:desktop`, and one manual `npm start` smoke (open three
tabs, switch, favourite one, open a `target="_blank"` link, close a tab).

**Read this before starting.** The implementer of these tasks needs three facts
about this codebase that are not obvious:

1. **`view.webContents` reads back `undefined`, not "destroyed", after
   `wc.close()`.** So `if (tab.view.webContents.isDestroyed())` is not a guard —
   it is a `TypeError` waiting to happen, and it has already killed the main
   process once (see the comment at `src/main/main.js:2653-2662`). The fix is
   always two steps: read the webContents into a local, *then* test it. That is
   what `liveContents` does.
2. **`function` declarations in `main.js` are hoisted.** A call at module scope
   near line 1785 can reference `function createTab` (line 1786) and
   `function setActiveTab` (line 2208) directly. `const`/`let` bindings are *not*
   hoisted — anything declared with `const` must appear textually before the
   module-scope call that reads it.
3. **`bindWindowRuntime(runtime, fn)`** wraps a callback so that
   `currentRuntime()` (aliased `rt`) resolves to `runtime` inside it, via
   `AsyncLocalStorage`. Inside a callback wrapped with
   `boundToTab = (fn) => bindWindowRuntime(owner, fn)`, `rt()` **is** `owner`, by
   construction. That equivalence is what makes the mechanical `rt()` → `owner`
   substitution in Task 103 behaviour-preserving.

**Do not add any sleep/quiet behaviour in this phase.** No `tab.asleep` writes, no
`sleepTab`, no `wakeTab`, no snapshot Map, no sweep, no setting. Three
placeholder no-op hook functions are introduced (Task 103) *only* because the
frozen `initTabView(deps)` contract requires every key to be present; they are
called by nobody until phase 2.

---

### Task 101: `src/main/tab-view.js` — the module, `liveContents`, and `createTabView`

**Files:**
- Create: `src/main/tab-view.js`
- Create: `test/unit/tab-view.test.js`
- Modify: `src/main/main.js:470-473` (delete the private-session block), `src/main/main.js:1633-1646` (delete `TAB_WEB_PREFERENCES`), `src/main/main.js:1810-1814` (call `createTabView`), and the require block at the top of `src/main/main.js`
- Test: `test/unit/tab-view.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `require('./tab-view')` exporting `createTabView(tab)`,
  `liveContents(tab)`, `TAB_WEB_PREFERENCES`, `getPrivateBrowsingSession()`,
  `PRIVATE_PARTITION`. `getPrivateBrowsingSession` becomes a **module singleton**
  in `tab-view.js` — `main.js` must import it, never redefine it, because
  `test-hook.js` compares `t.view.webContents.session === getPrivateBrowsingSession()`
  by identity.

- [ ] **Step 1: Write the failing test**

`src/main/tab-view.js` will `require('electron')`, which cannot be loaded by
`node --test`. So this test uses the house's third style: lift the real function
source out of the file with a regex and run it in a `vm` sandbox with stubs (the
precedent is `test/unit/settings-fanout-reload.test.js:8-19`). What it pins down:
`liveContents` must survive the post-`close()` shape where `webContents` is
`undefined`, and `createTabView` must be the *only* place the private-session
ternary lives.

Create `test/unit/tab-view.test.js`:

```js
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// tab-view.js requires electron and cannot be required here. Lift the real
// function sources and run them in a sandbox, so these assert the shipped
// code rather than a copy of it (same approach as settings-fanout-reload.test.js).
const viewSource = fs.readFileSync(path.join(__dirname, '../../src/main/tab-view.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

const liveContentsSource = viewSource.match(/const liveContents = \(tab\) => \{[\s\S]*?\n\};/)?.[0];
const createTabViewSource = viewSource.match(/function createTabView\(tab\) \{[\s\S]*?\n\}/)?.[0];

test('tab-view.js still exports the two functions these tests lift', () => {
  assert.ok(liveContentsSource, 'liveContents not found in tab-view.js — update this test with it');
  assert.ok(createTabViewSource, 'createTabView not found in tab-view.js — update this test with it');
});

function loadLiveContents() {
  const sandbox = {};
  vm.runInNewContext(`${liveContentsSource}\nthis.__fn = liveContents;`, sandbox);
  return sandbox.__fn;
}

test('liveContents refuses every not-live shape', () => {
  const liveContents = loadLiveContents();
  assert.equal(liveContents(undefined), null);
  assert.equal(liveContents(null), null);
  assert.equal(liveContents({}), null, 'a tab with no view');
  assert.equal(liveContents({ view: null }), null, 'a quiet tab: view nulled');
  // THE case this helper exists for: after wc.close(), WebContentsView.webContents
  // reads back undefined — not a destroyed object — so any `.isDestroyed()`
  // guard that dereferences first throws instead of guarding.
  assert.equal(liveContents({ view: {} }), null, 'post-close: webContents is undefined');
  assert.equal(
    liveContents({ view: { webContents: { isDestroyed: () => true } } }),
    null,
    'an explicitly destroyed webContents'
  );
});

test('liveContents returns the webContents itself when it is live', () => {
  const liveContents = loadLiveContents();
  const wc = { isDestroyed: () => false, marker: 'live' };
  assert.equal(liveContents({ view: { webContents: wc } }), wc);
});

function loadCreateTabView() {
  const calls = [];
  const sandbox = {
    WebContentsView: class { constructor(opts) { calls.push(opts); this.opts = opts; } },
    TAB_WEB_PREFERENCES: { preload: '/tab-preload.js', sandbox: true },
    getPrivateBrowsingSession: () => ({ partition: 'private-browsing' }),
  };
  vm.runInNewContext(`${createTabViewSource}\nthis.__fn = createTabView;`, sandbox);
  return { createTabView: sandbox.__fn, calls, prefs: sandbox.TAB_WEB_PREFERENCES };
}

test('createTabView gives an ordinary tab the shared preferences object', () => {
  const { createTabView, calls, prefs } = loadCreateTabView();
  const view = createTabView({ private: false });
  assert.ok(view, 'must return a view');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].webPreferences, prefs, 'no clone: the shared object itself');
});

test('createTabView puts a private tab on the private session', () => {
  const { createTabView, calls } = loadCreateTabView();
  createTabView({ private: true });
  assert.equal(calls[0].webPreferences.preload, '/tab-preload.js', 'base prefs still spread in');
  assert.deepEqual(calls[0].webPreferences.session, { partition: 'private-browsing' });
});

test('createTabView tolerates being called before the tab record exists', () => {
  const { createTabView, calls, prefs } = loadCreateTabView();
  createTabView(undefined);
  assert.equal(calls[0].webPreferences, prefs);
});

test('the private-session ternary lives in tab-view.js and nowhere else', () => {
  // main.js must import getPrivateBrowsingSession rather than keep its own —
  // test-hook.js compares tab sessions against it by identity, so a second
  // definition would silently report every private tab as "default".
  assert.ok(
    !/session\.fromPartition\(/.test(mainSource),
    'main.js still calls session.fromPartition — the private session must be a tab-view.js singleton'
  );
  assert.ok(
    !/webPreferences: isPrivate/.test(mainSource),
    'main.js still constructs a tab view inline — createTab must call createTabView'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern="tab-view"`

Expected: FAIL. The first assertion fails with
`liveContents not found in tab-view.js — update this test with it`, preceded by a
`ENOENT: no such file or directory, open '.../src/main/tab-view.js'` from the
`readFileSync` at module load. (An ENOENT at load counts as the failing state —
the file does not exist yet.)

- [ ] **Step 3: Write minimal implementation**

Create `src/main/tab-view.js`:

```js
'use strict';
// Everything createTab does to a tab's WebContentsView: constructing it here,
// and (see wireTabView, added alongside) registering its listeners and setup
// calls. It lives outside main.js so the exact same construction and wiring can
// be replayed later on a tab whose renderer was discarded — the private-session
// ternary in particular must exist in exactly one place, or a rebuilt private
// tab silently joins the default session while the chrome still paints the
// dashed private pill.
const path = require('path');
const { WebContentsView, session } = require('electron');

const TAB_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  // Chromium's built-in PDF viewer is a plugin; without this flag
  // PDFs download instead of rendering inline.
  plugins: true,
  // Exposes a data API to our own blanc:// pages ONLY — see the guards in
  // tab-preload.js and pages.js. Ordinary web content gets only the
  // unprivileged, session-wide Chrome compatibility surface.
  preload: path.join(__dirname, 'tab-preload.js'),
};

/** Non-persistent session shared by all private tabs for this app run. */
let privateBrowsingSession = null;
const PRIVATE_PARTITION = 'private-browsing'; // no `persist:` prefix = memory only
const getPrivateBrowsingSession = () =>
  (privateBrowsingSession ??= session.fromPartition(PRIVATE_PARTITION));

/** After wc.close(), view.webContents reads back UNDEFINED, not destroyed —
 *  see main.js's reloadTabAfterSettingsFanout, where this exact dereference
 *  killed main once. Two steps, always: read, then test. */
const liveContents = (tab) => {
  const wc = tab?.view?.webContents;
  return wc && !wc.isDestroyed() ? wc : null;
};

/**
 * The ONLY place a tab's WebContentsView is constructed. Never returns null,
 * never navigates, never registers a listener.
 * @param {{private?: boolean}} tab a tab record, or any object with a boolean
 *   `private`. Safe to call before the record exists (createTab does).
 * @returns {import('electron').WebContentsView}
 */
function createTabView(tab) {
  return new WebContentsView({
    webPreferences: tab?.private
      ? { ...TAB_WEB_PREFERENCES, session: getPrivateBrowsingSession() }
      : TAB_WEB_PREFERENCES,
  });
}

module.exports = {
  createTabView,
  liveContents,
  TAB_WEB_PREFERENCES,
  getPrivateBrowsingSession,
  PRIVATE_PARTITION,
};
```

Now edit `src/main/main.js`, four places.

(a) Add the require. Put it immediately after the existing
`const { shouldClearFaviconOnNavigate } = require('./favicon-policy');` line
(currently line 45):

```js
const {
  createTabView,
  liveContents,
  TAB_WEB_PREFERENCES,
  getPrivateBrowsingSession,
} = require('./tab-view');
```

(b) Delete lines 470-473 entirely (the four-line block beginning
`/** Non-persistent session shared by all private tabs for this app run. */` and
ending `(privateBrowsingSession ??= session.fromPartition(PRIVATE_PARTITION));`).

(c) Delete lines 1633-1646 entirely — the whole `const TAB_WEB_PREFERENCES = { … };`
declaration, including its comments.

(d) Replace lines 1810-1814:

```js
  view ??= new WebContentsView({
    webPreferences: isPrivate
      ? { ...TAB_WEB_PREFERENCES, session: getPrivateBrowsingSession() }
      : TAB_WEB_PREFERENCES,
  });
```

with:

```js
  view ??= createTabView({ private: isPrivate });
```

`TAB_WEB_PREFERENCES` is still read by `createUtilitySheet` around line 989 —
that is why it stays in the destructured require rather than being dropped.
`WebContentsView` is still used elsewhere in `main.js` (the overlay, the utility
sheet, the adopted-child `createWindow`), so leave the top-level `electron`
destructure alone.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit`

Expected: PASS — every test file, including the seven new `tab-view` tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/tab-view.js test/unit/tab-view.test.js src/main/main.js
git commit -m "Extract tab view construction and add the liveContents helper

createTabView and the private-session singleton move to src/main/tab-view.js so
the private webPreferences ternary exists in exactly one place. liveContents is
the two-step read/test that a post-close webContents (which reads back
undefined, not destroyed) requires.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 102: A maintained `webContents.id → tab.id` index

**Files:**
- Modify: `src/main/main.js` — new declarations beside `const tabs = new Map();` (line 596); `createTab` (after line 1853); `closeTab` (around line 2312); `onRequestBlocked` (lines 3649-3658); `tabForWebContents` (lines 3486-3492)
- Test: `test/unit/tab-wc-index.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: module-scope `const tabIdByWebContentsId = new Map(); // Map<number, string>`
  and `function forgetTabWebContentsIds(tabId)` in `main.js`.
  `tabIdByWebContentsId` is passed into `initTabView` in Task 103 and is read by
  phase 2's `restorableCommit` composition.

Background: `onRequestBlocked` fires **tens of times per second** while pages
load, and today each call walks the whole `tabs` Map dereferencing
`tab.view.webContents.id`. Once a tab can have `view === null` that walk throws
on every blocked request. Replacing it with an index fixes both the crash and the
cost.

- [ ] **Step 1: Write the failing test**

Create `test/unit/tab-wc-index.test.js`. What it pins down: the index is cleaned
up **by value**, because a closed tab's `view.webContents` is already `undefined`
and the key it was stored under is no longer recoverable from the record; and the
hot ad-block counter no longer walks `tabs`.

```js
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const fnSource = mainSource.match(/function forgetTabWebContentsIds\(tabId\) \{[\s\S]*?\n\}/)?.[0];

test('forgetTabWebContentsIds is still present in main.js', () => {
  assert.ok(fnSource, 'forgetTabWebContentsIds not found — update this test with it');
});

/** Run the real function against a Map we control. */
function load(entries) {
  const sandbox = { tabIdByWebContentsId: new Map(entries) };
  vm.runInNewContext(`${fnSource}\nthis.__fn = forgetTabWebContentsIds;`, sandbox);
  return { call: sandbox.__fn, map: sandbox.tabIdByWebContentsId };
}

test('closing a tab drops every index entry that pointed at it', () => {
  // A tab can be indexed under more than one webContents id over its life
  // (an adopted child, and later a rebuilt renderer), so deletion is by value.
  const { call, map } = load([[11, 'tab-a'], [12, 'tab-b'], [13, 'tab-a']]);
  call('tab-a');
  assert.deepEqual([...map.entries()], [[12, 'tab-b']]);
});

test('forgetting an unknown tab id is a no-op', () => {
  const { call, map } = load([[11, 'tab-a']]);
  call('tab-zzz');
  assert.deepEqual([...map.entries()], [[11, 'tab-a']]);
});

test('forgetting from an empty index is a no-op', () => {
  const { call, map } = load([]);
  call('tab-a');
  assert.equal(map.size, 0);
});

test('the blocked-request counter no longer walks the tabs Map', () => {
  // onRequestBlocked fires tens of times per second while pages load. A linear
  // scan there dereferences tab.view.webContents on every open tab per request.
  const handler = mainSource.match(/onRequestBlocked\(bindWindowRuntime\([\s\S]*?\n  \}\)\);/)?.[0];
  assert.ok(handler, 'onRequestBlocked registration not found — update this test with it');
  assert.ok(
    !/for \(const tab of tabs\.values\(\)\)/.test(handler),
    'onRequestBlocked still iterates tabs.values() — use tabIdByWebContentsId'
  );
  assert.ok(
    /tabIdByWebContentsId\.get\(/.test(handler),
    'onRequestBlocked must resolve the tab through the index'
  );
});

test('tabForWebContents no longer walks the tabs Map', () => {
  const fn = mainSource.match(/function tabForWebContents\(wc\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(fn, 'tabForWebContents not found — update this test with it');
  assert.ok(
    !/for \(const tab of tabs\.values\(\)\)/.test(fn),
    'tabForWebContents still iterates tabs.values() — use tabIdByWebContentsId'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern="index|counter|tabForWebContents|forgetTab"`

Expected: FAIL with
`forgetTabWebContentsIds not found — update this test with it`.

- [ ] **Step 3: Write minimal implementation**

(a) In `src/main/main.js`, immediately after `const tabs = new Map();` (line 596)
and its surrounding comment, add:

```js
/** webContents.id -> tab.id. Maintained rather than searched: the ad blocker's
 *  per-request counter resolves a tab tens of times per second, and a linear
 *  walk of `tabs` dereferencing view.webContents there is both the hot path and
 *  a crash once a tab can exist without a view. */
const tabIdByWebContentsId = new Map();

/** Drop every index entry pointing at `tabId`. Deletion is BY VALUE because a
 *  closing tab's view.webContents already reads back undefined, so the key it
 *  was stored under is no longer recoverable from the record. One pass over at
 *  most one entry per open tab, once per close — not the per-request cost this
 *  index exists to remove. */
function forgetTabWebContentsIds(tabId) {
  for (const [wcId, id] of tabIdByWebContentsId) {
    if (id === tabId) tabIdByWebContentsId.delete(wcId);
  }
}
```

(b) In `createTab`, immediately after `const wc = view.webContents;` (line 1853),
add:

```js
  tabIdByWebContentsId.set(wc.id, id);
```

(c) In `closeTab`, immediately after the `if (!tab) return;` guard (line 2314),
add:

```js
  forgetTabWebContentsIds(id);
```

(d) Replace the body of the `onRequestBlocked` registration (currently lines
3649-3658) so it reads:

```js
  onRequestBlocked(bindWindowRuntime(primaryRuntime, (request) => {
    adblockWeekStats().update((d) => { d.blocked += 1; });
    const tab = tabs.get(tabIdByWebContentsId.get(request.tabId));
    if (!tab) return;
    tab.blockedCount += 1;
    scheduleBroadcastTabs();
  }));
```

(e) Replace `tabForWebContents` (currently lines 3486-3492) with:

```js
  // Resolve the tab owning a requesting webContents through the maintained
  // index — never by walking `tabs` and dereferencing each view.
  function tabForWebContents(wc) {
    if (!wc) return null;
    return tabs.get(tabIdByWebContentsId.get(wc.id)) ?? null;
  }
```

Note the indentation: `tabForWebContents` is nested inside the
`app.whenReady().then(...)` callback, so its body is indented two extra spaces —
match the surrounding code exactly, or the regex in the test (`\n  \}`) will not
find its closing brace.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js test/unit/tab-wc-index.test.js
git commit -m "Index tabs by webContents id instead of scanning the map

onRequestBlocked ran a linear walk of the tabs Map per blocked request, tens of
times a second, dereferencing every tab's view.webContents. tabForWebContents did
the same on every permission prompt. Both now read a maintained index; closing a
tab clears it by value, since a closing tab's webContents is already gone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 103: Extract `wireTabView` and `initTabView` into `tab-view.js`

**Files:**
- Modify: `src/main/tab-view.js` (add requires, `initTabView`, `wireTabView`, exports)
- Modify: `src/main/main.js:1853-2191` (the block moves out), plus a module-scope
  `initTabView({ … })` call inserted immediately before `function createTab`
  (line 1786), plus three no-op hook stubs
- Test: `test/unit/tab-view.test.js` (extend the file created in Task 101)

**Interfaces:**
- Consumes: `createTabView(tab)`, `liveContents(tab)`,
  `TAB_WEB_PREFERENCES`, `getPrivateBrowsingSession()` from
  `src/main/tab-view.js` (Task 101); `tabIdByWebContentsId` and
  `forgetTabWebContentsIds(tabId)` from `src/main/main.js` (Task 102).
- Produces: `initTabView(deps)` and `wireTabView(tab, view, { owner, adopted })`
  exported from `src/main/tab-view.js`, plus the three no-op hooks
  `onMainFrameCommit(tab, { url, httpResponseCode })`,
  `noteWakeSuppressed(tab)`, `notePopupChild(openerTabId, childWindow)` in
  `main.js`, which phase 2 replaces with real bodies.

This is the largest task in the phase and it is a **mechanical move**, not a
rewrite. Everything `createTab` does to the tab's webContents — every listener
and every setup call — moves as-is into `wireTabView`, and the ~25 things that
block closed over in `main.js` are injected once through `initTabView`.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/tab-view.test.js` (the file from Task 101 already reads
`viewSource` and `mainSource`; do not re-declare them):

```js
const wireSource = viewSource.match(/function wireTabView\(tab, view, \{ owner, adopted \}\) \{[\s\S]*?\n\}/)?.[0];

test('wireTabView is still present in tab-view.js', () => {
  assert.ok(wireSource, 'wireTabView not found in tab-view.js — update this test with it');
});

// The extraction boundary is "everything createTab does to the webContents":
// the listeners AND the setup calls. Getting it wrong is silent — a rebuilt tab
// without applyWindowOpenPolicy FAILS OPEN, because Electron's default
// window.open action is allow, so it can spawn an untracked, non-private,
// policy-free window. Nothing else in the suite catches that.
for (const required of [
  'installChromeShortcuts',
  'watchCursorFor',
  'setWebRTCIPHandlingPolicy',
  'setAudioMuted',
  'applyWindowOpenPolicy',
  'attachContextMenu',
]) {
  test(`wireTabView performs ${required}`, () => {
    assert.ok(wireSource.includes(required), `${required} must live inside wireTabView`);
  });
}

test('every listener wireTabView registers opens with the stale-webContents guard', () => {
  // The guard is belt and braces for the phase where a tab's renderer is torn
  // down asynchronously: close() is async, so a tab's own listeners keep firing
  // for milliseconds against a webContents the record no longer points at.
  const guard = 'if (tab.sleeping || tab.view?.webContents !== wc) return;';
  const guards = wireSource.split(guard).length - 1;
  assert.ok(guards >= 16, `expected the guard on every listener, found ${guards}`);
});

test('main.js no longer registers tab listeners inline', () => {
  const createTab = mainSource.match(/function createTab\(url = newTabUrl\(\)[\s\S]*?\n\}/)?.[0];
  assert.ok(createTab, 'createTab not found in main.js — update this test with it');
  assert.ok(
    /wireTabView\(tab, view, \{ owner, adopted \}\)/.test(createTab),
    'createTab must delegate all webContents wiring to wireTabView'
  );
  assert.ok(
    !/wc\.on\('did-navigate'/.test(createTab),
    'createTab still registers listeners inline — they belong in wireTabView'
  );
});

test('main.js initialises tab-view exactly once, at module scope', () => {
  assert.equal(
    (mainSource.match(/^initTabView\(\{/gm) || []).length,
    1,
    'initTabView must be called exactly once, unindented (module scope)'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern="wireTabView|initialises|inline"`

Expected: FAIL with
`wireTabView not found in tab-view.js — update this test with it`.

- [ ] **Step 3: Write minimal implementation**

**(a) Extend `src/main/tab-view.js`'s requires.** Replace its current two require
lines with:

```js
const path = require('path');
const { WebContentsView, session, dialog } = require('electron');
const settings = require('./settings');
const bookmarks = require('./bookmarks');
const history = require('./history');
const sync = require('./sync');
const { attachContextMenu } = require('./context-menu');
const { webrtcPolicyFor } = require('./network-privacy');
const { shouldClearFaviconOnNavigate } = require('./favicon-policy');
const { blockableHostname } = require('./adblock-exceptions');
```

**(b) Add the dependency injection point.** Put this after `createTabView` in
`tab-view.js`:

```js
/** main.js's collaborators, injected once by initTabView. Never a require:
 *  tab-view.js must not require main.js, or the cycle makes both half-loaded. */
let deps = null;

/**
 * Inject main.js's collaborators. Called exactly once, from main.js module
 * scope, before any tab exists. Every key is required — a missing one throws
 * here rather than at event time, when a tab is already half-wired.
 */
function initTabView(injected) {
  const required = [
    'tabs', 'windowRuntimes', 'bindWindowRuntime', 'tabIdByWebContentsId',
    'broadcastTabs', 'scheduleBroadcastTabs', 'scheduleSampleTint', 'scheduleMenuRebuild',
    'createTab', 'setActiveTab', 'closeTab', 'openInternalPage',
    'currentChromeLayout', 'hideOverlay', 'hasLiveWindow',
    'reclaimAddressBarFocus', 'shouldReclaimAddressBarFocus',
    'installChromeShortcuts', 'watchCursorFor',
    'isUtilityUrl', 'handOffToOs', 'upgradeFavicon',
    'isStartupGateActive', 'startupQueuedNavigations',
    'onMainFrameCommit', 'noteWakeSuppressed', 'notePopupChild',
    'onePasswordSpikeEnabled', 'fillActiveTabFrom1Password',
  ];
  for (const key of required) {
    if (injected?.[key] === undefined) throw new Error(`initTabView: missing dependency "${key}"`);
  }
  deps = injected;
}
```

**(c) Move the block.** In `src/main/main.js`, cut lines **1853 through 2191**
inclusive — from `  const wc = view.webContents;` down to and including the `  });`
that closes the `attachContextMenu(wc, { … })` call. Leave line 2192 (blank) and
everything from 2193 (`// Load failures surface …`) onward in place.

Paste that block into `tab-view.js` inside this wrapper, placed after
`initTabView`:

```js
/**
 * Attach EVERY per-tab webContents listener and setup call. It never removes
 * listeners itself.
 *
 * @param {object} tab   the tab record. `tab.view` MUST already be set to `view`.
 * @param {import('electron').WebContentsView} view
 * @param {object}  options
 * @param {object}  options.owner   the window-runtime record owning this tab.
 *   In createTab this is the runtime that is creating it; on any later re-wire
 *   it MUST be windowRuntimes.runtimeForTab(tab.id), never the current runtime.
 * @param {boolean} options.adopted true only for a window.open child whose
 *   webContents Chromium built. Reserved: nothing reads it yet.
 * @returns {void}
 */
function wireTabView(tab, view, { owner, adopted }) {
  if (!deps) throw new Error('wireTabView called before initTabView');
  const {
    tabs, windowRuntimes, bindWindowRuntime, tabIdByWebContentsId,
    broadcastTabs, scheduleBroadcastTabs, scheduleSampleTint, scheduleMenuRebuild,
    createTab, setActiveTab, closeTab, openInternalPage,
    currentChromeLayout, hideOverlay, hasLiveWindow,
    reclaimAddressBarFocus, shouldReclaimAddressBarFocus,
    installChromeShortcuts, watchCursorFor,
    isUtilityUrl, handOffToOs, upgradeFavicon,
    isStartupGateActive, startupQueuedNavigations,
    onePasswordSpikeEnabled, fillActiveTabFrom1Password,
    onMainFrameCommit, noteWakeSuppressed, notePopupChild,
  } = deps;
  // The lifted block referred to createTab's `id` local and to `rt()`; both are
  // re-derived here so the body itself needs no further edits.
  const id = tab.id;

  // <<< PASTE main.js:1853-2191 HERE, then apply the substitutions below >>>
}
```

**(d) Apply these substitutions to the pasted body, and nothing else.** They are
exhaustive; work through them in order.

| # | Find (in the pasted body) | Replace with | Why |
|---|---|---|---|
| 1 | `rt().` (every occurrence) | `owner.` | Every one of these sits inside a `boundToTab` callback, where `rt()` resolves to `owner` by construction. |
| 2 | `rt()` used as an argument: `windowRuntimes.registerAuxiliaryContent(rt(), childWcId)` | `windowRuntimes.registerAuxiliaryContent(owner, childWcId)` | same |
| 3 | `bindWindowRuntime(primaryRuntime, () => {` (inside `did-create-window`) | `bindWindowRuntime(owner, () => {` | `primaryRuntime` is a main.js `let` and is not injected. In M1 `owner === primaryRuntime` always, so this is identical today and more correct for multi-window later. |
| 4 | `if (muted) wc.setAudioMuted(true);` | `if (tab.muted) wc.setAudioMuted(true);` | `muted` was a `createTab` parameter; `tab.muted` was assigned from it. |
| 5 | `ONE_PASSWORD_SPIKE_ENABLED` | `onePasswordSpikeEnabled` | injected name |
| 6 | `startupNavigationGateActive` (inside `did-fail-load`) | `isStartupGateActive()` | it is a `let` in main.js and must be read live |
| 7 | *(nothing)* | add `const wc = view.webContents;` as the first statement of the pasted body | it was line 1853, which you cut; re-add it verbatim at the top |

Everything else — `tab`, `id`, `wc`, `boundToTab`, `owner`, `settings`,
`bookmarks`, `history`, `sync`, `dialog`, `WebContentsView`, `attachContextMenu`,
`webrtcPolicyFor`, `shouldClearFaviconOnNavigate`, `blockableHostname` — already
resolves, either from the destructured `deps`, the module requires, or the two
locals above.

**(e) Add the stale-webContents guard.** As the **first statement inside each of
these 17 listener callbacks**, insert verbatim:

```js
    if (tab.sleeping || tab.view?.webContents !== wc) return;
```

The 17: `before-input-event` (the 1Password chord), `audio-state-changed`,
`page-title-updated`, `page-favicon-updated`, `did-start-loading`,
`did-stop-loading`, `did-change-theme-color`, `did-navigate`,
`did-navigate-in-page`, `did-start-navigation`, `did-finish-load`, `focus`,
`will-navigate`, `did-fail-load`, `render-process-gone`, `will-prevent-unload`,
`found-in-page`.

Three deliberate exceptions — **do not** put that guard on them:

- `wc.once('destroyed', boundToTab(() => closeTab(id)))` gets
  `boundToTab(() => { if (tab.sleeping) return; closeTab(id); })` instead. By the
  time `destroyed` fires, `view.webContents` is already `undefined`, so the full
  guard would return early and an adopted child that closes itself would never be
  pruned from the tab strip.
- `targetWc.setWindowOpenHandler(…)` — its callback must return an action object;
  a bare `return` would make Electron throw.
- `targetWc.on('did-create-window', …)` — popups are opened with
  `outlivesOpener: true` and are *meant* to survive their opener tab. Refusing to
  graft the window-open policy onto a surviving popup would let its own children
  fall through to bare, policy-free Electron windows.

**(f) Export the new functions.** Replace `tab-view.js`'s `module.exports` with:

```js
module.exports = {
  createTabView,
  wireTabView,
  initTabView,
  liveContents,
  TAB_WEB_PREFERENCES,
  getPrivateBrowsingSession,
  PRIVATE_PARTITION,
};
```

**(g) Close the hole in `main.js`'s `createTab`.** Where the block used to be —
directly after `windowRuntimes.attachTab(owner, id);` and the blank line — the
code must now read:

```js
  const wc = view.webContents;
  tabIdByWebContentsId.set(wc.id, id);
  wireTabView(tab, view, { owner, adopted });

  // Load failures surface via the did-fail-load handler above; the
```

(The `tabIdByWebContentsId.set(...)` line is already there from Task 102; keep
it, and keep `const wc = view.webContents;` because lines 2201-2202 still use
`wc`.)

**(h) Add the three no-op hooks and the `initTabView` call to `main.js`.** Insert
this immediately **before** `function createTab(` (line 1786), at module scope
and unindented:

```js
// --- Quiet Tabs hooks (phase 2 fills these in) --------------------------
// The tab-view dependency contract is fixed, so these three exist now as
// no-ops rather than being added to the injection later. Nothing calls them.
/** Record whether a tab's last main-frame commit is safely refetchable. */
function onMainFrameCommit(_tab, _details) {}
/** True while a tab is inside a wake generation (history + did-fail-load are
 *  suppressed for every hop of the redirect chain while it is open). */
function noteWakeSuppressed(_tab) { return false; }
/** Count a popup BrowserWindow that never becomes a tab, against its opener. */
function notePopupChild(_openerTabId, _childWindow) {}

// tab-view.js owns every per-tab WebContentsView listener and setup call, so it
// needs main.js's collaborators. Injected once, here, before any tab exists:
// function declarations below are hoisted, and every `const` read here is
// declared textually above this point.
initTabView({
  tabs,
  windowRuntimes,
  bindWindowRuntime,
  tabIdByWebContentsId,
  broadcastTabs,
  scheduleBroadcastTabs,
  scheduleSampleTint,
  scheduleMenuRebuild,
  createTab,
  setActiveTab,
  closeTab,
  openInternalPage,
  currentChromeLayout,
  hideOverlay,
  hasLiveWindow,
  reclaimAddressBarFocus,
  shouldReclaimAddressBarFocus,
  installChromeShortcuts,
  watchCursorFor,
  isUtilityUrl,
  handOffToOs,
  upgradeFavicon,
  isStartupGateActive: () => startupNavigationGateActive,
  startupQueuedNavigations,
  onMainFrameCommit,
  noteWakeSuppressed,
  notePopupChild,
  onePasswordSpikeEnabled: ONE_PASSWORD_SPIKE_ENABLED,
  fillActiveTabFrom1Password,
});
```

Then add `wireTabView` and `initTabView` to the `require('./tab-view')`
destructure at the top of `main.js`.

**Placement matters.** `initTabView` reads four `const` bindings —
`ONE_PASSWORD_SPIKE_ENABLED` (line 1650), `tabs` (596), `tabIdByWebContentsId`
(596-ish, Task 102), `hasLiveWindow` (593) — and `const` is not hoisted. Line
1785 is after all of them. Moving this call earlier will throw
`ReferenceError: Cannot access 'ONE_PASSWORD_SPIKE_ENABLED' before initialization`
at startup.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit`

Expected: PASS.

Then run the app and click through it, because no unit test covers the wiring:

Run: `npm start`

Expected: the window opens; typing a URL navigates; the title and favicon appear
in the pill; ⌘L opens the panel; opening a `target="_blank"` link (e.g. from
`https://example.com`) creates a **tab**, not a bare window; right-clicking a link
offers "Open Link in New Tab"; closing a tab leaves the rest working. Any console
error mentioning `initTabView: missing dependency` means a key was dropped from
step (h).

- [ ] **Step 5: Commit**

```bash
git add src/main/tab-view.js src/main/main.js test/unit/tab-view.test.js
git commit -m "Move every per-tab webContents listener into tab-view.js

wireTabView takes the whole block createTab used to inline: the setup calls
(chrome shortcuts, cursor watch, WebRTC policy, audio mute, window-open policy,
context menu) and all 18 listeners. main.js injects its collaborators once
through initTabView instead of the block closing over them. Each listener now
opens with a stale-webContents guard; the destroyed observer and the two
window-open policy handlers are documented exceptions.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 104: Null-safe the four unattended whole-map iterations

**Files:**
- Modify: `src/main/main.js` — `applyWebrtcPolicyToAllTabs` (~line 3379),
  `broadcastStartPageStatus` (~line 3543), `pushRemoteDevices` (~line 3698)
- Modify: `src/main/tab-view.js` — the `did-create-window` "is this a managed
  tab?" scan inside `applyWindowOpenPolicy`
- Test: run the existing suite (see Step 1)

**Interfaces:**
- Consumes: `liveContents(tab)` from `src/main/tab-view.js` (Task 101).
- Produces: nothing new.

Each of these walks the whole `tabs` Map and dereferences `tab.view.webContents`
on every entry. They run from settings writes, start-page broadcasts, sync pulls,
and window-open — none of which knows anything about a tab's view lifetime.

- [ ] **Step 1: Run the existing suite as the baseline**

This task is a behaviour-preserving refactor: `liveContents(tab)` returns exactly
the same webContents these lines dereference today, and returns `null` only in
states that currently throw. There is no new seam, so the "test" is that nothing
regresses.

Run: `npm run test:unit && npm run test:acceptance:dry`

Expected: PASS (both). Note the totals; they must be identical at Step 4.

- [ ] **Step 2: Confirm the four sites are still where this task says they are**

Run: `grep -n "tab.view.webContents\|t.view.webContents" src/main/main.js src/main/tab-view.js`

Expected: among the results are the `applyWebrtcPolicyToAllTabs` loop, the
`broadcastStartPageStatus` loop, the `pushRemoteDevices` loop (all in `main.js`),
and the `isManagedTab` scan (in `tab-view.js`). If any has moved, use the actual
line — do not edit by line number alone.

- [ ] **Step 3: Write minimal implementation**

(a) `applyWebrtcPolicyToAllTabs`:

```js
// Re-apply the current WebRTC policy to every open tab (used when the setting changes).
function applyWebrtcPolicyToAllTabs() {
  const policy = webrtcPolicyFor(settings.getSettings().webrtcPolicy);
  for (const tab of tabs.values()) {
    liveContents(tab)?.setWebRTCIPHandlingPolicy(policy);
  }
}
```

(b) `broadcastStartPageStatus`:

```js
  const broadcastStartPageStatus = () => {
    const status = startPageStatus();
    for (const tab of tabs.values()) {
      if (!tab.url?.startsWith('blanc://newtab')) continue;
      liveContents(tab)?.send('pages:start:status', status);
    }
  };
```

(c) `pushRemoteDevices`:

```js
  const pushRemoteDevices = bindWindowRuntime(primaryRuntime, () => {
    const devices = sync.listRemoteDevices();
    rt().overlayView?.webContents.send('chrome:remote-tabs-updated', devices);
    for (const tab of tabs.values()) {
      if (!tab.url?.startsWith('blanc://newtab')) continue;
      liveContents(tab)?.send('pages:start:remote-tabs', devices);
    }
  });
```

(d) In `src/main/tab-view.js`, inside `applyWindowOpenPolicy`'s
`did-create-window` handler, replace:

```js
      const isManagedTab = [...tabs.values()].some(
        (t) => t.view.webContents.id === childWindow.webContents.id
      );
```

with:

```js
      const childId = childWindow.webContents.id;
      const isManagedTab = [...tabs.values()].some((t) => liveContents(t)?.id === childId);
```

- [ ] **Step 4: Run the suite again**

Run: `npm run test:unit && npm run test:acceptance:dry`

Expected: PASS, with the same totals as Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js src/main/tab-view.js
git commit -m "Null-safe the four unattended walks over the tabs map

applyWebrtcPolicyToAllTabs (every settings write), broadcastStartPageStatus,
pushRemoteDevices (every sync pull), and the did-create-window managed-tab scan
all dereferenced tab.view.webContents on every open tab. None of their callers
knows a tab's view lifetime; all four now read through liveContents.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 105: Null-safe the two derefs reached from a timer or an await

**Files:**
- Modify: `src/main/main.js:250-269` (`releaseStartupNavigationGate`),
  `src/main/main.js:1461-1481` (`samplePageTint`)
- Test: `test/unit/startup-gate-release.test.js`

**Interfaces:**
- Consumes: `liveContents(tab)` from `src/main/tab-view.js` (Task 101).
- Produces: nothing new.

`releaseStartupNavigationGate` runs `[...tabs.values()].find(c => c.view.webContents.id === …)`.
A `find` predicate that throws does not skip the entry — it propagates out of
`find`, out of `releaseStartupNavigationGate`, and **strands the browser behind
the startup gate with every tab blank**. `samplePageTint` is reached from a bare
150 ms `setTimeout` (`scheduleSampleTint`), which is plenty of time for the tab to
be closed.

- [ ] **Step 1: Write the failing test**

Create `test/unit/startup-gate-release.test.js`. What it pins down: one
unresolvable tab in the map must not stop the other queued navigations from being
replayed.

```js
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const viewSource = fs.readFileSync(path.join(__dirname, '../../src/main/tab-view.js'), 'utf8');
const fnSource = mainSource.match(
  /function releaseStartupNavigationGate\(sessions, \{ blockerAttached \}\) \{[\s\S]*?\n\}/
)?.[0];
const liveContentsSource = viewSource.match(/const liveContents = \(tab\) => \{[\s\S]*?\n\};/)?.[0];

test('the gate-release function and liveContents are still liftable', () => {
  assert.ok(fnSource, 'releaseStartupNavigationGate not found — update this test with it');
  assert.ok(liveContentsSource, 'liveContents not found in tab-view.js — update this test with it');
});

/** Run the real function over a controlled tabs map and queue. */
function load({ tabList, queued }) {
  const loaded = [];
  const sandbox = {
    tabs: new Map(tabList.map((t, i) => [`t${i}`, t])),
    startupQueuedNavigations: new Map(queued),
    startupNavigationGateActive: true,
    loaded,
  };
  vm.runInNewContext(
    `${liveContentsSource}\n${fnSource}\nthis.__fn = releaseStartupNavigationGate;`,
    sandbox
  );
  sandbox.__fn([], { blockerAttached: true });
  return loaded;
}

const liveTab = (wcId, loaded) => ({
  view: {
    webContents: {
      id: wcId,
      isDestroyed: () => false,
      loadURL: (url) => { loaded.push([wcId, url]); return Promise.resolve(); },
    },
  },
});

test('every queued navigation is replayed onto its tab', () => {
  const loaded = [];
  const tabList = [liveTab(11, loaded), liveTab(12, loaded)];
  // The sandbox builds its own array, so pass the same one through the closure.
  const result = load({ tabList, queued: [[11, 'https://a.example/'], [12, 'https://b.example/']] });
  assert.deepEqual(loaded.sort(), [[11, 'https://a.example/'], [12, 'https://b.example/']]);
  assert.equal(result.length, 0, 'the sandbox `loaded` is unused here; assertions use the closure array');
});

test('a tab whose view is gone does not strand the other queued navigations', () => {
  // THE regression: a throwing predicate propagates out of Array.prototype.find,
  // out of the release function, and leaves the whole browser gated and blank.
  const loaded = [];
  const tabList = [
    { view: null },                                  // a tab with no view at all
    { view: {} },                                    // post-close: webContents undefined
    { view: { webContents: { id: 13, isDestroyed: () => true } } }, // destroyed
    liveTab(14, loaded),
  ];
  load({ tabList, queued: [[13, 'https://dead.example/'], [14, 'https://live.example/']] });
  assert.deepEqual(loaded, [[14, 'https://live.example/']]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern="strand"`

Expected: FAIL with `TypeError: Cannot read properties of null (reading 'webContents')`
thrown from inside the lifted `find` predicate.

- [ ] **Step 3: Write minimal implementation**

(a) In `releaseStartupNavigationGate`, replace the replay loop (currently lines
262-269) with:

```js
  for (const [webContentsId, url] of queued) {
    // A throwing predicate does not skip an entry — it propagates out of `find`
    // and out of this function, leaving every tab gated and blank. liveContents
    // is the two-step read that cannot throw.
    const tab = [...tabs.values()].find(
      (candidate) => liveContents(candidate)?.id === webContentsId
    );
    const wc = liveContents(tab);
    if (!wc) continue;
    wc.loadURL(url).catch(() => {});
  }
```

(b) In `samplePageTint`, replace the first ten lines of the body (currently lines
1462-1471, from `if (!tabs.has(tab.id)` down to and including the
`if (!width || tab.view.webContents.isLoading()) return;` line) with:

```js
  // Reached from a bare 150ms timer (scheduleSampleTint) as well as from
  // setActiveTab, so the tab can be closed — or its renderer torn down —
  // between the schedule and the run.
  const wc = liveContents(tab);
  if (!tabs.has(tab.id) || !wc) return;
  if (tab.private || !/^https?:\/\//.test(tab.url)) {
    if (tab.pageBg) {
      tab.pageBg = null;
      scheduleBroadcastTabs();
    }
    return;
  }
  const { width } = tab.view?.getBounds() ?? {};
  if (!width || wc.isLoading()) return;
```

and, further down, replace

```js
    const image = await tab.view.webContents.capturePage({ x: 0, y: 0, width, height: 2 });
```

with

```js
    const image = await wc.capturePage({ x: 0, y: 0, width, height: 2 });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js test/unit/startup-gate-release.test.js
git commit -m "Stop the startup-gate release and the tint sampler throwing on a dead view

releaseStartupNavigationGate resolved queued navigations with a find() predicate
that dereferenced every tab's view; one dead tab threw out of find and stranded
the browser behind the gate with blank tabs. samplePageTint runs from a bare
150ms timer and had the same shape. Both now read through liveContents.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 106: Null-safe the synchronous call sites and the eleven arbitrary-id handlers

**Files:**
- Modify: `src/main/main.js` — `resizeActiveView` (~1283), `navigateTabToAddress`
  (~1103), `toggleTabMuted` (~1609), `duplicateTab` (~1619), `setActiveTab`
  (~2214, ~2242, ~2277), `activateTabFromRail` (~2288), `closeTab` (~2320, ~2331),
  `openInternalPage` (~2440), `reloadTabAfterSettingsFanout` (~2650), and the
  `tabs:search` / `tabs:back` / `tabs:forward` / `tabs:reload` / `tabs:stop` /
  `tabs:find` / `tabs:find-stop` handlers (~2759-2764, ~2793-2794)
- Modify: `test/unit/settings-fanout-reload.test.js:22-31` (its `vm` sandbox must
  now provide `liveContents`)
- Test: `test/unit/settings-fanout-reload.test.js`

**Interfaces:**
- Consumes: `liveContents(tab)` from `src/main/tab-view.js` (Task 101).
- Produces: nothing new.

All the `tabs.get(id)?.view.webContents.…` handlers use an optional chain that
stops at the **tab**, not at the view — so a live tab with no live view throws.
Two of them (`activateTabFromRail`, `toggleTabMuted`) are demonstrably reached
with a background tab's id today, from the rail and from the panel's mute button.

- [ ] **Step 1: Write the failing test**

`reloadTabAfterSettingsFanout` is already covered by
`test/unit/settings-fanout-reload.test.js`, which lifts its source into a `vm`
sandbox. Migrating it onto `liveContents` breaks that sandbox (the name is not
defined there), so the test must be updated in the same commit. Edit its `load()`
helper — replace lines 22-31, i.e. the comment block plus the whole `load`
function, with:

```js
// The lifted function now calls liveContents, which lives in tab-view.js — lift
// that too, so this still runs the shipped code rather than a stand-in.
const viewSource = fs.readFileSync(path.join(__dirname, '../../src/main/tab-view.js'), 'utf8');
const liveContentsSource = viewSource.match(/const liveContents = \(tab\) => \{[\s\S]*?\n\};/)?.[0];

test('liveContents is still liftable from tab-view.js', () => {
  assert.ok(liveContentsSource, 'liveContents not found in tab-view.js — update this test with it');
});

/** Run the real function; returns a `flush()` that fires the deferred turn. */
function load() {
  let deferred = null;
  const sandbox = { setImmediate: (fn) => { deferred = fn; } };
  vm.runInNewContext(
    `${liveContentsSource}\n${fnSource}\nthis.__fn = reloadTabAfterSettingsFanout;`,
    sandbox
  );
  return {
    call: (tab) => sandbox.__fn(tab),
    flush: () => { const fn = deferred; deferred = null; fn?.(); },
    scheduled: () => deferred !== null,
  };
}
```

Then append this new test to the end of the same file — it pins down the one
shape the old guard could not express, a tab whose view was replaced by `null`:

```js
test('a tab with no view at all never schedules a reload', () => {
  const h = load();
  h.call({ view: null });
  assert.equal(h.scheduled(), false, 'a viewless tab must not even schedule the deferred turn');
  h.call({});
  assert.equal(h.scheduled(), false);
  h.call(null);
  assert.equal(h.scheduled(), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern="fanout|liveContents is still liftable|no view at all"`

Expected: FAIL with `ReferenceError: liveContents is not defined` from inside the
sandbox — the lifted `reloadTabAfterSettingsFanout` does not use it yet, so the
new `load()` helper is fine but `liveContentsSource` is spliced in ahead of a
function that never calls it, and the new test's `h.call({ view: null })` still
schedules a turn. (Concretely: the assertion
`a viewless tab must not even schedule the deferred turn` fails first.)

- [ ] **Step 3: Write minimal implementation**

Apply each of these edits in `src/main/main.js`.

`resizeActiveView` (~1283):
```js
  if (tab?.view) tab.view.setBounds(layout.pageBounds);
```

`navigateTabToAddress` (~1103) — last line of the function:
```js
  // Rapid re-navigation (Enter twice, Paste and Go twice) aborts the in-flight
  // load — loadURL rejects with ERR_ABORTED; that's routine, not an error.
  liveContents(tab)?.loadURL(target)?.catch(() => {});
```

`toggleTabMuted` (~1609):
```js
  liveContents(tab)?.setAudioMuted(tab.muted);
```

`duplicateTab` (~1617-1619):
```js
  const insertAt = rt().tabOrder.indexOf(id) + 1;
  const wc = liveContents(source);
  if (!wc) return;
  const history = wc.navigationHistory;
```
(`history` deliberately shadows the module-level `history` require here — that is
pre-existing; only the right-hand side changes.)

`setActiveTab` (~2213-2214) — the first guard:
```js
  // A script-closed adopted tab prunes itself via its 'destroyed' handler,
  // but a deferred activation (the window-open setImmediate) can race the
  // event — never attach or focus a dead webContents.
  if (!liveContents(next)) return;
```

`setActiveTab` (~2242) — the deactivation branch:
```js
  if (prev?.view) {
```

`setActiveTab` (~2277-2281) — the deferred re-show:
```js
    setImmediate(() => {
      if (rt().activeTabId !== id || !tabs.has(id) || !next.view) return;
      next.view.setVisible(true);
      reclaimAddressBarFocus(id);
    });
```

`activateTabFromRail` (~2287-2306):
```js
function activateTabFromRail(id) {
  const tab = tabs.get(id);
  const wc = liveContents(tab);
  if (!wc) return false;
```
and further down, in the already-active branch:
```js
    tab.view.setVisible(true);
    resizeActiveView();
    wc.focus();
```

`closeTab` (~2320):
```js
  if (wasActive && hasLiveWindow() && tab.view) rt().window.contentView.removeChildView(tab.view);
```

`closeTab` (~2331):
```js
  const wc = tab.view?.webContents;
  if (wc && !wc.isDestroyed()) wc.close();
```

`openInternalPage` (~2440):
```js
    liveContents(tab)?.reload(); // pick up fresh data
```

`reloadTabAfterSettingsFanout` (~2649-2661) — replace the whole body, keeping the
doc comment above it untouched:
```js
function reloadTabAfterSettingsFanout(tab) {
  if (!tab?.view) return;
  setImmediate(() => {
    // Re-read the webContents inside the deferred turn: closing the tab in that
    // window runs closeTab's wc.close(), after which view.webContents is
    // undefined — dereferencing it here threw an uncaught TypeError that killed
    // the main process. liveContents is that two-step read.
    liveContents(tab)?.reload();
  });
}
```

`tabs:search` (~2759) — its last line:
```js
    return liveContents(tab)?.loadURL(target);
```

The six one-line handlers (~2761-2764 and ~2793-2794):
```js
  chromeHandle('tabs:back', (_e, id) => liveContents(tabs.get(id))?.navigationHistory.goBack());
  chromeHandle('tabs:forward', (_e, id) => liveContents(tabs.get(id))?.navigationHistory.goForward());
  chromeHandle('tabs:reload', (_e, id) => liveContents(tabs.get(id))?.reload());
  chromeHandle('tabs:stop', (_e, id) => liveContents(tabs.get(id))?.stop());
```
```js
  chromeHandle('tabs:find', (_e, id, query, options) => liveContents(tabs.get(id))?.findInPage(query, options));
  chromeHandle('tabs:find-stop', (_e, id) => liveContents(tabs.get(id))?.stopFindInPage('clearSelection'));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit`

Expected: PASS.

Then: `npm start` and check the interactions these handlers serve — back/forward
buttons, reload, ⌘F find and Escape, the rail's click-to-switch, the panel's mute
toggle on a background tab, ⌘D duplicate, and closing the active tab.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js test/unit/settings-fanout-reload.test.js
git commit -m "Guard the view, not just the tab, at every arbitrary-id call site

tabs.get(id)?.view.webContents optional-chains at the TAB, so a tab whose view is
gone still threw. The eleven arbitrary-id paths (rail activation, address
navigation, search, back/forward, reload/stop, find/find-stop, mute, duplicate)
plus setActiveTab, closeTab, resizeActiveView, openInternalPage and the deferred
settings reload now all read through liveContents.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 107: `serializeTabs` becomes an explicit allowlist

**Files:**
- Modify: `src/main/main.js:1121-1160` (`serializeTabs`)
- Create: `test/unit/tab-sleep-snapshot-isolation.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: a `serializeTabs` whose broadcast payload keys are exactly
  `id, title, url, isLoading, canGoBack, canGoForward, favicon, bookmarked,
  blockedCount, private, pinned, muted, audible, groupId, pageBg, themeColor`
  plus the three derived keys `excepted, shield, connection`.

Today `serializeTabs` strips one key (`view`) and spreads the rest into a
broadcast that fires ~10 times a second to two renderers. That means **any field
added to the tab record ships to both renderers for free** — which is exactly
wrong for main-process-only state. Turning it into a projection makes the
boundary structural rather than a naming convention.

`runtimeId`, `historyEligible` and `navEpoch` are currently shipped and read by
nobody (`grep -rn "runtimeId\|historyEligible\|navEpoch" src/renderer/` → no
matches); dropping them is the point.

- [ ] **Step 1: Write the failing test**

Create `test/unit/tab-sleep-snapshot-isolation.test.js`:

```js
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const fnSource = mainSource.match(/function serializeTabs\(\) \{[\s\S]*?\n\}/)?.[0];

test('serializeTabs is still liftable from main.js', () => {
  assert.ok(fnSource, 'serializeTabs not found — update this test with it');
});

/** Run the real serializeTabs over a controlled tab list. */
function serialize(tabList) {
  const sandbox = {
    settings: { getSettings: () => ({ adblockEnabled: true }) },
    rt: () => ({ tabOrder: tabList.map((t) => t.id) }),
    tabs: new Map(tabList.map((t) => [t.id, t])),
    isHostnameExcepted: () => false,
    shieldChipState: () => ({ kind: 'stub' }),
    connectionFor: () => 'secure',
    committedUrlOf: () => 'https://committed.example/',
  };
  vm.runInNewContext(`${fnSource}\nthis.__fn = serializeTabs;`, sandbox);
  return sandbox.__fn();
}

const EXPECTED_KEYS = [
  'id', 'title', 'url', 'isLoading', 'canGoBack', 'canGoForward', 'favicon',
  'bookmarked', 'blockedCount', 'private', 'pinned', 'muted', 'audible',
  'groupId', 'pageBg', 'themeColor',
  // derived, added by serializeTabs itself
  'excepted', 'shield', 'connection',
].sort();

const record = (over = {}) => ({
  id: 't1',
  runtimeId: 9,
  view: { marker: 'a WebContentsView' },
  title: 'A page',
  url: 'https://example.com/',
  isLoading: false,
  canGoBack: true,
  canGoForward: false,
  favicon: 'https://example.com/favicon.ico',
  bookmarked: false,
  blockedCount: 3,
  private: false,
  pinned: false,
  muted: false,
  audible: false,
  groupId: null,
  pageBg: '#ffffff',
  themeColor: null,
  historyEligible: true,
  navEpoch: 7,
  ...over,
});

test('the broadcast payload is exactly the allowlist', () => {
  // This assertion is meant to FAIL whenever a key is added to the payload. That
  // is the point: every key here crosses into two renderers ~10x/second, so
  // adding one must be a deliberate edit here, not a side effect of adding a
  // field to the tab record.
  const [row] = serialize([record()]);
  assert.deepEqual(Object.keys(row).sort(), EXPECTED_KEYS);
});

test('main-process-only state on the record never reaches the payload', () => {
  const [row] = serialize([record({
    view: { webContents: { secret: true } },
    lastActiveAt: 1723200000000,
    sleepSnapshot: { entries: [{ url: 'https://example.com/', pageState: 'BASE64…' }], index: 0 },
    pageState: 'BASE64…',
    runtimeId: 42,
    historyEligible: false,
    navEpoch: 99,
  })]);
  for (const forbidden of [
    'view', 'lastActiveAt', 'sleepSnapshot', 'pageState',
    'runtimeId', 'historyEligible', 'navEpoch',
  ]) {
    assert.ok(!(forbidden in row), `${forbidden} must not be broadcast`);
  }
  assert.ok(!JSON.stringify(row).includes('BASE64'), 'no page state may appear anywhere in the payload');
});

test('a private tab still has its remote favicon nulled', () => {
  // A page-favicon URL belongs to the tab's browsing session; sending a private
  // tab's remote URL into persistent chrome would make the chrome session fetch
  // it again, escaping the non-persistent private-session boundary.
  const [row] = serialize([record({ private: true, favicon: 'https://tracker.example/f.ico' })]);
  assert.equal(row.favicon, null);
  assert.equal(row.private, true);
});

test('tab order drives the payload order, and unknown ids are skipped', () => {
  const rows = serialize([record({ id: 'a' }), record({ id: 'b' })]);
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --test-name-pattern="allowlist|main-process-only"`

Expected: FAIL — `the broadcast payload is exactly the allowlist` reports extra
keys `historyEligible`, `navEpoch`, `runtimeId`, and
`main-process-only state on the record never reaches the payload` fails on
`lastActiveAt must not be broadcast`.

- [ ] **Step 3: Write minimal implementation**

Replace the `.map(({ view, ...rest }) => {` line in `serializeTabs` and its
opening with an explicit projection. The full function becomes:

```js
function serializeTabs() {
  const { adblockEnabled } = settings.getSettings();
  return rt().tabOrder
    .map((id) => tabs.get(id))
    .filter(Boolean)
    .map((tab) => {
      // EXPLICIT ALLOWLIST, deliberately not `{ view, ...rest }`. This payload
      // crosses into both chrome renderers roughly ten times a second, so a
      // spread means every field ever added to the tab record ships for free —
      // including main-process-only state that must never leave this process.
      // Adding a key here is a deliberate act; see the shape test in
      // test/unit/tab-sleep-snapshot-isolation.test.js.
      const rest = {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        isLoading: tab.isLoading,
        canGoBack: tab.canGoBack,
        canGoForward: tab.canGoForward,
        favicon: tab.favicon,
        bookmarked: tab.bookmarked,
        blockedCount: tab.blockedCount,
        private: tab.private,
        pinned: tab.pinned,
        muted: tab.muted,
        audible: tab.audible,
        groupId: tab.groupId,
        pageBg: tab.pageBg,
        themeColor: tab.themeColor,
      };
      // Whether ads are allow-listed here. Derived rather than stored: the
      // exception list is edited from Settings and the slash commands alike,
      // and without this the chrome shows NOTHING on an excepted site (the
      // shield hides at a 0 count), so "/allow-ads" left no visible trace and
      // "/block-ads" appeared to do nothing when it lifted the exception.
      const excepted = isHostnameExcepted(rest.url);
      // Chip state is fully derived here (shield-model.js) so the strip and
      // overlay only ever render what the broadcast says.
      const shield = shieldChipState({
        url: rest.url,
        blockedCount: rest.blockedCount,
        excepted,
        adblockEnabled,
      });
      // Derived exactly once, here. The popover, the pill badge, and the panel
      // badge all render this same value, so they cannot disagree.
      const connection = connectionFor({
        url: committedUrlOf(tab.view),
        isLoading: rest.isLoading,
      });
      if (rest.private && rest.favicon) {
        // A page-favicon URL belongs to the tab's browsing session. Sending a
        // private tab's remote URL into persistent chrome would make the chrome
        // session fetch it again merely to paint the pill/overlay/rail, escaping
        // the non-persistent private-session boundary. Private rows deliberately
        // use the renderer's neutral fallback instead.
        return { ...rest, favicon: null, excepted, shield, connection };
      }
      return { ...rest, excepted, shield, connection };
    });
}
```

`committedUrlOf` (in `shield-model.js`) already returns `null` for a null,
`{}`-shaped, destroyed, or throwing view — that is verified by
`test/unit/shield-model.test.js:139-146`, so no change is needed there and the
`null` default must not be "fixed".

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit`

Expected: PASS.

Then: `npm start` and confirm the pill and the ⌘L panel still show titles,
favicons, the shield count, the private chip, group dots, pin/mute state, and the
strip tint — those are exactly the sixteen allowlisted fields.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js test/unit/tab-sleep-snapshot-isolation.test.js
git commit -m "Make serializeTabs an explicit allowlist

It stripped one key and spread the rest, so every field on the tab record shipped
to both renderers ~10x/second by default. It now projects sixteen named fields
plus the three derived ones; runtimeId, historyEligible and navEpoch were being
broadcast and are read by no renderer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 108: Make `test-hook.js` tolerate a tab with no view

**Files:**
- Modify: `src/main/test-hook.js` — `pushRemoteDevices` (~125), `state()`
  (~145-152), `setTabPresentation` (~198), `favoriteAllTabs` (~223),
  `probeFocusAfterTabBroadcast` (~560-580), `beginTabFocusObservation` (~587-592)
- Test: run the existing acceptance dry-run and desktop suites (see Steps 1 and 4)

**Interfaces:**
- Consumes: nothing.
- Produces: `state()`'s per-tab object gains `asleep` (always `false` this phase)
  and its three view-derived fields — `webContentsId`, `bounds`, `sessionKind` —
  become nullable.

This must land **before** any sleep code exists. `state()` dereferences
`t.view.webContents.id`, `t.view.getBounds()`, and `t.view.webContents.session`
unguarded for **every** tab, while its neighbours a few lines above are already
`try`/`catch`ed. One tab with `view === null` throws inside
`electronApp.evaluate()` and fails **every** scenario in the acceptance suite,
including ones that have nothing to do with this feature.

- [ ] **Step 1: Establish the baseline**

Run: `npm run test:acceptance:dry && npm run test:acceptance:desktop`

Expected: PASS (the desktop run needs the Electron binary; on headless Linux
prefix it with `xvfb-run -a`). Record the scenario/step totals — they must be
identical at Step 4. Note that this suite has three known intermittent failures;
if one appears, re-run before treating it as caused by this task.

- [ ] **Step 2: Confirm the unguarded sites**

Run: `grep -n "t\.view\.\|tab\.view\." src/main/test-hook.js`

Expected: lines around 125, 148, 149, 150, 198, 223, 566, 573, 578 and 589 appear
without an enclosing `?.` or `try`. Those are the ten this task fixes. The lines
at 91, 96, 97 and 98 are already `try`/`catch`ed — leave them.

- [ ] **Step 3: Write minimal implementation**

(a) `pushRemoteDevices` (~123-127) becomes:

```js
  function pushRemoteDevices(devices) {
    getOverlayWebContents()?.send('chrome:remote-tabs-updated', devices);
    for (const tab of tabs.values()) {
      if (urlOf(tab).startsWith('blanc://newtab')) {
        tab.view?.webContents?.send('pages:start:remote-tabs', devices);
      }
    }
  }
```

(b) Add a title reader beside the existing `urlOf`/`committedUrlOf` helpers
(after line 98):

```js
  const titleOf = (t) => { try { return t.view.webContents.getTitle(); } catch { return ''; } };
```

(c) In `state()`, replace the three view-derived lines (currently 148-150) with
four:

```js
          // A tab can exist without a live view. Every field derived from one is
          // nullable, and NOTHING here may dereference t.view unguarded — this
          // whole object is built inside electronApp.evaluate(), so one throw
          // fails every scenario in the suite, not just the relevant one.
          asleep: !!t.asleep,
          webContentsId: t.view?.webContents?.id ?? null,
          bounds: t.view ? t.view.getBounds() : null,
          sessionKind: t.view
            ? (t.view.webContents.session === getPrivateBrowsingSession() ? 'private' : 'default')
            : null,
```

(d) In `setTabPresentation` (~196-199):

```js
      if (typeof patch.muted === 'boolean') {
        tab.muted = patch.muted;
        tab.view?.webContents?.setAudioMuted(patch.muted);
      }
```

(e) In `favoriteAllTabs` (~221-224):

```js
        if (/^https?:/.test(url) && !bookmarks.isBookmarked(url)) {
          bookmarks.toggleBookmark(url, titleOf(t) || url);
        }
```

(f) In `probeFocusAfterTabBroadcast`, after the `if (!tab) return …` guard:

```js
      const wc = tab.view?.webContents;
      if (!wc) return { tabBlurCount: 0, chromeFocusCount: 0 };
```

and replace the three later uses — `tab.view.webContents.focus()`,
`tab.view.webContents.on('blur', onTabBlur)` and
`tab.view.webContents.removeListener('blur', onTabBlur)` — with `wc.focus()`,
`wc.on('blur', onTabBlur)` and `wc.removeListener('blur', onTabBlur)`.

(g) In `beginTabFocusObservation`, replace the `observation` construction:

```js
      const wc = tab.view?.webContents;
      if (!wc) return false;
      const observation = { wc, count: 0, listener: null };
```

- [ ] **Step 4: Run the suites again**

Run: `npm run test:unit && npm run test:acceptance:dry && npm run test:acceptance:desktop`

Expected: PASS, with the same totals as Step 1. `state()` now reports an extra
`asleep: false` on every tab; no step definition asserts on the exact key set, so
this is additive.

- [ ] **Step 5: Commit**

```bash
git add src/main/test-hook.js
git commit -m "Make the acceptance test hook tolerate a tab with no view

state() dereferenced t.view.webContents.id, t.view.getBounds() and
t.view.webContents.session for every tab, inside electronApp.evaluate() — one
viewless tab would throw there and fail every scenario in the suite, not only the
relevant one. Those three fields are now nullable and state() reports asleep;
the remote-devices push, presentation patch, favorite-all and the two focus
probes are guarded the same way.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 109: Prove the whole phase is a no-op

**Files:**
- Modify: none (unless something below fails)
- Test: the whole suite plus a manual smoke

**Interfaces:**
- Consumes: everything Tasks 101-108 produced.
- Produces: nothing.

This phase claims to change no behaviour whatsoever. That claim is worth one
explicit verification pass, because most of what moved has no unit coverage at
all — the listener wiring in particular is only exercised by running the app.

- [ ] **Step 1: Run every automated gate**

Run: `npm run test:unit && npm run substrate:check && npm run test:acceptance:dry`

Expected: PASS on all three. `substrate:check` runs the tokens, settings, copy
and ad-block freshness guards — none of them should have anything to say about
this phase, because no design token, settings enum, slash-command hint or filter
list was touched. If it complains, something in this phase edited a file it
guards, and that edit is out of scope.

- [ ] **Step 2: Run the desktop acceptance suite**

Run: `npm run test:acceptance:desktop`

Expected: PASS (prefix `xvfb-run -a` on headless Linux). Three intermittent
failures are known in this suite; re-run once before investigating.

- [ ] **Step 3: Smoke the app by hand**

Run: `npm start`

Expected, in order — this walks the surfaces the extracted wiring owns:

1. Type `example.com` into the address bar and press Enter. The page loads; the
   pill shows the domain and, shortly after, a favicon and the page title.
2. Press ⌘T, ⌘T. Three tabs; the pill shows three dots; ⌘1/⌘2/⌘3 switch between
   them and the strip tint changes with the page.
3. On a page with an ad, the shield chip shows a non-zero count. (This exercises
   the new `tabIdByWebContentsId` index — a count stuck at zero means the index
   is not being populated in `createTab`.)
4. ⌘L opens the panel; typing filters; Escape closes it. ⌘F opens find; typing
   highlights; Escape closes it.
5. Middle-click or ⌘-click a link — it opens as a **background tab**, not a bare
   window. Click a `target="_blank"` link — a foreground tab.
6. Right-click a link → "Open Link in New Tab" works. Right-click a page →
   "Back"/"Reload" work.
7. ⌘⇧N opens a private tab: the pill goes dashed, dots go hollow. Navigate in it,
   then check `blanc://history/` — the private visit is **not** recorded.
8. Favourite a page (♥ / ⌘D), confirm it appears in `blanc://bookmarks/`.
9. Close a tab with ⌘W; the remaining tabs still respond. Quit and relaunch —
   the session comes back.
10. Nothing in the terminal reads `initTabView: missing dependency`,
    `wireTabView called before initTabView`, or an uncaught `TypeError`.

- [ ] **Step 4: Confirm no sleep behaviour leaked in**

Run: `grep -rn "sleepTab\|wakeTab\|sleepSnapshots\|tab.asleep = \|tabSleep" src/ || echo "clean"`

Expected: the only matches are `asleep: !!t.asleep` in `src/main/test-hook.js` and
the three no-op hook stubs in `src/main/main.js` (`onMainFrameCommit`,
`noteWakeSuppressed`, `notePopupChild` — none of which contains any of those
strings). If `sleepTab`, `wakeTab`, `sleepSnapshots` or `tabSleep` appear
anywhere, phase 2 work has leaked into phase 1 and must be reverted out of it.

- [ ] **Step 5: Commit**

Nothing to commit unless a gate above failed and was fixed. If it did:

```bash
git add -A
git commit -m "Fix fallout found verifying the tab-view extraction

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Otherwise tag the phase boundary so phase 2 has a known-good starting point:

```bash
git log --oneline -9
```
