# A press gate that never repeats a pass

November 2, 2026. **Status: approved by the owner on November 2, 2026, with the recommended
answer to D1–D4.**

**Relates to:** `scripts/release.sh` (the press verification gate),
`package.json` (`release:verify:press`), `scripts/acceptance-gate.mjs` and
`test/desktop/cucumber.mjs` (the acceptance step),
`docs/release-verification.md` and the releasing-blanc skill (the runbook),
and `docs/superpowers/specs/2026-10-27-acceptance-gate-speed-design.md`
(the in-run rerun this design keeps).

Marks: **(owner)** is the owner's decision in chat. *(My call)* is a builder
default the owner hasn't ruled on yet. **Decision D1–D4** are the questions
the owner answered on November 2, 2026; each took the recommended option.

## Why

Publishing 1.46.0 on November 2, 2026 took four attempts before the fifth
reached the gate again:

1. The 1Password authorization timed out.
2. Two focus-dependent Island auto-hide scenarios flaked (F1-26, F1-37) when
   another app took focus.
3. A Ctrl+C stopped it.
4. A Shared Spaces two-client scenario (F57-8) failed its first try.

Each failure restarted the whole press gate, about 40 minutes on this Mac,
from the beginning, while the owner kept the Mac idle. In the owner's words,
the gate is "extremely fragile and inefficient and makes these new build
releases very painful for me to sit through."

The gate runs before any tag or build, so none of those attempts published
anything; the cost was time. Every repeat re-proved checks that had already
passed on the same commit with the same dependencies: attempts 2 and 4
each failed on one or two of 593 acceptance scenarios, and none of the four
failures was in another stage.

Today a relaunch has no memory. `release:verify:press` is one `&&` chain of
sixteen npm scripts, and `BLANC_RELEASE_RESUME_FROM` only resumes the packaged
checks after a stamped build. A failure anywhere in the gate, or a Ctrl+C,
throws away every pass before it.

## Goals, non-goals, anti-goals

- **Goal:** a relaunch on the same commit and the same installed inputs runs
  **only the work that has not yet passed**: stages that failed or never ran,
  and, inside acceptance, only the scenarios that failed or never ran.
- **Goal:** the owner can **run the gate ahead of time**, unattended and
  without credentials, so the release command itself spends seconds on the
  gate instead of 40 minutes, and both 1Password prompts arrive within a
  minute of each other.
- **Goal:** every skip is **verified, not trusted**. A skip happens only when
  the raw evidence for that pass (its log, or Cucumber's own message stream
  for each scenario) is on disk, matches its recorded digest, and was
  produced under the exact key being released.
- **Goal:** the release incident can cite one printed evidence block for the
  whole gate, including every scenario that passed only after failing in an
  earlier attempt.
- **Non-goal:** running checks on a different commit, or trusting CI's green
  run on the same commit. A pass counts only for the commit that ships.
- **Non-goal:** sharding acceptance across parallel apps (direction 4,
  rejected below).
- **Non-goal:** changing what any stage or scenario checks, its retry budget
  inside a run, or the 10-failure cap of the fresh-process rerun.
- **Anti-goal:** shortening or silently waiving a gate. `CLAUDE.md`: "Do not
  shorten or silently waive any updater, evidence, media, freeze, or soak
  gate." Every stage and every scenario still has to pass on the exact commit
  that ships; this design only stops re-proving a pass it can prove.
- **Anti-goal:** hiding a failure. An earlier failure of a scenario that later
  passed is printed in the evidence block, never dropped.

## The four directions

| | Direction | Verdict |
|---|---|---|
| 1 | Per-stage and per-scenario pass stamps, keyed by commit and runtime | **Recommended, as the mechanism** |
| 2 | Run the gate ahead of time, `release.sh` verifies the stamp | **Recommended, built on 1** |
| 3 | Harden or isolate the focus-dependent scenarios | Follow-up; 1 makes a focus flake cost seconds |
| 4 | Shard acceptance across parallel workers | Rejected |

**Recommendation: 1 and 2 together, as one change.** Direction 2 on its own
(one stamp for the whole gate) still throws away a 39-minute run when the
last scenario flakes, and still restarts from scratch after a Ctrl+C. Direction
1 on its own still makes the owner sit through the first full run inside the
release command. Together: the gate is run once, ahead of time, by a command
that needs no secrets; anything that fails there is retried alone; and
`release.sh` finds a complete, verifiable record and moves straight to the
build.

**Direction 3** stays worth doing, but its cost changes: with per-scenario
resume a stolen focus costs a rerun of F1-26 and F1-37 (a few seconds), not
the gate. Making the auto-hide reveal watch testable without OS focus is
product-adjacent work with its own root cause (`test/desktop/` and the Island
reveal timing), so it is proposed as its own task after this lands.

**Direction 4** is rejected for the reason the October 27 design gave:
keyboard focus is one per Mac, and the acceptance suite drives real windows,
so parallel apps on the release Mac would trade one flake class for a worse
one. The suite is about 20 minutes of test time already; resume removes the
repeats, which are the real cost.

## Design

### 1. The gate becomes a list of stages with a ledger

`release:verify:press` becomes `node scripts/release-gate.mjs run`. The
script holds the stage list that was the `&&` chain, in the same order and
with the same npm scripts:

| Stage | Command | Reused when passed |
|---|---|---|
| `substrate` | `npm run substrate:check` | yes |
| `windows-icons` | `npm run icons:windows:check` | yes |
| `unit` | `npm run test:unit` | yes |
| `acceptance-dry` | `npm run test:acceptance:dry` | yes |
| `acceptance` | the acceptance gate (§3) | per scenario |
| `favorites-picker` … `dns-smoke` | the nine desktop smokes, one stage each | yes |
| `security` | `npm run release:security` | **never** (§4) |
| `site` | `npm run site:build` | yes |

For each stage, `run` asks the ledger (§2) whether this stage has a verified
pass under the current key. If it does, it prints
`skip <stage>: passed at <time> (attempt <n>), log sha256 <digest>` and moves
on. If not, it runs the stage, streams its output to the terminal as today
and to a log file, and appends a record of the result. *(My call)* Inside
`release.sh`, the first failing stage stops the gate, as the `&&` chain does
now, so the owner hears about a real failure at once. The ahead-of-time
command (§5) keeps going past a failed stage, so one unattended run collects
every pass it can.

After the last stage, `run` calls `verify` (§6), prints the evidence block,
and exits 0 only if `verify` agrees that every stage passed.

### 2. The key and the ledger

A pass is reused only under the same **key**, computed fresh on every
invocation, after `npm ci`:

- `commit`: `git rev-parse HEAD`, and only with a **clean** tree
  (`git status --porcelain` empty; `output/` is ignored). On a dirty tree the
  gate still runs every stage but records nothing and reuses nothing, so a
  pass can only ever be attached to a commit that fully describes the source.
- `node`: `process.version`, plus `npm --version`.
- `platform` and `arch` (`darwin`, `arm64`).
- `rootInstall` and `siteInstall`: SHA-256 of `node_modules/.package-lock.json`
  and `site/node_modules/.package-lock.json`, npm's record of the tree it
  actually installed. They are byte-identical across `npm ci` runs of the
  same lockfile (checked on November 2 against the running 1.46.0 release
  worktree: the only difference was the root package's own version, which
  the commit also fixes), so release.sh's own `npm ci` does not invalidate a
  pass made ahead of time, while any other installed tree does.
- `electron`: the installed `electron` version and the SHA-256 of the binary
  `require('electron')` names and, on macOS, of `Electron Framework`, so a
  different Electron build never inherits a pass.
- `env`: a digest of every `BLANC_*`, `ELECTRON_*` and `NODE_OPTIONS`
  variable that is set, except the release operator's own inputs
  (`BLANC_RELEASE_*`, `BLANC_COSIGN_*`, `BLANC_EVS_PYTHON`, `EVS_*`,
  `BLANC_MAC_*`, `BLANC_MIGRATION_BASE_VERSION`), which no stage reads. A
  test override such as `BLANC_TEST=0` changes the key. Values are hashed,
  never written.

The key's SHA-256 is the **key digest**. The ledger lives in the release
worktree at `output/release-gate/<commit>/`:

- `ledger.ndjson`: append-only records, one JSON object per line, each
  carrying the key digest: an `attempt` record (number, start time, the key
  itself), one `stage` record per finished stage (`passed` or `failed`, exit
  code, start and finish times, log file name and its SHA-256), and one
  `acceptance-run` record per Cucumber process (its message file and SHA-256).
  A torn last line, left by a killed process, is ignored.
- `logs/<attempt>-<stage>.log`: each stage's combined output.
- `acceptance/<attempt>-<run>.ndjson`: Cucumber's own `message` formatter
  output for each acceptance process (§3).

Different keys under one commit (a different Node, say) share the folder and
never see each other's passes.

### 3. Acceptance resumes per scenario

`scripts/acceptance-gate.mjs` keeps its behaviour inside one attempt: the
`runnable` profile with Cucumber's `retry: 1`, then one fresh-process rerun
of 1–10 final failures, then the `Acceptance rerun passed` block. It gains:

- **Cucumber's `message` formatter** for every process it starts, written to
  the ledger's `acceptance/` folder. Cucumber writes it as each event happens,
  so a Ctrl+C or a crash loses at most the scenario that was running. The
  file holds every pickle (scenario name and `path:line`) and every step
  result for every attempt; the gate's own outcome for a scenario is derived
  from it, never written separately.
- **A selection**: given the scenarios still owed, it runs exactly those, by
  `path:line`, through a new profile `remaining` (the `rerun` profile with
  `retry: 1`, so a scenario resumed later gets the same in-run budget as in a
  full run). With nothing yet passed, it runs the plain `runnable` profile.
  (`path:line` locations from the message stream are unique and equal the
  JSON report's: all 593 matched on November 2.)

The **expected set** is computed on every invocation by a `runnable` dry run
with the `message` formatter (1.4 s), not stored. A scenario is **passed**
under a key when some message file recorded for that key contains its final
attempt (`willBeRetried: false`) with every step `PASSED`, under the same
`path:line` and name. The stage passes when every expected scenario is
passed. Its `stage` record is written then, but `verify` re-derives it from
the message files regardless.

Inside one attempt nothing changes: more than 10 final failures still fail
at once without a fresh rerun, and a fresh rerun that fails still fails the
attempt. The difference is the next attempt: it starts from the scenarios
still owed, not from 593.

**Decision D1 — how many attempts may a scenario take across relaunches?**
Today's gate already allows any number: a relaunch reruns every scenario,
and a scenario that failed in attempt N passes in attempt N+1 with no record
of N. So:

- **(a) (owner) Chosen:** no extra cap, matching today, with every earlier
  failure printed in the evidence block (scenario, attempt, first error line)
  and quoted in the release incident with the existing `Acceptance rerun
  passed` blocks. This is strictly more disclosure than today.
- (b) A cap: a scenario that failed in two separate attempts at one key
  stops the gate until a new commit or an explicit written waiver. Safer
  against a real intermittent bug passing on the third relaunch; costs a new
  commit, and therefore a whole fresh gate, when a flake repeats.

### 4. Freshness

**Decision D2 — how long does a pass stay valid?** The commit fixes the code,
but three stages also depend on the outside world: `release:security`
(today's advisory database), the Web Store smoke and the DNS smoke (live
sites).

- **(a) (owner) Chosen:** `release:security` always reruns (it takes seconds and
  its input is not the commit); every other pass is valid for **48 hours**,
  enough to run the gate in the evening and release the next day.
- (b) 24 hours for everything reusable.
- (c) No limit beyond the key.

### 5. Run it ahead of time: `npm run release:prepare`

A new command, `npm run release:prepare` (`release-gate.mjs prepare`), for
the private release worktree (the one `release.sh` will run in, detached at
`origin/main` after the prep and What's New PRs have merged):

1. Refuses a dirty tree; fetches and **warns** if HEAD is not `origin/main`
   (its passes will be used only if this commit is what ships).
2. Keeps the Mac and display awake (`caffeinate -dimsu -w <pid>`), as
   `release.sh` does.
3. Runs `npm run ublock:distribution`, `npm ci` and `npm ci --prefix site`,
   exactly as `release.sh` does before its gate, so the key matches.
4. Runs every stage with keep-going (§1), then prints the evidence block or
   the list of what is still owed.

It needs no 1Password, no Sigstore, no Terminal.app and no TTY, and
publishes nothing, so an agent may run it in the background; it is not a
release and the background-release rule does not apply to it. The Mac must
still stay unused while acceptance runs (focus), which is why it is useful to
run it while the owner is away. Running it again resumes: it runs only what
is still owed.

`release.sh` itself changes only in its echo line: it still runs
`npm run release:verify:press` after its own `npm ci`, in the same place,
inside the non-resume branch. When the ledger is complete that takes a few
seconds (key, dry run, verify); when it is not, it runs only what is owed.

**Anything landing on `main` after the gate ran changes the commit** and
voids every pass, by design. The runbook says to run `release:prepare` after
the last merge and to hold merges to `main` until the release command
starts.

### 6. Verify and the evidence block

`node scripts/release-gate.mjs verify` (also run at the end of every `run`)
recomputes the key and, for every stage, checks:

- a `passed` record under the current key digest, younger than the D2 limit;
- its log file exists and its SHA-256 matches the record;
- for `acceptance`, the expected set from a fresh dry run, every scenario
  passed in a recorded message file whose SHA-256 matches its record.

It prints one block for the release log, which the release incident quotes
verbatim:

```
Press gate evidence: commit 4f79a13ba… key 3c9e…(12)
  substrate          passed 2026-11-02T21:03:11Z  attempt 1  log 9b1f…
  …
  acceptance         593/593 passed in 2 attempt(s)
    passed after failing in an earlier attempt:
      spec/acceptance/shared-spaces.feature:412  Two complete desktop clients converge through the Worker
        attempt 1: Timed out waiting for device B to see the Work space
  security           passed 2026-11-02T22:40:02Z  attempt 3  (always rerun)
  site               passed …
Ledger: output/release-gate/<commit>/ledger.ndjson sha256 …
```

`node scripts/release-gate.mjs status` prints the same table without running
anything, for the operator deciding whether to start the release.

**Decision D3 — where does the evidence live after the release?**

- **(a) (owner) Chosen:** the release incident quotes the evidence block and the
  ledger's SHA-256; the ledger folder stays in the release worktree until the
  records PR merges.
- (b) Also commit the ledger and stage logs under
  `docs/release-incidents/evidence/<version>/` (a few MB of logs per
  release, in a public repository).

### 7. What this does not change

- `BLANC_RELEASE_RESUME_FROM` (packaged checks after a stamped build) stays as
  it is. The two resumes are independent: the gate ledger proves the source
  checks, the build stamp proves the build.
- Every preflight in `release.sh` still runs first, and the immutability,
  clean-sources and `HEAD == origin/main` checks still precede the gate.
- Nightly and pull-request acceptance stay the plain `test:acceptance:desktop`.

### 8. Threat model

The ledger defends against mistakes: a pass from another commit, another
dependency tree, another Electron, a test override, a stale run, a killed
run's partial file, or an edited log. It does not defend against an operator
who edits the ledger on purpose; such an operator could as easily edit
`release.sh`. The digests let anyone holding the worktree check the evidence
block against the files it names.

## Decision D4 — approve the approach

**(owner)** Approved: 1 + 2 as designed (§1–§6), with direction 3 proposed
as a follow-up task and direction 4 rejected.

## What done looks like

- `scripts/release-gate.mjs` with unit tests (`test/unit/release-gate.test.js`)
  for: key determinism and each input changing it; a dirty tree recording
  nothing; ledger append and a torn last line; stage reuse refused for a
  different key, a changed log, an expired pass, or `security`; per-scenario
  outcomes from recorded message streams (pass, retry then pass, final
  failure, interrupted mid-scenario); the owed set; stop-on-failure inside
  release.sh versus keep-going in prepare; a Ctrl+C keeping the passes it
  recorded; the evidence block listing earlier failures.
- `release:verify:press` runs the gate script; `release:prepare` exists; the
  existing release and acceptance-gate unit tests updated to match.
- `docs/release-verification.md` and the releasing-blanc skill describe
  `release:prepare`, resuming the gate, `status`, and quoting the evidence
  block.
- A PR with CI green.
- Not verifiable in this PR: a real release using it. The first release after
  merge is its proof; the plan says what to watch.
