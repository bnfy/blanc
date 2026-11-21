# Linux L2 suite triage

The [L0 x64 baseline](../scenarios/baseline-linux-x64-2fcae33ab6ecf405.json) records 615 passes, 21 failures, five undefined cases and 26 existing exclusions in 667 cases. The table groups the 26 failures and undefined cases by their first unsuccessful step. “Fixed” means a code change addresses the cause. Hosted confirmation belongs to L2 Task 5 on both architectures. The five exclusions cite the [approved L2 decisions](../../docs/superpowers/plans/2026-11-21-linux-fork-l2.md).

| Group | Feature and declaration | Disposition | Cause and closing milestone |
| --- | --- | --- | --- |
| Owner decision | private-tabs:40 | Excluded | Decision 4. The step registers an ephemeral private-tab passkey with Touch ID. Chromium on Linux uses a security key or phone for device-bound credentials. |
| Owner decision | settings-and-theming:12 | Excluded | Decision 5. Resolving a stored Ember icon depends on the macOS app icon catalog. |
| Owner decision | supporter-and-session:7 | Excluded | Decision 5. Selecting Sunrise-Dark depends on the macOS catalog. |
| Owner decision | supporter-and-session:12 | Excluded | Decision 5. The Patron Ember selection has no Linux Settings control. |
| Owner decision | island-and-commands:320 | Excluded | Decision 6. Linux uses Chromium caption buttons. L1 checks their placement and operation on X11 and Wayland. |
| Import | arc-spaces-import:7 | Fixed | Discovery correctly offers only **Choose file…**. Assert the actual entry and keep the native read-count assertion before selection. |
| Import | arc-spaces-import:14,23,31 | Fixed | Each clicked a Mac discovery action. Select the fixture file in the native dialog. Keep the checks for atomic creation, capacity refusal, and Patron-independent import respectively. |
| Import | arc-spaces-import:39 | Fixed | Open the file chooser, deselect the two Spaces, and apply Favorites. The original assertions check the Arc folder and the existing Favorite. |
| Import | arc-spaces-import:46 | Fixed | The projection step requested the unavailable local Arc install. Read the selected file through the sheet bridge and retain the original opaque-ID and privacy assertions. |
| Import | arc-spaces-import:53 | Fixed | The adapter rejected Linux and could not select the copied sidebar. Drive the visible X11 file chooser for this fixture and check both previewed names. |
| Import | arc-spaces-import:60 | Fixed | Start the preview through the file chooser. The shipping step closes the sheet and checks the native import session was dropped. |
| Runner environment | interface-language:10,18,26,34,43 | Fixed | OS-language setup threw before any assertion. Relaunch only the browser with LANGUAGE, LC_ALL and LANG. These cases exercise System, an English pin, Settings relaunch, an unavailable pin, and the page's Accept-Language header respectively. |
| Single case | F41-named-workspaces:236 | Recorded | Likely a click during the Spaces popup's list-to-editor height transition. Both attempts timed out after clicking Custom. The adjacent custom-color flow at :141 passed. The Linux step now waits for the rendered editor to finish its transition before clicking. L2 Task 5 closes this after observing the hex field and final color at 1x and 2x. If it persists, capture the swatch hit target and aria-expanded on the failing candidate. |
| Single case | glance:506/example-516 | Fixed | The reported starting x of 95 matches the centered card in L0's 945-DIP window. At that width the card's own clamp stops a −120 drag at x = 0. The CDP window-size acknowledgement can precede the Island's layout snapshot. Start at shipping size and wait for the rendered Glance page area after resize. The immediate-close and saved-move assertions stand. |
| Single case | newtab-layouts:21 | Fixed | The initial playable-board check assumes shipping's 1280×800 window. Chromium selected a narrower, taller X11 default. Set the initial geometry and retain all subsequent minimum-size, zoom, rail and breakpoint checks. L2 Task 5 must also observe those later steps. |
| Single case | split-view:53 | Fixed | The survivor measured 945 DIP, the width of the untouched fixture. The shipping step requires at least 1000 DIP. Set the initial 1280×800 window and account for measured frame insets when resizing. |
| Single cases | sync:162,181 | Fixed | The Settings handler records a request and calls SetAllowScreenshots. X11's widget readback kept the counter at zero. The Linux test hook counts outstanding requests on live widgets, matching the shipping step. Verify release on join and sheet close, then reacquisition on reopen. These checks establish the request lifecycle only. |
| Single cases | navigation-and-context-menu:12/example-22,32 | Fixed | Brave was missing in the Change dialog. The adapter now uses Chromium's native Manage search engines form and Make default action when needed. Verify the navigation destination and the changed engine for submission after a Google suggestion. |

## Runner evidence still due

- Build the fork-owned C++ changes on Linux x64 and arm64. The import probe discovers Chrome, Chromium, Brave, Edge and Vivaldi under a temporary home. It checks recovery against a second browser's live singleton socket, then checks stale locks naming an unrelated process, a different browser, a zombie and a dead PID. The local check requires read access to the owner's socket table and file descriptors under `/proc`. Another host's process may still own a shared profile.
- Run the installed suite on a recorded candidate per architecture. The runner checks the archive identity against that architecture and hashes the installed executable against the verified Debian package. Confirm the package supplies the blocker without a flag, both UTF-8 locales work through relaunch, and the X11 chooser reports either the browser PID or a transient parent owned by it.
- The check=suite workflow runs the full inventory at 1x and the Island, vertical tabs, Spaces and Glance features at 2x, on the same 1920×1080 logical desktop. It checks the rendered device scale. Compare layout-differences-ARCH.json and the detailed baselines, particularly the Spaces picker and Glance resize. Openbox iconify animation is disabled. Renderer motion remains available for scenarios which exercise it.
- Task 5 records the per-architecture reports and combined index with candidate, archive digest, hosted run ID, report path and digest. Store full baseline paths under `baselines.linux.x64` and `baselines.linux.arm64`. Each requirement's `platformVerification.linux` uses the same architecture keys for its candidate and shipping-commit receipts. Both receipts must be current for Linux verification. The L0 baseline belongs to x64.

## Implementation surface

Paths below are relative to chromium/ unless they begin with .github/.

| Files changed | Interfaces |
| --- | --- |
| linux/candidate.mjs, linux/run-suite.mjs, tools/progress.mjs, tracker.json, STATUS.md | byArchitecture(current), matchesLinuxCandidate(current, arch, config), runtimeConfig(directory, candidate, installedSha256?), writeSuiteReport(directory, baseline), compareLayoutRuns(standard, scaled) |
| tests/runner.mjs, tests/lib/fixture.mjs, tests/slice-report.mjs, .github/workflows/chromium-linux-candidate.yml | The runner reads the architecture-specific tracker, retains the rendered scale and writes s1-linux-ARCH.json and its JUnit companion for a full run. The existing sliceReport(baseline, slice) retains exclusionReason. |
| tests/lib/platform.mjs, tests/fork-steps/commands.mjs, tests/adapters/commands.mjs | osLanguageEnv(tag, env), missingEngineTemplate(engine, platform) |
| tests/adapters/import.mjs, tests/fork-steps/import.mjs, tests/fork-steps/linux-arc.mjs, tests/steps.mjs | configureArcImport(world, operation, value, platform), async chooseLinuxArcFile(file, pid, run), linuxArcSteps (map from shipping step expression to implementation) |
| tests/adapters/island.mjs, tests/fork-steps/window-layout.mjs | linuxButtonRects(buttons, menuButtonRect), async waitForLinuxGlanceResize(world, width, height), async openLinuxSpacePicker(name) with the suite world as receiver |
| blanc/browser/ui/tab_import.inc, blanc/browser/ui/blanc_prototype_ui.cc, source-map.json | LinuxSourceRunning(const base::FilePath&) returns bool internally. The existing windowsContentProtected test hook returns a count. |
| blanc/services/blocker/blocker_available.h, tests/linux-quit.mjs, tests/linux-quit.test.mjs | Installed Linux previews load the pinned engine beside the executable. The unpacked fixture passes its bundle directory explicitly. |
| tests/linux-fork-exclusions.mjs, linux/triage-l2.md | Five inventory IDs added to linuxForkExclusions. |
| tests/island-adapters.test.mjs, tests/linux-import.test.mjs, tests/platform.test.mjs, tests/slice-report.test.mjs, tools/linux-fork-exclusions.test.mjs, tools/linux-l2-suite.test.mjs, tools/linux-run-suite.test.mjs | Regression and candidate checks. |
