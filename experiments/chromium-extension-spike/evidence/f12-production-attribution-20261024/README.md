# F12 production attribution: service-worker update path — October24

**The reviewed production path retains network enforcement when research attribution logs are compiled out. No new production defect was found in this source audit.** This is source/contract reconciliation, not a new runtime test, broader parity claim or F12 acceptance. The accepted signed candidate remains source14706b0e/archive18a0c2ca.

## Exact path and authority

The [hashed source chain](source-chain.json) records prepared157.0.8103.15 source excerpts and confirms the repository proxy and update wrapper are byte-identical to their prepared counterparts.

1. `ServiceWorkerRegisterJob::UpdateAndContinue` obtains its factory from the context wrapper using the registration scope and creator network restrictions. A missing factory aborts the job; it does not choose another profile or current tab.
2. `GetLoaderFactoryForUpdateCheck` selects the browser-initiated service-worker-script path. `GetLoaderFactoryForBrowserInitiatedRequest` invokes the browser hook with that storage partition’s BrowserContext, a null frame, `kServiceWorkerScript`, scope origin and `is_for_network_service=true`. Its empty navigation ID is intentional; update loads have no corresponding navigation.
3. Chrome’s network-factory hook invokes `blanc::MaybeProxy` inside the existing factory chain. `MaybeProxy` captures the actual BrowserContext weak pointer and off-the-record state, frame ID when present, factory type and isolation info. It does not substitute the active tab for a null worker frame.
4. `Factory::CreateLoaderAndStart` creates a separate Request object holding the actual ResourceRequest and loader/client endpoints. HTTP(S) reaches `Gate`; a dead BrowserContext refuses. In the production branch, `Gate` calls `Engine::Decide(url, Type(request), request.referrer)`. That referrer/sourceUrl contract matches the already-recorded native/Electron baseline; this audit neither replaces it with an inferred initiator nor claims referrer-sensitive rules always have a nonempty source.
5. Only engine result0 invokes the underlying loader. Any other result refuses; the deadline refuses and marks the engine failed. Redirects update the real ResourceRequest and re-enter Gate before forwarding. The upstream network restrictions/redirect pipeline remains in the factory chain.

## Diagnostics are not enforcement

`BlancUpdateFactory` is an optional research attribution wrapper around the already-selected factory. With `BLANC_RESEARCH_HOOKS=0`, it returns that factory unchanged. It does not bypass or disable the production `MaybeProxy`/Request gate. With research enabled, private logging is explicitly refused before identity creation or serialization. The signed production policy remains0; no private diagnostic output was enabled for this audit.

The [twelve historical native token joins](../f12-path-attribution-20261024/README.md) prove the recorded update fixtures’ attribution. They do not become a current production logging pass by source inspection. Their lack of a corresponding production log does not demonstrate a network bypass either. Current signed security/recovery evidence remains at its original bounded scope.

## Residual limits, without repeat tests

| Item | Disposition |
| --- | --- |
| Native same-URL update identity never proved | Stale blanket claim corrected by the existing12joins; no repeat needed |
| Production update factory disappears when diagnostics are disabled | Not supported by current source: wrapper pass-through retains the gated factory chain |
| Arbitrary current-production update/registration/cache/multi-client attribution | Not fully observed; no blanket acceptance. Any future fixture must add a genuinely missing case and use independent loader/registration authority rather than URL/order guesses |
| Cache-only or synthetic service-worker response | No network request exists for an interceptor to observe; network proof cannot establish cache policy or page outcome. Separate behavior evidence retains its scope |
| Independent Electron identity | Remains paused; do not rebuild Electron or weaken comparison rules |
| Pre-prefetch current default state | One fresh signed-process disabled-state observation already recorded; do not rerun it without a changed policy/build |

No native hooks, diagnostics, source, application settings, profiles or artifacts were changed. No browser was launched, no existing test was repeated, and no new block-rate/latency claim is made. The Google baseline was not accessed. Remaining aggregate F12 acceptance and Decision2 approval stay open.
