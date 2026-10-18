import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import {createRequire} from 'node:module';
import {createCertificates} from './certificates.mjs';
import {startProxy,fixtureSet} from './proxy.mjs';
const {createVerifier}=createRequire(import.meta.url)('./fixture-trust.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-fixture-tls-test-'));
const {urls}=fixtureSet('https');
const hosts=[...new Set(Object.values(urls).map(u=>new URL(u).hostname))];
const material=createCertificates(path.join(dir,'certificates'),hosts);
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
function tunnel(port, authority) {
  return new Promise((resolve,reject)=>{
    const socket=net.connect(port,'127.0.0.1');socket.setTimeout(5000,()=>socket.destroy(new Error('Tunnel timeout')));
    socket.once('error',reject);
    socket.once('connect',()=>socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`));
    socket.once('data', data=>resolve({socket,header:data.toString()}));
  });
}
async function get(port, host, ca, hostHeader=host) {
  const {socket,header}=await tunnel(port,host+':443');assert.match(header,/200 Connection Established/);
  return new Promise((resolve,reject)=>{
    const secure=tls.connect({socket,servername:host,ca});let data='';
    secure.once('secureConnect',()=>secure.write(`GET /data.json HTTP/1.1\r\nHost: ${hostHeader}\r\nConnection: close\r\n\r\n`));
    secure.on('data',part=>data+=part);secure.once('end',()=>resolve(data));secure.once('error',reject);
  });
}
test('scoped verifier requires generated leaf, CA, host and validity',()=>{
  const verify=createVerifier(material);
  assert(verify(hosts[0],material.cert));
  assert(!verify('unlisted.invalid',material.cert));
  assert(!verify(hosts[0],material.ca));
  assert(!verify(hosts[0],'not a certificate'));
  assert(!verify(hosts[0],material.cert,0));
  assert(!verify(hosts[0],material.cert,Date.now()+3*86400000));
});
test('verified HTTPS CONNECT preserves original URL and Host',async()=>{
  const p=await startProxy({scheme:'https',tlsMaterial:material});
  try {
    const response=await get(p.port,new URL(urls.data).hostname,material.ca);
    assert.match(response,/200 OK/);assert.match(response,/"fixture":"allowed"/);
    const row=p.requests.find(r=>r.method==='GET');
    assert.equal(row.url,urls.data);assert.equal(row.host,new URL(urls.data).host);assert(row.encrypted);
  } finally {await p.close();}
});
test('untrusted fixture CA is rejected by the TLS client',async()=>{
  const p=await startProxy({scheme:'https',tlsMaterial:material});
  try {await assert.rejects(get(p.port,new URL(urls.data).hostname,undefined),/certificate|issuer/i);}
  finally {await p.close();}
});
test('unknown CONNECT host or port is refused before TLS',async()=>{
  const p=await startProxy({scheme:'https',tlsMaterial:material});
  try {for(const a of ['unlisted.invalid:443',hosts[0]+':8443','127.0.0.1:443']) {
    const {socket,header}=await tunnel(p.port,a);assert.match(header,/502/);socket.destroy();
  }} finally {await p.close();}
});
test('Host differing from tunnel authority is refused',async()=>{
  const p=await startProxy({scheme:'https',tlsMaterial:material});
  try {assert.match(await get(p.port,new URL(urls.data).hostname,material.ca,hosts[0]),/502/);}
  finally {await p.close();}
});
