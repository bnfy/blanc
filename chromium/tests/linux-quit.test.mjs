import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs, { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { NativeFixture } from './lib/fixture.mjs';
import { runtimeConfig } from '../linux/candidate.mjs';
import { BrowserProcesses, closePoint, observeExit, processTable, QuitFixture } from './linux-quit.mjs';

const workflow = YAML.parse(readFileSync(new URL('../../.github/workflows/chromium-linux-candidate.yml', import.meta.url), 'utf8'));
function scratch(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'blanc-quit-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('installed quit and keys use the default blocker, while the unpacked candidate supplies its bundle', async t => {
  const tmp = scratch(t);
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  const archiveHash = sha('archive'), installedHash = sha('installed');
  const candidate = {id:'linux-x64-' + archiveHash.slice(0,16), exeSha256:archiveHash};
  const loose = runtimeConfig(tmp, candidate);
  const installed = runtimeConfig(tmp, candidate, installedHash);
  assert.equal(installed.executable, '/opt/bnfy/blanc-prototype/chrome');
  assert.equal(installed.archiveExecutableSha256, loose.executableSha256);
  writeFileSync(loose.executable, 'archive');
  t.mock.method(fs, 'readFileSync', (file,...args) =>
    file === installed.executable ? Buffer.from('installed') : readFileSync(file,...args));
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {...platform,value:'linux'});
  t.after(() => Object.defineProperty(process, 'platform', platform));
  const captured = Error('captured browser launch');
  t.mock.method(NativeFixture.prototype, 'start', function (url, {waitBlocker=true}={}) {
    assert.equal(waitBlocker,true);
    throw captured;
  });
  for (const config of [installed, loose]) {
    const fixture = new QuitFixture();
    fixture.reapHelpers = () => []; // start() stops before spawning.
    try {
      await assert.rejects(fixture.launch(config, path.join(tmp,config.executableSha256), {diskAssets:false}), error => error === captured);
      const flags = fixture.flags.filter(flag => flag.startsWith('--blanc-blocker-assets'));
      assert.deepEqual(flags, config === installed ? [] : ['--blanc-blocker-assets=' + path.join(tmp,'blocker')]);
    } finally { await fixture.close(); }
  }
  assert.doesNotMatch(workflow.jobs.keys.steps.map(step => step.run).join('\n'), /blockerAssets|blanc-blocker-assets/);
});

const table = (...rows) => rows.map(([pid, parent, start]) => ({ pid, parent, start }));

test('the pre-click tree includes grandchildren and keeps orphans across both closes', () => {
  const tree = new BrowserProcesses(41);
  assert.deepEqual(tree.sample(table([43, 42, 'a'], [40, 1, 'b'], [41, 40, 'c'], [42, 41, 'd'])), [41, 42, 43]);
  assert.deepEqual(tree.sample(table([41, 40, 'c'], [43, 1, 'a'], [44, 41, 'e'])), [41, 43, 44]);
  assert.deepEqual(tree.sample(table([43, 1, 'a'], [45, 43, 'f'])), [43, 45]);
  assert.deepEqual(tree.sample(table([41, 1, 'reused'], [46, 41, 'new'], [43, 1, 'reused'])), []);
});

test('an absent browser cannot establish an empty passing baseline', () => {
  assert.throws(() => new BrowserProcesses(41).sample([]), /browser/i);
});

test('an unseen reparented profile helper and its child prevent a clean exit before cleanup', async t => {
  const proc = scratch(t);
  const profile = '/tmp/one window, one tab/profile';
  function processRow(pid, parent, ...args) {
    const dir = path.join(proc, String(pid));
    mkdirSync(dir);
    writeFileSync(path.join(dir, 'stat'), [pid, '(test helper)', 'S', parent, ...Array(17).fill('0'), pid * 2].join(' '));
    writeFileSync(path.join(dir, 'cmdline'), ['chrome', ...args, ''].join('\0'));
  }
  processRow(41, 1, '--user-data-dir=' + profile);
  const tree = new BrowserProcesses(41);
  assert.deepEqual(tree.sample(processTable(profile, proc)), [41]);
  rmSync(path.join(proc, '41'), { recursive: true });
  processRow(52, 1, '--user-data-dir=' + profile);
  processRow(53, 52);
  processRow(54, 1, '--user-data-dir=' + profile + '-other');
  processRow(55, 1, '--title=--user-data-dir=' + profile);
  const read = () => ({ exitCode: 0, leftoverPids: tree.sample(processTable(profile, proc)) });
  assert.deepEqual(await observeExit(read, performance.now() + 15),
    { passed: false, exitCode: 0, leftoverPids: [52, 53] });
});

test('cleanup reports PIDs that appeared after the last process sample', t => {
  t.mock.method(NativeFixture.prototype, 'reapHelpers', () => [52]);
  const fixture = new QuitFixture();
  assert.throws(() => fixture.reapHelpers(), /cleanup.*52/i);
  assert.deepEqual(fixture.reapedPids, [52]);
});

const strip = { x: 85, y: 88, width: 900, height: 52 };
const geometry = { x: 80, y: 80, width: 910, height: 560 };
const button = x => ({ kind: 'close', x, y: 2, width: 24, height: 26 });
test('the real Close center follows the payload on either side of the strip', () => {
  for (const x of [4, 870]) {
    assert.deepEqual(closePoint([button(x)], strip, geometry), { x: 85 + x + 12, y: 103 });
  }
});

test('refuses a stale window, absent or ambiguous Close, and empty bounds', () => {
  assert.throws(() => closePoint([button(2)], strip, { ...geometry, x: 1400 }));
  for (const buttons of [[], [button(1), button(2)], [{ ...button(3), width: 0 }]]) {
    assert.throws(() => closePoint(buttons, strip, geometry));
  }
});

test('exit code zero still waits for all pre-click PIDs', async () => {
  const states = [
    { exitCode: null, leftoverPids: [41, 43] },
    { exitCode: 0, leftoverPids: [43] },
    { exitCode: 0, leftoverPids: [] },
  ];
  const result = await observeExit(() => states.shift(), performance.now() + 3000);
  assert.deepEqual(result, { passed: true, exitCode: 0, leftoverPids: [] });
  assert.equal(states.length, 0);
});

test('a signal, a crash, a survivor, or an expired deadline cannot pass', async () => {
  for (const state of [
    { exitCode: null, leftoverPids: [] },
    { exitCode: 1, leftoverPids: [] },
    { exitCode: 0, leftoverPids: [43] },
  ]) {
    const result = await observeExit(() => state, performance.now() + 10);
    assert.deepEqual(result, { passed: false, ...state });
  }
  const late = await observeExit(() => ({ exitCode: 0, leftoverPids: [] }), performance.now() - 1);
  assert.equal(late.passed, false);
});

test('quit dispatch selects one architecture and preserves the existing candidate inputs', () => {
  const { inputs } = workflow.on.workflow_dispatch;
  for (const check of ['candidate', 'smoke', 'frame', 'repo-metadata', 'quit']) assert.ok(inputs.check.options.includes(check));
  assert.equal(inputs.check.default, 'candidate');
  assert.deepEqual(inputs.arch.options, ['x64', 'arm64']);
  assert.match(workflow.jobs.quit.if, /inputs\.check == 'quit'/);
  assert.match(workflow.jobs.quit['runs-on'], /ubuntu-24\.04-arm/);
  assert.match(workflow.jobs.quit['runs-on'], /'ubuntu-24\.04'/);
  assert.ok(workflow.jobs.quit.steps.some(step => step.run?.includes('node chromium/tests/linux-quit.mjs')));
});

const quitSteps = workflow.jobs.quit.steps;
const stepIndex = name => quitSteps.findIndex(step => step.name === name);

function runSteps(script, dir, env) {
  return spawnSync('bash', ['-euo', 'pipefail', '-c', script], { cwd: dir, encoding: 'utf8',
    env: { ...process.env, RUNNER_TEMP: dir, GITHUB_ENV: path.join(dir, 'env'),
      DRAFT_TAG: 'fork-linux-candidate', GITHUB_REPOSITORY: 'test/blanc', ...env } });
}

test('quit downloads only the runner architecture archive and names it when unavailable', t => {
  const assets = quitSteps[stepIndex('Select candidate assets')].run;
  const download = quitSteps[stepIndex('Download the candidate from the draft release')].run;
  const bytes = 'candidate tarball';
  const digest = createHash('sha256').update(bytes).digest('hex');
  const script = `
    if [[ $(uname -s) == Darwin ]]; then sha256sum() { shasum -a 256 "$@"; }; fi
    gh() {
      case "$2" in
        view) cat release.json ;;
        download)
          [[ $6 == --pattern && $7 == "$ASSET" && $8 == --dir ]]
          cp "$7" "$9"
          ;;
        *) return 1 ;;
      esac
    }
    ${assets}
    source "$GITHUB_ENV"
    ${download}`;
  for (const arch of ['arm64', 'x64']) {
    const expected = 'blanc-linux-' + arch + '-candidate.tar.gz';
    const run = name => {
      const dir = scratch(t);
      symlinkSync(new URL('../', import.meta.url), path.join(dir, 'chromium'), 'dir');
      writeFileSync(path.join(dir, 'release.json'), JSON.stringify({isDraft: true, assets: [{name}]}));
      writeFileSync(path.join(dir, name), bytes);
      return runSteps(script, dir, {ARCH: arch, GITHUB_JOB: 'quit', CANDIDATE_SHA256: digest});
    };
    const legacy = run('blanc-linux-candidate.tar.gz');
    assert.notEqual(legacy.status, 0, 'legacy archive must be refused');
    assert.ok(legacy.stderr.includes(expected), legacy.stderr);
    const selected = run(expected);
    assert.equal(selected.status, 0, selected.stderr);
    assert.ok(selected.stdout.includes(expected + ': OK'), selected.stdout);
  }
});

test('a quit candidate without its Debian package or the committed repository key refuses before approval', t => {
  const dir = scratch(t);
  const arch = 'arm64';
  const identify = quitSteps[stepIndex("Identify the runner's candidate")].run;
  const run = () => runSteps('node() { echo "$ARCH"; }\n' + identify, dir, {
    ARCH: arch, ASSET: 'blanc-linux-arm64-candidate.tar.gz', CANDIDATE_DIR: dir,
  });
  writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify({ platform: 'linux', arch, packages: [] }));
  let result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\.deb/);
  mkdirSync(path.join(dir, 'packages'));
  writeFileSync(path.join(dir, 'packages/blanc-prototype_1-1_arm64.deb'), '');
  result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /blanc-repository\.asc/);
  mkdirSync(path.join(dir, 'chromium/linux/keys'), { recursive: true });
  writeFileSync(path.join(dir, 'chromium/linux/keys/blanc-repository.asc'), 'fixture public key');
  result = run();
  assert.equal(result.status, 0, result.stderr);
});
