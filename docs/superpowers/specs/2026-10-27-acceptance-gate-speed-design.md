# A faster, self-healing acceptance gate

October 27, 2026. **Status: approved by the owner on October 27, 2026. PR A
(§1, §2) is in review as #1187; PR B (§3, §5) and PR C (§4) follow.**

**Relates to:** `scripts/release.sh` (the press verification gate),
`test/desktop/` (the Cucumber + Playwright acceptance harness),
`.github/workflows/nightly-desktop.yml`, and issue #1180 (the ad-blocking
renderer crash), which this design works around but does not fix.

Marks: **(owner)** is the owner's decision in chat on October 26–27, 2026.
*(My call)* is a builder default the owner hasn't ruled on. Everything else
follows from those or from the code and measurements as they are. A reviewer
who had not seen the conversation read a draft of this file; their questions
are answered in the text (the in-scenario budget waits in §1, main-process
exceptions and the page probe in §2, `retry: 0` in §3, the order of work).

## Why

Publishing 1.44.0 took three attempts on the night of October 26 and shipped
nothing. Every attempt died in the same place: the desktop acceptance run
inside `release.sh`'s press gate, about 40 minutes in, before anything was
built, tagged or published. Attempt 1 lost a Glance picker scenario to window
focus. Attempt 2 lost five ad-blocking scenarios to one renderer crash. Attempt
3 was stopped. Each restart repeated everything from the top.

**(owner)** Both of these matter: getting from "kick off" to the Sigstore
sign-in sooner, and never letting one hiccup throw away a whole run.
**(owner)** No coverage is lost: every scenario that runs today still runs and
still has to pass.

### What a full run measured

One full `runnable` run on this Mac (October 26, `--format json`), 563
scenarios, 18.0 minutes of measured test time (about 20 wall-clock minutes
here, and about 20 on a GitHub `macos-15` runner):

| Part | Scenarios | Time | Share |
|---|---|---|---|
| Shared Spaces (`spec/acceptance/shared-spaces.feature`) | 6 slow ones | 10.4 min | 58% |
| Island auto-hide and floating Island set-up | ~30 | 2.4 min | 13% |
| Everything else | 510 | ~3 min, each under 3 s | |

Running `shared-spaces.feature` on its own gives the same shape, so the waits
are inside the feature, not caused by what ran before it:

| Scenario | Set-up step | Other slow step |
|---|---|---|
| Choose the Spaces this device shares (first, fresh profile) | 0.4 s | |
| A new remote tab stays quiet | 60.6 s | |
| A remote close preserves local recovery | 120.4 s | "device B closes the background Work tab" 60.2 s |
| Active navigation waits without an echo | 120.5 s | |
| An older Worker does not disable ordinary sync | 60.5 s | |
| A local-only navigation does not close the tab elsewhere | 120.4 s | "device B still sees its last shareable web page" 59.8 s |
| Deleting a Space frees a full account immediately | 60.5 s | |

The near-exact multiples of 60 seconds are not work. Two things cause them:

1. **The sync request budget survives a relaunch.** `src/main/sync-scheduler.js`
   allows ten requests per 60-second window and persists its request log in
   the Shared Spaces store. On start it "conservatively charges every recent
   wall timestamp for a whole monotonic window", on purpose, so a restart can
   never refill the budget. The F57 hooks in
   `test/desktop/steps/shared-spaces.steps.js` relaunch the app before and
   after every scenario **on the same profile directory**, so each scenario's
   `enable`/`apply`/`pull` calls queue behind the previous scenario's charged
   window (`sync-request-queue.js` sleeps until `windowFreesAt()`). Alone, the
   same set-up takes under a second. This is correct product behaviour and a
   test-harness problem.
2. **Two steps cross the cap inside their own scenario.** "device B closes
   the background Work tab" and "device B still sees its last shareable web
   page" already ask for a pull through the `sharedSpacesTest('pull')` hook;
   their 60 seconds is the queue sleeping because that scenario's own
   `enable` (one queued operation per fixed store), `apply` (index, closed,
   shared and the space blob) and the step's extra pulls together exceed ten
   requests in the window. A fresh profile removes only the restart charge,
   so these two steps need the fallback in §1.

The table leaves out F57-8 to F57-14 ("Two complete desktop clients converge
through the Worker", the hard-crash scenarios and the peer-driver outline):
in the timed runs they failed in `Before` through the cascade described
below, so their honest duration is not yet known. F57-8 deliberately forbids
`pull` and `capture` ("Explicit capture/pull hooks here would hide broken
automatic discovery") and waits on two clients' scheduled 60-second syncs; its
time is measured and stated in the plan, not shortened.

### How one failure becomes a hundred

All 563 scenarios share one Electron app (`ctx.app` in
`test/desktop/support/hooks.js`). The generic `Before` hook calls the `reset`
test hook on it and nothing ever checks whether the app is still usable:

- After the ad-blocking renderer crash (#1180; a web page's renderer segfaults
  on the reload that follows `/block-ads` lifting a site exception; ~10–20% of
  `@adblock` runs on 1.43.1 and on main alike), the Electron main process is
  alive and answering throughout (same pid, exit code `null`,
  `electronApp.evaluate` succeeds in every later hook), but the crashed tab's
  Playwright page object answers every operation with `Target crashed`, and
  Cucumber attributes those rejections to whichever hook or step is running,
  so the following scenarios fail in `Before` at `hooks.js:396` without
  touching the page themselves. Attempt 2 lost five scenarios this way; the
  timed full run lost 183.
- Something in `shared-spaces.feature`'s own teardown can leave `ctx.app`
  closed: in two of three runs the six scenarios after "Deleting a Space frees
  a full account immediately" failed in `Before` with
  `Target page, context or browser has been closed`. The harness has a
  mechanism that produces exactly this: `assertNoMainProcessExceptions`
  compares the uncaught-exception log against `__blancUncaughtOffset`, which
  is set only in `launchApp()` and never advanced, so one logged exception
  fails every later scenario's `Before`; and `closeApp()` throws *after*
  `electronApp.close()` has succeeded, so `ctx.relaunch()` never reaches its
  `launchApp` and leaves `ctx.app` pointing at a closed app. The cascade is
  intermittent: "Deleting a Space frees a full account immediately" followed
  by "Two complete desktop clients converge through the Worker" passed with
  the app alive at every hook when run as a pair. §2 covers it either way, and
  its healing log (reason, process state, main-process exception text) is how
  the cause gets pinned the next time it happens.

### The flakes nobody reads

`.github/workflows/nightly-desktop.yml` already runs the whole suite on
`macos-15` every night in about 20 minutes. It has failed every night for at
least four days on the same four scenarios:

- "The revealed Island floats over a page that stays still"
  (`island-and-commands.feature:241`)
- "Window buttons come and go with the floating pill on Windows and Linux"
  (`island-and-commands.feature:320`)
- "The card stays put while a pushed Island slides in" (`glance.feature:538`)
- "Tabs in a Space set aside are left alone, and start their idle clock again
  when it comes back" (`tab-archive.feature:94`)

Nobody acts on those results, so the flakes surface again inside the release
gate, where they cost 40 minutes each.

### The operator's environment

Two more causes of lost runs were the machine, not the suite: this Mac turns
its display off after two minutes idle, and window-focus scenarios then fail
with "the window could not become key"; and a second agent built Blanc inside
the release worktree during attempt 2.

## Goals, non-goals, anti-goals

- **Goal:** the full `runnable` suite's measured test time on this Mac drops
  from ~18 minutes to **under 10**, with no scenario removed or weakened.
  Shared Spaces drops from 10.4 minutes to **under 2**, not counting F57-8's
  deliberate wait on automatic sync, whose measured time the plan states.
- **Goal:** a dead or unusable test app costs **one scenario**, never the rest
  of the run. The harness notices and relaunches before the next scenario.
- **Goal:** inside the release gate, a scenario that fails once is **rerun
  once, in a fresh app**, and the release stops only if it fails again. The
  rerun is recorded, never silent.
- **Goal:** the nightly run becomes something that is read: each of its four
  standing flakes gets an issue with its nightly evidence, and the suite is
  green nightly before the next feature release.
- **Goal:** the operator notes that cost runs (keep the display awake, never
  share the release worktree) are in the tooling and the runbook, not only in
  memory.
- **Non-goal:** running the suite as several parallel apps. Keyboard focus on
  one Mac makes that risky, and the two goals above should make it
  unnecessary. Revisit if the suite is still over 10 minutes afterwards.
- **Non-goal:** letting the release trust a green acceptance run done
  elsewhere on the same commit (CI, or an earlier local run). **(owner)** Not
  decided; nothing here depends on it.
- **Non-goal:** fixing #1180, or changing how the product's sync budget or
  periodic pull behave. Both are deliberate and user-facing; the changes here
  are test-harness only.
- **Non-goal:** shortening or waiving any other release gate (packaged checks,
  updater handoffs, evidence, media, freeze, soak).
- **Anti-goal:** hiding a real failure. A scenario that fails on its rerun
  fails the release. A rerun pass is printed in the release log and recorded
  in the release incident. Many failures in one run are treated as a real
  problem, not as many flakes.
- **Anti-goal:** making anything pass by loosening an assertion or adding a
  blanket sleep.

## Constraints

- `src/main/test-hook.js` is installed only when `!app.isPackaged &&
  BLANC_TEST === '1'`; any new test hook stays behind that gate.
- `scripts/release.sh` stays the single owner of the gate order. A rerun is a
  step inside the press gate, not a second way to run the release.
- `CLAUDE.md`: "Do not shorten or silently waive any ... gate." The rerun
  policy below is explicit, bounded and logged.
- The same `runnable` profile also runs nightly on `macos-15`, in PR slices
  (`parity-guards.yml`, including the Linux `@F57` job under GNOME keyring),
  and on Windows. Harness changes must work on all three.
- Nothing from `sleepSnapshots`, closed-tab snapshots or sync credentials may
  cross IPC or reach disk through a test hook.

## Design

### 1. Shared Spaces stops waiting out the sync budget

*(My call)* Each `@F57` scenario that is not a peer-driver scenario runs
**device A on a fresh temporary profile directory**, the way `launchPeerApp`
already runs device B. The F57 `Before` hook relaunches into
`fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-shared-a-'))` with the fixture
endpoint; the F57 `After` hook disables sync, closes that app, removes the
directory, and relaunches on the shared main profile as it does now. A fresh
profile has an empty request log, so set-up runs in about a second instead of
60–120.

Why not the alternatives:

- *Shrink the window under `BLANC_TEST`:* changes the scheduler the suite is
  supposed to exercise, including "the complete clients stay within their
  request budgets" and "Deleting a Space frees a full account immediately".
- *A test hook that clears the persisted request log:* works, but adds a
  hook that edits sync state, and a fresh profile is both simpler and a more
  honest model of "a device".

**Fallback for waits inside one scenario.** Where a scenario's own requests
cross the cap ("device B closes the background Work tab", "device B still sees
its last shareable web page", and any other step the plan measures over 10
seconds), *(My call)* a `BLANC_TEST`-only test-hook action,
`sharedSpacesTest('resetRequestWindow')`, rebuilds the request scheduler for
the test profile with an empty log and no back-off, and the step calls it
between the set-up and the operation under test. It touches no sync
credentials or content, returns nothing, and exists only behind the test-hook
gate. It is a fallback, not the first remedy, because it hides the budget
from exactly the steps that use it: the scenarios that *test* the budget
("the complete clients stay within their request budgets", "Deleting a Space
frees a full account immediately") never call it, and F57-8 keeps its
deliberate automatic-sync wait. If measurement shows the fresh profile alone
makes a step fast, the step does not call it.

The plan states the measured time of each F57 scenario before and after, so
the goal is checked against numbers rather than the table above.

Expected result: `shared-spaces.feature` from 10.4 minutes to under 2 plus
F57-8's own wait, the whole suite from ~18 to ~8–9 minutes of test time on
this Mac.

### 2. The harness heals the app between scenarios

The generic `Before` hook in `test/desktop/support/hooks.js` gains an
**app-health check** that runs before `reset`:

1. `ctx.app` exists, its `process().exitCode` is `null`, a trivial
   main-process `evaluate` answers within 5 seconds, **and every page in
   `ctx.app.windows()` answers a trivial `evaluate` within 5 seconds** (a
   crashed renderer leaves the main process healthy and the page handle
   poisoned, see above).
2. If any of that fails, if `reset` throws a Playwright transport error
   (`Target crashed`, `Target page, context or browser has been closed`,
   `Execution context was destroyed` after its existing retry), **or if any
   step or hook of the previous scenario failed with one of those errors**
   (recorded by an `AfterStep`/`After` hook), the hook writes one line to
   stderr naming the scenario and the reason, closes the old app (ignoring
   errors, after collecting any main-process exception text), **relaunches
   with the same `relaunchEnv` and profile**, and runs `reset` again. Only if
   that also fails does the scenario fail in `Before`.
3. The relaunch is counted. The run's summary (and the gate script in §3)
   prints how many relaunches happened and why, so a healthy suite reports
   zero and a crash is visible even when every scenario passed.

**Main-process exceptions** are attributed and then healed, instead of
failing everything that follows. *(My call)* The check moves to a generic
`After` hook that runs last, so the scenario during which the exception was
logged is the one that fails, with the exception text. The health check in
`Before` then advances `__blancUncaughtOffset` past what has been reported,
treats the app as unusable, relaunches and counts it. `closeApp()` no longer
throws after a successful close: it returns the exception text to its caller
and `ctx.relaunch()` always reaches `launchApp`, so no hook can leave
`ctx.app` on a closed app. This keeps the failure loud, once, and is what
ends the Shared Spaces cascade.

The scenario that broke the app keeps its failure; healing never rewrites a
result. `After` hooks that close or relaunch the app (`@glance`,
`@island-autohide`, `@F57`, `@test-platform-linux`) keep working: the check
only acts when the app they left behind is unusable.

*(My call)* Peer apps (`launchPeerApp`) are not healed; a dead peer fails its
scenario as today, since the next scenario makes its own.

### 3. The release gate reruns only what failed, once

A new script, `scripts/acceptance-gate.mjs`, replaces the bare
`npm run test:acceptance:desktop` inside `release:verify:press`
(`package.json`), and only there; the nightly workflow and the PR slices keep
the plain run so flakes stay visible where they are cheap.

The script:

1. Runs the `runnable` profile with `--format progress` and
   `--format json:<file>` (the JSON is also how §1's timing was measured, so
   the gate records per-scenario timing on every release).
2. Collects the failed scenarios as `path:line` from the JSON.
3. **No failures:** passes. **More than 10 failures** *(My call, cap)*:
   fails at once; that is a broken build or environment, not flakes.
4. Otherwise reruns exactly those scenarios **in a fresh Cucumber process**
   (so a fresh app, fixture servers and profile) using a new exported profile
   `rerun` in `test/desktop/cucumber.mjs`: the `runnable` profile **without
   `paths` and with `retry: 0`**, so the positional `path:line` arguments are
   the whole selection and the rerun is exactly one more attempt. A scenario
   therefore gets at most three attempts in the gate: two in the first run
   (Cucumber's existing `retry: 1`) and one in the fresh app. (A Scenario
   Outline row is selected by its example line.)
   (`cucumber-js @rerun.txt` does not work in this configuration, and
   positional paths are merged with the profile's `paths` in Cucumber 13;
   both were tried. Scenario id tags are not usable either: `glance.feature`
   reuses `@F34-1` across scenarios.)
5. Any scenario that fails again fails the gate. If all pass, the script
   prints a clearly marked block, `Acceptance rerun passed: <n> scenario(s)`,
   listing each `path:line` and name and the first-attempt error, and exits 0.
   `release.sh` already captures its output in the release log; the release
   incident lists the block verbatim (the releasing-blanc skill says so).

**(owner)** A passing rerun lets the release proceed without a separate
approval, provided it is logged as above. The scenario did pass, on the same
commit and build inputs, and Cucumber's existing `retry: 1` already lets a
scenario pass on a second try inside the same app; this adds one more try in
a fresh app and makes it visible. (The stricter alternative, rerunning only
app-health failures, was offered and declined.)

**(owner)** The cap is 10 first-run failures. Attempt 2 had 5 from one crash;
the timed run had 190 from one crash plus the F57 teardown; with healing in
place one crash costs one scenario, so more than 10 means something real.

### 4. The nightly run is read

- One issue per standing flake (the four above), each linking three nightly
  runs where it failed and the error text. Fixing each is its own task with
  its own root cause; this design does not guess at them.
- *(My call)* `nightly-desktop.yml` uploads the JSON formatter output as a
  run artifact, so timing and failures can be compared across nights without
  re-running anything.
- *(My call)* The releasing-blanc skill's preflight gains one line: check the
  latest nightly run before starting; a red nightly on the release commit is
  a reason to look first, not a block.

### 5. The operator's environment

- *(My call)* `scripts/release.sh` runs its press gate and packaged checks
  under `caffeinate -dimsu` when `caffeinate` exists (macOS), so the display
  cannot sleep during a 40-minute test run. The releasing-blanc skill and the
  worktree instructions say to use a worktree path nobody else knows and to
  name it to the owner.

## Order of work

**(owner)** The next 1.44.0 attempt waits for PR A only: the harness fix
lands first, then the release is retried with the operator notes applied by
hand (caffeinate, a private worktree); PR B and PR C follow. The sections
split into pull requests like this, and the repository keeps docs and site
changes in their own PRs:

- **PR A, harness only (§1, §2):** `test/desktop/` and the `BLANC_TEST`-only
  test hook. The nightly and PR slices get it for free. On its own it removes
  most of the lost time and the cascades.
- **PR B, the gate (§3, §5):** `scripts/acceptance-gate.mjs`, `package.json`,
  `scripts/release.sh`, the releasing-blanc skill and its unit test.
- **PR C, nightly (§4):** the workflow artifact, plus the four issues (no PR
  needed for issues).

PR A first, then the 1.44.0 retry, then PR B; PR C whenever. The 1.44.0
retry therefore runs with today's gate (no rerun yet) on a healed, faster
suite.

## What done looks like

- `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @F57`
  on this Mac finishes with every scenario passing, in under 2 minutes plus
  F57-8's stated wait, and the plan's before/after table shows each F57
  scenario's time.
- The full `runnable` run on this Mac reports under 10 minutes of test time in
  the JSON, and the GitHub nightly under 12 minutes wall-clock.
- A harness test proves healing: a scenario that crashes the active tab's
  renderer through a new `BLANC_TEST`-only test hook (`forcefullyCrashRenderer`
  on the active tab's `webContents`) is followed by three ordinary scenarios,
  and only the crashing one fails; the summary reports one relaunch.
- `scripts/acceptance-gate.mjs` has unit tests over recorded JSON: no
  failures; two failures that pass on rerun (prints the block, exit 0); one
  that fails again (exit 1); eleven failures (exit 1 without rerunning).
- `test/unit/` asserts that `release:verify:press` invokes the gate script
  and that `release.sh` wraps the gate in `caffeinate` on macOS (the same
  file already pins `MIGRATION_BASE_VERSION`).
- The four nightly flakes have open issues; the nightly workflow uploads its
  JSON.

## Left to the builder

- Exactly where the fresh-profile relaunch sits relative to
  `createSyncFixture()` and `reset` in the F57 hooks, and how `peerApps` and
  `relaunchEnv` are kept straight when the After hook returns to the main
  profile.
- Which F57 steps still exceed 10 seconds on a fresh profile, and which of
  those may call `resetRequestWindow` (never the budget scenarios or F57-8).
- The plan targets `origin/main`; the checkout this document was written in
  is on an older branch.
- The health check's exact error matching, and whether a second
  `Target crashed` needs a short back-off before the relaunch.
- The gate script's JSON parsing and its output format, and whether the
  rerun's own JSON is also kept.
- Finding what closes the app after "Deleting a Space frees a full account
  immediately" (the experiment is running as this file is written) and fixing
  that in the same plan if it is a harness bug.
