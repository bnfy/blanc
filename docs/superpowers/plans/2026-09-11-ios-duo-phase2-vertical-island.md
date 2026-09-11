# iOS Duo Phase 2: Island on the Vertical Axis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Phase 1 (`2026-09-11-ios-duo-phase1-adaptive-skeleton.md`) must be complete first: this plan consumes `LayoutPosture`, `PostureReader`, and `IslandState`.

**Goal:** Implement D27. When the environment reports vertical controls (iPhone Duo's outer display, or its inner display in landscape), the Island splits into a horizontal **readout** capsule and system toolbar **actions** on the side edge, with the tab dots as one vertical toolbar item. When it reports horizontal bars, the single resting pill renders as today. Both compositions draw from one model; switching between them recreates nothing. This phase also corrects the port's 3-dot cap to the F1 contract (8 plus `+N`) and gives the readout a real favicon.

**Architecture:** `IslandPresentation` is a pure port of the desktop's `islandTabPresentation()` (standalone pins first, then an active-containing window of the active section, hard cap 8, window-wide `+N`), written against a lightweight `DotTab` projection so it is correct before pins and groups exist on iOS (M8). `TabDots` renders that presentation on either axis. `IslandReadout` is the tap target and the text-bearing half of the Island. `IslandActions` is a `ToolbarContent` builder whose items carry the shared titles from `IslandActions.strings` and SF Symbols from the same catalog, gated on `IslandCapabilities` so actions whose features are not yet built (Favorite until M7, Downloads until M11) are hidden rather than dead. `ContentView` keeps the web view at one position in the view tree and branches only the chrome on `posture.controlAxis`. A `FaviconStore` supplies bounded, cached page icons to the readout, the dots' accessibility labels, and later the palette rows.

**Tech Stack:** Swift 5, SwiftUI (`NavigationStack`, `ToolbarContent`, `ToolbarItemGroup`), WebKit, Observation, XCTest with hosted views, Xcode 27 / iOS 27 SDK, deployment target iOS 17.0 (unchanged), `#available(iOS 27, *)` around every Duo-only toolbar API.

**Spec:** D27, D7, D19 in `spec/divergence-register.md`; F1 (including its Duo note) and F37 in `spec/features.md`; scenarios F1-3, F1-4, F1-5, F1-6 in `spec/acceptance/iphone-duo.feature`; copy from `copy/island-actions.json`; geometry from the `mobile` tokens in `tokens/tokens.json`. Program plan §Phase 2.

## Global Constraints

- Deployment target stays `17.0`. Toolbar visibility priority and the system overflow menu are iOS 27 APIs; guard them and let the horizontal pill be the fallback everywhere the guard fails. Below iOS 27 there is no Duo, so nothing is lost.
- **Verify SDK spellings before Task 5.** The HIG names `ToolbarItemVisibilityPriority` (confirmed in the iOS 27 documentation index with `.automatic`, `.low`, `.high`, and `init(higherThan:)`/`init(lowerThan:)`) and `ToolbarOverflowMenu` (confirmed). The *modifier* that applies a priority to a `ToolbarItem`, and whether vertical placement on Duo is automatic for `.navigationBar`/`.bottomBar` items or needs an opt-in, are not confirmed from this repository. Read them from the SDK headers or the Tech Talk "Raise the bar with iPhone Duo" (111462) and record the exact spellings in `ios/README.md` before writing `IslandActions`.
- Titles come from the `island_*` keys in `ios/Blanc/Blanc/IslandActions.strings` (copied in Phase 1, guarded by `test/unit/ios-substrate-copies.test.js`). Never inline an action title.
- Geometry from `BlancTokens.islandReadoutHeight`, `islandReadoutRadius`, `islandDotSize`, `islandDotGap`. Convert the `px` strings once, in a small `TokenLength` helper; do not scatter parsing.
- Blanc never draws its own ellipsis or overflow menu; the system's is the only one (D27, HIG).
- The web view stays at a single position in the SwiftUI tree. Branch chrome, never the `WebView`. The Phase 1 `ContinuityTests` must keep passing after every task here.
- Exactly one Island per window. The pill and the readout are never both visible.
- Test command and destinations: `ios/README.md` from Phase 1.
- Nothing merges to `origin/main` before September 17, 2026.
- Definition of Done: `spec/acceptance/index.md` records simulator evidence for F1-3, F1-4, F1-5; F1-6 is recorded as blocked on M11 (no downloads on iOS yet). `spec/parity-matrix.md` F1 iOS stays `PARTIAL` with an updated note. Commit after each task; push only when the owner asks.

---

### Task 1: `IslandPresentation`, a pure port of the desktop dot policy

Mirror `islandTabPresentation()` in `src/renderer/renderer.js` exactly, including the windowing around the active tab, so the two platforms show the same dots for the same tab set.

**Files:**
- Create: `ios/Blanc/Blanc/IslandPresentation.swift`
- Create: `ios/Blanc/BlancTests/IslandPresentationTests.swift`

**Interfaces:**
- Produces:
  ```swift
  struct DotTab: Equatable, Identifiable { let id: UUID; var isPinned: Bool = false; var groupId: UUID? = nil }
  struct IslandPresentation: Equatable {
      static let cap = 8
      let pinned: [DotTab]      // standalone pins shown
      let section: [DotTab]     // active section window shown
      var shown: [DotTab] { pinned + section }
      let hidden: Int           // window-wide +N
      static func make(tabs: [DotTab], activeId: UUID?) -> IslandPresentation
  }
  extension TabModel { var dotTab: DotTab { DotTab(id: id) } }   // pins/groups wired in M8
  ```
- Rules (from the desktop comment block): no active tab → empty. Active is a standalone pin → the pinned shelf is the section: an active-containing window of standalone pins, cap 8, nothing else. Otherwise → up to `cap - 1` standalone pins, then an active-containing window of the active section (the active tab's group, pins first; or the loose ungrouped tabs) filling the remaining slots. `hidden = total - shown.count`. The window starts at 0 while the active index fits, else at `min(activeIdx - (capacity - 1), count - capacity)`.

- [ ] **Step 1: Write `IslandPresentationTests`**

Cases: (a) 3 loose tabs → 3 shown, 0 hidden; (b) 12 loose tabs, active at index 0 → first 8 shown, 4 hidden; (c) 12 loose tabs, active at index 10 → indices 3…10 shown; (d) 2 standalone pins + 9 loose, active loose at index 8 → 2 pins then a 6-wide window containing the active; (e) 9 standalone pins, active is a pin at index 8 → indices 1…8, hidden 1, `section` empty; (f) active in a group of 3 with 5 loose tabs → the 3 group members shown (pins first), hidden 5; (g) `activeId` nil → everything empty, hidden 0; (h) `cap` is 8, not 3.

- [ ] **Step 2: Run to verify compile failure**
- [ ] **Step 3: Implement `IslandPresentation.swift`** as a direct transliteration; keep the desktop comment's reasoning in a doc comment and cite `renderer.js islandTabPresentation()`.
- [ ] **Step 4: Run tests; pass on the current-iPhone destination**
- [ ] **Step 5: Commit** — `ios: port the Island dot presentation policy (cap 8 plus +N)`

---

### Task 2: `FaviconStore`

The readout and the dots' accessibility labels need page icons. WebKit exposes none, so probe the document once per committed navigation and fetch the icon with bounds that mirror the desktop's sync sidecar (32-pixel raster, bounded count).

**Files:**
- Create: `ios/Blanc/Blanc/FaviconStore.swift`
- Modify: `ios/Blanc/Blanc/TabModel.swift` (add `var favicon: UIImage?`)
- Modify: `ios/Blanc/Blanc/TabNavigationDelegate.swift` (on `didFinish`, ask the store for the page's icon; `onURLChange` remains the only session trigger)
- Create: `ios/Blanc/BlancTests/FaviconStoreTests.swift`

**Interfaces:**
- Produces:
  ```swift
  @Observable final class FaviconStore {
      static let maxEntries = 200; static let pixelSize = 32
      func icon(forHost host: String) -> UIImage?
      func resolveIconURL(pageURL: URL, declaredHref: String?) -> URL?   // pure
      func fetch(for webView: WKWebView, pageURL: URL, into tab: TabModel)
  }
  ```
- Rules: only `http`/`https` page URLs are probed; `blanc://` and `about:` pages get the bundled Blanc glyph instead. The probe script reads `document.querySelector('link[rel~="icon"]')?.href` on the main frame only; a missing link falls back to `/favicon.ico` on the page's origin. The resolved icon URL must share the page's host or be `https`; anything else is dropped. Fetch via `URLSession` with the page's `WKWebsiteDataStore` cookies **not** attached (a plain ephemeral session), decode, downscale to 32 px, and cache by host with LRU eviction at 200 entries. Private tabs (M9) will bypass the cache; leave the hook (`isPrivate` parameter defaulting to `false`).

- [ ] **Step 1: Write `FaviconStoreTests`** for `resolveIconURL`: relative href resolves against the page; absolute same-host href accepted; cross-host `http` href rejected; cross-host `https` href accepted; `nil` href → `/favicon.ico`; `blanc://newtab/` → `nil`. Plus an LRU test: insert 201 hosts, the first is gone.
- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement**; keep the network call behind a `FaviconFetching` protocol with a `URLSession` default so the store's logic is testable without I/O.
- [ ] **Step 4: Run tests; load `https://example.com` and `https://developer.apple.com` on the simulator and confirm icons appear within a second of `didFinish`**
- [ ] **Step 5: Commit** — `ios: add a bounded FaviconStore fed from committed navigations`

---

### Task 3: `IslandReadout`

**Files:**
- Create: `ios/Blanc/Blanc/IslandReadout.swift`
- Create: `ios/Blanc/Blanc/TokenLength.swift` (`static func points(_ token: String) -> CGFloat`, parses `"44px"` → 44)
- Modify: `ios/Blanc/Blanc/ContentView.swift` (move `displayDomain` into a pure `func displayDomain(for url: URL?) -> String` in the readout file; the pill calls the same function)
- Create: `ios/Blanc/BlancTests/IslandReadoutTests.swift`

**Interfaces:**
- Produces: `struct IslandReadout: View { let manager: TabsManager; let posture: LayoutPosture }` rendering, leading to trailing: favicon (or Blanc glyph), domain (or the F37 placeholder on a blank tab), the shield glyph when `manager.isAdBlockReady` (binary, D13), and a private chip slot that stays hidden until M9. Height `islandReadoutHeight`; Liquid Glass on iOS 26+ with the token fallback (reuse `PillStyle`). Tap anywhere → `manager.island.isPalettePresented = true`. Accessibility: identifier `island:readout`, label "Search, tabs and commands", value = domain.
- F37 rule: on `blanc://newtab/` the domain slot shows "Search or enter address" in placeholder ink and the readout's accessibility traits include `.searchField`.

- [ ] **Step 1: Write tests** for `displayDomain(for:)` (`nil` → "New Tab"; `blanc://newtab/` → "New Tab"; `blanc://bookmarks/` → "bookmarks"; `https://news.example/x` → "news.example") and `TokenLength.points` (`"44px"` → 44, `"22px"` → 22, malformed → 0 with an assertion in debug).
- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement the view and helpers**
- [ ] **Step 4: Host `IslandReadout` in a `UIHostingController` in a test and assert the `island:readout` identifier exists and its accessibility value equals the domain**
- [ ] **Step 5: Commit** — `ios: add the IslandReadout capsule`

---

### Task 4: `TabDots` on either axis

**Files:**
- Create: `ios/Blanc/Blanc/TabDots.swift`
- Create: `ios/Blanc/BlancTests/TabDotsTests.swift`

**Interfaces:**
- Produces: `struct TabDots: View { let manager: TabsManager; let axis: Axis }`. Builds `IslandPresentation.make(tabs: manager.tabs.map(\.dotTab), activeId: manager.activeTabId)`; renders `shown` as circles of `islandDotSize` with `islandDotGap`, a 4-point section gap between `pinned` and `section` (mirrors `.dot-section-start`), the active dot in `BlancTokens.text`, others in `BlancTokens.border`; then `+N` in the caption font when `hidden > 0`. Tap a dot → `manager.setActive(id)`; tap `+N` → `manager.island.isPalettePresented = true`. Accessibility per dot: label "Switch to <title or New Tab>", identifier `island:dot:<index>`; `+N` identifier `island:dots:more`.

- [ ] **Step 1: Write hosted tests**: 12 tabs → exactly 8 `island:dot:*` identifiers and one `island:dots:more` whose label contains "4"; 3 tabs → 3 dots and no `more`; tapping `island:dot:1` (send the accessibility activate action) changes `manager.activeTabId`.
- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement** with a `layout` switch on `axis` (`HStack` / `VStack`) and nothing else axis-specific.
- [ ] **Step 4: Replace `ContentView.tabDots` with `TabDots(manager:axis: .horizontal)` in the existing pill and run all tests** (this alone fixes the 3-dot deviation on every iPhone).
- [ ] **Step 5: Commit** — `ios: TabDots on either axis, cap 8 plus +N (fixes the 3-dot deviation)`

---

### Task 5: `IslandActions` toolbar content

Do not start until the SDK spellings from Global Constraints are recorded in `ios/README.md`.

**Files:**
- Create: `ios/Blanc/Blanc/IslandActions.swift`
- Create: `ios/Blanc/Blanc/IslandCapabilities.swift`
- Create: `ios/Blanc/BlancTests/IslandActionsTests.swift`

**Interfaces:**
- Produces:
  ```swift
  struct IslandCapabilities { var favorites = false; var downloads = false; static let current = IslandCapabilities() }  // M7 / M11 flip these
  struct IslandAction: Identifiable { let id: String; let titleKey: String; let symbol: String; let group: Group; let priority: Priority; enum Group { case navigation, primary, secondary }; enum Priority { case high, standard } }
  enum IslandActionCatalog { static func actions(for tab: TabModel?, capabilities: IslandCapabilities) -> [IslandAction] }   // pure: reload vs stop, favorite vs unfavorite, hidden actions
  struct IslandActionsToolbar: ToolbarContent { let manager: TabsManager; let posture: LayoutPosture }
  ```
- Catalog rules (pure, tested): navigation group = `close_tab`; primary group = `new_tab`, then `reload` or `stop` (`stop` while `tab.isLoading`), both `.high`; secondary group = `favorite`/`unfavorite` only when `capabilities.favorites`, `downloads` only when `capabilities.downloads`, then `tabs`. Titles are the `island_<id>` keys; symbols from `copy/island-actions.json`. Ordering follows the HIG placement order: Close first, prominent actions next, original groupings after.
- Toolbar rules: one `ToolbarItemGroup` per catalog group, in that order. Each item is a `Button` with `Label(String(localized: titleKey), systemImage: symbol)`; the `tabs` item's label is `TabDots(manager:axis: .vertical)` with the title as its accessibility label. Apply the visibility priority (spelling from the README) under `#available(iOS 27, *)`. Never add fixed spacing between items; never add an overflow item. Identifiers `island:action:<id>`.

- [ ] **Step 1: Write `IslandActionsTests`** for the catalog: loading tab → `stop` not `reload`; favorites off → no favorite item; favorites on and bookmarked → `unfavorite`; downloads off → no downloads item; order is close_tab, new_tab, reload/stop, [favorite], [downloads], tabs; every `titleKey` exists in `IslandActions.strings` (load the bundle's strings dictionary and assert the key resolves to a non-key string).
- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement the catalog and the `ToolbarContent`**
- [ ] **Step 4: Run tests; build on the Duo simulator** (toolbar rendering is verified in Task 6)
- [ ] **Step 5: Commit** — `ios: IslandActions toolbar content from the shared action catalog`

---

### Task 6: Compose by posture in `ContentView`

**Files:**
- Modify: `ios/Blanc/Blanc/ContentView.swift`
- Modify: `ios/Blanc/Blanc/PaletteSheet.swift` (no behaviour change; confirm it reads `manager.island` from Phase 1)
- Create: `ios/Blanc/BlancTests/IslandCompositionTests.swift`

- [ ] **Step 1: Write `IslandCompositionTests`**

Host `ContentView(manager:)` under `.readingPosture(signals: StubSignals(barEdge: .trailing))` with compact traits and assert `island:readout` exists and `island:pill` does not; under `StubSignals(barEdge: nil)` with regular traits assert the reverse. Assert in both cases that exactly one of the two identifiers exists and that `manager.activeTab!.webView` is the same instance before and after flipping the stub (extend the Phase 1 continuity test rather than duplicating it if that is cleaner).

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Restructure `ContentView`**

```swift
var body: some View {
    NavigationStack {
        ZStack(alignment: .bottom) {
            background
            if let tab = manager.activeTab { WebView(tab: tab).id(tab.id) }   // one position, never inside the posture branch
            if posture.controlAxis == .horizontal {
                restingPill.accessibilityIdentifier("island:pill")
            } else {
                IslandReadout(manager: manager, posture: posture)          // carries "island:readout"
            }
        }
        .toolbar(posture.controlAxis == .vertical ? .visible : .hidden, for: .navigationBar)
        .toolbar { if posture.controlAxis == .vertical { IslandActionsToolbar(manager: manager, posture: posture) } }
        .navigationBarTitleDisplayMode(.inline)
    }
    .sheet(isPresented: Bindable(manager.island).isPalettePresented) { PaletteSheet(manager: manager) }
}
```

Adjust to the SDK: if Duo places `.bottomBar` items vertically but not `.navigationBar` ones, use the placement the README records. The readout's bottom padding uses the safe area only (no hard-coded inset), so it clears the vertical bar and, in Split View, the shared edge.

- [ ] **Step 4: Run all tests, including Phase 1's `ContinuityTests`**

- [ ] **Step 5: Verify by eye on the Duo simulator**
  - Outer display: readout at the bottom of content, side bar with New Tab and Reload at the top of its axis, vertical dots, no Blanc ellipsis (F1-3).
  - Toggle to inner portrait: the single pill returns, same tabs and dots; open the palette, type `exa`, toggle back: text still there (F1-4).
  - Inner landscape: vertical bar again; enter Split View with another app and confirm Blanc's items sit on the edge away from the other app (F1-5).
  - Compress the width until items overflow: the system overflow menu lists them by their titles; nothing Blanc-drawn appears (the badge half of F1-6 is blocked on M11).

- [ ] **Step 6: Commit** — `ios: compose the Island by posture (D27)`

---

### Task 7: Evidence and bookkeeping

**Files:**
- Modify: `spec/acceptance/index.md` (F1-3, F1-4, F1-5 iOS cells → `simulator-verified <date>`; F1-6 → `⬜ blocked on M11 (no downloads on iOS)`)
- Modify: `spec/parity-matrix.md` (F1 iOS note: "Duo compositions built; Favorite/Downloads/private chip await M7/M11/M9")
- Modify: `docs/superpowers/plans/2026-07-08-ios-m2-multi-tab.md` (mark the 3-dot note resolved)
- Modify: `docs/superpowers/plans/2026-09-10-iphone-duo-mobile-migration.md` (tick Phase 2, date)

- [ ] **Step 1: Update the four files**
- [ ] **Step 2: Run `npm run substrate:check`, `npm run test:unit`, `npm run test:acceptance:dry`, and the Xcode test command on every recorded destination**
- [ ] **Step 3: Commit** — `docs: record Duo Phase 2 simulator evidence`; ask the owner before pushing.

## Out of scope for Phase 2

- Fold and camera handling for the find capsule, sheets, popovers, and the `blanc://` pages (Phase 3), and the fold descriptor over the pages bridge.
- Favorite, Downloads, and the private chip becoming live: they arrive with M7, M11, and M9 and flip `IslandCapabilities` / show the chip. The toolbar and readout are built to accept them without restructuring.
- Pins and groups in `IslandPresentation`'s inputs (M8). The policy is complete now; `TabModel.dotTab` gains the two fields then.
- Hardware acceptance. Every check here is simulator-only and is recorded as such.
- Fold-to-command and Glance arrangements (Phase 4).
