# Tab menu additions: New Tab Below, Close Tabs Above/Below, Mute Site

**Date:** 2026-10-17
**Status:** the owner decided D1–D3 on 2026-10-17 (§6) and asked for it to be built; implementation plan in `docs/superpowers/plans/2026-10-17-tab-menu-additions.md`.
**Builds on:** [2026-10-17 ungrouped tab placement](2026-10-17-ungrouped-tab-placement-design.md) (PR #933: a window's tab order is its display order).
**Reference:** Helium's tab right-click menu, shared by the owner on 2026-10-17. Of its items, Blanc lacks only these four. Blanc already has the rest: Glance is the split view, Quiet is Hibernate, and Move to Group ▸ New Group… covers Add Tab to New Group.

## 1. Where they go

The tab menu is `src/main/tab-context-menu-model.js`, shared by the resting pill, the ⌘L panel and the side list.
- **New Tab Below** goes first in the "new tab" section, above New Tab and New Private Tab.
- **Close Tabs Above** and **Close Tabs Below** sit next to Close Other Tabs.
- **Mute Site** sits under Mute Tab. When the site is already muted, it reads **Unmute Site**.

None of them gets a keyboard shortcut.

## 2. New Tab Below

Opens a blank new tab directly under the right-clicked tab, and selects it.
- **A tab in a group:** the new tab joins that group, directly below.
- **An ungrouped tab:** the new tab sits directly below, in the same run.
- **A pinned tab:** it opens as the first tab right after the pins: at the top of the ungrouped tabs for a shelf pin, or at the top of the group's unpinned tabs for a grouped pin. It is never pinned.
- **A private tab:** the new tab is private, like other children of a private tab.

This differs on purpose from ⌘T, which always opens an ungrouped tab at the bottom: here the person asked for a specific place.

## 3. Close Tabs Above / Close Tabs Below

Closes every tab drawn above, or below, the right-clicked tab in the window's order, across groups.
- Pinned tabs are never closed, as with Close Other Tabs.
- One action makes one Recently closed entry, using the batch entry Close Other Tabs already uses. ⌘⇧T brings the whole set back.
- The item is disabled when there's nothing above, or nothing below, to close. This is the state the Helium screenshot shows greyed out.
- Selection stays on the right-clicked tab.

## 4. Mute Site

Mutes every tab on the right-clicked tab's site, including tabs opened there later, **until Blanc quits**. A site mute is a temporary hush, not a saved preference (D3).
- **Site** means the exact host, such as `www.youtube.com`, the same key the shield popover's per-site switches use. `music.youtube.com` is a different site.
- Nothing is written to disk or synced. The muted hosts live in memory per profile, and private tabs keep their own set.
- Mute Tab stays per tab. A tab on a muted site shows as muted. Unmuting that one tab from Mute Tab overrides the site for that tab only.
- **Unmute Site** in the same menu clears it. There's no Settings list, because the mute ends when Blanc quits.

## 5. Copy, tests and parity

**New strings**, in all six languages in the same PR:
- New Tab Below
- Close Tabs Above
- Close Tabs Below
- Mute Site
- Unmute Site

**Unit tests:**
- the menu model's placement, enabled rules and the Mute Site / Unmute Site label;
- where New Tab Below lands for each case in §2;
- which tabs Close Tabs Above/Below closes, with pins kept and one batch entry;
- the in-memory muted-site set, including a separate set for private tabs.

**Desktop acceptance:**
- New Tab Below in a group;
- Close Tabs Below, then ⌘⇧T restores all of them;
- Mute Site mutes a second tab on the same host and a tab opened there later;
- a muted site is unmuted after a relaunch.

**Parity:** `spec/features.md` (F2 tabs) gains the four items.

## 6. The owner's decisions (2026-10-17)

- **D1. New Tab Below on a grouped tab:** inside the group, directly below.
- **D2. Close Tabs Above/Below:** the whole window's list, across groups, with pinned tabs kept; one Recently closed entry.
- **D3. Mute Site:** temporary, until Blanc quits; the site is the exact host.
