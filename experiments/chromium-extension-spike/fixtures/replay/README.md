# Spike A replay contract — capture pending

This directory currently contains a **dataset validator and its synthetic unit
tests**, not the acceptance corpus. Captured real Electron requests: **0**.
No browser interception, transport, block-rate, cosmetic or latency pass is claimed.
The validator's success is necessary but insufficient for Spike A acceptance.

## Capture and replay requirements

Capture at least 2,000 blocked and 2,000 allowed requests from real Electron
Blanc page loads, with the blocker's actual decisions as the oracle. Mock unit
fixtures are URL seeds only. Record the exact Electron build/source, engine and
EasyList/EasyPrivacy hashes, capture timestamps, disposable-profile configuration,
page entrypoints, response payload hashes and capture instrumentation. Do not use
`BLANC_TEST=1`: that mode disables the real blocker. Do not capture personal
browsing, authenticated traffic or the permanent profile. Review captured content
before committing it; exclude credentials and personal data.

Replay must retain each original scheme, host, port and path, using isolated
transport (local proxy or resolver override and a fixture CA trusted only by the
disposable browsers). Do not rewrite requests to localhost URLs. Both browsers
must receive identical responses. Record server observations as well as blocker
observations; an absent network request alone does not prove a blocking decision.
The transport and capture adapters are **not implemented** in this checkpoint.

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
