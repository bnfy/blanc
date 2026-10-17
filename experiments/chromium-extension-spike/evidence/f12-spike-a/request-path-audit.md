# Spike A: Chromium 157 request-path audit checkpoint

October 17, 2026. Upstream `157.0.8103.6`, commit
`41520584daa68d0040db7746ae562a0ff82187f6`. Approval record: PR #906,
`5863215d`, section 8, as relayed by the owner in this session. This is a
source audit and measurement checkpoint, **not a blocking-coverage pass**.
No hook has been added, no build invoked, no profile launched or modified.
Task 0's genuine Google-endpoint extension upgrade remains unobserved.

## Starting budget

[Counter output](patch-budget-start.json): **21 upstream files, 55 hunks**,
including the two binary icon assets at one hunk each. Approved aggregate
ceiling: 40 files / 120 hunks. Remaining arithmetic headroom: 19 files / 65
hunks; this is not a prediction of implementation size. The inventory excludes
new Blanc-owned files, so it is not a total code-size/maintenance metric.
`patch-budget.py` is read-only against the Chromium checkout. Four scratch-repo
tests cover hostile configuration, binaries/mode-only changes, new-file
exclusion, and combined staged/unstaged modifications. Existing build caches,
args, toolchain, native source and output have not been altered.

## Source map

References below are IDs in [source-references.json](source-references.json),
which records exact file/line ranges and hashes in the pinned checkout. All
runtime statuses below are **not run**. The matrix covers the named tranche
request classes; it is not a claim to have enumerated every Chromium internal
network consumer.

| Request class | Observed source route and candidate interception | Runtime proof required / limitation |
| --- | --- | --- |
| Top-level and subframe navigation | `navigation` calls `CreateContentBrowserURLLoaderThrottles`; `browser-hooks` exposes `CreateURLLoaderThrottles`. Factory contract includes `kNavigation`. | Regular/private navigation, allowed and blocked, startup hold, cross-origin redirect. Navigation factory's origin can be opaque; use the actual request context. |
| Document fetch, XHR, image, stylesheet, script, font, media, EventSource | `frame-factory` creates `kDocumentSubResource` through `factory-dispatch` → `WillCreateURLLoaderFactory`; `renderer-provider`/`renderer-throttles` are the separate renderer throttle path. | Browser throttle alone is insufficient. Candidate browser-owned factory proxy must retain security checks, resource types, frame/source context and clone behavior. Exercise cross-origin and nested/opaque-frame cases. |
| Dedicated/shared worker main scripts | `worker-script` uses `kWorkerMainResource` factory and browser throttles. | Frame/WebContents can be absent; do not require an active tab as a condition for protection. Test worker script redirects and a shared worker after its initiating tab closes. |
| Dedicated/shared worker fetch and importScripts | `dedicated-worker`, `shared-worker`: `kWorkerSubResource` factories. | Factory proxy candidate. Bind to BrowserContext/storage partition, not the current active tab. Worker initiator is not necessarily the top document. |
| New/updated service-worker scripts | `sw-first-script`, `sw-types`, `sw-factory`: `kServiceWorkerScript`. | New registration, update and importScripts. Installed script/cache reuse may not issue a network request; distinguish those cases. |
| Service-worker-originated network fetch | `sw-types`, `sw-factory`: `kServiceWorkerSubResource`; factory context can have no frame. | Test a worker's independent fetch and fetch issued while handling a document fetch event. Synthetic/cache responses are a separate case; a network factory observation does not prove those are intercepted. |
| keepalive fetch / sendBeacon | `keepalive-factory` wires the retained browser service; `keepalive-throttle` invokes the separate keepalive throttle entry. `keepalive-redirect` continues redirects without the original renderer. | Test with the sender alive and after close, including redirects and retries. The public hook contract says browser throttle effects differ while the renderer is alive. Do not count duplicate callbacks as duplicate requests or coverage. |
| Speculation prefetch | `prefetch-factory`: `kPrefetch` uses ContentClientParams. Browser header explicitly excludes PrefetchContainer from ordinary browser throttles. | Factory proxy candidate; test isolated/default network contexts, prefetch before navigation, and serving a prefetched response. |
| Pre-prefetch optimization | `pre-prefetch`: one branch passes null ContentClientParams and defers interception until consumption; another feature-controlled path calls the normal prefetch factory. | **Open coverage question.** Establish whether this path is reachable in this Mac browser configuration. If reachable, later interception is too late to prove no initial network leak. Do not label it covered by the normal factory hook. |
| Prerender | `prerender` starts with NavigationController::LoadURLWithParams; navigation and the frame factories are candidate routes. | Test the prerendered document and its subresources before activation, then activation, cancellation and private-window behavior. No coverage claim solely from navigation reuse. |
| WebSocket | `websocket` calls `WillInterceptWebSocket` / `CreateWebSocket`, separate from URLLoader factories. `websocket-embedder` currently ties Chrome's interception to extension proxies and returns false when frame is null. | A Blanc browser-side adapter must compose with existing extension handling. Worker socket identity/profile mapping is unresolved; never silently allow a null frame. Test document and worker handshakes. |
| WebTransport | `webtransport` calls `WillCreateWebTransport` before NetworkContext creation; callback can return an error. `webtransport-embedder` currently composes an extension proxy. | Separate browser hook candidate; test document and worker initiation, handshake rejection and private profile. HTTP/3 transport needs its own fixture support; a plain HTTP replay proxy is insufficient. |
| Redirects / loader restart | `redirect-contract` and the URLLoader FollowRedirect protocol are separate from initial start. | Re-decide destination/context at every redirect; preserve existing redirect validation. Test allow→block, block→allow (must never start), repeated redirects and cancellation while deferred. |

## Candidate architecture and unresolved decisions

A single browser throttle cannot satisfy the matrix. The narrow first candidate
is browser-owned interception composed at ChromeContentBrowserClient's existing
factory hook, plus navigation/keepalive and socket/transport adapters where the
source map requires them. `proxy-composition` already chains extension,
enterprise and sign-in proxies through URLLoaderFactoryBuilder. Blanc must add
its own adapter rather than modify the extension-system implementation or
bypass CORS, origin locks, redirect checks or other network security.

The public factory contract warns that a factory initiator can be inaccurate
for sandboxed/about:blank frames and opaque for navigation. The replay oracle
must compare **actual per-request** URL, type, initiator and top-frame context;
missing or mismatched context is a harness fault. Profile/private selection
must derive from the originating BrowserContext, including worker cases.

Before selecting a final hook implementation, resolve pre-prefetch reachability,
worker WebSocket attribution, keepalive factory ownership after sender teardown,
and service-worker synthetic/cache behavior relative to Electron. These are
investigation items, not proven impossibilities or a kill-criterion finding.
Runtime coverage requires a blocker decision event for every expected probe,
not merely successful JS API construction or a server seeing a request.

The existing JavaScript engine still needs an audited utility-process V8/module
bootstrap and Mojo contract. No utility runtime integration is assumed to
exist. Startup hold, engine crash/disconnect, bounded cancellation and reload
behavior must be measured with pending requests; no automatic fail-open fallback.
The Rust alternative remains conditional on the approved latency procedure.

## Replay work and next checkpoint

[Replay contract](../../fixtures/replay/README.md) and a fail-closed context/
decision validator are the first harness artifacts. **Captured requests: 0.
Accepted oracle runs: 0. Block-rate and latency measurements: not run.**
No 4,000-request corpus or functioning interception layer is claimed here.
The next checkpoint is origin-preserving transport plus an Electron observation
adapter in a disposable profile, with fixture acquisition and coverage probes.
Do not use the permanent 156/157 profiles or infer performance from unit mocks.

Current source hashes are evidence, not installed-binary identity. The upcoming
upgrade monitor must continue recording the actual binary/version used for each
observation; tranche development cannot retroactively change Task 0 evidence.
