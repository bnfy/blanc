# Ungrouped Tab Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any unpinned, ungrouped tab sit above, between or below tab groups in the ⌘L panel and the rail, with `tabOrder` as the one display order.

**Architecture:** A pure, shared `src/renderer/tab-sections.js` (loaded by main, the strip and the overlay, like `space-identity.js`) turns an ordered tab list into sections (groups and runs) and top-level items (groups and single ungrouped tabs). Main normalizes `tabOrder` and `groups[]` from it before every payload and capture, the way `syncClosedSlot` already reconciles the Recently closed band. Group and band moves become moves in a list of items; the renderers draw and hit-test from the same helper.

**Tech Stack:** Electron main + sandboxed renderers, plain JS, `node --test`, Cucumber + Playwright-Electron.

**Spec:** `docs/superpowers/specs/2026-10-17-ungrouped-tab-placement-design.md`

## Global Constraints

- New tabs, link children, gesture and imported tabs still land at the end of `tabOrder` (the bottom).
- Ungrouped pins stay in the Pinned shelf; grouped pins lead their group; pinned tabs never enter gaps.
- First launch after the update looks exactly as before: legacy sessions and Spaces are normalized to groups-in-`groups[]`-order, then ungrouped tabs.
- An older Blanc reading new files sees the same groups in the same order with ungrouped tabs at the bottom (`groups[]` always matches `tabOrder`; `closedSlot` keeps meaning "groups above the band").
- Recently closed is never a ⌘1–9 target and does not split a run for sections (dots, ⌘1–9, ⌥⌘↑/↓); it only splits the drawing.
- No new user-visible strings are expected; any new string goes into all six languages with `copy:ack`.
- `browser-api/contract.json` changes with the preload/handlers; regenerate vectors with `npm run browser-api:build`.
- Boundary-file edits need `npm run audit-inventory:write`.

## Review Focus

1. A legacy session whose `tabOrder` interleaves ungrouped tabs among group members must open with ungrouped tabs at the bottom (Task 4 test `legacy order normalizes to groups then loose`).
2. A grouped tab created or reopened before its group's first member (duplicate, reopen, Arc import) must not drag the whole group upward (Task 3 test `placeInGroup keeps a member inside its block`).
3. Dragging the first tab of a group to the gap just above that group must ungroup it in place, not be rejected (Task 2 test `self-target into the gap above its own group`).
4. With Recently closed at the very bottom, a new tab lands above the band, not below it (Task 3 test `band at the end stays last`).
5. ⌥⇧↓ across a collapsed group must stop in the gaps on both sides of it, never inside it (Task 5 test `keyboard skips a collapsed group but keeps its gaps`).

---

### Task 1: Shared sections helper

**Files:**
- Create: `src/renderer/tab-sections.js`
- Modify: `src/main/chrome-protocol.js` (serve `/tab-sections.js` to `index` and `overlay`), `src/renderer/index.html`, `src/renderer/overlay.html` (script tag before `tab-drag.js`)
- Test: `test/unit/tab-sections.test.js`, `test/unit/chrome-protocol.test.js`

**Interfaces:**
- Produces (UMD: `module.exports` in Node, `window.TabSections` in documents). `list` is always `[{ id, groupId|null, pinned }]` in `tabOrder` order:
  - `sectionsOf(list) -> [{ key, groupId|null, tabIds }]`. Skips ungrouped pins. A group section sits where its first member appears and holds all members, pins first. Consecutive ungrouped unpinned tabs form a run, `key = 'run:' + firstTabId`; a group's key is its id.
  - `normalizeOrder(list) -> id[]`: ungrouped pins first (relative order kept), then `sectionsOf` flattened. Idempotent.
  - `itemsOf(list) -> [{ id, groupId|null }]`: one item per group (id = group id) and one per ungrouped unpinned tab (id = tab id), in display order.
  - `layoutItems(itemIds, list) -> id[]`: ungrouped pins, then each item expanded (a group id to its members, pins first). Unknown ids are ignored and items missing from `itemIds` keep their relative order at the end.
  - `legacyOrder(list, groupIds) -> id[]`: ungrouped pins, then groups in `groupIds` order, then any other groups by first appearance, then ungrouped tabs.
  - `firstTabOf(sections, groupId) -> id|null`.

- [ ] **Step 1: Write failing tests** in `test/unit/tab-sections.test.js`: `sectionsOf splits runs around groups` (`[L1,L2,G1a,L3,G2a,L4]` gives keys `run:L1, g1, run:L3, g2, run:L4`); `group sits at its first member and collects scattered members` (`[G1a,L1,G1b]` gives `g1:[G1a,G1b]`, `run:L1`); `grouped pins lead`; `ungrouped pins are not sections`; `normalizeOrder is idempotent and puts ungrouped pins first`; `itemsOf lists groups once and loose tabs singly`; `layoutItems round-trips itemsOf`; `legacyOrder puts groups in groups[] order then loose`.
- [ ] **Step 2: Run** `node --test test/unit/tab-sections.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `src/renderer/tab-sections.js` in the `space-identity.js` UMD shape; serve it from `chrome-protocol.js` for both documents and add the script tags.
- [ ] **Step 4: Run** `node --test test/unit/tab-sections.test.js test/unit/chrome-protocol.test.js`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 2: Move rules for loose tabs anywhere

**Files:**
- Modify: `src/main/tab-order.js`
- Test: `test/unit/tab-order.test.js`

**Interfaces:**
- Consumes: `normalizeOrder`, `sectionsOf` (Task 1).
- Produces: `moveTab(order, tabs, groups, id, target)` keeps its signature. For an **unpinned** tab with `target.groupId === null`:
  - `beforeId === null` → append to the end of `order`.
  - `beforeId` an ungrouped unpinned tab, or the display-first member of a group section → insert before it.
  - `beforeId === id` → order unchanged, `groupId: null` (ungroup in place).
  - any other `beforeId` → `null`.
  - Pinned tabs and group targets keep today's rules.
- Produces: `reorderItems(itemIds, slot, id, beforeId) -> { order, slot } | null`, a thin wrapper over `closed-slot.js`'s `reorderGroupsWithClosed` that accepts any item ids (group ids, loose tab ids, `'recently-closed'`).

- [ ] **Step 1: Write failing tests**: `loose tab dropped above a group`, `loose tab dropped between two groups`, `null beforeId appends to the end`, `self-target into the gap above its own group`, `beforeId in the middle of a group is rejected for a loose target`, `pinned rules unchanged` (keep the existing pinned tests green), `reorderItems moves a group between two loose tabs`.
- [ ] **Step 2: Run** `node --test test/unit/tab-order.test.js`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the loose branch in `moveTab` and `reorderItems`.
- [ ] **Step 4: Run** the same command plus `test/unit/closed-slot.test.js`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 3: Main keeps one order

**Files:**
- Modify: `src/main/main.js` (`clusterList`, `clusterSlots`, `clusterKeyForTab`, `syncClosedSlot`, `groupTabByName`, `setTabGroup`, `ungroupGroup`, `closeGroup`, `reopenGroupEntry`, `finishReopen`, `reorderGroupBefore`, `moveClosedSection`, `moveTabTo`, `currentTabsPayload`)
- Modify: `src/main/closed-tabs.js` (`buildGroupEntry` records `itemIndex`)
- Test: `test/unit/closed-slot-main.test.js`, new `test/unit/tab-layout-main.test.js` (source-lifted like `closed-slot-main.test.js`), `test/unit/closed-tabs.test.js`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `syncTabLayout(runtime)` replaces `syncClosedSlot(runtime)` at all its call sites. It runs `normalizeOrder` on `runtime.tabOrder`, reorders `runtime.groups` to section order (dropping nothing; `pruneEmptyGroups` still owns removal), then reconciles the band.
  - `runtime.closedSlot` now means **item index** (number of top-level items above the band); `runtime.closedSlotIds` holds item ids. `reconcileClosedSlot` and `clampClosedSlot` are reused unchanged with item ids.
  - `placeInGroup(order, list, id, groupId) -> id[]` in `tab-sections.js` (add to Task 1's module and tests): moves `id` to just after the last member of `groupId`; if `groupId` has no other member, leaves it in place.
  - `clusterList()` and `clusterSlots()` come from `sectionsOf`; a run's slot key is its section key.
- Rules:
  - `groupTabByName` / `setTabGroup` into an **existing** group: `placeInGroup`. Into a **new** group: the tab stays in place, unless it is leaving another group, then it moves to just below that group.
  - Remove from Group (setTabGroup to null): the tab moves to just below the group it left.
  - `ungroupGroup`: members stay in place.
  - `finishReopen`: after the index splice, a tab with a live group goes through `placeInGroup`.
  - `closeGroup` records the group's item index; `reopenGroupEntry` creates members, then moves their block before the item now at that index (`layoutItems`).
  - `reorderGroupBefore(id, beforeId)` and `moveClosedSection(beforeId)` use `reorderItems` on the item list with the band inserted at `closedSlot`, then `layoutItems`. `beforeId` may be a group id, a loose tab id, the band id, or null.

- [ ] **Step 1: Write failing tests**: `placeInGroup keeps a member inside its block`; `new group appears where its tab was`; `new group from a grouped tab appears below the old group`; `remove from group lands below the group`; `ungroup keeps members in place`; `group reopens at its item index`; `band at the end stays last`; `band item index survives a loose tab closing above it`; `run slot key follows its first tab`.
- [ ] **Step 2: Run** `node --test test/unit/tab-layout-main.test.js test/unit/closed-slot-main.test.js`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the rules above.
- [ ] **Step 4: Run** `npm run test:unit`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 4: Saving and loading the order

**Files:**
- Modify: `src/main/main.js` (`captureWindowEntry`, session restore near `releaseStartup`, workspace apply), `src/main/session-workspace.js`, `src/main/workspaces-model.js`
- Test: `test/unit/session-workspace.test.js`, `test/unit/workspaces-model.test.js`, `test/unit/tab-layout-main.test.js`

**Interfaces:**
- Saved window entries (session and Space) gain `sectionOrder: true` and `closedIndex: <item index>` (written only when > 0). `closedSlot` keeps being written as the number of persisted groups above the band.
- On load: without `sectionOrder`, the created tabs are reordered with `legacyOrder(list, savedGroupIds)`; with it, the saved order is kept. `closedSlot` at runtime = `closedIndex ?? closedSlot ?? 0`, clamped to the item count.

- [ ] **Step 1: Write failing tests**: `legacy order normalizes to groups then loose`; `sectionOrder keeps loose tabs between groups`; `closedIndex round-trips`; `closedSlot mirror counts groups above the band`; `sanitizers keep sectionOrder and closedIndex`.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:unit`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 5: Drawing and dragging

**Files:**
- Modify: `src/renderer/overlay.js` (`clusterTabs` → `sectionsOf`; the render loop draws items in order with the band at `closedSlot` and one `dragSection('loose')` per stretch of loose rows; group sections carry `data-first-tab-id`), `src/renderer/vertical-tabs.js` (same order, each run as a `loose` section with its own "tabs" heading and count, an empty `loose` zone after a last group), `src/renderer/renderer.js` (`islandTabPresentation`: an ungrouped active tab's section is its run), `src/renderer/tab-drag.js` (`closedSlotIndex` clamps to the item count; `tabSlots` adds an unpinned gap slot above every group section with `unpinnedBefore = firstTabId` and one after the last section with `null`, and a loose section's end slot uses the next section's first tab; `resolveGroupDrop` treats every loose row as an item; `eligibleBuckets` and `keyboardTabMove` use sections, with empty gap buckets carrying `endBefore`; `keyboardGroupMove` steps over a whole run at a time)
- Test: `test/unit/tab-drag.test.js`, `test/unit/vertical-tabs*.test.js` and overlay vm tests that assert the loose section or its heading

**Interfaces:**
- Consumes: `TabSections` (Task 1); main accepts the intents from Tasks 2–3.
- Produces: tab intents `{ kind:'tab', id, groupId:null, beforeId }` where `beforeId` is a loose tab, a group's first tab or null; group/band intents `{ kind:'group', id, beforeGroupId }` where `beforeGroupId` may be a loose tab id.

- [ ] **Step 1: Write failing tests** in `tab-drag.test.js`: `drop above the first group is loose`; `drop between two groups is loose with the next group's first tab`; `drop below the last group appends`; `header top quarter targets the gap, middle joins`; `keyboard down from a group's last tab stops in the gap below`; `keyboard skips a collapsed group but keeps its gaps`; `group keyboard move steps over a whole run`; `group drop between two loose tabs`.
- [ ] **Step 2: Run** `node --test test/unit/tab-drag.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the renderer changes.
- [ ] **Step 4: Run** `npm run test:unit`. Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 6: Contract, records and acceptance

**Files:**
- Modify: `browser-api/contract.json` (`TabMoveTarget.beforeId` doc, `reorderGroup`/`moveClosedSection` param types `GroupId | TabId | 'recently-closed' | null`, payload `closedSlot` doc: items above the band), regenerate vectors
- Modify: `CLAUDE.md`, `AGENTS.md` (Tab groups, Reopen Closed Tab), `spec/features.md` (F3), `docs/superpowers/specs/2026-10-16-island-lower-section-design.md` (mark the anti-goal and §4.1 reversed, pointing here)
- Modify: `spec/acceptance/tabs-and-groups.feature`, `test/desktop/steps/*`, `test/desktop/cucumber.mjs`
- Test: new scenarios F3-22 to F3-27

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write scenarios**: F3-22 drag a loose tab above the first group (panel); F3-23 drag a loose tab between two groups (rail); F3-24 ⌥⇧↓ from a group's last tab ungroups it into the gap below; F3-25 a new group appears where its tab was; F3-26 ⌘1–9 reaches a run between groups, and the dots show only that run; F3-27 Recently closed dropped between two loose tabs survives a relaunch. Update older drag scenarios that assumed one loose section.
- [ ] **Step 2: Run** `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F3"` outside the sandbox. Expected: PASS.
- [ ] **Step 3: Update** the contract and records; run `npm run browser-api:build`.
- [ ] **Step 4: Run gates**: `npm run lint`, `npm run substrate:check`, `npm run browser-api:check`, `npm run audit-inventory:write` then `:check`, `npm run test:unit`, `npm run test:acceptance:dry`, `npm run test:acceptance:desktop`. Expected: all pass.
- [ ] **Step 5: Commit, push, open the PR.**
