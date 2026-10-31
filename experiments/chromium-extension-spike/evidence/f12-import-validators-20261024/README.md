# Imported-script and validator attribution — October 24

**Two regular/private schedules pass 33 checks: 29 runtime/HTTP/privacy checks and four offline missing-import negative controls.** These are new imported-dependency and validator cases, not reruns of the prior main-script, cache-response, recovery, or owner acceptance suites. There are 16 checked update requests (main and import, across two registrations, two phases, two contexts), not 33 requests.

## New coverage

The main worker script stays byte-identical and imports one dependency. Two registrations share both URLs; browser ServiceWorker events supply independent registration and checked-version IDs.

1. Only dependency bytes change from v1 to v2. Each main-script request validates with HTTP304. For each context the first dependency request returns200 and the other validates the shared HTTP cache with304. Both registrations activate new versions and both controllers execute dependency v2.
2. A second explicit update leaves every byte unchanged. All four script requests per context reach the local server with validators and receive304. Both registration/version identities stay unchanged; both controllers still execute v2.
3. Every request has a unique opaque token, one native allow decision, the correct registration/checked-version, correct private flag, and the main-versus-import role supplied by the native update checker. No URL/order inference substitutes for this join.
4. Trace arguments contain only the allowed opaque IDs, booleans and decision. No token is emitted in HTTP headers. Removing imported-request identity events makes the same verifier reject each phase (four offline negative controls).

[Final report](report.json), executed [harness](run.mjs), compressed full traces and server observations retain the outcomes. Both browser processes exit0, and [four disposable profiles](cleanup.json) were removed only after verifying process exit. Owner and Google baseline profiles were not used.

## Minimal attribution change

The existing opt-in trace wrapper already receives Chromium's `is_main_script` argument but discarded it. The [change](attribution.patch) carries that boolean into `Blanc.ServiceWorkerUpdateRequest`; it changes no network decision, cache policy, update algorithm, identifier generation, default tracing state or private logging policy. With tracing disabled the factory still passes through. `BLANC_RESEARCH_HOOKS` remains0. Both installed copies of the include match the repository file.

[Source/build identity](source-build-identity.json) records hashes for the checker, registration lifecycle implementation, research setting and executable framework. The only native build was incremental: one planned action, six actual steps,31.59seconds, final guard0. Only a copied Blanc include changed; the last authoritative upstream inventory remains73files/180hunks. No compiler/toolchain/GN/cache changes or Electron build occurred.

## Failed fixture attempts retained

The [initial report](initial-report.json) failed while repeatedly asking the old controllers for their dependency version during replacement activation. The [diagnostic attempt](diagnostic-report.json) shows one replacement active, another installed and waiting, with native main/import joins present and no reported worker error. Its lifecycle events show the old worker stopping and then starting again during those message probes.

The final harness waits passively for the independently observed replacement-version activation, then sends one content query and closes its MessagePort. Both contexts pass with this ordering. This supports a fixture-observer interaction; it does not establish a new production update defect or claim every activation delay has this cause. The earlier failed attempts are not counted as passing acceptance or erased.

## Acceptance boundary

This closes the recorded imported-script/HTTP-validator attribution question for the tested classic-worker schedule. It does not establish arbitrary import graphs, module workers, redirect/error response combinations, existing DevTools-ID tracing, or all cache/ownership races. The [remaining request-path dispositions](remaining-paths.md) keep those limits separate from repeated-test requests.

The signed14706b0e/18a0c2ca candidate remains unchanged; this trace-only delta is native test-output evidence, not new signed distribution acceptance. Progress stays9/12. F12/Decision2 is not accepted. Electron is paused, Google baseline stays separate, and latency remains deferred.
