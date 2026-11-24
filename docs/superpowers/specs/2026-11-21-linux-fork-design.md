# The Chromium fork on Linux: design

**Date:** 2026-11-21
**Status:** Draft for the owner's review, with the owner's decisions of 2026-11-21. Nothing in it is built yet.
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

4. **D4 for Linux.** Linux builds natively on the server already rented for the Android lane, in the
   same desktop checkout as Windows. Approved with it: one cold Linux x64 build and its incremental
   rebuilds, one small PR to `main` for the Linux candidate workflow, and a hooks run only if L0 finds a
   Linux build needs one.
5. **Hand checks through an arm64 build.** The owner's only Linux machine is an Ubuntu 26.04 arm64 VM, so
   from L1 the beta is also built for Linux on Arm (arm64), cross-compiled on the same server, and the
   owner checks it by eye in that VM. Linux on Arm users get it too. Rejected: a recorded waiver with
   hosted checks only (nothing seen on a real desktop before going public), and renting an x64 desktop
   VM (new spend).

**Reviews:** a builder check and a Codex review (2026-11-21) found the gaps folded in below. Chromium
facts marked *(checked at the pin)* were read in the server's tree (`~/chromium-desktop/src`,
158.0.8127.2) on 2026-11-21.

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

Architectures: **x64** from L0, and **arm64** from L1 (owner decision 5). arm64 is cross-compiled on the
x64 server (Chromium supports this with its Debian arm64 sysroot, which the checkout doesn't have yet:
fetching it is the arm64 build's one setup step, approved with that build's plan) and run on GitHub's
hosted `ubuntu-24.04-arm` runners and the owner's VM.

Target systems for the beta (my call; the owner may change it): **Ubuntu 24.04 LTS and newer, Debian
12 and newer, and the current Fedora release**. Public copy names only the systems and desktop sessions
a gate actually ran on: current Fedora and Ubuntu 26.04 have no GNOME X11 session, and the hosted
runners give headless compositors and containers, not real desktops. Other distributions may work and
are not claimed.

## 2. Where it builds and runs

**D4 for Linux (owner decision 4):** build natively on the Linux server already rented for the Android
lane (`blanc-android-build`, x86-64 Ubuntu 24.04, 20 cores, 64 GB, 905 GB disk), and test on
GitHub-hosted Linux runners. No new machine and no new cost. Unlike Windows, x64 is not cross-compiled
and no toolchain package is needed: the host is the target. (arm64 is cross-compiled, above.)

| Step | Machine | Notes |
| --- | --- | --- |
| Compile | `blanc-android-build` | The existing desktop checkout `~/chromium-desktop/src`. Its `.gclient` says `target_os = ['win']` with no `target_os_only`, so the host's own Linux dependencies are already there, and `build/linux/debian_bullseye_amd64-sysroot` is present *(checked at the pin)*. L0 first confirms whether a Linux build needs anything more; only if it does is a hooks run requested, with the guard's plans for both Windows outputs compared before and after. Outputs `out/BlancLinuxPrototype` and later `out/BlancLinuxBeta`, beside `BlancWinPrototype` and `BlancWinBeta`. Built only through `chromium/tools/build.mjs`, which already refuses a second `siso ninja` on the machine, so Linux, Windows and Android builds take turns. |
| Packages | `blanc-android-build` | Chromium's installer targets (`//chrome/installer/linux`) build the `.deb` and `.rpm` from the output. The server holds no signing key. |
| Transfer | This Mac | Copies the candidate off the server and uploads it to one reused **draft** release, `fork-linux-candidate`, as Windows does with `fork-windows-candidate`. The server holds no GitHub credential. |
| Run and test | GitHub-hosted `ubuntu-24.04` runner (x64) and `ubuntu-24.04-arm` (arm64) | `chromium-linux-candidate.yml`, manual only, checks the asset's SHA-256 and runs the launch check under X11 (`xvfb`) and Wayland (a headless compositor), the suite, and the install checks: on the runner itself for Ubuntu, and in Debian and Fedora containers on the runner. |
| Hand checks | The owner's Ubuntu 26.04 arm64 VM (Parallels on the Mac) | From L1, on the arm64 build (owner decision 5). Checks what hosted runners can't see: the dock icon and grouping, GNOME's button layout, the keyring prompt, Settings' default browser, screen sharing and the relaunch prompt after an update. KDE and x64 desktops stay unchecked by eye, and public copy says so. |

Why reuse the checkout rather than make a third (my call): it saves a ~46 GB download (the disk has
624 GB free), and every platform builds the same source at the same pin anyway. The cost is that Linux
work shares a checkout with the Windows beta. Rules for that: no Linux apply, hooks run or build while a
Windows release is between its `preflight` and `publish` stages; the guard learns the Linux outputs
(`chromium/tools/build.mjs` accepts only Mac and Windows names today) and holds the machine across
apply and build, not just one output; and after any shared build-file change both Windows outputs and
the Mac Studio's prototype and beta outputs are checked to plan only the expected small rebuild.

## 3. How people get it and how it updates

This is how Google Chrome ships on Linux, and Chromium's source already does most of it.

1. **Download.** The GitHub pre-release carries the `.deb` and `.rpm` with `SHA256SUMS` signed through
   Sigstore, as every Blanc release is; blanc.day's Download page links to them once the owner approves
   the copy (as for Windows). The first package is trusted the way Chrome's is: an HTTPS download from
   Blanc's own release, with checksums and Sigstore for anyone who verifies.
2. **Installing the package sets up the repository.** *(checked at the pin)* Chromium's packages do this
   the way Chrome's do: the `.deb` installs a daily cron job (`common/repo.cron`) that writes an apt
   source with `Signed-By` and the signing key, the `.rpm` installs `common/rpmrepo.cron` for dnf, and
   there is also a separate repository package (`deb_repo_package`, `chromium-browser-repo` when not
   Chrome-branded). **But the repository address is hard-coded to Google's**
   (`common/installer.py` `_compute_deb_repoconfig` and `_compute_rpm_repoconfig`: `dl.google.com`), and
   `debian/repo_signing_keys.gpg` holds Google's keys. Unpatched, a Blanc package would point people's
   systems at Google's repository. The fork patches both to Blanc's address and key, and a check fails
   any built package, maintainer script or cron file that names Google's repository or carries
   Google's key. The builder records, for both package types, what each script writes, when, how to
   opt out, and what uninstall removes. People who would rather add the repository by hand get the
   commands on the Download page.
3. **Updates.** Every later beta is published to the repository. The system's package manager then
   offers it with the system's other updates: on Ubuntu, Software Updater lists it, but unattended
   upgrades skip third-party repositories unless the person allows them, so it is "offered", not
   "installed automatically". The running browser should then notice its files changed and ask to
   relaunch: Chromium's `UpgradeDetector` does this, **but its notifications are built only into
   Chrome-branded builds** (`enable_update_notifications = is_chrome_branded` in
   `chrome/browser/buildflags.gni`, *checked at the pin*), and patch 0037 hides About's update status.
   The fork turns update notifications on for the Linux beta (`get_installed_version_linux.cc` reads the
   new version), keeps every link and request away from Google, and shows the relaunch through the
   Island. L3 proves it: N running, the package manager installs N+1, the Island's relaunch opens N+1.
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
half is committed. It signs the repository's metadata (apt `InRelease`, dnf `repomd.xml`) and each
`.rpm`, and the dnf configuration checks both (`gpgcheck` and `repo_gpgcheck`). Each signing run happens
on the owner's Mac, with the owner's approval, as in `update-package-sign.command`. Releases move the
exact package files that passed staging to production, then publish production's metadata. As for
Windows (W3), a package signed with the wrong key and a tampered package must both be refused.

**The repository is permanent** (my call, from the builder check): `pkg.blanc.day` and this key are the
home of the fork's Linux packages for good, not only the beta, because once installed they live in
every tester's sources list and the cron job keeps restoring them. So the key is long-lived with a
written rotation plan (`chromium/linux/repository.md`), and the layout leaves room for a later stable
`blanc` package beside `blanc-beta`, as Chrome's repository holds its channels.

**Versions.** `158.0.8127.<build>`, the Windows beta's scheme, with its own ledger
(`chromium/release/linux-ledger.json`). Linux and Windows draw build numbers from **one shared
sequence** (my call, from the builder check): a number names one source commit whatever the platform,
so `.903` on Linux and `.903` on Windows are the same browser, and neither platform waits for the other
to release. The browser's and the packages' versions must match (today `config.gni` stamps the build
number only on Windows). Neither apt nor dnf installs a lower version on its own (dnf can if asked), so
a bad beta is withdrawn by publishing a fixed one with a higher number.

## 4. What changes in the browser on Linux

- **Window frame and buttons** (owner decision 3). The Island's strip sits at the top of the window,
  laid out as a tabbed window's tab strip is, like patch 0095 for Windows. Chromium's own Linux caption
  buttons sit over the strip, where Chromium puts them from the desktop's settings (GTK's decoration
  layout, read in `ui/gtk/settings_provider_gtk.cc`), which can put buttons on either side, split
  them, or show only Close. The Island leaves room on whichever side has them. The builder traces
  `BrowserFrameViewLinux`, the button-order provider and Ozone's server-side-decoration handling at the
  pin first, and the gates test buttons on the left, the right and split. The strip's drag areas move the window; double-click
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
  `~/.config/blanc-beta`, and its own entry in the system keyring for the password store. A different
  label alone doesn't isolate it: the builder reads how
  `components/os_crypt/async/browser/freedesktop_secret_key_provider.{h,cc}` looks the secret up (its
  lookup attributes and KWallet folder) and gives the beta its own; the gates check that saved passwords
  survive a relaunch, that a missing keyring is handled, and that Electron Blanc's and Chromium's entries
  are untouched. (The fork's Sync shim also reports `android_keystore` as its storage backend on every
  platform, `blanc/services/sync_runner/shims/electron.js`; Linux gets its true backend.) Shipping Blanc's AppImage uses `~/.config/Blanc` and its own desktop file; both apps install
  side by side and neither touches the other's files or defaults.
- **Default browser.** Chromium's own path (`xdg-settings` with the package's desktop file). The
  desktop file advertises `Network;WebBrowser` and the http and https handlers.
- **Sandbox.** The browser's sandbox stays on everywhere, as Blanc's trademark policy requires of any
  package. On Ubuntu 24.04, which restricts unprivileged user namespaces, Chromium's package installs
  an AppArmor profile for its own executable that allows them (`common/apparmor.template`, loaded by
  `common/postinst.include` when AppArmor 4 is present; *checked at the pin*); the beta's profile names
  its own install path. The gate runs on a stock Ubuntu 24.04 with the restriction **on**, launched as an
  ordinary user from the installed path, and records that renderers are sandboxed (namespaces and
  seccomp). Shipping Blanc's CI turns that restriction off (`scripts/ci-enable-linux-sandbox.sh`); the
  fork's package checks must not. An unpacked L0 candidate launches with Chromium's setuid helper set
  up on the runner, never `--no-sandbox`.
- **Blocker.** The beta embeds the pinned blocker bundle as on the Mac and Windows; today
  `blanc/services/blocker/blocker_proxy.cc` finds no bundle on a Linux beta, so L1 installs it beside the
  executable and L3 proves blocking from each installed package with no override.
- **Quit after the last window** behaves as on Windows (W2): closing the last ordinary window quits.
- **Screen sharing** under Wayland goes through PipeWire (Chromium's own), as the fork plan's PL.2 asks.
- **Platform name** `linux` to the Island, sync and telemetry is already in
  `blanc/common/host_platform.h`.

## 5. The ladder

| Milestone | What it delivers | Exit gate |
| --- | --- | --- |
| **L0** First build (PL.1) | The guard learns the Linux outputs; the tree compiles for Linux x64 on the server through it; the app launches on a hosted runner under X11 and Wayland, draws the Island, starts the blocker and loads a page, sandboxed; the full suite runs on Linux | A Linux candidate in the tracker; `reports/f0-linux.json` committed; the Mac nightly and the Windows build unaffected |
| **L1** Identity, frame and packages (PL.2) | The arm64 build (sysroot, cross-compile, hosted arm64 runner); Chromium's caption buttons over the strip; the preview's Linux identity; `.deb` and `.rpm` from Chromium's installer with Google's repository and keys patched out; the blocker bundle installed; install, launch and uninstall on Ubuntu 24.04, Debian 12 and Fedora beside shipping Blanc's AppImage, with existing Electron and Chromium profiles, keyring entries and default browser left untouched; default-browser registration; the owner's OpenPGP key made and its public half committed | The frame check passes by real input on X11 and Wayland, buttons left, right and split; the install check passes on all three systems with Ubuntu's restriction on; no built file names Google's repository; the packages verify against the committed key; both architectures pass; the owner's first look at the arm64 build in the VM is recorded |
| **L2** Daily driver | The S1 suite on Linux, with real gaps fixed or recorded; Ctrl+Tab by most recent use with real keys (`xdotool`, as shipping's CI does); quit behavior | S1 report for Linux committed, every non-passing case triaged |
| **L3** Linux beta | The `blanc-beta` channel without test hooks; the staging and production repositories on `pkg.blanc.day`; the release stages (`chromium/release/linux-release.mjs`, owner-run, resumable, typed confirmation before the irreversible ones, on the Windows tool's model); an N-to-N+1 update proof through apt and through dnf from the staging repository; the first public Linux beta; then the Download page tile and its claims ledger in a website PR, with the owner's approval of the copy | Verify-public passes: a logged-out download, checksums and Sigstore, and fresh Ubuntu, Debian and Fedora containers installing the public packages and seeing the repository, on x64 and arm64; the owner's hand checks in the VM pass |

Each milestone gets its own task-level plan when it starts, written against the tree as it then
stands, as for Windows.

**Approval L0 needs from the owner (scoped, like W0's):** adding `linux` to the desktop checkout's
`target_os` and the one hooks run that fetches the Linux sysroot; one cold Linux build into
`out/BlancLinuxPrototype` and its incremental rebuilds; one small PR to `main` for
`chromium-linux-candidate.yml` (GitHub can only start a workflow that exists on the default branch);
and a GN regeneration on the Mac Studio if L0 touches a build file.

## 6. Known limits

- **Hand checks see one desktop.** The owner's arm64 VM runs GNOME on Ubuntu 26.04 (Wayland). x64 on a
  real display, KDE and Fedora are covered only by hosted checks.
- **Two builds per beta.** Each Linux beta builds x64 and arm64 on the same server, which also builds
  Windows and Android one at a time, so a Linux release takes longer to prepare.
- **Screen sharing on Wayland** goes through the desktop portal and PipeWire; the hosted runners can't
  show a portal's picker, so it is a hand check.

- **No protected video**, as on the Mac and Windows betas, and no "Open in Blanc" handoff on Linux yet.
- **Crash reporting.** There is no crash server. Local dump capture on Linux awaits the L1 installed
  check. Its per-system, per-architecture report records the browser's crash exit and any minidumps
  found under the disposable data folder.
- **The pin is a preview.** The pending rebase (D6, F0.7) will need another full Linux build.
- **Electron profile import** on Linux reads the platform name but not Electron's Linux key storage
  (libsecret), as on Windows; that belongs to S2.
- **Nothing public before L3's gate.** No release, download link, website copy or marketing claim
  about a Linux build of the fork until then. Claims follow `docs/marketing-claims.md`.

## 7. Not in scope

Flatpak, Snap and AppImage builds of the fork; an updater of our own; distributions other
than those in §1 as tested targets; crash upload; enterprise policies; any change to shipping Electron
Blanc for Linux or its AppImage updates.

## 8. Working rules

The Windows design's §5 applies unchanged: fork work goes to `chromium/next` (merge, never rebase or
force-push); cold builds, new machines and anything that spends money or publishes need the owner's
scoped approval; check that no other `siso ninja` runs before a build; one current Linux candidate at a
time, named `linux-x64-<16 hex>`; raw evidence stays off Git (`~/blanc-evidence/linux/` on the server);
reports are `chromium/reports/<slice>-linux.json`; a fork change never carries changes to the Electron
app.
