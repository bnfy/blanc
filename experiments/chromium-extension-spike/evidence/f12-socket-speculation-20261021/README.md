# F12 socket and speculation disposition — October 21, 2026

**Source disposition completed; runtime acceptance remains open.** This is the next
Decision 2 task after native sender-closure evidence, on a new PR following #920.
No production adapter was added, no browser/profile was opened, and no build,
latency measurement or Electron diagnostic build was run. Google upgrade baseline
work is separate. Decision 2 and both F12 spikes remain in progress.

## Pinned evidence

`source-capture.json` records the Chromium revision, prototype parent, selected
working-tree status, full-file SHA-256 hashes and line-numbered source excerpts.
The native checkout is patched: its Git revision alone does not identify the
inspected implementation. The captured file hashes identify those bytes; they do
not establish equivalence to a running binary. `capture.py` reproduces the
read-only capture with arguments `CHROMIUM_SRC PROTOTYPE_REPO OUTPUT_JSON`.
`validation.json` records reproducibility and digest checks. `SHA256SUMS` covers
this report, the capture script, capture and validation.

## Disposition

| Path | Observed source routing | Decision 2 disposition |
| --- | --- | --- |
| Document WebSocket | `WebSocketConnectorImpl` calls `WillInterceptWebSocket`; Chrome consults extension `WebRequestAPI`, then `ProxyWebSocket`. If interception is false, the connector calls its network factory directly. | **Missing Blanc Blocker adapter**, not merely an unrun URL-loader test. An extension proxy is not proof that either experimental engine enforced this handshake. |
| Worker WebSocket | Chrome's interception predicate returns false for a null frame. The connector retains process, origin, isolation and worker-token context outside that predicate. | **Separate worker integration required.** A frame-only adapter cannot close this row. Preserve actual browser context/private identity and worker ownership; do not invent a document origin. |
| WebTransport | Connector supplies process, optional frame and initiator to `WillCreateWebTransport`; Chrome uses extension `ProxyWebTransport`, not the Blanc adapter. Completion refuses an explicit error before calling `NetworkContext::CreateWebTransport`. | **Missing Blanc Blocker adapter and H3 fixture.** The error callback is a candidate refusal boundary. Plain HTTP replay or WebSocket results cannot qualify this path. |
| Ordinary prefetch | `CreatePrefetchURLLoaderFactory` passes `ContentClientParams` with browser context and optional referring frame through `CreateInternal(kPrefetch)`. Chrome's URL-loader hook calls `blanc::MaybeProxy`; that adapter is gated by blocker assets/uBO probe switches. | **Candidate existing integration; runtime proof missing.** Capture initial speculative request, explicit engine decision and server arrival/non-arrival before consumption. Then navigate to consume it and verify no unqualified bypass. |
| Pre-prefetch | Default factory branch passes `content_client_params = nullopt`; parameter `check_will_create_url_loader_factory` can route through the normal helper. Main off-thread feature and forced-testing feature are disabled by default. Scoped caller search finds Android WebView and `CreatePrefetchContainerFromPrePrefetchForTesting`, guarded by the forced-testing feature. | **Conditional source bypass, not demonstrated enabled Mac exposure.** Do not count consumption-time interception as initial-request protection. Runtime feature/variation state and broader callers are not exhaustively qualified. Re-audit before enabling either feature or changing callers. |
| Prerender | `SetDocumentStartPrerenderPolicy` sets the document-start binder to cancel only with `--blanc-ubo-document-start`. It explicitly declines prerender capability for this interface. | **Bounded unsupported behavior for that experimental binder.** This is neither blanket prerender protection nor an activated-prerender pass for Blanc Blocker. Existing lifecycle evidence remains bounded; pre-activation requests and activation need separate qualification. |

Source anchors are the named functions in the captured excerpts; historical
`f12-spike-a/request-path-audit.md` remains unchanged. The pre-prefetch search is
limited to the three recorded trees and excludes test filenames; the force-test
helper lives in a production source file and is therefore explicitly included.
Disabled-by-default source declarations do not prove an installed runtime's
feature state or exclude future variations/command-line overrides.

## Next implementation and acceptance order

1. **WebSocket decision boundary first.** Design one browser-context-bound
   handshake decision before network creation, including the null-frame worker
   route. Preserve extension proxy chaining, enterprise header client, origin,
   isolation, subprotocols and teardown behavior. Review any extra upstream hooks
   against the current 55-file/129-hunk ceiling before applying them. A document-
   only fix must remain labeled incomplete.
2. Qualify document and worker allow/block handshakes in regular/private contexts
   against an isolated real WebSocket server. Require a positive handshake/message
   control, explicit blocked decision plus no server handshake, context identity,
   and sender destruction while a decision is pending. Check missing-engine and
   timeout refusal; do not infer fail-closed behavior from a disconnected page.
   Keep engine-specific results separate and pin assets/source/binary identity.
3. Add WebTransport only with a valid controlled HTTP/3 server, certificate and
   successful positive control; then test refusal and worker/private contexts.
   Decide explicit safe unsupported behavior if that cannot be qualified.
4. Run ordinary speculation-prefetch initial-request/consumption controls and
   record actual feature state. Keep pre-prefetch conditional and prerender
   activation open until their own paths are exercised. Strict service-worker
   update/cache attribution from the reconciliation matrix also remains open.

These are acceptance requirements, not results from this checkpoint. No engine
choice, broad protection claim, release approval or latency waiver follows.
