// Active-session network-log check for Blanc Beta. The pf outbound check runs
// in the blanc-test account, whose windows are never the active window, so the
// omnibox never does its focus-time work there. On 2026-11-23 a private window
// in the logged-in account asked www.google.com for Google AI Mode's
// eligibility (/async/folae) and loaded Google's search prewarm page
// (/search/warmup.html), and the pf check had passed the same beta. This runs
// the same three scenarios in the current (active) session with every name but
// localhost unresolvable, so nothing leaves the Mac, and fails if any network
// log names a host other than localhost and the probe.
//
//   node chromium/tests/outbound/active-session.mjs APP OUT_DIR [--short]
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {netlogHosts} from './analyze-beta.mjs';
import {PROBE_HOST, SCENARIOS} from './beta-scenarios.mjs';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// netlogs: {scenario name: Map(host -> count)}.
export function judgeActiveSession(names, netlogs) {
  const problems = [];
  for (const name of names) {
    const seen = netlogs[name];
    if (!seen) { problems.push(`${name}: no network log: the run is invalid`); continue; }
    if (!seen.has(PROBE_HOST)) problems.push(`${name}: the network log never names the probe host: the run is invalid`);
    for (const [host, count] of seen) {
      if (!LOOPBACK.has(host) && host !== PROBE_HOST) problems.push(`${name}: the beta tried to reach ${host} (${count} network log entries)`);
    }
  }
  return {verdict: problems.length ? 'fail' : 'pass', problems,
    netlogHosts: Object.fromEntries(names.filter(n => netlogs[n]).map(n => [n, Object.fromEntries(netlogs[n])]))};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [app, out, ...flags] = process.argv.slice(2);
  if (!app || !out) throw Error('Usage: active-session.mjs APP OUT_DIR [--short]');
  fs.mkdirSync(out, {recursive: true});
  const here = path.dirname(fileURLToPath(import.meta.url));
  const run = spawnSync(process.execPath, [path.join(here, 'beta-scenarios.mjs'), app, out, '--offline', ...flags.filter(f => f === '--short')], {stdio: ['ignore', 'ignore', 'inherit']});
  if (run.status !== 0) throw Error('the scenarios did not finish');
  const names = SCENARIOS.map(s => s.name), netlogs = {};
  for (const name of names) {
    const file = path.join(out, `beta-netlog-${name}.json`);
    if (fs.existsSync(file)) netlogs[name] = netlogHosts(fs.readFileSync(file, 'utf8'));
  }
  const report = judgeActiveSession(names, netlogs);
  fs.writeFileSync(path.join(out, 'active-session-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (report.verdict !== 'pass') process.exitCode = 1;
}
