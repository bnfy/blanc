# Split View PR 1 (two-pane splits that stay) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Glance into a two-pane split that stays open: it shows as one row in the tab list, survives relaunch and Spaces, and can be removed, dissolved, or closed and reopened whole.

**Architecture:**
- **Pure modules:** `split-model.js` (state transitions, group rule, ordering, persistence shapes) and `split-layout.js` (the full §3.2 schema and fallback table, header bands, dividers) hold every decision, in the style of `glance-layout.js` and `closed-tabs.js`.
- **Focused pane = active tab:** in `main.js`, the focused pane is always the runtime's `activeTabId`. Moving focus within a split is a `setActiveTab` that keeps the other pane attached, so the Island, commands, shortcuts and Glance's "commands follow focus" all work unchanged.
- **Headers:** pane headers are drawn by the chrome document (`index.html`) in bands reserved in each pane's geometry (spec D5).

**Tech Stack:** Electron main process (CommonJS), `node --test`, Cucumber + Playwright-Electron via `src/main/test-hook.js`, the copy, settings and browser-api substrates.

**Spec:** `docs/superpowers/specs/2026-10-19-split-view-design.md` (D1–D8). Chrome source of truth: `docs/design-reviews/split-view-chrome-2026-10-19/mockups.html`, direction A.

## Global Constraints

- **Scope:** two panes only. Data shapes and `split-layout.js` support 2–4 panes, but every UI entry point refuses a third pane until PR 2. Add to Split, three columns, the grid, keyboard pane focus (D6) and Quick Switcher pane matches are PR 2/3.
- **Saved layout shape:**
  - `{ kind: 'columns', widths: number[] }`: 2–3 panes; each width ≥ 0.2; sums to 1.
  - `{ kind: 'grid', column, row }`: 4 panes; each value in 0.25–0.75.
  - A malformed layout resets to equal columns or a centered cross.
- **Fallback order:**
  - 2 panes: columns → rows → focus only.
  - 3 panes: columns → rows → focus only.
  - 4 panes: grid → four columns → four rows → focus only.
  - Fallbacks are never saved.
- **Measurements:** `paneMinWidth` is the measured header floor (300 default); `paneMinHeight` = 30 + 160; the divider is 12 (`glance-layout.js` `DIVIDER_SIZE`).
- **Header bands:** `SPLIT_HEADER_HEIGHT = 30` at the top of every pane. In focus only, every non-focused pane collapses to its header band.
- **Group rule:**
  - The initiating tab's group wins: Keep as split → the Glance main page; Split with ▸ → the right-clicked tab.
  - Other tabs move into that group, or out of their group.
  - The split row takes the initiating tab's place in the order.
- **Pinned tabs:**
  - Never join a split.
  - Pinning a split tab removes it from the split first (D7).
  - Keep as split and Split with ▸ are disabled when either tab is pinned, with a tooltip.
- **Leaving a split (D8):** a tab that leaves lands directly below the split's row. A split left with one tab dissolves in place.
- **Private tabs:** may join a split. They are never persisted; a split with fewer than two persisted tabs is saved as plain tabs.
- **Glance coexistence:** Glance and a visible split never coexist. While a split is showing, Open Glance (menu, ⌘⇧G, `/glance`, Open Link in Glance) is disabled and says why. "Add to Split" replaces it in PR 2.
- **Never quiet, never archived:** visible panes are never quiet. Split tabs are never archived.
- **Copy:**
  - Every new string goes into `copy/messages/en.json` plus `de`, `es`, `fr`, `pt-BR` and `it` in the same task, acknowledged with `npm run copy:ack`.
  - User-facing words: **Split View**, **split**, **Keep as split**, **Split with**, **Remove from Split**, **Close Split**.
  - Pane region name: "{title}, pane {n} of {m}". Split row name: "Split: {titles}".
  - Row label: "{a} + {b}", and "{a} + {count} more" from three panes.
- **Boundary files:** after editing them (`main.js`, `preload.js`, `tab-preload.js`, `pages.js`, …), run `npm run audit-inventory:write`. Change the preload, `browser-api/contract.json` and the vectors together (`npm run browser-api:build`).
- **No website or roadmap claims** until a public release ships it.

## Review Focus

1. **Closing the focused pane:** the other pane must become the active, full-window tab (dissolve) with no blank window. Test in Task 6.
2. **Restore with a dropped member:** a saved split whose member URL `filterRestoredSession` drops (a utility page or a forbidden URL) must restore as one plain tab, never a one-pane split, and never misalign `splitIds`. Test in Task 9.
3. **A split crossing a group boundary:** a split built from tabs in two different groups, where one group is emptied, must leave `tabOrder` contiguous and `syncTabLayout` stable on the next pass, with no oscillation. Test in Task 2.
4. **Switching away and back:** selecting a non-split tab must detach both panes, and selecting either split tab must reattach both in their saved order, with the clicked pane focused. Test in Task 5.
5. **Close Split reopened after a member was quieted:** both tabs come back, in order, as a split, with the saved layout. Test in Task 6.

---

### Task 1: Ratify F53 in `spec/`

**Files:**
- Modify: `spec/features.md` (append `## F53 — Split View (desktop)` after F52)
- Modify: `spec/parity-matrix.md` (F53 row: desktop `PLANNED`, iOS `N/A`, Android `N/A`, D11)
- Modify: `spec/features.md` F34 (one sentence: Glance can become a split via Keep as split)
- Create: `spec/acceptance/split-view.feature` (scenarios `@F53-1`…`@F53-12` named as in Tasks 5–9; not added to `RUNNABLE` until their task)

- [ ] **Step 1:** Write F53 from spec §2–§7 in the F34/F52 style, with D1–D8.
- [ ] **Step 2:** Run `npm run test:acceptance:dry` and `node --test test/unit/public-truth.test.js test/unit/workspace-test-coverage.test.js`. Expected: PASS.
- [ ] **Step 3:** Commit: `spec: ratify F53 Split View`.

### Task 2: `split-model.js`

**Files:**
- Create: `src/main/split-model.js` (no `require('electron')`)
- Test: `test/unit/split-model.test.js`

**Interfaces (Produces):**
- `MAX_SPLIT_PANES = 4`, `PR1_MAX_PANES = 2`
- `newSplitId() -> string` (`split-<n>`)
- `splitEligible(tab) -> boolean`: not pinned, not already in a split, has an id
- `createSplit({ initiator, others, layout? }) -> { split, groupId }`
  - `split = { id, tabIds: [initiator.id, ...others.map(o => o.id)], layout, focusedIndex: 0 }`
  - `groupId` is `initiator.groupId ?? null` (the group every member must take)
- `removeFromSplit(split, tabId) -> { split: Split | null, dissolved: string[] }`: removes the tab; when one tab would remain, returns `split: null` and `dissolved: [lastId]`
- `placeAfterSplit(order, splitTabIds, tabId) -> string[]`: the tab id moved directly after the split's last member (D8)
- `normalizeSplitOrder(order, splits) -> string[]`: each split's members contiguous, at the first member's position, in `tabIds` order
- `splitForTab(splits, tabId) -> Split | null`
- `captureSplits(splits, persistedTabIds: string[]) -> { splits: SavedSplit[], splitIds: (string|null)[] }`
  - `SavedSplit = {id, layout, focusedIndex}`
  - `splitIds` is parallel to `persistedTabIds`
  - A split with fewer than two persisted members is dropped, and its ids become null.
- `restoreSplits(savedSplits, splitIds, restoredTabIds) -> Split[]`
  - Rebuilds `tabIds` from `splitIds`, skipping null restored ids.
  - Drops splits with fewer than two members.
  - Normalizes the layout and clamps `focusedIndex`.

**Consumes:** `normalizeSplitLayout` from Task 3.

- [ ] **Step 1: Write the failing tests:**
  - `createSplit takes the initiator's group for every member`: cases grouped+ungrouped, ungrouped+grouped, two different groups, same group → `groupId` equals the initiator's.
  - `splitEligible refuses pinned and already-split tabs`.
  - `removeFromSplit of a two-pane split dissolves and names the survivor`.
  - `placeAfterSplit lands the tab directly below the split`, with the order `[x, s1, s2, y]`.
  - `normalizeSplitOrder makes members contiguous at the first member and is idempotent`: running it twice gives the same order.
  - `normalizeSplitOrder is stable when a group emptied by the split disappears` (Review Focus 3).
  - `captureSplits drops a split with a private member, writing null splitIds`.
  - `restoreSplits rebuilds from splitIds and drops a split whose member was filtered out` (Review Focus 2).
  - `restoreSplits clamps focusedIndex and normalizes a malformed layout`.
- [ ] **Step 2:** Run `node --test test/unit/split-model.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test again. Expected: PASS.
- [ ] **Step 5:** Commit: `Split View: pure split model`.

### Task 3: `split-layout.js`

**Files:**
- Create: `src/main/split-layout.js` (no Electron; reuses `DIVIDER_SIZE` and `normalizedPageBounds` from `glance-layout.js`)
- Test: `test/unit/split-layout.test.js`

**Interfaces (Produces):**
- `SPLIT_HEADER_HEIGHT = 30`, `PANE_MIN_CONTENT_HEIGHT = 160`, `DEFAULT_PANE_MIN_WIDTH = 300`
- `normalizeSplitLayout(layout, paneCount) -> Layout`: the §3.2 schema rules
- `computeSplitLayout(pageBounds, layout, paneCount, { paneMinWidth, focusedIndex }) -> { mode: 'columns'|'rows'|'grid'|'focus', panes: [{ header: Rect, content: Rect }], dividers: [{ index, axis: 'x'|'y', rect: Rect, saved: boolean }] }`
  - Panes are listed in pane order. In `'focus'` mode, the focused pane's content fills the region below the other panes' stacked header bands.
- `layoutForDivider(pageBounds, layout, paneCount, divider: {index, axis}, point, mins) -> Layout | null`: a new saved layout, or null when the move is out of range or the layout is a fallback

- [ ] **Step 1: Write the failing tests:**
  - `normalize: columns widths below 0.2 or not summing to 1 reset to equal`.
  - `normalize: grid values clamp to 0.25–0.75`.
  - `normalize: wrong kind for the pane count resets to the default`.
  - `two panes: saved columns when width ≥ 2×min+12; rows below that; focus only when rows don't fit`, with exact breakpoint values at the boundary ±1 px.
  - `three panes: columns → rows → focus only`, at the breakpoints.
  - `four panes: grid → four columns → four rows → focus only`, at the breakpoints.
  - `every pane has a 30 px header band at its top and content below it`.
  - `focus only: non-focused panes are header bands, stacked; focused content fills the rest`.
  - `fallback dividers are marked saved:false and layoutForDivider returns null for them`.
  - `layoutForDivider moves the shared column of two panes within the 0.2 floor`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `Split View: pure N-pane layout and fallbacks`.

### Task 4: Split rows in the shared tab sections

**Files:**
- Modify: `src/renderer/tab-sections.js` (UMD; used by main, strip and overlay)
- Test: `test/unit/tab-sections-splits.test.js`

**Interfaces (Produces):**
- `rowsOf(tabIds, list) -> Array<{ kind: 'tab', id } | { kind: 'split', splitId, tabIds }>`
  - Consecutive tabs with the same `splitId` collapse into one split row.
  - `list` items gain an optional `splitId`.
- `numberedItemsOf(list) -> Array<{ firstTabId, splitId|null, groupId|null }>`
  - The ⌘1–9 order: a split counts once, at its first tab's position. Groups behave as `clusterList` does today.
- `itemsOf` / `layoutItems` / `placeInGroup` are **unchanged**, so Recently closed slot arithmetic stays as it is.

- [ ] **Step 1: Write the failing tests:**
  - `rowsOf collapses a split's consecutive tabs into one row`.
  - `rowsOf keeps unrelated tabs as rows`.
  - `numberedItemsOf counts a split once, at its first tab`, with and without groups.
  - `itemsOf is unchanged by splitId` (a regression guard).
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it plus `node --test test/unit/tab-sections*.test.js`. Expected: PASS.
- [ ] **Step 5:** Commit: `Split View: split rows in tab sections`.

### Task 5: Showing a split in `main.js` (state, layout, focus, payload)

**Files:**
- Modify: `src/main/window-runtime-registry.js` (`createRuntime`: `splits: []`; `detachWindow` clears nothing new, since splits persist)
- Modify: `src/main/main.js`:
  - `createTab` (`splitId: null` on the record)
  - `serializeTabs` (add `splitId`)
  - `currentTabsPayload` and `tabs:get-all` (add `splits: runtime.splits.map(({id, tabIds, layout, focusedIndex}) => …)`)
  - `syncTabLayout` (apply `normalizeSplitOrder` after section normalization)
  - `setActiveTab` (a within-split switch keeps the other pane attached)
  - `resizeActiveView` (when the active tab is in a split, apply `computeSplitLayout` to every pane's view and send `chrome:split-layout`)
  - the pane focus path (`noteFocusedPane` → `setActiveTab(paneId, { withinSplit: true, focusContent: false })` when the focused contents belong to the visible split)
  - the four `visibleTabIds` sites and the two last-moment Quiet Tabs rechecks (use `visiblePaneIds(rt())`)
  - Glance entry points (refuse while a split is visible; send a status string)
  - the numbered-tab shortcut path (use `numberedItemsOf`)
- Modify: `src/main/glance-focus.js`: `visiblePaneIds(runtime)` returns the visible split's `tabIds` when the active tab is in one, else today's pair. `isVisiblePaneId` follows.
- Modify: `src/main/tab-archive.js` (`archiveCandidates`: skip `tab.splitId`)
- Modify: `src/main/preload.js`, `browser-api/contract.json` (`TabEntry.splitId`, `SplitInfo`, `TabsSnapshot.splits`, `TabsUpdatedPayload.splits`, event `chrome:split-layout` with type `SplitLayout`), then run `npm run browser-api:build`
- Modify: `src/main/test-hook.js` (`state()` adds `splitId` per tab and `splits`; methods `makeSplit(a, b)`, `splitLayout()`, `focusPane(id)`)
- Modify: `test/desktop/steps/split-view.steps.js` (create), `test/desktop/cucumber.mjs` (add F53-1…F53-4 to `RUNNABLE`)
- Test: `test/unit/glance-focus.test.js` (extend), `test/unit/tab-archive.test.js` (extend)

**Interfaces:**
- **Consumes:** Tasks 2–4.
- **Produces:**
  - `splitOfActive(runtime) -> Split | null`
  - `showSplitLayout(runtime)` (inside `resizeActiveView`)
  - IPC event `chrome:split-layout` with payload `{ splitId, mode, panes: [{ tabId, header, content, focused, title, favicon, private, canGoBack, loading }], dividers }`, or `null` when no split is visible

- [ ] **Step 1: Write the failing unit tests:**
  - `visiblePaneIds returns both split tabs when the active tab is in a split`.
  - `archiveCandidates skips a tab in a split`.
- [ ] **Step 2: Write the failing acceptance scenarios** (through `makeSplit`):
  - `@F53-1` "A split shows both tabs side by side, each with a header band": both views attached; bounds equal to `computeSplitLayout` for the window; `splitLayout().panes.length === 2`.
  - `@F53-2` "Clicking into the other pane makes it the focused, active tab without hiding the first": `activeTabId` changes; both views stay attached; ⌘R reloads the newly focused pane only.
  - `@F53-3` "Selecting another tab hides the split; selecting a split tab brings both back with that pane focused" (Review Focus 4).
  - `@F53-4` "Visible panes never go quiet; Glance is unavailable while a split shows."
- [ ] **Step 3:** Run them. Expected: FAIL.
- [ ] **Step 4:** Implement. Run `npm run audit-inventory:write`, then `npm run browser-api:build`.
- [ ] **Step 5:** Run the scenarios, the unit tests, `npm run browser-api:check`, and the Glance and Quiet Tabs acceptance tags (`@glance or @quiet-tabs`). Expected: PASS, with Glance unchanged.
- [ ] **Step 6:** Commit: `Split View: show two panes, focus follows the active tab`.

### Task 6: Making, leaving and closing splits

**Files:**
- Modify: `src/main/main.js`:
  - `keepGlanceAsSplit()`
  - `splitTabWith(tabId, otherId)`
  - `removeFromSplit(tabId)`
  - `closeSplit(splitId)`
  - `reopenSplitEntry(entry)`: dispatched from `reopenEntry` by `entry.kind === 'split'`
  - `closeTab`: model removal and dissolve, before recording
  - `toggleTabPinned`: D7
  - `moveTabToNewWindow`: remove first
  - IPC `chrome:split-keep-glance`, `chrome:split-with`, `chrome:split-remove`, `chrome:split-close`
- Modify: `src/main/closed-tabs.js`: `buildSplitEntry(split, members, now)` with `kind: 'split'`, the same member shape as `buildGroupEntry`, and `{ layout, focusedIndex, index }`. `projectEntries` handles `kind: 'split'` (title "Split: …", `tabCount`).
- Modify: `src/main/tab-context-menu-model.js`: a **Split with ▸** submenu of eligible window tabs (`split-with` items carrying `tabId`), disabled with a reason when the right-clicked tab is pinned or already in a split. A tab in a split gets **Remove from Split** and **Close Split** instead.
- Modify: `src/main/tab-context-menu.js` (dispatch); `menuContextActions` in `main.js` (closures)
- Modify: `src/main/preload.js`, contract, vectors
- Modify: copy (en + 5 locales): `menu.splitWith`, `menu.removeFromSplit`, `menu.closeSplit`, `split.keepAsSplit`, `split.pinnedRefused`, `split.groupMoveInto` ("Moves {title} into {group}"), `split.groupMoveOutOf`, `split.madeAnnouncement`, `split.dissolvedAnnouncement`, `closed.splitTitle` ("Split: {titles}")
- Test: `test/unit/closed-tabs-split.test.js`, `test/unit/tab-context-menu-model.test.js` (extend), `test/desktop/steps/split-view.steps.js`

- [ ] **Step 1: Write the failing unit tests:**
  - `buildSplitEntry drops private members, keeps order, layout and focusedIndex`.
  - `projectEntries shows a split entry as one row`.
  - `menu: Split with lists eligible tabs only`.
  - `menu: a split tab offers Remove from Split and Close Split`.
  - `menu: Split with is disabled for a pinned tab, with the reason`.
- [ ] **Step 2: Write the failing acceptance scenarios:**
  - `@F53-5` "Keep as split turns Glance into a split, keeping the main page's group" (main page and reference in different groups).
  - `@F53-6` "Split with makes a split from the tab menu."
  - `@F53-7` "Remove from Split dissolves a two-pane split; the removed tab lands directly below."
  - `@F53-8` "Closing the focused pane's tab leaves the other tab full-window and active" (Review Focus 1).
  - `@F53-9` "Close Split is one Recently closed entry that reopens the split whole, even after a member was quieted" (Review Focus 5).
  - `@F53-10` "Pinning a split tab removes it from the split first."
- [ ] **Step 3:** Run them. Expected: FAIL.
- [ ] **Step 4:** Implement. Keep `reopenSplitEntry` beside `reopenGroupEntry`, leaving the `closeTab` / `reopenClosedTab` adjacency that tests slice intact. Add the copy and acknowledge each locale.
- [ ] **Step 5:** Run the tests, `npm run copy:check`, `npm run browser-api:check`, and the `@F3` and `@F34` tags (groups and Glance). Expected: PASS.
- [ ] **Step 6:** Commit: `Split View: keep as split, split with, remove, close and reopen`.

### Task 7: Pane headers and the divider (direction A)

**Files:**
- Modify: `src/renderer/index.html`: `#splitPanes` container (role `group`) with `#splitStatus` (sr-only, aria-live)
- Modify: `src/renderer/renderer.js`: `renderSplitPanes(layout)` (one `.split-pane-header` per pane at `pane.header`), `onSplitLayout` listener, header actions, divider drag and keyboard (`queueSplitResize`)
  - **Header actions:**
    - Back → `goBack(tabId)`
    - Reload/Stop
    - ⋯ → the native tab menu via the existing row-menu path
    - ✕ → Remove from Split, with tooltip "Remove from Split"
  - **Floor measurement:** `measureSplitFloors()` reports `paneMinWidth` alongside `chrome:island-rect`.
- Modify: `src/renderer/styles.css`: `.split-pane-header` (from `.glance-header`: `--surface-raised`, bottom hairline, `.focused` brightens the hairline), `.split-divider` (from `.glance-divider`), and Glance's motion with the Reduce Motion fade
- Modify: `src/main/main.js`: IPC `chrome:resize-split` (`splitId, index, point`) → `layoutForDivider` → save to `split.layout`; `chrome:reset-split`
- Modify: preload, contract, vectors; copy (`split.paneLabel` "{title}, pane {n} of {m}", `split.headerMenu`, `split.remove`, `split.dividerLabel`, `split.resetSize`)
- Test: `test/unit/split-header-markup.test.js` (structural: every header control has an accessible name; no inline styles), `test/desktop/steps/split-view.steps.js`

- [ ] **Step 1: Mock up the header details first.** Use real CSS, in light and dark, two columns, focused and unfocused, plus a private pane. Base it on the chosen mockup, show it to the owner, and adjust before building.
- [ ] **Step 2: Write the failing scenarios:**
  - `@F53-11` "Each pane's header names its tab; Remove from Split in the header dissolves the split; the divider resizes and resets with the keyboard."
- [ ] **Step 3:** Run it. Expected: FAIL.
- [ ] **Step 4:** Implement. Relaunch `npm start` to check the chrome by eye: chrome documents load once, at window creation.
- [ ] **Step 5:** Run the scenario, `npm run copy:check`, `npm run browser-api:check`, `@F1` (Island) and `@glance`. Expected: PASS.
- [ ] **Step 6:** Commit: `Split View: pane headers and divider`.

### Task 8: The split row in ⌘L and the rail

**Files:**
- Modify: `src/renderer/overlay.js`: `splitRow(split, tabs)` with a favicon pair, the label "{a} + {b}", the accessible name "Split: {titles}", and a disclosure listing the tabs. Rendered via `TabSections.rowsOf` inside each cluster where today it maps tabs to `tabRow`. Choosing it calls `switchTab(split.tabIds[focusedIndex])`; choosing a listed tab calls `switchTab(thatId)`.
- Modify: `src/renderer/vertical-tabs.js`: the same row in `looseRun` and `groupSection`.
- Modify: `src/renderer/styles.css` (`.split-row`), copy (`split.rowLabel`, `split.rowLabelMore`, `split.rowName`, `split.showTabs`)
- Test: `test/unit/overlay-split-row.test.js` (vm-lifted, fails closed like `switcher-spaces.test.js`), `test/desktop/steps/split-view.steps.js`

- [ ] **Step 1:** Write the failing tests: `a split's tabs render as one row with both favicons`, `choosing the row shows the split focused on its last-focused pane`, and `the disclosure lists the tabs and choosing one focuses that pane`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests plus `@F28` (rail) and `@F3`. Expected: PASS.
- [ ] **Step 5:** Commit: `Split View: one row in the panel and the rail`.

### Task 9: Persistence: session and Spaces

**Files:**
- Modify: `src/main/main.js`:
  - `captureWindowEntry` (write `splits` and `splitIds` via `captureSplits`)
  - the launch restore loop (after `createTab`s: `runtime.splits = restoreSplits(saved.splits, saved.splitIds, restoredIds)`, then `syncTabLayout`)
  - `applyWorkspaceToWindow` (same)
- Modify: `src/main/session-workspace.js` `entryFrom` (whitelist `splits` and `splitIds`)
- Modify: `src/main/session-restore.js` `filterRestoredSession` (zip `splitIds` with the other columns)
- Modify: `src/main/workspaces-model.js` (`normalizeWorkspace`, and `OPTIONAL_CAPTURE_COLUMNS` gains `splits` and `splitIds`)
- Test: `test/unit/session-restore.test.js`, `test/unit/session-workspace.test.js`, `test/unit/workspaces-model.test.js` (extend), `test/desktop/steps/split-view.steps.js`

- [ ] **Step 1: Write the failing unit tests:**
  - `filterRestoredSession keeps splitIds aligned when an entry is dropped`.
  - `entryFrom keeps splits and splitIds`.
  - `a v2 entry without splits restores with no splits`.
  - `workspaces keep splits through normalize and capture`.
  - `the flat rollback mirror never carries splits`.
- [ ] **Step 2: Write the failing acceptance scenario:**
  - `@F53-12` "A split survives relaunch and a Space round trip; a split with a private tab is saved as plain tabs."
- [ ] **Step 3:** Run them. Expected: FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run the tests, `@F18` (session), `@F41` (Spaces) and `@F53-12`. Expected: PASS.
- [ ] **Step 6:** Commit: `Split View: splits survive relaunch and Spaces`.

### Task 10: Drawing check, docs and full verification

**Files:**
- Modify: `test/desktop/tab-view-drawing-smoke.mjs` (`npm run test:tab-view-drawing:desktop`): add a case where a two-pane split is shown, hidden by selecting another tab, and shown again, asserting both panes draw. It runs on Linux under xvfb and on Windows in the quiet-tabs CI job.
- Modify: `CLAUDE.md` (Architecture: a short Split View paragraph after Glance's) and the matching `AGENTS.md` paragraph
- Modify: `spec/parity-matrix.md` (F53 desktop → `PARTIAL`)

- [ ] **Step 1:** Write the drawing case and run it on this Mac. Expected: PASS. Note that the Linux and Windows results come from CI.
- [ ] **Step 2:** Run `npm run lint`, `npm run test:unit`, `npm run substrate:check`, `npm run browser-api:check`, `npm run copy:check`, and the full `npm run test:acceptance:desktop` (run it in the background; compare any failure against `main` before blaming the branch).
- [ ] **Step 3:** Run a packaged `npm run dist:dir` with a copy of a real profile, and check:
  - Keep as split, a relaunch and a Space switch.
  - Closing the focused pane.
  - Close Split, then reopening it.
  - Light and dark.
- [ ] **Step 4:** Commit: `Split View: drawing check and docs`. Then a fresh whole-branch review, then the PR. The PR body lists D1–D8, what PR 2 and 3 add, and that the Windows and Linux VM hand checks wait for the release.
