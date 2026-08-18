# Blanc Patron — Entitlement Layer Implementation Plan (Phase 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Patron entitlement foundation — a device-local `patron` record with three kinds (`founding` / `lifetime` / `subscription`), Polar activation + subscription validation with a 30-day offline grace and graceful degradation, migration of existing `$19` Supporters to founding Patrons, re-gating the three cosmetic colorways under Patron, and upgrade surfaces (start page callout + `/patron` slash command) — with nothing else gating until this exists.

**Architecture:** All entitlement *decisions* live in a new pure, Electron-free `src/main/patron-model.js` (mirrors `tabsync-model.js` / `session-workspace.js`), covered by `node:test` unit tests. **Subscription activity is derived from the persisted record** (`isRecordActive`), never a volatile in-memory flag, so a restart cannot lock out a valid subscriber. `src/main/patron.js` wraps Polar's `net.fetch` calls and delegates every decision to the pure model. `src/main/settings.js` gains the `patron` record, `isPatronActive()`, `setPatron()`, the extended `isAppIconAllowed()`, a one-time migration run **inside `ensureStore()`** (against `store.data`, flushed synchronously), and fires the existing `listeners` set on change. The renderer projection and activation IPC are edited in **`src/main/pages.js`** (where they actually live). `src/main/main.js` only schedules the daily background validation.

**Tech Stack:** Electron (main process), `net.fetch` for Polar's public customer-portal API, `node --test` over `test/unit/`, the repo's `JsonStore` persistence.

## Global Constraints

Copied verbatim from `docs/superpowers/specs/2026-08-18-blanc-patron-design.md`; every task implicitly includes these:

- **Patron only ever ADDS.** Nothing shipped today (the whole browser + all of today's Personal-only Profile Sync) ever moves behind Patron.
- **`patron` is the single canonical record.** No Patron-era entitlement check may read `supporter`; `supporter` becomes a downgrade mirror only.
- **A `subscription` is NEVER written to `supporter`** (an old build reads any non-null `supporter` as a *permanent* grant).
- **Subscription activity derives from the persisted record**, not an in-memory boolean (a module cache resets to false on restart and would skip up to 24h of validation, locking out a valid subscriber).
- **Device-local, never synced.** Neither `patron` nor `supporter` is in `SYNCED_KEYS`; the generic `setSettings()` whitelist ignores both.
- **Renderer sees only `patronActive`** — never the key, activation id, benefit id, or Polar status. The `pages.js` `clientSettings()` projection strips **both** `supporter` and `patron`.
- **Fail open except one path.** Network failure / ambiguous / unknown status → stay active within the 30-day offline grace (clock from `lastValidatedAt`, bootstrapped at activation). Only a **confirmed terminal outcome** revokes. The single fail-*closed* path: an unrecognized `benefit_id` at activation grants nothing.
- **Expiration is a field, not a status.** Response carries `status` plus a separate `expires_at`; never treat `expired` as a status value. **`parseExpiresAt` returns three states:** `null` (absent — no expiry), a number (valid epoch-ms), or `false` (present but malformed). Activation rejects `false`; validation treats `false` as ambiguous (rides grace). This prevents both a malformed string silently extending entitlement and a `NaN` comparison classifying as expired terminal.
- **Activation inspects the response.** A 2xx alone is not enough: the nested license key's `status` must be `granted` and `expires_at` (if present and parseable) must be in the future before a `subscription` record is created. A malformed or inactive activation response must not bootstrap 30 days of entitlement.
- **Validation re-checks the benefit.** Each successful validation must resolve the returned `benefit_id` to the expected `subscription` benefit before it may extend entitlement.
- **Distinct `benefit_id` per product** is a setup invariant, verified in sandbox before production cutover.
- **No DRM, no lockout, no user-data loss** on lapse — degrade gracefully. Preserve the existing **200-character key guard** and reject malformed successful JSON.
- **Polar base AND org ID switch on `app.isPackaged`**: `sandbox-api.polar.sh` / `SANDBOX_ORG_ID` in dev, `api.polar.sh` / `PRODUCTION_ORG_ID` in packaged. The production org id (`6f675077-6cb1-4965-8db8-15838e5fdb38`, from `supporter.js`) does not exist in sandbox — sending it there fails every activation. The `benefit_id` allowlist has separate sandbox/production tables on the same switch.
- **Colorway fallback is `paper`** (`DEFAULTS.appIcon`), applied on the read path; invalid writes are ignored.

**Testing note:** run a single model file with `node --test test/unit/patron-model.test.js` (targeted TDD). `npm run test:unit` always expands to the whole suite — use it only for the final full-suite check.

## Roadmap (the other three plans, written after this one lands)

- **Phase 2 — Named Workspaces** (anchor): profile-scoped `workspaces.json`, ⌘L management UI, single-window binding, continuous autosave, Patron-gated creation.
- **Phase 3 — Supporting bundle**: custom slash commands / keybindings; Patron badge in Settings.
- **Phase 4 — Site + copy**: restrained Patron section with the plain validation disclosure; rename the legacy `supporter-activate` IPC / `supporterActive` alias.

## File Structure

- **Create `src/main/patron-model.js`** — pure, no `require('electron')`. Exports `readBenefitId`, `resolveKind`, `parseExpiresAt`, `GRACE_MS`, `isRecordActive`, `evaluateValidation`, `migrateSupporter`, `downgradeMirror`.
- **Create `test/unit/patron-model.test.js`** — `node:test` coverage for every branch.
- **Modify `src/main/settings.js`** — `patron` default; migration inside `ensureStore()`; `isPatronActive()`; `setPatron()` (fires `listeners`); `isAppIconAllowed()`; `getPatronRecord()` (main-only).
- **Create `src/main/patron.js`** — Polar `activate` + `validateIfDue`, each delegating to `patron-model`.
- **Modify `src/main/pages.js`** — `clientSettings()` strips `patron` + adds `patronActive`; route `pages:settings:supporter-activate` to `patron.activate`.
- **Modify `src/main/main.js`** — idle-scheduled daily `validateIfDue`.
- **Modify `src/renderer/pages/settings.*`** — Patron section + colorways re-gated on `patronActive` (manual verification).
- **Modify `src/renderer/pages/newtab.*`** — quiet Patron callout when not active; hidden when active.
- **Modify `src/renderer/overlay.js`** — `/patron` slash command opens Settings.
- **Modify `src/renderer/pages/shortcuts.js`** + **`src/main/main.js`** + **`copy/slash-commands.json`** — mirror the new command (substrate S3 guard).

---

### Task 1: Pure benefit_id resolution — fail-closed (`readBenefitId`, `resolveKind`)

**Files:**
- Create: `src/main/patron-model.js`
- Test: `test/unit/patron-model.test.js`

**Interfaces — Produces:**
- `readBenefitId(payload) -> string | null` — defensively reads `benefit_id` from a Polar activate or validate payload: `payload.benefit_id`, then `payload.license_key?.benefit_id`, then `payload.activation?.license_key?.benefit_id`.
- `resolveKind(benefitId, allowlist) -> 'founding'|'lifetime'|'subscription'|null` — **fail-closed**: requires `benefitId` be a non-empty string, uses an own-property check (rejects inherited `toString`/`constructor`/`__proto__`), and returns `null` unless the mapped value is a known kind.
- `parseExpiresAt(raw) -> number | null | false` — three states: absent/falsy → `null` (no expiry set); valid ISO string → epoch-ms number; present-but-malformed → `false`. Callers distinguish "no expiry" (allow) from "invalid expiry" (activation rejects; validation treats as ambiguous). This prevents both a malformed string silently extending entitlement and a `NaN` comparison classifying as expired terminal.

- [ ] **Step 1: Write the failing test**

```js
// test/unit/patron-model.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { readBenefitId, resolveKind, parseExpiresAt } = require('../../src/main/patron-model');

const ALLOW = { ben_supporter: 'founding', ben_annual: 'subscription', ben_monthly: 'subscription', ben_lifetime: 'lifetime' };

test('readBenefitId reads root, nested license_key, and nested activation', () => {
  assert.equal(readBenefitId({ benefit_id: 'a' }), 'a');
  assert.equal(readBenefitId({ license_key: { benefit_id: 'b' } }), 'b');
  assert.equal(readBenefitId({ activation: { license_key: { benefit_id: 'c' } } }), 'c');
  assert.equal(readBenefitId({}), null);
  assert.equal(readBenefitId(null), null);
});

test('resolveKind maps known benefits', () => {
  assert.equal(resolveKind('ben_supporter', ALLOW), 'founding');
  assert.equal(resolveKind('ben_annual', ALLOW), 'subscription');
  assert.equal(resolveKind('ben_lifetime', ALLOW), 'lifetime');
});

test('resolveKind fails closed on unknown, empty, non-string, and inherited props', () => {
  assert.equal(resolveKind('ben_unknown', ALLOW), null);
  assert.equal(resolveKind('', ALLOW), null);
  assert.equal(resolveKind(null, ALLOW), null);
  assert.equal(resolveKind(42, ALLOW), null);
  // prototype-property inputs must NOT resolve to a truthy inherited value
  assert.equal(resolveKind('toString', ALLOW), null);
  assert.equal(resolveKind('constructor', ALLOW), null);
  assert.equal(resolveKind('__proto__', ALLOW), null);
  // a benefit mapped to a NON-kind value must not leak through
  assert.equal(resolveKind('x', { x: 'not_a_kind' }), null);
});

test('parseExpiresAt: three states — null (absent), number (valid), false (malformed)', () => {
  // absent / falsy → null (no expiry set)
  assert.strictEqual(parseExpiresAt(null), null);
  assert.strictEqual(parseExpiresAt(undefined), null);
  assert.strictEqual(parseExpiresAt(''), null);
  // valid ISO string → epoch-ms
  assert.strictEqual(parseExpiresAt('2026-12-31T00:00:00Z'), Date.parse('2026-12-31T00:00:00Z'));
  // present but malformed → false
  assert.strictEqual(parseExpiresAt('not-a-date'), false);  // Date.parse returns NaN
  assert.strictEqual(parseExpiresAt(12345), false);          // wrong type
  assert.strictEqual(parseExpiresAt(true), false);           // wrong type
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/patron-model.test.js`
Expected: FAIL — cannot find module `patron-model`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/main/patron-model.js
// Pure entitlement decisions — NO require('electron'). Mirrors the Electron-free
// pattern of tabsync-model.js / session-workspace.js so every branch is unit-testable.

const KINDS = new Set(['founding', 'lifetime', 'subscription']);

function readBenefitId(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.benefit_id
    ?? payload.license_key?.benefit_id
    ?? payload.activation?.license_key?.benefit_id
    ?? null;
}

function parseExpiresAt(raw) {
  if (raw == null || raw === '') return null;        // absent — no expiry set
  if (typeof raw !== 'string') return false;         // present but wrong type — malformed
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? false : ms;              // unparseable string — malformed
}

function resolveKind(benefitId, allowlist) {
  if (typeof benefitId !== 'string' || benefitId === '') return null;
  if (!allowlist || typeof allowlist !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(allowlist, benefitId)) return null; // own-property only
  const kind = allowlist[benefitId];
  return KINDS.has(kind) ? kind : null;
}

module.exports = { readBenefitId, resolveKind, parseExpiresAt };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/patron-model.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/patron-model.js test/unit/patron-model.test.js
git commit -m "feat(patron): fail-closed benefit_id resolution (own-property, validated kind, defensive read)"
```

---

### Task 2: Derived activity + validation state machine (`isRecordActive`, `evaluateValidation`, `GRACE_MS`)

**Files:**
- Modify: `src/main/patron-model.js`
- Test: `test/unit/patron-model.test.js`

**Interfaces — Produces:**
- `GRACE_MS = 30 * 24 * 60 * 60 * 1000`.
- `isRecordActive(record, now) -> boolean` — the **single source of truth for current entitlement, derived purely from the persisted record** (so it is correct immediately on restart, before any network call). `founding`/`lifetime` → true. `subscription` → `record.lastStatus === 'granted' && (now - record.lastValidatedAt) <= GRACE_MS`. Anything else → false.
- `evaluateValidation({ outcome, record, now }) -> { active, record }` — folds a validation `outcome` into the record, then returns `active: isRecordActive(next, now)`. `outcome` is `{ kind: 'ok', status, expiresAt, benefitOk }` or `{ kind: 'unreachable' }`. Only a **granted + unexpired + benefitOk** result advances `lastValidatedAt`/sets `lastStatus='granted'`. Confirmed terminal (`revoked`/`disabled`), granted-but-expired (`lastStatus='expired'`), and granted-but-benefit-mismatch (`lastStatus='benefit_mismatch'`) each set a non-`granted` `lastStatus` → derived-inactive. **Unknown status or `unreachable` leaves the record unchanged** (rides the grace off the last good `lastValidatedAt`). `lastAttemptedAt` is set to `now` on every `ok`/`unreachable` attempt.

- [ ] **Step 1: Write the failing test**

```js
// append to test/unit/patron-model.test.js
const { evaluateValidation, isRecordActive, GRACE_MS } = require('../../src/main/patron-model');

const sub = (over = {}) => ({
  kind: 'subscription', key: 'k', activationId: 'a', benefitId: 'ben_annual',
  activatedAt: 0, lastValidatedAt: 1000, lastAttemptedAt: 1000, lastStatus: 'granted', ...over,
});

test('isRecordActive: founding/lifetime always active; subscription needs granted + within grace', () => {
  assert.equal(isRecordActive({ kind: 'founding' }, 9e15), true);
  assert.equal(isRecordActive({ kind: 'lifetime' }, 9e15), true);
  assert.equal(isRecordActive(null, 0), false);
  // restart with a granted record still within grace → active WITHOUT any network call
  assert.equal(isRecordActive(sub({ lastValidatedAt: 1000 }), 1000 + GRACE_MS), true);
  // past grace → inactive
  assert.equal(isRecordActive(sub({ lastValidatedAt: 1000 }), 1000 + GRACE_MS + 1), false);
  // last confirmed status not granted → inactive regardless of grace
  assert.equal(isRecordActive(sub({ lastStatus: 'revoked', lastValidatedAt: 9e15 }), 9e15), false);
});

test('granted + unexpired + benefitOk → active, advances lastValidatedAt', () => {
  const now = 5000;
  const r = evaluateValidation({ outcome: { kind: 'ok', status: 'granted', expiresAt: now + 1, benefitOk: true }, record: sub(), now });
  assert.equal(r.active, true);
  assert.equal(r.record.lastValidatedAt, now);
  assert.equal(r.record.lastStatus, 'granted');
});

test('revoked, expired, and benefit mismatch each degrade', () => {
  const now = 5000;
  assert.equal(evaluateValidation({ outcome: { kind: 'ok', status: 'revoked', expiresAt: null, benefitOk: true }, record: sub(), now }).active, false);
  assert.equal(evaluateValidation({ outcome: { kind: 'ok', status: 'granted', expiresAt: now - 1, benefitOk: true }, record: sub(), now }).active, false);
  const mismatch = evaluateValidation({ outcome: { kind: 'ok', status: 'granted', expiresAt: now + 1, benefitOk: false }, record: sub(), now });
  assert.equal(mismatch.active, false);
  assert.equal(mismatch.record.lastStatus, 'benefit_mismatch');
});

test('malformed expiry (false) is ambiguous, not a terminal expired state', () => {
  const now = 5000;
  const malformed = evaluateValidation({ outcome: { kind: 'ok', status: 'granted', expiresAt: false, benefitOk: true }, record: sub(), now });
  assert.equal(malformed.active, true);
  assert.equal(malformed.record.lastValidatedAt, 1000); // unchanged — treated as ambiguous
  assert.equal(malformed.record.lastStatus, 'granted'); // unchanged — rides grace
});

test('unknown status and unreachable ride the grace, do not advance lastValidatedAt', () => {
  const withinNow = 1000 + GRACE_MS;
  const unknown = evaluateValidation({ outcome: { kind: 'ok', status: 'weird_new', expiresAt: null, benefitOk: true }, record: sub(), now: withinNow });
  assert.equal(unknown.active, true);
  assert.equal(unknown.record.lastValidatedAt, 1000); // unchanged
  assert.equal(unknown.record.lastStatus, 'granted'); // unchanged
  assert.equal(evaluateValidation({ outcome: { kind: 'unreachable' }, record: sub(), now: withinNow }).active, true);
  assert.equal(evaluateValidation({ outcome: { kind: 'unreachable' }, record: sub(), now: 1000 + GRACE_MS + 1 }).active, false);
  assert.equal(evaluateValidation({ outcome: { kind: 'unreachable' }, record: sub(), now: withinNow }).record.lastAttemptedAt, withinNow);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/patron-model.test.js`
Expected: FAIL — `isRecordActive is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// add to src/main/patron-model.js
const GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const TERMINAL = new Set(['revoked', 'disabled']);

function isRecordActive(record, now) {
  if (!record) return false;
  if (record.kind === 'founding' || record.kind === 'lifetime') return true;
  if (record.kind !== 'subscription') return false;
  return record.lastStatus === 'granted' && (now - (record.lastValidatedAt ?? 0)) <= GRACE_MS;
}

function evaluateValidation({ outcome, record, now }) {
  const next = { ...record };
  if (outcome.kind === 'ok') {
    next.lastAttemptedAt = now;
    const granted = outcome.status === 'granted';
    if (outcome.expiresAt === false && granted) {
      // malformed expiry — ambiguous, not terminal; leave record unchanged (ride grace)
    } else if (granted && (outcome.expiresAt === null || outcome.expiresAt > now) && outcome.benefitOk) {
      next.lastStatus = 'granted';
      next.lastValidatedAt = now;
    } else if (TERMINAL.has(outcome.status)) {
      next.lastStatus = outcome.status;               // confirmed terminal
    } else if (granted && !unexpired) {
      next.lastStatus = 'expired';                    // derived terminal
    } else if (granted && !outcome.benefitOk) {
      next.lastStatus = 'benefit_mismatch';           // derived terminal
    }
    // else: unknown, non-terminal status → leave lastStatus/lastValidatedAt untouched (ride grace)
  } else {
    next.lastAttemptedAt = now;                       // unreachable → ride grace, unchanged otherwise
  }
  return { active: isRecordActive(next, now), record: next };
}

module.exports = { readBenefitId, resolveKind, parseExpiresAt, GRACE_MS, isRecordActive, evaluateValidation };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/patron-model.test.js`
Expected: PASS (Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/patron-model.js test/unit/patron-model.test.js
git commit -m "feat(patron): persisted-record-derived activity + validation state machine with benefit re-check"
```

---

### Task 3: Pure migration + downgrade mirror (`migrateSupporter`, `downgradeMirror`)

**Files:**
- Modify: `src/main/patron-model.js`
- Test: `test/unit/patron-model.test.js`

**Interfaces — Produces:**
- `migrateSupporter({ supporter, patron, now }) -> { patron } | null` — if `supporter` non-null and `patron` null, returns `{ patron: { kind:'founding', key, activationId, benefitId:null, activatedAt } }` (activatedAt falling back to `now`). Otherwise `null` (idempotent — nothing to do).
- `downgradeMirror(patron) -> { key, activationId, activatedAt } | null` — the legacy mirror to persist under `supporter`, **only** for `founding`/`lifetime`; `null` for `subscription` or null patron (a subscription is never mirrored).

- [ ] **Step 1: Write the failing test**

```js
// append to test/unit/patron-model.test.js
const { migrateSupporter, downgradeMirror } = require('../../src/main/patron-model');

test('migrateSupporter creates a founding patron once, idempotently', () => {
  const supporter = { key: 'k', activationId: 'a', activatedAt: 42 };
  const out = migrateSupporter({ supporter, patron: null, now: 99 });
  assert.deepEqual(out.patron, { kind: 'founding', key: 'k', activationId: 'a', benefitId: null, activatedAt: 42 });
  assert.equal(migrateSupporter({ supporter, patron: out.patron, now: 99 }), null); // already migrated
  assert.equal(migrateSupporter({ supporter: null, patron: null, now: 99 }), null); // nothing to migrate
});

test('downgradeMirror mirrors founding/lifetime, NEVER a subscription', () => {
  assert.deepEqual(downgradeMirror({ kind: 'founding', key: 'k', activationId: 'a', activatedAt: 42 }), { key: 'k', activationId: 'a', activatedAt: 42 });
  assert.deepEqual(downgradeMirror({ kind: 'lifetime', key: 'k', activationId: 'a', activatedAt: 7 }), { key: 'k', activationId: 'a', activatedAt: 7 });
  assert.equal(downgradeMirror({ kind: 'subscription', key: 'k', activationId: 'a', activatedAt: 1 }), null);
  assert.equal(downgradeMirror(null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/patron-model.test.js`
Expected: FAIL — `migrateSupporter is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// add to src/main/patron-model.js
function migrateSupporter({ supporter, patron, now }) {
  if (!supporter || patron) return null;
  return { patron: {
    kind: 'founding', key: supporter.key, activationId: supporter.activationId ?? null,
    benefitId: null, activatedAt: supporter.activatedAt ?? now,
  } };
}

function downgradeMirror(patron) {
  if (!patron || (patron.kind !== 'founding' && patron.kind !== 'lifetime')) return null;
  return { key: patron.key, activationId: patron.activationId ?? null, activatedAt: patron.activatedAt };
}

module.exports = { readBenefitId, resolveKind, parseExpiresAt, GRACE_MS, isRecordActive, evaluateValidation, migrateSupporter, downgradeMirror };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/patron-model.test.js`
Expected: PASS (all model tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/patron-model.js test/unit/patron-model.test.js
git commit -m "feat(patron): pure migration + downgrade mirror (subscription never mirrored)"
```

---

### Task 4: Wire the model into `settings.js`

**Files:**
- Modify: `src/main/settings.js` — `DEFAULTS`, `ensureStore()` (migration + synchronous flush), `isAppIconAllowed`, new `isPatronActive`/`setPatron`/`getPatronRecord`, exports.

**Interfaces:**
- Consumes: `migrateSupporter`, `downgradeMirror`, `isRecordActive` from `patron-model`.
- Produces (settings exports): `isPatronActive()`, `setPatron(record)`, `getPatronRecord()` (main-only), extended `isAppIconAllowed(id)`.

- [ ] **Step 1: Add the `patron` default and the require**

Add `patron: null` in `DEFAULTS` beside `supporter: null`. At top: `const { migrateSupporter, downgradeMirror, isRecordActive } = require('./patron-model');`

- [ ] **Step 2: Run the migration inside `ensureStore()` against `store.data`, then flush synchronously**

Blocker: the migration must mutate the persisted store, not the shallow copy `getSettings()` returns. Add it inside `ensureStore()`, right after `store = new JsonStore('settings', DEFAULTS);` (line ~147) and before the return, following the existing synchronous-`store.flush()` pattern there:

```js
    const migrated = migrateSupporter({ supporter: store.data.supporter, patron: store.data.patron, now: Date.now() });
    if (migrated) {
      store.data.patron = migrated.patron;      // supporter left intact — it is the downgrade mirror for founding
      store.flush();                            // synchronous, like the onboarding-marker flushes above
    }
```

- [ ] **Step 3: Add `isPatronActive`, `setPatron` (firing listeners), `getPatronRecord`; extend `isAppIconAllowed`**

`setPatron` must fire the existing `listeners` set exactly as `setSupporter` does (line ~321) — otherwise activation won't reapply the Dock icon or update live UI:

```js
function isPatronActive() {
  return isRecordActive(ensureStore().data.patron, Date.now());
}

// The activation flow's private write path — setSettings()'s whitelist has no `patron`.
function setPatron(record) {
  ensureStore().update((data) => {
    data.patron = record;
    data.supporter = downgradeMirror(record); // founding/lifetime mirror; subscription/null → null
  });
  for (const fn of listeners) fn(getSettings()); // reapplies applyAppIcon + live UI, like setSupporter
}

// Main-process only; NEVER exposed to a renderer.
function getPatronRecord() { return ensureStore().data.patron; }

function isAppIconAllowed(id) {
  return APP_ICONS.includes(id) || (SUPPORTER_ICONS.includes(id) && isPatronActive());
}
```

Replace the existing `isAppIconAllowed` body (which calls `isSupporterActive`). Leave `isSupporterActive` exported but ensure **no entitlement path calls it** (only the downgrade mirror concerns `supporter` now). Add `isPatronActive`, `setPatron`, `getPatronRecord` to `module.exports`.

- [ ] **Step 4: Keep `patron` out of the generic write + sync**

Confirm `setSettings()`'s whitelist copies neither `supporter` nor `patron` (it already omits `supporter`; add a one-line comment that `patron` is likewise activation-flow-only). Confirm `SYNCED_KEYS` contains neither (it does not — do not add them).

- [ ] **Step 5: Verify (manual — settings.js imports Electron at load, so no unit file)**

`npm start`; in the main-process console call `settings.setPatron({kind:'founding',key:'x',activationId:null,activatedAt:Date.now()})` and confirm `isPatronActive()` is `true`, `isAppIconAllowed('ember')` is `true`, and the Dock icon reapplies (listener fired). Restart and confirm `isPatronActive()` is still `true` from the persisted record with no network call. Also confirm a legacy `settings.json` carrying only `supporter` gains a `patron:{kind:'founding'}` on next launch (migration + flush).

- [ ] **Step 6: Run the full suite + commit**

Run: `npm run test:unit`
Expected: PASS (existing suite + patron-model).

```bash
git add src/main/settings.js
git commit -m "feat(patron): settings record, ensureStore migration+flush, isPatronActive via persisted record, listener-firing setPatron"
```

---

### Task 5: Polar network module (`src/main/patron.js`)

**Files:**
- Create: `src/main/patron.js`

**Interfaces:**
- Consumes: `readBenefitId`, `resolveKind`, `evaluateValidation` from `patron-model`; `setPatron`, `getPatronRecord` from `settings`.
- Produces: `activate(key) -> Promise<{ ok, message?, kind? }>`, `validateIfDue() -> Promise<void>`.

- [ ] **Step 1: Scaffold API base + per-environment org ID + allowlist + `activate` (with 200-char guard, activation response validation, fail-closed benefit, malformed-JSON catch)**

```js
const { app, net } = require('electron');
const settings = require('./settings');
const model = require('./patron-model');

const PRODUCTION_ORG_ID = '6f675077-6cb1-4965-8db8-15838e5fdb38';
const SANDBOX_ORG_ID = '/* fill from Polar sandbox dashboard */';
const API_BASE = app.isPackaged ? 'https://api.polar.sh' : 'https://sandbox-api.polar.sh';
const ORG_ID = app.isPackaged ? PRODUCTION_ORG_ID : SANDBOX_ORG_ID;
const MAX_KEY_LENGTH = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

const BENEFIT_ALLOWLIST = app.isPackaged
  ? { /* prod:    '<supporter>':'founding', '<annual>':'subscription', '<monthly>':'subscription' */ }
  : { /* sandbox: '<supporter>':'founding', '<annual>':'subscription', '<monthly>':'subscription' */ };

async function readJson(res) { try { return await res.json(); } catch { return null; } }

async function activate(key) {
  const trimmed = String(key ?? '').trim();
  if (!trimmed) return { ok: false, message: 'Enter a license key.' };
  if (trimmed.length > MAX_KEY_LENGTH) return { ok: false, message: 'That key is too long.' };
  let res;
  try {
    res = await net.fetch(API_BASE + '/v1/customer-portal/license-keys/activate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: trimmed, organization_id: ORG_ID, label: 'Blanc' }),
    });
  } catch { return { ok: false, message: 'Could not reach Polar. Check your connection and try again.' }; }
  if (!res.ok) return { ok: false, message: 'That license key could not be activated.' };
  const payload = await readJson(res);
  const benefitId = model.readBenefitId(payload);
  const kind = model.resolveKind(benefitId, BENEFIT_ALLOWLIST);
  if (!payload || !kind) return { ok: false, message: 'That license key is not recognized.' };
  if (kind === 'subscription') {
    const lk = payload.license_key ?? payload.activation?.license_key ?? {};
    const lkStatus = lk.status;
    const lkExpiry = model.parseExpiresAt(lk.expires_at);
    if (lkStatus !== 'granted') return { ok: false, message: 'That subscription is not currently active.' };
    if (lkExpiry === false) return { ok: false, message: 'That subscription has an invalid expiry.' };
    if (typeof lkExpiry === 'number' && lkExpiry <= Date.now()) return { ok: false, message: 'That subscription has expired.' };
  }
  const now = Date.now();
  const activationId = payload.activation?.id ?? payload.id ?? null;
  const record = { kind, key: trimmed, activationId, benefitId, activatedAt: now,
    ...(kind === 'subscription' ? { lastValidatedAt: now, lastAttemptedAt: now, lastStatus: 'granted' } : {}) };
  settings.setPatron(record);
  return { ok: true, kind };
}
```

- [ ] **Step 2: Implement `validateIfDue` (subscription only; re-checks the benefit; malformed → unreachable)**

```js
async function validateIfDue() {
  const p = settings.getPatronRecord();
  if (!p || p.kind !== 'subscription') return;
  if (Date.now() - (p.lastAttemptedAt ?? 0) < DAY_MS) return;
  let outcome;
  try {
    const res = await net.fetch(`${API_BASE}/v1/customer-portal/license-keys/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: ORG_ID, key: p.key, activation_id: p.activationId }),
    });
    const body = res.ok ? await readJson(res) : null;
    if (!body || typeof body.status !== 'string') {
      outcome = { kind: 'unreachable' };                 // non-ok OR malformed successful JSON → ambiguous
    } else {
      const benefitOk = model.resolveKind(model.readBenefitId(body), BENEFIT_ALLOWLIST) === 'subscription';
      outcome = { kind: 'ok', status: body.status, expiresAt: model.parseExpiresAt(body.expires_at), benefitOk };
    }
  } catch { outcome = { kind: 'unreachable' }; }
  const { record } = model.evaluateValidation({ outcome, record: p, now: Date.now() });
  settings.setPatron(record);
}

module.exports = { activate, validateIfDue };
```

- [ ] **Step 3: Verify manually (network path — not unit-tested)**

`npm start`; activate a Polar **sandbox** subscription key (via the Settings flow, Task 8): confirm a `subscription` record with bootstrapped `lastValidatedAt`/`lastStatus:'granted'`. Confirm an unknown-benefit key returns "not recognized" and writes nothing. Simulate a cancelled subscription in the Polar sandbox and confirm the next `validateIfDue` degrades (`lastStatus` becomes `revoked`, `isPatronActive()` false, Dock reverts to `paper`).

- [ ] **Step 4: Commit**

```bash
git add src/main/patron.js
git commit -m "feat(patron): Polar activate + daily validate with benefit re-check, key guard, malformed-JSON handling"
```

---

### Task 6: Renderer projection + activation IPC in `pages.js`

**Files:**
- Modify: `src/main/pages.js` — `clientSettings()` (line ~173) and the `pages:settings:supporter-activate` handler (line ~197).

**Interfaces:**
- Consumes: `settings.isPatronActive()`; `patron.activate`.

- [ ] **Step 1: Strip `patron` in the projection, add `patronActive`**

`clientSettings()` currently destructures `{ supporter: record, _syncMeta, ...rest }`. Add `patron` to the destructure so it is stripped, and expose `patronActive`:

```js
  const clientSettings = () => {
    const { supporter: record, patron, _syncMeta, ...rest } = settings.getSettings();
    return {
      ...rest,
      patronActive: settings.isPatronActive(),
      supporterActive: settings.isPatronActive(), // temporary alias until Phase 4 renames renderer refs
      supporterActivatedAt: record?.activatedAt ?? null,
    };
  };
```

- [ ] **Step 2: Route the activation IPC to `patron.activate`**

Require patron at the top of `pages.js` (`const patron = require('./patron');`, alongside the existing `supporter` require) and route the handler (keep the channel name; Phase 4 renames it):

```js
  handle('pages:settings:supporter-activate', 'settings', (key) => patron.activate(key));
```

- [ ] **Step 3: Verify manually**

`npm start`; confirm `pages:settings:get` returns `patronActive` and **no** `patron`/`supporter` field, and that activating from Settings persists a record and flips `patronActive`.

- [ ] **Step 4: Commit**

```bash
git add src/main/pages.js
git commit -m "feat(patron): pages.js projection strips patron + adds patronActive; activation IPC routes to patron.activate"
```

---

### Task 7: Schedule daily validation in `main.js`

**Files:**
- Modify: `src/main/main.js`

**Interfaces:**
- Consumes: `patron.validateIfDue`.

- [ ] **Step 1: Schedule `validateIfDue` off the critical path**

Add a `setImmediate` at the tail of `releaseStartup()` itself (after `maybeSendLaunchPing()`, line ~6179 of `main.js`), so it fires only after the navigation gate is released, tabs are restored, and session persistence is resumed. `setupAutoUpdater()` (line ~6244) is NOT post-release in the blocking path — it runs immediately after starting the async blocker controller, before `releaseStartup` is ever called. Inside the `setImmediate`, fire `patron.validateIfDue()` once and start a daily `setInterval`. The model's own `lastAttemptedAt` guard prevents redundant network calls within a single run.

- [ ] **Step 2: Verify manually**

`npm start`; with a logging breakpoint, confirm no validate call fires before the blocker/navigation gate resolves, and that a subscription record older than a day triggers exactly one validate.

- [ ] **Step 3: Commit**

```bash
git add src/main/main.js
git commit -m "feat(patron): idle-scheduled daily subscription validation"
```

---

### Task 8: Settings UI — Patron section + re-gated colorways

**Files:**
- Modify: `src/renderer/pages/settings.html` / `settings.js` (renderer) / `pages.css`

**Interfaces:**
- Consumes: the renderer `patronActive` boolean; the activation IPC.

- [ ] **Step 1: Render the Patron section** — a "Blanc Patron" block: license-key input + Activate button + a quiet status line driven by `patronActive`. Reuse the existing supporter-section markup.

- [ ] **Step 2: Re-gate the three colorways on `patronActive`** — `ember`/`plum`/`gold` tiles show locked (dimmed + "Patron" tag) unless `patronActive`; a locked tile points to the Patron section. Existing supporter-tile behavior with the gate switched to `patronActive`.

- [ ] **Step 3: Verify manually (chrome requires relaunch)** — relaunch `npm start`. Locked tiles when inactive; after activating a sandbox key, tiles unlock and the Dock colorway applies; on a simulated lapse the colorway reverts to `paper`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/settings.html src/renderer/pages/settings.js src/renderer/pages/pages.css
git commit -m "feat(patron): Settings Patron section and Patron-gated colorways"
```

---

### Task 9: Start page callout + `/patron` slash command

**Files:**
- Modify: `src/renderer/pages/newtab.html` / `newtab.js` / `pages.css` — start page callout.
- Modify: `src/renderer/overlay.js` — `/patron` slash command.
- Modify: `src/renderer/pages/shortcuts.js` — mirror the new command in the reference list.
- Modify: `src/main/main.js` — add `/patron` to the `SLASH_COMMANDS` menu-doc array.
- Modify: `copy/slash-commands.json` — add the command entry (substrate S3).
- Modify: `src/main/pages.js` — include `patronActive` in the `pages:start:data` response so the start page knows whether to show the callout.

**Interfaces:**
- Consumes: `patronActive` from the `pages:start:data` payload and from the overlay's `state`.

- [ ] **Step 1: Add `patronActive` to `pages:start:data`**

In `pages.js`, the `pages:start:data` handler (line ~232) returns groups, blocked counts, remote devices, and onboarding state. Add `patronActive: settings.isPatronActive()` to the returned object so the start page can gate the callout.

- [ ] **Step 2: Start page callout**

In `newtab.js`, when `patronActive` is false, render a quiet, non-intrusive callout in the ledger layout — below the favorites grid and above the footer. Keep it understated (one line, e.g. "Support Blanc" with a link that opens `blanc://settings/` scrolled to the Patron section). When `patronActive` is true, hide it. The callout must not dominate the start page or feel like an ad — this is an indie browser asking for support, not a nag screen.

- [ ] **Step 3: `/patron` slash command**

Add to the `COMMANDS` array in `overlay.js`:

```js
{ cmd: '/patron', hint: 'Support Blanc with a Patron subscription', run: () => window.browserAPI.openPage('settings') },
```

The command opens Settings; the Patron section (Task 8) is the activation surface. Mirror the entry in `pages/shortcuts.js`, `main.js`'s `SLASH_COMMANDS`, and `copy/slash-commands.json`. Run `npm run copy:check` to verify the substrate guard passes.

- [ ] **Step 4: Verify manually (relaunch required)**

Relaunch `npm start`. Confirm: the start page shows the callout when not a Patron and hides it after activation; `/patron` appears in the slash-command list and opens Settings; the shortcuts page lists it; `npm run copy:check` passes.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/newtab.html src/renderer/pages/newtab.js src/renderer/pages/pages.css src/renderer/overlay.js src/renderer/pages/shortcuts.js src/main/main.js src/main/pages.js copy/slash-commands.json
git commit -m "feat(patron): start page callout and /patron slash command"
```

---

## Self-Review

**Spec coverage (Phase 1):** entitlement record + kinds (T2–T4); benefit_id allowlist + fail-closed (T1, T5); **persisted-derived activity, restart-safe** (T2, T4); migration persisted via ensureStore+flush (T3, T4); validation with statuses/`expires_at`/defensive benefit_id/**per-validation benefit re-check**/cadence/bootstrap/grace (T2, T5); **activation inspects nested license-key status+expiry before bootstrapping grace** (T5); **three-state `parseExpiresAt` (null/number/false)** — activation rejects malformed, validation treats as ambiguous (T1, T2 unit test); **per-environment org ID** (`PRODUCTION_ORG_ID`/`SANDBOX_ORG_ID`, T5); projection strips both in the *correct* file (T6); downgrade mirror + subscription-never-mirrored (T3, T4); **setPatron fires listeners → Dock reapply** (T4); graceful degradation to `paper` (T4, T8); 200-char guard + malformed-JSON handling (T5); never synced / never generic-write (T4); **upgrade surfaces beyond Settings** — start page callout + `/patron` slash command (T9). ✓

**Placeholder scan:** the only blanks are the real Polar `benefit_id` values in `BENEFIT_ALLOWLIST` and `SANDBOX_ORG_ID` (T5) — user-side product/org ids that do not exist until the Polar products are created; flagged as a setup invariant, not a hidden TODO.

**Type consistency:** `readBenefitId`, `resolveKind`, `GRACE_MS`, `isRecordActive`, `evaluateValidation`, `migrateSupporter`, `downgradeMirror`, `isPatronActive`, `setPatron`, `getPatronRecord`, `activate`, `validateIfDue` are used with consistent signatures across tasks. `evaluateValidation` consumers use only its `.record` (activity is re-derived by `isPatronActive`/`isRecordActive`), so no stale-flag path exists.

## Out of this plan (later phases)

Named Workspaces, custom commands/keybindings, the Patron badge, and site copy are Phases 2–4. Retiring the $19 checkout and creating the Polar subscription products (with **distinct** benefits) are **user-side** setup, prerequisite to Task 5's allowlist holding real ids.
