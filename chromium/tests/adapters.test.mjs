import test from 'node:test';
import assert from 'node:assert/strict';
import {observedState,UndefinedNativeAdapterError} from './lib/adapters.mjs';
import {waitFor} from './lib/cdp.mjs';
import {shippingCore,matchStep} from './steps.mjs';
import {missingAdapters} from './world.mjs';
test('native DTO adapters preserve real values and refuse missing contract fields',async()=>{
 const actual={tabs:[{id:7,pinned:false,groupId:null}],activeTabId:7};
 const state=observedState(actual);
 assert.equal((await state).activeTabId,7);
 assert.equal(state.tabs.find(t=>t.id===7).pinned,false);
 assert.equal(state.tabs[0].groupId,null);
 assert.equal(JSON.stringify(state),JSON.stringify(actual));
 assert.throws(()=>state.clusters,UndefinedNativeAdapterError);
});
test('polling cannot turn an undefined adapter into a product timeout',async()=>{
 let reads=0;
 await assert.rejects(()=>waitFor(()=>{reads++;throw new UndefinedNativeAdapterError('unported field');},Boolean,'adapter',5000),UndefinedNativeAdapterError);
 assert.equal(reads,1);
});
test('pinned shipping callbacks share the reset per-scenario context',()=>{
 shippingCore.resetContext({tabByName:{old:3},groupMembers:{old:[3]}});
 shippingCore.resetContext({tabByName:{new:8}});
 assert.deepEqual(shippingCore.context.tabByName,{new:8});
 assert.equal(shippingCore.context.groupMembers,undefined);
 const definition=matchStep('a tab open on "local"').definition;
 assert.equal(definition.shippingSource,'test/desktop/steps/runnable.steps.js');
 assert.match(definition.shippingSourceSha256,/^[a-f0-9]{64}$/);
});
test('unported fixture seeds are identified before browser launch',()=>{
 const definition={run:async function(){await this.call('seedHistory');await this.call('state');}};
 assert.deepEqual(missingAdapters(definition),['seedHistory']);
});
