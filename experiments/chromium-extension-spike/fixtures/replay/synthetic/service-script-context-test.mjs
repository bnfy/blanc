import test from 'node:test';import assert from 'node:assert/strict';import {serviceScriptContext} from './service-script-context.mjs';
function fixture(browserKind='chromium'){
 const url='https://page.test/worker.js',events=[
  {method:'Target.attachedToTarget',params:{sessionId:'s',targetInfo:{type:'service_worker',url,targetId:'token',browserContextId:'profile'}}},
  {method:'Network.requestWillBeSent',sessionId:'s',params:{url,requestId:'token',method:'GET',referrer:'',frameId:null,type:'Script',wallTime:1000}},
  {method:'ServiceWorker.workerVersionUpdated',params:{versions:[{targetId:'token',versionId:'v',scriptURL:url,status:'new',runningStatus:'starting',controlledClients:[]}]}},
  {method:'Runtime.executionContextCreated',sessionId:'s',params:{context:{origin:url}}}
 ].map((e,sequence)=>({...e,sequence}));
 return {run:{browserKind,kind:'regular',source:{observedPageTarget:{browserContextId:'profile'}},workerEvidence:{events}},row:{url,method:'GET',resource_type:'script',referrer:'https://page.test/creator',factory_kind:'service-worker-script',devtools_request_id:'token',redirect_index:0,timestamp:new Date(1000000).toISOString()},events};
}
test('initial native script joins exact worker token without a Network event',()=>{const {run,row,events}=fixture();events.splice(1,1);const r=serviceScriptContext(run,row);assert.equal(r.status,'resolved');assert.equal(r.context.phase,'initial-script-fetch');assert.equal(r.context.clients.status,'not-applicable-before-installation');});
test('Electron initial script uses independent token event and time, not omitted header referrer',()=>{const {run,row}=fixture('electron');assert.equal(serviceScriptContext(run,row).status,'resolved');assert.equal(row.referrer,'https://page.test/creator');});
test('same script URL never substitutes for a mismatched native token',()=>{const {run,row}=fixture();row.devtools_request_id='wrong';assert.equal(serviceScriptContext(run,row),null);});
test('installed versions cannot borrow the initial-script context',()=>{const {run,row,events}=fixture();events[2].params.versions[0].status='activated';assert.equal(serviceScriptContext(run,row).status,'gap');});
test('a new version with controlled clients is contradictory evidence',()=>{const {run,row,events}=fixture();events[2].params.versions[0].controlledClients=['page'];assert.equal(serviceScriptContext(run,row).status,'gap');});
test('a worker in another profile cannot supply initial script evidence',()=>{const {run,row,events}=fixture();events[0].params.targetInfo.browserContextId='elsewhere';assert.equal(serviceScriptContext(run,row).status,'gap');});
test('failed worker execution remains a gap instead of fabricating a realm',()=>{const {run,row,events}=fixture();events.pop();assert.equal(serviceScriptContext(run,row).status,'gap');});
test('a stale Electron URL/time correlation stays a gap',()=>{const {run,row}=fixture('electron');row.timestamp=new Date(0).toISOString();assert.equal(serviceScriptContext(run,row).status,'gap');});
test('missing update CDP event cannot let repeated Electron hooks borrow the initial token',()=>{const {run,row}=fixture('electron');run.records=[row,{...row}];assert.equal(serviceScriptContext(run,row).reason,'service-script-hook-occurrences-ambiguous');});
test('HTTP failure plus exact-token response and detach proves loader identity, never an execution realm',()=>{
 for(const kind of ['electron','chromium']){
  const {run,row,events}=fixture(kind);events.pop();
  events.push({method:'Network.responseReceived',sessionId:'s',params:{requestId:'token',url:row.url,status:404},sequence:3},{method:'Target.detachedFromTarget',params:{sessionId:'s',targetId:'token'},sequence:4});
  const r=serviceScriptContext(run,row);assert.equal(r.status,'resolved');assert.equal(r.context.kind,'service_worker_script_loader');assert.equal(r.context.executionRealm,'unobserved');assert(!('executionOrigin' in r.context));
  events[3].params.requestId='wrong';assert.equal(serviceScriptContext(run,row).status,'gap');
  events[3].params.requestId='token';events[3].params.status=200;assert.equal(serviceScriptContext(run,row).status,'gap');
  events[3].params.status=404;events[4].sequence=2;assert.equal(serviceScriptContext(run,row).status,'gap');
 }
});
