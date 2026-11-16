import fs from 'node:fs';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
export function verifyRendererTarget(r){
 assert(r.completed&&!r.error&&r.cleanup.removed&&!r.latencyMeasured);
 assert.equal(r.permissionPromptRaceTested,false);
 assert.equal(r.checks.length,8);
 for(const [i,runAt] of ['document_start','document_end','document_idle'].entries()){
  const c=r.checks[i];assert.equal(c.kind,'renderer-mismatch');assert.equal(c.runAt,runAt);assert(c.frame.documentId);assert(c.denied.error);assert.equal(c.deniedMarker,'untouched');assert.equal(c.accepted.result?.[0],true);
 }
 assert.equal(r.checks[3].kind,'legacy-control');assert.equal(r.checks[3].result.result[0],true);
 for(const [i,mode] of ['release','same-url','cross-path','cross-origin'].entries()){
  const c=r.checks[i+4];assert.equal(c.kind,'queued-navigation');assert.equal(c.mode,mode);assert(c.before.documentId&&c.after.documentId);assert.equal(c.pendingBeforeNavigation,true);
  if(mode==='release'){assert.equal(c.before.documentId,c.after.documentId);assert.equal(c.result.result?.[0],true);}
  else {assert.notEqual(c.before.documentId,c.after.documentId);assert.equal(c.replacementMarker,'untouched');assert(c.result.error||(Array.isArray(c.result.result)&&(c.result.result.length===0||(c.result.result.length===1&&c.result.result[0]===null))));}
 }
 assert(r.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 return {verified:true,cases:8,transportMismatchDiagnostic:true,queuedReplacementUntouched:true,naturallyOccurringIPCRaceObserved:false,permissionPromptRaceTested:false,fullAcceptance:false,latencyMeasured:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyRendererTarget(JSON.parse(fs.readFileSync(process.argv[2]))),null,2));
