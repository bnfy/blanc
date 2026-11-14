// Billboard's shortcuts on the emulator: history's ranked sites and the pins you keep. A fresh
// Blanc types four fixture sites into the palette, more often the higher each should rank. The
// Start Page must then show them in that order, as many as the Shortcuts stepper allows; a tap on a
// site's pin must move it to the front and keep it there across a relaunch; a tap on it again must
// unpin it, which also survives a relaunch; a tap on the icon near its pin must open the site. Taps go
// through adb at their place on the screen, so a pin too small to hit, or one whose target covers the
// icon, fails. Screenshots go to the evidence folder. Fails closed.
//
//   node chromium/tests/android/start-shortcuts.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Device, adb, sleep, startFixtures} from './acceptance/support/device.mjs';

// Each site and how many times it's typed: a ranks first, d last.
export const VISITS = [['a.example', 4], ['b.example', 3], ['c.example', 2], ['d.example', 1]];
export const SHORTCUTS = 3;
const START_PAGE = 'chrome://blanc/newtab.html';

// What the Start Page shows against what it should: the sites on show in order, which are pinned,
// and the pins Blanc keeps (by host).
export function shortcutProblems(report, want) {
  if (!report) return ['no Start Page to read'];
  if (report.error) return [`the Start Page failed: ${report.error}`];
  const problems = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const key of ['sites', 'pinned', 'pins']) {
    if (!same(report[key], want[key])) problems.push(`${key} are ${JSON.stringify(report[key])}, not ${JSON.stringify(want[key])}`);
  }
  return problems;
}

// The tiles on show now.
const READ = `(async () => {
  try {
    const tiles = [...document.querySelectorAll('#bbFavorites .bb-site')].filter(e => getComputedStyle(e).display !== 'none');
    const listed = await window.bowserPages.pins.list();
    return {sites: tiles.map(e => e.dataset.siteKey), pinned: tiles.filter(e => e.classList.contains('pinned')).map(e => e.dataset.siteKey),
      pins: listed.pins.map(p => new URL(p.url).host)};
  } catch (error) { return {error: String(error)}; }
})()`;

// Where a site's pin is on the screen, in device pixels: the page runs to the screen's bottom.
const PIN_AT = key => `(() => {
  const pin = document.querySelector('#bbFavorites .bb-site[data-site-key="${key}"] .bb-site-pin');
  if (!pin) return null;
  pin.scrollIntoView({block: 'center'});
  const r = pin.getBoundingClientRect(), top = screen.height - innerHeight;
  return {x: Math.round((r.left + r.width / 2) * devicePixelRatio), y: Math.round((top + r.top + r.height / 2) * devicePixelRatio)};
})()`;

// A point on a site's icon near its top-left corner, just clear of the pin drawn over the corner:
// a tap there must open the site, not pin it.
const ICON_CORNER_AT = key => `(() => {
  const tile = document.querySelector('#bbFavorites .bb-site[data-site-key="${key}"] .tile');
  if (!tile) return null;
  tile.scrollIntoView({block: 'center'});
  const r = tile.getBoundingClientRect(), top = screen.height - innerHeight;
  return {x: Math.round((r.left + 14) * devicePixelRatio), y: Math.round((top + r.top + 16) * devicePixelRatio)};
})()`;

async function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: start-shortcuts.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const screenshot = name => fs.writeFileSync(path.join(evidence, `${name}.png`),
    execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}));
  const d = new Device();
  const results = [];
  adb('install', '-r', apk);
  const stop = startFixtures();
  // A new Start Page from the Island.
  const startPage = async () => {
    d.tap({id: 'blanc_island_new_tab'});
    await d.waitForUrl(START_PAGE);
  };
  const tapPin = async key => {
    const at = await d.page(PIN_AT(key));
    if (!at) throw Error(`no pin on ${key}'s shortcut`);
    sleep(1);
    adb('shell', 'input', 'tap', String(at.x), String(at.y));
    sleep(2);
  };
  // Leave Blanc as a person does, so it writes what it holds, then end it and start it again.
  const relaunch = async () => {
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    sleep(5);
    await d.relaunch();
  };
  // The page as it settles: read until it shows `want`, or for 15 s, and judge the last read.
  const check = async (name, want) => {
    let report = null;
    await d.waitFor(async () => !shortcutProblems(report = await d.page(READ), want).length, name, 15).catch(() => {});
    screenshot(name);
    results.push({case: name, report, problems: shortcutProblems(report, want)});
  };
  try {
    await d.reset();
    for (const [host, times] of VISITS) {
      for (let i = 0; i < times; i++) {
        d.runInPalette(`https://${host}/`);
        await d.waitForUrl(`https://${host}/`);
      }
    }
    const ranked = VISITS.map(([host]) => host);
    const pinned = {sites: ['c.example', 'a.example', 'b.example'], pinned: ['c.example'], pins: ['c.example']};
    const unpinned = {sites: ranked.slice(0, SHORTCUTS), pinned: [], pins: []};
    await startPage();
    await check('ranked sites, most visited first', {sites: ranked, pinned: [], pins: []});
    await d.page(`window.bowserPages.start.setShortcutCount(${SHORTCUTS}).then(() => true)`);
    await check(`the Shortcuts stepper shows ${SHORTCUTS}`, unpinned);
    await tapPin('c.example');
    await check('a tap on a pin puts the site first', pinned);
    await relaunch();
    await startPage();
    await check('the pin survives a relaunch', pinned);
    await tapPin('c.example');
    await check('a second tap unpins it', unpinned);
    await relaunch();
    await startPage();
    await check('the unpin survives a relaunch', unpinned);
    const corner = await d.page(ICON_CORNER_AT('a.example'));
    if (!corner) throw Error("no icon on a.example's shortcut");
    sleep(1);
    adb('shell', 'input', 'tap', String(corner.x), String(corner.y));
    const opened = await d.waitForUrl('https://a.example/').then(() => [], error => [error.message]);
    screenshot('a tap near the icon corner opens the site');
    results.push({case: 'a tap near an icon\'s corner opens the site, not its pin', problems: opened});
  } catch (error) {
    results.push({case: 'the run', problems: [error.message]});
  } finally {
    stop();
  }
  fs.writeFileSync(path.join(evidence, 'start-shortcuts.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (!results.length || results.some(r => r.problems.length)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`Start Page shortcuts: ${error.message}`); process.exitCode = 1; });
}
