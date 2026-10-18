import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';

// Only a fresh caller-owned disposable directory. Never install in a keychain.
export function createCertificates(directory, hosts) {
  if (!hosts.length || hosts.some(h => !/^[a-z0-9.-]+$/.test(h))) throw new Error('Invalid fixture hosts');
  fs.mkdirSync(directory, {mode:0o700});
  const run = args => execFileSync('openssl', args, {cwd:directory, stdio:'pipe'});
  const version = run(['version']).toString().trim();
  run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem',
    '-days','1','-subj','/CN=Blanc disposable fixture CA','-addext','basicConstraints=critical,CA:TRUE',
    '-addext','keyUsage=critical,keyCertSign,cRLSign']);
  run(['req','-new','-newkey','rsa:2048','-nodes','-keyout','leaf.key','-out','leaf.csr',
    '-subj','/CN=Blanc disposable fixture server']);
  fs.writeFileSync(path.join(directory,'leaf.ext'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName='+hosts.map(h=>'DNS:'+h).join(',')+'\n');
  run(['x509','-req','-in','leaf.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial',
    '-out','leaf.pem','-days','1','-extfile','leaf.ext']);
  for (const name of ['ca.key','leaf.key']) fs.chmodSync(path.join(directory,name),0o600);
  const ca=fs.readFileSync(path.join(directory,'ca.pem'),'utf8');
  const cert=fs.readFileSync(path.join(directory,'leaf.pem'),'utf8');
  return {ca,cert,key:fs.readFileSync(path.join(directory,'leaf.key'),'utf8'),hosts,version,
    caFingerprint:new X509Certificate(ca).fingerprint256,
    leafFingerprint:new X509Certificate(cert).fingerprint256};
}
