# Glance PR 3: Polish and Discoverability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Glance moves like the rest of the chrome, its picker reads as one family with the ⌘L panel, the reference's private state has a visible chip, and Glance is reachable from `/glance` and **Open Link in Glance**.

**Architecture:** Every change is additive to the shipped Glance. Motion is stylesheet-only (`transition` + `@starting-style` + `display … allow-discrete`, the Spaces menu pattern), with main delaying the overlay's detach for `glance` as it does for `spaces`. Picker rows change in `overlay.js` and `styles.css` only; the picker keeps its own data path. `/glance` is one more slash command through the existing registry (`copy/slash-commands.json` → `copy:build`), and **Open Link in Glance** is one more page context-menu item whose work main owns (`openLinkInGlance`), through the same `handOffToOs` / `isForbiddenTopLevelUrl` guards as **Open Link in New Tab**. Nothing new is persisted, synced or sent anywhere.

**Tech Stack:** Electron 44 (main process + two sandboxed chrome renderers), CSS transitions with `@starting-style`, Cucumber + Playwright-Electron acceptance tests driven through `src/main/test-hook.js`, `node --test` unit tests, the copy catalog (`copy/messages/*.json`, `npm run copy:build` / `copy:ack`), the slash-command registry (`copy/slash-commands.json`), the bridge contract (`browser-api/contract.json`, `npm run browser-api:build`).

**Spec:** `docs/superpowers/specs/2026-10-15-glance-refinement-design.md`, Delivery item 3 and the sections *Motion*, *Picker rows*, *Discoverability*, *Accessibility*, *The header* (private chip) and *Amendments to earlier documents*. PRs 1 (#842) and 2 (#844) are merged; this plan starts from `main` at `57169b3d`.

**Already landed, not repeated here:** the **Open in Glance / Close Glance** toggle in the tab context menu and the ⌘L row chip (PR 2, `tab-context-menu-model.js` and `overlay.js` ~680), the header's right-click menu (PR 2), the drag-reorder live region outside the picker (PR 1), the Back and Reload buttons and Make main's name and swap glyph (PR 2), and the 1Password note (PR 2).

## Global Constraints

- Motion introduces no new curve or duration: opacity 140 ms `ease`, transform 340 ms `cubic-bezier(.2, .9, .25, 1)`, cross-fades 120 ms; under `prefers-reduced-motion: reduce` every transition collapses to a 140 ms opacity fade (the Spaces switcher's rule, `styles.css` `@media (prefers-reduced-motion: reduce)` near line 3700).
- Native `WebContentsView` bounds are never animated; the two pages take their new bounds at once.
- The picker keeps its separate document section and data path: open tabs of this window and profile only.
- Every Blanc-authored string lives in `copy/messages/en.json` under a stable key, and a PR that adds English adds `de`, `es`, `fr`, `pt-BR` and `it` in the same PR, acknowledged with `npm run copy:ack -- <locale> <keys>` (F44). Never `innerHTML` a message; static HTML keeps English inline with `data-i18n*` keys.
- A slash command exists in four places that `npm run copy:check` keeps in step: `copy/slash-commands.json`, `src/renderer/overlay.js` (the `/` list), `src/renderer/pages/shortcuts.js`, and `en.json` (`slash.<name>.hint`, and `slash.<name>.doc` when the registry entry has a `doc`).
- A changed bridge member needs `browser-api/contract.json` changed with it, then `npm run browser-api:build` (regenerates `browser-api/generated/vectors.json`, committed together).
- Boundary-file edits (`src/main/main.js`, `tab-view.js`, `test-hook.js`, `context-menu.js`, `preload.js`) need `npm run audit-inventory:write` before the commit.
- Main keeps ownership of attachment, bounds, focus and role changes; `focusedPaneTabId` never leaves main. **Open Link in Glance** goes through `handOffToOs` and `isForbiddenTopLevelUrl` and creates the tab in the opener's profile, private flag and group.
- User-visible strings say *quiet*, never *asleep*; internals keep `asleep`.
- CSS for new states, never inline styles from JS (the user's rule); tests use the test hook, and keyboard routing scenarios deliver keys with `sendInputEvent`.
- Commit per task; `npm run lint`, `npm run substrate:check`, `npm run test:unit` and the Glance scenarios (`npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @glance`) pass before the PR; one whole-branch review at the end.

## Review Focus

1. **A `mailto:` or `javascript:` link with Open Link in Glance.** Nothing may open in Glance; `mailto:` is handed to the OS and a forbidden top-level URL is dropped, as **Open Link in New Tab** already does. Pinned by Task 6's unit test of `openLinkInGlance`.
2. **Open Link in Glance from a private reference.** The new reference must be private, in the private session, and replace the current reference without touching the main page. Pinned by Task 6's private scenario.
3. **`/glance` with nothing to show.** With one tab, or with both tabs already the two panes, the picker must open with "Open another tab to use Glance" and the typed filter kept, not refuse silently. Pinned by Task 5's empty-state scenario.
4. **Reduce Motion while Glance opens and closes.** The header and divider must fade only, with no transform transition, and the picker must leave without a scale. Pinned by Task 1's reduced-motion scenario.
5. **A quiet tab chosen in the picker, then cancelled.** The row must say "Opening…" while it wakes and return to its ordinary line when the wake is cancelled, with no stale state on the next open. Pinned by Task 2's "Opening…" scenario together with the existing "A picker re-opened after a cancelled wake shows no stale error".

---

## File structure

- `src/renderer/styles.css`: header and divider transitions, picker enter/exit, Make main cross-fade, grip transition, picker row vocabulary, the header's private chip. The reduced-motion block near line 3700 grows the Glance rules.
- `src/renderer/overlay.js`: picker rows (labels, tooltip, quiet/private/opening states), key handling (Home/End, no re-announce), `data-closing="glance"` on exit, the `/glance` command, prefill on show.
- `src/renderer/overlay.html`: the picker as `role="dialog"`.
- `src/renderer/renderer.js` + `src/renderer/index.html`: the header's private chip and the Make main cross-fade hook.
- `src/main/main.js`: `hideOverlay` delays the `glance` detach; `openGlancePicker(query)`; `openLinkInGlance(tab, url)`; the promote announcement with both titles.
- `src/main/tab-view.js`: the context menu's `openInGlance` action → `deps.openLinkInGlance`.
- `src/main/context-menu.js`: the **Open Link in Glance** item; `linkMenuItems(params, actions, t)` exported for tests.
- `src/main/preload.js`, `browser-api/contract.json`: `openGlancePicker(query)`.
- `src/main/test-hook.js`: `openLinkInGlance(tabId, url)`, `openGlancePicker(query)`, `glanceHeaderMotion()`.
- `copy/slash-commands.json`, `copy/messages/*.json`, `src/renderer/pages/shortcuts.js`: `/glance`.
- `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`, `test/unit/*.test.js`: the tests below.
- `spec/features.md` (F34), `docs/superpowers/specs/2026-08-15-glance-design.md`, `design-qa.md`: the amendments.

---

### Task 1: Motion for the header, divider and picker

**Files:**
- Modify: `src/renderer/styles.css` (`.glance-header` ~275, `.glance-divider` ~427, `.glance-picker` ~2066, the reduced-motion block ~3700)
- Modify: `src/renderer/overlay.js` (the `overlay:hide` handling near `endSpacesExit`, ~2236)
- Modify: `src/main/main.js` (`hideOverlay`, ~3540: `OVERLAY_RETRACT_MS` branch)
- Modify: `src/main/test-hook.js` (new `glanceHeaderMotion()`)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Produces: test hook `glanceHeaderMotion()` → `{ header: { transition, transform, opacity }, divider: { transition }, picker: { transition, transformOrigin } | null }` read from the strip's and overlay's computed styles; `data-closing="glance"` on the overlay body while main holds the view after `overlay:hide`.

- [ ] **Step 1: Write the failing scenarios**

```gherkin
  @F34-1 @F34 @D11
  Scenario: Glance opens and closes with the chrome's motion
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    Then the Glance header and divider glide in on the chrome's curve
    When I choose Change from the Glance header
    Then the Change picker grows out of the Change control
    When I press Escape in the Change picker
    Then the picker is still drawn while it leaves

  @F34-1 @F34 @D11
  Scenario: With Reduce Motion Glance only fades
    Given two ordinary tabs in one workspace for Glance
    And Reduce Motion is on
    When I open the reference tab in Glance
    Then the Glance header and divider only fade
```

Steps: "glide in" reads `glanceHeaderMotion()` and asserts `header.transition` contains `opacity 0.14s` and `transform 0.34s cubic-bezier(0.2, 0.9, 0.25, 1)` and `divider.transition` contains the same; "grows out of the Change control" asserts `picker.transition` contains `transform 0.34s` and `picker.transformOrigin` is right of centre (`parseFloat(x) > overlay width / 2`); "still drawn while it leaves" asserts, within 150 ms of `closeOverlay('cancel')`, that `overlayMode()` is `null` and `overlayViewBounds()` is still non-null and the overlay body has `data-closing="glance"`; "only fade" asserts `header.transition` contains `opacity 0.14s` and no `transform`. "Reduce Motion is on" exists in `spaces-redesign.steps.js` (Playwright + hook emulation; it waits for the strip to report it). Add `@F34-1 @F34 @D11` tags as the other scenarios do.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @glance --name "chrome's motion|only fades"`
Expected: FAIL: `glanceHeaderMotion` is not a function on the hook (first scenario), and the transition assertion fails once the hook exists.

- [ ] **Step 3: Add `glanceHeaderMotion()` to `src/main/test-hook.js`**

Reads `getComputedStyle` of `#glanceHeader`, `#glanceDivider` (strip) and `#glancePicker` (overlay, `null` when no overlay) through `executeJavaScript`, the same shape as `pillPlaceholderState`.

- [ ] **Step 4: Stylesheet: header and divider enter/exit**

In `styles.css`, give `.glance-header` and `.glance-divider` `transition: opacity 140ms ease, transform 340ms cubic-bezier(.2, .9, .25, 1), display 340ms allow-discrete;`, a hidden state `[hidden] { display: none; opacity: 0; transform: translateX(6px) }` (vertical direction: `translateY(6px)`), and `@starting-style` blocks for `:not([hidden])` with the same offset, mirroring `#workspaceSwitcher` at ~3501. The `[hidden]` rule replaces the bare `display: none` ones at ~291 and ~436. The divider's `> span` gets `transition: background-color 120ms ease` (the grip colour).

- [ ] **Step 5: Stylesheet: picker enter/exit**

`.glance-picker` gets the Spaces menu's `transition` and a `[hidden]` state `opacity: 0; transform: translateX(-50%) scale(.92) translateY(6px)` (the change purpose: `transform: scale(.92) translateY(6px)`, since it has `transform: none` at rest), `@starting-style` to match, `transform-origin: 50% 0` at rest and, for `body[data-glance-purpose="change"]`, `transform-origin: calc(100% - 44px) 0` (under the Change caret). Keep the picker drawn while closing: `body[data-closing="glance"] .glance-picker` keeps its placement, the same device as `body[data-closing="spaces"]` at ~3703.

- [ ] **Step 6: Overlay and main keep the picker through its exit**

`overlay.js`: in the `overlay:hide` handler, when the closing mode is `glance`, set `document.body.dataset.closing = 'glance'` and clear it on the same `RETRACT_MS` timer the spaces exit uses (`endSpacesExit` generalises to `endOverlayExit`). `main.js` `hideOverlay`: the delayed `hideOverlayView` branch (`retracts || closingMode === 'spaces'`) also covers `closingMode === 'glance'`.

- [ ] **Step 7: Reduced motion**

In the `@media (prefers-reduced-motion: reduce)` block near 3700 add `.glance-header, .glance-header[hidden], .glance-divider, .glance-divider[hidden], .glance-picker, .glance-picker[hidden] { transform: none; transition: opacity 140ms ease, display 140ms allow-discrete; }` plus the matching `@starting-style` `transform: none` rules (keep `translateX(-50%)` on the open picker, which centres it).

- [ ] **Step 8: Run the two scenarios and the existing Glance scenarios**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @glance`
Expected: 55 scenarios pass (53 + 2). "Closing Glance takes the Change picker with it" and "Cancelling a Change picker after its reference closed…" still pass with the delayed detach.

- [ ] **Step 9: Commit**

```bash
npm run audit-inventory:write
git add src/renderer/styles.css src/renderer/overlay.js src/main/main.js src/main/test-hook.js security/audit-surface-inventory.json spec/acceptance/glance.feature test/desktop/steps/glance.steps.js
git commit -m "Give Glance the chrome's motion: header, divider and picker"
```

---

### Task 2: Picker rows in the ⌘L panel's vocabulary

**Files:**
- Modify: `src/renderer/overlay.js` (`renderGlancePicker` ~446, the `keydown` handler ~529, `chooseGlanceTab` ~416)
- Modify: `src/renderer/styles.css` (`.glance-picker` radius, `.glance-picker-option*` ~2143–2190, `.glance-picker-hint` font size, `.glance-picker-state`)
- Modify: `copy/messages/en.json` + five translations (new `glance.picker.opening`: "Opening…")
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Produces: picker rows with `title` tooltip `"{title} — {host}"`, `aria-label` joined with `", "`, class `quiet` on quiet tabs, a `.row-private` chip on private tabs, and `data-opening="true"` on the chosen row while it wakes.

- [ ] **Step 1: Write the failing scenarios**

```gherkin
  @F34-1 @F34 @D11
  Scenario: Picker rows read like the panel's rows
    Given a quiet background tab and a private background tab eligible for Glance
    When I open the Glance picker
    Then the quiet row is dimmed and says quiet only to assistive tech
    And the private row carries the private chip
    And every picker row has a tooltip with its title and host
    And the row names join their parts with commas

  @F34-1 @F34 @D11
  Scenario: Arrow keys move the highlight quietly
    Given twelve ordinary tabs with one open in Glance
    When I choose Change from the Glance header
    And I press ArrowDown in the picker
    Then the live region did not re-announce the count
    When I press Home in the picker filter
    Then the caret is at the start of the filter and the first row is still highlighted

  @F34-1 @F34 @D11
  Scenario: A chosen quiet tab says Opening while it wakes
    Given a quiet background tab that loads slowly
    When I open the Glance picker and choose the slow quiet tab
    Then the chosen row says Opening and the live region says it
    And the other rows are dimmed
```

Step notes: "says quiet only to assistive tech": the row has class `quiet`, its visible `.glance-picker-option-sub` text does not contain "quiet", its `aria-label` does; "private chip": the row contains `.row-private` with text `private`; tooltip: `row.title === `${title} — ${host}``; names: `aria-label` contains `", "` and not `" · "`. "did not re-announce": read `#glancePickerLive` before and after the key, equal. Home: the filter has text "a" typed first; after Home `selectionStart === 0`, and `aria-activedescendant` unchanged. "Opening": `[data-opening="true"] .glance-picker-option-sub` text is "Opening…" and `#glancePickerLive` text is "Opening…"; reuse `?hold=slow` and the step from "Cancelling the picker while a quiet tab wakes". "A quiet background tab and a private background tab eligible for Glance" composes the existing quiet step with a private tab opened through `openTab(url, { private: true })`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @glance --name "read like the panel|highlight quietly|says Opening"`
Expected: FAIL on the first `Then` of each.

- [ ] **Step 3: Rows in `overlay.js`**

In `renderGlancePicker`: `row.classList.toggle('quiet', !!tab.asleep)`; drop `rail.state.quiet` from the visible `metadata` and keep it in the accessible name's `details`; when `tab.private`, append a `<span class="row-private">` with `rail.state.private` after the title (not in `metadata`); `row.title = [title, tabDomain(tab)].filter(Boolean).join(' — ')`; the accessible name's `details` joins with `', '`; while `glancePickerBusy` and `tab.id === glancePickerSelectedId`, the secondary line reads `blancI18n.t('glance.picker.opening')` and `row.dataset.opening = 'true'`. In `chooseGlanceTab`, set `glancePickerLive.textContent` to the same string when the wake starts. In `keydown`: `Home` and `End` no longer move the highlight (fall through to the field); arrow moves call `selectGlanceResult(id)` without `announce`.

- [ ] **Step 4: Rows in `styles.css`**

`.glance-picker { border-radius: var(--island-panel-radius); }`; `.glance-picker-option { border-radius: var(--radius); }`; remove the `:hover` fill, keep `[aria-selected="true"]` as weight (`.glance-picker-option-title { font-weight: 600 }`) with the panel's edge-faded wash from `.island-row:hover` at ~2276 as the highlighted background; `.glance-picker-option.quiet { opacity: .5 }` with the `.island-row.quiet` hover/focus rule; `.glance-picker-option-title { font-size: 13px }`, `-sub { font-size: 11px }`, `.glance-picker-hint { font-size: 11px }`, `.glance-picker-state { font-size: 12px }` stays; `.glance-picker-option .row-private` shares `.island-row .row-private` (make that selector `:is(.island-row, .glance-picker-option) .row-private`).

- [ ] **Step 5: Copy**

`en.json`: `glance.picker.opening` = "Opening…". Add the five translations and run `npm run copy:ack -- de glance.picker.opening` etc. (one per locale), then `npm run copy:build`.

- [ ] **Step 6: Run the scenarios and the Glance feature**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @glance`
Expected: 58 pass. The existing row-label assertion at `glance.steps.js:188` (`labels`) is updated to the comma form.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/overlay.js src/renderer/styles.css copy/ src/renderer/pages/strings.*.js src/main/ublock-strings.json spec/acceptance/glance.feature test/desktop/steps/glance.steps.js
git commit -m "Give the Glance picker the panel's row vocabulary"
```

---

### Task 3: The picker is a dialog; the header gets a private chip; Make main cross-fades

**Files:**
- Modify: `src/renderer/overlay.html:121` (`<section>` → `<div role="dialog" aria-labelledby="glancePickerTitle" aria-modal="false">`)
- Modify: `src/renderer/index.html` (header: `<span id="glancePrivate" class="row-private" hidden data-i18n="rail.state.private">private</span>` after `#glanceTitle`)
- Modify: `src/renderer/renderer.js` (`renderGlance`: toggle `glancePrivate.hidden`; the identity cross-fade)
- Modify: `src/renderer/styles.css` (`.glance-tab-identity` cross-fade class)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

- [ ] **Step 1: Write the failing scenarios**

```gherkin
  @F34-1 @F34 @F11 @D11
  Scenario: A private reference shows the private chip in the header
    Given twelve ordinary tabs and a private main page with one open in Glance
    When I choose Make main
    Then the Glance header shows the private chip
    And the header's identity cross-faded rather than swapping

  @F34-1 @F34 @D11
  Scenario: The picker is a dialog named by its heading
    Given two ordinary tabs in one workspace for Glance
    When I open the Glance picker
    Then the picker has the dialog role and is labelled by its heading
```

Steps: the chip is `#glancePrivate:not([hidden])` with text "private"; cross-fade: after Make main, `#glanceHeader .glance-tab-identity` has class `swapping` within 50 ms and its computed `transition` contains `opacity 0.12s` (read through `glanceHeaderMotion()`, extended with `identity: { transition, swapping }`); dialog: `#glancePicker` `role="dialog"` and `aria-labelledby="glancePickerTitle"`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @glance --name "private chip in the header|dialog named"`
Expected: FAIL: no `#glancePrivate`; the role is absent.

- [ ] **Step 3: Implement**

`renderer.js` `renderGlance`: `glancePrivate.hidden = !tab.private`; when the reference's id changes between renders (`lastGlanceTabId !== tab.id`), add class `swapping` to `.glance-tab-identity`, remove it on `transitionend` or after 120 ms. `styles.css`: `.glance-tab-identity { transition: opacity 120ms ease } .glance-tab-identity.swapping { opacity: 0 }` with `@starting-style` so the new identity fades in; in the reduced-motion block the same 120 ms opacity stays (it is already a fade). The chip reuses `.row-private` through the `:is()` selector from Task 2.

- [ ] **Step 4: Run and commit**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @glance` → 60 pass.

```bash
git add src/renderer/overlay.html src/renderer/index.html src/renderer/renderer.js src/renderer/styles.css spec/acceptance/glance.feature test/desktop/steps/glance.steps.js
git commit -m "Name the Glance picker a dialog and show the reference's private chip"
```

---

### Task 4: "Make main" announces both pages

**Files:**
- Modify: `src/main/main.js` (`promoteGlance`, ~6626)
- Modify: `copy/messages/en.json` (`glance.status.promoted` → "{title} is now the main page; {other} is in Glance") + five translations
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

- [ ] **Step 1: Write the failing scenario**

```gherkin
  @F34-1 @F34 @D11
  Scenario: Make main names both pages
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I choose Make main
    Then the strip announces "glance-reference is now the main page; glance-main is in Glance"
```

The step reads `#glanceStatus` text through the strip page.

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL: the text is "Glance made main".

- [ ] **Step 3: Implement**

`promoteGlance`: capture `displayTitle` of the reference and of the former main before `setActiveTab`, then send `glance.status.promoted` with `{ title, other }`. Update `en.json` and the translations (`copy:ack` each locale), `npm run copy:build`.

- [ ] **Step 4: Run and commit**

Run: `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @glance --name "names both pages"` → pass; `npm run copy:check` → OK.

```bash
npm run audit-inventory:write
git add src/main/main.js copy/ src/renderer/pages/strings.*.js src/main/ublock-strings.json security/audit-surface-inventory.json spec/acceptance/glance.feature test/desktop/steps/glance.steps.js
git commit -m "Make main announces which page is now main and which is in Glance"
```

---

### Task 5: `/glance`

**Files:**
- Modify: `copy/slash-commands.json` (after `/space`: `{ "command": "/glance", "doc": { "command": "/glance <text>" } }`)
- Modify: `copy/messages/en.json` (`slash.glance.hint` = "Keep another open tab beside this page", `slash.glance.doc` = "Open the Glance picker, filtered to the text") + five translations
- Modify: `src/renderer/overlay.js` (the `/` list, after `/space`; the `overlay:show` handler prefill for `glance`)
- Modify: `src/renderer/pages/shortcuts.js` (`['/glance', 'slash.glance.hint']`)
- Modify: `src/main/preload.js:41` (`openGlancePicker: (query) => ipcRenderer.invoke('tabs:open-glance-picker', query)`), `browser-api/contract.json` (`params: [{ name: "query", type: "string", optional: true }]`), `src/main/main.js` (`openGlancePicker(query = '')` → `showOverlay('glance', { purpose, prefill: query })`; the `tabs:open-glance-picker` handler passes a string of at most 200 characters), `src/main/test-hook.js` (`openGlancePicker(query)`)
- Test: `test/unit/slash-glance-command.test.js` (new, the shape of `slash-theme-arguments.test.js`), `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Produces: `browserAPI.openGlancePicker(query?: string): Promise<boolean>`; main `openGlancePicker(query = '')`; overlay `/glance` entry `{ cmd: '/glance', hint, keepOverlay: true, run: (input) => window.browserAPI.openGlancePicker(commandArgument(input)) }`.

- [ ] **Step 1: Write the failing unit test**

Adapt the sketch to how `test/unit/slash-theme-arguments.test.js` lifts the overlay's command list into a sandbox (it supplies `window.browserAPI` there; the entry's `run(input)` reads it).

```js
test('/glance opens the picker with the typed text as the filter', () => {
  const calls = [];
  const entry = lifted.commands.find((c) => c.cmd === '/glance');
  entry.run('/glance lisbon', { browserAPI: { openGlancePicker: (q) => calls.push(q) } });
  assert.deepEqual(calls, ['lisbon']);
  entry.run('/glance', { browserAPI: { openGlancePicker: (q) => calls.push(q) } });
  assert.deepEqual(calls, ['lisbon', '']);
});
```

- [ ] **Step 2: Write the failing scenarios**

```gherkin
  @F34-1 @F34 @F14 @D11
  Scenario: /glance opens the picker filtered to the typed text
    Given twelve ordinary tabs in one workspace
    When I run the slash command "/glance many-3"
    Then the Glance picker is open with the filter "many-3" and one row

  @F34-1 @F34 @D11
  Scenario: /glance with Glance open opens the Change picker
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I run the slash command "/glance"
    Then the Change picker is open

  @F34-1 @F34 @D11
  Scenario: /glance with nothing else open still opens the picker
    Given one ordinary tab
    When I run the slash command "/glance work"
    Then the Glance picker says to open another tab and keeps the filter "work"
```

"I run the slash command" exists for other commands (`grep -n "slash command" test/desktop/steps/*.js`); reuse it.

- [ ] **Step 3: Run them to verify they fail**

Run: `node --test test/unit/slash-glance-command.test.js` → FAIL (no entry); `npx cucumber-js … --name "/glance"` → FAIL (unknown command).

- [ ] **Step 4: Implement**

Registry, copy (`copy:ack` for `slash.glance.hint` and `slash.glance.doc` in five locales, `npm run copy:build`), the overlay entry, the shortcuts list, the bridge (`npm run browser-api:build`), main (`prefill` → the overlay's `overlay:show` already carries `prefill`; in the `glance` branch of the mode switch set `glancePickerInput.value = prefill ?? ''` before `renderGlancePicker`).

- [ ] **Step 5: Run and commit**

Run: `node --test test/unit/slash-glance-command.test.js`, `npm run copy:check`, `npm run browser-api:check`, the three scenarios → pass.

```bash
npm run audit-inventory:write
git add copy/ src/renderer/overlay.js src/renderer/pages/shortcuts.js src/renderer/pages/strings.*.js src/main/ublock-strings.json src/main/preload.js src/main/main.js src/main/test-hook.js browser-api/ security/audit-surface-inventory.json test/unit/slash-glance-command.test.js spec/acceptance/glance.feature test/desktop/steps/glance.steps.js
git commit -m "Add /glance: open the Glance picker, filtered to the typed text"
```

---

### Task 6: Open Link in Glance

**Files:**
- Modify: `src/main/context-menu.js` (export `linkMenuItems(params, actions, t)`; **Open Link in Glance** after **Open Link in New Tab**, links only)
- Modify: `src/main/tab-view.js:644` (`openInGlance: boundToTab((url) => deps.openLinkInGlance(tab, url))`)
- Modify: `src/main/main.js` (`openLinkInGlance(tab, url)`: `handOffToOs` → return; `isForbiddenTopLevelUrl` → return; `setGlanceTab(createTab(url, { private: tab.private, groupId: tab.groupId }))`; passed to `initTabView` deps), `src/main/test-hook.js` (`openLinkInGlance(tabId, url)`)
- Modify: `copy/messages/en.json` (`contextMenu.openLinkInGlance` = "Open Link in Glance") + five translations
- Test: `test/unit/context-menu-links.test.js` (new), `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Produces: `linkMenuItems(params, actions, t)` → `[{ label, click }]` for `params.linkURL`, in the order Open Link in New Tab, Open Link in Glance, Copy Link Address; main `openLinkInGlance(tab, url): Promise<boolean>`.

- [ ] **Step 1: Write the failing unit tests**

```js
test('a link offers Open Link in Glance after Open Link in New Tab, images do not', () => {
  const calls = [];
  const actions = { openBackgroundTab: (u) => calls.push(['bg', u]), openInGlance: (u) => calls.push(['glance', u]) };
  const items = linkMenuItems({ linkURL: 'https://a.test/x' }, actions, englishT);
  assert.deepEqual(items.map((i) => i.label), ['Open Link in New Tab', 'Open Link in Glance', 'Copy Link Address']);
  items[1].click();
  assert.deepEqual(calls, [['glance', 'https://a.test/x']]);
  assert.deepEqual(linkMenuItems({ mediaType: 'image', srcURL: 'https://a.test/i.png' }, actions, englishT), []);
});
```

and, in the unit test that already lifts `openLinkInGlance`-style helpers from main (see `test/unit/tab-window-open.test.js` for the lifting pattern), `openLinkInGlance` with a `mailto:` URL calls `handOffToOs` and creates nothing; with a forbidden top-level URL creates nothing; otherwise creates the tab with the opener's `private` and `groupId` and calls `setGlanceTab` with the new id.

- [ ] **Step 2: Write the failing scenarios**

```gherkin
  @F34-1 @F34 @D11
  Scenario: Open Link in Glance makes the link the reference
    Given two ordinary tabs in one workspace for Glance
    When I open a link from the main page in Glance
    Then the linked page is the reference and the main page is untouched
    When I open a link from the reference in Glance
    Then the linked page replaced the reference

  @F34-1 @F34 @F11 @D11
  Scenario: Open Link in Glance from a private page stays private
    Given a private main page and an ordinary tab
    When I open a link from the main page in Glance
    Then the reference is a private tab in the private session
```

"I open a link … in Glance" calls the hook `openLinkInGlance(tabId, fixtureUrl('glance-linked'))`, the same way the F19 address-bar menu steps bind native menu actions.

- [ ] **Step 3: Run to verify they fail**

Expected: unit FAIL (`linkMenuItems` not exported); scenarios FAIL (`openLinkInGlance` not a hook).

- [ ] **Step 4: Implement, then run and commit**

Run: `node --test test/unit/context-menu-links.test.js test/unit/tab-window-open.test.js`, the two scenarios, `npm run copy:check` → pass.

```bash
npm run audit-inventory:write
git add src/main/context-menu.js src/main/tab-view.js src/main/main.js src/main/test-hook.js copy/ src/renderer/pages/strings.*.js src/main/ublock-strings.json security/audit-surface-inventory.json test/unit/context-menu-links.test.js test/unit/tab-window-open.test.js spec/acceptance/glance.feature test/desktop/steps/glance.steps.js
git commit -m "Add Open Link in Glance to the page's link menu"
```

---

### Task 7: Amendments to earlier documents, captures, gates and the PR

**Files:**
- Modify: `spec/features.md` F34 (add `/glance` and **Open Link in Glance** as entry points; the picker's dialog role; the private chip; the promote announcement)
- Modify: `docs/superpowers/specs/2026-08-15-glance-design.md` (the header is the 68 px strip, not 64 px; the eyebrow is the UI sans, not mono; the stacked Island is centred over the full page width; "Open another tab to use Glance" is reachable from the open flow; **Change** keeps its caret only when side by side; the picker is 24 px from the edge only above 560 px)
- Modify: `design-qa.md:82` ("mono families" → the UI sans)
- Create: `docs/design-reviews/glance-pr3-2026-10-16/` (README + before/after captures: picker rows, header private chip, the picker mid-exit, side by side and stacked)

- [ ] **Step 1: The three document edits**

Each a short, dated line in the existing voice; F34's acceptance paragraph lists the new scenarios.

- [ ] **Step 2: Captures**

Reuse `~/blanc-vm-scripts/glance/cap/capture-glance-header.mjs` (strip capture through the test hook) for the header and `capturePage()` of the overlay for the picker; "before" is `57169b3d`, "after" is the branch head; before above after with the 4 px `#E5484D` divider.

- [ ] **Step 3: Gates**

Run: `npm run lint && npm run substrate:check && npm run test:unit && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags @glance && npm run test:i18n:desktop`
Expected: all pass; the Glance feature at 62 scenarios.

- [ ] **Step 4: Whole-branch review, then the PR**

One fresh review of the branch (the executing-plans skill's final review); fix Critical/Important findings test-first. Then:

```bash
git add spec/features.md docs/superpowers/specs/2026-08-15-glance-design.md design-qa.md docs/design-reviews/glance-pr3-2026-10-16
git commit -m "Record Glance PR 3 in F34, the older spec and the design notes, with captures"
git push -u origin claude/glance-pr3-polish
gh pr create --base main --title "Glance: polish and discoverability (3 of 3)" --body-file <the PR body>
```

The PR body follows #844's shape: what changes (one bullet per task), choices to look at, the checks table, the captures folder, and the attribution line.
