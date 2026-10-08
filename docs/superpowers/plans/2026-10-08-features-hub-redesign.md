# Features Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 16 identical text cards on `/features` with five animated product scenes in alternating ink and cream bands, then a mixed-size tile grid of the other eleven features, with every sentence rewritten feature-first and recorded against public v1.30.0.

**Architecture:** `features.astro` keeps all copy as literal markup (so the existing prose guard and claim ledgers can read it) and composes two new slot-based components, `FeatureScene` and `FeatureTile`. Five decorative stage components draw small product UIs in HTML/CSS sized in `em` from a container query, and show one of three states chosen by the scene's `data-step`. One script, `feature-scenes.js`, plays each scene once when its stage scrolls into view. Server HTML always rests on step 3, so no-JS and reduced-motion visitors see a complete picture.

**Tech Stack:** Astro 7 (static, `build.format: 'file'`), plain CSS with the site tokens in `site/src/styles/site.css`, vanilla JS, Node's test runner with Playwright for `test/site/*.mjs`, `node --test` for `test/unit/*.js`.

**Spec:** `docs/superpowers/specs/2026-10-08-features-hub-redesign-design.md`

## Global Constraints

- Work only in the worktree `/Users/anthonyjloria/Projects/blanc-features-hub` on branch `features-hub-redesign` (based on `origin/main` `c0292ca6`). Never commit in the main checkout.
- Public release for every claim: **v1.30.0**, `sourceSha` `5be79e58d08ca9bcf7cb99b3d8f84c21c654b1c7`, release evidence `docs/release-incidents/2026-10-07-v1.30.0.md`.
- Unchanged: `title`, `description`, `ogDescription`, `path="/features"`, `page="features"`, `current="features"`, the BreadcrumbList JSON-LD, `<main id="main-content">`.
- Every existing id stays: `features-title`, `island`, `1password`, `start-page`, `glance`, `ad-blocking`, `private-tabs`, `commands`, `mouse-gestures`, `reopen-closed-tabs`, `tab-groups`, `workspaces`, `vertical-tabs`, `quiet-tabs`, `profiles`, `sync`, `security`, `small-details-title`, `feature-patron-title`, `feature-close-title`. New ids: `overview`, `more-features`, `more-features-title`, `details`.
- Subpage links carry `data-track="feature_cta_click"`, the existing `data-feature` value (Named Workspaces keeps `named-workspaces`), and `data-cta-position="feature-hub"`. Patron and close links keep their current attributes.
- Copy is exactly the text in Task 1. Any later wording change must rerun Task 2's ledger builder and the unit suite.
- Headings (`h1`, every `h2`, tile `h3`) are Newsreader (`var(--site-font-display)`), weight 400; the H1 has `letter-spacing: -0.02em` (`test/site/newsreader-reach.test.mjs` checks both). Mini UIs stay Inter.
- No inline `style=` attributes. All page CSS lives in `site/src/styles/features-hub.css`, imported only by `features.astro`.
- No images, video or third-party logos in the stages: sample sites use letter tiles.
- Use `’` (U+2019) for apostrophes in page copy, matching the rest of the site.
- Never deploy. Site deploys are on hold for Blanc Mail.
- **Site test loop** (used by several tasks). From the worktree root:
  ```bash
  npm run site:build
  (cd site && npm run preview -- --background --host 127.0.0.1 --port 4322)
  (cd site && BLANC_SITE_URL=http://127.0.0.1:4322 node --test ../test/site/<file>.test.mjs)
  (cd site && npm run preview -- stop)
  ```
  Rebuild and restart the preview after every source change before rerunning a site test.

---

### Task 0: Worktree setup

**Files:** none

- [ ] **Step 1: Install dependencies (real installs, never symlinks)**

```bash
cd /Users/anthonyjloria/Projects/blanc-features-hub
npm ci
npm --prefix site ci
npx playwright install chromium
```
Expected: all three succeed.

- [ ] **Step 2: Record the baseline**

```bash
npm run test:unit 2>&1 | tail -5
npm run site:build 2>&1 | tail -3
```
Expected: unit suite passes and the site builds. If anything fails on this untouched base, write it down; it is pre-existing and not this branch's problem.

---

### Task 1: New page structure and copy

**Files:**
- Create: `site/src/components/features/FeatureScene.astro`
- Create: `site/src/components/features/FeatureTile.astro`
- Create: `site/src/styles/features-hub.css`
- Modify: `site/src/pages/features.astro` (full rewrite of the body)
- Modify: `test/site/feature-expansion.test.mjs:99-106`
- Create: `test/site/features-hub.test.mjs`

**Interfaces:**
- Produces: `FeatureScene` props `{ id: string; tone: 'ink' | 'cream'; reverse?: boolean }`, slots: default (label, h2, paragraphs), `steps` (three `<li><button type="button" data-step-button="N">`), `link`, `stage`. Renders `<section class="hub-scene hub-scene--{tone}" id data-scene data-step="3">`, a `.hub-stage[aria-hidden="true"]` and a hidden `button[data-replay]`.
- Produces: `FeatureTile` props `{ id: string; href: string; feature: string; size?: 'large' | 'wide' | 'small'; patron?: boolean }`, slots: default (label, h3, p), `art`.
- Produces: CSS classes `.hub-page`, `.hub-opening`, `.hub-chips`, `.hub-scene*`, `.hub-steps`, `.hub-replay`, `.hub-stage`, `.hub-index`, `.hub-grid`, `.hub-tile*`, `.hub-badge`, `.hub-details*`, `.hub-patron*`.

- [ ] **Step 1: Write the failing structure test**

Create `test/site/features-hub.test.mjs`:

```js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const hubOrder = ['command-palette', 'ad-blocking', 'quiet-tabs', 'reopen-closed-tabs', 'private-tabs',
  'island', 'tab-groups', 'start-page', 'workspaces', 'glance', 'mouse-gestures', 'vertical-tabs',
  'profiles', 'sync', 'security', '1password'];
const keptIds = ['features-title', 'island', '1password', 'start-page', 'glance', 'ad-blocking', 'private-tabs',
  'commands', 'mouse-gestures', 'reopen-closed-tabs', 'tab-groups', 'workspaces', 'vertical-tabs', 'quiet-tabs',
  'profiles', 'sync', 'security', 'small-details-title', 'feature-patron-title', 'feature-close-title'];
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function contextFor(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...options });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await context.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  return context;
}

test('features hub keeps every anchor, links all sixteen guides in order, and alternates five scenes', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    for (const id of keptIds) assert.equal(await page.locator(`[id="${id}"]`).count(), 1, `#${id}`);
    const links = await page.locator('[data-cta-position="feature-hub"]').evaluateAll(as => as.map(a => ({
      href: a.getAttribute('href'), track: a.dataset.track, feature: a.dataset.feature })));
    assert.deepEqual(links.map(l => l.href), hubOrder.map(r => `/features/${r}`));
    assert.ok(links.every(l => l.track === 'feature_cta_click' && l.feature), 'tracking attributes');
    assert.equal(links.find(l => l.href === '/features/workspaces').feature, 'named-workspaces');
    const tones = await page.locator('[data-scene]').evaluateAll(s => s.map(el => [el.id, el.classList.contains('hub-scene--ink') ? 'ink' : 'cream']));
    assert.deepEqual(tones, [['commands', 'ink'], ['ad-blocking', 'cream'], ['quiet-tabs', 'ink'], ['reopen-closed-tabs', 'cream'], ['private-tabs', 'ink']]);
    for (const id of tones.map(([sceneId]) => sceneId)) {
      assert.equal(await page.locator(`#${id} [data-step-button]`).count(), 3, `${id}: three steps`);
      assert.equal(await page.locator(`#${id} .hub-stage`).getAttribute('aria-hidden'), 'true');
    }
    assert.equal(await page.locator('h1').innerText(), 'Blanc’s features, and what each one does for you.');
    assert.equal(await page.locator('#small-details-title').innerText(), 'Smaller details that matter.');
  } finally { await context.close(); }
});

test('features hub never scrolls sideways', { timeout: 60000 }, async () => {
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

Run the **Site test loop** with `features-hub`.
Expected: the first test FAILS (no `[data-cta-position="feature-hub"]` in the new order, no `[data-scene]`).

- [ ] **Step 3: Create `FeatureScene.astro`**

```astro
---
// One large Features-page scene: copy beside a decorative product stage.
// Copy lives in the page (slots) so claim ledgers and the prose guard read it
// from features.astro. The stage is aria-hidden; the copy carries the meaning.
// Server HTML rests on step 3; feature-scenes.js plays steps 1-3 when welcome.
interface Props {
  id: string;
  tone: 'ink' | 'cream';
  reverse?: boolean;
}
const { id, tone, reverse = false } = Astro.props;
---
<section class:list={['hub-scene', `hub-scene--${tone}`, { 'hub-scene--reverse': reverse }]} id={id} aria-labelledby={`${id}-title`} data-scene data-step="3">
  <div class="hub-scene-inner">
    <div class="hub-scene-copy">
      <slot />
      <ol class="hub-steps" aria-label="Demo steps"><slot name="steps" /></ol>
      <div class="hub-scene-actions">
        <slot name="link" />
        <button type="button" class="hub-replay" data-replay hidden>Play again</button>
      </div>
    </div>
    <div class="hub-stage" aria-hidden="true"><slot name="stage" /></div>
  </div>
</section>
```

- [ ] **Step 4: Create `FeatureTile.astro`**

```astro
---
// One Features-page index tile: the whole tile is the link to its guide.
interface Props {
  id: string;
  href: string;
  feature: string;
  size?: 'large' | 'wide' | 'small';
  patron?: boolean;
}
const { id, href, feature, size = 'small', patron = false } = Astro.props;
---
<article class:list={['hub-tile', `hub-tile--${size}`, { 'hub-tile--patron': patron }]} id={id}>
  <a class="hub-tile-link" href={href} data-track="feature_cta_click" data-feature={feature} data-cta-position="feature-hub">
    <div class="hub-tile-art" aria-hidden="true"><slot name="art" /></div>
    <div class="hub-tile-copy"><slot /></div>
  </a>
</article>
```

- [ ] **Step 5: Rewrite `features.astro`**

Replace the whole file with:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import FeatureScene from '../components/features/FeatureScene.astro';
import FeatureTile from '../components/features/FeatureTile.astro';
import '../styles/features-hub.css';
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

<main id="main-content" class="feature-page hub-page">
  <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">home</a><span aria-hidden="true">/</span><span aria-current="page">features</span></nav>

  <section class="hub-opening" id="overview" aria-labelledby="features-title">
    <p class="section-kicker">A little less browser.</p>
    <h1 id="features-title">Blanc’s features, and what each one does for you.</h1>
    <p class="hub-opening-lead">Five you will use every day are shown up close. The rest follow, one line each. You decide which tabs belong together; Blanc does not sort or group them for you.</p>
    <nav class="hub-chips" aria-label="Jump to a feature">
      <a href="#commands">Quick Switcher</a><a href="#ad-blocking">Blocking</a><a href="#quiet-tabs">Quiet Tabs</a><a href="#reopen-closed-tabs">Reopen</a><a href="#private-tabs">Private</a><a href="#island">Island</a><a href="#tab-groups">Groups</a><a href="#glance">Glance</a><a href="#mouse-gestures">Gestures</a><a href="#start-page">Start Page</a><a href="#workspaces">Workspaces</a><a href="#sync">Sync</a>
    </nav>
  </section>

  <FeatureScene id="commands" tone="ink">
    <p class="hub-scene-label">Quick Switcher and slash commands</p>
    <h2 id="commands-title">Press ⌘L to find any tab, or type / to run a command.</h2>
    <p>The Quick Switcher searches your open tabs, Favorites, history and Named Groups as you type, so you can jump to a page without hunting through a tab strip. Type / to see browser commands such as /private, /find, /group and /allow-ads.</p>
    <p class="hub-scene-note">On Windows and Linux, press Ctrl+L. For search text, Enter opens the highlighted result; choose the result showing your exact text to search the web.</p>
    <Fragment slot="steps">
      <li><button type="button" data-step-button="1">Type a few letters.</button></li>
      <li><button type="button" data-step-button="2">Matches come from tabs, Favorites, history and groups.</button></li>
      <li><button type="button" data-step-button="3">Type / for commands.</button></li>
    </Fragment>
    <a slot="link" class="text-link" href="/features/command-palette" data-track="feature_cta_click" data-feature="command-palette" data-cta-position="feature-hub">Explore commands <span aria-hidden="true">↗</span></a>
  </FeatureScene>

  <FeatureScene id="ad-blocking" tone="cream" reverse>
    <p class="hub-scene-label">Ad and tracker blocking</p>
    <h2 id="ad-blocking-title">Block ads and trackers from the first page, with a switch for each site.</h2>
    <p>Blanc Blocker is built in and on by default, using EasyList and EasyPrivacy. Click the shield on the Island to see how many requests it blocked on this page and whether the connection uses HTTPS, or to turn blocking off for just this site.</p>
    <p class="hub-scene-note">Blocking reduces ads and known tracking; no blocker removes all of them. The count shown here is a sample. Prefer uBlock Origin? Choose it from the same shield on supported builds, then restart Blanc.</p>
    <Fragment slot="steps">
      <li><button type="button" data-step-button="1">The shield counts blocked requests.</button></li>
      <li><button type="button" data-step-button="2">Click it for site protection.</button></li>
      <li><button type="button" data-step-button="3">Turn it off for one site; the page reloads.</button></li>
    </Fragment>
    <a slot="link" class="text-link" href="/features/ad-blocking" data-track="feature_cta_click" data-feature="ad-blocking" data-cta-position="feature-hub">See site controls <span aria-hidden="true">↗</span></a>
  </FeatureScene>

  <FeatureScene id="quiet-tabs" tone="ink">
    <p class="hub-scene-label">Quiet Tabs</p>
    <h2 id="quiet-tabs-title">Quiet Tabs free up memory without closing the tab.</h2>
    <p>When a background tab has gone unused for an hour (the default), Blanc releases the memory its page was using and dims it in the Island. Open it again and the page reloads with its address, title and back button. Choose 30 minutes, 1 hour, 6 hours or Off in Settings.</p>
    <p class="hub-scene-note">Tabs playing sound, pinned tabs and pages with a half-filled form stay loaded. A quiet tab reloads; it does not resume exactly where the page’s scripts left off.</p>
    <Fragment slot="steps">
      <li><button type="button" data-step-button="1">Every tab is loaded.</button></li>
      <li><button type="button" data-step-button="2">Unused background tabs go quiet.</button></li>
      <li><button type="button" data-step-button="3">Open one and it reloads.</button></li>
    </Fragment>
    <a slot="link" class="text-link" href="/features/quiet-tabs" data-track="feature_cta_click" data-feature="quiet-tabs" data-cta-position="feature-hub">How Quiet Tabs work <span aria-hidden="true">↗</span></a>
  </FeatureScene>

  <FeatureScene id="reopen-closed-tabs" tone="cream" reverse>
    <p class="hub-scene-label">Reopen Closed Tab</p>
    <h2 id="reopen-closed-tabs-title">Reopen a closed tab or a whole group, sometimes without a reload.</h2>
    <p>Press ⌘⇧T, type /reopen, or choose from Recently Closed in the Island. For about 30 seconds, one eligible tab you closed can come back without loading again, which can keep its scroll position and the text you were typing.</p>
    <p class="hub-scene-note">On Windows and Linux, press Ctrl+Shift+T. After that window the tab reloads from a saved snapshot or its address. Each window keeps up to 25 entries for an hour, and private tabs are never recorded.</p>
    <Fragment slot="steps">
      <li><button type="button" data-step-button="1">Close a tab.</button></li>
      <li><button type="button" data-step-button="2">Find it in Recently Closed.</button></li>
      <li><button type="button" data-step-button="3">It comes back in place.</button></li>
    </Fragment>
    <a slot="link" class="text-link" href="/features/reopen-closed-tabs" data-track="feature_cta_click" data-feature="reopen-closed-tabs" data-cta-position="feature-hub">How reopening works <span aria-hidden="true">↗</span></a>
  </FeatureScene>

  <FeatureScene id="private-tabs" tone="ink">
    <p class="hub-scene-label">Private tabs</p>
    <h2 id="private-tabs-title">Private tabs keep your visits out of Blanc’s history.</h2>
    <p>Press ⌘⇧N or type /private. Pages you visit are not saved to history, are not restored after a restart, and never appear in Recently Closed. The Island changes so you can see you are private, and its chip closes the tab when you are done.</p>
    <p class="hub-scene-note">On Windows and Linux, press Ctrl+Shift+N. Private does not mean anonymous: websites, your network or an employer can still see activity, and files you download stay on disk.</p>
    <Fragment slot="steps">
      <li><button type="button" data-step-button="1">A regular tab is recorded.</button></li>
      <li><button type="button" data-step-button="2">Open a private tab.</button></li>
      <li><button type="button" data-step-button="3">History stays unchanged.</button></li>
    </Fragment>
    <a slot="link" class="text-link" href="/features/private-tabs" data-track="feature_cta_click" data-feature="private-tabs" data-cta-position="feature-hub">Read about private tabs <span aria-hidden="true">↗</span></a>
  </FeatureScene>

  <section class="hub-index" id="more-features" aria-labelledby="more-features-title">
    <h2 id="more-features-title">More Blanc features.</h2>
    <div class="hub-grid">
      <FeatureTile id="island" href="/features/island" feature="island" size="large">
        <p class="hub-tile-label">The Island</p>
        <h3>The Island puts tabs, search and page controls in one compact bar.</h3>
        <p>It replaces the tab strip and toolbar with a slim band above the page. Open it to switch tabs, search or run a command.</p>
      </FeatureTile>
      <FeatureTile id="tab-groups" href="/features/tab-groups" feature="tab-groups" size="wide">
        <p class="hub-tile-label">Named Groups</p>
        <h3>Named Groups keep a task’s tabs together.</h3>
        <p>You name each group and choose its tabs, then fold the others away. Drag tabs and groups into the order you want.</p>
      </FeatureTile>
      <FeatureTile id="start-page" href="/features/start-page" feature="start-page" size="wide">
        <p class="hub-tile-label">Start Page and Mahjong</p>
        <h3>Choose your Start Page layout, then play Mahjong.</h3>
        <p>Pick Ledger, Billboard, Shelf or Tally. Every Start Page footer opens Mahjong, with eight boards and a Daily deal.</p>
      </FeatureTile>
      <FeatureTile id="workspaces" href="/features/workspaces" feature="named-workspaces" size="wide" patron>
        <p class="hub-tile-label">Named Workspaces <span class="hub-badge">Patron</span></p>
        <h3>Named Workspaces save a whole window to return to by name.</h3>
        <p>Active Patrons can save a window’s tabs and groups, kept up to date as they browse. Saved workspaces stay usable if membership ends.</p>
      </FeatureTile>
      <FeatureTile id="glance" href="/features/glance" feature="glance">
        <p class="hub-tile-label">Glance</p>
        <h3>View two tabs side by side with Glance.</h3>
        <p>Open another tab beside your page for a moment, then resize, swap or close it.</p>
      </FeatureTile>
      <FeatureTile id="mouse-gestures" href="/features/mouse-gestures" feature="mouse-gestures">
        <p class="hub-tile-label">Mouse gestures</p>
        <h3>Navigate with mouse gestures.</h3>
        <p>Turn them on in Settings, then hold the right button and draw, or use Alt/Option with a trackpad drag.</p>
      </FeatureTile>
      <FeatureTile id="vertical-tabs" href="/features/vertical-tabs" feature="vertical-tabs">
        <p class="hub-tile-label">Vertical tabs</p>
        <h3>Show your tabs in an optional vertical list.</h3>
        <p>A resizable rail on the left, while the Island stays for search and commands. Drag tabs and groups in the rail to reorder them.</p>
      </FeatureTile>
      <FeatureTile id="profiles" href="/features/profiles" feature="profiles">
        <p class="hub-tile-label">Profiles</p>
        <h3>Profiles keep work and personal browsing apart.</h3>
        <p>Each has its own cookies, site data, Favorites and history.</p>
      </FeatureTile>
      <FeatureTile id="sync" href="/features/sync" feature="sync">
        <p class="hub-tile-label">Sync</p>
        <h3>Sync Favorites and settings across devices.</h3>
        <p>Opt-in and end-to-end encrypted, from your Personal profile.</p>
      </FeatureTile>
      <FeatureTile id="security" href="/features/security" feature="security">
        <p class="hub-tile-label">Security</p>
        <h3>See how Blanc protects the page you are on.</h3>
        <p>Sandboxed pages, signed releases, explicit site permissions and Touch ID passkeys on Mac.</p>
      </FeatureTile>
      <FeatureTile id="1password" href="/features/1password" feature="1password">
        <p class="hub-tile-label">1Password · macOS</p>
        <h3>Fill logins from 1Password on macOS.</h3>
        <p>Turn it on in Settings, then press ⌥⌘P on a login form.</p>
      </FeatureTile>
    </div>
  </section>

  <section class="hub-details" id="details" aria-labelledby="small-details-title">
    <div><p class="section-kicker">everyday browsing</p><h2 id="small-details-title">Smaller details that matter.</h2></div>
    <div class="hub-details-list">
      <article><h3>Bring your Favorites.</h3><p>First-run setup helps you choose a default browser and save your privacy choices. Import bookmarks from a detected browser profile or an HTML file in Favorites. <a href="/support#bookmark-import">How importing works</a>.</p></article>
      <article><h3>Keep calls under your control.</h3><p>See microphone and camera use from the Island and stop access from its popover. Call audio buffering offers Automatic, Stable, and Resilient receive-buffer choices, with extra delay in exchange for more tolerance of choppy playback. <a href="/features/security#security-calls-title">Read the call controls</a>.</p></article>
      <article><h3>Choose how to recover.</h3><p>After an unclean shutdown, choose whether to restore tabs or start fresh. Settings can export local diagnostics for you to review before sharing. <a href="/features/security#security-recovery-title">Recovery and diagnostics</a>.</p></article>
      <article><h3>Make the everyday controls yours.</h3><p>The Island’s Plus opens a regular, ungrouped tab with its address field focused. macOS offers Sunrise and Sunrise Dark icons without a Patron subscription. <a href="/features/island#island-personal-title">Explore the details</a>.</p></article>
    </div>
  </section>

  <section class="hub-patron" aria-labelledby="feature-patron-title">
    <div class="hub-patron-copy">
      <p class="section-kicker">Patron</p>
      <h2 id="feature-patron-title">Keep the browser free. Get more room to move.</h2>
      <p>Blanc’s core stays free. Patron adds cross-platform Named Workspaces while helping fund an independent browser.</p>
    </div>
    <div class="hub-patron-offer">
      <p class="hub-patron-price"><strong>$30</strong><span> / year</span></p>
      <p>or $4 monthly</p>
      <a class="cta" data-track="supporter_click" data-feature="patron" data-cta-position="feature-patron-close" href="https://buy.polar.sh/polar_cl_auwRq39Q2hIVLJwANEqFWgWuZ8DGjdJmEI4mE0JaNDf" target="_blank" rel="noopener">become a Patron</a>
      <a class="text-link" href="/about" data-track="feature_cta_click" data-feature="patron" data-cta-position="feature-patron-close">what Patron supports <span aria-hidden="true">↗</span></a>
    </div>
  </section>

  <section class="feature-close" aria-labelledby="feature-close-title">
    <p class="section-kicker">ready when you are</p>
    <h2 id="feature-close-title">A quieter browser is a small download away.</h2>
    <a class="cta" href="/download" data-track="feature_cta_click" data-feature="feature-hub" data-cta-position="feature-hub-close">choose your download</a>
  </section>
</main>
<script src="../scripts/feature-scenes.js"></script>
</BaseLayout>
```

Before saving, diff the four "Smaller details" articles, the Patron section and the close section against `git show HEAD:site/src/pages/features.astro`; their text must be byte-identical to the old file (only class names change). If any character differs, copy the old text.

Create an empty `site/src/scripts/feature-scenes.js` containing only this comment so the build resolves the import (Task 3 fills it):

```js
/* Features-page scene playback. Implemented in Task 3. */
```

- [ ] **Step 6: Create `features-hub.css`**

```css
/* Features hub (/features). Imported only by features.astro.
   Ink bands paint full-bleed through border-image, which draws outside the
   1180px column without adding scrollable overflow. Headings are Newsreader
   regular; product replicas stay Inter. */
.hub-page {
  --hub-ink: var(--site-ink-warm);
  --hub-on-ink: #F3EAD8;
  --hub-on-ink-dim: #B9AD97;
  --hub-ink-raised: #1E1B14;
  --hub-ink-border: #3A3427;
  --hub-patron-tint: #EFE2C8;
}

/* Opening */
.hub-opening { max-width: 860px; margin: 0 auto; padding: 104px 0 80px; text-align: center; }
.hub-opening h1 { margin: 0; font-family: var(--site-font-display); font-size: clamp(42px, 6vw, 78px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.0; text-wrap: balance; }
.hub-opening-lead { max-width: 56ch; margin: 24px auto 0; color: var(--site-text-dim); font-size: 16px; line-height: 1.6; }
.hub-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 32px; }
.hub-chips a { display: inline-flex; align-items: center; min-height: 32px; padding: 0 13px; border: 1px solid var(--site-border); border-radius: 999px; background: var(--site-surface-raised); color: var(--site-text); font-size: 13px; text-decoration: none; transition: border-color 0.15s ease, color 0.15s ease; }
.hub-chips a:is(:hover, :focus-visible) { border-color: var(--site-gold); color: var(--site-gold); }
.hub-chips a:focus-visible { outline: 1px solid var(--site-gold); outline-offset: 2px; }

/* Scenes */
.hub-scene { position: relative; padding: clamp(72px, 9vw, 120px) 0; scroll-margin-top: 80px; }
.hub-scene--ink { color: var(--hub-on-ink); border-image: conic-gradient(var(--hub-ink) 0 0) fill 0 / / 0 100vw; }
.hub-scene-inner { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: clamp(40px, 6vw, 88px); align-items: center; }
.hub-scene--reverse .hub-scene-copy { order: 2; }
.hub-scene-label { margin: 0 0 14px; font-size: 11.5px; letter-spacing: 0.17em; text-transform: uppercase; color: var(--site-gold); }
.hub-scene--ink .hub-scene-label { color: var(--site-gold-on-dark); }
.hub-scene h2 { max-width: 17ch; margin: 0; font-family: var(--site-font-display); font-size: clamp(32px, 4vw, 52px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.04; text-wrap: balance; }
.hub-scene-copy > p:not(.hub-scene-label) { max-width: 46ch; margin: 18px 0 0; color: var(--site-text-dim); font-size: 15.5px; line-height: 1.65; }
.hub-scene-copy > p.hub-scene-note { padding-left: 12px; border-left: 1px solid var(--site-border); font-size: 13px; line-height: 1.6; }
.hub-scene--ink .hub-scene-copy > p:not(.hub-scene-label) { color: var(--hub-on-ink-dim); }
.hub-scene--ink .hub-scene-copy > p.hub-scene-note { border-left-color: var(--hub-ink-border); }
.hub-scene-actions { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 20px; }
.hub-scene--ink .text-link { color: var(--hub-on-ink); border-bottom-color: var(--hub-ink-border); }
.hub-scene--ink .text-link > span[aria-hidden="true"] { color: var(--site-gold-on-dark); }

/* Step controls: the highlighted step follows the scene's data-step, so the
   no-script page (resting on step 3) shows the right one too. */
.hub-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; max-width: 470px; margin: 30px 0 0; padding: 0; list-style: none; }
.hub-steps button { display: block; width: 100%; padding: 10px 0 0; border: 0; border-top: 2px solid var(--site-border); background: none; color: var(--site-text-dim); font: inherit; font-size: 12px; line-height: 1.4; text-align: left; cursor: pointer; transition: border-color 0.25s ease, color 0.25s ease; }
.hub-scene[data-step="1"] [data-step-button="1"],
.hub-scene[data-step="2"] [data-step-button="2"],
.hub-scene[data-step="3"] [data-step-button="3"] { border-top-color: var(--site-gold); color: var(--site-text); }
.hub-scene--ink .hub-steps button { border-top-color: var(--hub-ink-border); color: var(--hub-on-ink-dim); }
.hub-scene--ink[data-step="1"] [data-step-button="1"],
.hub-scene--ink[data-step="2"] [data-step-button="2"],
.hub-scene--ink[data-step="3"] [data-step-button="3"] { border-top-color: var(--site-gold-on-dark); color: var(--hub-on-ink); }
.hub-steps button:focus-visible, .hub-replay:focus-visible { outline: 1px solid currentColor; outline-offset: 4px; }
.hub-replay { min-height: 24px; padding: 0 0 3px; border: 0; border-bottom: 1px solid currentColor; background: none; color: inherit; font: inherit; font-size: 12.5px; cursor: pointer; opacity: 0.75; }
.hub-replay:hover { opacity: 1; }
.hub-replay[hidden] { display: none; }
.hub-stage { position: relative; min-width: 0; container-type: inline-size; }

/* Index grid */
.hub-index { padding-top: clamp(80px, 9vw, 120px); }
.hub-index h2 { margin: 0; font-family: var(--site-font-display); font-size: clamp(30px, 3.4vw, 44px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.05; }
.hub-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: minmax(220px, auto); gap: 12px; margin-top: 36px; }
.hub-tile { min-width: 0; }
.hub-tile--large { grid-column: span 2; grid-row: span 2; }
.hub-tile--wide { grid-column: span 2; }
.hub-tile-link { display: flex; flex-direction: column; height: 100%; padding: 22px; border: 1px solid var(--site-border); border-radius: 16px; background: var(--site-surface-raised); color: var(--site-text); text-decoration: none; transition: border-color 0.2s ease, transform 0.2s ease; }
.hub-tile--patron .hub-tile-link { background: var(--hub-patron-tint); }
.hub-tile-link:is(:hover, :focus-visible) { border-color: var(--site-gold); }
.hub-tile-link:focus-visible { outline: 1px solid var(--site-gold); outline-offset: 2px; }
.hub-tile-art { display: grid; flex: 1; place-items: center; min-height: 84px; margin-bottom: 18px; container-type: inline-size; }
.hub-tile-label { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--site-gold); }
.hub-tile h3 { margin: 0; font-family: var(--site-font-display); font-size: 21px; font-weight: 400; letter-spacing: -0.015em; line-height: 1.15; text-wrap: balance; }
.hub-tile--large h3 { max-width: 18ch; font-size: clamp(26px, 2.6vw, 34px); }
.hub-tile-copy > p:last-child { margin: 10px 0 0; color: var(--site-text-dim); font-size: 13.5px; line-height: 1.55; }
.hub-badge { display: inline-flex; align-items: center; min-height: 18px; padding: 0 7px; border: 1px solid currentColor; border-radius: 999px; font-size: 10px; letter-spacing: 0.08em; }

/* Smaller details */
.hub-details { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 2.2fr); gap: 48px; margin-top: 112px; padding-top: 40px; border-top: 1px solid var(--site-border); }
.hub-details h2 { margin: 0; font-family: var(--site-font-display); font-size: clamp(26px, 3vw, 36px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.08; }
.hub-details-list { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px; }
.hub-details-list h3 { margin: 0; font-size: 15px; font-weight: 600; }
.hub-details-list p { margin: 8px 0 0; color: var(--site-text-dim); font-size: 13px; line-height: 1.6; }
.hub-details-list a { color: var(--site-text); }

/* Patron band */
.hub-patron { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(220px, 0.6fr); gap: clamp(40px, 7vw, 96px); align-items: end; margin-top: 112px; padding: clamp(64px, 8vw, 96px) 0; color: var(--hub-on-ink); border-image: conic-gradient(var(--hub-ink) 0 0) fill 0 / / 0 100vw; }
.hub-patron .section-kicker { color: var(--site-gold-on-dark); }
.hub-patron-copy h2 { max-width: 13ch; margin: 0; font-family: var(--site-font-display); font-size: clamp(32px, 4vw, 50px); font-weight: 400; letter-spacing: -0.02em; line-height: 1.04; }
.hub-patron-copy > p:last-child { max-width: 54ch; margin: 22px 0 0; color: var(--hub-on-ink-dim); font-size: 15px; line-height: 1.65; }
.hub-patron-offer { padding-left: 32px; border-left: 1px solid var(--hub-ink-border); }
.hub-patron-price { margin: 0; letter-spacing: -0.035em; }
.hub-patron-price strong { font-size: 40px; font-weight: 500; }
.hub-patron-price span, .hub-patron-offer > p:nth-child(2) { color: var(--hub-on-ink-dim); font-size: 12px; letter-spacing: 0; }
.hub-patron-offer > p:nth-child(2) { margin: 4px 0 0; }
.hub-patron .cta { width: 100%; margin-top: 24px; background: var(--site-gold-on-dark); color: var(--hub-ink); }
.hub-patron .text-link { margin-top: 16px; color: var(--hub-on-ink); border-bottom-color: var(--hub-ink-border); }
.hub-patron .text-link > span[aria-hidden="true"] { color: var(--site-gold-on-dark); }

@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .hub-tile-link:hover { transform: translateY(-2px); }
}
@media (max-width: 1079px) {
  .hub-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .hub-tile--large { grid-row: span 1; }
  .hub-details { grid-template-columns: 1fr; gap: 24px; }
  .hub-details-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 719px) {
  .hub-opening { padding: 64px 0 48px; }
  .hub-scene-inner { grid-template-columns: 1fr; gap: 36px; }
  .hub-scene--reverse .hub-scene-copy { order: 0; }
  .hub-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: minmax(200px, auto); }
  .hub-patron { grid-template-columns: 1fr; gap: 36px; }
  .hub-patron-offer { padding: 28px 0 0; border-top: 1px solid var(--hub-ink-border); border-left: 0; }
}
@media (max-width: 479px) {
  .hub-grid { grid-template-columns: 1fr; }
  .hub-tile--large, .hub-tile--wide { grid-column: auto; }
  .hub-details-list { grid-template-columns: 1fr; }
  .hub-steps { grid-template-columns: 1fr; gap: 6px; }
}
@media (prefers-reduced-motion: reduce) {
  .hub-steps button, .hub-tile-link { transition: none; }
}
```

- [ ] **Step 7: Update the old hub test to the new structure**

In `test/site/feature-expansion.test.mjs`, replace lines 99–106 (the test titled `feature hub has fifteen ordered guides…`) with:

```js
test('feature hub links all sixteen guides in scene-then-tile order and Press captures download as real PNGs', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const hrefs = await page.locator('[data-cta-position="feature-hub"]').evaluateAll(links => links.map(link => link.getAttribute('href')));
    assert.deepEqual(hrefs, ['command-palette', 'ad-blocking', 'quiet-tabs', 'reopen-closed-tabs', 'private-tabs', 'island', 'tab-groups', 'start-page', 'workspaces', 'glance', 'mouse-gestures', 'vertical-tabs', 'profiles', 'sync', 'security', '1password'].map(route => `/features/${route}`));
    assert.equal(await page.locator('#small-details-title').innerText(), 'Smaller details that matter.');
```
(The rest of that test, from `await page.goto(\`${baseURL}/press\`);` onward, is unchanged.)

- [ ] **Step 8: Run the structure test to verify it passes**

Run the **Site test loop** with `features-hub`, then with `feature-expansion` and `newsreader-reach`.
Expected: all PASS. `features-hub` overflow passes at all five widths.
`test:unit` is expected to FAIL now in `site-navigation.test.js` (prose guard) and `website-feature-evidence.test.js` (old claims). Task 2 fixes both. Do not commit yet.

- [ ] **Step 9: Look at it**

With the preview running, open `http://127.0.0.1:4322/features` in the browser pane at 1440×900 and 390×844 and screenshot the opening, one ink scene, the grid and the Patron band. Stages are empty at this point; check spacing, band edges (no seam or sideways scroll), heading fonts and colors.

---

### Task 2: Claim ledger, superseded claims and the reviewed copy update

**Files:**
- Create: `docs/website-features-hub-claims-v1.30.json`
- Modify: `docs/website-revamp-claims-v1.27.json` (`claims`, `supersededClaims`, `retainedFeaturePages.reviewedCopyUpdates`)
- Modify: `test/unit/website-feature-evidence.test.js` (add one test after the reorder test, near line 106)

**Interfaces:**
- Consumes: the exact copy in `site/src/pages/features.astro` from Task 1.
- Produces: ledger with `publicRelease`, `sourceSha`, `releaseEvidence`, `scope`, `evidenceGroups` (keys below), `claims[]` of `{ id: "hub-130-NNN", source, exactWording, subject: "Blanc", evidenceGroups: [key], verdict: "qualified" }`.

- [ ] **Step 1: Write the failing ledger test**

Add to `test/unit/website-feature-evidence.test.js` after the `drag-to-reorder copy resolves…` test:

```js
test('Features page copy resolves to verified public v1.30.0 evidence, and every sentence on it is recorded', () => {
  const hub = JSON.parse(read('docs/website-features-hub-claims-v1.30.json'));
  const reorder = JSON.parse(read('docs/website-reorder-claims-v1.30.json'));
  const file = 'site/src/pages/features.astro';
  assert.equal(hub.publicRelease, 'v1.30.0');
  assert.equal(execFileSync('git', ['rev-parse', `${hub.publicRelease}^{commit}`], { cwd: root, encoding: 'utf8' }).trim(), hub.sourceSha);
  assert.ok(read(hub.releaseEvidence).includes(hub.sourceSha));
  const page = read(file);
  for (const claim of hub.claims) {
    assert.equal(claim.source, file, claim.id);
    assert.ok(['verified', 'qualified'].includes(claim.verdict), claim.id);
    assert.ok(normalize(page).includes(claim.exactWording), `${claim.id}: exact wording drifted`);
    for (const key of claim.evidenceGroups) {
      const group = hub.evidenceGroups[key];
      assert.ok(group?.qualification && group.evidence.length, `${claim.id}: release evidence and qualifications`);
      for (const evidence of group.evidence) execFileSync('git', ['cat-file', '-e', `${hub.publicRelease}:${evidence}`], { cwd: root });
    }
  }
  // Everything above the unchanged Patron and download sections must be a
  // recorded claim in this ledger, the reorder ledger, or the v1.27 ledger.
  const recorded = [...hub.claims, ...reorder.claims, ...ledger.claims].filter(claim => claim.source === file).map(claim => claim.exactWording);
  const scope = page.slice(page.indexOf('<main'), page.indexOf('class="hub-patron"'));
  for (const [, , text] of scope.matchAll(/<(h[1-6]|p|figcaption|li|button)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const wording = normalize(text);
    if (wording) assert.ok(recorded.includes(wording), `${file}: unrecorded copy: ${wording}`);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/unit/website-feature-evidence.test.js`
Expected: FAIL with `ENOENT … website-features-hub-claims-v1.30.json`.

- [ ] **Step 3: Write and run the one-off ledger builder**

Save this outside the repo, at `$TMPDIR/build-hub-ledger.mjs` (it is not committed), then run it from the worktree root with `node "$TMPDIR/build-hub-ledger.mjs"`:

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

const evidenceGroups = {
  overview: {
    evidence: ['spec/acceptance/tabs-and-groups.feature', 'src/renderer/overlay.js', 'src/main/main.js'],
    qualification: 'Grouping is user-directed: the user creates and assigns Named Groups. Blanc does not infer tasks, name groups or organize tabs by meaning.',
  },
  quickSwitcher: {
    evidence: ['src/renderer/overlay.html', 'src/renderer/overlay.js', 'copy/slash-commands.json', 'spec/acceptance/island-and-commands.feature', 'spec/acceptance/find-favorites-history.feature'],
    qualification: 'Command/Ctrl+L opens the panel. For search text Enter opens the highlighted result, which can be a strong local match; the exact-text web search is chosen explicitly. Slash commands shown exist in copy/slash-commands.json at v1.30.0.',
  },
  blocking: {
    evidence: ['src/main/adblock.js', 'src/main/shield-model.js', 'settings-schema/schema.json', 'src/renderer/overlay.html', 'spec/acceptance/ad-blocking.feature', 'adblock/sources/pinned.json'],
    qualification: 'Blanc Blocker is on by default (adblockEnabled true) with bundled EasyList and EasyPrivacy. The shield popover shows the blocked count, the connection scheme and a per-site switch that reloads the page. No blocker removes every ad or tracker. uBlock Origin is optional on supported builds and applies after restart; private tabs use Blanc Blocker.',
  },
  quietTabs: {
    evidence: ['src/main/tab-sleep.js', 'src/main/main.js', 'settings-schema/schema.json', 'spec/acceptance/quiet-tabs.feature', 'test/unit/tab-sleep.test.js'],
    qualification: 'Eligible inactive background tabs release renderer memory after the device-local delay (off, 30m, 1h default, 6h) and reload when revisited. Audible, muted, pinned, capturing, dirty or otherwise ineligible tabs stay awake. A quiet tab reloads; it does not resume all live page state. Claims name memory only.',
  },
  reopening: {
    evidence: ['src/main/closed-tabs.js', 'src/main/main.js', 'src/renderer/overlay.js', 'test/unit/closed-tabs.test.js'],
    qualification: 'Per-window Recently Closed, capped at 25 entries that expire after one hour, memory only. At most one eligible closed page per window keeps its live view for about 30 seconds; after that a snapshot or URL restore may reload. Private tabs are never recorded. No promise of exact recovery.',
  },
  privateTabs: {
    evidence: ['src/main/main.js', 'src/main/tab-view.js', 'spec/acceptance/private-tabs.feature'],
    qualification: 'Private tabs use a separate non-persistent session, are excluded from history, session restore, sync and Recently Closed, and show a private Island theme with a quick-exit chip. Private does not mean anonymous; downloaded files remain on disk.',
  },
  island: {
    evidence: ['src/renderer/index.html', 'src/renderer/renderer.js', 'src/renderer/styles.css', 'spec/acceptance/island-and-commands.feature'],
    qualification: 'The resting Island occupies a reserved 68px band above the page and replaces the permanent tab strip and toolbar; its expanded panel overlays the page. Do not claim the resting Island floats over web content.',
  },
  namedGroups: {
    evidence: ['spec/acceptance/tabs-and-groups.feature', 'spec/acceptance/tab-drag.feature', 'src/renderer/overlay.js', 'src/main/main.js'],
    qualification: 'Named Groups are created and assigned by the user; Blanc does not infer or sort them. Drag ordering is user-directed (v1.30.0).',
  },
  startPage: {
    evidence: ['src/main/settings.js', 'src/renderer/pages/newtab.js', 'src/renderer/pages/mahjong-engine.js', 'settings-schema/schema.json'],
    qualification: 'Four layouts: Ledger, Billboard, Shelf, Tally. Every Start Page footer opens Mahjong in its own tab with eight solvable boards and a Daily deal; device-local, not synced or multiplayer.',
  },
  workspaces: {
    evidence: ['src/main/workspaces.js', 'src/main/main.js', 'spec/acceptance/F41-named-workspaces.feature'],
    qualification: 'Active Patrons can create and save Named Workspaces; a bound workspace saves its tabs and groups as the user browses. Existing workspaces stay usable after membership ends. Not automatic task detection.',
  },
  glance: {
    evidence: ['src/main/glance-layout.js', 'src/main/main.js', 'spec/acceptance/glance.feature', 'test/unit/glance-layout.test.js'],
    qualification: 'Glance shows another tab from the same window beside the main page; it can be resized, swapped or closed and is never restored or synced.',
  },
  gestures: {
    evidence: ['src/main/mouse-gestures.js', 'settings-schema/schema.json', 'test/unit/mouse-gestures.test.js'],
    qualification: 'Off by default; enabled in Settings → General. Physical mouse: right-button drag. Trackpad: Alt/Option plus one-finger click-and-drag. Device-local.',
  },
  verticalTabs: {
    evidence: ['src/renderer/vertical-tabs.js', 'spec/acceptance/vertical-tabs.feature', 'spec/acceptance/tab-drag.feature'],
    qualification: 'Optional resizable left rail; the Island remains the address and command surface. Drag ordering in the rail is user-directed (v1.30.0).',
  },
  profiles: {
    evidence: ['src/main/local-profiles.js', 'src/main/local-profile-model.js', 'src/main/profile-sessions.js', 'spec/acceptance/local-profiles.feature'],
    qualification: 'Named local profiles separate cookies, site data, Favorites, history, download metadata and remembered permissions; device settings and Patron are shared.',
  },
  sync: {
    evidence: ['src/main/sync.js', 'src/main/sync-crypto.js', 'spec/acceptance/sync.feature'],
    qualification: 'Opt-in, end-to-end encrypted sync of Favorites, settings and optional open-tab snapshots, from the Personal profile only. History, cookies and private tabs are never synced.',
  },
  security: {
    evidence: ['src/main/main.js', 'src/main/permissions.js', 'src/main/webauthn.js', 'docs/release-verification.md'],
    qualification: 'Tabs run sandboxed with context isolation; releases are signed; permissions are explicit; Touch ID passkeys are device-bound Blanc passkeys on macOS and do not read third-party credential managers.',
  },
  onepassword: {
    evidence: ['src/main/onepassword-broker.js', 'src/main/onepassword-availability.js', 'src/main/credential-fill-controller.js', 'docs/1password-integration.md'],
    qualification: 'macOS only, optional, depends on the installed 1Password app and account; enabled in Settings and invoked explicitly with ⌥⌘P, View menu or /1password. Never automatic fill.',
  },
  details: {
    evidence: ['src/main/bookmark-import.js', 'src/main/browser-data-import.js', 'src/main/capture-state.js', 'src/main/diagnostics-export.js'],
    qualification: 'Unchanged reviewed wording carried from the previous Features page.',
  },
};
const groupForSection = {
  overview: 'overview', commands: 'quickSwitcher', 'ad-blocking': 'blocking', 'quiet-tabs': 'quietTabs',
  'reopen-closed-tabs': 'reopening', 'private-tabs': 'privateTabs', 'more-features': 'overview',
  island: 'island', 'tab-groups': 'namedGroups', 'start-page': 'startPage', workspaces: 'workspaces',
  glance: 'glance', 'mouse-gestures': 'gestures', 'vertical-tabs': 'verticalTabs', profiles: 'profiles',
  sync: 'sync', security: 'security', '1password': 'onepassword', details: 'details',
};

// 1. Claims: every element above the Patron band that is not already an
//    existing claim's exact wording becomes a new hub claim.
const main = page.slice(page.indexOf('<main'), page.indexOf('class="hub-patron"'));
const existing = new Set([...v127.claims, ...reorder.claims].filter(c => c.source === file).map(c => c.exactWording));
const sectionStarts = [...main.matchAll(/<(?:FeatureScene|FeatureTile|section)\b[^>]*\bid="([^"]+)"/g)].map(m => [m.index, m[1]]);
const sectionAt = index => sectionStarts.filter(([start]) => start <= index).at(-1)?.[1] ?? 'overview';
const claims = [];
for (const match of main.matchAll(/<(h[1-6]|p|figcaption|li|button)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
  const exactWording = normalize(match[2]);
  if (!exactWording || existing.has(exactWording)) continue;
  const section = sectionAt(match.index);
  const group = groupForSection[section];
  if (!group) throw new Error(`no evidence group for #${section}: ${exactWording}`);
  claims.push({ id: `hub-130-${String(claims.length + 1).padStart(3, '0')}`, source: file, exactWording, subject: 'Blanc', evidenceGroups: [group], verdict: 'qualified' });
}
const used = new Set(claims.flatMap(c => c.evidenceGroups));
const hub = {
  publicRelease: 'v1.30.0',
  sourceSha: '5be79e58d08ca9bcf7cb99b3d8f84c21c654b1c7',
  releaseEvidence: 'docs/release-incidents/2026-10-07-v1.30.0.md',
  scope: 'Features page redesign (October 8, 2026). Every evidence path is at the immutable publicRelease tag. Decorative stage replicas reuse v1.30.0 interface strings and label sample numbers as samples. Replaced wording is recorded as supersededClaims in docs/website-revamp-claims-v1.27.json, and the new prose as a reviewedCopyUpdate there.',
  evidenceGroups: Object.fromEntries(Object.entries(evidenceGroups).filter(([key]) => used.has(key))),
  claims,
};
fs.writeFileSync('docs/website-features-hub-claims-v1.30.json', `${JSON.stringify(hub, null, 2)}\n`);

// 2. Supersede v1.27 Features-page claims whose wording left the page.
const flat = page.replace(/\s+/g, ' ');
const gone = v127.claims.filter(c => c.source === file && !normalize(page).includes(c.exactWording) && !flat.includes(c.exactWording));
v127.claims = v127.claims.filter(c => !gone.includes(c));
for (const claim of gone) {
  v127.supersededClaims.push({ id: claim.id, historicalLedger: v127Path,
    reason: 'October 8, 2026 Features page redesign replaced this wording; see docs/website-features-hub-claims-v1.30.json. The original wording remains in git history.' });
}

// 3. Reviewed copy update: the prose guard replays these replacements on the
//    pre-revamp source, so record the whole reviewed <main> swap.
// Same revision test/unit/site-navigation.test.js replays from.
const revision = '358cc02df00f10d184b84dbfdae6f6bfdfa6a790';
let reviewed = execFileSync('git', ['show', `${revision}:${file}`], { encoding: 'utf8' });
const entry = v127.retainedFeaturePages.reviewedCopyUpdates.find(update => update.source === file);
for (const { before, after } of entry.replacements) reviewed = reviewed.replace(before, after);
const mainBlock = text => text.slice(text.indexOf('<main'), text.indexOf('</main>') + '</main>'.length);
const after = mainBlock(page);
if (after.includes('$')) throw new Error('replacement contains $; String.replace would expand it');
entry.replacements.push({ before: mainBlock(reviewed), after });
entry.reason += ' October 8 redesign: scenes, tile grid and feature-first copy, verified at public v1.30.0 and recorded in docs/website-features-hub-claims-v1.30.json.';
fs.writeFileSync(v127Path, `${JSON.stringify(v127, null, 1)}\n`);

console.log(`hub claims: ${claims.length}; superseded: ${gone.map(c => c.id).join(', ')}`);
```

Expected output: about 70 hub claims; superseded ids include `website-115-012` … `website-115-033` (not `034`–`042`) and `onepassword-126-022`, `onepassword-126-023`.

Before running it, check the v1.27 file's indentation (`head -3 docs/website-revamp-claims-v1.27.json`) and that `test/unit/site-navigation.test.js` still replays from `358cc02df00f10d184b84dbfdae6f6bfdfa6a790`. If the file is indented with 2 spaces, change the `JSON.stringify(v127, null, 1)` call to `null, 2` so the diff only shows real changes.

- [ ] **Step 4: Review the generated diff by hand**

```bash
git diff --stat
git diff docs/website-revamp-claims-v1.27.json | head -80
```
Confirm: only the superseded claims moved, the `features.astro` reviewed update gained one replacement, and no other ledger entries changed. Read every `exactWording` in the new ledger against Task 1's copy.

- [ ] **Step 5: Run the unit suite**

Run: `npm run test:unit`
Expected: PASS, including `site-navigation.test.js` (prose guard, ids, metadata) and every test in `website-feature-evidence.test.js`. If an evidence path fails `git cat-file -e v1.30.0:<path>`, find the file's name at the tag with `git ls-tree -r --name-only v1.30.0 | grep <name>`, fix the path in the builder, and rerun Steps 3–5 from a clean ledger (`git checkout docs/website-revamp-claims-v1.27.json` first).

- [ ] **Step 6: Commit Tasks 1 and 2 together**

```bash
git add site/src/components/features site/src/styles/features-hub.css site/src/scripts/feature-scenes.js site/src/pages/features.astro test/site/features-hub.test.mjs test/site/feature-expansion.test.mjs docs/website-features-hub-claims-v1.30.json docs/website-revamp-claims-v1.27.json test/unit/website-feature-evidence.test.js
git commit -m "Rebuild the Features page around scenes and a tile grid with feature-first copy

Records every new sentence against public v1.30.0 and supersedes the
replaced Features-page claims.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Scene playback

**Files:**
- Modify: `site/src/scripts/feature-scenes.js` (replace the placeholder comment)
- Modify: `test/site/features-hub.test.mjs` (append three tests)

**Interfaces:**
- Consumes: `[data-scene]` sections with `data-step`, `[data-step-button="1|2|3"]`, `[data-replay]`, `.hub-stage` (Task 1).
- Produces: runtime attributes `data-step` (`"1"`, `"2"`, `"3"`), `data-motion` (`"waiting"`, `"on"`, `"off"`), `aria-pressed` on step buttons. Stage CSS in Tasks 4–8 keys only off `data-step`.

- [ ] **Step 1: Write the failing playback tests**

Append to `test/site/features-hub.test.mjs`:

```js
test('without script every scene rests on its final step with all captions visible', async () => {
  const context = await contextFor({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const steps = await page.locator('[data-scene]').evaluateAll(s => s.map(el => el.dataset.step));
    assert.deepEqual(steps, ['3', '3', '3', '3', '3']);
    for (const button of await page.locator('[data-step-button]').all()) assert.ok(await button.isVisible());
  } finally { await context.close(); }
});

test('reduced motion never autoplays a scene', async () => {
  const context = await contextFor({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    for (const id of ['commands', 'ad-blocking', 'quiet-tabs', 'reopen-closed-tabs', 'private-tabs']) {
      await page.locator(`#${id} .hub-stage`).scrollIntoViewIfNeeded();
    }
    await page.waitForTimeout(3000);
    const state = await page.locator('[data-scene]').evaluateAll(s => s.map(el => [el.dataset.step, el.dataset.motion ?? null]));
    assert.deepEqual(state, Array(5).fill(['3', null]));
  } finally { await context.close(); }
});

test('a scene below the fold plays steps 1 to 3 once in view, and choosing a step stops it', { timeout: 30000 }, async () => {
  const context = await contextFor({ reducedMotion: 'no-preference', viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    assert.equal(await page.locator('#ad-blocking').getAttribute('data-motion'), 'waiting');
    await page.evaluate(() => {
      window.__steps = [];
      const scene = document.getElementById('ad-blocking');
      new MutationObserver(() => window.__steps.push(scene.dataset.step)).observe(scene, { attributes: true, attributeFilter: ['data-step'] });
    });
    await page.locator('#ad-blocking .hub-stage').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.getElementById('ad-blocking').dataset.step === '3' && window.__steps.includes('2'), null, { timeout: 9000 });
    assert.equal(await page.locator('#ad-blocking [data-replay]').isVisible(), true);

    await page.locator('#quiet-tabs .hub-stage').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.getElementById('quiet-tabs').dataset.motion === 'on');
    await page.locator('#quiet-tabs [data-step-button="1"]').click();
    await page.waitForTimeout(3200);
    assert.equal(await page.locator('#quiet-tabs').getAttribute('data-step'), '1');
    assert.equal(await page.locator('#quiet-tabs [data-step-button="1"]').getAttribute('aria-pressed'), 'true');

    await page.locator('#quiet-tabs [data-replay]').click();
    await page.waitForFunction(() => document.getElementById('quiet-tabs').dataset.step === '3', null, { timeout: 9000 });
  } finally { await context.close(); }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run the **Site test loop** with `features-hub`.
Expected: the no-script and reduced-motion tests PASS already (server HTML rests on 3); the autoplay test FAILS on `data-motion` being `null`.

- [ ] **Step 3: Implement `feature-scenes.js`**

```js
/* Plays each Features-page scene once when its stage scrolls into view.
   Server HTML rests every scene on step 3, so visitors without script or
   with reduced motion see the most informative state. Motion state is added
   only when motion is welcome and the scene starts below the viewport, the
   same rule as reveal.js. A scene plays once for about five seconds, so it
   needs no hover pause; choosing a step stops it, and a hidden tab pauses it. */
const STEP_MS = 2500;
const TICK_MS = 250;
const LAST = 3;
const scenes = [...document.querySelectorAll('[data-scene]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const state = new Map(scenes.map(scene => [scene, { playing: false, elapsed: 0 }]));
let timer = null;

function show(scene, step) {
  scene.dataset.step = String(step);
  for (const button of scene.querySelectorAll('[data-step-button]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.stepButton) === step));
  }
}

function setReplay(scene, visible) {
  scene.querySelector('[data-replay]').hidden = !visible || reducedMotion.matches;
}

function stop(scene) {
  state.get(scene).playing = false;
  scene.dataset.motion = 'off';
}

function tick() {
  let active = false;
  for (const [scene, s] of state) {
    if (!s.playing) continue;
    active = true;
    if (document.hidden) continue;
    s.elapsed += TICK_MS;
    const step = Math.min(LAST, 1 + Math.floor(s.elapsed / STEP_MS));
    if (String(step) !== scene.dataset.step) show(scene, step);
    if (step === LAST) { s.playing = false; setReplay(scene, true); }
  }
  if (!active) { clearInterval(timer); timer = null; }
}

function play(scene) {
  Object.assign(state.get(scene), { playing: true, elapsed: 0 });
  scene.dataset.motion = 'on';
  setReplay(scene, false);
  show(scene, 1);
  timer ??= setInterval(tick, TICK_MS);
}

for (const scene of scenes) {
  show(scene, LAST);
  scene.addEventListener('click', event => {
    const button = event.target.closest('[data-step-button]');
    if (button) {
      stop(scene);
      show(scene, Number(button.dataset.stepButton));
      setReplay(scene, true);
    } else if (event.target.closest('[data-replay]')) {
      play(scene);
    }
  });
}

if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const scene = entry.target.closest('[data-scene]');
      observer.unobserve(entry.target);
      if (scene.dataset.motion === 'waiting') play(scene);
    }
  }, { threshold: 0.6 });

  for (const scene of scenes) {
    if (scene.getBoundingClientRect().top <= innerHeight) continue;
    scene.dataset.motion = 'waiting';
    show(scene, 1);
    observer.observe(scene.querySelector('.hub-stage'));
  }

  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    observer.disconnect();
    for (const scene of scenes) {
      state.get(scene).playing = false;
      delete scene.dataset.motion;
      show(scene, LAST);
      setReplay(scene, false);
    }
  });
}
```

Note: a step-button click on a scene still `waiting` sets `data-motion="off"`, so the observer callback leaves it alone.

- [ ] **Step 4: Run the tests to verify they pass**

Run the **Site test loop** with `features-hub`.
Expected: all five tests PASS.

- [ ] **Step 5: Commit**

```bash
git add site/src/scripts/feature-scenes.js test/site/features-hub.test.mjs
git commit -m "Play each Features scene once when it scrolls into view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Shared mini-UI styles and the Quick Switcher stage

**Files:**
- Create: `site/src/components/features/stages/QuickSwitcherStage.astro`
- Modify: `site/src/styles/features-hub.css` (append the mini-UI section)
- Modify: `site/src/pages/features.astro` (import and place the stage)
- Modify: `test/site/features-hub.test.mjs` (append one test)

**Interfaces:**
- Consumes: `.hub-scene[data-step]`, `.hub-stage` (container), Task 3's `data-step` changes.
- Produces: step attributes for every stage: `data-at="1 2 3"` (visible only at those steps), `data-dim="…"` (dimmed at those steps), `data-on="…"` (switch or highlight on at those steps), `data-hl="…"` (row highlight at those steps). Classes `.hub-ui`, `.ui-stack`, `.ui-panel`, `.ui-input`, `.ui-caret`, `.ui-placeholder`, `.ui-kbd`, `.ui-sec`, `.ui-row`, `.ui-row-title`, `.ui-row-meta`, `.ui-fav` + `--a … --e`, `.ui-glyph`, `.ui-cmd`, `.ui-pill`, `.ui-dots`, `.ui-switch`, `.ui-pointer`, `.ui-card`.

- [ ] **Step 1: Write the failing test**

Append to `test/site/features-hub.test.mjs`:

```js
test('every scene stage shows exactly its own step', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    for (const id of await page.locator('[data-scene]').evaluateAll(s => s.map(el => el.id))) {
      const stage = page.locator(`#${id} .hub-stage .hub-ui`);
      if (!await stage.count()) continue; // stages land one task at a time
      for (const step of ['1', '2', '3']) {
        await page.evaluate(([sceneId, n]) => { document.getElementById(sceneId).dataset.step = n; }, [id, step]);
        const wrong = await stage.locator('[data-at]').evaluateAll((els, n) => els.filter(el =>
          (getComputedStyle(el).visibility === 'visible') !== el.dataset.at.split(' ').includes(n)).length, step);
        assert.equal(wrong, 0, `${id} step ${step}`);
      }
      assert.ok(await stage.locator('[data-at]').count() >= 3, `${id}: has per-step states`);
    }
    assert.equal(await page.locator('#commands .hub-ui').count(), 1, 'Quick Switcher stage present');
  } finally { await context.close(); }
});
```

- [ ] **Step 2: Run to verify it fails**

Run the **Site test loop** with `features-hub`.
Expected: FAIL on `Quick Switcher stage present`.

- [ ] **Step 3: Append the shared mini-UI CSS**

Append to `site/src/styles/features-hub.css`:

```css
/* Mini product UI inside scene stages. Every size is in em from a font size
   that follows the stage width (container query units), so a stage shrinks
   as one picture instead of reflowing. Strings mirror v1.30.0. */
.hub-ui {
  --ui-surface: #FFFFFF;
  --ui-text: #0E0E0E;
  --ui-dim: #6B6B6B;
  --ui-line: #ECEAE5;
  --ui-row-on: #F3F1EC;
  position: relative;
  color: var(--ui-text);
  font-family: var(--font-ui);
  font-size: clamp(9px, 2.45cqw, 13.5px);
  line-height: 1.35;
  text-align: left;
}
.hub-ui .ui-stack { display: grid; }
.hub-ui .ui-stack > * { grid-area: 1 / 1; min-width: 0; }

/* Step attributes: data-at shows, data-dim dims, data-on switches on,
   data-hl highlights a row, each at the listed steps. */
.hub-ui [data-at] { opacity: 0; visibility: hidden; transition: opacity 0.35s ease, visibility 0s linear 0.35s; }
.hub-scene[data-step="1"] .hub-ui [data-at~="1"],
.hub-scene[data-step="2"] .hub-ui [data-at~="2"],
.hub-scene[data-step="3"] .hub-ui [data-at~="3"] { opacity: 1; visibility: visible; transition-delay: 0s; }
.hub-ui [data-dim] { transition: opacity 0.6s ease; }
.hub-scene[data-step="1"] .hub-ui [data-dim~="1"],
.hub-scene[data-step="2"] .hub-ui [data-dim~="2"],
.hub-scene[data-step="3"] .hub-ui [data-dim~="3"] { opacity: 0.36; }
.hub-scene[data-step="1"] .hub-ui [data-hl~="1"],
.hub-scene[data-step="2"] .hub-ui [data-hl~="2"],
.hub-scene[data-step="3"] .hub-ui [data-hl~="3"] { background: var(--ui-row-on); }

.ui-panel { overflow: hidden; border: 1px solid rgba(0, 0, 0, 0.06); border-radius: 1.4em; background: var(--ui-surface); box-shadow: 0 1.8em 3.6em -1.8em rgba(18, 16, 11, 0.5); }
.ui-input { display: flex; align-items: center; gap: 0.8em; padding: 1em 1.2em; border-bottom: 1px solid var(--ui-line); font-size: 1.15em; }
.ui-input > .ui-stack { flex: 1; }
.ui-placeholder { color: var(--ui-dim); }
.ui-caret { display: inline-block; width: 1.5px; height: 1em; margin-left: 1px; background: currentColor; vertical-align: -0.15em; animation: hub-caret 1.1s steps(1) infinite; }
@keyframes hub-caret { 50% { opacity: 0; } }
.ui-kbd { display: inline-flex; align-items: center; min-height: 1.6em; padding: 0 0.45em; border: 1px solid var(--ui-line); border-bottom-width: 2px; border-radius: 0.35em; background: #FFFFFF; color: var(--ui-dim); font-size: 0.78em; }
.ui-sec { margin: 0; padding: 0.9em 1.2em 0.35em; color: var(--ui-dim); font-size: 0.8em; letter-spacing: 0.04em; }
.ui-row { display: flex; align-items: center; gap: 0.75em; padding: 0.6em 1.2em; transition: background 0.35s ease; }
.ui-row-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-row-meta { color: var(--ui-dim); font-size: 0.85em; white-space: nowrap; }
.ui-fav { display: grid; flex: none; place-items: center; width: 1.3em; height: 1.3em; border-radius: 0.32em; color: #FFFFFF; font-size: 0.78em; font-weight: 600; }
.ui-fav--a { background: #3F5BD8; } .ui-fav--b { background: #C4573A; } .ui-fav--c { background: #2F7D5B; }
.ui-fav--d { background: #8A6A2F; } .ui-fav--e { background: #5B5B5B; }
.ui-glyph { display: grid; flex: none; place-items: center; width: 1.3em; color: var(--ui-dim); }
.ui-cmd { min-width: 6.4em; font-weight: 600; }
.ui-pill { display: inline-flex; align-items: center; gap: 0.9em; height: 3.1em; padding: 0 1.1em; border-radius: 1.3em; background: rgba(255, 255, 255, 0.97); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 0.4em 1.4em -0.9em rgba(14, 14, 14, 0.55); white-space: nowrap; }
.ui-dots { display: inline-flex; gap: 0.4em; }
.ui-dots i { width: 0.45em; height: 0.45em; border-radius: 50%; background: currentColor; opacity: 0.25; }
.ui-dots i.is-on { opacity: 1; }
.ui-switch { position: relative; flex: none; width: 2.3em; height: 1.35em; border-radius: 1em; background: #D9D5CE; transition: background 0.25s ease; }
.ui-switch::after { content: ""; position: absolute; top: 0.15em; left: 0.15em; width: 1.05em; height: 1.05em; border-radius: 50%; background: #FFFFFF; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); transition: transform 0.25s ease; }
.hub-scene[data-step="1"] .ui-switch[data-on~="1"],
.hub-scene[data-step="2"] .ui-switch[data-on~="2"],
.hub-scene[data-step="3"] .ui-switch[data-on~="3"] { background: #111111; }
.hub-scene[data-step="1"] .ui-switch[data-on~="1"]::after,
.hub-scene[data-step="2"] .ui-switch[data-on~="2"]::after,
.hub-scene[data-step="3"] .ui-switch[data-on~="3"]::after { transform: translateX(0.95em); }
.ui-pointer { position: absolute; width: 1.4em; height: 1.4em; color: #111111; filter: drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8)); pointer-events: none; }
.ui-card { padding: 1em 1.2em; border: 1px solid var(--ui-line); border-radius: 1em; background: var(--ui-surface); box-shadow: 0 1.2em 2.4em -1.6em rgba(18, 16, 11, 0.45); }

@media (prefers-reduced-motion: reduce) {
  .hub-ui *, .hub-ui *::after { transition: none !important; animation: none !important; }
}
```

- [ ] **Step 4: Create `QuickSwitcherStage.astro`**

```astro
---
// Decorative replica of the ⌘L panel; strings mirror v1.30.0
// (overlay.html placeholder, copy/slash-commands.json hints).
---
<div class="hub-ui hub-ui--switcher">
  <div class="ui-panel">
    <div class="ui-input">
      <span class="ui-stack">
        <span data-at="1"><span class="ui-placeholder">Search, enter address, or / for commands</span></span>
        <span data-at="2">lou<span class="ui-caret"></span></span>
        <span data-at="3">/<span class="ui-caret"></span></span>
      </span>
      <span class="ui-kbd">esc</span>
    </div>
    <div class="ui-stack">
      <div data-at="1">
        <p class="ui-sec">this window · 4 tabs</p>
        <div class="ui-row" data-hl="1"><span class="ui-fav ui-fav--a">W</span><span class="ui-row-title">Typography — Wikipedia</span></div>
        <div class="ui-row"><span class="ui-fav ui-fav--e">V</span><span class="ui-row-title">Visit Copenhagen — Guide</span></div>
        <div class="ui-row"><span class="ui-fav ui-fav--b">L</span><span class="ui-row-title">Louisiana Museum — Exhibitions</span></div>
        <div class="ui-row"><span class="ui-fav ui-fav--c">F</span><span class="ui-row-title">Flight search</span></div>
      </div>
      <div data-at="2">
        <p class="ui-sec">matches</p>
        <div class="ui-row" data-hl="2"><span class="ui-fav ui-fav--b">L</span><span class="ui-row-title">Louisiana Museum — Exhibitions</span><span class="ui-row-meta">open tab</span></div>
        <div class="ui-row"><span class="ui-fav ui-fav--d">L</span><span class="ui-row-title">Louvre — Collections</span><span class="ui-row-meta">favorite</span></div>
        <div class="ui-row"><span class="ui-fav ui-fav--c">L</span><span class="ui-row-title">Louisiana Channel — Videos</span><span class="ui-row-meta">history</span></div>
        <div class="ui-row"><span class="ui-glyph">▸</span><span class="ui-row-title">louisiana trip</span><span class="ui-row-meta">group · 3 tabs</span></div>
      </div>
      <div data-at="3">
        <p class="ui-sec">commands</p>
        <div class="ui-row" data-hl="3"><span class="ui-cmd">/private</span><span class="ui-row-title ui-row-meta">Open a private tab (history stays untouched)</span><span class="ui-kbd">↵</span></div>
        <div class="ui-row"><span class="ui-cmd">/find</span><span class="ui-row-title ui-row-meta">Find in page</span></div>
        <div class="ui-row"><span class="ui-cmd">/group</span><span class="ui-row-title ui-row-meta">Type a space, then a group name — e.g. “work”</span></div>
        <div class="ui-row"><span class="ui-cmd">/allow-ads</span><span class="ui-row-title ui-row-meta">Allow ads on this site</span></div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 5: Place it in the page**

In `features.astro`, add to the frontmatter imports:

```astro
import QuickSwitcherStage from '../components/features/stages/QuickSwitcherStage.astro';
```

and inside `<FeatureScene id="commands" tone="ink">`, after the `<a slot="link" …>` line:

```astro
    <QuickSwitcherStage slot="stage" />
```

- [ ] **Step 6: Run tests and look**

Run the **Site test loop** with `features-hub`, then `npm run test:unit` (the stage adds no page prose, so the ledger and prose guard still pass).
Expected: all PASS. Open `/features` at 1440 and 390 wide; click steps 1–3 in the Quick Switcher scene and screenshot each. Check the panel scales without wrapping or clipping at 390.

- [ ] **Step 7: Commit**

```bash
git add site/src/components/features/stages/QuickSwitcherStage.astro site/src/styles/features-hub.css site/src/pages/features.astro test/site/features-hub.test.mjs
git commit -m "Draw the Quick Switcher scene and the shared mini-UI styles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Shield stage

**Files:**
- Create: `site/src/components/features/stages/ShieldStage.astro`
- Modify: `site/src/styles/features-hub.css` (append)
- Modify: `site/src/pages/features.astro` (import and place)
- Modify: `test/site/features-hub.test.mjs:` the last assertion block of `every scene stage shows exactly its own step`

**Interfaces:**
- Consumes: Task 4's step attributes and `.ui-*` classes.

- [ ] **Step 1: Extend the stage test (failing)**

In `every scene stage shows exactly its own step`, after the `Quick Switcher stage present` assertion add:

```js
    assert.equal(await page.locator('#ad-blocking .hub-ui').count(), 1, 'Shield stage present');
```

Run the **Site test loop** with `features-hub`. Expected: FAIL on `Shield stage present`.

- [ ] **Step 2: Create `ShieldStage.astro`**

```astro
---
// Decorative replica of the resting Island and its Site protection popover.
// Strings mirror v1.30.0 overlay.html and shield-model.js; the count is a
// sample, as the scene copy says.
---
<div class="hub-ui hub-ui--shield">
  <div class="ui-shield-bar">
    <span class="ui-pill">
      <span class="ui-glyph">‹</span><span class="ui-glyph">›</span>
      <span class="ui-dots"><i class="is-on"></i><i></i><i></i></span>
      <span class="ui-fav ui-fav--b">L</span><span>louisiana.dk</span>
      <span class="ui-shield-chip">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 2.8 3.4v4.1c0 3.1 2.2 5.6 5.2 7 3-1.4 5.2-3.9 5.2-7V3.4z" /></svg>
        <span class="ui-stack"><span data-at="1 2">12</span><span data-at="3">0</span></span>
      </span>
      <span class="ui-glyph">↻</span>
    </span>
    <span class="ui-reload" data-at="3"></span>
  </div>
  <div class="ui-card ui-shield-pop" data-at="2 3">
    <div class="ui-shield-head"><span class="ui-shield-mark"></span><div><strong>Site protection</strong><p>louisiana.dk</p></div></div>
    <div class="ui-shield-provider"><span class="ui-row-meta">Current blocker</span><strong>Blanc Blocker</strong></div>
    <div class="ui-shield-toggle">
      <span>Ad &amp; tracker blocking <strong class="ui-stack"><span data-at="2">on</span><span data-at="3">off</span></strong></span>
      <span class="ui-switch" data-on="1 2"></span>
    </div>
    <p class="ui-shield-count ui-stack"><span data-at="2">12 ads &amp; trackers blocked on this page</span><span data-at="3">Ads allowed on this site</span></p>
    <p class="ui-shield-note">Changing site protection reloads this page.</p>
    <div class="ui-shield-meta"><span class="ui-row-meta">Connection</span><span>Uses HTTPS</span></div>
  </div>
  <svg class="ui-pointer ui-shield-pointer" data-at="2" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5v11.8l3.1-3 2 4.6 1.9-.8-2-4.5h4.3z" fill="currentColor" /></svg>
</div>
```

- [ ] **Step 3: Append its CSS**

```css
/* Shield scene */
.hub-ui--shield { min-height: 24em; padding-top: 0.5em; }
.ui-shield-bar { position: relative; display: flex; justify-content: center; }
.ui-shield-chip { display: inline-flex; align-items: center; gap: 0.3em; padding: 0.2em 0.5em; border-radius: 0.8em; background: var(--ui-row-on); font-variant-numeric: tabular-nums; }
.ui-shield-chip svg { width: 1.05em; height: 1.05em; fill: none; stroke: currentColor; stroke-width: 1.4; }
.ui-reload { position: absolute; bottom: -0.2em; left: 50%; width: 30%; height: 2px; border-radius: 2px; background: #111111; transform: translateX(-50%); }
.ui-shield-pop { position: absolute; top: 4.4em; right: 8%; width: min(26em, 84%); }
.ui-shield-head { display: flex; align-items: center; gap: 0.7em; padding-bottom: 0.8em; border-bottom: 1px solid var(--ui-line); }
.ui-shield-head p { margin: 0.1em 0 0; color: var(--ui-dim); font-size: 0.85em; }
.ui-shield-mark { width: 1.9em; height: 1.9em; border-radius: 50%; background: radial-gradient(circle at 50% 70%, #E9B85B 0 38%, transparent 40%), #F6E7C8; }
.ui-shield-provider { display: flex; flex-direction: column; gap: 0.15em; padding: 0.8em 0; border-bottom: 1px solid var(--ui-line); }
.ui-shield-toggle { display: flex; align-items: center; justify-content: space-between; gap: 1em; padding-top: 0.8em; }
.ui-shield-toggle strong { display: inline-grid; }
.ui-shield-count { margin: 0.5em 0 0; color: var(--ui-dim); font-size: 0.9em; }
.ui-shield-note { margin: 0.4em 0 0; color: var(--ui-dim); font-size: 0.8em; }
.ui-shield-meta { display: flex; justify-content: space-between; margin-top: 0.8em; padding-top: 0.8em; border-top: 1px solid var(--ui-line); font-size: 0.9em; }
.ui-shield-pointer { top: 2.1em; left: 63%; }
```

- [ ] **Step 4: Place it**

Import `ShieldStage` in `features.astro` and add `<ShieldStage slot="stage" />` inside `<FeatureScene id="ad-blocking" …>` after its link.

- [ ] **Step 5: Run tests and look**

Run the **Site test loop** with `features-hub`; then click steps 1–3 in the browser pane at 1440 and 390 wide. Expected: PASS; the popover never overflows the stage; step 3 shows "off", the switch off, and "Ads allowed on this site".

- [ ] **Step 6: Commit**

```bash
git add site/src/components/features/stages/ShieldStage.astro site/src/styles/features-hub.css site/src/pages/features.astro test/site/features-hub.test.mjs
git commit -m "Draw the shield scene on the Features page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Quiet Tabs stage

**Files:**
- Create: `site/src/components/features/stages/QuietTabsStage.astro`
- Modify: `site/src/styles/features-hub.css` (append)
- Modify: `site/src/pages/features.astro`
- Modify: `test/site/features-hub.test.mjs`

- [ ] **Step 1: Extend the stage test (failing)**

Add after the shield assertion:

```js
    assert.equal(await page.locator('#quiet-tabs .hub-ui').count(), 1, 'Quiet Tabs stage present');
    await page.evaluate(() => { document.getElementById('quiet-tabs').dataset.step = '2'; });
    assert.equal(await page.locator('#quiet-tabs [data-dim~="2"]').count(), 3, 'three background tabs go quiet');
```

Run the **Site test loop** with `features-hub`. Expected: FAIL on `Quiet Tabs stage present`.

- [ ] **Step 2: Create `QuietTabsStage.astro`**

```astro
---
// Decorative replica of a group in the ⌘L panel. Quiet tabs are shown by
// dimming only, as the app marks them; the playing tab stays loaded.
---
<div class="hub-ui hub-ui--quiet">
  <div class="ui-panel">
    <div class="ui-input"><span class="ui-placeholder">Search, enter address, or / for commands</span></div>
    <p class="ui-sec">trip · 5 tabs</p>
    <div class="ui-row" data-hl="1 2 3"><span class="ui-fav ui-fav--a">W</span><span class="ui-row-title">Typography — Wikipedia</span><span class="ui-row-meta">this tab</span></div>
    <div class="ui-row" data-dim="2 3"><span class="ui-fav ui-fav--e">V</span><span class="ui-row-title">Visit Copenhagen — Guide</span></div>
    <div class="ui-row ui-quiet-wake" data-dim="2"><span class="ui-fav ui-fav--b">L</span><span class="ui-row-title">Louisiana Museum — Exhibitions</span><span class="ui-reload-row" data-at="3"></span></div>
    <div class="ui-row"><span class="ui-fav ui-fav--c">R</span><span class="ui-row-title">Radio — Live</span><span class="ui-row-meta">♪ playing</span></div>
    <div class="ui-row" data-dim="2 3"><span class="ui-fav ui-fav--d">F</span><span class="ui-row-title">Flight search</span></div>
  </div>
  <span class="ui-quiet-clock ui-stack"><span data-at="1">now</span><span data-at="2 3">1 hour later</span></span>
  <svg class="ui-pointer ui-quiet-pointer" data-at="3" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5v11.8l3.1-3 2 4.6 1.9-.8-2-4.5h4.3z" fill="currentColor" /></svg>
</div>
```

- [ ] **Step 3: Append its CSS**

```css
/* Quiet Tabs scene */
.hub-ui--quiet { padding-top: 2.2em; }
.ui-quiet-clock { position: absolute; top: 0; right: 0; display: grid; padding: 0.25em 0.7em; border-radius: 1em; background: rgba(255, 255, 255, 0.12); color: var(--hub-on-ink, #F3EAD8); font-size: 0.85em; }
.ui-quiet-wake { position: relative; }
.ui-reload-row { position: absolute; left: 1.2em; right: 1.2em; bottom: 0.15em; height: 2px; border-radius: 2px; background: #111111; transform-origin: left; animation: hub-reload 1.4s ease-out both; }
@keyframes hub-reload { from { transform: scaleX(0); } to { transform: scaleX(1); opacity: 0; } }
.ui-quiet-pointer { right: 18%; top: 11.6em; }
```

- [ ] **Step 4: Place it**

Import `QuietTabsStage` and add `<QuietTabsStage slot="stage" />` inside `<FeatureScene id="quiet-tabs" …>` after its link.

- [ ] **Step 5: Run tests and look**

Run the **Site test loop** with `features-hub`. Expected: PASS. Check at 390 wide that the clock chip does not overlap the panel.

- [ ] **Step 6: Commit**

```bash
git add site/src/components/features/stages/QuietTabsStage.astro site/src/styles/features-hub.css site/src/pages/features.astro test/site/features-hub.test.mjs
git commit -m "Draw the Quiet Tabs scene on the Features page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Reopen Closed Tab stage

**Files:**
- Create: `site/src/components/features/stages/ReopenStage.astro`
- Modify: `site/src/styles/features-hub.css` (append)
- Modify: `site/src/pages/features.astro`
- Modify: `test/site/features-hub.test.mjs`

- [ ] **Step 1: Extend the stage test (failing)**

```js
    assert.equal(await page.locator('#reopen-closed-tabs .hub-ui').count(), 1, 'Reopen stage present');
```

Run the **Site test loop** with `features-hub`. Expected: FAIL on `Reopen stage present`.

- [ ] **Step 2: Create `ReopenStage.astro`**

```astro
---
// Decorative replica of the ⌘L panel's tab list and its foldable
// "recently closed" line (v1.30.0 overlay.js), unfolded.
---
<div class="hub-ui hub-ui--reopen">
  <div class="ui-panel">
    <div class="ui-input"><span class="ui-placeholder">Search, enter address, or / for commands</span><span class="ui-kbd">⌘⇧T</span></div>
    <div class="ui-stack">
      <div data-at="1">
        <p class="ui-sec">this window · 4 tabs</p>
        <div class="ui-row"><span class="ui-fav ui-fav--a">W</span><span class="ui-row-title">Typography — Wikipedia</span></div>
        <div class="ui-row ui-row--closing" data-hl="1"><span class="ui-fav ui-fav--b">L</span><span class="ui-row-title">Louisiana Museum — Exhibitions</span><span class="ui-glyph ui-close">×</span></div>
        <div class="ui-row"><span class="ui-fav ui-fav--e">V</span><span class="ui-row-title">Visit Copenhagen — Guide</span></div>
        <div class="ui-row"><span class="ui-fav ui-fav--c">F</span><span class="ui-row-title">Flight search</span></div>
      </div>
      <div data-at="2">
        <p class="ui-sec">this window · 3 tabs</p>
        <div class="ui-row"><span class="ui-fav ui-fav--a">W</span><span class="ui-row-title">Typography — Wikipedia</span></div>
        <div class="ui-row"><span class="ui-fav ui-fav--e">V</span><span class="ui-row-title">Visit Copenhagen — Guide</span></div>
        <div class="ui-row"><span class="ui-fav ui-fav--c">F</span><span class="ui-row-title">Flight search</span></div>
        <p class="ui-sec">⌄ recently closed 3</p>
        <div class="ui-row" data-hl="2"><span class="ui-fav ui-fav--b">L</span><span class="ui-row-title">Louisiana Museum — Exhibitions</span><span class="ui-row-meta">just now</span></div>
        <div class="ui-row"><span class="ui-glyph">▸</span><span class="ui-row-title">research · 4 tabs</span><span class="ui-row-meta">2 min</span></div>
        <div class="ui-row"><span class="ui-fav ui-fav--d">T</span><span class="ui-row-title">Train times</span><span class="ui-row-meta">9 min</span></div>
      </div>
      <div data-at="3">
        <p class="ui-sec">this window · 4 tabs</p>
        <div class="ui-row"><span class="ui-fav ui-fav--a">W</span><span class="ui-row-title">Typography — Wikipedia</span></div>
        <div class="ui-row" data-hl="3"><span class="ui-fav ui-fav--b">L</span><span class="ui-row-title">Louisiana Museum — Exhibitions</span><span class="ui-row-meta">back</span></div>
        <div class="ui-row"><span class="ui-fav ui-fav--e">V</span><span class="ui-row-title">Visit Copenhagen — Guide</span></div>
        <div class="ui-row"><span class="ui-fav ui-fav--c">F</span><span class="ui-row-title">Flight search</span></div>
        <p class="ui-sec">⌄ recently closed 2</p>
        <div class="ui-row"><span class="ui-glyph">▸</span><span class="ui-row-title">research · 4 tabs</span><span class="ui-row-meta">2 min</span></div>
        <div class="ui-row"><span class="ui-fav ui-fav--d">T</span><span class="ui-row-title">Train times</span><span class="ui-row-meta">9 min</span></div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Append its CSS**

```css
/* Reopen Closed Tab scene */
.hub-ui--reopen .ui-input { justify-content: space-between; }
.ui-close { color: var(--ui-text); font-size: 1.15em; }
.hub-scene[data-step="1"] .ui-row--closing { box-shadow: inset 2px 0 0 #111111; }
```

- [ ] **Step 4: Place it**

Import `ReopenStage` and add `<ReopenStage slot="stage" />` inside `<FeatureScene id="reopen-closed-tabs" …>` after its link.

- [ ] **Step 5: Run tests and look**

Run the **Site test loop** with `features-hub`. Expected: PASS. The step-2 list is the tallest; confirm the stage height doesn't jump between steps (the `.ui-stack` grid keeps all three in one cell).

- [ ] **Step 6: Commit**

```bash
git add site/src/components/features/stages/ReopenStage.astro site/src/styles/features-hub.css site/src/pages/features.astro test/site/features-hub.test.mjs
git commit -m "Draw the Reopen Closed Tab scene on the Features page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Private tabs stage

**Files:**
- Create: `site/src/components/features/stages/PrivateStage.astro`
- Modify: `site/src/styles/features-hub.css` (append)
- Modify: `site/src/pages/features.astro`
- Modify: `test/site/features-hub.test.mjs`

- [ ] **Step 1: Extend the stage test (failing)**

```js
    assert.equal(await page.locator('#private-tabs .hub-ui').count(), 1, 'Private stage present');
```

Run the **Site test loop** with `features-hub`. Expected: FAIL on `Private stage present`.

- [ ] **Step 2: Create `PrivateStage.astro`**

```astro
---
// Decorative replica of the resting Island switching to its private theme
// (dashed outline, private chip) beside a history card that does not change.
---
<div class="hub-ui hub-ui--private">
  <div class="ui-stack ui-private-bar">
    <span class="ui-pill" data-at="1">
      <span class="ui-glyph">‹</span><span class="ui-glyph">›</span>
      <span class="ui-dots"><i class="is-on"></i><i></i></span>
      <span class="ui-fav ui-fav--a">W</span><span>wikipedia.org</span>
    </span>
    <span class="ui-pill ui-pill--private" data-at="2 3">
      <span class="ui-glyph">‹</span><span class="ui-glyph">›</span>
      <span class="ui-dots"><i class="is-on"></i></span>
      <span>louisiana.dk</span>
      <span class="ui-private-chip">private ×</span>
    </span>
  </div>
  <div class="ui-card ui-history">
    <p class="ui-sec">history · today</p>
    <div class="ui-row" data-hl="1"><span class="ui-fav ui-fav--a">W</span><span class="ui-row-title">Typography — Wikipedia</span><span class="ui-row-meta">just now</span></div>
    <div class="ui-row"><span class="ui-fav ui-fav--e">V</span><span class="ui-row-title">Visit Copenhagen — Guide</span><span class="ui-row-meta">10:42</span></div>
    <div class="ui-row"><span class="ui-fav ui-fav--c">F</span><span class="ui-row-title">Flight search</span><span class="ui-row-meta">09:15</span></div>
    <p class="ui-history-note" data-at="3">No new entries while private.</p>
  </div>
</div>
```

- [ ] **Step 3: Append its CSS**

```css
/* Private tabs scene: dashed pill = the app's private theme */
.hub-ui--private { display: grid; gap: 1.6em; justify-items: center; }
.ui-private-bar { justify-items: center; }
.ui-pill--private { border: 1.5px dashed #6B6B6B; background: #F4F2EE; }
.ui-private-chip { padding: 0.2em 0.6em; border: 1px dashed #6B6B6B; border-radius: 1em; color: #3A3A3A; font-size: 0.85em; }
.hub-scene[data-step="3"] .ui-private-chip { border-color: var(--site-gold-on-dark); box-shadow: 0 0 0 0.25em rgba(212, 173, 102, 0.35); }
.ui-history { width: min(28em, 100%); padding: 0.4em 0 0.8em; }
.ui-history-note { margin: 0.5em 1.2em 0; color: var(--ui-dim); font-size: 0.85em; }
```

- [ ] **Step 4: Place it**

Import `PrivateStage` and add `<PrivateStage slot="stage" />` inside `<FeatureScene id="private-tabs" …>` after its link.

- [ ] **Step 5: Run tests and look**

Run the **Site test loop** with `features-hub`, then `npm run test:unit`. Expected: PASS. Check the dashed pill reads as private against the ink band.

- [ ] **Step 6: Commit**

```bash
git add site/src/components/features/stages/PrivateStage.astro site/src/styles/features-hub.css site/src/pages/features.astro test/site/features-hub.test.mjs
git commit -m "Draw the private tabs scene on the Features page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tile illustrations

**Files:**
- Modify: `site/src/pages/features.astro` (add `slot="art"` markup to each `FeatureTile`)
- Modify: `site/src/styles/features-hub.css` (append)
- Modify: `test/site/features-hub.test.mjs` (append one test)

- [ ] **Step 1: Write the failing test**

```js
test('every index tile has an illustration and stays one link', async () => {
  const context = await contextFor();
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/features`);
    const tiles = await page.locator('.hub-tile').evaluateAll(ts => ts.map(t => ({
      id: t.id, art: t.querySelector('.hub-tile-art').children.length, links: t.querySelectorAll('a').length })));
    assert.equal(tiles.length, 11);
    for (const tile of tiles) {
      assert.ok(tile.art > 0, `${tile.id}: illustration`);
      assert.equal(tile.links, 1, `${tile.id}: one link`);
    }
  } finally { await context.close(); }
});
```

Run the **Site test loop** with `features-hub`. Expected: FAIL on `island: illustration`.

- [ ] **Step 2: Add the art to each tile**

Inside each `FeatureTile` in `features.astro`, add as the first child (the slot keeps it in the art area, before the copy):

Island:
```astro
        <div slot="art" class="art-island"><span class="ui-pill"><span class="ui-glyph">‹</span><span class="ui-glyph">›</span><span class="ui-dots"><i class="is-on"></i><i></i><i></i><i></i></span><span class="ui-fav ui-fav--a">W</span><span>wikipedia.org</span><span class="art-shield"><svg viewBox="0 0 16 16"><path d="M8 1.5 2.8 3.4v4.1c0 3.1 2.2 5.6 5.2 7 3-1.4 5.2-3.9 5.2-7V3.4z" /></svg>4</span><span class="ui-glyph">↻</span><span class="ui-glyph">♡</span></span></div>
```
Named Groups:
```astro
        <div slot="art" class="art-groups"><span class="art-line art-head">▾ trip <span>3</span></span><span class="art-line">Louisiana Museum</span><span class="art-line">Train times</span><span class="art-line art-head">▸ work <span>4 tabs tucked away</span></span></div>
```
Start Page:
```astro
        <div slot="art" class="art-layouts"><span>Ledger</span><span>Billboard</span><span>Shelf</span><span>Tally</span><span class="art-mahjong">中</span></div>
```
Named Workspaces:
```astro
        <div slot="art" class="art-workspaces"><span class="art-window">Thesis · 6 tabs</span><span class="art-window">Taxes · 3 tabs</span></div>
```
Glance:
```astro
        <div slot="art" class="art-glance"><span></span><i></i><span></span></div>
```
Mouse gestures:
```astro
        <div slot="art" class="art-gesture"><svg viewBox="0 0 120 48"><path d="M108 24H18m14-14L18 24l14 14" /></svg></div>
```
Vertical tabs:
```astro
        <div slot="art" class="art-vertical"><span class="art-rail"><i></i><i></i><i></i><i></i></span><span class="art-page"></span></div>
```
Profiles:
```astro
        <div slot="art" class="art-profiles"><span>Personal</span><span>Work</span></div>
```
Sync:
```astro
        <div slot="art" class="art-sync"><span class="art-device"></span><svg viewBox="0 0 24 24"><rect x="6" y="11" width="12" height="9" rx="2" /><path d="M9 11V8a3 3 0 0 1 6 0v3" /></svg><span class="art-device art-device--small"></span></div>
```
Security:
```astro
        <div slot="art" class="art-security"><span class="art-sandbox"><span></span></span></div>
```
1Password:
```astro
        <div slot="art" class="art-keys"><span class="ui-kbd">⌥</span><span class="ui-kbd">⌘</span><span class="ui-kbd">P</span></div>
```

The `ui-*` classes reuse Task 4's mini-UI styles; give the art a font size with the `.hub-tile-art > *` rule below.

- [ ] **Step 3: Append the art CSS**

```css
/* Index tile illustrations (decorative, aria-hidden by FeatureTile) */
.hub-tile-art > * { font-family: var(--font-ui); font-size: clamp(9px, 3.2cqw, 13px); color: var(--site-text); }
.hub-tile--large .hub-tile-art > * { font-size: clamp(10px, 2.6cqw, 15px); }
.art-shield { display: inline-flex; align-items: center; gap: 0.3em; color: var(--site-text-dim); font-variant-numeric: tabular-nums; }
.art-shield svg { width: 1.05em; height: 1.05em; fill: none; stroke: currentColor; stroke-width: 1.4; }
.art-groups { width: min(100%, 22em); }
.art-line { display: block; margin: 0; padding: 0.35em 0.6em; border-radius: 0.4em; color: var(--site-text-dim); }
.art-head { display: flex; justify-content: space-between; color: var(--site-text); font-weight: 600; }
.art-head span { color: var(--site-text-dim); font-weight: 400; }
.art-layouts { display: grid; grid-template-columns: repeat(5, auto); gap: 0.6em; align-items: center; }
.art-layouts span:not(.art-mahjong) { display: grid; place-items: end center; width: 4.6em; height: 3.4em; padding-bottom: 0.3em; border: 1px solid var(--site-border); border-radius: 0.4em; background: var(--site-bg); font-size: 0.8em; }
.art-mahjong { display: grid; place-items: center; width: 2.2em; height: 2.9em; border: 1px solid var(--site-border); border-bottom-width: 3px; border-radius: 0.35em; background: var(--site-surface-raised); color: #A33A2B; font-size: 1.1em; }
.art-workspaces { display: grid; gap: 0.5em; }
.art-window { padding: 0.6em 1em; border: 1px solid rgba(18, 16, 11, 0.18); border-radius: 0.5em; background: rgba(255, 252, 247, 0.7); }
.art-window + .art-window { margin-left: 1.6em; }
.art-glance { display: grid; grid-template-columns: 3fr 2px 2fr; gap: 0.4em; width: 9em; height: 5.4em; padding: 0.4em; border: 1px solid var(--site-border); border-radius: 0.5em; }
.art-glance span { border-radius: 0.3em; background: var(--site-surface); }
.art-glance i { border-radius: 2px; background: var(--site-gold); }
.art-gesture svg { width: 8em; fill: none; stroke: var(--site-gold); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.art-vertical { display: grid; grid-template-columns: 2.4em 1fr; gap: 0.4em; width: 9em; height: 5.4em; padding: 0.4em; border: 1px solid var(--site-border); border-radius: 0.5em; }
.art-rail { display: grid; align-content: start; gap: 0.35em; }
.art-rail i { height: 0.5em; border-radius: 0.2em; background: var(--site-border); }
.art-rail i:first-child { background: var(--site-gold); }
.art-page { border-radius: 0.3em; background: var(--site-surface); }
.art-profiles { display: flex; gap: 0.5em; }
.art-profiles span { padding: 0.4em 0.9em; border: 1px solid var(--site-border); border-radius: 1em; background: var(--site-bg); }
.art-profiles span + span { border-color: var(--site-gold); }
.art-sync { display: flex; align-items: center; gap: 0.8em; }
.art-sync svg { width: 1.8em; fill: none; stroke: var(--site-gold); stroke-width: 1.6; }
.art-device { width: 4.4em; height: 3em; border: 1px solid var(--site-border); border-radius: 0.4em; background: var(--site-surface); }
.art-device--small { width: 2em; height: 3.4em; }
.art-sandbox { display: grid; place-items: center; width: 5.4em; height: 4em; border: 1px dashed var(--site-gold); border-radius: 0.5em; }
.art-sandbox span { width: 3.2em; height: 2em; border-radius: 0.3em; background: var(--site-surface); }
.art-keys { display: flex; gap: 0.4em; }
.art-keys .ui-kbd { min-width: 2.2em; min-height: 2.2em; justify-content: center; color: var(--site-text); font-size: 1em; }
```

- [ ] **Step 4: Run tests and look**

Run the **Site test loop** with `features-hub` and `newsreader-reach`; then `npm run test:unit` (illustrations use only `span`/`div`/`svg`, never `p`, `li`, `button` or headings, so the ledger test does not treat them as copy).
Expected: all PASS. Look at the grid at 1440, 1024, 768, 390 and 320 wide; tiles keep equal row heights per row and no art clips.

- [ ] **Step 5: Commit**

```bash
git add site/src/pages/features.astro site/src/styles/features-hub.css test/site/features-hub.test.mjs
git commit -m "Give every Features index tile an illustration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Remove dead hub CSS, full verification, PR

**Files:**
- Modify: `site/src/styles/site.css` (delete hub-only rules)

- [ ] **Step 1: Delete hub-only rules from `site.css`**

Delete these selectors and any declaration lines that only serve them, keeping every rule that still names a selector used elsewhere:
- `.feature-hero--hub` (line ~915 and the `@media` copy near ~1250)
- `.feature-hub-list`, `.feature-hub-row`, `.feature-hub-row--featured`, `.feature-hub-row--patron` and every descendant rule (≈919–955, 1134, 1252–1253)
- `.feature-number`, `.feature-label`, `.feature-row-end` (≈923–929, 937–942, 1135, 1254, 1318–1321)
- `.feature-hub-page .feature-copy-grid` (≈944, 950)
- `.feature-patron`, `.feature-patron-copy`, `.feature-patron-offer`, `.feature-patron-price`, `.feature-patron-badge`, `.feature-patron-cta` (≈925, 957–969, 1136–1137, 1295–1296)
- In the display-headings list at ≈2141, remove `.feature-hub-row h2` and `.feature-patron-copy h2` from the selector list (keep the others).

Then confirm nothing else uses them:

```bash
grep -rn "feature-hub\|feature-number\|feature-row-end\|feature-label\|feature-patron" site/src
```
Expected: no matches. (Where a deleted line also lists a shared selector such as `.feature-close`, keep that line and remove only the hub selector from it.)

- [ ] **Step 2: Re-record the final page**

Tasks 4–9 added stage and art markup inside `<main>`, so the reviewed copy update recorded in Task 2 no longer shows the final page. Regenerate it from a clean ledger:

```bash
git show origin/main:docs/website-revamp-claims-v1.27.json > docs/website-revamp-claims-v1.27.json
node "$TMPDIR/build-hub-ledger.mjs"
git diff --stat docs/
```
Expected: the same claim count and superseded ids as Task 2; only the `after` string of the `features.astro` reviewed update changes. If `$TMPDIR/build-hub-ledger.mjs` is gone, recreate it from Task 2 Step 3.

- [ ] **Step 3: Full verification**

```bash
npm run lint
npm run test:unit
npm run site:build
(cd site && npm run preview -- --background --host 127.0.0.1 --port 4322)
(cd site && for f in features-hub feature-expansion newsreader-reach masthead footer demo-desktop-canvas crawl-hygiene; do BLANC_SITE_URL=http://127.0.0.1:4322 node --test ../test/site/$f.test.mjs || echo "FAILED $f"; done)
```
Expected: lint, unit and build pass; every site test passes. If a site test fails, run the same test against `origin/main` (build that tree in a scratch worktree) before treating it as this branch's regression.

- [ ] **Step 4: Before/after proof**

With the preview still running, capture in the browser pane:
- 1440×900: the opening, each of the five scenes at step 3, and the grid.
- 390×844: the opening, one ink scene, one cream scene, the grid.
- Reduced motion (`resize_window` colorScheme unchanged; reload with motion reduced via the test context, or confirm with the Playwright test above).

For "before", build `origin/main` in a scratch worktree and capture the same crops of `/features`. Present before stacked over after for the opening and the first scene, at full resolution, with one line on where to look.

Then stop the preview: `(cd site && npm run preview -- stop)`.

- [ ] **Step 5: Commit and open the PR**

```bash
git add site/src/styles/site.css docs/website-revamp-claims-v1.27.json docs/website-features-hub-claims-v1.30.json
git commit -m "Remove the retired Features card styles and re-record the final page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git fetch origin && git rebase origin/main
npm run test:unit
git push -u origin features-hub-redesign
gh pr create --title "Redesign the Features page around five scenes and a tile grid" --body "$(cat <<'EOF'
## What
- `/features` now opens with five animated product scenes (⌘L Quick Switcher, blocking shield, Quiet Tabs, Reopen Closed Tab, private tabs) in alternating ink and cream bands, then a mixed-size grid of the other eleven features with small illustrations.
- Copy is rewritten feature-first per the October 4 messaging rule. Every new sentence is recorded against public v1.30.0 in `docs/website-features-hub-claims-v1.30.json`; replaced claims are superseded in the v1.27 ledger, and the prose guard's reviewed update records the new page.
- Scenes play once when scrolled into view and can be stepped by hand. No-script and reduced-motion visitors see the final step with every caption.

## Preserved
URL, title, descriptions, JSON-LD, every existing anchor id, every guide link and its analytics attributes, and the unchanged Smaller details, Patron and download copy.

## Not included
No deploy: site deploys stay on hold for Blanc Mail.

## Verification
- `npm run lint`, `npm run test:unit`, `npm run site:build`
- `test/site/features-hub.test.mjs` (new), `feature-expansion`, `newsreader-reach`, `masthead`, `footer`, `demo-desktop-canvas`, `crawl-hygiene`
- Before/after captures at 1440 and 390 wide attached below.

Spec: `docs/superpowers/specs/2026-10-08-features-hub-redesign-design.md`
Plan: `docs/superpowers/plans/2026-10-08-features-hub-redesign.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After opening the PR, call `get_status` and bind the PR if needed, then read its checks. Do not merge until every check on the head SHA has passed and the owner approves.
