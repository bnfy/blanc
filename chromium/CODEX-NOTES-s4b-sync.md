# Result

Candidate **`macos-9d75c2778b9b408a`**; runtime config **`s4b-pairing-7-runtime-config.json`**.
20 runtime checks covered across full/focused runs; not one clean full-gate run. Local only; no push.

| Gate check | Result | Sync scenario | Result |
| --- | --- | --- | --- |
| Turn on without passphrase | Pass | :7 | Undefined — S4c |
| Pairing, QR, cancel, peer join, checklist | Pass | :13 | Undefined — S4c |
| First upload waits for Continue | Pass | :20 | Undefined — S4c |
| Favorites additions both ways | Pass | :26 | Pass |
| Mac title/folder edits; peer title/folder edits | Pass | :38 | Pass |
| Theme/blocking Mac → peer; peer → Mac | Pass | :49 | Pass |
| All seven settings Mac → peer | Pass | :56 | Pass |
| All seven settings peer → Mac | Pass | :73 | Pass |
| Clear custom search both ways | Pass | :88 | Undefined — S4c |
| Stalled runner; no false off/removals | Pass | :104 | Undefined — S4c |
| Write fault; no false off/removals | Pass | :114 | Undefined — S4c |
| Killed runner recovers | Pass | :120 | Undefined — S4c |
| Turn off retains Favorites | Pass | :129 | Undefined — S4c |
| Missing code error; remains off | Pass | :150 | Pass |
| First reconcile retains both inventories | Pass | :162 | Undefined — S4d |
| Not now persists across restart | Pass | :181 | Pass |
| Private profile refusal/no runner/traffic | Pass | :199 | Pass |
| Secondary profile refusal/no runner/traffic | Pass | :210 | Pass |
| Guarded incremental build | Pass | — | — |
| Unchanged rendering guard | Pass | — | — |
| Tool tests | Pass — 243/243 | — | — |
| Desktop patch reconstruction | Pass | — | — |
| Progress freshness / diff whitespace | Pass / Pass | — | — |
| internal-pages.feature | 10 pass | — | — |
| island-and-commands.feature | 72 pass, 1 undefined | — | — |
| vertical-tabs.feature | 7 undefined, 9 pass, 4 fail | — | — |

**Lost S4a passes: 0.** Exact comparison: 87 prior passes checked; 6 prior failures/undefined cases gained.
S4c: open tabs, Other devices, Send (:7,13,20,88,104,114,120,129). S4d: shared Spaces (:162).
Unverified: production/real devices, real Keychain, wall-clock expiry/camera/external capture, Android 156, merge stress/cross-account cache; recovery export still unavailable.
No build/test remains active. Read-only shipping trees, bundle/shims/hash and `live/` unchanged.

## Implementation and boundaries

Started from `ed162e36` on `chromium/s3-into-migration`. Work is local only.
The first commands checked `pmset` and requested four hours of `caffeinate`.
The isolated browser passed the unchanged animation-frame rendering guard.
The shell did not retain its background assertion, so a foreground tool session
holds `caffeinate -d -i -t 14400` during builds and tests.

Settings remains a section of the native Settings dialog. The existing S4a
no-passphrase account creation, code join and passphrase paths remain. S4b adds
Connect your iPhone's explicit Continue/Cancel/code-first choice, Add device's
transient pairing code, shipping's pair-link QR, countdown, cancellation,
expiry/error states, joined-device name, and resuming a live code after Settings
reopens. Closing Settings stops the watch and releases the capture request;
it does not silently cancel the live code. A private or secondary profile
cannot acquire the Sync service.

Patch `0043-blanc-sync-pairing.patch` carries the native Settings resources.
The pairing state machine and QR encoder are copied from shipping's first-party
renderer modules with an ES module wrapper. The only algorithm-body adaptation
is replacing a redundant boolean coercion required by Chromium's lint rules.
Tests compare the patched modules to shipping for expiry, cancel, late replies,
not-ready retry, join, and QR encoding. This is logic evidence; it does not claim
a ten-minute wall-clock expiry observation or actual camera scanning.

The native bridge allowlists pairing begin/cancel/state and watch calls. Only
the display code, its expiry and the joined device's public name/platform reach
Settings; keys, recovery secrets and account context are not added to the bridge.
The macOS window uses Chromium's `SetAllowScreenshots(false)` while its code is
visible. Tests read `AreScreenshotsAllowed`, the native requested state; they do
not claim that every external macOS capture API honors that request. Codes and
QR paths are omitted from test DOM summaries, logs, receipts and assertions.

The Start Page uses the shipping four-task preview checklist, including Sync
and iPhone. Official builds may additionally offer the default-browser task.
Progress is durable and device-local. Sync completion comes from a valid
`enabled:true` status; iPhone completion comes from actual synced iOS presence
or the joined-device result. Errors never manufacture progress. Settings opens
at Sync, or at its iPhone pairing sheet for that checklist entry. Native sheet
visibility lets the final completion notice wait until the Start Page can show
it. The existing Spaces save path marks its task complete. Tab-import behavior
is outside this slice's validation.

The shared Sync runner implementation, bundle, shims and bundle hash are
unchanged. No Chromium 156/Android compilation credit is claimed. There is no
production endpoint or real account/device evidence. The native fixtures use
the loopback test Worker and `--use-mock-keychain`; real Keychain remains open.
S4a's cross-account runner-cache limitation remains open; no account-switch UI
or store deletion was introduced to conceal it. Recovery-code export remains
unavailable in this preview, as in S4a.

The native setting round trips cover `theme`, `adblockEnabled`,
`adblockExceptions`, `searchEngine`, `searchEngineTemplate`, `bangsEnabled`
and `customBangs`. Clearing a custom template and returning to a stock search
engine are checked separately in both directions. Broader simultaneous-edit,
managed-setting and interrupted-write boundary stress remains unverified.

## Gate receipts

All twenty unique runtime checks have passing final-candidate evidence. This is
combined coverage, **not a single clean full-gate run**: the default run stopped
at the pairing-cleanup assertion; the focused recovery run then passed eleven
checks before the profile navigation mistake; the corrected profile run passed
both refusals. The failures and corrections are retained below.

| Runtime check | Result | Passing receipt |
| --- | --- | --- |
| turn on Sync through Settings using the embedded bundle | Pass | `s4b-final-recovery/result.json` |
| Mac pairing sheet QR, cancel and independent iPhone peer join | Pass | `s4b-final-recovery/result.json` |
| first upload holds existing Favorites until Continue | Pass | `s4b-final-recovery/result.json` |
| Favorites added on either device reach the other | Pass | `s4b-final-recovery/result.json` |
| native title edit, folder move and folder rename from Mac merge on peer | Pass | `s4b-final-e2e/result.json` |
| peer title rename and folder move merge on Mac | Pass | `s4b-final-e2e/result.json` |
| theme and blocking switch sync from Mac to peer | Pass | `s4b-final-e2e/result.json` |
| theme and blocking switch sync from peer to Mac | Pass | `s4b-final-e2e/result.json` |
| all seven native settings map from Mac to peer | Pass | `s4b-final-e2e/result.json` |
| all seven settings map from peer to native Mac | Pass | `s4b-final-e2e/result.json` |
| clearing custom search and switching to a stock engine in both directions | Pass | `s4b-final-e2e/result.json` |
| stalled runner preserves enabled state and Favorites without removals | Pass | `s4b-final-recovery/result.json` |
| refused desktop state write preserves Favorites and Sync enabled | Pass | `s4b-final-recovery/result.json` |
| a killed runner recovers without losing enabled state or Favorites | Pass | `s4b-final-recovery/result.json` |
| turning Sync off retains local Favorites | Pass | `s4b-final-recovery/result.json` |
| a missing pairing code reports the shipping error and leaves Sync off | Pass | `s4b-final-recovery/result.json` |
| first reconcile deletes nothing on either side | Pass | `s4b-final-recovery/result.json` |
| Not now keeps existing Favorites local while account Favorites download | Pass | `s4b-final-recovery/result.json` |
| private profile refuses Sync without a runner or Worker traffic | Pass | `s4b-final-profiles/result.json` |
| secondary profile refuses Sync without a runner or Worker traffic | Pass | `s4b-final-profiles/result.json` |

All receipts live under `../evidence/foundation/`. The machine-readable coverage
map is `s4b-final-gate-coverage.json`; it records each check’s source receipt and
the actual overall result of each run. Every account request used the loopback
Worker; no quotas were removed. No HTTP 429 occurred in these three runs.

The first-upload/join checks retain complete preexisting inventories, both
tombstone checks, and the ban on account/store DELETE. Pairing-code retirement
is the only allowed DELETE, with a required 204 response. Private and secondary
profiles each start no Sync runner and generate zero Worker requests.

| Build/tool receipt | Result |
| --- | --- |
| `s4b-pairing-7-build.txt` / `s4b-pairing-7-runtime-config.json` | Pass; final candidate |
| Unmodified animation-frame guard on every fresh fixture and restart | Pass; no environment stop |
| `s4b-final-tools.tap` | Pass — 243/243, zero skipped |
| `s4b-final-patches.txt` | Pass — 155 upstream outputs / 552 canonical files |
| Progress freshness and `git diff --check` | Pass; slice marker S4B |

## Scenario comparison

Complete requested sweep: `s4b-final-features-2/baseline.json`. Comparison:
`s4b-final-comparison.json`, against `s4a-final-comparison.json` by exact case ID.
S4a covered only vertical :58 and :217; the new sweep also runs its other 18.

| Feature | Final result |
| --- | --- |
| internal-pages.feature | 10 pass |
| island-and-commands.feature | 72 pass, 1 undefined |
| sync.feature | 9 undefined, 9 pass |
| vertical-tabs.feature | 7 undefined, 9 pass, 4 fail |

| Sync case | Scenario | S4a | S4b |
| --- | --- | --- | --- |
| :7 | Sharing open tabs is off by default | undefined | Undefined — S4c |
| :13 | A remote device's tab opens locally as a new ungrouped tab | undefined | Undefined — S4c |
| :20 | Turning sharing off retracts this device's tabs | undefined | Undefined — S4c |
| :26 | The moving-in checklist can be hidden permanently | fail | Pass |
| :38 | The moving-in checklist opens Settings at Sync and tracks progress | fail | Pass |
| :49 | The sync command opens Settings at the Sync section | pass | Pass |
| :56 | Completion waits until the covered start page can show it | fail | Pass |
| :73 | Adding this device with a code stops at an invalid code | pass | Pass |
| :88 | Other devices opens above the footer and starts closed | undefined | Undefined — S4c |
| :104 | Typing steps the Other devices drawer aside | undefined | Undefined — S4c |
| :114 | Without other devices there is no Other devices button | undefined | Undefined — S4c |
| :120 | The Other devices drawer leaves the tab list room in a small window | undefined | Undefined — S4c |
| :129 | Rename Device… names another device wherever it is listed | undefined | Undefined — S4c |
| :150 | Turning on Sync needs no name or passphrase | pass | Pass |
| :162 | The Add device sheet says when the new device joined | undefined | Undefined — S4d |
| :181 | Closing Settings while a code shows lets the window be captured again | undefined | Pass |
| :199 | Connect your iPhone with Sync off asks before turning it on | undefined | Pass |
| :210 | Connect your iPhone shows the code as a QR the iPhone can scan | fail | Pass |

| Every requested case | S4a | S4b |
| --- | --- | --- |
| internal-pages.feature:7:plain | pass | pass |
| internal-pages.feature:17:plain | pass | pass |
| internal-pages.feature:24:plain | pass | pass |
| internal-pages.feature:31:plain | pass | pass |
| internal-pages.feature:39:plain | pass | pass |
| internal-pages.feature:47:plain | pass | pass |
| internal-pages.feature:53:plain | pass | pass |
| internal-pages.feature:61:plain | pass | pass |
| internal-pages.feature:66:plain | pass | pass |
| internal-pages.feature:72:plain | pass | pass |
| island-and-commands.feature:11:plain | pass | pass |
| island-and-commands.feature:22:plain | pass | pass |
| island-and-commands.feature:29:plain | pass | pass |
| island-and-commands.feature:35:plain | pass | pass |
| island-and-commands.feature:43:plain | pass | pass |
| island-and-commands.feature:49:plain | pass | pass |
| island-and-commands.feature:55:plain | pass | pass |
| island-and-commands.feature:61:plain | pass | pass (retried) |
| island-and-commands.feature:73:plain | pass | pass |
| island-and-commands.feature:79:plain | pass | pass |
| island-and-commands.feature:87:plain | pass | pass |
| island-and-commands.feature:93:plain | pass | pass |
| island-and-commands.feature:99:plain | pass | pass |
| island-and-commands.feature:107:plain | pass | pass |
| island-and-commands.feature:115:plain | pass | pass |
| island-and-commands.feature:123:plain | pass | pass |
| island-and-commands.feature:131:plain | pass | pass |
| island-and-commands.feature:140:plain | pass | pass |
| island-and-commands.feature:149:plain | pass | pass |
| island-and-commands.feature:156:plain | pass | pass |
| island-and-commands.feature:166:plain | pass | pass |
| island-and-commands.feature:173:plain | pass | pass |
| island-and-commands.feature:180:plain | pass | pass |
| island-and-commands.feature:190:plain | pass | pass |
| island-and-commands.feature:200:plain | pass | pass |
| island-and-commands.feature:211:plain | pass | pass |
| island-and-commands.feature:222:plain | pass | pass |
| island-and-commands.feature:234:plain | pass | pass |
| island-and-commands.feature:241:plain | pass | pass |
| island-and-commands.feature:251:plain | pass | pass |
| island-and-commands.feature:258:plain | pass | pass |
| island-and-commands.feature:267:plain | pass | pass |
| island-and-commands.feature:276:plain | pass | pass |
| island-and-commands.feature:286:plain | pass | pass |
| island-and-commands.feature:295:plain | pass | pass |
| island-and-commands.feature:312:plain | pass | pass |
| island-and-commands.feature:320:plain | undefined | undefined |
| island-and-commands.feature:339:plain | pass | pass |
| island-and-commands.feature:348:plain | pass | pass |
| island-and-commands.feature:359:plain | pass | pass |
| island-and-commands.feature:372:plain | pass | pass |
| island-and-commands.feature:383:plain | pass | pass |
| island-and-commands.feature:394:plain | pass | pass |
| island-and-commands.feature:403:plain | pass | pass |
| island-and-commands.feature:411:plain | pass | pass |
| island-and-commands.feature:420:plain | pass | pass |
| island-and-commands.feature:429:plain | pass | pass |
| island-and-commands.feature:436:example-443 | pass | pass |
| island-and-commands.feature:436:example-444 | pass | pass |
| island-and-commands.feature:436:example-445 | pass | pass |
| island-and-commands.feature:448:example-456 | pass | pass |
| island-and-commands.feature:448:example-457 | pass | pass |
| island-and-commands.feature:448:example-458 | pass | pass |
| island-and-commands.feature:448:example-459 | pass | pass |
| island-and-commands.feature:462:plain | pass | pass |
| island-and-commands.feature:469:plain | pass | pass |
| island-and-commands.feature:477:plain | pass | pass |
| island-and-commands.feature:485:plain | pass | pass |
| island-and-commands.feature:493:plain | pass | pass |
| island-and-commands.feature:508:plain | pass | pass |
| island-and-commands.feature:517:plain | pass | pass |
| island-and-commands.feature:532:plain | pass | pass |
| island-and-commands.feature:543:plain | pass | pass |
| island-and-commands.feature:558:plain | pass | pass |
| island-and-commands.feature:565:plain | pass | pass |
| island-and-commands.feature:573:plain | pass | pass |
| island-and-commands.feature:591:plain | pass | pass |
| island-and-commands.feature:599:plain | pass | pass |
| island-and-commands.feature:608:plain | pass | pass |
| island-and-commands.feature:621:plain | pass | pass |
| island-and-commands.feature:632:plain | pass | pass |
| island-and-commands.feature:640:plain | pass | pass |
| island-and-commands.feature:651:plain | pass | pass |
| sync.feature:7:plain | undefined | undefined |
| sync.feature:13:plain | undefined | undefined |
| sync.feature:20:plain | undefined | undefined |
| sync.feature:26:plain | fail | pass |
| sync.feature:38:plain | fail | pass |
| sync.feature:49:plain | pass | pass |
| sync.feature:56:plain | fail | pass |
| sync.feature:73:plain | pass | pass |
| sync.feature:88:plain | undefined | undefined |
| sync.feature:104:plain | undefined | undefined |
| sync.feature:114:plain | undefined | undefined |
| sync.feature:120:plain | undefined | undefined |
| sync.feature:129:plain | undefined | undefined |
| sync.feature:150:plain | pass | pass |
| sync.feature:162:plain | undefined | undefined |
| sync.feature:181:plain | undefined | pass |
| sync.feature:199:plain | undefined | pass |
| sync.feature:210:plain | fail | pass |
| vertical-tabs.feature:9:plain | not requested | undefined |
| vertical-tabs.feature:21:plain | not requested | undefined |
| vertical-tabs.feature:34:plain | not requested | undefined |
| vertical-tabs.feature:43:plain | not requested | pass |
| vertical-tabs.feature:58:plain | pass | pass |
| vertical-tabs.feature:74:plain | not requested | pass |
| vertical-tabs.feature:90:plain | not requested | undefined |
| vertical-tabs.feature:99:plain | not requested | pass |
| vertical-tabs.feature:110:plain | not requested | pass |
| vertical-tabs.feature:120:plain | not requested | pass |
| vertical-tabs.feature:129:plain | not requested | fail (retried) |
| vertical-tabs.feature:146:plain | not requested | fail (retried) |
| vertical-tabs.feature:159:plain | not requested | undefined |
| vertical-tabs.feature:172:plain | not requested | undefined |
| vertical-tabs.feature:184:plain | not requested | pass |
| vertical-tabs.feature:194:plain | not requested | pass |
| vertical-tabs.feature:201:plain | not requested | undefined |
| vertical-tabs.feature:217:plain | pass | pass |
| vertical-tabs.feature:239:plain | not requested | fail (retried) |
| vertical-tabs.feature:249:plain | not requested | fail (retried) |


The final sweep totals **100 pass / 4 fail / 17 undefined** across 121 cases.
All 87 S4a passes are present and still pass. Island :61 passed on the runner's
standard second attempt (first attempt saw the hover panel still open); no
Sync case required a retry. Sync :162 completed all ten defined steps on its
first attempt, then stopped at the S4d question. Its focused receipt is
`s4b-joined-prefix/baseline.json`.

The four failures are in newly requested vertical-tab coverage, outside S4b;
no step was changed to pass them:

| Vertical case | Observed failure (both attempts) |
| --- | --- |
| :129 | Setup did not retain pinned and unpinned members in one named group |
| :146 | Timed out waiting for the page-favicon fixture condition |
| :239 | Rail main-menu button remained hidden/unreachable |
| :249 | Shipping step calls missing adapter method `input.pressSequentially` |

Vertical undefined cases: :9 (`mergeRemoteTabLayout`), :21 (Island layout toggle),
:34 (layout shortcut), :90 (active-page/draft observations), :159 (native menu
labels), :172 (focus observations), :201 (`railActivationSerial`). Island :320
retains its missing window-button geometry adapter. These are reported, not
credited to S4b or represented as a complete desktop acceptance pass.

S4c owns Sync :7, :13, :20, :88, :104, :114, :120 and :129 (open-tab publishing,
Other devices, and remote-device naming). S4d owns :162's shared-Spaces question
and its Not now/Turn on answers. Its join and joined-name steps now have fork
adapters; the standalone local gate tests this S4b behavior independently. The
full scenario stays undefined
until its S4d steps have real adapters. No shipping step or scenario is changed.

## Retained earlier receipts

- `s4b-pairing-1` and `-2`: WebUI CSS/event-handler lint failures; corrected.
- `s4b-pairing-3`: native compile caught the Windows-only capture API and a
  missing ProfileManager include. The Mac implementation uses Chromium's
  cross-platform screenshot-permission API instead.
- `s4b-pairing-4`: guarded build passed; candidate `macos-b327f9aa790cfb4c`.
  `s4b-targeted-1`: all six cases (:26, :38, :56, :181, :199, :210) passed.
- `s4b-pairing-5`: guarded build passed; candidate `macos-10b87b5ef0db1894`.
  `s4b-e2e-1`: seven checks passed, then CDP timed out during reverse settings
  sync. No Worker 429 occurred. The driver cut a native RPC's explicit
  120-second deadline down to 15 seconds; the CDP layer now honors the native
  operation's deadline. Ordinary CDP calls keep their existing timeout.
- `s4b-tools-1`: 242/243 passed; reconstruction itself passed, but its fixed
  expected output count needed 153 → 155 for the two added WebUI modules.
  All original assertions remain, with the exact new allowlist and resource
  count. The original theme/blocking UI checks remain in the extended gate.

Patch budget after S4b: 42 patches, 524 hunks and 151 patched paths; reconstruction
covers 155 desktop outputs and 552 canonical files. No budget increase was
requested. The initial resource addition required GN regeneration with unchanged
arguments through the supplied wrapper; caches, toolchain and build mode stayed
in place. `s4b-pairing-6` caught a boolean-template lint error in the final notice
visibility binding; `s4b-pairing-7` rebuilt successfully after the correction.
All builds and test runs were serial. The owner's running `live/` app was not
opened, modified, replaced or stopped.

Additional development receipts: `s4b-e2e-2` passed twelve checks, including
all seven mappings both ways and the stalled runner, then failed to observe a
write error after its helper changed tabs. `s4b-recovery-1` encountered a runner
timeout during the extra unpaced Sync now operation used to clear that notice;
it did not prove the disk-write path. The final disk check reopens Settings
without another network pass and requires the exact native
`desktop-state-write-failed` event as well as a visible notice. Earlier failed
receipts are retained; none is counted as a successful gate.

`s4b-recovery-2` passed the stalled runner, exact disk-write failure and recovery,
and killed-runner checks. It then timed out opening Sync because the old test
helper re-invoked the already-open Settings sheet, which correctly toggles it
closed. The helper now inspects native attachment and navigates an existing
sheet. This is a test setup correction, with no browser/image change.

`s4b-final-e2e` passed sixteen checks. Its first-reconcile data inventories and
both tombstone checks passed, but its blanket no-DELETE assertion included
shipping's successful deletion of a used `/v1/pair/…` code. The assertion now
requires every DELETE in that interval to be successful pairing cleanup;
account/store DELETEs still fail. No shipping scenario or step changed. The
following recovery/join run validates that distinction and the remaining checks.

`s4b-final-recovery` passed all eleven recovery/join checks, including first
reconcile and Not now across restart. Its private-profile setup incorrectly
requested `/general`, a UI label rather than Chromium's root Settings route;
the refusal checks now use `/` and have a focused `--profiles-only` run. The
default mode continues to run every check; focused modes only select groups.

The first four-feature sweep (`s4b-final-features`) retained all 87 S4a passes
and gained six Sync passes. The new :162 adapter joined a real peer but did not
deliver its session entry before the unchanged 30-second display assertion;
both attempts timed out. Shipping's fixture directly injects an already-received
session entry. The fork adapter now explicitly reads the real Worker's stores
after peer join, pacing below the unchanged Worker quota, before that assertion.
It neither invents joined state nor extends the shipping display timeout.
Vertical :129, :146, :239 and :249 failed in newly requested coverage; none was
an S4a pass. The final sweep and detailed table remain authoritative.
