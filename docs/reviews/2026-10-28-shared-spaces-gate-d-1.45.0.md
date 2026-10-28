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
