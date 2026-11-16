# DevTools replacement enforcement repair — October25

**The native repair passes all42affected runtime checks and three preparation tests.** The original [native and signed bypass evidence](../f12-redirect-overrides-20261024/README.md) remains unchanged. The signed14706b0e/18a0c2ca artifact has not been replaced and still contains the old implementation; these results are not signed-candidate acceptance.

## Repair and review

The blocker is now assembled after the request-mutating proxies. A small registered callback carries the original BrowserContext, frame, factory type and isolation metadata into finalization. For the ordinary factory chain it appends the existing Blanc proxy. For a network factory override, it inserts that proxy at the override's downstream receiver: DevTools cancellation/restart must traverse it. The old earlier insertion is removed, so requests are not deliberately double-gated.

The override object and its CORS/security flags stay unchanged. Native redirect validation, header forwarding, engine decisions, timeout, cancellation and private policy are reused. No research logging is enabled. If assets are absent, the callback returns without altering either chain. `prepare_final_factory.mjs` applies this construction reproducibly; its tests cover a fresh source tree, repeat preparation, migration from the old hook and refusal of an unknown legacy hook. A second application to the real source produced no changes.

## Affected runtime checks

[Report](report.json) records regular/private checks using the same replacement/header fixture that exposed the gap, plus ordinary allow/block controls without Fetch interception:

- Each changed URL is independently joined to a new native decision using its hashed CDP request ID. Allowed replacements arrive; blocked replacements return a native block and never reach the server. The original redirect destination is not contacted.
- Header removal/addition reaches the first redirected request; original headers return on the next hop. The new gate sees the real forwarded header modifications. This is tested because moving the interception boundary affects this path.
- Without DevTools interception, allowed traffic succeeds and a direct blocked-host request is refused before server arrival.
- Both processes exit0. Three task profiles, including the adjunct probe, are removed after verified process exit. No permanent or Google profile was used.

Only these affected paths were rerun. No method303/308, worker/cache, broad recovery, L8 or owner suite was repeated.

## Adjunct navigation probe — not accepted attribution

A separate [main-frame probe](navigation/report.json) observes an aborted replacement and no destination arrival, but fails its request-digest join because the expected native trace is unavailable for this browser-initiated request. It is retained as unqualified, not counted among the42passes and not called a demonstrated bypass. No private navigation or broad navigation matrix was rerun to chase this observer limitation. The current claim is the fully observed fetch path plus ordinary controls, not blanket navigation attribution.

## Build and provenance

One guarded incremental build:18planned actions,23actual steps,70.63seconds, final guard0. The source/SDK/compiler/build arguments and caches were retained. Fresh inventory is75existing upstream files/184hunks, a delta of+2files/+4hunks, with151Git dependencies clean. The first inventory correctly exceeded the old73/180ceiling; its record is retained. The counter limit is updated under the owner's standing authorization for increases with later consolidation. No cold rebuild or Electron work.

[Identity](identity.json), prepared-hook diff, tracked repair diff, full logs and test fixtures bind the result. Missing application-repo Git metadata was restored from the exact4fb76714remote head without checking out or overwriting working files; unrelated missing/dirty snapshot files are excluded from this publication. The Google ledger and upgrade evidence remain separate.

## Remaining boundary

The currently distributed candidate needs an affected repair build/signing/acceptance step before this fix can be credited to it. Privileged DevTools is required for the original bypass; no ordinary webpage exploit was established. Direct non-null `FollowRedirect` replacement remains safely refused by source but is not a directly executed API test here. Main-frame digest attribution, multiple simultaneous debugger sessions and broader request-class currentness are not newly qualified. F12/Decision2 and release approval remain open; no new gate is awarded. Electron paused; latency deferred.
