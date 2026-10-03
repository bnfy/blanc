# Full uBO shipping readiness — October 3, 2026

This is the review package for PR #490, not distribution clearance. The owner
requested completion toward shipping on October 3. The implementation remains
full uBO 1.75.0 on official Electron 44.5.1, with Blanc Blocker as the default and
private-session provider. No runtime fork, automatic Lite substitution, sandbox
change, public platform enablement, bulk CodeQL dismissal or scanning exclusion
is authorized by this record.

## Security decision record

`ublock/codeql-baseline.json` records every one of the 39 open findings at
`4068f053`, including rule, location and immutable source digest. Alert 99's
first-party cleanup race is resolved by that commit. Repeated notifications can
be compared against this baseline; a package update requires recapture and
review. No baseline entry is a security waiver or GitHub dismissal.

The generated adaptation now restricts strict-block and click-to-load navigation
to parsed HTTP(S) targets (72–75, 86–89), limits resource viewer/diff schemes
(97–98), and uses a null-prototype reverse-lookup response (100). The existing
cryptographic token adaptation covers 84–85. Picker and inspector handoffs
(108, 110) now require a 128-bit, single-use capability issued through native
extension messaging to the isolated content script. Capabilities are bounded,
expire in 30 seconds and are bound to the regular-profile WebContents, parent
frame, current content document and tool. Invalid first messages preserve the
listener. Wrong-frame, unmapped/private, stale, disabled and replayed handoffs
are rejected. Nothing is placed in a DOM attribute or iframe query string.

These changes preserve the byte-identical official upstream inventory and
filtering-engine modules. CodeQL continues to scan the original snapshot; each
finding still needs its own reviewed disposition using deployed-byte evidence.
The remaining source-context observations are in
`ublock-origin-codeql-2026-10-03.md`; the Worker, DSL, Markdown, noscript and
syntax-highlighting observations are not blanket clearance.

## Distribution review requested

The concrete integration and obligations are described in
`ublock-origin-distribution.md`. A reviewer needs to decide the actual
combined-work/aggregation boundary, the compatibility of the native SDK and
runtime dependencies, and how the reserved Sunrise artwork embedded inside the
adapted GPL extension may be distributed. First-party MIT and the current
identity-asset grant have not changed. Do not infer that process separation,
owner use or a private signed candidate resolves these questions.

Three missing preferred-source archives have been obtained from immutable
upstream revisions: CSS Tree 2.2.1, js-beautify 1.14.7 and HSLuv 0.1.0. Their
revision URLs and SHA-256 digests are bound in `pinned.json` and
`preferred-sources.json`. Preferred-source availability is improved, but their
build reproduction, complete component notices, font sources, four WASM toolchain
records, and separately fetched/minified filter inputs remain to be completed.
The 644/658 source-tag coverage audit remains unchanged and does not include
these new component archives.

References: [GPLv3 sections 1, 5–7](https://www.gnu.org/licenses/gpl-3.0.html),
[GNU aggregation guidance](https://www.gnu.org/licenses/gpl-faq.en.html#MereAggregation).
A source bundle must include the exact host/adapter/interface sources, patches,
component inputs, build scripts and notices, and be bound to the actual released
bytes and authenticated manifest. No moving-branch-only source offer is adequate.

## Questions the licensing reviewer needs to answer

The owner has not identified an existing reviewer. They do not need to interpret
GPL themselves. Use this concrete scope for a qualified open-source licensing
review; no reviewer has been contacted or retained by this work.

- Does this purpose-built host/adapter and internal uBO page-store coupling
  require the combined desktop distribution to satisfy GPLv3, or is any part a
  separate aggregate? Identify the exact files/processes covered and the source
  offer; retaining MIT on original first-party files is a requirement.
- Can the reserved Sunrise asset copied into the adapted extension coexist with
  that determination under the existing copyright grant? Distinguish permitted
  trademark restrictions from copyright restrictions on modification and
  redistribution. Propose exact terms or a separation that preserves the
  owner's identity policy; no grant has been changed.
- The optional 1Password utility uses `@1password/sdk-core@0.5.0`, whose npm
  package declares MIT and describes a Rust core built with wasm-bindgen, but
  includes a compiled `core_bg.wasm` without Rust preferred source. Is this
  independent aggregate outside the covered work, a system-library case, or a
  corresponding-source obligation requiring additional inputs/permission?
  The current MIT metadata and notice fallback alone do not answer that.
- Define the corresponding-source obligations for compiled WASM, copied fonts,
  minified libraries and independently licensed filter data, then verify the
  inventory and build/source offer against the actual candidate. State which
  source/reproduction records are required rather than assuming every asset is
  subject to identical obligations.

Review inputs: `docs/ublock-origin-distribution.md`, `ASSET-LICENSE.md`, the
root MIT and upstream GPL texts, `ublock/adaptation.*`, source archives and
`preferred-sources.json`, source audit, runtime lock/SBOM/notices, and host files
listed in `ublock/adaptation.json`. A general answer about merely using an
extension does not cover this integration. Until the concrete determination is
recorded, the distribution gate must stay closed.

## Runtime maintenance policy

Electron's [extension documentation](https://www.electronjs.org/docs/latest/api/extensions)
explicitly lists MV2 background support today; no durable retention commitment
has been found. Any Electron update must update the reviewed runtime record and
pass the real blocking/tools suite on every enabled platform before release.
A build where uBO is unavailable must activate Blanc Blocker for existing uBO
selections while preserving their saved settings and explaining the switch.
This covers reviewed MV2 retirement, disabled/unlisted platforms, unreviewed
runtimes and intentionally omitted payloads. Failures while initializing or
running an available uBO retain fail-closed recovery: retry, choose another
provider for restart or explicitly continue unfiltered.
Never hold back Chromium security updates indefinitely to keep MV2 alive.

## Candidate and release gates

1. Complete the source/licensing determination and record the security review
   plan. The owner has approved all 39 individual dismissals for the post-draft
   stage. The explicit #77 approval supersedes its earlier hold and accepts the
   signed macOS arm64 evidence, including the build-output launch limitation.
2. Run lint, substrate, full units, native tools/blocking suites and actual
   ordinary and uBO package payload/compliance verification at the candidate SHA.
3. Only after distribution clearance, dispatch private signed Windows/Linux
   validation with `ublock_candidate: true`. Keep public updater artifacts absent.
4. Obtain installed candidate evidence for macOS arm64/x64, Windows x64 and Linux
   x64. Include persistence, quiet/reopen/tools, close/relaunch, Linux renderer
   sandbox (direct and integrated-menu AppImage), and staged updater handoff
   where required. Include the [candidate noscript protocol](ublock-origin-codeql-dispositions-2026-10-03.md#alert-77-approved-deferred-dismissal)
   on each platform proposed for enablement. CI alone does not establish these
   desktop results.
5. At the agreed post-draft stage, apply all 39 recorded dismissals individually
   using the exact approved reasons/comments. The owner supplied #77's exact
   comment; the other 38 remain in the reviewer's record. This document does not remove draft status
   or dismiss an alert. Resolve all merge-blocking security findings before merge.
6. Enable only platforms with complete evidence; publish the support matrix with
   actual uBO/Electron versions and integration limits. Use the existing protected
   merge and signing/notarization/manifest/provenance/updater protocol.

`ublock/distribution.json` and every platform enable flag remain false. Existing
v1.26.0 waivers are specific to that release and do not clear uBO candidates.

## Local verification of this follow-up

Official Electron 44.5.1 on macOS arm64 passed the dedicated real-blocking suite,
including a hostile parent attempting forged picker ports, authenticated original
DOM inspector and navigation reconnection, original tools/backup, filtering,
private/profile isolation and deletion, quiet/reopen, crash/deadline recovery and
offline restart. The dashboard suite passed all supported panels and persistence.
This is local unpackaged evidence, not installed-candidate acceptance. No public
flags, CodeQL dispositions or distribution-clearance fields changed.

The source additions changed the compliance input digest; its runtime SBOM was
regenerated. The two existing dependency VEX guards required re-review. The new
archives are never executed/imported during packing or runtime: only verified
upstream files become the extension. Host messaging changes add no RSA verifier,
HTTP cache or Android path, and package/lock graphs stay unchanged. The exact
payload-digest guard was refreshed with that evidence; it still rejects future
unreviewed changes. Focused source/security/VEX checks passed 20 tests.


Final local gates passed: lint, substrate and **2,156/2,156** unit tests; all
three uBO desktop suites (real blocking/tools, dashboard and shield/provider).
The shield run retained real window deactivation dismissal; fixture actions
explicitly restore the native foreground window instead of disabling that policy.
An unsigned Linux x64 `--dir --publish never` package, created exclusively for
local owner inspection with the internal marker, passed actual ASAR upstream,
preferred-source/host/adaptation, Blanc Blocker, capture-runtime, SBOM/notices and
packaged compliance checks. Its Linux renderer was not launched on this Mac;
this supplies payload evidence only and is not Linux installed/sandbox acceptance.


## Follow-up per-alert evidence and native policy correction

Every baseline alert now has its own technical recommendation and evidence/limit
in `ublock-origin-codeql-dispositions-2026-10-03.md`. None has been dismissed or
excluded, and no owner security waiver is inferred. The fresh scan at
`ae991e43` remained the same 39 upstream alerts. That commit's native CI run
[37139474075](https://github.com/bnfy/blanc/actions/runs/37139474075) passed all
four desktop platforms and the actual ordinary-package build on its first
attempt. This still does not replace signed, installed candidate acceptance.

The follow-up confirmed alert 82 as a real multi-directive Permissions Policy
formatting defect: the native browser left all three denied features allowed.
The reproducible adaptation changes that header separator replacement only;
matching and scriptlet resources remain upstream. Native verification now denies
all three, with allowed controls and exception/header preservation regressions.
The original noscript reconstruction also passed a local sandbox/CSP adversarial
probe. Component licensing and installed evidence remain unresolved.

After the header correction, local lint, substrate, **2,157/2,157** unit tests,
the expanded native real-blocking suite and the rebuilt unsigned owner-local
Linux x64 ASAR checks passed. The earlier dashboard/shield results remain
unchanged; the next exact-head native run repeats all three suites on all four
platforms. No public platform or distribution clearance flag changed.


## Native focus follow-up and licensing outreach

Run [37140368951](https://github.com/bnfy/blanc/actions/runs/37140368951)
at `81292f67` passed both macOS architectures, Windows and ordinary packaging,
but Linux timed out on the first unavailable-provider shield click, before uBO
loaded. Playwright stalled waiting for native click stability although the button
had visible, nonzero geometry. This failure is retained; it is not a filtering
failure or installed Linux acceptance.

The fixture now focuses the chrome WebContents before dispatch and waits for the
exact visible native fixture window, instead of accepting any focused window.
Failure diagnostics include bounded window IDs and document visibility/focus.
No force-click, production blur exception, timeout extension or sandbox change
was added. Local real-blocking/core and shield suites passed this correction.
The subsequent main merge at `7ca81589` independently passed all four native jobs
and ordinary packaging in run
[37140935663](https://github.com/bnfy/blanc/actions/runs/37140935663).
The intermittent earlier failure is still relevant; exact-head CI will repeat
these suites after this test correction.

On October 3 the owner approved sending the concrete guidance request to FSF
Licensing from `anthony@bnfy.me`. Mimestream confirmed the message in Sent and
FSF acknowledged ticket **#2769466**. The request references immutable review
snapshot `81292f67`, makes no payment commitment, and requests a concrete
boundary/source/artwork assessment or a referral. An acknowledgment is not a
licensing determination; all distribution-clearance fields remain false.

The CodeQL API comparison after the main merge still matched all 39 baseline
alert numbers, rules and upstream paths; no first-party alert was present.
No dismissals or exclusions were applied.


Further [source-reproduction evidence](ublock-origin-build-reproduction-2026-10-03.md)
accounts for the transformed Chromium manifest and reproduces three bundled
WASM modules byte-for-byte with the documented WABT version. LZ4 optimization,
minified-library/font/filter inputs, complete notices and the concrete licensing
boundary remain unresolved. These results improve the review packet without
clearing corresponding-source or distribution fields.


Exact-code-head run
[37141409804](https://github.com/bnfy/blanc/actions/runs/37141409804)
at `7c4fd4a9` completed successfully: ARM macOS, Intel macOS, Windows, Linux,
and ordinary-package all passed on the first attempt. Linux exercised the
corrected native focus precondition and all three suites; the earlier failure
record remains above. These are hosted, unpackaged desktop and ordinary-payload
results, not signed installed uBO candidate acceptance.

The current main-branch repository direction also requires an automatic Blanc
Blocker fallback when Electron ceases to support MV2. That retirement path still
needs implementation and verification before public uBO enablement. It is
separate from the two-second background-decision failure policy, which remains
fail closed. A fallback must identify the effective provider, retain separate
uBO configuration and respect the global blocking switch; it must not silently
substitute a provider or replay POST pages.


## Reviewed MV2 retirement and current candidate work

The owner confirmed availability to test macOS, Windows and Linux. This is
availability, not installed-candidate acceptance; no signed uBO candidate has
been cleared for distribution. FSF ticket #2769466 still contains only its
automated acknowledgment as of this check.

The official-runtime matrix now explicitly records `manifestV2: supported`.
A future reviewed runtime can declare `retired` only with all uBO platform
flags disabled. The build excludes the obsolete extension, and an existing uBO
selection starts Blanc Blocker for normal and private tabs. The stored uBO
selection and configuration stay intact; no page reload, POST replay or site
exception migration occurs. The global blocking-off setting is respected.
Shield and Settings explain the effective provider, and the chooser does not
ask for a futile restart. Blanc initialization failures retain Retry/Continue.
This fallback is never inferred from a request timeout, package corruption,
background failure or mismatched runtime record; those keep their existing
failure/recovery behavior. Electron 44.5.1 remains marked supported.

The new `test:ublock-retirement:desktop` suite launches the complete app in a
fresh profile with a process-local retired matrix, without adding a production
test override. On official Electron 44.5.1/macOS arm64 it proved startup-gate
release, real Blanc request cancellation before fixture-server receipt in both
normal and private tabs, no native uBO background, the shield explanation and
Done button, unchanged saved uBO selection, and a successful network control
after explicitly turning global blocking off. The same suite is wired into all
four native CI jobs. These are development tests, not installed acceptance.

The Windows failure at `d0414522` occurred because the test checked unsupported
controls immediately after their static HTML appeared, before uBO's asynchronous
settings response disabled them. The assertion now waits for both controls to
actually be disabled, with a bounded deadline. No production permission policy
or request deadline changed. The later unchanged-code head `42f9fc45` passed
all four native suites and ordinary packaging in
[run 37143598478](https://github.com/bnfy/blanc/actions/runs/37143598478).
The current fallback changes still require their own exact-commit CI result.

Local fallback follow-up: lint, substrate, upstream/adaptation pins and the
full unit suite passed (2,170 tests), with the two Settings recovery cases also
passing after the added retirement assertion. Distribution, platform enablement
and CodeQL decisions remain unchanged.


The local shield and dashboard suites passed. One main desktop run timed out
selecting Filter lists after repeated original-popup Dashboard navigation; the
next run passed. Inspection showed the test could click static navigation
before the reloaded dashboard installed its async handlers. The fixture now
waits for initial pane selection and loaded frame content, retains bounded
failure diagnostics, and is being rerun. No production handler or test deadline
was weakened. This failed attempt is retained rather than counted as a pass.

The [component rebuild evidence](evidence/2026-10-03-ubo-component-rebuilds/README.md)
now binds js-beautify's exact normalized output and CSS Tree's one-byte version
metadata difference to their pinned preferred sources and compiler lockfiles.
That closes specific source-build uncertainties, not the licensing decision.


The subsequent local run stopped earlier because a native outside key-down
arrived on the chrome WebContents while the popup was loading; the bounded focus
trace records dismissal from `wirePopupDismissal` while the provider remained
ready. This is the intended outside-input behavior, not evidence of a provider
failure. Do not suppress that production policy to make automation pass. The
isolated hosted jobs must validate the final readiness correction; the earlier
complete local core run passed but does not certify that correction.


## Source inputs, durable security evidence and review request

At 14:35 Eastern on October 3, the owner-approved availability request was sent
from `anthony@bnfy.me` to `compliance-lab@fsf.org`, referencing FSF ticket
#2769466 and the immutable `0966d6e4` review packet. Sent-folder delivery was
verified. The request asks about scope, turnaround and fees and authorizes no
paid work. This is a request for review, not distribution clearance.

Two immutable uAssets archives now bind all thirteen fetched release assets.
Five minified uBO lists rebuild exactly with their upstream timestamps. The
[evidence](evidence/2026-10-03-ubo-component-rebuilds/README.md) distinguishes
exact input matching from preferred-source reproduction. The new archives are
opaque corresponding-source payloads: packaging and runtime do not extract or
execute their scripts. The payload guard digest was updated after reviewing
that boundary; runtime dependencies and the RSA, Android and cache-path VEX
assessments are unchanged. No advisory exception was added or broadened.
Package, adaptation and compliance checks and 19 focused source/VEX/compliance
unit tests passed after adding the archives.

The [security evidence](evidence/2026-10-03-ubo-codeql-contexts/README.md) also
preserves the earlier noscript/header JSON observations with their explicit
reproducibility limit and a fresh source-context report. All 39 upstream alert
source hashes still match. The merge-ref API reports the same 39 open vendored
alerts, zero first-party alerts; none were dismissed and scanning stays on.

At `0966d6e4`, [run 37144642740](https://github.com/bnfy/blanc/actions/runs/37144642740)
passed ordinary packaging, Windows, Linux and Apple Silicon macOS. Intel macOS
failed waiting 20 seconds for a newly created profile's provider to become
ready; the final status was `initializing`, with no provider error recorded.
The queued first navigation was cancelled during startup as designed, but its
subsequent release was not verified. A rerun of that exact Intel job is being
used to investigate; this first failure remains part of the record and is not
counted as a pass. No request deadline, sandbox setting or runtime pin changed.


While investigating Intel, a concurrent PR commit (`2b567620`) increased only
the new-profile fixture wait from 20 to 40 seconds. It was preserved when
rebasing the source-evidence work. The provider has successive 2/15/15-second
waits plus extraction/native loading, so 32 seconds is not a total wall-clock
bound. The fixture now also fails immediately if the provider reports failure
and records observed new-profile latency. No production deadline changed; CI
must still prove that the profile becomes ready and its initial GET reaches the
fixture server exactly once.


The unchanged Intel retry at `0966d6e4` passed (run 37144642740, attempt 2).
That establishes an intermittent earlier failure, not a production fix or a
clean first attempt. The later 40-second test budget and readiness diagnostics
still require their own exact-commit CI result.

Alert #77 now has a maintained native regression and fresh local macOS arm64
[output](evidence/2026-10-03-ubo-codeql-contexts/noscript-repeatable-macos-arm64.json).
Active controls prove the inline script/error/link payloads execute before
no-scripting is enabled; uBO's required default CSP then prevents them while
its original noscript reconstruction displays fallback content. Turning the
switch off permits the original script again. This adds no production code and
changes no alert disposition. It is wired into the four-platform desktop job.


## Startup fallback for every unavailable build

The owner requested extending the retirement path after review identified three
other unavailable-build cases: disabling a platform, omitting the uBO payload,
and returning from an internal candidate to an ordinary public build.
`blocking-providers.js` now selects Blanc Blocker at startup whenever uBO is
saved but `supported` is false. This also covers an unlisted platform or a
runtime/matrix mismatch. Unsupported builds never install the uBO failure stub
or attempt to initialize uBO. Profile deletion likewise avoids loading an
unsupported native extension and uses the existing entire-session cleanup.

This is a build-availability decision made once before attaching sessions.
An available uBO's initialization, package-integrity, crash and request-timeout
failures do not trigger substitution. Its two-second decision policy remains
unchanged. Blanc startup failures still surface Retry/Continue, rather than
claiming protection or silently permitting traffic.

The saved uBO selection/configuration remain intact. Shield and Settings say
“uBlock Origin isn’t available in this build,” identify Blanc as the effective
provider, and retain the saved-settings notice. Known MV2 retirement keeps its
specific explanation. The chooser shows the effective provider with Done,
without a futile restart. Global blocking-off and independent provider site
exceptions remain respected; no POST replay or configuration migration occurs.

The 48 focused manager/shield/Settings tests passed locally. They cover disabled
and missing platforms, omitted payload on an approved platform, unreviewed
Electron, retirement metadata for a different runtime, global-off, effective
provider/restart state, profile deletion and available-provider failure.
`test:ublock-unavailable:desktop` launches the complete app with its platform
disabled in the child process, suppressing only the manager's usual development
test bypass. No production test override is added. The real Blanc engine blocks
fixture ad requests before server receipt in ordinary/private tabs; allowed
pages load, no uBO background exists, the notice/Done state is correct, the saved
selection survives and explicit global-off permits the control request. This
local macOS arm64 test and the original retirement test passed. The unavailable
case is also wired into all four desktop CI jobs. Exact-commit CI and installed
candidate acceptance remain distinct requirements.

No distribution flags, platform approvals, executable upstream bytes or CodeQL
dispositions are changed by this follow-up.


Local follow-up validation completed: lint, substrate, all 2,178 unit tests and
the full real-blocking uBO desktop suite passed. The latter still exercises
available-provider decision deadlines, background crash/retry, native storage
and profile isolation, tools, POST safety and offline restart persistence.


At source head `fba2aa3c`, [run 37146642327](https://github.com/bnfy/blanc/actions/runs/37146642327)
passed ordinary packaging, Windows and Linux. Both macOS jobs failed before the
new unavailable-build regression ran: Apple Silicon selected a stale Playwright
page during quiet-tab wake, and Intel lost the popup while preparing its Escape
check. The Intel native trace shows the provider's `closePopup` hook, but the
fixture did not record provider status, so the failure code is unknown. Neither
failure is counted as a pass or dismissed as infrastructure noise.

The test follow-up waits for Playwright to observe the old quiet page's closure
before resolving the new page at the same URL, names the quiet/Escape stages
accurately, and records bounded provider status on shield failure. It changes no
production code, deadlines or recovery policy. The first-run failures remain
part of the release reliability record; the corrected suites require fresh CI.

The test follow-up passed local lint, the full shield/provider suite and the full
uBO real-blocking suite on macOS arm64. The Intel failure has not been reproduced
locally; new failure diagnostics are intended to establish its cause if repeated.


## Owner-relayed security decisions, pending execution

The owner supplied the completed review decision summary after code head
`31b33196`: 38 alerts approved for individual dismissal when PR #490 leaves
draft; #77 explicitly held open until signed installed-build testing and a
separate owner decision. The [per-alert document](ublock-origin-codeql-dispositions-2026-10-03.md)
now distinguishes each owner decision from the technical recommendation and
records the installed no-scripting evidence still required. Exact comments and
the nine non-blocking alerts' exact reasons remain in the reviewer's record;
they were not invented here. A fresh read-only GitHub comparison still returned
all 39 baseline alerts, with no additions or omissions. No alert was dismissed,
no scan rule/exclusion changed, and the PR remains draft.

The broader unavailable-build fallback's final code/test head `31b33196` passed
all four desktop jobs and ordinary packaging in
[run 37147016218](https://github.com/bnfy/blanc/actions/runs/37147016218).
Every platform log confirms both fallback regressions ran. The earlier Intel
failure did not recur; its exact failure code remains unknown. This pass is not
claimed as a production fix for that incident or as signed installed acceptance.


## Private candidate scripting-policy automation

The private Windows/Linux validation workflow now runs the packaged no-scripting
probe when `ublock_candidate` is explicitly enabled. Windows executes the
probe against the app installed by the real NSIS installer before uninstalling
that test installation. Linux extracts the built AppImage and tests its actual
executable/ASAR bytes. The latter is extracted-package evidence, not a claim of
integrated-menu AppImage or installed-desktop acceptance. Existing direct
AppImage and Ubuntu sandbox checks remain separate.

Both jobs preserve sanitized probe JSON as a three-day Actions artifact even
if a later check fails. A failed probe still fails the job; successful candidate
installer artifacts are uploaded only after all required steps pass. This wiring
has YAML parsing, shell syntax and the existing distribution-gate unit checks;
the new Windows/Linux steps have not run yet. It changes no clearance fields,
platform flags, public release behavior or CodeQL dispositions.


## Explicit owner approval of #77 — October 3

The owner approved alert #77 for deferred **Won't fix** when PR #490 leaves
draft, explicitly superseding the earlier hold. The owner accepted the signed,
notarized macOS arm64 no-scripting evidence committed in `130dabe3`, including
its build-output launch limitation. The [per-alert record](ublock-origin-codeql-dispositions-2026-10-03.md#alert-77-approved-deferred-dismissal)
now contains the exact supplied comment. All 39 alerts have owner decisions;
none has been dismissed. Do not dismiss anything before PR #490 leaves draft.
Installed-platform testing and source/licensing requirements remain separate.


## LGPL diff source and notice follow-up

The Swatinem diff source revision cited by uBO's unchanged header is now pinned
and bundled as a source input. Its upstream README/package metadata declare
LGPLv3. The full unmodified GNU LGPLv3 text is byte-pinned, retained in the ASAR
and copied beside GPLv3 into bundled candidates' `ThirdPartyLicenses/`.
The packaged verifier checks all asset license copies byte-for-byte, including
a regression rejecting a nonempty but incorrect LGPL copy. Ordinary packages
continue to omit these uBO-only notices. Upstream executable bytes and the
adaptation are unchanged.

This changes the pinned input inventory, so the VEX payload reachability guard
was re-reviewed before its digest was refreshed: the new source archive and
license text are inert distribution inputs, never extracted or executed during
packing or runtime; npm graphs/versions and build cache options are unchanged.
No RSA verification, Android tooling or shared HTTP-cache path was added.
The node-forge/http-cache-semantics reachability conclusions remain applicable.
This source/notice improvement does not itself assert distribution clearance.


## Reserved artwork packaging boundary

The adapted uBO package no longer contains `blanc-sunrise.png` or any copy of
Blanc's reserved Sunrise image bytes. Its existing popup/dashboard image elements
reference an exact first-party `blanc://ubo-brand/sunrise.png` endpoint served
from the signed Blanc resources. Only that PNG is exposed: no HTML, script,
query-bearing path or IPC surface. The image layout and appearance are unchanged.
The native dashboard test and popup regression check that the actual image loads.

This keeps the reserved artwork outside the modified extension directory; it
is a concrete packaging change, not a legal determination about the entire
combined app. The first-party MIT baseline and reserved identity grants remain
unchanged. The owner has directed proceeding without outside licensing
clearance; source/notice verification and platform acceptance are still tracked
as engineering release requirements, rather than an awaited FSF permission.


The [packaged-input evidence](evidence/ublock-brand-packaging-2026-10-03/README.md)
confirms actual ASAR delivery of all pinned source inputs and full GPL/LGPL
license copies, with the Sunrise retained in Blanc resources and absent from
the adapted extension. This unsigned Linux directory package was inspected on
macOS; it is not Linux installed acceptance. Lint, substrate and all 2,180 unit
tests passed. The native Dashboard suite and actual popup image assertion passed.
The wider tools suite had two window-blur dismissal failures (picker and Logger
reuse); those attempts are retained as failures, with the provider still ready.
Exact-head hosted CI must validate the complete suite. No production dismissal,
blocking deadline, distribution flag, platform gate or CodeQL state was changed.


## Owner-directed distribution decision

The [owner decision](ublock-origin-owner-distribution-2026-10-03.md) now records
proceeding without outside legal sign-off, the supplied uBO implementation and
adaptation sources, packaged full GPL/LGPL notices, recipient source access,
and the retained combined-work/native-SDK/artwork judgment. It supersedes the
earlier awaited-clearance hold; no FSF approval is claimed. Distribution fields
are cleared on that stated basis. Public platform flags remain disabled until
installed acceptance, and all CodeQL dismissals remain deferred while draft.


## v1.27.0 candidate preparation

The preceding production-code head `c33eb49a` passed all four desktop jobs and
the ordinary package check in [run 37152027834](https://github.com/bnfy/blanc/actions/runs/37152027834).
The new candidate uses version 1.27.0 and monotonic macOS build 1270; no tag or
public release exists for it. Draft release notes explicitly prohibit treating
this candidate as the current public release. All platform flags remain off.

Local lint and substrate passed. The initial version-bump unit run passed
2,179/2,180 tests; its one failure was the required missing v1.27.0 release-note
file. Draft candidate notes were added rather than changing the public site or
claiming an unperformed release. All 23 affected press/compliance/distribution checks subsequently passed.
Exact-head CI repeats the full unit and desktop suites.


## First v1.27.0 candidate run and Windows probe portability

[Private validation run 37152590931](https://github.com/bnfy/blanc/actions/runs/37152590931)
built from `2bbcbc84`. Linux packaged payload/notices and the no-scripting probe
passed; its sanitized JSON artifact is retained. Windows signed the unpacked
app, helper/uninstaller and NSIS installer and passed its publisher checks, then
failed in the installed no-scripting harness before launching that probe. The
ASAR reader traverses directories using the host separator: a forward-slash
`src/main/ublock-platforms.json` lookup fails on Windows. The fixture now
normalizes all three ASAR JSON member paths to `path.sep`, as the production
packaged verifier already does. This is a test-only correction; no runtime,
signing, sandbox, blocking policy or alert disposition changed. Windows is
rerun from the corrected fixture; this failed attempt is not counted as a pass.


## v1.27.0 signed/private candidate results

The [durable candidate records](evidence/ublock-v1.27.0-candidates-2026-10-03/README.md)
retain artifact/source digests, actual DMG signature/notarization and payload
checks, passing Mac arm64/Windows installed/Linux extracted-package probes, and
two failed Intel-under-Rosetta startup attempts. Windows retry run 37153103797
passed after its test-only path correction; the first failed Windows attempt is
retained. Linux and both hosted Ubuntu sandbox checks passed in run 37152590931.
All four desktop jobs and ordinary packaging passed for source `2bbcbc84`.

The owner confirmed Apple Silicon, Windows and Linux test availability. Their
installed feature/persistence/normal-exit/relaunch and staged updater acceptance
are still pending. Intel remains disabled: the idle Rosetta retry also reports
`ubo-startup-timeout`; it is not attributed to concurrent build load. No
production timeout or sandbox policy changed. The probe now obtains actual app
architecture through existing Settings IPC and saves only bounded error codes.

All candidate update metadata SHA-512 digests, installer/ZIP SHA-256 values and
isolated staging-feed copies match. No public updater metadata was published.
The latest read-only CodeQL comparison has the same 39 open vendored alerts,
zero additions or first-party alerts, with every dismissal still deferred while
the PR remains draft.


The isolated Mac v1.26.0 → v1.27.0 updater rehearsal passed after authenticating
the old public ZIP's checksum manifest. Discovery/download, Squirrel replacement,
stable strict signature and replacement relaunch were verified; updated bytes
match the signed DMG candidate. The [record](evidence/ublock-v1.27.0-candidates-2026-10-03/macos-updater-rehearsal.json)
explicitly retains the auto-install limitation: the owner still needs the
ordinary Restart Now interaction and affected-machine acceptance. No personal
installation or public updater feed was changed.
