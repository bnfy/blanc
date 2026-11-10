# Result

Queue 3 in progress; local commits only. Absolute owner hold on `out/BlancBeta`.

| Item | State |
| --- | --- |
| 1 lazy restore :99 | Done: patch 0051; unchanged scenario passes; full regression owed |
| 2 protections/private/page state | Partly: private/state pass; Electron event assertion remains undefined |
| 3 vertical :129 | Done: shipping agrees with step; fork fixed; lifecycle 5/5 |
| 4 whole inventory | Owed once on final candidate; top ten owed |
| 5 regression | Owed full desktop Sync then five features after product changes |

Cause of :99: Chromium's Recently closed and startup restore paths schedule
background loads after creating rendererless tabs. They become live without
selection; this is a product defect, not a snapshot projection error.
Current candidate: macos-f0bd093f621c613f; `q3-group-pins-5-runtime-config.json`.
Baseline five files: 142 pass / 3 fail / 4 undefined; desktop Sync 22/22.
Lost passes: not yet measured. Final result tables and ranked gaps pending.
Focused quiet suite: 27 pass / 0 fail / 1 undefined; native lifecycle 5/5.
Unverified: final inventory/regression; Electron beforeunload event contract.
No push, publication, signing, Apple, production services, 1Password or live tree.

## 1 — Lazy restore

`q3-restore-before` reproduces the unchanged scenario failure twice. A separate
isolated native observation saw both restored tabs with `rendererPid: 0`, then
both with real renderer PIDs within one second without activation. The
production `BrowserLiveTabContext::AddRestoredTab` unconditionally schedules
background loading; startup's `SessionRestoreImpl::FinishedTabCreation` also
submits every restored tab to the loader. Patch 0051 preserves rendererless
background rows in both paths; activation remains Chromium's normal visibility
and controller load path. App windows retain their existing restore policy.
Shipping references: `src/main/session-restore.js` (restored tabs born quiet),
`src/main/main.js` `createQuietTabsBatch` (`asleep: true`), and `tab-sleep.js`.

Build preflight stopped before compilation on pending generated flags after the
provided wrapper regenerated the prototype graph. Pinned args SHA remains
414e3baad6c84730b3c17f411ed82c5065561ba344fe2a202675654e1e18a057.
The generated-header delta is the existing queue-2 flag
`BLANC_BETA_LOCAL_QUALIFICATION=false`; all existing prototype flags and the
pinned SDK/compiler remain unchanged. Generate only this prototype header,
then repeat guarded preflight. No beta output or toolchain action authorized.

`q3-restore-after`: unchanged :99 passes on macos-8ee06275e7c42d9d.
Guarded incremental build: 18 actions, 34.48s after the single header action.
Precommit: q3-restore-precommit.tap 291/291; reconstruction 159/573 passes.
Full regression is reserved for the final candidate after items 2 and 3.

## 2 — Private discard and page-state isolation

Patch 0052 creates the discarded replacement in the original WebContents'
BrowserContext instead of the window profile. Native `CopyStateFrom` preserves
its original session-storage namespace; the adapter no longer preemptively
marks private discard undefined. In-memory recovery remains in the controller.
The serialization builder now omits encoded page state for every serialized
navigation consumer, covering incremental writes, session rebuild and Recently
closed. URL/title/history metadata remains available. This intentionally also
omits form/history payloads from Recently closed serialized entries; it does
not clear the original live or discarded controller.

Persistence observation now checkpoints and reads the real native session and
rejects **any** nonzero serialized page-state byte count. Searching the secret
in a metadata-only projection or base64 payload could hide a leak; that is not
used. Sync observation reads the real native payload acknowledged by the
utility-process runner and requires the candidate tab to be present. Renderer
observation uses the actual Island tabs payload. None of these tests enables
production Sync.

The beforeunload objection example is a deliberate contract blocker. The
unchanged shipping step (`quiet-tabs.steps.js:342-346`) demands
`probe?.fired === true` with the message "will-prevent-unload was not observed"
and positive `didNavigate`, `title`, `input` Electron listener counts. Native
`QuietAllowed` protects any live frame with `kBeforeUnloadHandler` before
closing/discarding, so there is no aborted-close event or rewiring. Reporting
those fields as observed would be fabricated. Keep that example undefined;
the supplementary native check exercises refusal, retained identity, title,
same-document navigation and real text input after refusal. It does not claim
to satisfy the unchanged Electron event assertion.

Additional startup verification found two issues beyond :99: the upstream
`RestoredTab::is_app` constructor argument is true for ordinary tabs in this
revision, and the first inserted background tab is temporarily selected. The
filter now uses actual window type; restoring the saved selection first avoids
that temporary activation. Split indices are sorted back into saved order.
`q3-quiet-lifecycle-1` and `-2` retain the failing startup evidence. Run 3 passed
startup but found the new test had omitted the config's embedded-asset mode;
run 4 corrects that fixture setup, without changing the product or assertions.

`q3-quiet-focused` (macos-4be72dd3d3694a57) is 27 pass / 0 fail / 1 undefined.
`q3-quiet-lifecycle-4` (macos-4d112d6a0f5772b3) passes all five checks: pinned
background startup restore, in-window private discard/wake, incognito-window
discard/wake, memory-only page state (secret still present after wake), and
native beforeunload refusal with working title/navigation/input afterward.
The startup follow-up built in 21.98s / 6 actions. Full regression remains owed
on the final candidate after item 3. No Electron-only event pass is claimed.

Item 2 precommit: `q3-private-precommit.tap` 291/291; focused adapter/observation
unit checks `q3-quiet-adapters.tap` 8/8; reconstruction 159/573 passes.

## 3 — Vertical rail :129 is valid against shipping v1.46.0

Shipping `v1.46.0:src/main/main.js:9123-9154` says:

```js
function markPinned(tab) {
  if (tab.pinned) return;
  tab.pinned = true;
  tab.pinnedHomeUrl = pinnedHomeFor(tab.url, { localFile: tab.localFile === true });
}
// toggleTabPinned:
for (const member of members) {
  if (pinned) markPinned(member);
  else {
    member.pinned = false;
    member.pinnedHomeUrl = null;
  }
}
if (!pinned && !tab.groupId) { /* move an ungrouped unpin */ }
```

The unchanged step (`test/desktop/steps/vertical-tabs.steps.js:891-895`):

```js
const members = state.tabs.filter((tab) => tab.groupId === work?.id);
assert.ok(members.some((tab) => tab.pinned) && members.some((tab) => !tab.pinned));
```

There is **no disagreement between shipping and the step**: a pin retains its
group. The fork disagreed: `togglePinned` called native `SetTabPinned`, whose
`TabStripModel::SetTabPinnedImpl` calls
`MoveTabToIndexImpl(index, final_index, std::nullopt, pinned, false)` — moving
to the global pinned prefix and clearing the group. This is a fork defect,
not a stale scenario. Shipping's `test-hook.js:792` directly calls
`toggleTabPinned(id)`; the acceptance hook does not manufacture grouped pins.

The fix keeps grouped pins in their native groups with browser-owned pin
metadata. Shell policy, capture, Sync, menus and snapshots read that pin;
normal ungrouped pins still use the native prefix. Grouping an existing pin
preserves it, ungrouping a single pin moves it back to the native prefix,
and session rebuild/Recently closed metadata retain it. Space validation
accepts grouped pins without dropping group-contiguity checks. Native split
collections remain intact; ungrouping a pinned split retains its metadata pin
until explicit pin/unpin. No native extension-tab API parity is claimed by this
shell fix; full final regression remains owed.

`q3-vertical-focused` reaches and passes the ten setup/rail-order assertions,
including mixed pins and group membership. It then fails the first previously
unreached remote-Start-Page check: hidden Start Pages only polled Sync while
visible. A native Sync observer now queues the real Start Page refresh after
remote/account/status changes, including hidden pages; its visible poll stays
a fallback. `pages/newtab-adapter.js` is fork-owned, not one of the generated
Island renderer files. No shipping step or generated renderer was edited.
The grouped-pin lifecycle check passed initial pin/protection/sync observations
and exact restart order; its ungroup call was corrected to use the real host
API (`setTabGroup` is not in the native test-dispatch allowlist).

The runner now writes `partial-baseline.json` after each completed declaration,
explicitly marked incomplete. A rendering/memory stop cannot turn it into a
completed inventory, but cannot erase all earlier per-case evidence either.

`q3-vertical-focused-2` passes the full unchanged :129 on
macos-2f591e3d03583bba, including remote icons, Quick Switcher and collapse.
`q3-grouped-pin-lifecycle-2` through `-5` pass pin policy/Sync, restart,
Recently closed, grouping native pins and ungrouping. The Space follow-up
exposed a pre-existing durability comparison defect: Shared Spaces stores
`sharedCapture` even for unshared records, but native capture excludes it.
Saved tabs/groups/active were identical; the extra metadata alone rejected
the switch. Compare the complete native record with that separate metadata
removed, without changing stored bindings or the exact layout comparison.
Applying saved grouped pins after grouping also preserves saved member order.

`q3-grouped-pin-lifecycle-7` passes all five checks on final candidate
macos-f0bd093f621c613f (`q3-group-pins-5-runtime-config.json`), including
Space capture/restore with a pinned member after an unpinned member. Run 6
correctly refused a switch while its new Start Page was still loading; run 7
waits for that loading state to finish. No shipping assertion changed.
Final incremental build: 6 actions / 33.36s. Patch inventory: 120 unique
upstream paths / 390 hunks across all patch files; reconstruction covers the
full source-map selection, reported separately below.

Item 3 precommit: `q3-group-pins-precommit.tap` 291/291;
`q3-group-pins-patches.json` reconstruction 159 upstream / 573 canonical passes.
