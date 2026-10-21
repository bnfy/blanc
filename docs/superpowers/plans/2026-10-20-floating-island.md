# Floating Island Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With Auto-hide on, the revealed Island floats over the page as a lone pill and the page never moves; the v1.39.0 push behaviour stays available as a choice.

**Architecture:** The window's own webContents (the strip document) stays the geometry authority and keeps drawing the rail, Glance and a new 6px drag band. In float mode, small transparent `WebContentsView`s run the same `index.html`/`renderer.js` as a *float surface*. Each is a tight window onto a full-size replica of the strip, offset so its element sits exactly where the strip draws it:
- the pill, on every platform;
- the window controls and the main-menu button, on Windows and Linux only.

Main splits "where the page starts" from "where the Island is" so overlays anchor under the pill while the page stays at `y = 0`.

**Tech Stack:** Electron 44 (`WebContentsView`, `-webkit-app-region`), plain JS, `node --test`, Cucumber + Playwright-Electron.

**Spec:** `docs/superpowers/specs/2026-10-20-floating-island-design.md` (the owner approved it in the design session on 2026-10-20 with "approved, write the plan"). Read it first; this plan argues from it.

## Global Constraints

- Setting key `islandAutoHideStyle`, values `'float' | 'push'`, default `'float'`, unknown → `'float'`, device-local: in schema `internalDefaults`, never in `SYNCED_KEYS`.
- Float mode never changes the page view's bounds on reveal or hide.
- Float views are tight rectangles, never full width. A transparent pixel still takes clicks.
- Float views are created only while Auto-hide is on with float selected, and destroyed when either turns off. They stay attached for their whole life: hide with `setVisible(false)` and never remove/re-add them (Linux rule, applied on every platform).
- Stacking, bottom to top: tab/Glance views < utility sheet < controls < menu < pill < fill capsule < overlay < permission view < tooltip view and uBO popup.
- Slide: 160ms in, 200ms out, ease-out, from above the window edge; Reduce Motion snaps.
- Drag band: 6px, top of the page pane, in the strip document; double-click maximises; no-drag while `drag-suspended`.
- Glance open ⇒ the push layout, even in float mode.
- macOS never gets controls or menu float views (native traffic lights and menu bar). In float mode its traffic lights stay visible the whole time.
- Every new English string ships in de, es, fr, pt-BR and it in the same commit, acknowledged with `npm run copy:ack -- <locale> <keys>`.
- `npm run lint`, `npm run test:unit` and `npm run substrate:check` pass at every commit.
- No website or marketing copy (`docs/marketing-claims.md`).
- Work stops at the Windows/Linux hand-off (Task 8). Merge waits for those results. A drag-band failure alone may use the approved no-band fallback; any other failure must be resolved before merge.

## Review Focus

1. **The pill changes width while floating** (a new tab adds a dot, a long domain), or the window is resized. Expected: the float view's bounds follow the strip's new `islandRect`, and the pill is never clipped. Tests F1-34 and F1-40 in Task 5.
2. **Switching tabs, or opening a utility sheet, while the pill floats.** Expected: the pill stays above the new tab view and above the sheet. Test in Task 5.
3. **Changing style or turning Auto-hide off while the Island is revealed, mid-slide, or while Glance is open.** Expected: the float views are destroyed, nothing is stuck on screen, and the page lands at the right `y`. Tests F1-34, F1-37, F1-38 and F1-39 in Task 5.
4. **A private tab or a theme change while floating.** Expected: the float pill shows the private theme and the new theme like the strip does. Tests F1-35 and F1-41 in Task 5.
5. **A second window, then closing it.** Expected: each window has its own float views, and closing one unregisters and destroys its views with no leaked chrome surfaces. Test in Task 5.

---

### Task 0: macOS spike (throwaway, not merged)

Proves the three macOS assumptions from the spec's "Spike and hand-off" before any real code.

**Files:** a throwaway local branch `spike/floating-island` off this branch. Never pushed; deleted after.

- [ ] **Step 1:** In `createMainWindowForRuntime`, after `createOverlay()`, add a hard-coded transparent `WebContentsView`:
  - bounds `{x: 400, y: 0, width: 360, height: 76}`;
  - `setBackgroundColor('#00000000')`;
  - loading a `data:` URL that draws a rounded white pill with `box-shadow: 0 6px 24px #0005`;
  - its body slides in with `@keyframes` from `translateY(-60px)` over 160ms on click;
  - re-added after every `attachTabViewToWindow`.
- [ ] **Step 2:** In `styles.css`, make `#strip.strip-hidden` keep a 6px `-webkit-app-region: drag` child at the top.
- [ ] **Step 3:** `npm start`. With Auto-hide on, check each of these:
  - the shadow composites over a page;
  - clicks just outside the 360×76 rect reach the page;
  - the pill keeps drawing across 5 tab switches;
  - the slide reads as coming from above the window edge;
  - dragging the top 6px moves the window;
  - double-clicking it zooms the window.
- [ ] **Step 4:** Write the results in 6 lines to `docs/superpowers/plans/2026-10-20-floating-island.spike.md` and commit that file only on the real branch. Delete the spike branch.
- [ ] **Step 5:** If any check fails, stop and report to the owner before Task 1.

### Task 1: The `islandAutoHideStyle` setting

**Files:**
- Modify: `src/main/island-autohide.js` (constants + normalizer)
- Modify: `src/main/settings.js:219,486,591`
- Modify: `settings-schema/schema.json:65` (`internalDefaults`)
- Modify: `src/renderer/pages/settings.html` (new row after `#islandAutoHideSetting`), `src/renderer/pages/settings.js:468-477`
- Modify: `copy/messages/en.json` + `de`, `es`, `fr`, `pt-BR`, `it`
- Modify: `src/main/main.js:3185` (live copy) and `:12820` (fan-out), `src/main/test-hook.js:540-545,3655`
- Test: `test/unit/island-autohide-settings.test.js`, `test/unit/island-autohide.test.js`

**Interfaces:**
- Produces:
  - `AUTO_HIDE_STYLES = ['float', 'push']` and `normalizeAutoHideStyle(value) -> 'float'|'push'`, exported from `island-autohide.js`;
  - main-module `let islandAutoHideStyle` and `applyIslandAutoHideStyle(next: 'float'|'push')`, which only stores the value and calls `resizeActiveView()` in every runtime in this task;
  - test hook `setIslandAutoHideStyle(style) -> style`;
  - `getIslandAutoHideState()` gains `style`.

- [ ] **Step 1: Write the failing tests**

```js
// island-autohide-settings.test.js
test('auto-hide style defaults to float, accepts only float|push and never syncs', (t) => {
  /* same setup as the auto-hide test above */
  assert.equal(settings.getSettings().islandAutoHideStyle, 'float');
  assert.equal(settings.setSettings({ islandAutoHideStyle: 'push' }).islandAutoHideStyle, 'push');
  assert.equal(settings.setSettings({ islandAutoHideStyle: 'slide' }).islandAutoHideStyle, 'push');
  assert.equal(settings.setSettings({ islandAutoHideStyle: 'float' }).islandAutoHideStyle, 'float');
  assert.equal(Object.hasOwn(settings.exportForSync().values, 'islandAutoHideStyle'), false);
});
test('a stored unknown style loads as float', /* write settings.json {islandAutoHideStyle: 7}, load, expect 'float' */);
test('Settings places the style right after auto-hide, hidden until auto-hide is on', () => {
  assert.match(html, /id="islandAutoHideSetting"[\s\S]*?<\/label>\s*<\/div>\s*<div class="setting" id="islandAutoHideStyleSetting" hidden>/);
  assert.match(html, /<select id="islandAutoHideStyle"[^>]*>\s*<option value="float"[\s\S]*?<option value="push"/);
  assert.match(page, /if \(supports\('islandAutoHideStyle'\)\)/);
});
// island-autohide.test.js
test('normalizeAutoHideStyle', () => {
  assert.equal(normalizeAutoHideStyle('push'), 'push');
  for (const v of ['float', undefined, null, 'PUSH', 1]) assert.equal(normalizeAutoHideStyle(v), 'float');
});
```

- [ ] **Step 2:** Run `node --test test/unit/island-autohide-settings.test.js test/unit/island-autohide.test.js`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - `settings.js`: default `islandAutoHideStyle: 'float'`; sanitise on load and in `setSettings` with `normalizeAutoHideStyle`, accepting only an exact member of `AUTO_HIDE_STYLES` from a partial.
  - Schema: add the key to `internalDefaults` directly after `islandAutoHide`.
  - Settings row: a `<select>` styled like `#tabLayout`. `settings.js` shows the row (`hidden = !islandAutoHide.checked`) on load and on every toggle change, and saves with `bowserPages.settings.set({ islandAutoHideStyle })`.
- [ ] **Step 4: Copy (exact English).**
  - `settings.general.islandAutoHideStyle.label`: "When the Island comes back"
  - `….hint`: "Float it over the page, or move the page down to make room."
  - `….float`: "Float over the page"
  - `….push`: "Push the page down"

  Notes follow the neighbours ("Settings → General: …"). Translate into the five languages, then run `npm run copy:ack -- <locale> <the four keys>` for each, then `npm run copy:build`.
- [ ] **Step 5: Main and test hook.**
  - Main: `let islandAutoHideStyle = normalizeAutoHideStyle(initialPresentationSettings.islandAutoHideStyle)`. The fan-out calls `applyIslandAutoHideStyle(s.islandAutoHideStyle)`.
  - Test hook: `setIslandAutoHideStyle`, and reset `islandAutoHideStyle: 'float'` beside `islandAutoHide: false` at `test-hook.js:3655`.
  - `test/desktop/steps/island-autohide.steps.js` `turnOn(world, layout, style = 'push')` calls `setIslandAutoHideStyle(style)` before turning Auto-hide on, so F1-15…F1-27 keep testing push.
- [ ] **Step 6:** Run `npm run test:unit && npm run settings:check && npm run copy:check && npm run lint`. Expected: PASS.
- [ ] **Step 7:** Commit: "Add the Auto-hide style setting (float or push)".

### Task 2: Pure geometry and policy

**Files:**
- Modify: `src/main/island-autohide.js`, `src/main/chrome-layout.js:52-140`
- Test: `test/unit/island-autohide.test.js`, `test/unit/chrome-layout.test.js` (create the file if none exists)

**Interfaces:**
- Produces, in `island-autohide.js`:
  - `DRAG_BAND_PX = 6`, `FLOAT_SIDE_PX = 20`, `FLOAT_BOTTOM_PX = 24`, `FLOAT_CHROME_PAD_PX = 8`.
  - `floatingLayout({ autoHide, style, glanceOpen }) -> boolean`: true when the page ignores the strip because the Island floats.
  - `floatViewsWanted({ autoHide, style, platform }) -> { pill, controls, menu }` (booleans).
  - `floatViewsShown({ floating, islandVisible, platform }) -> { pill, controls, menu }`.
  - `floatViewBounds(rect, { windowWidth, windowHeight, side, bottom }) -> {x,y,width,height} | null`.
- Produces, in `chrome-layout.js`:
  - `calculateChromeLayout({ …, islandHeight })`. Defaults to `chromeHeight`. `findBounds.y` and `islandBounds.height` use it; `pageBounds` keeps using `chromeHeight`.
  - The result gains `dragBand: { x: railWidth, y: 0, width: pageWidth, height: DRAG_BAND_PX }`.

- [ ] **Step 1: Write the failing tests**

```js
test('floatingLayout', () => {
  assert.equal(floatingLayout({ autoHide: true, style: 'float', glanceOpen: false }), true);
  assert.equal(floatingLayout({ autoHide: true, style: 'float', glanceOpen: true }), false);
  assert.equal(floatingLayout({ autoHide: true, style: 'push', glanceOpen: false }), false);
  assert.equal(floatingLayout({ autoHide: false, style: 'float', glanceOpen: false }), false);
});
test('floatViewsWanted', () => {
  assert.deepEqual(floatViewsWanted({ autoHide: true, style: 'float', platform: 'darwin' }), { pill: true, controls: false, menu: false });
  assert.deepEqual(floatViewsWanted({ autoHide: true, style: 'float', platform: 'win32' }), { pill: true, controls: true, menu: true });
  assert.deepEqual(floatViewsWanted({ autoHide: true, style: 'push', platform: 'linux' }), { pill: false, controls: false, menu: false });
});
test('floatViewsShown: controls stay while hidden; menu and pill follow the Island', () => {
  assert.deepEqual(floatViewsShown({ floating: true, islandVisible: false, platform: 'linux' }), { pill: false, controls: true, menu: false });
  assert.deepEqual(floatViewsShown({ floating: true, islandVisible: true, platform: 'linux' }), { pill: true, controls: true, menu: true });
  assert.deepEqual(floatViewsShown({ floating: false, islandVisible: true, platform: 'linux' }), { pill: false, controls: false, menu: false });
});
test('floatViewBounds wraps the rect with shadow room, from the window top, clamped', () => {
  const rect = { x: 400, y: 12, width: 360, height: 44 };
  assert.deepEqual(floatViewBounds(rect, { windowWidth: 1200, windowHeight: 800, side: 20, bottom: 24 }),
    { x: 380, y: 0, width: 400, height: 80 });
  assert.deepEqual(floatViewBounds({ x: 5, y: 8, width: 34, height: 30 }, { windowWidth: 1200, windowHeight: 800, side: 8, bottom: 8 }),
    { x: 0, y: 0, width: 47, height: 46 });
  assert.equal(floatViewBounds(null, { windowWidth: 1200, windowHeight: 800, side: 20, bottom: 24 }), null);
  assert.equal(floatViewBounds({ x: 0, y: 0, width: 0, height: 44 }, { windowWidth: 1200, windowHeight: 800, side: 20, bottom: 24 }), null);
});
test('page top and Island anchor split', () => {
  const l = calculateChromeLayout({ width: 1200, height: 800, chromeHeight: 0, islandHeight: 68 });
  assert.equal(l.pageBounds.y, 0);
  assert.equal(l.findBounds.y, 68);
  assert.equal(l.islandBounds.height, 68);
  assert.deepEqual(l.dragBand, { x: 0, y: 0, width: 1200, height: 6 });
  const v = calculateChromeLayout({ width: 1200, height: 800, chromeHeight: 0, islandHeight: 68, tabLayout: 'vertical', verticalTabsWidth: 248 });
  assert.equal(v.dragBand.x, 248);
  assert.equal(calculateChromeLayout({ width: 1200, height: 800, chromeHeight: 68 }).findBounds.y, 68); // default unchanged
});
```

- [ ] **Step 2:** Run `node --test test/unit/island-autohide.test.js test/unit/chrome-layout.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** `floatViewBounds` uses `x = max(0, floor(rect.x - side))`, `right = min(windowWidth, ceil(rect.x + rect.width + side))` and `height = min(windowHeight, ceil(rect.y + rect.height + bottom))`. It returns null for a non-finite or zero-width rect. `chrome-layout.js` imports `DRAG_BAND_PX` from `island-autohide.js`.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npm run test:unit`. Expected: PASS.
- [ ] **Step 5:** Commit: "Floating Island: pure layout and view policy".

### Task 3: Layout split, drag band and macOS window buttons

Float mode now keeps the page at `y = 0`. There's no pill yet; Task 5 adds it. Push mode gains the drag band.

**Files:**
- Modify: `src/main/main.js`:
  - `currentChromeLayout` :3210
  - `syncWindowButtons` :3632
  - `syncStripHidden` :3645
  - `applyIslandAutoHideStyle`
  - `getIslandAutoHideState` :12589
- Modify: `src/renderer/index.html` (`#dragBand` as the first child of `#strip`), `src/renderer/renderer.js:1365,1414`, `src/renderer/styles.css:232-236`
- Modify: `spec/acceptance/island-and-commands.feature` (F1-25 text; new F1-28), `spec/acceptance/index.md`, `test/desktop/cucumber.mjs:24`, `test/desktop/steps/island-autohide.steps.js`, `src/main/test-hook.js` (`dragBandAppRegion`)
- Test: `test/unit/island-autohide.test.js` (wiring regexes)

**Interfaces:**
- Consumes: Task 2 `floatingLayout`, `calculateChromeLayout({ islandHeight })`, `layout.dragBand`.
- Produces:
  - `islandFloating(runtime = rt()) -> boolean`, which wraps `floatingLayout` with `glanceOpen: !!runtime.glanceTabId`;
  - `stripCovered(runtime = rt()) -> boolean`, equal to `islandStripHidden(runtime) || islandFloating(runtime)`;
  - test-hook state gains `floating`;
  - test hook `dragBandAppRegion()` returns the computed app-region of `#dragBand`.

- [ ] **Step 1: Write the failing tests**
  - Unit wiring:
    - `currentChromeLayout` passes `chromeHeight: stripCovered() ? 0 : rt().chromeHeight` and `islandHeight: islandStripHidden() ? 0 : rt().chromeHeight`;
    - `syncStripHidden` sends `stripCovered(runtime)`;
    - `syncWindowButtons`' visibility includes `islandFloating(runtime)`.
  - Acceptance F1-28, "The top edge keeps a thin band to drag the window": with Auto-hide on (push, then float), the strip is hidden, `dragBandAppRegion()` is `drag` and `stripAppRegion()` is `no-drag`.
  - Acceptance F1-29, "Float mode keeps the page at the top of the window": style float, the Island auto-hides; point at the top edge; then the state reads `revealed === true`, `pageY === 0` and `activeBounds.y === 0`.
  - Update F1-25's wording to "…only through its thin top band" and assert the same two app-regions.
- [ ] **Step 2:** Run `npm run test:unit` and `npm run test:acceptance:desktop -- --tags "@F1-25 or @F1-28 or @F1-29"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `#dragBand`: `display: none; position: absolute; top: 0; left: 0; right: 0; height: 6px; -webkit-app-region: drag`. Show it with `#strip.strip-hidden #dragBand { display: block }`.
  - In the vertical layout, offset it with `left: var(--vertical-tabs-w)` under the existing `:root[data-tab-layout="vertical"]` scope.
  - `#strip.drag-suspended #dragBand { -webkit-app-region: no-drag }`.
  - Add a dblclick listener on `#dragBand` that calls `maximizeWindow()`.
  - `applyIslandAutoHideStyle` re-lays every runtime, as `applyIslandAutoHide` does, and calls `scheduleMenuRebuild()`.
- [ ] **Step 4:** Rerun the step 2 commands, then run the whole `@island-autohide` tag. Expected: PASS.
- [ ] **Step 5: macOS hand check.**
  - Drag the window by its top 6px in push and float, in the island and vertical layouts.
  - Double-click the band to zoom.
  - In float, the traffic lights stay visible while hidden.
- [ ] **Step 6:** Commit: "Auto-hide: float keeps the page still; a thin top band drags the window".

### Task 4: The float surface document

**Files:**
- Modify: `src/main/chrome-protocol.js` (`CHROME_FLOAT_URL = 'blanc-chrome://float/'`; host `float` with the same asset map as `index`; export it)
- Modify: `src/main/preload.js:14-20` (trust `blanc-chrome://float/`), and add events `onFloatFrame` (`chrome:float-frame`) and `onFloatShown` (`chrome:float-shown`)
- Modify: `browser-api/contract.json` (surface, two events, type `FloatFrame`), then run `npm run browser-api:build`
- Modify: `src/renderer/renderer.js`, `src/renderer/styles.css`
- Test: `test/unit/chrome-protocol.test.js` (or the existing protocol test), `npm run browser-api:check`, new `test/unit/float-surface.test.js`

**Interfaces:**
- Produces:
  - type `FloatFrame = { role: 'pill'|'controls'|'menu', x: number, y: number, width: number, height: number, stageWidth: number }`, where x, y, width and height are the float view's bounds;
  - main → float: `chrome:float-frame` (FloatFrame) and `chrome:float-shown` (boolean);
  - in a float surface `<html>` carries `data-surface="float"`, `data-float-role` and the class `float-shown`;
  - CSS vars `--float-x`, `--float-y`, `--float-height`, `--float-stage-width`.

- [ ] **Step 1: Write the failing tests.**
  - Protocol: `chromeResourcePath('blanc-chrome://float/')` ends in `index.html`, and `…/renderer.js` resolves.
  - `float-surface.test.js` (source regexes, the repo's pattern):
    - `renderer.js` sets `dataset.surface = 'float'` when `location.hostname === 'float'`;
    - it skips `reportChromeLayout` and the `chrome:island-rect` report on that surface;
    - it adds the `float-shown` class only after two `requestAnimationFrame`s;
    - the role element's hidden transform uses `var(--float-height)`, not a percentage;
    - `styles.css` has `html[data-surface="float"]` rules hiding `#verticalTabsRail`, `#glanceDivider` and `#glanceHeader`.
- [ ] **Step 2:** Run `node --test test/unit/float-surface.test.js test/unit/chrome-protocol*.test.js && npm run browser-api:check`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Float surface CSS:
    - `html, body` transparent;
    - `#chrome { position: fixed; left: calc(-1 * var(--float-x)); top: calc(-1 * var(--float-y)); width: var(--float-stage-width) }`;
    - `#strip` transparent and `no-drag`;
    - each role shows only its element (`pill` → `#islandPill`; `controls` → `#windowControls`; `menu` → `#mainMenuButton`), the rest `visibility: hidden`.
  - Pill, controls and menu get `box-shadow: var(--shadow-popover)`. Controls and menu also get a `var(--bg)` backing with `var(--radius)`.
  - The slide uses `transform: translateY(calc(-1 * var(--float-height)))` on the role element, and `translateY(0)` under `.float-shown`. The view starts at the window's top edge, so moving the element up by the whole view height puts the element, its top margin and its shadow fully above the window edge. (`-100%` alone would leave the pill's 12px top margin showing part of it.) The transition is 160ms ease-out in and 200ms out, and `@media (prefers-reduced-motion: reduce)` sets `transition: none`. The controls role is always `float-shown`.
  - `#windowControls`/`#mainMenuButton` `tint-dark` rules don't apply on the float surface.
  - Tooltip anchors stay in the view's own coordinates; main offsets them (Task 5).
- [ ] **Step 4:** Rerun step 2, then `npm run substrate:check && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: "Float surface: the strip renderer as a clipped pill view".

### Task 5: Main wires the floating pill

**Files:**
- Modify: `src/main/main.js`, `src/main/window-runtime-registry.js:180-198` (field `islandFloat: null`, cleared on close)
- Modify: `src/main/test-hook.js` (`floatViewState(role)`: `{ attached, visible, bounds, topmostBelowFill }`, plus `floatWebContents(role)`)
- Modify: `spec/acceptance/island-and-commands.feature`, `spec/acceptance/index.md`, `test/desktop/cucumber.mjs`, `test/desktop/steps/island-autohide.steps.js`
- Test: `test/unit/island-autohide.test.js` (wiring), the acceptance scenarios below

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces, in `main.js`:
  - `ensureIslandFloatView(runtime, role) -> WebContentsView`
  - `destroyIslandFloatViews(runtime)`
  - `syncIslandFloat(runtime = rt())`, called at the end of `resizeActiveView` and from the `chrome:island-rect` handler
  - `restackIslandFloatViews(runtime = rt())`
  - `floatRoleOf(runtime, webContents) -> role | null`
  - `sendStrip(runtime, channel, ...args)`, which sends to `window.webContents` and every live float view
- Runtime record: `islandFloat = { pill?, controls?, menu? }`, each `{ view, shown, hideTimer }`.

- [ ] **Step 1: Write the failing acceptance scenarios** (style float; the `@F1` and `@island-autohide` tags; add the ids to `cucumber.mjs` and `index.md` under D29):
  - **F1-30:** "The revealed Island floats over a page that stays still". Point at the top edge; then:
    - `floatViewState('pill')` is visible;
    - its bounds are within 30px of `islandRect` on each side;
    - `activeBounds.y === 0` throughout (sample during the 160ms slide);
    - before the slide-in starts and after the slide-out, the pill element's `getBoundingClientRect().bottom` plus its shadow blur is ≤ 0 in the float view (nothing peeks below the window edge);
    - after the pointer leaves, the pill hides and its view stays attached.
  - **F1-31:** "Find and the shield menu open under the floating pill". Reveal, then:
    - open find: the overlay's `y` equals the strip height and the page stays at `y = 0`;
    - open the shield popover: it anchors under the shield chip.
  - **F1-32:** "Hover-open works on the floating pill". The same steps as F1-16, with style float.
  - **F1-33:** "Glance uses the push layout in float mode". With Glance open, `pageY > 0` and the pill view is hidden; after closing Glance, `pageY === 0`.
  - **F1-34 (Review Focus 1–3, 5):** "The floating pill keeps up with changes", revealed in float mode:
    - open a tab: the bounds follow the wider `islandRect`;
    - switch tabs: the pill is still `topmostBelowFill`;
    - open `blanc://settings`: the pill is above the sheet;
    - switch the style to push: the float views are gone and `pageY > 0`;
    - open a second window then close it: `windowRuntimes` shows no surface for its float views.
  - **F1-35 (Review Focus 4):** "The floating pill takes the private theme". Make a private tab active; the float pill's `document.documentElement.dataset.theme` is `'private'`.
  - **F1-37:** "Switching to push mid-slide leaves nothing behind". Point at the top edge and, within 80ms, set the style to push. Once `sliding` is false, the float views are gone, `pageY > 0` and the strip is shown; pointing away hides it as push does.
  - **F1-38:** "Turning Auto-hide off while the pill floats". Reveal, turn Auto-hide off. The float views are gone, `pageY` equals the strip height, `stripAppRegion()` is `drag` and the macOS traffic lights are visible.
  - **F1-39:** "Changing the style while Glance is open". In float with Glance open, `pageY > 0`. Set the style to push, then back to float, with Glance still open: `pageY` stays the strip height and no float view is visible. Close Glance: `pageY === 0` (float) and the pill view is hidden.
  - **F1-40:** "Resizing the window while the pill floats". Reveal, then resize the window narrower and wider. After each resize, the pill view's bounds are within 30px of the new `islandRect` on each side and `activeBounds.y === 0`.
  - **F1-41:** "Changing the theme while the pill floats". Reveal, set the theme to dark, then light. Each time, the float pill's appearance attribute (the one `renderer.js` sets from `chrome:theme-appearance`) matches the strip document's.
- [ ] **Step 2:** Run `npm run test:acceptance:desktop -- --tags "@F1-30 or @F1-31 or @F1-32 or @F1-33 or @F1-34 or @F1-35 or @F1-37 or @F1-38 or @F1-39 or @F1-40 or @F1-41"`. Expected: FAIL.
- [ ] **Step 3: View lifecycle.** `ensureIslandFloatView` mirrors `ensureTooltipView` plus:
  - `preload: preload.js` with sandbox and `partition: CHROME_PARTITION`;
  - `setBackgroundColor('#00000000')`;
  - `registerChromeSurface`/`unregisterChromeSurface` on destroy;
  - `lockPrivilegedNavigation(wc, CHROME_FLOAT_URL)`;
  - `installChromeShortcuts(wc, runtime)`;
  - `watchCursorFor(wc, () => view.getBounds(), bindToRuntime)`;
  - `setVisible(false)` then `addChildView`.

  `destroyIslandFloatViews` removes the views and closes their webContents. `syncIslandFloat`:
  - creates or destroys views per `floatViewsWanted({ autoHide: islandAutoHide, style: islandAutoHideStyle, platform: process.platform })`;
  - computes `floatViewsShown({ floating: islandFloating(runtime), islandVisible: !islandStripHidden(runtime), platform })`;
  - gets bounds from `floatViewBounds`: `islandRect` with `FLOAT_SIDE_PX`/`FLOAT_BOTTOM_PX` for the pill; `menuButtonRect`/`windowControlsRect` with `FLOAT_CHROME_PAD_PX` for the others;
  - sends `chrome:float-frame` when the bounds change;
  - shows a view with `setBounds`, `setVisible(true)`, then `chrome:float-shown` true;
  - hides it with `chrome:float-shown` false, then `setVisible(false)` after `SLIDE_OUT_MS + 32` ms (0 under `prefersReducedMotion()`), guarded by the record's `shown`.

  `applyIslandAutoHide` and `applyIslandAutoHideStyle` call it for each runtime. The window `closed` handler calls `destroyIslandFloatViews`.
- [ ] **Step 4: Stacking.** `restackIslandFloatViews` re-adds the live views in the order controls, menu, pill, then the tooltip view if `tooltipViewAttached`. Call it:
  - right after the sheet re-add in `setActiveTab` (:7620) and `setGlanceTab` (:7706);
  - after `showOverlayView(…sheet.view)` (:4785), before `restackPermissionView`;
  - in `attachFillStatusView` before the capsule.
- [ ] **Step 5: Trust and routing.**
  - `isTrustedChromeSender` accepts live float views with `CHROME_FLOAT_URL`.
  - The `chrome:island-rect` and `chrome:layout` handlers return at once for a float sender.
  - `chrome:tooltip-show`/`-hide` accept the strip or a float sender, adding the float view's `x`/`y` to `anchor`.
  - `chrome:open-main-menu` accepts the strip or the `menu` role, offsetting `point` the same way.
  - The strip's `chrome:island-rect` payload gains `menuButtonRect` and `windowControlsRect` (window coordinates; `renderer.js` measures `#mainMenuButton`/`#windowControls` when visible). Main stores them on the runtime under the same names. Add both fields to the `reportIslandRect` parameter in `browser-api/contract.json` and run `npm run browser-api:build`.
  - `ownsBrowserShortcutSurface` returns true for the runtime's own float views.
  - The uBO popup's `outsideContents` includes them.
  - The Escape focus restore at :4519 focuses the pill view when `floatRoleOf` finds a shown pill, otherwise the strip.
- [ ] **Step 6: Broadcasts.** Replace every `runtime.window.webContents.send(` / `rt().window.webContents.send(` with `sendStrip(...)`, except `chrome:strip-hidden`. Unit test: in `main.js`, outside `sendStrip`'s own body, the only `window.webContents.send(` is the `chrome:strip-hidden` one.
- [ ] **Step 7:** Rerun step 2, then the whole `@island-autohide` and `@island-hover` tags, `npm run test:unit` and `npm run lint`. Expected: PASS.
- [ ] **Step 8: macOS hand check.**
  - The pill slides in from above over light, dark and busy pages.
  - The site's nav beside the pill takes clicks.
  - Tooltips appear under the floating pill.
  - Hover-open works.
  - The intro tip shows under the pill.
- [ ] **Step 9:** Record the renderer process count and memory per window, float versus push. Use `app.getAppMetrics()` through the test hook, or Activity Monitor, with one window and three tabs. Keep the numbers for the PR body.
- [ ] **Step 10:** Commit: "Auto-hide: the revealed Island floats over the page".

### Task 6: Windows/Linux controls and menu button

Task 5's machinery already creates the `controls` and `menu` views on non-mac. This task covers their behaviour and tests. On this Mac the acceptance harness can only reach them by faking the platform, and the fake must reach the renderers too. If only main pretends to be Linux, the strip page still draws no window controls and reports no rectangles, and a test could pass with an empty view.

**Files:**
- Modify: `src/main/main.js`:
  - read `BLANC_TEST_PLATFORM` (`'win32'` or `'linux'`) only when `acceptanceTestMode`, into `testPlatform`;
  - `chromePlatform() -> 'darwin'|'win32'|'linux'` returns it or `process.platform`;
  - pass `additionalArguments: ['--blanc-test-platform=<p>']` to the strip window and to every float view, only when it is set;
  - `syncIslandFloat` and `floatViewsWanted`/`floatViewsShown` callers use `chromePlatform()`.
- Modify: `src/main/preload.js`: `platform` is the `--blanc-test-platform=` value from `process.argv` when present, else `process.platform`. Main never passes the argument outside acceptance mode, and a packaged build is never in acceptance mode. Update `browser-api/contract.json` if `browser-api:check` requires it, then run `npm run browser-api:build`.
- Modify: `test/desktop/support/` so a scenario tagged `@test-platform-linux` launches its own app instance with `BLANC_TEST_PLATFORM=linux` (follow how the support code already launches instances with custom env, if it does; otherwise add that option there).
- Modify: `spec/acceptance/island-and-commands.feature`, `index.md`, `cucumber.mjs`, the steps file
- Modify: `src/main/test-hook.js`: `floatControlsState()` returns, from the controls and menu float views:
  - the visible `#windowControls button` count;
  - each button's on-screen rect in window coordinates;
  - whether `#mainMenuButton` is visible and its rect.

- [ ] **Step 1: Write the failing scenario.** F1-36, "Window buttons stay on screen in float mode on Windows and Linux", tagged `@test-platform-linux`. With style float and the Island hidden:
  - the strip's island-rect report includes non-null `windowControlsRect` and `menuButtonRect`;
  - `floatViewState('controls')` is visible, its bounds contain `windowControlsRect`, and `floatControlsState()` reports 3 visible buttons, each inside the window;
  - `floatViewState('menu')` is hidden, and the menu element's `getBoundingClientRect().bottom` plus its shadow is ≤ 0 in its view;
  - after pointing at the top edge, the menu view is visible with a visible `#mainMenuButton` inside the window.

  It then checks the real actions by sending mouse clicks to the float views (`sendInputEvent` at each button's centre, in view coordinates):
  - maximise → `isMaximized()` becomes true; click again → false;
  - minimise → `isMinimized()` becomes true (restore afterwards);
  - the menu button opens the main menu, asserted through the existing main-menu seam used by `platform-main-menu.test.js`.

  Close stays untested: it would end the scenario's app.
- [ ] **Step 2:** Run `npm run test:acceptance:desktop -- --tags @F1-36`. Expected: FAIL.
- [ ] **Step 3:** Implement the platform override above, and fix whatever else the scenario exposes. Keep platform branching inside `floatViewsWanted`/`floatViewsShown` and `chromePlatform()`.
- [ ] **Step 4:** Rerun. Expected: PASS. Then run `npm run test:unit && npm run browser-api:check && npm run lint`.
- [ ] **Step 5:** Commit: "Float mode keeps Windows and Linux window buttons on screen".

### Task 7: Linux drawing check and docs

**Files:**
- Modify: `test/desktop/tab-view-drawing-driver.cjs` and `test/desktop/tab-view-drawing-smoke.mjs` (`EXPECTED_PATHS` 15 → 18). The three new paths are:
  - the float pill draws after a tab switch;
  - after Move Tab to New Window, in the new window;
  - after a space is opened in another window.
- Modify: `spec/divergence-register.md` D29; `docs/superpowers/specs/2026-10-19-auto-hide-island-design.md` (Known limits: point at the new spec; the drag band replaces the no-drag-region limit); `CLAUDE.md` and `AGENTS.md` (Architecture: the strip document plus float views, the stacking list, the drag band); `spec/parity-matrix.md` if it lists F1 rows.

- [ ] **Step 1:** Add the three driver paths following the existing ones. Run `npm run test:tab-view-drawing:desktop` on macOS. Expected: PASS (Linux runs in CI under xvfb and at the hand-off).
- [ ] **Step 2:** Update the docs. D29 says:
  - float is the default;
  - push is the choice;
  - window buttons stay visible in float (macOS traffic lights; Windows/Linux controls), and the menu button comes with the pill;
  - the 6px drag band.

  The parity contract is unchanged.
- [ ] **Step 3:** Run `npm run test:unit && npm run substrate:check && npm run lint && npm run test:acceptance:dry`. Expected: PASS.
- [ ] **Step 4:** Commit: "Docs: floating Island in D29, CLAUDE.md and the auto-hide spec".

### Task 8: PR and Windows/Linux hand-off (stop here)

- [ ] **Step 1:** Push the branch and open a PR. The body holds:
  - the summary;
  - the spike results;
  - the Task 5 process/memory numbers, float versus push;
  - the macOS hand checks done;
  - a **Hand-off** section with the numbered steps below.
- [ ] **Step 2: Hand-off steps for the owner's Parallels Mac.** Each step names its expected result. Build with `npm start` from the PR branch inside each VM.
  - Windows 11:
    1. Auto-hide on, float. Drag the window by its top 6px. Double-click it.
    2. The controls cluster stays top-right while the Island is hidden, and minimise, maximise and close all work.
    3. The pill and menu button slide in from the top edge. The site's nav beside them takes clicks.
    4. Switch tabs 5 times while revealed. The pill keeps drawing.
    5. Find, the shield and ⌘L (Ctrl+L) open under the pill.
  - Ubuntu X11: steps 1–5.
  - Ubuntu native Wayland: steps 1–5, plus the top edge still reveals the pill with the band taking the top 6px.
  - Record the renderer process count and memory per window on each.
- [ ] **Step 3:** Bind the PR (`ccd_pr` tools), read CI, and stop. Report to the owner:
  - the PR link;
  - that work waits for the hand-off results;
  - the merge rule: a drag-band failure alone may take the approved no-band fallback (band off on that platform, recorded in D29 and Known limits); any other failure is fixed before merge.
