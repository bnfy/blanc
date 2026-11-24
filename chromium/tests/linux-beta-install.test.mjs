import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import YAML from 'yaml';
import {ASSET_NAME} from '../linux/candidate.mjs';

const workflow = YAML.parse(fs.readFileSync(new URL('../../.github/workflows/chromium-linux-candidate.yml', import.meta.url), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const version = '158.0.8127.906';
const installScript = fileURLToPath(new URL('linux-beta-install.sh', import.meta.url));

test('the installed package scan uses the candidate notices and fingerprint', async t => {
  const {packageCheck} = await import('./linux-beta-smoke.mjs');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-references-'));
  t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
  const install = path.join(temp, 'payload/opt/bnfy/blanc-beta'), refs = path.join(temp, 'references');
  for (const dir of [refs, path.join(install, 'notices'), path.join(install, 'blanc_blocker')]) fs.mkdirSync(dir, {recursive: true});
  const fingerprint = 'C'.repeat(40);
  fs.writeFileSync(path.join(refs, 'repository.md'), 'Fingerprint: ' + fingerprint);
  for (const notice of ['LICENSE', 'ASSET-LICENSE.md', 'THIRD_PARTY_NOTICES.txt']) {
    fs.writeFileSync(path.join(refs, notice), 'candidate ' + notice);
    fs.copyFileSync(path.join(refs, notice), path.join(install, 'notices', notice));
  }
  fs.writeFileSync(path.join(install, 'blanc_blocker/engine.js'), 'blocker');
  fs.writeFileSync(path.join(install, 'chrome'), 'binary');
  const deb = path.join(temp, 'fixture.deb'), arch = process.arch === 'x64' ? 'amd64' : 'arm64';
  execFileSync('tar', ['-cf', deb, '-C', path.join(temp, 'payload'), '.']);
  fs.writeFileSync(path.join(temp, 'dpkg-deb'), `#!/bin/bash
set -eu
case "$1" in
  -R) tar -xf "$2" -C "$3" ;;
  --fsys-tarfile) cat "$2" ;;
  -f) case "$3" in Package) echo blanc-beta ;; Version) echo ${version}-1 ;; Architecture) echo ${arch} ;; esac ;;
  *) exit 1 ;;
esac\n`, {mode: 0o755});
  const oldPath = process.env.PATH;
  process.env.PATH = temp + path.delimiter + oldPath;
  t.after(() => { process.env.PATH = oldPath; });
  assert.equal((await packageCheck(deb, version, sha('binary'), refs)).fingerprint, fingerprint);
  fs.writeFileSync(path.join(refs, 'LICENSE'), 'other commit');
  await assert.rejects(packageCheck(deb, version, sha('binary'), refs), /incorrect fork notice/);
});

test('beta install dispatch prepares only the selected pre-signing archive and exercises both package formats', async t => {
  const dispatch = workflow.on.workflow_dispatch.inputs;
  assert.ok(dispatch.check.options.includes('beta-install'));
  assert.equal(dispatch.version.type, 'string');
  assert.equal(dispatch.sourceCommit?.type, 'string', 'dispatch must select the candidate source');
  const job = workflow.jobs.install;
  assert.match(job.if, /beta-install/);
  const step = job.steps.find(s => s.name === 'Prepare the selected pre-signing beta packages');
  assert.ok(step && step.if.includes('beta-install'));
  assert.equal(step.env.VERSION, '${{ inputs.version }}');
  assert.equal(step.env.SOURCE_COMMIT, '${{ inputs.sourceCommit }}');
  for (const arch of ['arm64', 'x64']) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-install-'));
    t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
    const dir = name => { const d = path.join(temp, name); fs.mkdirSync(d, {recursive: true}); return d; };
    const runtime = dir('tar/chrome'), packages = dir('tar/packages'), bin = dir('bin');
    const build = 906;
    const draft = dir('draft'), asset = ASSET_NAME(arch, 'beta', build);
    // The runner's tooling is newer than this candidate's notices and signing key.
    const refs = dir('references-repo');
    const git = (...args) => execFileSync('git', ['-C', refs, '-c', 'user.name=fixture',
      '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', ...args], {encoding: 'utf8'}).trim();
    git('init', '-q');
    git('remote', 'add', 'origin', refs);
    const notices = ['LICENSE', 'ASSET-LICENSE.md', 'THIRD_PARTY_NOTICES.txt'];
    const repoDoc = 'chromium/linux/repository.md';
    dir('references-repo/chromium/linux');
    dir('references-repo/chromium/blanc/notices');
    for (const notice of notices) fs.writeFileSync(path.join(refs, 'chromium/blanc/notices', notice), 'candidate ' + notice);
    fs.writeFileSync(path.join(refs, repoDoc), 'Fingerprint: ' + 'A'.repeat(40));
    git('add', '.'); git('commit', '-qm', 'candidate');
    const source = git('rev-parse', 'HEAD');
    fs.writeFileSync(path.join(refs, repoDoc), 'Fingerprint: ' + 'B'.repeat(40));
    fs.writeFileSync(path.join(refs, 'chromium/blanc/notices/LICENSE'), 'new notice');
    git('commit', '-qam', 'later tip');
    const exe = 'fixture executable', exeSha256 = sha(exe);
    fs.writeFileSync(path.join(runtime, 'chrome'), exe);
    const files = ['blanc-beta_' + version + '-1_' + (arch === 'x64' ? 'amd64' : 'arm64') + '.deb',
      'blanc-beta-' + version + '-1.' + (arch === 'x64' ? 'x86_64' : 'aarch64') + '.rpm'];
    for (const file of files) fs.writeFileSync(path.join(packages, file), file);
    fs.writeFileSync(path.join(temp, 'tar/candidate.json'), JSON.stringify({id: 'linux-' + arch + '-' + exeSha256.slice(0, 16),
      arch, build, version, treeCommit: source, exeSha256, channel: 'beta', platform: 'linux', packages: files.map(file => ({file, sha256: sha(file)}))}));
    execFileSync('tar', ['-czf', path.join(draft, asset), '-C', path.join(temp, 'tar'), '.']);
    const stub = (name, script) => fs.writeFileSync(path.join(bin, name), '#!/bin/bash\nset -eu\n' + script, {mode: 0o755});
    stub('gh', `[[ $1 == release && $3 == fork-linux-candidate ]]
case "$2" in
view) echo true ;;
download)
  shift 3
  while (( $# )); do
    case "$1" in --repo) shift 2 ;; --dir) dest=$2; shift 2 ;; --pattern) pattern=$2; shift 2 ;; *) exit 1 ;; esac
  done
  [[ $pattern == "$ASSET_EXPECTED" ]]
  cp "$DRAFT/$pattern" "$dest/"
  ;;
*) exit 1 ;;
esac`);
    const env = {...process.env, PATH: bin + ':' + process.env.PATH, DRAFT: draft, DRAFT_TAG: 'fork-linux-candidate',
      ASSET_EXPECTED: asset, GITHUB_REPOSITORY: 'fixture/blanc', ARCH: arch, VERSION: version,
      CANDIDATE_SHA256: sha(fs.readFileSync(path.join(draft, asset))), SOURCE_COMMIT: source,
      GIT_DIR: path.join(refs, '.git'), GIT_WORK_TREE: refs, GIT_ALLOW_PROTOCOL: 'file'};
    const prepare = (runner, changes) => execFileSync('bash', ['-euo', 'pipefail', '-c', step.run],
      {env: {...env, RUNNER_TEMP: dir(runner), ...changes}, stdio: 'pipe'});
    const linked = path.join(temp, 'linked.tar.gz');
    fs.symlinkSync(path.join(draft, asset), linked);
    assert.throws(() => execFileSync('python3', ['chromium/linux/repository/metadata.py', 'unpack-beta-candidate', arch,
      env.CANDIDATE_SHA256, linked, path.join(temp, 'linked-input'), version], {stdio: 'pipe'}), /symbolic link|regular archive/i);
    prepare('run');
    const input = path.join(temp, 'run/input'), results = path.join(temp, 'run/results');
    for (const file of files) assert.equal(fs.readFileSync(path.join(input, file), 'utf8'), file);
    const references = path.join(input, 'references');
    assert.equal(fs.readFileSync(path.join(references, 'repository.md'), 'utf8'), 'Fingerprint: ' + 'A'.repeat(40));
    for (const notice of notices) assert.equal(fs.readFileSync(path.join(references, notice), 'utf8'), 'candidate ' + notice);
    assert.throws(() => prepare('wrong-source', {SOURCE_COMMIT: git('rev-parse', 'HEAD')}));
    assert.throws(() => prepare('wrong-hash', {CANDIDATE_SHA256: '0'.repeat(64)}), /SHA-256|checksum/i);
    stub('sudo', 'printf "%s\\n" "$@" > "$LOG_INSTALL"');
    stub('xvfb-run', 'printf "%s\\n" "$@" > "$LOG_SMOKE"');
    for (const system of ['ubuntu', 'debian', 'fedora']) {
      const format = system === 'fedora' ? 'rpm' : 'deb', pkg = path.join(input, files[format === 'rpm' ? 1 : 0]);
      const logInstall = path.join(temp, 'install'), logSmoke = path.join(temp, 'smoke');
      execFileSync('bash', [installScript, system, version, input, results],
        {env: {...env, LOG_INSTALL: logInstall, LOG_SMOKE: logSmoke}});
      const readArgs = file => fs.readFileSync(file, 'utf8').trimEnd().split('\n');
      const command = readArgs(logInstall);
      assert.ok(command.includes(system === 'fedora' ? 'dnf' : 'apt-get') && command.includes('install') && command.includes(pkg));
      assert.deepEqual(readArgs(logSmoke).slice(-4), [version, path.join(results, 'linux-beta-smoke-' + format + '.json'),
        '--package=' + pkg, '--references=' + references]);
    }
  }
  const steps = job.steps.map(s => s.run ?? '').filter(s => s.includes('linux-beta-install.sh'));
  assert.equal(steps.length, 2, 'both the native Ubuntu and container steps must invoke the installed beta smoke');
});
