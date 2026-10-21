# Explicit worker contexts — October 17, 2026

**Partial result: six service-worker subrequests per profile and fixture variant
now have matching independently observed worker contexts. Shared-worker client
ownership and the initial service-worker script request remain gaps.** No full
Spike A acceptance, real-web blocking rate, latency qualification or 157 promotion.

## Approval and comparison contract

The owner approved **“Yes—use explicit worker contexts with strict evidence”**
for requests with no unique document frame. The full question and approval are
recorded in [the contract](../../fixtures/replay/README.md#approved-explicit-worker-context-branch--october-17-2026).
The typed context contains worker kind/script/realm/profile, `documentFrame:
not-associated`, and an explicitly typed observed client set. Missing evidence
never becomes an empty set or a visible-tab/storage-partition origin.

Independent worker-target Network/Runtime streams are collected in both actual
runtimes. Chromium's hook now records its DevTools request ID (the only native
change); Electron joins its different IDs by a unique observed URL plus
method/referrer and a two-second wall-time bound. Actual hook types, initiator,
referrer, profile, hops and decisions still compare exactly. Native redirects
blocked before renderer delivery join only through the same logged ID and
contiguous allowed predecessor hops, not a fixture's expected redirect graph.

ServiceWorker lifecycle events identify the worker version and controlled clients.
Nearest snapshots before and after the request must agree; a final snapshot is
required. Worker realm and observed page origin come from Runtime events.
Controlled documents are not all message senders, shared-worker connected
clients, or an invented top frame. Lifecycle brackets are observational; rapid
multi-client transitions and teardown have not been exercised. Raw hook top-frame
fields remain unresolved, and no engine input is replaced by sidecar context.

## Browser results

`paths-06` (25.791 s) and `controlled-07` (21.366 s) each contain eight fresh
runs: Electron/Chromium × regular/private × two repetitions. Both final variants
are valid and stable with zero failed cases. Profiles and temporary certificate
keys were removed. `acceptance` and `fullAcceptance` remain false.

| Observation | Outside service-worker scope | Page inside service-worker scope |
| --- | --- | --- |
| Allowed and blocked service imports | Independently observed empty controlled-client set | Independently observed empty set before installation |
| Allowed/blocked service fetch and allow-to-block redirect | Empty controlled-client set | One directly observed controlled page, same origin in both runtimes |
| Initial service-worker script | Gap: no complete independent request correlation | Same gap |
| Six shared-worker subrequests | Worker identities observed; connected-client set unobserved, gap | Same gap |

Both profiles match all six service subrequests in each variant. GET navigation,
fetch/script redirects and live-owner dedicated-worker regressions also pass.
These are bounded authored probes, not 48 additional distinct corpus candidates.
The full 5,123-candidate corpus was last replayed at 3ca65a11; this checkpoint
reruns the worker/path probes, not that corpus or the fail-closed suite.

## Attempts and instrumentation limits

- `probe-01`/`probe-02` are exploratory. Probe 01's auxiliary CDP files were
  overwritten by probe 02; its hook/case/fixture records remain. They are not
  presented as final acceptance evidence. Probe 02 CDP files and observer source
  are in `checks.tar.gz`.
- `paths-03` was re-compared during correlation repairs; its original comparison
  file was overwritten. Recomparison logs remain. It is exploratory only.
- `paths-04` is retained **invalid**: one private Chromium repetition lacked the
  first shared-worker import Network event. The strict stability check caught it.
- `controlled-05` passed the bounded comparison before the event barrier fix.
- The final observer pauses each new worker at its first script, enables Network
  again once its renderer is ready, then resumes. This eliminated the observed
  first-import loss in `paths-06`/`controlled-07`. This changes scheduling and is
  **never used for latency**. The default shared session has observation disabled.
- Final comparison replay retains the raw run files and produces separate
  summaries. Its first assertion attempt compared in-memory `undefined` fields
  against JSON (which omits them); the corrected JSON-to-JSON assertion passes
  unchanged results. Both attempt logs are retained.

Exact capture-time module snapshots are hash-verified against final run manifests
and archived in `checks.tar.gz/capture-source`. The final comparator changes only
its scope description, and the correlator only a comment, after capture; saved
observations re-compare identically. No favorable subset or failed attempt was
silently discarded.

## Build, checks and footprint

One guarded incremental build: **one planned action, six executed steps,
30.65 s Siso / 36.441 s wrapper**. Final guarded plan: zero actions. No GN, args,
toolchain, environment record, cold output or large-build override change.
Budget remains **25 upstream files / 62 hunks**, with 151 dependency repositories
clean at their pins, within 40/120. This is routine tranche-2 work, never Task 0
cold-build time. Runtime brackets are not owner-attention or agent-time measures.

104 focused tests pass; 47-file lint has zero errors/warnings. One test invocation
was blocked by sandbox loopback `listen EPERM`; the same suite passes with local
fixture-server access. Both logs are archived. Framework/args/native-source and
unchanged engine hashes are in [fingerprints.json](fingerprints.json).

Eight lossless archives preserve 129 original files, 371,099 compressed bytes.
[inventory.json](inventory.json) records archive and per-file SHA256; every archive
was reopened and each member's bytes verified. No private keys or permanent
profile data are included. The fixture licence remains in [NOTICE](NOTICE).

## Remaining gaps and next step

Shared-worker connected-client lifecycle is not exposed by this CDP observer.
Chromium's native SharedWorkerService observer exposes clients, but implementing
only that side would still leave Electron uncorrelated. A matching independent
Electron observation surface is needed before admitting these requests. The
initial service-worker script also needs its own independently observed native
request join; script URL alone is not sufficient.

Multi-client/owner teardown, service-worker fetch events/cache and updates,
subframes/opaque origins, keepalive/speculation, WS/WT, broader rule/context
coverage, cosmetics/procedural rules/scriptlets and the private sanity sample
remain open. **Latency is deferred at the owner's request.** No process pause,
authentication dialog or latency run occurred. The previous authentication
question is no longer pending. The preserved 156 build, permanent profiles/tabs,
Task 0 cold column and extension-upgrade gate are unchanged.
