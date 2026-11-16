import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import {createCertificates} from '../pilot/certificates.mjs';
import {startRecorder,publicIPv4,resolveEntrypoint} from './recorder.mjs';
import {startReplay} from './offline.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-recorder-test-'));
const hosts=['page.fixture.test'];
const source=createCertificates(path.join(dir,'source'),hosts),proxy=createCertificates(path.join(dir,'proxy'),hosts);
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
async function origin(body='<p>Public</p>',extraHeaders={},respond=null){
 const hits=[];
 const server=https.createServer({...source,ALPNProtocols:['http/1.1']},(req,res)=>{hits.push(req.headers);if(respond){respond(req,res);return;}res.writeHead(200,{'Content-Type':'text/html','Set-Cookie':'session=SECRET_SENTINEL',...extraHeaders});res.end(body);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {server,hits,port:server.address().port,close:()=>new Promise(r=>{server.close(r);server.closeAllConnections();})};
}
async function get(port,target='/index.html',extra=''){
 const socket=await new Promise((resolve,reject)=>{
  const s=net.connect(port,'127.0.0.1');s.setTimeout(5000,()=>s.destroy(new Error('timeout')));s.on('error',reject);
  s.once('connect',()=>s.write('CONNECT page.fixture.test:443 HTTP/1.1\r\nHost: page.fixture.test:443\r\n\r\n'));
  s.once('data',header=>{assert.match(header.toString(),/200/);resolve(s);});
 });
 return new Promise((resolve,reject)=>{
  const s=tls.connect({socket,servername:hosts[0],ca:proxy.ca});let data='';
  s.once('secureConnect',()=>s.write(`GET ${target} HTTP/1.1\r\nHost: ${hosts[0]}\r\n${extra}Connection: close\r\n\r\n`));
  s.on('data',d=>data+=d);s.once('end',()=>resolve(data));s.on('error',reject);
 });
}
test('record once, strip before write/forward, close origin and replay frozen bytes',async()=>{
 const up=await origin();let rec,replay;
 try {
  rec=await startRecorder({hosts,tlsMaterial:proxy,testOrigin:{port:up.port,ca:source.ca}});
  const first=await get(rec.port,'/index.html','Cookie: SECRET_SENTINEL\r\nAuthorization: SECRET_SENTINEL\r\n');
  assert.match(first,/200 OK/);assert(!first.includes('SECRET_SENTINEL'));
  assert(!up.hits[0].cookie&&!up.hits[0].authorization);
  assert(!JSON.stringify(up.hits).includes('BEGIN CERTIFICATE')); // CA stays local to TLS trust.
  const file=path.join(dir,'bundle.json'),bundle=rec.freeze(file);
  assert(!fs.readFileSync(file,'utf8').includes('SECRET_SENTINEL'));
  assert.equal(bundle.entries[0].protocol.upstream.httpVersion,'1.1');
  await rec.close();rec=null;await up.close();
  replay=await startReplay({bundle,tlsMaterial:proxy});const second=await get(replay.port);
  assert.match(second,/<p>Public<\/p>/);assert.equal(replay.arrivals[0].protocol.upstream,null);
  assert.equal(replay.faults.length,0);
  assert.match(await get(replay.port,'/not-recorded'),/502/);assert.equal(replay.faults[0].code,'unrecorded-request');
 }finally{if(rec)await rec.close();if(replay)await replay.close();if(up.server.listening)await up.close();}
});
test('identifier URL is refused before upstream access and bundle cannot freeze',async()=>{
 const up=await origin(),rec=await startRecorder({hosts,tlsMaterial:proxy,testOrigin:{port:up.port,ca:source.ca}});
 try {
  assert.match(await get(rec.port,'/?token=SECRET_SENTINEL','Sec-Fetch-Dest: image\r\n'),/502/);assert.equal(up.hits.length,0);
  assert.deepEqual(rec.audit,[{outcome:'refused',destination:'image',resourceType:'unknown',party:'unknown',status:null,reason:'identifier-query'}]);
  const file=path.join(dir,'refused.json');assert.throws(()=>rec.freeze(file));assert(!fs.existsSync(file));
  assert(!JSON.stringify(rec.faults).includes('SECRET_SENTINEL'));
 }finally{await rec.close();await up.close();}
});
test('sensitive response body never becomes a bundle or browser response',async()=>{
 const up=await origin('{"sessionId":"SECRET_SENTINEL"}'),rec=await startRecorder({hosts,tlsMaterial:proxy,testOrigin:{port:up.port,ca:source.ca}});
 try {
  const response=await get(rec.port);assert.match(response,/502/);assert(!response.includes('SECRET_SENTINEL'));
  assert.throws(()=>rec.freeze(path.join(dir,'body-refused.json')));assert(!JSON.stringify(rec.faults).includes('SECRET_SENTINEL'));
 }finally{await rec.close();await up.close();}
});
test('upstream uses normal certificate verification, rejecting an unrelated CA',async()=>{
 const up=await origin(),rec=await startRecorder({hosts,tlsMaterial:proxy,testOrigin:{port:up.port,ca:proxy.ca}});
 try {assert.match(await get(rec.port),/502/);assert.equal(up.hits.length,0);assert.throws(()=>rec.freeze(path.join(dir,'bad-ca.json')));}
 finally{await rec.close();await up.close();}
});

test('public IPv4 classification keeps documentation ranges narrow',()=>{
 for(const ip of ['192.0.1.1','192.2.1.1','198.51.101.1','203.0.114.1'])assert(publicIPv4(ip),ip);
 for(const ip of ['192.0.2.1','198.51.100.1','203.0.113.1','192.0.0.1','127.0.0.1','10.1.1.1','169.254.1.1','100.64.0.1','198.18.1.1','198.19.1.1','::1'])assert(!publicIPv4(ip),ip);
});

test('Vary uses upstream identity and refuses a changed forwarded variant offline',async()=>{
 const up=await origin('<p>Public</p>',{Vary:'Accept-Encoding, Accept-Language'});let rec,replay;
 try{
  rec=await startRecorder({hosts,tlsMaterial:proxy,testOrigin:{port:up.port,ca:source.ca}});
  assert.match(await get(rec.port,'/vary','Accept-Encoding: gzip\r\nAccept-Language: en\r\n'),/200 OK/);
  const bundle=rec.freeze(path.join(dir,'vary.json'));assert.equal(up.hits[0]['accept-encoding'],'identity');
  assert.deepEqual(bundle.entries[0].varyRequest,{'accept-encoding':'identity','accept-language':'en'});
  await rec.close();rec=null;await up.close();replay=await startReplay({bundle,tlsMaterial:proxy});
  assert.match(await get(replay.port,'/vary','Accept-Encoding: br\r\nAccept-Language: en\r\n'),/200 OK/);
  assert.match(await get(replay.port,'/vary','Accept-Language: fr\r\n'),/502/);
  assert.equal(replay.faults[0].code,'vary-mismatch');
 }finally{if(rec)await rec.close();if(replay)await replay.close();if(up.server.listening)await up.close();}
});
test('entrypoint preflight follows safe hops, records status, and refuses loops or sensitive locations',async()=>{
 const up=await origin('',{},(req,res)=>{
  if(req.url==='/start'){res.writeHead(302,{Location:'/final'});res.end();}
  else if(req.url==='/loop'){res.writeHead(301,{Location:'/loop'});res.end();}
  else if(req.url==='/secret'){res.writeHead(302,{Location:'/?token=SECRET_SENTINEL'});res.end();}
  else {res.writeHead(403);res.end('not retained');}
 });
 try{
  const resolve=url=>resolveEntrypoint('https://page.fixture.test'+url,{}, {port:up.port,ca:source.ca});
  const result=await resolve('/start');assert.equal(result.final,'https://page.fixture.test/final');assert.deepEqual(result.hops.map(h=>h.status),[302,403]);
  assert.equal((await resolve('/loop')).error,'entrypoint-loop');
  const refused=await resolve('/secret');assert.equal(refused.error,'identifier-query');assert(!JSON.stringify(refused).includes('SECRET_SENTINEL'));
 }finally{await up.close();}
});
