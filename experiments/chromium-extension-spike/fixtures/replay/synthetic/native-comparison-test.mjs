import test from 'node:test';
import assert from 'node:assert/strict';
import {compareNative} from './native-comparison.mjs';
import {sha} from './generate.mjs';
function data(){
 const url='https://fixture.test/a.js',root='https://page.blanc-fixture.test/blanc-fixture/index.html';
 const context={url,method:'GET',resource_type:'script',initiator_origin:new URL(root).origin,top_frame_origin:new URL(root).origin,frame_role:'main',profile_kind:'regular',redirect_index:0};
 return {manifest:{candidates:[{id:'a',url,resourceType:'script',kind:'block-candidate',descendantUrl:'https://fixture.test/child'}]},oracle:{stable:true,oracle:[{context,decision:'block'}]},reference:{records:[{url,referrer:root}]},fixtures:new Map([[url,{body:'script'}],['https://fixture.test/child',{body:'child'}]]),run:{complete:true,faults:[],nativeBlockerInstalled:true,engineReadyCount:1,nativeRecords:[{...context,initiator_present:true,referrer:root,decision:'block',engine_result:1,status:'ready'}],arrivals:[],requests:[{url,requestId:'1'}],responses:[],finished:[],failures:[{requestId:'1',errorText:'net::ERR_BLOCKED_BY_CLIENT'}],execution:{loads:[{id:'a',event:'error'}],executed:[],children:[]}}};
}
const compare=d=>compareNative(d.manifest,d.oracle,d.reference,d.run,d.fixtures);
test('actual cancelled request with exact native context passes the bounded comparison',()=>assert.equal(compare(data()).parity,true));
test('wrong initiator is a harness fault even if both engines block',()=>{const d=data();d.run.nativeRecords[0].initiator_origin='https://wrong.test';assert.equal(compare(d).valid,false);});
test('matching frame origin never substitutes for absent initiator',()=>{const d=data();d.run.nativeRecords[0].initiator_present=false;assert.equal(compare(d).valid,false);});
test('referrer mismatch is independent of matching initiator',()=>{const d=data();d.run.nativeRecords[0].referrer='';assert.equal(compare(d).valid,false);});
test('startup/engine error is not counted as successful blocking',()=>{const d=data();d.run.nativeRecords[0].status='engine-error';d.run.nativeRecords[0].engine_result=-1;assert.equal(compare(d).valid,false);});
test('duplicate native observations cannot inflate the denominator',()=>{const d=data();d.run.nativeRecords.push({...d.run.nativeRecords[0]});assert.equal(compare(d).valid,false);});
test('a missed blocked script and its executed child remain a difference, not a replay miss',()=>{
 const d=data(),r=d.run.nativeRecords[0],child=d.manifest.candidates[0].descendantUrl;
 r.decision='allow';r.engine_result=0;
 d.run.nativeRecords.push({...r,url:child,resource_type:'xhr'});
 d.run.requests.push({url:child,requestId:'2'});d.run.failures=[];
 for(const [index,url] of [r.url,child].entries()){
  d.run.arrivals.push({url,sha256:sha(d.fixtures.get(url).body)});
  d.run.responses.push({requestId:String(index+1),status:200,fromDiskCache:false,fromServiceWorker:false});d.run.finished.push(String(index+1));
 }
 d.run.execution={loads:[{id:'a',event:'load'}],executed:['a'],children:['a']};
 const result=compare(d);assert.deepEqual(result.faults,[]);assert.equal(result.parity,false);assert.equal(result.counts.blockToAllow,1);assert.equal(result.descendants.length,1);
});
