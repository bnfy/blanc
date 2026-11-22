import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {argsDrift, betaArgsFor} from './beta-args.mjs';

const cli = fileURLToPath(new URL('./beta-args.mjs', import.meta.url));
const template = '# build 900\ntarget_os = "linux"\nblanc_beta_build = 900\nblanc_beta_version = "2.0.0-beta.900"\nsymbol_level = 0\n';
const next = template.replace('build = 900', 'build = 901').replace('beta.900"', 'beta.901"');

test('rendering a beta changes only the two values', () => {
  assert.equal(betaArgsFor(template, {build: 901}), next);
  for (const build of [0, -1, 1.5, 10000, NaN, '901']) {
    assert.throws(() => betaArgsFor(template, {build}), /build/i);
  }
  for (const line of ['blanc_beta_build = 900\n', 'blanc_beta_version = "2.0.0-beta.900"\n']) {
    assert.throws(() => betaArgsFor(template.replace(line, ''), {build: 901}), /blanc_beta_/);
    assert.throws(() => betaArgsFor(template + line, {build: 901}), /blanc_beta_/);
  }
});

test('drift compares the complete output in order, allowing only the build values', () => {
  assert.deepEqual(argsDrift(next, template), []);
  const edit = template.replace('symbol_level = 0', 'symbol_level = 2');
  assert.match(argsDrift(next, edit).join('\n'), /symbol_level = 2/);
  for (const changed of [template.trimEnd(), template.replace('# build 900\n', ''), template + '#\n',
    template.replace('# build 900\ntarget_os = "linux"', 'target_os = "linux"\n# build 900'),
    template + 'blanc_beta_build = 3\n', template.replace('blanc_beta_build = 900\n', '')]) {
    assert.notDeepEqual(argsDrift(next, changed), []);
  }
});

test('the setup CLI reads the template at HEAD, creates or renumbers args.gn, and preserves drift', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-beta-args-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const args = path.join(dir, 'chromium/linux/args/beta-x64.gn');
  const output = path.join(dir, 'out/BlancLinuxBeta/args.gn');
  fs.mkdirSync(path.dirname(args), {recursive: true});
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(args, template);
  const git = (...options) => execFileSync('git', ['-C', dir, ...options]);
  git('init', '-q');
  git('add', 'chromium');
  git('-c', 'user.email=fixture@example.invalid', '-c', 'user.name=Fixture', 'commit', '-qm', 'template');
  fs.appendFileSync(args, 'uncommitted = true\n');
  const run = build => spawnSync(process.execPath, [cli, '--build=' + build, args, output], {encoding: 'utf8'});
  for (const build of [900, 901]) {
    const result = run(build);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(output, 'utf8'), build === 900 ? template : next);
  }
  const drift = next + 'is_debug = true\n';
  fs.writeFileSync(output, drift);
  const result = run(902);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /is_debug = true/);
  assert.equal(fs.readFileSync(output, 'utf8'), drift);
});
