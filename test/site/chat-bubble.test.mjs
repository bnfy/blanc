// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/chat-bubble.test.mjs
// The live chat button (components/ChatBubble.astro) is a gold pill labeled
// "Live chat" (owner, November 23, 2026), so it shows on cream pages and over
// the homepage's dark sections alike. It wears the Sunrise mark's gold, lit
// from above like the disc (assets/sunrise-mark.svg, gradient "rim").
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
        assert.match(style.image, /^linear-gradient\(rgb\(255, 241, 179\) 0%/, `${path}: Sunrise gold, pale at the top`);
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
