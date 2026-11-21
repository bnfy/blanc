// Outbound-isolation verdict (S1.1): reads one run's results folder and
// decides it. Valid only if every negative control appears in the pf log.
// Passes only if the proxy log names nothing but the selected engines and the
// sites the scenarios themselves visit, the pf log has no blocked attempt
// during the run outside a control that a Blanc process could have made, and
// the leak probe passed. pf can match only by user, so the test account's own
// macOS services are blocked too: a block during the run is that background
// only if nettop saw another process, and no Blanc process, connect to its
// address (or the address is multicast or link-local). nettop samples once a
// second and can miss a short attempt, so an address nobody was seen using
// takes the owners of its /24 (IPv6: /64) instead; a block with no owner even
// there fails the run.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENGINE_HOSTS = ['duckduckgo.com', 'www.google.com', 'www.bing.com', 'api.bing.com', 'search.brave.com', 'kagi.com'];
const LOCAL = /^(22[4-9]|23\d)\.|^169\.254\.|^ff0|^fe80:/i;
const BLANC = /^Blanc /;

// tcpdump -tttt on pflog0: "YYYY-MM-DD HH:MM:SS.us rule …: block out on en0: SRC > DST: …".
export function parsePflog(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+) .*? > ([0-9a-fA-F:.]+)\.(\d+): /.exec(line);
    if (m) out.push({at: new Date(m[1].replace(' ', 'T')).getTime(), address: m[2], port: Number(m[3]), line});
  }
  return out;
}

// nettop -L 0 -n -x: a process line ("time,name.pid,…") is followed by its
// flows ("time,tcp4 local:port<->remote:port,…"; IPv6 ports follow a dot).
// Returns each remote address with the names of the processes seen using it.
export function parseNettop(text) {
  const owners = new Map();
  let process = null;
  for (const line of text.split('\n')) {
    const field = line.split(',')[1] ?? '';
    const flow = /^(?:tcp|udp)[46] \S+<->(\S+)$/.exec(field);
    if (flow) {
      if (!process) continue;
      const remote = flow[1].replace(/%[^.]+/, '').replace(/[.:](\d+|\*)$/, '');
      if (remote === '*') continue;
      if (!owners.has(remote)) owners.set(remote, new Set());
      owners.get(remote).add(process);
    } else if (/^.+\.\d+$/.test(field)) {
      process = field.replace(/\.\d+$/, '');
    }
  }
  return owners;
}

// The owners of an address, or failing that of its /24 (IPv6: /64), and
// whether they came from the network rather than the address itself.
const networkOf = a => a.includes(':') ? a.split(':').slice(0, 4).join(':') : a.split('.').slice(0, 3).join('.');
export function ownersOf(owners, address) {
  if (owners?.has(address)) return {names: [...owners.get(address)], near: false};
  const names = new Set();
  for (const [other, who] of owners ?? []) if (networkOf(other) === networkOf(address)) for (const n of who) names.add(n);
  return {names: [...names], near: names.size > 0};
}

export function hostOf(target) {
  try { return /^[a-z]+:\/\//i.test(target) ? new URL(target).hostname : target.replace(/:\d+$/, '').replace(/^\[|\]$/g, ''); } catch { return target; }
}

// The sites a scenario itself sends the browser to: addresses in its text,
// bare domains it types, and where each bang it types goes (built-in bangs
// through shipping's catalog; steps may list bang codes as quoted strings).
export function scenarioHostsFrom({features, steps, catalog}) {
  const hosts = new Set();
  for (const m of features.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.add(m[1].toLowerCase());
  for (const m of features.matchAll(/"([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})"/gi)) hosts.add(m[1].toLowerCase());
  const codes = new Set([...features.matchAll(/!([a-z0-9]+)/gi)].map(m => m[1].toLowerCase()));
  for (const m of steps.matchAll(/for \(const code of \[([^\]]*)\]\)/g))
    for (const c of m[1].matchAll(/'([a-z0-9]+)'/g)) codes.add(c[1]);
  for (const [code, aliases, , , url] of catalog)
    if ([code, ...aliases].some(c => codes.has(c))) hosts.add(new URL(url.replace('%s', 'q')).hostname);
  return [...hosts];
}

export function judge({controls, pflog, egress, leak, scenarioHosts, run, owners}) {
  const problems = [];
  const windows = [];
  const missingRoute = [];
  for (const c of controls) {
    if (/ENETUNREACH|EHOSTUNREACH|EADDRNOTAVAIL/.test(c.outcome)) { missingRoute.push(c.name); continue; }
    const from = Date.parse(c.started) - 1000, to = Date.parse(c.finished) + 2000;
    windows.push([from, to]);
    if (!pflog.some(p => p.at >= from && p.at <= to && p.address === c.address && p.port === c.port))
      problems.push(`control ${c.name} (${c.address}:${c.port}) was not seen in the pf log: the run is invalid`);
  }
  if (!run || !(run.start < run.end)) problems.push('the run has no start and end time: the run is invalid');
  if (!owners?.size) problems.push('nettop saw no connections: the run is invalid');
  const during = p => run && p.at >= run.start && p.at <= run.end;
  const background = new Map();
  const unexplained = new Map();
  for (const p of pflog) {
    if (!during(p) || windows.some(([from, to]) => p.at >= from && p.at <= to)) continue;
    const {names, near} = ownersOf(owners, p.address);
    if (LOCAL.test(p.address) || (names.length && !names.some(n => BLANC.test(n)))) {
      const key = `${p.address} (${names.length ? (near ? 'near ' : '') + names.join(', ') : 'multicast or link-local'})`;
      background.set(key, (background.get(key) ?? 0) + 1);
    } else {
      const key = `${p.address}:${p.port} (${names.join(', ') || 'no process seen'})`;
      unexplained.set(key, (unexplained.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of unexplained) problems.push(`${count} blocked attempt(s) during the run outside every control to ${key}`);
  const allowed = new Set([...ENGINE_HOSTS, ...scenarioHosts]);
  const hosts = new Map();
  for (const r of egress) hosts.set(hostOf(r.target), (hosts.get(hostOf(r.target)) ?? 0) + 1);
  for (const [host, count] of hosts) if (!allowed.has(host)) problems.push(`proxy saw ${count} request(s) to ${host}, not an engine or a scenario site`);
  if (leak?.status !== 'passed') problems.push(`leak probe ${leak?.status ?? 'missing'}: ${leak?.error ?? ''}`);
  return {verdict: problems.length ? 'fail' : 'pass', problems, missingRoute, egressHosts: Object.fromEntries(hosts),
    pflogLines: pflog.length, controls: controls.length, outsideRun: pflog.filter(p => !during(p)).length,
    backgroundDuringRun: Object.fromEntries(background)};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = process.argv[2];
  if (!results) throw Error('Usage: analyze.mjs results-folder');
  const read = name => fs.readFileSync(path.join(results, name), 'utf8');
  const json = name => JSON.parse(read(name));
  const controls = ['controls-before.json', 'controls-after.json'].flatMap(name => {
    const data = json(name);
    if (data.browserError) throw Error(`${name}: the browser controls did not run: ${data.browserError}`);
    return data.controls;
  });
  const egress = read('egress.jsonl').split('\n').filter(Boolean).map(l => JSON.parse(l));
  // The scenarios are shipping's, read from its release commit as the runner does.
  const {shippingCommit} = JSON.parse(fs.readFileSync(path.join(root, 'scenarios/inventory.json'), 'utf8'));
  const show = file => execFileSync('git', ['show', `${shippingCommit}:${file}`], {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  const features = ['navigation-and-context-menu', 'island-and-commands'].map(f => show(`spec/acceptance/${f}.feature`)).join('\n');
  const sandbox = {};
  vm.runInNewContext(show('src/renderer/pages/bangs-catalog.js'), {window: sandbox});
  const scenarioHosts = scenarioHostsFrom({features, steps: show('test/desktop/steps/bangs.steps.js'), catalog: sandbox.BangsCatalog});
  // user.sh's log: "<UTC ISO time> <step>" per step, the last one "Done".
  const steps = [...read('user.log').matchAll(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ) (.*)$/gm)];
  const run = steps.length > 1 && /^Done/.test(steps.at(-1)[2])
    ? {start: Date.parse(steps[0][1]) - 1000, end: Date.parse(steps.at(-1)[1]) + 5000} : null;
  const report = judge({controls, pflog: parsePflog(read('pflog.txt')), egress, leak: json('leak.json'), scenarioHosts, run,
    owners: parseNettop(read('nettop.csv'))});
  fs.writeFileSync(path.join(results, 'verdict.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== 'pass') process.exitCode = 1;
}
