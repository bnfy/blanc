# F41 group-space handoff

Worktree: `chromium/s3-group-space-codex`. Reference:
`5c07b557ab5cac4a4c82b76e3f00e12441d9bba4`.

**Partial source implementation, not acceptance completion.** No Chromium build,
source application, acceptance runner or browser launch was performed. Shipping
sources, shared Island assets, STATUS, tracker and source-map were not changed.
No scenario is recorded as passing.

## What Claude must still do

1. Review the native diff before compiling. In particular review target group
   block ordering, held-slot alignment, partial transfer recovery and the
   existing `transfer-pane` rollback. Run guarded compilation and the real
   five `@group-space` cases; then exercise all four existing fault steps on
   grouped ordinary tabs and grouped splits, including an all-content group.
2. **F41-78 is unfinished.** `beginNewSpaceForGroup` is an explicit production
   refusal returning false; its test-only name resolver calls that refusal.
   It does not open an editor and cannot pass the scenario. The existing single
   tab entry is implemented in `chromium/blanc/island/host.js`, not native C++:
   `beginNewSpaceForTab` calls the private `show()` closure with a purpose.
   `runSelectedTabsAction('batch-space-new')` likewise constructs its purpose
   privately. Neither exposes an arbitrary group-purpose entry point. The
   overlay already recognizes `newSpaceTabIds` and `newSpaceGroupName`, but the
   host cannot supply them for a group through its current public interface.
   Its `createSpaceWithTabs` also drops group identity, calling the three-argument
   `spaceMoveTabs`. A future host bridge must bind the exact group/member IDs,
   pass its name to the editor, and submit through `spaceMoveGroup` (or the
   extended four-argument batch method) with create=true. Do not silently use
   the single-tab editor or turn every selected-tab move into a group move.
3. **The clickable group submenu is unfinished.** `overlay.js` already adds
   “Move Group to Space” when `wsWorkspaces.length` is nonzero, using the same
   list channel as the existing Spaces UI. However its click calls
   `browserAPI.openGroupSpaceMenu`, which the fork's `host.js` API does not
   implement. The production `spaceMoveGroup` dispatcher added here is callable
   through the native production bridge, but is not wired to that missing UI
   submenu. Native target choices, New Space, success announcement and error
   overlay presentation still need that host entry. Shared front-end files were
   left untouched as required. No DOM/rendering spike was run because app launch
   and acceptance execution are prohibited in this worktree task. F41-79's row
   presence is expected from source, not demonstrated.
4. After review/build, check crash/relaunch reads the actual checked disk record
   through `spaceSavedGroups`. Do not infer durability from the resident cache.
   Refresh canonical-source hashes under the normal review/application process;
   this task expressly prohibits editing `chromium/source-map.json`.

## Expected scenarios, not native results

| Scenario | Expected behavior / remaining limitation |
| --- | --- |
| F41-75 | The native group mover writes both URLs with the source name/colour before transferring either page. Held metadata exposes the checked group and live page IDs; source membership disappears when its final member leaves. Disk read projects persisted group indexes and colours after restart. Compilation, liveness and crash recovery remain unverified. |
| F41-76 | Case-insensitive merge keeps the target's spelling and colour. Its existing members precede arrivals. To satisfy Chromium's contiguous-group invariant, an existing middle group moves as a block to the end, keeping other tabs in order. Hidden slots and saved split columns follow that reorder. Unverified natively. |
| F41-77 | Existing write fault returns ok:false and movedCount:0 before live transfer, preserving the source group and colour. Unverified natively. |
| F41-78 | **Not implemented:** the production begin method explicitly returns false. Host editor-purpose and submission wiring remain missing as described above. |
| F41-79 | Existing shared overlay condition should hide the row before any Space exists and show it after saving One. No front-end edit or runtime observation. Row click remains unsupported by the host API. |

## Native changes Claude must read before compiling

All native changes are in `blanc/browser/ui/blanc_prototype_ui.cc`:

- `SpaceGroupRows` extends the existing `SpaceBatchRows` plan with an optional
  landing-group record. It checks the exact source-order membership, rejects a
  split expansion that would move another group's member, and captures visuals.
  The same check runs again after the checked target write; membership, URLs,
  split metadata or group visuals changing refuses transfer.
- `SpaceRecordWithRows` retains the original ungrouped behavior for ordinary
  batches. Tagged rows merge the first case-insensitive destination name or
  append a fresh group record, then tag every arriving tab. Existing matching
  members move together before the arrivals; active index and splitIds are
  reordered with their pages. `ValidSpace` remains the final admission gate.
- Production `spaceMoveGroup(groupId, spaceId, create)` resolves the whole group
  in native strip order and dispatches into the existing batch method. The
  batch method accepts an optional fourth source group ID; its original three
  arguments remain unchanged. No second disk/rollback engine was introduced.
- `SpaceBatchWrite/Written` carry the group ID through their existing callbacks.
  The `write`, `transfer`, `transfer-pane` and `rewrite` fault names and their
  control-flow locations remain unchanged. Shown destinations receive native
  group membership after each complete row; existing destination visuals win.
- Mid-pane return now saves source visuals and can recreate a disappeared
  source group before restoring the split, instead of adding to an absent ID.
  Chromium removes an empty source group through the existing RemoveFromGroup
  calls. **Extra native review required:** group/pin/position restoration still
  relies on TabStripModel's grouping/move behavior and has not been compiled.
- `HeldSpace` caches its logical Space record, because hidden-strip pages are
  intentionally ungrouped by the existing set-aside architecture. It is filled
  when setting aside a Space, after a single-tab arrival, and from the batch's
  actual arrived rows. Matching held slot blocks reorder with their record.
  `spaceMeta` exposes heldGroups and per-slot groupId from that logical record;
  liveness still comes from the actual held WebContents. Groups are physically
  restored by the existing saved-record application when opening the Space.
- `CaptureNativeSpace` already stores native group name, enum colour and
  collapsed state with tab group indexes. No change to that capture was needed.
- The test-only name resolvers do case-insensitive lookup, then call production
  dispatch. `spaceSavedGroups` shares `spaceSavedUrls`' on-disk read and returns
  `{urls, groups, groupIds}`; numeric group indexes are local to each record,
  colours are projected through the existing GroupColor mapping.
- `beginNewSpaceForGroup` is a documented refusal stub, not a finished feature.

## Harness changes

Only `chromium/tests/adapters/tabs.mjs` changed. Added the two name adapters,
`workspaceAction('saved-groups')`, and resident groups projected directly from
native `spaceMeta.heldGroups`. No shipping steps, World overrides, synthetic
menu rows or fabricated success results were added.

## Open limits and uncertainties

- This is not a fully UI-reachable feature until the host submenu/editor gaps
  above are resolved within an approved scope. The five cases cannot all pass.
- Partial transfer follows the existing batch engine: completed rows stay moved,
  incomplete rows stay in the source, and recovery rewrites only arrived rows.
  A failed recovery write retains the full write-ahead record. This is existing
  batch behavior, not an all-or-nothing group transaction. Review this explicitly
  against the intended product contract before promotion.
- New group creation into a shown destination and merges into a middle group
  require native review of active tab, collapsed state and split focus. The
  physical hidden strip remains ungrouped by design; resident identity is the
  logical checked record, not an invented TabStripModel group ID.
- Held metadata is a cache. Actual disk assertions use the independent disk read.
  Closing a held page externally can leave a vacant logical slot, as before;
  record/group projection does not claim that such a page is live.
- Native compilation and crash restore, including source autosave/session
  bookkeeping after moving the entire group, remain unverified.

## Verification and delivery

- `node --check chromium/tests/adapters/tabs.mjs`: passed.
- `node --test chromium/tests/tabs-adapters.test.mjs`: 4 passed. These existing
  projection tests do not exercise the new C++ or prove group-space behavior.
- `git diff --check`: passed.
- Native compilation/build, apply.py/build.mjs, acceptance runner and browser
  launches: not run, as requested.
- Changes are **uncommitted and unstaged** for review; no Git write/lock attempt,
  push, stash, reset or destructive operation was performed.

Suggested review/commit boundaries: (1) tagged batch planning/transfer and held
record projection, (2) name/disk adapters and this handoff. Resolve the unfinished
UI/editor scope before claiming feature completion. Every eventual commit must
end with `Co-Authored-By: Codex <noreply@openai.com>`.
