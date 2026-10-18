import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {cases,child,blocked} from './opaque-frame-fixtures.mjs';
export function verifyOpaque(run){
 assert(['electron','chromium'].includes(run.browserKind));assert(['regular','private'].includes(run.kind));assert.equal(run.observations.length,cases.length);
 assert(run.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)),'unexpected transport fault');
 if(run.browserKind==='chromium')assert.equal(run.source.isOffTheRecord,run.kind==='private');
 const results=[];
 for(let i=0;i<cases.length;i++){
  const c=cases[i],r=run.observations[i];assert.equal(r.name,c.name);assert.equal(r.ready,true);assert.equal(r.origin,c.origin,'actual security origin');
  const hits=run.arrivals.filter(a=>a.url===child+'/opaque-hit/'+c.name),blockedUrl=blocked+'/blanc-fixture/opaque/'+c.name;assert.equal(run.arrivals.filter(a=>a.url===blockedUrl).length,0,'blocked request reached server');
  if(!c.script){assert.equal(r.first,null);assert.equal(r.requests,null);assert.equal(hits.length,0);results.push({name:c.name,scope:'sandbox-script-enforcement',status:'pass',scriptletAcceptance:false});continue;}
  assert.equal(r.first.ran,true);assert.equal(r.first.origin,c.origin);assert.equal(r.requests.length,2);assert.equal(r.requests[0].result,'resolved','allowed or scriptlet-resolved probe');assert.equal(r.requests[1].result,'rejected','blocked request actually attempted');
  if(run.kind==='private'){
   assert.equal(r.first.flag,false);assert.equal(r.first.getter,false);assert.equal(r.late.flag,false);assert.equal(r.late.getter,false);assert.equal(hits.length,1,'private control allowed');
   const rows=run.records.filter(x=>x.url===blockedUrl);
   if(rows.length===0&&run.browserKind==='electron'&&['srcdoc','data'].includes(c.mode)){assert(run.records.some(x=>x.fault==='decision-scrub-refused'));results.push({name:c.name,scope:'private-ubo-disabled-network-observed',status:'gap',privatePolicy:'pass',blockerAttribution:'gap: observer scrub refuses non-HTTP frame metadata',scriptletAcceptance:false});continue;}
   assert.equal(rows.length,1,'one actual private blocker observation');const row=rows[0];
   if(run.browserKind==='electron'){assert.equal(row.profileKind,'private');assert.equal(row.provider,'blanc');assert.equal(row.result.cancel,true);}else{assert.equal(row.profile_kind,'private');assert.equal(row.decision,'block');}
   results.push({name:c.name,scope:'private-ubo-disabled-blanc-protected',status:'pass',scriptletAcceptance:false});
  }else if(c.mode==='http'&&run.browserKind==='chromium'){
   assert(r.first.flag&&r.first.getter&&r.late.flag);assert.equal(hits.length,0);results.push({name:c.name,scope:'native-http-document-start',status:'pass',scriptletAcceptance:true});
  }else results.push({name:c.name,scope:'unqualified-scriptlet-context',status:'gap',scriptletAcceptance:false,firstFlag:r.first.flag,lateFlag:r.late.flag,probeArrivals:hits.length});
 }
 return {runtime:run.browserKind,profile:run.kind,results,fullAcceptance:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const root=process.argv[2],report=JSON.parse(fs.readFileSync(path.join(root,'report.json')));assert(report.completed&&report.cleanup.removed);assert.deepEqual(report.runs.map(r=>r.label).sort(),['electron','chromium'].flatMap(b=>['regular','private'].flatMap(p=>['a','b'].map(n=>[b,p,n].join('-')))).sort());console.log(JSON.stringify({verified:true,runs:report.runs.map(r=>{const run=JSON.parse(fs.readFileSync(path.join(root,r.label+'.json')));assert.equal(run.label,r.label);assert(r.label.startsWith(run.browserKind+'-'+run.kind+'-'));return verifyOpaque(run);}),latencyMeasured:false},null,2));}
