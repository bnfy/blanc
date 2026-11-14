// A2 Task 7 on the emulator: Quiet Tabs and pull to refresh.
//   - With the quiet delay set to 20 s (the debug-only blanc.quiet_delay_ms;
//     1 hour in use), background tabs go quiet: their renderer processes end,
//     leaving the active tab's and the Start Page's (which has unload handlers).
//   - A quiet tab comes back when it's chosen, with its page and its back history.
//   - Pulling a web page down reloads it; pulling Blanc's Start Page down doesn't.
// Fails closed: a page or control it can't find fails.
//
//   node chromium/tests/android/quiet-tabs.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gridSwipe, nodeBounds} from './island-menu.mjs';
import {matching} from './palette.mjs';

const PACKAGE = 'me.bnfy.blanc.dev';
const PREFS = `shared_prefs/${PACKAGE}_preferences.xml`;
const PORT = 9333;

// Blanc's sandboxed processes in `ps -A`: renderers (a quiet tab has none) and the blocker's engine.
export function renderers(ps) {
  return ps.split('\n').filter(line => /me\.bnfy\.blanc\.dev:sandboxed_process/.test(line)).length;
}

async function evaluate(target, expression) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  const value = await new Promise(r => {
    ws.onmessage = m => r(JSON.parse(m.data).result?.result?.value);
    ws.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {expression, returnByValue: true}}));
  });
  ws.close();
  return value;
}

// The target list, or `expression` evaluated in the page that's showing.
async function devtools(expression) {
  const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
  if (!expression) return list;
  for (const target of list.filter(t => t.type === 'page')) {
    if (await evaluate(target, 'document.visibilityState') === 'visible') return evaluate(target, expression);
  }
  return null;
}

async function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: quiet-tabs.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const sleep = s => execFileSync('sleep', [String(s)]);
  const dump = () => { adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml'); return adb('shell', 'cat', '/sdcard/blanc-ui.xml'); };
  const center = b => [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)].map(String);
  const tap = query => { const b = nodeBounds(dump(), query); if (b) { adb('shell', 'input', 'tap', ...center(b)); sleep(1.5); } return !!b; };
  // The tab grid opens with a swipe from the Island into the page; the closed Island has no tab count.
  const openGrid = () => { const swipe = gridSwipe(dump()); if (swipe) { adb('shell', 'input', 'swipe', ...swipe, '250'); sleep(2); } return !!swipe; };
  const launch = () => { adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1'); sleep(7); };
  const view = url => { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, '-p', PACKAGE); sleep(6); };
  const pull = () => { adb('shell', 'input', 'swipe', '540', '500', '540', '1500', '600'); sleep(4); };
  const results = [];
  const check = (name, problems) => results.push({case: name, problems});

  adb('install', '-r', apk);
  adb('shell', 'pm', 'clear', PACKAGE);
  launch();
  adb('shell', 'am', 'force-stop', PACKAGE);
  const prefs = adb('shell', 'run-as', PACKAGE, 'cat', PREFS).replace(/\s*<long name="blanc\.quiet_delay_ms"[^>]*\/>/, '');
  adb('shell', `run-as ${PACKAGE} sh -c 'cat > ${PREFS}' <<'EOF'\n${prefs.replace('</map>', '    <long name="blanc.quiet_delay_ms" value="20000" />\n</map>')}\nEOF`);
  launch();
  adb('forward', `tcp:${PORT}`, 'localabstract:chrome_devtools_remote');
  try {
    // A tab with back history: Domains, then About in the same tab.
    view('https://www.iana.org/domains');
    tap({id: 'blanc_island_domain'});
    adb('shell', 'input', 'text', 'https://www.iana.org/about'); adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER'); sleep(6);
    view('https://www.iana.org/protocols');
    view('https://www.iana.org/numbers');
    const before = renderers(adb('shell', 'ps', '-A'));
    sleep(80);
    const after = renderers(adb('shell', 'ps', '-A'));
    const showing = await devtools('location.href');
    check('background tabs go quiet and the active one stays', before >= 4 && before - after >= 2 && /numbers/.test(showing || '')
      ? [] : [`${before} renderers then ${after}; showing ${showing}`]);

    openGrid();
    const card = matching(dump(), /^Switch to About us$/, 'content-desc');
    if (card) { adb('shell', 'input', 'tap', ...center(card)); sleep(6); }
    const woke = await devtools('location.href');
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); sleep(5);
    const previous = await devtools('location.href');
    check('a quiet tab comes back with its back history', /\/about/.test(woke || '') && /\/domains/.test(previous || '')
      ? [] : [`came back to ${woke}, back went to ${previous}`]);

    const web = await devtools('performance.timeOrigin');
    pull();
    const webAfter = await devtools('performance.timeOrigin');
    tap({id: 'blanc_island_new_tab'}); sleep(3);
    const start = await devtools('location.href + " " + performance.timeOrigin');
    pull();
    const startAfter = await devtools('location.href + " " + performance.timeOrigin');
    check('pulling a web page down reloads it', web && webAfter && webAfter !== web ? [] : ['the page did not reload']);
    check('pulling the Start Page down doesn\'t', /chrome:\/\/blanc\/newtab/.test(start || '') && start === startAfter
      ? [] : [`${start} then ${startAfter}`]);
  } finally {
    adb('forward', '--remove', `tcp:${PORT}`);
  }

  fs.writeFileSync(path.join(evidence, 'quiet-tabs.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (results.some(r => r.problems.length)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`Quiet tabs: ${error.message}`); process.exitCode = 1; });
}
