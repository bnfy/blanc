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
  {gate: 'Beta signing and notarization', status: 'Waiting on owner', note: 'Identity approved (Blanc Beta, me.bnfy.blanc.beta, 2.0.0-beta.N). Developer ID signing, the beta provisioning profile, notarization and the production update key are owner steps.'},
  {gate: 'Dedicated beta build', status: 'Waiting on owner (on hold)', note: 'The owner held it again on 2026-11-13 at about 1,300 of 40,000 remaining steps, after the hold was lifted and the Metal Toolchain installed; its cache is kept, so it resumes incrementally. The first public beta is built from the final source, with every fix so far: Glance commands over a split, About in the Settings sheet, the app menu and Chromium text naming Blanc, shipping\'s exact resting Island geometry, the Extensions panel over the floating Island, and the one Start Page with optional widgets readable on any wallpaper (V24). Local beta versions are never reused, so it is beta.3 or later.'},
  {gate: 'Distribution and updates (F22)', status: 'Waiting on the beta build', note: 'Release tooling and the Sparkle 2.10.1 feed design are merged. local-update-proof.mjs (2026-11-13) stages beta.1 and beta.2, signs a loopback feed with a throwaway key and checks the install, a wrong key and a tampered download; it runs once both local builds exist. Its acceptance case stays undefined until then.'},
  {gate: 'Sync on production', status: 'Waiting on owner', note: 'The local Sync gate passes 22 of 22 against the test Worker. A production pass with a real iPhone and the real Keychain has not been run.'},
  {gate: 'Touch ID passkeys', status: 'Waiting on a signed build', note: 'The private-tab passkey ceremony needs signed entitlements and the owner at the keyboard; its acceptance case stays undefined.'},
  {gate: 'Full macOS run on the current candidate', status: 'Done (one shipping test is stale)', note: 'Full run against shipping main 8a4e57e78 (unreleased 1.49.0) on macos-19c5d5e4546d8b41 (2026-11-12): 628 pass, 2 fail, 3 undefined, 28 excluded, in 54 minutes. newtab-layouts :21 fails because shipping\'s step still expects the text tile faces #931 replaced (shipping\'s own reader fails the same way); vertical-tabs :58 is a drag-timing flake that passes 3 of 3 on rerun.'},
  {gate: 'Widevine VMP certification (X2)', status: 'Waiting on castLabs', note: 'A custom Chromium build needs castLabs\' commercial certification; NDA signed 2026-10-26, requirements not yet shared. Beta 1 ships without Widevine.'},
  {gate: 'Intel Mac build', status: 'Done for beta 1 (waived)', note: 'Beta 1 is Apple Silicon only, with the waiver recorded.'},
  {gate: 'Windows and Linux fork builds', status: 'Not started', note: 'No fork candidate exists for either platform yet.'},
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

// A run's time and its results, from one open of the file, so they always
// describe the same file. Null when the run wrote no results.
export function readTimedJson(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
  try {
    return {time: fs.fstatSync(fd).mtime, data: JSON.parse(fs.readFileSync(fd, 'utf8'))};
  } finally {
    fs.closeSync(fd);
  }
}

function readRuns(dir, after) {
  const runs = [];
  for (const name of fs.readdirSync(dir)) {
    const read = readTimedJson(path.join(dir, name, 'baseline.json'));
    if (!read || read.time <= after) continue;
    const run = read.data;
    if (run.platform !== 'macos' || !Array.isArray(run.scenarios)) continue;
    runs.push({...run, at: read.time.toISOString()});
  }
  return runs;
}

if (process.argv[1]?.endsWith('rc-readiness.mjs')) {
  const arg = name => process.argv[process.argv.indexOf(name) + 1];
  const [baselineFile, runsDir, out] = ['--baseline', '--runs', '--out'].map(arg);
  if (!baselineFile || !runsDir || !out) throw Error('Usage: rc-readiness.mjs --baseline FULL.json --runs DIR --out DIR');
  const read = readTimedJson(baselineFile);
  if (!read) throw Error(`No full baseline at ${baselineFile}`);
  const baseline = {...read.data, at: read.time.toISOString()};
  const cases = latestCases(baseline, readRuns(runsDir, read.time));
  const tracker = JSON.parse(fs.readFileSync(path.join(root, 'tracker.json'), 'utf8'));
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'cases.json'), JSON.stringify(cases));
  fs.writeFileSync(path.join(out, 'requirements.json'), JSON.stringify(requirementRows(tracker, cases)));
  fs.writeFileSync(path.join(out, 'gates.json'), JSON.stringify(GATES));
  const count = result => cases.filter(c => c.result === result).length;
  console.log(JSON.stringify({cases: cases.length, pass: count('pass'), fail: count('fail'),
    undefined: count('undefined'), divergence: count('divergence'), excluded: count('excluded')}));
}
