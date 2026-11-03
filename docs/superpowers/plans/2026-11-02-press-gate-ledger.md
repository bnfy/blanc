# Press Gate Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A release press gate that never re-runs a stage or acceptance scenario that already passed, verifiably, on the same commit and installed inputs, and that can run ahead of the release with `npm run release:prepare`.

**Architecture:** One new script, `scripts/release-gate.mjs`, owns the stage list (formerly the `release:verify:press` `&&` chain), the key, an append-only NDJSON ledger under `output/release-gate/<commit>/`, verification and the evidence block. Pure functions (key digest, ledger parsing, stage reuse, scenario outcomes from Cucumber message streams, the owed set, the evidence text) are exported and unit-tested; the CLI wires them to `git`, `npm` and `spawn` through an injectable runner so orchestration is unit-tested too. `scripts/acceptance-gate.mjs` gains a scenario selection and Cucumber `message` output; `test/desktop/cucumber.mjs` gains a `remaining` profile.

**Tech Stack:** Node 22 ESM, `node --test`, `@cucumber/cucumber` 13 (`message` formatter), bash (`release.sh`, unchanged except its echo line).

**Spec:** `docs/superpowers/specs/2026-11-02-press-gate-ledger-design.md`.

## Global Constraints

- No stage's command, order or retry budget changes. `acceptance-gate.mjs` keeps `retry: 1`, the 10-failure cap and the fresh-process rerun with its `Acceptance rerun passed` block.
- A pass is reused only when its key digest equals the current one, its evidence file exists with the recorded SHA-256, and it is within the freshness limit. `security` never reuses.
- A dirty tree records and reuses nothing.
- `release.sh` keeps `npm run release:verify:press` after `npm ci --prefix site`, inside the non-resume branch (`test/unit/release-manifest.test.js` pins this).
- No network, Electron or 1Password in unit tests; the runner is injected.
- A 1.46.0 release runs on this Mac while this is built: do not launch Electron or the acceptance suite locally. Unit tests and the 1.4 s dry run only; CI proves the rest.
- `npm run lint` stays clean.

## Tasks

### Task 1: Pure core (`scripts/release-gate.mjs`)

- [ ] Write `test/unit/release-gate.test.js` first, covering:
  - `keyDigest` is stable for equal keys (key order irrelevant) and changes with each of commit, node, npm, platform, arch, rootInstall, siteInstall, electron, env.
  - `envFingerprint` ignores release-operator variables and unrelated variables, and changes with `BLANC_TEST`, `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`.
  - `parseLedger` returns records in order and ignores a torn last line.
  - `stagePass` refuses: another key digest, a missing log, a log whose SHA-256 changed, a pass older than the limit, a `failed` record, and any record for a `fresh` stage; and returns the newest valid pass otherwise.
  - `scenarioOutcomes(messages)`: a passing scenario; one failing then passing on retry (passed); a final failure (with first error line); a scenario started but never finished (absent); outline rows keyed by their own line.
  - `acceptanceState(expected, runs)` and `owed(...)`: passes from any recorded run under the key count; earlier failures are kept for the evidence; names must match.
  - `evidenceBlock(...)` lists every stage and the scenarios that passed after failing in an earlier attempt.
- [ ] Implement the exports to make them pass: `STAGES`, `FRESHNESS_MS` (48 h, pending D2), `keyDigest`, `envFingerprint`, `parseLedger`, `stagePass`, `scenarioOutcomes`, `acceptanceState`, `owed`, `evidenceBlock`.
- [ ] `node --test test/unit/release-gate.test.js`, `npm run lint`; commit.

### Task 2: Orchestration (`run`, `verify`, `status`, `prepare`)

- [ ] Tests first, with an injected runner and a temp repo directory standing in for the worktree:
  - a first `run` records each stage; a second `run` under the same key skips them and runs only `security`;
  - stop-on-failure: a failing stage stops `run` and later stages do not run; `keepGoing` runs them and records their passes;
  - a changed key (different `rootInstall`) reruns everything;
  - a dirty tree runs every stage and writes no ledger;
  - acceptance: the first attempt runs everything, records its message file; the next attempt passes only the owed `path:line` list; `verify` passes once every expected scenario passed;
  - an interrupted acceptance run (runner reports a signal) still records the message file it wrote, and `run` exits 130.
- [ ] Implement `computeKey` (git, npm, hashes), `run`, `verify`, `status`, `prepare` and the CLI. Stage output is streamed to the terminal and to `logs/<attempt>-<stage>.log`. `prepare` warns when HEAD is not `origin/main`, starts `caffeinate -dimsu -w <pid>` on macOS, runs `ublock:distribution`, `npm ci`, `npm ci --prefix site`, then `run` with keep-going.
- [ ] Tests green, lint; commit.

### Task 3: Acceptance selection and message output

- [ ] `test/desktop/cucumber.mjs`: a `remaining` profile (`rerun` with `retry: 1`); `BLANC_ACCEPTANCE_MESSAGES` adds `['message', path]` to the gate's formats (a `[type, path]` pair, as for the JSON report).
- [ ] `scripts/acceptance-gate.mjs`: `--only <file>` (a JSON list of `path:line`) selects through `remaining`; message files for the first run and the fresh rerun go to `BLANC_ACCEPTANCE_MESSAGES_DIR` when set. Without either it behaves exactly as today.
- [ ] Extend `test/unit/acceptance-gate.test.js`: profile shape; argument building for a selection. Lint; commit.

### Task 4: Wiring

- [ ] `package.json`: `release:verify:press` → `node scripts/release-gate.mjs run`; add `release:prepare` → `node scripts/release-gate.mjs prepare` and `release:gate:status` → `node scripts/release-gate.mjs status`. Keep `test:acceptance:gate` and its `pretest` (`runtime:check`), which the acceptance stage runs.
- [ ] Update `test/unit/acceptance-gate.test.js`'s press-gate assertion to check the stage list in `release-gate.mjs` (the acceptance stage runs `test:acceptance:gate`, never `test:acceptance:desktop`) and that `STAGES` keeps the old chain's order.
- [ ] `release.sh`: echo line only. `npm run test:unit` green; lint; commit.

### Task 5: Runbook

- [ ] `docs/release-verification.md`: a section "Run the press gate ahead of time, and resume it" (prepare, status, what voids a pass, holding merges, quoting the evidence block).
- [ ] `.claude/skills/releasing-blanc/SKILL.md`: preflight step for `release:prepare`; "When something fails" for gate resume; records step quotes the evidence block. Keep the wording `test/unit/release-manifest.test.js` and `acceptance-gate.test.js` require.
- [ ] Spec status line updated; commit.

### Task 6: PR

- [ ] Push, open the PR, bind it, wait for CI green.

## What to watch on the first real release

- `release:prepare`'s key equals `release.sh`'s after its `npm ci` (same Node: run both from the same shell setup). If `status` shows a different key, compare the `attempt` records' keys field by field.
- The evidence block reaches the release log and the incident.
