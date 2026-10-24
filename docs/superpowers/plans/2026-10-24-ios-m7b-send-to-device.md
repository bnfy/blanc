# M7b: Send to Device Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any syncing Blanc device can send the page it's on to one of the account's other devices, where it waits in a **Sent to this device** list until opened or dismissed.

**Architecture:** A new optional sync store, `sends`, in which each device writes only its own entry (presence plus up to 20 items). The rules are one pure desktop module, `src/main/sends-model.js`, with a Swift port checked against vectors generated from it, as in M7a. Desktop's sync engine treats the store like `icons` (optional until the Worker serves it), pulls it with the focus refresh, and PUTs at once on send. Both clients show the inbox in the places that already show Other devices.

**Tech Stack:** Node 22 (desktop main, `node --test`), Electron 44 renderers, Cloudflare Worker (KV), Swift 5 / SwiftUI / XCTest.

**Spec:** `docs/superpowers/specs/2026-10-24-ios-m7b-send-to-device-design.md` (the addendum; section numbers below refer to it). It replaces `2026-10-23-ios-m7-profile-sync-design.md` §7 in detail.

**Builds on:** M7a, merged as `71490797e` (#1068). The real-iPhone check for M7a is still open and remains a gate before any TestFlight build; it does not block this work.

## Global Constraints

- Base: `main` at or after `e8ee5730c`. One branch and PR per group of tasks: **PR A** (Tasks 1–3: model, Worker, desktop store), **PR B** (Tasks 4–7: desktop surfaces), **PR C** (Tasks 8–10: iOS), **PR D** (Tasks 11–12: deploy, by-hand checks, records). PR A merges first; B and C can proceed in parallel after it.
- **No client offers sending before the Worker serves `sends`** (§9). Desktop and iOS UI may merge before the deploy because every send to an older Worker reports "Sending isn't available yet." (§6), but no desktop release containing PR B ships until Task 11's deploy has run. Deploying is the owner's action; ask before `wrangler deploy`.
- The limits are fixed (§3): http(s) only, URL ≤2048 UTF-16 units, title ≤200, name ≤80, ≤20 items per sender (newest kept), item expiry 7 days after `sentAt`, entry pruning after 30 days without `updatedAt`, presence heartbeat at most once a day, store budget 64 KiB of canonical JSON, dismissed ids kept 8 days.
- Ties reuse tab sync's rule (`tabsync-model.js` `winner`): own entry wins locally, then the smaller canonical string compared by UTF-16 code units. Swift compares `Array(s.utf16)`, never `String <`.
- No device writes another device's entry. Opening and dismissing are local (§2.5).
- Private tabs never send; the send controls are absent in them (§2.6).
- No new request timer: `sends` joins desktop's `refreshSession` and the phone's pass (§7).
- Copy: every new string lands in `copy/messages/*.json` for all six languages (en, de, es, fr, pt-BR, it) in the same PR, acknowledged with `npm run copy:ack -- <locale> <keys>`, then `npm run copy:build` and `npm run copy:check`. Never hand-edit `strings.*.js`.
- Bridge changes: `browser-api/contract.json` and/or `bridges.json` change with `preload.js`/`tab-preload.js` and the `pages.js` handler hosts together; run `npm run browser-api:build` and commit `browser-api/generated/vectors.json`; then `npm run audit-inventory:write` if a boundary file's hash moved.
- Slash-command copy: `copy/slash-commands.json`, overlay `COMMANDS`, main `SLASH_COMMANDS` and `pages/shortcuts.js` change together; `npm run substrate:check` must pass.
- iOS test command (run in the background):
  `cd ios/Blanc && xcodebuild test -project Blanc.xcodeproj -scheme Blanc -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:BlancTests/<Class> CODE_SIGNING_ALLOWED=NO`
  Expected on pass: `** TEST SUCCEEDED **`. Hand checks that need the Keychain build with default signing (M7a lesson: `CODE_SIGNING_ALLOWED=NO` breaks Keychain writes in the simulator).

## Review Focus

- **An older Worker (`404 unknown store`):** a send must say "Sending isn't available yet." and leave nothing in the local entry; a pass must not set `lastError` or `lastSyncedAt` and must not create an empty blob. Pinned in Task 3 (`send reports unavailable on unknown store`, `pass ignores unknown sends store`) and Task 9 (`testSendOnOldWorkerReportsUnavailable`, `testPassWithoutSendsStoreKeepsStatus`).
- **A device that doesn't share its tabs** must still be a send target through its presence entry. Pinned in Task 1 (`targets include presence-only devices`) and Task 3.
- **Dismissed items never come back** after relaunch, a re-pull or a 409 retry, and the list is cleared on account switch or sync off. Pinned in Task 3 (`dismissed ids survive reload`, `disable clears sends and dismissed`) and Task 9 (`testDismissSurvivesRepull`, `testSwitchAccountClearsInbox`).
- **Caps and expiry at the boundary** (item 20 vs 21, `sentAt` exactly 7 days old, entry exactly 30 days stale): desktop and phone must agree. Pinned by `sendsMerge` vectors in Task 1, replayed in Task 8.
- **The rate budget:** the focus refresh stays one pass of 4 GETs; sending is one PUT and at most 3 conflict retries. Pinned in Task 3 (`refreshSession pulls four stores once`).
- **Private tabs:** no tab-menu item, no `/send`, no pill button. Pinned in Tasks 5, 6 and 10.

---

## PR A: the store

### Task 1: Pure model and vectors

**Files:**
- Create: `src/main/sends-model.js`
- Create: `test/unit/sends-model.test.js`
- Modify: `scripts/build-ios-sync-vectors.cjs` (new sections), `ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json` (regenerated)

**Interfaces:**
- Produces (no `require('electron')`):
  - Constants `MAX_ITEMS = 20`, `ITEM_TTL_MS = 7 * 864e5`, `ENTRY_TTL_MS = 30 * 864e5`, `HEARTBEAT_MS = 864e5`, `DISMISS_TTL_MS = 8 * 864e5`, `BUDGET_BYTES = 64 * 1024`, `MAX_URL = 2048`, `MAX_TITLE = 200`, `MAX_NAME = 80`.
  - `sanitizeItem(raw, now) → item | null` (http(s) only via `new URL`, lengths truncated in UTF-16 units as `tabsync-model.js` `sanitizeTab` does, `id` a non-empty string ≤64, `to` a non-empty string, `sentAt` finite and not expired).
  - `sanitizeEntry(raw, now) → entry | null` (name, platform in `darwin|win32|linux|ios`, `updatedAt` finite > 0, items sanitized, deduplicated by id, newest `MAX_ITEMS` kept).
  - `ownEntry(previous, {name, platform}, now, {force}) → {entry, changed}` (refreshes `updatedAt` only when `force` or `now - updatedAt ≥ HEARTBEAT_MS`, drops expired items).
  - `addItem(entry, {url, title, to}, ownId, now, makeId) → {entry, item} | {error: 'invalid' | 'self'}`.
  - `mergeDevices(local, remote, ownId, now) → devices` (per-device winner via the imported `winner`/`canonical` from `tabsync-model.js`, prune entries older than `ENTRY_TTL_MS` except own).
  - `applyBudget(devices, ownId) → devices` (drop stalest other entries until `canonical(...)` ≤ `BUDGET_BYTES`).
  - `inbox(devices, ownId, dismissed, now) → [{id, url, title, sentAt, fromId, fromName}]` (unexpired, `to === ownId`, minus dismissed ids, newest first, at most 20).
  - `targets(sendsDevices, sessionDevices, ownId, deviceNames) → [{id, name, platform, updatedAt}]` (union by id, own excluded, newest first, name from `deviceNames[id].name` when set).
  - `pruneDismissed(dismissed, now) → dismissed` (`{id: dismissedAt}`, older than `DISMISS_TTL_MS` dropped).

- [ ] **Step 1: Write the failing tests** in `test/unit/sends-model.test.js`: `rejects non-http urls`, `truncates url and title in utf-16 units` (a title of 199 ASCII + one emoji), `keeps the newest 20 items`, `drops items at exactly 7 days`, `prunes other entries at exactly 30 days but never own`, `heartbeat refreshes once a day`, `addItem refuses self`, `merge tie: own wins, then smaller canonical`, `budget drops stalest others first`, `inbox excludes dismissed and other recipients`, `targets include presence-only devices`, `targets use synced device names`.
- [ ] **Step 2: Run** `node --test test/unit/sends-model.test.js`. Expected: fails (module missing).
- [ ] **Step 3: Implement** `sends-model.js`, reusing `canonical` and `winner` from `tabsync-model.js` (export `winner` there if it isn't already; keep its behavior byte-identical).
- [ ] **Step 4: Run** the test again. Expected: all pass. Run `node --test test/unit/tabsync-model*.test.js` too (no change).
- [ ] **Step 5: Add vector sections** `sendsMerge` (the boundary cases above, an equal-clock tie with non-BMP names), `sendsInbox` and `sendsTargets` to `scripts/build-ios-sync-vectors.cjs` (declared beside the existing sections at its top); run `npm run ios:sync-vectors:build`, then `node --test test/unit/ios-sync-vectors.test.js`. Expected: 1 pass.
- [ ] **Step 6: Commit:** `sync(m7b): pure Send to device model and vectors`.

### Task 2: The Worker serves `sends`

**Files:**
- Modify: `cloudflare/sync-worker/src/index.js` (`STORES` at L8), `cloudflare/sync-worker/README.md` (store list, a deploy note that clients from M7b on expect it)
- Modify: `test/unit/sync-worker-limits.test.js`, `test/unit/sync-worker-budget.test.js`, `test/unit/sync-worker-backfill.test.js`

**Interfaces:**
- Produces: `GET/PUT /v1/<account>/sends` with the same envelope, version and 512 KiB rules as every store; account `DELETE` removes it (`handleDelete` iterates `STORES`, so this follows).

- [ ] **Step 1: Write the failing tests:** `sends is a known store` (PUT then GET round-trips), `account delete removes sends`, and update any test that enumerates the store list.
- [ ] **Step 2: Run** `node --test test/unit/sync-worker-*.test.js`. Expected: the new tests fail with `unknown store`.
- [ ] **Step 3: Add `'sends'` to `STORES`** and the README list.
- [ ] **Step 4: Run** the tests again. Expected: pass.
- [ ] **Step 5: Commit:** `sync-worker(m7b): serve the sends store`. Do **not** deploy; that is Task 11.

### Task 3: Desktop store, optional descriptor and sending

**Files:**
- Create: `src/main/sends.js`, `test/unit/sync-sends.test.js`
- Modify: `src/main/sync.js` (descriptor beside `icons` at L126–143, `refreshSession` at L843–852, disable at L566–625, a new export `sendTab`)
- Modify: `test/unit/sync-optional-icons.test.js` only if it enumerates descriptors

**Interfaces:**
- Consumes: `sends-model.js`; `tabSyncContext()` (L85–94) for own id and name; `settings` for `deviceNames`; `tabsync` for session devices.
- Produces:
  - `sends.js`: a `JsonStore` `sends.json` holding `{accountId, devices, dismissed}`; `load()`, `devicesFor(accountId)`, `replace(accountId, devices)`, `dismiss(id, now)`, `markOpened(id, now)`, `clear()`, `inbox(now)`, `targets(now)`, and an `onChange(fn)` hook.
  - A `sends` store descriptor marked optional like `icons`: export merges own entry (`ownEntry` with heartbeat), import runs `mergeDevices` + `applyBudget`; a GET or PUT answering `404 unknown store` ends that store's step silently without `lastError`/`lastSyncedAt` changes, and an empty `sends` blob is never created on such a Worker (`syncOne` L633–680 already returns early for an optional 404; keep that path).
  - `sync.sendTab({url, title, to}) → Promise<{status: 'sent' | 'unavailable' | 'failed' | 'invalid'}>`: adds the item, PUTs at once (bypassing `TAB_PUBLISH_DEBOUNCE_MS`), on 409 re-pulls, merges and retries up to 3 times; `unavailable` removes the item from the local entry; `failed` (offline, 429, 5xx, retries exhausted) leaves it out too.
  - `refreshSession` pulls `['session', 'icons', 'settings', 'sends']` in one pass.
  - Disable and account switch (`switchWithCode` goes through `disable`): a best-effort, 5 s-bounded retraction of the own entry (`retractSends`, never creating the store), then `sends.onSyncDisabled()`.

- [ ] **Step 1: Write the failing tests** with the in-memory Worker fake the existing sync tests use: `send puts at once and reports sent`, `send retries a 409 and keeps the other device's entry`, `send reports unavailable on unknown store` (local entry has no item afterwards), `send reports failed offline`, `pass ignores unknown sends store` (status unchanged, no PUT of an empty blob), `presence heartbeat publishes once a day`, `refreshSession pulls four stores once`, `dismissed ids survive reload`, `disable clears sends and dismissed`, `switching accounts never shows the old inbox`.
- [ ] **Step 2: Run** `node --test test/unit/sync-sends.test.js`. Expected: fails.
- [ ] **Step 3: Implement** `sends.js` (JsonStore pattern from `tabsync.js`) and the `sync.js` changes.
- [ ] **Step 4: Run** `node --test test/unit/sync-*.test.js test/unit/sends-model.test.js`. Expected: all pass.
- [ ] **Step 5: Run** `npm run test:unit` and `npm run lint`. Expected: no new failures or warnings.
- [ ] **Step 6: Commit:** `sync(m7b): desktop sends store and sendTab`. Open **PR A**.

---

## PR B: desktop surfaces

### Task 4: Bridge contracts

**Files:**
- Modify: `src/main/preload.js`, `src/main/tab-preload.js`, `src/main/main.js` (`chromeHandle` registrations), `src/main/pages.js` (start hooks and `start.data`)
- Modify: `browser-api/contract.json`, `browser-api/bridges.json`, `browser-api/generated/vectors.json` (generated)

**Interfaces:**
- Produces on `window.browserAPI` (chrome window and overlay only):
  - `listSendTargets() → Promise<SendTarget[]>`, `SendTarget = {id, name, platform}`
  - `sendTabToDevice(tabId, deviceId) → Promise<{status}>` (main resolves the tab's URL and title itself; renderers never pass a URL; refuses private tabs with `{status: 'invalid'}`)
  - `listSentToThisDevice() → Promise<SentItem[]>`, `SentItem = {id, url, title, sentAt, fromName}`
  - `onSentToThisDeviceUpdated(cb)` (event `sends:updated`, payload `SentItem[]`)
  - `openSentItem(id)` (opens a normal tab, marks opened), `dismissSentItem(id)`
- Produces on `bowserPages` for the start page: `start.onSentItems(cb)`, `start.openSent(id)`, `start.dismissSent(id)`; `start.data` gains `sentItems` (the field is unpinned because `start.data` returns `unknown`, but the hosts list in `bridges.json` must equal `pages.js`'s).

- [ ] **Step 1: Add the contract entries** (types `SendTarget`, `SentItem`, the `status` union `sent | unavailable | failed | invalid`) and the preload members.
- [ ] **Step 2: Run** `npm run browser-api:check`. Expected: fails until main registers the handlers.
- [ ] **Step 3: Register** the `chromeHandle` handlers and the `pages.js` handlers (sender-verified as the existing `start.*` ones are), and broadcast `sends:updated` to strip and overlay from the `sends.onChange` hook, rebinding the window runtime as other async broadcasts do.
- [ ] **Step 4: Run** `npm run browser-api:build`, `npm run browser-api:check`, `npm run audit-inventory:write`. Expected: check passes; commit the vectors diff.
- [ ] **Step 5: Commit:** `browser-api(m7b): Send to device bridge members`.

### Task 5: Tab menu **Send to Device ▸**

**Files:**
- Modify: `src/main/tab-context-menu-model.js` (a `buildSendSubmenu` beside `buildSplitSubmenu` at L49; the item in `buildTabContextMenu` at L87), `src/main/tab-context-menu.js` (`runTabContextMenuItem` L17–52, `toElectronTemplate` L55–77), `src/main/main.js` (`tabContextData` L11629 gains `sendTargets`)
- Modify: `test/unit/tab-context-menu-model.test.js`
- Modify: `copy/messages/*.json` (`tabMenu.sendToDevice`, `sends.none`)

**Interfaces:**
- Produces: item ids `send-to-device:${deviceId}`; with no targets, one disabled item "No other devices"; the whole submenu omitted for private tabs, internal `blanc:` pages and non-http(s) tabs, and when sync is off.

- [ ] **Step 1: Write the failing model tests:** `send submenu lists targets`, `send submenu disabled with no other devices`, `no send submenu for private tabs`, `no send submenu when sync is off`, `no send submenu for blanc pages`.
- [ ] **Step 2: Run** `node --test test/unit/tab-context-menu-model.test.js`. Expected: new tests fail.
- [ ] **Step 3: Implement** the model and runner; the runner calls `sync.sendTab` and shows the result in the active window's chrome status (`chrome:glance-status`, the channel `announceSplit` uses) with `sends.sent`, `sends.unavailable` or `sends.failed`.
- [ ] **Step 4: Add copy** to all six languages, `copy:ack`, `copy:build`, `copy:check`.
- [ ] **Step 5: Run** the tests again and `npm run substrate:check`. Expected: pass.
- [ ] **Step 6: Commit:** `desktop(m7b): Send to Device tab menu`.

### Task 6: ⌘L drawer inbox and `/send`

**Files:**
- Modify: `src/renderer/overlay.js` (remote section L1219–1312, `renderDevicesDrawer` L2572–2593, `listRemoteTabs` L3754–3767, `onRemoteTabsUpdated` L3801, `COMMANDS` L1357–1422), `src/renderer/styles.css`
- Modify: `src/main/main.js` (`SLASH_COMMANDS` L11250–11281), `src/renderer/pages/shortcuts.js` (L6–36), `copy/slash-commands.json`
- Modify: `copy/messages/*.json` (`sends.section`, `sends.from`, `sends.dismiss`, `sends.sent`, `sends.unavailable`, `sends.failed`, `sends.noMatch`, `slash.send.hint`, `slash.send.doc`)
- Create: `spec/acceptance/send-to-device.feature`, `test/desktop/steps/send-to-device.steps.js`
- Modify: `src/main/test-hook.js` (an `injectSentItems(items)` beside `injectRemoteDevices` at L3361, and a fake Worker result switch for `sendTab`)

**Interfaces:**
- Produces: a **Sent to this device** group first in the Other devices drawer (rows: placeholder favicon, title, "From {device} · {time}", a × with `aria-label` from `sends.dismiss`); the footer Devices button shows when `remoteDevices.length || sentItems.length` and carries the inbox count. `/send <device>` uses the `/group` argument pattern (`commandArgument`/`promptCommand`), matches device names without regard to case, and reports through `commandNotice`: `sends.sent`, `sends.unavailable`, `sends.failed`, `sends.none`, or `sends.noMatch`. `/send` is hidden from the command list in private tabs.

- [ ] **Step 1: Write the scenarios** (tagged into the `runnable` profile): `Sent pages show in the Other devices drawer`, `Opening a sent page opens a tab and hides it`, `Dismissing a sent page hides it after relaunch`, `/send with no other devices says so`, `/send to an older Worker says sending isn't available`, `Private tabs offer no /send`.
- [ ] **Step 2: Run** `npm run test:acceptance:dry`. Expected: undefined steps.
- [ ] **Step 3: Implement** the drawer group (styles in `styles.css`, no inline styles), the footer change, `/send`, the test-hook additions and step definitions.
- [ ] **Step 4: Add copy** (six languages, ack, build, check) and slash-command copy in all four places.
- [ ] **Step 5: Run** `npm run test:acceptance:desktop -- --name "Sent pages|/send|sent page"`, then `npm run substrate:check`, `npm run test:i18n:desktop`. Expected: pass.
- [ ] **Step 6: Relaunch `npm start`** (chrome documents load once) and check the drawer and `/send` by eye with an injected inbox; capture a screenshot for the PR.
- [ ] **Step 7: Commit:** `desktop(m7b): Sent to this device in the drawer, and /send`.

### Task 7: Start page section

**Files:**
- Modify: `src/renderer/pages/newtab.js` (beside `renderRemote` L611–638, called at L1702/L1713), `src/renderer/pages/newtab.html`, `src/renderer/pages/pages.css`
- Modify: `test/desktop/steps/send-to-device.steps.js`, `spec/acceptance/send-to-device.feature`

**Interfaces:**
- Consumes: `start.data().sentItems`, `start.onSentItems`, `start.openSent`, `start.dismissSent`.
- Produces: a **Sent to this device** block above Other devices in the Ledger layout only; hidden when empty; same rows as the drawer.

- [ ] **Step 1: Add the scenario** `Sent pages show on the start page` and run it. Expected: fails.
- [ ] **Step 2: Implement** with `blancI18n.t` (never `innerHTML` a message) and `pages.css` classes.
- [ ] **Step 3: Run** the scenario and `npm run copy:check`. Expected: pass.
- [ ] **Step 4: Commit:** `desktop(m7b): Sent to this device on the start page`. Open **PR B**; note in its description that no release may include it before Task 11's deploy.

---

## PR C: iOS

### Task 8: Swift port of the model

**Files:**
- Create: `ios/Blanc/Blanc/Sync/SyncSends.swift`, `ios/Blanc/BlancTests/Sync/SyncSendsTests.swift`

**Interfaces:**
- Produces (`nonisolated`): `struct SentItem: Codable, Equatable, Sendable { id, to, url, title: String; sentAt: Double }`, `struct SendsEntry: Codable, Equatable, Sendable { name, platform: String; updatedAt: Double; items: [SentItem] }`, and `enum SyncSends` with `sanitize(_:now:)`, `ownEntry(previous:name:now:force:)`, `addItem(_:url:title:to:ownId:now:makeId:)`, `merge(local:remote:ownId:now:)`, `applyBudget(_:ownId:)`, `inbox(_:ownId:dismissed:now:)`, `targets(sends:session:ownId:deviceNames:)`, `pruneDismissed(_:now:)`, with the Task 1 constants. Reuse `TabSnapshots`' `truncate` and the canonical JSON from M7a's `JSONValue`.

- [ ] **Step 1: Write the failing tests:** `testSendsMergeMatchesDesktopVectors`, `testSendsInboxMatchesDesktopVectors`, `testSendsTargetsMatchDesktopVectors`, `testAddItemRefusesSelf`, `testRejectsNonHTTP`.
- [ ] **Step 2: Run** `-only-testing:BlancTests/SyncSendsTests`. Expected: build fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** again. Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m7b): Send to device model`.

### Task 9: Engine support

**Files:**
- Modify: `ios/Blanc/Blanc/Sync/SyncWorkerClient.swift` (`SyncStore` L38–40 gains `sends`; a PUT 404 with body `unknown store` maps to a distinct `.unknownStore`, other 404s stay `.notFound`)
- Modify: `ios/Blanc/Blanc/Sync/SyncEngine.swift` (`runPass` L361–466 treats `sends` as optional like `icons` L372–377; `writeMerged` L473–518 gets a `sends` branch that re-merges on 409; `adopt` L208 and `disable` reset the sends cache and dismissed ids; `retract` L524–548 also publishes an empty own entry)
- Modify: `ios/Blanc/Blanc/Sync/SyncStateStore.swift` (dismissed ids persisted per account beside `sync-sends.json`)
- Modify: `ios/Blanc/BlancTests/Sync/SyncEngineTests.swift` (its `MemorySyncTransport` gains a switch that answers `unknown store` for `sends`; the new tests)

**Interfaces:**
- Produces on `SyncEngine`: `private(set) var inbox: [InboxItem]`, `var sendTargets: [SendTarget]`, `func send(url: URL, title: String, to deviceId: String) async -> SendResult` (`.sent`, `.unavailable`, `.failed`, `.invalid`), `func dismiss(_ id: String)`, `func markOpened(_ id: String)`.

- [ ] **Step 1: Write the failing tests:** `testPresencePublishedOncePerDay`, `testSendPutsImmediately`, `testSendRetries409KeepingOtherEntries`, `testSendOnOldWorkerReportsUnavailable`, `testPassWithoutSendsStoreKeepsStatus`, `testPassIsFiveGets`, `testDismissSurvivesRepull`, `testSwitchAccountClearsInbox`, `testDisablePublishesEmptyEntry`, `testInFlightSendFromOldAccountIsDiscarded` (the M7a account barrier and generation check apply).
- [ ] **Step 2: Run** `-only-testing:BlancTests/SyncEngineTests`. Expected: new tests fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `-only-testing:BlancTests/SyncEngineTests -only-testing:BlancTests/SyncSendsTests`. Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m7b): engine sends store, presence and send`.

### Task 10: Phone UI

**Files:**
- Modify: `ios/Blanc/Blanc/PaletteSheet.swift` (a **Sent to this device** section before the tab list at L61, swipe-left `.swipeActions` to dismiss, tap to open in a new tab and `markOpened`)
- Modify: `ios/Blanc/Blanc/ContentView.swift` (a Send `Menu` on the pill, L30–73, listing `sendTargets`; hidden with no targets, in private tabs, on `blanc:` pages and when sync is off; result shown as a short banner)
- Modify: `ios/Blanc/Blanc/PagesBridge.swift` (`start.data` gains `sentItems` at L283–284; `start.onSentItems` emitted through `emit` at L344; `start.openSent`, `start.dismissSent`; keep the `userScriptTemplate` literal shape that `test/unit/ios-pages-bridge.test.js` reads)
- Modify: `ios/Blanc/BlancTests/PagesBridgeTests.swift`, `ios/Blanc/BlancTests/` UI-model tests as needed

**Interfaces:**
- Consumes: `SyncEngine.inbox`, `sendTargets`, `send`, `dismiss`, `markOpened`; strings from the shared catalog (`sends.*` keys from Task 6).

- [ ] **Step 1: Write the failing tests:** `testStartDataIncludesSentItems`, `testOpenSentMarksOpened`, `testDismissSentHidesItem`, `testSendMenuHiddenInPrivateTab`.
- [ ] **Step 2: Run** the affected classes. Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the whole `BlancTests` scheme and `node --test test/unit/ios-pages-bridge.test.js`. Expected: `** TEST SUCCEEDED **` and pass.
- [ ] **Step 5: Run in the simulator** (default signing) against the in-memory transport's debug seed or a local Worker (`wrangler dev`), and capture the palette section, the pill menu and the start page.
- [ ] **Step 6: Commit:** `ios(m7b): Sent to this device and the Send menu`. Open **PR C**.

---

## PR D: deploy and records

### Task 11: Worker deploy (owner's action) and by-hand checks

- [ ] **Step 1: Ask the owner** to approve the deploy of `cloudflare/sync-worker` from a clean checkout of `main` containing Task 2 (`npx wrangler deploy`). Record the deployment id.
- [ ] **Step 2: Check the live Worker** with a throwaway account: `PUT` then `GET /v1/<locator>/sends` round-trips; account delete removes it.
- [ ] **Step 3: By hand,** with a packaged desktop build (`npm run dist:dir`, isolated `--user-data-dir`, a throwaway sync account) and the simulator: desktop → phone (tab menu and `/send`), phone → desktop (pill menu); open and dismiss on each side; relaunch and confirm dismissed items stay hidden; a device with tab sharing off is still a target; private tabs offer nothing; turn sync off on the phone and confirm desktop drops it as a target after its next refresh.
- [ ] **Step 4: Old-Worker check:** point a desktop and the simulator at a local `wrangler dev` built from the commit before Task 2 and confirm "Sending isn't available yet." with no status error.
- [ ] **Step 5: Clean up** the throwaway account (account delete), the isolated profile and the build output.

### Task 12: Records

**Files:**
- Modify: `spec/features.md` (new **F55 — Send to device**), `spec/parity-matrix.md` (F55 row; F27 iOS note), `docs/superpowers/specs/2026-10-21-ios-port-revisit.md` (M7 row), the tab-sync spec's §11 (a note that `sends` is a separate store and keeps the one-writer-per-entry rule)
- Modify: `site/` nothing; marketing claims wait for a release that ships it (`docs/marketing-claims.md`).

- [ ] **Step 1: Write** F55 from the addendum (§1–§6) and the matrix row (desktop `DONE` once released, iOS `PARTIAL` until TestFlight).
- [ ] **Step 2: Run** `npm run test:unit` (some tests read the parity matrix). Expected: pass.
- [ ] **Step 3: Commit:** `spec(m7b): record Send to device`. Open **PR D** with the Task 11 evidence.
