# uBO Automatic Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an available uBlock Origin provider fails mid-session, Blanc restarts it automatically: requests are held (never sent unfiltered), pages the outage cancelled reload, and the manual recovery card appears only if restarts run out.

**Architecture:** A new pure policy module (`src/main/ublock-recovery.js`) holds eligibility, the retry budget, the timing constants and the reload check. The uBO provider (`src/main/ublock-provider.js`) gains cancellable initialization, a recovery episode around its existing `retry()` path, a FIFO hold queue with a bounded drain, and outage tokens. Main and `tab-view.js` claim tokens when a page load fails and reload when the provider says so. Shield, Settings and the strip render a new Restarting state.

**Tech Stack:** Electron 44.5.1 main process (CommonJS), `node:test` unit tests (fake Electron via `vm`), Playwright-Electron desktop suite.

**Spec:** `docs/superpowers/specs/2026-10-06-ubo-automatic-recovery-design.md` (approved 2026-10-06, revision 3). Read it before starting; this plan argues from it.

## Global Constraints

- Fail closed: no normal-profile request reaches the network without a decision from a ready uBO, during recovery or after it.
- No provider substitution: recovery never activates Blanc Blocker for a normal profile.
- No POST replay: only main-frame `GET` loads cancelled by the outage reload, only via their own token, only while the tab still shows that token's error page.
- Budget: at most 3 automatic restarts per profile in any rolling 600000 ms (10 min); delays `[0, 2000, 10000]` ms by attempt.
- `RECOVERY_DEADLINE_MS = 30000` bounds one episode (from the failure, delays included) and any one held request.
- `HOLD_CAPACITY = 512`; `DRAIN_RESERVE = 32` (drain releases while `pending + inTransit < MAX_PENDING - DRAIN_RESERVE`, i.e. `< 224`); `OUTAGE_CLAIM_MS = 10000`; `MAX_OUTAGE_TOKENS = 32` per profile.
- Out of scope, unchanged: startup failures before the first ready, private tabs, Blanc Blocker failures, all decision deadlines (2 s / 10 s warm-up / 15 s window / 45 s startup).
- `src/main/ublock-recovery.js` must not `require('electron')`.
- Diagnostics carry codes and counts only, never URLs. Outage records and tokens never cross IPC, disk, sync or diagnostics.
- User-visible copy, exactly: `uBlock Origin is restarting. New requests are paused.` (chip title, popover line, chooser detail, Settings status) and `uBlock Origin is restarting` (suspended tool pages).
- Bridge contract: the chip `mode` union in `browser-api/contract.json` gains `'restarting'`; run `npm run browser-api:build` and commit the regenerated vectors.
- `CLAUDE.md` and `AGENTS.md` are mirrored verbatim; `cmp` their shared paragraph after editing.
- Work on a branch from `origin/main`, never on `main`. Per the owner's global instructions, run `/verify` and `/simplify` before each commit that changes non-test code. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `src/main/ublock-provider.js` is a hashed uBO host input: after any change to it, run `node scripts/build-ublock-adaptation.cjs --write` and commit `ublock/adaptation.json` and `ublock/adaptation.patch` with the change (`npm run ublock:check` fails otherwise).
- Gates before any PR: `npm run ublock:check`, `npm run lint`, `npm run test:unit`, `npm run browser-api:check`, `npm run substrate:check`, `npm run test:ublock:desktop`, `npm run test:shield-provider:desktop`.

---

### Task 1: Recovery policy module

**Files:**
- Create: `src/main/ublock-recovery.js`
- Test: `test/unit/ublock-recovery.test.js`

**Interfaces:**
- Produces: `RECOVERABLE: Set<string>`, `ATTEMPT_RECOVERABLE: Set<string>`, `RECOVERY_DEADLINE_MS`, `HOLD_CAPACITY`, `DRAIN_RESERVE`, `OUTAGE_CLAIM_MS`, `MAX_OUTAGE_TOKENS`, `createRecoveryBudget({ limit, windowMs, delaysMs, now }) → { take() → { allowed:false } | { allowed:true, attempt:number, delayMs:number }, exhaust() }`, `outageReloadTarget(currentUrl:string, token:string) → string|null`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const recovery = require('../../src/main/ublock-recovery');

test('the module stays pure', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/ublock-recovery.js'), 'utf8');
  assert(!/require\(['"]electron['"]\)/.test(source));
});

test('only transient runtime failures recover automatically', () => {
  for (const code of ['ubo-decision-timeout', 'ubo-background-crashed', 'ubo-background-lost', 'ubo-background-disconnected',
    'ubo-background-unavailable', 'ubo-bridge-crashed', 'ubo-css-crashed', 'ubo-css-timeout']) assert(recovery.RECOVERABLE.has(code), code);
  for (const code of ['ubo-background-unsandboxed', 'ubo-background-node', 'ubo-response-invalid', 'ubo-redirect-invalid',
    'ubo-css-target-invalid', 'ubo-css-capacity', 'ubo-host-capacity', 'ubo-storage-failed', 'ubo-decision-failed',
    'ubo-css-failed', 'ubo-startup-timeout', 'ubo-initialization-failed']) assert(!recovery.RECOVERABLE.has(code), code);
  // Startup codes continue an episode only when an automatic attempt raised them.
  for (const code of ['ubo-startup-timeout', 'ubo-initialization-failed', 'ubo-decision-timeout']) assert(recovery.ATTEMPT_RECOVERABLE.has(code), code);
  assert(!recovery.ATTEMPT_RECOVERABLE.has('ubo-background-node'));
});

test('the budget allows three attempts per rolling window with growing delays', () => {
  let now = 1000;
  const budget = recovery.createRecoveryBudget({ now: () => now });
  assert.deepEqual(budget.take(), { allowed: true, attempt: 1, delayMs: 0 });
  now += 1000;
  assert.deepEqual(budget.take(), { allowed: true, attempt: 2, delayMs: 2000 });
  now += 1000;
  assert.deepEqual(budget.take(), { allowed: true, attempt: 3, delayMs: 10000 });
  assert.deepEqual(budget.take(), { allowed: false });
  now = 1000 + 600000 - 1;
  assert.deepEqual(budget.take(), { allowed: false }, 'still inside the 10-minute window');
  now += 1;
  assert.deepEqual(budget.take(), { allowed: true, attempt: 3, delayMs: 10000 }, 'the oldest attempt aged out');
  budget.exhaust();
  assert.deepEqual(budget.take(), { allowed: false });
});

test('constants match the approved spec', () => {
  assert.equal(recovery.RECOVERY_DEADLINE_MS, 30000);
  assert.equal(recovery.HOLD_CAPACITY, 512);
  assert.equal(recovery.DRAIN_RESERVE, 32);
  assert.equal(recovery.OUTAGE_CLAIM_MS, 10000);
  assert.equal(recovery.MAX_OUTAGE_TOKENS, 32);
});

test('a reload target exists only for the error page carrying that exact token', () => {
  const page = 'https://example.org/a?b=1';
  const error = token => `blanc://error/?${new URLSearchParams({ url: page, code: '-20', desc: 'ERR_BLOCKED_BY_CLIENT', outage: token })}`;
  assert.equal(recovery.outageReloadTarget(error('abc'), 'abc'), page);
  assert.equal(recovery.outageReloadTarget(error('abc'), 'other'), null);
  assert.equal(recovery.outageReloadTarget(`blanc://error/?${new URLSearchParams({ url: page, code: '-20' })}`, 'abc'), null);
  assert.equal(recovery.outageReloadTarget(`blanc://error/?${new URLSearchParams({ url: page, code: '-105', outage: 'abc' })}`, 'abc'), null);
  assert.equal(recovery.outageReloadTarget(page, 'abc'), null);
  assert.equal(recovery.outageReloadTarget(`blanc://error/?${new URLSearchParams({ url: 'javascript:alert(1)', code: '-20', outage: 'abc' })}`, 'abc'), null);
  assert.equal(recovery.outageReloadTarget(error(''), ''), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/unit/ublock-recovery.test.js`
Expected: FAIL, `Cannot find module '../../src/main/ublock-recovery'`.

- [ ] **Step 3: Implement**

```js
'use strict';
// Automatic recovery policy for a uBO provider that fails after it has been
// ready (docs/superpowers/specs/2026-10-06-ubo-automatic-recovery-design.md).
// Pure: no Electron, so it is unit-tested directly.

// Transient runtime failures a restart can clear.
const RECOVERABLE = new Set([
  'ubo-decision-timeout',
  'ubo-background-crashed', 'ubo-background-lost', 'ubo-background-disconnected', 'ubo-background-unavailable',
  'ubo-bridge-crashed', 'ubo-css-crashed', 'ubo-css-timeout',
]);
// Raised while an automatic attempt initializes; they fail that attempt but
// let the episode try again.
const ATTEMPT_RECOVERABLE = new Set([...RECOVERABLE, 'ubo-startup-timeout', 'ubo-initialization-failed']);

const RECOVERY_DEADLINE_MS = 30000;
const HOLD_CAPACITY = 512;
const DRAIN_RESERVE = 32;
const OUTAGE_CLAIM_MS = 10000;
const MAX_OUTAGE_TOKENS = 32;

function createRecoveryBudget({ limit = 3, windowMs = 600000, delaysMs = [0, 2000, 10000], now = Date.now } = {}) {
  const started = [];
  const age = () => { const t = now(); while (started.length && t - started[0] >= windowMs) started.shift(); return t; };
  return {
    take() {
      const t = age();
      if (started.length >= limit) return { allowed: false };
      started.push(t);
      const attempt = started.length;
      return { allowed: true, attempt, delayMs: delaysMs[Math.min(attempt, delaysMs.length) - 1] ?? 0 };
    },
    // Test-only use through the provider's guarded hook.
    exhaust() { const t = age(); while (started.length < limit) started.push(t); },
  };
}

// The URL to reload when `currentUrl` is still the error page created for this
// outage token; otherwise null. Only http(s) targets are ever returned.
function outageReloadTarget(currentUrl, token) {
  if (typeof currentUrl !== 'string' || typeof token !== 'string' || !token) return null;
  let parsed;
  try { parsed = new URL(currentUrl); } catch { return null; }
  if (parsed.protocol !== 'blanc:' || parsed.hostname !== 'error') return null;
  const params = parsed.searchParams;
  if (params.get('code') !== '-20' || params.get('outage') !== token) return null;
  const url = params.get('url') || '';
  return /^https?:\/\//i.test(url) ? url : null;
}

module.exports = {
  RECOVERABLE, ATTEMPT_RECOVERABLE, RECOVERY_DEADLINE_MS, HOLD_CAPACITY, DRAIN_RESERVE,
  OUTAGE_CLAIM_MS, MAX_OUTAGE_TOKENS, createRecoveryBudget, outageReloadTarget,
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/unit/ublock-recovery.test.js` — Expected: all pass. Then `npm run lint`.

- [ ] **Step 5: Commit** (`/verify`, `/simplify` first)

```bash
git add src/main/ublock-recovery.js test/unit/ublock-recovery.test.js
git commit -m "Add the uBO automatic recovery policy module"
```

---

### Task 2: Cancellable provider initialization (fixes the existing unsettled-startup defect)

**Files:**
- Create: `test/unit/support/ublock-provider-harness.js`
- Create: `test/unit/ublock-provider-cancellation.test.js`
- Modify: `test/unit/ublock-provider-startup.test.js` (use the shared harness; assertions unchanged)
- Modify: `src/main/ublock-provider.js` (`initializeInner`, `dispose`, new `cancelInitialization`)

**Interfaces:**
- Produces (harness): `createProviderHarness(t, { install, gates, stall, hooks, recovery }) → { provider, created: { views, extensions, removed, closed }, sent, background, states, release(step), requests(), answer(id, value), crashBackground(), setReadyNode(bool), stall }`. Step names: `cssLoad`, `cssBridgeLoad`, `install`, `extensionLoad`, `backgroundReady`, `bridgeLoad`, `ready`. `stall[step] = 'never'` makes that step never settle; `gates[step] = true` makes it wait for `release(step)`.
- Produces (provider): `cancelInitialization()` (internal), stale runs throw `Error('ubo-initialization-cancelled')`.

- [ ] **Step 1: Write the shared harness** (`test/unit/support/ublock-provider-harness.js`; not picked up by `test/unit/*.test.js`)

```js
'use strict';
// Fake-Electron harness for src/main/ublock-provider.js: the real verified
// package install, with fake views, extensions and bridge IPC. Any async step
// can be gated or made to never settle, and tests answer bridge decisions.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const source = fs.readFileSync(path.join(root, 'src/main/ublock-provider.js'), 'utf8');
const realPackage = require('../../../src/main/ublock-package');

function createProviderHarness(t, { install = realPackage.installVerifiedPackageAsync, gates = {}, stall = {}, hooks = {}, recovery } = {}) {
  const userData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ubo-provider-harness-')));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const session = {};
  const appListeners = new Map();
  const created = { views: [], extensions: [], removed: [], closed: [] };
  const sent = [];
  const states = [];
  const releases = new Map();
  let ipc; let nextId = 1; let readyNode = false;
  const never = () => new Promise(() => {});
  // Resolves when the test releases a gated step; never settles for 'never'.
  const pass = step => {
    if (stall[step] === 'never') return never();
    if (!gates[step]) return Promise.resolve();
    return new Promise(resolve => releases.set(step, resolve));
  };
  function contents(type) {
    const listeners = {};
    const wc = {
      id: nextId++, session, mainFrame: { framesInSubtree: [] }, url: '', listeners, destroyed: false,
      getType: () => type, getURL: () => wc.url, getTitle: () => '', isLoading: () => false,
      isDestroyed: () => wc.destroyed, getOSProcessId: () => 7,
      on(name, listener) { listeners[name] = listener; return wc; },
      once(name, listener) { listeners[name] = listener; return wc; },
      removeListener() { return wc; },
      send(_channel, message) { sent.push({ wc, message }); },
      close() { wc.destroyed = true; created.closed.push(wc.id); },
      setWindowOpenHandler() {}, setBackgroundThrottling() {},
      async loadURL(url) {
        wc.url = url;
        const bridge = url.endsWith('/blanc-bridge.html');
        const css = url.endsWith('/bridge.html');
        if (bridge) await pass('bridgeLoad');
        if (css) await pass('cssBridgeLoad');
        if (css) setImmediate(() => ipc({ sender: wc, senderFrame: wc.mainFrame }, { kind: 'css-ready' }));
        if (bridge) pass('ready').then(() => setImmediate(() => ipc({ sender: wc, senderFrame: wc.mainFrame }, { kind: 'ready', node: readyNode })));
      },
    };
    return wc;
  }
  const background = contents('backgroundPage');
  session.extensions = {
    on() {}, removeListener() {},
    removeExtension(id) { created.removed.push(id); },
    async loadExtension(directory) {
      const id = path.basename(directory) === 'css-host' ? 'csshost' : 'ublockorigin';
      await pass(id === 'csshost' ? 'cssLoad' : 'extensionLoad');
      created.extensions.push(id);
      if (id === 'ublockorigin') {
        background.url = `chrome-extension://${id}/background.html`;
        appListeners.get('web-contents-created')?.({}, background);
        pass('backgroundReady').then(() => setImmediate(() => background.listeners['dom-ready']?.()));
      }
      return { id, path: directory };
    },
  };
  const electron = {
    app: {
      isPackaged: false, getPath: () => userData, getAppPath: () => root, getAppMetrics: () => [{ pid: 7, sandboxed: true }],
      on: (name, listener) => appListeners.set(name, listener), removeListener: name => appListeners.delete(name),
    },
    WebContentsView: class { constructor() { this.webContents = contents('webContents'); created.views.push(this); } },
    ipcMain: { on: (_channel, listener) => { ipc = listener; } },
    webContents: { fromId: () => null, getAllWebContents: () => [background] },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, __dirname: path.join(root, 'src/main'), Buffer, URL, console, performance,
    setTimeout, clearTimeout, setImmediate, process: { platform: 'darwin', env: {} },
    require: name => {
      if (name === 'electron') return electron;
      if (name === './ublock-package') return { ...realPackage, installVerifiedPackageAsync: async options => { await pass('install'); return install(options); } };
      return require(name.startsWith('./') ? path.join(root, 'src/main', name) : name);
    },
  });
  const provider = module.exports.createUblockProvider({
    session, profileId: 'personal',
    hooks: { listTabs: () => [], listWindows: () => [], liveContents: () => null, ...hooks },
    onStateChange: state => states.push(state),
    ...(recovery ? { recovery } : {}),
  });
  const helper = () => created.views.map(view => view.webContents)
    .filter(wc => wc.url.endsWith('/blanc-bridge.html') && !wc.destroyed).at(-1);
  return {
    provider, userData, created, sent, background, states, stall,
    release: step => { releases.get(step)?.(); releases.delete(step); },
    requests: () => sent.filter(item => item.message.kind === 'request'),
    answer(id, value = {}) { const wc = helper(); ipc({ sender: wc, senderFrame: wc.mainFrame }, { kind: 'decision', id, value }); },
    crashBackground() { background.listeners['render-process-gone']?.(); },
    setReadyNode(value) { readyNode = value; },
  };
}

const settle = (promise, ms = 300) => Promise.race([
  promise.then(() => 'resolved', () => 'rejected'),
  new Promise(resolve => setTimeout(() => resolve('pending'), ms)),
]);
const until = async (predicate, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error('condition not reached');
};

module.exports = { createProviderHarness, settle, until };
```

- [ ] **Step 2: Point the startup test at the harness**

In `test/unit/ublock-provider-startup.test.js`, delete the local `fixture()` (lines 16–64) and the now-unused imports, and add:

```js
const { createProviderHarness } = require('./support/ublock-provider-harness');
const realPackage = require('../../src/main/ublock-package');
function fixture(t, install) { return createProviderHarness(t, { install }); }
```

Run: `node --test test/unit/ublock-provider-startup.test.js` — Expected: both existing tests still pass unchanged.

- [ ] **Step 3: Write the failing cancellation tests** (`test/unit/ublock-provider-cancellation.test.js`)

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProviderHarness, settle, until } = require('./support/ublock-provider-harness');

const STAGE = { cssLoad: 'cssHostLoad', cssBridgeLoad: 'cssHostLoad', install: 'install',
  extensionLoad: 'loadExtension', backgroundReady: 'background', bridgeLoad: 'bridge', ready: 'ready' };

for (const step of Object.keys(STAGE)) {
  test(`disposal settles an initialization whose ${step} never settles and leaves nothing open`, async t => {
    const h = createProviderHarness(t, { stall: { [step]: 'never' } });
    const started = h.provider.initialize();
    started.catch(() => {});
    await until(() => h.provider.status().stage === STAGE[step]);
    await new Promise(resolve => setTimeout(resolve, 20));
    const viewsBefore = h.created.views.length;
    h.provider.dispose();
    assert.equal(await settle(started), 'rejected', 'initialize() settles promptly');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(h.created.views.length, viewsBefore, 'no view is created after disposal');
    for (const view of h.created.views) assert(view.webContents.destroyed, 'every created view is closed');
    assert.equal(h.provider.status().phase, 'disposed');
  });
}

test('an extension load that finishes after disposal is unloaded', async t => {
  const h = createProviderHarness(t, { gates: { extensionLoad: true } });
  const started = h.provider.initialize();
  started.catch(() => {});
  await until(() => h.provider.status().stage === 'loadExtension');
  h.provider.dispose();
  assert.equal(await settle(started), 'rejected');
  h.release('extensionLoad');
  await until(() => h.created.removed.includes('ublockorigin'));
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `node --test test/unit/ublock-provider-cancellation.test.js`
Expected: FAIL — `settle(started)` returns `'pending'` (today `initialize()` never settles after disposal), and the late-load test times out.

- [ ] **Step 5: Implement cancellation in `src/main/ublock-provider.js`**

Add near the other `let` declarations (after `let disposed = false;`):

```js
  // Cancels a running initialization (disposal, or a recovery episode giving
  // up): every async step races `cancelled`, then checks the generation.
  let generation = 0;
  let cancelRun = null;
  const CANCELLED = 'ubo-initialization-cancelled';
  function cancelInitialization() {
    generation++;
    cancelRun?.(); cancelRun = null;
    readyReject?.(new Error(CANCELLED));
  }
```

At the top of `initializeInner()` (before `timings = {}`):

```js
    const run = ++generation;
    const cancelled = new Promise((_, reject) => { cancelRun = () => reject(new Error(CANCELLED)); });
    cancelled.catch(() => {});
    const stale = () => run !== generation || disposed;
    const step = async value => {
      const result = await Promise.race([value, cancelled]);
      if (stale()) throw new Error(CANCELLED);
      return result;
    };
```

Then wrap every `await` in `initializeInner()` with `step(...)`:
- `await fs.promises.readFile(...)` → `await step(fs.promises.readFile(...))`
- `await installVerifiedFilesAsync(...)` → `await step(installVerifiedFilesAsync(...))`
- `cssExtension = await loadManaged(cssPath)` and `extension = await loadManaged(installed.path, ...)` stay, but inside `loadManaged` replace `const loaded = await session.extensions.loadExtension(directory, options);` with:

```js
          const loading = session.extensions.loadExtension(directory, options);
          // A load that completes after cancellation is unloaded when it lands.
          Promise.resolve(loading).then(late => { if (stale()) { try { session.extensions.removeExtension(late.id); } catch {} } }, () => {});
          const loaded = await step(loading);
```

- `await cssHelper.webContents.loadURL(...)` → `await step(cssHelper.webContents.loadURL(...))`
- the `cssReady` race → `await step(Promise.race([cssReady, ...]))`
- `await installVerifiedPackageAsync({...hostSources: await readHostSourcesAsync(...)})` → `await step(installVerifiedPackageAsync({ ..., hostSources: await step(readHostSourcesAsync(app.getAppPath())) }))`
- the `backgroundReady` race → `await step(Promise.race([backgroundReady, ...]))`
- `await helper.webContents.loadURL(...)` → `await step(helper.webContents.loadURL(...))`
- `await readyPromise` → `await step(readyPromise)`

Replace the final `catch` of `initializeInner()`:

```js
    } catch (caught) {
      if (caught?.message === CANCELLED || stale()) {
        // Close whatever this run created; nothing outlives the cancellation.
        cleanup();
        cancelRun = null;
        throw new Error(CANCELLED);
      }
      fail(error || 'ubo-initialization-failed'); throw new Error(error);
    }
```

and clear the canceller on success (just before `return status();`): `cancelRun = null;`.

Change `dispose()` to cancel before cleanup:

```js
  function dispose() {
    disposed = true;
    cancelInitialization();
    cleanup();
    suspendedTools.clear();
    state('disposed');
  }
```

- [ ] **Step 6: Run the tests**

Run: `node --test test/unit/ublock-provider-cancellation.test.js test/unit/ublock-provider-startup.test.js test/unit/ublock-operation-deadline.test.js`
Expected: all pass. Then `npm run test:unit` and `npm run lint`.

- [ ] **Step 7: Commit** (`/verify`, `/simplify` first)

```bash
git add src/main/ublock-provider.js test/unit/support/ublock-provider-harness.js test/unit/ublock-provider-cancellation.test.js test/unit/ublock-provider-startup.test.js
git commit -m "Cancel a running uBO initialization when the provider is disposed"
```

---

### Task 3: Recovery episodes, budget, deadline and tool restore

**Files:**
- Modify: `src/main/ublock-provider.js` (`createUblockProvider` options, `status`, `fail`, `suspendTools`, `receive` ready branch, `retry`, new `beginEpisode`/`scheduleAttempt`/`attemptFailed`/`endEpisode`/`restartNetwork`/`restoreTools`/`noteRecovery`/`exhaustRecoveryForTest`)
- Modify: `src/main/blocking-providers.js:68-71` (diagnostics fields)
- Test: `test/unit/ublock-provider-recovery.test.js`
- Test: `test/unit/blocking-providers.test.js` (retry skips a recovering provider)

**Interfaces:**
- Consumes: Task 1 exports; Task 2 `cancelInitialization`, `CANCELLED`, harness.
- Produces: `createUblockProvider({ ..., recovery: { budget, deadlineMs, outageClaimMs } })`; `status().phase === 'recovering'` while an episode runs; `status().recovery = { kind: 'restarting'|'recovered'|'exhausted', attempt, reason? }`; provider method `exhaustRecoveryForTest()` (throws unless unpackaged with `BLANC_TEST === '1'`).

- [ ] **Step 1: Write the failing tests** (`test/unit/ublock-provider-recovery.test.js`)

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProviderHarness, until } = require('./support/ublock-provider-harness');
const { createRecoveryBudget } = require('../../src/main/ublock-recovery');

const fast = (options = {}) => ({ budget: createRecoveryBudget({ delaysMs: [0, 0, 0], ...options }), deadlineMs: 2000 });
async function ready(h) { await h.provider.initialize(); assert.equal(h.provider.status().phase, 'ready'); }

test('a crash after ready restarts uBO automatically', async t => {
  const h = createProviderHarness(t, { recovery: fast() });
  await ready(h);
  h.crashBackground();
  assert.equal(h.provider.status().phase, 'recovering');
  assert.equal(h.provider.status().recovery.kind, 'restarting');
  await until(() => h.provider.status().phase === 'ready');
  assert.deepEqual(h.provider.status().recovery, { kind: 'recovered', attempt: 1 });
  assert.equal(h.created.extensions.filter(id => id === 'ublockorigin').length, 2);
});

test('a failure before the first ready keeps today\'s manual recovery', async t => {
  const h = createProviderHarness(t, { recovery: fast(), gates: { ready: true } });
  const started = h.provider.initialize(); started.catch(() => {});
  await until(() => h.provider.status().stage === 'ready');
  h.crashBackground();
  await assert.rejects(started);
  assert.equal(h.provider.status().phase, 'failed');
  assert.equal(h.provider.status().recovery, undefined);
});

test('an ineligible failure goes straight to manual recovery', async t => {
  const h = createProviderHarness(t, { recovery: fast() });
  await ready(h);
  const decision = h.provider.decide('onBeforeRequest', { id: 1, url: 'https://example.org/', resourceType: 'mainFrame', method: 'GET', webContentsId: 9 });
  await until(() => h.requests().length === 1);
  h.answer(h.requests()[0].message.id, 'not-an-object');
  assert.deepEqual(await decision, { cancel: true });
  assert.equal(h.provider.status().phase, 'failed');
  assert.equal(h.provider.status().error, 'ubo-response-invalid');
});

test('an ineligible failure inside an automatic attempt ends the episode', async t => {
  const h = createProviderHarness(t, { recovery: fast() });
  await ready(h);
  h.setReadyNode(true); // the restarted background reports Node access
  h.crashBackground();
  await until(() => h.provider.status().phase === 'failed');
  assert.equal(h.provider.status().recovery.kind, 'exhausted');
  assert.equal(h.provider.status().recovery.reason, 'ineligible');
});

test('a failure after the budget is spent shows manual recovery', async t => {
  const h = createProviderHarness(t, { recovery: fast({ limit: 1 }) });
  await ready(h);
  h.crashBackground();
  await until(() => h.provider.status().phase === 'ready');
  h.crashBackground();
  assert.equal(h.provider.status().phase, 'failed');
  assert.equal(h.provider.status().recovery.reason, 'budget');
});

test('an attempt still starting at the episode deadline is cancelled', async t => {
  const h = createProviderHarness(t, { recovery: { budget: createRecoveryBudget({ delaysMs: [0, 0, 0] }), deadlineMs: 150 } });
  await ready(h);
  h.stall.ready = 'never'; // the restarted uBO never reports ready
  h.crashBackground();
  await until(() => h.provider.status().phase === 'failed', 1000);
  assert.equal(h.provider.status().recovery.reason, 'deadline');
  assert.equal(h.provider.status().error, 'ubo-background-crashed');
  // The cancelled run closes its views as its rejected step unwinds.
  await until(() => h.created.views.every(view => view.webContents.destroyed));
});

test('recovery ends at uBO ready even when a tool page never finishes restoring', async t => {
  const toolWc = { id: 50, url: 'chrome-extension://ublockorigin/dashboard.html', session: null, mainFrame: { framesInSubtree: [] },
    loads: [], getURL: () => toolWc.url, getTitle: () => 'Dashboard', isDestroyed: () => false, isLoading: () => false,
    on() { return toolWc; }, removeListener() { return toolWc; },
    loadURL(url) { toolWc.loads.push(url); if (url.startsWith('chrome-extension://')) return new Promise(() => {}); toolWc.url = url; return Promise.resolve(); } };
  const tab = { id: 't1', profileId: 'personal', private: false, runtimeId: 'r1' };
  const h = createProviderHarness(t, { recovery: fast(), hooks: { listTabs: () => [tab], liveContents: () => toolWc } });
  toolWc.session = h.background.session;
  await ready(h);
  h.crashBackground();
  assert.match(toolWc.loads[0], /uBlock%20Origin%20is%20restarting/);
  await until(() => h.provider.status().phase === 'ready');
  await until(() => toolWc.loads.includes('chrome-extension://ublockorigin/dashboard.html'));
  assert.equal(h.provider.status().phase, 'ready', 'the never-settling restore does not hold recovery');
});

test('the budget-exhaustion hook is refused outside the unpackaged test build', async t => {
  const h = createProviderHarness(t, { recovery: fast() });
  assert.throws(() => h.provider.exhaustRecoveryForTest(), /test-only/);
});
```

Add to `test/unit/blocking-providers.test.js`:

```js
test('Settings retry leaves a recovering provider to its own episode', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/blocking-providers.js'), 'utf8');
  const retry = source.match(/  async function retry\(\) \{[\s\S]*?\n  \}/)?.[0];
  assert(retry, 'blocking-providers still defines retry()');
  const calls = [];
  const provider = phase => ({ status: () => ({ phase }), retry: async () => calls.push(phase) });
  const context = { profiles: new Map([['a', { provider: provider('recovering') }], ['b', { provider: provider('failed') }]]) };
  vm.runInNewContext(`${retry}\nthis.retry = retry;`, context);
  await context.retry();
  assert.deepEqual(calls, ['failed']);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/unit/ublock-provider-recovery.test.js test/unit/blocking-providers.test.js`
Expected: the recovery tests FAIL (phase is `'failed'`, `recovery` undefined, no `exhaustRecoveryForTest`). The blocking-providers test already passes; it pins existing behavior the episode depends on.

- [ ] **Step 3: Implement the episode in `src/main/ublock-provider.js`**

Imports at the top:

```js
const recoveryPolicy = require('./ublock-recovery');
```

Signature and state:

```js
function createUblockProvider({ session, profileId, hooks, onStateChange = () => {}, onBlocked = () => {}, recovery: recoveryOptions = {} }) {
```

```js
  const budget = recoveryOptions.budget ?? recoveryPolicy.createRecoveryBudget();
  const RECOVERY_DEADLINE = recoveryOptions.deadlineMs ?? recoveryPolicy.RECOVERY_DEADLINE_MS;
  let everReady = false;
  let recovering = false;
  let episode = null; // { code, attempt, deadlineAt, deadline, retryTimer }
  let lastRecovery = null;
```

`status`:

```js
  const status = () => ({ id: 'ublock-origin', version: '1.75.0', phase: recovering ? 'recovering' : phase, error, stage,
    timings: { ...timings }, ...(lastRecovery ? { recovery: { ...lastRecovery } } : {}) });
```

`suspendTools` takes the copy:

```js
  function suspendTools() {
    if (!extension) return;
    const desc = recovering ? 'uBlock%20Origin%20is%20restarting' : 'uBlock%20Origin%20needs%20retry';
    ...
      wc.loadURL(`blanc://error?code=-20&desc=${desc}`).catch(() => {});
```

`fail` decides on an episode before it broadcasts, and schedules the first attempt after cleanup:

```js
  function fail(code) {
    if (disposed || phase === 'failed') return;
    endStage();
    if (!recovering && everReady && recoveryPolicy.RECOVERABLE.has(code)) beginEpisode(code);
    state('failed', code);
    readyReject?.(new Error(code));
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(code)); }
    pending.clear();
    suspendTools();
    // Keep the failed provider in the coordinator so traffic stays closed.
    if (!cleanupScheduled) {
      cleanupScheduled = true;
      setImmediate(() => {
        cleanupScheduled = false; cleanup('background');
        if (episode && !episode.scheduled) { episode.scheduled = true; scheduleAttempt(episode, episode.firstDelay); }
      });
    }
  }
```

Episode functions (add after `fail`):

```js
  function noteRecovery(kind, attempt, reason) {
    lastRecovery = { kind, attempt, ...(reason ? { reason } : {}) };
    onStateChange(status());
  }
  function beginEpisode(code) {
    const ticket = budget.take();
    if (!ticket.allowed) { lastRecovery = { kind: 'exhausted', attempt: 0, reason: 'budget' }; return; }
    recovering = true;
    const current = { code, attempt: ticket.attempt, firstDelay: ticket.delayMs, scheduled: false,
      deadlineAt: Date.now() + RECOVERY_DEADLINE, retryTimer: null };
    current.deadline = setTimeout(() => endEpisode(current, 'deadline'), RECOVERY_DEADLINE);
    episode = current;
    lastRecovery = { kind: 'restarting', attempt: ticket.attempt };
  }
  function scheduleAttempt(current, delayMs) {
    clearTimeout(current.retryTimer);
    current.retryTimer = setTimeout(() => {
      if (episode !== current || disposed) return;
      restartNetwork().then(restoreTools, caught => attemptFailed(current, caught));
    }, delayMs);
  }
  function attemptFailed(current, caught) {
    if (episode !== current) return;
    const code = error || caught?.message;
    if (!recoveryPolicy.ATTEMPT_RECOVERABLE.has(code)) return endEpisode(current, 'ineligible');
    const ticket = budget.take();
    if (!ticket.allowed) return endEpisode(current, 'budget');
    if (Date.now() + ticket.delayMs >= current.deadlineAt) return endEpisode(current, 'deadline');
    current.attempt = ticket.attempt;
    noteRecovery('restarting', ticket.attempt);
    // The attempt's own fail() queued background cleanup first.
    setImmediate(() => scheduleAttempt(current, ticket.delayMs));
  }
  function endEpisode(current, reason) {
    if (episode !== current) return;
    episode = null; recovering = false;
    clearTimeout(current.deadline); clearTimeout(current.retryTimer);
    cancelInitialization();
    releaseHeld();
    lastRecovery = { kind: 'exhausted', attempt: current.attempt, reason };
    state('failed', current.code);
  }
  function finishEpisode() {
    const current = episode;
    episode = null; recovering = false;
    clearTimeout(current.deadline); clearTimeout(current.retryTimer);
    lastRecovery = { kind: 'recovered', attempt: current.attempt };
  }
```

`releaseHeld` is a no-op stub in this task (`function releaseHeld() {}`); Task 4 replaces it.

In `receive`, the `ready` branch ends recovery at network readiness:

```js
      warmUntil = Date.now() + WARMUP_WINDOW_MS;
      send({ kind: 'enabled', value: enabled });
      everReady = true;
      if (recovering) finishEpisode();
      state('ready'); refresh(); readyResolve?.(status()); return;
```

Split `retry()` so tool pages restore after recovery and are never awaited:

```js
  async function restartNetwork() {
    if (disposed || initializePromise || cleanupScheduled) throw new Error('ubo-retry-unavailable');
    await removeOwnedCss();
    suspendTools();
    cleanup();
    await initialize();
  }
  // Best effort once filtering works again; recovery never waits for it.
  function restoreTools() {
    const run = generation;
    const tools = [...suspendedTools.values()]; suspendedTools.clear();
    for (const item of tools) {
      if (item.wc.isDestroyed() || item.wc.session !== session) continue;
      Promise.resolve().then(() => {
        if (run === generation && !disposed && phase === 'ready') return item.wc.loadURL(item.url);
      }).catch(() => {});
    }
  }
  async function retry() {
    await restartNetwork();
    restoreTools();
  }
  function exhaustRecoveryForTest() {
    if (app.isPackaged || process.env.BLANC_TEST !== '1') throw new Error('test-only');
    budget.exhaust();
  }
```

Add `exhaustRecoveryForTest` to the returned object. In `dispose()`, before `cancelInitialization()`:

```js
    if (episode) { clearTimeout(episode.deadline); clearTimeout(episode.retryTimer); episode = null; }
    recovering = false;
```

- [ ] **Step 4: Add recovery fields to diagnostics** (`src/main/blocking-providers.js`, the `onStateChange` in `attach`)

```js
          if (state.error) {
            diagnostics.push({ provider: state.id, version: state.version, error: state.error, stage: state.stage, timings: state.timings,
              ...(state.recovery ? { recovery: state.recovery.kind, attempt: state.recovery.attempt, ...(state.recovery.reason ? { reason: state.recovery.reason } : {}) } : {}) });
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/unit/ublock-provider-recovery.test.js test/unit/ublock-provider-cancellation.test.js test/unit/ublock-provider-startup.test.js test/unit/ublock-operation-deadline.test.js test/unit/blocking-providers.test.js`
Expected: all pass. Then `npm run test:unit`, `npm run lint`.

- [ ] **Step 6: Commit** (`/verify`, `/simplify` first)

```bash
git add src/main/ublock-provider.js src/main/blocking-providers.js test/unit/ublock-provider-recovery.test.js test/unit/blocking-providers.test.js
git commit -m "Restart a uBO provider automatically after a mid-session failure"
```

---

### Task 4: Hold queue and bounded drain

**Files:**
- Modify: `src/main/ublock-provider.js` (`ask`, `decide`, new `holdForRecovery`/`pump`/`releaseHeld`/`drainActive`/`decideNow`; `fail` releases held requests when no episode)
- Test: `test/unit/ublock-provider-hold.test.js`

**Interfaces:**
- Consumes: Task 3 episode state (`recovering`, `episode`, `RECOVERY_DEADLINE`).
- Produces: held requests settle as uBO decisions after ready, or `{ cancel: true }`. Task 5 hooks `noteOutage(details)` into the two cancel paths marked below.

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProviderHarness, settle, until } = require('./support/ublock-provider-harness');
const { createRecoveryBudget } = require('../../src/main/ublock-recovery');

const recovery = { budget: createRecoveryBudget({ delaysMs: [0, 0, 0] }), deadlineMs: 2000 };
let nextRequest = 1;
const request = (h, extra = {}) => h.provider.decide('onBeforeRequest',
  { id: nextRequest++, url: `https://example.org/r${nextRequest}`, resourceType: 'script', method: 'GET', webContentsId: 9, ...extra });
const unanswered = (h, answered) => h.requests().filter(item => !answered.has(item.message.id));

test('a request during recovery waits and is decided by the restarted uBO', async t => {
  const h = createProviderHarness(t, { recovery });
  await h.provider.initialize();
  h.crashBackground();
  const held = request(h);
  assert.equal(await settle(held, 50), 'pending', 'held, not cancelled');
  await until(() => h.provider.status().phase === 'ready');
  await until(() => h.requests().length === 1);
  h.answer(h.requests()[0].message.id, {});
  assert.deepEqual(await held, {});
});

test('512 held requests drain with bounded concurrency and none is cancelled', async t => {
  const h = createProviderHarness(t, { recovery });
  await h.provider.initialize();
  h.crashBackground();
  const results = Array.from({ length: 512 }, () => request(h));
  await until(() => h.provider.status().phase === 'ready');
  const answered = new Set(); let peak = 0;
  while (answered.size < 512) {
    await until(() => unanswered(h, answered).length > 0 || answered.size === 512);
    const open = unanswered(h, answered);
    peak = Math.max(peak, open.length);
    for (const item of open) { answered.add(item.message.id); h.answer(item.message.id, {}); }
    await new Promise(resolve => setImmediate(resolve));
  }
  const decided = await Promise.all(results);
  assert.equal(decided.filter(value => value.cancel).length, 0);
  assert(peak <= 224, `peak ${peak} stays under MAX_PENDING - DRAIN_RESERVE`);
});

test('a burst after the queue empties joins it while drained decisions are pending', async t => {
  const h = createProviderHarness(t, { recovery });
  await h.provider.initialize();
  h.crashBackground();
  const first = Array.from({ length: 224 }, () => request(h));
  await until(() => h.provider.status().phase === 'ready');
  await until(() => h.requests().length === 224); // queue empty, 224 still pending
  const burst = Array.from({ length: 100 }, () => request(h));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(h.requests().length, 224, 'the burst waits instead of bypassing the drain');
  const answered = new Set();
  while (answered.size < 324) {
    await until(() => unanswered(h, answered).length > 0);
    for (const item of unanswered(h, answered)) { answered.add(item.message.id); h.answer(item.message.id, {}); }
    await new Promise(resolve => setImmediate(resolve));
  }
  const decided = await Promise.all([...first, ...burst]);
  assert.equal(decided.filter(value => value.cancel).length, 0, 'no ubo-request-capacity cancellations');
});

test('the 513th held request is cancelled', async t => {
  const h = createProviderHarness(t, { recovery });
  await h.provider.initialize();
  h.stall.ready = 'never';
  h.crashBackground();
  Array.from({ length: 512 }, () => request(h));
  assert.deepEqual(await request(h), { cancel: true });
});

test('held requests are cancelled when the episode deadline passes', async t => {
  const h = createProviderHarness(t, { recovery: { budget: createRecoveryBudget({ delaysMs: [0, 0, 0] }), deadlineMs: 120 } });
  await h.provider.initialize();
  h.stall.ready = 'never';
  h.crashBackground();
  assert.deepEqual(await request(h), { cancel: true });
  assert.equal(h.provider.status().phase, 'failed');
});

test('without an episode a failed provider still cancels at once', async t => {
  const h = createProviderHarness(t, { recovery: { budget: createRecoveryBudget({ limit: 0 }), deadlineMs: 2000 } });
  await h.provider.initialize();
  h.crashBackground();
  assert.deepEqual(await request(h), { cancel: true });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/unit/ublock-provider-hold.test.js`
Expected: FAIL — held requests return `{ cancel: true }` immediately (today's `decide()` cancels whenever `phase !== 'ready'`).

- [ ] **Step 3: Implement**

State (next to the episode state):

```js
  const holdQueue = [];      // FIFO of { resolve, timer }
  let inTransit = 0;         // released from the queue, not yet in `pending`
  let drainOutstanding = 0;  // released and not yet settled
```

Queue functions:

```js
  const drainActive = () => holdQueue.length > 0 || drainOutstanding > 0;
  // Resolves true when the request may ask uBO, false when it must be cancelled.
  function holdForRecovery() {
    if (holdQueue.length >= recoveryPolicy.HOLD_CAPACITY) return Promise.resolve(false);
    return new Promise(resolve => {
      const entry = { resolve, timer: null };
      entry.timer = setTimeout(() => {
        const index = holdQueue.indexOf(entry);
        if (index !== -1) holdQueue.splice(index, 1);
        resolve(false);
      }, RECOVERY_DEADLINE);
      holdQueue.push(entry);
      pump();
    });
  }
  function pump() {
    while (phase === 'ready' && !recovering && holdQueue.length
      && pending.size + inTransit < MAX_PENDING - recoveryPolicy.DRAIN_RESERVE) {
      const entry = holdQueue.shift();
      clearTimeout(entry.timer);
      inTransit++; drainOutstanding++;
      entry.resolve(true);
    }
  }
  function releaseHeld() {
    for (const entry of holdQueue.splice(0)) { clearTimeout(entry.timer); entry.resolve(false); }
  }
```

(Replace Task 3's `releaseHeld` stub with this.) In `fail()`, after `pending.clear();` add `if (!recovering) releaseHeld();`. In `receive`'s ready branch, after `readyResolve?.(status());` call `pump();` before `return`. In `dispose()`, after `recovering = false;` add `releaseHeld();`.

In `ask()`, wake the drain whenever a decision slot frees: replace `return new Promise((resolve, reject) => { ... });` with

```js
    const promise = new Promise((resolve, reject) => { /* unchanged body */ });
    promise.then(pump, pump);
    return promise;
```

In `decide()`, replace `if (phase !== 'ready') return { cancel: true };` and everything after it with:

```js
    if (phase !== 'ready' && !recovering) return { cancel: true };
    if (phase !== 'ready' || drainActive()) {
      if (!(await holdForRecovery())) return { cancel: true }; // Task 5: outage cancel path A
      inTransit--;
      if (phase !== 'ready') { drainOutstanding--; pump(); return { cancel: true }; } // Task 5: outage cancel path A
      return decideNow(name, details, true);
    }
    return decideNow(name, details, false);
  }
  async function decideNow(name, details, drained) {
    const converted = registry.request(details);
    let result;
    try {
      // The extension's own filter-data fetches use its native background.
      result = await ask({ kind: 'request', name, details: converted });
    } finally {
      if (drained) { drainOutstanding--; pump(); }
    }
```

followed by the unchanged remainder of today's `decide()` (from `if (!result || typeof result !== 'object' ...` to `return value;`).

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/ublock-provider-hold.test.js test/unit/ublock-provider-recovery.test.js test/unit/ublock-provider-cancellation.test.js test/unit/ublock-provider-startup.test.js test/unit/ublock-operation-deadline.test.js`
Expected: all pass. Then `npm run test:unit`, `npm run lint`.

- [ ] **Step 5: Commit** (`/verify`, `/simplify` first)

```bash
git add src/main/ublock-provider.js test/unit/ublock-provider-hold.test.js
git commit -m "Hold uBO requests during automatic recovery and drain them with bounded concurrency"
```

---

### Task 5: Outage records and reload tokens (provider)

**Files:**
- Modify: `src/main/ublock-provider.js` (`decide` top, the two cancel paths, `decideNow` catch, `receive` ready branch, `dispose`; new `trackMainFrame`/`noteOutage`/`claimOutage`/`noteMainFrameCommitted`/`markOutageRecovered`/`maybeReload`)
- Test: `test/unit/ublock-provider-outage.test.js`

**Interfaces:**
- Consumes: Task 1 `outageReloadTarget`, `OUTAGE_CLAIM_MS`, `MAX_OUTAGE_TOKENS`; Task 4 cancel paths.
- Produces (provider API used by Task 6): `claimOutage(webContentsId:number, url:string) → string|null`, `noteMainFrameCommitted(webContentsId:number, url:string) → void`. Calls `hooks.reloadAfterOutage({ webContentsId, token, url })`.

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProviderHarness, until } = require('./support/ublock-provider-harness');
const { createRecoveryBudget } = require('../../src/main/ublock-recovery');

const PAGE = 'https://example.org/article';
const errorUrl = token => `blanc://error/?${new URLSearchParams({ url: PAGE, code: '-20', desc: 'ERR_BLOCKED_BY_CLIENT', ...(token ? { outage: token } : {}) })}`;
function setup(t, extra = {}) {
  const reloads = [];
  const h = createProviderHarness(t, { recovery: { budget: createRecoveryBudget({ delaysMs: [0, 0, 0] }), deadlineMs: 2000, ...extra },
    hooks: { reloadAfterOutage: entry => reloads.push(entry) } });
  return { h, reloads };
}
async function cancelledByOutage(h, details) {
  await h.provider.initialize();
  const decision = h.provider.decide('onBeforeRequest', { webContentsId: 9, resourceType: 'mainFrame', method: 'GET', url: PAGE, ...details });
  decision.catch(() => {});
  await until(() => h.requests().length >= 1);
  h.crashBackground();
  await assert.rejects(decision);
}

test('the outage\'s own failure claims a token, and the page reloads after commit and recovery', async t => {
  const { h, reloads } = setup(t);
  await cancelledByOutage(h, { id: 10 });
  const token = h.provider.claimOutage(9, PAGE);
  assert.match(token, /^[0-9a-f]{32}$/);
  h.provider.noteMainFrameCommitted(9, errorUrl(token));
  assert.equal(reloads.length, 0, 'waits for uBO');
  await until(() => h.provider.status().phase === 'ready');
  assert.deepEqual(reloads, [{ webContentsId: 9, token, url: PAGE }]);
});

test('recovery may finish before the error page commits', async t => {
  const { h, reloads } = setup(t);
  await cancelledByOutage(h, { id: 11 });
  const token = h.provider.claimOutage(9, PAGE);
  await until(() => h.provider.status().phase === 'ready');
  assert.equal(reloads.length, 0, 'waits for the error page');
  h.provider.noteMainFrameCommitted(9, errorUrl(token));
  assert.deepEqual(reloads, [{ webContentsId: 9, token, url: PAGE }]);
});

test('a later navigation to the same URL cannot claim the older record', async t => {
  const { h } = setup(t);
  await cancelledByOutage(h, { id: 12 });
  // A later POST to the same URL starts in that tab (new request id).
  h.provider.decide('onBeforeRequest', { id: 13, webContentsId: 9, resourceType: 'mainFrame', method: 'POST', url: PAGE }).catch(() => {});
  assert.equal(h.provider.claimOutage(9, PAGE), null);
});

test('a stale record cannot be claimed', async t => {
  const { h } = setup(t, { outageClaimMs: 30 });
  await cancelledByOutage(h, { id: 14 });
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(h.provider.claimOutage(9, PAGE), null);
});

test('POST and subresource cancellations are never recorded', async t => {
  for (const details of [{ id: 15, method: 'POST' }, { id: 16, resourceType: 'script' }]) {
    const { h } = setup(t);
    await cancelledByOutage(h, details);
    assert.equal(h.provider.claimOutage(9, PAGE), null);
  }
});

test('leaving the error page drops its token', async t => {
  const { h, reloads } = setup(t);
  await cancelledByOutage(h, { id: 17 });
  const token = h.provider.claimOutage(9, PAGE);
  h.provider.noteMainFrameCommitted(9, 'https://elsewhere.example/');
  await until(() => h.provider.status().phase === 'ready');
  h.provider.noteMainFrameCommitted(9, errorUrl(token));
  assert.equal(reloads.length, 0);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/unit/ublock-provider-outage.test.js` — Expected: FAIL, `h.provider.claimOutage is not a function`.

- [ ] **Step 3: Implement**

Imports: change `const { randomUUID } = require('node:crypto');` to `const { randomUUID, randomBytes } = require('node:crypto');`.

State and options:

```js
  const OUTAGE_CLAIM = recoveryOptions.outageClaimMs ?? recoveryPolicy.OUTAGE_CLAIM_MS;
  const latestMainFrame = new Map(); // webContentsId → request id of its current http(s) main-frame request
  const outageRecords = new Map();   // request id → { webContentsId, url, at }
  const outageTokens = new Map();    // token → { webContentsId, url, committed, recovered }
```

Functions:

```js
  const httpMainFrame = details => details.resourceType === 'mainFrame'
    && Number.isInteger(details.webContentsId) && /^https?:/i.test(details.url || '');
  function trackMainFrame(details) {
    if (!httpMainFrame(details) || latestMainFrame.get(details.webContentsId) === details.id) return;
    latestMainFrame.delete(details.webContentsId);
    latestMainFrame.set(details.webContentsId, details.id);
    if (latestMainFrame.size > 512) latestMainFrame.delete(latestMainFrame.keys().next().value);
    for (const [id, record] of outageRecords) if (record.webContentsId === details.webContentsId && id !== details.id) outageRecords.delete(id);
  }
  function noteOutage(details) {
    if (!httpMainFrame(details) || details.method !== 'GET') return;
    const now = Date.now();
    for (const [id, record] of outageRecords) if (now - record.at >= OUTAGE_CLAIM) outageRecords.delete(id);
    outageRecords.set(details.id, { webContentsId: details.webContentsId, url: details.url, at: now });
  }
  function claimOutage(webContentsId, url) {
    const latest = latestMainFrame.get(webContentsId);
    let found = null;
    for (const [id, record] of outageRecords) {
      if (record.webContentsId !== webContentsId) continue;
      outageRecords.delete(id); // consumed either way
      if (id === latest && record.url === url && Date.now() - record.at < OUTAGE_CLAIM) found = record;
    }
    if (!found || outageTokens.size >= recoveryPolicy.MAX_OUTAGE_TOKENS) return null;
    const token = randomBytes(16).toString('hex');
    outageTokens.set(token, { webContentsId, url, committed: false, recovered: phase === 'ready' && !recovering });
    return token;
  }
  function maybeReload(token, entry) {
    if (!entry.committed || !entry.recovered) return;
    outageTokens.delete(token);
    hooks.reloadAfterOutage?.({ webContentsId: entry.webContentsId, token, url: entry.url });
  }
  function noteMainFrameCommitted(webContentsId, url) {
    for (const [token, entry] of outageTokens) {
      if (entry.webContentsId !== webContentsId) continue;
      if (recoveryPolicy.outageReloadTarget(url, token) === entry.url) { entry.committed = true; maybeReload(token, entry); }
      else outageTokens.delete(token); // the tab left that error page
    }
  }
  function markOutageRecovered() {
    for (const [token, entry] of outageTokens) { entry.recovered = true; maybeReload(token, entry); }
  }
```

Wire them in:
- First line of `decide()`: `trackMainFrame(details);`
- Both "Task 5: outage cancel path A" returns become `{ noteOutage(details); return { cancel: true }; }`.
- In `decideNow()`, add a `catch` to the `try` around `ask()`: `catch (caught) { if (caught?.message !== 'ubo-request-capacity') noteOutage(details); throw caught; }`.
- In `receive`'s ready branch, after `pump();`: `markOutageRecovered();`.
- In `dispose()`: `latestMainFrame.clear(); outageRecords.clear(); outageTokens.clear();`.
- Add `claimOutage, noteMainFrameCommitted` to the returned object.

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/ublock-provider-outage.test.js test/unit/ublock-provider-hold.test.js test/unit/ublock-provider-recovery.test.js test/unit/ublock-provider-cancellation.test.js`
Expected: all pass. Then `npm run test:unit`, `npm run lint`.

- [ ] **Step 5: Commit** (`/verify`, `/simplify` first)

```bash
git add src/main/ublock-provider.js test/unit/ublock-provider-outage.test.js
git commit -m "Bind uBO outage reloads to the exact cancelled navigation"
```

---

### Task 6: Main and tab-view wiring for outage reloads

**Files:**
- Modify: `src/main/tab-view.js:338-345` (`did-navigate`) and `:444-466` (`did-fail-load`)
- Modify: `src/main/main.js` — `initTabView({...})` deps near `:5468`; `createBlockingProviders({ hooks })` near `:8858`

**Interfaces:**
- Consumes: Task 5 `claimOutage`, `noteMainFrameCommitted`, `hooks.reloadAfterOutage`; Task 1 `outageReloadTarget`.
- Produces: deps `claimOutage(tab, wc, url) → string|null`, `noteMainFrameCommitted(tab, wc, url)`.

- [ ] **Step 1: tab-view `did-fail-load` claims a token**

Replace the `const q = tab.certificateError ? ... : new URLSearchParams({ ... });` statement with:

```js
    const q = tab.certificateError
      ? certificateErrorQuery(tab.certificateError, {
          url: validatedURL,
          code: errorCode,
          desc: errorDescription,
        }, { canContinue })
      : new URLSearchParams({ url: validatedURL, code: String(errorCode), desc: errorDescription });
    // A load uBO's automatic recovery cancelled gets a one-time token, so
    // that page (and only that page) reloads once uBO is back.
    const outage = !tab.certificateError && errorCode === -20 ? deps.claimOutage?.(tab, wc, validatedURL) : null;
    if (outage) q.set('outage', outage);
```

- [ ] **Step 2: tab-view `did-navigate` reports main-frame commits**

In the `did-navigate` handler, right after `tab.navEpoch++;`:

```js
    deps.noteMainFrameCommitted?.(tab, wc, url);
```

- [ ] **Step 3: main.js deps**

In `initTabView({ ... })`:

```js
  claimOutage: (tab, wc, url) => (tab.private ? null : blockingProviders?.forTab(tab)?.claimOutage?.(wc.id, url) ?? null),
  noteMainFrameCommitted: (tab, wc, url) => { if (!tab.private) blockingProviders?.forTab(tab)?.noteMainFrameCommitted?.(wc.id, url); },
```

In `createBlockingProviders({ hooks: { ... } })`, add (import `outageReloadTarget` from `./ublock-recovery` at the top of `main.js`):

```js
      // Spec §3 step 5: revalidate right before loading, and again when the
      // queued navigation actually runs.
      reloadAfterOutage: ({ webContentsId, token }) => {
        const wc = webContents.fromId(webContentsId);
        const tab = wc && tabs.get(tabIdByWebContentsId.get(wc.id));
        const target = () => (tab && wc && !wc.isDestroyed() && !tab.private && !tab.sleeping
          && !heldWebContents.has(wc.id) && liveContents(tab) === wc
          ? outageReloadTarget(wc.getURL(), token) : null);
        const url = target();
        if (!url) return;
        queueTabNavigation(wc, { isCurrent: () => target() === url, run: contents => contents.loadURL(url) });
      },
```

- [ ] **Step 4: Verify**

Run: `npm run lint`, `npm run test:unit`, `npm run browser-api:check`.
Expected: pass. The end-to-end behavior is proven by Task 8's desktop stage.

- [ ] **Step 5: Commit** (`/verify`, `/simplify` first)

```bash
git add src/main/tab-view.js src/main/main.js
git commit -m "Reload pages a uBO outage cancelled once uBO is back"
```

---

### Task 7: Restarting state in shield, Settings and strip

**Files:**
- Modify: `src/main/shield-model.js` (`shieldChipState`, `shieldPopoverModel`, `shieldProviderModel`)
- Modify: `src/renderer/pages/settings.js` (`renderBlocking`)
- Modify: `src/renderer/renderer.js:705-711`, `src/renderer/styles.css` (near `.shield.shield-off`, `:1368`)
- Modify: `browser-api/contract.json:143` (chip `mode` union), then regenerate with `npm run browser-api:build`
- Test: `test/unit/shield-model.test.js`, `test/unit/blocking-settings-recovery.test.js`

**Interfaces:**
- Consumes: `readiness`/`phase === 'recovering'` from `blockingProviders.status()`.
- Produces: chip `mode: 'restarting'`.

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/shield-model.test.js`:

```js
const RESTARTING = 'uBlock Origin is restarting. New requests are paused.';
test('a restarting uBO has its own chip, popover and chooser state', () => {
  const input = { url: HTTP, blockedCount: 4, adblockEnabled: true, provider: 'ublock-origin', readiness: 'recovering' };
  assert.deepEqual(shieldChipState(input), { mode: 'restarting', count: 0, title: RESTARTING });
  assert.equal(shieldPopoverModel(input).countLine, RESTARTING);
  assert.equal(shieldProviderModel({ active: 'ublock-origin', selected: 'ublock-origin', phase: 'recovering', enabled: true }).detail, RESTARTING);
  // With blocking switched off nothing is paused; the off state stays.
  assert.equal(shieldChipState({ ...input, adblockEnabled: false }).mode, 'off');
  assert.equal(shieldPopoverModel({ ...input, adblockEnabled: false }).countLine, 'Ad blocking is off everywhere');
});
```

Append to `test/unit/blocking-settings-recovery.test.js`:

```js
test('Settings shows a restarting uBO without recovery buttons', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.js'), 'utf8');
  const render = source.match(/const renderBlocking = \(state\) => \{[\s\S]*?\n    \};/)[0];
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, { hidden: false, textContent: '', querySelector: () => ({}) }); return elements.get(id); };
  const context = { document: { getElementById: element }, selector: element('adblockProvider'), label: id => id === 'blanc' ? 'Blanc Blocker' : 'uBlock Origin' };
  vm.runInNewContext(render + '\nthis.render = renderBlocking;', context);
  context.render({ active: 'ublock-origin', selected: 'ublock-origin', exposed: true, supported: true, phase: 'recovering', enabled: true, error: 'ubo-decision-timeout' });
  assert.equal(element('blockingProviderStatus').textContent, 'uBlock Origin is restarting. New requests are paused.');
  for (const id of ['blockingRecovery', 'ublockRetry', 'ublockUseBlanc', 'ublockContinue']) assert.equal(element(id).hidden, true, id);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/unit/shield-model.test.js test/unit/blocking-settings-recovery.test.js` — Expected: FAIL (chip mode `'off'`; Settings prints `uBlock Origin recovering.`).

- [ ] **Step 3: Implement**

`src/main/shield-model.js`, add near the top: `const RESTARTING = 'uBlock Origin is restarting. New requests are paused.';`

In `shieldChipState`, inside `if (provider === 'ublock-origin') {`, after the hidden check:

```js
    if (readiness === 'recovering' && adblockEnabled) return { mode: 'restarting', count: 0, title: RESTARTING };
```

In `shieldPopoverModel`'s uBO `countLine`:

```js
    const countLine = !adblockEnabled ? 'Ad blocking is off everywhere'
      : readiness === 'recovering' ? RESTARTING
        : readiness !== 'ready' ? 'Blocking needs attention. Open blocking settings to recover.'
          : `${blocked} ${blocked === 1 ? 'request' : 'requests'} blocked on this page`;
```

In `shieldProviderModel`, after `else if (off) detail = 'Blocking is off.';`:

```js
    else if (status?.phase === 'recovering') detail = RESTARTING;
```

`src/renderer/pages/settings.js` `renderBlocking` status chain, before the `state.phase === 'failed'` branch:

```js
        : state.phase === 'recovering'
          ? `${label(state.active)} is restarting. New requests are paused.`
```

`src/renderer/renderer.js` after the `shield-quiet` toggle:

```js
    pillShield.classList.toggle('shield-restarting', shield.mode === 'restarting');
```

`src/renderer/styles.css` after `.shield.shield-off`:

```css
/* uBO is restarting: requests are paused, neither protected nor off. */
.shield.shield-restarting { color: var(--text-dim); animation: shield-restarting 1.6s ease-in-out infinite; }
@keyframes shield-restarting { 50% { opacity: 0.4; } }
@media (prefers-reduced-motion: reduce) { .shield.shield-restarting { animation: none; opacity: 0.7; } }
```

`browser-api/contract.json:143`: `"type": "'hidden' | 'off' | 'count' | 'quiet' | 'restarting'"`, then run `npm run browser-api:build`.

- [ ] **Step 4: Run the checks**

Run: `node --test test/unit/shield-model.test.js test/unit/blocking-settings-recovery.test.js`, `npm run browser-api:check`, `npm run substrate:check`, `npm run test:unit`, `npm run lint`. Expected: all pass.

- [ ] **Step 5: Capture the Restarting chip for approval**

Relaunch the dev app (`npm start`; chrome CSS only loads at window creation). Use a scratch Playwright script (not committed) based on the decision-deadline stage in `test/desktop/ublock-origin.mjs`. It hangs uBO's `onBeforeRequest` after the warm-up window closes, opens a fixture tab, waits until `blockingStatus().phase === 'recovering'`, and screenshots the strip. Crop the chip area at full resolution, with *before* (failed state today: shield off) stacked over *after* (restarting), in light and dark. Get the owner's approval of the look before Task 9's PR is opened. Delete any `output/` artifacts afterwards.

- [ ] **Step 6: Commit** (`/verify`, `/simplify` first)

```bash
git add src/main/shield-model.js src/renderer/pages/settings.js src/renderer/renderer.js src/renderer/styles.css browser-api/ test/unit/shield-model.test.js test/unit/blocking-settings-recovery.test.js
git commit -m "Show a distinct Restarting state while uBO recovers"
```

---

### Task 8: Desktop acceptance for automatic and manual recovery

**Files:**
- Modify: `src/main/test-hook.js:412-419` (add `blockingExhaustRecovery`)
- Modify: `src/main/main.js` test refs near `:9740` (add `blockingExhaustRecovery`)
- Modify: `test/desktop/ublock-origin.mjs:858-874` ("decision deadline" stage)

**Interfaces:**
- Consumes: Task 3 `exhaustRecoveryForTest()`; Tasks 4–6 behavior.

- [ ] **Step 1: Test hook**

`src/main/test-hook.js`, next to `blockingRetry()`:

```js
    blockingExhaustRecovery() { return refs.blockingExhaustRecovery(); },
```

`src/main/main.js`, next to `blockingRetry:`:

```js
      blockingExhaustRecovery: () => blockingProviders.forTab({ private: false, profileId: rt().profileId })?.exhaustRecoveryForTest?.(),
```

- [ ] **Step 2: Rewrite the stage**

Replace from `const deadlineStarted = Date.now();` through the `await waitForValue(() => call('blockingStatus'), state => state.phase === 'ready', 'deadline retry', 20000);` line with:

```js
  const postTab = await call('openTab', fixture + 'post-form');
  const postPage = await waitForValue(async () => (await electron.windows()).find(page => page.url().includes('/post-form')), Boolean, 'POST fixture');
  await postPage.waitForSelector('form');
  // Hang uBO (as before), then cause one GET and one POST main-frame load.
  await electron.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage').executeJavaScript(
    "chrome.webRequest.onBeforeRequest.addListener(() => new Promise(() => {}), {urls:['<all_urls>']}, ['blocking']); true"));
  const deadlineStarted = Date.now();
  const deadlineId = await call('openTab', fixture + 'deadline-gated');
  await postPage.evaluate(() => document.querySelector('form').submit());
  await waitForValue(() => call('blockingStatus'), state => state.phase === 'recovering', 'automatic recovery starts', 6000);
  assert(Date.now() - deadlineStarted < 5000);
  assert(!hits.includes('/deadline-gated'), 'the hung request never reached the server');
  const recoveryStarted = Date.now();
  await waitForValue(() => call('blockingStatus'), state => state.phase === 'ready', 'automatic recovery without Retry', 30000);
  console.log('uBO automatic recovery ms:', Date.now() - recoveryStarted);
  assert.equal(await call('blockingDecisionDeadline'), 10000, 'a fresh ready opens the decision warm-up window');
  await waitForValue(() => hits.filter(hit => hit === '/deadline-gated').length, count => count === 1, 'the cancelled GET page reloads once', 15000);
  assert(!methods.some(item => item.method === 'POST' && item.url.startsWith('/post-result')), 'the cancelled POST is not resubmitted');
  await call('closeTab', postTab);
  await call('closeTab', deadlineId);
  // Manual path: with the budget spent, a failure shows manual recovery.
  await call('blockingExhaustRecovery');
  await waitForValue(() => call('blockingDecisionDeadline'), value => value === 2000, 'decision warm-up window closed again', 20000);
  await electron.evaluate(async ({ webContents }) => webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage').executeJavaScript(
    "chrome.webRequest.onBeforeRequest.addListener(() => new Promise(() => {}), {urls:['<all_urls>']}, ['blocking']); true"));
  await call('openTab', fixture + 'deadline-gated?manual');
  await waitForValue(() => call('blockingStatus'), state => state.phase === 'failed', 'manual recovery after the budget', 6000);
  assert.equal((await call('blockingStatus')).recovery?.reason, 'budget');
  await call('blockingRetry');
  await waitForValue(() => call('blockingStatus'), state => state.phase === 'ready', 'manual retry', 20000);
```

Keep the lines after it (`one background after retry`, the held-view checks) unchanged.

- [ ] **Step 3: Run the desktop suites**

Run: `npm run test:ublock:desktop` (twice), then `npm run test:shield-provider:desktop`.
Expected: pass, with `uBO automatic recovery ms:` printed. If the redirect assumption in spec §3 step 1 matters for a failure you see, add a `/redirect-start` variant of the GET to this stage and confirm one reload.

- [ ] **Step 4: Commit** (`/verify`, `/simplify` first: `test-hook.js` and `main.js` change)

```bash
git add src/main/test-hook.js src/main/main.js test/desktop/ublock-origin.mjs
git commit -m "Cover automatic and manual uBO recovery in the desktop suite"
```

---

### Task 9: Docs, policy text and CI evidence

**Files:**
- Modify: `CLAUDE.md`, `AGENTS.md` (the platform-direction paragraph)
- Modify: `docs/ublock-origin-shipping-2026-10-03.md` (append a dated section)
- Modify: `docs/superpowers/specs/2026-10-06-ubo-automatic-recovery-design.md` (status line)

- [ ] **Step 1: Policy sentence**

In both `CLAUDE.md` and `AGENTS.md`, replace `Runtime crashes or decision timeouts of an available uBO retain fail-closed recovery.` with:

```text
Runtime crashes or decision timeouts of an available uBO stay fail closed: Blanc restarts uBO automatically (at most three times per profile in 10 minutes, each episode bounded to 30 s, holding requests meanwhile), then offers manual recovery; no provider is substituted.
```

Verify the mirror: `diff <(grep -o 'Runtime crashes or decision timeouts[^.]*\.[^.]*\.' CLAUDE.md) <(grep -o 'Runtime crashes or decision timeouts[^.]*\.[^.]*\.' AGENTS.md)` prints nothing.

- [ ] **Step 2: Shipping record**

Append to `docs/ublock-origin-shipping-2026-10-03.md`:

```markdown
## Automatic recovery (2026-10-06)

An available uBO that fails after it has been ready now restarts automatically
instead of waiting for Settings → Retry. It stays fail closed: requests are
held, never sent unfiltered; Blanc Blocker is never substituted. At most three
restarts per profile in 10 minutes, each episode bounded to 30 s, then manual
recovery as before. Only main-frame GET loads the outage cancelled reload,
bound to their own token; POST is never replayed. Startup failures, private
tabs and security-posture failures are unchanged. Design:
`docs/superpowers/specs/2026-10-06-ubo-automatic-recovery-design.md`.
```

- [ ] **Step 3: Spec status**

Change the spec's status lines to `**Status:** approved 2026-10-06 (revision 3, after two reviews) — implemented in <PR link>`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md AGENTS.md docs/ublock-origin-shipping-2026-10-03.md docs/superpowers/specs/2026-10-06-ubo-automatic-recovery-design.md
git commit -m "Record automatic uBO recovery in the policy docs"
```

- [ ] **Step 5: CI evidence before merge**

Push and open the PR. The `Full uBlock Origin candidate` workflow must pass on all four `desktop (...)` jobs for the exact head SHA. Read `uBO automatic recovery ms:` from the `desktop (macos-15-intel)` log. If it is close to 30000 ms, stop and raise the episode deadline with the owner before merge (spec open point 1). Merge only when every check run on the head SHA has completed with success, skipped or neutral (`gh pr merge --squash --match-head-commit <sha>`).

---

## Self-review notes

- Spec coverage: §1 → Task 1; §2 state/failure/cancellation/hold/drain/deadline/after-ready/exhaustion/teardown → Tasks 2–4; §3 → Tasks 5–6; §4 → Task 7; §5 → Task 3 Step 4; invariants 1–9 → Tasks 2–5 tests and Task 8; testing section → Tasks 1–8; docs → Task 9; open points → Task 7 Step 5 and Task 9 Step 5.
- The spec's `recoveryReady` promise is realized by the hold queue: held requests wait in `holdForRecovery()` and are released by `pump()` at ready, or cancelled by `releaseHeld()` when the episode ends or the provider is disposed.
- Names used across tasks: `recoveryPolicy` (module alias), `RECOVERY_DEADLINE`, `OUTAGE_CLAIM`, `episode`, `recovering`, `everReady`, `holdQueue`, `inTransit`, `drainOutstanding`, `pump`, `releaseHeld`, `decideNow`, `noteOutage`, `claimOutage`, `noteMainFrameCommitted`, `markOutageRecovered`, `restartNetwork`, `restoreTools`, `exhaustRecoveryForTest`, `cancelInitialization`, `CANCELLED`.
