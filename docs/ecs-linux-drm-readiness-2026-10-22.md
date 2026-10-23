# Linux ECS DRM readiness follow-up

All changes are confined to `codex/ecs-native-qualification`. Production's
runtime pin, fuse settings, signing inputs, entrypoint and installed app are
unchanged. No release or installer was published.

## Confirmed cause and fix

`components.status()` was read immediately after app readiness, before ECS's
asynchronous component registration finished. On both first installation and
later launches that early snapshot could omit Widevine's version. The adapter
incorrectly interpreted every missing early version as a new installation.

The native test observed these distinct fulfilled `components.whenReady()`
results on ECS 44.9.3+wvcus:

| Launch | Completion status | Version | Correct adapter state |
| --- | --- | --- | --- |
| Fresh component installation | `updated` | 4.10.3112.0 | `restart-required` |
| Restart, component already installed | `new` | 4.10.3112.0 | `ready` |

Here `new` means newly registered in the current process, not freshly downloaded.
The adapter now recognizes only the required component's `new` result with a
valid numeric version as existing registration. Missing, malformed or unknown
results remain conservative; the one-time Linux installation restart remains.
Timeouts, single-flight behavior, nonfatal offline startup and sanitized errors
are retained. Readiness still does not claim that playback or VMP was verified.

The candidate also runs the existing production Linux sandbox guard before
accessing the native ECS component binding. A regression test proves refused
launches cannot initialize components first.

Linux launchers now pass the isolated path through native `--user-data-dir`
as well as the candidate environment. Electron applies that command-line path
in `PreSandboxStartup`; its zygote runs before JavaScript and cannot rely on a
later `app.setPath()` call. A candidate-only guard checks that the requested
profile, native switch and initial native user-data path all agree, before
accessing the component binding. A missing/mismatched path fails closed.

The file-only diagnostic status channel now replaces snapshots by atomic
rename, so concurrent readers cannot parse a partially written JSON document.

## Native evidence

The initial reproduction and fixed-state baseline used fresh temporary profiles
and the real packaged AppImage in extract-and-run mode, with no `--no-sandbox`
switch. A first launch installs Widevine; a second process reuses that profile.

- [Initial reproduction](https://github.com/bnfy/blanc/actions/runs/39894611249):
  encrypted video played despite the incorrect restart warning.
- [Fixed-state baseline](https://github.com/bnfy/blanc/actions/runs/39894860825):
  first launch `restart-required`, second launch `ready`; CENC-encrypted video
  advanced with no media-pipeline errors. Local HTML/frame/worker/WebRTC tests
  passed, with zero HTTP and zero STUN canary packets and profile cleanup.

Those runs did not pass the new kernel CDM sandbox assertion. The sandbox
diagnostic was then corrected to recognize Chromium's flattened process titles
as well as normal NUL-separated argv. Screenshot focus handling was improved,
and local isolation and protected playback were split into independent required
gates so one failure cannot hide the other result.

### Final native rerun: warning fixed, release blocked

Historical result: the sandbox failure below is superseded for the experimental
patched candidate by the [native sandbox follow-up](ecs-linux-cdm-sandbox-2026-10-22.md),
which verifies protected playback and kernel isolation together. The unmodified
vendor runtime remains affected; do not erase or relabel this failed result.

[Run 39896011341](https://github.com/bnfy/blanc/actions/runs/39896011341),
source `db55a2bbd`, exercised the actual x64 AppImage on native Linux. The
aggregate run deliberately fails because the required kernel CDM assertion
fails; it must not be described as a successful security qualification.

- Ordinary candidate: initial install `updated` / `restart-required`, then
  existing registration `new` / `ready`. CENC H.264 video advanced from
  0.084970 to 5.016315 seconds over 5.001 wall-clock seconds, at playback rate
  1, without seeks or media errors.
- Alternate session-path trial: the same correct state transition and working
  encrypted video. It does not solve the security failure and is disabled by
  default. No production profile path was changed.
- Full local-HTML isolation passed on initial load, reload and restart. Script
  mutation, readable file frames and forbidden navigation were blocked; the
  HTTP and STUN canaries received zero requests/packets. Every temporary
  profile was removed after shutdown.
- CDM utility process: Widevine mapped, sandbox type `cdm`, no `--no-sandbox`,
  but kernel `Seccomp: 0`, `NoNewPrivs: 0`, and no isolated user or PID namespace.
  Renderers in the same process tree had `Seccomp: 2` and `NoNewPrivs: 1`.
  The CDM result is an independent security failure, not a readiness/UI issue.

Moving the Linux guard ahead of the native component binding, adding native
`--enable-sandbox`, selecting the profile before native startup, and aligning
the native/session paths did not resolve the CDM finding. Do not weaken the
kernel assertion or use a sandbox-disabling flag. The remaining work is to
identify and repair the native ECS CDM launch/sandbox path (or qualify another
runtime); an application-level remedy has not been established by these tests.

Linux returned `PLATFORM_UNVERIFIED`, consistent with the documented Linux VMP
limitation. This is successful encrypted sample playback, not EVS verification
or account-based Spotify/Netflix qualification. The hosted runner has no audio
device, so this does not claim audible output.

The local full unit suite passed all 4,246 tests, including registration,
early-sandbox-order, native-profile, process-title and atomic-status regressions.
Lint passed. A sandbox-restricted attempt failed two localhost fixture binds;
the qualifying full rerun with localhost access passed all tests.

Production verification: installed 1.42.1 executable and app.asar remain
byte-identical to the pre-test hashes. Runtime pins, fuse settings, macOS
entitlements and signing inputs have no diff. No merge, tag, release, published
installer or production-feed update occurred. Only sanitized synthetic JSON
evidence was uploaded; the test profiles and installers were not uploaded.
