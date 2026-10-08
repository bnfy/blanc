// Reproducible native evidence for CodeQL alert #77. Exercise uBO's real
// no-scripting switch and original noscript reconstruction under its required
// CSP; this does not claim arbitrary DOM parsing is safe.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { _electron } from 'playwright';
import poll from './support/poll.js';
import hooks from './support/test-hook-call.js';
const { waitForValue } = poll;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-ubo-noscript-'));
const profile = path.join(temp, 'profile');
fs.mkdirSync(profile); fs.mkdirSync(profile + '-Dev');
fs.writeFileSync(path.join(profile + '-Dev', 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockProvider: 'ublock-origin', adblockEnabled: true,
  searchSuggestions: false, usagePing: false, onePasswordEnabled: false,
}));
const hits = [];
const payload = '<span id="fallback">Fallback rendered</span>'
  + '<img src="/missing.png" onerror="window.eventRan=true;fetch(\'/marker/event\')">'
  + '<a id="script-link" href="javascript:window.linkRan=true;void fetch(\'/marker/link\')">Link</a>'
  + '<script>window.insertedScriptRan=true;fetch("/marker/script")</script>'
  + '<meta http-equiv="refresh" content="0;url=javascript:window.metaRan=true">';
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://fixture').pathname;
  hits.push(pathname);
  response.setHeader('Cache-Control', 'no-store');
  if (pathname === '/missing.png') { response.writeHead(404); response.end(); return; }
  if (pathname.startsWith('/marker/')) { response.end('fixture'); return; }
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Noscript policy fixture</title><body>'
    + '<script>window.originalScriptRan=true</script>'
    + (pathname === '/active-control' ? payload : `<noscript>${payload}</noscript>`) + '</body>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const { ELECTRON_RUN_AS_NODE: ignored, ...env } = process.env; void ignored;
let electron;
// app.process() throws once Playwright disposes an exited app, so keep the
// ChildProcess captured at launch (see ublock-origin.mjs).
let electronProcess;
let stderr = '';
const call = (method, ...args) => hooks.callTestHook(electron, method, args);
const watchdog = setTimeout(() => electronProcess?.kill('SIGKILL'), 90000);
try {
  electron = await _electron.launch({
    args: [path.resolve('.'), `--user-data-dir=${profile}`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'],
    chromiumSandbox: true, env: { ...env, BLANC_TEST: '1', BLANC_UBLOCK_TEST: '1' }, timeout: 30000,
  });
  electronProcess = electron.process();
  electron.context().setDefaultTimeout(10000);
  electronProcess.stderr.on('data', data => { stderr = (stderr + data).slice(-6000); });
  await electron.firstWindow();
  await waitForValue(async () => {
    const value = await call('blockingStatus');
    assert.notEqual(value.phase, 'failed', JSON.stringify(value));
    return value;
  }, value => value.phase === 'ready', 'uBO ready', 40000);
  await waitForValue(() => call('startupReady'), Boolean, 'startup released', 10000);
  async function visit(route) {
    const id = await call('openTab', origin + route);
    const page = await waitForValue(async () => (await electron.windows()).find(item => item.url() === origin + route), Boolean, 'fixture page');
    await page.waitForLoadState('load');
    return { id, page };
  }
  const control = await visit('/active-control');
  await control.page.waitForFunction(() => window.originalScriptRan && window.insertedScriptRan && window.eventRan);
  await control.page.locator('#script-link').evaluate(node => node.click());
  await control.page.waitForFunction(() => window.linkRan === true);
  await waitForValue(() => hits.filter(value => value.startsWith('/marker/')).length, value => value === 3, 'active payload controls');
  const protectedStart = hits.length;
  const policy = await electron.evaluate(async ({ webContents }, tabId) => {
    const bg = webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage');
    return bg.executeJavaScript(`(() => {
      µBlock.toggleHostnameSwitch({ name: 'no-scripting', hostname: '127.0.0.1', state: true, tabId: ${JSON.stringify(tabId)} });
      return { actual: µBlock.hiddenSettings.noScriptingCSP, required: µBlock.hiddenSettingsDefault.noScriptingCSP };
    })()`);
  }, control.id);
  assert.equal(policy.actual, policy.required);
  const protectedPage = await visit('/probe');
  await protectedPage.page.locator('#fallback').waitFor({ state: 'visible' });
  await protectedPage.page.locator('#script-link').evaluate(node => node.click());
  // Give queued image events/navigation tasks a turn; the missing-image request
  // proves the reconstructed DOM was attached and its event control completed.
  await waitForValue(() => hits.slice(protectedStart).includes('/missing.png'), Boolean, 'reconstructed image request');
  await protectedPage.page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
  const result = await protectedPage.page.evaluate(() => ({
    fallbackText: document.querySelector('#fallback').textContent,
    originalScriptRan: window.originalScriptRan === true,
    eventRan: window.eventRan === true, linkRan: window.linkRan === true,
    insertedScriptRan: window.insertedScriptRan === true, metaRan: window.metaRan === true,
    location: location.pathname, nodeAccess: typeof require,
    noscriptCount: document.querySelectorAll('noscript').length,
  }));
  assert.deepEqual(result, { fallbackText: 'Fallback rendered', originalScriptRan: false,
    eventRan: false, linkRan: false, insertedScriptRan: false, metaRan: false,
    location: '/probe', nodeAccess: 'undefined', noscriptCount: 0 });
  assert.deepEqual(hits.slice(protectedStart).filter(value => value.startsWith('/marker/')), []);
  const runtime = await electron.evaluate(async ({ app, webContents }, url) => {
    const wc = webContents.getAllWebContents().find(item => item.getURL() === url);
    const prefs = wc.getLastWebPreferences();
    const bg = webContents.getAllWebContents().find(item => item.getType() === 'backgroundPage');
    return {
      electron: process.versions.electron, os: process.platform, arch: process.arch,
      pagePreferences: { sandbox: prefs.sandbox, nodeIntegration: prefs.nodeIntegration, contextIsolation: prefs.contextIsolation },
      backgroundSandboxed: app.getAppMetrics().find(metric => metric.pid === bg.getOSProcessId())?.sandboxed ?? null,
      backgroundNodeAccess: await bg.executeJavaScript('typeof require'),
    };
  }, origin + '/probe');
  assert.deepEqual(runtime.pagePreferences, { sandbox: true, nodeIntegration: false, contextIsolation: true });
  assert.equal(runtime.backgroundNodeAccess, 'undefined');
  // Linux process sandbox evidence is checked through /proc in the main suite;
  // Electron's app metrics do not expose that observation on Linux.
  if (process.platform !== 'linux') assert.equal(runtime.backgroundSandboxed, true);
  await electron.evaluate(async ({ webContents }, tabId) => {
    const bg = webContents.getAllWebContents().find(wc => wc.getType() === 'backgroundPage');
    await bg.executeJavaScript(`µBlock.toggleHostnameSwitch({ name: 'no-scripting', hostname: '127.0.0.1', state: false, tabId: ${JSON.stringify(tabId)} })`);
  }, protectedPage.id);
  const restored = await visit('/off-control');
  await restored.page.waitForFunction(() => window.originalScriptRan === true);
  console.log(JSON.stringify({ alert: 77, ublock: '1.75.0', ...runtime, policy,
    activeControl: { originalScript: true, insertedScript: true, errorHandler: true, javascriptLink: true },
    protected: result, protectedMarkerRequests: [], offControlOriginalScript: true, passed: true }, null, 2));
} catch (error) { console.error(stderr); throw error; }
finally {
  clearTimeout(watchdog);
  if (electron) {
    const kill = setTimeout(() => electronProcess.kill('SIGKILL'), 5000);
    try { await electron.close(); } catch {} finally { clearTimeout(kill); }
  }
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
}
