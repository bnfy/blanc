// The Billboard clock's Font & color, end to end in the real app: open it from
// Customize, change the face, weight, color, tone and style, see each drawn
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
      fill: style.webkitTextFillColor,
      clip: style.backgroundClip,
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
  await page.waitForFunction(() => getComputedStyle(document.getElementById('clockStyleOpen')).display === 'none');
  await page.locator('[data-layout-pick="billboard"]').click();
  await open.click();
  await page.waitForFunction(() => document.getElementById('clockPopover').matches(':popover-open')
    && !document.getElementById('customizePopover').matches(':popover-open'));
  // The popover hangs below the clock, never over it.
  const [clockBox, popoverBox] = await Promise.all([page.locator('#bbClock').boundingBox(), page.locator('#clockPopover').boundingBox()]);
  assert.ok(popoverBox.y >= clockBox.y + clockBox.height, 'the popover sits under the clock');
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

  // Glass.
  await page.getByRole('button', { name: 'Glass', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('bbClock').dataset.style === 'glass');
  const glass = await clock();
  assert.equal(glass.clip, 'text');
  assert.equal(glass.color, 'rgba(0, 0, 0, 0)');
  await capture(page, '5-glass');
  await page.getByRole('button', { name: 'Automatic', exact: true }).click();
  await page.getByRole('button', { name: 'Inter', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('bbClock').hasAttribute('data-ink')
    && document.getElementById('bbClock').dataset.font === 'inter');
  await capture(page, '6-glass-auto-inter');

  // Every choice is stamped for Profile Sync, and unknown values are refused.
  const keys = ['newtabClockFont', 'newtabClockWeight', 'newtabClockColor', 'newtabClockTone', 'newtabClockStyle'];
  await waitForValue(async () => settingsFile(),
    (saved) => saved.newtabClockStyle === 'glass' && saved.newtabClockColor === 'auto' && saved.newtabClockFont === 'inter'
      && keys.every((key) => saved._syncMeta?.[key] > 0),
    'every choice saved and stamped for sync');
  const refused = await page.evaluate(() => window.bowserPages.start.setClock({ font: 'comic', weight: 1000, color: '#ff0000', style: 'chrome' }));
  assert.deepEqual({ font: refused.font, weight: refused.weight, color: refused.color, style: refused.style },
    { font: 'inter', weight: 200, color: 'auto', style: 'glass' });

  // Escape closes it and returns focus to Customize.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('clockPopover').matches(':popover-open'));
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'customizeButton');

  const errors = fs.existsSync(uncaught) ? fs.readFileSync(uncaught, 'utf8').trim() : '';
  assert.equal(errors, '', 'no uncaught errors');
  console.log('billboard-clock smoke: OK');
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
