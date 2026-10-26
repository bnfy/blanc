'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const workflow = yaml.load(fs.readFileSync(path.join(__dirname, '../../.github/workflows/release-windows-linux.yml'), 'utf8'));
const job = workflow.jobs['mac-scan'];
const acceptance = workflow.jobs['mac-scan-acceptance'];

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
  assert.equal(job.env.DEVELOPER_DIR, '${{ matrix.developer_dir }}');
  assert.deepEqual(job.permissions, { contents: 'read' });
  assert.deepEqual(job.strategy.matrix.include.map(x => x.arch), ['arm64', 'x64']);
  assert.deepEqual(job.strategy.matrix.include.map(x => x.runner), [['self-hosted', 'macOS', 'ARM64', 'blanc-mac'], 'macos-26-intel']);
  assert.deepEqual(job.strategy.matrix.include.map(x => x.developer_dir), ['/Applications/Xcode.app/Contents/Developer', '/Applications/Xcode_26.3.app/Contents/Developer']);
  const icon = job.steps.findIndex(x => x.run?.includes('node scripts/preflight-mac-icon.cjs'));
  assert(icon >= 0 && icon < job.steps.findIndex(x => x.env?.CSC_LINK));
  assert.deepEqual(job.needs, ['validate-inputs', 'mac-scan-acceptance']);
  const checkout = job.steps.find(x => x.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.ref, '${{ inputs.source_sha }}');
  assert.equal(checkout.with['fetch-depth'], 0, 'press compatibility checks require immutable release tags');
  assert.equal(checkout.with['persist-credentials'], false);
  const display = acceptance.steps.findIndex(x => x.run === 'swift scripts/ci-macos-tall-display.swift');
  const press = acceptance.steps.findIndex(x => x.run === 'npm run release:verify:press');
  assert(display >= 0 && display < press, 'native geometry acceptance needs the existing tall-display setup');
  const binding = job.steps.find(x => x.name === 'Bind workflow and source to the approved commit').run;
  assert(binding.includes('test "$GITHUB_SHA" = "$APPROVED_SOURCE_SHA"'));
  assert(binding.includes('test "$(git rev-parse HEAD)" = "$APPROVED_SOURCE_SHA"'));
  for (const [name, other] of Object.entries(workflow.jobs)) {
    if (name === 'validate-inputs' || name === 'mac-scan' || name === 'mac-scan-acceptance' || name === 'mac-scan-diagnostic' || name === 'mac-runner-probe') continue;
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
  const macCleanup = job.steps.findIndex(x => x.name === 'Remove temporary Mac signing material');
  assert.equal(job.steps[macCleanup].if, 'always()');
  assert(macCleanup < smoke);
  assert(job.steps[macCleanup].run.includes('APP_BUILDER_TMP_DIR="$RUNNER_TEMP/blanc-mac-sign-$GITHUB_RUN_ID-$TARGET_ARCH"'));
  assert(job.steps[macCleanup].run.includes('security delete-keychain'));
  assert.equal(job.env.APP_BUILDER_TMP_DIR, undefined, 'runner context is initialized inside the job');
  assert(job.steps.find(x => x.name === 'Bind workflow and source to the approved commit').run.includes('APP_BUILDER_TMP_DIR=%s'));
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

test('self-hosted toolchain probe has no signing environment or secrets', () => {
  const probe = workflow.jobs['mac-runner-probe'];
  assert.equal(probe.environment, undefined);
  assert.deepEqual(probe['runs-on'], ['self-hosted', 'macOS', 'ARM64', 'blanc-mac']);
  assert.match(probe.if, /inputs\.mac_runner_probe/);
  assert.match(job.if, /!inputs\.mac_runner_probe/);
  assert(!JSON.stringify(probe).includes('secrets.'));
});

test('native Mac acceptance is a secret-free prerequisite on isolated desktops', () => {
  assert.equal(acceptance.environment, undefined);
  assert.deepEqual(acceptance.permissions, { contents: 'read' });
  assert.deepEqual(acceptance.strategy.matrix.include.map(x => x.runner),
    [['self-hosted', 'macOS', 'ARM64', 'blanc-ci'], 'macos-26-intel']);
  assert.deepEqual(acceptance.strategy.matrix.include.map(x => x.arch), ['arm64', 'x64']);
  assert(!JSON.stringify(acceptance).includes('secrets.'));
  assert.match(acceptance.if, /!inputs\.mac_runner_probe/);
  const checkout = acceptance.steps.find(x => x.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.ref, '${{ inputs.source_sha }}');
  assert.equal(checkout.with['persist-credentials'], false);
  const binding = acceptance.steps.find(x => x.name?.startsWith('Bind acceptance')).run;
  assert(binding.includes('test "$GITHUB_SHA" = "$APPROVED_SOURCE_SHA"'));
  assert(binding.includes('test "$(git rev-parse HEAD)" = "$APPROVED_SOURCE_SHA"'));
  assert(binding.includes('Native architecture mismatch'));
  assert.equal(acceptance.steps.filter(x => x.run === 'npm run release:verify:press').length, 1);
  assert(!job.steps.some(x => x.run === 'npm run release:verify:press'));
});

test('the disposable ARM VM gets a temporary native screen before acceptance', () => {
  const screen = acceptance.steps.findIndex(x => x.name === 'Provide a temporary large desktop inside the isolated ARM VM');
  const press = acceptance.steps.findIndex(x => x.run === 'npm run release:verify:press');
  assert(screen >= 0 && screen < press);
  assert.equal(acceptance.steps[screen].if, "matrix.arch == 'arm64'");
  assert.match(acceptance.steps[screen].run, /ci-macos-virtual-display\.m/);
  assert.match(acceptance.steps[screen].run, /blanc-ci-display\.ready/);
  const cleanup = acceptance.steps.find(x => x.name === 'Remove the temporary VM display');
  assert.equal(cleanup.if, "always() && matrix.arch == 'arm64'");
  assert.match(cleanup.run, /kill/);
});

test('focused diagnostics cannot reach signing or substitute for the full press gate', () => {
  const diagnostic = workflow.jobs['mac-scan-diagnostic'];
  assert.equal(diagnostic.environment, undefined);
  assert.deepEqual(diagnostic.permissions, { contents: 'read' });
  assert(!JSON.stringify(diagnostic).includes('secrets.'));
  assert.match(diagnostic.if, /inputs\.mac_diagnostic/);
  assert.match(job.if, /!inputs\.mac_diagnostic/);
  assert.match(acceptance.if, /!inputs\.mac_diagnostic/);
  const runs = diagnostic.steps.map(step => step.run || '').join('\n');
  assert(!/gh\s+release|git\s+(tag|push)|build-ecs-production/.test(runs));
  assert.match(runs, /--retry 0 --name/);
  assert(diagnostic.steps.some(step => step.run === 'npm run test:wallpaper:desktop'));
  for (const target of [diagnostic, acceptance]) {
    assert(target.steps.some(step => step.run?.includes('caffeinate -d -i -u -t 7200')));
    assert(target.steps.some(step => step.if === 'always()' && step.run?.includes('blanc-ci-awake.pid')));
  }
});
