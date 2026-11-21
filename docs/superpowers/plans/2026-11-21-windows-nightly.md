# Windows Nightly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every night with new source on `chromium/next`, the Mac Studio has the Linux build server build a Windows prototype and a Windows beta from one commit, checks both on GitHub Windows runners, and leaves a judged, release-ready beta candidate that a morning release can use unchanged.

**Architecture:** A Node orchestrator on the Mac Studio (`desktop-nightly.mjs`, LaunchAgent at 04:00) drives the server over SSH through one server-side script that owns the build checkout from checkout to packaging, keeps the zips locally, uploads them to the `fork-windows-candidate` draft under two asset names (beta and prototype side by side, so nothing is swapped under a running job), dispatches `chromium-windows-candidate.yml` pinned to the night's commit, binds every result to the exact run and candidate, and judges like the Mac nightly. One exclusive hold on the draft keeps a night, a release and a hand upload from replacing each other's candidate. Release prep reads the newest passing night and writes the release work folder; the ten `windows-release.mjs` stages stay, with a schema-2 descriptor carrying the candidate's commit and version, and `verify-public` releasing the hold.

**Changes from the spec, stated openly:**
1. The spec moved the Windows release record to the Mac Studio so the night and releases share a lock. The plan puts one exclusive lock on the `fork-windows-candidate` draft itself, which both Macs reach with `gh`; release records and the owner's stages stay on the MacBook Pro.
2. The spec said the candidate workflow changes on `main`. `gh workflow run --ref chromium/next` runs the copy on `chromium/next` (as `windows-release.mjs` already dispatches it), so the workflow changes there only; `main`'s copy only has to exist and is left alone.

**Tech Stack:** Node 22 ESM (`node:test`), bash, `gh`, SSH/scp, GitHub Actions (PowerShell job), launchd.

**Spec:** `docs/superpowers/specs/2026-11-21-windows-nightly-design.md`

## Global Constraints

- The build server holds no GitHub credential; every `gh` call runs on the Mac Studio or the MacBook Pro.
- Build only through `chromium/tools/build.mjs`; never `ninja -t`; never a build while another `siso ninja` runs; never touch the Android checkout or `~/depot_tools` (Windows uses `~/depot_tools-desktop`). Server Node: `~/chromium-desktop/src/third_party/node/linux/node-linux-x64/bin`.
- A night re-records the guard's environment only when the guard names only `argsSha256` **and** the beta `args.gn` text equals the committed `beta-x64.gn` except the `blanc_beta_version` and `blanc_beta_build` lines, and the prototype `args.gn` equals the committed `prototype-x64.gn` exactly.
- Build plans are capped like the Mac nightly: `build.mjs --build --allow-large-build --max-actions=3000`.
- The night never pushes to any branch and never publishes or signs anything.
- Night records live on the Mac Studio under `~/Projects/Blanc/records/nightly/windows/`; the Mac nightly's checkout `~/Projects/Blanc/repo` is never moved; the night uses its own worktree `~/Projects/Blanc/desktop-nightly`.
- LaunchAgent label `me.bnfy.blanc.desktop-nightly`, 04:00 local time.
- Draft assets: `blanc-windows-candidate.zip` (the beta; the name every release stage reads), `blanc-windows-prototype.zip` (the night's suite build), `draft-hold.json` (the one exclusive hold).
- Claim rule, agreed with the Linux session 2026-11-21: a claim in `chromium/release/build-reservations.json` (`sequences["desktop-158"]`, Linux L3 Task 5's schema and helper) names its source commit and platforms; a release is valid only if no claim made before its own holds a build number at or above its number for different source; an abandoned claim stays a gap; the release proves its candidate matches the claim (`candidate.json` `treeCommit` = `sourceCommit`, `version` = `158.0.8127.<build>`, channel `beta`). A night that loses its number is never released; the next night builds at a higher one.
- Never print a secret; failures print fixed messages, as `windows-release.mjs` does.
- Fork work goes to `chromium/next` by merge; the fork unit suite and both `check-patches.py` lanes must pass before every push.

## Review Focus

1. **A release and a night start at the same moment.** Only one can create `draft-hold.json` (upload without `--clobber` fails when it exists); the loser stops without touching the draft. → Task 3 test (simultaneous acquire).
2. **A night dies holding the draft** (Mac Studio reboot): the hold stays until a person breaks it with `draft-hold.mjs break`, which refuses while the Studio's `RUNNING` marker names a live process; prep prints that command. → Task 3 and Task 5 tests.
3. **A green report from another run or candidate.** The judge accepts only reports whose run id was returned by this night's dispatch and whose `candidate` and fork commit equal the night's prototype. → Task 5 test.
4. **A push lands on `chromium/next` between build and dispatch.** The runner checks out `source_commit` after proving it is on `chromium/next`, so the test harness is the night's. → Task 2 test.
5. **The committed `beta-x64.gn` gains an unrelated change** (for example `enable_widevine`): the night stops naming the changed line and does not re-record the environment. → Task 1 test.

---

### Task 1: Pure rules of the night

**Files:**
- Create: `chromium/release/daily/desktop-nightly-rules.mjs`
- Test: `chromium/release/daily-desktop-nightly.test.mjs`

**Interfaces:**
- Consumes: `judgeSuite(baseline, known, rerun)` from `chromium/release/daily/nightly.mjs`.
- Produces:
  - `nextWindowsBuild(ledger, reservations = null) -> number` — `max(ledger.builds[].build, every build in reservations?.sequences['desktop-158']) + 1`.
  - `windowsBetaArgs(committedText, build) -> string` — replaces exactly the lines `blanc_beta_version = "2.0.0-beta.<build>"` and `blanc_beta_build = <build>`; throws if either is missing or appears twice. No GN validator (the Mac `validateGN` rejects Windows arguments).
  - `argsDrift(currentText, intendedText) -> string[]` — the lines of `currentText` that differ from `intendedText`, ignoring only the two version lines (exact text, not parsed values); `[]` means no drift.
  - `skipReason({hold, macMarker, serverLock, sisoRunning, unchangedSinceLastPass}) -> string|null` — in that order; fixed messages.
  - `judgeWindowsNight({checks, suite, known, rerun, expect}) -> {status, ...}` — `checks`: `{betaInstalled, betaInstalledLaunches, betaIcon, prototypeLaunch, prototypeFrame}` booleans; `expect`: `{runIds: {suite, rerun?}, prototypeId, sourceCommit}`; fails when a check is false, when `suite.runId`/`rerun.runId` isn't in `expect.runIds`, or when `suite.candidate !== expect.prototypeId` or the report's fork commit `!== expect.sourceCommit`; otherwise `judgeSuite(suite, known, rerun)`.

- [ ] **Step 1: Write the failing tests:**

```js
test('the next build is above every ledger and claimed build', () => {
  assert.equal(nextWindowsBuild({builds: [{build: 902}, {build: 904}]}), 905);
  assert.equal(nextWindowsBuild({builds: [{build: 904}]}, {sequences: {'desktop-158': [{build: 906, platforms: ['linux']}]}}), 907);
});
test('only the version lines change', () => {
  const out = windowsBetaArgs(committed, 905); // committed = the real beta-x64.gn text, read from disk
  assert.match(out, /^blanc_beta_version = "2\.0\.0-beta\.905"$/m);
  assert.match(out, /^blanc_beta_build = 905$/m);
  assert.deepEqual(argsDrift(committed, out), []);
});
test('an unrelated argument change is named', () => {
  assert.deepEqual(argsDrift(committed.replace('enable_widevine = false', 'enable_widevine = true'), committed), ['enable_widevine = true']);
});
test('a night skips for a hold, a Mac release, a busy server or nothing new', () => {
  const clear = {hold: null, macMarker: false, serverLock: false, sisoRunning: false, unchangedSinceLastPass: false};
  assert.equal(skipReason(clear), null);
  assert.match(skipReason({...clear, hold: {kind: 'release'}}), /the candidate draft is held/);
  assert.match(skipReason({...clear, serverLock: true}), /desktop checkout is locked/);
  assert.match(skipReason({...clear, unchangedSinceLastPass: true}), /nothing new since the last passing night/);
});
test('evidence from another run or candidate fails the night', () => {
  assert.equal(judgeWindowsNight({checks: allTrue, suite: {...green, runId: 9}, known, expect}).status, 'fail');
  assert.equal(judgeWindowsNight({checks: allTrue, suite: {...green, candidate: 'windows-x64-0000000000000000'}, known, expect}).status, 'fail');
  assert.equal(judgeWindowsNight({checks: {...allTrue, prototypeFrame: false}, suite: green, known, expect}).status, 'fail');
});
```

- [ ] **Step 2: Run** `node --test chromium/release/daily-desktop-nightly.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the five exports (no I/O).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `Fork nightly: the Windows night's rules (number, args, skips, judging)`.

### Task 2: The runner tests the night's commit and either asset

**Files:**
- Modify: `.github/workflows/chromium-windows-candidate.yml` (on `chromium/next` only)
- Modify: `chromium/windows/run-suite.mjs`
- Test: `chromium/tools/windows-candidate-workflow.test.mjs` (extend or create), `chromium/tools/windows-run-suite.test.mjs` (extend or create)

**Interfaces:**
- Produces: workflow inputs `source_commit` (optional, `^[0-9a-f]{40}$`), `asset` (choice `blanc-windows-candidate.zip` | `blanc-windows-prototype.zip`, default the first), `nightly` (boolean, default false); `only` accepts `/` and up to 4000 characters; `run-suite.mjs CANDIDATE RESULTS --slice=f0 [--nightly=<runId>] [--only=...]`.

- [ ] **Step 1: Failing tests:**
  - workflow text: "Validate inputs" checks `source_commit`'s pattern; after `actions/checkout` (still the dispatch ref, full enough to reach `source_commit`: `fetch-depth: 0` or a fetch of `origin/chromium/next`), a step runs `git merge-base --is-ancestor $SOURCE_COMMIT origin/chromium/next` and fails otherwise, then `git checkout --detach $SOURCE_COMMIT`, before any step that runs repository scripts; the download step uses `inputs.asset`; the `sign` job's steps are unchanged (it never uses `source_commit`); the suite step adds `--nightly=${{ github.run_id }}` only when `inputs.nightly`; the `only` pattern is `^[A-Za-z0-9 _.,:@/-]{0,4000}$`.
  - run-suite: `suiteArguments(['--slice=f0', '--nightly=123'])` is accepted; the run points the tracker at the candidate for this run (`qualification: 'nightly run 123; not a tracker baseline'`), and the report has `nightly: '123'`, `runId: '123'`, `developmentSubset: false`; with `--nightly=123 --only=spec/acceptance/F41-named-workspaces.feature:203:plain` the report has `developmentSubset: true` and `nightly: '123'`.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `Fork Windows: candidate runs can pin a source commit, pick the prototype asset and run as a nightly`.

### Task 3: One exclusive hold on the draft

**Files:**
- Create: `chromium/windows/draft-hold.mjs`
- Modify: `chromium/windows/ship-candidate.sh` (refuse while another owner holds the draft)
- Test: `chromium/tools/windows-draft-hold.test.mjs`

**Interfaces:**
- Produces:
  - `HOLD_ASSET = 'draft-hold.json'`; hold body `{kind: 'nightly'|'release'|'manual', owner: '<host>:<pid>:<random>', startedAt, note}`.
  - `acquireHold(io, kind, note) -> owner` — `gh release upload fork-windows-candidate <file>` **without** `--clobber` (GitHub refuses an existing name); then downloads the asset and checks the owner is its own (otherwise throws "the candidate draft is held by …").
  - `readHold(io) -> object|null` — downloads the asset's JSON (`gh release download … --pattern draft-hold.json`).
  - `releaseHold(io, owner)` — deletes the asset only if its body's owner equals `owner`.
  - CLI: `node chromium/windows/draft-hold.mjs status | acquire-manual <note> | release <owner> | break --confirm` — `break` removes any hold after printing it, and for a `nightly` hold first checks over SSH that the Mac Studio's `records/nightly/windows/RUNNING` is absent or names a dead pid.
  - `ship-candidate.sh` reads the hold and refuses unless `BLANC_DRAFT_HOLD_OWNER` equals its owner.

- [ ] **Step 1: Failing tests** (fake `io`): a second `acquireHold` while one exists throws and never deletes; two acquisitions racing (the fake upload succeeds once) leave exactly one owner; `releaseHold` with someone else's owner deletes nothing; `break` on a nightly hold refuses while `RUNNING` names a live pid; `ship-candidate.sh`'s text reads `draft-hold.json` before `gh release upload`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `Fork Windows: one exclusive hold on the candidate draft`.

### Task 4: The server phase, one owner from checkout to packages

**Files:**
- Modify: `chromium/tools/build.mjs` (a holder of the checkout lock can build under it)
- Create: `chromium/windows/server/nightly-build.sh`
- Test: `chromium/tools/build.test.mjs` (extend), `chromium/tools/windows-nightly-build-script.test.mjs`

**Interfaces:**
- `build.mjs`: `acquireCheckoutLock` writes `owner` (a token) into the lock directory; when the environment has `BLANC_CHECKOUT_LOCK_OWNER` equal to the token inside an existing lock, `build.mjs` builds under that lock and does not release it. Any other existing lock refuses as today. `bootstrap.sh` writes its own token the same way. **This file is shared with the Linux lane: bring the diff to the Linux session before it lands.**
- `nightly-build.sh COMMIT BUILD STAMP`, run on the server by a fixed bootstrap the orchestrator sends over SSH: `PATH` gets the server Node and `~/depot_tools-desktop`; the bootstrap checks `pgrep -f '[s]iso ninja'` (→ `busy`), takes the lock with a fresh owner token (`mkdir` + `owner` file, → `busy` if it exists) and an `EXIT` trap that removes it only if the token is still its own, then `git -C ~/blanc-desktop fetch -q origin chromium/next && git checkout -q --detach COMMIT`, then runs the now-current `chromium/windows/server/nightly-build.sh` with `BLANC_CHECKOUT_LOCK_OWNER` set. The script prints one final JSON line `{"status":"built"|"busy"|"stopped","reason"?,"prototype":{…package.json},"beta":{…package.json}}`; packages land in `~/blanc-evidence/windows/nightly-STAMP/{prototype,beta}/`.

Script order: `mount-toolchain.sh`; `apply.py` check then `--apply --backup` **with `--previous-map ~/chromium-desktop/.blanc-applied-source-map.json`** (as `bootstrap.sh` does), then record the map; prototype: `argsDrift(out/BlancWinPrototype/args.gn, prototype-x64.gn)` must be `[]` (→ `stopped`); beta: write `windowsBetaArgs(beta-x64.gn, BUILD)` after `argsDrift(out/BlancWinBeta/args.gn, that text)` is `[]`; `gn gen` both; for each output `build.mjs --check`: if it refuses and `onlyArgsChanged` → `--record-environment`, else → `stopped` with the guard's message; then `build.mjs --build --allow-large-build --max-actions=3000` (→ `stopped` on refusal); `package-candidate.mjs` for each, all still under the lock.

- [ ] **Step 1: Failing tests:** `build.test.mjs` — with the lock present and the matching owner env, the guard proceeds and leaves the lock; with a different owner it refuses with today's message; the lock file contains the owner. Script test (text): the bootstrap checks `[s]iso ninja` first, takes the lock before `git checkout`, the trap compares tokens; `--previous-map` on both `apply.py` calls; `argsDrift` runs before any `gn gen`; `--record-environment` only inside an `onlyArgsChanged` branch; the build call carries `--max-actions=3000`; packaging happens before the trap releases the lock; the last line is JSON.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, and send the `build.mjs` diff to the Linux session; land it after they agree.
- [ ] **Step 4: Run** the tests and `bash -n` on the script. Expected: PASS.
- [ ] **Step 5: Commit** `Fork Windows: the nightly's server phase holds the checkout from checkout to packages`.

### Task 5: The orchestrator on the Mac Studio

**Files:**
- Create: `chromium/release/daily/desktop-nightly.mjs`
- Create: `chromium/release/daily/windows-known-failures.json`
- Test: `chromium/release/daily-desktop-nightly.test.mjs` (extend)

**Interfaces:**
- Consumes: Task 1 rules, Task 2 inputs, Task 3 holds, Task 4 bootstrap and script.
- Produces: `node chromium/release/daily/desktop-nightly.mjs [--now]`, records `~/Projects/Blanc/records/nightly/windows/<stamp>/result.json` `{status, reason?, sourceCommit, build, version, beta: {id, zipSha256, treeCommit, version, channel}, prototype: {id, zipSha256, treeCommit}, runs: {betaSmoke, betaCapture, suite, rerun?}, judged}`; `LAST-PASS` holds the newest passing stamp; `PLATFORMS = [{name: 'windows', …}]` (Linux is added here later).

Flow (`io` injected, as in `windows-release.mjs`): write `RUNNING` (`{pid, stamp}`), removed in `finally`; in the `desktop-nightly` worktree `fetch` and check out `origin/chromium/next`'s SHA detached (the LaunchAgent's entry script does this before loading Node modules, so new rules apply the same night); `skipReason` from `readHold`, `RELEASE-IN-PROGRESS`, an SSH probe (lock dir, `siso`), and `LAST-PASS`'s `sourceCommit`; `acquireHold('nightly')`; number from `nextWindowsBuild` (reading the reservation file when it exists); SSH bootstrap; `scp` both zips and check each SHA-256; unzip each `candidate.json` and require `treeCommit` = the night's commit, the beta's `version` = `158.0.8127.<build>` and channel `beta`, the prototype's channel `preview`; upload the prototype as `blanc-windows-prototype.zip` and the beta as `blanc-windows-candidate.zip` (`--clobber`, owner env set); dispatch three runs, each with `source_commit`, taking the run id from `gh workflow run`'s printed URL (never a time-window search): beta smoke (`suite=smoke`: install and installed launch), beta capture (`update_expect=capture:<version>`: icon), prototype suite (`asset=blanc-windows-prototype.zip`, `suite=f0`, `nightly=true`); wait on all three; download artifacts by run id; read `install.json` (`installed`, `installedLaunches`), `capture.json` (`iconVerdict.ok`), the suite report and the prototype's launch and frame receipts; rerun once the `rerunCandidates` (`only=` exact ids, joined by commas; more than 4000 characters fails the night); `judgeWindowsNight`; write `result.json`; on pass keep both zips under the stamp, point `LAST-PASS` at it, then delete the previous pass's zips here and its `nightly-*` folder on the server; on fail delete this night's zips; `releaseHold` in `finally`.

`windows-known-failures.json` is seeded only with cases `chromium/reports/w2-windows-triage.md` classifies as known Windows gaps, each with `results` and a `reason` citing the triage line. A new failure that fails its rerun keeps the night failing until it is fixed or a person adds it with evidence; the first supervised night does not add cases in bulk.

- [ ] **Step 1: Failing tests** (fake `io`): a hold held by a release stops the night before any upload and records `skipped`; both zips stay on the draft until all three runs finish (no upload after the first dispatch); every dispatch carries the night's `source_commit`; a run id is read from the dispatch output; a beta whose `candidate.json` names another commit stops the night before upload; a repeatable new suite failure leaves `LAST-PASS` unchanged; pass → fail → pass keeps only the newest passing zips on the Studio and asks the server to remove the older night's folder; `busy` from the server records a skip; the hold and `RUNNING` are removed after an exception.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the orchestrator; seed the known failures from the W2 triage.
- [ ] **Step 4: Run** the file and the whole fork suite. Expected: PASS.
- [ ] **Step 5: Commit** `Fork nightly: the Windows night on the Mac Studio`.

### Task 6: Releasing from a night

**Files:**
- Create: `chromium/release/daily/windows-beta-prep.mjs`
- Modify: `chromium/release/windows-release.mjs` (descriptor schema 2, claim checks, `verify-public` releases the hold)
- Test: `chromium/release/daily-windows-prep.test.mjs`, extend `chromium/release/windows-release.test.mjs`

**Interfaces:**
- Consumes: Task 3 holds; the Studio's `LAST-PASS` and `result.json` over SSH (`ssh -i ~/.ssh/id_ed25519_macmini -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local`), and the kept zips (scp); Linux L3 Task 5's reservation file and claim helper (which owns the rejected-push recovery). Until that lands, prep skips the claim step and says so, and the schema-2 claim checks are skipped when the file is absent.
- Produces: `node chromium/release/daily/windows-beta-prep.mjs [--records DIR] [--dry-run]` on the MacBook Pro: `acquireHold('release')` (fails if a night or anyone else holds it, printing `draft-hold.mjs status` and `break`); if the draft's `blanc-windows-candidate.zip` digest differs from the night's beta, re-uploads the kept beta zip under that name and re-checks the digest; claims `{build, sourceCommit, platforms: ['windows'], purpose}` through the Linux helper (skipped with `--dry-run`); if the claim loses, releases the hold and stops ("the night's number was taken; the next night builds at a higher one"); writes `<records>/<version>/` (mode 0700) with schema-2 `windows-release.json` (`candidate: {id, zipSha256, treeCommit, version}`, `hold: owner`) and a draft `release-notes.md` (commits since the last ledger build's `sourceCommit`), validates it through the real `load()`, and only then replaces `<records>/CURRENT` (write to a temp file and rename).
- `validateWindowsRelease`: schema 1 unchanged (completed records still load); schema 2 also requires `candidate.treeCommit === sourceCommit`, `candidate.version === version`, and, when the reservation file exists, a claim for `build` naming `windows` and `sourceCommit` with no earlier claim at or above `build` for different source.
- `RUN['verify-public']` ends with `releaseHold(io, r.hold)` (schema 2 only); `draft-hold.mjs release <owner>` covers an abandoned release.

- [ ] **Step 1: Failing tests:** prep refuses while a nightly hold exists; prep re-uploads when the draft digest differs and refuses if it still differs; an interrupted prep leaves the previous `CURRENT` untouched and releases only its own hold; `validateWindowsRelease` loads a completed schema-1 record unchanged, and rejects a schema-2 one whose `treeCommit` or `version` differs, or with an earlier higher claim for other source (Windows 905 after Linux 906 claimed earlier), and accepts a same-source shared claim; `verify-public` deletes the hold after the online proof and not before.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both files and the whole fork suite. Expected: PASS.
- [ ] **Step 5: Commit** `Fork Windows: releases start from a passing night and hold the draft until verify-public`.

### Task 7: Install, first night, records

**Files:**
- Create: `chromium/release/daily/install-desktop-nightly.sh`
- Modify: `docs/chromium-beta-release.md` (section "Windows nightly"), `chromium/STATUS.md` (Windows section)

- [ ] **Step 1: Write the installer**, modelled on `install-nightly.sh`: creates the `~/Projects/Blanc/desktop-nightly` worktree, writes `~/Projects/Blanc/scripts/desktop-nightly.sh` (fetch, detached checkout of `origin/chromium/next`, then `node chromium/release/daily/desktop-nightly.mjs`) and the `me.bnfy.blanc.desktop-nightly` LaunchAgent (Hour 4, Minute 0), `--remove` uninstalls. Test: `bash -n`, and a unit test that the plist text has the label and Hour 4.
- [ ] **Step 2: Bring `BlancWinPrototype` current once, by hand** (not built since W2): after asking the Linux session about the lock, `build.mjs --check --out=BlancWinPrototype`; review a large plan, then build it once. Expected: `build ok`.
- [ ] **Step 3: Push** to `chromium/next` (fork suite and both `check-patches.py` lanes passing); on the Mac Studio run the installer, then one supervised night from a minimal environment (`env -i HOME=$HOME PATH=/usr/bin:/bin bash ~/Projects/Blanc/scripts/desktop-nightly.sh --now`). Expected: `result.json` with `status: "pass"`, or a failure triaged case by case (fix, or add with evidence) before the next night.
- [ ] **Step 4: Release-path rehearsal, no live effects:** `windows-beta-prep.mjs --records <temp dir> --dry-run` against that night, then `node chromium/release/windows-release.mjs status <temp dir>/<version>` through the real loader, then `draft-hold.mjs release <its owner>`. Expected: work folder valid, real `CURRENT` untouched, no claim pushed, hold removed.
- [ ] **Step 5: Records and commit:** the runbook section (reading a night, releasing from it, the hold commands, the skip messages), STATUS's Windows section with the first night's result; commit `Fork nightly: Windows runs every night on the Mac Studio`; push to `chromium/next`; tell the Linux session the commit so its Task 5 takes the "names the source commit" form.
