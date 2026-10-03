// Exercise the whole app with real Blanc filtering after a reviewed runtime
// retirement or a disabled platform. The bootstrap changes only this child process;
// no production test override or on-disk release flag is introduced.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import hooks from './support/test-hook-call.js';
import focus from './support/popup-focus-trace.js';
const { waitForValue } = poll;
const root = path.resolve('.');
const unavailable = process.argv.includes('--unavailable');
const expectedFallback = unavailable ? 'ublock-unavailable' : 'manifest-v2-retired';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ubo-retirement-'));
const appDir = path.join(temp, 'app'); fs.mkdirSync(appDir);
for (const member of ['src', 'ublock', 'node_modules', 'build', 'assets', 'adblock', 'scripts']) {
  fs.symlinkSync(path.join(root, member), path.join(appDir, member), process.platform === 'win32' ? 'junction' : 'dir');
}
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ ...metadata, main: 'retirement.cjs' }));
const matrixPath = JSON.stringify(path.join(root, 'src/main/ublock-platforms.json'));
const managerPath = JSON.stringify(path.join(root, 'src/main/blocking-providers.js'));
const bootstrap = unavailable ? `
  const matrix = require(${matrixPath});
  matrix.manifestV2 = 'supported';
  matrix.platforms[process.platform + '-' + process.arch] = { enabled: false };
  const manager = require(${managerPath});
  const create = manager.createBlockingProviders;
  manager.createBlockingProviders = options => {
    // Keep the whole app's real-blocking test flag, but do not let the manager's
    // usual test bypass override the disabled platform we are exercising.
    const flag = process.env.BLANC_UBLOCK_TEST;
    delete process.env.BLANC_UBLOCK_TEST;
    try { return create(options); }
    finally { if (flag !== undefined) process.env.BLANC_UBLOCK_TEST = flag; }
  };
` : `require(${matrixPath}).manifestV2 = 'retired';`;
fs.writeFileSync(path.join(appDir, 'retirement.cjs'), bootstrap + `
require(${JSON.stringify(path.join(root, 'src/main/main.js'))});
`);

const profile = path.join(temp, 'profile'); fs.mkdirSync(profile); fs.mkdirSync(profile + '-Dev');
const settingsFile = path.join(profile + '-Dev', 'settings.json');
fs.writeFileSync(settingsFile, JSON.stringify({ onboardingVersion: 1, adblockProvider: 'ublock-origin', adblockEnabled: true, searchSuggestions: false, usagePing: false, onePasswordEnabled: false }));
const hits = [];
let origin;
const server = http.createServer((request, response) => {
  hits.push(request.url);
  response.setHeader('Cache-Control', 'no-store');
  if (request.url.startsWith('/adsbygoogle.js')) { response.setHeader('Content-Type', 'application/javascript'); response.end('window.adReached = true;'); return; }
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><title>Retirement fixture</title><p id="ready">Real Blanc blocker fixture</p><script src="http://pagead2.googlesyndication.com:${server.address().port}/adsbygoogle.js"></script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${server.address().port}`;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env; void ignored;
let electron;
let stderr = '';
const call = (method, ...args) => hooks.callTestHook(electron, method, args);
const watchdog = setTimeout(() => electron?.process().kill('SIGKILL'), 90000);
try {
  electron = await _electron.launch({ args: [appDir, `--user-data-dir=${profile}`, '--host-resolver-rules=MAP pagead2.googlesyndication.com 127.0.0.1'], chromiumSandbox: true,
    env: { ...env, BLANC_TEST: '1', BLANC_UBLOCK_TEST: '1' } });
  electron.process().stderr.on('data', data => { stderr = (stderr + data).slice(-6000); });
  await electron.firstWindow();
  const state = await waitForValue(() => call('blockingStatus'), value => value.phase === 'ready', 'real Blanc fallback ready', 20000);
  await waitForValue(() => call('startupReady'), Boolean, 'startup navigation gate released', 20000);
  assert.equal(state.active, 'blanc'); assert.equal(state.selected, 'ublock-origin');
  assert.equal(state.fallback, expectedFallback); assert.equal(state.restartPending, false);
  assert.equal(state.supported, false);
  assert.equal(await electron.evaluate(({ webContents }) => webContents.getAllWebContents().some(wc => wc.getType() === 'backgroundPage')), false, 'no native uBO background loaded');
  async function visit(route, privateTab = false) {
    const id = await call('openTab', origin + route, { private: privateTab });
    const page = await waitForValue(async () => (await electron.windows()).find(page => page.url() === origin + route), Boolean, 'fixture tab');
    await page.locator('#ready').waitFor();
    await waitForValue(async () => (await call('state')).tabs.find(tab => tab.id === id && !tab.isLoading), Boolean, 'fixture finished');
    return page;
  }
  await visit('/ordinary'); await visit('/private', true);
  assert(hits.includes('/ordinary')); assert(hits.includes('/private'));
  assert(!hits.some(url => url.startsWith('/adsbygoogle.js')), 'fallback cancels real ad requests before they reach the fixture');
  await visit('/shield');
  await focus.focusFixtureWindow(electron);
  const chrome = (await electron.windows()).find(page => page.url() === 'blanc-chrome://index/');
  await chrome.locator('#pillShield').click();
  const overlay = await waitForValue(async () => (await electron.windows()).find(page => page.url() === 'blanc-chrome://overlay/'), Boolean, 'shield overlay');
  await overlay.locator('#shieldPop').waitFor({ state: 'visible' });
  assert.equal(await overlay.locator('#shieldPopCurrentProvider').innerText(), 'Blanc Blocker');
  assert((await overlay.locator('#shieldPop').innerText()).includes('Your uBO settings are saved.'));
  if (unavailable) assert((await overlay.locator('#shieldPop').innerText()).includes('uBlock Origin isn’t available in this build.'));
  await overlay.locator('#shieldPopChangeProvider').click();
  assert(await overlay.locator('[name="shieldProvider"][value="blanc"]').isChecked());
  assert.equal(await overlay.locator('#shieldPopApply').innerText(), 'Done');
  await overlay.locator('#shieldPopClose').click();
  assert.equal(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).adblockProvider, 'ublock-origin', 'opening/closing the chooser preserves uBO preference');
  await call('setAdblock', false);
  const off = await visit('/off');
  await waitForValue(() => off.evaluate(() => window.adReached), Boolean, 'explicit global-off permits the control request');
  assert(hits.some(url => url.startsWith('/adsbygoogle.js')));
  assert.equal((await call('blockingStatus')).enabled, false);
  console.log(`${unavailable ? 'Unavailable uBO fallback' : 'MV2 retirement'} passed: full-app startup, real Blanc network blocking in regular/private tabs, truthful shield/Done, saved uBO choice, no uBO background, explicit global-off.`);
} catch (error) { console.error(stderr); throw error; }
finally {
  clearTimeout(watchdog);
  await electron?.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
}
