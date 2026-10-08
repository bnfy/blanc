// bench/translate/harness/main.js
// Usage: npx electron bench/translate/harness/main.js --out=<dir> [--host=view|window]
'use strict';
const { app, BrowserWindow, WebContentsView, protocol, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { summarize, renderQualityReport } = require('../lib/report.js');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const ENGINE = path.join(CACHE, 'engine');
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = path.resolve(arg('out', path.join(ROOT, 'results', 'local')));
const HOST = arg('host', 'view');
if (!['view', 'window'].includes(HOST)) throw new Error(`--host must be view or window, got ${HOST}`);
const INPUTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'inputs.json'), 'utf8'));
const FIXTURES = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', 'markup.json'), 'utf8'));
const SCHEME = 'bench-translate';
const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'none'; style-src 'unsafe-inline'";
const FILES = {
  'engine.html': path.join(__dirname, 'engine.html'),
  'engine.js': path.join(__dirname, 'engine.js'),
  'engine.worker.js': path.join(__dirname, 'engine.worker.js'),
  'bergamot-translator.js': path.join(ENGINE, 'bergamot-translator.js'),
};
const TIMEOUT_MS = 15 * 60 * 1000;
const STARTUP_MS = 30 * 1000;
const SETTLE_MS = 5000;

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true } }]);

// --host=window destroys its host window between cycles; without this listener
// Electron would quit (exit 0, no results) as soon as that window closes.
app.on('window-all-closed', () => {});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const samples = [];
let phase = 'pre';
let suffix = '';
let engine = null; // { view, hostWindow, contents, pid, hostPid }
let waiters = {};
let currentMode = 'full';

function sample() {
  const metrics = app.getAppMetrics();
  const kbOf = (pid) => {
    const m = pid ? metrics.find((x) => x.pid === pid) : null;
    return m ? m.memory.workingSetSize : null;
  };
  const main = metrics.find((m) => m.type === 'Browser');
  samples.push({
    t: Date.now(),
    phase,
    mainKB: main ? main.memory.workingSetSize : null,
    engineKB: engine ? kbOf(engine.pid) : null,
    hostKB: engine && engine.hostWindow ? kbOf(engine.hostPid) : null,
    totalKB: metrics.reduce((sum, m) => sum + m.memory.workingSetSize, 0),
  });
}

function fail(message) {
  console.error(`Phase 0 harness failed: ${message}`);
  app.exit(1);
}

const waitFor = (name) => new Promise((resolve) => { waiters[name] = resolve; });
const settle = (name, value) => { const w = waiters[name]; delete waiters[name]; if (w) w(value); };

function setPhase(p) {
  phase = p + suffix;
  sample();
}

async function createEngine() {
  const webPreferences = {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    backgroundThrottling: false,
    preload: path.join(__dirname, 'preload.js'),
  };
  const view = new WebContentsView({ webPreferences });
  let hostWindow = null;
  if (HOST === 'window') {
    hostWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    await hostWindow.loadURL('about:blank');
    hostWindow.contentView.addChildView(view);
  }
  const contents = view.webContents;
  contents.on('render-process-gone', (_e, d) => fail(`engine renderer gone: ${d.reason}`));
  contents.on('console-message', (e) => console.log(`[engine] ${e.message}`));
  const hello = waitFor('hello');
  const timer = setTimeout(() => fail(`engine view (host=${HOST}) did not start within ${STARTUP_MS} ms; rerun with --host=window and record the divergence`), STARTUP_MS);
  await contents.loadURL(`${SCHEME}://harness/engine.html`);
  engine = { view, hostWindow, contents, pid: contents.getOSProcessId(), hostPid: hostWindow ? hostWindow.webContents.getOSProcessId() : null };
  await hello;
  clearTimeout(timer);
}

async function destroyEngine() {
  const { contents, hostWindow } = engine;
  const terminated = waitFor('terminated');
  contents.send('bench:terminate');
  await terminated;
  setPhase('worker-terminated');
  await sleep(SETTLE_MS);
  const gone = new Promise((r) => contents.once('destroyed', r));
  contents.close();
  await gone;
  if (hostWindow) hostWindow.destroy();
  engine = null;
  setPhase('destroyed');
  await sleep(SETTLE_MS);
}

async function runCycle(mode) {
  currentMode = mode;
  setPhase('idle');
  await createEngine();
  const report = waitFor('report');
  return report;
}

app.whenReady().then(async () => {
  protocol.handle(SCHEME, (req) => {
    const name = new URL(req.url).pathname.replace(/^\//, '');
    const file = FILES[name];
    if (!file) return new Response('not found', { status: 404 });
    const type = name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8';
    return new Response(fs.readFileSync(file), { headers: { 'content-type': type, 'content-security-policy': CSP } });
  });

  ipcMain.on('bench:hello', () => settle('hello'));
  ipcMain.handle('bench:inputs', () => ({
    mode: currentMode,
    wasm: fs.readFileSync(path.join(ENGINE, 'bergamot-translator.wasm')),
    model: fs.readFileSync(path.join(CACHE, 'model')),
    lex: fs.readFileSync(path.join(CACHE, 'lex')),
    vocab: fs.readFileSync(path.join(CACHE, 'vocab')),
    fixtureHtml: fs.readFileSync(path.join(CACHE, 'fixture.html'), 'utf8'),
    fixtures: FIXTURES,
    run: INPUTS.run,
  }));
  ipcMain.on('bench:mark', (_e, p) => setPhase(p));
  ipcMain.on('bench:report', (_e, cycle) => settle('report', cycle));
  ipcMain.on('bench:terminated', () => settle('terminated'));
  ipcMain.on('bench:fail', (_e, m) => fail(m));

  setTimeout(() => fail('timed out after 15 minutes'), TIMEOUT_MS).unref();
  setInterval(sample, 100).unref();

  // 'pre': the bare Electron process tree before any engine view exists.
  await sleep(1000);

  const full = await runCycle('full');
  setPhase('settle');
  await sleep(SETTLE_MS);
  await destroyEngine();

  suffix = '-2';
  const short = await runCycle('short');
  await destroyEngine();

  const engineManifest = JSON.parse(fs.readFileSync(path.join(ENGINE, 'engine-manifest.json'), 'utf8'));
  const inputsMeta = JSON.parse(fs.readFileSync(path.join(CACHE, 'inputs-meta.json'), 'utf8'));
  const summary = summarize({
    host: {
      platform: process.platform,
      arch: process.arch,
      cpuModel: os.cpus()[0].model.trim(),
      cpuCount: os.cpus().length,
      totalMemMB: Math.round(os.totalmem() / 1048576),
      electron: process.versions.electron,
      engineHost: HOST,
      rendererBackgrounding: !app.commandLine.hasSwitch('disable-renderer-backgrounding'),
    },
    sizes: {
      engine: {
        jsBytes: engineManifest.files['bergamot-translator.js'].bytes,
        wasmBytes: engineManifest.files['bergamot-translator.wasm'].bytes,
        wasmGzBytes: engineManifest.files['bergamot-translator.wasm'].gzBytes,
      },
      model: inputsMeta.model,
    },
    cycles: [full, short],
    samples,
    fixtures: FIXTURES,
  });
  summary.provenance = { engine: engineManifest, fixture: inputsMeta.fixture, researchOnlySources: true };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify({ cycles: [full, short], samples }, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'quality.html'), renderQualityReport(full, FIXTURES));
  console.log(JSON.stringify({ ...summary, markup: summary.markup.counts }, null, 2));
  app.exit(0);
}).catch((err) => fail(String((err && err.stack) || err)));
