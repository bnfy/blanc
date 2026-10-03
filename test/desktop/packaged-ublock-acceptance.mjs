// Installed production package acceptance. Real UI handlers / production IPC,
// no main-process inspector, test hooks, runtime patch or sandbox bypass.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';
import poll from './support/poll.js';
const { waitForValue, clickWhenSettled } = poll;
const executable = process.env.BLANC_PACKAGED_EXECUTABLE;
const evidence = process.env.BLANC_UBLOCK_EVIDENCE;
assert(executable && evidence);
fs.mkdirSync(path.dirname(evidence), { recursive: true });
const fd = fs.openSync(evidence, 'wx');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-installed-ubo-'));
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ onboardingVersion: 1, adblockProvider: 'blanc', adblockEnabled: true, searchSuggestions: false, usagePing: false, onePasswordEnabled: false }));
const hits = [];
const server = http.createServer((request, response) => {
  const route = new URL(request.url, 'http://fixture').pathname;
  hits.push(route);
  response.setHeader('Cache-Control', 'no-store');
  if (route.endsWith('.js')) { response.setHeader('Content-Type', 'text/javascript'); response.end('window.allowed=true'); return; }
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Installed uBO fixture</title><div id="ad">Disposable ad</div><div id="control">Allowed control</div><script src="/blocked-installed.js"></script><script src="/allowed.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const cleanEnv = { ...process.env, BLANC_TEST: '0', BLANC_UBLOCK_TEST: '0' };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
let app, browser, context, chrome, settings;
let stage = 'installed launch';
const report = { kind: 'installed-production-ubo-acceptance', passed: false, os: process.platform, harnessArchitecture: process.arch, osRelease: os.release(), executableSha256: createHash('sha256').update(fs.readFileSync(executable)).digest('hex'), checks: {}, limits: ['Isolated disposable profile, not personal browsing data.', 'Renderer CDP automation leaves production fuses and sandbox policy intact.', 'Separate signature / Linux process sandbox observations remain required.'] };
const pages = () => context.pages();
const at = url => waitForValue(() => pages().find(p => !p.isClosed() && p.url() === url), Boolean, 'current packaged page', 40000);
async function connect() {
  const endpoint = await waitForValue(async () => { try { return (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { return null; } }, Boolean, 'relaunched package CDP', 40000);
  browser = await chromium.connectOverCDP(endpoint); context = browser.contexts()[0];
  context.setDefaultTimeout(15000);
  chrome = await at('blanc-chrome://index/');
  await chrome.waitForFunction(() => !!window.browserAPI);
  await chrome.evaluate(() => window.browserAPI.openPage('settings'));
  settings = await at('blanc://settings/');
  await settings.waitForFunction(() => !!window.bowserPages?.settings);
}
async function ready(provider) {
  const status = await waitForValue(() => settings.evaluate(() => window.bowserPages.settings.blockingStatus()), value => {
    assert.notEqual(value.phase, 'failed', value.error || 'provider failed');
    return value.phase === 'ready' && value.active === provider;
  }, 'installed provider ready', 40000);
  assert(status.supported); return status;
}
async function pid() {
  const session = await browser.newBrowserCDPSession();
  const { processInfo } = await session.send('SystemInfo.getProcessInfo');
  await session.detach(); return processInfo.find(p => p.type === 'browser').id;
}
const alive = id => { try { process.kill(id, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; throw e; } };
async function open(route, opts) {
  const id = await chrome.evaluate(({ url, opts }) => window.browserAPI.createTab(url, opts), { url: origin + route, opts });
  const page = await at(origin + route); await page.waitForLoadState('load'); return { id, page };
}
async function restartChoice(provider) {
  const oldPid = await pid();
  await clickWhenSettled(chrome.locator('#pillShield'), 'Island shield');
  const overlay = await at('blanc-chrome://overlay/');
  await overlay.locator('#shieldPopChangeProvider').click();
  await overlay.locator(`[name="shieldProvider"][value="${provider}"]`).check();
  assert.equal(await overlay.locator('#shieldPopApply').innerText(), 'Restart Blanc');
  await overlay.locator('#shieldPopApply').click().catch(error => { if (!/closed/.test(error.message)) throw error; });
  await waitForValue(() => browser.isConnected(), value => !value, 'old browser disconnects on restart', 40000);
  await connect(); await ready(provider);
  assert.notEqual(await pid(), oldPid);
  report.checks['restart-' + provider] = true;
}
async function dashboard() {
  await settings.evaluate(() => window.bowserPages.settings.blockingOpen('dashboard'));
  const page = await waitForValue(() => pages().find(p => p.url().includes('/dashboard.html')), Boolean, 'original Dashboard');
  await page.waitForFunction(() => { const image = document.querySelector('#dashboard-nav .logo img'); return image?.complete && image.naturalWidth > 0; });
  await page.locator('[data-pane="1p-filters.html"]').click();
  const frame = await waitForValue(() => page.frames().find(f => f.url().endsWith('/1p-filters.html')), Boolean, 'My filters');
  await frame.waitForFunction(() => document.querySelector('.CodeMirror')?.CodeMirror && typeof self.hasUnsavedData === 'function' && !self.hasUnsavedData());
  return { page, frame };
}
async function popup(tabId) {
  await chrome.evaluate(id => window.browserAPI.switchTab(id), tabId);
  await clickWhenSettled(chrome.locator('#pillShield'), 'Island shield');
  const overlay = await at('blanc-chrome://overlay/'); await overlay.locator('#shieldPopUblock').click();
  const p = await waitForValue(() => pages().find(p => p.url().includes('/popup-fenix.html')), Boolean, 'original popup');
  await p.locator('body:not(.loading)').waitFor();
  await p.waitForFunction(() => document.querySelector('#blancMark')?.naturalWidth > 0);
  return p;
}
try {
  app = await launchPackagedOverCdp({ executablePath: executable, debugPort: port, launchViaOpen: process.platform === 'darwin', args: [`--user-data-dir=${profile}`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost', ...(process.env.BLANC_UBLOCK_NATIVE_LOG ? ['--enable-logging=file', `--log-file=${process.env.BLANC_UBLOCK_NATIVE_LOG}`] : [])], env: cleanEnv, timeoutMs: 40000 });
  browser = app.browser; context = app.context; context.setDefaultTimeout(15000);
  chrome = await at('blanc-chrome://index/'); await chrome.waitForFunction(() => !!window.browserAPI);
  await chrome.evaluate(() => window.browserAPI.openPage('settings')); settings = await at('blanc://settings/');
  await ready('blanc');
  report.runtime = await settings.evaluate(async () => (await window.bowserPages.settings.get()).appInfo);
  stage = 'shield switch and actual restart'; await open('/start'); await restartChoice('ublock-origin');
  stage = 'original Dashboard custom filter';
  let dash = await dashboard();
  await dash.frame.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.setValue('/blocked-installed.js$script\n127.0.0.1###ad\n'));
  await dash.frame.locator('#userFiltersApply').click(); await dash.frame.locator('#userFiltersApply:disabled').waitFor();
  hits.length = 0; let fixture = await open('/regular');
  await fixture.page.waitForFunction(() => window.allowed === true && getComputedStyle(document.querySelector('#ad')).display === 'none');
  assert(!hits.includes('/blocked-installed.js')); assert(hits.includes('/allowed.js'));
  report.checks.networkAndCosmetics = true;
  stage = 'original popup and logger';
  let p = await popup(fixture.id); await p.locator('#blancMore').click(); assert.equal(await p.locator('#blancMore').getAttribute('aria-expanded'), 'true');
  await Promise.all([p.waitForEvent('close'), p.locator('a[href="logger-ui.html#_"]').click().catch(error => { if (!p.isClosed() || !error.message.includes('Target page, context or browser has been closed')) throw error; })]);
  const logger = await waitForValue(() => pages().find(p => p.url().includes('/logger-ui.html')), Boolean, 'original logger');
  await logger.locator('#netInspector').waitFor(); report.checks.popupMarkAndMoreAndLogger = true;
  stage = 'private isolation';
  const priv = await open('/private-marker', { private: true });
  await clickWhenSettled(chrome.locator('#pillShield'), 'Island shield'); const overlay = await at('blanc-chrome://overlay/');
  assert.equal(await overlay.locator('#shieldPopCurrentProvider').innerText(), 'Blanc Blocker');
  assert.equal(await overlay.locator('#shieldPopUblock').isVisible(), false);
  await overlay.locator('#shieldPopClose').click();
  assert(!(await logger.locator('body').innerText()).includes('/private-marker'));
  report.checks.privateShieldAndLoggerIsolation = true;
  stage = 'quiet and wake';
  await chrome.evaluate(id => window.browserAPI.switchTab(id), fixture.id);
  const background = await open('/quiet'); await chrome.evaluate(id => window.browserAPI.switchTab(id), fixture.id);
  await background.page.waitForLoadState('networkidle');
  const quieted = await chrome.evaluate(() => window.browserAPI.sleepBackgroundTabs());
  assert(quieted.includes(background.id)); await waitForValue(() => background.page.isClosed(), Boolean, 'quiet renderer closed');
  await chrome.evaluate(id => window.browserAPI.switchTab(id), background.id);
  const awake = await at(origin + '/quiet'); await awake.waitForFunction(() => window.allowed === true);
  p = await popup(background.id); await p.locator('#blancClose').click(); report.checks.quietWakeControls = true;
  stage = 'provider round trip and filter persistence';
  await restartChoice('blanc'); await restartChoice('ublock-origin');
  dash = await dashboard(); assert((await dash.frame.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue())).includes('/blocked-installed.js$script'));
  report.checks.filtersSurviveProviderRestarts = true;
  stage = 'global blocking off'; await settings.evaluate(() => window.bowserPages.settings.set({ adblockEnabled: false }));
  hits.length = 0; await open('/off'); assert(hits.includes('/blocked-installed.js'));
  await settings.evaluate(() => window.bowserPages.settings.set({ adblockEnabled: true })); report.checks.globalSwitch = true;
  stage = 'normal last-window close';
  const beforeClose = await pid();
  await chrome.evaluate(() => window.browserAPI.closeWindow());
  if (process.platform === 'darwin') {
    await waitForValue(() => pages().filter(p => p.url() === 'blanc-chrome://index/').length, n => n === 0, 'Mac window closed'); assert(alive(beforeClose));
    const appPath = path.resolve(path.dirname(executable), '../..');
    const child = spawn('open', [appPath]); await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('LaunchServices reopen failed'))); });
    chrome = await at('blanc-chrome://index/'); await chrome.evaluate(() => window.browserAPI.openPage('settings')); settings = await at('blanc://settings/'); await ready('ublock-origin');
    report.checks.macWindowCloseAndLaunchServicesReopen = true;
    stage = 'native Mac quit'; console.log('READY_FOR_NATIVE_QUIT');
    await waitForValue(() => browser.isConnected(), connected => !connected, 'native quit', 120000);
    await waitForValue(() => alive(beforeClose), value => !value, 'quit removes browser process');
    report.checks.nativeMacQuit = true;
  } else {
    await waitForValue(() => browser.isConnected(), connected => !connected, 'window close quits browser');
    await waitForValue(() => alive(beforeClose), value => !value, 'no remaining browser process');
    report.checks.lastWindowExit = true;
  }
  report.passed = true;
} catch (error) { console.error('Packaged launch output:', app?.output());report.failure = { stage, name: error.name }; throw error; }
finally {
  try { if (browser?.isConnected()) { const session = await browser.newBrowserCDPSession(); await session.send('Browser.close').catch(() => {}); } } catch {}
  await new Promise(resolve => server.close(resolve));
  fs.writeFileSync(fd, JSON.stringify(report, null, 2) + '\n'); fs.closeSync(fd);
  fs.rmSync(profile, { recursive: true, force: true });
}
console.log('Installed uBO acceptance passed.');
