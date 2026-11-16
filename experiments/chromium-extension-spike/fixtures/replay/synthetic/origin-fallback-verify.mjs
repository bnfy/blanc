import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {diagnosticEntry} from './origin-fallback-payload.mjs';import {sha} from './generate.mjs';
export const fallbackCases=['http-control','inherited-srcdoc','opaque-srcdoc','data','blob','sandbox-blob','nested-srcdoc','nested-data','nested-blob','child-origin-blob'];
const top='https://page.blanc-fixture.test',child='https://child.blanc-control.test';
export function expectedFallback(mode,name,identifier){return ['http-control','inherited-srcdoc'].includes(name)||(mode==='origin'&&(identifier==='getRandomValues-128'||['opaque-srcdoc','blob','sandbox-blob','nested-srcdoc','child-origin-blob'].includes(name)));}
export function verifyFallback(r,readPayload){
 assert(r.completed&&r.cleanup.removed);assert.equal(r.latencyMeasured,false);assert(['about','origin'].includes(r.mode));assert.equal(r.source.browserKind,'chromium');assert.equal(r.source.kind,'regular');assert.equal(r.source.isOffTheRecord,false);
 assert.equal(r.manifest.manifest_version,2);assert.equal(r.manifest.incognito,'not_allowed');assert.deepEqual(r.manifest.content_scripts.at(-1),diagnosticEntry(r.mode));
 assert.deepEqual(r.checks.map(x=>[x.cycle,x.name]),[0,1].flatMap(c=>fallbackCases.map(n=>[c,n])));
 assert(r.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 const ids=new Set(),instances=new Set();let passes=0,gaps=0;
 for(const row of r.checks){
  const d=row.delivery,origin=['http-control','child-origin-blob'].includes(row.name)?child:['blob','inherited-srcdoc'].includes(row.name)?top:'null';
  const selection=['http-control','child-origin-blob'].includes(row.name)?child:top;assert.equal(d.selectedOrigin,selection);
  for(const key of ['before','afterExtension']){const s=row[key];assert.equal(s.origin,origin);assert(s.flag&&s.first.flag&&s.first.getter);assert.equal(s.counts.bodies,1);assert(s.counts.attempts>=1);assert.equal(s.first.topSelection,selection===top);assert.equal(s.first.childSelection,selection===child);}
  assert(!('afterDirect' in row),'direct evaluation cannot establish this result');
  const matches=d.messages.filter(x=>x.sender.url===row.url&&x.message.href===row.url&&x.message.frameName==='authored fixture '+row.name&&x.sender.frameId>0&&x.sender.documentId);
  if(expectedFallback(r.mode,row.name,r.receiverIdentifier)){
   assert.equal(matches.length,1);assert.deepEqual(d.target,matches[0]);const {message,sender}=d.target;
   assert.equal(sender.id,'oddhmofgkplblkmckempfepikkophank');assert.equal(sender.origin,origin);assert.equal(message.origin,origin);assert.equal(sender.tabId,d.tabId);assert.equal(typeof sender.documentId,'string');
   assert(!ids.has(sender.documentId));ids.add(sender.documentId);assert.equal(typeof message.instance,'string');assert(!instances.has(message.instance));instances.add(message.instance);
   assert.equal(d.attempts.length,2);for(const a of d.attempts){assert.equal(a.error,null);assert.deepEqual(a.response,{instance:message.instance,href:row.url,origin,error:null});}
   assert(row.afterExtension.counts.attempts>=row.before.counts.attempts+2);assert.match(d.mainWorldSha256,/^[a-f0-9]{64}$/);if(readPayload)assert.equal(sha(readPayload(d.mainWorldSha256+'.main-world.js')),d.mainWorldSha256);passes++;
  }else{assert.equal(matches.length,0);assert.equal(d.target,null);assert.deepEqual(d.attempts,[]);assert.equal(d.mainWorldSha256,null);assert.equal(row.afterExtension.counts.attempts,row.before.counts.attempts);gaps++;}
 }
 assert.deepEqual(r.scopeControls.map(x=>x.name),['outside-http','outside-opaque']);assert.deepEqual(r.outsideMessages,[]);
 for(const [i,x] of r.scopeControls.entries()){assert(x.ready);assert.equal(x.flag,false);assert.equal(x.topSelection,false);assert.equal(x.childSelection,false);assert.equal(x.origin,i===0?'https://outside.blanc-fixture.test':'null');assert.equal(x.url,i===0?'https://outside.blanc-fixture.test/control':'about:srcdoc');}
 return {verified:true,mode:r.mode,diagnosticStaticDeliveryPasses:passes,missingReceiverGaps:gaps,outsideScopeControls:2,productionIntegration:false,fullAcceptance:false,latencyMeasured:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const root=process.argv[2];console.log(JSON.stringify(verifyFallback(JSON.parse(fs.readFileSync(path.join(root,'report.json'))),p=>fs.readFileSync(path.join(root,p))),null,2));}
