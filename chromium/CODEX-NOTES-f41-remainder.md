# F41 remainder handoff

Worktree: `~/Projects/BlancChromium158/s3-f41-remainder-codex`.
Branch: `chromium/s3-f41-remainder-codex`. Reference:
`913720f3c4db377c2410603fd8d7a678751dfa96` (S3.12).
Read its commit message and `chromium/CODEX-NOTES-group-space.md` first.

**Partial source implementation, not acceptance completion.** Task 1 is wired;
Tasks 2 and 3 stop at the uncertainty boundaries described below. No scenario
is recorded as passing. No native build, source application, acceptance runner
or browser launch was performed. Shipping sources, shared desktop steps,
STATUS, tracker and source-map were not changed.

## Task 1 — F41-78: New Space takes the group along

### What Claude must still do

Review the host purpose round-trip and adapter, then compile under the usual
guards and run the actual F41-78 DOM scenario. Recheck F41-75/76/77/79 and ordinary
single/several-tab New Space behavior. In particular inspect a renamed/deleted
or changed-membership group between opening and submitting the editor: native
`SpaceGroupRows` must refuse stale membership before a write. No new frontend
eligibility filter was introduced, as requested.

### Expected scenarios, not native results

| Scenario | Expected behavior / remaining limitation |
| --- | --- |
| F41-78 | Case-insensitive adapter lookup resolves the real native group ID; host opens the real Spaces editor with ordered member IDs and group name. Submit passes the remembered group ID to the existing write-first group batch engine. Reading should receive Research/sage and its two pages in order. Not run. |
| F41-75/76/77/79 | Existing move behavior is unchanged. This patch does not finish the separate missing clickable `openGroupSpaceMenu` noted in S3.12. Not run. |
| Single/several-tab New Space | No group argument when the current Spaces purpose has no group ID; existing ordinary batch behavior is retained. Not run. |

### Native / JS changes Claude must read before compiling

- `chromium/blanc/island/host.js`: `beginNewSpaceForGroup` resolves the group
  and its members from the current native snapshot, in snapshot strip order;
  only missing/empty groups return false. `show()` carries `newSpaceTabIds`,
  `newSpaceGroupId` and `newSpaceGroupName` into the existing real editor.
- `createSpaceWithTabs` reads `overlayPurpose.newSpaceGroupId` only in Spaces
  mode and sends it as the optional fourth `spaceMoveTabs` argument. Existing
  name validation, metadata commit and partial-move error handling are retained.
- `chromium/blanc/browser/ui/blanc_prototype_ui.cc`: removed the production
  refusal stub and its test-only name branch. Simplified the remaining
  `moveGroupToSpaceByName` branch to its sole two-argument path. No changes to
  the write/transfer engine. Read `SpaceGroupRows`, `SpaceRecordWithRows` and
  the `spaceMoveTabs` dispatcher: they already validate exact native membership
  and carry the source name/colour into the checked destination record.
- `chromium/tests/adapters/tabs.mjs`: group name lookup now calls `w.api`,
  reaching the actual Island document, rather than native-direct dispatch.
- `chromium/tests/tabs-adapters.test.mjs`: regression check for case-insensitive
  name-to-ID resolution, host API routing, and refusal of a missing group.
  It does not exercise the editor or C++.

## Task 2 — batch Recently closed: not implemented

### What Claude must still do

Resolve the restore-entry design before enabling batch-close. The proposed
single `CloseTabs(pages, CLOSE_CREATE_HISTORICAL_TAB)` call does not establish
one-shot batch undo in the inspected Chromium source. Do not add the host map
alone: that would advertise a destructive operation without its restore contract.
The existing `reopenClosed` adapter is already in `adapters/core.mjs`, calling
native `reopenClosedTab`; it needs no duplicate adapter.

### Expected scenarios, not native results

| Scenario | Expected behavior / remaining limitation |
| --- | --- |
| F41-60 | **Unimplemented.** Host still throws for batch-close before closing any pages. Must restore both split panes and the third page with one reopen, retaining split layout/focus. No acceptance run. |
| Related several-tabs persisted-session batch row | **Unimplemented.** No batch history record or durable batch association was introduced. Existing single-entry restore is not proof of a persisted batch. No acceptance run. |
| Selection containing grouped tabs / all window tabs | Unimplemented; needs group-preserving history plus a surviving Start Page without changing the intended history entry shape. |

### Investigation / native and JS paths Claude must read

Inspected the real sibling source under `../src/`, read-only:

- `chrome/browser/ui/tabs/tab_strip_model.cc`: `CloseSelectedTabs` calls
  `ExecuteCloseTabsCommand`, which marks complete groups for closing and
  delegates group destruction. `ExecuteCloseTabs` calls
  `CreateHistoricalSplitIfClosing` BEFORE `CloseTabs`. Calling `CloseTabs`
  directly skips that split-history hook and the command's group handling.
- `CloseTabs` itself filters closable contents and invokes `CloseWebContentses`.
  `WillCloseAllTabs` is emitted only when the filtered set is the entire strip;
  adding a fresh Start Page makes that condition false. It is not an arbitrary
  multi-selection history transaction.
- `components/sessions/core/tab_restore_service_helper.cc`:
  `CreateHistoricalSplit` adds one SPLIT entry; `CreateHistoricalTab` suppresses
  entries for that split's cached session IDs, but an unrelated selected third
  page still gets a separate TAB entry. Group/context closing have their own
  suppression. No general batch suppression was found in this path.
- `components/sessions/core/tab_restore_types.h` has TAB, SPLIT, GROUP and WINDOW
  entry types, with no generic selection batch. This does not rule out a safe
  extension, but it disproves assuming one close call implies one undo entry.
- Fork `PersistentSplitData` / `MarkPersistentSplit` and `RestoreBatchSplit`
  preserve split metadata in other flows; the existing reopen handlers restore
  one top-level restore-service entry, including special split metadata. They
  do not combine a split entry and ordinary-tab entries into one durable batch.

No close implementation was tried on live data, per the no-launch constraint.
Stopped after source tracing rather than inventing history aggregation, a fake
window/group, or a restore loop that could consume unrelated entries. A correct
follow-up must define ordering, unload cancellation, partial closes, restart
persistence and group/split metadata before exposing the destructive action.
There are no Task 2 production edits to compile.

## Task 3 — Open Link in Space: not implemented

### What Claude must still do

First resolve quiet saved-slot materialization on Space open. Then implement
native URL/source validation, visible/background creation, checked deferred
writes, resident placeholder alignment and rollback, host pending-link/editor
submission, error/announcement routing and the adapter. Read the shipping
reference for behavior only. A test entry alone would not make this feature
complete; no real page-link context menu or test-only substitute was added here.

### Expected scenarios, not native results

| Scenario | Required behavior / remaining limitation |
| --- | --- |
| F41-51 | Visible destination gets an awake background tab without either selection changing. Undefined: no `runLinkSpaceMenuItem` adapter/native link method. |
| F41-52 | Resident destination gets a quiet slot; opening the Space must not request it until selection. Undefined; eager slot materialization is the blocker below. |
| F41-53 | Closed destination gets only a checked saved record, surviving restart and remaining unrequested on opening until selection. Undefined; same materialization blocker. |
| F41-54 | Write failure adds nothing and opens `spaceLinkError` in Spaces. Undefined; no link write/error routing. |
| F41-55 | New Space works with only the current Space; fixed With this link editor saves without loading. Undefined; pending-link and submit path absent. |
| F41-56 | Failed save preserves draft/link and retry succeeds. Undefined; no link create path. |
| F41-57 | Failed resident creation removes only the new slot and restores the prior checked record. Undefined; no link rollback path. |

None of these rows was run or passed; the tables specify the remaining contract,
not fabricated results or blanket production refusals.

### Investigation / native and JS paths Claude must read

Read all of `src/main/space-open-link.js` and
`test/desktop/steps/open-link-in-space.steps.js`, the shipping main menu/open/
create/test-entry functions, feature text and all seven scenarios. Inspected
fork `HeldSpace`/`SpaceHold`, `SpaceRecordWithTab`, `SpaceMoveWrite/Written`,
`SpaceBatchWritten`, saved-record opening, `spaceReveal`, and overlay purpose
handling. No shipping code was copied.

The deferred-write plumbing is reusable, but the assumed quiet-slot opening
behavior does not exist in the inspected path:

- `HeldSpace` can contain vacant slots aligned with its saved record, and
  `SpaceBatchWritten` grows that vector. This alone does not create a selectable
  sleeping browser tab.
- In the saved-record opening path (around lines 6660–6715 at the reference),
  after retained-page recovery, a missing slot calls
  `chrome::AddAndReturnTabAt(browser, saved_url, -1, true)`. It creates a live,
  foreground URL load immediately, before final saved active-index restoration.
  Thus a vacant appended link slot would request the counted URL on Space open,
  violating F41-52 and F41-53 even if its initial write was perfectly quiet.
- `spaceReveal` gives held pages to a new window but skips null slots outright;
  it is not a record-backed quiet-placeholder materializer either.
- `SpaceRecordWithTab` stores url/pin/group and may replace a sole Start Page;
  it does not add pending-link title/asleep state. Reusing it without deciding
  deferred load representation would lose part of the link contract.
- Existing `overlay.js` already understands `spaceLinkError` and
  `newSpaceLinkTitle`; presentation is available, but host pending-source state,
  `createSpaceWithLink` and native operation are missing.

Stopped here rather than add a write-only approximation that silently loads the
link later, or broaden tab lifecycle/persistence with an unreviewed new sleeping
representation. No isolated visible-only implementation was added: it would
leave the common dispatcher/editor contract incomplete and could hide the
unresolved deferred semantics. The visible destination is straightforward;
the uncertainty is specifically deferred materialization and its persistence/
rollback invariants. There are no Task 3 production edits to compile.

## Verification and delivery

- `node --check chromium/blanc/island/host.js`: passed.
- `node --check chromium/tests/adapters/tabs.mjs`: passed.
- `node --test chromium/tests/tabs-adapters.test.mjs`: 5 passed, including the
  new adapter routing regression. No DOM/native behavior is established.
- `git diff --check`: passed.
- No build/apply, acceptance, native toolchain, app launch, ledger updates,
  shipping source/step edits, stash/reset or push.
- Changes are **uncommitted and unstaged**. No Git write/lock attempt was made;
  this is a review handoff, not a report of a locking failure.

Suggested review/commit boundaries: (1) Task 1 host/native-stub removal and
adapter/test, (2) this handoff covering the two unresolved designs. Every eventual
commit must end with `Co-Authored-By: Codex <noreply@openai.com>`.
