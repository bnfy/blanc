// Driving Blanc for Android on the emulator for the acceptance steps: adb input, UI Automator
// dumps, DevTools for page state, and an HTTPS fixture server (fixture-server.mjs) that every
// *.example host resolves to (Chromium's debug command-line file maps them to it through `adb reverse`).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import {gridSwipe, nodeBounds} from '../../island-menu.mjs';
import {matching, paletteField} from '../../palette.mjs';
import {findCount} from '../../find.mjs';
import {renderers} from '../../quiet-tabs.mjs';
import {devtoolsSocket, gridState, paletteRows, rawPixel} from './parse.mjs';
import {hostPort} from '../../support/host-ports.mjs';
import {androidPackage} from '../../release-gate.mjs';

export const PACKAGE = androidPackage();
const PREFS = `shared_prefs/${PACKAGE}_preferences.xml`;
// SettingsStore.WALKTHROUGH_KEY: the walkthrough version someone finished.
const WALKTHROUGH_KEY = 'blanc.walkthrough_completed_version';
// The fixture server's port on the device, which the switches below map the fixture hosts to, and on
// this server (support/host-ports.mjs: each emulator's runs have their own), joined by adb reverse.
const FIXTURE_PORT = 8765;
const FIXTURE_HOST_PORT = hostPort(FIXTURE_PORT);
let requestLog = null;
const DEVTOOLS_PORT = hostPort(9333);
const COMMAND_LINE = '/data/local/tmp/chrome-command-line';

export const sleep = seconds => execFileSync('sleep', [String(seconds)]);
export const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
const center = b => [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)];
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One connection per DevTools request: a kept-alive one outlives `adb forward` being pointed at
// another app's socket and would go on answering for the old app. Timed out, because a frozen app
// accepts a connection and never answers.
const devtoolsRequest = ms => ({headers: {connection: 'close'}, signal: AbortSignal.timeout(ms)});

let commandLineDir = null;

// Test-only switches, read by a debug build on this userdebug emulator: the fixture hosts, their
// self-signed certificate, and any `extra`. Nothing else in Blanc changes. The search engine is a
// fixture too: the real one sends this server's address to an error page, which drops the search.
export function setSwitches(extra = '') {
  const switches = `_ --host-resolver-rules="MAP *.example 127.0.0.1:${FIXTURE_PORT},MAP *.doubleclick.net 127.0.0.1:${FIXTURE_PORT},MAP duckduckgo.com 127.0.0.1:${FIXTURE_PORT}" --ignore-certificate-errors ${extra}`;
  const file = path.join(commandLineDir, 'chrome-command-line');
  fs.writeFileSync(file, switches.trim() + '\n');
  adb('push', file, COMMAND_LINE);
  adb('shell', 'chmod', '644', COMMAND_LINE);
}

// The fixture server runs in its own thread: adb and sleep() here block this one, and a server on
// it would stop answering, which looks exactly like a page that won't load.
export function startFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-acceptance-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=*.example',
    '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem')], {stdio: 'ignore'});
  // Root first, which a reboot drops: it restarts adbd, so it can't come after adb reverse.
  adb('root');
  adb('wait-for-device');
  // Shared with the server's thread: this thread reads it even while the server is busy.
  requestLog = new SharedArrayBuffer(1024 * 1024);
  const worker = new Worker(new URL('./fixture-server.mjs', import.meta.url), {workerData: {dir, port: FIXTURE_HOST_PORT, requestLog}});
  adb('reverse', `tcp:${FIXTURE_PORT}`, `tcp:${FIXTURE_HOST_PORT}`);
  commandLineDir = dir;
  setSwitches();
  return () => {
    worker.terminate();
    adb('shell', 'rm', '-f', COMMAND_LINE);
    adb('reverse', '--remove', `tcp:${FIXTURE_PORT}`);
    fs.rmSync(dir, {recursive: true, force: true});
  };
}

// Every address the fixture server has been asked for since the last clear.
export function fixtureRequests() {
  const size = Atomics.load(new Int32Array(requestLog, 0, 1), 0);
  return new TextDecoder().decode(new Uint8Array(requestLog, 4, size).slice()).split('\n').filter(Boolean);
}
export function clearFixtureRequests() { Atomics.store(new Int32Array(requestLog, 0, 1), 0, 0); }

async function evaluate(target, expression, timeoutMs = 3000) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(undefined), timeoutMs);
      ws.onerror = () => { clearTimeout(timer); resolve(undefined); };
      ws.onopen = () => ws.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {expression, returnByValue: true, awaitPromise: true}}));
      ws.onmessage = m => { clearTimeout(timer); resolve(JSON.parse(m.data).result?.result?.value); };
    });
  } finally {
    ws.close();
  }
}

export class Device {
  // UI Automator refuses a dump while the screen won't settle, so it gets a moment and a second go.
  dump() {
    for (let attempt = 0; ; attempt++) {
      try {
        adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml');
        return adb('shell', 'cat', '/sdcard/blanc-ui.xml');
      } catch (error) {
        if (attempt === 2) throw error;
        sleep(1);
      }
    }
  }

  tapAt(b, wait = 1.5) { adb('shell', 'input', 'tap', ...center(b).map(String)); sleep(wait); }
  longPressAt(b) { const [x, y] = center(b).map(String); adb('shell', 'input', 'swipe', x, y, x, y, '1500'); sleep(1.5); }

  // Bounds of a node by resource id, exact text or content-desc pattern, failing when absent.
  find(query, xml = this.dump()) {
    const b = query.desc ? matching(xml, query.desc, 'content-desc') : nodeBounds(xml, query);
    if (!b) throw Error(`Nothing on screen matches ${JSON.stringify(query.desc ? String(query.desc) : query)}`);
    return b;
  }
  has(query, xml = this.dump()) {
    return !!(query.desc ? matching(xml, query.desc, 'content-desc') : nodeBounds(xml, query));
  }
  tap(query) { this.tapAt(this.find(query)); }
  swipe(x1, y1, x2, y2, ms = 300, wait = 1.5) {
    adb('shell', 'input', 'swipe', ...[x1, y1, x2, y2, ms].map(v => String(Math.round(v))));
    sleep(wait);
  }
  back() { adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); sleep(1); }
  type(text) { adb('shell', 'input', 'text', text.replace(/ /g, '%s').replace(/([&;()<>|'"$`\\])/g, '\\$1')); sleep(1.5); }
  enter() { adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER'); sleep(3); }

  screenSize() {
    const m = /(\d+)x(\d+)/.exec(adb('shell', 'wm', 'size').split('\n').filter(l => l.trim()).pop());
    return {width: Number(m[1]), height: Number(m[2])};
  }

  pixel(x, y) {
    return rawPixel(execFileSync('adb', ['exec-out', 'screencap'], {maxBuffer: 256 * 1024 * 1024}), x, y);
  }

  // A fresh Blanc: no data, launched on its Start Page.
  async reset() {
    adb('shell', 'am', 'force-stop', PACKAGE);
    adb('shell', 'pm', 'clear', PACKAGE);
    await this.launch();
    // A release build shows the welcome card on every fresh start (only debug builds skip it, while
    // FirstMinute.SKIP_FILE exists), and it would cover every scenario. The card has its own checks
    // (tests/android/walkthrough.mjs); here it is marked done, as for someone who finished it, which
    // relaunches Blanc.
    if (PACKAGE === 'me.bnfy.blanc') {
      // Android writes the preferences file a moment after the first page shows.
      await this.waitFor(() => adb('shell', 'ls', `/data/data/${PACKAGE}/shared_prefs/`).includes(`${PACKAGE}_preferences.xml`),
        'Blanc to write its preferences', 20);
      await this.setPref(`<int name="${WALKTHROUGH_KEY}" value="2147483647" />`, WALKTHROUGH_KEY);
    }
  }

  async launch() {
    adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
    // The socket appears once Blanc starts, named by its process id when another Chromium app (the
    // debug build on the gate's emulator) holds the plain name, so it is found again on each try and
    // trusted only when it answers for this package.
    await this.waitFor(async () => {
      let pid = '';
      try { pid = adb('shell', 'pidof', PACKAGE).trim().split(/\s+/)[0]; } catch {} // not running yet
      adb('forward', `tcp:${DEVTOOLS_PORT}`, `localabstract:${devtoolsSocket(pid, adb('shell', 'cat', '/proc/net/unix'))}`);
      return await this.devtoolsPackage() === PACKAGE && (await this.visibleUrl()) !== null;
    }, 'Blanc to show a page', 30);
  }

  async devtoolsPackage() {
    try {
      return (await (await fetch(`http://localhost:${DEVTOOLS_PORT}/json/version`, devtoolsRequest(2000))).json())['Android-Package'];
    } catch {
      return null;
    }
  }

  async relaunch() {
    adb('shell', 'am', 'force-stop', PACKAGE);
    sleep(1);
    await this.launch();
    sleep(3);
  }

  // Edits an existing preference before launch. Release needs the rooted emulator; this
  // does not enable preferences the production app ignores (for example quiet-delay).
  async setPref(xmlEntry, name) {
    adb('shell', 'am', 'force-stop', PACKAGE);
    const release = PACKAGE === 'me.bnfy.blanc';
    if (release && adb('shell', 'id', '-u').trim() !== '0') throw Error('Release preferences require rooted emulator adbd');
    const prefPath = release ? `/data/data/${PACKAGE}/${PREFS}` : PREFS;
    const prefix = release ? [] : ['run-as', PACKAGE];
    const prefs = adb('shell', ...prefix, 'cat', prefPath).replace(new RegExp(`\\s*<[a-z]+ name="${escape(name)}"[^>]*?(/>|>[^<]*</[a-z]+>)`), '');
    // Write in place so the app's existing ownership and SELinux context remain intact.
    adb('shell', `${release ? '' : `run-as ${PACKAGE} `}sh -c 'cat > ${prefPath}' <<'EOF'\n${prefs.replace('</map>', `    ${xmlEntry}\n</map>`)}\nEOF`);
    await this.launch();
  }

  // Opens an address in a new tab, as a link from another app does.
  async view(url) {
    // adb shell joins its arguments into one device shell line, so the address is quoted.
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, '-p', PACKAGE);
    await this.waitForUrl(url);
  }

  async targets() {
    try {
      return (await (await fetch(`http://localhost:${DEVTOOLS_PORT}/json`, devtoolsRequest(5000))).json()).filter(t => t.type === 'page');
    } catch {
      return [];
    }
  }

  // `expression` in the page on screen (the one whose document is visible), or null.
  async page(expression) {
    for (const target of await this.targets()) {
      if (await evaluate(target, 'document.visibilityState', 1500) === 'visible') return evaluate(target, expression);
    }
    return null;
  }
  visibleUrl() { return this.page('location.href'); }

  // `what` names the wait in its timeout error. Pass a function when the error should report a value
  // the condition reads, because a plain string is built before the first read.
  async waitFor(condition, what, seconds = 15) {
    for (let i = 0; i < seconds * 2; i++) {
      if (await condition()) return;
      await new Promise(r => setTimeout(r, 500));
    }
    throw Error(`Timed out waiting for ${typeof what === 'function' ? what() : what}`);
  }
  async waitForUrl(url, seconds = 20) {
    let last = null;
    await this.waitFor(async () => (last = await this.visibleUrl()) === url, () => `the page to be ${url} (it is ${last})`, seconds);
  }

  renderers() { return renderers(adb('shell', 'ps', '-A'), PACKAGE); }

  // Ends Blanc's sandboxed processes, the blocker's among them, as Android does under pressure.
  // Needs root (see startFixtures). A kill that fails must fail the check: a check that ends
  // nothing passes without testing anything.
  killSandboxed() {
    const pids = adb('shell', 'ps', '-A', '-o', 'PID,NAME').split('\n').filter(l => /sandboxed_process/.test(l))
      .map(l => l.trim().split(/\s+/)[0]);
    if (!pids.length) throw Error('No sandboxed process to end');
    let ended = 0;
    for (const pid of pids) {
      try {
        adb('shell', 'kill', '-9', pid);
        ended++;
      } catch (error) {
        if (!/No such process/.test(String(error.stderr))) throw Error(`Could not end ${pid}: ${error.stderr}`);
      }
    }
    if (!ended) throw Error('Ended no process');
  }

  // The palette: tap the Island's address; what's typed then goes into its field.
  // Waits for its field to have focus, so nothing typed is lost while the sheet opens.
  openPalette() {
    if (!this.has({id: 'blanc_island_domain'})) this.back();
    this.tap({id: 'blanc_island_domain'});
    for (let i = 0; i < 5; i++) {
      if (paletteField(this.dump())) return;
      sleep(1);
    }
    throw Error('The palette opened without a focused field');
  }
  paletteRows() { return paletteRows(this.dump()); }
  // Waits for `text` in the open palette, scrolling its list: rows below the open tabs (the Recently
  // closed band) can sit under what the keyboard leaves on screen, where a dump doesn't see them.
  // Swipes inside the list's own bounds, so any screen size and keyboard height works.
  async scrollPaletteTo(text, what = text, seconds = 15) {
    await this.waitFor(async () => {
      const xml = this.dump();
      if (xml.includes(text)) return true;
      const list = /<node [^>]*class="android\.widget\.ScrollView"[^>]*scrollable="true"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(xml);
      if (list) {
        const [left, top, right, bottom] = list.slice(1).map(Number);
        const x = Math.round((left + right) / 2), span = bottom - top;
        this.swipe(x, Math.round(bottom - span * 0.15), x, Math.round(top + span * 0.15));
      }
      return false;
    }, what, seconds);
  }
  runInPalette(text) {
    this.openPalette();
    this.type(text);
    const typed = /<node[^>]*class="android\.widget\.EditText"[^>]*>/.exec(this.dump())?.[0] ?? '';
    if (!typed.includes(`text="${text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)) {
      throw Error(`The palette's field doesn't hold "${text}": ${typed}`);
    }
    this.enter();
  }

  // The tab grid, opened afresh so no step races the last one's popup closing.
  openGrid() {
    const xml = this.dump();
    if (nodeBounds(xml, {text: 'Open tabs'})) return;
    // The swipe from the Island into the page; the closed Island has no tab count to tap.
    let swipe = gridSwipe(xml);
    if (!swipe) { this.back(); swipe = gridSwipe(this.dump()); }
    if (!swipe) throw Error('The Island is not on screen to open the tab grid from');
    adb('shell', 'input', 'swipe', ...swipe, '250');
    sleep(2);
  }
  closeGrid() { if (this.has({text: 'Open tabs'})) this.tap({text: 'Done'}); }
  // What the grid shows, leaving it open if it was.
  grid() {
    const open = this.has({text: 'Open tabs'});
    this.openGrid();
    const state = gridState(this.dump());
    if (!open) this.closeGrid();
    return state;
  }
  card(title) { return {desc: new RegExp(`^Switch to ${escape(title)}$`)}; }

  // A card's long-press menu: the entry `want`, or (to read it) whether `want` is on it.
  cardMenu(title, want, {choose = true} = {}) {
    this.openGrid();
    this.longPressAt(this.find(this.card(title)));
    const shown = this.has({text: want});
    if (shown && choose) this.tap({text: want});
    else this.back();
    this.closeGrid();
    return shown;
  }

  menu(entry) {
    this.tap({id: 'blanc_island_menu'});
    this.tap({text: entry});
  }

  // Whether Settings' Blanc Blocker switch is on, from the switch after its title. Swipes only once
  // Settings is in front, and goes Back only if it opened, so the page underneath is never touched.
  async blockerSwitchOn() {
    const inSettings = () => adb('shell', 'dumpsys', 'activity', 'activities')
        .split('\n').some(l => /ResumedActivity/.test(l) && l.includes('.settings.SettingsActivity'));
    this.menu('Settings');
    await this.waitFor(async () => inSettings(), 'Settings to open');
    try {
      const {width, height} = this.screenSize();
      for (let i = 0; i < 10; i++) {
        const nodes = this.dump().match(/<node [^>]*>/g) ?? [];
        const title = nodes.findIndex(n => n.includes('text="Blanc Blocker"'));
        const widget = title < 0 ? null : nodes.slice(title + 1, title + 8).find(n => n.includes('class="android.widget.Switch"'));
        const state = widget && /checked="(true|false)"/.exec(widget);
        if (state) return state[1] === 'true';
        this.swipe(width / 2, height * 0.75, width / 2, height * 0.3, 300, 0.8);
      }
      throw Error('Settings shows no Blanc Blocker switch');
    } finally {
      this.back();
    }
  }

  findCount() { return findCount(this.dump()); }
}
