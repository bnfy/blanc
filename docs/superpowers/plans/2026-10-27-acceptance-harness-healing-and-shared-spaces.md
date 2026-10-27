# Acceptance Harness Healing and Shared Spaces Speed-up (PR A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop acceptance suite heal a dead or poisoned test app between scenarios and stop Shared Spaces waiting out the sync request budget, so a full run on the release Mac takes under 10 minutes of test time and one crash costs one scenario.

**Architecture:** All changes are in the test harness (`test/desktop/`) plus two `BLANC_TEST`-only seams in the main process. A small pure module, `test/desktop/support/app-health.js`, decides whether an app handle is usable and formats the healing log; `hooks.js` uses it in the generic `Before`, attributes main-process exceptions to the scenario that caused them in a last-running `After`, and relaunches with the same env and profile. The Shared Spaces hooks relaunch device A on a fresh temporary profile per scenario, and a test-hook action resets the persisted request window where a scenario's own requests still cross the cap. A harness self-test (its own tiny feature and smoke script) proves healing; the F57 feature's own timing proves the speed-up.

**Tech Stack:** Node 22, `@cucumber/cucumber` 13, Playwright `_electron`, Electron 44.9.3, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-27-acceptance-gate-speed-design.md`, §1 and §2 (PR A). §3–§5 are PR B and PR C and are out of scope here.

## Global Constraints

- Target `origin/main` (bd8e523e8 or later), in a fresh worktree. The checkout the spec was written in is on an older branch.
- Nothing in `spec/acceptance/` changes: those feature files are the platform-neutral contract. The harness self-test lives under `test/desktop/harness/`.
- The main-process seams (`resetRequestWindowForTest`, `raiseMainProcessExceptionForTest`) are reachable only through `src/main/test-hook.js`, which `main.js` installs only when `!app.isPackaged && process.env.BLANC_TEST === '1'`. They return nothing that came from sync content, credentials or snapshots.
- No product behaviour changes: the scheduler's restart charging, the 10-per-60 s window and the 60 s periodic pull stay as they are.
- Healing never rewrites a result: the scenario during which the app broke keeps its failure; a relaunch is counted and printed, never silent.
- At most one heal per `Before`. A second failure in the same `Before` fails the scenario.
- `npm run lint` must stay clean (warnings fail CI). If `npm run test:unit` reports audit-inventory drift after editing `src/main/*.js`, run `npm run audit-inventory:write` and commit the result.
- Windows runs the same harness (`quiet-tabs` job): remove temporary profile directories with `fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })`.
- The Linux `@F57` job (`parity-guards.yml`, GNOME keyring under `xvfb-run`) keeps passing; the F57 `Before`'s `gnome_libsecret` assertion is untouched.
- Each task ends with `npm run lint` and the named test commands green before its commit.

## Review Focus

1. A healed app must come back with the same `relaunchEnv` and profile directory the scenario expected (a Linux-platform scenario or a Shared Spaces scenario would otherwise pass on the wrong app). Pinned by the harness feature's scenario "the healed app keeps its profile and environment" (Task 2).
2. A `reset` that throws a transport error after a heal must fail the scenario, not heal again in a loop. Pinned by `acceptance-app-health.test.js` "a reset failure heals once, and only for a transport error" (Task 1), which is the rule `Before` applies (Task 2).
3. A tagged `After` that relaunches the app (`@F57`, `@glance`, `@test-platform-linux`) must not lose a main-process exception logged by the app it closed, and must not cause a second, pointless relaunch. Pinned by the harness scenarios "A main-process exception is attributed even when an After relaunches the app" and "No extra relaunch follows an After that already relaunched" (Task 2).
4. The fresh-profile relaunch must carry `crashAndRelaunch` with it: the hard-crash F57 scenarios (`@F57-9` to `@F57-11`) relaunch into the temporary profile, not the main one. Pinned by `--tags @F57` passing after Task 4, which includes those scenarios.
5. `resetRequestWindow` must never run in a scenario that tests the budget. Pinned by a grep assertion in `test/unit/acceptance-harness-guards.test.js` that only the two named steps call it (Task 5).

---

### Task 1: `app-health.js`, the pure part of healing

**Files:**
- Create: `test/desktop/support/app-health.js`
- Test: `test/unit/acceptance-app-health.test.js`

**Interfaces:**
- Produces:
  - `isTransportError(message: string | undefined): boolean` — true for messages containing `Target crashed`, `Target page, context or browser has been closed`, `has been closed`, or `Execution context was destroyed`.
  - `async probeApp(electronApp, { timeoutMs = 5000 } = {}): Promise<{ healthy: boolean, reason: string | null }>` — `reason` is one of `'no app'`, `'process exited (code N, signal S)'`, `'main process did not answer'`, `'page <url> did not answer: <message>'`. It calls `electronApp.process()`, `electronApp.evaluate(() => 1)` and, for every page in `electronApp.windows()` with `!page.isClosed()`, `page.evaluate('1')`, each raced against the timeout.
  - `createHealingLog(): { record({ scenario, reason }): void, entries: Array<{scenario, reason}>, summaryLines(): string[] }` — `summaryLines()` returns `[]` when nothing was recorded, otherwise `acceptance: the harness relaunched Blanc N time(s)` followed by one `  before "<scenario>": <reason>` line per entry.
  - `firstLine(message: unknown): string` — the first line of `String(message ?? '')`, trimmed.
  - `shouldHealAfterReset({ alreadyHealed: boolean, error: Error }): boolean` — true only when `alreadyHealed` is false and `isTransportError(error.message)` is true. This is the one-heal-per-`Before` rule.

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/acceptance-app-health.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isTransportError, probeApp, createHealingLog, firstLine, shouldHealAfterReset } = require('../desktop/support/app-health');

const fakeApp = ({ exitCode = null, mainOk = true, pages = [] } = {}) => ({
  process: () => ({ exitCode, signalCode: null, pid: 4242 }),
  evaluate: () => (mainOk ? Promise.resolve(1) : new Promise(() => {})),
  windows: () => pages.map(({ url, ok }) => ({
    isClosed: () => false,
    url: () => url,
    evaluate: () => (ok ? Promise.resolve(1) : Promise.reject(new Error('Target crashed'))),
  })),
});

test('transport errors are recognised and ordinary assertion failures are not', () => {
  for (const m of ['Target crashed', 'electronApplication.evaluate: Target page, context or browser has been closed', 'Execution context was destroyed'])
    assert.equal(isTransportError(m), true, m);
  assert.equal(isTransportError('Expected 3 to equal 4'), false);
  assert.equal(isTransportError(undefined), false);
});

test('a live app with answering pages is healthy', async () => {
  assert.deepEqual(await probeApp(fakeApp({ pages: [{ url: 'blanc://newtab/', ok: true }] })), { healthy: true, reason: null });
});

test('an exited process is unhealthy with its exit code', async () => {
  const r = await probeApp(fakeApp({ exitCode: 1 }));
  assert.equal(r.healthy, false); assert.match(r.reason, /process exited \(code 1/);
});

test('a main process that never answers is unhealthy within the timeout', async () => {
  const r = await probeApp(fakeApp({ mainOk: false }), { timeoutMs: 50 });
  assert.deepEqual(r, { healthy: false, reason: 'main process did not answer' });
});

test('one crashed page makes the app unhealthy and names the page', async () => {
  const r = await probeApp(fakeApp({ pages: [{ url: 'blanc://newtab/', ok: true }, { url: 'http://127.0.0.1:1/site/ads.example', ok: false }] }));
  assert.equal(r.healthy, false); assert.match(r.reason, /ads\.example did not answer: Target crashed/);
});

test('a missing app is unhealthy', async () => {
  assert.deepEqual(await probeApp(null), { healthy: false, reason: 'no app' });
});

test('a reset failure heals once, and only for a transport error', () => {
  const transport = new Error('electronApplication.evaluate: Target crashed');
  assert.equal(shouldHealAfterReset({ alreadyHealed: false, error: transport }), true);
  assert.equal(shouldHealAfterReset({ alreadyHealed: true, error: transport }), false);
  assert.equal(shouldHealAfterReset({ alreadyHealed: false, error: new Error('reset: workspace not found') }), false);
  assert.equal(firstLine('Target crashed\n    at CRSession'), 'Target crashed');
});

test('the healing log summarises nothing when nothing happened, and every relaunch otherwise', () => {
  const log = createHealingLog();
  assert.deepEqual(log.summaryLines(), []);
  log.record({ scenario: 'A', reason: 'process exited (code 1, signal null)' });
  log.record({ scenario: 'B', reason: 'page x did not answer: Target crashed' });
  assert.deepEqual(log.summaryLines(), [
    'acceptance: the harness relaunched Blanc 2 time(s)',
    '  before "A": process exited (code 1, signal null)',
    '  before "B": page x did not answer: Target crashed',
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/acceptance-app-health.test.js`
Expected: FAIL, `Cannot find module '../desktop/support/app-health'`.

- [ ] **Step 3: Implement `test/desktop/support/app-health.js`** with the three exports above. `probeApp` races each call against `timeoutMs` with a plain `setTimeout` promise (clear the timer on settle) and returns the first failing reason; it never throws.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unit/acceptance-app-health.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add test/desktop/support/app-health.js test/unit/acceptance-app-health.test.js
git commit -m "Acceptance: app-health probe and healing log"
```

---

### Task 2: Healing in the hooks, proven by a harness self-test

**Files:**
- Modify: `test/desktop/support/hooks.js` (`closeApp` lines 41–53, `launchApp` 55–135, generic `Before` 396–408, `AfterAll` 430–455; new `AfterStep`/`After`)
- Modify: `test/desktop/support/context.js` (add `profileDir: null`, `appSuspect: null`, `pendingMainProcessException: ''`, `healing: null`)
- Modify: `src/main/test-hook.js` (one new action next to `crashTabRenderer`, ~line 3949)
- Modify: `test/desktop/cucumber.mjs` (new exported profile `harness`)
- Create: `test/desktop/harness/healing.feature`, `test/desktop/harness/healing.steps.js`, `test/desktop/healing-smoke.mjs`
- Modify: `package.json` (script `test:acceptance:healing:desktop`)

**Interfaces:**
- Consumes: Task 1's `isTransportError`, `probeApp`, `createHealingLog`; the existing `crashTabRenderer(id)` test hook.
- Produces:
  - `closeApp(electronApp): Promise<string>` — closes the app and **returns** any main-process exception text logged since its launch (previously it threw it). A failed `close()` still rethrows after appending the text to `ctx.pendingMainProcessException`.
  - `ctx.relaunch(extraEnv = {}, { freshProfile = false } = {})` keeps its current behaviour for `freshProfile: false`; Task 4 adds the fresh-profile branch. It records `relaunchEnv` and `ctx.profileDir`.
  - `ctx.healing` — the Task 1 healing log; `ctx.appSuspect` — reason string set when a step or hook failed with a transport error.
  - Test hook `raiseMainProcessExceptionForTest(): true` — `setImmediate(() => { throw new Error('acceptance harness: synthetic main-process exception'); })`; the app's existing `uncaughtException` handler logs it and exits 1.
  - Cucumber profile `harness`: `{ ...common, paths: ['test/desktop/harness/*.feature'], require: [...common.require, 'test/desktop/harness/*.steps.js'], retry: 0 }`.
  - `npm run test:acceptance:healing:desktop` → `node test/desktop/healing-smoke.mjs`.

- [ ] **Step 1: Write the harness feature**

```gherkin
# test/desktop/harness/healing.feature
@harness
Feature: The harness heals the app between scenarios

  Scenario: A renderer crash fails only its own scenario
    Given a fixture page is open
    When the page's renderer is crashed and the page is used again

  Scenario: The next scenario runs on a healed app
    Then the app answers
    And the harness has relaunched Blanc 1 time

  Scenario: A main-process exception fails its own scenario
    Given the app was relaunched with the environment mark "healing-check"
    When a main-process exception is raised

  Scenario: The healed app keeps its profile and environment
    Then the app answers
    And the app still carries the environment mark "healing-check"
    And the app still uses the acceptance profile directory
    And the harness has relaunched Blanc 2 times

  @harness-relaunch-after
  Scenario: A main-process exception is attributed even when an After relaunches the app
    When a main-process exception is raised

  Scenario: No extra relaunch follows an After that already relaunched
    Then the app answers
    And the harness has relaunched Blanc 2 times
```

- [ ] **Step 2: Write the harness steps**

`test/desktop/harness/healing.steps.js`, using `ctx`, `callTestHook` and `overlay.js`'s page lookup pattern (`ctx.app.windows().find(...)`):

- "a fixture page is open": `this.pageUrl = this.fixtureUrl('shared-first'); this.tabId = await this.call('openTab', this.pageUrl);` then `this.page = await waitForValue(async () => ctx.app.windows().find((p) => p.url() === this.pageUrl), Boolean, 'fixture page')`.
- "the page's renderer is crashed and the page is used again": `const crashed = this.page.waitForEvent('crash', { timeout: 5000}); await this.call('crashTabRenderer', this.tabId); await crashed; await this.page.evaluate('1');`. The last call is expected to throw `Target crashed`; do not catch it.
- `After({ tags: '@harness-relaunch-after' }, async () => { await ctx.relaunch(); })` — a tagged After that relaunches, like `@F57`'s.
- "the app answers": `assert.ok(await callTestHook(ctx.app, 'state'))`.
- "the harness has relaunched Blanc {int} time(s)": `assert.equal(ctx.healing.entries.length, n)`.
- "the app was relaunched with the environment mark {string}": `await ctx.relaunch({ BLANC_TEST_HARNESS_MARK: mark })`.
- "a main-process exception is raised": `await callTestHook(ctx.app, 'raiseMainProcessExceptionForTest')`, then wait up to 10 s for `ctx.app.process().exitCode !== null`.
- "the app still carries the environment mark {string}": `assert.equal(await ctx.app.evaluate(() => process.env.BLANC_TEST_HARNESS_MARK), mark)`.
- "the app still uses the acceptance profile directory": `assert.equal(await ctx.app.evaluate(({ app }) => app.getPath('userData')), ctx.profileDir)`.

- [ ] **Step 3: Write the smoke script**

`test/desktop/healing-smoke.mjs` runs `npx cucumber-js -c test/desktop/cucumber.mjs -p harness --format progress --format json:<tmp>/healing.json` (via `child_process.spawnSync`, `stdio: 'pipe'`, capturing stderr), then asserts and exits 0 only if all hold:

```js
// expectations, in scenario order
[ { name: 'A renderer crash fails only its own scenario', status: 'failed', message: /Target crashed/ },
  { name: 'The next scenario runs on a healed app', status: 'passed' },
  { name: 'A main-process exception fails its own scenario', status: 'failed', message: /synthetic main-process exception/ },
  { name: 'The healed app keeps its profile and environment', status: 'passed' },
  { name: 'A main-process exception is attributed even when an After relaunches the app', status: 'failed', message: /synthetic main-process exception/ },
  { name: 'No extra relaunch follows an After that already relaunched', status: 'passed' } ]
// and stderr contains exactly one line matching /^acceptance: the harness relaunched Blanc 2 time\(s\)$/m
```

A scenario's status is the worst status over its `before`, `steps` and `after` arrays in the legacy JSON; the message is the first `error_message` found. Print the JSON path and the stderr on failure.

- [ ] **Step 4: Add the profile and the npm script**, then run the smoke to verify it fails today

Add `export const harness = {...}` as above to `test/desktop/cucumber.mjs` and `"test:acceptance:healing:desktop": "node test/desktop/healing-smoke.mjs"` to `package.json` (next to `test:tab-view-drawing:desktop`; mirror its `pre` script if it has one).

Run: `npm run test:acceptance:healing:desktop`
Expected: FAIL. Scenario 2 fails in `Before` (`Target crashed` attributed to `hooks.js`), scenario 3's exception is not attributed to it, and no relaunch line is printed.

- [ ] **Step 5: Add `raiseMainProcessExceptionForTest` to `src/main/test-hook.js`** beside `crashTabRenderer`, with a one-line comment that it exists for the harness self-test.

- [ ] **Step 6: Implement healing in `hooks.js`**

1. `closeApp` per the Interfaces block: `const text = mainProcessExceptionsSinceLaunch(electronApp); if (text) ctx.pendingMainProcessException += text + '\n';` then `close()`. A `close()` that throws while `electronApp.process().exitCode !== null` is treated as closed (the process is already gone); any other `close()` failure is rethrown. Return `text`.
2. `AfterStep(function ({ result }) { if (result.status === 'FAILED' && isTransportError(result.message)) ctx.appSuspect = firstLine(result.message); })`.
3. `After({ order: 0 }, ...)` — Cucumber runs `After` hooks in descending `order` (default 10000), so this one runs after every tagged `After`; the harness smoke's scenario 5 fails if that is wrong. Body: `const current = mainProcessExceptionsSinceLaunch(ctx.app); const text = ctx.pendingMainProcessException + current; ctx.pendingMainProcessException = '';` If `current` is non-empty, advance `ctx.app.__blancUncaughtOffset` to the log's current size and set `ctx.appSuspect = 'main-process exception'` (the current app is the broken one; an app a tagged `After` already replaced is not). If `text` is non-empty, `throw new Error('Electron main-process exception:\n' + text)`.
4. Generic `Before` (replace the body at lines 396–408; the hook is `async function (scenario)` and the name is `scenario.pickle.name`): reset the per-scenario `ctx` fields as today, then
   ```
   let reason = ctx.appSuspect;
   if (!reason) ({ reason } = await probeApp(ctx.app));
   if (reason) await healApp(name, reason);
   try { await callTestHook(ctx.app, 'reset'); }
   catch (error) {
     if (!shouldHealAfterReset({ alreadyHealed: Boolean(reason), error })) throw error;
     await healApp(name, 'reset: ' + firstLine(error.message));
     await callTestHook(ctx.app, 'reset');
   }
   ```
   where `async function healApp(scenario, reason)` writes `acceptance: relaunching Blanc before "<scenario>" (<reason>)` to stderr, `await closeApp(ctx.app).catch(() => {})`, `ctx.pendingMainProcessException = ''` (whatever the dead app logged was attributed by the `After` already), `ctx.app = await launchApp(relaunchEnv, { profileDir: ctx.profileDir })`, `ctx.healing.record({ scenario, reason })`, `ctx.appSuspect = null`. Remove the old `assertNoMainProcessExceptions(ctx.app)` call from `Before`; the `After` above owns attribution.
5. `BeforeAll`: `ctx.healing = createHealingLog(); ctx.profileDir = userDataDir;`. `ctx.relaunch` sets `relaunchEnv = extraEnv` (as today) and `ctx.profileDir`.
6. `AfterAll`: before closing, `for (const line of ctx.healing.summaryLines()) process.stderr.write(line + '\n')`.
7. Every remaining caller that relied on `closeApp` throwing (`AfterAll`'s `closeFailure`, `@test-platform-linux`, `@F57` hooks) keeps working because they only awaited it; `AfterAll` throws if the returned text is non-empty.

- [ ] **Step 7: Run the smoke to verify it passes**

Run: `npm run test:acceptance:healing:desktop`
Expected: PASS (the script prints the four scenario outcomes and exits 0).

- [ ] **Step 8: Run the ad-blocking feature twenty times to see the crash cost one scenario**

Run: `for i in $(seq 1 20); do npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @adblock --format summary 2>&1 | grep -E 'scenarios \(|relaunched'; done`
Expected: every run reports `7 scenarios (7 passed)`; a run that hit the #1180 crash also prints `acceptance: the harness relaunched Blanc 1 time(s)` (the crashed scenario's own retry runs on the healed app and may pass) or at worst reports `(6 passed, 1 failed)`. Never more than one failed scenario per run. Record the counts in the PR description.

- [ ] **Step 9: Run unit tests and lint, then commit**

Run: `npm run test:unit && npm run lint`
Expected: PASS (run `npm run audit-inventory:write` first if the inventory test reports `src/main/test-hook.js`).

```bash
git add test/desktop/support/hooks.js test/desktop/support/context.js src/main/test-hook.js test/desktop/cucumber.mjs test/desktop/harness package.json test/desktop/healing-smoke.mjs
git commit -m "Acceptance: heal a dead or poisoned app between scenarios"
```

---

### Task 3: Run the healing smoke in CI

**Files:**
- Modify: `.github/workflows/parity-guards.yml` (`quiet-tabs` job, after the "Tab views keep drawing" steps)
- Modify: `.github/workflows/nightly-desktop.yml` (after "Full runnable desktop acceptance suite")

**Interfaces:**
- Consumes: `npm run test:acceptance:healing:desktop` (Task 2).

- [ ] **Step 1: Add the steps**

In `quiet-tabs`, two steps mirroring the existing pair: "Acceptance harness healing (Linux)" with `xvfb-run -a npm run test:acceptance:healing:desktop` under the Linux condition, and "Acceptance harness healing (Windows)" with `npm run test:acceptance:healing:desktop` under the Windows condition. In `nightly-desktop.yml`, one step "Acceptance harness healing" with `if: always()` so it runs even when the suite failed.

- [ ] **Step 2: Verify the website-only gate test still passes** (no new job was added, so no classification change is expected)

Run: `node --test test/unit/ci-website-only-gate.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/parity-guards.yml .github/workflows/nightly-desktop.yml
git commit -m "CI: run the acceptance harness healing smoke"
```

---

### Task 4: Shared Spaces device A on a fresh profile per scenario

**Files:**
- Modify: `test/desktop/support/hooks.js` (`ctx.relaunch`, `ctx.crashAndRelaunch`, `AfterAll`)
- Modify: `test/desktop/steps/shared-spaces.steps.js` (the `Before`/`After` at lines 11–24)

**Interfaces:**
- Consumes: Task 2's `ctx.profileDir`, `closeApp`.
- Produces: `ctx.relaunch(extraEnv, { freshProfile: true })` closes the current app, creates `fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-shared-a-'))`, launches on it with `extraEnv`, sets `ctx.profileDir` and `relaunchEnv`, and remembers the directory in a module-level `tempProfileDirs` Set. Any later `ctx.relaunch` or `AfterAll` removes directories in that Set that are no longer `ctx.profileDir` (with `maxRetries: 5`). `ctx.crashAndRelaunch()` relaunches with `relaunchEnv` and `{ recoveryChoice: 'restore', profileDir: ctx.profileDir }`.

- [ ] **Step 1: Record the baseline**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F57 and not @peer-driver' --format json:/tmp/f57-before.json --format summary`
Then print per-scenario totals: `node -e 'for(const f of require("/tmp/f57-before.json"))for(const e of f.elements){const t=[...(e.before||[]),...e.steps,...(e.after||[])].reduce((x,s)=>x+(s.result.duration||0),0)/1e9;console.log(t.toFixed(1).padStart(7),e.name)}'`
Expected: the set-up step of every scenario after the first takes 60–120 s (the table in the spec). Keep the output for the PR description.

- [ ] **Step 2: Implement the fresh-profile relaunch in `hooks.js`** per the Interfaces block. `launchApp` already accepts `profileDir`; pass `BLANC_TEST_UNCAUGHT_LOG: uncaughtLogPath` unchanged so every app writes the one log.

- [ ] **Step 3: Use it in the F57 hooks**

In `shared-spaces.steps.js`, the `Before({tags:'@F57 and not @peer-driver'})` calls `await ctx.relaunch({BLANC_TEST_SYNC_ENDPOINT:this.sharedFixture.url},{freshProfile:true})` instead of the plain relaunch. The `After` is unchanged: its `ctx.relaunch()` returns to the main profile and removes the temporary one.

- [ ] **Step 4: Run the whole F57 feature, including the hard-crash and two-client scenarios**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @F57 --format json:/tmp/f57-after.json --format summary` and the same per-scenario print as Step 1.
Expected: every scenario passes; every "a Shared Spaces fixture with ..." set-up step is under 3 s; F57-9 to F57-11 (hard crash) pass on the temporary profile; the two-client scenario's own time is recorded. Note which steps are still over 10 s (expected: "device B closes the background Work tab" and "device B still sees its last shareable web page").

- [ ] **Step 5: Run the Linux-style guard locally if possible, otherwise rely on CI**

Run: `BLANC_TEST_PLATFORM=linux npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F57-1' --format summary`
Expected: PASS (the fake platform does not change the keyring assertion on macOS; the real check is the Linux CI job).

- [ ] **Step 6: Lint and commit**

Run: `npm run lint`

```bash
git add test/desktop/support/hooks.js test/desktop/steps/shared-spaces.steps.js
git commit -m "Acceptance: Shared Spaces device A runs on a fresh profile per scenario"
```

---

### Task 5: `resetRequestWindow` for the steps that still cross the cap

**Files:**
- Modify: `src/main/sync.js` (next to `getRequestQueue`, ~line 253; export list ~line 1224)
- Modify: `src/main/main.js` (`sharedSpacesTest` handler, ~line 15558)
- Modify: `test/desktop/steps/shared-spaces.steps.js` (the two steps named in Task 4 Step 4)
- Test: `test/unit/sync-reset-request-window.test.js`, `test/unit/acceptance-harness-guards.test.js`

**Interfaces:**
- Produces:
  - `sync.resetRequestWindowForTest(): Promise<true>` — if a request queue exists: `requestQueue.cancelWhere(() => true, 'request-window-reset')`, `await requestQueue.runningSettled()`, then drop `requestQueue` and `requestScheduler` (both `null`) so `getRequestQueue()` rebuilds them lazily; in every case rebind the Shared Spaces store for the current `accountId` and `update(d => { d.requestLog = []; d.windowLimit = 10; d.backoffUntil = null; })`, then `flush()`.
  - Test-hook action `sharedSpacesTest('resetRequestWindow')` → that function.

- [ ] **Step 1: Write the failing unit test**

Model the Electron stub on `test/unit/sync-preflight.test.js` (it fills `require.cache` for `electron` and tracks JSON stores). Then:

```js
test('resetRequestWindowForTest empties the persisted request log and frees the window', async () => {
  // arrange: enable sync against a fake fetch, then exhaust the window
  //   by issuing requests until status().windowFreesAt > Date.now()
  // act
  await sync.resetRequestWindowForTest();
  // assert
  const stored = JSON.parse(fs.readFileSync(path.join(profileDir, 'shared-spaces.json'), 'utf8'));
  assert.deepEqual(stored.requestLog, []);
  assert.equal(stored.backoffUntil, null);
  assert.ok(sync.status().windowFreesAt <= Date.now());
});
```

To exhaust the window: after `sync.enable(...)` against the stubbed fetch (answering 404 at once, as the preflight test's stub does), call `sync.syncNow(['bookmarks'])` ten times in sequence; each is one queued request, so `sync.status().windowFreesAt` is then in the future.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/unit/sync-reset-request-window.test.js`
Expected: FAIL, `sync.resetRequestWindowForTest is not a function`.

- [ ] **Step 3: Implement `resetRequestWindowForTest` in `sync.js` and export it; add the handler line in `main.js`**: `if(action==='resetRequestWindow')return sync.resetRequestWindowForTest();` inside the existing `sharedSpacesTest` arrow function.

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `node --test test/unit/sync-reset-request-window.test.js`
Expected: PASS.

- [ ] **Step 5: Write the guard test**

```js
// test/unit/acceptance-harness-guards.test.js
test('only the two in-scenario budget waits reset the request window', () => {
  const src = fs.readFileSync('test/desktop/steps/shared-spaces.steps.js', 'utf8');
  assert.equal(src.split("'resetRequestWindow'").length - 1, 2);
  for (const step of ['device B closes the background Work tab', 'device B still sees its last shareable web page'])
    assert.ok(stepBody(src, step).includes('resetRequestWindow'), step);
});
test('the budget scenarios never reset the window', () => {
  const src = fs.readFileSync('test/desktop/steps/shared-spaces.steps.js', 'utf8');
  for (const step of ['the account storage is full and I delete Work', 'the complete clients stay within their request budgets', 'both complete clients exchange quiet tabs'])
    assert.ok(!stepBody(src, step).includes('resetRequestWindow'), step);
});
```

`stepBody(src, name)` returns the text from the step's definition line to the next line starting with `When(`, `Then(` or `Given(`.

- [ ] **Step 6: Add the two calls**

In `shared-spaces.steps.js`, add `await this.call('sharedSpacesTest','resetRequestWindow');` as the first line of the `When('device B closes the background Work tab')` step (before its `editPeer`, so both of `editPeer`'s pulls run on an empty window) and as the first line of the `Then('device B still sees its last shareable web page')` step. Not inside `editPeer`, which other steps share. If Task 4 Step 4 showed a different pair of steps over 10 s, use those and update the guard test's names to match.

- [ ] **Step 7: Run the guard test and the F57 feature again**

Run: `node --test test/unit/acceptance-harness-guards.test.js && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @F57 --format json:/tmp/f57-final.json --format summary`
Expected: PASS; no F57 step over 10 s except inside "Two complete desktop clients converge through the Worker" (its own waits) and "Deleting a Space frees a full account immediately" if its set-up still crosses the cap; `--tags '@F57 and not @peer-driver and not @F57-8'` total under 2 minutes.

- [ ] **Step 8: Unit tests, lint, commit**

Run: `npm run test:unit && npm run lint` (run `npm run audit-inventory:write` first if the inventory test names `src/main/sync.js` or `src/main/main.js`).

```bash
git add src/main/sync.js src/main/main.js test/desktop/steps/shared-spaces.steps.js test/unit/sync-reset-request-window.test.js test/unit/acceptance-harness-guards.test.js
git commit -m "Acceptance: reset the sync request window in the two steps that cross it"
```

---

### Task 6: Whole-suite evidence and the pull request

**Files:**
- Modify: `docs/superpowers/specs/2026-10-27-acceptance-gate-speed-design.md` (status line only: "PR A in review" with the PR number)
- Create (in the PR description, not the repo): the before/after table.

- [ ] **Step 1: Run the full runnable suite with timing, display kept awake**

Run: `caffeinate -dimsu npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --format progress --format json:/tmp/full-after.json 2>/tmp/full-after.err; tail -3 /tmp/full-after.err`
Expected: `563 scenarios (563 passed)` (564 if main added one), measured test time under 10 minutes (sum `result.duration` over all scenarios ÷ 60e9), and either no relaunch line or relaunch lines that each name a scenario that failed for a known reason (#1180).

- [ ] **Step 2: Run the dry profile, the lint and the unit suite one last time**

Run: `npm run test:acceptance:dry && npm run lint && npm run test:unit`
Expected: PASS.

- [ ] **Step 3: Open the PR**

Title: "Acceptance harness: heal the app between scenarios and stop Shared Spaces waiting out the sync budget". Body: the goal in two sentences, the F57 before/after table from Tasks 4–5, the full-suite time from Step 1, the twenty `@adblock` runs from Task 2 Step 8, a link to the spec, and the note that PR B (gate rerun, caffeinate in `release.sh`) and PR C (nightly) follow. End with the attribution line the session requires.

```bash
git push -u origin <branch>
gh pr create --title "..." --body-file <file>
```

- [ ] **Step 4: Update the spec's status line and push**

```bash
git commit -am "Spec: acceptance gate speed-up, PR A in review"
git push
```
