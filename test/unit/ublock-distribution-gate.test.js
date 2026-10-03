'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../scripts/before-pack-ublock.js'), 'utf8');
function pack({ retired = false, internal = false, configuration = {}, embedded = {}, gate = {}, runtime = require('../../src/main/ublock-platforms.json').electron, files = require('../../package.json').build.files.slice() } = {}) {
  const checked = [];
  const module = { exports: {} };
  vm.runInNewContext(source, { module, process: { env: internal ? { BLANC_UBLOCK_INTERNAL_BUILD: '1' } : {} },
    require: name => {
      if (name === '../ublock/distribution.json') return gate;
      if (name === '../src/main/ublock-platforms.json') return { manifestV2: retired ? 'retired' : 'supported' };
      if (name === './check-capture-preloads.cjs') return {};
      if (name === './check-ublock-runtime.cjs') return require('../../scripts/check-ublock-runtime.cjs');
      if (name === 'app-builder-lib/out/util/config/config') return require(name);
      assert(['./check-ublock-package.cjs', './build-ublock-adaptation.cjs'].includes(name));
      checked.push(name); return {};
    },
  });
  const context = { packager: { config: { extraMetadata: configuration, files }, info: { metadata: embedded, framework: { version: runtime } } } };
  return { execute: () => module.exports(context), checked, context };
}
test('ordinary packaging excludes uncleared upstream assets while Blanc builds remain usable', () => {
  const candidate = pack(); candidate.execute();
  assert.equal(candidate.context.packager.info.metadata.blancUblockBundled, false);
  assert(candidate.context.packager.config.files.every(set => set.filter.includes('!ublock{,/**/*}')));
  assert.equal(candidate.checked.length, 0);
});
test('public packaging rejects stale validation markers from both metadata sources', () => {
  const gate = { cleared: true, assessment: true, correspondingSource: true, noticeReview: true };
  for (const source of ['configuration', 'embedded']) {
    const candidate = pack({ gate, [source]: { blancUblockInternalValidation: true } });
    assert.throws(candidate.execute, /marker forbidden/);
  }
});
test('an explicit internal package embeds its marker without clearing the public distribution gate', () => {
  const candidate = pack({ internal: true, configuration: { retained: 1 }, embedded: { version: 'candidate' } });
  candidate.execute();
  assert.equal(candidate.context.packager.config.extraMetadata.blancUblockInternalValidation, true);
  assert.equal(candidate.context.packager.info.metadata.blancUblockInternalValidation, true);
  assert.equal(candidate.context.packager.config.extraMetadata.retained, 1);
  assert.equal(candidate.context.packager.info.metadata.version, 'candidate');
  assert.equal(candidate.checked.length, 2);
});

function publicGate({ internal = false, cleared = false, enabled = false, bundled = false } = {}) {
  const process = { argv: bundled ? ['node', 'check', '--bundled'] : [], env: internal ? { BLANC_UBLOCK_INTERNAL_BUILD: '1' } : {}, exitCode: 0 };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../scripts/check-ublock-distribution.cjs'), 'utf8'), {
    process, console: { log() {}, error() {} }, require: name => name.includes('distribution')
      ? { cleared, assessment: cleared, correspondingSource: cleared, noticeReview: cleared }
      : { platforms: { 'darwin-arm64': { enabled } } },
  });
  return process.exitCode;
}
test('public gate permits an excluded baseline and rejects uncleared enabled platforms', () => {
  assert.equal(publicGate(), 0);
  assert.equal(publicGate({ enabled: true }), 1);
  assert.equal(publicGate({ enabled: true, cleared: true }), 0);
});
test('public release gate rejects inherited internal-build flags even after clearance', () => {
  assert.equal(publicGate({ internal: true }), 1);
  assert.equal(publicGate({ internal: true, cleared: true }), 1);
  const release = fs.readFileSync(path.join(__dirname, '../../scripts/release.sh'), 'utf8');
  assert(release.indexOf('Internal uBlock validation packages cannot enter') < release.indexOf('op signin'));
});

const { doMergeConfigs } = require('app-builder-lib/out/util/config/config');
const { getMainFileMatchers } = require('app-builder-lib/out/fileMatcher');
const ROOT = path.resolve(__dirname, '../..');
function actualMatchers(config) {
  return getMainFileMatchers(ROOT, path.join(ROOT, 'dist/fixture'), value => value, {}, {
    info: { config, projectDir: ROOT, buildResourcesDir: 'build', debugLogger: { isEnabled: false } },
  }, path.join(ROOT, 'dist'), false).map(matcher => matcher.createFilter());
}
test('real builder normalization and matching preserve the baseline desktop allowlist', () => {
  for (const files of [require('../../package.json').build.files.slice(), doMergeConfigs([{ files: require('../../package.json').build.files.slice() }]).files]) {
    const candidate = pack({ files }); candidate.execute();
    const filters = actualMatchers(candidate.context.packager.config);
    const included = member => filters.some(filter => filter(path.join(ROOT, member), { isDirectory: () => false }));
    for (const member of ['src/main/main.js', 'adblock/sources/pinned.json', 'LICENSE', 'package.json']) assert(included(member), member);
    for (const member of ['docs/readme.md', 'test/unit/test.js', 'marketing/copy.md', 'site/index.html', 'ios/App.swift', '.env', 'ublock/pinned.json', 'scripts/check-ublock-package.cjs']) assert(!included(member), member);
  }
});
test('a missing or exclusion-only allowlist cannot become the builder default **/*', () => {
  for (const files of [[], undefined, ['!ublock/**/*'], [{ filter: ['!ublock/**/*'] }]]) {
    const candidate = pack({ files: files ?? [] });
    assert.throws(candidate.execute, /explicit file allowlist/);
  }
});
test('ASAR verification rejects unexpected first-party files even if a matcher regresses', async t => {
  const os = require('node:os');
  const { createPackage, listPackage, uncache } = require('@electron/asar');
  const { verifyDesktopAllowlist } = require('../../scripts/verify-packaged-ublock');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-payload-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, 'input'); fs.mkdirSync(input);
  fs.writeFileSync(path.join(input, 'LICENSE'), 'fixture');
  const archive = path.join(root, 'fixture.asar');
  await createPackage(input, archive);
  const inventory = () => listPackage(archive).map(member => member.replaceAll('\\', '/').replace(/^\//, ''));
  assert.equal(verifyDesktopAllowlist(archive, inventory(), false).count, 1);
  fs.mkdirSync(path.join(input, 'docs')); fs.writeFileSync(path.join(input, 'docs/leak.md'), 'unexpected');
  uncache(archive);
  await createPackage(input, archive);
  assert.throws(() => verifyDesktopAllowlist(archive, inventory(), false), /Unexpected file.*docs/);
});

test('an internal build checks the builder actual runtime, including version overrides', () => {
  const candidate = pack({ internal: true, runtime: '44.6.0' });
  assert.throws(candidate.execute, /build runtime differs/);
  assert.equal(candidate.checked.length, 0, 'refuse before loading or adapting the upstream payload');
});

test('signed bundled candidates require concrete clearance even when every public platform is disabled', () => {
  assert.equal(publicGate({ bundled: true }), 1);
  assert.equal(publicGate({ bundled: true, cleared: true }), 0);
  const workflow = require('js-yaml').load(fs.readFileSync(path.join(__dirname, '../../.github/workflows/release-windows-linux.yml'), 'utf8'));
  assert.equal(workflow.on.workflow_dispatch.inputs.ublock_candidate.default, false);
  const preflight = workflow.jobs['validate-inputs'].steps.find(step => step.run?.includes('check-ublock-distribution.cjs --bundled'));
  assert(preflight); assert(preflight.if.includes('inputs.ublock_candidate'));
  for (const job of ['windows', 'linux', 'linux-sandbox']) {
    const build = workflow.jobs[job].steps.find(step => step.env?.BLANC_UBLOCK_INTERNAL_BUILD);
    assert(build.env.BLANC_UBLOCK_INTERNAL_BUILD.includes('inputs.ublock_candidate'), job);
    assert(workflow.jobs[job].needs.includes('validate-inputs'), job);
  }
});

test('retired MV2 releases omit the unusable extension even with previous distribution clearance', () => {
  const candidate = pack({ retired: true, gate: { cleared: true, assessment: true, correspondingSource: true, noticeReview: true } });
  candidate.execute();
  assert.equal(candidate.context.packager.info.metadata.blancUblockBundled, false);
  assert.equal(candidate.checked.length, 0);
  assert(candidate.context.packager.config.files.every(set => set.filter.includes('!ublock{,/**/*}')));
});

test('packaged ASAR lookups convert member separators for Windows', () => {
  // @electron/asar splits member paths on path.sep, so a literal 'ublock/x'
  // is found on macOS and Linux but missing on Windows.
  const roots = ['scripts', 'test/desktop'].map(dir => path.join(__dirname, '../..', dir));
  let calls = 0;
  for (const root of roots) {
    for (const name of fs.readdirSync(root, { recursive: true })) {
      if (!/\.(?:c|m)?js$/.test(name)) continue;
      const text = fs.readFileSync(path.join(root, name), 'utf8');
      const parsed = [...text.matchAll(/\b(?:extractFile|statFile)\((?:[^,()]|\([^()]*\))+,\s*([^)]*)\)/g)];
      assert.equal(parsed.length, text.match(/\b(?:extractFile|statFile)\(/g)?.length ?? 0, `${name}: every lookup must be parsed`);
      for (const [, member] of parsed) {
        assert(!/^['"`][^'"`]*\//.test(member.trim()), `${name} passes a '/' member literal: ${member}`);
      }
      calls += parsed.length;
    }
  }
  assert(calls > 0, 'the scan must find the lookups it guards');
});

test('one beforePack hook verifies the locked runtime before the uBO gate', async () => {
  // JSON.parse keeps only the last duplicate key, which would silently drop a hook.
  const raw = fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8');
  assert.equal(raw.match(/"beforePack"\s*:/g).length, 1);
  assert.equal(JSON.parse(raw).build.beforePack, 'scripts/before-pack.js');
  const hook = fs.readFileSync(path.join(__dirname, '../../scripts/before-pack.js'), 'utf8');
  const load = runtime => {
    const calls = [];
    const module = { exports: {} };
    vm.runInNewContext(hook, { module, require: name => {
      if (name === './before-pack-verify-runtime') return async context => { calls.push('runtime'); runtime(context); };
      if (name === './before-pack-ublock') return () => { calls.push('ublock'); return 'gated'; };
      throw new Error('Unexpected hook dependency: ' + name);
    } });
    return { run: module.exports, calls };
  };
  const passing = load(() => {});
  assert.equal(await passing.run({}), 'gated');
  assert.deepEqual(passing.calls, ['runtime', 'ublock']);
  const mismatch = load(() => { throw new Error('Packaging Electron 44.6.0 differs from locked 44.5.1'); });
  await assert.rejects(mismatch.run({}), /differs from locked/);
  assert.deepEqual(mismatch.calls, ['runtime'], 'a runtime mismatch stops before the uBO gate changes packaging');
});
