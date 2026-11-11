// Shipping F57 assertions with native desktop transport and the local Worker.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {nativeCall} from '../lib/test-driver.mjs';
import {syncRoom} from '../lib/sync-fixture.mjs';
import {inSettings,readSettings} from '../adapters/commands.mjs';
import {registerSharedClients} from './shared-two-clients.mjs';
const require=createRequire(import.meta.url);
const {deriveKeys,encrypt,decrypt}=require('../../../src/main/sync-crypto.js');
const model=require('../../../src/main/shared-spaces-model.js');
const {PRESETS}=require('../../../src/renderer/space-identity.js');
const presetHex=name=>{const preset=PRESETS.find(p=>p.id===name);assert.ok(preset);return preset.hex;};
const workTab=(w,which)=>({first:w.firstTab,second:w.secondTab})[which];
const workUrl=(w,which)=>w.fixtureUrl({first:'shared-first',second:'shared-second'}[which]);
const handle='Shared Spaces acceptance',passphrase='correct horse battery staple Shared Spaces';
const rpc=(w,method,args=[])=>nativeCall(w.fixture.host,'desktopSyncCall',[method,args],null,180000);
const state=w=>rpc(w,'desktop.spaces.snapshotForTest');
async function pull(w,stores){
 await syncRoom(w);await rpc(w,'sync.resetRequestWindowForTest');
 return rpc(w,'sync.syncNow',stores?[stores]:[]);
}
async function setup(w,shared,beforeSave){
 assert.ok(w.syncServer,'Shared Spaces uses only the local Worker');
 w.sharedFixture=w.syncServer;w.sharedKey=deriveKeys(handle,passphrase);
 w.firstTab=await w.call('openTab',w.fixtureUrl('shared-first'));
 w.secondTab=await w.call('openTab',w.fixtureUrl('shared-second'));
 await beforeSave?.();
 assert.equal((await w.call('workspaceAction','save','Work')).ok,true);
 assert.equal((await rpc(w,'sync.enable',[{handle,passphrase}])).ok,true);
 const current=await w.waitFor(()=>state(w),s=>s.rows?.some(r=>r.name==='Work'),'native Work inventory');
 w.workId=current.rows.find(r=>r.name==='Work').id;
 w.expectedSharedTabCount=(await w.call('workspaceAction','saved-urls',w.workId)).filter(u=>/^https?:/.test(u)).length;
 if(shared){
  assert.equal((await rpc(w,'desktop.spaces.apply',[{enabled:true,selections:[{id:w.workId,mode:'copy'}]}])).ok,true);
  if(w.scenarioTags?.includes('@two-clients'))await rpc(w,'sync.syncNow');
  else await pull(w);
 }
}
async function sharedCopy(w){
 const current=await state(w);w.sid??=Object.keys(current.shared.blobs)[0];
 await pull(w,['space-'+w.sid]);await syncRoom(w);
 const response=await fetch(`${w.syncServer.url}/v1/blob/${w.sharedKey.accountId}/space-${w.sid}`);assert.equal(response.status,200);
 return JSON.parse(decrypt(w.sharedKey.key,(await response.json()).blob));
}
function sharedGroup(blob,url){
 const record=Object.values(blob.tabs).find(r=>r.nav.v.url===url&&!r.deleted.v);assert.ok(record);
 const group=blob.groups[record.groupId.v];return group&&!group.deleted.v?group:null;
}
async function editPeer(w,edit){
 const current=await state(w),sid=Object.keys(current.shared.blobs)[0];assert.ok(sid);w.sid=sid;
 await syncRoom(w);
 const endpoint=`${w.syncServer.url}/v1/blob/${w.sharedKey.accountId}/space-${sid}`;
 const response=await fetch(endpoint);assert.equal(response.status,200);
 const stored=await response.json(),blob=JSON.parse(decrypt(w.sharedKey.key,stored.blob));
 w.beforePeer=structuredClone(blob);edit(blob);
 if(w.closedRecord){
  const now=Date.now(),closed={devices:{'device-b':{name:'B',platform:'linux',updatedAt:now,items:[{
   id:w.closedRecord,url:w.beforePeer.tabs[w.closedRecord].nav.v.url,title:'shared-first',closedAt:now,spaceId:sid}]}}};
  const closedEndpoint=`${w.syncServer.url}/v1/blob/${w.sharedKey.accountId}/closed`;
  const previous=await fetch(closedEndpoint),saved=previous.status===200?await previous.json():null;
  assert.equal((await fetch(closedEndpoint,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({
   ifVersion:saved?.version??null,blob:encrypt(w.sharedKey.key,JSON.stringify(closed))})})).status,200);
  await pull(w,['closed']);
 }
 const put=await fetch(endpoint,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({ifVersion:stored.version,blob:encrypt(w.sharedKey.key,JSON.stringify(blob))})});
 assert.equal(put.status,200);await pull(w,['space-'+sid]);
}
export default function register(step){
 registerSharedClients(step,{rpc,state,handle,passphrase});
 step('device B closes the background Work tab',async function(){
  await editPeer(this,blob=>{const id=Object.keys(blob.tabs).find(id=>blob.tabs[id].nav.v.url===this.fixtureUrl('shared-first'));
   assert.ok(id);this.closedRecord=id;blob.tabs[id].deleted=model.field(true,Date.now()+1,'device-b');});
 });
 step('its parked page appears once in Recently closed',async function(){
  const closed=await this.waitFor(async()=>(await this.api('getAllTabs')).closed,
   rows=>rows?.some(row=>row.title.includes('shared-first')&&row.fromName==='B'),'merged remote closed occurrence');
  assert.equal(closed.filter(row=>row.title.includes('shared-first')).length,1);
  assert.equal((await this.native('closedHeld')).find(row=>row.sharedTabId===this.closedRecord)?.held,true);
  assert.equal((await this.state()).tabs.some(t=>t.id===this.firstTab),false);
 });
 step('a Shared Spaces fixture whose shared Work Space has a tab alone in a group',async function(){
  await setup(this,true,async()=>{
   await this.call('groupTabByName',this.firstTab,'Held');
   await this.waitForState(s=>s.tabs.some(t=>t.id===this.firstTab&&t.groupId));
  });
  assert.notEqual((await this.state()).activeTabId,this.firstTab);
  const blob=Object.values((await state(this)).shared.blobs)[0].blob;
  const record=Object.values(blob.tabs).find(r=>r.nav.v.url===this.fixtureUrl('shared-first'));
  assert.ok(record?.groupId.v&&blob.groups[record.groupId.v]?.deleted.v===false);
 });
 step('the Shared Spaces client quits normally and relaunches',async function(){
  const current=await state(this);
  assert.ok(Object.values(current.shared.windows).some(w=>w.accepted.some(r=>r.op==='nav'&&r.id===this.navigated)));
  await this.relaunch({afterStop:()=>{
   this.storeAtQuit=JSON.parse(fs.readFileSync(path.join(this.fixture.profile,'Default','BlancSync','shared-spaces.json'),'utf8'));
  }});
 });
 step('the quit saved no closed Work tab and kept the held navigation',function(){
  const saved=this.storeAtQuit,blob=saved.blobs[this.sid].blob;
  assert.deepEqual(Object.values(blob.tabs).filter(r=>r.deleted.v).map(r=>r.nav.v.url),[]);
  assert.deepEqual(Object.entries(saved.pending[this.sid]?.tabs??{}).filter(([,edit])=>edit.deleted).map(([id])=>id),[]);
  assert.equal(Object.values(blob.groups).some(g=>g.deleted.v),false);
  assert.ok(Object.values(saved.windows).some(w=>w.spaceId===this.sid&&w.accepted.some(r=>r.op==='nav'&&r.id===this.navigated)));
 });
 step('the relaunched client applies the held navigation and keeps every Work tab',async function(){
  const remote=this.fixtureUrl('remote-navigation');
  const local=await this.waitForState(s=>s.tabs.some(t=>t.url===remote),{timeout:30000});
  const first=local.tabs.filter(t=>t.url===this.fixtureUrl('shared-first'));assert.equal(first.length,1);assert.ok(first[0].groupId);
  assert.equal(local.tabs.filter(t=>t.url===remote).length,1);assert.equal(local.tabs.some(t=>t.url===this.oldUrl),false);
  assert.equal(Object.values((await state(this)).shared.windows).some(w=>w.accepted.length),false);
  const blob=await sharedCopy(this);
  assert.deepEqual(Object.values(blob.tabs).filter(r=>r.deleted.v).map(r=>r.nav.v.url),[]);
  assert.equal(blob.tabs[this.navigated].nav.v.url,remote);assert.equal(Object.values(blob.groups).some(g=>g.deleted.v),false);
 });
 step('Blanc is in front',async function(){
  await this.fixture.host.send('Page.bringToFront');await rpc(this,'sync.resetRequestWindowForTest');
 });
 step("the sync Worker can't answer change checks",function(){this.syncServer.setVersions(false);});
 step('another device shares a new Space {string}',async function(name){
  await syncRoom(this);const {accountId,key}=this.sharedKey,base=`${this.syncServer.url}/v1/blob/${accountId}/`;
  const sid=crypto.randomBytes(16).toString('hex'),tabId=crypto.randomBytes(16).toString('hex');
  const field=v=>model.field(v,Date.now(),'peer');
  const blob={v:1,spaceId:sid,groups:{},tabs:{[tabId]:{nav:field({url:this.fixtureUrl('shared-first'),title:'Peer tab'}),
   name:field(null),pinned:field(false),groupId:field(null),pos:field(model.keyFor('','',tabId)),deleted:field(false)}}};
  const put=(store,body)=>fetch(base+store,{method:'PUT',body:JSON.stringify(body)});
  assert.equal((await put('space-'+sid,{ifVersion:null,blob:encrypt(key,JSON.stringify(blob))})).status,200);
  for(let attempt=0;attempt<3;attempt++){
   const current=await fetch(base+'spaces'),record=current.status===200?await current.json():null;
   const index=record?JSON.parse(decrypt(key,record.blob)):{v:1,spaces:{}};
   index.spaces[sid]={name:field(name),color:field('#426c4c'),symbol:field('briefcase'),pos:field(model.keyFor('','',sid)),deleted:field(false),
    rev:model.revisionOf(blob),revAt:Date.now(),revBy:'peer',createdAt:Date.now(),createdBy:'peer'};
   const written=await put('spaces',{ifVersion:record?.version??null,blob:encrypt(key,JSON.stringify(index))});
   if(written.status===200)return;assert.equal(written.status,409);
  }
  assert.fail('peer index write did not converge');
 });
 step('the {string} Space appears here within {int} seconds',async function(name,seconds){
  await this.waitFor(async()=>{
   await this.fixture.host.send('Page.bringToFront');return (await this.call('workspaceAction','list')).items;
  },rows=>rows.some(row=>row.name===name),name+' arrives through automatic change checks',seconds*1000);
 });
 step('the account storage is full and I delete Work',async function(){
  const current=await state(this);this.sid=Object.keys(current.shared.blobs)[0];
  this.syncServer.env.ACCOUNT_STORAGE_QUOTA_BYTES=String((await this.syncServer.quotaUsage(this.sharedKey.accountId)).bytes);
  this.quotaProbe=()=>fetch(`${this.syncServer.url}/v1/blob/${this.sharedKey.accountId}/space-${'d'.repeat(32)}`,{
   method:'PUT',body:JSON.stringify({ifVersion:null,blob:encrypt(this.sharedKey.key,JSON.stringify({probe:'x'.repeat(100)}))})});
  const refused=await this.quotaProbe();assert.equal(refused.status,507);assert.deepEqual(await refused.json(),{error:'account-quota'});
  assert.equal((await this.call('workspaceAction','remove',this.workId)).ok,true);await pull(this,['space-'+this.sid]);
 });
 step('the next encrypted write succeeds without waiting for retention expiry',async function(){
  const saved=this.syncServer.blobs.get(`blob:${this.sharedKey.accountId}:space-${this.sid}`);assert.ok(saved);
  const compact=JSON.parse(decrypt(this.sharedKey.key,JSON.parse(saved).blob));assert.deepEqual(compact.tabs,{});assert.deepEqual(compact.groups,{});
  assert.equal((await this.quotaProbe()).status,200);assert.equal((await state(this)).shared.index.spaces[this.sid].deleted.v,true);
 });
 const ready=async w=>{
  await w.waitFor(async()=>({snapshot:await w.snapshot(),restore:await w.native('crashBubble',['state'])}),
   s=>!s.restore.restoring&&!s.restore.awaitingAck&&!s.snapshot.spaceBusy&&!s.snapshot.spaceAutosaveError&&!s.snapshot.initialWindowSaveFailed,
   'native restoration and Space persistence ready',30000);
 };
 step('device B closes the active Work tab',async function(){
  this.closedActiveUrl=this.fixtureUrl('shared-second');
  await editPeer(this,blob=>{const id=Object.keys(blob.tabs).find(id=>blob.tabs[id].nav.v.url===this.closedActiveUrl);assert.ok(id);
   blob.tabs[id].deleted=model.field(true,Date.now()+1,'device-b');
  });
  assert.ok(Object.values((await state(this)).shared.windows).some(w=>w.accepted.some(row=>row.op==='close')),'remote close durably deferred before crash');
 });
 step('the Shared Spaces client crashes and restores',async function(){await this.relaunch({crash:true});});
 step('cold restore applies the deferred close and resumes persistence',async function(){
  await ready(this);assert.equal((await this.state()).tabs.some(t=>t.url===this.closedActiveUrl),false);
  assert.equal(Object.values((await state(this)).shared.windows).some(w=>w.accepted.some(row=>row.op==='close')),false);
 });
 step('the merged remote tab survives the crash without a duplicate',async function(){
  await ready(this);assert.equal((await this.state()).tabs.filter(t=>t.url===this.remoteUrl).length,1);
 });
 step('an index write fails after the new Space blob succeeds',async function(){
  this.indexFault=this.syncServer.inject({type:'network',method:'PUT',store:'spaces',times:Infinity});
  assert.equal((await rpc(this,'desktop.spaces.apply',[{enabled:true,selections:[{id:this.workId,mode:'copy'}]}])).ok,true);
  this.sid=Object.keys((await state(this)).shared.blobs)[0];
  await this.waitFor(()=>this.syncServer.blobs.has(`blob:${this.sharedKey.accountId}:space-${this.sid}`),Boolean,'Space blob saved');
  assert.equal(this.syncServer.env.records.has(`blob:${this.sharedKey.accountId}:spaces`),false);
 });
 step('the restored client retries the missing index entry',async function(){
  this.indexFault.remaining=0;await pull(this,['space-'+this.sid,'spaces']);
  const raw=this.syncServer.env.records.get(`blob:${this.sharedKey.accountId}:spaces`);assert.ok(raw);
  assert.ok(JSON.parse(decrypt(this.sharedKey.key,JSON.parse(raw).blob)).spaces[this.sid]);
  assert.ok(this.syncServer.blobs.has(`blob:${this.sharedKey.accountId}:space-${this.sid}`));
 });
 step('a Shared Spaces fixture whose shared Work Space has the first Work tab in a group {string}',async function(name){
  await setup(this,true,async()=>{
   await this.call('groupTabByName',this.firstTab,name);
   await this.waitForState(s=>s.tabs.some(t=>t.id===this.firstTab&&t.groupId));
  });
  assert.equal(sharedGroup(await sharedCopy(this),workUrl(this,'first'))?.name.v,name);
 });
 step('I put the first Work tab in a new group {string} with the group command',async function(name){
  await this.call('activateTab',this.firstTab);await this.waitForState(s=>s.activeTabId===this.firstTab);
  await this.call('openPanel');await this.call('editAddressInput',`/group ${name}`);await this.call('pressAddressKey','Enter');
  await this.waitForState(s=>s.groups.some(g=>g.id===s.tabs.find(t=>t.id===this.firstTab)?.groupId&&g.name===name));
 });
 step('I switch to the {word} Work tab',async function(which){
  const id=workTab(this,which);assert.ok(id);await this.call('activateTab',id);await this.waitForState(s=>s.activeTabId===id);
 });
 step('the {string} group keeps the {word} Work tab here and in the shared copy',async function(name,which){
  const blob=await sharedCopy(this),local=await this.state();
  assert.equal(local.groups.find(g=>g.id===local.tabs.find(t=>t.id===workTab(this,which))?.groupId)?.name,name);
  assert.equal(sharedGroup(blob,workUrl(this,which))?.name.v,name);
 });
 step('I rename the group {string} to {string} and color it {string}',async function(from,to,color){
  assert.equal(await this.call('beginRenameGroupByName',from),true);
  await this.waitFor(()=>this.call('overlayRendererMode'),m=>m==='panel','group rename prompt');
  await this.frame('overlay').fill('#addressInput',to);await this.frame('overlay').press('#addressInput','Enter');
  await this.waitForState(s=>s.groups.some(g=>g.name===to));
  assert.equal(await this.call('setGroupColorByName',to,presetHex(color)),true);
 });
 step('the shared copy has the group {string} colored {string} holding the first Work tab',async function(name,color){
  const group=sharedGroup(await sharedCopy(this),workUrl(this,'first'));
  assert.deepEqual(group&&{name:group.name.v,color:group.color.v},{name,color:presetHex(color)});
 });
 step('device B renames the group {string} to {string} and colors it {string}',async function(from,to,color){
  await editPeer(this,blob=>{
   const id=Object.keys(blob.groups).find(id=>blob.groups[id].name.v===from&&!blob.groups[id].deleted.v);assert.ok(id);
   const f=v=>model.field(v,Date.now()+1,'device-b');blob.groups[id].name=f(to);blob.groups[id].color=f(presetHex(color));
  });
 });
 step('this device shows the group {string} colored {string} holding the first Work tab',async function(name,color){
  await this.waitForState(s=>{const g=s.groups.find(g=>g.id===s.tabs.find(t=>t.id===this.firstTab)?.groupId);return g?.name===name&&g.color===presetHex(color);},{timeout:30000});
 });
 step('I move the second Work tab into {string}',async function(name){
  await this.call('groupTabByName',this.secondTab,name);
  await this.waitForState(s=>s.groups.some(g=>g.id===s.tabs.find(t=>t.id===this.secondTab)?.groupId&&g.name===name));
 });
 step('the shared copy has the group {string} colored {string} holding both Work tabs',async function(name,color){
  const blob=await sharedCopy(this);
  for(const which of ['first','second']){const g=sharedGroup(blob,workUrl(this,which));assert.deepEqual(g&&{name:g.name.v,color:g.color.v},{name,color:presetHex(color)});}
  const local=await this.state();assert.equal(local.tabs.find(t=>t.id===this.firstTab).groupId,local.tabs.find(t=>t.id===this.secondTab).groupId);
 });
 step('the background Work tab has unsaved input',async function(){
  assert.notEqual((await this.state()).activeTabId,this.firstTab);
  await this.call('workspacePageScript',this.firstTab,"(()=>{const i=document.createElement('input');i.id='draft';document.body.append(i);i.value='typed draft';return true;})()");
 });
 step('device B navigates the background Work tab',async function(){
  this.backgroundUrl=this.fixtureUrl('shared-first');
  await editPeer(this,blob=>{const id=Object.keys(blob.tabs).find(id=>blob.tabs[id].nav.v.url===this.backgroundUrl);assert.ok(id);this.navigated=id;
   blob.tabs[id].nav=model.field({url:this.fixtureUrl('remote-navigation'),title:'Remote navigation'},Date.now()+1,'device-b');
  });
 });
 step('the background tab keeps its page and its input',async function(){
  assert.equal((await this.state()).tabs.find(t=>t.id===this.firstTab).url,this.backgroundUrl);
  assert.equal(await this.call('workspacePageScript',this.firstTab,"document.getElementById('draft')?.value"),'typed draft');
 });
 step('its input is cleared and Shared Spaces applies again',async function(){
  await this.call('workspacePageScript',this.firstTab,"document.getElementById('draft').remove()");
  const active=(await this.state()).activeTabId;
  await this.call('activateTab',this.firstTab);await this.waitForState(s=>s.activeTabId===this.firstTab);
  await this.call('activateTab',active);await this.waitForState(s=>s.activeTabId===active);
 });
 step('the background tab follows the remote navigation',async function(){
  await this.waitForState(s=>s.tabs.some(t=>t.id===this.firstTab&&t.url===this.fixtureUrl('remote-navigation')),{timeout:30000});
 });
 const settings=async w=>{await w.api('openPage',['settings','sync']);await inSettings(w,'sync',()=>({value:true}));
  await w.waitFor(()=>w.call('sharedSpacesView'),s=>s?.syncEnabled&&s.chooseEnabled,'loaded Sync settings',15000);w.sharedSettingsOpened=true;};
 step('erasing the server copy fails once',async function(){
  await settings(this);const remove=this.syncServer.env.SYNC.delete;let fail=true;
  this.syncServer.env.SYNC.delete=async key=>{if(fail){fail=false;throw Error('erase failed once');}return remove(key);};
  assert.equal(await this.call('sharedSpacesAct','wipe'),true);assert.equal(await this.call('sharedSpacesAct','disable'),true);
 });
 step('Settings keeps the credentials and offers an erasure retry',async function(){
  const view=await this.waitFor(()=>this.call('sharedSpacesView'),s=>s?.text.includes('server copy is still being erased')&&s.wipeEnabled,'erasure retry',30000);
  assert.equal(view.eraseRetryVisible,true);assert.equal(view.disableVisible,true);assert.equal(view.syncEnabled,true);
  const saved=JSON.parse(fs.readFileSync(path.join(this.fixture.profile,'Default','BlancSync','sync.json'),'utf8'));
  assert.equal(saved.accountId,this.sharedKey.accountId);assert.ok(saved.protectedKey);
 });
 step('I retry erasing the server copy',async function(){assert.equal(await this.call('sharedSpacesAct','retry'),true);});
 step('the erasure completes and sync turns off',async function(){
  await this.waitFor(()=>this.call('sharedSpacesView'),s=>s&&!s.eraseRetryVisible&&!s.syncEnabled,'erasure completed',30000);
  assert.equal([...this.syncServer.blobs.keys()].some(k=>k.startsWith(`blob:${this.sharedKey.accountId}:`)),false);
  assert.equal(this.syncServer.requests.filter(r=>r.method==='DELETE'&&!r.store&&r.status===204).length,1);
 });
 step('a Shared Spaces fixture with local Work and Private Spaces',async function(){
  await setup(this,false);assert.equal((await this.call('workspaceAction','create','Private')).ok,true);
 });
 step('I untick {string} and press Turn on in the selection sheet',async function(name){
  await this.waitFor(()=>this.call('sharedSpacesView'),s=>s?.open&&!s.checking,'fresh choices',30000);
  assert.equal(await this.call('sharedSpacesAct','untick',name),true);
  assert.equal(await this.call('sharedSpacesAct','share'),true);
  await this.waitFor(()=>this.call('sharedSpacesView'),s=>s&&!s.open,'sharing saved',60000);
 });
 step('the {string} Space stays on this device',async function(name){
  // Observe beyond the production auto-share debounce, as shipping does.
  await new Promise(resolve=>setTimeout(resolve,2500));
  const current=await state(this),row=current.rows.find(r=>r.name===name);assert.ok(row);
  assert.equal(row.sharedId,undefined);assert.equal(Object.values(current.shared.index.spaces).some(r=>r.name.v===name),false);
 });
 step('I choose Spaces to sync from Settings',async function(){
  assert.equal(await this.call('sharedSpacesAct','choose'),true);
  await this.waitFor(()=>this.call('sharedSpacesView'),s=>s?.open,'choose more Spaces',1000);
 });
 step('the {string} Space is listed as Shared',async function(name){
  const view=await this.waitFor(()=>this.call('sharedSpacesView'),s=>s?.choices.some(r=>r.text.includes(name)&&r.text.includes('Shared')),'Shared choice');
  const choice=view.choices.find(r=>r.text.includes(name));assert.equal(choice.checked,true);assert.equal(choice.disabled,true);
 });
 step('I press Share in the selection sheet',async function(){
  assert.equal((await this.call('sharedSpacesView')).confirmText.trim(),'Share');
  assert.equal(await this.call('sharedSpacesAct','share'),true);
  await this.waitFor(()=>this.call('sharedSpacesView'),s=>s&&!s.open,'additional Space shared',60000);
 });
 step('the next Spaces index fetch is held',function(){
  const held=new Promise(resolve=>{this.releaseIndex=resolve;});
  this.syncServer.inject({type:'hook',method:'GET',store:'spaces',before:()=>held});
 });
 step('I turn on Spaces and groups',async function(){
  await settings(this);
  this.busySeen=readSettings(this,(_a,d)=>new Promise(resolve=>{
   const root=d.find('settings-blanc-sync-page').shadowRoot;
   const seen=()=>/Sync is busy/.test(root.textContent);if(seen())return resolve(true);
   const observer=new MutationObserver(()=>{if(seen()){observer.disconnect();resolve(true);}});
   observer.observe(root,{subtree:true,childList:true,characterData:true});
   setTimeout(()=>{observer.disconnect();resolve(false);},5000);
  }));
  this.turnedOnAt=Date.now();assert.equal(await this.call('sharedSpacesAct','turn-on'),true);
 });
 step('the selection sheet is open within a second and is checking other devices',async function(){
  const view=await this.waitFor(()=>this.call('sharedSpacesView'),s=>s?.open,'sheet opens at once',1000);
  assert.ok(Date.now()-this.turnedOnAt<1500);assert.equal(view.checking,true);
  assert.match(view.checkingText,/Checking your other devices/);
 });
 step('Settings never says Sync is busy',async function(){assert.equal(await this.busySeen,false);});
 step('the held Spaces index fetch is released',function(){this.releaseIndex();});
 step('the sheet stops checking and the Work Space is still checked',async function(){
  const view=await this.waitFor(()=>this.call('sharedSpacesView'),s=>!s?.checking,'check finished',30000);
  assert.equal(view.choices.find(row=>row.text.includes('Work'))?.checked,true);
  assert.equal(await this.call('sharedSpacesAct','cancel'),true);assert.equal((await state(this)).shared.enabled,false);
 });
 step('I press Turn on in the selection sheet',async function(){
  await this.waitFor(()=>this.call('sharedSpacesView'),s=>s?.open,'selection sheet');
  assert.equal((await this.call('sharedSpacesView')).confirmText.trim(),'Turn on');
  assert.equal(await this.call('sharedSpacesAct','share'),true);
 });
 step('the Turn on button waits for the check and sharing is still off',async function(){
  const view=await this.waitFor(()=>this.call('sharedSpacesView'),s=>s?.confirmText.includes('Checking'),'checking button');
  assert.equal(view.confirmDisabled,true);assert.equal((await state(this)).shared.enabled,false);
 });
 step('I press Cancel in the selection sheet',async function(){assert.equal(await this.call('sharedSpacesAct','cancel'),true);});
 step('the selection sheet is closed and Settings says the Spaces are uploading',async function(){
  const view=await this.waitFor(()=>this.call('sharedSpacesView'),s=>s&&!s.open,'selection dismissed',2000);
  assert.match(view.text,/Uploading your Spaces/);assert.equal(view.toggle,true);
 });
 step('the {string} Space is shared once and Spaces sync is on',async function(name){
  await this.waitFor(()=>state(this),s=>s.shared.enabled&&s.rows.filter(r=>r.name===name).length===1&&
   s.rows.find(r=>r.name===name)?.sharedLink==='active'&&
   Object.values(s.shared.index.spaces).filter(r=>r.name.v===name&&!r.deleted.v).length===1,name+' shared once',30000);
  if(this.sharedSettingsOpened)assert.equal((await this.call('sharedSpacesView')).toggle,true);
 });
 step('I make a new Space {string}',async function(name){assert.equal((await this.call('workspaceAction','create',name)).ok,true);});
 step('I open the Shared Spaces selection sheet',async function(){
  await settings(this);assert.equal(await this.call('sharedSpacesAct','choose'),true);
  await this.waitFor(()=>this.call('sharedSpacesView'),s=>s?.open,'Spaces selection sheet',120000);
 });
 step('the Work Space is checked with its tab count',async function(){
  const view=await this.call('sharedSpacesView'),choice=view.choices.find(row=>row.text.includes('Work'));
  assert.ok(choice);assert.equal(choice.checked,true);assert.ok(choice.text.includes(this.expectedSharedTabCount+' tabs'));
 });
 step('cancelling the sheet leaves sharing off',async function(){
  assert.equal(await this.call('sharedSpacesAct','cancel'),true);assert.equal((await state(this)).shared.enabled,false);
 });
 step('the Worker does not support Spaces',async function(){this.syncServer.inject({type:'unknown-store',spacesOnly:true,times:100});});
 step('the sheet reports Spaces unavailable and Favorites still sync',async function(){
  await settings(this);assert.equal(await this.call('sharedSpacesAct','choose'),true);
  await this.waitFor(()=>this.call('sharedSpacesView'),s=>s?.text.includes('Spaces sync is unavailable'),'Spaces unavailable',120000);
  assert.equal((await state(this)).shared.enabled,false);
  assert.equal((await pull(this,['bookmarks'])).ok,true);
  assert.ok(this.syncServer.requests.some(r=>r.store==='bookmarks'&&r.status===200));
 });
 step('the Shared Spaces peer driver verifies {string}',async function(name){
  await require('../lib/shared-spaces-peer.cjs').runPeerCase(name);
 });
 step('a Shared Spaces fixture with a local Work Space',async function(){await setup(this,false);});
 step('a Shared Spaces fixture with the Work Space shared',async function(){await setup(this,true);});
 step('device B adds a tab to Work',async function(){
  this.remoteUrl=this.fixtureUrl('shared-remote');
  await editPeer(this,blob=>{const id='e'.repeat(32),last=model.orderOf(blob.tabs).at(-1),f=v=>model.field(v,Date.now()+1,'device-b');
   blob.tabs[id]={nav:f({url:this.remoteUrl,title:'Remote'}),name:f(''),pinned:f(false),groupId:f(null),pos:f(model.keyFor(blob.tabs[last].pos.v,'',id)),deleted:f(false)};
  });
 });
 step('the remote tab appears quiet',async function(){
  const s=await this.waitForState(s=>s.tabs.some(t=>t.url===this.remoteUrl));
  assert.equal(s.tabs.find(t=>t.url===this.remoteUrl).asleep,true);
 });
 step('device B navigates the active Work tab',async function(){
  this.oldUrl=this.fixtureUrl('shared-second');
  await editPeer(this,blob=>{const id=Object.keys(blob.tabs).find(id=>blob.tabs[id].nav.v.url===this.oldUrl);assert.ok(id);this.navigated=id;
   blob.tabs[id].nav=model.field({url:this.fixtureUrl('remote-navigation'),title:'Remote navigation'},Date.now()+1,'device-b');
  });
 });
 step('the active tab keeps its displayed address without republishing it',async function(){
  assert.equal((await this.state()).tabs.find(t=>t.id===this.secondTab).url,this.oldUrl);
  // Native captures on changes; a subsequent real pass must preserve the
  // held remote address instead of republishing the displayed local address.
  await pull(this,['space-'+this.sid]);const current=await state(this);
  assert.equal(current.shared.blobs[this.sid].blob.tabs[this.navigated].nav.v.url,this.fixtureUrl('remote-navigation'));
  assert.equal(current.shared.pending[this.sid]?.tabs?.[this.navigated]?.nav,undefined);
 });
 step('the shared tab navigates to an internal page',async function(){
  const current=await state(this);this.sid=Object.keys(current.shared.blobs)[0];
  const blob=current.shared.blobs[this.sid].blob;
  this.retainedRecord=Object.keys(blob.tabs).find(id=>blob.tabs[id].nav.v.url===this.fixtureUrl('shared-second'));
  assert.ok(this.retainedRecord);this.retainedNav=blob.tabs[this.retainedRecord].nav.v;
  await this.call('navigateTab',this.secondTab,'blanc://mahjong/');
  await this.waitForState(s=>s.tabs.some(t=>t.id===this.secondTab&&t.url.startsWith('blanc://mahjong/')));
 });
 step('device B still sees its last shareable web page',async function(){
  await pull(this,['space-'+this.sid]);await syncRoom(this);
  const response=await fetch(`${this.syncServer.url}/v1/blob/${this.sharedKey.accountId}/space-${this.sid}`);assert.equal(response.status,200);
  const stored=await response.json(),record=JSON.parse(decrypt(this.sharedKey.key,stored.blob)).tabs[this.retainedRecord];
  assert.equal(record.deleted.v,false);assert.deepEqual(record.nav.v,this.retainedNav);
 });
}
