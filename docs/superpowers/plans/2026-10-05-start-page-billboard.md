# Start Page Billboard (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Billboard's recent-site tiles show short, one-line site names in a single row, with the full page title kept as the tooltip and accessible name.

**Architecture:** Add a pure `shortSiteName(title, url)` in a new flat page script, `start-site-name.js`, following the `type-to-open.js` pattern. It's exposed on `globalThis.blancStartSiteName` and unit-tested in a vm. `newtab.js` uses it for each tile label; CSS turns the label into one ellipsized line and keeps the row on one line. This is renderer-only: no IPC, settings or data change.

**Tech Stack:** Plain HTML/CSS/JS served flat from `src/renderer/pages/`, `node --test`, Cucumber + Playwright-Electron.

**Spec:** `docs/superpowers/specs/2026-10-05-start-page-layouts-polish-design.md`, Section 2, "Billboard (PR 2)". It builds on PR 1 (bnfy/blanc#559), the shared frame. This branch (`claude/start-page-billboard`) is stacked on `claude/start-page-layout-polish-59e9b3`; its PR targets that branch until #559 merges, then is retargeted to `main`.

## Global Constraints

- No new IPC, bridge member, setting or telemetry. `npm run browser-api:check` passes untouched.
- **Short-name rule (verbatim from the spec):** split the title on the first of `" – "`, `" — "`, `" | "`, `" · "`, `" - "`. If the first segment is 1–20 characters after trimming, use it. Otherwise use the domain's first meaningful label (the existing `shortLabel(url)` result).
- The full title stays the label's `title` tooltip, the link's accessible name (`Open <full title>`), and the dismiss button's name (`Hide <full title> from Billboard`).
- One row of up to 6 tiles, 96px label slots, no wrapping. At ≤640px wide only the first 4 show.
- Billboard's private behavior is unchanged: no history-derived sites.
- No inline styles in markup. Branch check before every commit. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run `/simplify` and `/verify` before each code commit (repo harness rule).

---

### Task 1: `shortSiteName` module

**Files:**
- Create: `src/renderer/pages/start-site-name.js`
- Create: `test/unit/start-site-name.test.js`
- Modify: `src/renderer/pages/newtab.html` (load the script before `newtab.js`)
- Modify: `src/renderer/pages/newtab.js` (delete the unused `shortLabel` constant)

**Interfaces:**
- Produces: `globalThis.blancStartSiteName.shortSiteName(title: string, url: string) → string` and `globalThis.blancStartSiteName.shortLabel(url: string, title?: string) → string`.

- [ ] **Step 1: Write the failing test** (`test/unit/start-site-name.test.js`)

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/start-site-name.js'), 'utf8');
const sandbox = { URL };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox);
const { shortSiteName, shortLabel } = sandbox.blancStartSiteName;

test('the page script exposes the short-name helpers', () => {
  assert.equal(typeof shortSiteName, 'function');
  assert.equal(typeof shortLabel, 'function');
});

test('a short first title segment names the site', () => {
  assert.equal(shortSiteName('YouTube – videos worth watching', 'https://www.youtube.com/'), 'YouTube');
  assert.equal(shortSiteName('Nintendo – Official Site', 'https://www.nintendo.com/'), 'Nintendo');
  assert.equal(shortSiteName('Inbox | Fastmail', 'https://app.fastmail.com/'), 'Inbox');
  assert.equal(shortSiteName('Docs · Blanc', 'https://blancbrowser.com/docs'), 'Docs');
  assert.equal(shortSiteName('Scroll — creative work', 'https://scroll.example/'), 'Scroll');
  assert.equal(shortSiteName('Scroll - creative work', 'https://scroll.example/'), 'Scroll');
  assert.equal(shortSiteName('The New York Times - Breaking News, US News', 'https://www.nytimes.com/'), 'The New York Times');
});

test('a short title without a separator is used whole', () => {
  assert.equal(shortSiteName('MDN Web Docs', 'https://developer.mozilla.org/'), 'MDN Web Docs');
  assert.equal(shortSiteName('  GitHub  ', 'https://github.com/'), 'GitHub');
});

test('the first separator wins, and hyphenated words are not separators', () => {
  assert.equal(shortSiteName('Read-only mode | Example – Docs', 'https://example.com/'), 'Read-only mode');
});

test('a long or empty first segment falls back to the domain label', () => {
  assert.equal(shortSiteName('Breaking News, US News, World News and Videos', 'https://www.nytimes.com/'), 'nytimes');
  assert.equal(shortSiteName('', 'https://news.bbc.co.uk/'), 'bbc');
  assert.equal(shortSiteName(' – leading separator', 'https://developer.mozilla.org/'), 'mozilla');
});

test('the domain label drops the TLD and a short second-level suffix', () => {
  assert.equal(shortLabel('https://github.com/'), 'github');
  assert.equal(shortLabel('https://developer.mozilla.org/'), 'mozilla');
  assert.equal(shortLabel('https://www.bbc.co.uk/'), 'bbc');
  assert.equal(shortLabel('not a url', 'Hello world'), 'hello');
  assert.equal(shortLabel('not a url', ''), '·');
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test test/unit/start-site-name.test.js`
Expected: FAIL with ENOENT (no `start-site-name.js`).

- [ ] **Step 3: Implement `src/renderer/pages/start-site-name.js`**

```js
// Short site names for the start page's Billboard tiles. Kept pure (no DOM,
// no IPC) and served flat from this directory, so test/unit can run it in a
// vm, the same way type-to-open.js is shared and tested.
(() => {
  'use strict';

  const SEPARATORS = [' – ', ' — ', ' | ', ' · ', ' - '];
  const MAX_SHORT_NAME = 20;

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  /** The site's own name from its domain, not whatever subdomain it serves
   * from: "github.com" and "developer.mozilla.org" give "github" and
   * "mozilla". Drops the TLD, then a second-level suffix like the "co" in
   * "bbc.co.uk". */
  function shortLabel(url, title = '') {
    const parts = hostOf(url).split('.').filter(Boolean);
    if (parts.length > 1) {
      parts.pop();
      if (parts.length > 1 && parts[parts.length - 1].length <= 3) parts.pop();
    }
    return (parts[parts.length - 1] || String(title).trim().split(/\s+/)[0] || '·').toLowerCase();
  }

  /** The title's first segment when it is short enough to read as a name;
   * otherwise the domain label. */
  function shortSiteName(title, url) {
    // Separators are found before trimming, so a title that opens with one
    // has an empty first segment and falls back to the domain.
    const raw = String(title ?? '');
    const cuts = SEPARATORS.map((sep) => raw.indexOf(sep)).filter((index) => index >= 0);
    const first = (cuts.length ? raw.slice(0, Math.min(...cuts)) : raw).trim();
    return first.length >= 1 && first.length <= MAX_SHORT_NAME ? first : shortLabel(url, raw);
  }

  globalThis.blancStartSiteName = Object.freeze({ shortSiteName, shortLabel });
})();
```

- [ ] **Step 4: Run it**

Run: `node --test test/unit/start-site-name.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire it into the page**

In `newtab.html`, add `<script src="start-site-name.js"></script>` immediately before `<script src="newtab.js"></script>`. In `newtab.js`, delete the unused `shortLabel` constant and its doc comment (it now lives in the module).

Run: `grep -n "shortLabel" src/renderer/pages/newtab.js`
Expected: no output.

- [ ] **Step 6: Commit** (after `/simplify` and `/verify`)

```bash
git branch --show-current   # claude/start-page-billboard
git add src/renderer/pages/start-site-name.js src/renderer/pages/newtab.html src/renderer/pages/newtab.js test/unit/start-site-name.test.js
git commit -m "Add a pure short-site-name helper for the start page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Short one-line Billboard labels, full title for tooltip and accessible name

**Files:**
- Modify: `src/renderer/pages/newtab.js` (`renderBillboard`)
- Modify: `src/renderer/pages/pages.css` (the label rules)
- Modify: `src/main/test-hook.js` (`readBillboardSites` adds `title`, `ariaLabel`)
- Modify: `test/unit/newtab-top-sites.test.js`
- Modify: `spec/acceptance/newtab-layouts.feature`, `test/desktop/steps/newtab-layouts.steps.js` (F35-5 wording and assertions)

**Interfaces:**
- Consumes: `globalThis.blancStartSiteName.shortSiteName` (Task 1).
- Produces: `readBillboardSites().sites[i]` gains `title` (label tooltip) and `ariaLabel` (link name).

- [ ] **Step 1: Update the unit test (failing)**

In `test/unit/newtab-top-sites.test.js`, replace the assertions on `label.textContent = (site.title || hostOf…`, `-webkit-line-clamp: 2`, and `Hide ${label.textContent} from Billboard` with:

```js
  assert.match(renderer, /const fullTitle = \(site\.title \|\| hostOf\(site\.url\) \|\| 'Untitled site'\)\.trim\(\);/);
  assert.match(renderer, /label\.textContent = globalThis\.blancStartSiteName\.shortSiteName\(fullTitle, site\.url\);/);
  assert.match(renderer, /label\.title = fullTitle;/);
  assert.match(renderer, /link\.setAttribute\('aria-label', `Open \$\{fullTitle\}`\);/);
  assert.match(css, /\.bb-fav \.label \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/s);
  assert.doesNotMatch(css, /-webkit-line-clamp: 2/);
  assert.match(renderer, /Hide \$\{fullTitle\} from Billboard/);
```

Run: `node --test test/unit/newtab-top-sites.test.js`
Expected: FAIL.

- [ ] **Step 2: Implement in `renderBillboard`**

Replace:

```js
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = (site.title || hostOf(site.url) || 'Untitled site').trim();
    label.title = label.textContent;
    link.setAttribute('aria-label', `Open ${label.textContent}`);
```

with:

```js
    // A short name reads at a glance; the full title stays one hover or one
    // screen-reader announcement away.
    const fullTitle = (site.title || hostOf(site.url) || 'Untitled site').trim();
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = globalThis.blancStartSiteName.shortSiteName(fullTitle, site.url);
    label.title = fullTitle;
    link.setAttribute('aria-label', `Open ${fullTitle}`);
```

In the same function, replace every remaining `${label.textContent}` (the dismiss button's `title`, its `aria-label`, and the hidden-status message) with `${fullTitle}`.

- [ ] **Step 3: CSS**

Replace the base "overflow floors" rule `.bb-fav .label { max-width: 112px; min-height: 2.7em; … white-space: normal; }` with:

```css
/* One line: a short site name, ellipsized only if a name is still too long
   for its 96px slot. The full title is the tooltip and accessible name. */
.bb-fav .label {
  display: block;
  max-width: 96px;
  overflow: hidden;
  line-height: 1.35;
  text-align: center;
  white-space: nowrap;
  text-overflow: ellipsis;
}
```

`readStartPageLayoutFit` already excludes `.bb-fav .label` from its clipping audit; leave that.

- [ ] **Step 4: Test hook and acceptance wording**

In `readBillboardSites`, add to each site object:

```js
          title: item.querySelector('.label')?.title ?? null,
          ariaLabel: item.querySelector('.bb-fav')?.getAttribute('aria-label') ?? null,
```

In the feature file (F35-5), change `And the Billboard uses full local titles and cached site icons` to `And the Billboard uses short site names, full-title tooltips and cached site icons`. Rename the matching step and replace its two `label` assertions with:

```js
  assert.equal(dom.sites[0].label, 'YouTube');
  assert.equal(dom.sites[0].title, 'YouTube – videos worth watching');
  assert.equal(dom.sites[0].ariaLabel, 'Open YouTube – videos worth watching');
  assert.equal(dom.sites[1].label, 'CNET');
  assert.equal(dom.sites[1].title, 'CNET – technology news and reviews');
```

In "the Billboard lists {string} before {string}", change the last assertion to:

```js
  assert.equal(dom.sites[0].dismissLabel, `Hide ${dom.sites[0].title} from Billboard`);
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/unit/newtab-top-sites.test.js test/unit/start-site-name.test.js`
Expected: PASS.

Run: `npm run test:acceptance:dry 2>&1 | tail -2 && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F35-5 or @F35-6'`
Expected: PASS.

- [ ] **Step 6: Commit** (after `/simplify` and `/verify`)

```bash
git branch --show-current
git add src/renderer/pages/newtab.js src/renderer/pages/pages.css src/main/test-hook.js test/unit/newtab-top-sites.test.js spec/acceptance/newtab-layouts.feature test/desktop/steps/newtab-layouts.steps.js
git commit -m "Label Billboard tiles with short site names

The full page title stays the tooltip and the accessible name.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: One row of tiles

**Files:**
- Modify: `src/renderer/pages/pages.css`
- Modify: `src/main/test-hook.js` (`readBillboardSites` adds per-tile `top`, `visible`, label `lines`)
- Modify: `spec/acceptance/newtab-layouts.feature`, `test/desktop/steps/newtab-layouts.steps.js`, `test/desktop/cucumber.mjs` (F35-15)
- Modify: `test/unit/start-page-frame.test.js`

- [ ] **Step 1: Failing unit test**

Append to `test/unit/start-page-frame.test.js`:

```js
test('Billboard keeps its recent sites on one row', () => {
  const css = frameCss();
  assert.match(css, /\.bb-favs \{[^}]*flex-wrap: nowrap;/s);
  assert.match(css, /@media \(max-width: 640px\) \{\s*\.bb-site:nth-child\(n \+ 5\) \{ display: none; \}/);
});
```

Run: `node --test test/unit/start-page-frame.test.js`
Expected: FAIL.

- [ ] **Step 2: CSS**

Append to the frame block (before `/* ---------- first-run onboarding dialog ----------`):

```css
/* Billboard: one row of recent sites. Six fit at every supported width; the
   narrowest windows keep the four most-visited. */
.bb-favs { flex-wrap: nowrap; justify-content: center; }
@media (max-width: 640px) {
  .bb-site:nth-child(n + 5) { display: none; }
}
```

Run: `node --test test/unit/start-page-frame.test.js`
Expected: PASS.

- [ ] **Step 3: Acceptance F35-15**

In `readBillboardSites`, add to each site object:

```js
          top: Math.round(item.getBoundingClientRect().top),
          visible: getComputedStyle(item).display !== 'none',
          lines: (() => {
            const label = item.querySelector('.label');
            if (!label) return 0;
            return Math.round(label.getBoundingClientRect().height / parseFloat(getComputedStyle(label).lineHeight));
          })(),
```

Append to the feature file:

```gherkin
  @F35-15 @desktop
  Scenario: Billboard shows its recent sites as one row of short names
    Given local history contains repeated visits for the Billboard
    And a profile whose start page layout is "billboard"
    When I open a new tab
    Then the Billboard shows one row of single-line site names at 1440x840 and 820x840
```

Append to the steps file:

```js
Then('the Billboard shows one row of single-line site names at 1440x840 and 820x840', async function () {
  const original = await this.call('windowContentBounds');
  try {
    for (const size of [{ width: 1440, height: 840 }, { width: 820, height: 840 }]) {
      await this.call('setWindowContentSize', size.width, size.height);
      await waitForValue(
        () => this.call('windowContentBounds'),
        (bounds) => bounds?.width === size.width && bounds?.height === size.height,
        `${size.width}x${size.height} content bounds`,
      );
      const dom = await waitForValue(
        () => this.call('readBillboardSites'),
        (value) => value?.sites?.length === 6,
        `Billboard sites at ${size.width}x${size.height}`,
      );
      const shown = dom.sites.filter((site) => site.visible);
      assert.equal(shown.length, 6, `${size.width}: six sites show`);
      assert.equal(new Set(shown.map((site) => site.top)).size, 1, `${size.width}: one row ${JSON.stringify(shown.map((s) => s.top))}`);
      assert.ok(shown.every((site) => site.lines === 1), `${size.width}: single-line labels ${JSON.stringify(shown.map((s) => s.lines))}`);
    }
  } finally {
    await this.call('setWindowContentSize', original.width, original.height);
  }
});
```

Add `'@F35-15'` to RUNNABLE.

Run: `npm run test:acceptance:dry 2>&1 | tail -2 && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F35-15'`
Expected: PASS. Positive control: temporarily append `.bb-favs { flex-wrap: wrap !important; } .bb-site { width: 300px !important; }` to `pages.css`, rerun, confirm FAIL, revert.

- [ ] **Step 4: Commit** (after `/simplify` and `/verify`)

```bash
git branch --show-current
git add src/renderer/pages/pages.css src/main/test-hook.js test/unit/start-page-frame.test.js spec/acceptance/newtab-layouts.feature test/desktop/steps/newtab-layouts.steps.js test/desktop/cucumber.mjs
git commit -m "Keep Billboard's recent sites on one row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Docs

**Files:** `spec/features.md` (F35), `spec/parity-matrix.md` (F35 row)

- [ ] **Step 1:** In `spec/features.md` F35, replace "A full, bounded local page title labels each tile" with "A short site name labels each tile: the bounded local title's first segment when it is 20 characters or fewer, otherwise the domain's first label. The full title stays the tile's tooltip and accessible name. The row never wraps; the narrowest windows show the first four sites." Adjust the surrounding sentence so it still reads naturally.
- [ ] **Step 2:** In `spec/parity-matrix.md`, replace "shows full local page titles" with "shows short site names (full titles as tooltips)".
- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add spec/features.md spec/parity-matrix.md
git commit -m "Document Billboard's short site names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verification and proof

- [ ] **Step 1: All gates.** `npm run test:unit`, `npm run lint`, `npm run substrate:check`, `npm run browser-api:check`, then the full `-p runnable` acceptance suite (outside the sandbox, in the background). All green.
- [ ] **Step 2: Before/after captures.** "Before" is PR 1's tip (`claude/start-page-layout-polish-59e9b3`, already captured as `output/start-page-pr1/after/billboard-*`). "After": `REPO="$PWD" OUT=output/start-page-pr2/after ONLY='^billboard' node output/start-page-handoff-2026-10-05/capture-start.js`. Build full-resolution stacked crops of the Billboard content area (clock to Patron chip) for light 1440, 820, dark and private, before on top. Inspect every image; fix anything wrong.
- [ ] **Step 3: Owner review before the PR.** Send the crops with a numbered "where to look" list. Open the PR (base `claude/start-page-layout-polish-59e9b3`) only after explicit approval.
