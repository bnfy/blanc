# Blanc for Android A5a: Settings shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blanc for Android has a Settings screen, reachable from the palette, `/settings`, the Island menu and `blanc://settings`, with Blanc's own sections and rows (Sync, Blocker and allowed sites, Theme, Search engine, Island position, Clear site data, About) and Chromium's Site settings, Accessibility, Notifications and Downloads pages under More, and no Google or Chrome wording or rows.

**Architecture:** Chromium's `MainSettings` stays the root class. One new patch adds a hook at the end of `createPreferences()` and `updatePreferences()` that hands the preference screen to Blanc's code (`org.chromium.blanc.settings`), which removes the rows Blanc doesn't offer, adds its own, reorders, and applies a Blanc theme overlay. Row content and order are decided by a pure model so they can be unit-tested without Chromium.

**Tech Stack:** Chromium 156 (Android lane), Java (`org.chromium.blanc.settings`), AndroidX preferences through Chromium's `ChromeBasePreference` widgets, JNI for the blocker's global state, Robolectric (`blanc_android_junit_tests`), the emulator checks in `chromium/tests/android/`.

**Spec:** `docs/superpowers/specs/2026-11-07-android-settings-design.md` (owner decisions: Chromium's stack, More kept). Also `docs/superpowers/plans/2026-11-03-android-port.md` (A5 row), and for every row's wording, order and rule, Blanc for iPhone's `ios/Blanc/Blanc/SettingsSheet.swift`, `SlashCommand.swift` and `IslandMenu.swift`.

## Global Constraints

- Android follows the iPhone's wording, order and rules for Blanc's rows (owner, 2026-11-04). Strings come from `copy/messages/`, reusing the iPhone's keys (`ios.settings.*`, `settings.general.*`, `footer.settings`); a new Android-only string needs a key in `copy/messages/en.json` and all of `de`, `es`, `fr`, `pt-BR`, `it` in the same PR (`npm run copy:check`), and goes in `ANDROID_KEYS` in `chromium/tools/android-strings.mjs`.
- No "Chrome" or "Google" in any string a person can reach from Settings, and no row that points at a Google service. Chromium's own text that remains (inside Site settings and the like) is allowed only if the emulator gate in Task 7 finds neither word.
- No request to a Google service that desktop doesn't make; the outbound gate (`outbound-gate.mjs`) still passes.
- Never synced: the desktop list in the root `CLAUDE.md`. The synced keys this plan touches are `theme`, `adblockEnabled` and `searchEngine`; a synced value Android can't show survives untouched and is never republished changed (A4 Review Focus 5).
- Editing bundled shipping JavaScript is forbidden; differences go in shims. This plan touches no bundle.
- The desktop lane's output does not change: `check-patches.py --lane desktop` is byte-identical to today's.
- Android builds only on the Linux server (address, secrets and NDA details stay out of the repository). Shared code gets no desktop build from this plan.
- Marketing claims stay release-backed: nothing about Android Settings is announced.
- Scope is A5a only. Start page appearance (layout, wallpaper, clock), Default browser, Language, Measure usage and onboarding are A5b and A5c; their rows are not shown until built.

## Review Focus

1. **Chromium re-adds a hidden row.** `updatePreferences()` runs on every start, sign-in change and search-engine change and calls `addPreferenceIfAbsent` for Tabs, Homepage, Sign in and others. Blanc's step must run at the end of every such call, so a removed row never flickers back. Task 3.
2. **A synced `searchEngine` the phone doesn't offer** (`custom`, or a value a newer desktop added). The row shows DuckDuckGo, writes nothing, and the next sync doesn't republish a changed copy. Task 4.
3. **Wide windows.** On a foldable or tablet, `MultiColumnSettings` shows Settings beside a detail pane; rows that open a dialog (Sync) or a pane (allowed sites) must still work and the selection highlight must not crash on a key Blanc added. Task 3.
4. **Blocker switched off with tabs open.** Open tabs stop being blocked at once and the Island's shield reflects it; switching it on re-checks them. Task 4.
5. **A person opens Settings with no tab alive** (after the last tab is closed or the app is cold-started to a deep link). Nothing in Settings assumes an active `WebContents`; the global blocker switch and allowed-sites list work without one. Tasks 1 and 5.

---

## Stages

One PR, `chromium/android-a5a-settings`, merged at Task 8's gate. Tasks 2 and 4's pure parts need no emulator and run first.

### Task 1: Spike — the seam and the missing pieces

**Files:**
- Create: `docs/android/a5a-settings-spike.md`
- Throwaway: edits in the server's tree, reverted before Task 3

Stop and take it to the owner if Step 1 or 2 shows the hook can't hide a row without a crash that a null check can't fix: the alternative is the bespoke sheet the design set aside.

- [ ] **Step 1: The hook.** On the server, add the three-line hook at the end of `MainSettings.createPreferences()` and `updatePreferences()` that removes `sign_in`, `google_services`, `safety_hub`, `address_bar`, `tabs`, `homepage`, `glic`, `developer`, `about_chrome` and the promo card. Open Settings on the emulator (`am start -n me.bnfy.blanc.dev/org.chromium.chrome.browser.settings.SettingsActivity` works as root via `adb root`), rotate, background and return, change the default search engine, and turn on a wide window (`wm size 1840x2208` for the unfolded-foldable case). Record every crash and every row that comes back. Check `onConfigurationChanged` → `updateAddressBarPreference()`, `onTemplateURLServiceChanged` → `updateSearchEnginePreference()` and the sync observers against missing rows.
- [ ] **Step 2: Chromium's pages as kept.** Open Site settings, Accessibility, Notifications and Downloads; list every row or string that names Google or Chrome or points at a Google service. Record which are hidden by a Blanc step (a `Preference` key) and which need their own patch.
- [ ] **Step 3: Global blocker state.** `BlockerBridge` today takes a `WebContents`. Find how `blanc/browser`'s blocker holds the global switch and the allowed-sites list (`blanc.blocking.enabled`, the exceptions store) and whether a profile-level read/write exists. Record the JNI functions to add (names below in Task 5), or the fallback of using the last active tab's `WebContents`.
- [ ] **Step 4: Clear site data.** Record the Chromium call that removes cookies, local storage, caches and service workers for all time without touching history or Favorites (`BrowsingDataBridge.clearBrowsingData` with the site-data types), and what the iPhone's "Clear site data" clears (`ios/Blanc/Blanc/SettingsSheet.swift`, `manager.clearSiteData()`).
- [ ] **Step 5: Search engines.** Record how Blanc's five engines (DuckDuckGo, Google, Bing, Brave, Kagi; `settings-schema/schema.json`) map to `TemplateURLService`: which keywords exist in the Android lane's prepopulated list, and whether `setSearchEngine(keyword)` can be called for each. Where an engine is missing, the row still stores Blanc's key and only Blanc's address input uses it.
- [ ] **Step 6: Theme overlay.** Record how Settings is themed (`SettingsActivity`'s theme, Material 3 dynamic colors) and the smallest way to apply Sunrise colors: an overlay applied in `SettingsActivity.onCreate`, or overriding color resources in `blanc/android/res`. Record whether native Blanc views ship Instrument Sans.
- [ ] **Step 7: Write the spike note** with a ruling per question and revise Tasks 2–8 if a ruling changes them.

### Task 2: The settings model (pure Java)

**Files:**
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/settings/SettingsDestination.java`, `SettingsLayout.java`, `SearchEngines.java`
- Create: `chromium/blanc/android/junit/src/org/chromium/blanc/settings/SettingsDestinationTest.java`, `SettingsLayoutTest.java`, `SearchEnginesTest.java`
- Modify: `chromium/blanc/android/BUILD.gn` (sources and test sources)

**Interfaces:**
- Produces: `enum SettingsDestination { ROOT, PRIVACY, SYNC, START_PAGE }` with `static SettingsDestination resolve(String url)`; mirrors `SettingsDestination.resolve` in `ios/Blanc/Blanc/SettingsSheet.swift`: only `blanc://settings`, host case-insensitive, fragment `group-sync` or `sync` → SYNC, `group-privacy` or `privacy` → PRIVACY, `start-page`, `startpage` or `group-startpage` → START_PAGE, anything else → ROOT; any other URL → null.
- Produces: `SettingsLayout.sections(State state)` returning an ordered `List<Section>`; `State` carries `debugBuild`. `Section` has a `key` and ordered `Row` keys. Chromium rows are named by their existing keys (`site_settings`-style keys as the tree defines them; Task 1 records them).
- Produces: `SearchEngines.all()` (the five, in the iPhone's order, each `{id, label, template}`), `SearchEngines.shown(String syncedId)` (the engine the row shows: `duckduckgo` for `custom` or an unknown id) and `SearchEngines.template(String id)` (the URL with `%s`).

- [ ] **Step 1: Write the failing tests.** `SettingsDestinationTest`: `blanc://settings#sync` → SYNC; `BLANC://Settings#Group-Privacy` → PRIVACY; `blanc://settings` → ROOT; `blanc://settings#nonsense` → ROOT; `https://settings` and `blanc://history` → null. `SettingsLayoutTest`: the root order is header, Browsing, Appearance, Privacy, Sync, More, About; Browsing holds Search engine; Appearance holds Theme and Island position; Privacy holds Blocker, Allowed sites and Clear site data, whether or not blocking is on (as on the iPhone's Privacy page); More holds Site settings, Accessibility, Notifications, Downloads; About holds Version, Website, Privacy policy, Support, Open-source licenses; Developer appears only when `debugBuild`; no section key equals `sign_in`, `google_services`, `safety_hub`, `homepage`, `tabs`. `SearchEnginesTest`: five engines, DuckDuckGo first; `shown("custom")` and `shown("somethingNew")` → `duckduckgo`; `template("kagi")` contains `%s`.
- [ ] **Step 2: Run them** (`autoninja -C out/AndroidDebugX64 blanc_android_junit_tests && out/AndroidDebugX64/bin/run_blanc_android_junit_tests -f '*settings*'`). Expected: compile failure, no classes.
- [ ] **Step 3: Implement** the three classes. Engine labels and templates are the iPhone's (`SettingsCopy.searchEngines`); read them from `settings-schema/schema.json` through a test-checked constant list, never a second copy in prose.
- [ ] **Step 4: Run them.** Expected: all pass. Then `check-patches.py --lane android`.
- [ ] **Step 5: Commit** "Android A5a: the settings model".

### Task 3: The seam and Blanc's root screen

**Files:**
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/settings/BlancSettingsScreen.java`, `BlancSettingsHost.java`, `chromium/blanc/android/res/xml/blanc_settings_header.xml` and its layout, `res/values/blanc_settings_theme.xml`
- Create: `chromium/patches/android/0110-android-settings.patch`; modify `chromium/lanes/android.json`
- Test: `chromium/blanc/android/junit/src/org/chromium/blanc/settings/BlancSettingsScreenTest.java`

**Interfaces:**
- Consumes: `SettingsLayout` and `SettingsDestination` (Task 2).
- Produces: `BlancSettingsScreen.apply(PreferenceScreen screen, Host host)` and `interface Host { Context context(); boolean syncConnected(); boolean debugBuild(); void openSync(); void openAllowedSites(); }` so tests drive it without Chromium. `apply` removes every key not in the layout, adds Blanc's rows and header, sets `order` per the layout, and is idempotent (calling it twice leaves one of each row).
- The patch: two hook calls in `MainSettings` (end of `createPreferences()` before `cachePreferences()`'s caller returns, and before `notifyPreferencesUpdated()` in `updatePreferences()`), a `chrome_java` dependency on `//blanc/android:settings_java`, and the theme overlay at the place Task 1 chose.

- [ ] **Step 1: Write the failing tests** (`BlancSettingsScreenTest`, against a real `PreferenceScreen` built with `PreferenceManager` and fake `ChromeBasePreference`s for Chromium's kept keys): `rowsFollowTheLayoutOrder`; `rowsBlancDoesNotOfferAreRemoved`; `applyingTwiceLeavesOneOfEachRow` (Review Focus 1); `aChromiumUpdateThatReAddsAHiddenRowIsUndoneByTheNextApply`; `theSyncRowSaysConnectedOrNotConnected`; `theSyncRowOpensTheSyncSheet`; `unknownKeysAreLeftAlone` (a Chromium key Blanc's layout doesn't know is removed, not crashed on).
- [ ] **Step 2: Run them.** Expected: FAIL, no `BlancSettingsScreen`.
- [ ] **Step 3: Implement** `BlancSettingsScreen`: Chromium keys it keeps are reordered and renamed through their own `setTitle`/`setOrder`; new rows are `ChromeBasePreferenceCategory`, `ChromeBasePreference`, `ChromeSwitchPreference` and a `ListPreference`-style dialog for Search engine, Theme and Island position. The header is a non-selectable preference with the Sunrise mark (`assets/sunrise-mark.svg` rendered to a vector drawable by `brand:build`, not a new copy) and the version. Colors come from the generated Sunrise tokens, never literals.
- [ ] **Step 4: Write the patch** on the server's tree, then `python3 chromium/tools/refresh-source-map.py` and `check-patches.py --lane android`; list it in `lanes/android.json`.
- [ ] **Step 5: Wide window.** On the emulator at the unfolded size, the root shows beside a detail pane; tapping Sync opens the sheet and tapping Site settings fills the pane; no crash from the selection highlight (Review Focus 3). Record screenshots (light and dark) for Task 8.
- [ ] **Step 6: Run the tests.** Expected: all pass.
- [ ] **Step 7: Commit** "Android A5a: Blanc's root screen and the seam".

### Task 4: Theme, Search engine and Island position write through

**Files:**
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/settings/SettingsStore.java`
- Modify: `chromium/blanc/android/java/src/org/chromium/blanc/sync/SyncedSettings.java`, `ProfileSync.java`, `chromium/blanc/android/java/src/org/chromium/blanc/island/IslandCoordinator.java` (position change takes effect live), `chromium/patches/android/0104-android-island.patch` (the `setTheme` body moves to `SettingsStore.setTheme`, same behavior)
- Test: `SettingsStoreTest`, `SyncedSettingsTest` (extend), `IslandPositionLiveTest`

**Interfaces:**
- Produces: `SettingsStore.theme()`/`setTheme(String)` (`system|light|dark`, the same Chrome `UI_THEME_SETTING` the `/theme` command already writes), `searchEngine()`/`setSearchEngine(String id)` (stored under `blanc.search_engine`, default `duckduckgo`; calls `TemplateURLService` where Task 1 found a keyword), `islandPosition()`/`setIslandPosition(String)` (`blanc.island_position`, `IslandPosition.fromSetting`).
- Produces: `SyncedSettings.KEYS` gains `searchEngine` with values `duckduckgo|google|bing|brave|kagi`; a synced `custom` or unknown value is neither applied nor republished.

- [ ] **Step 1: Write the failing tests.** `SettingsStoreTest`: `themeWritesTheSameValueTheSlashCommandDoes`; `searchEngineDefaultsToDuckDuckGo`; `aSavedEngineIsReadBackAndShownByTheRow`. `SyncedSettingsTest`: `aSyncedCustomEngineIsNotAppliedAndNotRepublished`; `aKnownEngineFromAnotherDeviceIsApplied`; `aLocalEngineChangeIsPublishedOnce`; `unknownSettingsKeysStillSurvive` (Review Focus 2). `IslandPositionLiveTest`: `changingThePositionMovesTheIslandWithoutARestart`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the store and the sync key; the address input reads `SettingsStore.searchEngine()` through `SearchEngines.template` so a typed search uses the chosen engine (`AddressInput.SEARCH_PREFIX` stays the default).
- [ ] **Step 4: Run them.** Expected: all pass; the A4 `SyncedSettings` tests still pass unchanged.
- [ ] **Step 5: Commit** "Android A5a: theme, search engine and Island position".

### Task 5: Blocker, allowed sites and Clear site data

**Files:**
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/settings/AllowedSitesSettings.java`, `AllowedSites.java`, `SiteDataClearer.java`
- Modify: `chromium/blanc/android/browser/blocker_bridge.cc`, `chromium/blanc/android/java/src/org/chromium/blanc/blocking/BlockerBridge.java`
- Test: `AllowedSitesTest`, `SiteDataClearerTest`, `chromium/tests/android/settings.mjs` (new, started here)

**Interfaces:**
- Produces: `BlockerBridge.globalEnabled()` and `setGlobalEnabled(boolean)`, and `BlockerBridge.allowedSites()` returning `String[]` and `setAllowedSites(String[])` (profile-level, no `WebContents`; if Task 1 found no profile-level state, these use the last active tab's contents and Review Focus 5's test says so).
- Produces: `AllowedSites.normalize(String input) -> @Nullable String` (the iPhone's `SettingsSiteInput.normalize`: scheme http or https or none, a host with no whitespace, lowercased) and `AllowedSites.add(List<String> current, String input) -> Result` with `Result.error` of `invalid` or `duplicate`.
- Produces: `SiteDataClearer.clear(Runnable done)` per Task 1's recorded call.

- [ ] **Step 1: Write the failing tests.** `AllowedSitesTest`: `normalizesAnAddressToItsHost`; `refusesAnInvalidAddress`; `refusesADuplicate`; `removingASiteDropsOnlyThatSite`. `SiteDataClearerTest`: `clearsSiteDataButNotHistoryOrFavorites` (a fake bridge records the types asked for). `settings.mjs` check 1: with the blocker switched off in Settings and a tab open on a tracker-heavy fixture page, the shield count stays 0 and the Island's menu shows "Blocking is off"; switching on re-checks (Review Focus 4).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the JNI pair in `blocker_bridge.cc` (the shared host's existing global state, per Task 1), the allowed-sites screen (a list with remove buttons and an add field and button, messages from `ios.settings.invalidSite`, `duplicateSite`, `removeSite`, `exceptions`, `exceptionsHelp`, `addSite`, `site`), opened with `SettingsNavigation.startSettings(context, AllowedSitesSettings.class)` as Task 1 verified, and the Clear site data row with its confirm dialog (`clearSiteDataConfirm`, `clearSiteDataDone`).
- [ ] **Step 4: Run them.** Expected: all pass; `settings.mjs` check 1 on the emulator.
- [ ] **Step 5: With no tab alive** (close every tab, open Settings): the switch, the list and Clear site data all work (Review Focus 5). Add as `settings.mjs` check 2.
- [ ] **Step 6: Commit** "Android A5a: blocker, allowed sites and Clear site data".

### Task 6: Ways in

**Files:**
- Modify: `chromium/blanc/android/java/src/org/chromium/blanc/tabs/SlashCommands.java` (SETTINGS joins `BUILT`), `.../palette/PaletteSheet.java` (the Settings page shortcut), `.../island/IslandMenuPopup.java` (`CUSTOMIZE_START_PAGE`, and `BLOCKING_SETTINGS` opens Privacy), `chromium/blanc/android/browser/blanc_pages_ui.cc` (`start.openSettings`), `chromium/patches/android/0104-android-island.patch` (the palette and menu actions call `SettingsEntry.open`)
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/settings/SettingsEntry.java`
- Test: `PaletteSheetTest` (the `blanc://settings` case changes), `SlashCommandsTest`, `IslandMenuPopupTest`, `SettingsEntryTest`

**Interfaces:**
- Produces: `SettingsEntry.open(Activity activity, SettingsDestination destination)`: ROOT opens `MainSettings` through `SettingsNavigationFactory`; PRIVACY opens it scrolled to the Privacy section; SYNC opens the Sync sheet directly, with no Settings screen behind it (the same sheet `/sync` opens); START_PAGE opens ROOT until A5b.

- [ ] **Step 1: Write the failing tests.** `SlashCommandsTest.settingsIsOfferedAndParses` (`/settings` and `/set` match it; it is listed in the iPhone's order); `PaletteSheetTest.blancSettingsOpensSettings` (replaces `blancAddressesOpenTheServedPagesAndUnservedOnesNothing`'s settings half: `blanc://settings` and `blanc://settings#sync` route to `SettingsEntry`, history and newtab still load their pages); `IslandMenuPopupTest.customizeStartPageOpensSettings` and `blockingOffOpensPrivacy`; `SettingsEntryTest` per destination.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `chrome://blanc/settings.html` unserved (`pages.json` unchanged): `blanc://settings` is native, as on the iPhone. `start.openSettings('sync')` and `('sync-pair')` from the Start Page call `SettingsEntry.open(SYNC)`.
- [ ] **Step 4: Run them.** Expected: all pass. On the emulator, each way in lands on the right screen (`settings.mjs` check 3, using `uiautomator dump` for the screen's title text).
- [ ] **Step 5: Commit** "Android A5a: ways into Settings".

### Task 7: About, strings and the wording gate

**Files:**
- Modify: `chromium/blanc/android/java/src/org/chromium/blanc/settings/BlancSettingsScreen.java` (the About rows), `chromium/tools/android-strings.mjs`, `copy/messages/*.json`, `copy/i18n-scope.json` if the check needs it
- Create: `chromium/tests/android/settings-wording.mjs`
- Test: `chromium/tools/android-strings.test.mjs` (extend), the emulator check

**Interfaces:**
- Produces: Android-only keys, each in `en` and the five translations: `android.settings.more`, `android.settings.islandPosition`, `android.settings.islandPosition.top`, `android.settings.islandPosition.bottom`, `android.settings.openSourceLicenses`. Everything else reuses an `ios.settings.*` or `settings.general.*` key.

- [ ] **Step 1: Write the failing tests.** `android-strings.test.mjs`: every key `BlancSettingsScreen` reads is in `ANDROID_KEYS` and in the six generated files; `npm run copy:check` passes. `settings-wording.mjs` (emulator): opens the root, every Blanc sub-screen and each Chromium page under More, dumps the screen text with `uiautomator dump`, scrolls to the end, and fails on `Chrome`, `Google`, `Sign in`, `Safety` or `Homepage`; runs again with the app language set to German and fails on any English Blanc string.
- [ ] **Step 2: Run them.** Expected: FAIL (strings missing; Chromium wording found).
- [ ] **Step 3: Implement** the About rows: Version (`versionName` and build), Website (`https://blanc.day`), Privacy policy (`https://blanc.day/privacy`), Support (`mailto:support@blanc.day`), and Open-source licenses opening Chromium's own legal-information page (restyled; its Chrome-named text is hidden by a Blanc step per Task 1 Step 2). Add the keys with translations through `npm run copy:ack` as the repository's process requires, then `node chromium/tools/android-strings.mjs` to write the Android files.
- [ ] **Step 4: Fix every wording hit** the gate found with a Blanc step (hide the row) or, where a hit is inside a page Chromium owns and can't be hidden, remove that page from More and record it in the spike note and `STATUS.md`.
- [ ] **Step 5: Run them.** Expected: all pass.
- [ ] **Step 6: Commit** "Android A5a: About, strings and the wording gate".

### Task 8: The A5a gate and the PR

**Files:**
- Create: `chromium/tests/android/a5a-gate.sh`
- Modify: `chromium/STATUS.md` (a "### A5a Settings shell" section), `chromium/tracker.json` if the Android column tracks Settings, `spec/` is left for the records PR

- [ ] **Step 1: Write the gate** as a script in `a4-gate.sh`'s style: `settings.mjs`, `settings-wording.mjs`, `palette.mjs`, `island-menu.mjs`, `outbound-gate.mjs`, the sync check from A4 (a pairing still works with Settings open and closed), `check-patches.py --lane android` and `--lane desktop` (byte-identical), the Robolectric binary, and `node --test chromium/tools/`.
- [ ] **Step 2: Run it** on the server, evidence in `~/blanc-evidence/android/a5a-gate/`. Expected: `A5a gate: pass`.
- [ ] **Step 3: Build the arm64 APK** from the merged-ready tree, install it on the Pixel, open Settings from `/settings`, the Island menu and `blanc://settings`, and turn on Sync from the Sync row. Screenshots (light, dark, wide) go in `STATUS.md`.
- [ ] **Step 4: Review.** Run `/code-review` on the branch; fix Critical and Important findings with a failing test first.
- [ ] **Step 5: Open the PR** to `chromium/migration` (no draft, no stack), watch its checks, and merge with a merge commit when every check passes on the head commit.
- [ ] **Step 6: The owner's check.** The owner pairs the Pixel with desktop through Settings → Sync. Record the result in `STATUS.md`.
