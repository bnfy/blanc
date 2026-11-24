# iPhone Island redesign: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the iPhone's full-width 52 pt Island with one Island sized to its contents, in the Mac Island's shape: Back, the current group's tab dots, the favicon (which opens the page menu) and the site, and New Tab. Tapping it grows the Island into a panel that rides up above the keyboard with search ready.

**Architecture:** New pure models (`IslandDots`, `IslandScheme`, `PalettePanelDrag`) plus a reshaped `IslandLayout` carry every rule, and each has XCTest coverage. `ContentView.addressPill` is rebuilt on top of them. The iPad's existing palette panel (`palettePanel`, `PaletteSheet(placement: .panel)`) becomes the iPhone's open state too, and the sheet stays only for compact height (iPhone landscape).

**Tech Stack:** SwiftUI and UIKit (iOS 18.4+, Liquid Glass on iOS 26+), XCTest and XCUITest, the shared copy catalog (`copy/messages/*.json`, read through `SyncCopy`).

**Spec:** `docs/superpowers/specs/2026-11-21-iphone-island-redesign-design.md`. Read it first. This plan argues from it.

## Global Constraints

- **iOS versions:** the deployment target stays 18.4. Glass only behind `if #available(iOS 26, *)`, through `IslandSurface`.
- **Shape and size:**
  - Island height 44 pt.
  - Island corner radius 17 pt: `RoundedRectangle(cornerRadius: 17, style: .continuous)`.
  - Open panel corners 22 pt.
  - Width at most the container's width minus 32 pt, capped at 600 pt.
  - Every button's tap target is at least 44×44 pt.
- **Strings:**
  - Every user-visible or VoiceOver string comes from `SyncCopy`. `test/unit/ios-native-strings.test.js` fails on hard-coded English.
  - Each new `en.json` key gets de, es, fr, pt-BR and it entries in the same commit.
  - Then run `npm run copy:ack -- <locale> <keys>` for each language, then `npm run copy:build` and `npm run copy:check`.
- **Words:** call it "the Island" in comments, strings and commit messages, never "the pill". Existing `pill.*` identifiers stay.
- **Accessibility identifiers that stay** (tests depend on them): `pill.palette`, `pill.back`, `pill.forward`, `island.menu`, `island.address`, `palette.panel`.
- **Motion:**
  - Springs use `Animation.spring(response: 0.35, dampingFraction: 0.85)`, the same as `ContentView.swipeSpring`.
  - When `reduceMotion` is true (system setting or `-BlancUITestReduceMotion`), every spring becomes an opacity crossfade and nothing moves.
- **Style:** no dividers on the Island, no focus rings added, no left-edge accent bars.
- **Scope:** don't touch `chromium/`, `src/` (desktop), Android, or the tab grid.
- **Commits:** one per task. Messages use US spelling and must not name an AI model (no `Co-Authored-By` model trailer).

## Review Focus

1. **A long site name at the width cap:** `a-very-long-subdomain-name-that-keeps-going.example.com` truncates in the middle, while Back, the dots, the favicon and New Tab stay fully on screen. Pinned by `IslandWidthUITests.testALongSiteKeepsEveryButtonOnScreen` (Task 6).
2. **Many tabs in one section** (20 ungrouped): the dots show a window of 6 that always includes the active tab, then "+N". Pinned by `IslandDotsTests.testManyTabsShowAWindowAroundTheActiveTab` (Task 1).
3. **Sections that aren't a group:**
   - The active tab is an ungrouped pin.
   - The section has one tab.
   - The active tab is in a group sitting between two ungrouped runs.

   Pinned by `IslandDotsTests` cases (Task 1).
4. **Private tabs without the chip:** VoiceOver still learns the tab is private, and the page menu leads with Close Private Tab. Pinned by `PrivateTabsUITests.testThePageMenuSaysPrivateAndClosesTheTab` (Task 6) and `IslandMenuTests.testAPrivateTabLeadsWithClosePrivateTab` (Task 3).
5. **Rotating to landscape while the panel is open:** the palette moves to the sheet with the typed text kept, and back again. Pinned by `IslandPanelUITests.testRotatingHandsThePanelToTheSheetWithTheText` (Task 9).

## Running tests

- **Unit tests:**
  ```
  cd ios/Blanc && xcodebuild test -project Blanc.xcodeproj -scheme Blanc \
    -destination 'platform=iOS Simulator,OS=27.2,name=iPhone Air' \
    -derivedDataPath "$TMPDIR/island-dd" \
    -only-testing:BlancTests/<Class> \
    -skip-testing:BlancTests/ContentBlockerTests/testBundledBlocklistCompilesInWebKit
  ```
- **Compile-only check** (no simulator boot):
  ```
  xcodebuild build-for-testing -project Blanc.xcodeproj -scheme Blanc \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath "$TMPDIR/island-dd"
  ```
- **Simulators:** use iOS 27.2 or later only, and never an iOS 26.x simulator. If simulators can't run where you are, use `build-for-testing`, then record which tests you couldn't run.
- **Builds are slow:** run long builds in the background or with a 10-minute timeout.

---

## PR 1: the resting Island

### Task 1: The dots model

**Files:**
- Create: `ios/Blanc/Blanc/IslandDots.swift`
- Test: `ios/Blanc/BlancTests/IslandDotsTests.swift`

**Interfaces:**
- Consumes: `TabSections.sections(_:)` and `TabSections.Item` (`ios/Blanc/Blanc/TabSections.swift`).
- Produces:
  ```swift
  enum IslandDots {
      struct Tab: Equatable { let id: UUID; let groupId: String?; let pinned: Bool; let isPrivate: Bool }
      struct Dot: Equatable { let id: UUID; let isActive: Bool; let isPrivate: Bool }
      struct Row: Equatable {
          let dots: [Dot]        // at most `cap`
          let overflow: Int      // tabs in the section not drawn ("+N"); 0 for none
          let groupId: String?   // the section's group, nil for an ungrouped run or the pins
          let position: Int      // 1-based place of the active tab in the whole section
          let count: Int         // tabs in the whole section
      }
      static let cap = 6
      /// nil when the active tab is missing or its section has fewer than 2 tabs.
      static func row(_ tabs: [Tab], activeId: UUID, cap: Int = cap) -> Row?
  }
  extension IslandDots.Tab { @MainActor init(_ tab: TabModel) }
  ```

**Rules:**
- **The section** is the one `TabSections.sections` puts the active tab in, matched by `id.uuidString`. When the active tab is an ungrouped pin, which belongs to no section, its section is every ungrouped pin, in tab order.
- **Fewer than 2 tabs:** a section like that gets no row (returns nil), so a lone tab shows no dot.
- **The window:**
  - With `count <= cap`, every tab is drawn.
  - Otherwise `cap` consecutive dots are drawn, starting at `min(max(activeIndex - cap / 2, 0), count - cap)`, and `overflow = count - cap`.
- **Private dots:** a dot's `isPrivate` comes from its own tab, never from the active one.

- [ ] **Step 1: Write the failing tests** in `IslandDotsTests`, each with a hand-built `[IslandDots.Tab]`:
  - `testUngroupedRunAroundTheActiveTab`: ungrouped a, b, then group G with c, d, then ungrouped e. Active b → dots a, b; `groupId` nil; `position` 2; `count` 2.
  - `testGroupSection`: active c → dots c, d; `groupId` "G".
  - `testAGroupBetweenRunsSplitsThem`: active e → nil, since its run is just e.
  - `testALoneTabHasNoDots`: one tab → nil.
  - `testUngroupedPinsAreTheirOwnSection`: pins p1, p2 (ungrouped, pinned), then a, b. Active p2 → dots p1, p2.
  - `testManyTabsShowAWindowAroundTheActiveTab`: 20 ungrouped tabs, active index 10:
    - 6 dots, the 4th of them active, ids at indices 7…12;
    - `overflow` 14, `position` 11, `count` 20.
    - Then active index 0: dots 0…5. Active index 19: dots 14…19.
  - `testPrivateDotsFollowTheirOwnTab`: ungrouped a (private) and b (regular), active b. Dot a has `isPrivate` true, dot b false.
- [ ] **Step 2: Run them and watch them fail.** `-only-testing:BlancTests/IslandDotsTests`. Expected: compile failure, `IslandDots` not found.
- [ ] **Step 3: Implement `IslandDots.row(_:activeId:cap:)`** in `IslandDots.swift` by the rules above, built on `TabSections.sections`.
- [ ] **Step 4: Run the tests.** Expected: all 7 pass.
- [ ] **Step 5: Commit:** `iOS Island: a model for the current group's tab dots`.

### Task 2: The Island's buttons

**Files:**
- Modify: `ios/Blanc/Blanc/IslandLayout.swift` (`Buttons`, `buttons(backForward:isLoading:)`)
- Test: `ios/Blanc/BlancTests/IslandLayoutTests.swift`

**Interfaces:**
- Produces (it replaces `History` and the old `Buttons`):
  ```swift
  struct Buttons: Equatable {
      /// The leading button: Back (dimmed when there's nowhere to go), or Reload when Back and Forward are off.
      enum Leading: Equatable { case back, reload }
      enum Trailing: Equatable { case newTab, stop }
      let leading: Leading
      /// Forward follows Back only while there's somewhere to go.
      let forward: Bool
      /// New Tab, or Stop in New Tab's slot while a page loads.
      let trailing: Trailing
  }
  func buttons(backForward: Bool, canGoForward: Bool, isLoading: Bool) -> Buttons
  ```

**Rules:**
- With Back and Forward on: `leading = .back` and `forward = canGoForward`.
- With them off: `leading = .reload` and `forward = false`.
- `trailing = isLoading ? .stop : .newTab`.
- The unfolded layout gives the same answers as the iPhone.

- [ ] **Step 1: Rewrite the button tests** in `IslandLayoutTests`. They replace `testTheIPhoneIslandHasBackForwardAndNewTabButNoReload`, `testStopStillShowsWhileAPageLoads`, `testWithBackAndForwardOffReloadTakesTheirPlace` and `testTheUnfoldedIslandHasTheIPhonesButtons`.
  - `testBackLeadsAndForwardOnlyWhenThereIsSomewhereToGo`:
    - `(true, false, false)` gives `.init(leading: .back, forward: false, trailing: .newTab)`.
    - `(true, true, false)` gives `forward: true`.
  - `testStopTakesNewTabsSlotWhileLoading`: `(true, false, true).trailing == .stop`.
  - `testWithBackAndForwardOffReloadLeads`: `(false, true, false)` gives `.init(leading: .reload, forward: false, trailing: .newTab)`.
  - `testTheUnfoldedIslandHasTheIPhonesButtons`: the same loop over all 8 combinations.
- [ ] **Step 2: Run** `-only-testing:BlancTests/IslandLayoutTests`. Expected: compile failure.
- [ ] **Step 3: Implement** the new `Buttons` and `buttons(backForward:canGoForward:isLoading:)`. Update the one call site, `ContentView.islandButtons`, to pass `manager.activeTab?.canGoForward == true`, so the target still builds. The view itself changes in Task 6.
- [ ] **Step 4: Run the tests.** Expected: pass.
- [ ] **Step 5: Commit:** `iOS Island: Forward only when there's somewhere to go; Stop in New Tab's slot`.

### Task 3: Close Private Tab leads the page menu, plus the new strings

**Files:**
- Modify: `ios/Blanc/Blanc/IslandMenu.swift`, and the menu builder in `ios/Blanc/Blanc/ContentView.swift` (`islandMenuElements`, ~:981).
- Modify: `copy/messages/en.json`, `de.json`, `es.json`, `fr.json`, `pt-BR.json`, `it.json`, plus the files `npm run copy:build` regenerates.
- Test: `ios/Blanc/BlancTests/IslandMenuTests.swift`

**Interfaces:**
- Produces: `IslandMenuItem.closePrivateTab`, and these string keys:

| Key | English | Translator note |
|---|---|---|
| `ios.island.closePrivateTab` | `Close Private Tab` | iOS Island page menu: first item on a private tab; closes it and leaves private browsing |
| `ios.island.tabPosition` | `Tab {position} of {count}` | iOS Island: VoiceOver name of the tab dots when the tab isn't in a group |
| `ios.island.tabPositionInGroup` | `Tab {position} of {count}, {group}` | iOS Island: VoiceOver name of the tab dots; {group} is the tab group's name |

- [ ] **Step 1: Write the failing test** `testAPrivateTabLeadsWithClosePrivateTab`, following the file's existing private-tab setup. For a private web tab, `IslandMenu.items(for:manager:).first == .closePrivateTab`. For a regular tab, `.closePrivateTab` isn't in the list.
- [ ] **Step 2: Run** `-only-testing:BlancTests/IslandMenuTests`. Expected: compile failure.
- [ ] **Step 3: Implement.**
  - Prepend `.closePrivateTab` when `tab?.isPrivate == true`.
  - In `islandMenuElements`, map it to an inline `UIMenu` section of its own: `action("ios.island.closePrivateTab", "xmark.circle") { manager.closeTab(tab.id) }`.
  - Add the three keys to `en.json` with the notes above, and to the five translations.
  - Run `npm run copy:ack -- <locale> ios.island.closePrivateTab ios.island.tabPosition ios.island.tabPositionInGroup` for each locale, then `npm run copy:build` and `npm run copy:check`.
- [ ] **Step 4: Run the tests.** `IslandMenuTests` and `NativeCopyTests` pass. `node --test test/unit/ios-native-strings.test.js` passes, and so does `npm run copy:check`.
- [ ] **Step 5: Commit:** `iOS Island: Close Private Tab leads the page menu on a private tab`.

### Task 4: Site icons the Island can draw

**Files:**
- Modify: `ios/Blanc/Blanc/SiteIcons.swift`
- Test: `ios/Blanc/BlancTests/SiteIconsTests.swift`

**Interfaces:**
- Produces:
  - `SiteIcons` becomes `@Observable`. `entries` stays observed. Every other stored property is `@ObservationIgnored`.
  - `func image(for url: URL) -> UIImage?`: the kept icon for the URL's site, decoded once and cached per site key in an `@ObservationIgnored` dictionary. The cache is emptied by `clear()` and whenever that site's entry changes.

- [ ] **Step 1: Write the failing test** `testImageDecodesTheKeptIconForTheSite`. Store a known PNG data URL, built with `SiteIcons.dataURL(from:)` from a 16×16 rendered image, through the store's existing test path; follow `SiteIconsTests`. Then:
  - `image(for: URL(string: "https://www.example.com/a")!)` is non-nil and 16 px wide (scale-adjusted, `size.width * scale == 16`);
  - for `https://other.example/` it is nil;
  - after `clear()` it is nil.
- [ ] **Step 2: Run** `-only-testing:BlancTests/SiteIconsTests`. Expected: fail.
- [ ] **Step 3: Implement it.** Decode the base64 part after the first comma with `UIImage(data:)`.
- [ ] **Step 4: Run the tests.** Expected: pass.
- [ ] **Step 5: Commit:** `iOS: site icons the Island can draw`.

### Task 5: The page menu button shows the favicon

**Files:**
- Modify: `ios/Blanc/Blanc/IslandMarkButton.swift`

**Interfaces:**
- Produces:
  ```swift
  struct IslandMarkButton: UIViewRepresentable {
      enum Glyph: Equatable { case sunrise, favicon(UIImage), globe }
      let glyph: Glyph
      let tint: Color
      /// VoiceOver value: "Private tab" (`tab.privateLabel`) on a private tab, else nil.
      let accessibilityValue: String?
      let menu: () -> [UIMenuElement]
  }
  ```

**How each glyph is drawn:**
- **`.sunrise`:** today's gold mark (`pages/sunrise-mark.png`), drawn at 20 pt, `.alwaysOriginal`.
- **`.favicon`:** the image drawn at 16 pt inside a 4 pt-corner rounded clip, `.alwaysOriginal`.
- **`.globe`:** the SF Symbol `globe` at 15 pt semibold, template, tinted with `tint`.

**What stays:** the label is still `ios.island.pageActions` and the identifier `island.menu`. The menu still opens from a 1 pt point, with the light haptic.

- [ ] **Step 1: Implement** the glyph enum and sizing in place of `image` and `sized(_:)`. Move the Sunrise image lookup (`ContentView.sunriseMark`) here.
- [ ] **Step 2: Build.** `build-for-testing` succeeds once the Task 6 call site is updated. Do Steps 1–2 together with Task 6 Step 3 if the target won't build alone.
- [ ] **Step 3: Commit** together with Task 6. This task has no test of its own; Task 6's UI tests cover it.

### Task 6: The resting Island

**Files:**
- Modify: `ios/Blanc/Blanc/ContentView.swift`: `islandHeight`, `addressPill`, `historyButtons`, `reloadButton`, `backButton`, `forwardButton`, `islandMark`, `islandDivider`, `IslandProgress` clip.
- Create: `ios/Blanc/Blanc/IslandDotsView.swift`.
- Modify: `ios/Blanc/Blanc/StartPage/ios-start.css` (`--ios-island: 68px` → `60px`).
- Modify: `ios/Blanc/Blanc/UITestSeed.swift`: add `longHost`, `-BlancUITestLongHost`, which seeds one tab at `https://a-very-long-subdomain-name-that-keeps-going.example.com/`.
- Modify: `spec/divergence-register.md` D11. Replace the iOS (2026-11-05 / 2026-11-11) bullet's description of the Island's layout with the new one; keep the rest of the bullet.
- Test (UI):
  - `ios/Blanc/BlancUITests/PillButtonsUITests.swift`
  - `ios/Blanc/BlancUITests/PrivateTabsUITests.swift`
  - `ios/Blanc/BlancUITests/AppStoreScreenshotsUITests.swift` (its `pill.private` wait, ~:152)
  - new `ios/Blanc/BlancUITests/IslandWidthUITests.swift`

**Interfaces:**
- Consumes: `IslandDots.row` (Task 1), `IslandLayout.buttons(backForward:canGoForward:isLoading:)` (Task 2), `SiteIcons.image(for:)` (Task 4), `IslandMarkButton.Glyph` (Task 5).
- Produces:
  - `ContentView.islandHeight == 44`.
  - `ContentView.islandCornerRadius == 17`.
  - `IslandDotsView(row: IslandDots.Row, ink: Color, isLoading: Bool, swipeProgress: CGFloat, reduceMotion: Bool)`, with accessibility identifier `island.dots`.

**The row, in order:**
1. **Leading:** Back (`pill.back`, dimmed to 0.35 and disabled when it can't go back), or Reload (`arrow.clockwise`, label `ios.island.reload`) when the setting is off.
2. **Forward** (`pill.forward`), only when `buttons.forward`. It's inserted with `.transition(.move(edge: .leading).combined(with: .opacity))`, or `.opacity` with Reduce Motion.
3. **The tap region (`pill.palette`)**, one `onTapGesture` that opens the palette, as today:
   - The dots come first, when there's a row. They are their own accessibility element: label `ios.island.tabPosition`, or `ios.island.tabPositionInGroup` with the group's name.
   - Then the domain `Text`, with no `Spacer` and no `maxWidth: .infinity`, so the Island sizes to fit. The domain keeps today's label and value.
4. **The page menu button:** `IslandMarkButton` at 36×44. It sits between the dots and the domain, so the order on screen is back, dots, favicon, domain.
   - Its glyph is `.sunrise` for any `blanc:` page, `.favicon` when `SiteIcons.image` has one, and `.globe` otherwise.
   - Its `accessibilityValue` is `tab.privateLabel` on a private tab.
5. **Trailing:** New Tab (`plus`, label `tab.new`), or Stop (`xmark`, label `ios.island.stop`) in the same 44×44 slot, crossfading.

**Styling and behavior:**
- No dividers: remove `islandDivider`. No Private chip.
- 4 pt end padding. The Island is centered by the container.
- The surface: `.islandSurface(islandStyle, in: RoundedRectangle(cornerRadius: 17, style: .continuous))`, with the progress line clipped to the same shape.
- Width changes, Forward arriving and leaving, and the trailing slot animate with the global spring; Reduce Motion skips them.

**The dots view:**
- 6 pt dots spaced 8 pt apart.
- The active dot is in full ink. Inactive dots are the ink at 0.22 opacity.
- A private dot is a 1 pt stroke with no fill.
- "+N" in `BrowserStyle.font(11)` at 0.55 opacity.
- While loading, the active dot pulses: opacity 1 ↔ 0.35 over 0.9 s, repeating, with no pulse under Reduce Motion.
- During a sideways swipe, `swipeProgress` is `-swipeOffset / pageWidth`, clamped to −1…1. The active dot's highlight slides by `swipeProgress × 14 pt` toward its neighbor.
- When the row's section changes, the dots crossfade through `.id` on `groupId` plus the first dot's id.

- [ ] **Step 1: Write the failing UI tests.**
  - **Update `PillButtonsUITests.testTheIslandHasBackForwardAndNewTab`:**
    - On a new tab, Back exists and is disabled, Forward doesn't exist, and New Tab exists.
    - `back.frame.maxX <= pill.frame.minX`, and New Tab's `midX` is greater than `pill.frame.maxX`.
    - With the setting off, "Reload page" exists before `pill.palette` and Back doesn't exist.
  - **`IslandWidthUITests.testALongSiteKeepsEveryButtonOnScreen`:**
    - Launch with `-BlancUITestLongHost`.
    - `pill.palette`'s label contains `a-very-long`.
    - Back's, `island.menu`'s and New Tab's frames lie within `app.windows.firstMatch.frame`.
    - New Tab's `maxX` is at most the window width minus 16.
  - **`IslandWidthUITests.testAShortSiteLeavesTheIslandNarrow`:**
    - Launch with `-BlancUITestFavorites`, whose seeded tab is example.com.
    - The Island's width is under 75% of the window's, measured from Back's `minX` to New Tab's `maxX`.
  - **`PrivateTabsUITests.testThePageMenuSaysPrivateAndClosesTheTab`:**
    - Launch with `-BlancUITestPrivate`.
    - `app.buttons["island.menu"].value as? String == "Private tab"`.
    - No `pill.private` exists.
    - Opening the menu shows "Close Private Tab" first, and tapping it closes the tab.
  - **`AppStoreScreenshotsUITests` (~:152):** wait for `island.menu` with value "Private tab" instead of `pill.private`.
- [ ] **Step 2: Run** the changed UI test classes. Expected: fail against the old Island.
- [ ] **Step 3: Implement** the Island, `IslandDotsView`, the Start Page CSS value, the `longHost` seed and the D11 edit.
- [ ] **Step 4: Run the UI tests** above, plus `IslandSwipeUITests`, `TabUndoUITests`, `IncomingLinkUITests`, `SplitViewUITests` and `GlanceUITests`, which touch the Island. Then run all of `BlancTests`. Expected: pass.
- [ ] **Step 5: Commit:** `iOS Island: one Island sized to fit, with tab dots and the site's icon` (Tasks 5 and 6 together).

---

## PR 2: opening in place

### Task 7: The panel on iPhone, the sheet in landscape

**Files:**
- Modify: `ios/Blanc/Blanc/IslandLayout.swift` (`init`)
- Test: `ios/Blanc/BlancTests/IslandLayoutTests.swift`

**Rules:**
- `palette = vertical == .compact ? .sheet : .panel`.
- `showsSplitView` is unchanged (regular in both directions only).
- A nil vertical size class counts as regular, so it gets the panel.

- [ ] **Step 1: Update the tests.**
  - `testCompactIsTheIPhoneLayout` now expects `.panel`.
  - Rename `testALargeIPhoneInLandscapeIsTheIPhoneLayout` to `testLandscapeKeepsTheSheet`: `IslandLayout(.regular, .compact).palette == .sheet` and `IslandLayout(.compact, .compact).palette == .sheet`. Both still have `showsSplitView == false`.
  - `testAnUnknownSizeClassIsTheIPhoneLayout` stays as is.
  - `testRegularIsTheUnfoldedLayout` stays as is.
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit** together with Task 9; the iPhone has no working panel until then.

### Task 8: The panel's layout and drag to close

**Files:**
- Modify: `ios/Blanc/Blanc/PaletteSheet.swift`: the `body` ordering, `footer`, `addressRow`'s collapse caret.
- Create: `ios/Blanc/Blanc/PalettePanelDrag.swift`
- Test: `ios/Blanc/BlancTests/PalettePanelDragTests.swift`

**Interfaces:**
- Produces:
  - `PaletteSheet(manager:placement:islandAtTop:)`, where `islandAtTop` defaults to false.
  - `enum PalettePanelDrag { static func closes(translation: CGFloat, predicted: CGFloat, islandAtTop: Bool) -> Bool }`.
    - The distance toward the Island's edge is `translation` for a bottom Island and `-translation` for a top one.
    - It closes at 60 pt or more, or when the predicted distance reaches 160 pt or more.

**Panel order:**
- Bottom Island: `list`, divider, `addressRow`, `actionsRow`.
- Top Island: `actionsRow`, `addressRow`, divider, `list`.
- The sheet keeps `addressRow`, divider, `list`, `actionsRow`.

**`actionsRow`** replaces `footer` for both placements:
- **Left:** Back (`chevron.left`, 44×44, dimmed and disabled when the tab can't go back; it goes back, then closes) and New Tab (`plus`, 44×44, label `tab.new`; it creates a tab, then closes). These are plain icons; the black filled "New tab" capsule goes.
- **Right:** `SpacesButton`, Reader when available, Favorites, History, Settings, as today.

**The collapse caret** is `chevron.down` for a bottom Island and `chevron.up` for a top one.

- [ ] **Step 1: Write the failing tests** in `PalettePanelDragTests`:
  - `testAShortDragStaysOpen`: `(30, 80, false)` gives false.
  - `testADragTowardTheIslandCloses`: `(60, 60, false)` gives true.
  - `testAFlickCloses`: `(20, 160, false)` gives true.
  - `testDraggingAwayNeverCloses`: `(-200, -400, false)` gives false.
  - `testATopIslandClosesUpward`: `(-60, -60, true)` gives true; `(60, 60, true)` gives false.
- [ ] **Step 2: Run.** Expected: compile failure.
- [ ] **Step 3: Implement** `PalettePanelDrag`, the orderings, `actionsRow` and the caret.
- [ ] **Step 4: Run** `PalettePanelDragTests`. Expected: pass.
- [ ] **Step 5: Commit:** `iOS palette: search on the Island's side, Back and New Tab in its action row`.

### Task 9: The Island grows into the panel

**Files:**
- Modify: `ios/Blanc/Blanc/ContentView.swift`: `palettePanel`, `islandPill`, `islandScheme`, the panel overlay's animation.
- Create: `ios/Blanc/Blanc/IslandScheme.swift`
- Test:
  - `ios/Blanc/BlancTests/IslandSchemeTests.swift`
  - new `ios/Blanc/BlancUITests/IslandPanelUITests.swift`
  - updates to `DuoUITests` / `IPadWindowUITests` if their panel assertions change
- Modify: `spec/divergence-register.md` D11: the iPhone opens in place, and landscape keeps the sheet.

**Interfaces:**
- Produces:
  ```swift
  enum IslandScheme {
      /// The Island's (and the open panel's) light or dark: private is always dark; on glass
      /// (iOS 26) a page with a solid background decides; otherwise Blanc's theme.
      static func resolve(isPrivate: Bool, pageScheme: ColorScheme?, appScheme: ColorScheme, glass: Bool) -> ColorScheme
  }
  ```
  `ContentView.islandScheme` calls it with `glass` from `#available(iOS 26, *)`.

**Behavior:**
- The panel is `PaletteSheet(manager: manager, placement: .panel, islandAtTop: islandAtTop)` (the sheet passes `islandAtTop` too). It takes `.environment(\.colorScheme, islandScheme)`, and so does the landscape sheet.
- **The grow:** `@Namespace islandSpace`. The Island has `matchedGeometryEffect(id: "island", in: islandSpace, isSource: !isPalettePanelOpen)`, and the panel's clipped container has `isSource: isPalettePanelOpen`.
- **Animation:** `.animation(reduceMotion ? .easeOut(duration: 0.2) : Self.swipeSpring, value: isPalettePanelOpen)` on the panel overlay and on the Island's opacity, so every way of opening animates: a tap, ⌘L, or `/` commands.
- **Reduce Motion:** no matched geometry, opacity only.
- **The keyboard:** the panel keeps the keyboard safe area (no `.ignoresSafeArea(.keyboard)`), so it rides above the keyboard as the field takes focus. Use `.frame(maxHeight: 520)` with the list flexing.
- **Drag to close:** a `DragGesture` on `actionsRow` and `addressRow` calls `PalettePanelDrag.closes`; when it's true it sets `manager.isPalettePresented = false`.
- **The dots:** the dots region opens the palette like the domain (Task 6's tap region already does this).

- [ ] **Step 1: Write the failing tests.**
  - **`IslandSchemeTests`:**
    - private always gives `.dark`;
    - `(false, .dark, .light, true)` gives `.dark`;
    - `(false, .dark, .light, false)` gives `.light`;
    - `(false, nil, .dark, true)` gives `.dark`.
  - **`IslandPanelUITests`** (iPhone Air, portrait):
    - `testTappingTheSiteOpensThePanelWithSearchFocused`: tap `pill.palette`. `palette.panel` exists, `island.address` has keyboard focus (`hasKeyboardFocus`), and the field's `maxY` is at most `app.keyboards.firstMatch.frame.minY`.
    - `testTappingTheDotsOpensThePanel`: launch with `-BlancUITestTwoTabs`, tap `island.dots`, and `palette.panel` exists.
    - `testTappingOutsideCloses`: tap at normalized `(0.5, 0.1)`. The panel is gone and `pill.palette` is hittable.
    - `testDraggingTowardTheIslandCloses`: drag from `island.address` 150 pt down. The panel is gone.
    - `testRotatingHandsThePanelToTheSheetWithTheText`: type "blanc", then set `XCUIDevice.shared.orientation = .landscapeLeft`. `palette.panel` is gone and `island.address` (now in the sheet) has the value "blanc". Rotate back to portrait, then `palette.panel` exists with the value "blanc".
- [ ] **Step 2: Run.** Expected: fail.
- [ ] **Step 3: Implement it** (with Task 7's change), plus the D11 edit.
- [ ] **Step 4: Run** `IslandSchemeTests`, `IslandLayoutTests`, `IslandPanelUITests`, `PillButtonsUITests`, `SlashCommandUITests`, `KeyboardShortcutsUITests`, `DuoUITests` and `IPadWindowUITests`, then all of `BlancTests`. Expected: pass.
- [ ] **Step 5: Commit:** `iOS Island: tapping it grows the Island into the panel above the keyboard` (Tasks 7 and 9).

---

## After the tasks (reviewer)

- **Review:** a whole-branch review, then fixes.
- **Screenshots** in the owner's iPhone Air iOS 27.2 simulator (`B0DC1A4A-8BD7-4064-8530-4180E3F6DF92`; ask before booting it):
  - a light page, a dark page, the Start Page, a private tab, loading, a long site, the top position, and opening;
  - cropped to the Island at full resolution, before stacked over after.
- **Also check:** iOS 18 solid fallback, and the iPad and the unfolded Duo for the shared panel.
- **Install on the owner's iPhone Air** for their hand check before any Android work.
