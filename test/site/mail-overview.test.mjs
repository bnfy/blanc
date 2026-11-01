// BLANC_SITE_URL=http://127.0.0.1:4322 node --test test/site/mail-overview.test.mjs
//
// The Blanc Mail overview (/mail) until launch: one gold envelope on a dark
// stage (docs/superpowers/specs/2026-10-21-mail-gold-envelope-design.md).
// It says what Mail is and that it is coming, lists the features from the
// claims ledger, takes a waitlist address at the top and the end, holds still
// when motion is unwanted, and otherwise leans toward the pointer.
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

test('the overview says what Mail is and that it is coming, with one labelled screenshot', async () => {
  const { page, context } = await openPage('/mail');
  try {
    const soon = await page.evaluate(() => {
      const section = document.querySelector('.mail-soon');
      return {
        eyebrow: section.querySelector('.mail-eyebrow').textContent.trim(),
        title: section.querySelector('h1').textContent.trim(),
        lead: section.querySelector('.mail-soon-lead').textContent.trim(),
        envelopeHidden: section.querySelector('.mail-envelope').getAttribute('aria-hidden'),
        screenshots: [...document.querySelectorAll('img[src*="/mail/screens/"]')].map(img => [img.getAttribute('src'), img.closest('figure.mail-shot')?.querySelector('figcaption')?.textContent.trim()]),
        browser: document.querySelector('.mail-stage-notes a').getAttribute('href'),
      };
    });
    assert.equal(soon.eyebrow, 'Blanc Mail · for Mac · Coming soon');
    assert.equal(soon.title, 'A little less inbox.');
    assert.equal(soon.lead, 'Blanc Mail brings a careful, native Gmail experience to your Mac.');
    assert.equal(soon.envelopeHidden, 'true', 'the envelope is decoration');
    assert.deepEqual(soon.screenshots, [['/mail/screens/rule-editor.webp', 'Preview build']]);
    assert.equal(soon.browser, '/download');
    // The label is hidden on screen but still names the field.
    assert.equal(await page.locator('#waitlist').getByRole('textbox', { name: 'Get an email when Blanc Mail is ready' }).count(), 1);
    assert.equal(await page.locator('#waitlistEmail').getAttribute('aria-describedby'), 'waitlistNote');
    assert.equal(await page.locator('#waitlistNote').isVisible(), true);
  } finally { await context.close(); }
});

test('the features and the careful row list what Mail does, each with a gilt glyph', async () => {
  const { page, context } = await openPage('/mail');
  try {
    const list = await page.evaluate(() => ({
      features: [...document.querySelectorAll('.mail-feature h3')].map(h => h.textContent.trim()),
      glyphs: [...document.querySelectorAll('.mail-feature-badge svg')].map(svg => getComputedStyle(svg).stroke),
      careful: [...document.querySelectorAll('.mail-careful .mail-careful-row h3')].map(h => h.textContent.trim()),
      headings: [...document.querySelectorAll('.mail-stage h2')].map(h => h.textContent.trim()),
      island: [...document.querySelectorAll('.mip-row')].map(row => row.textContent.trim()),
      islandPoints: [...document.querySelectorAll('.mail-island-points h3')].map(h => h.textContent.trim()),
    }));
    assert.deepEqual(list.headings, ['The Island, made for mail.', 'Every account, one calm inbox.', 'Rules that read like sentences', 'Careful in what it sends, generous in what it accepts.', 'A good home for your mail.', 'Support', 'Blanc Mail for Mac.']);
    // The Island figure lists the app's eight commands in its own order and words.
    assert.deepEqual(list.island, ['/snoozeSnooze…', '/set-asideSet Aside', '/labelLabels', '/moveMove To…', '/archiveArchive', '/trashTrash', '/composeNew Message', '/ruleNew Rule…']);
    assert.deepEqual(list.islandPoints, ['Jump anywhere', 'Commands with a slash', 'Actions at hand']);
    assert.deepEqual(list.features, ['Every account together', 'Set Aside', 'A native window', 'Gmail first', 'A moment to change your mind', 'Later, on your terms', 'Ghost Mode', 'Replies you type often', 'Drafts that keep up']);
    assert.deepEqual(list.careful, ['Safe to read', 'No accidental double sends', 'Nothing added to your mail', 'Privacy choices']);
    for (const stroke of list.glyphs) assert.match(stroke, /url\(.*#mail-gilt-stroke.*\)/);
  } finally { await context.close(); }
});

test('Pricing says purchases are not open before any price, and recommends neither plan', async () => {
  const { page, context } = await openPage('/mail');
  try {
    const pricing = await page.evaluate(() => {
      const status = document.querySelector('#pricing .mail-pricing-status');
      const plans = document.querySelector('#pricing .mail-plans');
      return {
        text: status.textContent.trim(),
        first: Boolean(status.compareDocumentPosition(plans) & Node.DOCUMENT_POSITION_FOLLOWING),
        plans: [...plans.querySelectorAll('.mail-plan h3')].map(h => h.textContent.trim()),
        prices: [...plans.querySelectorAll('.mail-plan-price')].map(p => p.innerText.replace(/\s+/g, ' ').trim()),
        tabular: [...plans.querySelectorAll('.mail-plan-price')].every(p => getComputedStyle(p).fontVariantNumeric.includes('tabular-nums')),
        badge: /recommended|best value|most popular/i.test(plans.textContent),
        checkout: plans.querySelectorAll('a').length,
      };
    });
    assert.match(pricing.text, /^Purchases are not open yet\./);
    assert.ok(pricing.first, 'the status comes before the plans');
    assert.deepEqual(pricing.plans, ['Blanc Mail', 'Blanc Suite']);
    assert.deepEqual(pricing.prices, ['$4.99 / month or $49.99 / year', '$7 / month or $70 / year']);
    assert.ok(pricing.tabular, 'prices use tabular figures');
    assert.equal(pricing.badge, false);
    assert.equal(pricing.checkout, 0, 'no checkout until it opens');
  } finally { await context.close(); }
});

test('Support gives its address, then three topics; Download closes with the waitlist and requirements', async () => {
  const { page, context } = await openPage('/mail');
  try {
    const end = await page.evaluate(() => ({
      address: document.querySelector('#support .mail-section-lead a[href^="mailto:"]').getAttribute('href'),
      topics: [...document.querySelectorAll('#support .mail-support-row h3')].map(h => h.textContent.trim()),
      order: [...document.querySelectorAll('.mail-stage > section[id]')].map(section => section.id).slice(-3),
      form: document.querySelector('#download form[data-mail-waitlist]')?.id,
      requirements: document.querySelector('#download .mail-requirements').textContent.trim(),
      legal: [...document.querySelectorAll('.mail-stage-notes a')].map(a => a.getAttribute('href')),
    }));
    assert.equal(end.address, 'mailto:support@blanc.day');
    assert.deepEqual(end.topics, ['Accounts and data', 'Uninstalling', 'Updates and licensing']);
    assert.deepEqual(end.order, ['pricing', 'support', 'download']);
    assert.equal(end.form, 'closing-waitlist');
    assert.match(end.requirements, /^macOS 14 or later on an Apple Silicon or Intel Mac, plus a Google account\./);
    assert.deepEqual(end.legal, ['/download', '/mail/privacy', '/mail/terms']);
  } finally { await context.close(); }
});

test('a link to a section lands with its heading below the bars', async () => {
  for (const id of ['pricing', 'support', 'download']) {
    const { page, context } = await openPage(`/mail#${id}`);
    try {
      await page.waitForTimeout(300);
      const gap = await page.evaluate(id => document.getElementById(id).getBoundingClientRect().top - document.querySelector('.mail-bar').getBoundingClientRect().bottom, id);
      assert.ok(gap >= 0 && gap <= 60, `#${id} starts ${gap}px below the bar`);
    } finally { await context.close(); }
  }
});

test('the envelope holds still under reduced motion, and otherwise leans toward the pointer', async () => {
  // Whether the envelope is rotated at all: the perspective alone leaves the
  // matrix's rotation terms at zero.
  const leaning = page => page.evaluate(() => {
    const { m13, m23, m31, m32 } = new DOMMatrix(getComputedStyle(document.querySelector('.mail-envelope')).transform);
    return [m13, m23, m31, m32].some(v => Math.abs(v) > 1e-4);
  });

  const reduced = await openPage('/mail');
  try {
    await reduced.page.mouse.move(40, 200);
    await reduced.page.waitForTimeout(400);
    assert.equal(await leaning(reduced.page), false, 'no lean');
    assert.equal(await reduced.page.evaluate(() => document.querySelector('.mail-soon').getAnimations({ subtree: true }).length), 0, 'nothing animates');
  } finally { await reduced.context.close(); }

  const full = await openPage('/mail', 1440, { reducedMotion: 'no-preference' });
  try {
    await full.page.mouse.move(40, 200);
    await full.page.waitForFunction(() => getComputedStyle(document.querySelector('.mail-envelope')).getPropertyValue('--mx').trim() !== '0.5');
    await full.page.waitForTimeout(1000);
    assert.equal(await leaning(full.page), true, 'it leans');
    await full.page.mouse.move(720, 450);
    await full.page.mouse.move(-1, 450);
    await full.page.evaluate(() => document.documentElement.dispatchEvent(new PointerEvent('pointerleave')));
    await full.page.waitForTimeout(1100);
    assert.equal(await leaning(full.page), false, 'and settles when the pointer leaves');
  } finally { await full.context.close(); }
});

test('on a phone the waitlist stacks with a full-height field', async () => {
  const { page, context } = await openPage('/mail', 390, { viewport: { width: 390, height: 844 } });
  try {
    const m = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      return { field: box('#waitlistEmail').height, button: box('#waitlist button[type=submit]'), fieldBottom: box('#waitlistEmail').bottom };
    });
    assert.ok(m.field >= 40, `the field is ${m.field}px tall`);
    assert.ok(m.button.top >= m.fieldBottom, 'the button sits below the field');
  } finally { await context.close(); }
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
    const { page, context } = await openPage('/mail');
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
  const { page, context } = await openPage('/mail');
  try {
    await openBarWaitlist(page);
    await page.keyboard.type('reader@example.com');
    await page.keyboard.press('Enter');
    await page.locator('#bar-waitlist .mail-waitlist-status', { hasText: 'We couldn’t add you just now. Please try again later.' }).waitFor();
    assert.equal(await page.evaluate(() => document.getElementById('mail-bar-waitlist').matches(':popover-open')), true);
  } finally { await context.close(); }
});
