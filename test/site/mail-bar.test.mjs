// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/mail-bar.test.mjs
//
// The Blanc Mail product bar on /mail and its Privacy and Terms
// (docs/superpowers/specs/2026-10-12-mail-pages-redesign-design.md §3, §12):
// the product's name, which leads back to /mail, and a "Join the waitlist"
// popover. /mail has been one page since October 22, 2026, so the bar lists
// no pages; at 480px and narrower Join shortens on screen but keeps its name.
// The bar sticks under the site header, which stays in view on every page.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const isWebKit = process.env.BLANC_SITE_BROWSER === 'webkit';
const pages = ['/mail', '/mail/privacy', '/mail/terms'];
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

const waitOpen = (page, id, open = true) =>
  page.waitForFunction(([id, open]) => document.getElementById(id).matches(':popover-open') === open, [id, open]);
const scrollDown = async page => {
  await page.mouse.move(page.viewportSize().width / 2, 450);
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 200); await page.waitForTimeout(60); }
  await page.waitForFunction(() => scrollY > 1000);
};

test('every Mail page names the product, leads back to /mail and lists no pages', async () => {
  const { page, context } = await openPage('/mail');
  try {
    for (const path of pages) {
      await page.goto(`${baseURL}${path}`);
      const bar = await page.evaluate(() => {
        const nav = document.querySelector('.mail-bar nav');
        return {
          name: nav.getAttribute('aria-label'),
          title: nav.querySelector('.mail-bar-title').textContent.trim(),
          href: nav.querySelector('.mail-bar-title').getAttribute('href'),
          links: nav.querySelectorAll('a').length,
          popovers: [...document.querySelectorAll('.mail-bar [popover]')].map(pop => pop.id),
        };
      });
      assert.deepEqual(bar, { name: 'Blanc Mail', title: 'Blanc Mail', href: '/mail', links: 1, popovers: ['mail-bar-waitlist'] }, path);
    }
  } finally { await context.close(); }
});

test('the bar is smoked black, with light text and a gold Join button', async () => {
  for (const width of [1440, 390]) {
    const { page, context } = await openPage('/mail/privacy', width);
    try {
      const colors = await page.evaluate(() => {
        const css = selector => getComputedStyle(document.querySelector(selector));
        return {
          bar: css('.mail-bar').backgroundColor,
          title: css('.mail-bar-title').color,
          join: [css('.mail-bar-join').backgroundImage, css('.mail-bar-join').color],
        };
      });
      assert.equal(colors.bar, 'rgba(9, 7, 4, 0.95)', `${width}px: bar`);
      assert.equal(colors.title, 'rgb(242, 233, 218)', `${width}px: title`);
      assert.match(colors.join[0], /^linear-gradient\(rgb\(246, 231, 189\)/, `${width}px: Join is gold`);
      assert.equal(colors.join[1], 'rgb(27, 19, 6)', `${width}px: Join text`);
    } finally { await context.close(); }
  }
});

test('nothing on a Mail page scrolls sideways, from phones to wide screens', async () => {
  for (const width of [320, 390, 800, 1440]) {
    const { page, context } = await openPage('/mail', width);
    try {
      for (const path of pages) {
        await page.goto(`${baseURL}${path}`);
        // Measure the settled page; the next test covers the stand-in font
        // drawn before the web fonts arrive.
        await page.evaluate(() => document.fonts.ready);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(overflow <= 0, `${path} at ${width}px overflows by ${overflow}px`);
      }
    } finally { await context.close(); }
  }
});

test('at 320px the bar fits whichever font draws it', async () => {
  // At 320px the bar's row has no room to spare. Until the web fonts arrive it
  // draws in a stand-in, and where Arial is missing (Linux, so CI) that is a
  // wider sans: Join pushed /mail 12px past the window, which made the header
  // suite fail at random. Verdana is about as wide; CI draws DejaVu Sans.
  for (const font of [null, 'Verdana, "DejaVu Sans", sans-serif']) {
    const { page, context } = await openPage('/mail', 320);
    try {
      for (const path of pages) {
        await page.goto(`${baseURL}${path}`);
        await page.evaluate(() => document.fonts.ready);
        if (font) await page.addStyleTag({ content: `.mail-bar { font-family: ${font} !important; }` });
        const bar = await page.evaluate(() => {
          const inner = document.querySelector('.mail-bar-inner');
          const end = inner.getBoundingClientRect().right - parseFloat(getComputedStyle(inner).paddingRight);
          return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            joinInside: document.querySelector('.mail-bar-join').getBoundingClientRect().right <= end + 0.5,
          };
        });
        const state = `${path} ${font ? 'in a wide stand-in font' : 'settled'}`;
        assert.ok(bar.overflow <= 0, `${state}: overflows by ${bar.overflow}px`);
        assert.equal(bar.joinInside, true, `${state}: Join stays inside the bar's padding`);
      }
    } finally { await context.close(); }
  }
});

test('the bar stays directly under the site header while the page scrolls', async () => {
  const { page, context } = await openPage('/mail/privacy', 1440, { reducedMotion: 'no-preference' });
  try {
    const place = () => page.evaluate(() => {
      const bar = document.querySelector('.mail-bar').getBoundingClientRect();
      const header = document.querySelector('.site-header').getBoundingClientRect();
      return { headerTop: Math.round(header.top), underHeader: Math.round(bar.top - header.bottom) };
    });
    assert.deepEqual(await place(), { headerTop: 0, underHeader: 0 }, 'directly under the header at first');
    await scrollDown(page);
    assert.deepEqual(await place(), { headerTop: 0, underHeader: 0 }, 'still under the header after scrolling down');
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(60); }
    assert.deepEqual(await place(), { headerTop: 0, underHeader: 0 }, 'and after scrolling back up');
  } finally { await context.close(); }
});

test('Join keeps its name, opens the waitlist under the button, and Escape hands focus back', async () => {
  for (const width of [1440, 390, 320]) {
    const { page, context } = await openPage('/mail', width);
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

test('Join pressed after scrolling still opens under the button', async () => {
  const { page, context } = await openPage('/mail/privacy', 1440, { reducedMotion: 'no-preference' });
  try {
    await scrollDown(page);
    await page.locator('.mail-bar-join').click();
    await waitOpen(page, 'mail-bar-waitlist');
    const state = await page.evaluate(() => {
      const pop = document.getElementById('mail-bar-waitlist').getBoundingClientRect();
      const button = document.querySelector('.mail-bar-join').getBoundingClientRect();
      return { top: pop.top, right: pop.right, buttonBottom: button.bottom };
    });
    // 4px of slack: an overloaded engine can still be settling the bar.
    assert.ok(state.top >= state.buttonBottom - 4 && state.top <= state.buttonBottom + 16, `popover at ${state.top}, button ends at ${state.buttonBottom}`);
    assert.ok(state.right <= 1440);
  } finally { await context.close(); }
});

test('focusing a bar control from the keyboard leaves the page where it is', async () => {
  for (const [width, control] of [[1440, '.mail-bar-join'], [390, '.mail-bar-join']]) {
    const { page, context } = await openPage('/mail/privacy', width, { reducedMotion: 'no-preference' });
    try {
      await scrollDown(page);
      const before = await page.evaluate(() => scrollY);
      await page.locator(control).focus();
      await page.waitForTimeout(400);
      const moved = await page.evaluate(start => scrollY - start, before);
      assert.ok(Math.abs(moved) <= 1, `${width}px ${control}: the page moved ${moved}px`);
    } finally { await context.close(); }
  }
});

test('on Mail pages the site header is the same bar as everywhere, with Browser download as a plain link', async () => {
  for (const width of [1440, 800, 760, 390, 320]) {
    const { page, context } = await openPage('/mail', width);
    try {
      const bar = await page.evaluate(() => {
        const cta = getComputedStyle(document.querySelector('.site-nav-cta'));
        return {
          height: Math.round(document.querySelector('.site-header').getBoundingClientRect().height),
          ctaBackground: cta.backgroundColor,
          label: document.querySelector('.site-nav-cta').innerText.trim(),
        };
      });
      assert.equal(bar.height, 52, `${width}px: the 52px white bar, without a hairline`);
      assert.equal(bar.ctaBackground, 'rgba(0, 0, 0, 0)', `${width}px: the Mail bar keeps the one call to action`);
      assert.equal(bar.label, width < 390 ? 'Download' : 'Browser download', `${width}px: label`);
    } finally { await context.close(); }
  }
});

test('without script the waitlist still opens and says how to join', async () => {
  const { page, context } = await openPage('/mail/privacy', 390, { javaScriptEnabled: false });
  try {
    await page.locator('.mail-bar-join').click();
    assert.equal(await page.locator('#bar-waitlist .mail-waitlist-note', { hasText: 'Turn on JavaScript to join the waitlist' }).isVisible(), true);
  } finally { await context.close(); }
});

test('reduced transparency makes the bar solid',
  { skip: isWebKit && 'needs Chromium media-feature emulation' }, async () => {
    const { page, context } = await openPage('/mail', 1440);
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-contrast', value: 'more' }],
      });
      const style = await page.evaluate(() => {
        const bar = getComputedStyle(document.querySelector('.mail-bar'));
        return { background: bar.backgroundColor, blur: bar.backdropFilter };
      });
      assert.equal(style.background, 'rgb(9, 7, 4)');
      assert.equal(style.blur, 'none');
    } finally { await context.close(); }
  });
