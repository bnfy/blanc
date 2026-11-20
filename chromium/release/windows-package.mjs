#!/usr/bin/env node
// One Windows update package (W3 Task D1): the beta's installer in a CRX3
// signed with Blanc's publisher key, for the owner's signing step
// (chromium/windows/owner/update-package-sign.command). Refuses a key that
// is not the committed publisher key, and checks the package against that
// key before writing it. Writes blanc-beta-<version>.crx3 and package.json.
//
//   node chromium/release/windows-package.mjs --installer=EXE --key=PEM --public=DER --version=V --out=DIR
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeCrx3, verifyCrx3} from './windows-crx3.mjs';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest();

export async function makePackage({installer, keyPem, publicDer, version, outDir}) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) throw new Error(`Not a Windows version: ${version}`);
  const bytes = fs.readFileSync(installer);
  if (bytes.subarray(0, 2).toString('latin1') !== 'MZ') throw new Error(`${installer} is not a Windows program`);
  const committed = fs.readFileSync(publicDer);
  const key = crypto.createPrivateKey(fs.readFileSync(keyPem));
  if (!crypto.createPublicKey(key).export({type: 'spki', format: 'der'}).equals(committed))
    throw new Error('The signing key is not the committed publisher key');
  const crx = await makeCrx3({files: [{name: 'mini_installer.exe', bytes}], publicKeyDer: committed,
    sign: async message => crypto.sign('sha256', message, key)});
  const check = verifyCrx3(crx, sha256(committed));
  if (!check.ok) throw new Error(`The package does not verify: ${check.reason}`);
  fs.mkdirSync(outDir, {recursive: true});
  const name = `blanc-beta-${version}.crx3`;
  fs.writeFileSync(path.join(outDir, name), crx, {flag: 'wx'});
  const record = {version, file: name, sha256: sha256(crx).toString('hex'), size: crx.length, run: 'mini_installer.exe',
    installerSha256: sha256(bytes).toString('hex'), publisherKeySha256: sha256(committed).toString('hex')};
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(record, null, 2) + '\n', {flag: 'wx'});
  return record;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const opt = Object.fromEntries(process.argv.slice(2).map(a => /^--([a-z]+)=(.*)$/.exec(a)?.slice(1, 3) ?? ['bad', a]));
  if (opt.bad || !opt.installer || !opt.key || !opt.public || !opt.version || !opt.out) {
    console.error('usage: windows-package.mjs --installer=EXE --key=PEM --public=DER --version=V --out=DIR'); process.exit(2);
  }
  try {
    const record = await makePackage({installer: opt.installer, keyPem: opt.key, publicDer: opt.public, version: opt.version, outDir: opt.out});
    console.log(JSON.stringify(record));
  } catch (error) { console.error(`Packaging failed: ${error.message}`); process.exitCode = 1; }
}
