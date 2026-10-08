# Start Page Shelf (PR 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shelf's favorite tiles and its two cards sit on one column grid whose width follows the favorites count, so six favorites make a full 3×2 block and the cards fill the next row with no holes.

**Architecture:** `#layoutShelf` becomes the grid itself. Its two wrappers (`#shFavorites`, `.shelf-cards`) become `display: contents`, so the tiles, the empty hint, both cards and the Patron chip are all items of one grid. `newtab.js` sets `data-columns` on `#layoutShelf` from a small pure `shelfColumns(count)`; CSS maps each value to its track count and card spans. This is renderer-only: no IPC, settings or data change.

**Tech Stack:** Plain HTML/CSS/JS served flat from `src/renderer/pages/`, `node --test`, Cucumber + Playwright-Electron.

**Spec:** `docs/superpowers/specs/2026-10-05-start-page-layouts-polish-design.md`, Section 2, "Shelf (PR 3)". It builds on PR 1 (bnfy/blanc#559). This branch (`claude/start-page-shelf`) is stacked on `claude/start-page-layout-polish-59e9b3`, independent of PR 2 (#561); its PR targets #559's branch until #559 merges.

## Global Constraints

- **Columns (verbatim from the spec):** 1–4 favorites → one row of `max(count, 2)` columns; 5–8 favorites → two rows of `ceil(count / 2)` columns. So 6 → 3×2 and 8 → 4×2. With 0 favorites, use 2 columns (the empty hint spans the row).
- **Cards:** "Pick up where you left off" spans `columns − 1`, and "Blocked" spans 1, so their row is full. With no groups, the blocked card spans 1, at the start. In private there's no blocked card (PR 1), and the groups card spans every column.
- **Tighter cards:** tile `min-height` 108px → 92px, card and tile padding 16px → 14px, and the cards' `min-height` goes.
- At ≤760px wide the grid is always 2 columns, and both cards span the full row.
- No inline styles in markup: the column count travels as `data-columns`, mapped by CSS.
- No new IPC, setting or telemetry. Branch check before every commit. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run `/simplify` and `/verify` before each code commit. Also run `npm run test:wallpaper:desktop`, the one standalone desktop smoke script that exercises the start page.

---

### Task 1: One grid with count-driven columns

**Files:**
- Modify: `src/renderer/pages/newtab.html` (card classes)
- Modify: `src/renderer/pages/newtab.js` (`shelfColumns`, `renderShelf`)
- Modify: `src/renderer/pages/pages.css` (delete the old Shelf grid rules; add one Shelf block to the frame section)
- Modify: `test/unit/start-page-frame.test.js`

**Interfaces:**
- Produces:
  - `shelfColumns(count: number) → 2|3|4`, a top-level function in `newtab.js`.
  - `#layoutShelf[data-columns]`.
  - Card classes `.shelf-card-groups` and `.shelf-card-blocked`.

- [ ] **Step 1: Failing tests** (append to `test/unit/start-page-frame.test.js`)

```js
test('Shelf columns follow the favorites count', () => {
  const js = read('src/renderer/pages/newtab.js');
  const source = js.match(/function shelfColumns\(count\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, 'newtab.js defines shelfColumns');
  const shelfColumns = require('node:vm').runInNewContext(`${source}; shelfColumns;`);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map(shelfColumns), [2, 2, 2, 3, 4, 3, 3, 4, 4]);
  assert.match(js, /document\.getElementById\('layoutShelf'\)\.dataset\.columns = String\(shelfColumns\(/);
});

test('Shelf tiles and cards share one grid with full rows', () => {
  const html = read('src/renderer/pages/newtab.html');
  assert.match(html, /<div class="shelf-card shelf-card-groups">/);
  assert.match(html, /<div class="shelf-card shelf-card-blocked">/);
  const css = frameCss();
  assert.match(css, /body\[data-layout="shelf"\] #layoutShelf \{[^}]*display: grid;/s);
  assert.match(css, /#shFavorites,\s*\.shelf-cards \{ display: contents; \}/);
  assert.match(css, /#layoutShelf\[data-columns="3"\] \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /#layoutShelf\[data-columns="3"\] \.shelf-card-groups \{ grid-column: span 2; \}/);
  assert.match(css, /#layoutShelf\[data-columns="4"\] \.shelf-card-groups \{ grid-column: span 3; \}/);
  assert.match(css, /#layoutShelf:has\(\.shelf-card-blocked\[hidden\]\) \.shelf-card-groups \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.shelf-tile \{[^}]*min-height: 92px;[^}]*padding: 14px;/s);
});
```

Run: `node --test test/unit/start-page-frame.test.js`
Expected: FAIL (no `shelfColumns`).

- [ ] **Step 2: Markup**

In `newtab.html`, give the two Shelf cards their role classes: change the first `<div class="shelf-card">` (holding `#shGroups`) to `<div class="shelf-card shelf-card-groups">`, and the second (holding `#shBlocked`) to `<div class="shelf-card shelf-card-blocked">`.

- [ ] **Step 3: `newtab.js`**

Directly above `function renderShelf()`, add:

```js
/** Shelf's column count follows its favorites so the tiles form full rows:
 * up to four sit on one row (at least two columns), five to eight split into
 * two rows. The cards below then fill one row of the same grid. */
function shelfColumns(count) {
  if (count <= 4) return Math.max(count, 2);
  return Math.ceil(Math.min(count, 8) / 2);
}
```

In `renderShelf()`, directly after `grid.replaceChildren();`, add:

```js
  document.getElementById('layoutShelf').dataset.columns = String(shelfColumns(Math.min(state.favorites.length, 8)));
```

- [ ] **Step 4: CSS. Delete the old Shelf grid rules**

Delete these (located by selector):
- Base: `.shelf-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 30px; }` and `.shelf-cards { display: grid; … margin-top: 14px; }`.
- Base `@media (max-width: 960px)` block: its `.shelf-grid { … }` and `.shelf-cards { … }` lines (keep the rest of that block).
- Sunrise: `.shelf-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 0; }`, `.shelf-cards { grid-template-columns: … }`, `.shelf-tile { min-height: 108px; … }`, `.shelf-card { min-height: 100px; … }`.
- Sunrise `@media (max-width: 760px)`: `.shelf-grid { … }` and `.shelf-cards { 1fr }`.
- Sunrise `@media (max-height: 640px)`: `.shelf-tile { min-height: 92px; padding: 12px; }`.

- [ ] **Step 5: CSS. Add the Shelf block**

Append to the frame section (before `/* ---------- first-run onboarding dialog ----------`):

```css
/* Shelf: one grid holds the favorite tiles, both cards and the Patron chip.
   Its column count follows the favorites (data-columns, set by newtab.js) so
   every row is full: the groups card takes all but one column and the
   blocked card the last. */
body[data-layout="shelf"] #layoutShelf {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  align-items: stretch;
}
#layoutShelf[data-columns="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
#layoutShelf[data-columns="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
#layoutShelf[data-columns="4"] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
#shFavorites,
.shelf-cards { display: contents; }
.shelf-card-groups { grid-column: span 3; }
#layoutShelf[data-columns="2"] .shelf-card-groups { grid-column: span 1; }
#layoutShelf[data-columns="3"] .shelf-card-groups { grid-column: span 2; }
#layoutShelf[data-columns="4"] .shelf-card-groups { grid-column: span 3; }
#layoutShelf:has(.shelf-card-blocked[hidden]) .shelf-card-groups { grid-column: 1 / -1; }
.shelf-patron { grid-column: 1 / -1; justify-self: start; margin-top: 4px; }
.shelf-tile { min-height: 92px; padding: 14px; gap: 12px; }
.shelf-card { min-height: 0; padding: 14px; }
@media (max-width: 760px) {
  #layoutShelf[data-columns] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  #layoutShelf[data-columns] .shelf-card-groups,
  .shelf-card-blocked { grid-column: 1 / -1; }
}
```

The existing `.shelf-grid > .start-empty-hint { grid-column: 1 / -1; }` keeps working, because `display: contents` makes the hint an item of the Shelf grid.

- [ ] **Step 6: Run the tests**

Run: `node --test test/unit/start-page-frame.test.js test/unit/start-page-fonts.test.js`
Expected: PASS.

- [ ] **Step 7: Commit** (after `/simplify` and `/verify`)

```bash
git branch --show-current   # claude/start-page-shelf
git add src/renderer/pages/newtab.html src/renderer/pages/newtab.js src/renderer/pages/pages.css test/unit/start-page-frame.test.js
git commit -m "Put Shelf's tiles and cards on one count-driven grid

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Acceptance coverage

**Files:**
- Modify: `src/main/test-hook.js` (new `readShelfGeometry`)
- Modify: `spec/acceptance/newtab-layouts.feature`, `test/desktop/steps/newtab-layouts.steps.js`, `test/desktop/cucumber.mjs` (F35-16)

**Interfaces:**
- Produces: `readShelfGeometry()` → `{ columns: string|null, viewportWidth, tiles: Rect[], groups: Rect|null, blocked: Rect|null }`, where `Rect = { left, right, top, bottom }`.

- [ ] **Step 1: Hook** (after `readStartBlockedCard` in `src/main/test-hook.js`)

```js
    readShelfGeometry() {
      const tab = tabs.get(getActiveTabId());
      const wc = tab && urlOf(tab).startsWith('blanc://newtab') ? liveContents(tab) : null;
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const rect = (element) => {
          if (!element || element.hidden || getComputedStyle(element).display === 'none') return null;
          const r = element.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
        };
        return {
          columns: document.getElementById('layoutShelf').dataset.columns ?? null,
          viewportWidth: innerWidth,
          tiles: [...document.querySelectorAll('#shFavorites .shelf-tile')].map(rect).filter(Boolean),
          groups: rect(document.querySelector('.shelf-card-groups')),
          blocked: rect(document.querySelector('.shelf-card-blocked')),
        };
      })()`);
    },
```

- [ ] **Step 2: Scenario and steps**

Append to the feature file:

```gherkin
  @F35-16 @desktop
  Scenario: Shelf fills full rows for its favorites and cards
    Given a group "research" with 2 tabs
    And a profile whose start page layout is "shelf"
    When I seed 6 favorites and open a new tab
    Then Shelf shows 3 columns with full rows of tiles and cards
    When I seed 2 more favorites and open a new tab
    Then Shelf shows 4 columns with full rows of tiles and cards
```

Append to the steps file:

```js
When('I seed {int} favorites and open a new tab', async function (count) {
  const existing = (await this.call('bookmarkUrls')).length;
  for (let index = existing; index < existing + count; index += 1) {
    await this.call('seedFavorite', `https://shelf-${index}.example/`, `Shelf ${index + 1}`);
  }
  await this.call('newTab');
  await this.waitForState((state) => state.tabs.find((tab) => tab.id === state.activeTabId)?.loadedUrl?.startsWith('blanc://newtab'));
});

Then('Shelf shows {int} columns with full rows of tiles and cards', async function (columns) {
  const shelf = await waitForValue(
    () => this.call('readShelfGeometry'),
    (value) => value?.columns === String(columns) && value.tiles.length > 0 && value.groups && value.blocked,
    `Shelf with ${columns} columns`,
  );
  const lefts = [...new Set(shelf.tiles.map((tile) => tile.left))].sort((a, b) => a - b);
  const rights = [...new Set(shelf.tiles.map((tile) => tile.right))].sort((a, b) => a - b);
  assert.equal(lefts.length, columns, `tiles use ${columns} columns: ${JSON.stringify(lefts)}`);
  const rows = new Map();
  for (const tile of shelf.tiles) rows.set(tile.top, (rows.get(tile.top) ?? 0) + 1);
  assert.ok([...rows.values()].every((n) => n === columns), `every tile row is full: ${JSON.stringify([...rows])}`);
  assert.equal(shelf.groups.left, lefts[0], 'the groups card starts at the first column');
  assert.equal(shelf.blocked.right, rights[rights.length - 1], 'the blocked card ends at the last column');
  assert.equal(shelf.groups.top, shelf.blocked.top, 'both cards share one row');
});
```

Add `'@F35-16'` to RUNNABLE.

- [ ] **Step 3: Run, plus a positive control**

Run: `npm run test:acceptance:dry 2>&1 | tail -2 && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F35-16 or @F35-10 or @F35-12 or @F35-13'`
Expected: PASS. Positive control: temporarily append `#layoutShelf[data-columns] { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }` to `pages.css`, rerun `@F35-16`, confirm the 3-column case FAILS, revert.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add src/main/test-hook.js spec/acceptance/newtab-layouts.feature test/desktop/steps/newtab-layouts.steps.js test/desktop/cucumber.mjs
git commit -m "Cover Shelf's full rows in desktop acceptance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Docs

- [ ] In `spec/features.md` F35, after "**shelf** (a favorites grid with group and blocked-count cards", add: "its column count follows the favorites so every row is full, with the cards filling one row of the same grid". Keep the sentence grammatical.
- [ ] Commit: `Document Shelf's count-driven grid`.

---

### Task 4: Verification and proof

- [ ] **All gates:** `npm run test:unit`, `npm run lint`, `npm run substrate:check`, `npm run browser-api:check`, `npm run test:wallpaper:desktop`, and the full `-p runnable` acceptance suite (outside the sandbox, in the background).
- [ ] **Before/after:** "before" is PR 1's `output/start-page-pr1/after/shelf-*`. "After": `REPO="$PWD" OUT=output/start-page-pr3/after EXTRAS=1 ONLY='^shelf' node output/start-page-handoff-2026-10-05/capture-start.js`. Build full-resolution stacked crops (light 1440, 820, dark, private), before on top, and inspect every one.
- [ ] **Owner review before the PR.** Send the crops with a numbered "where to look" list. Open the PR against `claude/start-page-layout-polish-59e9b3` only after explicit approval.
