#!/usr/bin/env node
// The release-candidate readiness tracker's data (the "Blanc Chromium RC
// Readiness" dashboard): how far the fork is from a beta on par with
// shipping. Writes three JSON files:
//   cases.json         every shipping acceptance case with its latest result
//                      on macOS: the full baseline, overlaid by every later
//                      targeted run in --runs (newest wins), each case
//                      keeping the candidate and time it ran on
//   requirements.json  tracker.json's requirement rows with their stages per
//                      platform and their cases' latest results
//   gates.json         release gates outside the code, from STATUS.md
//   node chromium/tools/rc-readiness.mjs --baseline FULL.json --runs DIR --out DIR
// Latest-per-case mixes candidates; it is a progress measure, not a
// baseline (Bar A in STATUS.md stays the one-candidate record).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Shipping features the owner chose to leave to Chrome Web Store
// extensions (STATUS.md, 2026-11-02): their cases are approved divergences.
export const DIVERGENT_ROWS = new Set(['F38', 'F42']);

// Gates a beta needs beyond the code, each as STATUS.md or the tracker
// records it. Edit with STATUS.md.
export const GATES = [
  {gate: 'Fork signing and identity (F0.3)', status: 'Waiting on owner', note: 'The identity spike needs an internally signed build; signing waits for the owner\'s approval.'},
  {gate: 'Widevine VMP certification (X2)', status: 'Waiting on castLabs', note: 'A custom Chromium build needs castLabs\' commercial certification; NDA signed 2026-10-26, requirements not yet shared.'},
  {gate: 'Windows and Linux fork builds', status: 'Not started', note: 'No fork candidate exists for either platform yet.'},
  {gate: 'Distribution and updates (F22)', status: 'Not started', note: 'No fork release channel or updater yet.'},
  {gate: 'Full macOS run on the current candidate', status: 'Stale', note: 'The last full run was on macos-3f969a35b9f9f7ad (2026-11-01); later work is checked with targeted runs.'},
];

// tracker.json's stages, with the labels STATUS.md's Bar B gives them.
export const STAGE_LABELS = new Map([
  ['not-started', 'Not started'], ['research', 'Research only'], ['drafted', 'Drafted'], ['implemented', 'Implemented'],
  ['legacy-built-isolated', 'Built, isolated (legacy)'], ['legacy-integrated-partial', 'Integrated, partial (legacy)'],
  ['integrated', 'Integrated'], ['needs-recheck', 'Needs recheck'], ['verified', 'Verified'], ['release-ready', 'Release-ready'],
]);
const STAGE_ORDER = [...STAGE_LABELS.keys()];

// Latest result per case: the baseline, then each run in time order.
export function latestCases(baseline, runs) {
  const cases = new Map();
  // A targeted run lists every case; only those it executed are its news.
  const take = (run, at) => {
    for (const scenario of run.scenarios) for (const c of scenario.cases)
      if (run === baseline || c.executed) cases.set(c.id, {scenario, c, candidate: run.candidate, at});
  };
  take(baseline, baseline.at ?? null);
  for (const run of [...runs].sort((a, b) => a.at.localeCompare(b.at))) take(run, run.at);
  return [...cases.values()].map(({scenario, c, candidate, at}) => {
    const rows = scenario.featureRows ?? [];
    const divergent = rows.some(row => DIVERGENT_ROWS.has(row));
    return {
      case: c.id.replace(/^spec\/acceptance\//, ''),
      feature: path.basename(scenario.file, '.feature'),
      name: scenario.name,
      rows: rows.join(' '),
      result: divergent ? 'divergence' : c.result,
      candidate,
      ranAt: at,
    };
  }).sort((a, b) => a.case.localeCompare(b.case, 'en', {numeric: true}));
}

export function requirementRows(tracker, cases) {
  return tracker.rows.map(row => {
    const own = cases.filter(c => c.rows.split(' ').includes(row.id));
    const stage = platform => row.platformProgress?.[platform]?.stage ?? 'not-started';
    return {
      id: row.id, requirement: row.requirement, slice: row.slice,
      macos: stage('macos'), windows: stage('windows'), linux: stage('linux'),
      macosLabel: STAGE_LABELS.get(stage('macos')) ?? stage('macos'),
      macosRank: STAGE_ORDER.indexOf(stage('macos')),
      casesPass: own.filter(c => c.result === 'pass').length,
      casesTotal: own.filter(c => c.result !== 'divergence').length,
    };
  });
}

function readRuns(dir, after) {
  const runs = [];
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name, 'baseline.json');
    if (!fs.existsSync(file)) continue;
    const time = fs.statSync(file).mtime;
    if (time <= after) continue;
    const run = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (run.platform !== 'macos' || !Array.isArray(run.scenarios)) continue;
    runs.push({...run, at: time.toISOString()});
  }
  return runs;
}

if (process.argv[1]?.endsWith('rc-readiness.mjs')) {
  const arg = name => process.argv[process.argv.indexOf(name) + 1];
  const [baselineFile, runsDir, out] = ['--baseline', '--runs', '--out'].map(arg);
  if (!baselineFile || !runsDir || !out) throw Error('Usage: rc-readiness.mjs --baseline FULL.json --runs DIR --out DIR');
  const baselineTime = fs.statSync(baselineFile).mtime;
  const baseline = {...JSON.parse(fs.readFileSync(baselineFile, 'utf8')), at: baselineTime.toISOString()};
  const cases = latestCases(baseline, readRuns(runsDir, baselineTime));
  const tracker = JSON.parse(fs.readFileSync(path.join(root, 'tracker.json'), 'utf8'));
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'cases.json'), JSON.stringify(cases));
  fs.writeFileSync(path.join(out, 'requirements.json'), JSON.stringify(requirementRows(tracker, cases)));
  fs.writeFileSync(path.join(out, 'gates.json'), JSON.stringify(GATES));
  const count = result => cases.filter(c => c.result === result).length;
  console.log(JSON.stringify({cases: cases.length, pass: count('pass'), fail: count('fail'),
    undefined: count('undefined'), divergence: count('divergence'), excluded: count('excluded')}));
}
