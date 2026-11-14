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
import {gridState, paletteRows, rawPixel} from './parse.mjs';

export const PACKAGE = 'me.bnfy.blanc.dev';
const PREFS = `shared_prefs/${PACKAGE}_preferences.xml`;
const FIXTURE_PORT = 8765;
let requestLog = null;
const DEVTOOLS_PORT = 9333;
const COMMAND_LINE = '/data/local/tmp/chrome-command-line';

export const sleep = seconds => execFileSync('sleep', [String(seconds)]);
export const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
const center = b => [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)];
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  const worker = new Worker(new URL('./fixture-server.mjs', import.meta.url), {workerData: {dir, port: FIXTURE_PORT, requestLog}});
  adb('reverse', `tcp:${FIXTURE_PORT}`, `tcp:${FIXTURE_PORT}`);
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
  }

  async launch() {
    adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
    adb('forward', `tcp:${DEVTOOLS_PORT}`, 'localabstract:chrome_devtools_remote');
    await this.waitFor(async () => (await this.visibleUrl()) !== null, 'Blanc to show a page', 30);
  }

  async relaunch() {
    adb('shell', 'am', 'force-stop', PACKAGE);
    sleep(1);
    await this.launch();
    sleep(3);
  }

  // Sets a debug-only preference before a launch (the app must have run once to have the file).
  async setPref(xmlEntry, name) {
    adb('shell', 'am', 'force-stop', PACKAGE);
    const prefs = adb('shell', 'run-as', PACKAGE, 'cat', PREFS).replace(new RegExp(`\\s*<[a-z]+ name="${escape(name)}"[^>]*?(/>|>[^<]*</[a-z]+>)`), '');
    adb('shell', `run-as ${PACKAGE} sh -c 'cat > ${PREFS}' <<'EOF'\n${prefs.replace('</map>', `    ${xmlEntry}\n</map>`)}\nEOF`);
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
      return (await (await fetch(`http://localhost:${DEVTOOLS_PORT}/json`)).json()).filter(t => t.type === 'page');
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

  renderers() { return renderers(adb('shell', 'ps', '-A')); }

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

  findCount() { return findCount(this.dump()); }
}
