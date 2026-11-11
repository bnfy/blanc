# Result

> **OWNER CHANGE (2026-11-11, binding, overrides the brief):** stop running the
> complete inventory and the full five-file regression after every two items.
> Until principal development is done, run only the scenarios for the item in
> hand plus the full `desktop-sync.mjs` gate when Sync code changed. Run the
> complete inventory ONCE, at the very end of this queue, and fix lost passes
> then. Keep this notice when you rewrite the file.

> **OWNER ADDITION (2026-11-11, binding): runner timing baseline.** Before the
> single end-of-queue inventory, add per-phase timing to `chromium/tests/runner.mjs`
> (browser launch, blocker readiness, reset between cases, appearance setup, step
> execution, waits that ran to timeout, retries, teardown), written to the run's
> evidence as a JSON summary with totals and the 20 slowest cases. Record a
> baseline over a 60-case sample across at least six feature files. Then remove
> the obvious waste (for example fixed sleeps, re-doing setup that is already in
> the wanted state, relaunching when a reset is enough) WITHOUT weakening any
> assertion, the rendering guard, or isolation between cases; rerun the same
> sample and report before/after per phase. Shipping's Electron harness
> (`test/desktop/`, read-only) is the comparison for what a case should cost.
> Report it in a "Runner timing" section. Keep this notice when you rewrite the file.

Queue 4 is **in progress**. Dedicated beta build/updater remains on absolute owner hold.
Current prototype: **macos-4f3865e190257d03**; `q4-quiet-owner-1-runtime-config.json`.

| Item | State |
| --- | --- |
| 1 Private lifecycle | Partly: five scenarios pass; native secret isolation fixed; actual Touch ID ceremony blocked by signing/Apple restriction |
| 2 Telemetry consent | Done: both original cases and three failed-write/recovery checks pass; consent verified on disk before any event |
| 3 Shared Spaces / Send | Done: all 41 cases have passing development evidence; resume targets 4/4 and full Sync 22/22 on item 3 candidate |
| 4 Updater | Deliberately excluded: absolute beta-build hold |
| 5 Certificate recovery / eviction | Done: seven scenarios and three native eviction/isolation checks pass |
| 6 Microphone indicator | Done: real permission, synthetic input, window-wide chip and native Stop pass |
| 7 Quiet Space ownership | Done: ownership case and five quiet-protection controls pass |
| 8 Glance / other failures | Pending |
| 9 Pinned homes | Pending |
| 10 Open-tab / Arc import | Pending |
| 11 Remaining adapters | Pending |

| Evidence | Sync pass/fail | Inventory pass/fail/undefined/excluded |
| --- | --- | --- |
| Owner baseline | 22/0 | 443/8/187/2 |
| Item 3 candidate: q4-resume-full-sync | 22/0 | Final inventory owed; earlier run stopped per owner change |

Lost passes: partial run found F41:558 group creation; fixed and targeted check passes. Final comparison owed.
Owner input: actual device-bound passkey acceptance requires a signed, entitled build and Touch ID ceremony, outside this queue.
Unverified: final-candidate regression, passkey ceremony, physical input/accessibility, other platforms and release qualification.
No push, publication, signing, production/Apple/1Password contact, live-tree change, beta build or toolchain installation.

## 1 — Private lifecycle

`q4-private-2` on the owner baseline is 5 pass / 0 fail / 1 undefined.
The new adapters exercise ordinary-history positive control, private history absence,
Recently closed and restart exclusion, private theme/quick exit, and a real target-blank
link whose child shares the private BrowserContext and differs from the Island's regular context.
The first run had an adapter argument error in `navigate`; corrected before run 2.
Shipping sources and assertions remain unchanged.

Source inspection found the macOS Touch ID config reads the metadata secret from
Chromium's incognito preference overlay, which inherits regular-profile values.
Patch 0054 gives an OTR profile its own in-memory metadata secret, owned by that
profile rather than a process-global map or persistent preference. Regular config
behavior remains unchanged. The native supplementary test calls the actual config
builder, compares fingerprints within a session and after restart, and never calls
Keychain or an authenticator. This is not a substitute for the device-bound passkey
scenario: a CDP virtual authenticator would only test its own lifetime.

Guarded incremental build: 7 actions / 34.25 seconds. Patch reconstruction:
160 upstream files / 573 canonical files. Native secret test and precommit evidence
are recorded below when complete.

`q4-private-secret/result.json`: 2/2 native metadata checks pass on
macos-a1bd86341c373179: regular/private secrets differ, repeated private reads
are stable, regular secret survives restart, private secret rotates.
Desktop incremental patch budget (excluding foundation baseline and Android):
121 unique upstream paths / 392 hunks; full desktop reconstruction remains 160/573.

`q4-private-3`: same 5/0/1 on the rebuilt prototype; no private-file lost passes.
First precommit caught the expected source-count assertion (159 -> 160 for the
new pinned WebAuthn file). Updated that bookkeeping assertion; no runtime assertion
changed. Required checks rerun as `q4-private-precommit-2.tap`.
Required precommit: 291/291 pass; patch reconstruction 160/573 passes;
progress freshness and whitespace checks pass. Full gate/inventory remain due after item 2.

## 2 — Telemetry consent

The timeout occurs before calling `completePrivacy`: `startPage()` enumerated
all same-URL targets and evaluated `document.visibilityState` on a restored quiet
Start Page with no renderer. During `q4-telemetry-before`, an independent CDP
read of that fixture confirmed the selected Start Page was complete and visible,
while the old quiet Start Page timed out on that simple read. Use the native
tab-to-target mapping already used for tab operations, rather than inspecting
unrelated rendererless pages.

The product also called `TelemetryLaunch` immediately after scheduling preference
writes. Completion now waits for both preference files' commit callbacks, and an
outstanding-write counter gates every telemetry path, including concurrent choice
submissions. Test mode only permits an explicit HTTP loopback collector; it cannot
fall back to the production collector. The local collector records the saved
consent/completion values at every request, and the scenario checks durable choices
and the declined value after relaunch. Verification pending.

The first post-fix run passes enabled consent, then exposes a separate relaunch
fixture wait: all restored web tabs are quiet and the selected tab is Start Page,
so the blocker correctly remains `not-started`. A read of the live fixture confirms
both web and background Start Page rows are asleep. Relaunch now waits for blocker
readiness only when a live web tab exists. No blocker state or scenario assertion
is replaced. Guarded build: 6 actions / 33.76 seconds.

`q4-telemetry-after-2` passes both original scenarios. A final correctness review
found PrefService callbacks also run after write errors. Added durable readback of
both choices/completion before acknowledging success; read/write failure keeps
telemetry closed. A supplemental test makes the actual Local State destination a
directory, checks rejection/no event/no id, then restores it and retries. Its native
run and the original cases are due on the updated candidate before commit.

The failed-write fixture passes 2/2 on `q4-consent-durable` (macos-5b0d6aa440b82d7f).
The final follow-up keeps first run pending after a failed write and applies the
same durable gate to Settings' consent toggle and its native test transport,
without treating a Settings edit as first-run completion. Final verification below.


Final candidate `macos-ee81ff839a8a3712` (`q4-consent-final-runtime-config.json`):
`q4-telemetry-final` passes both original cases; `q4-consent-write-failure-final`
passes 3/3 (failed write, recovery before event, post-onboarding saved change).
Final build: 6 actions / 33.34 seconds. Patch budget unchanged at 121 paths /
392 hunks (desktop incremental patches); reconstruction 160/573 passes.
Required precommit plus telemetry gate: `q4-consent-precommit.tap`.
The mandatory after-two full Sync gate and complete inventory are next.

## Development regression after item 2

`q4-after-two-sync` passes 22/22 on `macos-ee81ff839a8a3712`.
The earlier inventory was stopped to follow the owner change above: its
`partial-baseline.json` contains 442 declarations / 477 cases (329 pass, 4 fail,
142 undefined, 2 excluded). This is explicitly incomplete, not a baseline.
Among those completed cases, F41:558 lost its prior pass. The Island show call
returned before its animation-frame initialization, allowing the next typed
group name to be overwritten. The fix waits for that initialization; F41:558
passes on its first attempt in `q4-shared-smoke-1` on
`macos-e1ae65ff41692064`; final-candidate inventory verification is still owed.

## Runner timing

Phase recording now covers launch, blocker readiness (including relaunch), reset,
appearance, steps, timeouts, retries and teardown. Each run writes totals, all
attempts and its 20 slowest cases to `timing.json`, bound to the candidate and
a hash of the test harness. Nested phase time is reported separately from
exclusive time; timeout/retry costs are annotations, not added twice. The required 60-case, six-file baseline
and unchanged-sample comparison remain owed before the final inventory.

## 3 — Shared Spaces and Send (in progress)

All 33 Shared Spaces and 8 Send cases now resolve to adapters; resolution alone
is not a pass. `q4-shared-smoke-2` verifies Shared Spaces :4 selection/cancel,
:17 parked remote-close recovery and Send :7 inbox order on the current native
candidate. `q4-shared-faults-1` passes all nine original fault/retention assertions
on their first attempts against the fork's generated bundle and local Worker.
The separate desktop peer host adds virtual time and durable fixture stores;
the existing phone peer and phone entry-point code remain byte-unchanged.
The earlier fault run's loader error used an unexported reference; it is retained
as failed development evidence, superseded by the clean nine-case run.

Product changes include local-first selection while a remote check waits,
explicit consent when choices change, cancellable sheet presentation during an
already-requested save, and erasure retry controls. Three logic checks verify
consent/cancellation behavior. Native local closes publish their Shared tab ID;
Recently closed merges native and remote occurrences by that ID. Remote closes
retain one eligible live page per window for 30 seconds, using the protected
hidden-page host, with private/capture/unload/opener/split exclusions.
The native recovery assertion observes the actual parked page, not a projected
boolean. Other recovery routes and certificate eviction remain owed in item 5.

The Send inbox heading used a literal HTML skeleton outside the strict Trusted
Types allowlist. An anchored `EDITS` replacement now creates its spans as DOM
elements. The shipping assertion also exposed a locator composition defect:
`first().locator(...)` now searches inside the first row, rather than selecting
the first matching child from any row. Its contract has a focused unit check.

Build `q4-shared-4`: seven guarded actions / 21.28 s, prototype only. The wrapper
initially swallowed source application failure; it now stops on any pipeline
failure. Reconstruction hashes were regenerated from pristine inputs plus the
patch series before the successful build. Patch budget: 121 desktop incremental
upstream paths / 401 hunks; reconstruction 160 upstream / 573 canonical files.
`q4-shared-static-2`: 296/296 required tool/release tests, before the additional
timing-comparison checks. Fresh precommit checks and the full Sync gate are recorded below.
Remaining native Shared Spaces/Send scenarios, including two complete clients,
remain owed; no complete inventory credit is claimed.

`q4-shared-full-sync-1/result.json`: **22/22 pass**, full mode on
`macos-87c5b01575afd817`. The persisted request-budget restart waited 120,035 ms
and stayed enabled. No lost Sync-gate passes against the 22/22 owner baseline.
The only Worker was local; private and secondary profiles made no Worker requests.

Checkpoint precommit: `q4-shared-precommit.tap` **298/298 pass**;
`q4-shared-precommit-patches.json` reconstructs **160 upstream / 573 canonical**
files successfully. Progress freshness and whitespace checks pass.

Follow-up development on the same compiled candidate: Send :15, :24, :33,
:41, :49 and :56 pass; :63 fails twice because the Start Page bridge never
provided `sentItems` or its open/dismiss actions. Native bridge and observer
wiring are now written, awaiting a build. The adapter now reads every live
Start Page, matching shipping's observation of background pages too. The full
Sync gate gains Ledger open/private-inbox assertions and a local-inbox read
while its existing persisted-budget pass is pending; the quota stays intact.
Shared Spaces :11 and :23 pass. Review found no dirty-form probe before a
background remote navigation; the existing all-frame isolated-world probe is
now wired in, with ownership/document checks after its asynchronous result.
These follow-up product edits are **not yet built or runtime-verified**.

The remaining scenario run also exposed Shared Spaces :73: an accepted active-tab
close stayed deferred after crash restoration. Patch 0057 adds a pre-view session
restore stage, weakly bound to the native restore job. The desktop bundle reads
its durable close intent and returns window-scoped Shared tab IDs. Chromium removes
those records before creating views, repairs selection and preserves an empty
window with a neutral new tab. The first native capture acknowledges only absent
IDs before local diffing, preventing a remote close from becoming a local close.
Displayed tombstones remain replayable when the Chromium session checkpoint lags
the Sync receipt after a crash. This change is prepared, not yet built or qualified.
The native Space capture now refuses closing/empty models, so normal window
teardown cannot publish a progressively emptied Space. Saved group colors now
use the same native color mapping as live layout; these follow-ups also await build.
Cold restoration also journals accepted navigation's previous address and stable
field identity before changing a native session record. Replayed navigation uses
a fresh navigation entry, without the previous document's form/POST/page state.
A token saved with Chromium's session tab prevents a later intentional Back or
navigation from replaying that same remote field. The first matching capture
acknowledges the remote field before diffing, retaining its peer clock/writer.

The existing candidate also failed :94 (remote navigation replaced unsaved input)
and :111 (normal quit retained every tab and deferred navigation, but cold startup
did not apply it). The dirty-document probe and pre-view replay above target these
observed failures. :80, :87 and :103 pass (merged-tab crash, missing index retry,
and failed server erasure followed by successful retry).

:119 exposed a stale-capture race: a newly created local group disappeared during
Sync. Remote changes previously reconciled the last native capture, then sent a
layout that could erase edits made since that capture. Remote events now request a
fresh native inventory. Row/layout delivery carries its expected capture, and native
compares current tabs, identities, metadata, groups and pins before applying it;
a changed capture defers the row. Fresh shared group IDs are adopted in the runner's
capture immediately, matching native binding delivery. This follow-up is unbuilt.
Native inventories also bypass the network request queue: otherwise a captured
window could sit behind a two-minute budget wait. They retain argument validation,
a bounded reply, per-window row acknowledgements and the desktop runtime's account
checks. Received Send dismissal/opening uses its immediate local hide mutation,
so a healthy background network wait does not stall the Ledger action.
Review of that path found raw Chromium pin/group calls could dissolve a grouped
pin received from Sync. Shared layout now uses the existing Q3 grouped-pin helpers.
The full Sync gate's peer group edit also pins its member and requires both the
pin and group to survive, alongside the existing color/rename assertions.
The shipping group assertions explicitly capture the live window before pulling.
The fork transport had omitted that boundary. It now waits for the native runner
capture to match a frozen live layout (URLs, pins, group identity by name/color,
collapse and membership) before the same encrypted Worker read/assertions. A stale
layout that removes the edit still fails this boundary; no assertion was removed.
:143 also reproduced stale published group metadata on the prior candidate.

`q4-shared-remaining-1` ended after :155 because the sheet observer promise was
unhandled when a later case closed its CDP page before the observer finished.
This was a harness teardown error, not a rendering-guard bypass or a complete
inventory receipt. Completed partial evidence is retained. The explicit busy-copy
assertion still awaits the original promise; other cases now handle its rejection
without changing that assertion. Remaining :165/:175/:181/:193/:204/:211 plus
:47 and all observed failures require the next candidate run.

Focused checks pass 11/11 (`q4-shared-5-unit-focused-3.tap`). They first caught an
unexported frozen helper assumption, then a cross-VM object prototype assertion;
the desktop shim uses its own URL check and the test compares serialized values.
The first guarded compile (`q4-shared-5-build.log`) caught a data-class declaration
order, the exact const-reference callback signature, and a shadowed local name.
These are corrected for `q4-shared-6`; no build guard was bypassed.

`q4-shared-6` compiled successfully: 33 incremental actions / 37.89 s; candidate
`macos-9c7ffa36469730dc`. Targeted recovery checks are in progress. Read-only CDP
inspection confirmed the received Sent row in both actual Start Page documents.
The adapter ignored their native `blanc://newtab/` snapshot address; it now accepts
that address too. The first run retains its failure; a fresh run is owed.
Timing now annotates otherwise uninstrumented frozen shipping timeout errors,
without changing their polling or deadline. Such annotations explicitly use the
enclosing phase as an upper bound; precise instrumented waits are not counted twice.

The rebuilt crash-close check removes the closed tab before creating its view,
but its immediate receipt assertion still fails. The old readiness predicate
did not wait for the first restored inventory, a possible race now being checked.
The fork startup-readiness adapter now requires the initial save and a capture
of that exact restored window/Space with all current URLs before reading the
receipt. This adds an actual readiness condition; the close and receipt
assertions remain unchanged. A fresh run must establish whether it converges.

`q4-shared-recovery-1` confirms :94 passes on the first attempt: the new native
dirty-form probe prevents the remote background navigation from destroying
unsaved input. :73 removes the tab but fails its immediate receipt check on both
attempts; the stronger startup capture boundary is not yet rerun.

`q4-shared-recovery-1`: :94 and :119 pass on first attempts (126 s / 188 s).
The full :119 scenario now preserves the new group and covers local rename/color,
peer rename/color and adding the second tab. Ledger :63 and crash-close :73
retain their failures described above. `q4-shared-recovery-2` reruns those with
the corrected adapters, plus normal-quit :111 and group :132/:143.

Ledger now reaches and passes the real row-content assertion; dismissal exposed
a second adapter defect. Its button is hover-revealed, so the transport now
hovers the row before an actual pointer click. No force-click or DOM-injected
click replaces the user interaction. This follow-up needs a fresh run.

The stronger recovery boundary exposed a native defect, not just a race: restored
windows kept their UUID and repaired tabs but lost their active Space binding,
so their receipt could never be acknowledged. The next candidate persists the
exact Space ID in native window session extras, including session rebuilds.
After restore it validates the saved Space against current metadata and unique
window ownership, gives interrupted-switch journals precedence, and binds the
existing restored pages without recreating them. Deleted/recovered Spaces clear
the durable binding. Pending restored bindings also prevent treating an open
Space as a closed library entry during Sync updates. Native verification owed.

`q4-shared-recovery-2`: :111 preserves the saved tabs/group and applies its held
navigation, but fails the pending receipt assertion on both attempts, matching
the missing Space binding above. :132 (rail New group) passes on its first attempt.
The next patch budget is 121 unique upstream paths / 406 incremental hunks,
counting `+++ b/` paths from the selected desktop lane, excluding foundation.

`q4-shared-recovery-2` completed: :132 and :143 pass on first attempts. The latter
covers an existing shared group through local rename/color, peer rename/color,
adding the second tab and switching active tabs. Its live final native state
contained both tabs in References, rose. Ledger :63 and recovery :73/:111 keep
the known failures; the adapter and durable-binding fixes are prepared for the
next candidate. No earlier failed run is relabeled as passed.

`q4-shared-7` built successfully: 33 guarded incremental actions / 39.03 s;
candidate `macos-27c455553bc2a251`. Recovery/Send verification is running as
`q4-shared-recovery-3`. Full Sync on this candidate remains owed.

`q4-shared-recovery-3` on candidate 27c455553bc2a251: Send :63 and crash-close
:73 pass on their first attempts. The real Ledger row is dismissed by pointer,
and the restored Space inventory now acknowledges the deferred close after the
closed page is removed before view creation. Normal-quit :111 is still running.

The normal-quit readiness adapter was overbroad: a browser created by native
SessionRestore intentionally skips the *new-window* initial-save gate. Read-only
inspection shows its correct Space binding, retained group and applied navigation,
but `initialWindowSaved` remains false by design. The adapter now requires that
flag only for the crash path's reused startup window; both paths still require
completed restoration, no save errors and the exact native window/Space capture.
The original quit, receipt and group assertions remain unchanged. Fresh :111 run owed.

`q4-shared-remaining-2` reached a further real :111 defect after receipt recovery:
the next pull marked the existing group deleted. Native session restore creates
new group tokens, while the native-to-shared group map was only in memory. The
next candidate saves that mapping in window session extras (including rebuild),
remaps it with native group restoration before capture, and includes shared IDs
in saved Space group records for cold opens. Mapping is bounded/validated and
pruned to the session window's native groups; private windows persist none.
Rebinding a kept local copy also updates the actual native group's mapping.
:165 passes on candidate 27c455553bc2a251; the remaining batch is still running.

The group fix also retains native group IDs in the desktop-only durable receipt,
separately from the merge adapter's group IDs, which become shared IDs after the
first capture. Cold restore can therefore recover a lagging native session map
without inventing a new group. A focused regression covers later captures and
a group-only cold plan. Desktop bundle: 607508 bytes, SHA-256
`86659b3c86b5931c999526b95b0929fa839313512400f5c33cd00fb31f550778`.
The phone path remains unchanged. These changes are not built or qualified yet.

`q4-shared-remaining-2`: :175 (automatic sharing), :181 (choose additional
Spaces), :193 (close the selection sheet after Turn on), and :204 (new remote
Space within 25 seconds) pass on first attempts. :211 fallback discovery remains
in progress. The known :111 group-identity failure is retained; its fix awaits
native build and fresh verification. Incremental patch budget is now 121/407.

### Group identity restart and automatic discovery follow-up

`q4-shared-8` built in 38.53 seconds / 37 actions as
`macos-6094b32eb5bd5787`. Native session extra data now preserves the
window's Shared Space group bindings, remaps them with Chromium's local group
tokens before capture, and can recover the map from the durable desktop receipt
if a crash preceded the native checkpoint. Closed Space records preserve that
identity too. The new desktop-service regression exercises a later capture that
already uses shared IDs; all 12 focused desktop-spaces tests pass. Native restart
acceptance is still running.

Fallback discovery missed its original 70-second deadline twice on candidate 7.
Candidate 8 exposes only a read-only cadence diagnostic through the loopback-only
preview test transport; the scenario retains its deadline and records cadence and
request-budget evidence without URLs, keys or encrypted blobs.

The first two-complete-clients attempt timed out in the adapter's redundant
all-store pass after the first client had already uploaded Work. Read-only
observations showed responsive native inventory, ongoing budgeted requests, and
no backoff. The next run will observe the sharing action's actual upload in the
local Worker and the second client's scheduled discovery instead of injecting
another full pass. No post-join manual synchronization or quota reset is added.
The automatic retry of the known redundant-setup failure was ended by closing
only its isolated native browser (`case-0002`); it is not a pass. The batch
continued to restart/discovery checks. A fresh two-client run with the corrected
setup remains owed.

`q4-shared-recovery-4`: normal-quit deferred navigation/group identity
(`shared-spaces:111`) passes on the first attempt. The fallback diagnostic
records a genuine scheduling gap: Travel's index arrived at 11 seconds, but
the missing Space blob was never requested by the 70-second deadline; at
59–64 seconds the available budget went to bookmarks, settings, session,
icons, sends and closed. The known failing retry was ended by closing only
its isolated browser, and is recorded as a failure, not acceptance.

Desktop discovery now queues a missing indexed Space immediately through
the existing quota/backoff queue, once per missing revision, ahead of routine
work. It neither resets nor enlarges the request window. Dormant/deleted
Spaces are excluded; failures remain owned by ordinary Sync retries. All
13 desktop-spaces tests pass, including the regression for discovery before
an unrelated full-pass drain and no duplicate request on metadata changes.
The phone facade's bytes and frozen Sync modules are unchanged. Native
discovery and two-client acceptance, then the full 22-check gate, remain owed.

`q4-shared-9` built in 21.03 seconds / 8 actions as
`macos-f1a23ecf1cfd6d64`. `q4-shared-discovery-1` passes both :204 and
:211 on their first attempts. The fallback trace shows the missing Space
blob taking the first available request at 59 seconds, before routine stores;
it therefore reaches the actual native Space list within the unchanged
70-second deadline. No quota reset occurs during the assertion.
`q4-shared-two-native-1` is now running with scheduled upload/discovery setup.
The first corrected two-client setup reached peer launch in about a minute,
then exposed an adapter-only CDP target error: an embedded Island host has no
`Browser.getWindowForTarget` window. The adapter now resolves the real active
tab's target and sends window commands through the browser connection, as the
existing window adapters do. `q4-shared-two-native-1` retains both failed attempts;
`q4-shared-two-native-2` is the fresh run on candidate 9.

The second native-client run exposed a product identity loss: opening a
downloaded Space did not attach its saved shared tab IDs to the new native
tabs. Both clients consequently duplicated Work’s original tabs. Evidence is
retained in `q4-shared-two-native-2/identity-before.json`; the known-bad run
was stopped and is not acceptance. Closed records now retain shared IDs,
opening restores them after the local identity, and capture reads the native
shared identity before considering a page new. The two-client adapter also
asserts that each original fixture tab stays unique after exchange and rejoin.
`q4-shared-10` built in 34.01 seconds / 6 actions as
`macos-bff3b22505e178a1`; fresh native-client acceptance is running.

`q4-shared-two-native-3`: the complete two-native-client scenario (:47)
passes on its first attempt on candidate 10, in 499936 ms, with no timeout.
It verifies automatic two-way quiet-tab exchange, active navigation deferral,
one merged Recently closed occurrence, dormant rejoin without duplicate
original or newly added tabs, both rolling request budgets, and rendering.
`q4-shared-final-restart`: :111 also passes on its first attempt on candidate 10.
`q4-shared-coverage.json` maps all 41 formerly undefined Shared Spaces / Send
cases to passing development evidence across the recorded candidates, including
15 completed cases retained in the earlier interrupted batch. This is not a
final-candidate complete inventory. The full 22-check Sync gate is running.

### November 11 resume verification

Resumed from `a31a0fb3` with all interrupted-run edits preserved. No build/test
process was active. `q4-resume-source-check.json` reports zero unapplied source
changes; `q4-resume-build-plan.json` reports zero scheduled actions, so the tree
is already built as `macos-bff3b22505e178a1` (`q4-shared-10-runtime-config.json`).
The interrupted `q4-shared-full-sync-2` has no result and earns no gate credit.

`q4-resume-targeted` passes 4/4 on first attempts: Send Ledger :63, crash-close
:73, dirty-document navigation :94, and normal-quit navigation/group recovery
:111. Fresh full gate `q4-resume-full-sync` passes 22/22 with no lost gate passes.
The persisted-budget restart waited 120,030 ms; the local inbox remained
readable during that wait. Private and secondary profiles made no Worker requests.
Required precommit `q4-resume-precommit.tap`: 304/304 pass. Patch reconstruction
`q4-resume-precommit-patches.json`: 160 upstream / 573 canonical files, pass.
Progress freshness and whitespace pass. Desktop incremental patch budget:
121 unique upstream paths / 407 hunks, excluding the foundation baseline.
Item 3 is complete; item 5 certificate recovery and bounded eviction is next.
The final inventory and runner timing sample remain owed.

## 5 — Certificate recovery and bounded eviction

`q4-cert-scenarios`: 7/7 pass on first attempts on
`macos-910948e87a931d20` (`q4-cert-3-runtime-config.json`).
`q4-cert-bound`: 3/3 native checks pass: a one-decision test bound evicts the
oldest allowance and warns on a fresh load while committed pages remain marked
not secure; private eviction leaves regular allowances intact; the preview
transport refuses any cap above the production bound of 64.

Patch 0058 bounds actual Chromium certificate/error decisions per profile,
including nondefault storage partitions. Existing persisted decisions are
loaded oldest host modification first; each new allowance becomes newest.
Eviction removes the real decision and flushes idle connections in loaded
partitions. Committed NavigationEntry SSL state is unchanged. V8's Chromium
warning UI, certificate matching and persisted proceed policy remain in place;
the private content-setting isolation already established by patch 0016 remains.

The missing `held` adapter now reads the actual native holder. The first run
(`q4-cert-before-2`) proved the page returns but shipping's locator waits for a
new Electron tab-record id. Chromium keeps a WebContents' immutable session id.
The fork transport proves disappearance, native parking and return of that id;
the unchanged subsequent assertions compare the real CDP WebContents target and
certificate state. No page reload can satisfy the identity assertion.

Builds: initial 24 actions / 34.51 s; follow-up caught a FunctionRef generic-lambda
signature mismatch, corrected to an explicit StoragePartition pointer; final
7 actions / 20.96 s. No guard bypass. Patch budget 123 upstream paths /
417 incremental hunks; reconstruction 162 upstream / 573 canonical files.
No Sync code changed, so the full Sync gate is not repeated for this item.
Precommit: `q4-cert-precommit.tap` 309/309 pass (304 required plus five adapter
checks); `q4-cert-precommit-patches.json` reconstruction passes. Progress
freshness and whitespace pass. Item 6 microphone capture is next.

## 6 — Granted microphone capture indicator

The native snapshot now derives each tab's audio/video capture and the window
union from MediaStreamCaptureIndicator. The copied shipping renderer displays
its existing chip and popover; native Stop calls StopMediaCapturing for a tab
resolved inside that exact window. No optimistic chip-clearing or page script
pretends a stream stopped. The empty popover closes after native truth clears.
Prototype CSS had explicitly hidden the capture chip; that obsolete hide is removed.

`q4-mic-cases` passes geolocation and first exposes the CSS hide during real
microphone capture. `q4-mic-after` passes microphone :13 on its first attempt
on `macos-cb12b4f301793b46` (`q4-mic-2-runtime-config.json`). The case grants
through the real permission prompt, observes an actual live getUserMedia track,
stops the initial grant stream, starts another, checks the visible microphone
chip, switches to a new tab to verify window-wide indication, clicks native Stop
through the popover and observes both track termination and the cleared chip.
Only this case enables Chromium's synthetic media device; the owner's microphone
is never requested. The permission UI is not auto-granted or mocked.

Builds: 8 actions / 34.33 s and 7 actions / 20.97 s, guarded incremental.
Patch budget unchanged: 123 paths / 417 hunks; reconstruction 162/573.
No Sync code changed. Camera, popup and physical-device capture are unverified.
Precommit: `q4-mic-precommit.tap` 304/304 pass;
`q4-mic-precommit-patches.json` reconstruction passes. Progress freshness and
whitespace pass. Item 7 Quiet Space ownership is next.

## 7 — Quiet Space ownership

`q4-quiet-owner-cases` passes F41:34 on its first attempt. Direct Quiet now
allows a pin, matching shipping's direct `sleepTab`; automatic and batch Quiet
still exclude it. The direct path retains every other Chromium eligibility
reason and the existing dirty-document, visibility, media, permission, opener,
POST and renderer guards, rechecked after the asynchronous dirty probe.
The native discard uses the explicit reason only after those checks succeed.

`q4-quiet-owner-protections` passes all five first-attempt controls: active tab,
batch pin, dirty text, opener family and the manual sleep command. The ownership
case verifies the grouped pin stays quiet through a Space switch, inactive
navigation/auth/download refusal, and restoration of the original live draft.
No shipping assertion or source changed. Candidate `macos-4f3865e190257d03`,
`q4-quiet-owner-1-runtime-config.json`; guarded build 8 actions / 34.48 seconds.
No Sync code changed. Patch budget remains 123 upstream paths / 417 incremental
hunks; full reconstruction 162 upstream / 573 canonical files.
Required precommit `q4-quiet-owner-precommit.tap`: 304/304 pass; patch
reconstruction, progress freshness and whitespace pass.
