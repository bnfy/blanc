# Loaded-host timing — October 28

Owner explicitly authorized execution below90% CPU idle after the original idle admission failed. The full frozen5,123-candidate corpus plus4controls is unchanged. Each profile ran one discarded full warm-up then five measured full repetitions (26pages each), with6,406 validated decision records per repetition including descendant requests and page roots. Every page retained context, decision, response and child-execution validation. No native source change or build was needed for this run.

| Profile | Median p50 ms | Median p95 ms | Median p99 ms | <5ms p99 | Original idle condition |
| --- | ---: | ---: | ---: | --- | --- |
| Regular |0.210|0.846|1.688|Met|Not met|
| Private |0.211|0.775|1.461|Met|Not met|

These are medians of five repetition percentiles, not pooled percentiles. The regular second repetition p99 was5.592ms and is retained; no favorable subset was selected. Cold first200 and maximum values are separately recorded in the warm-up rows. Measured idle samples span30.53–70.47%; this is loaded-host evidence, not a claim that the original >=90% idle protocol passed. Native timing covers monotonic factory entry through decision application including Mojo/queueing, and uses independent CDP request and frozen-context digest joins.

The first loaded-host attempt stopped on trace event loss before completing warm-up. Chromium’s category-filter implementation places disabled-by-default inclusions separately, leaving ordinary categories enabled when no explicit exclusion exists. The reader now excludes `*` while explicitly including the Blanc timing category (explicit inclusion takes priority). The retry retained event-loss rejection and completed all312pages. Both attempts and cleanup outcomes remain recorded.

Raw per-page data and logs remain durable in Chromium Preview/evidence/latency-loaded-host-20261028-native[-b]. The current engine is the procedural property asset pair; candidate source4a77b414. Existing authenticated Electron reference execution is pending, separately labeled because its JS observer clock excludes preceding native dispatch. No L12 approval, public release or merge follows from these results.

## Reference complete

Authenticated Electron reference completed all312pages with regular/private warm-up and five measured repetitions each. All context/decision/response/child validations passed and disposable profiles were removed. Median JS-observer p99: 0.064583ms regular, 0.06075ms private. These intervals exclude preceding native dispatch and must not be presented as an equivalent clock or used to claim relative performance. Actual load samples and all repetition values are retained in electron-report.json.
