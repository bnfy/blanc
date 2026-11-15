// The Start Page with the Island along the top, on the emulator: the page makes room for the Island
// on whichever side it sits (android-start.css, from the mark android-start.js gets from native
// code), as Blanc for iPhone's does. Moves the Island in Settings as a person would, so the open
// Start Page must reload into the new layout, then relaunches to check the layout stays. Judges
// what's on screen (UI Automator bounds of the Island and the page's own text), not the CSS.
// Fails closed: anything not found on screen fails its case.
//
//   node chromium/tests/android/start-island-top.mjs --apk <path> --evidence <dir>   (adb on PATH)
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';

const PACKAGE = 'me.bnfy.blanc.dev';
const PREFS = `/data/data/${PACKAGE}/shared_prefs/${PACKAGE}_preferences.xml`;
const PAGE = 'chrome://blanc/newtab';
const PORT = 9334;
const adb = (...a) => execFileSync('adb', a, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20});
const sleep = s => execFileSync('sleep', [String(s)]);
const screenshot = file => fs.writeFileSync(file, execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 << 20}));

// What's on screen: each view's id, text, description and bounds.
function nodes() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
  const xml = adb('shell', 'cat', '/sdcard/ui.xml');
  return [...xml.matchAll(/<node [^>]*>/g)].map(m => {
    const attr = k => (new RegExp(` ${k}="([^"]*)"`).exec(m[0]) || [])[1] || '';
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr('bounds'));
    const [left, top, right, bottom] = b ? b.slice(1).map(Number) : [0, 0, 0, 0];
    return {id: attr('resource-id'), text: attr('text'), desc: attr('content-desc'), left, top, right, bottom,
      x: (left + right) / 2, y: (top + bottom) / 2};
  });
}

function find(match, label, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const n = nodes().find(match);
    if (n) return n;
    sleep(1);
  }
  throw Error(`no ${label} on screen`);
}

function tap(match, label) {
  const n = find(match, label);
  adb('shell', 'input', 'tap', String(n.x), String(n.y));
  sleep(1.5);
}

// One DevTools call in the Start Page. Right after a launch its DevTools socket may not answer yet.
async function inPage(method, params) {
  let list;
  for (let i = 0; ; i++) {
    try { list = await (await fetch(`http://localhost:${PORT}/json`)).json(); break; }
    catch (error) { if (i === 9) throw error; sleep(1); }
  }
  const target = list.find(t => t.type === 'page' && t.url.startsWith(PAGE));
  if (!target) throw Error(`no Start Page (${list.filter(t => t.type === 'page').map(t => t.url).join(', ')})`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  const reply = await new Promise(r => { ws.onmessage = m => r(JSON.parse(m.data)); ws.send(JSON.stringify({id: 1, method, params})); });
  ws.close();
  return reply;
}
const evaluate = async expression => (await inPage('Runtime.evaluate', {expression, returnByValue: true})).result?.result?.value;

// The page's mark, the date's text (found on screen by it) and when the page was loaded.
const pageState = () => evaluate(`({island: document.documentElement.dataset.island,
  date: document.querySelector('.start-brand-date')?.textContent.trim(),
  kept: (() => { try { return localStorage.getItem('blanc.android.island'); } catch { return null; } })(),
  loadedAt: performance.timeOrigin})`);

// Where things are on screen: the Island's pill, the page's date and its Customize button. A page's
// text reaches UI Automator a moment after it draws, so this looks again for up to 10 s.
async function layout() {
  const [, height] = /(\d+)x(\d+)/.exec(adb('shell', 'wm', 'size')).slice(1).map(Number).sort((a, b) => a - b);
  for (let i = 0; ; i++) {
    const state = await pageState();
    const all = nodes();
    const pill = all.find(n => n.id.endsWith(':id/blanc_island_pill'));
    const date = state?.date ? all.find(n => n.text === state.date || n.desc === state.date) : null;
    const customize = all.find(n => (n.text === 'Customize' || n.desc === 'Customize') && !n.id.includes('blanc_island'));
    if ((pill && date && customize) || i === 9) return {state, pill, date, customize, height};
    sleep(1);
  }
}

// The layout for the Island on `side`: the date and Customize clear of it, on the side it left.
function problemsFor(side, {state, pill, date, customize, height}) {
  const problems = [];
  if (state?.island !== side) problems.push(`page marked ${state?.island}, not ${side}`);
  if (!pill) problems.push('no Island on screen');
  if (!date) problems.push('no date on screen');
  if (!customize) problems.push('no Customize on screen');
  if (problems.length) return problems;
  if (side === 'top') {
    if (pill.top > height / 4) problems.push(`the Island isn't at the top (${pill.top})`);
    if (date.top < pill.bottom) problems.push(`the date (top ${date.top}) is under the Island (bottom ${pill.bottom})`);
    if (customize.bottom < height * 0.85) problems.push(`Customize stays up off the bottom edge (bottom ${customize.bottom} of ${height})`);
  } else {
    if (pill.bottom < height * 0.75) problems.push(`the Island isn't at the bottom (${pill.bottom})`);
    if (customize.bottom > pill.top) problems.push(`Customize (bottom ${customize.bottom}) is under the Island (top ${pill.top})`);
    if (date.top > height / 4) problems.push(`the date isn't at the top (${date.top})`);
  }
  return problems;
}

function setPositionFile(value) {
  adb('shell', 'am', 'force-stop', PACKAGE);
  const xml = adb('shell', 'run-as', PACKAGE, 'cat', PREFS).replace(/\s*<string name="blanc\.island_position">[^<]*<\/string>/, '');
  adb('shell', `run-as ${PACKAGE} sh -c 'cat > ${PREFS}' <<'EOF'\n${xml.replace('</map>', `    <string name="blanc.island_position">${value}</string>\n</map>`)}\nEOF`);
}

// Blanc opens on the Start Page from cleared data, and goes back to it after a relaunch. Android
// routes no chrome:// address to an app, so the launcher starts it.
function launch() {
  adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
  sleep(7);
  adb('forward', `tcp:${PORT}`, 'localabstract:chrome_devtools_remote');
}

async function main(argv) {
  const option = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const apk = option('--apk'), evidence = option('--evidence');
  if (!apk || !evidence) throw Error('Usage: start-island-top.mjs --apk <path> --evidence <dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const results = [];
  const run = async (name, steps) => {
    try {
      results.push({case: name, problems: await steps()});
    } catch (error) {
      results.push({case: name, problems: [error.message]});
    }
  };
  adb('install', '-r', apk);
  adb('shell', 'pm', 'clear', PACKAGE);
  // The walkthrough's card would cover the page (A5c); debug builds skip it while this file exists.
  adb('shell', 'touch', '/data/local/tmp/blanc-walkthrough-off');
  adb('shell', 'chmod', '644', '/data/local/tmp/blanc-walkthrough-off');
  try {
    launch();
    await run('with the Island at the bottom, Customize sits above it and the date at the top', async () => {
      const seen = await layout();
      screenshot(`${evidence}/bottom.png`);
      return problemsFor('bottom', seen);
    });
    let before = null;
    await run('moving the Island to the top in Settings lays the open Start Page out for it', async () => {
      before = (await pageState())?.loadedAt;
      tap(n => n.desc === 'Page actions', 'Island menu');
      tap(n => n.text === 'Settings', 'Settings item');
      sleep(2);
      for (let i = 0; i < 4 && !nodes().some(n => n.text === 'Island position'); i++) {
        adb('shell', 'input', 'swipe', '500', '1400', '500', '900');
        sleep(1);
      }
      tap(n => n.text === 'Island position', 'Island position row');
      screenshot(`${evidence}/settings-choice.png`);
      tap(n => n.text === 'Top', 'Top choice');
      adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
      sleep(3);
      const seen = await layout();
      screenshot(`${evidence}/top.png`);
      const problems = problemsFor('top', seen);
      if (seen.state?.loadedAt === before) problems.push('the Start Page was not reloaded');
      if (seen.state?.kept !== 'top') problems.push(`the page kept ${seen.state?.kept}`);
      return problems;
    });
    await run('a relaunch keeps the top layout from the start', async () => {
      adb('shell', 'am', 'force-stop', PACKAGE);
      launch();
      const seen = await layout();
      screenshot(`${evidence}/top-relaunch.png`);
      return problemsFor('top', seen);
    });
    await run('with the Island at the top, Customize opens over the bottom, clear of it', async () => {
      await evaluate(`document.getElementById('customizePopover').showPopover()`);
      sleep(1.5);
      // The sheet's first line of text, found on screen by it, and how far the sheet ends from the
      // page's bottom.
      const sheet = await evaluate(`(() => { const s = document.getElementById('customizePopover');
        const walk = document.createTreeWalker(s, NodeFilter.SHOW_TEXT,
          {acceptNode: t => t.textContent.trim() && t.parentElement.getClientRects().length ? 1 : 3});
        const first = walk.nextNode();
        return {first: first?.textContent.trim(), gap: innerHeight - s.getBoundingClientRect().bottom}; })()`);
      let all, pill, line;
      for (let i = 0; i < 10 && !(pill && line); i++) {
        if (i) sleep(1);
        all = nodes();
        pill = all.find(n => n.id.endsWith(':id/blanc_island_pill'));
        line = sheet?.first ? all.find(n => n.text === sheet.first || n.desc === sheet.first) : null;
      }
      screenshot(`${evidence}/top-customize.png`);
      if (!pill || !line) return [`no Island or no sheet text on screen (${sheet?.first})`];
      const problems = [];
      if (sheet.gap > 40) problems.push(`the sheet stops ${Math.round(sheet.gap)} px above the bottom`);
      if (line.top < pill.bottom) problems.push(`the sheet's "${sheet.first}" (top ${line.top}) is under the Island (bottom ${pill.bottom})`);
      await evaluate(`document.getElementById('customizePopover').hidePopover()`);
      return problems;
    });
    await run('moving it back lays the page out for the bottom again', async () => {
      setPositionFile('bottom');
      launch();
      const seen = await layout();
      screenshot(`${evidence}/bottom-again.png`);
      return problemsFor('bottom', seen);
    });
  } finally {
    try { adb('forward', '--remove', `tcp:${PORT}`); } catch { /* not forwarded */ }
  }
  fs.writeFileSync(`${evidence}/start-island-top.json`, JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  console.log(`Start Page with the Island along the top: ${results.filter(r => !r.problems.length).length} of ${results.length} pass`);
  if (results.some(r => r.problems.length)) process.exitCode = 1;
}

main(process.argv.slice(2)).catch(error => { console.error(`start-island-top: ${error.message}`); process.exitCode = 1; });
