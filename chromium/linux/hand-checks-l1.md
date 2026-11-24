# L1 hand check: Blanc Prototype on the owner's Ubuntu VM

L1 gate item 6 and decision 4's Wayland items (docs/superpowers/plans/2026-11-21-linux-fork-l1.md,
Task 8 Step 5), run on November 22, 2026 in the owner's Parallels VM **Ubuntu 26.04 ARM64** (GNOME
on Wayland), at the owner's request by Claude rather than by hand.

**How it was driven.** Commands ran through `prlctl exec` (root, or the desktop user with its session
environment). Clicks, drags and keys were real kernel input: a small uinput device (`vin.py`, an
absolute pointer and keyboard) that GNOME treats as hardware, so Wayland's own input path was
exercised. Screens were read from a read-only macOS capture of the Parallels window, because
`prlctl capture` returned stale or partly black frames once the window was on screen. The owner's
Mac mouse and keyboard were never used.

**Build.** Candidate 5, `linux-arm64-7f8c53cb7cb20dff`, tarball SHA-256 `b05c2194…630d57`.
**Package.** `blanc-prototype_158.0.8127.2-1_arm64.deb`, SHA-256
`1cc021cdaf0bd581deff2f1d76d993a01db347e8ad7a3cd0e4c5f833f0566492`, the hash named in
`signed-candidate-arm64.json`, whose detached signature verified against
`chromium/linux/keys/blanc-repository.asc` (fingerprint 50D3 6197 4F47 7C8C 87E1 17BD 95AE 97AB CACF EE6C).

## Results

| # | Check | Result |
|---|---|---|
| 1 | Default browser before install | No explicit default anywhere (no `mimeapps.list` entry, no `defaults.list` entry); `x-www-browser` is Firefox (snap). |
| 2 | Package hash in the VM | `1cc021cd…0566492`, equal to the signed record. |
| 3 | `apt install` of the `.deb` | Installed; added only `/etc/apt/sources.list.d/blanc-prototype.list` (staging, `signed-by` its own keyring), the keyring, `/etc/default/blanc-prototype` and the daily cron job. |
| 4 | Dock | One Sunrise icon; its tooltip reads **Blanc Prototype**; a second window groups under it (two dots). Pass. |
| 5–9 | Buttons, drag, double-click, corner resize, menu | Pass in all four layouts at 100%: GNOME's `appmenu:close` (menu left, Close right), left (`close,minimize,maximize:`), split (`close:minimize,maximize`) and Close only (`:close`). Every button worked by click (Minimize, then the dock icon brings the window back; Maximize ↔ Restore; Close quits). The strip drags the window by the pointer's exact offset; double-click maximizes and restores; top-left and bottom-right corners resize; the menu opens at its button. |
| 10 | The same at 200% | Pass. GNOME at 2560×1600, scale 2 (`gdctl`; Parallels' resolution agent paused for the duration). Default and left layouts fully; split and Close only for buttons, maximize/restore and Close. In a small window the buttons and the Island sit side by side without overlap (the address text shortens). |
| 11 | "Use system title bar and borders" | **Not offered on GNOME Wayland**: absent from the strip's context menu and from Settings (search "title" finds only "Vertical tab text size"). Chromium shows it only when the compositor supports server-side decorations (`xdg-decoration`), which GNOME's does not; see `chromium/PLATFORMS.md`. The plan's expectation applies to X11 desktops, not this one. |
| 12 | Settings → Apps → Default Apps | Blanc Prototype is listed under Apps and under **Web**, where it shows as the current choice. Firefox is not offered there at all (the snap doesn't register for it), so with no default ever chosen GNOME falls back to the only registered browser. Nothing was written to the user's settings. Blanc Prototype appears **twice** in the Web list: the package's hidden `me.bnfy.Blanc.prototype.desktop` (`NoDisplay=true`) also declares the web types. That file is upstream Chromium's (`chrome/installer/linux/common/installer.py`, the app-ID entry the XDG desktop portals require, which Google Chrome's package ships too), so it is kept as is. |
| 13 | Keyring prompt | None appeared. The login keyring was unlocked and Blanc stored its key through the desktop's Secret portal (`os_crypt.portal.prev_init_success: true` in `Local State`). |
| 14 | Restore | Button layout back to `appmenu:close`; display back to scale 1 at the window's size; Parallels' agent resumed. No default-browser setting was changed, so none needed restoring. |
| 15 | Uninstall | `apt remove` removed the program and the cron job and kept `~/.config/blanc-prototype`; the source list, keyring and `/etc/default` file stay until a purge, as with Chrome's package. Then `apt purge` removed them too (left `/opt` itself). Shipping Electron Blanc's `~/.config/Blanc` untouched; `x-www-browser` still Firefox. |

Also seen: blocking works (the shield counted 25 requests on a DuckDuckGo results page), and a
`chrome://settings/…` address typed into the Island goes to search rather than opening the page
(`/settings` opens Settings in the sheet).

## Follow-ups

- The double Default Apps entry is upstream's app-ID desktop file; dropping its `MimeType` would
  diverge from Chromium in a file the Secret portal relies on. Revisit only if a user reports it.
- Record in `chromium/PLATFORMS.md` that the system title bar option is X11-only on GNOME.

## Not covered

A physical Linux machine, X11 desktops other than the hosted runners', KDE and other compositors,
fractional scaling, and the keyring prompt on a desktop whose keyring starts locked.

Checked by: Claude, at the owner's request, in the owner's VM. Evidence (captures) kept with the
session's records.
