// Patch 0107: Blanc never shows Chromium's "Google API keys are missing" bar.
// Blanc ships without Google API keys on purpose, and Chromium put that bar on
// the first window of every launch (the owner saw it after a beta update,
// November 19, 2026).
//
// One launch with a fresh profile, a debugging port and one unsupported
// command-line flag. That flag makes Chromium show its "unsupported
// command-line flag" bar, the positive control: it proves the startup bars
// ran and were recorded. Chromium counts every bar it shows in the
// InfoBar.Shown histogram by its identifier (components/infobars/core/
// infobar_delegate.h): BAD_FLAGS_INFOBAR_DELEGATE = 43 must be there,
// GOOGLE_API_KEYS_INFOBAR_DELEGATE = 45 must not.
//
// A regression check, not a reproducer: on the Mac Studio the unpatched
// beta.8 never showed 45 (fresh launches, a restored relaunch, and
// GOOGLE_API_KEY=dummytoken), so the update relaunch the owner saw it in
// differs in a way this launch doesn't copy. Patch 0107 skips the bar on
// every path, whatever reaches it.
//
// Run it on the Mac Studio against a built Blanc Beta (or Prototype):
//   node chromium/tests/native-api-keys-infobar.mjs "<path>/Blanc Beta.app" <new-output-dir>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {connect, waitFor, pause} from './lib/cdp.mjs';

const [app, out] = process.argv.slice(2);
if (!app || !out) throw Error('Usage: native-api-keys-infobar.mjs <Blanc Beta.app | executable> <new-output-dir>');
if (fs.existsSync(out)) throw Error('Refusing to overwrite ' + out);
fs.mkdirSync(out, {recursive: true, mode: 0o700});

export const BAD_FLAGS = 43, GOOGLE_API_KEYS = 45;
// Any flag on Chromium's bad-flags list; this one changes nothing else here.
const CONTROL_FLAG = '--ignore-certificate-errors';

function executableOf(target) {
  if (!target.endsWith('.app')) return target;
  const macos = path.join(target, 'Contents', 'MacOS');
  const names = fs.readdirSync(macos);
  if (names.length !== 1) throw Error('Expected one executable in ' + macos + ': ' + names.join(', '));
  return path.join(macos, names[0]);
}

/** The InfoBar.Shown buckets chrome://histograms lists, as identifier → count. */
export function shownBuckets(text) {
  const at = text.indexOf('Histogram: InfoBar.Shown');
  if (at < 0) return null;
  const buckets = {};
  for (const line of text.slice(at).split('\n').slice(1)) {
    if (/^Histogram: /.test(line)) break;
    const m = line.match(/^\s*(\d+)\s+[-O\s]*\((\d+) = /);
    if (m) buckets[+m[1]] = +m[2];
  }
  return buckets;
}

const isStart = t => t.type === 'page' && (t.url === 'chrome://newtab/' || /\/newtab\.html\b/.test(t.url));
const executable = executableOf(path.resolve(app));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-api-keys-'));
const result = {app: path.resolve(app), executable, args: [CONTROL_FLAG], launches: []};

async function launch(name) {
const run = {name, checks: []};
let proc, exit, browser, page;
try {
  // The previous launch's port file would point at a closed port.
  fs.rmSync(path.join(profile, 'DevToolsActivePort'), {force: true});
  const log = fs.openSync(path.join(out, name + '.log'), 'wx');
  proc = spawn(executable, [`--user-data-dir=${profile}`, '--remote-debugging-port=0', CONTROL_FLAG],
    {stdio: ['ignore', log, log]});
  fs.closeSync(log);
  proc.on('exit', (code, signal) => { exit = {code, signal}; });
  const port = await waitFor(() => +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0],
    x => x > 0, 'debugging port', 60000);
  const list = () => fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  browser = await connect(await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json()));
  await waitFor(list, ts => ts.some(isStart), 'the Start Page', 60000);
  // The startup bars are added once the first window's tab is there.
  await pause(3000);
  const {targetId} = await browser.send('Target.createTarget', {url: 'chrome://histograms/InfoBar.Shown'});
  page = await connect(await waitFor(async () => (await list()).find(t => t.id === targetId), Boolean, 'the histograms tab', 15000));
  const buckets = await waitFor(async () => shownBuckets(await page.eval('document.body?.innerText ?? ""')),
    b => b && b[BAD_FLAGS], 'InfoBar.Shown with the unsupported-flag bar', 15000);
  run.buckets = buckets;
  run.checks.push(`the unsupported-flag bar (${BAD_FLAGS}) was shown and counted: the startup bars ran`);
  if (buckets[GOOGLE_API_KEYS]) throw Error(`the Google API keys bar (${GOOGLE_API_KEYS}) was shown ${buckets[GOOGLE_API_KEYS]} time(s)`);
  run.checks.push(`the Google API keys bar (${GOOGLE_API_KEYS}) was never shown`);
  run.status = 'passed';
} catch (error) {
  run.status = 'failed'; run.error = String(error.stack || error);
} finally {
  if (browser) try { await browser.send('Browser.close'); } catch {}
  for (const c of [page, browser]) try { c?.close(); } catch {}
  if (proc) for (let i = 0; i < 100 && !exit; i++) await pause(100);
  if (proc && !exit) { proc.kill('SIGTERM'); for (let i = 0; i < 50 && !exit; i++) await pause(100); }
  run.browserExit = exit;
}
return run;
}

// The second launch restores the first's session, as the relaunch after an
// update does: that is where the owner saw the bar.
result.launches.push(await launch('fresh'));
result.launches.push(await launch('restored'));
fs.rmSync(profile, {recursive: true, force: true});
result.status = result.launches.every(l => l.status === 'passed') ? 'passed' : 'failed';
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === 'passed' ? 0 : 1;
