import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {sessionBytes} from '../tests/lib/import-fixture.mjs';
import {importBundle} from './build-import-bundle.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));
const bundle=importBundle('v1.46.0');
function importer(){
 const calls=[];
 const denied=name=>(...args)=>{calls.push(name);throw Error('Forbidden host call: '+name);};
 const host={platform:'darwin',env:{},log(){},setTimer(){},monotonicNow:()=>performance.now(),
  randomBytes:n=>new Uint8Array(crypto.randomBytes(n)),
  parseUrl(value,base){try{const u=new URL(value,base);return Object.fromEntries(['href','protocol','username','password','host','hostname','port','pathname','search','hash'].map(k=>[k,u[k]]));}catch{return null;}},
  ...Object.fromEntries(['loadStores','writeStore','persistDesktopStore','fetch','protect','unprotect','emit'].map(k=>[k,denied(k)]))};
 const context=vm.createContext({__host:host});vm.runInContext(bundle,context);
 return {device:{stores:{},calls,context},call:(owner,op,...args)=>{let result;context.__call('desktop.import',JSON.stringify([owner,op,args]),(ok,json)=>{assert.equal(ok,true,json);result=JSON.parse(json);});return result;}};
}
test('desktop parser preserves duplicates, source order, pins and group membership in bare V8',()=>{
 const {call,device}=importer();
 const rows=[{url:'https://example.test/a?private=1',title:'First',pinned:true,group:'Work'},
  {url:'https://example.test/a?private=1',title:'Duplicate',group:'Work'},
  {url:'https://example.test/b',title:'Second window',window:2}];
 const projected=call('one','open',sessionBytes(rows).toString('base64'),'Chrome — Default');
 assert.equal(projected.error,undefined);assert.equal(projected.candidates.length,3);
 assert.deepEqual(projected.candidates.map(c=>c.title),rows.map(r=>r.title));
 assert.equal(projected.candidates[0].pinned,true);
 assert.ok(!JSON.stringify(projected).includes('https://'));assert.ok(!JSON.stringify(projected).includes('private=1'));
 const proposed=call('one','suggest',projected.sessionId);assert.equal(proposed.proposal.groups[0].name,'Work');
 const plan=call('one','plan',projected.sessionId,{generation:projected.generation,...proposed.proposal},[]);
 assert.deepEqual(plan.tabs.map(t=>t.url),rows.map(r=>r.url));assert.deepEqual(plan.tabs.map(t=>t.groupName),['Work','Work',null]);
 assert.equal(call('two','plan',projected.sessionId,{generation:projected.generation,...proposed.proposal},[]).error,'forbidden');
 assert.equal(call('one','plan',projected.sessionId,{generation:'stale',...proposed.proposal},[]).error,'stale-generation');
 call('one','discard');assert.equal(call('one','project',projected.sessionId).error,'session-unavailable');
 assert.deepEqual(device.calls,[],'parsing and planning never call a persistence, network, credential or event host');
});
test('desktop import rejects unsupported and incomplete bytes without state',()=>{
 const {call}=importer();
 for(const bytes of [Buffer.from('malformed'),sessionBytes([],{version:5}),sessionBytes([],{version:8}),sessionBytes([],{marker:false})])
  assert.ok(call('one','open',bytes.toString('base64'),'Source').error);
 const bytes=Buffer.concat([sessionBytes([{url:'https://example.test/'}]),Buffer.from([12,0,6])]);
 assert.equal(call('one','open',bytes.toString('base64'),'Source').error,'incomplete-session');
});
test('selection generations reject excluded, missing and duplicate candidate membership',()=>{
 const {call}=importer();const p=call('one','open',sessionBytes([{url:'https://example.test/a'},{url:'https://example.test/b'}]).toString('base64'),'Source');
 const ids=p.candidates.map(c=>c.candidateId);
 const selected=call('one','select',p.sessionId,{selectedIds:[ids[0]],excludedIds:[ids[1]]});
 assert.equal(selected.generation,p.generation);
 assert.ok(call('one','plan',p.sessionId,{generation:selected.generation,groups:[],ungroupedCandidateIds:ids},[]).error);
 const valid=call('one','plan',p.sessionId,{generation:selected.generation,groups:[],ungroupedCandidateIds:[ids[0]]},[]);
 assert.equal(valid.tabs.length,1);
});

test('isolated import bundle is generated from the pin and cannot dispatch Sync',()=>{
 assert.equal(fs.readFileSync(new URL('../blanc/services/sync_runner/generated/import-bundle.js',import.meta.url),'utf8'),bundle);
 const {device}=importer();
 assert.throws(()=>device.context.__require('src/main/sync.js'),/no module/);
 let answer;device.context.__call('sync.enable','[]',(ok,text)=>answer={ok,text});
 assert.deepEqual(answer,{ok:false,text:'forbidden'});assert.deepEqual(device.calls,[]);
});
