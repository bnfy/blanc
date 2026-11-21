# Windows Nightly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every night with new source on `chromium/next`, the Mac Studio has the Linux build server build a Windows prototype and a Windows beta from one commit, checks both on GitHub Windows runners, and leaves a judged, release-ready beta candidate that a morning release can use unchanged.

**Architecture:** A Node orchestrator on the Mac Studio (`desktop-nightly.mjs`, LaunchAgent at 04:00) drives the server over SSH through one server-side script, keeps the zips locally, moves them through the existing `fork-windows-candidate` draft, dispatches `chromium-windows-candidate.yml` pinned to the night's commit, and judges the result like the Mac nightly. Draft "holds" (small JSON assets on the draft) keep a night and a release from replacing each other's candidate. Release prep reads the newest passing night and writes the release work folder; the ten `windows-release.mjs` stages stay as they are, except for the claim checks and releasing the hold.

**One change from the spec:** the spec moved the Windows release record to the Mac Studio so that the night and releases share one lock. The plan instead puts both locks on the `fork-windows-candidate` draft itself (the thing being protected), which both Macs already reach with `gh`. The release records and the owner's release stages stay on the MacBook Pro as today, and nothing new has to cross over SSH for a release.

**Tech Stack:** Node 22 ESM (`node:test`), bash, `gh`, SSH/scp, GitHub Actions (PowerShell job), launchd.

**Spec:** `docs/superpowers/specs/2026-11-21-windows-nightly-design.md`

## Global Constraints

- The build server holds no GitHub credential; every `gh` call runs on the Mac Studio or the MacBook Pro.
- Build only through `chromium/tools/build.mjs`; never `ninja -t`; never a build while another `siso ninja` runs; never touch the Android checkout or `~/depot_tools` (Windows uses `~/depot_tools-desktop`).
- A night never re-records the guard's environment unless the only guard difference is `argsSha256` **and** the only `args.gn` lines that differ are `blanc_beta_version` and `blanc_beta_build` (spec: "Argument changes are checked line by line").
- Refuse any build plan above `BETA_MAX_ACTIONS` (3000, as the Mac nightly) without a person.
- The night never pushes to any branch and never publishes or signs anything.
- Night records live on the Mac Studio under `~/Projects/Blanc/records/nightly/windows/`; the Mac nightly's checkout (`~/Projects/Blanc/repo`) is never moved; the night uses its own worktree `~/Projects/Blanc/desktop-nightly`.
- LaunchAgent label `me.bnfy.blanc.desktop-nightly`, 04:00 local time.
- Draft hold assets: `release-hold.json` (a release) and `nightly-running.json` (a night); a `nightly-running.json` older than 8 hours is stale and ignored.
- Claim rule, agreed with the Linux session 2026-11-21: a claim `{build, sourceCommit, platforms[], purpose}` names its source commit; a release checks only claims made before its own; an abandoned claim stays a gap; the release proves its candidate matches the claim (`candidate.treeCommit === sourceCommit`, compiled version `158.0.8127.<build>`).
- Never print a secret; failures print fixed messages, as `windows-release.mjs` does.
- Fork work goes to `chromium/next` by merge; the fork unit suite and both `check-patches.py` lanes must pass before every push.

## Review Focus

1. **A release starts while a night is mid-upload** (prototype zip on the draft): prep must see `nightly-running.json` and refuse; the night must see `release-hold.json` before each upload and stop. → Task 3 and Task 6 tests.
2. **A night that dies without cleaning up** (Mac Studio sleeps or reboots): its stale `nightly-running.json` must not block releases forever (8-hour rule), and the server lock must not be left held by the night. → Task 3 test; Task 4 `trap` test.
3. **A push lands on `chromium/next` between build and dispatch**: the runner must still test the night's commit (`source_commit`), and the report must name that commit. → Task 2 test.
4. **A morning release after a failed night**: prep re-uploads the last passing beta zip and verifies its digest before writing the work folder. → Task 6 test.
5. **The committed `beta-x64.gn` gains an unrelated change** (for example `enable_widevine`): the night stops with the differing key named, and does not re-record the environment. → Task 1 test.

---

### Task 1: Pure rules of the night

**Files:**
- Create: `chromium/release/daily/desktop-nightly-rules.mjs`
- Test: `chromium/release/daily-desktop-nightly.test.mjs`

**Interfaces:**
- Consumes: `judgeSuite(baseline, known, rerun)` from `chromium/release/daily/nightly.mjs`; `validateGN` (as `bumpBetaArgs` uses it).
- Produces:
  - `nextWindowsBuild(ledger, reservations = null) -> number` — `max(ledger.builds[].build, reservations?.builds[].build) + 1`.
  - `windowsBetaArgs(committedText, build) -> string` — replaces exactly `blanc_beta_version = "2.0.0-beta.<build>"` and `blanc_beta_build = <build>`; throws if either line is missing or appears twice.
  - `argsDrift(currentText, intendedText) -> string[]` — GN keys whose values differ, excluding `blanc_beta_version` and `blanc_beta_build`.
  - `skipReason({releaseHold, macMarker, serverLock, sisoRunning, unchangedSinceLastPass}) -> string|null` — checked in that order; fixed messages.
  - `judgeWindowsNight({checks, suite, known, rerun}) -> {status, ...}` — `checks` is `{betaInstall, betaLaunch, betaIcon, prototypeLaunch, prototypeFrame}` booleans; any false → `fail`; otherwise `judgeSuite(suite, known, rerun)`.

- [ ] **Step 1: Write the failing tests** in `daily-desktop-nightly.test.mjs`:

```js
test('the next build is above every ledger and claimed build', () => {
  assert.equal(nextWindowsBuild({builds: [{build: 902}, {build: 904}]}), 905);
  assert.equal(nextWindowsBuild({builds: [{build: 904}]}, {builds: [{build: 906, platforms: ['linux']}]}), 907);
});
test('only the version lines change', () => {
  const out = windowsBetaArgs(committed /* beta-x64.gn text with 904 */, 905);
  assert.match(out, /^blanc_beta_version = "2\.0\.0-beta\.905"$/m);
  assert.match(out, /^blanc_beta_build = 905$/m);
  assert.deepEqual(argsDrift(committed, out), []);
});
test('an unrelated argument change is named', () => {
  assert.deepEqual(argsDrift(committed, committed.replace('enable_widevine = false', 'enable_widevine = true')), ['enable_widevine']);
});
test('a night skips for a release, a Mac release, a busy server or nothing new', () => {
  const clear = {releaseHold: false, macMarker: false, serverLock: false, sisoRunning: false, unchangedSinceLastPass: false};
  assert.equal(skipReason(clear), null);
  assert.match(skipReason({...clear, releaseHold: true}), /Windows release holds the draft/);
  assert.match(skipReason({...clear, serverLock: true}), /desktop checkout is locked/);
  assert.match(skipReason({...clear, unchangedSinceLastPass: true}), /nothing new since the last passing night/);
});
test('a failed release-path check fails the night whatever the suite says', () => {
  assert.equal(judgeWindowsNight({checks: {...allTrue, betaIcon: false}, suite: passingSuite, known: {cases: []}}).status, 'fail');
});
```

- [ ] **Step 2: Run** `node --test chromium/release/daily-desktop-nightly.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the five exports in `desktop-nightly-rules.mjs` (no I/O).
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `Fork nightly: the Windows night's rules (number, args, skips, judging)`.

### Task 2: The runner tests the night's commit

**Files:**
- Modify: `.github/workflows/chromium-windows-candidate.yml` (on `chromium/next`; GitHub runs the ref's copy)
- Modify: `chromium/windows/run-suite.mjs`
- Test: `chromium/tools/windows-candidate-workflow.test.mjs` (extend if it exists, else create), `chromium/tools/windows-run-suite.test.mjs` (extend or create)

**Interfaces:**
- Produces: workflow inputs `source_commit` (optional, `^[0-9a-f]{40}$`) and `nightly` (boolean, default false); `run-suite.mjs ... --nightly=<stamp>`.

- [ ] **Step 1: Failing tests**:
  - workflow text: `inputs.source_commit` validated against `^[0-9a-f]{40}$` in "Validate inputs"; `actions/checkout` has `ref: ${{ inputs.source_commit || github.sha }}`; the suite step passes `--nightly=${{ github.run_id }}` only when `inputs.nightly`.
  - run-suite: `suiteArguments(['--nightly=123'])` is accepted; with it, the tracker is pointed at the candidate for this run with `qualification: 'nightly run 123; not a tracker baseline'`, and the written report has `nightly: '123'` and `developmentSubset: false`.
- [ ] **Step 2: Run** both test files. Expected: FAIL.
- [ ] **Step 3: Implement** the inputs and the `--nightly` branch beside the existing development-subset branch in `run-suite.mjs`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `Fork Windows: candidate runs can pin a source commit and run as a nightly`.

### Task 3: Draft holds

**Files:**
- Create: `chromium/windows/draft-hold.mjs`
- Test: `chromium/tools/windows-draft-hold.test.mjs`

**Interfaces:**
- Produces:
  - `HOLDS = {release: 'release-hold.json', nightly: 'nightly-running.json'}`, `STALE_NIGHT_MS = 8 * 3600 * 1000`.
  - `readHolds(assets, now = Date.now()) -> {release: object|null, nightly: object|null}` — from `gh release view fork-windows-candidate --json assets`; a nightly hold whose `startedAt` is older than `STALE_NIGHT_MS` reads as `null`.
  - `placeHold(io, kind, body)` / `releaseHold(io, kind)` — upload (`--clobber`) / `gh release delete-asset ... -y`; `body` gains `startedAt` (ISO).
  - CLI: `node chromium/windows/draft-hold.mjs release-abandon` removes `release-hold.json` (for an abandoned release).

- [ ] **Step 1: Failing tests**: two holds read; a 9-hour-old nightly hold reads `null`; a 9-hour-old release hold still reads (releases never go stale); `placeHold` calls `gh release upload fork-windows-candidate <file> --clobber` through the fake `io.exec`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `Fork Windows: holds on the candidate draft for nights and releases`.

### Task 4: The server phase

**Files:**
- Create: `chromium/windows/server/nightly-build.sh`
- Test: `chromium/tools/windows-nightly-build-script.test.mjs`

**Interfaces:**
- Consumes: `apply.py`, `build.mjs`, `package-candidate.mjs`, the committed `chromium/windows/args/{prototype,beta}-x64.gn`.
- Produces: `nightly-build.sh COMMIT BUILD STAMP` on the server. Prints one final JSON line `{"status":"built"|"busy"|"stopped","reason":...,"prototype":{package.json fields},"beta":{package.json fields}}`; packages land in `~/blanc-evidence/windows/nightly-STAMP/{prototype,beta}/`.

Order, each step stopping the script on failure: refuse if `pgrep -f '[s]iso ninja'` → `busy`; `mkdir ~/chromium-desktop/.blanc-checkout.lock` or `busy`, with `trap 'rmdir …' EXIT`; `git -C ~/blanc-desktop fetch` and `checkout --detach COMMIT`; `apply.py` check then `--apply --backup ~/blanc-evidence/windows/nightly-STAMP/apply-backup`; copy `source-map.json` to `.blanc-applied-source-map.json`; write the beta args with `windowsBetaArgs` (call `node -e` on Task 1's module) and compare with `argsDrift` against `out/BlancWinBeta/args.gn` → `stopped` naming the keys; copy `prototype-x64.gn` unchanged; `gn gen` both outputs; release the lock (`build.mjs` takes it per invocation); for each output `build.mjs --check`, refuse a plan above 3000 actions (`stopped`), `--record-environment` only when the check names only `argsSha256` (`onlyArgsChanged`), then `--build`; `package-candidate.mjs` for each output.

- [ ] **Step 1: Failing test**: the script text, read as a string: holds the lock with an `EXIT` trap before `apply.py`; calls `argsDrift` before any `gn gen`; never calls `--allow-large-build`; checks `[s]iso ninja` first; `--record-environment` appears only inside an `onlyArgsChanged` branch; ends by printing one JSON line.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Write the script.**
- [ ] **Step 4: Run** the test; run `bash -n chromium/windows/server/nightly-build.sh`. Expected: PASS, no syntax error.
- [ ] **Step 5: Commit** `Fork Windows: the nightly's server phase`.

### Task 5: The orchestrator on the Mac Studio

**Files:**
- Create: `chromium/release/daily/desktop-nightly.mjs`
- Create: `chromium/release/daily/windows-known-failures.json`
- Test: `chromium/release/daily-desktop-nightly.test.mjs` (extend)

**Interfaces:**
- Consumes: Task 1 rules, Task 3 holds, Task 4 script, `ship-candidate.sh`'s upload steps (reimplemented in Node with the same `gh` calls).
- Produces: `node chromium/release/daily/desktop-nightly.mjs [--now]`; records `~/Projects/Blanc/records/nightly/windows/<stamp>/result.json` with `{status, reason?, sourceCommit, build, version, beta: {id, zipSha256, treeCommit, version}, prototype: {id, zipSha256}, runs: {beta, suite, rerun?}, judged}`; `.../LAST-PASS` holds the stamp of the newest passing night; passing nights keep `beta.zip`, failed nights keep nothing; `PLATFORMS = [{name: 'windows', ...}]` (Linux is added here later).

Flow per platform, with `io` injected as in `windows-release.mjs` so tests run without SSH or `gh`: own lock (`records/nightly/windows/RUNNING`); fetch `origin/chromium/next` in the `desktop-nightly` worktree; `skipReason` from the draft holds (`readHolds`), `RELEASE-IN-PROGRESS`, a server probe over SSH (lock dir, `siso`), and `LAST-PASS`'s `sourceCommit`; `placeHold(nightly)`; number from `nextWindowsBuild`; SSH `nightly-build.sh`; copy both zips with `scp` and check their SHA-256; before **each** upload re-read the holds and stop if a release hold appeared; upload beta, dispatch (`source_commit`, `suite=smoke`, `update_expect=capture:<the night's version>`: the install, installed-launch, installer-capture and icon checks); upload prototype, dispatch (`suite=f0`, `nightly=true`, `source_commit`); re-upload beta; wait on both runs; download the suite report; rerun once the cases `judgeSuite` lists in `rerunCandidates` (`only=`); `judgeWindowsNight`; write `result.json` and `LAST-PASS`; finally `releaseHold(nightly)`.

`windows-known-failures.json` seeds from `chromium/reports/w2-windows-triage.md`: one entry per case it classifies as a known Windows gap, each with its `results` and `reason` citing the triage line.

- [ ] **Step 1: Failing tests** with a fake `io` recording calls:
  - a release hold appearing between the beta upload and the prototype upload stops the night before the prototype upload, records `status: 'stopped'`, and still removes the nightly hold;
  - a passing night writes `LAST-PASS` and keeps `beta.zip`; a failing night keeps the previous `LAST-PASS` and deletes its zips;
  - both dispatches carry `source_commit` equal to the night's commit;
  - the draft ends holding the beta zip (last upload is the beta);
  - `busy` from the server script records a skip, not a failure.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `desktop-nightly.mjs` and seed `windows-known-failures.json`.
- [ ] **Step 4: Run** the test file and the whole fork suite. Expected: PASS.
- [ ] **Step 5: Commit** `Fork nightly: the Windows night on the Mac Studio`.

### Task 6: Releasing from a night

**Files:**
- Create: `chromium/release/daily/windows-beta-prep.mjs`
- Modify: `chromium/release/windows-release.mjs` (`validateWindowsRelease`, `RUN['verify-public']`)
- Test: `chromium/release/daily-windows-prep.test.mjs`, extend `chromium/release/windows-release.test.mjs`

**Interfaces:**
- Consumes: Task 3 holds; the Mac Studio's `LAST-PASS` and `result.json` over SSH (`ssh -i ~/.ssh/id_ed25519_macmini -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local`); the kept `beta.zip` (scp); after Linux L3 Task 5 lands, its reservation module (`chromium/release/build-reservations.json` and its claim helper; until then the claim step is skipped and logged).
- Produces: `node chromium/release/daily/windows-beta-prep.mjs` on the MacBook Pro: refuses while `nightly-running.json` is present; places `release-hold.json` (`{version, sourceCommit, work}`); re-uploads the kept beta zip if the draft's digest differs and re-checks it; claims the build (when the reservation file exists); creates `~/Projects/Blanc/records/windows-release/<version>/` with `windows-release.json` (candidate now carries `{id, zipSha256, treeCommit, version}`) and a draft `release-notes.md` (commits since the last Windows ledger build's `sourceCommit`, owner edits and approves); writes `CURRENT`.
- `validateWindowsRelease` additionally requires `r.candidate.treeCommit === r.sourceCommit` and `r.candidate.version === r.version`, and, when the reservation file exists, a claim naming `windows` and `r.sourceCommit` for `r.build`, with no earlier claim on that number for different source.
- `RUN['verify-public']` ends by `releaseHold(io, 'release')`.

- [ ] **Step 1: Failing tests**: prep refuses with a fresh nightly hold and proceeds with a 9-hour-old one; prep re-uploads when the draft digest differs and refuses if the re-uploaded digest still differs; `validateWindowsRelease` rejects a candidate whose `treeCommit` differs from `sourceCommit` and one whose `version` differs; `verify-public`'s fake `io` sees the `delete-asset release-hold.json` call after the online proof passes and not before.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both files and the whole fork suite. Expected: PASS.
- [ ] **Step 5: Commit** `Fork Windows: releases start from a passing night and hold the draft until verify-public`.

### Task 7: Install, first night, records

**Files:**
- Create: `chromium/release/daily/install-desktop-nightly.sh`
- Modify: `docs/chromium-beta-release.md` (new section "Windows nightly"), `chromium/STATUS.md` (Windows section)

- [ ] **Step 1: Write the installer**, modelled on `install-nightly.sh`: creates the `~/Projects/Blanc/desktop-nightly` worktree, writes `~/Projects/Blanc/scripts/desktop-nightly.sh` and the `me.bnfy.blanc.desktop-nightly` LaunchAgent (`StartCalendarInterval` Hour 4 Minute 0), `--remove` uninstalls. Test: `bash -n`, and a unit test that the plist text has Hour 4 and the label.
- [ ] **Step 2: Bring `BlancWinPrototype` current once, by hand** on the server (it has not been built since W2): `build.mjs --check --out=BlancWinPrototype`; if the plan exceeds 3000 actions, review it and run `--allow-large-build` once, coordinating the lock with the Linux session first. Expected: `build ok`.
- [ ] **Step 3: Push** everything to `chromium/next` (fork suite and both `check-patches.py` lanes passing), then on the Mac Studio run `bash chromium/release/daily/install-desktop-nightly.sh` and one supervised night: `node chromium/release/daily/desktop-nightly.mjs --now`. Expected: `result.json` with `status: "pass"` or a failure whose every unknown case is triaged into `windows-known-failures.json` with its reason before the next night.
- [ ] **Step 4: Release-path dry check:** run `windows-beta-prep.mjs` against that night up to writing the work folder, check `validateWindowsRelease` accepts it, then run `node chromium/windows/draft-hold.mjs release-abandon` (no release is started). Expected: work folder written, hold placed and removed.
- [ ] **Step 5: Records and commit:** the runbook section (how a night is read, how to release from it, how to abandon a release hold, the skip messages), STATUS's Windows section with the first night's result; commit `Fork nightly: Windows runs every night on the Mac Studio`; push to `chromium/next`; tell the Linux session the commit so its Task 5 can take the "names the source commit" form.
