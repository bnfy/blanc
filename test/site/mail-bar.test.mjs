// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/mail-bar.test.mjs
//
// The Blanc Mail product bar on all six Mail pages
// (docs/superpowers/specs/2026-10-12-mail-pages-redesign-design.md §3, §12):
// the product's name, its six pages with the current one marked, and a "Join
// the waitlist" popover. At 880px and narrower the links fold into a page
// menu; at 480px and narrower Join shortens on screen but keeps its name.
// The bar sticks under the site header and rises with it when it tucks away.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const isWebKit = process.env.BLANC_SITE_BROWSER === 'webkit';
const pages = [
  ['/mail', 'Overview'], ['/mail/pricing', 'Pricing'], ['/mail/download', 'Download'],
  ['/mail/support', 'Support'], ['/mail/privacy', 'Privacy'], ['/mail/terms', 'Terms'],
];
let browser;
before(async () => { browser = await (isWebKit ? webkit : chromium).launch(); });
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

const isOpen = (page, id) => page.evaluate(id => document.getElementById(id).matches(':popover-open'), id);
const waitOpen = (page, id, open = true) =>
  page.waitForFunction(([id, open]) => document.getElementById(id).matches(':popover-open') === open, [id, open]);
const tuckHeaderAway = async page => {
  await page.mouse.move(700, 450);
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(60); }
  await page.waitForFunction(() => document.querySelector('.site-header').classList.contains('is-scroll-hidden'));
  await page.waitForTimeout(400); // the bar's 220ms slide
};

test('every Mail page names the product, lists its six pages and marks the current one', async () => {
  const { page, context } = await openPage('/mail');
  try {
    for (const [path, label] of pages) {
      await page.goto(`${baseURL}${path}`);
      const bar = await page.evaluate(() => {
        const nav = document.querySelector('.mail-bar nav');
        return {
          name: nav.getAttribute('aria-label'),
          title: nav.querySelector('.mail-bar-title').textContent.trim(),
          links: [...nav.querySelectorAll('.mail-bar-links a')].map(a => [a.getAttribute('href'), a.textContent.trim()]),
          current: [...nav.querySelectorAll('.mail-bar-links a[aria-current="page"]')].map(a => a.textContent.trim()),
        };
      });
      assert.equal(bar.name, 'Blanc Mail', path);
      assert.equal(bar.title, 'Blanc Mail', path);
      assert.deepEqual(bar.links, pages, path);
      assert.deepEqual(bar.current, [label], path);
    }
  } finally { await context.close(); }
});

test('nothing on a Mail page scrolls sideways, from phones to wide screens', async () => {
  for (const width of [320, 390, 800, 1440]) {
    const { page, context } = await openPage('/mail', width);
    try {
      for (const [path] of pages) {
        await page.goto(`${baseURL}${path}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(overflow <= 0, `${path} at ${width}px overflows by ${overflow}px`);
      }
    } finally { await context.close(); }
  }
});

test('the bar sits under the site header and rises with it when the header tucks away', async () => {
  const { page, context } = await openPage('/mail/privacy', 1440, { reducedMotion: 'no-preference' });
  try {
    const place = () => page.evaluate(() => {
      const bar = document.querySelector('.mail-bar').getBoundingClientRect();
      const header = document.querySelector('.site-header').getBoundingClientRect();
      return { top: Math.round(bar.top), underHeader: Math.round(bar.top - header.bottom) };
    });
    assert.equal((await place()).underHeader, 0, 'directly under the header at first');
    await tuckHeaderAway(page);
    assert.equal((await place()).top, 0, 'the bar takes the top edge while the header is away');
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(60); }
    await page.waitForFunction(() => !document.querySelector('.site-header').classList.contains('is-scroll-hidden'));
    await page.waitForTimeout(400);
    assert.equal((await place()).underHeader, 0, 'back under the header');
  } finally { await context.close(); }
});

test('Join keeps its name, opens the waitlist under the button, and Escape hands focus back', async () => {
  for (const width of [1440, 390, 320]) {
    const { page, context } = await openPage('/mail/pricing', width);
    try {
      const join = page.getByRole('navigation', { name: 'Blanc Mail' }).getByRole('button', { name: 'Join the waitlist', exact: true });
      assert.equal(await join.count(), 1, `${width}px: Join keeps its full accessible name`);
      // From the keyboard: focus returns to the button that had it, and Safari
      // never focuses a button on click, so a click would test nothing there.
      await join.focus();
      await page.keyboard.press('Enter');
      await waitOpen(page, 'mail-bar-waitlist');
      // The popover's toggle event, which moves focus, is dispatched as a
      // task after it opens, so wait for focus rather than read it at once.
      await page.waitForFunction(() => document.activeElement?.id === 'bar-waitlistEmail', null, { timeout: 2000 })
        .catch(() => {});
      const state = await page.evaluate(() => {
        const pop = document.getElementById('mail-bar-waitlist').getBoundingClientRect();
        const button = document.querySelector('.mail-bar-join').getBoundingClientRect();
        return { focused: document.activeElement?.id, left: pop.left, right: pop.right, top: pop.top, buttonBottom: button.bottom };
      });
      assert.equal(state.focused, 'bar-waitlistEmail', `${width}px: focus moves to the email field`);
      assert.ok(state.left >= 0 && state.right <= width, `${width}px: inside the viewport`);
      assert.ok(state.top >= state.buttonBottom && state.top <= state.buttonBottom + 16, `${width}px: just under the button`);
      await page.keyboard.press('Escape');
      await waitOpen(page, 'mail-bar-waitlist', false);
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('mail-bar-join')), true, `${width}px: focus back on Join`);
    } finally { await context.close(); }
  }
});

test('at 880px and narrower the six links fold into a page menu', async () => {
  for (const width of [800, 390]) {
    const { page, context } = await openPage('/mail/download', width);
    try {
      assert.equal(await page.locator('.mail-bar-links').isVisible(), false, `${width}px: links folded away`);
      const button = page.locator('.mail-bar-pages');
      assert.equal((await button.textContent()).trim(), 'Download', `${width}px: the button names the page`);
      await button.focus();
      await page.keyboard.press('Enter');
      await waitOpen(page, 'mail-bar-menu');
      const menu = await page.evaluate(() => {
        const pop = document.getElementById('mail-bar-menu');
        const rect = pop.getBoundingClientRect();
        return {
          links: [...pop.querySelectorAll('a')].map(a => [a.getAttribute('href'), a.textContent.trim()]),
          current: pop.querySelector('[aria-current="page"]')?.textContent.trim(),
          inside: rect.left >= 0 && rect.right <= innerWidth,
        };
      });
      assert.deepEqual(menu.links, pages);
      assert.equal(menu.current, 'Download');
      assert.ok(menu.inside, `${width}px: inside the viewport`);
      await page.keyboard.press('Escape');
      await waitOpen(page, 'mail-bar-menu', false);
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('mail-bar-pages')), true);
    } finally { await context.close(); }
  }
  const wide = await openPage('/mail/download', 1440);
  try {
    assert.equal(await wide.page.locator('.mail-bar-pages').isVisible(), false, '1440px: no menu button');
  } finally { await wide.context.close(); }
});

test('Join pressed after the header has tucked away still opens under the button', async () => {
  const { page, context } = await openPage('/mail/privacy', 1440, { reducedMotion: 'no-preference' });
  try {
    await tuckHeaderAway(page);
    await page.locator('.mail-bar-join').click();
    await waitOpen(page, 'mail-bar-waitlist');
    const state = await page.evaluate(() => {
      const pop = document.getElementById('mail-bar-waitlist').getBoundingClientRect();
      const button = document.querySelector('.mail-bar-join').getBoundingClientRect();
      return { top: pop.top, right: pop.right, buttonBottom: button.bottom };
    });
    assert.ok(state.top >= state.buttonBottom && state.top <= state.buttonBottom + 16, `popover at ${state.top}, button ends at ${state.buttonBottom}`);
    assert.ok(state.right <= 1440);
  } finally { await context.close(); }
});

test('only one bar popover is ever open', async () => {
  const { page, context } = await openPage('/mail/support', 390);
  try {
    await page.locator('.mail-bar-join').click();
    await waitOpen(page, 'mail-bar-waitlist');
    await page.locator('.mail-bar-pages').click();
    await waitOpen(page, 'mail-bar-menu');
    assert.equal(await isOpen(page, 'mail-bar-waitlist'), false);
  } finally { await context.close(); }
});

test('without script the page menu and the waitlist still open, and the waitlist says how to join', async () => {
  const { page, context } = await openPage('/mail/support', 390, { javaScriptEnabled: false });
  try {
    await page.locator('.mail-bar-pages').click();
    assert.equal(await page.locator('#mail-bar-menu').isVisible(), true);
    await page.keyboard.press('Escape');
    await page.locator('.mail-bar-join').click();
    assert.equal(await page.locator('#bar-waitlist .mail-waitlist-note', { hasText: 'Turn on JavaScript to join the waitlist' }).isVisible(), true);
  } finally { await context.close(); }
});

test('reduced transparency makes the bar solid, and more contrast darkens its links',
  { skip: isWebKit && 'needs Chromium media-feature emulation' }, async () => {
    const { page, context } = await openPage('/mail', 1440);
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-contrast', value: 'more' }],
      });
      await page.waitForTimeout(400); // the links' 160ms color transition
      const style = await page.evaluate(() => {
        const bar = getComputedStyle(document.querySelector('.mail-bar'));
        const link = getComputedStyle(document.querySelector('.mail-bar-links a:not([aria-current])'));
        return { background: bar.backgroundColor, blur: bar.backdropFilter, link: link.color };
      });
      assert.equal(style.background, 'rgb(248, 242, 232)');
      assert.equal(style.blur, 'none');
      assert.equal(style.link, 'rgb(43, 37, 29)');
    } finally { await context.close(); }
  });
