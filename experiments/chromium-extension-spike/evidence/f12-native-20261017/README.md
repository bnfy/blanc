# Native engine and request hook — October 17, 2026

**Synthetic fixture parity passed for the measured subset. Full Spike A
acceptance remains open.** This is an opt-in Chromium 157 experiment, not a
shipping Electron change, baseline promotion, or real-web block-rate claim.

## Observed comparison

The same pinned Ghostery 2.18.2 modules and EasyList/EasyPrivacy snapshots now
run in a sandboxed Chromium Mojo utility, with the browser's network-service
URLLoaderFactory chain holding HTTP(S) requests for its answer. No oracle or
candidate answers are embedded in the engine. Native observations independently
record request initiator (including absence), referrer, top-frame origin, type
and regular/private profile. Rule matching uses the referrer as sourceUrl,
matching Electron's actual adapter; the initiator is never substituted.

| Probe | Distinct candidate URLs | Electron blocked / allowed | Chromium differences | Fresh runs |
| --- | ---: | ---: | ---: | --- |
| Full admitted corpus | 5,123 | 2,503 / 2,620 | 0 in both directions | 2 regular + 2 private |
| No-referrer subset | 24 | 9 / 15 | 0 in both directions | 2 regular + 2 private |

All eight runs have zero native context mismatches and pass cancellation,
complete response hashes, DOM/script execution and authored child-load checks.
The full runs contain 6,381 native request observations each. Four first-party
allow controls, root pages, script children and repeated runs/profiles do not
inflate the 5,123-URL denominator. The no-referrer probe includes the real
referrer-sensitive exception difference established by the Electron oracle.

The Electron oracle and authored response bytes are frozen in
[the prior checkpoint](../f12-expanded-20261017/README.md); full oracle is
`electron-09`, no-referrer oracle `electron-10`. Complete responses exist for
blocked candidates too, so a missed script would execute its declared behavior
and expose descendants. This is not the missing-response lower-bound comparison
of the historical public recorder.

## Failure behavior and bounded scope

Missing engine assets, an altered bundle digest, and termination of the owned
engine utility were exercised in disposable instances: requests were refused
with no arrival at the loopback fixture. The latter ran after a successful
initial navigation. Startup-delay and timeout injection were **not run**.
There is no automatic utility restart or live engine reload/recovery UX.

Broad matrix rows stay `gap`: redirects (the hop gate is implemented but not
runtime-verified), other navigation and subframe cases, opaque origins, 782
excluded domain-scoped candidates, broader first-party decisions, fonts/media/
object/other, workers/SW/cache, keepalive/beacons after teardown, and speculative
loads. WebSocket/WebTransport interception is absent. Ghostery resource redirects
fail closed with an unsupported status and cannot count as correct blocking.
CSP handling, cosmetic CSS, procedural cosmetics, main-world scriptlets, the
formal latency protocol and the private real-page sample remain gaps.
See `summary.json` and [coverage.json](../../fixtures/replay/synthetic/coverage.json).

Exploratory native hook-to-decision p99 was 0.487–0.716 ms across the four full
runs; maxima were 1,451–1,502 ms including cold engine initialization. These are
raw observations, **not a pass of the approved 5 ms Mojo latency gate**: the
warm-up/five-repetition protocol and paired Electron timings have not run.

## Incremental build and repair record

All builds reused the existing Chromium 157 `out/BlancPrototype`, recorded
environment and unchanged GN args. No cold output, clean, toolchain/depot_tools/
Xcode update, or `--allow-large-build`. One unchanged-args GN generation followed
the four integration edits. Final guarded check: **zero pending actions**.

| Attempt | Inspected actions | Siso wall / executed steps | Outcome |
| --- | ---: | --- | --- |
| 01 | 12 | 4.54 s / 7 | UTF-8 span/include compile errors |
| 02 | 6 | 5.64 s / 3 | Missing complete Mojo response type includes |
| 03 | 4 | 44.33 s / 9 | Built; first runtime found internal-WebUI interception bug |
| 04 | 2 | 44.11 s / 7 | Built; runtime exposed response-pipe lifetime race |
| 05 | 1 | 31.64 s / 6 | Built; all final comparisons and failure probes passed |

Guard/wrapper wall time across all five build invocations is 153.075 seconds;
Siso wall time is 130.26 seconds. Neither includes investigation, test runtime
or GN. Raw invocation start/end records are in `build/invocations.jsonl`.
These are tranche-2 routine costs; Task 0's cold-build column is unchanged.
Owner and agent active-attention time was not measured.

Patch budget: **21 files / 55 hunks → 25 files / 62 hunks**, below 40 / 120.
The four extra existing files are the browser client, browser BUILD.gn, utility
service registry and utility BUILD.gn. New Blanc-owned service files are excluded
under the approved counting rule. All 151 gclient dependency checkouts pass the
pin/clean guard. `build/budget-final.json.gz` contains the exact inventory.

## Every attempt retained

- `probe-01`: internal WebUI requests were incorrectly proxied, producing an
  Island host error/crash. The hook now attaches only to network-service
  factories and passes non-HTTP(S) requests through. A no-blocker inspection
  control is saved under `build/`.
- `probe-02`: engine initialized, but the page timed out before DOMContentLoaded.
- `probe-03`: saved partial transport evidence; stopped only the owned disposable
  browser after the hang. Six allowed requests failed with ERR_FAILED. The
  proxy had treated independent Mojo pipe disconnect/completion order as ordered.
  It now waits for the downstream consumer to close completed endpoints.
- `probe-04`: final no-referrer comparison passed, 18.38 s including harness.
- `full-01`: final full comparison passed, 146.34 s including harness.
- `failures-01`: harness stopped on a tampered-assets/profile directory collision
  after the missing-assets case passed; retained as a failed attempt.
- `failures-02`: distinct profile paths; all three real failure cases passed.

55 replay tests, 15 paired-validator tests, 10 build-guard tests and 11 patch-counter
tests pass. Targeted lint: 22 files, zero errors/warnings. The first sandboxed
replay-test invocation failed on loopback-listen permissions; its log is retained
beside the successful authorized rerun. Tests do not replace native observations.

## Reproduction, provenance and cleanup

See [native/blocker/README.md](../../native/blocker/README.md). `inventory.json`
records original and stored SHA-256/byte lengths. `.gz` files are lossless gzip,
with deterministic headers; decompress to the original filename to replay.
`build/source-verification.json` binds prepared native files to repository
sources, the built framework, GN args and engine manifest. The final framework
SHA-256 is `8f5934bc329458da54fb26f80cab72698fafb15180d51958242724601d2fcd15`.
The authenticated engine SHA-256 is
`e969dfa8dced64d6edcf32047445a7044a2b0137ab174148a2cea8238c465113`.
Report `bundleSha256` fields identify the **fixture response bundle**, not this
engine; `engineBundleSha256` and engine-ready records identify the engine.

Offline transport has no upstream fallback. Ephemeral fixture leaf-key pins
apply only to these disposable browser instances; no system trust changes.
Native logs are opt-in and only fixture observations are retained. Profiles,
raw logs and private certificate keys are removed. The 156 source/output,
prototype, permanent profile and original tabs were not used or modified.
Engine assets are retained for reproducibility. The engine archive includes
third-party code and list-derived data: see `engine/NOTICE`, its manifest and
licences. Do not describe the bundle or list-derived fixtures as MIT-only.
