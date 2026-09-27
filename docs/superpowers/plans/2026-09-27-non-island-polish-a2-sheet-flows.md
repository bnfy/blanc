# Non-island polish A2 — utility sheet flows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (owner preference: inline, task by task) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PR A2: site icons on Favorites and History rows, History grouped by day, Downloads rows that stay aligned, Settings Privacy split into clear cards with long explanations folded in place, and a Bring Your Tabs empty state that says what to do next.

**Architecture:** Small pure helpers served flat to the pages (UMD files like `settings-verify-model.js`) carry the logic and the unit tests: `row-icon.js`, `history-groups.js`, `downloads-row-model.js`. Rows keep their existing `.title` / `.meta` / `.actions` classes, which test hooks read. Lists whose columns must line up use CSS subgrid, so no column width is hard-coded. Settings changes are markup and CSS only; every element id stays.

**Tech Stack:** Plain JS renderer pages, CSS (subgrid, line-clamp), `node --test`, Cucumber + Playwright-Electron.

**Spec:** `docs/superpowers/specs/2026-09-26-non-island-surfaces-polish-design.md` §4 findings 5–9, §5.3 row lists, §5.5. A1 (PR #435) must be merged first: A2 builds on its warm sheet scope.

## Global Constraints

- Start after PR #435 merges; branch `claude/non-island-polish-a2` off current `origin/main`.
- Keep the row classes `.title`, `.meta`, `.actions` and every Settings element id: test hooks and `settings.js` read them.
- No new privacy, telemetry or Patron wording. Long Settings explanations are folded with the **same text**; nothing is summarized or reworded.
- No network requests: History icons come only from the existing local hostname icon cache.
- The Island, strip, rail and Glance header are not touched.
- Render proof to the owner and an explicit yes before pushing; private Windows/Linux validation build before merge; no release.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/renderer/pages/row-icon.js` | create | 16px site icon or the Island's domain-initial tile |
| `src/renderer/pages/history-groups.js` | create | Day grouping and time labels |
| `src/renderer/pages/downloads-row-model.js` | create | Source label and file-name split for Downloads rows |
| `src/renderer/pages/bookmarks.js`, `bookmarks.html` | modify | Icon on each Favorites row |
| `src/main/history.js` (`listHistory`) | modify | Attach the cached site icon to each entry |
| `src/renderer/pages/history.js`, `history.html` | modify | Day headings, icons, time labels, CSP `img-src data:` |
| `src/renderer/pages/downloads.js`, `downloads.html` | modify | Aligned columns, domain line, status mark, header button |
| `src/renderer/pages/pages.css` | modify | Row icon, aligned lists, day headings, file names, status marks, Settings cards, folded hints |
| `src/renderer/pages/settings.html`, `settings.js` | modify | Privacy split into five cards; Sync header at card scale; folded hints |
| `src/renderer/pages/tab-import-open-tabs.js` | modify | Empty state |
| `src/main/test-hook.js`, `spec/acceptance/*.feature`, `test/desktop/steps/runnable.steps.js`, `test/desktop/cucumber.mjs` | modify | `@F9-3`, `@F10-3`, `@F14-5` |
| `test/unit/row-icon.test.js`, `history-groups.test.js`, `history-list-icons.test.js`, `downloads-row-model.test.js`, `settings-privacy-cards.test.js`, `tab-import-empty-state.test.js` | create | Tests |

---

### Task 1: Site icons on Favorites rows

**Files:** create `src/renderer/pages/row-icon.js`, `test/unit/row-icon.test.js`; modify `bookmarks.js` (`row()`), `bookmarks.html` (script tag), `pages.css`, `src/main/test-hook.js`, `spec/acceptance/find-favorites-history.feature`, `runnable.steps.js`, `cucumber.mjs`.

**Interfaces:**
- Produces: `window.blancRowIcon.fallbackLetter(url: string): string` and `window.blancRowIcon.rowIcon(document, url: string, favicon: string | null): HTMLElement` (a `span.row-icon`, with an `<img>` for a PNG data URL or `.fallback` text otherwise).
- Produces test hook: `utilitySheetRowIcons(): Promise<Array<{ image: boolean, letter: string }>>`.

- [ ] **Step 1: Failing unit test**

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { fallbackLetter, rowIcon } = require('../../src/renderer/pages/row-icon');

test('the fallback letter matches the Island: first letter of the host without www', () => {
  assert.equal(fallbackLetter('https://www.github.com/bnfy'), 'G');
  assert.equal(fallbackLetter('https://Example.org/'), 'E');
  assert.equal(fallbackLetter('https://ñandú.example/'), 'X'); // punycode host, as in the Island
  assert.equal(fallbackLetter('not a url'), '•');
});

function fakeDocument() {
  const make = (tag) => ({
    tag, className: '', textContent: '', children: [], attributes: {},
    classList: { add(name) { this.owner.className = `${this.owner.className} ${name}`.trim(); } },
    setAttribute(name, value) { this.attributes[name] = value; },
    append(child) { this.children.push(child); },
  });
  return { createElement: (tag) => { const el = make(tag); el.classList.owner = el; return el; } };
}

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('a stored PNG favicon renders as a decorative image', () => {
  const el = rowIcon(fakeDocument(), 'https://github.com/', PNG);
  assert.equal(el.className, 'row-icon');
  assert.equal(el.attributes['aria-hidden'], 'true');
  assert.equal(el.children[0].tag, 'img');
  assert.equal(el.children[0].src, PNG);
  assert.equal(el.children[0].alt, '');
});

test('anything that is not a PNG data URL falls back to the letter tile', () => {
  for (const favicon of [null, '', 'https://github.com/favicon.ico', 'data:image/svg+xml;base64,PHN2Zz4=']) {
    const el = rowIcon(fakeDocument(), 'https://github.com/', favicon);
    assert.equal(el.className, 'row-icon fallback');
    assert.equal(el.textContent, 'G');
    assert.equal(el.children.length, 0);
  }
});
```

Run: `node --test test/unit/row-icon.test.js` → FAIL, "Cannot find module".

- [ ] **Step 2: Create `row-icon.js`**

```js
'use strict';
// A 16px site icon for utility-sheet rows: the stored sanitized favicon when
// there is one, else the Island's domain-initial tile (renderer.js
// faviconFallbackLabel). Served flat to pages via a <script> tag AND
// require-able by node tests. Main already sanitizes stored favicons; the PNG
// data-URL check here is a second, cheap guard.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancRowIcon = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const PNG_PREFIX = 'data:image/png;base64,';

  function fallbackLetter(url) {
    try {
      const host = new URL(url || '').hostname.replace(/^www\./i, '');
      return Array.from(host)[0]?.toUpperCase() || '•';
    } catch {
      return '•';
    }
  }

  function rowIcon(document, url, favicon) {
    const el = document.createElement('span');
    el.className = 'row-icon';
    el.setAttribute('aria-hidden', 'true');
    if (typeof favicon === 'string' && favicon.toLowerCase().startsWith(PNG_PREFIX)) {
      const img = document.createElement('img');
      img.src = favicon;
      img.alt = '';
      el.append(img);
    } else {
      el.classList.add('fallback');
      el.textContent = fallbackLetter(url);
    }
    return el;
  }

  return { fallbackLetter, rowIcon };
});
```

Run the unit test → 4 pass.

- [ ] **Step 3: Failing acceptance scenario**

Append to `spec/acceptance/find-favorites-history.feature` (confirm `@F9-3` unused):

```gherkin
  @F9-3 @F9 @all
  Scenario: Favorites rows show each site's icon
    Given "https://example.com/" is a favorite
    And the favorites page is open in the utility sheet
    Then every favorites row shows a site icon
```

Hook in `test-hook.js` beside `utilitySheetPalette`:

```js
    async utilitySheetRowIcons() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`[...document.querySelectorAll('.row')].map((row) => {
        const icon = row.querySelector('.row-icon');
        return { image: !!icon?.querySelector('img'), letter: icon?.classList.contains('fallback') ? icon.textContent : '' };
      })`);
    },
```

Steps (`runnable.steps.js`; reuse an existing favorite-seeding step if one matches the phrase, otherwise add this):

```js
Given('{string} is a favorite', async function (url) {
  await this.call('seedFavorite', url, 'Example');
});

Then('every favorites row shows a site icon', async function () {
  const icons = await waitForValue(() => this.call('utilitySheetRowIcons'), (rows) => rows?.length > 0, 'favorites rows');
  assert.ok(icons.every((row) => row.image || row.letter), JSON.stringify(icons));
  assert.ok(icons.some((row) => row.image), 'the seeded PNG favicon renders as an image');
});
```

Add `'@F9-3'` to `RUNNABLE`. Run `npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F9-3'` → FAIL (no `.row-icon`).

- [ ] **Step 4: Render the icon in Favorites**

`bookmarks.html`: add `<script src="row-icon.js"></script>` before `<script src="bookmarks.js"></script>`.
`bookmarks.js` `row()`: change `el.append(main, meta, actions);` to `el.append(window.blancRowIcon.rowIcon(document, b.url, b.favicon), main, meta, actions);`.
`pages.css`, after the `.row .main` rule:

```css
.row-icon {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.row-icon img { width: 16px; height: 16px; display: block; }
.row-icon.fallback {
  background: var(--surface);
  color: var(--text-dim);
  font: 600 9px/1 var(--font-ui);
}
```

- [ ] **Step 5: Verify and commit**

Run `node --test test/unit/row-icon.test.js && npx cucumber-js -c test/desktop/cucumber.mjs -p runnable --tags '@F9'` → all pass.

```bash
git add src/renderer/pages/row-icon.js test/unit/row-icon.test.js src/renderer/pages/bookmarks.js src/renderer/pages/bookmarks.html \
  src/renderer/pages/pages.css src/main/test-hook.js spec/acceptance/find-favorites-history.feature test/desktop/steps/runnable.steps.js test/desktop/cucumber.mjs
git commit -m "Show each site's icon on Favorites rows"
```

---

### Task 2: History by day, with icons

**Files:** create `src/renderer/pages/history-groups.js`, `test/unit/history-groups.test.js`, `test/unit/history-list-icons.test.js`; modify `src/main/history.js` (`listHistory`), `history.js`, `history.html`, `pages.css`, acceptance files.

**Interfaces:**
- Produces: `listHistory()` entries gain `favicon: string | null` (sanitized PNG from the hostname cache, else null).
- Produces: `window.blancHistoryGroups.groupByDay(entries, now: Date, locale?: string): Array<{ label: string, entries: Entry[] }>` and `timeLabel(ts: number, locale?: string): string`.

- [ ] **Step 1: Failing test — `listHistory` attaches cached icons**

`test/unit/history-list-icons.test.js`: copy the electron stub and module-cache setup from `test/unit/history-top-sites.test.js` (lines 1–30, including its `icon` PNG constant and `test.after` cleanup), then:

```js
test('history entries carry the cached icon of their site, and only that', () => {
  history.clearHistory();
  history.addVisit('https://github.com/bnfy/blanc', 'Blanc');
  history.addVisit('https://example.com/', 'Example');
  assert.equal(history.cacheSiteIcon('https://github.com/', icon), true);
  const byUrl = Object.fromEntries(history.listHistory().map((e) => [e.url, e.favicon]));
  assert.equal(byUrl['https://github.com/bnfy/blanc'], icon);
  assert.equal(byUrl['https://example.com/'], null);
});
```

Run → FAIL (`favicon` is `undefined`).

- [ ] **Step 2: Implement in `src/main/history.js`**

```js
function listHistory({ query = '', limit = 500 } = {}) {
  const q = query.trim().toLowerCase();
  const data = ensureStore().data;
  const entries = data.entries;
  const filtered = q
    ? entries.filter((e) => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
    : entries;
  const icons = new Map();
  for (const record of Array.isArray(data.siteIcons) ? data.siteIcons : []) {
    const favicon = validFavicon(record?.favicon);
    if (typeof record?.key === 'string' && favicon && !icons.has(record.key)) icons.set(record.key, favicon);
  }
  return filtered.slice(0, limit).map((e) => ({ ...e, favicon: icons.get(siteKey(e.url)) ?? null }));
}
```

(Refactor: extract the icon-map loop shared with `listTopSites` into `function siteIconMap(data)` and use it in both.) Run the test → pass; run `node --test test/unit/history-top-sites.test.js` → still passes.

- [ ] **Step 3: Failing test — day groups and time labels**

`test/unit/history-groups.test.js` (local-time constructors keep day boundaries in the machine's time zone):

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { groupByDay, timeLabel } = require('../../src/renderer/pages/history-groups');

const now = new Date(2026, 8, 27, 10, 0);
const at = (day, hour, minute = 0) => new Date(2026, 8, day, hour, minute).getTime();

test('visits group under Today, Yesterday, then the weekday and date, newest first', () => {
  const entries = [
    { url: 'a', visitedAt: at(27, 9) },
    { url: 'b', visitedAt: at(27, 0, 5) },
    { url: 'c', visitedAt: at(26, 23, 59) },
    { url: 'd', visitedAt: at(23, 16) },
  ];
  const groups = groupByDay(entries, now, 'en-US');
  assert.deepEqual(groups.map((g) => [g.label, g.entries.map((e) => e.url)]), [
    ['Today', ['a', 'b']],
    ['Yesterday', ['c']],
    ['Wednesday, September 23', ['d']],
  ]);
});

test('a visit from another year names the year', () => {
  const [group] = groupByDay([{ url: 'x', visitedAt: new Date(2025, 11, 31, 12).getTime() }], now, 'en-US');
  assert.equal(group.label, 'Wednesday, December 31, 2025');
});

test('times drop the leading zero', () => {
  // Current ICU puts a narrow no-break space before AM/PM; \s matches it.
  assert.match(timeLabel(at(27, 16, 54), 'en-US'), /^4:54\sPM$/);
  assert.match(timeLabel(at(27, 9, 5), 'en-US'), /^9:05\sAM$/);
});
```

Run → FAIL, "Cannot find module".

- [ ] **Step 4: Create `history-groups.js`**

```js
'use strict';
// Day groups and time labels for blanc://history. Served flat via <script>
// and require-able by node tests. Days are local calendar days.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancHistoryGroups = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  function dayLabel(date, now, locale) {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (dayKey(date) === dayKey(now)) return 'Today';
    if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
    return date.toLocaleDateString(locale, options);
  }

  function groupByDay(entries, now = new Date(), locale = undefined) {
    const groups = [];
    for (const entry of entries) {
      const date = new Date(entry.visitedAt);
      const key = dayKey(date);
      if (groups.at(-1)?.key !== key) groups.push({ key, label: dayLabel(date, now, locale), entries: [] });
      groups.at(-1).entries.push(entry);
    }
    return groups.map(({ label, entries: items }) => ({ label, entries: items }));
  }

  function timeLabel(ts, locale = undefined) {
    return new Date(ts).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  }

  return { groupByDay, timeLabel };
});
```

Run → 3 pass. (If `'Wednesday, December 31, 2025'` differs by ICU version, assert the label contains `2025` instead, and note it in the commit.)

- [ ] **Step 5: Failing acceptance scenario**

Append to `spec/acceptance/find-favorites-history.feature` (confirm `@F10-3` unused):

```gherkin
  @F10-3 @F10 @all
  Scenario: History groups today's visits with their site icons
    Given I have visited a page today
    And the history page is open in the utility sheet
    Then history shows a "Today" heading
    And every history row shows a site icon
```

Steps: `Given('I have visited a page today', …)` calls the existing `seedHistory` hook. `Given('the history page is open in the utility sheet', …)` opens Favorites then navigates the sheet (add hook `openHistorySheet() { openInternalPage('blanc://history/'); }` to `test-hook.js` beside `openDownloads`, and call it). `Then('history shows a {string} heading', …)` reads `[...document.querySelectorAll('.day-heading')].map((h) => h.textContent)` through a new hook `historyDayHeadings()` and asserts it includes the label. `Then('every history row shows a site icon', …)` reuses `utilitySheetRowIcons` and asserts every row has an image or letter. Add `'@F10-3'` to `RUNNABLE`. Run → FAIL.

- [ ] **Step 6: Render groups, icons and times**

`history.html`: CSP becomes `default-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; img-src 'self' data:;` (the same narrow allowance `bookmarks.html` has, for local sanitized PNGs only). Load `row-icon.js` and `history-groups.js` before `history.js`. Add `aligned with-icons` to the list: `<div id="list" class="row-list aligned with-icons"></div>`.

`history.js`: delete `formatWhen`; in `refresh()` replace the `for (const e of entries)` loop with:

```js
    for (const group of window.blancHistoryGroups.groupByDay(entries)) {
      const heading = document.createElement('h2');
      heading.className = 'day-heading';
      heading.textContent = group.label;
      list.append(heading);
      for (const e of group.entries) list.append(historyRow(e));
    }
```

and move the existing row construction into `function historyRow(e)`, with `meta.textContent = window.blancHistoryGroups.timeLabel(e.visitedAt);` and `row.append(window.blancRowIcon.rowIcon(document, e.url, e.favicon), main, meta, actions);`.

`pages.css` (aligned lists are shared with Task 3):

```css
/* Lists whose columns line up across rows. Rows join the list's grid through
   subgrid, so the widest meta and action cells set each column and a row with
   hidden or no actions still reserves the space. */
.row-list.aligned { display: grid; grid-template-columns: minmax(0, 1fr) max-content max-content; column-gap: 12px; }
.row-list.aligned.with-icons { grid-template-columns: 16px minmax(0, 1fr) max-content max-content; }
.row-list.aligned > .row { display: grid; grid-template-columns: subgrid; grid-column: 1 / -1; align-items: center; }
.row-list.aligned > :not(.row) { grid-column: 1 / -1; }
.row-list.aligned .meta { text-align: right; }
.day-heading {
  margin: 20px 0 6px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.day-heading:first-child { margin-top: 4px; }
```

- [ ] **Step 7: Verify and commit**

Run the three unit files, `npx cucumber-js … --tags '@F10'`, and the capture tool (History light and dark: headings, icons, right-aligned times). Commit:

```bash
git add src/main/history.js src/renderer/pages/history-groups.js src/renderer/pages/history.js src/renderer/pages/history.html \
  src/renderer/pages/pages.css test/unit/history-groups.test.js test/unit/history-list-icons.test.js src/main/test-hook.js \
  spec/acceptance/find-favorites-history.feature test/desktop/steps/runnable.steps.js test/desktop/cucumber.mjs
git commit -m "Group History by day and show each site's icon"
```

---

### Task 3: Downloads rows that stay aligned (spec finding 7)

**Files:** create `src/renderer/pages/downloads-row-model.js`, `test/unit/downloads-row-model.test.js`; modify `downloads.js`, `downloads.html`, `pages.css`.

**Interfaces:**
- Produces: `window.blancDownloadsRow.sourceLabel(url: string): string` (host without `www.`, or the raw string) and `splitFileName(name: string): { stem: string, ext: string }` (extension of 1–8 characters after the last dot; none for dotfiles).

- [ ] **Step 1: Failing unit test**

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { sourceLabel, splitFileName } = require('../../src/renderer/pages/downloads-row-model');

test('the source line is the site, not the whole URL', () => {
  assert.equal(sourceLabel('https://www.example.com/files/report.pdf?x=1'), 'example.com');
  assert.equal(sourceLabel('blob:https://app.example.org/123'), 'blob:https://app.example.org/123');
  assert.equal(sourceLabel(''), '');
});

test('long names keep their extension visible', () => {
  assert.deepEqual(splitFileName('annual-report-2026.pdf'), { stem: 'annual-report-2026', ext: '.pdf' });
  assert.deepEqual(splitFileName('backup.tar.gz'), { stem: 'backup.tar', ext: '.gz' });
  assert.deepEqual(splitFileName('.env'), { stem: '.env', ext: '' });
  assert.deepEqual(splitFileName('README'), { stem: 'README', ext: '' });
  assert.deepEqual(splitFileName('weird.extension-too-long'), { stem: 'weird.extension-too-long', ext: '' });
});
```

Run → FAIL.

- [ ] **Step 2: Create `downloads-row-model.js`**

```js
'use strict';
// Row text for blanc://downloads. Served flat via <script> and require-able by
// node tests.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancDownloadsRow = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function sourceLabel(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.hostname.replace(/^www\./i, '');
    } catch { /* fall through to the raw text */ }
    return String(url ?? '');
  }

  function splitFileName(name) {
    const text = String(name ?? '');
    const dot = text.lastIndexOf('.');
    const ext = dot > 0 ? text.slice(dot) : '';
    return ext.length >= 2 && ext.length <= 9 ? { stem: text.slice(0, dot), ext } : { stem: text, ext: '' };
  }

  return { sourceLabel, splitFileName };
});
```

Run → 2 pass.

- [ ] **Step 3: Use it in `downloads.js` and restructure the page head**

`downloads.html`: load `downloads-row-model.js` before `downloads.js`; replace the `<h1>` + toolbar row with the Favorites pattern, and align the list:

```html
    <div class="page-head">
      <h1>Downloads</h1>
      <button id="clearFinished">Clear finished</button>
    </div>
    <div id="list" class="row-list aligned"></div>
```

`downloads.js` row construction:

```js
      const title = document.createElement('div');
      title.className = 'title file-name';
      title.title = d.filename;
      const { stem, ext } = window.blancDownloadsRow.splitFileName(d.filename);
      const stemEl = document.createElement('span');
      stemEl.className = 'stem';
      stemEl.textContent = stem;
      const extEl = document.createElement('span');
      extEl.className = 'ext';
      extEl.textContent = ext;
      title.append(stemEl, extEl);
      const url = document.createElement('div');
      url.className = 'url';
      url.textContent = window.blancDownloadsRow.sourceLabel(d.url);
      url.title = d.url;
```

and mark the state on the meta cell: `meta.dataset.state = d.state;`.

`pages.css`:

```css
.row .title.file-name { display: flex; min-width: 0; }
.row .title.file-name .stem { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .title.file-name .ext { flex: none; }
.row .meta[data-state="completed"]::before { content: "✓ "; }
.row .meta[data-state="cancelled"]::before { content: "– "; }
.row .meta[data-state="interrupted"] { color: var(--danger); }
.row .meta[data-state="interrupted"]::before { content: "! "; }
```

- [ ] **Step 4: Verify alignment in the real sheet**

Run the capture tool, then check the Downloads captures: every status ends at the same right edge, whether or not the row has Open/Show buttons. Also measure it once in a throwaway script: open Downloads with the seeded store (as the capture tool does) and evaluate
`[...document.querySelectorAll('.row .meta')].map((m) => Math.round(m.getBoundingClientRect().right))` in the sheet; expect one distinct value. Run `node --test test/unit/private-downloads.test.js` and the unit suite.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/downloads-row-model.js test/unit/downloads-row-model.test.js src/renderer/pages/downloads.js \
  src/renderer/pages/downloads.html src/renderer/pages/pages.css
git commit -m "Keep Downloads columns aligned and show the source site"
```

---

### Task 4: Settings Privacy split into five cards; Sync header at card scale (findings 5)

**Files:** modify `settings.html` (`#group-privacy`, ~305–449; `.sync-setup-header`), `pages.css`; create `test/unit/settings-privacy-cards.test.js`.

**Interfaces:** none (markup; every id kept).

- [ ] **Step 1: Failing policy test**

```js
'use strict';

// Privacy & Security reads as five titled cards instead of one card with five
// sub-sections (spec 2026-09-26 §5.5). Every id settings.js reads survives.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/settings.html'), 'utf8');
const privacy = html.match(/<section class="settings-group" id="group-privacy">([\s\S]*?)<\/section>/)[1];

test('Privacy & Security is five titled cards, in order', () => {
  const titles = [...privacy.matchAll(/<h3 class="card-title">([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.deepEqual(titles, ['Blocking', 'Calls and connections', '1Password', 'Site permissions', 'Usage and data']);
  assert.equal((privacy.match(/class="settings-card"/g) || []).length, 5);
  assert.doesNotMatch(privacy, /class="group-subsection"/);
});

test('every control id the page script uses is still present', () => {
  for (const id of ['adblockEnabled', 'exceptionInput', 'exceptionAdd', 'exceptionList', 'webrtcPolicy',
    'webrtcAudioBuffer', 'secureDns', 'secureDnsCustomRow', 'secureDnsTemplate', 'secureDnsError',
    'onePasswordSettings', 'onePasswordAppHint', 'onePasswordOpenApp', 'onePasswordEnabled',
    'onePasswordAccount', 'onePasswordVerify', 'onePasswordVerifyState', 'permissionList', 'usagePing',
    'resetInstallId', 'resetInstallIdStatus', 'clearBrowsingData', 'clearBrowsingDataStatus']) {
    assert.match(privacy, new RegExp(`id="${id}"`), id);
  }
});
```

Run → FAIL (no card titles).

- [ ] **Step 2: Restructure `#group-privacy`**

Keep the `<h2 class="group-title">` and every element, id, text and attribute; only regroup into cards, in this order:

1. `<div class="settings-card"><h3 class="card-title">Blocking</h3>` — the Block ads row, then the Ad-block exceptions hint, input row and `#exceptionList` (drop its `group-subsection` wrapper and its `h3.section-title`; keep the `p.section-hint`).
2. `<div class="settings-card"><h3 class="card-title">Calls and connections</h3>` — IP address in video calls, Call audio, Encrypted DNS, `#secureDnsCustomRow`.
3. `<div class="settings-card" id="onePasswordSettings" hidden><h3 class="card-title">1Password</h3>` — the former `#onePasswordSettings` contents, minus its `h3.section-title`. The id and `hidden` move to the card so `settings.js` still shows it only where 1Password is supported.
4. `<div class="settings-card"><h3 class="card-title">Site permissions</h3>` — the hint and `#permissionList`.
5. `<div class="settings-card"><h3 class="card-title">Usage and data</h3>` — Help improve Blanc, the Reset install ID row, then the Clear browsing data hint and button row (drop that `h3.section-title`).

`pages.css`:

```css
.card-title { margin: 12px 0 2px; font-size: 13px; font-weight: 600; color: var(--text); }
.settings-group .settings-card + .settings-card { margin-top: 12px; }
```

Bring the Sync header to card scale — replace the `.sync-setup-header h3` block's `font-size: clamp(22px, 3vw, 28px);` and `letter-spacing: -0.025em;` with `font-size: 16px;` and `letter-spacing: 0;` (keep the two-path rows; `sync-settings-card.test.js` must still pass).

- [ ] **Step 3: Verify and commit**

Run `node --test test/unit/settings-privacy-cards.test.js test/unit/sync-settings-card.test.js`, the unit suite, and `npx cucumber-js … --tags '@F14 or @F16-9 or @F33 or @F38'` (1Password Settings scenarios live under F38). Capture Settings light/dark and check each card's spacing.

```bash
git add src/renderer/pages/settings.html src/renderer/pages/pages.css test/unit/settings-privacy-cards.test.js
git commit -m "Split Settings Privacy & Security into five clear cards"
```

---

### Task 5: Long Settings explanations fold in place (finding 6)

**Files:** modify `settings.js` (after `enhanceSettingsSelects(...)`), `pages.css`, `src/main/test-hook.js`, `spec/acceptance/settings-and-theming.feature`, `runnable.steps.js`, `cucumber.mjs`.

**Interfaces:** Produces test hooks `settingsHintState(): Promise<Array<{ id, text, folded, hasToggle }>>` and `toggleFirstFoldedHint(): Promise<boolean>`.

- [ ] **Step 1: Failing acceptance scenario**

Append to `spec/acceptance/settings-and-theming.feature` (confirm `@F14-5` unused):

```gherkin
  @F14-5 @F14 @desktop
  Scenario: Long Settings explanations open in place without changing their text
    Given the settings page is open in the utility sheet
    Then long setting explanations are folded to two lines with a More control
    When I open the first folded explanation
    Then it shows its full text, unchanged
```

Hooks:

```js
    async settingsHintState() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return null;
      return wc.executeJavaScript(`[...document.querySelectorAll('.setting .label .hint:not(.field-error)')]
        .filter((hint) => hint.offsetParent)
        .map((hint, index) => ({ index, text: hint.textContent, folded: hint.classList.contains('folded'),
          hasToggle: hint.nextElementSibling?.classList.contains('hint-toggle') ?? false }))`);
    },
    async toggleFirstFoldedHint() {
      const wc = getUtilitySheetWebContents();
      if (!wc) return false;
      return wc.executeJavaScript(`(() => { const b = document.querySelector('.hint-toggle'); b?.click(); return !!b; })()`);
    },
```

Steps: the first `Then` asserts at least one visible hint has `folded && hasToggle`, and stores its text. The `When` calls `toggleFirstFoldedHint`. The last `Then` re-reads state, finds the same index, asserts `folded === false` and the text is identical. Add `'@F14-5'` to `RUNNABLE`. Run → FAIL.

- [ ] **Step 2: Fold long hints**

`pages.css`:

```css
.setting .label .hint.folded {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.hint-toggle {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
}
```

`settings.js`, right after `enhanceSettingsSelects(...)`:

```js
  // Long explanations show their first two lines; More reveals the same text
  // in place. Nothing is summarized or reworded.
  (function foldLongHints() {
    const hints = [...document.querySelectorAll('.setting .label .hint:not(.field-error)')];
    const measure = () => {
      for (const hint of hints) {
        if (hint.dataset.userExpanded === 'true' || !hint.offsetParent) continue;
        hint.classList.add('folded');
        const overflowing = hint.scrollHeight > hint.clientHeight + 1;
        let toggle = hint.nextElementSibling?.classList.contains('hint-toggle') ? hint.nextElementSibling : null;
        if (!overflowing) {
          hint.classList.remove('folded');
          toggle?.remove();
          continue;
        }
        if (!toggle) {
          toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'hint-toggle';
          toggle.textContent = 'More';
          toggle.setAttribute('aria-expanded', 'false');
          toggle.addEventListener('click', () => {
            const open = hint.classList.toggle('folded') === false;
            hint.dataset.userExpanded = String(open);
            toggle.textContent = open ? 'Less' : 'More';
            toggle.setAttribute('aria-expanded', String(open));
          });
          hint.after(toggle);
        }
      }
    };
    measure();
    let pending = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(measure);
    });
  })();
```

- [ ] **Step 3: Verify and commit**

Run `npx cucumber-js … --tags '@F14'`, the unit suite (policy tests that read Settings copy must still pass; the text is unchanged), and capture Settings at 1280×800 and 640×480.

```bash
git add src/renderer/pages/settings.js src/renderer/pages/pages.css src/main/test-hook.js \
  spec/acceptance/settings-and-theming.feature test/desktop/steps/runnable.steps.js test/desktop/cucumber.mjs
git commit -m "Fold long Settings explanations to two lines with More"
```

---

### Task 6: Bring Your Tabs empty state

**Files:** modify `src/renderer/pages/tab-import-open-tabs.js` (~372–374); create `test/unit/tab-import-empty-state.test.js`.

**Interfaces:** Produces `SUPPORTED_BROWSER_NAMES` constant in `tab-import-open-tabs.js`.

- [ ] **Step 1: Failing test — the named browsers match what Blanc can read**

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { BROWSERS } = require('../../src/main/browser-data-import');

const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/tab-import-open-tabs.js'), 'utf8');

test('the empty state names exactly the browsers Blanc can read, in the same order', () => {
  const declared = source.match(/const SUPPORTED_BROWSER_NAMES = (\[[^\]]*\]);/);
  assert.ok(declared, 'SUPPORTED_BROWSER_NAMES not found');
  assert.deepEqual(JSON.parse(declared[1].replace(/'/g, '"')), BROWSERS.map((b) => b.name));
});
```

Run → FAIL ("not found"). If requiring `browser-data-import.js` pulls in `electron`, stub it first exactly as `test/unit/history-top-sites.test.js` does.

- [ ] **Step 2: Implement**

Near the top of `tab-import-open-tabs.js`:

```js
// Must match BROWSERS in src/main/browser-data-import.js (unit-tested).
const SUPPORTED_BROWSER_NAMES = ['Google Chrome', 'Microsoft Edge', 'Brave', 'Chromium', 'Vivaldi'];
const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
```

Replace `loading.textContent = 'No supported browser profiles found on this device.';` with:

```js
      loading.textContent = `Blanc can bring open tabs from ${listFormat.format(SUPPORTED_BROWSER_NAMES)}, `
        + 'but none of them has a profile on this device. To bring bookmarks from another browser, '
        + 'export them to an HTML file and use Favorites → Import HTML….';
```

- [ ] **Step 3: Verify and commit**

Run the unit test, `npx cucumber-js … --tags '@F40'`, and capture Bring Your Tabs (the capture tool's empty browser home shows this state).

```bash
git add src/renderer/pages/tab-import-open-tabs.js test/unit/tab-import-empty-state.test.js
git commit -m "Say what to do when Bring Your Tabs finds no browser"
```

---

### Task 7: Review, verify, show the owner, open the PR

- [ ] **Step 1:** `node test/desktop/surface-captures.mjs --out <scratch>/a2-after` on this branch and on a throwaway worktree of `origin/main` (`--out <scratch>/a2-before`), then curate matching pairs into `docs/design-reviews/non-island-polish/a2/{before,after}/` (downscaled, `magick -strip`), and write `README.md` with one row per changed surface (Favorites icons, History by day, Downloads columns, Settings Privacy cards, folded explanations, Bring Your Tabs empty state).
- [ ] **Step 2:** Append an A2 entry to `design-qa.md` in the A1 entry's format, with the real verification counts.
- [ ] **Step 3:** `npm run test:unit`, `npm run lint`, `npm run substrate:check`, `npm run test:acceptance:desktop`. Any failure also run against a throwaway `origin/main` worktree before calling it pre-existing.
- [ ] **Step 4:** Send the owner the curated pairs; wait for an explicit yes.
- [ ] **Step 5:** Push `claude/non-island-polish-a2`, open the PR (summary, owner decisions, tests, verification, platform gate), dispatch `release-windows-linux.yml` in validation mode, and bind the PR with the `ccd_pr` tools.

## Next

- **B — small views:** permission prompt, error page, 1Password capsule and screen-share picker on the Sunrise palette.
- **C — frame:** Glance label face, rail and Glance state parity, Windows/Linux controls.
