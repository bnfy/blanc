# ECS production integration — not released

This is the integration follow-up to #1061, based on merged main
`b514ff64caa4b6a4954bbf5dddedbd78ca2ff2e4`. It is not shipping approval.
Nothing here installs over the public app or updates the public feed.

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

Evidence files from preparation are under
`/private/tmp/blanc-ecs-production-XN2ipC/`; hosted evidence must be bound to the
exact PR head. Never carry passing results forward across runtime/package changes.

## Remaining shipping gates

1. All PR checks and new native integration jobs pass on the final head, including
   Windows Authenticode **and** production VMP signatures.
2. Rebuild the final integrated Mac packages from committed source, sign and
   notarize both architectures; repeat Gatekeeper/profile/entitlement checks.
   Native Intel startup/uBO acceptance is still missing; Rosetta is not a waiver.
3. Fresh protected playback and sandbox evidence on the integrated package for
   each platform, plus Spotify/Netflix on the final signed Mac candidate. Prior
   candidate playback alone does not close this gate.
4. Actual production-to-ECS updater handoffs in disposable installs, including
   two renamed Linux AppImage replacements, profile migration and rollback.
   The installed production app and public metadata must remain untouched.
5. Actual CDM binary rollover/rollback and offline cache behavior, not only
   synthetic metadata changes; verify exact CDM process role, seccomp,
   NoNewPrivs and namespaces on Linux.
6. Expose localized DRM status and safe restart guidance for Linux's first CDM
   install/update. Readiness is not proof of VMP licensing or successful playback.
7. Finish native passkey/1Password/device compatibility and runtime/uBO security,
   corresponding-source, license and CodeQL review before updating the supported
   runtime matrix. The internal uBO override must never become a public shortcut.
8. Only after qualification and explicit owner approval: wire the immutable
   public release pipeline, bump version/build, prepare release-backed notes and
   What's New, and satisfy the existing full release gates. This PR neither
   merges nor runs that publication pipeline.

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
