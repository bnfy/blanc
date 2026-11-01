# iOS M11 Tab Gestures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swipe the pill to switch tabs, a strip of page cards in the palette that closes a tab when a card is flicked up, an Undo banner after every close, and `/reopen`.

**Architecture:** Tab order, page pictures, closing with undo and the reopen list live in `TabsManager` and are unit-tested. The swipe's thresholds are a pure `PillSwipe` type. The gestures are SwiftUI views (`ContentView`'s pill and page layer, a new `TabStrip` in the palette), proven by UI tests on iOS 26.5 and 27.0.

**Tech Stack:** SwiftUI, WKWebView (`takeSnapshot`), XCTest and XCUITest. No SPM.

**Spec:** `docs/superpowers/specs/2026-10-24-ios-m11-tab-gestures-design.md` (parent: `2026-10-24-ios-v1-companion-release-design.md`; behavior: `spec/features.md` F56).

## Global Constraints

- Start from `main` after #1110 (M9, private tabs) is merged; `TabModel.isPrivate` and `TabsManager.createTab(url:isPrivate:)` are assumed.
- Order is `manager.tabs` order, private tabs included (no groups on the phone until M17).
- Private tabs: closing is final. No Undo banner, never in the reopen list.
- Page pictures are memory only: never written to disk, session.json, sync or History.
- The undo window is 5 seconds; the reopen list holds 10, newest first, and lives only while the app runs.
- Swipe: starts on the pill, at least 12 pt and |dx| > |dy|; commits at 30% of the width travelled or a predicted end past 50%; past either end the page moves 0.25 × the finger's distance.
- Copy comes from the shared catalog through `SyncCopy.text`: reuse `settings.gesture.action.nextTab` ("Next tab"), `settings.gesture.action.previousTab` ("Previous tab"), `settings.gesture.action.closeTab` ("Close tab"), `menu.undo` ("Undo"); add one key, `tabs.closedToast` ("Tab closed"), with all five translations (`de`, `es`, `fr`, `pt-BR`, `it`) in the same PR and `npm run copy:ack` for each. `/reopen` uses the generated `slash_reopen` string, as `/close` does.
- Every new UI test runs on an iOS 26.5 simulator as well as 27.0 (pill controls broke only on 26.5 before; see the iOS 26 fix in #1110). Pill icon buttons keep the 32 pt `PillIconTarget`.

## Review Focus

- **A swipe that starts on a pill button** (heart, Send, reload, +): the button still works on a tap, and a sideways drag from it still switches tabs, never both.
- **Flicking a card while the strip is scrolling sideways:** a sideways drag scrolls; only a clearly upward drag closes (`PillSwipe.isSideways` reused with axes swapped).
- **Closing a tab while another tab's Undo banner shows:** the first close moves to the reopen list at once; only the newest close is undoable.
- **The page's picture of a private tab** never leaves memory, and goes when the tab closes (`testPrivatePicturesAreNotKeptAfterClose`).
- **Reduce Motion on:** no sliding, a cross-fade, and the switch still happens.

---

### Task 1: Tab order and page pictures

**Files:**
- Modify: `ios/Blanc/Blanc/TabModel.swift`, `ios/Blanc/Blanc/TabsManager.swift`
- Test: `ios/Blanc/BlancTests/TabsManagerTests.swift`

**Interfaces:**
- Produces: `TabModel.snapshot: UIImage?` (observed). `TabsManager.neighbor(of id: UUID, offset: Int) -> TabModel?` (nil past either end). `TabsManager.snapshotter: @MainActor (TabModel) async -> UIImage?`, a stored closure defaulting to `webView.takeSnapshot(configuration: nil)`, replaceable in tests. `TabsManager.refreshSnapshot(_ tab: TabModel) async` stores the result on the tab. `setActive` refreshes the tab it leaves. On a memory warning, pictures are dropped from every tab except the current tab's two neighbors.

- [ ] **Step 1: Write the failing tests:** `testNeighborFollowsTabOrder` (three tabs; `neighbor(of: b, offset: -1) === a`, `+1 === c`; nil past the ends), `testLeavingATabTakesItsPicture` (fake `snapshotter` returning a 1×1 image; `setActive(b)` from `a`; await; `a.snapshot != nil`), `testPrivatePicturesAreNotKeptAfterClose` (a private tab with a picture is closed; no tab in `tabs` holds it and the session file has no image data).
- [ ] **Step 2: Run** `-only-testing:BlancTests/TabsManagerTests`. Expected: build fails (members missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same. Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m11): tab order and page pictures`.

### Task 2: Closing with undo, and the reopen list

**Files:**
- Modify: `ios/Blanc/Blanc/TabsManager.swift`, `ios/Blanc/Blanc/SlashCommand.swift`
- Test: `ios/Blanc/BlancTests/TabsManagerTests.swift`, `ios/Blanc/BlancTests/SlashCommandTests.swift`

**Interfaces:**
- Consumes: Task 1.
- Produces: `struct ClosedTab { let tab: TabModel; let index: Int; let blankId: UUID? }`; `TabsManager.lastClosed: ClosedTab?` (observed; set by `closeTab` for an ordinary tab, nil for a private one); `TabsManager.undoWindow: Duration = .seconds(5)`; `TabsManager.reopenList: [(url: URL, title: String)]` (max 10, newest first); `func undoClose()` (puts `lastClosed.tab` back at `min(index, tabs.count)`, makes it current, removes `blankId`'s tab if it is still an untouched blank page, clears `lastClosed`); `func expireUndo()` (moves `lastClosed` into `reopenList` and drops the live tab); `func reopenLast() -> Bool` (opens the newest entry in a new ordinary tab, removing it). `closeTab` expires any earlier `lastClosed` first, then starts a task that calls `expireUndo()` after `undoWindow` unless that close was undone. `/reopen` (hint `slash_reopen`) calls `reopenLast()`.

- [ ] **Step 1: Write the failing tests:** `testUndoRestoresTheSameTabAtItsPlace` (three tabs, close the middle, `undoClose()`; same `TabModel` instance at index 1, current), `testUndoAfterClosingTheLastTabRemovesTheBlank`, `testPrivateCloseIsFinal` (`lastClosed == nil`, `reopenList` empty), `testExpiredCloseGoesToTheReopenList`, `testAnotherCloseExpiresTheFirst`, `testReopenListKeepsTen`, `testReopenOpensTheNewestFirst`; `SlashCommandTests.testReopenCommandReopensTheLastClosedTab` (and the command list becomes `["/new", "/private", "/close", "/reopen"]`).
- [ ] **Step 2: Run** both classes. Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both. Expected: `** TEST SUCCEEDED **`.
- [ ] **Step 5: Commit:** `ios(m11): undo a closed tab, and /reopen`.

### Task 3: The Undo banner

**Files:**
- Modify: `ios/Blanc/Blanc/ContentView.swift`, `ios/Blanc/Blanc/UITestSeed.swift`, `ios/Blanc/Blanc/TabsManager.swift` (seed hook), `copy/messages/*.json`, generated strings
- Test: `ios/Blanc/BlancUITests/TabUndoUITests.swift`

**Interfaces:**
- Consumes: Task 2's `lastClosed`, `undoClose()`.
- Produces: a banner above the pill while `lastClosed != nil`, in the Send banner's position and style: text `SyncCopy.text("tabs.closedToast")`, button `SyncCopy.text("menu.undo")` (identifier `banner.undo`). New catalog key `tabs.closedToast` = "Tab closed" with translations, `npm run copy:build`, `copy:ack` per locale. UI seed `-BlancUITestTwoTabs`: sync off, tabs `https://example.com/` (current) and `https://example.org/`.

- [ ] **Step 1: Write the failing UI test** `testUndoBringsTheTabBack`: launch with `-BlancUITestTwoTabs`; open the palette, type `/close`, Go; `banner.undo` appears; tap it; the pill's domain reads `example.com` again and the banner is gone.
- [ ] **Step 2: Run it** on iOS 27.0. Expected: FAIL (no banner).
- [ ] **Step 3: Implement** the banner, the key and its translations, and the seed.
- [ ] **Step 4: Run it** on iOS 26.5 and 27.0, plus `npm run copy:check` and `node --test test/unit/i18n-documents.test.js`. Expected: pass.
- [ ] **Step 5: Commit:** `ios(m11): Undo banner after closing a tab`.

### Task 4: Swipe thresholds

**Files:**
- Create: `ios/Blanc/Blanc/PillSwipe.swift`
- Test: `ios/Blanc/BlancTests/PillSwipeTests.swift`

**Interfaces:**
- Produces: `enum PillSwipe { enum Outcome { case previous, next, stay }; static func isSideways(_ translation: CGSize) -> Bool; static func displayed(_ dx: CGFloat, hasPrevious: Bool, hasNext: Bool) -> CGFloat; static func outcome(dx: CGFloat, predictedDx: CGFloat, width: CGFloat, hasPrevious: Bool, hasNext: Bool) -> Outcome }`. Negative dx (finger moves left) means next.

- [ ] **Step 1: Write the failing tests:** `isSideways`: (12, 0) true, (11, 0) false, (20, 20) false, (-30, 10) true. `displayed`: (-100, hasNext: false) = -25; (-100, hasNext: true) = -100; (80, hasPrevious: false) = 20. `outcome` with width 400: dx -120 → `.next`; dx -119, predicted -150 → `.stay`; dx -60, predicted -210 → `.next`; dx 130 with no previous → `.stay`; dx 130 → `.previous`.
- [ ] **Step 2: Run** `-only-testing:BlancTests/PillSwipeTests`. Expected: build fails.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: pass.
- [ ] **Step 5: Commit:** `ios(m11): swipe thresholds`.

### Task 5: Swipe the pill

**Files:**
- Modify: `ios/Blanc/Blanc/ContentView.swift`
- Test: `ios/Blanc/BlancUITests/PillSwipeUITests.swift`

**Interfaces:**
- Consumes: Tasks 1 and 4.
- Produces: a `DragGesture(minimumDistance: 12)` attached to the pill with `.simultaneousGesture`, acting only when `PillSwipe.isSideways`. While dragging, the page layer shows the current `WebView` offset by `PillSwipe.displayed` and the neighbor's `snapshot` (or its site-name card) beside it; on release, `outcome` decides, and a spring (response 0.35, damping 0.85) finishes before `setActive`. `UISelectionFeedbackGenerator` on a switch. With `accessibilityReduceMotion`, no offset: the switch cross-fades. Pill accessibility actions named `settings.gesture.action.nextTab` / `previousTab`.

- [ ] **Step 1: Write the failing UI tests:** `testSwipeLeftGoesToTheNextTab` (`-BlancUITestTwoTabs`; `app.buttons["Open palette"].swipeLeft()`; the pill's domain reads `example.org`), `testSwipeAtTheEndStays` (swipe right on the first tab; still `example.com`), `testTapStillOpensThePalette`, `testHeartStillTaps` (the heart still toggles after the gesture is added).
- [ ] **Step 2: Run** on iOS 27.0. Expected: the swipe tests fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `BlancUITests` on iOS 26.5 and 27.0. Expected: all pass.
- [ ] **Step 5: Commit:** `ios(m11): swipe the pill to switch tabs`.

### Task 6: The card strip

**Files:**
- Create: `ios/Blanc/Blanc/TabStrip.swift`
- Modify: `ios/Blanc/Blanc/PaletteSheet.swift` (the resting tab list and its `.onDelete` give way to the strip; sent pages and other devices stay lists below)
- Test: `ios/Blanc/BlancUITests/TabStripUITests.swift`

**Interfaces:**
- Consumes: Tasks 1, 2 and 4.
- Produces: `TabStrip(manager:onSelect:)`: a horizontal `ScrollView` of cards (about a third of the width, the screen's proportions, title in one line below), the current card outlined and scrolled into view on appear, private cards with the private look. Each card: identifier `tab.card`, accessibility label the title, action named `settings.gesture.action.closeTab`; tap selects and dismisses the palette; an upward drag (`PillSwipe.isSideways` with axes swapped) follows the finger and fades, closing past 100 pt up or a predicted 200 pt; otherwise springs back. Reduce Motion: fades only.

- [ ] **Step 1: Write the failing UI tests:** `testCardsShowEveryOpenTab` (`-BlancUITestTwoTabs`; open the palette; two `tab.card`), `testFlickUpClosesTheTabWithUndo` (swipe up on the second card; one card left; `banner.undo` shows), `testTapCardSwitches`.
- [ ] **Step 2: Run** on iOS 27.0. Expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `BlancUITests` on iOS 26.5 and 27.0 and the whole `BlancTests`. Expected: pass.
- [ ] **Step 5: Commit:** `ios(m11): the card strip, flick up to close`.

### Task 7: Records and the PR

**Files:**
- Modify: `spec/parity-matrix.md` (F56 iOS → PARTIAL, "M11 iOS client implemented, unreleased"), the M11 rows in `docs/superpowers/specs/2026-10-24-ios-v1-companion-release-design.md` and `docs/superpowers/specs/2026-10-21-ios-port-revisit.md` (implemented, unreleased). The Bangs move was recorded with this plan.

- [ ] **Step 1: Edit the records.**
- [ ] **Step 2: Run** `node --test test/unit/spaces-free-records.test.js test/unit/public-truth.test.js test/unit/ios-pages-bridge.test.js`, `npm run copy:check`. Expected: pass.
- [ ] **Step 3: Commit** `ios(m11): records`, push, open the PR against `main` with the tests run on both iOS versions and the by-hand check left for a real iPhone.
