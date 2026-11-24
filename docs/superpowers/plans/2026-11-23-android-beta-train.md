# Android beta train after the stable release: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep shipping Blanc for Android betas to testers on a regular schedule once a stable Blanc for Android is in Google Play's production track, and let a soaked beta become the next stable, without disturbing stable users or the 7-day security clock.

**Architecture:** One Play app (`me.bnfy.blanc`) with four tracks: internal (smoke), a testing track for betas (closed "Alpha" until production access, then open testing "beta"), and production with staged rollout. The version ledger gains stable names beside beta names and one shared, ever-increasing version code. The owner-side release tool learns which track to send a build to, how to promote an uploaded build and how to move a staged rollout. A server nightly builds and gates the Android lane every night, so each beta starts from a passing night. A daily GitHub watch starts the security clock when Chrome stable for Android moves.

**Tech Stack:** Node 22 ES modules (`node:test`), the Google Play Developer API v3 (edits, tracks), bash and systemd user timers on the Android build server, a GitHub Actions scheduled workflow.

**Spec:** None separate. The owner asked for a plan with no brainstorming (2026-11-23), so the decisions below are Claude's calls for the owner to check while reading. Background: `docs/superpowers/specs/2026-11-03-android-port-design.md` §8.2–8.4, `docs/android/release.md`, `docs/android/rebase.md`, `docs/android/play-console.md`.

## Decisions (Claude's calls, 2026-11-23)

- **D1. One app and track channels, not a separate "Blanc Beta" app.** A second package would be a new app on a personal account: its own 12-testers-for-14-days rule, listing, Data safety, declarations and reviews. Play's testing tracks exist for exactly this. Trade-off: beta and stable can't be installed side by side (the Mac's Blanc Beta can), which costs nothing for a phone browser that syncs.
- **D2. Betas carry new Blanc features first, on the same Chrome stable as production.** A Chrome Beta engine would mean a second rebase stream on a server the desktop lane comes first on, and it doesn't serve the 7-day clock. A Chrome stable rebase lands on `main` once and reaches both channels.
- **D3. Names and codes.** Stable is `MAJOR.MINOR.PATCH` (`1.0.0`, `1.1.0`, `1.1.1`). A beta is named after the stable it leads to: `1.1.0-beta.K`. Version codes stay one sequence for every build (the ledger already does this), so each upload is above every earlier one. A stable release is a **rebuild of the soaked beta's commit under the stable name**, with a new code, not a promotion of the beta bundle: Play shows the version name to everyone, and "beta" doesn't belong in production. After a stable release, beta testers get the stable build (its code is higher) until the next beta. That's intended.
- **D4. Tracks per phase.**
  - Until production access: beta → internal → closed testing (`alpha`). The first stable is `1.0.0`, uploaded to production when the account has production access.
  - After production access: betas go to open testing (`beta`), and closed testing is retired. The signup list gets the open-testing link once, in an owner-approved email. The `/android-beta` page changes in a website-only PR (follow-up, not in this plan).
- **D5. Cadence.**
  - **Beta:** at most twice a week, normally Tuesday. Cut from the newest passing nightly when the Android lane changed since the last beta.
  - **Stable:** every four weeks. The candidate is a beta that spent 7 days on the testing track with no regression report and no rise in Play's Android vitals crash rate. It goes to production at 10%, then 50% two days later, then 100% two days after that. A crash report halts it.
  - **Security:** a Chrome stable for Android with security fixes is rebased by `docs/android/rebase.md`, then shipped as `1.N.(P+1)` within 7 days, staged 20% → 100% over two days. A fix exploited in the wild ships within 72 hours, straight to 100%. The same rebase is in the next beta because it's on `main`.
- **D6. Owner approval stays per action.** Every upload, promotion and rollout step needs the exact typed phrase in the owner's Terminal. The Play credential and the upload key stay in 1Password on the owner's Mac. Production needs one new Play right: the owner grants the service account "Release to production" for Blanc.
- **D7. The desktop lane still comes first on the server.** The Android nightly runs at 01:00 US Eastern, is niced, never builds while the desktop checkout lock exists, and doesn't start a build after 03:15. The Windows nightly (04:00) skips while any `siso ninja` runs.
- **D8. Release notes are claims.** Notes for `alpha`, `beta` and `production` come from a file the owner approved (`docs/marketing-claims.md`): en-US, 1–500 characters, Play's limit.

## Global Constraints

- Package `me.bnfy.blanc`. Tracks are exactly `internal`, `alpha`, `beta`, `production`.
- Version names: stable `/^[1-9]\d*\.\d+\.\d+$/`, beta `/^[1-9]\d*\.\d+\.\d+-beta\.[1-9]\d*$/`. Tags stay `android-v<versionName>-<versionCode>`.
- Version codes start at 1 and rise by exactly 1 per ledger row, abandoned rows included (unchanged).
- Rollout percentages are whole numbers from 1 to 99. 100 is the word `complete`.
- No credential, token or private key in a file, argument, log or the repository. Play errors are reported without response bodies (as `play-api.mjs` does today).
- Nothing in this plan publishes anything. Each real upload, promotion or rollout is the owner's typed approval at the time.
- The Android build server's address stays out of the repository.
- Use US spelling, and no model names in commits beyond the trailer.

## Review Focus

1. **A beta that ranks below production.** Promoting an older beta to the testing track after a newer stable is in production would silently give testers the stable instead. `promote` must refuse any track except `production` for a code below the ledger's newest production code (Task 3).
2. **The wrong name on the wrong track.** A beta name sent to production, or a stable name sent to `alpha` or `beta`, must be refused before any Play request. `internal` takes either (Task 2).
3. **Odd rollout input:** `0`, `100`, `150`, `10.5`, `" 10"`, `10%`. Each must be refused with the accepted forms named. `complete` and `halt` must be refused when the ledger says the build isn't rolling out (Task 3).
4. **Notes Play would reject:** an empty file, more than 500 characters, or a missing file on a track that needs notes. All are refused locally, before the edit is opened (Task 2).
5. **The nightly running into the desktop lane's night.** The pure rule must say no to starting at 03:15 or later, and no while the desktop lock exists (Task 4).

---

### Task 1: Stable and beta version names

**Files:**
- Modify: `chromium/android/release/versions.mjs` (the `NAME` regex, `validateName`, a new `channelOf`)
- Modify: `chromium/android/release/record.mjs` (the two tag regexes at the `releaseEntry` tag match and the CLI usage check, now built from `versions.mjs`)
- Test: `chromium/tools/android-release-versions.test.mjs`, `chromium/tools/android-release-record.test.mjs`

**Interfaces:**
- Produces: `NAME: RegExp` matching both forms; `TAG: RegExp` = `/^android-v(<NAME body>)-([1-9]\d*)$/`; `channelOf(versionName: string): 'stable' | 'beta'`; `stableOf(versionName): string` (`'1.1.0-beta.3'` → `'1.1.0'`, `'1.1.0'` → `'1.1.0'`).

- [ ] **Step 1: Write the failing tests.**

```js
test('stable and beta names both make tags, and each knows its channel', () => {
  assert.equal(tagFor('1.0.0', 6), 'android-v1.0.0-6');
  assert.equal(tagFor('1.1.0-beta.1', 7), 'android-v1.1.0-beta.1-7');
  assert.equal(channelOf('1.0.0'), 'stable');
  assert.equal(channelOf('1.1.0-beta.2'), 'beta');
  assert.equal(stableOf('1.1.0-beta.2'), '1.1.0');
  for (const bad of ['1.0', '01.0.0', '1.0.0-beta.0', '1.0.0-rc.1', '1.0.0 ', 'v1.0.0'])
    assert.throws(() => tagFor(bad, 1), /versionName/);
});
test('a stable name follows the betas in one code sequence', () => {
  const l = ledger(entry(1), entry(2, {versionName: '1.0.0', tag: 'android-v1.0.0-2'}));
  assert.equal(validateLedger(l), undefined);
  assert.deepEqual(nextRelease(l, '1.1.0-beta.1'), {versionCode: 3, versionName: '1.1.0-beta.1', tag: 'android-v1.1.0-beta.1-3'});
  assert.throws(() => nextRelease(l, '1.0.0'), /reused/);
});
```

In the record test, `releaseEntry` accepts `android-v1.0.0-6` and refuses `android-v1.0.0-beta-6`.

- [ ] **Step 2: Run the tests and see them fail.** `node --test chromium/tools/android-release-versions.test.mjs chromium/tools/android-release-record.test.mjs`. Expected: FAIL on `tagFor('1.0.0', 6)`.
- [ ] **Step 3: Widen `NAME`, export `TAG`, `channelOf` and `stableOf`, and make `record.mjs` use `TAG`.** The validation message still says `versionName must match` and names both forms.
- [ ] **Step 4: Run every Android release test.** `node --test chromium/tools/android-release-*.test.mjs`. Expected: PASS. The checked-in ledger is still valid.
- [ ] **Step 5: Commit** (`Android release: stable version names beside beta names`).

### Task 2: Upload to any track, with notes and staged rollout

**Files:**
- Modify: `chromium/android/release/play-api.mjs`: `uploadToInternal` becomes `uploadToTrack`; add `updateTrack`.
- Modify: `chromium/android/release/release.mjs`: the `upload` stage reads `track`, `rollout` and `notes` from `WORK/config.json`.
- Test: `chromium/tools/android-release-play.test.mjs`, `chromium/tools/android-release-stages.test.mjs`

**Interfaces:**
- Produces: `uploadToTrack({packageName, aabPath, versionCode, releaseName, token, track, status, userFraction?, notes?}, fetchImpl) -> {editId, versionCode, track}`
  - `status` is one of `'draft' | 'completed' | 'inProgress'`.
  - `userFraction` is required only with `inProgress`, and must be greater than 0 and less than 1.
  - `notes` is en-US text, sent as `releaseNotes: [{language: 'en-US', text}]`.
- Produces: `updateTrack({packageName, token, track, release: {name, versionCodes, status, userFraction?, releaseNotes?}}, fetchImpl) -> {editId}`. It opens an edit, PUTs `tracks/<track>` with that single release, and commits. It deletes the edit on any failure, as today.
- Produces: `trackPlan(config, record, notesText?) -> {track, status, userFraction?, notes?, phrase}`, a pure helper exported from `release.mjs`. The caller reads `config.notes` and passes in its text.
  - `config.track` defaults to `'internal'`.
  - `internal` gives `draft` with no notes. This is today's behavior, and today's phrase is unchanged.
  - `alpha` and `beta` give `completed`.
  - `production` gives `inProgress` with `config.rollout`/100, or `completed` when `config.rollout === 'complete'`.
  - `config.notes` is a path relative to WORK. Its text is trimmed and must be 1–500 characters. It's required for every track except `internal`.
- Phrases:
  - Internal (unchanged): `upload 1.0.0-beta.6 (6) to internal`.
  - Testing tracks: `upload 1.1.0-beta.1 (7) to beta`.
  - Production: `upload 1.0.0 (6) to production at 10%`, or `upload 1.0.0 (6) to production, complete`.
- The receipt adds `track`. The ledger row gets the `published` entry Task 3 defines.

- [ ] **Step 1: Write the failing tests.**

```js
test('a beta goes to the beta track as a completed release with its notes', async t => {
  const {input} = bundle(t);
  const {calls, fetch} = recordingFetch([{id: 'e1'}, {versionCode: 7}, {}, {}]);
  await uploadToTrack({...input, track: 'beta', status: 'completed', notes: 'New Start Page.'}, fetch);
  assert.match(calls[2].url, /\/edits\/e1\/tracks\/beta$/);
  assert.deepEqual(JSON.parse(calls[2].body).releases, [{name: '1.0.0-beta.7', versionCodes: ['7'], status: 'completed', releaseNotes: [{language: 'en-US', text: 'New Start Page.'}]}]);
});
test('production at 10% is inProgress with userFraction 0.1', async t => { /* same shape, userFraction: 0.1 */ });
test('trackPlan refuses a beta name on production and a stable name on alpha or beta', () => {
  assert.throws(() => trackPlan({track: 'production', rollout: 10, notes: 'n.txt'}, {versionName: '1.1.0-beta.1', versionCode: 7}), /beta build.*production/);
  assert.throws(() => trackPlan({track: 'alpha', notes: 'n.txt'}, {versionName: '1.0.0', versionCode: 6}), /stable build.*testing track/);
  assert.equal(trackPlan({}, {versionName: '1.0.0', versionCode: 6}).phrase, 'upload 1.0.0 (6) to internal');
});
test('notes are required off internal, and 501 characters are refused before any request', () => { /* empty, missing, 501 → throws /notes/ ; fetch never called */ });
test('rollout must be a whole number from 1 to 99 or "complete"', () => {
  for (const bad of [0, 100, 150, 10.5, ' 10', '10%', '10']) assert.throws(() => trackPlan({track: 'production', rollout: bad, notes: 'n.txt'}, stable6), /rollout/);
});
```

In `android-release-stages.test.mjs`, an upload with `config.track: 'beta'` asks for the beta phrase, and with the internal default it asks for the old phrase. Any other answer makes no request.

- [ ] **Step 2: Run the tests and see them fail.** `node --test chromium/tools/android-release-play.test.mjs chromium/tools/android-release-stages.test.mjs`
- [ ] **Step 3: Implement `uploadToTrack`, `updateTrack` and `trackPlan`, and wire `trackPlan` into the `upload` stage and `secretWorker`.** `uploadToInternal` is removed and its callers and tests are renamed. The track and rollout come from `config.json` only, never from arguments. `trackPlan` runs before the prompt, so a bad plan asks nothing.
- [ ] **Step 4: Run every Android release test.** Expected: PASS.
- [ ] **Step 5: Commit** (`Android release: upload to any Play track with notes and staged rollout`).

### Task 3: Promote, roll out and record where each build is

**Files:**
- Modify: `chromium/android/release/versions.mjs`: an optional `published` array per ledger row.
- Modify: `chromium/android/release/release.mjs`: new owner commands `promote WORK TRACK` and `rollout WORK (PERCENT|complete|halt)`.
- Test: `chromium/tools/android-release-versions.test.mjs`, `chromium/tools/android-release-stages.test.mjs`

**Interfaces:**
- Consumes: `updateTrack` and `trackPlan` from Task 2, and `channelOf` from Task 1.
- Produces: the ledger row field `published?: [{track, status, fraction?, date, editId}]`, appended in order.
  - `validateLedger` checks each entry: `track` from the four names; `status` one of `completed`, `inProgress`, `halted`; `fraction` is a number greater than 0 and less than 1, present only with `inProgress`; `date` is an ISO timestamp.
  - `state` must already be `uploaded`.
- Produces: `currentProduction(ledger) -> {versionCode, status, fraction?} | null`, the newest row whose last production entry isn't `halted`.
- Promotion and rollout rules (pure, exported as `promotionPlan(ledger, record, track, arg)`):
  - `promote` is for a build already uploaded to another track. It refuses a code below `currentProduction().versionCode` for every track except `production`.
  - `rollout` is for production only, on a build whose last production entry is `inProgress` (or `halted`, for resuming).
    - A new percentage must be above the current one.
    - `complete` sets `completed`.
    - `halt` sets `halted`.
    - `complete` and `halt` refuse a build that isn't rolling out.
- Phrases:
  - `promote 1.1.0-beta.2 (9) to beta`
  - `roll out 1.1.0 (10) to 50%`
  - `complete rollout of 1.1.0 (10)`
  - `halt rollout of 1.1.0 (10)`
- Each command writes `WORK/<command>-<track>-<n>.json` receipts (public: edit ID, code, track, status, fraction) and appends `published`. The owner commits the ledger in a PR, as for uploads today (`docs/android/release.md` step 7).

- [ ] **Step 1: Write the failing tests.**

```js
test('a beta below the production build is not promoted to a testing track', () => {
  const l = ledgerWith({6: {name: '1.0.0', published: [{track: 'production', status: 'completed', ...}]}, 5: {name: '1.0.0-beta.5', state: 'uploaded'}});
  assert.throws(() => promotionPlan(l, row(l, 5), 'beta'), /below the production build/);
});
test('rollout only goes up, and complete or halt need a rollout in progress', () => {
  const l = productionAt(0.1);
  assert.equal(promotionPlan(l, row(l, 6), 'production', 50).phrase, 'roll out 1.0.0 (6) to 50%');
  assert.throws(() => promotionPlan(l, row(l, 6), 'production', 10), /above the current 10%/);
  assert.throws(() => promotionPlan(completed(l), row(l, 6), 'production', 'halt'), /not rolling out/);
});
test('validateLedger refuses a published entry with a fraction on a completed release or an unknown track', () => { /* … */ });
```

- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement `published` validation, `currentProduction`, `promotionPlan` and the two commands.** Each command needs the owner's Mac foreground Terminal, the typed phrase and an `op run` worker, exactly like `upload`. The ledger is rechecked after the phrase is typed.
- [ ] **Step 4: Run every Android release test.** Expected: PASS.
- [ ] **Step 5: Commit** (`Android release: promote builds and move production rollouts`).

### Task 4: Android nightly on the build server

**Files:**
- Create: `chromium/android/release/nightly-rules.mjs` (pure), `chromium/android/release/nightly.mjs` (runs on the server), `chromium/android/server/nightly.sh`, `chromium/android/server/blanc-android-nightly.service` and `.timer`
- Modify: `chromium/android/server/README.md` (install and records)
- Test: `chromium/tools/android-nightly.test.mjs`

**Interfaces:**
- Produces: `skipReason({desktopLock, androidReleaseRunning, startedAt, unchangedSinceLastPass}) -> string | null`. It uses US Eastern wall-clock time from `startedAt`, and refuses at 03:15 or later.
- Produces: `nightVerdict({buildOk, gate}) -> 'pass' | 'fail'`. `gate` is the `release-gate.json` shape. The night passes only if the build succeeded and the gate verdict is `pass`.
- Records: `~/blanc-evidence/android/nightly/<YYYYMMDD-HHMM>/result.json` `{schema: 1, sourceCommit, startedAt, finishedAt, verdict, apkSHA256, skip?}`. `LAST-PASS` holds the newest passing stamp.
- Nightly builds use version name `0.0.0-nightly` and code 0, through a nightly copy of the release arguments. They consume no ledger code, and `verify` refuses them because they aren't in the ledger.

- [ ] **Step 1: Write the failing tests.**

```js
test('the nightly yields to the desktop lane and to the clock', () => {
  assert.match(skipReason({desktopLock: true, startedAt: '2026-11-24T06:00:00Z'}), /desktop checkout/);
  assert.match(skipReason({startedAt: '2026-11-24T08:15:00Z'}), /03:15/); // 03:15 EST
  assert.match(skipReason({unchangedSinceLastPass: true, startedAt: '2026-11-24T06:00:00Z'}), /unchanged/);
  assert.equal(skipReason({startedAt: '2026-11-24T06:00:00Z'}), null);
});
test('a night passes only with a built APK and a passing gate', () => { /* … */ });
```

- [ ] **Step 2: Run the tests and see them fail.** `node --test chromium/tools/android-nightly.test.mjs`
- [ ] **Step 3: Implement the rules and the night.**
  - `nightly.sh` fetches `origin/main` into a nightly worktree, then applies `chromium/` with `apply.py --lane android`.
  - It builds `out/AndroidReleaseX64` through `chromium/tools/build.mjs` under `nice -n 10`, then runs `chromium/tests/android/release-gate.sh` on emulator-5556.
  - It never touches `~/chromium-desktop` or the Android debug outputs.
  - The timer is `OnCalendar=*-*-* 01:00 America/New_York`, installed for the `blanc` user by an owner-approved command in the README.
- [ ] **Step 4: Run every Android test.** Also run `bash -n chromium/android/server/nightly.sh`. Expected: PASS.
- [ ] **Step 5: Commit** (`Android nightly: build and gate the lane each night`). Installing it on the server is the owner's approval at the time.

### Task 5: Chrome stable watch and the security clock

> **Dropped in review (2026-11-23):** `chromium-release-watch.yml` (`scripts/chromium-release-watch.mjs`, owner rule of 2026-11-22) already watches the Android lane with the same 7-day and 72-hour clocks. `channels.md` points at it instead.

**Files:**
- Create: `chromium/android/release/stable-watch.mjs`, `.github/workflows/android-stable-watch.yml` (on `main`, daily at 13:00 UTC and on manual dispatch)
- Test: `chromium/tools/android-stable-watch.test.mjs`

**Interfaces:**
- Produces: `watch({pinned, releases, posts, now}) -> {newer: null | {version, releasedAt, dueBy, urgent}}`.
  - `pinned` is `chromium/lanes/android.json` `.version`.
  - `releases` is chromiumdash `fetch_releases?channel=Stable&platform=Android&num=5` JSON.
  - `posts` is the Chrome Releases Atom feed text.
  - `urgent` is true when a post naming that version says "exists in the wild".
  - `dueBy` is `releasedAt` plus 72 hours when urgent, otherwise plus 7 days.
- The workflow opens or updates one issue, titled `Android: Chrome <version> is out (security clock due <dueBy>)`, labeled `android-security-clock`. It closes the issue when the pin reaches that version. It has `issues: write`, no other permissions, and SHA-pinned actions.

- [ ] **Step 1: Write the failing tests.** Fixtures cover: the same version → `newer: null`; a newer version with an ordinary post → due in 7 days; an "exists in the wild" post → due in 72 hours; an older version listed first → ignored. Versions compare by number, not as text: `156.0.8078.100` is newer than `156.0.8078.79`.
- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement `watch` and the workflow.** Fetch with `fetch`, with no cookies and no credentials. The workflow is classified like the other main-only workflows (`test/unit/ci-website-only-gate.test.js` if it applies).
- [ ] **Step 4: Run the tests and `npm run lint`.** Expected: PASS.
- [ ] **Step 5: Commit** (`Android: watch Chrome stable and start the security clock`).

### Task 6: The runbook

**Files:**
- Create: `docs/android/channels.md`
- Modify: `docs/android/release.md` (config `track`, `rollout` and `notes`; the `promote` and `rollout` commands), `docs/android/play-console.md` (Tracks section, the production right), `chromium/STATUS.md` Android section (one line linking the runbook)
- Test: none beyond `npm run lint` and the docs' links resolving.

- [ ] **Step 1: Write `channels.md`**, covering:
  - D1–D8 as rules.
  - The weekly beta: from the latest `LAST-PASS` night, the tag, the server release build, the gate, then the owner's sign, attest, `upload` to `alpha` (later `beta`) with approved notes, and the ledger PR.
  - The four-weekly stable: the soak check (7 days on the testing track, no regression report, Android vitals crash rate in Play Console no higher than the last stable's), the stable rebuild of the same commit, upload to production at 10%, then `rollout 50`, then `rollout complete`, or `halt`.
  - The security path: the watch issue, `rebase.md`, the patch release, 20% → `complete` within the clock (or `complete` at once when urgent), and a STATUS line on a miss.
  - Before production access: the 12-testers-for-14-days count and how to read it in Play Console, the production access application, the owner granting the service account "Release to production", and the first stable `1.0.0`.
  - After production access: open testing replaces Alpha, and the one email to the signup list (owner-approved text).
- [ ] **Step 2: Update the three docs**, so `release.md`'s stage list matches Tasks 2 and 3 exactly.
- [ ] **Step 3: Commit** (`Android: the beta train runbook`). Open one PR for Tasks 1–6. The website's `/android-beta` change waits for production access, in its own website-only PR.

## Owner steps outside the code

1. Check the decisions above (especially D3's rebuild for stable and D5's cadence).
2. Keep the closed test above 12 opted-in testers for 14 days, then apply for production access in Play Console.
3. Grant the Play service account "Release to production" for Blanc when the first stable is ready.
4. Approve installing the nightly timer on the build server (Task 4).
5. Approve each beta's and stable's notes, and type each upload, promotion and rollout phrase.
