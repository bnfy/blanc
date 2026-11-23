// BLANC_SITE_URL=http://127.0.0.1:4324 node --test test/site/support-page.test.mjs
// The Support page's product tabs (redesign of November 23, 2026): radios
// switch panels in CSS, answers.js follows deep links into the right tab,
// searches every tab and honors ?product=.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium, webkit } from 'playwright';
const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
let browser;
before(async () => { browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch(); });
after(async () => { await browser?.close(); });
async function open(path, { width = 1440, javaScriptEnabled = true, userAgent } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 850 }, reducedMotion: 'reduce', javaScriptEnabled, userAgent });
  const page = await context.newPage();
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  if (javaScriptEnabled) await page.addInitScript(() => localStorage.setItem('measurement-consent-v2', 'denied'));
  await page.goto(baseURL + path);
  return { page, context };
}
const shown = page => page.evaluate(() => [...document.querySelectorAll('.support-panel')]
  .filter(panel => getComputedStyle(panel).display !== 'none').map(panel => panel.dataset.panel));

test('the desktop tab shows first and each tab switches its panel, without scripting too', async () => {
  for (const javaScriptEnabled of [true, false]) {
    const { page, context } = await open('/support', { javaScriptEnabled });
    try {
      assert.deepEqual(await shown(page), ['desktop'], `scripting ${javaScriptEnabled}`);
      for (const product of ['iphone', 'beta', 'mail', 'desktop']) {
        await page.locator(`label[data-product="${product}"]`).click();
        assert.deepEqual(await shown(page), [product], `${product}, scripting ${javaScriptEnabled}`);
      }
    } finally { await context.close(); }
  }
});

test('deep links open the right tab and answer', async () => {
  for (const [path, id, product] of [
    ['/support#updates', 'updates', 'desktop'],
    ['/support#glance', 'glance', 'desktop'],
    ['/support#iphone-pair', 'iphone-pair', 'iphone'],
    ['/support?product=mail#beta-updates', 'beta-updates', 'beta'],
    ['/faq#bookmark-import', 'bookmark-import', 'desktop'],
  ]) {
    const { page, context } = await open(path);
    try {
      await page.waitForFunction(target => document.getElementById(target)?.open, id);
      assert.deepEqual(await shown(page), [product], path);
    } finally { await context.close(); }
  }
});

test('?product= and an iPhone choose the opening tab, and choosing a tab updates the address', async () => {
  let { page, context } = await open('/support?product=beta');
  try {
    assert.deepEqual(await shown(page), ['beta']);
    await page.locator('label[data-product="mail"]').click();
    assert.equal(new URL(page.url()).searchParams.get('product'), 'mail');
    await page.locator('label[data-product="desktop"]').click();
    assert.equal(new URL(page.url()).searchParams.has('product'), false);
  } finally { await context.close(); }
  ({ page, context } = await open('/support', { width: 390, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1' }));
  try {
    assert.deepEqual(await shown(page), ['iphone']);
  } finally { await context.close(); }
});

test('search finds answers in every tab and clearing it restores the chosen tab', async () => {
  const { page, context } = await open('/support');
  try {
    await page.locator('#answer-search').fill('pair');
    await page.waitForFunction(() => !document.getElementById('iphone-pair').hidden);
    assert.ok((await shown(page)).includes('iphone'));
    assert.equal(await page.locator('#iphone-pair').isVisible(), true);
    assert.equal(await page.locator('.support-tabs').isVisible(), false);
    await page.locator('#clear-search').click();
    assert.deepEqual(await shown(page), ['desktop']);
    assert.equal(await page.locator('.support-tabs').isVisible(), true);
  } finally { await context.close(); }
});

test('the tabs fit a phone without scrolling sideways', async () => {
  const { page, context } = await open('/support', { width: 390 });
  try {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    for (const product of ['desktop', 'iphone', 'beta', 'mail']) {
      assert.equal(await page.locator(`label[data-product="${product}"]`).isVisible(), true, product);
    }
  } finally { await context.close(); }
});
