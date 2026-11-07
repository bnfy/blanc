// A5a on the emulator: Blanc's Settings (docs/superpowers/specs/2026-11-07-android-settings-design.md).
//   - The root shows Blanc's sections and rows in order, with Chromium's four pages under More, and none
//     of Chrome's Google or sign-in rows or wording.
//   - Search engine, Theme and Island position change and show the new value.
//   - The blocker switch and the allowed-sites list work with no tab open.
//   - Sync opens the Sync sheet; Clear site data asks first.
// Fails closed: a row or screen it can't find fails.
//
//   node chromium/tests/android/settings.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const PACKAGE = 'me.bnfy.blanc.dev';
const SETTINGS = `${PACKAGE}/org.chromium.chrome.browser.settings.SettingsActivity`;
// In order, top to bottom, down the root.
const ROWS = ['Blanc', 'Browsing', 'Search engine', 'Appearance', 'Theme', 'Island position', 'Privacy', 'Blanc Blocker',
  'Allowed sites', 'Clear cookies, cache & site data', 'Sync', 'More', 'Site settings', 'Accessibility', 'Notifications',
  'Downloads', 'About', 'Version', 'Website', 'Privacy policy', 'Support', 'Open-source licenses'];
const BANNED = [/\bChrome\b/, /\bGoogle\b/, /Sign in/, /Safety/, /Homepage/];
// DuckDuckGo, Google, Bing, Brave Search and Kagi are engine names, not Google wording.
const ENGINE_NAMES = /^(Google|DuckDuckGo|Bing|Brave Search|Kagi)$/;

const bounds = (xml, text) => {
  const escaped = text.replace(/&/g, '&amp;').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`<node[^>]*text="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`).exec(xml);
  return m ? {left: +m[1], top: +m[2], right: +m[3], bottom: +m[4]} : null;
};
// Bounds of the first text field on screen, or null.
const fieldBounds = xml => {
  const m = /<node[^>]*class="android.widget.EditText"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(xml);
  return m ? {left: +m[1], top: +m[2], right: +m[3], bottom: +m[4]} : null;
};
const texts = xml => [...xml.matchAll(/ text="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));

function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: settings.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const sleep = s => execFileSync('sleep', [String(s)]);
  const dump = () => { adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml'); return adb('shell', 'cat', '/sdcard/blanc-ui.xml'); };
  const shot = name => fs.writeFileSync(path.join(evidence, `${name}.png`), execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}));
  const results = [];
  const check = (name, problems) => results.push({case: name, problems});
  const size = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/);
  const [width, height] = [+size[1], +size[2]];
  const scroll = (down = true) => { adb('shell', 'input', 'swipe', String(width / 2), String(height * (down ? 0.75 : 0.3)), String(width / 2), String(height * (down ? 0.3 : 0.75)), '300'); sleep(0.8); };
  const tapAt = b => { adb('shell', 'input', 'tap', String(Math.round((b.left + b.right) / 2)), String(Math.round((b.top + b.bottom) / 2))); sleep(1.5); };
  // Scrolls (from the top) until `text` is on screen, then taps it. Returns the screen's XML first.
  const open = () => { adb('shell', 'am', 'force-stop', PACKAGE); adb('shell', 'am', 'start', '-n', SETTINGS); sleep(4); };
  const find = text => {
    for (let i = 0; i < 10; i++) {
      const xml = dump();
      if (bounds(xml, text)) return xml;
      scroll(true);
    }
    return null;
  };
  const tapText = text => { const xml = find(text); if (!xml) return false; tapAt(bounds(xml, text)); return true; };
  const rowSummary = row => { const xml = find(row); if (!xml) return null; const all = texts(xml); return all[all.indexOf(row) + 1] ?? null; };
  const toTop = () => { for (let i = 0; i < 6; i++) scroll(false); };

  adb('install', '-r', apk);
  adb('shell', 'pm', 'clear', PACKAGE);
  adb('root');
  adb('shell', 'cmd', 'uimode', 'night', 'no');
  open();
  shot('root-top');

  // The root: every row in order, nothing from Chrome's Google side.
  const seen = [];
  const everything = [];
  for (let i = 0; i < 14; i++) {
    const t = texts(dump());
    everything.push(...t);
    for (const row of ROWS) if (t.includes(row) && !seen.includes(row)) seen.push(row);
    scroll(true);
  }
  shot('root-bottom');
  check('the root lists Blanc\'s rows in order', JSON.stringify(seen) === JSON.stringify(ROWS) ? [] : [`saw ${JSON.stringify(seen)}`]);
  check('no Chrome or Google wording on the root', everything.filter(t => BANNED.some(b => b.test(t)) && !ENGINE_NAMES.test(t))
    .map(t => `"${t}"`));

  // Search engine.
  open();
  let problems = [];
  if (!tapText('Search engine')) problems.push('no Search engine row');
  else {
    const dialog = texts(dump());
    for (const engine of ['DuckDuckGo', 'Google', 'Bing', 'Brave Search', 'Kagi']) if (!dialog.includes(engine)) problems.push(`no ${engine}`);
    shot('search-engine');
    if (!tapText('Kagi')) problems.push('no Kagi option');
    toTop();
    if (rowSummary('Search engine') !== 'Kagi') problems.push(`summary ${rowSummary('Search engine')}`);
  }
  check('Search engine changes to Kagi', problems);

  // Theme.
  open();
  problems = [];
  if (!tapText('Theme')) problems.push('no Theme row');
  else {
    if (!tapText('Dark')) problems.push('no Dark option');
    sleep(1);
    toTop();
    if (rowSummary('Theme') !== 'Dark') problems.push(`summary ${rowSummary('Theme')}`);
    shot('theme-dark');
  }
  adb('shell', 'cmd', 'uimode', 'night', 'no');
  check('Theme changes to Dark', problems);

  // Island position.
  open();
  problems = [];
  if (!tapText('Island position')) problems.push('no Island position row');
  else {
    if (!tapText('Top')) problems.push('no Top option');
    toTop();
    if (rowSummary('Island position') !== 'Top') problems.push(`summary ${rowSummary('Island position')}`);
  }
  check('Island position changes to Top', problems);

  // The blocker switch, and allowed sites, with no tab open.
  open();
  problems = [];
  // The state of the switch that follows the "Blanc Blocker" title, from the screen's own nodes.
  const switchOn = () => {
    const nodes = (find('Blanc Blocker') ?? '').match(/<node [^>]*>/g) ?? [];
    const title = nodes.findIndex(n => n.includes('text="Blanc Blocker"'));
    const widget = nodes.slice(title + 1, title + 8).find(n => /class="android.widget.Switch"/.test(n));
    const m = widget && /checked="(true|false)"/.exec(widget);
    return m ? m[1] === 'true' : null;
  };
  const before = switchOn();
  if (before === null) problems.push('no blocker switch');
  else {
    tapText('Blanc Blocker');
    sleep(1);
    if (switchOn() !== !before) problems.push('the switch did not flip');
    tapText('Blanc Blocker');
    sleep(1);
    if (switchOn() !== before) problems.push('the switch did not flip back');
  }
  check('the blocker switch flips and flips back', problems);

  problems = [];
  if (!tapText('Allowed sites')) problems.push('no Allowed sites row');
  else {
    const field = fieldBounds(dump());
    if (!field) problems.push('no address field');
    else tapAt(field);
    adb('shell', 'input', 'text', 'https://www.Example.org/');
    adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER');
    sleep(1.5);
    if (!texts(dump()).includes('example.org')) problems.push('example.org was not added');
    shot('allowed-sites');
    const again = fieldBounds(dump());
    if (again) tapAt(again);
    adb('shell', 'input', 'text', 'not%sa%ssite');
    adb('shell', 'input', 'keyevent', 'KEYCODE_ENTER');
    sleep(1);
    if (!texts(dump()).includes('Enter a valid website address.')) problems.push('no invalid-address message');
    const xml = dump();
    const remove = /content-desc="Remove site: example\.org"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(xml)
      || /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*content-desc="Remove site: example\.org"/.exec(xml);
    if (!remove) problems.push('no Remove button for example.org');
    else { tapAt({left: +remove[1], top: +remove[2], right: +remove[3], bottom: +remove[4]}); if (texts(dump()).includes('example.org')) problems.push('example.org stayed'); }
  }
  check('allowed sites adds, refuses and removes', problems);

  // Sync opens the Sync sheet; Clear site data asks first.
  open();
  problems = [];
  if (!tapText('Not connected')) problems.push('no Sync row');
  else {
    sleep(1.5);
    if (!texts(dump()).includes('Pair with your Blanc')) problems.push('the Sync sheet did not open');
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  }
  check('the Sync row opens the Sync sheet', problems);
  open();
  problems = [];
  if (!tapText('Clear cookies, cache & site data')) problems.push('no Clear site data row');
  else {
    sleep(1);
    if (!texts(dump()).some(t => t.startsWith('Clear all cookies, cache, and site data'))) problems.push('no confirmation');
    shot('clear-confirm');
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  }
  check('Clear site data asks before it clears', problems);

  const crashes = adb('logcat', '-d', '-b', 'crash');
  check('no crash during the run', /FATAL EXCEPTION/.test(crashes) ? ['a crash was logged'] : []);

  fs.writeFileSync(path.join(evidence, 'settings.json'), JSON.stringify(results, null, 2));
  let failed = 0;
  for (const r of results) { console.log(`${r.problems.length ? 'FAIL' : 'pass'}  ${r.case}${r.problems.length ? `: ${r.problems.join('; ')}` : ''}`); if (r.problems.length) failed++; }
  if (failed) process.exitCode = 1;
}

main(process.argv.slice(2));
