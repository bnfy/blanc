// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/scroll-motion.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
let browser;
before(async () => { browser = await (process.env.BLANC_SITE_BROWSER === 'webkit' ? webkit : chromium).launch(); });
after(async () => { await browser?.close(); });

async function openPage(path) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
    ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('measurement-consent-v2', 'denied'));
  await page.goto(`${baseURL}${path}`);
  return page;
}

// The scroll-driven motion is written as an `animation` shorthand followed by
// `animation-timeline`. The newest spec lets the shorthand carry the timeline,
// and a minifier with no browser targets folds the two together, but no
// browser accepts that yet: Chrome drops the whole declaration and the
// animation never starts. That shipped with the October 2026 homepage and only
// the unminified dev server showed the motion.
test('no built stylesheet folds a scroll timeline into the animation shorthand', async () => {
  const page = await openPage('/');
  try {
    const sheets = new Set();
    for (const path of ['/', '/mail', '/features']) {
      await page.goto(`${baseURL}${path}`);
      for (const href of await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href))) sheets.add(href);
    }
    assert.ok(sheets.size > 0, 'pages link their stylesheets');
    for (const href of sheets) {
      const css = await (await page.request.get(href)).text();
      const folded = css.match(/animation:[^;}]*(?:view\(|scroll\(|[\s,]--[a-z])[^;}]*/g) || [];
      assert.deepEqual(folded, [], href);
    }
  } finally { await page.close(); }
});

test('the homepage’s scroll-driven motion runs in the built site', async () => {
  const page = await openPage('/');
  try {
    if (!await page.evaluate(() => CSS.supports('animation-timeline', 'view()'))) return;
    const motion = await page.evaluate(() => {
      const scrollDriven = (el, pseudo) => (pseudo ? document.getAnimations().filter(a => a.effect?.target === el && a.effect?.pseudoElement === pseudo) : el.getAnimations())
        .filter(a => a.timeline && !(a.timeline instanceof DocumentTimeline))
        .map(a => a.animationName);
      return {
        // Switching steps for other browsers wait in hidden panels, unrendered.
        rise: [...document.querySelectorAll('.home-cinema .rise')].filter(el => !el.closest('[hidden]')).map(el => scrollDriven(el)),
        wallpapers: ['day', 'dusk', 'night'].map(time => scrollDriven(document.querySelector(`.device-screen .wallpaper-${time}`))),
        tint: scrollDriven(document.querySelector('.device-screen'), '::after'),
      };
    });
    assert.ok(motion.rise.length > 0, 'the homepage has rising sections');
    for (const [index, names] of motion.rise.entries()) assert.deepEqual(names, ['home-rise'], `.rise #${index}`);
    for (const [index, names] of motion.wallpapers.entries()) assert.ok(names.length > 0, `wallpaper ${['day', 'dusk', 'night'][index]} crossfades on scroll`);
    assert.deepEqual(motion.tint, ['screen-tint']);
  } finally { await page.close(); }
});
