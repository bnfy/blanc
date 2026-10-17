# Worker context investigation and stopped idle attempt — October 17, 2026

**Outcome: partial; shared/service-worker context and formal idle latency remain
open.** This checkpoint does not promote the 157 baseline or pass Spike A.

## Native change

The hook snapshots the actual RenderFrameHost context at request entry, before
an asynchronous engine decision can outlive the frame. Main-frame navigation
still uses the actual hop URL. Raw diagnostic fields distinguish live-at-entry,
not-associated and gone-at-entry, identify worker factory kinds, and record
factory and trusted-request isolation origins separately.

[Source audit](context-audit.md) explains why a matching partition origin is not
proof of an exact client origin. Shared-worker and service-worker request hooks
can intentionally have no associated frame; a worker may have no single client.
Electron's hook also lacks the independently correlated frame/owner data needed
by the current strict contract. No visible-tab, referrer, partition-origin or
fixture-intent substitution is used. The comparator retains both sides' values
and tests reject substitution and one-sided native enrichment. No forced owner
teardown race was injected; that remains a gap.

## Verification

The bounded GET redirect and dedicated-worker probes pass in both profiles, twice
per runtime. Shared/service-worker blocking and loading behavior matches, but
six shared and seven service observations per profile retain unresolved context;
those cases remain **gap**, not admitted parity. Native diagnostics show shared
and service fetches with no associated frame even when factory isolation has an
origin; service-script isolation can instead appear only on the trusted request.
Missing/tampered bundle and utility termination probes remain fail closed.
Full corpus: two fresh regular and two fresh private replays each pass all
5,123 candidates (2,503 blocked / 2,620 allowed), with zero decision or context
differences and verified response/DOM/child outcomes. No-referrer controls also
pass all four runs, 24 candidates each (9 blocked / 15 allowed).
86 focused tests pass; 44-file lint has zero errors/warnings.

## Incremental build and footprint

Two planned actions, seven executed steps; **41.38 s Siso / 46.861 s wrapper**.
The final guarded check reports zero actions. No GN regeneration, args, toolchain,
environment record or cold-output change. Footprint remains **25 upstream files /
62 hunks**, within the approved 40/120 budget; 151 Git dependencies clean at pins.
This is routine tranche-2 effort, never Task 0 cold-build time. Runtime brackets
are not owner-attention or agent-time measurements.

[Fingerprints](fingerprints.json) bind the prepared sources and framework. Engine
SHA256 stays `9acdfb68963e89c9c9be04a1a68ae831c7c35b800555790cadc8575a7172382d`;
framework is `cd2c82ffc369dca6eb7c961b30952f4ae7126d7ce08f4d151679736e40a7cf34`.

## Idle attempt — no timing result

The owner authorized temporarily pausing Spotlight and the Logitech updater and
restoring them afterward. Spotlight was paused and restored, with PID/start-time
identity checks and a detached 30-minute restoration watchdog. The updater is
root-owned; signaling was refused, and passwordless sudo was unavailable. It was
never paused. The records retain that distinction.

`--require-idle` adds an initial quiet check and stops before a repetition if its
five baseline samples never reach 90%. The preflight reached **92.19% idle**, but
the first Electron regular warm-up baseline was **86.11–89.90%**. The harness
stopped before measuring any repetition, retained the failed attempt, and removed
its disposable profile/certificates. No percentile, formal timing pass or updated
latency estimate is claimed for this framework. A separate Chromium-only attempt
then reached 93.78% idle at preflight but only 71.86–89.78% before its first
regular warm-up, so it also stopped with zero measured repetitions. Its profile
and keys were removed and Spotlight was restored again. Both attempts are
retained separately; none is silently discarded. The earlier aa26d71a timings stay
historical measurements on a busy machine. Further pause requires administrator
authentication; no password is collected by the harness.

## Evidence and remaining work

Seven lossless archives retain 76 original files (2,305,186 compressed bytes).
[inventory.json](inventory.json) records each archive and original-file SHA256;
packaging reopens every archive and verifies each original byte sequence. Original
commands, source audit, build/check logs, observations, comparisons, pause/restore
records and the stopped latency report are retained. No private keys or permanent
profile data are archived. The engine bundle itself is unchanged and retained in
the earlier [CodeQL evidence](../f12-codeql-20261017/README.md).

Next: independently correlate worker requests and client lifecycle on both
runtimes, explicitly modeling ambiguous/no-client execution rather than relaxing
unresolved fields; rerun the complete latency protocol under the required idle
condition. Owner teardown, shared ownership, SW controlled fetch/cache and updates,
subframes/opaque origins, keepalive/speculation, WS/WT interception, cosmetics,
procedural rules/scriptlets and the private real-page sample remain gaps.
The 156 checkout, permanent profile/tabs, Task 0 cold column and upgrade gate are
unchanged. This is synthetic fixture evidence only, not a real-web blocking rate.
