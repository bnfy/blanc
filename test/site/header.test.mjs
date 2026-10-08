// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/header.test.mjs
//
// The site header since the website revamp (#491): a sticky bar with the
// Sunrise mark, six direct links (four of them secondary, hidden on phones),
// the Download pill, and a homepage-only dark mode toggle. At 760px and
// below only Features and Support stay; Mail joins above 800px (revamp.css). It hides while the
// visitor scrolls down and returns when they scroll back up.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const links = ['Features', 'Privacy & Security', 'Patron', 'About', 'Support', 'Mail'];
const phoneLinks = ['Features', 'Support'];
const linksAt = width => width <= 760 ? phoneLinks : width <= 800 ? links.filter(link => link !== 'Mail') : links;
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
      ['/', [], '/download'], ['/features', ['Features'], '/download'], ['/features/island', ['Features'], '/download'],
      ['/trust', ['Privacy & Security'], '/download'], ['/support', ['Support'], '/download'], ['/mail', ['Mail'], '/download'],
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

test('phones keep Features, Support and Download in the bar, and nothing overflows at any width', async () => {
  for (const width of [320, 390, 760, 768, 800, 801, 1024, 1440]) {
    const { page, context } = await openPage('/', width);
    try {
      for (const path of ['/', '/features', '/mail', '/download']) {
        await page.goto(`${baseURL}${path}`);
        const bar = await header(page);
        assert.deepEqual(bar.shown, linksAt(width), `${width}px ${path}: visible links`);
        assert.equal(bar.inBounds, true, `${width}px ${path}: every control inside the viewport`);
        assert.equal(bar.overflow, false, `${width}px ${path}: no horizontal overflow`);
      }
    } finally { await context.close(); }
  }
});

test('only the homepage offers the dark mode toggle, and it reports its state', async () => {
  const { page, context } = await openPage('/');
  try {
    const toggle = page.locator('#home-appearance');
    assert.equal(await toggle.isVisible(), true);
    const before = await toggle.getAttribute('aria-pressed');
    await toggle.click();
    assert.notEqual(await toggle.getAttribute('aria-pressed'), before, 'aria-pressed follows the choice');
    for (const path of ['/features', '/download', '/trust']) {
      await page.goto(`${baseURL}${path}`);
      assert.equal(await page.locator('#home-appearance').count(), 0, `${path}: no toggle`);
    }
  } finally { await context.close(); }
});

test('scrolling down tucks the header away and scrolling up brings it back', async () => {
  const { page, context } = await openPage('/features', 1440, { reducedMotion: 'no-preference' });
  try {
    const hidden = () => page.evaluate(() => document.querySelector('.site-header').classList.contains('is-scroll-hidden'));
    assert.equal(await hidden(), false);
    for (let y = 200; y <= 1600; y += 200) { await page.mouse.wheel(0, 200); await page.waitForTimeout(60); }
    await page.waitForFunction(() => document.querySelector('.site-header').classList.contains('is-scroll-hidden'));
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(60); }
    await page.waitForFunction(() => !document.querySelector('.site-header').classList.contains('is-scroll-hidden'));
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForFunction(() => !document.querySelector('.site-header').classList.contains('is-scroll-hidden'));
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
