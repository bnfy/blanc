'use strict';
// The ECS release runtime is opt-in, release-mode only, and fails closed
// before any tag where its signing access is not yet approved (Windows).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const root = path.join(__dirname, '../..');
const workflowText = fs.readFileSync(path.join(root, '.github/workflows/release-windows-linux.yml'), 'utf8');
const workflow = yaml.load(workflowText);
const releaseScript = fs.readFileSync(path.join(root, 'scripts/release.sh'), 'utf8');

test('the native workflow offers official and ECS runtimes, official by default', () => {
  const input = workflow.on.workflow_dispatch.inputs.runtime;
  assert.equal(input.default, 'official');
  assert.deepEqual(input.options, ['official', 'ecs']);
});

const validate = workflow.jobs['validate-inputs'].steps.find(step => step.name === 'Validate trusted workflow inputs before use').run;
const run = env => spawnSync('bash', ['-e', '-c', validate], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
const base = { RELEASE_MODE: 'release', RELEASE_TAG: 'v1.43.0', RELEASE_PLATFORM: 'all', UBLOCK_CANDIDATE: 'false',
  ECS_CANDIDATE: 'false', ECS_PRODUCTION: 'false', ECS_WINDOWS_LIFECYCLE: 'false', RELEASE_RUNTIME: 'official', VALIDATION_REF: 'refs/heads/main' };
test('input validation keeps official releases and refuses unapproved ECS combinations', { skip: process.platform === 'win32' }, () => {
  assert.equal(run(base).status, 0, 'official release');
  assert.equal(run({ ...base, RELEASE_RUNTIME: 'ecs', RELEASE_PLATFORM: 'linux' }).status, 0, 'ECS Linux release');
  for (const [label, env] of [
    ['ECS with Windows', { ...base, RELEASE_RUNTIME: 'ecs' }],
    ['ECS Windows only', { ...base, RELEASE_RUNTIME: 'ecs', RELEASE_PLATFORM: 'windows' }],
    ['ECS validation mode', { ...base, RELEASE_RUNTIME: 'ecs', RELEASE_PLATFORM: 'linux', RELEASE_MODE: 'validation', RELEASE_TAG: '' }],
    ['ECS with internal uBO candidate', { ...base, RELEASE_RUNTIME: 'ecs', RELEASE_PLATFORM: 'linux', UBLOCK_CANDIDATE: 'true' }],
    ['ECS with qualification build', { ...base, RELEASE_RUNTIME: 'ecs', RELEASE_PLATFORM: 'linux', ECS_PRODUCTION: 'true' }],
    ['unknown runtime', { ...base, RELEASE_RUNTIME: 'nightly' }],
  ]) assert.notEqual(run(env).status, 0, label);
});

test('the Windows release job has no new signing access; the Linux job builds and verifies ECS', () => {
  const windows = workflow.jobs.windows;
  assert.equal(windows.environment, undefined);
  assert.doesNotMatch(JSON.stringify(windows), /EVS_|evs-venv|prepare-evs-ci|build-ecs-production/);
  const linux = workflow.jobs.linux;
  const steps = JSON.stringify(linux.steps);
  assert.match(steps, /BLANC_ECS_RELEASE_PIPELINE=1 node scripts\/build-ecs-production.cjs --release --linux --x64/);
  assert.match(steps, /npx electron-builder --linux --publish never/);
  assert.match(steps, /verify-ecs-production-package.cjs --release dist\/linux-unpacked/);
  assert.match(steps, /FUSE_ARGS=\(--ecs\)/);
  assert.equal(linux.env.RELEASE_RUNTIME, "${{ inputs.runtime == 'ecs' && 'ecs' || 'official' }}");
  assert.doesNotMatch(JSON.stringify(linux), /secrets\.EVS|ecs-signing/);
});

test('release.sh refuses an ECS release the native workflow cannot build before tagging', () => {
  const tagPush = releaseScript.indexOf('git push origin "refs/tags/$TAG"');
  for (const message of ['does not accept runtime=ecs', 'needs the separately approved EVS signing access in the release workflow']) {
    assert(releaseScript.includes(message), message);
    assert(releaseScript.indexOf(message) < tagPush, `${message} precedes the tag`);
  }
});
