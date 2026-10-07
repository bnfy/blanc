// Packaged persistence acceptance for async routine saves (PR #606). Drives a
// signed, packaged Blanc over Chromium's remote debugging endpoint (no test
// hook, production fuses intact) with a scratch profile on the real disk:
//
// 1. settings, Favorites, history and a Named Workspace survive a HARD KILL
//    shortly after the change (the asynchronous routine-save path);
// 2. the same survive a graceful quit right after the change (quit flush);
// 3. a deleted named profile's folder is removed and never recreated;
// 4. optionally, main-thread responsiveness under a browsing + autosave
//    workload, compared with a baseline build (BLANC_BASELINE_EXECUTABLE).
//
// BLANC_SEED_FROM=<real userData dir> copies that profile's history.json and
// bookmarks.json into each scratch profile so saves run at real sizes. The
// copies stay in the temp directory and are deleted afterwards.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';
import polling from './support/poll.js';

const { waitForValue: wait } = polling;
const defaultExecutable = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || '', 'Programs', 'blanc', 'Blanc.exe')
  : path.resolve('dist/mac-arm64/Blanc.app/Contents/MacOS/Blanc');
const executable = process.env.BLANC_PACKAGED_EXECUTABLE || defaultExecutable;
const baseline = process.env.BLANC_BASELINE_EXECUTABLE || '';
const seedFrom = process.env.BLANC_SEED_FROM || '';
const workloadSeconds = Number(process.env.BLANC_WORKLOAD_SECONDS || 60);
// BLANC_WORKLOAD_ONLY=1 skips the persistence checks; BLANC_WORKLOAD_ROUNDS
// alternates candidate and baseline workloads to average out machine noise.
const workloadOnly = process.env.BLANC_WORKLOAD_ONLY === '1';
const workloadRounds = Math.max(1, Number(process.env.BLANC_WORKLOAD_ROUNDS || 1));
assert.ok(fs.existsSync(executable), `Packaged Blanc not found: ${executable}`);
if (baseline) assert.ok(fs.existsSync(baseline), `Baseline Blanc not found: ${baseline}`);
const { ELECTRON_RUN_AS_NODE: _ignored, ...cleanEnv } = process.env;
void _ignored;

const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://127.0.0.1').pathname.split('/').pop() || 'root';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><title>Persistence ${name}</title><p>${name}</p>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const page = name => `${base}/p/${name}`;

const profiles = [];
function scratchProfile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-persistence-'));
  profiles.push(dir);
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({
    onboardingVersion: 1, usagePing: false, searchSuggestions: false,
    patron: { kind: 'founding', activatedAt: Date.now() },
  }));
  for (const name of seedFrom ? ['history.json', 'bookmarks.json'] : []) {
    const source = path.join(seedFrom, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(dir, name));
  }
  return dir;
}
const readJson = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const has = (value, needle) => JSON.stringify(value).includes(needle);

let app = null;
let chrome = null;
async function launch(exe, dir) {
  app = await launchPackagedOverCdp({ executablePath: exe,
    args: [`--user-data-dir=${dir}`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'],
    env: { ...cleanEnv, BLANC_TEST: '0' }, timeoutMs: 40_000 });
  app.context.setDefaultTimeout(15_000);
  chrome = await wait(() => Promise.resolve(app.pages().find(p => p.url() === 'blanc-chrome://index/')), Boolean, 'packaged chrome', 30_000);
  await settle();
}
const tabs = () => chrome.evaluate(() => window.browserAPI.getAllTabs());
const settle = () => wait(tabs, value => value.tabs.length && value.tabs.every(tab => !tab.isLoading), 'settled tabs', 30_000);
async function settingsPage() {
  await chrome.evaluate(() => window.browserAPI.openPage('settings'));
  return wait(() => Promise.resolve(app.pages().find(p => p.url().startsWith('blanc://settings/'))), Boolean, 'settings page');
}
async function closeSettings(settings) { await settings.evaluate(() => window.bowserPages.surface.close()).catch(() => {}); }
async function open(url) { const id = await chrome.evaluate(u => window.browserAPI.createTab(u), url); await settle(); return id; }
async function quit() {
  const owned = app;
  const session = await owned.browser.newBrowserCDPSession();
  void session.send('Browser.close').catch(() => {});
  await wait(() => Promise.resolve(owned.process.exitCode), code => code !== null, 'graceful exit', 30_000);
  assert.equal(owned.process.exitCode, 0, 'graceful quit must exit 0');
  await Promise.race([owned.browser.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 1_000))]);
  app = null;
}
// Quit the way a user does, so Electron runs its normal quit sequence
// (before-quit flushes). CDP's Browser.close is not a user quit.
async function userQuit() {
  const owned = app;
  if (process.platform === 'win32') void chrome.evaluate(() => window.browserAPI.closeWindow()).catch(() => {});
  else owned.process.kill('SIGTERM');
  await wait(() => Promise.resolve(owned.process.exitCode ?? owned.process.signalCode), code => code !== null, 'user quit exit', 30_000);
  await Promise.race([owned.browser.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 1_000))]);
  await new Promise(resolve => setTimeout(resolve, 2_000));
  app = null;
}
async function hardKill() {
  const owned = app;
  owned.process.kill('SIGKILL');
  await wait(() => Promise.resolve(owned.process.exitCode ?? owned.process.signalCode), code => code !== null, 'killed process exit', 15_000);
  await Promise.race([owned.browser.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 1_000))]);
  // Let helper processes release the profile before the next launch.
  await new Promise(resolve => setTimeout(resolve, 3_000));
  app = null;
}

const results = [];
const pass = name => { results.push(name); console.log(`PASS ${name}`); };

async function persistenceChecks(exe) {
  const dir = scratchProfile();
  // Phase 1: change everything, wait past the debounce, then kill hard.
  await launch(exe, dir);
  const initial = (await tabs()).tabs.map(tab => tab.id);
  let settings = await settingsPage();
  await settings.evaluate(() => window.bowserPages.settings.set({ searchEngine: 'brave', theme: 'dark' }));
  await closeSettings(settings);
  await open(page('alpha'));
  await chrome.evaluate(() => window.browserAPI.saveFavorite());
  await wait(() => chrome.evaluate(() => window.browserAPI.listFavorites()), list => has(list, page('alpha')), 'Favorite saved');
  await open(page('beta'));
  for (const id of initial) await chrome.evaluate(id => window.browserAPI.closeTab(id), id);
  const saved = await chrome.evaluate(() => window.browserAPI.saveWorkspaceAs('Persistence probe'));
  assert.equal(saved.ok, true, JSON.stringify(saved));
  await open(page('gamma')); // a tab change after Save As: autosave only
  // Debounce + async write, well under any human pause. Positive control:
  // BLANC_KILL_DELAY_MS=0 kills before the save and must fail this phase.
  await new Promise(resolve => setTimeout(resolve, Number(process.env.BLANC_KILL_DELAY_MS ?? 2_000)));
  await hardKill();
  const workspace = () => readJson(dir, 'workspaces.json').workspaces.find(w => w.name === 'Persistence probe');
  assert.equal(readJson(dir, 'settings.json').searchEngine, 'brave', 'setting after hard kill');
  assert.equal(readJson(dir, 'settings.json').theme, 'dark', 'theme after hard kill');
  assert.ok(has(readJson(dir, 'bookmarks.json'), page('alpha')), 'Favorite after hard kill');
  for (const name of ['alpha', 'beta', 'gamma']) assert.ok(has(readJson(dir, 'history.json'), page(name)), `history ${name} after hard kill`);
  assert.ok(workspace()?.urls.includes(page('gamma')), `workspace autosave after hard kill: ${JSON.stringify(workspace()?.urls)}`);
  pass('settings, Favorite, history and workspace autosave reach disk without a clean quit');

  // Phase 2: relaunch, answer the crash-recovery prompt as a user would (web
  // navigation is held until then), confirm through the app itself, change
  // again, quit at once.
  await launch(exe, dir);
  const prompt = await wait(() => Promise.resolve(app.pages().find(p => p.url().startsWith('blanc://newtab'))), Boolean, 'recovery prompt');
  // Restoring replaces the prompt page, which can close under the call.
  const recovered = await prompt.evaluate(() => window.bowserPages.start.recoverSession('restore'))
    .catch(error => { if (!/closed/i.test(error.message)) throw error; return { closed: true }; });
  assert.notEqual(recovered?.ok, false, `restore after unclean exit: ${JSON.stringify(recovered)}`);
  // Restoring replaces the recovery window too: pick up the restored one.
  await wait(async () => {
    const live = app.pages().find(p => !p.isClosed() && p.url() === 'blanc-chrome://index/');
    if (!live) return false;
    chrome = live;
    return (await tabs().catch(() => ({ tabs: [] }))).tabs.some(tab => tab.url === page('gamma'));
  }, Boolean, 'restored window after unclean exit', 30_000);
  await settle();
  settings = await settingsPage();
  const loaded = await settings.evaluate(() => window.bowserPages.settings.get());
  assert.equal(loaded.searchEngine ?? loaded.settings?.searchEngine, 'brave', 'app reads the setting back');
  await settings.evaluate(() => window.bowserPages.settings.set({ theme: 'light' }));
  await closeSettings(settings);
  assert.ok(has(await chrome.evaluate(() => window.browserAPI.listFavorites()), page('alpha')), 'app lists the Favorite');
  const listed = await chrome.evaluate(() => window.browserAPI.listWorkspaces());
  assert.ok(listed.items.some(w => w.name === 'Persistence probe'), 'app lists the workspace');
  const opened = await chrome.evaluate(id => window.browserAPI.openWorkspace(id), listed.items.find(w => w.name === 'Persistence probe').id);
  assert.equal(opened.ok, true, JSON.stringify(opened));
  await settle();
  const gamma = (await tabs()).tabs.find(tab => tab.url === page('gamma'));
  assert.ok(gamma, 'workspace reopens with the autosaved tab');
  await open(page('delta'));
  await chrome.evaluate(id => window.browserAPI.closeTab(id), gamma.id);
  await userQuit(); // no wait: the quit flush must write it
  assert.equal(readJson(dir, 'settings.json').theme, 'light', 'setting after immediate quit');
  assert.ok(has(readJson(dir, 'history.json'), page('delta')), 'history after immediate quit');
  assert.ok(workspace().urls.includes(page('delta')) && !workspace().urls.includes(page('gamma')), `workspace after immediate quit: ${JSON.stringify(workspace().urls)}`);
  pass('changes made just before a graceful quit are saved');

  // Phase 3: a named profile with data, then deleted.
  await launch(exe, dir);
  settings = await settingsPage();
  const before = new Set(app.pages());
  const created = await settings.evaluate(() => window.bowserPages.profiles.create('Persistence Probe'));
  const id = (await settings.evaluate(() => window.bowserPages.profiles.list())).profiles?.find?.(p => p.name === 'Persistence Probe')?.id
    ?? (await settings.evaluate(() => window.bowserPages.profiles.list())).find?.(p => p.name === 'Persistence Probe')?.id;
  assert.ok(id, `profile created: ${JSON.stringify(created)}`);
  const profileChrome = await wait(() => Promise.resolve(app.pages().find(p => !before.has(p) && p.url() === 'blanc-chrome://index/')), Boolean, 'profile window');
  await profileChrome.evaluate(u => window.browserAPI.createTab(u), page('profile-page'));
  const profileDir = path.join(dir, 'profiles', id);
  await wait(() => Promise.resolve(fs.existsSync(path.join(profileDir, 'history.json')) && has(readJson(profileDir, 'history.json'), page('profile-page'))), Boolean, 'profile history on disk', 15_000);
  const removed = await settings.evaluate(id => window.bowserPages.profiles.remove(id, 'Persistence Probe'), id);
  assert.equal(removed.ok, true, JSON.stringify(removed));
  await wait(() => Promise.resolve(!fs.existsSync(profileDir)), Boolean, 'profile folder removed', 15_000);
  await new Promise(resolve => setTimeout(resolve, 3_000));
  assert.equal(fs.existsSync(profileDir), false, 'profile folder stays removed');
  await closeSettings(settings);
  await quit();
  assert.equal(fs.existsSync(profileDir), false, 'profile folder stays removed after quit');
  await launch(exe, dir);
  assert.equal(fs.existsSync(profileDir), false, 'profile folder stays removed after relaunch');
  await quit();
  pass('a deleted profile\'s folder is removed and never recreated');
}

// Main-thread responsiveness: the chrome renderer times a cheap IPC round trip
// every 25 ms while tabs open, navigate and close with a workspace bound.
async function workload(exe, label) {
  const dir = scratchProfile();
  await launch(exe, dir);
  const initial = (await tabs()).tabs.map(tab => tab.id);
  await open(page('w0'));
  for (const id of initial) await chrome.evaluate(id => window.browserAPI.closeTab(id), id);
  assert.equal((await chrome.evaluate(() => window.browserAPI.saveWorkspaceAs('Workload'))).ok, true);
  await chrome.evaluate(() => {
    window.__probe = { samples: [], slow: [], stop: false, start: performance.now() };
    const tick = async () => {
      while (!window.__probe.stop) {
        const t = performance.now();
        await window.browserAPI.getAllTabs();
        const ms = performance.now() - t;
        window.__probe.samples.push(ms);
        if (ms > 60) window.__probe.slow.push({ atS: +((t - window.__probe.start) / 1000).toFixed(2), ms: +ms.toFixed(1) });
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    };
    tick();
  });
  const end = Date.now() + workloadSeconds * 1000;
  const open_ = [];
  for (let n = 1; Date.now() < end; n++) {
    open_.push(await chrome.evaluate(u => window.browserAPI.createTab(u), page(`w${n}`)));
    if (open_.length > 6) await chrome.evaluate(id => window.browserAPI.closeTab(id), open_.shift());
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  const { samples, slow } = await chrome.evaluate(() => { window.__probe.stop = true; return { samples: window.__probe.samples, slow: window.__probe.slow }; });
  await quit();
  const sorted = [...samples].sort((a, b) => a - b);
  const stat = {
    label, samples: samples.length,
    p50: +sorted[Math.floor(sorted.length * 0.5)].toFixed(1),
    p99: +sorted[Math.floor(sorted.length * 0.99)].toFixed(1),
    max: +sorted.at(-1).toFixed(1),
    over100: samples.filter(x => x > 100).length,
    over250: samples.filter(x => x > 250).length,
    historyBytes: fs.statSync(path.join(dir, 'history.json')).size,
    slow, // every round trip over 60 ms, seconds into the workload
  };
  console.log(`WORKLOAD ${JSON.stringify(stat)}`);
  return stat;
}

try {
  console.log(`Candidate: ${executable}${baseline ? `\nBaseline: ${baseline}` : ''}${seedFrom ? `\nSeeded from: ${seedFrom}` : ''}`);
  if (!workloadOnly) await persistenceChecks(executable);
  const runs = { candidate: [], baseline: [] };
  for (let round = 1; round <= workloadRounds; round++) {
    runs.candidate.push(await workload(executable, `candidate#${round}`));
    if (baseline) runs.baseline.push(await workload(baseline, `baseline#${round}`));
  }
  const sum = list => ({ maxes: list.map(r => r.max), p99s: list.map(r => r.p99), over100: list.reduce((n, r) => n + r.over100, 0), over250: list.reduce((n, r) => n + r.over250, 0) });
  if (baseline) console.log(`RESPONSIVENESS candidate ${JSON.stringify(sum(runs.candidate))} vs baseline ${JSON.stringify(sum(runs.baseline))}`);
  console.log(`Packaged persistence PASS (${process.platform}): ${workloadOnly ? 'workload only' : `${results.length} checks`}`);
} finally {
  try { if (app) app.process.kill('SIGKILL'); } catch {}
  server.close();
  for (const dir of profiles) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}
