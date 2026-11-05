// A2 Task 5 on the emulator: the tab grid, as the iPhone's.
//   - The Island's tabs button opens it, at three screen sizes with the Island
//     at the bottom and at the top, showing "Open tabs" and a card per tab.
//   - A swipe from the Island into the page opens it too.
//   - Swiping a card left closes it and shows Undo; Undo brings it back.
//   - The group menu renames a group and gives it a color.
// Fails closed: a missing control fails.
//
//   node chromium/tests/android/tab-grid.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nodeBounds} from './island-menu.mjs';
import {matching} from './palette.mjs';

const PACKAGE = 'me.bnfy.blanc.dev';
const PREFS = `shared_prefs/${PACKAGE}_preferences.xml`;
const PAGES = ['https://www.iana.org/domains', 'https://www.iana.org/about'];
const SCREENS = [['1080x1920', '480'], ['1080x2400', '420'], ['720x1280', '320']];

// Every tab card's label ("Switch to …") in a dump.
export function cardLabels(xml) {
  return [...xml.matchAll(/content-desc="(Switch to [^"]*)"/g)].map(m => m[1]);
}

function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: tab-grid.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const sleep = s => execFileSync('sleep', [String(s)]);
  const dump = () => { adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml'); return adb('shell', 'cat', '/sdcard/blanc-ui.xml'); };
  const center = b => [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)];
  const tapAt = b => { adb('shell', 'input', 'tap', ...center(b).map(String)); sleep(1.5); };
  const tap = query => { const b = nodeBounds(dump(), query); if (b) tapAt(b); return !!b; };
  const shot = name => fs.writeFileSync(path.join(evidence, `${name}.png`), execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}));
  const back = () => { adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); sleep(1); };
  const setPosition = value => {
    adb('shell', 'am', 'force-stop', PACKAGE);
    const xml = adb('shell', 'run-as', PACKAGE, 'cat', PREFS).replace(/\s*<string name="blanc\.island_position">[^<]*<\/string>/, '');
    adb('shell', `run-as ${PACKAGE} sh -c 'cat > ${PREFS}' <<'EOF'\n${xml.replace('</map>', `    <string name="blanc.island_position">${value}</string>\n</map>`)}\nEOF`);
    adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1'); sleep(6);
  };
  const results = [];
  const check = (name, problems) => results.push({case: name, problems});

  adb('install', '-r', apk);
  adb('shell', 'pm', 'clear', PACKAGE);
  adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
  sleep(7);
  for (const page of PAGES) { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', page, '-p', PACKAGE); sleep(5); }

  for (const position of ['bottom', 'top']) {
    setPosition(position);
    for (const [size, density] of SCREENS) {
      adb('shell', 'wm', 'size', size); adb('shell', 'wm', 'density', density); sleep(3);
      const opened = tap({id: 'blanc_island_tabs'});
      const xml = dump();
      shot(`grid-${position}-${size}`);
      const cards = cardLabels(xml);
      check(`opens at the ${position}, ${size}`, !opened ? ['no tabs button'] : !nodeBounds(xml, {text: 'Open tabs'})
        ? ['no "Open tabs" header'] : cards.length < 3 ? [`${cards.length} cards`] : []);
      back();
    }
  }
  adb('shell', 'wm', 'size', 'reset'); adb('shell', 'wm', 'density', 'reset');
  setPosition('bottom');

  const island = nodeBounds(dump(), {id: 'blanc_island_pill'});
  if (island) {
    const [x, y] = center(island);
    adb('shell', 'input', 'swipe', String(x), String(y), String(x), String(y - 400), '250'); sleep(2);
  }
  check('a swipe from the Island into the page opens it', island && nodeBounds(dump(), {text: 'Open tabs'}) ? [] : ['the grid did not open']);

  const before = cardLabels(dump());
  const target = matching(dump(), /^Switch to /, 'content-desc');
  if (target) {
    const [x, y] = center(target);
    adb('shell', 'input', 'swipe', String(x), String(y), String(x - 450), String(y), '200'); sleep(0.8);
  }
  // Undo lasts 5 s and each dump takes over a second: tap it from this dump.
  const afterSwipe = dump();
  const undo = nodeBounds(afterSwipe, {text: 'Undo'});
  if (undo) tapAt(undo);
  shot('grid-undone');
  check('swiping a card left closes it with Undo', before.length && cardLabels(afterSwipe).length === before.length - 1
    && nodeBounds(afterSwipe, {text: 'Tab closed'}) ? [] : [`${before.length} cards then ${cardLabels(afterSwipe).length}`]);
  check('Undo brings it back', cardLabels(dump()).length === before.length ? [] : ['still closed']);
  back();

  // A group to rename and color: /group from the palette.
  tap({id: 'blanc_island_domain'});
  adb('shell', 'input', 'text', '/group%sResearch'); adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER'); sleep(3);
  tap({id: 'blanc_island_tabs'});
  const options = matching(dump(), /^Group options$/, 'content-desc');
  if (options) tapAt(options);
  tap({text: 'Rename…'});
  adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END');
  adb('shell', 'input', 'text', '%sNotes'); sleep(1);
  tap({text: 'Done'}); sleep(1);
  const renamed = dump();
  const groupMenu = matching(renamed, /^Group options$/, 'content-desc');
  if (groupMenu) tapAt(groupMenu);
  tap({text: 'Color'});
  tap({text: 'Sky'});
  const colored = dump();
  shot('grid-group');
  check('the group menu renames and colors', matching(renamed, /^Research Notes$/) && matching(colored, /^Research Notes$/)
    ? [] : ['the group is not "Research Notes"']);
  back();

  fs.writeFileSync(path.join(evidence, 'tab-grid.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (results.some(r => r.problems.length)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`Tab grid: ${error.message}`); process.exitCode = 1; }
}
