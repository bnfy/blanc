import test from 'node:test';import assert from 'node:assert/strict';import {comparePathRuns} from './paths-compare.mjs';import {sha} from './generate.mjs';
const url='https://page.blanc-fixture.test/probe',origin=new URL(url).origin;
function sample(){
 const frame={url:origin+'/page',topUrl:origin+'/page',topOrigin:origin};
 const electron={label:'electron',browserKind:'electron',kind:'regular',complete:true,faults:[],observerFaults:[],dom:{results:[{id:'probe',outcome:'load'}],scripts:[]},arrivals:[{url,sha256:sha('body')}],records:[{url,requestId:'1',resourceType:'xhr',method:'GET',frame,referrer:origin+'/page',initiatorOriginPresent:true,initiatorOrigin:origin,profileKind:'regular',status:{phase:'ready'},result:{}}]};
 const native=structuredClone(electron);Object.assign(native,{label:'native',browserKind:'chromium',records:[{url,resource_type:'xhr',method:'GET',top_frame_origin:origin,frame_role:'main',referrer:origin+'/page',initiator_present:true,initiator_origin:origin,profile_kind:'regular',redirect_index:0,status:'ready',engine_result:0,decision:'allow'}]});
 return {electron,native,fixtures:new Map([[url,{body:'body'}]]),cases:[{id:'probe',kind:'fetch',hops:[url]}]};
}
function compare(x){return comparePathRuns(x.electron,structuredClone(x.electron),x.native,structuredClone(x.native),x.fixtures,x.cases);}
test('independent observed context and complete body admit bounded case',()=>{const r=compare(sample());assert(r.valid);assert.equal(r.results[0].status,'passed');});
test('matching worker decisions with absent frame stay a gap',()=>{const x=sample();x.electron.records[0].frame=null;x.native.records[0].top_frame_origin='unresolved';x.native.records[0].frame_role='unresolved';const r=compare(x);assert(r.valid);assert.equal(r.results[0].status,'gap');});
test('wrong redirect hop is a failed case',()=>{const x=sample();x.native.records[0].redirect_index=1;assert.equal(compare(x).results[0].status,'failed');});
test('wrong initiator and referrer are never inferred from the page',()=>{const x=sample();x.native.records[0].initiator_origin='null';x.native.records[0].referrer='';assert.equal(compare(x).results[0].status,'failed');});
test('blocked request reaching transport faults instead of passing',()=>{const x=sample();Object.assign(x.native.records[0],{decision:'block',engine_result:1});assert(compare(x).faults.some(f=>f.includes('blocked-arrival')));});
test('missing whole case cannot silently pass',()=>{const x=sample();x.electron.records=[];x.native.records=[];x.electron.arrivals=[];x.native.arrivals=[];assert.equal(compare(x).results[0].status,'failed');});
test('engine failure is not a correct blocking answer',()=>{const x=sample();x.native.records[0].status='engine-error';assert(!compare(x).valid);});

test('two recordings missing an allowed redirect successor are invalid',()=>{const x=sample();const target=url+'/target';x.fixtures.set(url,{body:'body',location:target});x.fixtures.set(target,{body:'target'});x.cases[0].hops.push(target);assert(!compare(x).valid);});

test('partition metadata and visible tab never fill an absent worker frame',()=>{
 const x=sample();x.electron.records[0].frame=null;x.electron.records[0].tabUrl=origin+'/unrelated';
 Object.assign(x.native.records[0],{top_frame_origin:'unresolved',frame_role:'unresolved',frame_state:'not-associated',factory_kind:'service-worker-subresource',factory_isolation_top_origin:origin,request_isolation_top_origin:origin});
 const r=compare(x);assert(r.valid);assert.equal(r.results[0].status,'gap');
 assert.equal(r.results[0].gaps[0].electron.top,'unresolved');assert.equal(r.results[0].gaps[0].chromium.top,'unresolved');
});
test('native worker context alone cannot admit an unresolved Electron context',()=>{
 const x=sample();x.electron.records[0].frame=null;assert.equal(compare(x).results[0].status,'gap');
});
function workerSample(){
 const x=sample(),script=origin+'/worker.js';x.electron.records[0].frame=null;
 Object.assign(x.native.records[0],{top_frame_origin:'unresolved',frame_role:'unresolved',devtools_request_id:'native-id'});
 x.electron.records[0].timestamp=new Date(1000000).toISOString();
 for(const run of [x.electron,x.native]){
  run.source={observedPageTarget:{targetId:'page',browserContextId:'profile'}};
  const version={targetId:'worker',versionId:'version',scriptURL:script,controlledClients:[]};
  run.workerEvidence={faults:[],events:[
   {method:'Target.attachedToTarget',params:{sessionId:'worker-session',targetInfo:{targetId:'worker',type:'service_worker',browserContextId:'profile',url:script}}},
   {method:'Runtime.executionContextCreated',sessionId:'worker-session',params:{context:{origin}}},
   {method:'ServiceWorker.workerVersionUpdated',params:{versions:[structuredClone(version)]}},
   {method:'Network.requestWillBeSent',sessionId:'worker-session',params:{requestId:'native-id',url,method:'GET',referrer:origin+'/page',wallTime:1000,frameId:null,type:'Fetch'}},
   {method:'ServiceWorker.workerVersionUpdated',params:{versions:[structuredClone(version)]}}
  ].map((e,sequence)=>({...e,sequence}))};
 }return x;
}
test('two independent worker contexts admit a bounded request without inventing its document frame',()=>{const x=workerSample(),r=compare(x);assert(r.valid);assert.equal(r.results[0].status,'passed');assert.equal(r.results[0].observed[0].workerContext.documentFrame,'not-associated');assert.equal(x.native.records[0].top_frame_origin,'unresolved');});
test('one-sided worker enrichment leaves the request as a gap',()=>{const x=workerSample();delete x.electron.workerEvidence;assert.equal(compare(x).results[0].status,'gap');});
test('stable but different independent worker identities fail comparison',()=>{const x=workerSample(),s=origin+'/different.js';x.native.workerEvidence.events[0].params.targetInfo.url=s;for(const i of [2,4])x.native.workerEvidence.events[i].params.versions[0].scriptURL=s;assert.equal(compare(x).results[0].status,'failed');});
