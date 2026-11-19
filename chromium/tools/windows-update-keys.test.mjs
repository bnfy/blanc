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
case "$1 $2" in
  "whoami "*) exit 0;;
  "item get") [ -e "$V/$3" ] && exit 0 || exit 1;;
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
