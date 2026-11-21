// Bound SAN size without weakening exact-host fixture trust.
import path from 'node:path';
import fs from 'node:fs';
import {X509Certificate,createHash} from 'node:crypto';
import {createCertificates} from '../pilot/certificates.mjs';
export function createCertificateSet(directory,hosts) {
  if(new Set(hosts).size!==hosts.length)throw new Error('Duplicate host');
  fs.mkdirSync(directory,{mode:0o700});
  const entries=[];
  for(let i=0;i<hosts.length;i+=400)entries.push(createCertificates(path.join(directory,String(i)),hosts.slice(i,i+400)));
  return {entries};
}
export const publicTrust = material => ({entries:material.entries.map(({ca,cert,hosts})=>({ca,cert,hosts}))});

export const spkiList=material=>material.entries.map(m=>createHash('sha256').update(new X509Certificate(m.cert).publicKey.export({type:'spki',format:'der'})).digest('base64')).join(',');
