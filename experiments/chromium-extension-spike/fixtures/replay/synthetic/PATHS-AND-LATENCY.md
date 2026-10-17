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
preserved. Matching decisions with unresolved top-frame/role are a **gap** unless
both runtimes independently satisfy the approved typed worker-context branch
below; matching decisions alone never admit parity. A worker startup failure that prevents issuing its
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
including cases with no single client. The sidecar observation below supplies
that proof only for the explicitly measured subset.

With `--require-idle`, the harness also checks idle before opening any browser
and stops before a repetition if none of its five samples reaches 90%. The
stopped report and cleanup result are retained. This does not relax the bound,
change the corpus, or select favorable measurements from an invalid repetition.
An approved temporary process pause must be recorded and restored; open user
applications must not be terminated to make a benchmark pass.


### Independently observed worker contexts (owner-approved October 17)

`paths-run.mjs CONFIG_JSON NEW_EVIDENCE controlled` also exercises a service
worker whose scope includes the observed page. The default keeps that page
outside the worker scope. Each variant runs twice per browser and profile.
Imports precede installation; message-triggered fetches follow activation (and,
in the controlled variant, an observed `controllerchange`). This is not a
service-worker fetch-event or cache interception test.

`worker-observer.mjs` attaches to worker targets on the disposable browser's
loopback CDP endpoint. The authored shared-worker probe installs a connection
observer before its own connect handler and waits for the independently attached
Runtime binding before issuing requests. This changes scheduling and is **never
used by the latency runner**. `workerObservation` defaults to false.

Correction to the a97cec27 checkpoint: requesting a first-script debugger
breakpoint did not prove it fired. Neither exploratory attempt in the next
checkpoint observed a pause; shared-client correlation correctly remained gaps.
The debugger barrier has been removed. The current proof requires the actual
agent-installed event and browser-created MessagePort observations instead.
Only declared fixture request metadata is retained; arbitrary headers, cookies,
certificates and response bodies are not logged by this sidecar.

`worker-context.mjs` requires a unique target-scoped request event, one observed
worker realm and an exact browserContextId match to the page target obtained
through that page's CDP handle. Native records join by the actual
`ResourceRequest.devtools_request_id`. A redirect blocked before reaching the
renderer joins only through the same ID and contiguous, observed allowed native
predecessors. Electron IDs differ, so its finite-run join requires a unique URL,
method/referrer match and a wall-time difference no greater than two seconds.
Duplicate URLs invalidate the run; none is selected arbitrarily. CDP's resource
type remains diagnostic (`importScripts` can appear as `Other`); actual hook
resource types still compare directly.

ServiceWorker domain events independently associate version, script and target
with controlled-client IDs. The nearest snapshots before and after the request
must agree, and a forced final snapshot is required. Only the directly observed
page target can currently be resolved as a client; its default Runtime context
must supply an unambiguous origin. An observed empty set is valid. A nonempty set
is compared as client roles/origins rather than process-specific IDs. A change
across the bracket, unknown client, multiple worker realms, missing event or
observer fault leaves a gap. These are **observed lifecycle brackets**, not an
atomic proof against every possible rapid client transition. Multi-client and
teardown races are not covered.

The sidecar establishes comparison evidence, not a change to the blocker's
engine inputs: both engines still receive their actual hook inputs. No worker
client origin replaces the referrer, initiator or raw unresolved top frame.

### Shared-client ownership and initial service script

For shared workers, a random challenge passes from the actual SharedWorker
constructor's returned port to a port from the worker's actual `connect` event.
The two Runtime bindings identify their execution realms independently; a URL,
worker name, expected fixture owner or visible tab is never ownership evidence.
The comparator requires the observed page's default realm, a unique challenge
and peer, observation before the request, all observed connections accounted
for, and no close/pagehide/realm destruction through the request and completed
handshake. An unmatched construction, connection, duplicate, late observer,
unknown target or opaque origin stays a gap. Process-local IDs/nonces are proof
only; compared client members contain role, origin and port count.

This is a **single live observed document** measurement, not a complete registry
of arbitrary clients. It does not establish multi-document ownership, transferred
ports, garbage-collected ports, owner teardown or unobserved realms. The authored
observer sends only its control challenge; it does not replace request decisions
or provide expected client sets. Both browsers execute identical authored bytes.

For the initial service script, Chromium assigns the new worker's DevTools token
to the ResourceRequest ID before the loader starts. The native record therefore
joins directly to that target even without a Network event. Electron joins its
unique target-scoped Network event with that same target token and its own actual
hook record (URL, method, type and bounded time). CDP's initial RequestSent event
serializes request.headers and omits the separate ResourceRequest.referrer;
that omitted CDP header is not used for this join. The two hooks' actual
referrers still compare exactly. A new starting version, empty pre-install
controlled-client set, matching profile, initial hop and later unique realm are
required. The explicit phase is `initial-script-fetch`; controlled clients are
`not-applicable-before-installation`, not an invented document top frame.
Failed/blocked scripts without a realm, installed versions and updates stay gaps.

[Measured checkpoint](../../../evidence/f12-worker-ownership-20261017/README.md):
all ten authored path cases match in regular/private profiles, twice per runtime,
for default, controlled-client and no-referrer variants (24 fresh runs).
Six shared subrequests and the initial service script now have complete evidence
within those bounds; existing six service subrequests and redirects regress cleanly.
The matrix's broad worker rows remain gaps. Latency remains deferred.
## Shared-worker multiple clients and owner teardown — October 17, 2026

[Evidence](../../../evidence/f12-shared-lifecycle-20261017/README.md) extends the
strict worker-context contract to two separately observed same-origin document
owners. Each document completes an actual MessagePort challenge with the shared
worker and has an independently observed target/default realm. The multi-client
phase reports two documents and two ports.

One owner then navigates to `about:blank`. Destruction of that exact document
realm is observed before the next worker requests, and the teardown phase reports
one surviving document and port plus one ended document. A pagehide signal,
port-close message, visible-tab origin, or storage-partition origin never removes
an owner. Regular/private comparisons pass twice per runtime; the existing ten
authored request-path cases also remain green.

The result is deliberately bounded. More than two owners, embedded/top-site
combinations, transferred or explicitly closed ports, garbage collection,
target/window closure followed by later requests, in-flight teardown, opaque or
subframe clients, rapid reconnect, and worker termination/recreation remain gaps.
The broader service-worker update/fetch/cache matrix also remains open.

No native source changed and the guarded build plan reports zero actions. Formal
latency testing remains owner-deferred; the probe wall times are not latency data.
