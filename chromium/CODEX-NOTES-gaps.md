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
Current prototype: **macos-87c5b01575afd817**; `q4-shared-4-runtime-config.json`.

| Item | State |
| --- | --- |
| 1 Private lifecycle | Partly: five scenarios pass; native secret isolation fixed; actual Touch ID ceremony blocked by signing/Apple restriction |
| 2 Telemetry consent | Done: both original cases and three failed-write/recovery checks pass; consent verified on disk before any event |
| 3 Shared Spaces / Send | Partly: nine fault checks, selection/cancel, parked remote close and Send inbox pass; remaining scenarios owed |
| 4 Updater | Deliberately excluded: absolute beta-build hold |
| 5 Certificate recovery / eviction | Pending |
| 6 Microphone indicator | Pending |
| 7 Quiet Space ownership | Pending |
| 8 Glance / other failures | Pending |
| 9 Pinned homes | Pending |
| 10 Open-tab / Arc import | Pending |
| 11 Remaining adapters | Pending |

| Evidence | Sync pass/fail | Inventory pass/fail/undefined/excluded |
| --- | --- | --- |
| Owner baseline | 22/0 | 443/8/187/2 |
| Queue 4 current prototype | 22/0 | Final inventory owed; earlier run stopped per owner change |

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
