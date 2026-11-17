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
// An empty home for browser discovery, so the dialog never reads this
// machine's own browsers.
const browserHome = path.join(root, 'browser-home');
fs.mkdirSync(browserHome);
const seed = [['A', 'Work'], ['B', 'Work'], ['C', 'Work'], ['D', 'Home'], ['E', null], ['P', 'Pets']];
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
  app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${userData}`], env: { ...env, BLANC_TEST: '1', BLANC_TEST_BROWSER_HOME: browserHome } });
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
    window.__tree = (folder) => [...document.querySelectorAll('.fav-tree-row')].find((row) => row.dataset.path === (folder ?? ''));
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
  assert.deepEqual(await titles(), ['Home', 'Pets', 'Work', 'E']);
  step('the top level lists folders A–Z, then favorites');

  await open('Work');
  assert.deepEqual(await titles(), ['C', 'B', 'A']);
  assert.equal(await sheet.textContent('.fav-heading'), 'Work');
  step('the open folder is the heading');
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

  // From ⋯ the arrow keys still move between rows, and the list is one Tab stop.
  const fromKey = await sheet.evaluate(() => document.activeElement.closest('.fav-row').dataset.key);
  await sheet.keyboard.press('ArrowDown');
  const after = await sheet.evaluate(() => ({
    key: document.activeElement.closest('.fav-row')?.dataset.key,
    onRow: document.activeElement.classList.contains('fav-row'),
    stops: [...document.querySelectorAll('#manager .fav-list :is(a, button, [tabindex])')].filter((n) => n.tabIndex >= 0).length,
  }));
  assert.notEqual(after.key, fromKey);
  assert.deepEqual({ onRow: after.onRow, stops: after.stops }, { onRow: true, stops: 1 });
  step('arrow keys work from a row’s ⋯, and the list is a single Tab stop');

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
  assert.deepEqual(targets, ['Top level', 'Home', 'Pets', 'Work (here)', 'Customers']);
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
  assert.equal(await sheet.textContent('#manager .fav-list .fav-empty'), 'This folder is empty.');
  step('a folder stays after its last favorite is removed');

  await sheet.fill('.fav-search', 'invalid/d');
  await settle();
  const found = await sheet.$$eval('#manager .fav-row', (rows) => rows.map((row) => [row.querySelector('.title').textContent, row.querySelector('.fav-path')?.textContent]));
  assert.deepEqual(found, [['D', 'Home']]);
  await sheet.fill('.fav-search', '');
  step('search finds a favorite in a folder and names the folder');

  // Escape in a rename cancels it and keeps the sheet open.
  await open(null);
  await sheet.evaluate(() => window.__row('Home').querySelector('.fav-more').click());
  await sheet.click('.fav-menu .fav-menu-item >> text=Rename');
  await sheet.fill('.fav-name-input', 'Never saved');
  await sheet.keyboard.press('Escape');
  await settle();
  assert.ok((await titles()).includes('Home'), 'the rename was cancelled');
  assert.equal(await sheet.evaluate(() => document.visibilityState), 'visible');
  assert.ok(await call('utilitySurface').then((s) => s.visible), 'Escape left the sheet open');
  step('Escape cancels a rename without saving or closing the sheet');

  // Remove works on a search result that lives in another folder.
  await sheet.fill('.fav-search', 'invalid/p');
  await settle();
  await sheet.evaluate(() => window.__row('P').querySelector('.fav-more').click());
  await sheet.click('.fav-menu .fav-menu-item >> text=Remove');
  await settle();
  assert.equal((await folders()).P, undefined);
  await sheet.fill('.fav-search', '');
  await settle();
  step('Remove on a search result removes that favorite');

  // Sibling folders reorder by dragging in the sidebar.
  await sheet.evaluate(() => window.__drag(window.__tree('Work'), window.__tree('Home'), 0.1));
  await settle();
  const sidebar = await sheet.$$eval('.fav-tree-row', (rows) => rows.map((r) => r.dataset.path).filter(Boolean));
  assert.deepEqual(sidebar.slice(0, 3), ['Work', 'Home', 'Pets']);
  step('a sidebar folder dragged above its sibling keeps that order');

  // A menu on a sidebar folder leaves its expanded state alone.
  const expandedBefore = await sheet.evaluate(() => window.__tree('Work').getAttribute('aria-expanded'));
  await sheet.evaluate(() => window.__tree('Work').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  await sheet.keyboard.press('Escape');
  await settle();
  assert.equal(await sheet.evaluate(() => window.__tree('Work').getAttribute('aria-expanded')), expandedBefore);
  step('closing a sidebar folder’s menu keeps it expanded or collapsed as it was');

  // Move up keeps the keyboard where it was.
  await open('Home');
  const homeOrder = await titles();
  await sheet.evaluate(() => { const rows = window.__rows(); rows.at(-1).focus(); rows.at(-1).querySelector('.fav-more').click(); });
  await sheet.click('.fav-menu .fav-menu-item >> text=Move up');
  await settle();
  assert.deepEqual(await titles(), [...homeOrder.slice(0, -2), homeOrder.at(-1), homeOrder.at(-2)]);
  assert.equal(await sheet.evaluate(() => document.activeElement?.querySelector?.('.title')?.textContent), homeOrder.at(-1));
  step('Move up keeps focus on the row that moved');

  // The open folder follows when its folder is dragged into another.
  await open('Home');
  await sheet.evaluate(() => window.__drag(window.__tree('Home'), window.__tree('Pets'), 0.5));
  await settle();
  assert.deepEqual(await sheet.evaluate(() => ({
    heading: document.querySelector('.fav-heading').textContent,
    crumbs: [...document.querySelectorAll('.fav-crumb')].map((c) => c.textContent),
  })), { heading: 'Home', crumbs: ['All favorites', 'Pets'] });
  step('the open folder stays open when its folder moves');

  // At rest a row shows only its ×; Pin and ⋯ come with the pointer.
  await sheet.mouse.move(1, 1);
  await settle();
  const shown = (selector) => sheet.evaluate((sel) => {
    const node = document.querySelector(`#manager .fav-row[data-url] ${sel}`);
    const style = getComputedStyle(node);
    return style.visibility === 'visible' && Number(style.opacity) === 1 && style.pointerEvents !== 'none';
  }, selector);
  assert.deepEqual([await shown('.fav-remove'), await shown('.fav-row-pin'), await shown('.fav-more')], [true, false, false]);
  await sheet.hover('#manager .fav-row[data-url] .fav-main .url');
  await settle();
  assert.deepEqual([await shown('.fav-remove'), await shown('.fav-row-pin'), await shown('.fav-more')], [true, true, true]);
  step('a row always shows ×, and Pin and ⋯ on hover');

  // The circle selects; one selected row brings the selection bar.
  await sheet.click('#manager .fav-row[data-url] .fav-check');
  await settle();
  const picked = await sheet.evaluate(() => ({
    selected: document.querySelectorAll('#manager .fav-row.selected').length,
    bar: !document.querySelector('.fav-selection').hidden,
    circles: getComputedStyle(document.querySelectorAll('#manager .fav-row[data-url] .fav-check')[1] ?? document.querySelector('#manager .fav-check')).opacity,
  }));
  assert.deepEqual(picked, { selected: 1, bar: true, circles: '1' });
  // Removing several asks first, with the keyboard on Cancel.
  await sheet.click('#manager .fav-row[data-url]:nth-child(2) .fav-check');
  await settle();
  await sheet.evaluate(() => document.querySelector('#manager .fav-row.selected').focus());
  await sheet.keyboard.press('Delete');
  await settle();
  assert.ok(await sheet.evaluate(() => document.activeElement.classList.contains('fav-confirm-cancel')), 'Cancel has the keyboard');
  await sheet.keyboard.press('Escape');
  await settle();
  await sheet.click('.fav-selection .fav-bar-button >> text=Clear selection');
  await settle();
  step('the circle selects a row and brings the selection bar; removing several asks with Cancel focused');

  // × removes at once.
  const before = (await call('bookmarkRecords')).length;
  await sheet.evaluate(() => document.querySelector('#manager .fav-row[data-url] .fav-remove').click());
  await settle();
  assert.equal((await call('bookmarkRecords')).length, before - 1);
  step('× removes the favorite');

  // "Bring my stuff to Blanc" is one dialog. Nothing is read before it opens;
  // opening it looks, and a bookmarks file is always offered.
  assert.equal(await sheet.evaluate(() => document.querySelectorAll('#browserSource option').length), 0);
  await sheet.click('#importMenuBtn');
  const dialog = await waitForValue(() => sheet.evaluate(() => ({
    open: document.getElementById('importDialog').open,
    options: [...document.querySelectorAll('#browserSource option')].map((o) => o.textContent),
    chosen: document.getElementById('browserSource').value,
    what: [...document.querySelectorAll('.import-check')].map((l) => `${l.textContent}:${l.querySelector('input').checked}`),
    go: !document.getElementById('browserImportBtn').disabled,
  })), (value) => value.options.at(-1) === 'Bookmarks file (HTML)…', 'the import dialog to finish looking');
  assert.deepEqual({ ...dialog, options: dialog.options.at(-1) }, {
    open: true, options: 'Bookmarks file (HTML)…', chosen: 'file', what: ['Favorites:true', 'Open tabs:false'], go: true,
  });
  // A click on the card's own padding is not a click outside it.
  const card = await sheet.evaluate(() => { const box = document.getElementById('importDialog').getBoundingClientRect(); return { x: box.left + 6, y: box.top + 6 }; });
  await sheet.mouse.click(card.x, card.y);
  await settle();
  assert.equal(await sheet.evaluate(() => document.getElementById('importDialog').open), true, 'a click on the padding keeps it open');
  await sheet.click('#importWhatFavorites');
  assert.equal(await sheet.evaluate(() => document.getElementById('browserImportBtn').disabled), true, 'Import needs something to bring');
  await sheet.keyboard.press('Escape');
  await settle();
  assert.equal(await sheet.evaluate(() => document.getElementById('importDialog').open), false);
  assert.ok(await call('utilitySurface').then((s) => s.visible), 'Escape closed only the dialog');
  step('"Bring my stuff to Blanc" opens one dialog that looks on open and closes on Escape');

  await sheet.setViewportSize({ width: 640, height: 720 });
  await settle();
  const narrow = await sheet.evaluate(() => ({
    search: getComputedStyle(document.querySelector('.fav-search')).display,
    tree: getComputedStyle(document.querySelector('.fav-tree-list')).display,
    select: getComputedStyle(document.querySelector('.fav-folder-select')).display,
    sideways: document.querySelector('.page').scrollWidth > document.querySelector('.page').clientWidth,
  }));
  assert.deepEqual(narrow, { search: 'block', tree: 'none', select: 'block', sideways: false });
  step('a narrow sheet keeps search and swaps the tree for a folder menu, without sideways scrolling');

  console.log(`favorites-manager: ok (${passed} checks)`);
} finally {
  await app?.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
