# Synthetic corpus and native Chromium comparison

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

`run.mjs ELECTRON APP_ASAR ASAR_MODULE PLAYWRIGHT_MODULE NEW_EVIDENCE_DIR [probe|full] [default|no-referrer]`
selects either the first two compatible candidates per kind/type (24), or all
5,123 candidates whose declared source is `page.blanc-fixture.test`. Another
782 domain-scoped candidates remain excluded, explicitly. Both modes add four
first-party authored coverage controls; these are never counted toward the
2,000/2,000 floor. The generator's `party` field is a construction hint, not
observed classification. The summary uses observed request/top-frame origins
and a pinned PSL implementation instead.

Each mode performs two fresh regular and two fresh private offline Electron
replays, using the real provider observer and strict single-frame stability
comparison. Requests run at eight-way authored concurrency; timeouts, missing
loads, ambiguous contexts and absent children fail the whole run. A script
consumes its child's complete response body before signalling completion.
Every scripted response, including a blocked parent's response, exists offline.
The installed ASAR is read-only; profiles and extracted app trees are disposable.
`BLANC_TEST=0` keeps the real engine and startup gate enabled.

TLS is fixture-scoped: groups of at most 400 exact SAN hosts avoid oversized
certificates, CONNECT selects the TLS context and SNI/Host must agree. Both
browsers pin only this run's fresh leaf public keys through
`--ignore-certificate-errors-spki-list`; no global ignore switch or system CA
installation is used. Electron also retains the exact leaf/CA/host session
verifier. Its verifier-only large runs intermittently rejected valid pins; all
failures are retained, with root cause not claimed. `trust-probe.mjs` checks in
both real browsers that the pinned leaf loads and an unpinned leaf never reaches
HTTP. Keys and profiles are deleted after each invocation.

`chromium-baseline.mjs CHROMIUM_EXECUTABLE ASSETS PLAYWRIGHT_MODULE ELECTRON_EVIDENCE NEW_EVIDENCE`
launches the built 157 executable in disposable regular/private contexts, twice
each. It loads the *same bytes*, records CDP requests, response completion,
proxy body hashes and actual DOM/script-child execution. It never uses Electron
decisions to intercept or answer requests. This is intentionally a **no-blocker
negative control**, not the native hook adapter: the utility-process engine and
browser interception are not implemented. CDP's initiator type or document URL
is not substituted for `request_initiator`, and no acceptance parity percentage
is calculated. The full comparison must wait for independent hook observations.

The proxy refuses background attempts too. Denials to the exact built-in
`clients2.google.com`, `www.google.com:443` and `accounts.google.com:443`
endpoints outside the observed page are retained as service-denial evidence,
separately from page fixture faults. An unknown page request, unknown authority,
missing/incorrect payload, cache hit, failed load or unexecuted child fails the
control. The transport never forwards a denied request.

`summarize.mjs ELECTRON_FULL NO_REFERRER_PROBE CHROMIUM_FULL TLDTS_MODULE NEW_OUTPUT`
counts distinct observed candidate URLs once per profile. It does not add
profiles, repeat runs, coverage controls or children to the floor. The source
list and module hashes accompany observed per-type/party/kind counts.

See [the expanded evidence](../../../evidence/f12-expanded-20261017/README.md)
for stable oracle counts, failed attempts, TLS controls and Chromium differences.
A numerical floor alone is not acceptance: the planned matrix in `coverage.json`
stays open. Native interception, independent context, expanded frame/path/type
coverage, cosmetics, scriptlets, latency and the private real-page sample remain
gaps. No native build, baseline promotion, deadline extension or private-page
acquisition occurred in this checkpoint.

## Native engine checkpoint

`chromium-native.mjs CHROMIUM_EXE UI_ASSETS PLAYWRIGHT_MODULE ELECTRON_ORACLE
NEW_EVIDENCE ENGINE_OUTPUT` runs the actual native factory/utility hook with
independent context logs. `native-comparison.mjs` rejects engine failures,
context/referrer mismatches, duplicates, unexpected traffic, incomplete response
bytes and DOM/child-load failures. It does not route or cancel requests from
Electron's recorded answers. The earlier `chromium.mjs` remains the explicit
no-blocker negative control, not this adapter.

[Native evidence](../../../evidence/f12-native-20261017/README.md): full corpus
and no-referrer subset pass twice in regular and private profiles. The full
corpus has 2,503 blocked / 2,620 allowed distinct candidates, with zero decision
or native-context differences. Counts exclude repeats, controls and children.
The broad coverage matrix remains incomplete, so `acceptance` stays false.
Missing/tampered assets and utility termination fail closed in actual process
probes. Latency-protocol, redirect, worker/SW, speculative, WebSocket/WebTransport,
cosmetic and scriptlet gaps are explicitly retained.

Redirect/worker and latency extension: see [measured results](../../../evidence/f12-paths-latency-20261017/README.md). GET redirects and dedicated workers pass the bounded probes; shared/service worker identity and quiet-machine latency remain gaps.

Explicit worker-context follow-up: [evidence](../../../evidence/f12-worker-identity-20261017/README.md). Six service-worker subrequests now compare with independently observed worker identity and controlled-client sets in both profiles. Shared connected-client lifecycle and the initial service-worker script remain gaps. Engine inputs are unchanged; latency stays deferred.

### Worker ownership checkpoint (October 17)

[Evidence](../../../evidence/f12-worker-ownership-20261017/README.md): shared-worker clients now correlate through actual
MessagePort challenges and independently observed document/worker realms; the
initial service script joins the new worker's DevTools token and lifecycle.
All ten authored path cases match in three variants, regular/private, twice per
runtime. This closes the two bounded gaps, not the broad worker matrix.
Multiple clients, teardown, updates and fetch/cache behavior remain untested.
122 focused tests pass. No native build or engine-input change; latency deferred.
The earlier debugger-barrier claim is corrected in PATHS-AND-LATENCY.md: requesting
a breakpoint did not establish a pause; the authored readiness gate now provides
explicit observed readiness and is excluded from latency.
