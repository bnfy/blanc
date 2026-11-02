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
    window.appearanceListeners = [];
    const status = { enabled: !!options.active, handle: 'example', syncTabs: false };
    const settings = {
      get: async () => ({ settings: { theme: 'system', searchEngine: 'duckduckgo', adblockEnabled: true }, searchEngines: { duckduckgo: 'DuckDuckGo' }, appIcons: {},
        ...(options.desktop ? {} : { capabilities: ['sync'] }) }),
      set: async patch => patch,
      // M6.5 exposes every contract method on the phone, including unsupported ones.
      blockingStatus: async () => {
        if (!options.desktop) { window.calls.push(['blockingStatus']); throw Error('blockingStatus is not implemented on iOS'); }
        return { selected: 'blanc', active: 'blanc', supported: true, exposed: true, enabled: true, phase: 'ready' };
      },
      onBlockingStatus: () => {},
      onAppearance: callback => window.appearanceListeners.push(callback),
      syncGet: async () => status,
      syncPreflight: async () => ({ ok: true, outcome: 'notFound' }),
      syncDisable: async value => { window.calls.push(['disable', value]); return { ok: true, status: { enabled: false } }; },
      syncSwitchCode: async value => { window.calls.push(['switch', value]); return { ok: false, status }; },
      syncPairState: async () => ({}),
      syncDeviceNameSet: async () => status,
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
    await page.locator('#syncPathStart').click();
    assert.equal(await page.locator('#syncHandle').locator('..').locator('strong').textContent(), 'Give your sync a name');
    assert.equal(await page.locator('#syncPassphrase').locator('..').locator('strong').textContent(), 'Choose a passphrase');
    await page.locator('#syncBack').click();
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
    // Turning sync off and switching syncs live under More options.
    await page.locator('.sync-more-summary').click();
    assert.equal(await visible(page, '#syncWipe'), true);
    await page.locator('#syncSwitchOpen').click();
    assert.equal(await visible(page, '#syncSwitchWipe'), true);
  } finally { await page.close(); }
});
test('phone hides remote wipe and sends false even if hidden checkboxes are set', async () => {
  const { page } = await open('settings', { active: true });
  try {
    // Open More options first, so the checkbox is hidden by capability, not by
    // the closed disclosure.
    await page.locator('.sync-more-summary').click();
    assert.equal(await visible(page, '#syncDisable'), true);
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


test('phone finishes Settings setup without calling the unsupported blocker provider', async () => {
  const { page, errors } = await open('settings');
  try {
    assert.equal(await page.locator('#searchEngine option').count(), 1);
    assert.equal(await page.locator('#theme').inputValue(), 'system');
    assert.equal(await page.locator('#blockingProviderSetting').count(), 0);
    assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'blockingStatus')), false);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});


test('joining uses existing-credential labels and preserves recovery-code case', async () => {
  const { page } = await open('settings');
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#syncPathCode').click();
    assert.ok(await page.locator('#syncCode').evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16);
    assert.equal(await page.locator('#syncCode').getAttribute('autocapitalize'), 'none');
    assert.equal(await page.locator('#syncSwitchCode').getAttribute('autocapitalize'), 'none');
    await page.locator('#syncCode').fill('blanc-sync:1:MixedCaseABCxyz');
    assert.equal(await page.locator('#syncCode').inputValue(), 'blanc-sync:1:MixedCaseABCxyz');
    assert.equal(await page.locator('#syncCode').evaluate(el => getComputedStyle(el).textTransform), 'none');
    await page.locator('#syncUsePassphrase').click();
    assert.equal(await page.locator('#syncHandle').locator('..').locator('strong').textContent(), 'Enter your sync name');
    assert.equal(await page.locator('#syncPassphrase').locator('..').locator('strong').textContent(), 'Enter your passphrase');
  } finally { await page.close(); }
});

test('synced Settings redraw without reloading or overwriting an active name edit', async () => {
  const { page } = await open('settings', { active: true });
  try {
    await page.locator('#syncDeviceName').fill('Name being edited');
    await page.evaluate(() => {
      for (const callback of window.appearanceListeners) callback({
        settings: { theme: 'dark', searchEngine: 'duckduckgo', adblockEnabled: false },
        syncStatus: { enabled: true, handle: 'example', syncTabs: true, deviceName: 'Remote name', deviceNamePublished: 'iPhone' },
      });
    });
    assert.equal(await page.locator('#theme').inputValue(), 'dark');
    assert.equal(await page.locator('#adblockEnabled').isChecked(), false);
    assert.equal(await page.locator('#syncTabsShare').isChecked(), true);
    assert.equal(await page.locator('#syncDeviceName').inputValue(), 'Name being edited');
    await page.locator('#syncDeviceName').blur();
    await page.evaluate(() => {
      for (const callback of window.appearanceListeners) callback({
        syncStatus: { enabled: true, handle: 'example', syncTabs: true, deviceName: 'Remote name', deviceNamePublished: 'iPhone' },
      });
    });
    assert.equal(await page.locator('#syncDeviceName').inputValue(), 'Remote name');
  } finally { await page.close(); }
});
