# Native blocker experiment (Chromium 157 only)

The browser's network-service URLLoaderFactoryBuilder chain holds HTTP(S)
requests while a sandboxed Mojo utility process runs the existing Ghostery
2.18.2 engine. Native code reads and SHA-256 authenticates the generated bundle
on a blocking-capable task runner, then transfers it to a V8 isolate in the
utility. The isolate exposes UTF-8 conversion only: no Node, filesystem, network,
or browser APIs. It uses the existing PAC utility's jitless policy. Existing
extension, CORS and enterprise factory interceptors remain in the chain.

This is **opt-in experiment code**, not shipping blocking or a 157 baseline
promotion. Without `--blanc-blocker-assets=DIR`, no factory is installed. Native
observations are off by default, including private profiles. Only disposable
acceptance instances use `--blanc-blocker-log=FILE`; the harness creates that
file mode 0600, commits fixture observations only, and removes the raw file.
Never enable logging in a permanent profile.

## Reproduction

1. Run `bundle.mjs NODE_MODULES APP_ASAR ASAR_MODULE OUTPUT`. It verifies every
   one of the bundled module bytes against the pinned installed reference ASAR,
   verifies both list hashes and resources, emits the script, manifest, hash
   header and dependency licences. No oracle, candidate manifest or rule-derived
   answers are read by the generator or engine. It uses only the pinned lists.
2. Run this directory's `prepare.mjs CHROMIUM_SRC OUTPUT` after ordinary 157
   prototype preparation. It copies the new Blanc-owned sources and adds four
   anchored upstream integration files. Never use 156 preparation on 157.
3. Run unchanged-args `gn gen out/BlancPrototype` only when BUILD.gn changes;
   then the normal prototype `build.mjs --check` and `--build` guard. Preserve
   the warm output/toolchain and log each invocation in the tranche ledger.
4. Run `fixtures/replay/synthetic/chromium-native.mjs CHROMIUM_EXE UI_ASSETS
   PLAYWRIGHT_MODULE ELECTRON_ORACLE NEW_EVIDENCE ENGINE_OUTPUT`. Both profiles
   get two fresh offline replays. Decisions/context come from the actual hook;
   CDP and fixture arrivals independently prove cancellation or complete loads.

## Failure and coverage contract

Startup requests wait for authenticated engine initialization. A missing or
modified bundle, init failure, disconnect, decision exception or timeout stays
fail closed. Startup is bounded to 30 seconds, each request to 35 seconds;
queue size is bounded to 4096 and in-flight Mojo decisions to 256. A failed
service is not silently replaced or restarted; restart this test instance for
recovery. Live engine reload/recovery UX is a remaining gap.

Matching mirrors Electron's actual adapter: `Request.fromRawDetails` takes
**request.referrer** as `sourceUrl`; it does not substitute request_initiator.
The native log records both separately. Main-frame requests are allowed only
after readiness, matching Electron's adapter. Raw initiator absence stays
separate from opaque `"null"`. Top-frame origin uses the request's URL for a
main-frame navigation and the actual RenderFrameHost snapshotted at request entry for subresources. Missing
frame/worker attribution is `unresolved`, never a fabricated active-tab origin.

Redirect responses pass through the same decision gate with the updated URL,
method and referrer, before forwarding OnReceiveRedirect. FollowRedirect passes
headers unchanged to the existing loader; explicit replacement URLs are refused.
The current single-frame corpus does not verify redirects. Ghostery resource
redirects return `unsupported-resource-redirect` and fail closed; they cannot
count as correct blocking. WebSocket/WebTransport have separate entry points
and are **not intercepted**. Worker/SW, keepalive after teardown, prefetch and
prerender remain unverified. Cache/SW-served requests that bypass a network
factory, response-header CSP, cosmetics, procedural rules and main-world
scriptlets remain gaps. This is not full F12 acceptance or a real-web block rate.

The comparator never uses seeded labels for decisions. Context/referrer mismatch,
engine failure, duplicate observations and unexplained traffic invalidate the
run. A wrong allow of an Electron-blocked script stays a blocking difference;
its complete authored response executes and its child traffic is reported
separately, never used to pad the corpus denominator.

Redirect/worker and latency extension: see [measured results](../../evidence/f12-paths-latency-20261017/README.md). GET redirects and dedicated workers pass the bounded probes; shared/service worker identity and quiet-machine latency remain gaps.

CodeQL hardening: embedded data use the shared script-literal encoder (JSON plus
HTML syntax/Unicode separator escaping). Module bytes still come from the
hash-pinned ASAR. Preparation reads through a descriptor, refuses symlinks, and
atomically replaces changed files while preserving unchanged mtimes. The
controlled recorder's fixture CA belongs to its TLS agent, not request data.
See [remediation evidence](../../evidence/f12-codeql-20261017/README.md).

Worker context investigation: [audit and regression evidence](../../evidence/f12-worker-context-20261017/README.md).
Frame context is captured before the asynchronous engine decision, avoiding a
later lookup after the frame disappears. Diagnostic factory/request isolation
origins remain separate: a storage partition can reduce a top origin to a
schemeful site and cannot supply the required document identity. Shared/service
workers still lack independently correlated frame context in both observations;
matching decisions do not close that acceptance gap.

Explicit worker-context follow-up: [evidence](../../evidence/f12-worker-identity-20261017/README.md). Six service-worker subrequests now compare with independently observed worker identity and controlled-client sets in both profiles. Shared connected-client lifecycle and the initial service-worker script remain gaps. Engine inputs are unchanged; latency stays deferred.

### Worker ownership checkpoint (October 17)

[Evidence](../../evidence/f12-worker-ownership-20261017/README.md): shared-worker clients now correlate through actual
MessagePort challenges and independently observed document/worker realms; the
initial service script joins the new worker's DevTools token and lifecycle.
All ten authored path cases match in three variants, regular/private, twice per
runtime. This closes the two bounded gaps, not the broad worker matrix.
Multiple clients, teardown, updates and fetch/cache behavior remain untested.
122 focused tests pass. No native build or engine-input change; latency deferred.
The earlier debugger-barrier claim is corrected in PATHS-AND-LATENCY.md: requesting
a breakpoint did not establish a pause; the authored readiness gate now provides
explicit observed readiness and is excluded from latency.

### Shared lifecycle checkpoint (October 17)

[Evidence](../../evidence/f12-shared-lifecycle-20261017/README.md): bounded
two-document shared-worker ownership and navigation-driven destruction of one
exact owner realm pass in regular/private profiles, twice per runtime. Engine
inputs and native source are unchanged, and the guarded plan contains zero
actions. Broader lifecycle coverage remains explicit; latency is deferred.
