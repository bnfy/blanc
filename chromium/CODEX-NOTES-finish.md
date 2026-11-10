# Result

Local work from `b4bd80c5`; no push or release action.
Candidate: `macos-e7a071bb7948929b`; config: `finish-vertical-2-runtime-config.json`.

| Queue item | State |
| --- | --- |
| 1 S4c tabs, Other devices, Send | Requested cases done; native icon upload blocked by frozen bridge |
| 2 S4d shared Spaces | Blocked: phone bridge lacks desktop window contract |
| 3 Clean full gate and four files | Current candidate done; final rerun owed after queued fixes |
| 4 Vertical/Island leftovers | Repairs done; V16 and Linux-only cases remain explicit |
| 5 Beta identity | Pending; coordinating branch/version correction below |
| 6 Sparkle updater | Pending |
| 7 Review 0041 | Pending |

| Full-run evidence on S4c candidate (before item 4) | Pass | Fail | Undefined |
| --- | ---: | ---: | ---: |
| Whole desktop-sync gate, one run | 21 | 0 | 0 |
| sync.feature | 17 | 0 | 1 |
| internal-pages.feature | 10 | 0 | 0 |
| island-and-commands.feature | 72 | 0 | 1 |
| vertical-tabs.feature | 9 | 4 | 7 |
| S4b four-file baseline (comparison) | 100 | 4 | 17 |

Lost S4b passes in full comparison: **0 of 100**. Eight Sync cases gained.
Item 4 focused evidence: 18 vertical passes across two builds; 2 fail remain.
Current candidate tabs/Send gate: **3/3 pass**, including duplicate/restart exclusion.
Owner input: desktop Spaces bundle entry and native icon bridge need authorization.
Unverified: final revised candidate, real Keychain/devices, signed beta/updater.

## Addendum from the coordinating session (2026-11-10), binding for items 5 and 6

- `origin/chromium/beta-release-setup` no longer exists: it was merged (PRs #1438,
  #1440) into `origin/chromium/migration`, which is 3 commits ahead of this branch.
  For item 5, merge `origin/chromium/migration` instead.
- OWNER DECISION (2026-11-10, final): the beta version is `2.0.0-beta.N`, as the
  brief says. The merged tooling still pins `1.0.0-beta.N`; as part of item 5,
  change `chromium/release/policy.mjs`, its tests, fixtures, the runbook and any
  other reference to `2.0.0-beta.N` and the tag form `chromium-beta-2.0.0-beta.N`.
  Keep the rule that `CFBundleShortVersionString` and the Sparkle short version
  both show the full beta version. Otherwise the merged tooling is the authority
  where it differs from the brief.
- Still as briefed: name Blanc Beta, bundle ID `me.bnfy.blanc.beta`, scheme
  `blanc-beta`, minimum macOS 13, Apple Silicon only with a recorded Intel waiver,
  feed on blanc.day, no Widevine, the committed
  `chromium/release/blanc-beta.provisionprofile`.
- Keep this section when you rewrite the file.

## Initial handoff

Waited for PID 91996 (the pre-existing `desktop-sync.mjs` run) to exit without
interference. Its `../evidence/foundation/s4b-clean-gate/result.json` records all
20 checks passing. Started a retained `caffeinate -d -i -t 28800` assertion.
The frozen bundle already exposes `phone.setTabs`, remote-device and Send calls;
no bundle, shim or hash change is required for S4c. Shipping sources, acceptance
specifications and desktop tests remain read-only.

## S4c implementation in progress

The first native tabs build (`macos-beb7c4e228eb1682`,
`s4c-tabs-1-runtime-config.json`) passed the focused local gate:
`s4c-tabs-1-gate/result.json`. Three checks passed: account setup, pairing,
and the combined tabs/Send check (default off, bidirectional tabs, private
exclusion, Send in both directions, and sharing-off retraction). This is not
final-candidate credit. An actual opener-policy tab and restart assertion
have since been added to the gate and still need a run.

`s4c-tools-2.tap` passes 244 tests and `s4c-patches-2.txt` passes reconstruction
(155 outputs, 552 canonical files). These precede the subsequent policy
persistence work and must be refreshed before commit. The first tool run's
three failures were stale asset hashes, the Settings allowlist needing its new
boolean-only method, and a new test incorrectly expecting a retracted flag
rather than shipping's empty presence record. No shipping assertion changed.

The eight-case scenario run `s4c-tabs-3-cases` finished 7 pass, 1 fail (:20). The :20 attempt
found an adapter setup error: a sharing click was attempted before the control
was ready and its false return ignored; the account's share switch stayed off.
The adapter now waits for an accepted click and checks sharing is on.

Native exports aggregate default-profile windows, defer during restoration or
Space switches, exclude private and inherited-policy tabs, and use the frozen
`phone.setTabs` entry. Read/rename/Send endpoints are allowlisted. Native Send
resolves the tab rather than trusting a renderer-supplied URL. Work in progress
preserves the sticky policy mark across session, Recently closed and Spaces,
and adds the Send to Device context menu. Generated Island renderers, the
shipping trees, frozen bundle/shims/hash and `live/` remain unchanged.

The fourth guarded build completed 34 incremental steps in 37.32 seconds.
`s4c-tools-3.tap`: 244 pass; `s4c-patches-3.txt`: 155 outputs / 552 canonical
files reconstruct; `s4c-page-shim.tap`: 3 pass. Expanded gate attempt 4 hit
a lazy CDP page connection error before the opener fixture; the harness now
connects before bringing that page forward. No product failure inferred.

S4c limitation from the same frozen bridge: incoming icon records can render,
but `__listen` installs an empty tabicons snapshot provider and the nativeImage
shim cannot encode native icons. Native favicon upload needs an approved bridge
extension; the receiving fixture sends shipping's actual PNG via encrypted
local-Worker records. This is not evidence of native favicon upload.

### S4c result

`s4c-tabs-4b-gate/result.json`: 3/3 checks pass on
`macos-9320a60d81bec2f7`, including actual opener-policy exclusion and policy
persistence across native session restore. Tabs and Send converge both ways
with the independent peer. Consent defaults off and turning sharing off
retracts the Mac inventory. This focused run is not the full gate.

`s4c-tabs-4-cases/baseline.json`: all eight requested scenarios pass
(:7, :13, :20, :88, :104, :114, :120, :129), including received PNG decoding,
rename, reflow, and remote-row search. The previous :20 failure was the
adapter's ignored not-ready control; it now awaits the real control and checks
its state. No shipping step or assertion was weakened.

S4c precommit checks: 244/244 tool tests and patch reconstruction (155 upstream
outputs / 552 canonical files) pass; `git diff --check` passes.

## S4d bridge audit (deliberate frozen-bundle blocker)

The frozen `services/sync_runner/shims/api.js` exposes only sync, bookmarks,
settings and the phone Spaces facade. There is no desktop runtime registration
entry. `shims/spaces.js` owns a single `shownId`, `captured`, `protectedIds` and
`window = {id: 'phone'}`. Its `isOpen` accepts only `shownId`; `captureLocal` is
a no-op; saving a receipt deletes every existing window receipt for that Space
and writes `phone:<spaceId>`. Events carry no native window identity.
Shipping `shared-spaces-service.js` reconciliation replaces captures or removes
deleted Spaces whenever `isOpen` is false (lines 113-116). Therefore cycling
multiple live desktop Spaces through this singleton is not safe: an open Space
would be reconciled as closed, and its independent window receipt discarded.
The exported `sync.sharedContext`, `setSyncSpaces`, status and index preview
functions do not provide capture/apply hooks or per-window receipts.

Needed bundle contract: register a desktop library and all open window captures;
retain independent receipts; route row/binding/layout events and acknowledgements
by window; hold snapshots during restore/switch; preserve desktop metadata and
protected tab IDs. That needs a reviewed new entry point in the forbidden
bundle/shim files. They have not been changed. S4d remains blocked under the
owner's explicit instruction to document missing bundle entry points and move
on. The pairing Spaces question (:162) is not represented as working by a
nonfunctional checkbox. Shared-Spaces gate coverage is still owed.

S4d precommit: 244/244 tool tests and patch reconstruction pass.

## Queue 3: clean current-candidate regression

`finish-full-sync-1/result.json` records one clean full run: 21/21 pass on
`macos-9320a60d81bec2f7`. It includes the new tabs/Send/retraction/policy-restore
check plus all 20 S4b checks. The local Worker kept its real quotas.

`finish-full-features-1/baseline.json` records the four complete requested
files: 108 pass, 4 fail, 9 undefined. `finish-compare-s4b-1.json` compares
every prior case: zero lost passes out of 100, eight gained S4c passes.
Shared Spaces :162 remains undefined for the documented frozen-bridge blocker.
The unchanged remaining vertical/Island cases proceed to queue item 4.

Read-only review during these runs found that approved V16 (replacement spec,
November 4) intentionally removes a pinned tab from its group; :129 retains
its shipping assertion and remains failing. Linux-only controls cannot be
qualified by fabricating macOS geometry. Planned repairs include real group
menu actions, the shortcut, rail focus/dismissal, and missing adapters.
S4c also broadened Duplicate refusal beyond approved V4; correct that by
allowing unsandboxed native duplication and carrying Sync exclusion onto its
copy. These changes require a new candidate and final regression evidence.

Patch budget at this boundary: 43 patch files, 151 touched upstream paths,
531 hunks; reconstruction covers 155 upstream outputs and 552 canonical files.

Queue 3 precommit: 244/244 tool tests, patch reconstruction and whitespace checks pass.

## Queue 4 — vertical-tab repairs

`finish-vertical-1-cases` on `macos-9010889292fae0f7` exercised every vertical
scenario and Island :320. Six formerly undefined vertical cases and :249
passed. The new shortcut adapter exposed the auxiliary WebView key path;
:146 exposed native 16px favicon conversion versus shipping's 32px square.
Both product paths were repaired, and `finish-vertical-2-cases` passes :34
and :146 on `macos-e7a071bb7948929b` (`finish-vertical-2-runtime-config.json`).
The second guarded incremental build took 33.63 seconds / 8 actions.

The native shortcut command and trusted Island document handling now toggle
layout. Rail activation dismisses transient surfaces and focuses real content;
focus evidence uses WebContents observers, not synthetic counters. Group menu
entries use native eligibility. Remaining adapters observe the actual DOM,
real input, page state and a held loopback response. No shipping step changed.
All seven previously undefined vertical scenarios now have passing execution
across these two candidates; full final-candidate credit still needs the rerun.

Retained boundaries: vertical :129 fails the mixed grouped-pin assertion,
which contradicts the Nov 4 approved V16 native pinning decision. Vertical
:239 fails and Island :320 remains undefined because they require Linux
window controls; the fork's macOS native controls are not an equivalent Linux
fixture. No platform or grouped-pin result was manufactured.

S4c's duplication restriction was corrected to respect approved V4: ordinary
unsandboxed page children may duplicate. Their sticky Sync exclusion copies
to the clone before insertion and persists through native session restore.
The tabs gate now checks both copies, rejects protected Send requests and
sends the normal tab through the real context-menu recipient submenu.

`finish-vertical-2-tabs-gate/result.json`: 3/3 checks pass, including the
expanded context-menu and duplicate/restart checks. No production endpoint or
real Keychain was used. Final clean full gate and four-file run remain owed
after the remaining native patch work.

Precommit: `finish-vertical-tools-2.tap` 244/244; patch reconstruction
156 outputs / 552 canonical files; whitespace clean. The initial tool run
found only the stale 155-output count assertion after adding the pinned Mac
shortcut source; its expected count now records 156. Desktop patch inventory:
44 selected patches, 152 distinct patched paths, 536 hunks, 150 pristine files.
