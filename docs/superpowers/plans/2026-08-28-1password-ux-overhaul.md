# 1Password Login Fill UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fill flow's stock dialogs with a Blanc-styled capsule surface, anchor the picker at the live login field, add a Settings status card with a real Verify, and add the ambient pill hint — per the approved spec `docs/superpowers/specs/2026-08-28-1password-ux-overhaul-design.md`.

**Architecture:** All credential-bearing UI stays native (menu picker, per the reviewed boundary). Credential-free messages move to a new fourth `blanc-chrome://` document (`fill-status`) driven by a fixed-kind, request-ID transport with a narrow dedicated preload. A monotonic per-window surface generation invalidates the whole fill flow across ⌘L/sheet/Glance/permission transitions. Ambient discovery is a structure-only isolated-world probe projected as `tab.fillHint`.

**Tech Stack:** Electron main-process JS (no TS), `node --test` unit tests, Cucumber/Playwright desktop acceptance, plain-JS chrome renderers.

## Global Constraints

- macOS-only: every new surface/API is gated by `isOnePasswordAvailable()` (`src/main/onepassword-availability.js`); Windows/Linux must expose nothing new.
- Frozen names untouched: `onePasswordEnabled`, `onePasswordAccount`, broker methods `find-logins`/`reveal-credential`/`probe-package`, `/1password`. `verify-account` is an *addition*.
- No credential, username, item title, vault name, page-derived string, or free-form string ever crosses to any renderer. Capsule IPC carries only `{kind, mode, requestId}` / `{requestId, verb}`.
- No new synced settings, no settings-schema change, no tokens.json change, no slash-command copy change (`npm run substrate:check` must stay green with no substrate edits).
- Chrome documents load once — after editing `index.html`, `styles.css`, `fill-status.html`, or any chrome renderer JS, relaunch `npm start` (Cmd+R only reloads the tab). Leave the dev instance open at end of turn.
- All unit tests run with `npm run test:unit` (node --test over `test/unit/`). No linter exists.
- Commit after every task; never `git add -A` (concurrent sessions share this checkout — stage explicit paths, and confirm `git branch --show-current` is `feature/1password-ux-overhaul` before each commit).
- Released versions are immutable; nothing in this plan tags or publishes. The final release is a separate owner-gated step.

## File Structure

New:
- `src/renderer/fill-status-copy.js` — single source of all capsule copy, dual-environment (browser global + `module.exports`), like `pages/type-to-open.js` precedent.
- `src/main/fill-status-kinds.js` — pure kind registry: mode (decision/notice), allowed verbs, notice level, controller-reason→kind mapping. Requires the copy file for the native fallback.
- `src/renderer/fill-status.html` + `src/renderer/fill-status.js` — the capsule document (fourth `blanc-chrome://` host).
- `src/main/fill-status-preload.js` — narrow bridge: `onShow`/`onHide` + `reply` only.
- `src/main/fill-status-surface.js` — injectable main-side surface controller: requestId, readiness deadline, replay queue, first-visible-presentation boundary, reply validation, crash-cancel, dialog fallback, reason-aware focus.
- `src/main/fill-hint.js` — pure ambient-hint scheduler + `buildHintProbeScript()`.
- Tests: `test/unit/fill-status-kinds.test.js`, `test/unit/fill-status-surface.test.js`, `test/unit/fill-hint.test.js`.

Modified:
- `src/main/chrome-protocol.js` — `fill-status` host entry + `CHROME_FILL_STATUS_URL`.
- `src/main/window-runtime-registry.js` — `surfaceGeneration: 0`.
- `src/main/main.js` — generation bumps, capsule wiring, hint wiring, Verify hooks, projection.
- `src/main/onepassword-policy.js` — `buildFieldRectScript`, `pickerAnchorPoint`.
- `src/main/credential-fill-controller.js` — `notify`/`confirm`/`surfaceChanged`/`toWindowPoint` seams; kind emission; live-geometry picker anchor.
- `src/main/onepassword-broker.js` + `src/main/onepassword-client.js` — `verify-account`.
- `src/main/pages.js` — `pages:settings:onepassword-status` / `pages:settings:onepassword-verify`.
- `src/main/tab-view.js` — hint probe triggers.
- `src/renderer/index.html`, `src/renderer/renderer.js`, `src/renderer/styles.css` — pill hint chip + capsule styles.
- `src/renderer/pages/settings.html`, `src/renderer/pages/settings.js` — status card.
- `test/unit/credential-fill-controller.test.js`, `test/unit/onepassword-broker.test.js`, `test/unit/onepassword-policy.test.js` (or the existing policy test file — check `ls test/unit | grep onepassword`).
- `docs/1password-integration.md`, `CLAUDE.md` (IPC namespace line), `spec/acceptance/` + `test/desktop/` scenarios.

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch from the approved history**

The approved spec (`1873f15`) and the revised plan (`84a9709`) live on **local `main`** and may not be on `origin/main` yet — branching from `origin/main` would silently drop them. Other sessions also commit to this shared checkout, so the approved commits may be ancestors rather than the tip — check ancestry, not the recent log:

```bash
cd "/Users/anthonyjloria/Projects/Blanc Browser" && git merge-base --is-ancestor 1873f15 main && git merge-base --is-ancestor 84a9709 main && echo ancestry-ok
```

Expected: `ancestry-ok`. If either check fails (non-zero exit, no output), STOP and find where the approved commits went before branching.

```bash
git checkout -b feature/1password-ux-overhaul main
```

(Pushing `main` itself is the owner's call, made outside this plan.) All subsequent tasks commit on this branch.

---

### Task 1: Kind registry and copy source

**Files:**
- Create: `src/renderer/fill-status-copy.js`
- Create: `src/main/fill-status-kinds.js`
- Test: `test/unit/fill-status-kinds.test.js`

**Interfaces:**
- Produces: `FILL_KINDS` (frozen object: `kind → { mode: 'decision'|'notice', level?: 'error'|'success', verbs: string[] }`), `kindForErrorCode(code) → kind`, `FILL_COPY` (kind → `{ title, body, primaryLabel?, cancelLabel? }`), `MODES = { DECISION: 'decision', NOTICE: 'notice' }`. Consumed by Tasks 2, 3, 5, 6.

- [ ] **Step 1: Write the failing test**

`test/unit/fill-status-kinds.test.js`:

```js
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { FILL_KINDS, MODES, kindForErrorCode } = require('../../src/main/fill-status-kinds');
const copy = require('../../src/renderer/fill-status-copy');

test('every kind has complete copy and a valid mode', () => {
  const kinds = Object.keys(FILL_KINDS);
  assert.ok(kinds.length >= 15, 'kind table missing or truncated'); // fail-loud guard
  for (const kind of kinds) {
    const def = FILL_KINDS[kind];
    assert.ok([MODES.DECISION, MODES.NOTICE].includes(def.mode), `${kind} mode`);
    const entry = copy.FILL_COPY[kind];
    assert.ok(entry?.title, `${kind} needs title copy`);
    // Success notices are deliberately title-only ("Filled from 1Password");
    // everything else carries an actionable body line.
    if (!(def.mode === MODES.NOTICE && def.level === 'success')) {
      assert.ok(entry?.body, `${kind} needs body copy`);
    }
    if (def.mode === MODES.DECISION) {
      assert.equal(def.verbs.length, 2, `${kind} decision needs two verbs`);
      assert.ok(def.verbs.includes('cancel'), `${kind} needs cancel verb`);
      assert.ok(entry.primaryLabel && entry.cancelLabel, `${kind} needs button labels`);
    } else {
      assert.deepEqual(def.verbs, ['dismiss'], `${kind} notice verbs`);
      assert.ok(['error', 'success'].includes(def.level), `${kind} notice level`);
    }
  }
});

test('controller error codes all map to kinds; broker-unavailable unifies', () => {
  const { ERROR_COPY } = require('../../src/main/credential-fill-controller');
  for (const code of Object.keys(ERROR_COPY)) {
    assert.ok(FILL_KINDS[kindForErrorCode(code)], `unmapped error code ${code}`);
  }
  assert.equal(kindForErrorCode('broker-unavailable'), 'broker-stopped');
  assert.equal(kindForErrorCode('made-up-code'), 'sdk-error');
});

test('no copy string interpolates data (fixed strings only)', () => {
  for (const [kind, entry] of Object.entries(copy.FILL_COPY)) {
    for (const value of Object.values(entry)) {
      assert.equal(typeof value, 'string', `${kind} copy must be plain strings`);
      assert.ok(!value.includes('${'), `${kind} copy must not interpolate`);
    }
  }
});
```

(Note: `ERROR_COPY` still exists at this task — it is removed in Task 5, which also updates this test to use the reason list exported there.)

- [ ] **Step 2: Run to verify it fails** — `npm run test:unit -- --test-name-pattern="kind"` (or `node --test test/unit/fill-status-kinds.test.js`). Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/renderer/fill-status-copy.js`**

Dual-environment, Blanc plain voice, short title + one actionable line:

```js
'use strict';
// Single source of every fill-capsule string. Served to the capsule renderer
// over blanc-chrome:// AND required by main for the native dialog fallback —
// no other file may define fill-flow copy. Fixed strings only: nothing here
// may ever embed page-, vault-, or account-derived data.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancFillCopy = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const FILL_COPY = Object.freeze({
    'setup-enable': {
      title: 'Set up 1Password',
      body: 'Turn on “Fill logins from 1Password” in Settings. Blanc only reads a matching login when you ask.',
      primaryLabel: 'Open Settings', cancelLabel: 'Cancel',
    },
    'setup-account': {
      title: 'Add your 1Password account',
      body: 'Add the account name from the top of the 1Password sidebar, or its account ID, in Settings.',
      primaryLabel: 'Open Settings', cancelLabel: 'Cancel',
    },
    'confirm-heuristic': {
      title: 'Fill this login form?',
      body: 'This page didn’t clearly mark its password field. Blanc re-checks the exact fields before filling.',
      primaryLabel: 'Fill Login', cancelLabel: 'Cancel',
    },
    busy: { title: '1Password is already open', body: 'Finish or cancel the current request first.' },
    'unsupported-page': { title: 'Open a website first', body: '1Password fill works on HTTP and HTTPS pages.' },
    'page-changed': { title: 'The page changed', body: 'Nothing was filled. Return to the login form and try again.' },
    'no-form': { title: 'No login form found', body: 'Blanc couldn’t find a safe username or password field here.' },
    'no-match': { title: 'No matching login', body: '1Password has no Login item saved for this site.' },
    'empty-login': { title: 'Login has no fillable fields', body: 'The selected item has no username or password value.' },
    'nothing-filled': { title: 'Nothing was filled', body: 'The selected login had no value for the fields Blanc found.' },
    unexpected: { title: '1Password fill stopped', body: 'Nothing was filled. Try again from the login form.' },
    'desktop-unavailable': { title: '1Password isn’t available', body: 'Open the 1Password app and turn on Settings → Developer → Integrate with 1Password SDKs.' },
    'account-not-found': { title: 'Account not found', body: 'Check the account name or ID in Blanc Settings, then try again.' },
    'not-authorized': { title: '1Password didn’t authorize Blanc', body: 'Unlock 1Password and approve Blanc Browser, then try again.' },
    'session-expired': { title: 'Authorization expired', body: 'Try again to authorize a fresh session.' },
    'timed-out': { title: '1Password timed out', body: 'Nothing was filled. Try again when 1Password is ready.' },
    'broker-stopped': { title: '1Password helper stopped', body: 'Nothing was filled. Try again.' },
    'sdk-error': { title: '1Password couldn’t finish', body: 'Nothing was filled. Check 1Password and try again.' },
    'selection-changed': { title: 'Login changed', body: 'The item changed while the list was open. Nothing was filled.' },
    filled: { title: 'Filled from 1Password', body: '' },
  });
  return { FILL_COPY };
});
```

- [ ] **Step 4: Implement `src/main/fill-status-kinds.js`**

```js
'use strict';
const { FILL_COPY } = require('../renderer/fill-status-copy');

const MODES = Object.freeze({ DECISION: 'decision', NOTICE: 'notice' });
const notice = (level) => Object.freeze({ mode: MODES.NOTICE, level, verbs: Object.freeze(['dismiss']) });
const decision = (primaryVerb) => Object.freeze({ mode: MODES.DECISION, verbs: Object.freeze([primaryVerb, 'cancel']) });

const FILL_KINDS = Object.freeze({
  'setup-enable': decision('open-settings'),
  'setup-account': decision('open-settings'),
  'confirm-heuristic': decision('fill'),
  busy: notice('error'),
  'unsupported-page': notice('error'),
  'page-changed': notice('error'),
  'no-form': notice('error'),
  'no-match': notice('error'),
  'empty-login': notice('error'),
  'nothing-filled': notice('error'),
  unexpected: notice('error'),
  'desktop-unavailable': notice('error'),
  'account-not-found': notice('error'),
  'not-authorized': notice('error'),
  'session-expired': notice('error'),
  'timed-out': notice('error'),
  'broker-stopped': notice('error'),
  'sdk-error': notice('error'),
  'selection-changed': notice('error'),
  filled: notice('success'),
});

function kindForErrorCode(code) {
  if (code === 'broker-unavailable') return 'broker-stopped';
  return FILL_KINDS[code] ? code : 'sdk-error';
}

module.exports = { FILL_KINDS, MODES, kindForErrorCode, FILL_COPY };
```

- [ ] **Step 5: Run test to verify it passes** — `node --test test/unit/fill-status-kinds.test.js`. Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/fill-status-copy.js src/main/fill-status-kinds.js test/unit/fill-status-kinds.test.js
git commit -m "feat(1password): fill-capsule kind registry with single-source copy"
```

---

### Task 2: Capsule document, preload, and chrome-protocol entry

**Files:**
- Create: `src/renderer/fill-status.html`, `src/renderer/fill-status.js`, `src/main/fill-status-preload.js`
- Modify: `src/main/chrome-protocol.js` (HOST_ASSETS + `CHROME_FILL_STATUS_URL` export)
- Test: extend `test/unit/` chrome-protocol coverage (`grep -rl chromeResourcePath test/unit` to find the existing file; add cases there)

**Interfaces:**
- Consumes: `FILL_COPY` global `blancFillCopy` (Task 1, via `<script src="fill-status-copy.js">`).
- Produces: renderer document honoring `blancFillStatus.onShow(({kind, mode, requestId}) => …)`, `onHide(({requestId}) => …)`, `reply({requestId, verb})`; `CHROME_FILL_STATUS_URL` for Tasks 3/6. Preload exposes exactly `window.blancFillStatus = { onShow, onHide, reply }` — nothing else.

- [ ] **Step 1: Failing test** — in the existing chrome-protocol unit test file add:

```js
test('fill-status host serves its document, script, copy, and shared styles only', () => {
  assert.ok(chromeResourcePath('blanc-chrome://fill-status/').endsWith('fill-status.html'));
  assert.ok(chromeResourcePath('blanc-chrome://fill-status/fill-status.js').endsWith('fill-status.js'));
  assert.ok(chromeResourcePath('blanc-chrome://fill-status/fill-status-copy.js').endsWith('fill-status-copy.js'));
  assert.ok(chromeResourcePath('blanc-chrome://fill-status/styles.css'));
  assert.equal(chromeResourcePath('blanc-chrome://fill-status/renderer.js'), null);
  assert.equal(chromeResourcePath('blanc-chrome://fill-status/../preload.js'), null);
});
```

- [ ] **Step 2: Run — expect FAIL** (host unknown → nulls).

- [ ] **Step 3: chrome-protocol.js** — add to `HOST_ASSETS`:

```js
  ['fill-status', new Map([
    ['/', 'fill-status.html'],
    ['/fill-status.js', 'fill-status.js'],
    ['/fill-status-copy.js', 'fill-status-copy.js'],
  ])],
```

add `const CHROME_FILL_STATUS_URL = `${CHROME_SCHEME}://fill-status/`;` and export it.

- [ ] **Step 4: `src/main/fill-status-preload.js`** — narrow bridge, mirroring the shape (not the breadth) of `preload.js`:

```js
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Deliberately minimal: the capsule renderer gets show/hide and one reply
// call. No tab data, no window controls, no island API (spec: dedicated
// narrow preload; the rich browserAPI bridge must never attach here).
contextBridge.exposeInMainWorld('blancFillStatus', {
  onShow: (fn) => ipcRenderer.on('fill:show', (_e, payload) => fn(payload)),
  onHide: (fn) => ipcRenderer.on('fill:hide', (_e, payload) => fn(payload)),
  reply: (payload) => ipcRenderer.send('fill:reply', payload),
});
```

- [ ] **Step 5: `src/renderer/fill-status.html`** — same CSP shape as `permission.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; img-src 'self' data:;" />
  <title>Fill status</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body class="fill-status-surface">
  <div id="fillDecision" class="no-drag" role="dialog" aria-labelledby="fillDecisionTitle" hidden>
    <div class="fill-copy"><span id="fillDecisionTitle"></span><span id="fillDecisionBody"></span></div>
    <button id="fillPrimaryBtn" type="button"></button>
    <button id="fillCancelBtn" type="button"></button>
  </div>
  <div id="fillNotice" class="no-drag" hidden>
    <span id="fillNoticeTitle"></span><span id="fillNoticeBody"></span>
    <button id="fillNoticeDismiss" type="button" aria-label="Dismiss">✕</button>
  </div>
  <div id="fillLive" class="sr-only" aria-atomic="true"></div>
  <script src="fill-status-copy.js"></script>
  <script src="fill-status.js"></script>
</body>
</html>
```

- [ ] **Step 6: `src/renderer/fill-status.js`** — behavior contract (write in full; ~120 lines):

- Track `currentRequestId` (dedupe: an `onShow` with an already-rendered requestId is ignored — the replay guarantee).
- `onShow({kind, mode, requestId})`: look up `blancFillCopy.FILL_COPY[kind]`; unknown kind → render nothing and `reply({requestId, verb: 'dismiss'})` (defensive; main logs nothing to renderers).
  - Decision mode: fill title/body/labels, unhide `#fillDecision`, set `aria-label` from title, **focus `#fillCancelBtn`**; Tab/Shift-Tab cycle the two buttons (keydown handler wrapping focus); Enter/Space activate only `document.activeElement`; Escape → `reply({requestId, verb: 'cancel'})`.
  - Notice mode: fill `#fillNotice`, set the live region — write the title+body text into `#fillLive` and set its `role` attribute to `alert` (error) or `status` (success) *before* unhiding, so it announces once. Success: start a 4 s timer → `reply({requestId, verb: 'dismiss'})`; pause the timer on `mouseenter`/`focusin`, resume on `mouseleave`/`focusout`. Error: no timer; ✕ click or Escape → dismiss reply.
- `onHide({requestId})`: if it matches `currentRequestId`, hide both containers, clear timers.
- Every reply carries the payload's own `requestId`. No other data ever leaves this document.

- [ ] **Step 7: Add `.fill-status-surface` styles to `src/renderer/styles.css`** — bottom-center capsule matching the permission bar's visual family (reuse its tokens: same background/border/radius custom properties `grep -n "permission" src/renderer/styles.css` reveals; success notice may tint with the existing accent token). Keep every color a token reference — no hard-coded inline styles.

- [ ] **Step 8: Run chrome-protocol test — expect PASS.** Manual render check comes in Task 6 (the document can't attach until main wires it).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/fill-status.html src/renderer/fill-status.js src/main/fill-status-preload.js src/main/chrome-protocol.js src/renderer/styles.css test/unit/<chrome-protocol-test-file>
git commit -m "feat(1password): fill-status capsule document with narrow preload"
```

---

### Task 3: Fill-status surface controller (main side, injectable)

**Files:**
- Create: `src/main/fill-status-surface.js`
- Test: `test/unit/fill-status-surface.test.js`

**Interfaces:**
- Consumes: `FILL_KINDS`, `MODES`, `FILL_COPY`, `kindForErrorCode` (Task 1).
- Produces: `createFillStatusSurface(deps)` returning `{ notice(target, kind), decision(target, kind) → Promise<'primary'|'cancel'>, handleReply(senderCheck, payload), invalidatePending(runtimeId), viewGone(runtimeId), loadFailed(runtimeId), rendererReady(runtimeId, viewId), isShowing() }`. The surface keeps ONE **active-message record** for whichever mode is showing — `{ runtimeId, viewId, requestId, mode, presented }` — not just a pending-decision slot (notices resolve immediately at this layer but still need runtime-filtered dismissal and death handling). Every externally triggered event — `invalidatePending`, `viewGone`, `loadFailed`, `rendererReady` — carries a `runtimeId` (and for `rendererReady`, the sending view's `viewId`) and acts only when it matches the active record's, so a stale capsule view crashing — or a recreated view finishing a late load — in window B can never affect a decision showing in window A. **Readiness ownership:** main only signals (`rendererReady` from `did-finish-load`, `loadFailed` from `loadURL` rejection / `did-fail-load`); the surface owns the queue, the replay, the `presented` flag, and the deadline. Deps (all injectable for tests): `{ ensureView(target) → {webContents:{send,once,on,isDestroyed}, id, loaded:boolean}|null, attach(target), hide(), showFallbackDialog(target, kind) → Promise<'primary'|'cancel'>, restoreFocus(target), setTimeout, clearTimeout, readinessMs = 2000, successNoticeMs = 4000 }` — `id` is the view's WebContents id (becomes the record's `viewId`), `loaded` is main's has-finished-first-load flag for the warm-view fast path. Task 6 wires real deps.

Behavior to implement and test (each bullet = one test):

1. `decision()` assigns a monotonically increasing requestId, sends `fill:show {kind, mode:'decision', requestId}`, and resolves `'primary'`/`'cancel'` from a matching `handleReply`.
2. A reply with a stale requestId, an unknown requestId, or a verb outside the kind's verb set is ignored (promise stays pending).
3. A reply failing the injected `senderCheck` is ignored.
4. **Readiness before first visible presentation:** on show, the surface calls `ensureView(target)` + `attach(target)`. If the view's `loaded` flag is true, `fill:show` is sent immediately and the record is marked `presented`. Otherwise the show is **queued** (record kept, nothing sent, deadline started): if neither `rendererReady` nor a send happens within `readinessMs`, or `ensureView()` returned null, or `loadFailed(runtimeId)` fires for the active record's runtime (main routes `loadURL` rejection and `did-fail-load` here — Task 6), the pending decision is answered by `showFallbackDialog(target, kind)` — the native dialog substitutes; the queued capsule show is abandoned (`fill:hide` sent if the view exists). A notice in the same situation falls back to the native notice dialog.
4a. **Queued-show replay:** `rendererReady(runtimeId, viewId)` matching the active record sends the queued `fill:show` with the **original requestId** (the renderer dedupes by requestId, so a race between the fast path and the replay is harmless), marks the record `presented`, and cancels the readiness deadline — a slow-but-successful load must never fall back.
4b. **Stale-view readiness is a no-op:** `rendererReady` with a mismatched `viewId` (a recreated view's late load) or mismatched `runtimeId` changes nothing — the deadline keeps running and may still fall back.
4c. **Boundary advancement:** after 4a's replay, the record counts as presented — a subsequent `viewGone(runtimeId)` resolves `'cancel'` (behavior 5), not the fallback dialog (test both orderings: viewGone before rendererReady → fallback; after → cancel).
5. **After first visible presentation** (record marked `presented`, via the fast path or 4a): view death (`viewGone(runtimeId)`) or `loadFailed(runtimeId)` resolves the pending decision as `'cancel'` — no re-prompt, no fallback dialog.
5a. **Cross-window death is a no-op:** `viewGone`/`loadFailed` with a runtimeId different from the active record's leaves the pending decision pending (test: window B's view dies while window A's decision shows).
5b. **Same-runtime notice dismissal:** `invalidatePending(runtimeId)` with a matching runtimeId hides an active notice (sends `fill:hide` for its requestId); a mismatched runtimeId leaves it showing.
6. `invalidatePending(runtimeId)` (called by main on surface transitions / permission arrival / tab switches) resolves a pending decision `'cancel'` and hides — but ONLY when `runtimeId` equals the pending target's `runtimeId`; a mismatched runtimeId is a no-op (cross-window isolation test: window B's id leaves window A's pending decision pending).
7. `notice()` for an error kind sends show and resolves immediately (non-blocking); a success kind behaves identically at this layer (the renderer owns the timer).
8. **Reason-aware focus:** `decision()` resolution via reply, Escape-cancel, or notice dismissal calls `restoreFocus(target)`; resolution via `invalidatePending(runtimeId)` (successor surface) does NOT.
9. Only one message shows at a time: a new `notice`/`decision` while one is showing sends `fill:hide` for the old requestId first (pending old decision resolves `'cancel'`).

- [ ] **Step 1: Write the failing tests** — one `test()` per numbered behavior, driving the factory with fake deps (pattern: the fakes record `sent` messages; `senderCheck` is a boolean-returning stub; timers via a manual `{ set, fire, clear }` fake clock as in `test/unit/tab-sleep.test.js` — check that file for the repo's fake-timer idiom and reuse it).
- [ ] **Step 2: Run — expect FAIL** (module missing).
- [ ] **Step 3: Implement `fill-status-surface.js`** to the contract above (~170 lines; single active-message record `{runtimeId, requestId, mode, presented}`, `requestId` counter, pending-decision resolver held alongside the record).
- [ ] **Step 4: Run — expect PASS (one test per numbered/lettered behavior above).**
- [ ] **Step 5: Commit** — `git add src/main/fill-status-surface.js test/unit/fill-status-surface.test.js && git commit -m "feat(1password): fill-status surface controller with readiness boundary"`

---

### Task 4: Surface generation

**Files:**
- Modify: `src/main/window-runtime-registry.js` (add `surfaceGeneration: 0` beside `permissionPrompts` in `createRuntime`)
- Modify: `src/main/main.js`
- Test: extend the existing window-runtime-registry unit test (find via `grep -rl createRuntime test/unit`)

**Interfaces:**
- Produces: `runtime.surfaceGeneration` (number); main-internal `bumpSurfaceGeneration()` helper. Consumed by Task 5's `surfaceChanged` seam and `prepareOnePasswordTarget`.

- [ ] **Step 1: Failing test** — registry test: `createRuntime()` yields `surfaceGeneration: 0`.
- [ ] **Step 2: Implement the field.** Run — PASS.
- [ ] **Step 3: main.js increments — bump only on real transitions** (a defensive no-op hide must not invalidate a flow):

Add near `prepareOnePasswordTarget` (main.js ~2312) — **the single mutator**; no call site may increment the field directly, because Task 6 hangs runtime-aware capsule invalidation off this helper:

```js
function bumpSurfaceGeneration(runtime = rt()) {
  runtime.surfaceGeneration += 1;
  // Task 6 adds: fillStatusSurface?.invalidatePending(runtime.id);
}
```

Then, verifying each anchor with grep before editing:
- `showOverlay` (main.js:1966): bump at the top of the successful show path (after any early-return guards).
- `hideOverlay` (main.js:2027): bump only if `rt().overlayMode` was truthy on entry.
- The utility-sheet show function (the one containing `sheet.view.setVisible(true)` + `addChildView` at main.js ~2257): bump on actual attach.
- `hideUtilitySheet` (main.js:2266): bump only if a sheet was actually attached/visible on entry.
- The Glance-open function (contains `rt().glanceTabId = id;` at main.js ~4073): bump after its early-return guards.
- `closeGlance` (main.js:4088): bump only when `rt().glanceTabId` was truthy (it early-returns otherwise — bump after that check).
- Permission-prompt arrival: at `owner.permissionPrompts.set(promptId, …)` (main.js:6674), call `bumpSurfaceGeneration(owner)` (owner is the runtime there, not `rt()` — this callback crosses a native boundary; never inline the increment, or Task 6's invalidation is silently skipped).
- **Tab switches:** in `setActiveTab`, on the real-change path only (after the same-tab no-op guard — grep for the guard the Reopen work added), call `bumpSurfaceGeneration(rt())`. Without this, a switch-away-then-back during a broker await restores `activeTabId`/`navEpoch`/URL and every predicate passes — the fill would proceed on a tab the user left and returned to; and a one-way switch would classify as `page-changed` (noisy) instead of the required silent surface cancellation.

- [ ] **Step 4: Stamp the generation after prepare cleanup.** Change `prepareOnePasswordTarget` (main.js:2312) to stamp the target — and change its parameter to the target so the stamp lands on the captured record:

```js
function prepareOnePasswordTarget(target) {
  return withWindowRuntime(target.runtime, () => {
    hideOverlay({ refocusContent: false });
    hideUtilitySheet({ refocusContent: false });
    // Capture AFTER the controller-owned cleanup above: a palette-started
    // fill closes the overlay as part of starting, which must not
    // self-invalidate (spec: Flow-level invalidation).
    target.surfaceGeneration = target.runtime.surfaceGeneration;
  });
}
```

- [ ] **Step 5: Extend the predicate + add the silent-abort classifier** (main.js:2302):

```js
function isOnePasswordTargetCurrent(target) {
  if (!target?.runtime || target.runtime.id !== target.runtimeId) return false;
  if (!target.window || target.window.isDestroyed()) return false;
  if (target.runtime.activeTabId !== target.tabId) return false;
  if (target.surfaceGeneration !== undefined
      && target.surfaceGeneration !== target.runtime.surfaceGeneration) return false;
  const tab = tabs.get(target.tabId);
  if (!tab || tab.navEpoch !== target.navEpoch) return false;
  const wc = liveContents(tab);
  return wc === target.webContents && !wc.isDestroyed() && wc.getURL() === target.url;
}

/** True when the ONLY reason the target is stale is a surface transition —
 * the user opened ⌘L/a sheet/Glance (or a permission prompt arrived). Such
 * aborts are silent: the user chose to leave (spec: Flow-level invalidation). */
function onePasswordSurfaceChanged(target) {
  if (!target?.runtime || target.surfaceGeneration === undefined) return false;
  return target.surfaceGeneration !== target.runtime.surfaceGeneration;
}
```

- [ ] **Step 6: Run full unit suite** — `npm run test:unit`. The controller test still passes (it injects its own predicates; the new `prepareTarget(target)` argument shape is exercised in Task 5).
- [ ] **Step 7: Commit** — `git add src/main/window-runtime-registry.js src/main/main.js test/unit/<registry-test> && git commit -m "feat(1password): per-window surface generation for whole-flow invalidation"`

---

### Task 5: Controller rework — seams, kinds, silent aborts, success notice

**Files:**
- Modify: `src/main/credential-fill-controller.js`
- Modify: `test/unit/credential-fill-controller.test.js`
- Modify: `test/unit/fill-status-kinds.test.js` (swap `ERROR_COPY` for the new export)

**Interfaces:**
- Consumes: `kindForErrorCode` (Task 1).
- Produces: `createCredentialFillController({ broker, Menu, getSettings, captureTarget, isTargetCurrent, surfaceChanged, prepareTarget, openSettings, notify, confirm, toWindowPoint })` where `notify(target, kind) → Promise<void>`, `confirm(target, kind) → Promise<'primary'|'cancel'>`, `prepareTarget(target)`, `toWindowPoint(target, cssRect) → {x,y}|null`. Exports `FILL_REASONS` (array of every kind the controller can emit) replacing `ERROR_COPY`. Task 6 supplies the real seams; Task 7 supplies `toWindowPoint` + the live-geometry call inside the picker branch.

Changes, in order through the existing `fill()` (keep flow order identical):

1. Delete `ERROR_COPY`, `message`, `setupPrompt`, `showFixedError`; the `dialog` dep is gone. Add `FILL_REASONS` export listing every emitted kind (`['busy','setup-enable','setup-account','unsupported-page','page-changed','no-form','confirm-heuristic','no-match','empty-login','nothing-filled','unexpected','filled', ...Object.keys-of-error-kinds]`).
2. Busy path → `notify(initial, 'busy')`.
3. Setup paths → `confirm(initial, 'setup-enable')` / `confirm(initial, 'setup-account')`; on `'primary'` call `openSettings()`; either way return the existing reasons.
4. `prepareTarget(initial)` (was `runtime` — the target now carries the post-cleanup generation stamp, Task 4).
5. Every `currentOrExplain` becomes:

```js
const currentOrExplain = async (target) => {
  if (isTargetCurrent(target)) return true;
  if (!surfaceChanged?.(target)) await notify(target, 'page-changed');
  return false; // surface-change aborts are silent — the user chose to leave
};
```

6. Heuristic confirmation → `confirm(initial, 'confirm-heuristic')`, proceed only on `'primary'`.
7. Broker/SDK errors → `notify(initial, kindForErrorCode(error?.code))`, return reason `error?.code ?? 'sdk-error'` unchanged.
8. `no-match`/`empty-login`/`nothing-filled`/`unsupported-page`/`no-form`/`unexpected` messages → `notify` with those kinds.
9. Success → `await notify(initial, 'filled')` before returning `{ ok: true, … }`.
10. The picker branch keeps `pickCredential({ Menu, window, rows, point })` — `point` comes from Task 7's live-geometry step; until then pass the existing `initial.pickerPoint` (leave a one-line `// anchor: live geometry lands with buildFieldRectScript` marker only if Task 7 is executed separately).

- [ ] **Step 1: Rewrite the test harness** — replace the `dialog` fake with:

```js
const notified = [];
const confirmed = [];
const notify = async (_t, kind) => { notified.push(kind); };
const confirm = async (_t, kind) => { confirmed.push(kind); return confirmResponses.shift() ?? 'cancel'; };
const surfaceChanged = (t) => t.surfaceGeneration !== undefined && t.surfaceGeneration !== currentGeneration;
```

with `currentGeneration` a mutable harness variable and `prepareTarget: (t) => { t.surfaceGeneration = currentGeneration; }`.

- [ ] **Step 2: Write the new behavior tests** (add to the existing file; all through the harness):
  - success emits `filled` exactly once, after fill;
  - each error code notifies its mapped kind (loop `FILL_REASONS`);
  - heuristic confirm gates on `'primary'` and defaults closed on `'cancel'`;
  - **open-and-close-⌘L mid-broker:** `broker.findLogins` bumps `currentGeneration` by 2 (open + close) before resolving → flow aborts after the broker await with `reason: 'page-changed'`… verify the reason is `'page-changed'` and `notified` does NOT contain `'page-changed'` (silent);
  - **permission arrival mid-broker:** same shape, single bump — silent abort;
  - **tab switch-away mid-broker:** harness bumps `currentGeneration` once and flips the harness's `activeTabId` → silent abort (no `page-changed` in `notified`);
  - **tab switch-away-then-back mid-broker:** harness bumps `currentGeneration` twice and restores `activeTabId` to the target's tab — every current-state predicate would pass, only the generation catches it → silent abort;
  - **palette-started fill doesn't self-invalidate:** harness bumps `currentGeneration` once *before* `fill()` runs (simulating the overlay closing in prepare); `prepareTarget` stamps after; flow completes `ok: true`;
  - genuine page change (URL mismatch, generation equal) still notifies `page-changed`.
- [ ] **Step 3: Run — expect FAIL.** Implement the controller changes. Run — expect PASS.
- [ ] **Step 4: Update `fill-status-kinds.test.js`** to iterate `FILL_REASONS` instead of `ERROR_COPY` keys. Run — PASS.
- [ ] **Step 5: Full suite** `npm run test:unit` — green. **Commit** all three files: `git commit -m "feat(1password): controller emits fixed kinds through notify/confirm seams with silent surface aborts"`

---

### Task 6: Wire the capsule into main.js

**Files:**
- Modify: `src/main/main.js`

**Interfaces:**
- Consumes: `createFillStatusSurface` (Task 3), `CHROME_FILL_STATUS_URL` (Task 2), `FILL_KINDS`/`FILL_COPY` (Task 1, fallback dialogs).
- Produces: real `notify`/`confirm` passed to `createCredentialFillController`; capsule view lifecycle.

All wiring mirrors the permission view functions (main.js:1745–1811) — read them first. Steps:

- [ ] **Step 1: View plumbing.** Add `fillStatusView`/`fillStatusViewAttached` to the runtime record (window-runtime-registry.js, beside `permissionView` fields — check the exact names there) and `ensureFillStatusView()`/`attachFillStatusView()`/`detachFillStatusView()`/`fillStatusViewBounds()` beside their permission twins: same `CHROME_PARTITION`, `preload: path.join(__dirname, 'fill-status-preload.js')`, `contextIsolation: true, nodeIntegration: false, sandbox: true`, transparent background, `lockPrivilegedNavigation(view.webContents, CHROME_FILL_STATUS_URL)`, bottom-center bounds (same formula as `permissionViewBounds`, height 64). Recompute bounds in the same window-resize path that calls `permissionViewBounds` (main.js:2850 region).

  **Readiness wiring is NOT covered by mirroring the permission view** (its precedent neither catches `loadURL` rejection nor handles `did-fail-load`). In `ensureFillStatusView()`, with `owner` the creating runtime, wire all three failure signals explicitly:

```js
view.webContents.loadURL(CHROME_FILL_STATUS_URL)
  .catch(bindWindowRuntime(owner, () => fillStatusSurface?.loadFailed(owner.id)));
view.webContents.on('did-fail-load', bindWindowRuntime(owner, (_e, _code, _desc, _url, isMainFrame) => {
  if (isMainFrame) fillStatusSurface?.loadFailed(owner.id);
}));
view.webContents.on('did-finish-load', bindWindowRuntime(owner, () => {
  owner.fillStatusViewLoaded = true; // the `loaded` fast-path flag ensureView reports
  fillStatusSurface?.rendererReady(owner.id, view.webContents.id);
}));
```

  (`on`, not `once`: a crashed-and-reloaded document must re-signal readiness. Reset `owner.fillStatusViewLoaded = false` wherever the view is created or its `render-process-gone` fires.)

  The never-finishes case is the surface's own `readinessMs` deadline (Task 3 behavior 4) — no extra wiring here, but both sides of the first-visible-presentation boundary must be exercised against this real wiring in Step 7's manual check (kill the view before/after presenting via the test hook or devtools).
- [ ] **Step 2: Stacking.** In `setActiveTab`'s re-stack region and the Glance-open function (both call `restackPermissionView()`) add a `restackFillStatusView()` **before** the permission restack — permission stays topmost (precedence).
- [ ] **Step 3: Instantiate the surface** beside `getOnePasswordFillController` (main.js:2319): `createFillStatusSurface` with real deps — `ensureView(target)` wraps Step 1 and returns `{ webContents, id: webContents.id, loaded: owner.fillStatusViewLoaded === true }`; `attach(target)` is `attachFillStatusView` on the target's runtime (readiness itself needs no further wiring here — Step 1's `rendererReady`/`loadFailed` signals and the surface's own deadline carry it); `showFallbackDialog(target, kind)` builds a `dialog.showMessageBox` from `FILL_COPY[kind]` (decision: two buttons, `defaultId`/`cancelId` on Cancel; notice: single OK) — this is the only main-side copy consumer; `restoreFocus: (target) => { if (isOnePasswordTargetCurrent(target)) target.webContents.focus(); }` (reason-aware: the surface only calls it on plain dismissals, and a stale target no-ops).
- [ ] **Step 4: Reply IPC.** `ipcMain.on('fill:reply', (event, payload) => surface.handleReply(senderIsFillStatusView(event), payload))` with `senderIsFillStatusView` checking `event.sender === rt-of-owner.fillStatusView?.webContents && event.senderFrame?.url === CHROME_FILL_STATUS_URL` — model on the trusted-sender list at main.js:4812.
- [ ] **Step 5: Invalidation hooks.** Uncomment/insert the line inside `bumpSurfaceGeneration` (Task 4): `fillStatusSurface?.invalidatePending(runtime.id)` — a bump while that runtime's decision is pending = successor surface; the runtimeId filter keeps window B's transitions from cancelling window A's flow. Because Task 4 routed **every** bump (overlay, sheet, Glance, permission arrival, tab switch) through the helper, all of them now both invalidate the flow and dismiss that window's visible capsule. Active-tab **navigation** is the one dismissal source with no generation bump: call `surface.invalidatePending(rt().id)` from the same active-tab site-changing-navigation hook that dismisses the shield popover (grep the shield dismissal in main.js and add beside it) — the flow side is already covered by `navEpoch`, which correctly classifies it as `page-changed` (noticed, not silent). `view.webContents.once('destroyed', …)` and `'render-process-gone'` → `surface.viewGone(owner.id)` — the owning runtime's id from the creation closure, never `rt().id` (these events cross unbound native boundaries, and the runtime filter is what keeps window B's dead view from cancelling window A's decision). Escape: extend the existing `before-input-event` chrome handler (grep `before-input-event` in main.js) so Escape with a visible capsule dismisses/cancels it before falling through to overlay logic.
- [ ] **Step 6: Pass the new seams** to `createCredentialFillController`: `notify: (t, k) => surface.notice(t, k)`, `confirm: (t, k) => surface.decision(t, k)`, `surfaceChanged: onePasswordSurfaceChanged`, drop `dialog`.
- [ ] **Step 7: Manual verification (relaunch dev — chrome docs load once).** `npm start`, then on a login page run `/1password` with the feature disabled → the setup decision capsule appears bottom-center, focus on Cancel, Escape dismisses, "Open Settings" opens the settings sheet. Force an error kind (empty account) → persistent error capsule with ✕. Verify permission-prompt precedence: trigger a mic prompt (e.g. meet.google.com) while a capsule shows — capsule hides. Screenshot the capsule for the record.
- [ ] **Step 8: Full unit suite green; commit** — `git commit -m "feat(1password): wire fill-status capsule surface into main"`

---

### Task 7: Live picker geometry

**Files:**
- Modify: `src/main/onepassword-policy.js` (add `buildFieldRectScript`, `pickerAnchorPoint`; export both)
- Modify: `src/main/credential-fill-controller.js` (pre-popup geometry step)
- Modify: `src/main/main.js` (`toWindowPoint` seam)
- Test: the existing onepassword-policy unit test file + `credential-fill-controller.test.js`

**Interfaces:**
- Produces: `buildFieldRectScript({ expectedURL, expectedTimeOrigin, nonce })` → isolated-world script string returning `{ ok: true, rect: {x, y, width, height} } | { ok: false }`; `pickerAnchorPoint({ rect, viewBounds, zoomFactor })` → `{x, y}`; controller seam `toWindowPoint(target, rect)`.

- [ ] **Step 1: Failing tests for `pickerAnchorPoint`** (pure):

```js
test('pickerAnchorPoint honors view origin and zoom, clamps to view', () => {
  const viewBounds = { x: 240, y: 64, width: 1000, height: 700 }; // vertical-tabs x offset
  // field bottom-left at CSS (100, 200..230), 1.25 zoom
  const p = pickerAnchorPoint({ rect: { x: 100, y: 200, width: 240, height: 30 }, viewBounds, zoomFactor: 1.25 });
  assert.deepEqual(p, { x: 240 + Math.round(100 * 1.25), y: 64 + Math.round(230 * 1.25) });
  // scrolled far below the fold clamps to the view's bottom edge
  const q = pickerAnchorPoint({ rect: { x: 100, y: 5000, width: 240, height: 30 }, viewBounds, zoomFactor: 1 });
  assert.equal(q.y, 64 + 700);
  assert.ok(q.x >= 240 && q.x <= 240 + 1000);
});
```

- [ ] **Step 2: Implement `pickerAnchorPoint`** (CSS→DIP: `view.x + round(cssX * zoom)`, anchor at the rect's bottom-left, clamp both axes into `[viewBounds.x, viewBounds.x + width]` / `[viewBounds.y, viewBounds.y + height]`). Run — PASS.
- [ ] **Step 3: Implement `buildFieldRectScript`.** Reuse the inspect stash: `buildInspectScript` (onepassword-policy.js:388) stores the selected elements under the nonce (read `sharedSelectionSource`/the stash consumption in `buildFillScript` at :417 to copy the exact validation idiom — same `expectedURL`/`expectedTimeOrigin`/nonce checks, single-use is NOT consumed here since the fill still needs the stash: read the elements *without* consuming). The script returns the password element's (else username element's) `getBoundingClientRect()` as plain numbers, `{ ok: false }` when the stash is missing, the nonce mismatches, the document changed, or the element is detached (`!el.isConnected`). Geometry only — never read `value`.
- [ ] **Step 4: Controller pre-popup step** — in the `candidates.length > 1` branch, immediately before `pickCredential`:

```js
let anchor = initial.pickerPoint ?? { x: 16, y: 64 };
let geo = null;
try {
  geo = await initial.webContents.executeJavaScriptInIsolatedWorld(
    FILL_WORLD_ID, [{ code: buildFieldRectScript({ expectedURL: initial.url, expectedTimeOrigin: probe.timeOrigin, nonce }) }]
  );
} catch { /* anchor falls back to the island pill — flow unaffected */ }
// The geometry read is a new await: a navigation or successor surface can
// land inside it. Re-check before converting or popping, preserving the
// silent-vs-page-changed classification (currentOrExplain consults
// surfaceChanged) — never pop a picker over content the user has left.
if (!await focusAndCheck(initial)) {
  await currentOrExplain(initial);
  return { ok: false, reason: 'page-changed' };
}
if (geo?.ok) anchor = toWindowPoint(initial, geo.rect) ?? anchor;
selectedIndex = await pickCredential({ Menu, window: initial.window, rows, point: anchor });
```

- [ ] **Step 5: main.js `toWindowPoint`** beside the other seams:

```js
function onePasswordToWindowPoint(target, rect) {
  const tab = tabs.get(target.tabId);
  const view = tab?.view;
  const wc = liveContents(tab);
  if (!view || !wc || wc !== target.webContents) return null;
  return pickerAnchorPoint({ rect, viewBounds: view.getBounds(), zoomFactor: wc.getZoomFactor() });
}
```

pass as `toWindowPoint` to the controller.

- [ ] **Step 6: Controller tests** — harness gains a third scripted `executeJavaScriptInIsolatedWorld` response for the geometry call: (a) `{ok:true, rect}` → `pickCredential` receives the converted point (assert via the recorded popup args); (b) `{ok:false}` → island `pickerPoint` used; (c) the geometry code string contains no `value` reads (`assert.ok(!code.includes('.value')`)); (d) **regression: invalidation during the geometry await** — the geometry fake bumps the harness generation (silent abort, no picker popped) in one case and mutates the URL predicate (page-changed notified, no picker popped) in another; assert `Menu.buildFromTemplate` was never called in either.
- [ ] **Step 7: Suite green; manual check** — dev relaunch, two matching Dev-vault items on the loopback fixture (`npm run test:onepassword:live-server`, per `docs/1password-integration.md`), invoke fill, scroll during the DesktopAuth pause → menu pops at the field's current position. **Commit.**

---

### Task 8: Broker `verify-account`

**Files:**
- Modify: `src/main/onepassword-broker.js` (dispatch at :177 area + implementation beside `findLogins`)
- Modify: `src/main/onepassword-client.js` (wrapper method beside its find-logins sender)
- Test: `test/unit/onepassword-broker.test.js`

**Interfaces:**
- Produces: broker method `verify-account` `{account}` → `{ ok: true }` or throws the same coded errors as `find-logins` (`desktop-unavailable`, `account-not-found`, `not-authorized`, …); client wrapper `verifyAccount(account)`. Consumed by Task 9.

- [ ] **Step 1: Failing test** — in the broker test file (read its existing harness first; it fakes the SDK). The protocol is `{id, method, payload}` → `{id, ok, value}` on success / `{id, ok: false, error}` on failure, and `handleMessage` drops any message whose `id` is not a positive safe integer (onepassword-broker.js:187–196) — mirror it exactly:

```js
const replies = [];
await handleMessage({ id: 1, method: 'verify-account', payload: { account: 'a' } }, (r) => replies.push(r));
assert.equal(replies.length, 1);
assert.deepEqual(replies[0], { id: 1, ok: true, value: { ok: true } });
assert.deepEqual(Object.keys(replies[0].value), ['ok']); // no vault metadata leaks
```

plus: exactly one vaults-list call on the fake SDK; an SDK auth failure replies `{ id, ok: false, error: <same fixed code find-logins produces> }`.
- [ ] **Step 2: Implement** — broker: `if (method === 'verify-account') return verifyAccount(payload ?? {});` where `verifyAccount` reuses the existing client-acquisition path (the same stale-client re-auth wrapper `findLogins` uses) and calls the cheapest authenticated list (`client.vaults.list()` per the SDK usage already in the file), discarding the result. Client wrapper: mirror `findLogins`'s message send/timeout shape.
- [ ] **Step 3: Run — PASS. Commit.**

---

### Task 9: Settings status card + persist-first Verify

**Files:**
- Modify: `src/renderer/pages/settings.html` (:205 region), `src/renderer/pages/settings.js` (:156–180 region)
- Modify: `src/main/pages.js` (:194–220 region), `src/main/main.js` (hooks passed to `setupPages`)
- Modify: `src/main/tab-preload.js` — the `bowserPages` bridge is an exact allowlist; the new channels are unreachable without bridge entries. Add, in the settings group only: `onePasswordStatus: () => invoke('pages:settings:onepassword-status')`, `onePasswordVerify: (account) => invoke('pages:settings:onepassword-verify', account)`, `openOnePasswordApp: () => invoke('pages:settings:open-onepassword-app')`.
- Create: `src/renderer/pages/settings-verify-model.js` — the Verify state machine as a pure reducer, dual-environment like `fill-status-copy.js` (served flat from the pages dir via a `<script>` tag, `require`-able by node tests), so the stale/pending/reset paths get real unit tests instead of source-lifting.
- Test: `test/unit/settings-verify-model.test.js`
- Test: the pages unit test file (`grep -rl "pages:settings:get" test/unit`) + whatever test covers the preload bridge shape (`grep -rl "bowserPages" test/unit` — extend it with the three new method names so a bridge regression fails a test, not a silent renderer).

**Interfaces:**
- Consumes: `verifyAccount` (Task 8).
- Produces: `pages:settings:onepassword-status` → `{ appDetected: boolean }`; `pages:settings:onepassword-verify` `{account}` → `{ ok: true, account }` | `{ ok: false, kind, account }` | `{ ok: false, stale: true }` — `account` echoes the **normalized stored value that was probed**; `stale: true` means the stored account changed during the broker await (another window edited it) and the renderer must silently discard the reply; `pages:settings:open-onepassword-app` → launches the app.

- [ ] **Step 1: Failing tests** (pages test harness, faking hooks):
  - `onepassword-verify` **persists first**: hook order recorded — `setSettings({ onePasswordAccount })` runs before the broker verify, and the probe receives the *returned normalized* account (harness normalizes by trimming; assert probe arg equals trimmed value);
  - **stored-account revalidation after the await:** the fake broker verify, while pending, mutates the harness's stored `onePasswordAccount` (simulating another window's edit); the reply must be `{ ok: false, stale: true }` — never `ok: true` — because the handler re-reads `getSettings().onePasswordAccount` after the broker resolves and requires it to still equal the probed value;
  - the reply carries only `{ok, kind?, account?, stale?}` keys;
  - all three handlers are absent when `onePasswordAvailable()` is false (mirror the existing gate test for `pages:settings:set` at pages.js:212);
  - an empty/whitespace account replies `{ ok: false, kind: 'account-not-found', account: '' }` without touching the broker.
- [ ] **Step 2: Implement pages.js handlers** — inside the existing `onePasswordAvailable()`-guarded region; `onepassword-verify` maps broker error codes through `kindForErrorCode`, and after the broker await re-reads the stored account, returning `{ ok: false, stale: true }` unless it still equals the probed value. Main supplies hooks: `onePasswordAppDetected: () => fs.existsSync('/Applications/1Password.app')` (a *hint* — never gates anything), `onePasswordVerify: (account) => onePasswordBroker.verifyAccount(account)`, `openOnePasswordApp: () => shell.openPath('/Applications/1Password.app')`.
- [ ] **Step 3: settings.html** — restructure the `#onePasswordSettings` subsection into the status card: row 1 app-presence line + `Open 1Password` button (shown when detected) / soft guidance text when not ("Blanc couldn't find the 1Password app in Applications — if it's installed elsewhere, Verify below still works."); row 2 keeps the toggle + account input and adds `<button id="onePasswordVerify">Verify</button>` + `<span id="onePasswordVerifyState" role="status">`. **Replace the section hint copy** (posture change, spec §5): "Fill a matching Login item from your installed 1Password app when you ask. While this is on, Blanc checks pages for a login form so the island can offer Fill — it never reads what you type and never contacts 1Password until you ask."
- [ ] **Step 4: The Verify state machine** — `settings-verify-model.js` exports a pure reducer; `settings.js` only maps its output onto the DOM. Shape:

```js
// state: { phase: 'idle'|'pending'|'connected'|'error', token, field, kind }
createVerifyModel() → {
  onInput(state, value),        // any edit: token++, phase 'idle' (drops Connected/pending)
  onVerifyClick(state),         // trimmed non-empty only: token++, phase 'pending'
  onReply(state, { token, ok, stale, account, kind }),
  view(state),                  // → { buttonDisabled, statusText, normalizeFieldTo|null }
}
```

`onReply` rules — the reply is dropped entirely unless `token === state.token` (superseded); with the latest token:
  - `ok: true` and trimmed `state.field === account` → phase `connected`, `normalizeFieldTo: account` (the raw field may carry whitespace the normalization stripped — normalizing the display is what makes the equality meaningful and shows the user the value that verified);
  - **`stale: true` → phase `idle`** — never `connected`, but ALSO never left `pending`: the cross-window account edit produced no local `input` event, so without this transition the button would stay disabled and the pending label would show forever. `view()` recomputes `buttonDisabled` from the current trimmed field;
  - `ok: false` with `kind` → phase `error` (kind's copy; the six-or-so error strings stay inline in `settings.js` — settings-local, not capsule copy).

`view()` always derives `buttonDisabled` = `phase === 'pending' || trimmed field empty` — so an `onInput` during pending (token bump → the in-flight reply will be dropped as superseded) immediately re-enables Verify for the new non-empty value.

  **Unit tests** (`test/unit/settings-verify-model.test.js`), one per path: superseded reply dropped; connected happy path with field normalization; **latest-token stale reply lands in idle with the button re-enabled** (the P1 regression); **input during pending re-enables for the new value and the old reply is dropped**; empty field keeps the button disabled in every phase; error path renders kind.

  `settings.js` wiring: instantiate the model, translate `input`/click/reply events, apply `view()` to `#onePasswordVerify.disabled`, `#onePasswordVerifyState.textContent`, and the field when `normalizeFieldTo` is set.
- [ ] **Step 5: Run pages tests — PASS. Manual check** (settings is an internal page — reloads fresh per navigation, no chrome relaunch needed): toggle on, type a wrong account, Verify → inline error; correct account, Verify → 1Password DesktopAuth prompt → "Connected"; edit the field → resets to unverified. **Commit.**

---

### Task 10: Ambient hint engine

**Files:**
- Create: `src/main/fill-hint.js`
- Test: `test/unit/fill-hint.test.js`

**Interfaces:**
- Produces: `buildHintProbeScript()` → isolated-world script string returning `boolean`; `createFillHintScheduler({ runProbe(tab) → Promise<boolean>, isEligible(tab) → boolean, tabEpoch(tab) → number, contentsToken(tab) → number|null, onHint(tab, hinted) → void, setTimeout, clearTimeout, recheckMs = 2500 })` returning `{ probeTab(tab), clearTab(tabId), clearAll(), notePageLoad(tab), noteInPageNavigation(tab), noteActivated(tab), noteConfigChanged(activeTab) }`. `contentsToken` is the WebContents-identity seam: the scheduler captures it when the probe (or recheck) is scheduled and re-reads it before applying any result — a mismatch (quiet/wake replaced the renderer; `null` = no live contents) discards the result. Task 11 supplies `contentsToken: (tab) => liveContents(tab)?.id ?? null`. Also produces `configTransition(prev, next) → 'became-eligible' | 'cleared' | null` — a pure classifier over two `{ onePasswordEnabled, onePasswordAccount }` pairs: `'became-eligible'` when enabled-with-nonempty-account becomes true from false, `'cleared'` when it becomes false OR the (trimmed) account value changes while enabled, `null` otherwise. Consumed by Task 11's wiring.

- [ ] **Step 1: Failing tests:**
  - probe script string contains `current-password`, rejects `new-password` (assert the string contains the contradiction check), uses `checkVisibility` with the opacity option and a viewport-intersection bound, and contains no `.value` read, no `innerText`, no `textContent` (structure-only assertion);
  - a positive probe calls `onHint(tab, true)`; a negative schedules exactly one recheck at `recheckMs`, and a positive recheck hints;
  - **stale-result discard:** epoch changes, `isEligible` turning false, or `contentsToken` differing from the captured token (including → `null`) between schedule and resolve → `onHint` never fires — one test per condition, and the token test simulates the quiet/wake path by returning a new token for the same tab object;
  - `clearTab` cancels a pending recheck timer and emits `onHint(tab, false)`;
  - `clearAll` clears every timer (disable/account-change path);
  - `noteConfigChanged` probes the active tab immediately when eligible;
  - `configTransition`: enable-with-account from off → `'became-eligible'`; disable → `'cleared'`; account edit (including whitespace-only differences that trim equal → `null`) while enabled → `'cleared'`; unrelated settings churn → `null`;
  - re-probing an already-probed epoch is a no-op (`noteActivated` after `notePageLoad` on the same epoch runs one probe total).
- [ ] **Step 2: Implement.** `buildHintProbeScript` (authoritative signal only — mirror `isAuthoritativeCurrent`'s token logic from onepassword-policy.js:160 but DOM-side):

```js
function buildHintProbeScript() {
  // Uncontradicted authoritative signal + genuinely visible, per the spec:
  // a token list carrying new-password alongside current-password is a
  // contradiction (signup/reset), and opacity-zero or fully off-screen
  // fields are not an affordance the user can see. Mirrors the visibility
  // idiom collectCandidates already uses (onepassword-policy.js:298) —
  // checkVisibility plus viewport intersection. Structure only; never
  // reads values or text.
  return `(() => {
    try {
      const els = document.querySelectorAll('input[type=password]');
      const vw = window.innerWidth || 0, vh = window.innerHeight || 0;
      for (const el of els) {
        const tokens = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\\s+/);
        if (!tokens.includes('current-password') || tokens.includes('new-password')) continue;
        const visible = typeof el.checkVisibility === 'function'
          ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          : true;
        if (!visible) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0
            && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw) return true;
      }
    } catch {}
    return false;
  })()`;
}
```

Scheduler: per-tab record `{ epoch, token, timer, probed }` in a Map keyed by tab id, `token` captured via `contentsToken(tab)` at schedule time; every async resolution revalidates `isEligible(tab) && tabEpoch(tab) === record.epoch && contentsToken(tab) === record.token && record.token !== null` before `onHint`. Errors from `runProbe` are swallowed (spec: ambient path never surfaces anything).

- [ ] **Step 3: Run — PASS. Commit.**

---

### Task 11: Hint wiring + pill glyph

**Files:**
- Modify: `src/main/main.js`, `src/main/tab-view.js`
- Modify: `src/renderer/index.html`, `src/renderer/renderer.js`, `src/renderer/styles.css`
- Test: extend the serializeTabs/projection unit test (`grep -rl serializeTabs test/unit`)

**Interfaces:**
- Consumes: Task 10's scheduler; existing `chrome:onepassword-fill` IPC (main.js:5238) and `browserAPI.fillLoginFromOnePassword` (already exposed — overlay.js:1382 proves the API shape).
- Produces: `tab.fillHint` (boolean, main-only) projected as `fillHint` in `tabs:updated`; `#pillFillHint` chip.

- [ ] **Step 1: Projection test first** — extend the serializeTabs test: a tab with `fillHint: true` projects `fillHint: true`; absent/false projects `false`. Run — FAIL.
- [ ] **Step 2: main.js scheduler instance** — created only when `ONE_PASSWORD_AVAILABLE`; `isEligible(tab)` reads the URL from the live contents itself (there is no free-standing `url` variable at this seam):

```js
const isEligible = (tab) => {
  const wc = liveContents(tab);
  if (!wc || wc.isDestroyed() || tab.asleep) return false;
  const { onePasswordEnabled, onePasswordAccount } = settings.getSettings();
  if (!onePasswordEnabled || !String(onePasswordAccount ?? '').trim()) return false;
  const url = wc.getURL();
  if (!parseWebUrl(url) || isUtilityUrl(url)) return false;
  const runtime = windowRuntimes.runtimeForTab(tab.id);
  return runtime?.activeTabId === tab.id; // private tabs are eligible; quiet tabs already excluded above
};
```

`contentsToken: (tab) => liveContents(tab)?.id ?? null`; `runProbe(tab)` = `liveContents(tab).executeJavaScriptInIsolatedWorld(FILL_WORLD_ID, [{ code: buildHintProbeScript() }])`; `onHint(tab, hinted)` sets `tab.fillHint = hinted` and `broadcastTabs()` (coalesced like the blocker counts — reuse the existing coalescing broadcast if one is exported, else plain broadcastTabs).
- [ ] **Step 3: Triggers.** tab-view.js: the existing `did-finish-load` handler at :268 is registered with **`wc.once(...)`** — it fires only for the WebContents' first document, so hooking it would probe once and never again (later navigations would clear the hint at `did-start-navigation` and never re-probe). Register a **separate, persistent** `wc.on('did-finish-load', boundToTab(() => hooks.onFillHintLoad?.(tab)))` listener beside it, and add the hook call in the main-frame branch of `did-navigate-in-page` (:248) (`hooks.onFillHintInPageNavigation?.(tab)`) — follow how tab-view already receives its handler set; grep `wireTabView(` in main.js for the wiring site. Main maps these to `scheduler.notePageLoad`/`noteInPageNavigation`. main.js: `setActiveTab` → `scheduler.noteActivated(tab)`. **Configuration changes attach at the central settings fan-out, NOT any single write path**: main.js:7091 already has a `settings.onSettingsChanged` listener that diffs exactly `[onePasswordEnabled, onePasswordAccount]` (it stops the broker on change) — extend that existing block, keeping the previous pair it already tracks, and dispatch on `configTransition(prev, next)`: `'became-eligible'` → `scheduler.noteConfigChanged(activeTab)` for each window's active tab; `'cleared'` → `scheduler.clearAll()`. This catches every writer by construction — the Settings toggle, Task 9's Verify handler (which persists through `setSettings` before probing), and any future caller — where hooking `pages:settings:set` alone would miss Verify-driven persistence. `did-start-navigation` main-frame (tab-view.js:256) → `hooks` call mapped to `scheduler.clearTab(tab.id)`; `sleepTab` and `closeTab` → `clearTab`.
- [ ] **Step 4: Pill chip.** index.html: insert after `#pillCapture` (line 50):

```html
<button id="pillFillHint" class="fill-hint-chip" type="button" title="Fill login from 1Password (⌥⌘P)" aria-label="Fill login from 1Password (⌥⌘P)" hidden>
  <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="6" r="3.2"/><path d="M8.4 8.4 13 13M11 11l1.6-1.6M12.6 12.6l1.2-1.2"/></svg>
</button>
```

renderer.js: in the `tabs:updated` active-tab render path (grep `pillShield` in renderer.js and mirror its show/hide idiom), `pillFillHint.hidden = !(active.fillHint && typeof browserAPI.fillLoginFromOnePassword === 'function')`; click → `browserAPI.fillLoginFromOnePassword()`. styles.css: `.fill-hint-chip` reusing the capture-chip's token set (same size/hover treatment).

- [ ] **Step 5: Run unit suite — green.** Manual: relaunch dev; enable + verify account; open a `current-password` login page (github.com/login) → key glyph appears; click fills via the normal explicit flow; navigate away → glyph clears; disable the setting → glyph gone. **Commit.**

---

### Task 12: Acceptance scenarios

**Files:**
- Modify: `spec/acceptance/` (the 1Password/fill feature file — `grep -rl 1password spec/acceptance/`) and `test/desktop/` step definitions
- Modify: `src/main/test-hook.js` (expose capsule + hint state on `globalThis.__blanc`)

- [ ] **Step 1:** Read `test/desktop/`'s existing step-definition pattern for an overlay assertion (any `overlay:` step) and the test-hook surface. Add to test-hook (env-gated as everything there): `fillStatus: { showForTest(kind), state() }` calling the Task 6 surface with a synthetic target, and `fillHint: { stateFor(tabId) }`.
- [ ] **Step 2:** Scenarios (Gherkin in spec/acceptance, tagged into the `runnable` desktop profile; the probe needs no broker so they run offline under `BLANC_TEST=1`):
  - "Ambient hint appears on an authoritative login form and clears on navigation" (fixture page served by the harness's existing local-server helper — grep `test/desktop` for how pages are served); the fixture also carries a signup variant whose only password field declares `autocomplete="current-password new-password"` and an opacity-zero login variant — neither may produce the hint;
  - "Decision capsule opens with focus on Cancel and is keyboard operable" (showForTest `confirm-heuristic`; assert `role=dialog`; focused element id `fillCancelBtn`; **Tab moves focus to `fillPrimaryBtn` and Tab again wraps back to `fillCancelBtn` (Shift-Tab reverses)**; **Enter with focus on Cancel resolves cancel — never primary — and Space on the primary button resolves primary**; Escape resolves cancel);
  - "Error notice persists until dismissed" (showForTest `no-match`; assert `role=alert` present after 5 s, ✕ dismisses);
  - "Success notice announces via status live region and auto-dismisses" (showForTest `filled`; assert `#fillLive` has `role=status` with the success title text; the notice is gone after ~5 s without any interaction);
  - "Decision capsule cancels on tab switch".
- [ ] **Step 3:** `npm run test:acceptance:dry` (definitions resolve), then `npm run test:acceptance:desktop` — green. **Commit.**

---

### Task 13: Documentation

**Files:**
- Modify: `docs/1password-integration.md`, `CLAUDE.md`

- [ ] **Step 1: docs/1password-integration.md** — Security-boundary section: add the ambient probe contract (structure-only, authoritative-token-only, active-tab-only, epoch-revalidated, never contacts the SDK, never surfaces errors), the capsule transport (fixed-kind IPC, narrow preload, request-ID echo), and the surface-generation whole-flow invalidation. Release-gates section: append the new live-gate cases verbatim from the spec's Testing section (anchored picker after scroll-during-DesktopAuth; ⌘L/sheet mid-broker aborts with nothing filled; each capsule shape; Verify success/wrong-account/DesktopAuth-cancel; hint on real login page/SPA/non-login page; permission precedence). Frozen-names section: add `verify-account` as a frozen broker method from this release forward.
- [ ] **Step 2: CLAUDE.md** — IPC namespaces line: add `` `fill:*` (main ↔ fill-status capsule: show/hide/reply) ``. In the password-manager paragraph, append one sentence: the capsule/hint surfaces are credential-free by contract; the picker remains native.
- [ ] **Step 3:** `npm run substrate:check` (must pass untouched — no substrate files changed). **Commit.**

---

### Task 14: Full verification + owner gates

- [ ] **Step 1:** `npm run test:unit` — all green.
- [ ] **Step 2:** `npm run substrate:check` — green.
- [ ] **Step 3:** `npm run test:acceptance:dry` && `npm run test:acceptance:desktop` — green.
- [ ] **Step 4:** `npm run test:onepassword:utility` — green.
- [ ] **Step 5:** Packaged check: `npm run dist:dir`, launch `dist/mac-arm64/Blanc.app`, repeat Task 6/9/11 manual checks against the packaged build (per the verify-in-packaged-build rule — dev-only passes don't count).
- [ ] **Step 6: STOP — owner gates, in order (do not proceed past any of these autonomously):**
  1. Security review round (spec: ambient probe script, capsule IPC surface, `verify-account`, live geometry call) — request it and wait.
  2. Live macOS real-account gate: run the extended checklist now recorded in `docs/1password-integration.md` (Task 13) with the loopback fixture + Dev-vault items; record evidence in that doc as the 2026-08-23 section did.
  3. `docs/marketing-claims.md` pass before any public copy mentions the hint.
  4. PR via the normal flow; explicit owner go-ahead required for merge and for any release. This plan authorizes neither.

---

## Self-Review Notes

- Spec coverage: capsule shapes/a11y (T1/T2/T6/T12), transport hardening (T2/T3/T6), readiness boundary (T3 behaviors 4–5), flow invalidation + generation + silent aborts + reason-aware focus (T3 behavior 8, T4, T5, T6), picker sole-channel live geometry (T7), success feedback (T1/T5), status card + persist-first Verify + app-presence hint (T8/T9), ambient hint incl. triggers/epoch/clearing/eligibility (T10/T11), posture-change copy + docs (T9 step 3, T13), non-goals respected (no substrate edits, frozen names, macOS gate), testing incl. the three review-pass-3 cases (T5 step 2, T3 behavior 4/5), release gates (T14).
- Type consistency: `notify(target, kind)`/`confirm(target, kind) → 'primary'|'cancel'`, `surfaceChanged(target)`, `prepareTarget(target)`, `toWindowPoint(target, rect)`, `pickerAnchorPoint({rect, viewBounds, zoomFactor})`, `kindForErrorCode(code)`, scheduler method names — used identically in T3/T4/T5/T6/T7/T10/T11.
- Known look-ups left to the implementer by design (exact existing names verified via grep at the anchors given): the utility-sheet show function name, the Glance-open function name, the chrome-protocol/serializeTabs/pages/window-runtime test file names, tab-view's hook-passing shape.
