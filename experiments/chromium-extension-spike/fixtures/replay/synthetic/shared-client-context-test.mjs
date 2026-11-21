import test from 'node:test';import assert from 'node:assert/strict';import {sharedClients} from './shared-client-context.mjs';
function fixture(){
 const binding=(sessionId,executionContextId,type,more={})=>({method:'Runtime.bindingCalled',sessionId,params:{executionContextId,type,...more}});
 const events=[
  {method:'Target.attachedToTarget',params:{sessionId:'p',targetInfo:{targetId:'page'}}},
  {method:'Runtime.executionContextCreated',sessionId:'p',params:{context:{id:10,origin:'https://page.test',auxData:{isDefault:true,frameId:'page'}}}},
  binding('p',10,'page-agent-installed'),binding('p',10,'client-created',{token:'nonce'}),
  binding('w',20,'worker-agent-installed'),binding('w',20,'worker-connect',{portToken:'port'}),
  {method:'Network.requestWillBeSent',sessionId:'w',params:{}},
  binding('w',20,'worker-peer',{portToken:'port',token:'nonce'})
 ].map((e,sequence)=>({...e,sequence}));
 events.push({method:'Runtime.executionContextCreated',sessionId:'w',sequence:3.5,params:{context:{id:20,origin:'https://page.test/worker.js'}}});
 return {run:{source:{observedPageTarget:{targetId:'page'}},workerEvidence:{events}},request:events[6],events};
}
test('actual port challenge proves observed document peer even when receipt follows request',()=>{const {run,request}=fixture();const r=sharedClients(run,request);assert.equal(r.status,'resolved');assert.deepEqual(r.clients.members,[{role:'observed-page-target',origin:'https://page.test',ports:1}]);});
test('worker connect without independently witnessed challenge never gets an owner',()=>{const {run,request,events}=fixture();events.splice(7,1);assert.equal(sharedClients(run,request).status,'gap');});
test('unmatched extra constructor prevents claiming a complete client set',()=>{const {run,request,events}=fixture();events.push({method:'Runtime.bindingCalled',sessionId:'p',sequence:4,params:{type:'client-created',token:'other',executionContextId:10}});assert.equal(sharedClients(run,request).reason,'shared-unaccounted-construction');});
test('unmatched extra worker port prevents claiming a complete client set',()=>{const {run,request,events}=fixture();events.push({method:'Runtime.bindingCalled',sessionId:'w',sequence:5,params:{type:'worker-connect',portToken:'other',executionContextId:20}});assert.equal(sharedClients(run,request).status,'gap');});
test('reused challenge is ambiguous',()=>{const {run,request,events}=fixture();events.push({...events[7],sequence:8});assert.equal(sharedClients(run,request).status,'gap');});
test('page close before request or completed handshake stays a gap',()=>{const {run,request,events}=fixture();events.push({method:'Runtime.bindingCalled',sessionId:'p',sequence:6,params:{type:'client-port-close',token:'nonce'}});assert.equal(sharedClients(run,request).reason,'shared-client-lifetime-incomplete');});
test('page realm destruction cannot be replaced by a later same-origin realm',()=>{const {run,request,events}=fixture();events.push({method:'Runtime.executionContextDestroyed',sessionId:'p',sequence:6,params:{executionContextId:10}});assert.equal(sharedClients(run,request).status,'gap');});
test('unknown page target cannot borrow the selected page',()=>{const {run,request,events}=fixture();events[0].params.targetInfo.targetId='other';assert.equal(sharedClients(run,request).reason,'shared-client-target-unobserved');});
test('late observation agent does not establish complete ownership',()=>{const {run,request,events}=fixture();events[4].sequence=9;assert.equal(sharedClients(run,request).status,'gap');});
test('opaque client origin stays unresolved',()=>{const {run,request,events}=fixture();events[1].params.context.origin='null';assert.equal(sharedClients(run,request).status,'gap');});
test('two observed document realms aggregate as two active owners',()=>{
 const {run,request,events}=fixture();run.source.observedPageTargets=[{targetId:'page'},{targetId:'page-2'}];
 events.push({method:'Target.attachedToTarget',sequence:1.1,params:{sessionId:'p2',targetInfo:{targetId:'page-2'}}},{method:'Runtime.executionContextCreated',sessionId:'p2',sequence:1.2,params:{context:{id:11,origin:'https://page.test',auxData:{isDefault:true,frameId:'page-2'}}}},{method:'Runtime.bindingCalled',sessionId:'p2',sequence:2.1,params:{executionContextId:11,type:'page-agent-installed'}},{method:'Runtime.bindingCalled',sessionId:'p2',sequence:3.1,params:{executionContextId:11,type:'client-created',token:'nonce-2'}},{method:'Runtime.bindingCalled',sessionId:'w',sequence:5.1,params:{executionContextId:20,type:'worker-connect',portToken:'port-2'}},{method:'Runtime.bindingCalled',sessionId:'w',sequence:7.1,params:{executionContextId:20,type:'worker-peer',portToken:'port-2',token:'nonce-2'}});
 const r=sharedClients(run,request);assert.equal(r.status,'resolved');assert.deepEqual(r.clients.members,[{role:'observed-page-target',origin:'https://page.test',documents:2,ports:2}]);
});
test('complete pagehide plus target detach removes one owner before a later request',()=>{
 const {run,request,events}=fixture();request.sequence=10;events.push({method:'Runtime.bindingCalled',sessionId:'p',sequence:8,params:{executionContextId:10,type:'client-document-gone',token:'nonce'}},{method:'Target.detachedFromTarget',sequence:9,params:{sessionId:'p'}});
 const r=sharedClients(run,request);assert.equal(r.status,'resolved');assert.deepEqual(r.clients.members,[]);assert.equal(r.clients.endedDocuments,1);
});
test('complete pagehide plus realm clear removes one owner before a later request',()=>{
 const {run,request,events}=fixture();request.sequence=10;events.push({method:'Runtime.bindingCalled',sessionId:'p',sequence:8,params:{executionContextId:10,type:'client-document-gone',token:'nonce'}},{method:'Runtime.executionContextsCleared',sessionId:'p',sequence:9,params:{}});
 const r=sharedClients(run,request);assert.equal(r.status,'resolved');assert.deepEqual(r.clients.members,[]);assert.equal(r.clients.endedDocuments,1);
});
test('pagehide without realm destruction or target detach is not complete teardown proof',()=>{
 const {run,request,events}=fixture();request.sequence=10;events.push({method:'Runtime.bindingCalled',sessionId:'p',sequence:8,params:{executionContextId:10,type:'client-document-gone',token:'nonce'}});
 assert.equal(sharedClients(run,request).reason,'shared-client-teardown-incomplete');
});
test('exact attributed target detach proves the observed owner target ended',()=>{
 const {run,request,events}=fixture();request.sequence=10;events.push({method:'Target.detachedFromTarget',sequence:9,params:{sessionId:'p'}});
 const r=sharedClients(run,request);assert.equal(r.status,'resolved');assert.equal(r.clients.endedDocuments,1);
});
