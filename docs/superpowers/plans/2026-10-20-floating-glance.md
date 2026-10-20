# Floating Glance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Glance stops splitting the window and becomes a large, centered, movable and resizable card floating over a page that stays usable, drawn like a Split View pane.

**Architecture:** A new pure module, `src/main/glance-card.js`, owns the card's geometry: the default frame, clamping, moves, resizes and the remembered fractions. It replaces `glance-layout.js`. The card's chrome (border, shadow, 8 px resize ring, header) is the strip document run again on a new `blanc-chrome://glance/` surface, the way the floating Island runs it on `blanc-chrome://float/`. Main places that view just above the main tab and the Glance tab's own view inside it, below the header. Behavior rules (tab switch closes, Open as tab, Escape, Keep as split) change in `main.js`. The remembered frame is a device-local setting with its own setter.

**Tech Stack:** Electron 44 (`WebContentsView`, `setBorderRadius`), plain JS and CSS, `node --test`, Cucumber + Playwright-Electron acceptance.

**Spec:** `docs/superpowers/specs/2026-10-20-floating-glance-design.md` (approved October 20, 2026). Read it before each task; this plan doesn't repeat its reasons.

## Global Constraints

- Electron only. No new extension or fork work.
- Every Blanc-authored string lives in `copy/messages/en.json`. A PR that changes English updates de, es, fr, pt-BR and it in the same PR, and advances hashes only with `npm run copy:ack -- <locale> <keys>`, then runs `npm run copy:build`.
- Change `src/main/preload.js` and `browser-api/contract.json` together, then run `npm run browser-api:build` and commit the regenerated `browser-api/generated/vectors.json`.
- After editing a boundary file (`main.js`, `preload.js`, `chrome-protocol.js` and the rest listed in `security/audit-surface-inventory.json`), run `npm run audit-inventory:write`.
- Use CSS classes and custom properties, not inline geometry styles (owner rule). Geometry rides `--glance-card-*` custom properties, like `--split-x/y/w/h`.
- The remembered frame is device-local: never in `SYNCED_KEYS`, listed in `settings-schema/schema.json` `internalDefaults`, written only by `settings.setGlanceFrame()`.
- Linux: the card view stays window-owned for life and hides with `setVisible(false)`. Never remove and re-add it.
- The website, `docs/marketing-claims.md` and the claims ledgers stay as they are. They change in a website-only PR after the release that ships this.
- Values the spec pins:
  - default width `min(1100, 0.8 × page area width)`;
  - default top 16 px below the Island's resting band, bottom 32 px above the window's bottom edge;
  - minimum card 360 × 280;
  - at least 48 px of the header on screen;
  - resize ring 8 px;
  - a window smaller than the minimum gets the page area less an 8 px margin;
  - keyboard steps 16 px and, with Shift, 64 px;
  - motion: scale from 0.96, opacity 140 ms, 340 ms `cubic-bezier(.2,.9,.25,1)`; Reduce Motion is a 140 ms fade.
- **Page area:** `{ x: railWidth, y: rt().chromeHeight, width: pageWidth, height: windowHeight - rt().chromeHeight }`. It sits below the Island's *resting* band whatever the Auto-hide state, and it's what the remembered fractions are measured against.
- Stacking: main tab < Glance card view < Glance tab view < utility sheet < Island float views < fill capsule < overlay < permission view < tooltip and uBO popup.

## Review Focus

1. **A remembered frame from a much larger window or display.** Opening on a small window must clamp inside the page area, not leave the header off screen. The test goes in Task 1 (`clampCardFrame` with fractions from a 2560-wide window applied to 900 × 600).
2. **A corrupt or hand-edited `glanceFrame` in settings.json** (NaN, negative, fractions above 1, a string). Blanc must fall back to the default frame, not throw at launch. The test goes in Task 2.
3. **Dragging the header past the window edge, or resizing below the minimum mid-drag.** The card must stop at the clamp and keep tracking the pointer, without jumping when the pointer comes back. Tests go in Task 1 (`moveCardFrame`/`resizeCardFrame` with overshooting deltas).
4. **Closing a Glance mid-drag** (⌘⇧G, a tab switch or a closed tab while the pointer is down). No later move or resize may reattach or reposition anything. A test goes in Task 4: a `moveGlanceCard` call after `closeGlance` returns `null` and changes no setting.
5. **A Glance open when the window goes fullscreen or is maximized.** The card rescales from its fractions and keeps its header on screen. An acceptance scenario goes in Task 3.

---

### Task 1: Card geometry module

**Files:**
- Create: `src/main/glance-card.js` (pure; no `require('electron')`)
- Test: `test/unit/glance-card.test.js`

**Interfaces:**
- Produces:
  - Constants: `CARD_MAX_DEFAULT_WIDTH = 1100`, `CARD_DEFAULT_WIDTH_SHARE = 0.8`, `CARD_TOP_GAP = 16`, `CARD_BOTTOM_GAP = 32`, `CARD_MIN_WIDTH = 360`, `CARD_MIN_HEIGHT = 280`, `CARD_HEADER_VISIBLE = 48`, `CARD_RING = 8`, `CARD_HEADER_HEIGHT = 40`, `CARD_TINY_MARGIN = 8`, `CARD_KEY_STEP = 16`, `CARD_KEY_STEP_LARGE = 64`.
  - `defaultCardFrame(pageArea) -> Rect`, centered horizontally.
  - `clampCardFrame(frame, pageArea) -> Rect`
  - `frameToFractions(frame, pageArea) -> {x, y, width, height}`, each in 0..1.
  - `fractionsToFrame(fractions, pageArea) -> Rect`, clamped; `null` input gives the default frame.
  - `moveCardFrame(frame, dx, dy, pageArea) -> Rect`
  - `resizeCardFrame(frame, edge, dx, dy, pageArea) -> Rect`, where `edge` is one of `'n','s','e','w','ne','nw','se','sw'`.
  - `cardGeometry(frame) -> { chrome: Rect, header: Rect, page: Rect }`. `chrome` is the frame grown by `CARD_RING` on every side; `header` is the frame's top `CARD_HEADER_HEIGHT` px; `page` is the rest, inset by the 1 px border.
  - `Rect` is `{x, y, width, height}` in window coordinates, integers.

- [ ] **Step 1: Write the failing tests** in `test/unit/glance-card.test.js`:
  - `defaultCardFrame({x:0,y:68,width:1600,height:932})` → `{x:250, y:84, width:1100, height:884}`.
  - With `pageArea.width` 1000, the default width is 800.
  - `clampCardFrame` of a 200 × 100 frame → width 360, height 280.
  - With a page area of 300 × 200, the frame equals the page area inset by 8 on every side.
  - A frame dragged so only 10 px of its header is visible is pulled back until 48 px show.
  - `fractionsToFrame(frameToFractions(f, big), small)`, with `big` 2560 × 1400 and `small` 900 × 600, lies inside `small` with its header fully on screen (Review Focus 1).
  - `moveCardFrame` by `dx: +5000` stops at the clamp; moving back by `-5000` returns to the left clamp with no extra offset (Review Focus 3).
  - `resizeCardFrame(f, 'nw', +1000, +1000, area)` stops at 360 × 280 and keeps the `se` corner fixed.
  - `cardGeometry`: `chrome.x === frame.x - 8`, `header.height === 40`, `page.y === frame.y + 40`.
- [ ] **Step 2: Run them and confirm they fail.** Run `node --test test/unit/glance-card.test.js`. Expected: FAIL, "Cannot find module".
- [ ] **Step 3: Implement the functions** in `src/main/glance-card.js` with the signatures above. Round to integers last.
- [ ] **Step 4: Run them and confirm they pass.** Run `node --test test/unit/glance-card.test.js`. Expected: all PASS.
- [ ] **Step 5: Commit.** `git commit -m "Glance: pure geometry for the floating card"`

### Task 2: Remembered frame setting

**Files:**
- Modify: `src/main/settings.js` (defaults beside `islandAutoHideStyle`, sanitize in the load path near line 489, new setter beside `setUiLanguage`)
- Modify: `settings-schema/schema.json` (add `glanceFrame` to `internalDefaults`), then `npm run settings:build`
- Test: `test/unit/glance-frame-settings.test.js`

**Interfaces:**
- Produces:
  - `settings.setGlanceFrame(fractions | null) -> boolean`. It writes only a valid `{x, y, width, height}` with every value finite and in 0..1, and `null` clears it.
  - `settings.getSettings().glanceFrame`: a frame like that, or `null`.

- [ ] **Step 1: Write the failing tests.**
  - The default `glanceFrame` is `null`.
  - `setGlanceFrame({x:.1,y:.05,width:.7,height:.9})` round-trips.
  - `setGlanceFrame({x:NaN,...})`, `{x:-1,...}`, `{width:2,...}` and `'big'` return `false` and leave the value unchanged.
  - A settings.json whose `glanceFrame` is `{x:'a'}` loads as `null` (Review Focus 2).
  - `setSettings({glanceFrame:{...}})` ignores the key (only the dedicated setter writes it).
  - `glanceFrame` is not in `SYNCED_KEYS`.
- [ ] **Step 2: Run them and confirm they fail.** `node --test test/unit/glance-frame-settings.test.js`
- [ ] **Step 3: Implement** the default, the load sanitizer and `setGlanceFrame`. Export it.
- [ ] **Step 4: Run the tests and the schema check.** Run `node --test test/unit/glance-frame-settings.test.js && npm run substrate:check`. Expected: PASS, then `substrate:check OK`.
- [ ] **Step 5: Commit.** `git commit -m "Glance: device-local remembered card frame"`

### Task 3: The card surface and its placement

**Files:**
- Modify: `src/main/chrome-protocol.js` (add `CHROME_GLANCE_URL = blanc-chrome://glance/`, allowlist `['glance', STRIP_ASSETS]`, export it)
- Modify: `src/renderer/renderer.js`:
  - `const glanceSurface = window.location.hostname === 'glance'`, setting `document.documentElement.dataset.surface = 'glance'`;
  - on that surface, `#glanceHeader` renders from the same `chrome:glance-layout` payload, and its existing controls and right-click tab menu keep working there;
  - every reported geometry stays strip-only, as for `floatSurface`.
- Modify: `src/renderer/styles.css`:
  - `html[data-surface="glance"]`: transparent body;
  - only `#glanceCard`, a new wrapper holding `#glanceHeader`, is visible;
  - `#glanceCard` has a 1 px `--split-tab-border` border, the pane radius and a shadow kept within `CARD_RING`;
  - it is darker while `.focused`;
  - geometry rides `--glance-card-x/y/w/h`.
- Modify: `src/renderer/index.html` (wrap `#glanceHeader` in `<div id="glanceCard" class="glance-card" hidden>`)
- Modify: `src/main/main.js`:
  - per-runtime `glanceCardView` (create, `lockPrivilegedNavigation`, load `CHROME_GLANCE_URL`, window-owned, `setVisible`);
  - `glanceCardFrame(runtime)` reads `settings.getSettings().glanceFrame` through `fractionsToFrame`;
  - `resizeActiveView()` places the card view at `cardGeometry(frame).chrome` and the Glance tab at `.page`, with `setBorderRadius(PANE_RADIUS - PANE_BORDER)`, while the main tab keeps the full page bounds;
  - `restackAboveTabViews()` puts the card view directly above the main tab and below the Glance tab;
  - `glanceLayoutPayload` (in `glance-focus.js`) carries `{ card: cardGeometry(frame), focusedPane }`;
  - `chrome:glance-layout` goes through `stripSurfaces` and the card view.
- Test:
  - `test/unit/glance-card-surface.test.js`: source tests for the protocol allowlist, the stacking order, the window-owned lifecycle and the payload shape;
  - acceptance: new scenarios in `spec/acceptance/glance.feature` (see Step 1).

**Interfaces:**
- Consumes: `cardGeometry`, `fractionsToFrame`, `defaultCardFrame` (Task 1); `settings.getSettings().glanceFrame` (Task 2).
- Produces:
  - `glanceCardFrame(runtime) -> Rect`;
  - `glanceCardGeometry(runtime) -> {chrome, header, page} | null`, which replaces `glanceGeometry()`;
  - payload field `GlanceLayout.card`;
  - test-hook `getGlanceCard() -> { frame, chrome, page, viewBounds, cardViewBounds, stackIndex }`.

- [ ] **Step 1: Write the failing tests.**
  - The unit source tests above.
  - Acceptance `@F34-2` "A Glance opens as a centered card over the page": the main tab's bounds equal the page bounds, and the Glance tab's bounds equal `getGlanceCard().page`, at 1100 × (window − 68 − 16 − 32) in a 1600-wide window.
  - Acceptance `@F34-3` "The card keeps its header on screen when the window is maximized and restored" (Review Focus 5).
- [ ] **Step 2: Run them and confirm they fail.** Run `node --test test/unit/glance-card-surface.test.js`, then `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags "@F34-2 or @F34-3"`.
- [ ] **Step 3: Implement** the surface, the view lifecycle, placement, stacking and payload. Add `@F34-2` and `@F34-3` to `RUNNABLE` in `test/desktop/cucumber.mjs` and the rows to `spec/acceptance/index.md`.
- [ ] **Step 4: Run them and confirm they pass,** plus `npm run browser-api:check` (update the `GlanceLayout` type first and run `npm run browser-api:build`). Run `npm run audit-inventory:write`.
- [ ] **Step 5: Commit.** `git commit -m "Glance: draw the card on its own chrome surface over the page"`

### Task 4: Move, resize and reset by pointer

**Files:**
- Modify: `src/renderer/renderer.js` (header drag and ring-edge drags on the glance surface: pointer capture, deltas throttled with rAF; double-click on the header's empty area resets)
- Modify: `src/renderer/styles.css` (ring hit areas: edges 8 px wide, corners 16 × 16 px, resize cursors)
- Modify: `src/main/preload.js`, `browser-api/contract.json` (remove `resizeGlance`, `resetGlance`; add the three members below)
- Modify: `src/main/main.js` (handlers; remove `resizeGlanceAt`, `resetGlanceRatio` and `runtime.glanceRatio`)
- Test: `test/unit/glance-card-pointer.test.js` (main handlers through the test hook or extracted helpers); acceptance `@F34-4` and `@F34-5`

**Interfaces:**
- Consumes: `moveCardFrame`, `resizeCardFrame`, `defaultCardFrame`, `frameToFractions` (Task 1); `setGlanceFrame` (Task 2); `glanceCardFrame` (Task 3).
- Produces, as bridge members, IPC channels and main handlers:
  - `moveGlanceCard({dx, dy})`, `chrome:glance-card-move`, returns `Rect | null`;
  - `resizeGlanceCard({edge, dx, dy})`, `chrome:glance-card-resize`, returns `Rect | null`;
  - `resetGlanceCard()`, `chrome:glance-card-reset`, returns `Rect | null`.
  - Each returns `null` with no Glance open. Each saves through `setGlanceFrame(frameToFractions(...))`, debounced 250 ms; reset saves `null`.

- [ ] **Step 1: Write the failing tests.**
  - Unit: a move after `closeGlance` returns `null` and leaves `glanceFrame` unchanged (Review Focus 4).
  - Unit: a resize below the minimum returns the clamped frame.
  - Unit: reset sets `glanceFrame` to `null`.
  - Acceptance `@F34-4` "Dragging the header moves the card and the next Glance opens there": drag +200, +100; close; reopen; the frame matches.
  - Acceptance `@F34-5` "Dragging an edge resizes the card and double-clicking the header resets it".
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** the handlers, the bridge, the contract and the renderer pointer code. Run `npm run browser-api:build`.
- [ ] **Step 4: Run the new tests and `npm run browser-api:check`; confirm they pass.**
- [ ] **Step 5: Commit.** `git commit -m "Glance: move, resize and reset the card"`

### Task 5: The new Glance rules

**Files:**
- Modify: `src/main/main.js`:
  - `setActiveTab` (~8440–8500): any activation of a tab other than the active one, including the Glance tab, closes the Glance first; delete the `promotingGlance` swap;
  - `promoteGlance` becomes `openGlanceAsTab()`: close the Glance, then `setActiveTab(glanceId, {focusContent: true})`;
  - `keepGlanceAsSplit` (4443): `widths: [0.5, 0.5]`, main page first;
  - the card view's `before-input-event`: Escape (no modifiers) calls `closeGlance()`; the Glance *page's* own input never does;
  - `closeGlance`: the card stops taking input at once. Electron views can't pass clicks through, so: detach the Glance tab's view immediately, send `chrome:glance-closing` (the card surface sets `inert` on `#glanceCard` and plays its exit, Task 7), and hide the card view with `setVisible(false)` after 340 ms. If a Glance opens again within those 340 ms, cancel the pending hide.
- Modify: `src/main/island-autohide.js` (drop `glanceOpen` from `islandPinned` and `floatingLayout`) and its callers at `main.js` ~3417 and ~3439
- Modify: `src/main/preload.js`, `browser-api/contract.json` (rename `promoteGlance` to `openGlanceAsTab`, channel `tabs:open-glance-as-tab`)
- Test:
  - `test/unit/island-autohide.test.js`: update the `floatingLayout` and `islandPinned` expectations;
  - `test/unit/glance-rules.test.js`: source tests for the swap's removal, the Escape listener only on the card view, and Keep as split at 50/50;
  - acceptance `@F34-6` through `@F34-10`, plus updates to `@F1-33`, `@F1-39`, `@F53-4` and `@F53-5`.

**Interfaces:**
- Consumes: the card view (Task 3).
- Produces: `openGlanceAsTab() -> boolean`, which replaces `promoteGlance`.

- [ ] **Step 1: Write the failing tests.** Acceptance scenarios:
  - `@F34-6` "Switching to another tab closes the Glance, and switching back doesn't bring it back";
  - `@F34-7` "Choosing the Glance tab from the Island dots opens it as the tab";
  - `@F34-8` "Open as tab makes the Glance page the current tab and keeps the old page open";
  - `@F34-9` "Escape on the card's header closes it; Escape inside the Glance page goes to the page": a fixture page counts its keydown Escapes, and the count goes up with the Glance still open;
  - `@F34-10` "Clicking and scrolling the page behind keeps the Glance open";
  - `@F34-15` "Closing the main page while a Glance is open makes the Glance page the current tab".

  Rewrite `@F1-33` as "A Glance floats over the page in float mode" and `@F1-39` to match. Update `@F53-4` and `@F53-5` (Keep as split) to expect 50/50, main page left.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement the rules.**
- [ ] **Step 4: Run them, `node --test test/unit/island-autohide.test.js test/unit/glance-rules.test.js` and `npm run browser-api:check`; confirm they pass.**
- [ ] **Step 5: Commit.** `git commit -m "Glance: tab switch closes it; Open as tab; Escape from the card"`

### Task 6: Header compaction, keyboard move/resize and strings

**Files:**
- Modify: `src/renderer/index.html` (`#glanceHeader`:
  - replace Make main with `#glanceOpenAsTab`;
  - add `#glanceMove`, a `role="button"` drag area with `aria-label` from `glance.move` and `aria-describedby` hint text, before ×;
  - make Change, Open as tab and Keep as split carry an icon plus a label span)
- Modify: `src/renderer/renderer.js`:
  - `fitGlanceHeader()` applies classes `compact-actions`, then `no-eyebrow`, then `no-host` in that order, measuring as today;
  - on `#glanceMove`: Arrow keys call `moveGlanceCard` with ±16 px (Shift ±64 px); Option/Alt+Arrow call `resizeGlanceCard({edge:'se', …})`; Enter calls `resetGlanceCard`;
  - announcements go to `#glanceStatus`, throttled to one per 500 ms of key repeat.
- Modify: `src/renderer/styles.css` (the three compaction classes; Back, Reload, × and the private chip never hide)
- Modify: `copy/messages/en.json` and the five translations, then `npm run copy:build`:
  - add `glance.openAsTab` "Open as tab", `glance.openAsTab.title` "Open this page as a tab", `glance.move` "Move or resize Glance", `glance.move.hint` "Arrow keys move it. Option or Alt with an arrow key resizes it. Enter resets it.", `glance.status.moved` "Glance moved", `glance.status.resized` "Glance resized to {width} by {height}", `glance.status.reset` "Glance reset", `glance.status.openedAsTab` "{title} is now the current tab";
  - remove `glance.promote`, `glance.promoteShort`, `glance.resize`, `glance.dividerValue`, `glance.status.promoted`;
  - rewrite `slash.glance.hint` to "Look at another open tab without leaving this page".
- Test: `test/unit/glance-header.test.js` (compaction order classes; `#glanceMove` keys map to the right calls; no `innerHTML`); `npm run copy:check`; acceptance `@F34-11` and `@F34-12`.

**Interfaces:**
- Consumes: `moveGlanceCard`, `resizeGlanceCard`, `resetGlanceCard` (Task 4); `openGlanceAsTab` (Task 5).

- [ ] **Step 1: Write the failing tests.**
  - Unit: the tests above.
  - Acceptance `@F34-11` "At 360 px the header keeps Back, Reload, the three actions as icons and ×".
  - Acceptance `@F34-12` "Arrow keys on Move or resize move the card 16 px and announce it".
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** the markup, the compaction, the keyboard handling, the strings and the translations. Translations get real text in each language, then `npm run copy:ack -- <locale> <keys>`.
- [ ] **Step 4: Run them, plus `npm run copy:check` and `npm run test:i18n:desktop`; confirm they pass.**
- [ ] **Step 5: Commit.** `git commit -m "Glance: compact header, keyboard move and resize, new strings"`

### Task 7: Anchors and motion

**Files:**
- Modify: `src/main/main.js` `paneBounds` (~4598) and `overlayBounds` (~4611):
  - the Glance tab's pane is `glanceCardGeometry().page`;
  - find and the fill capsule for the Glance page anchor to it;
  - the Change picker hangs from the card header's Change control (purpose `change`; `change-stacked` goes away);
  - the permission view is unchanged.
- Modify: `src/renderer/styles.css` (card enter and exit on the glance surface with `@starting-style`: scale .96→1, opacity 140 ms, 340 ms `cubic-bezier(.2,.9,.25,1)`; under `prefers-reduced-motion`, a 140 ms fade), and `renderer.js` (the closing class from Task 5 plays the exit)
- Test: acceptance `@F34-13` "Find for the Glance page sits over the card" and `@F34-14` "The card scales in, and under Reduce Motion only fades", through the existing `glanceHeaderMotion` test hook, renamed `glanceCardMotion`.

- [ ] **Step 1: Write the failing scenarios.**
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** the anchors and the motion.
- [ ] **Step 4: Run them and confirm they pass.**
- [ ] **Step 5: Commit.** `git commit -m "Glance: anchor find and fill to the card; card motion"`

### Task 8: Remove the side-by-side Glance and update the specs

**Files:**
- Delete: `src/main/glance-layout.js`, `test/unit/glance-layout.test.js`
- Modify:
  - `src/renderer/index.html` and `renderer.js` (remove `#glanceDivider` and its pointer and keyboard code, and the stacked layout);
  - `styles.css` (remove the divider and stacked rules);
  - `test/desktop/steps/glance.steps.js`;
  - `spec/acceptance/glance.feature`: delete or rewrite every scenario about side by side, stacked, the divider or Make main (today all of them share `@F34-1`; surviving ones keep it, and the new ones are `@F34-2` to `@F34-15`);
  - `test/desktop/cucumber.mjs` and `spec/acceptance/index.md`.
- Modify docs:
  - `spec/features.md` F34: describe the floating card;
  - `spec/parity-matrix.md`;
  - `docs/superpowers/specs/2026-10-19-split-view-design.md` line 21: Keep as split now opens at 50/50, main page left;
  - `CLAUDE.md`: Floating Island ("Glance lays out as push" goes away) and Split View (the reference header);
  - `AGENTS.md`, if it mirrors those lines.
- Run `npm run audit-inventory:write`.

- [ ] **Step 1: Run** `grep -rn "glance-layout\|glanceRatio\|glanceDivider\|promoteGlance\|change-stacked" src test spec browser-api`. Expected: no hits outside the files listed above.
- [ ] **Step 2: Remove and rewrite** as listed.
- [ ] **Step 3: Run the full checks:** `npm run lint`, `npm run test:unit`, `npm run substrate:check`, `npm run browser-api:check`, `npm run copy:check` and `npm run test:acceptance:dry`, then `npm run test:acceptance:desktop -- --tags "@F34 or @F53 or @island-autohide"`. Expected: all pass, with no undefined steps.
- [ ] **Step 4: Check by hand** in the dev app on macOS (relaunch `npm start`; chrome CSS loads only at launch): open a Glance on YouTube, move it, resize it, reload the app and reopen it, Escape on the header, Escape in a YouTube search field, switch tabs.
- [ ] **Step 5: Commit.** `git commit -m "Glance: remove the side-by-side layout; update F34 and the docs"`

## Release follow-ups (not in this branch)

- Windows and Linux VM hand checks before the release that ships it: drag, resize, the ring's clicks, and Linux redraw after a resize.
- After release, a website-only PR updates `site/src/pages/features/glance.astro`, the guide, `GlanceDemo`, `GlanceIsland`, the homepage and Arc comparison lines, `docs/marketing-claims.md` and the claims ledgers and their tests.
