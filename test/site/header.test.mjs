// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/header.test.mjs
//
// The site header since the cinematic redesign (October 15, 2026): one dark,
// sticky 52px bar on every page with the small Blanc lockup, the Browser menu,
// five direct links and the Download pill. At 920px and below the links fold behind a Menu
// button (revamp.css). It stays put while scrolling, because the homepage's
// sticky scenes sit just below it.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const links = ['Browser', 'Privacy & Security', 'Patron', 'About', 'Support', 'Mail'];
const linksAt = width => width <= 920 ? [] : links;
let browser;
before(async () => { browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch(); });
after(async () => { await browser?.close(); });

async function openPage(path = '/', width = 1440, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  // No analytics or other remote requests leave these tests.
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await page.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  await page.goto(`${baseURL}${path}`);
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

const header = page => page.evaluate(() => {
  const bar = document.querySelector('.site-header');
  const style = getComputedStyle(bar);
  const cta = document.querySelector('.site-nav-cta');
  return {
    position: style.position,
    top: style.top,
    shown: [...bar.querySelectorAll('.revamp-nav-link')].filter(a => a.getClientRects().length).map(a => a.textContent.trim()),
    current: [...bar.querySelectorAll('[aria-current="page"]')].map(a => a.textContent.trim()),
    cta: cta.getAttribute('href'),
    home: bar.querySelector('.site-brand').getAttribute('href'),
    inBounds: [...bar.querySelectorAll('a, button')].filter(el => el.getClientRects().length)
      .every(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }),
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
});

test('the header stays at the top, marks the current section and points Download at the right place', async () => {
  const { page, context } = await openPage();
  try {
    for (const [path, current, cta] of [
      ['/', [], '/download'], ['/features', ['Browser'], '/download'], ['/features/island', ['Browser'], '/download'],
      ['/trust', ['Privacy & Security'], '/download'], ['/patron', ['Patron'], '/download'], ['/support', ['Support'], '/download'], ['/mail', ['Mail'], '/download'],
      ['/download', [], '#download-options'],
    ]) {
      await page.goto(`${baseURL}${path}`);
      const bar = await header(page);
      assert.equal(bar.position, 'sticky', path);
      assert.equal(bar.top, '0px', path);
      assert.deepEqual(bar.shown, links, `${path}: all six links on desktop`);
      assert.deepEqual(bar.current, current, `${path}: current section`);
      assert.equal(bar.cta, cta, `${path}: Download target`);
      assert.equal(bar.home, '/', path);
    }
  } finally { await context.close(); }
});

test('narrow windows fold the links behind Menu, and nothing overflows at any width', async () => {
  for (const width of [320, 390, 760, 768, 800, 920, 921, 1024, 1440]) {
    const { page, context } = await openPage('/', width);
    try {
      for (const path of ['/', '/features', '/mail', '/download']) {
        await page.goto(`${baseURL}${path}`);
        const bar = await header(page);
        assert.deepEqual(bar.shown, linksAt(width), `${width}px ${path}: visible links`);
        assert.equal(await page.locator('.site-menu-toggle').isVisible(), width <= 920, `${width}px ${path}: Menu button`);
        assert.equal(await page.locator('.site-nav-cta').isVisible(), true, `${width}px ${path}: Download stays in the bar`);
        assert.equal(bar.inBounds, true, `${width}px ${path}: every control inside the viewport`);
        assert.equal(bar.overflow, false, `${width}px ${path}: no horizontal overflow`);
      }
    } finally { await context.close(); }
  }
});

test('Menu opens every link, reports its state, and closes with Escape', async () => {
  const { page, context } = await openPage('/features', 390);
  try {
    const toggle = page.locator('.site-menu-toggle');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await toggle.getAttribute('aria-controls'), 'site-menu');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await toggle.textContent(), 'Close');
    assert.deepEqual((await header(page)).shown, links, 'every link in the open menu');
    assert.equal((await header(page)).inBounds, true, 'open menu inside the viewport');
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('site-menu-toggle')), true, 'focus returns to Menu');
    assert.deepEqual((await header(page)).shown, []);
  } finally { await context.close(); }
});

test('without scripting, narrow windows keep every link in the bar', async () => {
  const { page, context } = await openPage('/features', 390, { javaScriptEnabled: false });
  try {
    const bar = await header(page);
    assert.deepEqual(bar.shown, links);
    assert.equal(await page.locator('.site-menu-toggle').isVisible(), false);
    assert.equal(bar.inBounds, true);
    assert.equal(bar.overflow, false);
  } finally { await context.close(); }
});

// The Browser menu (navigation.mjs) opens on click, tap or keys, never on
// hover, and its trigger is a plain link to /features without scripting.
const browserPanel = page => page.evaluate(() => {
  const panel = document.querySelector('.site-browser-panel');
  return {
    open: !panel.hidden && panel.getClientRects().length > 0,
    expanded: document.querySelector('[data-browser-trigger]').getAttribute('aria-expanded'),
    links: [...panel.querySelectorAll('a')].map(a => [a.textContent.trim(), a.getAttribute('href')]),
    inBounds: (() => { const r = panel.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })(),
  };
});

test('the Browser menu opens on click with Download and Features, and closes with Escape or a click outside', async () => {
  for (const width of [921, 1024, 1440]) {
    const { page, context } = await openPage('/trust', width);
    try {
      const trigger = page.locator('[data-browser-trigger]');
      assert.equal(await trigger.getAttribute('role'), 'button');
      assert.equal(await trigger.getAttribute('aria-controls'), 'site-browser-panel');
      await trigger.hover();
      assert.equal((await browserPanel(page)).open, false, `${width}px: hover never opens it`);
      await trigger.click();
      const open = await browserPanel(page);
      assert.equal(open.open, true, `${width}px: click opens it`);
      assert.equal(open.expanded, 'true');
      assert.equal(open.inBounds, true, `${width}px: panel inside the viewport`);
      assert.equal(new URL(page.url()).pathname, '/trust', 'the trigger does not navigate');
      assert.deepEqual(open.links.map(([label]) => label), ['macOS', 'Windows', 'Linux', 'The Island', 'Blanc Spaces', 'Tab groups', 'Ad and tracker blocking', 'Private tabs', 'Glance', 'Start Page', 'All features', 'Blanc vs. Chrome']);
      await page.keyboard.press('Escape');
      assert.equal((await browserPanel(page)).open, false, 'Escape closes it');
      assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-browser-trigger')), true, 'focus returns to Browser');
      await page.keyboard.press('Enter');
      assert.equal((await browserPanel(page)).open, true, 'Enter opens it');
      await page.mouse.click(10, 600);
      assert.equal((await browserPanel(page)).open, false, 'a click outside closes it');
    } finally { await context.close(); }
  }
});

test('every Browser menu link reaches a page', async () => {
  const { page, context } = await openPage('/trust');
  try {
    for (const [label, href] of (await browserPanel(page)).links) {
      const response = await page.request.get(`${baseURL}${href.replace(/#.*/, '') || '/'}`);
      assert.equal(response.status(), 200, `${label}: ${href}`);
    }
  } finally { await context.close(); }
});

test('in the phone menu, Browser opens its links in place without closing Menu', async () => {
  const { page, context } = await openPage('/trust', 390);
  try {
    await page.locator('.site-menu-toggle').click();
    await page.locator('[data-browser-trigger]').click();
    const open = await browserPanel(page);
    assert.equal(open.open, true);
    assert.equal(open.inBounds, true);
    assert.equal(await page.locator('.site-menu-toggle').getAttribute('aria-expanded'), 'true', 'Menu stays open');
    await page.keyboard.press('Escape');
    assert.equal((await browserPanel(page)).open, false, 'the first Escape closes Browser');
    assert.equal(await page.locator('.site-menu-toggle').getAttribute('aria-expanded'), 'true');
  } finally { await context.close(); }
});

test('without scripting, Browser is a link to the Features page', async () => {
  const { page, context } = await openPage('/trust', 1440, { javaScriptEnabled: false });
  try {
    assert.equal(await page.locator('[data-browser-trigger]').getAttribute('href'), '/features');
    assert.equal((await browserPanel(page)).open, false);
  } finally { await context.close(); }
});

test('no page offers a dark mode toggle', async () => {
  const { page, context } = await openPage('/');
  try {
    for (const path of ['/', '/features', '/download', '/trust']) {
      await page.goto(`${baseURL}${path}`);
      assert.equal(await page.locator('#home-appearance').count(), 0, `${path}: no toggle`);
    }
  } finally { await context.close(); }
});

test('the header stays in view while the page scrolls', async () => {
  const { page, context } = await openPage('/', 1440, { reducedMotion: 'no-preference' });
  try {
    const top = () => page.evaluate(() => document.querySelector('.site-header').getBoundingClientRect().top);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(60); }
    assert.ok(await page.evaluate(() => scrollY) > 1000);
    assert.equal(await top(), 0, 'still at the top after scrolling down');
    for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(60); }
    assert.equal(await top(), 0, 'and after scrolling back up');
  } finally { await context.close(); }
});

test('the skip link is the first stop and lands on the main content', async () => {
  const { page, context } = await openPage('/features');
  try {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('skip-link')), true);
    assert.equal(await page.locator('.skip-link').isVisible(), true, 'visible while focused');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => location.hash), '#main-content');
    assert.equal(await page.locator('#main-content').count(), 1);
  } finally { await context.close(); }
});
