# Screen-sharing prerequisite — September 7, 2026

Status: **implementation blocked at the runtime authorization gate; no release**.
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
