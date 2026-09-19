# Display Capture Broker (screen + system audio)

**Date:** 2026-09-07
**Status:** Design consolidated for review; pre-implementation
**Launch posture:** Launch-train blocker. The next public release must ship this broker and clear the packaged conference gates below, or launch moves. No custom Electron build.
**Prior art in-tree:** permission policy (`src/main/permissions.js`), capture indicator (`docs/superpowers/specs/2026-08-13-capture-indicator-design.md`, `src/main/capture-preload.js`), Quiet Tabs (`src/main/tab-sleep.js`), Reopen Closed Tab (`src/main/closed-tabs.js`), 1Password broker trust model (`docs/1password-integration.md`).
**Upstream:** Electron 44.1.1 / Chromium 152 baseline for feasibility; [desktopCapturer / loopback docs](https://www.electronjs.org/docs/latest/api/desktop-capturer); [Electron #52738](https://github.com/electron/electron/issues/52738) (Catap custom-picker audio failure this design bypasses); [getDisplayMedia](https://www.w3.org/TR/screen-capture/#dom-mediadevices-getdisplaymedia); [feedback and interface during capture](https://www.w3.org/TR/screen-capture/#feedback-and-interface-during-capture).

This spec **supersedes** the 2026-08-13 capture-indicator non-goal that Blanc would keep denying display capture without indication. Helper-owned shares require a distinct main-owned indicator and Stop control; the existing mic/camera chip does not automatically represent them.

## 1. Problem

Stock Electron cannot safely let website sessions call the native display-capture path while denying Electron’s legacy whole-screen `getUserMedia` / `chromeMediaSource` path without a source ID. Both historically collapse into permission types the embedder cannot split on Electron 44. Blanc currently denies all display media (`setDisplayMediaRequestHandler` returns no stream), so Meet / Teams / Zoom screen sharing fails.

A trusted broker avoids that boundary: website sessions stay deny-closed; a Blanc-owned helper captures after explicit picker/portal consent; a local WebRTC relay delivers a normal `MediaStream` to the page. The page receives **only the approved media stream**. The helper retains authority to start and stop capture.

## 2. Goal / non-goals

**Goal:** Ship secure screen sharing with optional computer audio on macOS, Windows, and Linux using stock Electron, with Island (or Linux portal) consent, such that a remote Meet/Teams/Zoom participant receives moving screen content and audible system audio from a signed/authenticated packaged Blanc. While a share is pending or active, Blanc must show a main-owned sharing indicator (requesting site, shared surface, computer-audio state) and a trusted Stop control that remains available when the sharing tab is backgrounded.

**Non-goals:**
- Custom Electron builds or patched Chromium.
- Granting website sessions `display-capture` / unscoped desktop capture.
- Persisting display-capture permission grants (W3C: must not persist “granted”).
- Identical picker chrome on every OS (Linux portals may require a native chooser).
- Claiming iframe `getDisplayMedia` support before per-frame preload coverage is proven.
- Using `loopbackWithMute` as the Windows default (muting local playback is a separate product choice).
- Treating page-reported track state as sufficient teardown truth.

## 3. Feasibility evidence (not release gates)

These spikes prove architecture feasibility on a developer Mac. They do **not** clear the release gate.

### 3.1 Broker spike (stock Electron 44.1.1 / Chromium 152 / macOS 27)

- Website-native `getDisplayMedia`: `NotAllowedError`
- Legacy no-source-ID capture: `NotAllowedError`
- Brokered video received and decoded: 3024×1964
- Brokered system-audio track: live and unmuted
- Receiver-measured audio peak: nonzero (0.18888) under test conditions
- Local WebRTC relay delivered normal remote audio and video tracks
- `disable-features=MacCatapLoopbackAudioForScreenShare` was sufficient; `MacSckSystemAudioLoopbackOverride` was unnecessary
- Helper-only macOS system-picker fallback timed out and is **not** required given custom-helper success
- Throwaway app deleted (~704 KB); no Blanc product edits

### 3.2 Mixed-legacy probe (stock Electron 44.1.1 / macOS 27)

Harness retained under `/private/tmp/blanc-mixed-legacy-probe/` (`README.md`, `result.json`, `main.cjs`; ~52 KB). Forty cases with simulated remembered grants (none / mic / camera / both):

- Valid unscoped desktop requests: `NotAllowedError`
- Invalid mixed desktop/device combinations: Chromium terminated the renderer **before** Electron’s permission handler (bad IPC / exit); not a stream bypass
- Matching microphone/camera controls: live tracks
- No tested legacy or mixed request returned a stream

**Claim discipline:** Do not promise that every malformed native legacy request returns `NotAllowedError`; some kill the renderer. Denial means no stream. Empty `mediaTypes` denial remains necessary for unscoped desktop that reaches the handler; Chromium’s `IsValidStreamTypeCombination` rejects many mixed shapes earlier. This was not a Windows/Linux, iframe, or packaged test.

## 4. Sessions and permission boundary

### 4.1 Website browsing sessions

Personal, named-profile, and private browsing sessions:

- Deny `display-capture`.
- Deny `media` when `mediaTypes` is empty (unscoped / legacy desktop path that reaches the handler).
- Keep `setDisplayMediaRequestHandler` returning no stream.
- Camera/mic continue via scoped `media` with `audio` / `video` as today.
- Remembered device grants must not unlock unscoped desktop.

Native website `getDisplayMedia` and no-source-ID legacy capture must fail closed (error or renderer kill—never a stream).

### 4.2 Capture helper session

- One dedicated **in-memory** partition (no persistent cookies, permissions, or storage—including when serving private-tab brokers).
- Only this session may use Electron desktop capture APIs.
- Hidden helper `BrowserWindow` loads an exact allowlisted Blanc-owned internal document only.
- Membership in the helper session alone does **not** grant capture. Main must validate helper `WebContents` / frame, exact internal URL, and an active authorization for a specific pending request.
- Block helper navigation and `window.open`.

### 4.3 Authority, lifecycle, and teardown

- Page receives only relayed approved tracks as a normal `MediaStream`.
- Page never receives `desktopCapturer` source lists, source IDs, or capture start authority.
- Main + helper own stop. The following events **must** end helper capture and the relay for that share (or all shares the helper owns, where noted), even if the page lies or never fires `ended`:
  - trusted Cancel or Stop (chrome);
  - requesting-document navigation or generation change;
  - requesting-frame destruction;
  - requesting-renderer crash or `webContents` destroy;
  - helper crash, helper navigation attempt, or helper failure (**invalidates every share that helper owns**);
  - native source ending (user closed the window, display removed, portal revoked);
  - relay failure (signaling rejected, peer connection failed, usable tracks never arrived);
  - bounded startup timeout without usable required tracks;
  - late capture completion after cancellation (immediately stop those tracks);
  - tab close or app quit.
- **Page `track.stop()` (normal MediaStream semantics):** The main-world patch must notify the broker when the page stops a brokered track. Stopping a track or clone does **not** stop sibling tracks or clones. Main decrements that source’s consumer count; it releases the corresponding helper source (video or computer-audio) only when its **last consumer** stops. Trusted chrome **Stop sharing** revokes the entire share: every helper source and every page track/clone belonging to it.
- **Teardown truth:** Main cannot infer an unreported page-local `stop()`. A missing or forged notification is not something main can guarantee to detect. Guaranteed teardown comes from trusted Stop, the lifecycle events listed above, and bounded failures (startup timeout, relay failure, source ending). The page `stop()` notify is required for *cooperative* last-consumer release, not as a substitute for those guarantees.
- **Independence from device capture:** Broker Stop and share teardown must **not** stop independent microphone/camera `getUserMedia` tracks. Mic/camera indicator and display-share indicator are separate truth sources.
- **Quiet Tabs and closed-tab parking:** A tab with a **pending or active** broker request is ineligible for Quiet Tabs and for closed-tab Tier-1 parking (same class as `tab.capturing` / capture-anchored holds). Main must set this from broker state, not from the mic/camera grant observer alone.

## 5. Page patch and IPC

### 5.1 Website patch

Extend the existing capture main-world instrumentation path so `navigator.mediaDevices.getDisplayMedia` never reaches Chromium’s display-capture path in website sessions. Defense-in-depth only relative to the session deny-closed boundary. The patch also wraps `stop` / `clone` on brokered tracks as specified in §4.3.

### 5.2 Identity (main-derived)

Main derives requesting identity only from `event.sender`, `event.senderFrame`, and main-owned tab/document state (origin, URL, document generation). The page must not supply authoritative WebContents/frame IDs.

### 5.3 Admission: activation, policy, focused/visible document

**Release-blocking until verified** (see §10).

Because the page never hits Electron’s native `getDisplayMedia` handler, Blanc cannot rely on that handler’s `userGesture` boolean.

Main checks **eligibility before opening the picker**. Picker or portal focus must **not** invalidate consent: a document that was focused/visible at request admission remains eligible through the consent UI even though the Island overlay or portal takes focus.

Admission requires all of:

- **Activation:** On broker request, the **isolated preload** reads `navigator.userActivation.isActive` for that frame at IPC send time. Main accepts only if true. Ignore page-posted activation flags. Production broker code must not manufacture activation (`executeJavaScript(..., userGesture: true)` or equivalent). Tamper tests: page-generated events without activation, forged bridge messages, calls without activation. Do **not** require the preload to distinguish Electron’s privileged `executeJavaScript(..., true)` gesture context from ordinary activation.
- **Permissions-Policy:** Isolated preload reads policy via isolated-world APIs (`document.permissionsPolicy.allowsFeature('display-capture')` or equivalent). **Fail closed** if unavailable. Test response headers and iframe delegation; same-origin inheritance means an iframe without `allow` is not universally denied. Do not claim iframe support until the isolated preload actually reaches those frames.
- **Focused / visible requesting document:** The requesting frame’s document must be focused and visible at admission (Electron `WebContents` / frame visibility and focus main can observe—not a page boolean). Background tabs, occluded documents, and unfocused frames fail closed **before** the picker opens. After admission, chrome/portal focus does not fail the in-flight request.

### 5.4 `getDisplayMedia` API behavior

Align with the [getDisplayMedia algorithm](https://www.w3.org/TR/screen-capture/#dom-mediadevices-getdisplaymedia), as implemented by the broker:

| Input | Behavior |
| --- | --- |
| Missing / `undefined` `video` | Treat as `{ video: true }`. Video is **required**. |
| `video: false` | Reject (`TypeError`). |
| Syntactically invalid / unsupported options (e.g. `video: false`, non-object constraints the algorithm rejects) | Reject (`TypeError`) **before** opening the picker. |
| Valid but source-dependent constraints (resolution, frameRate, etc.) | Open the picker. After the user selects a source, apply constraints to **that** source. If the selected source cannot satisfy them, reject `OverconstrainedError` (or proceed with the closest supported settings only if the spec algorithm allows). Do not refuse the picker solely because some sources might fail. |
| `audio` omitted / `false` | Video-only share. Picker must not offer computer audio as an approved output for this request. |
| `audio: true` or audio constraints | Site **requested** computer audio. Picker may offer it. Audio track is returned **only if the site requested audio and the user approved computer audio**. |
| User approves video only after site requested audio | Resolve with video-only `MediaStream` (no audio track). |
| User approves computer audio but site did not request audio | Do not attach an audio track. |
| User cancels | Reject `NotAllowedError` (or `AbortError` if the UA distinguishes dismiss). |
| Admission failure | Reject `NotAllowedError` / `InvalidStateError` (no transient activation) without opening the picker. |

Computer-audio consent is **not** independent of the site request: both conditions are required to return audio.

Resolve the page promise only when **usable** tracks are present: live required video; if computer audio was both requested and approved, a live unmuted audio track within a bounded startup timeout. **No runtime energy threshold.** Silent desktop audio is allowed. Nonzero energy is a conference-gate assertion, not a broker requirement.

### 5.5 IPC contract

- Opaque `requestId` plus **sender + document generation** binding on every signaling and stop message.
- Main ignores messages whose sender/frame/generation do not match the request record.
- Picker Allow/Cancel originate only from trusted Blanc chrome (or Linux portal completion mediated by main)—never from the website renderer.
- At most one pending request per tab.
- Navigation / document replacement / contents recreation invalidates generation; late picker OK for a stale `requestId` must not start capture.
- Relay SDP/ICE through main; construct the `MediaStream` in the page from received tracks.

### 5.6 Local-only relay

Signaling is authenticated **and** content-restricted. Sender binding alone is insufficient: [WebRTC uses supplied candidates to establish connectivity](https://w3c.github.io/webrtc-pc/). Empty STUN/TURN configuration does **not** by itself prove the helper cannot be directed off-machine.

Invariant: the helper’s media/ICE transport must stay on **the same machine** as Blanc. Endpoint verification is an early probe (see §10.5), not an assumed property of ICE labels.

- Helper `RTCPeerConnection` uses no STUN/TURN (`iceServers: []`).
- Website-supplied SDP/ICE is parsed and validated against a bounded allowlist (media lines, codecs, ICE credentials length). Non-matching fields are dropped.
- ICE `host` candidates may carry network-interface addresses; that label **does not** establish same-machine locality ([RFC 8445 §2.1](https://www.rfc-editor.org/rfc/rfc8445.html#section-2.1)). Main must verify each forwarded candidate’s address is a same-machine endpoint (loopback or an address bound to this host that the probe has shown stays on-box). Candidates that fail verification must never be added on the helper.
- Do **not** invent main-authored ICE candidates unless they identify a **verified listening endpoint** main actually created. Prefer helper-initiated offer so the page is the answerer applying main-vetted SDP; drop unverified page candidates rather than synthesizing replacements.
- Helper must not apply remote description/candidates that would create an off-machine transport.
- Payload bounds: reject oversized SDP/ICE; one pending signaling exchange per `requestId`.
- **Tampered-destination test (release-blocking):** A page that injects a public or off-machine ICE candidate (or rewritten `c=` / `a=candidate` lines) must not cause the helper to send media or ICE to that destination. Same-machine relay or fail closed.

## 6. Picker, helper capture, and sharing indicator

### 6.1 Island picker (macOS / Windows primary UX)

Trusted Blanc chrome only. Source metadata (titles, thumbnails, IDs) stays exclusively in trusted chrome/helper renderers—never in the website renderer. Computer-audio approval is a distinct picker control, shown only when the site requested audio (§5.4).

### 6.2 Linux portal consent

Preserve native/portal chooser when required. Island may express intent; **portal completion** is the explicit consent for that `requestId`. Portal cancel ≡ Island Cancel. Release copy must not promise one identical picker across platforms.

### 6.3 Helper capture

After trusted picker/portal consent, main sends the helper a one-shot authorization `{requestId, selection, computerAudioApproved}` bound to the still-valid page document generation. `computerAudioApproved` may be true only when the site requested audio **and** the user approved computer audio.

- Capture API used inside the helper must work **after trusted picker consent without fabricating the website’s activation**. The exact helper invocation (e.g. helper-frame `getDisplayMedia` / `getUserMedia` with source id / `setDisplayMediaRequestHandler` on the helper session) remains an **integration verification** item.
- **Concurrency:** Keep streams, peer connections, and authorizations separately keyed by `requestId`. Serialize capture acquisition where necessary. A shared “current source” must never let one tab receive another’s selection.

### 6.4 Sharing indicator and trusted Stop (required)

Required for this release—not a follow-up. Follow [screen-capture feedback and control](https://www.w3.org/TR/screen-capture/#feedback-and-interface-during-capture).

- **Truth:** Main-owned broker state, not page reports and not the mic/camera grant observer. Off→on when a share becomes pending (picker open) or active (usable tracks). Page silence must not hide an active helper share.
- **Display:** Identify the requesting site (origin), the shared surface (kind + chrome-safe label; never raw source IDs to the website), and computer-audio state (off / approved).
- **Stop:** Trusted chrome control ends that share (§4.3). Must remain available when the sharing tab is backgrounded (window-wide chip/popover, same class as the existing capture chip).
- Mic/camera and display-share may both be live; Stop on the share must not end device capture, and the device Stop path must not end the share.

## 7. Audio flags and packaging

### 7.1 Startup flags

- **macOS only:** Before `app.ready`, merge `MacCatapLoopbackAudioForScreenShare` into `disable-features`, **preserving any existing `disable-features` entries**.
- Do not enable `MacSckSystemAudioLoopbackOverride` unless native failure later requires it.
- **Windows:** Default computer-audio grant uses `loopback`. `loopbackWithMute` is a separate product choice (changes local playback).
- **Linux only (owner approved 2026-09-08):** Merge `WebRtcAllowInputVolumeAdjustment` into `disable-features`, preserving existing flags. The Ubuntu Wayland/PipeWire guest A/B demonstrated loopback monitor attenuation without it and receiver tone-follow with it; the recorded analog-input listening check closed the mic-quality concern on that guest. This disable is process-wide and also affects page microphone APM input-volume recommendations. Packaged Linux conference proof must still exercise microphone, camera, and system audio together. This decision authorizes integration, not merge, release, or an evidence waiver.

### 7.2 Packaging

- Add `NSAudioCaptureUsageDescription` (and any required screen-recording usage strings) alongside existing mic/camera copy; review entitlements / hardened runtime for screen + system audio.
- macOS/Windows gate artifacts must be natively signed. Linux gate artifacts must be authenticated (checksum manifest / Sigstore as for normal releases).
- Broker must not manufacture website activation in production paths.

## 8. Release gate (exact release candidate)

Complete **before publication**. Evidence binds to the **exact release candidate** commit and artifact hashes. Any change affecting capture or packaging requires renewed evidence.

**Minimum matrix C — three platform passes:** macOS, Windows, and Linux, each on the signed/authenticated packaged candidate, each in at least one real Meet, Teams, or Zoom session.

Each conference pass must demonstrate:

1. **Receiver-side proof:** Another participant receives moving screen content and audible system audio. Nonzero audio measured only inside Blanc is insufficient. The test must distinguish system playback from microphone pickup.
2. Cancel denies capture; trusted Stop ends both video and audio of that share and remains usable with the sharing tab backgrounded.
3. Direct website legacy / unscoped capture remains denied (no stream).
4. Microphone and camera continue to work alongside sharing; share Stop does not end them.

### 8.1 Packaged negative-test matrix (required)

On the same exact candidate, for **Personal, named-profile, and private** sessions, record:

- Native **wrapper-bypass** probes (no reliance on the page patch): unscoped `getDisplayMedia` if reachable, and legacy no-source-ID `chromeMediaSource` desktop capture.
- Mixed desktop + device `getUserMedia` combinations **with remembered microphone and/or camera grants**.
- Forged/no-activation broker IPC; tampered non-local ICE/SDP destination (§5.6).

Preserve the distinction between **graceful denial** (`NotAllowedError` / `InvalidStateError` / `AbortError`) and **renderer termination**. Both count as “no stream”; evidence must say which occurred.

Record exact **Electron and Chromium versions** alongside Blanc version, candidate commit SHA, artifact hashes, OS/arch, conference service, and for Linux the display/audio configuration (e.g. Wayland/X11, Pulse/PipeWire). Windows/Linux tests in Parallels qualify only for those guest configurations. One service per platform satisfies the conference minimum; claims across all three services need broader coverage.

## 9. Security properties (summary)

| Property | Mechanism |
| --- | --- |
| Website cannot start capture | Session deny-closed + no display media handler stream |
| Website cannot see sources | Metadata only in chrome/helper |
| Consent | Island picker or Linux portal; audio only if site requested **and** user approved |
| Identity | `event.sender` / `senderFrame` + document generation |
| Admission | Activation + policy + focused/visible document **before** picker |
| Picker focus | Does not invalidate already-admitted consent |
| Stale consent | Generation invalidation |
| Teardown | Trusted Stop / lifecycle / bounded failure; page `stop` notifies last-consumer release; clones do not stop siblings |
| Device isolation | Share Stop does not stop mic/camera |
| Cross-tab mixup | Per-`requestId` keys; serialized acquisition |
| Local relay | Validated/bounded SDP/ICE; helper never applies non-local candidates; tampered-destination test |
| Activation spoof | Isolated preload `userActivation`; no production gesture fabrication |
| Policy spoof | Isolated policy read; fail closed if unavailable |
| User feedback | Main-owned indicator + trusted Stop, including background tab |

## 10. Release-blocking implementation checks (explicitly unresolved)

These remain **release-blocking** until they pass. They are not assumed guarantees of this document:

1. **Activation:** Isolated-preload `navigator.userActivation.isActive` accepted by main; page-event / forged-bridge / no-activation tests pass; production paths do not manufacture activation. Helper capture after picker consent verified without fabricating website activation.
2. **Permissions-Policy + preload coverage:** Fail-closed isolated policy read verified against headers and iframe delegation/inheritance; no iframe support claim until preload reaches those frames.
3. **Helper concurrency:** Per-`requestId` isolation proven under overlapping requests so one tab cannot receive another’s selection; acquisition serialized where required.
4. **Focused/visible admission:** Background/unfocused documents fail before picker; picker/portal focus does not void an admitted request.
5. **Local relay:** Tampered-destination test passes (§5.6).
6. **Early Windows/Linux stock-runtime audio:** Helper computer-audio path produces **receiver-measured nonzero audio** while a known system sound plays, with microphone pickup excluded (mute mic / no mic track / play a distinguishable tone). A merely live/unmuted track is insufficient—that is the silent-track failure this probe exists to catch. Runtime broker startup still has **no** energy threshold. Document any required flag change before UI lock-in.

## 11. Open product / integration notes

- Marketing claims must follow `docs/marketing-claims.md` and only cite capabilities proven on the published release evidence.
- Electron 45’s `display-capture` permission reporting may simplify a future non-broker design; it is not required for this broker and does not replace packaged conference proof.
- Exact helper capture invocation after picker consent remains an integration verification item (§6.3).

## 12. Implementation order (indicative)

Feasibility-critical checks come **before** substantial picker/UI work so architectural blockers surface first. The final signed/authenticated conference matrix (§8) is unchanged and remains last.

1. **Activation, Permissions-Policy, focused/visible admission, and preload-reach probes** on stock Electron 44 (isolated world; fail closed; iframe inheritance recorded). Release-blocking §10.1–10.2 and §10.4.
2. **Website session deny-closed hardening + unit tests** (empty `mediaTypes`, `display-capture`) and **early Windows/Linux stock-runtime helper audio probes** (plus macOS Catap-disable merge behavior). §10.6.
3. In-memory helper session/window + exact-URL / no-navigation guards; **local-only relay** with tampered-destination test (§10.5) using a minimal non-product picker stub if needed.
4. Page `getDisplayMedia` patch + IPC + WebRTC relay; resolve on usable tracks; `stop`/clone contract; Quiet Tabs / closed-tab exclusion for pending/active shares.
5. Island picker (chrome-only metadata) + request generation binding + computer-audio consent; Linux portal path; helper concurrency proof (§10.3).
6. Required sharing indicator + trusted Stop (§6.4).
7. Packaging strings/entitlements; Windows `loopback`; Linux flags only as proven.
8. Packaged exact-candidate conference evidence **and** negative-test matrix on macOS, Windows, Linux (§8).
