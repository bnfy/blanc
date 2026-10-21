# Spike A replay contract and measured synthetic subset

This directory contains the dataset validator, authored transport pilots,
recording/replay tools and the approved synthetic corpus. The latest
[native checkpoint](../../evidence/f12-native-20261017/README.md) observes
5,123 distinct candidate URLs (2,503 blocked / 2,620 allowed) with no native
Chromium decision or context differences in two fresh runs per profile.
This is synthetic fixture parity for four resource types in one main frame,
not full Spike A acceptance or a real-web block rate. The historical public
recording track still has zero admitted real-page corpus requests.

## Approved synthetic acceptance track

The owner approved `tranche2-request.md` §2.1 at `68892cc1` (recorded in
§8.1). Acceptance provenance now comes from rule-derived authored pages and
two stable offline Electron replays, with independent context observations;
see [synthetic/README.md](synthetic/README.md) and its committed coverage matrix.
Rule predictions and generated counts are not oracle decisions. The 2,000
blocked / 2,000 allowed floor counts distinct URLs, excluding repeated runs.
Every candidate, including blocked ones, has authored response bytes; these
are explicitly not recordings of the original site. Full acceptance remains
pending, including uncovered request classes, cosmetics and latency.

Option C iterations are stopped. A separate bounded private real-browser
sample is authorized under §2.1 B, but is not implemented here and never
contributes to acceptance thresholds. Its raw data must remain local under
`~/Library/Caches/me.bnfy.blanc-f12-private-sanity/` with the specified expiry
and permissions. Public recording scrub rules below are unchanged; private
sample policy must be implemented separately, not by weakening those rules.

## Historical public recording track and unchanged persistence gates

The original real-page acceptance definition below is superseded by §2.1
for the synthetic track. It is retained as the public recorder design record,
not a requirement to restart option C. Actual offline decisions remain the oracle. Mock unit
fixtures are URL seeds only. Record the exact Electron build/source, engine and
EasyList/EasyPrivacy hashes, capture timestamps, disposable-profile configuration,
page entrypoints, response payload hashes and capture instrumentation. Do not use
`BLANC_TEST=1`: that mode disables the real blocker. Do not capture personal
browsing, authenticated traffic or the permanent profile. A scripted persistence
gate must exclude credentials and personal data before any evidence is written;
human review is an additional check, not the first scrub.

Replay must retain each original scheme, host, port and path, using isolated
transport (local proxy or resolver override and a fixture CA trusted only by the
disposable browsers). Do not rewrite requests to localhost URLs. Both browsers
must receive identical responses. Record server observations as well as blocker
observations; an absent network request alone does not prove a blocking decision.
The authored pilot and [controlled recorder/scrubber/stability pipeline](pipeline/README.md)
exist. Real-page acquisition/admission remains unmeasured. The synthetic native adapter
is measured separately; this controlled probe does not establish its coverage.

## Acquisition, stability and oracle order

The live acquisition run is **not the oracle**. Its decisions may be saved as
sanitized diagnostics, but never count toward the 2,000/2,000 acceptance totals.
A distinct recording tool may connect upstream using normal server certificate
and hostname verification; the offline replay tool must contain no upstream
forwarding or fallback. The current pilot is offline; the separate pipeline
recorder has only been exercised against a controlled local upstream.

1. Record a public, unauthenticated page load in a fresh disposable profile.
   Capture response bytes and metadata with the per-field persistence gate below.
   Keep the recording policy (including blocker state) explicit. A response
   prevented by the acquisition blocker is **not recorded**; never synthesize
   an allow response for it or describe an empty placeholder as acquired content.
2. Freeze a sanitized bundle with an inventory, transformation manifest and
   digest. Replay that exact bundle offline into Electron **twice**, using
   independent fresh profiles with identical configuration, pinned lists and
   defined entrypoints/actions/completion conditions. Repeat for each claimed
   profile kind. Both runs keep the real blocker enabled.
3. Compare the **complete in-scope request/hop graphs**, including repeated URL
   multiplicity, observed context, actual decisions and body/response selection.
   Do not take an intersection, deduplicate repeated URLs or drop unmatched
   observations to meet the count. Internal/background exclusions must be fixed
   and recorded before the runs, not chosen from their differences. Extra,
   missing or ambiguous requests reject the page/load; report rejected loads
   and reasons. Equal raw request IDs or event order are not required: retain
   independent causal correlation evidence and reject ambiguous matching.
4. Only a stable page/load contributes its actual **offline Electron** decisions
   to the frozen oracle. Retain both replays and their comparison. The thresholds
   apply after admission, not to the recording or discarded/duplicated traffic.
5. Replay the identical admitted bundle and conditions into the fork. Compare
   its independently observed context and decisions with the frozen oracle.
   A fork mismatch is reported, never used to prune the corpus retroactively.

An offline request with no recorded response is a harness fault if the browser
allows it to reach transport. Return a deterministic refusal, record the miss,
and fail admission/comparison; never fetch it live. A request actually cancelled
by the blocker does not need a fabricated response and must not be called a
transport miss merely because it never reached the proxy. If the fork allows
that same request, preserve **both** the observed blocking difference and the
missing-response limitation; do not conceal either or fabricate its descendants.
Do not treat a 502 page as a successful replay. Real recordings may require a
separately declared response-acquisition policy to cover requests blocked by the
recording run; that policy has not been implemented or measured yet.

### Electron stability versus the paired comparison

`pipeline/stability.mjs` admits two Electron replays into the oracle. It stays
strict: a transport fault there means the oracle is not stable. Never run the
fork through that oracle-admission function or discard the fork's decision log
because its transport failed.

`validate.py` compares independent oracle/fork decisions and optionally accepts
`--transport EVENTS.json`. Each event is `{ "code": "unrecorded-request",
"request_id": "causally-joined-request-hop-id" }`. The adapter must establish
that join from actual request/hop evidence, not guess from a matching URL. The
157 adapter and this join have not been implemented or exercised yet.

If the same valid context was blocked by the oracle but allowed by the fork,
the validator retains the **block→allow difference**. Its joined missing
response is a `response_limitations` entry (`blocked-response-not-acquired`),
not a reason to erase or invalidate that observed regression. Downstream
behavior is untested; it must not be fabricated. In particular, a missed script
receives a replay refusal instead of executing, so the requests it would cause
are never issued. Any reported fork false-negative count/rate in this mode is a
**lower bound**, not a complete estimate of downstream blocking regressions.
Carry that qualification next to every blocking-rate report, even when no
missing descendant appears in the observed log. Unknown/unjoined misses,
misses on an oracle-allowed response, mismatched contexts, duplicates and other
transport errors remain harness faults. Missing/extra descendants remain named
faults too, alongside the proven blocking difference. Consumers must inspect
both lists rather than convert a faulted run into "no result". The comparison
never passes when a blocking difference exists.

### Protocol and timing metadata

Record browser-to-proxy HTTP version and TLS ALPN, and recording-proxy-to-origin
HTTP version/ALPN **separately for every request** (with connection/stream mapping
where needed). Distinguish absent ALPN with HTTP/1.1 fallback from an explicitly
negotiated protocol. In offline replay there is no upstream leg: record it as
not applicable, never copy the recording's upstream protocol as a replay fact.
The current pilot parser is HTTP/1.1; it does not prove HTTP/2 or HTTP/3 behavior.
Any acquisition/replay protocol difference belongs in the bundle manifest and
stability evidence because it can change scheduling and the resulting request
set. Do not claim ordering or coalescing equivalence from matching body hashes.

### Scripted persistence gate (required before live acquisition)

The recording tool must sanitize **before writing** response bundles, request
observations, diagnostics, stdout/stderr evidence or crash artifacts. Do not
first write an unsanitized HAR and scrub it later. Raw acquisition values may
exist transiently in memory only. Use disposable unauthenticated sessions and a
bounded public-site allowlist; no personal profile, login flow or credentials.

- Strip `Cookie`, `Set-Cookie`, `Authorization`, `Proxy-Authorization` and other
  authentication/session headers, case-insensitively, including duplicate header
  forms. Use an explicit header allowlist for persisted metadata. Never forward
  user credentials. Record removal counts/reasons, not removed values.
- Parse URLs and inspect userinfo, path/query/fragment, redirect locations,
  referrers and embedded URLs. Flag likely session/tracking identifiers, tokens,
  signed URLs, email addresses and other personal values. **Do not delete or
  rewrite query parameters in an admitted URL**: rules may match them, and doing
  so would change the blocking question. Reject the affected page/load when a
  sensitive value is needed for its faithful request graph. Log only a neutral
  rejection ID/reason, not the rejected URL or a reversible substitute.
- Inspect decoded bodies as well as headers and URLs; compressed responses,
  HTML/JS-embedded identifiers and storage initialization can carry the same
  values. Unsupported encodings or uncertain sensitive content fail admission.
  No heuristic alone is a privacy guarantee. Human review follows the scripted
  gate before committing eligible bundles.
- Record approved non-URL transformations (such as removal of `Set-Cookie`)
  without retaining removed values. Both offline browsers receive the **same
  sanitized bundle**, and the stability runs occur **after** sanitization.
  Its payload hashes describe sanitized bytes, not unmodified origin responses.
  If a transformation changes page behavior so the load is unstable or context
  cannot be correlated, reject it rather than fill gaps with expected values.

The pipeline now exercises a narrow scrubber, per-leg protocol recorder and
single-frame stability matcher with unit/network tests and actual Electron
replays. General causal correlation, public-page completion, broader content
admission and request-path coverage still need implementation and runtime proof
before real-page acquisition. This section remains the full contract.

## Decision records

`validate.py ORACLE.json OBSERVED.json` accepts two JSON arrays. Each element is:

```json
{
  "id": "page-01/request-07/hop-0",
  "context": {
    "url": "https://asset.example:8443/ad.js?slot=2",
    "method": "GET",
    "resource_type": "script",
    "initiator_origin": "https://page.example",
    "top_frame_origin": "https://page.example",
    "frame_role": "main",
    "profile_kind": "regular",
    "redirect_index": 0
  },
  "decision": "block"
}
```

The oracle stores context observed by Electron's real blocking hook, normalized
only by the explicit field rules below. The main-navigation top-frame rule uses
the observed request URL; it is not a raw committed-frame-origin claim. The replay adapter stores what the fork's hook actually received,
not a copy of expected fields. Join IDs must identify an individual request hop,
including repeated identical URLs; derive them from the harness's request graph
without changing the URL or headers visible to the blocker. Record raw browser
request IDs and the correlation mapping as separate evidence. Browser-specific
numeric frame IDs are mapped to stable frame roles, with that mapping retained.

`profile_kind` is required and accepts only `regular` or `private`. Record it
from the actual originating session/BrowserContext, including worker requests;
do not infer it from the visible window or copy the expected value. A profile
mismatch is a harness fault. Profile identity enables the separate regular and
private coverage probes; a corpus of only regular records does not establish
private coverage even when its dataset comparison passes.

Origin fields must be explicit. Use `opaque:<fixture-token>` for opaque origins
and `absent` only when the hook genuinely receives no value; never substitute the
top frame's origin for an absent worker initiator. Adapters must document any
resource-type normalization and preserve raw values. Missing or mismatched
context is a **harness fault**, not a blocking result. Redirect hops are distinct
records. A cancelled predecessor may prevent later requests: fixtures must load
independently or record the resulting missing observations as a harness fault,
never fabricate decisions for requests that were not issued.

The validator compares exact context, rejects missing/extra/duplicate observations
and invalid decisions, reports both allow→block and block→allow differences, and
requires both minimum counts. It does not authenticate provenance, detect a
fabricated corpus, verify browser instrumentation, or establish request-path
coverage. `capture_provenance_verified` therefore remains false even when dataset
comparison succeeds. Exit 0 means only that the supplied datasets compare cleanly
and meet the counts; exit 1 means comparison failure and exit 2 means input error.

## Per-field mapping and comparison policy

This is the adapter contract, **not an implemented Chromium adapter or a coverage
pass**. Every `context` field remains an exact comparison; recorded-only metadata
lives beside the raw evidence, outside `context`. An unavailable observation is
not a license to set `absent` on both sides or skip a comparison. Keep an
unresolved request class in the coverage report and out of accepted parity
results until its observation/correlation is demonstrated on both browsers.

| Field | Electron 44.8.0 source | Chromium 157 source / required adapter behavior | Policy |
| --- | --- | --- | --- |
| `url` | `details.url` at provider entry | `ResourceRequest.url` at interception | Compare the actual serialized request URL for this hop, preserving scheme/host/port/path/query; never use the local proxy URL. |
| `method` | `details.method` | `ResourceRequest.method` | Compare exactly. |
| `resource_type` | `details.resourceType` | Classify the actual request using the pinned `ToWebRequestResourceType` rules, not destination alone | Compare normalized common names; retain both raw classifications and inputs. Mapping below. |
| `initiator_origin` | **`details.initiatorOrigin`**, plus property-presence bit | `ResourceRequest.request_initiator`, plus optional-presence bit | Compare serialized origin, or `absent` for a genuinely missing optional. No frame-origin or referrer substitution. Applies to navigations too; browser-started and renderer-started navigations must not be conflated. |
| `top_frame_origin` | Main-frame navigation: origin of `details.url` for that hop. Frame-bound subresource/subframe navigation: synchronously snapshot `details.frame.top.origin` | Main-frame navigation: origin of actual request URL for that hop. Frame-bound other requests: originating frame's outermost main-frame committed origin, captured with the request's frame identity | Compare the defined normalized value. Retain raw precommit frame values separately. Frameless workers/service workers, opaque origins and teardown races remain admission blockers until independently correlated; never use the currently visible tab. |
| `frame_role` | Request/frame lifecycle graph correlated with `details.frame` identity and resource type | Equivalent graph from the originating frame/worker identity and navigation metadata | Compare stable roles such as `main` or a fixture frame path. Do not compare process-specific numeric IDs. Null frame does not imply main frame. Worker roles need dedicated correlation evidence. |
| `profile_kind` | Actual originating Session (`isPersistent()` in this disposable harness with only its regular/private sessions) | Actual originating BrowserContext's off-the-record state | Compare `regular`/`private`. Retain session identity; persistence is not a general definition of privacy for arbitrary Electron sessions. |
| `redirect_index` | Count actual correlated redirect events for the request, starting at zero | Count actual redirect callbacks for the corresponding request | Compare each hop; do not assign zero when redirect instrumentation is absent. Redirect capture is pending. |
| Raw `referrer` / effective engine source URL | `details.referrer`; Ghostery's `fromElectronDetails` uses this as `sourceUrl` | Request referrer and the source URL actually passed to the chosen engine | Record separately; never rename either to initiator. Not compared by the current dataset validator. The future adapter must report and review engine-input differences before interpreting block-rate parity; raw logging alone does not validate those inputs. |
| Raw frame origin, top origin, tab URL, request/frame/process IDs | Snapshot at provider entry | Snapshot at interception | Record only; retain lifecycle mapping evidence. These can describe precommit/obsolete frames and cannot repair a missing initiator. |

### Approved explicit worker-context branch — October 17, 2026

The owner approved **“Yes—use explicit worker contexts with strict evidence”**
in response to: “If runtime observations prove a shared/service-worker request
has no unique document frame, may I represent its context explicitly as a worker
identity plus observed client set, while keeping ambiguous or uncorrelated
requests as gaps? This changes the comparison contract; it would not substitute
a visible-tab or storage-partition origin.”

For these frameless requests, the typed alternative to a document context is
`{kind, scriptUrl, executionOrigin, profileKind, documentFrame: not-associated,
clients}`. Both runtimes must independently prove the worker request identity,
realm and observed client set. Raw hook fields remain unchanged. Client kind is
explicit: service-worker **controlled documents** are not shared-worker connected
documents, all message senders, or a synthetic top frame. An unobserved set is
never an empty set. Other request fields, including actual initiator, method,
resource type, profile, hop, referrer and decision, still compare exactly.

The implementation is currently only the bounded `synthetic/paths-compare.mjs`
adapter with its archived browser observations. It does not relax the generic
dataset validator, rewrite engine inputs, or admit untested worker classes into
the 2,000/2,000 corpus. See [the worker protocol](synthetic/PATHS-AND-LATENCY.md)
for exact joins, observation limits and remaining gaps. A counterpart without
independent evidence remains a gap even if the other runtime resolves it.

Canonical resource names use Electron's vocabulary: `main_frame` → `mainFrame`,
`sub_frame` → `subFrame`, `xmlhttprequest` → `xhr`, `csp_report` → `cspReport`,
`websocket` → `webSocket`; stylesheet/script/image/font/object/ping/media/other
are unchanged. Fetch, including fetch keepalive, is `xhr` under the pinned
classifier's `is_fetch_like_api` rule. Worker-script destinations classify as
script, but that does not establish worker coverage. WebTransport/WebBundle or
any new/unmapped type require an explicit source and runtime audit rather than
silently collapsing to `other`. Preserve destination, fetch-like and keepalive
inputs on the fork side so that classification can be checked.

Opaque origin serialization (`"null"`) is distinct from a missing optional.
Electron does not expose its opaque nonce in this string. The existing
`opaque:<fixture-token>` convention therefore requires independent lifecycle
correlation evidence; it must not be guessed from referrer or expected output.
Opaque-origin acceptance is pending, not waived. Likewise a dead/unavailable
frame is an observation failure, not proof there is no top frame.

### Source and runtime check for the pilot review

The first pilot observer read the nonexistent `details.initiator`; its nulls
cannot establish a browser limitation. Electron's pinned
[`ToDictionary`](https://github.com/electron/electron/blob/v44.8.0/shell/browser/api/electron_api_web_request.cc#L104-L144)
exports `initiatorOrigin` from `WebRequestInfo::initiator`. In the pinned 157
checkout, `extensions/browser/api/web_request/web_request_info.cc:265` initializes
that field from `request.request_initiator`; its resource classifier starts at
line 176. `services/network/public/cpp/resource_request.h:207` declares the
optional origin. The 44.8.0 `OnBeforeRequestListenerDetails` declaration also
names `initiatorOrigin` (not `initiator`).

[PR #909 run 07](https://github.com/bnfy/blanc/blob/40d42a668bb7e412a7f26c18cec86f5c1ddd0b10/experiments/chromium-extension-spike/evidence/f12-http-capture-20261017/run-07/report.json)
passes with real initiators on ten subresources across regular/private profiles,
including two no-referrer fetches; both browser-started navigations genuinely
lack the property. That is evidence for those HTTP fixture cases only. No 157
comparison, worker/redirect/opaque-origin coverage or acceptance corpus is claimed.
The capture now records every provider `onBeforeRequest` call, not only fixture
URLs; requests bypassing the provider still need the coverage audit.

## Remaining acceptance evidence

- A coverage fixture for every path in the [source audit](../../evidence/f12-spike-a/request-path-audit.md), including worker/null-frame and post-teardown traffic.
- Independent native CSS, procedural cosmetic and main-world scriptlet outcome pages, including inserted/re-attributed/moved nodes after timers.
- Hook-entry-to-decision-applied latency, using native `base::TimeTicks` and including Mojo round trips: one discarded warm-up, five page-load repetitions, p50/p95/p99 per run and median across runs. First 200 cold requests reported separately. Electron reference measured comparably.
- Provenance and context checks reviewed before interpreting any parity percentage.

Run validator unit tests with:

```
PYTHONDONTWRITEBYTECODE=1 python3 experiments/chromium-extension-spike/fixtures/replay/validate-test.py
```

The generated records in those tests are synthetic and must never be installed
as the acceptance corpus or cited as browser coverage.

## Public feasibility result (owner-selected C)

[Ten-entrypoint probe](../../evidence/f12-public-feasibility-20261017/README.md):
0/10 initial documents passed the existing policy (7 Vary refusals, 3 unsupported
statuses). No public bundle/oracle was persisted; this measures an admission
barrier, not tracker distribution. General real-page capture is still pending.

Repeat C after supported Vary, entrypoint preflight and empty-body handling:
[category-first report](../../evidence/f12-public-feasibility-repeat-20261017/README.md).
Still 0/10 documents admitted: 3 uncontrolled Vary, 4 encoded/opaque bodies,
1 HTTP 401 and 2 HTTP 403. No redirects observed; script/xhr/image refusal rates
remain unmeasurable, not zero. No body/identifier gate was relaxed.

### Worker ownership checkpoint (October 17)

[Evidence](../../evidence/f12-worker-ownership-20261017/README.md): shared-worker clients now correlate through actual
MessagePort challenges and independently observed document/worker realms; the
initial service script joins the new worker's DevTools token and lifecycle.
All ten authored path cases match in three variants, regular/private, twice per
runtime. This closes the two bounded gaps, not the broad worker matrix.
Multiple clients, teardown, updates and fetch/cache behavior remain untested.
122 focused tests pass. No native build or engine-input change; latency deferred.
The earlier debugger-barrier claim is corrected in PATHS-AND-LATENCY.md: requesting
a breakpoint did not establish a pause; the authored readiness gate now provides
explicit observed readiness and is excluded from latency.

### Shared lifecycle checkpoint (October 17)

[Evidence](../../evidence/f12-shared-lifecycle-20261017/README.md): two observed
document clients and navigation-driven destruction of one exact owner now pass
in regular/private profiles, twice per runtime. The prior authored path suite
also remains green. The evidence does not generalize to more owners, embedded
clients, explicit port transfer/close, target-close continuation, or teardown
races. No native build was needed; latency remains deferred.
