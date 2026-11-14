# Shared-worker ownership and initial service-script correlation

October 17, 2026. Owner request: continue the two worker gaps, incremental builds
only, latency deferred. The earlier explicit worker-context approval still applies.
This checkpoint changes only experiment harness/correlation code, not the blocker,
engine inputs, Chromium patches or production Electron code.

## Measured result

All ten authored path cases pass without decision/context differences or gaps in
**each measured variant**: default (page outside service scope), controlled-client
(page inside service scope), and no-referrer. Each uses two fresh Electron and two
fresh Chromium runs in each of regular/private profiles: **24 final browser runs**.
The initial service script and six shared subrequests now correlate. Service imports,
message-triggered fetches and redirects retain their earlier bounded pass.

- [Default comparison](paths-04-comparison.json), [run report](paths-04-report.json)
- [Controlled comparison](controlled-05-comparison.json), [run report](controlled-05-report.json)
- [No-referrer comparison](no-referrer-06-comparison.json), [run report](no-referrer-06-report.json)

These are **synthetic fixture parity** results, not general worker acceptance or
a real-web blocking rate. `acceptance`/`fullAcceptance` remain false. Report `passed`
means the harness completed its protocol; individual comparison statuses decide
coverage. In particular, earlier attempts completed with shared-client gaps.
The full 5,123-candidate corpus is the preceding checkpoint's result, not rerun here.

## Shared-client proof

A page-side observer wraps the actual SharedWorker constructor, preserves its
arguments/result, and sends a random challenge over the returned MessagePort.
The authored worker installs a connection observer before its probe handler.
It witnesses the actual `connect` event/port, receives that challenge on the same
port, and emits observations through an independently attached Runtime binding.
The authored worker waits for this binding before issuing its imports/fetches.
Both runtimes execute identical fixture bytes. This changes scheduling: **it is
not latency instrumentation and is never enabled by the latency runner**.

The comparator requires one worker realm and the directly observed page/default
realm, matching peer challenges, all observed connections accounted for, agent
readiness before the request, and no port close, pagehide or realm destruction
through the request and completed handshake. It rejects missing/duplicate evidence,
unmatched constructions/connections, unknown page targets and opaque origins.
Nonce, port and process IDs are archived proof only. Compared client members
contain role, independently observed origin and port count. No fixture owner,
worker URL/name, active tab, referrer or partition origin supplies ownership.

The bound is **one live observed document**. This is not a general browser client
registry. Multi-document clients, transferred or garbage-collected ports, unknown
realms, teardown and rapid lifecycle transitions remain gaps. Unit rejection tests
cover malformed/missing evidence; they do not substitute for those runtime cases.

## Initial service-script proof

Pinned Chromium source at `41520584daa68d0040db7746ae562a0ff82187f6`:

- `content/browser/service_worker/service_worker_new_script_fetcher.cc:121`
  calls the main-script DevTools instrumentation before starting the loader.
- `content/browser/devtools/devtools_instrumentation.cc:2781`
  `OnServiceWorkerMainScriptRequestWillBeSent` obtains the new installing worker
  and uses its DevTools token as the request ID; `MaybeAssignResourceRequestId`
  at 2749 stores it when an enabled Network handler exists.
- `content/browser/devtools/protocol/network_handler.cc:3312` `RequestSent`
  serializes the passed headers. The caller passes `request.headers`, not the
  separate `ResourceRequest.referrer`.

The native diagnostic already records that real ID, so its initial script joins
exactly to the worker target even without a target Network event. Electron has a
unique target-scoped Network event whose request ID is that target token; its
actual hook record joins by URL/method/type and bounded wall time. The omitted
CDP referrer header is not compared for this special join. **Actual hook referrers
still compare between browsers**, including empty in the no-referrer variant.
The initiator remains present there, independently of referrer policy.

The proof also requires the same profile, one new version observed starting with
no controlled clients before installation, an initial hop, and one later worker
realm. Context explicitly says `phase: initial-script-fetch` and clients
`not-applicable-before-installation`. It does not turn the registration page into
an invented worker top frame. Failed/blocked scripts without a realm, updates,
installed versions and ambiguous correlations remain gaps.

## Attempts and correction

| Invocation | Wall seconds | Result |
| --- | ---: | --- |
| paths-01 | 25.552 | Initial script correlates; shared agent not installed, shared gaps retained |
| paths-02 | 20.700 | Explicit first-line breakpoint requested; no pause observed, shared gaps retained |
| paths-03 | 21.172 | Authored readiness gate and port observations; all measured cases pass |
| paths-04 | 21.028 | Final stricter realm/initial-hop checks; default final pass |
| controlled-05 | 21.371 | Final controlled-client pass |
| no-referrer-06 | 51.223 | Final no-referrer pass |

Correction to the a97cec27 prose: requesting a debugger breakpoint did **not** prove
it fired or caused the observed import coverage. Neither exploratory attempt here
recorded a pause. Playwright has its own worker attach/resume handling, but these
runs do not establish that as the sole cause. The debugger barrier is removed.
Current acceptance requires actual agent readiness and MessagePort observations.
Historical logs and gaps are retained rather than rewritten as passes.

## Validation and evidence integrity

- **122 focused tests pass**, including 18 new correlation/ownership tests;
  **52-file lint: zero errors/warnings**.
- **Zero native builds**, no prepare/GN/environment recording, no changed native
  source or engine bytes. [Fingerprints](fingerprints.json) equal a97cec27's binary,
  args and native sources. Its measured footprint was 25 upstream files / 62 hunks;
  this checkpoint adds zero upstream changes (no fresh dependency inventory claim).
- [Inventory](inventory.json): 11 hash-verified archives, 223 files. Each archive
  was reopened and every member digest checked. No private key blocks included.
- `capture-source.tar.gz` holds the final modules; their hashes match all three
  final reports. `paths-01-source` and `paths-03-source` match their reports too.
  **`paths-02-source` is partial historical fidelity:** two helper snapshots were
  copied after later edits and do not match that exploratory report. The exact
  mismatch is retained in [snapshot verification](snapshot-verification.json);
  it is not represented as an exact source reconstruction or acceptance evidence.
- `checks.tar.gz` contains every timed invocation, test/lint logs, snapshots check
  and fingerprints. Raw run archives preserve both repetitions, hook decisions,
  CDP observations, arrivals, DOM results, fixtures and comparison output.
- Every run reports disposable profile/certificate cleanup. The final
  [process check](process-check.json) found no owned probe or native build.
  The preserved 156 checkout, permanent profile and original tabs were not used.

## Still open

Multiple shared clients/owners, transferred ports and teardown; service updates,
failed startup without a realm, controlled-client fetch events and cache-only
behavior; opaque/subframes; non-GET/header-changing redirects and replacement URLs;
other request paths, cosmetic/scriptlet delivery and broader corpus cells.
**Latency remains deferred**, with no system-process pause or password prompt.
Task 0's extension upgrade gate and 156 baseline are unchanged. No promotion.
