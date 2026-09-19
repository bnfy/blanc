# Newsreader Reach (Level A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every page of blancbrowser.com one line in Newsreader (the page headline), set the press pull quote in Newsreader italic, and render the share cards with the same face, leaving everything else in Inter.

**Architecture:** One new stylesheet token `--site-font-display` (aliasing the Patron stack) is applied to nine existing headline rules and one blockquote rule in `site/src/styles/site.css`; the upright Newsreader `opsz` import moves from `index.astro` to `BaseLayout.astro` and the italic import is added to `press.astro`; the two card render scripts embed the Newsreader woff2 next to Inter. A Playwright site test asserts the computed font per page and no horizontal overflow at three widths; unit tests guard the generators.

**Tech Stack:** Astro site under `site/`, fontsource variable package `@fontsource-variable/newsreader` 5.3.0 (already pinned), Playwright site tests under `test/site/`, node:test unit tests under `test/unit/`.

**Spec:** `docs/superpowers/specs/2026-09-04-newsreader-reach-design.md`

## Global Constraints

- Newsreader is used at weight `400` only; never 500 or 520.
- Headline tracking is `-0.02em`; the pull quote is `-0.005em`.
- The homepage demo showcase headline (`.hero-message h2`), all `h2`, feature cards, FAQ questions, release names, footer tagline, legal `h1`, consent card, controls, body copy, and product replicas stay in Inter.
- Share-card filenames under `site/public/` never change (stable URLs).
- Run site tests against a running site: build with `npm run site:build`, then `cd site && npx astro preview --port 4322 --host 127.0.0.1`, then `BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/*.test.mjs`. Stop the preview afterward and never leave two servers running.
- Commit after each task. Do not push or deploy until the owner asks.

---

### Task 1: Display token, global font loading, homepage headline

**Files:**
- Modify: `site/src/styles/site.css:31` (token block) and `:125` (`.hero h1`)
- Modify: `site/src/layouts/BaseLayout.astro` (add the font import in frontmatter)
- Modify: `site/src/pages/index.astro:4` (remove the page-local import)
- Test: `test/site/newsreader-reach.test.mjs` (create)

**Interfaces:**
- Produces: CSS token `--site-font-display` on `:root`, identical stack to `--site-font-patron`. Later tasks reference it by that exact name.

- [x] **Step 1: Write the failing test**

Create `test/site/newsreader-reach.test.mjs`:

```js
// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/newsreader-reach.test.mjs
//
// Level A of the Newsreader reach decision (4 Sep 2026): one Newsreader line
// per page, the press quote in italic, everything else in Inter.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
let browser;
before(async () => {
  browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch();
});
after(async () => { await browser?.close(); });

async function openPage(path = '/', width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
    ? route.continue() : route.abort());
  await page.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  await page.goto(`${baseURL}${path}`);
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

const serif = /^"?Newsreader Variable"?/;
const sans = /^"?Inter/;

test('the homepage headline is Newsreader regular and the demo headline stays Inter', async () => {
  const { page, context } = await openPage('/');
  try {
    const type = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const h1 = getComputedStyle(document.querySelector('.hero h1'));
      const demo = getComputedStyle(document.querySelector('.hero-message h2'));
      return {
        token: root.getPropertyValue('--site-font-display').trim(),
        h1Font: h1.fontFamily, h1Weight: h1.fontWeight, h1Tracking: h1.letterSpacing,
        demoFont: demo.fontFamily,
        loaded: document.fonts.check('64px "Newsreader Variable"'),
      };
    });
    assert.match(type.token, /Newsreader Variable/);
    assert.match(type.h1Font, serif, 'homepage h1 is Newsreader');
    assert.equal(type.h1Weight, '400');
    assert.match(type.demoFont, sans, 'demo showcase headline stays Inter');
    assert.equal(type.loaded, true);
  } finally { await context.close(); }
});
```

- [x] **Step 2: Run the test to verify it fails**

Build and serve first (see Global Constraints), then:

Run: `BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/newsreader-reach.test.mjs`
Expected: FAIL, `token` is empty and `h1Font` starts with `"Inter`.

- [x] **Step 3: Add the token and move the font import**

In `site/src/styles/site.css`, directly after the `--site-font-patron` line, add:

```css
  /* The one Newsreader line per page (page headlines, the press quote) shares
     the Patron stack. Everything scanned rather than read stays in Inter. */
  --site-font-display: var(--site-font-patron);
```

Replace the `.hero h1` rule at line 125 with:

```css
.hero h1 { margin: 0 auto; font-family: var(--site-font-display); font-size: clamp(44px, 4.2vw, 62px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.06; text-wrap: balance; font-variant-numeric: lining-nums; }
```

In `site/src/pages/index.astro`, delete line 4:

```astro
import '@fontsource-variable/newsreader/opsz.css';
```

In `site/src/layouts/BaseLayout.astro`, add to the frontmatter imports (next to the existing fontsource imports for Inter and JetBrains Mono):

```astro
import '@fontsource-variable/newsreader/opsz.css';
```

- [x] **Step 4: Rebuild, restart the preview, run the test**

Run: `npm run site:build && (cd site && npx astro preview --port 4322 --host 127.0.0.1 &)` then `BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/newsreader-reach.test.mjs test/site/sunrise-light.test.mjs`
Expected: PASS for both files. `sunrise-light` still passes because the Patron token is untouched.

- [x] **Step 5: Check the homepage at three widths**

Run:

```bash
node -e '
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  for (const width of [390, 768, 1440]) {
    const p = await b.newPage({ viewport: { width, height: 900 } });
    await p.goto("http://127.0.0.1:4322/");
    await p.evaluate(() => document.fonts.ready);
    const r = await p.evaluate(() => { const h = document.querySelector(".hero h1"); const s = getComputedStyle(h); return { lines: Math.round(h.getBoundingClientRect().height / parseFloat(s.lineHeight)), overflow: document.documentElement.scrollWidth > innerWidth }; });
    console.log(width, r);
    await p.close();
  }
  await b.close();
})();'
```

Expected: `overflow: false` at every width; `lines` is 1 at 1440 and 768, 1 or 2 at 390.

- [x] **Step 6: Commit**

```bash
git add site/src/styles/site.css site/src/layouts/BaseLayout.astro site/src/pages/index.astro test/site/newsreader-reach.test.mjs
git commit -m "Set the homepage headline in Newsreader and load the face sitewide

Adds --site-font-display as the shared display stack, moves the Newsreader
opsz import into BaseLayout so every page has it, and sets the hero h1 at
regular weight with restrained tracking."
```

---

### Task 2: Page headlines on every other page

**Files:**
- Modify: `site/src/styles/site.css` rules at `:915` (`.download-hero h1` must be split out of the shared selector), `:941` (`.faq-page-head h1`), `:1028` (`.changelog-hero h1`), `:1089` (`.about-hero h1`), `:1119` (`.feature-hero h1`), `:1181` (`.ambassador-hero h1`), `:1630` (`.press-hero h1`)
- Test: `test/site/newsreader-reach.test.mjs` (extend)

**Interfaces:**
- Consumes: `--site-font-display` from Task 1.

- [x] **Step 1: Write the failing test**

Append to `test/site/newsreader-reach.test.mjs`:

```js
const serifRoutes = ['/features', '/features/island', '/features/ad-blocking', '/download', '/changelog', '/about', '/faq', '/press', '/ambassadors'];
const sansRoutes = ['/privacy', '/terms'];

test('every page headline is Newsreader regular, legal pages stay Inter, nothing overflows', { timeout: 120000 }, async () => {
  const { page, context } = await openPage('/');
  try {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [...serifRoutes, ...sansRoutes]) {
        const response = await page.goto(`${baseURL}${route}`);
        assert.equal(response.status(), 200, route);
        await page.evaluate(() => document.fonts.ready);
        const type = await page.evaluate(() => {
          const h1 = document.querySelector('main h1, .hero h1, h1');
          const s = getComputedStyle(h1);
          const h2 = document.querySelector('main h2');
          return {
            font: s.fontFamily, weight: s.fontWeight, tracking: parseFloat(s.letterSpacing),
            size: parseFloat(s.fontSize),
            h2Font: h2 ? getComputedStyle(h2).fontFamily : null,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert.equal(type.overflow, false, `${width}px ${route} overflows`);
        if (sansRoutes.includes(route)) {
          assert.match(type.font, sans, `${route} legal h1 stays Inter`);
          continue;
        }
        assert.match(type.font, serif, `${width}px ${route} h1 is Newsreader`);
        assert.equal(type.weight, '400', `${route} h1 weight`);
        assert.ok(Math.abs(type.tracking - type.size * -0.02) < 0.6, `${route} h1 tracking is -0.02em, got ${type.tracking}px at ${type.size}px`);
        if (type.h2Font) assert.match(type.h2Font, sans, `${route} section headings stay Inter`);
      }
    }
  } finally { await context.close(); }
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/newsreader-reach.test.mjs`
Expected: FAIL on `/features` with `font` starting `"Inter`.

- [x] **Step 3: Rewrite the seven rules**

Line 915, split the download headline out of the shared selector so the `h2`s keep Inter:

```css
.home-feature h2, .home-faq h2, .download-details h2 { margin: 0; font-size: clamp(31px, 4.1vw, 52px); font-weight: 500; letter-spacing: -0.035em; line-height: 1.06; text-wrap: balance; }
.download-hero h1 { margin: 0; font-family: var(--site-font-display); font-size: clamp(34px, 4.4vw, 56px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.06; text-wrap: balance; font-variant-numeric: lining-nums; }
```

Line 941:

```css
.faq-page-head h1 { margin: 0; font-family: var(--site-font-display); font-size: clamp(48px, 7.2vw, 86px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.0; text-wrap: balance; }
```

Line 1028:

```css
.changelog-hero h1 { margin: 0; font-family: var(--site-font-display); font-size: clamp(34px, 4.4vw, 56px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.06; text-wrap: balance; }
```

Line 1089:

```css
.about-hero h1 { margin: 0; font-family: var(--site-font-display); font-size: clamp(37px, 5.1vw, 64px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.04; text-wrap: balance; }
```

Line 1119 (covers the features hub and every feature page):

```css
.feature-hero h1 { margin: 0; font-family: var(--site-font-display); font-size: clamp(40px, 5.3vw, 68px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.02; text-wrap: balance; }
```

Line 1181:

```css
.ambassador-hero h1 { max-width: 12ch; margin: 0; font-family: var(--site-font-display); font-size: clamp(48px, 6.1vw, 78px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.0; text-wrap: balance; }
```

Line 1630:

```css
.press-hero h1 { max-width: 18ch; margin: 0; font-family: var(--site-font-display); font-size: clamp(50px, 6.3vw, 80px); font-weight: 400; letter-spacing: -0.02em; line-height: 0.99; text-wrap: balance; }
```

Leave `.legal-doc h1` (line 1486) untouched.

- [x] **Step 4: Rebuild, restart the preview, run the test**

Run: `npm run site:build`, restart the preview, then `BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/*.test.mjs`
Expected: PASS for all site test files, including the pre-existing `demo-desktop-canvas` palette test that walks every route at three widths.

- [x] **Step 5: Eyeball the two longest headlines**

Run the width probe from Task 1 Step 5 against `/press` and `/features` (replace the URL). Expected: no overflow, and the press headline "Blanc replaces browser clutter with one small island." is at most 3 lines at 390px and 2 lines at 1440px.

- [x] **Step 6: Commit**

```bash
git add site/src/styles/site.css test/site/newsreader-reach.test.mjs
git commit -m "Set every page headline in Newsreader regular

Features, download, changelog, about, FAQ, press, and ambassadors take the
display face at weight 400 with -0.02em tracking; section headings, legal
pages, and controls stay Inter."
```

---

### Task 3: Press pull quote in Newsreader italic

**Files:**
- Modify: `site/src/pages/press.astro` (frontmatter import)
- Modify: `site/src/styles/site.css:1851` (`.press-announcement blockquote p`)
- Test: `test/site/newsreader-reach.test.mjs` (extend)

**Interfaces:**
- Consumes: `--site-font-display` from Task 1.

- [x] **Step 1: Write the failing test**

Append to `test/site/newsreader-reach.test.mjs`:

```js
test('the press announcement quote is the only Newsreader italic on the site', async () => {
  const { page, context } = await openPage('/press');
  try {
    const quote = await page.evaluate(() => {
      const p = getComputedStyle(document.querySelector('.press-announcement blockquote p'));
      return { font: p.fontFamily, style: p.fontStyle, weight: p.fontWeight, loaded: document.fonts.check('italic 24px "Newsreader Variable"') };
    });
    assert.match(quote.font, serif);
    assert.equal(quote.style, 'italic');
    assert.equal(quote.weight, '400');
    assert.equal(quote.loaded, true, 'the italic file is loaded on the press page');
  } finally { await context.close(); }

  const home = await openPage('/');
  try {
    const italicDeclared = await home.page.evaluate(() => [...document.fonts].some(f => f.family === 'Newsreader Variable' && f.style === 'italic'));
    assert.equal(italicDeclared, false, 'the italic file is not declared on pages that do not use it');
  } finally { await home.context.close(); }
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/newsreader-reach.test.mjs`
Expected: FAIL, `style` is `normal` and `loaded` is `false`.

- [x] **Step 3: Import the italic on the press page and restyle the quote**

In `site/src/pages/press.astro` frontmatter, after the existing imports:

```astro
import '@fontsource-variable/newsreader/opsz-italic.css';
```

Replace line 1851 of `site/src/styles/site.css`:

```css
.press-announcement blockquote p { margin: 0; font-family: var(--site-font-display); font-style: italic; font-weight: 400; font-size: clamp(22px, 2.4vw, 29px); line-height: 1.35; letter-spacing: -0.005em; }
```

- [x] **Step 4: Rebuild, restart the preview, run the tests**

Run: `npm run site:build`, restart the preview, then `BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/*.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add site/src/pages/press.astro site/src/styles/site.css test/site/newsreader-reach.test.mjs
git commit -m "Set the press announcement quote in Newsreader italic

The italic build is imported only on the press page, the one place the
italic appears."
```

---

### Task 4: Share cards and the press card in Newsreader

**Files:**
- Modify: `site/scripts/render-og-cards.mjs:118-119` (font data URLs) and `:208-218` (card CSS)
- Modify: `site/scripts/render-press-primary-capture.mjs:169-186` (font data URLs and `h1`)
- Regenerate: `site/public/og-image.png`, `site/public/feature-island.png`, `site/public/feature-ad-blocking.png`, `site/public/feature-command-palette.png`, `site/public/feature-private-tabs.png`, `site/public/feature-tab-groups.png`, `site/public/press/blanc-press-card.png`
- Test: `test/unit/og-cards.test.js` (extend)

**Interfaces:**
- Consumes: the woff2 at `site/node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2`.

- [x] **Step 1: Write the failing test**

Append to `test/unit/og-cards.test.js`:

```js
test('the card generators set their titles in Newsreader, the site display face', () => {
  for (const script of ['site/scripts/render-og-cards.mjs', 'site/scripts/render-press-primary-capture.mjs']) {
    const source = fs.readFileSync(path.join(ROOT, script), 'utf8');
    assert.match(source, /newsreader-latin-opsz-normal\.woff2/, `${script} embeds the Newsreader file`);
    assert.match(source, /@font-face \{ font-family: Newsreader;/, `${script} declares the face`);
    assert.match(source, /h1 \{[^}]*font-family: Newsreader[^}]*font-weight: 400/, `${script} sets the title at regular weight`);
    assert.doesNotMatch(source, /h1 \{[^}]*font-weight: 600/, `${script} no longer sets a bold title`);
  }
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test test/unit/og-cards.test.js`
Expected: FAIL, the Newsreader file is not referenced.

- [x] **Step 3: Embed the face in both generators**

In `site/scripts/render-og-cards.mjs`, after line 119 (`const mono = ...`), add:

```js
const newsreader = dataUrl(path.join(SITE_ROOT, 'node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2'), 'font/woff2');
```

In the same file's card CSS (around lines 208 to 218), add a face after the JetBrains Mono `@font-face` and change the `h1` rule:

```js
        @font-face { font-family: Newsreader; src: url('${newsreader}') format('woff2-variations'); font-weight: 200 800; }
```

```js
        h1 { position: absolute; top: 112px; left: 62px; width: 900px; margin: 0;
             font-family: Newsreader, serif; font-size: 62px; font-weight: 400; letter-spacing: -0.02em; line-height: 1.04; font-optical-sizing: auto; }
```

In `site/scripts/render-press-primary-capture.mjs`, after line 170 (the mono data URL), add the same `const newsreader = ...` line, add the same `@font-face` after line 178, and replace line 185 with:

```js
          h1 { position: absolute; top: 246px; left: 94px; width: 720px; margin: 0; font-family: Newsreader, serif; font-size: 122px; font-weight: 400; letter-spacing: -0.02em; line-height: 1.0; font-optical-sizing: auto; }
```

- [x] **Step 4: Run the unit test, then regenerate the cards**

Run: `node --test test/unit/og-cards.test.js`
Expected: PASS.

Run (the site must already be built by Task 3):

```bash
cd site && node scripts/render-og-cards.mjs && node scripts/render-press-primary-capture.mjs && cd ..
```

Expected: both scripts print the files they wrote; `git status` shows the six OG PNGs and `site/public/press/blanc-press-card.png` modified. `site/public/press/blanc-island-product-capture-v2.png` may also be rewritten; keep it only if its bytes changed for a reason you can see (the product capture has no title text, so it should be unchanged; if it changed, discard it with `git checkout -- site/public/press/blanc-island-product-capture-v2.png`).

- [x] **Step 5: Look at one card and run the card guards**

Open `site/public/og-image.png` and `site/public/press/blanc-press-card.png` (use the Read tool). Expected: the title is a serif at regular weight, on one to three lines, with the mark and mono lines untouched.

Run: `node --test test/unit/og-cards.test.js test/unit/press-kit.test.js test/unit/brand-assets.test.js`
Expected: PASS (dimensions 1200x630, six distinct digests, press card size unchanged).

- [x] **Step 6: Commit**

```bash
git add site/scripts/render-og-cards.mjs site/scripts/render-press-primary-capture.mjs site/public/og-image.png site/public/feature-island.png site/public/feature-ad-blocking.png site/public/feature-command-palette.png site/public/feature-private-tabs.png site/public/feature-tab-groups.png site/public/press/blanc-press-card.png test/unit/og-cards.test.js
git commit -m "Render the share cards and press card titles in Newsreader

Both generators embed the Newsreader opsz file next to Inter and set their
h1 at regular weight; the PNGs are regenerated at the same stable URLs."
```

---

### Task 5: Brand doc, site guidance, and the full verification pass

**Files:**
- Modify: `docs/brand-usage.md` ("Blanc Patron website identity" paragraph 1 and the "Titles and subtitles" list)
- Modify: `site/CLAUDE.md` (the fonts sentence in the first paragraph)
- Test: existing `test/unit/public-truth.test.js`, `test/unit/site-island-visual.test.js`

- [x] **Step 1: Amend the brand doc**

In `docs/brand-usage.md`, replace the sentence in the Patron section:

```
This is a dedicated website Patron treatment; other
website headings and the app keep their existing typefaces.
```

with:

```
Newsreader is also the website's display face for exactly one line per
page: the homepage headline, the page-level heading on features, download,
changelog, about, FAQ, press, and ambassadors, and the press announcement
quote in italic. The generated share cards and press card set their titles
in it. Section headings, feature cards, FAQ questions, release names, the
footer tagline, legal pages, the consent card, controls, body copy, and every
product replica stay in Inter, and the app keeps its existing typefaces.
```

In "Titles and subtitles", replace the bullet:

```
- use the UI sans at approximately 500 weight with restrained negative
  tracking and a compact line height;
```

with:

```
- set titles in Newsreader at regular weight with restrained negative
  tracking (about -0.02em) and a compact line height; the UI sans at 500
  remains correct for section-level headings and for assets produced before
  4 September 2026;
```

- [x] **Step 2: Amend the site guidance**

In `site/CLAUDE.md`, the sentence `(bundled + hashed; fonts self-hosted via fontsource — the UI family is "Inter Variable", and this file is NOT under the root tokens/ substrate guard)` becomes:

```
(bundled + hashed; fonts self-hosted via fontsource — the UI family is `"Inter
Variable"`, the display family is `"Newsreader Variable"` loaded in
`BaseLayout.astro` with its italic imported only by `press.astro`, and this
file is NOT under the root `tokens/` substrate guard)
```

- [x] **Step 3: Run the doc guards and the full site suite once more**

Run: `node --test test/unit/public-truth.test.js test/unit/site-island-visual.test.js test/unit/brand-assets.test.js test/unit/press-kit.test.js test/unit/og-cards.test.js test/unit/compliance-model.test.js`
Expected: PASS.

Run: `npm run site:build`, restart the preview, `BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/*.test.mjs`, then stop the preview.
Expected: PASS, and no process left listening on port 4322.

- [x] **Step 4: Commit**

```bash
git add docs/brand-usage.md site/CLAUDE.md
git commit -m "Record the Newsreader display-face rules in brand usage and site guidance"
```

- [x] **Step 5: Report**

Tell the owner the branch is ready, list the seven regenerated PNGs, and remind them that social templates under the title rule wait until after Product Hunt on Thursday 10 September.
