# Glance: the reference behaves like a page (PR 2 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner prefers inline execution) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Glance reference pane behave like a page: browser commands follow the focused pane, foreground tabs opened from the reference open into Glance, and the reference header gains Back, Reload, a focus cue, a label-in-name **Make main** and a right-click tab menu.

**Architecture:** One new pure module, `src/main/glance-focus.js`, owns the rule "which page does a command act on" (`commandTargetTab`) and the strip payload for the focus cue. Main keeps one new per-window value, `focusedPaneTabId`, on the window-runtime record, set from each visible pane's `focus` event and reset on every role change. Every command that acted on `rt().activeTabId` resolves its target through `browserCommandTab(runtime, sender)` instead. The strip learns which pane has focus from a new `focusedPane` field on `chrome:glance-layout` and draws the cue, the Back/Reload buttons and the header menu hook from it.

**Tech Stack:** Electron 44 (main process + sandboxed chrome documents), `node --test` unit tests, Cucumber + Playwright-Electron acceptance (`npm run test:acceptance:desktop`), the `copy/` i18n substrate, the `browser-api/` contract guard.

**Spec:** `docs/superpowers/specs/2026-10-15-glance-refinement-design.md`, sections *Decisions* 2–4, *Commands follow focus*, *Links and new tabs from the reference*, *The header*, *Security and privacy*, *Delivery* item 2 and *Amendments to earlier documents* (the F34 and 1Password lines). PR 1 (#842) is merged into `main` as `d8f3b60c`; this branch is cut from `origin/main` and follows it.

## Global Constraints

- **Commands that follow focus:** reload and hard reload, close tab, find, zoom in/out/reset, print, back/forward (menu and ⌘[ / ⌘]), the 1Password fill and its key-glyph hint, mouse gestures and the Option-drag trackpad gesture.
- **Commands that stay on the main page:** ⌘L and everything typed into the Island, ⌘T / ⌘⇧N, ⌘1–9 and tab cycling, the shield popover, the blocked count, `/find`, `/dark-site`, `/allow-ads`, `/pin`, `/mute`, `/rename` and the other `/` commands that address "this tab".
- `commandTargetTab` rule, verbatim from the spec: (1) the pane whose live `webContents` sent the key; (2) otherwise `focusedPaneTabId` if it is still a visible pane; (3) otherwise the main page.
- `focusedPaneTabId` never leaves main. Renderers receive only `focusedPane: 'main' | 'glance'` on `chrome:glance-layout`. Nothing new is persisted, synced or sent anywhere else.
- ⌘W in the reference closes the reference **tab**; the header's ✕ still closes only the pane.
- New tabs from the reference: a foreground disposition (`target=_blank`, `window.open`, ⌘⇧-click) calls `setGlanceTab(newId)`; a background disposition stays background; `new-window` still opens a popup; the page context menu's **Open Link in New Tab** stays a background tab (decision 3).
- The 1Password broker, credential path and explicit-invoke rule are unchanged; only which visible, user-focused pane is targeted changes, and `docs/1password-integration.md` records it in the same commit.
- Copy: the only English change is `glance.promote` → "Make main — swap with the main page". Every other label reuses an existing key (`pill.back`, `pill.forward`, `pill.reload`, `pill.stop`, `menu.closeGlance`). The changed string ships in `de`, `es`, `fr`, `pt-BR` and `it` in the same commit, acknowledged with `npm run copy:ack -- <locale> glance.promote`; never hand-edit `src/renderer/pages/strings.*.js`.
- `browser-api/contract.json` changes with the payload (Task 2), and `npm run browser-api:build` regenerates `browser-api/generated/vectors.json` in the same commit.
- After editing any file listed in `security/audit-surface-inventory.json` (`main.js`, `tab-view.js`, `test-hook.js`, a new `src/main` file): `npm run audit-inventory:write`, committed with the change.
- Keyboard routing in acceptance: on Windows and Linux deliver keys to the pane with `webContents.sendInputEvent` (CDP keys bypass `before-input-event`); on macOS the same command is the native menu item, which carries no sender, so the scenario first establishes the focused pane and then clicks the menu item. The `pressBrowserCommand` hook (Task 3) encodes both.
- The fixture's slow page is `?hold=slow` (constant 2.5 s). There is no `?hold=<ms>`.
- Session rules: run the `simplify` and `verify` skills right before every commit that changes code (not for docs-only or tests-only commits); each `git` command on its own; check `git branch --show-current` is `claude/relaxed-brahmagupta-923e8d` before committing; during iteration run `npm run test:acceptance:desktop -- --tags @glance` and the named unit files only; the owner says when to run the full desktop suite; commit nothing until the owner approves this plan file.
- Existing Glance scenarios stay green after every task. The geometry assertions in `test/desktop/steps/glance.steps.js` are contracts.

## Review Focus

1. **Focus in the reference, then the reference is replaced.** `focusedPaneTabId` still names the old reference, which is no longer a visible pane; ⌘R must reload the main page, and the header must not show the focus cue. Pinned by Task 1's "stale focused pane" unit test and Task 3's "Replacing the reference hands commands back to the main page" scenario, which replaces the reference through the test hook so no focus event masks the bug.
2. **The find capsule is open on the reference when the roles swap.** **Make main** must close the capsule rather than leave it searching the page that just became main. Pinned by Task 4's scenario, which promotes with the capsule open.
3. **A private reference opens a new tab.** The new tab must be private, in the private session, and become the reference. Pinned by Task 8's private scenario.
4. **⌘W twice.** The first ⌘W in the reference closes the reference; focus moves to the main page and `focusedPaneTabId` resets, so the second ⌘W closes the main page, not a stale id. Pinned by Task 3's close scenario, which presses twice.
5. **Right-click on a header button.** Back, Reload, Make main, Change and ✕ are controls, not the title; a right-click there must open no tab menu. Pinned by Task 11's second assertion.

---

## File structure

| File | Responsibility in this PR |
| --- | --- |
| `src/main/glance-focus.js` (new) | Pure: `visiblePaneIds`, `isVisiblePaneId`, `commandTargetTab`, `focusedPane`, `glanceLayoutPayload` (1, 2). |
| `src/main/window-runtime-registry.js` | `focusedPaneTabId` field, cleared on `detachWindow` (1). |
| `src/main/main.js` | `noteFocusedPane` / `resetFocusedPane` and the layout payload (2); `browserCommandTab` and the executor (3); find binding (4); zoom, print, back/forward (5); 1Password target and hint eligibility (6); gesture guard (7); `setGlanceTab` injected into tab-view (8); header menu context (11). |
| `src/main/tab-view.js` | Pane focus reporting (2); find results to the bound pane (4); gesture guard and fill-capsule dismissal for both panes (6, 7); foreground opens from the reference go to Glance (8). |
| `src/main/browser-shortcuts.js` | Pass the key event's `webContents` to the action (3); `back` / `forward` commands (5). |
| `src/main/tab-context-menu-model.js`, `src/main/tab-context-menu.js` | **Close Glance** for the current reference row (11). |
| `src/main/test-hook.js` | `focusedPaneTabId` in `state()`, `pressBrowserCommand`, `findTabId`, `overlayViewBounds`, `zoomLevel`, `clickInTab` (2–8). |
| `src/renderer/index.html`, `renderer.js`, `styles.css` | Focus cue (2); fill hint for the focused pane (6); Back/Reload (9); swap glyph (10); header right-click (11). |
| `src/renderer/overlay.js` | Find capsule searches its bound tab (4). |
| `browser-api/contract.json`, `browser-api/build.mjs`, `browser-api/generated/vectors.json` | `focusedPane` on `GlanceLayout` and its fixtures (2). |
| `copy/messages/*.json` + generated strings | `glance.promote` in six languages (10). |
| `test/desktop/support/fixtures-server.js` | `?blanklink=<name>` target=_blank link (8). |
| `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js` | One scenario per rule (2–11). |
| `test/unit/glance-focus.test.js` (new), `window-runtime-registry.test.js`, `browser-shortcuts.test.js`, `tab-context-menu-model.test.js`, `tab-context-menu-runner.test.js` | Pure coverage (1, 3, 5, 11). |
| `docs/1password-integration.md`, `spec/features.md` | The fill-target note (6); the F34 lines (12). |

---

### Task 1: The command-target resolver and the per-window focused pane

**Files:**
- Create: `src/main/glance-focus.js`
- Modify: `src/main/window-runtime-registry.js:51-52` (after `glanceRatio`), `:203` (`detachWindow`)
- Test: `test/unit/glance-focus.test.js` (new), `test/unit/window-runtime-registry.test.js`

**Interfaces:**
- Produces: `visiblePaneIds(runtime) → id[]`, `isVisiblePaneId(runtime, tabId) → boolean`, `commandTargetTab(runtime, sender, contentsOf) → id | null` (`contentsOf(tabId)` returns the tab's live `webContents` or `null`; main supplies it so the module stays pure — the one deviation from the spec's two-argument signature), `focusedPane(runtime) → 'main' | 'glance'`, `glanceLayoutPayload(layout, pane) → layout + focusedPane | null`. Runtime field `focusedPaneTabId` (default `null`).
- Note: `isVisiblePane(owner, tab)` already exists in `display-capture-admission.js` and is imported into `main.js:106`; the new name `isVisiblePaneId` avoids the clash.

- [ ] **Step 1: Write the failing unit tests**

Create `test/unit/glance-focus.test.js`:

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  visiblePaneIds, isVisiblePaneId, commandTargetTab, focusedPane, glanceLayoutPayload,
} = require('../../src/main/glance-focus');

const mainWc = { id: 'main-wc' };
const refWc = { id: 'ref-wc' };
const overlayWc = { id: 'overlay-wc' };
const live = { main: mainWc, ref: refWc };
const contentsOf = (id) => live[id] ?? null;
const runtime = (over = {}) => ({ activeTabId: 'main', glanceTabId: 'ref', focusedPaneTabId: null, ...over });

test('the visible panes are the main page and the reference, in that order', () => {
  assert.deepEqual(visiblePaneIds(runtime()), ['main', 'ref']);
  assert.deepEqual(visiblePaneIds(runtime({ glanceTabId: null })), ['main']);
  assert.deepEqual(visiblePaneIds(null), []);
  assert.equal(isVisiblePaneId(runtime(), 'ref'), true);
  assert.equal(isVisiblePaneId(runtime(), 'other'), false);
  assert.equal(isVisiblePaneId(runtime(), null), false);
});

test('rule 1: the pane whose webContents sent the key is the target', () => {
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'main' }), refWc, contentsOf), 'ref');
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'ref' }), mainWc, contentsOf), 'main');
});

test('rule 2: a menu click or a chrome surface falls back to the focused pane', () => {
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'ref' }), null, contentsOf), 'ref');
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'ref' }), overlayWc, contentsOf), 'ref');
});

test('rule 3: a stale or dead focused pane falls back to the main page', () => {
  // The reference was replaced: the old id is no longer a visible pane.
  assert.equal(commandTargetTab(runtime({ glanceTabId: 'new', focusedPaneTabId: 'ref' }), null, contentsOf), 'main');
  // Glance closed.
  assert.equal(commandTargetTab(runtime({ glanceTabId: null, focusedPaneTabId: 'ref' }), null, contentsOf), 'main');
  // The focused pane's renderer is gone.
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'ref' }), null, () => null), 'main');
  assert.equal(commandTargetTab(runtime(), null, contentsOf), 'main');
  assert.equal(commandTargetTab(null, refWc, contentsOf), null);
});

test('a sender that is a dead pane never matches', () => {
  assert.equal(commandTargetTab(runtime({ focusedPaneTabId: 'main' }), refWc, (id) => (id === 'main' ? mainWc : null)), 'main');
});

test('focusedPane is glance only while the focused id is the current reference', () => {
  assert.equal(focusedPane(runtime({ focusedPaneTabId: 'ref' })), 'glance');
  assert.equal(focusedPane(runtime({ focusedPaneTabId: 'main' })), 'main');
  assert.equal(focusedPane(runtime({ glanceTabId: 'new', focusedPaneTabId: 'ref' })), 'main');
  assert.equal(focusedPane(runtime({ glanceTabId: null, focusedPaneTabId: null })), 'main');
  assert.equal(focusedPane(null), 'main');
});

test('glanceLayoutPayload adds focusedPane to a layout and keeps null as null', () => {
  const layout = { direction: 'horizontal', ratio: 0.62 };
  assert.deepEqual(glanceLayoutPayload(layout, 'glance'), { direction: 'horizontal', ratio: 0.62, focusedPane: 'glance' });
  assert.deepEqual(glanceLayoutPayload(layout, 'anything'), { direction: 'horizontal', ratio: 0.62, focusedPane: 'main' });
  assert.equal(glanceLayoutPayload(null, 'glance'), null);
  assert.equal('focusedPane' in layout, false, 'the geometry object is not mutated');
});
```

In `test/unit/window-runtime-registry.test.js`, in the first test after `assert.equal(r.glanceRatio, 0.62);` add `assert.equal(r.focusedPaneTabId, null);`, and append:

```js
test('detachWindow forgets the focused pane with Glance', () => {
  const r = reg.createRuntime();
  r.glanceTabId = 'ref';
  r.focusedPaneTabId = 'ref';
  reg.detachWindow(r);
  assert.equal(r.focusedPaneTabId, null);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test test/unit/glance-focus.test.js test/unit/window-runtime-registry.test.js`
Expected: FAIL — `Cannot find module '../../src/main/glance-focus'`, and `focusedPaneTabId` is `undefined`.

- [ ] **Step 3: Implement**

Create `src/main/glance-focus.js`:

```js
'use strict';

// Which page a "current page" browser command acts on while Glance shows two
// panes (spec: Commands follow focus). Pure — no Electron — so the routing
// rule is unit-tested; main.js owns the runtime and passes a liveness lookup.

/** The window's visible page tab ids: the main page, then the reference. */
function visiblePaneIds(runtime) {
  if (!runtime) return [];
  return [runtime.activeTabId, runtime.glanceTabId].filter((id) => id != null);
}

function isVisiblePaneId(runtime, tabId) {
  return tabId != null && visiblePaneIds(runtime).includes(tabId);
}

/**
 * 1. The pane whose live webContents sent the key event.
 * 2. Otherwise (a native menu click, a key in a chrome surface) the focused
 *    pane, if it is still a visible pane with a live page.
 * 3. Otherwise the main page.
 * @param {object|null} runtime window runtime
 * @param {object|null} sender the key event's webContents, or null
 * @param {(tabId: unknown) => object|null} contentsOf a tab's live webContents
 */
function commandTargetTab(runtime, sender, contentsOf) {
  if (!runtime) return null;
  if (sender) {
    const hit = visiblePaneIds(runtime).find((id) => {
      const wc = contentsOf(id);
      return !!wc && wc === sender;
    });
    if (hit != null) return hit;
  }
  const focused = runtime.focusedPaneTabId;
  if (isVisiblePaneId(runtime, focused) && contentsOf(focused)) return focused;
  return runtime.activeTabId ?? null;
}

/** What the strip may know: whether the reference holds focus. */
function focusedPane(runtime) {
  return runtime?.glanceTabId != null && runtime.focusedPaneTabId === runtime.glanceTabId
    ? 'glance'
    : 'main';
}

/** The chrome:glance-layout payload: Glance geometry plus focusedPane. */
function glanceLayoutPayload(layout, pane) {
  return layout ? { ...layout, focusedPane: pane === 'glance' ? 'glance' : 'main' } : null;
}

module.exports = { visiblePaneIds, isVisiblePaneId, commandTargetTab, focusedPane, glanceLayoutPayload };
```

In `src/main/window-runtime-registry.js`, after `glanceRatio: DEFAULT_GLANCE_RATIO,`:

```js
    /** The visible pane (main or reference tab id) that last took keyboard
     * focus; browser commands without a sending pane act on it
     * (glance-focus.js). Main-process only: never crosses IPC or disk. */
    focusedPaneTabId: null,
```

In `detachWindow`, after `runtime.glanceTabId = null;` add `runtime.focusedPaneTabId = null;`.

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test test/unit/glance-focus.test.js test/unit/window-runtime-registry.test.js`
Expected: PASS.

- [ ] **Step 5: Audit inventory, commit**

`npm run audit-inventory:write`. Then, each on its own: `git add src/main/glance-focus.js src/main/window-runtime-registry.js test/unit/glance-focus.test.js test/unit/window-runtime-registry.test.js security/audit-surface-inventory.json`, `git commit -m "Add the Glance command-target resolver and the focused pane"`.

---

### Task 2: Track the focused pane and show it in the header

**Files:**
- Modify: `src/main/tab-view.js:431-434` (the `focus` handler)
- Modify: `src/main/main.js` — require `glance-focus` next to `glance-layout` (`:274`); `resizeActiveView` (`:4740`); new `noteFocusedPane` / `resetFocusedPane` beside `bumpGlanceRequestEpoch` (`:3904`); `setActiveTab` (`:6399`); `setGlanceTab` (after `rt().glanceTabId = id;`); `closeGlance` (after `rt().glanceTabId = null;`); `closeTab` (`:6802`); the `initTabView({ … })` object (`:5919`); the test-hook refs (`:10549`)
- Modify: `src/main/test-hook.js` (refs destructure near `:79`; `state()` near `:531`)
- Modify: `browser-api/contract.json` (`GlanceLayout`), `browser-api/build.mjs` (`payloadFixtures`, after the `calculateGlanceLayout` loop)
- Modify: `src/renderer/renderer.js` (`renderGlance`, `:393`), `src/renderer/styles.css` (after `.glance-header.private`, `:281`)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: Task 1's module and runtime field.
- Produces: `noteFocusedPane(owner, tabId)` (injected into tab-view as the optional dep `noteFocusedPane`), `resetFocusedPane()`; `state().focusedPaneTabId` in the test hook; `focusedPane` on every `chrome:glance-layout`; the strip class `#glanceHeader.focused`; the world helper `focusPane(world, tabId)` used by Tasks 3–7.

- [ ] **Step 1: Add the scenario**

Append to `spec/acceptance/glance.feature`:

```gherkin
  @F34-1 @F34 @D11
  Scenario: The Glance header shows when the reference holds keyboard focus
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the reference pane is the focused pane
    Then the Glance header shows the reference has focus
    When the main page is the focused pane
    Then the Glance header shows the main page has focus
```

- [ ] **Step 2: Add the steps**

In `test/desktop/steps/glance.steps.js`, after `createGlanceTabs`:

```js
/** Give a pane keyboard focus and wait until main has recorded it — the
 * state every follow-focus command reads on macOS, where the menu carries no
 * sender. */
async function focusPane(world, tabId) {
  await frontChromeWindow(world);
  assert.equal(await world.call('focusTabContents', tabId), true);
  await world.waitForState((state) => state.focusedPaneTabId === tabId);
}

async function cssColour(chrome, token) {
  return chrome.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}
```

At the end of the file:

```js
// --- The reference behaves like a page (Glance PR 2) ---

When('the reference pane is the focused pane', async function () {
  await focusPane(this, this.glanceReferenceId);
});

When('the main page is the focused pane', async function () {
  await focusPane(this, this.glanceMainId);
});

Then('the Glance header shows the reference has focus', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceHeader.focused').waitFor();
  const eyebrow = await chrome.locator('#glanceEyebrow').evaluate((element) => getComputedStyle(element).color);
  const border = await chrome.locator('#glanceHeader').evaluate((element) => getComputedStyle(element).borderBottomColor);
  assert.equal(eyebrow, await cssColour(chrome, '--text'));
  assert.equal(border, await cssColour(chrome, '--text-dim'));
});

Then('the Glance header shows the main page has focus', async function () {
  const chrome = await mainChromePage();
  await waitForValue(
    () => chrome.locator('#glanceHeader').evaluate((element) => element.classList.contains('focused')),
    (focused) => focused === false,
    'focus cue cleared'
  );
  const eyebrow = await chrome.locator('#glanceEyebrow').evaluate((element) => getComputedStyle(element).color);
  assert.equal(eyebrow, await cssColour(chrome, '--text-dim'));
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: the new scenario fails in "the reference pane is the focused pane" — `state.focusedPaneTabId` is `undefined`.

- [ ] **Step 4: Report pane focus from tab-view**

In `src/main/tab-view.js`, replace the `focus` handler:

```js
  wc.on('focus', boundToTab(() => {
    if (tab.sleeping || tab.view?.webContents !== wc) return;
    // Which visible pane holds focus decides where ⌘R, ⌘W, ⌘F … go. Focus
    // in the reference deliberately does not change roles.
    deps.noteFocusedPane?.(getOwner(), id);
    if (shouldReclaimAddressBarFocus(id)) reclaimAddressBarFocus(id, { consume: true });
  }));
```

- [ ] **Step 5: Record and reset it in main**

In `src/main/main.js`, after the `require('./glance-layout')` block:

```js
const {
  isVisiblePaneId,
  commandTargetTab,
  focusedPane,
  glanceLayoutPayload,
} = require('./glance-focus');
```

After `bumpGlanceRequestEpoch`:

```js
/** A visible pane's page took keyboard focus (tab-view.js). Only the strip's
 * focus cue needs to hear about it; nothing is re-laid out. */
function noteFocusedPane(owner, tabId) {
  if (!owner || !isVisiblePaneId(owner, tabId) || owner.focusedPaneTabId === tabId) return;
  owner.focusedPaneTabId = tabId;
  if (owner.glanceTabId == null) return;
  withWindowRuntime(owner, () => {
    if (!hasLiveWindow()) return;
    const glance = glanceGeometry();
    rt().window.webContents.send('chrome:glance-layout', glanceLayoutPayload(glance, focusedPane(rt())));
  });
}

/** Glance closed, the roles swapped, the main page changed, or the reference
 * left: commands without a sending pane go to the main page again. */
function resetFocusedPane() {
  rt().focusedPaneTabId = rt().activeTabId ?? null;
}
```

In `resizeActiveView`, replace the last line with:

```js
  rt().window.webContents.send('chrome:glance-layout', glanceLayoutPayload(glance, focusedPane(rt())));
```

Reset sites (each is followed by `resizeActiveView()` on its own path, which sends the new payload):
- `setActiveTab`: directly after `rt().activeTabId = id;` (`:6399`) add `resetFocusedPane();`.
- `setGlanceTab`: directly after `rt().glanceTabId = id;` add `if (previous && rt().focusedPaneTabId === previous.id) resetFocusedPane();`.
- `closeGlance`: directly after `rt().glanceTabId = null;` add `resetFocusedPane();`.
- `closeTab`: replace `if (wasGlance) rt().glanceTabId = null;` with `if (wasGlance) { rt().glanceTabId = null; resetFocusedPane(); }`.

In the `initTabView({ … })` object, after `closeTab,` add `noteFocusedPane,`. In the test-hook refs object (`:10549`), after `getGlanceTabId: () => rt().glanceTabId,` add `getFocusedPaneTabId: () => rt().focusedPaneTabId,`.

In `src/main/test-hook.js`, add `getFocusedPaneTabId,` to the refs destructure after `getGlanceTabId,`, and in `state()` after `glanceTabId: getGlanceTabId(),` add `focusedPaneTabId: getFocusedPaneTabId(),`.

- [ ] **Step 6: The contract and its fixtures**

In `browser-api/contract.json`, in `GlanceLayout.fields` after `glance`:

```json
        "focusedPane": {
          "type": "'main' | 'glance'",
          "optional": true,
          "doc": "Which pane holds keyboard focus. Present on chrome:glance-layout (glanceLayoutPayload() in glance-focus.js); calculateGlanceLayout() leaves it out."
        }
```

In `browser-api/build.mjs` `payloadFixtures()`, after the `calculateGlanceLayout` loop:

```js
  const { glanceLayoutPayload } = requireMain('./glance-focus');
  for (const pane of ['main', 'glance', 'unknown']) {
    add(`glanceLayoutPayload(side by side, ${pane})`, 'GlanceLayout | null',
      glanceLayoutPayload(calculateGlanceLayout({ x: 0, y: 68, width: 1400, height: 900 }), pane));
  }
  add('glanceLayoutPayload(null)', 'GlanceLayout | null', glanceLayoutPayload(null, 'glance'));
```

Run `npm run browser-api:build`, then `npm run browser-api:check` — expected clean. If the check names the `resizeActiveView` or `noteFocusedPane` send site as unreadable, that member already carries `"payloadCheck": "fixtures"`, so the message is about a different member; read it rather than suppressing it.

- [ ] **Step 7: Draw the cue**

In `src/renderer/renderer.js` `renderGlance()`, after `glanceHeader.classList.toggle('private', !!tab.private);`:

```js
    glanceHeader.classList.toggle('focused', glanceLayout.focusedPane === 'glance');
```

In `src/renderer/styles.css`, after `.glance-header.private { … }`:

```css
/* The reference holds keyboard focus, so ⌘R, ⌘W, ⌘F … act on it. Quieter
   than an outline: the eyebrow and the bottom hairline brighten. (The title
   is already --text.) */
.glance-header.focused { border-bottom-color: var(--text-dim); }
.glance-header.focused .glance-eyebrow { color: var(--text); }
```

The spec also says the title moves from `--text-dim` to `--text`; `#glanceTitle` is already `--text` (`styles.css:310`), so only the eyebrow and hairline change. Say so in the PR.

- [ ] **Step 8: Run to verify it passes**

Run: `node --test test/unit/glance-focus.test.js` and `npm run test:acceptance:desktop -- --tags @glance`
Expected: all pass.

- [ ] **Step 9: Audit inventory, commit**

`npm run audit-inventory:write`; `git add` the files above plus `browser-api/generated/vectors.json` and `security/audit-surface-inventory.json`; `git commit -m "Track which Glance pane holds focus and show it in the header"`.

---

### Task 3: Reload, hard reload and close follow the focused pane

**Files:**
- Modify: `src/main/browser-shortcuts.js:56-63` (executor), `:78` (input routing)
- Modify: `src/main/main.js:4854-4881` (`activeBrowserCommandTab`, `reloadBrowserCommandTab`, the executor), `installChromeShortcuts` (`:4907`, the `execute:` line)
- Modify: `src/main/test-hook.js` (new `pressBrowserCommand`, after `focusedWebContentsId`)
- Test: `test/unit/browser-shortcuts.test.js`, `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: `commandTargetTab`, `isVisiblePaneId` (Task 1); `focusPane` (Task 2).
- Produces: `browserCommandTab(runtime, sender = null) → tab | null` (Tasks 4–6 use it); executor actions receive `(runtime, sender)`; test hook `pressBrowserCommand(tabId, commandId) → boolean` for `reload`, `hard-reload`, `close-tab`, `find`, `back`, `forward`, `zoom-in`, `zoom-out`, `zoom-reset`.

- [ ] **Step 1: Write the failing unit test**

Append to `test/unit/browser-shortcuts.test.js`:

```js
test('the action receives the webContents the key came from, or null from a menu', () => {
  const seen = [];
  const execute = createBrowserCommandExecutor({ reload: (runtime, sender) => seen.push([runtime.id, sender]) }, { platform: 'win32' });
  const runtime = { id: 'w', window: { isDestroyed: () => false } };
  assert.equal(execute('reload', runtime, 'page-wc'), true);
  assert.equal(execute('reload', runtime), true);
  assert.deepEqual(seen, [['w', 'page-wc'], ['w', null]]);

  const wc = Object.assign(new EventEmitter(), { id: 3, isDestroyed: () => false });
  const delivered = [];
  installBrowserShortcuts({
    webContents: wc, getRuntime: () => runtime, ownsSurface: () => true, platform: 'linux',
    execute: (id, _runtime, sender) => { delivered.push([id, sender]); return true; },
  });
  wc.emit('before-input-event', { preventDefault() {} }, input('r', { control: true }));
  assert.deepEqual(delivered, [['reload', wc]]);
});
```

Run: `node --test test/unit/browser-shortcuts.test.js`
Expected: FAIL — the action sees `undefined` for the sender.

- [ ] **Step 2: Pass the sender through**

In `src/main/browser-shortcuts.js`, change the executor to:

```js
function createBrowserCommandExecutor(actions, { platform = process.platform } = {}) {
  return (id, runtime, sender = null) => {
    const action = Object.hasOwn(COMMANDS, id) ? actions[id] : null;
    if (!action || !runtime || runtime.closing || runtime.resident) return false;
    const detachedMacAction = platform === 'darwin' && !runtime.window &&
      ['new-window', 'new-tab', 'new-private-tab', 'reopen-tab'].includes(id);
    if (!detachedMacAction && (!runtime.window || runtime.window.isDestroyed())) return false;
    // The key event's webContents, so a command can act on the pane it was
    // pressed in (glance-focus.js). Menu clicks pass none.
    action(runtime, sender);
    return true;
  };
}
```

and in `installBrowserShortcuts` change `const handled = execute(id, runtime);` to `const handled = execute(id, runtime, webContents);`.

Run: `node --test test/unit/browser-shortcuts.test.js` — expected PASS.

- [ ] **Step 3: Add the scenarios**

```gherkin
  @F34-1 @F34 @D11
  Scenario: Reload with focus in the reference reloads the reference
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the reference pane is the focused pane
    And I press the reload command
    Then only the reference page reloaded

  @F34-1 @F34 @D11
  Scenario: Close Tab with focus in the reference closes the reference tab only
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the reference pane is the focused pane
    And I press the close-tab command
    Then the reference tab is closed and the main page has focus
    When I press the close-tab command
    Then the main page tab is closed

  @F34-1 @F34 @D11
  Scenario: Replacing the reference hands commands back to the main page
    Given three ordinary tabs with one open in Glance
    When the reference pane is the focused pane
    And the replacement tab becomes the reference without a focus change
    And I press the reload command
    Then only the main page reloaded
    And the Glance header shows the main page has focus
```

- [ ] **Step 4: Add the steps and the hook**

In `glance.steps.js`, next to `focusPane`:

```js
/** The fixture page's own load counter (sessionStorage, +1 per load). */
async function loadCount(world, tabId) {
  try {
    return await world.call('workspacePageScript', tabId,
      "Number(sessionStorage.getItem('acceptance-load-count'))");
  } catch {
    return null;
  }
}

async function recordLoadCounts(world) {
  world.glanceLoadsBefore = {
    main: await loadCount(world, world.glanceMainId),
    reference: await loadCount(world, world.glanceReferenceId),
  };
}
```

At the end of the file:

```js
When('I press the {word} command', async function (command) {
  const state = await this.state();
  await recordLoadCounts(this);
  const target = state.focusedPaneTabId ?? state.activeTabId;
  assert.equal(await this.call('pressBrowserCommand', target, command), true);
});

When('the replacement tab becomes the reference without a focus change', async function () {
  assert.equal(await this.call('setGlance', this.glanceReplacementId), true);
  await this.waitForState((state) => state.glanceTabId === this.glanceReplacementId);
});

Then('only the reference page reloaded', async function () {
  await waitForValue(() => loadCount(this, this.glanceReferenceId),
    (count) => count === this.glanceLoadsBefore.reference + 1, 'the reference reloaded');
  assert.equal(await loadCount(this, this.glanceMainId), this.glanceLoadsBefore.main, 'the main page reloaded too');
});

Then('only the main page reloaded', async function () {
  await waitForValue(() => loadCount(this, this.glanceMainId),
    (count) => count === this.glanceLoadsBefore.main + 1, 'the main page reloaded');
  assert.equal(await loadCount(this, this.glanceReferenceId), this.glanceLoadsBefore.reference);
});

Then('the reference tab is closed and the main page has focus', async function () {
  const state = await this.waitForState((candidate) =>
    candidate.glanceTabId === null && !candidate.tabs.some((tab) => tab.id === this.glanceReferenceId));
  assert.equal(state.activeTabId, this.glanceMainId);
  assert.equal(state.focusedPaneTabId, this.glanceMainId);
  const main = state.tabs.find((tab) => tab.id === this.glanceMainId);
  await waitForValue(() => this.call('focusedWebContentsId'), (id) => id === main.webContentsId,
    'focus handed to the main page');
});

Then('the main page tab is closed', async function () {
  await this.waitForState((state) => !state.tabs.some((tab) => tab.id === this.glanceMainId));
});
```

In `src/main/test-hook.js`, after `focusedWebContentsId() { … },`:

```js
    // A browser command as a person presses it with this tab's page focused.
    // Windows/Linux: the key reaches the page and main's before-input-event
    // routes it by sender. macOS: the native menu item handles the key and
    // carries no sender, so the focused pane decides — callers establish it
    // first. Zoom and print exist only as menu items on every platform.
    pressBrowserCommand(tabId, commandId) {
      const wc = liveContents(tabs.get(tabId));
      if (!wc) return false;
      const menuOnly = { 'zoom-in': 'zoom-in', 'zoom-out': 'zoom-out', 'zoom-reset': 'zoom-reset' };
      if (process.platform === 'darwin' || menuOnly[commandId]) {
        const itemId = menuOnly[commandId] ?? `browser-${commandId}`;
        const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);
        if (!item) throw new Error(`no menu item ${itemId}`);
        item.click();
        return true;
      }
      const keys = {
        reload: ['R', ['control']], 'hard-reload': ['R', ['control', 'shift']],
        'close-tab': ['W', ['control']], find: ['F', ['control']],
        back: ['[', ['control']], forward: [']', ['control']],
      };
      if (!keys[commandId]) throw new Error(`no key for ${commandId}`);
      const [keyCode, modifiers] = keys[commandId];
      wc.focus();
      wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
      return true;
    },
```

- [ ] **Step 5: Run to verify they fail**

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: "Reload … reloads the reference" fails (the main page's counter moves, the reference's does not); "Close Tab …" fails (the main tab closes). "Replacing the reference …" passes already — it pins the resolver's stale check (Review Focus 1) so a later edit cannot regress it.

- [ ] **Step 6: Route the commands**

In `src/main/main.js`, replace `activeBrowserCommandTab` and `reloadBrowserCommandTab`:

```js
/** The page a browser command acts on: the pane the key came from, else the
 * focused pane, else the main page (glance-focus.js). Never a quiet tab. */
function browserCommandTab(runtime, sender = null) {
  const contentsOf = (tabId) =>
    windowRuntimes.runtimeForTab(tabId) === runtime ? liveContents(tabs.get(tabId)) : null;
  const tab = tabs.get(commandTargetTab(runtime, sender, contentsOf));
  return tab && windowRuntimes.runtimeForTab(tab.id) === runtime &&
    !tab.sleeping && liveContents(tab) ? tab : null;
}

function reloadBrowserCommandTab(runtime, bypassCache = false, sender = null) {
  const tab = browserCommandTab(runtime, sender);
  const wc = liveContents(tab);
  return queueTabNavigation(wc, {
    isCurrent: () => !!tab && isVisiblePaneId(runtime, tab.id) && liveContents(tab) === wc,
    run: contents => reloadContents(contents, bypassCache),
  });
}
```

In the executor:

```js
  'close-tab': (runtime, sender) => { const tab = browserCommandTab(runtime, sender); if (tab) closeTab(tab.id); },
  …
  reload: (runtime, sender) => reloadBrowserCommandTab(runtime, false, sender),
  'hard-reload': (runtime, sender) => reloadBrowserCommandTab(runtime, true, sender),
```

In `installChromeShortcuts`, change the `execute:` line to:

```js
    execute: (id, runtime, sender) => bindWindowRuntime(runtime, () => executeBrowserCommand(id, runtime, sender))(),
```

`closeTab` already handles a closing reference: it resizes, hands focus to the main page when the reference held it, resets the focused pane (Task 2) and announces `glance.status.tabClosed`.

- [ ] **Step 7: Run to verify they pass**

Run: `node --test test/unit/browser-shortcuts.test.js test/unit/ublock-browser-commands.test.js` and `npm run test:acceptance:desktop -- --tags @glance`; then `npm run test:acceptance:desktop -- --tags @F14` (browser shortcuts) to confirm ordinary reload/close are unchanged.
Expected: all pass.

- [ ] **Step 8: Audit inventory, commit**

`npm run audit-inventory:write`; `git add`; `git commit -m "Send reload and close to the focused Glance pane"`.

---

### Task 4: Find opens over the pane it was pressed in

**Files:**
- Modify: `src/main/main.js` — `openFindBar` (`:7258`), `chrome:open-find` (`:7766`), the executor's `find`, `overlayBounds` find branch (`:2964`), `closeTab`, `closeGlance`, `setGlanceTab`, the `initTabView` object, test-hook refs
- Modify: `src/main/tab-view.js:538-546` (`found-in-page`)
- Modify: `src/renderer/overlay.js:101` (state), `:1834` (`applyMode`), `:2200` (`resetFind`), `:2674-2693` (find)
- Modify: `src/main/test-hook.js` (`findTabId`, `overlayViewBounds`)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: `browserCommandTab` (Task 3), `isVisiblePaneId` (Task 1).
- Produces: `findTargetTabId(runtime) → id | null` in main; overlay `purpose` for `find` is `{ findTabId }`; hooks `findTabId()`, `overlayViewBounds()`.

- [ ] **Step 1: Add the scenario**

```gherkin
  @F34-1 @F34 @D11
  Scenario: Find with focus in the reference searches the reference
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And the reference pane is the focused pane
    And I press the find command
    Then the find capsule sits over the reference pane and searches it
    When I promote the Glance pane
    Then the find capsule is closed
```

- [ ] **Step 2: Add the steps and hooks**

```js
Then('the find capsule sits over the reference pane and searches it', async function () {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === 'find', 'find capsule');
  assert.equal(await this.call('findTabId'), this.glanceReferenceId);
  const { glanceGeometry } = await this.state();
  const bounds = await this.call('overlayViewBounds');
  assert.ok(bounds.x >= glanceGeometry.glanceContent.x, `capsule at x=${bounds.x}, reference starts at ${glanceGeometry.glanceContent.x}`);
  const page = await overlayPage();
  await page.locator('#findInput').fill('widget');
  await waitForValue(() => page.locator('#findCount').textContent(), (text) => text === '1/3',
    'match count from the reference');
});

Then('the find capsule is closed', async function () {
  await waitForValue(() => this.call('overlayMode'), (mode) => mode === null, 'find capsule closed with the swap');
});
```

In `test-hook.js` next to `overlayMode()`: `findTabId() { return getFindTargetTabId(); },` and `overlayViewBounds() { return getOverlayViewBounds(); },`, with both names added to the refs destructure. In main's refs object add `getFindTargetTabId: () => findTargetTabId(rt()),` and `getOverlayViewBounds: () => rt().overlayView?.getBounds() ?? null,`.

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: FAIL — `findTabId` is the main page and the capsule sits over the main pane.

- [ ] **Step 3: Bind find to a pane in main**

```js
/** The tab an open find capsule searches; null when none is open. */
function findTargetTabId(runtime) {
  if (runtime?.overlayMode !== 'find') return null;
  return runtime.overlayPurpose?.findTabId ?? runtime.activeTabId ?? null;
}

/** ⌘F binds the capsule to the pane it was pressed in; the Island's /find
 * and the strip stay on the main page. */
function openFindBar(tabId = rt().activeTabId) {
  if (!rt().window || rt().window.isDestroyed()) return;
  const findTabId = isVisiblePaneId(rt(), tabId) ? tabId : rt().activeTabId;
  showOverlay('find', { purpose: { findTabId } });
}
```

- `chrome:open-find` → `chromeOn('chrome:open-find', () => openFindBar());`
- Executor: `find: (runtime, sender) => openFindBar(browserCommandTab(runtime, sender)?.id),`
- `overlayBounds`, find branch:

```js
  if (rt().overlayMode === 'find') {
    if (!glance) return layout.findBounds;
    const pane = findTargetTabId(rt()) === rt().glanceTabId ? glance.glance : glance.primary;
    const width = Math.min(560, pane.width);
    return {
      x: pane.x + Math.round((pane.width - width) / 2),
      y: pane.y,
      width,
      height: Math.min(160, pane.height),
    };
  }
```

- The capsule closes with its pane. `setActiveTab` already hides `find` on every switch, including the Make main swap. Add the reference's other exits:
  - `closeTab`, directly after `const wasGlance = …`: `if (findTargetTabId(rt()) === id) hideOverlay({ refocusContent: false });`
  - `closeGlance`, directly after `if (!rt().glanceTabId) return false;`: `if (findTargetTabId(rt()) === rt().glanceTabId) hideOverlay({ refocusContent: false });`
  - `setGlanceTab`, after the `previous` detach block: `if (previous && findTargetTabId(rt()) === previous.id) hideOverlay({ refocusContent: false });`
- In the `initTabView` object add `isFindTarget: (owner, tabId) => findTargetTabId(owner) === tabId,`.

- [ ] **Step 4: Route results and queries**

`src/main/tab-view.js`, `found-in-page`: replace `if (id === getOwner().activeTabId) {` with `if (deps.isFindTarget?.(getOwner(), id) ?? id === getOwner().activeTabId) {`.

`src/renderer/overlay.js`:
- after `let glancePickerPurpose = null;` add `/** The tab the find capsule searches (overlay:show purpose). */ let findTabId = null;`
- in `applyMode`, after `glancePickerPurpose = …` add `if (next === 'find') findTabId = purpose?.findTabId ?? state.activeTabId;`
- in `resetFind`: `if (findLastQuery && findTabId) window.browserAPI.stopFindInPage(findTabId);`
- in `runFind`: `if (!findTabId || !query) {` and `window.browserAPI.findInPage(findTabId, query, options);`
- in the `input` listener: `if (findTabId) window.browserAPI.stopFindInPage(findTabId);`

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:acceptance:desktop -- --tags @glance`; then `npm run test:acceptance:desktop -- --tags @F9` (find in page) for the no-Glance path.
Expected: pass.

- [ ] **Step 6: Audit inventory, commit**

`npm run audit-inventory:write`; `git add`; `git commit -m "Open find over the Glance pane it was pressed in"`.

---

### Task 5: Zoom, print, Back and Forward follow the focused pane

**Files:**
- Modify: `src/main/browser-shortcuts.js:5-20` (`COMMANDS`)
- Modify: `src/main/main.js` — executor (`back`, `forward`), `zoomTargetWebContents` (`:7242`), View menu (`:8417-8429`), File → Print (`:8352`)
- Modify: `src/main/test-hook.js` (`zoomLevel`)
- Test: `test/unit/browser-shortcuts.test.js`, `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: `browserCommandTab` (Task 3), `pressBrowserCommand` (Task 3).
- Produces: browser commands `back` (`CmdOrCtrl+[`) and `forward` (`CmdOrCtrl+]`), labelled with the existing `pill.back` / `pill.forward`; menu ids `browser-back`, `browser-forward`, `zoom-in`, `zoom-out`, `zoom-reset`, `print`; hook `zoomLevel(tabId)`; the Given "a main page and a reference on another site, both with history" (Task 9 reuses it).
- Note: ⌘[ / ⌘] do not exist in Blanc today. The spec lists them as following focus, so this task adds them; on Windows and Linux they are Ctrl+[ / Ctrl+]. Chromium zoom is per host, so the zoom scenario puts the reference on `insecure.test` (the harness resolves it to the same fixture server); with both panes on one host, zooming one would zoom the other and no routing rule could change that.

- [ ] **Step 1: Write the failing unit test**

```js
test('Back and Forward are browser commands labelled from the pill', () => {
  assert.equal(browserCommandDefinition('back', 'darwin').primary, 'CmdOrCtrl+[');
  assert.equal(browserCommandDefinition('forward', 'linux').primary, 'CmdOrCtrl+]');
  assert.equal(browserCommandDefinition('back', 'darwin').labelKey, 'pill.back');
  assert.equal(matchBrowserShortcut(input('[', { control: true }), 'win32'), 'back');
  assert.equal(matchBrowserShortcut(input(']', { control: true }), 'linux'), 'forward');
  assert.equal(matchBrowserShortcut(input('[', { control: true, shift: true }), 'linux'), null);
});
```

Run: `node --test test/unit/browser-shortcuts.test.js` — expected FAIL (`browserCommandDefinition('back')` is null).

- [ ] **Step 2: Add the commands**

In `COMMANDS`, after `'hard-reload'`:

```js
  back: { labelKey: 'pill.back', primary: 'CmdOrCtrl+[' },
  forward: { labelKey: 'pill.forward', primary: 'CmdOrCtrl+]' },
```

Before adding, confirm nothing else claims those keys: `grep -n "CmdOrCtrl+\[\|CmdOrCtrl+\]" src/main/*.js` — expected no hits.

Run the unit test — expected PASS.

- [ ] **Step 3: Add the scenario**

```gherkin
  @F34-1 @F34 @D11
  Scenario: Zoom and Back follow focus into the reference
    Given a main page and a reference on another site, both with history
    When the reference pane is the focused pane
    And I press the zoom-in command
    Then only the reference page is zoomed
    When I press the back command
    Then only the reference page went back
```

- [ ] **Step 4: Add the steps and hook**

```js
Given('a main page and a reference on another site, both with history', async function () {
  const other = (name) => {
    const url = new URL(this.fixtureUrl(name));
    url.hostname = 'insecure.test';
    return url.toString();
  };
  this.glanceMainId = await this.call('openTab', this.fixtureUrl('glance-main'));
  this.glanceReferenceId = await this.call('openTab', other('glance-reference'));
  await this.call('navigateTab', this.glanceMainId, this.fixtureUrl('glance-main-2'));
  await this.call('navigateTab', this.glanceReferenceId, other('glance-reference-2'));
  await this.call('activateTab', this.glanceMainId, false);
  await this.waitForState((state) => ['glance-main-2', 'glance-reference-2'].every((title) =>
    state.tabs.some((tab) => tab.title === title && !tab.isLoading && tab.canGoBack)));
  assert.equal(await this.call('setGlance', this.glanceReferenceId), true);
  this.glanceZoomBefore = {
    main: await this.call('zoomLevel', this.glanceMainId),
    reference: await this.call('zoomLevel', this.glanceReferenceId),
  };
});

Then('only the reference page is zoomed', async function () {
  await waitForValue(() => this.call('zoomLevel', this.glanceReferenceId),
    (level) => level > this.glanceZoomBefore.reference, 'reference zoomed in');
  assert.equal(await this.call('zoomLevel', this.glanceMainId), this.glanceZoomBefore.main);
  await this.call('pressBrowserCommand', this.glanceReferenceId, 'zoom-reset');
});

Then('only the reference page went back', async function () {
  const state = await this.waitForState((candidate) =>
    candidate.tabs.find((tab) => tab.id === this.glanceReferenceId)?.title === 'glance-reference');
  assert.equal(state.tabs.find((tab) => tab.id === this.glanceMainId).title, 'glance-main-2');
});
```

Hook, after `pressBrowserCommand`: `zoomLevel(tabId) { return liveContents(tabs.get(tabId))?.getZoomLevel() ?? null; },`

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: FAIL — `no menu item zoom-in`.

- [ ] **Step 5: Implement**

Executor, after `'hard-reload'`:

```js
  back: (runtime, sender) => {
    const nav = liveContents(browserCommandTab(runtime, sender))?.navigationHistory;
    if (nav?.canGoBack()) nav.goBack();
  },
  forward: (runtime, sender) => {
    const nav = liveContents(browserCommandTab(runtime, sender))?.navigationHistory;
    if (nav?.canGoForward()) nav.goForward();
  },
```

`zoomTargetWebContents`:

```js
/** Zoom acts on what the user is looking at: the sheet when open, else the
 * focused page pane (glance-focus.js). Menu clicks carry no sender. */
function zoomTargetWebContents() {
  if (rt().utilitySheetUrl) return liveUtilitySheet()?.wc ?? null;
  return liveContents(browserCommandTab(rt()));
}
```

View menu: before `command('reload'),` insert `command('back'), command('forward'),`; give the zoom items ids (`id: 'zoom-in'` on the visible Zoom In, `id: 'zoom-out'`, `id: 'zoom-reset'` on Actual Size; leave the hidden `CmdOrCtrl+=` alias without an id). File → Print:

```js
        { id: 'print', label: t('menu.print'), accelerator: 'CmdOrCtrl+P', click: bound(() => liveContents(browserCommandTab(rt()))?.print()) },
```

Print opens a system dialog, so it has no acceptance scenario; it shares `browserCommandTab` with zoom, which does.

- [ ] **Step 6: Run to verify it passes**

Run: `node --test test/unit/browser-shortcuts.test.js test/unit/shortcut-labels.test.js test/unit/platform-main-menu.test.js` and `npm run test:acceptance:desktop -- --tags @glance`.
Expected: pass. The Shortcuts page lists Back and Forward on its own, because it renders from the live menu.

- [ ] **Step 7: Audit inventory, commit**

`npm run audit-inventory:write`; `git add`; `git commit -m "Zoom, print, Back and Forward act on the focused Glance pane"`.

---

### Task 6: The 1Password fill and its hint target the focused pane

**Files:**
- Modify: `src/main/main.js` — hint `isEligible` (`:3927`), `captureOnePasswordTarget` (`:3968-3984`), `isOnePasswordTargetCurrent` (`:4000`), `setGlanceTab` (after `attachTabViewToWindow(tab);`)
- Modify: `src/main/tab-view.js:391`, `:408` (fill-capsule dismissal on navigation)
- Modify: `src/renderer/renderer.js:823` (pill hint), `:1059-1064` (`onGlanceLayout`)
- Modify: `docs/1password-integration.md:103-115` (after *Whole-flow invalidation*)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: `browserCommandTab`, `isVisiblePaneId`, `focusPane`; hooks `setOnePasswordConfig`, `onePasswordTarget` (returns `{ kind, webContentsId, windowId, url }`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the scenario**

```gherkin
  @F34-1 @F34 @F38 @D11
  Scenario: The 1Password fill and its hint follow the focused pane
    Given 1Password fill is configured and the Glance reference shows a login form
    When the reference pane is the focused pane
    Then the 1Password fill targets the reference pane
    And the Island shows the fill hint
    When the main page is the focused pane
    Then the 1Password fill targets the main page
    And the Island hides the fill hint
```

- [ ] **Step 2: Add the steps**

```js
Given('1Password fill is configured and the Glance reference shows a login form', async function () {
  await this.call('setOnePasswordConfig', true, 'Acceptance Team');
  this.glanceMainId = await this.call('openTab', this.fixtureUrl('glance-main'));
  this.glanceReferenceId = await this.call('openTab', `${this.fixtureUrl('glance-reference')}?loginform=authoritative`);
  await this.call('activateTab', this.glanceMainId, false);
  await this.waitForState((state) => ['glance-main', 'glance-reference'].every((title) =>
    state.tabs.some((tab) => tab.title === title && !tab.isLoading)));
  assert.equal(await this.call('setGlance', this.glanceReferenceId), true);
});

async function fillTargetId(world) {
  return (await world.call('onePasswordTarget'))?.webContentsId ?? null;
}

Then('the 1Password fill targets the reference pane', async function () {
  const reference = (await this.state()).tabs.find((tab) => tab.id === this.glanceReferenceId);
  assert.equal(await fillTargetId(this), reference.webContentsId);
});

Then('the 1Password fill targets the main page', async function () {
  const main = (await this.state()).tabs.find((tab) => tab.id === this.glanceMainId);
  assert.equal(await fillTargetId(this), main.webContentsId);
});

Then('the Island shows the fill hint', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#pillFillHint:not([hidden])').waitFor();
});

Then('the Island hides the fill hint', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#pillFillHint[hidden]').waitFor({ state: 'attached' });
  await this.call('setOnePasswordConfig', false, '');
});
```

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: FAIL at "targets the reference pane" (the target is the main page).

- [ ] **Step 3: Target and revalidate the focused pane**

In `captureOnePasswordTarget`, replace `const tab = tabs.get(runtime.activeTabId);` through the returned `pickerPoint` with:

```js
  // With Glance open the fill targets the focused pane (spec: Commands
  // follow focus); menu, shortcut and chip all arrive without a sender.
  const tab = browserCommandTab(runtime);
  const wc = liveContents(tab);
  if (!tab || !wc || wc.isDestroyed()) return null;
  const island = runtime.islandRect;
  // Fallback anchor when the field cannot be located: the reference's own
  // top edge rather than the Island, which sits over the other pane.
  const paneBounds = tab.id === runtime.glanceTabId ? tab.view.getBounds() : null;
  return {
    kind: 'tab',
    runtime,
    runtimeId: runtime.id,
    tabId: tab.id,
    navEpoch: tab.navEpoch,
    url: wc.getURL(),
    webContents: wc,
    window: runtime.window,
    pickerPoint: paneBounds
      ? { x: paneBounds.x + Math.round(paneBounds.width / 2), y: paneBounds.y }
      : island
        ? { x: island.x + Math.round(island.width / 2), y: island.y + island.height }
        : { x: 16, y: runtime.chromeHeight },
  };
```

In `isOnePasswordTargetCurrent` replace `if (target.runtime.activeTabId !== target.tabId) return false;` with `if (!isVisiblePaneId(target.runtime, target.tabId)) return false;`.

In the hint scheduler's `isEligible` replace the last line with `return isVisiblePaneId(runtime, tab.id); // both panes; private eligible, quiet excluded above`.

In `setGlanceTab`, after `attachTabViewToWindow(tab);` add `fillHintScheduler?.noteActivated(tab);`.

In `src/main/tab-view.js`, add `const { isVisiblePaneId } = require('./glance-focus');` with the other requires, and in both fill-capsule dismissal lines (`:391`, `:408`) replace `id === getOwner().activeTabId` with `isVisiblePaneId(getOwner(), id)`, so a reference that navigates under a fill message dismisses it like the main page does.

- [ ] **Step 4: Show the focused pane's hint**

`src/renderer/renderer.js`, the fill-hint block:

```js
    // With Glance open the chip follows the focused pane, like the fill.
    const hintTab = glanceLayout?.focusedPane === 'glance' ? glanceTab() : tab;
    pillFillHint.hidden = !(hintTab?.fillHint === true
      && typeof window.browserAPI.fillLoginFromOnePassword === 'function');
```

`onGlanceLayout`: replace `renderGlance();` with `render();` (which calls `renderGlance()`), so a focus change also re-evaluates the chip.

- [ ] **Step 5: Record it in the 1Password doc**

In `docs/1password-integration.md`, after the *Whole-flow invalidation* bullet:

```markdown
- **Which page is filled (Glance).** With Glance open, the fill targets the
  focused pane: the reference when keyboard focus is in it, otherwise the main
  page (`commandTargetTab` in `src/main/glance-focus.js`). The ambient hint
  probes both visible panes, and the Island's chip shows the focused pane's
  result. At every checkpoint the flow re-verifies that its tab is still one
  of the window's two visible panes, and the picker anchors at the field
  inside that pane's own view bounds. The broker, the credential path, the
  explicit-invoke rule and the renderer-free boundary are unchanged.
```

- [ ] **Step 6: Run to verify it passes**

Run: `node --test test/unit/onepassword-policy.test.js` and `npm run test:acceptance:desktop -- --tags @glance`; then `npm run test:acceptance:desktop -- --tags @F38` for the single-pane fill and hint.
Expected: pass.

- [ ] **Step 7: Audit inventory, commit**

`npm run audit-inventory:write`; `git add`; `git commit -m "Fill the focused Glance pane from 1Password and show its hint"`.

---

### Task 7: Mouse gestures and the trackpad gesture work in the reference

**Files:**
- Modify: `src/main/tab-view.js:210`
- Modify: `src/main/main.js:5975-5976` (`dispatchMouseGesture` guard)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: `isVisiblePaneId` (required into tab-view in Task 6); test hooks `setMouseGestures`, `sendMouseInput`; "only the reference page reloaded" (Task 3).

- [ ] **Step 1: Add the scenario and step**

```gherkin
  @F34-1 @F34 @D11
  Scenario: A mouse gesture in the reference acts on the reference
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    And I draw the reload gesture in the reference pane
    Then only the reference page reloaded
```

```js
When('I draw the reload gesture in the reference pane', async function () {
  await recordLoadCounts(this);
  const original = await this.call('setMouseGestures', true);
  await this.call('setMouseGestures', true, { ...original.mapping, R: 'reload' });
  try {
    for (const input of [
      { type: 'mouseDown', x: 200, y: 200, button: 'right', clickCount: 1 },
      { type: 'mouseMove', x: 260, y: 200, button: 'right' },
      { type: 'mouseUp', x: 260, y: 200, button: 'right', clickCount: 1 },
    ]) assert.equal(await this.call('sendMouseInput', this.glanceReferenceId, input), true);
    await waitForValue(() => loadCount(this, this.glanceReferenceId),
      (count) => count !== this.glanceLoadsBefore.reference, 'gesture acted', 2000).catch(() => {});
  } finally {
    await this.call('setMouseGestures', original.enabled, original.mapping);
  }
});
```

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: FAIL — the gesture is cancelled because the reference is not the main page.

- [ ] **Step 2: Accept gestures in both panes**

`tab-view.js:210`: `if (!enabled || !isVisiblePaneId(getOwner(), id) || tab.view?.webContents !== wc) {`

`main.js` `dispatchMouseGesture`: `if (!owner || owner.closing || !isVisiblePaneId(owner, tab.id) || liveContents(tab) == null) return;`

The gesture's own actions already address its tab (back, forward, reload, closeTab); New Tab, Reopen, tab cycling and the Island stay window-level, which is the main page's (Global Constraints).

- [ ] **Step 3: Run to verify it passes**

Run: `npm run test:acceptance:desktop -- --tags @glance` and `npm run test:mouse-gestures:desktop`.
Expected: pass.

- [ ] **Step 4: Audit inventory, commit**

`npm run audit-inventory:write`; `git add`; `git commit -m "Let mouse and trackpad gestures act on the Glance reference"`.

---

### Task 8: Foreground tabs opened from the reference open into Glance

**Files:**
- Modify: `src/main/tab-view.js:584-598` (`createWindow`)
- Modify: `src/main/main.js` (the `initTabView` object: `setGlanceTab`)
- Modify: `test/desktop/support/fixtures-server.js:21-50` (`pageBody`)
- Modify: `src/main/test-hook.js` (`clickInTab`)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: `setGlanceTab(id) → Promise<boolean>` (unchanged; its ownership and liveness re-checks are the security boundary).
- Produces: fixture `?blanklink=<name>` → `<a id="acceptance-blank" href="/site/<name>" target="_blank">`; hook `clickInTab(tabId, selector, modifiers = []) → boolean`.

- [ ] **Step 1: Add the scenarios**

```gherkin
  @F34-1 @F34 @D11
  Scenario: A link that opens a new tab from the reference opens into Glance
    Given a Glance reference with a link that opens a new tab
    When I click that link in the reference pane
    Then the new tab is the reference and the old reference stays open
    And the main page is unchanged

  @F34-1 @F34 @D11
  Scenario: A background-tab click in the reference stays in the background
    Given a Glance reference with a link that opens a new tab
    When I click that link in the reference pane as a background tab
    Then a background tab opened and Glance shows the same reference

  @F34-1 @F34 @F11 @D11
  Scenario: A private reference opens its new tab privately into Glance
    Given a private Glance reference with a link that opens a new tab
    When I click that link in the reference pane
    Then the new tab is the reference and the old reference stays open
    And the new reference is private
```

- [ ] **Step 2: Add the fixture, hook and steps**

`fixtures-server.js` `pageBody`, after the `loginForm` constant:

```js
  // Glance links (F34): ?blanklink=<name> adds a target=_blank link to
  // /site/<name>. The name is restricted so nothing reaches the markup raw.
  const blankName = /[?&]blanklink=([a-z0-9-]{1,40})(?:&|$)/.exec(raw)?.[1];
  const blankLink = blankName
    ? `<p><a id="acceptance-blank" href="/site/${blankName}" target="_blank" style="display:inline-block;padding:16px">open ${blankName}</a></p>`
    : '';
```

and insert `blankLink +` directly before `` `<p>widget widget widget</p>` `` … (i.e. change `` `</script><p>widget widget widget</p>` + `` to `` `</script>` + blankLink + `<p>widget widget widget</p>` + ``).

`test-hook.js`, after `zoomLevel`:

```js
    // A real mouse click on an element of a tab's page, so the page's own
    // target=_blank / modifier handling decides the window-open disposition.
    async clickInTab(tabId, selector, modifiers = []) {
      const wc = liveContents(tabs.get(tabId));
      if (!wc) return false;
      const point = await wc.executeJavaScript(`(() => {
        const rect = document.querySelector(${JSON.stringify(String(selector))})?.getBoundingClientRect();
        return rect ? { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) } : null;
      })()`);
      if (!point) return false;
      wc.focus();
      const input = { ...point, button: 'left', clickCount: 1, modifiers: [...modifiers] };
      wc.sendInputEvent({ ...input, type: 'mouseDown' });
      wc.sendInputEvent({ ...input, type: 'mouseUp' });
      return true;
    },
```

Steps:

```js
async function referenceWithLink(world, opts = {}) {
  world.glanceMainId = await world.call('openTab', world.fixtureUrl('glance-main'));
  world.glanceReferenceId = await world.call('openTab',
    `${world.fixtureUrl('glance-reference')}?blanklink=glance-opened`, opts);
  await world.call('activateTab', world.glanceMainId, false);
  await world.waitForState((state) => ['glance-main', 'glance-reference'].every((title) =>
    state.tabs.some((tab) => tab.title === title && !tab.isLoading)));
  assert.equal(await world.call('setGlance', world.glanceReferenceId), true);
  world.glanceMainUrlBefore = (await world.state()).tabs.find((tab) => tab.id === world.glanceMainId).url;
}

Given('a Glance reference with a link that opens a new tab', async function () {
  await referenceWithLink(this);
});

Given('a private Glance reference with a link that opens a new tab', async function () {
  await referenceWithLink(this, { private: true });
});

When('I click that link in the reference pane', async function () {
  assert.equal(await this.call('clickInTab', this.glanceReferenceId, '#acceptance-blank'), true);
});

When('I click that link in the reference pane as a background tab', async function () {
  const modifier = (await ctx.app.evaluate(() => process.platform)) === 'darwin' ? 'meta' : 'control';
  assert.equal(await this.call('clickInTab', this.glanceReferenceId, '#acceptance-blank', [modifier]), true);
});

Then('the new tab is the reference and the old reference stays open', async function () {
  const state = await this.waitForState((candidate) => {
    const reference = candidate.tabs.find((tab) => tab.id === candidate.glanceTabId);
    return reference && reference.id !== this.glanceReferenceId && reference.title === 'glance-opened';
  });
  this.glanceOpenedId = state.glanceTabId;
  assert.equal(state.activeTabId, this.glanceMainId);
  assert.ok(state.tabOrder.includes(this.glanceReferenceId), 'the previous reference was closed');
});

Then('the main page is unchanged', async function () {
  const state = await this.state();
  assert.equal(state.activeTabId, this.glanceMainId);
  assert.equal(state.tabs.find((tab) => tab.id === this.glanceMainId).url, this.glanceMainUrlBefore);
});

Then('the new reference is private', async function () {
  const opened = (await this.state()).tabs.find((tab) => tab.id === this.glanceOpenedId);
  assert.equal(opened.private, true);
  assert.equal(opened.sessionKind, 'private');
});

Then('a background tab opened and Glance shows the same reference', async function () {
  const state = await this.waitForState((candidate) =>
    candidate.tabs.some((tab) => tab.title === 'glance-opened' && !tab.isLoading));
  assert.equal(state.glanceTabId, this.glanceReferenceId);
  assert.equal(state.activeTabId, this.glanceMainId);
});
```

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: scenarios 1 and 3 fail — the opened tab becomes the main page. Scenario 2 passes and stays as the background-disposition pin.

- [ ] **Step 3: Route foreground opens from the reference**

In `tab-view.js` `createWindow`, directly before `const newId = createTab(…)` add:

```js
          // Read at open time: a foreground tab the reference opened becomes
          // the reference, leaving the main page and its focus untouched.
          const fromReference = getOwner().glanceTabId === tab.id;
```

and replace `if (disposition !== 'background-tab') setImmediate(() => setActiveTab(newId));` with:

```js
          if (disposition !== 'background-tab') {
            setImmediate(() => {
              if (!fromReference) return setActiveTab(newId);
              // setGlanceTab re-checks ownership and liveness; a tab that
              // closed or moved meanwhile simply stays where it is.
              Promise.resolve(deps.setGlanceTab?.(newId)).catch(() => {});
            });
          }
```

In main's `initTabView` object, after `noteFocusedPane,` add `setGlanceTab,`.

- [ ] **Step 4: Run to verify they pass**

Run: `npm run test:acceptance:desktop -- --tags @glance`; then `npm run test:modified-links:desktop` (the modified-click dispositions, single pane).
Expected: pass.

- [ ] **Step 5: Audit inventory, commit**

`npm run audit-inventory:write`; `git add`; `git commit -m "Open new tabs from the Glance reference into Glance"`.

---

### Task 9: Back and Reload in the Glance header

**Files:**
- Modify: `src/renderer/index.html:78-80` (inside `.glance-copy`, after the eyebrow)
- Modify: `src/renderer/renderer.js:53-60` (element constants), after `PILL_ICONS` (`:97-114`), `renderGlance` (`:393-437`), header listeners (`:929-940`)
- Modify: `src/renderer/styles.css:335` (after `.glance-close`), `:369-372` (the 360 px container query)
- Test: `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: `canGoBack` / `isLoading` already in every tab payload; existing bridge calls `goBack(id)`, `reload(id)`, `stop(id)` — no bridge change; Task 5's Given.
- Produces: `#glanceBack`, `#glanceReload` (`data-mode` `reload` | `stop`).

- [ ] **Step 1: Add the scenario**

```gherkin
  @F34-1 @F34 @D11
  Scenario: The Glance header goes back and reloads the reference
    Given a main page and a reference on another site, both with history
    Then the Glance header's Back button is enabled
    When I click Back in the Glance header
    Then only the reference page went back
    And the Glance header's Back button is disabled
    When I click Reload in the Glance header
    Then only the reference page reloaded
    When the reference starts a slow load
    Then the Glance header's Reload button reads Stop
```

- [ ] **Step 2: Add the steps**

```js
Then("the Glance header's Back button is enabled", async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceBack:not([disabled])').waitFor();
  assert.equal(await chrome.locator('#glanceBack').getAttribute('aria-label'), 'Back');
});

Then("the Glance header's Back button is disabled", async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceBack[disabled]').waitFor();
});

When('I click Back in the Glance header', async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceBack').click();
});

When('I click Reload in the Glance header', async function () {
  await recordLoadCounts(this);
  const chrome = await mainChromePage();
  await chrome.locator('#glanceReload').click();
});

When('the reference starts a slow load', async function () {
  const url = new URL((await this.state()).tabs.find((tab) => tab.id === this.glanceReferenceId).url);
  url.searchParams.set('hold', 'slow');
  this.call('navigateTab', this.glanceReferenceId, url.toString());
});

Then("the Glance header's Reload button reads Stop", async function () {
  const chrome = await mainChromePage();
  await chrome.locator('#glanceReload[data-mode="stop"]').waitFor();
  assert.equal(await chrome.locator('#glanceReload').getAttribute('aria-label'), 'Stop');
});
```

(`navigateTab` is not awaited on purpose: it resolves when the slow load finishes.)

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: FAIL — `#glanceBack` does not exist.

- [ ] **Step 3: Markup**

In `index.html`, after `<span id="glanceEyebrow" …>GLANCE</span>`:

```html
          <span class="glance-nav">
            <button id="glanceBack" class="glance-nav-btn" type="button" title="Back" aria-label="Back" data-i18n-title="pill.back" data-i18n-aria-label="pill.back" disabled></button>
            <button id="glanceReload" class="glance-nav-btn" type="button" title="Reload" aria-label="Reload" data-i18n-title="pill.reload" data-i18n-aria-label="pill.reload"></button>
          </span>
```

- [ ] **Step 4: Renderer**

Constants after `const glanceClose = …`: `const glanceBack = document.getElementById('glanceBack');` and `const glanceReload = document.getElementById('glanceReload');`. After the `PILL_ICONS` object:

```js
  // The reference header reuses the pill's own back and reload glyphs.
  glanceBack.innerHTML = PILL_ICONS.back;
  glanceReload.innerHTML = PILL_ICONS.reload;
  glanceReload.dataset.mode = 'reload';
```

In `renderGlance`, after `setFavicon(glanceFavicon, tab);`:

```js
    glanceBack.disabled = !tab.canGoBack;
    const glanceReloadMode = tab.isLoading ? 'stop' : 'reload';
    if (glanceReload.dataset.mode !== glanceReloadMode) {
      glanceReload.dataset.mode = glanceReloadMode;
      glanceReload.innerHTML = PILL_ICONS[glanceReloadMode];
      const label = blancI18n.t(glanceReloadMode === 'stop' ? 'pill.stop' : 'pill.reload');
      glanceReload.title = label;
      glanceReload.setAttribute('aria-label', label);
    }
```

Listeners, before `glancePromote.addEventListener`:

```js
  glanceBack.addEventListener('click', (event) => {
    event.stopPropagation();
    if (state.glanceTabId) window.browserAPI.goBack(state.glanceTabId);
  });
  glanceReload.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!state.glanceTabId) return;
    if (glanceReload.dataset.mode === 'stop') window.browserAPI.stop(state.glanceTabId);
    else window.browserAPI.reload(state.glanceTabId);
  });
```

- [ ] **Step 5: Styles**

After `.glance-close { … }`:

```css
.glance-nav {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 3px;
}
.glance-header .glance-nav-btn { width: 30px; padding: 0; }
/* The pill's glyph size and stroke, so the two read as one control family. */
.glance-nav-btn svg { width: 14px; height: 14px; stroke-width: 1.4; }
.glance-header .glance-nav-btn:disabled {
  color: var(--border);
  background: transparent;
  cursor: default;
}
```

In `@container (max-width: 360px)` change `.glance-copy { gap: 0; }` to `.glance-copy { gap: 8px; }`: with the eyebrow hidden, Back and Reload still sit beside the title and need the gap. Back and Reload have no compaction rule, so they stay at every width.

- [ ] **Step 6: Run to verify it passes**

Run: `npm run test:acceptance:desktop -- --tags @glance` — including "a labelled stacked header", whose action-bounds checks now include the two new buttons.
Expected: pass.

- [ ] **Step 7: Commit**

`git add src/renderer/index.html src/renderer/renderer.js src/renderer/styles.css spec/acceptance/glance.feature test/desktop/steps/glance.steps.js`; `git commit -m "Add Back and Reload to the Glance header"`.

---

### Task 10: Make main's accessible name and swap glyph

**Files:**
- Modify: `copy/messages/en.json:341-344`, `de.json:336`, `es.json:336`, `fr.json:336`, `pt-BR.json:336`, `it.json:336` (`glance.promote`)
- Regenerate: `npm run copy:build` outputs
- Modify: `src/renderer/index.html:86-87` (the promote glyph)
- Modify: `test/desktop/steps/glance.steps.js:152`
- Test: the existing first Glance scenario

**Interfaces:** none new.

- [ ] **Step 1: Change the assertion first**

In "the active page and Glance occupy separate dominant and reference panes", replace the `#glancePromote` aria-label assertion with:

```js
  const promote = chrome.locator('#glancePromote');
  const promoteName = await promote.getAttribute('aria-label');
  assert.equal(promoteName, 'Make main — swap with the main page');
  assert.ok(promoteName.startsWith((await promote.locator('span').textContent()).trim()),
    'the accessible name begins with the visible words (label in name)');
  assert.equal(await promote.locator('svg path').getAttribute('d'),
    'M3.5 5.5h9M10 3l2.5 2.5L10 8M12.5 10.5h-9M6 8l-2.5 2.5L6 13',
    'the icon-only state draws the swap glyph, not the Forward chevron');
```

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: FAIL — the name is "Make Glance the main page".

- [ ] **Step 2: The string in six languages**

`en.json`:

```json
  "glance.promote": {
    "message": "Make main — swap with the main page",
    "note": "Tooltip and accessible name of the button that swaps Glance with the main page. Begins with the visible label (glance.promoteShort) so speech-input users can say what they see."
  },
```

Translations (each begins with that language's `glance.promoteShort`):

| Locale | `glance.promote` |
| --- | --- |
| de | Hauptseite — mit der Hauptseite tauschen |
| es | Principal — intercambiar con la página principal |
| fr | Principale — échanger avec la page principale |
| pt-BR | Principal — trocar com a página principal |
| it | Principale — scambia con la pagina principale |

Set each locale's `message`, then acknowledge, one command per locale:

```bash
npm run copy:ack -- de glance.promote
```

(repeat for `es`, `fr`, `pt-BR`, `it`), then `npm run copy:build` and `npm run copy:check`.

- [ ] **Step 3: The swap glyph**

In `index.html`, replace the promote button's `<path d="M6.25 3.5 10.75 8l-4.5 4.5"/>` with `<path d="M3.5 5.5h9M10 3l2.5 2.5L10 8M12.5 10.5h-9M6 8l-2.5 2.5L6 13"/>` (two opposed arrows on the 16 px grid). The visible text and the compaction rules are unchanged.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run copy:check`, `npm run test:acceptance:desktop -- --tags @glance`, and `npm run test:i18n:desktop`.
Expected: pass.

- [ ] **Step 5: Commit**

`git add copy/messages src/renderer/pages/strings.*.js src/main/ublock-strings.json src/renderer/index.html test/desktop/steps/glance.steps.js` (only the generated files `copy:build` actually changed); `git commit -m "Name Make main by its visible words and give it a swap glyph"`.

---

### Task 11: Right-clicking the header opens the reference tab's menu

**Files:**
- Modify: `src/main/tab-context-menu-model.js:38` (signature), `:71-77` (the glance item)
- Modify: `src/main/tab-context-menu.js:28` (runner)
- Modify: `src/main/main.js` — `tabContextData` (`:8578`), `menuContextActions` (after `glance:`, `:8619`)
- Modify: `src/renderer/renderer.js:16-22` (strip `contextmenu`)
- Test: `test/unit/tab-context-menu-model.test.js`, `test/unit/tab-context-menu-runner.test.js`, `spec/acceptance/glance.feature`, `test/desktop/steps/glance.steps.js`

**Interfaces:**
- Consumes: the existing `attachChromeMenu` row path (`window.__blancCtxRowTabId` → `resolveTab` → surface `row`).
- Produces: model parameter `glanceTabId`; item id `close-glance` labelled with the existing `menu.closeGlance`; action `closeGlance()`.
- Note: the model decides by `glanceTabId`, so the ⌘L row of the current reference also reads **Close Glance**. That is the spec's PR 3 toggle; it comes free with the header menu because both use one model, and PR 3's plan should tick it rather than redo it.

- [ ] **Step 1: Write the failing unit tests**

`tab-context-menu-model.test.js`: in `build`, add `glanceTabId: over.glanceTabId ?? null,`, and append:

```js
test('the current Glance reference offers Close Glance instead of Open in Glance', () => {
  const reference = build({ activeTabId: 2, surface: 'row', glanceTabId: 1 });
  assert.equal(byId(reference, 'glance'), undefined);
  assert.equal(byId(reference, 'close-glance').label, 'Close Glance');
  const other = build({ activeTabId: 2, surface: 'row', glanceTabId: 3 });
  assert.equal(byId(other, 'glance').label, 'Open in Glance');
  assert.equal(byId(other, 'close-glance'), undefined);
});
```

`tab-context-menu-runner.test.js`: add `'closeGlance'` to `names`, and append:

```js
test('close-glance closes the pane, not the tab', () => {
  const { actions, calls } = spyActions();
  runTabContextMenuItem('close-glance', { tab, actions });
  assert.deepEqual(calls, [['closeGlance']]);
});
```

Run: `node --test test/unit/tab-context-menu-model.test.js test/unit/tab-context-menu-runner.test.js`
Expected: FAIL.

- [ ] **Step 2: Model and runner**

Model signature: `function buildTabContextMenu({ tab, groups = [], activeTabId, glanceTabId = null, surface, canCloseOthers, canMoveToNewWindow, canQuiet, t }) {`. Inside `if (surface === 'row' && !isActive) {` replace the glance push with:

```js
    items.push(tab.id === glanceTabId
      ? { id: 'close-glance', label: t('menu.closeGlance') }
      : { id: 'glance', label: t('tabMenu.glance') });
```

Runner, after `case 'glance':` add `case 'close-glance': return actions.closeGlance();`.

Run the two unit files — expected PASS.

- [ ] **Step 3: Add the scenario and steps**

```gherkin
  @F34-1 @F34 @D11
  Scenario: Right-clicking the Glance header addresses the reference tab
    Given two ordinary tabs in one workspace for Glance
    When I open the reference tab in Glance
    Then a right-click on the Glance title addresses the reference tab
    And a right-click on a Glance header button addresses no tab
```

```js
// A synthetic contextmenu reaches the strip's DOM handler but not main's
// native context-menu event, so this observes exactly what the strip hands
// main: the recorded tab id and whether the default menu was suppressed.
async function stripContextTarget(chrome, selector) {
  return chrome.evaluate((target) => {
    window.__blancCtxRowTabId = 'unset';
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.querySelector(target).dispatchEvent(event);
    const id = window.__blancCtxRowTabId;
    window.__blancCtxRowTabId = null;
    return { id, prevented: event.defaultPrevented };
  }, selector);
}

Then('a right-click on the Glance title addresses the reference tab', async function () {
  const chrome = await mainChromePage();
  const result = await stripContextTarget(chrome, '#glanceTitle');
  assert.equal(String(result.id), String(this.glanceReferenceId));
  assert.equal(result.prevented, false);
});

Then('a right-click on a Glance header button addresses no tab', async function () {
  const chrome = await mainChromePage();
  for (const selector of ['#glanceBack', '#glanceReload', '#glancePromote', '#glanceChange', '#glanceClose']) {
    const result = await stripContextTarget(chrome, selector);
    assert.equal(result.id, null, `${selector} addressed a tab`);
    assert.equal(result.prevented, true, `${selector} let a default menu through`);
  }
});
```

Run: `npm run test:acceptance:desktop -- --tags @glance`
Expected: FAIL — the title records `null` and the event is prevented.

- [ ] **Step 4: Wire the strip and main**

`renderer.js`, the strip `contextmenu` handler:

```js
  document.addEventListener('contextmenu', (e) => {
    // The Glance header's title and empty area address the reference tab;
    // its buttons are controls and open nothing.
    const onGlanceHeader = !!e.target.closest('#glanceHeader') && !e.target.closest('button');
    window.__blancCtxRowTabId =
      e.target.closest('.vertical-tab-row[data-tab-id]')?.dataset.tabId
      ?? (onGlanceHeader ? state.glanceTabId : null)
      ?? null;
    if (!e.target.closest('#islandPill') && window.__blancCtxRowTabId == null) {
      e.preventDefault();
    }
  });
```

(`state` is declared later in the same closure and initialised before any event can fire.)

`main.js` `tabContextData`: after `activeTabId: owner.activeTabId,` add `glanceTabId: owner.glanceTabId ?? null,`. `menuContextActions`: after `glance: …` add `closeGlance: b(() => closeGlance()),`.

- [ ] **Step 5: Run to verify it passes**

Run: `node --test test/unit/tab-context-menu-model.test.js test/unit/tab-context-menu-runner.test.js` and `npm run test:acceptance:desktop -- --tags @glance`.
Expected: pass. Then right-click the header title in a running app once (`npm start`, open Glance) and confirm the native menu shows **Close Glance**; if Electron cannot launch in this session, say so in the PR and give the owner that one step.

- [ ] **Step 6: Audit inventory, commit**

`npm run audit-inventory:write`; `git add`; `git commit -m "Open the reference tab's menu from the Glance header"`.

---

### Task 12: F34, whole-PR checks, captures and the PR

**Files:**
- Modify: `spec/features.md:748-756` (F34)
- Create: `docs/design-reviews/glance-pr2-2026-10-15/` (README + two PNGs)

- [ ] **Step 1: F34**

In `spec/features.md` F34, after the bullet ending "promotion is explicit and swaps the two visible tabs.", add:

```markdown
- Browser commands follow the focused pane. With keyboard focus in the
  reference, Reload and Hard Reload, Close Tab, Find, zoom, Print, Back and
  Forward (`Cmd/Ctrl+[` / `]`), the 1Password fill and its hint, and mouse
  gestures act on the reference; Close Tab there closes the reference tab and
  Glance collapses. ⌘L and the Island, New Tab, ⌘1–9, the shield popover, the
  blocked count and the tab-scoped slash commands stay on the main page. The
  header's eyebrow and bottom hairline brighten while the reference holds
  focus.
- A tab the reference opens in the foreground (`target=_blank`,
  `window.open`, Cmd/Ctrl+Shift-click) becomes the reference; the previous
  reference stays open as an ordinary tab and the main page is untouched.
  Background opens stay in the background.
- The reference header carries **Back** (disabled when there is nothing to go
  back to) and **Reload** / **Stop**. **Make main**'s accessible name begins
  with its visible words, and right-clicking the header's title opens the
  reference tab's menu with **Close Glance**.
```

and append to the **Acceptance** bullet: "It also proves that reload, close, find, zoom, Back, the 1Password fill and gestures follow the focused pane, that foreground links from the reference open into Glance, and that the header's Back, Reload and menu address the reference." Commit: `git add spec/features.md`; `git commit -m "Describe the Glance reference's commands, links and header in F34"`.

- [ ] **Step 2: Full local gates**

```bash
npm run lint
npm run substrate:check
npm run browser-api:check
npm run test:unit
npm run test:acceptance:desktop -- --tags @glance
```

Expected: all pass. Report any failure with its output before rerunning. The full desktop suite runs only when the owner says go.

- [ ] **Step 3: Before/after captures**

Write `capture-glance-header.mjs` in the scratchpad: launch the app with Playwright `_electron` as `test/desktop/surface-captures.mjs` does (`BLANC_TEST=1`, a throwaway `--user-data-dir`), wait for `__blanc.startupReady()`, start the acceptance fixture server (`require('./test/desktop/support/fixtures-server.js').start()`) and open `<base>/site/glance-main` and `<base>/site/Lisbon%20travel%20guide` with `openTab`, call `setGlance` on the second, focus it with `focusTabContents`, read `getGlanceGeometry().glanceHeader`, and save `BrowserWindow.getAllWindows()[0].webContents.capturePage(headerRect)` as PNG at full resolution, once side by side (1200 × 800 content) and once stacked (700 × 800). Run it from a `git worktree add` of `origin/main` for "before" and from this branch for "after"; stack each pair with `magick before.png -background '#e5484d' -splice 0x2 after.png -append`. Save as `header-side-by-side-before-above-after.png` and `header-stacked-before-above-after.png` with a README in the PR 1 captures' format ("where to look": Back and Reload; the swap glyph only where the header is narrow; the brighter eyebrow and hairline with the reference focused). Commit: `git add docs/design-reviews/glance-pr2-2026-10-15`; `git commit -m "Record the Glance header before/after captures"`.

- [ ] **Step 4: Review, then open the PR**

Run a fresh correctness, focus and lifecycle review of the branch diff (the spec's acceptance gate 6), fix what it confirms, then `git push -u origin claude/relaxed-brahmagupta-923e8d` and:

```bash
gh pr create --repo bnfy/blanc --base main --title "Glance: the reference behaves like a page (2 of 3)" --body-file <scratchpad>/pr-body.md
```

Body: follows #842; the spec link; a checklist of the spec's PR 2 items with the scenario that proves each; the two deliberate choices (⌘[ / ⌘] are new commands; the ⌘L row's **Close Glance** toggle lands here with the header menu); the title already being `--text`; the captures; Print and the native header menu as the two items checked by hand rather than by a scenario; the attribution line from the session reminder. Then `get_status` / `bind_pr` with the ccd_pr tools.
