'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { validateRuntimeRun } = require('../../scripts/ci-runtime-policy');
const repo = 'bnfy/blanc';
const workflow = '.github/workflows/release-windows-linux.yml';
test('runtime download rejects incomplete, foreign, wrong-workflow and pull-request builds', () => {
  const valid = { path: workflow, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_repository: { full_name: repo }, head_sha: 'a'.repeat(40) };
  const jobs = [{ name: 'capture-runtime (ubuntu-latest)', status: 'completed', conclusion: 'success', head_sha: valid.head_sha }];
  const options = { repo, workflow, jobs, platform: 'linux' };
  assert.equal(validateRuntimeRun(valid, options), valid.head_sha);
  assert.equal(validateRuntimeRun({ ...valid, conclusion: 'failure' }, options), valid.head_sha, 'independent Windows failure does not invalidate an attested Linux success');
  for (const patch of [{ conclusion: null }, { status: 'in_progress' }, { conclusion: 'cancelled' }, { event: 'pull_request' },
    { path: '.github/workflows/unrelated.yml' }, { head_repository: { full_name: 'other/blanc' } }, { head_sha: 'not-a-commit' }]) {
    assert.throws(() => validateRuntimeRun({ ...valid, ...patch }, options));
  }
  for (const patch of [{ jobs: [] }, { platform: 'win32' }, { jobs: [...jobs, ...jobs] },
    { jobs: [{ ...jobs[0], conclusion: 'failure' }] }, { jobs: [{ ...jobs[0], head_sha: 'b'.repeat(40) }] }]) {
    assert.throws(() => validateRuntimeRun(valid, { ...options, ...patch }));
  }
});
test('raw-runtime workflow cannot enter app publishing jobs or access signing secrets', () => {
  const data = YAML.parse(fs.readFileSync(path.resolve(__dirname, '../..', workflow), 'utf8'));
  for (const name of ['windows', 'linux']) {
    assert.ok(data.jobs[name].if.includes("inputs.mode == 'release' || inputs.mode == 'validation'"));
    assert.equal(data.jobs[name].permissions.actions, 'read');
    assert.ok(data.jobs[name].steps.some((step) => step.run === 'node scripts/stage-ci-runtime.mjs'));
  }
  const job = data.jobs['capture-runtime'];
  assert.equal(job.if, "${{ inputs.mode == 'runtime' }}");
  assert.equal(job.permissions.contents, 'read');
  const steps = JSON.stringify(job.steps);
  assert.doesNotMatch(steps, /secrets\.|gh release|electron-builder|latest\.yml/);
  const attestation = job.steps.find((step) => step.name === 'Attest patched runtime archive');
  assert.ok(attestation.with['subject-path'].includes('/dist.zip'));
  assert.ok(attestation.with['subject-path'].includes('/blanc-runtime-build.json'));
  const linux = data.jobs.linux.steps;
  assert.ok(linux.findIndex((step) => step.name === 'Build Linux audio helper') < linux.findIndex((step) => step.run?.includes('electron-builder --linux')));
});
