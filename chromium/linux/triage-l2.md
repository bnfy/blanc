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

## Candidate 2 regressions

Candidate `linux-x64-64f8e6871c8fb16f` ran the harness at `0bab9708f` with patches 0113 and 0114. Of 667 cases, 513 passed, 124 failed, four were undefined and 26 were excluded. Comparing case IDs with L0 gives 102 previously passing cases that failed. The counts below use the completed case after any retry. [Hosted run 44954377054, artifact `f0/baseline.json` and per-case logs](https://github.com/bnfy/blanc/actions/runs/44954377054)

### Window geometry

There are 48 direct content-fill errors and nine resize timeouts containing the same error. In `case-0408`, CDP reported a 945×1060 window at (10, 10). The rendered host was 937×68 and the page was 988 DIP high, giving a 937×1056 client. After a request for 900×600, `case-0611` got an 892×596 client. The (10, 10) is the window position. On uncomposited Xvfb the restored frame contributes four DIP on the left, right and bottom.

Patch 0114 selected Chromium's Linux frame. Its opaque frame layout calculates the client rectangle and Views assigns it to the BrowserView that contains the Island. The Linux frame helper keeps resize borders even when shadows are off. The toolkit can supply different insets, and a maximized frame can have none. CDP reads the widget bounds. The candidate 2 adapter used those bounds directly. L2 already called the W1 hook on Linux, but the Ozone desktop host returns that same whole window from `GetClientAreaBoundsInScreen()`, so the old hook measured zero. [Pinned frame layout](https://chromium.googlesource.com/chromium/src/+/681cd621e82e606d7536eae8ea2576afb3c7d65c/chrome/browser/ui/views/frame/opaque_browser_frame_view_layout.cc) · [Linux frame insets](https://chromium.googlesource.com/chromium/src/+/681cd621e82e606d7536eae8ea2576afb3c7d65c/ui/views/window/frame_view_utils_linux.cc) · [Desktop host bounds](https://chromium.googlesource.com/chromium/src/+/681cd621e82e606d7536eae8ea2576afb3c7d65c/ui/views/widget/desktop_aura/desktop_window_tree_host_platform.cc)

The Linux branch of the existing `windowFrameInsets` test hook measures the laid-out client against the root view in widget DIPs. The adapter subtracts those four edges on reads and adds them to a requested client size after restore. X11's `_NET_FRAME_EXTENTS` comes from a window manager and `_GTK_FRAME_EXTENTS` support depends on the WM. Neither is needed on bare Xvfb. Wayland uses the same view layout regardless of compositor placement. The frame check compares CDP minus the reported insets with the rendered host and page on X11 and Weston at 1× and 2×. [Pinned X11 extents](https://chromium.googlesource.com/chromium/src/+/681cd621e82e606d7536eae8ea2576afb3c7d65c/ui/ozone/platform/x11/x11_window.cc) · [Wayland window geometry](https://chromium.googlesource.com/chromium/src/+/681cd621e82e606d7536eae8ea2576afb3c7d65c/ui/ozone/platform/wayland/host/wayland_toplevel_window.cc)

| Feature | Declarations with this first error |
| --- | --- |
| island-and-commands (29) | 61, 131, 140, 149, 156, 166, 173, 180, 190, 200, 211, 222, 234, 241, 251, 258, 267, 276, 286, 295, 312, 320, 339, 348, 359, 372, 383, 394, 403 |
| glance (10) | 392, 399, 409, 420, 471, 480, 489, both examples at 506, 538 |
| vertical-tabs (7) | 43, 58, 74, 99, 110, 120, 217 |
| newtab-layouts (5) | 134, 161, 205, 221, 229 |
| split-view (3) | 158, 193, 200 |
| sync (2) | 26, 120 |
| onboarding (1) | 8 |

Of these 57 cases, 55 passed on L0. The existing dispositions above still apply to glance:506/example-516 and island-and-commands:320.

### Sync and Shared Spaces

Nineteen cases ended at “Timeout waiting for Sync on”, showing `syncOn: false` and “Could not check sync.” Another 24 failed the `sync.enable` result assertion at `fork-steps/shared-spaces.mjs:46`. Browser logs including `case-0009` show repeated session-bus address errors. The unpacked workflow ran plain Xvfb. Patch 0113 reports the selected OSCrypt provider to the Sync service. Without a usable Secret Service the provider falls back to `basic_text` and the shipping key-storage check refuses it. The logs do not print the backend name.

Both workflow paths and direct `linux/run-suite.mjs` invocations now create a disposable GNOME home and D-Bus session, unlock the secrets daemon and verify a default-collection write and read before launching the inventory. Browser relaunches and peers inherit the session. Full, filtered and 2× runs each get a fresh keyring.

| Feature | Declarations blocked at Sync enable |
| --- | --- |
| F41-named-workspaces | 46 |
| send-to-device | 7, 15, 24, 33, 41, 56, 63 |
| sync | 7, 13, 20, 88, 104, 129, 150, 162, 181, 210 |
| vertical-tabs | 129 |
| shared-spaces | 4, 11, 17, 23, 29, 35, 41, 47, 73, 80, 87, 94, 103, 111, 119, 132, 143, 155, 165, 175, 181, 193, 204, 211 |

Of these 43 cases, 41 passed on L0. The existing screenshot-protection triage applies after Sync enables in sync:162 and :181. Confirm on both architectures that OSCrypt selects `gnome_libsecret`, Sync enables, and shared data reaches the local Worker.

### Individual cases and hosted confirmation

| Declaration | Finding and L2 Task 5 check |
| --- | --- |
| glance:538 and onboarding:8 | Both hit the direct frame assertion listed above. Verify the later Glance and walkthrough assertions after the client measurement passes. |
| tabs-and-groups:367 | The 44-DIP pill and 68-DIP strip were correct. `activeGuestBounds` subtracted the page height from the outer height, adding the four-DIP bottom border to the reported page top. Check that the corrected client gives 68. |
| vertical-tabs:249 | `overlayBounds` scaled coordinates by 945/937, moving the expected 48-DIP anchor to 48.034 after shadow padding. Using the client width gives a scale of one at normal zoom. Check alignment at both display scales. |
| vertical-tabs:146 | The loading row lost its class. Its fixture holds a response through CDP Fetch, then `sleepTab` detached every page to quiet a different tab. On Linux it now detaches only the tab being quieted when a response is held. Verify both the real loading spinner and the quiet row. |
| F41-named-workspaces:141 and :152 | Both retries clicked into a resizing Spaces editor, then failed to find the hex field or Undo. A click during the list-to-editor transition is the suspected cause. Both steps now wait for the editor transition before clicking Custom or Delete. Verify the saved color and the restored Space after Undo. |
| island-and-commands:115 | Open. Both attempts sent an overlay-local mouse move and still saw the panel after its grace period. This path never reads the window bounds. The step caches the first nonempty card rectangle while the panel animates out of the pill, so its computed outside point can land inside the expanded card. The artifact lacks pointer coordinates. At 1× and 2× capture the delivered point, live card rectangle, and hover-open state at the move to distinguish stale geometry from a missed leave event. |

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

## Candidate 5

The full x64 run for `linux-x64-abbf0c91ab29a46a` had 627 passes, nine failures and 31 exclusions. The arm64 run for `linux-arm64-7f8c53cb7cb20dff` had 622 passes, 14 failures and the same exclusions. Both binaries came from `abe384098`. All 14 declarations remain in the inventory. [x64 run 44980118597](https://github.com/bnfy/blanc/actions/runs/44980118597) · [arm64 run 44980125980](https://github.com/bnfy/blanc/actions/runs/44980125980)

The seven Arc failures share the native file chooser. Being visible to X11 establishes neither that GTK received the whole path nor that Return accepted it. Chromium's GTK handler ignores acceptance in the first 500 ms. Several browser logs also report an event for an unrealized GTK widget. No artifact records which input GTK consumed. Blanc calls `ReadArc` only after `FileSelected`. The Linux driver now selects and reads back the exact path through X11 PRIMARY, respects the native display interval and waits for the original dialog to disappear. The existing PID or transient-parent check still applies. A preview timeout now includes the sheet's status text. [Pinned GTK dialog and response handler](https://chromium.googlesource.com/chromium/src/+/681cd621e82e606d7536eae8ea2576afb3c7d65c/ui/gtk/select_file_dialog_linux_gtk.cc) · [Chromium's cooldown test](https://chromium.googlesource.com/chromium/src/+/681cd621e82e606d7536eae8ea2576afb3c7d65c/ui/gtk/select_file_dialog_linux_gtk_unittest.cc)

| Candidate 5 case | Evidence, change and closing check for L2 Task 5 |
| --- | --- |
| arc-spaces-import:14, both | The preview stayed hidden. Drive the verified chooser and check that both Spaces, groups and pins are created together without switching windows. |
| arc-spaces-import:23, both | Same chooser failure. Check the one-slot refusal and compare all stored Space records before and after. |
| arc-spaces-import:31, both | Same chooser failure. Verify both Spaces with Patron inactive. |
| arc-spaces-import:39, both | Same chooser failure. Select only Favorites and check the existing Favorite plus the new Arc folder entry. |
| arc-spaces-import:46, both | The sheet's pending read exhausted its 20-second CDP deadline on both attempts. Verify the selected-file projection contains the expected opaque IDs and counts and passes all existing privacy assertions. |
| arc-spaces-import:53, both | The entry offered Choose file, but the preview never showed the two names. Check the sidebar moved to the explicitly chosen directory. |
| arc-spaces-import:60, both | The same chooser blocked session creation. Check the native session exists before closing the sheet and is destroyed afterwards. |
| F41-named-workspaces:46, both | At 125% the overlay measured 266×381 CSS pixels. Reserving both sides for the trailing cluster left a 63-pixel footer for a 130-pixel New tab button and a 197-pixel tools row. When the row cannot fit, the Linux panel opens below the native buttons. Check all 25 Spaces and footer hit targets, including both shortcut widths. |
| vertical-tabs:120, both | In a 392-DIP pane the mirrored caption clearance left 158 CSS pixels for 172 pixels of pill contents. Flexible columns now reserve each side's actual cluster and center the pill when space allows. Check the resting controls and Find at minimum size, plus centering in the 1000-DIP window. |
| glance:337, arm64 | The live region said Opening while the marker disappeared. Reproduced with an awake, still-loading snapshot. The Linux picker keeps the originally chosen quiet tab's ID until selection completes. Verify the label, announcement and disabled alternatives during a native wake. |
| glance:538, arm64 | Both final states were revealed with motion enabled. The first sample previously followed pointer delivery and missed the slide. Sample the rendered card and native page from before moving the pointer through a settled frame after input delivery. Check that a real slide was observed and neither rectangle moved. |
| island-and-commands:115, arm64 | The step used the first nonempty rectangle during the opening morph. A resulting off-card move could still land inside. The driver now waits for the open panel to settle and measures it again. Confirm grace-period closure, overlay detachment and the adjacent used-panel case. If it persists, record the delivered pointer and the live card rectangle together. |
| local-profiles:27, arm64 | Both attempts lost a CDP target during the saved-workspace Given. The Personal-card click closes its own picker. Handle a lost reply at that click only, and require the same picker target to disappear and the Personal window to become active. The original socket stack does not identify which target closed. Verify both profile identities and their isolated restored Spaces. If it persists, identify the closing target and operation before changing another wait. |
| tab-migration:116, arm64 | Both 500-tab reviews succeeded. Each apply evaluation hit exactly 60,000 ms. Submit once and observe the original reply on the host after the sheet closes. The operation has a bounded 120-second completion budget. Check a single full-batch broadcast, one live renderer and 499 quiet tabs. If the reply never arrives, time the native restore loop. |

Closure requires rebuilt candidates with the refreshed embedded Island assets and the full suite on both architectures, including the existing 2× layout subset. The X11 jobs need `xsel`, a GTK location entry that owns PRIMARY after Select All, and focus on the verified dialog. Run the chooser on both the unpacked Xvfb path and the installed Openbox path. Confirm the measured caption bounds track the native frame at 1× and 2×. The arm64-only timing changes have local fixture coverage and await native execution.
