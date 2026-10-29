# Duo-1 for 1.0: no letterboxing and the unfolded Island — design

**Date:** 2026-10-29
**Status:** Approved directions (owner, 2026-10-29); this document is for review before building.
**Builds on:** [the Duo design](2026-10-21-ios-iphone-duo-design.md) §4.2 and §7, and
[the 1.0 companion release](2026-10-24-ios-v1-companion-release-design.md) §7, which puts only
"no letterboxing" and the regular-width Island in 1.0.
**Supersedes:** bnfy/blanc#393 and bnfy/blanc#397 (September; a system toolbar along the
screen's edge instead of the Island). Both are closed with a link to this work (owner, 2026-10-29).

## 1. What we found on the Duo simulator

Built with Xcode 27.1 (iOS 27.1 SDK), today's `main` already fills both displays: no black
bars, open or closed. The Island is centered and capped at 600 pt. Two things are wrong when
unfolded:

- **The palette** opens as a narrow card pinned to the top-left corner, far from the Island
  that opened it (the system turns a `.sheet` into a form sheet at regular width).
- **The Island** has the room for Back and Forward but doesn't show them, so on a page the
  only way back is the edge swipe.

"No letterboxing" depends only on the SDK the archive is built with. `npm run ios:testflight`
archives with whatever Xcode is selected on the owner's Mac (27.1 today); nothing stops an
older Xcode from producing a letterboxed build.

## 2. Goals

1. **No letterboxing, guaranteed.** The TestFlight/App Store script refuses to archive with an
   iOS SDK older than 27.1.
2. **The palette grows from the Island when unfolded** (owner's pick, option A of three). At
   regular width the Island itself becomes the search field and the palette's list opens upward
   from it, at the Island's width and position, like desktop's ⌘L panel. Same three modes as
   today (tabs at rest, slash commands after `/`, Quick Switcher while typing), same rows, same
   footer actions.
3. **Back and Forward on the unfolded Island** (owner's pick). At regular width the Island
   shows Back and Forward buttons before the site name, each dimmed and inert when there is
   nowhere to go. Everything else on the Island stays as on iPhone.
4. **Folding never loses the palette's text.** Folding or unfolding with the palette open
   keeps it open with the same text: the panel becomes the sheet and back.

## 3. Non-goals (after 1.0: Duo-2, Duo-3)

Split View, Glance, the side list, tab dots, fold avoidance (keeping controls off the crease
when part-folded), tabletop video, multiple windows, and CI on a Duo simulator (hosted images
carry Xcode 26.6). No device checks: the layout follows the size class only, never "is this a
Duo", so an iPad would get it for free if Blanc ever ships there.

**Anti-goals:** anything that changes how Blanc looks or behaves on an ordinary iPhone or the
Duo's outer display; anything that reloads a page when the phone folds or unfolds.

## 4. Behavior

### 4.1 Choosing the layout

`ContentView` reads `horizontalSizeClass`. Compact (every iPhone, the Duo's outer display, the
inner display in system Split View) is today's layout. Regular is the unfolded layout. A small
pure type, `IslandLayout`, turns the size class into the two decisions (show Back/Forward;
palette as sheet or panel) so they can be unit tested.

### 4.2 The unfolded Island

Order: Space mark, Sunrise mark, divider, **Back, Forward**, site name, private chip, reload,
tab count, divider, New tab. Back and Forward are 44 × 48 pt like the other buttons, use the
existing `pill.back`/`pill.forward` strings, and read `TabModel.canGoBack`/`canGoForward`.
The 600 pt cap, the swipe between tabs and the swipe up to the tab grid are unchanged.

### 4.3 The palette panel

- Opens when the Island is tapped (or anything that sets `isPalettePresented`) at regular
  width. The Island is replaced in place by the panel: its bottom edge is the address row, in
  the Island's position and width (600 pt cap, 16 pt side margins), with the list and the
  footer above it. The keyboard comes up as on iPhone; the panel rides above it.
- Height: the list takes what it needs up to the space above the keyboard, leaving a 16 pt gap
  at the top of the page; it scrolls beyond that.
- Order, top to bottom: list, footer (New tab, Reader, Favorites, History, Settings), address
  row. The address row keeps its clear button and its collapse button (chevron down).
- The page behind stays visible and is not dimmed (desktop's panel doesn't dim). A tap outside
  the panel, Escape on a hardware keyboard, or the collapse button closes it, as swiping the
  sheet down does today.
- Everything a row does is unchanged: choosing a tab, closing one, the tab context menu with
  groups and Spaces, slash commands, Shared Spaces rows, the Recently closed band, Sends.
- Closing the panel does what dismissing the sheet does today: it shows a pending Settings
  page, Spaces menu or Space editor, and opens Find in page if `/find` asked for it.

### 4.4 Folding and unfolding with the palette open

The palette's text lives in `TabsManager` (`paletteDraft`) instead of the sheet's own state,
and is cleared when the palette closes. When the size class changes while it is open, the
panel becomes the sheet (or the reverse) with the same text and mode. Pages never reload: the
web view is the same `WKWebView` in both layouts.

### 4.5 The SDK guard

`scripts/ios-testflight.sh` checks the selected Xcode's iOS SDK (`xcrun --sdk iphoneos
--show-sdk-version`) before archiving and stops with a plain message if it is older than 27.1.
The project itself stays at objectVersion 77 and keeps building with Xcode 26.6 on CI.

## 5. Testing

- **Unit (CI, every iPhone):** `IslandLayout` for both size classes; `paletteDraft` survives a
  layout switch and clears when the palette closes; a node test that the TestFlight script
  carries the SDK guard.
- **UI (CI, iPhone 17, compact):** the existing suites, unchanged, prove the iPhone layout is
  untouched.
- **UI (local, iPhone Duo simulator, Xcode 27.1):** a `DuoUITests` class that skips itself at
  compact width: Back/Forward appear and work; tapping the Island opens the panel (no sheet),
  typing filters, choosing a tab closes it; `/find` from the panel opens Find in page.
- **By hand on the Duo simulator:** unfold with three tabs (one playing video, one with a
  half-filled form): nothing reloads; fold with the palette open and text typed: the sheet
  shows the same text; screenshots of the Island and the panel, light and dark, for the owner.
- **The owner's iPhone Air:** the Debug build installs and looks exactly as before.

## 6. Calls made here (for the owner to check)

1. The panel doesn't dim the page, like desktop's ⌘L panel (the centered card, option B, was
   the dimmed one).
2. The panel's footer sits between the list and the address row, so the address row is
   exactly where the Island was.
3. Back and Forward sit after the divider, before the site name, as on desktop's Island.
4. The SDK guard lives in the TestFlight script, not the Xcode project, so CI's Xcode 26 build
   is untouched.
5. The UI tests for the unfolded layout run only on a local Duo simulator until hosted images
   carry Xcode 27.1; CI keeps covering the iPhone layout.
