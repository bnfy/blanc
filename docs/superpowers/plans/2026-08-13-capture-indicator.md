# Capture Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A truthful window-wide "mic/camera in use" chip in the island pill, with a per-surface stop popover, a media glyph on the permission prompt, and capture-aware Quiet Tabs.

**Architecture:** The only `off → on` transition is the main-process permission grant (new observer in `permissions.js`); a session preload's main-world instrumentation refines toward *off* via per-frame snapshots and per-call settlements. Per-surface state lives in a pure reducer (`capture-state.js`) holding grant anchors + frame live-counts, projected to `{audio, video}` for the UI. Spec: `docs/superpowers/specs/2026-08-13-capture-indicator-design.md`.

**Tech Stack:** Electron 43.4 main/preload, vanilla chrome renderers, `node --test` for units.

## Global Constraints

- **No persistence or sync:** capture state never reaches `session.json`, `sleepSnapshots`, sync stores, history, or disk. Only the `tabs:updated` projection (and the test hook) carry it out of main.js.
- **`nodeIntegrationInSubFrames` must NOT be enabled** — the §4.1 spike outcome (main-frame-only instrumentation) is normative.
- **Reports/settlements only refine toward off.** They can never create capture state, and a non-matching report/settlement must not clear an unconfirmed anchor.
- A video-only grant must never light the mic glyph.
- User-visible copy: "microphone in use", "camera in use", "camera & microphone in use". Internals say `capture`.
- Chip glyphs render in `--danger`; steady (no pulse, no count). Existing tokens only — no `tokens/tokens.json` changes, so `substrate:check` stays untouched.
- Popover: max **5** visible rows then scroll; stop timeout **1500 ms** then reload; chip stays lit until the reload's main-frame commit or renderer-gone.
- Chrome documents load once — every chrome UI change needs a dev-app relaunch (`npm start`) to verify; leave the dev instance open at the end.

---

### Task 1: Pure capture-state reducer

**Files:**
- Create: `src/main/capture-state.js`
- Test: `test/unit/capture-state.test.js`

**Interfaces:**
- Consumes: `normalizedMediaTypes` from `src/main/permission-decisions.js`.
- Produces (used by Tasks 3, 5, 7, 9, 10):
  - `createCaptureRecord() -> {anchors: [], frames: Map, generation: 0}`
  - `applyGrant(record, {scopes, origin, isMainFrame})` — also bumps `generation`
  - `applySettlement(record, {origin, isMainFrame, outcome: 'resolved'|'rejected', scopes}) -> boolean` (true iff an anchor was consumed)
  - `applyFrameReport(record, frameKey, {origin, isMainFrame, audioLive, videoLive})`
  - `projection(record) -> {audio: boolean, video: boolean}`
  - `clearRecord(record)` — wipes anchors + frames, bumps `generation`
  - `generation` is the Stop-timeout token (Task 5(i)): a grant or clear
    invalidates any pending reload decision made against an older value.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/capture-state.test.js
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createCaptureRecord, applyGrant, applySettlement, applyFrameReport, projection, clearRecord,
} = require('../../src/main/capture-state');

const MAIN = { origin: 'https://meet.example', isMainFrame: true };
const IFRAME = { origin: 'https://embed.example', isMainFrame: false };

test('grant lights exactly its scopes; video-only never lights audio', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...MAIN, scopes: ['video'] });
  assert.deepEqual(projection(r), { audio: false, video: true });
});

test('resolved settlement confirms; counts then govern', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...MAIN, scopes: ['audio'] });
  applySettlement(r, { ...MAIN, outcome: 'resolved', scopes: ['audio'] });
  applyFrameReport(r, 'f1', { ...MAIN, audioLive: 1, videoLive: 0 });
  assert.deepEqual(projection(r), { audio: true, video: false });
  applyFrameReport(r, 'f1', { ...MAIN, audioLive: 0, videoLive: 0 });
  assert.deepEqual(projection(r), { audio: false, video: false });
});

test('rejected settlement retires its anchor (device failure goes dark)', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...MAIN, scopes: ['audio'] });
  applySettlement(r, { ...MAIN, outcome: 'rejected', scopes: ['audio'] });
  assert.deepEqual(projection(r), { audio: false, video: false });
});

test('concurrent grants each keep an anchor; one settlement consumes one', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...MAIN, scopes: ['audio'] });
  applyGrant(r, { ...MAIN, scopes: ['audio'] });
  assert.equal(applySettlement(r, { ...MAIN, outcome: 'rejected', scopes: ['audio'] }), true);
  assert.deepEqual(projection(r), { audio: true, video: false },
    'the second call is still pending; its anchor must survive');
});

test('non-matching reports/settlements cannot clear an unconfirmed anchor', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...IFRAME, scopes: ['audio'] });          // subframe grant: unconfirmable
  applyFrameReport(r, 'main', { ...MAIN, audioLive: 0, videoLive: 0 });
  applySettlement(r, { ...MAIN, outcome: 'rejected', scopes: ['audio'] });
  assert.deepEqual(projection(r), { audio: true, video: false },
    'patch failed / wrong frame => stuck on until navigation');
});

test('summed frame counts: one stopped capture cannot clear another', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...MAIN, scopes: ['audio'] });
  applySettlement(r, { ...MAIN, outcome: 'resolved', scopes: ['audio'] });
  applyFrameReport(r, 'f1', { ...MAIN, audioLive: 2, videoLive: 0 });
  applyFrameReport(r, 'f1', { ...MAIN, audioLive: 1, videoLive: 0 });
  assert.deepEqual(projection(r), { audio: true, video: false });
});

test('settlement matching requires equal normalized scopes', () => {
  const r = createCaptureRecord();
  applyGrant(r, { ...MAIN, scopes: ['audio', 'video'] });
  assert.equal(applySettlement(r, { ...MAIN, outcome: 'rejected', scopes: ['audio'] }), false);
  assert.deepEqual(projection(r), { audio: true, video: true });
});

test('grants and clearRecord bump generation (the Stop-timeout token)', () => {
  const r = createCaptureRecord();
  const g0 = r.generation;
  applyGrant(r, { ...MAIN, scopes: ['audio'] });
  assert.ok(r.generation > g0, 'a new call invalidates a pending stop decision');
  const g1 = r.generation;
  clearRecord(r);
  assert.ok(r.generation > g1);
  assert.deepEqual(projection(r), { audio: false, video: false });
  assert.equal(r.anchors.length, 0);
  assert.equal(r.frames.size, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/capture-state.test.js`
Expected: FAIL — `Cannot find module '../../src/main/capture-state'`

- [ ] **Step 3: Write the implementation**

```js
// src/main/capture-state.js
// Pure per-surface capture truth (spec §3.2): grant anchors from the
// main-process permission handler are the ONLY way capture turns on;
// renderer settlements/reports may only refine toward off. No electron
// import — requireable from `node --test` (precedent: permission-decisions).
const { normalizedMediaTypes } = require('./permission-decisions');

const scopeKey = (scopes) => normalizedMediaTypes(scopes).join('+');

function createCaptureRecord() {
  // generation is the Stop-timeout token: a pending "reload if still lit"
  // decision is only honored while the generation it was made against still
  // stands. A new grant (new call) or a clear invalidates it.
  return { anchors: [], frames: new Map(), generation: 0 };
}

function applyGrant(record, { scopes, origin, isMainFrame }) {
  // One anchor PER grant — never merged. Concurrent getUserMedia calls each
  // carry their own; a settlement consumes exactly one.
  record.anchors.push({
    scopes: normalizedMediaTypes(scopes),
    origin,
    isMainFrame: isMainFrame !== false,
    confirmed: false,
  });
  record.generation += 1;
}

function clearRecord(record) {
  record.anchors.length = 0;
  record.frames.clear();
  record.generation += 1;
}

function applySettlement(record, { origin, isMainFrame, outcome, scopes }) {
  const key = scopeKey(scopes);
  const i = record.anchors.findIndex((a) => !a.confirmed
    && a.origin === origin
    && a.isMainFrame === (isMainFrame !== false)
    && scopeKey(a.scopes) === key);
  if (i === -1) return false;
  if (outcome === 'rejected') record.anchors.splice(i, 1);
  else record.anchors[i].confirmed = true;
  return true;
}

function applyFrameReport(record, frameKey, { origin, isMainFrame, audioLive, videoLive }) {
  const audio = Math.max(0, audioLive | 0);
  const video = Math.max(0, videoLive | 0);
  if (audio === 0 && video === 0) record.frames.delete(frameKey);
  else record.frames.set(frameKey, {
    origin, isMainFrame: isMainFrame !== false, audioLive: audio, videoLive: video,
  });
}

function projection(record) {
  let audio = false;
  let video = false;
  for (const a of record.anchors) {
    if (a.confirmed) continue; // a confirmed anchor's truth is the counts
    if (a.scopes.includes('audio')) audio = true;
    if (a.scopes.includes('video')) video = true;
  }
  for (const f of record.frames.values()) {
    if (f.audioLive > 0) audio = true;
    if (f.videoLive > 0) video = true;
  }
  return { audio, video };
}

module.exports = {
  createCaptureRecord, applyGrant, applySettlement, applyFrameReport, projection, clearRecord,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/capture-state.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/capture-state.js test/unit/capture-state.test.js
git commit -m "feat: pure capture-state reducer (anchors + frame counts)"
```

---

### Task 2: Main-world instrumentation source

**Files:**
- Create: `src/main/capture-mainworld.js`
- Test: `test/unit/capture-mainworld.test.js`

**Interfaces:**
- Produces: `CAPTURE_MAINWORLD_SOURCE` — a self-contained IIFE string. It
  dispatches `window` CustomEvents named `blanc:capture-report` whose
  `detail` is a **JSON string** (CustomEvent details don't cross isolated
  worlds as objects): either
  `{"type":"settlement","outcome":"resolved"|"rejected","scopes":[…]}` or
  `{"type":"snapshot","audioLive":N,"videoLive":N}`. It listens for
  `blanc:capture-stop-request` and stops all registered tracks. Consumed by
  Task 5's preload.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/capture-mainworld.test.js
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { CAPTURE_MAINWORLD_SOURCE } = require('../../src/main/capture-mainworld');

// Minimal DOM/media doubles for the injected patch.
function makeWorld() {
  const events = [];
  const listeners = new Map();
  class FakeTrack {
    constructor(kind) { this.kind = kind; this.readyState = 'live'; this.handlers = new Map(); }
    stop() { this.readyState = 'ended'; }
    clone() { return new FakeTrack(this.kind); }
    addEventListener(name, fn) { this.handlers.set(name, fn); }
    fireEnded() { this.readyState = 'ended'; this.handlers.get('ended')?.(); }
  }
  class FakeStream {
    constructor(tracks) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
    clone() { return new FakeStream(this.tracks.map((t) => t.clone())); }
  }
  let nextStream = null;
  const world = {
    window: null,
    CustomEvent: class { constructor(name, opts) { this.type = name; this.detail = opts?.detail; } },
    MediaStreamTrack: FakeTrack,
    MediaStream: FakeStream,
    navigator: {
      mediaDevices: {
        getUserMedia: () => (nextStream instanceof Error
          ? Promise.reject(nextStream)
          : Promise.resolve(nextStream)),
      },
    },
    JSON,
  };
  world.window = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    dispatchEvent: (ev) => { events.push({ type: ev.type, detail: JSON.parse(ev.detail) }); },
  };
  vm.createContext(world);
  vm.runInContext(CAPTURE_MAINWORLD_SOURCE, world);
  return {
    events, world, FakeTrack, FakeStream,
    setNext: (v) => { nextStream = v; },
    gum: (constraints) => world.navigator.mediaDevices.getUserMedia(constraints),
    stopRequest: () => listeners.get('blanc:capture-stop-request')({}),
  };
}

const last = (arr) => arr[arr.length - 1];

test('resolved gUM emits the live snapshot BEFORE its settlement (no off-flicker)', async () => {
  // Order matters: main confirms the anchor on settlement, after which counts
  // carry the truth. Counts must already be there or the chip blinks off
  // between the two IPC messages.
  const w = makeWorld();
  w.setNext(new w.FakeStream([new w.FakeTrack('audio')]));
  await w.gum({ audio: true });
  assert.deepEqual(w.events[w.events.length - 2].detail,
    { type: 'snapshot', audioLive: 1, videoLive: 0 });
  assert.deepEqual(last(w.events).detail,
    { type: 'settlement', outcome: 'resolved', scopes: ['audio'] });
});

test('rejected gUM emits a rejected settlement', async () => {
  const w = makeWorld();
  w.setNext(new Error('NotFoundError'));
  await w.gum({ audio: true, video: true }).catch(() => {});
  assert.deepEqual(last(w.events).detail,
    { type: 'settlement', outcome: 'rejected', scopes: ['audio', 'video'] });
});

test('track.stop() is observed even though it fires no ended event', async () => {
  const w = makeWorld();
  const track = new w.FakeTrack('audio');
  w.setNext(new w.FakeStream([track]));
  const stream = await w.gum({ audio: true });
  stream.getTracks()[0].stop();
  assert.deepEqual(last(w.events).detail, { type: 'snapshot', audioLive: 0, videoLive: 0 });
});

test('cloned tracks stay counted; stopping the original is not enough', async () => {
  const w = makeWorld();
  const track = new w.FakeTrack('audio');
  w.setNext(new w.FakeStream([track]));
  const stream = await w.gum({ audio: true });
  const clone = stream.getTracks()[0].clone();
  stream.getTracks()[0].stop();
  assert.deepEqual(last(w.events).detail, { type: 'snapshot', audioLive: 1, videoLive: 0 });
  clone.stop();
  assert.deepEqual(last(w.events).detail, { type: 'snapshot', audioLive: 0, videoLive: 0 });
});

test('stop-request stops every registered track and reports zero', async () => {
  const w = makeWorld();
  w.setNext(new w.FakeStream([new w.FakeTrack('audio'), new w.FakeTrack('video')]));
  await w.gum({ audio: true, video: true });
  w.stopRequest();
  assert.deepEqual(last(w.events).detail, { type: 'snapshot', audioLive: 0, videoLive: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/capture-mainworld.test.js`
Expected: FAIL — `Cannot find module '../../src/main/capture-mainworld'`

- [ ] **Step 3: Write the implementation**

```js
// src/main/capture-mainworld.js
// The main-world capture instrumentation, exported as a source string so the
// preload can inject it with webFrame.executeJavaScript and unit tests can
// vm-run it against doubles. SECURITY NOTE (spec §9): everything in here runs
// in the page's world and is forgeable by the page. Its reports REFINE
// DISPLAY STATE toward off; they are not security truth. The unspoofable
// on-signal is the main-process permission grant; macOS's system capture
// indicator is the authoritative malicious-page backstop.
const CAPTURE_MAINWORLD_SOURCE = `(() => {
  if (navigator.__blancCapturePatched) return;
  Object.defineProperty(navigator, '__blancCapturePatched', { value: true });

  const registered = new Set();

  const emit = (payload) => {
    try {
      window.dispatchEvent(new CustomEvent('blanc:capture-report', {
        detail: JSON.stringify(payload),
      }));
    } catch {}
  };

  const snapshot = () => {
    let audioLive = 0;
    let videoLive = 0;
    for (const track of registered) {
      if (track.readyState !== 'live') continue;
      if (track.kind === 'audio') audioLive += 1;
      else if (track.kind === 'video') videoLive += 1;
    }
    emit({ type: 'snapshot', audioLive, videoLive });
  };

  const register = (track) => {
    if (!track || registered.has(track)) return;
    registered.add(track);
    try { track.addEventListener('ended', snapshot); } catch {}
  };

  const scopesOf = (constraints) => {
    const scopes = [];
    if (constraints && constraints.audio) scopes.push('audio');
    if (constraints && constraints.video) scopes.push('video');
    return scopes;
  };

  // stop() fires no 'ended' event — it must be patched to be seen at all.
  const trackStop = MediaStreamTrack.prototype.stop;
  MediaStreamTrack.prototype.stop = function stop(...args) {
    const result = trackStop.apply(this, args);
    if (registered.has(this)) snapshot();
    return result;
  };
  const trackClone = MediaStreamTrack.prototype.clone;
  MediaStreamTrack.prototype.clone = function clone(...args) {
    const copy = trackClone.apply(this, args);
    if (registered.has(this)) { register(copy); snapshot(); }
    return copy;
  };
  const streamClone = MediaStream.prototype.clone;
  MediaStream.prototype.clone = function clone(...args) {
    const copy = streamClone.apply(this, args);
    let tracked = false;
    for (const track of this.getTracks()) if (registered.has(track)) tracked = true;
    if (tracked) { for (const track of copy.getTracks()) register(track); snapshot(); }
    return copy;
  };

  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = function getUserMedia(constraints, ...rest) {
    return gum(constraints, ...rest).then((stream) => {
      for (const track of stream.getTracks()) register(track);
      // Snapshot FIRST: the settlement confirms the grant anchor in main,
      // after which the frame counts carry the truth — they must already be
      // nonzero or the chip blinks off between the two messages.
      snapshot();
      emit({ type: 'settlement', outcome: 'resolved', scopes: scopesOf(constraints) });
      return stream;
    }, (err) => {
      emit({ type: 'settlement', outcome: 'rejected', scopes: scopesOf(constraints) });
      throw err;
    });
  };

  window.addEventListener('blanc:capture-stop-request', () => {
    for (const track of registered) { try { track.stop(); } catch {} }
    snapshot();
  });

  window.addEventListener('pagehide', () => {
    emit({ type: 'snapshot', audioLive: 0, videoLive: 0 });
  });
})();`;

module.exports = { CAPTURE_MAINWORLD_SOURCE };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/capture-mainworld.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/capture-mainworld.js test/unit/capture-mainworld.test.js
git commit -m "feat: main-world capture instrumentation source (stop/clone patches, snapshots)"
```

---

### Task 3: Grant observer in permissions.js

**Files:**
- Modify: `src/main/permissions.js`
- Test: `test/unit/capture-grant-observer.test.js`

**Interfaces:**
- Produces: `setCaptureGrantObserver(fn)` export; `fn` receives
  `{requestingWebContents, mediaTypes, requestingUrl, isMainFrame}` on
  **every** allowed `media` request — stored-allow path and prompt path.
  Consumed by Task 5.

- [ ] **Step 1: Write the failing test** (mirror `private-permissions.test.js`'s fake-session idiom)

```js
// test/unit/capture-grant-observer.test.js
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  setupPermissionPolicy, setPermissionPrompter, setCaptureGrantObserver,
} = require('../../src/main/permissions');

function fakeSession() {
  const session = {};
  session.setPermissionRequestHandler = (fn) => { session.request = fn; };
  session.setPermissionCheckHandler = (fn) => { session.check = fn; };
  session.setDisplayMediaRequestHandler = (fn) => { session.display = fn; };
  return session;
}
const request = (session, permission, details) =>
  new Promise((resolve) => session.request({ id: 7 }, permission, resolve, details));

test('grant observer fires on the prompt path AND the stored-allow path', async (t) => {
  setPermissionPrompter(async () => true);
  const grants = [];
  setCaptureGrantObserver((grant) => grants.push(grant));
  t.after(() => { setPermissionPrompter(null); setCaptureGrantObserver(null); });

  const ses = fakeSession();
  setupPermissionPolicy(ses, { persistDecisions: false });

  const details = { requestingUrl: 'https://meet.example/room', mediaTypes: ['audio'], isMainFrame: true };
  await request(ses, 'media', details);   // prompt path
  await request(ses, 'media', details);   // stored-allow path (no second prompt)
  assert.equal(grants.length, 2, 'every allowed media request notifies, prompted or remembered');
  assert.deepEqual(grants[1].mediaTypes, ['audio']);
  assert.equal(grants[1].requestingUrl, 'https://meet.example/room');
  assert.equal(grants[1].isMainFrame, true);
  assert.equal(grants[1].requestingWebContents.id, 7);
});

test('denials and non-media permissions never notify', async (t) => {
  setPermissionPrompter(async () => false);
  const grants = [];
  setCaptureGrantObserver((grant) => grants.push(grant));
  t.after(() => { setPermissionPrompter(null); setCaptureGrantObserver(null); });

  const ses = fakeSession();
  setupPermissionPolicy(ses, { persistDecisions: false });
  await request(ses, 'media', { requestingUrl: 'https://a.example/', mediaTypes: ['audio'] });
  await request(ses, 'fullscreen', { requestingUrl: 'https://a.example/' }); // AUTO_ALLOWED
  assert.equal(grants.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/capture-grant-observer.test.js`
Expected: FAIL — `setCaptureGrantObserver is not a function`

- [ ] **Step 3: Implement in permissions.js**

Below the `prompter` declaration (`permissions.js:31-33`), add:

```js
/** Capture-indicator hook (spec §3.1): notified on EVERY allowed `media`
 * request — the unspoofable off→on signal. Display refinement only ever
 * flows the other way (capture-state.js). */
let captureGrantObserver = null;
function setCaptureGrantObserver(fn) { captureGrantObserver = fn; }
const notifyCaptureGrant = (wc, permission, mediaTypes, details) => {
  if (permission !== 'media' || !captureGrantObserver) return;
  captureGrantObserver({
    requestingWebContents: wc,
    mediaTypes,
    requestingUrl: details?.requestingUrl ?? null,
    isMainFrame: details?.isMainFrame !== false,
  });
};
```

In the request handler, notify on **both** allow paths (and only those):

```js
    if (saved.some((decision) => decision === 'deny')) return callback(false);
    if (saved.every((decision) => decision === 'allow')) {
      notifyCaptureGrant(wc, permission, mediaTypes, details);
      return callback(true);
    }
    if (!prompter) return callback(false);
```

and after the prompt answer:

```js
    if (allow === null) return callback(false);
    saveDecision(origin, permission, mediaTypes, allow);
    if (allow) notifyCaptureGrant(wc, permission, mediaTypes, details);
    callback(allow);
```

Export it: `module.exports = { setupPermissionPolicy, setPermissionPrompter, setCaptureGrantObserver, listDecisions, removeDecision };`

- [ ] **Step 4: Run tests to verify they pass (and no regression)**

Run: `node --test test/unit/capture-grant-observer.test.js test/unit/private-permissions.test.js`
Expected: PASS (both files)

- [ ] **Step 5: Commit**

```bash
git add src/main/permissions.js test/unit/capture-grant-observer.test.js
git commit -m "feat: capture grant observer on every allowed media request"
```

---

### Task 4: Quiet Tabs exclusion

**Files:**
- Modify: `src/main/tab-sleep.js:69`
- Test: `test/unit/tab-sleep.test.js` (the eligibility table at ~:115 and ~:147)

**Interfaces:**
- Consumes: `tab.capturing` — a boolean mirrored onto the tab record by Task 5's projection updates.
- Produces: capturing tabs are never sleep candidates.

- [ ] **Step 1: Add the failing table row**

In `test/unit/tab-sleep.test.js`, the baseline eligible-tab fixture (~line 115) gains `capturing: false,` and the exclusion table (~line 147, `['audible', true], ['muted', true], ['usedMedia', true], …`) gains a row:

```js
  ['capturing', true],
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tab-sleep.test.js`
Expected: FAIL on the new `capturing` row (a capturing tab is still selected)

- [ ] **Step 3: Implement the exclusion**

`src/main/tab-sleep.js:69` becomes:

```js
    if (tab.audible || tab.muted || tab.usedMedia || tab.capturing || tab.pinned) return;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tab-sleep.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/tab-sleep.js test/unit/tab-sleep.test.js
git commit -m "feat: capturing tabs are never quiet-tab candidates"
```

---

### Task 5: Main-process wiring (records, preload, IPC validation, broadcast)

**Files:**
- Create: `src/main/capture-preload.js`
- Modify: `src/main/main.js` (grant observer, `capture:report` handler, record lifecycle, broadcast projection, preload registration, `sleepTab` recheck)
- Modify: `src/main/tab-view.js` (popup registry hook, renderer-gone clear)

**Interfaces:**
- Consumes: Task 1's reducer, Task 2's source, Task 3's observer.
- Produces (relied on by Tasks 7–10):
  - `tab.captureRecord` (reducer record, lazily created) and `tab.capturing`/`tab.capture = {audio, video}` mirrors refreshed by `refreshCaptureProjection(surface)`.
  - Process-wide `popupCaptures: Map<wcId, {record, wc}>` in main.js.
  - `tabs:updated` payload additions: per-row `capture: {audio, video}`; top-level `captureChip: {audio, video}` (union incl. popups) and `capturePopover: {rows: [{surfaceId, host, audio, video, kind: 'tab'|'popup'}]}` where `surfaceId` is `tab.id` or `` `popup:${wcId}` ``.
  - `stopCaptureSurface(surfaceId)` and `focusCaptureSurface(surfaceId)` in main.js.

- [ ] **Step 1: Write the preload**

```js
// src/main/capture-preload.js
// Session-wide preload relaying main-world capture instrumentation to main
// (spec §4). Separate file from chrome-compat-preload.js on purpose: that
// script's documented property is that it exposes NO IPC; this one does, and
// it is the only thing it does. Per the §4.1 spike this only ever runs in
// main frames on our configuration; the guard makes that explicit.
const { ipcRenderer, webFrame } = require('electron');
const { CAPTURE_MAINWORLD_SOURCE } = require('./capture-mainworld');

if (process.isMainFrame) {
  window.addEventListener('blanc:capture-report', (event) => {
    if (typeof event.detail !== 'string' || event.detail.length > 512) return;
    ipcRenderer.send('capture:report', event.detail);
  });
  ipcRenderer.on('capture:stop', () => {
    window.dispatchEvent(new CustomEvent('blanc:capture-stop-request'));
  });
  webFrame.executeJavaScript(CAPTURE_MAINWORLD_SOURCE).catch(() => {});
}
```

- [ ] **Step 2: Register it and wire main.js**

All in `src/main/main.js`:

**(a) Registration** — in the existing loop at ~`main.js:3856` (find with `grep -n "chrome-compat-preload" src/main/main.js`), add alongside the compat preload:

```js
    browsingSession.registerPreloadScript({
      type: 'frame',
      filePath: path.join(__dirname, 'capture-preload.js'),
    });
```

**(b) State + helpers** — near the `tabs` Map declarations, add:

```js
const {
  createCaptureRecord, applyGrant, applySettlement, applyFrameReport,
  projection: captureProjection, clearRecord: clearCaptureRecord,
} = require('./capture-state');
const CAPTURE_STOP_TIMEOUT_MS = 1500;
// Auxiliary popups are capture surfaces too (spec §3.3). PROCESS-WIDE and
// deliberately not runtime-owned: detachWindow wipes auxiliaryOwner on macOS
// window close, but an outlivesOpener popup keeps capturing across it.
const popupCaptures = new Map(); // wcId -> { record, wc }

// READ-ONLY resolution: never creates a record. Only the grant observer
// (ensureCaptureSurfaceForSender) may create one — grant-only off→on means
// an unsolicited report must find nothing to write into.
function captureSurfaceForSender(wc) {
  const tab = tabs.get(tabIdByWebContentsId.get(wc.id));
  if (tab) {
    return tab.captureRecord
      ? { kind: 'tab', tab, record: tab.captureRecord, wc: liveContents(tab) }
      : null;
  }
  const popup = popupCaptures.get(wc.id);
  return popup ? { kind: 'popup', record: popup.record, wc: popup.wc } : null;
}

function ensureCaptureSurfaceForSender(wc) {
  const tab = tabs.get(tabIdByWebContentsId.get(wc.id));
  if (tab) {
    if (!tab.captureRecord) tab.captureRecord = createCaptureRecord();
    return { kind: 'tab', tab, record: tab.captureRecord, wc: liveContents(tab) };
  }
  const popup = popupCaptures.get(wc.id);
  return popup ? { kind: 'popup', record: popup.record, wc: popup.wc } : null;
}

function refreshCaptureProjection(surface) {
  const p = captureProjection(surface.record);
  if (surface.kind === 'tab') {
    surface.tab.capture = p;
    surface.tab.capturing = p.audio || p.video;
  }
  scheduleBroadcastTabs();
}

function clearCaptureState(surface) {
  clearCaptureRecord(surface.record);
  refreshCaptureProjection(surface);
}
```

**(c) Grant observer** — next to `setPermissionPrompter(...)` (~`main.js:3925`):

```js
  setCaptureGrantObserver(({ requestingWebContents, mediaTypes, requestingUrl, isMainFrame }) => {
    if (!requestingWebContents) return;
    const surface = ensureCaptureSurfaceForSender(requestingWebContents);
    if (!surface) return;
    let origin = null;
    try { origin = new URL(requestingUrl).origin; } catch { return; }
    applyGrant(surface.record, { scopes: mediaTypes, origin, isMainFrame });
    refreshCaptureProjection(surface);
  });
```

(Import `setCaptureGrantObserver` in the existing `require('./permissions')` destructuring at `main.js:30`.)

**(d) Report validation** — with the other `ipcMain.on` registrations:

```js
  // Reports/settlements REFINE DISPLAY STATE toward off (spec §9) — they are
  // not security truth; the macOS system indicator is the malicious-page
  // backstop. Sender identity comes from the event, never the payload.
  ipcMain.on('capture:report', (event, raw) => {
    const surface = captureSurfaceForSender(event.sender); // read-only: never creates
    // Grant-only off→on: a surface with no anchor — never granted, or cleared
    // by navigation — accepts no reports at all, so fabricated counts can't
    // light the chip.
    if (!surface || surface.record.anchors.length === 0) return;
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    const frame = event.senderFrame;
    if (!frame) return;
    let origin = null;
    try { origin = new URL(frame.url).origin; } catch { return; }
    const isMainFrame = frame === event.sender.mainFrame;
    if (payload.type === 'settlement'
        && (payload.outcome === 'resolved' || payload.outcome === 'rejected')
        && Array.isArray(payload.scopes)) {
      applySettlement(surface.record, {
        origin, isMainFrame, outcome: payload.outcome, scopes: payload.scopes,
      });
    } else if (payload.type === 'snapshot') {
      applyFrameReport(surface.record, frame.frameToken ?? `${event.sender.id}:main`, {
        origin, isMainFrame,
        audioLive: payload.audioLive, videoLive: payload.videoLive,
      });
    } else return;
    refreshCaptureProjection(surface);
  });
```

**(e) Lifecycle clears** — in `onMainFrameCommit` (where `tab.usedMedia = false` lives, ~`main.js:2385`):

```js
  if (tab.captureRecord) clearCaptureState({ kind: 'tab', tab, record: tab.captureRecord });
```

In the tab renderer-gone handler (find with `grep -n "render-process-gone" src/main/tab-view.js src/main/main.js` — the per-tab wiring, not sleepTab's temporary listener) and in `closeTab`, apply the same clear. Also add `capture: { audio: false, video: false }, capturing: false, captureRecord: null,` to the tab-record literal at ~`main.js:2526` (beside `usedMedia`).

**(f) sleepTab recheck** — extend the synchronous post-probe guard (the comment "validate synchronously immediately before teardown", ~`main.js:758`):

```js
  if (!tabs.has(id) || id === rt().activeTabId || tab.navEpoch !== epochAtProbe
      || tab.isLoading || tab.sleeping || tab.capturing || !liveContents(tab)) return false;
```

**(g) Broadcast projection** — in the function that builds the `tabs:updated` payload (find with `grep -n "shieldPopover" src/main/main.js` to locate the payload assembly), add per-row `capture: tab.capture ?? { audio: false, video: false }`, plus:

```js
  const captureRows = [];
  for (const tab of orderedTabs) {
    if (tab.capture?.audio || tab.capture?.video) {
      captureRows.push({
        surfaceId: tab.id, host: hostOf(tab.url), kind: 'tab',
        audio: !!tab.capture.audio, video: !!tab.capture.video,
      });
    }
  }
  for (const [wcId, popup] of popupCaptures) {
    const p = captureProjection(popup.record);
    if (!p.audio && !p.video) continue;
    let host = '';
    try { host = new URL(popup.wc.getURL()).host; } catch {}
    captureRows.push({ surfaceId: `popup:${wcId}`, host, kind: 'popup', audio: p.audio, video: p.video });
  }
  payload.captureChip = {
    audio: captureRows.some((row) => row.audio),
    video: captureRows.some((row) => row.video),
  };
  payload.capturePopover = { rows: captureRows };
```

(`hostOf` — reuse the existing host-derivation helper next to the shield payload; if none is factored out, `try { return new URL(url).host } catch { return '' }` inline.)

**(h) Popup registry** — in `src/main/tab-view.js`'s `did-create-window` handler (~`tab-view.js:317`), alongside `registerAuxiliaryContent`:

```js
        deps.registerPopupCaptureSurface(childWc);
```

and in main.js's tab-view deps object (find with `grep -n "setupPages\|initTabView\|wireTabView" src/main/main.js` for where deps are supplied), provide:

```js
  registerPopupCaptureSurface(wc) {
    popupCaptures.set(wc.id, { record: createCaptureRecord(), wc });
    const drop = () => { popupCaptures.delete(wc.id); scheduleBroadcastTabs(); };
    const wipe = () => {
      const popup = popupCaptures.get(wc.id);
      if (popup) { clearCaptureRecord(popup.record); scheduleBroadcastTabs(); }
    };
    wc.once('destroyed', drop);
    wc.on('render-process-gone', wipe);
    wc.on('did-navigate', wipe);
  },
```

**(i) Stop/focus** — near the shield popover handlers:

```js
  function resolveCaptureSurface(surfaceId) {
    if (typeof surfaceId === 'string' && surfaceId.startsWith('popup:')) {
      const popup = popupCaptures.get(Number(surfaceId.slice(6)));
      return popup && !popup.wc.isDestroyed()
        ? { kind: 'popup', record: popup.record, wc: popup.wc } : null;
    }
    const tab = tabs.get(surfaceId);
    const wc = liveContents(tab);
    // Read-only here too: a surface without a record has nothing to stop.
    return tab && wc && tab.captureRecord
      ? { kind: 'tab', tab, record: tab.captureRecord, wc } : null;
  }

  function stopCaptureSurface(surfaceId) {
    const surface = resolveCaptureSurface(surfaceId);
    if (!surface) return;
    // Token the timeout on the record's generation: if this capture clears
    // and a NEW call starts inside the window (grant bumps generation), the
    // stale timer must not reload the new call out from under the user.
    const generation = surface.record.generation;
    for (const frame of surface.wc.mainFrame.framesInSubtree) {
      try { frame.send('capture:stop'); } catch {}
    }
    // The chip stays lit until truth clears it: a confirmed stop arrives as
    // ordinary zero snapshots; an uninstrumented surface gets reloaded and
    // clears on the reload's main-frame commit (spec §5).
    setTimeout(() => {
      if (surface.record.generation !== generation) return;
      const p = captureProjection(surface.record);
      if ((p.audio || p.video) && !surface.wc.isDestroyed()) surface.wc.reload();
    }, CAPTURE_STOP_TIMEOUT_MS);
  }

  function focusCaptureSurface(surfaceId) {
    const surface = resolveCaptureSurface(surfaceId);
    if (!surface) return;
    if (surface.kind === 'tab') setActiveTab(surface.tab.id);
    else BrowserWindow.fromWebContents(surface.wc)?.focus();
  }
```

- [ ] **Step 3: Static regression check**

Run: `npm run test:unit`
Expected: PASS (no existing test regresses; the new wiring is exercised in Step 4 and Task 10)

- [ ] **Step 4: Manual smoke (real capture)**

1. Relaunch: kill any running dev instance, `npm start`.
2. Visit `https://webrtc.github.io/samples/src/content/getusermedia/gum/`, click "Open camera", **Allow**.
3. In the dev instance's main-process console, temporarily verify via test hook or logging that the tab's `capture` projection is `{audio: false, video: true}` (video-only must not light audio).
4. Navigate the tab away → projection clears.
Expected: projection follows grant → live → clear; `capture:report` arrives (add a temporary `console.debug` if needed, remove before commit).

- [ ] **Step 5: Commit**

```bash
git add src/main/capture-preload.js src/main/main.js src/main/tab-view.js
git commit -m "feat: wire capture records, grant observer, report validation, popup surfaces"
```

---

### Task 6: Popover bounds (pure layout)

**Files:**
- Modify: `src/main/chrome-layout.js`
- Test: `test/unit/chrome-layout.test.js`

**Interfaces:**
- Produces: `calculateCaptureBounds({windowWidth, stripHeight, anchorRight, rowCount}) -> {x, y, width, height}` and exported constants `CAPTURE_POPOVER_WIDTH`, `CAPTURE_ROW_HEIGHT = 44`, `CAPTURE_POPOVER_CHROME = 56`, `CAPTURE_POPOVER_MAX_ROWS = 5`. Consumed by Task 8's `overlayBounds()`.

- [ ] **Step 1: Write the failing tests** (append to `test/unit/chrome-layout.test.js`, matching its existing style)

```js
test('calculateCaptureBounds grows per row and caps at 5 rows', () => {
  const base = { windowWidth: 1200, stripHeight: 64, anchorRight: 900 };
  const one = calculateCaptureBounds({ ...base, rowCount: 1 });
  const three = calculateCaptureBounds({ ...base, rowCount: 3 });
  const nine = calculateCaptureBounds({ ...base, rowCount: 9 });
  assert.equal(one.height, CAPTURE_POPOVER_CHROME + CAPTURE_ROW_HEIGHT);
  assert.equal(three.height, CAPTURE_POPOVER_CHROME + 3 * CAPTURE_ROW_HEIGHT);
  assert.equal(nine.height, CAPTURE_POPOVER_CHROME + 5 * CAPTURE_ROW_HEIGHT,
    'more than 5 rows scroll inside a capped card');
  assert.equal(one.y, 64);
  assert.equal(one.x + one.width, 900, 'right edge aligns to the chip anchor');
});

test('calculateCaptureBounds clamps inside the window like the shield popover', () => {
  const b = calculateCaptureBounds({ windowWidth: 300, stripHeight: 64, anchorRight: 900, rowCount: 1 });
  assert.ok(b.x >= 0 && b.x + b.width <= 300);
});
```

(Import the new names in the test file's existing `require` of `chrome-layout`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/chrome-layout.test.js`
Expected: FAIL — `calculateCaptureBounds is not a function`

- [ ] **Step 3: Implement** (below `calculateShieldBounds`, `chrome-layout.js:146`)

```js
const CAPTURE_POPOVER_WIDTH = SHIELD_POPOVER_WIDTH;
const CAPTURE_ROW_HEIGHT = 44;
const CAPTURE_POPOVER_CHROME = 56; // header + card padding
const CAPTURE_POPOVER_MAX_ROWS = 5;

/**
 * Bounds for the 'capture' overlay mode: same anchoring rules as the shield
 * popover, but height tracks the row count, capped at 5 visible rows (the
 * list scrolls beyond that — spec §6.2).
 */
function calculateCaptureBounds({ windowWidth, stripHeight, anchorRight, rowCount }) {
  const winWidth = dimension(windowWidth);
  const width = Math.min(CAPTURE_POPOVER_WIDTH, Math.max(0, winWidth - SHIELD_POPOVER_MARGIN * 2));
  const rows = Math.max(1, Math.min(CAPTURE_POPOVER_MAX_ROWS, rowCount | 0));
  const right = Number.isFinite(anchorRight)
    ? Math.round(anchorRight)
    : Math.round((winWidth + width) / 2);
  const x = Math.max(
    SHIELD_POPOVER_MARGIN,
    Math.min(right - width, winWidth - width - SHIELD_POPOVER_MARGIN)
  );
  return {
    x, y: dimension(stripHeight), width,
    height: CAPTURE_POPOVER_CHROME + rows * CAPTURE_ROW_HEIGHT,
  };
}
```

Add all four constants + the function to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/chrome-layout.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/chrome-layout.js test/unit/chrome-layout.test.js
git commit -m "feat: capture popover bounds (row-tracked height, 5-row cap)"
```

---

### Task 7: Pill chip + permission-bar glyph (chrome strip)

**Files:**
- Modify: `src/renderer/index.html` (chip between `#pillSourceChip` and `#pillShield`; glyph in `#permissionBar`)
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/renderer.js`
- Modify: `src/main/preload.js`

**Interfaces:**
- Consumes: `state.captureChip` from Task 5's broadcast; `permissions:prompt` payload's `mediaTypes` (already sent).
- Produces: `browserAPI.openCapturePopover({right})` → `ipcRenderer.send('chrome:open-capture', anchor)` (handled in Task 8).

- [ ] **Step 1: Markup** — in `index.html`, insert between `#pillSourceChip` and `#pillShield`:

```html
        <button id="pillCapture" class="capture-chip" type="button" aria-expanded="false" hidden>
          <svg id="pillCaptureMic" viewBox="0 0 16 16" aria-hidden="true" hidden>
            <rect x="6" y="2.2" width="4" height="7" rx="2"/>
            <path d="M3.8 8.2a4.2 4.2 0 0 0 8.4 0M8 12.4v1.8"/>
          </svg>
          <svg id="pillCaptureCam" viewBox="0 0 16 16" aria-hidden="true" hidden>
            <rect x="2.2" y="4.6" width="8.2" height="6.8" rx="1.6"/>
            <path d="M10.4 7.2l3.4-1.8v5.2l-3.4-1.8z"/>
          </svg>
        </button>
```

and inside `#permissionBar`, before `#permissionText`:

```html
      <span id="permissionGlyphs" aria-hidden="true" hidden>
        <svg id="permGlyphMic" viewBox="0 0 16 16" hidden>
          <rect x="6" y="2.2" width="4" height="7" rx="2"/>
          <path d="M3.8 8.2a4.2 4.2 0 0 0 8.4 0M8 12.4v1.8"/>
        </svg>
        <svg id="permGlyphCam" viewBox="0 0 16 16" hidden>
          <rect x="2.2" y="4.6" width="8.2" height="6.8" rx="1.6"/>
          <path d="M10.4 7.2l3.4-1.8v5.2l-3.4-1.8z"/>
        </svg>
      </span>
```

- [ ] **Step 2: Styles** — in `styles.css`, next to `.shield` (~:936):

```css
/* Live-capture chip: same anatomy as the shield, but the one pill state
   that earns an alarm color (--danger) — steady, no pulse, no count. */
.capture-chip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 24px;
  height: 24px;
  padding: 0 2px;
  border: none;
  border-radius: 12px;
  background: none;
  color: var(--danger);
  flex: 0 0 auto;
  cursor: pointer;
}
.capture-chip:hover { background: var(--border); }
.capture-chip svg {
  display: block;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex: 0 0 auto;
}
#permissionGlyphs { display: inline-flex; gap: 4px; align-items: center; }
#permissionGlyphs svg {
  width: 16px; height: 16px; fill: none; stroke: currentColor;
  stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round;
}
```

- [ ] **Step 3: Renderer wiring** — in `renderer.js`:

Element refs beside `pillShield` (~:19):

```js
  const pillCapture = document.getElementById('pillCapture');
  const pillCaptureMic = document.getElementById('pillCaptureMic');
  const pillCaptureCam = document.getElementById('pillCaptureCam');
  const permissionGlyphs = document.getElementById('permissionGlyphs');
  const permGlyphMic = document.getElementById('permGlyphMic');
  const permGlyphCam = document.getElementById('permGlyphCam');
```

In `render()`, beside the shield chip block (~:505):

```js
    // Capture chip: WINDOW-WIDE — lit while any tab or popup captures
    // (spec §6.1), unlike every per-active-tab neighbour in the pill.
    const cap = state.captureChip ?? { audio: false, video: false };
    pillCapture.hidden = !cap.audio && !cap.video;
    pillCaptureMic.hidden = !cap.audio;
    pillCaptureCam.hidden = !cap.video;
    const capTitle = cap.audio && cap.video ? 'camera & microphone in use'
      : cap.video ? 'camera in use' : 'microphone in use';
    pillCapture.title = `${capTitle} — open capture controls`;
    pillCapture.setAttribute('aria-label', `${capTitle} — open capture controls`);
```

Click handler beside `pillShield`'s (~:544):

```js
  pillCapture.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = pillCapture.getBoundingClientRect();
    window.browserAPI.openCapturePopover({ right: r.right });
  });
```

In `onIslandState` (~:623), truthful expanded state + Escape focus restore:

```js
    pillCapture.setAttribute('aria-expanded', String(mode === 'capture'));
    if (restoreTrigger === 'capture') pillCapture.focus();
```

In `showNextPermissionPrompt` (~:590):

```js
    if (activePermissionPrompt) {
      const host = new URL(activePermissionPrompt.origin).host;
      permissionText.textContent = `${host} wants to ${describePermission(activePermissionPrompt)}`;
      const isMedia = activePermissionPrompt.permission === 'media';
      permissionGlyphs.hidden = !isMedia;
      permGlyphMic.hidden = !(isMedia && activePermissionPrompt.mediaTypes.includes('audio'));
      permGlyphCam.hidden = !(isMedia && activePermissionPrompt.mediaTypes.includes('video'));
    }
```

- [ ] **Step 4: Preload API** — in `src/main/preload.js`, beside `openShieldPopover` (:70):

```js
  openCapturePopover: (anchor) => ipcRenderer.send('chrome:open-capture', anchor),
```

- [ ] **Step 5: Manual verify (needs Task 8 for click; chip itself is testable now)**

Relaunch (`npm start`), grant mic on `https://webrtc.github.io/samples/src/content/getusermedia/audio/`. Expected: red mic glyph appears between domain and shield; prompt bar showed a mic glyph; switching to another tab keeps the chip lit (window-wide); navigating the capturing tab away clears it. Check dark mode (`/theme`).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css src/renderer/renderer.js src/main/preload.js
git commit -m "feat: capture chip in the pill + permission-bar media glyphs"
```

---

### Task 8: Capture popover (overlay mode, open/dismiss, stop/focus)

**Files:**
- Modify: `src/main/main.js` (`chrome:open-capture` handler, `overlayBounds()`, runtime fields, dismissal, auto-hide)
- Modify: `src/main/window-runtime-registry.js` (JSDoc + `captureAnchorRight` field)
- Modify: `src/renderer/overlay.html`, `src/renderer/overlay.js`, `src/renderer/styles.css`
- Modify: `src/main/preload.js` (overlay-side actions)

**Interfaces:**
- Consumes: Task 5's `stopCaptureSurface`/`focusCaptureSurface` + `state.capturePopover.rows`; Task 6's `calculateCaptureBounds`.
- Produces: `overlayMode: 'capture'`; `browserAPI.captureStop(surfaceId)` → `ipcRenderer.send('chrome:capture-stop', surfaceId)`; `browserAPI.captureFocus(surfaceId)` → `ipcRenderer.send('chrome:capture-focus', surfaceId)`.

- [ ] **Step 1: Runtime + bounds + open/dismiss in main.js**

`window-runtime-registry.js`: extend the `overlayMode` JSDoc union to `'panel' | 'palette' | 'find' | 'shield' | 'capture'` and add `captureAnchorRight: null,` beside `shieldAnchorRight` (`:39`), clearing it in `detachWindow` is unnecessary (it's per-open), but reset it in `hideOverlay` alongside shield's anchor if shield does so (mirror exactly — check with `grep -n "shieldAnchorRight" src/main/main.js`).

`overlayBounds()` (~`main.js:1327`) gains:

```js
  if (rt().overlayMode === 'capture') {
    return calculateCaptureBounds({
      windowWidth: rt().window.getContentBounds().width,   // mirror the shield branch's exact source of windowWidth
      stripHeight: rt().chromeHeight,
      anchorRight: rt().captureAnchorRight,
      rowCount: lastCaptureRowCount(),
    });
  }
```

where `lastCaptureRowCount()` counts the current broadcast's `capturePopover.rows.length` (factor the row assembly from Task 5(g) so both call sites share it). Import `calculateCaptureBounds` in the `chrome-layout` require at `main.js:81`.

Open handler beside `chrome:open-shield` (~`main.js:3234`):

```js
  chromeOn('chrome:open-capture', (_e, anchor) => {
    if (rt().overlayMode === 'capture') { hideOverlay({ refocusContent: false }); return; } // re-click toggles
    rt().captureAnchorRight = Number.isFinite(anchor?.right) ? anchor.right : null;
    showOverlay('capture');
  });
  chromeOn('chrome:capture-stop', (_e, surfaceId) => stopCaptureSurface(surfaceId));
  chromeOn('chrome:capture-focus', (_e, surfaceId) => { hideOverlay({ refocusContent: false }); focusCaptureSurface(surfaceId); });
```

Dismissals: add `'capture'` wherever `'shield'` dismisses — tab switch (`main.js:2599`: `overlayMode === 'find' || overlayMode === 'shield'` → include `'capture'`), overlay blur (the guard at ~`main.js:1412` currently limits blur-dismiss to panel/palette — extend to `'capture'`), Escape (generic, already covered), and Escape focus-restore: where `closingTrigger` maps to `restoreTrigger` (~`main.js:1530`), have a closing `'capture'` mode send `restoreTrigger: 'capture'` on `chrome:island-state`. Auto-hide when the last row disappears: in `refreshCaptureProjection`/broadcast path, if `overlayMode === 'capture'` and the assembled rows are empty, `hideOverlay({ refocusContent: false })`. Also resize the open overlay when the row count changes (`rt().overlayView.setBounds(overlayBounds())` — mirror `main.js:1994`).

- [ ] **Step 2: Overlay markup + styles**

`overlay.html`, beside `#shieldPop`:

```html
  <section id="capturePop" class="capture-pop" hidden>
    <header class="capture-pop-head">in use</header>
    <ul id="capturePopRows" class="capture-pop-rows"></ul>
  </section>
```

`styles.css` (shared by strip and overlay):

```css
.capture-pop { padding: 10px 12px; }
.capture-pop-head { font-size: 11px; color: var(--text-dim); text-transform: lowercase; margin-bottom: 6px; }
.capture-pop-rows { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow-y: auto; } /* 5 * 44px */
.capture-pop-row { display: flex; align-items: center; gap: 8px; height: 44px; cursor: pointer; }
.capture-pop-row:hover { background: var(--accent-dim); }
.capture-pop-row .host { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.capture-pop-row svg {
  width: 16px; height: 16px; fill: none; stroke: var(--danger);
  stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; flex: 0 0 auto;
}
.capture-pop-stop {
  appearance: none; border: 1px solid var(--border); border-radius: 8px;
  background: none; color: var(--text); font: inherit; font-size: 11px;
  padding: 3px 8px; cursor: pointer;
}
.capture-pop-stop:hover { border-color: var(--danger); color: var(--danger); }
```

- [ ] **Step 3: Overlay renderer** — in `overlay.js`, mirror the shield section (`:1068`, `:1099`, `:1109`):

```js
  const capturePop = document.getElementById('capturePop');
  const capturePopRows = document.getElementById('capturePopRows');
  // Static glyph geometry, built via the namespace API — never innerHTML, so
  // row data (host names are site-controlled text) can't ever ride into
  // markup by a later edit.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MIC_SHAPES = [
    ['rect', { x: '6', y: '2.2', width: '4', height: '7', rx: '2' }],
    ['path', { d: 'M3.8 8.2a4.2 4.2 0 0 0 8.4 0M8 12.4v1.8' }],
  ];
  const CAM_SHAPES = [
    ['rect', { x: '2.2', y: '4.6', width: '8.2', height: '6.8', rx: '1.6' }],
    ['path', { d: 'M10.4 7.2l3.4-1.8v5.2l-3.4-1.8z' }],
  ];
  function captureGlyph(shapes) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    for (const [tag, attrs] of shapes) {
      const el = document.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
      svg.append(el);
    }
    return svg;
  }

  function renderCapturePopover() {
    const rows = state.capturePopover?.rows ?? [];
    capturePopRows.replaceChildren(...rows.map((row) => {
      const li = document.createElement('li');
      li.className = 'capture-pop-row';
      const scopeLabel = row.audio && row.video ? 'camera & microphone in use'
        : row.video ? 'camera in use' : 'microphone in use';
      const glyphs = document.createElement('span');
      if (row.audio) glyphs.append(captureGlyph(MIC_SHAPES));
      if (row.video) glyphs.append(captureGlyph(CAM_SHAPES));
      const host = document.createElement('span');
      host.className = 'host';
      host.textContent = row.host || 'popup window';
      const stop = document.createElement('button');
      stop.className = 'capture-pop-stop';
      stop.textContent = 'stop';
      stop.setAttribute('aria-label', `stop — ${row.host || 'popup window'} ${scopeLabel}`);
      stop.addEventListener('click', (e) => { e.stopPropagation(); window.browserAPI.captureStop(row.surfaceId); });
      li.append(glyphs, host, stop);
      li.setAttribute('role', 'button');
      li.tabIndex = 0;
      li.setAttribute('aria-label', `${row.host || 'popup window'} — ${scopeLabel}; go to it`);
      li.addEventListener('click', () => window.browserAPI.captureFocus(row.surfaceId));
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.browserAPI.captureFocus(row.surfaceId); }
      });
      return li;
    }));
  }
```

Wire the mode switch where `shieldPop.hidden = next !== 'shield'` lives (`:1068`): `capturePop.hidden = next !== 'capture';`, the focus branch (`:1099`): on `'capture'`, `renderCapturePopover()` then focus the first row's stop button (`capturePopRows.querySelector('.capture-pop-stop')?.focus()`); and re-render from the tabs-updated handler that refreshes `state.shieldPopover` (`:1109` neighborhood) when the mode is `'capture'`.

`preload.js` (the same `browserAPI` object, attached to both chrome docs):

```js
  captureStop: (surfaceId) => ipcRenderer.send('chrome:capture-stop', surfaceId),
  captureFocus: (surfaceId) => ipcRenderer.send('chrome:capture-focus', surfaceId),
```

- [ ] **Step 4: Manual verify**

Relaunch. With mic live on one tab and camera on another: chip shows both glyphs; click → popover lists both rows right-aligned under the chip; row click jumps to that tab and dismisses; **stop** on the gUM-samples tab ends capture within ~1.5 s *without* a reload (instrumented path — the page's own UI shows the track ended); Escape dismisses and refocuses the chip; opening with 6+ capturing tabs scrolls at 5 rows. Verify a `window.open` popup (from any site's pop-out control, or DevTools `window.open('https://webrtc.github.io/samples/src/content/getusermedia/audio/', '_blank', 'width=500,height=500')`) shows its own row, and its stop works.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js src/main/window-runtime-registry.js src/main/preload.js src/renderer/overlay.html src/renderer/overlay.js src/renderer/styles.css
git commit -m "feat: capture popover — per-surface rows, stop/focus, 5-row scroll cap"
```

---

### Task 9: Test hook + acceptance scenario

**Files:**
- Modify: `src/main/test-hook.js` (~:951, the `setQuietProtection` reasons; plus the tab-state serializer)
- Create/Modify: `spec/acceptance/capture-indicator.feature` (backlog-tagged)

**Interfaces:**
- Consumes: Task 1's `createCaptureRecord`/`applyGrant`; Task 5's `refreshCaptureProjection`.
- Produces: `__blanc` tab state includes `capture`; `setQuietProtection(id, 'capturing')` forces a capturing tab for sleep tests.

- [ ] **Step 1: Test hook** — add a reason branch beside `'used media'` (`test-hook.js:951`):

```js
      else if (reason === 'capturing') {
        tab.capturing = true;
        tab.capture = { audio: true, video: false };
      }
```

and include `capture: tab.capture ?? { audio: false, video: false }` in the redacted tab state the hook exposes (find the serializer with `grep -n "redacted" src/main/test-hook.js`).

- [ ] **Step 2: Backlog scenario** — match the backlog tag convention used by existing features (check with `grep -rn "@backlog" spec/acceptance/ | head -3` and copy it exactly):

```gherkin
Feature: Capture indicator
  A window-wide chip shows while any tab or popup captures the microphone
  or camera, with per-surface stop controls.

  @backlog
  Scenario: Mic capture lights the chip and stop clears it
    Given a tab whose site was granted microphone access
    When the site begins capturing audio
    Then the island pill shows the microphone-in-use chip
    When I stop capture for that site from the capture popover
    Then the microphone-in-use chip is hidden
```

- [ ] **Step 3: Verify dry-run + suite**

Run: `npm run test:acceptance:dry && npm run test:unit`
Expected: dry-run resolves (backlog scenarios parse, don't execute); units PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/test-hook.js spec/acceptance/capture-indicator.feature
git commit -m "test: capture state in test hook + backlog acceptance scenario"
```

---

### Task 10: Parity docs + CLAUDE.md + final gate

**Files:**
- Modify: `spec/features.md` (~:245, the permission-policy feature bullet)
- Modify: `spec/divergence-register.md` (new `## D24`)
- Modify: `CLAUDE.md` (short paragraph in Architecture, after the permission/security material)

- [ ] **Step 1: features.md** — extend the permission bullet:

```markdown
- Explicit per-permission policy with in-chrome prompts (camera, mic, geolocation,
  notifications), plus a live capture indicator: a window-wide chip while any
  surface captures the microphone or camera, with per-surface stop controls.
```

(Adjust to splice into the existing bullet's actual wording at `spec/features.md:245`.)

- [ ] **Step 2: divergence-register.md** — append after `## D23`:

```markdown
## D24 — Capture-indicator surface (desktop chip vs. OS indicators)

**Desktop:** Blanc draws its own window-wide capture chip + stop popover;
Electron exposes no browser-process capture truth, so live state is grant-
anchored in the main process and refined toward off by page-world
instrumentation (fail-safe: stuck-on, never silently-off).
**iOS/Android:** the system/WebView already draws an authoritative capture
indicator; mobile Blanc defers to it rather than re-implementing the chip.
**Parity that still holds:** the permission prompt shows media-type glyphs,
and permission policy/persistence behave identically (F at features.md).
```

(Match the surrounding D-entries' heading/field style — read `## D23` first and mirror it.)

- [ ] **Step 3: CLAUDE.md** — add one paragraph after the **Security posture** section:

```markdown
**Capture indicator** (`src/main/capture-state.js`, `capture-preload.js`,
`capture-mainworld.js`): a window-wide pill chip + popover showing live
mic/camera use. The only off→on signal is the main-process permission grant
(`setCaptureGrantObserver` in permissions.js); page-world instrumentation
refines toward off via per-frame snapshots/settlements over `capture:report`
— display state, not security truth (macOS's system indicator is the
malicious-page backstop; a defeated patch fails stuck-on, never
silently-off). Main-frame-only by spike-proven necessity; auxiliary popups
are capture surfaces in a process-wide registry that survives macOS window
close/reopen. Capturing tabs are excluded from Quiet Tabs. Never persisted
or synced. Design: docs/superpowers/specs/2026-08-13-capture-indicator-design.md.
```

- [ ] **Step 4: Full gate**

Run: `npm run test:unit && npm run substrate:check && npm run test:acceptance:dry`
Expected: all PASS — substrate untouched by design (no token/settings/copy changes).

Manual final smoke: relaunch `npm start`, run the Task 8 checklist once more end-to-end, and leave the dev instance open.

- [ ] **Step 5: Commit**

```bash
git add spec/features.md spec/divergence-register.md CLAUDE.md
git commit -m "docs: capture indicator — parity register D24, features, CLAUDE.md"
```
