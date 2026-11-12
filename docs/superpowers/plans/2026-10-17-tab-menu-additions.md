# Tab Menu Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add New Tab Below, Close Tabs Above, Close Tabs Below and Mute Site / Unmute Site to the tab right-click menu.

**Architecture:**
- The tab menu model (`tab-context-menu-model.js`) gains four items driven by new fields in `tabContextData`.
- Main gains `newTabBelow`, `closeTabsBeside` and an in-memory set of muted sites per profile and private-ness.
- Site mute folds into `tab-audio.js`, so every place that already applies `effectiveTabMuted` honors it.

**Tech Stack:** Electron main, plain JS, `node --test`, Cucumber + Playwright-Electron.

**Spec:** `docs/superpowers/specs/2026-10-17-tab-menu-additions-design.md` (decisions D1–D3 in §6). Builds on PR #933's display order.

## Global Constraints

- New Tab Below on a grouped tab opens inside the group, directly below (D1). A private source makes a private, ungrouped tab, because new private tabs are never grouped.
- Close Tabs Above/Below works across the window's display order and keeps pinned tabs. It makes one Recently closed batch entry, and selection stays on the right-clicked tab (D2).
- Mute Site lasts until Blanc quits and keys on the exact host (D3). Nothing is written to disk or synced. Private tabs keep their own set.
- Every new English string goes into all six languages in the same PR.
- Boundary-file edits need `npm run audit-inventory:write`.

## Review Focus

1. A tab on a muted site that the person unmutes with Mute Tab stays audible, and navigating it to another host clears that override (Task 3 test `per-tab unmute overrides the site until the host changes`).
2. Close Tabs Below on the last tab, or with only pinned tabs below, is disabled and does nothing (Task 2 test `nothing to close disables the item`).
3. New Tab Below on a shelf pin lands at the top of the list, never among the pins (Task 1 test `below a shelf pin lands after the pins`).
4. A private tab muting a site never mutes the same host in normal tabs (Task 3 test `private and normal tabs keep separate site mutes`).

---

### Task 1: New Tab Below

**Files:** `src/main/main.js` (`newTabBelow(tabId)`), `src/main/tab-context-menu-model.js`, `src/main/tab-context-menu.js`, `copy/messages/*.json`, `test/unit/tab-layout-main.test.js`, `test/unit/tab-context-menu-model.test.js`

**Interfaces:**
- Produces `newTabBelow(tabId) -> TabId | null`, and the menu item `new-tab-below` placed first in the "new tab" section.
- Placement rules:
  - an unpinned tab: directly after it;
  - a grouped pin: before the group's first unpinned member, or at the group's end;
  - a shelf pin: right after the ungrouped pins.

- [ ] Write failing tests:
  - `below a grouped tab joins the group`;
  - `below an ungrouped tab stays in its run`;
  - `below a shelf pin lands after the pins`;
  - `below a grouped pin lands at the top of the group's unpinned tabs`;
  - `the menu offers New Tab Below first in the new-tab section`.
- [ ] Implement, and add `tabMenu.newTabBelow` in all six languages.
- [ ] Run `npm run test:unit`. Expected: PASS. Commit.

### Task 2: Close Tabs Above / Below

**Files:** `src/main/main.js` (`closeTabsBeside(tabId, direction)` and `tabContextData.canCloseAbove` / `canCloseBelow`), `src/main/tab-context-menu-model.js` (`closableBeside({ tabOrder, tabsById, keepId, direction })`), `src/main/tab-context-menu.js`, `copy/messages/*.json`, tests

**Interfaces:**
- `closableBeside(...) -> TabId[]` returns the unpinned tabs before (above) or after (below) `keepId` in `tabOrder`.

- [ ] Write failing tests:
  - `closableBeside skips pins and the kept tab`;
  - `nothing to close disables the item`;
  - `the menu shows both items next to Close Other Tabs`.
- [ ] Implement, reusing `buildBatchEntry`, and add `tabMenu.closeAbove` and `tabMenu.closeBelow` in all six languages.
- [ ] Run `npm run test:unit`. Expected: PASS. Commit.

### Task 3: Mute Site

**Files:** `src/main/tab-audio.js` (`effectiveTabMuted` and the new `shownMuted`), `src/main/site-mute.js` (pure: `siteMuteKey(tab)`, `hostOf(url)`), `src/main/main.js` (`toggleSiteMute(tabId)`, the `onMainFrameCommit` recompute, `toggleTabMuted`, `serializeTabs`), the menu model and glue, `copy/messages/*.json`, tests

**Interfaces:**
- A tab gains `siteMuted` and `siteUnmuted` booleans, never persisted.
- `effectiveTabMuted(tab) = muted || backgroundAutoplayMuted || (siteMuted && !siteUnmuted)`.
- `shownMuted(tab) = muted || (siteMuted && !siteUnmuted)`; it drives the payload's `muted` and `audible`.
- The menu item `toggle-site-mute` reads Mute Site or Unmute Site, and is shown only for http(s) tabs.

- [ ] Write failing tests:
  - `per-tab unmute overrides the site until the host changes`;
  - `private and normal tabs keep separate site mutes`;
  - `Unmute Site clears every tab on the host`;
  - `the label follows the site's state`.
- [ ] Implement, and add `tabMenu.muteSite` and `tabMenu.unmuteSite` in all six languages.
- [ ] Run `npm run test:unit`. Expected: PASS. Commit.

### Task 4: Records and acceptance

- [ ] Add scenarios F2-9 to F2-11, after checking the next free F2 ids:
  - New Tab Below in a group;
  - Close Tabs Below, then ⌘⇧T restores them;
  - Mute Site mutes a second tab on the host and a tab opened there later, and nothing survives a relaunch.
- [ ] Update `spec/features.md` F2 and the CLAUDE.md and AGENTS.md tab-menu mentions, if any.
- [ ] Run every gate. Expected: all pass. Commit, push, and open the PR, stacked on the group colors PR.
