# Result

Queue 4 is **in progress**. Dedicated beta build/updater remains on absolute owner hold.
Current prototype: **macos-a1bd86341c373179**; `q4-private-runtime-config.json`.

| Item | State |
| --- | --- |
| 1 Private lifecycle | Partly: five scenarios pass; native secret isolation fixed; actual Touch ID ceremony blocked by signing/Apple restriction |
| 2 Telemetry consent | Pending |
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
