# Start Page Tally (PR 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tally becomes two balanced, top-aligned columns centered in the content area, with warm Sunrise bars for past days, the data first on narrow windows, and the list centered alone in private tabs.

**Architecture:** This is CSS only, plus one test hook. `#layoutTally` keeps PR 1's grid but gets equal columns at a 904px measure (the same as Ledger), and its column rules move to `#id` specificity so the private and narrow overrides actually apply. The `body[data-layout]` selector outranked them in PR 1, the same trap PR 3 hit on Shelf. A dead 960px media block that still capped the data column at 280px is deleted. No IPC, setting or data change.

**Tech Stack:** Plain HTML/CSS/JS served flat from `src/renderer/pages/`, `node --test`, Cucumber + Playwright-Electron.

**Spec:** `docs/superpowers/specs/2026-10-05-start-page-layouts-polish-design.md`, Section 2, "Tally (PR 4)". This branch (`claude/start-page-tally`) is stacked on PR 1 (bnfy/blanc#559), independent of #561 and #562; its PR targets #559's branch until #559 merges.

## Global Constraints

- **Columns:** `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)`, `align-items: start`, centered at `max-width: 904px`, `column-gap: 64px`.
- **Bars:** past days are filled `color-mix(in srgb, var(--accent) 32%, transparent)` with no border; today is solid `--accent`. Bar heights stay inline from data (unchanged).
- **Under 900px:** one column, with the data column first (`order: -1`).
- **Private:** the data column is hidden (PR 1), and the left column centers alone at `max-width: 420px`.
- The Patron chip stays the root's last child, spanning the row (PR 1's slot rule, F35-11).
- Acceptance id for this PR: **F35-17** (F35-15 is #561's, F35-16 is #562's).
- Branch check before every commit. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run `/simplify` and `/verify` before code commits, plus `npm run test:wallpaper:desktop`.

---

### Task 1: Balanced columns, narrow order, private centering, warm bars

**Files:**
- Modify: `src/renderer/pages/pages.css`
- Modify: `test/unit/start-page-frame.test.js`

- [ ] **Step 1: Failing test** (append to `test/unit/start-page-frame.test.js`)

```js
test('Tally is two balanced columns with warm bars, data first when narrow', () => {
  const css = frameCss();
  const all = read('src/renderer/pages/pages.css');
  assert.match(css, /body\[data-layout="tally"\] #layoutTally \{ display: grid; \}/);
  assert.match(css, /#layoutTally \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);[^}]*max-width: 904px;[^}]*margin-inline: auto;/s);
  assert.match(css, /#layoutTally:has\(> \.tally-right\[hidden\]\) \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*max-width: 420px;/s);
  assert.match(css, /@media \(max-width: 900px\) \{[\s\S]*?#layoutTally \{ grid-template-columns: minmax\(0, 1fr\); \}[\s\S]*?\.tally-right \{ order: -1; \}/);
  assert.match(css, /\.tally-bar \{[^}]*background: color-mix\(in srgb, var\(--accent\) 32%, transparent\);[^}]*border: 0;/s);
  assert.match(css, /\.tally-bar\.today \{ background: var\(--accent\); \}/);
  assert.doesNotMatch(all, /\.tally-right \{ margin-top: 56px; max-width: 280px;/, 'the old 280px cap is gone');
});
```

Run: `node --test test/unit/start-page-frame.test.js`
Expected: FAIL.

- [ ] **Step 2: Delete dead and superseded rules**

- In the base `@media (max-width: 960px)` block, delete the comment `/* Tally's fixed columns cannot share a narrow window — stack them. */` and the three rules after it (`.tally-left, .tally-right { position: static; width: auto; margin: 0 48px; }`, `.tally-left { padding-top: 120px; }`, `.tally-right { margin-top: 56px; max-width: 280px; padding-bottom: 96px; }`).
- In the frame section, replace PR 1's interim Tally rules (from `body[data-layout="tally"] #layoutTally {` through the `@media (max-width: 900px) { body[data-layout="tally"] #layoutTally { … } }` block, keeping `.tally-left, .tally-right { position: static; … }` and `.tally-patron { … }`) with the Step 3 block.
- In the Sunrise section, delete `.tally-bar { border-color: …; background: var(--accent-dim); }` and `.tally-bar.today { background: var(--accent); border-color: var(--accent); }`.

- [ ] **Step 3: Add the Tally block** (in the frame section, where PR 1's interim rules were)

```css
/* Tally: two balanced columns at Ledger's measure, tops aligned. The column
   rules sit at #id specificity so the private and narrow overrides below can
   win; a body[data-layout] selector would outrank them. */
body[data-layout="tally"] #layoutTally { display: grid; }
#layoutTally {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 64px;
  row-gap: 32px;
  align-items: start;
  width: 100%;
  max-width: 904px;
  margin-inline: auto;
}
/* Private tabs hide the data column; the list then centers alone. */
#layoutTally:has(> .tally-right[hidden]) {
  grid-template-columns: minmax(0, 1fr);
  max-width: 420px;
}
@media (max-width: 900px) {
  #layoutTally { grid-template-columns: minmax(0, 1fr); }
  .tally-right { order: -1; }
}
```

And with the other surface rules in the frame section:

```css
/* Past days in a warm Sunrise tint, today solid; colour alone marks today. */
.tally-bar {
  background: color-mix(in srgb, var(--accent) 32%, transparent);
  border: 0;
  border-radius: 3px 3px 0 0;
}
.tally-bar.today { background: var(--accent); }
```

- [ ] **Step 4: Run**

Run: `node --test test/unit/start-page-frame.test.js`
Expected: PASS.

- [ ] **Step 5: Commit** (after `/simplify`, `/verify`, and `npm run test:wallpaper:desktop`)

```bash
git branch --show-current   # claude/start-page-tally
git add src/renderer/pages/pages.css test/unit/start-page-frame.test.js
git commit -m "Balance Tally's columns and warm its chart

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Acceptance coverage

**Files:** `src/main/test-hook.js` (new `readTallyGeometry`), `spec/acceptance/newtab-layouts.feature`, `test/desktop/steps/newtab-layouts.steps.js`, `test/desktop/cucumber.mjs` (F35-17)

**Interfaces:**
- Produces: `readTallyGeometry()` → `{ viewportWidth, private, content: Rect, left: Rect|null, right: Rect|null }`, where `Rect = { left, right, top, bottom, width }`.

- [ ] **Step 1: Hook** (after `readStartBlockedCard`)

```js
    readTallyGeometry() {
      const tab = tabs.get(getActiveTabId());
      const wc = tab && urlOf(tab).startsWith('blanc://newtab') ? liveContents(tab) : null;
      if (!wc) return null;
      return wc.executeJavaScript(`(() => {
        const rect = (element) => {
          if (!element || element.hidden || getComputedStyle(element).display === 'none') return null;
          const r = element.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) };
        };
        return {
          viewportWidth: innerWidth,
          private: document.documentElement.dataset.theme === 'private',
          content: rect(document.getElementById('startContent')),
          left: rect(document.querySelector('.tally-left')),
          right: rect(document.querySelector('.tally-right')),
        };
      })()`);
    },
```

- [ ] **Step 2: Scenario and steps**

```gherkin
  @F35-17 @desktop
  Scenario: Tally balances its columns and puts the data first when narrow
    Given eight favorites fill the Start Page
    And a profile whose start page layout is "tally"
    When I open a new tab
    Then Tally shows two equal, top-aligned columns centered at 1440x840
    And Tally stacks the data above the list at 820x840
```

```js
async function tallyAt(world, width, height) {
  await world.call('setWindowContentSize', width, height);
  await waitForValue(
    () => world.call('windowContentBounds'),
    (bounds) => bounds?.width === width && bounds?.height === height,
    `${width}x${height} content bounds`,
  );
  return waitForValue(
    () => world.call('readTallyGeometry'),
    (value) => value?.viewportWidth === width && value.left && value.right,
    `Tally at ${width}x${height}`,
  );
}

Then('Tally shows two equal, top-aligned columns centered at 1440x840', async function () {
  this.tallyOriginalBounds = await this.call('windowContentBounds');
  const tally = await tallyAt(this, 1440, 840);
  assert.ok(Math.abs(tally.left.width - tally.right.width) <= 1, `equal columns: ${tally.left.width} vs ${tally.right.width}`);
  assert.equal(tally.left.top, tally.right.top, 'tops aligned');
  const leftGap = tally.left.left - tally.content.left;
  const rightGap = tally.content.right - tally.right.right;
  assert.ok(Math.abs(leftGap - rightGap) <= 2, `centered: ${leftGap} vs ${rightGap}`);
});

Then('Tally stacks the data above the list at 820x840', async function () {
  try {
    const tally = await tallyAt(this, 820, 840);
    assert.ok(tally.right.bottom <= tally.left.top, `data first: right ${JSON.stringify(tally.right)} left ${JSON.stringify(tally.left)}`);
  } finally {
    const original = this.tallyOriginalBounds;
    if (original) await this.call('setWindowContentSize', original.width, original.height);
  }
});
```

Add `'@F35-17'` to RUNNABLE.

- [ ] **Step 3: Run, plus a positive control**

Run: `npm run test:acceptance:dry 2>&1 | tail -2 && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F35-17 or @F35-10 or @F35-12'`
Expected: PASS. Positive control: temporarily append `#layoutTally { grid-template-columns: minmax(0, 1fr) minmax(0, 310px) !important; }` to `pages.css`, rerun `@F35-17`, confirm FAIL ("equal columns"), revert.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add src/main/test-hook.js spec/acceptance/newtab-layouts.feature test/desktop/steps/newtab-layouts.steps.js test/desktop/cucumber.mjs
git commit -m "Cover Tally's balanced columns in desktop acceptance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Docs

- [ ] In `spec/features.md` F35, change "**tally** (the ledger column beside a week-of-blocking bar chart)" to "**tally** (favorites and groups beside a week-of-blocking bar chart, as two balanced columns that stack data-first on narrow windows)".
- [ ] Commit: `Document Tally's balanced columns`.

---

### Task 4: Verification and proof

- [ ] **All gates:** `npm run test:unit`, `npm run lint`, `npm run substrate:check`, `npm run browser-api:check`, `npm run test:wallpaper:desktop`, and the full `-p runnable` suite (outside the sandbox, in the background).
- [ ] **Before/after:** "before" is `output/start-page-pr1/after/tally-*`. "After": `REPO="$PWD" OUT=output/start-page-pr4/after ONLY='^tally' node output/start-page-handoff-2026-10-05/capture-start.js`. Build full-resolution stacked crops (1440 light, 820, dark, private), inspect every one, and fix anything wrong.
- [ ] **Owner review before the PR**, then open it against `claude/start-page-layout-polish-59e9b3`.
