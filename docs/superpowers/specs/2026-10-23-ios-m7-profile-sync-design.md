# iOS M7: Profile Sync on iPhone

**Date:** 2026-10-23
**Status:** Draft for the owner's review. Nothing is built.
**Milestone:** M7 of the revised ladder
([`2026-10-21-ios-port-revisit.md`](2026-10-21-ios-port-revisit.md) §6):
"Profile Sync on iOS: pairing code, Favorites and settings, Other devices
(desktop open tabs), send a tab to a device" (F27, F9 read).
**Builds on:** M6.5 (#1030): iOS 18.4, the `bridges.json`-built
`window.bowserPages`, the virtual `strings.js`.

---

## 1. Goal

A person who already uses Profile Sync on desktop Blanc pairs their iPhone in
under a minute, and from then on:

- the phone shows their desktop's open tabs, and the desktop shows the phone's
  (when the phone shares them);
- the phone's start page and Quick Switcher include their Favorites;
- the phone follows their theme, search engine and blocking choice;
- either device can send one page to the other.

This is the companion pitch ("your Blanc, in your pocket"). It is what the
"Desktop Sync users who pair an iPhone within 60 days" indicator measures.

## 2. Scope

**In M7:**

1. **Sync on the phone:** join an existing sync with the eight-character
   device code, the recovery code, or name and passphrase; turn sync off;
   switch to another sync with a code; show a code so another device can join.
   **The phone joins only:** a sync is started on desktop (decision §9).
2. **Settings** sync both ways for the keys the phone uses (theme,
   searchEngine, adblockEnabled), and the phone carries every other synced key
   through unchanged.
3. **Favorites, read-only:** pulled and shown on the start page, the Favorites
   page and in the Quick Switcher. The phone never writes the Favorites store.
4. **Tab Sync (F27):** the phone reads every device's open tabs and, with its
   own toggle on (off by default), publishes its own. Favicons are read from the
   icons sidecar; the phone publishes none.
5. **Device names:** the phone publishes `iPhone`; the person can rename it
   from either device (the existing `deviceNames` setting).
6. **Send to device**, both ways (§7). This needs a new Worker store and
   desktop work, so it is planned separately as **M7b**, after M7a.

**Not in M7:** editing Favorites or History (M8), private tabs (M9), groups and
Spaces (M10), publishing favicons, background refresh while the app is
suspended, iCloud Keychain sharing of the key, Android.

## 3. Compatibility: byte-for-byte with desktop

The phone is a new client of the existing v1 protocol; the Worker and desktop
sync don't change for M7a. The only shared code M7a touches is two `blanc://`
pages and one bridge member, so the phone can hide what it can't do (§5). The protocol below is what desktop does today
(`src/main/sync-crypto.js`, `sync.js`, `sync-pairing.js`,
`cloudflare/sync-worker/src/index.js`). Where
`docs/superpowers/specs/2026-07-07-profile-sync-design.md` disagrees, the code
wins (its §6 scrypt line is stale).

### 3.1 Keys

- `salt = UTF8("blanc-sync:v1:" + handle.trim().toLowerCase())`.
- `root = scrypt(UTF8(passphrase), salt, N=32768, r=8, p=1, dkLen=64)`. The
  passphrase is used exactly as typed: no trim, no Unicode normalization.
- `accountId = hex(HKDF-SHA256(root, salt, info="blanc-sync-id/v1", 32))`,
  lowercase, 64 characters.
- `contentKey = HKDF-SHA256(root, salt, info="blanc-sync-enc/v1", 32)`.
- A new passphrase must pass desktop's strength rule: at least 16 characters,
  or at least 10 with two of lowercase, uppercase, digits and other. The handle
  is trimmed, at least 2 characters, and stored as typed (not lowercased).

### 3.2 Envelope

AES-256-GCM, random 12-byte IV per write, no AAD, no compression. Plaintext is
the UTF-8 of the JSON payload. Envelope `{"v":1,"iv":b64,"ct":b64,"tag":b64}`
with standard padded base64. A decrypt or JSON failure is treated as a wrong
passphrase and nothing is written.

### 3.3 Pairing and recovery

- Code: 8 symbols from `ABCDEFGHJKMNPQRSTVWXYZ23456789`, shown `XXXX-XXXX`;
  input is trimmed, uppercased, and stripped of `-` and spaces.
- `root = scrypt(UTF8(code), UTF8("blanc-pair:v1"), same params, 64)`;
  `pairId = hex(HKDF(root, salt "blanc-pair:v1", info "blanc-pair-id/v1", 32))`;
  `wrapKey = HKDF(..., info "blanc-pair-key/v1", 32)`.
- Payload `{v:1, handle, accountId, key: base64(contentKey)}`, sealed with
  `wrapKey` in the §3.2 envelope. Showing a code POSTs `{blob}` to
  `/v1/pair/:pairId` (TTL 600 s; 409 means regenerate, up to 3 tries); joining
  GETs it once. A 404 with `{"error":"not-found"}` is a wrong or expired code;
  a plain-text 404 means a Worker without pairing.
- Recovery code: `"blanc-sync:1:" + base64url-unpadded(JSON payload)`, decoded
  on the device only.
- Name and passphrase: probe `GET /v1/blob/:accountId/settings` first (200
  found, 404 new) so a mistyped passphrase doesn't silently start a second
  sync.

### 3.4 Worker

`https://blanc-sync.bnfy-441.workers.dev`, routes `GET`/`PUT
/v1/blob/:accountId/:store` (stores `bookmarks`, `settings`, `session`,
`icons`), `DELETE /v1/blob/:accountId`, and the pair routes. PUT carries
`{ifVersion, blob}`; 409 means re-pull, merge and retry, at most 3 times. Blob
≤512 KiB. Rate limits: 120 requests/min per IP, 30 GETs/min per account. A
full pass is 4 GETs, so the phone pulls at most once a minute.

### 3.5 Merge rules the phone must match

- **Settings** (`{values, meta, tieBreakers}`), per key: skip an invalid or
  zero remote clock; remote wins when its clock is greater; on a tie the
  smaller tie-breaker wins (missing = `""`), then the smaller
  `JSON.stringify(value)`. A local write stamps `max(now, previous + 1)` and a
  fresh UUID tie-breaker. Clocks are safe integers below
  `Date.UTC(3000, 0, 1)`. `deviceNames` merges entry by entry (larger `at`,
  then smaller `tie`, then smaller `name`); `meta.deviceNames` is the larger
  clock. The phone keeps every key it receives, including ones it doesn't
  understand, and exports them unchanged. **String comparisons use UTF-16 code
  units** (as JavaScript's `<`), not Swift's `String` ordering.
- **Favorites** (`{items, tombstones}`): read and merged locally only, by
  desktop's rule (union by exact URL, newer `updatedAt` wins, a tombstone
  removes an item no newer than it). The phone never PUTs this store in M7.
- **Session** (`{devices: {id: entry}}`): last writer wins per device on
  `updatedAt`; on a tie the phone's own entry wins locally, else a retraction,
  else the smaller canonical string. Entries older than 30 days are dropped.
  Canonical JSON = sorted keys, `JSON.stringify` primitives.
- **Icons**: read only and optional; same per-device rules. A failed or malformed
  sidecar keeps the last cached icons without blocking settings, Favorites or tabs.
- **When to PUT:** skip when the merged export equals the remote (canonical
  equality for session, desktop's payload equality for settings). A missing
  settings store reports `account-gone`; a store that disappears during a
  conflict retry is never recreated. Retraction does not create a missing
  session store.

### 3.6 The phone's tab snapshot

`{name: "iPhone", platform: "ios", updatedAt, tabs: [{url, title, groupId:
null, pinned: false}], groups: []}`. http(s) only, URL ≤2048, title ≤200, at
most 500 tabs, budget 320 KiB (trim the phone's own tabs from the end first,
then the stalest other devices). `updatedAt` moves only when the snapshot's
fingerprint changes or the 24-hour heartbeat is due. Turning sharing off
publishes `{retracted: true, updatedAt}`. Publishes are debounced 15 s and go
out at most 60 s after the first unpublished change.

## 4. Where it lives on the phone

- **Key storage:** the 32-byte content key, in the Keychain only:
  `kSecClassGenericPassword`, service `me.bnfy.blanc.sync`, account
  `content-key`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`,
  `kSecAttrSynchronizable` false. Never a file, `UserDefaults` or iCloud
  Keychain. The passphrase and the pairing code are never stored.
- **Sync state:** `Application Support/sync.json`: `{enabled, handle,
  accountId, deviceId, syncTabs, lastSyncedAt, lastError}`. `deviceId` is a
  lowercase UUID made once and kept across turning sync off and switching.
- **Synced data:** `sync-settings.json` (the full `{values, meta,
  tieBreakers}`), `sync-favorites.json`, `sync-session.json`,
  `sync-icons.json`. The existing `SettingsStore` stays the source for the
  three live settings; a local change stamps its clock in
  `sync-settings.json`, and a merged remote change is applied to
  `SettingsStore`.
- **Turning sync off** deletes the Keychain item and the four `sync-*.json`
  files, and (if the phone shared tabs) attempts a retraction first. The
  retraction is best-effort: offline service or a missing device-only key must
  not prevent turning sync off or switching accounts. It never
  deletes the account on the server; that stays a desktop action, so the page
  hides the "also delete synced data" controls on the phone (§5) and the
  engine refuses `wipeRemote: true` if it ever arrives.
- **Account barrier.** The engine is `@MainActor`, but work interleaves at
  every `await`, so a GET or PUT can still be in flight when the person
  switches accounts or turns sync off. To keep an old account's response out
  of the new account's cache and off its server:
  - every pass and publish runs against an **account snapshot** taken when it
    starts (`accountId`, key, generation), never against live state;
  - switching, joining, enabling and disabling **bump the generation** first,
    cancel the running pass and publish tasks, and **wait for every request
    already sent to finish** before clearing data or adopting the new account;
  - after each `await`, a pass whose generation is no longer current stops: it
    writes nothing to the local stores, applies nothing to settings and sends
    nothing further. A PUT built from one account is never sent to another.

## 5. What the person sees

- **Settings → Sync** is the desktop page's Sync section, served through the
  bridge as every `blanc://` page is: the bridge advertises a `sync`
  capability and answers `syncGet`, `syncPreflight`, `syncEnable`,
  `syncDisable`, `syncNow`, `syncTabsSet`, `syncDeviceNameSet`,
  `syncPairBegin`, `syncPairCancel`, `syncPairState`, `syncJoinCode`,
  `syncSwitchCode` and `syncRecoveryCodeCopy` (which copies to
  `UIPasteboard`) with desktop's result shapes. The section's layout on a
  phone screen is checked in the simulator, since no automated test renders
  these pages.
- **No server deletion from the phone.** The shared Settings page shows its
  "also delete synced data" checkboxes (turning off, `syncWipe`; switching,
  `syncSwitchWipe`) only when the bridge advertises a new **`syncWipeRemote`**
  capability. Desktop sends no capability list, so it keeps them; the phone
  doesn't advertise it, so they're hidden there.
- **Join only.** The page's two ways to start a new sync, the "Start a new
  sync" path (`syncPathStart`) and "Start a new sync with these" after a
  not-found check (`syncStartNew`), show only when the bridge advertises a new
  **`syncCreate`** capability, which the phone doesn't. In their place the
  phone shows "Start your sync on your computer, then add this phone with a
  code." (new catalog key `settings.sync.createOnComputer`, all six
  languages). `syncEnable` on the phone joins only: when the probe finds no
  sync it returns `ok: false` with that message and writes nothing.
- **Start page:** `start.data` returns `remoteDevices`, and the bridge emits
  `start.onRemoteTabs` after a pull changes them, so the page's Other devices
  section appears. Favorites appear where desktop shows them.
- **Favorites page, read-only:** a new bridge member
  `bookmarks.capabilities()` returns `{editable}` (desktop `true`, phone
  `false`). When it's false the shared page hides remove, move, folder rename
  and delete, import and pin controls, and shows a visible note: "Favorites
  sync from your computer. Edit them there for now." (new catalog key
  `favorites.readOnlyNote`, all six languages). The native edit methods still
  reject with `favorites.editOnComputer` as a backstop, and the page catches
  and shows any rejection from its edit handlers instead of leaving it
  unhandled.
- **Palette:** the Quick Switcher matches other devices' tabs and Favorites,
  ranked below the phone's own tabs; at rest, an **Other devices** section
  lists each device (its name, folded) below the phone's tabs. Picking a
  remote tab opens it in a new tab on the phone. It works in compact and
  regular width (the Duo's in-place panel, D30).
- **When it syncs:** on launch, when the app comes to the foreground (at most
  once a minute), on Settings → Sync → Sync now, and on publishes. Nothing runs
  while the app is suspended.
- **Errors:** wrong or expired code, wrong passphrase, rate limited, offline
  and server busy each show desktop's messages from the shared catalog.

## 6. Security

- The content key never leaves the Keychain except into memory for a pass; it
  is never logged, never in a crash report, never sent anywhere but as the
  pairing payload the person asked to create.
- The bridge's sync methods answer only `blanc://settings` (the host list in
  `bridges.json`), re-checked on the native side as today.
- The protocol's accepted limits carry over (`docs/security-assessment.md`
  R3, R5): the account locator is a bearer capability, KV writes aren't
  atomic, and the server can roll a blob back. M7 adds no new trust surface.
- No new network host: only the sync Worker.

## 7. Send to device (M7b)

- **Store:** a new Worker store, `sends`, so older desktops never touch it:
  `{devices: {<senderId>: {updatedAt, items: [{id, to, url, title,
  sentAt}]}}}`. Each device writes only its own entry, so sends never
  conflict. At most 20 items per sender, kept 7 days; http(s) only.
- **Receiving:** a device shows items whose `to` is its own id in a short
  "Sent to this device" list: on desktop in the ⌘L panel's Other devices
  drawer and on the start page; on the phone at the top of the palette and on
  the start page. Opening or dismissing one hides it on that device (kept
  locally); nothing opens by itself.
- **Sending:** desktop's tab menu **Send to Device ▸** and `/send`; the
  phone's palette and the share button on the pill.
- **Requires:** a Worker deploy (the store list and its budget), desktop UI and
  copy in all six languages, and the phone UI. Old desktops ignore the store.
- Its own plan follows M7a. **Superseded in detail** by the M7b addendum,
  [`2026-10-24-ios-m7b-send-to-device-design.md`](2026-10-24-ios-m7b-send-to-device-design.md),
  and its [plan](../plans/2026-10-24-ios-m7b-send-to-device.md); where they differ
  (presence entries, the phone sending from a pill menu), the addendum wins.

## 8. Testing

- **Known-answer vectors:** a Node script generates fixed inputs and outputs
  from desktop's own modules (key derivation, pairing material, a sealed
  envelope with a fixed IV, recovery codes, settings and session merges), and
  the Swift tests read the same file. A Node unit test fails when the file is
  stale.
- **Swift unit tests** for every pure piece (scrypt against RFC 7914's vectors
  too, HKDF, envelope, merges, canonical JSON, snapshot budget) and for the
  sync engine against a fake transport and a fake Keychain.
- **The bridge contract test** (`test/unit/ios-pages-bridge.test.js`) keeps
  passing.
- **By hand, before M7 is called done:** pair a simulator and a real iPhone
  with a packaged desktop build using each of the three join paths; see tabs
  both ways; change the theme on each side; turn sync off on the phone.

## 9. Decisions (owner, 2026-10-23)

Taken as a reviewer recommended:

1. **The phone joins only.** A sync is started on desktop; the phone hides
   both ways to start one and refuses to create one (§5). Revisit if testers
   without desktop Blanc ask for it, which the companion positioning doesn't
   expect.
2. **Favorites are visible, read-only**, on the phone's Favorites page, start
   page and Quick Switcher, with a note saying where to edit them (§5).
   Editing comes in M8.
3. **The phone publishes `iPhone`**, never the model name, and the person can
   rename it from either device (the existing `deviceNames` setting; Settings
   → Sync on the phone, or Rename Device… on desktop).
