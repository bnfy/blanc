# Shared-worker multiple clients and owner teardown

This October 17 checkpoint covers the requested next shared-worker cases. It is
harness-only: no Chromium native source, Electron production source, GN args,
toolchain, output directory, blocker engine input, or permanent profile changed.

## Result

`lifecycle-04` passes in both regular and private profiles:

- two separately observed same-origin document targets connect to one shared
  worker through two distinct MessagePorts and challenge responses;
- the multi-client phase reports two live documents and two live ports;
- one exact owner document navigates to `about:blank`, and independent Runtime
  realm-destruction evidence is observed before the next worker request;
- the teardown phase reports one live document and port plus one ended document;
- unique allow, block, and allow-to-block redirect requests agree between
  Electron and Chromium in both phases; and
- two repetitions per runtime and profile pass: eight sessions and sixteen
  document instances in the final comparison.

The prior ten-case authored request-path regression also passes twice per
runtime/profile after these harness changes.

## Evidence contract

Client ownership requires both an actual MessagePort challenge and an
independently observed document target/default realm. Every observed port
construction must be accounted for. An owner is removed only after destruction
of that exact realm or detachment of that exact target. `pagehide`, a port-close
message, a storage-partition origin, or a visible-tab guess is insufficient.

The compared contract uses worker role, origin, document count, port count, and
ended-document count. DevTools target, session, execution-context, and challenge
identifiers are proof material only and are not compared across runtimes.

The first shared-worker script can nondeterministically be initiated by either
same-origin client. That one-time script referrer is excluded from repetition
stability; all transport faults, decisions, phase requests, and bounded worker
contexts remain strictly checked.

## Attempts and validation

| Invocation | Seconds | Outcome |
| --- | ---: | --- |
| `lifecycle-01` | 17.774 | Retained failed attempt: target close produced detach evidence, but the over-strict harness waited for a pagehide binding and never issued teardown requests. |
| `lifecycle-02` | 16.975 | Retained failed attempt: navigation produced realm destruction, but the same over-strict pagehide wait stopped the run. |
| `lifecycle-03` | 23.970 | Both phases passed individually; repetition stability incorrectly compared the nondeterministic one-time worker-script referrer. Not acceptance evidence. |
| `lifecycle-04` | 20.307 | Final pass in regular/private profiles, twice per runtime. |
| `path-regression-05` | 20.647 | Existing ten authored path cases pass after the lifecycle changes. |
| guarded `build.mjs --check` | 5.686 | Zero scheduled actions. No compilation was needed. |

The focused suite passes 127 tests with zero failures or skips. The first
sandboxed test invocation was retained after loopback failed with `EPERM`; the
same command outside that sandbox passed. ESLint is clean across 55 files.
Disposable profiles, certificates, and owned probe processes were removed. The
pre-existing Task 0 prototype and profile remained open and untouched.

The seven archives retain 63 files. The inventory is content-hashed and each
archive was reopened and verified. `capture-source.tar.gz` preserves the exact
final harness modules. No private key material is included.

## Remaining gaps

This closes the bounded two-client and navigation-driven exact-owner teardown
cases only. Remaining gaps include more than two owners, embedded/top-site
combinations, explicit port transfer/close and garbage collection, target/window
closure followed by later worker requests, in-flight teardown races, opaque or
subframe owners, rapid reconnect, worker termination/recreation, and the broader
service-worker update/fetch/cache matrix.

Formal latency testing remains deferred by the owner. Invocation durations in
this record are not blocker decision-latency measurements.
