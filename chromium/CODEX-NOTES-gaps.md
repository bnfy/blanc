# Result

> **OWNER BUG REPORT (2026-11-11, binding, do next after the item in hand): Sync section layout in the Settings dialog.** In the live build with Sync on, the checkbox rows are broken: each checkbox sits in the middle of the row and its label is pushed to the far right and wraps onto the next line ("Open tabs — From this / device", "Keep Spaces and groups / in sync on this device", "Also delete synced data"). Fix so each checkbox sits at the left with its label beside it on one line, matching shipping's Settings → Sync (`src/renderer/pages/settings.html` / `pages.css`, read-only reference) in order, spacing, grouping and copy. Also check against shipping: the device name row ("My Blanc"), the "This device stops syncing…" text placement relative to Turn off, and whether "Add this Mac's favorites to your sync?" should still show once Sync is on and the choice was made. Verify in light and dark, at the dialog's narrow and wide widths, and save before/after screenshots to the evidence folder. Keep this notice when you rewrite the file.

> **OWNER CHANGE (2026-11-11, binding, overrides the brief):** stop running the complete inventory and the full five-file regression after every two items. Until principal development is done, run only the scenarios for the item in hand plus the full `desktop-sync.mjs` gate when Sync code changed. Run the complete inventory ONCE, at the very end of this queue, and fix lost passes then. Keep this notice when you rewrite the file.

> **OWNER ADDITION (2026-11-11, binding): runner timing baseline.** Before the single end-of-queue inventory, add per-phase timing to `chromium/tests/runner.mjs` (browser launch, blocker readiness, reset between cases, appearance setup, step execution, waits that ran to timeout, retries, teardown), written to the run's evidence as a JSON summary with totals and the 20 slowest cases. Record a baseline over a 60-case sample across at least six feature files. Then remove the obvious waste (for example fixed sleeps, re-doing setup that is already in the wanted state, relaunching when a reset is enough) WITHOUT weakening any assertion, the rendering guard, or isolation between cases; rerun the same sample and report before/after per phase. Shipping's Electron harness (`test/desktop/`, read-only) is the comparison for what a case should cost. Report it in a "Runner timing" section. Keep this notice when you rewrite the file.

Queue 4 verification is complete for this pass; items 1, 9 and 11 retain the explicit gaps below.
Final prototype: **macos-16b70f7e53699ab5**; `q4-final-repair-1-runtime-config.json`.

| Item | State |
| --- | --- |
| 1 Private lifecycle | Partly: five scenarios and native secret isolation pass; actual Touch ID ceremony needs signed entitlements and owner interaction |
| 2 Telemetry consent | Done: both original cases and failed-write/recovery checks pass; consent saved before events; tests stay local |
| 3 Shared Spaces / Send | Done: all 33 + 8 cases pass in the full inventory; affected restart controls and full Sync pass on final build |
| 4 Updater | Excluded: absolute owner hold on beta build remains |
| 5 Certificate recovery / eviction | Done: seven scenarios and three native eviction/isolation checks pass |
| 6 Microphone indicator | Done: real permission, synthetic input, window-wide chip and Stop pass |
| 7 Quiet Space ownership | Done: ownership and five protection controls pass |
| 8 Glance / original failures | Done: seven original macOS failures pass; original Linux-only failure is explicitly inapplicable |
| 9 Pinned homes | Partly: six web cases pass; local HTML home needs missing N15 isolated preview |
| 10 Open-tab / Arc import | Done: 22 macOS cases, two secondary-profile checks and full Sync pass |
| Owner Sync dialog | Done: four visual states, device name, consent persistence, settings-journal faults and erasure retry pass |
| 11 Remaining adapters | Partly: ten further targets pass; 102 undefined cases retain explicit adapter/product/platform gaps |

| Evidence | Sync pass/fail | Full inventory pass/fail/undefined/excluded |
| --- | --- | --- |
| Owner baseline | 22/0 | 443/8/187/2 |
| Single inventory: macos-9987cc7166c3c921 | 22/0 | 533/3/102/2 |
| Final repair: macos-16b70f7e53699ab5 | 22/0 | Not repeated; 12/12 targeted checks pass |

Lost passes: F41 :51, Sync :210 and tabs/groups :347 all repaired and passing without retry on final build; none outstanding.
The raw inventory gained 93 passes; its three failures remain preserved, not relabeled as a new full run.
Runner sample: same 60 cases / six files, 60/60 both runs; 265.559s → 234.341s (11.8% less), no lost passes.
Owner needs: signed/entitled Touch ID acceptance; beta/updater hold remains. No input needed for the completed repairs.
Unverified: full inventory on repaired bytes, 102 remaining gaps, real microphone hardware, physical shortcuts/accessibility, other platforms and release qualification.
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

The same 60 cases across six feature files in `chromium/tests/timing-sample.json`
ran on macos-9987cc7166c3c921 before and after setup optimization. Selection is
the first ten original baseline passes in tabs/groups, navigation, newtab,
vertical tabs, Quiet Tabs and Glance; it was fixed before either run.
`q4-timing-before` and `q4-timing-after` each finish 60/60 pass, no lost passes.
`q4-timing-comparison.json` binds their candidate, case IDs and harness hashes.
Both timing.json files contain all attempts, totals and the 20 slowest cases.

| Phase (exclusive seconds) | Before | After | Change |
| --- | ---: | ---: | ---: |
| blockerReadiness | 93.943 | 95.293 | +1.350 |
| browserLaunch | 26.953 | 28.034 | +1.080 |
| fixturePreparation | 23.049 | 14.051 | -8.999 |
| renderingGuard | 0.340 | 0.358 | +0.018 |
| reset | 12.344 | 12.524 | +0.180 |
| appearance | 32.931 | 0.339 | -32.591 |
| steps | 48.532 | 56.377 | +7.845 |
| teardown | 27.293 | 27.179 | -0.114 |
| Recorded case time | 265.559 | 234.341 | -31.218 |

Overall reduction: 11.8%, including the after run's one existing retry.
Before: zero retries/timeouts. After: vertical-tabs :58 initially timed out
waiting for the rendered width (248 rather than 360); its unchanged assertion
passed on the one retry. Timeout phase upper bound: 7.056 s; retry attempt:
4.371 s. These annotate the totals, not extra time added to them.

Shipping `test/desktop/support/hooks.js` mints TLS certificates in BeforeAll.
The fork now likewise caches only immutable certificate material for one runner
process, keeping five distinct keys and returning copied buffers. Every case
still has a fresh browser profile, servers, TLS contexts, response state and
certificate-exception decisions. Temporary minting files are removed immediately.
Fixture theme setup now calls the production typed light-theme command and
waits for the host's rendered light media state instead of opening/closing
Settings. Scenario steps that exercise Settings still use its real UI.
No assertions, rendering guards, isolation, quotas or candidate hashing weakened;
no browser reuse added. Setup savings total 41.590 s, partly offset by normal
step variation and the timeout/retry above. Precommit: 309/309; reconstruction
162 upstream / 583 canonical, progress freshness and whitespace pass.

## 3 — Shared Spaces and Send

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

## 8 — Glance and original inventory failures

`q4-other-failures-after`: Glance :88 and :98 and tabs/groups :112 pass on
first attempts on `macos-ee619ff9ece15ce0` (`q4-glance-1-runtime-config.json`).
The cancellation adapter sends real Escape through CDP after observing busy;
the following unchanged steps prove no delayed attachment and successful retry.
The focus adapter reads the probe from its owning Glance iframe, then also
checks native main-page focus and the page's actual `document.hasFocus()`.
The product now shows the translated tucked-tabs count under collapsed group
headers, generated exclusively through `island-renderer.mjs` EDITS.

`q4-other-failures-before` additionally passes F41:613 group color through
Space transfer and crash recovery on the item 7 candidate. Item 7 fixed F41:34;
item 2 fixed both consent failures. The eighth original failure, vertical-tabs
:239, explicitly requires Linux (`@test-platform-linux`); it remains undefined
on native macOS, with a by-construction reason, rather than pretending that
Electron's platform-spoof test qualifies another native platform.
Guarded build: 7 actions / 20.98 seconds. No Sync code changed.
Patch budget remains 123 paths / 417 incremental hunks (162/573 reconstruction).
`q4-linux-inapplicable` confirms :239 stays undefined without launching a
spoofed platform. The same rule applies to the Linux-only floating-window
controls case in island-and-commands:320. Required precommit
`q4-glance-precommit.tap`: 304/304 pass; reconstruction, progress and whitespace pass.

## 9 — Pinned homes

The native tab owns its home independently of its current navigation. Explicit
pinning captures it, unpinning clears it, and Set Current Page as Home and Return
to Home use the shipping menu labels. Native session extra data, Recently closed,
duplicates, window moves, discarded-tab replacement and Space records preserve
it. A clean startup replaces a pinned tab's navigation with a fresh home entry;
crash recovery keeps its current navigation. Private homes stay in memory and
never enter the regular session store. Clearing history does not touch homes.

`q4-pinned-cases` passes tabs/groups :240, :256, :270, :278 and :284 on their
first attempts. `q4-pinned-slow-cache` passes :249 on its first attempt after
correcting the fixture: Chromium's cached response defeated the deliberately
slow home. The adapter clears the real HTTP cache after initially loading and
pinning that page; the original loading/title assertions are unchanged.
The transfer adapter accounts for Chromium's retained WebContents retaining its
immutable ID on reopening, while preserving every home/transfer assertion.

:292 remains undefined: the fork has no N15 isolated local HTML preview. A raw
file navigation would bypass the required access policy, so the adapter refuses
it explicitly. That is a missing product capability, not platform inapplicability.
File homes and physical input/accessibility remain unverified.

Candidate `macos-adb1daee018d8289`, `q4-pinned-1-runtime-config.json`.
Guarded incremental build: 35 actions / 38.54 seconds. Patch 0059 touches three
already-pinned upstream files; no new upstream paths. Full Sync gate
`q4-pinned-full-sync`: **22/22 pass**, including persisted quota wait and
private/secondary-profile refusal. Patch budget: 123 upstream paths / 420
incremental hunks; full reconstruction remains 162 upstream / 573 canonical files.

Required precommit `q4-pinned-precommit.tap`: 304/304 pass; patch
reconstruction, progress freshness and whitespace pass. Item 10 is next.

## 10 — Open-tab and Arc import

Native discovery reads labels before selection; selected session/Arc files are
bounded and read twice with identity/mtime checks. Chromium snapshots use the
newest session without post-quit fallback; no source browser is modified or
force-quit. The shipping parsers and organizer run on the pinned v1.46.0 code,
and the shipping Bring Your Tabs page is served through the native utility
sheet and Start Page/onboarding links. Opaque window-owned projections omit
raw URLs and paths. Native apply creates one quiet batch, retains duplicates,
source order, pins and names, and rolls back a partial failure without adding
Recently closed entries. Arc creates saved Spaces without switching windows;
the name and content share one atomic disk record, with recoverable metadata.
Favorites merge into Arc, preserving existing duplicates.

`q4-import-cases`, `q4-import-targeted-2` and `q4-import-space-diagnose` cover all
15 open-tab cases. Corrected adapter labels and driver reuse; a Space-save
fixture now waits for the first imported page to finish loading before saving.
`q4-import-final-targets` passes all seven macOS Arc cases and the 500-tab
batch case on macos-c3d8bc57965cd402. Linux Arc :53 is explicitly inapplicable
to native macOS. The build took 9 guarded actions / 34.07 seconds.

`q4-import-full-sync` passed **22/22** on the candidate above. Review then
found that local imports depended on Personal's Sync service. The follow-up
is now applied: a separate sandboxed import parser per window, with no Sync
service/account dependency and a host denying network, store and credential
I/O. The Sync bundle, API, prelude and service are byte-identical to the item 9
commit. The four isolated parser/ownership/no-I/O unit checks pass.
`q4-import-5` built in 6 guarded actions / 34.06 seconds with unchanged GN
arguments, candidate macos-8f6629dd83705e04. `q4-import-local-cases` is
22 pass / 0 fail / 1 Linux-only undefined. `q4-import-local-profiles` passes
both secondary-profile import and restart checks, with no Sync store created.
Precommit tests 308/308 and reconstruction 162 upstream / 583 canonical pass.
Incremental patch budget at item 10 remains 123 upstream paths / 420 hunks.
`q4-import-local-full-sync` passed **22/22** on this exact candidate, including
the persisted quota restart and private/secondary-profile refusal. Item 10 is
complete. Next is the owner-reported Sync dialog layout, before item 11. Do not rerun the applied
`/tmp/q4-import-local-stage/integrate.py`.

Remaining-adapter work is staged separately in `/tmp/q4-adapters-stage/`;
apply only after the import commit. Its `timing-sample.json` selects 60 prior
passes across six files. **Do not apply `optimize-timing.py` until the baseline
sample has finished.** Both timing runs and the single final inventory remain
owed. No external stop has occurred; this is a live recovery checkpoint.

The next owner-requested Sync layout capture script is staged at
`/tmp/q4-sync-layout-stage/sync-layout.mjs`; run its `--before` mode after the
import commit, before changing the Sync UI. Checkbox widths incorrectly inherit
the generic text-input rule. The fork also lacks shipping's separate device-name
input; My Blanc is the account name. No Sync UI fix has been applied yet.


## Owner report — Settings Sync layout

Patch 0060 fixes generic text-input width applying to checkboxes. The native
Sync page now follows shipping's account / What syncs / Devices / recovery /
More options order, with adjacent one-line checkbox labels. Device name is a
separate editable field from the My Blanc account link; the native command
bounds the name to shipping's 80 UTF-16 units. Turn-off explanation stays with
that action. Accepted and declined first-upload choices stay dismissed after
reopen and restart. The phone bundle and shipping sources are unchanged.

Before evidence: `q4-sync-layout-before-2` saves eight images across narrow /
wide and light / dark, top and turn-off. Its dark palette uses media emulation
solely for the before captures. Final after evidence:
`q4-sync-layout-after-5` passes seven checks and saves eight inspected images;
all four states use the real native profile theme with no media emulation.
Geometry checks require all three checkbox labels on one line, and the lower
capture includes the delete checkbox, label and turn-off button. Device name
persists on reopen and restart. After-4 also passed but its lower wide crop
missed the checkbox; after-5 corrects that evidence limitation.

Validation exposed a real settings race: an earlier local light publish could
be mistaken for a remote change and overwrite a newer native dark choice.
`q4-sync-layout-after-3` records light -> dark -> light within 227 ms while
settingsSeen still held system. An isolated no-Sync profile changed correctly.
The native service now persists settingsOutgoing before publishing, verifies
and acknowledges its own echo before comparing later local edits, and retains
the existing conflict policy for genuinely different remote values. Settings
also observes the explicit profile theme. `q4-sync-settings-journal` passes
rapid-change, refused-write and persisted post-publish/pre-ack restart-fixture
checks (3/3); the restart fixture is not a power-loss experiment.

`q4-sync-layout-3` built in 6 actions / 20.52 seconds:
macos-9987cc7166c3c921, `q4-sync-layout-3-runtime-config.json`.
The earlier layout-1 build stopped at CSS formatting lint; layout-2 passed
layout checks but exposed the settings race. Those diagnostics are preserved.
`q4-sync-layout-erasure` passes shared-spaces :103 without retry.
`q4-sync-layout-full-sync` passes 22/22, including both consent choices and
private/secondary refusal; persisted restart quota waited 120034 ms while the
local inbox remained readable. Precommit-3 passes 308/308; patch reconstruction,
progress freshness and whitespace pass. Patch budget: 123 incremental upstream
paths / 430 hunks; full reconstruction 162 upstream / 583 canonical files.

Item 11 adapter targets and the timing comparison are now complete.
The single complete inventory and its repairs are recorded below. No external stop occurred.

## 11 — Further user-visible adapters

`q4-adapters-1` passes ten targets on macos-9987cc7166c3c921:
F41 :16/:22/:103/:162/:254/:262, Glance :221/:459, newtab-layouts :134,
and tabs-and-groups :392. The adapters supply accessible button-name selection,
page visibility, canonical modifier keys, real CDP wheel input, native audio
mute state, real Reduce Motion media emulation, and the existing global Quiet
Tabs preference command. Start Page font/layout audits are copied from the
v1.46.0 hook and read the actual native tab document. Shipping assertions are
unchanged. F41 :16 and newtab :134 each used the existing one retry: first
attempts respectively timed out opening the editor and observed a native-frame /
renderer-size mismatch. Both failures remain in the evidence.

The focused accessible-name unit check covers labels, hidden controls and exact
versus substring/regex matching. Precommit: 309/309; native product unchanged,
so no additional build or full Sync run is needed. The full gate on this exact
candidate remains q4-sync-layout-full-sync, 22/22. The final inventory and targeted repair results are recorded below. Remaining undefined adapters are not
passes: overlay lifecycle/focus, local HTML preview, profile/search management,
physical passkeys and unavailable platform/Electron operations need separate
coverage or product work.

## Final inventory and targeted repairs

The only complete inventory is `q4-final-inventory`, launched from 3f6cfa13
on macos-9987cc7166c3c921 / q4-sync-layout-3-runtime-config.json. It completed
640 cases: 533 pass / 3 fail / 102 undefined / 2 excluded, with 93 newly passing
cases relative to q3-whole-inventory and three lost passes. The raw receipt is
committed at `chromium/scenarios/baseline-macos-9987cc7166c3c921.json` and the
comparison is `q4-final-comparison.json`. It is never relabeled for the repaired
candidate. Tracker Bar A correctly treats it as stale for the final binary.
Recorded case time: 6557.0 seconds. Five cases used the existing one retry:
three remained failed; newtab-layouts :171 and permissions-and-auth :13 passed
on retry. One wait reached timeout (capture popover, about five seconds).
All 33 Shared Spaces and all eight Send cases passed in this full run; the
two-native-client exchange/deferral/rejoin/budget case passed in 496.9 seconds.

The three lost passes were diagnosed and repaired:

- F41 :51: item 3's closing_all capture guard also suppressed WillCloseAllTabs'
  final intact-model snapshot. A recent ordinary-tab removal therefore left an
  older Space record on disk. Only that pre-teardown callback now opts into
  capture; periodic snapshots still reject draining and empty models. The
  private-only Space now reopens with one Start Page, not removed ordinary tabs.
- Sync :210: the checklist click could precede its asynchronous Start Page
  projection. The diagnostic passed once the row was painted. The adapter now
  waits for the real available task before opening the popover and retains
  the exact visible-button/popover assertions. No action is injected into a
  hidden task and the shipping step is unchanged.
- Tabs/groups :347: the explicit-position Locator click skipped actionability.
  The diagnostic recorded a zero-height #islandList and pointerdown on the
  backdrop. Position clicks now require visibility, stability and a hit on the
  requested point, like center clicks. The unchanged shipping step catches
  the unavailable-list click, then observes that the panel remains open.
  Tests verify no input is dispatched for zero height and that a visible
  target gets the requested coordinate, not its center.

`q4-final-diagnostic` preserves DOM/event evidence. `q4-final-ui-repairs`
passes both UI cases on the pre-repair binary without diagnostic preloads.
Guarded `q4-final-repair-1`: 6 actions / 34.32 seconds; final native candidate
macos-16b70f7e53699ab5. `q4-final-repair-targeted` passes 11/11 on first attempts:
F41 :22/:51; Shared Spaces :73/:94/:111; Sync :26/:38/:56/:210; tabs/groups :347;
and vertical tabs :43. `q4-final-repair-empty-space` separately passes F41 :28
(the first batch's :26 selector matched no case); total 12/12, no retry.
`q4-final-repair-full-sync` passes 22/22; persisted restart quota waited
120034 ms with the local inbox readable. No second full inventory ran.
Required `q4-final-repair-precommit.tap`: 311/311 pass. Patch reconstruction:
162 upstream / 583 canonical files. Incremental patch budget remains 123
upstream paths / 430 hunks. Progress freshness and whitespace pass. Read-only
shipping paths and the phone Sync implementation remain unchanged.
No native build or test is left running at completion. No external stop occurred.

Remaining undefined cases are explicit future work, not inferred product passes:

| Feature area | Undefined cases |
| --- | ---: |
| Glance | 22 |
| Spaces | 17 |
| Tab archive | 16 |
| Platform services | 8 |
| Link routing | 7 |
| Other files | 32 |

Three cases are explicitly Linux-only (Arc import :53, Island :320, vertical
tabs :239). The other cases retain their individual missing-hook, unsupported
Electron operation or missing-capability reason in the raw baseline. This
includes actual device-bound passkeys and the N15 local-document preview;
a raw file navigation or virtual authenticator is not claimed as acceptance.
The timing comparison above is a same-candidate harness benchmark and source
comparison with shipping's setup, not an Electron benchmark or release claim.
