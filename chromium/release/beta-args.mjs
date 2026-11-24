import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const assignments = /^([ \t]*(blanc_beta_build|blanc_beta_version)[ \t]*=[ \t]*)([^#\r\n]*?)([ \t]*(?:#[^\r\n]*)?)$/gm;

function readBetaAssignments(text) {
  const values = new Map();
  for (const [, , key, value] of text.matchAll(assignments)) {
    const literal = key === 'blanc_beta_build' ? /^\d+$/ : /^"2\.0\.0-beta\.\d+"$/;
    if (!literal.test(value) || values.has(key)) throw new Error(`Expected one literal assignment for ${key}.`);
    values.set(key, value);
  }
  for (const key of ['blanc_beta_build', 'blanc_beta_version']) {
    if (!values.has(key)) throw new Error(`Missing ${key} assignment.`);
  }
  return values;
}

export function betaBuildNumber(text) {
  return Number(readBetaAssignments(text).get('blanc_beta_build'));
}

export function betaArgsFor(committedText, {build}) {
  if (!Number.isInteger(build) || build < 1 || build > 9999) throw new Error('Expected a build number from 1 to 9999.');
  readBetaAssignments(committedText);
  return committedText.replace(assignments, (_, prefix, key, value, suffix) =>
    prefix + (key === 'blanc_beta_build' ? build : `"2.0.0-beta.${build}"`) + suffix);
}

export function argsDrift(writtenText, currentText) {
  // Give both texts the same build. Every other byte, including the final
  // newline, must agree before setup can replace the output's arguments.
  let expected, actual;
  try {
    expected = betaArgsFor(writtenText, {build: 1}).split('\n');
    actual = betaArgsFor(currentText, {build: 1}).split('\n');
  } catch (error) {
    return [error.message];
  }
  const drift = [];
  for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
    if (actual[i] !== expected[i]) {
      drift.push(`line ${i + 1}: expected ${JSON.stringify(expected[i]) ?? '<end>'}, found ${JSON.stringify(actual[i]) ?? '<end>'}`);
    }
  }
  return drift;
}

function main(argv) {
  const [option, template, output] = argv;
  const number = /^--build=([1-9]\d{0,3})$/.exec(option)?.[1];
  if (argv.length !== 3 || !number) throw new Error('Usage: beta-args.mjs --build=N COMMITTED_TEMPLATE OUTPUT_ARGS');
  const committed = execFileSync('git', ['-C', path.dirname(template), 'show', 'HEAD:./' + path.basename(template)], {encoding: 'utf8'});
  const written = betaArgsFor(committed, {build: Number(number)});
  // Read once: a missing file is the only reason to skip the drift check.
  let current = null;
  try { current = fs.readFileSync(output, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (current !== null) {
    if (current === written) return;
    const drift = argsDrift(written, current);
    if (drift.length) throw new Error(`${output} differs from the committed template:\n${drift.join('\n')}`);
  }
  // An interrupted write must leave the prior args.gn usable.
  const temp = fs.mkdtempSync(path.join(path.dirname(output), '.beta-args-'));
  try {
    const file = path.join(temp, 'args.gn');
    fs.writeFileSync(file, written);
    fs.renameSync(file, output);
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
