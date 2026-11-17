# Blanc for iPhone: the fork's Start Page — Implementation Plan

**Goal:** Blanc for iPhone shows the desktop Chromium fork's Start Page, the page Android shows since A5b
(#1506): Billboard as the one layout, Customize with the Widgets switches (Favorites, On your other
devices), the Shortcuts stepper (1–12), ranked and pinned shortcuts, the clock and the wallpaper. Every
choice a person made on the current iPhone Start Page carries over, and every choice survives a relaunch.
Nothing about the Start Page syncs.

**Owner decisions:**

- November 13, 2026: the fork's Start Page is how Android works and how the iPhone will work. Billboard is
  the one layout; the iPhone's Ledger, Shelf and Tally go. Start Page choices stay on the device (the iPhone
  never synced them).
- November 15, 2026 (this plan's questions):
  - **The iPhone keeps its Liquid Glass clock.** The fork's `newtab.js` already hands a Glass clock to
    `globalThis.blancNativeClock.render` (line 1316), which the iPhone answers with `NativeClockOverlay`.
    Font & color keeps its Glass or Solid choice on the iPhone; only Android is solid-only (#1504).
  - **Choices live in Customize, as on Android.** The native Start Page screens in Settings (layout,
    wallpaper, clock: `StartAppearanceSettings.swift` and their phone previews) go. Settings → Start Page,
    the Island menu's Customize Start Page and the Start Page hold open the page with Customize open.

## What the iPhone has today

- `BlancSchemeHandler` serves shipping's `src/renderer/pages` (a folder reference, bundled as `pages/`)
  flat at `blanc://<host>/`. The Start Page is shipping's `newtab.html` with the iPhone's phone layer
  (`ios-start-page.css`, `ios-start-page.js`, `ios-start-rules.js`), added by `PagesBridge`'s user script.
- `PagesBridge` answers `window.bowserPages` (`start.data`, `start.setClock`, `setWallpaper*`,
  `chooseWallpaper`, …) from `StartAppearanceStore` (`start-appearance.json` and `start-wallpaper.jpg` in
  Application Support), `SettingsStore.newtabLayout`, Sync's favorites, devices and Sent.
- `StartPageHold` opens Settings at the Start Page after a half-second hold on empty space;
  `TabsManager.makeStartPreview` builds the Settings screens' live previews.

## Architecture

- **Files.** The iPhone bundles the fork's Start Page from the same copy Android serves:
  `chromium/blanc/android/pages/start/` (written byte for byte by `chromium/tools/android-pages.mjs` from
  `chromium/blanc/island/pages/`, `pages.json`'s `start` list), as a second folder reference, `start/`.
  `whats-new.js` comes from `chromium/blanc/android/pages/` beside it. One copy for both phones means a fork
  page edit reaches the iPhone with the same `android-pages.mjs` run; a unit test fails if the Xcode
  reference and that folder part ways.
- **Serving.** `blanc://newtab/` stays the Start Page's address (sessions, `TabsManager.newTabURL`,
  `privateNewTabURL`, the Island and the walkthrough key on it). For host `newtab` the resolver serves only
  from `start/`, plus three files of the iPhone's: `ui-language.js` (written per request,
  `window.__blancUiLanguage` set to the language the iPhone's other pages use,
  `BlancPageResolver.resolvedLocale`), and `ios-start.js` and `ios-start.css` (the phone layer, in
  `ios/Blanc/Blanc/StartPage/`, bundled beside the app's other resources). `newtab.html` gets the phone
  layer inserted at the top of `<head>`, as Android's WebUI does. `../whats-new.js` and `../ui-language.js`
  resolve to `blanc://newtab/…`, since a URL can't climb above its host. `ios-wallpaper.jpg` goes: the photo
  moves into the page's storage (below).
- **Storage.** WebKit treats `blanc://` as a secure context: localStorage, IndexedDB, Web Locks and
  `crypto.randomUUID` all work there (checked on November 15 with a `WKURLSchemeHandler` probe). So the fork's
  `newtab-adapter.js` runs unchanged, keeping the wallpaper choices and the photo in the page's storage in
  the default website data store, as on Android and desktop. A private tab's Start Page
  (`?private=1`) shows no photo, which is the fork's rule (`isPrivatePage`); its separate, non-persistent
  store sees no wallpaper choices either, so the private page draws with the default wallpaper. That is
  a regression from today's iPhone, where a private Start Page draws the saved wallpaper: the phone layer
  copies the regular page's wallpaper choices (not the photo) into a private page before the adapter
  reads them, from a snapshot native code keeps.
- **Native protocol.** The adapter asks native code over `chrome.send('blancNewTab', [id, method, args])`
  and expects `window.blancNewTabReply(id, ok, value)` and `window.blancNewTabEvent(kind)`. A new
  `StartPageBridge` (a `WKScriptMessageHandler`, main frame, `blanc://newtab` only, rechecked in the
  destination document as `PagesBridge.guardedScript` does) defines `chrome.send` at document start and
  answers, following `blanc_pages_ui.cc`'s `OnStartCall`:
  - `clockRead`/`clockWrite`: `StartAppearanceStore`'s clock keys, with today's field rules, over the
    iPhone's first-run clock (Roboto Flex, 300, Glass, 450; still never saved). The style is kept and
    written (Glass on the iPhone).
  - `widgets*`: a `widgets` record in `start-page.json` (`StartPageStore`) with the fork's validation
    (Android's `StartWidgets`). A phone that never chose starts with none, as Android and a new desktop profile do.
  - `layoutRead`/`layoutWrite`/`layoutInitialize`: always `billboard`.
  - `topSites([offset, limit])`: the iPhone's `HistoryStore`, ranked as Android ranks it: the last 90 days,
    every visit, one site per host with `www.` folded, http(s) only, shown as its page visited last under that
    page's title, with no search engine results pages (the engines in `BlancSearchEngine` and a custom
    template's host and path). No icons (the iPhone has no favicon database; the page draws its letter tile).
    A private Start Page gets none.
  - `pinsList`/`pinsPin`/`pinsUnpin`: a port of the fork's `start_page_pins.inc` (up to eight, http(s)
    only, titles trimmed to 200) in the same device-local `start-page.json`.
  - `bookmarks`: Sync's favorites, in the shape `PagesBridge.favoritesPayload` gives today.
  - `remoteDevices`, `sentItems`, `openSent`, `dismissSent`: today's Sync answers (none on a private page).
  - `openMahjong` (a new tab, private from a private page; the button is hidden, but the call is
    answered as Android answers it), `openSheet('bookmarks')` (this tab),
    `openIsland` (the palette), `openSettings` (native Settings).
  - Empty, as on Android: `groupsRead`, `blockedWeek` (iOS content blockers can't count blocks, so the line
    under the clock stays hidden, as today), `installedTheme`, `islandBackdrop`, `firstRun`, Patron, the
    checklist, What's New, `launchSunrise`. Refused: imports, default browser and onboarding (the iPhone's
    walkthrough and Settings are native).
  - Events: favorites, devices, Sent and history changes reach every open Start Page
    (`blancNewTabEvent('bookmarks' | 'remoteTabs' | 'sentItems' | 'topSitesInvalidated' | 'pins')`,
    kinds the adapter's `refreshers` know), as do clock and widget changes from another Start Page
    (`'clock'`, `'widgets'`).
- **Glass.** `ios-start.js` defines `globalThis.blancNativeClock.render`, posting to the existing native
  clock handler (moved from `PagesBridge`'s `start.renderNativeClock` to `StartPageBridge`), so
  `NativeClockOverlay` keeps drawing the clock in Liquid Glass. Where it can't (before iOS 26, Reduce
  Transparency), the page draws its own Glass, as on desktop.
- **Carrying choices over.** On the first Start Page after the update, native code hands the phone layer
  a one-time migration: today's wallpaper source, color, fill, style, wash and time-of-day switch become
  the adapter's `blanc.prototype.start.preferences.v1` record, and a saved photo is fetched once from
  `start-wallpaper.jpg` (a one-time route) and written into the adapter's own IndexedDB store
  (`blanc.prototype.wallpaper.v1`, a random UUID key, `wallpaper.imageKey` in the record), all before the
  adapter's first read. A stamp in
  `start-appearance.json` (`migratedToForkPage`) keeps it from running twice; the old photo file is deleted
  only after the page reports the copy stored. The clock needs no move (same keys, same store). A saved
  Ledger, Shelf or Tally layout becomes Billboard; `SettingsStore.newtabLayout` stays readable for older
  builds but is no longer written.
- **Phone layer** (`ios-start.css`, `ios-start.js`): a port of Android's `android-start.{css,js}` with the
  iPhone's differences. Viewport and `data-platform="ios"`; the Island's side from
  `SettingsStore.islandPosition`, sent with the document so the first paint is laid out for it; the clock
  at the middle of the screen with the safe-area insets (Android measures `screen.availTop`; the iPhone's
  page runs under the status bar), moving up and shrinking only when shortcuts need the room; shortcuts four
  to a row; widgets in one column; Customize and Font & color as sheets above the Island, the clock moving
  to the top as its own preview while it's edited. Unlike Android, the Glass or Solid row stays. As on
  Android, **Play Blanc Mahjong is hidden**: the game isn't laid out for phones yet (owner, November 15,
  2026), so Customize stands alone in the footer. A long press on a shortcut or a favorite opens Android's sheet (Pin to Start Page or
  Unpin, Hide for a ranked site, Open Link in New Tab, Cancel) instead of the pin and × buttons; iOS's link
  preview is turned off on those tiles only (`-webkit-touch-callout: none`), and the long press is the
  page's own touch timer, since WebKit fires no `contextmenu` on a touch.
- **Ways in.** Settings → Start Page, the Island menu's Customize Start Page and the half-second hold on
  empty space open `blanc://newtab/#customize` on the Start Page in view, or on a new one (the adapter's
  page reads the hash, as on Android). Customize also shows its button in the footer, as on Android and
  desktop (the iPhone hid it in favor of the hold, which stays).
- **iPad.** The same page and layer. Customize's sheet and the column of widgets are sized for a phone and
  capped at 480 px, so they center on an iPad; checked on the iPad simulator.

## What goes

`StartAppearanceSettings.swift` (the native wallpaper and clock screens and their previews),
`TabsManager.makeStartPreview` and the preview bookkeeping in `PagesBridge`, the `start.*` members of
`PagesBridge` the old page used, the `ios-wallpaper.jpg` route, `WallpaperPicker.swift` (the adapter picks a
photo with WebKit's own file input, which offers the photo library), and shipping's iPhone-only files
`src/renderer/pages/ios-start-page.css`, `ios-start-page.js`, `ios-start-rules.js` with
`scripts/ios-start-page-rules.mjs`. `scripts/ios-start-page-settings.mjs` and the generated
`StartPageDefaults.swift` stay: `SettingsStore` still reads (and preserves) a saved `newtabLayout`. Shipping's
desktop Start Page and its layouts are untouched.

## Tasks

1. **Serving:** the `start/` folder reference, the resolver's `newtab` branch, `ui-language.js`, the
   `<head>` insertion; resolver unit tests (every file `newtab.html` names resolves; nothing outside
   `start/` but the three iPhone files; traversal still collapses).
2. **Protocol:** `StartPageBridge` with the clock, widgets, layout, favorites, Sync and empty answers;
   unit tests for each method's validation, after Android's `android-start.test.mjs` cases.
3. **Shortcuts:** `topSites` ranking over `HistoryStore` and the pins store; unit tests (www folding,
   search results excluded, 90 days, offset and limit bounds, eight pins, http(s) only).
4. **Phone layer:** `ios-start.css` and `ios-start.js`, checked in the iPhone simulator: first-run clock in
   Glass and centered, shortcuts, widgets, the long-press sheet, Customize and Font & color sheets, the
   Island at the top and at the bottom, light and dark.
5. **Carry-over:** the one-time migration of wallpaper choices and photo, and the private page's snapshot;
   unit tests for the record it writes and the stamp, and a simulator run from a 1.0.x-shaped
   `start-appearance.json` with a photo.
6. **Ways in and removals:** Settings → Start Page, the Island menu and the hold open `#customize`; remove
   the native screens, previews, picker and shipping's iPhone-only Start Page files; update
   `MobileStartPageTests`, `StartAppearanceTests`, `NativeSettingsTests` and `StartPageCustomizeUITests`.
7. **Records:** `spec/` F-row and divergence for the iPhone's Start Page (Billboard only, Customize, Glass
   kept, Mahjong hidden, no blocked count), `docs/ios/native-settings.md` (Start Page row), CLAUDE.md and
   AGENTS.md lines that describe the iPhone's Start Page.

**Not in this plan:** tab groups on the Start Page (the iPhone has groups, but neither phone shows them
there yet), a shortcut's touch icon, Start Page sync, an App Store release (this lands on `main` for a
later 1.0.x or 1.1 build, and its screenshots are retaken then).

**Checks before the PR:** `xcodebuild test` for BlancTests and the Start Page UI test on the iPhone
simulator, `node --test` for the touched `test/unit` files, `node chromium/tools/android-pages.mjs --check`,
screenshots of the first-run page, Customize, Font & color, the long-press sheet and the iPad page.

## Found while building (November 15, 2026)

- The native Glass clock is placed where the page's clock was when `drawClockArt` ran; the phone layer
  moves the clock afterwards (figure centering) and the page scrolls, so `ios-start.js` asks the page to
  redraw (`scheduleClockArt`) when the clock moves, on scroll, and when Customize or Font & color opens or
  closes (Customize covers the clock, and the page asks for no glass while it's open).
- `.native-clock-glass { opacity: 0 }` hides the page's own figures under the native glass, as the old
  phone stylesheet did.
- The long-press menu is a manual popover: an auto popover was closed at once by the lift of the finger
  that opened it (WebKit fires no `contextmenu` for a touch, so nothing cancels that touch), and the next
  tap opened the shortcut instead. The lift after a long press is cancelled, and a tap outside the menu
  closes it and does nothing else.
- The owner's reference for the default clock (November 15): cream Liquid Glass, Roboto Flex at full
  height, centered, over Sunrise in Light. A fresh install in Light matches it. One difference remains
  in that comparison: the Sunrise photo's sun sits behind the Island on the fork's page, above it on the
  1.0 page.
- Code review (high, before the PR): Settings → Start Page, the Island menu and the hold open Customize on a
  regular Start Page, never a private one, whose storage is forgotten; the regular page's wallpaper record is
  kept in `start-page.json` so a private page draws it even before a regular page loads that launch; every
  regular page is handed the carry-over until one reports it done (a Web Lock keeps two from storing the photo
  twice); History changes reach open Start Pages once a burst settles (1 s); the search engines' results pages
  are computed once. Not done: one phone layer shared with Android (`android-start.{js,css}` and
  `ios-start.{js,css}` are kept alike by hand).
