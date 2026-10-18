// The discreet newsletter card (site/src/components/NewsletterPrompt.astro).
// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/newsletter-prompt.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const endpoint = 'https://blanc-newsletter.bnfy-441.workers.dev/subscribe';
const KEY = 'blanc-newsletter-prompt-v1';
const DWELL_MS = 8000;
let browser;
before(async () => { browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch(); });
after(async () => { await browser?.close(); });

async function openPage(path = '/features', { width = 1440, state } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
    ? route.continue() : route.abort());
  await page.clock.install();
  await page.addInitScript(([key, value]) => {
    localStorage.setItem('measurement-consent-v2', 'denied');
    if (value) localStorage.setItem(key, value);
  }, [KEY, state ? JSON.stringify(state) : null]);
  await page.goto(`${baseURL}${path}`);
  return page;
}

const card = page => page.locator('#newsletter-prompt');
// Scroll to a fraction of the page without reaching the footer form.
const scrollTo = (page, fraction) => page.evaluate(f => {
  window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f);
  window.dispatchEvent(new Event('scroll'));
}, fraction);

test('the card waits for both reading time and scroll depth, and never takes focus', async () => {
  const page = await openPage();
  try {
    assert.equal(await card(page).isVisible(), false);
    await scrollTo(page, 0.5);
    assert.equal(await card(page).isVisible(), false, 'scrolling alone does not show it');
    await page.clock.fastForward(DWELL_MS);
    await card(page).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.activeElement?.closest('#newsletter-prompt')), null);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test('?newsletter-card shows it at once, even after Not now, and remembers nothing', async () => {
  const state = { dismissedAt: Date.now() };
  const page = await openPage('/features?newsletter-card', { state });
  try {
    await card(page).waitFor({ state: 'visible' });
    await card(page).getByRole('button', { name: 'Not now' }).click();
    assert.equal(await card(page).isVisible(), false);
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    assert.deepEqual(saved, state);
  } finally { await page.close(); }
});

test('time alone at the top of a long page does not show the card', async () => {
  const page = await openPage();
  try {
    await page.clock.fastForward(DWELL_MS * 2);
    assert.equal(await card(page).isVisible(), false);
  } finally { await page.close(); }
});

test('Not now hides it and keeps it away on later pages for 60 days', async () => {
  const page = await openPage();
  try {
    await scrollTo(page, 0.5);
    await page.clock.fastForward(DWELL_MS);
    await card(page).getByRole('button', { name: 'Not now' }).click();
    assert.equal(await card(page).isVisible(), false);
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    assert.equal(typeof saved.dismissedAt, 'number');
    await page.goto(`${baseURL}/about`);
    await scrollTo(page, 0.5);
    await page.clock.fastForward(DWELL_MS);
    assert.equal(await card(page).isVisible(), false);
  } finally { await page.close(); }
});

test('an expired snooze invites again; a past request never does', async () => {
  const old = Date.now() - 61 * 24 * 60 * 60 * 1000;
  for (const [state, shows] of [[{ dismissedAt: old }, true], [{ requested: old }, false]]) {
    const page = await openPage('/features', { state });
    try {
      await scrollTo(page, 0.5);
      await page.clock.fastForward(DWELL_MS);
      if (shows) await card(page).waitFor({ state: 'visible' });
      else assert.equal(await card(page).isVisible(), false, JSON.stringify(state));
    } finally { await page.close(); }
  }
});

test('legal, Mail, ambassador, Patron and Teams pages carry no card', async () => {
  const page = await openPage('/privacy');
  try {
    for (const path of ['/privacy', '/terms', '/mail', '/ambassadors', '/patron', '/teams', '/media']) {
      await page.goto(`${baseURL}${path}`);
      assert.equal(await card(page).count(), 0, path);
    }
  } finally { await page.close(); }
});

for (const width of [390, 1440]) {
  test(`subscribing from the card at ${width}px confirms, offers Patron and stops future invitations`, async () => {
    const page = await openPage('/features', { width });
    let body;
    await page.route(endpoint, route => { body = route.request().postDataJSON(); route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
    try {
      await scrollTo(page, 0.5);
      await page.clock.fastForward(DWELL_MS);
      const box = await card(page).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, 'inside the viewport');
      await card(page).getByRole('textbox', { name: /Email address/ }).fill('prompt-test@example.com');
      await card(page).getByRole('button', { name: 'Subscribe' }).click();
      await card(page).getByRole('status').filter({ hasText: 'check your inbox to confirm' }).waitFor();
      assert.deepEqual(body, { email: 'prompt-test@example.com', website: '' });
      assert.equal(await card(page).getByRole('link', { name: 'Become a Patron' }).getAttribute('href'), '/patron');
      assert.equal(await page.locator('#newsletter .foot-news-status').textContent(), '', 'the footer form is untouched');
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
      assert.equal(typeof saved.requested, 'number');
    } finally { await page.close(); }
  });
}

test('a footer request also stops the card', async () => {
  const page = await openPage();
  await page.route(endpoint, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  try {
    const form = page.locator('form[data-newsletter]');
    await form.getByRole('textbox', { name: /Email address/ }).fill('footer@example.com');
    await form.locator('button[type="submit"]').click();
    await form.getByRole('status').filter({ hasText: 'check your inbox' }).waitFor();
    await scrollTo(page, 0.5);
    await page.clock.fastForward(DWELL_MS);
    assert.equal(await card(page).isVisible(), false);
  } finally { await page.close(); }
});
