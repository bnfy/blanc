# L3 hand check: Blanc Beta updating from the staging repository in the owner's Ubuntu VM

L3 Task 8 Step 2 (docs/superpowers/plans/2026-11-21-linux-fork-l3.md), the `hand-check` stage of
release `chromium-beta-linux-158.0.8127.906`. Run on November 22, 2026 (22:12–22:30 US Eastern)
in the owner's Parallels VM **Ubuntu 26.04 ARM64** (GNOME on Wayland) by Claude, at the owner's
request, the same way as `hand-checks-l1.md` and `hand-checks-l2.md`: commands through `prlctl
exec`, clicks and keys as real kernel input from a uinput device, screens read from a read-only
macOS capture of the Parallels window. The owner's Mac mouse and keyboard were never used.
Parallels Tools asked for an administrator password to update itself; it was cancelled, not
answered, and its agent was paused for the check and resumed afterwards.

**Builds.** `B-1` is 158.0.8127.905 (proof only), `B` is 158.0.8127.906, both from source
`a52e29005d6237c405ddcc2afd3b0f216c8b390b`. The `B-1` package `blanc-beta_158.0.8127.905-1_arm64.deb`
had SHA-256 `d1ca2ea95c2fae7abdcfc7477618fc8bdf15d218561fa066c94b1eb1c2668c5f` inside the VM, the
hash in the owner-signed `approved-packages.json`, whose signature verified there against
`chromium/linux/keys/blanc-repository.asc` (fingerprint 50D3 6197 4F47 7C8C 87E1 17BD 95AE 97AB CACF EE6C).
**Staging** was generation 906, digest `32459e866305910dad7bac5881b458580e4841f8b8a4c247477c166de25fce93`,
before and after the check.

## Results

| # | Check | Result |
|---|---|---|
| 1 | Install `B-1` from its verified `.deb` | Pass. `apt-get install` added `/etc/apt/sources.list.d/blanc-beta.list` (`https://pkg.blanc.day/deb stable main`, `signed-by=/usr/share/keyrings/blanc-beta.gpg`) and the daily cron job; `blanc-beta --product-version` read 158.0.8127.905. |
| 2 | Production source off, staging's on | The production list was set aside and `deb [arch=arm64 signed-by=/usr/share/keyrings/blanc-beta.gpg] https://pkg-staging.blanc.day/deb stable main` added. `apt-get update` verified staging's `InRelease` with the package's own keyring; `apt-cache policy blanc-beta` showed 906-1 as the candidate from staging. |
| 3 | The desktop offers `B` | **Partial: see below.** Ubuntu 26.04 does not install Software Updater (`update-manager`), so the plan's check cannot apply as written. PackageKit, which the desktop's update tools read, lists `blanc-beta;158.0.8127.906-1;arm64;blanc-stable-main` among its 186 updates. App Center's Manage page listed 13 updates and **not** Blanc Beta: it shows only updates it can match to an app, and it matches by package name from the AppStream catalog (DEP-11) that a repository publishes. Blanc's repository publishes none, and the `blanc-beta.appdata.xml` the package installs names no package. With a local DEP-11 entry naming `Package: blanc-beta` (experiment only, removed afterwards), App Center listed **Blanc Beta 158.0.8127.905-1 → 158.0.8127.906-1** with an Update button. `apt` (`sudo apt upgrade`) offers and installs it. |
| 4 | Restart to update | Pass. With 905 running (launched with `--check-for-update-interval=10`, as the hosted proof does, because Chromium polls the installed version every 2 hours by default), `apt-get install --only-upgrade blanc-beta` installed 906 from staging. About 40 seconds later the Island showed **Restart to update** beside the address. A real click relaunched Blanc: new browser process (pid 1124442 → 1134328, `/opt/bnfy/blanc-beta/chrome`, installed version 158.0.8127.906), both restored tabs back, no update button. |
| 5 | Dock icon | Pass. One Sunrise icon, before and after the relaunch. |
| 6 | Keyring prompt | Pass. None appeared; the key is stored through the desktop's Secret portal (`os_crypt.portal.prev_init_success: true`). |
| 7 | Default browser | As in L1. `gio mime x-scheme-handler/https` names `blanc-beta.desktop` because it is the only registered browser (Firefox's snap registers none); nothing was written to `~/.config/mimeapps.list`. |
| 8 | Screen sharing | Pass, as in L2. A local page called `getDisplayMedia` on a click; Blanc's picker offered Blanc Tab, Window and Entire Screen; Window handed over to GNOME's Share Screen portal, which listed "Share check - Blanc" with the Sunrise icon; Share gave the page a live `window` track; the Island showed its red screen-sharing chip and GNOME its indicator; Stop sharing ended the track and cleared both. |
| 9 | Restore | Staging's list removed and the production list put back; `apt-get purge blanc-beta` removed the program, its source list and cron job; the test profile was deleted; Parallels' agent resumed. |

## App Center and DEP-11

Ubuntu's own packages get their catalog entries from DEP-11 files the archive publishes beside the
package lists (`main/dep11/Components-<arch>.yml.gz`, fetched by apt into `/var/lib/swcatalog/yaml`).
For App Center to list Blanc's updates on Ubuntu 26.04, the repository must publish one for
`blanc-beta` and sign it in `Release`. This is a repository change only: no package changes, and once
it is published App Center shows the next update to every existing install. It does not affect this
first release, which nobody updates to. Until then the Download page's update wording must not
promise that the desktop lists Blanc's updates on Ubuntu 26.04.

Screens: `chromium/reports/l3-hand-check/` (App Center without and with the DEP-11 entry, Restart
to update, after the relaunch, screen sharing live).
