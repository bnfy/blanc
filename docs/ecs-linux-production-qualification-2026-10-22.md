# Linux ECS sandbox fix — production qualification

Status as of October 23: not approved for production. All work is on
`codex/ecs-native-qualification`. No publication, merge or production feed
change is authorized or performed; installers exist only for isolated tests.

The AppImage startup/restart blocker is now resolved in the isolated candidate:
[39956564587](https://github.com/bnfy/blanc/actions/runs/39956564587) passed both
real updater handoffs, successor protected video, kernel isolation, offline
startup and the local HTML security matrix. Broader release gates remain below.

## Scope and gates

The candidate contains the exact-hash ECS 44.9.3+wvcus Linux x64 zygote patch
and the pre-sandbox CDM preload helper documented in
[the sandbox diagnosis](ecs-linux-cdm-sandbox-2026-10-22.md). The current
production runtime, fuses, macOS entitlements and installed app are unchanged.
The stable ECS release was checked again during qualification and is still
44.9.3+wvcus.

This follow-up requires:

1. Ordinary browsing starts when the CDM is absent and its download cannot
   resolve hosts; going online installs the CDM without hanging startup.
2. A subsequent offline launch with the installed CDM starts normally, using
   the scoped preload. The offline probe blocks DNS through Chromium; it does
   not claim an OS-level air-gap or offline content licences.
3. Encrypted playback and the kernel/local-HTML security matrix still pass.
4. Cached component activation follows Chromium's persisted registration on
   updates and rollbacks. Synthetic metadata tests must be distinguished from
   actual vendor-signed CDM binary transitions.
5. A real AppImage update is downloaded from an isolated loopback feed, the
   ordinary Restart Now prompt is accepted, the installed image matches the
   staged hash, and the replacement starts with its own required runtime
   resources and the same isolated profile.

## Corrected cache-selection bug

The preload helper previously sorted version-named directories and picked
the highest. This ignored Chromium's saved registration when an older version
was intentionally selected. The synthetic rollback test reproduced it:
registered 4.10.10.0, higher cached 4.10.11.0, incorrectly chose 4.10.11.0.

The helper now follows the installed `latest-component-updated-widevine-cdm`
hint, validating that its directory remains inside this profile. In the
absence of a hint it first tries the registered Widevine `pv` in
`Local State.updateclientdata.apps.oimompecagnajdejgnnjijobebaeigek` (under the
candidate's `chromium` session directory, with legacy root fallback), matching
Chromium's component installer's preference for an existing registered
version. The fallback retains the version scan when no registered directory
exists. Update and rollback metadata tests both pass after the fix. These
tests execute no CDM code and are not proof of a genuine binary rollback.

Primary sources:

- [Chromium component selection](https://chromium.googlesource.com/chromium/src/+/152.0.7977.167/components/component_updater/component_installer.cc)
- [Persisted `pv` registration](https://chromium.googlesource.com/chromium/src/+/152.0.7977.167/components/update_client/persisted_data.cc)
- [Widevine component identity](https://chromium.googlesource.com/chromium/src/+/152.0.7977.167/chrome/browser/component_updater/widevine_cdm_component_installer.cc)
- [Active CDM hint](https://chromium.googlesource.com/chromium/src/+/152.0.7977.167/chrome/common/media/component_widevine_cdm_hint_file_linux.cc)

The adapter also now requires a restart for a native `updated` result even
when a previous version was present, and for a registered version that differs
from the preloaded version. A candidate-only periodic status check detects
later background changes; it never starts overlapping installations. Synthetic
regression tests cover these transitions separately from real playback.

## Earlier native results (before the AppImage correction)

The initial qualification run is
[39897225232](https://github.com/bnfy/blanc/actions/runs/39897225232), and the
rerun with registered-version selection and early relaunch diagnostics is
[39897411504](https://github.com/bnfy/blanc/actions/runs/39897411504).
The final active-hint/restart-state run is
[39897629915](https://github.com/bnfy/blanc/actions/runs/39897629915).

That final run passed all native checks except the real updater handoff:
Its payload source is `5d7d49313`. A subsequent unit-tested fallback correction
reads the registration from the observed `chromium/Local State` path when the
active hint is absent; the native run used an active hint and does not claim a
native exercise of that missing-hint case.

| Check | Final result |
| --- | --- |
| Fresh DNS-offline startup | Pass, browser ready in 1,017 ms; CDM installation failure stays nonfatal |
| Online installation | Pass, browser ready in 1,017 ms; CDM installation requires restart |
| Cached DNS-offline startup | Pass, browser ready in 1,014 ms; CDM ready |
| Protected video | Pass, no media errors; actual encrypted track required |
| CDM kernel sandbox | Pass: seccomp 2, NoNewPrivs 1, separate user/PID namespaces, no no-sandbox flag |
| Local HTML/frames/workers/WebRTC | Pass, zero HTTP and STUN canary traffic |
| Update/rollback cache selection | Pass in synthetic metadata fixtures; not a vendor binary rollover |
| Real Restart Now handoff | Fail: download and byte-exact replacement succeeded; replacement did not reach startup marker |
| Synthetic profile/install cleanup | Pass |

The local full suite passed all 4,252 tests; lint passed. Installed production
executable and app.asar hashes remain unchanged, and the production runtime,
fuse settings, signing inputs and entitlements have no diff.

The initial run passed protected playback, kernel CDM isolation and local HTML
security again. Offline startup passed in 913 ms with no installed CDM; the
online install launch took 1,011 ms and correctly required a restart; cached
offline startup took 1,016 ms and was ready. These are startup measurements,
not download timings. All three launches exited normally and the profile was
removed. The cache contained the real active-directory hint.

Its actual updater test downloaded the next AppImage through the loopback
staging feed, accepted the normal Restart Now prompt, exited the old app, and
replaced the installed file with bytes matching the staged SHA-256. The
replacement did not become browser-ready. Thus installation succeeds but the
handoff is not qualified; metadata discovery and file replacement are not a
passing updater result.

The same failure repeated after adding the early launch record: the new
candidate did not write it. Therefore the precise first failure is not yet
proven to be the profile guard. Empty-argument relaunch and inherited external
preload paths are known integration gaps, not an established complete root
cause. Capture the replacement's native/AppRun startup before changing that
guard, and make profile/preload initialization self-contained in the AppImage.
The final installed SHA-256 matched the staged image:
`0c949e2b5fbbbaab8ca6d969f25e8e0faf8d5ccecd08e748645fdc1caef856fc`.

The early launch record is test-only and owner-profile-only. It records just
PID, candidate version and whether the native user-data switch matches, so a
relaunch rejected before app readiness can still be diagnosed and cleaned up.

## Remaining release boundary

The original candidate depended on its explicit launcher to supply the native
user-data argument and the preload helper environment. The locked
electron-updater AppImage implementation starts its replacement with an empty
argument list and inherited environment.

### October 23 AppImage startup correction

Captured child stderr in
[39953391475](https://github.com/bnfy/blanc/actions/runs/39953391475)
located the original failure before JavaScript:
`Zygote process exited prematurely with exit code -1`. Its inherited old-image
directory and preload helper both still existed at spawn time. Supplying only
a new in-image launcher was insufficient; the outer AppImage runtime also
needed a clean native launch environment.

The candidate now packages `AppRun`, `blanc-ecs-launcher`, and the preload shim
inside each image. It creates a dedicated owner-only candidate profile when
launched without arguments, restores the native profile switch on updater
relaunch, validates local CDM selection before Electron starts, and changes to
the stable profile directory. The updater adapter removes old mount paths and
loader/Electron/Chrome environment variables before executing the next image.
It retains the ordinary download/install/Restart Now implementation and the
explicit install-without-reopening contract. Neither the core fuse target nor
the kernel sandbox is bypassed.

In [39955277824](https://github.com/bnfy/blanc/actions/runs/39955277824),
the first replacement reached browser-ready with its original isolated profile
and its own preload helper while the old unpacked tree was unavailable. That
run was not a passing qualification: successor playback observation failed
because the shared debugging port was still occupied. The test now assigns a
different loopback-only port to each candidate version, holds the following
metadata response until playback is checked, persists phase checkpoints, and
closes diagnostic pipes and staging connections during cleanup. A successful
native run must still verify both complete handoffs and both encrypted-media
pipelines; replacement bytes and browser-ready alone are insufficient.

### Passing native qualification of the AppImage correction

Run [39956564587](https://github.com/bnfy/blanc/actions/runs/39956564587), from
source `421cc49ae8bbc7de59f1a6801588bbf7aed85952`, passed every Linux job step.
It built three isolated ECS 44.9.3+wvcus candidates and used the normal
downloaded-update dialog for both `1.43.0-ecs.1 → .2` and `.2 → .3`.

| Check | Result |
| --- | --- |
| Standalone AppImage, no repository launcher/profile/preload arguments | Pass; dedicated candidate profile created before Electron startup |
| First Restart Now handoff | Pass; old browser exited, exact `.2` bytes installed, `.2` became ready in the same profile |
| Second Restart Now handoff | Pass; old browser exited, exact `.3` bytes installed, `.3` became ready in the same profile |
| Old loose installation dependency | None; old unpacked tree unavailable during both handoffs |
| Protected video after each handoff | Pass; CENC H.264 track, production test licence backend, advancing playback, zero media errors |
| CDM after each handoff | seccomp 2, NoNewPrivs 1, separate user/PID namespaces, no no-sandbox flag |
| Fresh / online / cached-offline startup | Pass, 1,012 / 1,116 / 1,013 ms respectively; all normal exits |
| Initial and final successor local HTML | Pass through initial load, reload and restart; no readable file frame, script mutation, HTTP canary or STUN packet |
| Temporary profile and installation cleanup | Pass; both removed after shutdown |
| Synthetic cache update/rollback | Pass; not a genuine signed CDM binary transition |

Installed successor SHA-256 values matched their staged images:

- `.2`: `63cb3ae27a24b1d60d97d75cd9b128b457aea332cb320eddf6bd63eb44706834`
- `.3`: `a48f1a5c78cb7f6cad0e759ec6ca78a42f5dee4b1d8a91c03fb22e9ba721eb27`

Playback advanced from 0.085 to 5.020 seconds in `.2` and from 0.083 to 5.002
seconds in `.3`. Both returned the expected Linux `PLATFORM_UNVERIFIED` status;
this is not a Linux VMP verification claim. The fixture's video is encrypted;
its audio track is not. The headless runner has no ALSA device, so this is not
an audible-audio or account-based Spotify/Netflix acceptance test. The logged
ALSA warnings and transient startup graphics/GLib messages did not become
media errors or a restart failure.

The latest local suite passed 4,254 tests with zero failures and one Linux-only
native launcher test skipped on macOS; that launcher test passed on the Linux
runner. Lint passed. Production executable/app.asar hashes and the unchanged
runtime, fuse, signing and entitlement inputs were rechecked. Evidence is
saved locally under `self-contained-qualified` in the isolated qualification
workspace; CI uploads only sanitized JSON, never installers or profiles.

Actual CDM version upgrades/rollbacks, including a revoked or incompatible
older CDM, require authentic vendor binaries and production licence responses.
No synthetic directory/manifest version is presented as that evidence. Public
N-1-to-ECS migration remains separate from these two candidate-to-candidate
handoffs.

Do not release this candidate. The AppImage correction is verified, but genuine
CDM version rollover/rollback, the preceding-public-version migration/handoff,
account-based platform acceptance and the normal production package gates
remain separate. The exact-hash native CDM patch is still an experimental
candidate mechanism, not an implicitly approved production runtime.
No vendor-email confirmation or waiver was assumed.
