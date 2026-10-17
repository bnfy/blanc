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
main-frame navigation and the actual RenderFrameHost for subresources. Missing
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
