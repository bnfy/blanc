# Result

> **OWNER CHANGE (2026-11-11, binding, overrides the brief):** stop running the
> complete inventory and the full five-file regression after every two items.
> Until principal development is done, run only the scenarios for the item in
> hand plus the full `desktop-sync.mjs` gate when Sync code changed. Run the
> complete inventory ONCE, at the very end of this queue, and fix lost passes
> then. Keep this notice when you rewrite the file.

Queue 4 is **in progress**. Dedicated beta build/updater remains on absolute owner hold.
Current prototype: **macos-ee81ff839a8a3712**; `q4-consent-final-runtime-config.json`.

| Item | State |
| --- | --- |
| 1 Private lifecycle | Partly: five scenarios pass; native secret isolation fixed; actual Touch ID ceremony blocked by signing/Apple restriction |
| 2 Telemetry consent | Done: both original cases and three failed-write/recovery checks pass; consent verified on disk before any event |
| 3 Shared Spaces / Send | Pending |
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
| Queue 4 | Owed after item 2 | Owed after item 2 |

Lost passes: no complete comparison yet. Final gate and complete inventory remain owed.
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
