# Four CodeQL findings: remediation and regressions — October 17, 2026

Parent `fc87f104` completed 21 successful checks and one failed CodeQL check
`117574466393`, with four alerts: an HTTP script fetch in the readiness harness,
hostname substring comparisons in that probe and its verifier, and JSON-only
sanitization of the marker literal in `scriptlet-once.mjs`.

## Changes

- Readiness traffic now uses the existing offline fixture TLS transport, a fresh
  one-day certificate and the disposable process's exact leaf SPKI pin. No public
  TLS upstream, DNS fallback, keychain install or broad certificate-error bypass.
  The native synthetic control endpoint remains separate from fixture transport.
- Shared URL parsing checks HTTPS, exact hostname, default port and absent
  credentials. The probe and verifier compare parsed hostnames, not substrings.
  Tests reject lookalikes, user-info tricks, ports, plaintext and malformed URLs;
  a hostname appearing only in an allowed URL's path/query is not a blocked host.
- The self-contained serialized wrapper escapes HTML metacharacters and Unicode
  line separators after JSON quoting, as required for an HTML-script literal.
  Strict string/length validation also rejects the regex end-anchor newline case.
  Actual engine-generated executable code remains code, not encoded data; the
  marker does not become an authorization boundary. Tests exercise hostile marker
  values and the function serialized without external dependencies.

The literal treatment follows [CodeQL's context-specific escaping guidance](https://codeql.github.com/codeql-query-help/javascript/js-bad-code-sanitization/).
No suppressions, query exclusions or weakened tests were added. GitHub's new
current-head scan is required to confirm all four alerts clear; local passes
alone do not establish that.

## Runtime and checks

Fresh generated provider verifies all 658 pinned upstream files. HTTPS readiness:
**10 bounded checks plus one missing-startup-handshake check** pass, including
bundled-list replacement, real authored-rule blocking, hold/release, list reload,
private blocker independence, stale/popup rejection and background loss. The first
HTTPS attempt's verifier failed because mixed-content blocking intercepted its
HTTP page-control request before the native handler. It is archived and excluded.
The corrected HTTPS negative probe requires an observed native rejection. Because
the native handler also refuses HTTPS, this is explicitly **not an isolated sender
authorization proof**; the same-extension popup check retains the accepted control
scheme and current generation. No mixed-content bypass was introduced.

Generated-wrapper runtime regression: **18 automatic non-HTTP deliveries, two
HTTP controls, 13 identity/generation checks and 15 CSP/Trusted Types cases** pass,
with one body per document. **242 focused tests / 128-file lint** pass. One initial
test-literal lint error was corrected and retained. All test profiles/certificate
private keys removed; no owned test processes remain. Four hash-verified archives
retain logs, runtime observations, source snapshots, payload deltas/licence/pin and
independently reproduced proofs.

No native source changes or compilation: **zero-action guard, 4.29 s**. Executable
and framework hashes match the preceding build. Last footprint31/74 is historical,
not remeasured. No full network corpus, Electron run or reload scheduling matrix
rerun. After-dispatch atomicity and broader context/scriptlet/containment gaps
remain exactly as before. Latency deferred; Electron build §8 unapproved/unstarted.
Task0 promotion and plan items3–6 are unchanged.
