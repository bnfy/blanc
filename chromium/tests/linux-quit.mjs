// node chromium/tests/linux-quit.mjs CANDIDATE_DIR RESULTS_DIR [--installed-sha256=SHA256]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runtimeConfig } from '../linux/candidate.mjs';
import { installManifest, readSignedDescriptor } from './linux-install.mjs';
import { debExecutableSha256, verifiedSmokePackage } from './linux-smoke.mjs';
import { pause, waitFor } from './lib/cdp.mjs';
import { NativeFixture } from './lib/fixture.mjs';
import { click, windowGeometry } from './lib/native-input-linux.mjs';
import { assertNodeRuntime } from './lib/render-guard.mjs';
import { installDriver, nativeCall } from './lib/test-driver.mjs';

const EXIT_MS = 10_000;
const run = (tool, args) => execFileSync(tool, args, { encoding: 'utf8', timeout: 5000 }).trim();
const x11 = (...args) => run('xdotool', args.map(String));

// The workflow has already checked the archive digest and unpacked it. Bind
// the installed executable to the DEB authorized for that exact archive.
export function prepareQuitInput(arch, folder, downloads, tarSha256, publicKey) {
  const candidate = JSON.parse(fs.readFileSync(path.join(folder, 'candidate.json'), 'utf8'));
  assert.equal(candidate.platform, 'linux');
  const signed = readSignedDescriptor(downloads, arch, publicKey);
  installManifest(candidate, signed, arch, tarSha256);
  const deb = verifiedSmokePackage(folder, candidate, 'deb');
  assert.ok(fs.lstatSync(deb).isFile(), 'Expected a regular Debian package');
  const field = name => execFileSync('dpkg-deb', ['-f', deb, name], {encoding: 'utf8'}).trim();
  assert.equal(field('Package'), 'blanc-prototype');
  assert.equal(field('Architecture'), arch === 'arm64' ? 'arm64' : 'amd64');
  return {deb, executableSha256: debExecutableSha256(deb)};
}

export function processTable(profile, procDir = '/proc') {
  const rows = [];
  const profileFlag = '--user-data-dir=' + profile;
  for (const entry of fs.readdirSync(procDir)) {
    if (!/^\d+$/.test(entry)) continue;
    const dir = path.join(procDir, entry);
    let stat;
    let matchesProfile = false;
    try {
      stat = fs.readFileSync(path.join(dir, 'stat'), 'utf8');
      matchesProfile = fs.readFileSync(path.join(dir, 'cmdline'), 'utf8').split('\0').includes(profileFlag);
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes(error.code)) continue; // Exited during enumeration.
      // Some system processes hide their command line from the runner. Keep
      // their stat row for ancestry even when the command line is unavailable.
      if (!stat || !['EACCES', 'EPERM'].includes(error.code)) throw error;
    }
    // comm is parenthesized and can itself contain spaces or parentheses.
    const fields = stat.slice(stat.lastIndexOf(') ') + 2).split(' ');
    rows.push({ pid: Number(entry), parent: Number(fields[1]), start: fields[19], matchesProfile });
  }
  return rows;
}

// Keep the identity of each descendant across clicks and reparenting. A later
// process reusing the same PID is unrelated unless it too is a descendant.
export class BrowserProcesses {
  constructor(browserPid) {
    this.browserPid = browserPid;
    this.known = new Map();
  }

  sample(rows) {
    if (!this.known.size) {
      const root = rows.find(row => row.pid === this.browserPid);
      assert.ok(root, 'Browser missing from initial process tree');
      this.known.set(root.pid, root.start);
    }
    const children = new Map();
    const live = new Set();
    for (const row of rows) {
      // A helper may already be reparented the first time /proc observes it.
      if (row.matchesProfile) this.known.set(row.pid, row.start);
      if (this.known.get(row.pid) === row.start) live.add(row.pid);
      if (!children.has(row.parent)) children.set(row.parent, []);
      children.get(row.parent).push(row);
    }
    // Set iteration also visits newly added children (including zygote forks).
    for (const pid of live) {
      for (const child of children.get(pid) ?? []) {
        this.known.set(child.pid, child.start);
        live.add(child.pid);
      }
    }
    return [...live].sort((a, b) => a - b);
  }
}

function inside(point, rect) {
  return point.x >= rect.x && point.x < rect.x + rect.width &&
    point.y >= rect.y && point.y < rect.y + rect.height;
}

export function closePoint(buttons, strip, geometry) {
  const matches = buttons.filter(b => b.kind === 'close');
  assert.equal(matches.length, 1, 'Expected one native Close button');
  const [b] = matches;
  assert.ok(b.width > 0 && b.height > 0, 'Close has empty bounds');
  // The launch fixes the display scale at 1. Button bounds are strip-local DIPs.
  const point = { x: Math.round(strip.x + b.x + b.width / 2), y: Math.round(strip.y + b.y + b.height / 2) };
  assert.ok(inside(point, strip) && inside(point, geometry), 'Close is outside the intended X11 window');
  return point;
}

export async function observeExit(read, deadline) {
  for (;;) {
    const state = read();
    const left = deadline - performance.now();
    if (left <= 0) return { passed: false, ...state };
    if (state.exitCode !== null && state.leftoverPids.length === 0)
      return { passed: state.exitCode === 0, ...state };
    await pause(Math.min(left, 50));
  }
}

export class QuitFixture extends NativeFixture {
  reapHelpers() {
    this.reapedPids = super.reapHelpers();
    if (this.reapedPids.length) throw new Error('Fixture cleanup reaped surviving PIDs ' + this.reapedPids.join(', '));
    return this.reapedPids;
  }
}

async function markedWindow(fixture, page, title) {
  // Give an existing tab a distinct WM title. Creating a marker tab would
  // invalidate the one-tab case and could dismiss the Glance.
  await page.eval('document.title = ' + JSON.stringify(title));
  return waitFor(() => {
    const ids = x11('search', '--onlyvisible', '--all', '--pid', fixture.process.pid, '--name', title).split('\n');
    return ids.length === 1 && ids[0];
  }, Boolean, 'the X11 client for ' + title);
}

async function secondHost(fixture) {
  const target = await waitFor(async () => (await fixture.targets()).find(t =>
    t.url === 'chrome://blanc-prototype/host.html' && t.id !== fixture.hostTargetId), Boolean, 'second Island host');
  const host = await fixture.connectTarget(target);
  await installDriver(host);
  return host;
}

function clickTracked(ctx, action, xid, point) {
  assert.equal(Number(x11('getwindowpid', xid)), ctx.fixture.process.pid);
  assert.ok(inside(point, windowGeometry(xid)), 'Pointer target outside the verified window');
  const pids = ctx.tree.sample(processTable(ctx.fixture.profile));
  assert.ok(pids.includes(ctx.fixture.process.pid) && pids.length > 1, 'Missing browser or children before click');
  ctx.result.clicks.push({ action, xid, point, pids });
  const deadline = performance.now() + EXIT_MS;
  click(point.x, point.y);
  return deadline;
}

async function clickClose(ctx, win) {
  x11('windowactivate', '--sync', win.xid);
  await waitFor(() => x11('getactivewindow'), active => active === win.xid, 'intended ordinary window in front');
  const point = await waitFor(async () => {
    const { strip } = await nativeCall(win.host, 'linuxFrameGeometry');
    const { buttons } = await win.host.eval('window.BlancPrototypeHost.windowButtons()');
    return closePoint(buttons, strip, windowGeometry(win.xid));
  }, Boolean, 'Close rect in the intended window');
  assert.equal(x11('getactivewindow'), win.xid);
  return clickTracked(ctx, 'Close', win.xid, point);
}

async function holdRecentTab({ fixture }) {
  const url = fixture.base + '/recent';
  await nativeCall(fixture.host, 'createTab', [url]);
  const tab = await waitFor(async () => (await nativeCall(fixture.host, 'snapshot')).tabs.find(t =>
    t.url === url && !t.isLoading), Boolean, 'loaded tab to close');
  await nativeCall(fixture.host, 'closeTab', [tab.id]);
  await waitFor(() => nativeCall(fixture.host, 'snapshot'), s => s.tabs.length === 1 &&
    s.closed.some(entry => entry.url === url && entry.held), 'live Recently closed entry');
}

async function holdSpace({ fixture }) {
  const saved = await fixture.host.eval("window.BlancPrototypeHost.api.saveWorkspaceAs('Before close')");
  assert.equal(saved.ok, true);
  const opened = await fixture.host.eval("window.BlancPrototypeHost.api.createBlankWorkspace('Other Space')");
  assert.equal(opened.ok, true);
  await waitFor(() => fixture.host.eval('window.BlancPrototypeHost.spaceHeldState()'), s =>
    s.heldTabs[saved.workspaceId]?.some(tab => tab.present && tab.url === fixture.base + '/initial'),
  'original Space page held after switching');
}

async function openMini({ fixture }) {
  assert.equal(await nativeCall(fixture.host, 'openMiniWindow'), true);
  const mini = await secondHost(fixture);
  await waitFor(() => nativeCall(mini, 'snapshot'), s => s.miniWindow === true, 'live Mini');
}

async function openGlance({ fixture }) {
  const url = fixture.base + '/glance';
  assert.equal(await fixture.host.eval('window.BlancPrototypeHost.api.openLinkInGlance(' + JSON.stringify(url) + ')'), true);
  await waitFor(fixture.snapshot, s => s.tabs.some(t => t.id === s.glanceTabId && t.url === url && !t.isLoading),
    'loaded Glance tab');
  await waitFor(() => fixture.host.eval('window.BlancPrototypeHost.glanceState()'), s => s.shown && s.layout, 'open Glance');
}

async function startDownload({ fixture }) {
  // A real attachment with no final chunk. The fixture owns the open socket
  // until the browser quits or the failed case has already been recorded.
  fixture.server.removeAllListeners('request');
  fixture.server.on('request', (req, res) => {
    if (req.url !== '/quit-download.txt') { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': 1 << 20,
      'Content-Disposition': 'attachment; filename="quit-download.txt"' });
    res.write(Buffer.alloc(64 << 10, 'x'));
  });
  const downloadPath = path.join(fixture.directory, 'downloads');
  fs.mkdirSync(downloadPath);
  await fixture.browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath });
  await fixture.page.eval("const a = document.createElement('a'); a.href = '/quit-download.txt'; a.download = ''; a.click()");
  await waitFor(() => nativeCall(fixture.host, 'snapshot'), s => s.downloadsActivity?.active === 1,
    'one running download before Close');
}

async function confirmDownload(ctx) {
  // UnloadController asks on Linux. DownloadInProgressDialogView defaults
  // to Continue downloading, so Return would exercise the opposite decision.
  const probe = fileURLToPath(new URL('./lib/linux-download-exit.py', import.meta.url));
  const buttons = await waitFor(() => JSON.parse(run('/usr/bin/python3', [probe, String(ctx.fixture.process.pid)])),
    points => points.length === 1, 'the native download dialog with its Exit button', EXIT_MS);
  return clickTracked(ctx, 'Exit', x11('getactivewindow'), buttons[0]);
}

async function closeWithOtherWindow(ctx) {
  const { fixture, main } = ctx;
  const url = fixture.base + '/other-window';
  const { targetId } = await fixture.browser.send('Target.createTarget', { url, newWindow: true });
  const target = await waitFor(async () => (await fixture.targets()).find(t => t.id === targetId && t.url === url),
    Boolean, 'page in the second ordinary window');
  const page = await fixture.connectTarget(target);
  const second = { host: await secondHost(fixture), xid: await markedWindow(fixture, page, 'BlancQuitSecond') };
  assert.notEqual(main.xid, second.xid);
  const alive = s => s.miniWindow === false && s.tabs.some(t => t.url === url && !t.isLoading);
  await waitFor(() => nativeCall(second.host, 'snapshot'), alive, 'second ordinary window owns its page');

  if (Number(x11('get_num_desktops')) < 2) x11('set_num_desktops', 2);
  const firstDesktop = x11('get_desktop_for_window', main.xid);
  const otherDesktop = firstDesktop === '0' ? '1' : '0';
  x11('set_desktop_for_window', second.xid, otherDesktop);
  await waitFor(() => x11('get_desktop_for_window', second.xid), d => d === otherDesktop, 'second window on another desktop');
  x11('set_desktop', firstDesktop);
  await clickClose(ctx, main);
  await waitFor(fixture.targets, ts => !ts.some(t => t.id === fixture.hostTargetId) && ts.some(t => t.id === targetId),
    'first window gone while the second survives', EXIT_MS);
  assert.ok(alive(await nativeCall(second.host, 'snapshot')));
  assert.equal(fixture.exit, null);
  x11('set_desktop', otherDesktop);
  return second;
}

const cases = [
  { name: 'one window, one tab' },
  { name: 'held Recently closed tab', prepare: holdRecentTab },
  { name: 'held Space page', prepare: holdSpace },
  { name: 'Mini window', prepare: openMini },
  { name: 'download in progress', prepare: startDownload, confirm: confirmDownload },
  { name: 'open Glance', prepare: openGlance },
  { name: 'ordinary window on another desktop', prepare: closeWithOtherWindow },
];

async function runCase(scenario, config, scratch, out) {
  const fixture = new QuitFixture();
  const result = { name: scenario.name, passed: false, exitCode: null, leftoverPids: [], clicks: [] };
  const ctx = { fixture, result };
  try {
    fixture.extraArgs = ['--ozone-platform=x11', '--force-device-scale-factor=1', '--window-size=900,560', '--lang=en-US'];
    if (scenario.confirm) fixture.extraArgs.push('--force-renderer-accessibility=complete');
    await fixture.launch(config, path.join(scratch, scenario.name), { testHooks: true, diskAssets: false });
    ctx.tree = new BrowserProcesses(fixture.process.pid);
    await installDriver(fixture.host);
    const initial = await nativeCall(fixture.host, 'snapshot');
    assert.equal(initial.miniWindow, false);
    assert.equal(initial.tabs.length, 1);
    ctx.main = { host: fixture.host, xid: await markedWindow(fixture, fixture.page, 'BlancQuitFirst') };
    const lastWindow = await scenario.prepare?.(ctx) ?? ctx.main;
    let deadline = await clickClose(ctx, lastWindow);
    if (scenario.confirm) deadline = await scenario.confirm(ctx);
    Object.assign(result, await observeExit(() => ({
      exitCode: fixture.exit?.code ?? null, leftoverPids: ctx.tree.sample(processTable(fixture.profile)),
    }), deadline));
    if (!result.passed) result.error = 'Browser and descendants did not exit cleanly within 10 seconds';
  } catch (error) {
    result.error = error.stack;
    result.exitCode = fixture.exit?.code ?? null;
    if (ctx.tree?.known.size) result.leftoverPids = ctx.tree.sample(processTable(fixture.profile));
  } finally {
    // Never use Browser.close, SIGTERM or reapHelpers as evidence for quit.
    try {
      await fixture.close();
    } catch (error) {
      result.cleanupError = error.stack;
      result.passed = false;
      const survivors = new Set([...result.leftoverPids, ...(fixture.reapedPids ?? [])]);
      result.leftoverPids = [...survivors].sort((a, b) => a - b);
    }
    const log = path.join(scratch, scenario.name, 'browser.log');
    if (!result.passed && fs.existsSync(log)) fs.copyFileSync(log, path.join(out, scenario.name + '.log'));
  }
  return result;
}

async function main([folder, resultDir, mode, ...extra]) {
  const installedHash = /^--installed-sha256=([0-9a-f]{64})$/.exec(mode)?.[1];
  if (!folder || !resultDir || (mode && !installedHash) || extra.length)
    throw new Error('Usage: linux-quit.mjs CANDIDATE_DIR RESULTS_DIR [--installed-sha256=SHA256]');
  assertNodeRuntime();
  assert.equal(process.platform, 'linux');
  assert.ok(process.env.DISPLAY, 'X11 needs a DISPLAY');
  assert.notEqual(process.getuid(), 0, 'Run the browser as an ordinary user');
  assert.equal(fs.readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim(), '1');
  const candidate = JSON.parse(fs.readFileSync(path.join(folder, 'candidate.json'), 'utf8'));
  assert.equal(candidate.arch, process.arch);
  // The installer ships chrome.stripped. Bind the actual executable to the
  // member of the verified .deb, which can differ from the loose chrome.
  const config = runtimeConfig(path.resolve(folder), candidate, installedHash);
  const out = path.resolve(resultDir);
  fs.mkdirSync(out, { recursive: true });
  const report = path.join(out, 'quit-' + process.arch + '.json');
  assert.ok(!fs.existsSync(report), 'Refusing to overwrite earlier quit evidence');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-linux-quit-'));
  const record = { candidate: candidate.id, arch: process.arch, executable: config.executable,
    executableSha256: config.executableSha256, cases: [] };
  try {
    for (const scenario of cases) {
      const result = await runCase(scenario, config, scratch, out);
      record.cases.push(result);
      fs.writeFileSync(report, JSON.stringify(record, null, 2) + '\n');
      console.log(JSON.stringify(result));
      if (!result.passed) process.exitCode = 1;
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args[0] === 'prepare') {
    assert.equal(args.length, 5, 'Usage: linux-quit.mjs prepare ARCH CANDIDATE_DIR DOWNLOADS TAR_SHA256');
    const {deb, executableSha256} = prepareQuitInput(...args.slice(1));
    console.log('QUIT_DEB=' + deb);
    console.log('QUIT_INSTALLED_SHA256=' + executableSha256);
  } else await main(args);
}
