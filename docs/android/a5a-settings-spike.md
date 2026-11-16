# A5a spike: Settings seam and the missing pieces (2026-11-07)

Run on the build server's emulator (Android 16 x86-64, `out/AndroidDebugX64`), Chromium 156.0.8078.79.
The experiment was a throwaway edit to `MainSettings.java`, reverted afterward. Each ruling below
revises `docs/superpowers/plans/2026-11-07-android-a5a-settings.md`.

## 1. The hook

`MainSettings.createPreferences()` and `updatePreferences()` are the right places for Blanc's step
(`updatePreferences()` runs on start, sign-in change, homepage change and more, and calls
`addPreferenceIfAbsent` for rows it wants). Findings:

- **Removing rows is unsafe.** `updateSearchEnginePreference()` (called from the template-URL
  listeners on their own) does `findPreference(PREF_SEARCH_ENGINE).setEnabled(...)` and would crash on
  a missing row; `updateAddressBarPreference()` runs from `onConfigurationChanged`.
- **Ruling R1: hide, don't remove.** Blanc sets `setVisible(false)` on every row it doesn't offer.
  Chromium's `addPreferenceIfAbsent` finds an invisible row present and leaves it alone, and the
  per-row update methods keep working on it. Two rows manage their own visibility and came back when
  hidden: `sign_in` (`SignInPreference`) and `settings_promo_card`. **Blanc removes those two** from the
  screen in the same step; the step runs after every `updatePreferences()`, so Chromium's re-add is
  undone each time.
- **Ruling R2: hidden rows also get `setFragment(null)`.** In a wide window the multi-column layout
  opens its detail pane on the first row that has a destination page, whether or not it is visible.
  Without this, the pane opened on "Google services" (hidden row) with Chrome wording. With it, the
  pane opens on the first kept row with a page (Accessibility today).
- Verified on the emulator: single column, rotate to landscape and back, Home then reopen, and an
  unfolded-size window (1840x2208 at 320 dpi), each with an empty crash buffer. The wide window shows
  Settings beside a detail pane; tapping Accessibility, Site settings and Downloads fills the pane.

## 2. Chromium's kept pages

- **Downloads:** clean. **Site settings** (top page): clean. **Notifications:** opens Android's own
  notification screen (an intent, no page of Chromium's).
- **Accessibility:** three rows carry wording Blanc can't ship: "When enabled, Chrome will adjust web
  content size…" (Match Android font size), "Show zoom option in main menu" (Blanc has no Chrome
  menu), and the Reading Mode rows ("Simplified view for web pages", "Show hyperlinks"; Blanc has no
  Reading Mode in A5a).
- **Ruling R3:** Task 7's wording gate scans every page under More. Hits inside Chromium's pages are
  hidden by a Blanc step on that page's rows where it is a few rows (Accessibility), and the page is
  dropped from More where it isn't. Site settings' sub-pages (permissions, All sites) are scanned in
  full by the gate, not judged by this spike.

## 3. Global blocker state

The switch and the allowed-sites list are **profile preferences** (`blanc.blocking.enabled` and
`blanc.blocking.exceptions`, `blanc/services/blocker/blocking_policy.inc`), read and written through
`BlockingEnabled`, `SetBlockingEnabled`, `BlockingSiteExcepted` and `SetBlockingSiteException` (all take
a `BrowserContext`, no tab).

**Ruling R4:** Task 5 adds four JNI functions in `blanc/android/browser/blocker_bridge.cc`, all taking a
`Profile`: `profileEnabled`, `setProfileEnabled`, `allowedSites` (reads the list pref) and
`allowSite(host, allow)` (calls `SetBlockingSiteException` with `https://<host>/`, which normalizes). No
shared (desktop) code changes, and no tab is needed (Review Focus 5 holds).

## 4. Clear site data

`BrowsingDataBridge.getForProfile(profile).clearBrowsingData(listener, new int[] {BrowsingDataType.SITE_DATA,
BrowsingDataType.CACHE}, TimePeriod.ALL_TIME)`. The Java `BrowsingDataType` enum is generated from
`components/browsing_data/core/browsing_data_utils.h` (`HISTORY, CACHE, SITE_DATA, PASSWORDS, FORM_DATA,
SITE_SETTINGS, DOWNLOADS, HOSTED_APPS_DATA, TABS`); `HISTORY` and `PASSWORDS` are never requested. The
iPhone's `clearSiteData` clears website data, not history or Favorites.

## 5. Search engines

`prepopulated_engines.json` has Brave, DuckDuckGo, Google and Kagi (Bing is a regional entry).
**Ruling R5:** the row stores Blanc's own `searchEngine` and, where `TemplateUrlService` has a matching
engine (by the template's host), also calls `setSearchEngine(keyword)`; where it doesn't, only Blanc's
address input uses the choice. Blanc's `AddressInput` reads Blanc's setting, never `TemplateUrlService`.

## 6. Theme and font

Settings is `Theme.Chromium.Settings`; its surfaces are macros over `?attr/colorSurfaceContainerHigh`
and similar attributes (`semantic_colors_dynamic.xml`). **Ruling R6:** a `ThemeOverlay.Blanc.Settings`
that sets those color attributes to the Sunrise tokens, applied with `getTheme().applyStyle(...)` in
`SettingsActivity.onCreate` before the content is set (a patch hook in Task 3), rather than overriding
Chromium's color resources. Native Blanc views use the system typeface (no Instrument Sans in the
Java UI): **Ruling R7:** Settings uses the system typeface too.
