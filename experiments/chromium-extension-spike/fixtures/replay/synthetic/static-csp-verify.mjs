import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
export function verifyCsp(r){
 assert(r.completed&&r.cleanup.removed);assert.equal(r.diagnosticScheduling,false);assert.equal(r.latencyMeasured,false);assert.equal(r.source.browserKind,'chromium');assert.equal(r.source.isOffTheRecord,false);assert.deepEqual(r.errors,[]);
 assert.deepEqual(r.checks.map(x=>[x.mode,x.name]),['srcdoc','data','blob'].flatMap(m=>['inline','nonce','none','trusted-types','nonce-trusted-types'].map(n=>[m,n])));
 for(const x of r.checks){const s=x.snapshot;assert.equal(s.policy,x.policy);assert(s.flag);assert.equal(s.counts.bodies,1);assert.equal(s.counts.attempts,x.mode==='data'?3:2);assert.equal(s.origin,x.mode==='blob'?'https://page.blanc-fixture.test':'null');
  assert.equal(x.messages.length,1);const m=x.messages[0];assert(m.replied);assert.equal(m.sender.url,s.url);assert.equal(m.sender.origin,s.origin);assert.equal(m.sender.id,'oddhmofgkplblkmckempfepikkophank');assert.deepEqual(m.stages.map(a=>a.stage),['browser-context','confirmed']);assert.deepEqual(m.stages[0].job,m.stages[1].job);assert.equal(m.stages[0].job.documentId,m.sender.documentId);assert.equal(m.stages[0].job.url,'https://page.blanc-fixture.test/');
  if(x.name==='none'){assert.equal(s.first,null);assert.equal(s.ttControl,null);assert(!s.pageInlineControl&&!s.pageDynamicControl);assert(r.console.some(c=>c.case===x.mode+':none'&&c.text.includes("script-src 'none'")));continue;}
  assert(s.first.flag);const nonce=x.name.includes('nonce'),tt=x.name.includes('trusted-types');assert.equal(s.pageInlineControl,!nonce);assert.equal(s.pageDynamicControl,!nonce&&!tt);
  if(tt){assert.equal(s.ttControl.error,'TypeError');assert(s.violations.some(v=>v.directive==='require-trusted-types-for'&&v.blocked==='trusted-types-sink'));}else assert(s.ttControl.assigned);
  if(nonce)assert(s.violations.some(v=>v.directive==='script-src-elem'&&v.blocked==='inline'));
 }
 assert(r.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 return {verified:true,automaticLateDelivery:15,duplicateBodies:0,pagePoliciesRemainEnforced:true,extensionDeliveryExemptFromPagePolicies:true,fullContainment:false,latencyMeasured:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyCsp(JSON.parse(fs.readFileSync(path.join(process.argv[2],'report.json')))),null,2));
