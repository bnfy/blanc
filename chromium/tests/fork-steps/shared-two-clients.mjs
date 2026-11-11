// Two independent native processes; after joining, convergence uses only
// autosave and scheduled Sync. No manual capture, pull or quota reset.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {NativeFixture} from '../lib/fixture.mjs';
import {installDriver} from '../lib/test-driver.mjs';
import {assertRendering} from '../lib/render-guard.mjs';

export function registerSharedClients(step,{rpc,state,handle,passphrase}){
 step('a second complete desktop client sharing Work',async function(){
  const fixture=new NativeFixture();fixture.extraArgs=[`--blanc-sync-endpoint=${await this.syncServer.clientEndpoint('B')}`];
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-q4-peer-'));
  this.closeNativePeer=async()=>{
   const exit=await fixture.close();
   const log=fixture.directory&&path.join(fixture.directory,'browser.log');if(log&&fs.existsSync(log))fs.copyFileSync(log,path.join(this.fixture.directory,'peer-browser.log'));
   fs.rmSync(directory,{recursive:true,force:true});if(fixture.process)assert.equal(exit?.code,0,'second native client exited cleanly');
  };
  await fixture.launch(this.fixture.config,path.join(directory,'browser'),{testHooks:true,diskAssets:false,
   pages:{...this.fixture.pages,close:async()=>{}}});
  await installDriver(fixture.host);
  const {createWorld}=await import('../world.mjs');
  this.peerWorld=createWorld(fixture);await this.peerWorld.reset();
  // Both isolated windows remain visible so the normal rendering guard can
  // qualify each one even when the other window takes focus.
  const screen=await fixture.host.eval('({x:screen.availLeft,y:screen.availTop,width:screen.availWidth,height:screen.availHeight})');
  const width=Math.floor(screen.width/2);
  for(const [at,host] of [this.fixture.host,fixture.host].entries()){
   const {windowId}=await host.send('Browser.getWindowForTarget');
   await host.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});
   await host.send('Browser.setWindowBounds',{windowId,bounds:{left:screen.x+at*width,top:screen.y,width,height:screen.height}});
   await assertRendering(e=>host.eval(e));
  }
  assert.equal((await rpc(this.peerWorld,'sync.enable',[{handle,passphrase}])).ok,true);
  assert.equal((await rpc(this.peerWorld,'desktop.spaces.apply',[{enabled:true,selections:[]}])).ok,true);
  await rpc(this.peerWorld,'sync.syncNow');
  const current=await this.waitFor(()=>state(this.peerWorld),s=>s.rows.some(r=>r.name==='Work'),'second native Work import',15000);
  assert.equal((await this.peerWorld.call('workspaceAction','open',current.rows.find(r=>r.name==='Work').id)).ok,true);
  this.sid=Object.keys(current.shared.blobs)[0];
 });
 step('both complete clients exchange quiet tabs in both directions',async function(){
  this.fromA=this.fixtureUrl('two-client-a');this.fromB=this.fixtureUrl('two-client-b');
  this.newA=await this.call('openTab',this.fromA);
  let received=await this.waitFor(()=>this.peerWorld.state(),s=>s.tabs.some(t=>t.url===this.fromA),'automatic A tab on B',300000);
  assert.equal(received.tabs.find(t=>t.url===this.fromA).asleep,true);
  this.newB=await this.peerWorld.call('openTab',this.fromB);
  received=await this.waitFor(()=>this.state(),s=>s.tabs.some(t=>t.url===this.fromB),'automatic B tab on A',300000);
  assert.equal(received.tabs.find(t=>t.url===this.fromB).asleep,true);
 });
 step('a complete client defers active navigation until its tab changes',async function(){
  const b=await this.peerWorld.state();this.peerActive=b.activeTabId;
  assert.equal(b.tabs.find(t=>t.id===this.peerActive).url,this.fromB);
  const local=(await this.state()).tabs.find(t=>t.url===this.fromB);this.peerNavigated=this.fixtureUrl('two-client-nav');
  await this.call('activateTab',local.id);await this.waitForState(s=>s.tabs.some(t=>t.id===local.id&&!t.asleep&&!t.isLoading));
  await this.call('navigateTab',local.id,this.peerNavigated);
  await this.waitForState(s=>s.tabs.some(t=>t.id===local.id&&t.url===this.peerNavigated&&!t.isLoading));
  await this.waitFor(()=>state(this.peerWorld),s=>Object.values(s.shared.windows).some(w=>w.accepted.some(r=>r.op==='nav'&&r.value?.v?.url===this.peerNavigated)),
   'automatic deferred navigation receipt',300000);
  assert.equal((await this.peerWorld.state()).tabs.find(t=>t.id===this.peerActive).url,this.fromB);
  await this.peerWorld.call('openTab',this.fixtureUrl('two-client-unprotect'));
  await this.waitFor(()=>this.peerWorld.state(),s=>s.tabs.some(t=>t.id===this.peerActive&&t.url===this.peerNavigated),'deferred navigation applied',15000);
 });
 step('a complete client receives one remote close entry',async function(){
  await this.peerWorld.call('openTab',this.fixtureUrl('two-client-close-unprotect'));await this.call('closeTab',this.newA);
  await this.waitFor(()=>this.peerWorld.state(),s=>!s.tabs.some(t=>t.url===this.fromA),'automatic remote close applied',300000);
  await this.waitFor(()=>state(this.peerWorld),s=>s.closed.some(r=>r.title.includes('two-client-a')),'automatic remote close feed',300000);
  await this.peerWorld.hostEval('window.BlancPrototypeHost.refreshSyncSurfaces()');
  await this.peerWorld.call('openPanel');
  // Inspect the merged native/remote rows the actual Island receives.
  const closed=(await this.peerWorld.api('getAllTabs')).closed;
  assert.equal(closed.filter(r=>r.title.includes('two-client-a')).length,1);
 });
 step('both complete clients rejoin dormant edits without duplicate tabs',async function(){
  for(const w of [this,this.peerWorld])assert.equal((await rpc(w,'desktop.spaces.apply',[{enabled:false,selections:[]}])).ok,true);
  const urls=[this.fixtureUrl('dormant-a'),this.fixtureUrl('dormant-b')];
  await this.call('openTab',urls[0]);await this.peerWorld.call('openTab',urls[1]);
  for(const w of [this,this.peerWorld]){
   const current=await state(w),work=current.rows.find(r=>r.name==='Work');
   assert.equal((await rpc(w,'desktop.spaces.apply',[{enabled:true,selections:[{id:work.id,mode:'rejoin'}]}])).ok,true);
  }
  for(const w of [this,this.peerWorld]){
   const current=await this.waitFor(()=>w.state(),s=>urls.every(url=>s.tabs.some(t=>t.url===url)),'automatic dormant rejoin',300000);
   for(const url of urls)assert.equal(current.tabs.filter(t=>t.url===url).length,1);
  }
 });
 step('the complete clients stay within their request budgets',async function(){
  const gets=this.syncServer.requests.filter(r=>r.method==='GET');
  for(const client of ['A','B']){
   const times=gets.filter(r=>r.client===client).map(r=>r.at);assert.ok(times.length>10);
   for(const at of times)assert.ok(times.filter(time=>time>at-60000&&time<=at).length<=10,client+' rolling GET budget');
  }
  const minutes=new Map();for(const row of gets){const m=Math.floor(row.at/60000);minutes.set(m,(minutes.get(m)??0)+1);}
  for(const count of minutes.values())assert.ok(count<=20);
  assert.equal(this.syncServer.requests.some(r=>r.status===429),false);
  for(const w of [this,this.peerWorld])await assertRendering(e=>w.fixture.host.eval(e));
 });
}
