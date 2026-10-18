# Inherited document start, Electron attribution and build proposal

October 17, 2026. Bounded prototype follow-up, not full Spike A/B acceptance.
The working156 build, permanent profiles and installed shipping Electron are
unchanged. Latency qualification remains deferred, including gate overhead.

## Implementation and measured outcomes

The opt-in native renderer now asks the document service about about:blank and
srcdoc as well as HTTP(S). For a non-HTTP document, the browser requires its exact
committed URL, a non-opaque HTTP(S) origin and an actual parent with the same
committed origin. That verified origin is used **only for scriptlet selection**;
the actual document remains bound by WeakDocumentPtr and its profile/generation.
It does not replace the URL, initiator or origin in network evidence. Opaque or
unsupported contexts return no added payload; they are not claimed protected.

Eight fresh sessions repeat the seven-case matrix in each runtime/profile:

| Scope | Measured result |
| --- | --- |
| Native regular HTTP and sandboxed HTTP | 4/4 first-inline constant/getter and immediate-fetch prevention pass. |
| Native regular inherited srcdoc and blank | **4/4 newly passing** first-inline/getter/fetch checks. |
| Native regular opaque srcdoc and data | 4 early coverage gaps; no guessed ancestor origin. |
| Electron regular scripts-enabled cases | 12 early gaps; shipping early timing remains unfixed. |
| Both private profiles | **24/24** allowed/control outcomes plus actual private Blanc cancellation records, including all six formerly missing Electron records. uBO stays disabled. |
| Sandbox without scripts | 8/8 authored scripts remain unexecuted; sandbox enforcement only. |

The scoped verifier reports **40 passes / 16 gaps**, not 56 full-acceptance passes.
Private proofs compare actual hook initiator presence and origin, frame/top
origin where supplied, provider/profile and cancellation. Literal opaque `null`
is retained. A request that merely never reaches the proxy cannot supply its
own missing provider observation anymore. The URL join here is bounded to one
known probe per case; it is not worker registration identity.

The synthetic Electron observer now admits exact about:blank/about:srcdoc frame
metadata and only the exact authored data URLs supplied by this fixture runner.
It preserves the original observation. All actual network/referrer/initiator/
redirect fields still use the public scrubber unchanged. Unknown data, blob,
file and other schemes and sensitive remaining metadata are refused. This is
not an admission change for real-page recording or the corpus contract.

Separate inherited safety run: **6/6** normal, explicit scriptlet exceptions,
and restored filters across srcdoc/blank pass. Exceptions let the allowed fetch
reach the proxy; restored rules prevent it again. Existing document-gate safety:
**7/7** profile binding, exception/generation, cross-host, new-document and missing
payload timeout checks pass. The full 5,123-URL corpus and the previous complete
ancestor/timing matrices were not rerun; their earlier evidence stays historical.

## Build and verification

- Reviewed plan: two scheduled actions. One guarded incremental build succeeded:
  **37.45 s wrapper / 33.62 s Siso, eight steps**. No failed compile, cold output,
  hooks, GN-args or toolchain change. Final guard: **zero actions**.
- Fresh patch counter: **31 upstream files / 74 hunks**, within 40/120.
- **187 focused tests pass**, **96-file lint** clean. Negative tests reject
  missing attribution, wrong opaque initiator, late-only inherited effects,
  unknown data metadata and applying frame exemptions to network fields.
- Runtime matrix 69.33 s, inherited safety 9.18 s; exact invocation times in
  `invocations.jsonl`. These are run/build costs, not a qualified request-latency
  result. Raw existing hook duration fields are not aggregated or benchmarked.
- `cleanup.json` records removed ephemeral roots/CA keys/profiles and no owned
  runtime processes. Native binary digests are in `binary-hashes.json`.
- Four lossless archives with whole-file/member hashes in `archives.json`:
  runtime observations and safety reports, exact source snapshot, build/check
  logs, and pinned Electron build references with license. No real-page/private
  user data or fixture private keys are committed.

## Electron diagnostic build remains a proposal

[Build request](../../electron-instrumentation-build-request.md) pins Electron
v44.8.0 at `60169b45c12488c6fda237af7f6425526a7ce5f0`, one new isolated arm64
output, testing args, local prerequisites, guard requirements and stop limits.
Read-only machine/tag/source observations are archived. Its §8 is **unchecked**.
No new Electron checkout, hooks, tools or cold build started. The proposed
4–8h compile/220GiB root budget is unmeasured; existing Xcode and both Chromium
outputs stay untouched. Instrumentation remains unimplemented and independent
Electron worker update identity remains a gap.

## Reproduce and remaining work

```sh
node experiments/chromium-extension-spike/fixtures/replay/synthetic/opaque-frame-run.mjs CONFIG PAYLOAD NEW_OUTPUT
node experiments/chromium-extension-spike/fixtures/replay/synthetic/opaque-frame-verify.mjs NEW_OUTPUT --inherited
node experiments/chromium-extension-spike/fixtures/replay/synthetic/inherited-frame-safety-run.mjs CONFIG PAYLOAD NEW_SAFETY_OUTPUT
```

Config is archived in `build-and-checks.tar.gz/config.json`; payload is unchanged
from `f12-subframe-trace-20261017`. Extract `runtime.tar.gz` and independently run
the verifier against `frames --inherited`; safety reports must have completion,
cleanup and exactly six/seven successful checks. The recorded native binary is
required to reproduce runtime assertions, not to verify archived observations.

Exactly-once injection across the native and extension late paths is not proved
for inherited documents; the bounded constant/fetch effects above do not establish
deduplication for arbitrary scriptlets. The extension late-path suppression remains
HTTP(S)-only, so broader scriptlets need an explicit duplicate-injection probe.

Opaque srcdoc/data early delivery, blob/fenced/nested contexts, broader CSP and
lifecycle/containment, real-page sanity, full worker acceptance, shipping Electron
early/ancestor fixes and independent update-loader identity remain open. Plan
items3–6 remain unstarted. No Task0 outcome/baseline promotion or physical input
claim. The separate proposed Electron build is awaiting owner review/approval.
