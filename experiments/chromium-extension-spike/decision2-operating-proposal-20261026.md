# Decision 2 — bounded operating proposal

October 26, 2026. Prepared for review; no budget, engine, migration or release approval is inferred. Governing plan: [Chromium implementation plan §2/§5](../../docs/chromium-migration-implementation-plan-2026-10-16.md). Supporting measurements: [operations evidence](evidence/decision2-operations-20261026/README.md), [cost sheet](decision2-cost-sheet-20261022.md).

## Proposed operating boundary

| Area | Concrete proposal | Limit or stop condition |
| --- | --- | --- |
| Hardware/builds | Use the two existing Macs, current native source/output, cached incremental builds and the retained signing setup. Keep the native build local. | No new hardware, hosted Chromium builder, subscription, runner class, toolchain or cold build under this proposal. Existing large-build exceptions remain separate owner decisions. |
| Hosted CI | Retain the existing public-repository standard runners and existing required checks. The observed workload is four workflows/28 jobs, including two skipped jobs. | Do not add a larger runner or make the repository private as an incidental change. Either changes the cost assumptions and needs review. Known Electron failures stay visible and paused; do not remove tests to close L11. |
| Cash | Request no new paid service. Standard hosted compute for the verified public repository has no minute charge under GitHub's current published policy. The four observed runs uploaded no Actions artifacts. | This is not a statement that the project costs $0. Existing signing/hardware/energy, account-wide artifact/cache charges and operator time are unpriced. No new spending authorization is implied. |
| Candidate work | Package/sign/notarize only for changed native code or a concrete artifact defect. Reuse accepted UI/recovery/owner observations through an explicit unchanged-path mapping. | Re-run affected cases, not the full suite by default. Retain original failures and exact source/artifact identities. No repeat rebase merely to fill a spreadsheet. |
| Maintainer | Anthony Loria remains sole maintainer and release reviewer, with distribution suspended when unavailable. | Preserve the existing security-update/withdrawal policy and the primary plan's two-owner-day/one-calendar-week rebase stop rules. Do not convert elapsed compiler or queue time into active owner time. |
| Next necessary update | Record active operator intervals, manual authentication/hand checks, agent work, native build wall time, CI queue/execution and attributable charges separately. | If attention is not recorded or a limit is crossed, report the result as unqualified/stop. Do not estimate missing history from message timestamps. |

## What the observations establish

The completed `732b34f` workflows contain 26 non-skipped jobs. Their API start/completion intervals sum to 69m16s (Ubuntu18m56s, Windows23m02s, macOS27m18s). The wall span is2h20m20s, including runner availability and dependency waits; it is neither owner attention nor a native Chromium build measurement. All job lists were read with a100-item page size and returned their full totals. The separate CodeQL result makes29 check results:25success/two known Electron failures/two skips.

The current signed archive is243,876,968bytes (about232.58MiB). It is retained locally; this review neither uploads it nor changes release/artifact retention. Public-repository compute eligibility and zero artifacts in these four runs narrow the cash uncertainty, but account-wide cache/storage and other existing costs still require an actual usage/billing record if a dollar estimate is needed.

The previous cold build2h39m47.120s and current75-file/184-hunk inventory remain dated observations. The larger patch set has no measured major-version rebase with owner-attention intervals. No affordable monthly cash range or hours-per-rebase range can be asserted from these inputs.

## Review disposition

This is a concrete existing-infrastructure operating option, replacing the request that the owner guess an unsupported monthly budget. It does not change the primary plan's acceptance criteria. Cost/capacity acceptance stays open until the owner makes an informed disposition against the measured limits; a new dollar ceiling is not manufactured. Full F12/Decision2 also remains blocked by its outstanding qualifications and deferred latency. L4 needs an authentic Google upgrade; L11 retains its all-green obligation; L12 remains NO-GO. No new launch-gate credit.

Next useful evidence comes from the next genuinely necessary security/update task, using the recording template below; no extra build or runtime test is scheduled by this proposal.

| Task / source | Operator interval and active minutes | Agent work | Native build wall time | CI execution / queue | Cash record / allocation | Outcome / stop rule |
| --- | --- | --- | --- | --- | --- | --- |
| Next necessary update | Record contemporaneously; exclude unattended waits | Record separately | Exact log; incremental versus approved clean build | API intervals; keep separate from owner time | Actual invoice/usage entry or explicitly unknown | Pass / stop / unqualified with reason |

Electron paused. Google baseline separate. Latency deferred.
