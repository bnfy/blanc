# Desktop lane: Chromium 159 preflight and patch rebase

Plan: `docs/superpowers/plans/2026-11-22-desktop-fork-chromium-159.md`, Tasks 1–3 (side branch
`chromium/rebase-159`, no build tree touched). Started 2026-11-24 18:25 UTC, patches applying
18:55 UTC, unit suite at parity 19:00 UTC.

## The revision

| | |
| --- | --- |
| From | 158.0.8127.37 at `b8c2be851f62f6a394ec57955d7f31335d7cb6d4` (the Mac Studio's and the Linux server's checkouts) |
| To | **159.0.8154.33** at **`ab2e5d8ad16ca47ad4361c9517225f1ac884d255`** |
| Channel | Beta, the same version and commit for Mac, Windows and Linux on chromiumdash (`fetch_releases?channel=Beta`), released 2026-11-24 |

The plan named 159.0.8154.13 (November 22); .33 replaced it as the newest Beta on all three
platforms before this work started.

The pinned files came from a sparse, blobless copy of `chromium/src` fetched at that commit on the
MacBook Pro (`git fetch --depth 1 --filter=blob:none`), with `chrome/VERSION` reading
159.0.8154.33. No checkout on the Mac Studio or the Linux server was changed; both still read
158.0.8127.37 at `b8c2be851f62`.

## Toolchain changes (each needs an approval in Task 4 or 5)

Compared with the 158.0.8127.37 trees (read-only on the Mac Studio and the server):

| Input | 158.0.8127.37 | 159.0.8154.33 | Effect |
| --- | --- | --- | --- |
| clang (`tools/clang/scripts/update.py`) | `llvmorg-24-init-14453-ge063be79`-1 | `llvmorg-24-init-17044-gc3223914`-1 | **Changed**: `gclient sync` hooks download a new clang; every output's recorded build environment changes |
| Rust (`tools/rust/update_rust.py`) | `8a9dd7abdf01`-1 | `96a18bf5ffa2`-4 | **Changed**: same as clang |
| Siso (`DEPS` `siso_version`) | `dfc32e4edca1` | `59d84e3b0543` | **Changed** |
| GN (`DEPS` `gn_version`) | `938087829fcb` | `4df39f484f1f` | **Changed** |
| ninja (`DEPS`) | `1.12.1.chromium.4` | same | unchanged |
| Windows (`build/vs_toolchain.py`) | `TOOLCHAIN_HASH 3bfcb536c8`, SDK 10.0.28000.0 | identical file | **No new Windows toolchain package needed** |
| macOS SDK (`build/config/mac/mac_sdk.gni`) | `mac_sdk_official_version 27.0` | identical file | The Mac Studio's Xcode 27.2 stays enough |
| Linux sysroots (`build/linux/sysroot_scripts/sysroots.json`) | | identical file | unchanged |
| `.gn` | | identical file | unchanged |

Because clang, Rust, Siso and GN change, every output's build will be a cold rebuild (a plan far
over 1000 actions), and `build.mjs --check` will refuse each output until its environment is
re-recorded after review.

## Disk room (2026-11-24 19:00 UTC)

| Machine | Free | Largest output |
| --- | --- | --- |
| Mac Studio (`~/Projects/Blanc/src`, outputs BlancBeta, BlancPrototype, BlancRelease) | 1.1 TiB of 1.8 TiB | BlancBeta 12 GB |
| Linux server (`~/chromium-desktop/src`, six desktop outputs) | 485 GB of 905 GB | BlancWinBeta 16 GB |

Both have far more than one output folder free on top of what is used.

## Patch rebase

`refresh-upstream.py --lane desktop` first exited 1: Chromium 159 moved four Settings templates
from `.html` files to inline Lit templates in `.html.ts` (`privacy_page`, `settings_main`,
`settings_menu`, `settings_ui`). The manifest now pins those four `.html.ts` files instead (257
files, unchanged in number). The patch series was then replayed as commits on the 159 files with
three-way merges, and each patch was regenerated from its rebased commit. 93 of 115 patches
apply unchanged; 22 were rewritten. A line-by-line audit of every patch's added and removed lines
on 158 against 159 found no lost change beyond those listed here.

Patches that needed real changes:

- **0001 foundation baseline**: 159 added two isolated worlds (Autofill custom form controls,
  Actor), so the Java mirror's `ISOLATED_WORLD_ID_BLANC_COSMETICS` is now `CONTENT_END + 7`
  (and the unused extensions slot `+ 8`), matching the C++ enum's order. Session restore's
  window identity follows 159's `waap::CreateBrowserWindowAndRecordCreationSource`; the tab and
  window identity calls sit beside 159's `CHECK(..., NotFatalUntil::M163)`. The deferred Mac
  startup restore keeps its lambda; 159 only changed the version string to a `string_view`.
- **0021, 0022, 0024, 0030 (Privacy page)**, **0037, 0038 (`settings_ui`)**, **0042
  (`settings_main`, `settings_menu`)**: their hunks moved to the `.html.ts` templates, two
  spaces shallower. 0037's narrow threshold and 0038's sidebar search are now attribute edits on
  159's reflowed `<cr-toolbar>`.
- **0025**: 159 shows the tab hover-card link row only without `settingsRefresh2026`; Blanc's
  `hidden` sits inside that condition.
- **0027, 0066 (People page)**: 159 restructured `people_page.html.ts`; Blanc's hidden Sync and
  Google services rows, the Profiles row and the link-routing card were placed again beside the
  same rows.
- **0038**: `md_select_lit.css` now names `chrome://resources/images/...`; Blanc's
  `--blanc-select-chevron` fallback uses the new URLs.
- **0042**: Blanc's Sync section is created before 159's new `settingsRefresh2026` home route.
  `blanc_sync_page` stays in `web_component_files`: 159's `html_to_wrapper` still detects a Lit
  template from the element's `lit.rollup.js` import.
- **0113 (Linux identity)**: 159 moved `GetDesktopName` into `base/version_info/nix`.
  `chrome::GetDesktopName` (every caller in `shell_integration_linux.cc`) now returns Blanc's
  `<package>.desktop` itself in Chromium-branded builds, honoring `$CHROME_DESKTOP` as before;
  nothing in `base` is patched.
- **0115 (Linux installer)**: 159 added snap package targets; they are removed as 0115 already
  removed Flatpak's, and `enable_snap_package` stays declared. 159's `rpm/build.py` now checks
  the built RPM's dependencies; Blanc's list keeps 159's new `rpmlib(...)` lines and still drops
  `/usr/sbin/update-alternatives`.

Context or include-only rewrites: 0003, 0023 (`sidePanelAlignmentOverridesPref_` is now
`private`), 0029, 0036, 0046 (`CheckUserDataDirPolicy` returns `policy_set`), 0047, 0065, 0083,
0111, 0112.

`check-patches.py` passes for the desktop lane (264 patched files) and the Android lane.

## Blanc source on 159, as far as can be told without building

- **Already fixed**: `sync_runner_service.cc` called V8's `FunctionCallbackInfo::Data()`, which
  159 removed. #1728's shared change (`DataV2()`, `CopyContents` in the blocker's `Decode`, the
  pass-key `CosmeticDocument`), which compiled on 159 for Android, is on this branch: it was
  carried here first and then reached `chromium/next` from `main` (e34a231b5) while this ran.
- Every `#include` in Blanc's desktop sources and in the patches' added lines that existed in the
  158 tree still exists in 159 (583 checked), and no Chromium directory Blanc's `BUILD.gn` files
  depend on was removed.
- Blanc's desktop code already uses `WindowOpenDisposition::kNewForegroundTab` and friends,
  which 159 requires.
- The rewritten Settings TypeScript resolves all its imports in the 159 tree.
- Not checkable without a build: API changes inside headers that still exist, in particular in
  `blanc/browser/ui/blanc_prototype_ui.cc` and the Mac, Windows and Linux platform code. The
  Lit move and 159's `settingsRefresh2026Enabled_`/`isSettingsSearch2026Enabled_` paths may change
  how Blanc's Settings sheet looks; that needs a run, not only a compile.

## Release tooling

- `policy.mjs` names 159.0.8154.33 at `ab2e5d8ad16c`. The desktop nightly and the Windows
  beta prep derive their `VERSION_PREFIX` from it (plan Task 1), and
  `release/pin-consistency.test.mjs` keeps the policy equal to `lanes/desktop.json`.
- Test fixtures that model a release on the current pin now derive their versions from the
  pin (six test files) or name the 159 pin (`release/fixtures/release.json` and the
  beta.3-to-beta.4 site fixture's beta.4 side). Ledgers and records of past releases keep 158.
- `release/build-claims.mjs` and `desktop-nightly-rules.mjs` keep the sequence name
  `desktop-158`, so build numbers continue across the milestone as the plan requires.
- The patch-footprint lines in the L1 and L3 Linux plans were re-measured on 159 (0115: 44
  hunks; the queue through 0116: 925 hunks).

## Approvals the checkout move needs (Tasks 4 and 5)

Mac Studio (`~/Projects/Blanc/src`, outputs BlancPrototype, BlancBeta, BlancRelease):

1. A window with the Mac Studio's nightlies paused (the Mac beta nightly at 02:00 local, 07:00
   UTC, and the desktop nightly at 04:00 local, both `me.bnfy.blanc.*` LaunchAgents) and no beta
   release between preflight and publish.
2. The download and hooks: `git fetch --depth 1 origin ab2e5d8ad16c`, checkout, and
   `gclient sync -D --no-history` (new clang, Rust, Siso and GN).
3. Re-recording each output's build environment after reviewing its diff (clang, Rust, Siso, GN;
   the SDK and Xcode are unchanged).
4. Cold builds over 1000 actions (`--allow-large-build`) for BlancPrototype and BlancBeta
   (and BlancRelease if it is still used).

Linux server (`~/chromium-desktop/src`, outputs BlancWinPrototype, BlancWinBeta,
BlancLinuxPrototype, BlancLinuxArm64Prototype, BlancLinuxBeta, BlancLinuxArm64Beta):

1. The same window, with the Windows and Linux nightlies paused, the checkout lock free, and no
   `chromium-beta-windows-*` or Linux release between preflight and publish.
2. The download and hooks in the shared desktop checkout with `~/depot_tools-desktop`, then
   `mount-toolchain.sh`.
3. Re-recording each of the six outputs' environments after review.
4. A cold build over 1000 actions for each of the six outputs, one at a time.

Not needed: a Windows toolchain repackage (`vs_toolchain.py` is unchanged) and a new Xcode.

## Stage 2: the checkouts moved and the first 159 builds (2026-11-24 to 25)

The owner approved the move in this session on 2026-11-24 ("Yes, move both"). The Mac Studio's
two nightlies (`me.bnfy.blanc.beta-nightly`, `me.bnfy.blanc.desktop-nightly`) were paused with
`launchctl bootout` at 19:09 UTC and stay paused until Task 6 passes on the Mac.

- **Mac Studio** (`~/Projects/Blanc/src`): pristine restore, `gclient sync -D --no-history` at
  `ab2e5d8ad16c` (19:21 UTC; the first attempt stopped because the SSH shell's PATH lacked
  `/opt/homebrew/bin`, where `git-lfs` lives, and the new `third_party/litert/src` needs it), then
  `apply.py` (303 files), GN for BlancPrototype and BlancBeta with `args.gn` unchanged. Evidence:
  `records/move-159/`.
- **Linux server** (`~/chromium-desktop/src`, under the checkout lock throughout): the same move
  with the unchanged Windows toolchain package `b4f603a344` (sync 19:22 UTC), `apply.py` (331
  files), GN for all six outputs with `args.gn` unchanged. Evidence: `~/blanc-evidence/move-159/`.
- **Build environments**, re-recorded after review: only `clangRevision` and `clangVersion`
  changed (`llvmorg-24-init-14453-ge063be79-1` → `llvmorg-24-init-17044-gc3223914-1`) on all eight
  outputs. Xcode 27.2 and the macOS SDK, the Visual Studio package and Windows SDK 10.0.28000.0,
  and both Linux sysroots are unchanged.

Fixes the builds needed, on this branch:

- `blanc/ui.gni`: 159 moved `//chrome/browser/ui:browser_window_theme_observer` to
  `//chrome/browser/ui/browser_window_theme_observer` and removed
  `//chrome/browser/ui:ui_controller_factory` (GN stopped on both).
- Patches 0085 and 0110: `MdTextButton::SetBgColorOverrideDeprecated(SkColor)` is
  `SetBgColorOverride(std::optional<ui::ColorVariant>)` in 159. Nothing else failed to compile.

Builds, each through `build.mjs --build --allow-large-build`, one at a time per machine:

| Output | Finished (UTC) | Last run |
| --- | --- | --- |
| BlancPrototype (Mac) | 2026-11-24 20:23 | 3,898 steps after the rename fix (the cold part ran 19:24–20:14) |
| BlancBeta (Mac) | 2026-11-24 21:17 | 57,471 steps, 53 min |
| BlancWinPrototype | 2026-11-24 20:51 | 3,882 steps after the fix (cold part 19:26–20:42) |
| BlancWinBeta | 2026-11-24 22:13 | 65,446 steps, 1 h 22 min |
| BlancLinuxPrototype | 2026-11-24 23:19 | 57,190 steps, 1 h 7 min |
| BlancLinuxArm64Prototype | 2026-11-25 01:05 | 94,168 steps, 1 h 45 min |
| BlancLinuxBeta | 2026-11-25 02:16 | 57,246 steps, 1 h 8 min |
| BlancLinuxArm64Beta | 2026-11-25 03:57 | 94,165 steps, 1 h 41 min |

The Linux beta guard first refused BlancLinuxBeta for two leftovers of the sync outside the
lane's map: the 158 checkout of `third_party/wayland-protocols/kde` (159 moved that dependency to
`kde/src`) and `buildtools/reclient_cfgs/reproxy.cfg`, which a sync hook writes and 159's
`.gitignore` no longer covers. Both were moved into `~/blanc-evidence/move-159/stale/`, not deleted.
**Decided (owner, 2026-11-25):** every `gclient sync` writes `reproxy.cfg` again, so the guard (`tools/checkout-status.mjs`) now skips exactly that path while it is untracked (`GCLIENT_HOOK_OUTPUTS`, tested in `tools/checkout-status.test.mjs`); any other file outside the map, or a tracked change to that one, still stops a Linux beta build.

Not done yet: nothing has been run (Task 6), the branch is not merged into `chromium/next`, and
the nightlies stay paused. The Studio's BlancRelease output was not regenerated or rebuilt.
