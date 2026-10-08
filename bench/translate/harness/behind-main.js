// bench/translate/harness/behind-main.js
// F43 Phase 0, second round: the engine WebContentsView attached beneath the
// active page view (mode=behind) versus never attached (mode=unattached).
// Usage: npx electron bench/translate/harness/behind-main.js --mode=behind|unattached --out=<dir> [--manual-wait=<seconds>]
'use strict';
const { app, BrowserWindow, WebContentsView, protocol, ipcMain, nativeImage, screen } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { summarizeBehind } = require('../lib/behind-report.js');
const native = require('./native.js');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache');
const ENGINE = path.join(CACHE, 'engine');
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const MODE = arg('mode', 'behind');
if (!['behind', 'unattached'].includes(MODE)) throw new Error(`--mode must be behind or unattached, got ${MODE}`);
const OUT = path.resolve(arg('out', path.join(ROOT, 'results', `behind-${MODE}`)));
const MANUAL_WAIT_MS = Number(arg('manual-wait', '0')) * 1000;
const INPUTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'inputs.json'), 'utf8'));
const SCHEME = 'bench-translate';
const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'none'; style-src 'unsafe-inline'";
const FILES = Object.fromEntries([
  'engine-cmd.html', 'engine-cmd.js', 'engine.worker.js', 'page.html', 'page.js', 'bgtab.html', 'bgtab.js', 'bgtab.worker.js',
].map((n) => [n, path.join(__dirname, n)]));
FILES['bergamot-translator.js'] = path.join(ENGINE, 'bergamot-translator.js');
const WARM_RUNS = INPUTS.run.warmRuns;
const VIEWPORT_RUNS = 5;
const STATE_RUNS = 3;
const TIMEOUT_MS = 25 * 60 * 1000;

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true } }]);
app.on('window-all-closed', () => {});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = (name) => `${SCHEME}://harness/${name}`;
let phase = 'pre';
const events = [];
const bgRates = [];
const cpu = [];
let engine = null;
let bg = null;
let interactionSkipped = null;

function fail(message) {
  console.error(`Phase 0 behind harness failed: ${message}`);
  app.exit(1);
}

function sampleCpu() {
  const metrics = app.getAppMetrics();
  const cpuOf = (wc) => {
    if (!wc || wc.isDestroyed()) return null;
    const m = metrics.find((x) => x.pid === wc.getOSProcessId());
    return m ? m.cpu.percentCPUUsage : null;
  };
  cpu.push({ t: Date.now(), phase, engineCpu: cpuOf(engine && engine.webContents), bgCpu: cpuOf(bg && bg.webContents) });
}

const pending = new Map();
let seq = 0;
function cmd(type, extra = {}) {
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    engine.webContents.send('cmd:run', { id, type, ...extra });
  });
}

const viewPrefs = (preload, extra = {}) => ({
  sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, preload), ...extra,
});

function contentRect(win) {
  const [width, height] = win.getContentSize();
  return { x: 0, y: 0, width, height };
}

async function newPage(win, name) {
  const view = new WebContentsView({ webPreferences: viewPrefs('preload-probe.js') });
  win.contentView.addChildView(view);
  view.setBounds(contentRect(win));
  await view.webContents.loadURL(url(name));
  return view;
}

async function viewportRuns(state, n) {
  phase = `viewport-${state}`;
  const ms = [];
  for (let i = 0; i < n; i++) ms.push((await cmd('translate', { which: 'viewport' })).ms);
  return ms;
}

function countPixels(file) {
  const img = nativeImage.createFromPath(file);
  const { width, height } = img.getSize();
  const buf = img.toBitmap();
  let teal = 0;
  let magenta = 0;
  for (let i = 0; i < buf.length; i += 4) {
    // Magenta (R=B high, G low) and teal (G=B high, R low) are channel-order
    // symmetric enough to classify BGRA and RGBA alike.
    const a = buf[i];
    const g = buf[i + 1];
    const c = buf[i + 2];
    if (a > 200 && c > 200 && g < 80) magenta++;
    if (g > 150 && ((a < 70 && c > 150) || (c < 70 && a > 150))) teal++;
  }
  return { tealPixels: teal, magentaPixels: magenta, total: width * height };
}

app.whenReady().then(async () => {
  protocol.handle(SCHEME, (req) => {
    const name = new URL(req.url).pathname.replace(/^\//, '');
    const file = FILES[name];
    if (!file) return new Response('not found', { status: 404 });
    const type = name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8';
    return new Response(fs.readFileSync(file), { headers: { 'content-type': type, 'content-security-policy': CSP } });
  });
  ipcMain.on('probe', (_e, role, kind, data) => {
    events.push({ t: Date.now(), phase, role, kind, data });
    if (role === 'bgtab.html' && kind === 'rate') bgRates.push({ phase, ...data });
  });
  ipcMain.on('cmd:reply', (_e, id, data) => {
    const resolve = pending.get(id);
    pending.delete(id);
    if (resolve) resolve(data);
  });
  ipcMain.on('bench:fail', (_e, m) => fail(m));
  ipcMain.handle('bench:inputs', () => ({
    wasm: fs.readFileSync(path.join(ENGINE, 'bergamot-translator.wasm')),
    model: fs.readFileSync(path.join(CACHE, 'model')),
    lex: fs.readFileSync(path.join(CACHE, 'lex')),
    vocab: fs.readFileSync(path.join(CACHE, 'vocab')),
    fixtureHtml: fs.readFileSync(path.join(CACHE, 'fixture.html'), 'utf8'),
    run: INPUTS.run,
  }));
  setTimeout(() => fail('timed out after 25 minutes'), TIMEOUT_MS).unref();
  setInterval(sampleCpu, 500).unref();

  const win1 = new BrowserWindow({ width: 1280, height: 800, show: true, title: 'Phase 0 W1', webPreferences: { sandbox: true, contextIsolation: true } });
  await win1.loadURL('about:blank');
  win1.focus();

  // Background tab: attached once, then detached, as Blanc does with inactive tabs.
  bg = await newPage(win1, 'bgtab.html');
  let page = await newPage(win1, 'page.html');
  win1.contentView.removeChildView(bg);
  phase = 'bg-noengine';
  await sleep(10_000);

  engine = new WebContentsView({ webPreferences: viewPrefs('preload-cmd.js', { backgroundThrottling: false }) });
  if (MODE === 'behind') {
    win1.contentView.addChildView(engine, 0); // index 0: beneath the page view
    engine.setBounds(contentRect(win1));
  }
  const hello = new Promise((r) => ipcMain.once('cmd:hello', r));
  await engine.webContents.loadURL(url('engine-cmd.html'));
  await hello;

  phase = 'engine-init';
  const ready = await cmd('init');
  phase = 'engine-idle';
  await sleep(10_000);
  const engineStates = { idle: await cmd('state') };
  const structure = {
    order: win1.contentView.children.map((v) => (v === engine ? 'engine' : v === page ? 'page' : 'other')),
    engineBounds: engine.getBounds(),
    pageBounds: page.getBounds(),
  };

  const viewportMs = { foreground: await viewportRuns('foreground', VIEWPORT_RUNS) };
  engineStates.foreground = await cmd('state');

  phase = 'full-cold';
  const fullColdMs = (await cmd('translate', { which: 'article' })).ms;
  phase = 'full-warm';
  const fullWarmMs = [];
  let fullOut = [];
  for (let i = 0; i < WARM_RUNS; i++) {
    const r = await cmd('translate', { which: 'article', keepOutput: i === WARM_RUNS - 1 });
    fullWarmMs.push(r.ms);
    if (r.out) fullOut = r.out;
  }

  // Tab switch: a new page view becomes active on top; the old one is detached.
  const page2 = await newPage(win1, 'page.html');
  win1.contentView.removeChildView(page);
  page.webContents.close();
  page = page2;
  viewportMs['after-tab-switch'] = await viewportRuns('after-tab-switch', STATE_RUNS);
  engineStates['after-tab-switch'] = await cmd('state');

  const [x, y] = win1.getPosition();
  const win2 = new BrowserWindow({ width: 1280, height: 800, x, y, show: true, title: 'Phase 0 W2', webPreferences: { sandbox: true, contextIsolation: true } });
  await win2.loadURL('about:blank');
  win2.focus();
  await sleep(1000);
  viewportMs['other-window'] = await viewportRuns('other-window', STATE_RUNS);
  engineStates['other-window'] = await cmd('state');

  win1.minimize();
  await sleep(1500);
  viewportMs.minimized = await viewportRuns('minimized', STATE_RUNS);
  engineStates.minimized = await cmd('state');

  win2.destroy();
  win1.restore();
  win1.focus();
  await sleep(1500);
  viewportMs.restored = await viewportRuns('restored', STATE_RUNS);
  engineStates.restored = await cmd('state');

  // Exposure checks, after all timing so accessibility support cannot skew it.
  phase = 'interaction';
  page.webContents.focus();
  for (let i = 0; i < 20; i++) {
    page.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
    page.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
    await sleep(50);
  }
  const content = win1.getContentBounds();
  const center = { x: content.x + Math.round(content.width / 2), y: content.y + Math.round(content.height / 2) };
  const scale = screen.getDisplayMatching(content).scaleFactor;
  if (MANUAL_WAIT_MS) {
    console.log(`MANUAL_INPUT_WINDOW click=${center.x},${center.y} waiting ${MANUAL_WAIT_MS / 1000}s`);
    await sleep(MANUAL_WAIT_MS);
  }
  // The native click and key press must land on this window, not on whatever
  // app the person running the harness is using.
  if (process.platform === 'darwin') app.focus({ steal: true });
  win1.focus();
  await sleep(500);
  if (!win1.isFocused()) {
    interactionSkipped = 'harness window was not frontmost; native input not sent';
  }
  const inputResult = interactionSkipped ? { error: interactionSkipped } : await native.clickAndType(center, scale);
  await sleep(1500);
  const phaseEvents = (role) => events.filter((e) => e.phase === 'interaction' && e.role === role).map((e) => e.kind);
  const interaction = {
    pageEvents: phaseEvents('page.html'),
    engineEvents: events.filter((e) => e.role === 'engine').map((e) => e.kind),
    engineFocused: engine.webContents.isFocused(),
    nativeInputError: inputResult.error || null,
  };
  engineStates.interaction = await cmd('state');

  const capture = await native.captureRect(content, scale);
  const pixels = capture.error ? { tealPixels: 0, magentaPixels: 0, total: 0, error: capture.error } : { ...countPixels(capture.file), error: null };

  app.setAccessibilitySupportEnabled(true);
  await sleep(2000);
  const axResult = await native.accessibilityProbe(process.pid);
  const ax = axResult.error ? { engineFound: false, pageFound: false, error: axResult.error } : { ...axResult, error: null };

  await cmd('terminate');
  engine.webContents.close();
  page.webContents.close();
  bg.webContents.close();
  win1.destroy();

  const raw = {
    host: {
      platform: process.platform,
      arch: process.arch,
      cpuModel: os.cpus()[0].model.trim(),
      cpuCount: os.cpus().length,
      electron: process.versions.electron,
    },
    mode: MODE,
    rendererBackgroundingDisabled: app.commandLine.hasSwitch('disable-renderer-backgrounding'),
    readyMs: ready.readyMs,
    viewportWords: ready.viewportWords,
    articleWords: ready.articleWords,
    viewportMs,
    fullColdMs,
    fullWarmMs,
    fullOut,
    engineStates,
    structure,
    interaction,
    pixels,
    ax,
    cpu,
    bgRates,
  };
  const summary = summarizeBehind(raw);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'raw.json'), JSON.stringify({ ...raw, events }, null, 2) + '\n');
  console.log(JSON.stringify({ mode: summary.mode, viewportPer250: summary.viewportPer250, fullPer2000: summary.fullPer2000, hidden: summary.hidden, backgroundTab: summary.backgroundTab, engineIdleCpuPct: summary.engineIdleCpuPct, engineStates }, null, 2));
  app.exit(0);
}).catch((err) => fail(String((err && err.stack) || err)));
