# Sync device pairing — add a device with a code

**Date:** 2026-10-16
**Status:** approved by the owner on 2026-10-16 (the §4.1a one-step switch and the §4.3 clipboard recovery code were the owner's decisions); implementation plan in `docs/superpowers/plans/2026-10-16-sync-device-pairing.md`
**Builds on:** [2026-07-07-profile-sync-design.md](2026-07-07-profile-sync-design.md) (the v1 protocol and Worker) and [2026-09-17-sync-discoverability-design.md](2026-09-17-sync-discoverability-design.md) (the two-path Settings flow). This document supersedes the earlier spec's non-goal "Pairing codes, QR linking": the owner asked for pairing on 2026-10-16 after a real failure, and it can be built on the v1 protocol with one additive Worker route.

## 1. Why

On 2026-10-16 the owner set up Sync on a third Mac. The Settings card asked for a sync name and a passphrase; he had forgotten that a passphrase already existed, chose **Start syncing from this device**, and made up a new one. Blanc created a second, empty account under the same name and reported success. Nothing could have caught it: the account id is derived from name *and* passphrase together, so the server has no list of names and a fresh start under an existing name is indistinguishable from a first device. The device synced happily to nothing for the rest of the day while the owner looked for the bug in the tab-sync code.

The root cause is that joining requires a secret the person has to remember, months after setting it once, and the "already set up" state lives only in their memory. The fix is to let a device that already syncs hand the secret to the new one, so joining never asks for the passphrase. Other browsers do this (Brave's sync chain shows a code or QR on an existing device; Firefox pairs by scanning a QR). The owner's devices are usually in different rooms, so the code must be something a person can carry upstairs: short enough to remember or type, valid long enough to walk there, and never dependent on a camera.

A Blanc account with a login was considered and rejected: it would make Blanc able to identify users, which the site's privacy promises rule out, and the convenience it buys (the secret lives somewhere other than memory) is exactly what pairing gives without it.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Adding a device to an existing sync takes a short code from any device that already syncs, and nothing else: no name, no passphrase, no camera.
2. The code survives a walk to another room: valid for ten minutes, eight characters from an unambiguous alphabet.
3. The Worker still cannot read sync data, learn who a person is, or link devices by anything but the opaque account id it already holds. A guessed code must be worthless.
4. The name-and-passphrase path remains, as the fallback for someone with no other device nearby, and is labelled as such.
5. A person who already syncs elsewhere is steered away from **Start syncing from this device** before they fork an account.
6. A person who has lost the passphrase and still has one synced device can save a recovery code once, so the passphrase stops mattering.

**Non-goals**

- QR codes. Nothing in Blanc today has a camera, and desktop-to-desktop scanning does not fit the owner's rooms. The pairing code's format leaves room for a QR presentation later (it is plain text).
- Device lists, remote sign-out, or revoking a device. Still the v2 protocol's job.
- Changing what syncs, how tab sharing publishes, or the blob format of any existing store.
- Merging two accounts. The mini's accidental account is abandoned, not merged; its favorites are a copy of nothing.
- Mobile. iOS and Android do not exist yet; when they do, the same code and route work, and a QR presentation can be added on top.

**Anti-goals (a failure even if it works)**

- A pairing route that lets the Worker, or anyone who can read its storage, recover a sync key. The wrapped secret must be undecryptable without the code, and the code must never reach the Worker.
- A code that can be guessed online within its lifetime, or that stays valid after use.
- A setup flow that is longer or more confusing than today's for the first device.
- Any string on the website claiming pairing before the release that ships it (`docs/marketing-claims.md`).

## 3. Constraints

- Official Electron, sandboxed renderers; every new IPC channel is Settings-page-guarded in `pages.js`, exposed through `tab-preload.js`, and recorded in `browser-api/bridges.json` (`npm run browser-api:build`).
- The sync Worker (`cloudflare/sync-worker/`) keeps its posture: opaque keys, ciphertext only, short-lived counters, no logging. A new route is additive; v1 blob routes do not change. The deployed Worker must be updated before the release that uses the route, and the client must treat a 404 on the new route from an older Worker as "pairing unavailable", never as a crash.
- `bananifyServiceAllowed()` gates the new route like every other Bananify call: renamed builds cannot pair.
- Every new string goes in `copy/messages/en.json` and all five translations in the same PR (`npm run copy:build`, `copy:check`).
- Boundary files (`sync.js`, `pages.js`, `tab-preload.js`) need `npm run audit-inventory:write`.
- US spellings.

## 4. Experience

### 4.1 On a device that already syncs: Add another device

Settings → Sync, on state, gains a primary action **Add another device** under the status list. Pressing it replaces the action with a pairing panel:

> **On your other device, open Settings → Sync and enter this code.**
> `K7MR-4PX2`
> Expires in 9:48 · Cancel

- The code is shown in Inter at large size, grouped 4-4 with a hyphen, with a **Copy** affordance (copying the plain eight characters). The countdown ticks once a second and the panel closes itself at zero with "That code expired. Make a new one when you're ready." and the **Add another device** action back in place.
- **Cancel** retracts the code immediately (the Worker entry is deleted) and restores the action.
- The panel ends on the countdown or on **Cancel**; it does not learn when the other device claims the code (a claim probe would need a route that reads without consuming, which is deferred; see §5.4). The new device appears in the other-devices list on its next tab publish, like any device.
- The panel never shows the passphrase or the sync name. It never persists the code, and the code never enters history, logs, telemetry, or crash reports.
- If the Worker refuses (rate-limited, offline, older Worker without the route), the panel shows the existing offline / rate-limited notices, or "Pairing isn't available right now. You can still connect with your sync name and passphrase." and restores the action.

### 4.1a On a device that already syncs: Connect to a different sync

The on state also gains a secondary action **Connect to a different sync with a code**, for the device that forked by accident (the mini in §1) and for anyone moving a device between syncs. The owner chose this one-step form over "turn sync off, then add" on 2026-10-16. Pressing it opens a confirmation panel in place:

> **This Mac will leave its current sync, “{name}”.**
> Your favorites and settings stay on this Mac. Other devices on “{name}” are not affected.
> ☐ Also erase “{name}”'s server copy. Only do this if no other device uses it.
> Code from your other device: `____-____`
> **Connect** · Cancel

- **Connect** is enabled once the field holds eight valid characters. It performs the switch in §5.4a. The checkbox defaults off.
- Success → the on state for the new sync, with the toast "Connected to “{new name}”. Pulling your favorites and settings now." The status list shows the new name and "Not synced yet" until the first pull lands.
- Code not found, rate-limited, offline, unavailable → the same messages as §4.2, and the device stays on its current sync untouched.
- If the erase checkbox was on and the erase fails, nothing changes: the panel shows the existing wipe-failed message and the device stays on its current sync, so the person can retry or uncheck the box.

### 4.2 On the new device: Connect with a code

The off-state card keeps its two buttons but the second one changes meaning and order:

1. **Add this device to my sync** (was "I already sync on another device"), listed first, with the hint "Get a code from a Mac that already syncs: Settings → Sync → Add another device."
2. **Start syncing from this device**, listed second, with a new hint: "Only for your first device. If you already sync elsewhere, add this device from there instead."

Choosing the first opens the visual guide from the 2026-09-17 addendum reduced to two steps:

1. **Enter the code from your other device**, one field, auto-uppercasing, accepting the hyphen or not, with the hint "It's good for ten minutes."
2. **Connect**, with the device-pair illustration.

Below the field, a quiet link: **Use my sync name and passphrase instead** opens today's join path unchanged (preflight, not-found choice, and all).

Outcomes after **Connect**:

- success → the on state, with the toast "Connected to “{name}”. Pulling your favorites and settings now." (`name` is the sync name carried inside the wrapped secret).
- code not found or expired → "That code isn't valid any more. Make a new one on your other device." The field keeps focus.
- rate-limited → the existing "Too many attempts. Wait a minute and try again."
- offline → the existing offline notice.
- Worker without the route → "Pairing isn't available right now." and the name-and-passphrase link becomes the primary action.

Tab sharing on the new device stays off, as consent is per device (tab-sync spec §3).

### 4.3 Recovery code

On any synced device, the on state's secondary actions gain **Copy recovery code**. Main shows a native confirmation dialog ("Anyone with this code can read and change your synced data. Paste it into your password manager now, and nowhere else.") with **Copy to clipboard** and **Cancel**. On confirmation main writes the code to the system clipboard itself; the Settings page then shows "Copied. Paste it into your password manager." The code is never rendered in the page and never crosses IPC outward: the renderer's `syncRecoveryCode()` returns only `{ ok }` or an error. This is the posture the 1Password broker uses for credentials (renderer-free), chosen by the owner on 2026-10-16. Blanc does not clear the clipboard afterwards; the dialog text is the mitigation.

The code is `blanc-sync:1:` followed by base64url of the plain payload defined in §5.2 (the recovery code *is* the secret, so nothing wraps it). Length is around 120 characters; it is meant to be pasted, never typed.

The **Enter the code from your other device** field (§4.2 and §4.1a) accepts a pasted recovery code too: anything beginning `blanc-sync:` is decoded in main and never sent to the Worker. The secret crosses IPC inbound here, exactly as the passphrase does on the join path today. The success toast is the same.

## 5. Design

### 5.1 Code

Eight symbols drawn with `crypto.randomInt` from the alphabet `ABCDEFGHJKMNPQRSTVWXYZ23456789` (30 symbols; no 0/O, 1/I/L). About 39 bits of entropy. Input normalization: trim, uppercase, remove hyphens and spaces; anything else is invalid before any network call.

### 5.2 Key derivation and the wrapped secret

New pure module `src/main/sync-pairing.js` (no Electron import, testable under `node --test`, like `sync-crypto.js`):

```
pairingMaterial(code)
  root     = scrypt(normalizedCode, 'blanc-pair:v1', 64, same SCRYPT params as deriveKeys)
  pairId   = hex(hkdf('sha256', root, 'blanc-pair:v1', 'blanc-pair-id/v1', 32))
  wrapKey  = hkdf('sha256', root, 'blanc-pair:v1', 'blanc-pair-key/v1', 32)
```

scrypt makes each guess cost the same as a passphrase guess today. `pairId` is what the Worker sees; `wrapKey` never leaves the device.

The wrapped secret is `encrypt(wrapKey, JSON.stringify(payload))` using `sync-crypto.js`'s AES-256-GCM, where

```
payload = { v: 1, handle, accountId, key: base64(32-byte content key) }
```

The sender obtains `key` by `unprotectSyncKey(safeStorage, protectedKey)` for the duration of the wrap and zero-fills it after, exactly as `syncNow` does. `handle` rides along only so the new device can show a sync name; it is inside the ciphertext.

### 5.3 Worker route

Additive, in `cloudflare/sync-worker/src/index.js`:

```
POST   /v1/pair/{pairId}      body { blob }   → 201, or 409 if the id exists, or 413/400
GET    /v1/pair/{pairId}                      → 200 { blob } and the entry is deleted, or 404
DELETE /v1/pair/{pairId}                      → 204
```

- `pairId` is 64 hex chars, like an account id. The KV key is `pair:{pairId}` with `expirationTtl: 600`.
- The blob is bounded (the payload is a few hundred bytes; cap the request at 4 KB).
- The GET deletes after reading. KV is not atomic, so two claims within the propagation window could both succeed; the window is seconds, the code is one person's, and the sender's panel closes on the first claim. Accepted.
- Rate limits: the existing per-IP 120/min covers all routes. Add a per-IP limit of 10 pair GETs per minute, the anti-guessing throttle: at 39 bits, ten guesses a minute for ten minutes is nothing. POST and DELETE need no extra limit beyond the global one.
- The new-account daily budget is untouched: pairing never creates an account, and the joining device's first blob reads refresh the existing account's marker as any device would.
- No new logging, counters beyond the rate limit, or metadata.

`cloudflare/sync-worker/README.md` documents the route. Unit tests live beside the existing `test/unit/sync-worker-*.test.js`.

### 5.4 Client

`src/main/sync.js` gains, Personal-only through `withLocalProfile` like `enable`:

```
beginPairing()        → { ok, code, expiresAt } | { ok: false, error }
cancelPairing()       → { ok }
pairingState()        → { active, expiresAt } (so a reopened Settings page can resume the countdown)
joinWithCode(code)    → { ok, status } | { ok: false, error }           (off state only)
switchWithCode(code, { wipeRemote })
                      → { ok, status } | { ok: false, error }           (on state, §4.1a)
copyRecoveryCode()    → { ok } | { ok: false, error }                    (§4.3; writes the clipboard itself)
```

- `beginPairing` requires `enabled` and a protected key; generates a code; derives material; wraps; POSTs; on 409 generates a new code (three tries, then `error: 'server'`); keeps `{ code, pairId, expiresAt }` in memory only. **Author's call:** the sender does not probe for the claim, because the only read route consumes the entry; a non-consuming status route can come later if the "Connected." confirmation proves wanted.
- `cancelPairing` DELETEs and clears memory. Also invoked on app quit and when Sync is disabled.
- `joinWithCode` refuses with `error: 'sync-on'` while sync is enabled (the on state uses `switchWithCode`). Otherwise it normalizes, derives material, GETs, decrypts, validates the payload shape (`v === 1`, 64-hex `accountId`, 32-byte key, non-empty `handle`), then performs the tail of `enable()` from the `protectSyncKey` step onward: bump `syncGen`, clear retries, cancel captures, store `enabled/handle/accountId/protectedKey`, flush, `refreshTabIcons`, `syncNow()`. The content key is zero-filled in `finally`. A recovery-code input (`blanc-sync:` prefix) skips the network and decodes the payload directly.
- `copyRecoveryCode` unprotects the key, builds the string, shows the native dialog, and on confirmation writes it with Electron's `clipboard.writeText`; the string and key are zero-filled or dropped immediately after. No IPC reply carries the code.

#### 5.4a `switchWithCode` — leaving one sync for another in one step

Order matters, because a PUT already on the wire cannot be recalled and the wipe must be confirmed before the old credentials go:

1. Resolve the code first (fetch and decrypt the wrapped secret, or decode a recovery code). Any failure here returns the §4.2 error and changes nothing.
2. Run the existing `disable({ wipeRemote })` barrier: `suspended = true`, bump `syncGen`, clear retries and captures, `await passSettled`, then the optional DELETE of the old account. If the wipe fails, return its error and leave the old credentials, enabled, in place; `disable()` already implements exactly this clear-vs-keep rule (`sync-wipe.js`).
3. Clear the cached device maps (`tabsync.onSyncDisabled()`, `tabicons.onSyncDisabled()`) so the old account's devices never render under the new one.
4. Store the new credentials and run the join tail from §5.4. `deviceId` and `syncTabs` survive, as they do across `disable()`/`enable()`, so the tab-sharing consent on this device is unchanged.

The implementation may compose `disable()` and the join tail rather than reimplement the barrier, as long as a failed wipe never reaches step 3.
- Error codes follow `errorCode()` and `sync-messages.js`: new codes `pair-not-found`, `pair-unavailable`, `pair-invalid`.

IPC: `pages:settings:sync-pair-begin`, `sync-pair-cancel`, `sync-pair-state`, `sync-join-code`, `sync-switch-code`, `sync-recovery-code-copy`, guarded to `settings` in `pages.js`, exposed in `tab-preload.js` as `settings.syncPairBegin()` etc., recorded in `bridges.json`. The pairing code crosses IPC to the renderer for display; the wrapped secret, the content key and the recovery code never cross IPC outward.

### 5.5 Settings renderer

The off-state reducer `settings-sync-setup-model.js` gains a third path `code` with events `code-input`, `submit` (effect `{ type: 'join-code', token, code }`), `join-code-reply` (`ok`, `notFound`, `unavailable`, `rateLimited`, `offline`, `error`), and `use-passphrase` (switches to the join path). The effect discipline from the 2026-09-17 spec holds: one-shot effects returned by transitions, `view()` pure.

The on state's pairing panel is a small separate model, `settings-sync-pairing-model.js`, with `begin`, `began`, `tick`, `cancel`, `expired`, `error`; `settings.js` wires the DOM and the one-second timer. The same model file holds the switch panel (§4.1a): `open-switch`, `code-input`, `toggle-wipe`, `submit` (effect `{ type: 'switch-code', token, code, wipeRemote }`), `switch-reply`, `cancel`. One effect per transition, `view()` pure, as above.

### 5.6 Strings

All new copy in `copy/messages/en.json` with translations. The code itself is never localized. The eight-character display groups as `XXXX-XXXX` in every language.

### 5.7 Tests

- `test/unit/sync-pairing.test.js`: derivation is deterministic, normalization, payload round trip, wrong code yields a different `pairId`, payload validation rejects bad shapes.
- Worker tests: POST/GET/DELETE lifecycle, GET deletes, 409 on reuse, TTL set, size cap, per-IP pair-GET limit.
- `test/unit/sync-join-code.test.js` under the electron stub pattern: `joinWithCode` stores credentials and triggers a sync; a 404 leaves the store untouched; an older-Worker 404 on POST maps to `pair-unavailable`.
- `switchWithCode` tests: a resolved code plus a successful barrier replaces credentials and clears both device caches; a failed wipe leaves the old credentials enabled and the caches intact; an in-flight PUT from the old account completes before the DELETE (reuse the `sync-wipe-race` pattern).
- Recovery code: `copyRecoveryCode` writes the clipboard stub and its IPC reply carries no code; a pasted `blanc-sync:` input joins without any network call; a malformed one is `pair-invalid`.
- Reducer tests for the new path and both panel models.
- `npm run browser-api:check`, `copy:check`, `audit-inventory:check`, and a desktop acceptance scenario in `spec/acceptance/` for "add this device with a code" that drives the Settings page up to the network call only. The desktop harness runs real Electron with no Worker seam (the existing Worker-dependent sync scenarios are left out of `RUNNABLE` for that reason), and adding a `BLANC_TEST` endpoint override to shipping code is out of scope; the unit tests above carry the join and safety properties. **Author's call.**
- The Worker's new 404 for a missing pair entry returns a JSON body (`{ error: 'not-found' }`), so the joiner can tell it from an older Worker's plain-text 404 (`pair-unavailable`). `pairingState()` also returns the code so a reopened Settings sheet can redisplay it. `pages:settings:sync-join-code` sets `syncMigrationCompleted` like `sync-enable`. The Worker deploy is an owner-approved step, and the release's site PR adds the ten-minute pair entry and the pair-GET counter to the privacy page's retention list. **Author's calls.**
- Accepted exposure: `pairingMaterial` uses a constant salt, so the whole code space could in principle be precomputed once (30^8 scrypt runs, thousands of CPU-years at today's parameters); the ten-minute TTL and delete-on-claim bound what such a table could ever unwrap.

## 6. Left to the builder

- Exact layout of the pairing panel and the two-step guide within the 2026-09-17 addendum's visual language.
- Whether a non-consuming status route for a "Connected." confirmation on the sender is worth adding later (§5.4 omits it).
- The recovery code's exact encoding beyond the `blanc-sync:1:` prefix, as long as it is one line, URL-safe, and self-validating.
- Whether to ship §4.3 in the same PR or a second one (it is in scope either way).

## 7. Rollout

1. Worker route deployed first (it is harmless to older clients).
2. Client PR with the Settings flow, strings, tests, bridge contract, inventory.
3. Release notes and the site's Sync page describe pairing only once that release is public.
