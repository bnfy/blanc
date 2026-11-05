// A2 Task 6 on the emulator: find in page.
//   - Find in Page from the Sunrise menu opens the bar above the keyboard.
//   - Typing "domain" on a page about domains counts its matches ("1/N").
//   - Next moves to the second match; Done closes the bar.
//   - /find in the palette opens it too.
//   - Another tab coming forward closes it.
// Fails closed: a missing control or count fails.
//
//   node chromium/tests/android/find.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nodeBounds} from './island-menu.mjs';
import {keyboardTop, matching, paletteField} from './palette.mjs';

const PACKAGE = 'me.bnfy.blanc.dev';
const PAGE = 'https://www.iana.org/domains';

// The find bar's count ("2/7") as [active, total], or null.
export function findCount(xml) {
  const m = /text="(\d+)\/(\d+)"/.exec(xml);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: find.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const sleep = s => execFileSync('sleep', [String(s)]);
  const dump = () => { adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml'); return adb('shell', 'cat', '/sdcard/blanc-ui.xml'); };
  const center = b => [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)].map(String);
  const tap = query => { const b = nodeBounds(dump(), query); if (b) { adb('shell', 'input', 'tap', ...center(b)); sleep(1.5); } return !!b; };
  const shot = name => fs.writeFileSync(path.join(evidence, `${name}.png`), execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}));
  const results = [];
  const check = (name, problems) => results.push({case: name, problems});

  adb('install', '-r', apk);
  adb('shell', 'pm', 'clear', PACKAGE);
  adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
  sleep(7);
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', PAGE, '-p', PACKAGE);
  sleep(7);

  tap({id: 'blanc_island_menu'});
  const opened = tap({text: 'Find in Page'});
  adb('shell', 'input', 'text', 'domain'); sleep(2.5);
  const xml = dump();
  shot('find-typed');
  const count = findCount(xml);
  const field = paletteField(xml);
  const keyboard = keyboardTop(adb('shell', 'dumpsys', 'window'));
  check('Find in Page counts the matches above the keyboard', !opened ? ['no Find in Page entry']
    : !count || count[0] !== 1 || count[1] < 2 ? [`count ${count}`]
      : field && keyboard !== null && field.bottom > keyboard ? ['the bar is under the keyboard'] : []);

  const next = matching(dump(), /^Next match$/, 'content-desc');
  if (next) { adb('shell', 'input', 'tap', ...center(next)); sleep(2); }
  const after = findCount(dump());
  check('Next moves to the second match', after && after[0] === 2 ? [] : [`count ${after}`]);

  const done = tap({text: 'Done'});
  sleep(1);
  check('Done closes the bar', done && !findCount(dump()) && !matching(dump(), /^Next match$/, 'content-desc') ? [] : ['still open']);

  tap({id: 'blanc_island_domain'});
  adb('shell', 'input', 'text', '/find'); adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER'); sleep(2);
  const viaPalette = dump();
  shot('find-palette');
  check('/find opens it', matching(viaPalette, /^Next match$/, 'content-desc') ? [] : ['no find bar']);
  // The bar belongs to its page: another tab coming forward closes it.
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'https://www.iana.org/about', '-p', PACKAGE);
  sleep(6);
  check('another tab coming forward closes it', !matching(dump(), /^Next match$/, 'content-desc') ? [] : ['still open']);

  fs.writeFileSync(path.join(evidence, 'find.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (results.some(r => r.problems.length)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`Find: ${error.message}`); process.exitCode = 1; }
}
