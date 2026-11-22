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

test('beta install dispatch prepares only the selected pre-signing archive and exercises both package formats', async t => {
  const dispatch = workflow.on.workflow_dispatch.inputs;
  assert.ok(dispatch.check.options.includes('beta-install'));
  assert.equal(dispatch.version.type, 'string');
  const job = workflow.jobs.install;
  assert.match(job.if, /beta-install/);
  const step = job.steps.find(s => s.name === 'Prepare the selected pre-signing beta packages');
  assert.ok(step && step.if.includes('beta-install'));
  assert.equal(step.env.VERSION, '${{ inputs.version }}');
  for (const arch of ['arm64', 'x64']) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-install-'));
    t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
    const dir = name => { const d = path.join(temp, name); fs.mkdirSync(d, {recursive: true}); return d; };
    const runtime = dir('tar/chrome'), packages = dir('tar/packages'), bin = dir('bin');
    const build = 906;
    const draft = dir('draft'), asset = ASSET_NAME(arch, 'beta', build);
    const exe = 'fixture executable', exeSha256 = sha(exe);
    fs.writeFileSync(path.join(runtime, 'chrome'), exe);
    const files = ['blanc-beta_' + version + '-1_' + (arch === 'x64' ? 'amd64' : 'arm64') + '.deb',
      'blanc-beta-' + version + '-1.' + (arch === 'x64' ? 'x86_64' : 'aarch64') + '.rpm'];
    for (const file of files) fs.writeFileSync(path.join(packages, file), file);
    fs.writeFileSync(path.join(temp, 'tar/candidate.json'), JSON.stringify({id: 'linux-' + arch + '-' + exeSha256.slice(0, 16),
      arch, build, version, exeSha256, channel: 'beta', platform: 'linux', packages: files.map(file => ({file, sha256: sha(file)}))}));
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
      CANDIDATE_SHA256: sha(fs.readFileSync(path.join(draft, asset)))};
    const prepare = (runner, changes) => execFileSync('bash', ['-euo', 'pipefail', '-c', step.run],
      {env: {...env, RUNNER_TEMP: dir(runner), ...changes}, stdio: 'pipe'});
    const linked = path.join(temp, 'linked.tar.gz');
    fs.symlinkSync(path.join(draft, asset), linked);
    assert.throws(() => execFileSync('python3', ['chromium/linux/repository/metadata.py', 'unpack-beta-candidate', arch,
      env.CANDIDATE_SHA256, linked, path.join(temp, 'linked-input'), version], {stdio: 'pipe'}), /symbolic link|regular archive/i);
    prepare('run');
    const input = path.join(temp, 'run/input'), results = path.join(temp, 'run/results');
    for (const file of files) assert.equal(fs.readFileSync(path.join(input, file), 'utf8'), file);
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
      assert.deepEqual(readArgs(logSmoke).slice(-3), [version, path.join(results, 'linux-beta-smoke-' + format + '.json'), '--package=' + pkg]);
    }
  }
  const steps = job.steps.map(s => s.run ?? '').filter(s => s.includes('linux-beta-install.sh'));
  assert.equal(steps.length, 2, 'both the native Ubuntu and container steps must invoke the installed beta smoke');
});
