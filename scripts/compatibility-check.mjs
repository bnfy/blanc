import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'docs/compatibility/manifest.json');
const MATRIX_PATH = path.join(ROOT, 'docs/compatibility/README.md');
const RESULTS = new Set(['pass', 'partial', 'unsupported', 'blocked', 'not-run']);
const CLASSIFICATIONS = new Set(['supported', 'defect', 'product-decision', 'unsupported-capability']);
const REQUIRED_CATEGORIES = new Set([
  'oauth-return', 'external-app-return', 'focused-popup', 'camera', 'microphone',
  'screen-sharing', 'system-audio-sharing', 'passkeys', 'onepassword',
  'protected-media', 'ordinary-media', 'pwa', 'downloads', 'uploads', 'local-html',
  'default-browser', 'os-links', 'productivity-site', 'banking-site',
  'commerce-site', 'developer-site', 'media-site',
]);
const RELEASE = { version: '1.21.0', tag: 'v1.21.0', sha: '159f274de47ffb32412420ae241d6337a416d0da' };

function fail(message) {
  throw new Error(`compatibility manifest: ${message}`);
}

function readManifest() {
  const data = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (data.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (data.release?.version !== RELEASE.version || data.release?.tag !== RELEASE.tag || data.release?.sha !== RELEASE.sha) {
    fail(`release must be the immutable ${RELEASE.tag} reference`);
  }
  let resolvedTag;
  try {
    resolvedTag = execFileSync('git', ['rev-parse', RELEASE.tag], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    fail(`cannot resolve immutable tag ${RELEASE.tag}`);
  }
  if (resolvedTag !== RELEASE.sha) fail(`${RELEASE.tag} does not resolve to ${RELEASE.sha}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.generatedAt ?? '')) fail('generatedAt must be YYYY-MM-DD');
  if (!Array.isArray(data.scenarios) || data.scenarios.length === 0) fail('scenarios must be non-empty');

  const ids = new Set();
  const categories = new Set();
  for (const [index, row] of data.scenarios.entries()) {
    const at = `scenarios[${index}]`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id ?? '')) fail(`${at}.id must be a stable kebab-case id`);
    if (ids.has(row.id)) fail(`${at}.id is duplicated`);
    ids.add(row.id);
    categories.add(row.category);
    for (const key of ['category', 'os', 'architecture', 'expected', 'evidenceDate', 'notes']) {
      if (typeof row[key] !== 'string' || row[key].trim() === '') fail(`${at}.${key} must be a non-empty string`);
    }
    if (row.publicVersion !== RELEASE.version || row.sourceSha !== RELEASE.sha) fail(`${at} must reference ${RELEASE.tag}`);
    if (!RESULTS.has(row.result)) fail(`${at}.result is invalid`);
    if (!CLASSIFICATIONS.has(row.classification)) fail(`${at}.classification is invalid`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.evidenceDate)) fail(`${at}.evidenceDate must be YYYY-MM-DD`);
    if (!Array.isArray(row.evidence)) fail(`${at}.evidence must be an array`);
    if (['pass', 'partial'].includes(row.result) && row.evidence.length === 0) fail(`${at} cannot claim ${row.result} without evidence`);
    for (const ref of row.evidence) {
      if (typeof ref !== 'string' || ref.trim() === '') fail(`${at}.evidence contains an invalid reference`);
      if (/^https:\/\//.test(ref)) continue;
      const clean = ref.split('#')[0];
      if (!fs.existsSync(path.join(ROOT, clean))) fail(`${at}.evidence does not exist: ${ref}`);
      if (['pass', 'partial'].includes(row.result)) {
        try {
          execFileSync('git', ['cat-file', '-e', `${RELEASE.tag}:${clean}`], { cwd: ROOT, stdio: 'ignore' });
        } catch {
          fail(`${at}.evidence is not present at ${RELEASE.tag}: ${ref}`);
        }
      }
    }
  }
  const missing = [...REQUIRED_CATEGORIES].filter((category) => !categories.has(category));
  if (missing.length) fail(`missing required categories: ${missing.join(', ')}`);
  return data;
}

function cell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function render(data) {
  const rows = data.scenarios.map((row) => (
    `| ${cell(row.id)} | ${cell(row.category)} | ${cell(`${row.os}/${row.architecture}`)} | ${cell(row.expected)} | ${row.result} | ${row.classification} | ${cell(row.notes)} |`
  )).join('\n');
  return `# Blanc compatibility evidence\n\n` +
    `This matrix records what was actually checked for public Blanc ${data.release.version} ` +
    `(${data.release.tag}, \`${data.release.sha}\`). It is evidence, not a blanket compatibility promise. ` +
    `\`partial\` and \`not-run\` rows identify work still needed; \`unsupported\` is published plainly.\n\n` +
    `Generated from [manifest.json](manifest.json) on ${data.generatedAt}. Run ` +
    '`npm run compatibility:check` to validate the schema and detect generated-file drift.\n\n' +
    `| Scenario | Category | Platform | Expected behavior | Result | Classification | Evidence note |\n` +
    `| --- | --- | --- | --- | --- | --- | --- |\n${rows}\n\n` +
    `## Result meanings\n\n` +
    `- **pass:** the expected behavior has direct release-tagged evidence on the named platform.\n` +
    `- **partial:** some relevant behavior is evidenced, but the full scenario was not exercised.\n` +
    `- **unsupported:** Blanc does not provide the capability.\n` +
    `- **blocked:** the check could not complete for a recorded external or environmental reason.\n` +
    `- **not-run:** no current release-tagged result exists.\n\n` +
    `See [method.md](method.md) for the collection and publication rules.\n`;
}

const data = readManifest();
const rendered = render(data);
if (process.argv.includes('--write')) {
  fs.writeFileSync(MATRIX_PATH, rendered);
} else if (process.argv.includes('--check')) {
  if (!fs.existsSync(MATRIX_PATH) || fs.readFileSync(MATRIX_PATH, 'utf8') !== rendered) {
    fail('README.md is stale; run npm run compatibility:build');
  }
} else {
  process.stdout.write(rendered);
}
