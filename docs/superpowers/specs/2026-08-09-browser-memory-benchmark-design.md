# Cross-browser memory benchmark — design

**Date:** 2026-08-09
**Status:** Implemented, audited, remediated — **never executed on macOS**. For review.
**Audit:** Three adversarial reviews (10 lenses, 23 agents); 57 findings survived refutation, of which the blocking ones are fixed. See *Known risks and open questions*.
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
| `bench/memory/run.js` (627) | CLI, preflight, plan, profile warming, cell execution, load verification, report writing |
| `bench/memory/lib/measure.js` (314) | Backend probing + `footprint`/`vmmap`/`top`/`ps` parsers, per-pid sampling, `canReadPid` |
| `bench/memory/lib/proctree.js` (135) | `ps` snapshot parsing, descendant walk, bundle matching, process attribution |
| `bench/memory/lib/launch.js` (210) | Per-family launch plans, Gecko pref seeding, spawn, tree-wide quit |
| `bench/memory/lib/settle.js` (76) | Flat-series detection and the sampling loop |
| `bench/memory/lib/stats.js` (109) | Median/MAD/summary, per-page cost, metric-consistency guard, formatting |
| `bench/memory/lib/report.js` (298) | Row building, blocking-class grouping, reference anchoring, markdown |
| `bench/memory/lib/registry.js` (121) | `browsers.json` loading, path resolution, selection, bundle version |
| `bench/memory/browsers.json` | 14 entries — 12 runnable, 2 documented-unsupported |
| `bench/memory/workloads.json` | `baseline` (0) · `light` (5) · `mixed` (10) · `adheavy` (6) · `scale` (20) |
| `bench/memory/README.md` | Methodology, preparation checklist, publishing discipline |
| `test/unit/bench-memory.test.js` (600) | 41 tests over every pure function |

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

**41 unit tests**, all passing, covering: size-token parsing (including the
`(N bytes)`-beats-suffix rule), `vmmap` peak-line rejection, `footprint`
peak/lifetime skipping, `top` row parsing with growth markers, `ps` KB→bytes,
`ps` paths containing spaces, transitive descendants with a cycle guard, bundle
prefix boundaries (`Arc.app` vs `Arcade.app` vs `Arc.app.backup`), pre-existing
pid exclusion, re-parented helper recovery, median/MAD outlier resistance,
per-tab arithmetic, the metric-mixing guard, settle-window semantics, the
`minMs` floor, per-family launch plans, registry candidate resolution,
requested-but-missing being an error, registry self-consistency, rotation,
plan coverage, argument parsing, and report ranking/warning/ordering — plus,
since the audit: the `footprint` page-size trap against real output, backend
argv (no `-p`, no `-n 0`), `canReadPid` against a denying backend, load
verification rejecting a gated cell, baseline ordering, an unsupported profile
seed throwing, blocking-class grouping and reference anchoring, per-page
division by workload pages, failed cells and caveats reaching the report, the
Gecko tab-unloader and `extraPrefs` prefs, and Zen's channel separation.

**Smoke-tested end to end on Linux** against a synthetic multi-process binary:
launch → process-tree discovery (root + 3 children found) → `ps` backend
sampling → clean quit. This validates the plumbing, not the macOS specifics.

**Not tested, and cannot be from here:** every macOS-specific assumption — the
real output format of `footprint`/`vmmap`/`top`, their privilege requirements,
whether Electron honours `--user-data-dir` in a packaged build, whether Blanc's
single-instance lock is per-profile, and whether the Gecko `user.js` startup
homepage actually opens N tabs. The first real run is the test.

## Known risks and open questions

### How this section was produced, and what it is worth

Three adversarial audits ran over the harness — a general review (macOS
measurement, methodology, Blanc integration, robustness), one on Brave and
Vivaldi, one on Zen. Ten lenses, 23 agents; each lens's findings were then
handed to a separate agent instructed to **refute** them. 57 survived.

**The audits had no browsers and no macOS.** They read the source in
`bench/memory/`. That makes the findings two very different kinds of claim, and
the distinction should govern how much weight a reviewer gives each:

- **Claims about this repository** — verifiable, and spot-checked by hand
  against the code before being acted on.
- **Claims about third-party browser behaviour** — from model knowledge about
  fast-moving software. Some were traced to primary sources (Zen's
  `surfer.json`, the Homebrew casks, an open upstream issue); most were not.
  None are treated as settled.

The design response to the second class is **not** to encode any specific guess
but to make the harness detect the *shared* failure mode at runtime. Every one
of "Brave opens a welcome tab", "Zen ignores the startup homepage", "Vivaldi
hijacks the argv URLs", "Arc ignores `--user-data-dir`" produces the same
artifact: a settled, well-formed, correctly-attributed row where the browser
never loaded the pages. One check catches all of them, including the ones
nobody thought of.

### Fixed — defects that would have produced a wrong number

**The harness could not have measured anything.** `selectBackend`'s `probePid`
parameter — written specifically to reject a backend that works on our own
process but not on a hardened signed browser — was never passed by either call
site. Selection validated `vmmap` against Node, which succeeds unprivileged;
every browser here denies `task_for_pid` to an unprivileged caller. The run
would have printed "Measuring with vmmap", returned 0 for every browser pid,
and burned ~40 minutes producing zeroes. Now the backend is re-validated
against the first browser actually launched and the matrix aborts with an
explanation. Separately, `footprint` was invoked as `-p` (not a flag; it is
`-pid`) and `top` as `-n 0` (which prints *zero* rows, not unlimited), so two of
the four backends were dead code. Fixing `footprint`'s flag alone would have
been worse than leaving it dead: its real output ends `(16384 bytes per page)`,
and the parser's exact-bytes rule would have reported a 142 MB process as 16 KB
— small enough to look like a win, non-zero enough to pass a liveness check.
The parser was fixed first.

**Blanc could have reported a fabricated, flattering number.**
`installStartupNavigationGate` (`main.js:226`, installed at `main.js:3751`)
cancels every http(s) main-frame request until the ad blocker is compiled. Every
cell minted a fresh profile, so that compile was cold every time. A Blanc
process sitting at `blanc://newtab` with navigation cancelled is *perfectly*
flat, so settle detection would have declared it settled after 20 s, recorded
`tabCount: 11`, and ranked it first with zero pages loaded. Now: template
profiles are warmed once per browser and copied per cell, and every loaded cell
must sit ≥15% above that browser's own idle baseline or the cell is rejected and
listed under *Failed cells*.

**The report's framing favoured us three separate ways.** Rows were ranked in
one column regardless of what each browser blocks, so a blocking browser's lead
read as engine efficiency when it was mostly "rendered less content"; the `+N%`
column anchored to whichever row rendered the least, which for an ad-heavy
workload is our own product's best configuration. Rows are now grouped by
`blockingClass` with a mandatory caveat, and percentages anchor to Chrome as a
declared reference. `perTabBytes` divided Blanc by N+1 (counting its throwaway
`blanc://newtab` as a page) while dividing everyone else by N, understating
Blanc's per-page cost ~9%; it now divides by workload pages for everyone.

**Failures were invisible.** A cell that failed printed one line to stdout and
vanished — `meta` had a `skipped` field but none for failures, and with an
explicit `--browsers` selection `skipped` is always empty. A run where every Zen
cell died exited 0 with a clean Blanc/Chrome table and nothing anywhere
recording that Zen was requested and attempted six times. Failures are now in
`meta.failures` and a report section, a `Reps` column shows how many
repetitions actually backed each row, and a browser that produced no measurement
at all makes the run exit non-zero.

**Process hygiene.** `preExistingPids` was snapshotted once for the whole
matrix, so renderers the tester's own browser spawned mid-run were attributed to
us; it is now re-taken per cell. `quit()` signalled only the root pid, leaving
re-parented helpers to be folded into the next cell via bundle matching — which
is not hypothetical, because `blanc` and `blanc-noblock` point at the same
bundle and rotation puts them adjacent; it now reaps the measured set. There
were no signal handlers, so Ctrl-C orphaned browsers against profile
directories about to be deleted.

**Registry corrections.** Brave's Sparkle updater lives inside the app bundle
and keeps its check state outside `--user-data-dir`, so a fresh profile does not
prevent an update download firing mid-measurement (`--disable-brave-update`
added). Vivaldi was described as "built-in blocker (stock settings)", which
would have grouped it with the ad blockers; it ships trackers-only. Zen's own
onboarding is separate from Mozilla's `about:welcome` and was not suppressed by
anything the harness wrote (`extraPrefs` hook added). Gecko's tab unloader was
left enabled, which would have discounted the Gecko rows alone — and because
discarding tabs *helps* a series flatten, settle detection would have recorded
it as a clean result. `requiresProfileSeed` was silently ignored for every
family except `blanc`, so a future `brave-noshields` entry would have run with
Shields on under a label saying otherwise; it now throws.

### Open — assumptions only a real run can settle

None of these are fixed, because none can be from here. Each is recorded in
`browsers.json` notes as well, next to the entry it affects.

- Whether `footprint`/`vmmap` can read hardened browser processes without root
  on the tester's macOS version. The run now aborts on cell one if not, but
  which backend survives is unknown.
- Whether Zen honours the Gecko driver's `user.js` startup-homepage seeding.
  There is an open upstream report of a configured startup homepage not loading
  on macOS aarch64 (`zen-browser/desktop#12154`) — the harness's only tab-seeding
  mechanism, on this benchmark's exact platform.
- Whether Zen, Brave or Vivaldi still open onboarding tabs despite the
  suppression each now carries.
- Vivaldi's actual stock blocker setting, which determines its comparison group.
- Zen's bundle name on the tester's machine. Stable resolves as `Zen.app` per
  the current Homebrew cask; `Zen Browser.app` is kept as a legacy candidate.
- Whether a packaged Electron app honours `--user-data-dir`, and whether Blanc's
  single-instance lock is per-profile (if not, a benchmark launch would hand its
  URLs to an already-running Blanc and exit).
- Whether Arc honours `--user-data-dir` at all.
- Whether warming actually leaves Blanc's compiled engine inside the copied
  template profile.

### Accepted limitations, disclosed rather than fixed

- **Load verification is a floor, not a count.** The 15% threshold catches
  catastrophic failure (1 tab instead of 10); it will not catch 8 of 10. A
  readback of the profile's own history database would verify exactly which URLs
  loaded. Not built — it needs per-engine SQLite handling, and the floor covers
  the failure mode that actually produces a publishable wrong number.
- **`tabCount` is still asserted, not observed.** It comes from the launch plan.
  The `Tabs` column is what was *requested*.
- **`baseline` is a different lifecycle state in every engine**, and it is the
  subtrahend of the per-page column.
- **Classing ETP Standard as `trackers` is a judgement call.** In normal
  windows it blocks tracker cookies, cryptominers and fingerprinters, but
  tracking *content* only in private windows — so memory-wise it prevents far
  less loading than an ad blocker. The registry string says so explicitly.
- **Warming trades fresh-profile purity** for not measuring one-time setup cost.
  It is applied to every browser, not just Blanc.
- **Live sites drift.** Results compare only within one session.

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
