# Start Page widgets port (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Electron build's Start Page becomes the fork's: Billboard as the only layout, optional widget cards placed and sized by hand, a 1–12 shortcut count, image-aware ink, glass cards and the redesigned Customize.

**Architecture:** A pure rules module (`src/main/start-widgets.js`) validates and migrates a device-local `newtabWidgets` setting; four `pages:start:*` channels write it and the existing Start Page status push carries it to every open page. The page code is the fork's `newtab.js`/`newtab.html` edits, ported onto Electron's page with the fork-only plumbing removed, plus the fork's ink sampler in a new flat file and its Start Page CSS moved into `pages.css`.

**Tech Stack:** Electron main (CommonJS), sandboxed page JS, `node --test`, Cucumber + Playwright-Electron acceptance.

**Spec:** `docs/superpowers/specs/2026-11-18-start-page-widgets-and-island-backdrop-port-design.md` (PR 2, the band, gets its own plan once this merges).

**Fork reference:** every "fork" path below is read with `git show origin/chromium/next:<path>`. Main sources: `chromium/blanc/island/pages/newtab.js`, `newtab.html`, `newtab-adapter.js`, `newtab-prototype.css`, `strings.js`; widget rules in `chromium/blanc/browser/ui/blanc_prototype_ui.cc` (the `widgets*` handlers, about :4924–5045); tests `chromium/tests/native-start-widgets.mjs`, `native-start-devices.mjs`, `chromium/tools/start-plates.test.mjs`, `chromium/tests/lib/start-widgets.mjs`, `chromium/tests/fork-steps/divergences.mjs` (V24/V26 entries).

## Global Constraints

- `newtabLayout` stays stored, synced (`SYNCED_KEYS`) and validated exactly as today; only migration reads it.
- `newtabWidgets` is device-local: never in `SYNCED_KEYS`, written only by `settings.setNewtabWidgets()`, never through `pages:settings:set`.
- Widget names: `favorites`, `devices` (switchable); placeable cards: `favorites`, `devices`, `sent`. Sizes: 240, 360, 480, 600, 720. Shortcut count 1–12, default 6. Default place `{left:['favorites','devices'], right:['sent']}`.
- Migration: ledger → favorites + devices; tally → favorites; shelf → favorites + shortcutCount 12; anything else → none.
- Every new `pages:start:*` channel is allowed for the `newtab` host only, and `tab-preload.js`, `pages.js` and `browser-api/bridges.json` change together (`npm run browser-api:build`).
- English strings use the fork's keys (`start.*`); de, es, fr, it, pt-BR come from the fork's `strings.js` in the same PR (`npm run copy:ack`, `npm run copy:build`). Never `innerHTML` a message.
- Pages are flat files in `src/renderer/pages/`. No remote resources.
- Out of scope (delete, don't port): V25 Mahjong pill, extension panels, importer hooks, pin-icon/top-sites epochs, group-failure UI, `blancStartDataReady`, store-theme wallpaper, preview notice. Patron pill stays.
- Window-opening runs (acceptance, `test:*:desktop`) run on the Mac Studio, never on the MacBook Pro. Unit, lint and substrate checks run locally.
- Commit messages name no AI model and carry no Co-Authored-By trailer.

## Review Focus

1. A profile whose `settings.json` holds a hand-edited or older `newtabWidgets` (wrong types, `chart`, `panels`, duplicates, size 999) must load with that junk dropped, not crash or reset other settings. Pinned in Task 1.
2. Two Start Pages open in two windows: a change in one (switch, drag, size, count) shows in the other without reload. Pinned in Task 5's acceptance scenario.
3. A private Start Page: widgets follow the same device choice, but Other devices and Sent show nothing private-unsafe and the blocked line says it counts nothing (as today). Pinned in Task 5.
4. A failed save (main rejects a value) leaves the page showing the stored choice and "Could not confirm the widget change. Try again." Pinned in Task 5.
5. A window between 1000 and 1199 px wide and one at 1200 with both columns filled: no shortcut tile under a card, nothing under the footer. Pinned in Task 5.

---

### Task 1: Widget rules module

**Files:**
- Create: `src/main/start-widgets.js`
- Test: `test/unit/start-widgets.test.js`

**Interfaces:**
- Produces (all pure, no `require('electron')`, all return new frozen-free plain objects):
  - `WIDGET_NAMES = ['favorites','devices']`, `CARD_NAMES = ['favorites','devices','sent']`, `CARD_SIZES = [240,360,480,600,720]`
  - `defaultWidgets() -> Widgets` where `Widgets = {v:1, favorites, devices, shortcutCount, place:{left,right}, sizes}`
  - `normalizeWidgets(raw: unknown) -> Widgets`
  - `migrateFromLayout(layout: string) -> Widgets`
  - `withWidget(w, name, on) -> Widgets | null` (null when `name` is not a widget name or `on` is not boolean)
  - `withShortcutCount(w, n) -> Widgets | null` (null outside integers 1–12)
  - `withPlace(w, left: string[], right: string[]) -> Widgets | null` (null when either is not an array)
  - `withSize(w, card, size) -> Widgets | null` (size 0 removes; null for other cards or sizes)
  - `pageWidgets(w) -> {favorites, devices, shortcutCount, place, sizes}` (what the page receives; no `v`)

- [ ] **Step 1: Write the failing tests** (`node:test`, `assert/strict`), including:

```js
test('defaults', () => assert.deepEqual(defaultWidgets(), {v:1, favorites:false, devices:false, shortcutCount:6, place:{left:['favorites','devices'], right:['sent']}, sizes:{}}));
test('migration map', () => {
  assert.deepEqual(pick(migrateFromLayout('ledger')), {favorites:true, devices:true, shortcutCount:6});
  assert.deepEqual(pick(migrateFromLayout('tally')), {favorites:true, devices:false, shortcutCount:6});
  assert.deepEqual(pick(migrateFromLayout('shelf')), {favorites:true, devices:false, shortcutCount:12});
  for (const l of ['billboard', 'mahjong', '', undefined]) assert.deepEqual(migrateFromLayout(l), defaultWidgets());
});
test('normalize drops junk', () => {
  const w = normalizeWidgets({favorites:'yes', devices:true, chart:true, panels:['x'], shortcutCount:13,
    place:{left:['sent','sent','chart'], right:['favorites']}, sizes:{favorites:999, devices:360, sent:240}});
  assert.equal(w.favorites, false); assert.equal(w.devices, true); assert.equal(w.shortcutCount, 6);
  assert.deepEqual(w.place, {left:['sent','devices'], right:['favorites']}); // missing devices back to its default side
  assert.deepEqual(w.sizes, {devices:360});
  assert.equal('chart' in w || 'panels' in w, false);
});
test('normalize survives non-objects', () => { for (const raw of [null, 7, 'x', []]) assert.deepEqual(normalizeWidgets(raw), defaultWidgets()); });
test('setters', () => {
  const d = defaultWidgets();
  assert.equal(withWidget(d, 'favorites', true).favorites, true);
  assert.equal(withWidget(d, 'chart', true), null);
  assert.equal(withShortcutCount(d, 12).shortcutCount, 12);
  assert.equal(withShortcutCount(d, 0), null); assert.equal(withShortcutCount(d, 2.5), null);
  assert.deepEqual(withPlace(d, ['sent'], ['favorites','devices']).place, {left:['sent'], right:['favorites','devices']});
  assert.deepEqual(withSize(withSize(d, 'devices', 480), 'devices', 0).sizes, {});
  assert.equal(withSize(d, 'sent', 240), null); assert.equal(withSize(d, 'favorites', 300), null);
});
test('pageWidgets hides v', () => assert.equal('v' in pageWidgets(defaultWidgets()), false));
```

- [ ] **Step 2: Run** `node --test test/unit/start-widgets.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the module. `normalizeWidgets` keeps the first occurrence of each card in `left` then `right`, drops unknown names, and appends a missing card to its default side.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `Start Page widgets: the rules for the device-local choice`.

### Task 2: The `newtabWidgets` setting

**Files:**
- Modify: `src/main/settings.js` (DEFAULTS, load-time normalization near the other `newtab*` checks around :593, a setter beside `setLinkRoutes` :932, exports :1173)
- Modify: `settings-schema/schema.json` (add `"newtabWidgets"` to `internalDefaults`), run `npm run settings:build`
- Test: `test/unit/start-widgets-settings.test.js`

**Interfaces:**
- Consumes: Task 1's `normalizeWidgets`, `migrateFromLayout`.
- Produces: `settings.getNewtabWidgets() -> Widgets`; `settings.setNewtabWidgets(next: Widgets) -> Widgets` (normalizes, saves, fires the usual change listeners).

- [ ] **Step 1: Failing tests** using the settings test harness the other settings tests use (a temp userData): a store without `newtabWidgets` and `newtabLayout:'ledger'` loads with `getNewtabWidgets().favorites === true && .devices === true` and writes it once (a second load with `newtabLayout:'tally'` keeps ledger's result); junk in `newtabWidgets` is normalized on load and `newtabLayout` is untouched; `setSettings({newtabWidgets:{favorites:true}})` changes nothing (not whitelisted); `'newtabWidgets'` is not in the exported synced key list.
- [ ] **Step 2: Run** `node --test test/unit/start-widgets-settings.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Migration runs in the load path when `newtabWidgets` is absent; it does not touch `_syncMeta`.
- [ ] **Step 4: Run** the test, then `npm run test:unit` and `npm run substrate:check`. Expected: all PASS.
- [ ] **Step 5: Commit** `Start Page widgets: a device-local setting, filled once from the old layout`.

### Task 3: Bridge and status

**Files:**
- Modify: `src/main/pages.js` (beside `pages:start:set-layout` :700; remove `pages:start:set-layout` and the `pages:start:layout-used` event :775)
- Modify: `src/main/tab-preload.js` (`start` block :97–145: add four methods, remove `setLayout`, `layoutUsed`)
- Modify: `src/main/main.js` (`startPageStatus` :15750 drops `layout`, adds `widgets`; the start data builder adds `widgets`; `startPage` hooks :16038 replace `setLayout` with the four writers; remove the `newtabLayoutUsed` telemetry hook :15938)
- Modify: `browser-api/bridges.json`, run `npm run browser-api:build`
- Test: `npm run browser-api:check` plus a case in `test/unit/start-widgets-settings.test.js` for the hook functions

**Interfaces:**
- Consumes: Task 1 setters, Task 2 getter/setter.
- Produces, on `window.bowserPages.start` (each resolves to `pageWidgets(...)` of the stored value, rejects when the setter returned null):
  - `setWidget(name, on)` → `pages:start:set-widget`
  - `setShortcutCount(n)` → `pages:start:set-shortcut-count`
  - `setWidgetPlace(left, right)` → `pages:start:set-widget-place`
  - `setWidgetSize(card, size)` → `pages:start:set-widget-size`
  - `data().widgets` and every `pages:start:status` push's `widgets`: `pageWidgets(settings.getNewtabWidgets())`

- [ ] **Step 1: Failing check:** add the four channels to `bridges.json` first; run `npm run browser-api:check`. Expected: FAIL (preload and handlers missing).
- [ ] **Step 2: Implement** the preload methods, the handlers (host `newtab` only) and the main hooks. A write saves through `setNewtabWidgets`, which fires `onSettingsChanged`, which already calls `broadcastStartPageStatus()`.
- [ ] **Step 3: Run** `npm run browser-api:build && npm run browser-api:check && npm run test:unit && npm run lint`. Expected: PASS.
- [ ] **Step 4: Commit** `Start Page widgets: four page channels and the widgets on every status push`.

### Task 4: Strings

**Files:**
- Modify: `copy/messages/en.json`, `de.json`, `es.json`, `fr.json`, `it.json`, `pt-BR.json`; generated `src/renderer/pages/strings.*.js`

- [ ] **Step 1:** Add the English keys with notes: `start.billboard.blocked`; `start.widgets.{heading,unconfirmed,move,movedLeft,movedRight,resize,size,sizeAuto,resized,resizedAuto}`; `start.shortcuts.{heading,fewer,more,count,sofar}`; `start.devices.{tabs,more,fewer}`; `start.mahjong.play`. Messages verbatim from the fork's `strings.js` English catalog.
- [ ] **Step 2:** Copy each key's five translations from the fork's `strings.js` into the matching catalogs, then `npm run copy:ack -- <locale> <keys>` for each locale.
- [ ] **Step 3: Run** `npm run copy:build && npm run copy:check`. Expected: PASS (unused-key warnings for the new keys are fine until Task 5).
- [ ] **Step 4: Commit** `Start Page widgets: strings in six languages, from the fork`.

### Task 5: One page, widget cards, Customize and the shortcut count

**Files:**
- Modify: `src/renderer/pages/newtab.html`, `src/renderer/pages/newtab.js`, `src/renderer/pages/pages.css`
- Modify: `spec/acceptance/newtab-layouts.feature`, `test/desktop/steps/newtab-layouts.steps.js`
- Modify: `spec/features.md` F35, `spec/parity-matrix.md` F35 row

**Interfaces:**
- Consumes: Task 3's bridge; Task 4's keys.
- Produces (DOM the later tasks and tests rely on): `#bbWidgets`, `#bbRailLeft`, `#bbRailRight`, `.bb-widget[data-card]`, grip buttons, `#widgetMoveStatus`, `#widgetSwitches .widget-tile[role=switch][data-widget]`, `#widgetSaveStatus`, `#shortcutStepper` (`#shortcutFewer`, `output#shortcutCount`, `#shortcutMore`), `#shortcutsHint`, `#bbBlocked`, `body[data-rails-stacked]`; page functions `applyWidgets(widgets)`, `billboardSiteCount()`.

- [ ] **Step 1: Rewrite the acceptance scenarios** (fork's V24/V26 replacements in `divergences.mjs` and `lib/start-widgets.mjs` are the guide). Replace F35-1/2/14/16/17 with:
  - Billboard renders for every saved `newtabLayout`, and a profile saved with `ledger` shows Favorites and Other devices cards, `tally` Favorites only, `shelf` Favorites and 12 shortcuts.
  - Customize's two switches turn Favorites and Other devices on and off, a second open Start Page follows without reload, and the choice survives a relaunch.
  - Six "+" presses from 6 reach 12 with one save, focus stays on "+", and "N sites so far" shows with fewer sites than the count.
  - Arrow keys on a grip move a card and announce it; the placement is kept.
  - At 1000×840 and 1200×840 with both cards on, no shortcut tile intersects a card and nothing intersects the footer.
  - A rejected write (test hook makes the setter return null) shows "Could not confirm the widget change. Try again." and the switch shows the stored state.
  - The line under the clock reads "N ads blocked this week"; a private page says it counts nothing.
  - F35-4/F35-6/F35-15/F35-18 keep their intent on the one page (Mahjong from the footer, now labelled "Play Blanc Mahjong"; typography roles; one row of short names becomes centered rows of at most six; centering).
- [ ] **Step 2: Run** `npm run test:acceptance:dry` locally (expected: undefined steps), then the feature on the Mac Studio (expected: FAIL).
- [ ] **Step 3: Port the page.** From the fork's diff: forced Billboard in `applyLayout`; the widget block (`WIDGET_NAMES`, `applyWidgets`, `placeCards`, `refreshRails`, `saveCardPlace`, `dropSlot`, `bindGrip`); the Customize switches, `showShortcutCount`/`stepShortcuts` (250 ms), `fitCustomizeBelowClock`, `layoutShortcutRows` (`MIN_TILES_BESIDE_COLUMNS = 3`), `updateShortcutsHint`; `billboardSiteCount()` replacing the hard-coded 6; Favorites lists 8; the blocked line; `--clock-optical`; `newtab.html`'s `#bbWidgets` and Customize columns. Remove Ledger's column, Shelf, Tally, the layout picker and `layoutUsed`. Replace the fork's `window.blancNewTabEvent('widgets')` fallback with re-reading `bowserPages.start.data()` and applying its `widgets`. Move the fork's widget, rail, Customize and stepper rules (`newtab-prototype.css` :189–361, :485–486, :618–621) into `pages.css`.
- [ ] **Step 4: Run** the feature on the Mac Studio, then locally `npm run copy:check && npm run lint && npm run test:unit`. Expected: PASS.
- [ ] **Step 5:** Update F35 in `spec/features.md` to the one page with widgets (and the parity matrix row). Commit `Start Page: Billboard with widget cards, Customize redesign and a shortcut count (V24, V26)`.

### Task 6: Other devices redesign and resizable cards

**Files:**
- Modify: `src/renderer/pages/newtab.js`, `src/renderer/pages/pages.css`
- Create: `test/desktop/start-devices-smoke.mjs` (port of `native-start-devices.mjs` onto the Electron harness); add `test:start-devices:desktop` to `package.json` and to the `newtab`-related CI job beside `billboard-clock-smoke`

**Interfaces:**
- Consumes: Task 5's `.bb-widget[data-card]`, `applyWidgets`; Task 3's `setWidgetSize`.
- Produces: `CARD_SIZES` in the page equal to Task 1's.

- [ ] **Step 1: Write the smoke** with the fork test's assertions: rows grouped per device with `data-device`, three then "N more tabs"/"Show fewer"; the resize edge has `role=separator` and "Size n of 5"; a slow drag snaps to the nearest size, arrow keys step, double-click fits the column, the size survives a reload; Favorites shows 8, or all of 20 when sized; a drag preview is at most 220 px tall.
- [ ] **Step 2: Run** it on the Mac Studio. Expected: FAIL.
- [ ] **Step 3: Port** the fork's `REMOTE_TABS_SHOWN`, `remoteDeviceKind`, `remoteDeviceGlyph`, grouped `renderRemote`, `remoteFade`, and the resize code (`CARD_SIZES`, `applyCardSizes`, `setCardHeight`, `cardSteps`, `rubberband`, `springCardTo`, `snapGuide`, `saveCardSize`, `addResizeEdge`), with CSS `newtab-prototype.css` :489–616. Keep the existing `other-devices.steps.js` passing (rows now carry `data-device`).
- [ ] **Step 4: Run** the smoke and `@F35`, other-devices scenarios on the Mac Studio. Expected: PASS.
- [ ] **Step 5: Commit** `Start Page: Other devices grouped by device, and cards that resize`.

### Task 7: Image-aware ink, glass cards and the footer fade

**Files:**
- Create: `src/renderer/pages/newtab-ink.js` (loaded by `newtab.html` after `newtab-wallpaper.js`; CSP unchanged)
- Modify: `src/renderer/pages/pages.css`, `tokens/tokens.json` (run `npm run tokens:build`)
- Create: `test/unit/start-plates.test.js` (port of `chromium/tools/start-plates.test.mjs`, reading `pages.css`)
- Modify: `test/desktop/start-devices-smoke.mjs` or a new `test/desktop/start-ink-smoke.mjs`

**Interfaces:**
- Produces: `window.blancStartInk = {update(), explain()}`; `data-ink="light"|"dark"` on `.start-brand-date`, `#bbBlocked`, `.bb-fav .label`, `.bb-groups .group-chip`.

- [ ] **Step 1: Failing unit test:** every tray scheme in `pages.css` (at least 4: light, dark, light-wallpaper-style, private) keeps tray ink and footer ink at 4.5:1 or more over `#000` and `#fff` composited behind the tray at its alpha, and the footer fade under text is at least 0.5 alpha. Run `node --test test/unit/start-plates.test.js`: FAIL.
- [ ] **Step 2: Implement** the tray tokens and glass (`.bb-widget` radius 18, `blur(28px) saturate(1.5)`), `[data-ink]` rules, Sunrise-mark invert, chip ink and `#layoutFooter::after` fade from `newtab-prototype.css` :362–460. Port the sampler from the fork's `newtab-adapter.js` :890–1021 unchanged in method: 16×16 average behind each target, blended with the wash from `--start-wallpaper-overlay` × `--start-wallpaper-wash`, choose `#f7f0e5` or `#12100b` by higher WCAG contrast; active only while `body[data-wallpaper-style]` is set.
- [ ] **Step 3: Run** the unit test (PASS), then the ink smoke on the Mac Studio over a dark and a light test photo: cards are glass, targets carry the expected `data-ink`, the footer `::after` fade exists, `explain().wash.alpha > 0` with a wash, and the clock has no halo.
- [ ] **Step 4: Commit** `Start Page: text that reads on any wallpaper, glass cards and a footer fade`.

### Task 8: Settings, cleanup and records

**Files:**
- Modify: `src/renderer/pages/settings.html` :212–219, `src/renderer/pages/settings.js` :206, :294, :329 (remove the New tab layout select)
- Modify: `copy/messages/*.json` (remove now-unused layout, Shelf, Tally and Ledger-only keys, and `newtab.billboard.blocked`), `copy/i18n-scope.json` if a file's status changes
- Modify: `test/desktop/i18n-pseudo-sweep.mjs`, `test/desktop/billboard-clock-smoke.mjs` where they pick layouts
- Modify: `CLAUDE.md` and `AGENTS.md` (the newtab paragraph: one Billboard page with widgets; the device-local `newtabWidgets`), `docs/press/release-notes/unreleased.md` (an Added/Changed entry)

- [ ] **Step 1:** Remove the select and its strings; run `npm run copy:build && npm run copy:check && npm run substrate:check && npm run lint && npm run test:unit`. Expected: PASS.
- [ ] **Step 2:** Run `test:i18n:desktop`, `billboard-clock-smoke`, the whole `@F35` set and `@F30`/other-devices on the Mac Studio. Expected: PASS.
- [ ] **Step 3:** Update CLAUDE.md, AGENTS.md and the release notes. Commit `Start Page: one layout in Settings and the records`.
- [ ] **Step 4:** Hand check in a dev run on the Mac Studio (Sunrise, a Color fill, a photo; light and dark; vertical tabs on and off; a 1000 px and a 1600 px window), screenshots kept for the PR.
