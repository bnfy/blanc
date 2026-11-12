# Tab Group Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Groups can carry an optional color from the eight Spaces presets, drawn as a tinted block with a dot and colored Island dots, chosen from a Helium-style group menu opened by right-click or a ⋮ button.

**Architecture:** A group record gains `color` (`'#rrggbb'` from `SpaceIdentity.PRESETS`, or `null`). Main validates and persists it like `name`; renderers paint it through `SpaceIdentity.wash()` as CSS custom properties. One group-menu component in `overlay.js` serves both lists: in the ⌘L panel it floats inside the overlay document; from the side list, main opens a new overlay mode `'group-menu'` anchored to the header, the way the Spaces menu is anchored to its mark.

**Tech Stack:** Electron main + sandboxed renderers, plain JS, `node --test`, Cucumber + Playwright-Electron.

**Spec:** `docs/superpowers/specs/2026-10-17-tab-group-colors-design.md` (decisions D1–D7 in §12). Builds on PR #933 (branch `claude/ungrouped-tab-placement`).

## Global Constraints

- Colors are optional and off by default. A group with `color: null` looks exactly as it does today.
- Only the eight `SpaceIdentity.PRESETS` hexes are accepted. Anything else is stored as `null`.
- Text never sits on a solid group color. The tint is `wash(color, theme)` (theme = light, dark or private), with `--text` on top.
- Older builds drop `color` when they save. They must never lose the group itself.
- Every new English string goes into all six languages in the same PR (`copy:ack` per locale).
- `browser-api/contract.json` changes with the preload and handlers; regenerate with `npm run browser-api:build`.
- Boundary-file edits need `npm run audit-inventory:write`.
- CSS over inline styles. The only inline values allowed are custom properties carrying the group's color.

## Review Focus

1. A color that isn't a preset hex (custom, malformed, uppercase), coming over IPC or from a saved file, is stored as `null`, never drawn (Task 1 test `setGroupColor refuses anything but a preset`).
2. A session saved by v1.36.0 (groups without `color`) loads with every group uncolored (Task 1 test `a group saved without a color loads uncolored`).
3. Closing a colored group and reopening it from Recently closed keeps the color (Task 1 test `a reopened group keeps its color`).
4. Moving a group to a new window, with a quiet member and the active tab among its members, keeps every member, its order, the group name and color, and leaves the old window with a selected tab (Task 4 test `moveGroupToNewWindow carries the group whole`).
5. Opening the group menu from the side list while the ⌘L panel is closed, and pressing Esc, returns focus to that header and leaves no overlay attached (Task 3 acceptance step).

---

### Task 1: Color in the model and in saved state

**Files:**
- Create: `src/main/group-color.js` (pure: `sanitizeGroupColor(value) -> '#rrggbb' | null`, accepting only preset hexes, in any case)
- Modify: `src/main/main.js` (`setGroupColor(groupId, color)`, `groups:set-color` handler, group sanitizing in session restore and workspace apply, `reopenGroupEntry`), `src/main/closed-tabs.js` (`buildGroupEntry` keeps `color`), `src/main/preload.js` (`setGroupColor`), `browser-api/contract.json` (`TabGroup.color`, `setGroupColor`)
- Test: `test/unit/group-color.test.js`, `test/unit/tab-layout-main.test.js`, `test/unit/closed-tabs.test.js`

**Interfaces:**
- Produces:
  - `sanitizeGroupColor(value)`.
  - `setGroupColor(groupId, color) -> { ok: boolean }`. It sets `group.color`, broadcasts, and rebuilds the menu. An unknown group gives `{ ok: false }`.
  - IPC `groups:set-color (groupId: GroupId, color: string | null) -> boolean`.
  - Payload `groups[]` items gain `color: string | null`.

- [ ] Write failing tests:
  - `setGroupColor refuses anything but a preset`;
  - `a group saved without a color loads uncolored`;
  - `a reopened group keeps its color`;
  - `buildGroupEntry keeps the color`.
- [ ] Run `node --test` on the three files. Expected: FAIL.
- [ ] Implement. Restore and apply map groups to `{ id, name, collapsed, color: sanitizeGroupColor(group.color) }`.
- [ ] Run `npm run test:unit`, `npm run browser-api:build` and `npm run browser-api:check`. Expected: PASS.
- [ ] Commit.

### Task 2: Drawing the color

**Files:**
- Modify:
  - `src/renderer/overlay.js` (group band, header dot, Quick Switcher group row dot);
  - `src/renderer/vertical-tabs.js` (group block, header dot);
  - `src/renderer/renderer.js` (the dots of a colored group);
  - `src/renderer/styles.css` (`.group-colored` rules using `--group-wash` and `--group-color`, and the dot);
  - `src/renderer/pages/newtab.js` and `src/renderer/pages/pages.css` (Pick up where you left off dot), with `startPage.groups` in main passing `color`.
- Test: `test/unit/island-tab-presentation.test.js`, plus a vm test of the band and block builders, `test/unit/group-color-render.test.js`.

**Interfaces:**
- Consumes: `group.color` (Task 1) and `SpaceIdentity.wash(color, theme)`. The theme comes from `document.documentElement.dataset.theme` (`'private'`) or `prefers-color-scheme`.
- Produces:
  - A colored band or block gets class `group-colored`, with `--group-wash` (the wash) and `--group-color` (the hex) set as custom properties.
  - The header holds `<span class="group-color-dot">`.
  - A dot of a colored group gets class `dot-group-colored` and `--group-color`.

- [ ] Write failing tests:
  - `a colored band carries the wash and a dot`;
  - `an uncolored band is unchanged`;
  - `dots of a colored group carry its color`.
- [ ] Run them. Expected: FAIL.
- [ ] Implement:
  - The CSS tints the band (`background: var(--group-wash)`).
  - Inactive dots get the color at 45% (`color-mix`); the active dot gets the full color.
  - Private dots stay hollow, with a colored border.
- [ ] Run `npm run test:unit` and `npm run lint`. Expected: PASS.
- [ ] Commit.

### Task 3: The group menu

**Files:**
- Create: `src/main/group-menu.js` (pure: `groupMenuBounds({ windowWidth, windowHeight, anchor }) -> {x, y, width, height}`, with `GROUP_MENU_WIDTH = 280` and `GROUP_MENU_HEIGHT = 320`; the anchor is the header's right/top/bottom in window coordinates)
- Modify:
  - `src/renderer/overlay.js` (`renderGroupMenu(host, group, { onClose })`, the ⋮ button on panel headers, contextmenu on headers opening the menu, and `'group-menu'` mode rendering);
  - `src/renderer/vertical-tabs.js` (⋮ button on rail headers, contextmenu → `api.openGroupMenu`);
  - `src/main/main.js` (`chrome:open-group-menu`, overlay mode `'group-menu'` bounds, dismissal and focus return like `'spaces'`);
  - `src/main/preload.js` (`openGroupMenu(groupId, anchor)`);
  - `src/renderer/styles.css`;
  - `copy/messages/*.json`;
  - remove `src/main/group-context-menu.js` and `src/main/group-context-menu-model.js` with their tests (the native menu is replaced).
- Test: `test/unit/group-menu.test.js` (bounds, clamping), the overlay vm test for the menu's contents, acceptance scenarios.

**Interfaces:**
- Consumes: `api.renameGroup`, `api.setGroupColor`, `api.ungroupGroup`, `api.closeGroup` and Task 4's `api.newTabInGroup` and `api.moveGroupToNewWindow`.
- Produces: the menu, top to bottom:
  1. a name input (`aria-label` "Group name");
  2. a radiogroup of nine swatches (None plus the presets, reusing `.ws-swatch` and `spaces.color.*` names);
  3. New Tab in Group;
  4. Move Group to New Window (disabled when the group holds every tab in the window);
  5. Ungroup;
  6. Close Group.

  Behavior:
  - Enter, or clicking away, saves the name.
  - Esc cancels the name edit and closes the menu.
  - A duplicate name shows the existing refusal (`groupMenu.duplicate` message, reused).
  - A swatch applies at once.

- [ ] Write failing tests:
  - `groupMenuBounds anchors below-left of the header and stays inside the window`;
  - `the menu lists name, colors and actions in order`;
  - `Move Group to New Window is disabled for a window's only group of all tabs`.
- [ ] Run them. Expected: FAIL.
- [ ] Implement:
  - The ⋮ shows on header hover and focus-within, and while its menu is open (CSS).
  - In the panel, the menu is an absolutely positioned element in `#islandList`'s container, anchored at the header's right edge.
- [ ] Add the new strings in all six languages:
  - `groupMenu.options` ("Group options");
  - `groupMenu.nameLabel` ("Group name");
  - `groupMenu.colorLabel` ("Color");
  - `groupMenu.colorNone` ("No color");
  - `groupMenu.newTab` ("New Tab in Group");
  - `groupMenu.moveToNewWindow` ("Move Group to New Window").

  Then run `copy:build` and `copy:ack`.
- [ ] Run `npm run test:unit`, `npm run lint`, `npm run substrate:check` and `npm run browser-api:check`. Expected: PASS.
- [ ] Commit.

### Task 4: New Tab in Group and Move Group to New Window

**Files:**
- Modify: `src/main/main.js` (`newTabInGroup(groupId)`, `moveGroupToNewWindow(groupId)`, the `openNewWindow` adopt branch taking `adoptTabIds` and `group`), `src/main/preload.js`, `browser-api/contract.json`
- Test: `test/unit/tab-layout-main.test.js`, acceptance

**Interfaces:**
- Produces:
  - `newTabInGroup(groupId) -> TabId | null`: a new tab at the end of the group, selected, with the address field focused.
  - `moveGroupToNewWindow(groupId) -> boolean`:
    - It refuses when any member is mid sleep transition, when the group holds every tab in its window, or when the profile is being deleted.
    - It detaches every member as `moveTabToNewWindow` does, keeping `groupId`.
    - It opens a new window adopting them all in order, with the same group record (name, color, collapsed), and selects the member that was active, or else the first.
  - IPC `groups:new-tab` and `groups:move-to-new-window`.

- [ ] Write failing tests:
  - `newTabInGroup lands at the group's end`;
  - `moveGroupToNewWindow carries the group whole`;
  - `moveGroupToNewWindow refuses a group of every tab`.
- [ ] Run them. Expected: FAIL.
- [ ] Implement:
  - Refactor `moveTabToNewWindow`'s detach step into `detachTabForMove(id, { keepGroup })`, used by both paths.
  - Extend `openNewWindow`'s adopt branch to a list.
- [ ] Run `npm run test:unit`. Expected: PASS.
- [ ] Commit.

### Task 5: Records and acceptance

**Files:**
- Modify:
  - CLAUDE.md and AGENTS.md (Tab groups: optional color; the group menu);
  - `spec/features.md` F3;
  - `spec/parity-matrix.md` F3 row;
  - `spec/acceptance/tabs-and-groups.feature` (header text and new scenarios);
  - `test/desktop/steps/*`;
  - `test/desktop/cucumber.mjs`.
- Test: new scenarios F3-27 to F3-31, and updates to F3-18 to F3-20 (renaming and ungrouping now go through the group menu).

- [ ] Write the scenarios:
  - F3-27 color a group from the side list's ⋮ menu, and the block and dots show it;
  - F3-28 clear a color with No color;
  - F3-29 the color survives a relaunch and a Space switch;
  - F3-30 a closed colored group reopens colored;
  - F3-31 New Tab in Group and Move Group to New Window.
- [ ] Run `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F3"` outside the sandbox. Expected: PASS.
- [ ] Update the records. Then run every gate: `lint`, `substrate:check`, `browser-api:check`, `audit-inventory:write` and `:check`, `test:unit`, `test:acceptance:dry` and `test:acceptance:desktop`. Expected: all pass.
- [ ] Commit, push, and open the PR, stacked on #933.
