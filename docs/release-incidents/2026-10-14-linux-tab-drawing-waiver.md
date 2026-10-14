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
