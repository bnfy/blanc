// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/masthead.test.mjs
//
// The sticky masthead that replaced the bottom navigation island on
// 4 Sep 2026: two mega menus, a direct what's-new link, the download pill,
// the homepage's transparent-to-raised bar, and the mobile accordion sheet.
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
  // No analytics or other remote requests leave these tests.
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
    assert.equal(bar.tucks, false);
    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => { const h = document.querySelector('.site-header'); return { top: h.getBoundingClientRect().top, opacity: getComputedStyle(h).opacity }; });
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
    await page.waitForFunction(() => { const s = getComputedStyle(document.querySelector('#site-menu-features')); return s.visibility === 'visible' && s.opacity === '1'; }, null, { timeout: 2000 });
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
    const card = await page.locator('#site-menu-resources .site-mega-release').evaluate(el => ({ text: el.textContent, bg: getComputedStyle(el).backgroundColor, title: getComputedStyle(el.querySelector('.site-mega-release-title')).fontFamily }));
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
    const triggersVisible = await page.locator('.site-menu-trigger').evaluateAll(els => els.some(el => el.getClientRects().length > 0));
    assert.equal(triggersVisible, false, 'desktop triggers are hidden');
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
