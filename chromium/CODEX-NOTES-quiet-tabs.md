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

## Continuation implementation — 2026-11-07

Worktree `codex-quiet-tabs-2`, branch `chromium/s3-quiet-tabs-codex2`, base
`e018c4e6`. Read the continuation brief, the preceding investigation, the
saved failing run and pinned shipping steps/fixture server. This is source
implementation awaiting Claude's native build and acceptance, with no runtime
credit. No native build, acceptance runner, apply/sync script, upstream copy,
patch, spec, shipping step, Electron source, output or cache was touched.
STATUS.md and tracker.json remain unchanged.

### Scenario work

- **F31-1:** `navigateTab`, `tabNavigation`, `sleepState`, `wakeTab` and
  `wakeTabAtIndex` now use the native navigation controller. The history
  observation never attaches page DevTools or wakes a discarded page. Indexed
  wake uses `GoToIndex`/`LoadIfNecessary` before activation. The shipping server
  already serves the actual history pages, redirect-start redirect, POST/form
  controls, scroll area and ordinary sessionStorage load counter; it is loaded
  unchanged from the pinned reference. Oversized history state is created by
  the unchanged step's real `history.pushState` (600000 characters), not a new
  fixture seam. **The first scenario cannot honestly pass its unchanged
  `droppedPageState === true` assertion:** Chromium retains the page state and
  this adapter reports false. The brief also forbids inventing a 512 KiB
  fallback. No assertion was relaxed or unapproved divergence registered.
- **F31-2:** `setSleepThresholdOverride` sets a test-build-only delay used by
  the existing `AutoDelay`; `runSleepSweep` calls the production `AutoTick` /
  `AutoNext`, waits for completion and observes the actual newly quiet ids.
  The override clears after the sweep (and on unavailable dispatch/host
  teardown). Unavailable sweeps reject rather than claiming a quieting result.
  Existing active-tab guards are unchanged.
- **F31-3:** `setQuietProtection` uses actual pin/mute actions, an HTML Audio
  element playing a generated PCM WAV, a live `window.open` child and a real
  geolocation permission request. Media, opener-family and pending-permission
  conditions must appear in native observations before the adapter returns.
  Used-media pauses playback only after the native media-history observer has
  recorded it. Dirty input, checkbox, POST, deep scroll and stored-handler
  fixtures remain shipping's real page actions. `armBeforeUnloadObjection`
  installs a real handler. **The objection example remains undefined:**
  `tabListenerState` and `beforeUnloadProbe` explicitly throw undefined errors
  because Chromium protects beforeunload-bearing frames before closing; there
  are no Electron listener counts or will-prevent-unload event to report.
  Other protection examples can proceed independently. No synthetic events or
  seeded protection flags were added.
- **F31-4:** `addressCommandNotice` reads the actual rendered command-notice
  text and role. The `/sleep` command's implementation is unchanged.
- **F31-5:** `quietChromeState`, `clickIslandDot`, `quietRowDimStyles` read or
  click the actual dot, panel and rail DOM. Dim observations inspect quiet
  classes, hover/focus, layout boxes, visibility and ancestor opacity, crossing
  enclosing iframe elements as well. Added the page shim's missing `hover`
  forwarding so shipping can park its pointer on the address input.
- **F31-6:** `setTabSleep` / `tabSleep` call the production `quietDelay`
  preference setter/getter, including its existing validation and
  `CommitPendingWrite`. No replacement scheduler, settings store, or wake-on-Off
  logic was added. Actual disk persistence and timed behavior await native
  testing; these unchanged acceptance examples do not prove elapsed auto-quiet.
- **F31-7:** `createQuietTab` constructs a saved native navigation and invokes
  `BrowserLiveTabContext::AddRestoredTab` unselected. That existing path uses
  Chromium's restored-tab construction with `kNoRendererProcess` and restored
  navigation controller; it never creates and discards a live fixture. The
  native snapshot now exposes `IsRenderFrameLive`, and recognizes a viewless
  controller needing reload as asleep alongside a discarded lifecycle unit.
  Shipping's `webContentsId` projects null when the renderer is not live.
- **F31-10:** `tabProcessCount` observes actual native tab renderer OS PIDs,
  deduplicates them and checks their existence with OS signal 0. Previously
  observed PIDs continue to count after discard until the OS process really
  exits, so disappearing targets or rows cannot fake a decrement. No signals
  that terminate processes are sent by the adapter. A quietable fixture sharing
  its PID with another tab rejects the isolated-decrement claim. Native testing
  must establish actual process isolation and the expected drop/wake count.

**F31-8 and F31-9 remain undefined and their upstream blockers are untouched.**
Because `sleepState` is now shared infrastructure, the existing `sleepTab`
explicitly refuses private candidates with an undefined-adapter error before
any discard dispatch, keeping F31-8 from accidentally becoming runnable on the
known wrong-context path. No private wake adapter or eligibility relaxation was
added. `persistedSessionData` still throws and `sessionSyncSnapshot` remains
absent; no fake persistence or sync projection was added for F31-9.

The new native operations are behind the existing compile-time test-hook and
`--blanc-test` checks. Production observations gained renderer liveness / lazy
restore state; production eligibility, private handling and scheduler sequencing
remain intact. The source-map digest was refreshed for the custom native file;
no upstream patch-budget change was needed.

### Checks and delivery

- Full required Node suite using `/usr/local/bin/node` v22.14.0: **256 pass,
  2 fail (258 total)**. The two failures are the existing sync loopback tests,
  both denied `listen EPERM: operation not permitted 127.0.0.1`. No test was
  skipped or relaxed. Output: `/tmp/blanc-quiet-tabs-continue-unit.tap`.
- Seven focused adapter/observation checks pass, including the existing detach
  checks, explicit private refusal, hidden ancestor/opacity detection, viewless
  identity, a real child OS process that continues to count after native state
  drops its PID, and refusal of a shared renderer decrement.
- `python3 chromium/tools/check-patches.py` passes: 128 upstream files,
  441 custom files; reconstruction only, no compilation credit.
- `node chromium/tools/progress.mjs --check` fails with
  `STATUS progress is stale; run node chromium/tools/progress.mjs`. Its inputs
  (tracker/status/evidence) were not edited here. The brief explicitly forbids
  updating STATUS.md/tracker.json, so Claude must reconcile that stale generated
  block when recording actual acceptance evidence.
- `git diff --check` passes.
- **Commits blocked by filesystem policy:** explicit-path `git add` failed on
  `/Users/anthonyjloria/Projects/BlancChromium158/repo/.git/worktrees/codex-quiet-tabs-2/index.lock`
  with `Operation not permitted`. Approval escalation is unavailable. The index
  remains empty. No push/merge/rebase/stash/reset ran, and node_modules remains
  the pre-existing untracked symlink.

Suggested review groups once Git is writable: native lifecycle/history/lazy
restore plus `quiet-native.mjs` and state projection; DOM observations plus the
page hover shim; real protection conditions; OS process observations and focused
checks; these notes. Include the required Codex co-author trailer on every
commit. All implementation files are present in the working tree and registered
in adapters/index.mjs; none has native-build or acceptance verification yet.

## Claude's review, build and first real acceptance run — 2026-11-07

Reviewed the implementation line by line against the actual Chromium headers
(`browser_live_tab_context.h`'s `AddRestoredTab` signature, `tab_restore_types.h`'s
`Tab` struct defaults, the pre-existing `quietDelay`/`quietState` handlers,
`auto_running_`/`AutoTick`/`AutoAvailable`) — nothing fabricated, every call
matches a real production path. Applied into
`~/Projects/BlancChromium158/src` via `apply.py` (1 file), built clean (6
steps), committed as `df3d0a80` on `chromium/s3-quiet-tabs-codex2`.

This was the first time any F31 scenario ran against a **real compiled
candidate** (`macos-a0ca85ae1edc5c19`) rather than the mocked `w.native`/`w.api`
calls the Node unit tests use. `node chromium/tests/runner.mjs ... --only=quiet-tabs`
(needs `/usr/local/bin/node`, v22+; the shell default v20 lacks global
`WebSocket` and the runner refuses to start) found 3 real failures out of 27
executed quiet-tabs.feature cases:

1. **`quiet-tabs.feature:28:example-42` (non-refetchable POST) — fixed.**
   `grep -rn "HasPostData" chromium/blanc/` returned nothing: the fork never
   checked a tab's last committed entry for POST data before offering to
   quiet it, despite shipping Electron protecting exactly this case. Added
   to `QuietAllowed` in `blanc_prototype_ui.cc`:
   `GetController().GetLastCommittedEntry()->GetHasPostData()`, same pattern
   as the function's other eligibility checks, right after the existing
   loading/pinned/audio checks. Rebuilt (`macos-53fb0155deee71ea`), reran —
   the scenario now passes. No adapter change was needed; the gap was purely
   in native eligibility.

2. **`quiet-tabs.feature:8` (droppedPageState) — flagged, not fixed.**
   Reproduces every run: `assert.equal(state?.droppedPageState, true)` at
   `test/desktop/steps/quiet-tabs.steps.js:300` fails because
   `sleepState(id).asleep` correctly reports the real condition — Chromium's
   native discard keeps the full 600 KB `pushState` payload the step creates,
   it never drops it. This is exactly what I already called out as
   impossible to honestly pass in the earlier investigation pass above; it
   is a real behavioral difference from shipping Electron (which does drop
   oversized state), not a bug in this round's adapters. Recorded in
   STATUS.md for an owner decision (register a divergence vs. something
   else) rather than weakened here.

3. **`quiet-tabs.feature:118` (renderer process count) — investigated,
   unresolved, flagged.** `sleepTab` returns `true`, `sleepState().asleep`
   becomes `true` (lifecycle state genuinely `DISCARDED`), but
   `tabProcessCount` never drops: the discarded tab's OS renderer PID stays
   running. Spiked this directly (`spike-process-count2.mjs`, not committed —
   scratch) against the real candidate: confirmed with a raw `ps -o stat=`
   read during the wait that the PID is `S` (running), never `Z` (zombie), so
   this is not the documented `kill(pid,0)`-reports-zombie-as-alive hazard.
   Read Chromium's actual discard path for this case
   (`TabLifecycleUnit::Discard` → `FinishDiscard`, since
   `features::kWebContentsDiscard` defaults off outside Android): it swaps in
   a brand-new `WebContents` created with `kNoRendererProcess` and destroys
   the old one via `old_contents_deleter.reset()` — in principle the old
   renderer process should go down with it. Why the OS PID survives 30+
   seconds past that is unresolved. Two real hypotheses, neither confirmed:
   Chromium's renderer-process-reuse pool may be keeping that PID alive for
   something unrelated (same number, different purpose — which would make
   PID-based observation the wrong test, not a real leak), or the fork's own
   post-swap tab lookup isn't resolving to the replacement WebContents the
   way it looks like it should. Stopped here rather than guess at a fix in
   either the adapter or native code. Recorded in STATUS.md for the owner.

Unit tests after the POST fix: 257/258 (the 1 failure is the pre-existing,
unrelated `stripTypeScriptTypes` Node-version issue in `ui-language.test.mjs`,
present on `main` too). `check-patches.py` and `git diff --check` both pass.
