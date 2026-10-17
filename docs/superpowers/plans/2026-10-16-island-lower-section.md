# Island Lower Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bottom of the open Island look finished and put Recently closed within reach: a draggable, group-styled Recently closed band, a one-line footer with an Other devices drawer, a Glance row icon, sentence case, case-preserving and renamable groups, and synced device names.

**Architecture:** Four PRs in order, each shippable on its own. Part 1 adds a pure `closed-slot.js` that places the Recently closed band among the window's groups and keeps that slot correct through every group change, persisted beside group order. Part 2 reshapes the footer and moves device sections into a drawer element between the list and the footer. Part 3 adds a pure `group-name-case.js` used by main and every importer, a one-time capitalization pass, and a group header menu whose Rename Group prompt introduces a reusable overlay "name prompt". Part 4 adds a pure `device-names.js`, a per-entry-clocked synced settings key, and reuses the name prompt for Rename Device.

**Tech Stack:** Electron main/renderer JS, `node --test`, Cucumber + Playwright-Electron (`test/desktop`), the `copy/` catalog pipeline, `browser-api` contract.

**Spec:** `docs/superpowers/specs/2026-10-16-island-lower-section-design.md` (read it first; this plan argues from it).

## Global Constraints

- Four PRs, in order, each on its own branch cut from current `origin/main`: Part 1 (Tasks 1–5), Part 2 (Tasks 6–10), Part 3 (Tasks 11–14), Part 4 (Tasks 15–19). Part 4 needs Part 2's drawer and Part 3's name prompt.
- The address row (`.panel-row`) keeps its controls and width. No task adds anything to it.
- List order is always: Pinned → named groups and the Recently closed band, in the user's order → ungrouped tabs.
- `CLOSED_SECTION_ID = 'recently-closed'`, defined in `src/main/closed-slot.js` and duplicated as `constants.CLOSED_SECTION_ID` in `src/renderer/tab-drag.js` (a unit test asserts they match).
- Copy: every new or changed key lands in `copy/messages/en.json` and all of `de`, `es`, `fr`, `pt-BR`, `it` in the same PR; acknowledge each with `npm run copy:ack -- <locale> <keys…>`; then `npm run copy:build` and `npm run copy:check`. A key removed from `en.json` is removed from all five translations (orphans fail). Rewrite any `note` that says "Lowercase". Never hand-edit `strings.*.js`. US spellings.
- Glossary fixed terms ("Glance", "Space", "Spaces") must appear verbatim in translations once the English capitalizes them (`copy/lib/catalog.mjs:89-92`).
- Fonts: Instrument Sans for text; Inter (`--font-ui`) only for counts and key caps; any rule using `--font-ui` must be listed in `CHROME_KEEP_INTER` and the spacing-reset list (`test/unit/chrome-fonts.test.js`).
- The Island stays neutral (no `--sunrise-*` in `styles.css`). Use existing tokens: `--accent`, `--accent-dim`, `--surface`, `--surface-raised`, `--text`, `--text-dim`, `--radius-sm` (8px), `--radius-full`.
- Pills: 30px high, `--radius-full`, `font: 550 12.5px var(--font-text)`. Footer tools: 28×28, `--radius-sm`.
- Bridge changes: edit `src/main/preload.js` / `tab-preload.js` and `browser-api/contract.json` / `bridges.json` together, then `npm run browser-api:build` and commit the regenerated `browser-api/generated/*`.
- After editing any boundary file (`main.js`, `preload.js`, `tab-preload.js`, `pages.js`, `sync.js`, …) run `npm run audit-inventory:write` and commit `security/audit-surface-inventory.json`.
- `SYNCED_KEYS` and the `DEFAULTS` entries in `settings.js` stay one line each (regex-parsed by tests and `settings-schema/build.mjs`).
- During UI iteration run only the touched unit files and scenarios. At the end of each PR, after the owner says go: `code-review`, then `npm run lint` (zero warnings), `npm run substrate:check`, `npm run test:unit`, `npm run test:acceptance:desktop`, `npm run test:i18n:desktop`.
- Each PR's render proof: full-resolution crops of the panel, before above after, light, dark and private. The private and Glance glyph drawings are shown to the owner before Part 2 merges.
- `spec/` parity edits ship in the same PR as the behavior they describe.

## Review Focus

1. Closing the group that the Recently closed band sits under, reopening a closed group, or switching Spaces must leave the band in a sensible place, never vanished or jumped to the bottom. (Task 1 `reconcileClosedSlot` tests; Task 2 Space-switch test.)
2. Dragging a group to just below the band must land it below the band, and dragging it to just above must land it above. (Task 1 `reorderGroupsWithClosed` tests; Task 3 `resolveGroupDrop` test.)
3. The footer at 640×480 and 125% zoom with `ctrl+` labels, the Other devices button visible, and in the `en-XA` pseudo-locale: nothing overlaps or clips. (Task 7 F41 step; Task 10 i18n sweep.)
4. Renaming a device back to empty on one Mac must clear it on the others, and two Macs renaming two different devices at once must both keep their renames. (Task 15 merge tests.)
5. `/group work` while "Work" exists joins "Work"; reopening a closed tab recorded under "work" rejoins "Work" without re-casing it. (Task 12 tests.)

---

## Part 1 — Recently closed band (PR 1)

### Task 1: Closed-slot model (pure)

**Files:**
- Create: `src/main/closed-slot.js`
- Test: `test/unit/closed-slot.test.js`

**Interfaces:**
- Produces:
  - `CLOSED_SECTION_ID` (`'recently-closed'`)
  - `clampClosedSlot(slot: unknown, groupCount: number) → integer` — non-integer or negative → 0; above `groupCount` → `groupCount`
  - `reconcileClosedSlot(prevIds: string[], slot: number, nextIds: string[], movedId: string|null = null) → integer` — walking `nextIds` in order, the index of the first id that sat below the band in `prevIds` (index ≥ `slot`), treating `movedId` as never below; else `nextIds.length`
  - `reorderGroupsWithClosed(groupIds: string[], slot: number, id: string, beforeId: string|null) → { order: string[], slot: integer } | null` — `id` is a group id or `CLOSED_SECTION_ID`; `beforeId` is a group id, `CLOSED_SECTION_ID` (directly above the band) or `null` (end of groups); null when `id`/`beforeId` is unknown

- [ ] **Step 1: Write the failing tests**

```js
test('clampClosedSlot', ...)                 // (undefined,3)→0; (-1,3)→0; (1.5,3)→0; (5,3)→3; (2,3)→2
test('band keeps its place when a group above it is removed', ...)  // ['a','b','c'], slot 2 → ['a','c'] → 1
test('band keeps its place when a group below it is removed', ...)  // slot 1, ['a','b','c'] → ['a','c'] → 1
test('a group appended at the end lands below the band', ...)        // slot 1, ['a','b'] → ['a','b','n'] → 1
test('a group reinserted above the band shifts the band down', ...)  // slot 1, ['a','b'] → ['r','a','b'] → 2
test('the band stays put when another group is reordered past it', ...)
  // reconcile(['a','g','b'], 2, ['a','b','g'], 'g') → 1;  reconcile(['a','b','g'], 1, ['g','a','b'], 'g') → 2
test('moving the band', ...)
  // reorderGroupsWithClosed(['a','b','c'], 0, CLOSED_SECTION_ID, 'c') → { order:['a','b','c'], slot:2 }
  // (…, CLOSED_SECTION_ID, null) → slot 3; unknown before → null
test('a group dropped directly above the band', ...)
  // reorderGroupsWithClosed(['a','b','c'], 1, 'c', CLOSED_SECTION_ID) → { order:['a','c','b'], slot:2 }
  // (['a','b','c'], 1, 'a', 'c') → { order:['b','a','c'], slot:0 }   (a moved below the band)
```

- [ ] **Step 2: Run `node --test test/unit/closed-slot.test.js`** — Expected: FAIL (module missing)
- [ ] **Step 3: Implement the four exports** in `src/main/closed-slot.js` (no `require('electron')`); `reorderGroupsWithClosed` works on the combined list (group ids with the token inserted at `slot`), moves `id` before `beforeId`, then splits back.
- [ ] **Step 4: Run the test** — Expected: PASS
- [ ] **Step 5: Commit** `feat: closed-slot model for the Recently closed band`

### Task 2: Main owns and persists the slot

**Files:**
- Modify: `src/main/window-runtime-registry.js` (`createRuntime`: `closedSlot: 0`, `closedSlotIds: []`)
- Modify: `src/main/workspace-residency.js:6` (`SESSION_FIELDS` += `'closedSlot'`)
- Modify: `src/main/main.js` — `currentTabsPayload` (:4723) and `tabs:get-all` (:7844) add `closedSlot`; `captureWindowEntry` (:4449) emits `closedSlot` only when > 0; `reorderGroupBefore` (:7162) accepts `CLOSED_SECTION_ID` as `beforeGroupId`; new `moveClosedSection(beforeGroupId)`; startup restore (~11245) and `applyWorkspaceToWindow` (:5764) set `runtime.closedSlot`
- Modify: `src/main/session-workspace.js` (`entryFrom`: keep a valid `closedSlot`, omit otherwise)
- Modify: `src/main/workspaces-model.js` (`normalizeWorkspace` :45 and `captureColumns` :135 carry `closedSlot`)
- Modify: `src/main/preload.js`, `browser-api/contract.json` (`TabsSnapshot`, `TabsUpdatedPayload` += `closedSlot: integer`; `reorderGroup.beforeGroupId: GroupId | "recently-closed" | null`; new member)
- Test: `test/unit/closed-slot-main.test.js`, `test/unit/session-workspace.test.js`, `test/unit/workspaces-model.test.js`, `test/unit/workspace-controller.test.js:87`

**Interfaces:**
- Consumes: Task 1 exports
- Produces:
  - `syncClosedSlot(runtime)` in main.js: if `runtime.groups` ids differ from `runtime.closedSlotIds`, set `closedSlot = reconcileClosedSlot(closedSlotIds, closedSlot, ids)`; always clamp; store ids. Called first in `currentTabsPayload` and `captureWindowEntry`.
  - `reorderGroupBefore(id, beforeGroupId)` uses `reorderGroupsWithClosed` and sets both `rt().groups` order and `closedSlot` (then refreshes `closedSlotIds`).
  - `moveClosedSection(beforeGroupId: GroupId|null) → boolean` via IPC `groups:move-closed`; preload `moveClosedSection`; contract member `moveClosedSection` (group `groups`, `invoke`, params `beforeGroupId: GroupId | null`, returns `boolean`).
  - Payload field `closedSlot` (integer, 0 = directly under Pinned).

- [ ] **Step 1: Write the failing tests**
  - `session-workspace.test.js`: `entryFrom` keeps `closedSlot: 2`; drops `-1`, `'2'`, `2.5`; an entry without it deep-equals today's `EMPTY_ENTRY` fixture.
  - `workspaces-model.test.js`: `normalizeWorkspace` keeps `closedSlot`; `captureColumns` includes it (so a band move alone triggers a Space save).
  - `workspace-controller.test.js`: `SESSION_FIELDS` includes `closedSlot`; `transferSession` moves it.
  - `closed-slot-main.test.js` (lift `syncClosedSlot` and `reorderGroupBefore` from main.js by regex, as `tab-rename-main.test.js` does): removing the group above the band decrements the slot; reorder with `beforeGroupId = 'recently-closed'` places the group above the band; `moveClosedSection('c')` with groups `[a,b,c]` → slot 2; unknown id → false.
- [ ] **Step 2: Run** `node --test test/unit/closed-slot-main.test.js test/unit/session-workspace.test.js test/unit/workspaces-model.test.js test/unit/workspace-controller.test.js` — Expected: FAIL
- [ ] **Step 3: Implement** the runtime fields, `syncClosedSlot`, the reorder/move functions and IPC, payload field, `entryFrom`/`captureWindowEntry`, `normalizeWorkspace`/`captureColumns`, startup and Space restore (`clampClosedSlot(saved.closedSlot, groups.length)`, default 0).
- [ ] **Step 4: Update the contract**, run `npm run browser-api:build`, `npm run audit-inventory:write`
- [ ] **Step 5: Run the tests plus** `node --test test/unit/browser-api-contract.test.js` — Expected: PASS
- [ ] **Step 6: Commit** `feat: main keeps the Recently closed slot with group order`

### Task 3: Drag model knows the band

**Files:**
- Modify: `src/renderer/tab-drag.js`
- Test: `test/unit/tab-drag.test.js`

**Interfaces:**
- Consumes: payload `closedSlot`, `closed`
- Produces:
  - Section kind `'closed'` (`data-drag-section="closed"`, `data-group-id="recently-closed"`); its header yields Source `{ kind: 'group', id: 'recently-closed', title }`
  - `tabSlots` and `resolveTabDrop` ignore `'closed'` sections (never a drop target, never "join group")
  - `resolveGroupDrop` treats `'closed'` sections as slots, so `beforeGroupId` may be `'recently-closed'`
  - `keyboardGroupMove(snapshot, groupId, direction, { withClosed = false } = {})` — with `withClosed` and `snapshot.closed?.length`, the band sits at `clamp(snapshot.closedSlot)` in the order and can be moved or stepped past
  - `createDragSession.sourceStillValid`: the band source stays valid while `payload.closed?.length`
  - `describeMove`: band intent → `t('drag.movedClosed')`
  - `constants.CLOSED_SECTION_ID`
  - `closedSlotIndex(snapshot) → integer` — `snapshot.closedSlot` clamped to `0…snapshot.groups.length` (the renderer's copy of `clampClosedSlot`; used by `keyboardGroupMove` and by the overlay in Task 4)

- [ ] **Step 1: Write the failing tests** with a new fixture (keep the existing one untouched): work 0–40 (header 0–20, row W1 20–40), closed 40–60 (header only), play 60–80 (header only, collapsed), loose L1 80–100.

```js
test('the closed band is never a tab drop target', ...)      // resolveTabDrop for y 40–60 never yields groupId 'recently-closed'
test('a group dropped onto the band slot lands above it', ...) // resolveGroupDrop(model,'play',45) → { beforeGroupId: 'recently-closed' }
test('a group dropped just below the band lands below it', ...)// resolveGroupDrop(model,'work',65) → { beforeGroupId: 'play' }
test('keyboard moves step past the band in the island only', ...)
  // s = { groups:[work, solo], closedSlot:1, closed:[{id:'x'}], tabs:[…] }
  // keyboardGroupMove(s,'work','down',{withClosed:true}) → intent { kind:'group', id:'work', beforeGroupId:'solo' }
  // keyboardGroupMove(s,'work','down') → today's result (beforeGroupId null)
test('the band itself moves with the keyboard', ...)
  // keyboardGroupMove(s,'recently-closed','up',{withClosed:true}) → beforeGroupId 'work'
  // with closedSlot 0 → { stop:'top' }; closed:[] → null
test('closedSlotIndex clamps', ...)                           // closedSlot 5 with two groups → 2; missing → 0
test('CLOSED_SECTION_ID matches main', ...)                   // require('../../src/main/closed-slot').CLOSED_SECTION_ID === constants.CLOSED_SECTION_ID
```

- [ ] **Step 2: Run** `node --test test/unit/tab-drag.test.js` — Expected: FAIL
- [ ] **Step 3: Implement** the section kind and the listed changes; rail callers (`vertical-tabs.js:643`) keep calling `keyboardGroupMove` without the option.
- [ ] **Step 4: Run the test** — Expected: PASS (existing tests unchanged)
- [ ] **Step 5: Commit** `feat: drag model treats Recently closed as a movable band`

### Task 4: The band in the ⌘L panel

**Files:**
- Modify: `src/renderer/overlay.js` — `renderList` resting branch (:1655–1710), `closedHeaderRow` (:1137), `closedRow` (:1170), the `!reshow` reset block (:1874–1887), `islandMove` (:226), the Alt+Shift keydown (:254), `focusedRowAnchor`/`restoreRowFocus` (:1482–1495)
- Modify: `src/renderer/styles.css` — remove `text-transform`/`letter-spacing` from `.closed-clear` (:2642); band styles reuse `.island-group-band`
- Modify: `copy/messages/*.json` — `closed.header` "Recently closed" (maxLength 22), `closed.clear` "Clear all" (maxLength 12), new `drag.movedClosed` "Moved Recently closed"
- Test: `test/unit/closed-tabs-ui.test.js`

**Interfaces:**
- Consumes: `state.closedSlot`, `state.closed` (oldest first), `browserAPI.moveClosedSection`, Task 3's section kind, `withClosed` and `closedSlotIndex`
- Produces: `closedBand(entries) → HTMLElement` — `div.island-group-band.closed-band` with `data-drag-section="closed"`, `data-group-id="recently-closed"`, `data-collapsed`; inside, the header and (when open) one row per entry

- [ ] **Step 1: Write the failing tests** in `closed-tabs-ui.test.js` (source-level, like the existing ones): overlay.js no longer contains `slice(-4)`; the closed header sets `dataset.dragHeader` and `tabIndex = 0`; `closedSectionOpen = false` appears inside the `!reshow` block; `islandMove` calls `moveClosedSection` for `'recently-closed'`; `.closed-clear` has no `text-transform`.
- [ ] **Step 2: Run** `node --test test/unit/closed-tabs-ui.test.js` — Expected: FAIL
- [ ] **Step 3: Implement**
  - Remove the closed part of the furniture block; device furniture stays until Task 7.
  - Insert `closedBand` before the cluster of `state.groups[dragApi.closedSlotIndex(state)]`, or after the last group cluster when the slot is past the end; skip it when `state.closed` is empty.
  - Header: caret, `closed.header`, count = `state.closed.length`, `role="button"`, `aria-expanded`, Enter/Space toggle, `data-drag-header`, `data-drag-title`; **Clear all** on the right when open. No ⌘ number.
  - Rows: newest first, every entry, class `in-group`, `tabIndex = 0`, Enter reopens (same as click).
  - `closedSectionOpen = false` on every fresh show.
  - `islandMove`: `intent.id === 'recently-closed'` → `moveClosedSection(intent.beforeGroupId)`; else `reorderGroup` as today. Keyboard: pass `{ withClosed: true }`.
  - Copy for the three keys in six languages.
- [ ] **Step 4: Run** the unit test, `npm run copy:check` — Expected: PASS
- [ ] **Step 5: Commit** `feat: Recently closed becomes a draggable band under Pinned`

### Task 5: Scenarios and spec

**Files:**
- Modify: `test/desktop/steps/runnable.steps.js:147-205` (find the band by `[data-group-id="recently-closed"]`, not by text)
- Modify: `spec/acceptance/tabs-and-groups.feature` (@F2-7 step wording), `spec/acceptance/tab-drag.feature` (new scenario), `spec/features.md` (F2 Recently closed paragraph), `CLAUDE.md` and `AGENTS.md` (Reopen Closed Tab paragraph: one sentence on the band and its slot)
- Modify: `test/desktop/steps/tab-drag.steps.js`, `test/desktop/support/tab-drag.js` as needed

- [ ] **Step 1: Add scenarios** (next free IDs under F2 and F3-drag):
  - "Recently closed sits folded under Pinned": close two tabs, open the panel → the band follows the pinned section, folded, count 2; reopen the panel after unfolding → folded again.
  - "Move Recently closed below a group" on the island: drag the band below "work" → order work, band, play; Alt+Shift+ArrowUp moves it back; relaunch → the order survives.
- [ ] **Step 2: Run** `npm run test:acceptance:desktop -- --tags "@F2-7 or <new ids>"` — Expected: PASS
- [ ] **Step 3: Update spec and agent docs; commit** `test: Recently closed band scenarios; spec`

---

## Part 2 — Footer, Other devices drawer, hint, Glance icon, sentence case (PR 2)

### Task 6: One-line footer

**Files:**
- Modify: `src/renderer/overlay.html:52-64` (launchers), `src/renderer/overlay.js:2562-2577` (kbd and titles), `src/renderer/styles.css:2830-2925`
- Modify: `copy/messages/*.json` — `footer.newTab` "New tab", `footer.private` "Private"
- Test: `test/unit/workspaces-overlay-integration.test.js:20-31`, `test/desktop/steps/named-workspaces.steps.js:233-246`

**Interfaces:**
- Produces: `#footerNewTab.footer-new` (ink), `#footerNewPrivate.footer-new.private` (soft, private glyph, no kbd span), `.footer-act` at 28px / `--radius-sm`

- [ ] **Step 1: Update the failing assertions**: `.footer-new` requires `height: 30px`; F41 step writes only `footerNewTabKbd` (`['⌘T']`, `['ctrl+T']`) and asserts `#footerNewPrivate` has no `.footer-kbd` child and its `title` contains the shortcut.
- [ ] **Step 2: Run** `node --test test/unit/workspaces-overlay-integration.test.js` — Expected: FAIL
- [ ] **Step 3: Implement**
  - `.footer-new`: 30px, `--radius-full`, `550 12.5px`; hover changes the fill (ink one step lighter in light, darker in dark via `color-mix`), never `opacity`.
  - `.footer-new.private`: soft fill (`--accent-dim`), `--text`, no border; hover `color-mix(in srgb, var(--text) 12%, transparent)`.
  - Private glyph (starting drawing, 16-unit, stroke via CSS): `<path d="M2.25 8S4.4 3.75 8 3.75 13.75 8 13.75 8 11.6 12.25 8 12.25 2.25 8 2.25 8z"/><circle cx="8" cy="8" r="1.75"/><path d="M3.25 3.25l9.5 9.5"/>`.
  - Remove `#footerNewPrivateKbd`; the title stays `footer.newPrivate.title`.
  - `.footer-act`: `border-radius: var(--radius-sm)`, no fill until hover; keep `[aria-pressed="true"]` and `.ws.bound` fills. Keep `#footerWorkspace` sizes (`spaces-glyph.test.js`).
  - Copy for two keys in six languages.
- [ ] **Step 4: Run** the unit test and `npm run test:acceptance:desktop -- --tags @F41-8` — Expected: PASS
- [ ] **Step 5: Commit** `feat: one-line Island footer with New tab and Private pills`

### Task 7: Other devices drawer

**Files:**
- Modify: `src/renderer/overlay.html` (add `<div id="islandDrawer" hidden></div>` between `#islandList` and `#islandFooter`; add `#footerDevices` after `#footerNewPrivate`)
- Modify: `src/renderer/overlay.js` — new `devicesDrawerOpen`, `renderDevicesDrawer()`; `remoteHeaderRow` (:906) gains `data-device-id`, `tabIndex = 0`, `role="button"`, `aria-expanded`, Enter/Space toggle; device furniture removed from `renderList`; reset in the `!reshow` block
- Modify: `src/renderer/styles.css` (`#islandList { flex: 1 1 auto }`, `#islandDrawer { flex: 0 0 auto; max-height: 204px; overflow-y: auto; overscroll-behavior: contain; border-top: 1px solid var(--border); margin-top: 6px; padding-top: 4px }`, `#islandDrawer[hidden] { display: none }`, `.footer-new.devices` dim/no fill, `[aria-expanded="true"]` soft fill)
- Modify: `copy/messages/*.json` — new `footer.devices` "Other devices" (maxLength 16), `footer.devices.title` "Tabs open on your other devices"
- Test: `test/desktop/steps/named-workspaces.steps.js:160-187`, new scenarios in `spec/acceptance/sync.feature`

**Interfaces:**
- Consumes: `remoteDevices` (overlay.js :152), `refreshSwitcherData`, `onRemoteTabsUpdated`
- Produces: `#footerDevices` (`aria-expanded`, count in a `.footer-kbd` span, hidden when `remoteDevices.length === 0`); device headers carry `data-device-id` (Part 4 relies on it)

- [ ] **Step 1: Write the failing scenarios** (inject remote devices with the helper `vertical-tabs.steps.js:899-992` uses):
  - "Other devices opens above the footer": the button shows "2"; click → drawer visible with two device headers, footer unchanged in position when the panel is at max height; click again → hidden; reopen the panel → closed.
  - "Typing hides the drawer": open it, type "a" → drawer hidden; clear → shown.
  - "No devices, no button": no remote devices → `#footerDevices` hidden.
  - F41-8: `checkFooter` measures only visible buttons and runs once with a device injected so `#footerDevices` is visible.
- [ ] **Step 2: Run** `npm run test:acceptance:desktop -- --tags "<new ids> or @F41-8"` — Expected: FAIL
- [ ] **Step 3: Implement** the drawer (render it only in the resting list state, same condition the old furniture used), the toggle, the header changes and the CSS; copy in six languages.
- [ ] **Step 4: Run** the scenarios — Expected: PASS
- [ ] **Step 5: Commit** `feat: Other devices drawer above the Island footer`

### Task 8: Hint line

**Files:**
- Modify: `src/renderer/overlay.js:1713-1719` (resting write: private note or empty), keep the site-info writes (:1593–1597)
- Modify: `src/renderer/styles.css:2938` (`font-size: 11.5px`, no `opacity`, `#islandHint:empty { display: none }`)
- Modify: `copy/messages/*.json` — remove `hint.default`, `hint.groups` from all six; `hint.private` "Private tab · Nothing here is saved to history"

- [ ] **Step 1: Write the failing unit test** `test/unit/island-hint.test.js` (source-level): overlay.js has no `hint.default`/`hint.groups`; the resting write uses `hint.private` only; `#islandHint` rule has no `opacity` and an `:empty` rule.
- [ ] **Step 2: Run it** — Expected: FAIL
- [ ] **Step 3: Implement; run** the test and `npm run copy:check` — Expected: PASS
- [ ] **Step 4: Commit** `feat: drop the Island hint line except the private note`

### Task 9: Glance row icon

**Files:**
- Modify: `src/renderer/overlay.js` (ICONS :273 += `glance`; `tabRow` :698–716: icon instead of `textContent`)
- Modify: `src/renderer/styles.css:2538-2555` (`.row-glance` becomes an 18×18 round icon button like `.row-pin`; `.on` = `--accent-dim` fill, visible at rest)
- Modify: `copy/messages/*.json`, `copy/glossary.json` — remove `row.glance` everywhere (it is in `sameAsSource`)
- Test: `test/unit/private-tab-chrome.test.js` and `quiet-tabs-chrome.test.js` stubs (`ICONS` gains `glance: ''`)

**Interfaces:**
- Produces: `ICONS.glance` (starting drawing, 16-unit: `<rect x="2.25" y="3.25" width="7.5" height="9.5" rx="1.5"/><rect x="11.25" y="4.75" width="2.5" height="6.5" rx="1"/>` — a page beside a page, distinct from the footer's sidebar glyph); class stays `row-glance` (listed in `focusedRowAnchor`)

- [ ] **Step 1: Update the failing test** in `private-tab-chrome.test.js`: a non-active row's `.row-glance` has no text and contains an `svg`; order still ends `row-private`, `row-close`.
- [ ] **Step 2: Run** `node --test test/unit/private-tab-chrome.test.js test/unit/quiet-tabs-chrome.test.js` — Expected: FAIL
- [ ] **Step 3: Implement; run** the tests and `npm run copy:check` — Expected: PASS
- [ ] **Step 4: Commit** `feat: Glance row action becomes an icon`

### Task 10: Sentence case across the panel

**Files:**
- Modify: `copy/messages/*.json` (six languages), notes and maxLengths:
  - `rail.section.pinned` "Pinned" (shared with the rail), `rail.private.marker` "Private" (shared)
  - `result.tag.tab` "Tab", `.favorite` "Favorite", `.history` "History", `.group` "Group", `.remote` "Remote", `.search` "Search", `.space` "Space" (translations become "Space" verbatim)
  - `list.noCommand` "No matching command", `list.noMatches` "No matches — ↵ opens as address or search"
  - `siteInfo.hint.certError` "This certificate could not be verified", `.certException` "You continued past a certificate warning", `.chromium` "Connection details are supplied by Chromium", `siteInfo.localPage` "Local page"
- Modify: `test/desktop/steps/vertical-tabs.steps.js:904` ("Pinned"), `test/unit/private-tab-chrome.test.js:73,76` ("Private")
- Modify: `spec/features.md` F1 (:33–34, add the footer, drawer and private note) and F27 (:529–531, "the ⌘L panel's Other devices drawer"), `spec/acceptance/sync.feature:13-17` step text

- Modify: `test/desktop/i18n-pseudo-sweep.mjs` — with one remote device injected, open the panel and assert no `#islandFooter` button overlaps another or leaves the footer (the same check as F41-8, under `en-XA`)

- [ ] **Step 1: Change the English and five translations; `copy:ack` each key per locale; `npm run copy:build`**
- [ ] **Step 2: Run** `npm run copy:check`, the two updated unit tests, and `npm run test:i18n:desktop` (with the new footer check) — Expected: PASS
- [ ] **Step 3: Commit** `copy: sentence case across the open Island`
- [ ] **Step 4: PR 2 close-out** — render proof (light, dark, private; owner reviews both glyphs), then the full checks from Global Constraints when the owner says go.

---

## Part 3 — Group names (PR 3)

### Task 11: Group-name helpers (pure)

**Files:**
- Create: `src/main/group-name-case.js`
- Test: `test/unit/group-name-case.test.js`

**Interfaces:**
- Produces:
  - `MAX_GROUP_NAME = 40`
  - `normalizeGroupName(raw) → string` — `String(raw ?? '').trim().slice(0, 40)`, case kept
  - `groupNameKey(name) → string` — `normalizeGroupName(name).toLowerCase()`
  - `sameGroupName(a, b) → boolean`
  - `capitalizeFirst(name) → string` — first character upper-cased, rest unchanged
  - `recaseSessionData(data) → { data, changed: boolean }` — `capitalizeFirst` on `windows[i].groups[].name` and the top-level mirror `groups[].name`; returns unchanged when `data.version > 2`
  - `recaseWorkspacesFile(file) → { file, changed: boolean }` — every `workspaces[].groups[]` and `deleted[].groups[]` name

- [ ] **Step 1: Write the failing tests**: `normalizeGroupName('  Research ')` → `'Research'`; 41 chars → 40; `sameGroupName('Work','work ')` true; `capitalizeFirst('projects')` → `'Projects'`, `('éclair')` → `'Éclair'`, `('2fa')` → `'2fa'`, `('')` → `''`; `recaseSessionData` changes windows and mirror identically (the loader's mirror `deepEqual` still holds); version 3 untouched; `recaseWorkspacesFile` covers `deleted[]`.
- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3: Implement** (no `require('electron')`)
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `feat: group-name helpers that keep case`

### Task 12: Case-preserving groups in main and importers

**Files:**
- Modify: `src/main/main.js` — `groupTabByName` (:5207): `normalizeGroupName`, lookup by `sameGroupName`, new third param `{ adoptCase = false } = {}`; `tabs:group-by-name` handler (:7828) passes `{ adoptCase: true }`; `finishReopen` (:7121) does not; `reopenGroupEntry` (:6783) matches with `sameGroupName`
- Modify: `src/main/test-hook.js:192` (`lc` → `sameGroupName`)
- Modify: `src/main/tab-import-apply.js:9-33,69-82` (keep case; existing match by key; a merge reports the existing group's name), `tab-import-batch.js:25-35`, `tab-import-session.js:17-20`, `tab-import-organizer.js:54-57,111-140,325-345` (bucket by key, first-seen display case; `deriveGroupName` output through `capitalizeFirst`; `GENERIC_GROUP_NAMES` and `isUsableToken` compare keys), `arc-sidebar.js:199,227` (keep case, dedupe by key)
- Test: `test/unit/tab-import-apply.test.js:59-105`, `tab-import-batch.test.js:23-33`, `tab-import-organizer.test.js:41,55`, `arc-sidebar.test.js:184-225`, new `test/unit/group-by-name.test.js` (lift `groupTabByName` by regex)
- Modify: `test/desktop/steps/runnable.steps.js:100,281,338,343,350`, `glance.steps.js:624-632` (expect `'Research'`)

- [ ] **Step 1: Update and add the failing tests**
  - `group-by-name.test.js`: "Research" created as typed; `/group research` joins it; with `adoptCase` "Tools" re-cases "tools"; without it (reopen path) "work" joins "Work" and leaves "Work".
  - apply: `existingGroupNames: ['WORK']` + "work" → `{ name: 'WORK', action: 'merge' }`; "Reading" creates "Reading".
  - batch: `resolveBatchGroupId([{name:'work'}], 'WORK')` → `'g-work'`.
  - organizer: folder "project atlas" stays "project atlas"; source groups " Project Atlas " and "project atlas" → one group "Project Atlas"; a title-derived name starts with a capital.
  - arc: "Engineering" stays "Engineering"; "Reading" and "reading " → one group "Reading".
- [ ] **Step 2: Run** those files — Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** the unit files and `npm run test:acceptance:desktop -- --tags "@F3-1 or @F40-8"` — Expected: PASS
- [ ] **Step 5: Commit** `feat: group names keep the case typed`

### Task 13: Capitalize existing groups once

**Files:**
- Modify: `src/main/settings.js` — read the raw stored `groupNamesRecasedVersion` the way `presentationDefaultsResetVersion` is read (:255–283); export `groupNamesRecaseDue() → boolean` and `markGroupNamesRecased()`; `DEFAULTS.groupNamesRecasedVersion: 1` (one line); strip it in `pages.js` `clientSettings` (:342–363)
- Modify: `settings-schema/schema.json` (`internalDefaults` += `groupNamesRecasedVersion`)
- Modify: `src/main/main.js` startup, before `loadWorkspace(ensureSessionStore().data)` (~11159): when due, `recaseSessionData` → `updateAndFlush` → `markGroupNamesRecased()`
- Modify: `src/main/workspaces-model.js` — file field `groupNamesRecased: 1` in `EMPTY_FILE`; `loadFile` recases with `recaseWorkspacesFile` and stamps when the field is absent (reported as a repair, so `workspaces.js` keeps its `.before-repair` backup); `normalizeFile` keeps the field
- Test: `test/unit/group-name-migration.test.js`, `test/unit/workspaces-model.test.js`, `test/unit/first-run-settings.test.js`

- [ ] **Step 1: Write the failing tests**: an existing profile without the stamp is due; a fresh profile is not; after marking, not due; a workspaces file without the field gets "Projects" and the stamp; a file with the stamp and a group "iOS" is left alone; `npm run settings:check` passes with the new internal default.
- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** the tests and `npm run substrate:check` — Expected: PASS
- [ ] **Step 5: Commit** `feat: capitalize existing group names once`

### Task 14: Group header menu, Rename Group, and the overlay name prompt

**Files:**
- Create: `src/main/group-context-menu-model.js`, `src/main/group-context-menu.js`
- Modify: `src/main/main.js` — `renameGroup(groupId, rawName)`, `ungroupGroup(groupId)`, `beginRenameGroup(groupId)`; IPC `groups:rename`, `groups:ungroup`; attach the menu to the overlay (beside :3445) and the chrome document (beside :8847)
- Modify: `src/renderer/overlay.js` — record `window.__blancCtxGroupId` from `[data-drag-header][data-group-id]` (skip `'recently-closed'`) in the contextmenu handler (:2809–2842); the name prompt
- Modify: `src/renderer/renderer.js:16-27` — record `__blancCtxGroupId` from `.vertical-tabs-group-header[data-group-id]`
- Modify: `src/main/preload.js`, `browser-api/contract.json` (`renameGroup`, `ungroupGroup` in group `groups`)
- Modify: `copy/messages/*.json` — `groupMenu.rename` "Rename Group…", `groupMenu.ungroup` "Ungroup", `groupMenu.close` "Close Group", `groupMenu.duplicate` "A group named “{name}” already exists", `prompt.renameGroup` "Rename group · Enter saves · Esc cancels"
- Modify: `spec/features.md` F3 (:69) and F45 (:1158), `spec/parity-matrix.md:19`, `CLAUDE.md` and `AGENTS.md` tab-groups paragraph ("lowercase mono labels" → names keep the case typed; header menu), `spec/acceptance/tabs-and-groups.feature`, `spec/acceptance/tab-migration.feature` (case-differing merge variant)
- Test: `test/unit/group-context-menu-model.test.js`, `test/unit/group-rename-main.test.js`, desktop steps

**Interfaces:**
- Consumes: Task 11 helpers; `closeGroup(groupId)` (main.js :5283); `showOverlay` purpose payload
- Produces:
  - `buildGroupContextMenu(t) → [{id:'rename',label}, {type:'separator'}, {id:'ungroup',label}, {id:'close-group',label}]`
  - `attachGroupHeaderMenu(wc, deps)` — mirrors `attachWorkspaceRowMenu` (reads and clears `__blancCtxGroupId`, resolves the group in the sender's window, pops up with the menu guard); `deps.actions = { rename, ungroup, closeGroup }`
  - `renameGroup(groupId, rawName) → { ok: true } | { ok: false, error: 'duplicate' }` — empty or unchanged name → `{ ok: true }` with no change; duplicate by `sameGroupName` in the same window → error; else set name, broadcast, rebuild menu
  - `ungroupGroup(groupId) → void` — every member's `groupId = null`, `pruneEmptyGroups()`, broadcast
  - `beginRenameGroup(groupId)` → `showOverlay('panel', { prefill: group.name, purpose: { renameGroupId: groupId } })`
  - Overlay name prompt: `namePrompt = null | { kind: 'group' | 'device', id, prefill }`, set from purpose `renameGroupId` (Part 4 adds `renameDeviceId`); the input takes `prefill` fully selected; the list shows one notice row with `prompt.renameGroup`; Enter: unchanged → close; else `await browserAPI.renameGroup(id, value)`; on `duplicate` show `groupMenu.duplicate` as a result notice and keep the prompt; otherwise close. Cleared on fresh show and dismiss.

- [ ] **Step 1: Write the failing tests**
  - model: ids and labels in order.
  - `group-rename-main.test.js` (regex-lift): rename keeps case and trims; 41 chars → 40; "work" when "Work" exists elsewhere in the window → `duplicate`; renaming "ios" to "iOS" (same key, same group) succeeds; `ungroupGroup` empties the group and prunes it.
  - Scenarios: right-click a group header in the panel → Rename Group… → type "Research" → Enter → the header reads "Research"; same from the rail; a duplicate shows the notice and keeps the prompt; Ungroup moves members to ungrouped tabs.
- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3: Implement**; `npm run browser-api:build`; `npm run audit-inventory:write`; copy in six languages
- [ ] **Step 4: Run** the unit files and the new scenarios — Expected: PASS
- [ ] **Step 5: Commit** `feat: rename, ungroup and close a group from its header`
- [ ] **Step 6: PR 3 close-out** — the full checks from Global Constraints when the owner says go.

---

## Part 4 — Device names (PR 4)

### Task 15: Device-name map (pure)

**Files:**
- Create: `src/main/device-names.js`
- Test: `test/unit/device-names.test.js`

**Interfaces:**
- Produces:
  - Entry shape `{ name: string, at: number, tie: string }`; `name: ''` means "cleared"
  - `MAX_DEVICE_NAME = 80`, `MAX_DEVICE_NAME_ENTRIES = 64`
  - `normalizeDeviceNames(value) → Record<deviceId, Entry>` — ids `^[A-Za-z0-9-]{1,64}$`; names trimmed, ≤ 80; `at` positive integer; `tie` string ≤ 128; keeps the newest 64 by `at`
  - `setDeviceNameEntry(map, deviceId, rawName, { at, tie }) → map`
  - `mergeDeviceNames(local, remote) → map` — per id: larger `at` wins; equal `at` → smaller `tie`; then smaller `name`
  - `resolveDeviceName(map, deviceId, publishedName) → string` — a non-empty chosen name, else `publishedName`
  - `deviceNamesEqual(a, b) → boolean`

- [ ] **Step 1: Write the failing tests**: concurrent renames of two ids both survive a merge in either direction; a later empty entry beats an older name (clear propagates); equal `at` resolves the same on both sides; 65 entries → 64 newest; invalid ids/entries dropped; `resolveDeviceName` falls back on `''`.
- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `feat: device-name map with per-entry clocks`

### Task 16: Synced `deviceNames` setting

**Files:**
- Modify: `src/main/settings.js` — `DEFAULTS.deviceNames: {}` (one line); `'deviceNames'` in `SYNCED_KEYS` (one line); no `sanitize` entry (main-only); `getSettings` normalizes it; `exportForSync` exports the normalized map; `mergeFromSync` merges it with `mergeDeviceNames` before the generic loop (which skips it) and sets `_syncMeta.deviceNames` to the max of both; new `setDeviceName(deviceId, rawName, now = Date.now())`, `getDeviceNames()`, `syncPayloadEquals(exported, remote) → boolean`
- Modify: `settings-schema/schema.json` (`internalDefaults` += `deviceNames`), `src/main/pages.js` `clientSettings` (strip `deviceNames`)
- Modify: `src/main/sync.js` (`STORES` settings entry gains `equals: settings.syncPayloadEquals`)
- Test: `test/unit/settings-device-names.test.js`

**Interfaces:**
- Consumes: Task 15
- Produces: `settings.setDeviceName`, `settings.getDeviceNames`, `settings.syncPayloadEquals`; listeners fire when the map changes, locally or by merge

- [ ] **Step 1: Write the failing tests**: `setDeviceName` stamps the entry and a key-level meta > 0; `pages:settings:set` with `deviceNames` changes nothing; merging two blobs that renamed different devices keeps both; a remote without the key leaves the local map and makes `syncPayloadEquals` false (so the next PUT restores it); identical payloads → true; `clientSettings` has no `deviceNames`; `npm run settings:check` passes.
- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3: Implement**; `npm run audit-inventory:write`
- [ ] **Step 4: Run** the tests and `npm run substrate:check` — Expected: PASS
- [ ] **Step 5: Commit** `feat: sync user-chosen device names`

### Task 17: Names reach every surface

**Files:**
- Modify: `src/main/sync.js` — `listRemoteDevices` (:849) maps `name` through `resolveDeviceName(settings.getDeviceNames(), d.deviceId, d.name)`; `refreshSession` (:793) syncs `['session', 'icons', 'settings']` and its comment says so; `status()` adds `deviceName` (own display name) and `deviceNamePublished` (`deviceName()`); new `setThisDeviceName(name) → status`, `renameRemoteDevice(deviceId, name) → boolean` (only ids `listRemoteDevices` returns)
- Modify: `src/main/main.js` `startProfileSync` (:11118) — a `settings.onSettingsChanged` hook that calls `pushRemoteDevices` when `deviceNamesEqual` says the map changed
- Modify: `src/main/test-hook.js:226` (same push)
- Test: `test/unit/sync-device-names.test.js`, `test/unit/sync-tab-state-ready.test.js:117-130`

- [ ] **Step 1: Write the failing tests**: a chosen name replaces the published one in `listRemoteDevices`; clearing restores it; `refreshSession` requests settings with session and icons, still nothing before tab state is ready, still at most once a minute; `renameRemoteDevice` refuses an unknown id; `status()` carries both names; the published name in the tab-sync export is still `deviceName()` (`sync-publish-ceiling.test.js` unchanged).
- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3: Implement**; `npm run audit-inventory:write`
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `feat: show chosen device names in the drawer, switcher and start page`

### Task 18: Rename Device… in the drawer

**Files:**
- Create: `src/main/device-context-menu-model.js`, `src/main/device-context-menu.js`
- Modify: `src/main/main.js` — `beginRenameDevice(deviceId)`; IPC `chrome:rename-device` → `sync.renameRemoteDevice`; attach the menu to the overlay beside :3445
- Modify: `src/renderer/overlay.js` — record `__blancCtxDeviceId` from `.island-ghead[data-device-id]`; `namePrompt` accepts purpose `renameDeviceId` with `prompt.renameDevice` and calls `browserAPI.renameDevice`
- Modify: `src/main/preload.js`, `browser-api/contract.json` (`renameDevice(deviceId: string, name: string | null) → boolean`, same group as `listRemoteTabs`)
- Modify: `copy/messages/*.json` — `deviceMenu.rename` "Rename Device…", `prompt.renameDevice` "Rename device · Enter saves · Esc cancels"
- Test: `test/unit/device-context-menu-model.test.js`, desktop scenario

**Interfaces:**
- Consumes: Task 7 `data-device-id`; Task 14 `namePrompt`; Task 17 `renameRemoteDevice`
- Produces: `buildDeviceContextMenu(t) → [{ id: 'rename', label }]`; `attachDeviceHeaderMenu(wc, deps)`; `beginRenameDevice(deviceId)` → `showOverlay('panel', { prefill: device.name, purpose: { renameDeviceId: deviceId } })`

- [ ] **Step 1: Write the failing tests**: model item; scenario (two injected devices): right-click "MacBook-Neo.local" → Rename Device… → "Work laptop" → Enter → the drawer, the Quick Switcher sub-line and an open start page show "Work laptop"; rename to empty → the published name returns.
- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3: Implement**; `npm run browser-api:build`; `npm run audit-inventory:write`; copy in six languages
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `feat: rename a synced device from the Island`

### Task 19: This device's name in Settings → Sync

**Files:**
- Modify: `src/renderer/pages/settings.html:361-366` (row after Sync name: `<dt data-i18n="settings.sync.deviceName">This device’s name</dt>` with `<input id="syncDeviceName">`), `src/renderer/pages/settings.js` `initSync` (:1237) and `renderStatus` (:1305; value = `status.deviceName`, placeholder = `status.deviceNamePublished`; save on `change`)
- Modify: `src/main/pages.js` (beside :486: `handle('pages:settings:sync-device-name-set', 'settings', (name) => sync.setThisDeviceName(name))`), `src/main/tab-preload.js` (beside :226: `syncDeviceNameSet`), `browser-api/bridges.json` (beside :1188)
- Modify: `copy/messages/*.json` — `settings.sync.deviceName` "This device’s name", `settings.sync.deviceNameHint` "How your other devices list this one. Leave empty to use the computer’s name."; in `settings.trust.syncScope`, `settings.sync.syncSetupIntro`, `settings.sync.setup.intro` and `settings.sync.on`, add device names wherever the string lists what syncs
- Modify: `spec/features.md` F27 (renaming), `spec/acceptance/sync.feature` (rename scenario)
- Test: `test/unit/sync-settings-card.test.js:56-69,84`, `test/unit/pages-sync-channels.test.js` (`CHANNELS` += the new channel → `sync.setThisDeviceName(`), `test/unit/settings-sync-page.test.js`

- [ ] **Step 1: Update the failing tests** (the on-state rows include the new row after Sync name; the channel table; the input wiring)
- [ ] **Step 2: Run** — Expected: FAIL
- [ ] **Step 3: Implement**; `npm run browser-api:build`; `npm run audit-inventory:write`; copy in six languages
- [ ] **Step 4: Run** the tests, `npm run copy:check`, `npm run substrate:check` — Expected: PASS
- [ ] **Step 5: Commit** `feat: name this device in Settings → Sync`
- [ ] **Step 6: PR 4 close-out** — the full checks from Global Constraints when the owner says go. Website wording about what syncs waits for the release and ships as its own website PR.
