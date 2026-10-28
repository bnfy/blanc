# Procedural requirement reconciliation

Tranche2 section2 explicitly requires extended procedural rules and dynamic-node outcomes, including has-text, matches-css, upward and xpath. Owner retained full prerequisites for L12. Electron disabling extended selectors does not waive this deliverable. Earlier statements calling it merely a new capability are superseded for full-prerequisite acceptance.

The prior signed candidate sets getExtendedRules:false and accepts styles/scripts only. The uncommitted native replacement now delivers bounded extended rules to an isolated-world evaluator; signed qualification remains pending. The already installed MPL-2.0 Ghostery extended-selector package2.18.2 parses all four named operator controls (source-probe.json). This establishes implementation availability, not DOM or browser acceptance. No dependency upgrade or engine-direction change is needed to begin integration.

Next implementation: preserve authenticated pinned engine/list provenance; carry bounded extended ASTs through the existing document-owned cosmetic channel; evaluate in the isolated renderer world with document-lifetime ownership and bounded mutation scheduling; retain opaque-origin exclusion and lifecycle cancellation. Test insertion, attribute changes, moves and timer changes with separate positive/negative controls and retained costs. Do not replace procedural tests with CSS mutation tests. Guard the incremental build; qualify only affected signed paths afterward. Paired outcome evidence must distinguish reference-disabled behavior from positive native capability.

## Current native implementation evidence

The style-corrected renderer (SHA-256 `49d13455857db68b0604d85ab5d0c078ae3f60eda1f13dff6237572d587839dd`) and engine (`78a4d3d5cc01fe98b515c9380fc59008dcdea74b74e49786d73d872eda3ef3a3`) built in seven incremental steps; the final guard reported zero actions. Twenty affected regular/private production checks passed for pinned has-text selection and DOM changes. Four standalone operator controls passed initial/repeated evaluation and neutral-element checks; those do not establish production rule selection for every operator. The retained failed matches-css control exposed self-hiding oscillation, repaired before these results.

Twelve additional lifecycle checks passed (six regular, six private): unrelated-document exclusion, actual BFCache return (`restoredFromCache:true`), changed-text reevaluation and restored matching behavior, plus health controls. Both owned browser processes exited normally. Reports are `regular-lifecycle-native.json` and `private-lifecycle-native.json`; reproducible fixture is `lifecycle.mjs`. No unaffected suites were repeated.

Outstanding: one pinned unsupported `:-abp-properties(Partner)` rule, preparation-path consistency, broader production/operator/provider coverage, formal timing and signed qualification. No aggregate F12 or L12 acceptance follows from these native results.

## Asset preparation repair

`prepare_cosmetics.mjs` now regenerates both the engine and renderer from the authenticated reference before staging sources. The old parent-bundle injection path could no longer produce the required procedural pair. The source preparer verifies engine, renderer and header identities before its first mutation. Four negative controls (tampered engine, tampered renderer, mismatched header, absent renderer) failed before native source access. A full authenticated preparation succeeded and reproduced both exact stylefix hashes above; no compilation or runtime-suite repetition was needed. Logs and boundary results are retained here.

The remaining `:-abp-properties(Partner)` rule is not a text selector. Official [Adblock Plus documentation](https://help.adblockplus.org/adblock-plus-help-center/how-to-write-filters) describes CSS-property matching. It must not be silently rewritten as has-text. Its compatibility remains unresolved, independently of the four named procedural operator controls.

## Dynamic operator controls

The exact bundled evaluator passed 16 new mutation outcomes across has-text, matches-css, upward and xpath: inserted and moved subtrees, timer-driven attribute mutations, and nonmatching/matching transitions for text and style. Neutral elements remained visible. `dynamic-operator-check.mjs` runs in a disposable Playwright context and invokes the evaluator in an isolated world after real MutationObserver delivery. This tests evaluator dirty-state handling, not the production browser timer or production selection of synthetic rules. Those scopes remain separate from the pinned-rule/lifecycle reports. Recorded per-evaluation costs are fixture observations only (maximum observed 1.1 ms), not formal request latency or a large-page performance claim. Native browser exited normally; no compilation or unaffected suite was run.

## Complete pinned cosmetic parser audit

The earlier unsupported count covered only translated `#?#` rules. Auditing all four cosmetic delimiters against the hash-verified pinned inputs finds **24,350 cosmetic records: 24,343 parse and seven do not**. All seven rejected rules use `:-abp-properties`; six use ordinary `##` and were missed by the translation-only inventory. These are parser results, not browser coverage percentages. No live provider pages were visited for this audit. The complete rejected rules and source line numbers are in `pinned-input-audit.json`.

The upstream [Adblock Plus implementation](https://raw.githubusercontent.com/adblockplus/adblockpluscore/master/lib/content/elemHideEmulation.js) matches patterns against sorted stylesheet declarations and uses the matched rule selectors, including pseudo-element handling; it ignores third-party sheets. Replacing this with element text matching or a single computed-style property would change semantics. That upstream file is GPL-3.0, and no implementation code was imported. The existing authenticated Ghostery evaluator explicitly omits this pseudo-class.

Remaining implementation work therefore includes all seven property rules, with domain/exception handling and stylesheet mutation tests. Existing four-operator controls remain valid in their stated scope. No blanket parser-complete claim or L12 credit is warranted.

## Property compatibility implementation in progress

The new import adapter translates all seven pinned property predicates to isolated temporary markers while retaining domain and exception selection in the authenticated engine. The renderer derives those markers from same-origin stylesheet declarations, removes them after evaluation, and reevaluates changed styles. All 281 translated filters parse with no rejected entries in this translation pass. Four offline host/exception controls pass. Seven exact property-pattern browser evaluator cases each pass hiding, text/inline negative controls, marker removal, stylesheet-change reveal and restored matching. This is 42 evaluator assertions, not yet production broker acceptance. No upstream ABP implementation code was imported.

The normal incremental guard reported two actions; the build is running in the existing durable output with eight workers. Engine hash `6f5947ad20511daf0defd7ee1d01981b01af200f709ccc746b48a7df6855d797`, renderer `1eaa47ff71302f3eff0b56f9d9e2d4a702ff6c565dc655e0dc2dd7fe40f829ee`. Further work includes production regular/private nested-rule delivery, foreign-sheet exclusion, and signed qualification.

The incremental build completed eight steps in42.54s; finalguard0. Production property controls now pass9regular+9private, including actual pinned nested-rule delivery, CORS-readable foreign-sheet exclusion, stylesheet-change reveal/rehide and child movement. First run failed only on fixture CSS-string quoting after5passes; failed report retained in durable task evidence. The corrected fixture uses JSON.stringify. Both completed runs exited normally. Signed qualification remains pending.

Source review checkpoint: authoritative upstream inventory79files/189hunks remains within the recorded ceiling;151Git dependencies clean. Compliance now binds the procedural asset hash to its generated native header before packaging and records that hash in source materials, payload manifest and SBOM. Thirteen compliance checks pass, including stale-header and changed-renderer rejection. Formal timing has no accepted runs; the opt-in timing hook and ten decoder controls are preparation only.
