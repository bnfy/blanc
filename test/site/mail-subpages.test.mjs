// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/mail-subpages.test.mjs
//
// The two Blanc Mail subpages, Privacy and Terms
// (docs/superpowers/specs/2026-10-12-mail-pages-redesign-design.md §5):
// documents with an "On this page" list. Pricing, Download and Support became
// sections of /mail on October 22, 2026 (test/site/mail-overview.test.mjs).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
let browser;
before(async () => { browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch(); });
after(async () => { await browser?.close(); });

async function openPage(path, width = 1440, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  // No analytics or other remote requests leave these tests.
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await page.addInitScript(() => { try { localStorage.setItem('measurement-consent-v2', 'denied'); } catch {} });
  await page.goto(`${baseURL}${path}`);
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

const current = page => page.evaluate(() => document.querySelector('.mail-contents a[aria-current="location"]')?.getAttribute('href'));

test('Privacy and Terms list every section beside the text and mark the one being read', async () => {
  for (const path of ['/mail/privacy', '/mail/terms']) {
    const { page, context } = await openPage(path);
    try {
      const contents = await page.evaluate(() => ({
        links: [...document.querySelectorAll('.mail-contents a')].map(a => a.getAttribute('href')),
        headings: [...document.querySelectorAll('.mail-doc-body h2[id]')].map(h => `#${h.id}`),
        position: getComputedStyle(document.querySelector('.mail-contents')).position,
        compact: getComputedStyle(document.querySelector('.mail-contents-compact')).display,
      }));
      assert.ok(contents.headings.length >= 5, path);
      assert.deepEqual(contents.links, contents.headings, `${path}: one link per section, in order`);
      assert.equal(contents.position, 'sticky');
      assert.equal(contents.compact, 'none', `${path}: no disclosure on wide screens`);
      assert.equal(await current(page), contents.headings[0]);
      const target = contents.headings[2];
      await page.evaluate(id => document.querySelector(id).scrollIntoView({ block: 'start' }), target);
      await page.waitForFunction(id => document.querySelector('.mail-contents a[aria-current="location"]')?.getAttribute('href') === id, target);
    } finally { await context.close(); }
  }
});

test('a link to a section lands with its heading below the bars', async () => {
  const { page, context } = await openPage('/mail/terms#subscriptions');
  try {
    await page.waitForFunction(() => document.querySelector('.mail-contents a[aria-current="location"]')?.getAttribute('href') === '#subscriptions');
    const gap = id => page.evaluate(id => document.getElementById(id).getBoundingClientRect().top - document.querySelector('.mail-bar').getBoundingClientRect().bottom, id);
    assert.ok(await gap('subscriptions') >= 0, `the heading starts ${await gap('subscriptions')}px below the bar`);
    // Jumping back up lands below both bars too.
    await page.evaluate(() => { location.hash = '#contact'; });
    await page.waitForTimeout(400);
    await page.locator('.mail-contents a[href="#the-app-and-trial"]').click();
    await page.waitForTimeout(400);
    assert.ok(await gap('the-app-and-trial') >= 0, `after jumping up, the heading starts ${await gap('the-app-and-trial')}px below the bar`);
    assert.equal(await current(page), '#the-app-and-trial');
  } finally { await context.close(); }
});

test('the last sections are marked too, though they can never scroll up to the line', async () => {
  for (const [path, size] of [['/mail/terms#contact', [1440, 900]], ['/mail/privacy#contact', [1440, 900]], ['/mail/terms#governing-law', [1920, 1080]]]) {
    const { page, context } = await openPage(path, size[0], { viewport: { width: size[0], height: size[1] } });
    try {
      const hash = path.slice(path.indexOf('#'));
      await page.waitForFunction(id => document.querySelector('.mail-contents a[aria-current="location"]')?.getAttribute('href') === id, hash, { timeout: 3000 })
        .catch(() => {});
      assert.equal(await current(page), hash, `${path} at ${size.join('×')}`);
    } finally { await context.close(); }
  }
  const tall = await openPage('/mail/terms', 1920, { viewport: { width: 1920, height: 1400 } });
  try {
    for (const id of ['#warranty-and-liability', '#governing-law', '#contact']) {
      await tall.page.locator(`.mail-contents a[href="${id}"]`).click();
      await tall.page.waitForTimeout(300);
      assert.equal(await current(tall.page), id, `clicking ${id} at 1920×1400`);
    }
  } finally { await tall.context.close(); }
  // A section linked to earlier no longer counts once it has scrolled away.
  const stale = await openPage('/mail/terms#subscriptions', 1440);
  try {
    await stale.page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await stale.page.waitForTimeout(300);
    assert.equal(await current(stale.page), '#contact', 'at the bottom after an earlier link');
  } finally { await stale.context.close(); }
});

test('below 1024px the list folds into a closed "On this page" disclosure', async () => {
  const { page, context } = await openPage('/mail/privacy', 800);
  try {
    const state = await page.evaluate(() => ({
      side: getComputedStyle(document.querySelector('.mail-contents')).display,
      open: document.querySelector('.mail-contents-compact').open,
      summary: document.querySelector('.mail-contents-compact summary').textContent.trim(),
      headings: document.querySelectorAll('.mail-doc-body h2[id]').length,
    }));
    assert.equal(state.side, 'none');
    assert.equal(state.open, false);
    assert.equal(state.summary, 'On this page');
    await page.locator('.mail-contents-compact summary').click();
    assert.equal(await page.evaluate(() => document.querySelector('.mail-contents-compact').open), true);
    assert.equal(await page.locator('.mail-contents-compact a').count(), state.headings);
  } finally { await context.close(); }
});
