// W3 Task D1: one Windows update package, as the owner's signing step makes
// it: the installer in a CRX3 signed with the publisher key, refused unless
// that key is the committed one, checked before it is written.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {makePackage} from './windows-package.mjs';
import {verifyCrx3, readCrx3, unzipStored} from './windows-crx3.mjs';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-package-'));
  const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
  const keyPem = path.join(dir, 'crx.pem'), publicDer = path.join(dir, 'crx-public.der'), installer = path.join(dir, 'mini_installer.exe');
  fs.writeFileSync(keyPem, privateKey.export({type: 'pkcs8', format: 'pem'}));
  fs.writeFileSync(publicDer, publicKey.export({type: 'spki', format: 'der'}));
  fs.writeFileSync(installer, Buffer.concat([Buffer.from('MZ'), crypto.randomBytes(10000)]));
  return {dir, keyPem, publicDer, installer};
}

test('the package holds the installer, signed by the committed publisher key', async () => {
  const s = setup(), out = path.join(s.dir, 'out');
  const result = await makePackage({installer: s.installer, keyPem: s.keyPem, publicDer: s.publicDer, version: '158.0.8127.901', outDir: out});
  const crx = fs.readFileSync(path.join(out, 'blanc-beta-158.0.8127.901.crx3'));
  assert.deepEqual(verifyCrx3(crx, crypto.createHash('sha256').update(fs.readFileSync(s.publicDer)).digest()), {ok: true});
  const [file] = unzipStored(readCrx3(crx).archive);
  assert.equal(file.name, 'mini_installer.exe');
  assert.ok(file.bytes.equals(fs.readFileSync(s.installer)));
  assert.deepEqual(result, JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8')));
  assert.equal(result.sha256, crypto.createHash('sha256').update(crx).digest('hex'));
  assert.equal(result.size, crx.length);
  assert.equal(result.version, '158.0.8127.901');
  assert.equal(result.run, 'mini_installer.exe');
  assert.equal(result.installerSha256, crypto.createHash('sha256').update(fs.readFileSync(s.installer)).digest('hex'));
  fs.rmSync(s.dir, {recursive: true, force: true});
});
test('a key that is not the committed one, or a file that is not an installer, makes nothing', async () => {
  const s = setup(), other = setup();
  await assert.rejects(() => makePackage({installer: s.installer, keyPem: other.keyPem, publicDer: s.publicDer, version: '1.2.3.4', outDir: path.join(s.dir, 'a')}), /not the committed publisher key/);
  fs.writeFileSync(path.join(s.dir, 'x.exe'), 'not an exe');
  await assert.rejects(() => makePackage({installer: path.join(s.dir, 'x.exe'), keyPem: s.keyPem, publicDer: s.publicDer, version: '1.2.3.4', outDir: path.join(s.dir, 'b')}), /not a Windows program/);
  await assert.rejects(() => makePackage({installer: s.installer, keyPem: s.keyPem, publicDer: s.publicDer, version: 'beta', outDir: path.join(s.dir, 'c')}), /version/);
  assert.ok(!fs.existsSync(path.join(s.dir, 'a')) && !fs.existsSync(path.join(s.dir, 'b')));
  fs.rmSync(s.dir, {recursive: true, force: true}); fs.rmSync(other.dir, {recursive: true, force: true});
});
