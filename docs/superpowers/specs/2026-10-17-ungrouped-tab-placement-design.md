# Ungrouped tabs anywhere — placing loose tabs above and between groups

**Date:** 2026-10-17
**Status:** draft for the owner's review. The four behavior decisions in §3 are the owner's, made on 2026-10-17. Nothing is built.
**Builds on:** [2026-10-07 drag reorder](2026-10-07-drag-reorder-tabs-groups-design.md) (`tabs:move`, `groups:reorder`, the ⌥⇧↑/↓ rule), [2026-10-16 Island lower section](2026-10-16-island-lower-section-design.md) (the Recently closed band and `closedSlot`).
**Reverses:** the 2026-10-16 spec's anti-goal "Ungrouped tabs appearing between groups" and its §4.1 rule "Ungrouped tabs never sit between bands". The owner changed this on 2026-10-17.

## 1. Why

While hand-testing link children (PR #928), the owner wanted the new tab near the top of the ⌘L panel. A new tab joins the ungrouped tabs, and those always sit below every group. The owner chose to keep that default and let people place ungrouped tabs themselves: above groups, between them, or below them, one tab at a time.

## 2. Goals and non-goals

**Goals**

1. Any unpinned, ungrouped tab can be dragged (or moved with ⌥⇧↑/↓) to any position in the list: above the first group, between two groups, or below the last.
2. Nothing moves until someone moves it. Existing windows, sessions and Spaces look exactly as they do today on first launch.
3. The ⌘L panel, the vertical tab rail, ⌘1–9, ⌥⌘↑/↓ and the Island's dots all agree on one order.

**Non-goals**

- Where new tabs go. ⌘T, `/new`, the panel's New tab button, link children (#928), gesture new tabs and imported tabs still land at the bottom of the list.
- Pinned tabs. Ungrouped pins stay in the Pinned shelf at the top, and grouped pins still lead their group. Pinned tabs can't be placed between groups.
- The Other devices drawer. It keeps showing another device's tabs in its current order (groups, then ungrouped).
- Tab sync. The data a device publishes is unchanged.

## 3. The owner's decisions (2026-10-17)

1. **Each run is its own section.** A run is a set of ungrouped tabs sitting next to each other, with no group between them. If ungrouped tabs sit above, between and below groups, each run counts separately. For example, with tabs A and B above "Work", tab C between "Work" and "Arc basics", and tab D at the bottom, the runs are A+B, C and D.
2. **⌘1–9 numbers every section from top to bottom.** That covers the Pinned shelf (as today), each group and each run. Recently closed is still never numbered.
3. **A new group appears where its tab was.** `/group <new name>` and Move to Group → New Group… create the group in the tab's current place, instead of at the bottom. For a tab that was already in a group, the new group goes directly below the group the tab left.
4. **Recently closed can go anywhere in the list**, including between two ungrouped tabs.

## 4. Model

**The window's `tabOrder` becomes the display order.** Today group order lives in `groups[]`, and the panel draws ungrouped tabs after all groups (`clusterList()` in main.js, `clusterTabs()` in overlay.js). Instead:

- Each group's members are **contiguous** in `tabOrder`, and its pins lead it, as today.
- Ungrouped, unpinned tabs may sit anywhere between groups.
- `groups[]` is always rewritten to match the order in which the groups appear in `tabOrder`. This keeps every reader of `groups[]` correct, including an older Blanc after a rollback. An older build would draw the same groups in the same order, with ungrouped tabs back at the bottom.
- Ungrouped pins may sit anywhere in `tabOrder`; they are drawn in the Pinned shelf regardless.

One pure helper (in `tab-order.js`, no Electron) turns `tabOrder` and the tabs into the list of top-level **sections**: each group, and each run. The panel, rail, ⌘1–9, ⌥⌘↑/↓ and the dots all use it, which replaces today's duplicated cluster code ("Keep in sync with main.js").

**Upgrading.** When a window's tabs are loaded (session restore, opening a Space, reopening a closed group), the order is first normalized to today's look: groups in `groups[]` order, each group's members in their current relative order, then the ungrouped tabs. The first launch after the update therefore looks identical.

**Saved files.** No format change. `session.json`, Spaces and `syncSnapshot` already save `tabOrder` with a group per tab (`urls` with the parallel `groupIds`). Only the Recently closed position needs a new field (§6).

## 5. Behavior

### 5.1 Dragging (panel and rail)

- Every gap between two top-level items is a drop target for an unpinned tab: above the first group, between groups, below the last group, and between tabs of a run. Dropping there makes the tab ungrouped at that position.
- Dropping onto a group (its rows or its header) works as today: the tab joins the group.
- Dragging a group header moves the group as a whole. Runs stay where they are relative to the other items. A group can be dropped above, between or below runs.
- The single "loose" drop zone at the bottom (`dragEmptyZone('loose')`) goes away. The gap below the last item replaces it.
- `tabs:move(id, { groupId: null, beforeId })` now accepts a `beforeId` that is the first tab of a group, meaning "ungrouped, just above that group". `beforeId: null` with `groupId: null` still means the bottom of the list. The bridge contract (`browser-api/contract.json`) and its test vectors change with it.

### 5.2 Keyboard (⌥⇧↑/↓)

The rule in the drag-reorder spec still holds, with one change: every gap between top-level items becomes an eligible slot for an unpinned tab. Moving down from the last tab of a group puts the tab in the gap directly below that group, ungrouped. The next press moves it into the following group (or past the next tab of a run). Collapsed groups are still skipped as places to land. Group headers still move one place at a time, now counting runs as places too.

### 5.3 Leaving a group

- **Remove from Group** on one tab: the tab lands directly below the group it left.
- **Ungroup** from a group header, or `/ungroup`: the members stay exactly where they were, now as a run.
- Closing a group and reopening it from Recently closed restores it at its old position.
- Move to Group (an existing group): the tab goes to the end of that group, as today.

### 5.4 The Island's dots

When the active tab is ungrouped, the dots show its run, not every ungrouped tab. Pins and the `+N` count work as today.

### 5.5 ⌘1–9 and ⌥⌘↑/↓

Both follow the section order of §3.2. A run remembers its last active tab for ⌥⌘↑/↓ the way a group does (`lastActiveByCluster`). Runs have no stable id, so a run is keyed by the id of the tab that heads it, and a missed lookup falls back to its first tab, as today.

### 5.6 The rail

The rail draws the same sections in the same order. A run has no heading in the panel; in the rail the single "Tabs" heading (`rail.section.tabs`) is dropped, and each run is drawn as plain tab rows between group headers. If that reads badly in review, the alternative is a quiet divider above each run, with no text.

## 6. Recently closed

Its position becomes an index in the list of top-level items: groups count as one item each, and each ungrouped tab counts as one. Today `closedSlot` counts only groups. It is saved as a new field, `closedIndex`, next to `closedSlot` in the window's session entry and in a Space's window entry. `closedSlot` keeps being written as the number of groups above the band, so a rollback still places it sensibly. `closed-slot.js` keeps the band next to its neighbor as items come and go, as it does for groups today.

## 7. What changes in the repo

- **Logic:** `tab-order.js` (sections helper, `moveTab`, `reorderGroup`), `closed-slot.js`, `main.js` (`clusterList`, `clusterSlots`, group create, ungroup, remove, close and reopen, normalization on load), `session-workspace.js` and `workspaces-model.js` (`closedIndex`).
- **Drawing:** `overlay.js` (render loop, drag sections), `tab-drag.js`, `vertical-tabs.js`, `renderer.js` (dots).
- **Bridge:** `browser-api/contract.json` and the generated vectors.
- **Records:** CLAUDE.md and AGENTS.md (Tab groups, Reopen Closed Tab), `spec/features.md` F3, the 2026-10-16 spec's anti-goal (marked reversed).
- **Copy:** no new strings are expected. If the rail gets a divider label, it goes into all six languages.

## 8. Verification

- **Unit:** the sections helper (runs, groups, pins, contiguity); `moveTab` into every gap; ⌥⇧↑/↓ across gaps and collapsed groups; normalization on load leaves today's look unchanged; `closedIndex` reconciliation and the `closedSlot` rollback mirror.
- **Desktop acceptance:** drag a tab above the first group and between two groups (panel and rail); ⌥⇧↓ out of a group into the gap; a new group appears in place; ⌘1–9 reaches a run; the dots show only the active run; Recently closed dropped between two ungrouped tabs survives a relaunch and a Space switch; ⌘T and a link child still land at the bottom.
- **Upgrade:** a session and a Space saved by v1.36.0 open with exactly today's order.
- **Existing drag scenarios** (F3-6 to F3-19) are updated where they assumed one ungrouped section.

## 9. Left to the builder

- Exact drop-gap hit areas and the drag indicator in the gaps, reusing the current drop line.
- Live-region wording for "Moved out of *group*" when a tab lands in a gap (the existing string should fit).
