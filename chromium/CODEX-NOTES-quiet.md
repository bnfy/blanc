# Result

Final prototype: **macos-f0bd093f621c613f**; `q3-group-pins-5-runtime-config.json`.

| Item | State |
| --- | --- |
| 1 quiet :99 | Done: real background restore loading fixed; unchanged case passes |
| 2 quiet :28/:106/:113 | Partly: private/state pass; native beforeunload refusal passes; Electron event assertion blocked |
| 3 vertical :129 | Done: shipping v1.46.0 agrees with step; fork fixed; original case passes |
| 4 inventory | Done: complete run once; 640 cases / 35 files; every undefined classified below/in appendix |
| 5 regression | Done: full desktop Sync then five files; zero lost passes |

Cause of :99: Chromium's Recently closed and startup restore paths scheduled background loads after creating rendererless tabs.
Those tabs became live without selection; this was a product bug, not an adapter projection error.

| Run | Pass | Fail | Undefined | Excluded |
| --- | ---: | ---: | ---: | ---: |
| q2 five-file baseline | 142 | 3 | 4 | 0 |
| q3 final desktop Sync | 22 | 0 | 0 | 0 |
| q3 final five files | 146 | 1 | 2 | 0 |
| q3 complete inventory | 443 | 8 | 187 | 2 |

Lost passes: **none**, in either q3 run; four gained (:99, :106, :113, vertical :129).
Undefined: 110 adapter gaps / 75 missing-feature cases / 2 macOS-inapplicable; full per-file table in §4.
Top ten for a first macOS beta (ranked; no inventory features implemented):
1. Private lifecycle acceptance — four undefined cases leave history, child-tab and passkey isolation unqualified.
2. Telemetry consent — both choice-commit cases time out, leaving opt-in/decline persistence unqualified.
3. Shared Spaces and Send fault coverage — 33 + 8 undefined cases exceed the happy-path/recovery coverage of the 22-check gate.
4. In-app updater — absent F22 path leaves safe ongoing beta updates unqualified; dedicated beta build remains on hold.
5. Certificate recovery/eviction — reopened-page observation is undefined and the bounded eviction path is absent.
6. Granted microphone capture — missing steps leave the user-visible capture/permission contract unqualified.
7. Quiet Space ownership — :34 cannot quiet its grouped pinned fixture, blocking its inactive-ownership assertion.
8. Glance cancellation and focus — :88/:98 fail around waking/cancelled references and removed controls.
9. Pinned homes — seven F48 cases need absent home state/navigation, including restart and private behavior.
10. Open-tab/Arc migration — 15 + 7 applicable missing-feature cases block preserving a new user's existing work.

Unverified: Electron beforeunload event contract (read-only shipping step), inventory gaps/failures, native extension API parity for grouped pins, physical input/accessibility, Windows/Linux, and signed/release/update qualification.
Supplemental quiet lifecycle 5/5 is on q3-private-3; grouped-pin lifecycle 5/5 is on the final candidate. Final quiet acceptance is 27/0/1.
No push, publication, signing, Apple/1Password/production contact, live-tree change, beta build, toolchain install or cold build. Local commits only.

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

Queue 3's shipping comparison supersedes the earlier V16 grouped-pin choice
recorded in the prior handoff. Removed both V16 step replacements; the original
shipping group membership and pinned-group setup assertions now execute. This
strengthens coverage and does not edit shipping steps. Earlier dated notes
remain historical. Candidate bytes are unchanged by this adapter correction.

## 5 — Final regression

`q3-final-gate/result.json`: full mode, 22/22 pass on
macos-f0bd093f621c613f, with embedded assets, mock keychain, the local Worker
and an independent peer. Persisted request-budget restart waited 120,036 ms
and passed; no production endpoint was used. The five feature files run next,
then the whole inventory once, so that inventory represents the final candidate
rather than a candidate that still owes the mandatory Sync gate.

`q3-final-features/baseline.json`: 146 pass / 1 fail / 2 undefined. Exact
case-ID comparison with `q2-final-features` loses **zero** of its 142 passes;
gains are quiet :99, :106, :113 and vertical :129. Comparison is recorded in
`q3-regression-comparison.json` beside the baseline evidence.

| Feature | Pass | Fail | Undefined |
| --- | ---: | ---: | ---: |
| internal-pages | 10 | 0 | 0 |
| island-and-commands | 72 | 0 | 1 |
| quiet-tabs | 27 | 0 | 1 |
| sync | 18 | 0 | 0 |
| vertical-tabs | 19 | 1 | 0 |
| Total | 146 | 1 | 2 |

Remaining fail: vertical :239, explicitly tagged `@test-platform-linux` and
named “The main-menu button moves into the rail on Windows and Linux.”
Remaining undefined: Island :320, also `@test-platform-linux`, and quiet
:28 example-45 (the Electron listener/event contract discussed above). Raw
runner results are retained; macOS inapplicability is classification, not a
manufactured pass. The baseline excludes 491 unselected cases from these totals.

Regression precommit: required tools/release tests plus divergence binding test
292/292; patch reconstruction 159 upstream / 573 canonical passes.

## 4 — Complete final inventory

Ran `chromium/tests/runner.mjs` **once without a filter** after the mandatory
final regression, on the same final prototype. No rendering/memory guard was
bypassed. Evidence: `../evidence/foundation/q3-whole-inventory/baseline.json`
and `junit.xml`; raw baseline is also committed at
`chromium/scenarios/baseline-macos-f0bd093f621c613f.json` and selected in the
tracker. Bar A now reports actual current-candidate inventory results; this
is not release qualification or a blanket feature-verification promotion.

The runner recorded 591 declarations and 640 executable cases (533 native
fixture attempts, including the runner's normal failed-case retries). Its
403/8/178/2 declaration summary is distinct from the executable totals below.
The two exclusions are explicitly mobile-only. All 35 feature files appear.

Adapter / Feature / macOS N/A partition the Undefined column. “Missing
adapter” identifies the observed test gap, not a claim that the feature passes.
“Missing feature” is supported by the source or explicit fork decision and
may coexist with missing steps. The F38 SDK cases are deliberate omissions:
the chosen fork path is the Chrome Web Store extension, not the shipping SDK.
Reader Mode has a separate Chromium command but its shipping API contract is
unported. Shared Spaces and Send are implemented and exercised by the native
gate; their full shipping acceptance definitions are still missing here.

| Feature file | Pass | Fail | Undefined | Adapter | Feature | macOS N/A | Excluded |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| F41-named-workspaces.feature | 59 | 2 | 23 | 23 | 0 | 0 | 0 |
| ad-blocking.feature | 9 | 0 | 0 | 0 | 0 | 0 | 0 |
| arc-spaces-import.feature | 0 | 0 | 8 | 0 | 7 | 1 | 0 |
| blank-tab-affordance.feature | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| browser-migration.feature | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| downloads.feature | 1 | 0 | 1 | 1 | 0 | 0 | 0 |
| find-favorites-history.feature | 7 | 0 | 0 | 0 | 0 | 0 | 0 |
| glance.feature | 41 | 2 | 26 | 24 | 2 | 0 | 0 |
| interface-language.feature | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| internal-pages.feature | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| island-and-commands.feature | 72 | 0 | 1 | 0 | 0 | 1 | 0 |
| link-routing.feature | 0 | 0 | 7 | 0 | 7 | 0 | 0 |
| local-profiles.feature | 0 | 0 | 3 | 3 | 0 | 0 | 0 |
| mini-window.feature | 0 | 0 | 5 | 0 | 5 | 0 | 0 |
| multi-window.feature | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| navigation-and-context-menu.feature | 13 | 0 | 5 | 5 | 0 | 0 | 0 |
| newtab-layouts.feature | 23 | 0 | 2 | 1 | 1 | 0 | 0 |
| onboarding.feature | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| permissions-and-auth.feature | 5 | 0 | 1 | 1 | 0 | 0 | 0 |
| platform-services.feature | 1 | 2 | 8 | 0 | 8 | 0 | 2 |
| private-tabs.feature | 2 | 0 | 4 | 4 | 0 | 0 | 0 |
| quiet-tabs.feature | 27 | 0 | 1 | 1 | 0 | 0 | 0 |
| reader-mode.feature | 0 | 0 | 3 | 0 | 3 | 0 | 0 |
| send-to-device.feature | 0 | 0 | 8 | 8 | 0 | 0 | 0 |
| settings-and-theming.feature | 7 | 0 | 4 | 0 | 4 | 0 | 0 |
| shared-spaces.feature | 0 | 0 | 33 | 33 | 0 | 0 | 0 |
| site-certificate-safety.feature | 6 | 0 | 1 | 1 | 0 | 0 | 0 |
| split-view.feature | 31 | 0 | 1 | 1 | 0 | 0 | 0 |
| supporter-and-session.feature | 2 | 0 | 2 | 2 | 0 | 0 | 0 |
| sync.feature | 18 | 0 | 0 | 0 | 0 | 0 | 0 |
| tab-archive.feature | 0 | 0 | 16 | 0 | 16 | 0 | 0 |
| tab-drag.feature | 28 | 0 | 1 | 1 | 0 | 0 | 0 |
| tab-migration.feature | 0 | 0 | 15 | 0 | 15 | 0 | 0 |
| tabs-and-groups.feature | 38 | 1 | 8 | 1 | 7 | 0 | 0 |
| vertical-tabs.feature | 19 | 1 | 0 | 0 | 0 | 0 | 0 |
| **Total** | 443 | 8 | 187 | 110 | 75 | 2 | 2 |

Every undefined case is listed with its classification and evidence in
[CODEX-quiet-inventory.md](CODEX-quiet-inventory.md), with machine-readable
counts, failures and all 187 classifications in
[CODEX-quiet-inventory.json](CODEX-quiet-inventory.json).

### Eight raw failures

| Case | Observation | Classification / next investigation |
| --- | --- | --- |
| F41-named-workspaces:34 | Grouped pinned fixture never becomes quiet | Product policy/fixture mismatch: quiet ownership remains unqualified; no eligibility guard weakened |
| F41-named-workspaces:613 | Group-to-Space color is empty instead of #426c4c | Identity/color propagation mismatch |
| glance:88 | Picker never observed aria-busy while waking | Wake/cancel timing or observation gap; not yet localized |
| glance:98 | Focus field undefined instead of null | Removed-control focus observation/contract mismatch; not yet localized |
| platform-services:7 | CDP Runtime.evaluate timeout committing enabled usage choice | Local capture fixture; no-before-consent assertion passed; commit/after-consent result unqualified |
| platform-services:17 | CDP Runtime.evaluate timeout committing disabled usage choice | Decline persistence and absence of install id remain unqualified |
| tabs-and-groups:112 | No “3 tabs tucked away” row | Ordinary unpinned-group collapse; earlier STATUS already lists F3-3 as failing |
| vertical-tabs:239 | Main-menu rail button absent | Explicit Windows/Linux scenario, tagged @test-platform-linux; not applicable to macOS |

All eight failures persisted after the runner's normal retry. No failure was
converted into a pass or excluded after the run. No missing inventory feature
was implemented. The top-ten ranking is in Result; lower-priority feature
gaps (Archive, Dark websites, mini windows, Reader Mode, and Billboard overflow)
remain visible in the table and appendix.

The full inventory's results for every case in the five-file run are
identical. Comparing the full inventory directly to q2 also loses **zero** of
q2's 142 passes. There is no previous complete baseline on this candidate
from which to claim zero regressions across the other feature files.

### Remaining owner decision and limits

The unchanged quiet :28 beforeunload example specifically requires Electron
WebContents listener counts and `will-prevent-unload`. The fork refuses to
quiet before dispatching a close event. A native behavioral check passes,
but inventing those events/counts would misrepresent the implementation.
Completing that acceptance case needs an owner decision on a native-equivalent
contract; `test/desktop/` remains untouched under this queue's read-only rule.

No native run or build remains owed for this queue. Beta build/release,
signing, physical shortcuts/accessibility, current-candidate Web Store
install/update behavior and Windows/Linux were not qualified here. The
absolute beta-build hold remains in effect.

Final precommit: `q3-inventory-precommit.tap` 291/291 and
`q3-inventory-patches.json` 159 upstream / 573 canonical reconstruction passed;
`progress.mjs --check` and `git diff --check` passed. Local implementation
commits: a3cb8ccf, 8b27f3c5, bace549a; regression/contract record: dc7eea9d.
