# F45 Arc Spaces import: real-sidebar evidence (October 12–13, 2026)

This is the evidence for F45's release gate in
`docs/superpowers/specs/2026-10-11-arc-spaces-import-design.md`: before any
public claim, a **real** Arc sidebar must be imported on a Mac, on Windows,
and through Linux's Choose file…. The runs followed
`docs/testing/arc-import-mac.md`, `arc-import-windows.md` and
`arc-import-linux.md` as merged by #734, #736, #744, #745 and #754. The
release that first ships F45 must link this file from its release record.

**Result:** every step passed on all three platforms. No parser finding.
Deviations and coverage limits are listed below. All values are counts,
true/false results, hashes and Blanc's own fixed UI text. No URL, tab title,
folder name or Space name is recorded. "Space 1" is the name Blanc gives an
untitled Space.

## Summary

| Step | macOS | Windows | Linux (Choose file…) |
|------|-------|---------|----------------------|
| 1 Count in Arc / file in place, hash | done | done | done |
| 2 Real file parses | pass | pass | pass |
| 3 Detection | pass | pass | pass |
| 4 Preview | pass | pass | pass |
| 5 Windows (no Patron) | pass (addendum) | pass | pass |
| 6 Spaces (Patron) | pass (second attempt) | pass | pass |
| 7 Favorites | pass | pass, deviation | pass, deviation |
| 8 Choose file… / wrong files | pass | pass | pass |
| 9 Close and reopen | pass | pass | pass |
| 10 Arc's file unchanged | pass | pass | pass |
| 11 Arc saving while Blanc reads | pass | pass | n/a (no Arc on Linux) |

## Environments and runs

| | macOS | Windows | Linux |
|---|---|---|---|
| System | macOS 27.2 (26B5101f), Apple M5 | Windows 11 Pro Insider Preview 25H2 (26220.9587), Arm64, Parallels VM | Ubuntu 26.04 LTS, aarch64, GNOME Shell 50.1, Wayland, Parallels VM |
| Arc | 1.168.0 (88413) | 1.127.0.297 (Arm64) | none; files copied from the Mac (steps 1–10) and from Windows (step 6) |
| Blanc | dev build at `dc2708cf` (steps 1–11, step 5 addendum), `bffab9fc` (step 6) | dev build at `0814f8f0` | dev build at `c55609e7` |
| Electron | 44.5.1 | 44.5.1, native Arm64 | 44.5.1, native arm64 |
| Driven by | Codex: computer use, plus native input the owner approved (AppleScript, CGEvent). Step 5 addendum: Claude Code computer use | Codex: PowerShell mouse and keyboard input inside the VM, which the owner approved; screens read with computer use | Claude Code: computer use through the Parallels window (steps 1–10). Codex: computer use, native Mac input and XTest input in the guest (step 6) |
| Sidebar | the owner's real sidebar, synced from their Arc account | built in Arc for Windows for this test | the Mac's real sidebar; the Windows test sidebar for step 6 |

Every step ran through Blanc's real interface, using the native file dialogs.
No Playwright, `BLANC_TEST`, test hook or stand-in dialog was used. The plans
allow an agent to drive the real interface (#744, #745). Read-only,
counts-only checks of the dev profile's saved state supplemented some
on-screen checks; none read the Patron key.

**Arc package folder on Windows:** `TheBrowserCompany.Arc_ttt1ap7aakyb4`,
exactly one match. This closed the spec's open question (#746).

## macOS

- **Step 2:** spaces=2, tabs=[68, 4], folders=[2, 2], favorites=4, skipped=6
  (2 Arc welcome pages, 1 Easel, 2 `javascript:` bookmarklets, 1 `chrome:`
  link), custom profiles=1. Counts matched Arc. The smaller Space was a
  temporary one with its own Arc profile, deleted afterwards. An independent
  structure walk of the same file agreed and reached every item.
- **Step 4:** the counts matched, the separate-profile note and "6 items
  can't come across" line appeared, and the untitled Space was named
  Space 1.
- **Step 5:**
  - 2 windows opened: tabs=[68, 4], groups=[2, 2], pinned=[3, 1], group
    sizes=[[58, 6], [1, 1]].
  - Only the selected tab loaded.
  - "The window you started in is unchanged" was proven by an addendum
    (2026-10-12 23:25 EDT), after stray input had navigated the original
    window: 2 tabs, 0 groups, 0 pinned before and after.
- **Step 6** (sandbox Patron key; the first attempt stopped because Patron
  wasn't yet active):
  - 2 spaces were created, no window switched, and the starting window was
    unchanged.
  - The opened space had 68 tabs, 3 pinned first, groups of 58 and 6, and
    the Today tab last.
  - Re-importing added the " (Arc)" suffix.
  - Arc's file had the same hash before and after.
- **Step 7:**
  - A Favorite from the temporary profile was hearted by hand.
  - A Favorites-only import added 3 and skipped the duplicate (total 4
    unique).
  - The hand-added one stayed ungrouped.
- **Step 8:** the copied file previewed identically; a non-Arc JSON file was
  rejected.
- **Step 10:** step 1 and step 10 hash
  `1f4e700a834af66a91f667f56fd826768d91836e8dc4143d086df323e8857358`.
- **Step 11:** 5 reads over 146 s, all complete previews. "Arc was saving"
  never appeared, the file's hash changed 7 times, and the edits survived an
  Arc restart.

## Windows

- **Step 1:** spaces=2, tabs=[15, 2], top-level folders=[1, 0], nested
  folders=1, split views=2, favorites=2.
- **Step 2:** the same counts, with skipped=0 and custom profiles=1.
- **Steps 3 and 4:** the Arc row offered both actions, and the preview
  matched, with the untitled name and the separate-profile note.
- **Step 5:**
  - 2 windows opened; the larger had pinned=4 and 1 group of 9, followed by
    2 Today tabs.
  - Only the selected tab loaded in each, and the original window was
    unchanged.
- **Step 6:**
  - 2 spaces were created, no window switched, and the starting window was
    unchanged.
  - The mapping matched step 2, and re-importing added " (Arc)".
  - The hash was the same before and after.
- **Step 7:** the deviation is below.
- **Step 8:**
  - The dialog title was "Choose Arc's StorableSidebar.json" and the filter
    "Arc sidebar file".
  - The copy previewed identically, and a non-Arc JSON file was rejected.
- **Step 10:** step 1 and step 10 hash
  `53F2AA926EA8395754610EEBE50189A5373DCBE8D7EE85A05912268E78DDFC0F`.
- **Step 11:**
  - 5 reads over 312 s, all complete previews, with no "Arc was saving"
    message and 6 distinct file states.
  - Arc showed no save error or file-in-use error.
  - The edits survived a restart.

## Linux

- **Step 1:** a Mac copy, moved through the local Parallels share and deleted
  from it straight away. Its hash at copy time was
  `3fcdafbf9ba262ec18032813ac6e22eccc52e27e0774679b4d94a963661f9994`.
- **Step 2:** spaces=1, tabs=68, folders=2, favorites=3, skipped=6. Same as
  the Mac.
- **Step 3:** the Arc row read exactly "Arc never came to Linux. Copy
  StorableSidebar.json from your Mac or PC, then choose it here." and offered
  only Choose file….
- **Step 4:**
  - The GNOME file chooser appeared through the desktop portal, with the
    filter "Arc sidebar file"; GNOME truncates the title to "Choose
    Arc's…".
  - Cancelling left the sheet as it was, and the preview matched.
- **Step 5:**
  - 1 window opened: 68 tabs in Arc's order, 3 pinned first, 2 lowercase
    groups of 58 and 6, Today last.
  - 9 renderer processes in total, so only the selected tab loaded.
  - The starting window was unchanged.
- **Step 6** (the Windows file with 2 Spaces, hash
  `6831146bccd6669b6506a57fea36c467283720031f42649c92271b18abf5480f`, the
  same in both VMs):
  - 2 spaces were created, and the starting window was unchanged.
  - The mapping matched, and re-importing added " (Arc)".
  - The hash was the same before and after.
- **Step 8:**
  - A non-Arc JSON file showed "That file isn't an Arc sidebar. Look for
    StorableSidebar.json."
  - An unreadable copy showed "Blanc couldn't open that file. Check its
    permissions and try again."
- **Step 10:** the hash matched step 1, then the copy was deleted.

## Deviations

- **Step 7 on Windows and Linux:**
  - Arc's Favorites there redirect, so a Favorite hearted by hand saves a
    different address and can't be the duplicate.
  - Both runs used another starting Favorite instead: move one imported
    Favorite out of the Arc folder, then import Favorites only again. Both
    added 0 and kept the moved Favorite in place.
  - On Linux, a missed click had already imported the Favorites during
    step 5.
  - The Windows run record marked step 7 "partial". It is counted here as a
    pass with a deviation: duplicates are matched by address however a
    Favorite was saved, so the alternate start tests the same thing.
  - The Mac ran step 7 as written.
- **Arc Favorites are per Arc profile** on macOS and Windows, not "the same
  for every Space" as the plans first said. The plans were corrected (#754).
  Blanc imports every row into one folder without duplicates, as the spec
  decided for v1.
- **Plan defects found and fixed while running:**
  - the start-to-end hash check couldn't pass while Arc was open (#734,
    #736);
  - step 11 now asks for about 2 minutes of edits (#734).
- **Linux setup:** `npm ci` reset Electron's `chrome-sandbox` helper. It was
  restored to root:root 4755, and the sandbox was never disabled.
- **Input problems:**
  - Several clicks and keystrokes missed or repeated in the VMs and the Mac
    dev build; they were redone.
  - On Windows, leftover background Arc processes were force-stopped to get
    a zero-process hash check, and Arc's sidebar checked out afterwards.
- **Privacy in agent transcripts:** some on-screen inspection in the Codex
  runs showed tab or Space labels. None appear in this evidence, and no
  screenshots of a sidebar were kept. Check those transcripts before keeping
  or sharing them.

## Not covered by these runs

- Intel Macs and Windows on x64 (the Windows run was Arm64), and Linux
  desktops other than GNOME on Wayland.
- An Arc Space with no tabs (the "can't be selected" state), and the 25-space
  room limit.
- Notes and Easels on Windows: Arc for Windows offered no way to create one.
  On the Mac, an Easel was correctly counted as skipped.
- Selecting more than one Space on Linux without Patron (the Linux file for
  steps 1–10 had one Space).

## Smaller findings (not gate failures)

- A Favorites-only import that adds nothing ends on "Arc import finished"
  with no line saying nothing new was added.
- Favorites are deduplicated by exact address, so a site saved by hand after
  a redirect is not matched to Arc's pre-redirect address.

## Still needed before this evidence is final

- The owner confirms approving the native input methods the agents used
  (AppleScript and CGEvent on the Mac; PowerShell input and the XTest input
  inside the VMs).

Original per-platform run records: kept by the owner outside the repository.
They contain the same counts in more detail.
