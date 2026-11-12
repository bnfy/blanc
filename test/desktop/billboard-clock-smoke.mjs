// The Billboard clock's Font & color, end to end in the real app: open it from
// Customize, change the face, weight, height, color, tone and style, see each drawn
// on the clock, and find every choice saved (and stamped for Profile Sync).
// BLANC_CLOCK_CAPTURES=<dir> also saves screenshots for review.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import poll from './support/poll.js';
const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-billboard-clock-'));
const profile = path.join(root, 'profile');
const userData = `${profile}-Dev`;
fs.mkdirSync(userData);
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1,
  adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
const uncaught = path.join(root, 'uncaught.log');
const captures = process.env.BLANC_CLOCK_CAPTURES;
const settingsFile = () => JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));
const capture = async (page, name) => {
  if (!captures) return;
  fs.mkdirSync(captures, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(captures, `${name}.png`) });
};
let app;
try {
  app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${profile}`], env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaught } });
  const page = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/'), Boolean, 'new tab');
  await page.waitForLoadState('domcontentloaded');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForFunction(() => document.body.dataset.layout === 'billboard' && document.getElementById('bbClock').dataset.font);
  const clock = () => page.evaluate(() => {
    const element = document.getElementById('bbClock');
    const style = getComputedStyle(element);
    return {
      font: element.dataset.font,
      style: element.dataset.style,
      family: style.fontFamily,
      weight: style.fontWeight,
      color: style.color,
    };
  });

  // The defaults draw the clock as it was.
  const before = await clock();
  assert.equal(before.font, 'instrument');
  assert.equal(before.style, 'solid');
  assert.match(before.family, /^"Instrument Sans"/);
  assert.equal(before.weight, '500');
  await capture(page, '1-default');

  // Customize offers the clock only while Billboard is the layout.
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  const open = page.getByRole('button', { name: 'Clock font & color…', exact: true });
  await open.waitFor();
  await page.locator('[data-layout-pick="ledger"]').click();
  await page.waitForFunction(() => !document.getElementById('clockStyleOpen').checkVisibility());
  await page.locator('[data-layout-pick="billboard"]').click();
  // Customize's Clock row samples the clock and says what it is set to.
  assert.equal(await page.locator('#clockStyleSummary').textContent(), 'Instrument Sans · Solid');
  assert.equal(await page.locator('#clockStyleSample').getAttribute('data-font'), 'instrument');
  await capture(page, '2a-customize');
  await open.click();
  await page.waitForFunction(() => document.getElementById('clockPopover').matches(':popover-open')
    && !document.getElementById('customizePopover').matches(':popover-open'));
  // The sheet hangs below the clock, or beside it where there is no room
  // below or above: never over it. Measured once it has settled.
  await page.waitForTimeout(400);
  const [clockBox, popoverBox] = await Promise.all([page.locator('#bbClock').boundingBox(), page.locator('#clockPopover').boundingBox()]);
  const apart = popoverBox.y >= clockBox.y + clockBox.height || popoverBox.y + popoverBox.height <= clockBox.y
    || popoverBox.x >= clockBox.x + clockBox.width || popoverBox.x + popoverBox.width <= clockBox.x;
  assert.ok(apart, `the sheet never covers the clock (${JSON.stringify({ clockBox, popoverBox })})`);
  // Opened with the pointer, focus rests on the sheet itself (no ring shows);
  // opened from the keyboard, it lands on the chosen font.
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'clockPopover');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('clockPopover').matches(':popover-open'));
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await open.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('clockPopover').matches(':popover-open'));
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.clockFontPick), 'instrument');
  await capture(page, '2-popover');

  // Face and weight.
  await page.getByRole('button', { name: 'Inter', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('bbClock').dataset.font === 'inter');
  assert.match((await clock()).family, /^Inter/);
  assert.equal(await page.locator('#clockWeight').getAttribute('min'), '100');
  await page.locator('#clockWeight').fill('200');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('bbClock')).fontWeight === '200');
  await waitForValue(async () => settingsFile(), (s) => s.newtabClockFont === 'inter' && s.newtabClockWeight === 200, 'saved face and weight');
  // A narrower face draws the weight inside its range and keeps the choice.
  await page.getByRole('button', { name: 'Instrument Sans Condensed', exact: true }).click();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('bbClock')).fontWeight === '400');
  assert.equal(settingsFile().newtabClockWeight, 200);
  assert.equal(await page.locator('#clockWeight').inputValue(), '400');
  await capture(page, '3-condensed');

  // A drag let go where it started sends no change; the next choice still
  // draws (the drag must not stay open).
  await page.evaluate(() => {
    const slider = document.getElementById('clockWeight');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await page.waitForTimeout(50);

  // Color and tone. Auto hides the tone.
  assert.equal(await page.locator('#clockToneLine').isHidden(), true);
  await page.getByRole('button', { name: 'Sky', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('bbClock').hasAttribute('data-ink'));
  assert.equal((await clock()).color, 'rgb(55, 102, 148)');
  assert.equal(await page.locator('#clockToneLine').isVisible(), true);
  await page.locator('#clockTone').fill('85');
  await waitForValue(async () => settingsFile(), (s) => s.newtabClockColor === 'sky' && s.newtabClockTone === 85, 'saved color and tone');
  const toned = (await clock()).color;
  assert.notEqual(toned, 'rgb(55, 102, 148)');
  await capture(page, '4-sky-light');

  // Height: only a face with room on its width axis offers it. The clock
  // stays typeset text, larger, narrower and lighter.
  const art = () => page.evaluate(() => {
    const row = document.querySelector('.bb-clock-row');
    const clockText = document.getElementById('bbClock');
    const element = document.getElementById('bbClockArt');
    const lens = getComputedStyle(document.getElementById('bbClockLens'));
    const style = getComputedStyle(clockText);
    return {
      drawn: row.hasAttribute('data-drawn'),
      hidden: element.hidden,
      textHeight: clockText.getBoundingClientRect().height,
      textWidth: clockText.getBoundingClientRect().width,
      fontSize: parseFloat(style.fontSize),
      variation: style.fontVariationSettings,
      weight: Number(style.fontWeight),
      text: clockText.textContent,
      lensHidden: document.getElementById('bbClockLens').hidden,
      backdrop: lens.backdropFilter,
      mask: lens.maskImage,
      map: document.getElementById('bbClockRefractMap').getAttribute('href') ?? '',
    };
  });
  assert.equal(await page.locator('#clockHeightLine').isHidden(), true, 'the condensed cut cannot stand taller');
  await page.getByRole('button', { name: 'Roboto Flex', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('bbClock').dataset.font === 'flex'
    && !document.getElementById('clockHeightLine').hidden);
  assert.equal(await page.locator('#clockHeight').getAttribute('max'), '300');
  const flat = await art();
  assert.equal(flat.drawn, false, 'Solid stays typeset');
  await page.locator('#clockHeight').fill('200');
  await waitForValue(async () => settingsFile(), (s) => s.newtabClockHeight === 200, 'saved height');
  await page.waitForFunction((size) => parseFloat(getComputedStyle(document.getElementById('bbClock')).fontSize) > size * 1.9, flat.fontSize);
  const tall = await art();
  assert.equal(tall.drawn, false, 'a taller Solid clock is still text');
  assert.match(tall.text, /^\d{1,2}:\d{2}$/);
  const wdth = Number(tall.variation.match(/"wdth" ([\d.]+)/)?.[1]);
  assert.ok(wdth < 60, `drawn narrower (wdth ${tall.variation})`);
  assert.ok(tall.weight < flat.weight, `and lighter (${tall.weight} after ${flat.weight})`);
  assert.ok(Math.abs(tall.textWidth - flat.textWidth) < flat.textWidth * 0.12, `keeping its width (${tall.textWidth} vs ${flat.textWidth})`);
  await capture(page, '5-tall');

  // Glass bends the page behind the figures through the refraction filter.
  await page.getByRole('button', { name: 'Glass', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.bb-clock-row').hasAttribute('data-drawn'));
  const glass = await art();
  assert.equal(glass.hidden, false);
  assert.equal(glass.lensHidden, false);
  assert.match(glass.backdrop, /url\("?#bbClockRefract"?\)/);
  assert.match(glass.mask, /^url\("data:image\/png/);
  assert.match(glass.map, /^data:image\/png/);
  await capture(page, '6-glass-tall-sky');
  await page.locator('#clockHeight').fill('100');
  await waitForValue(async () => settingsFile(), (s) => s.newtabClockHeight === 100, 'saved height back');
  await page.waitForFunction(() => !document.getElementById('bbClock').style.fontSize);
  await page.getByRole('button', { name: 'Automatic', exact: true }).click();
  await page.getByRole('button', { name: 'Inter', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('bbClock').hasAttribute('data-ink')
    && document.getElementById('bbClock').dataset.font === 'inter');
  // Glass at full height is still drawn.
  assert.equal((await art()).drawn, true);
  await capture(page, '7-glass-auto-inter');

  // Every choice is stamped for Profile Sync, and unknown values are refused.
  const keys = ['newtabClockFont', 'newtabClockWeight', 'newtabClockColor', 'newtabClockTone', 'newtabClockStyle', 'newtabClockHeight'];
  await waitForValue(async () => settingsFile(),
    (saved) => saved.newtabClockStyle === 'glass' && saved.newtabClockColor === 'auto' && saved.newtabClockFont === 'inter'
      && keys.every((key) => saved._syncMeta?.[key] > 0),
    'every choice saved and stamped for sync');
  const refused = await page.evaluate(() => window.bowserPages.start.setClock({ font: 'comic', weight: 1100, color: '#ff0000', style: 'chrome' }));
  assert.deepEqual({ font: refused.font, weight: refused.weight, color: refused.color, style: refused.style },
    { font: 'inter', weight: 200, color: 'auto', style: 'glass' });

  // Right-clicking the clock opens the sheet directly.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('clockPopover').matches(':popover-open'));
  await page.locator('.bb-clock-row').click({ button: 'right' });
  await page.waitForFunction(() => document.getElementById('clockPopover').matches(':popover-open'));

  // Back returns to Customize, with the Clock row reflecting the choices.
  await page.getByRole('button', { name: 'Back to Customize', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('clockPopover').matches(':popover-open')
    && document.getElementById('customizePopover').matches(':popover-open'));
  assert.match(await page.locator('#clockStyleSummary').textContent(), /^Inter · Glass$/);
  await page.getByRole('button', { name: 'Clock font & color…', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('clockPopover').matches(':popover-open'));

  // Escape closes it and returns focus to Customize.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('clockPopover').matches(':popover-open'));
  // The toggle event that returns focus is queued, so wait for it.
  await page.waitForFunction(() => document.activeElement?.id === 'customizeButton');

  const errors = fs.existsSync(uncaught) ? fs.readFileSync(uncaught, 'utf8').trim() : '';
  assert.equal(errors, '', 'no uncaught errors');
  console.log('billboard-clock smoke: OK');
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
