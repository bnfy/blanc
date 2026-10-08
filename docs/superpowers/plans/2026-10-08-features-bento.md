# Features Bento Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/features` as an Apple-style bento board (15 visual tiles around a Sunrise "Blanc" hero, then 18 small icon tiles) where each tile is a link that, with script, opens a shared popover growing out of the tile with a visual and the feature's explainer.

**Architecture:** `features.astro` holds every word as literal markup: tile labels inside `BentoTile`/`BentoSmall` slots, and one `FeaturePop` article per feature inside a single native `<dialog>`. CSS in `features-bento.css` encodes the proportions measured from Apple's slides as `calc()` of the board width. `feature-bento.js` intercepts plain clicks on tiles and animates the dialog card from the tile's rectangle with a critically damped spring expressed as a `linear()` easing; it also handles ←/→ navigation, the URL hash, demo loops and reduced motion. Five demo components show three-step loops driven by `data-step`.

**Tech Stack:** Astro 7 static output (`build.format: 'file'`), plain CSS, vanilla JS with the Web Animations API, `sharp` for two derived images, Node's test runner with Playwright (`test/site/*.mjs`) and `node --test` (`test/unit/*.js`).

**Spec:** `docs/superpowers/specs/2026-10-08-features-bento-design.md`

## Global Constraints

- Work only in `/Users/anthonyjloria/Projects/blanc-features-hub` on branch `features-hub-redesign`. Never commit in the main checkout. Dependencies are already installed there (`npm ci`, `npm --prefix site ci`, Playwright Chromium).
- Public release for every claim: **v1.30.0**, `sourceSha` `5be79e58d08ca9bcf7cb99b3d8f84c21c654b1c7`, evidence `docs/release-incidents/2026-10-07-v1.30.0.md`.
- Unchanged: `title`, `description`, `ogDescription`, `path="/features"`, `page="features"`, `current="features"`, BreadcrumbList JSON-LD, `<main id="main-content">`, the Patron and download sections' text and tracking attributes.
- Ids that must exist: `features-title`, `island`, `1password`, `start-page`, `glance`, `ad-blocking`, `private-tabs`, `commands`, `mouse-gestures`, `reopen-closed-tabs`, `tab-groups`, `workspaces`, `vertical-tabs`, `quiet-tabs`, `profiles`, `sync`, `security`, `small-details-title`, `feature-patron-title`, `feature-close-title`.
- Copy is exactly the spec's Copy section. Every text-bearing element in `features.astro` is literal markup (`h1–h6`, `p`) so the prose guard and ledgers can read it; decorative text inside visuals uses `span`/`div` with `aria-hidden="true"` on the visual container.
- Tile labels and dense-grid labels are Inter; the H1, every section H2 and every popover H2 are Newsreader 400 (H1 `letter-spacing: -0.02em`).
- No inline `style=` attributes anywhere in page or components; all styling in `site/src/styles/features-bento.css`.
- No shadows on tiles. Gutter `W*.009`, radius `W*.02`, label `max(15px, W*.0128)`/500, display `W*.022`/700, where `W = min(1220px, 100vw - 48px)`.
- Never deploy (site deploys on hold for Blanc Mail).
- **Site test loop**, from the worktree root (rebuild and restart after every source change):
  ```bash
  npm run site:build
  (cd site && npm run preview -- --background --host 127.0.0.1 --port 4322)
  (cd site && BLANC_SITE_URL=http://127.0.0.1:4322 node --test ../test/site/<file>.test.mjs)
  (cd site && npm run preview -- stop)
  ```

---

### Task 1: Static board, dense grid and popover markup (no script)

**Files:**
- Create: `site/public/feature-hub/sunrise-hero.webp`, `site/public/feature-hub/glance.webp`, `site/public/feature-hub/README.md`
- Create: `site/src/components/bento/BentoTile.astro`, `BentoSmall.astro`, `BentoIcon.astro`, `FeaturePop.astro`
- Create: `site/src/styles/features-bento.css`
- Create: `site/src/scripts/feature-bento.js` (stub comment only; Task 3 fills it)
- Modify: `site/src/pages/features.astro` (full rewrite)
- Modify: `test/site/feature-expansion.test.mjs:99-106`
- Create: `test/site/features-bento.test.mjs`

**Interfaces:**
- Produces `BentoTile` props `{ id: string; href: string; feature: string; area: 'L1'|'L2'|'L3'|'L4'|'L5'|'C1'|'C2'|'C3'|'C4'|'C5'|'R1'|'R2'|'R3'|'R4'|'R5'; tone?: 'white'|'ink'|'photo'|'daylight'|'hero'|'gold'; label?: 'bottom'|'top'|'center' }`, slots `visual`, default. Renders `<a class="bento-tile …" id data-pop={id} data-track="feature_popover_open" data-feature data-cta-position="feature-hub" aria-haspopup="dialog">`.
- Produces `BentoSmall` props `{ id; href; feature; icon: IconName; tone: 'amber'|'ink'|'sage'|'slate'|'clay'|'sand' }`, default slot (an `<h3>`). Same `data-pop`/tracking attributes, class `bento-small`.
- Produces `BentoIcon` props `{ name: IconName; tone; size?: 'tile'|'mark'|'pop' }`, `IconName` = `lock rail gesture key shield moon finger grip import mic restore down search pin house box seal half people`.
- Produces `FeaturePop` props `{ id; feature; href?: string; linkText?: string; demo?: boolean }`, slots `visual`, default. Renders `<article class="pop-body" id="pop-{id}" data-pop-body={id} hidden>` containing `.pop-stage[data-step="3"][aria-hidden="true"]` (with `.pop-steps` bars when `demo`), `.pop-copy`, and the link with `data-track="feature_cta_click" data-cta-position="feature-popover"`.
- Dialog shell ids/classes used by Task 3: `dialog#feature-pop.pop`, `.pop-scrim[data-pop-close]`, `.pop-card`, `.pop-close[data-pop-close]`, `.pop-content`, `button[data-pop-nav="-1"]` containing `[data-pop-prev]`, `button[data-pop-nav="1"]` containing `[data-pop-next]`. Each popover's eyebrow is `p.pop-eyebrow`, its title `h2#pop-{id}-title`.

- [ ] **Step 1: Write the failing structure test**

Create `test/site/features-bento.test.mjs`:

```js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const guides = ['island', 'start-page', 'glance', 'ad-blocking', 'private-tabs', 'command-palette', 'mouse-gestures',
  'reopen-closed-tabs', 'tab-groups', 'workspaces', 'vertical-tabs', 'quiet-tabs', 'profiles', 'sync', 'security', '1password'];
const keptIds = ['features-title', 'island', '1password', 'start-page', 'glance', 'ad-blocking', 'private-tabs', 'commands',
  'mouse-gestures', 'reopen-closed-tabs', 'tab-groups', 'workspaces', 'vertical-tabs', 'quiet-tabs', 'profiles', 'sync',
  'security', 'small-details-title', 'feature-patron-title', 'feature-close-title'];
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function contextFor(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1268, height: 900 }, reducedMotion: 'reduce', ...options });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await context.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  return context;
}

test('board keeps every anchor, every tile is a tracked link, and all 16 guides are reachable', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    for (const id of keptIds) assert.equal(await page.locator(`[id="${id}"]`).count(), 1, `#${id}`);
    const tiles = await page.locator('[data-pop]').evaluateAll(as => as.map(a => ({
      tag: a.tagName, id: a.id, pop: a.dataset.pop, href: a.getAttribute('href'),
      track: a.dataset.track, feature: a.dataset.feature, position: a.dataset.ctaPosition })));
    assert.equal(tiles.length, 33);
    for (const t of tiles) {
      assert.equal(t.tag, 'A', t.id);
      assert.equal(t.pop, t.id);
      assert.ok(t.href && t.track === 'feature_popover_open' && t.feature && t.position === 'feature-hub', t.id);
    }
    const reachable = new Set(await page.locator('a[href^="/features/"]').evaluateAll(as => as.map(a => a.getAttribute('href'))));
    for (const guide of guides) assert.ok(reachable.has(`/features/${guide}`), guide);
    assert.equal(await page.locator('.bento-tile').count(), 15);
    assert.equal(await page.locator('.bento-small').count(), 18);
    assert.equal(await page.locator('h1').innerText(), 'Everything in Blanc.');
  } finally { await context.close(); }
});

test('every popover article is in the HTML and hidden until opened', async () => {
  const context = await contextFor({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const pops = await page.locator('[data-pop]').evaluateAll(as => as.map(a => a.dataset.pop));
    for (const id of pops) {
      const article = page.locator(`#pop-${id}`);
      assert.equal(await article.count(), 1, id);
      assert.equal(await article.getAttribute('hidden'), '', `${id} hidden`);
      assert.ok((await page.locator(`#pop-${id}-title`).textContent()).trim().length > 10, `${id} title`);
    }
    assert.equal(await page.locator('dialog#feature-pop').evaluate(d => d.open), false);
  } finally { await context.close(); }
});

test('board proportions follow the measured Apple system at a 1220px board', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const m = await page.evaluate(() => {
      const board = document.querySelector('.bento-board'), tile = document.querySelector('.bento-tile'), label = document.querySelector('.bento-tile--white .bento-label h3');
      const bs = getComputedStyle(board), ts = getComputedStyle(tile);
      return { width: board.getBoundingClientRect().width, gap: parseFloat(bs.columnGap), radius: parseFloat(ts.borderTopLeftRadius),
        shadow: ts.boxShadow, label: parseFloat(getComputedStyle(label).fontSize), weight: getComputedStyle(label).fontWeight,
        shadows: [...document.querySelectorAll('.bento-tile, .bento-small')].filter(t => getComputedStyle(t).boxShadow !== 'none').length };
    });
    assert.ok(Math.abs(m.width - 1220) < 1, `board ${m.width}`);
    assert.ok(Math.abs(m.gap - 10.98) < 0.6, `gap ${m.gap}`);
    assert.ok(Math.abs(m.radius - 24.4) < 0.6, `radius ${m.radius}`);
    assert.ok(Math.abs(m.label - 15.62) < 0.6, `label ${m.label}`);
    assert.equal(m.weight, '500');
    assert.equal(m.shadows, 0, 'tiles have no shadows');
  } finally { await context.close(); }
});

test('features page never scrolls sideways', { timeout: 60000 }, async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    for (const width of [320, 390, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseURL}/features`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px overflows`);
    }
  } finally { await context.close(); }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run the **Site test loop** with `features-bento`. Expected: tests 1–3 FAIL (no `[data-pop]`), test 4 passes.

- [ ] **Step 3: Make the two derived images**

```bash
mkdir -p site/public/feature-hub
node -e "
const sharp = require('sharp');
(async () => {
  await sharp('site/public/demo-assets/start-page-sunrise.png').resize({ width: 1600 }).webp({ quality: 82 }).toFile('site/public/feature-hub/sunrise-hero.webp');
  await sharp('site/public/feature-captures/glance.png').webp({ quality: 85 }).toFile('site/public/feature-hub/glance.webp');
})();"
ls -la site/public/feature-hub
```
Expected: two files, each under 200 KB. Open both next to their sources and confirm the colours match (sharp converts to sRGB; if the sunrise visibly shifts, rerun with `.withMetadata()`).

Create `site/public/feature-hub/README.md`:

```markdown
# Features page derived images

Lighter copies of images already published on the site, used by `/features`.
Regenerate from the repository root with:

    node -e "const s=require('sharp');(async()=>{await s('site/public/demo-assets/start-page-sunrise.png').resize({width:1600}).webp({quality:82}).toFile('site/public/feature-hub/sunrise-hero.webp');await s('site/public/feature-captures/glance.png').webp({quality:85}).toFile('site/public/feature-hub/glance.webp');})()"

| File | Source |
|---|---|
| `sunrise-hero.webp` | `demo-assets/start-page-sunrise.png`, 1600px wide |
| `glance.webp` | `feature-captures/glance.png`, full size |
```

- [ ] **Step 4: Create `BentoIcon.astro`**

```astro
---
// Stroke icons for the Features page's small tiles and their popovers.
const PATHS = {
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  rail: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M5.5 8h1.5M5.5 11h1.5M5.5 14h1.5"/>',
  gesture: '<path d="M20 12H5m5-5-5 5 5 5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8m-3 3 2 2m-4 0 2 2"/>',
  shield: '<path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  finger: '<path d="M12 11v3m-4-4a4 4 0 0 1 8 0v4m-10-4a6 6 0 0 1 12 0v6M8 14v2a4 4 0 0 0 2 3.5"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  import: '<path d="M12 3v12m-5-5 5 5 5-5M4 19h16"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  down: '<path d="M12 4v10m-4-4 4 4 4-4"/><path d="M5 18h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.3-4.3"/>',
  pin: '<path d="M12 17v4M8 3h8l-1 6 3 3H6l3-3z"/>',
  house: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  box: '<rect x="3" y="4" width="18" height="16" rx="3" stroke-dasharray="3 2.5"/><rect x="7" y="8" width="10" height="8" rx="1.5"/>',
  seal: '<circle cx="12" cy="10" r="6"/><path d="m9 10 2 2 4-4M9 15l-1 6 4-2 4 2-1-6"/>',
  half: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M16 14a5 5 0 0 1 5.5 5"/>',
};
interface Props { name: keyof typeof PATHS; tone: 'amber' | 'ink' | 'sage' | 'slate' | 'clay' | 'sand'; size?: 'tile' | 'mark' | 'pop' }
const { name, tone, size = 'tile' } = Astro.props;
---
<span class:list={['bento-icon', `bento-icon--${tone}`, `bento-icon--${size}`]} aria-hidden="true">
  <svg viewBox="0 0 24 24" set:html={PATHS[name]} />
</span>
```

- [ ] **Step 5: Create `BentoTile.astro`**

```astro
---
// One board tile. It is a real link to the feature's guide; feature-bento.js
// turns a plain click into the popover. Visual first, label per the
// measured Apple rule (bottom on white, top on full-bleed tiles).
interface Props {
  id: string;
  href: string;
  feature: string;
  area: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
  tone?: 'white' | 'ink' | 'photo' | 'daylight' | 'hero' | 'gold';
  label?: 'bottom' | 'top' | 'center';
}
const { id, href, feature, area, tone = 'white', label = 'bottom' } = Astro.props;
---
<a class:list={['bento-tile', `bento-${area}`, `bento-tile--${tone}`, `bento-tile--label-${label}`]} id={id} href={href}
  data-pop={id} data-track="feature_popover_open" data-feature={feature} data-cta-position="feature-hub" aria-haspopup="dialog">
  <div class="bento-visual" aria-hidden="true"><slot name="visual" /></div>
  <div class="bento-label"><slot /></div>
</a>
```

- [ ] **Step 6: Create `BentoSmall.astro`**

```astro
---
// One dense-grid tile: icon top-left, two-line label bottom-left.
import BentoIcon from './BentoIcon.astro';
interface Props {
  id: string;
  href: string;
  feature: string;
  icon: Parameters<typeof BentoIcon>[0]['name'];
  tone: 'amber' | 'ink' | 'sage' | 'slate' | 'clay' | 'sand';
}
const { id, href, feature, icon, tone } = Astro.props;
---
<a class="bento-small" id={id} href={href} data-pop={id} data-track="feature_popover_open" data-feature={feature}
  data-cta-position="feature-hub" aria-haspopup="dialog">
  <BentoIcon name={icon} tone={tone} />
  <slot />
</a>
```

If Astro's type checker rejects `Parameters<typeof BentoIcon>`, replace it with the literal union `'lock' | 'rail' | 'gesture' | 'key' | 'shield' | 'moon' | 'finger' | 'grip' | 'import' | 'mic' | 'restore' | 'down' | 'search' | 'pin' | 'house' | 'box' | 'seal' | 'half' | 'people'`.

- [ ] **Step 7: Create `FeaturePop.astro`**

```astro
---
// One popover article. Server-rendered and hidden, so every explainer is in
// the page HTML; feature-bento.js shows one at a time inside #feature-pop.
interface Props { id: string; feature: string; href?: string; linkText?: string; demo?: boolean }
const { id, feature, href, linkText, demo = false } = Astro.props;
---
<article class="pop-body" id={`pop-${id}`} data-pop-body={id} aria-labelledby={`pop-${id}-title`} hidden>
  <div class="pop-stage" data-step="3" aria-hidden="true">
    <slot name="visual" />
    {demo && <div class="pop-steps"><i></i><i></i><i></i></div>}
  </div>
  <div class="pop-copy">
    <slot />
    {href && <a class="pop-link" href={href} data-track="feature_cta_click" data-feature={feature} data-cta-position="feature-popover">{linkText} <span aria-hidden="true">→</span></a>}
  </div>
</article>
```

- [ ] **Step 8: Create `features-bento.css`**

```css
/* Features page bento board (/features). Imported only by features.astro.
   Proportions are measured from Apple's WWDC feature-summary slides and
   expressed against the board width W: gutter .9%W, radius 2%W, one label
   size 1.28%W/500, display 2.2%W/700, hero 7.2%W; columns 1:1:1.36:1.36:1:1
   on 12 masonry rows. Tiles separate from the band by brightness alone. */
.bento-page {
  --W: min(1220px, calc(100vw - 48px));
  --bento-gap: calc(var(--W) * .009);
  --bento-radius: calc(var(--W) * .02);
  --bento-label: max(15px, calc(var(--W) * .0128));
  --bento-display: calc(var(--W) * .022);
  --bento-band: var(--site-surface);
  --bento-ink: var(--site-ink-warm);
  --bento-on-ink: #F3EAD8;
  --bento-on-ink-dim: #B9AD97;
  --bento-accent-a: #C2661C;
  --bento-accent-b: #7A4512;
  --bento-ui: max(11.5px, calc(var(--W) * .0098));
}

/* Header */
.bento-head { max-width: 860px; margin: 0 auto; padding: 88px 0 48px; text-align: center; }
.bento-head h1 { margin: 0; font-family: var(--site-font-display); font-size: clamp(44px, 6vw, 76px); font-weight: 400; letter-spacing: -0.02em; line-height: 1; }
.bento-lead { max-width: 52ch; margin: 18px auto 0; color: var(--site-text-dim); font-size: 16px; line-height: 1.6; }
.bento-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; font-family: var(--site-font-display); font-weight: 400; }

/* Band: full-bleed surface behind the board, no added scroll */
.bento-band { padding: calc(var(--bento-gap) * 4) 0 calc(var(--bento-gap) * 8); border-image: conic-gradient(var(--bento-band) 0 0) fill 0 / / 0 100vw; }

/* Board */
.bento-board { display: grid; width: var(--W); margin: 0 auto; gap: var(--bento-gap); grid-template-columns: 1fr 1fr 1.36fr 1.36fr 1fr 1fr; grid-template-rows: repeat(12, 1fr); aspect-ratio: 2000 / 1100; }
.bento-L1 { grid-area: 1 / 1 / 6 / 3; } .bento-L2 { grid-area: 6 / 1 / 9 / 2; } .bento-L3 { grid-area: 6 / 2 / 9 / 3; }
.bento-L4 { grid-area: 9 / 1 / 13 / 2; } .bento-L5 { grid-area: 9 / 2 / 13 / 3; }
.bento-C1 { grid-area: 1 / 3 / 5 / 5; } .bento-C2 { grid-area: 5 / 3 / 9 / 5; } .bento-C3 { grid-area: 9 / 3 / 11 / 4; }
.bento-C4 { grid-area: 11 / 3 / 13 / 4; } .bento-C5 { grid-area: 9 / 4 / 13 / 5; }
.bento-R1 { grid-area: 1 / 5 / 5 / 6; } .bento-R2 { grid-area: 1 / 6 / 5 / 7; } .bento-R3 { grid-area: 5 / 5 / 10 / 7; }
.bento-R4 { grid-area: 10 / 5 / 13 / 6; } .bento-R5 { grid-area: 10 / 6 / 13 / 7; }

.bento-tile { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; border-radius: var(--bento-radius); background: #FFFFFF; color: var(--site-text); text-align: center; text-decoration: none; transition: transform .12s ease-out; }
.bento-tile:active { transform: scale(.98); }
.bento-tile:focus-visible, .bento-small:focus-visible { outline: 2px solid var(--bento-accent-a); outline-offset: 3px; }
.bento-tile.is-source, .bento-small.is-source { visibility: hidden; }
.bento-tile--label-top { flex-direction: column-reverse; }
.bento-tile--label-center { justify-content: center; }
.bento-visual { position: relative; display: grid; flex: 1; place-items: center; min-height: 0; padding: 8%; }
.bento-tile--label-center .bento-visual { flex: none; padding: 0 0 .7em; }
.bento-tile--photo .bento-visual, .bento-tile--daylight .bento-visual, .bento-tile--hero .bento-visual { position: absolute; inset: 0; padding: 0; }
.bento-label { position: relative; padding: 0 8% calc(var(--bento-label) * 1.15); }
.bento-tile--label-top .bento-label { padding: calc(var(--bento-label) * 1.15) 8% 0; }
.bento-tile--label-center .bento-label { padding: 0 8%; }
.bento-label h3, .bento-label p { margin: 0; font-family: var(--font-ui); font-size: var(--bento-label); font-weight: 500; letter-spacing: -.01em; line-height: 1.2; text-wrap: balance; }
.bento-label p { margin-top: .3em; }
.bento-tile--ink { background: radial-gradient(130% 100% at 50% 0%, #2B251A 0%, var(--bento-ink) 65%); }
.bento-tile--ink, .bento-tile--photo { color: #FFFFFF; }
.bento-tile--photo::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, rgba(10, 8, 6, .62), transparent 48%); pointer-events: none; }
.bento-tile--photo.bento-tile--label-top::after { background: linear-gradient(rgba(10, 30, 20, .66), transparent 46%); }
.bento-tile--daylight::after { content: ""; position: absolute; inset: auto 0 0; height: 42%; background: linear-gradient(transparent, #FBEEDD 70%); pointer-events: none; }
.bento-tile--gold { background: linear-gradient(160deg, #F6D9A4 0%, #D9A04E 55%, #A8692A 100%); color: #2E1F08; }
.bento-tile--hero { background: #F3D9B6; }
.bento-tile::after { z-index: 1; }
.bento-tile .bento-label { z-index: 2; }

.bento-img { width: 100%; height: 100%; }
.bento-img--contain { object-fit: contain; }
.bento-img--cover { position: absolute; inset: 0; object-fit: cover; }
.bento-pos-mahjong { object-position: 50% 45%; }
.bento-pos-island { object-position: 50% 30%; }
.bento-pos-dawn { object-position: 50% 32%; transform: scale(1.6); transform-origin: 50% 30%; }
.bento-pos-sunrise { object-position: 50% 60%; }
.bento-object { width: 50%; height: auto; }

.bento-title { font-size: calc(var(--bento-display) * 1.05) !important; font-weight: 600 !important; letter-spacing: -.025em !important; }
.bento-word { font-family: var(--site-font-display) !important; font-size: calc(var(--W) * .072) !important; font-weight: 400 !important; line-height: 1 !important; letter-spacing: -.035em !important; color: rgba(255, 255, 255, .96); text-shadow: 0 2px 24px rgba(140, 80, 20, .35); }
.bento-display { font-size: var(--bento-display) !important; font-weight: 700 !important; letter-spacing: -.03em !important; line-height: 1.04 !important; }
.bento-accent { background: linear-gradient(170deg, var(--bento-accent-a), var(--bento-accent-b)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.bento-accent-wide { background: linear-gradient(90deg, #D07A22, #B24A2C 55%, var(--bento-accent-b)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.bento-fade { display: grid; justify-items: center; gap: .35em; font-family: var(--font-ui); font-weight: 600; letter-spacing: -.01em; }
.bento-fade span:nth-child(1), .bento-fade span:nth-child(5) { font-size: calc(var(--bento-label) * .8); color: #D5CCBD; }
.bento-fade span:nth-child(2), .bento-fade span:nth-child(4) { font-size: var(--bento-label); color: #B3A894; }
.bento-fade h3 { margin: .1em 0 !important; }
.bento-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: .4em; padding: 0 8%; font: 600 calc(var(--bento-label) * .85) var(--font-ui); }
.bento-chips span { padding: .3em .6em; border-radius: .6em; background: rgba(255, 255, 255, .1); color: var(--bento-on-ink); }
.bento-bubble { display: inline-flex; align-items: center; gap: .5em; padding: .6em .9em; border-radius: .9em; background: #FFFFFF; color: var(--site-text); font: 600 calc(var(--bento-label) * .9)/1.15 var(--font-ui); text-align: left; }
.bento-bubble b { display: grid; place-items: center; width: 1.9em; height: 1.9em; border-radius: .6em; background: var(--bento-ink); color: #F6D9A4; font-size: .8em; }

/* Mini product UI in tiles, always at reading size */
.ui { font: 500 var(--bento-ui)/1.3 var(--font-ui); color: #14120E; text-align: left; }
.ui-panel { width: 100%; overflow: hidden; border: 1px solid rgba(18, 16, 11, .08); border-radius: 1.1em; background: #FFFFFF; }
.ui-panel--narrow { max-width: 82%; }
.ui-sec { padding: .75em 1em .25em; font-size: .82em; color: #9A9080; }
.ui-row { display: flex; align-items: center; gap: .6em; padding: .5em 1em; }
.ui-row .ui-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-row .ui-m { color: #9A9080; font-size: .85em; }
.ui-row.is-on { background: #F4EFE7; }
.ui-fav { display: inline-grid; flex: none; place-items: center; width: 1.25em; height: 1.25em; border-radius: .3em; color: #FFFFFF; font-size: .72em; font-weight: 700; }
.ui-fav--a { background: #3F5BD8; } .ui-fav--b { background: #C4573A; } .ui-fav--c { background: #2F7D5B; } .ui-fav--d { background: #8A6A2F; } .ui-fav--e { background: #5B5B5B; }
.ui-quiet { animation: bento-quiet 6s ease-in-out infinite; }
.ui-quiet--2 { animation-delay: .5s; } .ui-quiet--3 { animation-delay: 1s; }
@keyframes bento-quiet { 0%, 25% { opacity: 1; } 45%, 85% { opacity: .28; } 100% { opacity: 1; } }
.ui-chips { display: grid; gap: .45em; width: 100%; }
.ui-chip { display: flex; align-items: center; justify-content: space-between; padding: .55em .8em; border-radius: .8em; font-weight: 600; }
.ui-chip--1 { background: #F6E2BF; color: #7A4E12; } .ui-chip--2 { margin-left: 12%; background: #F4EFE7; color: #6B6257; } .ui-chip--3 { margin-left: 24%; background: #F4EFE7; color: #6B6257; }
.ui-private { display: grid; gap: .9em; justify-items: center; }
.ui-private-pill { display: inline-flex; align-items: center; gap: .6em; padding: .55em .9em; border: 1.5px dashed #8E877A; border-radius: 1.1em; color: var(--bento-on-ink); font: 500 var(--bento-ui) var(--font-ui); white-space: nowrap; }
.ui-private-chip { padding: .05em .6em; border: 1px dashed #8E877A; border-radius: 99px; font-size: .85em; white-space: nowrap; }
.ui-private-note { color: var(--bento-on-ink-dim); text-align: center; }

/* Dense grid */
.bento-more { width: var(--W); margin: calc(var(--bento-gap) * 8) auto 0; }
.bento-more h2 { margin: 0 0 calc(var(--bento-gap) * 3); font-family: var(--site-font-display); font-size: clamp(30px, 3.4vw, 44px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.05; text-align: center; }
.bento-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: calc(var(--W) * .012); }
.bento-small { display: flex; flex-direction: column; justify-content: space-between; aspect-ratio: 307 / 162; padding: 7.5%; border-radius: calc(var(--W) * .015); background: #FFFFFF; color: var(--site-text); text-decoration: none; transition: transform .12s ease-out; }
.bento-small:active { transform: scale(.97); }
.bento-small h3 { margin: 0; font: 500 max(13.5px, calc(var(--W) * .0118))/1.25 var(--font-ui); letter-spacing: -.01em; }
.bento-icon { display: grid; place-items: center; aspect-ratio: 1; border-radius: 23%; color: #FFFFFF; }
.bento-icon--tile { width: 18%; }
.bento-icon--pop { width: 96px; }
.bento-icon--mark { width: calc(var(--W) * .034); }
.bento-icon svg { width: 58%; height: 58%; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
.bento-icon--amber { background: linear-gradient(160deg, #E6A64B, #B8702A); } .bento-icon--ink { background: linear-gradient(160deg, #3A342A, #12100B); }
.bento-icon--sage { background: linear-gradient(160deg, #82A682, #4D7356); } .bento-icon--slate { background: linear-gradient(160deg, #7F92B8, #4C5F86); }
.bento-icon--clay { background: linear-gradient(160deg, #D57A5D, #A3442F); } .bento-icon--sand { background: linear-gradient(160deg, #CDB891, #8F7445); }

/* Patron band */
.bento-patron { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(220px, .6fr); gap: clamp(40px, 7vw, 96px); align-items: end; padding: clamp(64px, 8vw, 96px) 0; color: var(--bento-on-ink); border-image: conic-gradient(var(--bento-ink) 0 0) fill 0 / / 0 100vw; }
.bento-patron .section-kicker { color: var(--site-gold-on-dark); }
.bento-patron-copy h2 { max-width: 13ch; margin: 0; font-family: var(--site-font-display); font-size: clamp(32px, 4vw, 50px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.04; }
.bento-patron-copy > p:last-child { max-width: 54ch; margin: 22px 0 0; color: var(--bento-on-ink-dim); font-size: 15px; line-height: 1.65; }
.bento-patron-offer { padding-left: 32px; border-left: 1px solid #3A3427; }
.bento-patron-price { margin: 0; letter-spacing: -.035em; }
.bento-patron-price strong { font-size: 40px; font-weight: 500; }
.bento-patron-price span, .bento-patron-offer > p:nth-child(2) { color: var(--bento-on-ink-dim); font-size: 12px; letter-spacing: 0; }
.bento-patron-offer > p:nth-child(2) { margin: 4px 0 0; }
.bento-patron .cta { width: 100%; margin-top: 24px; background: var(--site-gold-on-dark); color: var(--bento-ink); }
.bento-patron .text-link { margin-top: 16px; color: var(--bento-on-ink); border-bottom-color: #3A3427; }
.bento-patron .text-link > span[aria-hidden="true"] { color: var(--site-gold-on-dark); }

/* Popover */
.pop { width: 100vw; height: 100dvh; max-width: none; max-height: none; padding: 0; border: 0; background: transparent; overflow: hidden; }
.pop::backdrop { background: transparent; }
.pop-scrim { position: absolute; inset: 0; background: rgba(30, 24, 14, .26); backdrop-filter: blur(16px) saturate(140%); -webkit-backdrop-filter: blur(16px) saturate(140%); }
.pop-card { position: absolute; left: 50%; top: 50%; display: flex; flex-direction: column; width: min(880px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); overflow: hidden; border-radius: 28px; background: #FFFFFF; translate: -50% -50%; transform-origin: 0 0; will-change: transform; }
.pop-content { min-height: 0; overflow: auto; }
.pop-stage { position: relative; display: grid; place-items: center; height: 360px; padding: 32px; overflow: hidden; background: var(--bento-band); }
.pop-stage .ui { font-size: 13px; }
.pop-img { width: 100%; height: 100%; object-fit: contain; }
.pop-img--cover { position: absolute; inset: 0; object-fit: cover; }
.pop-pair { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; width: 86%; height: 100%; }
.pop-pair img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; }
.pop-word { position: relative; font-family: var(--site-font-display); font-size: 110px; line-height: 1; letter-spacing: -.035em; color: #FFFFFF; text-shadow: 0 2px 30px rgba(120, 70, 20, .35); }
.pop-copy { padding: 28px 40px 8px; }
.pop-eyebrow { margin: 0; font: 600 13px var(--font-ui); color: var(--bento-accent-a); }
.pop-copy h2 { max-width: 24ch; margin: 6px 0 0; font-family: var(--site-font-display); font-size: clamp(28px, 3.4vw, 40px); font-weight: 400; letter-spacing: -.02em; line-height: 1.06; text-wrap: balance; }
.pop-copy p:not(.pop-eyebrow) { max-width: 64ch; margin: 12px 0 0; color: var(--site-text-dim); font-size: 15px; line-height: 1.6; }
.pop-copy .pop-note { font-size: 13px; }
.pop-link { display: inline-flex; gap: 6px; margin-top: 16px; color: var(--site-text); font-weight: 600; font-size: 14px; text-decoration: none; }
.pop-link span { color: var(--bento-accent-a); }
.pop-nav { display: flex; justify-content: space-between; gap: 12px; padding: 18px 40px 24px; }
.pop-nav button, .pop-close { height: 36px; padding: 0 15px; border: 0; border-radius: 99px; background: var(--bento-band); color: var(--site-text); font: 500 13px var(--font-ui); cursor: pointer; }
.pop-nav button:active, .pop-close:active { transform: scale(.96); }
.pop-nav button:focus-visible, .pop-close:focus-visible, .pop-link:focus-visible { outline: 2px solid var(--bento-accent-a); outline-offset: 2px; }
.pop-close { position: absolute; top: 16px; right: 16px; z-index: 2; display: grid; place-items: center; width: 36px; padding: 0; background: rgba(255, 255, 255, .82); backdrop-filter: blur(10px); }
.pop-close svg { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2; }
.pop-steps { position: absolute; bottom: 14px; left: 50%; display: flex; gap: 6px; translate: -50% 0; }
.pop-steps i { width: 22px; height: 3px; border-radius: 2px; background: rgba(0, 0, 0, .12); }
.pop-steps i.is-on { background: var(--bento-accent-a); }

@media (max-width: 900px) {
  .bento-page { --W: calc(100vw - 32px); --bento-gap: 10px; --bento-radius: 20px; --bento-label: 15px; --bento-display: 24px; }
  .bento-board { grid-template-columns: 1fr 1fr; grid-template-rows: none; grid-auto-rows: 200px; aspect-ratio: auto; }
  .bento-board > .bento-tile { grid-area: auto; }
  .bento-board > .bento-L1, .bento-board > .bento-C1, .bento-board > .bento-C2, .bento-board > .bento-R3 { grid-column: 1 / 3; }
  .bento-word { font-size: 72px !important; }
  .bento-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bento-small { aspect-ratio: auto; min-height: 120px; gap: 18px; }
  .bento-icon--tile { width: 40px; }
  .pop-stage { height: 250px; padding: 20px; }
  .pop-copy { padding: 22px 20px 6px; }
  .pop-nav { padding: 14px 20px 20px; }
  .pop-word { font-size: 72px; }
  .bento-patron { grid-template-columns: 1fr; gap: 36px; }
  .bento-patron-offer { padding: 28px 0 0; border-top: 1px solid #3A3427; border-left: 0; }
}
@media (max-width: 420px) {
  .bento-board { grid-template-columns: 1fr; grid-auto-rows: 220px; }
  .bento-board > .bento-L1, .bento-board > .bento-C1, .bento-board > .bento-C2, .bento-board > .bento-R3 { grid-column: auto; }
}
@media (prefers-reduced-motion: reduce) {
  .bento-tile, .bento-small { transition: none; }
  .ui-quiet { animation: none; }
}
@media (prefers-reduced-transparency: reduce) {
  .pop-scrim { background: rgba(30, 24, 14, .6); backdrop-filter: none; -webkit-backdrop-filter: none; }
  .pop-close { background: #FFFFFF; backdrop-filter: none; }
}
```

The `!important` declarations exist only so the display variants of `.bento-label h3` win over its base rule regardless of selector order; keep them limited to these four classes.

- [ ] **Step 9: Write `features.astro`**

Save the old file first: `git show HEAD:site/src/pages/features.astro > "$TMPDIR/old-features.astro"`. Then write the new page. Copy the Patron section's three text elements (`section-kicker`, `h2#feature-patron-title`, paragraph), its offer `<p>or $4 monthly</p>` and two `<a>` elements, and the whole `feature-close` section **byte-for-byte** from the old file (lines 125–127, 131–133, 137–141), changing only `feature-patron-*` class names to `bento-patron-*`.

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import BentoTile from '../components/bento/BentoTile.astro';
import BentoSmall from '../components/bento/BentoSmall.astro';
import BentoIcon from '../components/bento/BentoIcon.astro';
import FeaturePop from '../components/bento/FeaturePop.astro';
import '../styles/features-bento.css';
---
<BaseLayout
  title={"Blanc Browser Features — Minimal browsing, built in"}
  description={"Explore Blanc’s mouse gestures, Start Page and Mahjong, Glance, tab recovery, local profiles, Named Workspaces, built-in blocking, encrypted sync, and more."}
  path="/features"
  page="features"
  current="features"
  ogDescription={"A focused desktop browser with customizable mouse gestures, Glance, built-in blocking, Named Groups, Quiet Tabs, encrypted sync, and structural security."}
>
  <script type="application/ld+json" is:inline slot="head">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://blancbrowser.com/" },
    { "@type": "ListItem", "position": 2, "name": "Features", "item": "https://blancbrowser.com/features" }
  ]
}
</script>

<main id="main-content" class="feature-page bento-page">
  <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">home</a><span aria-hidden="true">/</span><span aria-current="page">features</span></nav>

  <header class="bento-head">
    <p class="section-kicker">A little less browser.</p>
    <h1 id="features-title">Everything in Blanc.</h1>
    <p class="bento-lead">Click any feature to see it and read what it does. You decide which tabs belong together; Blanc does not sort or group them for you.</p>
  </header>

  <section class="bento-band" aria-labelledby="bento-title">
    <h2 class="bento-sr" id="bento-title">Blanc’s main features.</h2>
    <div class="bento-board">
      <BentoTile id="glance" href="/features/glance" feature="glance" area="L1">
        <img slot="visual" class="bento-img bento-img--contain" src="/feature-hub/glance.webp" width="1440" height="900" alt="" />
        <h3>View two tabs side by side with Glance</h3>
      </BentoTile>
      <BentoTile id="island" href="/features/island" feature="island" area="C1" tone="photo">
        <img slot="visual" class="bento-img bento-img--cover bento-pos-island" src="/revamp/island-roman-rest-800.webp" width="800" height="571" alt="" />
        <h3 class="bento-title">The Island</h3>
        <p>Tabs, search and page controls in one bar</p>
      </BentoTile>
      <BentoTile id="quiet-tabs" href="/features/quiet-tabs" feature="quiet-tabs" area="R1">
        <div slot="visual" class="ui ui-panel">
          <div class="ui-sec">trip · 5 tabs</div>
          <div class="ui-row is-on"><span class="ui-fav ui-fav--a">W</span><span class="ui-t">Typography</span></div>
          <div class="ui-row ui-quiet"><span class="ui-fav ui-fav--e">V</span><span class="ui-t">Copenhagen</span></div>
          <div class="ui-row"><span class="ui-fav ui-fav--c">R</span><span class="ui-t">Radio</span><span class="ui-m">♪</span></div>
          <div class="ui-row ui-quiet ui-quiet--2"><span class="ui-fav ui-fav--b">L</span><span class="ui-t">Louisiana</span></div>
          <div class="ui-row ui-quiet ui-quiet--3"><span class="ui-fav ui-fav--d">F</span><span class="ui-t">Flights</span></div>
        </div>
        <h3>Quiet Tabs free memory from unused tabs</h3>
      </BentoTile>
      <BentoTile id="wallpaper" href="/features/start-page" feature="time-of-day-wallpaper" area="R2" tone="daylight">
        <img slot="visual" class="bento-img bento-img--cover bento-pos-dawn" src="/feature-captures/home-wallpaper-dawn-v1.25.0.webp" width="1440" height="900" alt="" />
        <h3>A Start Page that follows the time of day</h3>
      </BentoTile>
      <BentoTile id="ad-blocking" href="/features/ad-blocking" feature="ad-blocking" area="L2">
        <img slot="visual" class="bento-object" src="/blocker-shield-bronze.webp" width="960" height="960" alt="" />
        <h3>Ads and trackers blocked by default</h3>
      </BentoTile>
      <BentoTile id="mahjong" href="/features/start-page" feature="mahjong" area="L3" tone="photo" label="top">
        <img slot="visual" class="bento-img bento-img--cover bento-pos-mahjong" src="/feature-captures/mahjong-v1.21.0.webp" width="1440" height="900" alt="" loading="lazy" />
        <h3>Mahjong on every Start Page</h3>
      </BentoTile>
      <BentoTile id="blanc" href="/download" feature="blanc" area="C2" tone="hero" label="center">
        <img slot="visual" class="bento-img bento-img--cover bento-pos-sunrise" src="/feature-hub/sunrise-hero.webp" width="1600" height="1001" alt="" />
        <p class="bento-word">Blanc</p>
      </BentoTile>
      <BentoTile id="reopen-closed-tabs" href="/features/reopen-closed-tabs" feature="reopen-closed-tabs" area="R3">
        <div slot="visual" class="ui ui-panel ui-panel--narrow">
          <div class="ui-sec">this window · 3 tabs</div>
          <div class="ui-row"><span class="ui-fav ui-fav--a">W</span><span class="ui-t">Typography — Wikipedia</span></div>
          <div class="ui-row"><span class="ui-fav ui-fav--e">V</span><span class="ui-t">Visit Copenhagen — Guide</span></div>
          <div class="ui-row"><span class="ui-fav ui-fav--c">F</span><span class="ui-t">Flight search</span></div>
          <div class="ui-sec">⌄ recently closed 2</div>
          <div class="ui-row is-on"><span class="ui-fav ui-fav--b">L</span><span class="ui-t">Louisiana Museum — Exhibitions</span><span class="ui-m">just now</span></div>
          <div class="ui-row"><span>▸</span><span class="ui-t">research · 4 tabs</span><span class="ui-m">2 min</span></div>
        </div>
        <h3>Reopen closed tabs, even whole groups</h3>
      </BentoTile>
      <BentoTile id="private-tabs" href="/features/private-tabs" feature="private-tabs" area="L4" tone="ink" label="top">
        <div slot="visual" class="ui ui-private"><span class="ui-private-pill">louisiana.dk <span class="ui-private-chip">private ×</span></span><span class="ui-private-note">History stays untouched</span></div>
        <h3>Private tabs stay out of history</h3>
      </BentoTile>
      <BentoTile id="profiles" href="/features/profiles" feature="profiles" area="L5" label="center">
        <BentoIcon slot="visual" name="people" tone="ink" size="mark" />
        <h3 class="bento-display bento-accent">Separate profiles for work and personal browsing</h3>
      </BentoTile>
      <BentoTile id="commands" href="/features/command-palette" feature="command-palette" area="C3" label="center">
        <h3 class="bento-display bento-accent-wide">Quick Switcher</h3>
        <p>Press ⌘L to find any tab</p>
      </BentoTile>
      <BentoTile id="slash-commands" href="/features/command-palette" feature="slash-commands" area="C4" tone="ink" label="top">
        <div slot="visual" class="bento-chips"><span>/private</span><span>/group</span><span>/reopen</span><span>/sleep</span><span>/find</span></div>
        <h3>Type / to run commands</h3>
      </BentoTile>
      <BentoTile id="start-page" href="/features/start-page" feature="start-page" area="C5" label="center">
        <div class="bento-fade"><span aria-hidden="true">Ledger</span><span aria-hidden="true">Billboard</span><h3 class="bento-display bento-accent">Four Start Page layouts</h3><span aria-hidden="true">Shelf</span><span aria-hidden="true">Tally</span></div>
      </BentoTile>
      <BentoTile id="tab-groups" href="/features/tab-groups" feature="tab-groups" area="R4">
        <div slot="visual" class="ui ui-chips"><span class="ui-chip ui-chip--1">trip <span>3 tabs</span></span><span class="ui-chip ui-chip--2">work <span>4</span></span><span class="ui-chip ui-chip--3">reading <span>2</span></span></div>
        <h3>Named Groups keep tasks together</h3>
      </BentoTile>
      <BentoTile id="workspaces" href="/features/workspaces" feature="named-workspaces" area="R5" tone="gold">
        <span slot="visual" class="bento-bubble"><b>P</b>Thesis<br />6 tabs</span>
        <h3>Named Workspaces save whole windows</h3>
        <p>Patron</p>
      </BentoTile>
    </div>

    <div class="bento-more">
      <h2 id="small-details-title">Smaller details that matter.</h2>
      <div class="bento-grid">
        <BentoSmall id="sync" href="/features/sync" feature="sync" icon="lock" tone="ink"><h3>Encrypted sync across devices</h3></BentoSmall>
        <BentoSmall id="vertical-tabs" href="/features/vertical-tabs" feature="vertical-tabs" icon="rail" tone="slate"><h3>Optional vertical tab rail</h3></BentoSmall>
        <BentoSmall id="mouse-gestures" href="/features/mouse-gestures" feature="mouse-gestures" icon="gesture" tone="amber"><h3>Mouse gestures</h3></BentoSmall>
        <BentoSmall id="1password" href="/features/1password" feature="1password" icon="key" tone="slate"><h3>1Password fill on Mac</h3></BentoSmall>
        <BentoSmall id="ublock-origin" href="/features/ad-blocking" feature="ublock-origin" icon="shield" tone="clay"><h3>Full uBlock Origin, optional</h3></BentoSmall>
        <BentoSmall id="dark-websites" href="/features/ad-blocking" feature="dark-websites" icon="moon" tone="ink"><h3>Dark websites</h3></BentoSmall>
        <BentoSmall id="passkeys" href="/features/security" feature="passkeys" icon="finger" tone="sage"><h3>Touch ID passkeys on Mac</h3></BentoSmall>
        <BentoSmall id="drag-to-reorder" href="/features/tab-groups" feature="drag-to-reorder" icon="grip" tone="sand"><h3>Drag tabs into order</h3></BentoSmall>
        <BentoSmall id="import" href="/support#bookmark-import" feature="import" icon="import" tone="amber"><h3>Import your bookmarks</h3></BentoSmall>
        <BentoSmall id="capture" href="/features/security" feature="capture-indicator" icon="mic" tone="clay"><h3>Camera and mic indicator</h3></BentoSmall>
        <BentoSmall id="recovery" href="/features/security" feature="recovery" icon="restore" tone="sage"><h3>Restore after a crash</h3></BentoSmall>
        <BentoSmall id="downloads" href="/support" feature="downloads" icon="down" tone="slate"><h3>Resume downloads</h3></BentoSmall>
        <BentoSmall id="search-engine" href="/features/command-palette" feature="search-engine" icon="search" tone="sand"><h3>Choose your search engine</h3></BentoSmall>
        <BentoSmall id="pin-mute" href="/features/island" feature="pin-mute" icon="pin" tone="ink"><h3>Pin and mute tabs</h3></BentoSmall>
        <BentoSmall id="default-browser" href="/download" feature="default-browser" icon="house" tone="clay"><h3>Set Blanc as default browser</h3></BentoSmall>
        <BentoSmall id="security" href="/features/security" feature="security" icon="box" tone="sage"><h3>Sandboxed pages</h3></BentoSmall>
        <BentoSmall id="signed-releases" href="/features/security" feature="signed-releases" icon="seal" tone="sand"><h3>Signed, verifiable releases</h3></BentoSmall>
        <BentoSmall id="themes" href="/features/island" feature="themes" icon="half" tone="slate"><h3>Light, dark or system</h3></BentoSmall>
      </div>
    </div>
  </section>

  <dialog class="pop" id="feature-pop">
    <div class="pop-scrim" data-pop-close></div>
    <div class="pop-card">
      <button class="pop-close" type="button" data-pop-close aria-label="Close"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2 2 12" /></svg></button>
      <div class="pop-content">
        <!-- Board popovers -->
        <FeaturePop id="glance" feature="glance" href="/features/glance" linkText="Read more about Glance">
          <img slot="visual" class="pop-img" src="/feature-hub/glance.webp" width="1440" height="900" alt="" loading="lazy" />
          <p class="pop-eyebrow">Glance</p>
          <h2 id="pop-glance-title">View two tabs side by side with Glance.</h2>
          <p>Choose another tab from this window to open beside your page. Drag the divider to resize, swap the two sides, or close the reference when you are done.</p>
          <p class="pop-note">Glance is never restored after a restart or synced.</p>
        </FeaturePop>
        <FeaturePop id="island" feature="island" href="/features/island" linkText="Read more about the Island">
          <img slot="visual" class="pop-img" src="/revamp/island-roman-tabs-800.webp" width="800" height="571" alt="" loading="lazy" />
          <p class="pop-eyebrow">The Island</p>
          <h2 id="pop-island-title">The Island puts tabs, search and page controls in one compact bar.</h2>
          <p>Blanc replaces the tab strip and toolbar with one Island in a slim band above the page. Open it to switch tabs, search or run a command, then close it to get back to the page.</p>
          <p class="pop-note">The resting Island keeps its own band above the page; the panel opens over the page.</p>
        </FeaturePop>
        <FeaturePop id="quiet-tabs" feature="quiet-tabs" href="/features/quiet-tabs" linkText="Read more about Quiet Tabs" demo>
          <div slot="visual" class="demo-slot" data-demo="quiet"></div>
          <p class="pop-eyebrow">Quiet Tabs</p>
          <h2 id="pop-quiet-tabs-title">Quiet Tabs free up memory without closing the tab.</h2>
          <p>When a background tab has gone unused for an hour (the default), Blanc releases the memory its page was using and dims it in the Island. Open it again and the page reloads with its address, title and back button. Choose 30 minutes, 1 hour, 6 hours or Off in Settings.</p>
          <p class="pop-note">Tabs playing sound, pinned tabs and pages with a half-filled form stay loaded. A quiet tab reloads; it does not resume exactly where the page’s scripts left off.</p>
        </FeaturePop>
        <FeaturePop id="wallpaper" feature="time-of-day-wallpaper" href="/features/start-page" linkText="Read more about the Start Page">
          <div slot="visual" class="pop-pair"><img src="/feature-captures/home-wallpaper-dawn-v1.25.0.webp" width="1440" height="900" alt="" loading="lazy" /><img src="/feature-captures/home-wallpaper-day-v1.25.0.webp" width="1440" height="900" alt="" loading="lazy" /><img src="/feature-captures/home-wallpaper-dusk-v1.25.0.webp" width="1440" height="900" alt="" loading="lazy" /><img src="/feature-captures/home-wallpaper-night-v1.25.0.webp" width="1440" height="900" alt="" loading="lazy" /></div>
          <p class="pop-eyebrow">Time-of-day wallpaper</p>
          <h2 id="pop-wallpaper-title">A Start Page that follows the time of day.</h2>
          <p>Turn on time-of-day wallpaper in Settings → General, and the Start Page artwork moves through dawn, day, dusk and night with your computer’s clock.</p>
          <p class="pop-note">The wallpaper setting stays on this device.</p>
        </FeaturePop>
        <FeaturePop id="ad-blocking" feature="ad-blocking" href="/features/ad-blocking" linkText="Read more about blocking" demo>
          <div slot="visual" class="demo-slot" data-demo="shield"></div>
          <p class="pop-eyebrow">Ad and tracker blocking</p>
          <h2 id="pop-ad-blocking-title">Block ads and trackers from the first page, with a switch for each site.</h2>
          <p>Blanc Blocker is built in and on by default, using EasyList and EasyPrivacy. Click the shield on the Island to see how many requests it blocked on this page and whether the connection uses HTTPS, or to turn blocking off for just this site.</p>
          <p class="pop-note">Blocking reduces ads and known tracking; no blocker removes all of them. The count shown here is a sample. Prefer uBlock Origin? Choose it from the same shield on supported builds, then restart Blanc.</p>
        </FeaturePop>
        <FeaturePop id="mahjong" feature="mahjong" href="/features/start-page" linkText="Read more about the Start Page">
          <img slot="visual" class="pop-img" src="/feature-captures/mahjong-v1.21.0.webp" width="1440" height="900" alt="" loading="lazy" />
          <p class="pop-eyebrow">Mahjong</p>
          <h2 id="pop-mahjong-title">Play Mahjong from any Start Page.</h2>
          <p>Every Start Page footer opens Mahjong in its own tab, with eight boards, a Daily deal, hints, undo and records kept on this device.</p>
          <p class="pop-note">Mahjong is offline and single-player; nothing is synced.</p>
        </FeaturePop>
        <FeaturePop id="blanc" feature="blanc" href="/download" linkText="Download Blanc">
          <img slot="visual" class="pop-img pop-img--cover" src="/feature-hub/sunrise-hero.webp" width="1600" height="1001" alt="" loading="lazy" />
          <p class="pop-eyebrow">Blanc</p>
          <h2 id="pop-blanc-title">A little less browser.</h2>
          <p>Blanc is a desktop browser for macOS, Windows and Linux that keeps its controls in one small Island, blocks ads and trackers by default, and stays out of the way of the page you came for. It is free and open source.</p>
          <p class="pop-note">Built by Bananify, an independent studio.</p>
        </FeaturePop>
        <FeaturePop id="reopen-closed-tabs" feature="reopen-closed-tabs" href="/features/reopen-closed-tabs" linkText="Read more about reopening tabs" demo>
          <div slot="visual" class="demo-slot" data-demo="reopen"></div>
          <p class="pop-eyebrow">Reopen Closed Tab</p>
          <h2 id="pop-reopen-closed-tabs-title">Reopen a closed tab or a whole group, sometimes without a reload.</h2>
          <p>Press ⌘⇧T, type /reopen, or choose from Recently Closed in the Island. For about 30 seconds, one eligible tab you closed can come back without loading again, which can keep its scroll position and the text you were typing.</p>
          <p class="pop-note">On Windows and Linux, press Ctrl+Shift+T. After that window the tab reloads from a saved snapshot or its address. Each window keeps up to 25 entries for an hour, and private tabs are never recorded.</p>
        </FeaturePop>
        <FeaturePop id="private-tabs" feature="private-tabs" href="/features/private-tabs" linkText="Read more about private tabs" demo>
          <div slot="visual" class="demo-slot" data-demo="private"></div>
          <p class="pop-eyebrow">Private tabs</p>
          <h2 id="pop-private-tabs-title">Private tabs keep your visits out of Blanc’s history.</h2>
          <p>Press ⌘⇧N or type /private. Pages you visit are not saved to history, are not restored after a restart, and never appear in Recently Closed. The Island changes so you can see you are private, and its chip closes the tab when you are done.</p>
          <p class="pop-note">On Windows and Linux, press Ctrl+Shift+N. Private does not mean anonymous: websites, your network or an employer can still see activity, and files you download stay on disk.</p>
        </FeaturePop>
        <FeaturePop id="profiles" feature="profiles" href="/features/profiles" linkText="Read more about profiles">
          <img slot="visual" class="pop-img" src="/feature-captures/profiles.png" width="1440" height="900" alt="" loading="lazy" />
          <p class="pop-eyebrow">Profiles</p>
          <h2 id="pop-profiles-title">Profiles keep work and personal browsing apart.</h2>
          <p>Create named profiles, each with its own cookies, site data, Favorites, history, download list and remembered permissions, opening in its own windows.</p>
          <p class="pop-note">Settings and Patron are shared by every profile on this device.</p>
        </FeaturePop>
        <FeaturePop id="commands" feature="command-palette" href="/features/command-palette" linkText="Read more about the Quick Switcher" demo>
          <div slot="visual" class="demo-slot" data-demo="switcher"></div>
          <p class="pop-eyebrow">Quick Switcher</p>
          <h2 id="pop-commands-title">Press ⌘L to find any tab, or type / to run a command.</h2>
          <p>The Quick Switcher searches your open tabs, Favorites, history and Named Groups as you type, so you can jump to a page without hunting through a tab strip.</p>
          <p class="pop-note">On Windows and Linux, press Ctrl+L. For search text, Enter opens the highlighted result; choose the result showing your exact text to search the web.</p>
        </FeaturePop>
        <FeaturePop id="slash-commands" feature="slash-commands" href="/features/command-palette" linkText="See every command">
          <img slot="visual" class="pop-img" src="/revamp/island-roman-command-800.webp" width="800" height="571" alt="" loading="lazy" />
          <p class="pop-eyebrow">Slash commands</p>
          <h2 id="pop-slash-commands-title">Type / to run a browser command.</h2>
          <p>In the Island, type / to see every command, then keep typing to narrow the list: /private opens a private tab, /group moves this tab into a group, /sleep quiets background tabs and /allow-ads lets one site through.</p>
          <p class="pop-note">Commands act only when you choose them.</p>
        </FeaturePop>
        <FeaturePop id="start-page" feature="start-page" href="/features/start-page" linkText="Read more about the Start Page">
          <div slot="visual" class="pop-pair"><img src="/feature-captures/ledger-v1.21.0.webp" width="1440" height="900" alt="" loading="lazy" /><img src="/feature-captures/billboard-v1.21.0.webp" width="1440" height="900" alt="" loading="lazy" /><img src="/feature-captures/shelf-v1.21.0.webp" width="1440" height="900" alt="" loading="lazy" /><img src="/feature-captures/tally-v1.21.0.webp" width="1440" height="900" alt="" loading="lazy" /></div>
          <p class="pop-eyebrow">Start Page</p>
          <h2 id="pop-start-page-title">Choose your Start Page layout.</h2>
          <p>Pick Ledger, Billboard, Shelf or Tally for new tabs. Billboard brings your frequent sites from local history, and Tally puts a big clock front and centre.</p>
          <p class="pop-note">Your layout choice can follow you through Sync; history stays on this device.</p>
        </FeaturePop>
        <FeaturePop id="tab-groups" feature="tab-groups" href="/features/tab-groups" linkText="Read more about Named Groups">
          <div slot="visual" class="ui ui-chips pop-chips"><span class="ui-chip ui-chip--1">trip <span>3 tabs</span></span><span class="ui-chip ui-chip--2">work <span>4</span></span><span class="ui-chip ui-chip--3">reading <span>2</span></span></div>
          <p class="pop-eyebrow">Named Groups</p>
          <h2 id="pop-tab-groups-title">Named Groups keep a task’s tabs together.</h2>
          <p>Create a group with /group and a name, or from a tab’s right-click menu. The Island shows the current group’s tabs as dots, and other groups fold away in the ⌘L panel. Drag tabs and groups into the order you want.</p>
          <p class="pop-note">You name and fill every group. Blanc never sorts or groups tabs for you.</p>
        </FeaturePop>
        <FeaturePop id="workspaces" feature="named-workspaces" href="/features/workspaces" linkText="Read more about Named Workspaces">
          <img slot="visual" class="pop-img" src="/feature-captures/workspaces.png" width="1440" height="900" alt="" loading="lazy" />
          <p class="pop-eyebrow">Named Workspaces · Patron</p>
          <h2 id="pop-workspaces-title">Named Workspaces save a whole window to return to by name.</h2>
          <p>Save a window’s tabs and groups as a Named Workspace and switch back to it later by name. A saved workspace keeps itself up to date as you browse.</p>
          <p class="pop-note">Creating and saving workspaces needs an active Patron membership. Saved workspaces stay usable if it ends.</p>
        </FeaturePop>
        <!-- Dense-grid popovers -->
        <FeaturePop id="sync" feature="sync" href="/features/sync" linkText="Read more about sync">
          <BentoIcon slot="visual" name="lock" tone="ink" size="pop" />
          <p class="pop-eyebrow">Sync</p>
          <h2 id="pop-sync-title">Sync Favorites and settings across your devices.</h2>
          <p>Turn on Sync from your Personal profile to carry Favorites and settings to your other devices, and optionally see what each device has open. It is end-to-end encrypted.</p>
          <p class="pop-note">History, cookies and private tabs are never synced.</p>
        </FeaturePop>
        <FeaturePop id="vertical-tabs" feature="vertical-tabs" href="/features/vertical-tabs" linkText="Read more about vertical tabs">
          <BentoIcon slot="visual" name="rail" tone="slate" size="pop" />
          <p class="pop-eyebrow">Vertical tabs</p>
          <h2 id="pop-vertical-tabs-title">Show your tabs in an optional vertical list.</h2>
          <p>Turn on the vertical tab rail for a resizable overview on the left. Drag tabs and groups in the rail to reorder them. The Island stays for search and commands.</p>
          <p class="pop-note">The rail is optional; the Island is always there.</p>
        </FeaturePop>
        <FeaturePop id="mouse-gestures" feature="mouse-gestures" href="/features/mouse-gestures" linkText="Read more about mouse gestures">
          <BentoIcon slot="visual" name="gesture" tone="amber" size="pop" />
          <p class="pop-eyebrow">Mouse gestures</p>
          <h2 id="pop-mouse-gestures-title">Navigate with mouse gestures.</h2>
          <p>Turn them on in Settings, then hold the right mouse button and draw, or hold Alt/Option and drag with one finger on a trackpad. Assign your own patterns to Back, Forward, Reload and more.</p>
          <p class="pop-note">Gestures are off until you turn them on, and they stay on this device.</p>
        </FeaturePop>
        <FeaturePop id="1password" feature="1password" href="/features/1password" linkText="Read more about 1Password">
          <BentoIcon slot="visual" name="key" tone="slate" size="pop" />
          <p class="pop-eyebrow">1Password · macOS</p>
          <h2 id="pop-1password-title">Fill logins from 1Password on macOS.</h2>
          <p>Turn on the integration in Settings, then press ⌥⌘P on a login form to fill a matching login from your installed 1Password app.</p>
          <p class="pop-note">macOS only. Blanc never fills anything automatically.</p>
        </FeaturePop>
        <FeaturePop id="ublock-origin" feature="ublock-origin" href="/features/ad-blocking" linkText="Read more about uBlock Origin">
          <BentoIcon slot="visual" name="shield" tone="clay" size="pop" />
          <p class="pop-eyebrow">uBlock Origin</p>
          <h2 id="pop-ublock-origin-title">Prefer uBlock Origin? Choose it from the shield.</h2>
          <p>Click the shield on the Island, choose uBlock Origin, then restart Blanc. You get its popup, dashboard, logger, element picker and filter lists for regular tabs.</p>
          <p class="pop-note">Private tabs always use Blanc Blocker. Available on supported Mac, Windows and Linux builds.</p>
        </FeaturePop>
        <FeaturePop id="dark-websites" feature="dark-websites" href="/features/ad-blocking" linkText="Read more about site controls">
          <BentoIcon slot="visual" name="moon" tone="ink" size="pop" />
          <p class="pop-eyebrow">Dark websites</p>
          <h2 id="pop-dark-websites-title">Darken websites that have no dark mode.</h2>
          <p>Turn on Dark websites while Blanc is dark, and pages without their own dark mode are darkened as they load. Switch it per site from the shield.</p>
          <p class="pop-note">Off by default. Embedded frames keep their colors.</p>
        </FeaturePop>
        <FeaturePop id="passkeys" feature="passkeys" href="/features/security" linkText="Read more about security">
          <BentoIcon slot="visual" name="finger" tone="sage" size="pop" />
          <p class="pop-eyebrow">Touch ID passkeys</p>
          <h2 id="pop-passkeys-title">Sign in with passkeys and Touch ID on a Mac.</h2>
          <p>On a Mac, Blanc can create passkeys secured by Touch ID that stay on your device.</p>
          <p class="pop-note">Blanc passkeys do not read passkeys saved in other apps.</p>
        </FeaturePop>
        <FeaturePop id="drag-to-reorder" feature="drag-to-reorder" href="/features/tab-groups" linkText="Read more about Named Groups">
          <BentoIcon slot="visual" name="grip" tone="sand" size="pop" />
          <p class="pop-eyebrow">Drag to reorder</p>
          <h2 id="pop-drag-to-reorder-title">Drag tabs and groups into the order you want.</h2>
          <p>In the Island panel or the vertical rail, drag a tab within its group, into another group or out of one, or drag a group header to move the whole group.</p>
          <p class="pop-note">On a Mac, press Option+Shift+Up or Down; on Windows and Linux, Alt+Shift+Up or Down.</p>
        </FeaturePop>
        <FeaturePop id="import" feature="import" href="/support#bookmark-import" linkText="How importing works">
          <BentoIcon slot="visual" name="import" tone="amber" size="pop" />
          <p class="pop-eyebrow">Import</p>
          <h2 id="pop-import-title">Bring your Favorites with you.</h2>
          <p>Import bookmarks from a browser profile Blanc detects, or from an HTML file, in Favorites.</p>
          <p class="pop-note">Importing happens on your device.</p>
        </FeaturePop>
        <FeaturePop id="capture" feature="capture-indicator" href="/features/security" linkText="Read more about call controls">
          <BentoIcon slot="visual" name="mic" tone="clay" size="pop" />
          <p class="pop-eyebrow">Camera and microphone</p>
          <h2 id="pop-capture-title">See and stop camera and microphone use.</h2>
          <p>The Island shows when a page is using your microphone or camera, and its popover can stop access.</p>
          <p class="pop-note">Sites must ask before they can use either.</p>
        </FeaturePop>
        <FeaturePop id="recovery" feature="recovery" href="/features/security" linkText="Read more about recovery">
          <BentoIcon slot="visual" name="restore" tone="sage" size="pop" />
          <p class="pop-eyebrow">Recovery</p>
          <h2 id="pop-recovery-title">Choose how to recover after a crash.</h2>
          <p>After an unclean shutdown, choose whether to restore your tabs or start fresh.</p>
          <p class="pop-note">Settings can also export local diagnostics for you to review before sharing.</p>
        </FeaturePop>
        <FeaturePop id="downloads" feature="downloads">
          <BentoIcon slot="visual" name="down" tone="slate" size="pop" />
          <p class="pop-eyebrow">Downloads</p>
          <h2 id="pop-downloads-title">Pick up interrupted downloads.</h2>
          <p>Interrupted downloads offer Resume when they can continue, and Retry when they need to start again.</p>
          <p class="pop-note">Not every interrupted download can be completed.</p>
        </FeaturePop>
        <FeaturePop id="search-engine" feature="search-engine" href="/features/command-palette" linkText="Read more about search">
          <BentoIcon slot="visual" name="search" tone="sand" size="pop" />
          <p class="pop-eyebrow">Search</p>
          <h2 id="pop-search-engine-title">Search with DuckDuckGo, Google, Bing or Brave.</h2>
          <p>Pick your search engine in Settings. Search suggestions can be turned off at any time.</p>
          <p class="pop-note">Suggestions are optional.</p>
        </FeaturePop>
        <FeaturePop id="pin-mute" feature="pin-mute" href="/features/island" linkText="Read more about the Island">
          <BentoIcon slot="visual" name="pin" tone="ink" size="pop" />
          <p class="pop-eyebrow">Pin and mute</p>
          <h2 id="pop-pin-mute-title">Pin the tabs you keep and mute the ones that play.</h2>
          <p>Type /pin to keep a tab first in its group, and /mute to silence a noisy one.</p>
          <p class="pop-note">Pinned tabs stay loaded.</p>
        </FeaturePop>
        <FeaturePop id="default-browser" feature="default-browser" href="/download" linkText="Download Blanc">
          <BentoIcon slot="visual" name="house" tone="clay" size="pop" />
          <p class="pop-eyebrow">Default browser</p>
          <h2 id="pop-default-browser-title">Make Blanc your default browser.</h2>
          <p>First-run setup helps you choose a default browser, and Settings has a Make default button at any time.</p>
          <p class="pop-note">On Windows, Blanc opens the system Default apps page for you to confirm.</p>
        </FeaturePop>
        <FeaturePop id="security" feature="security" href="/features/security" linkText="Read more about security">
          <BentoIcon slot="visual" name="box" tone="sage" size="pop" />
          <p class="pop-eyebrow">Sandboxed pages</p>
          <h2 id="pop-security-title">Every page runs in a sandbox.</h2>
          <p>Pages run in Chromium’s sandbox, and sites must ask before using your camera, microphone, location or notifications.</p>
          <p class="pop-note">Read the security page for what each protection covers.</p>
        </FeaturePop>
        <FeaturePop id="signed-releases" feature="signed-releases" href="/features/security" linkText="Read more about security">
          <BentoIcon slot="visual" name="seal" tone="sand" size="pop" />
          <p class="pop-eyebrow">Signed releases</p>
          <h2 id="pop-signed-releases-title">Check the download you got.</h2>
          <p>Mac and Windows releases are signed, Mac builds are notarized, and every release ships a signed checksum manifest you can verify.</p>
          <p class="pop-note">The verification guide walks through each step.</p>
        </FeaturePop>
        <FeaturePop id="themes" feature="themes" href="/features/island" linkText="Read more about the Island">
          <BentoIcon slot="visual" name="half" tone="slate" size="pop" />
          <p class="pop-eyebrow">Appearance</p>
          <h2 id="pop-themes-title">A look that follows your computer.</h2>
          <p>Choose light, dark or system, and Blanc’s own pages change with it. Change it in Settings or with /theme.</p>
          <p class="pop-note">Websites that follow the system theme change too.</p>
        </FeaturePop>
      </div>
      <div class="pop-nav">
        <button type="button" data-pop-nav="-1"><span aria-hidden="true">←</span> <span data-pop-prev></span></button>
        <button type="button" data-pop-nav="1"><span data-pop-next></span> <span aria-hidden="true">→</span></button>
      </div>
    </div>
  </dialog>

  <section class="bento-patron" aria-labelledby="feature-patron-title">
    <div class="bento-patron-copy">
      <!-- the three text elements from the old file, lines 125–127, unchanged -->
    </div>
    <div class="bento-patron-offer">
      <p class="bento-patron-price"><strong>$30</strong><span> / year</span></p>
      <!-- old lines 131–133, unchanged -->
    </div>
  </section>

  <!-- old lines 137–141 (the feature-close section), unchanged -->
</main>
<script src="../scripts/feature-bento.js"></script>
</BaseLayout>
```

Replace the three `<!-- … -->` comments with the exact old lines (use a short script, as in the abandoned attempt: read `$TMPDIR/old-features.astro`, assert each line range starts as expected, and splice). The final file must contain no `<!-- old` or `<!-- the three` comments.

Note: `BentoIcon` with `slot="visual"` passes the slot through Astro's component slot mechanism; if Astro warns that a component cannot receive `slot`, wrap it: `<span slot="visual"><BentoIcon … /></span>`.

Create `site/src/scripts/feature-bento.js` containing only:

```js
/* Features bento popover. Implemented in Task 3. */
```

- [ ] **Step 10: Update the old hub assertion**

In `test/site/feature-expansion.test.mjs`, replace the opening of the test titled `feature hub has fifteen ordered guides and Press captures download as real PNGs` (its first six lines through the `assert.deepEqual(hrefs, …)` line) with:

```js
test('feature hub reaches all sixteen guides and Press captures download as real PNGs', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const hrefs = new Set(await page.locator('a[href^="/features/"]').evaluateAll(links => links.map(link => link.getAttribute('href'))));
    for (const route of ['island', 'start-page', 'glance', 'ad-blocking', 'private-tabs', 'command-palette', 'mouse-gestures', 'reopen-closed-tabs', 'tab-groups', 'workspaces', 'vertical-tabs', 'quiet-tabs', 'profiles', 'sync', 'security', '1password']) assert.ok(hrefs.has(`/features/${route}`), route);
```
Keep the following `#small-details-title` assertion and the Press part unchanged.

- [ ] **Step 11: Run the tests**

Run the **Site test loop** with `features-bento`, then `feature-expansion` and `newsreader-reach`.
Expected: `features-bento` all PASS. In `feature-expansion` and `newsreader-reach`, the `/features` assertions pass; the homepage, `/download` and Press-filename failures seen on the untouched base (`not ok` for "expanded pages…", "homepage showcase…", the `billboard.png` download name, and the `/download` H1 tracking) are pre-existing and must be confirmed against `origin/main` in Task 6. `npm run test:unit` is expected to FAIL in the prose guard and v1.27 ledger until Task 2; do not commit yet.

- [ ] **Step 12: Look at it**

Open `http://127.0.0.1:4322/features` in the browser pane at 1440×900, 768×1024 and 390×844; compare with the v3 prototype (`.superpowers/brainstorm/…/bento-v3.html`). Check: no label overlaps its visual, photo tiles have readable labels, the hero wordmark is centred, the dense grid icons are top-left and labels bottom-left, no sideways scroll.

---

### Task 2: Claim ledger, superseded claims and reviewed copy update

**Files:**
- Create: `docs/website-features-bento-claims-v1.30.json`
- Modify: `docs/website-revamp-claims-v1.27.json`
- Modify: `test/unit/website-feature-evidence.test.js` (new test after the `drag-to-reorder copy resolves…` test)

**Interfaces:**
- Consumes: Task 1's page. Element ids on `BentoTile`, `BentoSmall` and `FeaturePop` tags identify each claim's evidence group.
- Produces: ledger `{ publicRelease, sourceSha, releaseEvidence, scope, evidenceGroups, claims[] }`, claim `{ id: "bento-130-NNN", source, exactWording, subject: "Blanc", evidenceGroups: [key], verdict: "qualified" }`.

- [ ] **Step 1: Write the failing ledger test**

Add after the `drag-to-reorder copy resolves to verified public v1.30.0 evidence` test:

```js
test('Features bento copy resolves to verified public v1.30.0 evidence, and every sentence on it is recorded', () => {
  const bento = JSON.parse(read('docs/website-features-bento-claims-v1.30.json'));
  const reorder = JSON.parse(read('docs/website-reorder-claims-v1.30.json'));
  const file = 'site/src/pages/features.astro';
  assert.equal(bento.publicRelease, 'v1.30.0');
  assert.equal(execFileSync('git', ['rev-parse', `${bento.publicRelease}^{commit}`], { cwd: root, encoding: 'utf8' }).trim(), bento.sourceSha);
  assert.ok(read(bento.releaseEvidence).includes(bento.sourceSha));
  const page = read(file);
  for (const claim of bento.claims) {
    assert.equal(claim.source, file, claim.id);
    assert.ok(['verified', 'qualified'].includes(claim.verdict), claim.id);
    assert.ok(normalize(page).includes(claim.exactWording), `${claim.id}: exact wording drifted`);
    for (const key of claim.evidenceGroups) {
      const group = bento.evidenceGroups[key];
      assert.ok(group?.qualification && group.evidence.length, `${claim.id}: release evidence and qualifications`);
      for (const evidence of group.evidence) execFileSync('git', ['cat-file', '-e', `${bento.publicRelease}:${evidence}`], { cwd: root });
    }
  }
  // Every text element above the unchanged Patron and download sections is a
  // recorded claim in this ledger, the reorder ledger, or the v1.27 ledger.
  const recorded = [...bento.claims, ...reorder.claims, ...ledger.claims].filter(claim => claim.source === file).map(claim => claim.exactWording);
  const scope = page.slice(page.indexOf('<main'), page.indexOf('class="bento-patron"'));
  for (const [, , text] of scope.matchAll(/<(h[1-6]|p|figcaption|li|button)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const wording = normalize(text);
    if (wording) assert.ok(recorded.includes(wording), `${file}: unrecorded copy: ${wording}`);
  }
});
```

Run `node --test test/unit/website-feature-evidence.test.js`. Expected: FAIL with `ENOENT … website-features-bento-claims-v1.30.json`.

- [ ] **Step 2: Write and run the one-off ledger builder**

Save outside the repo as `$TMPDIR/build-bento-ledger.mjs` and run from the worktree root against a clean v1.27 ledger (`git checkout docs/website-revamp-claims-v1.27.json` first if rerunning):

```js
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = file => fs.readFileSync(file, 'utf8');
const entities = { rsquo: '’', lsquo: '‘', amp: '&', ldquo: '“', rdquo: '”' };
const normalize = text => text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*(?:>|$)/g, '')
  .replace(/&(rsquo|lsquo|amp|ldquo|rdquo);/g, (_, name) => entities[name]).replace(/\s+/g, ' ').trim();
const file = 'site/src/pages/features.astro';
const page = read(file);
const v127Path = 'docs/website-revamp-claims-v1.27.json';
const v127 = JSON.parse(read(v127Path));
const reorder = JSON.parse(read('docs/website-reorder-claims-v1.30.json'));

const G = (evidence, qualification) => ({ evidence, qualification });
const evidenceGroups = {
  overview: G(['LICENSE', 'package.json', 'src/renderer/index.html', 'spec/acceptance/tabs-and-groups.feature'],
    'Desktop builds for macOS, Windows and Linux; first-party code MIT with the carve-outs in THIRD-PARTY-NOTICES.md and ASSET-LICENSE.md. Grouping is user-directed; Blanc does not infer tasks or organize tabs by meaning.'),
  glance: G(['src/main/glance-layout.js', 'src/main/main.js', 'spec/acceptance/glance.feature'], 'Another tab from the same window beside the main page; resizable, swappable, closable; never restored or synced.'),
  island: G(['src/renderer/index.html', 'src/renderer/renderer.js', 'src/renderer/styles.css', 'spec/acceptance/island-and-commands.feature'], 'The resting Island keeps a reserved band above the page and replaces the tab strip and toolbar; its panel overlays the page.'),
  quietTabs: G(['src/main/tab-sleep.js', 'settings-schema/schema.json', 'spec/acceptance/quiet-tabs.feature', 'test/unit/tab-sleep.test.js'], 'Eligible background tabs release renderer memory after the device-local delay (off, 30m, 1h default, 6h) and reload when revisited; audible, muted, pinned, capturing and dirty tabs stay awake. Claims name memory only.'),
  wallpaper: G(['src/renderer/pages/newtab.js', 'src/renderer/pages/newtab-wallpaper.js', 'src/main/settings.js'], 'Time-of-day wallpaper is a device-local Settings → General option following the computer clock through dawn, day, dusk and night.'),
  blocking: G(['src/main/adblock.js', 'src/main/shield-model.js', 'settings-schema/schema.json', 'src/renderer/overlay.html', 'spec/acceptance/ad-blocking.feature', 'adblock/sources/pinned.json'], 'Blanc Blocker on by default with bundled EasyList and EasyPrivacy; shield popover shows count, connection scheme and a per-site switch that reloads. No blocker removes every ad or tracker. uBlock Origin optional on supported builds after restart; private tabs use Blanc Blocker.'),
  mahjong: G(['src/renderer/pages/mahjong-engine.js', 'src/renderer/pages/mahjong-state.js', 'src/renderer/pages/mahjong.js'], 'Opens from every Start Page footer in its own tab; eight boards, Daily deal, hints, undo, device-local records; offline single-player, not synced.'),
  reopening: G(['src/main/closed-tabs.js', 'src/main/main.js', 'src/renderer/overlay.js', 'test/unit/closed-tabs.test.js'], 'Per-window Recently Closed, up to 25 entries for one hour, memory only; at most one eligible page per window keeps its live view for about 30 seconds; private tabs never recorded; no promise of exact recovery.'),
  privateTabs: G(['src/main/main.js', 'src/main/tab-view.js', 'spec/acceptance/private-tabs.feature'], 'Separate non-persistent session; excluded from history, session restore, sync and Recently Closed; private Island theme and quick-exit chip. Not anonymity; downloads remain on disk.'),
  profiles: G(['src/main/local-profiles.js', 'src/main/local-profile-model.js', 'src/main/profile-sessions.js', 'spec/acceptance/local-profiles.feature'], 'Named profiles separate cookies, site data, Favorites, history, download metadata and remembered permissions; settings and Patron are device-level.'),
  quickSwitcher: G(['src/renderer/overlay.html', 'src/renderer/overlay.js', 'copy/slash-commands.json', 'spec/acceptance/island-and-commands.feature', 'spec/acceptance/find-favorites-history.feature'], 'Command/Ctrl+L; matches tabs, Favorites, history and Named Groups; Enter opens the highlighted result, exact-text web search chosen explicitly; slash commands exist in copy/slash-commands.json.'),
  startPage: G(['src/main/settings.js', 'src/renderer/pages/newtab.js', 'settings-schema/schema.json'], 'Four layouts Ledger, Billboard, Shelf, Tally; Billboard uses local history; layout choice is synced; history is not.'),
  namedGroups: G(['spec/acceptance/tabs-and-groups.feature', 'spec/acceptance/tab-drag.feature', 'src/renderer/overlay.js', 'src/renderer/tab-context-menu-model.js'], 'User-created and user-assigned via /group or the tab menu; Blanc never infers or sorts groups; drag ordering user-directed (v1.30.0).'),
  workspaces: G(['src/main/workspaces.js', 'src/main/main.js', 'spec/acceptance/F41-named-workspaces.feature'], 'Active Patrons create and save; a bound workspace saves tabs and groups as the user browses; existing workspaces stay usable after membership ends.'),
  sync: G(['src/main/sync.js', 'src/main/sync-crypto.js', 'spec/acceptance/sync.feature'], 'Opt-in, end-to-end encrypted, Personal profile only; Favorites, settings and optional open-tab snapshots; never history, cookies or private tabs.'),
  verticalTabs: G(['src/renderer/vertical-tabs.js', 'spec/acceptance/vertical-tabs.feature', 'spec/acceptance/tab-drag.feature'], 'Optional resizable left rail; Island remains the address and command surface; drag ordering user-directed.'),
  gestures: G(['src/main/mouse-gestures.js', 'settings-schema/schema.json', 'test/unit/mouse-gestures.test.js'], 'Off by default; right-button drag or Alt/Option one-finger trackpad drag; assignable actions include Back, Forward, Reload; device-local.'),
  onepassword: G(['src/main/onepassword-broker.js', 'src/main/onepassword-availability.js', 'src/main/credential-fill-controller.js', 'docs/1password-integration.md'], 'macOS only, optional, needs the installed 1Password app and account; explicit invoke (⌥⌘P, menu, /1password); never automatic.'),
  ublock: G(['docs/ublock-origin-support-matrix-2026-10-03.md', 'docs/ublock-origin-shipping-2026-10-03.md', 'src/renderer/overlay.html'], 'Full uBO 1.75.0 for regular tabs on Apple Silicon, native Intel Mac, Windows x64 and Linux x64; chosen from the shield, applies after restart; private tabs and Rosetta use Blanc Blocker.'),
  darkWebsites: G(['src/main/dark-websites.js', 'src/renderer/overlay.html', 'dark-reader/pinned.json'], 'Off by default, device-local; darkens http(s) pages without their own dark mode only while Blanc is dark; per-site switch in the shield; iframes keep their colors.'),
  passkeys: G(['src/main/webauthn.js', 'test/unit/webauthn-packaging.test.js'], 'macOS Touch ID passkeys created by Blanc, device-bound in the Secure Enclave; does not read third-party credential managers.'),
  reorder: G(['src/renderer/tab-drag.js', 'spec/acceptance/tab-drag.feature', 'test/unit/tab-drag.test.js'], 'v1.30.0 drag and Alt/Option+Shift+Up/Down in the expanded Island and vertical tabs; user-directed; pinned state unchanged.'),
  importing: G(['src/main/bookmark-import.js', 'src/main/browser-data-import.js'], 'Import from a detected browser profile or an HTML file in Favorites; processed on the device.'),
  capture: G(['src/main/capture-state.js', 'src/main/permissions.js'], 'Island chip and popover show live microphone/camera use and can stop it; sites must request media permission.'),
  recovery: G(['src/main/session-recovery.js', 'src/main/diagnostics-export.js'], 'After an unclean shutdown the user chooses restore or start fresh; diagnostics export is local and user-reviewed.'),
  downloads: G(['src/main/downloads.js'], 'Resume when Chromium can continue, Retry (http/https) otherwise; not every download can be completed.'),
  search: G(['settings-schema/schema.json', 'src/main/settings.js'], 'Engines DuckDuckGo, Google, Bing, Brave; search suggestions can be turned off.'),
  pinMute: G(['copy/slash-commands.json', 'src/main/tab-sleep.js'], '/pin and /mute exist; pinned tabs are excluded from Quiet Tabs.'),
  defaultBrowser: G(['src/main/windows-default-browser.js', 'src/renderer/pages/settings.html'], 'First-run setup offers default-browser choice; Settings has Make default; on Windows it opens the system Default apps page.'),
  security: G(['src/main/main.js', 'src/main/permissions.js'], 'Tab views run with sandbox and context isolation; media, geolocation and notifications are prompted permissions.'),
  releases: G(['docs/release-verification.md', 'scripts/release.sh'], 'macOS signed and notarized, Windows Authenticode-signed, every release ships a Sigstore-signed SHA256SUMS manifest.'),
  themes: G(['settings-schema/schema.json', 'copy/slash-commands.json'], 'System, light or dark via Settings or /theme; nativeTheme propagates to chrome, internal pages and web content.'),
};
const groupForId = {
  glance: 'glance', island: 'island', 'quiet-tabs': 'quietTabs', wallpaper: 'wallpaper', 'ad-blocking': 'blocking',
  mahjong: 'mahjong', blanc: 'overview', 'reopen-closed-tabs': 'reopening', 'private-tabs': 'privateTabs', profiles: 'profiles',
  commands: 'quickSwitcher', 'slash-commands': 'quickSwitcher', 'start-page': 'startPage', 'tab-groups': 'namedGroups',
  workspaces: 'workspaces', sync: 'sync', 'vertical-tabs': 'verticalTabs', 'mouse-gestures': 'gestures', '1password': 'onepassword',
  'ublock-origin': 'ublock', 'dark-websites': 'darkWebsites', passkeys: 'passkeys', 'drag-to-reorder': 'reorder', import: 'importing',
  capture: 'capture', recovery: 'recovery', downloads: 'downloads', 'search-engine': 'search', 'pin-mute': 'pinMute',
  'default-browser': 'defaultBrowser', security: 'security', 'signed-releases': 'releases', themes: 'themes',
};

const main = page.slice(page.indexOf('<main'), page.indexOf('class="bento-patron"'));
const existing = new Set([...v127.claims, ...reorder.claims].filter(c => c.source === file).map(c => c.exactWording));
const starts = [...main.matchAll(/<(?:BentoTile|BentoSmall|FeaturePop)\b[^>]*\bid="([^"]+)"/g)].map(m => [m.index, m[1]]);
const ownerAt = index => starts.filter(([start]) => start <= index).at(-1)?.[1];
const firstTile = starts[0][0];
const claims = [];
for (const match of main.matchAll(/<(h[1-6]|p|figcaption|li|button)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
  const exactWording = normalize(match[2]);
  if (!exactWording || existing.has(exactWording)) continue;
  const group = match.index < firstTile ? 'overview' : groupForId[ownerAt(match.index)];
  if (!group) throw new Error(`no evidence group for: ${exactWording}`);
  claims.push({ id: `bento-130-${String(claims.length + 1).padStart(3, '0')}`, source: file, exactWording, subject: 'Blanc', evidenceGroups: [group], verdict: 'qualified' });
}
const used = new Set(claims.flatMap(c => c.evidenceGroups));
fs.writeFileSync('docs/website-features-bento-claims-v1.30.json', `${JSON.stringify({
  publicRelease: 'v1.30.0',
  sourceSha: '5be79e58d08ca9bcf7cb99b3d8f84c21c654b1c7',
  releaseEvidence: 'docs/release-incidents/2026-10-07-v1.30.0.md',
  scope: 'Features page bento redesign (October 8, 2026). Every evidence path is at the immutable publicRelease tag. Tile visuals reuse captures already published on the site; decorative mini UI repeats v1.30.0 interface strings and labels sample numbers as samples. Replaced wording is recorded as supersededClaims in docs/website-revamp-claims-v1.27.json, and the new prose as a reviewedCopyUpdate there.',
  evidenceGroups: Object.fromEntries(Object.entries(evidenceGroups).filter(([key]) => used.has(key))),
  claims,
}, null, 2)}\n`);

const flat = page.replace(/\s+/g, ' ');
const gone = v127.claims.filter(c => c.source === file && !normalize(page).includes(c.exactWording) && !flat.includes(c.exactWording));
v127.claims = v127.claims.filter(c => !gone.includes(c));
for (const claim of gone) v127.supersededClaims.push({ id: claim.id, historicalLedger: v127Path,
  reason: 'October 8, 2026 Features page bento redesign replaced this wording; see docs/website-features-bento-claims-v1.30.json. The original wording remains in git history.' });

// Same revision test/unit/site-navigation.test.js replays from.
const revision = '358cc02df00f10d184b84dbfdae6f6bfdfa6a790';
let reviewed = execFileSync('git', ['show', `${revision}:${file}`], { encoding: 'utf8' });
const entry = v127.retainedFeaturePages.reviewedCopyUpdates.find(update => update.source === file);
for (const { before, after } of entry.replacements) reviewed = reviewed.replace(before, after);
const mainBlock = text => text.slice(text.indexOf('<main'), text.indexOf('</main>') + '</main>'.length);
const after = mainBlock(page);
if (/\$[$&`']/.test(after)) throw new Error('replacement contains a $ pattern String.replace would expand');
entry.replacements.push({ before: mainBlock(reviewed), after });
entry.reason += ' October 8 bento redesign: tile board, dense grid and popovers with feature-first copy, verified at public v1.30.0 and recorded in docs/website-features-bento-claims-v1.30.json.';
fs.writeFileSync(v127Path, `${JSON.stringify(v127, null, 2)}\n`);
console.log(`bento claims: ${claims.length}; superseded: ${gone.map(c => c.id).join(', ')}`);
```

Expected: roughly 140 claims; superseded ids include `website-115-012`…`website-115-042` (minus `026`) and `onepassword-126-022`, `onepassword-126-023`.

- [ ] **Step 3: Review the diff by hand**

```bash
git diff --stat docs/
node -e 'for (const c of require("./docs/website-features-bento-claims-v1.30.json").claims) console.log(c.id, c.evidenceGroups[0].padEnd(15), c.exactWording.slice(0, 90))'
```
Check every claim's group is the right feature and every wording matches the spec. Confirm the reorder claims `reorder-130-013` ("Drag tabs and groups into the order you want.") and `reorder-130-014` ("Drag tabs and groups in the rail to reorder them.") still appear on the page — they do, inside the Named Groups and vertical-tabs popovers.

- [ ] **Step 4: Run the unit suite**

Run `npm run test:unit`. Expected: PASS (2,671 tests). If an evidence path fails `git cat-file -e v1.30.0:<path>`, find the real name with `git ls-tree -r --name-only v1.30.0 | grep <name>`, fix it in the builder, restore the v1.27 file and rerun Steps 2–4.

- [ ] **Step 5: Commit Tasks 1 and 2 together**

```bash
git add site/public/feature-hub site/src/components/bento site/src/styles/features-bento.css site/src/scripts/feature-bento.js site/src/pages/features.astro test/site/features-bento.test.mjs test/site/feature-expansion.test.mjs docs/website-features-bento-claims-v1.30.json docs/website-revamp-claims-v1.27.json test/unit/website-feature-evidence.test.js
git commit -m "Rebuild the Features page as a bento board with feature popovers

Records every new sentence against public v1.30.0 and supersedes the
replaced Features-page claims.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Popover behaviour

**Files:**
- Modify: `site/src/scripts/feature-bento.js`
- Modify: `test/site/features-bento.test.mjs` (append)

**Interfaces:**
- Consumes: Task 1 classes and attributes (`[data-pop]`, `[data-pop-body]`, `#feature-pop`, `.pop-card`, `.pop-content`, `.pop-scrim`, `[data-pop-close]`, `[data-pop-nav]`, `[data-pop-prev]`, `[data-pop-next]`, `.pop-eyebrow`, `.pop-stage`, `.pop-steps i`).
- Produces: `.is-source` on the open tile, `.pop-stage[data-step]` changes, `.pop-steps i.is-on`, URL hash `#<id>` while open. Task 4's demos only read `data-step`.

- [ ] **Step 1: Write the failing behaviour tests**

Append to `test/site/features-bento.test.mjs`:

```js
test('clicking a tile opens its popover, Escape closes it and focus returns to the tile', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    await page.locator('#glance').click();
    await page.waitForFunction(() => document.getElementById('feature-pop').open);
    assert.equal(await page.locator('#pop-glance').isVisible(), true);
    assert.equal(await page.locator('#pop-island').isVisible(), false);
    assert.equal(await page.locator('#feature-pop').getAttribute('aria-labelledby'), 'pop-glance-title');
    assert.equal(new URL(page.url()).hash, '#glance');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('feature-pop').open);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'glance');
    assert.equal(new URL(page.url()).hash, '');
  } finally { await context.close(); }
});

test('arrow keys move between features and the source tile follows', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const order = await page.locator('[data-pop]').evaluateAll(as => as.map(a => a.dataset.pop));
    await page.locator('#glance').click();
    await page.waitForFunction(() => document.getElementById('feature-pop').open);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(id => !document.getElementById(`pop-${id}`).hidden, order[1]);
    assert.equal(await page.locator(`#${order[1]}`).evaluate(el => el.classList.contains('is-source')), true);
    assert.equal(await page.locator('#glance').evaluate(el => el.classList.contains('is-source')), false);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(id => !document.getElementById(`pop-${id}`).hidden, order.at(-1));
  } finally { await context.close(); }
});

test('a modified click is left to the browser', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const opened = await page.evaluate(() => {
      const tile = document.getElementById('glance');
      // Registered after the page's own handler, so it only stops the test navigating away.
      tile.addEventListener('click', e => e.preventDefault(), { once: true });
      tile.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true, button: 0 }));
      return document.getElementById('feature-pop').open;
    });
    assert.equal(opened, false, 'meta-click does not open the popover');
  } finally { await context.close(); }
});

test('a hash link opens that popover', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features#sync`);
    await page.waitForFunction(() => document.getElementById('feature-pop').open && !document.getElementById('pop-sync').hidden);
  } finally { await context.close(); }
});

test('with motion allowed the card grows from the tile; with reduced motion it only fades', async () => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await contextFor({ reducedMotion });
    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/features`);
      await page.locator('#island').click();
      const transforms = await page.evaluate(() => document.querySelector('.pop-card').getAnimations().map(a => a.effect.getKeyframes()[0].transform ?? null));
      if (reducedMotion === 'reduce') assert.deepEqual(transforms, []);
      else assert.match(transforms[0], /translate\(.+\) scale\(/);
    } finally { await context.close(); }
  }
});
```

Run the **Site test loop** with `features-bento`. Expected: the five new tests FAIL (the dialog never opens).

- [ ] **Step 2: Implement `feature-bento.js`**

```js
/* Features bento: a tile opens the shared popover, which grows out of the
   tile and shrinks back into it. Tiles are real links, so without script,
   or on a modified click, they go to the feature's guide. Motion is a
   critically damped spring (damping 1.0, response 0.42 s) as a linear()
   easing; a close starts from the card's on-screen transform, so it can
   interrupt an opening. Reduced motion cross-fades instead. */
const dialog = document.getElementById('feature-pop');

if (dialog && typeof dialog.showModal === 'function') {
  const card = dialog.querySelector('.pop-card');
  const content = dialog.querySelector('.pop-content');
  const scrim = dialog.querySelector('.pop-scrim');
  const tiles = [...document.querySelectorAll('[data-pop]')];
  const bodies = new Map([...dialog.querySelectorAll('[data-pop-body]')].map(body => [body.dataset.popBody, body]));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const SPRING = spring(0.42);
  let index = -1;
  let source = null;
  let running = [];
  let demoTimer = null;
  let closing = false;

  function spring(response) {
    const omega = 2 * Math.PI / response;
    const settle = 9.2 / omega;
    const points = [];
    for (let k = 0; k <= 48; k++) {
      const t = settle * k / 48;
      points.push((1 - (1 + omega * t) * Math.exp(-omega * t)).toFixed(4));
    }
    return { easing: `linear(${points.join(', ')})`, duration: Math.round(settle * 1000) };
  }

  const wrap = i => (i + tiles.length) % tiles.length;
  const labelOf = tile => bodies.get(tile.dataset.pop)?.querySelector('.pop-eyebrow')?.textContent.trim() ?? '';
  const stop = () => { running.forEach(animation => animation.cancel()); running = []; };
  const toTile = tile => {
    const from = card.getBoundingClientRect();
    const to = tile.getBoundingClientRect();
    return `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`;
  };

  function startDemo(body) {
    clearInterval(demoTimer);
    const stage = body.querySelector('.pop-stage');
    const bars = [...stage.querySelectorAll('.pop-steps i')];
    if (!bars.length) return;
    const set = step => {
      stage.dataset.step = String(step);
      bars.forEach((bar, k) => bar.classList.toggle('is-on', k < step));
    };
    if (reducedMotion.matches) { set(3); return; }
    let step = 1;
    set(step);
    demoTimer = setInterval(() => { if (!document.hidden) set(step = step % 3 + 1); }, 2200);
  }

  function show(i) {
    index = wrap(i);
    const id = tiles[index].dataset.pop;
    for (const [key, body] of bodies) body.hidden = key !== id;
    dialog.setAttribute('aria-labelledby', `pop-${id}-title`);
    dialog.querySelector('[data-pop-prev]').textContent = labelOf(tiles[wrap(index - 1)]);
    dialog.querySelector('[data-pop-next]').textContent = labelOf(tiles[wrap(index + 1)]);
    content.scrollTop = 0;
    startDemo(bodies.get(id));
    history.replaceState(null, '', `#${id}`);
  }

  function open(i) {
    stop();
    closing = false;
    show(i);
    source = tiles[index];
    dialog.showModal();
    source.classList.add('is-source');
    if (reducedMotion.matches) {
      running = [dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })];
      return;
    }
    running = [
      card.animate([{ transform: toTile(source) }, { transform: 'none' }], SPRING),
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' }),
      content.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 140, easing: 'ease-out', fill: 'backwards' }),
    ];
  }

  function close() {
    if (index < 0 || closing) return;
    closing = true;
    const tile = source;
    const live = getComputedStyle(card).transform;
    const scrimNow = getComputedStyle(scrim).opacity;
    stop();
    clearInterval(demoTimer);
    const done = () => {
      dialog.close();
      tile.classList.remove('is-source');
      index = -1;
      closing = false;
      history.replaceState(null, '', location.pathname + location.search);
      tile.focus({ preventScroll: true });
    };
    if (reducedMotion.matches) {
      const fade = dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in' });
      fade.onfinish = done;
      running = [fade];
      return;
    }
    const shrink = card.animate([{ transform: live === 'none' ? 'none' : live }, { transform: toTile(tile) }], SPRING);
    running = [
      shrink,
      scrim.animate([{ opacity: scrimNow }, { opacity: 0 }], { duration: 240, easing: 'ease-in', fill: 'forwards' }),
      content.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }),
    ];
    shrink.onfinish = done;
  }

  function go(direction) {
    if (index < 0 || closing) return;
    const swap = () => {
      source.classList.remove('is-source');
      show(index + direction);
      source = tiles[index];
      source.classList.add('is-source');
      source.scrollIntoView({ block: 'nearest' });
    };
    if (reducedMotion.matches) { swap(); return; }
    content.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-direction * 16}px)` }], { duration: 110, easing: 'ease-in' }).onfinish = () => {
      swap();
      content.animate([{ opacity: 0, transform: `translateX(${direction * 16}px)` }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    };
  }

  tiles.forEach((tile, i) => tile.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(i);
  }));
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-pop-close]')) close();
    const nav = event.target.closest('[data-pop-nav]');
    if (nav) go(Number(nav.dataset.popNav));
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
  });

  const id = decodeURIComponent(location.hash.slice(1));
  const fromHash = tiles.findIndex(tile => tile.dataset.pop === id);
  if (fromHash >= 0) requestAnimationFrame(() => { tiles[fromHash].scrollIntoView({ block: 'center' }); open(fromHash); });
}
```

- [ ] **Step 3: Run the tests**

Run the **Site test loop** with `features-bento`. Expected: all PASS. Positive control for the modified-click test: temporarily delete `|| event.metaKey` from the handler, confirm that test FAILS, then restore it.

- [ ] **Step 4: Feel it**

In the browser pane at 1440×900: open several tiles, close during the opening animation (the card must reverse from where it is, not jump), hold → to cycle all 33, and check that focus returns to the tile after Escape. Then switch the pane to `colorScheme` unchanged with reduced motion (use the Playwright context or DevTools emulation) and confirm only a fade.

- [ ] **Step 5: Commit**

```bash
git add site/src/scripts/feature-bento.js test/site/features-bento.test.mjs
git commit -m "Open Features tiles in a popover that grows from the tile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Demo stages

**Files:**
- Create: `site/src/components/bento/demos/SwitcherDemo.astro`, `ShieldDemo.astro`, `QuietDemo.astro`, `ReopenDemo.astro`, `PrivateDemo.astro`
- Modify: `site/src/pages/features.astro` (replace the five `<div slot="visual" class="demo-slot" data-demo="…">` placeholders)
- Modify: `site/src/styles/features-bento.css` (append)
- Modify: `test/site/features-bento.test.mjs` (append)

**Interfaces:**
- Consumes: `.pop-stage[data-step]` from Task 3.
- Produces: step attributes inside demos: `data-at="1 2"` (shown at those steps), `data-dim="2 3"` (dimmed), `data-on="1 2"` (switch on).

- [ ] **Step 1: Write the failing test**

```js
test('each demo shows exactly its own step and rests on step 3 without motion', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    for (const id of ['commands', 'ad-blocking', 'quiet-tabs', 'reopen-closed-tabs', 'private-tabs']) {
      const stage = page.locator(`#pop-${id} .pop-stage`);
      assert.ok(await stage.locator('.demo [data-at]').count() >= 3, `${id}: per-step states`);
      await page.locator(`#${id}`).click();
      await page.waitForFunction(i => !document.getElementById(`pop-${i}`).hidden, id);
      assert.equal(await stage.getAttribute('data-step'), '3', `${id}: reduced motion rests on 3`);
      for (const step of ['1', '2', '3']) {
        await stage.evaluate((el, n) => { el.dataset.step = n; }, step);
        const wrong = await stage.locator('[data-at]').evaluateAll((els, n) => els.filter(el =>
          (getComputedStyle(el).display !== 'none') !== el.dataset.at.split(' ').includes(n)).length, step);
        assert.equal(wrong, 0, `${id} step ${step}`);
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('feature-pop').open);
    }
  } finally { await context.close(); }
});
```

Run the **Site test loop** with `features-bento`. Expected: FAIL on `commands: per-step states`.

- [ ] **Step 2: Create the five demos**

`SwitcherDemo.astro`:
```astro
---
// ⌘L panel: placeholder → matches from each source → slash commands.
// Strings mirror v1.30.0 overlay.html and copy/slash-commands.json.
---
<div class="demo ui demo-panel">
  <div class="demo-in"><span data-at="1" class="demo-ph">Search, enter address, or / for commands</span><span data-at="2">lou<span class="demo-caret"></span></span><span data-at="3">/<span class="demo-caret"></span></span></div>
  <div data-at="1"><div class="ui-sec">this window · 3 tabs</div><div class="ui-row is-on"><span class="ui-fav ui-fav--a">W</span><span class="ui-t">Typography — Wikipedia</span></div><div class="ui-row"><span class="ui-fav ui-fav--e">V</span><span class="ui-t">Visit Copenhagen — Guide</span></div><div class="ui-row"><span class="ui-fav ui-fav--b">L</span><span class="ui-t">Louisiana Museum — Exhibitions</span></div></div>
  <div data-at="2"><div class="ui-sec">matches</div><div class="ui-row is-on"><span class="ui-fav ui-fav--b">L</span><span class="ui-t">Louisiana Museum — Exhibitions</span><span class="ui-m">open tab</span></div><div class="ui-row"><span class="ui-fav ui-fav--d">L</span><span class="ui-t">Louvre — Collections</span><span class="ui-m">favorite</span></div><div class="ui-row"><span class="ui-fav ui-fav--c">L</span><span class="ui-t">Louisiana Channel — Videos</span><span class="ui-m">history</span></div><div class="ui-row"><span>▸</span><span class="ui-t">louisiana trip</span><span class="ui-m">group · 3 tabs</span></div></div>
  <div data-at="3"><div class="ui-sec">commands</div><div class="ui-row is-on"><span class="demo-cmd">/private</span><span class="ui-t ui-m">Open a private tab (history stays untouched)</span></div><div class="ui-row"><span class="demo-cmd">/find</span><span class="ui-t ui-m">Find in page</span></div><div class="ui-row"><span class="demo-cmd">/group</span><span class="ui-t ui-m">Type a space, then a group name — e.g. “work”</span></div><div class="ui-row"><span class="demo-cmd">/allow-ads</span><span class="ui-t ui-m">Allow ads on this site</span></div></div>
</div>
```

`ShieldDemo.astro`:
```astro
---
// Resting Island → Site protection popover → site switched off.
// Strings mirror v1.30.0 overlay.html and shield-model.js; 12 is a sample.
---
<div class="demo demo-shield">
  <span class="demo-pill"><span>‹ ›</span><span class="ui-fav ui-fav--b">L</span><span>louisiana.dk</span><span class="demo-count"><span data-at="1 2">12</span><span data-at="3">0</span></span><span>↻</span></span>
  <div class="ui demo-popover" data-at="2 3">
    <div class="demo-pop-head"><span class="demo-mark"></span><div><b>Site protection</b><span class="demo-small">louisiana.dk</span></div></div>
    <span class="demo-small">Current blocker · <b>Blanc Blocker</b></span>
    <div class="demo-toggle"><span>Ad &amp; tracker blocking <b data-at="2">on</b><b data-at="3">off</b></span><span class="demo-switch" data-on="1 2"></span></div>
    <span class="demo-small"><span data-at="2">12 ads &amp; trackers blocked on this page</span><span data-at="3">Ads allowed on this site</span></span>
    <span class="demo-small">Changing site protection reloads this page.</span>
  </div>
</div>
```

`QuietDemo.astro`:
```astro
---
// A group in the ⌘L panel; quiet tabs are marked by dimming only, as in
// the app. The playing tab stays loaded.
---
<div class="demo ui demo-panel">
  <div class="ui-sec">trip · 5 tabs <span class="demo-later" data-at="2 3">1 hour later</span></div>
  <div class="ui-row is-on"><span class="ui-fav ui-fav--a">W</span><span class="ui-t">Typography — Wikipedia</span><span class="ui-m">this tab</span></div>
  <div class="ui-row" data-dim="2 3"><span class="ui-fav ui-fav--e">V</span><span class="ui-t">Visit Copenhagen — Guide</span></div>
  <div class="ui-row" data-dim="2"><span class="ui-fav ui-fav--b">L</span><span class="ui-t">Louisiana Museum — Exhibitions</span><span class="ui-m" data-at="3">reloading…</span></div>
  <div class="ui-row"><span class="ui-fav ui-fav--c">R</span><span class="ui-t">Radio — Live</span><span class="ui-m">♪ playing</span></div>
  <div class="ui-row" data-dim="2 3"><span class="ui-fav ui-fav--d">F</span><span class="ui-t">Flight search</span></div>
</div>
```

`ReopenDemo.astro`:
```astro
---
// Tab list → foldable "recently closed" line (v1.30.0 overlay.js) → restored.
---
<div class="demo ui demo-panel">
  <div class="demo-in demo-in--split"><span class="demo-ph">Search, enter address, or / for commands</span><b>⌘⇧T</b></div>
  <div data-at="1"><div class="ui-sec">this window · 3 tabs</div><div class="ui-row"><span class="ui-fav ui-fav--a">W</span><span class="ui-t">Typography — Wikipedia</span></div><div class="ui-row is-on"><span class="ui-fav ui-fav--b">L</span><span class="ui-t">Louisiana Museum — Exhibitions</span><span>×</span></div><div class="ui-row"><span class="ui-fav ui-fav--e">V</span><span class="ui-t">Visit Copenhagen — Guide</span></div></div>
  <div data-at="2"><div class="ui-sec">this window · 2 tabs</div><div class="ui-row"><span class="ui-fav ui-fav--a">W</span><span class="ui-t">Typography — Wikipedia</span></div><div class="ui-row"><span class="ui-fav ui-fav--e">V</span><span class="ui-t">Visit Copenhagen — Guide</span></div><div class="ui-sec">⌄ recently closed 2</div><div class="ui-row is-on"><span class="ui-fav ui-fav--b">L</span><span class="ui-t">Louisiana Museum — Exhibitions</span><span class="ui-m">just now</span></div><div class="ui-row"><span>▸</span><span class="ui-t">research · 4 tabs</span><span class="ui-m">2 min</span></div></div>
  <div data-at="3"><div class="ui-sec">this window · 3 tabs</div><div class="ui-row"><span class="ui-fav ui-fav--a">W</span><span class="ui-t">Typography — Wikipedia</span></div><div class="ui-row is-on"><span class="ui-fav ui-fav--b">L</span><span class="ui-t">Louisiana Museum — Exhibitions</span><span class="ui-m">back</span></div><div class="ui-row"><span class="ui-fav ui-fav--e">V</span><span class="ui-t">Visit Copenhagen — Guide</span></div></div>
</div>
```

`PrivateDemo.astro`:
```astro
---
// Regular Island → private Island (dashed, private chip) → history unchanged.
---
<div class="demo demo-private">
  <span class="demo-pill" data-at="1"><span>‹ ›</span><span class="ui-fav ui-fav--a">W</span><span>wikipedia.org</span></span>
  <span class="demo-pill demo-pill--private" data-at="2 3"><span>‹ ›</span><span>louisiana.dk</span><span class="demo-private-chip">private ×</span></span>
  <div class="ui demo-panel demo-panel--narrow">
    <div class="ui-sec">history · today</div>
    <div class="ui-row"><span class="ui-fav ui-fav--a">W</span><span class="ui-t">Typography — Wikipedia</span><span class="ui-m">just now</span></div>
    <div class="ui-row"><span class="ui-fav ui-fav--e">V</span><span class="ui-t">Visit Copenhagen — Guide</span><span class="ui-m">10:42</span></div>
    <div class="ui-row demo-none" data-at="3">No new entries while private.</div>
  </div>
</div>
```

- [ ] **Step 3: Place them**

In `features.astro` import the five demos and replace each placeholder:
`<div slot="visual" class="demo-slot" data-demo="switcher"></div>` → `<SwitcherDemo slot="visual" />`, and likewise `shield` → `ShieldDemo`, `quiet` → `QuietDemo`, `reopen` → `ReopenDemo`, `private` → `PrivateDemo`. (Wrap in `<div slot="visual">…</div>` if Astro will not pass `slot` to a component.)

- [ ] **Step 4: Append the demo CSS**

```css
/* Popover demos: data-at shows, data-dim dims, data-on switches, per step */
.demo [data-at] { display: none; }
.pop-stage[data-step="1"] .demo [data-at~="1"], .pop-stage[data-step="2"] .demo [data-at~="2"], .pop-stage[data-step="3"] .demo [data-at~="3"] { display: revert; }
.pop-stage[data-step="1"] .demo [data-dim~="1"], .pop-stage[data-step="2"] .demo [data-dim~="2"], .pop-stage[data-step="3"] .demo [data-dim~="3"] { opacity: .3; }
.demo .ui-row { transition: opacity .5s ease; }
.demo-panel { width: min(500px, 86%); overflow: hidden; border: 1px solid rgba(18, 16, 11, .08); border-radius: 18px; background: #FFFFFF; }
.demo-panel--narrow { width: min(380px, 86%); }
.demo-in { padding: 13px 16px; border-bottom: 1px solid #EEEEEE; font-size: 15px; }
.demo-in--split { display: flex; justify-content: space-between; gap: 12px; }
.demo-in--split b { font-size: 12px; }
.demo-ph { color: #999999; }
.demo-caret { display: inline-block; width: 1.5px; height: 1em; margin-left: 1px; background: #0E0E0E; vertical-align: -2px; animation: bento-caret 1.1s steps(1) infinite; }
@keyframes bento-caret { 50% { opacity: 0; } }
.demo-cmd { min-width: 84px; font-weight: 600; }
.demo-later { float: right; }
.demo-none { color: #999999; }
.demo-shield, .demo-private { display: grid; gap: 14px; justify-items: center; width: 100%; }
.demo-pill { display: inline-flex; align-items: center; gap: 10px; height: 40px; padding: 0 15px; border-radius: 16px; background: #FFFFFF; color: #0E0E0E; font: 500 13px var(--font-ui); white-space: nowrap; }
.demo-pill--private { border: 1.5px dashed #9A9A9A; background: #F4F2EE; }
.demo-private-chip { padding: 1px 9px; border: 1px dashed #9A9A9A; border-radius: 99px; font-size: 11px; }
.pop-stage[data-step="3"] .demo-private-chip { border-color: var(--bento-accent-a); }
.demo-count { padding: 1px 8px; border-radius: 10px; background: #F3F1EC; font-variant-numeric: tabular-nums; }
.demo-popover { display: grid; gap: 6px; width: 300px; padding: 14px 16px; border: 1px solid rgba(18, 16, 11, .08); border-radius: 16px; background: #FFFFFF; font-size: 13px; }
.demo-pop-head { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; border-bottom: 1px solid #EEEEEE; }
.demo-pop-head div { display: grid; }
.demo-mark { width: 26px; height: 26px; border-radius: 50%; background: radial-gradient(circle at 50% 70%, #E9B85B 0 38%, transparent 40%), #F6E7C8; }
.demo-small { color: #999999; font-size: 12px; }
.demo-small b { color: #0E0E0E; }
.demo-toggle { display: flex; align-items: center; justify-content: space-between; padding-top: 4px; }
.demo-switch { position: relative; width: 34px; height: 20px; border-radius: 12px; background: #D9D5CE; transition: background .25s ease; }
.demo-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 1px 2px rgba(0, 0, 0, .25); transition: transform .25s ease; }
.pop-stage[data-step="1"] .demo-switch[data-on~="1"], .pop-stage[data-step="2"] .demo-switch[data-on~="2"], .pop-stage[data-step="3"] .demo-switch[data-on~="3"] { background: #111111; }
.pop-stage[data-step="1"] .demo-switch[data-on~="1"]::after, .pop-stage[data-step="2"] .demo-switch[data-on~="2"]::after, .pop-stage[data-step="3"] .demo-switch[data-on~="3"]::after { transform: translateX(14px); }
.pop-chips { width: min(320px, 80%); font-size: 14px; }
@media (prefers-reduced-motion: reduce) {
  .demo .ui-row, .demo-switch, .demo-switch::after { transition: none; }
  .demo-caret { animation: none; }
}
```

- [ ] **Step 5: Run tests and look**

Run the **Site test loop** with `features-bento`, then `npm run test:unit` (demo text lives in components, not `features.astro`, so the ledgers are unaffected; the prose guard compares only `features.astro`). Expected: all PASS. In the browser pane, open each of the five demo popovers with motion allowed and watch one full loop.

- [ ] **Step 6: Commit**

```bash
git add site/src/components/bento/demos site/src/pages/features.astro site/src/styles/features-bento.css test/site/features-bento.test.mjs
git commit -m "Play short demos in five Features popovers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Capture review against v1.30.0

**Files:** possibly `site/src/pages/features.astro` (swap or drop a visual)

- [ ] **Step 1: List each reused capture and what it shows**

| Capture | Release recorded | Shows |
|---|---|---|
| `feature-hub/glance.webp` (from `feature-captures/glance.png`) | see `docs/website-captures-*.json` | Glance split |
| `revamp/island-roman-{rest,tabs,command}-800.webp` | homepage revamp | resting Island, tab list, slash list |
| `feature-captures/mahjong-v1.21.0.webp` | v1.21.0 | Mahjong board |
| `feature-captures/home-wallpaper-*-v1.25.0.webp` | v1.25.0 | Start Page wallpapers |
| `feature-captures/{ledger,billboard,shelf,tally}-v1.21.0.webp` | v1.21.0 | Start Page layouts |
| `feature-captures/profiles.png`, `workspaces.png` | see captures ledger | Settings → Profiles; workspace menu |

- [ ] **Step 2: Compare with v1.30.0**

For each, compare the visible interface against the v1.30.0 renderer (`git show v1.30.0:src/renderer/overlay.html`, `styles.css`, `pages/newtab.html`, `pages/settings.html`) and, if the owner has v1.30.0 installed, a fresh look in the app. Record any element the capture shows that v1.30.0 no longer has, or presents differently in a way a reader would notice (a renamed control, a removed button, a different panel layout).

- [ ] **Step 3: Act on differences**

If a capture misrepresents v1.30.0, replace that visual with a mini-UI replica or an icon, or drop it, and tell the owner in the PR description. Do not create new captures in this branch without the owner's approval.

---

### Task 6: Cleanup, full verification and PR

**Files:**
- Modify: `site/src/styles/site.css` (delete hub-only rules)
- Modify: `docs/website-revamp-claims-v1.27.json`, `docs/website-features-bento-claims-v1.30.json` (re-record)

- [ ] **Step 1: Delete hub-only rules from `site.css`**

Delete the rules (and the selectors within shared lists) for: `.feature-hero--hub`; `.feature-hub-list`; `.feature-hub-row` and every descendant/variant (`--featured`, `--patron`); `.feature-number`; `.feature-label`; `.feature-row-end`; `.feature-hub-page .feature-copy-grid`; `.feature-patron`, `.feature-patron-copy`, `.feature-patron-offer`, `.feature-patron-price`, `.feature-patron-badge`, `.feature-patron-cta`; and remove `.feature-hub-row h2` and `.feature-patron-copy h2` from the display-headings selector list. Keep `.feature-close`, `.feature-hero`, `.feature-copy-grid`, `.feature-copy-list`, `.section-kicker`, `.breadcrumb` (shared with guide pages).

```bash
grep -rn "feature-hub\|feature-number\|feature-row-end\|feature-label\|feature-patron" site/src
```
Expected: no matches.

- [ ] **Step 2: Re-record the final page**

Tasks 3–5 may have changed `features.astro` after Task 2's reviewed update. Regenerate:

```bash
git show origin/main:docs/website-revamp-claims-v1.27.json > docs/website-revamp-claims-v1.27.json
node "$TMPDIR/build-bento-ledger.mjs"
git diff --stat docs/
npm run test:unit
```
Expected: same claim count and superseded ids as Task 2 unless copy changed; unit suite passes. If `$TMPDIR/build-bento-ledger.mjs` is gone, recreate it from Task 2 Step 2.

- [ ] **Step 3: Full verification**

```bash
npm run lint
npm run test:unit
npm run site:build
(cd site && npm run preview -- --background --host 127.0.0.1 --port 4322)
(cd site && for f in features-bento feature-expansion newsreader-reach masthead footer crawl-hygiene; do BLANC_SITE_URL=http://127.0.0.1:4322 node --test ../test/site/$f.test.mjs || echo "FAILED $f"; done)
(cd site && npm run preview -- stop)
```
Then build `origin/main` in a scratch worktree (`git worktree add "$TMPDIR/base" origin/main && cd "$TMPDIR/base" && npm ci && npm --prefix site ci && npm run site:build`), serve it on 4322 and run the same `feature-expansion` and `newsreader-reach` suites there. Any failure that also occurs on `origin/main` is pre-existing; report it, do not fix it here. Remove the scratch worktree afterwards (`git worktree remove "$TMPDIR/base"`).

- [ ] **Step 4: Before/after proof**

With the branch preview running, capture `/features` at 1440×900 (top of board, popover open on Quiet Tabs, dense grid) and 390×844 (board top, one popover). The "before" captures are already in the scratchpad (`shots/before-*.png`). Present before stacked over after for the board, at full resolution, with one line on where to look.

- [ ] **Step 5: Commit, push and open the PR**

```bash
git add site/src/styles/site.css docs/website-revamp-claims-v1.27.json docs/website-features-bento-claims-v1.30.json
git commit -m "Remove the retired Features card styles and re-record the final page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git fetch origin && git rebase origin/main && npm run test:unit
git push -u origin features-hub-redesign
gh pr create --title "Redesign the Features page as an Apple-style bento board" --body "$(cat <<'EOF'
## What
- `/features` is now a bento board in the style of Apple's WWDC feature summaries: 15 visual tiles around a Sunrise "Blanc" hero, then 18 small icon tiles. Proportions (gutter, radius, label size, column ratio, masonry rows, colour budget) are measured from Apple's slides and expressed against the board width.
- Every tile is a link to its guide; with script, a click opens a popover that grows out of the tile with a visual (five play short demos) and the explainer, with ←/→ to move between features and `#id` deep links.
- Copy is feature-first per the October 4 messaging rule; every sentence is recorded against public v1.30.0 in `docs/website-features-bento-claims-v1.30.json`, replaced claims are superseded in the v1.27 ledger, and the prose guard's reviewed update records the new page.

## Preserved
URL, title, descriptions, JSON-LD, every existing anchor id, links to all 16 guides, the Patron and download sections.

## Not included
No deploy: site deploys stay on hold for Blanc Mail.

## Verification
- `npm run lint`, `npm run test:unit`, `npm run site:build`
- `test/site/features-bento.test.mjs` (new), `feature-expansion`, `newsreader-reach`, `masthead`, `footer`, `crawl-hygiene`; failures that also occur on `origin/main` are listed below.
- Before/after captures at 1440 and 390 wide.

Spec: `docs/superpowers/specs/2026-10-08-features-bento-design.md`
Plan: `docs/superpowers/plans/2026-10-08-features-bento.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Then call `get_status`, bind the PR if needed, and read its checks. Do not merge until every check on the head SHA passes and the owner approves.
