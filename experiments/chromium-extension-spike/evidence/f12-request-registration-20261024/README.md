# Request-to-registration attribution — October24

**Four real service-worker update requests join to their exact registration, checked version and blocker decision. All13new assertions pass across regular/private contexts.** The previous signed candidate remains unchanged. These results belong to the identified incremental native test output and source delta, not a new notarized release.

## Implementation and privacy

The production (research hooks off) update-factory wrapper activates only with the explicit `disabled-by-default-blanc.attribution` tracing category. Otherwise it returns the original factory. When tracing, it generates one unique opaque internal devtools request token, and traces that token, registration ID, old checked version ID and private boolean. The existing blocker decision emits the same token and result. This is an independent native join, not a URL/order/timestamp inference.

Existing devtools IDs are preserved and not joined. Decision tokens must match the expected prefix plus32hex characters. No URL, scope, storage key, header, cookie or response body is added to either event. There is no new file writer or public WebUI/API. Explicit DevTools tracing retrieves events; default operation emits none. Existing private research-log refusal remains intact. Trace metadata from the disposable private test is retained here; this does not enable persistent private browsing logs.

## New verification

[Run/report](report.json) uses two registrations with the same script URL per context. Browser ServiceWorker events independently supply registration and checked-version IDs. Each context checks: category-off silence while updates complete; two unique request tokens; one allowed blocker decision per token; registration/version agreement; correct private flag; opaque-only payload keys. The thirteenth assertion confirms no token reaches HTTP headers.

Two regular plus two private updates supply four joins, not13requests. No previous cache, client, recovery or L8 suite was repeated. A fixture setup attempt failed before worker setup because the initial page navigation did not settle; explicit Page.navigate corrected it. Its original report remains. Both final processes exited0, and only task profiles were removed; see cleanup.json.

## Build identity and limits

The source base, delta digest and actual native executable/framework hashes are in test-build-identity.json. Original compiler failures are retained: unregistered category, temporary DynamicCategory lifetime, and Chromium's out-of-line method requirement. Corrected build31.03s/7steps; final token-format-guard build31.70s/6steps. Final guard0actions; inventory73existing upstream files/180hunks. Copied Blanc files remain excluded by the documented counter, not zero maintenance cost. No toolchain/GN/cache change or cold build.

The accepted signed14706b0e/18a0c2ca app was not replaced. This delta requires affected artifact review before entering a future distributed candidate. Missing/dropped events, pre-existing devtools IDs, trace-session interruption, denied/timeout variants and arbitrary update patterns are not newly qualified. Existing tests retain their own scope. No full F12, engine, release or merge approval;9/12unchanged. Electron paused, Google separate, latency deferred. Trace timestamps were not used for benchmarking.
