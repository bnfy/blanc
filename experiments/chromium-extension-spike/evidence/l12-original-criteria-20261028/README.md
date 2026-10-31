# Original L12 prerequisites retained — October 28, 2026

The owner rejected the qualified closeout for source `4a77b414` / archive `270c0848539fa52a13a676aee8f0e33e6920d3ca9c08206c3a77d186ab36cbb5`: **“Keep NO-GO; retain original unmet criteria.”** Eleven gates remain accepted. No F12, Decision 2 or L12 approval is inferred.

## New evidence collected without repeating tests

- Read-only CPU preflight: this Mac reported 74.61%, 78.62%, 76.54% idle; the authorized MacBook reported 0% for all three samples. Neither met the established 90% admission threshold. No browser measurement started; no workload was stopped. `idle-admission.json` records the observations, not a benchmark failure or a lasting claim about either machine.
- `jobs.json` retains complete `per_page=100` job responses for all four PR-triggered workflows on `8c0fcb75c8ad5f078a553b6d83006c1a62eb2b40`. Each returned length equals its API total. Twenty completed non-skipped jobs sum to **4,022 seconds (67m02s)**: Ubuntu 2,004 seconds, Windows 2,018 seconds. Six macOS jobs were queued and two jobs skipped. The total is a **lower bound**, not the final workflow total or owner attention. `workload.json` records the exact observation time and pending job IDs.
- All four run artifact APIs were separately verified with `per_page=100` and `total_count=0`. Repository metadata currently reports public. All observed runner labels are standard hosted labels. This neither measures account-wide storage nor proves zero accrued storage charges.
- [GitHub billing policy](https://docs.github.com/en/billing/concepts/product-billing/github-actions), checked October 28, continues to make standard public-repository runner compute free. Larger runners and storage follow separate rules. This policy-based compute conclusion is not a project invoice, monthly total, or new budget approval.

## What must change before the remaining criteria can pass

| Unmet criterion | Concrete next evidence | Current constraint |
| --- | --- | --- |
| Otherwise-idle timing | Existing full-corpus runner with `--require-idle`, warm-up plus five measured regular/private repetitions; record the native interval and cold figures separately | Neither accessible Mac presently admits the run. Preserve loaded-host results; do not relabel them or repeatedly launch failed measurements. |
| Cosmetic outcome parity | Resolve the retained stable differences against the authenticated reference, using the same rules, pages and readiness conditions | Reference `loadExtendedSelectors` is false; it misses procedural and first-inline outcomes that native passes. Electron repair is paused. Do not degrade native protection, silently replace the reference, or count divergent outcomes as parity. No further identical replay can fix this. |
| Measured rebase attention and staffing fit | Active owner intervals during a genuine necessary rebase, separated from agent work, build wall time and CI intervals | Historical active attention was not recorded. A new cold build or timestamp-based estimate would not repair that evidence. No rebase target or new build was introduced here. |
| Attributable operating costs | Provider usage/billing allocation plus measured owner effort, combined with verified repository workload | Repository-only tools do not expose account billing. Existing hardware, power and signing allocations remain unknown. The existing-Mac proposal was not accepted; do not call it an approved budget. |

The original Decision 2 minimum is in primary-plan §2; cosmetic and timing requirements are in `tranche2-request.md` §2. The approved synthetic corpus amendment remains in force. Passed visual, VoiceOver, signing, functional and request-path checks retain their recorded scopes and were not repeated. Complete migration features remain distinct from this preview evaluation, without implying their absence is newly waived.

Next independent action is to finish collecting the six queued macOS job results and update the workload total once terminal. Formal timing requires a qualifying host; parity work must respect the paused reference; human-time measurement requires a real measured update. Do not ask for another waiver. Signed bytes, native caches, permanent profiles and the separate Google baseline were unchanged.
