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
  {gate: 'Beta signing and notarization', status: 'Waiting on owner (key made; backup pending)', note: 'Identity approved (Blanc Beta, me.bnfy.blanc.beta, 2.0.0-beta.N). Developer ID signing, the beta provisioning profile, notarization and the production update key are owner steps.'},
  {gate: 'Dedicated beta build', status: 'Built (beta.2, unsigned)', note: 'The 2.0.0-beta.2 (build 2) production build exists (2026-11-14): production update key, local qualification off, blanc.day feed. Its blocker, no-test-hooks, profile-separation, notices and outbound checks pass. Next: the owner\'s 1Password backup of the update key, then Developer ID signing and notarization.'},
  {gate: 'Distribution and updates (F22)', status: 'Local proof done', note: 'local-update-proof.mjs (2026-11-14): an installed local beta.1 found beta.2 on a loopback feed, downloaded it and installed it at quit; with the update signed by another key, or with one byte changed after signing, it downloaded and refused, staying at build 1. Ad-hoc signed copies and a throwaway key; the signed production feed and Developer ID path need the key ceremony and the beta.2 production build.'},
  {gate: 'Notices, credits and SBOM', status: 'Done (local beta)', note: 'sbom_scan.py and sbom.mjs build the CycloneDX SBOM (349 components) and NOTICES.txt from Chromium\'s own licence metadata. The beta ships its own notice (fork-notice.mjs), which also credits one component Chromium\'s credits page misses. The audit passed on the rebuilt local-qualification beta (2026-11-13); the production beta.2 build needs its own run.'},
  {gate: 'Blocker in the packaged beta', status: 'Done (local beta)', note: 'The beta embeds the pinned blocker engine and uses it with no development switch. blocker-evidence.mjs (2026-11-14) writes the gate evidence: on the local-qualification beta, ordinary and private windows blocked two EasyList hosts while the page loaded, and copies with a changed or missing engine let nothing through (loopback only). The production beta.2 build needs its own run.'},
  {gate: 'Outbound isolation (beta)', status: 'Done (beta.2 build)', note: 'The beta.2 production build, run as a person runs it under the owner-approved pf block for a test user (startup and idle, a relaunch, a private window), sent nothing off the Mac beyond the test page\'s own probe lookups, and Chromium\'s network log named no outside host (2026-11-14). The local-qualification build passed earlier the same day.'},
  {gate: 'No test hooks in the beta', status: 'Done (local beta)', note: 'hooks-evidence.mjs (2026-11-14): no test or research switch name in any of the beta\'s 21 binaries, and with every test switch passed the beta behaved normally. The audit first found four --blanc-test reads outside the test-hooks build flag; they are now compiled out of beta and release builds.'},
  {gate: 'Profile separation', status: 'Done (local beta)', note: 'profile-evidence.mjs (2026-11-14): the beta keeps to its own Blanc Beta folder, and refuses all nine attempts to use the Electron app\'s, the release fork\'s or the preview\'s folders (including a symlink alias, a cache folder, a climbing profile name and an unattended import), leaving decoys of them byte for byte unchanged.'},
  {gate: 'Desktop Sync (beta, local)', status: 'Done (local beta)', note: 'beta-sync.mjs (2026-11-14): the beta\'s own Settings → Sync, with no test hooks, against the local Worker: Sync turned on, an independent peer running the iPhone\'s Sync code paired with the code shown, and with tab sharing on it saw the beta\'s open page. All requests stayed on the Mac.'},
  {gate: 'Hosted smoke check', status: 'Ready (runs after publication)', note: 'chromium-beta-smoke.yml + public-smoke.mjs (2026-11-14): on a GitHub-hosted Apple Silicon Mac, from the release\'s own tag, a logged-out download of every asset, the manifest, checksums and appcast signatures, GitHub\'s pre-release state, the signed DMG through verify.mjs, a launch, and optionally the live feed. Dispatchable once it reaches main.'},
  {gate: 'Sync on production', status: 'Waiting on owner', note: 'The local Sync gate passes 22 of 22 against the test Worker. A production pass with a real iPhone and the real Keychain has not been run.'},
  {gate: 'Touch ID passkeys', status: 'Waiting on a signed build', note: 'The private-tab passkey ceremony needs signed entitlements and the owner at the keyboard; its acceptance case stays undefined.'},
  {gate: 'Full macOS run on the current candidate', status: 'Done', note: 'Full run against shipping main 8a4e57e78 on macos-656ae5d81449fec2 (2026-11-13, the final source): 629 pass, 1 fail, 3 undefined, 28 excluded, in 54 minutes. The failure, internal-pages :7, read the week\'s blocked count from the footer, which shipping shows only in Ledger; since V24 the count is the line under Billboard\'s clock, and the fork\'s step now reads it there (passes). newtab-layouts :21 passes, run as shipping corrected it (#1491).'},
  {gate: 'Widevine VMP certification (X2)', status: 'Waiting on castLabs', note: 'A custom Chromium build needs castLabs\' commercial certification; NDA signed 2026-10-26, requirements not yet shared. Beta 1 ships without Widevine.'},
  {gate: 'Protected-video notice (no-drm-handoff)', status: 'Waived for beta.2', note: 'The notice that a site needs Electron Blanc for protected video, with an Open in Blanc action, is not built. The owner waived the gate for 2.0.0-beta.2 only (2026-11-14): protected video simply fails to play in it. Due in beta.3; only this gate and release can be waived.'},
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
