import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {fallbackCases} from './origin-fallback-verify.mjs';
export function verifyStatic(r){
 assert(r.completed&&r.cleanup.removed);assert.equal(r.latencyMeasured,false);assert.equal(r.source.browserKind,'chromium');assert.equal(r.source.isOffTheRecord,false);
 assert.equal(r.manifest.incognito,'not_allowed');assert.deepEqual(r.manifest.content_scripts.at(-1),{matches:['http://*/*','https://*/*'],js:['js/blanc-static-content.js'],all_frames:true,run_at:'document_idle',match_origin_as_fallback:true});
 assert.deepEqual(r.checks.map(x=>[x.cycle,x.name]),[0,1].flatMap(c=>fallbackCases.map(n=>[c,n])));
 const ids=new Set();let passes=0;
 for(const row of r.checks){
  const origin=['http-control','child-origin-blob'].includes(row.name)?'https://child.blanc-control.test':['blob','inherited-srcdoc'].includes(row.name)?'https://page.blanc-fixture.test':'null';
  const selection=['http-control','child-origin-blob'].includes(row.name)?'https://child.blanc-control.test/':'https://page.blanc-fixture.test/';
  for(const key of ['before','afterStatic']){const s=row[key];assert(s.flag&&s.first.flag&&s.first.getter);assert.equal(s.origin,origin);assert.equal(s.counts.bodies,1);assert.equal(s.first.childSelection,selection.includes('child.'));assert.equal(s.first.topSelection,!selection.includes('child.'));}
  assert(!('delivery' in row)&&!('afterDirect' in row),'no harness payload selection/injection');
  if(row.name==='http-control'){assert.deepEqual(row.targets,[]);continue;}
  assert.equal(row.targets.length,1);const target=row.targets[0];assert(r.checks&&row.messages.some(x=>JSON.stringify(x)===JSON.stringify(target)));assert(target.replied);
  const sender=target.sender;assert.equal(sender.id,'oddhmofgkplblkmckempfepikkophank');assert.equal(sender.url,row.url);assert.equal(sender.origin,origin);assert(sender.frameId>0&&Number.isInteger(sender.tabId));assert(!ids.has(sender.documentId));ids.add(sender.documentId);
  assert.deepEqual(target.stages.map(x=>x.stage),['browser-context','confirmed']);const [first,last]=target.stages;assert.deepEqual(first.job,last.job);assert.equal(first.generation,last.generation);assert(last.bytes>0);assert.equal(first.job.documentId,sender.documentId);assert.equal(first.job.frameId,sender.frameId);assert.equal(first.job.tabId,sender.tabId);assert.equal(first.job.url,selection);assert.equal(first.job.ancestors.length,row.name.startsWith('nested-')||row.name==='child-origin-blob'?2:1);assert(row.afterStatic.counts.attempts>=2);
  if(['data','nested-data','nested-blob'].includes(row.name)){assert.equal(row.afterStatic.secureContext,false);assert.equal(row.afterStatic.randomUUID,'undefined');}
  passes++;
 }
 assert.deepEqual(r.identityChecks.values.map(x=>[x.name,x.status]),[['live',200],['wrong-origin',403],['wrong-url',403],['wrong-tab',403],['wrong-frame',403],['missing-document',403],['stale-generation',403]]);
 assert.deepEqual(r.lifecycle,{liveBefore:200,staleDocument:403,held:403,liveRestored:200,priorGeneration:403,popupRejected:true});
 assert.equal(r.scopeControls.length,2);for(const x of r.scopeControls)assert(x.ready&&!x.flag&&!x.topSelection&&!x.childSelection);
 assert(r.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 return {verified:true,automaticStaticDeliveryPasses:passes,httpEarlyControls:2,identityAndGenerationChecks:13,receiverGapsInThisMatrix:0,fullAcceptance:false,inFlightReloadAtomicity:false,latencyMeasured:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){console.log(JSON.stringify(verifyStatic(JSON.parse(fs.readFileSync(path.join(process.argv[2],'report.json')))),null,2));}
