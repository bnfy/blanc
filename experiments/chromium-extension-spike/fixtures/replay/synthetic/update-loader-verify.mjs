import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {updateLoaderIdentity} from './update-loader-identity.mjs';
const [root,expectedText]=process.argv.slice(2),expected=Number(expectedText);assert(Number.isInteger(expected)&&expected>0);
const report=JSON.parse(fs.readFileSync(path.join(root,'report.json')));assert(report.completed||report.behaviorPassed);assert(report.cleanup?.removed||report.profileCleanup?.removed);
const proofs=[];
for(const {label} of report.runs){
 const raw=JSON.parse(fs.readFileSync(path.join(root,label+'.json'))),run={...raw,browserKind:raw.source.browserKind,kind:raw.source.kind};
 for(const row of run.records.filter(x=>typeof x.devtools_request_id==='string'&&x.devtools_request_id.startsWith('blanc-sw-update/'))){
  const proof=updateLoaderIdentity(run,row);assert.equal(proof.status,'proven-native');proofs.push({label,...proof});
 }
}
assert.equal(proofs.length,expected);assert.equal(new Set(proofs.map(p=>p.token)).size,expected);
console.log(JSON.stringify({verified:true,nativeLoaderJoins:proofs.length,crossRuntimeAcceptance:false,latencyQualified:false,proofs},null,2));
