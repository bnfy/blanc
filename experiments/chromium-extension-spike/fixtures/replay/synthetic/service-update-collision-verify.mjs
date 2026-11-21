import {updateLoaderIdentity} from './update-loader-identity.mjs';
// Reconstruct identities and explicit gaps from raw lifecycle and hook evidence.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {correlateWorker} from './worker-context.mjs';import {sha} from './generate.mjs';
const root=process.argv[2],report=JSON.parse(fs.readFileSync(path.join(root,'report.json')));assert(report.completed);assert(report.cleanup.removed);assert.equal(report.runs.length,8);
const fixtures=new Map(JSON.parse(fs.readFileSync(path.join(root,'fixtures.json'))));const worker=[...fixtures.keys()].find(u=>u.endsWith('/worker.js'));const proof=[];
for(const kind of ['electron','chromium'])for(const profile of ['regular','private'])for(const repetition of ['a','b']){
 const label=[kind,profile,repetition].join('-'),r=JSON.parse(fs.readFileSync(path.join(root,label+'.json')));
 assert.equal(r.workerEvidence.faults.length,0);assert.equal(new Set(r.before.map(v=>v.scope)).size,2);
 assert(r.after.every((v,i)=>v.scope===r.before[i].scope&&v.scriptURL===worker&&v.state==='activated'&&!v.installing&&!v.waiting));
 const versions=r.workerEvidence.events.flatMap(e=>e.method==='ServiceWorker.workerVersionUpdated'?e.params.versions:[]).filter(v=>v.scriptURL===worker&&v.targetId);
 const ids=[...new Map(versions.map(v=>[v.versionId,{versionId:v.versionId,registrationId:v.registrationId,targetId:v.targetId}])).values()];assert.deepEqual(ids,r.identities);assert.equal(ids.length,2);assert.equal(new Set(ids.map(v=>v.registrationId)).size,2);assert.equal(new Set(ids.map(v=>v.targetId)).size,2);
 const regs=r.workerEvidence.events.flatMap(e=>e.method==='ServiceWorker.workerRegistrationUpdated'?e.params.registrations:[]);for(const v of ids)assert(regs.some(x=>x.registrationId===v.registrationId&&r.before.some(b=>b.scope===x.scopeURL)));
 const rows=r.records.filter(v=>v.url===worker);assert.equal(rows.length,4);const updates=rows.slice(2).map(row=>correlateWorker(r,row));assert(updates.every(x=>x.status==='gap'));assert.deepEqual(updates,r.updates.map(x=>x.correlation));
 const arrivals=r.arrivals.filter(v=>v.url===worker);assert.equal(arrivals.length,4);assert(arrivals.every(v=>v.sha256===sha(fixtures.get(worker).body)));
 const native=rows.slice(2).map(row=>updateLoaderIdentity(r,row));if(r.nativeUpdateProof){assert.deepEqual(native,r.nativeUpdateProof);if(kind==='chromium')assert(native.every(p=>p.status==='proven-native'));}
 proof.push({label,registrations:2,nativeIdentity:native,updateIdentity:'gap',reasons:updates.map(x=>x.reason)});
}
console.log(JSON.stringify({verified:true,sessions:8,updateRequests:16,contextAcceptance:false,phaseOrderIsNotRegistrationIdentity:true,proof},null,2));
