import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import testHookCall from './support/test-hook-call.js';

// #448: exercise the real Favorites sheet, row transforms, sticky nav,
// permissioned store writes, and main-process Escape routing in Electron.
// No browser download, live website, or existing user profile is involved.
const { waitForValue } = poll;
const { callTestHook } = testHookCall;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-favorites-picker-'));
const userData = path.join(root, 'profile');
const profile = `${userData}-Dev`;
fs.mkdirSync(profile);
const names = [
  ...Array.from({ length: 12 }, (_, i) => `Folder ${String(i + 1).padStart(2, '0')}`),
  'Kali',
  ...Array.from({ length: 12 }, (_, i) => `Later ${String(i + 1).padStart(2, '0')}`),
  'Very long folder '.repeat(10),
];
const items = names.flatMap((folder, i) => Array.from({ length: folder === 'Kali' ? 8 : 1 }, (_, j) => ({
  id: `favorite-${i}-${j}`,
  url: `https://example.invalid/${i}/${j}`,
  title: `${folder === 'Kali' ? 'Kali' : `Favorite ${i}`} ${j + 1}`,
  folder, favicon: null, addedAt: 1_700_000_000_000 - j, updatedAt: 1_700_000_000_000,
})));
fs.writeFileSync(path.join(profile, 'bookmarks.json'), JSON.stringify({ items, tombstones: [] }));
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
let app;
try {
  app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${userData}`], env: { ...env, BLANC_TEST: '1' } });
  app.context().setDefaultTimeout(5000);
  await app.firstWindow();
  await waitForValue(() => app.evaluate(() => !!globalThis.__blanc?.startupReady?.()), Boolean, 'startup', 30_000);
  const call = (method, ...args) => callTestHook(app, method, args);
  await call('openFavoritesSheet');
  const sheet = await waitForValue(
    () => Promise.resolve(app.context().pages().find((page) => page.url().startsWith('blanc://bookmarks/'))),
    Boolean, 'Favorites sheet',
  );
  await sheet.locator('.folder-chip').first().waitFor();
  const menu = sheet.locator('.folder-picker');
  const pressEscape = async () => {
    const contentsId = await call('utilitySheetContentsId');
    await app.evaluate(({ webContents }, id) => {
      const wc = webContents.fromId(id);
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    }, contentsId);
  };
  const anchor = (title) => sheet.locator('.row').filter({ has: sheet.getByRole('link', { name: title, exact: true }) }).locator('.folder-chip');
  const placeRow = async (title, edge) => {
    await anchor(title).evaluate((button, where) => {
      const page = document.querySelector('.page');
      const card = page.getBoundingClientRect();
      const nav = document.querySelector('.page-nav').getBoundingClientRect();
      const target = where === 'top' ? nav.bottom + 16 : card.bottom - button.offsetHeight - 16;
      page.scrollTop += button.getBoundingClientRect().top - target;
    }, edge);
    await sheet.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const assertLayout = async (title, edge, label) => {
    await placeRow(title, edge);
    const before = await sheet.locator('.page').evaluate((page) => page.scrollTop);
    await anchor(title).click();
    const geometry = await menu.evaluate((picker) => {
      const rect = picker.getBoundingClientRect();
      const options = picker.querySelector('.picker-options');
      const input = picker.querySelector('.picker-new').getBoundingClientRect();
      let obscured = 0;
      for (let y = rect.top + 4; y < rect.bottom - 4; y += 12) {
        for (const x of [rect.left + 4, rect.left + rect.width / 2, rect.right - 4]) {
          if (!picker.contains(document.elementFromPoint(x, y))) obscured += 1;
        }
      }
      const button = picker.parentElement.querySelector('.folder-chip').getBoundingClientRect();
      return {
        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
        height: innerHeight, width: innerWidth, obscured,
        buttonTop: button.top, buttonBottom: button.bottom,
        inputVisible: input.top >= rect.top && input.bottom <= rect.bottom,
        scrollable: options?.scrollHeight > options?.clientHeight,
        scrollTop: document.querySelector('.page').scrollTop,
      };
    });
    assert.ok(geometry.top >= 7 && geometry.bottom <= geometry.height - 7, `${label}: vertical bounds ${JSON.stringify(geometry)}`);
    assert.ok(geometry.left >= 7 && geometry.right <= geometry.width - 7, `${label}: horizontal bounds`);
    assert.equal(geometry.obscured, 0, `${label}: dates, rows and sticky nav must not bleed through`);
    assert.equal(geometry.inputVisible, true, `${label}: new-folder footer stays visible`);
    assert.equal(geometry.scrollable, true, `${label}: many folders scroll internally`);
    assert.ok(Math.abs(geometry.scrollTop - before) <= 1, `${label}: opening must not jump the sheet`);
    if (process.env.BLANC_CAPTURE_FAVORITES && label === 'dark 1000×700 zoom 1 bottom') {
      fs.mkdirSync('output/playwright', { recursive: true });
      await sheet.screenshot({ path: 'output/playwright/favorites-folder-picker.png' });
    }
    // The picker opens toward the roomier side when it doesn't fit below. At
    // tiny zoomed sizes the two sides can differ by a pixel or two, and font
    // metrics differ by platform, so assert the policy rather than a fixed side.
    const opensBelow = geometry.top >= geometry.buttonBottom;
    const opensAbove = geometry.bottom <= geometry.buttonTop;
    const roomAbove = geometry.buttonTop;
    const roomBelow = geometry.height - geometry.buttonBottom;
    assert.ok(opensBelow !== opensAbove, `${label}: opens beside its button, never over it`);
    if (edge === 'top') assert.ok(opensBelow || roomAbove > roomBelow, `${label}: open below unless there is more room above`);
    else assert.ok(opensAbove || roomBelow >= roomAbove, `${label}: flip above unless there is more room below`);
    await sheet.locator('.picker-options').evaluate((options) => { options.scrollTop = options.scrollHeight; });
    assert.equal(await sheet.locator('.page').evaluate((page) => page.scrollTop), geometry.scrollTop, `${label}: option scrolling stays local`);
    // Drive native before-input-event, not a synthetic renderer keydown.
    await pressEscape();
    await menu.waitFor({ state: 'detached' });
    assert.equal((await call('utilitySurface')).visible, true, `${label}: first Escape preserves the sheet`);
    assert.equal(await anchor(title).evaluate((button) => button === document.activeElement), true, `${label}: Escape restores focus`);
  };
  const openFor = async (title) => {
    await placeRow(title, 'top');
    await anchor(title).click();
    await menu.waitFor();
  };

  for (const theme of ['light', 'dark']) {
    await sheet.emulateMedia({ colorScheme: theme });
    assert.equal(await sheet.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches), theme === 'dark');
    for (const size of [{ width: 1000, height: 700, zoom: 1 }, { width: 640, height: 480, zoom: 1 }, { width: 640, height: 480, zoom: 2 }]) {
      await call('setWindowContentSize', size.width, size.height);
      const contentsId = await call('utilitySheetContentsId');
      await app.evaluate(({ webContents }, value) => webContents.fromId(value.id).setZoomFactor(value.zoom), { id: contentsId, zoom: size.zoom });
      await waitForValue(() => sheet.evaluate(() => Math.round(innerWidth)), (width) => Math.abs(width - size.width / size.zoom) <= 1, 'sheet resize and zoom');
      for (const edge of ['top', 'bottom']) await assertLayout(edge === 'top' ? 'Kali 1' : 'Kali 8', edge, `${theme} ${size.width}×${size.height} zoom ${size.zoom} ${edge}`);
    }
  }
  console.log('favorites-folder-picker: 12 layout checks passed');
  await call('setWindowContentSize', 1000, 700);
  await app.evaluate(({ webContents }, id) => webContents.fromId(id).setZoomFactor(1), await call('utilitySheetContentsId'));
  await waitForValue(() => sheet.evaluate(() => innerWidth), (width) => width === 1000, 'reset size');
  await placeRow('Kali 1', 'top');
  await anchor('Kali 1').click();
  await anchor('Kali 1').click();
  await menu.waitFor({ state: 'detached' });
  // The second trigger is above the open picker, so this is an actual
  // pointer switch without scrolling an occluded row into view first.
  await anchor('Kali 2').click();
  await anchor('Kali 1').click();
  assert.equal(await menu.count(), 1, 'switching rows keeps a single picker');
  assert.equal(await anchor('Kali 2').getAttribute('aria-expanded'), 'false');
  assert.equal(await anchor('Kali 1').getAttribute('aria-expanded'), 'true');
  assert.equal(await menu.getByRole('button', { name: '→ Kali', exact: true }).count(), 0, 'current folder omitted');
  await menu.getByRole('button', { name: '→ Folder 01', exact: true }).click();
  await waitForValue(() => call('bookmarkRecords'), (records) => records.find((item) => item.title === 'Kali 1')?.folder === 'Folder 01', 'move to existing folder');
  await menu.waitFor({ state: 'detached' });
  await openFor('Kali 1');
  await menu.getByRole('button', { name: '→ none', exact: true }).click();
  await waitForValue(() => call('bookmarkRecords'), (records) => records.find((item) => item.title === 'Kali 1')?.folder === null, 'move to ungrouped');
  await menu.waitFor({ state: 'detached' });
  await openFor('Kali 1');
  await menu.getByPlaceholder('new folder…').fill('New folder');
  await sheet.keyboard.press('Enter');
  await waitForValue(() => call('bookmarkRecords'), (records) => records.find((item) => item.title === 'Kali 1')?.folder === 'New folder', 'create a folder');
  await menu.waitFor({ state: 'detached' });
  await openFor('Kali 1');
  await sheet.locator('.folder-name').filter({ hasText: /^New folder$/ }).click();
  await menu.waitFor({ state: 'detached' });
  await openFor('Kali 1');
  await sheet.locator('.page').evaluate((page) => { page.scrollTop -= 10; });
  await menu.waitFor({ state: 'detached' });
  await openFor('Kali 1');
  await call('setWindowContentSize', 900, 650);
  await menu.waitFor({ state: 'detached' });
  await openFor('Kali 1');
  await pressEscape();
  await menu.waitFor({ state: 'detached' });
  // Main receives the renderer's escape-disarm IPC asynchronously.
  await sheet.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await pressEscape();
  await waitForValue(() => call('utilitySurface'), (state) => !state.visible, 'second Escape dismisses Favorites');
  console.log('favorites-folder-picker: ok (12 layouts, layering, scrolling, moves, dismissal and native Escape)');
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
