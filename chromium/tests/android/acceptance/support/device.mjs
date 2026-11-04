// Driving Blanc for Android on the emulator for the acceptance steps: adb input, UI Automator
// dumps, DevTools for page state, and an HTTPS fixture server that every *.example host resolves
// to (Chromium's debug command-line file maps them to it through `adb reverse`).
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {nodeBounds} from '../../island-menu.mjs';
import {matching, paletteField} from '../../palette.mjs';
import {findCount} from '../../find.mjs';
import {renderers} from '../../quiet-tabs.mjs';
import {gridState, paletteRows, pageTitle, rawPixel} from './parse.mjs';

export const PACKAGE = 'me.bnfy.blanc.dev';
const PREFS = `shared_prefs/${PACKAGE}_preferences.xml`;
const FIXTURE_PORT = 8765;
const DEVTOOLS_PORT = 9333;
const COMMAND_LINE = '/data/local/tmp/chrome-command-line';

export const sleep = seconds => execFileSync('sleep', [String(seconds)]);
export const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
const center = b => [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)];
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A page per address: its title is its host (and path), "/words?w=widget&n=3" repeats a word,
// "/link" is one link to child.example filling the page (target=_blank), and every page has a
// button that counts its clicks in document.title's data-clicks.
const text = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function fixturePage(url) {
  const title = text(decodeURIComponent(pageTitle(url.hostname, url.pathname)));
  const word = text(url.searchParams.get('w') ?? '');
  const words = word ? Array.from({length: Number(url.searchParams.get('n'))}, (_, i) => `<p>${word} number ${i + 1}</p>`).join('') : '';
  const link = url.pathname === '/link'
    ? '<a id="child" href="https://child.example/" target="_blank" style="position:fixed;inset:0;z-index:1;display:block;font-size:40px">Open child</a>' : '';
  return `<!doctype html><meta name="viewport" content="width=device-width"><title>${title}</title>
<button id="clicker" style="width:100%;height:40vh;font-size:30px" onclick="this.dataset.clicks=(+this.dataset.clicks||0)+1">${title}</button>
${words}${link}<div style="height:150vh"></div>`;
}

export function startFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-acceptance-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=*.example',
    '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem')], {stdio: 'ignore'});
  const server = https.createServer({key: fs.readFileSync(path.join(dir, 'key.pem')), cert: fs.readFileSync(path.join(dir, 'cert.pem'))},
    (request, response) => {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
      response.end(fixturePage(new URL(request.url, `https://${request.headers.host}`)));
    });
  server.listen(FIXTURE_PORT);
  adb('reverse', `tcp:${FIXTURE_PORT}`, `tcp:${FIXTURE_PORT}`);
  // Test-only switches, read by a debug build on this userdebug emulator: the fixture hosts, and
  // their self-signed certificate. Nothing else in Blanc changes.
  const switches = `_ --host-resolver-rules="MAP *.example 127.0.0.1:${FIXTURE_PORT}" --ignore-certificate-errors`;
  const file = path.join(dir, 'chrome-command-line');
  fs.writeFileSync(file, switches + '\n');
  adb('push', file, COMMAND_LINE);
  adb('shell', 'chmod', '644', COMMAND_LINE);
  return () => {
    server.close();
    adb('shell', 'rm', '-f', COMMAND_LINE);
    adb('reverse', '--remove', `tcp:${FIXTURE_PORT}`);
    fs.rmSync(dir, {recursive: true, force: true});
  };
}

async function evaluate(target, expression, timeoutMs = 3000) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(undefined), timeoutMs);
      ws.onerror = () => { clearTimeout(timer); resolve(undefined); };
      ws.onopen = () => ws.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {expression, returnByValue: true}}));
      ws.onmessage = m => { clearTimeout(timer); resolve(JSON.parse(m.data).result?.result?.value); };
    });
  } finally {
    ws.close();
  }
}

export class Device {
  dump() {
    adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml');
    return adb('shell', 'cat', '/sdcard/blanc-ui.xml');
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

  async waitFor(condition, what, seconds = 15) {
    for (let i = 0; i < seconds * 2; i++) {
      if (await condition()) return;
      await new Promise(r => setTimeout(r, 500));
    }
    throw Error(`Timed out waiting for ${what}`);
  }
  async waitForUrl(url, seconds = 20) {
    let last = null;
    await this.waitFor(async () => (last = await this.visibleUrl()) === url, `the page to be ${url} (it is ${last})`, seconds);
  }

  renderers() { return renderers(adb('shell', 'ps', '-A')); }

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
    if (!nodeBounds(xml, {id: 'blanc_island_tabs'})) this.back();
    this.tap({id: 'blanc_island_tabs'});
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
