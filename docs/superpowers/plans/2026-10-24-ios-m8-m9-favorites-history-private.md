# iOS M8 + M9: Favorites, History and Private Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The phone edits Favorites (heart on the pill, the Favorites page) and syncs them both ways, keeps a local History that the History page and Quick Switcher read, and opens private tabs in an isolated in-memory web session that never reaches history, the session or sync.

**Architecture:** Favorites edits are pure functions in `SyncedFavorites` (ported from desktop's `bookmarks.js` and checked against generated vectors), applied to the sync state store and uploaded by the existing `SyncEngine` pass through `writeMerged`. History is a new local JSON store with desktop's entry shape. Private tabs are ordinary `TabModel`s whose `WKWebViewConfiguration` uses one shared `WKWebsiteDataStore.nonPersistent()` and whose `isPrivate` flag gates history, session, sync and the heart.

**Tech Stack:** Swift 5 (default `MainActor` isolation), SwiftUI, WebKit, XCTest and XCUITest; Node 22 for the vector generator.

**Spec:** `docs/superpowers/specs/2026-10-24-ios-v1-companion-release-design.md` §6 rows F4, F9, F10 (and F2 reopen through Recently closed stays M17); the contracts in `spec/features.md` F4, F9, F10. This is the first of the 1.0 plans (design §7: M8 and M9 come first because they have no dependency on the desktop Spaces protocol).

## Global Constraints

- Base: `main` at or after `67a5c03` (the design). New Swift files go in `ios/Blanc/Blanc/` and tests in `ios/Blanc/BlancTests/` (file-system synchronized groups; no `project.pbxproj` edit). iOS 18.4 minimum, no SPM packages.
- One PR for M8 (Tasks 1–6) and one for M9 (Tasks 7–9), each off `main`; M9 may start once Task 5's `HistoryStore` is on main (it gates history by `isPrivate`).
- Favorites keep desktop's wire shape exactly: items `{id, url, title, favicon, addedAt, updatedAt, folder}`, tombstones `{url, deletedAt}`; a removal writes a tombstone; re-favoriting a URL clears its tombstone; folder names are trimmed and at most 100 UTF-16 units (`src/main/bookmarks.js`, `bookmark-data.js`).
- History keeps desktop's shape: entries `{url, title, visitedAt}` newest first, capped at **5000**, http(s) only, a consecutive visit to the same URL updates the newest entry; never a private tab.
- Private tabs: never in history, the saved session, tab sync's snapshot, Favorites' heart, or Recently closed (M17); children opened from a private page are private; `blanc://newtab/?private=1` is the private new tab; the pill uses `BlancTheme.privateBrowsing` and shows a Private chip that closes the tab.
- The sync state store keeps Favorites across sync off and account switches (desktop keeps `bookmarks.json`); only the account-bound stores are wiped.
- Strings come from the shared catalog through `SyncCopy.text` (keys named per task); no new English without all six languages in the same PR (`copy:ack`, `copy:build`, `copy:check`).
- The bridge contract `browser-api/bridges.json` doesn't change; `test/unit/ios-pages-bridge.test.js` must keep passing.
- iOS test command (run in the background; the first build takes 2–3 min):
  `cd ios/Blanc && xcodebuild test -project Blanc.xcodeproj -scheme Blanc -destination 'id=<a booted iPhone simulator udid>' -only-testing:BlancTests/<Class> CODE_SIGNING_ALLOWED=NO`
  Expected on pass: `** TEST SUCCEEDED **`. UI tests (`BlancUITests`) sign with the default identity (omit `CODE_SIGNING_ALLOWED=NO` for them locally; CI runs the whole scheme with it set, which works for the simulator).

## Review Focus

- **A Favorite removed on desktop while the phone edits the same one offline**: the newer clock wins and a tombstone older than the phone's edit must not delete it (the existing `favoritesMerge` vector "keep newer", replayed by `testFavoritesMergeMatchesVectors`; Task 2's `testLocalFavoriteEditSurvivesOlderRemoteTombstone`).
- **Sync turned off, then on with another account**: the phone's Favorites stay and merge into the new account instead of vanishing or silently overwriting (Task 2's `testDisableKeepsFavorites`, `testJoinMergesLocalFavoritesIntoAccount`).
- **5,001 visits**: the oldest entry goes, the file stays bounded, and the History page still lists 500 (Task 5's `testCapsAtFiveThousand`).
- **A private tab's page opens a link in a new tab**: the child is private and shares the ephemeral store (Task 8's `testChildOfPrivateTabIsPrivate`).
- **Relaunch after closing the app with only private tabs open**: the session restores to one ordinary blank tab, never a private page (Task 8's `testSessionNeverPersistsPrivateTabs`).

---

### Task 1: Favorites edits as pure functions, with vectors

**Files:**
- Modify: `ios/Blanc/Blanc/Sync/SyncedFavorites.swift`
- Modify: `scripts/build-ios-sync-vectors.cjs` (new section `favoritesEdit`), `ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json` (regenerated)
- Test: `ios/Blanc/BlancTests/Sync/SyncedFavoritesTests.swift`

**Interfaces:**
- Produces, on `nonisolated enum SyncedFavorites` (store = the `{items, tombstones}` JSON desktop exports):
  - `static func isFavorite(_ store: JSONValue, url: String) -> Bool`
  - `static func toggle(_ store: JSONValue, url: String, title: String, favicon: String?, now: Double, makeId: () -> String) -> (store: JSONValue, favorited: Bool)`
  - `static func remove(_ store: JSONValue, id: String, now: Double) -> JSONValue`
  - `static func setFolder(_ store: JSONValue, id: String, folder: String?, now: Double) -> JSONValue`
  - `static func renameFolder(_ store: JSONValue, from: String, to: String, now: Double) -> JSONValue`
  - `static func removeFolder(_ store: JSONValue, name: String, now: Double) -> JSONValue`
  Each returns the store unchanged when nothing changes. `toggle` appends `{id: makeId(), url, title: title or url, favicon: SyncedIcons.valid(favicon) or null, addedAt: now, updatedAt: now, folder: null}` and drops the URL's tombstone, or removes the item and appends `{url, deletedAt: now}`. Folder edits stamp `updatedAt: now` on every item they touch, as `bookmark-data.js` does.

- [ ] **Step 1: Add the vector section.** In `scripts/build-ios-sync-vectors.cjs`, declare `favoritesEdit: []` beside the others and generate, with `moduleInProfile('bookmarks', …)` as the existing `favoritesMerge` cases do: `toggle on` (empty store → one item), `toggle off` (item → tombstone), `toggle on after delete` (tombstone cleared), `remove by id`, `set folder` (with a 101-unit name, trimmed to 100), `rename folder` (two items, both restamped), `remove folder` (items keep, folder null), `set folder unknown id` (unchanged). Each entry `{name, input: {store, operation, args, now, id}, expected}` where `expected` is `exportForSync()` after the call. Run `npm run ios:sync-vectors:build`, then `node --test test/unit/ios-sync-vectors.test.js`. Expected: 1 pass.
- [ ] **Step 2: Write the failing test** `testFavoritesEditsMatchDesktopVectors` in `SyncedFavoritesTests`: for each `favoritesEdit` vector, dispatch on `operation` to the function above (with `makeId: { input.id }`) and `XCTAssertEqual(result.canonical(), expected.canonical(), name)`. Add `testToggleReportsState` (on → `favorited == true`, off → `false`).
- [ ] **Step 3: Run** `-only-testing:BlancTests/SyncedFavoritesTests`. Expected: build fails (functions missing).
- [ ] **Step 4: Implement** the six functions in `SyncedFavorites.swift`, preserving item order and desktop's `trim`/100-unit folder rule.
- [ ] **Step 5: Run** the same command. Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 6: Commit:** `ios(m8): Favorites edits as pure functions, checked against desktop vectors`.

### Task 2: The engine publishes Favorites edits and keeps them across accounts

**Files:**
- Modify: `ios/Blanc/Blanc/Sync/SyncEngine.swift` (`runPass` ~L411–L451, `writeMerged` ~L478, `adopt` ~L208, `disable` ~L300)
- Modify: `ios/Blanc/Blanc/Sync/SyncStateStore.swift` (`clearData`)
- Test: `ios/Blanc/BlancTests/Sync/SyncEngineTests.swift`

**Interfaces:**
- Consumes: Task 1's functions.
- Produces on `SyncEngine`:
  - `func editFavorites(_ change: (JSONValue) -> JSONValue)`: applies `change` to the local bookmarks store (an empty `{items: [], tombstones: []}` when none), saves it, bumps a private `favoritesRevision`, calls `refreshViews()` and `onChanged?()`, and, when sync is enabled, `schedulePublish(delay: 250)`. Works with sync off (local Favorites).
  - `func isFavorite(url: String) -> Bool`.
  - `SyncStateStore.clearData(keeping: Set<SyncStore> = [])`; `adopt` and `disable` call `clearData(keeping: [.bookmarks])`.
- `runPass` uploads `.bookmarks` through `writeMerged` (a new branch: on 409, `value = SyncedFavorites.merge(local: value, remote: current)`), and re-merges the local store after the write when `favoritesRevision` moved during the pass (the `settingsRevision` pattern).

- [ ] **Step 1: Write the failing tests** in `SyncEngineTests` (the `MemorySyncTransport` fixture): `testFavoriteAddedOnPhoneIsUploaded` (edit, `syncNow()`, the transport's `bookmarks` blob holds the item), `testLocalFavoriteEditSurvivesOlderRemoteTombstone` (remote tombstone at `now - 1`, local toggle at `now`; after the pass the item is in both local and uploaded stores), `testFavoriteEditDuringPullIsNotLost` (suspend the bookmarks GET, edit, release; the upload holds the edit), `testDisableKeepsFavorites` (edit, `disable()`, `favorites` still lists it and `sync-favorites.json` exists), `testJoinMergesLocalFavoritesIntoAccount` (local favorite, `switchWithCode` into account B that has another; after the pass both are in B's blob), `testEditWithSyncOffStaysLocal` (no transport calls).
- [ ] **Step 2: Run** `-only-testing:BlancTests/SyncEngineTests`. Expected: the six fail.
- [ ] **Step 3: Implement** per the Interfaces block.
- [ ] **Step 4: Run** the whole `SyncEngineTests` class. Expected: `** TEST SUCCEEDED **` (the existing 33 tests included).
- [ ] **Step 5: Commit:** `ios(m8): publish Favorites edits; keep Favorites across sync off and account switches`.

### Task 3: The Favorites page edits on the phone

**Files:**
- Modify: `ios/Blanc/Blanc/PagesBridge.swift` (the `bookmarks` cases in `response(group:method:appVersion:)` ~L34–L38 and the live dispatch ~L281)
- Test: `ios/Blanc/BlancTests/PagesBridgeTests.swift`

**Interfaces:**
- Consumes: Task 2's `editFavorites`, Task 1's functions.
- Produces: `bookmarks.capabilities` → `{editable: true}`; `bookmarks.remove(id)`, `setFolder(id, folder)`, `renameFolder(oldName, newName)`, `removeFolder(name)` → `editFavorites` with the matching Task 1 function, returning `.null`; `bookmarks.clearFavicon(url)` → sets that item's `favicon` to `null` through `editFavorites`; `bookmarks.import`, `importBrowser`, `browserSources` keep rejecting with `favorites.editOnComputer` (F30 is after 1.0). The existing `favoritesRefreshScript` reloads open Favorites and start pages after a change.

- [ ] **Step 1: Write the failing tests:** `testFavoritesAreEditableOnThePhone` (capabilities `editable == true`), `testRemoveFavoriteReachesTheEngine` (dispatch `bookmarks.remove` with an id; the engine's `favorites` no longer lists it), `testImportStillRejects`.
- [ ] **Step 2: Run** `-only-testing:BlancTests/PagesBridgeTests`. Expected: the three fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `PagesBridgeTests` and `node --test test/unit/ios-pages-bridge.test.js`. Expected: `** TEST SUCCEEDED **` and pass.
- [ ] **Step 5: Commit:** `ios(m8): the Favorites page edits on the phone`.

### Task 4: The heart on the pill

**Files:**
- Modify: `ios/Blanc/Blanc/ContentView.swift` (the pill's trailing buttons ~L50–L66), `ios/Blanc/Blanc/TabsManager.swift`
- Modify: `ios/Blanc/Blanc/UITestSeed.swift` (on `main` once #1096 lands; create it from #1096's version if it isn't there yet)
- Test: `ios/Blanc/BlancTests/TabsManagerTests.swift`, `ios/Blanc/BlancUITests/FavoritesUITests.swift`

**Interfaces:**
- Consumes: Task 2's `editFavorites`, `isFavorite(url:)`.
- Produces: `TabsManager.isFavorite(_ tab: TabModel) -> Bool` and `toggleFavorite(_ tab: TabModel)` (title = `tab.pageTitle`, favicon `nil` in 1.0). The pill shows a heart button for http(s) pages only (not `blanc://`, not private), `systemImage` `heart` / `heart.fill`, accessibility label `SyncCopy.text("tabMenu.saveFavorite")` / `("tabMenu.removeFavorite")`, identifier `pill.favorite`, accessibility value `"on"` when favorited.
- The UI seed gains `-BlancUITestFavorites`: starts with one tab on `https://example.com/` and sync off.

- [ ] **Step 1: Write the failing tests:** `TabsManagerTests.testToggleFavoriteFlipsState` (toggle twice; `isFavorite` true then false; no sync engine network) and `FavoritesUITests.testHeartTogglesTheFavorite` (launch with `-BlancUITestFavorites`; tap `pill.favorite`; its value is `"on"`; tap again; `"off"`).
- [ ] **Step 2: Run** both classes. Expected: fail (members missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `TabsManagerTests` and `BlancUITests/FavoritesUITests` (default signing). Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m8): a heart on the pill`.

### Task 5: A local History store

**Files:**
- Create: `ios/Blanc/Blanc/HistoryStore.swift`
- Modify: `ios/Blanc/Blanc/TabsManager.swift` (wire `onURLChange` and `onTitleChange` ~L92–L95)
- Test: `ios/Blanc/BlancTests/HistoryStoreTests.swift`, `ios/Blanc/BlancTests/TabsManagerTests.swift`

**Interfaces:**
- Produces `@MainActor @Observable final class HistoryStore` over `history.json` in the Application Support directory (the `SessionStore` pattern: load on init, debounced 250 ms save, flush on background):
  - `struct HistoryEntry: Codable, Equatable { let url: String; var title: String; var visitedAt: Int64 }`
  - `private(set) var entries: [HistoryEntry]` (newest first)
  - `static let maxEntries = 5000`
  - `func addVisit(url: URL, title: String)`: only `http`/`https`; a visit to the same URL as the newest entry updates its `visitedAt` (and title when non-empty); else inserts at the front and trims to `maxEntries`.
  - `func updateTitle(url: URL, title: String)` (the newest entry for that URL).
  - `func list(query: String, limit: Int = 500) -> [HistoryEntry]` (case-insensitive substring on url or title).
  - `func remove(url: String, visitedAt: Int64)`, `func clear()`, `func flush()`.
- `TabsManager` owns `let historyStore: HistoryStore` (directory = `settingsDirectory`), records a visit on each `onURLChange` and the title on `onTitleChange`, for tabs where `isPrivate == false` (Task 7 adds the flag; until then every tab records).

- [ ] **Step 1: Write the failing tests** in `HistoryStoreTests`: `testAddsNewestFirst`, `testConsecutiveSameURLUpdatesInsteadOfAppending`, `testIgnoresNonHTTP` (`blanc://newtab/`, `file:`), `testCapsAtFiveThousand` (5,001 visits → 5,000 entries, the first one gone), `testListFiltersAndLimits`, `testRemoveAndClear`, `testPersistsAcrossInstances` (flush, new store from the same directory). In `TabsManagerTests`: `testVisitsRecordHistory` (a tab's `onURLChange` fires; the entry exists).
- [ ] **Step 2: Run** both classes. Expected: build fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both. Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m8): a local History store`.

### Task 6: History on the page and in the Quick Switcher

**Files:**
- Modify: `ios/Blanc/Blanc/PagesBridge.swift` (`history` cases), `ios/Blanc/Blanc/QuickSwitcher.swift` (`search(query:tabs:remote:favorites:)` ~L72), `ios/Blanc/Blanc/PaletteSheet.swift` (the call site)
- Modify: `spec/parity-matrix.md` (F9 and F10 iOS → `PARTIAL`, "unreleased; editable on the phone / local History"), `docs/superpowers/specs/2026-10-21-ios-port-revisit.md` (M8 row status)
- Test: `ios/Blanc/BlancTests/PagesBridgeTests.swift`, `ios/Blanc/BlancTests/QuickSwitcherTests.swift`

**Interfaces:**
- Consumes: Task 5's `HistoryStore`.
- Produces: `history.list(opts)` → `[{url, title, visitedAt, favicon: null}]` from `historyStore.list(query: opts.query ?? "", limit: opts.limit ?? 500)`; `history.remove(url, visitedAt)` and `history.clear()` → the store, returning `.null`. `QuickSwitcher.search(query:tabs:remote:favorites:history:)` gains `history: [HistoryEntry]`. Ranking stays local tabs, then Favorites, then other devices' tabs, then History last (its score is the bare `matchScore`, no bonus), deduplicated by URL against everything above it, ids `"history:" + url`, the whole list still capped at 12.

- [ ] **Step 1: Write the failing tests:** `PagesBridgeTests.testHistoryListReturnsEntriesNewestFirst`, `testHistoryClearEmptiesTheStore`; `QuickSwitcherTests.testHistoryRanksBelowRemoteTabs`, `testHistoryIsDeduplicatedAgainstOpenTabs`.
- [ ] **Step 2: Run** both classes. Expected: fail.
- [ ] **Step 3: Implement**, and update the two records.
- [ ] **Step 4: Run** the whole `BlancTests` scheme and `node --test test/unit/ios-pages-bridge.test.js test/unit/spaces-free-records.test.js`. Expected: `** TEST SUCCEEDED **`; pass.
- [ ] **Step 5: Commit:** `ios(m8): History on the page and in the Quick Switcher`. Open the M8 PR.

### Task 7: Private tabs: model and web session

**Files:**
- Modify: `ios/Blanc/Blanc/TabModel.swift`, `ios/Blanc/Blanc/WebViewConfiguration.swift`, `ios/Blanc/Blanc/TabsManager.swift` (`createTab` ~L82, `persistSession` ~L139, the `tabsSource` closure ~L26, the history wiring from Task 5)
- Test: `ios/Blanc/BlancTests/TabsManagerTests.swift`, `ios/Blanc/BlancTests/TabModelTests.swift`

**Interfaces:**
- Produces: `TabModel.isPrivate: Bool` (set at init); `WebViewConfiguration.make(schemeHandler:bridge:dataStore:)` with `dataStore: WKWebsiteDataStore` (default `.default()`); `TabsManager.createTab(url: URL = newTabURL, isPrivate: Bool = false) -> UUID`, where a private tab's URL defaults to `TabsManager.privateNewTabURL = URL(string: "blanc://newtab/?private=1")!` and its configuration uses `TabsManager.privateDataStore`, one `WKWebsiteDataStore.nonPersistent()` created lazily and kept for the process (dropped and recreated when the last private tab closes, so quitting Blanc or closing every private tab forgets it). `persistSession` and the sync `tabsSource` skip private tabs; `HistoryStore` is not called for them; `closeTab` on the last tab still creates an ordinary blank tab.

- [ ] **Step 1: Write the failing tests:** `testPrivateTabUsesNonPersistentStore` (`!tab.webView.configuration.websiteDataStore.isPersistent`), `testPrivateTabsShareOneStore` (two private tabs, same store instance), `testClosingLastPrivateTabForgetsTheStore` (a third private tab after both close gets a new instance), `testSessionNeverPersistsPrivateTabs` (one ordinary and one private; the saved urls hold only the ordinary one; with only a private tab the file keeps the previous ordinary session), `testPrivateTabRecordsNoHistory`, `testPrivateTabIsNotInTheSyncSnapshot` (`tabsSource` output omits it).
- [ ] **Step 2: Run** `TabsManagerTests`. Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `TabsManagerTests` and `TabModelTests`. Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m9): private tabs in a shared non-persistent web session`.

### Task 8: Private children and the private new tab

**Files:**
- Create: `ios/Blanc/Blanc/TabUIDelegate.swift`
- Modify: `ios/Blanc/Blanc/TabModel.swift` (install the delegate), `ios/Blanc/Blanc/TabsManager.swift`, `ios/Blanc/Blanc/SlashCommand.swift`
- Test: `ios/Blanc/BlancTests/TabsManagerTests.swift`, `ios/Blanc/BlancTests/SlashCommandTests.swift`

**Interfaces:**
- Produces: `final class TabUIDelegate: NSObject, WKUIDelegate` whose `webView(_:createWebViewWith:for:windowFeatures:)` asks its `onOpenChild: ((URL?, Bool) -> WKWebView?)` hook; `TabsManager` sets it so a child of a private tab is created with `isPrivate: true` (and of an ordinary tab, `false`), at the end of the tab list, active, returning the new tab's `webView` so WebKit loads the request into it. A `/private` slash command (hint key `slash.private.hint` via `SyncCopy`, the catalog already has it) runs `createTab(isPrivate: true)`.
- The `?private=1` start page already styles itself private (`newtab.js` reads it); the scheme handler serves it as any other.

- [ ] **Step 1: Write the failing tests:** `testChildOfPrivateTabIsPrivate` (invoke the delegate hook on a private tab; the new tab `isPrivate`, shares the store), `testChildOfOrdinaryTabIsOrdinary`, `SlashCommandTests.testPrivateCommandOpensAPrivateTab`.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `TabsManagerTests` and `SlashCommandTests`. Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m9): private children and /private`.

### Task 9: The private pill

**Files:**
- Modify: `ios/Blanc/Blanc/ContentView.swift` (`theme`, the pill, the heart from Task 4), `ios/Blanc/Blanc/UITestSeed.swift` (`-BlancUITestPrivate`: one ordinary tab and one active private tab on `https://example.com/`)
- Modify: `spec/parity-matrix.md` (F4 iOS → `PARTIAL`), the revisit's M9 row
- Test: `ios/Blanc/BlancUITests/PrivateTabsUITests.swift`, `ios/Blanc/BlancTests/ThemeTests.swift`

**Interfaces:**
- Consumes: Task 7's `isPrivate`, Task 4's heart.
- Produces: while the active tab is private, `theme` resolves to `.privateBrowsing` for the pill and the page background, the pill shows a **Private** chip (text `SyncCopy.text("pill.private.chip")`, accessibility label `SyncCopy.text("pill.private.title")`, identifier `pill.private`) that closes the active private tab, and the heart is absent. `resolvedTheme(preference:systemScheme:isPrivate:)` in `SettingsStore.swift` gains the flag and returns `.privateBrowsing` when it is true (ThemeTests pin it).

- [ ] **Step 1: Write the failing tests:** `ThemeTests.testPrivateTabForcesPrivateTheme`; `PrivateTabsUITests.testPrivateChipClosesTheTab` (launch with `-BlancUITestPrivate`; `pill.private` exists, `pill.favorite` doesn't; tap the chip; `pill.private` disappears and the ordinary tab shows).
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement**, and update the records.
- [ ] **Step 4: Run** the whole scheme (`BlancTests` and `BlancUITests`) and `node --test test/unit/ios-pages-bridge.test.js test/unit/spaces-free-records.test.js`. Expected: `** TEST SUCCEEDED **`; pass.
- [ ] **Step 5: Commit:** `ios(m9): the private pill`. Open the M9 PR.
