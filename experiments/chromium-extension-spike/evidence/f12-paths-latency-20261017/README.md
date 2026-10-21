# Redirects, workers and latency — October 17, 2026

**Bounded synthetic path comparisons pass; full Spike A acceptance remains open.**
The full-corpus latency run completed with valid observations and warm native
p99 values below 5 ms. **The quiet-machine condition failed, so this is not a
formal latency pass.** No production or 157-baseline promotion follows.

## Paths

`paths-03` runs two fresh instances of each browser in each of regular/private
profiles (eight runs). Actual decisions, referrer, initiator presence/value,
resource type, profile, redirect hop, response hashes and DOM/worker outcomes
must agree. No intersection or inferred worker context is admitted.

| Case | Regular | Private |
| --- | --- | --- |
| Browser-started main-frame GET redirect | passed | passed |
| Fetch allow→allow, allow→block, blocked predecessor, two-hop chain | passed | passed |
| Script allow→allow and allow→block | passed | passed |
| Dedicated worker creation/importScripts/fetch/redirect with live owner | passed | passed |
| Shared worker creation/importScripts/fetch/redirect | gap: six unresolved frame contexts | gap: six unresolved frame contexts |
| Service-worker registration/evaluation imports/activation/independent fetch/redirect | gap: seven unresolved frame contexts | gap: seven unresolved frame contexts |

Shared/service behavior matches, including blocked imports and fetches. Their
missing top-frame/role prevents admitting them as full context parity. The
service page is outside the worker scope and triggers fetches by message port;
it does not test controlled-client fetch events, caches or update checks.
`paths-03-comparison.json` is authoritative; its legacy scope string mentions
only dedicated/shared workers, while its service case and fixture manifest
record the additional service-worker probe explicitly.

## Latency measurement

Apple M4, 10 logical CPUs, 24 GiB, macOS 27.2 (26B5112a). Native Chromium
157.0.8103.6; Electron 44.8.0 / installed Blanc 1.36.0 ASAR. Sources, bundle,
page-layout and framework hashes are recorded. No benchmark process shares the
permanent profile. Other applications remained running.

The entire 5,123-candidate corpus (2,503 blocked / 2,620 allowed) is partitioned
in its original order into 26 authored page loads of up to 200 candidates.
Each page issues all candidates immediately; the browser schedules concurrency.
Both browsers receive the same bytes. Repeated roots, four controls, descendants
and profile/repetition duplicates never increase the unique candidate floor.
Every repetition contains 6,406 actual fixture decisions.

One discarded full warm-up followed by five full repetitions per profile in
the same browser/engine process: all **24** full repetitions validate decisions,
contexts, response bytes and DOM/child execution. Percentiles use nearest rank;
the table reports the median of the five measured repetition percentiles.

| Browser/profile | Median p50 ms | Median p95 ms | Median p99 ms | Measured repetition p99 ms |
| --- | ---: | ---: | ---: | --- |
| Native regular | 0.193 | 0.704 | **1.484** | 2.610, 1.284, 1.033, 1.484, 2.269 |
| Native private | 0.206 | 0.922 | **2.108** | 2.892, 1.408, 2.108, 1.483, 2.232 |
| Electron regular reference | 0.009875 | 0.036416 | 0.063500 | 0.068250, 0.063500, 0.061459, 0.060959, 0.063666 |
| Electron private reference | 0.009875 | 0.032666 | 0.060292 | 0.061500, 0.060292, 0.059125, 0.058958, 0.068375 |

Native `base::TimeTicks` spans factory/redirect entry through decision application,
including queueing and Mojo. Logging follows the timestamp. Electron's JS
provider-wrapper `hrtime.bigint` excludes earlier native dispatch; these are
**different clock boundaries**, not a direct browser speed comparison.

Every warm native repetition is below the approved 5 ms Mojo bound. However,
none met the recorded >=90% aggregate CPU-idle condition before starting.
Native baseline samples ranged 30.54–83.64% idle (regular) and 39.69–81.26%
(private). The otherwise-idle protocol gate stays open. The operational idle
threshold does not change the approved latency bound.

Cold first 200 fixture decisions in log order include the initial native root's
engine-startup wait. Regular: p99 2.838 ms, maximum 1,410.516 ms. Private: p99
4.832 ms, maximum 1,457.367 ms. Full warm-up p99: 3.849/7.767 ms respectively.
These discarded warm-up/cold observations are reported separately, never
silently included in or judged by the warm bound.

## Attempts, builds and checks

- `paths-01`: invalid observer admission (initial `about:blank` frame/tab
  sentinel) and undeclared favicon. Its old collector-only `passed` flag does
  not mean parity. Exact sentinel validation and an authored favicon fixed it.
- `paths-02`: valid redirect/dedicated/shared checkpoint before service-worker
  expansion and the timing rebuild; shared identity stays a gap.
- `paths-03`: final expanded paired run described above.
- `latency-01` and `latency-02`: invalid single-page 5,123-candidate bursts.
  The diagnostic repeat records 630 `ERR_PROXY_CONNECTION_FAILED` errors,
  separately from 2,503 expected `ERR_BLOCKED_BY_CLIENT` cancellations. No
  latency acceptance is derived from these. The final layout keeps every
  candidate but uses the defined 26-page workload, identically for both browsers.
- `latency-03`: valid full run; idle qualification failed as recorded above.
- `failures`: missing assets, tampered assets and owned utility termination
  still fail closed after the timer change; denied requests never hit the server.

One guarded incremental timing rebuild: one inspected action, six executed
steps, **29.98 s Siso / 35.065 s guard-wrapper**. Final guarded plan: **zero**.
No GN generation, argument/toolchain changes, environment re-record, clean,
large override or new cold output. Patch inventory remains **25 files / 62
hunks**, within 40/120. Task 0 cold figures and extension-upgrade gate unchanged.
79 focused replay tests pass; lint: 30 files, zero errors/warnings. Runtime
brackets in the invocation log include harness overhead and are not owner/agent
attention measurements. Disposable profiles/certificate keys were removed;
no owned probe browser remains. The existing 156 and permanent profiles were
not used.

## Remaining gaps and evidence format

Non-GET/method-changing redirects, modified headers/replacement URLs, subframes
and opaque origins; shared/service-worker identity, owner teardown/multiple
owners, SW updates/fetch events/cache-only behavior; keepalive/beacons,
speculative paths, WebSocket/WebTransport, broader first-party/domain-scoped
rules and additional resource types; CSS/procedural cosmetics/main-world
scriptlets; otherwise-idle latency; private real-page sanity sample;
startup-delay/timeout injection and recovery UI remain unproved.

`summary.json` and the readable reports accompany eight deterministic lossless
archives. `inventory.json` records each archive and each original file's SHA-256
and byte count, including failed attempts. `build.tar.gz` holds all invocations,
logs, final budget, environment fingerprints and the failed single-page harness.
No certificate private keys or browsing profiles are committed. List-derived
fixture data retain the adjacent NOTICE terms. The base oracle/response bundle
is the previously committed expanded-corpus evidence; its digest is in the run.

Harness/protocol: [PATHS-AND-LATENCY.md](../../fixtures/replay/synthetic/PATHS-AND-LATENCY.md).
