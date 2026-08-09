# Browser Memory Benchmark — First-Run Validation Plan

> **For agentic workers:** the harness is already built and remediated. This plan is the *validation* pass — it cannot be executed by an agent in a container, because every task requires macOS and real browser installs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `bench/memory/` from an audited-but-unexecuted harness into a citable measurement, and establish what may honestly be said about Blanc's memory use.

**Architecture:** macOS-only. Sums `phys_footprint` across each browser's whole process tree after loading an identical page set, with warmed template profiles, load verification against each browser's own idle baseline, and a report that groups browsers by what they block. See the spec for why each of those exists.

**Tech Stack:** Node 22 (CommonJS), no runtime dependencies. `ps`/`vmmap`/`footprint`/`top` for measurement, `defaults` for bundle versions, `node:test` for the pure logic.

**Spec:** `docs/superpowers/specs/2026-08-09-browser-memory-benchmark-design.md`

## Global Constraints

- **Nothing published until a run backs it.** `test/unit/public-truth.test.js` is the standard the rest of the project holds; a memory claim is not exempt.
- **Never benchmark a dev run.** An unpackaged Blanc relocates its userData to `<dir>-Dev` (`main.js:144`). Use `/Applications/Blanc.app`.
- **Never set `BLANC_TEST=1`.** `acceptanceTestMode` disables ad blocking (`main.js:3750`).
- **Never run the whole harness under `sudo`.** It would launch every browser as root.
- **A failed cell is not a low number.** If a browser fails load verification, fix the cause or drop the browser — do not lower the threshold to make the row appear.
- Quit all browsers first, plug in, disable Low Power Mode.
- Results are comparable only within one session. Do not merge runs.

## File Structure

| File | Responsibility |
|---|---|
| `bench/memory/run.js` | CLI, plan, warming, cell execution, load verification, report writing |
| `bench/memory/lib/measure.js` | Backend probing and parsers; `canReadPid` |
| `bench/memory/lib/proctree.js` | Process attribution |
| `bench/memory/lib/launch.js` | Per-family launch, Gecko prefs, tree-wide quit |
| `bench/memory/lib/report.js` | Blocking-class grouping, reference anchoring, markdown |
| `bench/memory/browsers.json` | Registry; every UNVERIFIED assumption is noted on its entry |
| `test/unit/bench-memory.test.js` | 57 tests, cross-platform |

---

## Phase 1 — Environment

- [ ] **Task 1.1** Install the browsers to be compared. At minimum: Blanc (packaged), Chrome, Zen, Firefox. Add Brave and Vivaldi for the built-in-blocking peer group.
- [ ] **Task 1.2** `npm run bench:memory -- --list`. Every intended browser resolves. If Zen does not, find its real bundle name and add it as a **candidate on the `zen` entry** — unless it is Twilight, which gets the separate `zen-twilight` id (see the registry `$comment` on why).
- [ ] **Task 1.3** `npm run bench:memory -- --probe`. Record which backend it picks — it probes only our own Node process, so this is a starting point, not the verdict. Task 2.1 re-validates against a real browser and prints a downgrade line if it had to fall back; record whichever backend the report finally names. If that turns out to be `ps`, the run is indicative only and says so.

## Phase 2 — Prove the harness measures what it claims

Each task here is a gate. Do not proceed past a failing one by loosening a threshold.

- [ ] **Task 2.1** `npm run bench:memory -- --browsers=chrome --workloads=baseline,mixed --reps=1`.
      Confirms: the backend can read a hardened browser (the run aborts on cell one if not), a cell completes, a report is written.
- [ ] **Task 2.2** Inspect the Chrome row. Process count in the tens, not 1 — a count of 1 means process attribution is broken and every number is wrong.
- [ ] **Task 2.3** Re-run Task 2.1 with `--keep-profiles`. Confirm the throwaway profile directory was actually populated. Repeat for Arc if included; it may ignore `--user-data-dir`.
- [ ] **Task 2.4** Run `--browsers=blanc --workloads=baseline,mixed --reps=1` **with the browser visible**. Count the tabs on screen. Expect 10 workload pages + 1 `blanc://newtab`. If the count differs, correct `extraBlankTabs` — do not adjust the report.
- [ ] **Task 2.5** Confirm Blanc's profile contains no data from a legacy `Bowser` profile (favourites, history). If it does, the pre-created-directory guard against `main.js:153` is not working.
- [ ] **Task 2.6** Deliberately break load verification to prove it fires: run Blanc with `--warm=false` on a slow connection, or with the network briefly off. The cell should be **rejected** and appear under *Failed cells* — not published as a very small number.
- [ ] **Task 2.6b** Check the per-cell `pages visited: N/N` line the runner prints. It is the authoritative check — if it reads `10/10` while the visible window shows fewer tabs, the visit log is recording navigations the browser did not finish, and the observation needs tightening before any number is trusted.
- [ ] **Task 2.6c** Confirm the visit log is actually being read for each family: Blanc's `history.json`, Chromium's `Default/History`, Gecko's `places.sqlite`. `--keep-profiles` plus a manual look at the profile is the quickest way. A browser whose log lives elsewhere will fail every cell with "recorded no navigation at all" — that is the harness being correct, but it needs a registry fix, not a threshold change.
- [ ] **Task 2.7** Repeat Task 2.4 for Zen, watching the window. This is the highest-risk assumption in the harness: if Zen opens 1 tab instead of 10, or shows an onboarding screen, its number would be far too low in the direction that confirms the original comment. Check `zen-browser/desktop#12154` if the startup homepage does not load. Page observation should now catch this automatically — Task 2.7 is confirming the catch works, not substituting for it.
- [ ] **Task 2.8** Repeat for Brave and Vivaldi, watching for welcome tabs despite `--no-first-run`.
- [ ] **Task 2.9** Verify Vivaldi's actual blocker setting in its own Settings → Privacy, and correct `blockingClass` if it is not trackers-only. A wrong class silently moves the row into the wrong comparison group.
- [ ] **Task 2.10** Confirm `blanc` and `blanc-noblock` differ measurably on `adheavy`. If they do not, the `adblockEnabled: false` seed is not taking effect and the blocker-isolation column is meaningless.

## Phase 3 — The real matrix

- [ ] **Task 3.1** `npm run bench:memory -- --browsers=blanc,blanc-noblock,chrome,zen,firefox,brave,vivaldi --workloads=baseline,mixed,adheavy --reps=3`. Expect 60–90 minutes. Do not use the machine while it runs.
- [ ] **Task 3.2** Read the *Failed cells* section first, before any number. Any browser with fewer than 3 reps has a Range that looks precise and is not.
- [ ] **Task 3.3** Check for overlapping ranges. Two browsers whose min–max overlap are **not distinguishable** at n=3; either raise `--reps` or report them as tied.
- [ ] **Task 3.4** Run `--workloads=baseline,scale --reps=3` if any claim will touch high tab counts. Do not extrapolate from 10 tabs to 100 — measure it. This is also the workload where a Zen comparison is most likely to go against us, which is a reason to run it, not to skip it.
- [ ] **Task 3.5** Commit the specific report being cited into `bench/memory/results/` (gitignored by default, so add it deliberately).

## Phase 4 — Decide what may be said

- [ ] **Task 4.1** Write the claim as a sentence, then check it against the report: does it quote the range, name the metric, and state that profiles were fresh and extension-free?
- [ ] **Task 4.2** If the claim compares Blanc to a non-blocking browser, it must say the gap is partly *content not rendered*, not engine efficiency. The report's grouping makes this visible; a sentence lifted out of it does not.
- [ ] **Task 4.3** Record the browser versions from the report. "Zen used X" is meaningless a fortnight later; Zen ships every few days.
- [ ] **Task 4.4** If the honest answer is that Zen wins on total memory, say so and pivot to the per-page column and the ad-heavy delta, which are the defensible ground. Do not re-cut the workload until Blanc wins — the run that produced the answer is the answer.
- [ ] **Task 4.5** Update `docs/press/fact-sheet.md` only if a claim survives 4.1–4.4, and add a guard to `test/unit/public-truth.test.js` pinning whatever is asserted.

## Phase 5 — Fold back into the harness

- [ ] **Task 5.1** For every assumption Phase 2 settled, replace the `UNVERIFIED` note in `browsers.json` with what was observed, including the date and version.
- [ ] **Task 5.2** Update the spec's *Open* section — each item either moves to *Fixed* or becomes an accepted limitation with evidence.
- [ ] **Task 5.3** Consider building the exact tab-count readback (profile history database) if Phase 2 showed the 15% floor was too coarse in practice.
