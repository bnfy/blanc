// A5b on the emulator: the Island menu's Customize (on a Start Page) and Settings' Start Page row each
// open the Start Page's Customize. Taps through UI Automator and reads the page over DevTools.
// Fails closed: anything not found on screen fails its case.
//
//   node chromium/tests/android/start-page-ways.mjs <evidence dir>   (adb on PATH, Blanc installed)
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';

const PACKAGE = 'me.bnfy.blanc.dev';
const PORT = 9333;
const adb = (...a) => execFileSync('adb', a, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20});
const sleep = s => execFileSync('sleep', [String(s)]);
const screenshot = file => fs.writeFileSync(file, execFileSync('adb', ['exec-out', 'screencap', '-p'], {maxBuffer: 64 << 20}));

// What's on screen: each view's text, description and center.
function nodes() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
  const xml = adb('shell', 'cat', '/sdcard/ui.xml');
  return [...xml.matchAll(/<node [^>]*>/g)].map(m => {
    const attr = k => (new RegExp(` ${k}="([^"]*)"`).exec(m[0]) || [])[1] || '';
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attr('bounds'));
    return {text: attr('text'), desc: attr('content-desc'), x: b ? (+b[1] + +b[3]) / 2 : 0, y: b ? (+b[2] + +b[4]) / 2 : 0};
  });
}

function tap(match, label) {
  for (let i = 0; i < 10; i++) {
    const n = nodes().find(match);
    if (n) { adb('shell', 'input', 'tap', String(n.x), String(n.y)); sleep(1.5); return; }
    sleep(1);
  }
  throw Error(`no ${label} on screen`);
}

// One DevTools call in the first page whose address starts with `prefix`.
async function inPage(prefix, method, params) {
  const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
  const target = list.find(t => t.type === 'page' && t.url.startsWith(prefix));
  if (!target) return {missing: list.filter(t => t.type === 'page').map(t => t.url)};
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  const reply = await new Promise(r => { ws.onmessage = m => r(JSON.parse(m.data)); ws.send(JSON.stringify({id: 1, method, params})); });
  ws.close();
  return reply;
}

// Customize is open, and the address no longer carries #customize.
async function customizeProblems() {
  const reply = await inPage('chrome://blanc/newtab.html', 'Runtime.evaluate', {returnByValue: true,
    expression: "document.getElementById('customizePopover').matches(':popover-open') && location.hash === ''"});
  if (reply.missing) return [`no Start Page (${reply.missing.join(', ')})`];
  return reply.result?.result?.value === true ? [] : ['Customize is not open'];
}

async function main(evidence) {
  if (!evidence) throw Error('Usage: start-page-ways.mjs <evidence dir>');
  fs.mkdirSync(evidence, {recursive: true});
  const results = [];
  const run = async (name, steps) => {
    try {
      results.push({case: name, problems: await steps()});
    } catch (error) {
      results.push({case: name, problems: [error.message]});
    }
  };
  const menu = n => n.desc === 'Page actions';
  adb('shell', 'am', 'force-stop', PACKAGE);
  adb('shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1');
  sleep(6);
  adb('forward', `tcp:${PORT}`, 'localabstract:chrome_devtools_remote');
  try {
    // Blanc reopens the tab it last showed; the menu offers Customize on a Start Page only.
    await inPage('', 'Page.navigate', {url: 'chrome://blanc/newtab.html'});
    sleep(3);
    await run('the Island menu\'s Customize opens Customize', async () => {
      tap(menu, 'Island menu');
      tap(n => n.text === 'Customize', 'Customize item');
      screenshot(`${evidence}/menu-customize.png`);
      return customizeProblems();
    });
    await run('Settings\' Start Page row opens Customize', async () => {
      adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
      sleep(1);
      tap(menu, 'Island menu');
      tap(n => n.text === 'Settings', 'Settings item');
      sleep(2);
      for (let i = 0; i < 4 && !nodes().some(n => n.text === 'Start Page'); i++) {
        adb('shell', 'input', 'swipe', '500', '1600', '500', '900');
        sleep(1);
      }
      screenshot(`${evidence}/settings-row.png`);
      tap(n => n.text === 'Start Page', 'Start Page row');
      sleep(2.5);
      screenshot(`${evidence}/settings-customize.png`);
      return customizeProblems();
    });
  } finally {
    adb('forward', '--remove', `tcp:${PORT}`);
  }
  fs.writeFileSync(`${evidence}/start-page-ways.json`, JSON.stringify({results, checkedAt: new Date().toISOString()}, null, 2) + '\n');
  for (const r of results) console.log(`${r.problems.length ? 'FAIL' : 'pass'} ${r.case}${r.problems.length ? ': ' + r.problems.join('; ') : ''}`);
  if (results.some(r => r.problems.length)) process.exitCode = 1;
}

main(process.argv[2]).catch(error => { console.error(`Start Page ways in: ${error.message}`); process.exitCode = 1; });
