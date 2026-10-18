// Diagnose stock trace observability, never manufacture a registration join.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {updateLoaderIdentity} from './update-loader-identity.mjs';
export function updateTraceEvidence(run){
 assert.equal(run.workerEvidence.faults.length,0,'trace/lifecycle must finish cleanly');
 const traces=run.workerEvidence.traceEvents;assert(Array.isArray(traces));
 const ctor=traces.filter(e=>e.name==='ServiceWorkerSingleScriptUpdateChecker::ServiceWorkerSingleScriptUpdateChecker'&&e.ph==='X');assert.equal(ctor.length,2,'two actual checker constructions');
 for(const e of ctor){assert.deepEqual(Object.keys(e.args).sort(),['main_script_url','script_url']);assert.equal(e.args.script_url,e.args.main_script_url);}
 const regs=new Map(run.identities.map(r=>[r.registrationId,r]));assert.equal(regs.size,2);
 const urls=new Set(ctor.map(e=>e.args.script_url));assert.equal(urls.size,1,'deliberate same-URL collision');
 const rows=run.records.filter(r=>urls.has(r.url));assert.equal(rows.length,4);
 // No selection by row order: use only the browser-owned token when it exists.
 const nativeRows=rows.filter(r=>typeof r.devtools_request_id==='string'&&r.devtools_request_id.startsWith('blanc-sw-update/'));
 const native=nativeRows.map(r=>updateLoaderIdentity(run,r));if(run.browserKind==='chromium'){assert.equal(native.length,2);assert(native.every(p=>p.status==='proven-native'));}else assert.equal(native.length,0);
 return {runtime:run.browserKind,profile:run.kind,checkerConstructions:2,registrations:2,scriptURLs:1,constructorArgumentKeys:['main_script_url','script_url'],nativeProofs:native,traceRegistrationJoin:'gap',crossRuntimeAcceptance:false,reason:'stock-checker-trace-has-no-registration-version-or-hook-request-token'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const root=process.argv[2],report=JSON.parse(fs.readFileSync(path.join(root,'report.json')));assert(report.completed&&report.cleanup.removed);assert.equal(report.runs.length,8);const runs=report.runs.map(r=>updateTraceEvidence(JSON.parse(fs.readFileSync(path.join(root,r.label+'.json')))));console.log(JSON.stringify({verified:true,runs,nativeJoins:runs.reduce((n,r)=>n+r.nativeProofs.length,0),electronUpdateIdentityGaps:8,crossRuntimeAcceptance:false},null,2));}
