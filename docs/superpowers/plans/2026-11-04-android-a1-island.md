# Blanc for Android A1: Island and pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blanc for Android shows Blanc for iPhone's Island and Blanc's own pages instead of Chrome's toolbar, New Tab page and tab switcher, on the A0 build.

**Architecture:** Chromium's toolbar stays in the build, zero height and hidden, so `ToolbarManager` keeps working; the page gets the whole screen. Blanc's Island is a native Android view floating over the page in the tabbed activity, a port of the iPhone's SwiftUI Island with the same contents, sizes, tuck rules and swipe. Blanc's pages (`newtab`, `bookmarks`, `history`, `shortcuts`, `error`, `mahjong`) are the shipping files, served by a WebUI host with the iPhone's phone layout and a `bowserPages` bridge.

**Tech Stack:** Java (Chromium's Android style), JUnit/Robolectric in `chrome_junit_tests`, C++ WebUI, the shipping page files, Node for the tree's tools, adb and UI Automator on the server's emulator.

**Spec:** [`docs/superpowers/specs/2026-11-03-android-port-design.md`](../specs/2026-11-03-android-port-design.md) §4 and §5, the ladder in [`2026-11-03-android-port.md`](2026-11-03-android-port.md), and **the iPhone app on `main` (`ios/Blanc/Blanc/`)**, which is the reference for every behavior below.

## Owner direction and corrections

- **Owner, 2026-11-04: "The Android app should be as close to the iOS app as possible."** Where Android or Chromium offers a choice, Android does what Blanc for iPhone does, as shipped. Diverge only where the platform forces it, and add a D-row for each divergence.
- **Corrections to the A0 plan's A1 row:** the iPhone Island has **no tab dots, no shield chip and no back button**, and **no flick-up-to-close**. A1 builds the Island the iPhone actually has. Blocking is reached from the Sunrise menu; tabs close in the tab grid (A2).
- **Changed from the design:** the Island floats over the page and tucks by the iPhone's discrete rules, not Chromium's scroll-away toolbar. Settings becomes a native Blanc sheet like the iPhone's (design §4 updated; built in A5).

## Global Constraints

- Everything in the A0 plan's Global Constraints still applies: x86-64 Linux server builds, Chrome stable lane, PRs into `chromium/migration` on `chromium/android-<slug>` branches, debug ID `me.bnfy.blanc.dev`, no Google requests (the outbound gate must keep passing), strings from `copy/messages/` in all six languages, and the server's address kept out of the repository.
- **iPhone values to port exactly** (points become dp):
  - **Island:** corner radius 17; maximum width 600; outer padding 16 horizontal and 10 vertical; button cells 44 × 48; domain text 15 sp, minimum height 48; dividers 1 × 18.
  - **Surface:** iOS's pre-26 fallback (`IslandSurface.swift`): a raised fill, a 0.5 dp hairline, and a shadow of radius 10 at y 4. Android has no Liquid Glass.
  - **Tuck** (`IslandTuck.swift`): tucks after 24 of downward travel, shows again after 12 upward. Travel resets when the direction changes. It always shows within 8 of either end of the page. Only scrolling by a person counts.
    - Tucked offset: `islandHeight + 40` at the bottom, `-(islandHeight + 80)` at the top.
    - Animation: the iPhone uses `.snappy(0.3)`. Use a 300 ms decelerate animation. With reduced motion (`Settings.Global.ANIMATOR_DURATION_SCALE == 0`), fade only.
  - **Swipe** (`IslandSwipe.swift`): it's a sideways swipe once `|dx| ≥ 12` and `|dx| > |dy|`.
    - It switches tabs at 30% of the reach width, or when the projected end passes 50%. The reach width is the Island's width, capped at 440.
    - Past either end, the page follows at a quarter of the finger's travel.
    - Swiping left goes to the next tab.
- **Settings keys:** `islandPosition` (`bottom` default | `top`) and `islandTucksOnScroll` (default `true`). Both are device-local, never synced, and stored in Blanc's Android settings store.
- Shipping page files are pinned by commit, like desktop's `island-assets.json`. Android never edits a copied file in place.

## Review Focus

1. **Rotation, split-screen and resizing** (parent Review Focus 2). The Island keeps its tuck state and position and stays inside the insets; the palette or address sheet survives a configuration change. → Task 3 and the Task 8 gate.
2. **The keyboard over a bottom Island.** Opening the address sheet puts its field above the IME. Hiding the IME never leaves the Island hidden or doubled. → Task 5.
3. **Gesture navigation versus three-button navigation, and display cutouts.** The bottom Island clears the gesture pill and the nav bar; the top Island clears the cutout and the status bar. → Task 3, emulator runs in both navigation modes.
4. **TalkBack.** The Island never tucks with TalkBack on; every control has the iPhone's label from `copy/messages`; focus order runs left to right. → Tasks 2 and 3.
5. **Odd addresses in the Island.** IDN, very long hosts, IP addresses, `file:` and `about:` addresses, and a crashed or blank tab each show a sensible label. Blanc's own pages show "Start Page", "Favorites" and "History", as on the iPhone. → Task 2.

---

### Task 1: Island spike: the seam and the overlay

**Files:**
- Create: `docs/android/a1-island-spike.md`, on `main` through the docs PR at the end of A1.
- Throwaway: a local branch on the server, never merged.

**Interfaces:**
- Produces: the decided seam, which Tasks 3–8 build on:
  - how the Chromium toolbar is hidden (proposed: a Blanc `ToolbarLayout` subclass, returned from `ChromeTabbedActivity.getToolbarLayoutId()` on every form factor, with top and bottom controls height 0);
  - where the Island view attaches (proposed: the tabbed activity's `CoordinatorLayout`, above the compositor view);
  - how the page reports scroll (proposed: `GestureListenerManager.addListener(GestureStateListener)` on the active tab's `WebContents`, from `onScrollOffsetOrExtentChanged`, `onScrollStarted`, `onScrollEnded`, `onFlingStartGesture` and `onFlingEndGesture`).

- [ ] **Step 1: Spike the proposed seam** on the emulator with a plain coloured view as the Island.
- [ ] **Step 2: Answer, with screenshots or logcat:**
  - Is the page full bleed under the Island, top and bottom?
  - Does `ToolbarManager` start without a visible location bar?
  - Do back, the IME, rotation and split-screen work?
  - Do the `GestureStateListener` offsets match `window.scrollY` (checked over CDP) within 1 dp?
  - Does a fling count as scrolling by a person, as the iPhone's `isDecelerating` does?
- [ ] **Step 3: Record the views-versus-WebUI decision.** The design's call is native views. Keep it unless the spike shows a native view can't float over the compositor without jank.
- [ ] **Step 4: Write `a1-island-spike.md`** with the answers, the chosen seam, and any fallback. The fallback is Chromium's `BottomControlsStacker` with a `BOTTOM_TOOLBAR` layer, which would bring Chromium's proportional scroll-away and needs a D-row.

### Task 2: Island models, ported from the iPhone

**Files:**
- Create in `chromium/blanc/android/java/src/org/chromium/blanc/island/`:
  - `IslandTuck.java`
  - `IslandSwipe.java`
  - `IslandPosition.java`
  - `IslandTitle.java`
  - `IslandMenu.java`
  - `IslandVisibility.java`
- Create: `chromium/blanc/android/BUILD.gn`, defining `android_library("blanc_island_java")` and `robolectric_library("blanc_island_junit_tests")`.
- Create: the tests under `chromium/blanc/android/junit/src/org/chromium/blanc/island/`.
- Modify: `chromium/patches/android/0103-android-blanc-java.patch` (new). It adds `//blanc/android:blanc_island_java` to `chrome_java`'s deps, and the test target to `chrome_junit_tests`.

**Interfaces:**
- Produces (plain Java, no Android views):
  - `IslandTuck`: `void scrolled(float previousOffset, Position p, boolean byPerson)`, `void show()` and `boolean isTucked()`.
    - `Position` holds `offset`, `contentHeight`, `viewportHeight`, `topInset` and `bottomInset`.
    - Constants: `TUCK_AFTER = 24`, `SHOW_AFTER = 12`, `EDGE_SLACK = 8`.
  - `IslandSwipe`: `static boolean isSideways(float dx, float dy)`, `static float reach(float islandWidth)` (capped at 440), `static int target(float dx, float predictedDx, float reach, int index, int count)` (returns the new tab index) and `static float overscroll(float dx)` (a quarter).
  - `enum IslandPosition { BOTTOM, TOP }`, with `static IslandPosition fromSetting(String)`. Unknown values map to `BOTTOM`.
  - `IslandTitle.forUrl(GURL url, Strings s) → String`, ported from the iPhone's `displayDomain`:
    - `chrome://blanc/newtab.html` (Task 6) shows `ios.tabs.startPage`; the bookmarks page shows `pagesNav.bookmarks`; history shows `pagesNav.history`.
    - Any other host loses a leading `www.`.
    - With no URL, it shows `ios.tabs.startPage`.
  - `IslandMenu.items(MenuContext c) → List<IslandMenuItem>`, ported from `IslandMenu.swift`:
    - `customizeStartPage` appears on the Start Page only.
    - `blocking(on)` or `blockingSettings` and `favorite(saved)` appear on web pages; `favorite` is never offered on a private tab.
    - `send` appears only with send targets, followed by `share` and `find`.
    - `newPrivateTab` always comes last.
    - Glance items are left out, because Android has no wide layout in 1.0.
  - `IslandVisibility.mayTuck(boolean startPage, boolean talkBack, boolean sheetOpen, boolean tuckSetting) → boolean`. The Island never tucks on the Start Page, with TalkBack on, with the palette or address sheet open, or with the setting off.

- [ ] **Step 1: Port the iPhone's tests as failing Java tests**, case for case:
  - `IslandTuckTests` (all 8 cases);
  - `IslandSwipeTests`;
  - `IslandLayoutTests` for position;
  - `IslandMenuTests`;
  - a new `IslandTitleTest` with Review Focus 5's addresses. An IDN host stays readable Unicode (Chromium's `UrlFormatter`). A 60-character host is not cut by the model; the view truncates it. An IP address and `about:blank` show as typed. A crashed tab shows its last committed host.
- [ ] **Step 2: Run** `out/AndroidDebugX64/bin/run_chrome_junit_tests --gtest_filter='org.chromium.blanc.island.*'` and confirm the tests fail.
- [ ] **Step 3: Implement** the five classes. Copy the constants verbatim, with a comment naming each one's Swift source.
- [ ] **Step 4: Run the tests.** All pass, and `check-patches.py --lane android` passes.
- [ ] **Step 5: Commit** on `chromium/android-island-models`.

### Task 3: The Island view floats over the page

**Files:**
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/island/IslandView.java`, `IslandCoordinator.java`, and `res/layout/blanc_island.xml`
- Create: `res/drawable/blanc_island_surface.xml` and `res/values/blanc_island_dimens.xml` (the Global Constraints values)
- Create: `chromium/patches/android/0104-android-island-seam.patch`, at the seam Task 1 chose
- Test: `IslandCoordinatorTest.java` (Robolectric) and `chromium/tests/android/island-insets.mjs` (emulator)

**Interfaces:**
- Consumes: Task 2's models and Task 1's seam.
- Produces: `IslandCoordinator(Activity, TabModelSelector, BlancSettings)`, with these methods:
  - `void setOnAddressTapped(Runnable)`
  - `void setOnMenuTapped(View anchor)`
  - `void setOnTabsTapped(Runnable)`
  - `void setOnNewTabTapped(Runnable)`
  - `void forceShow()`
- Layout, left to right, as the iPhone's pill:
  - the Sunrise mark (menu);
  - a divider;
  - the domain (tap to open the address sheet);
  - the private chip, on private tabs only;
  - Reload, which becomes Stop while loading;
  - the tab-count box;
  - a divider;
  - New tab.
- The tab-count box shows the count from A1. Tapping it calls `setOnTabsTapped`, which opens nothing until A2's tab grid attaches there.
- The Space mark is left out until Spaces arrive (A4). Accessibility labels are `ios.island.searchOrSwitch`, `ios.island.reload`, `ios.island.stop` and `ios.island.showAllTabs`, plus the iPhone's keys for New tab and the menu.

- [ ] **Step 1: Write the failing tests.**
  - `IslandCoordinatorTest`:
    - the domain follows the active tab;
    - Reload swaps to Stop while loading;
    - the count follows the tab model;
    - the private chip shows only on private tabs.
  - `island-insets.mjs`: a UI Automator dump on the emulator, in gesture and in three-button navigation, at the bottom and the top position. The Island's bounds sit inside the system-bar and cutout insets plus the 16/10 padding, at 1080×2400 and 1440×3120 in portrait, and in landscape (Review Focus 1 and 3).
- [ ] **Step 2: Run** both, and confirm they fail.
- [ ] **Step 3: Implement** the view and coordinator, then patch 0104 at Task 1's seam:
  - The page draws full bleed.
  - Window insets come from `WindowInsetsCompat`.
  - Tuck state survives configuration changes, held in the coordinator, not the view.
- [ ] **Step 4: Wire the tuck.** The tab's `GestureStateListener` feeds `IslandTuck.scrolled`, gated by `IslandVisibility.mayTuck`. TalkBack is read from `AccessibilityManager.isTouchExplorationEnabled()`. Animate to the Global Constraints offsets.
- [ ] **Step 5: Run** both tests, and they pass. Run the outbound gate on the emulator: still `pass`.
- [ ] **Step 6: Commit** on `chromium/android-island-view`.

### Task 4: Swipe on the Island switches tabs

**Files:**
- Modify: `IslandView.java` and `IslandCoordinator.java`
- Test: `IslandSwipeGestureTest.java` (Robolectric `MotionEvent` sequences) and an emulator check in `island-insets.mjs`

**Interfaces:**
- Consumes: `IslandSwipe` (Task 2) and `TabModelSelector.getCurrentModel().setIndex(int, @TabSelectionType int)`.
- Produces: tab switching from the Island.
  - Swiping into the page (up from a bottom Island, down from a top one, past 40 dp) calls `setOnTabsGesture(Runnable)`. In A1 that opens nothing; A2's tab grid attaches there.
  - A tap that moves less than the sideways threshold still opens the address sheet.

- [ ] **Step 1: Write the failing tests**, mirroring the iPhone's UI tests:
  - `swipeLeftGoesToTheNextTab`
  - `swipeAtTheEndStays`, where the page follows at a quarter and the index is unchanged
  - `tapStillOpensTheAddressSheet`
  - `verticalSwipeCallsTheTabsGesture`
- [ ] **Step 2: Run** them, and confirm they fail.
- [ ] **Step 3: Implement.** The page view translates with the finger, as the iPhone's does. Use a spring with stiffness and damping equivalent to response 0.35 and damping 0.85.
- [ ] **Step 4: Run** them, and they pass.
- [ ] **Step 5: Commit.**

### Task 5: The address sheet

**Files:**
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/address/AddressSheet.java` and `AddressInput.java`
- Create: `chromium/tools/android-address-fixtures.mjs`, which writes `chromium/blanc/android/junit/resources/address-fixtures.json`
- Test: `AddressInputTest.java` and `AddressSheetTest.java`

**Interfaces:**
- Produces: `AddressInput.resolve(String typed) → GURL`.
  - It's a Java port of the shipping heuristic that the desktop fork carries in `chromium/blanc/island/address-input.js` (`normalizeAddressInput`).
  - Searches go to DuckDuckGo (`https://duckduckgo.com/?q=%s`), desktop's default, until Settings arrives (A5).
  - `mailto:`, `tel:`, `sms:` and `facetime:` go to the OS through an `Intent.ACTION_VIEW`, as shipping's `handOffToOs` does.
- Produces: `AddressSheet.show(Activity, String currentUrl, Callback<GURL> open)`.
  - It's a bottom sheet with a text field above the IME, like the iPhone's palette at its 420 dp detent.
  - It opens with the current address selected, opens the result in the current tab, and is dismissed by back.
  - A2's palette replaces its body with the Quick Switcher and slash commands.

- [ ] **Step 1: Generate the fixtures.** `android-address-fixtures.mjs` runs the desktop fork's `address-input.js` (the same `vm` loading as `tools/address-input.test.mjs`) over that test's corpus, and writes 2,000 or more `{input, expected}` pairs. Add `--check`, which fails when the committed JSON is stale.
- [ ] **Step 2: Write the failing tests.**
  - `AddressInputTest.matchesShippingOnEveryFixture`: a differential test over the whole JSON.
  - `AddressSheetTest`:
    - the field sits above the IME;
    - back dismisses the sheet before it navigates back;
    - a rotation keeps the typed text (Review Focus 1 and 2).
- [ ] **Step 3: Run** them, and confirm they fail.
- [ ] **Step 4: Implement** `AddressInput` and `AddressSheet`. Wire the Island's address tap to the sheet, and force the Island shown while the sheet is open.
- [ ] **Step 5: Run** them, and they pass. Run `node chromium/tools/android-address-fixtures.mjs --check`, and it passes.
- [ ] **Step 6: Commit** on `chromium/android-address`.

### Task 6: Blanc's pages on Android

**Files:**
- Create: `chromium/blanc/android/pages.json`, which pins the shipping commit and lists the served files:
  - `newtab.html`, `bookmarks.html`, `history.html`, `shortcuts.html`, `error.html`, `mahjong.html`;
  - their scripts, fonts and icons;
  - `pages.css`, `ios-pages.css`, `ios-start-page.css` and `ios-start-page.js`;
  - `strings.<locale>.js` for all six languages.
- Create: `chromium/tools/android-pages.mjs`, with `--check` and `--out=DIR`, in the shape of `tools/assets.mjs`.
- Create: `chromium/blanc/android/browser/blanc_pages_ui.{h,cc}`. It's a `WebUIConfig` for `chrome://blanc/`, serving the embedded files, plus a `BlancPagesHandler` (`WebUIMessageHandler`).
- Create: `chromium/blanc/android/pages/android-pages-adapter.js`, which defines `window.bowserPages` over `chrome.send('blancPages', [id, group, method, args])` and resolves through `cr.webUIResponse`.
- Create: `chromium/patches/android/0105-android-blanc-pages.patch`. It registers the config in `chrome_web_ui_configs.cc` under `IS_ANDROID`, adds the GN deps, and makes new tabs open `chrome://blanc/newtab.html` (`ChromeTabCreator` and `NativePageFactory`'s NTP host). Chrome's New Tab page and Discover are never created.
- On `main`, in a separate PR first: in `src/renderer/pages/ios-pages.css` and `ios-start-page.css`, add `:root[data-platform="android"]` beside every `:root[data-platform="ios"]` selector. The phone layout is shared, and desktop never sets `data-platform`. Pin that commit in `pages.json`.
- Test: `chromium/tools/android-pages.test.mjs` and `chromium/tests/android/pages-phone.mjs` (emulator screenshots)

**Interfaces:**
- Produces: `chrome://blanc/<file>`. Each page document gets `data-platform="android"`, a device-width viewport and the phone CSS, as the iPhone's `PagesBridge` does.
- Bridge members, A1 set:
  - `start.data`: favorites, `mobileIslandPosition` and the clock settings;
  - `bookmarks.list` and `bookmarks.remove`, from `BookmarkModel`;
  - `history.list`, `history.search`, `history.remove` and `history.clear`, from `HistoryService`;
  - `pages.open(url)`.
  - Any other member rejects with `not-yet`. A1 lists them in `STATUS.md` with the milestone that adds each.
- Members are filtered by page host from `browser-api/bridges.json`, as on the iPhone.

- [ ] **Step 1: Write the failing tests.**
  - `android-pages.test.mjs`:
    - every listed file matches its pinned shipping bytes;
    - nothing outside the list is served;
    - every page's CSP allows only `chrome://blanc/`;
    - the bridge's members are a subset of `bridges.json` for each host.
  - `pages-phone.mjs` screenshots each page at 1080×2400 in all six languages and fails on horizontal overflow (`document.documentElement.scrollWidth > innerWidth`).
- [ ] **Step 2: Run** them, and confirm they fail.
- [ ] **Step 3: Implement** the serving pieces: `android-pages.mjs`, the WebUI, the handler and patch 0105.
- [ ] **Step 4: Implement** the adapter and the A1 bridge members.
- [ ] **Step 5: Run** the tests, and they pass. A fresh install opens the Start Page, not Chrome's. Run the outbound gate, and it passes.
- [ ] **Step 6: Commit** on `chromium/android-pages`.

### Task 7: The Sunrise menu

**Files:**
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/island/IslandMenuPopup.java`
- Test: `IslandMenuPopupTest.java`

**Interfaces:**
- Consumes: `IslandMenu.items` (Task 2), the anchor from `IslandCoordinator.setOnMenuTapped`, and `BookmarkModel`.
- Produces: a popup anchored to the Sunrise mark, with entries in the iPhone's order and with its labels.
  - **Works in A1:** `favorite`, `share` (`Intent.ACTION_SEND`) and `newPrivateTab`.
  - **Still to come:** `customizeStartPage` opens nothing until Settings (A5); `blocking` waits for A3; `find` waits for A2; `send` waits for A4. Each of these is hidden, not disabled, until its milestone, as the iPhone leaves out entries that don't apply.

- [ ] **Step 1: Write the failing tests:**
  - on the Start Page, the menu holds only the entries the iPhone shows there;
  - on a private tab, there's no favorite;
  - New private tab opens an incognito tab and the private chip shows.
- [ ] **Step 2: Run** them, and confirm they fail.
- [ ] **Step 3: Implement** the popup.
- [ ] **Step 4: Run** them, and they pass.
- [ ] **Step 5: Commit.**

### Task 8: A1 gate and records

**Files:**
- Modify: `chromium/STATUS.md`, Android section: A1 results, the not-yet bridge list, and the new D-rows.
- Modify: `chromium/tracker.json`, setting F1's Android stage to `implemented`.
- Create on `main` (docs PR): `docs/android/a1-island-spike.md`, plus new `spec/divergence-register.md` rows after D33:
  - no Liquid Glass on Android;
  - Settings will be a native sheet (A5);
  - whatever Task 1's seam forces.
- Create: `docs/superpowers/plans/<date>-android-a2-tabs.md`, the next plan.

- [ ] **Step 1: Run on the emulator:**
  - every A1 test;
  - `island-insets.mjs` in both navigation modes, both positions and three sizes;
  - `pages-phone.mjs`;
  - the outbound gate (`pass`).
  - Save the evidence to `~/blanc-evidence/android/a1/`.
- [ ] **Step 2: Owner hands-on, on the Pixel:**
  - the Island is usable one-handed at the bottom;
  - tuck and untuck feel like the iPhone's;
  - a sideways swipe switches tabs;
  - pages read well at phone width.
  - This step waits for the Pixel.
- [ ] **Step 3: Write the records,** and run `node chromium/tools/progress.mjs --check`.
- [ ] **Step 4: Write the A2 plan** from the iPhone's tabs, groups, palette and tab grid, and hand it to the owner.
