# Native WebSocket enforcement — October 21, 2026

**Bounded native handshake controls pass; F12 and Decision 2 remain in progress.**
Continues PR #1028's source disposition. No latency benchmark, Electron diagnostic
build, permanent-profile changes or Google-baseline publication.

## Implementation

A narrow browser-registered factory wrapper in the shared WebSocket connector
covers documents and dedicated/shared/service workers, including null-frame
workers. The wrapper receives the final connection URL after extension processing;
the original factory retains protocols, isolation, headers and network options.
No central ContentBrowserClient virtual interface change remains. Registration
uses a process-lifetime function pointer without a bound browser/profile owner.

The opt-in Blanc Blocker gate authenticates the existing engine bundle and waits
for its actual result. Only result0 proceeds. Filter rejection, unsupported
resource redirect, unavailable engine, timeout, dead profile or invalid creator
document refuse the handshake. Pending client disconnect destroys the gate;
weak replies prevent use after destruction. Per-handshake timeout is35seconds;
existing engine startup/queue/inflight bounds remain. These lifecycle protections
are implemented but their pending-destruction/timeout runtime matrix is still open.

WebSocket supplies its trusted initiator Origin as engine sourceUrl, recorded
explicitly as `websocket-initiator-origin`; it does not fabricate an HTTP referrer
or an active tab for frame-less workers. This is not paired Electron parity.
Regular-profile uBO probe mode keeps its existing extension path; these results
qualify Blanc Blocker only. Private fallback can use Blanc Blocker. No assets
switch leaves the original factory intact (source-reviewed, no dedicated flag-off
runtime schedule in this checkpoint).

## Native evidence

`native-run-01/report.json` passes four schedules:

- Regular and private: document, dedicated worker, shared worker and service
  worker each negotiate an allowed real WSS handshake, receive the fixed server
  message and verify the selected subprotocol. Each also attempts the blocked
  fixture authority and receives a failure.
- Eight allowed server handshakes total; eight explicit native filter refusals
  with no corresponding server handshake. All16 decisions record the expected
  initiator and actual private-context flag. Four frame-less worker decisions
  per profile prove the shared/service routes were reached.
- Missing authenticated engine assets in regular and private contexts: two
  additional explicit engine-error refusals, zero server handshakes.

Total:18 native decisions, eight successful handshakes. HTTP page loads and these
handshakes remain different evidence. Exact source/binary/fixture hashes are in
`provenance.json`; the actual engine bundle hash is in the native report.

`sender-regression/` reruns the prior regular/private keepalive/beacon closure
fixtures after the optional upgrade-handler addition to the shared TLS fixture
transport. Four schedules pass the unchanged checker: eight post-close307
redirect decisions, allowed POST body retained, blocked terminal absent.
This retains the earlier bounded scope rather than extending its claims.

## Build and validation record

The initial unapplied four-file virtual-hook draft is retained as historical
`unapplied-upstream.patch` and `projection.json`. The owner approved58files/133hunks,
then authorized future budget increases without repeated requests, recording
counts and consolidating later. The final narrower implementation measures
**56files/133hunks** (`final-budget.json`), versus55/129 before this task.

First compile failed on Chromium's inline-virtual-method rule. A subsequent
narrowed attempt was stopped after15completed actions when timestamp-only
invalidation still expanded the graph. Both central headers were verified
byte-identical to pre-task copies and upstream before restoring their upstream
last-change timestamps (`header-rollback.json`); modified sources were not
backdated. The final guard reduced to six planned actions. Narrow integration
built successfully in46.11seconds/10steps; provider-isolation refinement built
incrementally afterward. Final guard:zero actions. Failed/interrupted/full build
logs are retained locally under `/private/tmp/blanc-websocket-draft/`; build
summaries are archived. No cache deletion, GN/toolchain changes or cold build.

Two fixture self-tests, eleven patch-counter tests, scoped ESLint, script syntax,
evidence hashes and diff checks pass. The first fixture attempt hit sandbox
loopback EPERM; rerun with loopback permission passed. Test-runner durations are
not latency acceptance. Disposable profiles and TLS fixtures were removed by
both harnesses; retained preview and permanent tabs were untouched.

## Remaining qualification / next priority

Next: pending handshake client/document/worker destruction, decision timeout and
utility loss, with a successful control and independent server records. Follow
with provider-specific socket parity, extension/enterprise composition runtime,
WebTransport's separate HTTP/3 adapter/fixture, ordinary prefetch initial-request
and consumption proof, and conditional pre-prefetch/prerender disposition.
This checkpoint does not establish all socket redirects, authentication, opaque
origin policy, arbitrary concurrency, UI/physical input, production adoption or
release approval. Latency deferred; Electron diagnostic build pending approval.
