// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/mail-subpages.test.mjs
//
// The five Blanc Mail subpages after the redesign
// (docs/superpowers/specs/2026-10-12-mail-pages-redesign-design.md §5):
// Privacy and Terms as documents with an "On this page" list, Pricing that
// says purchases are not open before any price, Download beside its
// requirements, and Support that opens with its address.
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
    // Jumping back up brings the site header back, and the bar down with it.
    await page.evaluate(() => { location.hash = '#contact'; });
    await page.waitForTimeout(400);
    await page.locator('.mail-contents a[href="#the-app-and-trial"]').click();
    await page.waitForFunction(() => !document.querySelector('.site-header').classList.contains('is-scroll-hidden'));
    await page.waitForTimeout(400); // the bars' 220ms slide
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

test('Pricing says purchases are not open before any price, and recommends neither plan', async () => {
  const { page, context } = await openPage('/mail/pricing');
  try {
    const pricing = await page.evaluate(() => {
      const callout = document.querySelector('.mail-pricing .mail-callout');
      const plans = document.querySelector('.mail-plans');
      return {
        text: callout.textContent.trim(),
        first: Boolean(callout.compareDocumentPosition(plans) & Node.DOCUMENT_POSITION_FOLLOWING),
        plans: document.querySelectorAll('.mail-plan').length,
        tabular: [...document.querySelectorAll('.mail-plan-price')].every(p => getComputedStyle(p).fontVariantNumeric.includes('tabular-nums')),
        badge: /recommended|best value|most popular/i.test(plans.textContent),
      };
    });
    assert.match(pricing.text, /^Purchases are not open yet\./);
    assert.ok(pricing.first, 'the status comes before the plans');
    assert.equal(pricing.plans, 2);
    assert.ok(pricing.tabular, 'prices use tabular figures');
    assert.equal(pricing.badge, false);
  } finally { await context.close(); }
});

test('Download puts the waitlist beside its requirements on wide screens and above them on phones', async () => {
  for (const [width, beside] of [[1440, true], [390, false]]) {
    const { page, context } = await openPage('/mail/download', width);
    try {
      const layout = await page.evaluate(() => {
        const main = document.querySelector('.mail-download-main').getBoundingClientRect();
        const requirements = document.querySelector('.mail-requirements').getBoundingClientRect();
        return {
          beside: requirements.left >= main.right - 1 && requirements.top < main.bottom,
          below: requirements.top >= main.bottom - 1,
        };
      });
      assert.equal(beside ? layout.beside : layout.below, true, `${width}px`);
      assert.equal(await page.locator('form#download-waitlist').count(), 1);
    } finally { await context.close(); }
  }
});

test('Support opens with its address, then three topics', async () => {
  const { page, context } = await openPage('/mail/support');
  try {
    const support = await page.evaluate(() => {
      const contact = document.querySelector('.mail-contact');
      const topics = document.querySelector('.mail-topics');
      return {
        address: contact.querySelector('a[href^="mailto:"]').getAttribute('href'),
        first: Boolean(contact.compareDocumentPosition(topics) & Node.DOCUMENT_POSITION_FOLLOWING),
        cards: [...topics.querySelectorAll('.mail-card h2')].map(h => h.textContent.trim()),
      };
    });
    assert.equal(support.address, 'mailto:support@blanc.day');
    assert.ok(support.first);
    assert.deepEqual(support.cards, ['Accounts and data', 'Uninstalling', 'Updates and licensing']);
  } finally { await context.close(); }
});
