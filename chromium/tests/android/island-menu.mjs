// A1 Task 7 on the emulator: the Sunrise menu does what the iPhone's does.
//   - On the Start Page it holds only New Private Tab.
//   - On a web page: Save to Favorites, Share, Find in Page, New Private Tab, in that order.
//   - Save to Favorites saves the page: the menu then offers Remove from Favorites.
//   - Share opens Android's share sheet.
//   - New Private Tab opens a private tab: the private chip shows and the
//     menu has no favorite.
// Fails closed: an entry or screen it can't find fails.
//
//   node chromium/tests/android/island-menu.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const PACKAGE = 'me.bnfy.blanc.dev';
const PAGE = 'https://www.iana.org/help/example-domains';
const ENTRIES = ['Save to Favorites', 'Remove from Favorites', 'Share', 'Find in Page', 'New Private Tab'];

const center = b => [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)];

// Bounds of the node with resource id `id`, or of the node whose text is `text`.
export function nodeBounds(xml, {id, text}) {
  const attr = id ? `resource-id="[^"]*:id/${id}"` : `text="${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`;
  const m = new RegExp(`<node[^>]*${attr}[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`).exec(xml);
  return m ? {left: +m[1], top: +m[2], right: +m[3], bottom: +m[4]} : null;
}

// The menu's entries on screen, top to bottom.
export function menuEntries(xml) {
  return ENTRIES.map(text => ({text, bounds: nodeBounds(xml, {text})}))
    .filter(e => e.bounds).sort((a, b) => a.bounds.top - b.bounds.top).map(e => e.text);
}

function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: island-menu.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const sleep = s => execFileSync('sleep', [String(s)]);
  const dump = () => { adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml'); return adb('shell', 'cat', '/sdcard/blanc-ui.xml'); };
  const tap = bounds => { adb('shell', 'input', 'tap', ...center(bounds).map(String)); sleep(1.5); };
  const shot = name => fs.writeFileSync(path.join(evidence, `${name}.png`), execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}));
  const results = [];
  const check = (name, problems) => results.push({case: name, problems});
  // Opens the menu and returns its entries; leaves it open.
  const openMenu = name => {
    const menu = nodeBounds(dump(), {id: 'blanc_island_menu'});
    if (!menu) return null;
    tap(menu);
    shot(name);
    return menuEntries(dump());
  };
  const close = () => { adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); sleep(1); };
  const same = (have, want) => JSON.stringify(have) === JSON.stringify(want) ? [] : [`showed ${JSON.stringify(have)}, wanted ${JSON.stringify(want)}`];

  adb('install', '-r', apk);
  adb('shell', 'pm', 'clear', PACKAGE);
  adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
  sleep(7);
  // Blanc asks for nothing at startup (patch 0104 removes Chrome's notification prompt).
  check('no startup prompt', nodeBounds(dump(), {text: 'No thanks'}) ? ['a startup prompt covers the Start Page'] : []);
  check('start page', same(openMenu('1-start-page'), ['New Private Tab']));
  close();

  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', PAGE, '-p', PACKAGE);
  sleep(8);
  check('web page', same(openMenu('2-web-page'), ['Save to Favorites', 'Share', 'Find in Page', 'New Private Tab']));
  const save = nodeBounds(dump(), {text: 'Save to Favorites'});
  if (save) tap(save); else close();
  check('saved', same(openMenu('3-saved'), ['Remove from Favorites', 'Share', 'Find in Page', 'New Private Tab']));

  const share = nodeBounds(dump(), {text: 'Share'});
  if (share) tap(share);
  sleep(1.5);
  shot('4-share');
  const front = adb('shell', 'dumpsys', 'window', 'displays');
  const focus = /mCurrentFocus=Window\{[^}]*\s(\S+)\}/.exec(front)?.[1] || '';
  check('share sheet', /intentresolver|ResolverActivity|ChooserActivity/i.test(focus) ? [] : [`front window is ${focus || 'unknown'}`]);
  close();

  const privateEntry = openMenu('5-before-private') && nodeBounds(dump(), {text: 'New Private Tab'});
  if (privateEntry) tap(privateEntry); else close();
  sleep(3);
  shot('6-private');
  check('private chip', nodeBounds(dump(), {id: 'blanc_island_private'}) ? [] : ['no private chip after New Private Tab']);
  // The private tab's page, typed in the address sheet, has no favorite.
  const domain = nodeBounds(dump(), {id: 'blanc_island_domain'});
  if (domain) tap(domain);
  adb('shell', 'input', 'text', PAGE);
  adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER');
  sleep(8);
  check('private page', same(openMenu('7-private-page'), ['Share', 'Find in Page', 'New Private Tab']));
  close();

  fs.writeFileSync(path.join(evidence, 'island-menu.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (!results.length || results.some(r => r.problems.length)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`Island menu: ${error.message}`); process.exitCode = 1; }
}
