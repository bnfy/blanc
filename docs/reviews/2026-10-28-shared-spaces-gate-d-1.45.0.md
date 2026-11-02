# Shared Spaces Gate D: 1.45.0 candidate device validation (2026-10-28)

**Status: FAIL. Do not merge, tag or release on this evidence.** The #1204 fix holds on Windows, but this run found a new data-loss bug (B1 below). Quitting Blanc while a Shared Space window is holding back a change from another device makes that device delete tabs nobody closed, and the deletion reaches every device. Linux was not run. No owner platform confirmation is requested from this record.

All times are EDT on October 28, 2026.

## Candidate

| Platform | Artifact | Identity |
|---|---|---|
| Source | `5067ef9f5827524204d1ffce44af431fd0bc767c` (PR #1244 head), `version` 1.45.0 | Read-only worktree `/private/tmp/blanc-pairing-145` |
| Mac (Apple Silicon) | `dist/mac-arm64/Blanc.app` from that worktree, 1.45.0, build 1450 | Signed, TeamIdentifier `XYGUCY4498`. Unnotarized local build. `app.asar` SHA-256 `e81aaef38707b9c7fb9cd747ec3dcd16f07b5aa3a8c74a27ca019365a4baf077` |
| Windows (x64 on Windows 11 ARM64, Parallels) | Validation run [40770686160](https://github.com/bnfy/blanc/actions/runs/40770686160), head `5067ef9f5827524204d1ffce44af431fd0bc767c`, concluded success | `Blanc-Setup-1.45.0.exe` SHA-256 `4f2d7c1807b99ba7a434b0c78b952dabf8d163e8904f162d4818351c91c7eee8`. `windows-signature.json` reports Valid, publisher `CN=Bananify Creative`, thumbprint `0655C946D19972F2EC98380CAAB565A2AED28DFC`, Microsoft timestamp. Unpacked `app.asar` SHA-256 `edee2379f4c796061fe88ffdd073af1f2a0320141b0ef8ac603fc1808fe47587` |
| Linux (ARM64) | `dist/Blanc-1.45.0-arm64.AppImage`, built locally from the same worktree | SHA-256 `c1aab19fe33ea86230a87c2d25c2b3f72b0cc332a0cd8b78bd657bcb7c188fa9`. `app.asar` is identical to the Mac one. **Not installed or run** |

How each candidate was run and isolated:

- **Mac.** Ran with `--user-data-dir=/private/tmp/blanc-gated-mac-profile --remote-debugging-port=9333`. The owner's `/Applications/Blanc.app` and its profile were never opened or touched. From 17:57 on, the Mac candidate ran from a byte-identical copy at `/private/tmp/blanc-gated-mac-app/Blanc.app`, made with `ditto`. That copy passes `codesign --verify --deep --strict`, has the same `app.asar` hash, and `diff -rq` against the original reports no differences. The copy kept this run apart from another session's copy of the same build (see Interference).
- **Windows.** The NSIS installer was unpacked with `bsdtar` and run as a VM-local copy from `%LOCALAPPDATA%\BlancGateD145`, with its own `--user-data-dir`. The VM's normal Blanc install was already running before the test and was left alone. The copy was removed afterwards and the VM was suspended again, as found.
- **Linux.** The Ubuntu VM was never resumed.

**Sync account.** A fresh, disposable account was created with **Turn on Sync** (passphrase-free) on the Mac candidate, against the production `blanc-sync` Worker. Windows joined through **Add device**, then **Add this device with a code**. No codes, recovery codes, keys or account locators were recorded.

**How the test was driven.** Through each candidate's own renderer bridges over the Chrome DevTools Protocol (CDP):

- the chrome strip's `window.browserAPI` for tabs, groups, pins and Spaces;
- clicks on the real Settings controls in the Settings sheet;
- real keyboard input in the Windows VM (user32 `keybd_event`) to open Settings and the ⌘L panel.

The same IPC channels as the UI are exercised. Pointer input was not used.

## Results

| # | Check | Mac → Windows | Windows → Mac | Linux |
|---|---|---|---|---|
| 1 | Chosen Spaces join | **PASS** | n/a (Windows had no local Space) | NOT RUN |
| 2 | #1204 retest: arrived shared tabs open their pages | **PASS** (Windows) | — | NOT RUN |
| 3 | Create, close and navigate | **PASS** | **PASS**, with a caveat on how arrival was observed | NOT RUN |
| 4 | Active-page deferral | Hold **PASS**; release after leaving NOT OBSERVED; quit while holding **FAIL (B1)** | Hold **PASS**; release NOT OBSERVED | NOT RUN |
| 5 | Recently closed, "Closed on <device>" | **PASS** (label caveat) | **PASS** (data only, no screenshot) | NOT RUN |
| 6 | Off/on keeps edits without duplication | — | **PARTIAL** | NOT RUN |
| 7 | Internal pages and private tabs never sync | **PASS** | **PASS** | NOT RUN |
| 7a | Local `file://` pages never sync | NOT RUN | NOT RUN | NOT RUN |
| 8 | Erase removes the account's Space data | **PARTIAL**, not independently verifiable | — | NOT RUN |

### What was observed

**1. Chosen Spaces join.** On the Mac, a Space "Gate D" was saved with these tabs:

- `example.org`, pinned;
- `example.com`;
- `www.wikipedia.org`;
- `www.iana.org`, in the group "Gate group";
- one `blanc://newtab/` page;
- one private tab, `example.net`.

Turning on **Spaces and groups** offered "Gate D — 4 tabs" ([mac-choose-spaces.png](evidence/2026-10-28-shared-spaces-gate-d/mac-choose-spaces.png)). Windows turned on Spaces and groups; its dialog had no local Spaces to offer and showed "1 of 25 shared Spaces" ([win-turn-on-spaces.png](evidence/2026-10-28-shared-spaces-gate-d/win-turn-on-spaces.png)). Gate D then appeared on Windows with the same four tabs in the same order: `example.org` still pinned, and `iana.org` in "Gate group". Windows opened it in a new window, because its current window had unsaved tabs (`unsaved-scratch`).

**2. #1204 retest.** On Windows each of the four arrived tabs was selected in turn. All four loaded their real pages ("Example Domain" ×2, "Wikipedia", and IANA with its own `<h1>`). None showed "This tab can't be reopened"; a text search of every page for that message found nothing. Screenshot: [win-shared-tabs-open.png](evidence/2026-10-28-shared-spaces-gate-d/win-shared-tabs-open.png).

**3. Create, close and navigate.**

- **Mac → Windows.** At 17:44:35 the Mac created `www.rfc-editor.org`, navigated `example.com` to `?gate=mac-nav` and closed Wikipedia. All three were on Windows by 17:46:12 (the previous poll, at 17:45:35, did not have them yet).
- **Windows → Mac.** At 17:52:21 Windows created `www.w3.org`, navigated the pinned `example.org` to `?gate=win-nav` (it stayed pinned) and closed `rfc-editor`. The Mac candidate had been stopped from outside this run (see Interference). When Gate D was reopened at 17:57, the Mac had all three changes.
- **Live arrival on the Mac.** A later Windows-created tab (`ietf.org`) and the off/on edit in check 6 reached the Mac's shared store while it was running.

**4. Active-page deferral.**

- **Windows edits the Mac's active tab.** At 17:58:11 Windows navigated `example.com`, the Mac's active tab, to `?gate=win-deferred`. The Mac kept `?gate=mac-nav` from 17:58 until 18:04:48 while the tab stayed active.
- **Mac edits Windows' active tab.** At 17:58:21 the Mac navigated `w3.org`, Windows' active tab, to `?gate=mac-deferred`. Windows kept the plain URL for as long as it was observed.
- **Release not observed.** The deferred change applying once the tab is left was not seen. The Mac was stopped from outside at 18:04:48 while it was still holding the change, and that exposed B1.

**5. Recently closed.**

- **Mac → Windows.** On Windows the ⌘L band showed "Wikipedia · Closed on MacBook Pro M5" ([win-recently-closed-from-mac.png](evidence/2026-10-28-shared-spaces-gate-d/win-recently-closed-from-mac.png)).
- **Windows → Mac.** The Mac's closed-entry projection listed "RFC Editor" from `BNFY-PC` (the VM's computer name). This was read from the data the band renders; no screenshot was taken.
- **Label caveat.** The label uses the device's published computer name. The Devices list on the other machine already showed the chosen name ("Gate D Mac") for the same device. This is recorded as an inconsistency to review, not as a failure.

**6. Off/on.** Windows turned Spaces and groups off. While off, it created `ietf.org/?gate=offline-edit` and navigated `w3.org` to `?gate=offline-nav`. Turning it back on offered "Gate D — 3 tabs" with **Rejoin** preselected, and Rejoin was confirmed. Results:

- The new tab survived and reached the Mac's store.
- There was one Space, with no copy and no duplicated tabs.
- The `w3.org` navigation was dropped: B1 had already tombstoned that tab on the Mac. So the navigation-edit half of this check is inconclusive, not passed.

**7. Internal and private tabs.** Neither `blanc://newtab/` nor the private `example.net` tab ever appeared:

- in the selection count (4 tabs);
- in the Mac's shared blob (every tab row ever written was inspected);
- on Windows.

**7a. Local files.** Not run. Typing `file:///private/tmp/gate-d-local.html` into the tab navigation path produced a DuckDuckGo search, not a local page. No other route was tried.

**8. Erase.**

- **First erase, from Windows.** Turn off sync with "Also delete synced data" succeeded: sync off, no error, no pending erasure.
- **The Mac re-created the copy.** The Mac, still on the account, kept reporting "Last synced just now" with its Space still shared and no error. It evidently re-created the server copy, as the design implies for a device that still holds the key.
- **Final erase, from the Mac** (the last device): sync off, no error ([mac-after-erase.png](evidence/2026-10-28-shared-spaces-gate-d/mac-after-erase.png)).
- **Not verifiable.** The Worker's store is opaque ciphertext, and no paired device remained to observe from. So "the Space data is gone for the other devices" could not be independently confirmed. Both devices kept their local Gate D copy, as the Settings text says they will.

## B1: quitting while a Space holds back a change from another device deletes tabs nobody closed

**Severity:** silent data loss that spreads to every device sharing the Space. Grouped tabs, and so their group, can disappear.

**Deliberate reproduction on the Mac candidate (R2, 18:14–18:20).**

1. Gate D is open on the Mac. Its active tab is `ietf.org`. The shared store's `windows[...].accepted` is empty.
2. At 18:15:04 Windows navigates that tab to `https://www.ietf.org/?gate=r2`.
3. By 18:15:53 the Mac has stored that change in `accepted` and has not applied it. The page still shows `ietf.org`. This is correct deferral.
4. At 18:16:00 the Mac main process is quit with `SIGTERM`, sent by exact PID after checking its profile path. This is a clean Electron quit.
5. Immediately afterwards, the Mac's `shared-spaces.json` has `deleted: true`, stamped 18:16:00 by the Mac's device id, on two tabs:
   - `ietf.org/?gate=r2`, the held tab;
   - `iana.org`, the only tab in "Gate group". Nobody touched it.
6. The deletions are not sent during the quit; Windows still had both tabs at 18:18.
7. After the Mac relaunched at 18:18:40, Windows lost both tabs and with them the group. Its Recently closed band listed "Internet Assigned Numbers Authority · Closed on MacBook Pro M5" and "IETF | Internet Engineering Task Force · Closed on MacBook Pro M5" ([bug-win-tabs-lost-after-repro.png](evidence/2026-10-28-shared-spaces-gate-d/bug-win-tabs-lost-after-repro.png)).

**Control (R1, 18:14:22).** The same Mac instance was quit the same way with nothing held back (`accepted` empty). No deletions were written.

**First occurrence (18:04:48).** The Mac candidate was stopped from outside this run while it was holding back the Windows navigation of its active `example.com` tab, and while its own navigation of `w3.org` was held back on Windows. At that same second the Mac stamped deletions for both `example.com/?gate=win-deferred` and `w3.org/?gate=mac-deferred`. After the next Mac launch, Windows dropped `example.com` and listed it "Closed on MacBook Pro M5" ([bug-win-tab-lost-after-mac-quit.png](evidence/2026-10-28-shared-spaces-gate-d/bug-win-tab-lost-after-mac-quit.png)). Windows still showed `w3.org` only because it was active there.

**Where to look (not diagnosed).** The deletions are written by the quitting device during shutdown, only when its window state has a non-empty `accepted` set. Likely areas: the shutdown or close checkpoint in `main.js`, and `shared-spaces-runtime.js` capture and reconcile while `accepted` changes are pending:

- `closeSharedSpaceWindow`;
- `sharedRuntimeSync`'s `capture`, `checkpoint` and `saveWindow`.

No product code was changed.

## Other observations (not claimed as bugs)

- **Settings did not open from the bridge on Windows.** While the Windows candidate's window was not focused, `browserAPI.openPage('settings', 'sync')` and a navigation to `blanc://settings/` did not open the Settings sheet, and an unresponsive target with an empty URL appeared. Real Ctrl+, opened it normally. This may come from driving an unfocused, x64-emulated window and was not pursued.
- **Live chosen name in the Devices list.** The Windows Devices list showed the Mac as "Gate D Mac" (chosen name) within minutes. The ⌘L band kept the computer name (see check 5).

## Interference during the run

A separate session was testing iPhone scanning on the same Mac with a copy of the same build. That copy first ran from `/private/tmp/blanc-pairing-145/dist/mac-arm64/Blanc.app`, later from `/private/tmp/blanc-iphone-scan-app.app`, with its own profile and debugging port 9339.

**Interference with this run's instance:**

- **Window used.** Between 17:30 and 17:35 the window of this run's Mac candidate was used from outside: it loaded a GitHub pull-request page and an Apple Developer page, and closed tabs inside the shared Space.
- **Stopped from outside 5 times.** This run's Mac instance quit cleanly with no crash event in `crash-ledger.json`, without any action from this run, at about:
  - 17:35;
  - 17:49:36;
  - 17:53:48;
  - 18:04:48;
  - once more between 18:28 and 18:34.
- **Cleanup.** The two non-test pages were removed from Gate D and from Recently closed on both devices before any screenshot.

**What this run itself stopped.** It ran no `kill`, `pkill`, `killall`, AppleScript quit or `kill-electron.sh`. It sent `SIGTERM` only to its own Mac PIDs, after checking each one's command line for `/private/tmp/blanc-gated-mac-profile`:

- 80880 at 18:14:22 (R1);
- 44149 at 18:16:00 (R2);
- 53728 at cleanup.

**Effect on the evidence.** The outside quits:

- explain why Windows → Mac arrival was observed on reopening;
- explain why deferral release was not observed;
- triggered the first occurrence of B1.

B1 itself was then reproduced by this run's own clean quit, with a control.

## Not run, and why

- **Linux, every check.** B1 fails the gate for this candidate. A fixed candidate must repeat Gate D on every platform, so a Linux pass on this build would not count. The ARM64 AppImage above was built and hashed but not installed.
- **Deferral release after leaving the tab.** Blocked by the outside quits, then by B1.
- **Local `file://` tabs.** No supported route opened one; see check 7a.
- **Independent confirmation of server-side erasure.** The Worker's store is opaque, and no device remained on the account.

## Cleanup

- Both candidates were quit by their own PIDs or paths.
- The Windows VM-local copy (`%LOCALAPPDATA%\BlancGateD145`) was deleted. The VM's normal Blanc install, already running beforehand, was left running, and the VM was re-suspended.
- The Ubuntu VM was never resumed.
- The disposable account was erased from both devices.
- The temporary Mac profile and app copy remain under `/private/tmp`, and contain no owner data apart from the two outside page visits noted above.

## Rerun on the fixed candidate (ab9d568f4)

**Status: PASS on every check that was run, on Mac↔Windows and Mac↔Linux.** B1 did not reproduce. No product bug was found. The items under "Not run" below were not checked. Owner platform confirmations are still to be given; this section is the evidence for them.

All times are EDT on October 28, 2026 (runs from 20:18 to 21:07).

### Candidate

Source: `ab9d568f43c4f2a658f19d4d4569c1b604f359c0`, the PR #1254 head. It includes #1251 (the B1 fix) and #1248. `version` is 1.45.0.

| Platform | Artifact | Identity |
|---|---|---|
| Mac (Apple Silicon) | `dist/mac-arm64/Blanc.app`, built locally in `/private/tmp/blanc-cand-1450b`. 1.45.0, build 1450 | Signed, TeamIdentifier `XYGUCY4498`; `codesign --verify --deep --strict` passes. Unnotarized local build. `app.asar` SHA-256 `da7d8b99d29bb0a13d8468d321ccbe5d439a354c1513b11cfe42322d16b35e70`. Run from a `ditto` copy at `/private/tmp/blanc-gated2-mac/Blanc.app`, which has the same `app.asar` hash, and `diff -rq` against the original reports no differences |
| Windows (x64 on Windows 11 ARM64, Parallels) | Validation run [40792717622](https://github.com/bnfy/blanc/actions/runs/40792717622), head `ab9d568f43c4f2a658f19d4d4569c1b604f359c0`, concluded success | `Blanc-Setup-1.45.0.exe` SHA-256 `c3238050fc736912e393b86b28b644f52fa5723e4ddcdef0c15b1f265e7b28e5`. `windows-signature.json` reports Valid, publisher `CN=Bananify Creative`, signer thumbprint `4C2EF97FC11E635759142FE176F9AA224AD93E9D`, Microsoft timestamp, and the same installer SHA-256. Unpacked `app.asar` SHA-256 `5ec0daef50d24a83b70c806add31e3e11be67000d14021d89fce52ede51362e3` |
| Linux (ARM64, Ubuntu 26.04, GNOME Wayland, Parallels) | `dist/Blanc-1.45.0-arm64.AppImage`, built locally from the same worktree | SHA-256 `140a29f3c1c52582a81c05585e35b888dcbba4487a03c961ed881876a778ff8a`. Its `app.asar` is identical to the Mac one (`da7d8b99…`) |

How each candidate was run and isolated:

- **Mac.** Run with `--user-data-dir=/private/tmp/blanc-gated2-mac-profile --remote-debugging-port=9361`, launched through `open -n -a` after the first launch. The owner's `/Applications/Blanc.app` and its profile were not touched.
- **Windows.** The installer was unpacked with `bsdtar`. The copy ran from `%LOCALAPPDATA%\BlancGateD2` with its own `--user-data-dir` and port 9361. The VM's normal Blanc install, already running, was left alone.
- **Linux.** The AppImage cannot start directly in this VM, because `kernel.apparmor_restrict_unprivileged_userns` is 1, and this run did not change that setting. So it was run as the AppImage's own extracted payload (`--appimage-extract`), with that copy's `chrome-sandbox` made setuid root. It ran from `/home/parallels/blanc-gated2`, with its own profile, `--ozone-platform=wayland` and port 9361.
- **Linux keyring.** Electron's OS credential encryption needs the GNOME session's D-Bus and desktop variables. The first two Linux launches came from `prlctl exec` without them, and Turn on Sync refused with "OS credential encryption is unavailable". The launcher then copied those variables from `gnome-shell`'s environment, and pairing worked. This came from the test environment, not the product.

**Sync account.** A fresh, disposable account was made with **Turn on Sync** on the Mac, against the production `blanc-sync` Worker. Linux and Windows joined through **Add device** on the Mac and **Add this device with a code** on each peer. Codes were passed between devices in memory and in a deleted owner-only temporary file. No codes, keys or account locators were recorded.

**How the test was driven.** As in the first run: each candidate's own renderer bridges over the Chrome DevTools Protocol (CDP). That means `window.browserAPI` on the chrome strip, the real Settings controls, and the ⌘L panel input for `/group`. Windows used real keyboard input (Ctrl+,) to open Settings. The shared store (`shared-spaces.json`) was read from disk on every device to see what each one wrote.

### Results

| # | Check | Mac ↔ Windows | Mac ↔ Linux |
|---|---|---|---|
| 1a | B1: the Mac holds a remote change and quits | **PASS** | **PASS** |
| 1b | B1: the peer holds a remote change and quits | **PASS** (Windows) | **PASS** (Linux) |
| 1c | Quit with nothing held | **PASS** | **PASS** |
| 2 | A group made after sharing survives | **PASS** | **PASS** |
| 3 | A held change applies once the holder leaves the tab | **PASS** (Mac and Windows as holders) | **PASS** (Mac and Linux as holders) |
| 4 | Off/on keeps the edits without duplicates | **PASS** (off/on on Windows) | **PASS** (off/on on Linux) |
| 5 | Erase with every other device off first | **PASS** | **PASS** |
| Q1 | Joining a Space keeps tabs, pin, group and order | **PASS** | **PASS** |
| Q2 | Arrived tabs open their pages (#1204) | **PASS** | **PASS** |
| Q3 | Create, close and navigate both ways | **PASS** | **PASS** |
| Q4 | Recently closed shows "Closed on …" | **PASS** | **PASS** |
| Q5 | Private and internal tabs never sync | **PASS** | **PASS** |

### What was observed

**Q1. Join.** On the Mac, a Space "Gate D2" was saved with these tabs:

- `example.org`, pinned;
- `example.com`;
- `www.wikipedia.org`;
- `www.iana.org`, in the group "Gate group";
- a `blanc://newtab/` page;
- a private `example.net` tab.

**Spaces and groups** offered "Gate D2 — 4 tabs" ([mac-choose-spaces.png](evidence/2026-10-28-shared-spaces-gate-d-rerun/mac-choose-spaces.png)). Windows and Linux each turned on Spaces and groups ([win-turn-on-spaces.png](evidence/2026-10-28-shared-spaces-gate-d-rerun/win-turn-on-spaces.png), [linux-turn-on-spaces.png](evidence/2026-10-28-shared-spaces-gate-d-rerun/linux-turn-on-spaces.png)). On both peers, opening Gate D2 swapped it into the current window with the same four tabs in the same order: `example.org` pinned and `iana.org` in "Gate group".

**Q2. Arrived tabs open their pages.** On both peers each arrived tab was selected in turn. All four loaded their real pages ("Example Domain" ×2, "Wikipedia", and IANA with its own `<h1>`). The text "can't be reopened" appeared on none of them ([win-iana-open.png](evidence/2026-10-28-shared-spaces-gate-d-rerun/win-iana-open.png), [linux-iana-open.png](evidence/2026-10-28-shared-spaces-gate-d-rerun/linux-iana-open.png)).

**2. Groups made after sharing.** All of this happened inside the shared Space:

- **On the Mac:**
  - Opened `rfc-editor.org` and grouped it with `/group Slash group`, typed in the ⌘L panel.
  - Switched to the vertical rail (`setTabLayout('vertical')`), opened `w3.org` and pressed the rail's **New group** (`#verticalTabsNewGroup`). The panel opened prefilled with `/group `, and "Rail group" was entered there.
  - Switched through every tab.
  - Renamed "Slash group" to "Slash renamed" and colored it rose (`#9b4761`). Colored "Rail group" sky (`#376694`).
  - Screenshot: [mac-groups-rail.png](evidence/2026-10-28-shared-spaces-gate-d-rerun/mac-groups-rail.png).
- **On the peers:** Linux grouped `example.com` as "Linux group" and Windows grouped `wikipedia.org` as "Win group", both with `/group`.

**Result.** After every device switched through all its tabs, all three had the same 6 tabs and the same 5 groups with the same names and colors ([linux-groups-panel.png](evidence/2026-10-28-shared-spaces-gate-d-rerun/linux-groups-panel.png)). No device marked any group deleted. The groups also survived every quit and relaunch in checks 1 and 4. Later edits changed them only on purpose:

- "Linux group" ended when its only tab was closed in Q3.
- "Gate group" was renamed "Gate group L" and "Rail group" was renamed "Rail group W" in check 4.

**1a. The Mac holds, then quits.**

1. At 20:39:14 Windows navigated `w3.org` (the Mac's active tab) to `?gate=d2-hold-mac`.
2. By 20:40:46 both the Mac and Linux had the change in `accepted` and still showed the plain URL (Linux's active tab was also `w3.org`).
3. At 20:42:53 the Mac main process was sent `SIGTERM`, by exact PID after its command line was checked against this run's profile.
4. **On disk afterwards:** no tab or group had `deleted: true` apart from earlier, deliberate closes, and the held row was still in `accepted`. `crash-ledger.json` had no events.
5. **Relaunch, 20:42:59:** the Mac showed `w3.org/?gate=d2-hold-mac`, applied, and `accepted` was empty. All 6 tabs and 5 groups were there, and Recently closed was empty.
6. **On the peers:** Windows and Linux kept every tab and group, and nothing new appeared in their Recently closed.

**1b. The peers hold, then quit.**

1. Both peers made `rfc-editor.org` their active tab.
2. At 20:43:22 the Mac navigated it to `?gate=d2-hold-peers`. By 20:44:22 both peers had the change in `accepted` and had not applied it.
3. At 20:45:06 each peer's only window was closed through `browserAPI.closeWindow()`, the same IPC as the title-bar ×. That quits Blanc on Windows and Linux. Both exited fully.
4. **On disk on both:** no new deletions, and the held row was still in `accepted`.
5. **After relaunch (Windows 20:45:37, Linux 20:46):** each showed `rfc-editor.org/?gate=d2-hold-peers`, applied, with all 6 tabs and 5 groups, `accepted` empty, and no new Recently closed entry. The Mac lost nothing.

**1c. Quit with nothing held.** At 20:49:51 `accepted` was empty on all three. The Mac was quit by `SIGTERM` and both peers by closing their only window. No device wrote a deletion. After relaunch all three showed the same 6 tabs and 5 groups, and no device had a new Recently closed entry.

**Extra probe.** The Mac opened `ietf.org/?gate=d2-late` and was quit 1.5 s later. That tab was still there after relaunch and was not marked deleted. It was later closed on purpose in Q3.

**3. Deferral release.** In each case the holder left the tab and the held change applied within about 1–2 s:

| Holder | Held change | Left the tab at | Applied |
|---|---|---|---|
| Linux | Windows' `w3.org/?gate=d2-hold-mac` | 20:42:46 | 1.0 s later |
| Windows | The Mac's `rfc-editor.org/?gate=d2-release` | 20:47:27 | 1.0 s later |
| Linux | The same Mac change | 20:47:27 | 1.0 s later |
| Mac | Linux's `w3.org/?gate=d2-release-mac` | 20:49:09 | 2.1 s later |
| Windows | The same Linux change | 20:49:29 | 1.0 s later |

Closes of a device's *active* tab were also held: the Mac held Windows' close of `ietf.org`, and Windows held the Mac's close of `mozilla.org`. Each applied when that device left the tab.

**Q3. Create, close and navigate.**

- **Navigate:** all the navigations in checks 1 and 3 crossed between devices: Windows → Mac and Linux, Mac → both peers, Linux → Mac and Windows.
- **Create:**
  - The Mac created `rfc-editor.org`, `w3.org` and `ietf.org`. All reached both peers.
  - Windows created `mozilla.org/?gate=d2-win-create` at 20:51:22. It was on the Mac and Linux by 20:52:27.
- **Close, at 20:53:40:** the Mac closed `mozilla.org`, Windows closed `ietf.org` and Linux closed `example.com`. Each close reached the other two devices. Where the tab was active on a receiving device, the close was held until that device left the tab (see check 3).

**Q4. Recently closed.** Each device listed the other devices' closes with the right device:

- **Mac:** "IETF … · Closed on BNFY-PC" and "Example Domain · Closed on ubuntu-26-04-arm64".
- **Windows:** "Mozilla … · Closed on MacBook Pro M5" and "Example Domain · Closed on ubuntu-26-04-arm64".
- **Linux:** "Mozilla … · Closed on MacBook Pro M5" and "IETF … · Closed on BNFY-PC" ([linux-recently-closed.png](evidence/2026-10-28-shared-spaces-gate-d-rerun/linux-recently-closed.png)).

Each device's own close showed with no device label. No entry appeared that nobody had closed, apart from the outside pages described under Interference. The labels use computer names, the same as in the first run.

**4. Off/on.**

1. Windows and Linux each turned **Spaces and groups** off.
2. While off:
   - **Windows** created `ietf.org/?gate=win-offline`, navigated `rfc-editor.org` to `?gate=win-offnav` and renamed "Rail group" to "Rail group W".
   - **Linux** created `ietf.org/?gate=linux-offline`, navigated the pinned `example.org` to `?gate=linux-offnav` (it stayed pinned) and renamed "Gate group" to "Gate group L".
3. Turning on again offered the Space with **Rejoin** preselected ([linux-rejoin-dialog.png](evidence/2026-10-28-shared-spaces-gate-d-rerun/linux-rejoin-dialog.png)). Rejoin was confirmed on both at 21:01:32.
4. **Result, by 21:02:58:** all three devices had one Space "Gate D2" with the same 7 tabs and 4 groups. Every offline edit was kept: both new tabs, both navigations, and both renames. Each device's shared store had exactly 7 live tab rows and one Space blob, so there were no copies and no duplicates.

**Q5. Private and internal tabs.**

- **Mac:** the private `example.net` tab and the `blanc://newtab/` page never appeared.
- **Linux:** a private `example.net/?gate=linux-private` tab and a New Tab page were opened inside the shared Space; neither appeared.

Neither appeared in any device's shared store (every row was read on all three), on any other device, or in the Mac's "4 tabs" count.

**5. Erase.**

1. **Peers off first.** Windows and Linux turned sync off without "Also delete synced data". Each reported sync off with no error.
2. **Positive control.** The Worker still returned `200` for the account's settings, favorites (`bookmarks`), Spaces index (`spaces`), `closed`, and Space blob stores. Only the HTTP status codes were read, never the contents.
3. **Erase from the Mac.** At 21:04:54 the Mac turned sync off with "Also delete synced data". It reported off, no error, nothing pending ([mac-after-erase.png](evidence/2026-10-28-shared-spaces-gate-d-rerun/mac-after-erase.png)).
4. **Straight afterwards:** settings, favorites, `closed` and the Space blob returned `404`. The `spaces` index still returned `200`.
5. **At 21:06:34:** every store, including `spaces`, returned `404`. No device was on the account in the meantime, so nothing could re-upload.
6. **The other devices** were off and kept their local, no longer shared Gate D2, as the Settings text says ([linux-after-erase.png](evidence/2026-10-28-shared-spaces-gate-d-rerun/linux-after-erase.png)).

### Other observations (not claimed as bugs)

- **The `spaces` index outlived the erase for under two minutes.** It answered `200` right after the account wipe and `404` by the 21:06:34 probe. This may be Workers KV edge caching (eventual consistency). It was not investigated.
- **Linux's Rejoin dialog counted one tab too many.** It said "Gate D2 — 7 tabs" while Linux's Space had 6 shareable tabs plus one private tab and one New Tab page. Windows' dialog said 6 for 6. Neither the private tab nor the New Tab page was ever written to any shared store, so this affects only the count shown. It was not investigated.
- **Capture tooling.** CDP screenshots of the Windows candidate's ⌘L overlay timed out, so Windows' panel contents were read as text. One Mac overlay capture came back blank and is not included.

### Interference during the run

Pages were again opened and closed in this run's Mac candidate from outside the run. Both outside pages were GitHub pull-request pages, and they happened twice:

- **20:22.** `github.com/bnfy/blanc/pull/1254` was visited at 20:22:26, and the candidate was stopped cleanly from outside at about 20:22:30, with no crash event. This run relaunched it at 20:23:09. The page was then a restored tab in the Space: it was captured at 20:23:12 and closed at 20:23:15, then listed in the Mac's own Recently closed and published to the peers as "Closed on MacBook Pro M5". Teardown closes are kept out of Recently closed, so this reads as an actual close by someone.
- **21:02.** `github.com/bnfy/blanc/pull/1247` was opened in the Space window at 21:02:55, closed at 21:02:56, and the window was then closed. That close published no other deletions. This run reopened the window at 21:04 by activating the same app copy, with all 8 tabs and 4 groups intact.

A likely cause, not verified: the candidate has the same bundle id as the owner's installed Blanc (`me.bnfy.bowser`), so a link opened elsewhere on this Mac can land in it. This run's own actions were:

- `SIGTERM` to its own Mac PIDs only, each after checking the command line for `/private/tmp/blanc-gated2-mac-profile`: 70889 at 20:42:53 (1a), 79039 at 20:49:51 (1c), 82885 at 20:50:53 (the probe) and 83169 at 21:07:09 (cleanup). The first Mac process, 69211, was the one stopped from outside at about 20:22:30;
- closing the only window on its own Windows and Linux copies;
- stopping its own Linux PIDs, by profile path, only for relaunches and cleanup, and its own Windows copy, by path, at cleanup.

The outside pages are not counted as evidence for any check.

### Not run, and why

- **Local `file://` tabs (7a).** Not attempted again; no supported route was found in the first run.
- **The rail's New group on Windows and Linux.** It was exercised on the Mac only. The peers created groups with `/group`.
- **The packaged AppImage launched directly.** Not possible in this VM without changing the AppArmor user-namespace setting. The AppImage's extracted payload was run instead, with the same `app.asar`.
- **Intel Mac, x64 Linux, and Linux on X11.** Not covered.
- **Notarized builds.** These were local and validation builds.

### Cleanup

- All three candidates were quit by their own PIDs or windows.
- The Windows copy (`%LOCALAPPDATA%\BlancGateD2`) and the Linux copy (`/home/parallels/blanc-gated2`) were deleted.
- Both VMs were suspended again, as they were found. The VM's normal Blanc install was left as it was.
- The disposable account was erased (see check 5).
- The Mac app copy, its profile, and the downloaded Windows artifacts were deleted afterwards.
