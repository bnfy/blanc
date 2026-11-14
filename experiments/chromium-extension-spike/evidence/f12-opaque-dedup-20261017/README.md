
# Opaque about selection and inherited deduplication — October 17, 2026

This directory is the bounded checkpoint, not full Spike A/B acceptance.
Browser-side selection now admits exact committed about:blank/srcdoc with a
browser-recorded tuple/precursor matching the actual non-opaque HTTP(S) parent.
The precursor selects rules only; opaque origin stays `null` and is never used
as a same-origin grant or a replacement network observation. Unknown precursor,
opaque parent and unsupported URLs remain outside this bounded gate.

The generated uBO payload wraps both its exported native main-world body and
its extension insertion body with one per-payload random, per-realm once marker.
The marker is non-enumerable/non-configurable/non-writable after installation.
It is duplicate prevention, not an authorization boundary against page code.
Exceptions that select no payload set no marker; a throwing body is not retried.
New documents have independent markers. In-place filter-generation semantics
and arbitrary scriptlets remain broader coverage work.

Eight fresh sessions repeat 56 frame cases: **42 scoped passes / 14 gaps**.
Native regular early checks now pass 10/10 (HTTP, sandbox HTTP, inherited srcdoc,
blank, opaque srcdoc, each twice). All 24 private cancellation observations
still pass; uBO remains disabled there. Two native data cases and twelve Electron
early cases remain gaps. Eight no-script cases are sandbox enforcement only.

Four inherited repeat-delivery cases, across two fresh document cycles, show
one body execution with 4–5 attempts after two deliberate extension deliveries.
The test explicitly resets upstream's isolated injection sentinel to force the
late main-world path; it does not pretend these deliveries occurred naturally.
Two opaque srcdoc cases pass early checks but extension late delivery cannot be
observed, so their repeat-delivery scope remains a gap. Independent verification
rejects missing attempts, duplicate bodies and opaque-origin substitution.

Boundary run records blob, data and nested-opaque early gaps, plus one passing
opaque-srcdoc exception. Seven existing gate-safety and six inherited
normal/exception/restoration checks pass; a separate observer/counter-free
payload repeats the six inherited checks. Full 5,123-network parity and complete
previous ancestor matrices were not rerun and remain historical.

One guarded incremental build: **34.24 s wrapper / 30.61 s Siso, six steps**,
from a one-action plan. Final guard zero; fresh footprint **31 files / 74 hunks**.
**195 focused tests / 102-file lint pass**. First lint found one harness global
reference and was corrected. Two excluded dedup probes are retained: first
never forced late delivery past upstream's isolated marker; second overclaimed
opaque extension reachability and stopped. Neither is counted as acceptance.
Disposable profiles/fixture CA keys/runtime processes were removed.

Latency remains deferred, including gate and marker overhead. Electron early
behavior and independent update-loader identity remain open; its diagnostic
build request §8 is unchecked and no checkout/build started. Broader lifecycle,
CSP/opaque/fenced contexts, arbitrary scriptlets, component containment and
plan items 3–6 remain open. Task0 and the156 baseline are unchanged.


## Evidence and reproduction

`archives.json` lists each archive and every member's SHA-256. Runtime includes
all three dedup attempts, boundary observations, the eight-session matrix and
three safety runs. Sources include exact harness/native inputs; payload archive
includes generated modified/additional files, the unchanged upstream pin/license
and full per-file inventories for both payloads. No real-page data or fixture
private keys are included. Build/check logs, invocation costs and binary hashes
are separate. Origins and uBO rule selection were not rewritten in observations.

After extracting runtime.tar.gz into a fresh directory:

```sh
node experiments/chromium-extension-spike/fixtures/replay/synthetic/opaque-frame-verify.mjs EXTRACTED/frames --inherited --opaque-about
node experiments/chromium-extension-spike/fixtures/replay/synthetic/scriptlet-dedup-verify.mjs EXTRACTED/dedup03/report.json
```

The raw boundary report has three explicit gaps and one exception pass. Safety
reports require completed=true, cleanup.removed=true and six/seven successful
checks. Failed attempts are excluded. Reproduction needs the recorded native
binary and pinned payload; verification of archived observations does not.
The precursor API's caution is recorded from pinned url/origin.h: selecting
restrictions here must not become an inherited privilege or origin substitution.
