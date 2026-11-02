// Outbound-isolation verdict (S1.1): reads one run's results folder and
// decides it. Valid only if every negative control appears in the pf log.
// Passes only if the proxy log names nothing but the selected engines and the
// sites the scenarios themselves visit, the pf log has no blocked attempt
// during the run outside a control, and the leak probe passed. pf can match
// only by user, so the test account's own macOS services are blocked too:
// blocks before the run starts or after it ends are that background, and a
// block during the run to an address that background also reached (or to a
// multicast or link-local address) is reported as background, not a failure.
// A control's address never counts as background, and blocks from an
// earlier attempt (after the first attempt began, before this run) count as
// neither: they may be that attempt's browser.
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

const LOCAL = /^(22[4-9]|23\d)\.|^169\.254\.|^ff0|^fe80:/i;

export function judge({controls, pflog, egress, leak, scenarioHosts, run, firstStart = run?.start}) {
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
  const during = p => run && p.at >= run.start && p.at <= run.end;
  const controlAddresses = new Set(controls.map(c => c.address));
  const idle = p => run && (p.at < Math.min(firstStart, run.start) || p.at > run.end);
  const seenIdle = new Set(pflog.filter(p => idle(p) && !controlAddresses.has(p.address)).map(p => p.address));
  const background = new Map();
  for (const p of pflog) {
    if (!during(p) || windows.some(([from, to]) => p.at >= from && p.at <= to)) continue;
    if (seenIdle.has(p.address) || LOCAL.test(p.address))
      background.set(p.address, (background.get(p.address) ?? 0) + 1);
    else problems.push(`blocked attempt during the run outside every control: ${p.line}`);
  }
  const allowed = new Set([...ENGINE_HOSTS, ...scenarioHosts]);
  const hosts = new Map();
  for (const r of egress) hosts.set(hostOf(r.target), (hosts.get(hostOf(r.target)) ?? 0) + 1);
  for (const [host, count] of hosts) if (!allowed.has(host)) problems.push(`proxy saw ${count} request(s) to ${host}, not an engine or a scenario site`);
  if (leak?.status !== 'passed') problems.push(`leak probe ${leak?.status ?? 'missing'}: ${leak?.error ?? ''}`);
  return {verdict: problems.length ? 'fail' : 'pass', problems, missingRoute, egressHosts: Object.fromEntries(hosts),
    pflogLines: pflog.length, controls: controls.length, idleBlocks: pflog.filter(idle).length,
    earlierAttemptBlocks: pflog.filter(p => !idle(p) && !during(p)).length,
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
  const features = ['navigation-and-context-menu', 'island-and-commands'].map(f => fs.readFileSync(path.join(root, `spec/acceptance/${f}.feature`), 'utf8')).join('\n');
  const scenarioHosts = [...features.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(m => m[1].toLowerCase());
  // user.sh's log: "<UTC ISO time> <step>" per step, the last one "Done".
  const steps = [...read('user.log').matchAll(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ) (.*)$/gm)];
  const run = steps.length > 1 && /^Done/.test(steps.at(-1)[2])
    ? {start: Date.parse(steps[0][1]) - 1000, end: Date.parse(steps.at(-1)[1]) + 5000} : null;
  const starts = [...read('runs.log').matchAll(/^(\S+Z) start$/gm)].map(m => Date.parse(m[1]) - 1000);
  if (!starts.length) throw Error('runs.log has no start: run user.sh');
  const report = judge({controls, pflog: parsePflog(read('pflog.txt')), egress, leak: json('leak.json'), scenarioHosts, run,
    firstStart: Math.min(...starts)});
  fs.writeFileSync(path.join(results, 'verdict.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== 'pass') process.exitCode = 1;
}
