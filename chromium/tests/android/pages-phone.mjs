// A1 Task 6 on the emulator: Blanc's pages at chrome://blanc/ in the phone
// layout, in every language. A fresh install must open the Start Page, not
// Chrome's. Then each page, at 1080 × 2400 in each of the six languages, must:
//   - load with window.bowserPages and the iPhone's phone layout (or, for the
//     error and Mahjong pages, which have no phone CSS, just load);
//   - be in that language (<html lang>);
//   - not scroll sideways (scrollWidth ≤ innerWidth);
//   - throw no uncaught script errors.
// A fresh install's Start Page must also show the iPhone's first-run clock
// (tall Roboto Flex), solid as every Android clock is, its figures at the
// middle of the screen. The Start Page is the desktop fork's (A5b): its
// widgets, shortcut count, clock and wallpaper must survive a relaunch, and a
// Glass clock asked for is never saved. Screenshots go to the evidence folder.
// Fails closed: a page that can't be reached fails.
//
//   node chromium/tests/android/pages-phone.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const PACKAGE = 'me.bnfy.blanc.dev';
const PAGES = ['newtab', 'bookmarks', 'history', 'shortcuts', 'error', 'mahjong'];
const PHONE_LAYOUT = ['newtab', 'bookmarks', 'history', 'shortcuts'];
// The Start Page is the desktop fork's, marked by android-start.js; the rest are shipping's, which
// the adapter marks with the iPhone's phone layout.
const platformOf = page => page === 'newtab' ? 'android' : 'ios';
const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'pt-BR'];
const PORT = 9333;

// What's wrong with one page, from what the page reported.
export function pageProblems(page, locale, report) {
  if (!report) return ['did not load'];
  const problems = [];
  // Mahjong adds its own ?game=; the page is what matters.
  if (report.url.split(/[?#]/)[0] !== `chrome://blanc/${page}.html`) problems.push(`opened ${report.url}`);
  if (!report.bridge) problems.push('no window.bowserPages');
  if (PHONE_LAYOUT.includes(page) && report.platform !== platformOf(page)) problems.push('not in the phone layout');
  if (report.lang !== locale) problems.push(`in ${report.lang || 'no language'}, not ${locale}`);
  if (report.scrollWidth > report.innerWidth) problems.push(`scrolls sideways (${report.scrollWidth} > ${report.innerWidth})`);
  for (const error of report.errors) problems.push(`script error: ${error}`);
  return problems;
}

// The iPhone's first-run Billboard clock (#1331), which a fresh install must show: Roboto Flex at its
// tallest, weight 450. Android's clock is solid only, so the page's glass is never drawn.
export function clockProblems(report) {
  if (!report || !report.clock) return ['no clock data'];
  const {clock, glassDrawn} = report;
  const want = {font: 'flex', style: 'solid', height: 300, weight: 450};
  const problems = Object.entries(want).filter(([key, value]) => clock[key] !== value)
    .map(([key, value]) => `${key} is ${JSON.stringify(clock[key])}, not ${JSON.stringify(value)}`);
  if (glassDrawn) problems.push('the glass is drawn');
  return problems;
}

// What the Start Page chose before a relaunch, which it must still show after it: two widgets, four
// shortcuts, Inter at weight 600, the Color wallpaper in sky. Glass was asked for too, and the clock
// still reads solid.
export const CHOICES = {widgets: {favorites: true, devices: true, shortcutCount: 4},
  clock: {font: 'inter', weight: 600, style: 'solid'}, wallpaper: {source: 'color', preset: 'sky'}};
export function relaunchProblems(report) {
  if (!report) return ['no Start Page data after the relaunch'];
  const problems = [];
  for (const [key, want] of Object.entries(CHOICES.widgets))
    if (report.widgets?.[key] !== want) problems.push(`widgets.${key} is ${JSON.stringify(report.widgets?.[key])}, not ${want}`);
  for (const [key, want] of Object.entries(CHOICES.clock))
    if (report.clock?.[key] !== want) problems.push(`clock.${key} is ${JSON.stringify(report.clock?.[key])}, not ${JSON.stringify(want)}`);
  if (report.wallpaper?.source !== CHOICES.wallpaper.source) problems.push(`wallpaper is ${JSON.stringify(report.wallpaper?.source)}, not "color"`);
  if (report.wallpaper?.color?.preset !== CHOICES.wallpaper.preset) problems.push(`wallpaper color is ${JSON.stringify(report.wallpaper?.color?.preset)}, not "sky"`);
  return problems;
}

// The clock's figures (in CSS px down the screen) must center on the screen: the page sits below
// the status bar, so the iPhone's centering in the page alone puts them low. Allows 2.5 px for the
// adapter taking the page's top from screen.availTop, which is rounded.
export function clockCenterProblems(report) {
  if (!report) return ['no clock to measure'];
  if (report.timedOut) return ['the page did not answer within 20 s'];
  const off = (report.inkTop + report.inkBottom) / 2 - report.screenHeight / 2;
  if (Math.abs(off) <= 2.5) return [];
  return [`the figures sit ${Math.round(Math.abs(off))} px ${off > 0 ? 'below' : 'above'} the middle of the screen`];
}

// The figures' extent where the clock is drawn, from its font as CSS lays out its one line. The
// page's top on the screen is how much of the screen it doesn't fill, as it runs to the bottom.
const MEASURE_FIGURES = `(() => {
  const clock = document.getElementById('bbClock');
  if (!clock) return null;
  const style = getComputedStyle(clock);
  const context = document.createElement('canvas').getContext('2d');
  context.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
  const m = context.measureText(clock.textContent);
  const box = clock.getBoundingClientRect();
  const baseline = box.top + (box.height - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
  const top = screen.height - innerHeight;
  return {screenHeight: screen.height, inkTop: top + baseline - m.actualBoundingBoxAscent, inkBottom: top + baseline + m.actualBoundingBoxDescent};
})()`;

// One DevTools session on the app's only page.
async function devtools() {
  let list = [];
  for (let i = 0; i < 20 && !list.some(t => t.type === 'page'); i++) {
    try { list = await (await fetch(`http://localhost:${PORT}/json`)).json(); } catch { /* not up yet */ }
    if (!list.some(t => t.type === 'page')) await new Promise(r => setTimeout(r, 500));
  }
  const target = list.find(t => t.type === 'page');
  if (!target) throw Error('no page to debug');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0;
  const waiting = new Map(), errors = [];
  ws.onmessage = m => {
    const message = JSON.parse(m.data);
    if (message.id && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise(resolve => { const id = ++seq; waiting.set(id, resolve); ws.send(JSON.stringify({id, method, params})); });
  await send('Runtime.enable');
  return {url: target.url, send, errors, close: () => ws.close()};
}

async function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: pages-phone.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const adb = (...args) => execFileSync('adb', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const sleep = s => execFileSync('sleep', [String(s)]);
  const launch = () => { adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1'); sleep(6); };
  const results = [];
  adb('install', '-r', apk);
  adb('shell', 'pm', 'clear', PACKAGE);
  adb('shell', 'wm', 'size', '1080x2400');
  adb('forward', `tcp:${PORT}`, 'localabstract:chrome_devtools_remote');
  try {
    launch();
    const first = await devtools();
    first.close();
    results.push({case: 'fresh install', problems: first.url === 'chrome://blanc/newtab.html' ? [] : [`opened ${first.url}`]});
    {
      const tools = await devtools();
      sleep(2);
      const {result} = await tools.send('Runtime.evaluate', {returnByValue: true, awaitPromise: true, expression: `
        window.bowserPages.start.data().then(data => ({
          clock: data.clock, glassDrawn: !document.getElementById('bbClockArt').hidden }))`});
      fs.writeFileSync(path.join(evidence, 'clock.png'), execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}));
      const report = result?.result?.value ?? null;
      results.push({case: 'the first-run clock is the iPhone\'s', report, problems: clockProblems(report)});
      const measured = await Promise.race([
        tools.send('Runtime.evaluate', {returnByValue: true, expression: MEASURE_FIGURES}),
        new Promise(resolve => setTimeout(() => resolve({timedOut: true}), 20000)),
      ]);
      const figures = measured.timedOut ? measured : measured.result?.result?.value ?? null;
      results.push({case: 'the clock\'s figures sit at the middle of the screen', report: figures, problems: clockCenterProblems(figures)});
      // Choose, as Customize does, then relaunch.
      const chose = await tools.send('Runtime.evaluate', {awaitPromise: true, returnByValue: true, expression: `(async () => {
        const start = window.bowserPages.start;
        await start.setWidget('favorites', true);
        await start.setWidget('devices', true);
        await start.setShortcutCount(4);
        await start.setClock({font: 'inter', weight: 600, style: 'glass'});
        await start.setWallpaper('color');
        await start.setWallpaperColor('sky');
        return 'chosen';
      })().catch(error => String(error))`});
      const chosen = chose?.result?.result?.value;
      results.push({case: 'Customize\'s choices save', problems: chosen === 'chosen' ? [] : [`saving failed: ${chosen}`]});
      tools.close();
    }
    {
      // Leave Blanc as a person does, so it writes what it holds, then end it.
      adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
      sleep(5);
      adb('shell', 'am', 'force-stop', PACKAGE);
      launch();
      const tools = await devtools();
      sleep(2);
      const {result} = await tools.send('Runtime.evaluate', {returnByValue: true, awaitPromise: true, expression: `
        window.bowserPages.start.data().then(data => ({widgets: data.widgets, clock: data.clock, wallpaper: data.wallpaper}))`});
      fs.writeFileSync(path.join(evidence, 'relaunch.png'), execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}));
      const report = result?.result?.value ?? null;
      results.push({case: 'the Start Page\'s choices survive a relaunch', report, problems: relaunchProblems(report)});
      tools.close();
    }
    for (const locale of LOCALES) {
      adb('shell', 'am', 'force-stop', PACKAGE);
      adb('shell', 'cmd', 'locale', 'set-app-locales', PACKAGE, '--locales', locale);
      launch();
      const tools = await devtools();
      for (const page of PAGES) {
        tools.errors.length = 0;
        await tools.send('Page.navigate', {url: `chrome://blanc/${page}.html`});
        sleep(2.5);
        const {result} = await tools.send('Runtime.evaluate', {returnByValue: true, expression: `({
          url: location.href, bridge: typeof window.bowserPages === 'object',
          platform: document.documentElement.dataset.platform || null, lang: document.documentElement.lang,
          scrollWidth: document.documentElement.scrollWidth, innerWidth })`});
        const report = result?.result?.value ? {...result.result.value, errors: [...tools.errors]} : null;
        const name = `${locale}-${page}`;
        fs.writeFileSync(path.join(evidence, `${name}.png`), execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 * 1024 * 1024}));
        results.push({case: name, report, problems: pageProblems(page, locale, report)});
      }
      tools.close();
    }
  } finally {
    adb('shell', 'wm', 'size', 'reset');
    adb('shell', 'cmd', 'locale', 'set-app-locales', PACKAGE, '--locales', '');
    adb('forward', '--remove', `tcp:${PORT}`);
  }
  fs.writeFileSync(path.join(evidence, 'pages-phone.json'), JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (results.some(r => r.problems.length)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(`Pages on the phone: ${error.message}`); process.exitCode = 1; });
}
