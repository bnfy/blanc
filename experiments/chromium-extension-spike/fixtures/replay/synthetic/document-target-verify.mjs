import fs from 'node:fs';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
export function verifyTarget(r){
 assert(r.completed&&!r.error&&r.cleanup.removed&&!r.latencyMeasured&&!r.rendererRaceCovered);
 assert.deepEqual(r.checks.map(x=>x.kind),['positive-code','same-document','same-url','cross-path','cross-origin','malformed','all-frames','wrong-frame','cross-tab','positive-file','fanout']);
 assert.equal(r.checks[0].result.result[0],true);
 assert.equal(r.checks[1].before.documentId,r.checks[1].after.documentId);assert.equal(r.checks[1].result.result[0],true);
 for(const x of r.checks.slice(2,5)){assert(x.before.documentId);assert.notEqual(x.before.documentId,x.after.documentId);assert.equal(x.result.length,0);assert.match(x.raw.error,/document target/);}
 for(const x of r.checks.slice(5,9))assert(x.result.error);
 assert(r.checks[9].result.result.length>0);assert.deepEqual(r.checks[10].result,[true,true]);
 assert(r.faults.every(f=>['plaintext-refused','connect-refused'].includes(f.code)&&['clients2.google.com','www.google.com:443','accounts.google.com:443'].includes(f.authority)));
 return {verified:true,cases:11,staleBrowserDispatchRefused:true,rendererRaceCovered:false,asyncEffects:false,fullAcceptance:false,latencyMeasured:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyTarget(JSON.parse(fs.readFileSync(process.argv[2]))),null,2));
