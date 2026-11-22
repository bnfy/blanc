import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {ASSET_NAME, packageNames, runtimeConfig} from '../linux/candidate.mjs';
import {fixture, clean} from './fixtures/linux-candidate.mjs';

const chromium = fileURLToPath(new URL('../', import.meta.url));
const read = file => fs.readFileSync(path.join(chromium, file), 'utf8');
const patch = 'patches/0116-blanc-linux-update-notifications.patch';

for (const [arch, debArch, rpmArch] of [['x64', 'amd64', 'x86_64'], ['arm64', 'arm64', 'aarch64']]) {
  test(`the ${arch} Linux beta uses the reviewed official build args`, () => {
    const args = Object.fromEntries(read(`linux/args/beta-${arch}.gn`).split('\n')
      .map(line => line.replace(/#.*/, '').trim()).filter(Boolean)
      .map(line => { const [key, value] = line.split(/\s*=\s*/); return [key, JSON.parse(value)]; }));
    assert.deepEqual(args, {
      target_os: 'linux', target_cpu: arch, is_official_build: true, is_debug: false,
      is_component_build: false, is_chrome_branded: false, blanc_channel: 'beta',
      enable_widevine: false, bundle_widevine_cdm: false, chrome_pgo_phase: 0, symbol_level: 0,
      blanc_beta_build: 900, blanc_beta_version: '2.0.0-beta.900', blanc_blocker_bundle: '/home/blanc/blanc-assets/blocker',
    });
  });

  test(`the ${arch} beta archive binds the numbered packages and transfers under its build-specific name`, async t => {
    const build = 906;
    const version = '158.0.8127.' + build;
    const names = {deb: `blanc-beta_${version}-1_${debArch}.deb`, rpm: `blanc-beta-${version}-1.${rpmArch}.rpm`};
    assert.deepEqual(packageNames(version, arch, 'beta'), names);
    const asset = `blanc-linux-beta-${arch}-906-candidate.tar.gz`;
    assert.equal(ASSET_NAME(arch, 'beta', build), asset);
    assert.notEqual(ASSET_NAME(arch, 'beta', build - 1), asset);
    assert.throws(() => ASSET_NAME(arch, 'beta'));
    const f = fixture(t, arch, build);
    const record = await f.archive(clean);
    const candidate = JSON.parse(execFileSync('tar', ['-xOzf', record.tar, './candidate.json']));
    assert.deepEqual(candidate.packages.map(p => p.file), Object.values(names));
    assert.equal(candidate.channel, 'beta');
    assert.equal(candidate.build, build);
    assert.equal(candidate.version, version);
    assert.equal(path.basename(record.tar), asset);
    assert.equal(runtimeConfig(f.dir, candidate, candidate.exeSha256).executable, '/opt/bnfy/blanc-beta/chrome');
    const unpacked = path.join(f.dir, 'unpacked');
    fs.mkdirSync(unpacked);
    execFileSync('tar', ['-xzf', record.tar, '-C', unpacked]);
    const runtime = runtimeConfig(unpacked, candidate);
    assert.equal(runtime.blockerAssets, undefined);
    const engine = path.join(path.dirname(runtime.executable), 'blanc_blocker/engine.js');
    assert.deepEqual(fs.readFileSync(engine), fs.readFileSync(f.inputs.engine));

    // Exercise the transfer's record reader and upload command entirely on local fixtures.
    f.command('scp', 'source_file=${@: -2:1}; cp "${source_file#fixture:}" "${@: -1}"');
    f.command('gh', 'case "$2" in view) echo true ;; upload) echo "${4##*/}" >> "$UPLOADS" ;; delete-asset) ;; *) exit 1 ;; esac');
    const uploads = path.join(f.dir, 'uploads');
    const shipped = spawnSync('bash', [path.join(chromium, 'linux/ship-candidate.sh'), 'fixture', f.folder],
      {encoding: 'utf8', env: {...process.env, UPLOADS: uploads}});
    assert.equal(shipped.status, 0, shipped.stderr);
    assert.ok(fs.readFileSync(uploads, 'utf8').split('\n').includes(asset));
    assert.doesNotMatch(shipped.stdout, /chromium-linux-candidate.yml|sign-candidate.command/);
  });
}

test('GN admits Linux x64 and arm64 betas while keeping hooks preview-only', () => {
  const config = read('blanc/config.gni');
  assert.match(config, /assert\(target_os == "mac" \|\| \(target_os == "win" && target_cpu == "x64"\) \|\|\s*\(target_os == "linux" && \(target_cpu == "x64" \|\| target_cpu == "arm64"\)\),/);
  assert.match(config, /^blanc_enable_test_hooks = blanc_channel == "preview" && !is_official_build$/m);
});

test('the desktop patch enables installed-version notifications only for a Linux beta', () => {
  assert.ok(JSON.parse(read('lanes/desktop.json')).patches.includes(patch));
  const diff = read(patch);
  assert.match(diff, /\+\+\+ b\/chrome\/browser\/buildflags.gni/);
  assert.deepEqual(diff.split('\n').filter(line => line.startsWith('-') && !line.startsWith('---')),
    ['-  enable_update_notifications = is_chrome_branded']);
  const edits = diff.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .map(line => line.slice(1).trim()).filter(line => line && !line.startsWith('import(')).join(' ');
  assert.equal(edits, 'enable_update_notifications = is_chrome_branded || (is_linux && blanc_channel == "beta")');
});

test('setup requires one build for a beta, and only for a beta, before it calls GN', () => {
  const script = path.join(chromium, 'linux/server/setup.sh');
  for (const args of [['--out=BlancLinuxBeta'], ['--out=BlancLinuxArm64Beta', '--build=bad'],
    ['--out=BlancLinuxBeta', '--build=901', '--build=902'], ['--out=BlancLinuxPrototype', '--build=901']]) {
    const result = spawnSync('bash', [script, ...args], {encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--build/);
  }
  const setup = fs.readFileSync(script, 'utf8');
  assert.match(setup, /"\$\{NODE\}" "\$\{TREE\}\/chromium\/release\/beta-args\.mjs"[^\n]+\n[\s\S]+?gn gen/);
});
