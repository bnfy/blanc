# Blanc for Android A2: Tabs and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blanc for Android's tabs work the way Blanc for iPhone's do: groups, pins, private tabs, the palette with the Quick Switcher and slash commands, find in page, the tab grid, the tab gestures, session restore and Quiet Tabs, on Chromium's own tab model.

**Architecture:** Blanc's tab rules are ported from the iPhone as plain Java (`org.chromium.blanc.tabs`), tested in Robolectric, some against fixtures generated from desktop's JavaScript. A `BlancTabs` facade applies them to Chromium's `TabModelSelector`, so Chromium keeps owning the pages, their persistence and their memory. The palette and the tab grid are native views, like A1's Island. Task 1 is a spike that settles where each piece of tab state lives before any of it is built.

**Tech Stack:** Chromium 156.0.8078.79 Android lane (Java, GN), Robolectric, UI Automator and adb from Node on the build server, Cucumber for the shared acceptance scenarios.

**Spec:** `docs/superpowers/specs/2026-11-03-android-port-design.md` (§4, §5.1, §8.1), the ladder in `docs/superpowers/plans/2026-11-03-android-port.md` (A2 row, Review Focus 1), and Blanc for iPhone as shipped on `main` under `ios/Blanc/` (the owner's rule of 2026-11-04: Android follows the iPhone).

## Global Constraints

- Everything in the A1 plan's Global Constraints still applies (`docs/superpowers/plans/2026-11-04-android-a1-island.md`): Chrome stable lane, `chromium/android-<slug>` branches into `chromium/migration`, debug ID `me.bnfy.blanc.dev`, the outbound gate passing, strings from `copy/messages/` in all six languages through `chromium/tools/android-strings.mjs`, and the server's address kept out of the repository.
- **The iPhone is the reference.** Where Android has a choice, do what `ios/Blanc/Blanc/` does; diverge only where Chromium or Android forces it, and record each divergence as a D-row.
- **iPhone values to port exactly** (points become dp):
  - **Groups** (`TabGroups.swift`): a name keeps the case typed, is trimmed and capped at 40 UTF-16 units, and compares without case; two groups can't share a name. Optional color: one of the eight Space presets (`SpaceIdentity.PRESETS`) or none. A group exists only while it holds tabs.
  - **Sections** (`TabSections.swift`, from desktop's `src/renderer/tab-sections.js`): a group sits where its first member is and holds all its members, pins first; ungrouped pins lead the order.
  - **Quick Switcher** (`QuickSwitcher.swift`): a substring match scores 2, an in-order match 1, plus 0.2 for an open tab; at most 6 results, ties by tab order; it matches `title host path[0..64]`.
  - **Slash commands** (`SlashCommand.swift`): the iPhone's set, in its order, with hints from `slash.<camel>.hint`. A2 builds `/favorites`, `/history`, `/new`, `/private`, `/close`, `/reopen`, `/group`, `/ungroup`, `/close-group`, `/find` and `/theme`. `/settings` (A5), `/sync` and `/send` (A4), `/block-ads` and `/allow-ads` (A3), `/reader` (after A2) and `/space` (A4) are left out until their milestone, as unbuilt menu entries are.
  - **Undo close:** 5 seconds (`undoWindow`).
  - **Tab grid** (`TabGridView.swift`): 2 columns (3 at regular width), 16 apart, rows 24 apart, 20 padding; header "Open tabs" and the count; group headers with a fold; a folded group shows one "tucked away" row; a sideways swipe left closes a card, a drag right resists and springs back; a New Tab button 48 tall, corner radius 16; the undo banner 76 above the bottom.
  - **Palette** (`PaletteSheet.swift`): the address row (search icon, field with `ios.palette.placeholder`, clear, collapse), a 0.5 hairline, the list (tabs at rest; slash commands after `/`; the Quick Switcher otherwise), a footer with New Tab; sheet corner radius 22, resting height 420, expandable to full.
- **Settings keys** stay device-local and never synced; A2 adds none.
- Spaces are not in A2: the iPhone's Spaces sync, so they arrive with A4 (Shared Spaces). A2 hides `/space` and the Spaces entries (see Calls, below).

## Review Focus

1. **Android kills the app mid-session (process death)** (parent Review Focus 1). Tabs, groups with their names and colors, pins and the active tab come back; private tabs come back gone. → Task 7 (`session-restore.mjs` with `adb shell am kill` while backgrounded).
2. **Closing the last tab, and the last private tab.** Closing the last normal tab leaves a fresh Start Page, as on the iPhone; closing the last private tab returns to the normal tabs and the private chip goes away. → Task 3.
3. **A group name that differs only in case, or is too long or blank.** `/group research` joins "Research"; a 41-character name is cut to 40; a blank name can't be submitted; renaming to another group's name is refused with `groupMenu.duplicate`. → Tasks 2 and 3.
4. **The undo banner across a tab switch, rotation or process death.** Undo restores the closed tab in its place and group within 5 seconds; after that, `/reopen` still does. A process death drops the undo, not the tab list. → Tasks 3 and 7.
5. **TalkBack in the grid and palette.** Every card has the iPhone's label and its Close action; group headers announce their tab count; the palette's rows are reachable in order. → Tasks 4 and 5.

---

### Task 1: Tab model seam spike

**Files:**
- Create: `docs/android/a2-tabs-spike.md`
- Throwaway: a branch of patch 0104 on the server; nothing from it is kept except the document.

**Interfaces:**
- Produces: a decision for each of these, with the Chromium API it uses, recorded in the spike document and the ledger:
  1. **Groups:** Chromium's own tab groups on `TabModel` (`setTabGroupTitle`, colors, collapse, `getTabsInGroup`) or Blanc's own list. Default: Chromium's, since it persists and restores them; Blanc's eight preset colors stored beside them in Blanc's preferences, keyed by the group's token, with the nearest Chromium color set as well.
  2. **Pins:** `Tab.getIsPinned` / `TabModel.pinTab`. Default: Chromium's.
  3. **Mute:** `WebContents.setAudioMuted`. Default: Chromium's, kept across restore by Blanc if Chromium doesn't.
  4. **Normal and private tabs in one list** (the iPhone mixes them; Chromium keeps two models). Default: the grid and palette show private tabs as their own section after the normal tabs, and the Island swipe stays within the current model (A1's ruling). A D-row records it.
  5. **Process death:** whether Chromium restores normal tabs, groups, pins and the active tab, and drops private tabs, with no Blanc code.
  6. **Quiet Tabs:** which Chromium mechanism frees a background tab's renderer on Android (OS renderer kills, `TabFreezing`, or none), and whether a discarded tab returns with its title, address and back history (§5.1 F31).
  7. **Pull to refresh** (F56): whether Chromium's own pull-to-refresh works with the toolbar hidden, and stays off on Blanc's Start Page.
  8. **Find:** `FindToolbar`'s bridge (`FindInPageBridge` or its 156 successor) usable from a Blanc view without Chrome's toolbar.
  9. **Thumbnails** for the grid's cards: `TabContentManager` captures, or the iPhone's approach (`TabPreviewRenderer`, a page snapshot).

- [ ] **Step 1:** Build each probe on the emulator and write what Chromium does, with the API name, a screenshot or log line, and the default kept or changed.
- [ ] **Step 2:** Rule on each decision in the ledger (`Task 1: Ruling: …`), then write `docs/android/a2-tabs-spike.md`.
- [ ] **Step 3:** If a decision changes an interface named in Tasks 2–8, edit those tasks' Interfaces blocks in this plan in the same commit, and list the change in the ledger.
- [ ] **Step 4: Commit** the spike document (docs PR to `main`).

### Task 2: Blanc's tab rules in Java

**Files:**
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/tabs/{GroupNames,GroupColors,TabSections,QuickSwitcher,SlashCommands}.java`
- Create: `chromium/tools/android-tab-fixtures.mjs` (generates `TabSectionsFixtures.java` and `QuickSwitcherFixtures.java` by running desktop's `src/renderer/tab-sections.js` and the iPhone's switcher rules over a corpus), with its `.test.mjs`
- Modify: `chromium/blanc/android/BUILD.gn` (a `tabs_java` library and the tests in `blanc_android_junit_tests`), `chromium/tools/android-strings.mjs` (the A2 keys)
- Test: `chromium/blanc/android/junit/src/org/chromium/blanc/tabs/*Test.java`

**Interfaces:**
- Produces:
  - `GroupNames.normalize(String) -> String`, `GroupNames.key(String) -> String`, `GroupNames.same(String, String) -> boolean`, `GroupNames.MAX_LENGTH = 40`.
  - `GroupColors.PRESETS` (the eight ids and hex values from `SpaceIdentity.PRESETS`), `GroupColors.valid(@Nullable String) -> boolean`.
  - `TabSections.Item(String id, @Nullable String groupId, boolean pinned)`, `TabSections.Section(@Nullable String groupId, List<String> tabIds)`, `TabSections.sections(List<Item>) -> List<Section>`, `TabSections.normalized(List<Item>) -> List<Item>`.
  - `QuickSwitcher.Candidate(String id, String title, String url, int index)`, `QuickSwitcher.search(String query, List<Candidate>) -> List<Result>` with `Result(String id, double score, String title, String subtitle)`.
  - `SlashCommands.Kind` (enum in the iPhone's order), `SlashCommands.available() -> List<Kind>` (A2's built set), `SlashCommands.matching(String input) -> List<Kind>`, `SlashCommands.parse(String input) -> @Nullable Parsed(Kind kind, String argument)`, `SlashCommands.hintKey(Kind) -> String`.

- [ ] **Step 1: Write the failing tests:**
  - `GroupNamesTest`: `same("Research", "research")`; a 41-unit name normalizes to 40; leading and trailing JavaScript whitespace is trimmed; `key` lowercases like JavaScript (`"İ"` included, matching `SyncCrypto.lowercaseLikeJavaScript`).
  - `TabSectionsTest`: every fixture row (desktop's output) matches; ungrouped pins lead; a group's pins lead the group.
  - `QuickSwitcherTest`: every fixture row matches; `search("", …)` is empty; at most 6 results; ties keep tab order.
  - `SlashCommandsTest`: `available()` is exactly A2's eleven in the iPhone's order; `matching("/cl")` is `[CLOSE, CLOSE_GROUP]`; `parse("/group  Research ")` gives `GROUP` and `"Research"`; `hintKey(CLOSE_GROUP)` is `"slash.closeGroup.hint"`; `/settings` doesn't parse until A5.
  - `android-tab-fixtures.test.mjs`: the generated files are current (`--check`).
- [ ] **Step 2: Run** them on the server (`run_blanc_android_junit_tests`) and confirm they fail on the missing classes.
- [ ] **Step 3: Implement** the five classes as ports of the named Swift files, and the fixture generator.
- [ ] **Step 4: Run** the tests, and they pass; the fork suite passes.
- [ ] **Step 5: Commit** on `chromium/android-tab-rules`.

### Task 3: `BlancTabs`, Blanc's tab operations on Chromium's tab model

**Files:**
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/tabs/BlancTabs.java` (the operations, over a `TabStore` interface) and `TabStore.java`
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/tabs/ChromiumTabStore.java` (the `TabStore` over `TabModelSelector`, in a library with Chromium dependencies, like `island_ui_java`)
- Modify: patch `0104` (create `BlancTabs` beside the Island; the Island's New Tab and close-private-tab callbacks go through it)
- Test: `BlancTabsTest.java` (over a fake `TabStore`), `chromium/tests/android/tabs.mjs` (emulator)

**Interfaces:**
- Consumes: Task 2's rules; Task 1's decisions 1–4.
- Produces:
  - `TabStore`: `List<Entry> tabs(boolean privateTabs)`, `@Nullable Entry active()`, `String create(@Nullable String url, boolean privateTab, @Nullable String groupId)`, `void close(String tabId)`, `void select(String tabId)`, `void move(String tabId, int index)`, `void setPinned(String tabId, boolean)`, `void setMuted(String tabId, boolean)`, group calls (`String createGroup(String tabId, String name)`, `void setGroupName/Color/Collapsed`, `void addToGroup(String tabId, String groupId)`, `void removeFromGroup(String tabId)`), and `addObserver(Runnable)`. `Entry(String id, String url, String title, @Nullable String groupId, boolean pinned, boolean muted, boolean privateTab)`.
  - `BlancTabs`: `newTab()`, `newPrivateTab()`, `close(String id)`, `undoClose() -> boolean`, `reopenLast() -> boolean`, `duplicate(String id)`, `setPinned`, `setMuted`, `createGroup(String name, String tabId) throws GroupNameException`, `renameGroup`, `setGroupColor`, `setGroupCollapsed`, `moveToGroup(String tabId, @Nullable String groupId)`, `ungroup(String groupId)`, `closeGroup(String groupId)`, `newTabInGroup(String groupId)`, `sections() -> List<TabSections.Section>`, `@Nullable String undoTitle()`. Undo lasts `UNDO_MILLIS = 5000`.

- [ ] **Step 1: Write the failing tests** (`BlancTabsTest`, fake store):
  - closing a grouped tab and undoing within 5 s puts it back at its index in its group; after 5 s `undoClose()` is false and `reopenLast()` still reopens it;
  - closing the last normal tab leaves one Start Page tab; closing the last private tab selects the normal active tab;
  - `createGroup("research", t)` when "Research" exists adds `t` to it (`/group` finds or creates); renaming a group to another's name, in any case, throws `GroupNameException` and the UI shows `groupMenu.duplicate`; a blank name throws; two groups never differ only by case;
  - `closeGroup` closes every member and is one undo;
  - a group with no tabs left is gone from `sections()`;
  - a plain new tab is ungrouped, as on the iPhone and desktop;
  - private tabs are never recorded for `reopenLast()`.
  - `tabs.mjs` (emulator): New Tab, close, Undo within 5 s, `/reopen` after it, duplicate, pin, mute (the audio-muted state from DevTools), and a private tab's close returning to the normal tabs.
- [ ] **Step 2: Run** them, and confirm they fail.
- [ ] **Step 3: Implement** `BlancTabs`, `TabStore`, `ChromiumTabStore`, and the patch 0104 wiring.
- [ ] **Step 4: Run** the tests, and they pass; the outbound gate passes.
- [ ] **Step 5: Commit** on `chromium/android-tabs`.

### Task 4: The palette

**Files:**
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/palette/{PaletteSheet,PaletteRows}.java` and layouts under `chromium/blanc/android/island/res/`
- Modify: patch `0104` (the Island's site opens the palette instead of A1's address sheet; `start.openIsland` from the Start Page opens it, replacing A1's no-op in `blanc_pages_ui.cc`); `IslandMenuPopup.BUILT` gains `FIND` once Task 6 lands
- Delete: `address/AddressSheet.java` once the palette's address row replaces it (`AddressInput` stays)
- Test: `PaletteSheetTest.java` (Robolectric), `chromium/tests/android/palette.mjs` (emulator)

**Interfaces:**
- Consumes: `BlancTabs` (Task 3), `QuickSwitcher` and `SlashCommands` (Task 2), `AddressInput` (A1).
- Produces: `PaletteSheet.show(Activity, BlancTabs, Callbacks) -> PaletteSheet`, with `Callbacks`: `load(String url)`, `openPage(String page)` (`favorites`, `history`), `find()`, `setTheme(@Nullable String)`. Modes as the iPhone's: `TABS` (empty input), `SLASH` (starts with `/`), `SWITCHER` (anything else).

- [ ] **Step 1: Write the failing tests:**
  - empty input lists the tabs by `sections()`, groups as shaded blocks with their headers and counts, the active tab selected;
  - `/` lists A2's commands with their hints; `/cl` narrows to Close and Close Group; Enter on `/group` with no name keeps the palette open with `/group ` typed (the iPhone's `prompt` outcome);
  - typing `exa` lists switcher results before the search row, at most 6;
  - Enter on an address loads it in the current tab; on words, searches DuckDuckGo (A1's `AddressInput`);
  - the footer's New Tab opens a tab and closes the palette;
  - TalkBack: the field's hint, the Clear and Collapse buttons' labels (`ios.palette.clear`, `ios.island.collapse`), and each row's title.
  - `palette.mjs` (emulator): open from the Island and from typing on the Start Page with a hardware keyboard, switch tabs from the list, run `/new`, `/close`, `/group Research`, and check the palette sits above the keyboard at three sizes and survives rotation.
- [ ] **Step 2: Run** them, and confirm they fail.
- [ ] **Step 3: Implement** the palette and its wiring.
- [ ] **Step 4: Run** the tests, and they pass.
- [ ] **Step 5: Commit** on `chromium/android-palette`.

### Task 5: The tab grid

**Files:**
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/tabs/grid/{TabGrid,TabCard,GroupHeader,GroupNameDialog,UndoBanner}.java` and layouts
- Modify: patch `0104` (the Island's tabs button and the swipe into the page open the grid)
- Test: `TabGridTest.java`, `TabCardSwipeTest.java` (Robolectric), `chromium/tests/android/tab-grid.mjs` (emulator)

**Interfaces:**
- Consumes: `BlancTabs` (Task 3), Task 1's decision 9 (thumbnails) and 4 (private section).
- Produces: `TabGrid.show(Activity, BlancTabs, Thumbnails) -> TabGrid`; `Thumbnails.get(String tabId, Callback<Bitmap>)`.

- [ ] **Step 1: Write the failing tests:**
  - the grid has 2 columns at phone width and 3 at 600 dp and wider, with the iPhone's spacing;
  - the header reads "Open tabs" and the count; groups show their headers; a folded group shows one tucked-away row; private tabs show as their own section (Task 1, decision 4);
  - tapping a card selects its tab and closes the grid;
  - a left swipe past the threshold closes the card and shows the undo banner; a right drag springs back; with animations off, the card only fades (the iPhone's Reduce Motion);
  - the group header's menu renames (with `GroupNameDialog`'s refusal for a blank or duplicate name), colors, ungroups and closes the group;
  - TalkBack: each card is labeled with its title and has a Close action (`settings.gesture.action.closeTab`); the header announces the group's tab count.
  - `tab-grid.mjs` (emulator): open from the Island and by swiping into the page, close a card by swiping, Undo, rename and color a group, at three sizes and both Island positions.
- [ ] **Step 2: Run** them, and confirm they fail.
- [ ] **Step 3: Implement** the grid.
- [ ] **Step 4: Run** the tests, and they pass.
- [ ] **Step 5: Commit** on `chromium/android-tab-grid`.

### Task 6: Find in page

**Files:**
- Create: `chromium/blanc/android/java/src/org/chromium/blanc/find/FindCapsule.java` and its layout
- Modify: patch `0104` (Find from the Sunrise menu and `/find`); `IslandMenuPopup.BUILT` gains `FIND`
- Test: `FindCapsuleTest.java`, `chromium/tests/android/find.mjs`

**Interfaces:**
- Consumes: Task 1's decision 8.
- Produces: `FindCapsule.show(Activity, Finder) -> FindCapsule`, `Finder`: `find(String text, boolean forward)`, `stop()`, and a result callback `(int active, int total)`.

- [ ] **Step 1: Write the failing tests:** the capsule is desktop's (the iPhone uses the system find bar, which Android doesn't have; §5.1 F8): a field with `find.placeholder`, a match count, Previous and Next (`find.prev`, `find.next`) that wrap; back closes it and clears the highlight; it sits above the keyboard and the Island. The count's copy ("2 of 5") is a new `find.count` message added to `copy/messages/` in all six languages in this task. `find.mjs` finds "domain" on the test page and checks the count.
- [ ] **Step 2: Run** them, and confirm they fail.
- [ ] **Step 3: Implement** the capsule over Chromium's find bridge.
- [ ] **Step 4: Run** them, and they pass.
- [ ] **Step 5: Commit** on `chromium/android-find`.

### Task 7: Session restore and Quiet Tabs

**Files:**
- Create (as Task 1 decides): `chromium/blanc/android/java/src/org/chromium/blanc/tabs/BlancTabState.java` for any state Chromium doesn't keep (group preset colors, mute)
- Test: `BlancTabStateTest.java`, `chromium/tests/android/session-restore.mjs`, `chromium/tests/android/quiet-tabs.mjs`

**Interfaces:**
- Consumes: `BlancTabs` (Task 3); Task 1's decisions 5 and 6.
- Produces: `BlancTabState.save(BlancTabs)`, `BlancTabState.restore(BlancTabs)`.

- [ ] **Step 1: Write the failing tests:**
  - `session-restore.mjs` (Review Focus 1): with four tabs in two groups (one named and colored, one pinned tab, one muted tab) and a private tab, background the app, `adb shell am kill me.bnfy.blanc.dev`, relaunch; the tabs, order, groups with names and colors, pin, mute and active tab are back, the private tab is gone, and the undo banner isn't shown;
  - the same after a force-stop and after a reboot of the emulator;
  - `quiet-tabs.mjs`: with 20 tabs open, the background tabs Chromium frees come back on selection with their title, address and back history; the active tab and a tab playing audio are never freed;
  - `BlancTabStateTest`: saved state for a tab or group that no longer exists is dropped.
- [ ] **Step 2: Run** them, and confirm they fail (or, where Chromium already does it with no Blanc code, record that in the ledger as the passing evidence).
- [ ] **Step 3: Implement** only what Chromium doesn't already do.
- [ ] **Step 4: Run** them, and they pass.
- [ ] **Step 5: Commit** on `chromium/android-session`.

### Task 8: Shared acceptance scenarios on Android

**Files:**
- Modify: `spec/acceptance/*.feature`: tag `@android-smoke` on the `@all` scenarios of F2–F8 and F18; add `@mobile` scenarios for F31 and F56 from the iPhone's behavior (F56: the Island swipe, swipe a card to close, pull to refresh), with new stable ids
- Create: `test/android/` (Cucumber step definitions over adb, UI Automator and DevTools, in the shape of `test/desktop/`), `test/android/cucumber.cjs`
- Modify: `spec/acceptance/README.md` (the `@android-smoke` tag), `chromium/STATUS.md`'s Bar A note
- Test: `npm run test:acceptance:android -- --tags @android-smoke` on the server

**Interfaces:**
- Consumes: every earlier task's emulator checks, reused as step helpers.
- Produces: a report that lists every `@android-smoke` scenario as pass, fail or undefined, never a silent skip.

- [ ] **Step 1: Tag the scenarios and add the F31 and F56 scenarios.** Run `npm run test:acceptance:dry` and the desktop acceptance dry run, and both still resolve.
- [ ] **Step 2: Write the step definitions** and run them; every step that isn't bound reports undefined.
- [ ] **Step 3: Bind the steps** until every `@android-smoke` scenario passes on the emulator.
- [ ] **Step 4: Commit:** the spec and `test/android/` changes on `main` in their own PR (shared files: needs desktop confirmation), the runner's server wiring on `chromium/android-acceptance`.

### Task 9: A2 gate and records

- [ ] **Step 1: Run on the emulator,** with evidence in `~/blanc-evidence/android/a2/`: every A2 test, `tests/android/a1-gate.sh` (A1 must stay green), `@android-smoke` acceptance, `session-restore.mjs` and the outbound gate.
- [ ] **Step 2: Owner hands-on, on the Pixel:** the palette, the grid's swipe to close, groups, pull to refresh and the Island swipe feel like the iPhone's. This step waits for the Pixel.
- [ ] **Step 3: Write the records:** `chromium/STATUS.md`'s Android section (A2 results, the bridge members still not answered), `chromium/tracker.json` (F2–F8, F18, F31, F56 Android stages), new D-rows (Task 1's private-tabs section and any other forced difference), and run `node chromium/tools/progress.mjs --check`.
- [ ] **Step 4: Write the A3 plan** (blocking) and hand it to the owner.

## Calls made here, for the owner to check

- **Spaces wait for A4.** The iPhone's Spaces sync and Shared Spaces is A4's work, so A2 leaves `/space` and the Spaces menu out, and Review Focus 1's "Spaces come back" check moves to A4.
- **Private tabs are their own section** in the grid and palette, after the normal tabs (Task 1 may confirm or change this). The iPhone mixes them in one list; Chromium keeps them in two models, and merging them would mean replacing Chromium's tab model.
- **Groups and pins are Chromium's** (Task 1 may change this). Chromium already saves and restores them; Blanc adds only its rules and preset colors.
- **Reader mode is not in A2** (the iPhone has `/reader`); it gets its own milestone slot after A2.
