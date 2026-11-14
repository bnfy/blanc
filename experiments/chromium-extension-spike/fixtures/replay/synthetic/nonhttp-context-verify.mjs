import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {cases,top,child,blocked} from './nonhttp-context-fixtures.mjs';
export function verifyNonHttp(run){
 assert(['regular','private'].includes(run.kind));assert(['normal','exception','restored'].includes(run.phase));assert.equal(run.source.isOffTheRecord,run.kind==='private');assert.equal(run.observations.length,cases.length);
 assert(run.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 const results=[];
 for(const [i,c] of cases.entries()){
  const r=run.observations[i];assert.equal(r.name,c.name);if(r.navigationGap){assert.equal(c.name,'cross-owner-blob');assert.equal(r.parentOrigin,child);assert(r.createdBlob.startsWith('blob:'+top+'/'));assert(r.consoleRows.some(x=>x.type==='error'&&x.text==='Not allowed to load local resource: '+r.createdBlob));assert(!r.arrivals.some(a=>a.url===child+'/opaque-hit/'+c.name||a.url===blocked+'/blanc-fixture/opaque/'+c.name));results.push({name:c.name,status:'gap-browser-rejected-navigation',scriptletAcceptance:false});continue;}assert.equal(r.origin,c.origin);assert.equal(r.first.origin,c.origin);assert(r.first.ran);assert.equal(r.requests[0].result,'resolved');assert.equal(r.requests[1].result,'rejected');
  assert.equal(r.parentOrigin,c.parent==='opaque'||c.parent==='opaque-child'?'null':c.parent==='child'?child:top);
  const enabled=run.kind==='regular'&&c.admitted&&run.phase!=='exception';assert.equal(r.first.flag,enabled);assert.equal(r.first.getter,enabled);
  const arrivals=r.arrivals.filter(a=>a.url===child+'/opaque-hit/'+c.name);assert.equal(arrivals.length,enabled?0:1);assert(!r.arrivals.some(a=>a.url===blocked+'/blanc-fixture/opaque/'+c.name));
  if(run.kind==='regular'&&c.admitted){assert.equal(r.first.topSelection,c.name!=='child-origin-blob');assert.equal(r.first.childSelection,c.name==='child-origin-blob');}
  if(run.kind==='regular'&&!c.admitted){assert.equal(r.first.topSelection,false);assert.equal(r.first.childSelection,false);}
  if(run.kind==='private'){
   assert.equal(r.first.topSelection,false);assert.equal(r.first.childSelection,false);const rows=run.records.filter(x=>x.url===blocked+'/blanc-fixture/opaque/'+c.name);assert.equal(rows.length,1);assert.equal(rows[0].profile_kind,'private');assert.equal(rows[0].decision,'block');assert.equal(rows[0].initiator_present,true);assert.equal(rows[0].initiator_origin,c.origin);
  }
  results.push({name:c.name,status:run.kind==='private'?'pass-private-policy':c.admitted?(run.phase==='exception'?'pass-exception':'pass-early'):'gap-mismatched-owner-chain',scriptletAcceptance:enabled});
 }
 return {kind:run.kind,phase:run.phase,results,fullAcceptance:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const root=process.argv[2],report=JSON.parse(fs.readFileSync(path.join(root,'report.json')));assert(report.completed&&report.cleanup.removed);assert.equal(new Set(report.runs.map(r=>r.label)).size,report.runs.length);
 const expected=process.argv.includes('--exceptions')?['regular-a-exception','regular-a-restored']:['regular-a-normal','regular-b-normal','private-a-normal','private-b-normal'];assert.deepEqual(report.runs.map(r=>r.label).sort(),expected.sort());
 console.log(JSON.stringify({verified:true,runs:report.runs.map(r=>{const run=JSON.parse(fs.readFileSync(path.join(root,r.label+'.json')));assert.equal(run.label,r.label);return verifyNonHttp(run);}),latencyMeasured:false},null,2));
}
