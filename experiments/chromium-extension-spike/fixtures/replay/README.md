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

The oracle stores context observed by Electron's real blocking hook, not inferred
from the URL. The replay adapter stores what the fork's hook actually received,
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
