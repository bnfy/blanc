# Result

Local work from `b4bd80c5`; no push or release action.
Candidate: `macos-39bb50fa9ae849f3`; config: `finish-sparkle-dev-2-runtime-config.json`.

| Queue item | State |
| --- | --- |
| 1 S4c tabs, Other devices, Send | Requested cases done; native icon upload blocked by frozen bridge |
| 2 S4d shared Spaces | Blocked: phone bridge lacks desktop window contract |
| 3 Clean full gate and four files | Current candidate done; final rerun owed after queued fixes |
| 4 Vertical/Island leftovers | Repairs done; V16 and Linux-only cases remain explicit |
| 5 Beta identity | Patch and preview build done; separate beta build outside queue limits |
| 6 Sparkle updater | Patch/pure tests done; native beta handoff and security decision blocked |
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
Item 4 candidate tabs/Send gate: **3/3 pass**, including duplicate/restart exclusion.
Owner input: desktop Spaces bundle entry and native icon bridge need authorization.
Owner input also: Sparkle version/backport decision and dedicated beta build/key inputs.
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

## Queue 5 — merge preparation

Remote refs confirm the old setup branch is absent. Merging migration at
`4a24b47d` encountered the earlier S3 squash: conflicts were older copies of
the current native/Sync files. Their current contents are preserved; a byte
comparison proves the merge imports exactly the 21 later beta-tooling paths.
The initial mandatory merged suite passed 265/265. Its inherited tests used
ephemeral generated test keys; these are now replaced by the public/signature
parts of RFC 8032 TEST 2, with no private material or signing, to keep all
subsequent checks within the no-key-generation boundary. No operational key
was created or stored.


## Queue 5 — identity result

Merged setup at `7c27716d`; selected patch 0046 implements the approved beta
identity through `blanc_channel="beta"`. Dedicated branding, outer-only version
metadata, native profile/cache/import guards, isolated Safe Storage and main-only
WebAuthn entitlements are present. Preview stays the default; beta hooks/disk
assets stay disabled. Beta 1 is arm64 with the dated Intel waiver, minimum
macOS 13, no Widevine. Policy/fixtures/runbook now use `2.0.0-beta.N` and its
separate tag namespace. The existing gold Sunrise ICNS was visually inspected.

The generated-header guard stopped before compilation. After reviewing the
single header action and confirming it adds only `BLANC_BETA_CHANNEL=false`,
that generator alone ran; the guarded wrapper then passed 14 incremental
steps in 33.13s. Existing flags, args, compiler and SDK were preserved. Result:
`macos-77c0cea3ecc01285`, `finish-beta-identity-dev-2-runtime-config.json`.
`finish-beta-identity-syntax.txt` records the beta-only identity source passing
syntax with the pinned Chromium compile command; this is not beta linkage.

`finish-beta-identity-tools-2.tap` passes 269 tests, including compiled native
path checks against temporary aliases/traversal/old-profile fixtures and
outer plist preservation. Patch reconstruction: 158 outputs / 558 canonical
files; 45 patches / 154 patched paths / 546 hunks / 152 pristine files.
No actual owner profile was opened by the isolation tests. The first beta-only
suite failure was an old x64 fixture assumption; missing-evidence verification
now checks the selected arm64 fixture without changing the validator.

Deliberate build boundary: actual beta selection changes the prototype args;
an official beta additionally changes defaults/toolchain requirements. The
queue forbids both a new cold output and prototype args changes, so item 5
stops at the patch plus preview regression/syntax. Native beta launch, helper
IDs in built payloads, OS registrations, real Keychain/passkeys, profile
embedding and signed isolation remain unverified. Release execution stays disabled.


## Item 6 — beta-only Sparkle patch (partial at the required build boundary)

Patch 0047 and canonical beta sources implement native menu/Settings About
checks, retained main-thread ownership, graceful termination delegation,
immutable native feed selection, build-argument public key metadata and before-
extraction verification. Full archives only; root hosts, noncanonical URLs,
wrong architecture and non-increasing builds are rejected. Preview loads no
Sparkle code or framework. No private key is generated/stored by this work.

The offline archive stager validates the exact reviewed digest, full license,
framework version/build, safe paths/symlinks, executable components and complete
file tree. GN verifies the immutable receipt before linking/copying. Neither a
Sparkle release endpoint nor a real distribution was contacted/downloaded.
Public headers and full license came from the pinned 2.8.0 source; URL/digest
receipts are in sources.json and finish-sparkle-source/ outside Git.

The first preview build stopped on two Settings lint errors (event-handler
name and lifecycle method order). Both were corrected in patch 0047. The
second guarded preview build passed 23 steps in 36.17 s, producing candidate
`macos-39bb50fa9ae849f3`. The updater source also passed the pinned Chromium
compiler's Objective-C++ syntax check against the actual pinned Sparkle headers
(`finish-sparkle-native-syntax.txt`); explicit property synthesis fixed its
initial warning-as-error. Syntax does not prove framework linkage or execution.

`finish-sparkle-tools-2.tap`: 273/273 pass. This includes the compiled native
update selection policy and a real loopback HTTP appcast fetch, increasing N
selection, Ed25519 verification and tamper/replay rejection. That harness uses
only a published RFC 8032 public vector and its one-byte message/signature; it
is not a native Sparkle handoff or an installable archive. No private test key
is generated. Final precommit checks supersede this receipt below.

Actual beta build/link/runtime needs changed arguments and a separate output;
per the queue's explicit boundary, stop this item at the patch. Native feed
check, signed N-to-N+1 install/relaunch, helper signatures/rpaths, updater prompts,
Sync/session flush, Keychain/passkey continuity and Gatekeeper remain owed.
The prototype args, caches/toolchain and existing output were preserved.

First-party security review found post-2.8.0 fixes, including an authenticated
installer download-move symlink race (upstream discussion 2838 and security
page, linked in the runbook). Refusing deltas/root is not a demonstrated fix
for that installer race. Keep the requested pin, but do not security-clear it
for release: owner version/backport decision required. Continue item 7 and
final default-preview gates; no production/release action was performed.
Current budget: 46 patches, 154 patched upstream paths, 560 hunks, 152 pristine
files; source map reconstructs 158 outputs and 564 canonical files.

Item 6 precommit: `finish-sparkle-tools-final.tap` 273/273 pass;
`finish-sparkle-patches-final.txt` reconstructs 158 outputs / 564 canonical
files; `git diff --check` passes. Final-candidate runtime follows item 7.
