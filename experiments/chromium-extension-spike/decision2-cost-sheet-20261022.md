# Decision 2 — staffing and CI cost sheet

October 22, 2026. Planning sheet, not a budget approval. Source: [measured rebase ledger](rebase-ledger.md) and dated evidence in the [primary plan](../../docs/chromium-migration-implementation-plan-2026-10-16.md).

| Cost item | Evidence / proposed commitment |
| --- | --- |
| One measured cold build | 9,587.120 s (2h39m47.120s), accumulated across two invocations; 57,664 reported steps. Mixed repair/unfinished-cold work is included, not counted again as incremental. |
| Rebase friction | One broken anchor, one API change; 21 upstream files at the historical rebase. Latest recorded certificate-replacement footprint is73files/179hunks ([evidence](evidence/l11-repair-20261023/README.md)), so this is not a measured rebase of today's larger patch set. |
| Human effort | Owner attention and agent editing time were not measured. Cannot establish the two-owner-day kill threshold from build logs. Next deliberate rebase records active attention separately. |
| Incremental development | Recent private-only prefetch fixture builds recorded 38.82/40.13 s, then zero-action guard. Illustrative local runs only; no routine rebase or fleet estimate. |
| CI money | The [completed-run timing response](evidence/decision2-closeout-20261024/github-completed-run-timing.json) reports18m21s wall duration and zero billable fields for shared-repository run40050159492. It is not a billing export or native-build measurement; actual runner rates/storage/signing cost remain uncollected. No $0-cost inference. Budget sign-off remains open. |
| Maintenance proposal | Owner-approved October22: Anthony Loria as sole maintainer; suspend distribution when he cannot review security updates. This supersedes the draft independent-backup requirement. Review upstream security notices each working day; block distribution of a known vulnerable candidate until fixed or withdrawn. Confirm capacity for milestone rebases and urgent security updates explicitly. |
| Release operations | Reserve operator availability for signing/notarization, clean-Mac acceptance, update/rollback rehearsal and incident withdrawal. Assign names before L3/L8/L9/L12 acceptance. |
| Capacity decision | Owner must accept measured limitations and staffing commitment or reject expansion. Calendar estimates in the original plan are not a release ETA. |

No paid service, runner, release or staffing commitment is made here. Latency remains deferred; Electron diagnostic build remains unapproved. Proposed maintenance policy is reviewable now; actual cost acceptance remains open.
