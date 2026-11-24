# Android Island redesign: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blanc for Android's Island and palette match the iPhone's as merged in bnfy/blanc#1682.

**Spec:** `docs/superpowers/specs/2026-11-21-iphone-island-redesign-design.md`. That spec describes the Island without dots, and its "Decided by the owner" section is binding. The owner's standing rule (2026-11-04) is that Android follows the iPhone value for value and diverges only where Android or Chromium forces it, each divergence recorded in D11.

**Architecture:** the Android Island is a native view, `IslandView` plus `blanc_island.xml`, driven by `IslandCoordinator`. The palette is a full-screen `Dialog` with a floating sheet (`PaletteSheet`, `SheetPlacement`). Both live in `chromium/blanc/android/`. Strings are generated from `copy/messages` by `chromium/tools/android-strings.mjs`.

**Tech stack:** Java (Chromium Android, Error Prone), Robolectric JUnit tests in `chromium/blanc/android/junit/`, emulator checks in `chromium/tests/android/*.mjs`, built on the Android server through `chromium/tools/build.mjs --lane=android`.

## Global constraints

- **Values** (from the iPhone):
  - Island 44 dp tall with 17 dp corners (a rounded rectangle at every height, never `height / 2`).
  - Width fits the contents, at most the available width (after the 16 dp padding), 600 dp cap.
  - Button targets 44 × 44 dp; page menu button 36 × 44 dp.
  - Panel corners 22 dp; headings 22 dp in, with 8 dp above and 6 dp below.
  - 12 dp list margin where the list meets the sheet's edge.
  - Close-drag 60 dp, or a flick projected to 160 dp.
- **Strings:** add keys to `chromium/tools/android-strings.mjs`'s list only, then regenerate. Never hand-edit `blanc_strings.xml`.
- **Motion:** use `LayoutTransition` / `ValueAnimator`. When `ValueAnimator.areAnimatorsEnabled()` is false (animations off), nothing moves.
- **Scope:** touch no desktop or shared patch, and nothing outside `chromium/blanc/android/`, `chromium/tools/android-strings.mjs`, `chromium/tests/android/` and D11.

## Task 1: the resting Island

**Files:**
- `island/res/layout/blanc_island.xml`
- `island/res/values/blanc_island_dimens.xml`
- `java/.../island/IslandView.java`
- `java/.../island/IslandCoordinator.java`
- `junit/.../island/IslandViewTest.java`

**What changes:**
- **Layout, in order:**
  1. Back (`blanc_island_back`).
  2. Forward (`blanc_island_forward`, `GONE` unless `canGoForward`).
  3. The page menu (`blanc_island_menu`, 36 × 44).
  4. The domain: `wrap_content`, no weight, middle ellipsis, `maxWidth` set in `onMeasure`.
  5. One 44 × 44 slot holding New Tab (`blanc_island_new_tab`) or Stop (`blanc_island_stop`), never both.
- **Removed:** both dividers and the Private chip, with `privateChip()` and its wiring and the chip stroke dimen.
- **`IslandView.State` gains:**
  - `@Nullable Bitmap favicon`.
  - `boolean blancPage` (any `blanc:` or `chrome://blanc` page shows the Sunrise).
  - The Sunrise stays gold (no tint). The globe (`blanc_palette_globe`) is tinted with the Island's ink.
  - Favicons are drawn at 16 dp with 4 dp corners (`RoundedBitmapDrawable`).
- **Measuring:** the pill is `wrap_content`, centered. `onMeasure` caps the domain's width so the pill never exceeds `min(available, 600 dp)`.
  - The pill gets a `LayoutTransition` with `CHANGING` enabled, so width changes and Forward coming or going animate (off when animators are off).
- **Private tabs:** the menu button's `stateDescription` (API 30+, else appended to its content description) is `tab.privateLabel` ("Private tab").
- **`IslandCoordinator.refresh()`** fills `favicon` from `TabFavicon.getBitmap(tab)` and `blancPage` from the URL. The coordinator's `TabObserver` adds `onFaviconUpdated` → `refresh()`. `setButtonsEnabled` drops the chip. The Back button keeps its 0.35 alpha and disabled state when it can't go back.

- [ ] **`IslandViewTest`:**
  - Forward is `GONE` without history and `VISIBLE` with it.
  - Loading shows Stop and hides New Tab, and back again.
  - There is no private chip view.
  - A private state gives the menu button the "Private tab" state description.
  - The pill's corner radius is 17 dp at a 44 dp and a 60 dp height.
  - The pill's measured width at a 400 dp parent with a short title is below 75% of it, and with a 200-character title it equals the available width.
- [ ] Implement it. Then commit: `Android Island: one Island sized to fit, as on the iPhone`.

## Task 2: the page menu

**Files:**
- `java/.../island/IslandMenu.java`
- `java/.../island/IslandMenuPopup.java`
- `chromium/tools/android-strings.mjs`, plus the generated `blanc_strings.xml` in every language
- `junit/.../island/IslandMenuTest.java`

- **New items:**
  - `Kind.CLOSE_PRIVATE_TAB` is first on a private tab (string `ios.island.closePrivateTab`); it calls the existing `onClosePrivateTab`.
  - `Kind.NEW_TAB` sits before `NEW_PRIVATE_TAB` while the page loads (string `tab.new`), because Stop holds New Tab's slot.
- **Strings:** add `ios.island.closePrivateTab` and `tab.privateLabel` to the generator's list and regenerate.

- [ ] **`IslandMenuTest`:**
  - A private context starts with `CLOSE_PRIVATE_TAB`, and a regular one has none.
  - A loading context has `NEW_TAB` just before `NEW_PRIVATE_TAB`, and an idle one has none.
- [ ] Implement it. Then commit: `Android Island: Close Private Tab first, New Tab in the menu while loading`.

## Task 3: the palette sheet

**Files:**
- `java/.../palette/PaletteSheet.java`
- `java/.../palette/SheetPlacement.java`
- new `java/.../palette/PanelDrag.java`
- `junit/.../palette/SheetPlacementTest.java`, new `PanelDragTest.java`

**What changes:**
- **Position:** `PaletteSheet.show` takes the Island's position. With the Island at the top, the sheet floats at the top (below the status bar and cutout, 8 dp in) and its contents are ordered actions, address, divider, list. At the bottom (the default), the order is list, divider, address, actions.
  - `SheetPlacement.of` gains `atTop` and a `top` inset. With `atTop`, `bottom` is unused and the keyboard doesn't move the sheet.
- **Fits its rows:** the scroll view is `wrap_content` with a maximum of 520 dp or the room left, whichever is smaller. It no longer has `weight = 1`.
- **Action row** (replaces the footer):
  - Left: Back (`blanc_island_chevron_left`, 0.35 alpha and disabled without history; goes back, then dismisses) and New Tab (`blanc_island_plus`; new tab, then dismisses), both 44 × 44 icons. The filled "New tab" capsule goes.
  - Right: the Space mark, Favorites, History and Settings, as today.
- **Copy Link:**
  - `currentAddress()` and its row are removed.
  - The address row shows a 44 × 44 copy button (`blanc_palette_copy`) while the field is empty and the page is http or https. A tap copies (the existing copy path) and dismisses. A long press opens a `PopupMenu` with Copy Link and Edit Address; Edit Address puts the address in the field and selects it.
  - TalkBack gets Edit Address as a custom action.
- **Headings** (`heading()`, `renderClosed()`'s head, `renderDevices()`'s heading): 22 dp start and end, 8 dp top, 6 dp bottom. The list gets 12 dp of padding on the side that meets the sheet's edge.
- **Collapse caret:** points down at the bottom and up at the top.
- **Drag to close:** dragging the address or action row toward the Island 60 dp or more, or a flick projected to 160 dp or more, closes the sheet. The rule lives in `PanelDrag.closes(translationDp, predictedDp, atTop)`, a pure function.
- **Grow:** when it opens, the sheet scales from the Island's on-screen rectangle (the pivot at the Island's center; scaleX and scaleY from the Island's size over the sheet's, alpha 0.6 → 1) to its own, over 250 ms with `DecelerateInterpolator`. Without animators it just appears. The Island's rect comes from `IslandCoordinator` (`pill()` on screen).

- [ ] **Tests:**
  - **`PanelDragTest`:** the iPhone's five `PalettePanelDragTests` cases.
  - **`SheetPlacementTest`:** a top case (8 dp below the top inset, keyboard ignored), and the existing bottom cases unchanged.
- [ ] Implement it. Then commit: `Android palette: search on the Island's side, hugging its rows, Copy Link in the search row`.

## Task 4: build, check, record

- [ ] **Merge `main`** after #1682 has landed, regenerate the strings, and run the fork unit suite:
  ```
  node --test chromium/tools/*.test.mjs chromium/tests/*.test.mjs chromium/release/*.test.mjs
  ```
- [ ] **On the server:**
  - Export the branch to `~/blanc-island-apply` and apply it with `apply.py --previous-map` (from the last applied map), copying ZXing and the blocker bundle back.
  - Build `out/AndroidDebugX64` through `build.mjs --lane=android --build`.
  - Run the Robolectric tests for `island` and `palette`.
- [ ] **On emulator-5554:**
  - Run `island-menu.mjs` and `palette.mjs`, updating them for the removed chip and the moved address row.
  - Take screenshots: a light page, a private tab, the Start Page, the open sheet (Island at the bottom and at the top), and a long site.
- [ ] **D11:** extend the Android bullet with this change and any divergence: the sheet stays a dialog that grows from the Island, rather than SwiftUI's matched-geometry panel.
- [ ] **Pixel 10 Pro:** build `out/AndroidDebug` (arm64), copy it compressed, and run `adb install --incremental`.
- [ ] **PR into `main`:** code review first, with screenshots and the test record in the description.
