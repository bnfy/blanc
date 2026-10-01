#!/usr/bin/env node

// Rehearse the real Linux AppImage updater handoff on a disposable machine.
// Normally run by .github/workflows/linux-update-rehearsal.yml; it needs
// Linux with Xvfb, xdotool, ImageMagick's `import`, and dbus-launch, and it
// expects to own display :99 and CDP port 9223.
//
// Hop 1: a public N-1 AppImage runs with the isolated staging feed, discovers
// and downloads candidate A, and its ordinary "Restart Now" prompt is accepted
// with a real X key press — no auto-install shortcut.
// Hop 2: the copy that hop 1 relaunched discovers candidate B and installs it
// the same way. electron-updater replaces whatever process.env.APPIMAGE names,
// and Chromium overwrites /proc/<pid>/environ with its process title, so a
// second real update is the only reliable proof the relaunch knows its new file.
//
// Blanc's staging status file is only allowed in auto-install mode, so
// progress is observed from the feed's request log, the prompt windows, and
// Blanc's updater.log. Each hop must replace the file, relaunch a main process
// running from the new image (its mounted X-AppImage-Version), and stay up.
// The default userData path is kept (isolated through HOME/XDG_*), so every
// relaunch contends for the same single-instance lock a real user's would.

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

function required(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? null : process.argv[index + 1];
  if (!value) {
    console.error('usage: npm run test:packaged:update-staging:linux -- --old <AppImage> --old-version <v> '
      + '--feed-a <dir> --version-a <v> --feed-b <dir> --version-b <v> --root <empty dir> --evidence <dir>');
    process.exit(2);
  }
  return value;
}

if (process.platform !== 'linux') {
  console.error('the AppImage update rehearsal must run on Linux');
  process.exit(2);
}

const oldImage = path.resolve(required('--old'));
const oldVersion = required('--old-version');
const hops = [
  { feed: path.resolve(required('--feed-a')), version: required('--version-a') },
  { feed: path.resolve(required('--feed-b')), version: required('--version-b') },
];
const root = path.resolve(required('--root'));
const evidenceDir = path.resolve(required('--evidence'));

const home = path.join(root, 'home');
const installDir = path.join(root, 'Applications');
const updaterLog = path.join(home, '.config', 'Blanc', 'logs', 'updater.log');
const display = ':99';
const cdpPort = 9223;
const installedPath = (version) => path.join(installDir, `Blanc-${version}.AppImage`);

for (const dir of [home, installDir, evidenceDir]) fs.mkdirSync(dir, { recursive: true });

const timeline = [];
function note(event, detail = {}) {
  const entry = { at: new Date().toISOString(), event, ...detail };
  timeline.push(entry);
  console.log(`[rehearsal] ${event}${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ''}`);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, timeoutMs, probe, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) return value;
    await delay(intervalMs);
  }
  throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${label}`);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const baseEnv = { ...process.env };
delete baseEnv.ELECTRON_RUN_AS_NODE;
const xEnv = { ...baseEnv, DISPLAY: display };

function x(args) {
  const result = spawnSync('xdotool', args, { env: xEnv, encoding: 'utf8', timeout: 10000 });
  return result.status === 0 ? result.stdout.trim() : null;
}

function screenshot(name) {
  const result = spawnSync('import', ['-display', display, '-window', 'root', path.join(evidenceDir, name)], { timeout: 15000 });
  note('screenshot', { file: name, ok: result.status === 0 });
}

function visibleWindows() {
  const ids = new Set();
  for (const by of [['--name', '.*'], ['--class', '.*']]) {
    for (const id of (x(['search', '--onlyvisible', ...by]) || '').split(/\s+/)) if (id) ids.add(id);
  }
  return [...ids].map((id) => {
    const geometry = (x(['getwindowgeometry', id]) ?? '').replace(/\s+/g, ' ');
    const size = geometry.match(/Geometry: (\d+)x(\d+)/);
    return { id, geometry, width: size ? Number(size[1]) : 0, height: size ? Number(size[2]) : 0 };
  });
}

// The update prompt is a small dialog: far smaller than the 1280x800 browser
// window, far larger than Chromium's 1x1 helper windows. Window ids are not
// usable to tell prompts apart: once a copy exits, the X server can hand its
// relaunch the same client id range, so the next prompt may reuse the old id.
// Only one copy runs at a time, so any prompt-sized window is the current one.
function findPrompt() {
  const prompts = visibleWindows().filter((w) => w.width >= 200 && w.width <= 1000 && w.height >= 50 && w.height <= 400);
  return prompts[0] ?? null;
}

function updaterLogTail(lines = 15) {
  try { return fs.readFileSync(updaterLog, 'utf8').trim().split('\n').slice(-lines); } catch { return []; }
}

// Processes running from an AppImage squashfs mount, found by command line
// (always readable). Environments are deliberately not used: Chromium's
// process title overwrites /proc/<pid>/environ.
function appImageProcesses() {
  const ps = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' }).stdout || '';
  const found = [];
  for (const line of ps.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!match) continue;
    const [, pid, args] = match;
    const mount = args.match(/(\/tmp\/\.mount_[^/\s]+)\//)?.[1] ?? null;
    const runtime = args.startsWith(installDir);
    if (!mount && !runtime) continue;
    found.push({
      pid: Number(pid),
      role: runtime ? 'runtime' : (/\s--type=/.test(args) ? 'child' : 'main'),
      mount,
      args: args.slice(0, 200),
    });
  }
  return found;
}

// The version an image really contains: the desktop entry in its own mount.
function mountVersion(mount) {
  if (!mount) return null;
  try {
    for (const name of fs.readdirSync(mount)) {
      if (!name.endsWith('.desktop')) continue;
      const version = fs.readFileSync(path.join(mount, name), 'utf8').match(/^X-AppImage-Version=(.+)$/m)?.[1];
      if (version) return version.trim();
    }
  } catch {
    // The mount went away.
  }
  return null;
}

function mainProcessFor(version) {
  return appImageProcesses().find((p) => p.role === 'main' && mountVersion(p.mount) === version) ?? null;
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// Whether the N-1 new-tab page shows `expected`. Only a boolean leaves this
// function: page text and CDP errors never reach logs or evidence files.
async function versionMarkerIs(expected) {
  const targets = await waitFor('the N-1 new-tab page over CDP', 90000, async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      if (!response.ok) return null;
      const list = await response.json();
      return list.some((target) => target.url.startsWith('blanc://newtab/')) ? list : null;
    } catch {
      return null;
    }
  }, 500);
  const newTab = targets.find((target) => target.url.startsWith('blanc://newtab/'));
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(newTab.webSocketDebuggerUrl);
    const timeout = setTimeout(() => { socket.close(); reject(new Error('timed out reading the N-1 version marker')); }, 15000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `new Promise((resolve) => { const read = () => { const v = document.getElementById('version')?.textContent || ''; if (v) resolve(v); else setTimeout(read, 100); }; read(); })`,
        awaitPromise: true,
        returnByValue: true,
      },
    })));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.error) reject(new Error('CDP could not evaluate the N-1 new-tab page'));
      else resolve(message.result?.result?.value === expected);
    });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('CDP WebSocket failed')); });
  });
}

const background = [];
const feedRequests = [];
let feedServer;
let servingFeed = hops[0].feed;
let oldApp;
const oldAppLog = [];
let result = 'FAIL';
let failure = null;
const hopResults = [];

// One update hop: wait for the running copy to download `hop.version` and show
// its prompt, accept Restart Now, then prove the replacement is running.
async function performHop(index, { fromVersion, fromFile, isRunning, exited, beforeAccept }) {
  const hop = hops[index];
  const label = `hop ${index + 1} (${fromVersion} -> ${hop.version})`;
  const imagePath = `/${path.basename(installedPath(hop.version))}`;

  const prompt = await waitFor(`${label}: download and Restart Now prompt`, 6 * 60000, () => {
    if (!isRunning()) throw new Error(`${label}: ${fromVersion} exited before prompting`);
    if (!feedRequests.some((r) => r.path === imagePath && r.completed)) return null;
    return findPrompt();
  }, 500).catch((error) => {
    note('updater.log at failure', { tail: updaterLogTail() });
    throw error;
  });
  note(`${label}: downloaded and prompted`, { prompt: prompt.geometry });
  await delay(1000);
  screenshot(`hop${index + 1}-1-restart-now-prompt.png`);

  await beforeAccept?.();

  // Without a window manager, X keyboard focus follows the pointer, so put the
  // pointer on the prompt, focus it, and press the default (Restart Now) button.
  let gone = false;
  for (const key of ['Return', 'space']) {
    x(['mousemove', '--window', prompt.id, '40', '30']);
    x(['windowfocus', prompt.id]);
    x(['key', '--clearmodifiers', key]);
    note(`${label}: pressed`, { key });
    gone = await Promise.race([exited().then((value) => value !== false), delay(30000).then(() => false)]);
    if (gone) break;
    screenshot(`hop${index + 1}-1b-still-open-after-${key}.png`);
  }
  if (!gone) throw new Error(`${label}: ${fromVersion} did not quit after Restart Now`);
  note(`${label}: ${fromVersion} quit`);

  const newFile = installedPath(hop.version);
  const replaced = await waitFor(`${label}: file replacement`, 15000, () => !fs.existsSync(fromFile) && fs.existsSync(newFile))
    .catch(() => { throw new Error(`${label}: Applications holds ${JSON.stringify(fs.readdirSync(installDir))}`); });
  const installedHash = sha256(newFile);
  const stagedHash = sha256(path.join(hop.feed, path.basename(newFile)));
  if (!replaced || installedHash !== stagedHash) throw new Error(`${label}: installed file differs from the staged file`);
  note(`${label}: file replaced`, { removed: path.basename(fromFile), installed: path.basename(newFile), sha256: installedHash });

  const main = await waitFor(`${label}: relaunched main process running ${hop.version}`, 60000, () => mainProcessFor(hop.version), 500)
    .catch((error) => {
      note('AppImage processes at failure', { processes: appImageProcesses(), updaterLog: updaterLogTail() });
      throw error;
    });
  note(`${label}: relaunched`, { pid: main.pid, mount: main.mount, mountedVersion: hop.version });

  // Stay-up check: the relaunch must survive any single-instance contention
  // with the exiting copy, not merely start.
  await delay(20000);
  if (!pidAlive(main.pid)) throw new Error(`${label}: the relaunched ${hop.version} exited within 20 seconds`);
  note(`${label}: still running after 20s`, { pid: main.pid });
  screenshot(`hop${index + 1}-2-relaunched.png`);
  hopResults.push({ hop: index + 1, from: fromVersion, to: hop.version, sha256: installedHash, relaunchedPid: main.pid });
  return { main, file: newFile };
}

try {
  // A long-lived X server: xvfb-run would tear the display down when the N-1
  // process exits, leaving the relaunched candidate nowhere to draw.
  background.push(spawn('Xvfb', [display, '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], {
    detached: true, stdio: 'ignore',
  }));
  await waitFor('Xvfb', 15000, () => x(['getdisplaygeometry']) !== null);
  note('display ready', { display });

  const dbus = spawnSync('dbus-launch', ['--sh-syntax'], { env: xEnv, encoding: 'utf8' });
  const busAddress = dbus.stdout?.match(/DBUS_SESSION_BUS_ADDRESS='([^']+)'/)?.[1];
  const busPid = Number(dbus.stdout?.match(/DBUS_SESSION_BUS_PID=(\d+)/)?.[1]);
  if (busPid) background.push({ pid: busPid });

  for (const hop of hops) {
    if (!fs.existsSync(path.join(hop.feed, path.basename(installedPath(hop.version))))) {
      throw new Error(`staging feed ${hop.feed} has no AppImage for ${hop.version}`);
    }
  }

  // Serve the current hop's staging feed on loopback and keep a request log as
  // evidence that each candidate came from it.
  feedServer = http.createServer((request, response) => {
    // Record only values chosen from our own feed listing and fixed method
    // names, never text taken from the request itself.
    let requested = '';
    try {
      requested = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '');
    } catch {
      // A malformed path is simply not one of the feed's files.
    }
    const known = fs.readdirSync(servingFeed).find((file) => file === requested) ?? null;
    const entry = {
      at: new Date().toISOString(),
      method: ['GET', 'HEAD'].find((method) => method === request.method) ?? 'OTHER',
      path: known ? `/${known}` : '/(not in feed)',
      feed: path.basename(servingFeed),
    };
    feedRequests.push(entry);
    if (!known) {
      response.writeHead(404).end();
      return;
    }
    const file = path.join(servingFeed, known);
    const size = fs.statSync(file).size;
    response.on('finish', () => { entry.completed = true; entry.bytes = size; });
    response.writeHead(200, { 'Content-Length': size, 'Content-Type': 'application/octet-stream' });
    if (entry.method === 'HEAD') response.end();
    else fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => feedServer.listen(0, '127.0.0.1', resolve));
  const feedUrl = `http://127.0.0.1:${feedServer.address().port}/`;
  note('staging feed served', { hop: 1, files: fs.readdirSync(servingFeed).sort() });

  const oldInstalled = path.join(installDir, path.basename(oldImage));
  fs.copyFileSync(oldImage, oldInstalled);
  fs.chmodSync(oldInstalled, 0o755);

  const appEnv = {
    ...xEnv,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    ...(busAddress ? { DBUS_SESSION_BUS_ADDRESS: busAddress } : {}),
    BLANC_UPDATE_CHANNEL: 'staging',
    BLANC_UPDATE_STAGING_URL: feedUrl,
    BLANC_UPDATE_STAGING_ALLOW_HTTP: '1',
    // BLANC_UPDATE_STAGING_AUTO_INSTALL and the status file are deliberately
    // unset: the ordinary prompt must appear and be accepted.
  };

  oldApp = spawn(oldInstalled, [`--remote-debugging-port=${cdpPort}`, '--disable-gpu'], {
    detached: true, env: appEnv, stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [oldApp.stdout, oldApp.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => oldAppLog.push(chunk));
  }
  const oldExited = new Promise((resolve) => oldApp.once('exit', (code, signal) => resolve({ code, signal })));
  note('launched public N-1', { file: path.basename(oldInstalled), pid: oldApp.pid });

  if (!(await versionMarkerIs(`v${oldVersion}`))) throw new Error(`N-1 new-tab page does not show v${oldVersion}`);
  note('N-1 running', { versionMarker: `v${oldVersion}` });
  screenshot('0-n-minus-one-running.png');

  const first = await performHop(0, {
    fromVersion: oldVersion,
    fromFile: oldInstalled,
    isRunning: () => oldApp.exitCode === null,
    exited: () => oldExited,
    // Stage candidate B before accepting, so the relaunched A finds it on its
    // own startup check — exactly what its 30-minute timer would do later.
    beforeAccept: async () => {
      servingFeed = hops[1].feed;
      note('staging feed switched', { hop: 2, files: fs.readdirSync(servingFeed).sort() });
    },
  });

  await performHop(1, {
    fromVersion: hops[0].version,
    fromFile: first.file,
    isRunning: () => pidAlive(first.main.pid),
    exited: () => waitFor('relaunched A to exit', 60000, () => !pidAlive(first.main.pid), 250).then(() => true, () => false),
  });

  result = 'PASS';
} catch (error) {
  failure = error.message;
  note('FAILED', { error: error.message });
  screenshot('9-failure.png');
} finally {
  const pids = appImageProcesses().map((p) => p.pid);
  for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
  await delay(3000);
  for (const p of appImageProcesses()) { try { process.kill(p.pid, 'SIGKILL'); } catch { /* gone */ } }
  if (oldApp && oldApp.exitCode === null) { try { process.kill(-oldApp.pid, 'SIGKILL'); } catch { /* gone */ } }
  feedServer?.close();
  for (const proc of background) {
    try { process.kill(proc.pid, 'SIGTERM'); } catch { /* gone */ }
  }

  for (const dir of [path.join(home, '.config', 'Blanc'), path.dirname(updaterLog)]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.log')) fs.copyFileSync(path.join(dir, name), path.join(evidenceDir, `userdata-${name}`));
    }
  }
  fs.writeFileSync(path.join(evidenceDir, 'n-minus-one-output.log'), oldAppLog.join(''));
  fs.writeFileSync(path.join(evidenceDir, 'feed-requests.json'), `${JSON.stringify(feedRequests, null, 2)}\n`);
  const summary = { result, failure, from: oldVersion, hops: hopResults, timeline };
  fs.writeFileSync(path.join(evidenceDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const chain = [oldVersion, ...hops.map((h) => h.version)].join(' -> ');
  const reason = failure ? ` (${String(failure).replace(/[\r\n]+/g, ' ')})` : '';
  console.log(`linux-appimage-update-rehearsal ${result}: ${chain}${reason}`);
  process.exitCode = result === 'PASS' ? 0 : 1;
}
