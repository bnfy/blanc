import test from 'node:test';
import assert from 'node:assert/strict';
import {tabs} from './adapters/tabs.mjs';
import {core} from './adapters/core.mjs';

test('quiet paths release harness DevTools before asking production to discard', async () => {
 for (const [name,args,method] of [
  ['sleepTab',['17'],'quietTab'],['sleepBackgroundTabsNow',[],'sleepBackgroundTabs'],
 ]) {
  const calls=[];
  const w={snapshot:async()=>({tabs:[{id:17,private:false}]}),app:{releasePages(){calls.push('detach');}},api(m,a){calls.push([m,a]);return true;}};
  assert.equal(await tabs[name](w,...args),true);
  assert.deepEqual(calls,['detach',[method,args.length?args:undefined]]);
 }
});

test('the real slash-command panel releases page inspection connections', async () => {
 const calls=[];
 const w={app:{releasePages(){calls.push('detach');}},hostEval(source){calls.push(source);}};
 await core.openPanel(w);
 assert.equal(calls[0],'detach');
 assert.match(calls[1],/api.openIsland/);
});

test('private discard remains undefined before any dispatch',async()=>{
 const w={snapshot:async()=>({tabs:[{id:17,private:true}]}),app:{releasePages(){assert.fail('private discard must not start');}}};
 await assert.rejects(()=>tabs.sleepTab(w,'17'),{code:'BLANC_ADAPTER_UNDEFINED'});
});
