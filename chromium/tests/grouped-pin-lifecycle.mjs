// Exercise grouped pins through production mutations and native persistence.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const [configPath,out]=process.argv.slice(2);
if(!configPath||!out)throw Error('Usage: grouped-pin-lifecycle.mjs CONFIG EVIDENCE');
assertNodeRuntime();const config=JSON.parse(fs.readFileSync(configPath));
fs.mkdirSync(out,{recursive:true});
const result={candidate:config.candidate,checks:[]},f=new NativeFixture(),w=createWorld(f);
async function check(name,run){await assertRendering(e=>f.host.eval(e));await run();await assertRendering(e=>f.host.eval(e));result.checks.push({name,result:'pass'});console.log('pass '+name);}
const shape=s=>s.tabs.map(t=>({url:t.url,pinned:t.pinned,group:s.groups.find(g=>g.id===t.groupId)?.name??null}));
try{
 await f.launch(config,path.join(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-group-pins-')),'fixture'),{testHooks:true,diskAssets:config.diskAssets!==false});
 await installDriver(f.host);await w.reset();
 const open=name=>w.call('openTab',f.base+'/'+name);
 let pin,regular,standalone;
 await check('pin-group-and-quiet-protection',async()=>{
  pin=await open('group-pin');await w.call('groupTabByName',pin,'work');await w.call('pinTab',pin);
  regular=await open('group-regular');await w.call('groupTabByName',regular,'work');
  standalone=await open('standalone-pin');await w.call('pinTab',standalone);
  await open('loose-last');await w.call('activateTab',regular);
  const s=await w.state(),p=s.tabs.find(t=>t.id===pin),r=s.tabs.find(t=>t.id===regular);
  assert.equal(p.pinned,true);assert.ok(p.groupId);assert.equal(p.groupId,r.groupId);assert.equal(r.pinned,false);
  assert.equal(await w.call('sleepTab',pin),false);
  w.quietCandidateId=pin;const accepted=await w.call('sessionSyncSnapshot');
  assert.equal(accepted[0].find(t=>t.url.endsWith('/group-pin')).pinned,true);
  assert.ok(accepted[0].find(t=>t.url.endsWith('/group-pin')).groupId);
 });
 let expected;
 await check('restart-retains-pin-group-and-order',async()=>{
  expected=shape(await w.state());await w.relaunch();
  assert.deepEqual(shape(await w.state()),expected);
  const s=await w.state();pin=s.tabs.find(t=>t.url.endsWith('/group-pin')).id;
  regular=s.tabs.find(t=>t.url.endsWith('/group-regular')).id;
  standalone=s.tabs.find(t=>t.url.endsWith('/standalone-pin')).id;
 });
 await check('recently-closed-retains-grouped-pin',async()=>{
  await w.call('closeTab',pin);await w.call('reopenClosed');
  const s=await w.waitFor(()=>w.state(),s=>s.tabs.some(t=>t.url.endsWith('/group-pin')),'reopened group pin');
  const p=s.tabs.find(t=>t.url.endsWith('/group-pin'));pin=p.id;
  assert.equal(p.pinned,true);assert.ok(p.groupId);
 });
 await check('group-native-pin-and-ungroup',async()=>{
  await w.call('groupTabByName',standalone,'work');
  let p=(await w.state()).tabs.find(t=>t.id===standalone);assert.equal(p.pinned,true);assert.ok(p.groupId);
  await w.api('setTabGroup',[standalone,null]);
  p=(await w.state()).tabs.find(t=>t.id===standalone);assert.equal(p.pinned,true);assert.equal(p.groupId,null);
  await w.call('pinTab',pin);p=(await w.state()).tabs.find(t=>t.id===pin);assert.equal(p.pinned,false);assert.ok(p.groupId);
  await w.call('pinTab',regular); // A pin after an unpinned member must keep saved order.
 });
 await check('space-capture-and-restore',async()=>{
  expected=shape(await w.state());
  const save=await w.call('workspaceAction','save','Grouped pins');assert.equal(save.ok,true,JSON.stringify(save));
  const created=await w.call('workspaceAction','create','Empty');assert.equal(created.ok,true,JSON.stringify(created));
  await w.waitFor(()=>w.state(),s=>s.tabs.every(t=>!t.isLoading),'blank Space finishes loading');
  const reopened=await w.call('workspaceAction','open',save.workspaceId??save.workspace.id);
  assert.equal(reopened.ok,true,JSON.stringify({save,created,reopened}));
  await w.waitFor(()=>w.state(),s=>s.tabs.some(t=>t.url.endsWith('/group-pin')),'grouped-pin Space restored');
  assert.deepEqual(shape(await w.state()),expected);
 });
}catch(error){result.checks.push({name:'current check',result:error.code==='BLANC_ENVIRONMENT_STOP'?'blocked':'fail',error:String(error.stack)});process.exitCode=1;}
finally{
 const store=path.join(f.profile??'', 'Default','BlancPrototypeSpaces.json');
 if(fs.existsSync(store))fs.copyFileSync(store,path.join(out,'spaces.json'));
 fs.writeFileSync(path.join(out,'final-state.json'),JSON.stringify(await w.state().catch(()=>null),null,2));
 const exit=await f.close();if(exit?.code!==0){result.checks.push({name:'shutdown',result:'fail',exit});process.exitCode=1;}
 if(f.directory){fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));fs.rmSync(path.dirname(f.directory),{recursive:true,force:true});}
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
}
