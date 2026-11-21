import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const linux = fileURLToPath(new URL('../linux/', import.meta.url));
const script = path.join(linux, 'owner/make-repository-key.command');
const key = path.join(linux, 'keys/blanc-repository.asc');
const source = () => fs.readFileSync(script, 'utf8').replace(/\\\n\s*/g, ' ');
const guide = () => fs.readFileSync(path.join(linux, 'repository.md'), 'utf8');
const signing = 'Blanc Linux Repository Signing';
const recovery = signing + ' (passphrase and revocation)';

test('Owner script safeguards', () => {
  assert.equal(fs.statSync(script).mode & 0o777, 0o755);
  const sh = source();
  assert.match(sh, /^#!\/bin\/bash\n/);
  assert.match(sh, /^set -euo pipefail$/m);
  assert.match(sh, /^umask 077$/m);
  assert.match(sh, /^export OP_BIOMETRIC_UNLOCK_ENABLED=true$/m);
  assert.match(sh, /OPACCT=my\.1password\.com/);
  assert.match(sh, /\$\{BLANC_OP:-op\}/);
  assert.match(sh, /\$\{BLANC_WORK_TMP:-/);
  assert.match(sh, /trap cleanup EXIT/);
  assert.match(sh, /STOPPED/);
  assert.doesNotMatch(sh, /--passphrase(?:\s|=)/);
  assert.doesNotMatch(sh, /item create[^\n]*\b(?:password|passphrase|revocation)(?:\[[^\]]*\])?=/i);
});

test('Existing vault items', () => {
  const sh = source();
  assert.ok(sh.includes(`SIGNING_TITLE='${signing}'`));
  assert.ok(sh.includes(`RECOVERY_TITLE='${recovery}'`));
  const open = sh.indexOf('"$OP" vault get Dev');
  const list = sh.indexOf('"$OP" item list --vault Dev');
  assert.ok(open >= 0 && open < list && list < sh.indexOf('--quick-generate-key'));
  // Exercise just the list predicate with synthetic titles. The owner script never runs here.
  const guard = sh.slice(list).match(/^[^\n]*\|\s*python3 -c '([^']+)' "\$SIGNING_TITLE" "\$RECOVERY_TITLE"/);
  assert.ok(guard, 'the vault listing feeds the guard for both titles');
  const check = input => spawnSync('python3', ['-c', guard[1], signing, recovery], {input}).status;
  assert.equal(check(JSON.stringify([{title: 'Another item'}])), 0);
  for (const title of [signing, recovery]) assert.equal(check(JSON.stringify([{title}])), 1);
  assert.notEqual(check('invalid or incomplete listing'), 0);
});

test('Private writes and vault proof', () => {
  const sh = source();
  for (const home of ['make_home', 'proof_home']) {
    assert.ok(sh.includes(home + '=$(mktemp -d'), home + ' is temporary');
    assert.ok(sh.includes('chmod 700 "$' + home + '"'));
    assert.ok(sh.includes('export GNUPGHOME="$' + home + '"'));
  }
  // Inspect file redirects and GnuPG's output paths. Secret exports, imports and recovery
  // data cross process boundaries through pipes. Only the verified public export leaves.
  const writes = [...sh.matchAll(/(?:\s(?:\d*>>?|--output\s+)\s*)(?![>&\s])("[^"]+"|[^\s|;]+)/g)];
  for (const [, target] of writes) {
    assert.match(target, /^(?:\/dev\/null|"\$(?:make_home|proof_home|GNUPGHOME)\/[^"]+")$/);
  }
  assert.match(sh, /--export-secret-keys "\$fingerprint"\s*\|\s*"\$OP" document create - /);
  assert.match(sh, /"\$OP" document get[^\n]*\|\s*gpg --batch --import/);
  assert.match(sh, /"\$OP" item create - /);
  const sign = sh.indexOf('--detach-sign');
  const verify = sh.indexOf('gpgv --keyring');
  assert.ok(sign > sh.indexOf('"$OP" document get') && sign < verify);
  assert.ok(verify < sh.indexOf('"xb"'), 'publish the public file exclusively after verification');
});

test('Repository addresses and fingerprint', () => {
  const doc = guide();
  for (const host of ['pkg.blanc.day', 'pkg-staging.blanc.day']) assert.ok(doc.includes('https://' + host));
  assert.match(doc, /^Fingerprint: (?:\(pending the owner's key run\)|[A-Fa-f0-9]{40})$/m);
});

test('Public signing key', t => {
  if (!fs.existsSync(key)) return t.skip('the owner has not generated blanc-repository.asc yet');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-pub-'));
  t.after(() => fs.rmSync(home, {recursive: true, force: true}));
  const result = spawnSync('gpg', ['--batch', '--show-keys', '--with-colons', key], {
    encoding: 'utf8', env: {...process.env, GNUPGHOME: home},
  });
  if (result.error?.code === 'ENOENT') return t.skip('gpg is unavailable to inspect the public key');
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const armor = fs.readFileSync(key, 'ascii');
  assert.match(armor, /^-----BEGIN PGP PUBLIC KEY BLOCK-----\r?\n/);
  assert.doesNotMatch(armor, /-----BEGIN PGP PRIVATE/);
  const rows = result.stdout.trimEnd().split('\n').map(line => line.split(':'));
  const pubs = rows.filter(([type]) => type === 'pub');
  assert.equal(pubs.length, 1);
  assert.ok(!rows.some(([type]) => ['sub', 'sec', 'ssb'].includes(type)));
  const pub = pubs[0];
  assert.deepEqual(pub.slice(2, 4), ['4096', '1']);
  assert.deepEqual([...new Set(pub[11].toLowerCase())].sort(), ['c', 's']);
  assert.equal(new Date(Number(pub[6]) * 1000).toISOString().slice(0, 10), '2028-11-21');
  const values = type => rows.filter(row => row[0] === type).map(row => row[9]);
  assert.deepEqual(values('uid'), ['Blanc Linux Repository <support@blanc.day>']);
  const recorded = guide().match(/^Fingerprint: ([\da-f]{40})$/im);
  assert.ok(recorded, 'record the fingerprint printed by the owner script');
  assert.deepEqual(values('fpr'), [recorded[1].toUpperCase()]);
});
