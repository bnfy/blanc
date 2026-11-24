// The Windows nightly's installer and entry script (docs/superpowers/plans/
// 2026-11-21-windows-nightly.md, Task 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const INSTALLER = new URL('./daily/install-desktop-nightly.sh', import.meta.url);
const source = fs.readFileSync(INSTALLER, 'utf8');
const entry = source.slice(source.indexOf("<<'BOOT'\n") + "<<'BOOT'\n".length, source.indexOf('\nBOOT\n'));

test('the installer parses, and its LaunchAgent runs the entry script at 04:00', () => {
  assert.equal(spawnSync('bash', ['-n', fileURLToPath(INSTALLER)]).status, 0);
  assert.match(source, /LABEL=me\.bnfy\.blanc\.desktop-nightly/);
  assert.match(source, /<key>Hour<\/key><integer>4<\/integer><key>Minute<\/key><integer>0<\/integer>/);
  assert.match(source, /<string>\$BASE\/scripts\/desktop-nightly\.sh<\/string>/);
  assert.match(source, /--remove/);
});
test('the entry script sets its own PATH to Homebrew\'s gh and the Studio\'s node, and hands the night its token', () => {
  assert.equal(spawnSync('bash', ['-n'], {input: entry}).status, 0);
  assert.match(entry, /^export PATH="\/usr\/local\/bin:\/opt\/homebrew\/bin:/m);
  assert.match(entry, /BLANC_NIGHT_TOKEN="\$token" node chromium\/release\/daily\/desktop-nightly\.mjs "\$\{night_args\[@\]\}"/);
  assert.ok(entry.indexOf('mkdir "$LOCK"') < entry.indexOf('git checkout'), 'the lock comes before the checkout');
});

function runEntry(setup) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-dn-'));
  const records = path.join(base, 'records');
  fs.mkdirSync(records);
  setup?.(records);
  const script = path.join(base, 'desktop-nightly.sh');
  fs.writeFileSync(script, entry);
  const result = spawnSync('bash', [script, '--records', records], {env: {HOME: base, BLANC_STUDIO_BASE: base}, encoding: 'utf8'});
  const log = fs.existsSync(path.join(records, 'launcher.log')) ? fs.readFileSync(path.join(records, 'launcher.log'), 'utf8') : '';
  return {result, log, records};
}
test('a running night\'s lock skips the launch and is left alone', () => {
  const owner = JSON.stringify({pid: process.pid, token: 't', stamp: '20261122-0400'});
  const {result, log, records} = runEntry(r => { fs.mkdirSync(path.join(r, 'RUNNING')); fs.writeFileSync(path.join(r, 'RUNNING/owner'), owner); });
  assert.equal(result.status, 0);
  assert.match(log, /skipped: a night is running/);
  assert.equal(fs.readFileSync(path.join(records, 'RUNNING/owner'), 'utf8'), owner);
});
test('a lock left by an ended process stops the launch for a person to look at', () => {
  const {result, log, records} = runEntry(r => { fs.mkdirSync(path.join(r, 'RUNNING')); fs.writeFileSync(path.join(r, 'RUNNING/owner'), '{"pid": 4194303}'); });
  assert.equal(result.status, 0);
  assert.match(log, /process that ended/);
  assert.ok(fs.existsSync(path.join(records, 'RUNNING')));
});
test('a night that stops before its checkout lets go of its own lock', () => {
  const {result, log, records} = runEntry();
  assert.notEqual(result.status, 0);
  assert.match(log, /stopped: no worktree/);
  assert.equal(fs.existsSync(path.join(records, 'RUNNING')), false);
});

// Codex final review (2026-11-21).
function fakeNight(records, {relative = false, base} = {}) {
  // A worktree whose "node" records the arguments and lock it ran with.
  base ??= fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-dn-'));
  const tree = path.join(base, 'desktop-nightly');
  fs.mkdirSync(tree);
  const git = path.join(base, 'remote.git');
  spawnSync('git', ['init', '-q', '--bare', git]);
  spawnSync('git', ['-C', tree, 'init', '-q']);
  spawnSync('git', ['-C', tree, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'x']);
  spawnSync('git', ['-C', tree, 'push', '-q', git, 'HEAD:refs/heads/chromium/next']);
  spawnSync('git', ['-C', tree, 'remote', 'add', 'origin', git]);
  fs.mkdirSync(path.join(tree, 'chromium/release/daily'), {recursive: true});
  fs.writeFileSync(path.join(tree, '.gitignore'), 'chromium/\n.gitignore\n');
  fs.writeFileSync(path.join(tree, 'chromium/release/daily/desktop-nightly.mjs'),
    "require('fs').writeFileSync(process.env.SEEN, JSON.stringify({args: process.argv.slice(2), lock: require('fs').existsSync(process.argv[process.argv.indexOf('--records') + 1] + '/RUNNING/owner'), tree: require('fs').existsSync(process.env.BLANC_STUDIO_BASE + '/desktop-nightly.lock')}));");
  fs.renameSync(path.join(tree, 'chromium/release/daily/desktop-nightly.mjs'), path.join(tree, 'chromium/release/daily/desktop-nightly.cjs'));
  const script = path.join(base, 'desktop-nightly.sh');
  fs.writeFileSync(script, entry.replace('node chromium/release/daily/desktop-nightly.mjs', 'node chromium/release/daily/desktop-nightly.cjs'));
  const seen = path.join(base, 'seen.json');
  const args = records === undefined ? [] : ['--records', relative ? path.relative(base, records) : records];
  const result = spawnSync('bash', [script, ...args], {cwd: base, env: {HOME: base, BLANC_STUDIO_BASE: base, SEEN: seen}, encoding: 'utf8'});
  return {base, result, seen: fs.existsSync(seen) ? JSON.parse(fs.readFileSync(seen, 'utf8')) : null};
}
test('Node always gets the absolute records folder whose RUNNING lock the launcher took', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-dn-'));
  const {seen, result} = fakeNight(path.join(base, 'rehearsal'), {relative: true, base});
  assert.equal(result.status, 0, result.stderr);
  const at = seen.args.indexOf('--records');
  assert.equal(seen.args[at + 1], fs.realpathSync(path.join(base, 'rehearsal')));
  assert.equal(seen.lock, true);
  assert.equal(fs.existsSync(path.join(base, 'rehearsal', 'RUNNING')), false, 'the lock it took is the one it let go of');
  const plain = fakeNight(undefined);
  assert.equal(plain.seen.args[plain.seen.args.indexOf('--records') + 1], fs.realpathSync(path.join(plain.base, 'records/nightly/windows')),
    'with no --records, Node gets BLANC_STUDIO_BASE\'s, not its own default');
});
test('two launches with different records never share the worktree at once', () => {
  const {seen} = fakeNight(undefined);
  assert.equal(seen.tree, true, 'the worktree lock is held while the night runs');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-dn-'));
  fs.mkdirSync(path.join(base, 'desktop-nightly.lock'));
  fs.writeFileSync(path.join(base, 'desktop-nightly.lock', 'owner'), JSON.stringify({pid: process.pid}));
  const busy = fakeNight(undefined, {base});
  assert.equal(busy.result.status, 0);
  assert.equal(busy.seen, null, 'no night ran');
  assert.match(fs.readFileSync(path.join(base, 'records/nightly/windows/launcher.log'), 'utf8'), /another night is using the worktree/);
  assert.equal(fs.existsSync(path.join(base, 'records/nightly/windows/RUNNING')), false);
});
test('a worktree lock left by an ended process is cleared (the worktree is checked clean anyway)', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-dn-'));
  fs.mkdirSync(path.join(base, 'desktop-nightly.lock'));
  fs.writeFileSync(path.join(base, 'desktop-nightly.lock', 'owner'), '{"pid": 4194303, "token": "old"}');
  const {seen} = fakeNight(undefined, {base});
  assert.ok(seen, 'the night ran');
  assert.equal(fs.existsSync(path.join(base, 'desktop-nightly.lock')), false);
});
