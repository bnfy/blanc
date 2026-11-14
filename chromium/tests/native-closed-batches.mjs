// Native history durability and whole-batch retention beyond 25 physical entries.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-closed-batches-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
async function closeBatch(ids){
 await w.call('selectTabRows',null,'clear');
 for(const id of ids.slice(0,-1))await w.call('selectTabRows',id,'toggle');
 assert.deepEqual(new Set(await w.call('selectedTabIds')),new Set(ids));
 assert.equal(await w.call('runSelectedTabsAction','batch-close'),true);
 await w.waitForState(s=>ids.every(id=>!s.tabs.some(t=>t.id===id)));
}
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await visible();await w.reset();
 const urls=Array.from({length:30},(_,i)=>w.fixtureUrl('closed-batch-'+i)),ids=[];
 for(const url of urls)ids.push(await w.call('openTab',url));
 await w.waitForState(s=>urls.every(url=>s.tabs.some(t=>t.url===url&&!t.loading)));
 await w.api('clearClosedEntries');
 await closeBatch(ids);
 assert.equal((await w.call('closedEntriesSummary')).at(-1).tabCount,30);
 result.checks.push('all 30 selected pages close into one history batch');
 await w.relaunch();await visible();
 await w.waitFor(()=>w.call('closedEntriesSummary'),rows=>rows.length===1&&rows[0].tabCount===30,'complete batch restored from native history');
 await w.call('reopenClosed');
 const restored=await w.waitForState(s=>urls.every(url=>s.tabs.some(t=>t.url===url)));
 assert.deepEqual(restored.tabs.filter(t=>urls.includes(t.url)).map(t=>t.url),urls);
 assert.equal(restored.tabs.find(t=>t.id===restored.activeTabId).url,urls.at(-1));
 result.checks.push('native restart retains every member, order and selected page');
 await closeBatch(restored.tabs.filter(t=>urls.includes(t.url)).map(t=>t.id));
 for(let i=0;i<25;i++){
  const tab=await w.call('openTab',w.fixtureUrl('later-close-'+i));
  await w.waitForState(s=>s.tabs.some(t=>t.id===tab&&!t.loading));
  await w.call('closeTab',tab);
  await w.waitForState(s=>!s.tabs.some(t=>t.id===tab));
  if(i===23){assert.equal((await w.call('closedEntriesSummary')).find(e=>e.tabCount>1)?.tabCount,30);await visible();}
 }
 const remaining=await w.call('closedEntriesSummary');assert.equal(remaining.length,25);
 assert.ok(remaining.every(e=>e.tabCount===1));
 result.checks.push('25 newer history items evict the old batch whole');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
