# Quiet Tabs handoff — stopped at the upstream-change boundary

2026-11-07, branch `chromium/s3-quiet-tabs-codex`, starting at `7c30ad53`.
This is an incomplete implementation, with no native-build or acceptance credit.
Read the brief, repository AGENTS.md, S3 status entries, committed failing run,
and the step file and fixture server at the pinned shipping reference
`6479ed3a314e4fd6219b8de1598bacffa78b4d7c`.

The brief requires: **“If a real upstream Chromium change seems necessary,
stop and write it up in your notes instead of attempting it.”** Investigation
reached that boundary. No upstream copies, patches, native sources, STATUS.md,
tracker.json, spec, shipping steps, Electron sources, build outputs or caches
were changed. No native build, apply/sync script or acceptance runner ran.

## Changes ready for review

- `tests/adapters/tabs.mjs`: existing `sleepTab` and
  `sleepBackgroundTabsNow` now call the app shim's existing `releasePages()`
  before the production quiet APIs. No eligibility bypass or test-only discard.
- `tests/adapters/core.mjs`: `openPanel` releases page inspection connections
  before opening the real panel, including the `/sleep` keyboard flow.
- `tests/quiet-tabs-adapters.test.mjs`: two regression tests establish that
  detach precedes dispatch, including the actual panel entry point.

`executeTab` lazily attaches CDP to the page and leaves that connection open.
The pinned Chromium `DiscardEligibilityPolicy::CanDiscard` protects a page
whose live-state decorator reports `IsDevToolsOpen()`. The shim already documents
this and supplies `releasePages()` for Spaces. Quiet adapters did not use it.
The regular and private Given steps both inspect sessionStorage, so both leave
the candidate attached. This explains a concrete harness protection, but the
exact runtime refusal reasons still need native observation after detaching.
Do not interpret the saved run's `false` as evidence of a private-only gate.

## Upstream blockers

### F31-8: the replacement is born in the window's profile

`upstream/chrome/browser/resource_coordinator/tab_lifecycle_unit.cc:270`,
`TabLifecycleUnit::FinishDiscard`, creates replacement contents using:

```cpp
content::WebContents::CreateParams create_params(tab_strip_model_->profile());
```

Blanc's `private/private_tabs.h` explicitly permits off-the-record contents in a
regular window. Its window profile is therefore the wrong BrowserContext for
that private tab. Patch 0017 only adds inherited sandbox flags to this creation;
none of the current patches changes the profile expression. The function then
copies the old navigation controller into those replacement contents.

Consequently a successful private discard through this path risks a context
mismatch or a wake in the regular session. `PreserveDiscardedTabState` even
refuses a cross-context replacement; changing MediaHistory's `known()` flag
cannot repair the underlying creation. This is source evidence of a separate
private lifecycle defect, not an observed explanation of the saved run's first
refusal. Do not relax the private eligibility checks to make the run green.

The upstream fix needs review of replacement creation using the **old contents'
BrowserContext**, namespace ownership during `CopyStateFrom`, tab helpers,
private session/history exclusion and wake/back/redirect behavior. Test both
in-window private tabs and ordinary incognito windows. Keep the inherited
sandbox propagation. The brief forbids making this patch here, so none was made.

### F31-9: native session writes retain page state

`upstream/components/sessions/content/content_serialized_navigation_builder.cc:40`
copies `entry->GetPageState().ToEncodedData()` unless `EXCLUDE_PAGE_STATE` is
requested. The session rebuild in `SessionServiceBase::BuildCommandsForTab`
uses default serialization for committed entries. The foundation patch requests
`EXCLUDE_PAGE_STATE` only for the initial pending-navigation fallback, not for
ordinary committed history. A quiet tab retains its controller, so its state
is eligible for the same normal session serialization.

F31-9 requires the secret-bearing recovery state to remain only in memory.
Returning a URL-only projection from a new `persistedSessionData` adapter would
hide this defect. An upstream change must cover both incremental writes and
session rebuilds, plus Recently closed and any native sync serialization, while
preserving in-memory wake recovery. Checking only one writer is insufficient.
No fake persistence/sync adapter was added, and the existing explicit undefined
adapter was retained. This requires a reviewed persistence policy, not merely
a test seam.

## F31 accounting

| Row | Work and remaining adapters / behavior |
| --- | --- |
| F31-1 | Existing quiet dispatch now detaches CDP. `navigateTab`, `tabNavigation`, `sleepState`, `wakeTab` with redirect and `wakeTabAtIndex` remain undefined. Native discard retains navigation history but has no shipping-style 512 KiB page-state fallback; do not report `droppedPageState: true` without implementing it. The pinned fixture server already supplies history pages, `nostore=1` and the `redirect-start` redirect. |
| F31-2 | Existing direct/manual dispatch now detaches CDP; the native active-tab guard is unchanged. `setSleepThresholdOverride`, `runSleepSweep` and `sleepState` remain undefined. A sweep adapter must invoke the existing native AutoTick/AutoNext machinery rather than reimplementing the manual loop. |
| F31-3 | Existing manual dispatch now detaches CDP. `setQuietProtection`, `armBeforeUnloadObjection`, `tabListenerState`, `beforeUnloadProbe`, `sleepState` remain undefined. The pinned fixture server already supplies draft input, checkbox, POST form and 5000 px scroll area. Media, opener and pending-permission adapters must create actual native conditions. The objection assertion expects Electron's synthetic close event/listener counts; Chromium proactively skips beforeunload-bearing frames, so inventing an observed unload event would be false. The stored-handler case can use real page JS. No protection fields were seeded or gates relaxed. |
| F31-4 | The real `/sleep` panel path now detaches inspected pages. Existing overlay code already clears the command, keeps the panel open, and provides the zero-result status notice. `addressCommandNotice` remains undefined. No UI duplication. |
| F31-5 | Existing quiet dispatch now detaches CDP. The panel and rail already apply `.quiet`, append the localized quiet suffix and use matching `.5` resting opacity, restored on hover/focus. Dots deliberately lack quiet class/name. `quietChromeState`, `clickIslandDot`, `quietRowDimStyles` remain undefined; these must read actual DOM, layout and ancestor opacity. No styling rewrite was justified by failures that stopped before those assertions. |
| F31-6 | `setTabSleep` and `tabSleep` remain undefined. Existing production `quietDelay` persists the real pref; the Settings dialog already uses it. RegisterMessages starts a recurring 30 s AutoTick timer; AutoNext probes real background candidates, checks AutoDue again after the probe, and calls CompleteQuiet. Off aborts future sweeps without waking quiet tabs. The acceptance examples manually quiet before choosing a delay, so they alone do not prove timed auto-quiet. No replacement scheduler was added. |
| F31-7 | `createQuietTab` remains undefined. It must drive the native lazy-restore path; creating then discarding a live fixture would not prove lazy restore. `adapters/state.mjs` currently always assigns numeric `webContentsId`, even for discarded tabs; a native renderer-liveness observation is needed to map shipping's logical viewless state honestly. |
| F31-8 | Existing dispatch now releases inspection connections, but private context preservation is blocked on the upstream lifecycle defect above. No speculative MediaHistory relaxation. Private wake/sessionStorage, history and namespace continuity remain unverified. |
| F31-9 | Blocked on upstream persistence policy above. `persistedSessionData` already throws an explicit undefined error; `sessionSyncSnapshot` and `sleepState` remain undefined. Existing `serializedTabsPayload` reads the actual host payload and was left intact. No invented empty persistence/sync surfaces. |
| F31-10 | Existing quiet dispatch now detaches CDP, permitting Chromium's real discard checks to decide. `tabProcessCount` and `sleepState` remain undefined. Count actual OS renderer processes, not targets or rows; a discarded tab can still own a DevTools target. An isolated loopback fixture may share a site process, so the required decrement must be proved on the candidate. Ordinary sessionStorage fixture behavior was preserved. |

No new HTTP fixtures or hook names were added before the stop boundary.
Unknown media/provenance remains fail closed. Spaces and batch quiet production
functions are untouched; no private or ordinary production behavior changed.
The generic panel adapter now releases harness connections; verify unrelated
panel scenarios when acceptance is allowed again.

## Checks and delivery limitations

- The two added regression tests pass.
- `python3 chromium/tools/check-patches.py` passes: 128 upstream files,
  441 custom files; patch reconstruction only.
- `node chromium/tools/progress.mjs --check` passes.
- `git diff --check` passes.
- Full unit suite under `/usr/local/bin/node` v22.14.0: **251 pass, 2 fail**
  (253 total). Both failures are existing loopback sync tests blocked by
  `listen EPERM: operation not permitted 127.0.0.1`:
  `two devices pair and sync a Favorite both ways` and
  `a pairing code survives the save after its own call`.
  Full TAP output: `/tmp/blanc-quiet-tabs-unit.tap`.
  The first run used PATH's Node v20.19.0 and also failed the UI-language test
  because `stripTypeScriptTypes` is unavailable there. Using the existing
  Node v22.14.0 resolved that runtime mismatch; no test was altered or skipped.
- Git staging failed before any index write: `Unable to create
  .../repo/.git/worktrees/codex-quiet-tabs/index.lock: Operation not permitted`.
  The environment prohibits approval escalation, so no commit was created.
  `git diff --cached --stat` was empty. No push/merge/rebase/stash/reset was run.
  `node_modules` was left as the pre-existing untracked symlink.

Suggested single reviewable implementation commit once Git is writable:
`test(chromium): release page DevTools before quiet actions`, with the required
`Co-Authored-By: Codex <noreply@openai.com>` trailer. Stage only the two adapter
files and their new test; commit these notes separately. The remaining task
needs Claude/owner resolution of the brief's upstream-change boundary.
