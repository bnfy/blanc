# ECS production integration — not released

This is the integration follow-up to #1061, based on merged main
`b514ff64caa4b6a4954bbf5dddedbd78ca2ff2e4`. It is not shipping approval.
Nothing here installs over the public app or updates the public feed.
Main's subsequent Split View update (`33da400fe`) is now merged into this
integration branch. Earlier signed binaries and native evidence below predate
that source update and do not by themselves qualify the merged result.

## Build and signing boundaries

`npm run dist:ecs -- --mac --arm64 --dir` builds the normal Blanc entrypoint,
app identity, profile layout, browser registration and updater in `dist-ecs/`.
The build always passes `publish: never`. It includes uBO for internal runtime
qualification; that marker is not public-distribution clearance. Default
`npm start`, `npm run dist` and `scripts/release.sh` still select official
Electron. The official dependency/lockfile, production fuse configuration and
macOS entitlement files are unchanged.

`build/ecs-runtime.json` pins the exact ECS tag, vendor source commit, Chromium
version and four archive digests. Packaging verifies the downloaded bytes and
records the selected archive and framework hashes in package metadata and the
runtime SBOM. Linux additionally records its exact native patch receipt. The
Linux patch is still explicitly experimental until this integrated package's
native qualification completes.

Only immutable `blancRuntime: ecs` package metadata activates shared DRM startup
and file isolation. CDM installation is bounded and does not block browser UI.
macOS uses the previously tested video-frame transfer switch, preserving GPU
compositing, hardware video decoding, WebGL and WebGPU. Local HTML opened through
macOS LaunchServices is a static, isolated snapshot; scripts, external resources,
frames, workers and network access are intentionally unavailable. Raw `file:`
access from web content remains denied. Windows/Linux command-line local-file
opening is not newly enabled by this change.

The ECS-only file-privilege fuse is set before VMP signing. macOS then gets
Developer ID signing; Windows gets Authenticode **before** EVS signing. Final
VMP verification runs after the platform signing step. macOS's existing
provisioning profile and narrow Plugin-helper library-validation exception stay
unchanged. Linux uses the self-contained launcher, isolated CDM preload, and
sanitized AppImage updater environment from the candidate qualification.

Local EVS builds require `BLANC_EVS_PYTHON`, `EVS_CONFIG_FILE` and
`EVS_CACHE_FILE` pointing to the already configured EVS client/account. Never
commit credentials or include them in diagnostic artifacts.

## Private native CI

Dispatch the existing `release-windows-linux.yml` workflow on the integration
branch with `mode=validation`, `ecs_production=true`, `platform=all`. Both older
candidate inputs must remain false. Input validation rejects any release-mode
combination. The jobs have read-only repository permissions and upload sanitized
JSON evidence only, never installers, profiles, signing tokens or update feeds.

Windows signing uses the `ecs-signing` GitHub environment. Its two EVS secrets
were explicitly authorized by the owner on October 23. Required reviewer is
`bnfy`, administrator bypass is disabled, and the only permitted branch is
`codex/ecs-production-integration`. Each run needs the owner's environment
approval. Submit an approval on the owner's behalf only when they explicitly
authorize that exact run. Authentication-cache refreshes exist only on the
ephemeral runner; if the saved refresh token expires,
refresh the approved secret through the same protected procedure.

## Evidence gathered while preparing this PR

- The first integrated Apple Silicon app passed Developer ID, embedded profile,
  strict deep codesign and final production VMP verification. It is not yet
  notarized and is not a final release artifact.
- Its real uBO UI passed network/cosmetic blocking, private-tab separation,
  dashboard/popup/logger, quiet/wake, filter persistence, three provider restarts,
  LaunchServices reopen and native Quit.
- Two fresh offline starts completed in 920/934 ms; default-world web probes
  could not read a local file, start a file worker or read a local iframe.
- The LaunchServices local-HTML test passed initial load, reload and relaunch:
  scripts did not execute, nested local frames were unreadable, navigation was
  denied, HTTP/STUN canaries received zero requests, and temporary profiles were
  removed. An initial harness attempt incorrectly used command-line file input
  on Mac; it was corrected to exercise the existing OS Open File boundary.
- The first Linux integration CI run built successfully and passed the native
  launcher/profile unit tests, but provider restart failed. Its normal app
  relaunch retained the old AppImage loader environment; the follow-up scopes
  cleanup to ECS and to irreversible quit, retaining the captured outer image.
  The follow-up native run passed all three provider restarts, renderer kernel
  sandbox checks and subsequent launch with persisted filters. That run then
  exposed an offline-test cleanup problem: disconnecting CDP was killing the
  AppImage wrapper before its browser exited. The harness now requests normal
  browser termination first; fresh offline evidence is still required.
- Windows run `39976383333` passed streaming VMP signing/verification and final
  timestamped, exact-publisher Authenticode verification for app and installer.
  Its uBO and two offline/file-boundary runs passed; the workspace test then
  rejected ECS's 44.9.3 because it still expected the ordinary 44.8.0 runtime.
  The corrected expectation is bound to the verified package's ECS archive pin.
- The integrated Apple Silicon package passed fresh production VMP Lab with
  `PLATFORM_SOFTWARE_VERIFIED`, actual CENC video, advancing playback, no media
  errors and a sandboxed Plugin CDM process. File reads and process forks were
  denied; process-exec introspection was unavailable, not counted as a pass.
- Earlier main-based candidate Spotify/Netflix results remain regression
  references, not proof for this newly integrated package.
- Linux run `39978942203` passed on integration head `a2e90734c`: package/fuse
  verification, uBO and three restarts, offline startup and file denial,
  encrypted video, exact CDM role with seccomp/NoNewPrivs and separate user/PID
  namespaces, workspace recovery and synthetic media permissions. VMP reports
  `PLATFORM_UNVERIFIED` on Linux, where VMP is not supported; this is not claimed
  as Windows/macOS production VMP verification. The later main merge requires
  fresh validation.

Evidence files from preparation are under
`/private/tmp/blanc-ecs-production-XN2ipC/`; hosted evidence must be bound to the
exact PR head. Never carry passing results forward across runtime/package changes.

### October 23 native Intel and updater qualification

The current signed application source is `562ec1c87`. Later qualification-only
commits change the harness/workflows, not those signed application bytes.
Windows and Linux integrated-package run `39980371624` passed on that source.
Both Mac architectures were rebuilt, production EVS/Developer ID signed,
notarized and stapled; strict signatures, embedded profile, Gatekeeper and final
VMP verification passed. The native Intel transfer pins the archive, executable
and `app.asar` hashes independently.

The owner approved a temporary **unpublished** draft solely to transfer the
notarized Intel app to the ephemeral native Intel runner. They separately
approved a signed/notarized updater fixture with staging-only version/build
metadata in a disposable build copy. These approvals do not permit publication,
a public tag, a production version bump, an installed-app replacement or a
production-feed change. Delete the transfer draft/assets and remove the
temporary elevated-permission intake jobs when their tests finish.

Native Intel run `39983595705` passed uBO UI/blocking/private separation, three
provider restarts, reopen/native Quit, two offline starts (6882/5106 ms), local
file/frame/worker denial and temporary-profile cleanup. It did **not** pass
protected playback. Run `39986448419` reproduced the failure despite more than
ten seconds buffered: production VMP verified, MediaKeys were present and the
video was unpaused without a media error, but the clock advanced only 0.1 s in
five seconds. Run `39987596722` then isolated the audio path: foreground focus
did not restore advancement, but muting advanced protected video about 4.97 s in
five seconds. The Intel runner reports a virtual CoreAudio input/output device.
This is not proof of working unmuted audio on a physical Intel Mac, and the
strict unmuted check remains failed. Focus/mute comparisons must never turn
that failure into a pass.

The same run verified the unchanged Apple stapled-ticket and Gatekeeper checks
over HTTPS/TCP in CI. The temporary runner firewall anchor works around the
documented macOS Intel runner HTTP/3 failure and is removed on exit; it does not
disable certificate or ticket verification.

Linux updater attempts downloaded through the loopback staging feed, accepted
the ordinary Restart Now prompt and replaced a versionless AppImage with the
exact expected bytes. Window inventory and native logs showed that the
successor then exited during the sandboxed-zygote handshake, not a window
selector failure. Replaying the inherited environment reproduced the failure;
cleaning it or using an ordinary fresh launch opened the same installed bytes.
Run `39992102538` narrowed this to the inherited `CHROME_*` family: clearing
only loader, Electron, or path variables did not fix it. The candidate launcher
now discards inherited Chromium executable/helper selectors before `exec`,
allowing the new runtime to initialize its own values, including on the first
hop from the unmodified public app. Native run `39992749821` on `4fbac7dc6`
passed: CENC video advanced about 4.94 s with MediaKeys and no media errors;
the CDM retained seccomp 2, NoNewPrivs 1, separate user/PID namespaces and no
sandbox-disable flag. Offline starts took 1278/1197 ms; file/frame/worker reads
were denied, uBO and compatibility checks passed, and profiles were removed.
Run `39993714147` then passed both real versionless AppImage handoffs:
`1.42.1 -> 1.43.0-staging.1 -> 1.43.0-staging.2`. Each automatic successor
played encrypted media for about five seconds with MediaKeys, no media errors,
and the same kernel-sandbox properties. Disposable profiles were removed.
Final offline/web-file checks passed (1578/1398 ms). That workflow still failed
because it additionally invoked the macOS-only LaunchServices test on Linux;
the corrected workflow uses the cross-platform file/frame/worker probe and
adds a file-origin service-worker denial assertion. Its complete rerun remains
required. Run `39994393460` completed that rerun successfully: both handoffs
advanced protected media about 4.96 s, both retained the required CDM sandbox,
and the final offline starts took 1780/1141 ms with file/frame/worker/service-
worker access denied. Its disposable profile was removed. Neither partial
replacement evidence nor a separately launched app counts as a completed
handoff; these passing results came from the actual automatic successors.
The rehearsal explicitly warms a real CDM first; first-ever CDM restart UX is
still a separate, unqualified gate.

## Remaining shipping gates

The CDM lifecycle follow-up adds an ECS-only Protected media section in
Settings → Help, with sanitized readiness and a restart action routed through
the normal unsaved-page/quit guard. Ordinary Electron builds hide it and cannot
invoke a DRM restart. It does not expose component selection or download APIs.
The seven messages are translated in every supported interface language.
These application changes require fresh platform packaging/signature/acceptance
evidence; the signed `562ec1c87` binaries above do not contain this new UI.

The new lifecycle gate in `release-windows-linux.yml` is Linux-only,
ECS-validation-only, read-only and unpublished. It starts without a CDM, checks the restart UI,
requires an automatic relaunch from that button, and exercises unmuted CENC
playback. Real 4.10.3050.0 and 4.10.3112.0 Google CRX packages are pinned to
Mozilla's immutable upstream SHA-512 records. The test then checks the vendor
update, exact mapped binary hashes and the existing kernel-sandbox assertions,
followed by a stopped-process cache rollback and offline startup. The rollback
is a controlled cache operation, not a claim that Google's service offered a
downgrade. Only the component-check schedule changes in this disposable test;
signatures, production update endpoints and sandbox checks are not disabled.
Linux lifecycle run `39998789399` passed on `d4076c82f`. First-install UI
was ready in 1238 ms, showed the restart guidance, and the actual button caused
an automatic successor reporting `ready`. Unmuted CENC advanced about 4.93 s
after that restart. A separate profile containing only 4.10.3050.0 then took a
real vendor update to 4.10.3112.0; its button-triggered successor advanced about
4.93 s. Controlled rollback to the genuine older binary advanced about 4.91 s
and remained ready offline. Every playback mapped the expected SHA-256 and
retained CDM seccomp 2, NoNewPrivs 1, separate user/PID namespaces and no
sandbox-disable flag. All media error lists were empty. Profiles were removed.
The captured first-install and update guidance rendered correctly. Follow-up
offline starts took 1099/1141 ms with file/frame/worker/service-worker/Node
access denied. This qualifies Linux's real-binary lifecycle and restart UI,
not automatic vendor downgrade policy or the other platforms' lifecycle.

Run `39997559037` exercises the lifecycle on application/test source
`ba502510b`. It supersedes queued run `39997387455`; the replacement requires
a separate old-only profile and proves the newer binary did not exist before
the vendor update. Local validation passed 4,292 unit tests (two existing
platform skips), lint, copy/bridge checks and the complete substrate gate.
The new settings status and restart IPC also reject websites, other internal
pages, unowned surfaces and subframes in direct handler tests.

The superseded run was canceled after its 18:05 UTC deadline. Its retained
logs and artifact confirm baseline checks passed, but its lifecycle step hung
without a final report. It is not a lifecycle pass; the bounded replacement
`39998789399` provides that evidence.

### Fresh signed packages with the DRM UI (October 23)

Fresh Apple Silicon, Intel Mac and Windows packages were built from
`fd865414726d703ce07a50594deeb189665efe10`, including the new Protected media
status/restart UI. Both Mac bundles passed Developer ID, embedded profile,
strict-deep signature, exact fuse and EVS verification, followed by Apple
notarization, stapling and Gatekeeper acceptance. Their signed payloads are
preserved locally under `signed-fd8654147`; notarization did not change either
`app.asar`. No installed app, default runtime, production entitlements or feed
was changed.

The fresh native Apple Silicon package passed offline startup (3299/914 ms),
web and local-HTML file/frame/worker/service-worker boundaries, zero HTTP/STUN
egress from the local preview, uBO controls and real restarts/reopen/native
Quit, workspace recovery, and synthetic camera/microphone permission checks.
The actual settings card displayed the localized ready message with its
restart button hidden. A first DRM probe failed before playback with
`ERR_BLOCKED_BY_CLIENT`; preserve this initial failure. A diagnostic fresh-profile
probe and a repeat of the unchanged acceptance test both subsequently passed
production VMP (`PLATFORM_SOFTWARE_VERIFIED`), unmuted CENC playback advancing
about 4.95 seconds, no media errors, and sandboxed Plugin-helper restrictions.
The initial navigation failure has not been root-caused or silently waived.

Fresh Windows validation [39999763727](https://github.com/bnfy/blanc/actions/runs/39999763727)
passed with final exact-publisher, timestamped Authenticode and EVS signatures.
VMP reported `PLATFORM_SOFTWARE_VERIFIED`; protected CENC playback advanced
4.98 seconds with MediaKeys and no media errors. Offline starts took 1178/1053
ms; web file/frame/worker/service-worker/Node access was denied. uBO restarts,
workspace recovery and synthetic media permission checks passed. Temporary
profiles and signing credentials were removed. CI retained sanitized reports,
not public installers.

The new Intel bundle is notarized but native acceptance remains pending.
Its local Rosetta checks are not native Intel evidence: the first offline
launch exceeded the existing 15-second CDP deadline, and uBO correctly hit its
explicit unsupported-Rosetta guard. The subsequent ready-status UI and local
HTML isolation checks passed. Workspace recovery, synthetic media permissions
and protected playback subsequently passed too: VMP verified, unmuted CENC
advanced about 5.04 seconds without media errors, and the Plugin helper stayed
sandboxed. One blocked network request remains in that playback report even
though the playback gate passed. Neither the timeout nor the guard was relaxed.
The pending native Intel audio/updater runs still exercise older immutable
signed bytes, not this new UI. Native Intel and updater/lifecycle checks below
remain separate shipping gates.

### Spotify and Netflix acceptance on the fresh signed Mac package

On October 23, both services passed on the native Apple Silicon package built
from `fd8654147`, using a separate signed-in profile rather than the installed
production profile. Spotify played on **This web browser**: the audio pipeline
reported CENC-encrypted AAC and a usable DRM key, its playback position advanced
from 2:12 to 2:22 over ten seconds, and no DRM/media errors were recorded.
The visible looping video was unencrypted and muted; it was not used as proof
of protected-audio playback.

Netflix played CBCS-encrypted AV1 at 1920×1080 with MediaKeys present and no
DRM/media errors. Its clock advanced from 22.528 to 32.533 seconds during a
ten-second sample. The owner confirmed smooth playback with no rapid flicker.
GPU compositing, accelerated video decode, WebGL and WebGPU remained enabled.
The sample recorded eight dropped frames among 250 total frames; this is not
a claim of zero dropped frames or an automated visual flicker measurement.

With both services active, two Plugin-helper CDM processes held Widevine.
Both were sandboxed and denied unrelated-file reads and process forks;
process-exec introspection was unavailable (`-1`), not counted as a denial.
Local sanitized evidence is preserved in the isolated
`service-session-fd8654147-sxYmmu` directory (`spotify-verification.json` and
`netflix-verification.json`). No cookies, credentials, content URLs, DRM key
IDs or license data are part of those reports. The signed `app.asar` remains
`111ad8adb76ac4c45902bddedd6593410f58376e49d6605a9d8f4d51a0f0ee36`.
Installed production executable and `app.asar` hashes still match their
pre-qualification values.

### CodeQL follow-up

The `7e69d1fac` PR analysis reported four alerts in test code. The fixture
reader now attempts the read directly and only falls back on `ENOENT`, rather
than checking a path and reading it later. The vendor-update precondition now
requires the entire newer-version directory to be absent in the stopped,
owned profile, rather than testing one binary path. Regression tests retain
the real-update requirement and reject other read errors. The protected-page
unit test checks the exact quoted Widevine server mapping instead of an
unanchored URL regular expression. Fresh CodeQL/native validation is required
before considering these three findings closed.

The owner approved dismissing only alert
[#193](https://github.com/bnfy/blanc/security/code-scanning/193) as a false
positive. Its unchanged fixture download rejects any archive whose exact
length or SHA-512 differs from the immutable upstream pin before writing to
fixed paths in an owned temporary directory. It is not packaged into Blanc.
The dismissal and rationale were recorded in GitHub; no query, workflow gate,
digest validation or sandbox assertion was disabled.

The focused regression tests and lint pass. The complete unit rerun passed
4,294 tests with two existing platform skips. The first attempt was sandboxed
and could not bind the two existing localhost fixtures; the unrestricted rerun
passed without changing those tests.

Intel updater run `39994442871` verified the exact replacement, normal Restart
Now, automatic relaunch, strict signatures and Gatekeeper. It then timed out
before the loopback protected test page became ready; no playback pass is
claimed. Its report removed both disposable profile and installation. The
harness now records probe GET/readiness, waits for the successor window, selects
the address field explicitly and retries only input producing no navigation
request. Actual page/player errors remain fatal. Retry `39999246654` uses the
same signed bytes; Intel audio comparison `39996278144` is still separate.

### Native Intel audio comparison

[Run 39996278144](https://github.com/bnfy/blanc/actions/runs/39996278144)
completed all six controls for each unmodified runtime (official Electron
44.9.3 and pinned ECS 44.9.3), with no media errors. Unmuted PCM advanced
3.88/4.90 seconds in official Electron and 4.77/4.94 seconds in ECS at
44.1/48 kHz respectively. Both Web Audio clocks advanced normally. The native
CoreAudio probe advanced about five seconds at both input rates on the
runner's virtual output. Muted controls also advanced, but are not used to
qualify unmuted playback.

This does not reproduce an ECS-only or universally broken host-audio path.
It also does not qualify the full signed Blanc DRM player, which previously
stalled. The next isolated comparison retains all PCM/native controls and
adds equal locally encoded AAC controls at both rates, muted and unmuted,
to separate codec behavior from full Blanc/DRM integration. It requires no
signing credentials, private transfer assets or device-setting changes.
The expanded comparison passed focused tests, lint and the complete local
unit suite (4,295 passed, two existing platform skips); native results remain
pending in [run 40004110864](https://github.com/bnfy/blanc/actions/runs/40004110864).

The CodeQL fixes passed analysis on `920fe9cf9`. The real Linux lifecycle
rerun [40003504389](https://github.com/bnfy/blanc/actions/runs/40003504389)
also passed with the stronger no-current-version-directory precondition.
First-install UI was available in 1446 ms. Fresh install, older baseline,
real vendor update and controlled rollback each played unmuted CENC about
4.9 seconds with no media errors, the exact expected binary digest and all
kernel-sandbox checks intact. Offline startup took 1259/1292 ms, all tested
file/worker boundaries remained closed, and temporary profiles were removed.

The owner approved new Apple Silicon and Intel staging-only updater fixtures
from application source `fd8654147`, with version `1.43.0-staging.2` and bundle
build `1432` changed only in a disposable build copy. Both fixtures now pass
Developer ID/EVS verification, notarization, stapling and Gatekeeper. Comparing
all 2,067 packaged files against each architecture's verified candidate found
only the expected `package.json` version difference. These are not yet
completed handoffs. A second unpublished,
hash-pinned draft transfer and cleanup were also approved, leaving the older
queued Intel run's assets untouched. Fresh native acceptance and public
baseline-to-ECS handoffs must run on disposable native Mac hosts, never the
installed production profile. The test harness now admits both native Mac
architectures, requires the matching GitHub runner architecture, and retains
the actual Restart Now, signature, ticket and protected-successor checks.

The older Intel updater retry `39999246654` again completed native Restart Now,
exact replacement and automatic relaunch, but the harness's generic 15-second
command timeout interrupted the successor's Gatekeeper assessment (stapler had
passed). It did not reach protected playback. The Apple trust commands now have
a bounded 120-second allowance; all signature, ticket and acceptance assertions
remain mandatory. That run removed its disposable profile and app. Its final
consumer finished, so the owner-authorized `ecs-private-intel-562ec1c87` draft
and both assets were deleted; release absence and no public Git tag were
verified. The two retired elevated-permission intake jobs were removed.

Fresh native Mac intake uses separate Apple Silicon/Intel acceptance and updater
jobs, exact archive and app.asar hashes, and the owner-authorized temporary
`ecs-private-mac-fd8654147` draft. No signing credentials are transferred. The
replacement jobs are temporary and must be removed with that draft after their
final consumers finish. The reusable acceptance harnesses and strict unmuted
protected-playback checks remain.

Intel codec follow-up `40004110864` completed successfully, with all individual
trials and native-clock evidence inspected. Both official Electron and ECS
44.9.3 passed local unencrypted AAC at 44.1/48 kHz: unmuted audio advanced
5.017/5.000 seconds and 5.028/4.999 seconds respectively. The six original
PCM/Web Audio trials per runtime were retained, with no media errors, and the
native clock advanced at both input rates. Temporary profiles were removed.
This does not reproduce a generic ECS AAC failure or prove the virtual output
device faulty. It still does not qualify full Blanc's unmuted DRM path; fresh
native signed-package acceptance remains required.

The four fresh native Mac jobs were dispatched in `40006057550` on test source
`ac24b1bae`: Apple Silicon/Intel acceptance and updater rehearsals. All four
private transfer archive hashes matched GitHub's recorded digests, the draft
remained unpublished, and no public Git tag existed. The jobs are pending, not
passes. Local validation before dispatch: 4,296 unit tests passed, two existing
skips, lint and focused regressions passed. Delete the new draft/assets and
temporary elevated-permission intake job after the final consumers finish.

1. All PR checks and new native integration jobs pass on the final head, including
   Windows Authenticode **and** production VMP signatures.
2. Preserve the exact signed/notarized Mac evidence above, and rebuild/requalify
   when the packaged application changes. Native Intel startup/uBO acceptance
   passed, but unmuted protected audio acceptance remains unresolved; muted
   video and Rosetta are not substitutes.
3. Fresh protected playback and sandbox evidence on the integrated package for
   each platform. Spotify/Netflix acceptance passed on the signed native
   Apple Silicon `fd8654147` package above; native Intel remains separate.
   Revalidate when packaged application code changes.
4. Actual production-to-ECS updater handoffs in disposable installs, including
   two renamed Linux AppImage replacements, profile migration and rollback.
   The installed production app and public metadata must remain untouched.
5. Linux real-binary CDM update/cache rollback and offline behavior passed in
   `39998789399`, including exact library hashes and kernel sandbox evidence.
   Other platforms' lifecycle checks remain separate.
6. Linux localized first-install/update guidance and the actual restart action
   passed in that run. Readiness alone still does not prove licensing/playback.
7. Finish native passkey/1Password/device compatibility and runtime/uBO security,
   corresponding-source, license and CodeQL review before updating the supported
   runtime matrix. The internal uBO override must never become a public shortcut.
8. Only after qualification and explicit owner approval: wire the immutable
   public release pipeline, bump version/build, prepare release-backed notes and
   What's New, and satisfy the existing full release gates. This PR neither
   merges nor runs that publication pipeline.

## Pending Windows updater and CDM lifecycle qualification

The private `ecs_windows_lifecycle` mode builds a staging-only
`1.43.0-staging.3` installer in a disposable Windows checkout, behind the
existing `ecs-signing` environment approval. No signed installer from the
earlier run was retained, so a new signing approval is required. Credentials
are removed before browser tests. The mode never publishes installers or
update metadata and cannot run on the public release path.

The new tests require the actual native Restart Now action from public
`1.42.1`, an exact-payload automatic successor, final timestamped publisher
verification, and unmuted protected playback. Separately they exercise a
fresh Windows CDM install without imposing Linux's preload/restart behavior,
a genuine vendor update from `4.10.3050.0` to `4.10.3112.0`, a controlled
stopped-process cache rollback and offline readiness. Each playback stage
requires verified VMP, the exact mapped DLL hash, a valid DLL signature,
the CDM service sandbox role, a restricted low-integrity token and a job.
Controlled cache rollback is not an automatic vendor rollback policy.

Both Windows fixture archives were locally verified against immutable Mozilla
SHA-512 records and their AMD64 PE headers. Their DLL SHA-256 hashes are
`f1216e26ee8c27f938d7722427d29f190e569ed83d0ba16ea872cae684b97602`
and `7b44e84403fbb3faee15ca2d56eb8432fdf4eb68812c4460abdd20972528e825`.
These test fixtures are not packaged. Local validation passed 4,301 unit tests
with two existing skips, lint, PowerShell parsing and native declaration
compilation. Native Windows results are still pending; none of these gates
are cleared by local source checks.

## ECS maintenance in every release runbook

Before each release, check upstream ECS and Electron security releases. Compare
the selected ECS runtime's Chromium revision/security fixes with the intended
Electron baseline. If ECS lags a required security fix, block publication or
explicitly return to the fully qualified official runtime; do not silently ship
a stale runtime. Updating ECS means reviewing the source/tag/licenses, replacing
all archive hashes together, reviewing any Linux binary adaptation at its exact
new hash, rerunning platform uBO/security/playback/updater tests, and generating
fresh platform signatures, notarization and SBOM/provenance. Never apply the
current offset-based Linux patch to a different binary. A successful EVS signature
does not establish that a runtime is current or release-qualified.
