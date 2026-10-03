# Linux sandbox refusal dialog merge confirmation and waiver — October 3, 2026

This records the merge gate for [PR #494](https://github.com/bnfy/blanc/pull/494), which replaces the plain-text setup link in the Linux sandbox refusal dialog with buttons. It is not a public release record.

Owner-assisted physical check at code commit `e8058f6bff60711cbbddf6b92c3a38009de0b243`, in Parallels Desktop on the owner's Mac:

- The guest was Ubuntu 26.04 LTS on aarch64, GNOME on Wayland, with `kernel.apparmor_restrict_unprivileged_userns=1`, left unchanged. The AppImage was built in the guest from the exact commit with `npx electron-builder --linux AppImage --arm64 --publish never`. Its SHA-256, `2184fb09038d9b3b588e84864ece10a8f58f98a25ba4c91ae57dc1c432c15cdf`, was verified before and after testing.
- A plain launch was refused because of the AppArmor restriction. The dialog showed exactly **Open Setup Guide** and **Quit**, with the correct URL.
- **Open Setup Guide** opened the guide in Firefox, and Blanc exited 1.
- A launch with the guide URL as an argument showed only **Quit**, with the address to open in another browser. It exited 1 and opened nothing.
- Escape closed the dialog, and Blanc exited 1.
- An earlier run at `3494f441` found that Copy Link silently failed on Wayland. `e8058f6b` removes Copy Link on Wayland.

Automated evidence at the same commit:

- Private native validation run [37129372404](https://github.com/bnfy/blanc/actions/runs/37129372404) passed: the Linux packaged checks, direct launch and relaunch, and the hosted Ubuntu 22.04 and 24.04 refusal, namespace and seccomp evidence.
- All required PR checks passed.
- From source on Xvfb with official Electron: the X11 dialog's three buttons, Copy Link filling the clipboard, and each path with Wayland session variables set.

**Unperformed evidence and risk:** three checks were not performed.

- **A physical X11 desktop:** the three-button dialog and Copy Link were checked only on Xvfb.
- **The shipped x86_64 AppImage on real hardware:** the physical check used an arm64 build of the same commit.
- **Stock Ubuntu 24.04:** the Ubuntu 26.04 guest has the same AppArmor restriction enabled, but 24.04 itself wasn't tested.

Differences there could affect only the refusal dialog. At worst a button misbehaves, while the dialog still shows the setup URL and Blanc still prints it to standard error. These checks remain unverified, not passed.

After that missing evidence and risk were stated, the owner answered **“Confirm, waive the gaps”** to the explicit question asking whether they confirm PR #494 for merge. That option was described as confirming the arm64 Wayland pass and waiving the three uncovered checks for merge only.

This written approval confirms the arm64 Wayland check and waives the three uncovered checks solely for merging PR #494 after the required checks pass. It does not waive physical verification for release, updater handoffs, tagging, or any other public release gate, and it does not authorize publishing a release.
