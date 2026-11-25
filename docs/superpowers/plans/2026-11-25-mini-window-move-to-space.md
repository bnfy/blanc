# Mini Window: Move to Space Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mini window's Spaces button (and File → Move to Space ▸) moves all its tabs into a Space of its profile, or a new one, then closes the mini window and brings that Space forward — in shipping Blanc (Electron, Part A) and in Blanc Beta (the Chromium fork, Part B).

**Order (owner, November 25, 2026: both builds):** Part A is one PR to `main`. Part B goes on `chromium/next` after Part A merges, because the fork takes the Island's menu files from a pinned shipping commit; it never carries Electron changes, and Part A never carries fork changes.

**Architecture:** A pure helper in `src/main/mini-window.js` picks the tabs to move (blank start pages left out). `main.js` gets one function, `moveMiniWindowToSpace`, built on the existing write-first `moveTabsToSpace` and `openSpaceInProfile`. The two Spaces-menu handlers that refuse a mini window today (`chrome:workspaces-open`, `chrome:workspaces-create-blank`) route to it instead. The renderer adds a Spaces button beside Open in Blanc, and the Spaces menu learns a move mode.

**Tech Stack:** Electron main + sandboxed renderers, `node:test` unit tests (source-shape assertions as in `test/unit/mini-window.test.js`), Cucumber + Playwright acceptance.

**Spec:** `docs/superpowers/specs/2026-11-25-mini-window-move-to-space-design.md`

## Global Constraints

- Only the mini window's own profile's Spaces are offered or accepted; another profile's id is refused with `'busy'`.
- All or nothing: if any tab to move fails `canMoveTabToSpace(tab, runtime, true)`, nothing moves.
- An unused New Tab page (`tab.url === NEW_TAB_URL && !newTabPageUsed(tab)`) is never moved and never blocks; it closes with the window.
- `saveCurrentWindowAsWorkspace`, `switchWindowToWorkspace` and `createBlankWorkspaceAndSwitch` keep `if (runtime.mini) return { ok: false, error: 'busy' };` (a mini window still never *becomes* a Space window).
- Every new English string goes into `copy/messages/en.json` and all five translations (`de`, `es`, `fr`, `pt-BR`, `it`) in the same PR, then `npm run copy:ack` and `npm run copy:build`.
- Chrome-level changes need an app relaunch to verify (`npm start`), not a tab reload.

## Review Focus

1. **The Space is already open in an ordinary window**: that window comes forward with the tabs at the end of its tab order; no second window opens. (Task 2 test.)
2. **A private tab or a page playing sound in the mini window**: nothing moves, the mini window stays, and the Spaces menu shows the move error. (Task 2 test.)
3. **Only a blank start page**: the button is disabled and the main handler refuses with `'busy'`; the window doesn't close. (Tasks 1 and 3 tests.)
4. **Moving a split or a group**: they arrive whole (already handled by `moveTabsToSpace`'s units); the acceptance scenario moves two tabs, one grouped. (Task 5.)
5. **New Space… with a duplicate name**: the editor shows the existing name error and the mini window stays (create validation fails before any move). (Task 2 test.)

---

## Part A: shipping Blanc (Electron), one PR to `main`

### Task 1: Pick the tabs a mini window moves

**Files:**
- Modify: `src/main/mini-window.js` (add and export the helper)
- Test: `test/unit/mini-window.test.js`

**Interfaces:**
- Produces: `miniWindowMoveIds(entries: Array<{ id: number, blank: boolean }>) => number[]` — the ids in order with every `blank: true` entry left out; `[]` when nothing is left.

- [ ] **Step 1: Write the failing test** `test('a mini window moves every tab but an unused start page', ...)`:
  `assert.deepEqual(mini.miniWindowMoveIds([{ id: 1, blank: true }, { id: 2, blank: false }, { id: 3, blank: false }]), [2, 3]);`
  `assert.deepEqual(mini.miniWindowMoveIds([{ id: 1, blank: true }]), []);`
  `assert.deepEqual(mini.miniWindowMoveIds([]), []);`
- [ ] **Step 2: Run** `node --test test/unit/mini-window.test.js` — expect FAIL (`miniWindowMoveIds is not a function`).
- [ ] **Step 3: Implement** `miniWindowMoveIds` in `src/main/mini-window.js` and add it to `module.exports`.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Commit** `Mini window: pick the tabs Move to Space takes (#1734)`.

### Task 2: Move a mini window to a Space in main

**Files:**
- Modify: `src/main/main.js` — new `moveMiniWindowToSpace` beside `keepMiniWindow` (~line 14084); the `chrome:workspaces-open` and `chrome:workspaces-create-blank` handlers (~line 12444–12470); the tab payloads (~7370 and ~12136); the mini File menu item (~12936).
- Test: `test/unit/mini-window.test.js`

**Interfaces:**
- Consumes: `miniWindowMoveIds` (Task 1).
- Produces:
  - `moveMiniWindowToSpace(runtime, workspaceId: string|null, creation: {name, color?, symbol?}|null) => { ok: boolean, error?: string, movedCount?: number, workspaceId?: string }`.
  - Tab payload field `miniWindowCanMove: boolean` (true when `runtime.mini`, `miniWindowMoveIds` is non-empty and every id passes `canMoveTabToSpace(tab, runtime, true)`), sent next to `miniWindow` in both payloads.

- [ ] **Step 1: Write failing source-shape tests** in `test/unit/mini-window.test.js`:
  - `test('a mini window moves to a Space of its own profile, then closes', ...)`: extract the body of `function moveMiniWindowToSpace` and assert it (a) calls `miniWindow.miniWindowMoveIds(`; (b) checks `canMoveTabToSpace(tabs.get(id), runtime, true)` for every id before moving; (c) calls `moveTabsToSpace(ids, workspaceId, creation)` inside `withWindowRuntime(runtime, `; (d) on `result.ok` calls `runtime.window.close()` and then `openSpaceInProfile({ profileId: runtime.profileId, spaceId:`; (e) on failure calls `showOverlay('spaces', { purpose: { spaceMoveError:`.
  - In `chrome:workspaces-open`'s handler: `if (rt().mini) return otherProfileTarget(opts) ? { ok: false, error: 'busy' } : { ...moveMiniWindowToSpace(rt(), id, null), ...workspacesProjection() };`
  - In `chrome:workspaces-create-blank`'s handler: the mini branch calls `moveMiniWindowToSpace(rt(), null, { name,` and refuses another profile with `'busy'`.
  - Update `'Open in Blanc keeps it as an ordinary window'`: `miniWindowCanMove:` appears twice in `main.js`'s payloads.
  - Keep `'a mini window holds no Space'` as is (the three functions stay `'busy'`).
- [ ] **Step 2: Run** `node --test test/unit/mini-window.test.js` — expect the new tests to FAIL.
- [ ] **Step 3: Implement `moveMiniWindowToSpace`.** Order: refuse unless `runtime.mini` and live (same guard as `keepMiniWindow`); build entries `{ id, blank: tab.url === NEW_TAB_URL && !newTabPageUsed(tab) }` from `runtime.tabOrder`; empty ids or any failing `canMoveTabToSpace` → show the move error (`error: 'busy'`) and return; move; on `ok`, note `spaceId = workspaceId ?? result.workspaceId`, close the window, then `openSpaceInProfile`. A `creation` that fails validation returns its error without showing the overlay error (the editor shows it, as `createSpaceWithTabs` does).
- [ ] **Step 4: Wire the handlers and payloads** as the tests assert; the File menu's mini item list gains `Move to Space ▸` (submenu from `spaceMoveTargets(runtime)`, each enabled when `space.enabled && miniWindowCanMove`, clicking `moveMiniWindowToSpace(runtime, space.id, null)`; then `New Space…` → `showOverlay('spaces', { purpose: { miniNewSpace: true } })`), label key `mini.moveToSpace.menu`.
- [ ] **Step 5: Run** `node --test test/unit/mini-window.test.js` and `npm run browser-api:check` — expect PASS. If the check names `miniWindowCanMove` or a new `error` literal, edit `browser-api/contract.json`, run `npm run browser-api:build`, and commit the regenerated vectors.
- [ ] **Step 6: Commit** `Mini window: move its tabs to a Space and close (#1734)`.

### Task 3: The Spaces button on a mini window's Island

**Files:**
- Modify: `src/renderer/index.html` (button after `#pillMiniOpen`), `src/renderer/renderer.js` (~1217–1230, 1343), `src/renderer/styles.css` (~1653–1682)
- Test: `test/unit/mini-window.test.js`

**Interfaces:**
- Consumes: `state.miniWindow`, `state.miniWindowCanMove` (Task 2); the existing `window.browserAPI.openSpacesMenu({ ...spacesAnchor(), closing })`.
- Produces: `#pillMiniSpaces` — `<button id="pillMiniSpaces" class="mini-spaces" type="button" aria-haspopup="dialog" aria-expanded="false" data-i18n-tooltip="mini.moveToSpace.title" data-i18n-aria-label="mini.moveToSpace.label" hidden>` holding the same planet icon as the ⌘L footer's Spaces button.

- [ ] **Step 1: Write failing tests**: `renderer.js` matches `pillMiniSpaces.hidden = !miniWindow;` and `pillMiniSpaces.disabled = !state.miniWindowCanMove;`; its click handler calls `window.browserAPI.openSpacesMenu(` with the same `pressedWhileOpen` toggle `pillSpace` uses; `index.html` matches the button above; `styles.css` styles `#pillMiniSpaces` with the `#pillMiniOpen` rules (shared selector, icon-only padding) and `#pillMiniSpaces:disabled` at reduced opacity with `cursor: default`.
- [ ] **Step 2: Run** the test file — FAIL.
- [ ] **Step 3: Implement**, keeping styling in `styles.css` (no inline styles). Keep `aria-expanded` in sync the way `pillSpace` is (from the spaces overlay state broadcast).
- [ ] **Step 4: Run** the test file — PASS.
- [ ] **Step 5: Commit** `Mini window: Spaces button beside Open in Blanc (#1734)`.

### Task 4: The Spaces menu's move mode, and copy

**Files:**
- Modify: `src/renderer/overlay.js` (~4052–4053, 4116; purpose handling ~2987–3055), `src/renderer/workspace-ui.js` (menu render; `beginNew` ~217), `copy/messages/en.json` + `de/es/fr/pt-BR/it`, generated `src/renderer/pages/strings.*.js`
- Test: `test/unit/mini-window.test.js`, `npm run copy:check`, `npm run test:i18n:desktop`

**Interfaces:**
- Consumes: overlay payload `miniWindow`, purpose `miniNewSpace` (Task 2).
- Produces: `workspaceUI.setMoveMode(on: boolean)`; in move mode the menu (a) leads with the header line `ws.moveMode.header`, (b) lists only this profile's Spaces (no other-profile sections), (c) hides each row's edit, reorder and delete controls, (d) opens New Space… with `beginNew({ thisProfile: true })`, so no Profile choice shows. The current Space row is never marked (a mini window has none).

Copy (English, exact):
- `mini.moveToSpace.label`: `Move to Space — move this mini window's tabs to a Space`
- `mini.moveToSpace.title`: `Move this mini window's tabs to a Space`
- `mini.moveToSpace.menu`: `Move to Space`
- `ws.moveMode.header`: `Move this window to…`

- [ ] **Step 1: Write failing tests**: `overlay.js` calls `workspaceUI.setMoveMode(payload.miniWindow === true)` where it toggles `data-mini-window`, and handles `purpose?.miniNewSpace` by `workspaceUI.beginNew({ thisProfile: true })` (or the module's existing entry for New Space…); `workspace-ui.js` reads `t('ws.moveMode.header')` and skips other-profile sections when move mode is on.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; remove the CSS rule that hides the ⌘L footer's Spaces button in a mini window only if it now opens move mode correctly (otherwise leave it hidden and say so in the PR).
- [ ] **Step 4: Add the copy** to all six catalogs, `npm run copy:ack -- <locale> <keys>` for each translation, `npm run copy:build`.
- [ ] **Step 5: Run** `node --test test/unit/mini-window.test.js`, `npm run copy:check`, `npm run substrate:check` — PASS.
- [ ] **Step 6: Commit** `Mini window: the Spaces menu's move mode (#1734)`.

### Task 5: Acceptance, spec and parity docs

**Files:**
- Modify: `spec/acceptance/mini-window.feature`, `test/desktop/steps/mini-window.steps.js`, `docs/superpowers/specs/2026-11-02-mini-window-design.md` ("Not in PR 1" bullet and D2 exception), the new spec's Status line, `spec/` F61 entry and `spec/parity-matrix.md` if they list F61 behaviors.

- [ ] **Step 1: Add scenarios**:
  - `@F61-6 @F61 Scenario: moving a mini window to a Space closes it and shows the Space` — Given a saved Space "Reading" in this profile; When I open a mini window; And I open a fixture page in it and a second tab in a group; And I choose "Reading" from the mini window's Spaces button; Then the mini window has closed; And the window showing "Reading" ends with those two pages, the group kept.
  - `@F61-7 @F61 Scenario: a mini window moves to a new Space, unless a page can't move` — When I open a mini window; And I open a private tab in it; Then the mini window's Spaces button refuses with the move error and the window stays; When I close the private tab and open a fixture page; And I create the Space "Later" from the mini window's Spaces menu; Then the mini window has closed and a window shows "Later" with the fixture page.
- [ ] **Step 2: Implement steps** in `mini-window.steps.js` through the test hook (`globalThis.__blanc`) and the overlay's real buttons, as the existing steps do.
- [ ] **Step 3: Run** `npm run test:acceptance:dry` then `npx cucumber-js --profile runnable --tags @F61` via `npm run test:acceptance:desktop -- --tags @F61` — all F61 pass.
- [ ] **Step 4: Update docs** as listed; run `npm run test:unit`, `npm run lint`.
- [ ] **Step 5: Relaunch** `npm start`, open a mini window, move it to a Space and to a new Space, and capture a screenshot of the Island's two buttons and the move-mode menu for the PR.
- [ ] **Step 6: Commit** `Mini window: acceptance and docs for Move to Space (#1734)`.

## Part B: Blanc Beta (the Chromium fork), on `chromium/next`

Starts after Part A's PR merges (its merge commit is `<A>` below). Work in a checkout of `chromium/next`; push verified work there without a PR (owner rule, November 14, 2026). Run the fork's unit suite locally (`node --test chromium/tools/*.test.mjs chromium/tests/*.test.mjs chromium/release/*.test.mjs`) and the fork's Island suite on the Mac Studio. Build only through `chromium/tools/build.mjs` after `chromium/tools/apply.py`, never while another build runs.

### Task 6: The fork's Island takes the button and the move mode

**Files:**
- Modify: `chromium/blanc/spaces-menu.json` (`commit` → `<A>`; add the four Task 4 keys to `messages`), `chromium/tools/island-renderer.mjs` (anchored edits for `index.html`, `renderer.js` and `styles.css`, which stay at the v1.49.1 renderer pin), `chromium/tools/spaces-across-profiles.test.mjs` / `island-renderer.test.mjs`; regenerated `chromium/blanc/island/*`.

**Interfaces:**
- Consumes: Part A's `#pillMiniSpaces` markup, its renderer lines and CSS (Task 3), and `workspaceUI.setMoveMode` / `purpose.miniNewSpace` (Task 4), all from `<A>`.

- [ ] **Step 1: Failing tests**: the pin test expects `spaces-menu.json`'s commit to be `<A>` and its messages to include `mini.moveToSpace.label`, `mini.moveToSpace.title`, `mini.moveToSpace.menu`, `ws.moveMode.header`; the renderer test expects the generated `chromium/blanc/island/index.html` to contain `id="pillMiniSpaces"` and `renderer.js` to contain `pillMiniSpaces.disabled = !state.miniWindowCanMove;`.
- [ ] **Step 2: Run** `node --test chromium/tools/spaces-across-profiles.test.mjs chromium/tools/island-renderer.test.mjs` — FAIL.
- [ ] **Step 3: Implement**: move the pin, add the anchored edits copied from Part A's diff (each anchor must match exactly once, as the existing ones do), regenerate the Island with `node chromium/tools/island-renderer.mjs --write` and the strings with `chromium/tools/interface-strings.mjs`. First diff `workspace-ui.js` and `overlay.js` from the current pin `f91530b2` to `<A>`: if anything besides #1734 changed them and needs renderer code the v1.49.1 pin lacks, keep the pin and carry #1734 as anchored edits on those two files too.
- [ ] **Step 4: Run** the same tests — PASS. Update the pin record's `note` to name #1734.
- [ ] **Step 5: Commit** `Fork mini window: the Island's Spaces button and move mode (#1734)`.

### Task 7: The fork moves a mini window to a Space

**Files:**
- Modify: `chromium/blanc/browser/ui/mini_window_controller.inc` (new `MoveMiniWindowToSpace`), `chromium/blanc/browser/ui/blanc_prototype_ui.cc` (the Island's open-Space and create-blank-Space requests near line 10844 and the tab payload's `miniWindow` field), `chromium/blanc/island/host.js` (`createBlankWorkspace` and the open-Space call pass through unchanged; no new bridge method), the native test for mini windows beside the existing ones in `chromium/tests/`.

**Interfaces:**
- Consumes: `IsMiniWindow(browser)`, `CanMoveTabToSpace(model, index, true)`, the batch Space move used by `batch-space-move`, and `OpenSpaceInProfile(from, profile_id, space, reply)`.
- Produces: `void MoveMiniWindowToSpace(BrowserWindowInterface* mini, const std::string& space_id_or_empty, std::optional<SpaceCreation> creation, ReplyCallback reply)`, and the payload field `miniWindowCanMove` with shipping's meaning (Task 2).

- [ ] **Step 1: Failing test**: in a test build (`blanc::BlancTestLaunch()` hooks), open a mini window with two pages and one unused `chrome://newtab/`, request the Space "Reading" from its Island; expect the mini window closed, the window showing "Reading" ending with the two pages, and no new-tab page moved. Second case: a private (incognito) page or an audible page makes the request reply `refused` and the mini window stays.
- [ ] **Step 2: Run** it on the Mac Studio's BlancPrototype build — FAIL.
- [ ] **Step 3: Implement** with shipping's rules (Global Constraints): skip an unused New Tab page (`chrome://newtab/` or the fork's Start Page address, no back/forward history); all or nothing; another profile's Space → `refused`; on success close the mini window (`browser->GetWindow()->Close()`, after `ForgetMiniWindow`) and open the Space through `OpenSpaceInProfile` for the mini window's own profile; a create request makes the Space with those pages first. Replace today's mini-window refusal of these two requests with the call.
- [ ] **Step 4: Build** (`build.mjs SRC --build --out=BlancPrototype`), **run** the test and the fork unit suite — PASS. Record fresh patch file/hunk totals in the plan (`chromium/STATUS.md`), as the patch budget rule asks.
- [ ] **Step 5: Commit and push** to `chromium/next`: `Fork mini window: move its pages to a Space and close (#1734)`.

### Task 8: Fork suite and records

- [ ] **Step 1:** Run the F61 acceptance scenarios (including F61-6 and F61-7) against BlancPrototype on the Mac Studio over SSH; fix or record any fork-only exclusion with its reason in the suite's exclusion list.
- [ ] **Step 2:** Update `chromium/STATUS.md` (desktop Mini Window row) and `chromium/PLATFORMS.md` if Windows or Linux differ; note that Windows and Linux carry it through the same desktop lane at the next nightly.
- [ ] **Step 3:** Commit and push to `chromium/next`. It ships in the next Blanc Beta built from `chromium/next`; make no public claim before that release's claims ledger lists it.
