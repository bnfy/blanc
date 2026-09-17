# Sync Discoverability and Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sync findable (Settings placement, `/sync`, a one-time start-page card, site copy) and give the second-device path a preflight so a typo can no longer fork a silent empty account.

**Architecture:** Main keeps every network call and the only allowlist that turns a Settings section name into a URL fragment. The Settings off-state flow is a pure reducer in a flat page file whose transitions return one-shot effects. The start-page card is driven by a `syncNudge` boolean on the shared `startPageStatus()` object, guarded per tab at both send sites, and persisted through a device-local settings key registered with the schema guard.

**Tech Stack:** Electron main (`src/main`), flat `blanc://` renderer pages (`src/renderer/pages`), `node --test` unit tests, Cucumber + Playwright desktop acceptance, Astro site.

**Spec:** `docs/superpowers/specs/2026-09-17-sync-discoverability-design.md`

## Global Constraints

- The feature is called **Sync** everywhere user-facing. Descriptive copy: "Sync your favorites and settings across your devices, and, if you choose, open tabs. End-to-end encrypted." Retire "Profile Sync" and "Tab Sync" in user-facing copy only. Internal identifiers (`sync.js`, `pages:settings:sync-*`, `syncTabs`, release-note history) do not change.
- No protocol, Worker, pairing-code, tour-step, or Named-profile changes. Sync stays Personal-only.
- Confidentiality-only copy: "Blanc can't read it." Never claim durability or tamper-evidence.
- The join path never calls `enable` on a `notFound` result unless the person clicks **Start a new sync with these**.
- `syncNudgeDismissed` is device-local, never in `SYNCED_KEYS`, listed in `settings-schema/schema.json` `internalDefaults`.
- The settings-section allowlist lives in one main-owned function, `openSettingsSection(section)`. Renderer text is never interpolated into a privileged URL.
- CSS goes in `pages.css`, never inline styles.
- Slash-command copy has four copies guarded by `npm run copy:check`: `copy/slash-commands.json`, `src/renderer/overlay.js`, `src/renderer/pages/shortcuts.js`, `SLASH_COMMANDS` in `src/main/main.js`. Never hand-edit `copy/generated/`.
- Public copy may claim only shipped behaviour (sync since v0.12.0, tab sharing since v0.20.0). The new setup flow, `/sync`, and the card must not appear in public copy until the release carrying them is public (`docs/marketing-claims.md`).
- Run all commands from the repo root of the worktree. Unit tests: `npm run test:unit`. Substrate: `npm run substrate:check`. Acceptance dry run: `npm run test:acceptance:dry`.
- Commit after every task. When the commit is authored by a Claude agent, end the message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; a human or another agent uses their own attribution. The commit blocks below show the Claude form.

---

## File Structure

**Create**
- `src/main/sync-nudge.js` — pure policy: `shouldShowSyncNudge`, `syncNudgeForTab`.
- `src/renderer/pages/settings-sync-setup-model.js` — pure reducer for the Settings off-state flow (dual-environment, like `settings-verify-model.js`).
- `test/unit/sync-preflight.test.js`, `test/unit/settings-sync-setup-model.test.js`, `test/unit/settings-section-routing.test.js`, `test/unit/sync-nudge-settings.test.js`, `test/unit/sync-nudge.test.js`, `test/unit/sync-nudge-page.test.js`, `test/unit/sync-settings-card.test.js`.
- `test/desktop/steps/sync-nudge.steps.js`.

**Modify**
- `src/main/sync.js` — add `preflight()`.
- `src/main/pages.js` — `sync-preflight`, flag write in `sync-enable`, `start:open-settings`, `start:sync-nudge-dismiss`, `syncNudge` in `start:data`.
- `src/main/tab-preload.js` — `settings.syncPreflight`, `start.openSettings`, `start.dismissSyncNudge`.
- `src/main/main.js` — `openSettingsSection`, `tabs:open-page`, `startPageStatus.syncNudge`, send-site guards, `startPage` hooks, startup flag setter, `/sync` in `SLASH_COMMANDS`.
- `src/main/settings.js` — `syncNudgeDismissed` default, read validation, write cleaning.
- `settings-schema/schema.json` (+ `npm run settings:build` output), `spec/features.md` settings table.
- `copy/slash-commands.json` (+ `npm run copy:build` output), `src/renderer/overlay.js`, `src/renderer/pages/shortcuts.js`.
- `src/renderer/pages/settings.html`, `settings.js`, `pages.css` — Settings card, nav order, on-state list.
- `src/renderer/pages/newtab.html`, `newtab.js`, `pages.css` — start-page card.
- `src/main/test-hook.js`, `test/desktop/cucumber.mjs`, `spec/acceptance/sync.feature`, `spec/acceptance/index.md`.
- `site/src/pages/index.astro`, `site/src/pages/features/sync.astro`, `site/src/pages/features.astro`, `site/src/pages/features/profiles.astro`, `site/src/data/navigation.mjs`, `docs/press/fact-sheet.md`.

---

### Task 1: `sync.preflight()` and its IPC bridge

**Files:**
- Modify: `src/main/sync.js` (after `enable`, before `disable`; exports block at the end)
- Modify: `src/main/pages.js` (the sync handler block, around the `pages:settings:sync-enable` line)
- Modify: `src/main/tab-preload.js` (the `settings` api object, next to `syncEnable`)
- Test: `test/unit/sync-preflight.test.js`

**Interfaces:**
- Consumes: existing `deriveKeys(handle, passphrase) → { accountId, key }`, `passphraseStrong(p)`, `describe(err)`, `SyncError`, `SYNC_ENDPOINT`, `isDefaultLocalProfile`, `withLocalProfile`, `DEFAULT_PROFILE_ID`, `net.fetch`.
- Produces: `sync.preflight({ handle, passphrase }) → Promise<{ ok: true, outcome: 'found'|'notFound' } | { ok: false, outcome: 'invalid'|'offline'|'rateLimited'|'error', message: string }>`; IPC `pages:settings:sync-preflight`; bridge `window.bowserPages.settings.syncPreflight(payload)`.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/sync-preflight.test.js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// preflight() must read one blob and write nothing: no sync.json, no key
// protection, no enabled state — so the join path can catch a mistyped
// passphrase before enable() would fork a silent empty account.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-preflight-'));
let nextResponse = { status: 404, ok: false };
let fetchCalls = [];
let encryptCalls = 0;

const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    nativeImage: {},
    net: {
      fetch: async (url, options = {}) => {
        fetchCalls.push({ url, method: options.method ?? 'GET' });
        if (nextResponse instanceof Error) throw nextResponse;
        return nextResponse;
      },
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'test',
      encryptString: (value) => { encryptCalls += 1; return Buffer.from(value); },
      decryptString: () => Buffer.alloc(32, 7).toString('base64'),
    },
    app: { getPath: () => tmp, on: () => {} },
  },
};

// Wrap the real key derivation so the test can hold the buffer preflight()
// is given and prove it is zero-filled on every outcome.
const cryptoId = require.resolve('../../src/main/sync-crypto');
const realCrypto = require(cryptoId);
let lastKey = null;
require.cache[cryptoId].exports = {
  ...realCrypto,
  deriveKeys: (handle, passphrase) => {
    const derived = realCrypto.deriveKeys(handle, passphrase);
    lastKey = derived.key;
    return derived;
  },
};

const sync = require('../../src/main/sync');
const creds = { handle: 'preflight-test', passphrase: 'a passphrase long enough to pass' };
const isZeroed = (buf) => Buffer.isBuffer(buf) && buf.length === 32 && buf.every((b) => b === 0);

test.beforeEach(() => { fetchCalls = []; encryptCalls = 0; });

test('found: a 200 on the settings blob', async () => {
  nextResponse = { status: 200, ok: true, json: async () => ({}) };
  assert.deepEqual(await sync.preflight(creds), { ok: true, outcome: 'found' });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].method, 'GET');
  assert.match(fetchCalls[0].url, /\/v1\/blob\/[0-9a-f]+\/settings$/);
});

test('notFound: a 404 on the settings blob', async () => {
  nextResponse = { status: 404, ok: false };
  assert.deepEqual(await sync.preflight(creds), { ok: true, outcome: 'notFound' });
});

test('rateLimited, error, and offline map to distinct outcomes with messages', async () => {
  nextResponse = { status: 429, ok: false };
  let res = await sync.preflight(creds);
  assert.equal(res.ok, false); assert.equal(res.outcome, 'rateLimited'); assert.ok(res.message);

  nextResponse = { status: 500, ok: false };
  res = await sync.preflight(creds);
  assert.equal(res.ok, false); assert.equal(res.outcome, 'error'); assert.ok(res.message);

  nextResponse = new Error('ENOTFOUND');
  res = await sync.preflight(creds);
  assert.equal(res.ok, false); assert.equal(res.outcome, 'offline'); assert.ok(res.message);
});

test('invalid inputs never reach the network', async () => {
  nextResponse = { status: 200, ok: true };
  let res = await sync.preflight({ handle: 'a', passphrase: creds.passphrase });
  assert.equal(res.outcome, 'invalid');
  res = await sync.preflight({ handle: 'fine', passphrase: 'short' });
  assert.equal(res.outcome, 'invalid');
  assert.equal(fetchCalls.length, 0);
});

test('preflight zero-fills the derived key on every outcome', async () => {
  for (const response of [
    { status: 200, ok: true, json: async () => ({}) },
    { status: 404, ok: false },
    { status: 429, ok: false },
    { status: 500, ok: false },
    new Error('offline'),
  ]) {
    nextResponse = response;
    lastKey = null;
    await sync.preflight(creds);
    assert.ok(lastKey, 'deriveKeys ran');
    assert.ok(isZeroed(lastKey), `key must be zeroed after ${response.status ?? 'thrown network error'}`);
  }
});

test('preflight writes nothing on any outcome', async () => {
  for (const response of [
    { status: 200, ok: true, json: async () => ({}) },
    { status: 404, ok: false },
    { status: 429, ok: false },
    new Error('offline'),
  ]) {
    nextResponse = response;
    await sync.preflight(creds);
  }
  assert.equal(sync.status().enabled, false);
  assert.equal(sync.status().handle, '');
  assert.equal(encryptCalls, 0, 'protectSyncKey must not run');
  // status() above may itself create the store file with defaults, so check
  // the contents rather than the file's absence: nothing enabled, no handle,
  // no protected key.
  const file = path.join(tmp, 'sync.json');
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(data.enabled, false);
    assert.equal(data.handle, '');
    assert.equal(data.protectedKey, '');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/sync-preflight.test.js`
Expected: FAIL with `sync.preflight is not a function`.

- [ ] **Step 3: Implement `preflight` in `sync.js`**

Insert directly after the closing brace of `async function enable(...)`:

```js
// Join-path probe (design 2026-09-17 §4.3): does data already exist under
// these credentials? Reads ONE blob and writes nothing — no store update, no
// protectSyncKey, no syncNow, no syncGen bump — so a mistyped passphrase is
// caught before enable() would fork a silent empty account. The derived key
// is cleared in `finally` so every return and throw path zero-fills it.
async function preflight({ handle, passphrase }) {
  if (!isDefaultLocalProfile()) {
    return withLocalProfile(DEFAULT_PROFILE_ID, () => preflight({ handle, passphrase }));
  }
  const h = String(handle ?? '').trim();
  const p = String(passphrase ?? '');
  if (h.length < 2) {
    return { ok: false, outcome: 'invalid', message: 'Choose a sync name (at least 2 characters).' };
  }
  if (!passphraseStrong(p)) {
    return { ok: false, outcome: 'invalid', message: 'Use a longer passphrase — 16+ characters, or 10+ with mixed characters.' };
  }
  const { accountId, key } = deriveKeys(h, p);
  try {
    const res = await net.fetch(`${SYNC_ENDPOINT}/v1/blob/${accountId}/settings`);
    if (res.status === 200) return { ok: true, outcome: 'found' };
    if (res.status === 404) return { ok: true, outcome: 'notFound' };
    if (res.status === 429) {
      return { ok: false, outcome: 'rateLimited', message: describe(new SyncError('rate-limited')) };
    }
    return { ok: false, outcome: 'error', message: describe(new SyncError(`http-${res.status}`)) };
  } catch {
    return { ok: false, outcome: 'offline', message: describe(new Error('offline')) };
  } finally {
    key.fill(0);
  }
}
```

Add `preflight,` to `module.exports` directly after `enable,`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/sync-preflight.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the IPC handler and bridge**

In `src/main/pages.js`, directly after the `pages:settings:sync-enable` line, add:

```js
  // Join-path probe: outcome-only reply, nothing persisted (see sync.preflight).
  handle('pages:settings:sync-preflight', 'settings', (payload) => sync.preflight(payload ?? {}));
```

In `src/main/tab-preload.js`, in the `settings` api object directly after `syncEnable`, add:

```js
        syncPreflight: (payload) => invoke('pages:settings:sync-preflight', payload),
```

- [ ] **Step 6: Guard the bridge with a source test**

Append to `test/unit/sync-preflight.test.js`:

```js
test('the settings page can reach preflight only through the guarded channel', () => {
  const pages = fs.readFileSync(path.join(__dirname, '../../src/main/pages.js'), 'utf8');
  const preload = fs.readFileSync(path.join(__dirname, '../../src/main/tab-preload.js'), 'utf8');
  assert.match(pages, /handle\('pages:settings:sync-preflight', 'settings', \(payload\) => sync\.preflight\(payload \?\? \{\}\)\)/);
  assert.match(preload, /syncPreflight: \(payload\) => invoke\('pages:settings:sync-preflight', payload\)/);
});
```

Run: `node --test test/unit/sync-preflight.test.js` → PASS, 7 tests. Then `npm run test:unit` → all pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/sync.js src/main/pages.js src/main/tab-preload.js test/unit/sync-preflight.test.js
git commit -m "feat(sync): preflight probe for the join path

Reads one blob under the derived account id and writes nothing, so a
mistyped passphrase can be caught before enable() would fork a new
empty account.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Settings sync setup reducer

**Files:**
- Create: `src/renderer/pages/settings-sync-setup-model.js`
- Test: `test/unit/settings-sync-setup-model.test.js`

**Interfaces:**
- Produces (global `blancSyncSetupModel` in the page, `module.exports` in node):
  - `createSyncSetupModel() → state` where `state = { path: null|'start'|'join', phase: 'idle'|'pending'|'notFound'|'enabling', handle: string, passphrase: string, token: number, notice: null|{ kind: string, message: string } }`
  - `transition(state, event) → { state, effect }` with `effect` one of `null`, `{ type: 'preflight', token, handle, passphrase }`, `{ type: 'enable', token, path, handle, passphrase }`. Every effect carries the token that its reply must echo; the enable effect also carries the path so reply copy never reads live state.
  - Events: `{ type: 'choose', path }`, `{ type: 'back' }`, `{ type: 'input', handle, passphrase }`, `{ type: 'submit' }`, `{ type: 'preflight-reply', token, outcome, message }`, `{ type: 'start-new' }`, `{ type: 'enable-reply', token, ok, message }`.
  - `view(state) → { pathChosen, path, fieldsVisible, handleHint, passphraseHint, submitLabel, submitDisabled, showNotFound, noticeText }` — pure, no effect.
  - `passphraseStrong(p)` mirror of main's rule (main stays the authority).

- [ ] **Step 1: Write the failing test**

```js
// test/unit/settings-sync-setup-model.test.js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createSyncSetupModel, transition, view,
} = require('../../src/renderer/pages/settings-sync-setup-model');

const good = { handle: 'my sync', passphrase: 'a passphrase long enough to pass' };

function ready(path) {
  let { state } = transition(createSyncSetupModel(), { type: 'choose', path });
  ({ state } = transition(state, { type: 'input', ...good }));
  return state;
}

test('start path submit returns a single tokenized enable effect', () => {
  const { state, effect } = transition(ready('start'), { type: 'submit' });
  assert.deepEqual(effect, { type: 'enable', token: state.token, path: 'start', ...good });
  assert.equal(state.phase, 'enabling');
});

test('join path submit returns a preflight effect and moves to pending', () => {
  const { state, effect } = transition(ready('join'), { type: 'submit' });
  assert.equal(effect.type, 'preflight');
  assert.equal(effect.token, state.token);
  assert.equal(state.phase, 'pending');
});

test('a token-matching found reply is the only reply that enables', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const { state, effect } = transition(pending, { type: 'preflight-reply', token: pending.token, outcome: 'found' });
  assert.deepEqual(effect, { type: 'enable', token: state.token, path: 'join', ...good });
  assert.equal(state.phase, 'enabling');
});

test('every non-found reply returns no effect', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const cases = [
    { outcome: 'notFound' },
    { outcome: 'offline', message: 'x' },
    { outcome: 'rateLimited', message: 'x' },
    { outcome: 'error', message: 'HTTP 500' },
    { outcome: 'invalid', message: 'too short' },
  ];
  for (const c of cases) {
    const { state, effect } = transition(pending, { type: 'preflight-reply', token: pending.token, ...c });
    assert.equal(effect, null, `${c.outcome} must not produce an effect`);
    assert.equal(state.phase, c.outcome === 'notFound' ? 'notFound' : 'idle');
  }
});

test('a stale-token reply changes nothing', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const { state, effect } = transition(pending, { type: 'preflight-reply', token: pending.token - 1, outcome: 'found' });
  assert.equal(effect, null);
  assert.equal(state, pending);
});

test('start-new after notFound enables; start-new elsewhere is inert', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const notFound = transition(pending, { type: 'preflight-reply', token: pending.token, outcome: 'notFound' }).state;
  const startNew = transition(notFound, { type: 'start-new' });
  assert.deepEqual(startNew.effect, { type: 'enable', token: startNew.state.token, path: 'join', ...good });
  assert.equal(transition(ready('join'), { type: 'start-new' }).effect, null);
  assert.equal(transition(ready('start'), { type: 'start-new' }).effect, null);
});

test('submit while pending or enabling returns no effect', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  assert.equal(transition(pending, { type: 'submit' }).effect, null);
  const enabling = transition(ready('start'), { type: 'submit' }).state;
  assert.equal(transition(enabling, { type: 'submit' }).effect, null);
});

test('input while pending invalidates the in-flight reply', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const edited = transition(pending, { type: 'input', ...good, handle: 'other' }).state;
  assert.equal(edited.phase, 'idle');
  assert.equal(transition(edited, { type: 'preflight-reply', token: pending.token, outcome: 'found' }).effect, null);
});

test('weak inputs disable submit and never produce an effect', () => {
  let { state } = transition(createSyncSetupModel(), { type: 'choose', path: 'start' });
  ({ state } = transition(state, { type: 'input', handle: 'a', passphrase: 'short' }));
  assert.equal(view(state).submitDisabled, true);
  assert.equal(transition(state, { type: 'submit' }).effect, null);
});

test('view is pure presentation and carries no effect', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const a = view(pending); const b = view(pending);
  assert.deepEqual(a, b);
  assert.equal('effect' in a, false);
  assert.equal(a.submitLabel, 'Connect');
  assert.equal(view(ready('start')).submitLabel, 'Turn on sync');
  assert.equal(view(createSyncSetupModel()).pathChosen, false);
});

test('notice copy per outcome', () => {
  const pending = transition(ready('join'), { type: 'submit' }).state;
  const offline = transition(pending, { type: 'preflight-reply', token: pending.token, outcome: 'offline' }).state;
  assert.equal(view(offline).noticeText, 'Couldn’t reach the sync server. Check your connection and try again.');
  const limited = transition(pending, { type: 'preflight-reply', token: pending.token, outcome: 'rateLimited' }).state;
  assert.equal(view(limited).noticeText, 'Too many attempts. Wait a minute and try again.');
  const err = transition(pending, { type: 'preflight-reply', token: pending.token, outcome: 'error', message: 'HTTP 500' }).state;
  assert.equal(view(err).noticeText, 'HTTP 500');
  const notFound = transition(pending, { type: 'preflight-reply', token: pending.token, outcome: 'notFound' }).state;
  assert.equal(view(notFound).showNotFound, true);
});

test('enable-reply returns to idle, clears the passphrase, keeps a failure message', () => {
  const enabling = transition(ready('start'), { type: 'submit' }).state;
  const failed = transition(enabling, { type: 'enable-reply', token: enabling.token, ok: false, message: 'Could not protect the sync key.' }).state;
  assert.equal(failed.phase, 'idle');
  assert.equal(failed.passphrase, '');
  assert.equal(view(failed).noticeText, 'Could not protect the sync key.');
  const okState = transition(enabling, { type: 'enable-reply', token: enabling.token, ok: true }).state;
  assert.equal(okState.notice, null);
});

test('a stale enable reply changes nothing after the flow moved on', () => {
  const submitted = transition(ready('start'), { type: 'submit' });
  const oldToken = submitted.effect.token;
  // Back, a path change, or an edit during enabling all move the token on.
  const backed = transition(submitted.state, { type: 'back' }).state;
  assert.notEqual(backed.token, oldToken);
  const stale = transition(backed, { type: 'enable-reply', token: oldToken, ok: false, message: 'late failure' });
  assert.equal(stale.effect, null);
  assert.equal(stale.state, backed, 'a stale reply must not touch the newer flow');
  const edited = transition(submitted.state, { type: 'input', ...good, handle: 'renamed' }).state;
  assert.equal(edited.phase, 'idle');
  assert.equal(transition(edited, { type: 'enable-reply', token: oldToken, ok: true }).state, edited);
  const rechosen = transition(submitted.state, { type: 'choose', path: 'join' }).state;
  assert.equal(transition(rechosen, { type: 'enable-reply', token: oldToken, ok: true }).state, rechosen);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/settings-sync-setup-model.test.js`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the reducer**

```js
// src/renderer/pages/settings-sync-setup-model.js
'use strict';
// The Settings → Sync off-state flow as a pure reducer (design 2026-09-17
// §4.2). Served flat to settings.html via a <script> tag AND require-able by
// node tests — the same dual-environment pattern as settings-verify-model.js.
//
// Network calls are ONE-SHOT EFFECTS returned by transition(), never derived
// from state: settings.js performs the returned effect exactly once and
// discards it. view() is pure presentation and carries no effect, so a
// re-render can never repeat a network mutation. An `enable` effect comes
// from exactly three transitions: start-path submit, a token-matching
// `found` preflight reply on the join path, and `start-new` after `notFound`.
// Every effect carries a token; back/choose/input while pending or enabling
// move the token on, so a reply from an abandoned attempt is dropped and the
// enable effect's own `path` (never live state) decides the result copy.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancSyncSetupModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const trimmed = (value) => String(value ?? '').trim();

  // Mirror of main's rule so the button can disable before submit. Main
  // remains the authority and re-validates on every call.
  function passphraseStrong(p) {
    if (p.length >= 16) return true;
    if (p.length < 10) return false;
    return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(p)).length >= 2;
  }

  function createSyncSetupModel() {
    return { path: null, phase: 'idle', handle: '', passphrase: '', token: 0, notice: null };
  }

  const valid = (s) => trimmed(s.handle).length >= 2 && passphraseStrong(String(s.passphrase ?? ''));
  const creds = (s) => ({ handle: trimmed(s.handle), passphrase: String(s.passphrase ?? '') });
  const none = (state) => ({ state, effect: null });
  const busy = (s) => s.phase === 'pending' || s.phase === 'enabling';
  // Any move away from an in-flight attempt strands its reply.
  const nextToken = (s) => (busy(s) ? s.token + 1 : s.token);
  const enableEffect = (state) => ({
    state: { ...state, phase: 'enabling', notice: null },
    effect: { type: 'enable', token: state.token, path: state.path, ...creds(state) },
  });

  function transition(state, event) {
    switch (event.type) {
      case 'choose':
        if (event.path !== 'start' && event.path !== 'join') return none(state);
        return none({ ...state, path: event.path, phase: 'idle', notice: null, token: nextToken(state) });
      case 'back':
        return none({ ...state, path: null, phase: 'idle', notice: null, passphrase: '', token: nextToken(state) });
      case 'input':
        return none({
          ...state,
          handle: String(event.handle ?? ''),
          passphrase: String(event.passphrase ?? ''),
          token: nextToken(state),
          phase: 'idle',
          notice: null,
        });
      case 'submit': {
        if (!state.path || busy(state) || !valid(state)) return none(state);
        const token = state.token + 1;
        if (state.path === 'start') return enableEffect({ ...state, token });
        return { state: { ...state, token, phase: 'pending', notice: null }, effect: { type: 'preflight', token, ...creds(state) } };
      }
      case 'preflight-reply': {
        if (state.phase !== 'pending' || event.token !== state.token) return none(state);
        if (event.outcome === 'found') return enableEffect(state);
        if (event.outcome === 'notFound') return none({ ...state, phase: 'notFound', notice: null });
        return none({ ...state, phase: 'idle', notice: { kind: String(event.outcome ?? 'error'), message: String(event.message ?? '') } });
      }
      case 'start-new':
        if (state.phase !== 'notFound') return none(state);
        return enableEffect({ ...state, token: state.token + 1 });
      case 'enable-reply':
        if (state.phase !== 'enabling' || event.token !== state.token) return none(state);
        return none({
          ...state,
          phase: 'idle',
          passphrase: '',
          notice: event.ok ? null : { kind: 'error', message: String(event.message ?? '') },
        });
      default:
        return none(state);
    }
  }

  const NOTICES = {
    offline: 'Couldn’t reach the sync server. Check your connection and try again.',
    rateLimited: 'Too many attempts. Wait a minute and try again.',
  };

  function view(state) {
    const join = state.path === 'join';
    return {
      pathChosen: !!state.path,
      path: state.path,
      fieldsVisible: !!state.path,
      handleHint: join
        ? 'Enter the exact sync name you used on your other device.'
        : 'A label for your sync, like a username. You’ll type it again on your other devices.',
      passphraseHint: join
        ? 'Enter the exact passphrase. Case matters.'
        : '16+ characters, or 10+ mixing letters, numbers and symbols. Blanc can’t recover it if you forget it.',
      submitLabel: join ? 'Connect' : 'Turn on sync',
      submitDisabled: busy(state) || !valid(state),
      showNotFound: state.phase === 'notFound',
      noticeText: state.notice ? (NOTICES[state.notice.kind] ?? state.notice.message) : '',
    };
  }

  return { createSyncSetupModel, transition, view, passphraseStrong };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/settings-sync-setup-model.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/settings-sync-setup-model.js test/unit/settings-sync-setup-model.test.js
git commit -m "feat(settings): pure reducer for the sync setup flow

Transitions return one-shot preflight/enable effects; view() carries
none. Only start-path submit, a token-matching found reply, or an
explicit start-new after notFound can enable.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Settings card — nav order, two paths, on-state list

**Files:**
- Modify: `src/renderer/pages/settings.html` (nav links ~line 22-28; the `#group-sync` section ~line 302-331; the `<script>` tags at the end)
- Modify: `src/renderer/pages/settings.js` (the `// --- Sync ---` block ~line 708-780; the two scroll-spy comments ~line 837 and ~856)
- Modify: `src/renderer/pages/pages.css` (append)
- Test: `test/unit/sync-settings-card.test.js`

**Interfaces:**
- Consumes: `blancSyncSetupModel` from Task 2, `window.bowserPages.settings.syncPreflight` from Task 1, existing `syncGet`, `syncEnable`, `syncNow`, `syncDisable`, `syncTabsSet`.
- Produces: element ids `syncPathStart`, `syncPathJoin`, `syncForm`, `syncHandle`, `syncPassphrase`, `syncHandleHint`, `syncPassphraseHint`, `syncSubmit`, `syncBack`, `syncNotFound`, `syncTryAgain`, `syncStartNew`, `syncSetupStatus`, `syncStatusHandle`, `syncStatusData`, `syncStatusTabs`, `syncStatusErrorRow`, `syncStatusError`.

- [ ] **Step 1: Write the failing source test**

```js
// test/unit/sync-settings-card.test.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('Sync is the second Settings group in nav and content order', () => {
  const html = read('src/renderer/pages/settings.html');
  const navOrder = [...html.matchAll(/data-group="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(navOrder.slice(0, 2), ['general', 'sync']);
  const sectionOrder = [...html.matchAll(/<section class="settings-group" id="group-([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sectionOrder.slice(0, 2), ['general', 'sync']);
});

test('the off state offers two explicit paths and a not-found choice', () => {
  const html = read('src/renderer/pages/settings.html');
  assert.match(html, /<button id="syncPathStart" type="button">Start syncing from this device<\/button>/);
  assert.match(html, /<button id="syncPathJoin" type="button" class="quiet">I already sync on another device<\/button>/);
  assert.match(html, /<button id="syncTryAgain" type="button">Try again<\/button>/);
  assert.match(html, /<button id="syncStartNew" type="button" class="quiet">Start a new sync with these<\/button>/);
  assert.match(html, /Nothing was found under that name and passphrase\. Check for typos, including capital letters, then try again\./);
  assert.match(html, /Sync your favorites and settings across your devices, and, if you choose, open tabs\. End-to-end encrypted\./);
  assert.match(html, /Blanc can’t read it/);
  assert.doesNotMatch(html, /can recover|tamper|never lose/i);
});

test('the on state lists categories and keeps the error in one conditional row', () => {
  const html = read('src/renderer/pages/settings.html');
  assert.match(html, /<dt>Sync name<\/dt><dd id="syncStatusHandle">/);
  assert.match(html, /<dt>Favorites and settings<\/dt><dd id="syncStatusData">/);
  assert.match(html, /<dt>This device’s open tabs<\/dt><dd id="syncStatusTabs">/);
  assert.match(html, /<div id="syncStatusErrorRow" hidden><dt>Last error<\/dt><dd id="syncStatusError">/);
  const js = read('src/renderer/pages/settings.js');
  assert.match(js, /syncStatusData\.textContent = status\.lastSyncedAt \? `Last synced \$\{when\(status\.lastSyncedAt\)\}` : 'Not synced yet'/);
  assert.match(js, /syncStatusErrorRow\.hidden = !status\.lastError/);
});

test('settings.js drives the flow through the reducer and performs effects once', () => {
  const html = read('src/renderer/pages/settings.html');
  assert.match(html, /<script src="settings-sync-setup-model\.js"><\/script>\s*<script src="settings\.js"><\/script>/);
  const js = read('src/renderer/pages/settings.js');
  assert.match(js, /const \{ createSyncSetupModel, transition, view \} = window\.blancSyncSetupModel/);
  assert.match(js, /function dispatch\(event\) \{[\s\S]*?const \{ state: next, effect \} = transition\(model, event\)/);
  assert.match(js, /if \(effect\?\.type === 'preflight'\)/);
  assert.match(js, /if \(effect\?\.type === 'enable'\)/);
  assert.match(js, /effect\.path === 'join'/, 'result copy derives from the effect, not live state');
  assert.doesNotMatch(js, /model\.path === 'join'/);
  assert.match(js, /type: 'enable-reply', token: effect\.token/);
  // enable is only ever reached through a dispatched effect.
  assert.equal((js.match(/settings\.syncEnable\(/g) ?? []).length, 1);
  assert.doesNotMatch(js, /Profile Sync/);
});

test('user-facing settings copy no longer says Profile Sync', () => {
  assert.doesNotMatch(read('src/renderer/pages/settings.html'), /Profile Sync/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/sync-settings-card.test.js`
Expected: FAIL on nav order (sync is fourth) and on the missing ids.

- [ ] **Step 3: Move Sync to second in the nav and content**

In `settings.html`, change the nav to:

```html
        <a href="#group-general" data-group="general">General</a>
        <a href="#group-sync" data-group="sync">Sync</a>
        <a href="#group-profiles" data-group="profiles">Profiles</a>
        <a href="#group-privacy" data-group="privacy">Privacy &amp; Security</a>
        <a href="#group-diagnostics" data-group="diagnostics">Diagnostics</a>
        <a href="#group-patron" data-group="patron">Patron</a>
        <a href="#group-help" data-group="help">Help</a>
```

Cut the entire `<section class="settings-group" id="group-sync">…</section>` block and paste it immediately before `<section class="settings-group" id="group-profiles">`.

In the Profiles group's hint (currently "…Profile Sync belongs to Personal only."), change the sentence to "Sync belongs to Personal only."

- [ ] **Step 4: Replace the Sync section markup**

Replace the moved `#group-sync` section's contents with:

```html
        <section class="settings-group" id="group-sync">
          <h2 class="group-title">Sync</h2>
          <div class="settings-card">
            <p class="section-hint">
              Sync your favorites and settings across your devices, and, if you choose, open tabs.
              End-to-end encrypted. Blanc encrypts everything on this device with your passphrase
              and stores only unreadable data — Blanc can’t read it, and can’t recover it if you
              forget your passphrase.
            </p>
            <div id="syncSetup">
              <div id="syncPaths" class="toolbar-row">
                <button id="syncPathStart" type="button">Start syncing from this device</button>
                <button id="syncPathJoin" type="button" class="quiet">I already sync on another device</button>
              </div>
              <form id="syncForm" class="sync-form" hidden>
                <label class="sync-field">
                  <span>Sync name</span>
                  <input id="syncHandle" type="text" autocomplete="off" spellcheck="false" maxlength="64" />
                  <span class="hint" id="syncHandleHint"></span>
                </label>
                <label class="sync-field">
                  <span>Passphrase</span>
                  <input id="syncPassphrase" type="password" autocomplete="off" />
                  <span class="hint" id="syncPassphraseHint"></span>
                </label>
                <div class="toolbar-row" id="syncSubmitRow">
                  <button id="syncSubmit" type="submit">Turn on sync</button>
                  <button id="syncBack" type="button" class="quiet">Back</button>
                </div>
                <div id="syncNotFound" hidden>
                  <p class="section-hint">Nothing was found under that name and passphrase. Check for typos, including capital letters, then try again.</p>
                  <div class="toolbar-row">
                    <button id="syncTryAgain" type="button">Try again</button>
                    <button id="syncStartNew" type="button" class="quiet">Start a new sync with these</button>
                  </div>
                </div>
              </form>
              <p class="section-hint" id="syncSetupStatus" role="status"></p>
            </div>
            <div id="syncActive" hidden>
              <dl class="sync-status-list">
                <div><dt>Sync name</dt><dd id="syncStatusHandle"></dd></div>
                <div><dt>Favorites and settings</dt><dd id="syncStatusData"></dd></div>
                <div><dt>This device’s open tabs</dt><dd id="syncStatusTabs"></dd></div>
                <div id="syncStatusErrorRow" hidden><dt>Last error</dt><dd id="syncStatusError"></dd></div>
              </dl>
              <p class="section-hint" id="syncActiveStatus" role="status"></p>
              <div class="toolbar-row">
                <button id="syncNow">Sync now</button>
                <button id="syncDisable" class="danger">Turn off sync</button>
                <label class="inline-check"><input id="syncWipe" type="checkbox" /> also delete synced data</label>
              </div>
              <div class="toolbar-row">
                <label class="inline-check"><input id="syncTabsShare" type="checkbox" /> share this device’s open tabs with your other devices</label>
              </div>
            </div>
          </div>
        </section>
```

At the end of `settings.html`, change the script tags to:

```html
  <script src="sheet.js"></script>
  <script src="settings-verify-model.js"></script>
  <script src="settings-sync-setup-model.js"></script>
  <script src="settings.js"></script>
```

- [ ] **Step 5: Add the CSS**

Append to `src/renderer/pages/pages.css`:

```css
/* Settings → Sync: two-path setup + on-state category list (2026-09-17). */
.sync-form { margin-top: 14px; }
.sync-field { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; max-width: 420px; }
.sync-field > span:first-child { font-size: 13px; }
.sync-field .hint { color: var(--text-dim); font-size: 12px; line-height: 1.45; }
.sync-field > input { width: 100%; min-width: 0; }
#syncSubmitRow, #syncNotFound { margin-top: 14px; }
#syncPaths button.quiet,
.sync-form button.quiet { background: transparent; border-color: transparent; color: var(--text-dim); }
#syncPaths button.quiet:hover,
.sync-form button.quiet:hover { color: var(--accent); }
.sync-status-list { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; margin: 0 0 12px; font-size: 13px; }
.sync-status-list > div { display: contents; }
.sync-status-list dt { color: var(--text-dim); }
.sync-status-list dd { margin: 0; }
```

- [ ] **Step 6: Rewrite the `// --- Sync ---` block in `settings.js`**

Replace everything from `// --- Sync ---` through the `} else { document.getElementById('group-sync')?.remove(); }` with:

```js
  // --- Sync ---
  if (supports('sync')) {
    (function initSync() {
      const { createSyncSetupModel, transition, view } = window.blancSyncSetupModel;
      const setup = document.getElementById('syncSetup');
      const active = document.getElementById('syncActive');
      const paths = document.getElementById('syncPaths');
      const pathStart = document.getElementById('syncPathStart');
      const pathJoin = document.getElementById('syncPathJoin');
      const form = document.getElementById('syncForm');
      const handleEl = document.getElementById('syncHandle');
      const passEl = document.getElementById('syncPassphrase');
      const handleHint = document.getElementById('syncHandleHint');
      const passHint = document.getElementById('syncPassphraseHint');
      const submitBtn = document.getElementById('syncSubmit');
      const backBtn = document.getElementById('syncBack');
      const submitRow = document.getElementById('syncSubmitRow');
      const notFound = document.getElementById('syncNotFound');
      const tryAgainBtn = document.getElementById('syncTryAgain');
      const startNewBtn = document.getElementById('syncStartNew');
      const setupStatus = document.getElementById('syncSetupStatus');
      const activeStatus = document.getElementById('syncActiveStatus');
      const syncStatusHandle = document.getElementById('syncStatusHandle');
      const syncStatusData = document.getElementById('syncStatusData');
      const syncStatusTabs = document.getElementById('syncStatusTabs');
      const syncStatusErrorRow = document.getElementById('syncStatusErrorRow');
      const syncStatusError = document.getElementById('syncStatusError');
      const nowBtn = document.getElementById('syncNow');
      const disableBtn = document.getElementById('syncDisable');
      const wipeEl = document.getElementById('syncWipe');
      const tabsShareEl = document.getElementById('syncTabsShare');

      const when = (ts) => (ts ? new Date(ts).toLocaleString() : 'never');

      // On-state: one row per category; the error lives ONLY in its own row.
      function renderStatus(status, note) {
        const on = !!status.enabled;
        setup.hidden = on;
        active.hidden = !on;
        tabsShareEl.checked = !!status.syncTabs;
        if (on) {
          syncStatusHandle.textContent = status.handle;
          syncStatusData.textContent = status.lastSyncedAt ? `Last synced ${when(status.lastSyncedAt)}` : 'Not synced yet';
          syncStatusTabs.textContent = status.syncTabs ? 'Sharing' : 'Not shared';
          syncStatusErrorRow.hidden = !status.lastError;
          syncStatusError.textContent = status.lastError || '';
          activeStatus.textContent = note || '';
        }
      }

      // Off-state: the reducer owns the flow; this code only mirrors view()
      // to the DOM and performs each returned effect exactly once.
      let model = createSyncSetupModel();
      function renderSetup() {
        const v = view(model);
        paths.hidden = v.pathChosen;
        form.hidden = !v.fieldsVisible;
        handleHint.textContent = v.handleHint;
        passHint.textContent = v.passphraseHint;
        submitBtn.textContent = v.submitLabel;
        submitBtn.disabled = v.submitDisabled;
        submitRow.hidden = v.showNotFound;
        notFound.hidden = !v.showNotFound;
        setupStatus.textContent = v.noticeText;
        if (handleEl.value !== model.handle) handleEl.value = model.handle;
        if (passEl.value !== model.passphrase) passEl.value = model.passphrase;
      }

      async function performEnable(effect) {
        setupStatus.textContent = 'Turning on sync…';
        const res = await window.bowserPages.settings.syncEnable({ handle: effect.handle, passphrase: effect.passphrase });
        const name = effect.handle;
        // Copy comes from the EFFECT's path, never from live model state: the
        // person may have pressed Back or switched paths while this awaited.
        // created === false: enable()'s own probe found data — say so.
        // created === null: probe offline — plain copy.
        const note = res.ok
          ? (res.created === false
            ? (effect.path === 'join' ? `Connected to “${name}”. Pulling your favorites and settings now.` : `Joined your existing sync as “${name}”.`)
            : 'Sync is on. Your favorites and settings will sync as you change them.')
          : res.message;
        // Only a reply for the attempt still in flight may speak; the status
        // itself is always real (sync may be on now) and is always rendered.
        const current = model.phase === 'enabling' && model.token === effect.token;
        dispatch({ type: 'enable-reply', token: effect.token, ok: res.ok, message: res.message });
        renderStatus(res.status, current ? note : null);
      }

      async function performPreflight(effect) {
        setupStatus.textContent = 'Checking…';
        let reply;
        try {
          reply = await window.bowserPages.settings.syncPreflight({ handle: effect.handle, passphrase: effect.passphrase });
        } catch {
          reply = { ok: false, outcome: 'error', message: 'Could not check sync. Try again.' };
        }
        dispatch({ type: 'preflight-reply', token: effect.token, outcome: reply.outcome, message: reply.message });
      }

      function dispatch(event) {
        const { state: next, effect } = transition(model, event);
        model = next;
        renderSetup();
        if (effect?.type === 'preflight') performPreflight(effect);
        if (effect?.type === 'enable') performEnable(effect);
      }

      pathStart.addEventListener('click', () => { dispatch({ type: 'choose', path: 'start' }); handleEl.focus(); });
      pathJoin.addEventListener('click', () => { dispatch({ type: 'choose', path: 'join' }); handleEl.focus(); });
      backBtn.addEventListener('click', () => dispatch({ type: 'back' }));
      const onInput = () => dispatch({ type: 'input', handle: handleEl.value, passphrase: passEl.value });
      handleEl.addEventListener('input', onInput);
      passEl.addEventListener('input', onInput);
      form.addEventListener('submit', (e) => { e.preventDefault(); dispatch({ type: 'submit' }); });
      tryAgainBtn.addEventListener('click', () => { dispatch({ type: 'input', handle: handleEl.value, passphrase: passEl.value }); passEl.focus(); });
      startNewBtn.addEventListener('click', () => dispatch({ type: 'start-new' }));

      window.bowserPages.settings.syncGet().then((status) => { renderStatus(status); renderSetup(); }).catch(() => {});

      nowBtn.addEventListener('click', async () => {
        nowBtn.disabled = true;
        activeStatus.textContent = 'Syncing…';
        renderStatus(await window.bowserPages.settings.syncNow());
        nowBtn.disabled = false;
      });

      disableBtn.addEventListener('click', async () => {
        const res = await window.bowserPages.settings.syncDisable({ wipeRemote: wipeEl.checked });
        // A failed remote wipe keeps sync ON (the accountId is the only handle
        // on the server copy) — leave the checkbox set for the retry and say why.
        wipeEl.checked = res.ok ? false : wipeEl.checked;
        model = createSyncSetupModel();
        renderStatus(res.status, res.ok ? null : res.message);
        renderSetup();
      });

      tabsShareEl.addEventListener('change', async () => {
        renderStatus(await window.bowserPages.settings.syncTabsSet(tabsShareEl.checked));
      });
    })();
  } else {
    document.getElementById('group-sync')?.remove();
  }
```

- [ ] **Step 7: Update the two scroll-spy comments**

The Sync section is no longer a short trailing section. Change the comment that reads "Privacy & Security's card is taller than Sync + Patron combined" to "Privacy & Security's card is taller than the short trailing sections combined", and the comment "clicking a short trailing section (Sync)" to "clicking a short trailing section (Help)". No code change is needed: the scorer is generic.

- [ ] **Step 8: Run the tests**

Run: `node --test test/unit/sync-settings-card.test.js` → PASS, 5 tests. Run: `npm run test:unit` → all pass.

- [ ] **Step 9: Verify in the app**

Run `npm start` (dev). Open Settings via ⌘,. Check: Sync is second in the nav; two path buttons; choosing a path shows fields with hints; the submit button stays disabled until the name has 2+ characters and the passphrase is strong; Back returns to the paths. Do not turn sync on against production with a throwaway name unless you intend to delete it afterwards. Quit the app.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/pages/settings.html src/renderer/pages/settings.js src/renderer/pages/pages.css test/unit/sync-settings-card.test.js
git commit -m "feat(settings): two-path sync setup, sync second in nav, on-state list

Start path calls enable directly; join path preflights and turns a
not-found result into an explicit choice. Error shown in one row only.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `openSettingsSection` resolver and the `/sync` command

**Files:**
- Modify: `src/main/main.js` (after `function openInternalPage(url) {…}` ~line 5833; the `tabs:open-page` handler ~line 6318; `SLASH_COMMANDS` ~line 6736)
- Modify: `copy/slash-commands.json`, `src/renderer/overlay.js` (~line 768), `src/renderer/pages/shortcuts.js` (~line 11)
- Generated: `copy/generated/*` via `npm run copy:build`
- Test: `test/unit/settings-section-routing.test.js`

**Interfaces:**
- Produces: `openSettingsSection(section: string)` in `main.js`, allowlist `SETTINGS_SECTION_FRAGMENTS = { blocking, patron, sync }`; slash command `/sync` with hint `Set up or manage sync` running `window.browserAPI.openPage('settings', 'sync')`.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/settings-section-routing.test.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('main owns one allowlisted resolver for Settings sections', () => {
  const main = read('src/main/main.js');
  assert.match(main, /const SETTINGS_SECTION_FRAGMENTS = Object\.freeze\(\{\s*blocking: '#group-privacy',\s*patron: '#group-patron',\s*sync: '#group-sync',?\s*\}\);/);
  assert.match(main, /function openSettingsSection\(section\) \{[\s\S]*?openInternalPage\(`blanc:\/\/settings\/\$\{fragment\}`\);/);
  assert.doesNotMatch(main, /const sectionMap = /, 'the handler-local map must be gone');
  const handler = main.match(/chromeHandle\('tabs:open-page', \(_e, name, section\) => \{([\s\S]*?)\n  \}\);/)?.[1] ?? '';
  assert.match(handler, /if \(name === 'settings'\) return openSettingsSection\(section\);/);
  assert.doesNotMatch(handler, /#group-/, 'no fragment literal in the handler');
});

test('/sync exists in all four command copies with the same hint', () => {
  const hint = 'Set up or manage sync';
  const copy = JSON.parse(read('copy/slash-commands.json'));
  const idx = copy.commands.findIndex((c) => c.command === '/sync');
  assert.ok(idx > 0);
  assert.equal(copy.commands[idx].hint, hint);
  assert.equal(copy.commands[idx - 1].command, '/settings');
  assert.match(read('src/renderer/overlay.js'), new RegExp(`\\{ cmd: '/sync', hint: '${hint}', run: \\(\\) => window\\.browserAPI\\.openPage\\('settings', 'sync'\\) \\}`));
  assert.match(read('src/renderer/pages/shortcuts.js'), new RegExp(`\\['/sync', '${hint}'\\]`));
  assert.match(read('src/main/main.js'), new RegExp(`\\['/sync', '${hint}'\\]`));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/settings-section-routing.test.js`
Expected: FAIL, resolver missing.

- [ ] **Step 3: Extract the resolver**

In `main.js`, directly after the closing brace of `function openInternalPage(url) {…}`, add:

```js
// The ONLY place a Settings section name becomes a URL fragment. Allowlisted,
// never interpolated from renderer text (blanc://settings/ is privileged).
// Used by the chrome's tabs:open-page and by the start page's sync card.
const SETTINGS_SECTION_FRAGMENTS = Object.freeze({
  blocking: '#group-privacy',
  patron: '#group-patron',
  sync: '#group-sync',
});
function openSettingsSection(section) {
  const fragment = Object.prototype.hasOwnProperty.call(SETTINGS_SECTION_FRAGMENTS, section)
    ? SETTINGS_SECTION_FRAGMENTS[section]
    : '';
  openInternalPage(`blanc://settings/${fragment}`);
}
```

Replace the `tabs:open-page` handler with:

```js
  chromeHandle('tabs:open-page', (_e, name, section) => {
    if (name === 'settings') return openSettingsSection(section);
    if (['bookmarks', 'history', 'downloads', 'tab-import'].includes(name)) {
      openInternalPage(`blanc://${name}/`);
    }
  });
```

- [ ] **Step 4: Add `/sync` to the four copies**

`copy/slash-commands.json`, directly after the `/settings` entry:
```json
    { "command": "/sync", "hint": "Set up or manage sync" },
```
`src/renderer/overlay.js`, directly after the `/settings` row:
```js
    { cmd: '/sync', hint: 'Set up or manage sync', run: () => window.browserAPI.openPage('settings', 'sync') },
```
`src/renderer/pages/shortcuts.js`, directly after `['/settings', 'Open settings'],`:
```js
  ['/sync', 'Set up or manage sync'],
```
`src/main/main.js` `SLASH_COMMANDS`, directly after `['/settings', 'Open settings'],`:
```js
  ['/sync', 'Set up or manage sync'],
```

- [ ] **Step 5: Rebuild the copy substrate and run checks**

Run: `npm run copy:build && npm run copy:check`
Expected: check passes; `git status` shows changed files under `copy/generated/`.

Run: `node --test test/unit/settings-section-routing.test.js` → PASS, 2 tests. Run: `npm run test:unit` → all pass.

- [ ] **Step 6: Verify in the app**

`npm start`, press ⌘L, type `/sync`, Enter. Expected: the Settings sheet opens scrolled to the Sync group. Quit.

- [ ] **Step 7: Commit**

```bash
git add src/main/main.js copy/slash-commands.json copy/generated src/renderer/overlay.js src/renderer/pages/shortcuts.js test/unit/settings-section-routing.test.js
git commit -m "feat: /sync command and a shared openSettingsSection resolver

The settings-section allowlist moves out of the chrome IPC handler so
the start page can route through the same function.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `syncNudgeDismissed` settings key

**Files:**
- Modify: `src/main/settings.js` (`DEFAULTS` after `onboardingVersion`; `getSettings()` read validation; `setSettings()` clean block)
- Modify: `settings-schema/schema.json` (`internalDefaults`), generated output via `npm run settings:build`
- Modify: `spec/features.md` (settings table under F14, after the `onePasswordAccount` row)
- Test: `test/unit/sync-nudge-settings.test.js`

**Interfaces:**
- Produces: `settings.getSettings().syncNudgeDismissed: boolean` (default `false`), writable via `settings.setSettings({ syncNudgeDismissed: true })`.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/sync-nudge-settings.test.js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const settingsSchema = require('../../settings-schema/schema.json');

const electronId = require.resolve('electron');
const originalElectron = require.cache[electronId];
let activeUserData = null;
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: { app: { getPath: () => activeUserData, on: () => {} } },
};

function loadSettings(userData) {
  activeUserData = userData;
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  return require('../../src/main/settings');
}

test.after(() => {
  delete require.cache[require.resolve('../../src/main/settings')];
  delete require.cache[require.resolve('../../src/main/store')];
  if (originalElectron) require.cache[electronId] = originalElectron;
  else delete require.cache[electronId];
});

test('syncNudgeDismissed defaults false, validates, persists, and never syncs', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sync-nudge-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));

  let settings = loadSettings(userData);
  assert.equal(settings.getSettings().syncNudgeDismissed, false);
  assert.equal(settingsSchema.internalDefaults.includes('syncNudgeDismissed'), true);

  settings.setSettings({ syncNudgeDismissed: 'yes' });
  assert.equal(settings.getSettings().syncNudgeDismissed, false, 'non-boolean writes are ignored');

  settings.setSettings({ syncNudgeDismissed: true });
  assert.equal(settings.getSettings().syncNudgeDismissed, true);
  assert.equal(Object.prototype.hasOwnProperty.call(settings.exportForSync().values, 'syncNudgeDismissed'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(settings.getSettings()._syncMeta, 'syncNudgeDismissed'), false);

  // A hand-edited file reads back as the default, never as a truthy string.
  const file = path.join(userData, 'settings.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.syncNudgeDismissed = 'true';
  fs.writeFileSync(file, JSON.stringify(data));
  settings = loadSettings(userData);
  assert.equal(settings.getSettings().syncNudgeDismissed, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/sync-nudge-settings.test.js`
Expected: FAIL (`undefined !== false`).

- [ ] **Step 3: Add the key to `settings.js`**

In `DEFAULTS`, directly after the `onboardingVersion: 0,` line:

```js
  // Device-local, set once the start page's sync card is dismissed or sync is
  // turned on; never cleared, never Profile Synced (design 2026-09-17 §5.2).
  syncNudgeDismissed: false,
```

In `getSettings()`, directly after the `onboardingVersion` validation block:

```js
  if (typeof data.syncNudgeDismissed !== 'boolean') {
    data.syncNudgeDismissed = DEFAULTS.syncNudgeDismissed;
  }
```

In `setSettings()`, directly after `if (typeof partial.usagePing === 'boolean') clean.usagePing = partial.usagePing;`:

```js
  if (typeof partial.syncNudgeDismissed === 'boolean') clean.syncNudgeDismissed = partial.syncNudgeDismissed;
```

- [ ] **Step 4: Register the key with the schema guard**

In `settings-schema/schema.json`, change `internalDefaults` to:

```json
  "internalDefaults": ["tabLayout", "verticalTabsWidth", "onePasswordEnabled", "onePasswordAccount", "onboardingVersion", "presentationDefaultsResetVersion", "syncNudgeDismissed", "_syncMeta", "_syncTieBreakers"],
```

Run: `npm run settings:build && npm run settings:check` → passes. Commit any regenerated files under `settings-schema/generated/`.

In `spec/features.md`, in the settings table directly after the `onePasswordAccount` row, add:

```
| `syncNudgeDismissed` | `false` | desktop-only boolean set when the start page's sync card is dismissed or sync is turned on; device-local, never synced |
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/unit/sync-nudge-settings.test.js` → PASS. Run: `npm run test:unit` → all pass. Run: `npm run substrate:check` → passes.

- [ ] **Step 6: Commit**

```bash
git add src/main/settings.js settings-schema spec/features.md test/unit/sync-nudge-settings.test.js
git commit -m "feat(settings): device-local syncNudgeDismissed key

Registered in the schema guard's internalDefaults; never synced.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Nudge policy, flag setters, status projection, send-site guards, IPC

**Files:**
- Create: `src/main/sync-nudge.js`
- Modify: `src/main/main.js` (requires near line 160; the acceptance first-run block inside `app.whenReady` ~line 7907; `startPageStatus` ~line 8350; `broadcastStartPageStatus` ~line 8366; `startPage` hooks ~line 8445)
- Modify: `src/main/pages.js` (`pages:start:data` handler; `pages:settings:sync-enable`; new start handlers)
- Modify: `src/main/tab-preload.js` (`start` api)
- Test: `test/unit/sync-nudge.test.js`

**Interfaces:**
- Produces: `shouldShowSyncNudge({ firstRunComplete, syncEnabled, dismissed }) → boolean`; `syncNudgeForTab(shared, tab, defaultProfileId) → boolean`; `startPageStatus().syncNudge`; hooks `startPage.syncNudgeFor(wc)`, `startPage.dismissSyncNudge()`, `startPage.openSettingsSection(section)`; IPC `pages:start:open-settings`, `pages:start:sync-nudge-dismiss`; bridge `start.openSettings(section)`, `start.dismissSyncNudge()`; `pages:start:data` reply and `pages:start:status` push carry `syncNudge`.

- [ ] **Step 1: Write the failing tests**

```js
// test/unit/sync-nudge.test.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { shouldShowSyncNudge, syncNudgeForTab } = require('../../src/main/sync-nudge');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('shouldShowSyncNudge: every clause gates', () => {
  const base = { firstRunComplete: true, syncEnabled: false, dismissed: false };
  assert.equal(shouldShowSyncNudge(base), true);
  assert.equal(shouldShowSyncNudge({ ...base, firstRunComplete: false }), false);
  assert.equal(shouldShowSyncNudge({ ...base, syncEnabled: true }), false);
  assert.equal(shouldShowSyncNudge({ ...base, dismissed: true }), false);
  assert.equal(shouldShowSyncNudge({}), false, 'missing fields never show');
});

test('syncNudgeForTab: Personal, non-private tabs only', () => {
  const personal = { profileId: 'personal', private: false };
  assert.equal(syncNudgeForTab(true, personal, 'personal'), true);
  assert.equal(syncNudgeForTab(true, { profileId: 'work-1', private: false }, 'personal'), false);
  assert.equal(syncNudgeForTab(true, { profileId: 'personal', private: true }, 'personal'), false);
  assert.equal(syncNudgeForTab(false, personal, 'personal'), false);
  assert.equal(syncNudgeForTab(true, undefined, 'personal'), false);
});

test('main projects syncNudge on the shared status and guards it per tab at both send sites', () => {
  const main = read('src/main/main.js');
  assert.match(main, /syncNudge: shouldShowSyncNudge\(\{\s*firstRunComplete: settings\.isFirstRunComplete\(\),\s*syncEnabled: sync\.status\(\)\.enabled,\s*dismissed: current\.syncNudgeDismissed,?\s*\}\)/);
  assert.match(main, /send\('pages:start:status', \{ \.\.\.status, syncNudge: syncNudgeForTab\(status\.syncNudge, tab, DEFAULT_PROFILE_ID\) \}\)/);
  assert.match(main, /syncNudgeFor: \(wc\) => syncNudgeForTab\(startPageStatus\(\)\.syncNudge, tabs\.get\(tabIdByWebContentsId\.get\(wc\.id\)\), DEFAULT_PROFILE_ID\)/);
  assert.match(main, /dismissSyncNudge: \(\) => \{\s*settings\.setSettings\(\{ syncNudgeDismissed: true \}\);\s*return true;\s*\}/);
  assert.match(main, /openSettingsSection: \(section\) => openSettingsSection\(String\(section \?\? ''\)\)/);
  // Startup setter for profiles that enabled sync before this release. It
  // must run before any window exists and before sync.init() registers its
  // settings listener — i.e. before the settings fan-out block, not after.
  const setter = main.indexOf('// Retire the start-page sync card for profiles that already sync.');
  const fanout = main.indexOf('settings.onSettingsChanged((s) => {');
  const syncInit = main.indexOf('sync.init();');
  assert.ok(setter > 0 && fanout > 0 && syncInit > 0);
  assert.ok(setter < fanout && setter < syncInit, 'startup setter runs before fan-out and sync.init()');
  assert.match(main, /\/\/ Retire the start-page sync card for profiles that already sync\.[\s\S]{0,600}?if \(sync\.status\(\)\.enabled && !settings\.getSettings\(\)\.syncNudgeDismissed\) \{\s*settings\.setSettings\(\{ syncNudgeDismissed: true \}\);\s*\}/);
});

test('pages.js wires the data field, the enable-side flag, and the two start handlers', () => {
  const pages = read('src/main/pages.js');
  assert.match(pages, /syncNudge: hooks\.startPage\?\.syncNudgeFor\?\.\(event\.sender\) \?\? false,/);
  assert.match(pages, /const result = await sync\.enable\(payload \?\? \{\}\);\s*if \(result\?\.status\?\.enabled === true\) settings\.setSettings\(\{ syncNudgeDismissed: true \}\);\s*return result;/);
  assert.match(pages, /handle\('pages:start:open-settings', 'newtab', \(section\) => hooks\.startPage\?\.openSettingsSection\?\.\(section\)\)/);
  assert.match(pages, /handle\('pages:start:sync-nudge-dismiss', 'newtab', \(\) => hooks\.startPage\?\.dismissSyncNudge\?\.\(\) === true\)/);
  const preload = read('src/main/tab-preload.js');
  assert.match(preload, /openSettings: \(section\) => invoke\('pages:start:open-settings', section\)/);
  assert.match(preload, /dismissSyncNudge: \(\) => invoke\('pages:start:sync-nudge-dismiss'\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/sync-nudge.test.js` → FAIL, cannot find module.

- [ ] **Step 3: Create the pure policy module**

```js
// src/main/sync-nudge.js
'use strict';
// Start-page sync card policy (design 2026-09-17 §5.2). Pure: no electron.
//
// shouldShowSyncNudge feeds the SHARED startPageStatus() object. The
// persistent flag is what makes the card one-time; `syncEnabled` stays as a
// defensive check for the window before the startup setter runs and for a
// flag write that failed to persist. Personal-only and private exclusions
// are deliberately NOT here: the status object is broadcast to every open
// start page, so each recipient tab applies syncNudgeForTab at the send site.

function shouldShowSyncNudge({ firstRunComplete, syncEnabled, dismissed } = {}) {
  return firstRunComplete === true && syncEnabled !== true && dismissed !== true;
}

function syncNudgeForTab(shared, tab, defaultProfileId) {
  return shared === true && !!tab && tab.profileId === defaultProfileId && !tab.private;
}

module.exports = { shouldShowSyncNudge, syncNudgeForTab };
```

- [ ] **Step 4: Wire `main.js`**

Near the other local requires (directly after `const { DEFAULT_PROFILE_ID } = require('./local-profile-model');`), add:

```js
const { shouldShowSyncNudge, syncNudgeForTab } = require('./sync-nudge');
```

In `startPageStatus`, directly after the `patronActive: settings.isPatronActive(),` line, add:

```js
      // Start-page sync card (design 2026-09-17 §5.2). Shared across tabs;
      // the send sites apply the per-tab profile/private guard.
      syncNudge: shouldShowSyncNudge({
        firstRunComplete: settings.isFirstRunComplete(),
        syncEnabled: sync.status().enabled,
        dismissed: current.syncNudgeDismissed,
      }),
```

Replace the body of `broadcastStartPageStatus` with:

```js
  const broadcastStartPageStatus = () => {
    const status = startPageStatus();
    for (const tab of tabs.values()) {
      if (!tab.url?.startsWith('blanc://newtab')) continue;
      liveContents(tab)?.send('pages:start:status', { ...status, syncNudge: syncNudgeForTab(status.syncNudge, tab, DEFAULT_PROFILE_ID) });
    }
  };
```

In the `startPage: {` hooks object, directly after `status: startPageStatus,`, add:

```js
      syncNudgeFor: (wc) => syncNudgeForTab(startPageStatus().syncNudge, tabs.get(tabIdByWebContentsId.get(wc.id)), DEFAULT_PROFILE_ID),
      dismissSyncNudge: () => {
        settings.setSettings({ syncNudgeDismissed: true });
        return true;
      },
      // Runs inside runInPageRuntime, so the sheet opens in the start page's own window.
      openSettingsSection: (section) => openSettingsSection(String(section ?? '')),
```

Inside `app.whenReady`, directly after the acceptance-mode first-run block (the `if (acceptanceTestMode && !settings.isFirstRunComplete()) {…}` statement, ~line 7907-7913) and before the DoH block, add:

```js
  // Retire the start-page sync card for profiles that already sync. Runs
  // here — before any window exists, before the settings fan-out listener,
  // and long before startProfileSync() registers sync.init()'s listener —
  // so the write can neither flash the card nor reschedule the launch sync.
  if (sync.status().enabled && !settings.getSettings().syncNudgeDismissed) {
    settings.setSettings({ syncNudgeDismissed: true });
  }
```

`sync.init()` itself (inside `startProfileSync`, ~line 8947) is not touched.

- [ ] **Step 5: Wire `pages.js` and the preload**

In the `pages:start:data` handler, directly after `...hooks.startPage?.status?.(),`, add (it must come after the spread so it overrides the shared value):

```js
    // Per-tab guard: the shared status never carries profile or privacy.
    syncNudge: hooks.startPage?.syncNudgeFor?.(event.sender) ?? false,
```

Replace the `pages:settings:sync-enable` line with:

```js
  handle('pages:settings:sync-enable', 'settings', async (payload) => {
    const result = await sync.enable(payload ?? {});
    // Persisted credentials mean sync is on even when the first pull failed
    // (ok: false) — that is still "I know about sync", so retire the card.
    if (result?.status?.enabled === true) settings.setSettings({ syncNudgeDismissed: true });
    return result;
  });
```

Directly after the `pages:start:privacy-complete` handler, add:

```js
  // Start-page sync card: open Settings at an allowlisted section (main owns
  // the allowlist) and the one-time dismissal.
  handle('pages:start:open-settings', 'newtab', (section) => hooks.startPage?.openSettingsSection?.(section));
  handle('pages:start:sync-nudge-dismiss', 'newtab', () => hooks.startPage?.dismissSyncNudge?.() === true);
```

In `tab-preload.js`, in the `start` api object directly after `completePrivacy`, add:

```js
        openSettings: (section) => invoke('pages:start:open-settings', section),
        dismissSyncNudge: () => invoke('pages:start:sync-nudge-dismiss'),
```

- [ ] **Step 6: Run the tests**

Run: `node --test test/unit/sync-nudge.test.js` → PASS, 4 tests. Run: `npm run test:unit` → all pass. Run `npm start` once and confirm the app launches without a console error in main. Quit.

- [ ] **Step 7: Commit**

```bash
git add src/main/sync-nudge.js src/main/main.js src/main/pages.js src/main/tab-preload.js test/unit/sync-nudge.test.js
git commit -m "feat(start): sync card policy, flag setters, per-tab send-site guards

syncNudge rides startPageStatus and the existing status push; the flag
is set on dismiss, on any enable that persisted credentials, and once
at startup for already-enabled profiles.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Start-page card (ledger and Billboard)

**Files:**
- Modify: `src/renderer/pages/newtab.html` (ledger: after `#groupsSection`; Billboard: after `#bbGroups`)
- Modify: `src/renderer/pages/newtab.js` (`dataReady` handler ~line 723; `onStatus` handler ~line 750; new `renderSyncNudge` beside `renderPatronCallout`)
- Modify: `src/renderer/pages/pages.css` (append)
- Test: `test/unit/sync-nudge-page.test.js`

**Interfaces:**
- Consumes: `data.syncNudge` and `status.syncNudge` (Task 6), `window.bowserPages.start.openSettings`, `window.bowserPages.start.dismissSyncNudge`.
- Produces: `.js-sync-nudge` sections with `.js-sync-nudge-setup` and `.js-sync-nudge-dismiss` buttons (used by the acceptance hook in Task 8).

- [ ] **Step 1: Write the failing test**

```js
// test/unit/sync-nudge-page.test.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const COPY = 'Sync your favorites and settings across your devices, and, if you choose, open tabs. End-to-end encrypted; Blanc can’t read it.';

test('the ledger and Billboard each carry one hidden-by-default sync card with the approved copy', () => {
  const html = read('src/renderer/pages/newtab.html');
  const cards = html.match(/class="[^"]*js-sync-nudge[^"]*"[^>]*hidden/g) ?? [];
  assert.equal(cards.length, 2);
  assert.match(html, /<section id="syncNudge" class="ledger-section sync-nudge js-sync-nudge" hidden>/);
  assert.match(html, /<section class="bb-sync-nudge sync-nudge js-sync-nudge" hidden>/);
  assert.equal((html.split(COPY).length - 1), 2, 'exact copy in both cards');
  assert.equal((html.match(/class="js-sync-nudge-setup">Set up sync</g) ?? []).length, 2);
  assert.equal((html.match(/class="quiet js-sync-nudge-dismiss">Not now</g) ?? []).length, 2);
  assert.doesNotMatch(html, /Macs and PCs/);
  assert.doesNotMatch(html, /style="/, 'no inline styles');
});

test('newtab.js reflects syncNudge from data and status and routes clicks through the bridge', () => {
  const js = read('src/renderer/pages/newtab.js');
  assert.match(js, /function renderSyncNudge\(show\) \{\s*for \(const el of document\.querySelectorAll\('\.js-sync-nudge'\)\) el\.hidden = !show;\s*\}/);
  assert.match(js, /renderSyncNudge\(data\.syncNudge === true\);/);
  assert.match(js, /if \(status && 'syncNudge' in status\) renderSyncNudge\(status\.syncNudge === true\);/);
  assert.match(js, /start\.openSettings\('sync'\)/);
  assert.match(js, /start\.dismissSyncNudge\(\)/);
  // The renderer never hides the card on its own click; the status push does.
  assert.doesNotMatch(js, /js-sync-nudge-dismiss[\s\S]{0,200}\.hidden = true/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/sync-nudge-page.test.js` → FAIL, 0 cards.

- [ ] **Step 3: Add the markup**

In `newtab.html`, directly after the closing `</section>` of `#groupsSection` (ledger), add:

```html
    <section id="syncNudge" class="ledger-section sync-nudge js-sync-nudge" hidden>
      <div class="ledger-label">pick up on another device</div>
      <p class="sync-nudge-copy">Sync your favorites and settings across your devices, and, if you choose, open tabs. End-to-end encrypted; Blanc can’t read it.</p>
      <div class="sync-nudge-actions">
        <button type="button" class="js-sync-nudge-setup">Set up sync</button>
        <button type="button" class="quiet js-sync-nudge-dismiss">Not now</button>
      </div>
    </section>
```

Directly after `<div id="bbGroups" class="bb-groups"></div>` (Billboard), add:

```html
    <section class="bb-sync-nudge sync-nudge js-sync-nudge" hidden>
      <p class="sync-nudge-title">Pick up on another device.</p>
      <p class="sync-nudge-copy">Sync your favorites and settings across your devices, and, if you choose, open tabs. End-to-end encrypted; Blanc can’t read it.</p>
      <div class="sync-nudge-actions">
        <button type="button" class="js-sync-nudge-setup">Set up sync</button>
        <button type="button" class="quiet js-sync-nudge-dismiss">Not now</button>
      </div>
    </section>
```

- [ ] **Step 4: Add the CSS**

Append to `pages.css`:

```css
/* Start-page sync card (design 2026-09-17 §5.2). One-time; hidden until
   main's status projection says otherwise. */
.sync-nudge-copy { margin: 8px 0 0; max-width: 520px; color: var(--text-dim); font-size: 13px; line-height: 1.5; }
.sync-nudge-actions { display: flex; gap: 10px; margin-top: 12px; }
.sync-nudge-actions button.quiet { background: transparent; border-color: transparent; color: var(--text-dim); }
.sync-nudge-actions button.quiet:hover { color: var(--accent); }
.bb-sync-nudge { margin-top: 38px; text-align: center; }
.bb-sync-nudge .sync-nudge-title { margin: 0; font-family: var(--font-mono); font-size: 11.5px; color: var(--text-dim); }
.bb-sync-nudge .sync-nudge-copy { margin-left: auto; margin-right: auto; }
.bb-sync-nudge .sync-nudge-actions { justify-content: center; }
```

- [ ] **Step 5: Wire `newtab.js`**

Directly after `function renderPatronCallout(patronActive) {…}`, add:

```js
// Start-page sync card. Driven only by main's projection (initial data +
// every status push); the renderer never decides visibility itself, so a
// dismissal or an enable in another window hides it here too.
function renderSyncNudge(show) {
  for (const el of document.querySelectorAll('.js-sync-nudge')) el.hidden = !show;
}
for (const button of document.querySelectorAll('.js-sync-nudge-setup')) {
  button.addEventListener('click', () => { window.bowserPages?.start.openSettings('sync').catch(() => {}); });
}
for (const button of document.querySelectorAll('.js-sync-nudge-dismiss')) {
  button.addEventListener('click', () => { window.bowserPages?.start.dismissSyncNudge().catch(() => {}); });
}
```

In the `dataReady` handler, directly after `renderPatronCallout(data.patronActive);`, add:

```js
  renderSyncNudge(data.syncNudge === true);
```

In the `onStatus` handler, directly after the `patronActive` line, add:

```js
  if (status && 'syncNudge' in status) renderSyncNudge(status.syncNudge === true);
```

- [ ] **Step 6: Run the tests and verify in the app**

Run: `node --test test/unit/sync-nudge-page.test.js` → PASS, 2 tests. `npm run test:unit` → all pass.

`npm start` with the dev profile. If sync is off and the flag is unset, the card shows on a new tab in both ledger and Billboard layouts. Click **Not now**: it disappears without a reload. Confirm `syncNudgeDismissed: true` in the dev profile's `settings.json`. Delete that key from the file, relaunch, click **Set up sync**: the Settings sheet opens at Sync. Quit. (Memory: the dev profile lives under the `-Dev` userData path.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/newtab.html src/renderer/pages/newtab.js src/renderer/pages/pages.css test/unit/sync-nudge-page.test.js
git commit -m "feat(start): one-time sync card on the ledger and Billboard

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Desktop acceptance scenario

**Files:**
- Modify: `spec/acceptance/sync.feature` (append), `spec/acceptance/index.md` (F27 rows)
- Modify: `src/main/test-hook.js` (the `install(refs)` destructure ~line 50-157; beside `readNewtabLayoutDom`)
- Modify: `src/main/main.js` (the `require('./test-hook').install({` refs object ~line 8603)
- Create: `test/desktop/steps/sync-nudge.steps.js`
- Modify: `test/desktop/cucumber.mjs` (`RUNNABLE`)

**Interfaces:**
- Consumes: `.js-sync-nudge*` classes (Task 7), `settings.getSettings().syncNudgeDismissed` (Task 5), the existing hook `utilitySurface()` (returns `{ visible, url, loadedUrl, ready }` where `url` is the exact `blanc://settings/#group-…` string main opened), the existing steps `When I run the slash command {string}` (runnable.steps.js) and `Then the {word} page opens in the utility sheet under the blanc scheme`, and main's `liveContents(tab)`.
- Produces: hook methods `readSyncNudgeDom()`, `clickSyncNudge(action)`, `resetSyncNudge()`, `syncNudgeDismissed()`, `syncEnabled()`; ref `liveContents` passed into the hook.

- [ ] **Step 1: Add the scenario**

Append to `spec/acceptance/sync.feature`:

```gherkin
  @F27-4 @F27 @desktop
  Scenario: The start page offers sync once and stays quiet after Not now
    Given a profile that completed first run
    And sync is off and the sync offer has not been dismissed
    When I open a new tab
    Then the start page offers to set up sync
    When I choose Not now on the sync offer
    Then the start page no longer offers sync
    When I open a new tab
    Then the start page no longer offers sync

  @F27-5 @F27 @desktop
  Scenario: The sync offer opens Settings at the Sync section
    Given a profile that completed first run
    And sync is off and the sync offer has not been dismissed
    When I open a new tab
    And I choose Set up sync on the sync offer
    Then the settings page opens in the utility sheet under the blanc scheme
    And the Settings sheet is at the "sync" section

  @F27-6 @F27 @desktop
  Scenario: The sync command opens Settings at the Sync section
    Given a profile that completed first run
    When I run the slash command "/sync"
    Then the settings page opens in the utility sheet under the blanc scheme
    And the Settings sheet is at the "sync" section
```

F27-6 goes through the real path the spec requires: the chrome overlay's command input → `tabs:open-page` → `openSettingsSection`. `When I run the slash command {string}` already exists in `runnable.steps.js` and drives the overlay through `test/desktop/support/overlay.js`.

In `spec/acceptance/index.md`, after the `F27-3` row add:

```
| F27-4 | Start page offers sync once; Not now is permanent | — | ✅ | ⬜ | ⬜ |
| F27-5 | Sync offer opens Settings at the Sync section | — | ✅ | ⬜ | ⬜ |
| F27-6 | /sync opens Settings at the Sync section | — | ✅ | ⬜ | ⬜ |
```

Before writing steps, run `grep -rn "I open a new tab\|completed first run\|I run the slash command\|opens in the utility sheet" test/desktop/steps/` and reuse those existing definitions; define only the new phrasings below.

- [ ] **Step 2: Run the dry run to see the undefined steps**

Run: `npm run test:acceptance:dry`
Expected: reports undefined steps for the five new phrasings (the dry run is tag-filtered by `RUNNABLE`; add `'@F27-4', '@F27-5', '@F27-6'` to `RUNNABLE` in `test/desktop/cucumber.mjs` after the existing `'@F27-…'` entries, or after the F16 line if no F27 entries exist, then rerun).

- [ ] **Step 3: Pass `liveContents` into the hook and add the methods**

Repository policy: `liveContents(tab)` is the only correct liveness check; after `webContents.close()` a tab's `view.webContents` can read back `undefined`. The hook does not receive it today, so add it.

In `src/main/main.js`, in the `require('./test-hook').install({` refs object, on the line that begins `tabs, getTabOrder: () => rt().tabOrder, …`, add `liveContents,` as the first entry so it reads `liveContents, tabs, getTabOrder: () => rt().tabOrder, …`.

In `src/main/test-hook.js`, in the `const { … } = refs;` destructure at the top of `install(refs)`, add `liveContents,` directly after `tabs,`.

Then, directly after `readNewtabLayoutDom() {…},`, add:

```js
    readSyncNudgeDom() {
      const tab = tabs.get(getActiveTabId());
      const wc = tab && urlOf(tab).startsWith('blanc://newtab') ? liveContents(tab) : null;
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const cards = [...document.querySelectorAll('.js-sync-nudge')];
        return {
          count: cards.length,
          visible: cards.some((el) => !el.hidden && getComputedStyle(el).display !== 'none'),
        };
      })()`);
    },
    clickSyncNudge(action) {
      const tab = tabs.get(getActiveTabId());
      const wc = tab && urlOf(tab).startsWith('blanc://newtab') ? liveContents(tab) : null;
      if (!wc) return false;
      const cls = action === 'setup' ? 'js-sync-nudge-setup' : 'js-sync-nudge-dismiss';
      return wc.executeJavaScript(`(() => {
        const btn = [...document.querySelectorAll('.${cls}')]
          .find((el) => !el.closest('.js-sync-nudge').hidden && getComputedStyle(el).display !== 'none');
        if (!btn) return false;
        btn.click();
        return true;
      })()`);
    },
    // Test-only: the one place the flag is ever written false, so the three
    // scenarios can run in any order inside one acceptance profile.
    resetSyncNudge() { settings.setSettings({ syncNudgeDismissed: false }); return settings.getSettings().syncNudgeDismissed; },
    syncNudgeDismissed() { return settings.getSettings().syncNudgeDismissed === true; },
    syncEnabled() { return sync.status().enabled === true; },
```

If `sync` is not already in scope in `test-hook.js`, add `const sync = require('./sync');` beside its other requires. The Settings-section assertion uses the existing `utilitySurface()` hook; no new reader is needed.

- [ ] **Step 4: Write the step definitions**

```js
// test/desktop/steps/sync-nudge.steps.js
'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { waitForValue } = require('../support/poll');

Given('sync is off and the sync offer has not been dismissed', async function () {
  assert.equal(await this.call('syncEnabled'), false);
  assert.equal(await this.call('resetSyncNudge'), false);
});

Then('the start page offers to set up sync', async function () {
  await waitForValue(
    () => this.call('readSyncNudgeDom'),
    (dom) => dom?.count === 2 && dom.visible === true,
    'the sync card to be visible',
  );
});

When('I choose Not now on the sync offer', async function () {
  assert.equal(await this.call('clickSyncNudge', 'dismiss'), true);
});

When('I choose Set up sync on the sync offer', async function () {
  assert.equal(await this.call('clickSyncNudge', 'setup'), true);
});

Then('the start page no longer offers sync', async function () {
  await waitForValue(() => this.call('syncNudgeDismissed'), (v) => v === true, 'the dismissal flag to persist');
  await waitForValue(
    () => this.call('readSyncNudgeDom'),
    (dom) => dom?.visible === false,
    'the sync card to be hidden',
  );
});

// `url` is the exact string main passed to showUtilityPage, fragment included.
Then('the Settings sheet is at the {string} section', async function (section) {
  await waitForValue(
    () => this.call('utilitySurface'),
    (surf) => surf?.visible === true && surf.ready === true && surf.url === `blanc://settings/#group-${section}`,
    `the Settings sheet at #group-${section}`,
  );
});
```

- [ ] **Step 5: Run dry, then the real scenarios**

Run: `npm run test:acceptance:dry` → no undefined steps.
Run: `npm run test:acceptance:desktop -- --tags "@F27-4 or @F27-5 or @F27-6"` (if the script does not forward args, run the underlying cucumber command from `test/desktop/cucumber.mjs` with the tag expression). Expected: 3 scenarios passed. Afterwards, delete any Playwright/output artifacts the run leaves behind (`output/`, `test-results/`) before committing.

- [ ] **Step 6: Commit**

```bash
git add spec/acceptance/sync.feature spec/acceptance/index.md src/main/main.js src/main/test-hook.js test/desktop/steps/sync-nudge.steps.js test/desktop/cucumber.mjs
git commit -m "test(acceptance): sync offer is one-time; card and /sync open Settings at Sync

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Naming sweep and site copy

**Files:**
- Modify: `site/src/pages/index.astro` (feature grid, after the `#profiles` article), `site/src/pages/features/sync.astro` (frontmatter + hero + new block), `site/src/data/navigation.mjs` (line 28), `site/src/pages/features.astro` (the `#sync` row), `site/src/pages/features/profiles.astro` (line 43), `docs/press/fact-sheet.md` (lines 15, 31, 97)

- [ ] **Step 1: Homepage row**

In `index.astro`, directly after the `<article class="home-feature" id="profiles">…</article>` block, add:

```html
    <article class="home-feature" id="sync">
      <h2>Pick up on your other devices.</h2>
      <p>Sync your favorites and settings across your devices, and, if you choose, open tabs. End-to-end encrypted before anything leaves your machine.</p>
      <a class="text-link" href="/features/sync" data-track="feature_cta_click" data-feature="sync" data-cta-position="home-feature-grid">See how sync works <span aria-hidden="true">↗</span></a>
    </article>
```

- [ ] **Step 2: Sync feature page**

In `sync.astro` frontmatter, set:

```
  title={"Encrypted Sync Across Devices | Blanc Browser"}
  description={"Sync carries your favorites and settings between devices, and your open tabs if you choose — end-to-end encrypted, off by default, opt-in per device."}
  ogDescription={"Your favorites and settings on your other devices, and, if you choose, your open tabs. End-to-end encrypted."}
```

Replace the hero `<h1>` text with `Your favorites and settings on your other devices, and, if you choose, your open tabs.` and its `<p>` with: `Turn on sync once per device with a sync name and passphrase. Favorites and settings follow you. Flip one more switch and each machine also publishes what it has open, to browse from the island, the Quick Switcher, or the start page.`

Directly after the hero `</section>`, add a new section using the **exact wrapper and article markup** of the existing "a menu, not a mirror" section (open that section and copy its element structure), with this content:

- kicker `what syncs`, heading `Favorites and settings. Open tabs if you choose.`
- article 1: `<h3>Favorites and settings.</h3><p>Your favorites, search engine, blocking state and exceptions, home page, and theme, encrypted on your device before upload.</p>`
- article 2: `<h3>Open tabs, per device.</h3><p>Off until you turn it on. Each machine publishes its own open tabs; nothing merges or rearranges.</p>`
- article 3: `<h3>Never synced.</h3><p>History, downloads, permissions, cookies, site data, and private tabs stay on the device.</p>`

Leave the figure, the "a menu, not a mirror" section, the honest-part aside, and the close section as they are, except change the `Sync belongs to Personal.` article body from `Profile Sync is available only to Personal.` to `Sync is available only to Personal.`.

- [ ] **Step 3: Navigation, features hub, profiles page, fact sheet**

`navigation.mjs` line 28 → `{ href: '/features/sync', label: 'Sync', description: 'Favorites and settings across devices, open tabs if you choose.' },`

`features.astro` `#sync` row: label `across your devices`, heading `Pick up on your other devices.`, body `From Personal, opt-in sync carries your favorites and settings, and, if you choose, shows what each device has open. End-to-end encrypted; opening a remote tab creates a local tab.`, link text `How sync works`.

`profiles.astro` line 43: `Profile Sync is available only to Personal.` → `Sync is available only to Personal.`

`docs/press/fact-sheet.md`: replace `Profile Sync` with `Sync` on lines 15 and 97 (keep the rest of each sentence). Line 31 already reads "Sync"; leave it.

- [ ] **Step 4: Sweep and build**

Run: `grep -rn "Profile Sync\|Tab Sync" site/src src/renderer docs/press/fact-sheet.md` → no user-facing hits remain (historical `release-feature-names.json` entries and `releases.json` bodies are exempt; do not edit them).

Run: `cd site && npm ci && npm run build && cd ..` → build and SEO check pass.
Run: `npm run site:changelog:check` → passes.
Run: `npm run test:unit` → all pass (the memory `public-truth` test must still pass; you did not touch figures).

- [ ] **Step 5: Commit**

```bash
git add site/src docs/press/fact-sheet.md
git commit -m "site: name the feature Sync everywhere; homepage row; what-syncs block

Claims are release-backed (sync since v0.12.0, tab sharing since v0.20.0).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Full verification and handoff

**Files:** none new.

- [ ] **Step 1: Run every gate**

```bash
npm run test:unit
npm run substrate:check
npm run test:acceptance:dry
npm run test:acceptance:desktop -- --tags "@F27-4 or @F27-5 or @F27-6 or @F36-3"
```
Expected: all pass. Delete Playwright artifacts afterwards.

- [ ] **Step 2: Packaged check in an isolated profile**

Run: `npm run dist:dir`. Launch the unpacked app **only** with the isolated-profile technique used by `test/desktop/packaged-first-run-smoke.mjs` (it points the packaged app at a scratch userData directory and never touches the real one). Never rename, move, or edit the real user data directory. Confirm: card visible after the tour, **Not now** hides it, relaunch keeps it hidden, `/sync` opens Settings at Sync, the two-path card renders.

- [ ] **Step 3: Hand off for review**

Report the gates run and their results. **Do not push the branch or open a pull request without the owner's explicit authorization in chat**; the shared checkout is used by other sessions and PRs are owner-approved. When authorized, the PR is titled `Sync discoverability and two-path setup`, targets `main`, lists the spec path, the tasks, and the gates, states that the site copy changes (Task 9) are release-backed while the app changes ship with the next release, and ends with the attribution the PR author is required to use (for a Claude agent: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`).

---

## Pre-release checklist (not a PR prerequisite)

This belongs to the release that carries the app changes, alongside the gates in `docs/release-verification.md`; record pass/fail per step in that release's `docs/release-incidents/<date>-<version>.md`. It does not block merging the implementation PR.

**Two-device manual check.** Two packaged builds on two machines, clean Personal profiles, throwaway sync names:

1. A: Start path → "Sync is on…". Add a favorite.
2. B: Join path, correct credentials → "Connected to …", the favorite appears.
3. B: Turn off sync (no wipe). Join path, wrong passphrase → the not-found choice appears; B's `sync.json` shows `enabled: false`; nothing was created (A's data unchanged).
4. B: **Start a new sync with these** → a distinct second account (A's favorite does not appear).
5. B: disconnect the network, turn off sync, Join path → offline notice, nothing saved.
6. Clean-up, in this order because only a device holding an account's credentials can wipe it: B turns sync on again with the second account's credentials, then **Turn off sync** with "also delete synced data" (wipes the second account). Then A: **Turn off sync** with "also delete synced data" (wipes the first account). A cannot wipe B's account.

---

## Self-review

- **Spec coverage.** §3 naming → Tasks 3 and 9. §4.1 placement → Task 3. §4.2 paths, copy, and reducer → Tasks 2 and 3. §4.3 preflight and IPC → Task 1. §4.4 on-state → Task 3. §5.1 `/sync` and resolver → Task 4. §5.2 card, flag, visibility rule, delivery, send-site guard, key registration → Tasks 5, 6, 7. §5.3 no tour change → nothing to do. §6 site and listing → Task 9 (the two Product Hunt actions are owner actions, not code). §7 error table → Tasks 1, 2, 6. §8 tests → each task; manual check → Task 10. §9 sequencing matches Tasks 1–9.
- **Type consistency.** `preflight` outcomes (`found|notFound|invalid|offline|rateLimited|error`) match the reducer's `preflight-reply` handling and the notice map. `syncNudgeForTab(shared, tab, defaultProfileId)` is used identically at both send sites and in the hook. Bridge names `start.openSettings` / `start.dismissSyncNudge` match Task 7's calls and Task 6's preload. `openSettingsSection(section)` is the single name across Tasks 4, 6, and 8.
- **`/sync` coverage.** F27-6 drives the real chrome path (overlay command input → `tabs:open-page` → `openSettingsSection`); F27-5 drives the start-page hook through the same resolver. No deviation from the spec's §8 remains.
- **Review round 1 (owner).** Enable effects and replies are tokenized and copy derives from the effect's path; the startup migration runs before any window and before the sync listener; `/sync` has its own acceptance scenario; key zeroization is tested on every outcome; hooks use `liveContents`; Task 10 no longer touches real user data, the two-device check moved to a pre-release checklist with the wipe order corrected, pushing requires owner authorization, the attribution trailer is conditional, and the site metadata says "Sync".
