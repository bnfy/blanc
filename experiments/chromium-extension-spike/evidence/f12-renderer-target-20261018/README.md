# Renderer document-token guard — October 18, 2026

The browser verifies the requested extension API document ID, retrieves that
active document's Blink token and carries it through ExecuteCodeParams. The
renderer checks the actual WebDocument token at eligibility and immediately
before execution after permission replies for the experimental component.

## Measured results

- `renderer03/report.json`: eight passing cases. Three diagnostic token
  mismatches at document_start/end/idle each deny while matching tokens execute;
  the legacy unconstrained control executes. Deferred document_end release works.
  Same-URL, cross-path and cross-origin replacements have different browser IDs
  and untouched replacement DOM while the old queued call settles as `[null]`.
- `target/report.json`: eleven browser-target regressions pass.
- `helpers/report.json`: six logger/noscript/picker regressions pass.
- `ordering/report.json`: four native/upstream completion schedules pass.
- 281 unit tests, 135 module lint checks; five new verifier tests reject missing
  coverage, absent positive controls, wrong identity, changed DOM and fixture
  faults. Four independent report verifiers pass again from the extracted archive.
- Two incremental builds: 162.37 s wrapper / 158.51 s Siso / 251 steps, then
  34.30 s wrapper / 29.69 s Siso / six steps to restrict the permission-reply
  recheck to the experimental component. Initial plan 89 actions; generated IPC
  dependencies expanded and pruned it. No cold output or changed GN args/toolchain.
- Final guard zero actions, repeated after idempotent preparation (4.30 s).
  Preparation preserves bytes of all 40 inventoried existing files plus the new
  Blanc-owned header. Footprint **40 files / 91 hunks**, at the file ceiling.

## Failures and limits

`renderer01` and `renderer02` are failed harness attempts, not passes. They
incorrectly expected an error or empty array when Chromium actually returns
`[null]` on this queued teardown path. Attempt 02 records the raw result; attempt
01 failed before retaining that case. Final source requires replacement document
identity, untouched DOM and a non-positive callback. It does not prove that the
old document never began execution. Logs/reports for both failures are retained;
archived harness source is the final version, not the overwritten earlier versions.

The three mismatch denials use the explicit browser-only
`--blanc-renderer-token-mismatch-probe` switch, exact component identity and exact
source prefix. It only corrupts a present token; it cannot relax the check.
This is fault injection, not an observation of a naturally occurring IPC race.
Real queued navigation is measured separately. Permission-dialog timing,
BFCache/prerender, crash/renderer lifecycle, caller identity before the browser
snapshot and asynchronous effects remain unqualified. Full corpus/parity and
component containment were not rerun or promoted to acceptance.

Latency stays deferred. Electron diagnostic build §8 remains unapproved and
unstarted. Existing 156 and permanent profiles/tabs were not used. Test profiles
and fixture certificate keys were deleted by each runner.

## Contents

`record.tar.gz`: 108 hashed members, including failed/final reports, source audit,
final native patch, invocation records/build logs, budget inventory, final harness
sources and generated payload deltas against the pinned uBO inventory (GPL license
included). `inventory.json` lists member and payload hashes. `binary-hashes.json`
identifies the final tested executable/framework. `archive-verification.json`
records all four proofs rerun from extracted sources/reports. These are bounded
synthetic tests, not native physical-input or performance qualification.
