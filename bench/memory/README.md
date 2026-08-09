# Browser memory benchmark

Measures how much memory Blanc uses against other browsers, on the same pages,
at the same tab count, on the same machine, in the same session.

It exists because "how are you on memory usage?" is a fair question with no
answer in this repository, and because the alternative — quoting a number from
memory or from someone else's blog post — is exactly the kind of claim
`test/unit/public-truth.test.js` exists to prevent.

macOS only. The metric it depends on is a macOS concept.

## Quick start

```sh
npm run bench:memory -- --list                       # what's installed
npm run bench:memory -- --probe                      # which metric this Mac allows
npm run bench:memory -- --browsers=blanc,chrome,zen  # the run you actually want
```

Results land in `bench/memory/results/` as a JSON record and a markdown report.

## Why the metric is the whole ballgame

The obvious approach — sum `ps` RSS across every browser process — is wrong,
and wrong in a direction that flatters whoever runs it.

RSS counts each process's resident pages, including the ~100–200 MB Chromium or
Gecko framework binary that is **mapped into every renderer**. Sum RSS across a
20-process browser and you have counted that framework twenty times. Worse, the
error scales with process count, so it systematically penalises whichever engine
isolates more aggressively. A benchmark like that "proves" Chromium is a memory
hog by measuring its process model twice.

The right metric on macOS is **`phys_footprint`** — what Activity Monitor's
"Memory" column shows. It counts dirty and compressed pages and excludes clean
file-backed pages shared between processes.

No single command reports it reliably across macOS versions and privilege
levels, so `lib/measure.js` probes four backends in descending fidelity —
`footprint`, `vmmap --summary`, `top`, then `ps` — keeps the best one that
actually works on this machine, and records its name in the output. If only
`ps` works, the report says so in a warning banner and the numbers are marked
as indicative. Results from different backends are never combined into one
table; `requireConsistentMetric()` throws instead.

Run `--probe` first. It can only probe the harness's own Node process, though,
and that proves less than it looks: `vmmap` reads an unhardened process you own
without root, while every browser here ships a hardened runtime and denies
`task_for_pid` to an unprivileged caller. So the backend is **re-validated
against the first real browser launched**, and the run aborts immediately if it
cannot read it — one wasted cell instead of forty minutes of zeroes.

**Do not run the whole harness under `sudo`.** It would launch every browser as
root, which is not the configuration anyone uses and not what you want to
measure. If the backend cannot read hardened processes, either grant the
measurement tool the access it needs or fall back to `--backend=ps` and accept
that the report will mark itself unpublishable.

## What stops a browser quietly reporting a number it did not earn

The failure this harness most needs to survive is not a bad measurement — it is
a browser that never did the work. Blanc **cancels every http(s) main-frame
request** until its ad blocker is compiled (`main.js:226`, installed at
`main.js:3751`); a vendor's welcome tab can swallow the argv URLs; a Gecko fork
may ignore the startup-homepage tab seeding; Arc may ignore `--user-data-dir`.
Every one of those produces the same artifact: a well-formed, settled,
correctly-attributed row that is simply wrong — and wrong in the *flattering*
direction, because a browser that rendered nothing uses very little memory.

Two mechanisms guard against it, neither of which encodes a guess about any
specific browser:

- **Warmed template profiles** (`--warm`, on by default). Each browser is
  launched once with no URLs, left to finish its first-run setup and blocklist
  compilation, then quit; every measured cell starts from a copy of that
  profile. No cell races a one-time setup cost.
- **Load verification.** A loaded cell must sit at least 15% above that same
  browser's own idle baseline. Ten real pages cost far more than that; a
  browser sitting at its start page does not. Cells that fail are **rejected
  and listed in the report's "Failed cells" section**, never quietly published.

Both floors apply to the **idle baseline too**. An understated baseline inflates
the per-page column and, because it is the denominator of the growth check,
makes an understated loaded cell easier to pass — so it is not exempt.

`baseline` is not optional: it is added automatically whenever a loaded workload
is requested, and a loaded cell with no baseline to check against is **rejected**
rather than published with a caveat. A check that does not fail is not a check.

## What makes the comparison fair

- **A fresh, throwaway profile per run**, per browser. No extensions, no
  history, no restored session.
- **No process-model flags.** There is deliberately no `--disable-gpu`,
  `--single-process` or `--disable-extensions` in `lib/launch.js`. Each would
  move the number a long way and turn this into a measurement of our own flags.
- **Identical URLs, identical order**, from `workloads.json`.
- **The whole process tree**, attributed from the launched root pid, unioned
  with bundle-path matches to catch re-parented helpers, minus every pid that
  existed before the run — so the tester's own open Chrome is never counted.
- **Settle detection instead of a fixed wait.** The runner samples on an
  interval and waits for the series to flatten (`lib/settle.js`). A fixed sleep
  compares browsers at different points in their lifecycle; pages that never
  settle are flagged `⚠️` in the report rather than quietly averaged in.
- **Interleaved, rotated ordering.** Browsers alternate within each repetition
  and rotate position across repetitions, so drift in the live web is spread
  evenly rather than landing on whichever browser ran last.
- **Median of repetitions**, reported with min–max range.

## Before you run

1. **Quit every browser**, including background ones. Pre-existing processes are
   excluded from the totals, but their memory pressure still perturbs the machine.
2. **Plug in**, and turn off Low Power Mode.
3. Close anything that indexes or syncs in the background.
4. Benchmark the **packaged `/Applications/Blanc.app`**, never `npm start`. An
   unpackaged Blanc relocates its userData to `<dir>-Dev` (`main.js:144`) and is
   not the configuration that ships.
5. Do **not** set `BLANC_TEST=1`. `acceptanceTestMode` disables ad blocking
   (`main.js:3750`), which would measure a configuration Blanc never ships.

A full matrix takes a while — 3 browsers × 2 workloads × 3 repetitions at up to
2 minutes of settling per cell is roughly 40 minutes. Start with
`--reps=1 --workloads=mixed` to shake out the setup.

## Reading the output

Rows are **grouped by what each browser blocks**, and that grouping is
load-bearing rather than decorative. A browser that blocks ads renders less
content, so a lower number across groups is mostly a product difference, not an
engine-efficiency result. Compare within a group; across groups, read it as
"what this browser costs a user as configured", nothing more.

| Column | Meaning |
| --- | --- |
| Version | The bundle's marketing version. A number is not citable without it — Zen ships every few days |
| Median | Median total across repetitions |
| vs ref | Percentage against the **reference** browser (Chrome by default), not against the lowest row. Anchoring a vendor benchmark to its own product's best configuration is the shape reviewers distrust |
| Range | min–max across repetitions. **Overlapping ranges mean the two browsers are not distinguishable** at that sample size |
| Per page | `(loaded median − idle median) / workload pages` — marginal cost of a page, fixed startup cost removed. Divides by workload pages, never by a browser's own inflated tab count |
| Procs | Lowest process count across the samples the median came from. Chromium and Firefox both isolate content by site; their process models differ in ways this benchmark does not measure, so **do not read a process-count difference as the explanation for a memory difference**. See [Mozilla's process model docs](https://firefox-source-docs.mozilla.org/dom/ipc/process_model.html). Browsers whose UI is itself a web page (Blanc, Vivaldi) carry extra always-live renderers |
| Reps | How many repetitions actually produced a measurement. A row backed by 1 of 3 has a Range that looks precise and is not |
| ⚠️N | N repetitions were still drifting when sampling gave up |

`Per page` is usually the number worth quoting. Total memory conflates "how
expensive is a page" with "how many services does this browser start eagerly",
and only the first is about handling real content.

Read the **Failed cells** section before any number. A browser that failed load
verification is not a browser that uses little memory — it is a browser the
harness could not confirm did the work.

## The workloads

`baseline` (idle) is what makes the per-tab column possible — run it alongside
whatever else you pick. `mixed` is the default. `adheavy` is the one that
isolates what network-layer blocking is worth, since blocked frames and scripts
are never instantiated at all. `scale` (20 tabs) is where Chromium's
process-per-site model and Gecko's capped pool diverge most, which is the
interesting comparison against a Firefox-based browser like Zen.

Run `firefox` alongside `zen` when you run either. It separates what Zen's own
changes cost from what Gecko costs, and without it a Zen number is unreadable.

`blanc-noblock` runs Blanc with `adblockEnabled: false` seeded into the
throwaway profile — the honest way to show what the built-in blocker
contributes rather than asserting it.

## Adding a browser

Edit `browsers.json`. No code change is needed as long as the browser belongs to
one of the launch families in `lib/launch.js`:

- `chromium` — positional URLs, `--user-data-dir`
- `gecko` — tabs seeded via the profile's `user.js` startup homepage, because
  positional URLs do not reliably open more than the first tab in Firefox
- `blanc` — like `chromium`; `urlsFromArgv()` in `main.js` maps each http(s)
  argument through `createTab()`

`bundlePath` and `executableName` accept arrays of candidates, since vendors
rename bundles between releases.

Safari and Orion are in the registry marked `supported: false` with a reason.
Neither has command-line profile isolation, so a run would use the tester's real
profile, with their extensions and history — not comparable, and left out
rather than footnoted.

## Before publishing any of this

The numbers are real but narrow. They describe one machine, one afternoon, one
set of pages, with fresh profiles and no extensions.

- Quote the **range**, not just the median.
- Say which **metric** produced them; an RSS-backed run is not publishable.
- Say the profiles were **empty**, and extension-free **except where a browser
  bundles its own** — LibreWolf ships uBlock Origin, and that memory is in its
  total. Most people's profiles aren't empty either way.
- **Never compare across blocking groups without saying so.** Beating a
  non-blocking browser on an ad-heavy workload is a product result, not an
  engine result, and a sentence lifted out of the grouped table loses exactly
  that distinction.
- Record the **browser versions** from the report.
- Don't generalise from `mixed` at 10 tabs to "at 100 tabs". Run `scale` instead.
- Commit the specific report you cite. Raw results are gitignored by default
  because they are machine-specific and noisy, but a number that appears in
  public should have its report in the repository behind it.

Memory is one axis. It says nothing about responsiveness, energy, or page-load
time, and a browser can win here by being slower at everything.
