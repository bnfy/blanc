# iPhone Island redesign: one Island sized to fit, opening in place

Status: design approved by the owner on 2026-11-21. Not built yet. The Android mirror follows separately.

## Context

The owner isn't happy with how the iPhone Island looks (asked 2026-11-21). Today it is a full-width 52 pt Liquid Glass capsule: gold Sunrise mark │ domain ··· Back Forward │ New Tab, plus Stop while loading and a "Private" chip on private tabs (`ContentView.swift` `addressPill`, ~:828–1134). Tapping the domain opens `PaletteSheet` as a separate bottom sheet with search at its top.

The owner flagged all four problems offered:
- **Looks generic:** it reads as any browser's search field.
- **Too heavy:** 52 pt tall and nearly full width.
- **Row feels busy:** two dividers, five items, and a gold mark beside gray icons.
- **Typing sheet:** tapping opens a plain sheet instead of the Island opening up.

The owner wants it to feel like **desktop Blanc's Island**: sized to its contents, with tab dots, opening in place. They picked **Direction A (one Island)** and **tab dots for the current group** (2026-11-21). After seeing the built Island the same day, the owner dropped the dots: they aren't useful on a phone, where the sideways swipe moves the page itself. This document describes the Island without them; the plan beside it still records the dots as first built.

Blanc for Android copies the iPhone Island value for value (`chromium/patches/android/0104-android-island.patch`, `chromium/blanc/android/island/res/`), so Android follows this design afterwards.

## Approaches considered

- **A: one Island sized to fit (chosen).** Back, favicon and site, and New Tab sit in one object (tab dots were in it too, until the owner dropped them). It is closest to the Mac Island and behaves the same on iOS 18–26 and Android. Trade-off: a long domain makes it wide again.
- **B: Island plus two round buttons.** Dots and site in the middle; Back and New Tab as separate round glass buttons that merge into the panel when it opens. Calmest middle and the biggest thumb targets, but more separate pieces on screen. Its showpiece, the glass merge, exists only on iOS 26: iOS 18–25 and Android would just fade. Not chosen.
- **Domain only (dropped before presenting).** It would hide Back, which the owner put on the Island on Nov 11, and break the "minimal doesn't mean hidden" rule.

## Goals, non-goals, anti-goals

**Goals:** it reads as Blanc's Island, not a search field; it is lighter (shorter, and only as wide as its contents); the row is calm, with no dividers and one ink; typing grows the Island upward in place.

**Non-goals (unchanged):**
- Gestures: sideways swipe, swipe up to the grid, and tuck on scroll (it still slides fully away).
- The page menu's contents, apart from the two moves below.
- The palette's list contents: tabs, groups, devices, slash commands.
- The tab grid, desktop, and the Android build (a follow-up).

**Anti-goals:**
- Hiding Back.
- New vocabulary on the Island: no tab dots, group names, tab counts or Space marks (the owner removed the tab count in #1372 and the Space mark in #1450).
- Tap targets under 44 pt.
- A fixed-width, static bar: the Island must spring as its contents change.
- Thick focus rings or left-edge accents.

## Design

### Resting Island

`[‹] [favicon] nytimes.com [+]`, centered.

- **Shape:**
  - 44 pt tall.
  - Corner radius 17 pt, the Mac Island's resting shape (`--island-resting-height: 44px`, `--island-resting-radius: 17px` in `src/renderer/styles.css`) instead of a full capsule.
  - Same distance from the home indicator as today (10 pt).
- **Width hugs the contents:** from 4 pt end padding to at most the screen width minus 32 pt (600 pt cap). The width springs when the domain changes or Forward comes or goes. The domain truncates in the middle at the cap.
- **No dividers.** All glyphs use the Island's ink, semibold 15 pt as today.
- **Back:** always present, 44×44, dimmed when there is nowhere to go, so the left edge never jumps.
- **Forward:** present only while there is somewhere to go. It slides in after Back with a spring.
- **Favicon:** 16 pt with 4 pt corners and a 36×44 hit area. Tapping it opens the page menu, as the Sunrise mark does today; Safari keeps its page menu in the same spot. On the Start Page the slot shows the gold Sunrise, and with no favicon a neutral globe.
- **Domain:** today's text, from #1472: Instrument Sans 15 SemiBold, `www.` removed, Blanc page names. The Start Page shows "Search or type a URL" dimmed.
- **New Tab:** 44×44.
- **Material:**
  - iOS 26: `.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 17))`.
  - iOS 18–25: today's solid fill, hairline and shadow, on the new shape.
  - Light/dark still follows the page's `underPageBackgroundColor`.
- **Loading:** the 2 pt progress line stays, clipped to the new shape. **Stop takes New Tab's slot** while the page loads, crossfading, so the width never changes. New Tab returns when the load ends. Meanwhile it stays available in the panel and the menu (owner, 2026-11-21).

### Opening in place (replaces the iPhone sheet)

- **Tapping the site grows the Island into the panel and carries it up above the keyboard in one motion,** with the search field focused (owner, 2026-11-21). The keyboard comes up at once, as today and as on the Mac's ⌘L.
  - The grow runs alongside the keyboard's own animation, using its frame notifications. The panel's bottom edge travels from the Island's spot to just above the keyboard.
  - It widens to the screen width minus 32 pt (600 pt cap), with the same corner shape scaled to 22 pt, as the iPad panel today.
- **The panel's light/dark matches the Island's,** so it never flips color as it grows: it follows the page, and private tabs are always dark. **Its face is solid** (`style.raised`), not glass, so the list stays readable over busy pages. On iOS 26 the glass Island grows while its glass gives way to that solid face.
- **iPhone in landscape (compact height) keeps today's sheet:** with the keyboard up there's no room for a list.
- **The search field sits where the Island was,** at the panel's bottom edge (its top edge when the Island is at the top). The tab list is on the far side. The action row runs along the Island's edge:
  - Back and New Tab on the left.
  - Spaces, Reader (when available), Favorites, History and Settings on the right.
- **Motion:**
  - On iOS 26 one glass shape grows, using `glassEffectID`/matched geometry and a spring.
  - On iOS 18–25 the solid shape grows the same way.
  - With Reduce Motion it crossfades.
- **Closing:** a tap outside, a drag toward the Island's edge, Escape, or choosing a result.
- **Build on the existing iPad panel:** `palettePanel` in `ContentView.swift` (~:386) and `PaletteSheet(placement: .panel)`, which already "grows from the Island in its place". iPhone and iPad then share one panel, with the search row on the Island's side on both, so the iPad matches the iPhone (owner rule, 2026-11-12).

### Other states

- **Top position:** mirrored. The panel grows downward with search on top.
- **Tuck on scroll:** as today, but measured from the new height.
- **Start Page:** Sunrise, the dimmed placeholder and New Tab. Lower `--ios-island` in `StartPage/ios-start.css` to match the new height.
- **Websites' insets:** the fixed inset and `obscuredContentInsets` (`WebView.swift`) follow the new height.
- **Settings → Island:** unchanged. With Back and Forward turned off, Reload takes Back's place, as today.
- **VoiceOver:**
  - The favicon is "Page menu".
  - The domain keeps "Search or switch tabs, {domain}".
  - New strings go in every language (`test/unit/ios-native-strings.test.js`).

### Decided by the owner (2026-11-21)

- Direction A, one Island sized to fit.
- Tab dots for the current group, then none (dropped after seeing them built).
- The Island rises with the keyboard, search ready.
- **Private tabs:** the Island is always dark, and the "Private" chip comes off the row. **Close Private Tab** is the first item in the page menu, so leaving takes two taps instead of one.
- Stop takes New Tab's slot while loading.

### My calls (owner to check)

1. **No dimming behind the open panel,** matching the iPad panel and the Mac's in-place panel. A tap outside closes it.
2. **The panel is solid and follows the Island's light/dark** (see Opening in place).
3. **iPhone landscape keeps the sheet.**
4. **Android follows in its own change** in the Android lane, once the iPhone version has been checked on a device.

### Left to the builder

- Exact spring values.
- The "+N" rule at the cap.
- The favicon fallback glyph.
- Drag-to-close distances.
- Test identifiers.

## How it gets built

Each PR updates D11 in `spec/divergence-register.md` for what it ships. The implementation plan sits beside this file in `docs/superpowers/plans/`. Expected PRs:

- **PR 1: the resting Island.** Shape, width that fits the contents, a favicon menu button replacing the Sunrise mark on web pages, Forward that comes and goes, private and loading states, Start Page and inset heights, strings.
- **PR 2: opening in place on iPhone.** The panel replaces the sheet, with search at the Island's edge, keyboard avoidance and the grow transition. The iPad panel adopts the same layout.
- **Later: the Android lane mirror.**

**Critical files** (`ios/Blanc/Blanc/`):
- `ContentView.swift`: `addressPill`, `palettePanel`.
- `IslandSurface.swift`: the shape.
- `IslandLayout.swift`: the palette is a panel on compact widths too.
- `IslandMarkButton.swift`: becomes the favicon/Sunrise menu button.
- `IslandMenu.swift`: Close Private Tab moves first.
- `PaletteSheet.swift`: the search row on the Island's side.
- `BrowserStyle.swift`, `WebView.swift`, `StartPage/ios-start.css`, `SettingsSheet.swift`.

**Tests:** existing iOS XCTest and UI tests.

## Verification

- **Unit tests:** Forward visibility, and the panel placement in `IslandLayout`.
- **UI tests:**
  - Open from the site.
  - The search field is focused and sits at the panel's Island-side edge, above the keyboard.
  - Landscape opens the sheet.
  - Stop takes New Tab's slot during a load.
  - Close by tapping outside and by dragging.
  - Private Close from the menu.
  - VoiceOver labels.
- **Screenshots in the owner's open iPhone Air iOS 27.2 simulator** (UDID `B0DC1A4A-8BD7-4064-8530-4180E3F6DF92`; ask before booting anything). Light page, dark page, Start Page, private, loading, long domain, top position, and opening. Crop to the Island at full resolution, before stacked over after.
- **iOS 18 simulator:** the solid fallback.
- **iPad / Duo unfolded:** the shared panel.
- **Owner hand-check on the iPhone Air** before Android work starts.
