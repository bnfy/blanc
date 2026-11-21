# Windows Nightly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every night with new source on `chromium/next`, the Mac Studio has the Linux build server build a Windows prototype and a Windows beta from one commit, checks both on GitHub Windows runners, and leaves a judged, release-ready beta candidate that a morning release can use unchanged.

**Architecture:** A Node orchestrator on the Mac Studio (`desktop-nightly.mjs`, LaunchAgent at 04:00) drives the server over SSH through one server-side script that owns the build checkout from checkout to packaging. It keeps the zips locally, uploads them to the `fork-windows-candidate` draft under two asset names (beta and prototype side by side, so nothing is swapped under a running job), and dispatches `chromium-windows-candidate.yml` pinned to the night's commit. It binds every result to the run it dispatched and the candidate it built, and judges like the Mac nightly. One exclusive hold on the draft keeps a night, a release and a hand upload from replacing each other's candidate. Release prep reads the newest passing night and writes the release work folder. The ten `windows-release.mjs` stages stay, hardened where a night makes their old shortcuts unsafe: exact run ids, a live hold for every mutating stage, and a schema-2 descriptor carrying the candidate's commit and version.

**Changes from the spec, stated openly:**
1. The spec moved the Windows release record to the Mac Studio so that the night and releases share a lock. The plan puts one exclusive lock on the `fork-windows-candidate` draft itself, which both Macs reach with `gh`. Release records and the owner's stages stay on the MacBook Pro.
2. The spec said the candidate workflow changes on `main`. `gh workflow run --ref chromium/next` runs the copy on `chromium/next` (as `windows-release.mjs` already dispatches it), so the workflow changes there only. `main`'s copy only has to exist.
3. The release tool's existing run lookup (newest dispatch in a time window) and its online proof (version only) are tightened (Task 6), because a nightly makes several dispatches a day.

**Tech Stack:** Node 22 ESM (`node:test`), bash, `gh`, SSH/scp, GitHub Actions (PowerShell job), launchd.

**Spec:** `docs/superpowers/specs/2026-11-21-windows-nightly-design.md`

## Global Constraints

- The build server holds no GitHub credential; every `gh` call runs on the Mac Studio or the MacBook Pro.
- Build only through `chromium/tools/build.mjs`; never `ninja -t`; never a build while another `siso ninja` runs; never touch the Android checkout or `~/depot_tools` (Windows uses `~/depot_tools-desktop`). Server Node: `~/chromium-desktop/src/third_party/node/linux/node-linux-x64/bin`.
- Arguments: the prototype `args.gn` must equal the committed `prototype-x64.gn` byte for byte. The beta's current `args.gn` must equal the committed `beta-x64.gn` except the two version lines, before the night writes the new number. The environment is re-recorded only when the guard names only `argsSha256` under both of those conditions.
- Every guarded check and build uses `--allow-large-build --max-actions=3000 --reject-buildflags`, including after a re-record.
- The night never pushes to any branch and never publishes or signs anything. Every upload first confirms `fork-windows-candidate` is still a draft.
- Night records live on the Mac Studio under `~/Projects/Blanc/records/nightly/windows/`; the Mac nightly's checkout `~/Projects/Blanc/repo` is never moved; the night uses its own worktree `~/Projects/Blanc/desktop-nightly`.
- LaunchAgent label `me.bnfy.blanc.desktop-nightly`, 04:00 local time; its entry script sets `PATH` itself (Homebrew `node` and `gh`), so a minimal environment behaves like launchd's.
- Draft assets: `blanc-windows-candidate.zip` (the beta, the name every release stage reads), `blanc-windows-prototype.zip` (the night's suite build), `draft-hold.json` (the one exclusive hold), `nightly-rerun.json` (a rerun case list, only while the night holds the draft).
- Claim rule, agreed with the Linux session on 2026-11-21:
  - A claim in `chromium/release/build-reservations.json` (`sequences["desktop-158"]`) names its source commit and platforms.
  - A release is valid only if no claim made before its own holds a number at or above its number. A claim on the same number for the same source may be shared.
  - An abandoned claim stays a gap.
  - The release proves its candidate matches the claim: `candidate.json`'s `treeCommit` equals `sourceCommit`, its `version` equals `158.0.8127.<build>`, and its channel is `beta`.
  - The night's number is claimed exactly or not at all. It is never renumbered; a night that loses its number is not released.
  - Claims are always read from the fetched tip of `chromium/next`, never the local checkout.
- Never print a secret; failures print fixed messages, as `windows-release.mjs` does. The hold's owner token stays in private state and is never copied into a published file.
- Fork work goes to `chromium/next` by merge; the fork unit suite and both `check-patches.py` lanes must pass before every push. Desktop patch numbers 0113–0116 are the Linux lane's.

## Review Focus

1. **A release and a night start at the same moment.** Only one can create `draft-hold.json`; the loser stops without touching the draft. → Task 3 test.
2. **A night dies holding the draft.** The hold stays until a person breaks it; `break` refuses while the Studio's night lock is held by a live process. → Task 3 and Task 5 tests.
3. **A green report from another run, candidate or an empty run.** The judge accepts only the reports of the runs this night dispatched, for its prototype and commit, covering the full inventory, with a rerun whose case set is exactly the one requested. → Task 1 test.
4. **A push lands on `chromium/next` between build and dispatch.** The runner checks out `source_commit` after proving it is on `chromium/next` and that the unpacked candidate names it. → Task 2 test.
5. **An older installer with the same build number** (nights reuse a number until it ships): the installed `chrome.exe` and `chrome.dll` must hash to this candidate's. → Task 2 test.

---

### Task 1: Pure rules of the night

**Files:**
- Create: `chromium/release/daily/desktop-nightly-rules.mjs`
- Test: `chromium/release/daily-desktop-nightly.test.mjs`

**Interfaces:**
- Consumes: `judgeSuite(baseline, known, rerun)` from `chromium/release/daily/nightly.mjs`; `chromium/scenarios/inventory.json`.
- Produces:
  - `nextWindowsBuild(ledger, reservations = null) -> number`: `max(ledger.builds[].build, every build in reservations?.sequences['desktop-158']) + 1`.
  - `windowsBetaArgs(committedText, build) -> string`: replaces exactly the lines `blanc_beta_version = "2.0.0-beta.<build>"` and `blanc_beta_build = <build>`. Throws if either is missing or appears twice.
  - `argsDrift(currentText, intendedText, {ignoreVersion}) -> string[]`: the lines of `currentText` that differ from `intendedText`, by exact text. With `ignoreVersion: true` it skips only the two version lines. `[]` means no drift.
  - `skipReason({hold, macMarker, serverLock, sisoRunning, unchangedSinceLastPass}) -> string|null`: checked in that order, with fixed messages.
  - `judgeWindowsNight({checks, suite, rerun, known, inventory, expect}) -> {status, ...}`
    - `checks`: `{betaWorkflow, installPass, installed, installedLaunches, installedHashesMatch, betaIcon, prototypeLaunch, prototypeFrame}`.
    - `expect`: `{runIds: {suite, rerun?}, prototypeId, sourceCommit, rerunCases?}`.
    - Fails on any false check.
    - Fails unless `suite.runId === expect.runIds.suite`, `suite.platform === 'windows'`, `suite.candidate === expect.prototypeId`, `suite.forkCommit === expect.sourceCommit`, `suite.developmentSubset` is absent, and the suite's case ids equal every inventory case not excluded for Windows.
    - When `rerun` is given, it must match `expect.runIds.rerun`, the same candidate and commit, and a case set exactly `expect.rerunCases`.
    - Otherwise returns `judgeSuite(suite, known, rerun)`.

- [ ] **Step 1: Write the failing tests:**

```js
test('the next build is above every ledger and claimed build', () => {
  assert.equal(nextWindowsBuild({builds: [{build: 902}, {build: 904}]}), 905);
  assert.equal(nextWindowsBuild({builds: [{build: 904}]}, {sequences: {'desktop-158': [{build: 906, platforms: ['linux']}]}}), 907);
});
test('only the version lines change in the beta, nothing in the prototype', () => {
  const out = windowsBetaArgs(betaCommitted, 905); // the real beta-x64.gn, read from disk
  assert.deepEqual(argsDrift(betaCommitted, out, {ignoreVersion: true}), []);
  assert.deepEqual(argsDrift(protoCommitted.replace('is_debug = false', 'is_debug = true'), protoCommitted, {ignoreVersion: false}), ['is_debug = true']);
  assert.deepEqual(argsDrift(betaCommitted.replace('enable_widevine = false', 'enable_widevine = true'), betaCommitted, {ignoreVersion: true}), ['enable_widevine = true']);
});
test('a night skips for a hold, a Mac release, a busy server or nothing new', () => {
  const clear = {hold: null, macMarker: false, serverLock: false, sisoRunning: false, unchangedSinceLastPass: false};
  assert.equal(skipReason(clear), null);
  assert.match(skipReason({...clear, hold: {kind: 'release'}}), /the candidate draft is held/);
  assert.match(skipReason({...clear, serverLock: true}), /desktop checkout is locked/);
  assert.match(skipReason({...clear, unchangedSinceLastPass: true}), /nothing new since the last passing night/);
});
test('evidence that is not this night\'s, or not complete, fails it', () => {
  for (const suite of [{...full, runId: 9}, {...full, candidate: 'windows-x64-0000000000000000'}, {...full, scenarios: []},
                       {...full, developmentSubset: 'x'}, {...full, platform: 'macos'}])
    assert.equal(judgeWindowsNight({checks: allTrue, suite, known, inventory, expect}).status, 'fail');
  assert.equal(judgeWindowsNight({checks: allTrue, suite: oneFailure, rerun: {...rerunOf(['other-case']), runId: 11}, known, inventory,
    expect: {...expect, runIds: {suite: 10, rerun: 11}, rerunCases: ['the-failed-case']}}).status, 'fail');
  assert.equal(judgeWindowsNight({checks: {...allTrue, installedHashesMatch: false}, suite: full, known, inventory, expect}).status, 'fail');
});
```

- [ ] **Step 2: Run** `node --test chromium/release/daily-desktop-nightly.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the five exports (no I/O).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `Fork nightly: the Windows night's rules (number, args, skips, judging)`.

### Task 2: The runner tests the night's commit, either asset, and the installed bytes

**Files:**
- Modify: `.github/workflows/chromium-windows-candidate.yml` (on `chromium/next` only)
- Modify: `chromium/windows/run-suite.mjs`, `chromium/tests/windows-install.mjs`
- Test: `chromium/tools/windows-candidate-workflow.test.mjs`, `chromium/tools/windows-run-suite.test.mjs`, `chromium/tools/windows-install.test.mjs` (extend or create each)

**Interfaces:**
- Produces:
  - Workflow inputs: `source_commit` (optional, `^[0-9a-f]{40}$`), `asset` (choice `blanc-windows-candidate.zip` | `blanc-windows-prototype.zip`, default the first), `nightly` (boolean, default false) and `case_list_asset` (optional, only `nightly-rerun.json`).
  - `run-suite.mjs CANDIDATE RESULTS --slice=f0 [--nightly=<runId>] [--case-list=<file>]`.
  - `install.json` gains `details.installedSha256: {exe, dll}` and `checks.installedMatchesCandidate`.

- [ ] **Step 1: Failing tests:**
  - **Workflow text:**
    - "Validate inputs" checks `source_commit`'s pattern.
    - After `actions/checkout` (`fetch-depth: 0`), a step runs `git merge-base --is-ancestor $SOURCE_COMMIT origin/chromium/next` and `git checkout --detach $SOURCE_COMMIT`. It comes before any step that runs repository scripts.
    - After unpacking, a step fails unless `candidate.json`'s `treeCommit` equals `source_commit`.
    - The download step uses `inputs.asset`.
    - The `sign` job's steps are unchanged and never read `source_commit`.
    - The suite step adds `--nightly=${{ github.run_id }}` when `inputs.nightly`, and `--case-list=<downloaded nightly-rerun.json>` when `case_list_asset` is set.
  - **run-suite:**
    - `--slice=f0 --nightly=123` points the tracker at the candidate for this run only (`qualification: 'nightly run 123; not a tracker baseline'`).
    - The report has `runId: '123'` and no `developmentSubset`.
    - With a case list, the report's `developmentSubset.caseList` equals the list.
  - **windows-install:**
    - The receipt records the installed `chrome.exe` and `chrome.dll` SHA-256.
    - `installedMatchesCandidate` is true only when they equal the candidate's `executableSha256` and `dllSha256`. For a signed install, it is true only when the hashes come from the candidate's own files with a signature added, as `--signed` already accepts.
    - `installedMatchesCandidate` is required for `pass`.
- [ ] **Step 2: Run** the three files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `Fork Windows: candidate runs pin a source commit, pick the prototype, take a case list, and check the installed bytes`.

### Task 3: One exclusive hold on the draft

**Files:**
- Create: `chromium/windows/draft-hold.mjs`
- Modify: `chromium/windows/ship-candidate.sh` (only under a hold it owns)
- Test: `chromium/tools/windows-draft-hold.test.mjs`

**Interfaces:**
- Produces:
  - `DRAFT = process.env.BLANC_CANDIDATE_DRAFT ?? 'fork-windows-candidate'`, `HOLD_ASSET = 'draft-hold.json'`; hold body `{kind: 'nightly'|'release'|'manual', owner, startedAt, note}`, where `owner` is a random token.
  - `assertDraft(io)`: throws unless `gh release view DRAFT --json isDraft` is `true`. Every write below calls it first.
  - `acquireHold(io, kind, note) -> {owner, assetId}`: uploads without `--clobber` (GitHub refuses an existing name), then downloads it and checks the owner is its own.
  - `readHold(io) -> {body, assetId}|null`.
  - `uploadUnderHold(io, owner, file, name)`: confirms `assertDraft` and that the hold's owner is `owner`, then uploads with `--clobber`.
  - `releaseHold(io, owner)`: deletes the hold through the API by its asset id, only if that asset's body still names `owner`.
  - CLI: `node chromium/windows/draft-hold.mjs status | acquire-manual <note> | release <owner> | break --confirm`.
    - `acquire-manual` prints the owner for `BLANC_DRAFT_HOLD_OWNER`.
    - `break` prints the hold. For a `nightly` hold it first checks over SSH that the Mac Studio's night lock (`records/nightly/windows/RUNNING/`) is absent or names a dead pid. For a `release` hold it also marks that release's work abandoned (Task 6).
  - `ship-candidate.sh` uploads only through `uploadUnderHold` with `BLANC_DRAFT_HOLD_OWNER`.

- [ ] **Step 1: Failing tests** (fake `io`):
  - A second `acquireHold` while one exists throws and never deletes.
  - Two racing acquisitions leave exactly one owner.
  - `releaseHold` deletes nothing when the asset now names another owner, so a successor's hold survives.
  - `uploadUnderHold` refuses on a published release and under another owner's hold.
  - `break` on a nightly hold refuses while `RUNNING` names a live pid.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `Fork Windows: one exclusive hold on the candidate draft`.

### Task 4: The server phase, one owner from checkout to packages

**Files:**
- Modify: `chromium/tools/build.mjs`, `chromium/windows/server/bootstrap.sh` (lock ownership)
- Create: `chromium/windows/server/nightly-build.sh`
- Test: `chromium/tools/build.test.mjs` (extend), `chromium/tools/windows-nightly-build-script.test.mjs`

**Interfaces:**
- `build.mjs`:
  - The lock directory holds an `owner` file.
  - When `BLANC_CHECKOUT_LOCK_OWNER` equals it, every mode (`--check`, `--build` **and `--record-environment`**) runs under that lock and leaves it held.
  - With no owner env, every Windows and Linux mode, `--record-environment` included, takes and releases the lock as today.
  - Any other existing lock refuses.
  - `bootstrap.sh` writes its token the same way.
  - **Shared with the Linux lane: bring the diff to the Linux session before it lands.**
- The bootstrap the orchestrator sends over SSH, as one fixed command:
  1. `export PATH=<server node>:$HOME/depot_tools-desktop:$PATH`.
  2. `pgrep -f '[s]iso ninja'` → `busy`.
  3. Take the lock: `mkdir` plus an `owner` file with a fresh token (→ `busy` if it exists), with an `EXIT` trap that removes it only if the token is still its own.
  4. `cd ~/blanc-desktop && git fetch -q origin chromium/next && git checkout -q --detach COMMIT && test -z "$(git status --porcelain)"`.
  5. `BLANC_CHECKOUT_LOCK_OWNER=<token> bash chromium/windows/server/nightly-build.sh COMMIT BUILD STAMP`.
- `nightly-build.sh` prints one final JSON line `{"status":"built"|"stopped","reason"?,"prototype":{…package.json},"beta":{…package.json}}`. Packages land in `~/blanc-evidence/windows/nightly-STAMP/{prototype,beta}/`.

Script order, all under the lock:
1. `mount-toolchain.sh`.
2. Restore every upstream file that the previous applied map patched and the new lane no longer patches: `git -C ~/chromium-desktop/src checkout -- <file>` restores the pin's bytes.
3. `apply.py` check, then `--apply --backup`, **both with `--previous-map ~/chromium-desktop/.blanc-applied-source-map.json`**. Then record the map.
4. Run `apply.py` check once more. It must report `"changes": 0`, or the night stops: the applied tree must equal the pin plus the map.
5. Prototype: `argsDrift(out/BlancWinPrototype/args.gn, prototype-x64.gn, {ignoreVersion: false})` must be `[]`.
6. Beta: `argsDrift(out/BlancWinBeta/args.gn, beta-x64.gn, {ignoreVersion: true})` must be `[]`. Then write `windowsBetaArgs(beta-x64.gn, BUILD)`.
7. `gn gen` both outputs.
8. For each output, `build.mjs --check --allow-large-build --max-actions=3000 --reject-buildflags`.
   - If it refuses and `onlyArgsChanged` holds, run `--record-environment` and then the same `--check` again.
   - Any other refusal → `stopped` with the guard's message.
   - Then `build.mjs --build` with the same three flags.
9. `package-candidate.mjs` for each output.

- [ ] **Step 1: Failing tests:**
  - **`build.test.mjs`:**
    - With the lock present and the matching owner env, `--check`, `--build` and `--record-environment` proceed and leave the lock.
    - A different owner refuses with today's message.
    - Without an owner env, `--record-environment` takes and releases the lock.
    - A plan of 1,001 actions passes with `--allow-large-build --max-actions=3000`, and 3,001 refuses.
    - A pending buildflag header refuses with `--reject-buildflags` after a re-record too.
  - **Script test (text):**
    - The bootstrap checks `[s]iso ninja` first.
    - It takes the lock before `cd ~/blanc-desktop && … git checkout`.
    - Its trap compares tokens.
    - The restore of retired upstream files comes before `apply.py`.
    - `--previous-map` is on both `apply.py` calls, and the post-apply check requires zero changes.
    - The prototype comparison uses `ignoreVersion: false`.
    - `--record-environment` appears only inside an `onlyArgsChanged` branch.
    - Every guard call carries the three flags.
    - Packaging happens before the lock is released.
    - The last line is JSON.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, and send the `build.mjs` and `bootstrap.sh` diff to the Linux session. Land it after they agree.
- [ ] **Step 4: Run** the tests and `bash -n` on both scripts. Expected: PASS.
- [ ] **Step 5: Commit** `Fork Windows: the nightly's server phase holds the checkout from checkout to packages`.

### Task 5: The orchestrator on the Mac Studio

**Files:**
- Create: `chromium/release/daily/desktop-nightly.mjs`, `chromium/release/daily/windows-known-failures.json`
- Test: `chromium/release/daily-desktop-nightly.test.mjs` (extend)

**Interfaces:**
- Consumes: Task 1 rules, Task 2 inputs and receipts, Task 3 holds, Task 4 bootstrap.
- Produces:
  - Command: `node chromium/release/daily/desktop-nightly.mjs [--now]`.
  - Record: `~/Projects/Blanc/records/nightly/windows/<stamp>/result.json` `{status, reason?, sourceCommit, build, version, beta: {id, zipSha256, treeCommit, version, channel, executableSha256, dllSha256}, prototype: {id, zipSha256, treeCommit}, runs: {betaSmoke, betaCapture, suite, rerun?}, judged}`.
  - `LAST-PASS` names the newest passing stamp.
  - `PLATFORMS = [{name: 'windows', …}]`; Linux is added here later.

Flow (`io` injected, as in `windows-release.mjs`):
1. **Lock.** Exclusively `mkdir records/nightly/windows/RUNNING/`, with `owner` (`{pid, token, stamp}`) inside; refuse if it exists. Remove it in `finally` only if the token is its own. Taken before the worktree moves.
2. **Checkout.** Fetch in the `desktop-nightly` worktree and check out `origin/chromium/next`'s SHA detached. The LaunchAgent entry script does this before loading Node modules, so the night's own rules apply.
3. **Skip.** `skipReason` from `readHold`, `RELEASE-IN-PROGRESS`, an SSH probe (lock directory, `siso`), and `LAST-PASS`'s `sourceCommit`.
4. **Hold and number.** `acquireHold('nightly')`. Then the number from `nextWindowsBuild`, with the reservation file read from `git show origin/chromium/next:chromium/release/build-reservations.json` when it exists.
5. **Build.** Run the SSH bootstrap. `busy` → skip.
6. **Copy and verify.** `scp` both zips and check each SHA-256. Unzip each `candidate.json` and require:
   - `treeCommit` equals the night's commit;
   - the beta's `version` is `158.0.8127.<build>` and its channel `beta`;
   - the prototype's channel is `preview`.
7. **Upload.** Both zips under their names through `uploadUnderHold`.
8. **Dispatch three runs**, each with `source_commit`, taking the run id from `gh workflow run`'s printed run URL (never a time-window search):
   - beta smoke: `suite=smoke`, the install checks;
   - beta capture: `update_expect=capture:<version>`, the icon;
   - prototype suite: `asset=blanc-windows-prototype.zip`, `suite=f0`, `nightly=true`.
9. **Wait and read.** Wait on all three, then download artifacts by run id. Read `install.json` (`pass`, `checks.installed`, `checks.installedLaunches`, `checks.installedMatchesCandidate`), `capture.json` (`iconVerdict.ok`), each run's conclusion, the suite report, and the prototype's launch and frame receipts.
10. **Rerun once.** Upload the `rerunCandidates` as `nightly-rerun.json` (exact ids, no length limit), then dispatch the prototype with `case_list_asset=nightly-rerun.json`.
11. **Judge.** `judgeWindowsNight`, then write `result.json`.
12. **On pass.** Point `LAST-PASS` at the stamp, then delete the previous pass's zips here and its `nightly-*` folder on the server.
13. **On fail.** Delete this night's zips.
14. **Finally.** Delete `nightly-rerun.json` under the hold, then `releaseHold`.

`windows-known-failures.json` is seeded only with the cases `chromium/reports/w2-windows-triage.md` classifies as known Windows gaps. Each entry has `results` and a `reason` citing its triage line. A new failure that fails its rerun keeps nights failing until it is fixed or a person adds it with evidence.

- [ ] **Step 1: Failing tests** (fake `io`):
  - A second night while `RUNNING` exists exits without touching `RUNNING`, the worktree or the draft.
  - A release hold stops the night before any upload and records `skipped`.
  - No upload happens after the first dispatch, except `nightly-rerun.json`.
  - Every dispatch carries the night's `source_commit`, and run ids come from the dispatch output.
  - A beta whose `candidate.json` names another commit stops the night before upload.
  - A repeatable new failure leaves `LAST-PASS` unchanged.
  - Pass → fail → pass keeps only the newest passing zips on the Studio, and asks the server to remove the older night's folder.
  - An exception still removes the night's own hold and `RUNNING`, and nothing of a successor's.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, and seed the known failures from the W2 triage.
- [ ] **Step 4: Run** the file and the whole fork suite. Expected: PASS.
- [ ] **Step 5: Commit** `Fork nightly: the Windows night on the Mac Studio`.

### Task 6: Releasing from a night

**Files:**
- Create: `chromium/release/daily/windows-beta-prep.mjs`
- Modify: `chromium/release/windows-release.mjs`
- Test: `chromium/release/daily-windows-prep.test.mjs`, extend `chromium/release/windows-release.test.mjs`

**Interfaces:**
- Consumes:
  - Task 3 holds.
  - The Studio's `LAST-PASS`, `result.json` and kept zips over SSH (`ssh -i ~/.ssh/id_ed25519_macmini -o IdentitiesOnly=yes anthonyjloria@Mac-Studio.local`, scp).
  - The Linux lane's reservation helper, reworked to the agreed form: `claimExact({build, sourceCommit, platforms, purpose}) -> {commit}`. It claims exactly that number against the fetched tip. It retries only when a push lost to an unrelated commit, never renumbers, and throws `taken` when an earlier claim holds the number or a higher one for other source.
  - Until that helper lands, prep stops before writing a schema-2 release once the reservation file exists. Without the file, prep releases on the ledger rule and says so.
- Produces `node chromium/release/daily/windows-beta-prep.mjs [--records DIR]` on the MacBook Pro:
  1. `acquireHold('release')`. If a night or anyone else holds it, print `draft-hold.mjs status` and stop.
  2. If the draft's `blanc-windows-candidate.zip` digest isn't the night's beta, re-upload the kept zip under that name and re-check.
  3. `claimExact`. If the number is `taken`: release the hold and stop.
  4. Write `<records>/<version>/` (mode 0700): schema-2 `windows-release.json` (`candidate: {id, zipSha256, treeCommit, version}`), a draft `release-notes.md` (commits since the last ledger build's `sourceCommit`), and `state.json` with the private `hold: {owner, assetId}`.
  5. Validate it through the real `load()`, then replace `<records>/CURRENT` (temp file and rename).
- `windows-release.mjs`:
  - **Schema 1** records load and show `status` unchanged.
  - **Schema 2** also requires:
    - `candidate.treeCommit === sourceCommit`, `candidate.version === version`;
    - a claim for `build` naming `windows` and `sourceCommit`, read from the fetched tip in `preflight` and before `draft`, with no earlier claim at or above `build` for other source.
  - **Every stage that writes** (all but `status`) first requires the live hold to carry the owner in `state.json`. A work folder marked `abandoned` refuses every stage.
  - **`workflowRun` takes the run id** from `gh workflow run`'s output instead of the newest dispatch in a time window.
  - **`proveOnline`** accepts a receipt only if its candidate id equals the release's, and its install mode is the expected one (staging or public).
  - **After `verify-public` is saved** as done, `runStage` releases the hold. If that release fails, `status` says the hold is still held and `draft-hold.mjs release <owner>` resumes it.
  - `draft-hold.mjs break` on a release hold first writes `abandoned` into that work folder's `state.json`.

- [ ] **Step 1: Failing tests:**
  - **Prep:**
    - Refuses while a nightly hold exists.
    - Re-uploads when the draft digest differs, and refuses if it still differs.
    - An interrupted prep leaves the previous `CURRENT` untouched and releases only its own hold.
    - A `taken` claim ends prep without a work folder.
  - **`windows-release.mjs`:**
    - A completed schema-1 record loads and shows `status`.
    - Schema-2 checks reject a different `treeCommit` or `version`, and Windows 905 after an earlier Linux 906 (even for the same source). They accept a same-number, same-source shared claim.
    - Claims come from the fetched tip, not a stale local file.
    - A stage refuses without the live hold, and on an `abandoned` folder.
    - `workflowRun` uses the dispatch-returned id even when a newer run exists.
    - `proveOnline` rejects another candidate's receipt.
    - The hold is released only after `verify-public` is saved.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both files and the whole fork suite. Expected: PASS.
- [ ] **Step 5: Commit** `Fork Windows: releases start from a passing night and hold the draft until verify-public`.

### Task 7: Install, first night, records

**Files:**
- Create: `chromium/release/daily/install-desktop-nightly.sh`
- Modify: `docs/chromium-beta-release.md` (section "Windows nightly"), `chromium/STATUS.md` (Windows section)

- [ ] **Step 1: Write the installer**, modelled on `install-nightly.sh`.
  - It creates the `~/Projects/Blanc/desktop-nightly` worktree.
  - It writes `~/Projects/Blanc/scripts/desktop-nightly.sh`, which sets `PATH` to Homebrew's `node` and `gh` (as `install-nightly.sh` does), fetches, checks out `origin/chromium/next` detached, and runs `node chromium/release/daily/desktop-nightly.mjs "$@"`.
  - It writes the `me.bnfy.blanc.desktop-nightly` LaunchAgent (Hour 4, Minute 0). `--remove` uninstalls.
  - Test: `bash -n`, and a unit test that the plist has the label and Hour 4 and that the entry script sets `PATH`.
- [ ] **Step 2: Bring `BlancWinPrototype` current once, by hand.** It hasn't been built since W2. After asking the Linux session about the lock, run `build.mjs --check --out=BlancWinPrototype`, review the large plan, and build it once. Expected: `build ok`.
- [ ] **Step 3: Rehearse with no live effects:**
  - Make a disposable draft `fork-windows-candidate-rehearsal`, and a reservation file containing a test claim in a temporary ref.
  - Run one night against both with `BLANC_CANDIDATE_DRAFT` and the reservation override set, from a minimal environment: `env -i HOME=$HOME PATH=/usr/bin:/bin bash ~/Projects/Blanc/scripts/desktop-nightly.sh --now`.
  - Then run `windows-beta-prep.mjs --records <temp dir>` against that night, and `windows-release.mjs status <temp dir>/<version>` through the real loader.
  - Then release the rehearsal hold and delete the disposable draft and ref.
  - Expected: a judged `result.json`, a valid work folder, the real draft, `CURRENT` and reservations untouched.
- [ ] **Step 4: Push and install:**
  - Push to `chromium/next`, with the fork suite and both `check-patches.py` lanes passing.
  - On the Mac Studio, run the installer and one supervised real night with `--now`.
  - Expected: `status: "pass"`, or a failure triaged case by case (fix, or add with evidence) before the next night.
- [ ] **Step 5: Records and commit:**
  - Write the runbook section: reading a night, releasing from it, the hold commands, abandoning a release, and the skip messages.
  - Add the first night's result to STATUS's Windows section.
  - Commit `Fork nightly: Windows runs every night on the Mac Studio` and push to `chromium/next`.
  - Tell the Linux session the commit and the `claimExact` contract.
