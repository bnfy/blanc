# Linux tab drawing affected-machine waiver — October 14, 2026

PR [#798](https://github.com/bnfy/blanc/pull/798) (merged as `46d8fe0b`) fixes Linux tab pages that stopped drawing and barely scrolled after the user came back to them, including tabs woken after Quiet Tabs quieted them. PR [#810](https://github.com/bnfy/blanc/pull/810) (merged as `72fd2446`) adds the packaged AppImage check for it. Both are in Blanc 1.33.1, prepared in [#809](https://github.com/bnfy/blanc/pull/809). This is a release gate record, not a public release record; the v1.33.1 release incident should link here.

## Approved record

> The owner has no physical Linux machine. For the Linux drawing fix (#798), the owner accepts as the affected-machine confirmation the Ubuntu arm64 Parallels VM, where 1.33.0's code froze pages and the packaged fix cleared it (xvfb and native Wayland, ad blocking on), together with hosted x64 AppImage runs 38634817501 (the control, which failed) and 38634814253 (the fix, which passed). The hosted x64 check ran with ad blocking off. Waived: confirmation on physical Linux hardware with a real graphics driver, on an x64 desktop with a real display, and on desktops such as KDE or Hyprland. Risk: if the fix depends on the graphics stack, users on real hardware could still see pages stop drawing after switching tabs.

## Accepted evidence

A healthy page draws about 42 animation frames in 700 ms.

- **Ubuntu arm64 VM (Parallels), ad blocking on.** Unpacked linux-arm64 packaged builds, each run under xvfb and under native Wayland:
  - Pre-fix control `0c76ac8e`: v1.33.0 plus only the Settings page change [#796](https://github.com/bnfy/blanc/pull/796); no main-process change. A page shown again after a tab switch drew 9–14 frames. A tab woken after quieting stayed hidden and drew 0.
  - Fix `46d8fe0b`: 42 and 43 frames.
- **Hosted x64 AppImage, ad blocking off.** `release-windows-linux.yml` in validation mode, Linux only, running `test/desktop/packaged-tab-view-drawing-smoke.mjs`:
  - [Run 38634817501](https://github.com/bnfy/blanc/actions/runs/38634817501), control branch at `addcd2f9` (the app at `0c76ac8e` plus only the smoke and its workflow step): failed in the new step only. The page shown again drew 8 frames; the woken tab stayed hidden and drew 0.
  - [Run 38634814253](https://github.com/bnfy/blanc/actions/runs/38634814253), #810 head `94a31009` (main plus the check): 43 frames on both paths, session storage kept, whole Linux job green.
- **Release source.** `origin/main` at `72fd2446` has the same app code as `46d8fe0b` apart from `package.json` (version 1.33.1, `bundleVersion` 1331 and the new test script). CI on `72fd2446`: 21 check runs passed, 2 skipped, none failed. The dev smoke `npm run test:tab-view-drawing:desktop` runs in the quiet-tabs job on Linux and Windows on every desktop PR.

## Not tested

- Physical Linux hardware with a real graphics driver.
- An x64 desktop with a real display. The hosted run uses xvfb.
- KDE, Hyprland and other desktops.
- The reporter's own machine.
- Move Tab to New Window and Spaces in a packaged build. The dev smoke covers both.

## Owner approval

On October 14, 2026, after the missing evidence and risk were stated in this chat, the owner replied that the VM "is a valid affected environment" and approved the wording above. They added that the record must state the hosted x64 check ran with ad blocking off. This waives physical-hardware confirmation of the Linux drawing fix for Blanc 1.33.1 only. It does not approve the release, and it does not waive signing, notarization, the press gate, updater handoffs or any other release verification.

## Close and relaunch check

The owner then asked for the close-the-last-window check from `docs/release-verification.md` on the VM before this record merges. They asked for an ARM64 AppImage built from the exact candidate commit, closed normally with no forced kill, then relaunched with the same profile, with the saved tabs expected to come back.

**Candidate.** Commit `72fd24467ff2e12c1185450f8c7c80e36b0749a2`, built in the VM from a clean checkout with `npm ci` and `npx electron-builder --linux AppImage --arm64 --publish never`. The tree was clean before and after the build. The artifact is `Blanc-1.33.1-arm64.AppImage`, SHA-256 `308925b33122230d76c9b7eccd1af6fd8bb967bf92e41f369ebc57a82bba5cce`.

**Environment.**
- The same Ubuntu 26.04 ARM64 VM, running X11 on Xvfb at 1600×1000 with no window manager.
- Ubuntu's default `kernel.apparmor_restrict_unprivileged_userns=1` makes this AppImage refuse to start. That is the behaviour documented since v1.26.0 in `docs/linux-appimage-troubleshooting.md`. For this check the owner set it to `0` until the VM reboots.
- No Blanc process ran with `--no-sandbox`.
- Ad blocking was on.
- The fresh profile was seeded only with onboarding complete and search suggestions and the usage ping off.

**Method.**
1. Launch the AppImage with two local pages, one on `127.0.0.1` and one on `localhost`, and wait until `session.json` lists both.
2. Click Blanc's own close button with an X pointer (`xdotool`). No DevTools connection is open during this step. A screenshot taken just before the click shows the button in its hover state.
3. Poll the launch's process session for up to 60 seconds after the click.
4. Read `crash-ledger.json` and `session.json`.
5. Relaunch with the same profile, this time with a DevTools port so the restored tabs can be read from the Island's tab dots. That port is used for observation only.
6. Close that window the same way.

**Result at `72fd2446`.**
- **Close and exit: pass.** All 12 Blanc processes exited on their own 114 ms after the click, with exit status 0 and no window left. The crash ledger was clean: no current run, no pending recovery and no events. No forced kill was used. On the relaunch a window appeared, and closing it exited in 124 ms with status 0.
- **Saved tabs: fail.** Closing the window rewrote `session.json` with no tabs, so the relaunch opened only a New Tab.

**Control: v1.33.0, same steps.** Commit `3e761786666174bab6600b645f9cb34491f5f247`, `Blanc-1.33.0-arm64.AppImage`, SHA-256 `fcbf4d1183774ba540bb52de76e9994290b9383f3ed2558a274132d8ba9b8ee2`, built the same way. The result was identical: a clean exit 115 ms after the click with status 0, and the tabs lost the same way. 1.33.1 did not cause the tab loss.

**Quitting instead of closing.** 1.33.1 was also quit with Ctrl+Q (File → Quit) instead of the close button. It exited with status 0 in under a second, and the relaunch restored all three tabs (New Tab, Quit check A and Quit check B), loading the active one.

**Cause, from the code.** Since [#340](https://github.com/bnfy/blanc/pull/340) (`d60c8bb6`, September 13, 2026), closing a window on Windows or Linux first writes `session.json` without that window, even when it is the last one. The quit that follows deliberately does not save. macOS skips that write for its primary window. The same code runs on Windows, but this was not tested there.

**Status.** Closing and exiting pass. Tab recovery after closing the last window fails on Linux in both 1.33.0 and 1.33.1. Whether that blocks 1.33.1 is the owner's decision, still pending.
