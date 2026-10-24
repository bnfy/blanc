# ECS production integration — not released

This is the integration follow-up to #1061, based on merged main
`b514ff64caa4b6a4954bbf5dddedbd78ca2ff2e4`. It is not shipping approval.
Nothing here installs over the public app or updates the public feed.
Main's subsequent Split View update (`33da400fe`) is now merged into this
integration branch. Earlier signed binaries and native evidence below predate
that source update and do not by themselves qualify the merged result.

## Current gate status — October 23

**Startup-gate race fixed (owner-approved, narrowly scoped; attribution
revised after audit).** `src/main/gate-refusals.js` records navigations the
startup or profile gate actually refused and queued. A record is armed only
when the gate replays that exact URL (before its `loadURL`); superseded
refusals that were never replayed can never match. After arming, only
new-document main-frame navigation starts are counted (never commits or
same-document navigations); the replay's own start is the first. The tab's
failure handler drops a late `ERR_BLOCKED_BY_CLIENT` only for an armed record
of that URL while at most that one start has happened, so the replay
committing does not invalidate it but any other navigation does; once, within
30 s. A provider or policy cancellation of the replayed request disarms it (the
coordinator reports these, never gate refusals), a failure handled while the
gate is active or ignored as not presentable settles it, and destroyed
contents forget theirs. The audit's sequence (refusal, supersession, ignored
original failure, genuine later block of the same URL) now shows the error
page; on the previous commit it was hidden. A second audit found that the
tab's `navEpoch` also increments on commit, so a late failure after the replay
committed was shown; start counting fixes that (the previous commit showed an
error page for that sequence, the fix drops it). In the traced local reproduction
three gate-refused rounds dropped the armed late `-20` and showed the replayed
page, and a closed-port control showed its error page every round. This
changes the candidate: the Linux pass covers `e2a83b241`, not this commit.

**Linux public-ECS validation `40041114105` (d96f7426d): not passed overall.**
Public-package acceptance passed: unmuted protected playback advanced 4.961 s
with no media errors (Linux reports `PLATFORM_UNVERIFIED`, as expected), the
CDM sandbox held (seccomp 2, NoNewPrivs, isolated user and PID namespaces),
installed uBO passed 12/12 and file isolation passed. Both launches' traces
were complete and recorded no gate refusal, so the earlier refusal in
`40038238250` remains unattributed; startup reported ready 23 ms before the
gate opened in the second launch. The run failed only at the packaged browser
and Settings regression, which launched the raw `linux-unpacked/blanc`;
Linux ECS refuses to start without its launcher, and that check also expected
the official 44.8.0. The regression now runs public ECS through the AppImage
and, with the job's `BLANC_ECS_PACKAGE_ROOT`, verifies the package's pinned ECS
runtime and archive before expecting its version; official runs keep their
binary and the locked-version check. In both platform jobs the mandatory
regression now runs before release upload and attestation, for official and
ECS runs alike.

**Linux public-ECS validation `40038238250` (dc51ebeda): not passed.** Installed
uBO passed all twelve checks on the marker-free public package (renderer
sandbox after restarts, relaunch persistence) and file isolation passed. DRM
playback never started: the VMP Lab navigation failed with
`ERR_BLOCKED_BY_CLIENT` then `ERR_ABORTED` and an error page, after Widevine
4.10.3112.0 installed. No playback measurement exists; this is neither a CDM
failure nor a DRM pass.

**Startup-gate race, reproduced locally (pre-existing, not ECS-specific).** A
default-off trace (`BLANC_NAVIGATION_TRACE`, `src/main/navigation-trace.js`)
records gate refusals, gate release and replays, coordinator cancel sources and
the tab's handling of each main-frame load failure, with URLs reduced to host.
In the official-Electron development build, a tab opened during startup was
refused and queued by the startup gate (+0 ms), released and replayed (+40 ms),
and its `-20` failure event then arrived with the gate inactive and the queue
empty (+115 ms), so the error page was shown although the replayed page also
loaded. Startup reports `ready` before the gate opens, and the tab handler's
suppression requires an active gate. This reproduces the mechanism; whether run
`40038238250` took this path needs the traced validation. No fix or workaround
has been applied. The trace runs only when `BLANC_NAVIGATION_TRACE` (a new
absolute file) and `BLANC_NAVIGATION_TRACE_HOSTS` (fixture hostnames) are both
set; other hosts, private tabs and (at the coordinator, which cannot see the
tab) every non-persistent session are never recorded. Every line carries a
sequence number, `trace-start` is written when tracing is enabled, and normal
exit writes `trace-end` with the written and failed counts; the shared reader
(`test/desktop/support/navigation-trace-reader.cjs`) calls a trace complete only
when both markers are present, the sequence is unbroken, the counts reconcile
and no write failed, so a crash or a failed write reads as incomplete. Coordinator records
cover main-frame cancellations at every callback stage with Chromium's request
ID; gate and failure records carry the tab's navigation generation. The file
starts with a `trace-start` marker and ends with `trace-truncated` at its cap,
and the DRM smoke reports each launch's trace with that reader. A traced
local repeat linked the sequence by request and generation: request 50 refused
and queued at generation 1 (+0 ms), replayed (+23 ms), and a `-20` failure
during the replayed generation 2 with the gate inactive (+99 ms). Electron's
load-failure event carries no request ID, so that last link rests on code,
generation and time.

**Owner waiver (22:06 UTC):** the runtime security (Node 24.22.0) and native
source/redistribution gates are waived for shipping today, with the missing
evidence, accepted risk and owed follow-up recorded in
[the runtime review](ecs-runtime-security-review-2026-10-23.md). Waived is not
passed; every other gate below still applies.

**Release pipeline (code only, owner-approved October 23):** `scripts/release.sh`
gains `BLANC_RELEASE_RUNTIME=ecs` (default `official`, unchanged). It requires
the existing EVS account files and the reviewed uBO record, builds both Mac
architectures in one `build-ecs-production.cjs --release` build, verifies each
public package (`verify-ecs-production-package.cjs --release`,
`verify-electron-fuses.mjs --ecs`), and sends `runtime=ecs` to the native
workflow only for ECS releases, after a pre-tag check that the workflow
accepts it. The native workflow's Linux release job builds and verifies ECS;
no credentials are involved. **Windows (owner-approved code, October 24):**
the Windows release job references the `ecs-signing` environment only for
ECS runs; after binding the checkout to `source_sha` it installs the pinned EVS
client, materializes the two EVS secrets, builds through the ECS release path
(Authenticode before VMP signing), removes the credentials on every outcome,
verifies the ECS package, Authenticode and the regressions, and only then may
upload. The environment's branch policy still allows only
`codex/ecs-production-integration`, so a candidate-branch validation can run
but a release from `main` cannot; adding `main` is a separate owner decision.
No workflow was dispatched, no credential read or used, no environment
changed and nothing signed.

Every ECS native run must name `source_sha`, the exact approved commit; the
job refuses to build unless its checkout resolves to it, because the
environment's branch policy controls which workflow ref runs, not which code a
tag selects. `mode=validation runtime=ecs platform=linux` builds the same
marker-free public package as a private three-day artifact without uploading
to any release, for example:
`gh workflow run release-windows-linux.yml --ref <branch> -f mode=validation -f runtime=ecs -f source_sha=<sha> -f platform=linux`.

**uBO on public ECS builds (owner-approved October 23):**
`src/main/ublock-platforms.json` adds `ecsRuntime: 44.9.3+wvcus` with its
evidence for the four previously qualified platform records; Rosetta stays
excluded. `blocking-providers.js` honors it only for a packaged public ECS build
whose metadata names exactly that runtime and whose Electron is its base
version; anything else selects Blanc Blocker at startup. Blanc Blocker remains
the default and an available uBO's failures stay fail closed.

Newest evidence supersedes the historical running/pending notes below:

- **Intel audio now passes after the normal OS permission flow.** In
  `40020527609`, the narrowly scoped handler approved the Blanc microphone
  dialog from `com.apple.UserNotificationCenter`. On the unchanged signed
  Intel app, all ten PCM/AAC/Web Audio controls advanced, explicitly unmuted
  protected playback advanced 4.479 seconds before and 4.969 seconds after the
  controls, and both native output-clock trials worked before, during and
  after Blanc at the runner's 44.1 kHz virtual output. VMP was 2, media errors
  were empty and profiles were removed; two aborted storage requests remain
  recorded. This resolves the reproduced runner privacy-check stall without
  changing application code, drivers, acceleration or entitlements.
  The following original VMP Lab smoke advanced 5.007 seconds with verified
  VMP and the CDM sandbox, but did not record the video's muted/volume fields.
  Final Intel acceptance now explicitly records and asserts both unmuted and
  nonzero volume, alongside the unchanged advancement/security checks.
  Intel updater successor playback and CDM lifecycle passed later the same day.
  A temporary Intel-only finish mode runs acceptance, updater and lifecycle
  against the same pinned packages, avoiding redundant Apple Silicon jobs.

- **Runtime security freshness remains an explicit blocker.** The signed
  `fd8654147` Apple Silicon framework contains Node `24.22.0` version
  identifiers. Node's October 21 security release is `24.22.1`, including
  high-severity fixes. Electron merged its Node update in
  [#55162](https://github.com/electron/electron/pull/55162) on October 22;
  the latest available ECS release remains `44.9.3+wvcus`. Matching Electron's
  latest published 44.x version is therefore not sufficient security evidence.
  Confirm applicable fixes/backports in the exact ECS binary, or obtain and
  requalify a vendor build containing them, before closing this gate. The
  version string alone does not prove which individual fixes are absent or
  that a vulnerable operation is reachable in Blanc. Sources:
  [Node security release](https://nodejs.org/en/blog/release/v24.22.1),
  [security advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
  No runtime or signed package was changed during this review.
  A subsequent offline probe of the exact pinned vendor archive confirmed
  Node `24.22.0` and reproduced the published TLS hostname-validation defect
  classes with pure API inputs. This does not establish Blanc exploitability.
  See [the scoped runtime review](ecs-runtime-security-review-2026-10-23.md).
  The npm production-dependency audit is clean, but does not cover the engine.

- **Native Intel acceptance and CDM lifecycle now pass** in `40023852344`.
  Acceptance recorded muted=false and volume=1 throughout 4.908 seconds of
  VMP-verified protected playback, with no media errors and the CDM sandbox
  intact. uBO, native Quit/restarts, offline (3027/5826 ms), local HTML and
  workspace/media checks passed. The CDM lifecycle's first UI took 9760 ms;
  first install, old 3050, genuine vendor 3112 update and controlled rollback
  advanced unmuted by 2.402/5.336/4.944/4.949 seconds. Each stage verified the
  exact mapped signed library and sandbox; offline readiness and profile
  cleanup passed. The same run's Intel updater cell completed the native
  Restart Now, old-process exit, exact target payload, automatic successor,
  codesign, Apple ticket and Widevine component installation, then failed
  with `Timed out: updated probe navigation request`: three synthesized
  Command-L/type/Return attempts reached a frontmost successor window but
  produced no loopback request (`probeRequests` 0, `navigationAttempts` 3).
  The earlier Intel cells needed one (`40006057550`) and two
  (`40011188375`) such attempts, while every Apple Silicon cell needed one,
  so this is an input-injection defect of the harness on the slow Intel
  runner, not a demonstrated updater or playback defect; the run recorded no
  microphone dialog, so the permission handler never acted in that cell. The
  harness now records read-only focus evidence for every attempt, keeps two
  keystroke attempts, hands the URL to the running successor through
  LaunchServices on the third (Blanc's ordinary open-url path, as a link from
  another app), and then requires the successor to remain the only Blanc
  process before the unchanged unmuted-playback assertions. The Intel finish
  mode can now run only its updater cell. **That cell passed in
  `40029171910`** on the unchanged signed bytes: native Restart Now, exact
  target payload, automatic successor (`successorOnly` true), codesign,
  Apple tickets and Widevine installation, then VMP-verified protected
  playback advancing from 0.183 to 3.128 seconds unmuted with no media
  errors, and both profile and installation removed. The focus evidence
  shows the successor frontmost with its one window during both keystroke
  attempts; the first burst produced no request and the second did, so the
  earlier failure was dropped synthesized input on the slow Intel runner,
  not the permission handler, and the LaunchServices handoff was not needed.
  The handler approved one microphone dialog from
  `com.apple.UserNotificationCenter` during successor playback. With this,
  every native Intel gate has passed.
  With every consumer finished, the private transfer draft
  `ecs-private-mac-fd8654147` (draft, target `fd865414726d703ce07a50594deeb189665efe10`,
  four assets) was deleted; the signed apps and all four archives remain in
  the isolated qualification directory. The temporary `ecs-fresh-mac` job,
  its draft-read `contents: write` permission and its six dispatch inputs
  are removed from `.github/workflows/ublock-origin.yml`; the desktop
  updater, CDM lifecycle and audio tests, the confined permission wrapper
  and its dialog script stay for the next candidate.

- **Apple Silicon CDM lifecycle now passes** in the unchanged signed
  `fd8654147` candidate. First UI took 1743 ms. First install, old 4.10.3050.0,
  genuine vendor update to 4.10.3112.0 and controlled rollback each played
  unmuted for about 4.92 seconds with production VMP. Every stage verified the
  exact mapped library hash, valid signature, Plugin CDM helper sandbox and
  denied unrelated-file/fork probes. Exec introspection was unavailable (-1),
  not a proved denial. Cached offline readiness and all temporary-profile
  cleanup passed. The same harness is available for native Intel after its
  audio permission issue is resolved; this ARM result does not qualify Intel.

- Intel `40017380935` produced a concrete system stack: `coreaudiod` waits in
  `CheckTCCAndThrow` → `TCCAccessCheckAuditToken` → `TCCAccessRequest` →
  synchronous `tccd` IPC while serving the runner's combined Null Audio Device.
  It passed native audio before Blanc and then hung in this permission check.
  The owner approved exercising the normal Blanc microphone OS dialog on the
  disposable Intel runner. A separate, default-off qualification input now
  permits only an unambiguous system-owned dialog naming Blanc and microphone,
  with both Allow and Don't Allow controls. It does not modify TCC databases,
  drivers or application policy. The same signed bytes then run the original
  strict unmuted DRM test; permission handling alone is not acceptance.

- **Windows native qualification is now passing:** `40018661753` on
  `0a9d381eb` succeeded after canonicalizing the temporary installation path.
  Its report confirms the path expanded, actual Restart Now, old-process exit,
  exact target replacement, automatic successor, timestamped exact-publisher
  signatures and unmuted VMP-verified playback advancing 4.939 seconds.
  All fixture processes, profile and installation were removed. The same run
  passed CDM first install (UI 920 ms), genuine vendor update, controlled cache
  rollback, cached offline readiness, exact DLL/sandbox-token checks, uBO and
  offline local-file isolation (845/732 ms). One aborted storage request in the
  baseline playback report is retained. No updater or lifecycle waiver was used.

- Windows `40016447078` identifies a fixture ownership-path mismatch: after
  Restart Now, the exact target was installed and a live successor plus five
  helpers were visible at the disposable installation's full Windows path,
  but all were classified `fixture: false`. The same unmatched processes
  survived cleanup and retained the SQLite/install locks. The fixture now
  resolves its created temporary directory with native `fs.realpath` before
  deriving the NSIS destination and exact executable comparison, and records
  the expected path/canonicalization evidence. It keeps the same narrow process
  ownership checks. The later `40018661753` result above validates the fix;
  this earlier failed run is retained as diagnostic evidence.
- Apple Silicon updater attempt 2 of `40011188375` passed actual Restart Now,
  automatic relaunch, unmuted protected playback advancing 4.9425 seconds with
  VMP 2 and no media errors, and profile/installation cleanup. Its updater gate
  is complete; Intel unmuted playback remains open.

- Follow-up Intel audio `40015587796` narrows the failure further: the native
  output clock advanced before Blanc launched (226,304/223,164 frames at a
  44.1 kHz virtual output), but timed out with `ETIMEDOUT`/`SIGTERM` both while
  Blanc ran and after it closed. Ordinary media remained at time zero with
  readyState 1; Web Audio stayed zero; protected media stalled despite VMP 2.
  This is not a generic initial absence of a working host audio device, and
  pre-warming did not help. A follow-up captures read-only coreaudiod stacks,
  audio-device information and audio/library-validation logs on native failure.
  No audio service, driver, entitlement, TCC or application policy is modified.

- Windows `40013400671` passed baseline DRM, uBO, offline isolation and the
  complete CDM lifecycle again (first UI 1747 ms; four unmuted stages advanced
  4.941/4.938/4.929/4.935 seconds, verified VMP, exact signed DLLs and restricted
  sandbox tokens). Its updater now records **Restart Now clicked**, but times
  out waiting for an automatic successor after the exact-target-payload wait.
  Cleanup still finds locked profile and installation files despite the exact
  executable query returning no processes. This is not an updater pass.
  The next diagnostic records bounded, read-only CIM/Get-Process evidence and
  milestones; it does not adopt or kill processes at other paths.
- Intel updater `40011188375` attempt 1 completed native Restart Now, exact
  replacement, automatic relaunch and Apple trust, then failed unmuted
  controlled-player advancement. Numerical samples were not retained by that
  harness on assertion failure. Both disposable profile/installation were
  removed. The original VMP Lab page is therefore not the sole cause.
- Signed audio diagnostic `40012023427` completed, **not passed acceptance**:
  Apple Silicon's ten controls and both protected trials advanced (4.954/4.959
  seconds, VMP 2, no media errors; two aborted storage requests retained).
  Intel's PCM/AAC trials timed out, both Web Audio clocks remained at zero,
  protected playback stalled before and after controls, and the native probe
  returned an undifferentiated process error. Profiles were removed. The host
  audio path is suspect, not proven faulty hardware or an ECS-only regression.
  The follow-up records native exit/signal/timeout evidence before opening
  Blanc, during the tests and after closing it, plus timed-out media state.
  A preliminary native probe can itself warm audio; this remains diagnosis,
  not a substitute for cold unmuted acceptance.
- Apple Silicon updater attempt 1 failed on Apple's CloudKit ticket-service
  connection loss (`-1005`, stapler 68), before testing. Only that job was
  retried as attempt 2 after the matrix terminated. Keep the transfer assets
  for that retry and the follow-up audio diagnosis. No trust check is waived.

These diagnostic changes do not alter application code, signed packages,
acceleration, entitlements, devices or drivers. They never edit TCC databases;
the owner-approved permission grant uses the normal OS dialog on a disposable
runner. A new Windows signed run
still requires fresh owner authorization; no approval is inherited.

This summary supersedes historical pending-status notes below. Application
source is unchanged since `7b009cd6c`; the signed Mac batch is `fd8654147`.

- **Passed:** Linux native playback, sandbox, CDM lifecycle and both real
  versionless AppImage updater handoffs; Windows real first CDM install,
  vendor update, controlled cache rollback, offline readiness and actual
  production-to-ECS updater handoff; native Apple Silicon signed-package
  acceptance, updater handoff and Spotify/Netflix playback.
- **Passed locally:** the fresh signed Apple Silicon app received a real
  640×480 camera frame and microphone signal (peak 0.008) through Blanc's
  actual permission flow. No recordings were saved; the harness closed the
  tracks/app and removed its temporary profiles. Production hashes are unchanged.
- **Open:** native passkey/1Password acceptance, final runtime/uBO source/license/security review and supported
  matrix, final PR checks, and the public pipeline/version/What's New gates.
  No waiver, merge, publication or production-runtime switch is implied.

Windows run `40009588876` fully passed the CDM lifecycle: first install,
4.10.3050.0 baseline, genuine vendor update to 4.10.3112.0, and controlled
old-cache rollback advanced unmuted protected playback by 4.941/4.941/4.932/
4.927 seconds respectively. Each stage verified production VMP, exact DLL
digest and signature, the `media.mojom.CdmServiceBroker` role, restricted token,
job membership and untrusted integrity (`S-1-16-0`), with no media errors.
Cached offline readiness and profile cleanup passed. This is not an automatic
vendor-downgrade claim. The same run failed before clicking Restart Now:
Windows exposes that native task-dialog command link as a focusable `Pane`,
not a UIA `Button`. The test now binds the action to the real native dialog
HWND/class and process, exact staged-version message, Later choice, and exact
focused control. It does not bypass the updater or replace its trust checks.

Mac matrix `40006057550` passed Apple Silicon acceptance: production VMP,
unmuted CENC advancing 5.029 seconds, sandboxed CDM, real uBO lifecycle,
offline (1890/2310 ms), local HTML/frame/worker/WebRTC boundaries and cleanup.
One aborted storage request remains recorded, not silently discarded.
Its Apple Silicon updater cell proved actual Restart Now, exact replacement,
automatic relaunch, Apple trust and encrypted playback, but the report exposed
`muted: true`. That is **not** unmuted successor acceptance. The harness now
explicitly requests and asserts unmuted playback; both native Mac updater
cells must rerun against the existing immutable signed fixtures. The original
Intel updater also completed replacement/relaunch/trust with muted playback;
it cannot close the unmuted gate. Original native Intel acceptance reproduced
the unmuted stall: 0.083333→0.183333 seconds over five seconds, with 12 seconds
buffered, VMP verified and no media/network errors. Foreground focus did not
help; muting advanced 0.198913→6.486855 seconds. Native uBO, restarts, offline
(2694/2586 ms), HTML isolation, workspace and synthetic media passed. The
runner reports a virtual CoreAudio device. Prior equal-runtime PCM/AAC/native
controls passed, so this is still a full-Blanc/protected-playback blocker,
not evidence of generally broken ECS audio or proven faulty hardware.

Test-only fix `d2e4a0842` passed all 4,303 unit tests (two existing skips),
lint, focused tests and PowerShell/native declaration compilation. Replacement
Mac updater-only run `40011188375` requires unmuted playback on both native
architectures using the same signed bytes. Owner-approved Windows retry
`40011311276` is on the same head and its protected signing approval has been
submitted. No new signing authority extends to any later replacement run.

Windows `40011311276` again passed baseline checks and the full CDM lifecycle.
First UI took 1330 ms; unmuted playback advanced 4.928/4.933/4.934/4.922 seconds
through first install, old baseline, vendor update and controlled rollback.
Every stage retained VMP 2, exact signed DLL, the broker role, restricted token,
job membership and untrusted integrity. Offline and profile cleanup passed for
that lifecycle test. Its updater step failed during teardown on a locked
`DIPS-wal` file, masking the preceding handoff result and preventing the updater
report from being written. Neither successful handoff nor updater cleanup is
claimed. The harness now persists the primary result before cleanup, attempts
every cleanup stage, waits for all processes using the exact disposable
executable (including helpers), and records teardown failures separately.
Fresh native Windows proof remains required.
The teardown fix passed 4,305 unit tests (two existing skips), lint, and then
10 focused tests including a further regression that prevents a report from
claiming success before cleanup finishes. A new signed Windows validation
requires its own owner approval.

Audio diagnostic run `40012023427` on test commit `a1a994f2f` uses the unchanged signed full Mac application,
with fresh profiles and the normal entrypoint, on each native architecture.
It compares local PCM and AAC at 44.1/48 kHz, muted and unmuted controls,
Web Audio clocks, and an unmuted controlled player using the same public
CENC media and license server as VMP Lab, before and after the audio controls.
It installs the real CDM and relaunches normally, matching the acceptance setup.
A native output-clock probe runs
on that same host. Results retain individual trials, media errors and decoder
properties. Diagnostic completion is not an acceptance pass; the original
Intel failure and both updater gates remain open until native evidence resolves
them. This mode uses the existing authorized transfer assets and needs no new
signatures, application changes, acceleration changes or sandbox exemptions.
All 4,303 unit tests and lint passed; two existing unit skips remain. The new
diagnostic is queued, not a passing native result. Its two jobs are additional
consumers of the private draft, which must remain until they terminate.

Superseded candidate PR checks were cancelled to reduce the Mac queue backlog;
current-head checks and all explicitly dispatched qualification runs were
preserved. The queued signed-audio and updater runs have not yet supplied new
Intel evidence. GitHub's runner-image reports also document virtual-audio
initialization and output-triggered microphone-prompt problems
([13668](https://github.com/actions/runner-images/issues/13668),
[9330](https://github.com/actions/runner-images/issues/9330)). These are diagnostic
leads, not proof of this failure. No TCC database, device, driver, entitlement
or library-validation policy was changed.

The upstream check confirms the selected `v44.9.3+wvcus` is the latest ECS
release and matches the latest Electron 44 patch `v44.9.3` (which includes
ANGLE/Chromium/PDFium/Skia/V8 backports). Electron 45 is available separately;
this patch-version check is not a completed fork/source/security review or a
reason to skip the remaining compatibility gates. Sources:
[ECS release](https://github.com/castlabs/electron-releases/releases/tag/v44.9.3%2Bwvcus),
[Electron 44.9.3](https://github.com/electron/electron/releases/tag/v44.9.3).

## Build and signing boundaries

`npm run dist:ecs -- --mac --arm64 --dir` builds the normal Blanc entrypoint,
app identity, profile layout, browser registration and updater in `dist-ecs/`.
The build always passes `publish: never`. It includes uBO for internal runtime
qualification; that marker is not public-distribution clearance. Default
`npm start`, `npm run dist` and `scripts/release.sh` still select official
Electron. The official dependency/lockfile, production fuse configuration and
macOS entitlement files are unchanged.

`build/ecs-runtime.json` pins the exact ECS tag, vendor release-metadata commit, Chromium
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

Run `40006965040` on `3c9d2c17d` received the owner's run-specific signing
approval. Its staging installer passed final timestamped exact-publisher
Authenticode and EVS verification. Existing Windows compatibility checks
passed: VMP verified, unmuted protected video advanced 4.989 seconds without
media errors, offline starts took 1284/1089 ms with all tested file boundaries
closed, and real uBO restarts passed. One aborted storage request was recorded;
this is not a zero-network-errors claim.

The two new harnesses failed before qualifying their intended operations.
The lifecycle test incorrectly asserted `supported` on the sanitized Settings
API, whose contract exposes `enabled`. The updater's Windows PowerShell child
inherited PowerShell 7's module path, preventing its security module from
loading; production already resets that environment for its verifier. Both
test-only mistakes are corrected, with a shared fail-closed PowerShell wrapper
and regression coverage. No actual updater handoff or CDM lifecycle pass is
claimed. Both owned profiles were removed; the updater's temporary installation
was removed. A replacement run requires fresh owner signing approval.

Replacement `40008436074` uses test source `5a08e66a3`. The corrected Settings
contract, PowerShell environment reset and sanitized CDM failure diagnostics
passed 4,302 local unit tests with two existing skips, plus lint and targeted
regressions. The owner approved this exact replacement run, and the approval
was submitted; it completed with the further test-selector failures below.

Replacement `40008436074` passed first-install protected playback (4.926 seconds,
unmuted, VMP status 2), exact current DLL digest/signature, restricted token,
job membership and untrusted integrity `S-1-16-0`. Its remaining role assertion
used the wrong namespace. Pinned Chromium 152's service factory and existing
Linux/Mac probes identify `media.mojom.CdmServiceBroker`; the Windows probe now
parses and requires that exact utility subtype instead of `cdm.mojom.CdmService`.
No sandbox condition was removed or relaxed. Full update/rollback still needs
a passing rerun.

That run also verified both installer signatures and downloaded the private
updater, but failed before pressing Restart Now: name-only UI lookup selected
an element without an Invoke pattern. The test now requires an enabled native
Button with the exact name, uses Invoke when supported, and otherwise presses
Space only after checking the owned foreground process and exact focused
button. It records bounded control-type diagnostics on failure. No handoff is
claimed yet; disposable profiles and installation were removed.

The exact broker and native-button selector fixes passed 4,303 local tests
with two existing skips, lint, and PowerShell parsing/native declaration
compilation. All signature, mapped-DLL, token, integrity and playback checks
remain mandatory in the next run.

Retry `40009588876` uses test source `e8d4f7b5b`; the owner approved that exact
signing run and the approval was submitted. Its native results remain pending.

The fresh Mac matrix `40006057550` remains separate and queued; this Windows
work does not replace its acceptance requirements.

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
