# A2 spike: Blanc's tabs on Chromium's tab model

A2 Task 1 (`docs/superpowers/plans/2026-11-04-android-a2-tabs.md`), run on
2026-11-04 on the Android 16 emulator with the A1 build (Chrome stable for
Android 156.0.8078.79). A throwaway probe behind the Island's tabs button
grouped, pinned and muted tabs, then logged Chromium's tab model; nothing
from it is kept. Evidence on the build server:
`~/blanc-evidence/android/a2-spike-*`.

## What Chromium already does

Four normal tabs and one private tab; the probe put two tabs in a group named
"Probe Group" (color 3, folded), pinned a third tab and muted it. Then the app
was sent to the background and killed (`adb shell am kill`), relaunched, then
force-stopped and relaunched.

| State | After a background kill | After a force-stop |
| --- | --- | --- |
| Tabs and their order | Kept | Kept |
| Group name, color, folded | Kept | Kept |
| Pin (Chromium moves a pinned tab to the front) | Kept | Kept |
| Mute | **Lost** | **Lost** |
| Active tab | **Lost** (the first tab is selected) | **Lost** |
| Private tab | **Kept** | Gone |

## Decisions

1. **Groups: Chromium's.** `TabModel` has groups with a title, a color
   (`TabGroupColorId`) and a folded state (`createSingleTabGroup`,
   `mergeTabsToGroup`, `setTabGroupTitle`, `setTabGroupColor`,
   `setTabGroupCollapsed`, `getTabsInGroup`, `getAllTabGroupIds`), and
   restores all of them. Blanc keeps its eight preset colors beside them in
   its own preferences, keyed by the group's token, and sets the nearest
   Chromium color as well. Blanc's rules (names compared without case, no
   empty groups) sit in `BlancTabs` above this.
2. **Pins: Chromium's** (`TabModel.pinTab`/`unpinTab`, `Tab.getIsPinned`).
   Chromium moves pinned tabs to the front of the list, which matches the
   iPhone's "ungrouped pins lead".
3. **Mute: Chromium's switch, Blanc's memory.** `WebContents.setAudioMuted`
   mutes; Chromium forgets it on restore, so `BlancTabState` (Task 7) saves
   and reapplies it.
4. **Private tabs: their own section.** Chromium keeps private tabs in their
   own model. The tab grid and palette show them as a section after the
   normal tabs, and the Island's swipe stays within the current model (A1).
   The iPhone mixes them in one list; a D-row records the difference.
5. **Process death: Blanc fixes two things.** Chromium restores the tabs,
   order, groups and pins. Blanc saves and restores the **active tab**, and
   closes **private tabs on a cold start**, so a private tab never comes back
   after Android kills the app, as on the iPhone (Review Focus 1). Both are
   Task 7.
6. **Quiet Tabs: Blanc's sweep calls `Tab.discard()`.** Chromium has the call
   (a discarded tab keeps its title, address and back history, and reloads
   when selected) but no policy that discards background tabs on a phone. Task
   7 adds desktop's rules: background tabs idle for an hour, never the active
   tab, a tab playing audio, a tab using the camera or microphone, or a tab
   with unsaved form input.
7. **Pull to refresh: Chromium's, off on the Start Page.** Chromium's
   `SwipeRefreshHandler` still works with the toolbar hidden: pulling a web
   page down reloads it. It also reloads Blanc's Start Page, which the
   iPhone never does, so Task 7 turns it off for `chrome://blanc/` pages.
8. **Find: `FindInPageBridge`** (`components/find_in_page`), with
   `startFinding(text, forward, caseSensitive)` and `stopFinding(clear)`,
   driven by Blanc's capsule; Chrome's `FindToolbar` stays unused.
9. **Thumbnails: Chromium's `TabContentManager`**, which already captures
   tabs for Chrome's own switcher. The tab grid asks it for each card's
   image; a tab with no capture yet shows its site's icon on the theme surface.

## Plan changes

- Task 7 gains two items: closing private tabs on a cold start, and turning
  pull to refresh off on Blanc's pages. Its interfaces are unchanged.
- No other task's interfaces change.
