# Pending native WebSocket lifecycle — October 21, 2026

**Ten bounded regular/private schedules pass.** This extends #1028's handshake
acceptance; F12, Decision 2 and public-release approval remain open.

## Method and scope

Each schedule starts a fresh disposable Chromium profile and establishes a real
allowed WSS handshake, including the fixture message. The harness identifies the
exact browser by its disposable user-data-dir and the blocker utility by both
its parent PID and `blanc.mojom.Blocker` subtype. It suspends only that child,
starts a new socket, and waits for an opt-in **native pending** record before
teardown, timeout or utility termination. No injected engine result, shortened
timeout, permanent profile or retained preview is used.

Added request IDs and pending/abandoned/timeout observations to the existing
opt-in local logger. No socket-policy change was required. Logging remains off
without the explicit disposable-instance log flag. The normal35-second timer is
unchanged; exercising its functional bound is not a decision-latency benchmark.

## Results

For **each** of regular and private contexts:

- Document closure, dedicated-worker termination and shared-worker self-close:
  actual CDP target destruction precedes native abandonment. After resuming the
  real utility, no decision or server handshake appears for the abandoned
  request during the bounded observation. A fresh handshake succeeds.
- Timeout: with the utility still suspended, the native timeout event fires and
  the client receives failure. Exactly one refused decision is recorded. Resume
  produces no late handshake; a fresh handshake succeeds with the same utility.
- Utility loss: killing the verified suspended utility refuses the pending
  request. A subsequent new socket also fails closed without another server
  handshake. This verifies continued refusal, **not automatic utility restart**.

Ten initial successful controls, ten pending requests and ten subsequent controls
are retained separately in `native-run-01/`. Six pending requests are abandoned,
two time out and two fail on utility loss. Positive follow-ups succeed in eight
schedules; both utility-loss follow-ups remain refused. Native request IDs link
the exact pending/terminal records. Server arrivals are checked before the fresh
control so a subsequent success cannot mask an unwanted pending handshake.

The worker schedules cover dedicated and shared workers, not pending service-
worker destruction. The one-second resumed-utility observation is bounded: it
is not an arbitrary-duration stress or teardown guarantee. Full profile/browser
shutdown, simultaneous requests, utility restart UX, extension/enterprise
composition, uBO/Electron socket parity and broader origin/authentication cases
remain unqualified. Previous service-worker **handshake** evidence remains valid
within its own scope, not upgraded to lifecycle acceptance here.

## Validation and artifacts

`native-run-01/report.json` reports ten passes and disposable cleanup. Individual
runs retain native records, ordered harness events, actual destroyed target
identity, owned process IDs and independent server arrivals. `provenance.json`
pins executable/framework, native implementation, harness/helpers and engine.
`validation.json` independently checks the archived outcomes. `SHA256SUMS`
verifies all published evidence members.

One guarded incremental build:31.42seconds/six steps. Final guard:zero actions.
Fresh upstream inventory remains56files/133hunks. No GN, toolchain or cache reset.
Scoped ESLint, harness syntax and diff checks pass. Full build output remains
local at `/private/tmp/blanc-websocket-lifecycle-build.log`; summary is archived.

Next Decision 2 priority: WebTransport's separate adapter/HTTP3 positive and
negative controls, followed by speculation initial-request/consumption evidence.
Keep the remaining socket lifecycle/provider cases explicit. Google upgrade
baseline stays separate and uncommitted. Native physical input pending, latency
deferred, Electron diagnostic build pending approval and unstarted.
