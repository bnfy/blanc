// A2 Task 4 on the emulator: the palette, as the iPhone's.
//   - The Island's site opens it, with the open tabs listed and the field focused
//     above the keyboard, at three screen sizes, and it survives a rotation.
//   - Tapping a tab in the list switches to it.
//   - /new, /close, /reopen and /group Research work.
// Fails closed: a missing control fails.
//
//   node chromium/tests/android/palette.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gridSwipe, nodeBounds} from './island-menu.mjs';
import {tabCount} from './tabs.mjs';

const PACKAGE = 'me.bnfy.blanc.dev';
const PAGES = ['https://www.iana.org/domains', 'https://www.iana.org/about'];
const SCREENS = [['1080x1920', '480'], ['1080x2400', '420'], ['720x1280', '320']];

// The palette's field: the focused EditText in a dump.
export function paletteField(xml) {
  const m = /<node[^>]*class="android\.widget\.EditText"[^>]*focused="true"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(xml);
  return m ? {left: +m[1], top: +m[2], right: +m[3], bottom: +m[4]} : null;
}

// The first node whose text (or content-desc) matches `pattern`, as bounds; or null.
export function matching(xml, pattern, attribute = 'text') {
  for (const m of xml.matchAll(new RegExp(`<node[^>]*?${attribute}="([^"]*)"[^>]*?bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'g'))) {
    if (pattern.test(m[1])) return {left: +m[2], top: +m[3], right: +m[4], bottom: +m[5]};
  }
  return null;
}

// The keyboard's top edge from `dumpsys window` (its inset frame), or null when it's hidden.
export function keyboardTop(dumpsys) {
  const m = /InsetsSource id=\S+ type=ime frame=\[\d+,(\d+)\]\[\d+,\d+\][^\n]*?visible=true/.exec(dumpsys);
  return m ? Number(m[1]) : null;
}

function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: palette.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const sleep = s => execFileSync('sleep', [String(s)]);
  const dump = () => { adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml'); return adb('shell', 'cat', '/sdcard/blanc-ui.xml'); };
  const center = b => [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)].map(String);
  const tap = query => { const b = nodeBounds(dump(), query); if (b) { adb('shell', 'input', 'tap', ...center(b)); sleep(2); } return !!b; };
  const shot = name => fs.writeFileSync(path.join(evidence, `${name}.png`), execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}));
  const typeAndGo = text => { adb('shell', 'input', 'text', text.replace(/ /g, '%s')); sleep(1); adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER'); sleep(3); };
  const openPalette = () => tap({id: 'blanc_island_domain'});
  const results = [];
  const check = (name, problems) => results.push({case: name, problems});

  adb('install', '-r', apk);
  adb('shell', 'pm', 'clear', PACKAGE);
  adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
  sleep(7);
  for (const page of PAGES) { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', page, '-p', PACKAGE); sleep(5); }

  for (const [size, density] of SCREENS) {
    adb('shell', 'wm', 'size', size); adb('shell', 'wm', 'density', density); sleep(3);
    const opened = openPalette();
    sleep(1.5);
    const xml = dump();
    const field = paletteField(xml);
    const keyboard = keyboardTop(adb('shell', 'dumpsys', 'window'));
    shot(`palette-${size}`);
    const problems = [];
    if (!opened) problems.push('no Island site to tap');
    if (!field) problems.push('no focused field');
    if (!matching(xml, /^Open tabs {2}\d+$/)) problems.push('the open tabs are not listed');
    if (field && keyboard !== null && field.bottom > keyboard) problems.push(`the field is under the keyboard (${field.bottom} > ${keyboard})`);
    // The footer (New Tab, Favorites, History) stays reachable above the keyboard too.
    const footer = matching(xml, /^New tab$/);
    if (!footer) problems.push('no New Tab button');
    else if (keyboard !== null && footer.bottom > keyboard) problems.push(`New Tab is under the keyboard (${footer.bottom} > ${keyboard})`);
    check(`opens above the keyboard at ${size}`, problems);
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); sleep(1);
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); sleep(1);
  }
  adb('shell', 'wm', 'size', 'reset'); adb('shell', 'wm', 'density', 'reset'); sleep(3);

  openPalette();
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '1'); sleep(3);
  const rotated = dump();
  shot('palette-rotated');
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0'); sleep(3);
  // In landscape with the keyboard up there's room for the field and footer; the list scrolls in.
  check('survives a rotation', paletteField(rotated) && matching(rotated, /^New tab$/) ? [] : ['the palette is gone after rotating']);
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); sleep(1);
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); sleep(1);

  openPalette();
  const row = matching(dump(), /, www\.iana\.org$/, 'content-desc');
  if (row) { adb('shell', 'input', 'tap', ...center(row)); sleep(2); }
  const switched = !!row;
  check('a tab in the list switches to it', switched && !paletteField(dump()) ? [] : ['no tab row, or the palette stayed open']);

  // The closed Island has no tab count: opens the grid with the swipe from the Island, reads its
  // count and closes it.
  const count = () => {
    const swipe = gridSwipe(dump());
    if (!swipe) return null;
    adb('shell', 'input', 'swipe', ...swipe, '250'); sleep(2);
    const open = dump();
    const done = nodeBounds(open, {text: 'Done'});
    if (done) { adb('shell', 'input', 'tap', ...center(done)); sleep(1.5); }
    return tabCount(open);
  };
  const start = count();
  openPalette(); typeAndGo('/new');
  const afterNew = count();
  openPalette(); typeAndGo('/close');
  const afterClose = count();
  openPalette(); typeAndGo('/reopen');
  const afterReopen = count();
  check('/new, /close and /reopen', start !== null && afterNew === start + 1 && afterClose === start && afterReopen === start + 1
    ? [] : [`counts ${start}, ${afterNew}, ${afterClose}, ${afterReopen}`]);

  openPalette(); typeAndGo('/group Research');
  // With the keyboard down the list has the whole sheet.
  openPalette(); adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); sleep(1.5);
  const grouped = dump();
  shot('palette-grouped');
  check('/group Research', nodeBounds(grouped, {text: 'Research'}) ? [] : ['no Research group in the list']);
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); sleep(1);

  fs.writeFileSync(path.join(evidence, 'palette.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (results.some(r => r.problems.length)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`Palette: ${error.message}`); process.exitCode = 1; }
}
