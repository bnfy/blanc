> Superseded focus finding: the native retest of a50eb2a1 passes. See favorites-focus-results.md. The earlier evidence below is retained as history.

# PR #858 — Mac build and native input results

Tested October 16, 2026 at commit `3d9fcd3c8711143c2ad9ee4c29f8315bd379e818`.

## Outcome

The latest changes build successfully. Native input testing found one reproducible remaining focus issue: browser shortcuts stop working when the auxiliary Island WebView owns focus. This is not a fully passing keyboard acceptance result.

### Remaining finding: Cmd-D and Cmd-L with Island focus

Reproduction on an ordinary HTTP page:

1. Click the page content. Cmd-D saves and unsaves the Favorite, updates the heart, and does not display Chromium's bookmark bubble.
2. Click the Island domain to open its address field, which receives keyboard focus.
3. Press Cmd-D. The Favorite state does not change.
4. Press Escape to close the Island, then Cmd-L. The Island remains collapsed.
5. Click the page content, then Cmd-L. The Island opens correctly again.

Repeated with the native helper changed to avoid reactivating an already active application; the same failure persists. Native text, Cmd-A, and Enter work in that address field. The failure is specific to browser shortcut routing/focus, not all keyboard delivery. Investigate accelerator handling for the auxiliary Island WebView and focus restoration when the overlay closes. No implementation fix was made in this verification pass.

Evidence: `cmd-d-with-island-input-focused`, `focus-shortcut-retest-without-reactivation`, `cmd-l-from-page`, and both `cmd-l-after-*` entries in the JSON evidence. Screenshot: `/private/tmp/blanc-native858-cmd-d-panel-focus.png`.

## Build

- Preserved the existing Chromium output directory, GN arguments, SDK, and compiler cache. No clean or cold rebuild.
- Guard initially planned 10 actions; actual build completed 16 steps in **57.54 seconds**.
- Repeated preparation was idempotent. Final guarded dry run: **0 scheduled actions**.
- Log: `/private/tmp/blanc-pr858-native-latest-build.log`.
- Review worktree remains clean; no commits or pushes made during this pass.

## Passing checks

Actual macOS keyboard/mouse events were generated through CoreGraphics. CDP was used for assertions and screenshots/state inspection, plus explicitly identified setup and cleanup operations.

| Check | Result |
| --- | --- |
| Cmd-D with the web page focused | Saves and unsaves; heart refreshes; no bookmark bubble. |
| Cmd-D with start-page content focused | Silent no-op; Favorites unchanged. |
| Cmd-D in a private HTTP page | Silent no-op; private heart controls hidden; no error banner; URL absent from regular history. |
| Collapsed and expanded heart buttons | Native mouse clicks save and remove Favorites. |
| `/save` typed with native input | Named folder creation, case-insensitive folder reuse, bare-save deduplication, and moving an existing node preserve the expected bookmark ID. |
| Invalid folder length | 101-character folder name does not save the test page. |
| `/favorites` and `/history` | Native typing and Enter open Chromium's respective managers. |
| Favorites/History footer buttons | Native mouse clicks open their managers. |
| Quick Switcher Favorite | Native query shows one local Favorite row rather than both Favorite and History; the separate search-engine row is intentional. Enter navigates correctly. |
| Quick Switcher history | Native query shows the unsaved history result; Enter navigates correctly. |
| Ledger, Shelf, Tally | Native Customize/layout clicks select each layout. While each page is actually visible, bookmark insertion/removal refreshes its displayed list without reload. For this observer test, mutations were made through `chrome.bookmarks` from the manager, not through simulated native input. |
| Start-page Favorite navigation | Native click on a rendered Favorite navigates; native Back returns to the start page. Billboard restored through the layout picker. |
| Late favicon | Saved a fresh-origin page using native Cmd-D before its delayed icon existed. Bookmark initially had no favicon, then received a PNG data URL after the icon arrived. |
| Full restart | Same-profile relaunch preserves bookmark IDs, titles, folders, history, favicon data, and the original user tab. Favicon reads are asynchronous immediately after launch; verification waited for their cache loads. |

### Non-Island popup observation

A native mouse click opened a `window.open(..., 'popup,...')` window. Cmd-D did not save its page or show a bookmark bubble. This is consistent with pinned Chromium's `CanBookmarkCurrentTab()` restriction to `TYPE_NORMAL` (`chrome/browser/ui/browser_commands.cc:2122`). This popup is not a valid test of a normal Chromium window's bookmark bubble, and no bubble-preservation pass is claimed.

## Evidence and cleanup

- Detailed chronological evidence, including failed harness attempts and later retests: `favorites-native-run.json`.
- Native Cmd-D screenshot: `/private/tmp/blanc-native858-cmd-d-on.png`.
- Visible layouts: `/private/tmp/blanc-native858-live-ledger.png`, `/private/tmp/blanc-native858-live-shelf.png`, `/private/tmp/blanc-native858-live-tally.png`.
- Favorite search: `/private/tmp/blanc-native858-favorite-search.png`.
- Final window: `/private/tmp/blanc-native858-final.png`.

Removed only the localhost test bookmarks, two empty test folders, exact test history URLs (including one test-generated search URL), and temporary tabs/windows. Both fixture servers stopped. Final regular Favorites list matches the empty baseline. The prototype remains open on the original `https://blanc.day/#switch` tab with the permanent profile and review assets.

Initial harness attempts exposed activation, duplicate-new-tab targeting, UI-label casing, and asynchronous favicon-loading assumptions. Corrected retests are recorded separately; those initial assertion failures are not additional product findings. The Island focus issue above remained after the relevant harness corrections.

This report is local. No new GitHub review or comment was posted as part of this build/test request.


Packaging note: related reports and JSON run records named above are committed beside this file. Other absolute `/private/tmp` paths identify supplementary local artifacts, not repository links.
