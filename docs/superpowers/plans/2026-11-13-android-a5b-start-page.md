# Blanc for Android A5b: the fork's Start Page — Implementation Plan

**Goal:** Blanc for Android shows the desktop Chromium fork's Start Page: Billboard as the one layout,
Customize with the Widgets switches (Favorites, On your other devices), the Shortcuts stepper, the clock
and the wallpaper. Every choice survives a relaunch. Nothing about the Start Page syncs.

**Owner decisions (November 13, 2026):**

- The fork's Start Page (Billboard plus optional widgets, no layout picker) is how Android works, and how
  the iPhone will work later. Android serves the fork's own page files, not shipping's v1.47.1 page with
  the iPhone's layouts.
- Widgets, clock and wallpaper are device-only on Android, as on the iPhone. Android never publishes or
  applies a Start Page key through Sync.
- The Android clock stays solid only (#1504): Android never writes a clock style and shows every clock as
  solid.

**Architecture:**

- `chromium/tools/android-pages.mjs` copies the fork's Start Page files, byte for byte, from
  `chromium/blanc/island/pages/` into `chromium/blanc/android/pages/start/` (list in `pages.json`,
  `start`), beside shipping's pinned files for the other pages. `--check` fails on any drift.
- `chrome://blanc/newtab.html` stays the Start Page's address (sessions, tab rules and the Island all key
  on it). The WebUI serves the fork's `newtab.html` there with `<base href="start/">`, so its own
  scripts, stylesheets, images and all-language string catalog load from `start/`, and adds Android's
  phone files (`android-start.js`, `android-start.css`).
- The fork's own `newtab-adapter.js` runs unchanged. It keeps the wallpaper and your photo in the page's
  storage (localStorage and IndexedDB of `chrome://blanc`, which persist in the profile), and asks native
  code for the rest over `chrome.send('blancNewTab')`. Android's `PagesHandler` answers that protocol:
  - `widgets*` in Local State `blanc.start.widgets`, with the fork's validation (a port of
    `blanc_prototype_ui.cc`'s handler); `clock*` in the profile pref `blanc.start.clock`, with the fork's
    `SanitizeClockUpdate` minus `newtabClockStyle`, read over the iPhone's first-run clock (Roboto Flex,
    height 300, weight 450) and always reported solid; `layout*` is always `billboard`.
  - Favorites, other devices, Sent, the week's blocked count, Mahjong and the Island from what Android
    already has. Desktop-only calls (installed themes, the Island backdrop, Patron, the checklist, What's
    New, imports, pins) answer empty; onboarding and default browser are A5c.
  - Every open Start Page follows a change at once (`blancNewTabEvent`).
- Patch 0113 registers the two prefs.
- Settings → Appearance gets a Start page row, and the Island menu's Customize Start Page item comes
  back; both open the Start Page with Customize open (`#customize`), since Customize is where the fork
  keeps these choices.

**Not in A5b:** Top Sites and pinned shortcuts (Billboard shows only what Android has; both answer
empty, as today), Tab groups on the Start Page, the phone preview inside Settings.

## Tasks

1. Pipeline: `pages.json` `start` list, the copy and check in `android-pages.mjs`, tests.
2. Serving: `<base>` and Android's files in `blanc_pages_ui.cc`, `ui-language.js` for the fork's catalog.
3. Native protocol: `blancNewTab` in `PagesHandler`, patch 0113 for the prefs.
4. Phone layout: `android-start.css`/`android-start.js` (widgets stacked under the clock, Customize as a
   phone sheet, no clock style choice, figures centered), checked in a phone-sized headless page first.
5. Ways in: Settings row and Island menu item, `SettingsDestination.START_PAGE`.
6. Checks: unit tests, `check-patches.py --lane android`, `pages-phone.mjs` (fork page, first-run clock,
   choices survive a relaunch), Robolectric.
7. Records: `STATUS.md` A5b section, D-row for the Settings row opening Customize.
