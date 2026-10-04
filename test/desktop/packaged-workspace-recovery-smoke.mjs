import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';
import polling from './support/poll.js';
import fixtures from './support/workspace-fixtures.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');
const executable = process.env.BLANC_PACKAGED_EXECUTABLE || path.resolve('dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc');
assert.ok(fs.existsSync(executable), 'Set BLANC_PACKAGED_EXECUTABLE to a packaged Blanc executable');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-workspace-restart-'));
const fixture = await fixtures.startWorkspaceFixtures();
const { waitForValue: wait } = polling;
const { ELECTRON_RUN_AS_NODE: _ignored, ...cleanEnv } = process.env;
void _ignored;
let app;
let chrome;
const read = name => JSON.parse(fs.readFileSync(path.join(profile, name), 'utf8'));
const state = () => chrome.evaluate(() => window.browserAPI.getAllTabs());
const list = () => chrome.evaluate(() => window.browserAPI.listWorkspaces());
const ready = () => wait(state, value => value.tabs.length && value.tabs.every(tab => !tab.isLoading), 'settled packaged workspace tabs', 20_000);
const urls = [fixture.base + '/ordinary-one', fixture.base + '/ordinary-two'];
const privateUrl = fixture.base + '/private-never-persisted';
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, usagePing: false, searchSuggestions: false,
  patron: { kind: 'founding', activatedAt: Date.now() },
}));

async function launch() {
  app = await launchPackagedOverCdp({ executablePath: executable,
    args: [`--user-data-dir=${profile}`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'],
    env: { ...cleanEnv, BLANC_TEST: '0' },
  });
  app.context.setDefaultTimeout(10_000);
  chrome = await wait(() => Promise.resolve(app.pages().find(page => page.url() === 'blanc-chrome://index/')), Boolean, 'packaged chrome');
  await ready();
  // Production projection, no main-process inspector or test hook.
  await chrome.evaluate(() => window.browserAPI.openPage('settings'));
  const settings = await wait(() => Promise.resolve(app.pages().find(page => page.url().startsWith('blanc://settings/'))), Boolean, 'packaged settings');
  const info = await settings.evaluate(async () => (await window.bowserPages.settings.get()).appInfo);
  assert.equal(info.blancVersion, pkg.version);
  assert.equal(info.electronVersion, pkg.devDependencies.electron.replace(/^[~^]/, ''));
  assert.equal(info.platform, process.platform);
  await settings.evaluate(() => window.bowserPages.surface.close());
  return info;
}
async function quit() {
  // Browser.close requests graceful termination. A kill fallback must never
  // count as a successful quit/restart result; wait for the owned process.
  const owned = app;
  const session = await owned.browser.newBrowserCDPSession();
  // Electron may terminate before CDP acknowledges this command. Process
  // exit is the success signal; awaiting the acknowledgement can hang.
  let requestError;
  void session.send('Browser.close').catch(error => { requestError = error; });
  await wait(() => Promise.resolve(owned.process.exitCode), code => code !== null, 'graceful packaged process exit', 15_000);
  assert.equal(owned.process.exitCode, 0, 'packaged quit must exit successfully without a signal');
  if (requestError && !/closed|disconnect/i.test(requestError.message)) throw requestError;
  await Promise.race([owned.browser.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 1_000))]);
  app = null;
}
function assertDiskCapture(id) {
  const workspace = read('workspaces.json').workspaces.find(item => item.id === id);
  assert.ok(workspace);
  assert.deepEqual(workspace.urls, urls);
  assert.deepEqual(workspace.pinned, [false, true]);
  assert.equal(workspace.groups.length, 1);
  assert.equal(workspace.groups[0].name, 'restart group');
  assert.equal(workspace.groups[0].collapsed, true);
  assert.deepEqual(workspace.groupIds, [workspace.groups[0].id, workspace.groups[0].id]);
  for (const name of ['session.json', 'workspaces.json']) assert.equal(fs.readFileSync(path.join(profile, name), 'utf8').includes(privateUrl), false, 'private URL must not reach durable stores');
  return workspace;
}

try {
  const runtime = await launch();
  const initial = (await state()).tabs.map(tab => tab.id);
  const first = await chrome.evaluate(url => window.browserAPI.createTab(url), urls[0]);
  await ready();
  const second = await chrome.evaluate(url => window.browserAPI.createTab(url), urls[1]);
  await ready();
  for (const id of initial) await chrome.evaluate(id => window.browserAPI.closeTab(id), id);
  await chrome.evaluate(async ({ first, second }) => {
    await window.browserAPI.groupTabByName(first, 'restart group');
    await window.browserAPI.groupTabByName(second, 'restart group');
    await window.browserAPI.toggleTabPinned(first);
    await window.browserAPI.switchTab(second);
  }, { first, second });
  const saved = await chrome.evaluate(() => window.browserAPI.saveWorkspaceAs('Packaged restart workspace'));
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const id = (await list()).items.find(workspace => workspace.name === 'Packaged restart workspace')?.id;
  assert.ok(id, 'saved workspace must be discoverable through the production projection');
  await chrome.evaluate(url => window.browserAPI.createTab(url, { private: true }), privateUrl);
  await ready();
  await chrome.evaluate(id => window.browserAPI.switchTab(id), second);
  const groupId = (await state()).groups[0].id;
  await chrome.evaluate(id => window.browserAPI.toggleGroupCollapsed(id), groupId);
  // Change a durable capture after Save As, then quit without sleeping past
  // the autosave debounce. Shutdown must flush the pending capture.
  await chrome.evaluate(async ({ first, second }) => {
    await window.browserAPI.toggleTabPinned(first);
    await window.browserAPI.toggleTabPinned(second);
  }, { first, second });
  await quit();
  const capture = assertDiskCapture(id);
  assert.equal(capture.activeIndex, 1);
  assert.ok(read('session.json').windows.some(window => window.workspaceId === id), 'quit must durably save the newly created binding');

  const firstLoads = fixture.requests.pages['/ordinary-one'];
  await launch();
  let restored = await state();
  assert.equal((await list()).items.find(workspace => workspace.id === id)?.active, true);
  assert.deepEqual(restored.tabs.map(tab => tab.url), urls);
  assert.equal(restored.tabs.find(tab => tab.id === restored.activeTabId).url, urls[1]);
  assert.equal(restored.tabs[0].asleep, true, 'inactive restored tab stays quiet');
  assert.deepEqual(restored.tabs.map(tab => tab.pinned), [false, true]);
  assert.equal(restored.groups[0].name, 'restart group');
  assert.equal(restored.groups[0].collapsed, true);
  assert.equal(fixture.requests.pages['/ordinary-one'], firstLoads, 'startup must not load the quiet restored page');
  await chrome.evaluate(id => window.browserAPI.switchTab(id), restored.tabs[0].id);
  await ready();
  await wait(() => Promise.resolve(fixture.requests.pages['/ordinary-one']), value => value === firstLoads + 1, 'quiet page wakes exactly once');

  assert.equal((await chrome.evaluate(id => window.browserAPI.removeWorkspace(id), id)).ok, true);
  restored = await state();
  for (const tab of restored.tabs) await chrome.evaluate(id => window.browserAPI.closeTab(id), tab.id);
  await ready();
  await quit();
  await launch();
  const deleted = await list();
  assert.equal(deleted.items.some(workspace => workspace.id === id), false);
  assert.ok(deleted.deleted.some(workspace => workspace.id === id), 'Recently Deleted survives a real process restart');
  assert.equal((await chrome.evaluate(id => window.browserAPI.restoreWorkspace(id), id)).ok, true);
  assert.equal((await chrome.evaluate(id => window.browserAPI.openWorkspace(id), id)).ok, true);
  await ready();
  assert.deepEqual((await state()).tabs.map(tab => tab.url), urls);
  await quit();
  assertDiskCapture(id);
  console.log(`Packaged Workspace recovery PASS: ${JSON.stringify(runtime)}; new binding, groups/pins, private exclusion, quiet restore/wake, durable deleted recovery; three graceful process exits.`);
} finally {
  try { if (app) await app.close(); }
  finally { await fixture.close(); fs.rmSync(profile, { recursive: true, force: true }); }
}
