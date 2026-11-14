// The staged beta release (release.mjs) runs in order, never again after the
// tag or draft exists, treats every unanswered absence check as a stop, and
// creates or publishes nothing without the owner's typed confirmation. A fake
// runner stands in for every command: nothing here signs, tags or contacts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {STAGES, admit, nextStage, confirmAbsent, load, runStage, RUN} from './release.mjs';

const release = JSON.parse(fs.readFileSync(new URL('./fixtures/release.json', import.meta.url)));
const done = stages => Object.fromEntries(stages.map(stage => [stage, {at: 'test'}]));
// A fake world: answers by command, records every call.
function world(answers = {}, {confirm = true} = {}) {
  const calls = [];
  return {calls, env: {PATH: '/usr/bin:/bin'},
    exec(command, args) {
      calls.push([command, ...args].join(' '));
      for (const [pattern, answer] of Object.entries(answers)) if ([command, ...args].join(' ').includes(pattern)) return {stdout: '', stderr: '', ...answer};
      return {status: 0, stdout: '', stderr: ''};
    },
    async confirm() { return confirm; },
  };
}
const absent = {'rev-parse -q --verify': {status: 1}, 'ls-remote': {status: 2}, 'releases --jq': {status: 0, stdout: 'v1.49.0\nv1.48.0\n'}};
function workFolder(state) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-beta-work-'));
  fs.chmodSync(work, 0o700);
  fs.writeFileSync(path.join(work, 'release.json'), JSON.stringify(release));
  fs.writeFileSync(path.join(work, 'local-inputs.json'), '{}');
  if (state) fs.writeFileSync(path.join(work, 'state.json'), JSON.stringify(state));
  return work;
}

test('stages run in order and never again once the tag or draft exists', () => {
  assert.throws(() => admit({done: {}}, 'sign'), /run preflight first/);
  admit({done: {}}, 'preflight');
  admit({done: done(['preflight', 'sign'])}, 'sign'); // before the tag a stage may be redone
  const drafted = done(STAGES.slice(0, STAGES.indexOf('draft') + 1));
  assert.throws(() => admit({done: drafted}, 'draft'), /never rerun/);
  assert.throws(() => admit({done: drafted}, 'manifest'), /never rerun|cannot run again/);
  admit({done: drafted}, 'sigstore');
  assert.equal(nextStage({done: drafted}), 'sigstore');
  assert.throws(() => admit({done: {}}, 'fly'), /unknown stage/);
});

test('absence means Git and GitHub both answered that nothing exists', () => {
  confirmAbsent(world(absent), release);
  for (const [name, change] of Object.entries({
    'local tag': {'rev-parse -q --verify': {status: 0, stdout: 'abc\n'}},
    'Git error': {'rev-parse -q --verify': {status: 128}},
    'remote tag': {'ls-remote': {status: 0, stdout: 'abc refs/tags/x\n'}},
    'remote error': {'ls-remote': {status: 128}},
    'GitHub error': {'releases --jq': {status: 1}},
    'a draft': {'releases --jq': {status: 0, stdout: `v1.49.0\n${release.tag}\n`}},
  })) assert.throws(() => confirmAbsent(world({...absent, ...change}), release), undefined, name);
});

test('the work folder is private, outside the repository, and bound to its release.json', () => {
  const work = workFolder();
  load(work);
  fs.chmodSync(work, 0o755);
  assert.throws(() => load(work), /owner-only/);
  fs.chmodSync(work, 0o700);
  fs.writeFileSync(path.join(work, 'state.json'), JSON.stringify({schema: 1, release: '0'.repeat(64), done: {}}));
  assert.throws(() => load(work), /changed after the run began/);
  assert.throws(() => load(path.resolve(import.meta.dirname)), /outside the repository|owner-only|ENOENT/);
  fs.rmSync(work, {recursive: true, force: true});
});

test('an unconfirmed draft creates no tag and no release', async () => {
  const io = world(absent, {confirm: false});
  const work = workFolder();
  fs.mkdirSync(path.join(work, 'assets'));
  fs.writeFileSync(path.join(work, 'assets', 'SHA256SUMS'), 'sums\n');
  const ctx = {...load(work), state: {done: {manifest: {checksumsSHA256: (await import('./policy.mjs')).sha256('sums\n')}}}};
  await assert.rejects(() => RUN.draft(ctx, io), /not confirmed/);
  assert.ok(!io.calls.some(call => / tag |push|release create/.test(call)), io.calls.join('\n'));
  fs.rmSync(work, {recursive: true, force: true});
});

test('publishing needs confirmation and must leave a stable release as latest', async () => {
  const before = done(STAGES.slice(0, STAGES.indexOf('publish')));
  const view = {status: 0, stdout: JSON.stringify({draft: false, prerelease: true})};
  let work = workFolder({schema: 1, release: (await import('./policy.mjs')).sha256(JSON.stringify(release)), done: before});
  let io = world({}, {confirm: false});
  await assert.rejects(() => runStage('publish', work, io), /not confirmed/);
  assert.ok(!io.calls.some(call => call.includes('release edit')));
  io = world({[`releases/tags/${release.tag}`]: view, 'releases/latest': {status: 0, stdout: JSON.stringify({tag_name: release.tag})}});
  await assert.rejects(() => runStage('publish', work, io), /became the latest/);
  io = world({[`releases/tags/${release.tag}`]: view, 'releases/latest': {status: 0, stdout: JSON.stringify({tag_name: 'v1.49.0'})}});
  const result = await runStage('publish', work, io);
  assert.equal(result.next, 'verify-public');
  assert.ok(io.calls.some(call => call.includes('release edit') && call.includes('--prerelease') && call.includes('--latest=false')));
  assert.ok(JSON.parse(fs.readFileSync(path.join(work, 'state.json'))).done.publish);
  await assert.rejects(() => runStage('publish', work, io), /never rerun/);
  fs.rmSync(work, {recursive: true, force: true});
});
