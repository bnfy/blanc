# Denied and timed-out update attribution — October24

**Requested attribution coverage passes:**10denied-update assertions,6regular timeout assertions and6private timeout assertions, each with its recorded run boundary. The regular timeout is the passing portion of an overall incomplete run; the later private-only run supplies its completed scope. This is not a22-pass single suite or recovery acceptance.

## Denied requests

The [denied report](denied-report.json) uses regular/private contexts with two registrations sharing a script URL. A local fixture changes the update response to redirect to a filter-blocked hostname mapped back to the same local server. Each opaque token persists through the allowed first hop and denied redirect. The terminal result1joins the original registration and checked-version IDs. Both updates reject, and the denied destination never reaches the fixture server. No public ad endpoint is contacted. Four [negative controls](negative-controls.json) reject a missing terminal event, wrong registration, duplicate token, and the actual pre-fix timeout record. These10checks passed before the timeout-only repair and were not repeated.

## Missing timeout event repaired

[Before repair](timeout-before-fix.json), both held requests rejected but only the sibling engine-failure callback emitted its terminal event. The actual deadline path called completion directly, omitting the trace. The repair factors the existing opaque event code into `TraceDecision`, invokes it from the deadline path, and adds an opaque-token-only `Blanc.BlockerTimeout` marker. Enforcement,35second deadline, completion/error and engine-failure behavior are unchanged. Existing result callbacks retain the same event fields.

[Regular accepted portion](timeout-regular-accepted.json) supplies6passing checks. The [complete private-only run](timeout-report.json) supplies6more. Each has two distinct request tokens, correct registration/version/private identity, refusal of both updates, a terminal -1event for each, and an explicit marker for the request whose deadline expired. The other request is refused by the resulting shared engine failure; it is not mislabeled a second independent deadline.

The first repaired private attempt refused both requests through another failure path before a deadline marker. It remains unqualified for timeout causality in `timeout-mixed-before-settle.json`. A private-only retry lets setup replies settle before suspending the exact owned utility and obtains the real deadline marker. No earlier regular/cache/client/allow tests were repeated; this retry targets the failed private deadline assertion.

## Separate recovery issue remains open

Resuming the deliberately suspended utility after failure emitted a SIGSEGV in the helper process. The same signature is present before this trace repair. Logs are retained. The main browser exits normally in completed schedules, but these checks do **not** qualify utility resumption/recovery or establish the crash's cause. This is a separate follow-up defect, not hidden as a fixture pass.

## Build, privacy and preservation

One guarded incremental build:32.18s/6steps; final guard0actions. No build mode, toolchain or GN changes. Source delta and native output hashes are in build-identity.json; the signed14706b0e/18a0c2ca candidate was not replaced. All instrumentation is opt-in opaque tracing; no URL/storage-key/header/body fields or private diagnostic file writer were added. Event timestamps were used for neither latency statistics nor performance claims.

Only disposable fixture profiles/utilities were touched; [cleanup](cleanup.json). Google baseline and owner tabs remain separate. Electron paused, latency deferred. Aggregate F12/Decision2 and final release approval remain open;9/12unchanged.
