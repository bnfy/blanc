# uBO Decision-Deadline Grace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Blanc's own main-process freezes from failing uBO: a critical decision whose timeout callback runs late gets a bounded grace for answers already queued behind the freeze.

**Architecture:** All behavior lives inside `ask()` in `src/main/ublock-provider.js`, with the three constants in `src/main/ublock-recovery.js`. The provider gains `decisionGrace` status counters and a `BLANC_TEST`-only freeze hook. The uBO desktop suite proves both controls on all four workflow jobs.

**Tech Stack:** Electron 44.5.1 main process (CommonJS), `node:test` with the sandboxed `ask()` fixture, Playwright-Electron desktop suite.

**Spec:** `docs/superpowers/specs/2026-10-06-ubo-deadline-grace-design.md` (approved 2026-10-06). Read it first.

## Global Constraints

- Only critical decisions (`onBeforeRequest`, `onBeforeSendHeaders`, `onHeadersReceived`) get grace. Non-critical operations keep their 10 s `ubo-operation-timeout`; the CSS-helper deadline is unchanged.
- `LATE_TIMER_MS = 100` (a callback at least this late gets grace; 99 ms late fails at once), `GRACE_MS = 250`, `MAX_GRACE_COUNT = 8`.
- An on-time timeout fails exactly as today. No request is sent undecided during grace.
- `decisionGrace: { granted, saved }` are live status counters: `granted` counts individual grace periods; `saved` counts decisions that received at least one grace period **and** then produced a usable decision, meaning the response passed `decideNow()`'s validation (uBO's own block, or the validated allow/redirect/headers value). A reply that fails validation fails the provider and is not counted. They are not copied into `diagnostics` and are not shown in Settings.
- Test-only hooks (`stallAfterNextDecisionForTest`) work only unpackaged with `BLANC_TEST === '1'`. The one-decision grace-disable control is part of that hook, so the negative control runs in the desktop suite on all four platforms without editing source.
- Base deadlines (2 s, 10 s warm-up, 15 s window, 45 s startup) are unchanged.
- `src/main/ublock-provider.js` is a hashed uBO host input: after changing it, run `node scripts/build-ublock-adaptation.cjs --write` and commit `ublock/adaptation.json` with the change.
- Branch from `origin/main`. Run `/verify` and `/simplify` before each commit that changes non-test code. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Merge only when every check run on the exact head SHA has completed with success or skipped, including all four `desktop (...)` jobs (they are not required checks; do not use auto-merge).

---

### Task 1: Grace in `ask()` with status counters

**Files:**
- Modify: `src/main/ublock-recovery.js` (constants + exports)
- Modify: `src/main/ublock-provider.js` (`ask()` at `:281-299`, `status`, new `decisionGrace`, `stallNextDecisionMs`, `stallAfterNextDecisionForTest()`)
- Test: `test/unit/ublock-operation-deadline.test.js` (fixture + new cases), `test/unit/ublock-recovery.test.js` (constants)

**Interfaces:**
- Produces: `recoveryPolicy.LATE_TIMER_MS`, `GRACE_MS`, `MAX_GRACE_COUNT`; `status().decisionGrace = { granted, saved }`; the promise returned by `ask()` carries `graced()` (grace periods that decision received); provider method `stallAfterNextDecisionForTest(ms, { grace = true } = {})`.

- [ ] **Step 1: Extend the fixture and write the failing tests**

In `test/unit/ublock-operation-deadline.test.js`, change the fixture context so the lifted `ask()` has a controllable clock and the new names:

```js
function fixture({ warmUntil = 0 } = {}) {
  const pending = new Map(), timers = [], failures = [];
  const clock = { now: 0 };
  const context = { phase: 'ready', sequence: 0, MAX_PENDING: 256, DEADLINE_MS: 2000, OPERATION_DEADLINE_MS: 10000,
    WARMUP_DEADLINE_MS: 10000, warmUntil,
    pending, send() {}, error: null, pump() {},
    performance: { now: () => clock.now },
    recoveryPolicy: require('../../src/main/ublock-recovery'),
    decisionGrace: { granted: 0, saved: 0 }, stallNextDecisionMs: 0, graceDisabledNext: false,
    setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    fail: code => { failures.push(code); for (const item of pending.values()) item.reject(new Error(code)); pending.clear(); },
  };
  // ...lift and run unchanged...
  // The live context, so tests can set sandbox state such as graceDisabledNext.
  return Object.assign(context, { timers, failures, clock });
}
```

Append the new cases:

```js
// A timeout callback that runs late means main was frozen when it was due.
const fire = (f, index, lateBy) => { f.clock.now += f.timers[index].delay + lateBy; f.timers[index].callback(); };
const answer = f => { const [id, item] = [...f.pending][0]; f.pending.delete(id); item.resolve({}); };

test('a timeout 99 ms late fails at once; 100 ms late gets grace', async () => {
  const early = fixture(); const r1 = early.ask({ kind: 'request', name: 'onBeforeRequest' });
  const rejected = assert.rejects(r1, /ubo-decision-timeout/);
  fire(early, 0, 99); await rejected;
  assert.equal(early.decisionGrace.granted, 0);
  const late = fixture(); late.ask({ kind: 'request', name: 'onBeforeRequest' });
  fire(late, 0, 100);
  assert.deepEqual(late.failures, []);
  assert.equal(late.timers[1].delay, 250);
  assert.equal(late.decisionGrace.granted, 1);
});

test('an answer queued behind a freeze settles during grace', async () => {
  const f = fixture(); const result = f.ask({ kind: 'request', name: 'onHeadersReceived' });
  fire(f, 0, 2000);
  answer(f);
  assert.deepEqual(await result, {});
  assert.deepEqual(f.failures, []);
  assert.equal(result.graced(), 1, 'decideNow() counts it as saved only after validation');
  assert.deepEqual({ ...f.decisionGrace }, { granted: 1, saved: 0 });
});

test('the one-decision grace-disable control fails a late timeout at once', async () => {
  const f = fixture(); f.graceDisabledNext = true;
  const result = f.ask({ kind: 'request', name: 'onBeforeRequest' });
  const rejected = assert.rejects(result, /ubo-decision-timeout/);
  fire(f, 0, 2000); await rejected;
  assert.equal(f.decisionGrace.granted, 0);
  assert.equal(f.graceDisabledNext, false, 'the control applies to one decision only');
});

test('grace stops after eight periods when every check runs late', async () => {
  const f = fixture(); const result = f.ask({ kind: 'request', name: 'onBeforeSendHeaders' });
  const rejected = assert.rejects(result, /ubo-decision-timeout/);
  for (let i = 0; i <= 8; i++) fire(f, i, 500);
  await rejected;
  assert.equal(f.timers.length, 9);
  assert.equal(result.graced(), 8);
  assert.deepEqual({ ...f.decisionGrace }, { granted: 8, saved: 0 });
});

test('a grace check that runs on time fails at that check', async () => {
  const f = fixture(); const result = f.ask({ kind: 'request', name: 'onBeforeRequest' });
  const rejected = assert.rejects(result, /ubo-decision-timeout/);
  fire(f, 0, 600); fire(f, 1, 0);
  await rejected;
  assert.deepEqual({ ...f.decisionGrace }, { granted: 1, saved: 0 });
});

test('non-critical operations never get grace', async () => {
  const f = fixture(); const result = f.ask({ kind: 'site-state', tabId: 1 });
  const rejected = assert.rejects(result, /ubo-operation-timeout/);
  fire(f, 0, 5000); await rejected;
  assert.equal(f.decisionGrace.granted, 0);
  assert.deepEqual(f.failures, []);
});
```

In `test/unit/ublock-recovery.test.js`, extend `constants match the approved spec`:

```js
  assert.equal(recovery.LATE_TIMER_MS, 100);
  assert.equal(recovery.GRACE_MS, 250);
  assert.equal(recovery.MAX_GRACE_COUNT, 8);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/unit/ublock-operation-deadline.test.js test/unit/ublock-recovery.test.js`
Expected: the five new deadline cases and the constants test FAIL (no grace; `ubo-decision-timeout` at the first late callback; constants undefined). The existing deadline cases still pass.

- [ ] **Step 3: Implement**

`src/main/ublock-recovery.js`, beside the other constants, and export them:

```js
// Decision-deadline grace (docs/superpowers/specs/2026-10-06-ubo-deadline-grace-design.md):
// a timeout callback at least LATE_TIMER_MS late means main was frozen when
// it was due; answers queued behind the freeze get up to MAX_GRACE_COUNT
// periods of GRACE_MS before the decision fails closed.
const LATE_TIMER_MS = 100;
const GRACE_MS = 250;
const MAX_GRACE_COUNT = 8;
```

`src/main/ublock-provider.js` state (next to `lastRecovery`):

```js
  const decisionGrace = { granted: 0, saved: 0 };
  let stallNextDecisionMs = 0;    // test-only, see stallAfterNextDecisionForTest()
  let graceDisabledNext = false;  // test-only negative control, same hook
```

`status`: add `decisionGrace: { ...decisionGrace },` to the returned object.

Replace the body of `ask()` from `const promise = new Promise(` through `});` with:

```js
    const item = { timer: null, critical, transport: 'background', graced: 0,
      maxGrace: critical && !graceDisabledNext ? recoveryPolicy.MAX_GRACE_COUNT : 0 };
    if (critical) graceDisabledNext = false;
    const promise = new Promise((resolve, reject) => {
      item.resolve = resolve; item.reject = reject;
      const arm = delay => {
        const due = performance.now() + delay;
        item.timer = setTimeout(() => {
          if (!critical) { pending.delete(id); reject(new Error('ubo-operation-timeout')); return; }
          // Late means main was frozen when this was due: answers queued
          // behind the freeze get a bounded grace before failing closed.
          if (performance.now() - due >= recoveryPolicy.LATE_TIMER_MS && item.graced < item.maxGrace) {
            item.graced++; decisionGrace.granted++;
            arm(recoveryPolicy.GRACE_MS);
            return;
          }
          fail('ubo-decision-timeout');
        }, delay);
      };
      arm(critical ? decisionDeadline() : OPERATION_DEADLINE_MS);
      pending.set(id, item);
      try { send({ ...message, id }); } catch { fail('ubo-background-unavailable'); }
      if (critical && stallNextDecisionMs) {
        const end = Date.now() + stallNextDecisionMs; stallNextDecisionMs = 0;
        while (Date.now() < end) { /* test-only main-process freeze */ }
      }
    });
    // decideNow() counts a saved decision only once the reply validates.
    promise.graced = () => item.graced;
```

In `decideNow()`, keep the promise so the grace it received is known after validation:

```js
    let result;
    const asked = ask({ kind: 'request', name, details: converted });
    try {
      // The extension's own filter-data fetches use its native background.
      result = await asked;
```

and count a saved decision on the two usable returns only, uBO's own block and the validated value:

```js
    const usable = () => { if (asked.graced?.()) decisionGrace.saved++; };
    ...
    if (result.cancel === true) {
      usable();
      return { cancel: true };
    }
    ...
    usable();
    return value;
```

The returns that follow `fail('ubo-response-invalid')` / `fail('ubo-redirect-invalid')` are not counted.

Add next to `exhaustRecoveryForTest()`, and to the returned object:

```js
  // Freeze main right after the next critical decision is sent; with
  // { grace: false } that one decision gets no grace (the negative control).
  function stallAfterNextDecisionForTest(ms, { grace = true } = {}) {
    if (app.isPackaged || process.env.BLANC_TEST !== '1') throw new Error('test-only');
    stallNextDecisionMs = Math.min(Math.max(Number(ms) || 0, 0), 10000);
    graceDisabledNext = !grace;
  }
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/ublock-operation-deadline.test.js test/unit/ublock-recovery.test.js`, then `node scripts/build-ublock-adaptation.cjs --write`, `npm run ublock:check`, `npm run test:unit`, `npm run lint`.
Expected: all pass.

- [ ] **Step 5: Commit** (`/verify`, `/simplify` first)

```bash
git add src/main/ublock-recovery.js src/main/ublock-provider.js ublock/adaptation.json ublock/adaptation.patch test/unit/ublock-operation-deadline.test.js test/unit/ublock-recovery.test.js
git commit -m "Give uBO decisions a bounded grace when Blanc's main process was frozen"
```

---

### Task 2: Desktop controls on every platform

**Files:**
- Modify: `src/main/test-hook.js` (next to `blockingExhaustRecovery`, `:418`)
- Modify: `src/main/main.js` (test refs, next to `blockingExhaustRecovery`, `:9756`)
- Modify: `test/desktop/ublock-origin.mjs` ("decision deadline" stage, `:858-895`)

**Interfaces:**
- Consumes: Task 1 `stallAfterNextDecisionForTest`, `status().decisionGrace`.

- [ ] **Step 1: Test hook**

`src/main/test-hook.js`:

```js
    blockingStallAfterNextDecision(ms, options) { return refs.blockingStallAfterNextDecision(ms, options); },
```

`src/main/main.js` refs:

```js
      blockingStallAfterNextDecision: (ms, options) => blockingProviders.forTab({ private: false, profileId: rt().profileId })?.stallAfterNextDecisionForTest?.(ms, options),
```

- [ ] **Step 2: Hung-uBO control logs its grace delta**

CI cannot guarantee main stayed free while the hung decision was due, and a real stall legitimately grants grace. The desktop test proves the hung request fails closed and recovers (as today); the fake-clock unit tests stay authoritative for "on time means no grace".

In the "decision deadline" stage, just before the hang listener is added:

```js
  const graceBeforeHang = (await call('blockingStatus')).decisionGrace?.granted ?? 0;
```

and right after `assert(Date.now() - deadlineStarted < 5000);`:

```js
  console.log('uBO hung-decision grace delta:', ((await call('blockingStatus')).decisionGrace?.granted ?? 0) - graceBeforeHang);
```

- [ ] **Step 3: Negative and positive freeze controls**

Insert just before `// Manual path: with the budget spent, a failure shows manual recovery.` They must run before that line spends the restart budget: the negative control needs a real automatic restart. After the hung-uBO recovery it uses attempt 2 of 3.

```js
  // Freeze controls (spec 2026-10-06-ubo-deadline-grace). The same 2.5 s
  // main-process freeze right after a decision is sent must fail uBO when
  // grace is disabled for that one decision, and must not when it is enabled.
  const freezeControl = async (path, grace) => {
    await waitForValue(() => call('blockingDecisionDeadline'), value => value === 2000, `warm-up closed for ${path}`, 20000);
    const before = (await call('blockingStatus')).decisionGrace;
    const phases = new Set();
    const watch = setInterval(() => { call('blockingStatus').then(state => phases.add(state.phase), () => {}); }, 50);
    await call('blockingStallAfterNextDecision', 2500, { grace });
    const tabId = await call('openTab', fixture + path);
    await waitForValue(() => hits.includes('/' + path), Boolean, `${path} loads`, 30000);
    await waitForValue(() => call('blockingStatus'), state => state.phase === 'ready', `${path} ends ready`, 30000);
    clearInterval(watch);
    const after = (await call('blockingStatus')).decisionGrace;
    await call('closeTab', tabId);
    return { phases: [...phases], before, after };
  };
  const negative = await freezeControl('grace-negative', false);
  assert(negative.phases.includes('recovering'), `without grace the freeze fails uBO: ${JSON.stringify(negative)}`);
  const positive = await freezeControl('grace-positive', true);
  assert(!positive.phases.includes('recovering') && !positive.phases.includes('failed'), `with grace the freeze does not fail uBO: ${JSON.stringify(positive)}`);
  assert(positive.after.saved > positive.before.saved, `grace saved the frozen decision: ${JSON.stringify(positive)}`);
  console.log('uBO decision grace:', JSON.stringify({ negative, positive }));
```

The negative control's page still loads: its cancelled main-frame GET reloads through the outage token after recovery.

- [ ] **Step 4: Run the suites**

Run: `npm run test:ublock:desktop` (twice) and `npm run test:shield-provider:desktop`. Expected: pass, with `uBO decision grace:` and `uBO hung-decision grace delta:` logged. If popup steps flake, compare against untouched `main` before blaming this change.

- [ ] **Step 5: Commit** (`/verify`, `/simplify` first: `test-hook.js` and `main.js` change)

```bash
git add src/main/test-hook.js src/main/main.js test/desktop/ublock-origin.mjs
git commit -m "Prove decision grace on every platform with a freeze-and-answer control"
```

---

### Task 3: Records, PR and four-platform evidence

**Files:**
- Modify: `docs/ublock-origin-shipping-2026-10-03.md` (append a dated section)
- Modify: `docs/superpowers/specs/2026-10-06-ubo-deadline-grace-design.md` (status line)

- [ ] **Step 1: Shipping record**

Append:

```markdown
## Decision-deadline grace (2026-10-06)

A critical uBO decision whose timeout callback runs at least 100 ms late,
meaning Blanc's main process was frozen when it was due, gets up to eight
250 ms grace periods for answers already queued behind the freeze. An
on-time timeout still fails closed exactly as before; no request is sent
undecided during grace. Under a coincident freeze a genuinely late answer can
be accepted within that bound. The base deadlines are unchanged. Design:
`docs/superpowers/specs/2026-10-06-ubo-deadline-grace-design.md`.
```

- [ ] **Step 2: Commit, push, open the PR**

```bash
git add docs/ublock-origin-shipping-2026-10-03.md
git commit -m "Record decision-deadline grace in the uBO shipping record"
git push -u origin <branch>
```

Open the PR with the evidence from Tasks 1–2, then set the spec status to `approved 2026-10-06 (revision 2, after review) — implemented in <PR link>`, commit and push.

- [ ] **Step 3: Four-platform evidence before merge**

On the exact head SHA, all four `desktop (...)` jobs must pass. Each log must show `uBO decision grace:` with the negative control having entered `recovering` and the positive control having raised `saved`. If any platform's freeze-and-answer control fails, the Electron ordering assumption does not hold there: stop and bring the evidence to the owner before changing the design (spec open point 2).

---

## Self-review notes

- Spec coverage: behavior steps 1–4 → Task 1 Step 3; constants → Task 1; status counters → Task 1 (`status`; `saved` counted in `decideNow()` after validation); invariants 1–4 → Task 1 tests (on time, 99/100 ms, cap, non-critical, one-decision disable); desktop controls on all four jobs → Task 2 Step 3 (negative and positive) + Task 3 Step 3; open point 2 → Task 3 Step 3.
- Review changes (2026-10-06): the hung-uBO desktop check logs its grace delta instead of requiring zero; the sensitivity check is a `BLANC_TEST`-only one-decision grace-disable, run in the suite on every platform instead of a temporary source edit; `saved` counts only validated, usable decisions.
- `saved` is not unit-tested through the lifted `ask()` (validation lives in `decideNow()`); the desktop positive control asserts it rises.
- The lifted fixture now supplies `performance`, `recoveryPolicy`, `decisionGrace`, `stallNextDecisionMs` and `graceDisabledNext`, every free name the new `ask()` reads.
- `receive()` still clears `item.timer` on a decision; `arm()` keeps that field pointing at the newest timer.
