# Screen-sharing prerequisite — September 7, 2026

Status: **candidate implemented; patched native builds and capture validation in progress; no release**.
This record does not claim screen sharing or computer audio works in Blanc.

## Owner decisions

The owner approved implementing screen and application-window sharing on macOS,
Windows, and Linux, including computer audio on all three platform families.
Linux targets PulseAudio and PipeWire's PulseAudio compatibility service.
Individual-tab capture is excluded. Stop sharing must preserve microphone and
camera capture, with an explicit stop-all fallback when selective stopping
cannot be confirmed.

The owner selected a replacement launch release, requiring full release gates,
fresh release-backed assets, and a new verified soak of at least 48 hours.
September 8 Show HN is no longer the target; replacement dates remain unset.
Public v1.15.0 and its historical release evidence remain unchanged.

## Reproduced runtime blocker

The standalone `test:display-capture:routing` probe denies every permission.
It neither enumerates desktop sources nor records screen or audio content.
It exercises real renderer calls made by clicking buttons in a sandboxed,
context-isolated Electron window on loopback HTTP.

Both Electron **44.1.1** (Blanc's installed runtime) and **44.2.0** (the latest
stable release checked on September 7) produce identical permission payloads
for these two requests:

```js
navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
navigator.mediaDevices.getUserMedia({
  video: { mandatory: { chromeMediaSource: 'desktop' } },
});
// Both reach setPermissionRequestHandler as:
// permission: 'media'
// details: { isMainFrame: true, mediaTypes: [], requestingUrl, securityOrigin }
```

The result is identical with `useSystemPicker: false` and `true`. Denial
prevents the native picker and the display-selection callback. Camera-only
requests correctly carry `mediaTypes: ['video']`.

The host was **macOS 27.0, arm64**, not the reporter's Tahoe 26.6.2. These are
permission-routing observations, not affected-machine or packaged-release
evidence. The downloaded 44.2.0 binary is a stock Electron build, not Blanc.

Exact upstream source confirms why granting this generic permission is unsafe:
`RequestMediaAccessPermission` reports only physical-device scopes, while
`MediaAccessAllowed` sends legacy desktop requests to `HandleUserMediaRequest`
instead of the application's `ChooseDisplayMediaDevice` source picker.
Thus merely allowing `mediaTypes: []` to reach a custom/native picker does not
enforce picker consent on the legacy path.

Sources:
- [Electron 44.1.1 permission helper](https://github.com/electron/electron/blob/v44.1.1/shell/browser/web_contents_permission_helper.cc)
- [Electron 44.2.0 permission helper](https://github.com/electron/electron/blob/v44.2.0/shell/browser/web_contents_permission_helper.cc)
- [Electron 44.2.0 release](https://github.com/electron/electron/releases/tag/v44.2.0)

Sanitized observed payloads are in `evidence/screen-sharing-2026-09-07/`.
The diagnostic intentionally exits nonzero when it detects indistinguishable
requests; it is not part of the ordinary unit suite.

## Completed prerequisite work

- Isolated branch `codex/screen-sharing`, based on `3a0a3ad`.
- Reproducible deny-only native routing probe, with selectable Electron binary
  and optional JSON evidence output.
- Narrow Blanc hardening: reject empty, absent, or unsupported device scopes
  before prompting, reading/reusing a broad grant, persisting a decision, or
  notifying capture. Synchronous checks reject unknown device scopes too.
- Regression coverage for regular/private decisions, old broad allows, and
  continued explicit microphone/camera prompting and grants.

This safeguard closes the demonstrated unscoped path. It is not a claim that
every possible legacy/mixed capture request is distinguishable, or a substitute
for the runtime change required below. Screen sharing stays disabled.

Validation of this prerequisite change:

- `npm run test:unit`: **1,442 passed**, zero failures. The first fresh-worktree
  run failed seven packaging/compliance checks because its ignored blocker seed
  was absent; `node adblock/seed.mjs --prepare` restored the pinned seed and the
  complete rerun passed.
- `npm run substrate:check`: passed, including packaged dependency compliance.
- `npm run test:acceptance:dry`: passed (step-definition resolution only).
- `BLANC_PROBE_POLICY=blanc npm run test:display-capture:routing`: passed on
  Electron 44.1.1/macOS arm64. Actual Blanc permission handlers rejected both
  unscoped requests without a prompt or source selection, while a camera request
  still reached the device prompter (which the fixture answers Block).
- Stock 44.1.1 and 44.2.0 diagnostic routing gates: **failed as expected** on
  indistinguishable standard/legacy requests, with both native-picker settings.
- Proposed upstream patch: `git apply --check` passed against the exact
  Electron 44.2.0 source. This is applicability evidence only, not compilation.
- `git diff --check`: passed.

## Concrete revision required to continue

The selected runtime must expose a **browser-process-derived capture API kind**
that distinguishes `getDisplayMedia` from legacy desktop/tab `getUserMedia`
requests, including mixed device/desktop requests. A page-supplied flag or
preload wrapper cannot provide that authorization boundary.

`evidence/screen-sharing-2026-09-07/proposed-electron-44.2.0.patch` is a minimal
source proposal against upstream 44.2.0. It adds capture-API kind, requesting
frame identifiers, and requested stream kinds to permission metadata. It has
not been compiled, upstream-reviewed, applied to a binary, or enabled by Blanc.
Its patch applicability can be checked against the exact upstream source.

Two implementation paths are possible:

1. Obtain an upstream Electron release exposing equivalent trustworthy
   metadata, then adopt and verify that exact release.
2. Maintain a pinned patched Electron runtime, including native three-platform
   builds, provenance, signing compatibility, and update maintenance. This is
   an additional runtime-distribution responsibility beyond the approved plan.

After selecting that revision, extend the native probe to allow **only** the
new standard-display category while rejecting legacy requests, prove it reaches
source selection, and resume the controller/picker, Linux audio broker, capture
indicator/Stop, and packaged platform work. Do not add a blanket allow for
generic `media`, or trust renderer-reported capture intent as a workaround.

## Remaining release gates

Not performed: actual screen/window capture, native computer audio, Linux
helper/broker delivery, permission recovery, selective stop, iframe lifecycle,
30-minute capture, Meet/Teams compatibility, affected-machine confirmation,
candidate packaging/signing, public release, updater handoffs, asset refresh,
and the new launch soak. No release version has been allocated or published.

## Reproduction

```sh
npm run test:display-capture:routing
# Verify Blanc's deny policy while the runtime prerequisite is unresolved.
BLANC_PROBE_POLICY=blanc npm run test:display-capture:routing
# Optional: select a downloaded stock Electron and preserve sanitized output.
BLANC_PROBE_EXECUTABLE=/absolute/path/to/electron \
BLANC_PROBE_REPORT=/absolute/path/to/report.json \
  npm run test:display-capture:routing
```

## Owner-approved patched runtime and implementation checkpoint

The owner subsequently approved maintaining a patched Electron runtime and
confirmed that Windows and Linux testing is available only through Parallels
Desktop. The two-option decision above is resolved in favor of the pinned
patched runtime. This is implementation approval, not a platform-gate waiver
or permission to describe incomplete capture as working.

Work continues in isolated branch `codex/screen-sharing`, leaving the original
checkout's unrelated marketing edits untouched. The candidate now contains:

- A browser-derived API/frame-bound display controller, fresh picker consent,
  cancellation and navigation teardown, and legacy/mixed-request rejection.
- macOS native-picker consent and a screen/window picker for custom-source
  platforms. No tab-source option is exposed in the product.
- Computer-audio opt-in; native loopback on supported macOS/Windows paths and
  an output-monitor helper for Linux's PulseAudio-compatible service.
- A permanently muted, sandboxed audio bridge with one bounded IPC chunk in
  flight and a bounded stereo worklet buffer. Actual browser delivery remains
  unverified; these measures do not substitute for the native audio gate.
- Separate display/computer-audio indicators and selective Stop sharing and
  Stop devices controls. If a selective stop cannot be confirmed, an explicit
  Stop all (reload) fallback appears; it is not invoked automatically.
- Pinned Electron 44.2.0 source/build inputs, an exact-patch verifier, native
  archive staging and fail-closed packaging, source/binary/architecture checks
  for the Linux helper, and updated framework/native-component provenance.

Fresh verification at this checkpoint:

- Full unit suite: **1,457 passed, zero failures**.
- Substrate checks: passed, including regenerated compliance/SBOM checks.
- Real desktop cold-launch/focus check: passed on stock Electron/macOS arm64.
- Real picker-window smoke: passed on stock Electron 44.2.0 with **synthetic
  sources only**. Tested explicit selection, audio initially unchecked, native
  consent copy, Cancel, and requesting-owner abort.
- Stock Electron 44.2.0 with Blanc's deny policy: standard/legacy capture
  remained denied without a device prompt; real camera intent still reached
  the device prompter. This is fail-closed evidence, not working screen capture.
- Native C helper compiled with `-Wall -Wextra -Werror` in Ubuntu 24.04 ARM64
  under Parallels. Isolated generated-audio tests passed with both PipeWire
  1.0.5's PulseAudio service and standalone PulseAudio 16.1. At 48 kHz stereo,
  the output tone was present, a separate simulated default-microphone tone
  was absent, and changing the default output terminated the monitor.
  PipeWire amplitudes: output 0.29679, other source 0.00004. PulseAudio:
  output 0.30000, other source 0.00000. No microphone or desktop audio was
  recorded; generated fixture tones and in-memory analysis were used.

The local Electron source sync initially failed because Git LFS was missing.
Git LFS 3.8.0 was installed. A retry attempted an unnecessarily broad Chromium
fetch; pinning the exact Chromium commit resolved that step. Upstream patches,
PGO inputs, and build-tool hooks are progressing. The custom binary has not yet
been compiled or validated at this checkpoint. Disk usage is guarded with a
20 GiB reserve; Windows/Linux VMs share this Mac's physical disk, so their
virtual disk sizes do not represent additional build capacity.

**Still pending:** patched-runtime compilation, native successful-capture
routing, actual end-to-end video and computer audio, Linux broker delivery,
Windows VM testing, permission recovery, iframe behavior, selective-stop native
confirmation, meeting sites, 30-minute capture, native CI artifact transport,
three-platform packaged builds/signing, affected-machine approval, immutable
release, adjacent updater handoffs, final media refresh, and the fresh launch
soak. The former launch dates remain on hold. No release has been published.

## Native CI and lifecycle follow-up

The owner explicitly approved pushing candidate `60045dd` to the verified public
`bnfy/blanc` repository and running Windows/Linux runtime checks. The branch was
pushed and [runtime run 34136580900](https://github.com/bnfy/blanc/actions/runs/34136580900)
was dispatched at that exact commit, in runtime-only mode. No GitHub Release or
public updater metadata was created. The workflow builds and separately attests
the archive and build record; app validation/release jobs now require this
authenticated input. Successful transport and packaging remain unverified.

Windows reported 4 CPUs and 146.8 GiB free, then failed before source sync:
Git's CRLF checkout conversion changed the pinned patch hash. Explicit LF
attributes now cover runtime patches and the byte-verified Linux helper source.
The driver also disables autocrlf for upstream source operations. A regression
test checks actual checkout bytes with `core.autocrlf=true`. The initial Linux
job continues independently; native build success is not yet established.

The full unit suite passed **1,461 tests, zero failures** after capture reports
were constrained to native-granted scopes and Linux bridge lifecycle coverage
was added. The subsequent Windows checkout regression and relevant capture/
runtime tests passed **12 tests, zero failures**. Picker UI smoke passed again
with synthetic sources, including a 12-source viewport and visible footer.
The local macOS patched runtime is compiling with four jobs; no patched binary
or successful screen/computer-audio capture has yet been validated.

## Review fixes and local disk cleanup

The September 7 review found request-overlap, embedded-frame lifecycle, and
Linux audio-consumer cleanup defects. The candidate now serializes pending
display calls without emitting settlements for local overlap rejections, and
reject notifications cannot dispose active shares or pending consent. A
native permission denial for an active-share retry therefore leaves the
original share intact.

Embedded-frame display requests are now denied before reserving the window.
This is a deliberate compatibility limit while the session preload observes
only main frames; embedded meeting pages must be opened as their own page to
share. Native subframe completion/destruction support is still required before
that restriction can be lifted. It is not marked as a successful iframe gate.

Linux audio is disposed independently when its final audio track ends, even
while screen video continues. The bridge also continues checking native
consumer lifetime after startup, so loss of the audio consumer stops the
monitor without depending on a page report.

After the owner reported disk consumption, the local Electron build was
stopped and its approximately 38 GB disposable source/build tree was removed,
along with the downloaded stock runtime and its archive. Source changes,
patches, tests, and small diagnostic logs were preserved. Local native
compilation remains incomplete; it must not be restarted without an agreed
build-capacity plan. No native capture or release gate is implied by these
source-level fixes.

Verification after these fixes: **1,466 unit tests passed, zero failures**;
JavaScript syntax and `git diff --check` passed. Free space increased from
71 GiB before cleanup to 109 GiB afterward. No local native build is running.

Owner-observed Mac smoke checks passed using installed stock Electron 44.1.1:
synthetic-source picker selection/audio opt-in/cancellation, all six denial
routing cases with the system-picker setting on/off, and Blanc cold-launch
new-tab/focus behavior. An optional `BLANC_SMOKE_WATCH=1` paces the checks.
The picker and pre-native-picker consent windows were then centered explicitly
in the requesting display's work area; macOS uses a positioned child instead
of a title-bar sheet, with owner interaction disabled until dismissal.
The visible rerun verified both dialog sizes within one display coordinate
unit of center, no button focus outlines, and owner restoration after Cancel
and abort. Keyboard focus uses a subtle background change; the owner requested
removing the initially added underline. A fixture
startup race exposed by this rerun was fixed with an explicit readiness signal.
These remain UI and denial checks; actual native sharing is still unverified.
