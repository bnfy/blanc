# Blanc Beta for Windows: hand checks before the first release (W3 Task E1)

These run on the owner's Windows 11 VM (Parallels; Windows on Arm, which runs
the x64 beta under emulation, so say so in the record). They are the checks a
runner can't do: what a person sees, Windows' own settings, Windows Hello, and
a real update arriving. Results go in `chromium/STATUS.md`'s Windows section.

Setup (Claude does this first):

- The signed, tagged online installer `Blanc-Beta-Setup.exe` from the .902
  signing run is in the Mac's `~/Downloads`, which is the VM's Downloads
  folder too.
- blanc.day's update server offers 158.0.8127.901 (the package signed on
  November 19). That build is older than the welcome-page fix, so its first
  launch may still open Chromium's welcome page; check 7 covers the fix.

| # | Check | What should happen |
|---|-------|--------------------|
| 1 | Run `Blanc-Beta-Setup.exe` from Downloads | Windows names the publisher **Bananify Creative**. The installer window is Blanc's (Sunrise colors, the Blanc logo, "Blanc Beta"), not Chromium's. It finishes on its own and Blanc Beta opens. |
| 2 | Start menu and taskbar | **Blanc Beta** with the Sunrise icon, beside Electron Blanc, which still opens as before. |
| 3 | Snap Layouts | Hovering the maximize button shows the layouts; picking one snaps the window. |
| 4 | Settings → Apps → Default apps | **Blanc Beta** is listed. Making it the default works, and a link clicked in another app (for example a "Learn more" link in Windows Settings) opens in Blanc Beta. Set Electron Blanc back afterward if you like. |
| 5 | A passkey on webauthn.io | Register and sign in go through **Windows Hello**, in a normal window and in a private window (Ctrl+Shift+N). |
| 6 | An update arriving | Tell Claude "ready for the update"; Claude switches blanc.day to 158.0.8127.902. Open **About Blanc Beta** (menu → Help, or `chrome://settings/help`): it finds the update, downloads it and offers **Relaunch**. After relaunch About shows 158.0.8127.902. |
| 7 | A brand-new Windows user | Add a local user (Settings → Accounts → Other users), sign in as them, run the copy of `Blanc-Beta-Setup.exe` Claude put in `C:\Users\Public\Downloads`. It installs 158.0.8127.902, and the first launch shows Blanc's Start Page, **not** Chromium's welcome page. |
| 8 | Uninstall (as the new user) | Settings → Apps → Installed apps → Blanc Beta → Uninstall. It leaves the Start menu, and Electron Blanc is untouched. |

For each, a pass or fail is enough; a screenshot (Win+Shift+S) helps for a
fail. Claude reads versions and logs in the VM itself (read-only) and resets
blanc.day to offer nothing afterward.

## Results, 2026-11-21

Checks 1 (install, by script rather than by eye), 2 (Start menu entry), 6
(update arriving), 7's welcome-page half (on a fresh profile in the same user)
and 8 (uninstall) passed, scripted inside the MacBook Pro's VM; details in
`chromium/STATUS.md`'s W3 section. Still for the owner at the VM: the installer
window by eye, Snap Layouts (3), Default apps (4), the Windows Hello passkey (5)
and a brand-new Windows user (7). blanc.day must offer a build while the
installer runs, so tell Claude before starting.
