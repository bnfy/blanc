# F41 tab-selection handoff

Worktree: `chromium/s3-tab-selection-codex`. Reference:
`6479ed3a314e4fd6219b8de1598bacffa78b4d7c`.

This is source implementation and unit evidence only. No Chromium build,
source application, sync, acceptance runner, browser launch, upstream patch,
shipping source, STATUS or tracker change was made. Claude must compile and
run the native acceptance cases before recording any scenario as passing.

## Delivery limitation

Git could read this worktree but could not create
`repo/.git/worktrees/codex-selection/index.lock` (`Operation not permitted`).
Consequently these changes are **uncommitted and unstaged**, despite the task's
requested commits. No push, merge, rebase, stash or hard reset was attempted.
The pre-existing untracked `node_modules` symlink was left alone.

Suggested review/commit boundaries (stage explicit paths or hunks and check
`git diff --cached --stat`):

1. Selection lifecycle, pinned shipping step loading, selection adapters and
   selection model tests.
2. Native memory-only batch actions, host/menu actions and menu/action tests.
3. Native write-first batch Space moves, new-window moves and editor binding.
4. Updated source/asset hashes and this handoff.

Every commit should end with `Co-Authored-By: Codex <noreply@openai.com>`.

## Expected scenarios, not native results

| Scenario | Expected behavior / remaining limitation |
| --- | --- |
| F41-58, panel and side | Modifier-clicking the first two rows selects all three, leaving the third current. Escape clears selection. The persisted-session assertion remains **undefined**: the existing `persistedSessionData` adapter refuses to invent a session.json view over Chromium SNSS. Thus the scenario cannot finish yet, even if its UI checks pass. |
| F41-59 | One native request pins every selected page and clears selection. |
| F41-60 | Whole-split selection should work and leave the third page current. **Undefined at batch-close**, because one Recently closed batch entry restoring the split and the other tab is not implemented. Close Tabs is visibly disabled. |
| F41-61 | One checked target-record write precedes moving all three live pages, in source order; success clears selection. |
| F41-62 | Both panes move as one row. The target record carries split membership, ratio and focused pane; opening it rebuilds the split around the original live pages. |
| F41-63 | The write fault returns `ok:false, movedCount:0`, transfers no page and retains the entire selection. |
| F41-64 | Transfer fault is consumed after the first complete row arrives. Expect `moved-partly, movedCount:1`, retaining the other two selected pages. A failed recovery write keeps the full write-ahead record, including all three URLs. Crash/relaunch acceptance remains uncertain because of the pre-existing crash-restore/fixture-start issue described in STATUS S3.10. |
| F41-65 | The transfer fault refuses new-window creation before detaching any tab; the three original tabs and selection stay put. |
| F41-66 | Shift-click spans the visible rows from the first toggle's anchor and includes the current third tab. |
| F41-67 | Create the new window before detaching; move pages in order, restore groups/pins and rebuild selected splits. The new window has exactly the selected pages; the source keeps its other tabs or one Start Page. |
| F41-68 | New Space opens the existing editor with `newSpaceTabIds` and its “With these tabs” start line. Submission writes all selected pages together, then moves them live; it never switches this window into the new Space. |
| F41-69 | New Group binds the complete selection to `/group`. Submission validates every member, performs one native group operation and clears selection. |
| F41-70, panel and side | Shift+ArrowDown from the first toggled row extends through the second and includes the third current page. |
| F41-71 | Quiet each eligible page independently. Keep the ineligible current third tab selected; announce the successful/total counts. Each refusal is retained, and the action returns false when any member did not quiet, as shipping does. |
| F41-72 | One native turn mutes every selected page and clears selection. |
| F41-73 | `transfer-pane` fails after moving the first split pane. Return that pane, restore its group/pin/position and rebuild the whole source split; return `movedCount:0` and retain all three selected IDs. |
| F41-74 | Consume a transfer fault after the complete final split row arrives; recognize that every selected ID arrived and return success, clearing selection. |

## Native changes Claude must compile

All native changes are confined to `blanc/browser/ui/blanc_prototype_ui.cc`:

- `CanMoveTabToSpace(..., batch)` permits the all-selected-tab case; the batch
  path creates a source Start Page only once an actual transfer can begin.
  The single-tab path retains its old only-tab restriction.
- `BatchPages` validates all IDs, resolves source order and expands persistent
  native splits whole. It refuses transient Glance splits.
- `SpaceBatchRows`, `SpaceRecordWithRows` and `RestoreBatchSplit` describe drawn
  rows, append their URLs and split columns to a valid native Space record,
  and rebuild the native split, including ratio/focus. Saved split IDs keep the
  required sequential `split-N` format.
- `spaceMoveTabs` and `SpaceBatchWrite/Written/Rewritten/Reply` implement one
  checked write before any transfer, post-write source revalidation, source
  busy state across asynchronous disk work, transfer to a shown target or the
  profile's existing hidden SpaceHold, whole-row failure recovery, moved counts
  and checked recovery writes. The last-arrived row counts as success.
- `spaceMoveFault` recognizes `transfer-pane` only on the existing acceptance
  test channel. The fault is exercised after the first native pane transfer,
  followed by a real return to the source, not a fabricated test result.
- `batchTabsMenuState` reports native placement/group/quiet/copy eligibility.
- `batchTabsAction` implements pin, mute, group-by-name, existing-group,
  ungroup, clipboard copy and new-window transfer. Pinning uses the native
  context command for whole splits. Memory edits validate first and execute
  synchronously. New-window allocation/fault checking happens before any
  detach; group/pin/split records are carried to the new window.

No native build or compiler check was run, per the task's hard rule. Pay
particular attention to the pane rollback, native grouping/pinning behavior,
source/target focus and session bookkeeping in the guarded build and tests.

## Host, UI and harness changes

- Reuse the existing pure selection module and existing row gestures/styles.
  Clear selection on ordinary row activation and a successful Space switch.
  Preserve newer user selection across asynchronous quiet/move responses.
- A selected row opens the dedicated several-tab menu; an unselected row
  replaces selection and opens the ordinary menu. The resting pill stays on
  the current tab's ordinary menu. Menus use localized labels and checked
  Space/group choices.
- New Group and New Space pass the complete bound selection into the existing
  editors. Quiet/reload retain unsuccessful members. Copy writes all supported
  links once and clears selection.
- Load the pinned `tab-selection.steps.js`; its imports were all already
  audited and present in the loader allowlist (assert, overlay, tab-drag, poll).
- Add `selectTabRows`, `selectedTabIds` and supported batch-action adapters.
  Unsupported batch actions throw `UndefinedNativeAdapterError`.
- Preserve the previously current tab in `makeSplit`: shipping's fixture
  creates a background split without activating it; the fork's product
  `createSplit` activates the initiating pane. The adapter explicitly restores
  the previous page through the real host API.
- Refresh only affected island-asset and canonical-source digests. No candidate,
  baseline, patch, STATUS or tracker identity was promoted.

## Open limits and uncertainties

- **Batch close/restore:** not built; the action adapter stays undefined. A loop
  of single-tab closes would fail the one-entry and split-restoration contract,
  so it was not substituted. A native batch historical entry/restore design is
  needed before enabling Close Tabs. Extending Chromium's historical entry
  types may require an upstream change; no such change was attempted under
  this brief's upstream prohibition.
- **Persisted session read:** existing adapter remains undefined. Selection
  exists only in the host closure and snapshot payload, with no persistence
  write, but no actual SNSS inspection was added. Do not claim the persistence
  acceptance assertion passes from that source inspection.
- **Pinned groups:** Chromium still cannot keep a pinned tab in a group. A
  batch group action refuses the whole set if grouping would silently unpin a
  member. This is a known fork limitation rather than shipping parity; changing
  Chromium's grouping model is outside the permitted upstream scope.
- **Split scope:** this fork's existing two-pane side-by-side split only.
  Grouped pins, more panes, and other layouts are not supplied by this work.
- **New-window fault:** allocation is moved before detachment. The acceptance
  fault exercises a failure before allocation, not an exception after a detached
  pane. There is no injected mid-insertion new-window failure path.
- **Native behavior:** compilation, page liveness, exact focus, real row input,
  session durability and crash recovery await Claude's native runs. Unit menu
  tests use a small DOM harness; they provide no browser rendering evidence.

## Verification

- Focused selection/model/host/menu tests: **17 passed**.
- Full requested unit glob, using `/usr/local/bin/node` **v22.14.0**:
  **242 tests, 240 passed, 2 failed**. Both failures are existing loopback-server
  tests blocked by this sandbox's socket policy (`listen EPERM: operation not
  permitted 127.0.0.1`): “two devices pair and sync a Favorite both ways” and
  “a pairing code survives the save after its own call”. They were not skipped,
  weakened or changed. The full suite is therefore **not green** in this sandbox.
  Full output: `/private/tmp/blanc-tab-selection-final-tests.log`.
- The default PATH selects Node v20.19.0, which also lacks
  `node:module.stripTypeScriptTypes` used by an existing language test. Node 22
  resolves that environment failure without altering the test.
- `python3 chromium/tools/check-patches.py`: **passed**, 128 upstream files and
  441 custom files; reconstruction only, no compile/runtime credit.
- `node chromium/tools/progress.mjs --check`: **passed**, “Generated progress is
  current”; STATUS and tracker remained untouched.
- `git diff --check`: **passed**. Host and menu JavaScript syntax checks pass.
- All Gherkin steps in F41-58 through F41-74 resolve from the loaded pinned
  definitions, checked without launching a browser. This does not make the two
  deliberately undefined runtime adapters above implemented.
- Native build and acceptance: **not run**, as explicitly required by the brief.
- Git commit: **blocked by sandbox index.lock write denial**; all listed source,
  manifest, test and notes changes remain uncommitted for Claude's review.

## Review follow-up (2026-11-07)

- #7: Map native refusal to Busy and preparation failure to activation-failed before returning an unsaved New Space result. Added editor-error regression coverage.

- #6: Menu closures copy their displayed IDs into the action request. The host
  refreshes and compares membership before acting, reports tabsSelection.failed
  on any shrink/replacement, and binds New Group directly to beginGroupTabIds
  (including a single surviving explicit ID). Tests cover empty, smaller and
  replaced selections, and binding a single selected tab instead of the active tab.
- #9: Mark a context-menu replacement as such and carry that provenance through
  selection pruning/refresh. The adapter keeps that selection on the ordinary
  menu until an explicit selection gesture replaces it. This preserves whole
  split selection rather than introducing a partial split into selectionState.
  A new test runs the actual host prepareTabMenu and adapter twice, with Escape
  between right-clicks; another checks provenance across pruning and gestures.
- #10: The pill fixture now runs index.html, opens the Island and dispatches into
  a separate overlay fixture whose active tab belongs to the existing selection.
  It asserts both blancSingleTabMenu and the resulting ordinary menu.
- #8: Native menu state supplies canMutate only for a complete resolved selection
  outside a Space operation; Pin and Mute use it. A busy-menu test guards both.
- #11: Added CanPlaceBatchTab for in-memory grouping and window moves. It retains
  private/capture/audio/popup guards but permits quiet, loading, Start Page,
  file and other non-http(s) pages. SpaceBatchRows uses this only for new-window;
  spaceMoveTabs and its write/revalidation paths retain Space eligibility.
  canMove now controls new-window/ungroup/group-menu placement, independently
  of canPlace for Spaces. A menu regression checks this distinction.
  Chromium's existing inability to group pinned tabs remains explicit; this
  fixes Space-record eligibility, not that previously documented limitation.
- #4: Unpin walks the captured pages in reverse, then places ungrouped rows at
  the end in original source order. Splits move whole via MoveSplitTo, once at
  their leading pane. Pin and mute retain forward order. The new regression
  executes the native mutation-loop text after a small syntax translation
  against a strip double with Chromium's pinned-boundary behavior: selecting
  A/B from pinned A/B/C followed by D produces C/D/A/B. This is a unit model,
  not compiled C++ or native TabStripModel execution.
- #5: Capture the source active page before any transfer, falling back to the
  first row's saved focused pane only when the active page is not moved.
  Activate it before rebuilding splits, so RestoreBatchSplit restores the right
  active page and cannot overwrite a background split's saved focus with the
  first inserted pane.
- #1: Scan the destination for its actual regular Start Page and remove it only
  when it is the sole non-private tab. A private active tab is never the
  deletion candidate; a private-only destination has no candidate at all.
  Only activate the incoming row when the deleted Start Page was active.
- #2: SpaceHold::RemoveBlankSlot validates the actual sole held page before
  forgetting a replaced blank slot. Both single and batch Space moves use it
  before appending pages. Missing/dead slots can be dropped; an unexpected live
  non-Start Page refuses the transfer rather than being deleted. Empty/new holds
  remain valid. Thus held pages align with the record after blank replacement,
  including split row indexes. A zero-arrival rollback can reload its blank
  from the restored record.
- #3: Remove the temporary source floor on every incomplete transfer when another
  source page remains, including partial progress and pane rollback. Complete
  all-tab transfers retain their required floor.
- #12: Every saved batch reply now carries tabCount from the persisted record.
  Successful recovery uses the rewritten count; failed recovery uses the original
  write-ahead record's count, not the number of moved pages. New Space stores
  that value. Tests cover complete, partial, zero-move and failed-rewrite replies.

No finding was rejected as a false positive. Refreshed only the changed
canonical source/Island asset digests; upstream patches and copies are unchanged.

### Follow-up verification and delivery

- Focused tests: 26 passed, including the new #4 and #9 regressions.
- Full required glob with /usr/local/bin/node v22.14.0: 251 tests, 249 passed,
  2 failed solely on loopback listen EPERM in the existing sync pairing tests.
  Log: /private/tmp/tab-selection-unit-node22.log. No failures were skipped or
  weakened. The default PATH's Node 20 also lacks stripTypeScriptTypes; the
  Node 22 run resolves that tooling mismatch.
- python3 chromium/tools/check-patches.py: passed (128 upstream files,
  441 custom files), reconstruction only.
- node chromium/tools/progress.mjs --check: passed.
- Native compilation/build, application/sync, acceptance runner and browser
  launches: not run, per the brief. Real split focus, held-page alignment,
  partial-transfer cleanup and native pin ordering still need Claude's build
  and acceptance verification.
- Git could not create repo/.git/worktrees/codex-selection/index.lock:
  Operation not permitted. No follow-up commit or staging succeeded.
  The branch still starts at 60ca746c; the pre-existing node_modules symlink
  remains untouched. This is the same delivery restriction noted above.

Suggested follow-up commit boundaries, once Git writes are available:
#7 editor errors; #6 bound menu actions; #9/#10 menu identity and regressions;
#8/#11 eligibility; #4 unpin ordering; #5 new-window focus; #1/#2 blank target
handling; #3 source floor cleanup; #12 persisted counts. Include corresponding
notes/tests and current source/asset digests in each commit, stage explicit
paths/hunks, inspect git diff --cached --stat, and end every message with
Co-Authored-By: Codex <noreply@openai.com>.
