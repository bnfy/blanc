import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import testHookCall from './support/test-hook-call.js';

// F63: the Favorites manager in the real Favorites sheet. Drag and drop is
// driven with DOM drag events (a real pointer is a hand check), every result
// is read back after a reload so it proves the saved order, not the page's
// own state. Replaces the flat list's folder-picker smoke (#448), whose picker
// the manager no longer shows. No live website or existing profile is used.
const { waitForValue } = poll;
const { callTestHook } = testHookCall;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-favorites-manager-'));
const userData = path.join(root, 'profile');
const profile = `${userData}-Dev`;
fs.mkdirSync(profile);
const seed = [['A', 'Work'], ['B', 'Work'], ['C', 'Work'], ['D', 'Home'], ['E', null]];
const items = seed.map(([name, folder], i) => ({
  id: `favorite-${name}`,
  url: `https://example.invalid/${name.toLowerCase()}`,
  title: name,
  folder, favicon: null, addedAt: 1_700_000_000_000 + i * 1000, updatedAt: 1_700_000_000_000 + i * 1000,
}));
fs.writeFileSync(path.join(profile, 'bookmarks.json'), JSON.stringify({ items, tombstones: [] }));
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false,
}));
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
void ignored;
let app;
let passed = 0;
const step = (name) => { passed += 1; console.log(`  ok ${name}`); };
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
  await sheet.waitForSelector('#manager .fav-tree-row');
  const install = () => sheet.evaluate(() => {
    window.__rows = () => [...document.querySelectorAll('#manager .fav-row')];
    window.__titles = () => window.__rows().map((row) => row.querySelector('.title').textContent);
    window.__row = (title) => window.__rows().find((row) => row.querySelector('.title').textContent === title);
    window.__tree = (folder) => [...document.querySelectorAll('.fav-tree-row')].find((row) => row.dataset.path === folder);
    window.__drag = (from, to, yFraction) => {
      const dataTransfer = new DataTransfer();
      const box = to.getBoundingClientRect();
      const at = { bubbles: true, cancelable: true, dataTransfer, clientX: box.left + 20, clientY: box.top + box.height * yFraction };
      from.dispatchEvent(new DragEvent('dragstart', at));
      to.dispatchEvent(new DragEvent('dragover', at));
      to.dispatchEvent(new DragEvent('drop', at));
      from.dispatchEvent(new DragEvent('dragend', at));
    };
  });
  const settle = () => sheet.waitForTimeout(350);
  const reload = async () => { await sheet.reload(); await sheet.waitForSelector('#manager .fav-tree-row'); await install(); await settle(); };
  const open = async (folder) => { await sheet.evaluate((f) => window.__tree(f).click(), folder); await settle(); };
  const titles = () => sheet.evaluate(() => window.__titles());
  const folders = async () => Object.fromEntries((await call('bookmarkRecords')).map((r) => [r.title, r.folder]));
  await install();

  // The top level reads as it did before: folders A–Z, then favorites newest first.
  assert.deepEqual(await titles(), ['Home', 'Work', 'E']);
  step('the top level lists folders A–Z, then favorites');

  await open('Work');
  assert.deepEqual(await titles(), ['C', 'B', 'A']);
  await sheet.evaluate(() => window.__drag(window.__row('A'), window.__row('C'), 0.1));
  await reload();
  await open('Work');
  assert.deepEqual(await titles(), ['A', 'C', 'B']);
  step('dragging a favorite above another saves the new order');

  await sheet.evaluate(() => window.__drag(window.__row('C'), window.__tree('Home'), 0.5));
  await settle();
  assert.equal((await folders()).C, 'Home');
  step('dragging a favorite onto a folder in the tree moves it there');

  await sheet.click('.fav-new-folder');
  await sheet.fill('.fav-name-input', 'Clients');
  await sheet.press('.fav-name-input', 'Enter');
  await settle();
  await sheet.evaluate(() => window.__drag(window.__row('B'), window.__row('Clients'), 0.5));
  await settle();
  assert.equal((await folders()).B, 'Work › Clients');
  step('a new folder takes a dragged favorite');

  await sheet.evaluate(() => window.__row('Clients').querySelector('.fav-more').click());
  const items = await sheet.$$eval('.fav-menu .fav-menu-item', (buttons) => buttons.map((b) => b.textContent));
  assert.deepEqual(items, ['Open', 'Rename', 'New folder inside', 'Move to…', 'Move up', 'Move down', 'Delete folder']);
  const inside = await sheet.evaluate(() => {
    const box = document.querySelector('.fav-menu').getBoundingClientRect();
    return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
  });
  assert.ok(inside, 'the menu stays inside the window');
  await sheet.keyboard.press('Escape');
  await settle();
  assert.equal(await sheet.evaluate(() => document.querySelector('.fav-menu')), null);
  assert.ok(await sheet.evaluate(() => document.activeElement?.classList.contains('fav-more')), 'Escape returns focus to ⋮');
  step('a folder menu lists its actions, fits the window, and Escape closes it');

  await sheet.evaluate(() => window.__row('Clients').querySelector('.fav-more').click());
  await sheet.click('.fav-menu .fav-menu-item >> text=Rename');
  await sheet.fill('.fav-name-input', 'Customers');
  await sheet.press('.fav-name-input', 'Enter');
  await settle();
  assert.equal((await folders()).B, 'Work › Customers');
  step('renaming a folder moves what it holds');

  await sheet.evaluate(() => window.__row('A').querySelector('.fav-more').click());
  await sheet.click('.fav-menu .fav-menu-item >> text=Move to…');
  const targets = await sheet.$$eval('.fav-menu .fav-menu-item', (buttons) => buttons.map((b) => `${b.textContent}${b.disabled ? ' (here)' : ''}`));
  assert.deepEqual(targets, ['Top level', 'Home', 'Work (here)', 'Customers']);
  await sheet.click('.fav-menu .fav-menu-item >> text=Home');
  await settle();
  assert.equal((await folders()).A, 'Home');
  step('Move to… lists every folder and moves the favorite');

  await open('Work');
  await sheet.evaluate(() => window.__row('Customers').querySelector('.fav-more').click());
  await sheet.click('.fav-menu .fav-menu-item >> text=Delete folder');
  await settle();
  assert.equal((await folders()).B, 'Work');
  step('deleting a folder moves its favorites up one level');

  await sheet.evaluate(() => window.__row('B').querySelector('.fav-more').click());
  await sheet.click('.fav-menu .fav-menu-item >> text=Remove');
  await reload();
  await open('Work');
  assert.equal(await sheet.textContent('#manager .fav-list .empty'), 'This folder is empty.');
  step('a folder stays after its last favorite is removed');

  await sheet.fill('.fav-search', 'invalid/d');
  await settle();
  const found = await sheet.$$eval('#manager .fav-row', (rows) => rows.map((row) => [row.querySelector('.title').textContent, row.querySelector('.fav-path')?.textContent]));
  assert.deepEqual(found, [['D', 'Home']]);
  await sheet.fill('.fav-search', '');
  step('search finds a favorite in a folder and names the folder');

  await sheet.setViewportSize({ width: 640, height: 720 });
  await settle();
  const narrow = await sheet.evaluate(() => ({
    tree: getComputedStyle(document.querySelector('.fav-tree')).display,
    select: getComputedStyle(document.querySelector('.fav-folder-select')).display,
    sideways: document.querySelector('.page').scrollWidth > document.querySelector('.page').clientWidth,
  }));
  assert.deepEqual(narrow, { tree: 'none', select: 'block', sideways: false });
  step('a narrow sheet swaps the tree for a folder menu without sideways scrolling');

  console.log(`favorites-manager: ok (${passed} checks)`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
