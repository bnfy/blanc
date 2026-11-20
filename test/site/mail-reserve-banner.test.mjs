// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/mail-reserve-banner.test.mjs
//
// The Blanc Mail reservation banner (components/MailReserveBanner.astro): a
// slim dark strip above the site header while site/src/data/mail-reservations.json
// says reservations are open. It is one link to /mail/reserve, scrolls away
// while the header stays put, and is left off the Mail, legal and What's New
// pages. These checks assume reservations are open.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const reservations = JSON.parse(readFileSync(new URL('../../site/src/data/mail-reservations.json', import.meta.url), 'utf8'));
let browser;
before(async () => { browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch(); });
after(async () => { await browser?.close(); });

async function openPage(path = '/', width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  // No analytics or other remote requests leave these tests.
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await page.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  await page.goto(`${baseURL}${path}`);
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

test('reservations are open, so the banner has something to promote', () => {
  assert.equal(reservations.open, true, 'these checks need mail-reservations.json to say open');
});

test('the banner leads the site pages, and stays off the Mail, legal and What\'s New pages', async () => {
  const { page, context } = await openPage();
  try {
    for (const path of ['/', '/features', '/download', '/patron']) {
      await page.goto(`${baseURL}${path}`);
      const banner = page.locator('.mail-reserve-banner');
      assert.equal(await banner.count(), 1, `${path}: one banner`);
      assert.equal(await banner.getAttribute('href'), '/mail/reserve', `${path}: links to the reserve form`);
      assert.ok((await banner.innerText()).includes(`@${reservations.endings[0]}`), `${path}: names the default ending`);
      // It sits above the header, right after the skip link.
      assert.equal(await page.evaluate(() => document.querySelector('.skip-link').nextElementSibling?.classList.contains('mail-reserve-banner')), true, path);
    }
    for (const path of ['/mail', '/mail/reserve', '/mail/privacy', '/privacy', '/terms', '/whats-new/1.38']) {
      await page.goto(`${baseURL}${path}`);
      assert.equal(await page.locator('.mail-reserve-banner').count(), 0, `${path}: no banner`);
    }
  } finally { await context.close(); }
});

test('the banner scrolls away while the header stays at the top', async () => {
  for (const path of ['/', '/features']) {
    const { page, context } = await openPage(path);
    try {
      await page.evaluate(() => scrollTo(0, 600));
      await page.waitForFunction(() => scrollY >= 600);
      const box = await page.evaluate(() => ({
        bannerBottom: document.querySelector('.mail-reserve-banner').getBoundingClientRect().bottom,
        headerTop: document.querySelector('.site-header').getBoundingClientRect().top,
      }));
      assert.ok(box.bannerBottom <= 0, `${path}: banner off screen (${box.bannerBottom})`);
      assert.equal(box.headerTop, 0, `${path}: header pinned at the top`);
    } finally { await context.close(); }
  }
});

test('phones keep the ask and the button on one 40px line, with nothing overflowing', async () => {
  for (const width of [320, 375, 640, 641, 1440]) {
    const { page, context } = await openPage('/', width);
    try {
      const state = await page.evaluate(() => {
        const banner = document.querySelector('.mail-reserve-banner');
        const shown = selector => banner.querySelector(selector).getClientRects().length > 0;
        return {
          height: banner.getBoundingClientRect().height,
          lead: shown('.mail-reserve-banner-lead'),
          ask: shown('.mail-reserve-banner-ask'),
          action: shown('.mail-reserve-banner-action'),
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.equal(state.height, 40, `${width}px: 40px tall`);
      assert.equal(state.lead, width > 640, `${width}px: lead text`);
      assert.equal(state.ask, true, `${width}px: the ask stays`);
      assert.equal(state.action, true, `${width}px: Reserve stays`);
      assert.equal(state.overflow, false, `${width}px: no horizontal overflow`);
    } finally { await context.close(); }
  }
});

test('clicking the banner opens the reserve form', async () => {
  const { page, context } = await openPage('/features', 390);
  try {
    await page.locator('.mail-reserve-banner').click();
    await page.waitForURL(url => new URL(url).pathname === '/mail/reserve');
  } finally { await context.close(); }
});
