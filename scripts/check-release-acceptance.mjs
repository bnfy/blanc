import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'test', 'desktop', 'cucumber.mjs');
const FEATURE_ROOTS = [
  path.join(ROOT, 'spec', 'acceptance'),
  path.join(ROOT, 'test', 'desktop', 'features'),
];

function featureFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return featureFiles(target);
    return entry.isFile() && entry.name.endsWith('.feature') ? [target] : [];
  });
}

function scenarioRecords(file) {
  const records = [];
  let pendingTags = [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.startsWith('@')) {
      pendingTags.push(...trimmed.split(/\s+/).filter((token) => token.startsWith('@')));
      continue;
    }
    if (/^Scenario(?: Outline)?:/.test(trimmed)) {
      records.push({
        file,
        line: index + 1,
        name: trimmed.replace(/^Scenario(?: Outline)?:\s*/, ''),
        tags: [...new Set(pendingTags)],
      });
      pendingTags = [];
      continue;
    }
    if (/^(Feature|Rule|Background|Examples):/.test(trimmed)) pendingTags = [];
  }
  return records;
}

const configSource = fs.readFileSync(CONFIG, 'utf8');
const runnableBlock = configSource.match(/const RUNNABLE = \[([\s\S]*?)\]\.join/);
if (!runnableBlock) throw new Error('could not locate the RUNNABLE acceptance profile');
const runnableIds = [...runnableBlock[1].matchAll(/['"]@(F\d+-\d+)['"]/g)]
  .map((match) => match[1]);
const runnableSet = new Set(runnableIds);
const errors = [];

if (runnableSet.size !== runnableIds.length) {
  errors.push('test/desktop/cucumber.mjs contains duplicate stable scenario IDs');
}

const records = FEATURE_ROOTS.flatMap(featureFiles).flatMap(scenarioRecords);
const byId = new Map();
for (const record of records) {
  const ids = record.tags
    .map((tag) => tag.slice(1))
    .filter((tag) => /^F\d+-\d+$/.test(tag));
  for (const id of ids) {
    const entries = byId.get(id) ?? [];
    entries.push(record);
    byId.set(id, entries);
  }
  if (record.tags.includes('@release')) {
    const relative = path.relative(ROOT, record.file);
    if (ids.length !== 1) {
      errors.push(`${relative}:${record.line} @release scenario must have exactly one stable F#-# id`);
    } else if (!runnableSet.has(ids[0])) {
      errors.push(`${relative}:${record.line} @release scenario ${ids[0]} is not in the runnable profile`);
    }
  }
}

for (const id of runnableIds) {
  const matches = byId.get(id) ?? [];
  if (matches.length !== 1) {
    errors.push(`${id} must resolve to exactly one scenario; found ${matches.length}`);
    continue;
  }
  if (!matches[0].tags.includes('@release')) {
    errors.push(`${path.relative(ROOT, matches[0].file)}:${matches[0].line} ${id} is runnable but missing @release`);
  }
}

const releaseRecords = records.filter((record) => record.tags.includes('@release'));
if (releaseRecords.length !== runnableIds.length) {
  errors.push(`expected ${runnableIds.length} @release scenarios; found ${releaseRecords.length}`);
}

if (errors.length) {
  console.error(`release acceptance contract failed:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`release acceptance OK — ${releaseRecords.length} stable shipping contracts are tagged and runnable.`);
}
