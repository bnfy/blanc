// node chromium/tests/linux-display-share.mjs CONFIG.json NEW_RESULTS_DIRECTORY
//
// L2 Task 4 (X11): a page calls getDisplayMedia, Chromium's own picker opens,
// and real keys choose a tab, then in a separate process the whole screen.
// The page must receive a live track of that surface, the Island's sharing
// chip must show it, and Stop in the Island's capture popover, pressed with
// the real pointer, must end the track. native-display-share.mjs covers the
// same Island path with the picker answered by a test switch; Wayland's
// portal picker is a hand check (chromium/linux/hand-checks-l2.md).
//
// The picker is a Views dialog. Under Xvfb and Openbox a Views dialog's
// AT-SPI extents and actions were unreliable (linux-quit.mjs), so the picker
// is driven by real keys only. lib/linux-media-picker.py reads its focus and
// its Share button's state between keys; when that read finds nothing, fixed
// key sequences are tried in turn, each on a freshly opened picker. Every key
// sent and what the picker showed before it go into the report.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {tabPage} from './adapters/core.mjs';
import {pause, waitFor} from './lib/cdp.mjs';
import {NativeFixture} from './lib/fixture.mjs';
import {click, windowGeometry} from './lib/native-input-linux.mjs';
import {assertNodeRuntime} from './lib/render-guard.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {createWorld} from './world.mjs';

export const CASES = {
  tab: {displaySurface: 'browser', surfaceKind: 'tab'},
  screen: {displaySurface: 'monitor', surfaceKind: 'screen'},
};
export const TARGET_HANDLE = 'blanc-share-target';
const SHARER_TITLE = 'BlancDisplayShareSharer';
const MAX_KEYS = 16;
const KEY_PAUSE_MS = 400;

// The displaySurface hint opens the picker on that kind's pane. The sharing
// tab is left out, so the tab pane lists the target tab alone.
export function displayMediaOptions(displaySurface) {
  return {video: {displaySurface}, audio: false, selfBrowserSurface: 'exclude',
    surfaceSwitching: 'exclude', systemAudio: 'exclude', monitorTypeSurfaces: 'include'};
}

// Tried in order when AT-SPI can't read the picker. A sequence that lands on
// Cancel rejects the call, and the next one gets a new picker.
export const FALLBACK_SEQUENCES = [
  ['Tab', 'Down', 'Return'],
  ['Down', 'Return'],
  ['Tab', 'Tab', 'Down', 'Return'],
  ['Tab', 'Tab', 'Tab', 'Down', 'Return'],
];
export const PLANS = ['guided', ...FALLBACK_SEQUENCES.map(keys => keys.join(','))];

const LISTS = new Set(['list', 'list item', 'table', 'table row', 'table cell', 'tree', 'tree table', 'tree item']);
const CONTROLS = new Set(['push button', 'toggle button', 'check box', 'radio button', 'combo box']);
const sameFocus = (a, b) => (a?.role ?? null) === (b?.role ?? null) && (a?.name ?? null) === (b?.name ?? null);

// The next real key for the picker as AT-SPI describes it, or null when it
// can't be read. Return is sent only where it can't press Cancel: with Share
// enabled and focus on Share, or on a view that doesn't take Return itself
// (a list or a pane tab), where the dialog's default button, Share, gets it.
export function pickerKey(state, sent = []) {
  if (!state?.found || !state.share) return null;
  const focus = state.focus ?? null;
  const role = focus?.role ?? '';
  if (state.share.enabled) {
    if (CONTROLS.has(role)) return role === 'push button' && focus.name === 'Share' ? 'Return' : 'Tab';
    return 'Return';
  }
  // Keys other than Tab already sent at this same focus without enabling Share.
  let tried = 0;
  for (let i = sent.length - 1; i >= 0 && sent[i].key !== 'Tab' && sameFocus(sent[i].focus, focus); i--) tried++;
  if (LISTS.has(role)) return ['Down', 'Home', 'Up'][tried] ?? 'Tab';
  // A source in the screen pane's grid may be a button: Space selects it.
  if (role === 'push button' && !['Share', 'Cancel'].includes(focus.name)) return tried ? 'Tab' : 'space';
  return 'Tab';
}

export function newWindows(before, after) {
  const known = new Set(before);
  return after.filter(xid => !known.has(xid));
}

export function parseXwininfo(text) {
  const number = label => Number(new RegExp('^\\s*' + label + ':\\s+(-?\\d+)', 'm').exec(text)?.[1]);
  return {x: number('Absolute upper-left X'), y: number('Absolute upper-left Y'),
    width: number('Width'), height: number('Height'), mapState: /Map State:\s+(\w+)/.exec(text)?.[1] ?? null};
}

// Strip-local DIPs to X11 root pixels. The launch fixes the scale at 1.
export function screenPoint(strip, local) {
  return {x: Math.round(strip.x + local.x), y: Math.round(strip.y + local.y)};
}

export function expectedShareRow(kind, sharerId, origin) {
  const id = String(sharerId);
  return {shareId: id, pending: false, origin, surfaceLabel: null, surfaceKind: kind, computerAudio: false, tabId: id};
}

export function reportPassed(report) {
  const names = Object.keys(CASES);
  return report.cases.length === names.length && report.cases.every((c, i) => c.name === names[i] && c.passed === true);
}

export function pageHtml(url) {
  if (url === '/target') {
    return `<title>Share target</title><p>Share target</p><script>
      try { navigator.mediaDevices.setCaptureHandleConfig({handle: ${JSON.stringify(TARGET_HANDLE)}, exposeOrigin: true, permittedOrigins: ['*']}); }
      catch (e) { window.__handleError = e.name; }</script>`;
  }
  if (url === '/sharer') {
    return `<title>${SHARER_TITLE}</title><p>Sharer</p><script>
      window.__start = options => {
        window.__share = null; window.__shareError = null; window.__ended = false; window.__pending = true;
        navigator.mediaDevices.getDisplayMedia(options).then(stream => {
          window.__share = stream; window.__pending = false;
          stream.getVideoTracks()[0]?.addEventListener('ended', () => { window.__ended = true; });
        }, error => { window.__shareError = error.name + ': ' + error.message; window.__pending = false; });
      };
      window.__shareState = () => {
        const track = window.__share?.getVideoTracks()[0];
        return {pending: window.__pending ?? false, error: window.__shareError ?? null,
          live: track?.readyState === 'live', readyState: track?.readyState ?? null,
          surface: track?.getSettings().displaySurface ?? null, label: track?.label ?? null,
          handle: track?.getCaptureHandle?.()?.handle ?? null, ended: window.__ended ?? false};
      };</script>`;
  }
  return '<title>Blanc display share</title><p>' + url.replace(/[^\w/.-]/g, '') + '</p>';
}

const run = (tool, args, timeout = 5000) => execFileSync(tool, args.map(String), {encoding: 'utf8', timeout}).trim();
const x11 = (...args) => run('xdotool', args);
const probe = fileURLToPath(new URL('./lib/linux-media-picker.py', import.meta.url));

function readPicker(pid) {
  try { return JSON.parse(run('/usr/bin/python3', [probe, pid], 10_000)); }
  catch (error) { return {found: false, error: String(error.message).slice(0, 400)}; }
}

function windowIds(pid) {
  try { return x11('search', '--pid', pid).split(/\s+/).filter(Boolean); }
  catch (error) { if (error.status === 1) return []; throw error; } // No match.
}

function describeWindow(xid) {
  const info = {xid};
  try { info.name = x11('getwindowname', xid); } catch {}
  try { Object.assign(info, parseXwininfo(run('xwininfo', ['-id', xid]))); } catch (error) { info.error = error.message; }
  return info;
}

function activeWindow() {
  try { return x11('getactivewindow'); } catch (error) { return 'unreadable: ' + error.message; }
}

const stripPoint = `(() => {
  const frame = document.getElementById('strip'), chip = frame?.contentDocument?.getElementById('pillDisplayShare');
  if (!chip || chip.hidden) return null;
  const f = frame.getBoundingClientRect(), r = chip.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return {x: f.x + r.x + r.width / 2, y: f.y + r.y + r.height / 2};
})()`;
const stopPoint = `(() => {
  const frame = document.getElementById('overlay');
  if (!frame || frame.hidden) return null;
  const stops = frame.contentDocument?.querySelectorAll('#capturePop .display-share-stop') ?? [];
  if (stops.length !== 1) return null;
  const o = frame.getBoundingClientRect(), r = stops[0].getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const x = o.x + r.x + r.width / 2, y = o.y + r.y + r.height / 2;
  return x > o.x && x < o.x + o.width && y > o.y && y < o.y + o.height ? {x, y} : null;
})()`;
const popoverOpen = `(() => {
  const frame = document.getElementById('overlay'), doc = frame?.contentDocument;
  const pop = doc?.getElementById('capturePop');
  return Boolean(frame && !frame.hidden && pop && !pop.hidden && doc.querySelectorAll('.display-share-row').length === 1);
})()`;
const chipShown = `(() => {
  const chip = document.getElementById('strip')?.contentDocument?.getElementById('pillDisplayShare');
  return Boolean(chip && !chip.hidden);
})()`;
// Records which element saw each real press, in the host, strip and overlay.
const watchPresses = `(() => {
  window.testDisplaySharePresses ??= [];
  const watch = (doc, where) => {
    if (!doc || doc.__blancPressWatch) return;
    doc.__blancPressWatch = true;
    doc.addEventListener('mousedown', e => window.testDisplaySharePresses.push({where,
      target: e.target.id || e.target.className || e.target.tagName, x: e.clientX, y: e.clientY}), true);
  };
  watch(document, 'host');
  watch(document.getElementById('strip')?.contentDocument, 'strip');
  watch(document.getElementById('overlay')?.contentDocument, 'overlay');
  return true;
})()`;

// Positions count only once two readings 100 ms apart agree: the Island's
// overlay places itself after its first layout.
async function settled(read, label) {
  return waitFor(async () => {
    const first = await read();
    if (!first) return null;
    await pause(100);
    const second = await read();
    return second && second.x === first.x && second.y === first.y ? second : null;
  }, Boolean, label, 8000);
}

async function realClick(ctx, action, local) {
  const {f, w, xid, entry} = ctx;
  const {strip} = await w.native('linuxFrameGeometry');
  const point = screenPoint(strip, local);
  const geometry = windowGeometry(xid);
  assert.ok(point.x >= geometry.x && point.x < geometry.x + geometry.width &&
    point.y >= geometry.y && point.y < geometry.y + geometry.height, action + ' lies outside the browser window');
  assert.equal(Number(x11('getwindowpid', xid)), f.process.pid);
  x11('windowactivate', '--sync', xid);
  entry.clicks.push({action, point, strip, activeWindow: activeWindow()});
  click(point.x, point.y);
}

// One getDisplayMedia call and the keys sent to the picker it opens.
async function attempt(ctx, plan, attemptEntry) {
  const {f, page, mainXid, expected} = ctx;
  const pid = f.process.pid;
  const before = windowIds(pid);
  await page.cdp.send('Runtime.evaluate', {userGesture: true,
    expression: 'window.__start(' + JSON.stringify(displayMediaOptions(expected.displaySurface)) + '); 1'});
  const shareState = () => page.evalExpression('window.__shareState()');
  // Wait for the picker: AT-SPI sees it, or a new viewable X11 window opens.
  const opened = await waitFor(async () => {
    const state = await shareState();
    if (!state.pending) return {state};
    const tree = readPicker(pid);
    const windows = newWindows(before, windowIds(pid)).map(describeWindow).filter(w => w.mapState === 'IsViewable');
    return tree.found || windows.length ? {tree, windows} : null;
  }, Boolean, 'the picker', 10_000).catch(() => ({tree: readPicker(pid), windows: []}));
  attemptEntry.opened = {atspi: Boolean(opened.tree?.found), windows: opened.windows ?? [], tree: opened.tree ?? null};
  if (opened.state) return opened.state; // Settled without a picker.

  // Give the picker the keyboard: its own window when it has one.
  const own = (opened.windows ?? []).filter(w => w.width >= 200 && w.height >= 150).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  try { x11('windowactivate', '--sync', own?.xid ?? mainXid); }
  catch (error) { attemptEntry.activateError = error.message; }
  attemptEntry.activeWindow = activeWindow();
  // Sources fill in asynchronously, and Views ignores a dialog button pressed
  // within its first moments on screen.
  let tree = opened.tree;
  if (plan === 'guided') {
    tree = await waitFor(() => readPicker(pid), t => t.found && t.items?.length > 0, 'picker sources', 5000).catch(() => readPicker(pid));
  }
  await pause(1000);
  const sequence = plan === 'guided' ? null : plan.split(',');
  attemptEntry.keys = [];
  for (let i = 0; i < MAX_KEYS; i++) {
    const state = await shareState();
    if (!state.pending) return state;
    if (plan === 'guided') {
      tree = readPicker(pid);
      if (!tree.found) { await pause(300); tree = readPicker(pid); } // One missed read.
    }
    const key = sequence ? sequence[i] : pickerKey(tree, attemptEntry.keys);
    if (!key) break;
    attemptEntry.keys.push({key, focus: tree?.focus ?? null, shareEnabled: tree?.share?.enabled ?? null,
      paneTabs: tree?.paneTabs?.map(t => (t.selected ? '*' : '') + t.name), activeWindow: activeWindow()});
    x11('key', key);
    await pause(KEY_PAUSE_MS);
    if (sequence) tree = readPicker(pid); // For the record only.
  }
  const settledState = await waitFor(shareState, s => !s.pending, 'the picker to answer', 5000).catch(() => null);
  if (settledState) return settledState;
  // Still open: close it so the next attempt gets a fresh picker.
  attemptEntry.afterKeys = readPicker(pid);
  x11('key', 'Escape');
  attemptEntry.keys.push({key: 'Escape', cleanup: true});
  return waitFor(shareState, s => !s.pending, 'Escape closes the picker', 5000)
    .catch(async () => ({...(await shareState()), stuck: true}));
}

async function runCase(name, config, scratch, out, report) {
  const expected = CASES[name];
  const f = new NativeFixture(), w = createWorld(f);
  const entry = {name, passed: false, attempts: [], clicks: []};
  report.cases.push(entry);
  const ctx = {f, w, expected, entry};
  try {
    f.extraArgs = ['--ozone-platform=x11', '--force-device-scale-factor=1', '--lang=en-US',
      '--force-renderer-accessibility=complete'];
    await f.launch(config, path.join(scratch, name), {testHooks: true, diskAssets: false});
    await installDriver(f.host);
    await w.reset();
    f.server.removeAllListeners('request');
    f.server.on('request', (req, res) => {
      res.writeHead(200, {'content-type': 'text/html'});
      res.end(pageHtml(req.url));
    });
    const targetId = String(await w.call('openTab', f.base + '/target'));
    const sharerId = String(await w.call('openTab', f.base + '/sharer'));
    for (const tab of (await w.snapshot()).tabs)
      if (![targetId, sharerId].includes(String(tab.id))) await w.native('closeTab', [tab.id]);
    await w.call('activateTab', sharerId);
    await waitFor(() => w.snapshot(), s => s.tabs.length === 2 && String(s.activeTabId) === sharerId &&
      s.tabs.every(t => !t.isLoading && !t.loading), 'the target and the sharing tab loaded', 10_000);
    ctx.page = await tabPage(w, sharerId);
    await ctx.page.evalExpression('1');
    ctx.mainXid = ctx.xid = await waitFor(() => {
      const ids = x11('search', '--onlyvisible', '--all', '--pid', f.process.pid, '--name', SHARER_TITLE).split('\n');
      return ids.length === 1 && ids[0];
    }, Boolean, 'the browser window showing the sharing tab');
    x11('windowactivate', '--sync', ctx.mainXid);
    entry.mainWindow = describeWindow(ctx.mainXid);
    assert.deepEqual((await w.snapshot()).displayShares, [], 'expected no share before the picker');
    assert.equal(await w.hostEval(chipShown), false, 'expected no sharing chip before the picker');

    let started = null;
    for (let index = 0; index < PLANS.length && !started; index++) {
      const plan = PLANS[index];
      const attemptEntry = {plan};
      entry.attempts.push(attemptEntry);
      const state = await attempt(ctx, plan, attemptEntry);
      attemptEntry.outcome = state;
      if (state.stuck) throw Error('The picker stayed open after Escape');
      if (!state.error) started = state;
      // Guided keys need AT-SPI; without it the same picker never opened for them.
      if (plan === 'guided' && !attemptEntry.opened.atspi && state.error) attemptEntry.note = 'AT-SPI could not read the picker';
    }
    assert.ok(started, 'No key sequence started a share');
    entry.share = started;
    entry.chosenBy = entry.attempts.at(-1).plan;
    assert.equal(started.surface, expected.displaySurface, 'the page shares the chosen kind of surface');
    assert.equal(started.live, true, 'the shared track is live');
    if (name === 'tab') {
      // The target tab announces itself through Capture Handle.
      const handle = await waitFor(() => ctx.page.evalExpression('window.__shareState().handle'),
        h => h === TARGET_HANDLE, 'the shared tab is the target', 5000);
      entry.share.handle = handle;
    }
    entry.pickerAfter = readPicker(f.process.pid);
    const rows = await waitFor(async () => (await w.snapshot()).displayShares, r => r.length === 1, 'the Island reports one share', 8000);
    assert.deepEqual(rows[0], expectedShareRow(expected.surfaceKind, sharerId, new URL(f.base).origin));
    await waitFor(() => w.hostEval(chipShown), Boolean, 'the sharing chip shows', 8000);

    // Stop by the real pointer: the chip, then the popover row's Stop.
    await w.hostEval(watchPresses);
    await realClick(ctx, 'sharing chip', await settled(() => w.hostEval(stripPoint), 'sharing chip settled'));
    await waitFor(() => w.hostEval(popoverOpen), Boolean, 'the capture popover with one share row', 5000);
    await w.hostEval(watchPresses);
    await realClick(ctx, 'Stop', await settled(() => w.hostEval(stopPoint), 'Stop settled'));
    const ended = await waitFor(() => ctx.page.evalExpression('window.__shareState()'),
      s => s.readyState === 'ended' && s.ended, 'Stop ends the track', 8000);
    entry.afterStop = ended;
    await waitFor(async () => (await w.snapshot()).displayShares, r => r.length === 0, 'the Island reports no share after Stop', 8000);
    await waitFor(() => w.hostEval(chipShown), shown => shown === false, 'the sharing chip hides after Stop', 8000);
    entry.passed = true;
  } catch (error) {
    entry.error = String(error.stack || error);
    const diagnostics = {activeWindow: activeWindow()};
    const record = async (key, read) => { try { diagnostics[key] = await read(); } catch (e) { diagnostics[key] = 'unreadable: ' + e.message; } };
    if (f.process?.pid) {
      await record('windows', () => windowIds(f.process.pid).slice(0, 80).map(describeWindow));
      await record('picker', () => readPicker(f.process.pid));
    }
    if (ctx.page) await record('share', () => ctx.page.evalExpression('window.__shareState()'));
    if (f.host) {
      await record('displayShares', async () => (await w.snapshot()).displayShares);
      await record('chipShown', () => w.hostEval(chipShown));
      await record('presses', () => w.hostEval('window.testDisplaySharePresses ?? null'));
      await record('overlay', () => w.hostEval(`(() => { const o = document.getElementById('overlay');
        return o && {hidden: o.hidden, mode: o.dataset.mode || null, style: o.getAttribute('style')}; })()`));
      await record('frame', () => w.native('linuxFrameGeometry'));
    }
    entry.diagnostics = diagnostics;
  } finally {
    try {
      entry.exit = await f.close();
      assert.equal(entry.exit?.code, 0);
    } catch (error) { entry.closeError = error.message; entry.passed = false; }
    if (f.directory && fs.existsSync(path.join(f.directory, 'browser.log')))
      fs.copyFileSync(path.join(f.directory, 'browser.log'), path.join(out, name + '.log'));
  }
}

async function main([configFile, resultDir, ...extra]) {
  if (!configFile || !resultDir || extra.length)
    throw Error('Usage: linux-display-share.mjs CONFIG.json NEW_RESULTS_DIRECTORY');
  assertNodeRuntime();
  assert.equal(process.platform, 'linux');
  assert.notEqual(process.getuid(), 0, 'Run the browser as an ordinary user');
  assert.ok(process.env.DISPLAY, 'X11 needs a DISPLAY');
  assert.ok(!process.env.WAYLAND_DISPLAY, 'This is the X11 check; Wayland\'s portal picker is a hand check');
  assert.equal(fs.readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim(), '1');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const out = path.resolve(resultDir);
  fs.mkdirSync(out);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-x11-display-share-'));
  const report = {candidate: config.candidate, arch: process.arch, display: 'x11',
    executable: config.executable, executableSha256: config.executableSha256, cases: []};
  try {
    for (const name of Object.keys(CASES)) await runCase(name, config, scratch, out, report);
  } finally {
    fs.rmSync(scratch, {recursive: true, force: true});
    report.passed = reportPassed(report);
    fs.writeFileSync(path.join(out, 'display-share-' + process.arch + '.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await main(process.argv.slice(2));
