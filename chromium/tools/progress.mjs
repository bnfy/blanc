import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { candidateId as linuxCandidateId } from '../linux/candidate.mjs';

const desktopPlatforms = [['macos', 'macOS'], ['windows', 'Windows'], ['linux', 'Linux']];
// Android is the companion lane: it has its own Bar B column, and Bar A counts
// desktop's shipping cases, which Android doesn't run.
const platforms = [...desktopPlatforms, ['android', 'Android']];
const stages = [
  ['not-started', 'Not started / unassessed'], ['research', 'Research only'],
  ['drafted', 'Drafted'], ['implemented', 'Implemented'],
  ['legacy-built-isolated', 'Built, isolated (legacy)'],
  ['legacy-integrated-partial', 'Integrated, partial (legacy)'],
  ['integrated', 'Integrated'], ['needs-recheck', 'Verification needs recheck'], ['verified', 'Verified'], ['release-ready', 'Release-ready'],
];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

export function renderProgress(tracker, loadBaseline = () => null) {
  if (new Set(tracker.rows.map(r => r.id)).size !== tracker.rows.length) throw Error('Duplicate requirement rows');
  const counts = Object.fromEntries(platforms.map(([p]) => [p, Object.fromEntries(stages.map(([s]) => [s, 0]))]));
  for (const row of tracker.rows) for (const [p] of platforms) {
    let stage = row.platformProgress?.[p]?.stage;
    if (!(stage in counts[p])) throw Error(`Missing/unknown ${p} stage for ${row.id}`);
    if (['verified', 'release-ready'].includes(stage)) {
      const evidence = row.platformVerification?.[p];
      if (!evidence || typeof evidence !== 'object' || !evidence.candidate || !evidence.shippingCommit) throw Error(`Missing verification for ${row.id}/${p}`);
      if (evidence.candidate !== tracker.currentCandidates?.[p]?.id || evidence.shippingCommit !== tracker.shippingCommit) stage = 'needs-recheck';
    }
    counts[p][stage]++;
  }
  const caseTotal = Object.values(tracker.scenarioCases || {}).reduce((n, cases) => n + cases.length, 0);
  const lines = ['### Bar A — executable shipping cases on the fork', '', '| Platform | Current-candidate baseline |', '| --- | --- |'];
  for (const [p, name] of desktopPlatforms) {
    const candidate = tracker.currentCandidates?.[p];
    const ref = tracker.baselines?.[p];
    const baseline = ref ? loadBaseline(ref) : null;
    let status = `Not run (${caseTotal} cases)`;
    if (baseline) {
      const executableSha256 = p === 'linux' ? candidate?.exeSha256 : candidate?.executableSha256;
      if (baseline.candidate !== candidate?.id || baseline.platform !== p || baseline.shippingCommit !== tracker.shippingCommit || (candidate?.frameworkSha256 && baseline.candidateIdentity?.frameworkSha256 !== candidate.frameworkSha256) || (executableSha256 && baseline.candidateIdentity?.executableSha256 !== executableSha256)) {
        status = 'Not run for current candidate (previous baseline is stale)';
      } else {
        if (baseline.developmentSubset) throw Error('A development subset run is not a baseline');
        const seen = new Set();
        let pass = 0, excluded = 0, failed = 0, undefinedCases = 0, recordedCases = 0;
        // Rows whose slice the tracker names as S1 (including S1–S5 and S1 security).
        const sliceRows = new Set(tracker.rows.filter(r => /^S1\b/.test(r.slice || '')).map(r => r.id));
        const slice = { pass: 0, fail: 0, undefined: 0, excluded: 0, cases: 0 };
        for (const s of baseline.scenarios) {
          if (seen.has(s.id)) throw Error('Duplicate baseline scenario');
          seen.add(s.id);
          if (!s.featureRows?.length || s.featureRows.some(id => !tracker.rows.some(r => r.id === id))) throw Error('Unmapped baseline scenario');
          const expectedCases = tracker.scenarioCases?.[s.id];
          const actualCases = s.cases?.map(c => c.id);
          if (!expectedCases || !actualCases || actualCases.length !== expectedCases.length || new Set(actualCases).size !== actualCases.length || expectedCases.some(id => !actualCases.includes(id))) throw Error('Incomplete scenario example coverage');
          if (s.cases.some(c => !['pass', 'fail', 'undefined', 'excluded', 'not-run'].includes(c.result))) throw Error('Unknown executable case result');
          const aggregate = s.cases.every(c => c.result === 'excluded') ? 'excluded' : s.cases.every(c => c.result === 'pass') ? 'pass' : s.cases.some(c => c.result === 'fail') ? 'fail' : 'undefined';
          if (aggregate !== s.result) throw Error('Scenario result disagrees with its executable cases');
          if (s.result === 'excluded' && !s.exclusionReason) throw Error('Unexplained exclusion');
          if (!['pass', 'fail', 'not-run', 'undefined', 'excluded'].includes(s.result)) throw Error('Unknown scenario result');
          const inSlice = s.featureRows.some(id => sliceRows.has(id));
          for (const c of s.cases) {
            recordedCases++;
            if (inSlice) { slice.cases++; slice[c.result === 'not-run' ? 'undefined' : c.result]++; }
            if (c.result === 'pass') pass++;
            else if (c.result === 'fail') failed++;
            else if (c.result === 'excluded') { if (!c.exclusionReason && !s.exclusionReason) throw Error('Unexplained case exclusion'); excluded++; }
            else undefinedCases++;
          }
        }
        if (!Array.isArray(tracker.scenarioIds) || tracker.scenarioIds.length !== seen.size || tracker.scenarioIds.some(id => !seen.has(id))) throw Error('Baseline does not cover the full shipping scenario inventory');
        if (recordedCases !== caseTotal) throw Error('Baseline executable-case count is incomplete');
        status = `${pass}/${caseTotal} executable cases pass; ${failed} failed; ${undefinedCases} undefined/not run; ${excluded} excluded — [baseline](${ref})`;
        if (slice.cases) status += `<br>S1 rows: ${slice.pass}/${slice.cases} pass; ${slice.fail} failed; ${slice.undefined} undefined; ${slice.excluded} excluded`;
      }
    }
    lines.push(`| ${name} | ${status} |`);
  }
  lines.push('', `${caseTotal} executable cases from ${tracker.scenarioIds?.length || 0} declarations. Exclusions stay visible in the fixed total; inventory is not a fork run.`,
    '', "Android's Bar A counts the shared scenarios bound in `chromium/tests/android/acceptance/` (A2, A3): 32 (F2–F8, F12, F18, and the phone-only F31-11 and F56-1–3), run on the build server's emulator by `run.sh`; desktop cases don't apply to it.",
    '', '### Bar B — requirement rows by platform', '', `| State | ${platforms.map(([, name]) => name).join(' | ')} |`, `| --- |${platforms.map(() => ' ---: |').join('')}`);
  for (const [stage, label] of stages) lines.push(`| ${label} | ${platforms.map(([p]) => counts[p][stage]).join(' | ')} |`);
  lines.push(`| Total | ${platforms.map(() => tracker.rows.length).join(' | ')} |`, '',
    'Legacy macOS stages come from the approved spec; they await verification on the canonical candidate. No legacy stage counts as Verified.', '',
    'Candidate identities: ' + platforms.map(([p, label]) => `${label}: ${tracker.currentCandidates?.[p]?.id || 'none'}`).join('; ') + '.');
  return lines.join('\n');
}

// The tracker's record of a Windows candidate, from the record its packaging
// step wrote (chromium/windows/package-candidate.mjs). The build server has
// no checkout of this tracker to write to, so the record is brought here.
// tracker.json is kept ASCII-only (non-ASCII as \uXXXX), as its other
// writers leave it, so a candidate update changes only the candidate.
export function trackerText(tracker) {
  return JSON.stringify(tracker, null, 2).replace(/[\u0080-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n';
}
export function windowsCandidate(record) {
  for (const key of ['id', 'exeSha256', 'dllSha256', 'version', 'treeCommit']) if (typeof record?.[key] !== 'string' || !record[key]) throw Error(`Windows candidate record has no ${key}`);
  if (!/^[0-9a-f]{64}$/.test(record.dllSha256) || !/^[0-9a-f]{64}$/.test(record.exeSha256) || record.id !== `windows-x64-${record.dllSha256.slice(0, 16)}`)
    throw Error('Windows candidate id does not match its chrome.dll hash');
  return { id: record.id, exeSha256: record.exeSha256, dllSha256: record.dllSha256, version: record.version, treeCommit: record.treeCommit,
    qualification: 'cross-compiled candidate; runtime acceptance pending' };
}
export function linuxCandidate(record) {
  for (const key of ['id', 'exeSha256', 'version', 'treeCommit']) {
    if (typeof record?.[key] !== 'string' || !record[key]) throw Error(`Linux candidate record has no ${key}`);
  }
  if (record.id !== linuxCandidateId(record.exeSha256, record.arch)) throw Error('Linux candidate id does not match its chrome hash');
  return { id: record.id, arch: record.arch ?? 'x64', exeSha256: record.exeSha256, version: record.version, treeCommit: record.treeCommit,
    qualification: 'compiled candidate; runtime acceptance pending' };
}
function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const trackerFile = path.join(root, 'tracker.json');
  const statusFile = path.join(root, 'STATUS.md');
  const args = process.argv.slice(2);
  const updates = ['--candidate-from-output=', '--windows-candidate=', '--linux-candidate=', '--slice-boundary='];
  if (args.some(a => a !== '--check' && !updates.some(u => a.startsWith(u)))) throw Error('Unknown argument');
  if (args.includes('--check') && args.some(a => updates.some(u => a.startsWith(u)))) throw Error('Check cannot update candidate');
  const tracker = JSON.parse(fs.readFileSync(trackerFile));
  const slice = args.find(a => a.startsWith('--slice-boundary='))?.slice('--slice-boundary='.length);
  if (slice) {
    if (!/^[A-Z][A-Z0-9.]*$/.test(slice)) throw Error('Invalid slice identifier');
    tracker.currentSlice = slice;
    fs.writeFileSync(trackerFile, trackerText(tracker));
  }
  const output = args.find(a => a.startsWith('--candidate-from-output='))?.slice('--candidate-from-output='.length);
  if (output) {
    const app = path.join(output, 'Blanc Prototype.app');
    const frameworkRoot = path.join(app, 'Contents/Frameworks/Blanc Prototype Framework.framework/Versions');
    const versions = fs.readdirSync(frameworkRoot).filter(x => /^\d+\./.test(x));
    if (versions.length !== 1) throw Error('Ambiguous framework version');
    const frameworkSha256 = hash(fs.readFileSync(path.join(frameworkRoot, versions[0], 'Blanc Prototype Framework')));
    const executableSha256 = hash(fs.readFileSync(path.join(app, 'Contents/MacOS/Blanc Prototype')));
    tracker.currentCandidates.macos = { id: `macos-${frameworkSha256.slice(0, 16)}`, frameworkSha256, executableSha256,
      version: versions[0], qualification: 'compiled candidate; runtime acceptance pending' };
    fs.writeFileSync(trackerFile, trackerText(tracker));
  }
  const windowsRecord = args.find(a => a.startsWith('--windows-candidate='))?.slice('--windows-candidate='.length);
  if (windowsRecord) {
    tracker.currentCandidates.windows = windowsCandidate(JSON.parse(fs.readFileSync(windowsRecord)));
    fs.writeFileSync(trackerFile, trackerText(tracker));
  }
  const linuxRecord = args.find(a => a.startsWith('--linux-candidate='))?.slice('--linux-candidate='.length);
  if (linuxRecord) {
    tracker.currentCandidates.linux = linuxCandidate(JSON.parse(fs.readFileSync(linuxRecord)));
    fs.writeFileSync(trackerFile, trackerText(tracker));
  }
  const generated = renderProgress(tracker, ref => JSON.parse(fs.readFileSync(path.resolve(root, ref))));
  const begin = '<!-- BEGIN GENERATED PROGRESS -->';
  const end = '<!-- END GENERATED PROGRESS -->';
  const status = fs.readFileSync(statusFile, 'utf8');
  const block = `${begin}\n${generated}\n${end}`;
  const next = status.includes(begin) ? status.replace(new RegExp(`${begin}[\\s\\S]*?${end}`), block) : `${status.trimEnd()}\n\n${block}\n`;
  if (args.includes('--check')) {
    if (status !== next) throw Error('STATUS progress is stale; run node chromium/tools/progress.mjs');
    console.log('Generated progress is current');
  } else fs.writeFileSync(statusFile, next);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
