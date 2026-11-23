// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/chat-bubble.test.mjs
// The live chat button (components/ChatBubble.astro) is a gold pill labeled
// "Live chat" (owner, November 23, 2026), so it shows on cream pages and over
// the homepage's dark sections alike. It wears the Blanc Mail icon's brushed
// gold (site/public/blanc-mail-icon.webp), light at the top, bronze below.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });

const luminance = rgb => rgb.map(c => {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);

for (const width of [1440, 390]) {
  test(`the chat button is a labeled gold pill at ${width}px`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
      ? route.continue() : route.abort());
    try {
      for (const path of ['/', '/features/island']) {
        await page.goto(`${baseURL}${path}`);
        await page.evaluate(() => document.fonts.ready);
        const bubble = page.locator('[data-live-chat-bubble]');
        assert.equal(await bubble.getAttribute('aria-label'), 'Live chat with a real person', path);
        assert.equal((await bubble.innerText()).trim(), 'Live chat', `${path}: visible label`);
        const style = await bubble.evaluate(el => {
          const s = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return { image: s.backgroundImage, color: s.color, underline: s.textDecorationLine, height: box.height, bottom: innerHeight - box.bottom, left: box.left };
        });
        assert.match(style.image, /^linear-gradient\(rgb\(226, 193, 129\) 0%/, `${path}: Mail icon gold, light at the top`);
        // The label sits across the middle of the pill: every stop from 20% to
        // 80% must keep it at AA contrast.
        const stops = [...style.image.matchAll(/rgb\(([\d, ]+)\) ([\d.]+)%/g)].map(m => ({ color: m[1].split(', ').map(Number), at: Number(m[2]) }));
        assert.ok(stops.length >= 5, `${path}: gradient stops`);
        for (const stop of stops.filter(stop => stop.at >= 20 && stop.at <= 80)) {
          assert.ok(contrast(rgb(style.color), stop.color) >= 4.5, `${path}: label on ${stop.color} at ${stop.at}%`);
        }
        assert.equal(style.underline, 'none', `${path}: no underline`);
        assert.ok(style.height >= 44, `${path}: height ${style.height}`);
        assert.ok(style.left >= 12 && style.bottom >= 12, `${path}: stays in the corner`);
      }
    } finally { await page.close(); }
  });
}

test('the chat button shows a two-tone focus ring that reads on cream and dark', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
    ? route.continue() : route.abort());
  try {
    await page.goto(`${baseURL}/features/island`);
    const bubble = page.locator('[data-live-chat-bubble]');
    await bubble.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const ring = await bubble.evaluate(el => ({ focused: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineStyle, shadow: getComputedStyle(el).boxShadow }));
    assert.equal(ring.focused, true);
    assert.notEqual(ring.outline, 'none');
    assert.match(ring.shadow, /0px 0px 0px \d+px/, 'a solid ring behind the outline');
  } finally { await page.close(); }
});

// Crisp loads only after a click, except for a visitor who has chatted before
// in this browser: Crisp's session cookie is still there, so Crisp loads,
// closed, to show a reply that came after they left.
for (const returning of [false, true]) {
  test(`Crisp ${returning ? 'loads closed for a returning chat visitor' : 'waits for a click from a new visitor'}`, async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/features/island`);
      const websiteId = await page.locator('[data-live-chat-bubble]').getAttribute('data-live-chat');
      if (returning) {
        await context.addCookies([{ name: encodeURIComponent(`crisp-client/session/${websiteId}`), value: 'session_test', url: baseURL }]);
      }
      const crispRequests = [];
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === new URL(baseURL).origin) return route.continue();
        if (url.hostname.endsWith('crisp.chat')) crispRequests.push(url.href);
        return route.abort();
      });
      await page.reload();
      await page.waitForLoadState('networkidle');
      if (returning) {
        assert.deepEqual(crispRequests, ['https://client.crisp.chat/l.js']);
        assert.equal(await page.evaluate(() => window.$crisp.some(cmd => cmd[0] === 'do' && cmd[1] === 'chat:open')), false, 'stays closed');
      } else {
        assert.deepEqual(crispRequests, []);
        assert.equal(await page.evaluate(() => window.$crisp), undefined);
      }
    } finally { await context.close(); }
  });
}
