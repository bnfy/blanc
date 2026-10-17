# Redirect/worker and latency protocols

These extend the measured synthetic subset, not the real-page recorder or the
full F12 acceptance claim. Public recording privacy gates remain unchanged.
Fixtures retain the terms in `../NOTICE`; first-party harness code retains its
existing terms. All browsing uses disposable profiles and offline transport.

## Redirect and worker paths

`paths-run.mjs CONFIG_JSON NEW_EVIDENCE` creates complete authored responses
for GET redirect chains, including blocked URLs and unreachable successors.
It runs the real Electron provider and native Chromium hook twice per profile.
`paths-compare.mjs EVIDENCE` can independently recheck the saved observations.

The graph includes a browser-started main-frame redirect, allowed fetch chain,
allow-to-block fetch/script chains, blocked predecessor, two-hop fetch chain,
allowed script redirect, and worker script/import/fetch/redirect probes.
Dedicated and shared workers retain a live owner. Service-worker imports occur
before installation and independent fetches are triggered through a message
port; controlled-client fetch events and cache-only responses are separate gaps.

Redirect hop indices are derived from Electron's actual repeated request ID and
compared with the native proxy's hop counter. Referrer, method, resource type,
initiator presence/value, profile and available frame context must match. The
request graph is not pruned to an intersection. Allowed arrivals must match the
authored response digest; a blocked hop cannot arrive, and an unreachable hop
must not be silently counted as issued. DOM/worker outcomes must match both
stable runs. Engine errors and transport/observer faults invalidate a run.

For frameless shared/service-worker subrequests, both raw observations are
preserved. Matching decisions with unresolved top-frame/role are a **gap**, not
an admitted parity pass. A worker startup failure that prevents issuing its
subrequests also remains a gap. No referrer, active tab or test intent fills
missing context. The optional favicon is declared as a control before capture
and excluded from case comparison. Initial `about:blank` frame/tab sentinels are
retained verbatim while validating real network fields with the original scrubber.

Still outside these probes: non-GET/method-changing redirects, changed headers
or replacement URLs, opaque/subframes, worker owner teardown, shared ownership,
SW updates/import variants/fetch events/cache-only outcomes, keepalive, speculative
paths, WebSocket/WebTransport, cosmetics and scriptlets.

## Latency

`latency-run.mjs CONFIG_JSON FULL_ELECTRON_ORACLE NEW_EVIDENCE [both|electron|chromium] [--require-idle]`
runs the complete candidate corpus, one discarded warm-up and five measured
repetitions per regular/private profile in the same browser and engine process.
The initial attempted single-page 5,123-candidate burst failed at the offline
transport; actual Electron request failures were `ERR_PROXY_CONNECTION_FAILED`.
Those attempts are retained as invalid, not timing results.

The defined measured layout partitions the original candidate order into 26
pages of 200 candidates (last partial). Every page submits all its candidates
immediately, leaving concurrency to the browser; no per-request queue, pacing
or artificial serialized latency benchmark. Every repetition still covers the
whole corpus. Both browsers use identical authored page bytes in identical
order at the original origin. Page transitions happen only after decisions,
responses, DOM loads and script-child completions are verified. Per-page log
boundaries disambiguate repeated root URLs; roots, controls and descendants do
not pad the distinct-candidate floor. The page-layout hash is recorded.

Native timing uses `base::TimeTicks` from factory entry (or redirect receipt)
through applying block/allow, including queueing and the Mojo round trip.
Logging work follows the timestamp. The utility does not expose engine-only
timing. Electron's `process.hrtime.bigint` observer spans entry into the real JS
provider wrapper through its returned decision; earlier native dispatch is not
exposed and is explicitly excluded. It is a reference, not claimed identical
native-entry instrumentation or a bound on Electron.

Report nearest-rank p50/p95/p99 for each repetition and their median across the
five measured repetitions. First 200 fixture decisions in log order from the
warm-up are separately reported as cold; the native root includes startup wait.
No cold sample is held to the warm bound. A page with mismatched context,
referrer, decision, response, missing children or missing timing invalidates
the repetition; no favorable subset survives it.

Before each repetition, record up to five CPU-idle samples. A recorded baseline
of at least 90% aggregate idle is the explicit operational quiet check. It is
not a change to the approved p99 <5 ms Mojo bound. Background applications are
not terminated or hidden. If that quiet check is not met, timings can be reported
with their measured conditions, but the otherwise-idle protocol gate remains
open even when the numbers fall below 5 ms. A formal timing pass requires valid
repetitions, the idle condition and the bound; it is still not full Spike A
acceptance. Native rebuilds, if needed, use the unchanged guarded warm output.

### Worker context and idle-stop follow-up

Native frame identity is now snapshotted at request entry rather than resolved
after the async decision. Raw `frame_state`, `factory_kind`,
`factory_isolation_top_origin` and `request_isolation_top_origin` fields are
recorded separately from the contract. Neither isolation metadata nor an
apparently owning visible tab fills an unresolved top-frame or role. The gap
report preserves each runtime's unresolved values. Shared/service-worker
admission requires independently observed request-to-client lifecycle data,
including cases with no single client; current hooks do not supply that proof.

With `--require-idle`, the harness also checks idle before opening any browser
and stops before a repetition if none of its five samples reaches 90%. The
stopped report and cleanup result are retained. This does not relax the bound,
change the corpus, or select favorable measurements from an invalid repetition.
An approved temporary process pause must be recorded and restored; open user
applications must not be terminated to make a benchmark pass.
