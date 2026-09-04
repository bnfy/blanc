# Masthead Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bottom navigation island with a sticky top masthead carrying two mega menus (features, resources), a direct what's-new link, and the download pill, with matching mobile accordions.

**Architecture:** Navigation content lives in one data module, `site/src/data/navigation.mjs`, consumed by `Header.astro` for both the desktop panels and the mobile sheet. The header's script handles menu state (hover intent, click, Escape, focus-out) and the homepage's transparent-to-raised transition; the tuck-on-scroll code is deleted. Styles replace the `.site-header`, `.site-nav`, and mobile blocks in `site.css`. A Playwright site test drives the menus; a unit test proves every feature page is reachable from the data module.

**Tech Stack:** Astro components and JSON imports, plain TypeScript in the component script, node:test unit tests, Playwright site tests.

**Spec:** `docs/superpowers/specs/2026-09-04-masthead-navigation-design.md`

## Global Constraints

- The header is sticky in flow, 64px on desktop; it never tucks.
- The mark is 24px ink at rest with the existing `::after` gold crossfade over 220ms; the mobile mark stays 28px gold.
- Menu descriptions are the feature pages' own headlines; the release card reads `site/src/data/releases.json` and `release-feature-names.json`.
- Legal pages keep `legal-top`. The `header` prop values `island`, `solid`, `legal` stay.
- Site tests run against a production preview: `npm run site:build`, then `cd site && npx astro preview --port 4322 --host 127.0.0.1`, then `BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/*.test.mjs`. Stop the preview afterward.
- Commit after each task. Do not push or deploy until the owner asks.

---

### Task 1: Navigation data module

**Files:**
- Create: `site/src/data/navigation.mjs`
- Test: `test/unit/site-navigation.test.js` (create)

**Interfaces:**
- Produces: `export const menus` (array of `{ key, label, groups: [{ title, links: [{ href, label, description }] }], spotlight, foot }`) and `export const directLinks` (`[{ href, key, label }]`). `spotlight` is `{ kind: 'image', image, alt, kicker, title, copy, href, cta }` for features and `{ kind: 'release', kicker, href, cta }` for resources; the release card's version and names are filled in by the component, not the data module.

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

test('every feature page is reachable from the features menu with its own headline', async () => {
  const { menus, directLinks } = await import(path.join(ROOT, 'site/src/data/navigation.mjs'));
  const features = menus.find(menu => menu.key === 'features');
  const links = features.groups.flatMap(group => group.links);
  const pages = fs.readdirSync(path.join(ROOT, 'site/src/pages/features')).filter(f => f.endsWith('.astro')).map(f => `/features/${f.replace('.astro', '')}`);
  assert.deepEqual(links.map(l => l.href).sort(), pages.sort(), 'one link per feature page, no more');
  for (const link of links) {
    const source = fs.readFileSync(path.join(ROOT, `site/src/pages${link.href}.astro`), 'utf8');
    const headline = source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    assert.equal(link.description, headline, `${link.href} description is the page headline`);
  }
  assert.equal(features.groups.map(g => g.title).join(','), 'Interface,Privacy,Workflow');
  assert.equal(features.spotlight.image, '/feature-island.png');
});

test('resources and direct links point at pages that exist', async () => {
  const { menus, directLinks } = await import(path.join(ROOT, 'site/src/data/navigation.mjs'));
  const exists = href => {
    if (href.startsWith('http')) return true;
    const [pathname] = href.split('#');
    if (pathname === '/' || pathname === '') return true;
    return fs.existsSync(path.join(ROOT, `site/src/pages${pathname}.astro`));
  };
  const resources = menus.find(menu => menu.key === 'resources');
  for (const link of [...resources.groups.flatMap(g => g.links), ...directLinks, { href: resources.spotlight.href }, { href: resources.foot.href }, { href: menus[0].foot.href }]) {
    assert.ok(exists(link.href), `${link.href} exists`);
  }
  assert.deepEqual(directLinks.map(l => l.key), ['changelog', 'download']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/unit/site-navigation.test.js`
Expected: FAIL, cannot find module `navigation.mjs`.

- [ ] **Step 3: Write the data module**

```js
// Navigation content for the masthead and the mobile sheet. Descriptions are
// each feature page's own headline so the menu never says more than the page.
export const menus = [
  {
    key: 'features',
    label: 'features',
    groups: [
      { title: 'Interface', links: [
        { href: '/features/island', label: 'The island', description: 'One small island. The whole browser.' },
        { href: '/features/vertical-tabs', label: 'Vertical tabs', description: 'A tab rail when you want one. The island either way.' },
        { href: '/features/tab-groups', label: 'Tab groups', description: 'Keep the tabs you need. Tuck away the rest.' },
        { href: '/features/quiet-tabs', label: 'Quiet tabs', description: 'Tabs you are not using give their memory back.' },
      ] },
      { title: 'Privacy', links: [
        { href: '/features/ad-blocking', label: 'Ad blocking', description: 'A clearer control for a quieter site.' },
        { href: '/features/private-tabs', label: 'Private tabs', description: 'Private tabs that stay out of the record.' },
        { href: '/features/security', label: 'Security', description: 'Private by architecture.' },
      ] },
      { title: 'Workflow', links: [
        { href: '/features/command-palette', label: 'Command palette', description: 'One shortcut to move through your whole session.' },
        { href: '/features/sync', label: 'Sync', description: 'Your open tabs, on your other devices.' },
      ] },
    ],
    spotlight: { kind: 'image', image: '/feature-island.png', alt: 'The Blanc island resting over a web page', kicker: 'Start here', title: 'One small island. The whole browser.', copy: 'Back, forward, tabs, search and commands in one floating pill.', href: '/features/island', cta: 'See the island' },
    foot: { note: 'Nine features. No account, no AI, no extension store.', label: 'All features', href: '/features' },
  },
  {
    key: 'resources',
    label: 'resources',
    groups: [
      { title: 'Learn', links: [
        { href: '/faq', label: 'FAQ', description: 'Straight answers on price, privacy and AI.' },
        { href: '/about', label: 'About', description: 'A browser with a studio accountable for it.' },
        { href: '/press', label: 'Press', description: 'Fact sheet, captures and the launch card.' },
      ] },
      { title: 'Community', links: [
        { href: '/ambassadors', label: 'Ambassadors', description: 'Help people see a different kind of browser.' },
        { href: '#newsletter', label: 'Newsletter', description: 'Release notes, occasionally.' },
        { href: 'https://github.com/bnfy/blanc', label: 'Source on GitHub', description: 'MIT licensed. Read it, build it, audit it.' },
      ] },
    ],
    spotlight: { kind: 'release', kicker: "What's new", href: '/changelog', cta: 'Read the changelog' },
    foot: { note: 'Blanc is free to browse. Patron is optional.', label: 'Blanc Patron', href: '/#home-patron-title' },
  },
];

export const directLinks = [
  { href: '/changelog', key: 'changelog', label: "What's new" },
  { href: '/download', key: 'download', label: 'Download' },
];
```

Check the feature headlines against the pages before committing: `grep -o '<h1[^>]*>[^<]*' site/src/pages/features/*.astro`. The test compares them exactly.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/unit/site-navigation.test.js`
Expected: PASS. If a description differs from a page headline, copy the page's headline into the data module; never the other way round.

- [ ] **Step 5: Give the footer newsletter form the anchor the menu links to**

In `site/src/components/NewsletterForm.astro`, add `id="newsletter"` to the outermost element of the form block if it has none (check with `grep -n 'id=' site/src/components/NewsletterForm.astro`). If the form already has an id, change the menu href in the data module to that id instead.

- [ ] **Step 6: Commit**

```bash
git add site/src/data/navigation.mjs test/unit/site-navigation.test.js site/src/components/NewsletterForm.astro
git commit -m "Add the navigation data module behind the masthead menus"
```

---

### Task 2: Masthead markup, styles, and menu behaviour

**Files:**
- Modify: `site/src/components/Header.astro` (whole non-legal branch and script)
- Modify: `site/src/styles/site.css` (replace the `.site-header` … `.site-menu-toggle, .site-mobile-menu` block at lines 803–873, the `@media (min-width: 641px)` nav block that follows it, the mobile nav rules inside `@media (max-width: 640px)`, and the `.site-header { transition: none; }` reduced-motion rule; adjust `.consent`)
- Modify: `test/unit/site-island-visual.test.js:68-80` (replace the bottom-island test)
- Modify: `test/site/demo-desktop-canvas.test.mjs:156-161` (mark size 24px)
- Test: `test/site/masthead.test.mjs` (create)

**Interfaces:**
- Consumes: `menus`, `directLinks` from Task 1.
- Produces: DOM contract used by tests: `.site-header` (sticky), `.site-nav`, `.site-brand` with `.site-brand-mark`, `button.site-menu-trigger[data-menu][aria-expanded][aria-controls]`, `.site-mega#site-menu-<key>[data-open]`, `.site-nav-cta`, `.site-menu-toggle`, `.site-mobile-menu details`.

- [ ] **Step 1: Write the failing site test**

Create `test/site/masthead.test.mjs`:

```js
// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/masthead.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
let browser;
before(async () => { browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch(); });
after(async () => { await browser?.close(); });

async function openPage(path = '/', width = 1440, reducedMotion = 'reduce') {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion });
  const page = await context.newPage();
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await page.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  await page.goto(`${baseURL}${path}`);
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

const featureHrefs = ['/features/island', '/features/vertical-tabs', '/features/tab-groups', '/features/quiet-tabs', '/features/ad-blocking', '/features/private-tabs', '/features/security', '/features/command-palette', '/features/sync'];

test('the masthead is sticky at the top, 64px tall, and never tucks', async () => {
  const { page, context } = await openPage('/features');
  try {
    const bar = await page.evaluate(() => { const h = document.querySelector('.site-header'); const s = getComputedStyle(h); return { position: s.position, top: s.top, height: h.getBoundingClientRect().height, tucks: h.className.includes('tuck') }; });
    assert.equal(bar.position, 'sticky');
    assert.equal(bar.top, '0px');
    assert.ok(Math.abs(bar.height - 64) < 1, `bar is 64px, got ${bar.height}`);
    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => { const r = document.querySelector('.site-header').getBoundingClientRect(); return { top: r.top, opacity: getComputedStyle(document.querySelector('.site-header')).opacity }; });
    assert.equal(after.top, 0, 'still at the top after scrolling');
    assert.equal(after.opacity, '1');
  } finally { await context.close(); }
});

test('the features menu opens on click, lists every feature page, and closes on Escape with focus returned', async () => {
  const { page, context } = await openPage('/');
  try {
    const trigger = page.locator('.site-menu-trigger[data-menu="features"]');
    await trigger.click();
    await page.waitForFunction(() => document.querySelector('#site-menu-features').dataset.open === 'true');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    const hrefs = await page.locator('#site-menu-features .site-mega-groups a').evaluateAll(as => as.map(a => a.getAttribute('href')));
    assert.deepEqual(hrefs.sort(), [...featureHrefs].sort());
    const visible = await page.locator('#site-menu-features').evaluate(el => { const s = getComputedStyle(el); return s.visibility === 'visible' && s.opacity === '1'; });
    assert.equal(visible, true);
    assert.equal(await page.locator('#site-menu-features img').getAttribute('src'), '/feature-island.png');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#site-menu-features').dataset.open === 'false');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-menu')), 'features', 'focus returns to the trigger');
  } finally { await context.close(); }
});

test('only one menu is open at a time, hover opens after intent, and the resources card names the current release', async () => {
  const { page, context } = await openPage('/about', 1440, 'no-preference');
  try {
    await page.locator('.site-menu-trigger[data-menu="features"]').hover();
    await page.waitForFunction(() => document.querySelector('#site-menu-features').dataset.open === 'true', null, { timeout: 2000 });
    await page.locator('.site-menu-trigger[data-menu="resources"]').hover();
    await page.waitForFunction(() => document.querySelector('#site-menu-resources').dataset.open === 'true', null, { timeout: 2000 });
    assert.equal(await page.locator('#site-menu-features').getAttribute('data-open'), 'false');
    const card = await page.locator('#site-menu-resources .site-mega-release').evaluate(el => ({ text: el.textContent, bg: getComputedStyle(el).backgroundColor, title: getComputedStyle(el.querySelector('h3, h4, h5, .site-mega-release-title')).fontFamily }));
    assert.match(card.text, /Blanc \d+\.\d+\.\d+/);
    assert.equal(card.bg, 'rgb(18, 16, 11)', 'release card sits on warm ink');
    assert.match(card.title, /Newsreader/);
    await page.mouse.move(700, 800);
    await page.waitForFunction(() => document.querySelector('#site-menu-resources').dataset.open === 'false', null, { timeout: 2000 });
  } finally { await context.close(); }
});

test('the homepage bar starts transparent over the hero and becomes raised after scrolling', async () => {
  const { page, context } = await openPage('/');
  try {
    const atTop = await page.evaluate(() => ({ raised: document.querySelector('.site-header').classList.contains('is-raised'), bg: getComputedStyle(document.querySelector('.site-nav')).backgroundColor }));
    assert.equal(atTop.raised, false);
    assert.equal(atTop.bg, 'rgba(0, 0, 0, 0)');
    await page.evaluate(() => window.scrollTo(0, 240));
    await page.waitForFunction(() => document.querySelector('.site-header').classList.contains('is-raised'));
    const solid = await openPage('/faq');
    try {
      assert.equal(await solid.page.evaluate(() => document.querySelector('.site-header').classList.contains('is-raised')), true, 'standard pages are raised from the start');
    } finally { await solid.context.close(); }
  } finally { await context.close(); }
});

test('below 640px the sheet carries both groups as accordions plus the direct links, and nothing overflows', async () => {
  const { page, context } = await openPage('/features/island', 390);
  try {
    assert.equal(await page.locator('.site-menu-trigger').count(), 0, 'no desktop triggers are rendered visible');
    await page.locator('.site-menu-toggle').click();
    await page.waitForSelector('.site-mobile-menu:not([hidden])');
    const sheet = await page.evaluate(() => ({
      summaries: [...document.querySelectorAll('.site-mobile-menu details summary')].map(s => s.textContent.trim()),
      hrefs: [...document.querySelectorAll('.site-mobile-menu a')].map(a => a.getAttribute('href')),
      current: document.querySelector('.site-mobile-menu a[aria-current="page"]')?.getAttribute('href'),
      overflow: document.documentElement.scrollWidth > innerWidth,
      markSize: getComputedStyle(document.querySelector('.site-brand-mark')).width,
    }));
    assert.deepEqual(sheet.summaries, ['Features', 'Resources']);
    for (const href of featureHrefs) assert.ok(sheet.hrefs.includes(href), `${href} in the sheet`);
    assert.ok(sheet.hrefs.includes('/changelog') && sheet.hrefs.some(h => h.includes('/download')), 'direct links present');
    assert.equal(sheet.current, '/features/island');
    assert.equal(sheet.overflow, false);
    assert.equal(sheet.markSize, '28px');
  } finally { await context.close(); }
});

test('the consent toast clears the bar on desktop', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
    await page.goto(`${baseURL}/`);
    const top = await page.locator('.consent').evaluate(el => el.getBoundingClientRect().top);
    assert.ok(top >= 64, `consent sits below the 64px bar, got ${top}`);
  } finally { await context.close(); }
});
```

- [ ] **Step 2: Run it to verify it fails**

Build and serve, then: `BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/masthead.test.mjs`
Expected: FAIL on the first test, `position` is `fixed`.

- [ ] **Step 3: Rewrite the non-legal header branch in `Header.astro`**

Replace the frontmatter and the non-legal `<header>` with:

```astro
---
import BrandMark from './BrandMark.astro';
import { menus, directLinks } from '../data/navigation.mjs';
import releases from '../data/releases.json';
import featureNames from '../data/release-feature-names.json';
const { variant = 'solid', current = null } = Astro.props;
const pathname = Astro.url.pathname.replace(/\.html$/, '').replace(/\/$/, '');
const latest = releases[0];
const latestVersion = String(latest.version || latest.tag || '').replace(/^v/, '');
const latestNames = (featureNames[latestVersion] || []).slice(0, 3);
const isCurrent = href => pathname === href || (href === '/download' && current === 'download');
const downloadHref = current === 'download' ? '#download-options' : '/download';
---
```

Header markup (replacing the existing `<header class={variant === 'solid' ? …}>` block):

```astro
  <header class={`site-header site-header--${variant}${variant === 'solid' ? ' is-raised' : ''}`}>
    <nav class="site-nav" aria-label="Primary navigation">
      <a class="site-brand" href="/" aria-label="Blanc Browser home"><BrandMark class="site-brand-mark" /></a>
      <div class="site-nav-links">
        {menus.map(menu => (
          <button class="site-menu-trigger" type="button" data-menu={menu.key} aria-expanded="false" aria-controls={`site-menu-${menu.key}`} aria-current={menu.key === 'features' && (current === 'features' || pathname.startsWith('/features')) ? 'page' : undefined}>{menu.label} <span class="site-menu-caret" aria-hidden="true"></span></button>
        ))}
        <a href="/changelog" aria-current={current === 'changelog' ? 'page' : undefined}>what's new</a>
      </div>
      <a class={current === 'download' ? 'site-nav-cta is-current' : 'site-nav-cta'} href={downloadHref}>download</a>
      <button class="site-menu-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="siteMobileMenu">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path class="site-menu-open-icon" d="M4 6h16M4 12h16M4 18h16" /><path class="site-menu-close-icon" d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
      <div class="site-mobile-menu" id="siteMobileMenu" hidden>
        {menus.map(menu => (
          <details open={menu.key === 'features' && pathname.startsWith('/features') ? true : undefined}>
            <summary>{menu.label === 'features' ? 'Features' : 'Resources'}</summary>
            <div class="site-mobile-group">
              {menu.groups.flatMap(group => group.links).map(link => (
                <a href={link.href} aria-current={isCurrent(link.href) ? 'page' : undefined}>{link.label}</a>
              ))}
            </div>
          </details>
        ))}
        <a class="site-mobile-plain" href="/changelog" aria-current={current === 'changelog' ? 'page' : undefined}>What's new</a>
        <a class="site-mobile-download" href={downloadHref}>Download on desktop</a>
      </div>
    </nav>
    {menus.map(menu => (
      <div class="site-mega" id={`site-menu-${menu.key}`} data-open="false" role="region" aria-label={menu.label === 'features' ? 'Features' : 'Resources'}>
        <div class={`site-mega-inner${menu.key === 'resources' ? ' site-mega-inner--narrow' : ''}`}>
          <div class="site-mega-main">
            <div class="site-mega-groups" data-columns={menu.groups.length}>
              {menu.groups.map(group => (
                <div>
                  <h2>{group.title}</h2>
                  <ul>{group.links.map(link => (
                    <li><a href={link.href} aria-current={isCurrent(link.href) ? 'page' : undefined}><b>{link.label}</b><span>{link.description}</span></a></li>
                  ))}</ul>
                </div>
              ))}
            </div>
            <div class="site-mega-foot"><span>{menu.foot.note}</span><a href={menu.foot.href}>{menu.foot.label} <span aria-hidden="true">↗</span></a></div>
          </div>
          {menu.spotlight.kind === 'image' ? (
            <a class="site-mega-spot" href={menu.spotlight.href}>
              <img src={menu.spotlight.image} alt={menu.spotlight.alt} width="1200" height="630" loading="lazy" />
              <span class="site-mega-spot-body"><span class="site-mega-kicker">{menu.spotlight.kicker}</span><span class="site-mega-spot-title">{menu.spotlight.title}</span><span class="site-mega-spot-copy">{menu.spotlight.copy}</span><span class="site-mega-go">{menu.spotlight.cta} <span aria-hidden="true">↗</span></span></span>
            </a>
          ) : (
            <a class="site-mega-spot site-mega-release" href={menu.spotlight.href}>
              <span class="site-mega-spot-body"><span class="site-mega-kicker">{menu.spotlight.kicker}</span><span class="site-mega-release-title">Blanc {latestVersion}</span><span class="site-mega-spot-copy">{latestNames.length ? latestNames.join(', ') + '.' : 'Every Blanc release, in one place.'}</span><span class="site-mega-go">{menu.spotlight.cta} <span aria-hidden="true">↗</span></span></span>
            </a>
          )}
        </div>
      </div>
    ))}
  </header>
```

Note the group headings are `h2` inside a region, which is fine for the outline since the page's own `h1` precedes the header content only visually; if the site-island-visual test's heading order check complains, change them to `p class="site-mega-title"` and adjust the test's selector accordingly.

- [ ] **Step 4: Replace the header script**

Replace everything inside `<script>` with:

```ts
  const header = document.querySelector<HTMLElement>('.site-header');

  if (header) {
    const desktop = window.matchMedia('(min-width: 641px)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const nav = header.querySelector<HTMLElement>('.site-nav');
    const triggers = [...header.querySelectorAll<HTMLButtonElement>('.site-menu-trigger')];
    const panelOf = (trigger: HTMLButtonElement) => header.querySelector<HTMLElement>(`#${trigger.getAttribute('aria-controls')}`);
    const menuToggle = header.querySelector<HTMLButtonElement>('.site-menu-toggle');
    const menuPanel = header.querySelector<HTMLElement>('.site-mobile-menu');
    let intent = 0;

    // Mega menus: one open at a time, hover intent, click toggle, Escape.
    const closeMenus = (except: HTMLButtonElement | null = null) => {
      for (const trigger of triggers) {
        if (trigger === except) continue;
        trigger.setAttribute('aria-expanded', 'false');
        const panel = panelOf(trigger);
        if (panel) panel.dataset.open = 'false';
      }
      header.classList.toggle('has-open-menu', except !== null);
    };
    const openMenu = (trigger: HTMLButtonElement) => {
      closeMenus(trigger);
      trigger.setAttribute('aria-expanded', 'true');
      const panel = panelOf(trigger);
      if (panel) panel.dataset.open = 'true';
      header.classList.add('has-open-menu');
    };
    for (const trigger of triggers) {
      const panel = panelOf(trigger);
      trigger.addEventListener('click', () => (trigger.getAttribute('aria-expanded') === 'true' ? closeMenus() : openMenu(trigger)));
      trigger.addEventListener('mouseenter', () => { if (!desktop.matches) return; window.clearTimeout(intent); intent = window.setTimeout(() => openMenu(trigger), 120); });
      trigger.addEventListener('mouseleave', () => window.clearTimeout(intent));
      panel?.addEventListener('mouseenter', () => window.clearTimeout(intent));
    }
    header.addEventListener('mouseleave', () => { window.clearTimeout(intent); intent = window.setTimeout(() => closeMenus(), 260); });
    header.addEventListener('mouseenter', () => window.clearTimeout(intent));
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const open = triggers.find(t => t.getAttribute('aria-expanded') === 'true');
      if (open) { event.preventDefault(); closeMenus(); open.focus({ preventScroll: true }); return; }
      if (menuPanel && !menuPanel.hidden) { event.preventDefault(); setMenuOpen(false, true); }
    });
    document.addEventListener('pointerdown', event => {
      if (event.target instanceof Node && !header.contains(event.target)) { closeMenus(); setMenuOpen(false); }
    });
    document.addEventListener('focusin', event => {
      if (event.target instanceof Node && !header.contains(event.target)) { closeMenus(); setMenuOpen(false); }
    });

    // Homepage: transparent over the hero until the page has moved 12px.
    const raise = () => header.classList.toggle('is-raised', header.classList.contains('site-header--solid') || window.scrollY > 12 || !desktop.matches);
    window.addEventListener('scroll', raise, { passive: true });
    raise();

    // Mobile sheet.
    const setMenuOpen = (open: boolean, restoreFocus = false) => {
      if (!menuToggle || !menuPanel) return;
      menuPanel.hidden = !open;
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (restoreFocus) menuToggle.focus({ preventScroll: true });
    };
    menuToggle?.addEventListener('click', () => { if (!desktop.matches && menuPanel) setMenuOpen(menuPanel.hidden); });
    menuPanel?.addEventListener('click', event => { if (event.target instanceof Element && event.target.closest('a')) setMenuOpen(false); });
    window.addEventListener('pageshow', () => { setMenuOpen(false); closeMenus(); raise(); });
    desktop.addEventListener('change', () => { setMenuOpen(false); closeMenus(); raise(); });
    void nav; void reduce;
  }
```

`setMenuOpen` is referenced before its `const` in the keydown handler; move the mobile-sheet block above the mega-menu block so the declaration comes first, or declare it as a `function`. Use `function setMenuOpen(...)` to avoid the temporal dead zone.

- [ ] **Step 5: Replace the header styles**

Delete from `/* Desktop navigation is a floating island` (the comment above `.site-header {`) through the end of the `@media (min-width: 641px) { … }` nav block that ends with `.site-nav-links a:is(:hover, :focus-visible, [aria-current="page"]) { color: var(--site-gold-on-dark); }` and its closing `}`. Insert:

```css
/* ---------- masthead ---------- */
/* A sticky ivory bar with a hairline; on the homepage it is transparent over
   the hero until the page moves. The mark keeps the gold crossfade. */
.site-header { position: sticky; top: 0; z-index: 30; isolation: isolate; }
.site-nav { display: flex; align-items: center; gap: 8px; height: 64px; padding: 0 28px; background: transparent; border-bottom: 1px solid transparent; transition: background 200ms ease, border-color 200ms ease, backdrop-filter 200ms ease; }
.site-header.is-raised .site-nav { background: rgba(var(--site-surface-raised-rgb), 0.86); border-bottom-color: var(--site-border); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
.site-header.has-open-menu .site-nav { background: var(--site-surface-raised); border-bottom-color: var(--site-border); }
.site-brand { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; margin-right: 12px; border-radius: 10px; color: var(--site-text); text-decoration: none; }
.site-brand-mark { width: 24px; height: 24px; display: block; transition: opacity 220ms ease; }
.site-brand::after { content: ""; position: absolute; left: 50%; top: 50%; width: 24px; height: 24px; transform: translate(-50%, -50%); background: url("/sunrise-hero-mark.png") center / contain no-repeat; opacity: 0; pointer-events: none; transition: opacity 220ms ease; }
.site-brand:is(:hover, :focus-visible) .site-brand-mark { opacity: 0; }
.site-brand:is(:hover, :focus-visible)::after { opacity: 1; }
.site-brand:focus-visible { outline: 2px solid var(--site-accent); outline-offset: 2px; }
.site-nav-links { display: inline-flex; align-items: center; gap: 2px; }
.site-nav-links a, .site-menu-trigger { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 10px; border: 0; border-radius: 999px; background: transparent; color: var(--site-text-dim); font-family: var(--font-mono); font-size: 12.5px; letter-spacing: 0.01em; text-decoration: none; cursor: pointer; transition: color 150ms ease; }
.site-nav-links a:is(:hover, :focus-visible, [aria-current="page"]), .site-menu-trigger:is(:hover, :focus-visible, [aria-expanded="true"], [aria-current="page"]) { color: var(--site-gold); }
.site-nav-links a:focus-visible, .site-menu-trigger:focus-visible { outline: 2px solid var(--site-accent); outline-offset: 2px; }
.site-menu-caret { width: 8px; height: 8px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: translateY(-2px) rotate(45deg); transition: transform 180ms ease; }
.site-menu-trigger[aria-expanded="true"] .site-menu-caret { transform: translateY(1px) rotate(225deg); }
.site-nav-cta { margin-left: auto; min-height: 38px; padding: 0 16px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--site-accent); border-radius: 999px; background: var(--site-accent); color: var(--site-bg); font-family: var(--font-mono); font-size: 12.5px; text-decoration: none; transition: opacity 150ms ease; }
.site-nav-cta:hover { opacity: 0.86; }
.site-nav-cta:focus-visible { outline: 2px solid var(--site-accent); outline-offset: 3px; }
.site-nav-cta.is-current { pointer-events: none; }
.site-menu-toggle, .site-mobile-menu { display: none; }

/* Mega panels: full width, dropping from the bar, the horizon hairline on top. */
.site-mega { position: absolute; left: 0; right: 0; top: 100%; background: var(--site-surface-raised); border-bottom: 1px solid var(--site-border); box-shadow: 0 30px 60px -40px rgba(14,14,14,0.35); opacity: 0; visibility: hidden; transform: translateY(-6px); transition: opacity 160ms ease, transform 200ms cubic-bezier(.2,.8,.2,1), visibility 0s linear 160ms; }
.site-mega::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--site-gold-on-dark) 18%, var(--site-gold-on-dark) 82%, transparent); }
.site-mega[data-open="true"] { opacity: 1; visibility: visible; transform: none; transition: opacity 160ms ease, transform 200ms cubic-bezier(.2,.8,.2,1), visibility 0s; }
.site-mega-inner { max-width: 1120px; margin: 0 auto; padding: 28px 28px 24px; display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 40px; }
.site-mega-inner--narrow { max-width: 900px; grid-template-columns: minmax(0, 1fr) 320px; }
.site-mega-groups { display: grid; gap: 24px; }
.site-mega-groups[data-columns="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.site-mega-groups[data-columns="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.site-mega-groups h2 { margin: 0 0 8px; font-family: var(--font-mono); font-size: 11px; font-weight: 500; letter-spacing: 0.17em; text-transform: uppercase; color: var(--site-gold); }
.site-mega-groups ul { list-style: none; margin: 0; padding: 0; display: grid; }
.site-mega-groups li a { display: grid; gap: 2px; padding: 9px 10px; margin: 0 -10px; border-radius: 8px; text-decoration: none; transition: background 140ms ease; }
.site-mega-groups li a:is(:hover, :focus-visible) { background: var(--site-selection); }
.site-mega-groups li a:focus-visible { outline: 2px solid var(--site-accent); outline-offset: -2px; }
.site-mega-groups li b { font-weight: 500; font-size: 14.5px; letter-spacing: -0.01em; color: var(--site-text); }
.site-mega-groups li span { font-size: 12.5px; line-height: 1.4; color: var(--site-text-dim); }
.site-mega-groups li a[aria-current="page"] b { color: var(--site-gold); }
.site-mega-foot { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--site-border); font-size: 13px; color: var(--site-text-dim); }
.site-mega-foot a { font-family: var(--font-mono); font-size: 12px; color: var(--site-text); text-decoration: none; border-bottom: 1px solid var(--site-border); }
.site-mega-foot a:is(:hover, :focus-visible) { color: var(--site-gold); border-color: var(--site-gold); }
.site-mega-spot { display: grid; grid-template-rows: auto 1fr; border: 1px solid var(--site-border); border-radius: 12px; overflow: hidden; background: var(--site-surface-raised); text-decoration: none; color: var(--site-text); }
.site-mega-spot img { display: block; width: 100%; height: auto; border-bottom: 1px solid var(--site-border); }
.site-mega-spot-body { padding: 14px 16px 16px; display: grid; gap: 6px; }
.site-mega-kicker { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.17em; text-transform: uppercase; color: var(--site-gold); }
.site-mega-spot-title, .site-mega-release-title { font-family: var(--site-font-display); font-size: 22px; font-weight: 400; letter-spacing: -0.015em; line-height: 1.15; }
.site-mega-spot-copy { font-size: 13px; line-height: 1.45; color: var(--site-text-dim); }
.site-mega-go { margin-top: 4px; font-family: var(--font-mono); font-size: 12px; }
.site-mega-go span { color: var(--site-gold); }
.site-mega-spot:is(:hover, :focus-visible) .site-mega-go { color: var(--site-gold); }
.site-mega-spot:focus-visible { outline: 2px solid var(--site-accent); outline-offset: 2px; }
.site-mega-release { background-color: var(--site-ink-warm); background-image: radial-gradient(70% 55% at 50% -10%, rgba(212, 173, 102, 0.26), rgba(212, 173, 102, 0.06) 45%, transparent 72%); border-color: var(--site-ink-warm); color: var(--site-bg); }
.site-mega-release .site-mega-spot-body { padding: 18px; }
.site-mega-release .site-mega-release-title { font-size: 26px; color: var(--site-gold-on-dark); }
.site-mega-release .site-mega-spot-copy { color: #D9D3C5; }
.site-mega-release .site-mega-go { color: var(--site-bg); }
.site-mega-release .site-mega-go span { color: var(--site-gold-on-dark); }
```

Then inside `@media (max-width: 640px)`, replace the existing `.site-header` through `.site-mobile-menu a[aria-current="page"]` rules with:

```css
  .site-header { position: sticky; top: 0; }
  .site-header .site-nav, .site-header.is-raised .site-nav { height: 52px; padding: 0 12px; gap: 8px; background: rgba(var(--site-bg-rgb), 0.96); border-bottom-color: var(--site-border); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
  .site-brand { width: 44px; height: 44px; margin-right: auto; }
  .site-brand-mark { width: 28px; height: 28px; }
  .site-header .blanc-mark.site-brand-mark { background: url("/sunrise-hero-mark.png") center / contain no-repeat; -webkit-mask: none; mask: none; }
  .site-brand::after { display: none; }
  .site-brand:is(:hover, :focus-visible) .site-brand-mark { opacity: 1; }
  .site-nav-links, .site-nav-cta, .site-mega { display: none; }
  .site-menu-toggle { display: grid; place-items: center; flex: 0 0 44px; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 8px; color: var(--site-text); background: transparent; cursor: pointer; }
  .site-menu-toggle:hover, .site-menu-toggle[aria-expanded="true"] { background: var(--site-surface); }
  .site-menu-toggle svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
  .site-menu-close-icon, .site-menu-toggle[aria-expanded="true"] .site-menu-open-icon { display: none; }
  .site-menu-toggle[aria-expanded="true"] .site-menu-close-icon { display: block; }
  .site-mobile-menu:not([hidden]) { display: grid; }
  .site-mobile-menu { position: absolute; top: 100%; left: 0; right: 0; max-height: calc(100dvh - 52px - env(safe-area-inset-bottom, 0px)); overflow-y: auto; padding: 8px 12px 16px; background: var(--site-surface-raised); border-bottom: 1px solid var(--site-border); box-shadow: 0 30px 60px -40px rgba(14,14,14,0.35); }
  .site-mobile-menu details { border-bottom: 1px solid var(--site-border); }
  .site-mobile-menu summary { list-style: none; display: flex; justify-content: space-between; align-items: center; min-height: 48px; padding: 0 8px; font-size: 15px; font-weight: 500; cursor: pointer; }
  .site-mobile-menu summary::-webkit-details-marker { display: none; }
  .site-mobile-menu summary::after { content: "+"; font-family: var(--font-mono); color: var(--site-gold); }
  .site-mobile-menu details[open] summary::after { content: "\2212"; }
  .site-mobile-group { display: grid; padding: 0 8px 10px 16px; }
  .site-mobile-menu a { display: flex; align-items: center; min-height: 44px; padding: 8px 12px; border-radius: 6px; color: var(--site-text); text-decoration: none; font-size: 14px; }
  .site-mobile-menu .site-mobile-plain { min-height: 48px; padding: 0 8px; font-size: 15px; font-weight: 500; border-bottom: 1px solid var(--site-border); border-radius: 0; }
  .site-mobile-menu a:is(:hover, :focus-visible, [aria-current="page"]) { color: var(--site-gold); }
  .site-mobile-menu a[aria-current="page"] { background: var(--site-selection); }
  .site-mobile-download { justify-content: center; margin: 14px 4px 0; min-height: 48px; border-radius: 999px; background: var(--site-accent); color: var(--site-bg) !important; font-family: var(--font-mono); font-size: 13px; }
```

Replace the reduced-motion rule `.site-header { transition: none; }` with `.site-header .site-nav, .site-mega, .site-brand-mark, .site-brand::after { transition: none; }`.

Change `.consent` so its top clears the bar on desktop: keep the rule and add after it

```css
@media (min-width: 641px) { .consent { top: 76px; } }
```

- [ ] **Step 6: Update the two tests that pinned the old island**

In `test/unit/site-island-visual.test.js`, replace the whole `test('desktop navigation rests at the bottom edge and tucks on downward scroll', …)` block with:

```js
test('the masthead is a sticky top bar and the tuck-on-scroll island is gone', () => {
  assert.match(styles, /\.site-header \{ position: sticky; top: 0; z-index: 30;/);
  assert.doesNotMatch(styles, /is-tucked|inset: auto 0 0/);
  assert.doesNotMatch(styles, /body\.has-consent \.site-header|--consent-h/);
  assert.match(styles, /\.site-brand-mark \{ width: 24px; height: 24px;/);
  assert.match(styles, /\.site-mega::before \{[^}]*var\(--site-gold-on-dark\)/);
  assert.doesNotMatch(header, /tuckDistance|is-tucked/);
  assert.match(header, /import \{ menus, directLinks \} from '\.\.\/data\/navigation\.mjs'/);
  assert.match(header, /aria-controls=\{`site-menu-\$\{menu\.key\}`\}/);
});
```

In `test/site/demo-desktop-canvas.test.mjs`, change the expected `width: '20px', height: '20px'` in the `navGold` assertion to `'24px'` for both.

In `test/unit/brand-assets.test.js` line 205, change `\.site-brand-mark \{ width: 20px; height: 20px;` to `24px; height: 24px;`.

- [ ] **Step 7: Build, serve, run every site test and the touched unit tests**

Run: `npm run site:build`, start the preview, `BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/*.test.mjs`, then `node --test test/unit/site-island-visual.test.js test/unit/brand-assets.test.js test/unit/site-navigation.test.js test/unit/press-kit.test.js`.
Expected: PASS. The footer test's `navClear` check reads `.site-nav`'s top; with the bar at the top of the page that assertion holds trivially.

- [ ] **Step 8: Look once**

Screenshot the homepage at 1440 with the features menu open and at 390 with the sheet open, using the direct Playwright script pattern from earlier tasks. Expected: the panel spans the viewport under a hairline bar, the spotlight shows the island card, the sheet shows two accordions and the pinned download button.

- [ ] **Step 9: Commit**

```bash
git add site/src/components/Header.astro site/src/styles/site.css test/site/masthead.test.mjs test/unit/site-island-visual.test.js test/unit/brand-assets.test.js test/site/demo-desktop-canvas.test.mjs
git commit -m "Replace the bottom navigation island with a sticky masthead and mega menus"
```

---

### Task 3: Brand doc, site guidance, and the design record

**Files:**
- Modify: `docs/brand-usage.md` ("Desktop navigation Sunrise hover" section; the "Website Sunrise palette" sentence that mentions "dark desktop navigation")
- Modify: `site/CLAUDE.md` (the page-profiles sentence and the fonts sentence)
- Modify: `docs/superpowers/plans/2026-09-04-masthead-navigation.md` (tick the boxes)

- [ ] **Step 1: Amend the brand doc**

Replace the "Desktop navigation Sunrise hover" section with:

```
### Desktop masthead Sunrise hover

The desktop masthead is a sticky ivory bar (`--site-surface-raised` over a
blur, hairline beneath) that carries the monochrome Sunrise mark at 24px in
ink at rest. On hover or keyboard focus, crossfade to the original gold
artwork from `site/public/sunrise-hero-mark.png` over 220ms; crossfade back
when the interaction ends. Keep the size, position, and focus outline
unchanged. Reduced-motion visitors get the same state change instantly. Use
the original artwork rather than tinting the monochrome silhouette. The mega
menus that drop from the bar carry the horizon hairline along their top edge
and may use the warm-ink release card; no mark sits on either.
```

In "Website Sunrise palette", change "near-black headings, dark primary buttons, and dark desktop navigation" to "near-black headings, dark primary buttons, and an ivory desktop masthead".

- [ ] **Step 2: Amend the site guidance**

In `site/CLAUDE.md`, change "island (index: non-solid header, rich OG), standard (solid header)" to "island (index: the masthead starts transparent over the hero and raises on scroll, rich OG), standard (masthead raised from the start)", and add after the footer sentence: "The masthead and its two mega menus are `components/Header.astro` fed by `src/data/navigation.mjs`; menu descriptions are the feature pages' own headlines and `test/unit/site-navigation.test.js` keeps them in step."

- [ ] **Step 3: Run the doc guards and commit**

Run: `node --test test/unit/public-truth.test.js test/unit/site-island-visual.test.js`
Expected: PASS.

```bash
git add docs/brand-usage.md site/CLAUDE.md docs/superpowers/plans/2026-09-04-masthead-navigation.md
git commit -m "Record the masthead navigation in brand usage and site guidance"
```
