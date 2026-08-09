# Cross-browser memory benchmark — design

**Date:** 2026-08-09
**Status:** Implemented as-built (`5c377c9`), **never executed on macOS** — for review
**Scope:** Developer tooling only. No shipping code changes; nothing in `src/`.
**Origin:** An Instagram commenter asked "Zen already provides this functionality. How are you on memory usage?" There was no answer to that question anywhere in this repository.

## Decision

Build `bench/memory/` — a macOS-only harness that measures the **`phys_footprint`
of a browser's entire process tree** after loading an identical page set, for
Blanc against Chrome, Zen, Firefox and seven others.

The harness is written, unit-tested and pushed. It has **not produced a single
real number yet**, because it can only run on macOS and was authored in a Linux
container. Everything below is therefore a design under review, not a validated
result. No claim from this harness may reach the site, the press kit, or a
comment thread until a real run backs it.

**Why build rather than answer qualitatively.** The repo already has
`test/unit/public-truth.test.js` guarding against unbacked marketing claims, and
`docs/press/fact-sheet.md` is written in deliberately precise terms. Answering a
memory question from intuition would violate the standard the rest of the
project holds. The options were: decline to answer, answer qualitatively
("Chromium-shaped"), or measure. Only the third produces something quotable.

## Why this shape

### phys_footprint, not summed RSS — the decision the whole thing rests on

The obvious implementation sums `ps -o rss` across every browser process. It is
wrong, and wrong in a direction that flatters whoever runs it.

RSS counts each process's resident pages **including the ~100–200 MB engine
framework mapped into every renderer**. Summing RSS across a 20-process browser
counts that framework twenty times. The error is not a constant offset — it
scales with process count, so it systematically penalises whichever engine
isolates more aggressively per site. A benchmark built that way "proves"
Chromium is a memory hog by measuring its process model twice, and would have
produced exactly the flattering-to-nobody number that started this.

`phys_footprint` (what Activity Monitor's "Memory" column shows) counts dirty
and compressed pages and excludes clean file-backed pages shared between
processes. It is the metric Apple's own tooling reports and the only defensible
choice here.

### Backend probing, not one pinned tool

No single command reports `phys_footprint` reliably across macOS versions and
privilege levels. `footprint(1)` and `vmmap` are exact but typically need root
against a hardened, signed third-party app; `top` needs no elevation but its
column semantics are less certain; `ps` always works and measures the wrong
thing.

Rather than bet the harness on one — which I cannot test from Linux —
`lib/measure.js` probes four backends in descending fidelity, keeps the best one
that actually returns a number on this machine, and **records its name and
metric label in every result**. `stats.requireConsistentMetric()` throws rather
than render a table whose rows came from different backends, and an RSS-backed
run gets a warning banner in the report declaring itself unpublishable.

Rejected: pinning `vmmap` and documenting "run with sudo". It converts an
environment difference into a hard failure halfway through a 40-minute run.

### Command-line URLs, not the test hook, not CDP

Three ways to open N tabs in Blanc were considered:

- **`src/main/test-hook.js` via Playwright.** Rejected outright:
  `acceptanceTestMode` (`main.js:75`) **disables ad blocking** (`main.js:3750`).
  The harness would measure a configuration Blanc never ships, and would
  understate Blanc's blocker while giving it none of the blocker's benefit.
- **CDP / Playwright driving.** Rejected: it works for Chromium and Blanc but
  not for Gecko on the same terms, so the comparison would run two different
  driving mechanisms — and the automation harness adds its own memory and its
  own renderer flags.
- **Command-line URLs.** Chosen. `urlsFromArgv()` (`main.js:314`) maps each
  http(s) argument through `openExternalUrl()` → `createTab()`, so Blanc behaves
  exactly like Chromium here, with no test-only code path involved and the
  shipping ad blocker active.

### Settle detection, not a fixed sleep

"Load the pages, wait 60 seconds, measure" is the usual approach and it is a
coin flip: too short catches a browser mid-load, too long catches it after
idle-tab throttling or memory compaction. Either way the browsers are compared
at **different points in their lifecycle**, which is the failure mode that makes
most published browser benchmarks unusable.

`lib/settle.js` samples on an interval and waits for the series to flatten
(last 3 samples within 2%, never before 20s). Runs that never settle are
**flagged `⚠️` in the report** rather than quietly averaged in. The full sample
series is retained in the JSON so the curve is auditable after the fact.

### Fresh profiles and no process-model flags

Every run gets a throwaway profile: no extensions, no history, no restored
session. There is deliberately **no `--disable-gpu`, `--single-process` or
`--disable-extensions`** in `lib/launch.js` — each would move the number
substantially and turn the exercise into a measurement of our own flags.

The cost of this choice is disclosed rather than hidden: an empty
extension-free profile is the fair *engine* comparison and is **not** what
anyone actually runs. `blanc-noblock` exists so the built-in blocker's
contribution is measured rather than asserted.

### Safari and Orion: registered as unsupported, not omitted

Neither has command-line profile isolation, so a run would use the tester's real
profile — their extensions, their history, their iCloud tabs. That is not
comparable to a fresh-profile run, so both sit in `browsers.json` with
`supported: false` and a written reason. A silently missing row reads as an
oversight; a documented refusal reads as a boundary.

## Components

| File | Responsibility |
|---|---|
| `bench/memory/run.js` (342) | CLI, preflight, plan construction, cell execution, report writing |
| `bench/memory/lib/measure.js` (265) | Backend probing + `footprint`/`vmmap`/`top`/`ps` parsers, per-pid sampling |
| `bench/memory/lib/proctree.js` (135) | `ps` snapshot parsing, descendant walk, bundle matching, process attribution |
| `bench/memory/lib/launch.js` (172) | Per-family launch plans, profile seeding, spawn, quit |
| `bench/memory/lib/settle.js` (76) | Flat-series detection and the sampling loop |
| `bench/memory/lib/stats.js` (109) | Median/MAD/summary, per-tab cost, metric-consistency guard, formatting |
| `bench/memory/lib/report.js` (179) | Row building, ranking, markdown generation |
| `bench/memory/lib/registry.js` (93) | `browsers.json` loading, path resolution, selection |
| `bench/memory/browsers.json` | 13 entries — 11 runnable, 2 documented-unsupported |
| `bench/memory/workloads.json` | `baseline` (0) · `light` (5) · `mixed` (10) · `adheavy` (6) · `scale` (20) |
| `bench/memory/README.md` | Methodology, preparation checklist, publishing discipline |
| `test/unit/bench-memory.test.js` (395) | 28 tests over every pure function |

Pure logic is deliberately separated from anything that shells out, so the
parsers, statistics, attribution and report generation are all testable on a
machine with no browsers and no macOS.

## Data flow — one measured cell

```
create profile dir  ──▶ (suppresses the legacy-Bowser copy, see below)
seed settings.json  ──▶ (Blanc only: past first run, blocker on/off)
spawn browser       ──▶ root pid retained
  ├─ every 5s: ps snapshot ▶ attribute process set ▶ sample backend ▶ sum
  └─ until flat (3 samples within 2%, min 20s) or 120s timeout
record median of last 3 samples, process count, settled flag, full series
SIGTERM ▶ 8s grace ▶ SIGKILL
delete profile
```

Process attribution is the subtle part. The set is the **transitive descendants
of the launched root pid**, unioned with **processes whose executable lives
inside the browser's bundle** (to catch helpers re-parented to launchd when
their parent exits), minus **every pid that existed before the run started** (so
the tester's own open Chrome is never counted). The root is never subtracted
even if it matches the exclusion set.

## Blanc-specific hazards handled

These are the parts most worth an external reviewer's attention, because they
are assumptions about `src/main/` made from reading it rather than running it.

1. **Legacy profile contamination.** `main.js:153` copies
   `~/Library/Application Support/Bowser` into any userData path that does not
   exist yet, for packaged builds. A naive `mktemp` profile would therefore
   inherit the tester's real history, favourites and restorable session on the
   very first cell. `runCell()` creates the directory **before** spawning, which
   makes `fs.existsSync(newUserDataDir)` true and suppresses the copy.

2. **First-run gate.** A fresh profile lands on Blanc's first-run consent
   screen. `seedBlancProfile()` writes `onboardingVersion: 1` (matching
   `FIRST_RUN_VERSION` in `settings.js:25`), Blanc's equivalent of Chromium's
   `--no-first-run`.

3. **Ad blocking must stay on.** `BLANC_TEST=1` is documented as disqualifying
   for a benchmark run, in both the README and `browsers.json`.

4. **Dev-run relocation.** An unpackaged Blanc appends `-Dev` to its userData
   path (`main.js:144`). The harness seeds both `<dir>` and `<dir>-Dev`, and the
   README requires benchmarking `/Applications/Blanc.app`.

5. **Startup tab arithmetic.** `main.js:3755` creates one `blanc://newtab`
   before the argv URLs are flushed, so Blanc ends on N+1 tabs.
   `extraBlankTabs: 1` in the registry carries this into the report rather than
   letting it silently compare N against N+1.

## Testing

**28 unit tests**, all passing, covering: size-token parsing (including the
`(N bytes)`-beats-suffix rule), `vmmap` peak-line rejection, `footprint`
peak/lifetime skipping, `top` row parsing with growth markers, `ps` KB→bytes,
`ps` paths containing spaces, transitive descendants with a cycle guard, bundle
prefix boundaries (`Arc.app` vs `Arcade.app` vs `Arc.app.backup`), pre-existing
pid exclusion, re-parented helper recovery, median/MAD outlier resistance,
per-tab arithmetic, the metric-mixing guard, settle-window semantics, the
`minMs` floor, per-family launch plans, registry candidate resolution,
requested-but-missing being an error, registry self-consistency, rotation,
plan coverage, argument parsing, and report ranking/warning/ordering.

**Smoke-tested end to end on Linux** against a synthetic multi-process binary:
launch → process-tree discovery (root + 3 children found) → `ps` backend
sampling → clean quit. This validates the plumbing, not the macOS specifics.

**Not tested, and cannot be from here:** every macOS-specific assumption — the
real output format of `footprint`/`vmmap`/`top`, their privilege requirements,
whether Electron honours `--user-data-dir` in a packaged build, whether Blanc's
single-instance lock is per-profile, and whether the Gecko `user.js` startup
homepage actually opens N tabs. The first real run is the test.

## Validation plan — what the first macOS run must confirm

Before any number from this harness is quoted anywhere:

- [ ] `--probe` selects a `phys_footprint` backend, not `ps`.
- [ ] `--list` resolves the installed browsers, including Zen under whichever
      bundle name it currently ships as.
- [ ] A `--reps=1 --workloads=mixed` run completes with no cell errors.
- [ ] Process counts are plausible per engine (Chromium tens, Gecko fewer) —
      a count of 1 means attribution is broken.
- [ ] Blanc's tab count is N+1 and the other browsers' is N.
- [ ] `--keep-profiles` shows the throwaway profile was actually populated
      (especially for Arc, which may ignore `--user-data-dir`).
- [ ] Blanc's profile contains no data from a legacy `Bowser` profile.
- [ ] `blanc` and `blanc-noblock` differ measurably on `adheavy`; if they do
      not, the `adblockEnabled: false` seed is not taking effect.
- [ ] Repetition spread is small enough that the medians are distinguishable.

## Explicitly not in scope

- **Any published claim.** The harness produces evidence; deciding what to say
  is a separate judgement, and the README's "before publishing" section is the
  constraint on it.
- **Windows and Linux.** `phys_footprint` is a macOS concept; the other
  platforms need different metrics (PSS on Linux, working set on Windows).
- **CI.** This is a hands-on measurement on a quiet machine, not something to
  run on a shared runner whose noise floor exceeds the effect size.
- **Any axis but memory.** Responsiveness, energy and page-load time are not
  measured, and a browser can win here by being slower at everything.
- **Extension-equipped configurations.** Comparing Blanc's built-in blocker to
  Chrome+uBlock is a legitimate and different question; it needs pre-seeded
  extension profiles and is not built.
