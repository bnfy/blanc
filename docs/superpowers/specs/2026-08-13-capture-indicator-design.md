# Capture Indicator ("microphone / camera in use")

**Date:** 2026-08-13
**Status:** Approved design, pre-implementation
**Prior art in-tree:** shield popover (`docs/superpowers/specs/2026-08-07-shield-popover-design.md`), Quiet Tabs (`2026-08-09-quiet-tabs-design.md`), permission policy (`src/main/permissions.js`).

## 1. Problem

Blanc prompts for `media` permission and persists per-origin decisions, but once
granted there is **no visible sign that a site is capturing**. The permission
prompt itself is also text-only. A granted site — including one in a background
tab — can hold the microphone or camera with zero chrome indication.

Electron 43 exposes no browser-process capture-state API (`isBeingCaptured()`
is window screen-capture; `audio-state-changed` is playback). "In use" must be
assembled from what the main process *can* know.

## 2. Goal / non-goals

**Goal:** a truthful, window-wide "capturing" chip in the island pill, with a
popover to see and stop capture per tab; a media-type glyph on the permission
prompt; capture-aware Quiet Tabs.

**Non-goals:**
- Screen-capture (`getDisplayMedia`) indication — Blanc still denies display
  capture outright (`setDisplayMediaRequestHandler` returns no stream).
- New settings, persistence, or sync of any capture state.
- Per-tab-dot capture markers (the chip is window-wide; revisit only if asked).
- Chromium-grade adversarial truth (see §9).

## 3. Truth model

**The single `off → on` transition is the main-process permission grant.**
Renderer reports may only refine state toward *off*, and only where a grant
already exists. A page that defeats or never runs the instrumentation degrades
to **stuck-on until main-frame navigation** — never silently-off.

### 3.1 Grant observer (`src/main/permissions.js`)

`setupPermissionPolicy`'s request handler (permissions.js:72) gains a
module-level observer, mirroring the existing `setPermissionPrompter` shape:

```js
setCaptureGrantObserver(({ requestingWebContents, mediaTypes, requestingUrl, isMainFrame }) => …)
```

Fired on **every allowed `media` request** — both the stored-decision path
(`saved.every(allow)` → `callback(true)`) and the prompt path (user answered
Allow). Electron re-runs the request handler on each `getUserMedia()` call, so
a grant coincides with a capture attempt starting. Scopes come from
`normalizedMediaTypes(details.mediaTypes)`: an `audio` scope lights the mic, a
`video` scope lights the camera, **a video-only grant never lights the mic
glyph**. Both sessions (normal + private) share the one observer, exactly like
the prompter.

### 3.2 Capture-state module (`src/main/capture-state.js`)

New pure module, no `require('electron')`, requireable under `node --test`
(precedent: `permission-decisions.js`, `tab-sleep.js`). It owns a per-tab
record that is **richer than the UI projection**:

```
{
  anchors: [ { scopes: ['audio'|'video', …], origin, isMainFrame, confirmed } ],
  frames:  Map<frameKey, { origin, isMainFrame, audioLive, videoLive }>
}
```

- **Grant** appends **one new unconfirmed anchor per allowed request** —
  never merged or refreshed. Concurrent `getUserMedia()` calls each carry
  their own anchor, so retiring one can never clear another still-pending
  capture.
- **Settlement** (§4): the patch reports every wrapped `getUserMedia()`
  call's outcome — `resolved` (after track registration) or `rejected` (the
  promise rejected: device missing, hardware error, constraint failure).
  A settlement consumes **exactly one** matching unconfirmed anchor (matched
  on `origin` + `isMainFrame` + scopes): `rejected` retires it outright, so
  an honest device failure goes dark instead of staying lit until
  navigation; `resolved` confirms it, and from then on that capture's truth
  is the frame live counts. Non-matching settlements are ignored.
- **Frame report** (§4) upserts that frame's live-count row. Permission
  requests expose only `requestingUrl` + `isMainFrame`, not a frame
  identity — settlement/report origin-matching is what binds a grant to a
  frame after the fact.
- **A zero-count report or settlement from a non-matching frame must not
  clear an unconfirmed anchor.** This is the property that makes "patch
  failed → stuck on" actually hold: an uninstrumented grant keeps its scope
  lit until main-frame navigation regardless of what other frames report.
- **Projection** (what the UI sees), per scope:
  `lit(scope) = anyUnconfirmedAnchor(scope) OR sum(frame counts for kind) > 0`.
  Multiple `getUserMedia()` calls, iframes, and clones are why counts are
  per-frame sums — one stopped track must not clear another still-live
  capture.
- **Clear** wipes the whole record: main-frame commit (in
  `onMainFrameCommit`, alongside `usedMedia`), renderer gone, tab close.
  In-page (same-document) navigation does not clear — capture legitimately
  survives it; a real navigation destroys the document and its tracks, so
  clearing there is truthful.

Main.js holds one capture record per tab (keyed off the tab record, never
serialized — §8) and re-broadcasts `tabs:updated` on projection changes.

### 3.3 Auxiliary popup capture surfaces

Featureful `window.open` popups are deliberately **auxiliary WebContents**,
not managed tabs — they have no entry in `tabIdByWebContentsId`, and the
permission prompter intentionally serves them through
`runtimeForAuxiliaryContent` (window-runtime-registry.js). They can already
receive a `media` prompt today, and pop-out call widgets legitimately capture
from such windows, so denying media there would regress supported behavior.

They are therefore **capture surfaces in their own right**: a parallel
registry keyed by WebContents id holds the same capture-record shape as tabs.
This registry is **process-wide, deliberately not runtime-owned** (precedent:
the `tabs` Map itself). It must *not* piggyback on `auxiliaryOwner`: popups
are `outlivesOpener` OS windows that survive the Blanc window's macOS close,
but `detachWindow` wipes every `auxiliaryOwner` entry on that close — routing
capture validation through it would drop a still-live popup's reports and
leave its record stale when the window reopens. Instead:

- **Register** at `did-create-window`, alongside (not via) the existing
  `registerAuxiliaryContent` call.
- **Clear/drop** on the popup WebContents' own events only: main-frame
  commit clears the record; `destroyed` **and `render-process-gone`** drop
  it. Owner-window teardown does not touch it.
- **Validation** for grants, reports, and settlements from a popup consults
  this registry (plus WebContents liveness), never
  `runtimeForAuxiliaryContent`.
- **Across macOS close/reopen:** the registry and the popup's live reports
  survive; the recreated window's chip re-derives from it, so a Meet pop-out
  that kept capturing is lit again the moment chrome exists. While no Blanc
  window exists there is no chrome to indicate at all — the macOS system
  capture indicator is the only signal in that interval (§9).

A popup's capture state is **never associated with its opener** — the opener
may be gone or outlived by the popup. Popover rows for popups show the
popup's own host; focus raises that window; stop targets that WebContents
with the same reload fallback (§5).

## 4. Renderer instrumentation (`src/main/capture-preload.js`)

A **new** session preload registered on both sessions with
`registerPreloadScript({ type: 'frame', … })`. This reaches the **main frame
of every WebContents** — tabs and Chromium-adopted `window.open`
children/popups — but **not cross-origin iframes**: the §4.1 spike showed
subframe preload injection requires `nodeIntegrationInSubFrames`, which stays
off. It is deliberately a separate file from `chrome-compat-preload.js`,
whose documented "exposes no IPC" property must stay intact.

The preload injects a main-world patch (via `webFrame.executeJavaScript`, same
mechanism as chrome-compat) that:

- wraps `navigator.mediaDevices.getUserMedia`, registers the tracks of every
  resolved stream, and reports each call's **settlement** (§3.2) — `resolved`
  after track registration, `rejected` on promise rejection (which registers
  nothing);
- patches **`MediaStreamTrack.prototype.stop`** — `stop()` does *not* fire
  `ended`, so an unpatched `stop` is invisible — plus the `ended` event for
  device-initiated ends;
- patches **`MediaStreamTrack.prototype.clone`** and
  **`MediaStream.prototype.clone`**, registering clones of registered
  tracks/streams so a page can't shed tracking by cloning;
- maintains per-frame live counts by kind (`audioLive`, `videoLive` — an
  `audio`-kind track is mic capture) and, on any transition, emits a **bounded
  per-frame snapshot** `{audioLive, videoLive}` — never per-track "ended"
  messages — via a `CustomEvent` the isolated-world preload listens for;
- reports a zero snapshot on `pagehide` (best-effort; §9 covers the
  residual).

The preload forwards snapshots and settlements to main over
**`capture:report`** (a new, narrow IPC namespace: `capture:*`). Main
validates every message: the sender `webContents` must resolve to a known tab
via `tabIdByWebContentsId` **or** a registered auxiliary content (§3.3), the
sender frame supplies `frameKey`/`origin`/`isMainFrame` from
`event.senderFrame` (never from the payload), and payload counts are coerced
to small non-negative integers. Reports for surfaces with no capture record
are dropped.

### 4.1 Required spike: child-frame transport (pre-implementation gate)

Tabs deliberately run without `nodeIntegrationInSubFrames`, and Electron
documents that in this configuration **child frames normally cannot send or
receive IPC** — the same option is what makes preloads load per-iframe at
all. This design's cross-origin-iframe coverage is therefore *unproven* on
our configuration. Before implementation, a spike on Electron 43.4 must
demonstrate, in a cross-origin iframe of an ordinary tab:

1. renderer→main: the session preload runs in the child frame and its
   `capture:report` arrives with a correct `event.senderFrame`;
2. main→renderer: `wc.mainFrame.framesInSubtree` + `WebFrameMain.send()`
   (and/or `frame.ipc`) reaches that child frame's preload.

**Enabling `nodeIntegrationInSubFrames` merely to make this work is not an
acceptable outcome.** If either direction fails, the defined fallback is:
instrumentation is **main-frame-only**; a subframe grant
(`isMainFrame: false`) can never be confirmed or settled, so it stays lit
until main-frame navigation (fail-safe, per §3), and stop for
subframe-anchored capture goes straight to the reload path (§5). The spike's
outcome is recorded in this spec before the implementation plan is written.

**Spike outcome (2026-08-13, Electron 43.4.0, macOS): both directions FAIL
for child frames — the main-frame-only fallback is adopted.** Harness: a
scratch Electron main mirroring `TAB_WEB_PREFERENCES` (contextIsolation +
sandbox, no `nodeIntegrationInSubFrames`), a session preload registered with
`registerPreloadScript({type: 'frame'})`, and two `127.0.0.1` HTTP servers on
different ports for a genuine cross-origin iframe. Observed:

- The iframe loaded (present in `mainFrame.framesInSubtree` with its URL),
  but its preload **never executed** — a `console.log` probe before any
  `require` produced nothing from the child frame. Subframe non-coverage is
  at the preload-injection layer, not just IPC.
- Positive control: the main frame's preload ran, its `capture:report`
  arrived with a correct `event.senderFrame` (`isMainFrame: true`, stable
  `frameToken`), and it echoed a `WebFrameMain.send()` round-trip — so the
  harness demonstrably detects success.
- `frame.send()` to the child frame did not throw; it simply lands nowhere
  a listener can exist.

Consequences now normative: instrumentation, settlements, and reports exist
for **main frames only** (of tabs and popup surfaces). A grant with
`isMainFrame: false` creates a permanently-unconfirmable anchor — lit until
main-frame navigation — and its stop path is reload-only. The §3.2 reducer
needs no structural change; per-frame maps simply hold at most the main
frame's row per surface. A future postMessage relay through the main frame's
transport was considered and deferred: it widens the page-observable surface
for no change in the security envelope, and subframe capture is the rare
case.

## 5. Stop flow

Popover row "stop" →

1. Main sends **`capture:stop`** to **every live frame** of that tab via
   `wc.mainFrame.framesInSubtree` + `WebFrameMain.send()` — not
   `webContents.send()`, which reaches only the main frame. The preload
   relays into the main world; the patch stops all registered tracks.
2. Confirmation arrives as ordinary `capture:report` zero snapshots. When the
   projection clears, done.
3. If the projection has not fully cleared within **1.5 s**, or the surface
   never produced a report at all (uninstrumented, or subframe-anchored under
   the §4.1 fallback), main **reloads the tab or popup**. Blunt but truthful.
   **The chip stays lit until the reload's main-frame commit clears the
   record or the renderer is gone** — the stop action itself never clears
   display state.

## 6. Chrome UI

### 6.1 Pill chip (`#pillCapture`)

A button in the pill's trailing chip cluster, between the domain (after the
private/source chips) and `#pillShield`; hidden entirely while nothing
captures. Same chip anatomy as the shield: 24px round hit-target, 16-grid
stroked glyph (`stroke-width: 1.4`, round caps/joins, no fill), hover paints
the `--border` disc. Glyphs: an outlined mic (capsule + cradle arc + stem)
for audio, an outlined camera for video, both side-by-side when both are
live. One deliberate departure from the pill's mono language: the glyph
renders in **`--danger`** — live capture is the single pill state that earns
an alarm color, matching the OS convention — but steady: no pulse, no count
badge. Existing tokens only (no new substrate tokens); the private theme
inherits the same `--danger`.

The chip is **window-wide**: lit while *any* tab **or auxiliary popup**
(§3.3) captures, derived from the union of all surfaces' projections —
because the user's question is "is something listening to me right now", not
"is this tab listening". Background capture is exactly the case worth
catching.

Titles/aria: "microphone in use", "camera in use", "camera & microphone in
use" (+ "— open capture controls"). `tabs:updated` rows gain a
`capture: {audio, video}` projection field; popup surfaces ride in a small
parallel list on the same broadcast.

### 6.2 Popover (`overlayMode: 'capture'`)

Reuses the shield popover machinery with **its own parallel state**, not
piggybacked on shield's: `calculateCaptureBounds` in `chrome-layout.js`, a
`captureAnchorRight` on the window runtime, its own trigger, and Escape
restoring focus to `#pillCapture` (mirroring `restoreTrigger === 'shield'`).
`aria-expanded` on the chip reflects only this popover.

Content: **one row per capturing surface** — favicon, **top-level host** of
the tab or popup, and the union of its active scope glyphs. An embedded
iframe may be the requesting origin, but the tab (or popup window) is the
thing the user can jump to and stop. Each row: click → focus that tab or
raise that popup window (dismisses, consistent with shield's tab-switch
dismissal); a **stop** button → §5. Rows are **capped with
overflow scroll** — one window can hold more capturing tabs than a
shield-sized fixed card; `calculateCaptureBounds` caps height at **5 visible
rows** and the list scrolls beyond it. Dismissal otherwise matches shield: Escape,
overlay blur, tab switch, site-changing navigation.

### 6.3 Permission bar glyph

`#permissionBar` gains a leading media-type glyph (mic / camera / both) next
to `#permissionText` for `media` prompts; geolocation/notifications prompts
stay text-only for now. Same inline-SVG idiom as the pill icons.

## 7. Quiet Tabs integration

- `sleepCandidates` (tab-sleep.js) gains a **`tab.capturing` exclusion** on
  the same line family as `audible/muted/usedMedia` — a pure recorder never
  plays media, so `usedMedia` (playback-only) does not cover it. `capturing`
  is the boolean projection (any scope lit) mirrored onto the tab record for
  the pure policy's benefit.
- **`sleepTab()` re-checks `capturing` synchronously in its post-probe
  validation** (main.js `sleepTab`, the guard after `probeTabDirty`) —
  candidate selection and the dirty probe are asynchronous, so a tab can
  start capturing between selection and teardown and must not be discarded.
- Waking clears nothing: capture state was already cleared when the renderer
  went away.

## 8. Persistence, sync, privacy

Capture state is **runtime-only**. It must never reach: `session.json` (either
version), `sleepSnapshots`, sync (any store), crash reporting, history, or
disk in any form. The only surface that carries it out of main.js is the
`tabs:updated` projection (and the test hook, §10). Private tabs behave
identically — the observer and preload are wired on both sessions.

## 9. Security honesty (document in-code, verbatim intent)

Renderer reports and settlements **refine display state; they are not
security truth**. A malicious page can fake zero-count snapshots or
settlements for its own frame and hide the chip while capturing — browser-process capture truth is not reachable from
Electron userland. The design's guarantees are exactly:

- The *on* signal cannot be spoofed or suppressed by page code (main-process
  grant only).
- Honest pages (in practice, all of them) get accurate live state.
- A broken/defeated patch fails **stuck-on**, never silently-off.
- **macOS's system capture indicator remains the authoritative backstop for
  a malicious page.** Blanc's chip is a usability layer above it, not a
  replacement.

Residual known gap: any subframe-anchored capture (a grant with
`isMainFrame: false`) is uninstrumented under the §4.1 outcome and stays lit
until top-level navigation, as does a main-frame capture whose `pagehide`
report didn't land — fail-safe direction, accepted.

## 10. Testing

- **Unit (`test/unit/`):** capture-state reducer — grant/confirm/retire
  ordering, video-only grant never lights audio, non-matching zero report or
  settlement cannot clear an unconfirmed anchor, **concurrent grants each
  keep their own anchor and one settlement consumes exactly one**, **a
  rejected settlement retires its anchor (honest device failure goes
  dark)**, clone/multi-call count summing, clear semantics, and the
  auxiliary-surface registry lifecycle (§3.3). `tab-sleep.test.js` gains the `capturing` exclusion row in its
  existing eligibility table. A permissions test asserts the grant observer
  fires on the stored-allow path (the path with no prompt).
- **Test hook:** expose per-tab capture projection on `globalThis.__blanc`
  and a forcing hook alongside the existing `'used media'` reason
  (test-hook.js) so acceptance steps can drive state without real devices.
- **Acceptance:** one backlog-tagged Gherkin scenario in `spec/acceptance/`
  (chip appears on grant, clears on stop); must pass
  `test:acceptance:dry` resolution.
- **Substrate:** no token/settings/copy JSON changes — `substrate:check`
  must stay green untouched.
- Manual: chrome changes require a dev relaunch (chrome documents load once).

## 11. Parity docs

- `spec/features.md`: add the capture indicator to the permission-policy
  feature's bullet (≈line 245).
- `spec/divergence-register.md`: new D-entry (next free number) — iOS/Android
  WebViews draw their own OS-level capture indicators; mobile Blanc defers to
  those rather than re-implementing the chip, while the prompt-glyph and
  policy behavior remain parity items.
