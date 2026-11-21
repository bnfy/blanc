// A1 Task 3 on the emulator: the Island sits where the iPhone's does, inside
// the system bars, and tucks by its rules. Checks, in gesture and three-button
// navigation, portrait and landscape, at the bottom and at the top:
//   - the pill is inside the screen, at most 600 wide, 16 from each side and
//     10 beyond the navigation bar (bottom) or status bar (top);
//   - scrolling down tucks it off screen and scrolling back up returns it.
// Fails closed: a check that can't find the Island fails.
//
//   node chromium/tests/android/island-insets.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const PACKAGE = 'me.bnfy.blanc.dev';
// Long at every size: within 8 of the page's end the Island always shows (IslandTuck), so a
// short page can't tuck it on a tall screen.
const PAGE = 'https://www.iana.org/domains/root/db';
const PREFS = `shared_prefs/${PACKAGE}_preferences.xml`;

// Bounds "[l,t][r,b]" of a node in a UI Automator dump, or null.
export function boundsOf(xml, id) {
  const m = new RegExp(`resource-id="[^"]*:id/${id}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`).exec(xml);
  return m ? {left: +m[1], top: +m[2], right: +m[3], bottom: +m[4]} : null;
}

// Whether a UI Automator dump's root is landscape or portrait like `screen`.
export function shapedLike(xml, screen) {
  const m = /<node[^>]*bounds="\[0,0\]\[(\d+),(\d+)\]"/.exec(xml);
  return !!m && (+m[1] > +m[2]) === (screen.width > screen.height);
}

// The visible system bars' frames from `dumpsys window`.
export function barsOf(dumpsys) {
  const bar = type => {
    const m = new RegExp(`type=${type} frame=\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\] visible=true`).exec(dumpsys);
    return m ? {left: +m[1], top: +m[2], right: +m[3], bottom: +m[4]} : null;
  };
  return {navigation: bar('navigationBars'), status: bar('statusBars')};
}

// A `wm size` or `wm density` value: the override when the screen was resized, else the physical one.
export function wmValue(output, pattern) {
  const line = /Override[^:]*:\s*(.*)/.exec(output)?.[1] ?? /Physical[^:]*:\s*(.*)/.exec(output)?.[1] ?? output;
  return pattern.exec(line).slice(1);
}

// Problems with the pill's placement; empty when it's where the iPhone puts it.
export function placementProblems({pill, screen, bars, density, position}) {
  const dp = v => v * density, problems = [], slack = 2;
  if (!pill) return ['the Island is not on screen'];
  if (pill.left < 0 || pill.top < 0 || pill.right > screen.width || pill.bottom > screen.height) problems.push('outside the screen');
  const width = pill.right - pill.left;
  if (width > dp(600) + slack) problems.push(`wider than 600dp (${Math.round(width / density)}dp)`);
  // Three-button navigation in landscape puts the bar down a side: the window
  // the Island centers in ends where that bar begins.
  const nav = bars.navigation;
  const sideBar = nav && nav.top <= 0 && nav.bottom >= screen.height ? nav : null;
  const windowLeft = sideBar && sideBar.left <= 0 ? sideBar.right : 0;
  const windowRight = sideBar && sideBar.left > 0 ? sideBar.left : screen.width;
  if (pill.left < windowLeft || pill.right > windowRight) problems.push('overlaps the navigation bar at the side');
  const sides = Math.min(pill.left - windowLeft, windowRight - pill.right);
  if (width < dp(600) - slack && sides < dp(16) - slack) problems.push(`less than 16dp from the sides (${Math.round(sides / density)}dp)`);
  if (position === 'bottom') {
    const limit = (nav && !sideBar ? nav.top : screen.height) - dp(10);
    if (pill.bottom > limit + slack) problems.push(`overlaps the navigation bar (bottom ${pill.bottom} > ${limit})`);
  } else {
    const limit = (bars.status ? bars.status.bottom : 0) + dp(10);
    if (pill.top < limit - slack) problems.push(`overlaps the status bar (top ${pill.top} < ${limit})`);
  }
  return problems;
}

function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: island-insets.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const sleep = s => execFileSync('sleep', [String(s)]);
  const dump = () => { adb('shell', 'uiautomator', 'dump', '/sdcard/blanc-ui.xml'); return adb('shell', 'cat', '/sdcard/blanc-ui.xml'); };
  const pill = () => boundsOf(dump(), 'blanc_island_pill');
  const density = Number(wmValue(adb('shell', 'wm', 'density'), /(\d+)/)[0]) / 160;
  const setPosition = value => {
    adb('shell', 'am', 'force-stop', PACKAGE);
    const xml = adb('shell', 'run-as', PACKAGE, 'cat', PREFS).replace(/\s*<string name="blanc\.island_position">[^<]*<\/string>/, '');
    const next = xml.replace('</map>', `    <string name="blanc.island_position">${value}</string>\n</map>`);
    adb('shell', `run-as ${PACKAGE} sh -c 'cat > ${PREFS}' <<'EOF'\n${next}\nEOF`);
  };
  const open = () => { adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', PAGE, '-p', PACKAGE); sleep(8); };
  const results = [];
  adb('install', '-r', apk);
  adb('shell', 'pm', 'clear', PACKAGE);
  open();
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  sleep(1);
  for (const nav of ['gestural', 'threebutton']) {
    adb('shell', 'cmd', 'overlay', 'enable-exclusive', '--category', `com.android.internal.systemui.navbar.${nav}`);
    sleep(3);
    for (const rotation of [0, 1]) {
      adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
      adb('shell', 'settings', 'put', 'system', 'user_rotation', String(rotation));
      for (const position of ['bottom', 'top']) {
        setPosition(position);
        open();
        const [w, h] = wmValue(adb('shell', 'wm', 'size'), /(\d+)x(\d+)/).map(Number);
        const screen = rotation ? {width: Math.max(w, h), height: Math.min(w, h)} : {width: Math.min(w, h), height: Math.max(w, h)};
        // The app may still be rotating: wait until its window has the screen's shape and the
        // Island has been laid out in it. One that never gets there still fails below.
        const inside = pill => pill && pill.right <= screen.width && pill.bottom <= screen.height;
        let xml = dump();
        for (let i = 0; i < 10 && !(shapedLike(xml, screen) && inside(boundsOf(xml, 'blanc_island_pill'))); i++) {
          // A navigation mode change can swallow the request to rotate, so it's made again.
          adb('shell', 'settings', 'put', 'system', 'user_rotation', String(rotation));
          sleep(1);
          xml = dump();
        }
        const bars = barsOf(adb('shell', 'dumpsys', 'window'));
        const rest = boundsOf(xml, 'blanc_island_pill');
        const problems = placementProblems({pill: rest, screen, bars, density, position});
        const cy = Math.round(screen.height * 0.6), dy = Math.round(screen.height * 0.25);
        adb('shell', 'input', 'swipe', '540', String(cy), '540', String(cy - dy), '400');
        sleep(1.5);
        if (pill()) problems.push('scrolling down did not tuck it');
        adb('shell', 'input', 'swipe', '540', String(cy - dy), '540', String(cy - Math.round(dy / 2)), '400');
        sleep(1.5);
        if (!pill()) problems.push('scrolling back up did not return it');
        const name = `${nav}-${rotation ? 'landscape' : 'portrait'}-${position}`;
        fs.writeFileSync(path.join(evidence, `${name}.png`), execFileSync('adb', ['exec-out', 'screencap', '-p']));
        results.push({case: name, pill: rest, problems});
      }
    }
  }
  adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '1');
  adb('shell', 'cmd', 'overlay', 'enable-exclusive', '--category', 'com.android.internal.systemui.navbar.gestural');
  setPosition('bottom');
  const failed = results.filter(r => r.problems.length);
  fs.writeFileSync(path.join(evidence, 'island-insets.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`Island insets: ${error.message}`); process.exitCode = 1; }
}
