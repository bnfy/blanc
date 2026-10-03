import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';
import polling from './support/poll.js';
import runtime from '../../scripts/preflight-electron-runtime.js';
const { waitForValue: wait } = polling;
const expected = runtime.lockedElectronVersion();
const executablePath = process.env.BLANC_PACKAGED_EXECUTABLE || path.resolve('dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-packaged-browser-'));
fs.writeFileSync(path.join(scratch, 'settings.json'), JSON.stringify({ onboardingVersion: 1, adblockEnabled: false, usagePing: false, searchSuggestions: false }));
const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Packaged browser fixture</title><input>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let app;
try {
  app = await launchPackagedOverCdp({ executablePath, args: [`--user-data-dir=${scratch}`, `${origin}/one`], env: { ...process.env, BLANC_TEST: '0' } });
  const chrome = await wait(() => Promise.resolve(app.pages().find(page => page.url() === 'blanc-chrome://index/')), Boolean, 'packaged chrome');
  const state = () => chrome.evaluate(() => window.browserAPI.getAllTabs());
  await wait(state, value => value.tabs.some(tab => tab.url === `${origin}/one`), 'initial packaged tab');
  const initialCount = (await state()).tabs.length;
  const openSettings = async () => {
    await chrome.evaluate(() => window.browserAPI.createTab('blanc://settings/'));
    const page = await wait(() => Promise.resolve(app.pages().find(page => page.url().startsWith('blanc://settings/'))), Boolean, 'packaged Settings');
    await page.locator('#aboutElectron').waitFor({ state: 'attached' });
    const info = await page.evaluate(() => window.bowserPages.settings.get());
    assert.equal(info.appInfo.electronVersion, expected, 'actual packaged runtime matches the lock');
    await page.locator('a[data-group="help"]').click();
    await page.locator('#browserCompatibilityCard').waitFor({ state: 'visible' });
    assert.match(await page.locator('#browserCompatibilityCard').innerText(), /cannot install Chrome extensions/);
    return page;
  };
  for (let iteration = 0; iteration < 6; iteration++) {
    const id = await chrome.evaluate(url => window.browserAPI.createTab(url), `${origin}/tab-${iteration}`);
    await wait(state, value => value.tabs.length === initialCount + 1 && value.activeTabId === id, 'packaged new tab');
    const sheet = await openSettings();
    await sheet.evaluate(() => window.bowserPages.surface.close());
    await chrome.evaluate(id => window.browserAPI.closeTab(id), id);
    await wait(state, value => value.tabs.length === initialCount, 'packaged tab closed');
  }
  const sheet = await openSettings();
  const session = await app.context.newCDPSession(sheet);
  await session.send('Page.crash').catch(() => {});
  await wait(() => Promise.resolve(app.pages().includes(sheet)), value => !value, 'crashed Settings disposed');
  const recovered = await openSettings();
  await recovered.locator('a[data-group="general"]').click();
  assert.equal(await recovered.locator('#tabSleep').isVisible(), true, 'Settings remains interactive after recovery');
  console.log(`Packaged browser compatibility PASS: tab churn, Settings interactivity/crash recovery, guidance; actual Electron ${expected}`);
} finally {
  if (app) await app.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(scratch, { recursive: true, force: true });
}
