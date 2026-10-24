# Method-changing redirects — October 24

**All48checks pass across eight chains: regular/private × HTTP303/308 × allowed/blocked destination.** These are the previously unqualified non-GET redirect cases. No GET-chain, POST307 sender-closure, worker, recovery, or signed-candidate acceptance suite was repeated. There were no failed runtime attempts in this checkpoint.

## Observed behavior

| Redirect | Allowed destination | Filter-blocked destination |
| --- | --- | --- |
| 303 | Initial POST becomes GET; body and Content-Type are removed; terminal response reports GET and an empty body | Native redirect decision sees GET and returns block; fetch rejects; no destination arrival |
| 308 | POST, body bytes and Content-Type remain; terminal response matches | Native redirect decision sees POST and returns block; fetch rejects; no destination arrival |

Each chain starts at an authored loopback URL. Allowed destinations remain same-origin; blocked destinations use `googleads.g.doubleclick.net` mapped to the same loopback server. No public ad server is contacted. The initial POST body and X-Probe header are checked independently at the server. Arbitrary cross-origin/CORS success, credentials, other header mutations, replacement URLs, chained redirects or sender destruction are not claimed by this schedule.

[Report](report.json) records the eight unique CDP request IDs, exact server method/body/header observations, response or rejection, source context and native hop decisions. There are16explicit native decisions: initial allow plus the expected redirected allow or block for each chain. Both browser processes exit0; [cleanup](cleanup.json) removes only their two task profiles after verifying process exit.

## Independent native attribution

The existing production trace only exposed custom service-worker update IDs. A small [opt-in trace addition](trace.patch) emits `Blanc.RequestDecision` when `disabled-by-default-blanc.attribution` is explicitly enabled and the request has a DevTools ID. It hashes that existing ID with SHA256 and records only the digest, method, redirect index, private flag and result. It does not alter IDs, requests, headers, redirect handling or enforcement, and adds no persistent writer. The harness independently hashes the CDP ID and requires exactly one initial and one redirected decision under it, with the expected method and context. Missing or mismatched decisions fail the run; destination absence alone cannot pass a blocking case.

`InspectorNetworkAgent::SetDevToolsIds` uses the subresource request ID; request conversion copies it to `ResourceRequest::devtools_request_id`. `OnReceiveRedirect` updates the request method using Chromium's RedirectInfo before invoking the gate. The existing `FollowRedirect` implementation still delegates validation to the real loader and refuses a replacement URL. [Source/executable hashes](identity.json) bind these source paths to the tested native output. `BLANC_RESEARCH_HOOKS` remains0; no private research-file output was enabled.

## Build and limits

One guarded incremental build passes: one planned action, six actual steps,31.71seconds; final guard0. Existing upstream patches remain73files/180hunks; only copied Blanc source changed. The signed accepted14706b0e/18a0c2ca candidate is untouched: this is native test-output evidence, not a new signed artifact or release approval.

[Remaining path dispositions](remaining-paths.md) now credit these303/308checks and retain the distinct header/replacement-URL question. Primary plan and F12/Decision2 evidence are updated; readiness stays9/12. Electron remains paused, Google baseline separate, and latency deferred.
