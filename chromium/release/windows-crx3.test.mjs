// W3 Task D1: Blanc's Windows update packages are CRX3 files signed with
// Blanc's publisher key, as components/crx_file/crx_verifier.cc reads them.
// The real verifier runs in Task D2's proof; here a mirror of its rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {makeCrx3, readCrx3, verifyCrx3, storedZip, unzipStored} from './windows-crx3.mjs';

const keys = () => crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
const spki = pub => pub.export({type: 'spki', format: 'der'});
const signer = priv => async message => crypto.sign('sha256', message, priv);
const hash = der => crypto.createHash('sha256').update(der).digest();

test('a stored zip round-trips its files byte for byte', () => {
  const files = [{name: 'mini_installer.exe', bytes: crypto.randomBytes(5000)}, {name: 'b.txt', bytes: Buffer.from('hi')}];
  assert.deepEqual(unzipStored(storedZip(files)).map(f => [f.name, f.bytes.toString('hex')]), files.map(f => [f.name, f.bytes.toString('hex')]));
});
test('a package verifies with its own key and its id comes from that key', async () => {
  const {publicKey, privateKey} = keys();
  const crx = await makeCrx3({files: [{name: 'mini_installer.exe', bytes: Buffer.from('MZ installer')}], publicKeyDer: spki(publicKey), sign: signer(privateKey)});
  assert.equal(crx.subarray(0, 4).toString('latin1'), 'Cr24');
  assert.equal(crx.readUInt32LE(4), 3);
  const parsed = readCrx3(crx);
  assert.equal(parsed.proofs.length, 1);
  assert.deepEqual(parsed.crxId, hash(spki(publicKey)).subarray(0, 16));
  assert.deepEqual(verifyCrx3(crx, hash(spki(publicKey))), {ok: true});
  assert.equal(unzipStored(parsed.archive)[0].bytes.toString(), 'MZ installer');
});
test('another key, a changed archive or a changed header is refused', async () => {
  const mine = keys(), theirs = keys();
  const files = [{name: 'mini_installer.exe', bytes: Buffer.from('MZ installer')}];
  const crx = await makeCrx3({files, publicKeyDer: spki(mine.publicKey), sign: signer(mine.privateKey)});
  assert.equal(verifyCrx3(crx, hash(spki(theirs.publicKey))).ok, false, 'not signed by the required key');
  const tampered = Buffer.from(crx); tampered[tampered.length - 30] ^= 1;
  assert.equal(verifyCrx3(tampered, hash(spki(mine.publicKey))).ok, false, 'archive changed');
  const forged = await makeCrx3({files, publicKeyDer: spki(mine.publicKey), sign: signer(theirs.privateKey)});
  assert.equal(verifyCrx3(forged, hash(spki(mine.publicKey))).ok, false, 'signature by another key under my public key');
});
