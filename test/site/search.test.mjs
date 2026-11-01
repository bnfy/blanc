// BLANC_SITE_URL=http://127.0.0.1:4324 node --test test/site/search.test.mjs
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { chromium, webkit } from 'playwright';
const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
let browser;
before(async () => { browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch(); });
after(async () => { await browser?.close(); });
async function open(path = '/', width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('measurement-consent-v2', 'denied'));
  await page.goto(baseURL + path);
  return { page, context, requests };
}
const waitForResults = page => page.waitForFunction(() => document.querySelectorAll('#site-search-results a').length > 0);

test('search loads only when opened, supports keyboard navigation and returns focus', async () => {
  const { page, context, requests } = await open();
  try {
    assert.equal(requests.some(url => url.endsWith('search-index.json')), false);
    await page.locator('[data-site-search]').focus();
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('#site-search').evaluate(el => el.open), true);
    assert.equal(await page.locator('#site-search-input').evaluate(el => el === document.activeElement), true);
    await page.locator('#site-search-input').fill('glanc');
    await waitForResults(page);
    assert.match(await page.locator('#site-search-results').innerText(), /Glance/);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#site-search-results a').first().evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#site-search-results a').nth(1).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#site-search').open && document.documentElement.style.overflow === '');
    assert.equal(await page.locator('#site-search').evaluate(el => el.open), false);
    assert.equal(await page.locator('[data-site-search]').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '');
    assert.equal(requests.filter(url => url.endsWith('search-index.json')).length, 1);
  } finally { await context.close(); }
});

test('same-page answers open their details and close search', async () => {
  const { page, context } = await open('/support');
  try {
    await page.locator('[data-site-search]').click();
    await page.locator('#site-search-input').fill('glance');
    await waitForResults(page);
    await page.locator('#site-search-results a[href="/support#glance"]').click();
    await page.waitForFunction(() => document.querySelector('#glance').open);
    assert.equal(await page.locator('#site-search').evaluate(el => el.open), false);
    assert.equal(new URL(page.url()).hash, '#glance');
  } finally { await context.close(); }
});

test('failure offers a retry; zero matches and markup queries are safe', async () => {
  const { page, context } = await open();
  try {
    await page.route('**/search-index.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.locator('[data-site-search]').click();
    await page.locator('[data-search-retry]').waitFor({ state: 'visible' });
    assert.match(await page.locator('.site-search-status').innerText(), /couldn’t load/);
    await page.unroute('**/search-index.json');
    await page.locator('[data-search-retry]').click();
    await page.locator('#site-search-input').fill('glance');
    await waitForResults(page);
    await page.locator('#site-search-input').fill('<img src=x onerror=alert(1)>zzzzzzzz');
    assert.match(await page.locator('.site-search-status').innerText(), /No results/);
    assert.equal(await page.locator('#site-search-results img').count(), 0);
  } finally { await context.close(); }
});

test('dialog fits narrow phones and keeps keyboard focus inside', async () => {
  for (const width of [320, 390, 768, 1440]) {
    const { page, context } = await open('/', width);
    try {
      await page.locator('[data-site-search]').click();
      await page.locator('#site-search-input').fill('tabs');
      await waitForResults(page);
      assert.equal(await page.locator('#site-search').evaluate(el => {
        const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      }), true, `${width}px dialog fits`);
      await page.locator('#site-search-results a').last().focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#site-search').evaluate(el => el.contains(document.activeElement)), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally { await context.close(); }
  }
});

test('short screens keep the entire result scroller and footer inside the dialog', async () => {
  for (const [width, height] of [[390, 320], [844, 390]]) {
    const { page, context } = await open('/', width);
    try {
      await page.locator('[data-site-search]').click();
      await page.locator('#site-search-input').fill('tabs');
      await waitForResults(page);
      // Resize after opening, like a software keyboard reducing usable height.
      await page.setViewportSize({ width, height });
      const fits = await page.evaluate(() => {
        const dialog = document.querySelector('#site-search').getBoundingClientRect();
        return ['.site-search-top', '.site-search-field', '.site-search-body', '.site-search-bottom'].every(selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return rect.top >= dialog.top && rect.bottom <= dialog.bottom && rect.bottom <= innerHeight;
        });
      });
      assert.equal(fits, true, `${width}×${height}: every region fits`);
      const last = page.locator('#site-search-results a').last();
      await last.focus();
      await page.locator('.site-search-body').hover();
      await page.mouse.wheel(0, 5000);
      await page.waitForFunction(() => {
        const links = document.querySelectorAll('#site-search-results a');
        return links[links.length - 1].getBoundingClientRect().bottom <= document.querySelector('.site-search-body').getBoundingClientRect().bottom + 1;
      });
      assert.equal(await last.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const scroller = document.querySelector('.site-search-body').getBoundingClientRect();
        return rect.bottom <= scroller.bottom + 1 && rect.top < scroller.bottom;
      }), true, 'last result scrolls into view');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#site-search').evaluate(el => el.contains(document.activeElement)), true);
    } finally { await context.close(); }
  }
});

test('published index excludes utility pages and every destination and anchor exists', async () => {
  const response = await fetch(baseURL + '/search-index.json');
  const docs = await response.json();
  assert.ok(docs.length > 100);
  assert.ok(JSON.stringify(docs).length < 400000, 'bang directory is excluded');
  assert.ok(!docs.some(doc => /404|import-tabs|faq\.html/.test(doc.url)));
  const pages = new Map();
  for (const doc of docs) {
    const [path, hash] = doc.url.split('#');
    if (!pages.has(path)) {
      const result = await fetch(baseURL + path);
      assert.equal(result.status, 200, path);
      pages.set(path, await result.text());
    }
    if (hash) assert.ok(pages.get(path).includes(`id="${hash}"`), doc.url);
  }
});
