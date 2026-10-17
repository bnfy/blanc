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
