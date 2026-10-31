import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const platforms = [['macos', 'macOS'], ['windows', 'Windows'], ['linux', 'Linux']];
const stages = [
  ['not-started', 'Not started / unassessed'], ['research', 'Research only'],
  ['drafted', 'Drafted'], ['implemented', 'Implemented'],
  ['legacy-built-isolated', 'Built, isolated (legacy)'],
  ['legacy-integrated-partial', 'Integrated, partial (legacy)'],
  ['integrated', 'Integrated'], ['verified', 'Verified'], ['release-ready', 'Release-ready'],
];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

export function renderProgress(tracker, loadBaseline = () => null) {
  if (new Set(tracker.rows.map(r => r.id)).size !== tracker.rows.length) throw Error('Duplicate requirement rows');
  const counts = Object.fromEntries(platforms.map(([p]) => [p, Object.fromEntries(stages.map(([s]) => [s, 0]))]));
  for (const row of tracker.rows) for (const [p] of platforms) {
    const stage = row.platformProgress?.[p]?.stage;
    if (!(stage in counts[p])) throw Error(`Missing/unknown ${p} stage for ${row.id}`);
    counts[p][stage]++;
    if (['verified', 'release-ready'].includes(stage) && !row.platformVerification?.[p]) throw Error(`Missing verification for ${row.id}/${p}`);
  }
  const lines = ['### Bar A — shipping scenarios on the fork', '', '| Platform | Current-candidate baseline |', '| --- | --- |'];
  for (const [p, name] of platforms) {
    const candidate = tracker.currentCandidates?.[p];
    const ref = tracker.baselines?.[p];
    const baseline = ref ? loadBaseline(ref) : null;
    let status = 'Not run';
    if (baseline) {
      if (baseline.candidate !== candidate?.id || baseline.platform !== p || baseline.shippingCommit !== tracker.shippingCommit) {
        status = 'Not run for current candidate (previous baseline is stale)';
      } else {
        const seen = new Set();
        let pass = 0, eligible = 0, excluded = 0;
        for (const s of baseline.scenarios) {
          if (seen.has(s.id)) throw Error('Duplicate baseline scenario');
          seen.add(s.id);
          if (!s.featureRows?.length || s.featureRows.some(id => !tracker.rows.some(r => r.id === id))) throw Error('Unmapped baseline scenario');
          if (s.result === 'excluded') { if (!s.exclusionReason) throw Error('Unexplained exclusion'); excluded++; continue; }
          if (!['pass', 'fail', 'not-run', 'undefined'].includes(s.result)) throw Error('Unknown scenario result');
          eligible++; if (s.result === 'pass') pass++;
        }
        if (!Array.isArray(tracker.scenarioIds) || tracker.scenarioIds.length !== seen.size || tracker.scenarioIds.some(id => !seen.has(id))) throw Error('Baseline does not cover the full shipping scenario inventory');
        status = `${pass}/${eligible} pass; ${excluded} excluded — [baseline](${ref})`;
      }
    }
    lines.push(`| ${name} | ${status} |`);
  }
  lines.push('', '578 shipping scenario declarations are inventoried; inventory is not a fork run.',
    '', '### Bar B — requirement rows by platform', '', '| State | macOS | Windows | Linux |', '| --- | ---: | ---: | ---: |');
  for (const [stage, label] of stages) lines.push(`| ${label} | ${platforms.map(([p]) => counts[p][stage]).join(' | ')} |`);
  lines.push(`| Total | ${platforms.map(() => tracker.rows.length).join(' | ')} |`, '',
    'Legacy macOS stages come from the approved spec; they await verification on the canonical candidate. No legacy stage counts as Verified.', '',
    'Candidate identities: ' + platforms.map(([p, label]) => `${label}: ${tracker.currentCandidates?.[p]?.id || 'none'}`).join('; ') + '.');
  return lines.join('\n');
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const trackerFile = path.join(root, 'tracker.json');
  const statusFile = path.join(root, 'STATUS.md');
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--check' && !a.startsWith('--candidate-from-output=') && !a.startsWith('--slice-boundary='))) throw Error('Unknown argument');
  if (args.includes('--check') && args.some(a => a.startsWith('--candidate-from-output=') || a.startsWith('--slice-boundary='))) throw Error('Check cannot update candidate');
  const tracker = JSON.parse(fs.readFileSync(trackerFile));
  const slice = args.find(a => a.startsWith('--slice-boundary='))?.slice('--slice-boundary='.length);
  if (slice) {
    if (!/^[A-Z][A-Z0-9.]*$/.test(slice)) throw Error('Invalid slice identifier');
    tracker.currentSlice = slice;
    fs.writeFileSync(trackerFile, JSON.stringify(tracker, null, 2) + '\n');
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
    fs.writeFileSync(trackerFile, JSON.stringify(tracker, null, 2) + '\n');
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
