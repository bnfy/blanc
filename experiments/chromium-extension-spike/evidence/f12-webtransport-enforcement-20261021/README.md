# Native WebTransport enforcement — October 21, 2026

Eight final regular/private controls pass on the native Chromium157 binary: six
real HTTP/3 CONNECT handshakes with datagram echoes, and two native filter
refusals with no server arrivals. F12 and Decision 2 remain in progress.

The opt-in adapter wraps Chrome's existing WillCreateWebTransport completion.
Existing extension rejection is preserved; only a successful upstream callback
enters the Blanc gate before NetworkContext::CreateWebTransport. It retains weak
profile/document ownership, client-disconnect cancellation and a35-second timer.
Only engine result0 proceeds; errors and unsupported redirects fail closed.
The source contract is initiator origin, classified as `other`, not WebSocket or
an invented HTTP referrer. Regular uBO probe behavior remains separate; this is
Blanc Blocker evidence, not uBO/Electron parity.

## Real HTTP/3 method

The fixture uses aioquic1.2.0 in an isolated temporary Python environment (exact
versions in requirements.txt), binds UDP only to127.0.0.1, negotiates ALPN `h3`,
and accepts only authored extended CONNECT requests. A fresh EC certificate is
valid for ten days and trusted only through WebTransport's per-connection
serverCertificateHashes. No system trust changes or global certificate bypass.
The page is served from loopback HTTP, a secure context; both fixture destination
hostnames resolve explicitly to loopback and all other DNS names are refused.
No real request is sent to the hostname selected from the pinned filter list.

For each regular/private context, the baseline without the opt-in gate proves
both endpoints accept CONNECT and echo `blanc-http3-proof`. With the gate enabled,
the allowed endpoint still succeeds and `000491b06a.com` is refused with native
engine result1. Both protected runs authenticate the pinned engine hash. The
negative observation is bounded to500ms after client rejection; no server ALPN,
CONNECT or datagram event occurs in that interval. This is not indefinite stress.
Private context identity is verified through CDP BrowserContexts. Profiles and
private certificate keys are removed after each run; retained profiles untouched.

`native-run-01` retains the first four protected-only passes. `native-run-02` is
the final eight-control baseline/enforcement matrix. Do not add the two runs into
an inflated unique-case count. `validate.py` checks the final archived records
independently. `websocket-regression` retains all four previous WebSocket
schedules (document/dedicated/shared/service-worker allow/block plus missing
engine controls) passing against this new binary.

## Build, provenance and remaining scope

One incremental build40.71s/eight steps; preflight3actions, final guard0. No GN,
toolchain or cache change. Fresh inventory56files/134hunks (+one hunk in the
already-patched Chrome client). The archived counter captured the old58/133
threshold; §7/counter now use58/134 under standing owner authorization. No native
source changed after the count. Eleven counter tests, scoped ESLint, JS syntax,
Python syntax and diff checks pass. Build logs remain at
/private/tmp/blanc-wt-build.log; provenance.json pins native source, binary,
engine and test implementations. Fixture dependency source was inspected in the
installed aioquic package; no third-party source was vendored into the product.

This qualifies document-origin HTTP/3 handshake/datagram enforcement only.
Dedicated/shared/service workers, pending teardown/timeout/utility loss,
profile/browser destruction, missing-engine WebTransport runtime, malformed or
opaque origins, extension/enterprise composition, stream traffic and broader
transport failures remain unqualified. The weak-owner/timer paths are present,
but WebSocket lifecycle results are not WebTransport lifecycle proof. Next:
WebTransport worker and pending-lifecycle controls, then speculation initial
request/consumption evidence. No final engine choice or release approval.

Google upgrade baseline remains separate. Native physical input pending, latency
deferred, Electron diagnostic build pending approval and unstarted.
