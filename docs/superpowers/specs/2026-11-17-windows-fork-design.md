# The Chromium fork on Windows: design

**Date:** 2026-11-17
**Status:** Owner-approved on 2026-11-17 for the first milestone (W0). Nothing in it is built yet.
**Background:** the fork plan's Windows tasks PW.1 and PW.2 and decision D4
([replacement plan](../../chromium-replacement/2026-10-30-desktop-replacement-plan.md) §5, §9).

**Owner decisions, 2026-11-17:**
1. **D4, build machine.** Windows builds are compiled on the Linux server already rented for the
   Android lane (`blanc-android-build`), using Chromium's Linux-to-Windows cross build
   (`docs/win_cross.md` in the Chromium tree). No new machine and no new cost.
2. **Test machine.** GitHub-hosted Windows runners run the built app and the automated suite. A
   build reaches them as the asset of an unpublished draft release, which only repo collaborators
   can see. The owner's Parallels VM is for hand checks only.
3. **Scope of the first milestone.** W0 is the fork plan's PW.1: the first build that launches on
   Windows and runs the foundation (F0) suite.
4. **Window buttons (W1).** Windows' own caption buttons, top-right over the Island strip; the
   Island draws none there. This differs from shipping Blanc for Windows.
5. **Signing (W1).** Preview builds are signed now with the Bananify Creative certificate, to prove
   the path; a signed preview stays on the unpublished draft release.

## 1. What Windows is in the fork

Windows is not a new lane. It is a second build of the **desktop lane**: the same
`chromium/lanes/desktop.json`, the same patch list, the same `chromium/blanc/` source and the same
Chromium pin as the Mac (158.0.8127.2, upstream `681cd621e82e606d7536eae8ea2576afb3c7d65c`). The fork
plan requires one canonical tree for every desktop platform (§2.1), and its tracker already carries
a `windows` column on every row.

Consequences:
- A Windows fix in `chromium/blanc/` or in a patch is a change to the Mac's source too. It must keep
  `check-patches.py` passing and must not change what the Mac compiles. Windows-only code sits behind
  `is_win` in GN and `BUILDFLAG(IS_WIN)` in C++.
- A change to `blanc/BUILD.gn` or a `.gni` file makes the Mac Studio's outputs need a GN
  regeneration (unchanged arguments) before the nightly beta, or its build guard stops the night.
- Each per-platform difference gets one line in `chromium/PLATFORMS.md` (fork plan §5).

Architecture: **x64** only. Windows on Arm is out of scope.

## 2. Where it builds and runs

| Step | Machine | Notes |
| --- | --- | --- |
| Toolchain package | GitHub-hosted `windows-2025-vs2026` runner, once per Chromium pin | Visual Studio 2026 (toolset VC145) and Windows SDK 10.0.28000.0, as `build/vs_toolchain.py` at the pin requires (toolchain hash `3bfcb536c8`). Packaged with depot_tools' `package_from_installed.py`, encrypted to a key whose private half exists only on the build server, and uploaded as a one-day artifact. GitHub holds no secret for this. |
| Compile | `blanc-android-build` (x86-64 Linux, 20 cores, 64 GB) | Its own checkout at `~/chromium-desktop`, separate from the Android checkout, with `target_os = ['win']`. Output `out/BlancWinPrototype`. Built only through `chromium/tools/build.mjs`. |
| Transfer | This Mac | Copies the packaged build from the server and uploads it to one reused **draft** release. The server holds no GitHub credential. |
| Run and test | GitHub-hosted Windows runner | `chromium-windows-candidate.yml`, manual only, checks the asset's SHA-256, unpacks it and runs the smoke check and the suite. |
| Hand checks | The owner's Parallels Windows VM | When it starts. Not a gate. |

The server never holds a signing key. Signing (W1) will use the Electron app's existing Azure
Trusted Signing setup from a GitHub Windows runner.

The Visual Studio package is used under Visual Studio's allowance for open-source projects (Blanc
is MIT-licensed) and is never redistributed. If that route fails, the fallback is packaging it on
the owner's Windows VM.

## 3. Known limits

- **Crash reporting in a cross build is unproven.** Chromium's docs say the assembly files a cross
  build can't assemble are stubbed, so Crashpad can't report crashes; in this tree they are in fact
  assembled, so W1 tests it and corrects this line. Until then, assume none. A public Windows
  release may need a native Windows build machine; that is a later owner decision.
- **The pin is a preview.** The pending rebase (D6, F0.7) will need another full Windows build.
- **No protected video.** As on the Mac beta, and Windows has no "Open in Blanc" handoff yet.
- **Nothing public.** No Windows fork release, and no website or marketing claim about one.

## 4. The ladder

| Milestone | What it delivers | Exit gate |
| --- | --- | --- |
| **W0** First build (PW.1) | The tree compiles for Windows x64; the app launches, draws the Island, starts the blocker; the F0 suite runs on Windows | [W0 plan](../plans/2026-11-17-windows-fork-w0.md) |
| **W1** Identity and install (PW.2) | Windows identity (install mode, data folder, executable name, icon, app id) that never collides with Electron Blanc (`BlancURL`, `StartMenuInternet\Blanc`, `%APPDATA%\Blanc`) or with Chromium; window frame, window controls and high-DPI; Default Programs registration; installer; Authenticode signing | Settings → Default apps lists it; the signed installer verifies |
| **W2** Daily driver | The S1 suite on Windows, with real gaps fixed or recorded | S1 report for Windows committed |
| Later | S2 to S5 per slice, the updater (R.2), a Windows beta, crash reporting | Each gets its own plan |

Each milestone after W0 gets its own task-level plan when it starts, written against the tree as it
then stands. W1's is [`2026-11-17-windows-fork-w1.md`](../plans/2026-11-17-windows-fork-w1.md).

## 5. Working rules

- Fork work goes to `chromium/next` (merge, never rebase or force-push). The two manual workflows
  reach `main` through one small PR, because GitHub can only start a workflow that exists on the
  default branch; they are then run with `--ref chromium/next`.
- Cold builds, new machines and anything that spends money or publishes need the owner's scoped
  approval. Approved for W0 on 2026-11-17: the second checkout, the toolchain package, one cold
  Windows build and its incremental rebuilds, the workflow PR, and one GN regeneration on the Mac
  Studio.
- The Android lane shares the server. Before any build, check that no other `siso ninja` is
  running; the build guard refuses a competing build.
- One current Windows candidate at a time, named `windows-x64-<16 hex>`.
- Raw evidence stays off Git (`~/blanc-evidence/windows/` on the server). Reports follow the
  existing naming: `chromium/reports/<slice>-windows.json`.
- A fork change never carries changes to the Electron app.
