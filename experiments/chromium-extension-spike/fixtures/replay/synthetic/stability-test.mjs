import test from 'node:test';
import assert from 'node:assert/strict';
import {compareReplays} from './stability.mjs';
const environment={appSha:'app',bootstrapSha:'boot',engineSha:'engine',filtersSha:'filters',policySha:'policy',electron:'44.8.0',chromium:'152'};
function run(id){return {runId:id,bundleSha256:'bundle',environment,complete:true,faults:[],records:[
 {url:'https://page.example/',method:'GET',resourceType:'mainFrame',profileKind:'regular',frame:{url:'',topUrl:'',topOrigin:'null'},initiatorOriginPresent:false,initiatorOrigin:null,referrer:'',status:{phase:'ready'},result:{}},
 {url:'https://ad.example/ad.js',method:'GET',resourceType:'script',profileKind:'regular',frame:{url:'https://page.example/',topUrl:'https://page.example/',topOrigin:'https://page.example'},initiatorOriginPresent:true,initiatorOrigin:'https://page.example',referrer:'https://page.example/',status:{phase:'ready'},result:{cancel:true}}
 ],arrivals:[{url:'https://page.example/',sha256:'body'}]};}
test('stable complete replays yield only actual offline decisions',()=>{
 const result=compareReplays(run('a'),run('b'));assert(result.stable);assert.equal(result.oracle.length,2);assert.equal(result.captureProvenanceVerified,false);
});
test('missing or extra requests never become a passing intersection',()=>{
 const a=run('a'),b=run('b');b.records.pop();const result=compareReplays(a,b);assert(!result.stable);assert.deepEqual(result.oracle,[]);
});
test('duplicate same-context requests fail as ambiguous, never deduplicate',()=>{
 const a=run('a'),b=run('b');a.records.push({...a.records[1]});b.records.push({...b.records[1]});assert(!compareReplays(a,b).stable);
});
test('decision, referrer, payload and profile differences are all compared',()=>{
 for(const change of [r=>r.records[1].result={},r=>r.records[1].referrer='',r=>r.arrivals[0].sha256='other',r=>r.records[1].profileKind='private']){
  const b=run('b');change(b);assert(!compareReplays(run('a'),b).stable);
 }
});
test('transport misses, opaque origins and insufficient metadata cannot pass',()=>{
 for(const change of [r=>r.faults.push({code:'unrecorded-request'}),r=>r.records[1].initiatorOrigin='null',r=>r.complete=false,r=>r.environment={}]){
  const b=run('b');change(b);assert(!compareReplays(run('a'),b).stable);
 }
});
test('unique causally classified requests may arrive in a different order',()=>{
 const b=run('b');b.records.reverse();assert(compareReplays(run('a'),b).stable);
});

test('matching omissions cannot turn incomplete observations into a stable oracle',()=>{
 for(const change of [r=>delete r.faults,r=>delete r.records[1].frame.topOrigin,r=>delete r.records[1].referrer,r=>delete r.records[1].result,r=>r.records[1].result.cancel='yes',r=>delete r.arrivals[0].sha256]){
  const a=run('a'),b=run('b');change(a);change(b);assert(!compareReplays(a,b).stable);
 }
});


test('image and stylesheet metadata compares without admitting worker/unknown types',()=>{
 for(const resourceType of ['image','stylesheet','xhr']) {
  const a=run('a'),b=run('b');a.records[1].resourceType=resourceType;b.records[1].resourceType=resourceType;
  assert(compareReplays(a,b).stable);
 }
 for(const resourceType of ['webSocket','other']){
  const a=run('a'),b=run('b');a.records[1].resourceType=resourceType;b.records[1].resourceType=resourceType;
  assert(!compareReplays(a,b).stable);
 }
});
