# Windows reliability feedback — October 3, 2026

Candidate work; no new public release or extension runtime is claimed.

## Changes

Core menu commands and Windows/Linux before-input dispatch share definitions
and execution, including retained aliases. Surface ownership is checked when
input arrives; held closed views lose these handlers through the existing
exact-listener teardown. Settings requests during navigation are idempotent;
only a loaded visible sheet toggles closed. Failed sheets discard their cached
state, and deferred address focus validates generation and live guest identity.

Official Electron 44.4.0 shipped upstream fix #53776. The candidate retains the
locked official 44.5.1 runtime. A standalone sandboxed live listing/detail probe
verified the runtime, absent chrome.webstorePrivate, and 30-second survival
before the workaround was removed. No sandbox or extension API was enabled.
The single network listener still applies blocker state and site exceptions.

## Local evidence

- Exact npm ci installation; installed package and actual executable are 44.5.1.
  The original website checkout's 44.4.3 dependencies were left untouched.
- Lint, all 2,052 unit tests, substrate/compliance, and the production dependency audit passed.
- Standalone live Web Store listing/detail probe passed on macOS.
- Seven Blanc live-page paths passed: direct listing, redirected detail, popup,
  Personal private, named regular/private, and restored quiet tab.
- 81 native menu commands passed the macOS tab/Settings stress sequence.
  Windows/Linux source checks use WebContents.sendInputEvent, including actual
  before-input interception, and are wired into the hosted platform matrix.
  The sequence also covers permission surfaces, parked-view teardown, aliases,
  single dispatch, private-tab exclusion, reopen, and per-window ownership.

- The first full desktop acceptance run passed 167/168 scenarios. Its typography
  probe referenced the retired `.ob-commands` onboarding selector. The probe
  now samples the current onboarding paragraph; the complete rerun is pending.
- A private macOS signed unpacked build passed pinned-certificate/profile,
  payload, browser registration, and fuse checks. The final build and packaged
  Settings crash-recovery regression are pending. These are private candidates,
  not notarized public-release or updater evidence.

## Remaining gates

Hosted native input and private signed Windows/Linux artifact results will be
recorded after completion. Installed affected-machine Windows confirmation is
required before merging. Hosted source checks and directly launched installers
are not in-app updater handoff evidence. No handoff or release is claimed.
The screenshot does not establish a reproducible cause for every reported
freeze; this work addresses command/focus/lifecycle paths and adds regression
coverage, rather than claiming all freezes are resolved.
