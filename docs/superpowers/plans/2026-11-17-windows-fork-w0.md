# Windows fork W0: first build

> **For agentic workers:** execute inline (superpowers:executing-plans). Steps use checkbox syntax.

**Goal:** a Windows x64 build of the desktop fork that launches on Windows, draws the Island,
starts the blocker and runs the foundation (F0) suite, with its result recorded. W0 is the fork
plan's PW.1.

**Spec:** [`docs/superpowers/specs/2026-11-17-windows-fork-design.md`](../specs/2026-11-17-windows-fork-design.md).

**Facts read from the pinned tree (2026-11-17):**
- Pin: 158.0.8127.2, upstream `681cd621e82e606d7536eae8ea2576afb3c7d65c` (`chromium/lanes/desktop.json`).
- `build/vs_toolchain.py`: `TOOLCHAIN_HASH = '3bfcb536c8'`, `SDK_VERSION = '10.0.28000.0'`, packaged
  Visual Studio 2026 (`18.0`, toolset `VC145`).
- The Mac Studio's depot_tools is at `382c208a9973e1a6c0867b6d8664dc6dc9116e30`; its prototype
  arguments are `is_debug = false`, `is_component_build = false`, `symbol_level = 0`,
  `target_cpu = "arm64"`.
- GitHub's `windows-2025-vs2026` image has Visual Studio Enterprise 2026 18.11 with the C++ desktop
  workload and ATL/MFC, but only Windows SDK 10.0.26100.0, so the workflow installs 10.0.28000.
- Server on 2026-11-17: 710 GB free, 62 GB memory, 20 cores, no build running.

## Global constraints

- Windows builds only on `blanc-android-build`, only through `chromium/tools/build.mjs`, never while
  another `siso ninja` runs there.
- The Android checkout, its depot_tools and its outputs are never touched.
- Changes to shared files keep the Mac build's inputs identical unless the change is the point;
  Windows-only code sits behind `is_win` / `BUILDFLAG(IS_WIN)`.
- Work goes to `chromium/next` once the fork unit suite and `check-patches.py` pass. No Electron
  app changes.
- No secret is printed, and none is stored on the server or in GitHub for this milestone.

## Task 1: Windows toolchain package

- [ ] Make an `age` key pair on the server (`~/blanc-assets/win-toolchain/key.txt`, mode 600);
      commit only the public key, in `chromium/windows/toolchain-recipient.txt`.
- [ ] `.github/workflows/chromium-windows-toolchain.yml` (manual only, `windows-2025-vs2026`):
      install Windows SDK 10.0.28000 with its Debugging Tools, run depot_tools'
      `win_toolchain/package_from_installed.py 2026 -w 10.0.28000.0 --noarm` at the pinned
      depot_tools commit, encrypt the zip to the recipient, upload as a one-day artifact with its
      name and SHA-256 in the job summary.
- [ ] PR the workflow to `main` (with Task 5's), run it with `--ref chromium/next`.
- [ ] Download the artifact on this Mac, copy it to the server, decrypt it into
      `~/blanc-assets/win-toolchain/`, and check the zip's name against what `gclient` asks for.

## Task 2: Server checkout and first GN output

- [ ] `chromium/windows/args/prototype-x64.gn`: `target_os = "win"`, `target_cpu = "x64"`,
      `is_debug = false`, `is_component_build = false`, `symbol_level = 0`.
- [ ] `chromium/windows/server/bootstrap.sh` (idempotent, `--dry-run`, never deletes an output),
      modeled on `chromium/android/server/bootstrap.sh`:
      refuse anything but x86-64 Linux and root; `~/depot_tools-desktop` pinned to the Mac
      Studio's commit; `~/chromium-desktop/.gclient` with `target_os = ['win']`; history-free sync
      at the pin; hooks with `DEPOT_TOOLS_WIN_TOOLCHAIN_BASE_URL` and `GYP_MSVS_HASH_3bfcb536c8`;
      `apply.py --lane desktop` (check, then `--apply --backup`); record the applied map; `gn gen`.
- [ ] `chromium/windows/server/README.md`: layout, the rules above, how to rebuild.
- [ ] Run `bootstrap.sh --dry-run` on the server, then the real run in a tmux session.

## Task 3: Build guard learns the Windows output

- [ ] Tests first in `chromium/tools/build.test.mjs`: `--out=BlancWinPrototype` is accepted for the
      desktop lane; it is refused off x86-64 Linux; Mac outputs are refused on Linux as before;
      `--sdk-root` is refused with it; the Windows environment record's fields.
- [ ] `chromium/tools/build.mjs`: `WINDOWS_OUTPUTS`, `requireWindowsCrossHost()`,
      `windowsEnvironment()` (host, clang revision and version, toolchain hash, SDK version,
      arguments hash). Mac behavior unchanged; no candidate is auto-recorded for Windows.

## Task 4: Make the tree compile and behave on Windows

- [ ] `build.mjs SRC --check --out=BlancWinPrototype`, then the cold build with
      `--allow-large-build` (the approved one), logged to `~/blanc-evidence/windows/cold-build.log`.
- [ ] Fix compile errors in `chromium/blanc/` or small patches; rebuild; repeat.
- [ ] Replace the hard-coded `platform: 'darwin'` (`blanc/island/host.js`, `profile_import.inc`,
      `tab_handoff.inc`, `tab_import_runner.inc`) with the real platform.
- [ ] Data folder: a bare launch uses `Blanc Chromium Preview`, never `Chromium\User Data`.
- [ ] `chromium/PLATFORMS.md`: one line per difference.
- [ ] After shared GN changes are pushed: regenerate GN on the Mac Studio with unchanged arguments,
      when no release or build is in flight.

## Task 5: Get the build to a Windows runner

- [ ] `chromium/windows/package-candidate.mjs`: zip the `chrome` target's runtime files with the
      Island and blocker assets; print the candidate id and the zip's SHA-256.
- [ ] `chromium/windows/ship-candidate.sh` (this Mac): copy the zip from the server and upload it to
      the reused draft release `fork-windows-candidate`.
- [ ] `.github/workflows/chromium-windows-candidate.yml` (manual only): inputs `sha256` and `suite`;
      download the draft asset, verify, unpack, run the smoke check and the suite, upload reports
      and screenshots.

## Task 6: Test harness on Windows

- [ ] `chromium/tests/lib/platform.mjs`: process listing, keep-awake, memory check, Chrome-profile
      fixture layout and the primary modifier, per platform, with unit tests.
- [ ] `fixture.mjs`, `runner.mjs`, `lib/memory-guard.mjs`, `lib/real-pointer.mjs` and the adapters
      use it; `runner.mjs` reads `tracker.currentCandidates[platform]` and writes the real platform;
      `windows-fork-exclusions.mjs`.
- [ ] `chromium/tests/windows-smoke.mjs`: launch, Island target, blocker `ready`, fixture page
      loads, screenshot.
- [ ] `chromium/tools/progress.mjs`: `currentCandidates.windows` and its line in STATUS.

## Task 7: Run, record, close

- [ ] Run F0 on the runner; commit `chromium/reports/f0-windows.json` (+ junit) and the baseline.
- [ ] `chromium/STATUS.md` Windows section; mark the gate.
- [ ] Docs PR to `main`: the Windows paragraph for `CLAUDE.md` and `AGENTS.md`.

## Exit gate (all must hold)

1. `check-patches.py` passes for both lanes; the fork unit suite passes; the next Mac nightly builds.
2. `progress.mjs --check` passes with a Windows candidate.
3. `chrome.exe` for x64 is built on the server through the guard.
4. On a GitHub Windows runner the app launches, the Island draws, the blocker reports ready and a
   page loads, with a screenshot kept.
5. The F0 suite runs on Windows and its report is committed, with failures listed as real gaps.
6. STATUS has a Windows section and `PLATFORMS.md` lists the differences.

## Not in W0

Installer, signing, default-browser registration, window frame and high-DPI polish, the updater,
the S1 suite, Windows on Arm, Linux desktop, protected video.
