// A2 Task 7 on the emulator (Review Focus 1): Android ends Blanc mid-session.
// With four tabs, one in a group named Research and colored Sky, one pinned,
// one muted, a chosen active tab and a private tab, Blanc is sent to the
// background and killed (`am kill`), then force-stopped, then the emulator
// reboots. Each time the tabs, the group with its name and color, the pin, the
// mute and the active tab come back, the private tab is gone, and no Undo
// banner shows. Fails closed: a missing control or state fails.
//
//   node chromium/tests/android/session-restore.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nodeBounds} from './island-menu.mjs';
import {matching} from './palette.mjs';
import {cardLabels} from './tab-grid.mjs';
import {tabCount} from './tabs.mjs';

const PACKAGE = 'me.bnfy.blanc.dev';
const PREFS = `shared_prefs/${PACKAGE}_preferences.xml`;
const PAGES = ['https://www.iana.org/domains', 'https://www.iana.org/about', 'https://www.iana.org/protocols'];

// The selected card's label in the grid ("Switch to About us"), or null.
export function activeCard(xml) {
  for (const m of xml.matchAll(/<node[^>]*>/g)) {
    const desc = /content-desc="(Switch to [^"]*)"/.exec(m[0])?.[1];
    if (desc && /selected="true"/.test(m[0])) return desc;
  }
  return null;
}

// What the grid and Blanc's preferences say about the session.
export function sessionProblems(state) {
  const problems = [];
  if (state.cards !== 4) problems.push(`the Island counts ${state.cards} tabs, not 4`);
  if (!state.group) problems.push('no Research group');
  if (!state.sky) problems.push('the group lost its color');
  if (!state.pinned) problems.push('the pin is gone');
  if (!state.muted) problems.push('the mute is gone');
  if (!state.active) problems.push(`the active tab is ${state.island}, not About us`);
  if (state.privateTabs) problems.push('the private tab came back');
  if (state.undo) problems.push('an Undo banner shows');
  return problems;
}

function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: session-restore.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const sleep = s => execFileSync('sleep', [String(s)]);
  const dump = () => { adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml'); return adb('shell', 'cat', '/sdcard/blanc-ui.xml'); };
  const center = b => [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)].map(String);
  const tapAt = b => { adb('shell', 'input', 'tap', ...center(b)); sleep(1.5); };
  const tap = query => { const b = nodeBounds(dump(), query); if (b) tapAt(b); return !!b; };
  const tapDesc = pattern => { const b = matching(dump(), pattern, 'content-desc'); if (b) tapAt(b); return !!b; };
  const longPressDesc = pattern => {
    const b = matching(dump(), pattern, 'content-desc');
    // Longer than any long-press timeout (this emulator's is 1000 ms).
    if (b) { const [x, y] = center(b); adb('shell', 'input', 'swipe', x, y, x, y, '1500'); sleep(1.5); }
    return !!b;
  };
  const back = () => { adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); sleep(1); };
  // The whole grid: it scrolls, and a dump lists only what's on screen.
  const wholeGrid = () => {
    let xml = dump();
    for (let i = 0; i < 6; i++) { adb('shell', 'input', 'swipe', '540', '1300', '540', '900', '400'); sleep(1); xml += dump(); }
    for (let i = 0; i < 4; i++) { adb('shell', 'input', 'swipe', '540', '500', '540', '1400', '300'); sleep(0.5); }
    return xml;
  };
  const uniqueCards = xml => [...new Set(cardLabels(xml))];
  const launch = () => { adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1'); sleep(8); };
  const shot = name => fs.writeFileSync(path.join(evidence, `${name}.png`), execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}));
  const palette = command => { tap({id: 'blanc_island_domain'}); adb('shell', 'input', 'text', command.replace(/ /g, '%s')); adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER'); sleep(3); };

  adb('install', '-r', apk);
  adb('shell', 'pm', 'clear', PACKAGE);
  launch();
  for (const page of PAGES) { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', page, '-p', PACKAGE); sleep(5); }

  // Each step opens the grid afresh, so no step races the last one's popup closing.
  const grid = () => { if (!nodeBounds(dump(), {text: 'Open tabs'})) tap({id: 'blanc_island_tabs'}); };
  const closeGrid = () => { if (nodeBounds(dump(), {text: 'Open tabs'})) tap({text: 'Done'}); };
  // Group the Protocols tab (active now) as Research, colored Sky.
  palette('/group Research');
  grid();
  tapDesc(/^Group options$/);
  tap({text: 'Color'});
  tap({text: 'Sky'});
  closeGrid();
  // Pin the Start Page tab and mute the Domains tab.
  grid();
  longPressDesc(/^Switch to New Tab$/);
  tap({text: 'Pin Tab'});
  closeGrid();
  grid();
  longPressDesc(/^Switch to Domain Name Services$/);
  tap({text: 'Mute Tab'});
  closeGrid();
  // A private tab, then About us as the active tab.
  tap({id: 'blanc_island_menu'});
  tap({text: 'New Private Tab'});
  sleep(2);
  grid();
  tapDesc(/^Switch to About us$/);
  shot('0-before');
  if (argv.includes('--setup-only')) {
    tap({id: 'blanc_island_tabs'});
    const grid = wholeGrid();
    shot('0-before-grid');
    longPressDesc(/^Switch to New Tab$/);
    const pinned = !!nodeBounds(dump(), {text: 'Unpin Tab'});
    back();
    console.log(JSON.stringify({count: tabCount(dump()), pinned, cards: uniqueCards(grid), active: activeCard(grid), research: !!matching(grid, /^Research$/), private: !!matching(grid, /^Private$/)}));
    return;
  }

  const read = name => {
    launch();
    const count = tabCount(dump());
    tap({id: 'blanc_island_tabs'});
    shot(name);
    const grid = wholeGrid();
    const prefs = adb('shell', 'run-as', PACKAGE, 'cat', PREFS);
    longPressDesc(/^Switch to New Tab$/);
    const pinned = !!nodeBounds(dump(), {text: 'Unpin Tab'});
    back();
    longPressDesc(/^Switch to Domain Name Services$/);
    const muted = !!nodeBounds(dump(), {text: 'Unmute Tab'});
    back();
    back();
    return {
      cards: count, group: !!matching(grid, /^Research$/), sky: prefs.includes('#376694'),
      pinned, muted, island: activeCard(grid), active: activeCard(grid) === 'Switch to About us',
      privateTabs: !!matching(grid, /^Private$/), undo: !!nodeBounds(grid, {text: 'Tab closed'}),
    };
  };

  const results = [];
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); sleep(2);
  adb('shell', 'am', 'kill', PACKAGE); sleep(2);
  results.push({case: 'after Android kills it in the background', ...{problems: sessionProblems(read('1-after-kill'))}});

  adb('shell', 'am', 'force-stop', PACKAGE); sleep(1);
  results.push({case: 'after a force-stop', problems: sessionProblems(read('2-after-force-stop'))});

  adb('reboot');
  adb('wait-for-device');
  for (let i = 0; i < 60 && adb('shell', 'getprop', 'sys.boot_completed').trim() !== '1'; i++) sleep(3);
  sleep(10);
  results.push({case: 'after the emulator reboots', problems: sessionProblems(read('3-after-reboot'))});

  fs.writeFileSync(path.join(evidence, 'session-restore.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (results.some(r => r.problems.length)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`Session restore: ${error.message}`); process.exitCode = 1; }
}
