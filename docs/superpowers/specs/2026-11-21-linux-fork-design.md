# The Chromium fork on Linux: design

**Date:** 2026-11-21
**Status:** Draft for the owner's review. Nothing in it is built yet.
**Background:** the fork plan's Linux tasks PL.1, PL.2 and R.3 and decision D4
([replacement plan](../../chromium-replacement/2026-10-30-desktop-replacement-plan.md) §5, §9), and the
[Windows design](2026-11-17-windows-fork-design.md), which went from first build (W0) to a public beta
(W3, 158.0.8127.902) between November 17 and 21, 2026.

**Owner decisions, 2026-11-21:**
1. **Goal.** A public Linux beta of the fork, like the Windows beta: a GitHub pre-release, never
   latest, that people install and that keeps itself current.
2. **Packaging and updates.** `.deb` and `.rpm` packages built by Chromium's own Linux installer, served
   from a signed Blanc package repository. Updates arrive through the system's own updates (apt, dnf),
   not through an updater of ours. This replaces the fork plan's R.3 (AppImage self-update). Rejected:
   an AppImage with our own updater (all custom code, and the browser's sandbox needs a workaround on
   Ubuntu 24.04 that an AppImage can't install), and Flatpak (Chromium's sandbox has to run through
   zypak, and Flathub's review sets release timing).
3. **Window buttons.** Chromium's own Linux caption buttons, drawn over the Island's strip; the Island
   draws none there. This matches the Windows fork and differs from shipping Blanc for Linux, which draws
   its own.

**Waiting for the owner:** D4 for Linux (below, §2) and the scoped approval for L0's checkout change and
cold build (§5).

## 1. What Linux is in the fork

Linux is the third build of the **desktop lane**, as Windows is the second: the same
`chromium/lanes/desktop.json`, patch list, `chromium/blanc/` source and Chromium pin as the Mac
(158.0.8127.2, upstream `681cd621e82e606d7536eae8ea2576afb3c7d65c`). The Windows design's §1 rules hold
unchanged:
- A Linux fix in `chromium/blanc/` or a patch is a change to the Mac's and Windows' source too. It must
  keep `check-patches.py` passing and must not change what the Mac or Windows compiles. Linux-only code
  sits behind `is_linux` in GN and `BUILDFLAG(IS_LINUX)` in C++ (never `IS_POSIX`, which includes the Mac).
- A change to `blanc/BUILD.gn` or a `.gni` file needs the Mac Studio's outputs regenerated with
  unchanged arguments before the nightly beta.
- Each per-platform difference gets one line in `chromium/PLATFORMS.md`'s Linux section.

Architecture: **x64** only. Linux on Arm is out of scope.

Supported systems for the beta (my call; the owner may change it): **Ubuntu 24.04 LTS and newer, Debian
12 and newer, and the current Fedora release**, under both **X11 and Wayland**, on GNOME and KDE Plasma.
Other distributions may work and are not tested.

## 2. Where it builds and runs

**D4 for Linux (proposed, needs the owner's yes):** build natively on the Linux server already rented
for the Android lane (`blanc-android-build`, x86-64 Ubuntu 24.04, 20 cores, 64 GB, 905 GB disk), and test
on GitHub-hosted Linux runners. No new machine and no new cost. Unlike Windows, nothing is
cross-compiled and no toolchain package is needed: the host is the target.

| Step | Machine | Notes |
| --- | --- | --- |
| Compile | `blanc-android-build` | The existing desktop checkout `~/chromium-desktop/src`, with `linux` added to `.gclient`'s `target_os` so the Linux sysroot is fetched (one hooks run, owner-approved). Outputs `out/BlancLinuxPrototype` and later `out/BlancLinuxBeta`, beside `BlancWinPrototype` and `BlancWinBeta`. Built only through `chromium/tools/build.mjs`, which already refuses a second `siso ninja` on the machine, so Linux, Windows and Android builds take turns. |
| Packages | `blanc-android-build` | Chromium's installer targets (`//chrome/installer/linux`) build the `.deb` and `.rpm` from the output. The server holds no signing key. |
| Transfer | This Mac | Copies the candidate off the server and uploads it to one reused **draft** release, `fork-linux-candidate`, as Windows does with `fork-windows-candidate`. The server holds no GitHub credential. |
| Run and test | GitHub-hosted `ubuntu-24.04` runner | `chromium-linux-candidate.yml`, manual only, checks the asset's SHA-256 and runs the launch check under X11 (`xvfb`) and Wayland (a headless compositor), the suite, and the install checks: on the runner itself for Ubuntu, and in Debian and Fedora containers on the runner. |
| Hand checks | The owner's Linux VM | When it starts. Not a gate. |

Why reuse the checkout rather than make a third (my call): it saves a ~46 GB download, and every
platform builds the same source at the same pin anyway. The cost is that a hooks run touches the
checkout the Windows beta builds from. The plan records the checkout's state before and after, and
checks that the Windows output still plans the same small build.

## 3. How people get it and how it updates

This is how Google Chrome ships on Linux, and Chromium's source already does most of it.

1. **Download.** The GitHub pre-release carries `blanc-beta_<version>_amd64.deb` and
   `blanc-beta-<version>.x86_64.rpm`, and blanc.day's Download page links to them once the owner approves
   the copy (as for Windows).
2. **Installing the package sets up the repository.** Chromium's installer carries the script Chrome
   uses to add Google's repository and key when its package is installed (`chrome/installer/linux/common/`,
   the repository-setup cron job and post-install step). The fork rebrands it to Blanc's repository and
   Blanc's key. The builder confirms what the pinned tree's script does before relying on it. People who
   would rather add the repository by hand get two commands on the Download page.
3. **Updates.** Every later beta is published to the repository. apt (Ubuntu, Debian) and dnf (Fedora)
   install it with the system's other updates. The running browser notices its files changed on disk
   and asks to relaunch (Chromium's `UpgradeDetector`); the builder confirms this works for a
   non-Chrome-branded build and that nothing points people at Google.
4. **Uninstall** through the system's package manager removes the browser and leaves the person's data
   folder, as Chrome does.

**The repository.** Static files in a Cloudflare R2 bucket served from **`pkg.blanc.day`** (my call; the
Windows update server and blanc-ping already run on Cloudflare): an apt repository (`dists/`, `pool/`, a
signed `InRelease`) and a dnf repository (`repodata/` with a signed `repomd.xml`). A **staging**
repository on its own address, with the same key, takes each release first, the way
`blanc-update-staging` does for Windows. The repository keeps the newest few versions (the builder sets
the number, within R2's free storage where possible).

**The signing key.** A new OpenPGP key that the owner creates and holds like the Windows CRX publisher
key and the Sparkle key: in 1Password (Dev), never on the build server and never in GitHub. The public
half is committed. It signs the repository's metadata and each `.rpm`. Each signing run happens on the
owner's Mac, with the owner's approval, as in `update-package-sign.command`.

**Versions.** `158.0.8127.<build>`, the Windows beta's scheme, with its own ledger
(`chromium/release/linux-ledger.json`) and its own counter starting at 901 (my call). apt and dnf never
install a lower version, so a bad beta is withdrawn by publishing a fixed one with a higher number.

## 4. What changes in the browser on Linux

- **Window frame and buttons** (owner decision 3). The Island's strip sits at the top of the window,
  laid out as a tabbed window's tab strip is, like patch 0095 for Windows. Chromium's own Linux caption
  buttons sit over the strip. Chromium already places them where the desktop asks (the GTK decoration
  layout, which can put them on the left or show only Close, as GNOME does by default), so the Island
  leaves room on whichever side has them. The strip's drag areas move the window; double-click
  maximizes; the window edges resize. This must hold under X11 and Wayland, at 100% and 200% scale.
  Chromium's "Use system title bar and borders" setting stays available and off by default; with it on,
  the system's title bar shows above the strip (a `PLATFORMS.md` line, not a gap).
- **Main menu.** The Island's menu button opens Chromium's app menu at the button (patch 0096 already
  does this; Linux turns it on).
- **Identity.** Its own names everywhere, none of them shipping Blanc's or Chromium's, listed in
  `chromium/linux/identity.md` with a test like `windows-identity.test.mjs`:
  package `blanc-beta` (preview builds `blanc-prototype`), install folder `/opt/bnfy/blanc-beta`,
  launcher `/usr/bin/blanc-beta`, desktop file `blanc-beta.desktop`, a window class and Wayland app id
  that match it (so the dock groups its windows under the Sunrise icon), data folder
  `~/.config/blanc-beta`, and its own keyring entry for the password store (not "Chromium Safe
  Storage"). Shipping Blanc's AppImage uses `~/.config/Blanc` and its own desktop file; both apps install
  side by side and neither touches the other's files or defaults.
- **Default browser.** Chromium's own path (`xdg-settings` with the package's desktop file). The
  desktop file advertises `Network;WebBrowser` and the http and https handlers.
- **Sandbox.** The browser's sandbox stays on everywhere, as Blanc's trademark policy requires of any
  package. On Ubuntu 24.04, which restricts the kernel feature Chromium's sandbox prefers, the package
  installs what the pinned tree's installer provides for that case (the setuid sandbox helper, or an
  AppArmor profile; the builder confirms which). Never `--no-sandbox`.
- **Quit after the last window** behaves as on Windows (W2): closing the last ordinary window quits.
- **Screen sharing** under Wayland goes through PipeWire (Chromium's own), as the fork plan's PL.2 asks.
- **Platform name** `linux` to the Island, sync and telemetry is already in
  `blanc/common/host_platform.h`.

## 5. The ladder

| Milestone | What it delivers | Exit gate |
| --- | --- | --- |
| **L0** First build (PL.1) | The tree compiles for Linux x64 on the server through the guard; the app launches on a hosted runner under X11 and Wayland, draws the Island, starts the blocker and loads a page; the full suite runs on Linux | A Linux candidate in the tracker; `reports/f0-linux.json` committed; the Mac nightly and the Windows build unaffected |
| **L1** Identity, frame and packages (PL.2) | Chromium's caption buttons over the strip; the preview's Linux identity; `.deb` and `.rpm` from Chromium's installer; install, launch and uninstall on Ubuntu 24.04, Debian 12 and Fedora beside shipping Blanc's AppImage, sandbox on; default-browser registration; the owner's OpenPGP key made and its public half committed | The frame check passes by real input on X11 and Wayland; the install check passes on all three systems; the packages verify against the committed key |
| **L2** Daily driver | The S1 suite on Linux, with real gaps fixed or recorded; Ctrl+Tab by most recent use with real keys (`xdotool`, as shipping's CI does); quit behavior | S1 report for Linux committed, every non-passing case triaged |
| **L3** Linux beta | The `blanc-beta` channel without test hooks; the staging and production repositories on `pkg.blanc.day`; the release stages (`chromium/release/linux-release.mjs`, owner-run, resumable, typed confirmation before the irreversible ones, on the Windows tool's model); an N-to-N+1 update proof through apt and through dnf from the staging repository; the first public Linux beta; then the Download page tile and its claims ledger in a website PR, with the owner's approval of the copy | Verify-public passes: a logged-out download, checksums and Sigstore, and fresh Ubuntu, Debian and Fedora containers installing the public packages and seeing the repository |

Each milestone gets its own task-level plan when it starts, written against the tree as it then
stands, as for Windows.

**Approval L0 needs from the owner (scoped, like W0's):** adding `linux` to the desktop checkout's
`target_os` and the one hooks run that fetches the Linux sysroot; one cold Linux build into
`out/BlancLinuxPrototype` and its incremental rebuilds; one small PR to `main` for
`chromium-linux-candidate.yml` (GitHub can only start a workflow that exists on the default branch);
and a GN regeneration on the Mac Studio if L0 touches a build file.

## 6. Known limits

- **No protected video**, as on the Mac and Windows betas, and no "Open in Blanc" handoff on Linux yet.
- **No crash upload.** Crashpad writes dumps locally (to be confirmed in L1, as Windows did); there is
  no crash server.
- **The pin is a preview.** The pending rebase (D6, F0.7) will need another full Linux build.
- **Electron profile import** on Linux reads the platform name but not Electron's Linux key storage
  (libsecret), as on Windows; that belongs to S2.
- **Nothing public before L3's gate.** No release, download link, website copy or marketing claim
  about a Linux build of the fork until then. Claims follow `docs/marketing-claims.md`.

## 7. Not in scope

Linux on Arm; Flatpak, Snap and AppImage builds of the fork; an updater of our own; distributions other
than those in §1 as tested targets; crash upload; enterprise policies; any change to shipping Electron
Blanc for Linux or its AppImage updates.

## 8. Working rules

The Windows design's §5 applies unchanged: fork work goes to `chromium/next` (merge, never rebase or
force-push); cold builds, new machines and anything that spends money or publishes need the owner's
scoped approval; check that no other `siso ninja` runs before a build; one current Linux candidate at a
time, named `linux-x64-<16 hex>`; raw evidence stays off Git (`~/blanc-evidence/linux/` on the server);
reports are `chromium/reports/<slice>-linux.json`; a fork change never carries changes to the Electron
app.
