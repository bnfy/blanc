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
  now samples the current onboarding paragraph; all 168 scenarios passed in
  the complete rerun.
- A private macOS signed unpacked build passed pinned-certificate/profile,
  payload, browser registration, and fuse checks. The final pre-follow-up build and packaged
  Settings crash-recovery regression also passed. These are private candidates,
  not notarized public-release or updater evidence.

## Hosted findings and follow-up

The first source matrix run exposed additional real transition failures:
rapid new-tab navigation could recursively replace a failed error page on
Linux, back-to-back native reloads terminated the hosted macOS process, and
Windows delivered Ctrl+W from a parked guest through Electron's native menu
fallback. The candidate now serializes programmatic tab navigation/reload,
checks identity/ownership before starting deferred work, suppresses superseded
and recursive error presentation, and consumes browser accelerators in the
held firewall without retaining active handlers. The unchanged rapid input
sequence passes locally; the updated hosted matrix remains pending.

Private platform validation run
[37140680291](https://github.com/bnfy/blanc/actions/runs/37140680291)
passed signed Windows and Linux packaging, packaged Settings/tab crash recovery,
and Ubuntu 22.04/24.04 sandbox checks at `f1b39b6c`. Those artifacts predate the
transition follow-up and must not be used as final candidate confirmation.
The hardened packaged macOS compatibility and existing release-regression
smokes passed before that follow-up. Fresh final evidence will be recorded.

## Remaining gates

Hosted native input and private signed Windows/Linux artifact results will be
recorded after completion. Installed affected-machine Windows confirmation is
required before merging. Hosted source checks and directly launched installers
are not in-app updater handoff evidence. No handoff or release is claimed.
The screenshot does not establish a reproducible cause for every reported
freeze; this work addresses command/focus/lifecycle paths and adds regression
coverage, rather than claiming all freezes are resolved.

The corrected `59e75421` source matrix passed all 81 native input/menu commands
on Windows, Linux and macOS. Windows/Linux then hit a polling-harness error
parsing an empty pre-commit Store URL; the polling guard now waits for a real
Store URL. This does not weaken the title, live-document or absent-API checks.

Private run [37141192162](https://github.com/bnfy/blanc/actions/runs/37141192162)
passed at `59e75421`, including signed Windows, Linux packaging, packaged
Settings crash recovery and both Ubuntu sandbox jobs. At `61a12f8f` the complete
Windows/Linux source command + Store jobs passed. The follow-up restores the
original synchronous first navigation for a fresh guest: deferring that first
load had invalidated a fill capsule and briefly changed the blank-tab prompt.
All three affected acceptance scenarios passed again, with serialization still
applied to subsequent navigation/reload. Fresh complete checks remain pending.
