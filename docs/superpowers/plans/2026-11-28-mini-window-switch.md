# Mini Window: switch to tabs and Spaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- A mini window's Quick Switcher also finds the profile's tabs that are elsewhere: other windows, and Spaces set aside or saved.
- It also finds Spaces again.
- Picking one goes there, and the mini window closes if it is still untouched.

**Architecture:**
- A pure module, `src/main/mini-switch.js`, builds the rows and parses their opaque keys.
- `main.js` assembles its inputs, resolves a pick (focusing a window, or `openSpaceInProfile`, then `setActiveTab`), and closes an untouched mini window.
- The overlay loads the list with its other switcher data and scores it with `matchScore`, the same as the window's own tabs.

**Tech Stack:** Electron main and sandboxed renderers; `node:test`; Cucumber with Playwright.

**Spec:** `docs/superpowers/specs/2026-11-28-mini-window-switch-design.md`

## Global Constraints

- **Mini windows only.**
  - The list handler returns `[]` for an ordinary window, and while the mini window's active tab is private.
  - An ordinary window's switcher is unchanged.
- **Never listed:**
  - private tabs;
  - tabs in other mini windows;
  - other profiles' tabs;
  - the mini window's own tabs (it already lists those as `kind: 'tab'`);
  - addresses exactly equal to `NEW_TAB_URL` (`blanc://newtab/`).
- **Favicons are PNG only:** `typeof f === 'string' && f.startsWith('data:image/png;base64,') ? f : null`, the rule `splitCornerModel` uses.
- **Keys:**
  - `t:<tabId>` for a live tab, in a window or in a held Space;
  - `s:<spaceId>:<index>` for a tab in a saved record that no runtime holds.
  - Main resolves a key again when it is picked, and never trusts the renderer's copy of a title or address.
- **Closing the mini window:** after a successful go, the mini window closes only when `miniWindowMoveCandidates(mini)` is `null` (it is untouched).
- **Copy, in all six languages** (`copy:ack`, `copy:build`):
  - `mini.switch.anotherWindow`: `Another window`
  - `mini.switch.gone`: `That tab isn't open anymore.`
- **Part 1's move stays as it is:** `chrome:workspaces-open` with `move: true` still moves.

## Review Focus

1. **A tab closed after the list was built.** The pick says `mini.switch.gone`, that row is dropped, and the panel stays open. (Task 2 unit test; Task 3 notice test.)
2. **A saved Space opened in a window after the list was built.** Its `s:` key goes to that window and selects the tab at that index when the address still matches; otherwise it just shows the Space. (Task 2 test.)
3. **A mini window that already holds a page.** After going to a Space or a tab it stays open; an untouched one closes. (F61-11 and F61-9.)
4. **A private active tab in the mini window.** No rows from elsewhere. (Task 2 test.)
5. **Two mini windows open.** Neither lists the other's tabs. (Task 1 test.)

---

### Task 1: The rows and keys (pure)

**Files:**
- Create: `src/main/mini-switch.js`
- Test: `test/unit/mini-switch.test.js`

**Interfaces:**
- Produces:
  - `miniSwitchRows({ windows, saved }) => Array<{ key, title, url, favicon, place }>`.
    - `windows`: `Array<{ mini: boolean, self: boolean, place: string|null, tabs: Array<{ id, title, url, favicon, private }> }>`.
    - `saved`: `Array<{ id, name, urls: string[], meta: Array<{ title?, favicon? }> }>`, records that no runtime holds.
    - A window that is `self` or `mini` contributes nothing.
    - A tab contributes nothing when it is private or its address is `blanc://newtab/`.
    - A window tab's title falls back to its address; a saved tab's title is `meta[i]?.title || url`.
  - `parseMiniSwitchKey(key) => { kind: 'tab', tabId } | { kind: 'saved', spaceId, index } | null`.
    - It returns `null` for any malformed key, for an index that isn't a non-negative integer, and for an empty id.

- [ ] **Step 1: Write the failing tests.**
  - `test('rows list other windows and saved Spaces, never private, mini or own tabs')`: one window with `self: true`, one with `mini: true`, an ordinary window with place `null` holding a private tab, a `blanc://newtab/` tab and a page, a held-Space window with place `'Reading'`, and a saved record `{ id: 'sp1', name: 'Later', urls: ['https://a', 'blanc://newtab/'], meta: [{ title: 'A', favicon: 'data:image/png;base64,AA' }, {}] }`.
    - Assert exact rows: `[{ key: 't:p1', title, url, favicon: null, place: null }, { key: 't:r1', ..., place: 'Reading' }, { key: 's:sp1:0', title: 'A', url: 'https://a', favicon: 'data:image/png;base64,AA', place: 'Later' }]`.
    - A non-PNG favicon such as `'data:image/svg+xml,…'` becomes `null`.
  - `test('keys parse, and malformed keys are refused')`:
    - `parseMiniSwitchKey('t:abc')` gives `{ kind: 'tab', tabId: 'abc' }`.
    - `'s:sp1:2'` gives `{ kind: 'saved', spaceId: 'sp1', index: 2 }`.
    - `'s:sp1:-1'`, `'s::0'`, `'x:1'`, `''` and `null` each give `null`.
- [ ] **Step 2: Run** `node --test test/unit/mini-switch.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/main/mini-switch.js`, with no `require('electron')`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `Mini window switch: the rows and keys (#1734)`.

### Task 2: Main, the bridge and the fork's typed bridge

**Files:**
- Modify:
  - `src/main/main.js`: new handlers beside `chrome:mini-keep`; the mini branch of `chrome:workspaces-open`; new helpers beside `moveMiniWindowToSpace`;
  - `src/main/preload.js`;
  - `browser-api/contract.json`, generated `browser-api/*`;
  - `chromium/blanc/common/browser_api/browser_api.mojom`, `chromium/blanc/island/browser-api-codec.js`, `chromium/blanc/island-assets.json`, `chromium/source-map.json` (regenerated);
  - `security/audit-surface-inventory.json`.
- Test: `test/unit/mini-switch.test.js`, `test/unit/mini-window.test.js`.

**Interfaces:**
- Consumes: `miniSwitchRows`, `parseMiniSwitchKey` (Task 1); `miniWindowMoveCandidates`, `openSpaceInProfile`, `workspaceOwner`, `setActiveTab`, `windowRuntimes.runtimeForTab`.
- Produces:
  - `browserAPI.listMiniSwitchTabs() => Promise<Array<{ key, title, url, favicon, place }>>`, over `chrome:mini-switch-tabs`.
  - `browserAPI.goToMiniSwitchTab(key: string) => Promise<{ ok: boolean, error?: 'gone' | 'busy' }>`, over `chrome:mini-switch-go`.
  - In main:
    - `miniSwitchInputs(runtime) => { windows, saved }`;
    - `goToMiniSwitchTab(runtime, key) => { ok, error? }`;
    - `closeMiniWindowIfUntouched(runtime) => boolean`.

- [ ] **Step 1: Write failing source-shape tests** in `test/unit/mini-window.test.js`, in the file's existing style.
  - `chrome:mini-switch-tabs` returns `[]` unless `rt().mini`, and while the active tab is private. Otherwise it returns `miniSwitch.miniSwitchRows(miniSwitchInputs(rt()))`.
  - `goToMiniSwitchTab` parses with `miniSwitch.parseMiniSwitchKey`, and returns `{ ok: false, error: 'gone' }` when:
    - the key is null;
    - the tab is missing or private;
    - the tab's runtime is mini or of another profile;
    - the saved record or index is missing.
  - A live tab in a resident runtime goes through `openSpaceInProfile({ profileId, spaceId: owner.workspaceId })`, then `setActiveTab(tabId)` in the returned runtime. A live tab in a window focuses that window (`show()`, `restore()` if minimized, `focus()`).
  - A saved key whose Space now has an owner focuses that owner. Otherwise it goes through `openSpaceInProfile`. Either way it selects `tabOrder[index]` when that tab's `url === record.urls[index]`.
  - Both the go handler and the mini `workspaces-open` path call `closeMiniWindowIfUntouched(runtime)` after `ok`.
  - The mini branch of `chrome:workspaces-open`:
    - `opts?.move === true` keeps part 1's move;
    - otherwise it goes: another profile through `openSpaceInProfile({ profileId: otherProfileTarget(opts), spaceId: id })`, this profile through `openSpaceInProfile({ profileId: rt().profileId, spaceId: id })`;
    - then `closeMiniWindowIfUntouched`.
- [ ] **Step 2: Run** `node --test test/unit/mini-window.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers and handlers, and two preload members (`invoke` kind).
- [ ] **Step 4: Update the contract.**
  - Add both members to `browser-api/contract.json`, with result types `MiniSwitchRow` (`key`, `title`, `url`, `favicon` nullable, `place` nullable) and `MiniSwitchResult` (`ok`, `error` optional, union `gone`/`busy`).
  - Then run `npm run browser-api:build && npm run browser-api:check` and `node chromium/tools/browser-api-mojom.mjs`.
  - Then refresh the `browser-api-codec.js` digest in `chromium/blanc/island-assets.json`, then `python3 chromium/tools/refresh-source-map.py`, then `npm run audit-inventory:write`.
- [ ] **Step 5: Run** these. Expected: all pass.
  - `node --test test/unit/mini-switch.test.js test/unit/mini-window.test.js`
  - `npm run -s browser-api:check`
  - `node chromium/tools/browser-api-mojom.mjs --check`
  - `node chromium/tools/assets.mjs --check`
  - `python3 chromium/tools/check-patches.py`
- [ ] **Step 6: Commit** `Mini window switch: main finds and goes to tabs elsewhere (#1734)`.

### Task 3: The panel and copy

**Files:**
- Modify: `src/renderer/overlay.js` (`refreshSwitcherData`, `switcherResults`, `pickResult`, the result key function, `renderList`); `copy/messages/*.json`; generated strings.
- Test: `test/unit/mini-switch-panel.test.js` (new), `test/unit/spaces-menu-move-mode.test.js`.

**Interfaces:**
- Consumes: `browserAPI.listMiniSwitchTabs` and `browserAPI.goToMiniSwitchTab` (Task 2).
- Produces:
  - `kind: 'elsewhere'` results `{ kind, title, sub, url, tab: { url, favicon }, key, score }`, keyed `elsewhere:<key>`;
  - `elsewhereTabs` (array) and `elsewhereNotice` (string) in the overlay's state.

- [ ] **Step 1: Write failing tests**, lifting each function from `overlay.js` as `test/unit/overlay-archived-results.test.js` does.
  - `switcherResults` with `state.miniWindow: true` and `elsewhereTabs: [{ key: 't:9', title: 'Docs', url: 'https://docs.example/', favicon: null, place: 'Reading' }]`, querying `'docs'`, yields an `elsewhere` row whose `sub` is `'docs.example · Reading'` and whose score sits above any favorite match and below an own-tab match. With `place: null`, the sub ends `· Another window`.
  - Space results appear again when `state.miniWindow` is true. The `spaceResults` guard is gone.
  - `pickResult` on an `elsewhere` row calls `goToMiniSwitchTab('t:9')` and does not call `closeOverlay` at once. On `{ ok: false, error: 'gone' }` it removes the row from `elsewhereTabs`, sets `elsewhereNotice` to `mini.switch.gone`, and re-renders. On `{ ok: true }` it calls `closeOverlay`.
  - `refreshSwitcherData` calls `listMiniSwitchTabs` only when `state.miniWindow` is true, and otherwise sets `elsewhereTabs = []`.
  - Update `spaces-menu-move-mode.test.js` so it no longer requires the `spaceResults` exclusion.
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `elsewhereNotice` renders as one `emptyRow(...)` with the `command-notice` class at the top of the switcher results, and clears when the input changes.
  - Add the two copy keys in all six languages, then run `npm run copy:ack -- <locale> <keys>` and `npm run copy:build`.
- [ ] **Step 4: Run** these. Expected: all pass, and the full unit suite passes (5985 or more tests).
  - `node --test test/unit/mini-switch-panel.test.js test/unit/spaces-menu-move-mode.test.js`
  - `npm run -s copy:check`
  - `npm run -s substrate:check`
  - `npm run -s test:unit`
- [ ] **Step 5: Commit** `Mini window switch: the panel finds tabs and Spaces elsewhere (#1734)`.

### Task 4: Acceptance and docs

**Files:**
- Modify:
  - `spec/acceptance/mini-window.feature`, `test/desktop/steps/mini-window.steps.js`, `test/desktop/cucumber.mjs` (add `@F61-9`, `@F61-10`, `@F61-11` to `RUNNABLE`);
  - `spec/features.md` (F61), `spec/acceptance/index.md`, `spec/parity-matrix.md`;
  - `CLAUDE.md` (the Mini Window paragraph), `docs/press/release-notes/unreleased.md`, and the spec's Status line.

- [ ] **Step 1: Add the scenarios.** Drive the real overlay of the mini window, using part 1's `miniWindowOverlay` hook, to type into `#addressInput` and click a row.
  - **F61-9, a tab in another window:** given an ordinary window showing fixture page "elsewhere-docs", when I open a mini window, type "elsewhere-docs" and pick that row, then that window is focused with that tab active and the mini window has closed.
  - **F61-10, a tab in a Space set aside:** given a saved Space "Reading" with fixture page "reading-notes", open in no window, when I open a mini window and pick "reading-notes", then a window shows "Reading" with that tab active and the mini window has closed.
  - **F61-11, a Space by name, mini window kept:** given a saved Space "Reading", when I open a mini window, open a fixture page in it, type "Reading" and pick the Space, then a window shows "Reading" and the mini window is still open with its page.
- [ ] **Step 2: Run** `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @F61`. Expected: 11 scenarios pass. Positive control: with `pickResult`'s `elsewhere` branch removed, F61-9 fails.
- [ ] **Step 3: Update the docs** listed above. In the release notes, Added gets "Switch to tabs and Spaces from a mini window", and "Still open" gets the hand check.
- [ ] **Step 4: Run** `npm run -s lint`, `npm run -s test:unit` and `npm run -s substrate:check`. Expected: all pass.
- [ ] **Step 5: Commit** `Mini window switch: acceptance and docs (#1734)`.

## After Part A

The fork port goes on `chromium/next`, like part 1's Part B:
- **The host:** `listMiniSwitchTabs` and `goToMiniSwitchTab` use native requests that already exist, or small new ones.
- **The pin:** the overlay file moves to the merged shipping commit through `spaces-menu.json`, and the `MENU_EDITS` stay where needed.
- **The check:** a native test for F61-9 to F61-11 on the Mac Studio.

Its plan is written once shipping merges.
