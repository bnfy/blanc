// W3 Task B3: the owner's key ceremony (chromium/windows/owner/update-keys-make.command),
// run with a stand-in for 1Password: it stores both private keys, verifies
// them, leaves only the two public halves, prints no secret, and refuses to
// replace keys that exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('../windows/owner/update-keys-make.command', import.meta.url));
const openssl = '/opt/homebrew/opt/openssl@3/bin/openssl';
const usable = process.platform === 'darwin' && fs.existsSync(openssl);

function fakeOp(dir) {
  const vault = path.join(dir, 'vault'); fs.mkdirSync(vault);
  const op = path.join(dir, 'op');
  fs.writeFileSync(op, `#!/bin/bash
set -e; V='${vault}'
[ "$OP_BIOMETRIC_UNLOCK_ENABLED" = true ] || { echo 'not signed in' >&2; exit 1; }
case "$1 $2" in
  "vault get") [ "$3" = Dev ] && exit 0 || exit 1;;
  "item list") python3 -c 'import json,os,sys; print(json.dumps([{"title": n} for n in os.listdir(sys.argv[1])]))' "$V";;
  "document create") cp "$3" "$V/$7";;
  "document get") echo "\${9}" >> '${dir}/key-paths'; cp "$V/$3" "\${9}";;
  *) echo "fake op: $*" >&2; exit 2;;
esac
`, {mode: 0o755});
  return {op, vault};
}

// The scripts make their working folder under BLANC_WORK_TMP: a private folder
// per run, so another suite running on the same machine never shows up in it.
// It must be empty afterwards, and every key the stand-in for 1Password wrote
// must have been inside it (so the script really used it) and gone.
function privateTmp(dir) {
  const root = path.join(dir, 'tmp'); fs.mkdirSync(root);
  return root;
}
function assertNothingLeft(root, keyPaths, message) {
  assert.deepEqual(fs.readdirSync(root), [], message);
  const paths = fs.readFileSync(keyPaths, 'utf8').trim().split('\n');
  assert.ok(paths.length > 0 && paths.every(p => p.startsWith(root + '/')), `keys were written under ${root}: ${paths.join(', ')}`);
  for (const p of paths) assert.ok(!fs.existsSync(p), `${p} is gone`);
}

test('the key ceremony keeps only public halves and stores verified private keys', {skip: !usable && 'needs Homebrew OpenSSL 3 on a Mac'}, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-keys-test-'));
  const {op, vault} = fakeOp(dir), out = path.join(dir, 'out');
  const tmp = privateTmp(dir);
  const run = spawnSync('bash', [script], {env: {...process.env, BLANC_OP: op, BLANC_KEYS_OUT: out, BLANC_WORK_TMP: tmp}, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.deepEqual(fs.readdirSync(out).sort(), ['crx-public.der', 'cup-public.der']);
  assert.deepEqual(fs.readdirSync(vault).sort(), ['Blanc Windows Beta CRX Publisher Key', 'Blanc Windows Beta CUP Key']);
  for (const file of fs.readdirSync(vault)) assert.match(fs.readFileSync(path.join(vault, file), 'utf8'), /BEGIN PRIVATE KEY/);
  const text = name => spawnSync(openssl, ['pkey', '-pubin', '-inform', 'DER', '-in', path.join(out, name), '-text', '-noout'], {encoding: 'utf8'}).stdout;
  assert.match(text('cup-public.der'), /ML-DSA-44/);
  assert.match(text('crx-public.der'), /Public-Key: \(4096 bit\)/);
  assert.doesNotMatch(run.stdout + run.stderr, /PRIVATE|BEGIN/);
  assert.match(run.stdout, /cup-public\.der sha256 [0-9a-f]{64}/);
  assertNothingLeft(tmp, path.join(dir, 'key-paths'), 'no working folder is left');
  const again = spawnSync('bash', [script], {env: {...process.env, BLANC_OP: op, BLANC_KEYS_OUT: out, BLANC_WORK_TMP: tmp}, encoding: 'utf8'});
  assert.notEqual(again.status, 0);
  assert.match(again.stdout, /no key is replaced/);
  fs.rmSync(dir, {recursive: true, force: true});
});

// The committed public keys (B3): recorded in update-keys.md, built into the
// updater exactly (cup_public_key.h, updater.gni's crx_pkhash), and never a
// private key anywhere in chromium/.
import crypto from 'node:crypto';
import {cupHeader, crxPkHash} from './update-keys.mjs';
const repoFile = rel => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const der = name => fs.readFileSync(repoFile(`windows/keys/${name}-public.der`));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('the committed public keys are the ones update-keys.md records', () => {
  const doc = fs.readFileSync(repoFile('windows/update-keys.md'), 'utf8');
  for (const name of ['cup', 'crx']) assert.ok(doc.includes(sha(der(name))), `${name}-public.der's SHA-256 in update-keys.md`);
  // ML-DSA-44 SubjectPublicKeyInfo (RFC 9881): its OID 2.16.840.1.101.3.4.3.17
  // and a 1312-byte key, read from the DER (not every Node knows ML-DSA yet).
  const cup = der('cup');
  assert.equal(cup.subarray(0, 4).toString('hex'), '30820532');
  assert.equal(cup.subarray(4, 17).toString('hex'), '300b0609608648016503040311');
  assert.equal(cup.subarray(17, 22).toString('hex'), '0382052100');
  assert.equal(cup.length - 22, 1312);
  const crx = crypto.createPublicKey({key: der('crx'), format: 'der', type: 'spki'});
  assert.equal(crx.asymmetricKeyType, 'rsa');
  assert.equal(crx.asymmetricKeyDetails.modulusLength, 4096);
});
test('the updater carries exactly those keys', () => {
  assert.equal(fs.readFileSync(repoFile('blanc/branding/win-beta/cup_public_key.h'), 'utf8'), cupHeader(der('cup'), 1));
  assert.equal(crxPkHash(der('crx')), crypto.createHash('sha256').update(der('crx')).digest('base64'));
  assert.match(fs.readFileSync(repoFile('blanc/branding/win-beta/updater.gni'), 'utf8'),
    new RegExp(`^crx_pkhash = "${crxPkHash(der('crx')).replace(/[+/=]/g, c => '\\' + c)}"$`, 'm'));
});
test('no private key is anywhere under chromium/', () => {
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full); continue; }
      const text = fs.readFileSync(full).toString('latin1');
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text) && !full.endsWith('windows-update-keys.test.mjs')) found.push(full);
    }
  };
  walk(repoFile('').replace(/\/$/, ''));
  assert.deepEqual(found, []);
});

// Patch 0102: Blanc's updater checks update answers with Blanc's CUP key and
// update packages with Blanc's publisher key; everything else keeps Chromium's.
test('patch 0102 gives the updater Blanc\'s keys and leaves the browser\'s alone', () => {
  const patch = fs.readFileSync(repoFile('patches/0102-blanc-windows-update-keys.patch'), 'utf8');
  const lane = JSON.parse(fs.readFileSync(repoFile('lanes/desktop.json'), 'utf8')).patches.map(p => p.split('/').pop());
  assert.equal(lane.indexOf('0102-blanc-windows-update-keys.patch'), lane.indexOf('0101-blanc-windows-updater-integration.patch') + 1);
  const added = file => {
    const start = patch.indexOf(`+++ b/${file}\n`);
    assert.ok(start >= 0, `0102 patches ${file}`);
    const end = patch.indexOf('\n--- ', start);
    return patch.slice(start, end < 0 ? undefined : end).split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n');
  };
  // update_client: an embedder may name its own CUP key; none by default.
  assert.match(added('components/update_client/configurator.h'), /virtual std::optional<CupKey> GetCupKey\(\) const;/);
  assert.match(added('components/update_client/update_client.cc'), /std::optional<CupKey> Configurator::GetCupKey\(\) const \{\n\+  return std::nullopt;/);
  assert.match(added('components/update_client/request_sender.cc'), /if \(cup_key\)/);
  for (const file of ['components/update_client/update_checker.cc', 'components/update_client/ping_manager.cc'])
    assert.match(added(file), /config_->GetCupKey\(\)/, file);
  // The updater names Blanc's key, only when built for the Windows beta.
  assert.match(added('chrome/updater/configurator.cc'), /#include "blanc\/branding\/win-beta\/cup_public_key\.h"/);
  assert.match(added('chrome/updater/configurator.cc'), /blanc_updater::kCupKeyVersion/);
  assert.match(added('chrome/updater/BUILD.gn'), /if \(blanc_channel == "beta"\) \{\n\+      defines \+= \[ "BLANC_UPDATER_KEYS" \]/);
  // Packages: Blanc's publisher key alone once crx_pkhash is set, never no key.
  const constants = added('chrome/updater/external_constants_default.cc');
  assert.match(constants, /std::string_view\(CRX_PKHASH\)\.empty\(\)/);
  assert.match(constants, /VerifierFormat::CRX3;/);
});

// C1: the owner's staging command, with stand-ins for 1Password and wrangler.
test('the staging command installs exactly the seed of the committed key, and nothing else', {skip: !usable && 'needs Homebrew OpenSSL 3 on a Mac'}, () => {
  const staging = fileURLToPath(new URL('../windows/owner/update-worker-staging.command', import.meta.url));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-staging-test-'));
  const pem = path.join(dir, 'key.pem'), pub = path.join(dir, 'pub.der'), other = path.join(dir, 'other.der');
  spawnSync(openssl, ['genpkey', '-algorithm', 'ML-DSA-44', '-out', pem]);
  spawnSync(openssl, ['pkey', '-in', pem, '-pubout', '-outform', 'DER', '-out', pub]);
  spawnSync(openssl, ['genpkey', '-algorithm', 'ML-DSA-44', '-out', path.join(dir, 'other.pem')]);
  spawnSync(openssl, ['pkey', '-in', path.join(dir, 'other.pem'), '-pubout', '-outform', 'DER', '-out', other]);
  const seed = spawnSync(openssl, ['pkey', '-in', pem, '-provparam', 'ml-dsa.output_formats=seed-only', '-outform', 'DER']).stdout.subarray(-32);
  const op = path.join(dir, 'op'), wrangler = path.join(dir, 'wrangler'), calls = path.join(dir, 'calls'), secret = path.join(dir, 'secret');
  fs.writeFileSync(op, `#!/bin/bash\n[ "$OP_BIOMETRIC_UNLOCK_ENABLED" = true ] || exit 1\ncase "$1 $2" in\n "vault get") exit 0;;\n "document get") [ "$3" = "Blanc Windows Beta CUP Key" ] && cp '${pem}' "\${9}";;\n *) exit 2;;\nesac\n`, {mode: 0o755});
  fs.writeFileSync(wrangler, `#!/bin/bash\necho "$*" >> '${calls}'\ncase "$1" in\n deploy) echo "Deployed https://blanc-update.test.workers.dev";;\n secret) cat > '${secret}';;\nesac\n`, {mode: 0o755});
  const tmp = privateTmp(dir);
  const env = {...process.env, BLANC_OP: op, BLANC_WRANGLER: wrangler, BLANC_SKIP_SMOKE: '1', BLANC_WORK_TMP: tmp};
  const run = spawnSync('bash', [staging], {env: {...env, BLANC_CUP_PUBLIC: pub}, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.deepEqual(fs.readFileSync(calls, 'utf8').trim().split('\n'), ['deploy', 'secret put CUP_SEED']);
  assert.equal(fs.readFileSync(secret, 'utf8'), seed.toString('base64'));
  assert.ok(!(run.stdout + run.stderr).includes(seed.toString('base64')), 'the seed is never printed');
  assert.match(run.stdout, /https:\/\/blanc-update\.test\.workers\.dev/);
  fs.rmSync(calls); fs.rmSync(secret);
  const wrong = spawnSync('bash', [staging], {env: {...env, BLANC_CUP_PUBLIC: other}, encoding: 'utf8'});
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stdout, /NOT the committed public key/);
  assert.ok(!fs.existsSync(calls), 'nothing is deployed with the wrong key');
  assert.deepEqual(fs.readdirSync(tmp), [], 'no working folder is left');
  fs.rmSync(dir, {recursive: true, force: true});
});

// D1: the owner's package-signing command, with a stand-in for 1Password.
test('the signing command packages the waiting installer with the committed key and keeps no key', {skip: !usable && 'needs Homebrew OpenSSL 3 on a Mac'}, () => {
  const sign = fileURLToPath(new URL('../windows/owner/update-package-sign.command', import.meta.url));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-sign-test-'));
  const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
  const pem = path.join(dir, 'crx.pem'), pub = path.join(dir, 'crx-public.der'), packages = path.join(dir, 'packages');
  fs.writeFileSync(pem, privateKey.export({type: 'pkcs8', format: 'pem'}));
  fs.writeFileSync(pub, publicKey.export({type: 'spki', format: 'der'}));
  for (const v of ['158.0.8127.900', '158.0.8127.901']) {
    fs.mkdirSync(path.join(packages, v), {recursive: true});
    fs.writeFileSync(path.join(packages, v, 'mini_installer.exe'), Buffer.concat([Buffer.from('MZ'), crypto.randomBytes(512)]));
  }
  fs.writeFileSync(path.join(packages, '158.0.8127.900', 'blanc-beta-158.0.8127.900.crx3'), 'already signed');
  const op = path.join(dir, 'op');
  fs.writeFileSync(op, `#!/bin/bash\n[ "$OP_BIOMETRIC_UNLOCK_ENABLED" = true ] || exit 1\ncase "$1 $2" in\n "vault get") exit 0;;\n "document get") [ "$3" = "Blanc Windows Beta CRX Publisher Key" ] && echo "\${9}" >> '${dir}/key-paths' && cp '${pem}' "\${9}";;\n *) exit 2;;\nesac\n`, {mode: 0o755});
  const tmp = privateTmp(dir);
  const run = spawnSync('bash', [sign], {env: {...process.env, BLANC_OP: op, BLANC_PACKAGES: packages, BLANC_CRX_PUBLIC: pub, BLANC_WORK_TMP: tmp}, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /blanc-beta-158\.0\.8127\.901\.crx3: \d+ bytes, sha256 [0-9a-f]{64}/);
  const record = JSON.parse(fs.readFileSync(path.join(packages, '158.0.8127.901', 'package.json'), 'utf8'));
  assert.equal(record.publisherKeySha256, crypto.createHash('sha256').update(fs.readFileSync(pub)).digest('hex'));
  assert.doesNotMatch(run.stdout + run.stderr, /PRIVATE KEY/);
  assertNothingLeft(tmp, path.join(dir, 'key-paths'), 'no key folder is left');
  fs.rmSync(dir, {recursive: true, force: true});
});

// E1 staging gate: the same command deploys and keys the staging server.
test('the gate command deploys and keys the staging server only', {skip: !usable && 'needs Homebrew OpenSSL 3 on a Mac'}, () => {
  const gate = fileURLToPath(new URL('../windows/owner/update-worker-gate.command', import.meta.url));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-gate-test-'));
  const pem = path.join(dir, 'key.pem'), pub = path.join(dir, 'pub.der');
  spawnSync(openssl, ['genpkey', '-algorithm', 'ML-DSA-44', '-out', pem]);
  spawnSync(openssl, ['pkey', '-in', pem, '-pubout', '-outform', 'DER', '-out', pub]);
  const op = path.join(dir, 'op'), wrangler = path.join(dir, 'wrangler'), calls = path.join(dir, 'calls');
  fs.writeFileSync(op, `#!/bin/bash\n[ "$OP_BIOMETRIC_UNLOCK_ENABLED" = true ] || exit 1\ncase "$1 $2" in\n "vault get") exit 0;;\n "document get") cp '${pem}' "\${9}";;\n *) exit 2;;\nesac\n`, {mode: 0o755});
  fs.writeFileSync(wrangler, `#!/bin/bash\necho "$*" >> '${calls}'\ncase "$1" in\n deploy) echo "Deployed https://blanc-update-staging.test.workers.dev";;\n secret) cat > /dev/null;;\nesac\n`, {mode: 0o755});
  const tmp = privateTmp(dir);
  const run = spawnSync('bash', [gate], {env: {...process.env, BLANC_OP: op, BLANC_WRANGLER: wrangler, BLANC_SKIP_SMOKE: '1', BLANC_CUP_PUBLIC: pub, BLANC_WORK_TMP: tmp}, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.deepEqual(fs.readdirSync(tmp), [], 'no working folder is left');
  assert.deepEqual(fs.readFileSync(calls, 'utf8').trim().split('\n'), ['deploy --env staging', 'secret put CUP_SEED --env staging']);
  assert.match(run.stdout, /staging update server \(release gate\) is https:\/\/blanc-update-staging\.test\.workers\.dev/);
  fs.rmSync(dir, {recursive: true, force: true});
});
