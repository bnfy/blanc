# Display Capture Broker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a stock-Electron display-capture broker so website sessions stay deny-closed while a trusted helper captures screen (and picker-approved computer audio) and relays a normal `MediaStream` into Meet/Teams/Zoom.

**Architecture:** Website sessions deny `display-capture` and empty-`mediaTypes` `media`. An isolated-world preload admits `getDisplayMedia` only with transient activation, Permissions-Policy, and a focused/visible document. Main opens Island (or Linux portal) consent, then a hidden helper on an in-memory partition captures and WebRTC-relays tracks. Same-machine ICE only. Main-owned sharing chip + Stop. Spec: `docs/superpowers/specs/2026-09-07-display-capture-broker-design.md`.

**Tech Stack:** Electron 44.1.1 main/preload, `blanc-chrome://` helper document, vanilla overlay/strip, `node --test` units, throwaway stock-Electron probes under `experiments/display-capture-broker/`.

**Spec:** `docs/superpowers/specs/2026-09-07-display-capture-broker-design.md`

## Global Constraints

**2026-09-08 owner decision:** Approved the Linux-only disable of
`WebRtcAllowInputVolumeAdjustment`, preserving existing platform flags, and
broker/Island picker integration. The early guest evidence and microphone
listening verdict permit Task 11 to proceed. Merge and release remain gated;
Task 14 still requires all three exact-candidate packaged conference passes.
The development auto-pick stub is retired from product startup in favor of
the real picker. Linux native selection is reused for acquisition so the
portal does not open a second time.

- No custom Electron build. Website sessions remain deny-closed; the page receives only the approved `MediaStream`.
- In-memory helper partition; exact helper URL + active authorization; no helper navigation/`window.open`.
- Identity from `event.sender` / `event.senderFrame` only. Ignore page-posted activation, WebContents IDs, and `userActivated: true`.
- Production code must not call `executeJavaScript(..., userGesture: true)` (or equivalent) to manufacture website activation.
- Audio track only when the site requested audio **and** the user approved computer audio. Runtime has **no** energy threshold; probes/gates may measure energy.
- macOS: merge `MacCatapLoopbackAudioForScreenShare` into existing `disable-features` (FedCm already merged in `main.js`) before `ready`. Windows default `loopback`, not `loopbackWithMute`. Linux flags only after probe proof.
- Source metadata never enters the website renderer. Trusted Stop / lifecycle / bounded failure are the teardown guarantees; page `stop()` is last-consumer notify only.
- `nodeIntegrationInSubFrames` stays off. Do not claim iframe `getDisplayMedia` until preload reach is proven.
- Display-share state never persisted or synced. Pending/active shares exclude Quiet Tabs and closed-tab parking. Final sleep/discard/parking guards in `main.js` must re-check `displayShareBlocking` immediately before irreversible work (a share can start during an async eligibility await).
- Island picker is a **centered dialog**. Picker chrome has **no underlines** (no `text-decoration: underline` on labels, origin, or actions). Picker buttons keep keyboard **focus-visible** styling (existing `outline: 2px solid var(--accent)` ring; do not set `outline: none`).
- Probe/temp cleanup: after each throwaway run, delete Electron userData profiles, raw logs, and unused probe apps. Retain only the harness and dated `result.md`. No media samples.
- Marketing claims stay release-backed (`docs/marketing-claims.md`). Chrome UI changes require `npm start` relaunch.
- Feasibility probes (Tasks 1–4) before substantial picker UI. Conference matrix is last.

## File map

| File | Responsibility |
| --- | --- |
| `src/main/display-capture-admission.js` | Pure admission: activation + policy + focus/visibility facts |
| `src/main/display-capture-constraints.js` | Parse `getDisplayMedia` options (pre-picker vs source-dependent) |
| `src/main/display-capture-state.js` | Pure pending/active shares, consumers, generations |
| `src/main/display-capture-ice.js` | Bounded SDP/ICE parse; same-machine candidate check |
| `src/main/display-capture-flags.js` | Merge Chromium `disable-features` for macOS Catap-disable |
| `src/main/display-capture-broker.js` | Helper window, IPC, capture start/stop, relay routing |
| `src/main/display-capture-helper-preload.js` | Helper-only IPC (no `browserAPI`) |
| `src/renderer/display-capture-helper.html` / `.js` | Privileged capture + RTCPeerConnection |
| `src/main/capture-preload.js` | Isolated admission read + `getDisplayMedia` patch inject |
| `src/main/permissions.js` | Deny `display-capture` and empty `mediaTypes` |
| `src/main/chrome-protocol.js` | `blanc-chrome://display-capture-helper/` |
| `src/main/tab-sleep.js`, `closed-tabs.js` | Exclude pending/active display share |
| `src/renderer/overlay.js`, `renderer.js`, `styles.css` | Picker + sharing chip/Stop |
| `src/main/main.js` | Wire flags, sessions, overlay mode, tab projection |
| `experiments/display-capture-broker/` | Throwaway stock-Electron probes + dated results |
| `docs/security-evidence/` | Packaged conference + negative-matrix records |

---

### Task 1: Admission policy (pure) + isolated-world probe

**Files:**
- Create: `src/main/display-capture-admission.js`
- Test: `test/unit/display-capture-admission.test.js`
- Create: `experiments/display-capture-broker/README.md`
- Create: `experiments/display-capture-broker/admission-probe/main.cjs` (throwaway; records §10.1, §10.2, §10.4)
- Create: `experiments/display-capture-broker/admission-probe/result.md` (filled when run)

**Interfaces:**
- Consumes: facts gathered by preload + main (booleans only).
- Produces:
  - `evaluateAdmission({ userActivationActive, displayCaptureAllowed, documentFocused, documentVisible, frameAlive }) -> { ok: boolean, reason: 'activation'|'policy'|'focus'|'visible'|'frame'|null }`
  - **Every fact must be strictly `true`.** `null`, `undefined`, `1`, `"true"` all fail closed with that fact’s reason (`displayCaptureAllowed` not `true` → `policy`).
  - After `ok`, picker/portal focus must not be re-checked as a new admission (broker keeps `admitted: true`)

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateAdmission } = require('../../src/main/display-capture-admission');

const ok = {
  userActivationActive: true,
  displayCaptureAllowed: true,
  documentFocused: true,
  documentVisible: true,
  frameAlive: true,
};

test('all facts true admits', () => {
  assert.deepEqual(evaluateAdmission(ok), { ok: true, reason: null });
});

test('truthy non-true facts fail closed', () => {
  assert.equal(evaluateAdmission({ ...ok, userActivationActive: 1 }).reason, 'activation');
  assert.equal(evaluateAdmission({ ...ok, displayCaptureAllowed: 'true' }).reason, 'policy');
});

test('missing policy API fails closed', () => {
  assert.equal(evaluateAdmission({ ...ok, displayCaptureAllowed: null }).ok, false);
  assert.equal(evaluateAdmission({ ...ok, displayCaptureAllowed: null }).reason, 'policy');
});

test('no transient activation is denied', () => {
  assert.equal(evaluateAdmission({ ...ok, userActivationActive: false }).reason, 'activation');
});

test('background or unfocused document is denied before picker', () => {
  assert.equal(evaluateAdmission({ ...ok, documentFocused: false }).reason, 'focus');
  assert.equal(evaluateAdmission({ ...ok, documentVisible: false }).reason, 'visible');
});

test('dead frame is denied', () => {
  assert.equal(evaluateAdmission({ ...ok, frameAlive: false }).reason, 'frame');
});
```

- [ ] **Step 2: Run tests — expect FAIL** (module missing)

Run: `node --test test/unit/display-capture-admission.test.js`

- [ ] **Step 3: Implement `evaluateAdmission`**

Return the first failing reason in order: `frame`, `activation`, `policy`, `focus`, `visible`. Compare each fact with `=== true`.

- [ ] **Step 4: Re-run tests — expect PASS**

- [ ] **Step 5: Stock-Electron admission probe (before product IPC)**

In `experiments/display-capture-broker/admission-probe/`, a minimal BrowserWindow (not Blanc) that:

1. Isolated preload reads `navigator.userActivation.isActive` and `document.permissionsPolicy?.allowsFeature('display-capture') ?? null` at click time and on a no-gesture `ipcRenderer.send`.
2. **Trusted focus/visibility:** `WebContents` has `isFocused()` but **no** `isVisible()`. Main records `webContents.isFocused()`, the **owning window’s** `isVisible()` / `isMinimized()`, and main-owned tab/view **attachment** (the requesting view is attached and shown). The probe **also** verifies frame visibility from the main process when Electron exposes it. Do not use page-posted booleans. Cases: hidden window (`show: false`), minimized, blurred/unfocused, detached/unattached view, and a focused visible attached window. Admission must pass only when every required fact is strictly `true`.
3. **Picker-focus transfer:** after a successful admission, open a second chrome/picker window that takes focus. Re-evaluate must **not** run; the in-flight request stays admitted. A *new* request from the now-unfocused page must fail `focus`/`visible`.
4. Records iframe without `allow`, same-origin iframe inheritance, and a `Permissions-Policy: display-capture=()` header.
5. Records whether session `registerPreloadScript({ type: 'frame' })` runs in those iframes.
6. Does **not** use `executeJavaScript(..., true)` as a pass criterion.

Write outcomes into `admission-probe/result.md`. If iframe preload does not run, product must fail closed for those frames and **must not** claim iframe sharing. Delete the probe userData profile and raw logs afterward.

- [ ] **Step 6: Commit**

```bash
git add src/main/display-capture-admission.js test/unit/display-capture-admission.test.js experiments/display-capture-broker
git commit -m "$(cat <<'EOF'
Add display-capture admission policy and stock-Electron probe harness.

EOF
)"
```

---

### Task 2: Website session deny-closed

**Files:**
- Modify: `src/main/permissions.js` (`setupPermissionPolicy` request + check handlers)
- Test: `test/unit/display-capture-permission-deny.test.js`
- Existing harness pattern: `test/unit/native-media-permission-policy.test.js` `fakeSession()`

**Interfaces:**
- **Request handler** uses plural `details.mediaTypes`. Deny `display-capture`. Deny `media` when `normalizedMediaTypes(details.mediaTypes)` is empty. Scoped `audio`/`video` requests unchanged.
- **Check handler** uses singular `details.mediaType` ([Electron `setPermissionCheckHandler`](https://www.electronjs.org/docs/latest/api/session#sessetpermissioncheckhandlerhandler)). Do **not** read `details.mediaTypes` here.
  - `permission === 'display-capture'` → `false`
  - `permission === 'media'` and `details.mediaType` is `'audio'` or `'video'` → existing remembered-grant + native-access logic (must still return `true` after an Allow)
  - `permission === 'media'` and `mediaType` is missing, empty, or unknown → `false`
- Remembered grants must be tested through **both** handlers.

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { setupPermissionPolicy, setPermissionPrompter } = require('../../src/main/permissions');

function fakeSession() {
  const session = {};
  session.setPermissionRequestHandler = (fn) => { session.request = fn; };
  session.setPermissionCheckHandler = (fn) => { session.check = fn; };
  session.setDisplayMediaRequestHandler = (fn) => { session.display = fn; };
  return session;
}

const ask = (session, permission, details) => new Promise((resolve) =>
  session.request({ id: 1, isDestroyed: () => false }, permission, resolve, details));

test('display-capture is denied without a prompt', async (t) => {
  let prompts = 0;
  setPermissionPrompter(async () => { prompts += 1; return true; });
  t.after(() => setPermissionPrompter(null));
  const session = fakeSession();
  setupPermissionPolicy(session, { persistDecisions: false });
  assert.equal(await ask(session, 'display-capture', {
    requestingUrl: 'https://meet.example/',
  }), false);
  assert.equal(prompts, 0);
  assert.equal(session.check(null, 'display-capture', 'https://meet.example', {}), false);
});

test('empty mediaTypes is denied even with a remembered device allow', async (t) => {
  setPermissionPrompter(async () => true);
  t.after(() => setPermissionPrompter(null));
  const session = fakeSession();
  setupPermissionPolicy(session, { persistDecisions: false });
  assert.equal(await ask(session, 'media', {
    requestingUrl: 'https://meet.example/',
    mediaTypes: ['audio'],
  }), true);
  assert.equal(session.check(null, 'media', 'https://meet.example', { mediaType: 'audio' }), true);
  assert.equal(await ask(session, 'media', {
    requestingUrl: 'https://meet.example/',
    mediaTypes: [],
  }), false);
  assert.equal(session.check(null, 'media', 'https://meet.example', {}), false);
  assert.equal(session.check(null, 'media', 'https://meet.example', { mediaType: 'unknown' }), false);
  assert.equal(session.check(null, 'display-capture', 'https://meet.example', {}), false);
});

test('display media handler still grants no stream', () => {
  const session = fakeSession();
  setupPermissionPolicy(session, { persistDecisions: false });
  let streams;
  session.display({}, (s) => { streams = s; });
  assert.deepEqual(streams, {});
});
```

- [ ] **Step 2: Run — expect FAIL** on empty `mediaTypes` (today it can prompt as unscoped `media`)

Run: `node --test test/unit/display-capture-permission-deny.test.js`

- [ ] **Step 3: Deny unscoped display/media without breaking scoped checks**

In `setPermissionRequestHandler`, after `heldRequester`, if `permission === 'display-capture'` → `callback(false)`. If `permission === 'media'` and `normalizedMediaTypes(details.mediaTypes).length === 0` → `callback(false)` (do not prompt, do not persist).

In `setPermissionCheckHandler`, after `heldRequester`:
- `display-capture` → `false`
- `media` with `details.mediaType` not `'audio'` or `'video'` → `false`
- `media` with scoped `audio`/`video` → keep the existing `storedDecision` + native-access path (do not apply the request-handler `mediaTypes` array guard here)

Leave website `setDisplayMediaRequestHandler` as `callback({})`.

- [ ] **Step 4: Re-run — expect PASS** plus `node --test test/unit/native-media-permission-policy.test.js test/unit/private-permissions.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/main/permissions.js test/unit/display-capture-permission-deny.test.js
git commit -m "$(cat <<'EOF'
Deny website display-capture and unscoped media grants.

EOF
)"
```

---

### Task 3: Merge macOS Catap-disable into `disable-features`

**Files:**
- Create: `src/main/display-capture-flags.js`
- Test: `test/unit/display-capture-flags.test.js`
- Modify: `src/main/main.js` (~1396–1400, existing FedCm merge) — call the merger so Catap-disable is included **only on darwin**, before `ready`, without dropping `FedCm` or argv values

**Interfaces:**
- Produces: `mergeDisabledFeatures(existing, extras) -> string`
- `MAC_CATAP_LOOPBACK_FEATURE = 'MacCatapLoopbackAudioForScreenShare'`

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  mergeDisabledFeatures,
  MAC_CATAP_LOOPBACK_FEATURE,
} = require('../../src/main/display-capture-flags');

test('merges extras onto an existing comma list without duplicates', () => {
  assert.equal(
    mergeDisabledFeatures('FedCm', [MAC_CATAP_LOOPBACK_FEATURE]),
    `FedCm,${MAC_CATAP_LOOPBACK_FEATURE}`
  );
  assert.equal(
    mergeDisabledFeatures(`FedCm,${MAC_CATAP_LOOPBACK_FEATURE}`, [MAC_CATAP_LOOPBACK_FEATURE]),
    `FedCm,${MAC_CATAP_LOOPBACK_FEATURE}`
  );
});

test('empty prior keeps only extras', () => {
  assert.equal(mergeDisabledFeatures('', ['FedCm', MAC_CATAP_LOOPBACK_FEATURE]),
    `FedCm,${MAC_CATAP_LOOPBACK_FEATURE}`);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement merge + wire `main.js`**

```js
// display-capture-flags.js
function mergeDisabledFeatures(existing, extras) {
  const parts = String(existing || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const extra of extras) {
    if (extra && !parts.includes(extra)) parts.push(extra);
  }
  return parts.join(',');
}
```

In `main.js`, replace the FedCm-only append with `mergeDisabledFeatures(prior, ['FedCm', ...(process.platform === 'darwin' ? [MAC_CATAP_LOOPBACK_FEATURE] : [])])`. Do **not** add `MacSckSystemAudioLoopbackOverride`.

- [ ] **Step 4: Run flag unit tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/main/display-capture-flags.js test/unit/display-capture-flags.test.js src/main/main.js
git commit -m "$(cat <<'EOF'
Merge macOS Catap-disable into existing Chromium disable-features.

EOF
)"
```

---

### Task 4: Early Windows/Linux (and macOS) helper audio probe

**Files:**
- Create: `experiments/display-capture-broker/audio-probe/main.cjs`
- Create: `experiments/display-capture-broker/audio-probe/result.md` (template + filled run)

**Interfaces:** None for product. Gate: §10.6 — **receiver-measured nonzero audio** while a known system sound plays; microphone pickup excluded. Live track alone fails the probe.

- [ ] **Step 1: Write a throwaway Electron 44 harness** (not Blanc product)

Helper window: Catap-disable on darwin; `audio: 'loopback'` (not mute) after a stub source pick. Receiver page (second renderer) measures `AnalyserNode` peak on the **relayed** audio track only (no `getUserMedia` mic). Play a known desktop tone (e.g. system sound / local file via `afplay`/`powershell` outside the mic). Record peak, Electron/Chromium versions, OS, display/audio stack.

- [ ] **Step 2: Run on macOS** (this machine). Expect nonzero peak with mic muted / unused.

Record in `result.md` the **exact successful helper invocation** that produced audio+video (API name, arguments, session, flags). `getUserMedia` (legacy `chromeMediaSource` + source id, helper-only) and `session.setDisplayMediaRequestHandler` (handles helper `getDisplayMedia`) are **not interchangeable**. Task 8 must copy this recorded path, not guess.

- [ ] **Step 3: Run on Windows and Linux guests** (Parallels qualifies). If silent live track, try documented flags **only** as recorded in `result.md`. Do not start Island picker work until each platform either passes energy-at-receiver or has an owner-approved documented blocker. Record each platform’s working invocation the same way.

- [ ] **Step 4: Cleanup + commit**

Delete probe userData, raw logs, and any leftover probe app. Keep harness + `result.md` only (no media samples).

```bash
git add experiments/display-capture-broker/audio-probe
git commit -m "$(cat <<'EOF'
Record stock-Electron helper system-audio probe results.

EOF
)"
```

---

### Task 5: Constraint parse + share state (pure)

**Files:**
- Create: `src/main/display-capture-constraints.js`
- Create: `src/main/display-capture-state.js`
- Test: `test/unit/display-capture-constraints.test.js`
- Test: `test/unit/display-capture-state.test.js`

**Interfaces:**
- `parseDisplayMediaOptions(options) -> { ok, errorName, videoRequired, audioRequested, videoConstraints }`
  - `video` missing/`undefined` → `videoRequired: true`
  - `video: false` or invalid type → `{ ok: false, errorName: 'TypeError' }` (pre-picker)
  - valid `frameRate`/`width` objects stay in `videoConstraints` for **post-selection** apply (do not fail pre-picker)
- `createBrokerRegistry()`
  - `beginRequest({ tabId, webContentsId, frameId, origin, documentGeneration, audioRequested }) -> { requestId } | { error: 'pending' }`
  - `admit(requestId)` / `invalidateGeneration(webContentsId, documentGeneration)`
  - `approve(requestId, { sourceId, computerAudioApproved, surfaceLabel, surfaceKind })` — `computerAudioApproved` forced false unless `audioRequested`
  - `addConsumer(shareId, { kind: 'video'|'audio', trackKey })` / `removeConsumer(...)` → `{ releasedKind, shareEnded }`
  - `stopShare(shareId)` → all consumers/sources released
  - `tabHasBlockingShare(tabId) -> boolean` (pending or active)
  - `listShares() -> Array<{ shareId, requestId, tabId, origin, surfaceLabel, surfaceKind, computerAudio, pending }>`
  - Late `approve` on unknown/stale `requestId` → no-op

- [ ] **Step 1: Write failing constraint tests**

```js
const { parseDisplayMediaOptions } = require('../../src/main/display-capture-constraints');

test('omitted video is required video', () => {
  const p = parseDisplayMediaOptions(undefined);
  assert.equal(p.ok, true);
  assert.equal(p.videoRequired, true);
  assert.equal(p.audioRequested, false);
});

test('video false is TypeError before picker', () => {
  assert.equal(parseDisplayMediaOptions({ video: false }).errorName, 'TypeError');
});

test('valid frameRate does not fail before picker', () => {
  const p = parseDisplayMediaOptions({ video: { frameRate: { ideal: 30 } }, audio: true });
  assert.equal(p.ok, true);
  assert.equal(p.audioRequested, true);
  assert.deepEqual(p.videoConstraints, { frameRate: { ideal: 30 } });
});
```

- [ ] **Step 2: Write failing state tests** — one pending per tab; stale approve ignored; clone consumer keys independent; last audio consumer releases audio only; `stopShare` releases all; `tabHasBlockingShare` true for pending and active.

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement both modules (no `require('electron')`)**

- [ ] **Step 5: Run — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add src/main/display-capture-constraints.js src/main/display-capture-state.js test/unit/display-capture-constraints.test.js test/unit/display-capture-state.test.js
git commit -m "$(cat <<'EOF'
Add display-capture constraint parse and share registry.

EOF
)"
```

---

### Task 6: Same-machine ICE/SDP filter

**Files:**
- Create: `src/main/display-capture-ice.js`
- Test: `test/unit/display-capture-ice.test.js`

**Interfaces:**
- `MAX_SIGNAL_BYTES` (e.g. 65536)
- `filterSignaling(sdpOrCandidate, { localAddresses: Set<string> }) -> { ok, sdp?, candidate?, reason? }`
- Reject oversized payloads; drop `a=candidate` lines whose IP is not in `localAddresses` and not IPv4/IPv6 loopback; do not synthesize replacement candidates
- `collectLocalAddresses()` used only in Electron later; unit tests inject the set

- [ ] **Step 1: Write failing tests**

```js
const { filterSignaling } = require('../../src/main/display-capture-ice');

const local = new Set(['127.0.0.1', '::1', '192.168.1.20']);

test('rejects a public candidate', () => {
  const line = 'a=candidate:1 1 UDP 2122260223 8.8.8.8 59999 typ host';
  assert.equal(filterSignaling(line, { localAddresses: local }).ok, false);
});

test('keeps a verified same-machine host address', () => {
  const line = 'a=candidate:1 1 UDP 2122260223 192.168.1.20 59999 typ host';
  assert.equal(filterSignaling(line, { localAddresses: local }).ok, true);
});

test('typ host alone is not enough without a local address', () => {
  const line = 'a=candidate:1 1 UDP 2122260223 203.0.113.5 59999 typ host';
  assert.equal(filterSignaling(line, { localAddresses: local }).ok, false);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement parser** (line-oriented; fail closed on unparseable candidate lines)

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/main/display-capture-ice.js test/unit/display-capture-ice.test.js
git commit -m "$(cat <<'EOF'
Filter display-capture relay signaling to same-machine endpoints.

EOF
)"
```

---

### Task 7: Helper chrome document and session guards

**Files:**
- Modify: `src/main/chrome-protocol.js` — `CHROME_DISPLAY_CAPTURE_HELPER_URL = 'blanc-chrome://display-capture-helper/'` + host assets
- Test: `test/unit/chrome-protocol.test.js` (extend)
- Create: `src/renderer/display-capture-helper.html`, `src/renderer/display-capture-helper.js`
- Create: `src/main/display-capture-helper-preload.js`
- Modify: `src/main/display-capture-broker.js` (create in this task: window + session only)

**Interfaces:**
- Helper session: `session.fromPartition('blanc-display-capture-helper')` with **no** `persist:` prefix
- `lockPrivilegedNavigation` to the exact helper URL (same helper as permission/fill-status in `main.js`)
- `setWindowOpenHandler` → deny
- Preload exposes only helper IPC (`display-capture-helper:ready`, authorize, signaling, stop) — **not** `browserAPI`
- Website sessions must not register this protocol host if they already cannot load `blanc-chrome` — do not add the helper host to browsing sessions

- [ ] **Step 1: Extend `chrome-protocol.test.js`** so helper URL resolves and `../` / query / other hosts fail

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Add host map + HTML/JS stubs** (capture functions can no-op until Task 8; CSP: no remote, same as other chrome docs)

- [ ] **Step 4: Unit-test `isAuthorizedHelperSender(wc, url)`** in broker: wrong URL / destroyed / no token → false

- [ ] **Step 5: Run chrome-protocol + broker-guard tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add src/main/chrome-protocol.js test/unit/chrome-protocol.test.js src/renderer/display-capture-helper.html src/renderer/display-capture-helper.js src/main/display-capture-helper-preload.js src/main/display-capture-broker.js
git commit -m "$(cat <<'EOF'
Add in-memory display-capture helper document and session guards.

EOF
)"
```

---

### Task 8: Broker IPC, helper capture, local relay

**Files:**
- Modify: `src/main/display-capture-broker.js`
- Modify: `src/renderer/display-capture-helper.js`
- Modify: `src/main/main.js` (install broker on browsing sessions + overlay hook stub)
- Test: `test/unit/display-capture-broker.test.js` (inject fakes: sender, helper wc, ice filter)

**Interfaces:**
- `installDisplayCaptureBroker({ ipcMain, sessionFactory, registry, evaluateAdmission, filterSignaling, collectLocalAddresses, showPicker, hidePicker })`
- Page channels (invoke from isolated preload only): `display-capture:request`, `display-capture:signal`, `display-capture:track-stopped`
- Chrome channels: `display-capture:picker-resolve` (overlay sender only)
- Helper channels: `display-capture-helper:*`
- Request record binds `sender` + `senderFrame` + `documentGeneration`; mismatch → ignore
- Helper-initiated offer; page answer; main runs `filterSignaling` both directions toward the helper
- Resolve page request only after usable video track (and audio if requested+approved) or reject on timeout
- Serialize `acquireCapture` on the helper (queue)
- Helper capture after chrome consent only — do not fabricate website gestures
- Tampered-destination: unit-test that a public candidate never reaches `helperWc.send` as an add-ice payload
- Helper capture **must use the invocation recorded in Task 4 `audio-probe/result.md`**. Do not treat helper `getUserMedia` and `setDisplayMediaRequestHandler` as interchangeable. The handler is only for helper-side `getDisplayMedia`; legacy source-id capture stays `getUserMedia` if that is what the probe proved.
- Lifecycle (unit tests with injected fakes, then stub live where noted). Each event must stop helper tracks / reject or end the share and must not leak a live source:
  - requesting-document **navigation** / generation change
  - requesting-**frame destruction**
  - requesting-**renderer crash** (`render-process-gone`)
  - **helper crash** / helper `render-process-gone` (invalidates **every** share the helper owns)
  - native **source ending** (`ended` on helper video/audio)
  - **relay / startup timeout** without usable required tracks
  - **Cancel during acquisition** (picker OK already sent, helper still starting) — late completion must stop those tracks immediately

- [ ] **Step 1: Write failing broker unit tests** covering forged sender, stale generation, public ICE stripped, audioApproved without audioRequested forced false, **and every lifecycle event above** (including cancel-during-acquisition).

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement routing + helper capture**

Copy Task 4’s recorded helper API. Windows `loopback` when computer audio was requested and approved; macOS same with Catap already disabled. Apply `videoConstraints` to the **selected** source; `OverconstrainedError` rejects after selection. Wire the lifecycle listeners in this task (do not defer them to Task 10).

- [ ] **Step 4: Run unit tests — expect PASS**

- [ ] **Step 5: Manual stub picker** (temporary auto-pick first screen, **dev-only** behind `!app.isPackaged && process.env.BLANC_DISPLAY_CAPTURE_STUB === '1'`) to prove relay before Task 11. Never on in packaged builds.

- [ ] **Step 6: Tampered-destination live check (transport-level)**

A dropped-candidate **log is supporting evidence only** and does not pass this step.

Required observations, recorded in `experiments/display-capture-broker/relay-probe/result.md`:

1. **Legitimate same-machine relay succeeds** (decoded video + usable audio track as requested).
2. Page injects an off-machine candidate **embedded in SDP** (`c=` / `a=candidate`) — helper must not send media or ICE to that destination (observe helper `RTCPeerConnection` selected candidate / `iceConnectionState` / packet destination via WebRTC stats or OS-level capture). Request fails closed or stays same-machine.
3. Page injects the same address as a **separately supplied** `icecandidate` — same confinement.
4. Logs of stripped candidates may be attached after 1–3 pass.

Delete the stub profile/logs after the write-up.

- [ ] **Step 7: Commit**

```bash
git add src/main/display-capture-broker.js src/renderer/display-capture-helper.js src/main/main.js test/unit/display-capture-broker.test.js experiments/display-capture-broker/relay-probe
git commit -m "$(cat <<'EOF'
Relay display capture through a same-machine helper broker.

EOF
)"
```

---

### Task 9: Page `getDisplayMedia` patch and track consumers

**Files:**
- Modify: `src/main/capture-preload.js` (isolated world + mainworld markers)
- Modify: `src/main/capture-mainworld.js` (keeps extracting shipped bytes)
- Test: `test/unit/capture-mainworld.test.js` (extend)
- Test: `test/unit/display-capture-page-patch.test.js` (vm of extracted source)

**Interfaces:**
- Isolated preload, on `display-capture:request`: read activation + `permissionsPolicy`; send facts only (no page-supplied IDs)
- Main-world: replace `navigator.mediaDevices.getDisplayMedia`; parse options via a copy of the TypeError rules (or reject `video: false` locally); wait for main; build `MediaStream` from relayed tracks
- Wrap `stop`/`clone` on brokered tracks: clone registers a new `trackKey`; `stop` notifies `display-capture:track-stopped` with `trackKey` + kind — does **not** stop siblings
- Do not call native `getDisplayMedia` on website sessions

- [ ] **Step 1: Write failing vm tests** for `video: false` → TypeError; clone increments consumers; stopping one clone does not emit stop for the sibling key

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement patch between existing `>>> mainworld` markers; keep capture-mainworld extractor in sync**

- [ ] **Step 4: Run `node --test test/unit/capture-mainworld.test.js test/unit/display-capture-page-patch.test.js` — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/main/capture-preload.js src/main/capture-mainworld.js test/unit/capture-mainworld.test.js test/unit/display-capture-page-patch.test.js
git commit -m "$(cat <<'EOF'
Patch getDisplayMedia to the display-capture broker.

EOF
)"
```

---

### Task 10: Quiet Tabs and closed-tab exclusion

**Files:**
- Modify: `src/main/tab-sleep.js` (`sleepCandidates` skip when `tab.displayShareBlocking`)
- Modify: `src/main/closed-tabs.js` (`holdEligibility` demote when `tab.displayShareBlocking`)
- Modify: `src/main/main.js` — set `tab.displayShareBlocking` from `registry.tabHasBlockingShare` **and** re-check it in the **final** sleep/discard/parking guards (not only candidate selection)
- Test: `test/unit/tab-sleep.test.js`, `test/unit/closed-tabs.test.js`, plus a focused test or hook covering the main.js final-guard predicates if they can be extracted; otherwise a named comment + desktop/manual script that starts a share during a sleep probe

**Interfaces:**
- `tab.displayShareBlocking === true` for pending **or** active broker request
- Must not reuse mic/camera `tab.capturing` as the only signal
- A share can begin **during** an async eligibility check. Candidate selection is insufficient.

Final guards that must include `tab.displayShareBlocking` (same race as today’s `tab.capturing` comment at `main.js` ~1707–1718 and `parkTabView` ~1995–1997):

1. **`sleepTab` post-await discard** — immediately before renderer kill / quiet commit, refuse if `displayShareBlocking` became true during CDP/`hasBeforeUnloadListener`.
2. **Any other sleep/discard path** that re-validates after `await` (same file; grep `tab.capturing` and add the sibling check).
3. **`parkTabView`** — return `false` if `displayShareBlocking` (do not Tier-0 hold a sharing tab).
4. **`holdEligibility` / closeTab** — already demotes via the tab field; keep it in sync before `parkTabView`.

- [ ] **Step 1: Write failing tests** — capturing-false but `displayShareBlocking` true is not a sleep candidate; holdEligibility is `snapshot` not `hold`; a fixture that flips `displayShareBlocking` between candidate selection and the final-guard function refuses sleep/park

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement field + policy + `main.js` final guards**

If the final-guard block is inline, extract a tiny `mayDiscardRenderer(tab)` / `mayParkTabView(tab)` (or extend the existing capture checks) so the race is unit-testable. Do not leave the share check only in `sleepCandidates`.

- [ ] **Step 4: Run sleep + closed-tab units — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/main/tab-sleep.js src/main/closed-tabs.js src/main/main.js test/unit/tab-sleep.test.js test/unit/closed-tabs.test.js
git commit -m "$(cat <<'EOF'
Keep display-share tabs awake and out of closed-tab parking.

EOF
)"
```

---

### Task 11: Island picker (and Linux portal)

**Files:**
- Modify: `src/renderer/overlay.html`, `overlay.js`, `styles.css`
- Modify: `src/main/main.js` / overlay show path — new mode `'display-share'` (do not reuse `'shield'` / `'capture'` mic popover)
- Modify: `src/main/preload.js` — chrome-only picker resolve (overlay URL already trusted)
- Test: `test/unit/display-capture-picker-model.test.js` if list projection is extracted; otherwise overlay is relaunch-verified

**Interfaces:**
- `showPicker(requestId, { origin, audioRequested, sources: [{ id, name, kind, thumbnailDataURL }] })` — sources only to overlay
- Computer-audio checkbox **only if** `audioRequested`
- Allow → `display-capture:picker-resolve` `{ requestId, sourceId, computerAudioApproved }` from overlay sender
- Cancel / Esc / scrim → reject `NotAllowedError`
- Picker focus must not call `evaluateAdmission` again
- Linux: if portal/native chooser is required, Island shows intent then main waits on portal completion as consent; cancel ≡ picker cancel. Do not promise identical UX in copy.

- [ ] **Step 1: Extract a tiny `projectPickerSources(desktopCapturerSources)`** (no thumbnails to website) + unit test (ids stay in chrome model only)

- [ ] **Step 2: Implement overlay UI** — **centered dialog** (overlay mode `'display-share'`, card centered in the window, not a corner/shield-style popover). Inter/JetBrains tokens already in `styles.css`. Site origin + surface list + optional computer audio + Share / Cancel. **No underlines** on origin, labels, or actions (`text-decoration: none`; do not use underline hover). Share/Cancel (and source rows that are buttons) must keep **`button:focus-visible`** accent outline; do not disable outlines.

- [ ] **Step 3: Relaunch `npm start`**, trigger stub-off path from a fixture page; confirm metadata never appears in the tab’s DevTools as page JS globals

- [ ] **Step 4: Concurrency check** — two windows/tabs: second pending denied or queued; first tab cannot receive second tab’s `sourceId` (unit test on registry + broker)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/overlay.html src/renderer/overlay.js src/renderer/styles.css src/main/main.js src/main/preload.js test/unit/display-capture-picker-model.test.js
git commit -m "$(cat <<'EOF'
Add Island display-share picker with chrome-only source metadata.

EOF
)"
```

---

### Task 12: Sharing indicator and trusted Stop

**Files:**
- Modify: `src/renderer/index.html`, `renderer.js`, `styles.css`
- Modify: `src/renderer/overlay.js` if Stop lives in the existing capture popover as a **separate row type**
- Modify: `src/main/display-capture-broker.js` + `tabs:updated` projection
- Test: `test/unit/display-capture-indicator.test.js` (pure projection)

**Interfaces:**
- Projection (window-wide): `{ displayShares: Array<{ shareId, pending, origin, surfaceLabel, surfaceKind, computerAudio, tabId }> }` — a **collection keyed by `shareId`**, never a single `displayShare | null`
- Each row has its own **Stop** that calls `stopShare(shareId)` only
- Off→on from main broker state (pending picker **or** active share)
- Stop sharing → `display-capture:stop` from **strip/overlay only** with `shareId`; does not clear mic/camera anchors or other shares
- Chip/popover remains usable when a sharing tab is not selected
- Extend `display-capture-state.js` with `listShares()` if Task 5 omitted it

- [ ] **Step 1: Write failing projection tests**

Two active shares in one window: collection length 2; distinct `shareId`s; `stopShare(idA)` leaves idB’s origin/surface/audio intact; pending + active both appear; mic-only capturing without a share yields `displayShares: []`.

- [ ] **Step 2: Implement chrome chip + independently addressable Stop rows** (copy: “Sharing [surface]” / “Computer audio on|off” / “Stop sharing”). No underlines.

- [ ] **Step 3: Relaunch — two shares in one window; Stop on either preserves the other; background-tab Stop ends only that share’s helper tracks**

- [ ] **Step 4: Commit**

```bash
git add src/renderer/index.html src/renderer/renderer.js src/renderer/styles.css src/renderer/overlay.js src/main/display-capture-broker.js src/main/main.js test/unit/display-capture-indicator.test.js
git commit -m "$(cat <<'EOF'
Show a main-owned display-share indicator and trusted Stop.

EOF
)"
```

---

### Task 13: Packaging strings and packaged smoke hooks

**Files:**
- Modify: `package.json` `build.mac.extendInfo` — add `NSAudioCaptureUsageDescription`: `Blanc lets you share this Mac’s screen and system audio with a website after you choose a source.`
- Modify: `test/unit/macos-media-access-packaging.test.js` / `native-media-packaging.test.js` to require the new key
- Review: `build/entitlements.mac.plist` — do not add unnecessary entitlements; screen recording is TCC, not an entitlement
- Modify: `src/main/test-hook.js` only if unpackaged acceptance needs deterministic picker (env-gated, never packaged)

- [ ] **Step 1: Write failing packaging test** for `NSAudioCaptureUsageDescription`

- [ ] **Step 2: Add the Info.plist string; re-run packaging tests**

- [ ] **Step 3: Confirm stub env is ignored when `app.isPackaged`**

- [ ] **Step 4: Commit**

```bash
git add package.json test/unit/macos-media-access-packaging.test.js test/unit/native-media-packaging.test.js src/main/display-capture-broker.js
git commit -m "$(cat <<'EOF'
Declare system-audio usage for packaged display capture.

EOF
)"
```

---

### Task 14: Exact-candidate evidence (release gate)

**Files:**
- Create: `docs/security-evidence/display-capture-broker-gate.md` (checklist template)
- Fill a dated file per platform after runs (do not invent results)

**Not product code.** Bind to the **exact release candidate** commit + artifact hashes. Renew if capture or packaging changes.

**Artifact authentication is a prerequisite.** Conference passes do **not** count until verification is recorded on that exact candidate:

| Platform | Required verification (record command + output summary) |
| --- | --- |
| macOS | Native signature + Gatekeeper assessment + stapled notarization ticket on `Blanc.app` (same class as `docs/release-verification.md`) |
| Windows | Timestamped Authenticode; subject equals `WINDOWS_EXPECTED_PUBLISHER`; bind `windows-signature.json` / installer SHA-256 |
| Linux | Authenticated checksum manifest (`SHA256SUMS` + Sigstore/`cosign verify-blob` against the pinned identity/issuer) |

Each of macOS, Windows, Linux, **after** that verification:

1. Receiver (second person or second machine) sees moving screen **and** hears system audio; mic muted on the sharer; play a known desktop tone.
2. Cancel denies; per-share Stop ends that share’s video+audio; Stop works with the sharing tab backgrounded; a second share in the same window is preserved.
3. Wrapper-bypass + mixed legacy + remembered device grants on Personal, named-profile, and private — record graceful `NotAllowedError` vs renderer kill; **no stream**.
4. Forged IPC / off-machine ICE still fail closed (transport-level, as Task 8).
5. Mic + camera still work during share; share Stop does not end them.
6. Record Blanc version, SHA, **verified** artifact hashes, Electron, Chromium, OS/arch, conference app, Linux display/audio stack.

- [ ] **Step 1: Verify signatures/authentication on the exact candidate; attach the log excerpts**

- [ ] **Step 2: Run conference + negative matrix only on those verified artifacts**

- [ ] **Step 3: Commit evidence after real runs** (never placeholder “PASS”)

---

## Spec coverage

| Spec | Task |
| --- | --- |
| §3 feasibility vs gate | Tasks 1, 4, 14 (probes ≠ gate) |
| §4.1 deny-closed | Task 2 |
| §4.2 helper session | Task 7 |
| §4.3 lifecycle / last-consumer / Quiet+closed | Tasks 5, 8 (all teardown events), 9, 10 (final guards) |
| §5.3–5.4 admission + API | Tasks 1 (focus/visibility + picker-focus), 5, 9, 11 |
| §5.6 same-machine relay | Tasks 6, 8 (transport-level) |
| §6 picker + indicator | Tasks 11 (centered, no underlines), 12 (share collection) |
| §7 flags + packaging | Tasks 3, 13 |
| §8 / §8.1 matrix + authenticated artifacts | Task 14 |
| §10.1–10.6 | Tasks 1, 4 (recorded helper invocation), 6, 8, 11 |

## Placeholder scan

No TBD implementation steps. Probe **results** are written when run, not invented in this plan.
