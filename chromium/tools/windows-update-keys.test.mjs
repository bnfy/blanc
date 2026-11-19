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
  "document get") cp "$V/$3" "\${9}";;
  *) echo "fake op: $*" >&2; exit 2;;
esac
`, {mode: 0o755});
  return {op, vault};
}

test('the key ceremony keeps only public halves and stores verified private keys', {skip: !usable && 'needs Homebrew OpenSSL 3 on a Mac'}, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-keys-test-'));
  const {op, vault} = fakeOp(dir), out = path.join(dir, 'out');
  const before = fs.readdirSync('/private/tmp').filter(n => n.startsWith('blanc-win-keys.'));
  const run = spawnSync('bash', [script], {env: {...process.env, BLANC_OP: op, BLANC_KEYS_OUT: out}, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.deepEqual(fs.readdirSync(out).sort(), ['crx-public.der', 'cup-public.der']);
  assert.deepEqual(fs.readdirSync(vault).sort(), ['Blanc Windows Beta CRX Publisher Key', 'Blanc Windows Beta CUP Key']);
  for (const file of fs.readdirSync(vault)) assert.match(fs.readFileSync(path.join(vault, file), 'utf8'), /BEGIN PRIVATE KEY/);
  const text = name => spawnSync(openssl, ['pkey', '-pubin', '-inform', 'DER', '-in', path.join(out, name), '-text', '-noout'], {encoding: 'utf8'}).stdout;
  assert.match(text('cup-public.der'), /ML-DSA-44/);
  assert.match(text('crx-public.der'), /Public-Key: \(4096 bit\)/);
  assert.doesNotMatch(run.stdout + run.stderr, /PRIVATE|BEGIN/);
  assert.match(run.stdout, /cup-public\.der sha256 [0-9a-f]{64}/);
  const after = fs.readdirSync('/private/tmp').filter(n => n.startsWith('blanc-win-keys.'));
  assert.deepEqual(after, before, 'no working folder is left');
  const again = spawnSync('bash', [script], {env: {...process.env, BLANC_OP: op, BLANC_KEYS_OUT: out}, encoding: 'utf8'});
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
