// Outbound-isolation verdict for the packaged beta (S1.1, beta). Reads one
// beta run's results folder: the pf log of every packet the test user sent
// off the Mac (all blocked), nettop's process attribution, the negative
// controls, beta-scenarios.json and each launch's Chromium network log.
//
// Valid only if every negative control appears in the pf log, nettop saw
// connections, and every network log names the probe host (so the logs were
// read). Passes only if no pf block during the run, outside a control, could
// have come from a Blanc process, and no network log names an outside host
// other than the probe and the destinations the beta is meant to contact.
// A local-qualification beta has none: its update feed is on loopback and a
// fresh profile has no Sync. The network log shows Chromium's own requests
// only; Sparkle and macOS frameworks are covered by the pf log alone.
//
//   node analyze-beta.mjs RESULTS [--allow HOST ...] > report.json
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parsePflog, parseNettop, ownersOf} from './analyze.mjs';
import {PROBE_HOST} from './beta-scenarios.mjs';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const LOCAL = /^(22[4-9]|23\d)\.|^169\.254\.|^ff0|^fe80:/i;
const BLANC = /^Blanc /;

// Every host a Chromium network log names, with a count. Tolerates a log cut
// short when the browser was stopped (its closing brackets missing).
export function netlogHosts(text) {
  let data;
  const trimmed = text.trim().replace(/,\s*$/, '');
  for (const candidate of [trimmed, trimmed + ']}', trimmed + '}]}']) {
    try { data = JSON.parse(candidate); break; } catch {}
  }
  if (!data) throw Error('unreadable network log');
  const hosts = new Map();
  const add = value => {
    const m = typeof value === 'string' && /^(?:[a-z][a-z0-9+.-]*:\/\/)?(\[[^\]]+\]|[^/:?#\s]+)/i.exec(value);
    // "~NOTFOUND" is a --host-resolver-rules target (dry runs), not a host.
    if (m && !m[1].startsWith('~')) hosts.set(m[1].toLowerCase(), (hosts.get(m[1].toLowerCase()) ?? 0) + 1);
  };
  for (const e of data.events ?? []) for (const key of ['url', 'original_url', 'host']) add(e.params?.[key]);
  return hosts;
}

export function judgeBeta({controls, pflog, owners, run, scenarios, netlogs, allow = []}) {
  const problems = [], windows = [], missingRoute = [];
  for (const c of controls) {
    if (/ENETUNREACH|EHOSTUNREACH|EADDRNOTAVAIL/.test(c.outcome)) { missingRoute.push(c.name); continue; }
    const from = Date.parse(c.started) - 1000, to = Date.parse(c.finished) + 2000;
    windows.push([from, to]);
    if (!pflog.some(p => p.at >= from && p.at <= to && p.address === c.address && p.port === c.port))
      problems.push(`control ${c.name} (${c.address}:${c.port}) was not seen in the pf log: the run is invalid`);
  }
  if (!run || !(run.start < run.end)) problems.push('the run has no start and end time: the run is invalid');
  if (!owners?.size) problems.push('nettop saw no connections: the run is invalid');
  if (!scenarios?.length) problems.push('no beta scenarios ran: the run is invalid');
  const during = p => run && p.at >= run.start && p.at <= run.end;
  const background = new Map(), blanc = new Map();
  for (const p of pflog) {
    if (!during(p) || windows.some(([from, to]) => p.at >= from && p.at <= to)) continue;
    const {names, near} = ownersOf(owners, p.address);
    if (LOCAL.test(p.address) || (names.length && !names.some(n => BLANC.test(n)))) {
      const key = `${p.address} (${names.length ? (near ? 'near ' : '') + names.join(', ') : 'multicast or link-local'})`;
      background.set(key, (background.get(key) ?? 0) + 1);
    } else {
      const key = `${p.address}:${p.port} (${names.join(', ') || 'no process seen'})`;
      blanc.set(key, (blanc.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of blanc) problems.push(`${count} blocked attempt(s) during the run that a Blanc process could have made, to ${key}`);
  const allowed = new Set([...LOOPBACK, PROBE_HOST, ...allow]);
  const hosts = {};
  for (const s of scenarios ?? []) {
    const seen = netlogs[s.name];
    if (!seen) { problems.push(`${s.name}: no network log: the run is invalid`); continue; }
    if (!seen.has(PROBE_HOST)) problems.push(`${s.name}: the network log never names the probe host: the run is invalid`);
    hosts[s.name] = Object.fromEntries(seen);
    for (const [host, count] of seen) if (!allowed.has(host)) problems.push(`${s.name}: the beta tried to reach ${host} (${count} network log entries)`);
  }
  return {verdict: problems.length ? 'fail' : 'pass', problems, missingRoute, controls: controls.length,
    pflogLines: pflog.length, backgroundDuringRun: Object.fromEntries(background), netlogHosts: hosts,
    allowed: [...allowed], coverage: 'Chromium network stack via its network log; everything else (Sparkle, macOS frameworks) via the pf log only'};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [results, ...rest] = process.argv.slice(2);
  if (!results) throw Error('Usage: analyze-beta.mjs RESULTS [--allow HOST ...]');
  const allow = rest.filter((v, i) => rest[i - 1] === '--allow');
  const read = name => fs.readFileSync(path.join(results, name), 'utf8');
  const controls = ['controls-before.json', 'controls-after.json'].flatMap(name => {
    const data = JSON.parse(read(name));
    if (data.browserError) throw Error(`${name}: the browser controls did not run: ${data.browserError}`);
    return data.controls;
  });
  const steps = [...read('user.log').matchAll(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ) (.*)$/gm)];
  const run = steps.length > 1 ? {start: Date.parse(steps[0][1]), end: Date.parse(steps.at(-1)[1])} : null;
  const {scenarios} = JSON.parse(read('beta-scenarios.json'));
  const netlogs = Object.fromEntries(scenarios.map(s => [s.name, netlogHosts(read(s.netlog))]));
  const report = judgeBeta({controls, pflog: parsePflog(read('pflog.txt')), owners: parseNettop(read('nettop.csv')), run, scenarios, netlogs, allow});
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== 'pass') process.exitCode = 1;
}
