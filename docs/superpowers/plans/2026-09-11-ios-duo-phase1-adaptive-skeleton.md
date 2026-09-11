# iOS Duo Phase 1: Adaptive Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the iOS port the adaptive layer that iPhone Duo requires before the Island is rebuilt: an Xcode 27 toolchain with Duo simulators, a pure `LayoutPosture` model derived from the environment, the Island's transient state lifted out of view-local `@State` so opening or closing the device recreates nothing, a web view that honours safe areas, and fresh substrate copies guarded by a repo-level test. The visible pill does not change in this phase.

**Architecture:** `LayoutPosture` is a value type with a tested derivation table; a `PostureReader` modifier reads size classes, orientation, and safe-area asymmetry and publishes the posture through the SwiftUI environment. Fold and camera signals enter through a `PostureSignals` protocol whose default implementation reports none, so the model is complete now and the iOS 27 reserved-region API slots in during Phase 3 without touching callers. `IslandState` (palette presented, palette input, find state) is `@Observable` and owned by `TabsManager`, the same lifetime as the tabs and their web views, so continuity across displays is a model property that unit tests can assert. `ContentView` consumes the posture but keeps rendering today's single pill; Phase 2 adds the vertical-axis branch.

**Tech Stack:** Swift 5, SwiftUI, WebKit, Observation (`@Observable`), XCTest with `UIHostingController` trait overrides, Xcode 27 / iOS 27 SDK, deployment target iOS 17.0 (unchanged), node:test for the cross-platform substrate guard.

**Spec:** D27 and the D7/D11/D19 amendments in `spec/divergence-register.md`; F1 Duo note in `spec/features.md`; `spec/acceptance/iphone-duo.feature` (F1-4 is the continuity contract this phase makes testable). Program plan: `docs/superpowers/plans/2026-09-10-iphone-duo-mobile-migration.md` §Phase 1.

## Global Constraints

- Deployment target stays `17.0`. Any iOS 27 API is behind `#available(iOS 27, *)`; this phase should need none.
- Bundle identifier `me.bnfy.blanc`. Filesystem-synchronized groups: files placed in `ios/Blanc/Blanc/` or `ios/Blanc/BlancTests/` join their target automatically. `ios/Blanc/Tokens.swift` and `ios/Blanc/BlancSettings.swift` are explicit file references, so replacing their contents in place is enough; do not move them.
- Never hand-edit generated substrate files. Refresh `ios/Blanc/Tokens.swift`, `ios/Blanc/BlancSettings.swift`, and the `.strings` resources by copying from `*/generated/`.
- No UI test target exists (removed in M0–M1). Continuity is proven with XCTest hosting `ContentView` in a `UIHostingController` and overriding traits, not with XCUITest.
- No hard-coded Duo geometry. Safe areas and insets are read at runtime; Blanc's own geometry comes from `BlancTokens` (`islandReadoutHeight`, `islandDotSize`, `islandDotGap`; all mobile-only tokens added in Phase 0).
- Test command (fill in the exact simulator names in Task 1): `xcodebuild test -project ios/Blanc/Blanc.xcodeproj -scheme Blanc -destination '<destination>' -quiet`.
- Nothing here merges to `origin/main` before September 17, 2026 (launch freeze). Work on `claude/iphone-duo-hig-review-k9tdim` or a branch off it.
- Definition of Done includes updating `spec/parity-matrix.md` and `spec/acceptance/index.md`. This phase flips no row to SHIPPED; it records simulator evidence for F1-4 only.
- Commit after each task. Do not push until the owner asks.

---

### Task 1: Xcode 27 toolchain, Duo simulators, and `ios/README.md`

Pin the environment every later task assumes and write down the destinations so nobody guesses simulator names.

**Files:**
- Create: `ios/README.md`
- Modify: `ios/Blanc/Blanc.xcodeproj/project.pbxproj` only if Xcode 27 insists on a settings migration (accept its recommended settings; keep `IPHONEOS_DEPLOYMENT_TARGET = 17.0`; add `INFOPLIST_KEY_UIRequiresFullScreen = NO` explicitly if the key is absent, so Split View on the inner display is never refused)

- [ ] **Step 1: Confirm the toolchain**

Run: `xcodebuild -version` (expect Xcode 27.x) and `xcodebuild -showsdks | grep -i iphoneos` (expect the iOS 27 SDK).

- [ ] **Step 2: List destinations and pick four**

Run: `xcodebuild -project ios/Blanc/Blanc.xcodeproj -scheme Blanc -showdestinations 2>/dev/null | grep -i "iphone"`

Pick and record: the iPhone Duo simulator (the SDK may expose the outer and inner displays as one device with a fold control or as two configurations; record whichever it is and how to switch), a current standard iPhone, and an iOS 17 runtime simulator for the floor (install the runtime through Xcode Settings → Components if absent).

- [ ] **Step 3: Build and test on each**

Run the test command against each destination. All existing `BlancTests` must pass on all of them before anything changes. Record any Xcode 27 deprecation warnings that fire in the current code in the README's "Known warnings" section rather than fixing them here.

- [ ] **Step 4: Write `ios/README.md`**

Sections: Requirements (Xcode 27, iOS 27 SDK, iOS 17 runtime), Destinations (the exact `-destination` strings from Step 2, one per line, and how to toggle the Duo simulator between displays), Test command, Substrate copies (which files are copies of which `*/generated/` files and the guard test from Task 2), Known warnings.

- [ ] **Step 5: Commit**

```
git add ios/README.md ios/Blanc/Blanc.xcodeproj
git commit -m "ios: pin Xcode 27 toolchain and record Duo simulator destinations"
```

---

### Task 2: Refresh substrate copies and guard them from the repo

`ios/Blanc/Tokens.swift` and `ios/Blanc/BlancSettings.swift` already differ from `tokens/generated/Tokens.swift` and `settings-schema/generated/BlancSettings.swift`, and `IslandActions.strings` is not in the app yet. Copy, then guard with a node test so the parity-guards workflow (which runs `npm run test:unit` on Linux) catches future drift without a Mac.

**Files:**
- Modify: `ios/Blanc/Tokens.swift`, `ios/Blanc/BlancSettings.swift` (overwrite with generated contents)
- Modify: `ios/Blanc/Blanc/SlashCommands.strings` (confirm identical; overwrite if not)
- Create: `ios/Blanc/Blanc/IslandActions.strings` (copy of `copy/generated/IslandActions.strings`)
- Create: `test/unit/ios-substrate-copies.test.js`
- Modify: `tokens/README.md`, `copy/README.md` (one line each pointing at the guard)

**Interfaces:**
- Produces: the guard test, a table of `[generated path, iOS copy path]` pairs asserted byte-identical.

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PAIRS = [
  ['tokens/generated/Tokens.swift', 'ios/Blanc/Tokens.swift'],
  ['settings-schema/generated/BlancSettings.swift', 'ios/Blanc/BlancSettings.swift'],
  ['copy/generated/SlashCommands.strings', 'ios/Blanc/Blanc/SlashCommands.strings'],
  ['copy/generated/IslandActions.strings', 'ios/Blanc/Blanc/IslandActions.strings'],
];

test('the iOS project carries byte-identical copies of the generated substrate files', () => {
  for (const [generated, copy] of PAIRS) {
    assert.ok(fs.existsSync(path.join(ROOT, copy)), `${copy} is missing — copy it from ${generated}`);
    assert.equal(
      fs.readFileSync(path.join(ROOT, copy), 'utf8'),
      fs.readFileSync(path.join(ROOT, generated), 'utf8'),
      `${copy} has drifted from ${generated} — run the *:build script and copy the result`,
    );
  }
});
```

- [ ] **Step 2: Run it and watch it fail on the two stale Swift files and the missing `.strings`**

Run: `node --test test/unit/ios-substrate-copies.test.js`

- [ ] **Step 3: Copy the generated files into place**

```
cp tokens/generated/Tokens.swift ios/Blanc/Tokens.swift
cp settings-schema/generated/BlancSettings.swift ios/Blanc/BlancSettings.swift
cp copy/generated/SlashCommands.strings ios/Blanc/Blanc/SlashCommands.strings
cp copy/generated/IslandActions.strings ios/Blanc/Blanc/IslandActions.strings
```

- [ ] **Step 4: Run the guard and the iOS tests**

`node --test test/unit/ios-substrate-copies.test.js` passes. The Xcode test command passes on the current-iPhone destination (the refreshed `BlancSettings.swift` may rename or add enum cases; fix call sites in `SettingsStore.swift`/`TabsManager.swift` if the compiler says so, never the generated file).

- [ ] **Step 5: Commit**

```
git add ios/Blanc/Tokens.swift ios/Blanc/BlancSettings.swift ios/Blanc/Blanc/*.strings test/unit/ios-substrate-copies.test.js tokens/README.md copy/README.md
git commit -m "ios: refresh substrate copies and guard them from the unit suite"
```

---

### Task 3: `LayoutPosture` value type with a tested derivation table

Pure Swift, no SwiftUI views. This is the one place the app decides which Island composition it is in.

**Files:**
- Create: `ios/Blanc/Blanc/LayoutPosture.swift`
- Create: `ios/Blanc/BlancTests/LayoutPostureTests.swift`

**Interfaces:**
- Produces:
  ```swift
  enum ControlAxis { case horizontal, vertical }
  enum FoldState: Equatable { case unfolded; case partiallyFolded(axis: Axis) }   // Axis from SwiftUI
  struct PostureInputs {
      var horizontalSizeClass: UserInterfaceSizeClass?
      var verticalSizeClass: UserInterfaceSizeClass?
      var isLandscape: Bool
      var safeArea: EdgeInsets            // resolved leading/trailing, not left/right
      var systemBarEdge: HorizontalEdge?  // from PostureSignals; nil when unknown
      var fold: FoldState
      var cameraReserved: Bool
  }
  struct LayoutPosture: Equatable {
      let controlAxis: ControlAxis
      let isCompactWidth: Bool
      let barEdge: HorizontalEdge?        // which edge the vertical bar occupies, when vertical
      let fold: FoldState
      let cameraReserved: Bool
      static func derive(_ inputs: PostureInputs) -> LayoutPosture
  }
  protocol PostureSignals { func systemBarEdge(safeArea: EdgeInsets) -> HorizontalEdge?; var fold: FoldState { get }; var cameraReserved: Bool { get } }
  struct DefaultPostureSignals: PostureSignals   // asymmetry heuristic; fold .unfolded; camera false
  ```
- Derivation rule (this is the table the tests pin):
  - `controlAxis` is `.vertical` when `systemBarEdge` is non-nil; otherwise `.horizontal`.
  - `DefaultPostureSignals.systemBarEdge` returns the edge whose safe-area inset exceeds the other by at least 24 points **and** the width class is compact or the device is in landscape; otherwise `nil`. Inner portrait on Duo is regular width and portrait, so it resolves `.horizontal` even if a small asymmetry exists.
  - `isCompactWidth` mirrors `horizontalSizeClass == .compact`.
  - `fold` and `cameraReserved` pass through untouched.

- [ ] **Step 1: Write `LayoutPostureTests`**

```swift
import XCTest
import SwiftUI
@testable import Blanc

final class LayoutPostureTests: XCTestCase {
    private func inputs(h: UserInterfaceSizeClass?, landscape: Bool, leading: CGFloat = 0, trailing: CGFloat = 0,
                        fold: FoldState = .unfolded, camera: Bool = false) -> PostureInputs {
        let safe = EdgeInsets(top: 0, leading: leading, bottom: 0, trailing: trailing)
        return PostureInputs(horizontalSizeClass: h, verticalSizeClass: .regular, isLandscape: landscape, safeArea: safe,
                             systemBarEdge: DefaultPostureSignals().systemBarEdge(safeArea: safe, compact: h == .compact, landscape: landscape),
                             fold: fold, cameraReserved: camera)
    }

    func testOuterDisplayIsCompactWithVerticalControls() {
        let p = LayoutPosture.derive(inputs(h: .compact, landscape: false, trailing: 44))
        XCTAssertEqual(p.controlAxis, .vertical); XCTAssertTrue(p.isCompactWidth); XCTAssertEqual(p.barEdge, .trailing)
    }
    func testInnerPortraitIsRegularWithHorizontalBars() {
        let p = LayoutPosture.derive(inputs(h: .regular, landscape: false, leading: 4, trailing: 4))
        XCTAssertEqual(p.controlAxis, .horizontal); XCTAssertFalse(p.isCompactWidth); XCTAssertNil(p.barEdge)
    }
    func testInnerLandscapeIsRegularWithVerticalControls() {
        let p = LayoutPosture.derive(inputs(h: .regular, landscape: true, trailing: 44))
        XCTAssertEqual(p.controlAxis, .vertical); XCTAssertEqual(p.barEdge, .trailing)
    }
    func testSplitViewLeftAppHasBarOnLeading() {
        let p = LayoutPosture.derive(inputs(h: .compact, landscape: true, leading: 44))
        XCTAssertEqual(p.controlAxis, .vertical); XCTAssertEqual(p.barEdge, .leading)
    }
    func testOrdinaryIPhonePortraitStaysHorizontal() {
        let p = LayoutPosture.derive(inputs(h: .compact, landscape: false))
        XCTAssertEqual(p.controlAxis, .horizontal); XCTAssertNil(p.barEdge)
    }
    func testSmallAsymmetryBelowThresholdIsIgnored() {
        let p = LayoutPosture.derive(inputs(h: .compact, landscape: false, trailing: 20))
        XCTAssertEqual(p.controlAxis, .horizontal)
    }
    func testFoldAndCameraPassThrough() {
        let p = LayoutPosture.derive(inputs(h: .regular, landscape: false, fold: .partiallyFolded(axis: .vertical), camera: true))
        XCTAssertEqual(p.fold, .partiallyFolded(axis: .vertical)); XCTAssertTrue(p.cameraReserved)
    }
    func testDefaultSignalsReportNoFoldAndNoCamera() {
        XCTAssertEqual(DefaultPostureSignals().fold, .unfolded); XCTAssertFalse(DefaultPostureSignals().cameraReserved)
    }
}
```

Adjust the `systemBarEdge` signature in the test to match Step 3 exactly; the intent is that the heuristic receives the safe area plus the compact/landscape facts.

- [ ] **Step 2: Run tests to verify they fail to compile (types missing)**

- [ ] **Step 3: Write `LayoutPosture.swift`**

Implement the types and the table above. Keep `derive` a pure function. Document the 24-point threshold as a heuristic placeholder that Phase 3 replaces with the SDK's reserved-region signal once the API names are verified (plan §6), and make `PostureSignals` the single seam for that replacement.

- [ ] **Step 4: Run tests to verify they pass** on the current-iPhone destination.

- [ ] **Step 5: Commit**

```
git add ios/Blanc/Blanc/LayoutPosture.swift ios/Blanc/BlancTests/LayoutPostureTests.swift
git commit -m "ios: add LayoutPosture with a tested derivation table"
```

---

### Task 4: `PostureReader` publishes the posture through the environment

**Files:**
- Create: `ios/Blanc/Blanc/PostureReader.swift`
- Modify: `ios/Blanc/Blanc/ContentView.swift` (read `@Environment(\.layoutPosture)`; expose it as an accessibility identifier on the root so hosted tests can read it; render unchanged)
- Modify: `ios/Blanc/Blanc/BlancApp.swift` (wrap `ContentView` in `.readingPosture(signals: DefaultPostureSignals())`)
- Create: `ios/Blanc/BlancTests/PostureReaderTests.swift`

**Interfaces:**
- Produces: `EnvironmentValues.layoutPosture` (default: horizontal, compact, unfolded), `View.readingPosture(signals:)`. The modifier reads `horizontalSizeClass`, `verticalSizeClass`, a `GeometryReader`'s `safeAreaInsets` and size (landscape = width > height), calls `LayoutPosture.derive`, and sets the environment value.

- [ ] **Step 1: Write `PostureReaderTests`**

Host `Text("x").readingPosture(signals: StubSignals(...))` in a `UIHostingController`, set `traitOverrides.horizontalSizeClass` (iOS 17 API) to `.compact` and `.regular`, force layout with `view.layoutIfNeeded()`, and read the posture back through a `PreferenceKey` or the accessibility identifier. Assert compact → `isCompactWidth == true`, regular → `false`, and that a `StubSignals` returning `.trailing` produces `.vertical`.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Write `PostureReader.swift` and wire `BlancApp`/`ContentView`**

`ContentView` gains `@Environment(\.layoutPosture) private var posture` and `.accessibilityIdentifier("posture:\(posture.controlAxis)")` on its root `ZStack`. No layout branch yet.

- [ ] **Step 4: Run all tests; run the app on the Duo simulator in both displays and confirm the identifier flips** (inspect with the Accessibility Inspector or a temporary `print` removed before commit).

- [ ] **Step 5: Commit**

```
git add ios/Blanc/Blanc/PostureReader.swift ios/Blanc/Blanc/ContentView.swift ios/Blanc/Blanc/BlancApp.swift ios/Blanc/BlancTests/PostureReaderTests.swift
git commit -m "ios: publish LayoutPosture through the environment"
```

---

### Task 5: Honour safe areas in the web view

`ContentView` applies `.ignoresSafeArea(edges: .top)` to `WebView`. On Duo the inner camera's reserved region appears while a page uses the camera; content under it is the F1-8 failure.

**Files:**
- Modify: `ios/Blanc/Blanc/ContentView.swift` (remove `.ignoresSafeArea(edges: .top)`)
- Modify: `ios/Blanc/Blanc/WebView.swift` (set `webView.scrollView.contentInsetAdjustmentBehavior = .always` in `makeUIView` so WebKit applies the safe area as content inset and exposes `env(safe-area-inset-*)` to pages that opt in with `viewport-fit=cover`)
- Create: `ios/Blanc/BlancTests/WebViewSafeAreaTests.swift`

- [ ] **Step 1: Write the test**

Instantiate `WebView(tab: TabModel(url: URL(string: "about:blank")!))`, call `makeUIView` through a `UIViewRepresentableContext` obtained by hosting, and assert `contentInsetAdjustmentBehavior == .always`. (If obtaining the context proves awkward, factor the configuration into `WebView.configure(_ webView: WKWebView)` and test that directly.)

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Make the change**

- [ ] **Step 4: Verify by eye on three simulators**: current iPhone portrait (no gap above the page, no double inset), Duo outer display, Duo inner display. Load `blanc://newtab/` and `https://example.com`. The page's top edge sits exactly at the safe-area boundary.

- [ ] **Step 5: Commit**

```
git add ios/Blanc/Blanc/ContentView.swift ios/Blanc/Blanc/WebView.swift ios/Blanc/BlancTests/WebViewSafeAreaTests.swift
git commit -m "ios: honour safe areas in the web view"
```

---

### Task 6: `IslandState` owned by `TabsManager`, and the continuity test

D27's continuity rule: opening or closing the device changes only the size class and control axis; models survive. Today `showPalette` and the palette's `input` are view-local `@State`, so a container swap in Phase 2 would drop them. Lift them now, while the view is still one branch, and prove continuity with a hosted test.

**Files:**
- Create: `ios/Blanc/Blanc/IslandState.swift`
- Modify: `ios/Blanc/Blanc/TabsManager.swift` (add `let island = IslandState()`)
- Modify: `ios/Blanc/Blanc/ContentView.swift` (`showPalette` → `manager.island.isPalettePresented`)
- Modify: `ios/Blanc/Blanc/PaletteSheet.swift` (`input` → `manager.island.paletteInput`; clear it on successful submit, keep it on dismiss)
- Create: `ios/Blanc/BlancTests/IslandStateTests.swift`
- Create: `ios/Blanc/BlancTests/ContinuityTests.swift`

**Interfaces:**
- Produces:
  ```swift
  @Observable final class IslandState {
      var isPalettePresented = false
      var paletteInput = ""
      var find: FindState? = nil          // struct FindState { var query: String; var matchIndex: Int; var matchCount: Int } — populated by F8 later
  }
  ```

- [ ] **Step 1: Write `IslandStateTests`** (defaults; `paletteInput` survives `isPalettePresented` toggling; `find` nil by default).

- [ ] **Step 2: Write `ContinuityTests`**

```swift
final class ContinuityTests: XCTestCase {
    @MainActor func testPostureChangeKeepsWebViewAndPaletteInput() {
        let manager = TabsManager(settingsDirectory: tmp(), sessionDirectory: tmp())
        manager.island.paletteInput = "exa"
        manager.island.isPalettePresented = true
        let before = manager.activeTab!.webView
        let host = UIHostingController(rootView: ContentView(manager: manager).readingPosture(signals: DefaultPostureSignals()))
        host.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        host.traitOverrides.horizontalSizeClass = .compact
        host.view.layoutIfNeeded()
        host.traitOverrides.horizontalSizeClass = .regular
        host.view.frame = CGRect(x: 0, y: 0, width: 820, height: 760)
        host.view.layoutIfNeeded()
        XCTAssertTrue(manager.activeTab!.webView === before, "the web view was recreated across a size-class change")
        XCTAssertEqual(manager.island.paletteInput, "exa")
        XCTAssertTrue(manager.island.isPalettePresented)
        XCTAssertEqual(manager.tabs.count, 1)
    }
}
```

`tmp()` returns a fresh temporary directory URL so the test never touches the real stores.

- [ ] **Step 3: Run tests to verify they fail** (`island` does not exist).

- [ ] **Step 4: Implement `IslandState`, wire `TabsManager`, `ContentView`, `PaletteSheet`**

`PaletteSheet` currently declares `@State private var input`; replace with `@Bindable var island: IslandState` (or read through `manager.island`) and bind the `TextField` to `island.paletteInput`. Submit clears it after navigation; Done/dismiss leaves it, matching desktop's panel, which keeps typed text until it navigates.

- [ ] **Step 5: Run all tests on the current-iPhone and Duo destinations**

- [ ] **Step 6: Record F1-4 simulator evidence**

In `spec/acceptance/index.md`, change the F1-4 iOS cell from ⬜ to `simulator-verified 2026-MM-DD (ContinuityTests)`. The scenario's "readout and side bar return" clause is Phase 2; note that only the continuity half is covered.

- [ ] **Step 7: Commit**

```
git add ios/Blanc/Blanc/IslandState.swift ios/Blanc/Blanc/TabsManager.swift ios/Blanc/Blanc/ContentView.swift ios/Blanc/Blanc/PaletteSheet.swift ios/Blanc/BlancTests/IslandStateTests.swift ios/Blanc/BlancTests/ContinuityTests.swift spec/acceptance/index.md
git commit -m "ios: lift Island state onto TabsManager and prove continuity across size classes"
```

---

### Task 7: Reconcile the M0–M5 plan bookkeeping

The five iOS milestone plans show zero checked steps although the code exists.

**Files:**
- Modify: `docs/superpowers/plans/2026-07-07-ios-m0-m1-walking-skeleton.md`, `2026-07-08-ios-m2-multi-tab.md`, `2026-07-08-ios-m3-palette.md`, `2026-07-08-ios-m4-internal-pages.md`, `2026-07-09-ios-m5-ad-blocking.md`

- [ ] **Step 1: For each plan, tick every step whose artifact exists in `ios/`** (file present, test present and passing). Leave unticked anything absent and add one line under the task naming what is missing.
- [ ] **Step 2: In the M2 plan, add a note under the tab-dots task**: "3-dot cap deviates from F1 (8 plus `+N`); corrected in Duo Phase 2, `TabDots`."
- [ ] **Step 3: Commit**

```
git add docs/superpowers/plans/2026-07-0*-ios-*.md
git commit -m "docs: reconcile iOS M0-M5 plan checkboxes with the shipped code"
```

---

### Task 8: Phase gate and program-plan update

- [ ] **Step 1: Run the full gate**: the Xcode test command on all recorded destinations; `node --test test/unit/ios-substrate-copies.test.js`; `npm run substrate:check`; `npm run test:acceptance:dry`.
- [ ] **Step 2: Confirm by eye on the Duo simulator** that the existing pill renders in both displays with nothing under the camera region or a side bar, and that toggling displays keeps the page and palette text.
- [ ] **Step 3: Tick Phase 1 in `docs/superpowers/plans/2026-09-10-iphone-duo-mobile-migration.md`** and add the date. The parity matrix does not change in this phase.
- [ ] **Step 4: Commit and ask the owner before pushing.**

## Out of scope for Phase 1

- Any change to what the pill shows or where. The readout/actions split, `TabDots`, and the toolbar items are Phase 2.
- Real fold or camera signals. `DefaultPostureSignals` reports none; Phase 3 replaces the heuristic once the reserved-region API names are verified.
- The fold descriptor over the pages bridge (Phase 3).
- A UI test target. If Phase 2 needs XCUITest for the toolbar, it adds the target then.
- CI for iOS. The parity-guards workflow runs on Linux; adding a macOS job is a separate decision with a cost.
