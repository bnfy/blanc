import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {componentId,componentKey,generateComponent,prepareComponent} from './ubo-component.mjs';
test('component ID is derived from the public key',()=>{
 const hex=crypto.createHash('sha256').update(Buffer.from(componentKey,'base64')).digest('hex').slice(0,32);
 assert.equal([...hex].map(c=>String.fromCharCode(97+parseInt(c,16))).join(''),componentId);
});
test('verified payload is private-disabled and refuses overwriting',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ubo-payload-test-')),out=path.join(dir,'payload');
 try{const result=generateComponent(out);assert.equal(result.version,'1.75.0');assert.equal(result.verifiedFiles,658);
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json')));assert.equal(manifest.key,componentKey);assert.equal(manifest.incognito,'not_allowed');assert.equal(manifest.manifest_version,2);assert.throws(()=>generateComponent(out));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('admission uses normal Add and only browser component integration',()=>{
 const edits=[];prepareComponent((file,patches)=>edits.push({file,patches}));assert.equal(edits.length,2);
 assert(edits.every(e=>e.file.startsWith('chrome/browser/extensions/')));
 const code=edits.flatMap(e=>e.patches.map(p=>p.replacement)).join('\n');assert(code.includes('Add(manifest, root)'));assert(!code.includes('AddOrReplace'));assert(code.includes('!profile_->IsOffTheRecord()'));assert(code.includes('blanc-ubo-offline-probe'));
});
test('reload integration is generated from verified upstream with guarded anchors',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ubo-guard-test-')),out=path.join(dir,'payload');
 try{const result=generateComponent(out,true);assert(result.changes.some(c=>c.includes('js/storage.js')));
 const storage=fs.readFileSync(path.join(out,'js/storage.js'),'utf8'),start=fs.readFileSync(path.join(out,'js/start.js'),'utf8');
 assert(storage.includes('blancGuard.begin().then(epoch => { blancEpoch = epoch; return this.loadRedirectResources(); })'));
 assert(storage.includes('onDone();\n            return blancGuard.complete(blancEpoch);'));
 assert(start.includes('webRequest.start();\nawait blancGuard.activate(selfieIsValid);'));
 assert(fs.readFileSync(path.join(out,'LICENSE.txt'),'utf8').includes('GNU GENERAL PUBLIC LICENSE'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('parity observer preserves original decisions and copies input before mutation',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ubo-observer-test-')),out=path.join(dir,'payload');
 try{generateComponent(out,true,true);const traffic=fs.readFileSync(path.join(out,'js/traffic.js'),'utf8');
 const begin=traffic.indexOf('globalThis.__blancUboParityRows = []'),end=traffic.indexOf("vAPI.net.addListener('onHeadersReceived'",begin);assert(begin>0&&end>begin);
 for(const expected of [undefined,{cancel:true},{redirectUrl:'data:text/plain,fixture'},{}]){
  let listener;const scope={vAPI:{net:{setSuspendableListener:f=>listener=f}},onBeforeRequest:details=>{details.url='mutated';return expected;}};
  vm.runInNewContext(traffic.slice(begin,end),scope);const input={url:'https://page.blanc-fixture.test/original',type:'script'};
  assert.equal(listener(input),expected);assert.equal(scope.__blancUboParityRows[0].input.url,'https://page.blanc-fixture.test/original');
  assert.deepEqual(JSON.parse(JSON.stringify(scope.__blancUboParityRows[0].result)),expected||{});
 }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('document start uses a lazy module after readiness and splits main world from late injection',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ubo-document-test-')),out=path.join(dir,'payload');
 try{generateComponent(out,true,false,true);
 const start=fs.readFileSync(path.join(out,'js/start.js'),'utf8'),filter=fs.readFileSync(path.join(out,'js/scriptlet-filtering.js'),'utf8');
 assert(start.includes("await blancGuard.activate(selfieIsValid);\n(await import('./blanc-document-start.js')).start();"));
 assert(filter.includes('/^https?:/.test(details.url) ? scriptletDetails.isolatedCode : scriptletDetails.code'));
 assert(filter.includes('mainWorld: scriptletDetails.mainWorld'));
 assert(filter.includes('request.nocache === true ? undefined : this.scriptletCache.lookup(hostname)'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('real generated reload function coalesces through ready and retries rejection',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ubo-load-lifecycle-')),out=path.join(dir,'payload');
 try{
  generateComponent(out,true);const storage=fs.readFileSync(path.join(out,'js/storage.js'),'utf8'),a=storage.indexOf('    µb.loadFilterLists = function() {'),z=storage.indexOf('\n    };',a)+7,code=storage.slice(a,z);
  let finish,begins=0,fail=false;const epochs=[];
  const scope={Promise,µb:{loadRedirectResources:async()=>{},getAvailableLists:async()=>[]},blancGuard:{begin:async()=>{begins++;if(fail)throw Error('held');return begins;},complete:epoch=>{epochs.push(epoch);return new Promise(r=>{finish=r;});}},ubolog:()=>{},elapsed:()=>'',loadedListKeys:[],onFilterListsReady:async()=>{},onDone:()=>{}};
  vm.runInNewContext(`let loadingPromise,t0;${code}`,scope);
  const p=scope.µb.loadFilterLists();assert.equal(scope.µb.loadFilterLists(),p);await new Promise(r=>setImmediate(r));assert.equal(scope.µb.loadFilterLists(),p);assert.deepEqual(epochs,[1]);finish();await p;
  fail=true;await assert.rejects(scope.µb.loadFilterLists(),/held/);fail=false;
  const retry=scope.µb.loadFilterLists();await new Promise(r=>setImmediate(r));assert.deepEqual(epochs,[1,3]);finish();await retry;
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
