import assert from 'node:assert/strict';import fs from 'node:fs';import {fileURLToPath} from 'node:url';
export function verifyNativeRecovery(r){
 assert(r.completed&&r.cleanup?.removed);assert.equal(r.latencyMeasured,false);
 for(const f of r.faults||[])assert(['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority));
 assert.equal(r.checks.length,2);const [a,b]=r.checks;assert.equal(a.kind,'native-execution-crash');assert.equal(a.pauseBoundary,'inside-native-ExecuteScript');assert(a.crashed);
 assert.equal(a.before.events[0].path,'native');assert.equal(a.before.native.pending,1);assert(a.before.state.ready);
 assert.equal(a.held.native.pending,1);assert.equal(a.held.state.ready,false);assert.equal(a.held.result.settled,false);
 assert.equal(a.after.native.pending,0);assert(a.after.state.ready&&a.after.result.settled&&!a.after.result.error);assert(a.recovered.first);assert.equal(a.recovered.marker,'clean');
 assert.equal(b.kind,'background-document-recreation');assert.equal(typeof b.old.identity,'string');assert.equal(b.recreated.oldIdentity,null);assert(b.recreated.state.ready&&b.recreated.readyToFilter);assert(b.result.first&&b.result.blocked);assert.equal(b.result.allowed,'fixture');
 return {boundedNativeCrash:true,backgroundDocumentRecreation:true,backgroundProcessCrash:false,asyncEffectsQualified:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyNativeRecovery(JSON.parse(fs.readFileSync(process.argv[2])))));
