## Chromium 158 measured update and owner confirmation

The owner directly confirmed **no hands-on work outside this chat and no new paid runner, service, or hardware charge** for this rebase. The durable staging-to-successful-build window was **14,792.704 seconds (4h06m32.704s)**; six build wrappers account for **10,380.131 seconds (2h53m00.131s)** inside it. These are elapsed/machine measurements, not active labor. [Receipt and confirmation](evidence/l12-cost-reconciliation-20261028/chromium158-observed-window.json).

The 158 candidate subsequently passed 75 native affected checks and 11 signed checks, Apple notarization, manifest authentication and local archive readback. The earlier statement that real-keychain qualification remained unresolved is superseded. No new purchased resource was needed. Existing hardware/power and signing renewal allocations remain unpriced; do not call total operations free. Chat approval time was not separately timed. The original staffing sheet asks for measurements where available; distinguish missing allocations from a newly incurred cash charge.

# Decision 2 — staffing and CI cost sheet

Updated October 28, 2026. Planning sheet, not a budget approval. See the [bounded operating proposal](decision2-operating-proposal-20261026.md) and [completed CI/usage evidence](evidence/decision2-operations-20261026/README.md). Source: [measured rebase ledger](rebase-ledger.md) and dated evidence in the [primary plan](../../docs/chromium-migration-implementation-plan-2026-10-16.md).

| Cost item | Evidence / proposed commitment |
| --- | --- |
| One measured cold build | 9,587.120 s (2h39m47.120s), accumulated across two invocations; 57,664 reported steps. Mixed repair/unfinished-cold work is included, not counted again as incremental. |
| Rebase friction | One broken anchor, one API change; 21 upstream files at the historical rebase. Current signed procedural footprint is79files/189hunks ([recorded evidence](evidence/f12-procedural-prerequisite-20261028/README.md)), so this is not a measured rebase of today's larger patch set. |
| Human effort | Owner attention and agent editing time were not measured. Cannot establish the two-owner-day kill threshold from build logs. Next deliberate rebase records active attention separately. |
| Incremental development | Recent private-only prefetch fixture builds recorded 38.82/40.13 s, then zero-action guard. Illustrative local runs only; no routine rebase or fleet estimate. |
| CI compute/storage | Verified public repository and standard hosted labels; GitHub policy makes this compute free. Four completed exact-head workflows:26non-skipped jobs,69m16s summed job intervals, zero uploaded Actions artifacts. This is not an invoice or $0-total-cost claim. Account-wide cache/storage, signing, hardware/power and owner time remain unpriced; see [evidence](evidence/decision2-operations-20261026/README.md). |
| Maintenance proposal | Owner-approved October22: Anthony Loria as sole maintainer; suspend distribution when he cannot review security updates. This supersedes the draft independent-backup requirement. Review upstream security notices each working day; block distribution of a known vulnerable candidate until fixed or withdrawn. Confirm capacity for milestone rebases and urgent security updates explicitly. |
| Release operations | Reserve operator availability for signing/notarization, clean-Mac acceptance, update/rollback rehearsal and incident withdrawal. Anthony Loria is the named sole maintainer; L3/L8/L9 acceptance is already recorded. Final release approval remains separate. |
| Capacity decision | Owner must accept measured limitations and staffing commitment or reject expansion. Calendar estimates in the original plan are not a release ETA. |

No paid service, runner, release or staffing commitment is made here. Loaded-host timing is measured but does not satisfy the original idle condition; Electron work remains paused. Proposed maintenance policy is reviewable now; actual cost acceptance remains open.

## October 28 current workload

[Original-criteria follow-up](evidence/l12-original-criteria-20261028/README.md) records20completed jobs on8c0fcb75 totaling67m02s, with six macOS jobs still queued and two skipped. This is an incomplete lower bound, not owner attention or a bill. All four current run artifact totals are zero; public-standard-runner compute policy was rechecked. Account-wide storage and hardware/signing/time allocations remain unknown. The owner rejected the qualified closeout; original unmet criteria remain.

## Decision inputs still needed

| Field | Value at this checkpoint |
| --- | --- |
| Maximum monthly out-of-pocket build/signing spend | Unspecified; [existing-hardware/no-new-service proposal prepared](decision2-operating-proposal-20261026.md). Public standard CI compute eligibility verified; no new expenditure authorized |
| Maximum owner-attention hours per rebase | Unspecified; measure at next necessary update. Original two-owner-day stop rule remains intact |
| Actual prior operator time | Not measured; cannot reconstruct honestly from task duration |
| Actual provider bill / allocated charges | Not supplied; completed-run timing is not a bill |
| Prospective measurement | On the next deliberate update, record active operator start/stop intervals, build wall time separately, failures/rework and attributable charges |

A ceiling is a budget decision, not evidence that the current implementation fits it. Preserve local hardware/cache investment as an unpriced existing resource; do not invent amortization, power or signing charges. No new build or repeat rebase is proposed merely to fill these fields.

### Owner response and conservative proposal

The owner could not reasonably supply cash/hour limits without a quantified workload. Do not ask again for a guess. The [operating proposal](decision2-operating-proposal-20261026.md) is now concrete: existing Macs/signing, current standard public CI, no new paid services, affected-only checks and prospective active-time/cash recording on the next necessary update. It retains the primary plan stop rules. Actual operator hours and remaining cash allocations are unknown, so affordability and cost/capacity acceptance remain open. No new benchmark/rebase is authorized merely to collect these numbers.

## Reconciliation of available measurements

[October28 cost reconciliation](evidence/l12-cost-reconciliation-20261028/README.md) independently recomputes the retained CI intervals and separates historical cold-build work from unmeasured active effort. Machine time is not labor. The machine-readable worksheet keeps unavailable costs null and identifies the specific source required for each; no invented total or gate credit.

[Actual-record search and verified158 scope](evidence/l12-cost-reconciliation-20261028/search-and-rebase-scope.md): no attributable invoices recovered; unrelated cloud charges excluded. Official158.0.8127.2 tag verified at681cd621e82e606d7536eae8ea2576afb3c7d65c. The genuine major-version update finished compiling in the separate durable workspace, with a zero-action guard. Owner approved the 57,943-action dry run, eight workers and subsequent live-scope expansion. All six build wrappers are terminal: five encountered preserved narrow failures, and the sixth succeeded. Their accumulated wall time is 10,380.131 seconds (2h53m00.131s). This excludes dependency/source preparation, isolated repair compilations and qualification; it is neither total rebase elapsed time nor active owner effort. [Attempt accounting](evidence/chromium158-staging-20261028/build-attempt-accounting.json) preserves receipt hashes and measurement limits. This is machine time, not owner effort. The later signed qualification passed; see the current measured-update section above.
