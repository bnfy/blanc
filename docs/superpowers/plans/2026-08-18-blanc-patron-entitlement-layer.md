# Blanc Patron — Entitlement Layer Implementation Plan (Phase 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Patron entitlement foundation — a device-local `patron` record with three kinds (`founding` / `lifetime` / `subscription`), Polar activation + subscription validation with a 30-day offline grace and graceful degradation, migration of existing `$19` Supporters to founding Patrons, and the re-gating of the three cosmetic colorways under Patron — with nothing else gating until this exists.

**Architecture:** All entitlement *decisions* live in a new pure, Electron-free `src/main/patron-model.js` (mirrors `tabsync-model.js` / `session-workspace.js`), covered by `node:test` unit tests. `src/main/patron.js` wraps Polar's `net.fetch` calls and calls the pure model for every decision. `src/main/settings.js` gains the `patron` record, `isPatronActive()`, `setPatron()`, the extended `isAppIconAllowed()` predicate, the renderer projection that strips `patron`, and a one-time upgrade migration. `src/main/main.js` schedules the daily background validation and wires the activation IPC.

**Tech Stack:** Electron (main process), `net.fetch` for Polar's public customer-portal API, `node --test` (`npm run test:unit`) over `test/unit/`, the repo's `JsonStore` persistence.

## Global Constraints

Copied verbatim from `docs/superpowers/specs/2026-08-18-blanc-patron-design.md`; every task's requirements implicitly include these:

- **Patron only ever ADDS.** Nothing shipped today (the whole browser + all of today's Personal-only Profile Sync) ever moves behind Patron.
- **`patron` is the single canonical record.** No Patron-era entitlement check may read `supporter`; `supporter` becomes a downgrade mirror only.
- **A `subscription` is NEVER written to `supporter`** (an old build reads any non-null `supporter` as a *permanent* grant).
- **Device-local, never synced.** Neither `patron` nor `supporter` is in `SYNCED_KEYS`; the generic `setSettings()` whitelist must ignore both.
- **Renderer sees only `patronActive`** (a boolean) — never the key, activation id, benefit id, or Polar status. `getSettings()` must strip **both** `supporter` and `patron`.
- **Fail open except one path.** Network failure / ambiguous / unknown status → stay active within the 30-day offline grace (clock from `lastValidatedAt`, bootstrapped at activation). Only a **confirmed terminal status** revokes. The single fail-*closed* path: an unrecognized `benefit_id` at activation grants nothing.
- **Expiration is a field, not a status.** Response carries `status` plus separate `expires_at`; never treat `expired` as a status value.
- **Distinct `benefit_id` per product** is a setup invariant, verified in sandbox before production cutover.
- **No DRM, no lockout, no user-data loss** on lapse — degrade gracefully.
- **Polar base switches on `app.isPackaged`** (`sandbox-api.polar.sh` in dev, `api.polar.sh` packaged) — already in `supporter.js`. The `benefit_id` allowlist has separate sandbox/production tables on the same switch.
- **Colorway fallback is `paper`** (`DEFAULTS.appIcon`), applied on the read path; invalid writes are ignored (not reset).

## Roadmap (the other three plans, written after this one lands)

- **Phase 2 — Named Workspaces** (the anchor): profile-scoped `workspaces.json`, ⌘L management UI, single-window binding, continuous autosave, Patron-gated creation.
- **Phase 3 — Supporting bundle**: custom slash commands / keybindings; Patron badge in Settings.
- **Phase 4 — Site + copy**: restrained Patron section with the plain validation disclosure.

## File Structure

- **Create `src/main/patron-model.js`** — pure, no `require('electron')`. Exports `resolveKind`, `evaluateValidation`, `migrateSupporter`, `downgradeMirror`, `GRACE_MS`, `readBenefitId`. One responsibility: entitlement decisions as pure functions.
- **Create `test/unit/patron-model.test.js`** — `node:test` coverage for every branch of the above.
- **Modify `src/main/settings.js`** — `patron` default; `isPatronActive()`; `setPatron()`; extend `isAppIconAllowed()`; strip `patron` in the renderer projection; run `migrateSupporter` once on load; keep the `supporter` downgrade mirror for founding/lifetime.
- **Create `src/main/patron.js`** — Polar `activate` + `validate` network calls (Electron `net.fetch`), each delegating decisions to `patron-model`; the `validateIfDue` entry point. Supersedes `supporter.js`'s `activateSupporter` (which is folded in and re-exported for the existing IPC name).
- **Modify `src/main/main.js`** — daily idle-scheduled `validateIfDue`; wire the settings-page activation IPC to `patron.activate`.
- **Modify `src/renderer/pages/settings.*`** — Patron section (key input + status) and the three colorways re-gated on `patronActive`. (Manual verification — chrome/UI is not unit-tested per repo norm.)

---

### Task 1: Pure benefit_id → kind resolution (`resolveKind`, `readBenefitId`)

**Files:**
- Create: `src/main/patron-model.js`
- Test: `test/unit/patron-model.test.js`

**Interfaces:**
- Produces:
  - `readBenefitId(payload) -> string | null` — defensively reads `benefit_id` from a Polar activate or validate payload: checks `payload.benefit_id`, then `payload.license_key?.benefit_id`, then `payload.activation?.license_key?.benefit_id`.
  - `resolveKind(benefitId, allowlist) -> 'founding' | 'lifetime' | 'subscription' | null` — maps a benefit id through the given allowlist object (`{ [benefitId]: kind }`); returns `null` for a missing/unknown id (fail closed).

- [ ] **Step 1: Write the failing test**

```js
// test/unit/patron-model.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { readBenefitId, resolveKind } = require('../../src/main/patron-model');

const ALLOW = { ben_supporter: 'founding', ben_annual: 'subscription', ben_monthly: 'subscription', ben_lifetime: 'lifetime' };

test('readBenefitId reads root, nested license_key, and nested activation', () => {
  assert.equal(readBenefitId({ benefit_id: 'a' }), 'a');
  assert.equal(readBenefitId({ license_key: { benefit_id: 'b' } }), 'b');
  assert.equal(readBenefitId({ activation: { license_key: { benefit_id: 'c' } } }), 'c');
  assert.equal(readBenefitId({}), null);
  assert.equal(readBenefitId(null), null);
});

test('resolveKind maps known benefits and fails closed on unknown', () => {
  assert.equal(resolveKind('ben_supporter', ALLOW), 'founding');
  assert.equal(resolveKind('ben_annual', ALLOW), 'subscription');
  assert.equal(resolveKind('ben_lifetime', ALLOW), 'lifetime');
  assert.equal(resolveKind('ben_unknown', ALLOW), null);
  assert.equal(resolveKind(null, ALLOW), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- test/unit/patron-model.test.js`
Expected: FAIL — cannot find module `patron-model`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/main/patron-model.js
// Pure entitlement decisions — NO require('electron'). Mirrors the Electron-free
// pattern of tabsync-model.js / session-workspace.js so every branch is unit-testable.

function readBenefitId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.benefit_id
    ?? payload.license_key?.benefit_id
    ?? payload.activation?.license_key?.benefit_id
    ?? null;
}

function resolveKind(benefitId, allowlist) {
  if (!benefitId) return null;
  return allowlist[benefitId] ?? null;
}

module.exports = { readBenefitId, resolveKind };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- test/unit/patron-model.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/patron-model.js test/unit/patron-model.test.js
git commit -m "feat(patron): pure benefit_id resolution with defensive read + fail-closed mapping"
```

---

### Task 2: Pure validation state machine (`evaluateValidation`, `GRACE_MS`)

**Files:**
- Modify: `src/main/patron-model.js`
- Test: `test/unit/patron-model.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 at runtime (same module).
- Produces:
  - `GRACE_MS` — `30 * 24 * 60 * 60 * 1000`.
  - `evaluateValidation({ outcome, record, now }) -> { active: boolean, record }` — the pure state machine. `outcome` is one of:
    - `{ kind: 'ok', status: string, expiresAt: number|null }` — a parsed Polar response.
    - `{ kind: 'unreachable' }` — network failure/ambiguous.
    It returns the next `record` (with updated `lastValidatedAt` / `lastAttemptedAt` / `lastStatus`) and whether the subscription is currently `active`. Founding/lifetime never call this. Rules: `status === 'granted'` and (`expiresAt` null or `> now`) → active, set `lastValidatedAt = now`. Known terminal (`revoked`, `disabled`) or granted-but-`expiresAt <= now` → not active (confirmed lapse). Unknown status or `unreachable` → active **iff** `now - lastValidatedAt <= GRACE_MS`, and does **not** advance `lastValidatedAt`. `lastAttemptedAt` is set to `now` in every case.

- [ ] **Step 1: Write the failing test**

```js
// append to test/unit/patron-model.test.js
const { evaluateValidation, GRACE_MS } = require('../../src/main/patron-model');

const base = (over = {}) => ({
  kind: 'subscription', key: 'k', activationId: 'a', benefitId: 'ben_annual',
  activatedAt: 0, lastValidatedAt: 1000, lastAttemptedAt: 1000, lastStatus: 'granted', ...over,
});

test('granted, unexpired → active and advances lastValidatedAt', () => {
  const now = 5000;
  const r = evaluateValidation({ outcome: { kind: 'ok', status: 'granted', expiresAt: now + 1 }, record: base(), now });
  assert.equal(r.active, true);
  assert.equal(r.record.lastValidatedAt, now);
  assert.equal(r.record.lastAttemptedAt, now);
});

test('revoked → confirmed lapse, not active', () => {
  const r = evaluateValidation({ outcome: { kind: 'ok', status: 'revoked', expiresAt: null }, record: base(), now: 5000 });
  assert.equal(r.active, false);
  assert.equal(r.record.lastAttemptedAt, 5000);
});

test('granted but expired → confirmed lapse, not active', () => {
  const now = 5000;
  const r = evaluateValidation({ outcome: { kind: 'ok', status: 'granted', expiresAt: now - 1 }, record: base(), now });
  assert.equal(r.active, false);
});

test('unknown status → rides grace, does NOT advance lastValidatedAt', () => {
  const now = 1000 + GRACE_MS - 1;
  const r = evaluateValidation({ outcome: { kind: 'ok', status: 'weird_new_status', expiresAt: null }, record: base(), now });
  assert.equal(r.active, true);
  assert.equal(r.record.lastValidatedAt, 1000); // unchanged
});

test('unreachable within grace → active; past grace → degrade', () => {
  const withinNow = 1000 + GRACE_MS;
  assert.equal(evaluateValidation({ outcome: { kind: 'unreachable' }, record: base(), now: withinNow }).active, true);
  const pastNow = 1000 + GRACE_MS + 1;
  assert.equal(evaluateValidation({ outcome: { kind: 'unreachable' }, record: base(), now: pastNow }).active, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- test/unit/patron-model.test.js`
Expected: FAIL — `evaluateValidation is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// add to src/main/patron-model.js
const GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const TERMINAL = new Set(['revoked', 'disabled']);

function evaluateValidation({ outcome, record, now }) {
  const next = { ...record, lastAttemptedAt: now };

  if (outcome.kind === 'ok' && outcome.status === 'granted'
      && (outcome.expiresAt == null || outcome.expiresAt > now)) {
    next.lastStatus = 'granted';
    next.lastValidatedAt = now;
    return { active: true, record: next };
  }

  const confirmedTerminal =
    (outcome.kind === 'ok' && TERMINAL.has(outcome.status)) ||
    (outcome.kind === 'ok' && outcome.status === 'granted'
      && outcome.expiresAt != null && outcome.expiresAt <= now);
  if (confirmedTerminal) {
    next.lastStatus = outcome.status;
    return { active: false, record: next };
  }

  // unknown status OR unreachable → ambiguous: ride the offline grace, do not advance lastValidatedAt.
  if (outcome.kind === 'ok') next.lastStatus = outcome.status;
  const active = (now - record.lastValidatedAt) <= GRACE_MS;
  return { active, record: next };
}

module.exports = { readBenefitId, resolveKind, evaluateValidation, GRACE_MS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- test/unit/patron-model.test.js`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/patron-model.js test/unit/patron-model.test.js
git commit -m "feat(patron): validation state machine with 30-day offline grace, fail-open except confirmed terminal"
```

---

### Task 3: Pure migration + downgrade mirror (`migrateSupporter`, `downgradeMirror`)

**Files:**
- Modify: `src/main/patron-model.js`
- Test: `test/unit/patron-model.test.js`

**Interfaces:**
- Produces:
  - `migrateSupporter({ supporter, patron, now }) -> { patron } | null` — if `supporter` is non-null and `patron` is null, returns `{ patron: { kind:'founding', key, activationId, benefitId:null, activatedAt } }` (using the supporter's fields, `activatedAt` falling back to `now`). Otherwise returns `null` (no change — idempotent).
  - `downgradeMirror(patron) -> supporterRecord | null` — returns the legacy `{ key, activationId, activatedAt }` mirror to persist under `supporter` **only** for `founding`/`lifetime`; returns `null` for `subscription` or null patron (so a subscription is never mirrored).

- [ ] **Step 1: Write the failing test**

```js
// append to test/unit/patron-model.test.js
const { migrateSupporter, downgradeMirror } = require('../../src/main/patron-model');

test('migrateSupporter creates a founding patron from a legacy supporter, once', () => {
  const supporter = { key: 'k', activationId: 'a', activatedAt: 42 };
  const out = migrateSupporter({ supporter, patron: null, now: 99 });
  assert.deepEqual(out.patron, { kind: 'founding', key: 'k', activationId: 'a', benefitId: null, activatedAt: 42 });
  // idempotent: already has a patron → null
  assert.equal(migrateSupporter({ supporter, patron: out.patron, now: 99 }), null);
  // nothing to migrate
  assert.equal(migrateSupporter({ supporter: null, patron: null, now: 99 }), null);
});

test('downgradeMirror mirrors founding/lifetime but NEVER a subscription', () => {
  assert.deepEqual(
    downgradeMirror({ kind: 'founding', key: 'k', activationId: 'a', activatedAt: 42 }),
    { key: 'k', activationId: 'a', activatedAt: 42 });
  assert.deepEqual(
    downgradeMirror({ kind: 'lifetime', key: 'k', activationId: 'a', activatedAt: 7 }),
    { key: 'k', activationId: 'a', activatedAt: 7 });
  assert.equal(downgradeMirror({ kind: 'subscription', key: 'k', activationId: 'a', activatedAt: 1 }), null);
  assert.equal(downgradeMirror(null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- test/unit/patron-model.test.js`
Expected: FAIL — `migrateSupporter is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// add to src/main/patron-model.js
function migrateSupporter({ supporter, patron, now }) {
  if (!supporter || patron) return null;
  return {
    patron: {
      kind: 'founding',
      key: supporter.key,
      activationId: supporter.activationId ?? null,
      benefitId: null,
      activatedAt: supporter.activatedAt ?? now,
    },
  };
}

function downgradeMirror(patron) {
  if (!patron || (patron.kind !== 'founding' && patron.kind !== 'lifetime')) return null;
  return { key: patron.key, activationId: patron.activationId ?? null, activatedAt: patron.activatedAt };
}

module.exports = { readBenefitId, resolveKind, evaluateValidation, GRACE_MS, migrateSupporter, downgradeMirror };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- test/unit/patron-model.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/patron-model.js test/unit/patron-model.test.js
git commit -m "feat(patron): pure migration + downgrade-mirror (subscription never mirrored to supporter)"
```

---

### Task 4: Wire the model into `settings.js`

**Files:**
- Modify: `src/main/settings.js` (the `DEFAULTS`, the sanitize/projection paths, `isAppIconAllowed`, exports)
- Test: `test/unit/settings-patron.test.js` (new — `settings.js` is `require`-able without Electron for these pure predicates; if it pulls Electron at import in this repo, fall back to the manual steps noted)

**Interfaces:**
- Consumes: `migrateSupporter`, `downgradeMirror` from `patron-model`.
- Produces (on `settings.js` exports):
  - `isPatronActive() -> boolean` — true for `founding`/`lifetime`; for `subscription`, true when `_patronSubscriptionActive` (a cached boolean the main-process validator sets via `setPatron`); false when `patron` is null.
  - `setPatron(record)` — the only writer of `patron`; also writes the `downgradeMirror(record)` into `supporter` (or clears it) so founding/lifetime survive a downgrade and a subscription never does.
  - `isAppIconAllowed(id)` — now `APP_ICONS.includes(id) || (SUPPORTER_ICONS.includes(id) && isPatronActive())`.

- [ ] **Step 1: Add the `patron` default and migration on load**

In `DEFAULTS`, beside `supporter: null`, add `patron: null`. In the store's post-load sanitize (where `getSettings()`/read coercion runs), call `migrateSupporter` and, if it returns a change, persist the new `patron` (leaving `supporter` intact as the mirror).

```js
// near the top: const { migrateSupporter, downgradeMirror } = require('./patron-model');
// in the load/sanitize path, after the store data is available:
const migrated = migrateSupporter({ supporter: data.supporter, patron: data.patron, now: Date.now() });
if (migrated) data.patron = migrated.patron;
```

- [ ] **Step 2: Add `isPatronActive`, `setPatron`, extend `isAppIconAllowed`**

```js
let _patronSubscriptionActive = false; // set by the main-process validator via setPatron/refresh

function isPatronActive() {
  const p = ensureStore().data.patron;
  if (!p) return false;
  if (p.kind === 'founding' || p.kind === 'lifetime') return true;
  return _patronSubscriptionActive; // subscription: gated by the last validation result
}

function setPatron(record, { subscriptionActive } = {}) {
  ensureStore().update((data) => {
    data.patron = record;
    data.supporter = downgradeMirror(record); // founding/lifetime mirror; subscription/null → null
  });
  if (typeof subscriptionActive === 'boolean') _patronSubscriptionActive = subscriptionActive;
}

function isAppIconAllowed(id) {
  return APP_ICONS.includes(id) || (SUPPORTER_ICONS.includes(id) && isPatronActive());
}
```

Replace the existing `isSupporterActive`-based `isAppIconAllowed` body accordingly. Keep `isSupporterActive` exported for now (used only by the legacy read path) but ensure **no entitlement check** calls it — `isAppIconAllowed` now calls `isPatronActive`.

- [ ] **Step 3: Strip `patron` in the renderer projection**

Find where `getSettings()` builds the renderer-facing object (today it strips `supporter` and exposes `supporterActive`). Add: delete `patron`, and expose `patronActive: isPatronActive()` (keep `supporterActive` as an alias equal to `patronActive` for any existing renderer reference until Phase 4 updates copy).

```js
// in the projection:
delete clean.supporter;
delete clean.patron;
clean.patronActive = isPatronActive();
clean.supporterActive = clean.patronActive; // temporary alias
```

- [ ] **Step 4: Keep `patron`/`supporter` out of the generic write + sync**

Confirm the `setSettings()` whitelist copies **neither** `patron` nor `supporter` (it already omits `supporter`; add an explicit guard/comment so `patron` is never accepted from a renderer partial). Confirm `SYNCED_KEYS` contains neither (it does not — do not add them).

- [ ] **Step 5: Unit-test the projection + predicate (or verify manually)**

```js
// test/unit/settings-patron.test.js  (only if settings.js imports without Electron in this repo)
const { test } = require('node:test');
const assert = require('node:assert');
// Drive via the exported helpers against a temp userData; if settings.js requires electron
// at import time, SKIP this file and use the manual check below instead.
```

Manual fallback (always valid): `npm start`, then in the main-process console set a founding patron and confirm a renderer `getSettings()` payload contains `patronActive: true` and **no** `patron`/`supporter` field.

- [ ] **Step 6: Run tests + commit**

Run: `npm run test:unit`
Expected: PASS (existing suite + patron-model; settings-patron if applicable).

```bash
git add src/main/settings.js test/unit/settings-patron.test.js
git commit -m "feat(patron): settings record, isPatronActive, projection strip, colorway re-gate, migration on load"
```

---

### Task 5: Polar network module (`src/main/patron.js`)

**Files:**
- Create: `src/main/patron.js`
- Modify: `src/main/supporter.js` (re-export the activation entry so the existing IPC name keeps working) — or delete once `main.js` points at `patron.js`.

**Interfaces:**
- Consumes: `readBenefitId`, `resolveKind`, `evaluateValidation` from `patron-model`; `setPatron`, and the stored `patron` record from `settings`.
- Produces:
  - `activate(key) -> { ok: boolean, message?, kind? }` — POSTs to `.../license-keys/activate` with `{ key, organization_id, label }`, reads `benefit_id` via `readBenefitId`, resolves the kind via the per-environment allowlist, and on a known kind calls `setPatron` with a record whose `lastValidatedAt`/`lastAttemptedAt` are bootstrapped to now (activation is an online success) and `subscriptionActive: true` for the subscription kind. **Unknown benefit_id → `{ ok:false }`, grants nothing (fail closed).**
  - `validateIfDue() -> Promise<void>` — for a `subscription` patron only, and at most once per `lastAttemptedAt + 1 day`, POSTs to `.../license-keys/validate` with `{ organization_id, key, activation_id }`, parses `{ status, expires_at }` into an `outcome`, runs `evaluateValidation`, and persists the returned record via `setPatron({...}, { subscriptionActive: active })`. Network failure → `outcome: { kind:'unreachable' }`.

- [ ] **Step 1: Scaffold the per-environment allowlist + API base**

```js
const { app, net } = require('electron');
const settings = require('./settings');
const model = require('./patron-model');

const ORG_ID = '6f675077-6cb1-4965-8db8-15838e5fdb38'; // production org "bnfy" (public, from supporter.js)
const API_BASE = app.isPackaged ? 'https://api.polar.sh' : 'https://sandbox-api.polar.sh';

// SETUP INVARIANT: each product uses a DISTINCT license-key benefit. Fill these from the
// Polar dashboard; verify the sandbox ids in sandbox before production cutover.
const BENEFIT_ALLOWLIST = app.isPackaged
  ? { /* prod: */ }   // { '<supporter>': 'founding', '<annual>': 'subscription', '<monthly>': 'subscription', '<lifetime?>': 'lifetime' }
  : { /* sandbox: */ };
```

- [ ] **Step 2: Implement `activate`**

```js
async function activate(key) {
  const trimmed = String(key ?? '').trim();
  if (!trimmed) return { ok: false, message: 'Enter a license key.' };
  let res;
  try {
    res = await net.fetch(`${API_BASE}/v1/customer-portal/license-keys/activate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: trimmed, organization_id: ORG_ID, label: 'Blanc' }),
    });
  } catch { return { ok: false, message: "Couldn't reach Polar — check your connection and try again." }; }
  if (!res.ok) return { ok: false, message: 'That license key could not be activated.' };
  const payload = await res.json();
  const kind = model.resolveKind(model.readBenefitId(payload), BENEFIT_ALLOWLIST);
  if (!kind) return { ok: false, message: 'That license key is not recognized.' }; // fail closed
  const now = Date.now();
  const activationId = payload.activation?.id ?? payload.id ?? null;
  const record = { kind, key: trimmed, activationId, benefitId: model.readBenefitId(payload), activatedAt: now,
    ...(kind === 'subscription' ? { lastValidatedAt: now, lastAttemptedAt: now, lastStatus: 'granted' } : {}) };
  settings.setPatron(record, { subscriptionActive: kind === 'subscription' });
  return { ok: true, kind };
}
```

- [ ] **Step 3: Implement `validateIfDue`**

```js
const DAY_MS = 24 * 60 * 60 * 1000;
async function validateIfDue() {
  const p = settings.getPatronRecord(); // add a tiny getter to settings that returns the raw record (main-process only)
  if (!p || p.kind !== 'subscription') return;
  if (Date.now() - (p.lastAttemptedAt ?? 0) < DAY_MS) return;
  let outcome;
  try {
    const res = await net.fetch(`${API_BASE}/v1/customer-portal/license-keys/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: ORG_ID, key: p.key, activation_id: p.activationId }),
    });
    if (!res.ok) outcome = { kind: 'unreachable' };
    else { const b = await res.json(); outcome = { kind: 'ok', status: b.status, expiresAt: b.expires_at ? Date.parse(b.expires_at) : null }; }
  } catch { outcome = { kind: 'unreachable' }; }
  const { active, record } = model.evaluateValidation({ outcome, record: p, now: Date.now() });
  settings.setPatron(record, { subscriptionActive: active });
}

module.exports = { activate, validateIfDue };
```

- [ ] **Step 4: Add the `getPatronRecord` main-process getter to `settings.js`**

```js
// settings.js — main-process only; NEVER exposed to renderers
function getPatronRecord() { return ensureStore().data.patron; }
// add getPatronRecord to module.exports
```

- [ ] **Step 5: Verify manually (network path — not unit-tested)**

`npm start`, activate a Polar **sandbox** subscription key via the Settings flow (Task 6/7), confirm `settings.json` gains a `subscription` `patron` record with bootstrapped `lastValidatedAt`, and that an unknown-benefit key returns "not recognized" and writes nothing.

- [ ] **Step 6: Commit**

```bash
git add src/main/patron.js src/main/settings.js
git commit -m "feat(patron): Polar activate + daily validate wired through the pure model"
```

---

### Task 6: Schedule validation + wire activation IPC in `main.js`

**Files:**
- Modify: `src/main/main.js`

**Interfaces:**
- Consumes: `patron.activate`, `patron.validateIfDue`.

- [ ] **Step 1: Schedule `validateIfDue` off the critical path**

After the window is up and the app is idle (reuse the existing post-launch idle hook the app already uses for deferred work; do **not** run it during `installStartupNavigationGate`), call `patron.validateIfDue()` once, then on a daily interval. Never block startup or navigation on it.

- [ ] **Step 2: Point the existing activation IPC at `patron.activate`**

The Settings page already has a supporter-activate IPC (`pages:settings:supporter-activate` per the Phase 1 spec). Route it to `patron.activate` (keep the channel name to avoid a renderer change here; rename in Phase 4). Return `{ ok, message }` to the renderer.

- [ ] **Step 3: Verify manually**

`npm start`; confirm no validation call fires before the blocker/navigation gate resolves (check with a logging breakpoint), and that activation from Settings persists a record.

- [ ] **Step 4: Commit**

```bash
git add src/main/main.js
git commit -m "feat(patron): idle-scheduled daily validation + activation IPC wiring"
```

---

### Task 7: Settings UI — Patron section + re-gated colorways

**Files:**
- Modify: `src/renderer/pages/settings.html` / `settings.js` (renderer) / `pages.css`

**Interfaces:**
- Consumes: the renderer `patronActive` boolean; the activation IPC.

- [ ] **Step 1: Render the Patron section**

A "Blanc Patron" section: license-key input + Activate button, and a quiet status line ("Patron active" / inactive) driven by `patronActive`. Reuse the existing supporter-section markup where it exists.

- [ ] **Step 2: Re-gate the three colorways on `patronActive`**

The `ember`/`plum`/`gold` tiles show locked (dimmed + "Patron" tag) unless `patronActive`; clicking a locked tile points to the Patron section. This is the existing supporter-tile behavior with the gate switched from `supporterActive` to `patronActive`.

- [ ] **Step 3: Verify manually (chrome requires a relaunch)**

Relaunch `npm start` (chrome HTML loads once at window creation). Confirm: locked tiles when inactive; after activating a sandbox key, tiles unlock and the Dock colorway applies; on a simulated lapse the colorway reverts to `paper`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/settings.html src/renderer/pages/settings.js src/renderer/pages/pages.css
git commit -m "feat(patron): Settings Patron section and Patron-gated colorways"
```

---

## Self-Review

**Spec coverage (Phase 1 scope):**
- Entitlement record + three kinds → Tasks 2–4. ✓
- benefit_id allowlist + fail-closed unknown → Tasks 1, 5. ✓
- Retire $19 checkout → user-side (noted in spec §Polar; not a code task). Flagged in handoff.
- Migration of legacy supporter → founding → Tasks 3, 4. ✓
- Validation model (endpoint, statuses, expires_at-not-a-status, defensive benefit_id, cadence, bootstrap, grace) → Tasks 2, 5. ✓
- Renderer projection strips both → Task 4. ✓
- Downgrade mirror + subscription-never-mirrored → Tasks 3, 4. ✓
- Graceful degradation (colorway→paper) → Tasks 4, 7. ✓
- Never synced / never in generic write → Task 4. ✓
- Distinct-benefit sandbox verification → Task 5 setup invariant + handoff note. ✓

**Placeholder scan:** The only intentional blanks are the real Polar `benefit_id` values in Task 5's `BENEFIT_ALLOWLIST` — these are user-side product ids that do not exist until the Polar products are created (spec: account/product setup is user-side). Flagged explicitly, not a hidden TODO.

**Type consistency:** `resolveKind`, `readBenefitId`, `evaluateValidation`, `migrateSupporter`, `downgradeMirror`, `GRACE_MS`, `isPatronActive`, `setPatron`, `getPatronRecord`, `activate`, `validateIfDue` are used with consistent signatures across tasks.

## Out of this plan (later phases)

Named Workspaces, custom commands/keybindings, the Patron badge, and the site copy are Phases 2–4. Retiring the $19 checkout and creating the Polar subscription products (with distinct benefits) are **user-side** setup, prerequisite to Task 5 producing real ids.
