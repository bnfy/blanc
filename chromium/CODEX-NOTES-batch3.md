# Batch 3 — diagnostic handoff, awaiting live evidence

2026-11-09, branch `chromium/s3-batch3`, base
`2667609c0e5c6ac42a2fd23dd3fdfac317cab01f` (PR #1420/#1421 merged).
Read AGENTS.md, STATUS.md's current batch/merge and S3 entries, batch 2's
logging/algebra record, and the actual shipping steps at
`6479ed3a314e4fd6219b8de1598bacffa78b4d7c` through `git show`.

No product fix or temporary instrumentation has been applied. Claude owns
builds and live acceptance. The requests below are round 1; no live logs
have been received and neither diagnostic round has been counted as run.
Do not interpret these notes as root-cause confirmation or acceptance credit.

## 1. F53-14 — split-view.feature:110

**Hypothesis — UNVERIFIED:** either the internal navigation fails before
commit, or the snapshot/poll projects a different URL/loading/title than
the target WebContents. Split membership alone does not establish a veto.
`quiet-native.mjs` routes this URL to `testNavigateTabAnyScheme`, which
finds the session id and invokes LoadURL without observing its outcome.
Shipping's step waits for `url.startsWith('blanc://mahjong')`, not merely
a settled navigation, then checks the corner label against the title.

**Claude, please collect this trace:** run only `split-view.feature:110`
on the merged base with the normal gated test configuration. Temporarily
log `[B3/F53-14]` in `HandleTest`'s `testNavigateTabAnyScheme` branch before
and after LoadURL: requested id/URL, matched index, target pointer/session
id, active pointer/id, split membership, visible URL, last committed URL,
loading state, and pending-entry URL (or none). Log a no-match explicitly.
Attach a temporary WebContentsObserver to that exact target before LoadURL
and keep it alive through the timeout: DidStartNavigation and
DidFinishNavigation with navigation id, URL, primary-main-frame flag,
HasCommitted, IsErrorPage, net error; also DidStopLoading and TitleWasSet
with committed/visible URL, loading and title. NavigationWatch at ~4454
illustrates the observer API, but do not assume this test hook installs it.
Log the same tab's serialized snapshot fields alongside the raw fields
until the failure. Include the full failed step/error and ordered browser log.

Compare with a temporary diagnostic using the same hook and URL on a loaded
ordinary non-split tab in an otherwise fresh equivalent profile. Report both
raw committed and projected URLs; scheme translation could matter. Do not
change shipping steps or relax their predicate. If no navigation starts,
trace the call's controller outcome next; if it finishes without commit,
instrument the actual cancelling throttle/delegate next. The Electron
`inertRequestVeto` name has no matching implementation in this fork's native
UI, so it is not evidence of a fork veto.

**Evidence/root cause/fix:** pending live logs. No fix justified yet.

## 2. F53-22 — split-view.feature:159

**Hypothesis — UNVERIFIED:** restore may change native targeting or floating
pill state, but the adapter contract may also explain a failure. The actual
fork exposes an iframe-backed float pill through host.js, not shipping's
independent per-element WebContentsViews. `island.mjs:floatViewState` derives
`aboveTabsAndSheet` from `state.shown && hitTarget(...) === 'island'`.
`tabs.mjs:splitCornerTabs` returns no `belowFloat` property, although shipping's
step asserts it equals true for each corner. Neither finding proves which
assertion fails on the live candidate or why relaunch differs.

**Claude, please collect this trace:** run only `split-view.feature:159`,
unchanged, and return the exact first failing assertion/step, before/after
relaunch adapter values (`floatViewState('pill')`, `splitCornerTabs`,
`islandAutoHideState`) and host raw floatViewState. Preserve startup logs
from the second process too. At `hitTarget` (~5294), log `[B3/F53-22]`:
input point, converted parent point, owner->view bounds/visibility,
float_frame/float_bounds, returned target and its ancestor chain. Dump the
parent's child order recursively (class, id, bounds, visibility, identifying
Island and MultiContentsView and both pane descendants), both before the
first assertion and after restore before the second assertion. Also log
`RestoreTabIdentity`'s persistent-split metadata, native split creation on
restore, and `AdjustSplitLayout` entry with member ids and the same tree.
Distinguish session-service restore from the Space-record `splitIds` replay;
do not assume the latter is the relaunch path. Log any actual attach/reorder
sites the tree identifies, rather than adding a speculative restack fix.

Please also capture host float iframe wanted/shown/class/bounds and
split-header DOM bounds and elementFromPoint at the tested point. This
separates hidden-pill state, DOM stacking, native targeting, and absent
adapter fields. If a temporary host edit is used, recompute island-assets.json
and refresh source-map.json before building, and remove the trace afterward.

**Evidence/root cause/fix:** pending live logs. No native z-order diagnosis
or adapter fix is confirmed.

## 3. F34-1 — glance.feature:98

**Hypothesis — UNVERIFIED:** close/refresh may emit another restore decision,
or the probe may be read from a different document. Shipping's When installs
`__glanceRestoreTriggerProbe` through `glanceCardPage()`, before opening the
picker; its Then reads that property through `mainChromePage()`. A missing
probe is `undefined`, which passes the helper's `value !== 'unset'` predicate
and then fails strict equality with null. This is a possible explanation,
not evidence that it happened. closeGlance's direct close() already emits
restoreTrigger:null; the separate closeOverlay path can emit glance-change.

**Claude, please collect this trace:** run only `glance.feature:98` with
temporary `[B3/F34-1]` logging in host.js's central emit() for onIslandState:
monotonic sequence, full JSON payload, Error().stack call site, overlayMode,
overlayPurpose, snapshot.glanceTabId, glance.closing. Log closeGlance entry,
after close(), native request completion and refresh completion. At subscribe
and callback dispatch log the subscribing document identity if available.
Capture from picker-open through the exact failed assertion, including any
console errors. At probe installation and assertion report the actual document
URL/frame identity, whether the property exists, and its value in both card
and strip documents (without installing a second probe or altering behavior).
Report full ordered emissions and exact error, not only the final value.
Recompute island-assets.json for the temporary host edit and refresh
source-map.json before building; remove tracing and refresh both afterward.

**Evidence/root cause/fix:** pending live logs. No fix justified yet.

## Validation and continuation

- Requested full Node command ran with
  `NODE_PATH=/Users/anthonyjloria/Projects/BlancChromium158/repo/node_modules`:
  252 pass, 4 fail under Node v20.19.0. Two sync-bundle cases fail on
  loopback `listen EPERM`; island-renderer.test.mjs cannot resolve the ESM
  import of acorn (NODE_PATH does not supply ESM resolution and this worktree
  has no node_modules link); ui-language's Settings case reports
  `stripTypeScriptTypes is not a function`. No all-pass claim. Output:
  `/tmp/blanc-batch3-unit.log` (local, not committed).
- `python3 chromium/tools/check-patches.py`: passed, 128 upstream files,
  441 custom files; reconstruction only, no compilation/runtime credit.
- `git diff --check`: passed before commit.

No native build, apply/sync tool, acceptance runner, shared-output edit,
push or integration operation was run. STATUS.md and tracker.json are untouched.
Only this notes file changes, so no Island asset hash changes are required.
Continue with confirmed evidence before writing one small fix commit per item.
If two actual logging rounds leave an item ambiguous, record the remaining
unknowns and next diagnostic rather than claiming a fix.
