# Linux fork L1: identity, frame and packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax. Codex implements; Claude reviews each task before the next starts, as in L0.

**Goal:** the Linux preview installs and looks like its own app on x64 and arm64: Chromium's caption
buttons over the Island's strip, its own names everywhere, `.deb` and `.rpm` packages from Chromium's
installer that point at Blanc's repository and key (never Google's), the blocker installed beside the
browser, and installs that leave shipping Blanc, Chromium and the person's defaults alone. L1 is the
fork plan's PL.2.

**Architecture:** every change is a desktop-lane patch or `chromium/blanc/` source behind `is_linux` /
`BUILDFLAG(IS_LINUX)`, built in the shared checkout on `blanc-android-build` through the guard, as in
L0. A second output cross-compiles arm64 against Chromium's Debian arm64 sysroot. Packaging adds
Chromium's `//chrome/installer/linux` targets to the candidate, so one candidate tarball per
architecture carries the unpacked browser and both packages. The `.rpm` is signed on the owner's Mac
with the new repository key; the candidate workflow gains an `arch` input, an `ubuntu-24.04-arm`
runner, a frame check and an install check on Ubuntu, Debian and Fedora.

**Tech stack:** Chromium 158.0.8127.2 (GN, Siso, `//chrome/installer/linux`), Node 22 harness
(`node --test`), bash, GitHub Actions (`ubuntu-24.04`, `ubuntu-24.04-arm`), Docker (`debian:12`,
`fedora:<current release>`), `xdotool`, GnuPG and `rpmsign` on the owner's Mac. The Fedora image is pinned by digest when Task 7 starts and named in the report.

**Spec:** [`docs/superpowers/specs/2026-11-21-linux-fork-design.md`](../specs/2026-11-21-linux-fork-design.md)
§1, §3 (the repository and key paragraphs), §4 and §5's L1 row. **Before it:**
[L0](2026-11-21-linux-fork-l0.md): its candidate, `reports/f0-linux.json` and the Linux sections of
`chromium/STATUS.md` and `chromium/PLATFORMS.md` must exist before Task 8.

## Decisions this plan asks the owner for (approving the plan approves them)

1. **The arm64 build:** fetching Chromium's Debian arm64 sysroot into the shared checkout
   (`build/linux/sysroot_scripts/install-sysroot.py --arch=arm64`, the one setup step the spec
   names) and one cold arm64 build into `out/BlancLinuxArm64Prototype`, with its incremental rebuilds.
2. **Repository names, fixed now because installed packages keep restoring them:** production
   `https://pkg.blanc.day`, staging `https://pkg-staging.blanc.day`. apt line
   `deb [arch=<arch> signed-by=<keyring>] https://pkg.blanc.day/deb stable main`; dnf `baseurl`
   `https://pkg.blanc.day/rpm/stable/$basearch`. **Preview packages (`blanc-prototype`) point at
   staging; only `blanc-beta` (L3) points at production,** so no test build ever adds the production
   repository to anyone's system. Neither host exists until L3, so `apt update` on a machine with a
   preview installed warns until then.
3. **The key:** RSA 4096 (accepted by every target's apt and rpm; Chrome's keys are RSA 4096), user id
   `Blanc Linux Repository <support@blanc.day>`, signing-only, expiring 2028-11-21 and extended before
   then per the rotation plan. Made on the owner's Mac in a throwaway `GNUPGHOME`; the secret half goes
   to 1Password (Dev, item **"Blanc Linux Repository Signing"**) and nowhere else.
4. **Wayland frame evidence:** hosted runners have no Wayland compositor that takes real pointer
   input. X11 is checked by real input on the runner (`xdotool`); Wayland's frame gate items are checked
   by the owner in the arm64 VM (GNOME, Wayland) and recorded in `chromium/linux/hand-checks-l1.md`.
   Wayland still gets the hosted launch and layout check (buttons drawn, no overlap) without input.

## Facts this plan rests on (read 2026-11-21 at the 158.0.8127.2 pin and on `chromium/next` 2439f5ee2)

- **Installer.** `chrome/installer/linux/BUILD.gn` `linux_package("stable"|"beta"|"unstable"|"canary")`
  builds `<package>-<channel>_<version>-1_<deb_arch>.deb` and `.rpm`; `package` is `chromium-browser`
  unless Chrome-branded. `common/installer.py` reads `common/chromium-browser.info` (`PACKAGE`,
  `INSTALLDIR=/opt/chromium.org/chromium`, `MENUNAME`, `RDN=org.chromium.Chromium`, maintainer, URLs)
  and, for any channel but stable, appends `-<channel>` to `PACKAGE` and `INSTALLDIR` and
  ` (<channel>)` to `MENUNAME`; `StartupWMClass` is `PACKAGE`. `normalize_channel` accepts only
  stable, beta/testing, dev/unstable/alpha and canary, and returns Google release-blog URLs.
  `_compute_deb_repoconfig` and `_compute_rpm_repoconfig` hard-code `dl.google.com`;
  `debian/repo_signing_keys.gpg` is Google's keyring; `common/repo.cron` and `rpmrepo.cron` write the
  sources; `common/apparmor.template` and `postinst.include` install the AppArmor profile. `deb_arch`
  and `rpm_arch` cover `amd64`/`x86_64` and `arm64`/`aarch64`.
- **Data folder.** `chrome/common/chrome_paths_linux.cc` `GetDefaultUserDataDirectory`: basename
  `chromium` for Chromium branding plus `GetChannelSuffixForDataDir()`, under `$CHROME_CONFIG_HOME` or
  `$XDG_CONFIG_HOME`.
- **Desktop name.** `chrome/common/channel_info_posix.cc` `GetDesktopName` returns
  `chromium-browser.desktop` (or `$CHROME_DESKTOP`); `shell_integration_linux.cc` uses it for
  `xdg-settings` (default browser) and derives window class names from it.
- **Keyring.** `components/os_crypt/async/browser/freedesktop_secret_key_provider.h:161-163`:
  `kKWalletFolder "Chromium Keys"`, `kKeyName "Chromium Safe Storage"`, `kAppName "chromium"`; the
  Secret Service lookup matches `{application: kAppName, xdg:schema}`.
- **Blocker.** `blanc/services/blocker/blocker_proxy.cc:151-160` finds the embedded bundle only on Mac
  and Windows beta builds; previews take `--blanc-blocker-assets`. `blanc/BUILD.gn:142` copies the
  Windows beta's engine beside the executable.
- **Frame.** `chrome/browser/ui/views/frame/` has `browser_frame_view_linux{,_native}.cc`,
  `browser_frame_view_layout_linux{,_native}.cc` and `opaque_browser_frame_view_layout.cc`; GTK's button
  order comes from `ui/gtk/settings_provider_gtk.cc` (`gtk-decoration-layout`). Windows' equivalent is
  patch 0095 (`browser_frame_view_win.cc`), with 0097 for the strip's drag areas and 0096 for the app
  menu anchor. `blanc_prototype_ui.cc:14681` sets the hidden strip's drag band (10 px Windows, 6
  elsewhere).
- **Island.** `island/prototype.css:76-77` hides the Island's own buttons on `win32` and reserves a fixed
  `--window-controls-w: 137px`; `styles.css:296` gives every non-Mac platform 114 px. Linux needs a
  measured width on each side, because GTK can put buttons left, right or both.
- **Sysroot.** `build/linux/sysroot_scripts/sysroots.json` lists `bullseye_arm64`
  (`debian_bullseye_arm64-sysroot`); only the amd64 and i386 sysroots are installed.
- **Gating today.** `blanc/config.gni:28-31` allows a beta channel only for `mac` and `win`/x64. Every
  Linux identity value below is new.

## Global constraints

- Everything in L0's Global Constraints holds: guarded builds only on `blanc-android-build`, never
  during a Windows release (`setup.sh --windows-release-idle`), the checkout lock, the Android
  checkout untouched, no `--no-sandbox`, Ubuntu's `kernel.apparmor_restrict_unprivileged_userns` left
  at `1`, no secret on the server or in GitHub.
- Linux-only code sits behind `is_linux` / `BUILDFLAG(IS_LINUX)`, never `is_posix` / `IS_POSIX`. Each
  patch keeps what the Mac and Windows compile identical; after any build-file change, both Windows
  outputs' plans are compared before and after (as `setup.sh` does) and the Mac Studio's outputs are
  regenerated with unchanged arguments before the nightly, at most once for all of L1.
- A new patch to an upstream file not yet in `chromium/upstream/manifest.json` imports its pristine
  copy first; the manifest, the lane's `fileCount`, `source-map.json`'s `upstreamFiles` and the count in
  `check-patches.test.mjs` change with it. New patches start at 0112.
- Preview identity (every name is new; none may equal a name shipping Blanc, Chromium or Chrome uses):
  package `blanc-prototype`, install folder `/opt/bnfy/blanc-prototype`, launcher
  `/usr/bin/blanc-prototype`, desktop file `blanc-prototype.desktop`, window class and Wayland app id
  `blanc-prototype`, menu name `Blanc Prototype`, data folder `~/.config/blanc-prototype`, keyring
  application `blanc-prototype`, key name `Blanc Prototype Safe Storage`, KWallet folder
  `Blanc Prototype Keys`. Beta values (`blanc-beta`, `/opt/bnfy/blanc-beta`, `Blanc Beta`,
  `~/.config/blanc-beta`, `Blanc Beta Safe Storage`, `Blanc Beta Keys`) are fixed in the same table
  and config but built only in L3.
- Maintainer `Bananify Creative <support@blanc.day>`, homepage `https://blanc.day`, developer name
  `Bananify Creative`. Shipping Blanc's AppImage uses `~/.config/Blanc` and `blanc.desktop`.
- The repository's secret key never reaches the server, GitHub, the VM or the repo; only
  `chromium/linux/keys/blanc-repository.asc` (public half) is committed.
- Nothing public: no release, link or copy about a Linux build (spec §6).

## Review Focus

1. **A desktop that puts buttons on the left, or only Close.** The Island must leave room on the
   correct side and never draw under a button: Task 3's layout test covers `close,minimize,maximize:`,
   `:minimize,maximize,close`, `close:maximize` and `:close`.
2. **Upgrading over an L0-era tarball or a later preview package.** A second install of a newer
   `blanc-prototype` must keep `~/.config/blanc-prototype` and the keyring entry: Task 7's install check
   installs, writes a saved password, upgrades to the same version rebuilt (`dpkg -i` and `rpm -U
   --replacepkgs`), and reads it back.
3. **No keyring daemon** (a minimal Debian container): the browser must start and fall back as
   Chromium does (basic store), not hang: Task 7's Debian leg runs with no Secret Service on D-Bus and
   asserts launch within the smoke's timeout.
4. **A system that already has Google Chrome's or Chromium's repository configured.** Blanc's cron
   must not edit or remove those files: Task 7 seeds `/etc/apt/sources.list.d/google-chrome.list` and
   `/etc/yum.repos.d/google-chrome.repo` before install and compares their bytes after install and
   uninstall.
5. **HiDPI.** At 200% scale the buttons and the Island's reserved width stay in step: Task 3's frame
   check runs at `--force-device-scale-factor=2` too.

---

### Task 1: The repository key and its rotation plan (owner step first)

**Files:**
- Create: `chromium/linux/owner/make-repository-key.command`, `chromium/linux/repository.md`,
  `chromium/linux/keys/blanc-repository.asc` (after the owner runs the script),
  `chromium/tools/linux-repository-key.test.mjs`

**Interfaces:**
- Produces: `chromium/linux/keys/blanc-repository.asc` (ASCII-armored public key) and its 40-hex
  fingerprint recorded in `chromium/linux/repository.md` as `Fingerprint: <hex>`; later tasks read the
  fingerprint from that line.

- [ ] **Step 1: Write the failing test** `linux-repository-key.test.mjs`: the armored file parses (run
  `gpg --show-keys --with-colons` on it when `gpg` exists, else skip with a reason), has exactly one
  primary key, algorithm RSA (`1`) of 4096 bits, usage `s` only, expiry `2028-11-21`, user id
  `Blanc Linux Repository <support@blanc.day>`, no secret material (`-----BEGIN PGP PRIVATE` absent),
  and its fingerprint equals the one in `repository.md`.
- [ ] **Step 2: Run it** with `node --test chromium/tools/linux-repository-key.test.mjs`; expected FAIL
  (no key file).
- [ ] **Step 3: Write `make-repository-key.command`** on the model of
  `chromium/windows/owner/` scripts: a temporary `GNUPGHOME` (`mktemp -d`, mode 700, removed on exit),
  `gpg --batch --quick-generate-key 'Blanc Linux Repository <support@blanc.day>' rsa4096 sign 2028-11-21`
  with a passphrase the owner types, export the secret key armored straight into
  `op document create --vault Dev --title 'Blanc Linux Repository Signing'` (no file on disk), store the
  passphrase in the same item's `password` field by hidden input, and write only the public half to
  `chromium/linux/keys/blanc-repository.asc`. Refuses to run if the 1Password item already exists.
- [ ] **Step 4: Write `chromium/linux/repository.md`:** the decision-2 addresses and layout (apt
  `dists/stable/main/binary-{amd64,arm64}`, `pool/main/b/<package>/`; dnf
  `rpm/stable/{x86_64,aarch64}/` with `repodata/`), what is signed (apt `InRelease` and `Release.gpg`,
  dnf `repomd.xml.asc`, each `.rpm`), where signing runs (owner's Mac only, after approval), the
  fingerprint line, and the rotation plan: extend expiry a year ahead with the same key; on compromise,
  publish a new key through a final package signed by the old one whose cron installs the new keyring,
  and keep the old one trusted for 90 days.
- [ ] **Step 5: Owner runs** `chromium/linux/owner/make-repository-key.command` in Terminal (an approval
  point; Claude never runs it). Then fill the fingerprint into `repository.md`.
- [ ] **Step 6: Run the test**; expected PASS. Commit
  `Fork Linux: the repository key's public half and rotation plan (L1)`.

### Task 2: Identity in the browser (data folder, desktop name, window class, keyring)

**Files:**
- Modify: `chromium/blanc/config.gni` (new args below), `chromium/lanes/desktop.json`
- Create: patch `0112-blanc-linux-identity.patch` touching `chrome/common/chrome_paths_linux.cc`,
  `chrome/common/channel_info_posix.cc`,
  `components/os_crypt/async/browser/freedesktop_secret_key_provider.h` (import pristine copies first)
- Create: `chromium/linux/identity.md`, `chromium/tools/linux-identity.test.mjs`
- Modify: `chromium/blanc/services/sync_runner/shims/electron.js` (storage backend on Linux)

**Interfaces:**
- Produces in `config.gni`: `blanc_linux_package` (`"blanc-prototype"` preview, `"blanc-beta"` beta),
  `blanc_linux_menu_name` (`"Blanc Prototype"` / `"Blanc Beta"`), `blanc_linux_keyring_label`
  (`"Blanc Prototype"` / `"Blanc Beta"`), passed to C++ as buildflag strings
  `BLANC_LINUX_PACKAGE`, `BLANC_LINUX_KEYRING_LABEL` in the existing `blanc` buildflag header. Tasks 4
  and 7 read `blanc_linux_package`.

- [ ] **Step 1: Write the failing test** `linux-identity.test.mjs`: parses `identity.md`'s table (columns
  Name, Preview, Beta, Written by) and asserts (a) every preview and beta value differs from every value
  in a `FORBIDDEN` list — `chromium`, `chromium-browser`, `chromium-browser.desktop`, `google-chrome`,
  `Chromium Safe Storage`, `Chromium Keys`, `Chrome Safe Storage`, `Chrome Keys`, `chrome`, `Blanc`,
  `blanc`, `blanc.desktop`, `~/.config/Blanc`, `~/.config/chromium`, `/opt/chromium.org/chromium`,
  `/opt/google/chrome`; (b) the preview values equal `config.gni`'s preview args; (c) the patch's added
  lines use `BLANC_LINUX_PACKAGE` and are inside `#if BUILDFLAG(IS_LINUX)` blocks.
- [ ] **Step 2: Run it**; expected FAIL.
- [ ] **Step 3: Write the patch.** Under `BUILDFLAG(IS_LINUX)` only: the data folder basename is
  `BLANC_LINUX_PACKAGE` with no channel suffix; `GetDesktopName` returns `BLANC_LINUX_PACKAGE
  ".desktop"` (keeping the `$CHROME_DESKTOP` override); the three keyring constants become
  `BLANC_LINUX_PACKAGE`, `BLANC_LINUX_KEYRING_LABEL " Safe Storage"`,
  `BLANC_LINUX_KEYRING_LABEL " Keys"`. Read how X11 `WM_CLASS` and the Wayland `xdg_toplevel` app id are
  derived from the desktop name at the pin (`shell_integration_linux.cc`, `ui/ozone/platform/wayland`)
  and record the call path in `identity.md`; patch it only if they don't follow `GetDesktopName`.
- [ ] **Step 4: Sync shim:** `electron.js` reports `libsecret` (or `basic` when the provider fell back)
  on Linux instead of `android_keystore`; extend its existing test.
- [ ] **Step 5: Run** the test, the fork unit suite and `python3 chromium/tools/check-patches.py` for
  both lanes; expected PASS. Commit `Fork Linux: the preview's own names, data folder and keyring (L1)`.

### Task 3: Chromium's caption buttons over the strip

**Files:**
- Create: patch `0113-blanc-linux-frame.patch` (the Linux frame view and layout files, traced in Step 1)
- Create: `chromium/blanc/browser/ui/window_buttons_linux.{h,cc}`, added under `is_linux` where
  `tab_switch_keys_win.cc` is listed (`chromium/blanc/ui.gni:330`)
- Modify: `chromium/blanc/island/host.js`, `chromium/blanc/island/prototype.css`,
  `chromium/blanc/browser/ui/blanc_prototype_ui.cc` (drag band, `IsCaption`), the typed `Window`
  interface that declares `openMainMenu`
- Create: `chromium/tests/linux-frame.mjs`, `chromium/tests/lib/native-input-linux.mjs`,
  `chromium/tools/linux-window-buttons.test.mjs`

**Interfaces:**
- Produces: event `onWindowButtons(WindowButtonsLayout)` with `{leading: number, trailing: number}` in
  DIPs (0 when a side has none), sent on window creation, maximize/restore, scale change and a GTK
  settings change. The host sets `--window-controls-leading-w` and `--window-controls-w` from it.
- Produces: `native-input-linux.mjs` exports `click(x, y)`, `doubleClick(x, y)`,
  `drag(x1, y1, x2, y2)`, `windowGeometry(windowId)` (`xdotool`, X11 only).

- [ ] **Step 1: Trace and record** in `chromium/PLATFORMS.md`'s Linux section and the patch header:
  which frame view an Island window gets under X11 and under Wayland (with and without server-side
  decorations), where its caption buttons are laid out, how the client view's top inset is computed,
  and how `gtk-decoration-layout` reaches the layout. Patch 0095 is the model: the client view starts
  at the window's top, no title or icon is painted, the buttons stay on top. Stop and report if Wayland
  forces server-side decorations for this window.
- [ ] **Step 2: Write the failing unit test** `linux-window-buttons.test.mjs` for the host's handling:
  for each layout string in Review Focus 1, given the payload the native side would send for 32 px
  buttons at 1x and 2x, the host sets the two CSS variables to the sum of the button widths on that
  side, and `prototype.css` hides `#windowControls` on `linux`.
- [ ] **Step 3: Run it**; expected FAIL.
- [ ] **Step 4: Implement** the patch, `window_buttons_linux` (measures the frame's leading and
  trailing button bounds and sends the event), the host and CSS changes, and the Linux drag band and
  `IsCaption` exclusions so neither button area is a drag handle. Double-click on the strip maximizes
  through the frame's own handling; the Island's menu button opens Chromium's app menu (patch 0096,
  enabled for Linux).
- [ ] **Step 5: Run** the unit test, the fork suite and both lanes' patch checks; expected PASS.
- [ ] **Step 6: Write `linux-frame.mjs`** (runner, X11 under `xvfb-run` with a window manager that
  honors client-side decorations, `xfwm4` or `openbox`): for each of the four layouts, written to
  `~/.config/gtk-3.0/settings.ini` before launch, real clicks minimize, maximize, restore and close;
  dragging the strip moves the window; double-click maximizes; dragging the bottom-right corner
  resizes; the Island's pill rect never intersects a button rect; repeated at
  `--force-device-scale-factor=2`. Under Wayland (headless weston) it checks only that the buttons are
  drawn on the configured side and the pill doesn't overlap them (decision 4).
- [ ] **Step 7: Commit** `Fork Linux: Chromium's caption buttons over the Island strip (L1)`.

### Task 4: Packages from Chromium's installer, pointed at Blanc

**Files:**
- Create: patch `0114-blanc-linux-installer.patch` touching
  `chrome/installer/linux/common/installer.py`, `common/chromium-browser.info`,
  `debian/repo_signing_keys.gpg` (replaced by Blanc's public keyring, dearmored), the cron and
  AppArmor templates only if they name Google or Chromium paths
- Modify: `chromium/blanc/BUILD.gn` (copy the blocker engine beside the executable for Linux
  previews' packages), `chromium/blanc/services/blocker/blocker_proxy.cc` (Linux lookup)
- Modify: `chromium/tools/build.mjs` (`buildLane` Linux targets)
- Create: `chromium/linux/package-scan.mjs`, `chromium/tools/linux-package-scan.test.mjs`,
  `chromium/tools/linux-installer-config.test.mjs`

**Interfaces:**
- Consumes: Task 1's key; Task 2's `blanc_linux_package`.
- Produces: GN args `blanc_linux_channel` (`"prototype"` preview, `"beta"` beta) and
  `blanc_linux_repository` (`"https://pkg-staging.blanc.day"` preview,
  `"https://pkg.blanc.day"` beta). Build targets for a Linux output:
  `chrome`, `chrome_sandbox`, `//chrome/installer/linux:prototype` (the new `linux_package` the patch
  adds; `:beta` for the beta channel).
- Produces: `scanPackage(path) -> {ok: boolean, findings: string[]}` in `package-scan.mjs`, which
  unpacks a `.deb` (`dpkg-deb -R`) or `.rpm` (`rpm2cpio | cpio`) and reports any file, maintainer
  script or scriptlet that contains `dl.google.com`, `google.com/linux`, a Google key fingerprint from
  the pristine `repo_signing_keys.gpg`, `/opt/chromium.org`, `chromium-browser`, or a name in Task 2's
  `FORBIDDEN` list as a path component.

- [ ] **Step 1: Write the failing tests.** `linux-installer-config.test.mjs` runs the patched
  `installer.py` config step (its `from_args`) for channels `prototype` and `beta` with a fake output
  dir and asserts: package `blanc-prototype` / `blanc-beta`; install dir `/opt/bnfy/blanc-prototype` /
  `/opt/bnfy/blanc-beta`; menu name `Blanc Prototype` / `Blanc Beta` (no parenthesized channel);
  `StartupWMClass` equals the package; deb repoconfig
  `deb [arch=amd64] https://pkg-staging.blanc.day/deb stable main` (preview) and the `pkg.blanc.day`
  form (beta); rpm baseurl `…/rpm/stable/$basearch`; release-notes URL `https://blanc.day/whats-new`;
  maintainer and homepage from Global Constraints. `linux-package-scan.test.mjs` feeds `scanPackage`
  two small fixture packages built in the test (one clean, one with `dl.google.com` in a postinst) and
  asserts `ok` true and false with the finding named.
- [ ] **Step 2: Run them**; expected FAIL.
- [ ] **Step 3: Implement the patch and config.** `normalize_channel` accepts `prototype`; the repo
  address comes from GN (`blanc_linux_repository`, passed with a new `-r` argument) instead of
  `dl.google.com`; `chromium-browser.info` carries Blanc's values with `PACKAGE="blanc"` and
  `INSTALLDIR=/opt/bnfy/blanc`; the channel suffix rule yields the names above. Keep Chromium's
  AppArmor profile, naming the install path. The blocker engine is copied to
  `$root_out_dir/blanc_blocker/engine.js` for Linux outputs and listed in the installer's file list;
  `blocker_proxy.cc` looks beside the executable on Linux when `--blanc-blocker-assets` is absent,
  with the pinned-hash check unchanged.
- [ ] **Step 4: Run** the tests, the fork suite and both lanes' patch checks; expected PASS.
- [ ] **Step 5: Commit** `Fork Linux: .deb and .rpm from Chromium's installer, Blanc's repository and key (L1)`.

### Task 5: The arm64 output

**Files:**
- Create: `chromium/linux/args/prototype-arm64.gn` (as `prototype-x64.gn` with `target_cpu = "arm64"`)
- Modify: `chromium/tools/build.mjs` (`LINUX_OUTPUTS` gains `BlancLinuxArm64Prototype`; its environment
  records the arm64 sysroot hash too), `chromium/tools/build.test.mjs`,
  `chromium/linux/server/setup.sh` (`--out=` choice, `--install-arm64-sysroot`),
  `chromium/linux/server/README.md`

- [ ] **Step 1: Failing tests** in `build.test.mjs`: `outputName('BlancLinuxArm64Prototype')` is
  accepted; its lane is Linux with targets `chrome`, `chrome_sandbox`, `//chrome/installer/linux:prototype`;
  `linuxEnvironment` for it records both sysroot hashes and refuses when the arm64 sysroot marker is
  missing.
- [ ] **Step 2: Run**; expected FAIL. **Step 3: Implement.** `setup.sh --install-arm64-sysroot` runs
  `build/linux/sysroot_scripts/install-sysroot.py --arch=arm64` under the checkout lock, only with
  `--windows-release-idle`, and never runs gclient hooks. **Step 4: Run**; expected PASS. **Step 5:
  Commit** `Fork Linux: the arm64 output (L1)`.

### Task 6: Candidates carry both packages, for each architecture

**Files:**
- Modify: `chromium/linux/package-candidate.mjs`, `chromium/linux/candidate.mjs`,
  `chromium/linux/ship-candidate.sh`, `chromium/tools/linux-candidate.test.mjs`,
  `chromium/tools/progress.mjs`
- Create: `chromium/linux/owner/sign-rpm.command`

**Interfaces:**
- Produces: candidate id `linux-<x64|arm64>-<16 hex>`; tarball `blanc-linux-<arch>-candidate.tar.gz`
  holding `chrome/` (unpacked, as L0), `packages/blanc-prototype_<ver>-1_<deb_arch>.deb`,
  `packages/blanc-prototype-<ver>-1.<rpm_arch>.rpm`, and `candidate.json` gaining `arch`,
  `packages: [{file, sha256}]`. Draft release stays `fork-linux-candidate`; assets are named per arch so
  x64 and arm64 coexist.

- [ ] **Step 1: Failing tests** in `linux-candidate.test.mjs`: `candidateId(sha, 'arm64')` →
  `linux-arm64-<16>`; `ASSET_NAME('x64')` → `blanc-linux-x64-candidate.tar.gz`; `candidate.json` for a
  fixture lists both packages with SHA-256 and the arch; packaging refuses when `scanPackage` reports a
  finding. **Step 2: Run**; expected FAIL. **Step 3: Implement**, running `scanPackage` on both packages
  before the tarball is written. **Step 4: Run**; expected PASS.
- [ ] **Step 5: `sign-rpm.command`** (owner's Mac): downloads the candidate from the draft by SHA-256,
  imports the key from 1Password into a throwaway `GNUPGHOME`, runs `rpmsign --addsign` (Homebrew `rpm`
  and `gnupg`), checks `rpm -K` against `blanc-repository.asc`, uploads `…rpm` signed as
  `blanc-linux-<arch>-signed.rpm` plus its SHA-256 to the draft, and deletes the `GNUPGHOME`. First run
  is a spike: if `rpmsign` on macOS can't sign, stop and bring the owner the options; do not move the
  key anywhere else.
- [ ] **Step 6: Commit** `Fork Linux: candidates for x64 and arm64 with both packages (L1)`.

### Task 7: The install check on Ubuntu, Debian and Fedora

**Files:**
- Create: `chromium/tests/linux-install.mjs`, `chromium/tests/lib/linux-seed.mjs`
- Modify: `.github/workflows/chromium-linux-candidate.yml` (on `chromium/next`; the file is on `main`
  since L0, so the branch copy dispatches)

**Interfaces:**
- Consumes: Task 6's candidate and signed `.rpm`; L0's `linux-smoke.mjs` (pointed at the installed
  `/opt/bnfy/blanc-prototype/chrome` with no `--blanc-blocker-assets`).
- Produces: `install-<system>-<arch>.json` per leg: `{installed, launched, sandboxed, blocker,
  untouched: {appimageProfile, chromiumProfile, keyring, defaultBrowser, googleRepoFiles},
  defaultBrowserSet, upgradeKeptData, uninstalled, dataFolderKept, repositoryWritten}`.

- [ ] **Step 1: `linux-seed.mjs`:** before install, download shipping Blanc v1.51.0's AppImage from its
  public release, run it once headless to create `~/.config/Blanc`; seed `~/.config/chromium` with a
  profile; store a Secret Service item for `application=chromium` under `gnome-keyring-daemon` in a
  `dbus-run-session`; set `xdg-settings set default-web-browser chromium.desktop` with a stub desktop
  file; write Google's apt and yum repo files (Review Focus 4). Record a SHA-256 of each.
- [ ] **Step 2: `linux-install.mjs` legs:** Ubuntu 24.04 on the runner itself (restriction left at 1);
  Debian 12 and current Fedora in containers (`docker run` with the candidate mounted read-only; a
  container may take `--security-opt seccomp=unconfined` if Chromium's sandbox needs it, recorded in
  the JSON, never `--no-sandbox`). Each leg: install (`apt install ./x.deb` or `dnf install ./x.rpm`
  after `rpm --import blanc-repository.asc` and `rpm -K` passing); the smoke from the installed path
  as an ordinary user under `xvfb-run`; the repository file the cron writes names
  `pkg-staging.blanc.day` with Blanc's key and nothing else; seeded items unchanged; make it the
  default browser through Chromium's own path and read `xdg-settings get default-web-browser` back as
  `blanc-prototype.desktop`; upgrade-reinstall keeps a saved password (Review Focus 2); Debian runs
  with no Secret Service (Review Focus 3); uninstall (`apt remove`, `dnf remove`) removes
  `/opt/bnfy/blanc-prototype`, the launcher and desktop file, keeps `~/.config/blanc-prototype`, and
  the AppImage still launches.
- [ ] **Step 3: Workflow:** input `arch` (`x64`, `arm64`) selects `ubuntu-24.04` or
  `ubuntu-24.04-arm`; jobs `smoke` (L0's), `frame` (Task 3), `install` (matrix ubuntu, debian,
  fedora). Each verifies its asset's SHA-256 first; tokens stay in the download step only.
- [ ] **Step 4: Crash capture:** add a step that forces a browser crash under the test flag and records
  whether Crashpad wrote a dump under the data folder; correct spec §6 and `PLATFORMS.md` to what was
  observed.
- [ ] **Step 5: Commit** `Fork Linux: install check on Ubuntu, Debian and Fedora (L1)`.

### Task 8: Build, run, record

- [ ] **Step 1:** Merge `chromium/next`, push the L1 branch's commits to `chromium/next` after the fork
  suite and both patch checks pass (never during a hold on `main`-bound work the owner set).
- [ ] **Step 2: Server (x64):** `setup.sh --windows-release-idle`; guarded `--check` (expect only the
  patched files' dependents plus the installer targets; stop on a large plan); `--build`; package;
  ship; owner signs the `.rpm` (Task 6 Step 5); dispatch with `-f arch=x64 -f sha256=…`.
- [ ] **Step 3: Server (arm64):** `setup.sh --install-arm64-sysroot --windows-release-idle`; record the
  environment; the approved cold build into `BlancLinuxArm64Prototype` in tmux, logged to
  `~/blanc-evidence/linux/cold-build-arm64-1.log`; package; ship; sign; dispatch with `-f arch=arm64`.
- [ ] **Step 4: Mac Studio:** syntax-only compile of the shared C++ the patches touch, then one apply
  and GN regeneration with unchanged arguments, before the nightly and never while
  `records/RELEASE-IN-PROGRESS` exists.
- [ ] **Step 5: Owner's VM (arm64, Ubuntu 26.04, GNOME Wayland):** `chromium/linux/hand-checks-l1.md`
  lists what to check and records the answers: install the signed arm64 `.deb` with `apt install`, the
  dock shows one Sunrise icon and groups windows; buttons on GNOME's default side work by real clicks;
  drag, double-click and resize (decision 4's Wayland items); Settings → Default Apps lists Blanc
  Prototype and can select it; the keyring prompt names Blanc Prototype; uninstall leaves the data
  folder.
- [ ] **Step 6: Record:** `chromium/reports/l1-linux.json` (runs, candidates, gate items),
  `chromium/STATUS.md` Linux L1 table, `PLATFORMS.md` lines (frame, buttons, identity, installer,
  default browser, data folder, crash capture, arm64), and push.

## L1 gate (all must hold)

1. The frame check passes by real input on X11 with buttons left, right, split and Close only, at 1x
   and 2x; Wayland draws them on the configured side without overlap, and the owner's VM check passes
   the Wayland input items (decision 4).
2. The install check passes on Ubuntu 24.04 (restriction on), Debian 12 and current Fedora for x64 and
   arm64, with every `untouched` field true.
3. `scanPackage` finds nothing in any built package; the cron writes only Blanc's staging repository
   and key.
4. The `.rpm` verifies with `rpm -K` against `chromium/linux/keys/blanc-repository.asc`.
5. The Mac nightly and both Windows outputs are unaffected (plans compared; nightly passes).
6. The owner's first look at the arm64 build in the VM is recorded.

## Not in L1

The beta channel without test hooks, version stamping (`158.0.8127.<build>`), update notifications,
`pkg.blanc.day` and its staging host, release stages and any publishing (all L3); the S1 suite on
Linux, Ctrl+Tab by most recent use and quit behavior (L2); document icons and MIME types beyond what
Chromium's package declares.

## What needs the owner

- Approve decisions 1 to 4 (by approving this plan).
- Run `make-repository-key.command` (Task 1) and `sign-rpm.command` for each candidate (Task 6).
- The VM hand check (Task 8 Step 5).
