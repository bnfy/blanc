# Service-worker lifecycle behavior checkpoint

October 17, 2026. Harness-only; no native build or latency measurement.

Eight final sessions passed: Electron and Chromium, regular and private, two
fresh sessions per combination. Each measured failed registration of a 404
script, v1 activation, a controlled network fetch, a cache-only response, a
blocked worker fetch, and controller replacement by a different script URL (v2).
The cache and blocked requests never arrived at the fixture network server.
The independent verifier confirms ready-provider allow/block decisions, profile
and initiator against the raw hook records in every session.

This is **behavior evidence, not strict worker-context acceptance**. Every final
session retained a worker-observer `Session with given id not found` error during
the lifecycle. No error was converted into a context pass. Controlled-fetch
ownership and failed-script correlation without a realm remain gaps. Replacement
by a different script URL does not prove same-URL `registration.update()` behavior.
In-flight reassignment, multiple clients and cache eviction/restart remain open.

Attempt 01 stopped on background requests rejected by the offline transport,
after four Electron sessions and the first Chromium behavior assertions. Attempt
02 explicitly classifies the existing Google background rejection allowlist;
unknown faults still fail. It completed in 27.831 seconds (invocation bracket,
not decision latency or owner attention). Both attempts are archived, including
their faults. Final profiles and fixture keys were removed.

`inventory.json` records archive and member hashes; archives were reopened and
verified. `report.json` is the final report. The final runner's source hash matches
the current runner. The failed attempt predates the background-fault classification;
its report retains its distinct source hash, not a claimed source snapshot.

Recheck extracted final evidence with:

```sh
node experiments/chromium-extension-spike/fixtures/replay/synthetic/service-lifecycle-verify.mjs /path/to/extracted/final-run
```

Verification: eight raw-record checks pass; prototype JS lint passes across 57
files, zero errors/warnings. No upstream patch delta; latency remains deferred.
