import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {handoffBundle,hashHandoff,HANDOFF_TAG} from './build-handoff-bundle.mjs';
import {makeHandoff} from '../tests/lib/handoff-fixture.mjs';
const bundle=handoffBundle();
// The bundle in bare V8, with only the host calls it may make.
function runner(){
 const calls=[];
 const denied=name=>(...args)=>{calls.push(name);throw Error('Forbidden host call: '+name);};
 const host={platform:'darwin',env:{},log(){},setTimer(){},monotonicNow:()=>performance.now(),
  parseUrl(value,base){try{const u=new URL(value,base);return Object.fromEntries(['href','protocol','username','password','host','hostname','port','pathname','search','hash'].map(k=>[k,u[k]]));}catch{return null;}},
  gcmOpen(key,iv,data,aad){calls.push('gcmOpen');try{const d=crypto.createDecipheriv('aes-256-gcm',Buffer.from(key),Buffer.from(iv));
   d.setAAD(Buffer.from(aad??[]));const bytes=Buffer.from(data);d.setAuthTag(bytes.subarray(bytes.length-16));
   return new Uint8Array(Buffer.concat([d.update(bytes.subarray(0,bytes.length-16)),d.final()]));}catch{return null;}},
  ...Object.fromEntries(['randomBytes','digest','scrypt','hkdf','gcmSeal','loadStores','writeStore','persistDesktopStore','fetch','protect','unprotect','emit'].map(k=>[k,denied(k)]))};
 const context=vm.createContext({__host:host});vm.runInContext(bundle,context);
 const call=(method,command,...args)=>new Promise(resolve=>context.__call(method,JSON.stringify([command,args]),(ok,text)=>resolve(ok?JSON.parse(text):{failed:text})));
 return {calls,context,parse:link=>call('desktop.handoff','parse',link),open:(link,reply)=>call('desktop.handoff','open',link,Buffer.from(reply).toString('base64')),call};
}
test('the committed bundle is shipping\'s module at the pin, with its pinned hash',()=>{
 assert.equal(fs.readFileSync(new URL('../blanc/services/sync_runner/generated/handoff-bundle.js',import.meta.url),'utf8'),bundle);
 assert.match(fs.readFileSync(new URL('../blanc/services/sync_runner/handoff_bundle_hash.h',import.meta.url),'utf8'),new RegExp(hashHandoff(bundle)));
 assert.equal(HANDOFF_TAG,'v1.49.1');
});
test('a link gives only its claim address; anything else is refused',async()=>{
 const r=runner(),h=makeHandoff();
 assert.deepEqual(await r.parse(h.link),{ok:true,claimUrl:`https://tabs.blancbrowser.com/v1/handoffs/${h.id}/claim`,maxResponseBytes:Math.ceil(256*1024*4/3)+2048});
 for(const bad of ['blanc-import://tabs?v=2&id='+h.id+'&key='+h.key.toString('base64url'),h.link+'&extra=1',h.link.replace('tabs?','other?'),
   h.link.replace('blanc-import://tabs','blanc-import://tabs/path'),h.link+'#x',h.link.replace(h.id,h.id.slice(2)),h.link.replace('://tabs','://user@tabs'),
   'https://tabs.blancbrowser.com/v1/handoffs/'+h.id+'/claim','javascript:alert(1)',''])
  assert.deepEqual(await r.parse(bad),{error:'invalid-link'},bad);
 assert.deepEqual(r.calls,[],'reading a link calls nothing on the host');
});
test('a valid handoff opens as cleaned web tabs, in order, with one active tab',async()=>{
 const r=runner(),h=makeHandoff({sourceBrowser:'firefox',tabs:[
  {url:'https://example.test/one',title:'  One   page '},{url:'javascript:alert(1)',title:'bad'},{url:'file:///etc/passwd'},
  {url:'https://user:pass@example.test/secret'},{url:'https://example.test/two',title:'x'.repeat(300),active:true},{url:'http://example.test/three'}]});
 const opened=await r.open(h.link,h.reply);
 assert.equal(opened.ok,true);assert.equal(opened.skippedCount,3);assert.equal(opened.value.sourceBrowser,'firefox');
 assert.deepEqual(opened.value.tabs.map(t=>[t.url,t.active]),[['https://example.test/one',false],['https://example.test/two',true],['http://example.test/three',false]]);
 assert.equal(opened.value.tabs[0].title,'One page');assert.equal([...opened.value.tabs[1].title].length,200);assert.equal(opened.value.tabs[2].title,'example.test');
 assert.deepEqual(r.calls,['gcmOpen'],'opening calls the one decryption and nothing else');
});
test('each failure is shipping\'s error code',async()=>{
 const r=runner(),good=makeHandoff();
 const cases=[
  ['decryption-failed',makeHandoff({tamper:true})],
  ['decryption-failed',(()=>{const h=makeHandoff();return {...h,link:h.link.replace(/key=.*/,'key='+crypto.randomBytes(32).toString('base64url'))};})()],
  ['decryption-failed',makeHandoff({aadId:crypto.randomBytes(16).toString('base64url')})],
  ['invalid-expiry',makeHandoff({expiresAt:Date.now()-1000})],
  ['invalid-expiry',makeHandoff({expiresAt:Date.now()+11*60*1000})],
  ['too-many-tabs',makeHandoff({tabs:Array.from({length:101},(_,i)=>({url:'https://example.test/'+i}))})],
  ['empty',makeHandoff({tabs:[{url:'file:///x'}]})],
  ['empty',makeHandoff({tabs:[]})],
  ['multiple-active-tabs',makeHandoff({tabs:[{url:'https://example.test/a',active:true},{url:'https://example.test/b',active:true}]})],
  ['invalid-handoff',makeHandoff({sourceBrowser:'netscape'})],
  ['invalid-payload',makeHandoff({payload:undefined,tabs:undefined,sourceBrowser:undefined,...{payload:'not json'}}),true],
  ['invalid-envelope',{...good,reply:Buffer.from('{"v":1}')}],
  ['invalid-envelope',{...good,reply:Buffer.from('not json')}],
  ['invalid-envelope',{...good,reply:Buffer.alloc(Math.ceil(256*1024*4/3)+2049,0x20)}],
  ['invalid-link',{...good,link:'blanc-import://elsewhere'}]];
 for(const [code,h] of cases){
  const result=await r.open(h.link,h.reply);
  if(code==='invalid-payload'){assert.ok(['invalid-payload','invalid-handoff'].includes(result.error),JSON.stringify(result));continue;}
  assert.deepEqual(result,{error:code},code);
 }
 assert.equal((await r.open(good.link,good.reply)).ok,true,'the control still opens');
});
test('100 tabs is the ceiling and is not trimmed',async()=>{
 const r=runner(),h=makeHandoff({tabs:Array.from({length:100},(_,i)=>({url:'https://example.test/'+i}))});
 const opened=await r.open(h.link,h.reply);assert.equal(opened.value.tabs.length,100);assert.equal(opened.value.tabs[0].active,true);
});
test('the bundle holds only the handoff module and cannot dispatch anything else',async()=>{
 const r=runner();
 assert.throws(()=>r.context.__require('src/main/sync.js'),/no module/);
 assert.throws(()=>r.context.__require('src/main/tab-import-session.js'),/no module/);
 assert.deepEqual(await r.call('sync.enable','x'),{failed:'forbidden'});
 assert.deepEqual(await r.call('desktop.import','x'),{failed:'forbidden'});
 assert.deepEqual(await r.call('desktop.handoff','claim','x'),{error:'forbidden'});
 assert.deepEqual(r.calls,[]);
});
