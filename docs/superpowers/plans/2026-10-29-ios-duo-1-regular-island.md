# Duo-1 for 1.0 — plan

Design: [2026-10-29-ios-duo-1-regular-island-design.md](../specs/2026-10-29-ios-duo-1-regular-island-design.md).
Executed inline, test first. Everything in `ios/Blanc` except task 5.

1. **`IslandLayout`** (`ios/Blanc/Blanc/IslandLayout.swift`): a pure type built from a
   `UserInterfaceSizeClass?`; `showsHistoryButtons` and `palette` (`.sheet`/`.panel`). Compact
   and nil are the iPhone layout. Tests: `IslandLayoutTests`.
2. **`paletteDraft`** on `TabsManager`, cleared whenever `isPalettePresented` turns false.
   Tests in `TabsManagerTests`: survives while open, clears on close (including closes from
   `showSettings`, `requestFind`, incoming links).
3. **`PaletteSheet` takes a placement.** Its text binds to `manager.paletteDraft`; every
   `dismiss()` becomes `close()`, which clears `isPalettePresented` (the sheet's binding then
   dismisses it, the panel's overlay disappears). In `.panel` the order is list, footer, address
   row, at the Island's width, raised background, 22 pt corners, the Island's shadow.
4. **`ContentView`**: read `horizontalSizeClass`; Back/Forward on the Island at regular width
   (`pill.back`/`pill.forward` identifiers); the sheet's binding is true only for `.sheet`; at
   `.panel` an overlay shows the panel over a clear tap-to-close backdrop, with an Escape button,
   and hides (not removes) the Island so the page's inset never changes; the sheet's
   `onDismiss` work moves into one `paletteClosed()` that the panel also runs.
5. **SDK guard** in `scripts/ios-testflight.sh` (iOS SDK ≥ 27.1) and a node test in
   `test/unit/ios-testflight-sdk.test.js`.
6. **`DuoUITests`** (skips at compact width): Back/Forward, panel opens instead of a sheet,
   typing filters and choosing a tab closes it, `/find` opens Find in page.
7. Verify: unit + UI suites on iPhone 17 (iOS 26.5, Xcode 26 if installed, else 27.1) and on
   the Duo simulator; Xcode 26 build check; hand check of fold continuity; screenshots; install
   Debug on the iPhone Air; PR; close #393 and #397 with a link.
