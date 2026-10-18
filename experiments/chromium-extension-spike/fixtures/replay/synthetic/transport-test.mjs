import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import {createCertificates} from '../pilot/certificates.mjs';
import {buildCandidates,sha} from './generate.mjs';
import {fixturesFor,startSynthetic} from './transport.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-synthetic-transport-test-'));
const hosts=['page.fixture.test','page.blanc-fixture.test','page.fixture.test.blanc-control.test'];
const proxy=createCertificates(path.join(dir,'certificates'),hosts);
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
async function get(port,target='/index.html',extra='',host=hosts[0],material=proxy,sni=host){
 const socket=await new Promise((resolve,reject)=>{
  const s=net.connect(port,'127.0.0.1');s.setTimeout(5000,()=>s.destroy(new Error('timeout')));s.on('error',reject);
  s.once('connect',()=>s.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`));
  s.once('data',header=>{assert.match(header.toString(),/200/);resolve(s);});
 });
 return new Promise((resolve,reject)=>{
  const s=tls.connect({socket,servername:sni,ca:material.ca});let data='';
  s.once('secureConnect',()=>s.write(`GET ${target} HTTP/1.1\r\nHost: ${host}\r\n${extra}Connection: close\r\n\r\n`));
  s.on('data',d=>data+=d);s.once('end',()=>resolve(data));s.on('error',reject);
 });
}

test('known blocked-candidate response and its child exist; unknown requests fault offline',async()=>{
 const text='||page.fixture.test^$script';
 const bundle=buildCandidates([{file:'fixture.txt',sha256:sha(text),text}]);
 const c=bundle.candidates[0],fixtures=fixturesFor([c]);
 const replay=await startSynthetic({fixtures,tlsMaterial:proxy});
 try {
  const response=await get(replay.port,new URL(c.url).pathname);
  assert.match(response,/200 OK/);assert(response.includes('blancFixtureExecuted'));
  // The child is on a second fixture host in real runs. Its authored bytes
  // are asserted here without falsely labelling this a browser execution.
  assert(fixtures.has(c.descendantUrl));assert.equal(fixtures.get(c.descendantUrl).status,200);
  assert.equal(replay.arrivals[0].protocol.upstream,null);
  assert.match(await get(replay.port,'/missing'),/502/);
  assert.equal(replay.faults[0].code,'unmanifested-request');
 }finally{await replay.close();}
});
test('tampered response or duplicate candidate fails manifest construction',()=>{
 const text='||page.fixture.test^$script';
 const c=buildCandidates([{file:'fixture.txt',sha256:sha(text),text}]).candidates[0];
 assert.throws(()=>fixturesFor([c,c]),/Duplicate/);
 c.response.body+='tampered';assert.throws(()=>fixturesFor([c]),/digest/);
});

test('CONNECT selects the correct certificate shard; mismatched SNI is refused',async()=>{
 const other=createCertificates(path.join(dir,'other'),['other.fixture.test']);
 const body='authored';
 const fixtures=new Map(['page.fixture.test','other.fixture.test'].map(h=>['https://'+h+'/index.html',{status:200,contentType:'text/plain',body}]));
 const replay=await startSynthetic({fixtures,tlsMaterial:{entries:[proxy,other]}});
 try {
  assert.match(await get(replay.port),/200 OK/);
  assert.match(await get(replay.port,'/index.html','','other.fixture.test',other),/200 OK/);
  const mismatched=await get(replay.port,'/index.html','','other.fixture.test',other,'page.fixture.test').catch(()=>'TLS rejected');
  assert(!/200 OK/.test(mismatched));assert.equal(replay.arrivals.length,2);
 }finally{await replay.close();}
});

test('authored redirect returns exact Location and refuses an unmanifested target',async()=>{
 const target='https://page.fixture.test/final';const fixtures=new Map([['https://page.fixture.test/index.html',{status:302,contentType:'text/plain',body:'redirect',location:target}],[target,{status:200,contentType:'text/plain',body:'final'}]]);
 const replay=await startSynthetic({fixtures,tlsMaterial:proxy});try{const response=await get(replay.port);assert.match(response,/302/);assert(response.includes('Location: '+target));assert.equal(replay.arrivals.length,1);}finally{await replay.close();}
 fixtures.delete(target);await assert.rejects(()=>startSynthetic({fixtures,tlsMaterial:proxy}),/Unmanifested redirect/);
});

test('authored policy headers are exact and arbitrary or split headers refused',async()=>{
 const response={status:200,contentType:'text/html',body:'authored',policyHeaders:{'Content-Security-Policy':"script-src 'none'"}},fixtures=new Map([['https://page.fixture.test/index.html',response]]);
 const replay=await startSynthetic({fixtures,tlsMaterial:proxy});try{assert((await get(replay.port)).includes("Content-Security-Policy: script-src 'none'"));}finally{await replay.close();}
 for(const policyHeaders of [{'Set-Cookie':'secret=1'},{'Content-Security-Policy':'none\r\nSet-Cookie: bad'}, {'Content-Security-Policy':null}]){response.policyHeaders=policyHeaders;await assert.rejects(startSynthetic({fixtures,tlsMaterial:proxy}),/policy header/);}
});
