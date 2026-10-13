// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/mail-overview.test.mjs
//
// The Blanc Mail overview (/mail) after the redesign
// (docs/superpowers/specs/2026-10-12-mail-pages-redesign-design.md §4, §11, §12):
// real screenshots, always labelled as a preview; a Dawn/Night switch and a
// light/dark compare that work from the keyboard and without script;
// vignettes that move only when asked; and three separate waitlist forms.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.BLANC_SITE_URL || 'http://127.0.0.1:4322';
const WAITLIST = readFileSync(new URL('../../site/src/components/MailWaitlistForm.astro', import.meta.url), 'utf8')
  .match(/WAITLIST_ENDPOINT = '([^']+)'/)[1];
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

// Stands in for the waitlist Worker. Registered after openPage's catch-all,
// so it runs first (Playwright runs routes in reverse order of registration).
async function answerWaitlist(page, status) {
  await page.route(WAITLIST, route => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: '{}' });
  });
}

// Opens the bar's waitlist and waits for its email field to take focus,
// which happens in the popover's toggle event, a task after it opens.
async function openBarWaitlist(page) {
  await page.locator('.mail-bar-join').click();
  await page.waitForFunction(() => document.getElementById('mail-bar-waitlist').matches(':popover-open'));
  await page.waitForFunction(() => document.activeElement?.id === 'bar-waitlistEmail');
}

test('every screenshot is a labelled preview with alt text, and it loads', async () => {
  const { page, context } = await openPage('/mail');
  try {
    const shots = await page.evaluate(async () => {
      const images = [...document.querySelectorAll('img')].filter(img => img.getAttribute('src')?.startsWith('/mail/screens/'));
      images.forEach(img => { img.loading = 'eager'; });
      await Promise.all(images.map(img => img.decode().catch(() => null)));
      return images.map(img => ({
        src: img.getAttribute('src'),
        loaded: img.complete && img.naturalWidth > 0,
        alt: img.alt.trim().length > 0,
        caption: img.closest('figure.mail-shot')?.querySelector('figcaption')?.textContent.trim(),
      }));
    });
    assert.equal(shots.length, 7);
    for (const shot of shots) {
      assert.ok(shot.loaded, `${shot.src} loads`);
      assert.ok(shot.alt, `${shot.src} has alt text`);
      assert.equal(shot.caption, 'Preview build', shot.src);
    }
  } finally { await context.close(); }
});

test('the hero is short: no status pill, one sentence, and the privacy note while typing', async () => {
  const { page, context } = await openPage('/mail');
  try {
    const hero = await page.evaluate(() => {
      const section = document.querySelector('.mail-home-hero');
      const label = section.querySelector('.mail-waitlist-label');
      return {
        pill: section.querySelector('.mail-home-badge') !== null || /Coming soon/.test(section.textContent),
        lead: section.querySelector('.mail-lead').textContent.trim(),
        label: label.getBoundingClientRect().height > 1 ? label.textContent.trim() : null,
      };
    });
    assert.equal(hero.pill, false);
    assert.equal(hero.lead, 'Blanc Mail brings a careful, native Gmail experience to your Mac.');
    // With the pill gone, the visible label is what says Mail is not out yet.
    assert.equal(hero.label, 'Get an email when Blanc Mail is ready');
    const note = page.locator('#waitlistNote');
    assert.equal(await note.isVisible(), false, 'the note waits for the field');
    await page.locator('#waitlistEmail').focus();
    assert.equal(await note.isVisible(), true, 'and appears while the address is typed');
    assert.equal(await page.locator('#waitlistEmail').getAttribute('aria-describedby'), 'waitlistNote');
    assert.match(await note.textContent(), /We’ll ask you to confirm by email/);
    assert.equal(await page.locator('#closing-waitlistNote').isVisible(), true, 'other forms keep their note');
  } finally { await context.close(); }
});

test('on a phone the hero leaves room for the window: a smaller icon and the field beside its button', async () => {
  const { page, context } = await openPage('/mail', 390, { viewport: { width: 390, height: 844 } });
  try {
    const m = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const field = box('#waitlistEmail');
      const button = box('#waitlist button[type=submit]');
      return {
        icon: box('.mail-home-hero .mail-home-icon').width,
        offset: Math.abs(field.top + field.height / 2 - (button.top + button.height / 2)),
        shot: box('.mail-hero-shot').top,
      };
    });
    assert.ok(m.icon <= 80, `icon is ${m.icon}px`);
    assert.ok(m.offset <= 4, `field and button ${m.offset}px apart vertically`);
    assert.ok(m.shot <= 620, `the window starts at ${m.shot}px`);
  } finally { await context.close(); }
});

test('Dawn and Night switch the Inbox Zero picture, from the keyboard and without script', async () => {
  for (const javaScriptEnabled of [true, false]) {
    const { page, context } = await openPage('/mail', 1440, { javaScriptEnabled });
    try {
      const night = () => page.evaluate(() => getComputedStyle(document.querySelector('.mail-zero-night')).opacity);
      assert.equal(await page.getByRole('group', { name: 'Wallpaper' }).count(), 1, 'a named group');
      await page.waitForTimeout(600); // let any first-paint cross-fade settle
      assert.equal(await night(), '0');
      const dawn = page.getByRole('radio', { name: 'Dawn' });
      assert.equal(await dawn.isChecked(), true);
      await dawn.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.getByRole('radio', { name: 'Night' }).isChecked(), true);
      // A fixed wait, not waitForFunction: its in-page polling needs script.
      await page.waitForTimeout(600); // the 420ms cross-fade
      assert.equal(await night(), '1');
    } finally { await context.close(); }
  }
});

test('the light and dark compare follows the arrow keys, and shows half of each without script', async () => {
  const { page, context } = await openPage('/mail');
  try {
    const split = () => page.evaluate(() => {
      const compare = document.querySelector('[data-mail-compare]').getBoundingClientRect();
      return {
        value: document.querySelector('.mail-compare-range').value,
        clip: getComputedStyle(document.querySelector('.mail-compare-dark img')).clipPath,
        handle: document.querySelector('.mail-compare-handle').getBoundingClientRect().left + 1 - compare.left,
        width: compare.width,
      };
    });
    assert.equal((await split()).clip, 'inset(0px 0px 0px 50%)');
    await page.getByRole('slider', { name: 'Compare the light and dark appearance' }).focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    const moved = await split();
    assert.equal(moved.value, '60');
    assert.equal(moved.clip, 'inset(0px 0px 0px 60%)');
    assert.ok(Math.abs(moved.handle - moved.width * 0.6) <= 2, 'the divider sits where the dark window starts');
  } finally { await context.close(); }
  const still = await openPage('/mail', 1440, { javaScriptEnabled: false });
  try {
    assert.equal(await still.page.evaluate(() => getComputedStyle(document.querySelector('.mail-compare-dark img')).clipPath), 'inset(0px 0px 0px 50%)');
  } finally { await still.context.close(); }
});

test('vignettes hold still under reduced motion, and otherwise play once and settle', async () => {
  const tileOf = page => page.locator('[data-mail-bento] .mail-bento-tile:has(.mail-vignette)').first();
  const moving = tile => tile.evaluate(el => el.classList.contains('is-playing') || el.querySelector('.mail-vignette').getAnimations({ subtree: true }).length > 0);

  const reduced = await openPage('/mail');
  try {
    const tile = tileOf(reduced.page);
    await tile.scrollIntoViewIfNeeded();
    await tile.hover();
    await reduced.page.waitForTimeout(400);
    assert.equal(await moving(tile), false, 'nothing moves under reduced motion');
  } finally { await reduced.context.close(); }

  const full = await openPage('/mail', 1440, { reducedMotion: 'no-preference' });
  try {
    const tile = tileOf(full.page);
    await tile.scrollIntoViewIfNeeded();
    await tile.hover();
    const handle = await tile.elementHandle();
    await full.page.waitForFunction(el => el.classList.contains('is-playing'), handle);
    await full.page.waitForFunction(el => !el.classList.contains('is-playing'), handle, { timeout: 8000 });
    assert.equal(await moving(tile), false, 'it settles on its still frame');
  } finally { await full.context.close(); }
});

test('the bar, hero and closing waitlists are separate, and the bar keeps its answer in view', async () => {
  const { page, context } = await openPage('/mail');
  try {
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('form[data-mail-waitlist]')].map(f => f.id)), ['bar-waitlist', 'waitlist', 'closing-waitlist']);
    await answerWaitlist(page, 200);
    await openBarWaitlist(page);
    await page.keyboard.type('reader@example.com');
    await page.keyboard.press('Enter');
    await page.locator('#bar-waitlist .mail-waitlist-status', { hasText: 'Check your inbox to confirm your place.' }).waitFor();
    assert.equal(await page.evaluate(() => document.getElementById('mail-bar-waitlist').matches(':popover-open')), true, 'the answer stays in view');
    assert.equal(await page.locator('#waitlist .mail-waitlist-status').textContent(), '', 'the hero form is untouched');
  } finally { await context.close(); }
});

test('a waitlist error shows inside the open bar popover', async () => {
  for (const [status, message] of [
    [400, 'That address didn’t look right. Please check it and try again.'],
    [503, 'We couldn’t add you just now. Please try again later.'],
  ]) {
    const { page, context } = await openPage('/mail/pricing');
    try {
      await answerWaitlist(page, status);
      await openBarWaitlist(page);
      await page.keyboard.type('reader@example.com');
      await page.keyboard.press('Enter');
      await page.locator('#bar-waitlist .mail-waitlist-status', { hasText: message }).waitFor();
      assert.equal(await page.evaluate(() => document.getElementById('mail-bar-waitlist').matches(':popover-open')), true, `${status}: still open`);
      assert.equal(await page.locator('#bar-waitlist button[type=submit]').isEnabled(), true, `${status}: can try again`);
    } finally { await context.close(); }
  }
  // No answer at all (the catch-all aborts the request).
  const { page, context } = await openPage('/mail/pricing');
  try {
    await openBarWaitlist(page);
    await page.keyboard.type('reader@example.com');
    await page.keyboard.press('Enter');
    await page.locator('#bar-waitlist .mail-waitlist-status', { hasText: 'We couldn’t add you just now. Please try again later.' }).waitFor();
    assert.equal(await page.evaluate(() => document.getElementById('mail-bar-waitlist').matches(':popover-open')), true);
  } finally { await context.close(); }
});
