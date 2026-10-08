import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const RESULTS = new Set(['pass', 'partial', 'unsupported', 'blocked', 'not-run']);
const CLASSIFICATIONS = new Set(['supported', 'defect', 'product-decision', 'unsupported-capability']);
export const CATEGORIES = [
  'oauth-return', 'external-app-return', 'focused-popup', 'camera', 'microphone',
  'screen-sharing', 'system-audio-sharing', 'passkeys', 'onepassword',
  'protected-media', 'ordinary-media', 'pwa', 'downloads', 'uploads', 'local-html',
  'default-browser', 'os-links', 'productivity-site', 'banking-site',
  'commerce-site', 'developer-site', 'media-site',
];
export const PLATFORMS = ['macOS/arm64', 'macOS/x64', 'Windows/x64', 'Linux/x64'];
const SHA = /^[a-f0-9]{40}$/;

function fail(message) { throw new Error(`compatibility manifest: ${message}`); }
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// Read the committed object, not a mutable working-tree file or arbitrary URL.
function evidenceText(ref, release, root) {
  if (!ref || typeof ref !== 'object' || !SHA.test(ref.commit ?? '')
      || typeof ref.path !== 'string' || (!/^(docs|test|scripts|src|\.github)\//.test(ref.path) && ref.path !== 'package.json')
      || ref.path.split('/').some(part => !part || part === '.' || part === '..')
      || /[\\:#\s]/.test(ref.path)) fail('evidence requires a safe repository path and full commit SHA');
  try {
    if (git(root, ['rev-parse', `${ref.commit}^{commit}`]) !== ref.commit) fail('evidence commit is not a commit');
    git(root, ['merge-base', '--is-ancestor', release.sha, ref.commit]);
    return git(root, ['show', `${ref.commit}:${ref.path}`]);
  } catch { fail(`evidence is missing or predates the release: ${ref.commit}:${ref.path}`); }
}

export function validateManifest(data, root = ROOT) {
  if (data.schemaVersion !== 2) fail('schemaVersion must be 2');
  const release = data.release;
  if (!/^\d+\.\d+\.\d+$/.test(release?.version ?? '') || release.tag !== `v${release.version}`
      || !SHA.test(release.sha ?? '')) fail('release must name an immutable version, tag and full SHA');
  try {
    if (git(root, ['rev-parse', `${release.tag}^{commit}`]) !== release.sha) fail('tag/SHA mismatch');
    if (JSON.parse(git(root, ['show', `${release.sha}:package.json`])).version !== release.version) fail('tag/package version mismatch');
  } catch (error) { fail(`cannot verify immutable release: ${error.message}`); }
  const publication = JSON.parse(evidenceText(release.publicationEvidence, release, root));
  if (publication.version !== release.version || publication.tag !== release.tag
      || publication.sourceSHA !== release.sha || !Number.isFinite(Date.parse(publication.publishedAt))) {
    fail('publication evidence must bind the public version, tag, source SHA and publication time');
  }
  if (!validDate(data.generatedAt)) fail('generatedAt must be a calendar date');
  if (!Array.isArray(data.scenarios) || !data.scenarios.length) fail('scenarios must be non-empty');
  const ids = new Set();
  const coverage = new Set();
  for (const [index, row] of data.scenarios.entries()) {
    const at = `scenarios[${index}]`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id ?? '') || ids.has(row.id)) fail(`${at}.id is invalid or duplicated`);
    ids.add(row.id);
    if (!CATEGORIES.includes(row.category)) fail(`${at}.category is invalid`);
    const platform = `${row.os}/${row.architecture}`;
    if (!PLATFORMS.includes(platform)) fail(`${at} must name one supported platform/architecture`);
    const key = `${row.category}:${platform}`;
    if (coverage.has(key)) fail(`${at} duplicates category/platform coverage`);
    coverage.add(key);
    for (const field of ['expected', 'notes']) {
      if (typeof row[field] !== 'string' || !row[field].trim()) fail(`${at}.${field} must be non-empty`);
    }
    if (row.publicVersion !== release.version || row.sourceSha !== release.sha) fail(`${at} must reference ${release.tag}`);
    if (!RESULTS.has(row.result) || !CLASSIFICATIONS.has(row.classification)) fail(`${at} has an invalid result/classification`);
    if (!validDate(row.evidenceDate) || row.evidenceDate > data.generatedAt) fail(`${at}.evidenceDate is invalid or after generatedAt`);
    if (!Array.isArray(row.evidence)) fail(`${at}.evidence must be an array`);
    const kinds = new Set();
    for (const ref of row.evidence) {
      if (!['source', 'execution', 'decision'].includes(ref?.kind)) fail(`${at}.evidence kind is invalid`);
      const content = evidenceText(ref, release, root);
      if (ref.kind === 'source' && ref.commit !== release.sha) fail(`${at} source evidence must be at the release SHA`);
      if (ref.kind === 'execution' && (!content.includes(release.version) || !content.includes(release.sha))) {
        fail(`${at} execution evidence must identify the exact release version and SHA`);
      }
      kinds.add(ref.kind);
    }
    if (['pass', 'partial'].includes(row.result) && (!kinds.has('source') || !kinds.has('execution'))) {
      fail(`${at} cannot claim ${row.result} without release source AND recorded execution evidence`);
    }
    if (row.result === 'unsupported' && !['product-decision', 'unsupported-capability'].includes(row.classification)) {
      fail(`${at} unsupported results require an explicit capability/product classification`);
    }
  }
  const missing = CATEGORIES.flatMap(category => PLATFORMS.map(platform => `${category}:${platform}`))
    .filter(key => !coverage.has(key));
  if (missing.length) fail(`missing required category/platform rows: ${missing.join(', ')}`);
  return data;
}

function cell(value) { return String(value).replaceAll('|', '\\|').replaceAll('\n', ' '); }
function link(ref) {
  return `[${cell(ref.kind ?? 'publication')}: ${cell(ref.path)}](https://github.com/bnfy/blanc/blob/${ref.commit}/${ref.path})`;
}
export function render(data) {
  const rows = data.scenarios.map(row => `| ${cell(row.id)} | ${cell(row.category)} | ${row.os}/${row.architecture} | ${cell(row.expected)} | ${row.result} | ${row.classification} | ${row.evidenceDate} | ${row.evidence.map(link).join('<br>') || 'None'} | ${cell(row.notes)} |`).join('\n');
  return `# Blanc compatibility evidence\n\n` +
    `This matrix records evidence for public Blanc ${data.release.version} (${data.release.tag}, \`${data.release.sha}\`). ` +
    `It is not a blanket compatibility promise. Each platform has its own result; source coverage and synthetic-device checks do not establish real-device or signed-in website compatibility.\n\n` +
    `Publication binding: ${link(data.release.publicationEvidence)}.\n\n` +
    `Generated from [manifest.json](manifest.json) on ${data.generatedAt}. Run \`npm run compatibility:check\` to validate committed evidence and detect drift. ` +
    `The [v1.21.0 matrix](releases/v1.21.0/README.md) is an unchanged historical snapshot; its results have not been carried forward.\n\n` +
    `| Scenario | Category | Platform | Expected behavior | Result | Classification | Evidence date | Pinned evidence | Limits / remaining checks |\n` +
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${rows}\n\n` +
    `## Result meanings\n\n` +
    `- **pass:** direct execution evidence covers the stated scenario on the named release and platform.\n` +
    `- **partial:** the notes state exactly what was checked and what remains untested.\n` +
    `- **unsupported:** Blanc does not provide the capability.\n` +
    `- **blocked:** the check could not complete for a recorded external or environmental reason.\n` +
    `- **not-run:** no applicable current-release execution result has been recorded. Its date is the evidence-review date, not a test date.\n\n` +
    `See [method.md](method.md) for collection and publication rules.\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = validateManifest(JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/compatibility/manifest.json'), 'utf8')));
  const rendered = render(data);
  const matrixPath = path.join(ROOT, 'docs/compatibility/README.md');
  if (process.argv.includes('--write')) fs.writeFileSync(matrixPath, rendered);
  else if (process.argv.includes('--check')) {
    if (!fs.existsSync(matrixPath) || fs.readFileSync(matrixPath, 'utf8') !== rendered) fail('README.md is stale; run npm run compatibility:build');
  } else process.stdout.write(rendered);
}
