// Patch 0108: Blanc takes no Google API key or OAuth client ID from the
// environment.
//
// One launch with a fresh profile, GOOGLE_API_KEY and GOOGLE_DEFAULT_CLIENT_ID
// set to marker values, and verbose logging for google_apis/api_key_cache.cc,
// which logs every override it applies. The positive control is
// --gaia-config-contents giving GOOGLE_API_KEY_HATS a third marker: Chromium
// must log taking that one ("from gaia config"), which proves the key cache was
// built in this launch and its logging reaches the file. Neither environment
// marker may appear anywhere in the log, and no key may come "from environment
// variable". An unpatched build logs both markers (checked on the Mac Studio's
// Prototype, November 21, 2026).
//
// Run it on the Mac Studio against a built Blanc Beta (or Prototype):
//   node chromium/tests/native-environment-api-keys.mjs "<path>/Blanc Beta.app" <new-output-dir>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {connect, waitFor, pause} from './lib/cdp.mjs';

const [app, out] = process.argv.slice(2);
if (!app || !out) throw Error('Usage: native-environment-api-keys.mjs <Blanc Beta.app | executable> <new-output-dir>');
if (fs.existsSync(out)) throw Error('Refusing to overwrite ' + out);
fs.mkdirSync(out, {recursive: true, mode: 0o700});

const ENV_KEY = 'blanc-env-key-marker', ENV_CLIENT = 'blanc-env-client-marker', CONTROL = 'blanc-gaia-control-marker';

function executableOf(target) {
  if (!target.endsWith('.app')) return target;
  const macos = path.join(target, 'Contents', 'MacOS');
  const names = fs.readdirSync(macos);
  if (names.length !== 1) throw Error('Expected one executable in ' + macos + ': ' + names.join(', '));
  return path.join(macos, names[0]);
}

/** What the browser log says about where keys came from. */
export function keySources(log) {
  return {
    control: log.includes(`Overriding API key GOOGLE_API_KEY_HATS with value ${CONTROL} from gaia config.`),
    fromEnvironment: log.split('\n').filter(line => /from environment variable/.test(line)),
    markers: [ENV_KEY, ENV_CLIENT].filter(marker => log.includes(marker)),
  };
}

const isStart = t => t.type === 'page' && (t.url === 'chrome://newtab/' || /\/newtab\.html\b/.test(t.url));
const executable = executableOf(path.resolve(app));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-env-keys-'));
const logFile = path.join(out, 'browser.log');
const args = [`--user-data-dir=${profile}`, '--remote-debugging-port=0', '--enable-logging=stderr',
  '--vmodule=api_key_cache=1', `--gaia-config-contents=${JSON.stringify({api_keys: {GOOGLE_API_KEY_HATS: CONTROL}})}`];
const result = {app: path.resolve(app), executable, env: ['GOOGLE_API_KEY', 'GOOGLE_DEFAULT_CLIENT_ID'], checks: []};
let proc, exit, browser;
try {
  const log = fs.openSync(logFile, 'wx');
  proc = spawn(executable, args, {stdio: ['ignore', log, log],
    env: {...process.env, GOOGLE_API_KEY: ENV_KEY, GOOGLE_DEFAULT_CLIENT_ID: ENV_CLIENT}});
  fs.closeSync(log);
  proc.on('exit', (code, signal) => { exit = {code, signal}; });
  const port = await waitFor(() => +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0],
    x => x > 0, 'debugging port', 60000);
  const list = () => fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  browser = await connect(await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json()));
  await waitFor(list, ts => ts.some(isStart), 'the Start Page', 60000);
  const sources = await waitFor(() => keySources(fs.readFileSync(logFile, 'utf8')), s => s.control,
    'the gaia-config control key in the log', 15000);
  result.checks.push('the key cache was built and logged taking GOOGLE_API_KEY_HATS from --gaia-config-contents');
  // Let anything that reads keys later in startup run too.
  await pause(3000);
  const after = keySources(fs.readFileSync(logFile, 'utf8'));
  if (after.fromEnvironment.length) throw Error('keys taken from the environment:\n' + after.fromEnvironment.join('\n'));
  if (after.markers.length) throw Error('environment values in the log: ' + after.markers.join(', '));
  result.checks.push('neither GOOGLE_API_KEY nor GOOGLE_DEFAULT_CLIENT_ID was taken from the environment');
  result.status = 'passed';
} catch (error) {
  result.status = 'failed'; result.error = String(error.stack || error);
} finally {
  if (browser) try { await browser.send('Browser.close'); } catch {}
  try { browser?.close(); } catch {}
  if (proc) for (let i = 0; i < 100 && !exit; i++) await pause(100);
  if (proc && !exit) { proc.kill('SIGTERM'); for (let i = 0; i < 50 && !exit; i++) await pause(100); }
  result.browserExit = exit;
  fs.rmSync(profile, {recursive: true, force: true});
}
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === 'passed' ? 0 : 1;
