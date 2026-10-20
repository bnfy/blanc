// test/desktop/i18n-pseudo-sweep.mjs — npm run test:i18n:desktop [-- --include-pending]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';
import sweep from './support/pseudo-sweep.js';
import sessionFixture from '../support/chromium-session-fixture.js';
import browserImport from '../../src/main/browser-data-import.js';

const { waitForValue } = poll;
const { classifyTextEntries, COLLECT } = sweep;
const { callTestHook } = testHookCall;
const includePending = process.argv.includes('--include-pending');
const scope = JSON.parse(fs.readFileSync('copy/i18n-scope.json', 'utf8')).files;
// Fixed terms, plus file format names, which are the same in every language.
const allow = ['Blanc', 'Blanc Blocker', 'Blanc Patron', 'Patron', 'uBlock Origin', '1Password', 'JSON', 'Electron', 'Chromium'];
// Fixed terms by pattern: slash command names are never translated.
const allowPatterns = [/^\/[a-z0-9][a-z0-9-]*$/];

const findPage = (app, prefix, label) =>
  waitForValue(async () => (await app.windows()).find((p) => p.url().startsWith(prefix)), Boolean, label);

// Each extraction phase adds its surfaces here (Phase recipe, step 7).
const CHROME_FILES = ['src/renderer/index.html', 'src/renderer/renderer.js', 'src/renderer/vertical-tabs.js', 'src/renderer/tab-drag.js'];
// Elements whose text another, still-pending file writes (main-computed text,
// or a renderer module converted in a later phase). They are exempt only while
// that file is pending; once it is guarded, they are checked like everything else.
// A local page that asks for a permission, so the real prompt surface shows.
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end('<!doctype html><title>permission</title>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const permissionPageUrl = `http://127.0.0.1:${server.address().port}/permission`;

const fillSurface = (kind) => async ({ app }) => {
  // The hook returns null where the fill capsule surface is unavailable.
  if (!(await callTestHook(app, 'showFillStatus', [kind]))) return null;
  const page = await findPage(app, 'blanc-chrome://fill-status/', 'fill capsule');
  await page.waitForFunction(() => [...document.querySelectorAll('.fill-capsule')].some((el) => !el.hidden));
  return page;
};

const OVERLAY_FILES = ['src/renderer/overlay.html', 'src/renderer/overlay.js'];
const overlayPage = (app) => findPage(app, 'blanc-chrome://overlay/', 'overlay');
const openPanel = async ({ app, chrome }) => {
  await chrome.locator('#islandPill').click();
  const overlay = await overlayPage(app);
  await overlay.locator('#islandPanel').waitFor({ state: 'visible' });
  return overlay;
};
const typeInPanel = (text, settle) => async (ctx) => {
  const overlay = await openPanel(ctx);
  await overlay.locator('#addressInput').fill(text);
  await overlay.waitForFunction(settle);
  return overlay;
};

// Native menus are drawn by the OS, not a page. In the test app, popup() is
// replaced so each menu Blanc pops is recorded as label entries (radio items
// are tab-group names and Split with ▸ items are tab titles, which are data);
// a right-click is a real context-menu
// event sent to the webContents (an id, or a URL prefix).
const recordMenus = (app) => app.evaluate(({ Menu }) => {
  if (globalThis.__sweepMenus) return;
  globalThis.__sweepMenus = [];
  const entries = (menu) => menu.items.flatMap((item) => (item.type === 'separator' || !item.visible ? [] : [
    { text: item.label, ignored: item.type === 'radio' || String(item.id ?? '').startsWith('split-with-tab:') },
    ...(item.submenu ? entries(item.submenu) : []),
  ]));
  Menu.prototype.popup = function popup(options) { globalThis.__sweepMenus.push(entries(this)); options?.callback?.(); };
});
const rightClick = async (app, target, params) => {
  await recordMenus(app);
  await app.evaluate(({ webContents }, { target, params }) => {
    const wc = typeof target === 'number' ? webContents.fromId(target)
      : webContents.getAllWebContents().find((w) => w.getURL().startsWith(target));
    wc.emit('context-menu', { preventDefault() {} }, {
      x: 0, y: 0, linkURL: '', srcURL: '', pageURL: wc.getURL(), mediaType: 'none', isEditable: false, selectionText: '',
      misspelledWord: '', dictionarySuggestions: [], editFlags: {}, menuSourceType: 'mouse', ...params,
    });
  }, { target, params });
  return waitForValue(() => app.evaluate(() => globalThis.__sweepMenus.shift() ?? null), Boolean, `context menu on ${target}`);
};
const activeTab = async (app) => {
  const { activeTabId, tabs } = await callTestHook(app, 'state');
  return tabs.find((t) => t.id === activeTabId);
};
const NATIVE_MENU_SURFACES = [
  {
    name: 'page context menus',
    files: ['src/main/context-menu.js'],
    native: async ({ app }) => {
      const id = (await activeTab(app)).webContentsId;
      return [
        ...await rightClick(app, id, {}),
        ...await rightClick(app, id, { linkURL: 'https://example.com/', srcURL: 'https://example.com/a.png', mediaType: 'image', isEditable: true, misspelledWord: 'teh' }),
        ...await rightClick(app, id, { selectionText: 'blanc' }),
      ];
    },
  },
  {
    name: 'tab context menu',
    files: ['src/main/tab-context-menu-model.js'],
    // A background tab in a group, so the Glance, quiet and group items show.
    native: async ({ app, chrome }) => {
      const { activeTabId, tabs } = await callTestHook(app, 'state');
      const other = tabs.find((t) => t.id !== activeTabId && t.groupId) ?? tabs.find((t) => t.id !== activeTabId);
      await chrome.evaluate((id) => { window.__blancCtxRowTabId = id; }, other.id);
      return rightClick(app, 'blanc-chrome://index/', {});
    },
  },
  {
    name: 'address bar context menu',
    files: ['src/main/address-menu-model.js'],
    native: async (ctx) => {
      const overlay = await openIslandPanel(ctx);
      // The menu only pops for a click that lands on the input, so wait out
      // the panel's opening animation until its centre does.
      const at = await (await overlay.waitForFunction(() => {
        const el = document.getElementById('addressInput');
        const r = el.getBoundingClientRect();
        const point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        return document.elementFromPoint(point.x, point.y) === el && point;
      })).jsonValue();
      const editFlags = { canUndo: true, canRedo: true, canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true };
      const labels = await rightClick(ctx.app, 'blanc-chrome://overlay/', { isEditable: true, editFlags, ...at });
      await overlay.evaluate(() => window.browserAPI.closeOverlay());
      return labels;
    },
  },
  {
    name: 'app menu',
    files: ['src/main/main.js', 'src/main/browser-shortcuts.js'],
    // Checkbox items list open tabs and profiles by name, which are data.
    native: ({ app }) => app.evaluate(({ Menu }) => {
      const entries = (items) => items.flatMap((item) => (item.type === 'separator' || !item.visible ? [] : [
        { text: item.label, ignored: item.type === 'checkbox' }, ...(item.submenu ? entries(item.submenu.items) : []),
      ]));
      return entries(Menu.getApplicationMenu().items);
    }),
  },
  {
    name: 'Dock menu',
    files: ['src/main/dock-menu.js'],
    // macOS only. Its top line is the active tab's title, which is data.
    native: ({ app }) => app.evaluate(({ app: electronApp }) => electronApp.dock?.getMenu?.()?.items
      .filter((item) => item.visible && item.type !== 'separator')
      .map((item) => ({ text: item.label, ignored: item.id === 'active-tab' })) ?? null),
  },
];

// Native dialogs are recorded the same way: each call's title, message,
// detail, buttons and file-type names are captured and answered as Cancel.
const recordDialogs = (app) => app.evaluate(({ dialog }) => {
  if (globalThis.__sweepDialogs) return;
  globalThis.__sweepDialogs = [];
  const record = (options = {}) => {
    globalThis.__sweepDialogs.push([options.title, options.message, options.detail, ...(options.buttons ?? []),
      ...(options.filters ?? []).map((filter) => filter.name)].filter(Boolean).map((text) => ({ text, ignored: false })));
    return options.cancelId ?? 0;
  };
  dialog.showMessageBox = async (...args) => ({ response: record(args.at(-1)), checkboxChecked: false });
  dialog.showMessageBoxSync = (...args) => record(args.at(-1));
  dialog.showOpenDialog = async (...args) => { record(args.at(-1)); return { canceled: true, filePaths: [] }; };
  dialog.showSaveDialog = async (...args) => { record(args.at(-1)); return { canceled: true }; };
});
const dialogSurface = (name, files, trigger) => ({
  name,
  files,
  native: async (ctx) => {
    await recordDialogs(ctx.app);
    if ((await trigger(ctx)) === null) return null;
    return waitForValue(() => ctx.app.evaluate(() => globalThis.__sweepDialogs.shift() ?? null), Boolean, name);
  },
});
const NATIVE_DIALOG_SURFACES = [
  dialogSurface('leave page dialog', ['src/main/tab-view.js'], async ({ app }) => {
    const { webContentsId } = await activeTab(app);
    await app.evaluate(({ webContents }, id) => { webContents.fromId(id).emit('will-prevent-unload', { preventDefault() {} }); }, webContentsId);
  }),
  // A scheme no application handles: Blanc says so instead of launching.
  dialogSurface('external application dialog', ['src/main/external-protocols.js'], async ({ app, chrome }) => {
    const { id } = await activeTab(app);
    await chrome.evaluate((tabId) => window.browserAPI.navigate(tabId, 'zzzblancsweep://test'), id);
  }),
  dialogSurface('import favorites dialog', ['src/main/pages.js'], async ({ app }) => {
    const page = await findPage(app, 'blanc://newtab/', 'new tab');
    await page.evaluate(() => { window.bowserPages.bookmarks.import(); });
  }),
  // Unnamed passkeys, so every button is interface text. macOS only.
  dialogSurface('passkey picker', ['src/main/webauthn.js'], ({ app }) => app.evaluate(({ session }) =>
    session.defaultSession.emit('select-webauthn-account', { preventDefault() {} },
      { relyingPartyId: 'example.com', accounts: [{ credentialId: 'a' }, { credentialId: 'b' }] }, () => {}) || null)),
  dialogSurface('diagnostics export dialog', ['src/main/diagnostics.js'], async ({ app, chrome }) => {
    await chrome.evaluate(() => window.browserAPI.createTab('blanc://settings/'));
    const page = await findPage(app, 'blanc://settings', 'settings sheet');
    await page.waitForFunction(() => window.bowserPages?.diagnostics);
    await page.evaluate(() => { window.bowserPages.diagnostics.export(); });
  }),
  // A development build cannot update, so a check says so in a dialog.
  dialogSurface('update check dialog', ['src/main/updater.js'], async ({ app }) => {
    const page = await findPage(app, 'blanc://settings', 'settings sheet');
    await page.evaluate(() => { window.bowserPages.settings.checkForUpdates(); });
  }),
];

// The workspace switcher, driven by its buttons' language-independent focus
// keys. Surfaces run in order and share state: two workspaces are
// set up once, and later surfaces delete one.
const WORKSPACE_FILES = [...OVERLAY_FILES, 'src/renderer/workspace-ui.js'];
const openIslandPanel = async (ctx) => {
  // Reopen only once the previous surface's close has landed; otherwise the
  // late hide closes the freshly opened panel.
  const overlay = await overlayPage(ctx.app);
  await overlay.locator('#panelAnchor').waitFor({ state: 'hidden' });
  // Not a pill click: with a private tab active, the pill's centre is the
  // leave-private chip, which closes the tab.
  await ctx.chrome.evaluate(() => window.browserAPI.openIsland());
  await overlay.locator('#islandPanel').waitFor({ state: 'visible' });
  return overlay;
};
const openSwitcher = async (ctx) => {
  const overlay = await openIslandPanel(ctx);
  await overlay.locator('#footerWorkspace').click();
  await overlay.locator('#workspaceSwitcher').waitFor({ state: 'visible' });
  return overlay;
};
const switcherStep = (...steps) => async (ctx) => {
  const overlay = await openSwitcher(ctx);
  for (const [click, waitFor] of steps) {
    await overlay.locator(click).first().click();
    await overlay.locator(waitFor).first().waitFor({ state: 'visible' });
  }
  return overlay;
};
// Escape steps back one view at a time (editor, confirmation, decision) and
// finally closes the switcher, leaving no state for the next surface.
// The menu animates out for a moment after it closes, so the loop reads its
// hidden attribute rather than whether it is still painted.
const closeSwitcher = async (page) => {
  const menu = page.locator('#workspaceSwitcher');
  for (let i = 0; i < 5 && !(await menu.evaluate((el) => el.hidden)); i++) await page.keyboard.press('Escape');
  assert.equal(await menu.evaluate((el) => el.hidden), true, 'the workspace switcher closes');
  await menu.waitFor({ state: 'hidden' });
};
const editFirst = ['#workspaceSwitcher .ws-row-more', '#workspaceName'];
const WORKSPACE_SURFACES = [
  { name: 'workspace switcher (empty)', open: openSwitcher },
  {
    name: 'workspace switcher (list)',
    open: async (ctx) => {
      for (const name of ['zzz-ws-a', 'zzz-ws-b']) assert.equal((await callTestHook(ctx.app, 'workspaceAction', ['save', name])).ok, true);
      const overlay = await openSwitcher(ctx);
      await overlay.locator('#workspaceSwitcher .ws-row + .ws-row').waitFor();
      return overlay;
    },
  },
  { name: 'workspace editor (new)', open: switcherStep(['[data-focus-key="new"]', '#workspaceName']) },
  { name: 'workspace editor (edit)', open: switcherStep(editFirst) },
  { name: 'workspace colour picker', open: switcherStep(editFirst, ['[data-focus-key="color:custom"]', '.space-picker']) },
  {
    name: 'workspace switch decision',
    // A private page (a blank private start page doesn't count) in the bound
    // window makes switching ask first.
    open: async (ctx) => {
      await callTestHook(ctx.app, 'openTab', [`${permissionPageUrl}?private`, { private: true }]);
      // Opening a tab dismisses the overlay; reopen only once it has settled.
      await waitForValue(async () => (await callTestHook(ctx.app, 'state')).tabs.find((t) => t.private && !t.isLoading), Boolean, 'private page loaded');
      return switcherStep(['#workspaceSwitcher .ws-row-main:not(.on)', '.ws-decision'])(ctx);
    },
  },
  { name: 'workspace switcher (after delete)', open: switcherStep(editFirst, ['[data-focus-key="delete"]', '[data-focus-key="undo"]']) },
  { name: 'workspace recently deleted', open: switcherStep(['[data-focus-key="recently-deleted"]', '.ws-recovery']) },
  {
    name: 'workspace permanent delete confirmation',
    open: switcherStep(['[data-focus-key="recently-deleted"]', '.ws-recovery'], ['[data-focus-key^="forget:"]', '.ws-decision']),
  },
].map((surface) => ({ ...surface, files: WORKSPACE_FILES, close: closeSwitcher }));
WORKSPACE_SURFACES.push({
  name: 'workspace row context menu',
  files: ['src/main/workspace-context-menu-model.js'],
  native: async (ctx) => {
    const { items } = await callTestHook(ctx.app, 'workspaceAction', ['list']);
    const overlay = await openIslandPanel(ctx);
    await overlay.evaluate((id) => { window.__blancCtxWorkspaceId = id; }, items[0].id);
    const labels = await rightClick(ctx.app, 'blanc-chrome://overlay/', {});
    await overlay.evaluate(() => window.browserAPI.closeOverlay());
    return labels;
  },
});

// The start page in each layout (with the Customize popover open last), a
// private start page, and each step of the welcome tour.
const START_FILES = ['src/renderer/pages/newtab.html', 'src/renderer/pages/newtab.js', 'src/renderer/pages/onboarding.js'];
const startPage = async (app, url = 'blanc://newtab/') => {
  const page = await waitForValue(async () => (await app.windows()).find((p) => p.url() === url), Boolean, url);
  // A page can be found by URL before its body exists.
  await page.waitForFunction(() => document.body?.classList.contains('layout-ready'));
  return page;
};
const startLayout = (layout, { customize = false } = {}) => async ({ app }) => {
  const page = await startPage(app);
  await page.evaluate((name) => document.querySelector(`[data-layout-pick="${name}"]`).click(), layout);
  await page.waitForFunction((name) => document.body.dataset.layout === name, layout);
  if (customize) await page.evaluate(() => document.getElementById('customizePopover').showPopover());
  return page;
};
const tourStep = (step) => async ({ app, chrome }) => {
  let page = (await app.windows()).find((p) => p.url().startsWith('blanc://newtab/?tour'));
  if (!page) {
    await chrome.evaluate(() => window.browserAPI.createTab('blanc://newtab/?tour=1'));
    page = await findPage(app, 'blanc://newtab/?tour', 'welcome tour');
  }
  await page.locator('#onboardDialog').waitFor({ state: 'visible' });
  // Continue advances without importing or saving; the last step is never finished.
  for (let at = Number(await page.locator('#onboardDialog').getAttribute('data-step')); at < step; at++) {
    await page.locator('#obNext').click();
    await page.waitForFunction((next) => document.getElementById('onboardDialog').dataset.step === String(next), at + 1);
  }
  return page;
};
const START_SURFACES = [
  { name: 'start page (billboard)', open: startLayout('billboard') },
  { name: 'start page (ledger)', open: startLayout('ledger') },
  { name: 'start page (shelf)', open: startLayout('shelf') },
  { name: 'start page (tally, customize)', open: startLayout('tally', { customize: true }),
    close: (page) => page.evaluate(() => document.getElementById('customizePopover').hidePopover()) },
  {
    name: 'start page (private)',
    open: async ({ app }) => {
      await callTestHook(app, 'openTab', ['blanc://newtab/?private=1', { private: true }]);
      return startPage(app, 'blanc://newtab/?private=1');
    },
  },
  ...[0, 1, 2, 3, 4, 5].map((step) => ({ name: `welcome tour (step ${step + 1})`, open: tourStep(step) })),
].map((surface) => ({ ...surface, files: START_FILES }));

// The error page for a failed lookup (a real navigation), then the same tab
// as a certificate interstitial with its Advanced panel open.
const ERROR_FILES = ['src/renderer/pages/error.html', 'src/renderer/pages/error.js'];
const ERROR_SURFACES = [
  {
    name: 'error page',
    open: async ({ app, chrome }) => {
      await chrome.evaluate(() => window.browserAPI.createTab('https://blanc-sweep.invalid/'));
      return findPage(app, 'blanc://error/', 'error page');
    },
  },
  {
    name: 'error page (certificate)',
    open: async ({ app }) => {
      const query = new URLSearchParams({ kind: 'certificate', url: 'https://blanc-sweep.invalid/', continue: '1',
        subject: 'blanc-sweep.invalid', issuer: 'Sweep Fixture CA', validTo: String(Date.UTC(2030, 0, 1)) });
      await app.evaluate(({ webContents }, url) => webContents.getAllWebContents()
        .find((wc) => wc.getURL().startsWith('blanc://error/')).loadURL(url), `blanc://error/?${query}`);
      const page = await findPage(app, 'blanc://error/?kind=certificate', 'certificate page');
      await page.locator('.advanced-toggle').click();
      await page.locator('#continueUnsafe').waitFor({ state: 'visible' });
      return page;
    },
  },
].map((surface) => ({ ...surface, files: ERROR_FILES }));

// The Settings sheet, once its asynchronous sections (trust receipt, profiles,
// permissions) have rendered, then in states whose text only script writes.
const SETTINGS_FILES = ['src/renderer/pages/settings.html', 'src/renderer/pages/settings.js',
  'src/renderer/pages/settings-language-model.js', 'src/renderer/pages/settings-sync-setup-model.js',
  'src/renderer/pages/settings-verify-model.js'];
const openSettings = async ({ app, chrome }) => {
  await chrome.evaluate(() => window.browserAPI.createTab('blanc://settings/'));
  const page = await findPage(app, 'blanc://settings', 'settings sheet');
  await page.waitForFunction(() => {
    const ready = (id) => { const el = document.getElementById(id); return !el || el.children.length > 0; };
    return document.getElementById('trustReceiptList')?.hidden !== true && ready('profilesList') && ready('permissionList');
  });
  return page;
};
const settingsStep = (step) => async (ctx) => {
  const page = await openSettings(ctx);
  await step(page);
  return page;
};
const SETTINGS_SURFACES = [
  { name: 'settings', open: openSettings },
  {
    name: 'settings (sync setup, add this device with a code)',
    open: settingsStep(async (page) => {
      await page.locator('#syncPathCode').click();
      await page.locator('#syncCodeForm').waitFor({ state: 'visible' });
    }),
  },
  {
    name: 'settings (sync setup, joining with name and passphrase)',
    open: settingsStep(async (page) => {
      await page.locator('#syncPathCode').click();
      await page.locator('#syncUsePassphrase').click();
      await page.locator('#syncForm').waitFor({ state: 'visible' });
    }),
  },
  {
    name: 'settings (mouse gestures)',
    open: settingsStep(async (page) => {
      await page.evaluate(() => { const box = document.getElementById('mouseGesturesEnabled'); if (!box.checked) box.click(); });
      await page.locator('#mouseGestureAdd').click();
      await page.locator('#mouseGestureComposer').waitFor({ state: 'visible' });
    }),
  },
].map((surface) => ({ ...surface, files: SETTINGS_FILES }));

// The Favorites, History, Downloads and Shortcuts sheets. Favorites shows its
// empty state, then a favorite filed in a folder with the folder picker open.
const UTILITY_FILES = ['src/renderer/pages/sheet.js', 'src/renderer/pages/row-icon.js'];
const openSheet = async ({ app, chrome }, name, ready) => {
  await chrome.evaluate((url) => window.browserAPI.createTab(url), `blanc://${name}/`);
  const page = await findPage(app, `blanc://${name}/`, `${name} sheet`);
  await page.waitForFunction(ready);
  return page;
};
const UTILITY_SURFACES = [
  {
    name: 'favorites (empty)',
    files: ['src/renderer/pages/bookmarks.html', 'src/renderer/pages/bookmarks.js', ...UTILITY_FILES],
    open: (ctx) => openSheet(ctx, 'bookmarks', () => document.querySelector('#list .empty')),
  },
  {
    name: 'favorites (folder picker)',
    files: ['src/renderer/pages/bookmarks.html', 'src/renderer/pages/bookmarks.js', ...UTILITY_FILES],
    open: async (ctx) => {
      const id = await callTestHook(ctx.app, 'openTab', [permissionPageUrl]);
      await waitForValue(async () => (await callTestHook(ctx.app, 'state')).tabs.find((t) => t.id === id && !t.isLoading), Boolean, 'page to favorite');
      await callTestHook(ctx.app, 'favoriteActive');
      const page = await openSheet(ctx, 'bookmarks', () => document.querySelector('#list .row'));
      await page.evaluate(async () => {
        const [first] = await window.bowserPages.bookmarks.list();
        await window.bowserPages.bookmarks.setFolder(first.id, 'zzz-folder');
      });
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.folder-section .folder-actions'));
      await page.locator('.folder-chip').first().click();
      await page.locator('.folder-picker').waitFor({ state: 'visible' });
      return page;
    },
    close: (page) => page.keyboard.press('Escape'),
  },
  {
    name: 'history',
    files: ['src/renderer/pages/history.html', 'src/renderer/pages/history.js', 'src/renderer/pages/history-groups.js', ...UTILITY_FILES],
    open: async (ctx) => {
      await callTestHook(ctx.app, 'seedHistory');
      return openSheet(ctx, 'history', () => document.querySelector('#list .day-heading'));
    },
  },
  {
    name: 'history (no matches)',
    files: ['src/renderer/pages/history.html', 'src/renderer/pages/history.js', ...UTILITY_FILES],
    open: async (ctx) => {
      const page = await openSheet(ctx, 'history', () => document.querySelector('#list .day-heading'));
      await page.locator('#search').fill('zzz-no-such-page');
      await page.waitForFunction(() => document.querySelector('#list .empty'));
      return page;
    },
  },
  {
    name: 'downloads',
    files: ['src/renderer/pages/downloads.html', 'src/renderer/pages/downloads.js', 'src/renderer/pages/downloads-row-model.js', ...UTILITY_FILES],
    open: (ctx) => openSheet(ctx, 'downloads', () => document.querySelector('#list .empty, #list .row')),
  },
  {
    name: 'shortcuts',
    files: ['src/renderer/pages/shortcuts.html', 'src/renderer/pages/shortcuts.js', ...UTILITY_FILES],
    open: (ctx) => openSheet(ctx, 'shortcuts', () => document.querySelectorAll('.shortcut-section').length > 1),
  },
];

// Bring Your Tabs through its four steps, reading a fixture Chrome profile
// (BLANC_TEST_BROWSER_HOME below), and the tab handoff page with no handoff.
const TAB_IMPORT_FILES = ['src/renderer/pages/tab-import.html', 'src/renderer/pages/tab-import-open-tabs.js', 'src/renderer/pages/sheet.js'];
const importStep = (name, ...clicks) => ({
  name,
  files: TAB_IMPORT_FILES,
  open: async (ctx) => {
    let page = (await ctx.app.windows()).find((p) => p.url().startsWith('blanc://tab-import/'));
    if (!page) {
      // The page's own route (as /bring-tabs opens it), so main treats it as
      // the window's current sheet when a profile is read.
      await callTestHook(ctx.app, 'openTabImport');
      page = await findPage(ctx.app, 'blanc://tab-import/', 'Bring Your Tabs');
      await page.waitForFunction(() => document.querySelector('.tab-import-source-btn'));
    }
    for (const [click, panel] of clicks) {
      await page.locator(click).first().click();
      await page.locator(`[data-step-panel="${panel}"]`).waitFor({ state: 'visible' });
    }
    return page;
  },
});
const TAB_IMPORT_SURFACES = [
  importStep('bring your tabs (browser)'),
  importStep('bring your tabs (tabs)', ['.tab-import-source-btn', 'tabs']),
  importStep('bring your tabs (organize)', ['#tabImportContinueToOrganize', 'organize']),
  importStep('bring your tabs (review)', ['#tabImportContinueToReview', 'review']),
  {
    name: 'tab handoff (unavailable)',
    files: ['src/renderer/pages/tab-handoff.html', 'src/renderer/pages/tab-handoff.js', 'src/renderer/pages/sheet.js'],
    open: (ctx) => openSheet(ctx, 'tab-handoff', () => !document.getElementById('error').hidden),
  },
];

// Mahjong: the table as dealt (Daily Burst by default), then its Boards and
// Records sheets.
const MAHJONG_FILES = ['src/renderer/pages/mahjong.html', 'src/renderer/pages/mahjong.js',
  'src/renderer/pages/mahjong-state.js', 'src/renderer/pages/mahjong-engine.js', 'src/renderer/pages/mahjong-sound.js'];
const mahjongPage = async ({ app, chrome }) => {
  let page = (await app.windows()).find((p) => p.url().startsWith('blanc://mahjong/'));
  if (!page) {
    await chrome.evaluate(() => window.browserAPI.createTab('blanc://mahjong/'));
    page = await findPage(app, 'blanc://mahjong/', 'mahjong');
  }
  await page.waitForFunction(() => document.querySelectorAll('#mjBoard .mj-tile').length > 0);
  return page;
};
const mahjongSheet = (button, sheet) => async (ctx) => {
  const page = await mahjongPage(ctx);
  await page.locator(button).click();
  await page.locator(sheet).waitFor({ state: 'visible' });
  return page;
};
const MAHJONG_SURFACES = [
  { name: 'mahjong', open: mahjongPage },
  { name: 'mahjong (boards)', open: mahjongSheet('#mjSetup', '#mjSetupSheet'), close: (page) => page.locator('#mjSetupClose').click() },
  { name: 'mahjong (records)', open: mahjongSheet('#mjRecords', '#mjRecordsSheet'), close: (page) => page.locator('#mjRecordsClose').click() },
].map((surface) => ({ ...surface, files: MAHJONG_FILES }));

// Every visible footer button stays inside the footer and clear of the others
// with the longest labels (spec 2026-10-16-island-lower-section §5).
const footerProblems = (page) => page.evaluate(() => {
  const footer = document.getElementById('islandFooter').getBoundingClientRect();
  const rects = [...document.querySelectorAll('#islandFooter button')].filter((button) => !button.hidden)
    .map((button) => ({ id: button.id, rect: button.getBoundingClientRect() }));
  const problems = [];
  for (const { id, rect } of rects) {
    if (rect.left < footer.left - 1 || rect.right > footer.right + 1 || rect.top < footer.top - 1 || rect.bottom > footer.bottom + 1) {
      problems.push(`${id} leaves the footer`);
    }
  }
  for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
    const a = rects[i].rect; const b = rects[j].rect;
    if (!(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1)) {
      problems.push(`${rects[i].id} overlaps ${rects[j].id}`);
    }
  }
  return problems;
});

const SURFACES = [
  {
    name: 'island panel (tab list)',
    files: OVERLAY_FILES,
    open: openPanel,
  },
  {
    name: 'island panel (footer and Other devices drawer)',
    files: OVERLAY_FILES,
    open: async (ctx) => {
      const overlay = await openPanel(ctx);
      // Opening reloads devices from the real (disabled) sync cache first.
      await new Promise((resolve) => setTimeout(resolve, 150));
      await callTestHook(ctx.app, 'injectRemoteDevices');
      await overlay.locator('#footerDevices').waitFor({ state: 'visible' });
      await overlay.locator('#footerDevices').click();
      await overlay.locator('#islandDrawer').waitFor({ state: 'visible' });
      assert.deepEqual(await footerProblems(overlay), [], 'the footer holds its pseudo-locale labels on one line');
      return overlay;
    },
  },
  {
    name: 'island panel (slash commands)',
    files: OVERLAY_FILES,
    open: typeInPanel('/', () => document.querySelectorAll('#islandList .island-row').length > 5),
  },
  {
    name: 'island panel (quick switcher)',
    files: OVERLAY_FILES,
    // A group result (its tab count is interface text) and the exact-search
    // row, whose tag is the fallback label: suggestions are off in this profile.
    open: async (ctx) => {
      const { activeTabId } = await callTestHook(ctx.app, 'state');
      await ctx.chrome.evaluate((id) => window.browserAPI.groupTabByName(id, 'zzzqqq-group'), activeTabId);
      const page = await typeInPanel('zzzqqq', () => document.querySelectorAll('#islandList .island-row').length > 1)(ctx);
      return page;
    },
  },
  {
    name: 'find bar',
    files: OVERLAY_FILES,
    open: async ({ app, chrome }) => {
      await chrome.evaluate(() => window.browserAPI.openFindBar());
      const overlay = await overlayPage(app);
      await overlay.locator('#findBar').waitFor({ state: 'visible' });
      return overlay;
    },
  },
  {
    name: 'glance picker',
    files: OVERLAY_FILES,
    open: async ({ app, chrome }) => {
      await chrome.evaluate(() => window.browserAPI.createTab('blanc://newtab/'));
      await chrome.evaluate(() => window.browserAPI.openGlancePicker());
      const overlay = await overlayPage(app);
      await overlay.locator('#glancePicker').waitFor({ state: 'visible' });
      return overlay;
    },
  },
  {
    name: 'permission prompt',
    files: ['src/renderer/permission.html', 'src/renderer/permission.js'],
    open: async ({ app, chrome }) => {
      await chrome.evaluate((url) => window.browserAPI.createTab(url), permissionPageUrl);
      const page = await findPage(app, permissionPageUrl, 'permission fixture');
      await page.waitForLoadState('domcontentloaded');
      await page.evaluate(() => { navigator.geolocation.getCurrentPosition(() => {}, () => {}); });
      const prompt = await findPage(app, 'blanc-chrome://permission/', 'permission prompt');
      await prompt.locator('#permissionBar').waitFor({ state: 'visible' });
      return prompt;
    },
  },
  {
    name: 'fill capsule (decision)',
    files: ['src/renderer/fill-status.html', 'src/renderer/fill-status.js', 'src/renderer/fill-status-copy.js'],
    open: fillSurface('confirm-heuristic'),
  },
  {
    name: 'fill capsule (notice)',
    files: ['src/renderer/fill-status.html', 'src/renderer/fill-status.js', 'src/renderer/fill-status-copy.js'],
    open: fillSurface('no-match'),
  },
  {
    name: 'chrome strip',
    files: CHROME_FILES,
    open: ({ chrome }) => chrome,
  },
  {
    name: 'vertical tabs rail',
    files: CHROME_FILES,
    open: async ({ chrome }) => {
      await chrome.evaluate(() => window.browserAPI.setTabLayout('vertical'));
      await chrome.waitForFunction(() => !document.getElementById('verticalTabsRail').hidden);
      return chrome;
    },
  },
  {
    name: 'shield popover',
    files: [...OVERLAY_FILES, 'src/main/shield-model.js'],
    open: async ({ app, chrome }) => {
      await chrome.locator('#pillShield').click();
      const overlay = await overlayPage(app);
      await overlay.locator('#shieldPop').waitFor({ state: 'visible' });
      return overlay;
    },
  },
  ...NATIVE_MENU_SURFACES,
  ...NATIVE_DIALOG_SURFACES,
  ...WORKSPACE_SURFACES,
  ...START_SURFACES,
  ...ERROR_SURFACES,
  ...SETTINGS_SURFACES,
  ...UTILITY_SURFACES,
  ...TAB_IMPORT_SURFACES,
  ...MAHJONG_SURFACES,
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-pseudo-sweep-'));
const profile = path.join(root, 'profile');
fs.mkdirSync(`${profile}-Dev`);
fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1, adblockEnabled: false, usagePing: false,
  searchSuggestions: false, uiLanguage: 'en-XA',
}));
// A throwaway Chrome profile with one saved window for Bring Your Tabs.
const browserHome = path.join(root, 'browser-home');
const chromeRoot = browserImport.browserDataRoot('chrome', {
  platform: process.platform, homeDir: browserHome, env: { ...process.env, LOCALAPPDATA: browserHome },
});
fs.mkdirSync(path.join(chromeRoot, 'Default', 'Sessions'), { recursive: true });
fs.writeFileSync(path.join(chromeRoot, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'zzz-profile' } } } }));
fs.writeFileSync(path.join(chromeRoot, 'Default', 'Sessions', 'Session_100'), sessionFixture.createChromiumSession({
  activeWindowId: 10,
  windows: [{
    id: 10,
    tabs: [
      { id: 101, url: 'https://hotels.example/stay', title: 'zzz-hotels', groupName: 'zzz-travel' },
      { id: 102, url: 'https://flights.example/search', title: 'zzz-flights', groupName: 'zzz-travel', pinned: true },
      { id: 103, url: 'https://reading.example/', title: 'zzz-reading' },
      { id: 104, url: 'chrome://settings/', title: 'zzz-settings' },
    ],
  }],
}));
const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env;
let app;
const failures = [];
try {
  app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${profile}`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_LOCALE_STATUS: 'en-XA=selectable', BLANC_TEST_BROWSER_HOME: browserHome, BLANC_TEST_UNCAUGHT_LOG: path.join(root, 'uncaught.log') } });
  const chrome = await findPage(app, 'blanc-chrome://index/', 'chrome strip');
  // Startup opens the first tab, which would close a sheet opened before it.
  await waitForValue(() => app.evaluate(() => globalThis.__blanc?.startupReady?.() === true), Boolean, 'startup');
  const state = await app.evaluate(() => globalThis.__blanc.i18nState());
  assert.equal(state.locale, 'en-XA', 'the sweep runs in the pseudo-locale');
  for (const surface of SURFACES) {
    const pending = surface.files.filter((f) => scope[f]?.state !== 'guarded');
    if (pending.length && !includePending) { console.log(`skip ${surface.name} (pending: ${pending.join(', ')})`); continue; }
    if (surface.native) {
      const entries = await surface.native({ app, chrome });
      if (!entries) { console.log(`skip ${surface.name} (not available on this platform)`); continue; }
      assert.ok(entries.length, `${surface.name}: recorded no menu items`);
      const offending = classifyTextEntries(entries, { allow, allowPatterns });
      if (offending.length) failures.push(`${surface.name}:\n    ${offending.join('\n    ')}`);
      else console.log(`ok   ${surface.name}`);
      continue;
    }
    const page = await surface.open({ app, chrome });
    if (!page) { console.log(`skip ${surface.name} (not available on this platform)`); continue; }
    for (const { selector, files } of surface.pendingText ?? []) {
      const waiting = files.filter((f) => scope[f]?.state !== 'guarded');
      if (!waiting.length) continue;
      console.log(`     ${surface.name}: ${selector} exempt until ${waiting.join(', ')} is guarded`);
      await page.evaluate((sel) => { for (const el of document.querySelectorAll(sel)) el.dataset.i18nIgnore = ''; }, selector);
    }
    await page.waitForLoadState('domcontentloaded');
    const offending = classifyTextEntries(await page.evaluate(`(() => {${COLLECT}})()`), { allow, allowPatterns });
    await surface.close?.(page);
    if (page.url() === 'blanc-chrome://overlay/') await page.evaluate(() => window.browserAPI.closeOverlay()).catch(() => {});
    if (offending.length) failures.push(`${surface.name}:\n    ${offending.join('\n    ')}`);
    else console.log(`ok   ${surface.name}`);
  }
} finally {
  server.close();
  await app?.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
}
if (failures.length) {
  console.error(`Untranslated text in the pseudo-locale:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('i18n pseudo sweep OK');
