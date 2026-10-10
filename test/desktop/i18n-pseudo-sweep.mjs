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

const { waitForValue } = poll;
const { classifyTextEntries, COLLECT } = sweep;
const { callTestHook } = testHookCall;
const includePending = process.argv.includes('--include-pending');
const scope = JSON.parse(fs.readFileSync('copy/i18n-scope.json', 'utf8')).files;
const allow = ['Blanc', 'Blanc Blocker', 'Blanc Patron', 'Patron', 'uBlock Origin', '1Password'];
// Fixed terms by pattern: slash command names are never translated.
const allowPatterns = [/^\/[a-z0-9][a-z0-9-]*$/];

const findPage = (app, prefix, label) =>
  waitForValue(async () => (await app.windows()).find((p) => p.url().startsWith(prefix)), Boolean, label);

// Each extraction phase adds its surfaces here (Phase recipe, step 7).
const CHROME_FILES = ['src/renderer/index.html', 'src/renderer/renderer.js', 'src/renderer/vertical-tabs.js', 'src/renderer/tab-drag.js'];
// Elements whose text another, still-pending file writes (main-computed text,
// or a renderer module converted in a later phase). They are exempt only while
// that file is pending; once it is guarded, they are checked like everything else.
const SHIELD_TEXT = { selector: '#pillShield', files: ['src/main/shield-model.js'] };
// The panel's site-information button is titled by main (site-security.js).
const SITE_INFO_TEXT = { selector: '#panelSiteInfo', files: ['src/main/site-security.js'] };
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
// are tab-group names, which are data); a right-click is a real context-menu
// event sent to the webContents (an id, or a URL prefix).
const recordMenus = (app) => app.evaluate(({ Menu }) => {
  if (globalThis.__sweepMenus) return;
  globalThis.__sweepMenus = [];
  const entries = (menu) => menu.items.flatMap((item) => (item.type === 'separator' || !item.visible ? [] : [
    { text: item.label, ignored: item.type === 'radio' }, ...(item.submenu ? entries(item.submenu) : []),
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
const NATIVE_MENU_SURFACES = [
  {
    name: 'page context menus',
    files: ['src/main/context-menu.js'],
    native: async ({ app }) => {
      const { activeTabId, tabs } = await callTestHook(app, 'state');
      const id = tabs.find((t) => t.id === activeTabId).webContentsId;
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
    name: 'Dock menu',
    files: ['src/main/dock-menu.js'],
    // macOS only. Its top line is the active tab's title, which is data.
    native: ({ app }) => app.evaluate(({ app: electronApp }) => electronApp.dock?.getMenu?.()?.items
      .filter((item) => item.visible && item.type !== 'separator')
      .map((item) => ({ text: item.label, ignored: item.id === 'active-tab' })) ?? null),
  },
];

// The workspace switcher, driven by its buttons' language-independent focus
// keys. Surfaces run in order and share state: Patron and two workspaces are
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
const closeSwitcher = async (page) => {
  for (let i = 0; i < 5 && await page.locator('#workspaceSwitcher').isVisible(); i++) await page.keyboard.press('Escape');
  assert.equal(await page.locator('#workspaceSwitcher').isVisible(), false, 'the workspace switcher closes');
};
const manageFirst = ['#workspaceSwitcher .ws-manage-button', '#workspaceSwitcher [data-focus-key="rename"]'];
const WORKSPACE_SURFACES = [
  { name: 'workspace switcher (without Patron)', open: openSwitcher },
  {
    name: 'workspace switcher (list)',
    open: async (ctx) => {
      await callTestHook(ctx.app, 'workspacePatron');
      for (const name of ['zzz-ws-a', 'zzz-ws-b']) assert.equal((await callTestHook(ctx.app, 'workspaceAction', ['save', name])).ok, true);
      const overlay = await openSwitcher(ctx);
      await overlay.locator('#workspaceSwitcher .ws-managed-row + .ws-managed-row').waitFor();
      return overlay;
    },
  },
  { name: 'workspace editor', open: switcherStep(['#wsSwitcherNew', '#workspaceName']) },
  { name: 'workspace management', open: switcherStep(manageFirst) },
  {
    name: 'workspace switch decision',
    // A private page (a blank private start page doesn't count) in the bound
    // window makes switching ask first.
    open: async (ctx) => {
      await callTestHook(ctx.app, 'openTab', [`${permissionPageUrl}?private`, { private: true }]);
      // Opening a tab dismisses the overlay; reopen only once it has settled.
      await waitForValue(async () => (await callTestHook(ctx.app, 'state')).tabs.find((t) => t.private && !t.isLoading), Boolean, 'private page loaded');
      return switcherStep(['#workspaceSwitcher .ws-switcher-row:not(.on)', '.ws-switcher-confirm'])(ctx);
    },
  },
  {
    name: 'workspace delete confirmation',
    open: switcherStep(manageFirst, ['[data-focus-key="delete"]', '[data-focus-key="delete-workspace"]']),
  },
  {
    name: 'workspace switcher (after delete)',
    open: switcherStep(manageFirst, ['[data-focus-key="delete"]', '[data-focus-key="delete-workspace"]'],
      ['[data-focus-key="delete-workspace"]', '[data-focus-key="undo"]']),
  },
  { name: 'workspace recently deleted', open: switcherStep(['[data-focus-key="recently-deleted"]', '.ws-recovery']) },
  {
    name: 'workspace permanent delete confirmation',
    open: switcherStep(['[data-focus-key="recently-deleted"]', '.ws-recovery'], ['[data-focus-key^="forget:"]', '.ws-switcher-confirm']),
  },
].map((surface) => ({ ...surface, files: WORKSPACE_FILES, pendingText: [SITE_INFO_TEXT], close: closeSwitcher }));
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

const SURFACES = [
  {
    name: 'island panel (tab list)',
    files: OVERLAY_FILES,
    open: openPanel,
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
    pendingText: [SHIELD_TEXT],
    open: ({ chrome }) => chrome,
  },
  {
    name: 'vertical tabs rail',
    files: CHROME_FILES,
    pendingText: [SHIELD_TEXT],
    open: async ({ chrome }) => {
      await chrome.evaluate(() => window.browserAPI.setTabLayout('vertical'));
      await chrome.waitForFunction(() => !document.getElementById('verticalTabsRail').hidden);
      return chrome;
    },
  },
  ...NATIVE_MENU_SURFACES,
  ...WORKSPACE_SURFACES,
  {
    name: 'start page',
    files: ['src/renderer/pages/newtab.html', 'src/renderer/pages/newtab.js', 'src/renderer/pages/onboarding.js'],
    open: ({ app }) => findPage(app, 'blanc://newtab/', 'new tab'),
  },
  {
    name: 'settings',
    files: ['src/renderer/pages/settings.html', 'src/renderer/pages/settings.js', 'src/renderer/pages/settings-language-model.js'],
    open: async ({ app, chrome }) => {
      await chrome.evaluate(() => window.browserAPI.createTab('blanc://settings/'));
      return findPage(app, 'blanc://settings', 'settings sheet');
    },
  },
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-pseudo-sweep-'));
const profile = path.join(root, 'profile');
fs.mkdirSync(`${profile}-Dev`);
fs.writeFileSync(path.join(`${profile}-Dev`, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, presentationDefaultsResetVersion: 1, adblockEnabled: false, usagePing: false,
  searchSuggestions: false, uiLanguage: 'en-XA',
}));
const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env;
let app;
const failures = [];
try {
  app = await _electron.launch({ chromiumSandbox: true, args: [path.resolve('.'), `--user-data-dir=${profile}`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_LOCALE_STATUS: 'en-XA=selectable', BLANC_TEST_UNCAUGHT_LOG: path.join(root, 'uncaught.log') } });
  const chrome = await findPage(app, 'blanc-chrome://index/', 'chrome strip');
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
