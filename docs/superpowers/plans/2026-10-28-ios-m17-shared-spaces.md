# iOS M17: Shared Spaces on iPhone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Groups, Spaces and This iPhone on the phone (M17a), the M16 protocol in Swift (M17b), and shared Spaces, Bring a Space and synced Recently closed wired into the phone's sync (M17c).

**Architecture:** Pure Swift types port desktop's pure modules one to one and are proven against vectors generated from desktop's own code. `TabsManager` gains tab sets (This iPhone, local and shared Spaces) and groups; a Swift adapter maps shared records to the shown set exactly as desktop's adapter maps them to a window. The sync pass moves to desktop's request scheduler.

**Tech Stack:** Swift 6, SwiftUI, WebKit (`WKWebView`), XCTest/XCUITest, CryptoKit; Node for the vector generator. No SPM packages.

**Spec:** `docs/superpowers/specs/2026-10-28-ios-m17-shared-spaces-design.md` (the design), building on `docs/superpowers/specs/2026-10-25-shared-spaces-sync-design.md` (M16) and `docs/superpowers/specs/2026-10-24-ios-v1-companion-release-design.md` (the contract).

## Global Constraints

- iOS 18.4 minimum; SwiftUI + `WKWebView`; the existing `ios/Blanc` project (file-system synchronized groups: new files in `ios/Blanc/Blanc/` or `ios/Blanc/BlancTests/` join their target automatically); no SPM packages.
- Never create a `WKWebView` before the app's window exists (#1147).
- UI-test hit targets are at least 32 pt; every interactive element has an `accessibilityIdentifier`.
- Don't edit `ios/Blanc/Blanc/SlashCommand.swift`, `ios/Blanc/Blanc/SlashCommands.strings`, or the palette's slash-command list (M10 is in flight there).
- iOS must merge, order, budget and schedule byte-for-byte as desktop 1.45. When a Swift result differs from a vector, the Swift is wrong.
- Every user-visible string comes from `copy/messages/en.json` through `SyncCopy.text(_:)`/`SyncCopy.text(_:_:)`; reuse the existing `sharedSpaces.*`, `closed.*` and `spaces.*` keys where the text fits; any new key lands in all six languages (`en`, `de`, `es`, `fr`, `it`, `pt-BR`) in the same PR, then `npm run copy:build && npm run copy:check`.
- Limits (M16): 25 Spaces per library and per phone (recovery Spaces exempt); 500 live tabs per Space; blob gate 520,192 bytes of `JSON.stringify` of the encrypted envelope; tombstones kept 30 days; `closed` 24 h and 25 items per device, 64 KiB store; `shared` 64 KiB; index 64 KiB; at most 10 GETs per trailing 60 s (backoff floor 3); Recently deleted Spaces 7 days.
- Ids for groups, Spaces and shared tabs are 32 lowercase hex characters (UUID without hyphens).
- No Worker deploy, no desktop behaviour change. Desktop-side edits are limited to `scripts/build-ios-sync-vectors.cjs`, new generator scripts under `scripts/`, `package.json` scripts, tests under `test/unit/`, `copy/messages/*.json`, and `spec/` docs.
- Run iOS tests on both simulators before each PR: iOS 26.5 `iPhone 17 Pro` (`B25DAB6D-2A49-47CF-9325-77A0DA566318`) and iOS 27.0 `iPhone 17 Pro (27.0)` (`BCF825F7-E082-406E-9059-108ECE5EEEEA`):
  `cd ios/Blanc && xcodebuild test -project Blanc.xcodeproj -scheme Blanc -destination "id=<udid>" CODE_SIGNING_ALLOWED=NO`
- Three stacked PRs: `claude/ios-m17a-groups-spaces` from `main`, `claude/ios-m17b-protocol` from M17a, `claude/ios-m17c-sync` from M17b. Never `gh pr merge --delete-branch` on a parent.

## Review Focus

1. **A pre-M17 `session.json`** (`{urls, activeIndex}` only) must open as This iPhone with every tab, and a downgrade must still find the shown set's tabs in `urls`. Test in Task 5.
2. **A remote close or navigation of the selected tab while the app is in the background** must wait; returning to the foreground is not a cold start. Test in Task 17.
3. **Closing a quiet tab** (never woken) must still give Undo, Recently closed and a shared tombstone, with its saved URL and title, never `about:blank`. Tests in Tasks 1 and 20.
4. **Group names that differ only by case, empty, or whitespace-only** must be refused or trimmed exactly as desktop (`src/main/group-name-case.js`). Test in Task 3.
5. **An older Worker** answering `404 unknown store` for `spaces` must leave the switch off with "Spaces sync isn't available", without breaking Favorites, settings, tabs or sends sync. Test in Task 16.

---

# M17a — Groups, Spaces and This iPhone (local)

### Task 1: Quiet tabs

**Files:**
- Modify: `ios/Blanc/Blanc/TabModel.swift`
- Modify: `ios/Blanc/Blanc/TabsManager.swift` (`createTab`, `setActive`, session restore at the `savedURLs` loop)
- Modify: `ios/Blanc/Blanc/TabGridView.swift` (card for a quiet tab), `ios/Blanc/Blanc/TabPreviewRenderer.swift` (skip quiet tabs)
- Test: `ios/Blanc/BlancTests/TabModelTests.swift`, `ios/Blanc/BlancTests/TabsManagerTests.swift`

**Interfaces:**
- Produces: `TabModel.init(url: URL, title: String = "", configuration: @escaping () -> WKWebViewConfiguration, isPrivate: Bool = false, quiet: Bool = false, load: Bool = true)`; `var isQuiet: Bool { get }` (true until the web view exists); `var hasWebView: Bool`; `func wake()` (creates the web view if needed and loads `currentURL`); `var webView: WKWebView { get }` creates it on first access without loading. `pageTitle` is seeded from `title`. `TabsManager.createTab(url: URL? = nil, title: String = "", isPrivate: Bool = false, quiet: Bool = false, at index: Int? = nil) -> UUID`. `setActive(_:)` calls `wake()` on the newly active tab.

- [ ] **Step 1: Write failing tests**: `testQuietTabHasNoWebViewUntilWoken` (quiet tab: `hasWebView == false`, `pageTitle == "Saved"`, `currentURL` kept; after `wake()`, `hasWebView == true`); `testRestoreCreatesOnlySelectedTabLive` (seed a session of 3 URLs with activeIndex 1; only `tabs[1].hasWebView`); `testSetActiveWakesQuietTab`; `testClosingQuietTabUndoRestoresURLAndTitle` (Review Focus 3).
- [ ] **Step 2: Run** `xcodebuild test … -only-testing:BlancTests/TabModelTests -only-testing:BlancTests/TabsManagerTests` — expect compile failure / FAIL.
- [ ] **Step 3: Implement.** Hold the configuration factory and create the web view lazily (`@ObservationIgnored private var storage: WKWebView?`); the KVO URL observation and delegates attach when the view is created. Code that only reads `canGoBack`, `isLoading`, `thumbnail` must not touch `webView` on a quiet tab. The grid's quiet card shows `globe` and the saved title, never a thumbnail.
- [ ] **Step 4: Run the tests** — PASS; then the whole suite on iOS 26.5 — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17a: quiet tabs load only when shown"`

### Task 2: Groups model and `TabSections`

**Files:**
- Create: `ios/Blanc/Blanc/TabGroups.swift`, `ios/Blanc/Blanc/TabSections.swift`
- Modify: `ios/Blanc/Blanc/TabModel.swift` (add `groupId: String?`, `pinned: Bool`, `sharedTabId: String?`)
- Modify: `scripts/build-ios-sync-vectors.cjs` (new section `tabSections`)
- Test: `ios/Blanc/BlancTests/TabSectionsTests.swift`

**Interfaces:**
- Produces: `struct TabGroup: Codable, Equatable, Identifiable { var id: String; var name: String; var color: String?; var collapsed: Bool }`; `enum TabSections { static func sections(order: [(id: String, groupId: String?, pinned: Bool)], groups: [TabGroup]) -> [Section]; static func normalize(order:groups:) -> (order: [String], groups: [TabGroup]) }`, `enum Section: Equatable { case ungrouped([String]); case group(TabGroup, [String]) }`, matching `src/renderer/tab-sections.js` output (read that file for the exact rules: contiguity, a group's pins leading it, empty groups pruned).
- [ ] **Step 1: Extend the generator**: add `vectors.tabSections` with ≥12 cases from `require('../src/renderer/tab-sections.js')` (ungrouped runs above/between/below groups, a non-contiguous group, a grouped pin, an empty group, unknown `groupId`); run `npm run ios:sync-vectors:build`, then `node --test test/unit/ios-sync-vectors.test.js` — PASS.
- [ ] **Step 2: Write failing test** `testTabSectionsMatchDesktopVectors` iterating `SyncVectors.section("tabSections")`, asserting `TabSections.sections` and `normalize` equal `expected`.
- [ ] **Step 3: Run** — FAIL. **Step 4: Implement** both functions. **Step 5: Run** — PASS.
- [ ] **Step 6: Commit** `git commit -m "iOS M17a: tab groups and desktop's section rules"`

### Task 3: Group operations in `TabsManager`

**Files:**
- Modify: `ios/Blanc/Blanc/TabsManager.swift`
- Create: `ios/Blanc/Blanc/GroupNames.swift`
- Test: `ios/Blanc/BlancTests/TabGroupsTests.swift`

**Interfaces:**
- Consumes: Task 2's `TabGroup`, `TabSections.normalize`; Task 6's `SpaceIdentity.presets` (run Task 6 before this task). `setGroupColor` accepts only a preset hex or nil.
- Produces (all `@MainActor` on `TabsManager`): `var groups: [TabGroup]`; `enum GroupNameError: Error { case empty, duplicate }`; `func createGroup(named: String, with tabId: UUID) throws -> String`; `func renameGroup(_ id: String, to: String) throws`; `func setGroupColor(_ id: String, _ hex: String?)`; `func setGroupCollapsed(_ id: String, _ collapsed: Bool)`; `func moveTab(_ tabId: UUID, toGroup groupId: String?)` (nil = Remove from Group, which places the tab directly below its old group); `func ungroup(_ id: String)`; `func closeGroup(_ id: String)` (one Undo restoring every tab and the group); `func newTab(inGroup id: String) -> UUID`; `func group(matching name: String) -> TabGroup?` (case-insensitive, for M10). `GroupNames.normalize(_:) -> String?` and `GroupNames.sameName(_:_:) -> Bool` port `src/main/group-name-case.js`.
- [ ] **Step 1: Failing tests**: create/rename keep the typed case; `"research"` duplicates `"Research"` → `.duplicate`; `""` and `"   "` → `.empty` (Review Focus 4); a group with no tabs disappears; plain `createTab()` is ungrouped even when the active tab is grouped; a private tab can't join a group; `closeGroup` then `undoClose()` restores tabs, order and group; `moveTab(_, toGroup: nil)` lands below the group.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**, calling `TabSections.normalize` after each change and `persistSession()`. **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17a: make, rename, colour, ungroup and close groups"`

### Task 4: Tab sets — This iPhone and local Spaces

**Files:**
- Create: `ios/Blanc/Blanc/TabSets.swift`
- Modify: `ios/Blanc/Blanc/TabsManager.swift`
- Test: `ios/Blanc/BlancTests/TabSetsTests.swift`

**Interfaces:**
- Produces: `struct SavedTab: Codable, Equatable { var url: String; var title: String; var pinned: Bool; var groupId: String?; var tabId: String? }`; `struct SpaceRecord: Codable, Equatable, Identifiable { var id: String; var name: String; var color: String; var symbol: String; var tabs: [SavedTab]; var groups: [TabGroup]; var activeIndex: Int; var sharedId: String?; var link: Link?; var recoveredFrom: String? }` with `enum Link: String, Codable { case active, dormant }`; `struct DeletedSpace: Codable { var space: SpaceRecord; var deletedAt: Int64 }`; `static let iphoneId = "iphone"`.
  On `TabsManager`: `var spaces: [SpaceRecord]` (ordered); `var shownSetId: String` (`"iphone"` or a Space id); `var recentlyDeleted: [DeletedSpace]`; `enum SpaceError: Error { case limit, emptyName }`; `func createSpace(name: String, color: String, symbol: String, withTab: UUID? = nil) throws -> String`; `func show(set id: String)` (puts the shown set away as `SavedTab`s and releases its web views; restores the chosen set quiet with only its selected tab woken; private tabs untouched); `func updateSpace(_ id: String, name: String?, color: String?, symbol: String?) throws`; `func moveSpace(_ id: String, by offset: Int)`; `func deleteSpace(_ id: String)` (shows This iPhone if it was shown; Undo through the M11 banner restores it in place); `func restoreDeleted(_ id: String)`; `func moveTab(_ tabId: UUID, toSpace id: String)` (appends ungrouped to the target; disabled for the only tab and for private tabs).
- [ ] **Step 1: Failing tests**: switching to a Space and back to This iPhone keeps This iPhone's URLs, titles, groups and selection; only the selected tab of the shown set has a web view; private tabs survive a switch and are never in any set; the 26th `createSpace` throws `.limit`; a recovery Space (`recoveredFrom != nil`) doesn't count; delete + `undoClose()` restores; `recentlyDeleted` drops entries older than 7 days on load; `moveTab(_:toSpace:)` appends to the target's saved tabs.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17a: This iPhone and local Spaces"`

### Task 5: Session v2

**Files:**
- Modify: `ios/Blanc/Blanc/SessionStore.swift`, `ios/Blanc/Blanc/TabsManager.swift` (`persistSession`, restore)
- Test: `ios/Blanc/BlancTests/SessionStoreTests.swift`

**Interfaces:**
- Produces: `struct SessionV2: Codable { var version = 2; var shown: String; var sets: [String: SavedSet]; var order: [String]; var deleted: [DeletedSpace]; var urls: [String]; var activeIndex: Int }` where `SavedSet` holds `tabs: [SavedTab]`, `groups: [TabGroup]`, `activeIndex: Int` and, for Spaces, the `SpaceRecord` identity fields. `SessionStore.load() -> SessionV2` (a v0 file becomes `shown: "iphone"` with its URLs); `SessionStore.save(_ session: SessionV2)` keeps the debounce/flush behaviour and always writes `urls`/`activeIndex` from the shown set.
- [ ] **Step 1: Failing tests**: `testV0FileLoadsAsThisIPhone` (Review Focus 1); `testRollbackMirrorTracksShownSet` (shown Space's URLs in `urls`); `testRoundTripKeepsGroupsSpacesAndShown`; private tabs never written.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17a: save groups, Spaces and the shown set"`

### Task 6: Space identity for Swift

**Files:**
- Create: `scripts/build-ios-space-identity.cjs` (writes or `--check`s `ios/Blanc/Blanc/SpaceIdentity.generated.swift` from `src/renderer/space-identity.js`)
- Create: `ios/Blanc/Blanc/SpaceIdentity.swift` (readability guard and `Path` drawing)
- Modify: `package.json` (`ios:space-identity:build`, `ios:space-identity:check`; add the check to `substrate:check`)
- Test: `test/unit/ios-space-identity.test.js`, `ios/Blanc/BlancTests/SpaceIdentityTests.swift`

**Interfaces:**
- Produces: `enum SpaceIdentity { static let presets: [(id: String, hex: String)]; static let symbolIds: [String]; static func symbolPath(_ id: String, in rect: CGRect) -> Path; static func ink(for hex: String, scheme: ColorScheme) -> Color; static let spacesGlyph: (CGRect) -> Path }`. The generated file holds the presets and each symbol's SVG elements (`rect`, `circle`, `path` with `d`); `SpaceIdentity.swift` parses those `d` strings (M, L, H, V, C, A, Z and lowercase) into a `Path` on a 24×24 grid. `ink` ports the readability guard from `space-identity.js`.
- [ ] **Step 1: Failing tests**: node test fails when the generated file is stale; Swift test: every `symbolIds` entry draws a non-empty path, `presets.count == 8`, `ink` matches desktop's choice for all eight presets in light and dark (add a `spaceInk` vector section to the vector generator for the expected values).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** generator, parser and guard. **Step 4: Run** `npm run substrate:check` and the Swift test — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17a: Space colours and symbols generated from desktop"`

### Task 7: Groups in the tab grid (section headers)

**Files:**
- Modify: `ios/Blanc/Blanc/TabGridView.swift`
- Create: `ios/Blanc/Blanc/GroupHeader.swift`
- Test: `ios/Blanc/BlancUITests/TabGroupsUITests.swift`, seed `-BlancUITestGroups` in `ios/Blanc/Blanc/UITestSeed.swift`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: identifiers `group.header.<name>`, `group.fold`, `group.menu`, `group.tucked`; the sheet title shows the shown set's tile and name (This iPhone shows the device glyph).
- Layout (owner's pick A, design §8): ungrouped runs and groups in `TabSections` order; a header row of colour dot (hollow ring for none), name (`BrowserStyle.font(17, semibold: true)`), count, fold chevron, ⋯ menu (Rename, Colour ▸ with the eight presets and None, New Tab in Group, Ungroup, Close Group); a folded group shows one "{count} tabs tucked away" row (new key `tabGroups.tucked`, plural), cards hidden.
- [ ] **Step 1: Failing UI test** `testFoldRenameAndCloseGroup` on the seed (two groups, two loose tabs): fold hides cards and shows the tucked row; Rename via the ⋯ menu changes the header; Close Group then Undo restores the cards.
- [ ] **Step 2: Run** on 26.5 — FAIL. **Step 3: Implement.** **Step 4: Run** on 26.5 and 27.0 — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17a: groups in the tab grid"`

### Task 8: The Space mark and the Spaces card

**Files:**
- Create: `ios/Blanc/Blanc/SpaceMark.swift`, `ios/Blanc/Blanc/SpacesCard.swift`, `ios/Blanc/Blanc/SpaceEditor.swift`
- Modify: `ios/Blanc/Blanc/ContentView.swift` (Island leading edge, before `islandMark`)
- Test: `ios/Blanc/BlancUITests/SpacesUITests.swift`, seed `-BlancUITestSpaces`

**Interfaces:**
- Consumes: Tasks 4, 6.
- Produces: identifiers `island.space`, `spaces.card`, `spaces.row.<name>`, `spaces.iphone`, `spaces.new`, `spaces.edit`; `SpacesCard` takes a `[DeviceSpaces]` input for the "other devices" section (empty in M17a; M17c fills it): `struct DeviceSpaces: Identifiable { let id: String; let name: String; let spaces: [RemoteSpaceSummary] }`, `struct RemoteSpaceSummary: Identifiable { let id: String; let name: String; let color: String; let symbol: String; let tabCount: Int }`; `SpaceRowState` enum for the sync mark: `none, shared, waiting, notSynced(Int64), full, unavailable` (accessible text from `sharedSpaces.shared`, `.waiting`, `.notSynced`, `.fullState`, `.unavailableState`).
- Layout (owner's pick C): a rounded card rising from the Island (Island stays visible), rows ≥48 pt, This iPhone first with count, then Spaces with tile, name, "{count} tabs", sync mark, check on the shown one, then device sections, then a footer of New Space and Edit. Edit turns rows into rename/colour/symbol editors with Move Up/Move Down and Delete. Mark: the Space's tile (≥32 pt), the quiet grey Spaces glyph on This iPhone once a Space exists, nothing before the first Space, hidden on a private tab. Dismiss on outside tap, swipe down, Escape.
- [ ] **Step 1: Failing UI tests**: `testCreateSpaceSwitchAndReturn` (New Space "Work" with the current tab → mark shows Work; This iPhone row brings back the loose tabs); `testDeleteSpaceUndo`; `testMarkHiddenOnPrivateTab`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** on both simulators — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17a: the Space mark and Spaces card"`

### Task 9: Tab menus, palette groups and Quick Switcher ranking

**Files:**
- Modify: `ios/Blanc/Blanc/TabGridView.swift` (card `contextMenu`), `ios/Blanc/Blanc/PaletteSheet.swift` (tab list sections only; not the command list), `ios/Blanc/Blanc/QuickSwitcher.swift`
- Test: `ios/Blanc/BlancTests/QuickSwitcherTests.swift`, `ios/Blanc/BlancUITests/TabGroupsUITests.swift`

**Interfaces:**
- Consumes: Tasks 3–4.
- Produces: long-press menu items Move to Group ▸ (existing groups, New Group…, Remove from Group) and Move to Space ▸ (This iPhone, every other Space, New Space…), using existing desktop keys where they exist (`tabMenu.*`; add only missing ones); `QuickSwitcher.Result.group(TabGroup)` and `.space(SpaceRecord)` ranked above tabs.
- [ ] **Step 1: Failing tests**: unit — a query matching a group name returns `.group` before matching tabs, and a Space name returns `.space`; UI — `testMoveTabToNewGroupFromMenu`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS on both simulators.
- [ ] **Step 5: Commit**, then open **PR M17a** against `main` (title "iOS M17a: groups, Spaces and This iPhone"), body linking the design and noting the stack. Run copy:check, the iOS suite on both simulators, and `npm run test:unit` first.

# M17b — The protocol in Swift

### Task 10: Vectors for everything iOS ports

**Files:**
- Modify: `scripts/build-ios-sync-vectors.cjs`, `ios/Blanc/BlancTests/Sync/Fixtures/sync-vectors.json` (generated)
- Test: `test/unit/ios-sync-vectors.test.js`

**Interfaces:**
- Produces sections (each entry `{name, input, expected}`): `spacesMergeBlob` (three-way, all six orders asserted in the generator), `spacesMergeIndex`, `spacesSanitize` (junk ids, bad colours, long names, foreign scheme URLs), `spacesExpire`, `spacesRecovery` (`recoveryDecision`), `spacesAdmit`, `spacesOrder` (`orderOf` with invalid keys), `spacesLocalEdits` (`applyLocalEdits`, `settlePending`), `schedulerScript` (a scripted 60-minute run of `createScheduler` with fixed `now`/`monotonic`, work sets, 429s and a restart: each step's pick or null and the snapshot), `closedModel` (`ownEntry`, `mergeDevices`, `applyBudget`, `inbox`, `pruneDismissed`), `sidecar` (export and the receiver's hide decision, including stale `forUpdatedAt`), `tabSnapshotMembership` (the `updatedAt` bump of `src/main/tabsync.js` and binding indices).
- [ ] **Step 1:** Add the sections; `npm run ios:sync-vectors:build`. **Step 2:** `node --test test/unit/ios-sync-vectors.test.js` — PASS. **Step 3: Commit** `git commit -m "Sync vectors for the iOS Shared Spaces port"`

### Task 11: `SharedSpacesModel` — records, merge, positions

**Files:**
- Create: `ios/Blanc/Blanc/Sync/SharedSpacesModel.swift`
- Test: `ios/Blanc/BlancTests/Sync/SharedSpacesModelTests.swift`

**Interfaces:**
- Produces, on `enum SharedSpacesModel` over `JSONValue` (the existing type; records stay JSON so unknown fields relay untouched): `static let limits` (`spaces: 25, tabsPerSpace: 500, tombstoneMs: 2_592_000_000, blobBytes: 520_192`); `field(_ v: JSONValue, _ c: Int64, _ by: String) -> JSONValue`; `mergeField(_:_:name:) -> JSONValue`; `mergeRecord`, `mergeBlob`, `mergeIndex`; `mid(_ a: String, _ b: String) -> String`; `tagOf(_ id: String) -> String`; `keyFor(_ a: String, _ b: String, _ id: String) -> String`; `validKey(_ key: String, _ id: String) -> Bool`; `orderOf(_ records: JSONValue) -> [String]`; `acknowledged(_ fetched:_ pending:name:) -> Bool`; `revisionOf(_:) -> String` (SHA-256 of `canonical`, first 16 hex; reuse the existing canonical serializer in `TabSnapshots`/`JSONValue`); `blobFits(_ blob: JSONValue, encrypt: (String) throws -> SyncEnvelope) -> Bool`; `liveTabCount`, `sanitizeBlob`, `sanitizeIndex`, `expireTombstones(_:now:)`, `effectiveGroup`, `activeTabId`, `relayBlob`, `relayIndex`, `relayInto`, `newerRev`. Each mirrors the same-named export of `src/main/shared-spaces-model.js` lines 1–285; port line by line.
- [ ] **Step 1: Failing tests**, one per vector section: `spacesPositions`, `spacesFields`, `spacesRevision`, `spacesBudget`, `spacesSelections`, `spacesSelectionMerge`, `spacesIndexRevision`, `spacesMergeBlob`, `spacesMergeIndex`, `spacesSanitize`, `spacesExpire`, `spacesOrder`; plus `testMidRandomPairsStayBetween` (10,000 seeded pairs, `a < m < b`, never ends in `0`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17b: Shared Spaces records, merge and positions"`

### Task 12: `SharedSpacesModel` — pending writes and upload plans

**Files:**
- Modify: `ios/Blanc/Blanc/Sync/SharedSpacesModel.swift`
- Test: `ios/Blanc/BlancTests/Sync/SharedSpacesModelTests.swift`

**Interfaces:**
- Produces: `sanitizePending`, `applyLocalEdits(_ pending: JSONValue, _ edits: JSONValue) -> JSONValue`, `settlePending`, `recoveryDecision`, `admit`, `struct PushPlan { mergedBlob, upload: JSONValue?, pendingAfter, recover: Set<String>, unsynced: Set<String>, expiredRecords, reason: String?, nextLastMergeAt: Int64 }`, `pushPlan(fetchedBlob:fetchedVersion:localBlob:pending:lastMergeAt:now:deviceId:encrypt:lastPublishable:admissionOrder:) -> PushPlan`, `settleUpload(_ plan: PushPlan, _ originalPending: JSONValue, blobStored: Bool, indexStored: Bool) -> (pending: JSONValue, indexEntry: JSONValue?)` — ports of `shared-spaces-model.js` lines 286–520.
- [ ] **Step 1: Failing tests** over `spacesPipeline`, `spacesSettlements`, `spacesRelay`, `spacesRecovery`, `spacesAdmit`, `spacesLocalEdits`; plus `testFetchedFalseNeverClearsPendingDelete`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17b: pending writes and upload plans"`

### Task 13: `SyncScheduler`

**Files:**
- Create: `ios/Blanc/Blanc/Sync/SyncScheduler.swift`
- Test: `ios/Blanc/BlancTests/Sync/SyncSchedulerTests.swift`

**Interfaces:**
- Produces: `struct SyncScheduler` port of `src/main/sync-scheduler.js`: `init(limit: Int = 10, windowMs: Int64 = 60_000, log: [Int64], nextClass: String, cursors: [String: String], now: () -> Int64, monotonic: () -> Int64, windowLimit: Int?, backoffUntil: Int64?)`; `mutating func canRequest() -> Bool`; `record() -> Event`; `settle(_:)`; `next(work: [String: [String]]) -> (cls: String, item: String)?`; `markIndexDue()`; `onRateLimited()`; `windowFreesAt() -> Int64`; `snapshot() -> Snapshot` (`log, nextClass, cursors, windowLimit, backoffUntil`). Class order `I, S, F, R`; fixed list `bookmarks, settings, session, icons, sends, closed, shared`.
- [ ] **Step 1: Failing tests**: `schedulerScript` vector replayed step by step; `testNeverMoreThanTenInAnyTrailingMinute` over a simulated hour including a restart and a clock jump back; `testOneRequestPerPassServesIDSFRInTurn` over 1,000 passes with a focus event before each.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17b: desktop's sync request scheduler"`

### Task 14: `SyncedClosed`, `SharedSidecar` and Tab Sync membership

**Files:**
- Create: `ios/Blanc/Blanc/Sync/SyncedClosed.swift`, `ios/Blanc/Blanc/Sync/SharedSidecar.swift`
- Modify: `ios/Blanc/Blanc/Sync/TabSnapshots.swift` (publish groups; membership `updatedAt` bump; filtered-list indices)
- Test: `ios/Blanc/BlancTests/Sync/SyncedClosedTests.swift`, `SharedSidecarTests.swift`, `TabSnapshotsTests.swift`

**Interfaces:**
- Produces: `enum SyncedClosed` with `maxItems = 25`, `itemTTL = 86_400_000`, `entryTTL = 2_592_000_000`, `budgetBytes = 65_536`, and ports of `sanitizeItem`, `normalizeItems`, `ownEntry`, `addItem` (prepend, normalize), `mergeDevices`, `applyBudget`, `inbox`, `pruneDismissed`; `struct ClosedRow: Identifiable { id, url, title, closedAt, fromId: String?, fromName: String? }`. `enum SharedSidecar` with `ownEntry(forUpdatedAt: Int64, bindings: [(i: Int, spaceId: String)]) -> JSONValue` and `hiddenIndices(devices: JSONValue, sessionEntries: JSONValue, visibleSpaceIds: Set<String>) -> [String: Set<Int>]`. `TabSnapshots.ownEntry(tabs:groups:previous:now:membership:)` gains groups and a `membership: String?` that bumps `updatedAt` when it changes, and `bindings(...)` returning `(i, spaceId)` pairs.
- [ ] **Step 1: Failing tests** over `closedModel`, `sidecar`, `tabSnapshotMembership`; existing `sessionMerge` vectors still pass.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17b: synced Recently closed, the shared sidecar, groups in tab sync"`

### Task 15: `SharedSpacesState`

**Files:**
- Create: `ios/Blanc/Blanc/Sync/SharedSpacesState.swift`
- Test: `ios/Blanc/BlancTests/Sync/SharedSpacesStateTests.swift`

**Interfaces:**
- Produces: `@MainActor final class SharedSpacesState` persisted as `shared-spaces.json` in the sync directory (atomic write, 0600 like `SyncStateStore`), the shape of `empty()` in `src/main/shared-spaces.js` (`accountId, enabled, index, knownIndex, blobs, pending, accepted, recoveries, recoveryDone, sidecar, dormantIds, draftIds, requestLog, nextClass, cursors, windowLimit, backoffUntil`); `rebind(accountId:)` clears everything but `requestLog` on a different account and repairs bad containers; `setEnabled(_:)`; `noteLocalSpace(id:blob:edits:)`; `setIndex(_:)`; `mergeIndex(_:)`; `exportIndex(deviceId:now:) -> JSONValue`; `settleIndex(_:)`; `mergeSpace(id:remote:version:deviceId:now:encrypt:) -> PushPlan`; `settleSpace(id:plan:blobStored:indexStored:)`; `setDormant(_:)`; `clear()` (sync off / account switch). Port the same-named functions of `src/main/shared-spaces.js`.
- [ ] **Step 1: Failing tests**: `rebind` to another account clears state but keeps the request log; a readable file with a bad `pending` container is repaired, others kept; `exportIndex` drops ids neither known nor published; a failed upload keeps pending writes; a stale merge moves absent records into `recoveries` once (idempotent on repeat).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS on both simulators (whole suite).
- [ ] **Step 5: Commit**, then open **PR M17b** against `claude/ios-m17a-groups-spaces`.

# M17c — Sync it

### Task 16: Scheduler-driven sync pass and the new stores

**Files:**
- Modify: `ios/Blanc/Blanc/Sync/SyncWorkerClient.swift` (store names: keep `SyncStore` for fixed stores, add `case spaces, closed, shared` and `func get/put(storeName: String …)` accepting `space-<32 hex>`), `ios/Blanc/Blanc/Sync/SyncEngine.swift` (`runPass`)
- Test: `ios/Blanc/BlancTests/Sync/SyncEngineTests.swift`, `SyncWorkerClientTests.swift`

**Interfaces:**
- Consumes: Tasks 13, 15.
- Produces: `SyncEngine.runPass` spends `SyncScheduler.next` turns: class I = `spaces` (only when the switch is on, or when `previewIndex()` asked), S = Space blobs pending-first then `rev` mismatches, F = the seven fixed stores (`closed`, `shared` only with the switch on), R = every Space blob in id order; 409 → merge and retry (three attempts, each GET counted); 429 → `onRateLimited()`; scheduler snapshot saved in `SharedSpacesState` after each request. `SyncEngine.previewIndex() async -> JSONValue?` (read-only index fetch for the Spaces card when the switch is off). `SyncEngine.spacesAvailability: Availability` (`.unknown, .available, .unavailable`).
- [ ] **Step 1: Failing tests** with the existing fake Worker: a pass with 6 fixed stores and 25 Spaces never exceeds 10 GETs in any trailing 60 s; with the switch off no `spaces`/`closed`/`shared`/`space-*` request is made except an explicit `previewIndex()`; `404 unknown store` on `spaces` sets `.unavailable` and Favorites/settings/session/sends still sync (Review Focus 5); a 429 halves the window.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17c: sync passes follow desktop's request scheduler"`

### Task 17: The adapter — records to the shown set and back

**Files:**
- Create: `ios/Blanc/Blanc/Sync/SharedSpacesAdapter.swift`
- Modify: `ios/Blanc/Blanc/TabsManager.swift` (call the adapter after each tab change and after each merge), `ios/Blanc/Blanc/TabSets.swift`
- Test: `ios/Blanc/BlancTests/Sync/SharedSpacesAdapterTests.swift`

**Interfaces:**
- Consumes: Tasks 4, 11, 12, 15.
- Produces: `@MainActor final class SharedSpacesAdapter` with `func localEdits(for set: SpaceRecord, shown: [TabModel]?, baseline: JSONValue, deviceId: String, now: Int64) -> (edits: JSONValue, baseline: JSONValue)` (new tab → fresh `tabId`, `pos` via `keyFor`, every field clocked; URL/title → `nav`; pin, group, position → that field; missing → `deleted: true`; groups and identity likewise; F46 `name` copied, never cleared); `func apply(merged: JSONValue, to set: inout SpaceRecord, shown: TabsManager?, baseline: JSONValue, protectedTabId: String?) -> (baseline: JSONValue, accepted: JSONValue, closed: [ClosedRow])` (one pass; new records become quiet tabs at their position; tombstones close the tab without Undo and return a `ClosedRow` labelled with `deleted.by`; `nav` navigates a live tab or rewrites a quiet one; a protected tab's `nav`/tombstone goes to `accepted` and the baseline for it stays); `func reconcileLibrary(state: SharedSpacesState, into manager: TabsManager)` (switch on: every live, non-dormant, non-draft library Space becomes a `SpaceRecord` with `link: .active`; tombstoned ones are removed unless shown); `func applyAccepted(for tabId: String)` called by `setActive`, on leaving the Space and once at cold start (not on foreground).
- [ ] **Step 1: Failing tests** (pure, with a fake shown set): remote close of a background tab closes it and returns a `ClosedRow` with the tombstone writer's device; remote `nav` of the selected tab is deferred and the next `localEdits` produces nothing for it; selecting another tab applies it; an app foreground does not apply it but a cold start does (Review Focus 2); an unrelated local close during a deferral publishes only that close; applied changes produce no echo edits; a new remote tab arrives quiet at its position; a custom `name` round-trips unchanged.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17c: shared Space records drive the shown tabs"`

### Task 18: The switch and its sheets

**Files:**
- Modify: `ios/Blanc/Blanc/SyncSettingsView.swift`
- Create: `ios/Blanc/Blanc/SharedSpacesSheet.swift`
- Test: `ios/Blanc/BlancUITests/SharedSpacesUITests.swift`, seed `-BlancUITestSharedSpaces` (a seeded synced account with a fake Worker library, the pattern `UITestSeed.seedSends` uses)

**Interfaces:**
- Consumes: Tasks 4, 15–17.
- Produces: the toggle "Keep Spaces and groups in sync on this iPhone" (new key `sharedSpaces.switch.iphone`, line `sharedSpaces.switch.line.iphone` = "Tabs in your shared Spaces are synced from this iPhone.", and `sharedSpaces.accountLine`), shown only while Profile Sync is on, identifier `sync.spaces`; the first-time sheet (`sharedSpaces.title`, `.explanation`, `.count`, ticks, oversized rows disabled with `sharedSpaces.full`, a leading "Save This iPhone as a Space" row, `.confirm`/`.cancel`); off → dormant links (`sharedSpaces.offLine` footer); on again → Rejoin / Add as a copy per dormant Space; `.unavailable` text when `spacesAvailability == .unavailable`; the "{count} shared Spaces are waiting" note (new key `sharedSpaces.waitingCount`, plural) when the switch is off and the previewed index has live Spaces.
- [ ] **Step 1: Failing UI test** `testTurnOnSharesTickedSpaces` (seed two local Spaces, one oversized: the oversized row is disabled; confirming shows the sync mark on the other in the Spaces card); unit test: off then on with no edits leaves the library unchanged (Rejoin).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS on both simulators.
- [ ] **Step 5: Commit** `git commit -m "iOS M17c: Keep Spaces and groups in sync on this iPhone"`

### Task 19: Bring a Space (switch off)

**Files:**
- Create: `ios/Blanc/Blanc/BringSpaceSheet.swift`
- Modify: `ios/Blanc/Blanc/SpacesCard.swift` (fill `DeviceSpaces` from the previewed index when the switch is off), `ios/Blanc/Blanc/QuickSwitcher.swift` (remote Space results)
- Test: `ios/Blanc/BlancUITests/SharedSpacesUITests.swift`

**Interfaces:**
- Consumes: Task 16's `previewIndex()`; `SyncEngine.previewSpace(id:) async -> JSONValue?` (one GET into an in-memory cache dropped on dismiss, never into `SharedSpacesState`).
- Produces: the review sheet (name, tile, groups with tabs, count; **Bring to iPhone**, new key `bringSpace.action`; the line "This copy won't change when the Space changes on {device}. Turn on Spaces sync to keep them together." new key `bringSpace.copyNote`, with a link to Settings → Sync); bringing creates a local `SpaceRecord` with fresh ids and no link, shows it, tabs quiet, only the saved selection (or first tab) woken; disabled at 25 with `sharedSpaces.count`.
- [ ] **Step 1: Failing UI test** `testBringSpaceCopiesAndShows` (seeded remote library, switch off: card lists "On MacBook Pro" → review → Bring → mark shows the Space, grid shows its groups); unit: the cache is never written to `shared-spaces.json`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17c: Bring a Space"`

### Task 20: Recently closed band

**Files:**
- Create: `ios/Blanc/Blanc/RecentlyClosedStore.swift` (local 24 h / 25 items), `ios/Blanc/Blanc/RecentlyClosedSection.swift`
- Modify: `ios/Blanc/Blanc/PaletteSheet.swift` (band among the groups), `ios/Blanc/Blanc/TabsManager.swift` (`closeTab` records), `ios/Blanc/Blanc/Sync/SyncEngine.swift` (publish own `closed` entry with the switch on)
- Test: `ios/Blanc/BlancTests/RecentlyClosedTests.swift`, `ios/Blanc/BlancUITests/SharedSpacesUITests.swift`

**Interfaces:**
- Consumes: Task 14's `SyncedClosed`, Task 17's `ClosedRow`.
- Produces: `closeTab` adds a `ClosedRow` for http(s), non-private tabs (quiet ones use their saved URL and title, Review Focus 3), id = the shared `tabId` when in a shared Space, else a fresh UUID; `PaletteSheet` band headed `closed.header`, rows newest first, remote rows labelled `sharedSpaces.closedOn`, swipe action `closed.forget`, `closed.clear`; tapping reopens as a new tab in the shown set.
- [ ] **Step 1: Failing tests**: unit — a private tab is never recorded; a quiet tab's row has its saved URL; a page closed here and also listed by another device under the same id shows once; UI — `testRemoteCloseLandsInRecentlyClosed` (seeded remote tombstone for a background tab → row "Closed on MacBook Pro").
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17c: synced Recently closed"`

### Task 21: Status, full Spaces, recovery, other devices shown once

**Files:**
- Modify: `ios/Blanc/Blanc/SpacesCard.swift`, `ios/Blanc/Blanc/TabGridView.swift`, `ios/Blanc/Blanc/SyncSettingsView.swift`, `ios/Blanc/Blanc/PaletteSheet.swift` (Other devices hides sidecar-bound tabs), `ios/Blanc/Blanc/PagesBridge.swift` (start page's devices data), `ios/Blanc/Blanc/Sync/SyncEngine.swift` (publish own sidecar)
- Test: `ios/Blanc/BlancTests/Sync/SyncEngineTests.swift`, `ios/Blanc/BlancUITests/SharedSpacesUITests.swift`

**Interfaces:**
- Produces: `SpaceRowState` filled from `SharedSpacesState` (pending → waiting; failures > 1 h → notSynced; plan reason full → full; unavailable); a tab past a full Space's budget shows a dot with accessible text `sharedSpaces.unsyncedTab`; Settings → Sync status lines `sharedSpaces.capacity`, `.tombstones`, `.busy`, `.slowed`; the recovery Space named with a new iOS key `sharedSpaces.recoveryName.iphone` = "{name} · kept on this iPhone" and the one-time `sharedSpaces.recoveryNote`; other devices' sidecar-bound tabs hidden from Other devices, the start page and the Quick Switcher.
- [ ] **Step 1: Failing tests**: a desktop entry with a matching sidecar hides exactly the bound indices; a stale `forUpdatedAt` hides nothing; a same-URL unbound tab stays; a Space over budget reports `.full`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "iOS M17c: sync status, full Spaces, recovery and shown-once devices"`

### Task 22: Spec, copy and the two-device check, then PR M17c

**Files:**
- Modify: `spec/features.md` (F3, F27, F40, F41 iOS notes), `spec/parity-matrix.md` (F3, F40, F41 iOS → IMPLEMENTED (M17)), `copy/messages/*.json` (any key still missing a language)

- [ ] **Step 1:** `npm run copy:build && npm run copy:check && npm run substrate:check && npm run ios:sync-vectors:check && npm run test:unit` — all PASS.
- [ ] **Step 2:** iOS suite on 26.5 and 27.0 — PASS.
- [ ] **Step 3: Two-device check** against the deployed Worker: desktop dev build (`npm start`, switch on) and the 26.5 simulator paired to the same test account; in both directions create a Space, add, navigate, group, close and delete; confirm the selected tab defers and Recently closed shows "Closed on". Record what was done and seen in the PR body.
- [ ] **Step 4: Commit**, open **PR M17c** against `claude/ios-m17b-protocol`, watch CI with one bounded background loop, merge each PR only when every check on its head commit passes, bottom of the stack first.
