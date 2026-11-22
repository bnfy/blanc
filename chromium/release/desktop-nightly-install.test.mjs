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
  assert.match(entry, /BLANC_NIGHT_TOKEN="\$token" node chromium\/release\/daily\/desktop-nightly\.mjs "\$@"/);
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
