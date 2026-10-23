import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('src/renderer/pages');
let server, browser, base;
before(async () => {
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, `.${pathname === '/strings.js' ? '/strings.en.js' : pathname}`);
    if (!file.startsWith(`${root}/`)) { res.writeHead(403).end(); return; }
    try {
      const bytes = await readFile(file);
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
      res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

async function open(name, options = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(options => {
    window.calls = [];
    const status = { enabled: !!options.active, handle: 'example', syncTabs: false };
    const settings = {
      get: async () => ({ settings: {}, searchEngines: {}, appIcons: {},
        ...(options.desktop ? {} : { capabilities: ['sync'] }) }),
      set: async patch => patch,
      syncGet: async () => status,
      syncPreflight: async () => ({ ok: true, outcome: 'notFound' }),
      syncDisable: async value => { window.calls.push(['disable', value]); return { ok: true, status: { enabled: false } }; },
      syncSwitchCode: async value => { window.calls.push(['switch', value]); return { ok: false, status }; },
      syncPairState: async () => ({}),
    };
    window.bowserPages = {
      settings,
      profiles: { list: async () => ({ profiles: [] }) },
      permissions: { list: async () => ({}) },
      defaultBrowser: { get: async () => ({ isDefault: false, canSet: false }) },
      bookmarks: {
        capabilities: async () => ({ editable: options.editable !== false }),
        list: async () => [{ id: 'one', title: 'Example', url: 'https://example.com/', addedAt: 1, folder: 'Work' }],
        remove: async () => { if (options.reject) throw Error('Edit Favorites on your computer for now.'); },
        browserSources: async () => ({ sources: [] }),
      },
      pins: { list: async () => ({ max: 8, pins: [] }), onChanged: () => {} },
    };
  }, options);
  await page.goto(`${base}/${name}.html${name === 'settings' ? '#sync' : ''}`);
  await page.waitForFunction(name => name === 'settings'
    ? document.querySelector('#syncSetupIntro').textContent.length > 0
    : document.querySelectorAll('#list .row').length > 0, name);
  assert.deepEqual(errors, []);
  return { page, errors };
}
const visible = (page, selector) => page.locator(selector).isVisible();
async function missingSync(page) {
  await page.locator('#syncPathCode').click();
  await page.locator('#syncUsePassphrase').click();
  await page.locator('#syncHandle').fill('example');
  await page.locator('#syncPassphrase').fill('correct horse battery staple');
  await page.locator('#syncSubmit').click();
  await page.locator('#syncNotFound').waitFor({ state: 'visible' });
}

test('desktop retains both creation paths when capabilities are absent', async () => {
  const { page } = await open('settings', { desktop: true });
  try {
    assert.equal(await visible(page, '#syncPathStart'), true);
    await missingSync(page);
    assert.equal(await visible(page, '#syncStartNew'), true);
  } finally { await page.close(); }
});
test('join-only phone hides both creation paths and explains how to start', async () => {
  const { page } = await open('settings');
  try {
    assert.equal(await visible(page, '#syncPathStart'), false);
    assert.equal(await visible(page, '[data-i18n="settings.sync.createOnComputer"]:visible'), true);
    await missingSync(page);
    assert.equal(await visible(page, '#syncStartNew'), false);
    assert.equal(await visible(page, '#syncNotFound [data-i18n="settings.sync.createOnComputer"]'), true);
  } finally { await page.close(); }
});
test('desktop retains both remote-wipe checkboxes', async () => {
  const { page } = await open('settings', { desktop: true, active: true });
  try {
    assert.equal(await visible(page, '#syncWipe'), true);
    await page.locator('#syncSwitchOpen').click();
    assert.equal(await visible(page, '#syncSwitchWipe'), true);
  } finally { await page.close(); }
});
test('phone hides remote wipe and sends false even if hidden checkboxes are set', async () => {
  const { page } = await open('settings', { active: true });
  try {
    assert.equal(await visible(page, '#syncWipe'), false);
    await page.locator('#syncSwitchOpen').click();
    assert.equal(await visible(page, '#syncSwitchWipe'), false);
    await page.evaluate(() => {
      const box = document.querySelector('#syncSwitchWipe'); box.checked = true; box.dispatchEvent(new Event('change'));
    });
    await page.locator('#syncSwitchCode').fill('K7MR4PX2');
    await page.locator('#syncSwitchSubmit').click();
    await page.waitForFunction(() => window.calls.length === 1);
    await page.evaluate(() => { document.querySelector('#syncWipe').checked = true; });
    await page.locator('#syncDisable').click();
    await page.waitForFunction(() => window.calls.length === 2);
    assert.deepEqual(await page.evaluate(() => window.calls), [
      ['switch', { code: 'K7MR4PX2', wipeRemote: false }], ['disable', { wipeRemote: false }],
    ]);
  } finally { await page.close(); }
});
test('read-only Favorites show their note and no edit or import controls', async () => {
  const { page } = await open('bookmarks', { editable: false });
  try {
    assert.equal(await visible(page, '#readOnlyNote'), true);
    assert.equal(await visible(page, '.import-actions'), false);
    assert.equal(await page.locator('.folder-actions button, .bookmark-actions button').count(), 0);
    assert.equal(await page.locator('.row a.title').count(), 1);
  } finally { await page.close(); }
});
test('editable Favorites retain folder, move, remove, import and pin controls', async () => {
  const { page } = await open('bookmarks');
  try {
    assert.equal(await visible(page, '#readOnlyNote'), false);
    for (const selector of ['#importBtn', '#browserFindBtn', '#bringTabsBtn', '.folder-actions button', '.folder-chip', '.pin-toggle', '.bookmark-actions .danger']) {
      assert.equal(await page.locator(selector).first().isVisible(), true, selector);
    }
  } finally { await page.close(); }
});
test('rejected removal displays its message without an unhandled rejection', async () => {
  const { page, errors } = await open('bookmarks', { reject: true });
  try {
    await page.locator('.bookmark-actions .danger').click();
    await page.waitForFunction(() => document.querySelector('#importStatus').textContent === 'Edit Favorites on your computer for now.');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
