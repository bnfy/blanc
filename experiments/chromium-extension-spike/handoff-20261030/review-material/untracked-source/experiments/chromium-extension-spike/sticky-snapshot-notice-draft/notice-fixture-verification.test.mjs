import test from 'node:test';import assert from 'node:assert/strict';import {phaseReady} from './notice-fixture-verification.mjs';
const base={name:'recovery',timeoutSeen:true,timeoutAt:10000,dropped:true,droppedSuccess:true,successes:[{timeMs:10010,hidden:true,timeoutVisible:false}]};
test('only a real later success can complete recovery',()=>{
 assert(phaseReady(base,'recovery'));
 for(const change of [{timeoutSeen:false},{droppedSuccess:false},{successes:[{timeMs:9999,hidden:true,timeoutVisible:false}]},{successes:[{timeMs:10010,hidden:false,timeoutVisible:true}]}])assert.equal(phaseReady({...base,...change},'recovery'),false);
});
test('warning must be injected and still visible after the timeout',()=>{
 const b={...base,name:'unrelated',warningInjected:true,successes:[{timeMs:10010,unrelatedVisible:true}]};assert(phaseReady(b,'unrelated'));assert.equal(phaseReady({...b,warningInjected:false},'unrelated'),false);assert.equal(phaseReady({...b,successes:[{timeMs:9999,unrelatedVisible:true}]},'unrelated'),false);
});
