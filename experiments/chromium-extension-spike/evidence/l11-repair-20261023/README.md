# L11 dependency, CodeQL and certificate-revocation repairs — October 23, 2026

The [failed audit](../l11-audit-20261023/README.md) is repaired in source. **The original dependency and CodeQL findings are cleared on repair head9f27af90. L11 remains open for the separate sandbox duplication failure, unfinished platform checks and replacement-artifact qualification.** This does not promote or replace the previous signed artifact, or grant release approval.

## Dependency policy

Electron is pinned to 44.9.1 (minimum package range `^44.9.1`) for [GHSA-jr5w-w6x2-84p9](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9). Zod resolves to 4.6.7, above first-fixed4.6.6 for [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Original unrelated optional lock entries are preserved. The uBO runtime pin and explicit compliance expectation follow the new Electron version; generated runtime/root/site SBOMs and notices were regenerated. [Official Electron runtime mapping](electron-runtime-mapping.json) confirms both44.8.0 and44.9.1 use Chromium152.0.7977.167; this does not manufacture new installed-platform acceptance.

All four dependency workspaces pass policy; the three existing companion VEXs are unchanged. No advisory suppression was added. Site build/SEO passes on an existing compatible Node24 runtime. No site deployment, native Electron build, diagnostic build or public runtime update occurred.

## CodeQL flows

[All48 prior alert IDs](codeql-remediations.json) have an explicit source repair:

- Harness calls carry values through `Runtime.callFunctionOn` arguments. The new shared helper's executable body is a harness-authored function; strings, arrays and objects are data. Callback semantics, timeout behavior and intentional `userGesture` settings are preserved.
- Fixture HTML is static; paths and titles are assigned as text in the document. The OAuth fixture reads query values in the browser instead of embedding them in script source. Malicious quote/tag payloads remain inert.
- Blocked host/origin checks parse URLs and compare exact fields.
- Historical evidence writers read directly and handle ENOENT instead of checking existence before reading.

The modified historical harnesses and their existing hash inventories are updated; their original runtime observations and artifact identities remain dated history. They were not re-run or counted as fresh signed acceptance. **The hosted analysis on repair head9f27af90 now confirms zero open PR-ref alerts; see the final section below.** Tests cover adversarial argument round trips, exception cleanup and actual HTTP fixture responses. Full unit suite passes **4,175 tests**; focused seven runtime/helper tests and eighteen security/compliance tests pass. Twelve build/layout guard tests and eleven patch-counter tests pass. The initial VM cross-realm assertion, sandbox loopback denial and stale44.8.0 compliance expectation are retained separately from final passes.

## Native certificate coverage

The exact prior signed source6b9a05a0 in a new isolated profile fetched Google's CRLSet10856 through Chromium's native component updater. The first attempt incorrectly stopped when the directory appeared; the corrected attempt waited for the actual `crl-set` payload. Raw netlogs remain local. This is not an extension upgrade or L4 evidence.

The payload explicitly blocks six of the eight official keys. The eight public certificates were obtained from Chromium's own blocklist fixtures and verified against the exact certificate fingerprints named by the upstream Electron mitigation; their actual SPKI hashes also match. [Certificate sources](certificate-sources.json), [downloaded CRLSet](crl-set-10856.gz).

The new `certificate-revocation.mjs` recipe adds the upstream eight-key blocklist to Chromium's built-in policy. It applies before any network update, remains in effect when parsing a downloaded CRLSet, and does not disable updates. Full-entry presence checks make preparation idempotent and reject an unexpected partial upstream shape.

Native validation distinguishes the mechanisms:

- The initial anchor-only certificate probe could not build the intended path; it is retained and not a revocation pass.
- With test-only trusted-leaf inputs, the prior built-in policy has no revocation result; downloaded10856 revokes the six TLS CA certificates. The two code-signing CAs are already invalid for TLS server use.
- After the patch, the stock native certificate verifier rejects all six TLS CA certificates as **ERR_CERT_REVOKED** with or without a downloaded CRLSet. The other two remain **ERR_CERT_INVALID**, not falsely labeled revoked. An unrelated generated certificate verifies successfully with the same test-only trust setup.
- A temporary **test-tool-only** diagnostic directly calls native `CRLSet::CheckSPKI`: all eight keys return **REVOKED** with built-in and downloaded policies (**16 checks**), and an unlisted key remains allowed. It is removed byte-for-byte afterward and the stock tool is rebuilt. It never enters the preview target or a distributed artifact. These are native verifier/API checks, not a forged live TLS-handshake demonstration or a permanent trust-store change.

The stock verifier's first incremental build completes912steps; the guarded browser patch build completes72steps in38.12s; subsequent verifier relinks are recorded. The final browser guard is zero; upstream inventory73files/179hunks, reflecting one additional upstream file/hunk under the owner's standing patch-budget direction. Compiler, SDK, GN arguments and caches are preserved. No competing compilation or Electron build.

The previous signed app/source6b9a05a0 and archivea7fe468c648e remain untouched and **do not contain this new blocklist**. A replacement signed candidate requires packaging/signing/notarization and relevant artifact-bound requalification before promotion. Existing L5/L6/L7/L8 acceptance records are not evidence for new bytes.

## Preservation and remaining acceptance

Only disposable local profiles were created; permanent Shipping/Preview profiles, open tabs and the independent Google baseline remain outside this work. Temporary private test keys are removed. No merge, public release, job rerun or advisory waiver. Latency deferred; Electron diagnostic build pending approval/unstarted. Next inspect exact-head CI/CodeQL, resolve any further findings, then prepare the replacement artifact and required acceptance mapping.

## Hosted repair-head verification and remaining failure

[Exact-head hosted record](hosted-ci.json): repair head `9f27af90e7bffdd8ae4957c9c1a6161221841740`, synthetic merge `29424200a6c2d0743fec450fa3f17705cdba3a37`. **Substrate succeeds. CodeQL succeeds and the paginated actual PR-merge-ref query returns zero open alerts**, clearing the original48. The analysis reports58 results versus106 previously; result count itself is not an acceptance criterion. At the recorded snapshot21checks succeeded,2failed,3queued,2running and2skipped (`installed-intel`, `linux-native-diagnostics`). No overall green claim.

The two failures are a separate [modified-link sandbox duplication finding](remaining-sandbox-failure.json): on Windows/Linux and local44.9.1, the child initially has the intended restriction, but its duplicate gets storage access. The failed assertion is **before** group reopening. Native `starting_sandbox_flags` supplies the initial restriction; the JS creation options and tab record have no corresponding flags, so a new tab cannot reproduce them from that record. The public preference readback supplies stored preferences, not this native policy state.

A trial that avoided history restoration when flags were nonzero did not fix absent metadata and was fully reverted. Temporary test-hook projections/window logs and the scratch runner are removed. The attempted44.8.0 comparison stopped at the runtime-version guard and is not a baseline pass/fail. We do not weaken the SecurityError assertion, guess permissive policy, or start the deferred Electron build. The original L11 dependency/CodeQL findings are cleared and native key coverage is verified, but **L11 remains open** for this sandbox finding, unfinished jobs and replacement-artifact qualification.
