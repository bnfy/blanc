// Patch 0104: a fresh profile opens Blanc's own first run (the walkthrough on
// the Start Page), never Chromium's welcome (chrome://intro, "The browser that
// gets more done"). Launched the way the welcome was found on November 19,
// 2026: a fresh --user-data-dir and a debugging port, and in particular no
// --no-first-run, which every other fork suite passes and which hid it.
//
// Two launches, each with its own fresh profile:
//  - plain: nothing else on the command line;
//  - pre-first-run: Chromium's newer first run turned on (the four features
//    below), the path the Windows beta took when it showed
//    chrome://intro/welcome. That path ignores the skip that `signin.allowed`
//    false (patch 0027) gives the older one, so it is the positive control:
//    without patch 0104 the Mac beta opens chrome://intro/welcome here.
//
// Run it on the Mac Studio against a built Blanc Beta (or Prototype):
//   node chromium/tests/native-first-run-welcome.mjs "<path>/Blanc Beta.app" <new-output-dir>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {connect, waitFor, pause} from './lib/cdp.mjs';

const [app, out] = process.argv.slice(2);
if (!app || !out) throw Error('Usage: native-first-run-welcome.mjs <Blanc Beta.app | executable> <new-output-dir>');
if (fs.existsSync(out)) throw Error('Refusing to overwrite ' + out);
fs.mkdirSync(out, {recursive: true, mode: 0o700});

export const PRE_FIRST_RUN_FEATURES = ['FirstRunDesktopRefresh', 'FirstRunDesktopChoiceScreenRefresh',
  'FirstRunDesktopRevamp', 'PreFirstRunDesktopRefresh'];
const LAUNCHES = [
  {name: 'plain', args: []},
  {name: 'pre-first-run', args: ['--enable-features=' + PRE_FIRST_RUN_FEATURES.join(',')]},
];

/** The executable inside a Mac bundle, or the path itself. */
function executableOf(target) {
  if (!target.endsWith('.app')) return target;
  const macos = path.join(target, 'Contents', 'MacOS');
  const names = fs.readdirSync(macos);
  if (names.length !== 1) throw Error('Expected one executable in ' + macos + ': ' + names.join(', '));
  return path.join(macos, names[0]);
}

const isWelcome = url => /^chrome:\/\/(intro|welcome)\b/.test(url);
const isStart = t => t.type === 'page' && (t.url === 'chrome://newtab/' || /\/newtab\.html\b/.test(t.url));
const executable = executableOf(path.resolve(app));

async function launch({name, args}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-first-run-'));
  const result = {name, args, checks: [], urls: []};
  let proc, exit, browser, page;
  try {
    const log = fs.openSync(path.join(out, name + '.log'), 'wx');
    proc = spawn(executable, [`--user-data-dir=${profile}`, '--remote-debugging-port=0', ...args],
      {stdio: ['ignore', log, log]});
    fs.closeSync(log);
    proc.on('exit', (code, signal) => { exit = {code, signal}; });
    const port = await waitFor(() => +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0],
      x => x > 0, 'debugging port', 60000);
    browser = await connect(await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json()));
    const seen = new Set();
    const targets = async () => { const ts = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
      ts.forEach(t => seen.add(t.url)); return ts; };
    // Chromium opens its welcome before any browser window, so a Start Page
    // means startup got past it.
    const listing = await waitFor(targets, ts => ts.some(isStart) || ts.some(t => isWelcome(t.url)),
      'a Start Page or Chromium\'s welcome', 60000);
    for (let i = 0; i < 30; i++) { await targets(); await pause(100); }
    result.urls = [...seen].sort();
    const welcome = result.urls.filter(isWelcome);
    if (welcome.length) throw Error('Chromium\'s welcome opened: ' + welcome.join(', '));
    result.checks.push('a fresh profile opens no chrome://intro or chrome://welcome page');
    page = await connect(listing.find(isStart));
    const dialog = await waitFor(() => page.eval(`(() => { const d = document.getElementById('onboardDialog');
      return d && {open: !d.hidden, step: document.getElementById('obStepLabel')?.textContent || ''}; })()`),
      d => d && d.open, 'Blanc\'s walkthrough on the Start Page', 30000);
    result.checks.push('Blanc\'s own walkthrough is open on the Start Page (' + dialog.step.trim() + ')');
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed'; result.error = String(error.stack || error);
  } finally {
    if (browser) try { await browser.send('Browser.close'); } catch {}
    for (const c of [page, browser]) try { c?.close(); } catch {}
    if (proc) for (let i = 0; i < 100 && !exit; i++) await pause(100);
    if (proc && !exit) { proc.kill('SIGTERM'); for (let i = 0; i < 50 && !exit; i++) await pause(100); }
    result.browserExit = exit;
    fs.rmSync(profile, {recursive: true, force: true});
  }
  return result;
}

const result = {app: path.resolve(app), executable, launches: []};
for (const l of LAUNCHES) result.launches.push(await launch(l));
result.status = result.launches.every(l => l.status === 'passed') ? 'passed' : 'failed';
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === 'passed' ? 0 : 1;
