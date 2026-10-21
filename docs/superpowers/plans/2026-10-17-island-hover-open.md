# Island Hover-Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An opt-in, device-local setting that opens the Island panel after the pointer rests on the collapsed pill for 300 ms.

**Architecture:** A pure state machine (`src/main/island-hover-open.js`) decides when a dwell starts, cancels and fires. `main.js` feeds it the mouse moves it already watches for proximity, owns one timer per window runtime, and opens through the existing `showOverlay('panel')`. The strip renderer adds one boolean (whether the device has a hover-capable fine pointer) to the rectangle it already reports.

**Tech Stack:** Electron 44 main process, `node --test`, Cucumber + Playwright-Electron acceptance.

**Spec:** `docs/superpowers/specs/2026-10-17-island-hover-and-pinned-homes-design.md` §4 (Milestone A). This plan has no dependency on the pinned-homes plan; ship it in its own PR.

## Global Constraints

- Setting key `islandHoverOpen`, boolean, default `false`, device-local: never in `SYNCED_KEYS`.
- Dwell is exactly 300 ms: 299 ms does not open, 300 ms opens once.
- Settings row sits immediately after **Tab layout** (`#tabLayoutSetting`) and is shown in both tab layouts.
- Copy, exact: label **Open the Island on hover**; hint **Rest the pointer on the Island to open it without clicking.**
- Every English string change updates `de`, `es`, `fr`, `pt-BR` and `it` in the same PR (`copy/messages/*.json`, then `npm run copy:ack -- <locale> <keys>` per locale and `npm run copy:build`).
- `settings-schema/schema.json` and `settings.js` stay in lockstep (`npm run substrate:check`).
- A changed `window.browserAPI` payload needs `browser-api/contract.json` updated and `npm run browser-api:build` (commit the regenerated vectors).
- Click, Enter/Space, ⌘L/Ctrl+L and typing-to-open are unchanged.
- Hover never opens in another window: the timer re-checks its own runtime when it fires.
- Use CSS, not inline styles, for any new UI.
- Not a public capability until released (spec §7): no site or social copy in this PR.

## Review Focus

1. **Pointer resting on the pill when the panel closes** (Escape, outside click, tab switch): the panel must stay closed until the pointer leaves and re-enters. Pinned by Task 1 `retract sample never starts a dwell` and Task 3 acceptance case 6.
2. **A mouse button held while entering or resting** (drag of a tab dot, a text selection running into the strip): no open. Pinned by Task 1 `buttons down cancel and disarm`.
3. **Window loses focus mid-dwell, then regains it with the pointer still on the pill:** no open until exit and re-entry. Pinned by Task 1 `ineligible event disarms until exit`.
4. **Setting switched off while a dwell is pending:** the panel must not open when the timer would have fired. Pinned by Task 3 scenario `turning the setting off mid-dwell`.
5. **Vertical-tabs layout**, where tab views are offset by the rail: entry must use the same window coordinates as proximity. Pinned by Task 3 acceptance scenario `hover-open works in vertical tabs`.

---

### Task 1: Pure hover state machine

**Files:**
- Create: `src/main/island-hover-open.js` (no `require('electron')`)
- Test: `test/unit/island-hover-open.test.js`

**Interfaces:**
- Produces:
  - `HOVER_OPEN_DWELL_MS = 300`
  - `initialHoverState() -> { inside: false, armed: true, dwelling: false }`
  - `pointInRect(point: {x,y}, rect: {x,y,width,height} | null) -> boolean` (edges inclusive; `false` for a null rect)
  - `hoverStep(state, event) -> { state, effect: 'start' | 'cancel' | 'open' | null }` where `event` is one of:
    - `{ type: 'move', inside: boolean, eligible: boolean, buttonsDown: boolean, sampled?: boolean }`
    - `{ type: 'ineligible' }` (panel opened by any path, window blur, setting off, native menu shown)
    - `{ type: 'fired' }` (the timer elapsed)

Rules the tests pin:
- Entry (`inside` true, `state.inside` false): `sampled` → inside, disarmed, no effect. Otherwise eligible, armed and no buttons → `start`, `dwelling: true`.
- Move while inside: no new `start` (motion does not restart). If dwelling and (`!eligible` or `buttonsDown`) → `cancel`, disarmed.
- Exit (`inside` false): `inside: false`, `armed: true`; `cancel` if dwelling.
- `ineligible`: `cancel` if dwelling; disarmed regardless.
- `fired` while dwelling and inside → `open`, disarmed. `fired` otherwise → `null`.

- [ ] **Step 1: Write the failing tests**

Tests, each a `node:test` case with `assert.deepStrictEqual` on `{state, effect}`:
- `entry starts one dwell` — from initial, eligible entry → effect `start`.
- `moving inside does not restart` — after entry, three moves inside → effect `null` each.
- `exit before dwell cancels` — entry then exit → `cancel`, `armed: true`.
- `fired opens once` — entry, `fired` → `open`; a second `fired` → `null`; further moves inside → `null`.
- `re-entry after exit re-arms` — after `open`, exit, entry → `start`.
- `retract sample never starts a dwell` — initial, `move` inside with `sampled: true` → `null`, `armed: false`; next non-sampled move inside → `null`; exit then entry → `start`.
- `ineligible entry does not arm` — entry with `eligible: false` → `null`; it becomes eligible while still inside → still `null` (dwell needs a fresh entry).
- `buttons down cancel and disarm` — entry with `buttonsDown: true` → `null`; dwelling then a move with `buttonsDown: true` → `cancel`.
- `ineligible event disarms until exit` — dwelling, `{type:'ineligible'}` → `cancel`; moves inside → `null`; exit + entry → `start`.
- `pointInRect` — corners inclusive, one pixel outside false, null rect false.
- `dwell constant` — `HOVER_OPEN_DWELL_MS === 300`.

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/island-hover-open.test.js`
Expected: FAIL, `Cannot find module '../../src/main/island-hover-open'`.

- [ ] **Step 3: Implement the module** to the rules above, frozen state objects returned fresh each step.

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/unit/island-hover-open.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/island-hover-open.js test/unit/island-hover-open.test.js
git commit -m "Add the Island hover-open state machine"
```

### Task 2: Setting, Settings row, renderer capability and main wiring

**Files:**
- Modify: `src/main/settings.js` (DEFAULTS near `mouseGesturesEnabled: false` at :203; `getSettings` sanitizer near :459; `setSettings` whitelist near :538)
- Modify: `settings-schema/schema.json` (add `islandHoverOpen` to `internalDefaults`, beside `mouseGesturesEnabled`)
- Modify: `src/renderer/pages/settings.html` (new `.setting` row after `#tabLayoutSetting`), `src/renderer/pages/settings.js` (guarded by `supports('islandHoverOpen')`, same shape as the `newtabDynamicWallpaper` toggle)
- Modify: `copy/messages/en.json` + the five translations: keys `settings.general.islandHoverOpen.label`, `settings.general.islandHoverOpen.hint`
- Modify: `src/renderer/renderer.js` `reportIslandRect` (:1367): add `hoverCapable`
- Modify: `browser-api/contract.json` `IslandRectReport`: optional boolean field `hoverCapable`
- Modify: `src/main/window-runtime-registry.js` (:163 area): `islandHover: null`, `islandHoverCapable: false`
- Modify: `src/main/main.js`: `watchCursorFor` (:3074), `hideOverlay` retract sample (:3789), `showOverlay` (:3632), `chrome:island-rect` (:8270), window `blur`, a settings listener, and the tab/group context menus
- Modify: `src/main/tab-context-menu.js`, `src/main/group-context-menu.js`: call `deps.suppressIslandHover?.()` on the menu's `menu-will-show`
- Modify: `src/main/test-hook.js`: `setIslandHoverOpen(on)`, `islandHoverState()`, `sendChromeMouseInput(input)`
- Test: `test/unit/island-hover-open-settings.test.js`

**Interfaces:**
- Consumes: Task 1's `hoverStep`, `initialHoverState`, `pointInRect`, `HOVER_OPEN_DWELL_MS`.
- Produces (main.js, all window-runtime scoped):
  - `islandHoverEligible(runtime) -> boolean`: `settings.getSettings().islandHoverOpen === true && runtime.islandHoverCapable && runtime.window.isFocused() && !runtime.overlayMode && !runtime.utilitySheetUrl && !runtime.glanceTabId && !runtime.permissionViewAttached && !!runtime.islandRect`
  - `updateIslandHover(runtime, point, { buttonsDown = false, sampled = false } = {})`
  - `suppressIslandHover(runtime = rt())` (sends `{type:'ineligible'}`)
  - `runtime.islandHover = { state, timer, point }`
- Test-hook: `islandHoverState() -> { inside, armed, dwelling }` for the focused runtime.

- [ ] **Step 1: Write the failing settings test**

`test/unit/island-hover-open-settings.test.js`, following `tab-sleep-settings.test.js`'s setup:
- default `getSettings().islandHoverOpen === false`;
- `setSettings({ islandHoverOpen: true })` persists `true`; a non-boolean value is ignored;
- `islandHoverOpen` is not in the exported synced key list (or the sync payload helper's keys, whichever `tab-sleep-settings.test.js` already checks);
- `settings.html` contains `id="islandHoverOpen"` inside a row that directly follows `#tabLayoutSetting` (parse the file text, as `tab-layout-settings.test.js` does).

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/unit/island-hover-open-settings.test.js`
Expected: FAIL on the default.

- [ ] **Step 3: Add the setting, schema entry, Settings row and copy**

Toggle row with `aria-describedby` pointing at the hint, `data-i18n` / `data-i18n-aria-label` keys as above. Add the English entries with `note` fields in the style of `settings.general.mouseGesturesEnabled.*`, translate them in all five languages, then `npm run copy:ack -- <locale> settings.general.islandHoverOpen.label settings.general.islandHoverOpen.hint` per locale and `npm run copy:build`.

- [ ] **Step 4: Run settings test and the substrate guards**

Run: `node --test test/unit/island-hover-open-settings.test.js && npm run substrate:check && npm run copy:check`
Expected: pass.

- [ ] **Step 5: Report pointer capability from the strip**

In `reportIslandRect`, add `hoverCapable: hoverQuery.matches` where `hoverQuery = matchMedia('(any-hover: hover) and (any-pointer: fine)')` is created once; on its `change` event call `reportIslandRect()` (the existing serialized-string dedupe sends only real changes). Add the optional field to `IslandRectReport` in `browser-api/contract.json`, run `npm run browser-api:build`, then `npm run browser-api:check` (expected pass). In the `chrome:island-rect` handler set `rt().islandHoverCapable = rect?.hoverCapable === true`.

- [ ] **Step 6: Wire main**

- `watchCursorFor`: after `updateIslandProximity(point)`, call `updateIslandHover(rt(), point, { buttonsDown: input.modifiers?.some((m) => /buttondown$/i.test(m)) })`.
- `hideOverlay` retract: after the existing `updateIslandProximity(...)`, call `updateIslandHover(rt(), point, { sampled: true })`.
- `showOverlay`: first line after the live-window guard, `suppressIslandHover()` (covers click, keyboard, ⌘L and hover itself).
- Window `blur` (where the runtime's other blur handling lives): `suppressIslandHover(runtime)`.
- Settings listener (beside the one at :11483): when `islandHoverOpen` becomes false, `suppressIslandHover` for every runtime in `windowRuntimes.all()`.
- Context menus: pass `suppressIslandHover: () => suppressIslandHover(owner)` in the deps given to the tab and group context-menu runners; each runner calls it from `menu.on('menu-will-show', ...)`.
- `updateIslandHover` applies `hoverStep`; on `start` set `runtime.islandHover.timer = setTimeout(bindWindowRuntime(runtime, fire), HOVER_OPEN_DWELL_MS)`; on `cancel` clear it. `fire` clears the timer, then opens only if the runtime still has a live window, `islandHoverEligible(runtime)` is true, and `pointInRect(runtime.islandHover.point, runtime.islandRect)`; it feeds `{type:'fired'}` and calls `showOverlay('panel')` inside that runtime when the effect is `open`.
- Clear the timer in the runtime's teardown.

- [ ] **Step 7: Run the unit suite and lint**

Run: `npm run test:unit && npm run lint`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add -A src/main src/renderer copy settings-schema browser-api test/unit
git commit -m "Open the Island on hover when the setting is on"
```

### Task 3: Desktop acceptance

**Files:**
- Modify: `spec/acceptance/island-and-commands.feature` (new `@F` scenarios tagged with the Island feature's id and `@all`)
- Create: `test/desktop/steps/island-hover-open.steps.js`
- Modify: `spec/parity-matrix.md` and `spec/features` entry for the Island feature (one line: desktop opt-in hover-open; mobile not applicable, add a `D#` divergence row since touch platforms have no hover)

**Interfaces:**
- Consumes: Task 2 test-hook `setIslandHoverOpen`, `islandHoverState`, `sendChromeMouseInput`, the existing `islandRect()` hook and overlay-mode hook.

Moves are sent with `sendChromeMouseInput({ type: 'mouseMove', x, y })` into the chrome window's webContents, at coordinates derived from `islandRect()`. First confirm in a scratch run that `sendInputEvent` mouse moves reach the `input-event` listener (assert `islandHoverState().inside` flips); if they do not, the hook must call the same internal function `watchCursorFor` calls, and the step file must say so in a comment.

- [ ] **Step 1: Write the scenarios** (spec §4.5 cases 1–9; case 10's cross-platform mouse check comes from the CI matrix plus a hand check on each OS before release):
  - off by default: rest 400 ms over the pill → panel not open;
  - on: rest 299 ms → not open; rest to 300 ms → panel open once;
  - crossing: enter and leave within 150 ms → not open after 400 ms;
  - motion inside does not postpone: moves every 50 ms for 300 ms → open at ~300 ms;
  - proximity band: rest 400 ms 100 px below the pill → not open;
  - after an outside-click dismissal with the pointer still on the pill → stays closed 600 ms; exit and re-enter → opens;
  - click during dwell → exactly one open (overlay show count from the existing hook);
  - shield popover open, or a permission prompt pending → no open;
  - hover-open works in vertical tabs (set layout `vertical`, repeat the 300 ms case).
  - turning the setting off mid-dwell: enter, switch the setting off at 150 ms through the hook → not open at 400 ms.
  Tag every scenario `@island-hover` as well as its feature id.
- [ ] **Step 2: Confirm the steps resolve**

Run: `npm run test:acceptance:dry`
Expected: no undefined or ambiguous steps.

- [ ] **Step 3: Run them green**

Run: `npm run test:acceptance:desktop -- --tags "@island-hover"` (prefix `xvfb-run -a` on Linux)
Expected: all pass.

- [ ] **Step 4: Run the full gates**

Run: `npm run test:unit && npm run substrate:check && npm run browser-api:check && npm run lint && npm run test:acceptance:desktop`
Expected: pass. Compare any unrelated acceptance failure against `main` before treating it as caused here.

- [ ] **Step 5: Commit**

```bash
git add spec test/desktop
git commit -m "Cover Island hover-open in desktop acceptance"
```
