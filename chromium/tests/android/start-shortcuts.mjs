// Billboard's shortcuts on the emulator: history's ranked sites and the pins you keep. A fresh
// Blanc types four fixture sites into the palette, more often the higher each should rank. The
// Start Page must then show them in that order, as many as the Shortcuts stepper allows, with no pin
// or × in sight. A long press on a site must open its menu (not Chromium's, and not the site), whose
// Pin to Start Page moves it to the front and keeps it there across a relaunch; its Unpin must
// unpin it, which also survives a relaunch; a plain tap on a shortcut must open the site. Presses and
// taps go through adb at their place on the screen. Screenshots go to the evidence folder. Fails
// closed.
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

// A long press's menu against what it should be: open over the Start Page (neither the site nor
// Chromium's own link menu), with these entries in order.
export function menuProblems(report, actions) {
  if (!report) return ['no Start Page to read'];
  const problems = [];
  if (!report.open) problems.push('the menu is not open');
  if (report.url !== START_PAGE) problems.push(`the page is ${report.url}`);
  if (JSON.stringify(report.actions) !== JSON.stringify(actions))
    problems.push(`its entries are ${JSON.stringify(report.actions)}, not ${JSON.stringify(actions)}`);
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

// The middle of an element on the screen, in device pixels (the page runs to the screen's bottom),
// scrolled into view first; null when it isn't there.
const CENTER_OF = selector => `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!element) return null;
  element.scrollIntoView({block: 'center'});
  const r = element.getBoundingClientRect(), top = screen.height - innerHeight;
  return {x: Math.round((r.left + r.width / 2) * devicePixelRatio), y: Math.round((top + r.top + r.height / 2) * devicePixelRatio)};
})()`;
const tileOf = key => `#bbFavorites .bb-site[data-site-key="${key}"] .tile`;

// Pin and × buttons on show (with any size at all): the menu replaced them.
const VISIBLE_BUTTONS = `[...document.querySelectorAll('#bbFavorites .bb-site-pin, #bbFavorites .bb-site-dismiss')]
  .filter(b => { const r = b.getBoundingClientRect(); return r.width > 2 && r.height > 2; }).length`;

// The long-press menu: open or not, and its entries.
const MENU = `(() => {
  const menu = document.getElementById('androidShortcutMenu');
  return {open: !!menu?.matches(':popover-open'), actions: [...(menu?.querySelectorAll('button') ?? [])].map(b => b.dataset.action),
    url: location.href};
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
  const tapAt = (at, ms) => adb('shell', 'input', ...(ms ? ['swipe', at.x, at.y, at.x, at.y, ms] : ['tap', at.x, at.y]).map(String));
  // Long-presses a site's shortcut, checks its menu, then chooses `action` (pin, hide or open) in it.
  const fromMenu = async (key, action, want) => {
    const tile = await d.page(CENTER_OF(tileOf(key)));
    if (!tile) throw Error(`no shortcut for ${key}`);
    sleep(1);
    // Two seconds: on the emulator a one-second adb press sometimes lands as a tap.
    tapAt(tile, 2000);
    sleep(1.5);
    const menu = await d.page(MENU);
    screenshot(`menu on ${key}`);
    // Chromium's own link menu is native: it shows in the view tree, not the page.
    const chromium = d.has({text: 'Copy link address'}) ? ["Chromium's link menu opened too"] : [];
    results.push({case: `a long press on ${key} opens its menu`, report: menu, problems: [...menuProblems(menu, want), ...chromium]});
    const entry = await d.page(CENTER_OF(`#androidShortcutMenu button[data-action="${action}"]`));
    if (!entry) throw Error(`no ${action} in ${key}'s menu`);
    tapAt(entry);
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
    const buttons = await d.page(VISIBLE_BUTTONS);
    results.push({case: 'no pin or × on show', problems: buttons === 0 ? [] : [`${buttons} on show`]});
    await fromMenu('c.example', 'pin', ['pin', 'hide', 'open', 'cancel']);
    await check('the menu\'s Pin puts the site first', pinned);
    await relaunch();
    await startPage();
    await check('the pin survives a relaunch', pinned);
    // A pinned site can't be hidden, so its menu has no Hide.
    await fromMenu('c.example', 'pin', ['pin', 'open', 'cancel']);
    await check('the menu\'s Unpin unpins it', unpinned);
    await relaunch();
    await startPage();
    await check('the unpin survives a relaunch', unpinned);
    const tile = await d.page(CENTER_OF(tileOf('a.example')));
    if (!tile) throw Error("no shortcut for a.example");
    sleep(1);
    tapAt(tile);
    const opened = await d.waitForUrl('https://a.example/').then(() => [], error => [error.message]);
    screenshot('a tap opens the site');
    results.push({case: 'a tap on a shortcut opens the site', problems: opened});
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
