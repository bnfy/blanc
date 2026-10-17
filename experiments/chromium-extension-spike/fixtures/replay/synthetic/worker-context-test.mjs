import test from 'node:test';import assert from 'node:assert/strict';import {correlateWorker} from './worker-context.mjs';
function fixture(browserKind='chromium'){
 const origin='https://page.test',script=origin+'/worker.js',url=origin+'/data';
 const target={targetId:'worker',browserContextId:'profile',type:'service_worker',url:script};
 const version={targetId:'worker',versionId:'v',scriptURL:script,controlledClients:[]};
 const events=[
  {method:'Target.attachedToTarget',params:{sessionId:'s',targetInfo:target}},
  {method:'Runtime.executionContextCreated',sessionId:'s',params:{context:{origin:script}}},
  {method:'ServiceWorker.workerVersionUpdated',params:{versions:[{...version}]}},
  {method:'Network.requestWillBeSent',sessionId:'s',params:{requestId:'req',url,method:'GET',referrer:script,type:'Fetch',wallTime:1000,frameId:null}},
  {method:'ServiceWorker.workerVersionUpdated',params:{versions:[{...version}]}}
 ].map((e,sequence)=>({...e,sequence}));
 const run={browserKind,kind:'regular',source:{observedPageTarget:{browserContextId:'profile',targetId:'page'}},workerEvidence:{events,faults:[]}};
 const row={url,method:'GET',resource_type:'xhr',resourceType:'xhr',referrer:script,devtools_request_id:'req',timestamp:new Date(1000000).toISOString()};return {run,row,events,target};
}
test('independent worker target plus stable empty controlled-client set resolves without a document origin',()=>{const {run,row}=fixture();const r=correlateWorker(run,row);assert.equal(r.status,'resolved');assert.equal(r.context.documentFrame,'not-associated');assert.deepEqual(r.context.clients.members,[]);assert(!('top_frame_origin' in row));});
test('Electron requires the independently observed unique request and bounded wall time',()=>{const {run,row}=fixture('electron');assert.equal(correlateWorker(run,row).status,'resolved');row.timestamp=new Date(990000).toISOString();assert.equal(correlateWorker(run,row).reason,'electron-worker-time-mismatch');});
test('same URL in multiple workers never becomes an arbitrary join',()=>{const {run,row,events}=fixture();events.push({...events[3],sequence:5,sessionId:'other'});assert.equal(correlateWorker(run,row).status,'gap');});
test('native ID mismatch stays a gap even when every URL matches',()=>{const {run,row}=fixture();row.devtools_request_id='wrong';assert.equal(correlateWorker(run,row).reason,'native-worker-request-id-mismatch');});
test('a worker in another profile cannot borrow this page identity',()=>{const {run,row,target}=fixture();target.browserContextId='private';assert.equal(correlateWorker(run,row).reason,'worker-profile-mismatch');});
test('shared-worker client set is unknown, never silently empty',()=>{const {run,row,target}=fixture();target.type='shared_worker';const r=correlateWorker(run,row);assert.equal(r.status,'gap');assert.equal(r.context.clients.status,'unobserved');});
test('client transitions across the observed request interval are gaps',()=>{const {run,row,events}=fixture();events[4].params.versions[0].controlledClients=['page'];assert.equal(correlateWorker(run,row).reason,'service-client-set-changed');});
test('a final lifecycle snapshot is required',()=>{const {run,row,events}=fixture();events.pop();assert.equal(correlateWorker(run,row).reason,'service-client-snapshot-incomplete');});
test('opaque or multiple worker execution contexts do not pass',()=>{const {run,row,events}=fixture();events[1].params.context.origin='null';assert.equal(correlateWorker(run,row).status,'gap');});
test('unobserved client IDs cannot borrow the visible page origin',()=>{const {run,row,events}=fixture();for(const e of [events[2],events[4]])e.params.versions[0].controlledClients=['other-page'];assert.equal(correlateWorker(run,row).reason,'service-client-not-observed');});
test('observer failures invalidate correlation',()=>{const {run,row}=fixture();run.workerEvidence.faults.push('missing event');assert.equal(correlateWorker(run,row).status,'gap');});
test('CDP Other does not rewrite the actual hook script type',()=>{const {run,row,events}=fixture();events[3].params.type='Other';row.resource_type='script';assert.equal(correlateWorker(run,row).status,'resolved');assert.equal(row.resource_type,'script');});
test('native pre-renderer blocked redirect is tied only to its exact parent request ID',()=>{const {run,row}=fixture();row.redirect_index=0;row.decision='allow';run.records=[row];const next={...row,url:'https://blocked.test/hop',redirect_index:1,decision:'block',referrer:'https://page.test/'};assert.equal(correlateWorker(run,next).proof.join,'native-redirect-parent-id');run.records=[];assert.equal(correlateWorker(run,next).status,'gap');});
test('one independently observed controlled page is retained as a client, never as the worker frame',()=>{
 const {run,row,events}=fixture();for(const e of [events[2],events[4]])e.params.versions[0].controlledClients=['page'];
 events.splice(2,0,{method:'Runtime.executionContextCreated',sessionId:'page-session',params:{context:{origin:'https://page.test',auxData:{frameId:'page',isDefault:true}}}});
 events.forEach((e,i)=>e.sequence=i);const r=correlateWorker(run,row);assert.equal(r.status,'resolved');assert.equal(r.context.documentFrame,'not-associated');assert.deepEqual(r.context.clients.members,[{role:'observed-page-target',origin:'https://page.test'}]);
});
test('multiple worker realms cannot be collapsed into one identity',()=>{const {run,row,events}=fixture();events.push({...events[1],sequence:5});assert.equal(correlateWorker(run,row).reason,'worker-execution-context-ambiguous');});
