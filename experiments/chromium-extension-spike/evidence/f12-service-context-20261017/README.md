# Controlled service-worker fetch contexts

October 17, 2026. Eight fresh Electron/Chromium regular/private sessions pass
same-URL update behavior and 16 allowed/blocked controlled worker-fetch contexts.
The comparator now separates a proven page event from the distinct worker network
event for a frameless Electron hook or Chromium service-worker-subresource factory.
Only the independently attached, observed page target and matching frame ID qualify
for that exclusion. Unknown events and multiple worker events remain ambiguous.
No event is deleted from raw evidence. Native request ID must still match;
Electron still requires unique observed worker request, method/referrer and bounded
time. Worker realm, profile, and before/after stable client sets remain mandatory.

Paired comparison checks actual method, URL, referrer, resource type, initiator,
decision and worker/client context. The raw hook's unresolved top frame is never
replaced with a guessed visible-tab or partition origin. Negative regression tests
retain unknown duplicate events as gaps. Existing worker-path comparison is rerun
separately. Evidence includes both raw runs and the 16 explicit context proofs.

Scope closed: unique allowed/blocked fetches from one stable controlled document
through one service worker in the measured lifecycle. **Not full service acceptance.**
Failed startup lacks a realm/complete observation; update-check requests have no
native DevTools ID in this pin; repeated script URLs cannot be correlated merely
by URL. Cache-only requests never reach the network hook and need separate event
ownership evidence. Multiple clients/in-flight changes, unchanged-byte/cache
validator update behavior and restart remain gaps.

The pinned `content/browser/service_worker/service_worker_single_script_update_checker.cc`
at 198-227 explicitly uses no relevant frame/tab and a browser-initiated request ID.
The captured update hook reports devtools_request_id=absent. This is a specific
instrumentation gap; no observer heuristic is promoted into proof of update context.

93 focused tests pass; 58-file lint clean. No native build, upstream patch delta,
prepare, GN, toolchain or args change. Latency remains deferred. Test timing is
recorded in report timestamps, not claimed as attention or decision latency.
Profiles and fixture keys are removed; permanent data and 156 are untouched.
