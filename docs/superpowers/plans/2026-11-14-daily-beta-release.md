# Daily Blanc Beta release implementation plan

> Executed inline (owner preference), task by task, TDD, a commit per task.

**Goal:** a daily Blanc Beta costs the owner one Terminal window on the MacBook
Pro, with everything decidable decided beforehand and the full suite run nightly.

**Spec:** `docs/superpowers/specs/2026-11-14-daily-beta-release-design.md`

**Tech:** Node 22 ESM (`node --test`), bash wrappers, a LaunchAgent plist.
Everything new lives in `chromium/release/` (daily tooling in
`chromium/release/daily/`), next to `release.mjs`, which is not changed.

## Global constraints

- `release.mjs` stages, order, confirmations and refusals stay as they are.
- No secret on argv, disk or screen. Fixed error messages (`policy.mjs`
  `check`/`reason`), as the rest of `chromium/release/`.
- Write files `wx` and open-once (CodeQL rules from the runbook, lesson 17).
- The build guard is never bypassed; the nightly stops on any guard refusal.
- Mac Studio base folder: `~/Projects/Blanc` (`repo/`, `src/`, `records/`,
  `evidence/foundation/`, `scripts/`), overridable with `BLANC_STUDIO_BASE`.

## Review focus

1. A standing waiver retired later must not invalidate earlier releases'
   verification (`until` is exclusive, history kept).
2. A carried gate whose code changed must stop the release (glob matcher
   covers nested paths, renames and deletions via `git diff --name-only`).
3. A changed file the scenario map doesn't cover forces the full suite.
4. The nightly never runs while a release, a build or uncommitted work is
   present on the Mac Studio.
5. The site PR generator refuses when waivers/limitations change.

---

### Task 1: Standing gate decisions

Files: create `chromium/release/standing.json`, `chromium/release/standing.mjs`,
`chromium/release/standing.test.mjs`; modify `policy.mjs` (`waiverAllowed`).

- `standing.json`: `{schema:1, waivers:{gate:{since, until?, reason}}, carried:{gate:{paths:[glob], lastPass:{version, sourceCommit, evidence}}}}`.
  Seed: both waivers since `2.0.0-beta.5` with the owner's standing reasons;
  carried `webauthn` and `sparkle-N-to-N+1` from beta.4 (the Touch ID pass
  on `e47bf1bcf`, the update proof from beta.2, the handoff beta.3→beta.4).
- `standing.mjs` exports `loadStanding(file?)`, `betaNumber(version)`,
  `standingWaiver(standing, version, gate) -> reason|null`,
  `globMatch(glob, file) -> bool` (`**`, `*`), `carriedState(standing, gate, changedFiles) -> {carried, touched[]}`,
  `changedFiles(fromCommit, toCommit, repo) -> string[]`.
- `policy.waiverAllowed` also accepts `standingWaiver(...)`.
- Tests: waiver active within [since, until); retired waiver still valid for
  its range; unknown gate refused; glob cases; carried false when any path
  touched.

### Task 2: Release preparation (`daily/beta-prep.mjs`)

Pure core `prepare({ledger, standing, night, changed, inputs, notesBody, date})`
returns `{release, sources, notes, handChecks}`; CLI writes WORK (700),
`release.json`, `local-inputs.json`, `SOURCES.json`, `payloads/release-notes.md`,
`RELEASE-IN-PROGRESS`, points the outbound config at the candidate, and runs
`gate-evidence.mjs plan`. Release identity fields copied from `policy.mjs`
constants; version/build from ledger + 1; `gateWaivers` from standing;
`archWaiver` standing text. Tests against beta.4's real values.

### Task 3: Website PR and records (`daily/site-pr.mjs`, `daily/beta-record.mjs`)

`site-pr.mjs` pure `siteFiles({release, appcast, dmgBytes, previous})` returns
the new file contents; refuses when the previous ledger's limitations differ
from the release's waivers. CLI downloads with `curl`, makes a `origin/main`
worktree, writes, runs `node --test test/unit/site-blanc-beta.test.js`,
commits, pushes, `gh pr create`. `beta-record.mjs` appends the ledger entry,
updates standing `lastPass`, removes `RELEASE-IN-PROGRESS`. Tests regenerate
beta.4's committed site files from beta.3's.

### Task 4: One release command

`owner/remote/beta-release.command` (MacBook Pro) and
`owner/beta-release-remote.sh` (Mac Studio). Stage list and resume logic in
`daily/release-steps.mjs` (`nextSteps(statusDone, handChecksRequired)`), unit
tested; shell checked with `bash -n` and a stubbed dry run.

### Task 5: Nightly and targeted rerun

`daily/nightly.mjs` (skip rules `shouldSkip({...})`, pass rule
`judgeSuite(baseline, knownFailures)`, version bump `bumpBetaArgs(text, version, build)`
that only changes the two reviewed keys), `daily/known-failures.json`,
`daily/scenario-areas.json`, `daily/targeted.mjs` (`planTargeted(changed, areas, inventory) -> {full:true, why} | {cases}`),
`daily/me.bnfy.blanc.beta-nightly.plist`. Unit tests for each pure function.

### Task 6: Runbook and verification

New "Daily beta" section in `docs/chromium-beta-release.md`; fork unit suite;
push to `chromium/next`; install the LaunchAgent only when no build runs.
