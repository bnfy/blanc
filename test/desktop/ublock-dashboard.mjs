// Native UI regression suite for Blanc's presentation of the original uBO Dashboard.
// Real blocking remains enabled; settings/editors are exercised through native handlers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import testCalls from './support/test-hook-call.js';
const { waitForValue } = poll;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ubo-dashboard-'));
fs.mkdirSync(dir + '-Dev');
fs.writeFileSync(path.join(dir + '-Dev', 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockProvider: 'ublock-origin', adblockEnabled: true,
  searchSuggestions: false, usagePing: false, onePasswordEnabled: false, theme: 'light',
}));
const hits = [];
const server = http.createServer((request, response) => {
  hits.push(request.url);
  if (request.url.endsWith('.js')) { response.setHeader('Content-Type', 'application/javascript'); response.end('window.dashboardAllowed=true;'); return; }
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Dashboard fixture</title><script src="/dashboard-blocked.js"></script><script src="/allowed.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const fixture = `http://127.0.0.1:${server.address().port}/`;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
void ignored;
let electron;
let stage = 'startup';
const errors = [];
const watchdog = setTimeout(() => { console.error('Dashboard suite exceeded 120 seconds at ' + stage); electron?.process().kill('SIGKILL'); }, 120000);
async function launch() {
  electron = await _electron.launch({
    ...(process.env.BLANC_UBLOCK_ELECTRON ? { executablePath: process.env.BLANC_UBLOCK_ELECTRON } : {}),
    args: [path.resolve('.'), `--user-data-dir=${dir}`], chromiumSandbox: true, colorScheme: null,
    env: { ...env, BLANC_TEST: '1', BLANC_UBLOCK_TEST: '1' }, timeout: 30000,
  });
  electron.context().setDefaultTimeout(8000);
  electron.context().on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await electron.firstWindow();
  await waitForValue(() => call('startupReady'), Boolean, 'browser restore ready', 20000);
  await waitForValue(() => call('blockingStatus'), status => status.phase === 'ready', 'real uBO ready', 20000);
}
const call = (method, ...args) => testCalls.callTestHook(electron, method, args);
let dashboard;
async function openDashboard() {
  await call('blockingOpen', 'dashboard');
  dashboard = await waitForValue(async () => (await electron.windows()).find(page => page.url().includes('/dashboard.html')), Boolean, 'Dashboard');
  await call('focusWindow');
  await dashboard.locator('.tabButton.selected').waitFor();
  // The restored last pane can still be loading after the outer tab becomes visible.
  await dashboard.frameLocator('#iframe').locator('#blancPaneHeader h1').waitFor();
  await dashboard.frameLocator('#iframe').locator('#blancPaneHeader h1').evaluate(node => node.ownerDocument.fonts.ready);
}
async function select(pane) {
  await dashboard.locator(`[data-pane="${pane}"]`).click();
  const frame = await waitForValue(async () => dashboard.frames().find(item => item.url().endsWith('/' + pane)), Boolean, pane);
  await frame.locator('#blancPaneHeader h1').waitFor();
  await frame.waitForFunction(() => document.querySelector('#blancPaneHeader h1').textContent.length > 0);
  if (pane === '1p-filters.html') {
    // Upstream starts with enabled=true but an unchecked DOM input. Its dirty
    // guard remains true until the asynchronous readUserFilters reply hydrates
    // and remembers the editor. The presentation heading appears earlier.
    await frame.waitForFunction(() => typeof self.hasUnsavedData === 'function' && self.hasUnsavedData() === false);
  }
  return frame;
}
async function noOverflow(frame) {
  assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, frame.url());
}
try {
  await launch();
  await openDashboard();
  stage = 'native Settings';
  let settings = await select('settings.html');
  await waitForValue(() => settings.locator('[data-setting-name="cloudStorageEnabled"]').isDisabled(), Boolean, 'unsupported cloud');
  assert.equal(await settings.locator('[data-setting-name="prefetchingDisabled"]').isDisabled(), true);
  const menu = settings.locator('[data-setting-name="contextMenuEnabled"]');
  const beforeMenu = await menu.isChecked();
  await menu.setChecked(!beforeMenu);
  // Theme controls still propagate to the outer Dashboard and survive navigation.
  await settings.locator('[data-setting-name="uiTheme"]').selectOption('dark');
  await dashboard.locator('html.dark').waitFor();
  await settings.locator('[data-setting-name="uiTheme"]').selectOption('light');
  await dashboard.locator('html.light').waitFor();
  stage = 'native lists and keyboard';
  let lists = await select('3p-filters.html');
  await lists.locator('[data-key="easylist"] input').waitFor();
  assert.equal(await lists.locator('#blancListOptions input').count(), 4);
  const initialAuto = await lists.locator('#autoUpdate').isChecked();
  await lists.locator('#autoUpdate').setChecked(!initialAuto);
  await lists.locator('input[type="search"]').fill('EasyPrivacy');
  await lists.locator('#lists.searchMode').waitFor();
  assert.equal(await lists.locator('[data-key="easyprivacy"]').isVisible(), true);
  assert.equal(await lists.locator('[data-key="easylist"]').isVisible(), false);
  await lists.locator('input[type="search"]').fill('');
  const importExpander = lists.locator('[data-role="import"] .listExpander');
  await importExpander.press('Enter');
  await lists.locator('[data-role="import"].expanded textarea').waitFor();
  assert.equal(await importExpander.getAttribute('aria-expanded'), 'true');
  await importExpander.press('Space');
  assert.equal(await lists.locator('[data-role="import"] textarea').isVisible(), false);
  // Native list change + revert must keep the selected list and apply button correct.
  const easylist = lists.locator('[data-key="easylist"] input');
  await easylist.uncheck();
  await lists.locator('#buttonApply:not(.disabled)').waitFor();
  await easylist.check();
  await lists.locator('#buttonApply.disabled').waitFor();
  await noOverflow(lists);
  // Arrow navigation runs the original tab click handler.
  await dashboard.locator('[data-pane="3p-filters.html"]').press('ArrowRight');
  let filters = await waitForValue(async () => dashboard.frames().find(frame => frame.url().endsWith('/1p-filters.html')), Boolean, 'keyboard My filters');
  await filters.locator('.CodeMirror').waitFor();
  await filters.waitForFunction(() => typeof self.hasUnsavedData === 'function' && self.hasUnsavedData() === false);
  stage = 'native editor and unsaved guard';
  // Real input into the existing CodeMirror, not a substitute textarea/editor.
  await filters.locator('.CodeMirror').click();
  await filters.locator('.CodeMirror textarea').press('ControlOrMeta+End');
  await filters.locator('.CodeMirror textarea').press('Enter');
  await dashboard.keyboard.insertText('/dashboard-blocked.js$script');
  await filters.locator('#userFiltersApply:not([disabled])').waitFor();
  await dashboard.locator('[data-pane="settings.html"]').click();
  await dashboard.locator('#unsavedWarning.on').waitFor();
  await dashboard.locator('[data-i18n="dashboardUnsavedWarningStay"]').click();
  assert(filters.url().endsWith('/1p-filters.html'));
  await filters.locator('#userFiltersApply').click();
  await waitForValue(() => filters.locator('#userFiltersApply').isDisabled(), Boolean, 'native filters applied');
  settings = await select('settings.html');
  assert.equal(await settings.locator('[data-setting-name="contextMenuEnabled"]').isChecked(), !beforeMenu);
  lists = await select('3p-filters.html');
  assert.equal(await lists.locator('#autoUpdate').isChecked(), !initialAuto);
  await lists.locator('#autoUpdate').setChecked(initialAuto);
  stage = 'wide and narrow panels';
  for (const pane of ['1p-filters.html', 'dyna-rules.html', 'whitelist.html', 'support.html', 'about.html']) {
    const frame = await select(pane);
    await noOverflow(frame);
    if (pane === 'support.html') {
      await frame.locator('.CodeMirror').waitFor();
      assert.equal(await frame.evaluate(() => scrollY), 0, 'Support opens at its heading');
    }
  }
  await call('setWindowContentSize', 720, 900);
  for (const pane of ['settings.html', '3p-filters.html', '1p-filters.html', 'dyna-rules.html', 'whitelist.html', 'support.html', 'about.html']) await noOverflow(await select(pane));
  lists = await select('3p-filters.html');
  const positions = await lists.evaluate(() => ({ left: document.getElementById('blancListOptions').getBoundingClientRect().toJSON(), right: document.getElementById('blancSubscriptions').getBoundingClientRect().toJSON() }));
  assert(positions.right.y > positions.left.y + positions.left.height, 'List options stack above subscriptions in small windows');
  // Taller editor toolbars must remain reachable in short desktop windows.
  await call('setWindowContentSize', 720, 600);
  const shortRules = await select('dyna-rules.html');
  await shortRules.locator('.CodeMirror').first().waitFor();
  const shortLayout = await shortRules.evaluate(() => ({ overflow: getComputedStyle(document.body).overflowY, needed: document.body.scrollHeight > document.body.clientHeight }));
  assert(!shortLayout.needed || ['auto', 'scroll'].includes(shortLayout.overflow), 'editor toolbar and editor remain scrollable in short windows');
  stage = 'real request decisions and restart persistence';
  await call('openTab', fixture);
  let page = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture), Boolean, 'fixture');
  await page.waitForFunction(() => window.dashboardAllowed === true);
  assert(!hits.includes('/dashboard-blocked.js'), 'native filter blocks before the server');
  await electron.close();
  await launch();
  await openDashboard();
  settings = await select('settings.html');
  assert.equal(await settings.locator('[data-setting-name="contextMenuEnabled"]').isChecked(), !beforeMenu);
  filters = await select('1p-filters.html');
  await filters.locator('.CodeMirror').waitFor();
  assert.match(await filters.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue()), /dashboard-blocked\.js/);
  await call('openTab', fixture + '?after-restart');
  page = await waitForValue(async () => (await electron.windows()).find(item => item.url() === fixture + '?after-restart'), Boolean, 'persisted fixture');
  await page.waitForFunction(() => window.dashboardAllowed === true);
  assert(!hits.includes('/dashboard-blocked.js'));
  assert.deepEqual(errors, [], 'no uncaught Dashboard UI errors');
  console.log('uBO Dashboard passed: native settings/themes, lists/search/keyboard, editor/unsaved guard, all panels/narrow layout, real blocking and restart persistence.');
} catch (error) {
  console.error('Dashboard failure at ' + stage);
  if (dashboard) console.error('Dashboard state:', await dashboard.evaluate(() => ({
    selected: document.querySelector('.tabButton.selected')?.dataset.pane,
    unsavedWarning: document.getElementById('unsavedWarning')?.classList.contains('on'),
    pane: document.getElementById('iframe')?.contentWindow.location.pathname,
    dirty: document.getElementById('iframe')?.contentWindow.hasUnsavedData?.(),
  })).catch(() => null));
  throw error;
}
finally { clearTimeout(watchdog); await electron?.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(dir + '-Dev', { recursive: true, force: true }); }
