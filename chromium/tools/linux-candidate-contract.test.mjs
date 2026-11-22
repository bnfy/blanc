import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import YAML from 'yaml';
import {ASSET_NAME, runtimeConfig} from '../linux/candidate.mjs';
import {prepareQuitInput} from '../tests/linux-quit.mjs';
import {LINUX_OUTPUT_ARCH} from './build.mjs';
import {clean, fixture, hash} from './fixtures/linux-candidate.mjs';

const chromium = fileURLToPath(new URL('../', import.meta.url));
const workflow = YAML.parse(fs.readFileSync(path.join(chromium, '../.github/workflows/chromium-linux-candidate.yml'), 'utf8'));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

// Actions starts each step in a fresh shell and carries GITHUB_ENV forward.
function prepareJob(job, first, last, workspace, env) {
  const steps = workflow.jobs[job].steps;
  const start = steps.findIndex(step => step.name === first);
  const end = steps.findIndex(step => step.name === last);
  assert.ok(start >= 0 && end >= start, job + ' input steps');
  const temp = path.join(workspace, env.ARCH, job);
  fs.mkdirSync(temp, {recursive: true});
  const envFile = path.join(temp, 'env');
  fs.writeFileSync(envFile, '');
  const jobEnv = {...process.env, ...env, GITHUB_JOB: job, RUNNER_TEMP: temp, GITHUB_ENV: envFile};
  for (const step of steps.slice(start, end + 1)) {
    execFileSync('bash', ['-euo', 'pipefail', '-c', step.run], {cwd: workspace, env: jobEnv, stdio: 'pipe'});
    for (const line of fs.readFileSync(envFile, 'utf8').trimEnd().split('\n').filter(Boolean)) {
      const pos = line.indexOf('=');
      assert.ok(pos > 0, line);
      jobEnv[line.slice(0, pos)] = line.slice(pos + 1);
    }
  }
  return jobEnv;
}

const fakeGh = `[[ $1 == release && $3 == fork-linux-candidate ]]
verb=$2
shift 3
patterns=()
while (( $# )); do
  case "$1" in
    --repo|--json) shift 2 ;;
    --dir) dir=$2; shift 2 ;;
    --pattern) patterns+=("$2"); shift 2 ;;
    *) exit 1 ;;
  esac
done
case "$verb" in
  view) cat "$DRAFT/release.json" ;;
  download) for file in "\${patterns[@]}"; do cp "$DRAFT/$file" "$dir/"; done ;;
  *) exit 1 ;;
esac`;

test('the hosted Linux jobs consume the signed candidate produced for each guarded output', async t => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-contract-'));
  const gpg = path.join(workspace, 'gpg');
  t.after(() => {
    spawnSync('gpgconf', ['--homedir', gpg, '--kill', 'all']);
    fs.rmSync(workspace, {recursive: true, force: true});
  });
  // The consumers locate the committed public key relative to their module.
  // Give the fixture checkout its own disposable key at that same path.
  for (const dir of ['linux', 'tests']) {
    fs.cpSync(path.join(chromium, dir), path.join(workspace, 'chromium', dir), {recursive: true});
  }
  fs.mkdirSync(gpg, {mode: 0o700});
  const sign = (...args) => execFileSync('gpg', ['--homedir', gpg, '--batch', '--pinentry-mode', 'loopback',
    '--passphrase', '', ...args], {stdio: 'pipe'});
  sign('--quick-generate-key', 'Blanc candidate contract fixture', 'ed25519', 'sign', '1d');
  const key = path.join(workspace, 'chromium/linux/keys/blanc-repository.asc');
  fs.mkdirSync(path.dirname(key), {recursive: true});
  fs.writeFileSync(key, sign('--armor', '--export'));
  const metadata = path.join(chromium, 'linux/repository/metadata.py');

  for (const arch of ['x64', 'arm64']) {
    await t.test(arch, async t => {
      const f = fixture(t, arch);
      assert.equal(LINUX_OUTPUT_ARCH[path.basename(f.out)], arch);
      const record = await f.archive(clean);
      const draft = f.folder;
      const archive = path.basename(record.tar);
      assert.equal(archive, ASSET_NAME(arch));

      // Use the signer's own unpacker and descriptor writer. The signed RPM
      // fixture deliberately differs from the original RPM inside the tarball.
      const staging = path.join(f.dir, 'signing');
      execFileSync('python3', [metadata, 'unpack-candidate', arch, record.tarSha256, record.tar, staging]);
      fs.appendFileSync(path.join(staging, f.rpm), 'fixture rpm signature');
      execFileSync('python3', [metadata, 'approve-candidate', staging]);
      const approval = `signed-candidate-${arch}.json`;
      for (const file of [approval, f.rpm]) fs.copyFileSync(path.join(staging, file), path.join(draft, file));
      sign('--armor', '--detach-sign', path.join(draft, approval));

      const other = arch === 'arm64' ? 'x64' : 'arm64';
      const assets = [ASSET_NAME(other), f.rpm.replace(record.version, '1.0.0.0'),
        archive, approval, approval + '.asc', f.rpm];
      fs.writeFileSync(path.join(draft, 'release.json'), JSON.stringify({isDraft: true, assets: assets.map(name => ({name}))}));
      f.command('gh', fakeGh);
      f.command('node', 'if [[ $1 == -p && $2 == process.arch ]]; then echo "$ARCH"; else exec "$REAL_NODE" "$@"; fi');
      f.command('sudo', '[[ $1 == chown || $1 == chmod ]] && [[ -f $3 && $3 == "$RUNNER_TEMP/blanc/chrome/chrome-sandbox" ]]');
      if (process.platform === 'darwin') f.command('sha256sum', 'exec shasum -a 256 "$@"');
      const env = {ARCH: arch, CANDIDATE_SHA256: record.tarSha256, DRAFT: draft, REAL_NODE: process.execPath,
        DRAFT_TAG: 'fork-linux-candidate', GITHUB_REPOSITORY: 'fixture/blanc'};
      const install = prepareJob('install', 'Check and download the selected archive, signed RPM and authorization',
        'Authenticate the tarball and both packages before installation', workspace, env);
      const installed = path.join(install.RUNNER_TEMP, 'input');
      assert.deepEqual(fs.readdirSync(path.join(install.RUNNER_TEMP, 'candidate')).sort(), [archive, approval, approval + '.asc', f.rpm].sort());
      assert.equal(read(path.join(installed, 'candidate.json')).id, record.id);
      assert.equal(hash(fs.readFileSync(path.join(installed, 'packages', f.deb))), record.packages[0].sha256);
      assert.equal(hash(fs.readFileSync(path.join(installed, f.rpm))), read(path.join(draft, approval)).rpm.sha256);

      for (const job of ['candidate', 'frame', 'quit', 'keys']) {
        const usesPackage = job === 'quit' || job === 'keys';
        const last = usesPackage ? 'Verify the approval and the Debian package' : "Set up the candidate's sandbox helper";
        const result = prepareJob(job, 'Select candidate assets', last, workspace, env);
        const candidate = read(path.join(result.CANDIDATE_DIR, 'candidate.json'));
        const runtime = runtimeConfig(result.CANDIDATE_DIR, candidate);
        assert.equal(result.ASSET, archive);
        assert.equal(runtime.candidate, record.id);
        assert.equal(hash(fs.readFileSync(runtime.executable)), record.exeSha256);
        assert.equal(fs.readFileSync(path.join(runtime.blockerAssets, 'engine.js'), 'utf8'), 'engine');
        if (usesPackage) {
          assert.deepEqual(fs.readdirSync(path.join(result.RUNNER_TEMP, 'candidate')).sort(), [archive, approval, approval + '.asc'].sort());
          assert.equal(result.QUIT_DEB, path.join(result.CANDIDATE_DIR, 'packages', f.deb));
          assert.equal(result.QUIT_INSTALLED_SHA256, hash('stripped chrome'));
          // A matching approval and DEB cannot authorize a different manifest.
          candidate.packages.find(row => row.file === f.deb).sha256 = '0'.repeat(64);
          fs.writeFileSync(path.join(result.CANDIDATE_DIR, 'candidate.json'), JSON.stringify(candidate));
          assert.throws(() => prepareQuitInput(arch, result.CANDIDATE_DIR, path.join(result.RUNNER_TEMP, 'candidate'),
            record.tarSha256, key), {code: 'ERR_ASSERTION'});
        }
      }
    });
  }
});
