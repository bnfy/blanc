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
const hosts=['page.fixture.test'];
const proxy=createCertificates(path.join(dir,'certificates'),hosts);
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
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
