'use strict';
// The public ECS runtime is opt-in, bound to an exact approved source commit,
// buildable as a private validation artifact or a release, and fails closed
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
  ECS_CANDIDATE: 'false', ECS_PRODUCTION: 'false', ECS_WINDOWS_LIFECYCLE: 'false', RELEASE_RUNTIME: 'official', SOURCE_SHA: '', VALIDATION_REF: 'refs/heads/main' };
const sha = 'a'.repeat(40);
const ecsLinux = { ...base, RELEASE_RUNTIME: 'ecs', RELEASE_PLATFORM: 'linux', SOURCE_SHA: sha };
test('input validation keeps official releases and refuses unapproved ECS combinations', { skip: process.platform === 'win32' }, () => {
  assert.equal(run(base).status, 0, 'official release');
  assert.equal(run(ecsLinux).status, 0, 'ECS Linux release');
  assert.equal(run({ ...ecsLinux, RELEASE_MODE: 'validation', RELEASE_TAG: '' }).status, 0, 'non-publishing ECS Linux validation');
  for (const [label, env] of [
    ['ECS with Windows', { ...ecsLinux, RELEASE_PLATFORM: 'all' }],
    ['ECS Windows only', { ...ecsLinux, RELEASE_PLATFORM: 'windows' }],
    ['ECS validation with Windows', { ...ecsLinux, RELEASE_PLATFORM: 'all', RELEASE_MODE: 'validation', RELEASE_TAG: '' }],
    ['ECS without a source commit', { ...ecsLinux, SOURCE_SHA: '' }],
    ['ECS with a short source commit', { ...ecsLinux, SOURCE_SHA: 'abc1234' }],
    ['official with a source commit', { ...base, SOURCE_SHA: sha }],
    ['ECS with internal uBO candidate', { ...ecsLinux, UBLOCK_CANDIDATE: 'true' }],
    ['ECS with qualification build', { ...ecsLinux, ECS_PRODUCTION: 'true' }],
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
  assert.equal(linux.env.BLANC_UPDATE_CHANNEL, "${{ inputs.runtime == 'ecs' && 'ecs-qualification-disabled' || '' }}");
  assert.doesNotMatch(JSON.stringify(linux), /secrets\.EVS|ecs-signing/);
  // The source binding runs right after checkout, before dependencies or build.
  const names = linux.steps.map(step => step.name || step.run || step.uses);
  const bind = names.indexOf('Bind the ECS build to the exact approved source commit');
  assert.equal(bind, 1);
  assert(bind < names.indexOf('npm ci') && bind < names.indexOf('Build'));
  assert.match(linux.steps[bind].run, /\[ "\$ACTUAL" = "\$SOURCE_SHA" \]/);
  assert.equal(linux.steps[bind].if, "${{ inputs.runtime == 'ecs' }}");
  // A public ECS validation run still requires uBO distribution clearance and
  // never starts the official-only sandbox job.
  assert.equal(linux.steps.find(step => step.name === 'Require uBlock distribution clearance for public release').if, "${{ inputs.mode == 'release' || inputs.runtime == 'ecs' }}");
  assert.match(workflow.jobs['linux-sandbox'].if, /inputs\.runtime != 'ecs'/);
  assert.equal(linux.steps.find(step => step.name === 'Upload to release').if, "${{ inputs.mode == 'release' }}");
  // The exact public package's installed uBO, file isolation and protected
  // playback are checked before any release upload.
  const lnames = linux.steps.map(step => step.name);
  const upload = lnames.indexOf('Upload to release');
  const ubo = lnames.indexOf('Verify candidate uBO installed AppImage controls and restart');
  const drm = lnames.indexOf('Verify public ECS file isolation and protected playback');
  assert(ubo >= 0 && drm >= 0 && ubo < upload && drm < upload);
  assert.match(linux.steps[ubo].if, /inputs\.runtime == 'ecs'/);
  assert.match(linux.steps[ubo].run, /if \[ "\$RELEASE_RUNTIME" = ecs \]; then export BLANC_UPDATE_CHANNEL=ecs-qualification-disabled; fi/);
  assert.equal(linux.steps[drm].env.BLANC_UPDATE_CHANNEL, 'ecs-qualification-disabled');
  assert.match(linux.steps[drm].run, /ecs-production-drm-smoke\.mjs/);
  assert.match(linux.steps[drm].run, /ecs-production-smoke\.mjs/);
});

test('release.sh refuses an ECS release the native workflow cannot build before tagging', () => {
  const tagPush = releaseScript.indexOf('git push origin "refs/tags/$TAG"');
  assert.match(releaseScript, /DISPATCH_RUNTIME_ARGS=\(-f runtime=ecs -f source_sha="\$\(git rev-parse HEAD\)"\)/);
  assert.match(releaseScript, /!inputs\.source_sha\) process\.exit\(1\)/);
  for (const message of ['does not accept runtime=ecs', 'needs the separately approved EVS signing access in the release workflow']) {
    assert(releaseScript.includes(message), message);
    assert(releaseScript.indexOf(message) < tagPush, `${message} precedes the tag`);
  }
});

test('mandatory browser regressions run before any release upload or attestation, on both platforms', () => {
  for (const job of ['windows', 'linux']) {
    const names = workflow.jobs[job].steps.map(step => step.name || step.uses);
    const regression = names.indexOf('Packaged browser and Settings regressions');
    assert(regression >= 0, job);
    assert(regression < names.indexOf('Upload to release'), `${job}: regression precedes upload`);
    assert(regression < names.findIndex(name => /^Attest /.test(name || '')), `${job}: regression precedes attestation`);
    assert.equal(workflow.jobs[job].steps[regression].if, undefined, `${job}: the regression is unconditional`);
  }
});

test('Linux ECS regressions go through the AppImage launcher; official Linux keeps its unpacked binary', () => {
  const step = workflow.jobs.linux.steps.find(s => s.name === 'Packaged browser and Settings regressions');
  assert.match(step.run, /if \[ "\$RELEASE_RUNTIME" = ecs \]; then[\s\S]*BLANC_PACKAGED_EXECUTABLE="\$PWD\/dist\/\$PRODUCT_NAME-\$VERSION\.AppImage"[\s\S]*dbus-run-session -- xvfb-run -a npm run test:packaged:browser-compatibility/);
  assert.match(step.run, /else\n\s+BLANC_PACKAGED_EXECUTABLE="\$PWD\/dist\/linux-unpacked\/blanc" \\\n\s+xvfb-run -a npm run test:packaged:browser-compatibility\n\s*fi/);
});

test('the browser regression smoke keeps the official lock check and expects the pinned ECS version only for a verified ECS package', () => {
  const smoke = fs.readFileSync(path.join(root, 'test/desktop/packaged-browser-compatibility-smoke.mjs'), 'utf8');
  assert.match(smoke, /let expected = runtime\.lockedElectronVersion\(\);/);
  assert.match(smoke, /if \(process\.env\.BLANC_ECS_PACKAGE_ROOT\) \{/);
  for (const check of ["assert.equal(metadata.blancRuntime, 'ecs');", 'assert.equal(metadata.blancEcsRuntime, pin.version);',
    'assert.equal(metadata.blancEcsArchiveSha256, pin.archives[metadata.blancEcsTarget]);']) assert(smoke.includes(check), check);
  assert.match(smoke, /assert\.equal\(info\.appInfo\.electronVersion, expected, 'actual packaged runtime matches the lock'\);/);
});
