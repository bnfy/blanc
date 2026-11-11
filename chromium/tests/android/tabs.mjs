// A2 on the emulator: Blanc's tab operations through BlancTabs (Task 3).
//   - New Tab opens a Start Page tab and the Island's count goes up by one.
//   - In a private tab, the private chip closes it and the normal tabs come back.
// Tasks 4 and 5 add close, Undo, /reopen, duplicate, pin and mute once the
// palette and grid exist. Fails closed: a missing control fails.
//
//   node chromium/tests/android/tabs.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gridSwipe, nodeBounds} from './island-menu.mjs';

const PACKAGE = 'me.bnfy.blanc.dev';
const PAGE = 'https://www.iana.org/domains';

// The number of open tabs, read beside "Open tabs" in the open tab grid, or null when the grid isn't
// open. The closed Island has no tab count.
export function tabCount(xml) {
  const m = /<node[^>]*text="Open tabs"[\s\S]*?<node[^>]*text="(\d+)"/.exec(xml);
  return m ? Number(m[1]) : null;
}

function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: tabs.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const sleep = s => execFileSync('sleep', [String(s)]);
  const dump = () => { adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml'); return adb('shell', 'cat', '/sdcard/blanc-ui.xml'); };
  const center = b => [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)].map(String);
  const tap = query => { const b = nodeBounds(dump(), query); if (b) { adb('shell', 'input', 'tap', ...center(b)); sleep(2); } return !!b; };
  // Opens the grid with the swipe from the Island, reads its count, and closes it.
  const count = () => {
    const swipe = gridSwipe(dump());
    if (!swipe) return null;
    adb('shell', 'input', 'swipe', ...swipe, '250'); sleep(2);
    const open = dump();
    const n = tabCount(open);
    if (nodeBounds(open, {text: 'Done'})) tap({text: 'Done'});
    return n;
  };
  const shot = name => fs.writeFileSync(path.join(evidence, `${name}.png`), execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}));
  const results = [];
  const check = (name, problems) => results.push({case: name, problems});

  adb('install', '-r', apk);
  adb('shell', 'pm', 'clear', PACKAGE);
  adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
  sleep(7);
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', PAGE, '-p', PACKAGE);
  sleep(6);
  const before = count();
  const tapped = tap({id: 'blanc_island_new_tab'});
  sleep(2);
  const xml = dump();
  shot('1-new-tab');
  const after = count();
  check('New Tab adds a Start Page tab', !tapped ? ['no New Tab button'] : before === null || after !== before + 1
    ? [`count went from ${before} to ${after}`] : nodeBounds(xml, {text: 'Start Page'}) ? [] : ['the new tab is not the Start Page']);

  tap({id: 'blanc_island_menu'});
  const opened = tap({text: 'New Private Tab'});
  sleep(2);
  const privateXml = dump();
  const chip = nodeBounds(privateXml, {id: 'blanc_island_private'});
  const withPrivate = count();
  if (chip) { adb('shell', 'input', 'tap', ...center(chip)); sleep(3); }
  const back = dump();
  const withoutPrivate = count();
  shot('2-private-closed');
  check('The private chip closes the private tab', !opened || !chip ? ['no private tab or chip']
    : nodeBounds(back, {id: 'blanc_island_private'}) ? ['still private']
      : withoutPrivate !== withPrivate - 1 ? [`count ${withPrivate} then ${withoutPrivate}`] : []);

  fs.writeFileSync(path.join(evidence, 'tabs.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (results.some(r => r.problems.length)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`Tabs: ${error.message}`); process.exitCode = 1; }
}
