import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

// /bangs: the explainer, the try-it box and the full directory
// (docs/superpowers/specs/2026-10-17-bangs-page-design.md).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/src/data/bangs.json'), 'utf8'));
const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const url = `${baseURL}/bangs`;
const countText = data.count.toLocaleString('en-US');
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

async function open(options = {}, { blockData = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', ...options });
  const requests = [];
  await context.route('**/*', (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== new URL(baseURL).origin) return route.abort();
    if (blockData && /bangs\.[^/]*\.json$/.test(request.url())) return route.fulfill({ status: 404, body: '' });
    return route.continue();
  });
  await context.addInitScript(() => localStorage.setItem('measurement-consent-v2', 'denied'));
  const page = await context.newPage();
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(url);
  return { context, page, requests };
}

const visibleRows = (page) => page.locator('#bangs-rows li:not([hidden])');

test('the page leads with its headline, breadcrumb and a jump to the directory', async () => {
  const { context, page } = await open();
  try {
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal((await page.locator('h1').innerText()).trim(), 'Search the site. Skip the engine.');
    assert.equal((await page.locator('.breadcrumb').innerText()).replace(/\s+/g, ' ').trim(), 'home / features / bangs');
    assert.equal(await page.locator('a[href="#find-a-bang"]').count(), 1);
    assert.equal(await page.locator('#find-a-bang').count(), 1);
  } finally { await context.close(); }
});

test('without JavaScript every bang is in the page and the try-it box shows its example', async () => {
  const { context, page } = await open({ javaScriptEnabled: false });
  try {
    assert.equal(await page.locator('#bangs-rows li').count(), data.count);
    assert.match(await page.locator('#bangs-try-list').innerText(), /!yt[\s\S]*Search YouTube for “lofi”/);
    assert.match(await page.locator('.bangs-dir-sub').innerText(), new RegExp(countText));
  } finally { await context.close(); }
});

test('the try-it box answers as the app does and goes nowhere', async () => {
  const { context, page, requests } = await open();
  try {
    const before = page.url();
    await page.waitForLoadState('networkidle');
    const loaded = requests.length;
    await page.locator('#bangs-try').fill('!w golden retriever');
    await page.waitForFunction(() => document.querySelector('#bangs-try-list').textContent.includes('golden retriever'));
    const list = await page.locator('#bangs-try-list').innerText();
    assert.match(list, /!wikipedia/);
    assert.match(list, /Search Wikipedia for “golden retriever”/);
    assert.match(await page.locator('#bangs-try-dest').innerText(), /Return would open https:\/\/wikipedia\.org\/w\/index\.php\?search=golden\+retriever/);
    await page.locator('#bangs-try').press('Enter');
    await page.waitForTimeout(300);
    assert.equal(page.url(), before);
    assert.equal(context.pages().length, 1);
    // Typing may fetch the page's own bang data asset, and nothing else.
    const typed = requests.slice(loaded).filter((request) => !/\/_astro\/bangs\.[^/]+\.json$/.test(request));
    assert.deepEqual(typed, [], 'typing sends nothing anywhere');
    await page.locator('#bangs-try').fill('plain words');
    await page.waitForFunction(() => document.querySelector('#bangs-try-list').textContent.includes('Not a bang'));
  } finally { await context.close(); }
});

test('pasted text is capped at 200 characters and the page stays responsive', async () => {
  const { context, page } = await open();
  try {
    await page.locator('#bangs-try').fill(`!yt ${'a'.repeat(5000)}`);
    assert.equal((await page.locator('#bangs-try').inputValue()).length, 200);
    const started = Date.now();
    await page.evaluate(() => 1);
    assert.ok(Date.now() - started < 1000);
  } finally { await context.close(); }
});

test('the directory searches by site and by code and keeps its counts truthful', async () => {
  const { context, page } = await open();
  try {
    assert.equal(await visibleRows(page).count(), 50);
    assert.match(await page.locator('#bangs-showing').innerText(), new RegExp(`Showing 50 of ${countText}`));
    for (const query of ['youtube', 'yt']) {
      await page.locator('#bangs-search').fill(query);
      await page.waitForFunction(() => document.querySelector('#bangs-rows li:not([hidden])')?.dataset.code === 'yt');
    }
    await page.locator('#bangs-search').fill('goo');
    await page.waitForTimeout(200);
    if (await page.locator('#bangs-more').isVisible()) await page.locator('#bangs-more').click();
    const shown = await visibleRows(page).count();
    assert.match(await page.locator('#bangs-showing').innerText(), new RegExp(`Showing ${shown.toLocaleString('en-US')} of`));
    await page.locator('#bangs-search').fill('');
    await page.waitForTimeout(200);
    assert.equal(await visibleRows(page).count(), 50);
    assert.match(await page.locator('#bangs-showing').innerText(), new RegExp(`Showing 50 of ${countText}`));
  } finally { await context.close(); }
});

test('bangs that search through another engine are marked', async () => {
  const { context, page } = await open({ javaScriptEnabled: false });
  try {
    // textContent: rows off screen are skipped by content-visibility, which innerText honors.
    assert.match(await page.locator('#bangs-rows li[data-code="ubuntufr"]').textContent(), /via Google/);
    assert.match(await page.locator('#bangs-rows li[data-code="aamulehti"]').textContent(), /via DuckDuckGo/);
    assert.doesNotMatch(await page.locator('#bangs-rows li[data-code="yt"]').textContent(), /via /);
    assert.equal(await page.locator('#bangs-rows [data-via]').count(), Object.keys(data.via).length);
  } finally { await context.close(); }
});

test('phones get no horizontal scroll', async () => {
  const { context, page } = await open({ viewport: { width: 360, height: 780 } });
  try {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `page overflows by ${overflow}px`);
  } finally { await context.close(); }
});

test('if the data asset fails, search still works from the page and the box keeps its example', async () => {
  const { context, page } = await open({}, { blockData: true });
  try {
    await page.locator('#bangs-search').fill('youtube');
    await page.waitForFunction(() => document.querySelector('#bangs-rows li:not([hidden])')?.dataset.code === 'yt');
    await page.locator('#bangs-try').fill('!w x');
    await page.waitForTimeout(300);
    assert.match(await page.locator('#bangs-try-list').innerText(), /Search YouTube for “lofi”/);
    assert.equal(await page.locator('.bangs-error, [role="alert"]').count(), 0);
  } finally { await context.close(); }
});

test('the page and its data stay within budget', () => {
  const html = fs.statSync(path.join(ROOT, 'site/dist/bangs.html')).size;
  assert.ok(html <= 1.8 * 1024 * 1024, `bangs.html is ${html} bytes`);
  const assets = fs.readdirSync(path.join(ROOT, 'site/dist/_astro')).filter((name) => /^bangs\..*\.json$/.test(name));
  assert.equal(assets.length, 1, 'one hashed bang data asset');
  const json = fs.statSync(path.join(ROOT, 'site/dist/_astro', assets[0])).size;
  assert.ok(json <= 1.6 * 1024 * 1024, `bang data is ${json} bytes`);
});
