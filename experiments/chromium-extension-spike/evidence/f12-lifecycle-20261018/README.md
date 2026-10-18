## BFCache, prerender and renderer crash coverage — October 18, 2026

This checkpoint changes only disposable offline harnesses. The native renderer
document-token guard and binary are unchanged. Lifecycle06 proves a real BFCache
restore (persisted pageshow, same document ID and page-instance nonce, preserved
marker), rejection while that document is cached, and successful exact targeting
after restore. A queued document_end injection is pending before an actual
renderer crash; its callback fails. Browser API recovery creates a different
document, whose marker remains untouched; the stale ID is refused and the new
ID succeeds. These are bounded regular main-frame cases, not all lifecycle or
asynchronous-side-effect acceptance.

The lifecycle probe removes Playwright's default BFCache-disable switch only for
this test. Pinned uBO disables preloading by default; the first prerender attempt
observed PreloadingDisabled. Later conditional probes enable browser prediction
only in disposable profiles and record both settings. Playwright-attached probes
do not prove prerender activation; ordinary navigation is explicitly a gap.

Earlier attempts are retained: DOMContentLoaded was an invalid restore wait;
Playwright commands failed after an intentional crash; direct frame debugging
suppressed prerender; and an isolated-world recovery observer incorrectly read a
main-world variable. Lifecycle06 reads authored DOM data and passes the two scoped
cells. These harness failures are not counted as product passes. Raw-launch attempt
01 also failed because the component manifest argument lacked the established
ASCII escaping; its fatal startup and cleanup are retained.

287 tests pass; final guard zero actions, no compile. Measured footprint remains
40 upstream files / 91 hunks (40-file ceiling). Latency remains deferred and the
Electron instrumentation build remains unapproved/unstarted. Original caller
identity, subframe/multi-document lifecycle, permission replies, and asynchronous
scriptlet effects remain gaps; no full acceptance or baseline promotion.

The raw background-only probe also reached configured preloading but observed no
prerender target within its 15-second bound. Its cause is unresolved; this result
cannot be attributed solely to Playwright and is not a prerender acceptance pass.
Raw attempts 02/03 lost their popup observer during startup; attempt04 uses the
surviving background only. All four failed raw attempts are archived and cleaned.
139 module lint checks pass. Binary hashes and the ordinary component inventory
match the prior renderer-token checkpoint. Guard duration 3.65 s; fresh budget
scan 45.76 s. These are test/tooling costs, not compilation or latency measurements.
Evidence: `evidence/f12-lifecycle-20261018/`. Full network parity was not rerun.

### Archive and reproduction

`record.tar.gz` contains 48 hash-verified members: six lifecycle attempts, four
raw prerender attempts, invocation records, checks, final harness sources and a
through-attempt05 source snapshot. The archive inventory names every member.
Earlier raw harness revisions are not fully snapshotted; their reports/logs are
retained. This limits exact reproduction of those failed attempts.

`binary-hashes.json` verifies the executable/framework are unchanged from
`f12-renderer-target-20261018`; `payload-reference.json` verifies every ordinary
component file against that checkpoint's archive and pin/delta inventory.
No profiles or certificate private keys are included. Every attempt report records
owned profile/key cleanup. The extracted lifecycle verifier passes against
`lifecycle06/report.json`; its negative-proof tests reject false restore, ordinary
navigation, absent crash evidence and missing named gaps.

Run the final harnesses with the recorded config, verified ordinary component,
and a new evidence directory. They require an unlocked native Chromium environment
and loopback permissions. They do not compile or run latency tests.
