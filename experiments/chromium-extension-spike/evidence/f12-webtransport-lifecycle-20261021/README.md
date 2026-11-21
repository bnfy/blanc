# WebTransport workers and pending lifecycle — October 21, 2026

The report and independent validator record twelve bounded regular/private
schedules: two worker matrices and ten pending-lifecycle cases. This is native
Blanc Blocker evidence, not paired Electron/uBO parity or final F12 acceptance.

## Method

Uses the existing native binary and aioquic HTTP/3 fixture from the preceding
WebTransport checkpoint. Each schedule establishes a real allowed CONNECT and
datagram echo first. Dedicated/shared/service workers then exercise allowed and
blocked destinations. For lifecycle cases, the harness identifies the exact
browser by disposable user-data-dir and blocker utility by parent PID and
`blanc.mojom.Blocker` subtype, suspends only that utility, and waits for the exact
native pending request ID before closing the owner, exercising the unchanged
35-second production timer, or terminating the utility. No injected decision,
shortened native timeout, permanent-profile change or build is used.

The initial run incorrectly required WebSocket-style immediate abandonment after
document destruction. It timed out waiting for that event; its evidence is kept
in initial-assumption-failure.json and is not counted as a pass. The final test
observes actual post-resume behavior instead. Chromium's WebTransport completion
is bound through the connector's weak pointer; the handshake proxy does not
necessarily disconnect when the page/worker target disappears. Source hashes
for both paths are retained alongside binary and engine identity.

## Acceptance boundaries

- Worker matrix: dedicated, shared and service workers each have one real
  HTTP/3/datagram success and one explicit filter refusal per regular/private
  context. Blocked requests have no server arrival during the bounded500ms
  observation; native engine and owner/context records are retained.
- Pending document closure: target destruction is confirmed; after utility
  resume, the stale document decision is refused. No server request follows.
- Pending dedicated/shared worker closure: target destruction is confirmed.
  The engine can return allow after resume, but the destroyed connector prevents
  connection creation. This is not immediate native abandonment or an engine
  refusal. No handshake follows during the one-second resumed observation.
- Timeout: the real35-second timeout refuses once, with no server handshake;
  resuming the utility does not revive it. A fresh connection succeeds.
- Utility loss: the pending request and a subsequent fresh attempt fail closed;
  this does not prove automatic utility restart.

The observations are bounded, not indefinite stress. Pending service-worker
termination, profile/browser shutdown, concurrent requests, malformed origins,
extension/enterprise composition, missing-engine WebTransport runtime and full
stream coverage remain open. Next: remaining transport teardown boundaries or
speculation initial-request/consumption qualification. Decision2 remains open.

No native code change or compile was needed; final build guard is zero. Prior
upstream footprint56files/134hunks is unchanged, not newly recounted. Scoped
ESLint, JavaScript syntax, archived-record validator and diff checks accompany
the evidence. Disposable profiles and certificate private keys are removed.
Google baseline remains separate; native physical input pending, latency
deferred, Electron diagnostic build pending approval and unstarted.
