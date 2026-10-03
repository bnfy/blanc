import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { _electron } from 'playwright';
import hook from './support/test-hook-call.js';
import polling from './support/poll.js';
import runtime from '../../scripts/preflight-electron-runtime.js';
const { callTestHook: call } = hook;
const { waitForValue: wait } = polling;
const expected = runtime.verifyElectronRuntime().locked;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-shortcuts-'));
const userData = path.join(root, 'profile');
fs.mkdirSync(`${userData}-Dev`);
fs.writeFileSync(path.join(`${userData}-Dev`, 'settings.json'), JSON.stringify({ onboardingVersion: 1, adblockEnabled: false, searchSuggestions: false, usagePing: false }));
const uncaught = path.join(root, 'uncaught.log');
const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><title>Shortcut fixture</title><input id="typing"><a href="/next">Next</a>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
void ignored;
let app;
let steps = 0;
const press = async (command, key, modifiers, surface = 'active') => {
  const before = (await call(app, 'browserCommandState')).deliveries.length;
  await app.evaluate(({ Menu, webContents, BrowserWindow }, { command, key, modifiers, surface }) => {
    const windows = BrowserWindow.getAllWindows();
    const window = surface === 'otherChrome' ? windows.filter(candidate => candidate.webContents.getURL() === 'blanc-chrome://index/').sort((a, b) => a.id - b.id).at(-1)
      : windows.find(candidate => candidate.webContents.getURL() === 'blanc-chrome://index/');
    if (process.platform === 'darwin') {
      const item = Menu.getApplicationMenu().getMenuItemById(`browser-${command}`);
      if (!item) throw new Error(`Missing menu command ${command}`);
      item.click(item, window);
      return;
    }
    const id = surface === 'chrome' || surface === 'otherChrome' ? window.webContents.id
      : surface === 'sheet' ? globalThis.__blanc.utilitySheetContentsId()
      : surface === 'overlay' ? webContents.getAllWebContents().find(wc => wc.getURL() === 'blanc-chrome://overlay/')?.id
      : surface === 'permission' ? webContents.getAllWebContents().find(wc => wc.getURL() === 'blanc-chrome://permission/')?.id
      : globalThis.__blanc.activeWebContentsId();
    const wc = webContents.fromId(id);
    if (!wc) throw new Error(`Missing input surface ${surface}`);
    wc.focus();
    wc.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers });
  }, { command, key, modifiers, surface });
  const delivered = await wait(() => call(app, 'browserCommandState'), value => value.deliveries.length > before, `${command} delivery`);
  assert.equal(delivered.deliveries.length, before + 1, `${command} must execute once`);
  assert.equal(delivered.deliveries.at(-1).id, command);
  assert.equal(delivered.deliveries.at(-1).handled, true);
  steps++;
};
const state = () => call(app, 'state');
const sheetReady = () => wait(() => call(app, 'utilitySurface'), value => value?.ready && value.url.startsWith('blanc://settings/'), 'Settings ready');
try {
  app = await _electron.launch({ args: [path.resolve('.'), `--user-data-dir=${userData}`], env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaught }, chromiumSandbox: true });
  await app.firstWindow();
  assert.equal(await app.evaluate(() => process.versions.electron), expected);
  await wait(() => call(app, 'startupReady'), Boolean, 'startup');
  await call(app, 'openTab', [`${origin}/one`]);
  await call(app, 'openTab', [`${origin}/two`]);
  const initial = await state();
  const count = initial.tabOrder.length;
  for (let iteration = 0; iteration < 12; iteration++) {
    await press('new-tab', 'T', ['control']);
    const created = await wait(state, value => value.tabOrder.length === count + 1, 'one new tab');
    await call(app, 'navigateTab', [created.activeTabId, `${origin}/iteration-${iteration}`]);
    await press('settings', ',', ['control']);
    await sheetReady();
    const settingsPage = await wait(async () => (await app.windows()).find(page => page.url().startsWith('blanc://settings/')), Boolean, 'Settings page');
    await settingsPage.locator('a[data-group="help"]').click();
    assert.equal(await settingsPage.locator('#browserCompatibilityCard').isVisible(), true);
    await press('next-tab', iteration % 2 ? 'PageDown' : 'Tab', ['control'], 'sheet');
    await wait(state, value => value.activeTabId !== created.activeTabId, 'tab switched from Settings');
    await press('previous-tab', iteration % 2 ? 'PageUp' : 'Tab', iteration % 2 ? ['control'] : ['control', 'shift']);
    await wait(state, value => value.activeTabId === created.activeTabId, 'tab restored');
    await press('close-tab', 'W', ['control']);
    await wait(state, value => value.tabOrder.length === count, 'exactly one tab closed');
  }
  // A repeated request in the same turn must remain one visible pending sheet.
  await app.evaluate(() => { globalThis.__blanc.openSettings(); globalThis.__blanc.openSettings(); });
  await sheetReady();
  await press('settings', ',', ['control'], 'sheet');
  await wait(() => call(app, 'utilitySurface'), value => !value.visible, 'loaded sheet toggles closed');
  await press('history', 'H', ['control'], 'chrome');
  await wait(() => call(app, 'utilitySurface'), value => value.ready && value.url.startsWith('blanc://history/'), 'History');
  await press('downloads', 'J', ['control'], 'sheet');
  await wait(() => call(app, 'utilitySurface'), value => value.ready && value.url.startsWith('blanc://downloads/'), 'Downloads');
  await press('address', 'D', ['alt'], 'sheet');
  await wait(() => call(app, 'overlayMode'), value => value === 'palette', 'address entry');
  await press('settings', ',', ['control'], 'overlay');
  await sheetReady();
  await call(app, 'destroyUtilitySheetContents');
  await press('settings', ',', ['control'], 'chrome');
  await sheetReady();
  await press('history', 'Y', ['control'], 'sheet');
  await wait(() => call(app, 'utilitySurface'), value => value.ready && value.url.startsWith('blanc://history/'), 'History alias');
  await press('downloads', 'J', ['control', 'shift'], 'sheet');
  await wait(() => call(app, 'utilitySurface'), value => value.ready && value.url.startsWith('blanc://downloads/'), 'Downloads alias');
  await call(app, 'closeUtilitySurface');
  await press('reload', 'F5', []);
  await press('hard-reload', 'R', ['control', 'shift']);
  await press('find', 'F', ['control']);
  await wait(() => call(app, 'overlayMode'), value => value === 'find', 'Find');
  await press('settings', ',', ['control'], 'overlay');
  await sheetReady();
  await call(app, 'closeUtilitySurface');
  await press('new-private-tab', 'N', ['control', 'shift']);
  const privateState = await state();
  assert.equal(privateState.tabs.find(tab => tab.id === privateState.activeTabId).private, true);
  await press('close-tab', 'W', ['control'], 'overlay');
  await wait(state, value => value.tabOrder.length === count, 'private tab closed');
  await press('reopen-tab', 'T', ['control', 'shift']);
  await wait(state, value => value.tabOrder.length === count + 1, 'ordinary closed tab reopened');
  await press('close-tab', 'W', ['control']);
  await wait(state, value => value.tabOrder.length === count, 'reopened tab closed');
  // A new-tab focus callback queued in this same turn cannot cover Settings
  // or leave the underlying new-tab view hidden after Settings is dismissed.
  await app.evaluate(({ Menu, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(win => win.webContents.getURL() === 'blanc-chrome://index/');
    for (const id of ['new-tab', 'settings']) {
      const item = Menu.getApplicationMenu().getMenuItemById(`browser-${id}`);
      item.click(item, window);
    }
  });
  await sheetReady();
  await call(app, 'closeUtilitySurface');
  await wait(() => call(app, 'browserCommandState'), value => value.activeViewVisible && value.overlayMode == null, 'cancelled focus remains dismissed');
  await press('close-tab', 'W', ['control']);
  await wait(state, value => value.tabOrder.length === count, 'rapid new tab closed');
  // Shortcuts remain routable while the permission prompt has priority.
  const permissionTab = await call(app, 'openTab', [`${origin}/permission`]);
  const permissionFixture = await wait(async () => (await app.windows()).find(page => page.url() === `${origin}/permission`), Boolean, 'permission fixture');
  await permissionFixture.evaluate(() => { navigator.geolocation.getCurrentPosition(() => {}, () => {}); });
  const prompt = await wait(async () => (await app.windows()).find(page => page.url() === 'blanc-chrome://permission/'), Boolean, 'permission surface');
  await prompt.locator('#permBlockBtn').waitFor({ state: 'visible' });
  await press('settings', ',', ['control'], 'permission');
  await sheetReady();
  assert.equal(await prompt.locator('#permBlockBtn').isVisible(), true);
  await prompt.locator('#permBlockBtn').click();
  await call(app, 'closeUtilitySurface');
  assert.equal((await state()).activeTabId, permissionTab);
  await press('close-tab', 'W', ['control']);
  const heldId = await call(app, 'openTab', [`${origin}/held`]);
  const heldPage = await wait(async () => (await app.windows()).find(page => page.url() === `${origin}/held`), Boolean, 'held fixture');
  await heldPage.waitForLoadState();
  const heldContentsId = await call(app, 'workspacePageIdentity', [heldId]);
  const inputCount = (await call(app, 'tabListenerState', [heldId])).input;
  await press('close-tab', 'W', ['control']);
  assert.equal((await call(app, 'closedEntriesSummary')).at(-1).held, true);
  const priorDeliveries = (await call(app, 'browserCommandState')).deliveries.length;
  await app.evaluate(({ webContents }, { id, inputCount }) => {
    const wc = webContents.fromId(id);
    if (!wc) throw new Error('Closed view should remain parked');
    // Electron and the process-wide external-app activation observer remain;
    // the tab's own browser handlers must have been removed.
    if (wc.listenerCount('before-input-event') >= inputCount) throw new Error('Parked view retained its tab input listener set');
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'W', modifiers: ['control'] });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'W', modifiers: ['control'] });
  }, { id: heldContentsId, inputCount });
  assert.equal((await call(app, 'browserCommandState')).deliveries.length, priorDeliveries);
  const primaryBefore = (await call(app, 'windowRuntimes'))[0];
  const otherId = await call(app, 'openNewWindow');
  await wait(() => call(app, 'windowRuntimes'), windows => windows.some(window => window.id === otherId && window.tabs.length === 1), 'second window');
  await wait(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.webContents.getURL() === 'blanc-chrome://index/').length), value => value === 2, 'second chrome document');
  await press('new-tab', 'T', ['control'], 'otherChrome');
  const windows = await wait(() => call(app, 'windowRuntimes'), windows => windows.find(window => window.id === otherId)?.tabs.length === 2, 'second window command');
  assert.equal(windows.find(window => window.id === primaryBefore.id).tabs.length, primaryBefore.tabs.length);
  assert.equal((await call(app, 'browserCommandState')).deliveries.at(-1).runtimeId, otherId);
  await call(app, 'closeWindowRuntime', [otherId]);
  assert.equal(await app.evaluate(({ app }) => app.isReady()), true);
  assert.equal(fs.existsSync(uncaught) ? fs.readFileSync(uncaught, 'utf8') : '', '');
  console.log(`Browser shortcuts PASS: ${steps} ${process.platform === 'darwin' ? 'native menu' : 'native input'} commands, tab churn, Settings recovery, compatibility guidance; Electron ${expected}`);
} catch (error) {
  if (app) {
    console.error('Command failure diagnostics:', JSON.stringify(await call(app, 'browserCommandState').catch(() => null)));
    console.error('Tab failure diagnostics:', JSON.stringify(await state().catch(() => null)));
  }
  if (fs.existsSync(uncaught)) console.error(fs.readFileSync(uncaught, 'utf8'));
  throw error;
} finally {
  if (app) await app.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
}
