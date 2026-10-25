'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const workflow = yaml.load(fs.readFileSync(path.join(__dirname, '../../.github/workflows/release-windows-linux.yml'), 'utf8'));
const job = workflow.jobs['mac-scan'];

test('Mac scan mode accepts only exact-commit production ECS input and no release tag', () => {
  const script = workflow.jobs['validate-inputs'].steps[0].run;
  const env = { ...process.env, RELEASE_MODE: 'mac-scan', RELEASE_RUNTIME: 'ecs', RELEASE_PLATFORM: 'all',
    SOURCE_SHA: 'a'.repeat(40), RELEASE_TAG: '', UBLOCK_CANDIDATE: 'false', ECS_CANDIDATE: 'false',
    ECS_PRODUCTION: 'false', ECS_WINDOWS_LIFECYCLE: 'false', VALIDATION_REF: 'refs/heads/codex/antivirus-source-packaging' };
  assert.equal(spawnSync('bash', ['-c', script], { env }).status, 0);
  for (const change of [{ RELEASE_TAG: 'v1.43.2' }, { SOURCE_SHA: 'main' }, { RELEASE_RUNTIME: 'official' },
    { RELEASE_PLATFORM: 'windows' }, { ECS_CANDIDATE: 'true' }, { UBLOCK_CANDIDATE: 'true' }]) {
    assert.notEqual(spawnSync('bash', ['-c', script], { env: { ...env, ...change } }).status, 0, JSON.stringify(change));
  }
});

test('Mac signing stays protected, read-only, native on both architectures and tied to the workflow SHA', () => {
  assert.equal(job.environment, 'ecs-signing');
  assert.deepEqual(job.permissions, { contents: 'read' });
  assert.deepEqual(job.strategy.matrix.include.map(x => x.arch), ['arm64', 'x64']);
  const checkout = job.steps.find(x => x.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.ref, '${{ inputs.source_sha }}');
  assert.equal(checkout.with['fetch-depth'], 0, 'press compatibility checks require immutable release tags');
  assert.equal(checkout.with['persist-credentials'], false);
  const binding = job.steps.find(x => x.name === 'Bind workflow and source to the approved commit').run;
  assert(binding.includes('test "$GITHUB_SHA" = "$APPROVED_SOURCE_SHA"'));
  assert(binding.includes('test "$(git rev-parse HEAD)" = "$APPROVED_SOURCE_SHA"'));
  for (const [name, other] of Object.entries(workflow.jobs)) {
    if (name === 'validate-inputs' || name === 'mac-scan') continue;
    assert.match(other.if, /inputs\.mode == '(?:release|validation)'/, name);
  }
});

test('Mac scan artifacts contain verified installers only, with credentials removed before browser tests', () => {
  const runs = job.steps.map(x => x.run || '').join('\n');
  assert(!/gh\s+release|git\s+(tag|push)|workflow\s+run|cosign\s+sign/.test(runs));
  const builder = job.steps.find(x => x.env?.CSC_LINK);
  assert.match(builder.run, /preflight-mac-signing/);
  assert.match(builder.run, /build-ecs-production\.cjs --release --mac/);
  assert.equal(builder.env.CSC_LINK, '${{ secrets.MAC_CSC_LINK }}');
  assert.equal(builder.env.CSC_KEY_PASSWORD, '${{ secrets.MAC_CSC_KEY_PASSWORD }}');
  assert.equal(builder.env.APPLE_TEAM_ID, 'XYGUCY4498');
  const cleanup = job.steps.findIndex(x => x.run === 'node scripts/prepare-evs-ci.cjs --clean');
  const smoke = job.steps.findIndex(x => x.run === 'npm run test:packaged:first-run');
  assert.equal(job.steps[cleanup].if, 'always()');
  assert(cleanup < smoke);
  assert.equal(job.env.BLANC_UPDATE_CHANNEL, undefined, 'updater unit tests must exercise production defaults');
  assert.equal(job.steps[smoke].env.BLANC_UPDATE_CHANNEL, 'ecs-qualification-disabled');
  const upload = job.steps.find(x => x.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(upload.if, "success() && steps.verified.outcome == 'success'");
  assert.equal(upload.with['retention-days'], 3);
  assert(!/latest|\.p12|credentials|cache\.json|config\.json|dist\/\*\*/.test(upload.with.path));
  assert(runs.includes('codesign --verify --deep --strict'));
  assert(runs.includes('xcrun stapler validate'));
  assert(runs.includes('spctl --assess'));
});
