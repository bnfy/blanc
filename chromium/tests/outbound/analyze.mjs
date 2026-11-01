// Outbound-isolation verdict (S1.1): reads one run's results folder and
// decides it. Valid only if every negative control appears in the pf log.
// Passes only if the proxy log names nothing but the selected engines and the
// sites the scenarios themselves visit, the pf log has no blocked attempt
// outside a control, and the leak probe passed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENGINE_HOSTS = ['duckduckgo.com', 'www.google.com', 'www.bing.com', 'api.bing.com', 'search.brave.com', 'kagi.com'];

// tcpdump -tttt on pflog0: "YYYY-MM-DD HH:MM:SS.us rule …: block out on en0: SRC > DST: …".
export function parsePflog(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+) .*? > ([0-9a-fA-F:.]+)\.(\d+): /.exec(line);
    if (m) out.push({at: new Date(m[1].replace(' ', 'T')).getTime(), address: m[2], port: Number(m[3]), line});
  }
  return out;
}
export function hostOf(target) {
  try { return /^[a-z]+:\/\//i.test(target) ? new URL(target).hostname : target.replace(/:\d+$/, '').replace(/^\[|\]$/g, ''); } catch { return target; }
}

export function judge({controls, pflog, egress, leak, scenarioHosts}) {
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
  const unexplained = pflog.filter(p => !windows.some(([from, to]) => p.at >= from && p.at <= to));
  for (const p of unexplained) problems.push(`blocked attempt outside every control: ${p.line}`);
  const allowed = new Set([...ENGINE_HOSTS, ...scenarioHosts]);
  const hosts = new Map();
  for (const r of egress) hosts.set(hostOf(r.target), (hosts.get(hostOf(r.target)) ?? 0) + 1);
  for (const [host, count] of hosts) if (!allowed.has(host)) problems.push(`proxy saw ${count} request(s) to ${host}, not an engine or a scenario site`);
  if (leak?.status !== 'passed') problems.push(`leak probe ${leak?.status ?? 'missing'}: ${leak?.error ?? ''}`);
  return {verdict: problems.length ? 'fail' : 'pass', problems, missingRoute, egressHosts: Object.fromEntries(hosts),
    pflogLines: pflog.length, controls: controls.length};
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
  const features = ['navigation-and-context-menu', 'island-and-commands'].map(f => fs.readFileSync(path.join(root, `spec/acceptance/${f}.feature`), 'utf8')).join('\n');
  const scenarioHosts = [...features.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(m => m[1].toLowerCase());
  const report = judge({controls, pflog: parsePflog(read('pflog.txt')), egress, leak: json('leak.json'), scenarioHosts});
  fs.writeFileSync(path.join(results, 'verdict.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== 'pass') process.exitCode = 1;
}
