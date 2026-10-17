import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { startProxy, urls, fixtures } from './proxy.mjs';

// Explicit tool locations keep this experiment independent of shipping deps.
const [electronPath, asarPath, asarModulePath, playwrightModulePath, evidencePath] = process.argv.slice(2);
assert(electronPath && asarPath && asarModulePath && playwrightModulePath && evidencePath,
  'Usage: run.mjs ELECTRON APP_ASAR ASAR_MODULE PLAYWRIGHT_MODULE EVIDENCE_DIR');
assert(!fs.existsSync(evidencePath), 'Evidence directory must be new');
fs.mkdirSync(evidencePath, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceDigest = sha(fs.readFileSync(asarPath));
const asar = await import(pathToFileURL(asarModulePath));
const { _electron } = await import(pathToFileURL(playwrightModulePath));
const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-f12-capture-')));
const appDir = path.join(sandbox, 'app');
asar.extractAll(asarPath, appDir);
const pkgPath = path.join(appDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath));
assert.equal(pkg.version, '1.36.0', 'Pilot is pinned to installed Blanc 1.36.0 source');
const instrumentation = fs.readFileSync(new URL('./bootstrap.cjs', import.meta.url));
fs.writeFileSync(path.join(appDir, 'capture-bootstrap.cjs'), instrumentation);
fs.writeFileSync(pkgPath, JSON.stringify({ ...pkg, main: 'capture-bootstrap.cjs' }));
const profile = path.join(sandbox, 'profile');
fs.mkdirSync(profile); fs.mkdirSync(profile + '-Dev');
fs.writeFileSync(path.join(profile + '-Dev', 'settings.json'), JSON.stringify({
  onboardingVersion: 1, adblockProvider: 'blanc', adblockEnabled: true,
  searchSuggestions: false, usagePing: false, onePasswordEnabled: false,
}));
const captureLog = path.join(evidencePath, 'decisions.jsonl');
fs.writeFileSync(captureLog, '');
const proxy = await startProxy();
const report = { kind: 'instrumented-electron-http-capture-pilot', passed: false,
  started: new Date().toISOString(), sourceAsarSha256: sourceDigest, appVersion: pkg.version,
  instrumentationSha256: sha(instrumentation),
  harnessSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))), sourceFiles: {},
  fixtures: [...fixtures].map(([url, [contentType, body]]) => ({url, contentType, sha256: sha(body)})),
  limits: ['Instrumented extracted app source on stock Electron; not a signed-package acceptance run.',
    'HTTP-only transport pilot; no TLS/CA, workers, redirects, private teardown or 157 replay yet.',
    'Authored fixture traffic, not the 4000-request acceptance corpus; no latency result.'],
  profiles: {}, cleanup: {} };
for (const file of ['src/main/adblock.js', 'src/main/blocking-coordinator.js', 'node_modules/@ghostery/adblocker-electron/dist/commonjs/index.js', 'adblock/sources/pinned.json']) {
  report.sourceFiles[file] = sha(fs.readFileSync(path.join(appDir, file)));
}
report.filterManifest = JSON.parse(fs.readFileSync(path.join(appDir, 'adblock/sources/pinned.json')));
let electron, child;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  const end = Date.now() + 60000;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await pause(100); }
  throw new Error('Timed out: ' + label);
}
try {
  const env = { ...process.env, BLANC_TEST: '0', BLANC_UBLOCK_TEST: '0',
    BLANC_F12_PROFILE: profile, BLANC_F12_LOG: captureLog };
  delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
  electron = await _electron.launch({ executablePath: electronPath,
    args: [appDir, '--use-mock-keychain', `--user-data-dir=${profile}`, `--proxy-server=http://127.0.0.1:${proxy.port}`,
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'],
    env, chromiumSandbox: true, timeout: 60000 });
  child = electron.process();
  child.stderr.on('data', data => fs.appendFileSync(path.join(evidencePath, 'stderr.log'), data));
  const state = await until(async () => {
    const state = await electron.evaluate(() => globalThis.__blancF12Capture.state());
    assert.equal(fs.realpathSync(state.userData), fs.realpathSync(profile + '-Dev'));
    return state.activeGates === 0 && state.providers.some(p => p.status.id === 'blanc' && p.status.phase === 'ready') && state;
  }, 'real blocker ready');
  assert.equal(state.versions.electron, '44.8.0'); report.runtime = state.versions;
  report.startupGatesReleased = state.activeGates === 0;
  const chrome = await until(async () => (await electron.windows()).find(p => p.url() === 'blanc-chrome://index/'), 'Island');
  await chrome.waitForFunction(() => !!window.browserAPI);
  for (const kind of ['regular', 'private']) {
    const before = proxy.requests.length;
    const existingPages = new Set(await electron.windows());
    const id = await chrome.evaluate(({url, isPrivate}) => window.browserAPI.createTab(url, {private:isPrivate}),
      {url:urls.page, isPrivate:kind === 'private'});
    const page = await until(async () => (await electron.windows()).find(p => (kind === 'regular' || !existingPages.has(p)) && p.url() === urls.page), kind + ' fixture');
    await page.waitForFunction(() => window.pilot?.done, null, {timeout:20000});
    const dom = await page.evaluate(() => ({origin:location.origin, href:location.href, pilot:window.pilot}));
    assert.equal(dom.href, urls.page); assert(dom.pilot.allowedScript);
    assert.equal(dom.pilot.outcomes.data, '{"fixture":"allowed"}');
    assert.equal(dom.pilot.blockedScriptExecuted, undefined);
    assert.equal(dom.pilot.outcomes.noReferrerData, '{"fixture":"no-referrer"}');
    const allRecords = fs.readFileSync(captureLog,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r=>r.profileKind===kind);
    const records = allRecords.filter(r => Object.values(urls).includes(r.url));
    assert.equal(records.length, Object.keys(urls).length, 'one decision per fixture request');
    for (const url of Object.values(urls)) {
      const row = records.find(r=>r.url===url);
      assert(row, 'missing actual decision: '+url); assert.equal(row.provider,'blanc');
      assert.equal(row.status.phase,'ready'); assert(!row.error);
      // Browser-started navigation has no initiator; subresources retain the
      // actual request initiator even when referrer policy removes Referer.
      assert.equal(row.initiatorOriginPresent, url !== urls.page);
      assert.equal(row.initiatorOrigin, url === urls.page ? null : new URL(urls.page).origin);
      if (url === urls.noReferrerData) assert.equal(row.referrer, '');
      const blocked = [urls.blockedScript, urls.blockedData].includes(url);
      assert.equal(!!(row.result.cancel || row.result.redirectURL), blocked, url);
    }
    const arrivals = proxy.requests.slice(before).filter(r=>r.known);
    assert.deepEqual(arrivals.map(r=>r.url).sort(), [urls.page,urls.script,urls.data,urls.noReferrerData].sort());
    for (const row of arrivals) assert.equal(row.host, new URL(row.url).host);
    report.profiles[kind] = {dom, decisions:records.length, allObservedDecisions:allRecords.length, arrivals};
    await chrome.evaluate(id => window.browserAPI.closeTab(id), id);
    await until(() => chrome.evaluate(async id => !(await window.browserAPI.getAllTabs()).tabs.some(tab => tab.id === id), id), 'fixture removed from tab model');
  }
  report.passed = true;
} catch (error) {
  report.error = String(error.stack || error); process.exitCode = 1;
} finally {
  if (electron) await electron.close().catch(()=>child?.kill('SIGTERM'));
  if (child && child.exitCode === null && child.signalCode === null) {
    await Promise.race([new Promise(resolve=>child.once('exit',resolve)), pause(3000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  await proxy.close();
  report.cleanup.sourceAsarUnchanged = sha(fs.readFileSync(asarPath)) === sourceDigest;
  report.cleanup.childExited = !child || child.exitCode !== null || child.signalCode !== null;
  if (report.cleanup.childExited) fs.rmSync(sandbox,{recursive:true,force:true});
  report.cleanup.disposableTreeRemoved = !fs.existsSync(sandbox);
  if (!Object.values(report.cleanup).every(Boolean)) {report.passed=false;process.exitCode=1;}
  report.finished = new Date().toISOString();
  fs.writeFileSync(path.join(evidencePath,'proxy-requests.json'),JSON.stringify(proxy.requests,null,2));
  fs.writeFileSync(path.join(evidencePath,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,error:report.error,evidencePath,cleanup:report.cleanup}));
}
