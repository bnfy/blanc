# ECS native qualification — candidate only

This branch does not select ECS for production, publish installers, change
production fuses/entitlements, or enable the public update feed. The source
baseline is `91a03e944827b5dce184c9d23e37b312ec5e1b1e` (after public 1.42.1).
Candidate metadata uses the next minor prerelease (`1.43.0-ecs.1`) without
changing the source package version.

## Native builds

Dispatch the existing Windows/Linux workflow on this branch with
`mode=validation`, `ecs_candidate=true`, `platform=all`. This dispatch builds
native Windows x64, Linux x64, Apple Silicon and Intel macOS candidates from
checksum-pinned ECS 44.9.3+wvcus. The ordinary release jobs are excluded.
The job has read-only repository permission; no release publication API is
used. Only sanitized synthetic test results are uploaded. Installer binaries,
profiles, EVS caches, and signing credentials are not uploaded as artifacts.
Actions logs and authenticated artifacts in a public repository are not private.

Windows packaging requires the existing complete Azure signing configuration.
Both installer and application must have a valid timestamped signature matching
the exact expected publisher. macOS native CI builds are ad-hoc compatibility
builds, **not** Developer ID/notarized or production VMP-qualified builds.
Windows has no EVS signing credentials configured in CI; Authenticode does not
substitute for VMP. Linux production does not use VMP signing.

Each native smoke verifies the actual packaged runtime and fuse wire, launches
and restarts using an isolated synthetic profile, checks internal startup and
static local HTML, verifies disabled production updates, and checks cleanup.
These checks do not replace the complete local-file/frames/workers/WebRTC matrix,
OS sandbox probes, account playback, accessibility, or real updater handoffs.

Linux validation also runs the complete local-HTML matrix and protected-video
test as independent required steps. The latter installs Widevine into a fresh
isolated profile, restarts that profile, verifies advancing CENC/CBCS media, and
checks the owned CDM process's kernel seccomp, no-new-privileges and namespace
state. A `ready` label or successful decryption cannot bypass that security
gate. See the [Linux follow-up](ecs-linux-drm-readiness-2026-10-22.md).
The candidate's [native CDM restoration experiment](ecs-linux-cdm-sandbox-2026-10-22.md)
adds a hash-guarded Linux x64 patch and a pre-sandbox preload helper. A new ECS
binary deliberately fails that guard until separately reviewed. Passing its
native test is not approval to ship the experimental mechanism or skip CDM
update/offline and installed-package qualification.

## Staging-only updater

### Self-contained Linux candidate startup

The patched Linux validation AppImage carries `AppRun`, a small native
`blanc-ecs-launcher`, and `blanc-cdm-preload.so`. Run the AppImage itself;
Node.js, a repository checkout, and an external preload helper are not needed.
On machines without FUSE, `APPIMAGE_EXTRACT_AND_RUN=1` uses the runtime's
extract-and-run mode. The normal unpacked Electron executable is not the entry
point for this candidate.

Without an explicit test profile, the launcher creates the owner-only
`$XDG_CONFIG_HOME/Blanc-ECS-Candidate` directory (or
`$HOME/.config/Blanc-ECS-Candidate`). It refuses to adopt an existing unmarked
directory, a redirected profile, or one writable by other users. An explicit
`BLANC_ECS_FULL_PROFILE` still requires the candidate marker. This never adopts
the production Blanc profile.

The updater adapter removes the previous AppImage's loader, Electron and mount
environment before executing the replacement. The entrypoint then resolves its
own location and starts the separately verified, fused Electron executable
with the native profile argument and a stable working directory. Component
selection is local and bounded: active CDM hint,
persisted registration, then installed version fallback, with canonical-path
and manifest checks. Invalid component metadata disables DRM for that launch,
not ordinary browsing. No sandbox-disabling fallback is added. The existing
Linux sandbox guard still runs before the ECS component binding.

The native updater test now builds three candidates and exercises two real
Restart Now replacements on a loopback-only feed, checking encrypted playback
and the CDM kernel sandbox in each successor. It moves the old unpacked tree
out of reach during the handoffs. A separate final-successor local HTML test
repeats the frame/worker/WebRTC canaries. See the dated qualification record for
actual results; the test definition alone is not passing evidence.

`--staging-updater` retains the existing updater implementation in staging.
It still requires the candidate profile marker, build-time opt-in, explicit
`BLANC_UPDATE_CHANNEL=staging`, and the existing validated staging URL policy.
Absent, malformed, or production channel settings disable updates; there is no
production fallback. Built-in metadata points to an unavailable loopback URL.
The normal candidate build continues to stub updates entirely.

Do not call installer launch an updater handoff. Remaining release evidence
must include the immediately preceding public version discovering the exact
staged update, downloading it, and invoking **Restart Now**, then a second ECS
update where needed to prove relaunch continuity. Use disposable installations
and profiles; never point a production feed at these builds.

## Maintenance gate for every release

1. Check castLabs' current stable ECS release and security changes. Record the
   check date, exact version, release URL and each platform archive SHA-256.
   Do not rely on a floating latest download or the npm Electron version.
2. Refresh the pins deliberately; rerun native builds, security isolation,
   offline/online component startup, CDM process sandbox/signature checks,
   Spotify/Netflix protected playback, and the Mac flicker regression.
3. Sign final fused frameworks with EVS before Apple/Windows outer signing.
   Verify production VMP separately from OS publisher signatures. Keep the
   ordinary Mac helpers' library validation and the exact reviewed CDM routing.
4. Renew uBO's source/license/runtime/platform and CodeQL acceptance before
   bundling it. This candidate intentionally excludes uBO; that is a release
   compatibility gap, not an approved feature removal.
5. Rerun signed installed integrations, profile migration, staged updater
   handoffs and the full release gates. Missing native evidence blocks release
   unless the owner explicitly records a waiver after the risk is explained.

No vendor-email response is treated as a prerequisite. Technical signatures,
license obligations, and unperformed verification gates still apply.
