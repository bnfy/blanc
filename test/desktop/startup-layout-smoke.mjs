import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';
import testHookCall from './support/test-hook-call.js';
import poll from './support/poll.js';

const { callTestHook } = testHookCall;
const { waitForValue } = poll;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-startup-layout-'));
const userDataDir = path.join(root, 'profile');
const profile = `${userDataDir}-Dev`;
fs.mkdirSync(profile);
const write = (name, value) => fs.writeFileSync(path.join(profile, name), JSON.stringify(value));
write('settings.json', { onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false });
write('session.json', { urls: ['https://example.test/saved'], activeIndex: 0 });
write('crash-ledger.json', { version: 1, currentRun: { startedAt: 1 }, recoveryPending: true, events: [] });
const uncaughtLog = path.join(root, 'uncaught.log');
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env;
let app;
try {
  app = await _electron.launch({
    args: [path.resolve('.'), `--user-data-dir=${userDataDir}`],
    env: { ...env, BLANC_TEST: '1', BLANC_TEST_UNCAUGHT_LOG: uncaughtLog },
  });
  if (process.argv.includes('--reopened-window')) {
    assert.equal(process.platform, 'darwin', 'Dock reopen regression runs on macOS');
    await waitForValue(async () => (await app.windows()).some((p) => p.url() === 'blanc://newtab/'), Boolean, 'initial recovery window');
    const closedId = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const id = window.id;
      window.close();
      return id;
    });
    await waitForValue(() => app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id) === null, closedId), Boolean, 'recovery window closed');
    await app.evaluate(({ app }) => app.emit('activate'));
    await waitForValue(() => callTestHook(app, 'windowRuntimes'), (rows) => rows.some((rt) => rt.id === 'primary' && rt.tabs.length > 0), 'primary window reopened before recovery choice');
  }
  const page = await waitForValue(async () => (await app.windows()).find((p) => p.url() === 'blanc://newtab/'), Boolean, 'recovery page');
  await page.waitForFunction(() => window.bowserPages?.start);
  await waitForValue(() => page.evaluate(async () => (await window.bowserPages.start.data()).recovery?.required), Boolean, 'recovery pending');
  const url = 'https://example.test/from-email';
  await app.evaluate(({ app }, url) => app.emit('open-url', { preventDefault() {} }, url), url);
  assert.equal((await callTestHook(app, 'state')).tabs.some((tab) => tab.url === url), false);

  // Exercise actual layout CSS, including Mahjong's overflow/absolute rules.
  for (const layout of ['ledger', 'billboard', 'shelf', 'tally', 'mahjong']) {
    await page.evaluate((layout) => { document.body.dataset.layout = layout; }, layout);
    for (const [width, height] of [[1000, 700], [640, 412]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width, height]);
      assert.equal(await page.locator('#recoveryRestore').isVisible(), true, `${layout}: Restore tabs must be visible`);
      const reachable = await page.locator('#recoveryRestore').evaluate((button) => {
        button.scrollIntoView({ block: 'center' });
        const box = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      });
      assert.equal(reachable, true, `${layout} ${width}x${height}: recovery must be clickable`);
    }
  }
  // The same shared surface carries blocker failure and initialization.
  const recovery = await page.evaluate(async () => (await window.bowserPages.start.data()).recovery);
  for (const phase of ['initializing', 'failed']) {
    await app.evaluate(({ webContents }, phase) => {
      webContents.getAllWebContents().find((wc) => wc.getURL() === 'blanc://newtab/')
        .send('pages:start:status', { startup: { phase, attempt: 1, error: 'test failure' }, recovery: { required: false } });
    }, phase);
    await page.waitForFunction((phase) => document.getElementById('startupTitle').textContent ===
      (phase === 'failed' ? 'Blocking could not start.' : 'Preparing blocking…'), phase);
    for (const layout of ['ledger', 'billboard', 'shelf', 'tally', 'mahjong']) {
      await page.evaluate((layout) => { document.body.dataset.layout = layout; }, layout);
      assert.equal(await page.locator('#startupCard').isVisible(), true, `${layout}: ${phase} must be visible`);
      if (phase === 'failed') await page.locator('#startupRetry').click({ trial: true });
    }
  }
  await app.evaluate(({ webContents }, recovery) => {
    webContents.getAllWebContents().find((wc) => wc.getURL() === 'blanc://newtab/')
      .send('pages:start:status', { recovery });
  }, recovery);
  if (process.env.BLANC_STARTUP_LAYOUT_SCREENSHOT) {
    await page.screenshot({ path: process.env.BLANC_STARTUP_LAYOUT_SCREENSHOT });
  }
  await page.locator('#recoveryRestore').click();
  const restored = await waitForValue(() => callTestHook(app, 'state'), (state) => state.tabs.some((tab) => tab.url === url && tab.id === state.activeTabId), 'queued external URL selected after recovery');
  assert.equal(restored.tabs.filter((tab) => tab.url === url).length, 1);
  assert.equal(restored.tabs.some((tab) => tab.url === 'https://example.test/saved'), true);
  // Distinguish this page from the temporary startup tab retained briefly by
  // Reopen Closed Tab, which can still appear in Electron's page inventory.
  const readyUrl = 'blanc://newtab/?startup-layout-check=1';
  await callTestHook(app, 'openTabInWindow', ['primary', readyUrl]);
  const readyPage = await waitForValue(async () => (await app.windows()).find((p) => p.url() === readyUrl), Boolean, 'ready new tab');
  await readyPage.waitForFunction(() => document.getElementById('bbDate')?.textContent);
  assert.equal(await readyPage.locator('#startupCard').isVisible(), false);
  assert.equal(await readyPage.locator('#layoutBillboard').isVisible(), true, 'saved layout returns after recovery');
  console.log('startup-layout-smoke PASS: recovery reachable in five layouts at two sizes; saved session restored and queued external URL selected once');
} finally {
  if (app) await app.close();
  const errors = fs.existsSync(uncaughtLog) ? fs.readFileSync(uncaughtLog, 'utf8').trim() : '';
  fs.rmSync(root, { recursive: true, force: true });
  assert.equal(errors, '', 'No uncaught main-process exceptions');
}
