// Outbound isolation of the packaged beta (S1.1, beta): the app as a person
// runs it, with no test hooks, proxy or --disable-background-networking, so
// whatever it contacts on its own is attempted for real and blocked by the
// pf anchor. Three launches on one fresh profile: startup and idle on a
// loopback page, a relaunch (session restore, scheduled work), and a private
// window. Each writes Chromium's own network log (--log-net-log, a standard
// switch) so analyze-beta.mjs can name the hosts behind blocked packets.
//
//   node beta-scenarios.mjs APP OUT_DIR [--offline] [--short]
//
// --offline resolves every host but loopback to nothing (a dry run outside
// the pf test, nothing leaves the machine); --short shortens the waits.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';

import {fileURLToPath} from 'node:url';
const main = process.argv[1] === fileURLToPath(import.meta.url);
const [app, out, ...flags] = main ? process.argv.slice(2) : [];
if (main && (!app || !out)) throw Error('Usage: beta-scenarios.mjs APP OUT_DIR [--offline] [--short]');
const offline = flags.includes('--offline'), short = flags.includes('--short');
// The page's one outside request, to a name that never resolves (no packet
// leaves): it must appear in every network log, proving the log was read.
export const PROBE_HOST = 'outbound-probe.invalid';
export const SCENARIOS = [
  {name: 'startup-idle', seconds: 180, args: []},
  {name: 'relaunch', seconds: 90, args: []},
  {name: 'private-window', seconds: 60, args: ['--incognito']},
];
if (main) await run();
async function run() {
const server = http.createServer((req, res) => { res.writeHead(200, {'content-type': 'text/html'}); res.end(`<!doctype html><title>outbound</title>Outbound isolation page<img src="http://${PROBE_HOST}/probe.gif">`); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://localhost:${server.address().port}/`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-beta-outbound-'));
const results = [];
for (const s of SCENARIOS) {
  const netlog = path.join(out, `beta-netlog-${s.name}.json`);
  const started = new Date().toISOString();
  const browser = spawn(path.join(app, 'Contents/MacOS/Blanc Beta'), [`--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', `--log-net-log=${netlog}`, '--net-log-capture-mode=Default',
    ...(offline ? ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] : []), ...s.args, url], {stdio: 'ignore'});
  await new Promise(r => setTimeout(r, (short ? 20 : s.seconds) * 1000));
  browser.kill('SIGTERM');
  await Promise.race([new Promise(r => browser.once('exit', r)), new Promise(r => setTimeout(r, 15000))]);
  if (browser.exitCode === null && browser.signalCode === null) browser.kill('SIGKILL');
  results.push({...s, started, finished: new Date().toISOString(), netlog: path.basename(netlog)});
}
server.close();
fs.rmSync(profile, {recursive: true, force: true});
fs.writeFileSync(path.join(out, 'beta-scenarios.json'), JSON.stringify({app: path.basename(app), offline, short, scenarios: results}, null, 2) + '\n');
console.log(JSON.stringify(results.map(r => `${r.name} ${r.started}..${r.finished}`)));
}
