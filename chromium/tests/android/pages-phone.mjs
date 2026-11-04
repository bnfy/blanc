// A1 Task 6 on the emulator: Blanc's pages at chrome://blanc/ in the phone
// layout, in every language. A fresh install must open the Start Page, not
// Chrome's. Then each page, at 1080 × 2400 in each of the six languages, must:
//   - load with window.bowserPages and the iPhone's phone layout (or, for the
//     error and Mahjong pages, which have no phone CSS, just load);
//   - be in that language (<html lang>);
//   - not scroll sideways (scrollWidth ≤ innerWidth);
//   - throw no uncaught script errors.
// Screenshots go to the evidence folder. Fails closed: a page that can't be
// reached fails.
//
//   node chromium/tests/android/pages-phone.mjs --apk <ChromePublic.apk> --evidence <dir>
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const PACKAGE = 'me.bnfy.blanc.dev';
const PAGES = ['newtab', 'bookmarks', 'history', 'shortcuts', 'error', 'mahjong'];
const PHONE_LAYOUT = ['newtab', 'bookmarks', 'history', 'shortcuts'];
const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'pt-BR'];
const PORT = 9333;

// What's wrong with one page, from what the page reported.
export function pageProblems(page, locale, report) {
  if (!report) return ['did not load'];
  const problems = [];
  // Mahjong adds its own ?game=; the page is what matters.
  if (report.url.split(/[?#]/)[0] !== `chrome://blanc/${page}.html`) problems.push(`opened ${report.url}`);
  if (!report.bridge) problems.push('no window.bowserPages');
  if (PHONE_LAYOUT.includes(page) && report.platform !== 'ios') problems.push('not in the phone layout');
  if (report.lang !== locale) problems.push(`in ${report.lang || 'no language'}, not ${locale}`);
  if (report.scrollWidth > report.innerWidth) problems.push(`scrolls sideways (${report.scrollWidth} > ${report.innerWidth})`);
  for (const error of report.errors) problems.push(`script error: ${error}`);
  return problems;
}

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
