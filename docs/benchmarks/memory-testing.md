# Reproducible memory-testing method

Blanc's memory harness measures the same workloads in the same session on the
same Mac. It is a method for collecting evidence, not a standing claim that
Blanc uses less memory than another browser.

## Record before the run

Record these fields with the raw result:

- hardware model, CPU, total RAM, and power source;
- macOS version and architecture;
- Blanc public version, source tag, and bundled Electron version;
- every comparison browser's exact version;
- workload ID, ordered URLs, repetition count, and harness arguments;
- selected measurement backend and whether it could read every hardened app;
- whether other browsers, indexing, syncing, and Low Power Mode were off.

Do not record personal profiles or browsing data. The harness creates throwaway
profiles and the published workload must use non-personal pages.

## Procedure

1. Install the packaged public Blanc build being measured. Do not use
   `npm start`, `BLANC_TEST`, extensions, or process-model flags.
2. Quit every browser and background browser process. Plug the Mac into power,
   disable Low Power Mode, and pause unrelated indexing or synchronization.
3. From the matching source tag, run `npm ci`, then
   `npm run bench:memory -- --probe`. Record the selected backend.
4. List detected apps with `npm run bench:memory -- --list` and confirm every
   version before measuring.
5. Run the intended matrix, for example:

   ```sh
   npm run bench:memory -- --browsers=blanc,chrome,brave --reps=3 --workloads=mixed
   ```

6. Keep the generated JSON and Markdown together. Reject any cell listed under
   **Failed cells**, any row with missing page observation, or any run that mixed
   measurement backends.

The harness warms throwaway profiles, rotates browser order, measures an idle
baseline for every repetition, confirms that requested pages were navigated,
waits for memory to settle, and reports medians with ranges. On macOS,
`phys_footprint` is preferred because summing RSS repeatedly counts shared
framework pages. A `ps` fallback is explicitly marked indicative and is not
publishable as a comparative result.

## Raw-result format

The canonical raw output is the generated JSON under
`bench/memory/results/`. Publish it without removing failures or warnings and
keep its environment, browser versions, backend, workload, repetitions,
per-process samples, page-observation result, idle baseline, and rejected-cell
records. The generated Markdown is a view of that JSON, not a substitute for
it.

See [the harness documentation](../../bench/memory/README.md) for metric
selection, fairness controls, failure handling, and interpretation. Do not turn
one machine's result into a universal speed, battery, or memory-superiority
claim.
