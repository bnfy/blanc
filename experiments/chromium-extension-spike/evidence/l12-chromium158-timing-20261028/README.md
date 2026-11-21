# Chromium 158 available-load timing

Owner explicitly instructed removing the 90% idle admission threshold and running under available load. The harness records actual idle without waiting for the old threshold. This is not an idle-qualified measurement.

Executed native Chromium **158.0.8127.2**, source **0353d3e33443fc54fbc75dea0bbe0bd1d009e374**, with source-matched signed-candidate blocker/UI assets. The native executable and all configuration/oracle/harness inputs are hashed in `input-receipt.json`; the run is native-output measurement, not a claim that it launched the signed app's packaging wrapper.

All **312 page checks** passed: one full discarded warm-up and five full measured repetitions in each regular/private profile; 5,123 corpus candidates plus four controls, natural concurrent page resources, and **6,406 measured requests per repetition** including required child/root requests. Decision/context/response/trace validation remains enabled. No repetition was discarded beyond the prescribed warm-up.

| Profile | Median p50 | Median p95 | Median p99 | Target |
| --- | ---: | ---: | ---: | --- |
| Regular | 0.206 ms | 1.644 ms | 4.544 ms | <5 ms: pass |
| Private | 0.218 ms | 1.478 ms | 3.367 ms | <5 ms: pass |

Individual repetitions, actual idle samples, cold first-200 results and all gaps are retained in `report.json`. The individual p99 values above 5 ms are not hidden; the prescribed statistic is the median of five. Native timing uses base::TimeTicks through decision application, including the Mojo round trip. Raw per-page evidence is retained durably in `Chromium Preview/evidence/l12-chromium158-timing-20261028/attempt1`, with hashes in `page-evidence-manifest.json`. Neither the 157 fallback nor Google baseline changed.
