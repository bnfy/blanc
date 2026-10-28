# Connect your iPhone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pair Blanc for iPhone with the desktop in under a minute: Sync without a passphrase on any first computer, a QR the iPhone scans, and a desktop sheet that confirms the join and asks the Spaces question.

**Architecture:** Four PRs. **D1** (desktop, device-neutral, ships in the next desktop feature release): generated accounts, the not-ready guard, the pair-link helpers, the join watch, the reworked off state and sheet, the recovery prompt, the Worker budget config. **D2** (desktop, hidden in packaged builds until Blanc for iPhone is public): the QR encoder, the QR in the sheet, **Connect your iPhone** in Settings and Finish setup. **I1** (iOS): the scanner, the pair-link parser, the reworked off state, the QR on a syncing iPhone, the ask-first view M18 will route outside links to. **S** (website-only, merged and deployed with the release that turns D2 on): the static `blanc.day/pair` page.

**Tech Stack:** Electron (castLabs ECS 44.9.3) main + sandboxed `blanc://` pages, `node --test`, Cucumber + Playwright acceptance; SwiftUI + VisionKit `DataScannerViewController` + CoreImage on iOS 18.4, XCTest; Astro site on Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-10-28-easy-iphone-pairing-design.md` (approved 2026-10-28). Read it with this plan; section numbers below (§) refer to it.

## Global Constraints

- No Worker code change. The only Worker change is `NEW_ACCOUNT_DAILY_LIMIT = "100"` in `cloudflare/sync-worker/wrangler.toml`; the owner deploys it before the D1 release ships. Agents never deploy.
- The pairing payload stays exactly `{ v: 1, handle, accountId, key }`; the recovery code format stays `blanc-sync:1:` + base64url. Nothing marks a generated account on the wire.
- The pair link is exactly `https://blanc.day/pair#` + the 8-symbol code, unhyphenated, uppercase. Parsers accept: scheme `https`, host exactly `blanc.day`, no port, no user info, path exactly `/pair`, no query, a fragment `normalizeCode` accepts (hyphen optional). Anything else is no code.
- The pairing code, the wrapped secret, the content key and the recovery code never reach a log, telemetry, crash report, history entry, page script on blanc.day, or IPC outward beyond what 2026-10-16 already allows (the code to the Settings page for display).
- Pairing stays ten minutes, one use. `beginPairing()` refuses with `not-ready` until the current account has had one successful sync pass.
- The join watch reads only `session`, through the sync scheduler, every 20 s, at most 30 reads per code, only while the sheet shows a live code and the window is focused.
- The iPhone stays join-only: no `startNew()` on iOS.
- iPhone wording, the QR, and the checklist task appear only when `isIphonePairingOffered()` is true; it's true unpackaged and false packaged while `IPHONE_PAIRING_FROM` is `null`.
- Every new string is in `copy/messages/en.json` and de, es, fr, it, pt-BR in the same PR, using the spec §10 table; `npm run copy:build` then `npm run copy:ack -- <locale> <keys>` per language; `npm run copy:check` passes.
- New `pages:settings:*` channels: guarded to `settings` in `pages.js`, exposed in `tab-preload.js`, recorded in `browser-api/bridges.json` (`npm run browser-api:build`); boundary-file edits need `npm run audit-inventory:write`.
- Don't touch `ios/Blanc/Blanc/SlashCommand.swift`, `TabsManager.swift`, `TabSets.swift` or any `Spaces*` view. Rebase I1 on M17 before merging (`project.pbxproj`).
- Site and docs changes go in their own website-only PR (S); D1/D2/I1 don't touch `site/`.
- US spellings. Merge only when every check passes on the head commit.

## Review Focus

1. **A code shown for an account the server doesn't hold.** First PUT gets `503 busy` or the Mac is offline: the sheet must stay in its start state with `notReady`, never show a code. Pinned in Task 1 (`beginPairing` refuses `not-ready`) and Task 4 (model stays in `start`).
2. **A device that joins without sharing tabs.** The phone publishes presence with `tabs: []`; the watch must still see it. Pinned in Task 3 (baseline and detection through `pairingDevices()`, with a `tabs: []` entry).
3. **Near-miss pair links.** `http://`, `www.blanc.day`, `blanc.day:443`, `user@blanc.day`, `/pair/`, `/Pair`, `?x=1`, a 7- or 9-symbol fragment, a fragment with `0`/`O`/`1`/`I`/`L`: all must yield no code on both platforms. Pinned in Task 2's shared vectors, replayed by Task 9.
4. **The camera prompt skipped.** `isAvailable` is false before access is granted; reading it first would route to the code field without ever asking. Pinned in Task 10 (`.notDetermined` requests access before reading `isAvailable`).
5. **The Spaces question asked twice.** Answering in the sheet must acknowledge the device so the Settings and start-page notices don't repeat it; closing without answering must leave it pending. Pinned in Task 4.

---

## PR D1 — Sync without a passphrase, and "{device} joined." (desktop)

Branch `claude/pairing-d1-generated-accounts` from `origin/main`.

### Task 1: Generated accounts and the not-ready guard

**Files:**
- Modify: `src/main/sync.js` (`startNew`, `beginPairing` guard, store fields, exports)
- Modify: `src/main/sync-messages.js` (map `not-ready`)
- Modify: `cloudflare/sync-worker/wrangler.toml:16`
- Test: `test/unit/sync-start-new.test.js` (new; electron stub pattern from `test/unit/sync-pairing-flows.test.js`)
- Test: `test/unit/sync-worker-config.test.js` (new, or add to an existing Worker test if one reads `wrangler.toml`)

**Interfaces:**
- Produces: `sync.startNew({ handle }) → Promise<{ ok: true, synced: boolean, status } | { ok: false, error, status }>`. `handle` is the localized default name the caller passes (`t('settings.sync.defaultName')`); `startNew` trims it and falls back to `'My Blanc'` if it's shorter than 2.
- Produces: sync store fields `origin: 'generated' | ''` (device-local) and `recoveryPromptDismissed: boolean`; both are in `status()` as `origin` and `recoveryPromptDismissed`, and `copyRecoveryCode()` success sets `recoveryPromptDismissed = true`.
- Produces: `sync.dismissRecoveryPrompt() → { ok }`.
- Produces: error code `'not-ready'` from `beginPairing()`, listed in `errorCode()`'s pass-through list and mapped in `sync-messages.js` to `settings.sync.sheet.notReady`.

- [ ] **Step 1: Write the failing tests** in `test/unit/sync-start-new.test.js`:
  - `startNew stores a random 64-hex account, a protected key and the given name`: after `startNew({ handle: 'My Blanc' })` with a stub `net.fetch` answering 200, the store has `enabled: true`, `/^[0-9a-f]{64}$/` `accountId`, `handle === 'My Blanc'`, a non-empty `protectedKey`, `origin === 'generated'`, and the reply is `{ ok: true, synced: true }`.
  - `startNew never derives keys`: spy on `sync-crypto.deriveKeys` → 0 calls.
  - `two startNew accounts differ`: disable, start again → a different `accountId`.
  - `startNew while on is sync-on` and `startNew on a renamed build is service-unavailable`.
  - `a 503 first PUT keeps Sync on and reports synced: false`: fetch answers 503 `{error:'busy'}` → store `enabled: true`, `lastError` set, reply `{ ok: true, synced: false }`.
  - `beginPairing before the first successful pass is not-ready`: after the 503 case, `beginPairing()` → `{ ok: false, error: 'not-ready' }` and no `POST /v1/pair/*` was sent; after a later successful `syncNow()`, `beginPairing()` → `ok: true`.
  - `copyRecoveryCode marks the prompt dismissed`, and `dismissRecoveryPrompt sets it`.
  - In `test/unit/sync-worker-config.test.js`: `wrangler.toml pins NEW_ACCOUNT_DAILY_LIMIT to "100"`.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/unit/sync-start-new.test.js test/unit/sync-worker-config.test.js`
Expected: FAIL (`startNew is not a function`, limit is `"10"`).

- [ ] **Step 3: Implement.** In `sync.js`, `startNew` follows `enable()`'s shape (Personal-only via `withLocalProfile`, `bananifyServiceAllowed` check, `sync-on` refusal), builds `accountId = crypto.randomBytes(32).toString('hex')` and `key = crypto.randomBytes(32)`, calls `adoptCredentials`, sets `origin = 'generated'` and `recoveryPromptDismissed = false`, zero-fills `key` in `finally`, then awaits `syncNow()` and returns `synced: res.ok`. "One successful pass on the current account" is `d.lastSyncedAt > 0` after `adoptCredentials` resets it: make `adoptCredentials` set `d.lastSyncedAt = 0` when the account changes, and have `beginPairing` refuse `not-ready` while it's `0`. Clear `origin` in `adoptCredentials` when the account changes (a joined account isn't this device's generated one). Set `NEW_ACCOUNT_DAILY_LIMIT = "100"`.

- [ ] **Step 4: Run them to verify they pass**, then the whole sync suite

Run: `node --test test/unit/sync-start-new.test.js test/unit/sync-worker-config.test.js && node --test test/unit/sync-*.test.js`
Expected: PASS, no regressions (existing joins already sync once, so `beginPairing` callers in older tests may need `lastSyncedAt` seeded; fix the fixture, not the guard).

- [ ] **Step 5: Commit**

```bash
git add src/main/sync.js src/main/sync-messages.js cloudflare/sync-worker/wrangler.toml test/unit/sync-start-new.test.js test/unit/sync-worker-config.test.js
git commit -m "Sync: start a sync without a passphrase; no pairing code before the account exists"
```

### Task 2: Pair-link helpers, shared vectors, and history without the fragment

**Files:**
- Modify: `src/main/sync-pairing.js` (add `pairLink`, `pairLinkCode`)
- Modify: `scripts/build-ios-sync-vectors.cjs` (add a `pairLinks` array)
- Modify: `ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json` (regenerated, never hand-edited)
- Modify: `src/main/history.js:30` (`addVisit` strips the fragment of a pair link)
- Test: `test/unit/sync-pairing.test.js`, `test/unit/history-pair-link.test.js` (new)

**Interfaces:**
- Produces: `pairLink(code: string) → string` (throws `pair-invalid` unless `normalizeCode(code) === code`), returning `'https://blanc.day/pair#' + code`.
- Produces: `pairLinkCode(input: string) → string | null`, the normalized code or `null`, by the Global Constraints rule (parse with `new URL`, compare `protocol`, `hostname`, `port`, `username`, `password`, `pathname`, `search` exactly; `hash.slice(1)` through `normalizeCode`).
- Produces: `vectors.pairLinks: [{ name, input, expected: string|null }]` in `sync-vectors.json`, consumed by Task 9.

- [ ] **Step 1: Write the failing tests.** In `sync-pairing.test.js`: `pairLink round-trips through pairLinkCode` for three generated codes; `pairLinkCode accepts a hyphenated fragment` (`#K7MR-4PX2` → `'K7MR4PX2'`); `pairLinkCode rejects near misses`, a table asserting `null` for each Review Focus #3 input plus `https://blanc.day/pair` (no fragment) and a non-string. In `history-pair-link.test.js`: `addVisit records a pair link without its fragment` (stored URL is `https://blanc.day/pair`), and `addVisit keeps other fragments` (`https://example.com/a#b` unchanged).

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/sync-pairing.test.js test/unit/history-pair-link.test.js`
Expected: FAIL (`pairLink is not a function`; fragment kept).

- [ ] **Step 3: Implement** both helpers and export them; in `history.js` `addVisit`, if `pairLinkCode(url)` is non-null, record `https://blanc.day/pair`. In `build-ios-sync-vectors.cjs`, emit `pairLinks` from the same table the unit test uses (move the table to `test/unit/fixtures/pair-link-cases.json` and read it from both), with `expected` computed by `pairLinkCode`.

- [ ] **Step 4: Regenerate vectors and run**

Run: `node scripts/build-ios-sync-vectors.cjs && node --test test/unit/sync-pairing.test.js test/unit/history-pair-link.test.js`
Expected: PASS; `git diff --stat` shows `sync-vectors.json` gained `pairLinks` and nothing else changed.

- [ ] **Step 5: Commit**

```bash
git add src/main/sync-pairing.js src/main/history.js scripts/build-ios-sync-vectors.cjs ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json test/unit/sync-pairing.test.js test/unit/history-pair-link.test.js test/unit/fixtures/pair-link-cases.json
git commit -m "Pairing: the blanc.day/pair link, its strict parser, shared vectors; history drops its fragment"
```

### Task 3: The join watch, content protection, and the new IPC

**Files:**
- Modify: `src/main/sync.js` (baseline in `beginPairing`, `watchPairing`, `onPairingJoined`, `pairingState().joined`)
- Modify: `src/main/main.js` (content protection and focus wiring next to `sync.onPairingShown`, `main.js:8350`)
- Modify: `src/main/pages.js` (handlers near `pages.js:585`), `src/main/tab-preload.js` (near `:280`), `browser-api/bridges.json`
- Test: `test/unit/sync-pairing-watch.test.js` (new), `test/unit/sync-pairing-ipc.test.js` (new, pages guard pattern)

**Interfaces:**
- Consumes: `startNew`, `dismissRecoveryPrompt` (Task 1).
- Produces: in `sync.js`, `beginPairing()` stores `baseline: Set<deviceId>` from `listSendTargets()` beside `{ code, pairId, expiresAt }`; `setPairingWatch(active: boolean)` (main calls it with "sheet visible and window focused"); `onPairingJoined(listener: ({ deviceId, name, platform }) => void)`; `pairingState()` adds `joined: { name, platform } | null`. `pairingDevices` stays as is.
- Produces: `onPairingCodeLive(listener: (live: boolean) => void)`, fired true when a code is shown and false on cancel, expiry, join, disable and quit, for main's `setContentProtection`.
- Produces IPC: `pages:settings:sync-start-new` (invoke, payload none; main passes `t('settings.sync.defaultName')`; sets `syncMigrationCompleted` when `status.enabled`), `pages:settings:sync-recovery-prompt-dismiss` (invoke), `pages:settings:sync-pair-watch` (invoke, `boolean`, the page reports sheet visibility), `pages:settings:sync-pair-joined` (event to the Settings page, `{ name, platform }` only). Preload: `settings.syncStartNew()`, `settings.syncRecoveryPromptDismiss()`, `settings.syncPairWatch(visible)`, `settings.onSyncPairJoined(callback)`.

- [ ] **Step 1: Write the failing tests** in `sync-pairing-watch.test.js` (fake timers, stub `net.fetch`):
  - `a presence-only new device marks the code joined`: baseline has device A; a `session` pull returns A and B with `tabs: []` → listener gets `{ deviceId: 'B', name: 'iPhone', platform: 'ios' }`, `pairingState()` is `{ active: false, joined: { name: 'iPhone', platform: 'ios' } }`, `onPairingCodeLive(false)` fired, one harmless `DELETE` sent.
  - `a known device doesn't`: pull returns only A → no event.
  - `the watch reads session every 20 s and at most 30 times`: advance 11 minutes with the watch active → exactly the `session` GETs at 20 s spacing, ≤ 30, and none for other stores from the watch.
  - `the watch takes at most 3 scheduler slots a minute`: with other classes queued, the watch's share over a 60 s window is ≤ 3.
  - `the watch stops on cancel, expiry, setPairingWatch(false) and disable`.
  - `the renamed device name wins`: a `deviceNames` entry for B → event `name` is the chosen name.
  - In `sync-pairing-ipc.test.js`: each new channel refuses a non-`settings` sender; `sync-pair-joined` payload keys are exactly `name`, `platform`; `sync-start-new` sets `syncMigrationCompleted` on success.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/sync-pairing-watch.test.js test/unit/sync-pairing-ipc.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.** The watch is a 20 s `setInterval` that, while active, calls `syncNow(['session'])` (the scheduler decides when it actually runs) and, after each settled pass, compares `listSendTargets()` ids with the baseline. In `main.js`, subscribe `sync.onPairingCodeLive(live => rt().window.setContentProtection(live))` for the window whose Settings page owns the sheet, and call `sync.setPairingWatch(false)` on that window's `blur` and `setPairingWatch(sheetVisible)` on `focus`. Forward `onPairingJoined` to the Settings page's `webContents` as `pages:settings:sync-pair-joined` with `{ name, platform }`. Add the channels and run `npm run browser-api:build`.

- [ ] **Step 4: Run tests and the contract checks**

Run: `node --test test/unit/sync-pairing-watch.test.js test/unit/sync-pairing-ipc.test.js && npm run browser-api:check && npm run audit-inventory:write && npm run audit-inventory:check`
Expected: PASS; `browser-api/generated/vectors.json` and the inventory diff contain only the new channels.

- [ ] **Step 5: Commit**

```bash
git add src/main/sync.js src/main/main.js src/main/pages.js src/main/tab-preload.js browser-api/ docs/ test/unit/sync-pairing-watch.test.js test/unit/sync-pairing-ipc.test.js
git commit -m "Pairing: the desktop notices the new device, ask-to-hide from capture while a code shows"
```

### Task 4: The off state, the sheet, the recovery prompt, and the copy

**Files:**
- Modify: `src/renderer/pages/settings.html` (off state around `:380–410`, the sheet at `:607–618`, a recovery card above `details.sync-more`)
- Modify: `src/renderer/pages/settings-sync-setup-model.js`, `settings-sync-pairing-model.js`, `settings.js`, `settings.css`
- Modify: `copy/messages/{en,de,es,fr,it,pt-BR}.json`; regenerated `src/renderer/pages/strings.*.js`
- Test: `test/unit/settings-sync-setup-model.test.js`, `test/unit/settings-sync-pairing-model.test.js`, `test/unit/settings-sync-page.test.js`

**Interfaces:**
- Consumes: the Task 3 preload calls.
- Produces (pairing model): states `beginning` → (`notReady` | `code`) → (`expired` | `joined`) → (`asking` | `done`); events `open()`, `began({ code, expiresAt })`, `began-failed({ error })` (`not-ready` → `notReady`, whose `retry` emits `begin` again), `tick`, `expired`, `joined({ name, platform })`, `question({ deviceId } | null)`, `spaces-answer('on' | 'not-now')`, `done`, `cancel`, `retry`. Effects (one per transition): `{ type: 'begin' }`, `{ type: 'watch', visible }`, `{ type: 'cancel' }`, `{ type: 'spaces-open-sheet', deviceId }`, `{ type: 'spaces-acknowledge', deviceId }`. The Sync-off start state belongs to D2 (Task 7), the only place that opens the sheet with Sync off. `view()` returns plain data (title key, body key, the code, remaining time, which buttons, the joined name), pure.
- Produces (setup model): the off state's `turn-on` event → `{ type: 'start-new' }` effect; `other-ways` disclosure state; existing `code` and passphrase paths unchanged.

- [ ] **Step 1: Write the failing tests.**
  - Pairing model: `open emits begin`; `a not-ready begin goes to notReady and retry emits begin`; `joined with a pending question goes to asking`; `spaces-answer on emits spaces-open-sheet then acknowledge`, `not-now emits acknowledge`; `done without answering emits no acknowledge`; `the empty-name fallbacks`: `{ name: 'unknown device', platform: 'ios' }` → the `yourIphone` key, `{ name: '', platform: 'linux' }` → `yourDevice`; `view() is pure` (same state, same output, no effects); `done shows the recovery line only for a generated sync whose prompt isn't dismissed`.
  - Setup model: `turn-on emits start-new`; `the passphrase start lives under other ways`.
  - Page test: the off state's first button is **Turn on Sync**; the recovery card shows only with `origin: 'generated'` and `recoveryPromptDismissed: false`; **Not now** calls `syncRecoveryPromptDismiss`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/settings-sync-setup-model.test.js test/unit/settings-sync-pairing-model.test.js test/unit/settings-sync-page.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the models, then wire `settings.js` (the sheet calls `syncPairWatch(true)` while it shows a live code and `false` otherwise; it subscribes `onSyncPairJoined`; for the question it uses the existing `shared-spaces-question` / `shared-spaces-acknowledge` channels and opens §4.6's sheet the way `settings-shared-spaces.js` does). State changes cross-fade inside a fixed-size sheet frame; under `prefers-reduced-motion` opacity only. Add every device-neutral key from spec §10 to all six catalogs: `settings.sync.off.*`, `defaultName`, `startedToast`, `recoveryPrompt.*`, and the `sheet.*` keys `addDevice`, `orType`, `newCode`, `joined`, `joinedBody`, `yourDevice`, `done`, `notReady`, `tryAgain`, plus `yourIphone`, which can show for a phone joining by typed code. The start-state and iPhone keys come in Task 7.

- [ ] **Step 4: Build copy and run**

Run: `npm run copy:build && for l in de es fr it pt-BR; do npm run copy:ack -- $l <the new keys>; done && npm run copy:check && node --test test/unit/settings-sync-*.test.js test/unit/i18n*.test.js`
Expected: PASS; `copy:check` reports no stale or missing keys.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/ copy/messages/ test/unit/settings-sync-*.test.js
git commit -m "Settings → Sync: Turn on Sync without a passphrase, the joined sheet with the Spaces question, the recovery prompt"
```

### Task 5: Acceptance, security record, and the D1 PR

**Files:**
- Create: `spec/acceptance/sync-start-without-passphrase.feature`, step definitions in `test/desktop/steps/`
- Modify: `docs/security-assessment.md` (the Profile Sync row, per spec §8)
- Modify: `spec/` feature entry for Sync if it lists setup steps (keep the parity docs truthful)

- [ ] **Step 1: Write the scenarios:** "Turn on Sync without a passphrase" (off state → **Turn on Sync** → on state shows the default name; network stubbed only as far as the existing sync scenarios go, i.e. up to the call) and "A new device joining shows in the sheet" (test hook `pairingPeer`, `main.js:15612`, inside an open sheet → the sheet reads "zzz-peer joined." and, with Shared Spaces offered and the switch off, shows the question).

- [ ] **Step 2: Run them**

Run: `npm run test:acceptance:dry && xvfb-run -a npm run test:acceptance:desktop -- --name "passphrase|joining"` (no `xvfb-run` on macOS)
Expected: PASS.

- [ ] **Step 3: Update `docs/security-assessment.md`**: generated accounts don't carry the weak-passphrase residual; the not-ready guard and the history fragment rule are controls; R3/R5 stay open. Don't list content protection as a control (spec §6.2).

- [ ] **Step 4: Full local gate**

Run: `npm run lint && npm run test:unit && npm run substrate:check && npm run browser-api:check && npm run audit-inventory:check && npm run copy:check`
Expected: all PASS.

- [ ] **Step 5: Hand check content protection** on this Mac (macOS 26) with a screen recording and a Zoom or Meet share, and on the Windows VM; record what each showed in the PR body. This is evidence, not a claim.

- [ ] **Step 6: Commit, push, open the PR** titled "Sync without a passphrase, and the sheet that says your device joined", body listing the owner's Worker deploy (`NEW_ACCOUNT_DAILY_LIMIT` 100) as a release precondition. Merge only when every check passes on the head commit.

---

## PR D2 — The QR and Connect your iPhone (desktop, hidden in packaged builds)

Branch `claude/pairing-d2-qr` from `origin/main` after D1 merges.

### Task 6: A first-party QR encoder

**Files:**
- Create: `src/renderer/pages/qr-code.js` (pure; UMD-style like the other page models so `node --test` can `require` it)
- Create: `test/unit/fixtures/qr/pair-links.json` (reference matrices)
- Create: `scripts/build-qr-fixtures.mjs` (one-time reference generation, documented, not run in CI)
- Test: `test/unit/qr-code.test.js`

**Interfaces:**
- Produces: `QrCode.encode(text: string) → { size: number, modules: boolean[][] }`: byte mode, ECC level M, the smallest version 1–4 that fits, mask chosen by the standard penalty rules; throws `RangeError` beyond version 4-M (62 bytes).
- Produces: `QrCode.svgPath(matrix, { quiet = 4 }) → string`, one `d` attribute of unit squares for an SVG `viewBox="0 0 {size+2·quiet} {size+2·quiet}"`.

- [ ] **Step 1: Generate the reference fixtures once:** `scripts/build-qr-fixtures.mjs` runs a reference encoder from a scratch install (`npx --yes qrcode@1.5.4` in the scratchpad, ECC M, byte mode, mask selection on) for five pair links plus `'A'` and a 62-byte string, and writes their module matrices. Commit the JSON, not the dependency.

- [ ] **Step 2: Write the failing tests:** `every fixture matches module for module`; `a pair link is version 3, 29 × 29`; `format bits for level M and the chosen mask are correct` (read back from the matrix); `63 bytes throws RangeError`; `svgPath has the quiet zone`.

- [ ] **Step 3: Run to verify they fail**

Run: `node --test test/unit/qr-code.test.js`
Expected: FAIL (`QrCode` undefined).

- [ ] **Step 4: Implement** the encoder (Reed–Solomon over GF(256) with generator polynomials for the needed block counts, versions 1–4 only, all 8 masks with the four penalty rules). If it doesn't match the fixtures after a focused attempt, fall back as the spec allows: vendor a pinned MIT encoder into `src/renderer/pages/`, record it in `THIRD-PARTY-NOTICES.md` and `src/THIRD_PARTY_NOTICES.txt`, and keep the same `QrCode` interface.

- [ ] **Step 5: Run to verify they pass, then commit**

Run: `node --test test/unit/qr-code.test.js`
Expected: PASS.

```bash
git add src/renderer/pages/qr-code.js scripts/build-qr-fixtures.mjs test/unit/fixtures/qr/ test/unit/qr-code.test.js
git commit -m "QR encoder for the pairing sheet: byte mode, level M, versions 1–4"
```

### Task 7: The gate, the QR in the sheet, and the entry points

**Files:**
- Modify: `src/main/main.js` (`isIphonePairingOffered`, `IPHONE_PAIRING_FROM = null`, next to `isSharedSpacesOffered`, `main.js:8178`; pass `offered` to the Settings page through `sync-get`'s status and to the start page's checklist; `openSettingsSection('sync', { pair: true })`)
- Modify: `src/main/migration-checklist.js` (the iPhone task and `iphoneTaskIntroduction`)
- Modify: `src/renderer/pages/settings.html`, `settings.js`, `settings-sync-pairing-model.js`, `settings-sync-setup-model.js`, `newtab.html`, `newtab.js`; `copy/messages/*.json`
- Test: `test/unit/iphone-pairing-offered.test.js` (new), `test/unit/migration-checklist.test.js`, `test/unit/migration-checklist-settings.test.js`, `test/unit/settings-sync-pairing-model.test.js`

**Interfaces:**
- Consumes: `QrCode` (Task 6), `pairLink` (Task 2; exposed to the page as a pure copy in the pairing model's view, since the page can't `require` main modules: put `pairLink` in a tiny shared page-side helper or compute the string in `view()` as `'https://blanc.day/pair#' + code`, asserted equal to `pairLink` in a test).
- Produces: `migrationChecklistState({ …, iphoneAvailable, iphoneComplete })` with `iphoneComplete` true once any `listSendTargets()` entry has `platform === 'ios'` (main persists `iphoneMigrationCompleted`); `iphoneTaskIntroduction(settings) → patch | null` following `defaultTaskIntroduction`'s rule.
- Produces (pairing model): the start state for a sheet opened with Sync off: `open({ syncOn: false })` → `start`; `continue` → `starting` with effect `{ type: 'start-new' }`; `started({ synced })` → `beginning` (effect `begin`) when synced, else `notReady` whose `retry` emits `start-new`; `add-this-first` → effect `{ type: 'open-code-path' }`, creating nothing. Also `view().qr` (`{ path, viewBox }` from `QrCode`) only when `offered`; the sheet's title key `settings.sync.connectIphone` when offered and Sync was off, `settings.sync.sheet.addDevice` otherwise.

- [ ] **Step 1: Write the failing tests:** `offered unpackaged`, `not offered packaged while IPHONE_PAIRING_FROM is null`, `setting IPHONE_PAIRING_FROM without site/src/data/ios-availability.json fails` (the guard test reads both); checklist `the iPhone task counts only when available`, `an introduced task keeps a retired checklist retired`, `an ios device completes it`; pairing model `open with Sync off starts in start and creates nothing` (no effect until `continue`), `continue emits start-new once`, `started synced:false goes to notReady and retry emits start-new`, `started synced:true emits begin`, `add-this-first emits open-code-path and creates nothing`, `the QR path encodes pairLink(code)`, `no QR when not offered`, `the Mac and Generic keys follow the platform`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/unit/iphone-pairing-offered.test.js test/unit/migration-checklist*.test.js test/unit/settings-sync-pairing-model.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.** The QR is an inline `<svg>` of one `<path>` filled with the sheet's ink token, 168 px, removed from the DOM on close or expiry. **Connect your iPhone** in the off state opens the sheet's start state; the checklist task opens `blanc://settings/#sync` with the sheet open (extend `SETTINGS_SECTION_FRAGMENTS` with a `sync-pair` fragment the page reads on load). Add the remaining keys from spec §10 (`connectIphone`, `sheet.scanIphone`, `sheet.startBody`, `sheet.startBodyGeneric`, `sheet.continue`, `sheet.alreadySync`, `sheet.addThisFirst`, `sheet.addThisFirstGeneric`, `newtab.checklist.iphone`) to all six catalogs and ack them.

- [ ] **Step 4: Run, and the copy and contract checks**

Run: `node --test test/unit/iphone-pairing-offered.test.js test/unit/migration-checklist*.test.js test/unit/settings-sync-*.test.js && npm run copy:build && npm run copy:check && npm run browser-api:check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ src/renderer/pages/ copy/messages/ test/unit/
git commit -m "Connect your iPhone: the QR in the sheet, Settings and Finish setup, hidden in packaged builds"
```

### Task 8: Acceptance and the D2 PR

- [ ] **Step 1: Scenario** "Add a device shows a QR and a code" and "Connect your iPhone with Sync off asks before turning it on" (unpackaged, so offered): the start state creates nothing until **Continue**; **Add this Mac with a code first** lands in the code path; after **Continue** the sheet shows an `<svg>` and the code text.
- [ ] **Step 2: Run** `npm run test:acceptance:dry && npm run test:acceptance:desktop -- --name "QR|Connect your iPhone"`. Expected: PASS.
- [ ] **Step 3: Cross-check the QR on a real iPhone** from `npm start`: the iPhone Camera app reads `https://blanc.day/pair#…` from the sheet in light and dark themes. Record it in the PR body.
- [ ] **Step 4: Full local gate** (as Task 5 Step 4). Commit, push, open "Connect your iPhone: the QR and the entry points (hidden until the iPhone app ships)". Merge only when every check passes on the head commit.

---

## PR I1 — Pair with your Blanc (iOS)

Branch `claude/pairing-i1-scanner` from `origin/main` after D1 merges (it reads D1's vectors). Rebase on M17 before merging.

### Task 9: `PairLink` and the shared vectors

**Files:**
- Create: `ios/Blanc/Blanc/Sync/PairLink.swift`
- Modify: `ios/Blanc/BlancTests/Sync/SyncVectors.swift` (decode `pairLinks`)
- Test: `ios/Blanc/BlancTests/Sync/PairLinkTests.swift`

**Interfaces:**
- Produces: `enum PairLink { static func code(from string: String) -> String?; static func code(from url: URL) -> String?; static func link(for code: String) -> URL? }`, the Global Constraints rule, using `URLComponents` (`scheme`, `host`, `port`, `user`, `password`, `path`, `query`, `fragment`) and `SyncPairing.normalize`.

- [ ] **Step 1: Write the failing test** `testSharedPairLinkVectors`: for every `vectors.pairLinks` entry, `PairLink.code(from: input) == expected`; plus `testLinkRoundTrips` for three `SyncPairing.generateCode()` values.
- [ ] **Step 2: Run** `xcodebuild test -project ios/Blanc/Blanc.xcodeproj -scheme Blanc -destination 'platform=iOS Simulator,id=<a simulator this session created>' -only-testing:BlancTests/PairLinkTests` (create your own simulator; the M17 and M7b sessions own theirs). Expected: FAIL (no `PairLink`).
- [ ] **Step 3: Implement** `PairLink.swift` and add it to the target.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS: the pair link parser, checked against desktop's vectors"`.

### Task 10: The scanner, the off state, and the QR on a syncing iPhone

**Files:**
- Create: `ios/Blanc/Blanc/PairScannerView.swift` (the `UIViewControllerRepresentable`, its coordinator and the permission flow)
- Create: `ios/Blanc/Blanc/PairWithBlancView.swift` (the §7.1 action, the scanner sheet, **Other ways to join**; M18 embeds this)
- Create: `ios/Blanc/Blanc/PairLinkConfirmView.swift` (the ask-first sheet for links from outside Blanc, plus `static func route(_ url: URL) -> String?` for M18's `onOpenURL`)
- Modify: `ios/Blanc/Blanc/SyncSettingsView.swift` (off state uses `PairWithBlancView`; `PairDeviceSettingsView` shows a QR via `CIQRCodeGenerator`, `inputCorrectionLevel = "M"`)
- Modify: `ios/Blanc/Blanc/HistoryStore.swift:48` (`addVisit` drops a pair link's fragment)
- Modify: `ios/Blanc/Blanc.xcodeproj/project.pbxproj` (`INFOPLIST_KEY_NSCameraUsageDescription` and its localization; new files)
- Modify: `copy/messages/*.json` (the `ios.settings.*` and `ios.pair.*` keys from spec §10)
- Test: `ios/Blanc/BlancTests/PairScannerTests.swift`, `ios/Blanc/BlancTests/HistoryStoreTests.swift`, `ios/Blanc/BlancTests/NativeSettingsTests.swift`, a UI test in `ios/Blanc/BlancUITests/`

**Interfaces:**
- Consumes: `PairLink` (Task 9); `SyncEngine.joinWithCode(_:)`, `switchWithCode(_:)` (unchanged).
- Produces: `final class PairScanCoordinator` with an injectable `authorization: () -> AVAuthorizationStatus`, `requestAccess: () async -> Bool`, `isSupported: Bool`, `isAvailable: () -> Bool`, and `func start() async -> PairScanRoute` where `enum PairScanRoute { case scanner, codeField, denied }`; `func recognized(_ payload: String) -> PairScanResult` where `enum PairScanResult { case join(code: String), ignore }`, returning `.join` at most once per presentation.

- [ ] **Step 1: Write the failing tests** (`PairScannerTests`): `testNotDeterminedRequestsAccessBeforeReadingAvailability` (the stub records call order: `requestAccess` before `isAvailable`); `testDeniedAndRestrictedRouteToDenied`; `testUnsupportedRoutesToCodeField`; `testMatchingPayloadJoinsOnce` (two recognitions of the same link → one `.join`); `testOtherQRIsIgnored`; `testOutsideLinkAsksBeforeAnyNetwork` (`PairLinkConfirmView.route` returns the code, and the engine stub sees no call until **Pair**); `HistoryStoreTests.testPairLinkRecordedWithoutFragment`; `NativeSettingsTests.testOffStateLeadsWithPairWithBlanc` (no "start a new sync" anywhere); `testSyncingPhoneShowsQRForLiveCode` (the generated image decodes back with `CIDetector(ofType: CIDetectorTypeQRCode)` to `PairLink.link(for:)`).
- [ ] **Step 2: Run** `xcodebuild test … -only-testing:BlancTests/PairScannerTests -only-testing:BlancTests/HistoryStoreTests -only-testing:BlancTests/NativeSettingsTests`. Expected: FAIL.
- [ ] **Step 3: Implement.** The scanner sheet is `DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced, recognizesMultipleItems: false, isHighlightingEnabled: true)`. On `.join`: `UINotificationFeedbackGenerator().notificationOccurred(.success)`, the "Connecting…" label, and `stopScanning()` in the same main-actor turn. Non-matches show `ios.pair.notBlanc` for 2 s. Under Reduce Motion, state swaps use `.transition(.opacity)`. The camera string is the `ios.pair.cameraUsage` text in each language; pick the localization mechanism the generated Info.plist supports (an `InfoPlist.xcstrings` with the six languages is the expected one) and add a substrate check, or a unit test in `test/unit/`, that it matches `copy/messages`.
- [ ] **Step 4: Run** the unit tests again, then the UI test (`-only-testing:BlancUITests/…`), which asserts that the off state shows **Pair with your Blanc**, that on the simulator (no camera) it lands on the code field, that **Other ways to join** reaches the code, recovery and passphrase paths, and that a seeded join succeeds. Expected: PASS. Then `npm run copy:check`.
- [ ] **Step 5: Commit** `git commit -m "iOS: Pair with your Blanc: scan the desktop's code, the ask-first link sheet, the QR on a syncing iPhone"`.
- [ ] **Step 6: Real iPhone check** (the owner's iPhone Air, Debug build, per the keep-the-phone-updated rule): scan the D2 sheet from `npm start`; first-run camera prompt appears; deny → Open Settings; Reduce Motion on. Record it in the PR body. Push, open "iOS: Pair with your Blanc", merge when every check passes on the head commit.

---

## PR S — The `blanc.day/pair` page (website-only; merge and deploy with the release that sets `IPHONE_PAIRING_FROM`)

### Task 11: A static page with no scripts

**Files:**
- Create: `site/src/pages/pair.astro` (a layout variant with no `<script>`, no analytics, no chat; text per spec §7.3; the App Store link only once the iPhone app is public)
- Modify: `site/public/_headers` (a `/pair` block: `! Content-Security-Policy` then a policy with `script-src 'none'`, `connect-src 'none'`, `frame-src 'none'`, `img-src 'self' data:`, `style-src 'self' 'unsafe-inline'`, `font-src 'self'`, and `Referrer-Policy: no-referrer`)
- Test: `test/site/pair-page.test.mjs`

- [ ] **Step 1: Write the failing test:** the built `/pair/index.html` contains no `<script`, no `googletagmanager`, `cloudflareinsights` or `crisp`; `_headers` has a `/pair` block whose CSP contains `script-src 'none'`; the page is `noindex` and absent from the sitemap.
- [ ] **Step 2: Run** the site test command from `site/CLAUDE.md`. Expected: FAIL.
- [ ] **Step 3: Implement** the page and the headers block.
- [ ] **Step 4: Run** the site build and the test. Expected: PASS.
- [ ] **Step 5: Commit, open a website-only PR**, mark it "merge with the iPhone-wording release"; deploy only as part of that release's site steps.

---

## Release notes (not tasks in these PRs)

- **Before the D1 release:** the owner deploys the Worker config (`NEW_ACCOUNT_DAILY_LIMIT` 100) from `cloudflare/sync-worker/`. The release's notes describe "Sync without a passphrase" and "your new device appears in the sheet"; the website's Sync page changes only after that release is public.
- **The release that ships with Blanc for iPhone:** its prep PR sets `IPHONE_PAIRING_FROM`, adds `site/src/data/ios-availability.json`, and lands PR S; its What's New page may mention the QR only then.
- **M18:** routes `onOpenURL` through `PairLinkConfirmView.route(_:)` before anything else sees the URL, and embeds `PairWithBlancView` as walkthrough step 2 (spec §7.4).
