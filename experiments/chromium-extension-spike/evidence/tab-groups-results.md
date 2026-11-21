# Tab groups: Mac acceptance — October 16, 2026

Native build and group checks: `fd12eb2bd0962ca6c11cec199af84179b8ac2bbf`.
Base: `209cf9ecadcbcf0f0ba670094a3c48428f107bfe`.
Chromium: 156.0.8078.36, existing out/BlancPrototype on the Mac.

## Build

Guarded incremental build succeeded in **36.84 seconds, seven actual steps**. No cold rebuild, cache cleaning, toolchain change or competing build. A repeated prepare + guarded check reported **zero actions**.

The two header changes match the complete earlier include-fix patch. `chrome/browser/ui/tabs/tab_group_model.h` is valid in this pin. The native API calls and current GN dependencies compiled and linked successfully. Three GitHub workflows on this exact head (CodeQL, Parity guards, Unit tests) were completed successfully when checked.

## Native group acceptance on the unmodified head

Input was sent through macOS CGEvents; CDP supplied fixture setup and state observation. These are native-input checks, not renderer click simulation.

- `/group work` creates a group; `/group Work` reuses it; active-group pill dots match its three members.
- Header fold/unfold leaves the active tab unchanged.
- Search `wor` ranks the group first; native Return unfolds and activates its first tab.
- A loose tab can be dragged into a group and a member dragged back to loose tabs.
- Group-header drag reorders groups; Option+Shift+Up/Down works for headers and grouped rows in both directions.
- Dragging a pinned tab into a group is refused without changing pin/group state. `/group` on a pinned tab unpins and groups it.
- `/ungroup` removes membership; removing the last member removes the group.
- `/close-group` closes its member tabs. A separate fixture-only window with one two-tab group remains open with one New Tab after `/close-group`.
- Names, membership, order, collapsed flags and active URL survive quit/relaunch. Session-local tab/group IDs change, so persistence assertions compared semantic state.
- Cmd-1/2 select global first/second tabs. No saved-group bubble or browser crash was observed in these cases.

**Qualification:** after the group persistence restart, the overlay bridge failed to initialize (finding below). The group restore assertion passed, but native input did not. Reloading only the overlay restored it; `/ungroup` last-member and both `/close-group` cases were then tested on unchanged fd12eb2 assets. Do not describe the unpatched head as a clean startup pass.

## Startup race discovered during restart

The host loads `host.js` with defer, while `host.html` starts the strip and overlay iframe navigations immediately. Their synchronous `adapter.js` reads `parent.BlancPrototypeHost.api`. On the observed relaunch, host and strip APIs existed but overlay `browserAPI` was undefined. Cmd-L/native pill interaction could not initialize the panel. Reloading that iframe after the host was ready restored functionality.

The implicated host.html and adapter.js are unchanged from base 209cf9ec; this is an existing startup race exposed during acceptance, not a tab-group implementation regression.

The **assets-only** fix tested locally is preserved as [the tested patch](tab-groups-tested-startup.patch):

1. Change the strip and overlay iframe `src` attributes in `prototype/host.html` to `data-src`.
2. Immediately after assigning `window.BlancPrototypeHost` in `prototype/host.js`, set `strip.src = strip.dataset.src` and `overlay.src = overlay.dataset.src`.

The patch applies cleanly to fd12eb2b and passes JS syntax validation. It was applied to a separate frozen asset directory, **not to the Git worktree or branch**. Three complete app relaunches with those assets passed: both child bridges initialized; native pill click, typing, Escape, Cmd-L and typing worked; original New Tab preserved. No native recompilation was needed. These results validate fd12eb2b plus the supplied local asset patch, not a new repository commit.

## Electron differences / saved groups

- Grouping a pinned tab unpins it; pin-to-group dragging is refused.
- Cmd-number shortcuts retain Chromium global tab indexing (1 and 2 exercised).
- Electron's native Move to Group submenu is not reproduced (documented/source scope).
- Chromium saved the test groups automatically. Closing a group retained a closed saved record even though the Island no longer listed it. Ungrouping the final member removed the saved record. Product decisions on these differences remain with the owner.

## Cleanup and final app

Only the original New Tab remains. Favorites are unchanged (empty baseline). Removed eight exact fixture URL rows through Chromium's history manager; `/clear` was never used. Reopened and ungrouped only the recorded work/wholewindow fixture groups to remove their saved records; organizer reported no remaining saved groups. Diagnostic tabs and the fixture window were closed and the fixture server stopped. Six extension service workers remain present; this is a smoke observation, not a new extension compatibility run.

At completion of native testing, the prototype was left open using the permanent profile and `/private/tmp/blanc-pr867-assets-startup-fix`, with native binary fd12eb2b. The test run itself did not commit, push, post a GitHub comment/review, change ready state, or merge.

## Comparison with committed startup fix

The Mac review checkout was advanced cleanly to `0759e7f45bdc8a6a3f145f3bdbd0411bb9b6c062`. There were no tracked local fix edits to reset: the earlier patch had been applied only to a separate frozen asset directory. `host.html` is byte-identical to that tested copy; `host.js` differs only in whole-line comments and whitespace. The native source is unchanged from the successful fd12eb2b build. `prepare.mjs SRC --assets-only` succeeded; no native rebuild or additional native acceptance run was needed for this comparison. The three actual relaunch passes remain explicitly attributed to the equivalent local fix above.

## Committed evidence

- [Chronological Mac checks](tab-groups-run.json)
- [Native build log](tab-groups-build.log)
- [Groups and membership](tab-groups-groups.png)
- [Group and row reorder](tab-groups-moves.png)
- [Clean final window](tab-groups-final.png)
- [Exact locally tested startup patch](tab-groups-tested-startup.patch)

Non-fixture browsing-history rows and bulky favicons were omitted from the packaged JSON. The tested patch uses zero context (apply with `git apply --unidiff-zero`) to avoid whitespace-only context lines. Build-log trailing whitespace was normalized; diagnostics and timing were preserved. Local screenshot paths and session-local IDs in the chronological record are historical observations; use the committed links above for the packaged images. The earlier startup failure and overlay-only reload are retained rather than rewritten as passes on the original head.
