# Synthetic acceptance corpus: generation checkpoint

Owner approval: `tranche2-request.md` §8.1, reviewed at `68892cc1`.
List-derived data and generated page content carry [../NOTICE](../NOTICE).
First-party generator and harness code retain their existing terms.

`generate.mjs` verifies the two pinned source hashes, then parses a deliberately
small, explicit domain-anchor subset. It does not implement filter matching.
Unsupported modifiers, wildcard patterns, multi-domain scopes, cosmetics and
public-policy refusals are counted by reason. Each candidate records its source
file, hash, line and rule. Candidate kind describes derivation, **not a decision**.
Only observed decisions in stable offline Electron runs can populate an oracle.

The default cap is 2,500 blocking-rule seeds and 2,500 exception-rule seeds,
with a per-list quota of half each cap to avoid one list consuming the sample.
Source/list order and line order are deterministic. Underfilled quotas are
reported, not silently filled with duplicate rules. Unconstrained network rules
are assigned script/image/stylesheet/xhr by the first SHA-256 byte modulo four;
explicit type modifiers keep their type. This is a sampling strategy, not a
claim that all rule families or resource types are represented.

Near-miss controls append `.blanc-control.test` after a third-party rule's
hostname, testing the domain-anchor boundary rather than varying a random
query identifier. Their relation to the original URL is recorded. They are
candidates for allowed traffic; the provider may still block them. Exact URLs
are deduplicated across sources. Repeated profiles and replay runs never add
URLs to the threshold. Counts by rule, family, profile/context and actual
observed decision remain separate.

Every candidate has a complete authored response, including likely-blocked
scripts. Scripts issue a separately declared authored child fetch and signal
its completion. These bytes are fixture behavior, not acquired site content.
The transport serves only exact manifest entries over disposable fixture TLS;
unknown requests return 502 and fault the run. There is no upstream client or
DNS fallback. Synthetic manifest trust is separate from public recording
admission: the existing public scrubber has not been loosened.

## Commands

From the repository root (use the pinned local Node runtime):

```
node experiments/chromium-extension-spike/fixtures/replay/synthetic/generate.mjs adblock/sources /new/path/candidates.json
node --test experiments/chromium-extension-spike/fixtures/replay/synthetic/generate-test.mjs
```

The output path must be new. The output says `acceptedOracleUrls: 0` and
`captureProvenanceVerified: false`; generated counts do not meet acceptance.

`run.mjs ELECTRON APP_ASAR ASAR_MODULE PLAYWRIGHT_MODULE NEW_EVIDENCE_DIR`
selects the first two compatible script/xhr/image/stylesheet candidates of
each kind (24 total)
with `page.blanc-fixture.test` as their source. It performs two fresh regular
and two fresh private offline replays of the same authored response manifest,
using the existing provider observer and a synthetic-only single-frame
stability gate that admits those four resource types. The public recorder
admission gate is unchanged.
It verifies the installed app's list pins against the generated source pins,
records wrapper/engine artifact/build/configuration identifiers and checks
child completion. The installed app remains read-only; all launches use
extracted source and disposable profiles, `BLANC_TEST=0`, the real blocker,
fixture-only certificate trust and resolver rules denying direct network access.

This small probe is not the 4,000-URL acceptance corpus and has no native fork
adapter. Exceptions, negative controls and source rule labels cannot stand in
for observed decisions. Preserve every failed attempt. The matrix in
`coverage.json` was committed before capture; all full acceptance cells remain
`gap` until both browsers and required contexts have evidence. A passed resource
probe alone does not update an entire matrix row to `passed`.

Next: expand independently correlated resource types, first-party and frame
contexts, redirects, and batch the distinct candidates; build the native
adapter under the existing guard before claiming synthetic fixture parity.
Cosmetics, scriptlets, latency and private real-page sanity recording are still
pending. No native build or private real-page acquisition is part of this
checkpoint. No deadline or budget is extended.
