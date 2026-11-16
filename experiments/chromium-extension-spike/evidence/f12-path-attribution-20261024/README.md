# F12 request-path and update-attribution disposition — October24

**Two stale items are narrowed without repeating runtime tests.** No source change, native/Electron build, latency run or Google-baseline action occurred. One new effective-feature-state check used the accepted signed master in a fresh disposable profile; no previously passing runtime test was repeated. This record does not accept the aggregate F12 spike.

## Native service-worker update attribution already had a bounded proof

The October21 aggregate cited the earlier rejected URL-only correlation, but omitted the later [native document-gate evidence](../f12-document-gate-20261017/README.md). That later record has **12 existing native token joins**: eight concurrent unchanged-byte checks across two registrations sharing a URL, and four changed-byte checks, regular/private. Browser-generated unique loader tokens join exact hook records to registration/version/scope/storage-key and are independently checked against lifecycle records. They are not timestamp, URL-only, ordering or replacement-target guesses. The checked version is the old version under comparison, not a claimed new execution realm.

This review reads the two original proof JSON files, verifies twelve unique tokens, and streams the worker-updates archive to verify its recorded member hashes without extracting or executing it; [record](existing-update-evidence.json). These are **existing passes, not twelve new runs**. [Bound source hashes](source-bindings.json) identify the current verifier and writer.

**Closed as a stale blanket claim:** “native same-URL update identity has never been proved.” **Still open:** independent Electron identity (Electron paused), broader update/cache/ownership permutations, and transfer of historical research instrumentation to a current production attribution claim. Current `update_identity.inc` uses `BLANC_RESEARCH_HOOKS`, refuses private logging before serializing context, and is a pass-through when research hooks are off. The current signed preview intentionally cannot recreate those private diagnostic logs. No request to re-enable them or weaken that privacy boundary is made. This is an observer-evidence limitation, not by itself a demonstrated enforcement bypass.

## Pre-prefetch conditional reachability is now pinned to current source

[Source capture](source-capture.json) uses the existing157.0.8103.15 checkout, hashes each inspected file and records line-numbered branches and the caller-search command/results. Both `PrefetchOffTheMainThread` and `PrefetchOffTheMainThreadForceForTesting` are disabled by default. `CreatePrePrefetchURLLoaderFactoryOnUI` uses the regular interceptor only when `check_will_create_url_loader_factory` is true; its default false branch passes null content-client parameters and defers interception until consumption.

The recorded C++ search over chrome/content/android_webview finds the non-test public API caller in Android WebView. Content's normal prefetch method can enter the test route only when the forced-test feature is enabled; that route checks the feature before creating the pre-prefetch service. Android WebView is not the Mac product target. **This is a conditional bypass design, not a demonstrated default Mac leak and not a pre-prefetch protection pass.** The search scope and defaults are explicit; the source search alone does not prove the signed application's effective FeatureList/variation state or exclude future callers/overrides.

**New bounded runtime result:** the signed14706b0e master reports neither feature in enabled nor disabled overrides through `chrome://version` → `requestVariationInfo`. The decoded result, combined with both disabled defaults, establishes **effective disabled state in this fresh regular-profile process**. The [observer source](feature-observer-source.json) shows that the response uses `GetForCurrentProcess` and `FeatureList::GetFeatureOverrides`, including non-command-line overrides; this is not merely a check of launch arguments. [Summary](effective-feature-summary.json), raw response `feature-state.json.gz`, and harness are retained.

The first attempt timed out because the app tab API did not expose the requested internal target; it exited0. A corrected direct `Target.createTarget` internal-page request completed. This was a fixture-routing correction, not a product fix. Both disposable profiles were removed after their processes exited; [cleanup](cleanup.json). No owner/permanent/Google profile was used. No new runtime feature flags were supplied, no pre-prefetch traffic was generated, and neither test attempted latency measurement.

**Disposition:** no enabled pre-prefetch route in this observed default signed-Mac process. This closes the current fresh-profile feature-state question only. Custom flags, future Finch/configuration changes, other profiles/platforms, or enabling this feature require new interception/refusal qualification before claiming coverage. Ordinary prefetch passes are not substituted for that qualification.

## What remains in F12

- Pre-prefetch enabled-route qualification before any future flag/configuration enablement; current fresh-profile disabled state is now recorded.
- Current production request-context attribution where historical research-only proofs are insufficient; targeted mapping is required before claiming current parity.
- Explicit historical limits for cache-only responses, multi-client ownership and cross-runtime/private cosmetic/provider behavior; no umbrella equivalence claim.
- Qualified latency stays deferred and unmeasured. Engine/Decision2 approval remains separate.

The [notarized prerender activation repair](../f12-prerender-notarized-20261024/README.md) already covers its demonstrated loss/timeout gap and is not rerun. WebSocket/WebTransport, ordinary prefetch and signed recovery passes are likewise retained at their recorded scope. No changed artifact means no repeated L8 acceptance. Readiness stays9/12; L4/L11/L12 remain separate.
