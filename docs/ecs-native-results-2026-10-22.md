# ECS release qualification: native follow-up

**Status: do not publish. Native build compatibility passed; release qualification is incomplete.**

The candidate branch is `codex/ecs-native-qualification`, based on
`91a03e944827b5dce184c9d23e37b312ec5e1b1e`, after public 1.42.1. Candidate
metadata is 1.43.0-ecs.1, using ECS 44.9.3+wvcus. The source package's production
Electron pin, production fuse values, Apple entitlements, signing hooks and
provisioning profile are unchanged. The installed production app remains 1.42.1;
its executable and app.asar digests were checked unchanged after local tests.
The signed local Mac payload was built at `91dc841f5`; the hosted Mac/Windows
payloads at `0a9fa4b31`; the corrected Linux run at `445e14c19`. Later edits
concern harnesses and qualification documentation, not those signed payloads.

## Verified in this follow-up

| Check | Result and scope |
| --- | --- |
| Full unit suite | 4,241 passed after a clean locked install; lint passed. A preliminary run using borrowed dependencies failed setup/seed checks and is not the qualifying run. |
| Native Apple Silicon and Intel Mac | Native build, packaged runtime/fuses, startup/restart, static HTML script denial, synthetic-profile cleanup and real staging metadata discovery passed. Hosted Mac copies are ad-hoc, not production-signed. |
| Native Windows x64 | NSIS build and unpacked app passed exact-publisher, valid timestamped Authenticode checks. Native startup/restart, static HTML, cleanup and staging discovery passed. The real PowerShell signature verifier rejected an unexpected publisher/missing file and gated cached installation. This test did not execute the installer or prove Restart Now. |
| Native Linux x64 | AppImage build and actual extract-and-run AppImage startup/restart, static HTML, cleanup and staging discovery passed. No `--no-sandbox` flag was used. These preference checks are not a substitute for the separate OS sandbox matrix. |
| Current-baseline signed Mac candidate | Developer ID, embedded profile, strict deep signature and final production EVS signature verified. Apple notarization accepted; ticket stapled and validated; Gatekeeper accepted as Notarized Developer ID. |
| Signed Mac local HTML isolation | Full frame/file/worker/WebRTC regression passed with zero HTTP or STUN canary packets. Profile removed after shutdown. |
| Signed Mac offline startup | Offline startup 714 ms, then online restart 712 ms; both exited normally and cleaned the synthetic profile. |
| Signed Mac VMP Lab | Production backend returned PLATFORM_SOFTWARE_VERIFIED. Video advanced from 0.083333 to 5.026409 seconds over 5.0027 wall-clock seconds; no media errors. Sandbox denied the file canary and process fork. Process-exec probe was unsupported, not counted as denied. |
| Signed Mac browser smoke | Ordinary navigation, tab creation/duplication/pinning and private tab creation passed. |
| Public-to-candidate synthetic migration | Public 1.42.1 to the signed candidate passed settings, favorites, history, quiet/pinned/grouped tabs, workspace backup, restart binding and future-format refusal. Updates were disabled. This does not certify existing sign-in cookies or real-profile migration. |

Native Mac/Windows evidence: [run 39893868773](https://github.com/bnfy/blanc/actions/runs/39893868773).
That run's original Linux check failed: it launched a loose executable, which
correctly disables AppImageUpdater. The corrected actual-AppImage check passed
in [run 39894179722](https://github.com/bnfy/blanc/actions/runs/39894179722).
Two earlier superseded dispatches were cancelled during harness corrections.
Do not represent any failed/cancelled aggregate run as wholly green.

Only sanitized synthetic-test evidence was uploaded to Actions. No installer,
profile, EVS credential/cache or Apple credential was uploaded. Public-repository
Actions artifacts are not confidential.

## Candidate archive

The current-baseline notarized Apple Silicon ZIP remains local, not published:
`Blanc-1.43.0-ecs.1-mac.zip`.

SHA-256: `b3f4467eaafbde62340c7a7076a37e649a135e574edf0d0674e9d4e7cf63648b`.
An independent extraction passed strict deep codesign, stapled-ticket validation
and Gatekeeper acceptance. This archive is not a published update.

The generated feed contains only `staging-mac.yml`, never production metadata.
The candidate has a build-time and runtime opt-in for the existing staging
updater. Without both, updates stay disabled, even when the requested channel
is production. A public-to-ECS installer replacement rehearsal has **not** been
claimed: production's macOS updater cache also needs an isolated test account
or machine before that rehearsal can safely run.

## Release blockers still open

1. Final production-equivalent packages and installed behavior for every shipped
   platform. Windows needs production VMP signing in addition to Authenticode;
   hosted Mac compatibility copies need Developer ID/notarization. Preserve the
   reviewed CDM helper routing, library validation and final-fuse signing order.
   The [Linux DRM follow-up](ecs-linux-drm-readiness-2026-10-22.md) fixes the
   repeated `restart-required` warning and verifies CENC-encrypted playback.
   The subsequent [Linux kernel sandbox experiment](ecs-linux-cdm-sandbox-2026-10-22.md)
   passes encrypted playback and actual CDM kernel isolation together, using
   an exact-hash native patch and pre-sandbox preload helper. This experimental
   mechanism still needs production integration/review and genuine CDM binary
   update/rollback qualification; offline startup now passes. It is not an
   ordinary unmodified ECS package.
2. Real staged N-1 **Restart Now** handoffs and subsequent ECS updater continuity
   on the supported platforms. Metadata discovery, trust tests and direct
   installer launches are not substitutes. Verify real-profile/cookie continuity.
   The [Linux production-qualification follow-up](ecs-linux-production-qualification-2026-10-22.md)
   now passes two real candidate-to-candidate Restart Now handoffs with
   byte-exact replacement, self-contained startup, encrypted playback and
   kernel CDM isolation in both successors. The N-1 public-to-ECS handoff is
   still separate. Fresh/cached offline startup and synthetic CDM activation
   checks pass, with actual binary rollover pending.
3. uBO's reviewed ECS runtime/platform and CodeQL acceptance. This candidate
   excludes uBO; that is an unresolved shipped-feature compatibility gap, not
   permission to remove it from production.
4. Signed installed integrations and complete packaged acceptance: 1Password,
   passkeys, media permissions/capture, browser registration and uninstall,
   OS-level sandbox checks and remaining release regression gates.
5. Protected-account playback and the Netflix flicker regression against the
   final frozen artifacts/platforms. Previous Spotify/Netflix owner checks are
   retained evidence for the earlier signed Apple Silicon candidate, not all
   newly built platforms or this new source baseline.
6. A reviewed production integration/packaging change and normal release
   security/supply-chain gates. Nothing in this candidate branch changes the
   production entrypoint/runtime or authorizes a merge, tag, publication or feed
   change. No waiver has been assumed.

The [release runbook](release-verification.md#electron-ecs-maintenance-gate)
requires an ECS freshness/security check and renewed runtime-sensitive tests
for every release. A castLabs email response is not a release prerequisite.
