## Opaque/blob static origin fallback investigation — October 17, 2026

Native-only investigation on the existing Chromium 157 binary.
The pinned source distinguishes legacy `matchAboutBlank`'s about-only ancestor
climb from static content scripts' `match_origin_as_fallback` origin/precursor
matching for about/blob/data/filesystem. Host permission checks remain in place.
The legacy climb can stop at a remote parent; this is consistent with the opaque
refusal, but no internal trace proves that particular bailout. webNavigation's
valid-scheme list separately excludes blob, explaining its enumeration omission.

Two **diagnostic-only copies** of the existing observed uBO payload add one static
isolated-world content script, matched only to the two authored fixture origins,
at document idle. They differ only in `match_about_blank` versus
`match_origin_as_fallback`. Existing scripts, permissions and private exclusion
are preserved. The prototype's existing payload is not edited. The test receiver
sends actual browser `MessageSender` frame/document id, URL and origin; the harness
requires an exact unique authored document before targeting its `documentId`.
No permission or extension-system patch, guessed frame id or substituted origin.

The matched final comparison has ten frame kinds over two document cycles:

- About-only mode: **4 positive-control passes / 16 absent-receiver gaps**.
  The HTTP and inherited-srcdoc controls confirm the content script is loaded.
- Origin mode: **14 diagnostic static-delivery passes / 6 gaps per profile**,
  reproduced in two fresh profiles (**28 / 12**). New reachable kinds are opaque
  srcdoc, blob, sandboxed blob, nested opaque srcdoc and child-origin blob.
  Their browser-provided origins stay unchanged, including opaque `null`.
- Static data, nested-data and nested-blob receivers remain absent. The earlier
  programmatic data/nested-data passes still stand; the two APIs behave differently.
  This absence is retained as a gap, not attributed to a source cause without proof.
- All three final profiles pass two out-of-scope controls: unmatched HTTP and
  sandboxed srcdoc produce no diagnostic receiver or fixture-specific scriptlets.
  Existing generic native scriptlet counters may still be present and are recorded.

Each successful receiver gets the real engine main-world payload twice through
extension messaging and DOM script insertion. Actual main-world attempts increase
by at least two while the body count remains one. **No direct Playwright payload
evaluation is used.** Payload bytes and exact responses/identity are archived.
This proves a bounded, supported extension delivery mechanism. It is **not yet
provider integration**: fixture-selected rule context is still supplied by the
harness; authenticated context selection, readiness/generation/lifetime binding,
CSP/ancestor rules, recovery and privilege containment remain required. The
receiver is intentionally an isolated experiment, never shipped or installed into
the permanent profile. No new private uBO or Electron acceptance claim is added.

**216 focused tests / 114-file lint pass.** Seven new verifier tests reject absent
arrival, wrong/stale identity or origin, duplicate execution, direct-eval claims,
widened manifest scope, unmatched-host delivery and payload tampering. The loaded
manifest itself is verified. Guarded native plan: **zero actions, 5.68 seconds**;
no compilation. Native app/framework hashes remain unchanged; last measured patch
footprint remains 31 files / 74 hunks, not remeasured here. All experiment profiles
are removed. Early exploratory runs are archived separately from the final proof;
one scope-control attempt failed because it incorrectly expected no generic native
counter at all. The final control checks actual fixture-specific effects instead.

Claude Code plan and routine ledger updated. Spike B remains in progress. Qualified
latency remains deferred; harness wall times are not latency measurements. Electron
diagnostic build §8 remains unchecked/unstarted. Task 0 and items 3–6 are unchanged.

## Archive and reproduction

Four lossless archives contain all exploratory/final runtime observations, final
source, build/check invocations and both diagnostic payload deltas. The unchanged
base payload is also inventoried. Upstream pin/licence and whole/member hashes are
included; private keys and profiles are excluded. `archive-verification.json`
records independent verification after extraction. Early source hashes describe
those attempted harnesses; the source archive is the final version.

After extracting `runtime.tar.gz`, run:

```sh
node experiments/chromium-extension-spike/fixtures/replay/synthetic/origin-fallback-verify.mjs EXTRACTED/about03
node experiments/chromium-extension-spike/fixtures/replay/synthetic/origin-fallback-verify.mjs EXTRACTED/origin03
node experiments/chromium-extension-spike/fixtures/replay/synthetic/origin-fallback-verify.mjs EXTRACTED/origin04
```

Create the diagnostic clones with `origin-fallback-payload.mjs BASE NEW_OUTPUT
about|origin`; the fixed manifest entry cannot accept arbitrary host patterns.
Run `origin-fallback-run.mjs CONFIG DIAGNOSTIC_PAYLOAD NEW_EVIDENCE`. The archived
configs choose the manifest mode, existing binary and offline fixture transport.
The helper never edits BASE. No new permissions, broad cert bypass or native build.
The source audit retains pinned hashes and exact lines for both fallback modes.
