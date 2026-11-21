# A2 rulings

The decisions made while building A2 (tabs, groups, palette and tab grid), each with what it costs if wrong, kept from the working ledger. Plan: `docs/superpowers/plans/2026-11-04-android-a2-tabs.md`.

## Rulings

- Pre-flight: T3 → T4: the palette selects a tab and lists candidates, but BlancTabs' Produces names no select or entries. Ruling: BlancTabs also exposes select(String id) and entries(boolean privateTabs) -> List<TabStore.Entry> — the palette needs both and TabStore already has them — cost if wrong: two methods renamed.
- Pre-flight: T4 → T6: the palette's Callbacks.find() and the menu's FIND need Task 6's capsule, which comes later. Ruling: SlashCommands.available() keeps /find (Task 2's test, as planned); the palette leaves it out until Task 6 lands the capsule, with the menu's FIND — keeps each task shippable — cost if wrong: one extra line in Task 6.
- Task 1: Ruling: groups and pins are Chromium's (TabModel), with Blanc's preset colors in its own preferences keyed by the group token — the probe showed Chromium restores names, colors, folds and pins across a kill and a force-stop — cost if wrong: Blanc keeps its own group list later.
- Task 1: Ruling: mute and the active tab are saved by Blanc (BlancTabState, Task 7) — Chromium loses both on restore — cost if wrong: none.
- Task 1: Ruling: private tabs close on a cold start (Task 7) — Chromium keeps them across a background kill; the iPhone and Review Focus 1 want them gone — cost if wrong: someone backgrounded mid-private-browse loses those tabs, as on the iPhone.
- Task 1: Ruling: Quiet Tabs is Blanc's sweep calling Tab.discard(), with desktop's eligibility rules and a 1 h idle delay (no Settings until A5) — Chromium has the call but no phone policy — cost if wrong: memory not freed, or a tab freed sooner than expected.
- Task 1: Ruling: pull to refresh stays Chromium's SwipeRefreshHandler, turned off on chrome://blanc/ pages (Task 7) — it reloaded the Start Page in the probe — cost if wrong: none.
- Task 1: Ruling: find uses FindInPageBridge; thumbnails TabContentManager — both exist in 156 — cost if wrong: Task 5/6 find another API.
- Task 2: Ruling: QuickSwitcher ports the iPhone's full search (groups +6, tabs +4.2, Favorites +2, History; at most 12; goTarget), not only the tab-only search the plan described — that's what the iPhone's palette calls — cost if wrong: none; other devices and Spaces join in A4.
- Task 2: Ruling: QuickSwitcher has no desktop fixtures (no JavaScript version of the iPhone's rules exists); its tests come from the Swift. GroupNamesFixtures replaces the plan's QuickSwitcherFixtures — cost if wrong: switcher ranking drifts from the iPhone unnoticed.
- Task 2: Ruling: Go's "is it an address" uses AddressInput.interpret (desktop's rules) instead of the iPhone's looksLikeAddress regexes — Android already ports desktop's — cost if wrong: an edge input Go-opens a tab on one phone and loads on the other.
- Task 2: Ruling: GroupColors stores the preset hex (desktop's sanitizeGroupColor, the iPhone's setGroupColor), with sanitize() in place of the plan's valid() — cost if wrong: one rename.
- Task 2: Ruling: TabSections.normalizedOrder replaces the plan's normalized(List<Item>) (desktop returns ids) — cost if wrong: one rename.
- Task 2: Ruling: GroupNames.key ports the iPhone's Final_Sigma (Java's toLowerCase applies it differently: the differential test caught ß😀Ǆ-Σ) using android.icu's Cased and Case_Ignorable — cost if wrong: none.
- Task 2: Ruling: AddressInput.trim is public now, shared with the tab rules — cost if wrong: none.
- Task 3: Ruling: TabStore gains undoable close (close(id, undoable), cancelClose, commitClose), activeId(privateTabs), privateSelected and selectModel, and create takes an index — the iPhone keeps the live tab during Undo, which Chromium's pending closures give — cost if wrong: Undo reloads the page instead.
- Task 3: Ruling: the reopen list keeps ten addresses, the iPhone's number (desktop keeps 25) — cost if wrong: none.
- Task 3: Ruling: a pending close commits on the next close, reopen or Undo's expiry (Task 5's banner calls expireUndo after 5 s); Chromium also commits pending closures when the app pauses — cost if wrong: a closed tab's page stays in memory a little longer.
- Task 3: Ruling: Chrome's own undo snackbar (UndoBarController) may also show for Blanc's undoable closes; Task 5 hides it when its banner lands — cost if wrong: two Undo prompts until Task 5.
- Task 3: Ruling: tabs.mjs checks only New Tab and the private chip now; close, Undo, /reopen, duplicate, pin and mute need the palette and grid (Tasks 4–5), whose emulator checks take them — cost if wrong: Chromium-side bugs in those paths surface two tasks later.
- Task 3: Ruling: a new group gets Chromium's grey until a color is set; Blanc's presets map to Chromium's nearest (sage→green, sky→blue, iris→purple, rose→pink, clay→orange, sand→yellow, slate→cyan, graphite→grey) — cost if wrong: Chromium's own surfaces show a different hue.
- Task 3: Ruling: GroupNameException is unchecked, with BLANK and DUPLICATE — cost if wrong: none.
- Task 4: Ruling: no separate search row in switcher mode, the iPhone's (it shows matches or "No matches", and Go runs the top match or loads the text) — the plan's "before the search row" — cost if wrong: none.
- Task 4: Ruling: History isn't in the Quick Switcher yet (Android's history search is asynchronous); Favorites are — cost if wrong: a typed site you've visited but not saved isn't suggested until it's added.
- Task 4: Ruling: start.openIsland (typing on the Start Page with a hardware keyboard) still does nothing — it needs a WebUI-to-activity bridge — cost if wrong: hardware-keyboard users tap the Island instead.
- Task 4: Ruling: the sheet's resting height is 420dp with no drag to full height (the iPhone's .large detent) — cost if wrong: long tab lists scroll in a smaller sheet.
- Task 4: Ruling: the palette is plain Android views in island_view_java, tested in Robolectric against the fake store — cost if wrong: none.
- Task 4: Ruling: tab rows have the iPhone's close button; the swipe-to-close and context menu (move to group, new group) come with the grid's menus (Task 5) — cost if wrong: grouping from the palette is by /group only until then.
- Task 4: Ruling: A1's AddressSheet and its tests are gone; its blanc:// mapping moved to AddressInput.servedPage and is tested in PaletteSheetTest — cost if wrong: none.
- Task 4: Ruling: /theme writes Chromium's ui_theme_setting (system/light/dark) with the iPhone's cycle rule (SlashCommands.nextTheme) — cost if wrong: Chromium's preference key changes in a rebase.
- Task 4: Ruling: in landscape with the keyboard up the sheet keeps its field and footer and the list shrinks to nothing (it scrolls in when the keyboard goes) — cost if wrong: landscape typing shows no suggestions until the keyboard hides.
- Task 5: Ruling: TabGrid, GroupNameDialog and CardSwipe replace the plan's five files (TabCard, GroupHeader and UndoBanner live inside TabGrid) — cost if wrong: a later split.
- Task 5: Ruling: Chrome's TabUndoBarController never shows (patch 0104, a new upstream file in the lane): its snackbar's dismissal committed Blanc's pending closes before Undo; BlancTabs schedules its own 5 s expiry on the main looper — cost if wrong: closes from the palette have no Undo prompt until Blanc's page banner (follow-up, the iPhone shows one over the page).
- Task 5: Ruling: a card's long press adds Pin, Mute and Duplicate beside Move to Group (the iPhone's card menu has Move to Group only; the plan's F2 needs pins and mute and §5.1 adds mute) — cost if wrong: an extra menu row.
- Task 5: Ruling: the grid's background is a fixed surface (#F4F4F2 light, #161616 dark), since IslandStyle has no page-surface token — cost if wrong: a slight tint mismatch with the iPhone's style.surface.
- Task 5: Ruling: the active tab's card shows its placeholder when Chromium has no capture yet — cost if wrong: the current page's card is often blank.
- Task 6: Ruling: the count reads "2/5" as desktop's capsule shows it, with no new find.count message (the plan proposed one) — desktop has no translated count — cost if wrong: none.
- Task 6: Ruling: the bar sits at the bottom above the keyboard with Done (the iPhone's system find bar placement) and doesn't dim or block the page — cost if wrong: none.
- Task 6: Ruling: Previous and Next rely on Chromium's own wrap-around — cost if wrong: none.
- Task 7: Ruling: "playing media" is a controllable media session (playing or paused), since Chromium's Java has no audible flag; capture is TabUtils.isCapturingForMedia — cost if wrong: a silent tab with a paused video never goes quiet.
- Task 7: Ruling: a page with beforeunload or unload handlers never goes quiet (needToFireBeforeUnloadOrUnloadEvents), in place of desktop's dirty-form probe; Blanc's Start Page is one, so it stays — cost if wrong: such pages keep their memory.
- Task 7: Ruling: Chromium's discard keeps the WebContents and frees the renderer, so BlancTabKeeper remembers quieted tabs until they're shown again (Tab.getTimestampMillis changes) — cost if wrong: a tab is re-discarded each sweep, which Chromium ignores.
- Task 7: Ruling: the quiet delay is 1 h (no Settings until A5); a debug-only pref blanc.quiet_delay_ms lets the emulator check use 20 s — cost if wrong: none in use; the pref is ignored unless set.
- Task 7: Ruling: Blanc saves the active tab and mute when the app pauses (PauseResumeWithNativeObserver), before Android can end it, and restores after Chromium's tab state loads — cost if wrong: a change made in the last moment before a crash isn't kept.
- Task 7: Ruling: ungrouped pinned tabs were left out of the grid and palette (TabSections excludes desktop's shelf pins); BlancTabs.displaySections puts them first as their own section, the iPhone's — tested red first — cost if wrong: none.
- Task 7: Ruling: pull to refresh stays Chromium's; patch 0104 refuses it on chrome://blanc/ pages (SwipeRefreshHandler, a new upstream file in the lane) — cost if wrong: none.
- Task 8: Ruling: the Android subset is a RUNNABLE id list in chromium/tests/android/acceptance/cucumber.mjs (profile androidSmoke), desktop's approach, instead of tagging @android-smoke across eight shared feature files — cost if wrong: none; a tag can be added later.
- Task 8: Ruling: the harness lives in chromium/tests/android/acceptance/ (cucumber.mjs, not .cjs, as desktop's), beside the emulator checks it reuses; main has no chromium/ tree to import them from. Only the spec changes (F31-11, F56-1–3, the index) go to main in their own PR — cost if wrong: the harness moves when the fork merges.
- Task 8: Ruling: F6-1, F6-2 and F7-1 stay out until A3: island-and-commands.feature's Background turns on ad blocking, which Android doesn't have, and a no-op binding would be a false pass — cost if wrong: the Quick Switcher's parity is proved by palette.mjs and Robolectric, not the shared scenarios, until A3.
- Task 8: Ruling: fixture sites (*.example) are a local HTTPS server reached through Chromium's debug command-line file (--host-resolver-rules, --ignore-certificate-errors) and adb reverse, on the userdebug emulator only; the file is removed after the run — cost if wrong: none in use; a release build never reads the file.
- Task 8: Ruling: the run uses 1080x1920 at density 320 and light mode, so the grid and palette fit a scenario's tabs (UI Automator sees only the screen) and the private Island's color can be read against the normal one — cost if wrong: a layout bug only at density 480 isn't caught here (tab-grid.mjs and palette.mjs cover three sizes).
- Task 8: Ruling: reopening right after a close is the visible Undo while it lasts (BlancTabs.reopenLast does the same then), /reopen after — the steps can't type /reopen inside five seconds — cost if wrong: none.
- Task 8: Ruling: F4-1 opens a normal page first, so the History page must list it before "not in history" can pass — cost if wrong: none.
- Task 8: Ruling: F4-5's non-persistent session is shown by the tab being in the grid's Private section (Chromium's off-the-record profile); a phone has no other observable — cost if wrong: none.
- Task 8: Ruling: F5-8's "the search engine is duckduckgo" asserts Android's only engine until A5 and fails for any other — cost if wrong: none.
- Task 8: Ruling: F3-3 needed the palette's "N tabs tucked away" row (desktop's panel; the grid had it) — PaletteSheetTest red first (compile: no TUCKED kind), then green — cost if wrong: none.
- Task 8: Ruling: F3-5 found that pinning a grouped tab took it out of its group: Chromium keeps pinned tabs apart from groups. ChromiumTabStore now keeps a grouped tab's pin itself (blanc.group_pins), so the tab stays in its group and leads it; joining a group carries a Chromium pin over, leaving one makes it Chromium's again, and Quiet Tabs read it — F3-5 red on the emulator first, then green — cost if wrong: a grouped pin isn't in Chromium's pinned strip (nothing on Android shows that strip).
- Task 8: Ruling: the steps wait for the palette's field to have focus and check what was typed before Enter; F4-1 and F4-3 each failed once on a lost first keystroke or tap before this (5/5 loops since) — cost if wrong: none.
- Task 8: Ruling: the spec commit (b4a3955ff here) is also on the local branch claude/android-acceptance-spec, cut from main for its own PR (not pushed) — cost if wrong: none.
- Task 9: Ruling: F56 gets no tracker row (the tracker lists the fork's desktop requirements; F56 is phone-only); its Android status is in STATUS's A2 section — cost if wrong: one row to add.
- Task 9: Ruling: D36 (private tabs in their own section) and D37 (find bar above the keyboard on phones) are on claude/android-a0-records (4cf264a4a), with F4 and F8 referencing them; the closes-from-palette Undo banner is a gap in STATUS, not a divergence — cost if wrong: none.
- Task 9: Ruling: the A3 plan (docs/superpowers/plans/2026-11-04-android-a3-blocking.md, claude/android-a0-records dd472c324) also corrects D1, D13 and D14's Android lines in its Task 9: they still describe a WebView — cost if wrong: none.
- Final: Ruling: mute on a frozen background tab (Important 8) not reproduced — session-restore.mjs keeps a background tab's mute through a kill, a force-stop and a reboot, 3/3 — cost if wrong: a background tab's mute could be lost after a restart; not proven that tab was frozen.
- Final: Ruling: A2 gate rerun passed on the review-fixed build before the merge of chromium/migration (candidate 0dd92ce5…); suite Robolectric 268, fork 195 — a further gate runs on the merged base.

## Fixed in the final review

- moving one tab between groups took its whole group (Important 1) — tab-store.mjs case RED→GREEN on the emulator.
- /group on a grouped tab crashed Blanc (Important 2) — tab-store.mjs case RED→GREEN.
- /group in a private tab crashed Blanc (Important 3) — BlancTabsTest.aPrivateTabIsNeverGrouped and tab-store.mjs RED→GREEN.
- Undo after Chromium committed the close (Important 4) — BlancTabsTest two cases RED→GREEN; the tab reopens by address, losing its group.
- the grid's stale timer ending a newer Undo (Important 5) — TabGridTest.aClosedGridsTimerLeavesANewerUndoAlone RED→GREEN.
- a cold-start link losing to the saved active tab (Important 6) — BlancTabStateTest.aLinkFromAnotherAppStaysInFront, RED shown by removing the fix; tab-store.mjs case.
- find staying on the old page (Important 7) — find.mjs case RED→GREEN; private style FindCapsuleTest.
- group headers' TalkBack text (Important 9) — TabGridTest and PaletteSheetTest RED→GREEN.
- ungroup reversing order (Important 10) — BlancTabsTest.ungroupKeepsTheGroupsOrder and tab-store.mjs RED→GREEN.

## Deferred minors

- blanc.group_pins and group colors never pruned; isPinned rereads prefs per tab.
- no Robolectric test models Chromium's pinned-tabs-can't-be-grouped rule.
- Island swipe and grid order grouped pins differently.
- a group close is several Chromium closures.
- BlancTabs' timers outlive the activity.
- BlancTabKeeper.mQuieted keeps closed tabs.
- a surrogate pair split at 40 units differs from the iPhone.
- closing the last normal tab from private mode leaves private mode.
- "no longer holds a renderer" and "does not reload" acceptance steps could pass without a positive control.
