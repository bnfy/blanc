# Sync Device Pairing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a device that already syncs hand its sync secret to a new (or forked) device through an eight-character, ten-minute code, with a clipboard recovery code as the fallback, so joining never asks for the passphrase.

**Architecture:** A pure pairing module derives a Worker-visible `pairId` and a local `wrapKey` from the code with scrypt + HKDF (same parameters as `deriveKeys`); the sender wraps `{ handle, accountId, key }` with AES-256-GCM and parks it on a new additive Worker route for 600 s, one-shot. `sync.js` gains begin/cancel/state, `joinWithCode` (off state), `switchWithCode` (on state, composed from `disable()`'s drain barrier and the join tail) and `copyRecoveryCode` (native dialog, clipboard written by main). The Settings page gets a third setup path and two on-state panels driven by pure reducers in the existing one-shot-effect style.

**Tech Stack:** Node `crypto` (scrypt, hkdf, AES-GCM via `sync-crypto.js`), Electron `net.fetch`, `safeStorage`, `dialog`, `clipboard`; Cloudflare Worker + KV; `node --test`; the `blancI18n` copy pipeline.

**Spec:** `docs/superpowers/specs/2026-10-16-sync-device-pairing-design.md` (read it first; this plan argues from it).

## Global Constraints

- Code alphabet `ABCDEFGHJKMNPQRSTVWXYZ23456789` (30 symbols), 8 symbols, drawn with `crypto.randomInt`; displayed `XXXX-XXXX`; input normalized by trim, uppercase, removing hyphens and spaces (spec §5.1).
- Derivation: `root = scrypt(code, 'blanc-pair:v1', 64, SCRYPT)`, `pairId = hex(hkdf('sha256', root, 'blanc-pair:v1', 'blanc-pair-id/v1', 32))`, `wrapKey = hkdf('sha256', root, 'blanc-pair:v1', 'blanc-pair-key/v1', 32)`; `SCRYPT` is the constant `sync-crypto.js` already uses (spec §5.2).
- Payload `{ v: 1, handle, accountId, key }` with `key` base64 of 32 bytes; validation: `v === 1`, `accountId` 64 lowercase hex, `key` decodes to exactly 32 bytes, `handle` non-empty string (spec §5.2, §5.4).
- Worker: `pair:{pairId}` keys, `expirationTtl: 600`, request cap 4 KB, GET deletes after read, per-IP pair-GET limit 10/min, missing-entry 404 body `{ "error": "not-found" }`, no logging (spec §5.3, §5.7).
- Recovery code: `blanc-sync:1:` + base64url(JSON payload); never crosses IPC outward; `blanc-sync:`-prefixed input never contacts the Worker (spec §4.3).
- `bananifyServiceAllowed(SYNC_ENDPOINT)` gates every new network call; all new `sync.js` entry points are Personal-only via `withLocalProfile(DEFAULT_PROFILE_ID, …)` like `enable`.
- New error codes `pair-not-found`, `pair-unavailable`, `pair-invalid`, `sync-on`, mapped in `sync-messages.js`; `sync-switch` reuses `disable()`'s wipe codes.
- Every new string in `copy/messages/en.json` plus `de`, `es`, `fr`, `pt-BR`, `it` in the same PR; `npm run copy:build` regenerates `strings.*.js`; never hand-edit generated files. US spellings.
- Boundary files (`sync.js`, `pages.js`, `tab-preload.js`) need `npm run audit-inventory:write`; preload changes need `npm run browser-api:build` after `bridges.json`.
- `npm run lint` (zero warnings), `npm run test:unit`, `npm run substrate:check` must pass at the end.

## Review Focus

1. A code typed as `k7mr 4px2` or `k7mr-4px2` must join; one with `0`, `O`, `1`, `I` or `L` must be refused as invalid before any network call. (Task 1 tests `normalizeCode`.)
2. Closing the Settings sheet with Esc while a code is showing and reopening it must redisplay the same code with the remaining time, not a new code. (Task 3 `pairingState` test; Task 6 wiring reads it on open.)
3. **Connect to a different sync** while a sync pass is mid-flight must let that pass's PUT land before any DELETE and must never leave the device with no credentials: a failed wipe keeps the old sync on. (Task 3 `switchWithCode` tests.)
4. A recovery code pasted with surrounding whitespace or a trailing newline must decode; a truncated one must be `pair-invalid` with nothing stored. (Task 1 `decodeRecoveryCode` tests; Task 3 join test.)
5. Two devices in the world picking the same code within ten minutes (a 409 on POST) must simply yield a fresh code for the sender, never a shared entry. (Task 2 409 test; Task 3 retry test.)

---

### Task 1: Pairing module (pure)

**Files:**
- Create: `src/main/sync-pairing.js`
- Test: `test/unit/sync-pairing.test.js`
- Reference: `src/main/sync-crypto.js` (export `SCRYPT` if it is not exported yet; `deriveKeys`, `encrypt`, `decrypt`)

**Interfaces:**
- Produces:
  - `generateCode(randomInt = crypto.randomInt) → string` (8 chars of the alphabet)
  - `normalizeCode(input) → string | null` (null when not exactly 8 alphabet symbols after normalization)
  - `formatCode(code) → 'XXXX-XXXX'`
  - `pairingMaterial(code) → { pairId: string, wrapKey: Buffer }` (throws on a non-normalized code)
  - `wrapSecret(wrapKey, payload) → blob` / `unwrapSecret(wrapKey, blob) → payload` (uses `encrypt`/`decrypt`; `unwrapSecret` validates with `validatePayload` and throws `'pair-invalid'`)
  - `validatePayload(value) → payload` (throws `'pair-invalid'`)
  - `encodeRecoveryCode(payload) → string` / `decodeRecoveryCode(input) → payload` (throws `'pair-invalid'`); `isRecoveryCode(input) → boolean` (trimmed input starts with `blanc-sync:`)
  - `CODE_ALPHABET`, `CODE_LENGTH = 8`, `PAIR_TTL_MS = 600_000`

- [ ] **Step 1: Write the failing tests**

```js
test('generateCode draws 8 symbols from the unambiguous alphabet', ...)   // every char in CODE_ALPHABET; 200 draws never contain 0/O/1/I/L
test('normalizeCode accepts hyphen, spaces and lowercase; rejects ambiguous and short input', ...)
  // 'k7mr-4px2' → 'K7MR4PX2'; ' k7mr 4px2\n' → 'K7MR4PX2'; 'K7MR4PX' → null; 'K7MR4PX0' → null; 'K7MR4PXO' → null
test('formatCode groups 4-4', ...)                                         // 'K7MR4PX2' → 'K7MR-4PX2'
test('pairingMaterial is deterministic and code-sensitive', ...)          // same code twice equal; last char changed → different pairId AND wrapKey; pairId is 64 hex
test('pairingMaterial refuses a non-normalized code', ...)                // throws on 'k7mr-4px2'
test('wrapSecret/unwrapSecret round-trip and reject a wrong key', ...)    // payload {v:1, handle:'anthony', accountId:'a'.repeat(64), key: base64(32 bytes)}; other wrapKey → throws 'pair-invalid'
test('validatePayload rejects bad shapes', ...)                            // v:2; accountId 63 chars; key of 31 bytes; empty handle; extra fields are dropped from the return value
test('recovery code round-trips, tolerates whitespace, rejects truncation', ...)
  // encode → starts with 'blanc-sync:1:'; decode(` ${code}\n`) deep-equals payload; decode(code.slice(0, -10)) throws 'pair-invalid'; isRecoveryCode(' blanc-sync:1:x') true, isRecoveryCode('K7MR4PX2') false
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/sync-pairing.test.js`
Expected: FAIL with `Cannot find module '../../src/main/sync-pairing'`

- [ ] **Step 3: Implement `src/main/sync-pairing.js`**

No Electron import. Use `crypto.scryptSync` and `crypto.hkdfSync` exactly as `deriveKeys` does, with the salt and info strings from Global Constraints. `wrapSecret` encrypts `JSON.stringify(validatePayload(payload))`. `encodeRecoveryCode` uses `Buffer.from(JSON.stringify(payload)).toString('base64url')`.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/unit/sync-pairing.test.js`
Expected: PASS, all tests

- [ ] **Step 5: Commit**

```bash
git add src/main/sync-pairing.js test/unit/sync-pairing.test.js src/main/sync-crypto.js
git commit -m "Sync pairing: code, derivation and wrapped secret (pure module)"
```

---

### Task 2: Worker pairing route

**Files:**
- Modify: `cloudflare/sync-worker/src/index.js` (router in `fetch`, new handlers)
- Modify: `cloudflare/sync-worker/README.md` (route table)
- Test: `test/unit/sync-worker-pairing.test.js` (load the Worker the way `test/unit/sync-worker-limits.test.js` does; reuse its `storage()` fake, extended with `put` options capture so `expirationTtl` is visible)

**Interfaces:**
- Produces, on the deployed Worker:
  - `POST /v1/pair/{pairId}` body `{ blob }` → `201 {}`; `409 { error: 'exists' }`; `400 { error: 'bad blob' }`; `413 { error: 'too large' }` above 4096 request bytes
  - `GET /v1/pair/{pairId}` → `200 { blob }` and the key is deleted; `404 { error: 'not-found' }`; `429 { error: 'rate-limited' }` past 10 GETs per IP per minute
  - `DELETE /v1/pair/{pairId}` → `204`
  - `{pairId}` is `[0-9a-f]{64}`; anything else is the existing plain `404 not found`
- Consumes: nothing from other tasks (the blob is opaque to the Worker).

- [ ] **Step 1: Write the failing tests**

```js
test('POST stores pair:{id} with a 600 s TTL and answers 201', ...)       // env.puts[0].options.expirationTtl === 600
test('POST on an existing id answers 409 and leaves the entry', ...)
test('GET returns the blob once and deletes the entry', ...)             // second GET 404 with JSON body {error:'not-found'}
test('DELETE removes the entry and answers 204', ...)
test('a request over 4096 bytes is refused with 413 and nothing stored', ...)
test('the eleventh pair GET from one IP in a minute is 429', ...)        // CF-Connecting-IP header; blob routes unaffected
test('a malformed pairId falls through to the plain 404', ...)
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/sync-worker-pairing.test.js`
Expected: FAIL; every pair request currently returns the plain `404 not found`

- [ ] **Step 3: Implement the route**

Add `const PAIR_TTL_SECONDS = 600`, `PAIR_MAX_REQUEST_BYTES = 4096`, `PAIR_GET_LIMIT = 10`, `pairKey = (id) => \`pair:${id}\``, handlers `handlePairPost(env, id, body)`, `handlePairGet(env, id)`, `handlePairDelete(env, id)`. Match `/^\/v1\/pair\/([0-9a-f]{64})$/` in `fetch` **before** the blob match, after the global per-IP throttle; the pair GET additionally calls `bumpLimited(env, \`pairrl:${ip}\`, PAIR_GET_LIMIT)`. Reuse `readBoundedJson` with a parameterized cap (add an optional `maxBytes` argument defaulting to `MAX_REQUEST_BYTES`). No `console.log`, no marker touch, no new-account accounting.

- [ ] **Step 4: Run to verify they pass, and the existing Worker tests still pass**

Run: `node --test test/unit/sync-worker-*.test.js`
Expected: PASS

- [ ] **Step 5: Document the route in `cloudflare/sync-worker/README.md`** (one table row per method; note the TTL, the one-shot GET, the per-IP GET limit, and that deployment precedes the client release).

- [ ] **Step 6: Commit**

```bash
git add cloudflare/sync-worker/src/index.js cloudflare/sync-worker/README.md test/unit/sync-worker-pairing.test.js
git commit -m "Sync Worker: one-shot pairing route (POST/GET/DELETE /v1/pair)"
```

---

### Task 3: `sync.js` entry points

**Files:**
- Modify: `src/main/sync.js` (after `preflight`, before `disable`; reuse `errorCode`, `SyncError`, `tabSyncContext`, `protectSyncKey`/`unprotectSyncKey`)
- Modify: `src/main/sync-messages.js` (`ERROR_KEYS` gains `pair-not-found`, `pair-unavailable`, `pair-invalid`, `sync-on`)
- Modify: `copy/messages/en.json` (`sync.error.pairNotFound`, `sync.error.pairUnavailable`, `sync.error.pairInvalid`, `sync.error.syncOn`; translations in Task 6)
- Test: `test/unit/sync-pairing-flows.test.js` (electron stub pattern from `test/unit/sync-tab-state-ready.test.js`; the `net.fetch` fake must serve the pair route in memory and record every request in order; stub `dialog.showMessageBox` and `clipboard.writeText` in the electron export)

**Interfaces:**
- Consumes: Task 1's module; Task 2's route shape.
- Produces (all exported from `sync.js`, Personal-only):
  - `beginPairing() → Promise<{ ok: true, code, expiresAt } | { ok: false, error }>`
  - `cancelPairing() → Promise<{ ok: true }>`
  - `pairingState() → { active: boolean, code?: string, expiresAt?: number }`
  - `joinWithCode(input) → Promise<{ ok: true, status } | { ok: false, error, status }>`
  - `switchWithCode(input, { wipeRemote = false } = {}) → Promise<same shape>`
  - `copyRecoveryCode() → Promise<{ ok: true } | { ok: false, error }>`
- Internal: factor the tail of `enable()` from `syncGen += 1` through `syncNow()` into `adoptCredentials({ handle, accountId, key }) → Promise<{ ok, error }>` so `enable`, `joinWithCode` and `switchWithCode` share it (the `created` probe stays in `enable` only).

- [ ] **Step 1: Write the failing tests**

```js
test('beginPairing posts a wrapped secret under the code-derived pairId and keeps the code in memory only', ...)
  // sync.json enabled; result.code matches /^[A-Z2-9]{8}$/; the POSTed URL ends with pairingMaterial(code).pairId;
  // unwrapSecret(wrapKey, body.blob) equals { v:1, handle, accountId, key }; sync.json on disk contains no 'code' field
test('beginPairing retries a 409 with a fresh code, three times at most', ...)   // fake answers 409 twice: two distinct codes seen, third POST 201
test('pairingState resumes the live code and expiresAt; cancelPairing DELETEs and clears it', ...)
test('joinWithCode stores credentials, syncs, and the device keeps its deviceId', ...)
  // off state; GET answered with a blob wrapped for the code; afterwards sync.json enabled with the handle/accountId from the payload; a GET of /settings followed
test('joinWithCode with a wrong code is pair-not-found and stores nothing', ...)   // Worker fake 404 JSON
test('joinWithCode on an older Worker is pair-unavailable', ...)                   // plain-text 404
test('beginPairing on an older Worker is pair-unavailable and leaves no pairing state', ...)   // plain-text 404 on POST; pairingState().active === false
test('joinWithCode while enabled is sync-on', ...)
test('a pasted recovery code joins with no network request', ...)                  // ' blanc-sync:1:…\n'; requests.length === 0 until the first sync GET
test('a truncated recovery code is pair-invalid', ...)
test('switchWithCode lets an in-flight PUT land before the DELETE, then adopts the new credentials', ...)
  // reuse the deferred-fetch pattern of sync-wipe-race.test.js; order of requests: PUT (old) … DELETE (old) … GET pair … GET (new)/settings
test('switchWithCode with a failed wipe keeps the old credentials enabled and the device caches', ...)  // DELETE 503 → ok:false, error 'wipe-failed:503'; tab-sync.json devices untouched
test('switchWithCode clears tab-sync.json and tab-icons.json device maps on success', ...)
test('copyRecoveryCode writes the code to the clipboard after the dialog confirms and returns no code', ...)
  // dialog stub returns { response: 0 }; clipboard stub captured text decodes to the payload; result deepEquals { ok: true }
test('copyRecoveryCode writes nothing when the dialog is cancelled', ...)
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/sync-pairing-flows.test.js`
Expected: FAIL with `sync.beginPairing is not a function`

- [ ] **Step 3: Implement in `src/main/sync.js`**

- `let pairing = null` (`{ code, pairId, expiresAt }`), cleared by `cancelPairing`, by `disable()`, and by `app.on('before-quit')` (register in `init()`).
- `beginPairing`: require `enabled && protectedKey`, `bananifyServiceAllowed`; unprotect key; build payload; up to three `generateCode` attempts: `pairingMaterial`, `wrapSecret`, `POST`; 409 → next attempt; 201 → set `pairing`, return; any other status → `errorCode`; zero-fill the key in `finally`.
- `resolveCode(input)`: `isRecoveryCode` → `decodeRecoveryCode`; else `normalizeCode` (null → `pair-invalid`), `pairingMaterial`, `GET`; 404 with JSON `{error:'not-found'}` → `pair-not-found`; 404 otherwise → `pair-unavailable`; 429 → `rate-limited`; then `unwrapSecret`. Returns the payload with `key` as a Buffer.
- `joinWithCode`: `enabled` → `{ ok:false, error:'sync-on' }`; else `resolveCode` then `adoptCredentials`.
- `switchWithCode`: `resolveCode` first; then `disable({ wipeRemote })`; if that returns `ok:false`, return it; else `adoptCredentials`. Both device caches are already cleared by `disable()`.
- `copyRecoveryCode`: unprotect key, `encodeRecoveryCode`, `dialog.showMessageBox({ type:'warning', buttons:[t('settings.sync.recovery.copy'), t('settings.sync.recovery.cancel')], defaultId:1, cancelId:1, message, detail })` using `mainI18n`; on `response === 0` `clipboard.writeText(code)`; zero-fill and drop the string.
- `sync-messages.js`: add the four codes.

- [ ] **Step 4: Run to verify they pass, with the whole sync suite**

Run: `node --test test/unit/sync-*.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/sync.js src/main/sync-messages.js copy/messages/en.json test/unit/sync-pairing-flows.test.js
git commit -m "Sync: begin/cancel pairing, join and switch with a code, recovery code to clipboard"
```

---

### Task 4: IPC channels, preload bridge, contract, inventory

**Files:**
- Modify: `src/main/pages.js` (next to the `pages:settings:sync-*` handlers)
- Modify: `src/main/tab-preload.js` (`settings` object)
- Modify: `browser-api/bridges.json` (one entry per channel, `hosts: ["settings"]`, `returns: "unknown"`, `doc` stating what never crosses)
- Regenerate: `browser-api/generated/*` via `npm run browser-api:build`; `security/audit-surface-inventory.json` via `npm run audit-inventory:write`
- Test: existing `npm run browser-api:check`, `test/unit/audit-surface-inventory.test.js`; add to `test/unit/pages-sync-channels.test.js` (create if there is no existing pages.js channel test; pattern: require `pages.js` with the electron stub and assert handler registration and guard) one assertion that `pages:settings:sync-recovery-code-copy`'s reply equals `{ ok: true }` or an error object and never contains a `code` field.

**Interfaces:**
- Produces in the renderer (`window.bowserPages.settings`):
  - `syncPairBegin() → Promise<{ ok, code?, expiresAt?, error?, message? }>`
  - `syncPairCancel() → Promise<{ ok }>`
  - `syncPairState() → Promise<{ active, code?, expiresAt? }>`
  - `syncJoinCode(code) → Promise<syncReply(...)>` (also sets `syncMigrationCompleted` on `status.enabled === true`, like `sync-enable`)
  - `syncSwitchCode({ code, wipeRemote }) → Promise<syncReply(...)>`
  - `syncRecoveryCodeCopy() → Promise<{ ok, error?, message? }>`
- Channels: `pages:settings:sync-pair-begin`, `sync-pair-cancel`, `sync-pair-state`, `sync-join-code`, `sync-switch-code`, `sync-recovery-code-copy`.

- [ ] **Step 1: Write the failing check**

Add the six `bridges.json` entries and the six preload members first, then run:

Run: `npm run browser-api:check`
Expected: FAIL naming the channels missing from main (`pages.js` has no handler yet)

- [ ] **Step 2: Implement the handlers in `pages.js`**

Each `handle('pages:settings:…', 'settings', …)` maps straight to the Task 3 function through `syncReply` (join/switch) or passes the result through (begin/cancel/state/recovery). Coerce inputs with `String(...)` and `!!` as the siblings do.

- [ ] **Step 3: Regenerate and verify**

Run: `npm run browser-api:build && npm run browser-api:check && npm run audit-inventory:write && node --test test/unit/audit-surface-inventory.test.js test/unit/pages-sync-channels.test.js`
Expected: all PASS; `git status` shows `browser-api/generated/vectors.json` and `security/audit-surface-inventory.json` changed

- [ ] **Step 4: Commit**

```bash
git add src/main/pages.js src/main/tab-preload.js browser-api/bridges.json browser-api/generated security/audit-surface-inventory.json test/unit/pages-sync-channels.test.js
git commit -m "Settings bridge: pairing, join/switch with a code, recovery code copy"
```

---

### Task 5: Renderer models

**Files:**
- Modify: `src/renderer/pages/settings-sync-setup-model.js` (third path `code`)
- Create: `src/renderer/pages/settings-sync-pairing-model.js` (dual-environment wrapper copied from the setup model; exports `createPairingModel`, `pairingTransition`, `pairingView`, `createSwitchModel`, `switchTransition`, `switchView`)
- Modify: `copy/i18n-scope.json` (new file `guarded`)
- Test: `test/unit/settings-sync-setup-model.test.js` (extend), `test/unit/settings-sync-pairing-model.test.js` (create)

**Interfaces:**
- Setup model additions: `choose` accepts `path: 'code'`; new events `code-input { code }`, `use-passphrase` (→ `path: 'join'`, keeps token discipline), `join-code-reply { token, ok, outcome, message }`; `submit` on the `code` path emits `{ type: 'join-code', token, code }` only when `normalizeCode(code)` is non-null **or** the input is a recovery code; `view()` gains `codePath`, `codeValue`, `codeHint`, `submitLabel` = `settings.sync.setup.connect`. Validation mirrors Task 1's rules (copy `CODE_ALPHABET` and the normalization; main stays the authority).
- Pairing model: state `{ phase: 'idle'|'starting'|'showing'|'expired'|'error', code, expiresAt, notice }`; events `begin` (effect `{ type: 'pair-begin' }`), `began { ok, code, expiresAt, message }`, `resume { active, code, expiresAt }`, `tick { now }` (→ `expired` at or past `expiresAt`), `cancel` (effect `{ type: 'pair-cancel' }`), `dismiss`; `view(state, now)` → `{ showing, codeText: formatCode(code), remainingText: 'm:ss', expired, noticeText, beginVisible }`.
- Switch model: state `{ open, code, wipeRemote, phase: 'idle'|'pending', token, notice }`; events `open`, `cancel`, `code-input`, `toggle-wipe`, `submit` (effect `{ type: 'switch-code', token, code, wipeRemote }`), `switch-reply { token, ok, message }`; `view` → `{ open, submitDisabled, wipeRemote, noticeText }`.

- [ ] **Step 1: Write the failing tests**

```js
// setup model
test('choosing the code path shows one field and Connect; submit with a valid code emits join-code', ...)
test('submit with an invalid code emits nothing', ...)                   // 'K7MR4PX0'
test('a recovery code is a valid submit', ...)
test('use-passphrase moves to the join path and strands a pending reply', ...)
test('join-code-reply notFound sets the pair-not-found notice and keeps the code', ...)
// pairing model
test('begin emits pair-begin once and began shows the formatted code', ...)      // codeText 'K7MR-4PX2'
test('tick counts down and expires at expiresAt', ...)                            // remainingText '9:48' then expired
test('resume restores a live code without emitting an effect', ...)
test('cancel emits pair-cancel and returns to idle', ...)
// switch model
test('submit is disabled until the code is valid; toggle-wipe is carried in the effect', ...)
test('a stale switch-reply is ignored; a failed one keeps the panel open with the message', ...)
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/settings-sync-setup-model.test.js test/unit/settings-sync-pairing-model.test.js`
Expected: FAIL (`choose` with `code` is a no-op today; the pairing module does not exist)

- [ ] **Step 3: Implement both models** following the one-shot-effect rules in the setup model's header comment; `view()` pure; strings via `t(...)` with the keys defined in Task 6 (add the keys to `en.json` in this task so `require('./strings.en.js')` resolves them after `npm run copy:build`).

- [ ] **Step 4: Run to verify they pass**

Run: `npm run copy:build && node --test test/unit/settings-sync-setup-model.test.js test/unit/settings-sync-pairing-model.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/settings-sync-setup-model.js src/renderer/pages/settings-sync-pairing-model.js copy/i18n-scope.json copy/messages/en.json src/renderer/pages/strings.*.js test/unit/settings-sync-*.test.js
git commit -m "Settings models: code setup path, pairing panel, switch panel"
```

---

### Task 6: Settings page, copy, translations

**Files:**
- Modify: `src/renderer/pages/settings.html` (sync section: reorder the two path buttons, add the code path form `#syncCodeForm` with `#syncCode`, `#syncCodeHint`, `#syncUsePassphrase`; on state: `#syncAddDevice`, pairing panel `#syncPairing` with `#syncPairingCode`, `#syncPairingRemaining`, `#syncPairingCopy`, `#syncPairingCancel`, `#syncPairingNotice`; `#syncSwitchOpen`, switch panel `#syncSwitch` with `#syncSwitchName`, `#syncSwitchWipe`, `#syncSwitchCode`, `#syncSwitchSubmit`, `#syncSwitchCancel`, `#syncSwitchNotice`; `#syncRecoveryCopy`, `#syncRecoveryNote`); load `settings-sync-pairing-model.js` before `settings.js`
- Modify: `src/renderer/pages/settings.js` (`initSync`: wire the new DOM to the models; perform effects `join-code`, `pair-begin`, `pair-cancel`, `switch-code`; a 1 s `setInterval` only while the pairing panel shows; on `renderStatus(on)` call `syncPairState()` and dispatch `resume`)
- Modify: `src/renderer/pages/pages.css` (code display: Inter, `letter-spacing: 0.08em`, size token already used by the Patron key display; the panels reuse the visual-guide spine classes from the 2026-09-17 addendum)
- Modify: `copy/messages/en.json`, `de.json`, `es.json`, `fr.json`, `pt-BR.json`, `it.json`
- Test: `npm run copy:check`, `npm run substrate:check`; `test/unit/settings-sync-page.test.js` (create: load `settings.html` into jsdom or the repo's existing HTML-structure test pattern; assert the two path buttons' order and that `#syncPairingCode`'s text is set from `formatCode`, never from a raw code string)

**Interfaces:**
- Consumes Task 4's bridge and Task 5's models.
- Strings (English; the key list is the contract, the builder writes the prose from spec §4):
  `settings.sync.addThisDevice` "Add this device to my sync", `settings.sync.addThisDeviceHint`, `settings.sync.startOnlyFirstDevice` (the warning hint), `settings.sync.setup.codeTitle` "Enter the code from your other device", `settings.sync.setup.codeHint` "It's good for ten minutes.", `settings.sync.setup.usePassphrase` "Use my sync name and passphrase instead", `settings.sync.addAnotherDevice`, `settings.sync.pairing.instruction`, `settings.sync.pairing.expiresIn` (`{time}`), `settings.sync.pairing.copy`, `settings.sync.pairing.cancel`, `settings.sync.pairing.expired`, `settings.sync.pairing.unavailable`, `settings.sync.switch.open` "Connect to a different sync with a code", `settings.sync.switch.title` (`{name}`), `settings.sync.switch.body` (`{name}`), `settings.sync.switch.wipe` (`{name}`), `settings.sync.switch.connect`, `settings.sync.recovery.copy` "Copy recovery code", `settings.sync.recovery.dialogMessage`, `settings.sync.recovery.dialogDetail`, `settings.sync.recovery.cancel`, `settings.sync.recovery.copied` "Copied. Paste it into your password manager.", plus the four `sync.error.*` keys from Task 3.

- [ ] **Step 1: Write the failing page test** (button order; code text formatted; the pairing panel hidden by default)

Run: `node --test test/unit/settings-sync-page.test.js`
Expected: FAIL (`#syncCodeForm` not found)

- [ ] **Step 2: Add the markup and CSS**, with `data-i18n` keys on every static string.

- [ ] **Step 3: Wire `settings.js`**: dispatch DOM events into the three models; perform each effect exactly once; `performJoinCode` → `syncJoinCode`, then `renderStatus(res.status, note)` with `settings.sync.connectedTo` on success; `performSwitch` → `syncSwitchCode`, same rendering; `performPairBegin`/`performPairCancel`; the Copy button calls `navigator.clipboard.writeText(code)` for the *pairing* code only; the recovery button calls `syncRecoveryCodeCopy()` and shows `settings.sync.recovery.copied` on `ok`.

- [ ] **Step 4: Add the strings to all six catalogs** and run:

Run: `npm run copy:build && npm run copy:check && node --test test/unit/settings-sync-page.test.js`
Expected: PASS; `copy:check` reports no hard-coded English in the guarded files

- [ ] **Step 5: Relaunch the app and walk both flows by hand** (`npm start` twice is not enough; chrome documents load once, see CLAUDE.md): on one profile, Add another device shows a code and counts down; on a second dev profile (`BLANC_USER_DATA` or a second checkout), enter it and confirm the on state; then Connect to a different sync from the on state with the erase box off; then Copy recovery code and paste it into a text editor to confirm the `blanc-sync:1:` prefix. Record what you saw in the PR.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/pages/settings.html src/renderer/pages/settings.js src/renderer/pages/pages.css copy/messages src/renderer/pages/strings.*.js src/main/ublock-strings.json test/unit/settings-sync-page.test.js
git commit -m "Settings → Sync: add a device with a code, switch syncs, copy a recovery code"
```

---

### Task 7: Acceptance scenario and spec record

**Files:**
- Modify: `spec/acceptance/sync.feature` (new `@F27-8 @F27 @desktop` scenario)
- Modify: `test/desktop/` step definitions for the Settings sync card (find the file by grepping `Set up Sync`)
- Modify: `test/desktop/cucumber.mjs` `RUNNABLE` (add `@F27-8`)
- Modify: `spec/` feature register entry for F27 (one line: pairing with a code is desktop-implemented; mobile pending)

**Interfaces:** consumes the DOM ids from Task 6.

- [ ] **Step 1: Write the scenario**

```gherkin
@F27-8 @F27 @desktop
Scenario: Adding this device with a code stops at an invalid code
  Given Sync is off
  When I open Settings at Sync
  And I choose Add this device to my sync
  And I type "K7MR-4PX" into the code field
  Then Connect is disabled
  When I type "K7MR-4PX2" into the code field
  Then Connect is enabled
```

- [ ] **Step 2: Run the dry run to see the undefined steps**

Run: `npm run test:acceptance:dry`
Expected: the new steps reported undefined

- [ ] **Step 3: Implement the steps** against the Task 6 ids; no network is reached before Connect is pressed, which the scenario never does.

- [ ] **Step 4: Run the scenario**

Run: `npm run test:acceptance:desktop -- --tags @F27-8`
Expected: PASS

- [ ] **Step 5: Final gates and commit**

Run: `npm run lint && npm run substrate:check && npm run test:unit`
Expected: all PASS

```bash
git add spec test/desktop
git commit -m "Acceptance: add this device with a code (F27-8)"
```

---

### Rollout (not a code task)

1. Deploy the Worker from Task 2 with the owner's explicit go-ahead (`cloudflare/sync-worker/`, `wrangler deploy`), before any client release.
2. The release PR's site changes add the ten-minute pair entry and the pair-GET counter to the privacy page's retention list, and describe pairing on the Sync feature page only once the release is public (`docs/marketing-claims.md`).
