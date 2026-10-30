# iOS M18: First Minute and Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Blanc for iPhone from public TestFlight beta to App Store-ready: the first-minute walkthrough, native strings in six languages, Background App Refresh, the launch ping, a share extension and the App Store listing.

**Architecture:** Six PRs in the owner's order (design §9), each passing the iOS `xctest` CI on its own. Swift reads every string from the existing catalog (`copy/messages` → bundled `strings.<locale>.js` → `SyncCopy`). New logic lives in small pure types with XCTest coverage (`WalkthroughFlow`, `BackgroundRefresh`, `LaunchPing`, `DefaultBrowserStatus`, `SharedLink`), with thin SwiftUI on top. The ping Worker gets an `ios` namespace that the owner deploys.

**Tech Stack:** SwiftUI + WKWebView (iOS 18.4 minimum, Xcode 26.6, no SPM), BackgroundTasks, a share extension target, Node `node --test` guards, Cloudflare Worker JS.

**Spec:** [`docs/superpowers/specs/2026-10-30-ios-m18-first-minute-release-readiness-design.md`](../specs/2026-10-30-ios-m18-first-minute-release-readiness-design.md) (and its parent, the 1.0 companion design).

## Global Constraints

- iOS 18.4 minimum; SwiftUI with `WKWebView`; no SPM packages, in the app and the extension alike.
- Every user-visible string comes from `copy/messages/en.json`, with de, es, fr, it and pt-BR updated in the same PR and acknowledged with `npm run copy:ack -- <locale> <keys>`; never hand-edit generated files.
- Plain language, US spellings; the bottom bar is "the Island" in all copy and docs.
- Every PR passes the iOS `xctest` CI job (iPhone 17, iOS 26.5, Xcode 26.6, 45-minute limit), `npm run test:unit` and `npm run copy:check`.
- After each PR builds, install its Debug build on the owner's iPhone Air (`00008150-001C2CE83EF0401C`).
- No merge, TestFlight upload, App Store Connect change or Worker deploy without the owner's explicit yes, every time.
- `ios/Blanc/Blanc.entitlements` stays empty until Apple grants `com.apple.developer.web-browser` (request `P2X5BCD4C9`).
- Never create a `WKWebView` or a `TabsManager` before the window is on screen (the iOS 26 touch-delivery crash, `BlancApp.swift`).
- `Xcode 26 can't type-check a long ContentView.body`: keep new bindings and subviews as properties.
- Keys under `ios.*` unless desktop's key carries exactly the same words.

## Review Focus

1. **A link or a pairing QR arrives while the walkthrough is up** (share sheet, another app, the Camera app): the link opens in a tab behind the card and the card stays put; a pair link goes through the existing confirmation and lands the card on What arrived. Test in Task 11.
2. **A language outside the six** (Japanese) or a key missing from a translation: the app shows English, never a raw key such as `ios.island.newTab`. Test in Task 3.
3. **Background refresh fires after the person disconnected sync, or while the account is mid-switch:** the pass does nothing and keeps nothing; the next foreground pass doesn't apply stale data from the old account. Test in Task 7.
4. **The app goes background → foreground many times in one launch, or is relaunched by iOS for background refresh:** exactly one ping per foreground launch, none for a background-only launch. Test in Task 13.
5. **The share sheet hands Blanc something that isn't one http(s) URL** (`file:`, `javascript:`, text with two links, a `blanc.day/pair#…` link): nothing opens except through `IncomingLinks`, and a pair link still asks first. Tests in Tasks 14 and 15.

---

## PR 0: design and plan (docs only)

### Task 0: Docs PR

**Files:**
- Create: `docs/superpowers/specs/2026-10-30-ios-m18-first-minute-release-readiness-design.md`
- Create: `docs/superpowers/plans/2026-10-30-ios-m18-first-minute-release-readiness.md`
- Modify: `docs/superpowers/specs/2026-10-24-ios-v1-companion-release-design.md` (§7 ladder, §8 entitlement status)

- [ ] **Step 1:** `npm run test:unit` passes (docs-only, but the site claims ledgers read docs).
- [ ] **Step 2:** Commit on `claude/ios-m18-docs`, push, open the PR, wait for checks, ask the owner to merge.

---

## PR 1: native strings in six languages (design §4)

Branch `claude/ios-m18-strings` from `main` after PR 0 merges.

### Task 1: The guard test

**Files:**
- Create: `test/unit/ios-native-strings.test.js`

**Interfaces:**
- Produces: the allowlist other tasks extend, `ALLOWED_FILES = ['UITestSeed.swift']`.

- [ ] **Step 1: Write the failing test.** It reads every `ios/Blanc/Blanc/**/*.swift` and `ios/BlancShare/**/*.swift` (if present), strips `//` and `///` comments, and fails on a string literal containing two or more letters passed as the first argument to `Text(`, `Button(`, `Label(`, `Toggle(`, `TextField(`, `SecureField(`, `Section(`, `Menu(`, `Link(`, `.navigationTitle(`, `.accessibilityLabel(`, `.accessibilityHint(`, `.accessibilityValue(`, `.accessibilityAction(named:`, `.alert(`, `.confirmationDialog(`, `.help(`, or assigned to `.accessibilityLabel =`. It also fails on the bare literals `"Start Page"`, `"New Tab"` and `"Tab"` used as titles. Exempt: interpolations with no letters outside `\( … )` (`"\(count)"`), `systemImage:` arguments, and `ALLOWED_FILES`. Message: `file:line: move "<text>" to copy/messages (design §4)`.

```js
test('Swift draws no hard-coded English', () => {
  assert.deepEqual(offenders(), []);
});
test('the guard catches each form it claims to', () => {
  for (const line of ['Text("Open tabs")', '.accessibilityLabel("Show all tabs")', 'button.accessibilityLabel = "Page actions"',
    'Button("Done") { dismiss() }', '.accessibilityAction(named: "Show all tabs") {}', 'return "Start Page"']) {
    assert.equal(scan(line).length, 1, line);
  }
  for (const line of ['Text("\\(count)")', 'Image(systemName: "plus")', 'Label(SyncCopy.text("ios.island.newTab"), systemImage: "plus")']) {
    assert.equal(scan(line).length, 0, line);
  }
});
```

- [ ] **Step 2:** `node --test test/unit/ios-native-strings.test.js`. Expected: the first test FAILS, listing about 35 offenders in `ContentView`, `PaletteSheet`, `TabGridView`, `QuickSwitcher`, `IslandMarkButton`, `AppIconChoice` and `PagesBridge`; the second PASSES.
- [ ] **Step 3:** Commit: `iOS strings: guard against hard-coded English (failing)`. Task 2 makes it pass in the same PR.

### Task 2: Move the strings into the catalog

**Files:**
- Modify: `copy/messages/en.json`, `de.json`, `es.json`, `fr.json`, `it.json`, `pt-BR.json`
- Modify: `ios/Blanc/Blanc/ContentView.swift`, `PaletteSheet.swift`, `TabGridView.swift`, `QuickSwitcher.swift`, `IslandMarkButton.swift`, `AppIconChoice.swift`, `PagesBridge.swift`
- Test: `ios/Blanc/BlancTests/NativeCopyTests.swift` (new)

**Interfaces:**
- Consumes: `SyncCopy.text(_:)`, `SyncCopy.text(_:_:)`, `SyncCopy.plural(_:count:_:)`.
- Produces: the `ios.island.*`, `ios.palette.*`, `ios.tabs.*` keys below, and `TabTitle.display(_ tab: TabModel) -> String` in `TabGridView.swift`'s neighbor file `TabTitle.swift` (new), the one place that turns a tab into its title ("Start Page" for the new-tab URL, the page title, else the host, else "Tab"), used by `ContentView`, `PaletteSheet`, `TabGridView` and `QuickSwitcher`.

Keys (English as in the code today, except where noted):

| Key | English |
|---|---|
| `ios.island.searchOrSwitch` | `Search or switch tabs, {domain}` |
| `ios.island.showAllTabs` | `Show all tabs` |
| `ios.island.tabCount` | `{count, plural, one {# tab} other {# tabs}}` |
| `ios.island.newTab` | `New tab` |
| `ios.island.reload` | `Reload page` |
| `ios.island.stop` | `Stop loading` |
| `ios.island.pageActions` | `Page actions` |
| `ios.island.collapse` | `Collapse Island` |
| `ios.palette.placeholder` | `Search, enter address, or / command` |
| `ios.palette.clear` | `Clear search` |
| `ios.palette.openTabs` | `Open tabs` |
| `ios.palette.noCommand` | `No matching command` |
| `ios.palette.noMatches` | `No matches. Tap Go to open it as an address or search.` (the em dash goes, as plain language) |
| `ios.tabs.switchTo` | `Switch to {title}` |
| `ios.tabs.close` | `Close {title}` |
| `ios.tabs.startPage` | `Start Page` |
| `ios.tabs.untitled` | `Tab` |
| `ios.tabs.newTabTitle` | `New Tab` |
| `ios.common.ok` | `OK` |
| `ios.appIcon.sunriseDawn` | `Sunrise Dawn` |
| `ios.pages.syncUnavailable`, `ios.pages.supporterUnavailable` | today's two `PagesBridge` messages |

`Done` reuses `SettingsCopy.text("done")` (`shield.done`). `PagesBridge`'s `.reject(...)` developer errors (never shown) stay English and get an inline `// not user-visible` marker the guard skips.

- [ ] **Step 1: Write the failing test** `NativeCopyTests.testEveryIOSKeyResolves`: for every key above, `SyncCopy.text(key) != key`; and `testTabTitle`: a tab at `TabsManager.newTabURL` → `SyncCopy.text("ios.tabs.startPage")`, an untitled `https://example.com/` → `"example.com"`, a titled tab → its title.
- [ ] **Step 2:** Run `xcodebuild test -project ios/Blanc/Blanc.xcodeproj -scheme Blanc -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:BlancTests/NativeCopyTests`. Expected: FAIL (keys missing, `TabTitle` undefined).
- [ ] **Step 3:** Add the keys to `en.json` with a `note` naming the surface, translate them into the five locales, run `npm run copy:build`, then `npm run copy:ack -- <locale> <keys>` for each locale.
- [ ] **Step 4:** Replace every literal in the Swift files with `SyncCopy` calls and `TabTitle.display`.
- [ ] **Step 5:** Run the Task 2 XCTest, `node --test test/unit/ios-native-strings.test.js`, and `npm run copy:check`. Expected: all PASS.
- [ ] **Step 6:** Run the UI tests that read these labels (`SlashCommandUITests`, `PillButtonsUITests`, `TabGridSwipeUITests`, `TabUndoUITests`). Expected: PASS (they run in English).
- [ ] **Step 7:** Commit: `iOS strings: the Island, palette and tab grid read the catalog`.

### Task 3: Slash-command hints from the catalog, and the English fallback

**Files:**
- Modify: `ios/Blanc/Blanc/SlashCommand.swift` (`hint`), `ios/Blanc/Blanc/Sync/SyncCopy.swift` (fallback)
- Delete: `ios/Blanc/Blanc/SlashCommands.strings`
- Modify: `copy/lib/cli.mjs` (stop writing `copy/generated/SlashCommands.strings`; keep the Android XML), and delete that generated file
- Modify: `spec/shared-substrate.md` (where it names the `.strings` file)
- Test: `ios/Blanc/BlancTests/SlashCommandTests.swift`, `NativeCopyTests.swift`

**Interfaces:**
- Produces: `SlashCommand.hint` returns `SyncCopy.text("slash.\(camel).hint")`, the key `copy/lib/cli.mjs`'s `slashKey(command, 'hint')` builds (`/close-group` → `slash.closeGroup.hint`). `hintKey` is removed; `/reader` keeps `ReaderCopy`.
- Produces: `SyncCopy` loads `strings.en.js` too and falls back to it, key by key, when the resolved locale's file lacks a key; only a key missing from English returns the key.

- [ ] **Step 1: Write the failing tests:** `testEveryOfferedCommandHasACatalogHint` (for each `SlashCommand.available`, `hint` doesn't start with `slash.` and isn't empty); `testFallbackToEnglishPerKey` (with `SyncCopy.messages(locale: "de", catalog: ["a": "A-de"], english: ["a": "A", "b": "B"])`, `b` resolves to `"B"`); `testUnknownLanguageIsEnglish` (`BlancPageResolver.resolvedLocale(preferred: ["ja-JP"]) == "en"`).
- [ ] **Step 2:** Run them. Expected: FAIL (`hint` still reads the table; no `messages(locale:catalog:english:)` seam).
- [ ] **Step 3:** Implement: the `hint` change, `static func messages(locale:catalog:english:) -> [String: String]` as the seam `SyncCopy`'s loader uses, the `cli.mjs` change, the deletions.
- [ ] **Step 4:** Run the XCTests, `npm run copy:check`, `npm run test:unit`. Expected: PASS.
- [ ] **Step 5:** Commit: `iOS strings: slash-command hints from the catalog, English per-key fallback`.

### Task 4: The per-app language setting

**Files:**
- Modify: `ios/Blanc/Blanc.xcodeproj/project.pbxproj` (`knownRegions`), `ios/Blanc/Info.plist` (`CFBundleLocalizations`)
- Test: `test/unit/ios-native-strings.test.js` (one more test)

- [ ] **Step 1: Write the failing test** `the app declares the six languages`: `knownRegions` contains `en, de, es, fr, it, pt-BR, Base`, and `Info.plist`'s `CFBundleLocalizations` array is exactly `en, de, es, fr, it, pt-BR` (the same set `InfoPlist.xcstrings` carries).
- [ ] **Step 2:** Run it. Expected: FAIL (`knownRegions` is `en, Base`).
- [ ] **Step 3:** Add both declarations.
- [ ] **Step 4:** Run it. Expected: PASS. Build and launch on the simulator, then check that Settings → Apps → Blanc shows a Language row.
- [ ] **Step 5:** Commit: `iOS: declare the six languages so iOS offers a per-app language`.

### Task 5: German pass, device install, PR

- [ ] **Step 1:** On the M18 simulator, set Blanc's language to German, then screenshot the Island, the palette (empty, with `/`, with no matches), the tab grid and Settings. Expected: no English, no truncation mid-word, no overlap. Fix any key that overflows by shortening the translation, not by shrinking type.
- [ ] **Step 2:** Install the Debug build on the owner's iPhone Air: `xcodebuild -project ios/Blanc/Blanc.xcodeproj -scheme Blanc -configuration Debug -destination 'id=00008150-001C2CE83EF0401C' build`, then `xcrun devicectl device install app --device 00008150-001C2CE83EF0401C <Blanc.app>`.
- [ ] **Step 3:** Push, open the PR with the German screenshots, and wait for `xctest`, `unit` and `substrate`. Ask the owner to merge.

---

## PR 2: Background App Refresh (design §6)

Branch `claude/ios-m18-background-refresh`. Independent of PR 1.

### Task 6: Fetch and keep, without a manager

**Files:**
- Modify: `ios/Blanc/Blanc/Sync/SyncEngine.swift`, `ios/Blanc/Blanc/Sync/SyncStateStore.swift`, `ios/Blanc/Blanc/TabsManager.swift` (engine ownership)
- Create: `ios/Blanc/Blanc/Sync/SyncInbox.swift`
- Test: `ios/Blanc/BlancTests/Sync/SyncInboxTests.swift`

**Interfaces:**
- Produces: `struct SyncInbox: Codable { var accountId: String; var fetchedAt: Date; var documents: [String: JSONValue] }`, stored in the app container beside `SyncStateStore`'s file. `documents` is keyed by store class and item as the engine already names them (`SyncScheduler.next(work:)`).
- Produces: `SyncEngine.fetchAndKeep(deadline: Date) async -> SyncInbox?`. It runs the read half of a pass under the existing `SyncScheduler` limit, writes the inbox, publishes nothing, and touches no sink. It returns `nil` with no account.
- Produces: `SyncEngine.applyInbox() async`, called at the start of `appDidBecomeActive()`. It applies a kept inbox only when `inbox.accountId` equals the current account, then deletes it. A foreground pass then skips the fetches the inbox already covered within the last 60 seconds.
- Produces: `SyncEngine` can be built without a `TabsManager` (`static func background() -> SyncEngine?`, reading the stored account and secrets only). Its sinks are set when a manager adopts it.

- [ ] **Step 1: Write the failing tests:** `testFetchAndKeepPublishesNothing` (a fake `SyncWorkerClient` records requests: GETs only, no PUT); `testFetchAndKeepWithoutAccountKeepsNothing`; `testApplyInboxIgnoresAnotherAccount` (an inbox for account A, engine on B: nothing applied, inbox deleted); `testApplyInboxThenPassSkipsFreshFetches`; `testDeadlineStopsAndKeepsWhatArrived` (deadline already past after the first response: the inbox has that one document).
- [ ] **Step 2:** Run `-only-testing:BlancTests/SyncInboxTests`. Expected: FAIL.
- [ ] **Step 3:** Implement. Read `runPass` first and split its fetch steps from its apply steps without changing foreground behavior. The existing `SyncEngineTests` must still pass unchanged.
- [ ] **Step 4:** Run `SyncInboxTests` and the whole `BlancTests/Sync` group. Expected: PASS.
- [ ] **Step 5:** Commit: `iOS sync: fetch and keep without a manager, apply at the next foreground`.

### Task 7: Schedule and run it

**Files:**
- Create: `ios/Blanc/Blanc/BackgroundRefresh.swift`
- Modify: `ios/Blanc/Blanc/BlancApp.swift`, `ios/Blanc/Info.plist`, `ios/Blanc/Blanc/SyncSettingsView.swift` (footer), `copy/messages/*.json`
- Test: `ios/Blanc/BlancTests/BackgroundRefreshTests.swift`

**Interfaces:**
- Consumes: `SyncEngine.background()`, `fetchAndKeep(deadline:)`.
- Produces: `enum BackgroundRefresh { static let identifier = "me.bnfy.blanc.sync"; static let delay: TimeInterval = 15 * 60; static func request(now: Date) -> BGAppRefreshTaskRequest; static func shouldSchedule(hasAccount: Bool, status: UIBackgroundRefreshStatus) -> Bool }`.
- Produces: key `ios.sync.backgroundRefreshOff`, English: `Background App Refresh is off for Blanc, so changes arrive when you open it. Turn it on in iOS Settings → Apps → Blanc.`

- [ ] **Step 1: Write the failing tests:** `testRequestIsFifteenMinutesOut`; `testNoScheduleWithoutAccount`; `testNoScheduleWhenDenied` (`.denied` and `.restricted` → false); `testIdentifierIsPermitted` (the identifier appears in the bundle's `BGTaskSchedulerPermittedIdentifiers`); `testDisconnectedMidPassKeepsNothing` (Review Focus 3: the account is removed between the scheduling and the run, so `fetchAndKeep` returns nil and no inbox file exists).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. `Info.plist` gets `BGTaskSchedulerPermittedIdentifiers` = `[me.bnfy.blanc.sync]` and `UIBackgroundModes` = `[fetch]`. `BlancApp` adds `.backgroundTask(.appRefresh(BackgroundRefresh.identifier))`, which builds the engine with `SyncEngine.background()`, runs `fetchAndKeep(deadline: now + 25 s)` and schedules the next request. `BlancApp` submits a request when `scenePhase` becomes `.background` and `shouldSchedule` is true. The Settings → Sync footer shows the new line when the status is `.denied`. Add the key in six languages.
- [ ] **Step 4:** Run the tests and the guard. Expected: PASS.
- [ ] **Step 5:** Install on the owner's iPhone Air. Pause in the debugger and run `e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"me.bnfy.blanc.sync"]`, then confirm an inbox file appears and the next foreground shows a desktop change made while the phone was in the background. Record the result in the PR.
- [ ] **Step 6:** Commit, push, open the PR, wait for CI, ask the owner to merge.

---

## PR 3: the walkthrough and the default-browser offer (design §3, §5)

Branch `claude/ios-m18-walkthrough`, after PR 1 (it adds strings under the guard).

### Task 8: Extract `PairWithBlancView`

**Files:**
- Create: `ios/Blanc/Blanc/PairWithBlancView.swift`
- Modify: `ios/Blanc/Blanc/SyncSettingsView.swift`

**Interfaces:**
- Produces: `struct PairWithBlancView: View { init(engine: SyncEngine, onJoined: @escaping (String) -> Void) }`, holding today's off-state pairing UI (the scanner first, the code field, Other ways to join) moved out of `SyncSettingsView`. `onJoined` receives the sync name. Settings passes today's behavior.

- [ ] **Step 1:** Run `SettingsUITests` on `main`'s code. Expected: PASS (the baseline).
- [ ] **Step 2:** Move the code, with no behavior change.
- [ ] **Step 3:** Run `SettingsUITests` and `PairScannerTests` again. Expected: PASS, identical.
- [ ] **Step 4:** Commit: `iOS: pull Pair with your Blanc into its own view`.

### Task 9: The step machine

**Files:**
- Create: `ios/Blanc/Blanc/WalkthroughFlow.swift`
- Test: `ios/Blanc/BlancTests/WalkthroughFlowTests.swift`

**Interfaces:**
- Produces:

```swift
enum WalkthroughStep: Equatable { case welcome, pair, arrived, shareBack, privacy, defaultBrowser }
struct WalkthroughFlow {
    static let version = 1
    init(paired: Bool, completedVersion: Int, offerDefaultBrowser: Bool, isDefaultBrowser: Bool?)
    var current: WalkthroughStep? { get }      // nil = don't show
    mutating func pairWithBlanc()               // welcome → pair
    mutating func browseWithoutPairing()        // welcome → privacy
    mutating func joined()                      // pair (or a confirmed pair link from any step) → arrived
    mutating func next()                        // arrived → shareBack → privacy → defaultBrowser? → nil
    mutating func close() -> Bool               // → nil; true if privacy must be saved with its shown/default value
}
```

`defaultBrowser` is skipped when `offerDefaultBrowser` is false or `isDefaultBrowser == true`.

- [ ] **Step 1: Write the failing tests:** fresh unpaired → `.welcome`; `completedVersion == 1` → `nil`; paired with `completedVersion == 0` → `.shareBack`; pair path visits `welcome, pair, arrived, shareBack, privacy` then `nil` (offer off); browse path visits `welcome, privacy` then `nil`; with the offer on and `isDefaultBrowser` false or nil, `defaultBrowser` comes after `privacy`, and with it true it is skipped; `close()` from `welcome`, `pair`, `arrived` and `shareBack` returns true and from `defaultBrowser` false (privacy already saved); `joined()` from `shareBack` (a pair link mid-flow) moves to `arrived`.
- [ ] **Step 2:** Run `-only-testing:BlancTests/WalkthroughFlowTests`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `iOS walkthrough: the step machine`.

### Task 10: The default-browser status and offer

**Files:**
- Create: `ios/Blanc/Blanc/DefaultBrowserStatus.swift`
- Modify: `ios/Blanc/Blanc/SettingsSheet.swift` (a Browsing row behind the switch), `copy/messages/*.json`
- Test: `ios/Blanc/BlancTests/DefaultBrowserStatusTests.swift`

**Interfaces:**
- Produces: `enum DefaultBrowserOffer { static let enabled = false }`, flipped only in the entitlement PR.
- Produces: `@MainActor final class DefaultBrowserStatus: ObservableObject { @Published private(set) var isDefault: Bool?; init(check: @escaping () throws -> Bool = { try UIApplication.shared.isDefault(.webBrowser) }); func refresh() }`. `refresh()` calls `check` at most once per `refresh()` and maps a throw to `nil`. Callers invoke it only when a screen showing the answer appears or the app returns from the default-apps setting.
- Produces: keys `ios.defaultBrowser.title` "Open links in Blanc", `.body` "Make Blanc your default browser so links from Messages, Mail and other apps open here.", `.open` "Open Settings", `.notNow` "Not now", `.done` "Blanc is your default browser", `.row` "Default browser", `.isBlanc` "Blanc", `.notBlanc` "Not Blanc".

- [ ] **Step 1: Write the failing tests:** a throwing check → `isDefault == nil`; a true check → `true`; two `refresh()` calls → the check runs twice and never more (counted); `DefaultBrowserOffer.enabled == false`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. The Settings row is drawn only `if DefaultBrowserOffer.enabled`. **Open Settings** opens `UIApplication.openDefaultApplicationsSettingsURLString`. Add the keys in six languages.
- [ ] **Step 4:** Run the tests and the guard. Expected: PASS.
- [ ] **Step 5:** Commit: `iOS: default-browser status and offer, hidden until Apple grants the entitlement`.

### Task 11: The walkthrough card

**Files:**
- Create: `ios/Blanc/Blanc/WalkthroughSheet.swift`, `ios/Blanc/Blanc/WalkthroughArrived.swift`
- Modify: `ios/Blanc/Blanc/ContentView.swift` (presentation), `ios/Blanc/Blanc/SettingsStore.swift` (`walkthroughCompletedVersion`, `usagePing` saved state), `ios/Blanc/Blanc/SettingsSheet.swift` (Privacy switch, "Show the welcome again"), `ios/Blanc/BlancSettings.swift` if the schema needs the new device-local key, `settings-schema/schema.json` (+ `npm run settings:build`), `copy/messages/*.json`
- Test: `ios/Blanc/BlancTests/WalkthroughStoreTests.swift`, `ios/Blanc/BlancUITests/WalkthroughUITests.swift`, and the existing UI tests' launch arguments

**Interfaces:**
- Consumes: `WalkthroughFlow`, `PairWithBlancView`, `DefaultBrowserStatus`, `DefaultBrowserOffer.enabled`.
- Produces: `SettingsStore.walkthroughCompletedVersion: Int` (device-local, default 0, never synced); `SettingsStore.usagePingSaved: Bool?` (nil until saved; the ping in Task 13 reads only this); `SettingsStore.saveUsagePing(_ on: Bool)`.
- Produces: launch argument `-BlancSkipWalkthrough` for existing UI tests, which sets `walkthroughCompletedVersion = WalkthroughFlow.version`. Add it to every existing UI test's launch, or to the shared launch helper if one exists.
- Produces: keys `ios.welcome.title` "Your Blanc, in your pocket.", `.body` "Bring the tabs, Spaces and Favorites from Blanc on your computer.", `.pair` (reuse `ios.settings.pairWithBlanc` if its words match), `.browse` "Browse without pairing", `.connected` "Connected to “{name}”", `.arrived` "Here's what arrived", `.tabsOn` "Open tabs on {device}", `.favorites` "Favorites", `.settings` "Your settings", `.spaces` "Spaces", `.spacesLater` (the pairing design's "where to turn it on" line), `.continue` "Continue", `.shareTitle`, `.privacyTitle`, `.measureUsage` "Measure usage", `.measureUsageHelp` (one launch ping, with a link to blanc.day/privacy), `.showAgain` "Show the welcome again". The two share-back switches reuse their Settings keys.

- [ ] **Step 1: Write the failing unit tests:** `usagePingSaved` is nil on a fresh store and `saveUsagePing(false)` persists across reload; `walkthroughCompletedVersion` persists and is not in the synced payload (`SyncedSettings` encodes no such key).
- [ ] **Step 2: Write the failing UI tests:** fresh launch shows the card with "Your Blanc, in your pocket."; **Browse without pairing** → Privacy → **Continue** closes the card (offer off), and relaunching shows no card; swiping the Welcome card down closes it and saves the default; Settings → **Show the welcome again** shows Welcome; with the card on screen, `IncomingLinkUITests`' link path opens a tab and the card is still shown (Review Focus 1).
- [ ] **Step 3:** Run them. Expected: FAIL.
- [ ] **Step 4:** Implement: a `.sheet` on `ContentView` with content-sized detents, a ✕ from Pair on, a cross-fade between steps, and What arrived counting from the first pass after `joined()` (the rows show progress until then; Continue never waits). A confirmed `PairLinkRequest` calls `flow.joined()`. Add the keys in six languages.
- [ ] **Step 5:** Run the unit tests, `WalkthroughUITests`, the full UI suite on iPhone 17 (with the skip argument), the guard and `npm run settings:check`. Expected: PASS.
- [ ] **Step 6:** Screenshot each card on the M18 simulator, light and dark, English and German. Send the screenshots to the owner before the PR asks for review.
- [ ] **Step 7:** Install on the owner's iPhone Air with the app deleted first (a fresh install), then walk the pair path against the owner's desktop. Commit, push, open the PR, wait for CI, ask the owner to merge.

---

## PR 4: the launch ping (design §7)

Two PRs: 4a (Worker, owner deploys) before 4b (phone). 4b is not uploaded to TestFlight until 4a is deployed **and** the App Privacy label is updated (checklist item 16).

### Task 12: Worker, the `ios` namespace (PR 4a)

**Files:**
- Modify: `cloudflare/ping-worker/src/index.js`, `cloudflare/ping-worker/src/first-seen.js`
- Test: `test/unit/ping-worker-ios.test.js` (new, alongside the existing `ping-worker*.test.js`)

**Interfaces:**
- Produces: `ALLOWED_PLATFORMS` gains `'ios'`. For iOS, `keyPrefix = 'ios:'` is prepended to every key `handlePing` bumps or marks (`total`, `day:`, `version:`, `os:`, the `active`/`seen` keys, `first:`, `ret1:`/`return:d1:`, `ret7:`/`return:w2:`, and the new `ret30:`/`return:m1:`). `platform:ios` is bumped unprefixed. Pass the prefix into the `first-seen.js` functions as a parameter that defaults to `''`, so desktop keys are byte-identical.
- Produces: `markMonthReturn(kv, hashedId, day, bumpFn, prefix)`, the day-28-to-34 window, with marker TTL `8 * 24 * 3600`. It is called only for iOS.
- Produces: `sendsDayOneSignals(version, platform)` is false for `ios`. `forwardToGA` is not queued for `ios`. `/stats` gains `ios: {…}`, built by the same reader over `ios:`-prefixed keys plus `returnM1`.

- [ ] **Step 1: Write the failing tests:** an iOS ping with version `1.0.0` bumps `ios:version:1.0.0` and `platform:ios`, and touches no unprefixed `total`, `day:*` or `version:*`; a desktop ping's keys are unchanged (snapshot the key set before and after); no GA fetch for iOS (stub `fetch`); `sendsDayOneSignals('1.31.0', 'ios') === false`; a day-30 return bumps `ios:return:m1:<first day>` once, and day 27 and day 35 don't; `/stats` has `ios.total` and leaves desktop's `total` unchanged by iOS pings.
- [ ] **Step 2:** `node --test test/unit/ping-worker-ios.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it and all `test/unit/ping-worker*.test.js`. Expected: PASS.
- [ ] **Step 5:** Update `cloudflare/ping-worker/README.md` (the iOS namespace). Commit, push, open PR 4a, and ask the owner to merge it **and deploy it** (`wrangler deploy` is the owner's). Never deploy it yourself.

### Task 13: The phone's ping (PR 4b)

**Files:**
- Create: `ios/Blanc/Blanc/LaunchPing.swift`
- Modify: `ios/Blanc/Blanc/BlancApp.swift`, `ios/Blanc/Blanc/SettingsSheet.swift` (Privacy: the **Measure usage** switch writes `saveUsagePing`)
- Modify: `docs/ios/app-store-connect.md` (item 16: label update required before upload)
- Test: `ios/Blanc/BlancTests/LaunchPingTests.swift`

**Interfaces:**
- Consumes: `SettingsStore.usagePingSaved`.
- Produces: `struct LaunchPing { static let endpoint = URL(string: "https://blanc-ping.bnfy-441.workers.dev/ping")!; static func body(installId: UUID, sessionId: Int32, version: String, osMajor: Int) -> [String: Any]; static func shouldSend(saved: Bool?, alreadySent: Bool, launchedInBackground: Bool) -> Bool }`, plus `LaunchPingSender.sendIfAllowed()`. The sender is called on the first `.active` of a launch. It keeps `installId` in a file in Application Support (not the Keychain, not `UserDefaults` suites that iCloud backs up), uses a fresh random `sessionId` per launch, and never retries.

- [ ] **Step 1: Write the failing tests:** the body has exactly `installId, sessionId, version, platform: "ios", arch: "arm64", osVersion` with `osVersion` a bare major; `shouldSend(saved: nil, …) == false`; `(true, false, false) == true`; `(true, true, false) == false` (second `.active` in one launch, Review Focus 4); `(true, false, true) == false` (a background-refresh launch); `(false, …) == false`; the install id is stable across two senders built on the same container and changes when the file is removed.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement, using a `URLSession` ephemeral configuration and a 10 s timeout.
- [ ] **Step 4:** Run the tests and the full unit suite. Expected: PASS.
- [ ] **Step 5:** Install on the owner's iPhone Air once 4a is deployed, launch, and confirm `/stats` shows `ios.total` going up by one (the owner reads it, or with their yes, Claude reads it). Commit, push, open PR 4b. The PR body says: don't upload to TestFlight before the App Privacy label changes to Device ID and Usage Data for Analytics, not linked, no tracking; and blanc.day/privacy needs a website-only PR saying the phone sends the same launch ping.

---

## PR 5: the share extension (design §8)

### Task 14: Accepting only one http(s) link

**Files:**
- Create: `ios/Blanc/Blanc/SharedLink.swift` (shared source compiled into both targets)
- Test: `ios/Blanc/BlancTests/SharedLinkTests.swift`

**Interfaces:**
- Produces: `enum SharedLink { static func url(fromItems urls: [URL], texts: [String]) -> URL? }`. It returns a URL only when exactly one candidate exists, from one URL item or one text that is exactly one http(s) URL after trimming, and `IncomingLinks.accepts` is true for it.

- [ ] **Step 1: Write the failing tests** (Review Focus 5): one https URL → that URL; `file:///x`, `javascript:alert(1)`, `blanc://settings` → nil; text with two URLs → nil; text "see https://a.com" → nil; two URL items → nil; `https://blanc.day/pair#K7MR4PX2` → that URL (`IncomingLinks` then routes it to the confirmation; covered in Task 15).
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS. **Step 5:** Commit.

### Task 15: The extension target and the hand-off

**Files:**
- Create: `ios/BlancShare/ShareViewController.swift`, `ios/BlancShare/Info.plist`, `ios/BlancShare/BlancShare.entitlements` (if an App Group is used)
- Modify: `ios/Blanc/Blanc.xcodeproj/project.pbxproj` (target `BlancShare`, bundle id `me.bnfy.blanc.share`, embedded in Blanc, deployment target 18.4), `ios/Blanc/Blanc/BlancApp.swift` (drain or URL route into `IncomingLinks`), `scripts/ios-testflight.sh`, `ios/Blanc/ExportOptions-AppStore.plist`, `copy/messages/*.json`, `test/unit/ios-native-strings.test.js` (scan `ios/BlancShare`)
- Test: `ios/Blanc/BlancUITests/ShareExtensionUITests.swift`

**Interfaces:**
- Consumes: `SharedLink.url(fromItems:texts:)`, `IncomingLinks.receive(_:into:)`.
- Produces: whichever hand-off the builder picks (design §8 (a) or (b)) ends in `IncomingLinks.receive`, never in `TabsManager` directly, so a pair link asks first.
- Produces: `NSExtensionActivationRule` accepts one web URL, or text, gated by `SharedLink`.

- [ ] **Step 1:** Decide (a) or (b). Write the decision and the reason into the design's §13 in this PR.
- [ ] **Step 2: Write the failing UI test:** from Safari on the simulator, share `https://example.com/`, choose Blanc, and a new Blanc tab shows example.com; sharing `https://blanc.day/pair#K7MR4PX2` shows the pairing confirmation, not a tab.
- [ ] **Step 3:** Run it. Expected: FAIL (no target).
- [ ] **Step 4:** Implement. The extension's display name is "Blanc", and any text it shows is in six languages.
- [ ] **Step 5:** Run the UI test, the full suite and the guard. Expected: PASS. Run `npm run ios:testflight -- --export` to confirm the export includes the appex (no upload).
- [ ] **Step 6:** Install on the owner's iPhone Air and share from Messages and Safari. Commit, push, open the PR. The PR body lists the owner's portal steps: register `me.bnfy.blanc.share` (and the App Group, if used) before the first TestFlight upload with it.

---

## PR 6: the App Store listing (design §10)

### Task 16: Screenshots from the real app

**Files:**
- Create: `scripts/ios-app-store-screenshots.sh`, `ios/Blanc/BlancUITests/AppStoreScreenshotsUITests.swift`, `docs/ios/app-store/*.png`

- [ ] **Step 1:** A UI test, run only by the script (`-only-testing`), seeds a desktop-like state through `UITestSeed` (tabs under two Spaces, a group, Favorites) and captures the start page, the Island and palette, a desktop's tabs under its Spaces, Send to device and the shield. It runs on the 6.9" (iPhone 17 Pro Max) and 6.5" simulators, light appearance, English.
- [ ] **Step 2:** Run the script. Expected: 5 PNGs per size at Apple's exact pixel sizes (check with `sips -g pixelWidth -g pixelHeight`).
- [ ] **Step 3:** Commit.

### Task 17: The listing text

**Files:**
- Create: `docs/ios/app-store-listing.md`
- Modify: `docs/ios/app-store-connect.md` (item 20)

- [ ] **Step 1:** Draft the subtitle (≤30 characters), promotional text (≤170), description, keywords (≤100 characters, comma-separated) and 1.0 release notes. Next to every claim, give the build or tag and the file that backs it. Follow `docs/marketing-claims.md`: no AI wording, blocking not the pitch, MIT with the trademark carve-out, nothing about default browser or passkeys, Shared Spaces as shipped in desktop v1.45.
- [ ] **Step 2:** `npm run test:unit` (claims ledgers). Expected: PASS.
- [ ] **Step 3:** Open the PR and ask the owner to sign off the text and screenshots. Entering them in App Store Connect is a separate yes.

---

## After Apple grants the entitlement (not part of M18's PRs)

One change: `com.apple.developer.web-browser` in `Blanc.entitlements`, Default Web Browser turned on for `me.bnfy.blanc` in the portal (the owner), `DefaultBrowserOffer.enabled = true`, and the passkeys and default-browser checks on the owner's iPhone Air (F24).
