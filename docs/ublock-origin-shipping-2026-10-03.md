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
An unsupported combination must preserve local settings/recovery access and
require the user to choose another provider or explicitly continue unfiltered.
Never hold back Chromium security updates indefinitely to keep MV2 alive.

## Candidate and release gates

1. Complete each alert's disposition and the source/licensing determination.
2. Run lint, substrate, full units, native tools/blocking suites and actual
   ordinary and uBO package payload/compliance verification at the candidate SHA.
3. Only after distribution clearance, dispatch private signed Windows/Linux
   validation with `ublock_candidate: true`. Keep public updater artifacts absent.
4. Obtain installed candidate evidence for macOS arm64/x64, Windows x64 and Linux
   x64. Include persistence, quiet/reopen/tools, close/relaunch, Linux renderer
   sandbox (direct and integrated-menu AppImage), and staged updater handoff
   where required. CI alone does not establish these desktop results.
5. Enable only platforms with complete evidence; publish the support matrix with
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
