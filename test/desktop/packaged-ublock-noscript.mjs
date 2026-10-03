// Alert #77 evidence against a packaged executable, with production IPC and
// uBO's actual popup control. No main-process inspector or development hooks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { extractFile } from '@electron/asar';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';
import poll from './support/poll.js';
const { waitForValue } = poll;
const executable = process.env.BLANC_PACKAGED_EXECUTABLE;
const asar = process.env.BLANC_PACKAGED_ASAR;
const output = process.env.BLANC_UBLOCK_EVIDENCE;
assert(executable && asar && output, 'Set BLANC_PACKAGED_EXECUTABLE, BLANC_PACKAGED_ASAR and BLANC_UBLOCK_EVIDENCE');
// Claim the evidence file with one exclusive create, not a separate existence
// check: an existing file still stops the probe before any setup.
fs.mkdirSync(path.dirname(output), { recursive: true });
let outputFd;
try { outputFd = fs.openSync(output, 'wx'); }
catch (error) { throw error.code === 'EEXIST' ? new Error('Evidence output must be a new file') : error; }
const adjacentAsar = process.platform === 'darwin'
  ? path.resolve(path.dirname(executable), '../Resources/app.asar')
  : path.resolve(path.dirname(executable), 'resources/app.asar');
assert.equal(fs.realpathSync(asar), fs.realpathSync(adjacentAsar), 'ASAR must belong to the launched executable');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const metadata = JSON.parse(extractFile(asar, 'package.json'));
assert.equal(metadata.blancUblockBundled, true, 'Packaged app must actually bundle uBO');
const pin = JSON.parse(extractFile(asar, 'ublock/pinned.json'));
const matrix = JSON.parse(extractFile(asar, 'src/main/ublock-platforms.json'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-packaged-noscript-'));
fs.writeFileSync(path.join(temp, 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockProvider: 'ublock-origin', adblockEnabled: true,
  searchSuggestions: false, usagePing: false, onePasswordEnabled: false,
}));
let phase = 'active';
const hits = [];
const payload = '<span id="fallback">Fallback rendered</span>'
  + '<img src="/missing.png" onerror="window.eventRan=true;fetch(\'/marker/event\')">'
  + '<a id="script-link" href="javascript:window.linkRan=true;void fetch(\'/marker/link\')">Link</a>'
  + '<script>window.insertedScriptRan=true;fetch("/marker/script")</script>'
  + '<script src="/external.js"></script>'
  + '<meta http-equiv="refresh" content="0;url=javascript:window.metaRan=true">';
const server = http.createServer((request, response) => {
  const route = new URL(request.url, 'http://fixture').pathname;
  hits.push({ phase, route });
  response.setHeader('Cache-Control', 'no-store');
  if (route === '/missing.png') { response.writeHead(404); response.end(); return; }
  if (route.startsWith('/marker/')) { response.end('fixture'); return; }
  if (route === '/external.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end('window.externalScriptRan=true;fetch("/marker/external")'); return;
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end('<!doctype html><title>Packaged noscript fixture</title><body>'
    + '<script>window.originalScriptRan=true</script>'
    + (route === '/active-control' ? payload : `<noscript>${payload}</noscript>`)
    + '</body>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let app;
let stage = 'launch';
const report = {
  alert: 77, kind: 'packaged-cdp-probe', passed: false,
  package: { version: metadata.version, ublock: pin.version, electron: matrix.electron,
    internalCandidate: metadata.blancUblockInternalValidation === true,
    executableSha256: digest(fs.readFileSync(executable)), asarSha256: digest(fs.readFileSync(asar)) },
  os: process.platform, architecture: process.arch, osRelease: os.release(),
  limits: ['Signature, notarization, installed location and OS sandbox verification require separate evidence.',
    'Meta refresh has no executable positive control; only non-execution is observed.',
    'This tests the listed payloads, not every possible script or HTML construct.'],
};
try {
  const { ELECTRON_RUN_AS_NODE, BLANC_TEST, BLANC_UBLOCK_TEST, ...cleanEnv } = process.env;
  void ELECTRON_RUN_AS_NODE; void BLANC_TEST; void BLANC_UBLOCK_TEST;
  app = await launchPackagedOverCdp({ executablePath: executable,
    args: [`--user-data-dir=${temp}`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'],
    env: { ...cleanEnv, BLANC_TEST: '0', BLANC_UBLOCK_TEST: '0' }, timeoutMs: 40000,
  });
  app.context.setDefaultTimeout(15000);
  const pageAt = url => waitForValue(() => app.pages().find(p => p.url() === url), Boolean, 'packaged page', 40000);
  const chrome = await pageAt('blanc-chrome://index/');
  await chrome.waitForFunction(() => !!window.browserAPI);
  const open = async route => {
    await chrome.evaluate(url => window.browserAPI.createTab(url), route);
    const page = await pageAt(route); await page.waitForLoadState('load'); return page;
  };
  const settings = await open('blanc://settings/');
  const status = await waitForValue(() => settings.evaluate(() => window.bowserPages.settings.blockingStatus()), state => {
    assert.notEqual(state.phase, 'failed', state.error || 'provider failed');
    assert.equal(state.active, 'ublock-origin', 'Candidate silently fell back to Blanc');
    return state.phase === 'ready';
  }, 'packaged uBO ready', 40000);
  assert.equal(status.supported, true);
  assert.equal(status.electron, matrix.electron);
  assert.equal(status.ublock, pin.version);
  report.provider = { active: status.active, phase: status.phase, electron: status.electron, ublock: status.ublock };
  const inspect = page => page.evaluate(() => ({
    originalScriptRan: window.originalScriptRan === true, insertedScriptRan: window.insertedScriptRan === true,
    externalScriptRan: window.externalScriptRan === true, eventRan: window.eventRan === true,
    linkRan: window.linkRan === true, metaRan: window.metaRan === true,
    nodeAccess: typeof require, location: location.pathname,
    fallbackText: document.querySelector('#fallback')?.textContent ?? null,
    noscriptCount: document.querySelectorAll('noscript').length,
  }));
  const switchScripting = async on => {
    await chrome.locator('#pillShield').click();
    const overlay = await pageAt('blanc-chrome://overlay/');
    await overlay.locator('#shieldPop').waitFor({ state: 'visible' });
    await overlay.locator('#shieldPopUblock').click();
    const popup = await waitForValue(() => app.pages().find(p => p.url().includes('/popup-fenix.html')), Boolean, 'real uBO popup');
    await popup.locator('body:not(.loading)').waitFor();
    if (!await popup.locator('#no-scripting').isVisible()) await popup.locator('#blancMore').click();
    const toggle = popup.locator('#no-scripting');
    assert.equal(await toggle.evaluate(node => node.classList.contains('on')), !on, 'fresh popup state');
    await toggle.click();
    await popup.waitForFunction(value => document.querySelector('#no-scripting').classList.contains('on') === value, on);
    await popup.locator('body.needReload').waitFor();
    await popup.locator('#blancClose').click();
    await waitForValue(() => popup.isClosed(), Boolean, 'popup closed');
  };
  stage = 'positive controls';
  const control = await open(origin + '/active-control');
  await control.waitForFunction(() => window.originalScriptRan && window.insertedScriptRan && window.externalScriptRan && window.eventRan);
  await control.locator('#script-link').click();
  await control.waitForFunction(() => window.linkRan === true);
  await waitForValue(() => hits.filter(hit => hit.phase === 'active' && hit.route.startsWith('/marker/')).length, n => n === 4, 'active markers');
  report.activeControl = await inspect(control);
  stage = 'no-scripting enabled';
  await switchScripting(true);
  phase = 'protected';
  const protectedPage = await open(origin + '/probe');
  // Record the response headers after CDP attaches. Electron may omit its
  // webRequest-injected CSP here; the violation event below proves enforcement.
  const response = await protectedPage.reload();
  report.contentSecurityPolicy = await response.headerValue('content-security-policy');
  await protectedPage.locator('#fallback').waitFor();
  await protectedPage.evaluate(() => {
    window.observedPolicies = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.observedPolicies.push({ policy: event.originalPolicy, directive: event.effectiveDirective, disposition: event.disposition });
    });
  });
  await protectedPage.locator('#script-link').click();
  await waitForValue(() => hits.some(hit => hit.phase === 'protected' && hit.route === '/missing.png'), Boolean, 'reconstructed image attached');
  await protectedPage.waitForTimeout(250);
  report.protected = await inspect(protectedPage);
  report.policyViolations = await protectedPage.evaluate(() => window.observedPolicies);
  assert.deepEqual(report.protected, { originalScriptRan: false, insertedScriptRan: false,
    externalScriptRan: false, eventRan: false, linkRan: false, metaRan: false,
    nodeAccess: 'undefined', location: '/probe', fallbackText: 'Fallback rendered', noscriptCount: 0 });
  report.protectedExecutionRequests = hits.filter(hit => hit.phase === 'protected' && (hit.route.startsWith('/marker/') || hit.route === '/external.js')).map(hit => hit.route);
  assert.deepEqual(report.protectedExecutionRequests, []);
  assert(report.policyViolations.some(event => event.policy.includes('script-src http: https:') && event.disposition === 'enforce'), 'Required no-scripting policy enforcement not observed');
  stage = 'no-scripting disabled again';
  await switchScripting(false);
  phase = 'off';
  const off = await open(origin + '/off-control');
  await off.waitForFunction(() => window.originalScriptRan === true);
  report.offControl = await inspect(off);
  assert.equal((await settings.evaluate(() => window.bowserPages.settings.blockingStatus())).phase, 'ready');
  stage = 'clean shutdown';
  await app.close();
  app = null;
  report.passed = true;
} catch (error) {
  report.failure = { stage, name: error.name };
  throw error;
} finally {
  try { if (app) await app.close(); }
  finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
    fs.writeFileSync(outputFd, JSON.stringify(report, null, 2) + '\n');
    fs.closeSync(outputFd);
  }
}
console.log('Packaged uBO no-scripting probe passed; evidence saved. Signature/installed acceptance remains a separate observation.');
