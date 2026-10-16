# PR #858 — Island keyboard-focus fix verified on macOS

Tested commit: `a50eb2a1c062c173e7c216960b26b3b3d830a2a2` (October 16, 2026).

The two focus failures reported against `3d9fcd3c` are resolved in this build. The previous report accurately described Cmd-D doing nothing with the Island address field focused; it was not merely a stale heart repaint.

## Build

- Guarded plan: one compile action. Actual incremental build: **7 steps in 36.54 seconds**, successful.
- Existing output directory, arguments, SDK, compiler, and icon cache preserved. No cold build or cache reset.
- Repeated preparation reused the icon, and the final guarded check scheduled **zero actions**.
- Eight build-guard tests, changed JavaScript syntax checks, and `git diff --check` passed.
- Build log: `/private/tmp/blanc-pr858-focus-build.log`.
- Review worktree is clean; no implementation edits, commits, or pushes were needed.

## Native input results

These actions used macOS CoreGraphics keyboard/mouse events. CDP read assertions and attached observation listeners; it did not invoke the tested commands or synthesize renderer keyboard events.

| Check | Result |
| --- | --- |
| Cmd-D with the open panel's address input focused | Saves and unsaves the current page; the active tab's bookmarked state and heart update. Panel remains open and the address input retains focus. |
| Escape, then Cmd-L, with no intervening page click | Closes and reopens the Island with the address field focused. |
| Escape restores page typing | Focused a fixture input and typed `initial`; opened the Island with Cmd-L, pressed Escape, and typed `-returned`. The page input contained `initial-returned` and remained the active element. |
| Cmd-R from the open panel | Reloads the active content page; its `performance.timeOrigin` changed. |
| Cmd-[ from the open panel | Navigates from the second fixture page back to the first. |
| Extension popup focus | Native click opened Extensions; native typing selected Bitwarden and Enter opened its actual popup. The popup reported `document.hasFocus() === true`, and a native Tab key produced an `isTrusted` keydown inside the popup and focused a button. No sign-in, vault operation, or default-password-manager approval was performed. |

The native focus suite completed without failed assertions. The larger Favorites/history/private-window/layout/persistence checks from the previous pass remain documented in `favorites-native-results.md`; this pass specifically verifies the focus fix and affected extension path.

## Evidence and final state

- JSON: `favorites-focus-run.json`.
- Cmd-D screenshot: `/private/tmp/blanc-focus858-cmd-d-on.png`.
- Final screenshot: `/private/tmp/blanc-focus858-final.png`.

The application was running without open page targets before relaunch. Its existing profile restored one New Tab; that restored tab was recorded as the baseline and preserved through testing. Only the two localhost fixture pages and their exact history visits were removed. Favorites match the empty baseline. The fixture server was stopped, and the completed prototype remains open using the permanent profile and review assets.

No new GitHub review or comment was posted during this verification pass.


Packaging note: related reports and JSON run records named above are committed beside this file. Other absolute `/private/tmp` paths identify supplementary local artifacts, not repository links.
