import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
export const policies={nonce:"script-src 'nonce-fixture'",none:"script-src 'none'",'trusted-types':"require-trusted-types-for 'script'; trusted-types 'none'",'strict-dynamic':"script-src 'nonce-fixture' 'strict-dynamic'",'report-only':"script-src 'none'"};
export function verifyPolicy(r){
 assert(r.completed&&r.cleanup.removed);assert.equal(r.diagnosticScheduling,false);assert.equal(r.latencyMeasured,false);assert.equal(r.source.browserKind,'chromium');assert.equal(r.source.isOffTheRecord,false);assert.deepEqual(r.errors,[]);
 assert.deepEqual(r.checks.map(x=>[x.mode,x.name]),['http','srcdoc','blob'].flatMap(m=>['nonce','none','trusted-types','strict-dynamic','report-only'].map(n=>[m,n])));
 for(const x of r.checks){const s=x.snapshot,reportOnly=x.name==='report-only';assert.equal(x.policy,policies[x.name]);assert.equal(x.headers[reportOnly?'content-security-policy-report-only':'content-security-policy'],x.policy);assert(s.flag);assert.equal(s.counts.bodies,1);assert.equal(s.counts.attempts,x.mode==='http'?1:2);
  assert.equal(s.origin,x.mode==='srcdoc'?'null':'https://page.blanc-fixture.test');
  assert.equal(x.messages.length,x.mode==='http'?0:1);
  if(x.mode!=='http'){const m=x.messages[0];assert(m.replied);assert.equal(m.sender.url,s.url);assert.equal(m.sender.origin,s.origin);assert.equal(m.sender.id,'oddhmofgkplblkmckempfepikkophank');assert.deepEqual(m.stages.map(a=>a.stage),['browser-context','confirmed']);assert.deepEqual(m.stages[0].job,m.stages[1].job);assert.equal(m.stages[0].job.documentId,m.sender.documentId);}
  if(x.name==='none'){assert.equal(s.first,null);assert.equal(s.ttControl,null);assert(!s.pageInlineControl&&!s.pageDynamicControl);assert(r.console.some(c=>c.case===x.mode+':none'&&c.text.includes("script-src 'none'")));continue;}
  assert(s.first.flag);assert.equal(s.pageInlineControl,['trusted-types','report-only'].includes(x.name));assert.equal(s.pageDynamicControl,['strict-dynamic','report-only'].includes(x.name));
  if(x.name==='trusted-types'){assert.equal(s.ttControl.error,'TypeError');assert(s.violations.some(v=>v.directive==='require-trusted-types-for'&&v.blocked==='trusted-types-sink'&&v.disposition==='enforce'));}
  else {assert(s.ttControl.assigned);assert(s.violations.some(v=>v.directive==='script-src-elem'&&v.blocked==='inline'&&v.disposition===(reportOnly?'report':'enforce')));}
 }
 assert(r.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 return {verified:true,headerHttpControls:5,inheritedStaticDeliveries:10,pagePoliciesRemainEnforced:true,reportOnlyObserved:true,duplicateBodies:0,fullContainment:false,latencyMeasured:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyPolicy(JSON.parse(fs.readFileSync(path.join(process.argv[2],'report.json')))),null,2));
