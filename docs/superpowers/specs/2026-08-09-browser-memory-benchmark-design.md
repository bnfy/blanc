# Cross-browser memory benchmark — design

**Date:** 2026-08-09
**Status:** Implemented, audited, remediated, and **executed on macOS 2026-08-09**. A public claim now rests on it (see *Published claim*). For review.
**Audit:** Three adversarial reviews (10 lenses, 23 agents); 57 findings survived refutation, of which the blocking ones are fixed. See *Known risks and open questions*.
**Scope:** Developer tooling only. No shipping code changes; nothing in `src/`.
**Origin:** An Instagram commenter asked "Zen already provides this functionality. How are you on memory usage?" There was no answer to that question anywhere in this repository.

## Decision

Build `bench/memory/` — a macOS-only harness that measures the **`phys_footprint`
of a browser's entire process tree** after loading an identical page set, for
Blanc against Chrome, Zen, Firefox and seven others.

The harness was authored in a Linux container and first executed on macOS on
2026-08-09. It now produces real measurements, and running it immediately found
three defects no amount of static review had caught — see *Settled by the first
real runs*. A claim now rests on it, so the report backing that claim belongs in the
repository — see *Published claim* below.

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
| `bench/memory/run.js` (758) | CLI, preflight, plan, profile warming, cell execution, verification, report writing |
| `bench/memory/lib/pageload.js` (306) | Reads each browser's own visit log to confirm which pages actually loaded |
| `bench/memory/lib/measure.js` (323) | Backend probing + `footprint`/`vmmap`/`top`/`ps` parsers, per-pid sampling, `canReadPid` |
| `bench/memory/lib/proctree.js` (135) | `ps` snapshot parsing, descendant walk, bundle matching, process attribution |
| `bench/memory/lib/launch.js` (210) | Per-family launch plans, Gecko pref seeding, spawn, tree-wide quit |
| `bench/memory/lib/settle.js` (76) | Flat-series detection and the sampling loop |
| `bench/memory/lib/stats.js` (109) | Median/MAD/summary, per-page cost, metric-consistency guard, formatting |
| `bench/memory/lib/report.js` (296) | Row building, blocking-class grouping, reference anchoring, markdown |
| `bench/memory/lib/registry.js` (121) | `browsers.json` loading, path resolution, selection, bundle version |
| `bench/memory/browsers.json` | 14 entries — 12 runnable, 2 documented-unsupported |
| `bench/memory/workloads.json` | `baseline` (0) · `light` (5) · `mixed` (10) · `adheavy` (6) · `scale` (20) |
| `bench/memory/README.md` | Methodology, preparation checklist, publishing discipline |
| `test/unit/bench-memory.test.js` (1133) | 67 tests over every pure function |

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

**67 unit tests**, all passing, covering: size-token parsing (including the
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

### Second review round — four ways it still accepted an understated number

External review (Codex) returned *changes requested* on the theme that the
harness could still accept understated measurements, plus one factual
correction. All are fixed.

1. **Unreadable processes were checked on the final sample only.** The reported
   figure is the median of the last three samples, so a sample with unreadable
   processes could sit *inside* that median while a later, fully-readable sample
   cleared the check. The whole reported window is now checked
   (`summarizeWindow`), and the process count is that window's **minimum**, so a
   briefly-incomplete tree cannot be papered over by a later sample.
2. **An unverifiable cell was published with a soft marker.** `verifyLoaded`
   returned `ok: true` with an `unverified` note when a browser had no idle
   baseline, so any browser whose baseline cell had failed got every loaded row
   through unchecked, flagged only with a `❓` in the table. That is the hole in
   miniature: a check that does not fail is not a check. It is now a rejection,
   and the `❓` marker is gone because the state it marked can no longer reach
   the report.
3. **`baseline` was optional.** `--workloads=mixed` alone disabled load
   verification entirely for the whole run. The baseline is now added
   automatically whenever any loaded workload is requested — it is the cheapest
   part of the matrix and nothing verifies without it.
4. **The idle baseline itself was never verified.** `verifyLoaded` returned
   early for `workload === 'baseline'`. An understated baseline is doubly
   harmful: it inflates the per-page column *and*, because it is the denominator
   of the growth check, it makes an understated loaded cell easier to pass.
   Baselines now face the same non-zero and process-count floors, and a loaded
   cell with **fewer processes than its own idle baseline** is rejected —
   deliberately a monotonicity check rather than a processes-per-tab rule, since
   asserting how process counts scale is exactly the error corrected below.

**Factual correction.** The report and README described Firefox under Fission as
multiplexing sites across a bounded pool, contrasted with Chromium's
process-per-site-instance. That is the pre-Fission model;
[Mozilla's process model documentation](https://firefox-source-docs.mozilla.org/dom/ipc/process_model.html)
describes content processes keyed per site under Fission. The claim was not
merely reworded — it is **removed**. This harness does not measure process
allocation policy, so it has no business explaining a memory difference with
one, and substituting a second unsourced claim for the first would repeat the
mistake. The `Procs` column now says what it counts and explicitly warns against
reading a process-count difference as the cause of a memory difference.

Also fixed: a sandboxed environment can make `spawn` fail synchronously
(`EPERM`), which escaped `--probe` as an unhandled throw instead of the
intended "no backend worked here" message. Observed by the reviewer; now caught.

### Third review round — the two P1s the previous round missed

The previous round fixed two of the reviewer's four P1 findings and, on the
reviewer's own accounting, missed two. Both are now fixed, along with a
correction to a check the previous round *introduced*.

**P1-2: the growth floor never observed whether the requested pages loaded.**
This was the deeper of the two and the previous round mistook a proxy for a
check. A 15% floor above idle cannot distinguish two pages from ten — a browser
that loaded a fifth of the workload clears it comfortably and is published as
remarkably efficient. The fix stops inferring and starts **observing**: after
each cell's browser quits, `lib/pageload.js` reads the visit log the browser
itself wrote into the throwaway profile — `history.json` for Blanc (its own
`JsonStore`), `Default/History` for Chromium, `places.sqlite` for Gecko — and
confirms every requested host was navigated to. Because the profile is
per-cell, that log contains this cell's navigations and nothing else. Matching
is by hostname so redirects and query strings do not read as failures; a missing
log is evidence of failure rather than a reason to skip the check; and
`node:sqlite`'s availability is verified during preflight, so a Node without it
fails before launching browsers rather than after forty minutes of them. The
growth floor is retained as a net underneath — navigation is not rendering.

*What this does and does not prove:* a visit record means the browser navigated
to the URL, not that the page painted completely. Full render verification would
need engine-specific automation. This is materially stronger than "memory went
up" and is stated as such rather than oversold.

**P1-4: repetitions 2 and 3 reused repetition 1's baseline.** Baselines were
keyed by browser alone, so a loaded cell measured half an hour into the matrix
was compared against an idle figure from the start of the run. The error is
one-directional and invisible: a low first baseline inflates every later
repetition's growth ratio, so understated cells sail through; a high one fails
good cells. Baselines are now keyed per browser **and per repetition**
(`baselineKey`), which the existing baseline-first ordering already guarantees
is available.

**Correction to the previous round.** That round added a rule that a loaded cell
must have at least as many processes as its own idle baseline. The reviewer
noted that preallocated content-process counts vary, so the assertion is not
safely universal — it is the same class of error as the Fission claim, made one
commit after promising not to repeat it. The monotonicity rule is **removed**.
What remains is an absolute floor (`MIN_PROCESSES`), which is a statement about
attribution being broken rather than about how any engine allocates processes: a
tree of one process means the tree was not found, whatever the engine.

### Fourth review round — three false-positive paths in page observation

The page observation introduced in the previous round was itself unsound in
three ways, each of which could confirm a load that did not happen.

- **Matching collapsed pages into sites.** Keys were hostnames, so the 20-page
  `scale` workload was only 16 checks: loading one of three Wikipedia articles
  reported complete success. Keys are now host **plus path**, one per requested
  page, with query and fragment dropped so arrival-time tracking parameters do
  not read as failures. A cross-origin redirect will now fail the cell — a loud
  false negative that gets the workload URL corrected, chosen deliberately over
  a silent false positive that gets published.
- **Gecko read catalogued places, not visits.** `moz_places` is the shared
  history *and bookmarks* store; a row there can be a bookmark or a referenced
  link with no visit at all. The query now joins `moz_historyvisits`. Chromium's
  `urls` has the same problem and now joins `visits`.
- **Every cell inherited the warmed template's history.** Profiles are copied
  from a warmed template, and the observer read the whole log with no time
  boundary, so a page visited during warm-up could satisfy a cell in which it
  never loaded. Two independent guards now: the family's visit log (and its
  SQLite `-wal`/`-shm` sidecars, which would otherwise replay into a fresh
  database) is deleted from the copy, and observation filters to visits after a
  recorded cell-start timestamp — with the epoch conversions each engine needs
  (PRTime for Gecko, microseconds-since-1601 for Chromium, which exceeds
  `Number.MAX_SAFE_INTEGER` and is bound as a BigInt).

A schema this code does not understand now fails the cell rather than falling
back to an unfiltered query.

**The Fission claim was still live in two places** the previous round missed —
including `workloads.json`'s `scale` description, which the report renders, so
it was publishable. Both are gone. `MIN_PROCESSES` is retained only as a gross
attribution check and is not presented as proof that a process tree is complete.

### Settled by the first real runs (2026-08-09, macOS 27, Apple Silicon)

The harness has now executed. These moved from assumption to observation:

- **`footprint` works unprivileged.** It was selected on the first probe and
  read hardened, signed browsers without `sudo`. The `-pid` flag fix was
  necessary, and so was fixing the parser first — unfixed, its
  `(16384 bytes per page)` annotation would have reported every process as 16 KB.
- **Zen honours `user.js` startup-homepage seeding.** The upstream report of it
  failing on macOS aarch64 (`zen-browser/desktop#12154`) did not reproduce. But
  Zen *consumes the first entry* with its own workspace surface, so the first
  workload URL was silently dropped (9/10 pages, twice, deterministically).
  `geckoUserJs` now leads with `about:blank` to absorb that.
- **A packaged Electron app honours `--user-data-dir`**, and Blanc's
  single-instance lock is per-profile: Blanc ran clean at 10/10 pages.
- **Warming leaves Blanc's compiled engine in the template**, so the startup
  navigation gate opens immediately and no cell races a cold blocklist.
- **Vivaldi does not block ads at stock settings.** Confirmed by its own
  numbers: 4.0 GiB on `mixed` and 5.9 GiB on `adheavy`, *above* Chrome on both.
  A browser blocking ads does not land 7% above Chrome on ad-dense pages. The
  `trackers` class is right.
- **Zen resolves as `/Applications/Zen.app/Contents/MacOS/zen`** — the candidate
  pair the registry guessed.
- **No onboarding tabs from Zen, Brave or Vivaldi** survived the suppression;
  every one reported its full page count.

Three harness defects were found only by running it, none of which any amount
of static review had caught: `kill(pid, 0)` reports a zombie as alive (a
renderer awaiting reaping is unreadable and holds nothing); a flat byte total
is not sufficient to call a cell settled while the process tree is still
growing; and macOS *transiently* refuses `footprint` on sandboxed renderers, so
unreadable pids need a retry before the tree is called incomplete.

### Merged from main: backend downgrade instead of abort

While this branch was measuring, PR #102 landed on `main` against an earlier
snapshot of the same harness. It replaced the abort-on-unreadable-backend
behaviour with `resolveReadableBackend()`, which walks down the fidelity order
against a real browser pid and uses the first backend that reads it.

It is a better answer than the abort this branch shipped. Aborting recommended
`--backend=ps` — RSS, which the report itself banners as unpublishable — while
`top` sat untried one rung down, needs no elevation, and reports a
footprint-equivalent column. An explicitly pinned `--backend` is never
downgraded, since substituting a different metric under a caller who asked for
a specific one is worse than failing.

Carried across on merge, along with its tests, and wired so a downgrade applies
to the cell that triggered it rather than only to later ones. Everything else
that conflicted was this branch being newer than main's snapshot, so those
resolved to this side.

### Open — still unsettled

- **Firefox cannot load a harness-supplied profile on this machine.** It shows
  "Profile Missing — Your Firefox profile cannot be loaded. It may be missing or
  inaccessible", reaches ~128 MiB across 4 processes, and visits 0 of 10 pages.
  Removing `-new-instance` (a Linux/Windows-only option) did not fix it, so the
  cause is elsewhere — the install, or `-profile` handling on macOS 27.
  **The clue for whoever picks this up: Zen, a Firefox fork driven through the
  identical code path with identical arguments, works.** That points at the
  Firefox installation rather than the driver. Failure reasons now carry the
  browser's own stderr, which should end it in one round.
  Firefox is the control that separates Zen's own cost from Gecko's; without it
  a Zen number is still usable but cannot be attributed.
- Whether Arc honours `--user-data-dir` at all — Arc is not installed on the
  tester's machine, so this remains untested.

### A limitation of page verification, found by running it

Page verification reads each browser's own visit log, and **those logs do not
agree about redirects**. Chromium's `urls` and Gecko's `moz_historyvisits`
record every hop of a redirect chain; Blanc's `history.js` records only the
committed destination. A URL that redirects across domains is therefore
confirmed for some browsers and missing for others.

`adheavy` contained `dailymail.co.uk/home/index.html`, which geo-redirects a
UK-addressed request to `dailymail.com` — a different host, so not even
host-level matching bridged it. Blanc was the only browser whose ad-heavy cells
failed, across two full matrix runs, and it looked like a Blanc defect. It was
not: the page rendered fine when opened by hand, and the URL bar showed
`dailymail.com`.

The workload URL is corrected and `workloads.json` now warns against
cross-domain redirects in its own comment block. The asymmetry itself is not
fixed — it would need Blanc to record redirect origins, which is a change to
the app for the benefit of a benchmark, and that is the wrong trade.

Worth stating plainly because the failure was *loud and wrong-looking*: the
check refused to publish a Blanc row three times, which is the behaviour it was
built for. The cost of that strictness is exactly this — occasionally rejecting
a good cell and making you prove it. That is the correct direction, but it is
not free.

### Accepted limitations, disclosed rather than fixed

- **Page observation proves navigation, not rendering.** A visit record means
  the browser went to the URL; it does not prove the page painted. Full render
  verification needs engine-specific automation and is not built.
- **`tabCount` is still asserted, not observed.** It comes from the launch plan,
  so the `Tabs` column is what was *requested*. The pages column is what was
  confirmed.
- **`baseline` is a different lifecycle state in every engine**, and it is the
  subtrahend of the per-page column.
- **Classing ETP Standard as `trackers` is a judgement call.** In normal
  windows it blocks tracker cookies, cryptominers and fingerprinters, but
  tracking *content* only in private windows — so memory-wise it prevents far
  less loading than an ad blocker. The registry string says so explicitly.
- **Warming trades fresh-profile purity** for not measuring one-time setup cost.
  It is applied to every browser, not just Blanc.
- **Live sites drift.** Results compare only within one session.

## Published claim

On 2026-08-09 a reply to the originating Instagram comment stated that Blanc
used **about 40% less memory than Zen and 50% less than Chrome**, described as
early testing.

Backed by the single-session, three-repetition run in
`bench/memory/results/memory-2026-08-09T16-36-38-171Z.md`:

| | Blanc | Zen | Chrome |
|---|---:|---:|---:|
| idle | 200 MiB | 658 MiB | 416 MiB |
| ten pages (`mixed`) | 1.6 GiB | 3.0 GiB | 3.5 GiB |

Measured differences are 47% against Zen and 54% against Chrome, so the
published figures are **conservative**, which is the correct direction for a
number a stranger may reproduce.

Two things the claim deliberately does not say, and the evidence for each if
challenged:

- **It is not only ad blocking.** With Blanc's blocker off, the same ten pages
  cost 2.6 GiB against Chrome's 3.5 — 26% less on identical content.
- **Brave is the honest peer, not Zen.** Brave landed at 1.8 GiB on the same
  pages, near Blanc, because it also blocks by default. The claim names Zen and
  Chrome because those are the browsers the comment named.

The claim rests on `mixed`. No ad-heavy figure has been published, because
Blanc's `adheavy` rows failed in both matrix runs for the redirect reason
above.

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
