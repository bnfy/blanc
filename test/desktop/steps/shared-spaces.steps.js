'use strict';
const assert=require('node:assert/strict');
const {Before,After,Given,When,Then}=require('@cucumber/cucumber');
const {createSyncFixture}=require('../support/sync-fixture');
const {deriveKeys,encrypt,decrypt}=require('../../../src/main/sync-crypto');
const model=require('../../../src/main/shared-spaces-model');
const ctx=require('../support/context');
const {waitForValue}=require('../support/poll');
const {callTestHook}=require('../support/test-hook-call');
const handle='Shared Spaces acceptance',passphrase='correct horse battery staple Shared Spaces';
Before({tags:'@F57 and not @peer-driver',timeout:180000},async function(){
 this.sharedFixture=await createSyncFixture();await ctx.relaunch({BLANC_TEST_SYNC_ENDPOINT:this.sharedFixture.url},{freshProfile:true});
 if(process.platform==='linux'){
  const storage=await ctx.app.evaluate(({safeStorage})=>({available:safeStorage.isEncryptionAvailable(),backend:safeStorage.getSelectedStorageBackend()}));
  assert.equal(storage.available,true,`Shared Spaces requires secure OS storage (${storage.backend})`);
  assert.equal(storage.backend,'gnome_libsecret','Shared Spaces Linux acceptance must use the real GNOME keyring');
 }
 await this.call('reset');
 this.sharedKey=deriveKeys(handle,passphrase);
});
After({tags:'@F57 and not @peer-driver',timeout:180000},async function(scenario){
 if(scenario.result?.message)process.stderr.write(scenario.result.message+'\n');
 // The relaunch back to the main profile runs even when the app died during
 // the scenario and disable throws; otherwise later scenarios would be healed
 // onto this temporary profile, with a sync endpoint that is about to close.
 try{if(this.sharedPeer){await callTestHook(this.sharedPeer,'sharedSpacesTest',['disable']);await ctx.closePeerApp(this.sharedPeer);}await this.call('sharedSpacesTest','disable');}
 finally{try{await ctx.relaunch();}finally{await this.sharedFixture?.close();this.sharedKey?.key.fill(0);}}
});
async function setup(world,shared,{beforeSave=null}={}){
 world.firstTab=await world.call('openTab',world.fixtureUrl('shared-first'));
 world.secondTab=await world.call('openTab',world.fixtureUrl('shared-second'));
 await world.waitForState(s=>s.tabs.filter(t=>[world.firstTab,world.secondTab].includes(t.id)).every(t=>!t.isLoading));
 if(beforeSave)await beforeSave();
 const saved=await world.call('workspaceAction','save','Work');assert.equal(saved.ok,true);
 const listing=await world.call('workspaceAction','list'),workspace=listing.items.find(row=>row.name==='Work');
 world.expectedSharedTabCount=(await world.call('workspaceAction','saved-urls',workspace.id)).filter(url=>/^https?:/.test(url)).length;
 const enabled=await world.call('sharedSpacesTest','enable',{handle,passphrase});
 assert.equal(enabled.ok,true,`Shared Spaces fixture could not enable sync: ${enabled.error || 'unknown error'}`);
 if(shared){const state=await world.call('sharedSpacesTest','state');const row=state.workspaces.items.find(w=>w.name==='Work');assert.equal((await world.call('sharedSpacesTest','apply',{enabled:true,selections:[{id:row.id,mode:'copy'}]})).ok,true);}
}
Given('a Shared Spaces fixture with a local Work Space',{timeout:180000},async function(){await setup(this,false);});
Given('a Shared Spaces fixture with the Work Space shared',{timeout:180000},async function(){await setup(this,true);});
async function settingsPage(world){
 await world.call('openTab','blanc://settings/#group-sync');
 return waitForValue(async()=>{const pages=ctx.app.windows();return pages.find(p=>p.url().startsWith('blanc://settings'));},Boolean,'Settings page');
}
When('I open the Shared Spaces selection sheet',{timeout:180000},async function(){
 this.sharedPage=await settingsPage(this);await this.sharedPage.locator('#sharedSpacesToggle').check();await this.sharedPage.locator('.shared-spaces-dialog').waitFor({state:'visible',timeout:120000});
 if(process.env.BLANC_SHARED_SPACES_EVIDENCE_DIR){const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(process.env.BLANC_SHARED_SPACES_EVIDENCE_DIR,{recursive:true});await this.sharedPage.screenshot({path:path.join(process.env.BLANC_SHARED_SPACES_EVIDENCE_DIR,'selection-sheet.png')});}
});
Then('the Work Space is checked with its tab count',async function(){
 const choice=this.sharedPage.locator('.shared-spaces-choice').filter({hasText:'Work'});assert.equal(await choice.locator('input').isChecked(),true);assert.ok((await choice.textContent()).includes(this.expectedSharedTabCount+' tabs'));
});
Then('cancelling the sheet leaves sharing off',async function(){
 await this.sharedPage.locator('.shared-spaces-dialog button').filter({hasText:'Cancel'}).click();assert.equal((await this.call('sharedSpacesTest','state')).shared.enabled,false);
});
async function editPeer(world,edit){
 const state=await world.call('sharedSpacesTest','state'),sid=Object.keys(state.shared.blobs)[0];world.sid=sid;
 const response=await fetch(`${world.sharedFixture.url}/v1/blob/${world.sharedKey.accountId}/space-${sid}`);assert.equal(response.status,200);
 const stored=await response.json(),blob=JSON.parse(decrypt(world.sharedKey.key,stored.blob));world.beforePeer=structuredClone(blob);edit(blob);
 if(world.closedRecord){
  const now=Date.now(),closed={devices:{'device-b':{name:'B',platform:'linux',updatedAt:now,items:[{id:world.closedRecord,url:world.beforePeer.tabs[world.closedRecord].nav.v.url,title:'shared-first',closedAt:now,spaceId:sid}]}}};
  const previous=await fetch(`${world.sharedFixture.url}/v1/blob/${world.sharedKey.accountId}/closed`),saved=previous.status===200?await previous.json():null;
  const putClosed=await fetch(`${world.sharedFixture.url}/v1/blob/${world.sharedKey.accountId}/closed`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ifVersion:saved?.version??null,blob:encrypt(world.sharedKey.key,JSON.stringify(closed))})});assert.equal(putClosed.status,200);
  await world.call('sharedSpacesTest','pull',['closed']);
 }
 const put=await fetch(`${world.sharedFixture.url}/v1/blob/${world.sharedKey.accountId}/space-${sid}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ifVersion:stored.version,blob:encrypt(world.sharedKey.key,JSON.stringify(blob))})});assert.equal(put.status,200);
 await world.call('sharedSpacesTest','pull',['space-'+sid]);
}
When('device B adds a tab to Work',{timeout:180000},async function(){
 this.remoteUrl=this.fixtureUrl('shared-remote');await editPeer(this,blob=>{const id='e'.repeat(32),last=model.orderOf(blob.tabs).at(-1);const f=v=>model.field(v,Date.now()+1,'device-b');blob.tabs[id]={nav:f({url:this.remoteUrl,title:'Remote'}),name:f(''),pinned:f(false),groupId:f(null),pos:f(model.keyFor(blob.tabs[last].pos.v,'',id)),deleted:f(false)};});
});
Then('the remote tab appears quiet',async function(){const state=await this.waitForState(s=>s.tabs.some(t=>t.url===this.remoteUrl));const tab=state.tabs.find(t=>t.url===this.remoteUrl);assert.equal(tab.asleep,true);});
When('device B closes the background Work tab',{timeout:180000},async function(){
 await this.call('sharedSpacesTest','resetRequestWindow');
 await editPeer(this,blob=>{const id=Object.keys(blob.tabs).find(id=>blob.tabs[id].nav.v.url===this.fixtureUrl('shared-first'));assert.ok(id);this.closedRecord=id;blob.tabs[id].deleted=model.field(true,Date.now()+1,'device-b');});
});
Then('its parked page appears once in Recently closed',async function(){
 const state=await this.call('sharedSpacesTest','state');assert.equal(state.closed.filter(row=>row.title.includes('shared-first')).length,1);assert.equal(state.closed.find(row=>row.title.includes('shared-first')).fromName,'B');assert.equal(state.parked.find(row=>row.sharedTabId===this.closedRecord)?.held,true);
 assert.equal((await this.state()).tabs.some(t=>t.id===this.firstTab),false);
});
When('device B navigates the active Work tab',{timeout:180000},async function(){
 this.oldUrl=this.fixtureUrl('shared-second');await editPeer(this,blob=>{const id=Object.keys(blob.tabs).find(id=>blob.tabs[id].nav.v.url===this.fixtureUrl('shared-second'));assert.ok(id);this.navigated=id;blob.tabs[id].nav=model.field({url:this.fixtureUrl('remote-navigation'),title:'Remote navigation'},Date.now()+1,'device-b');});
});
Then('the active tab keeps its displayed address without republishing it',async function(){
 assert.equal((await this.state()).tabs.find(t=>t.id===this.secondTab).url,this.oldUrl);
 await this.call('sharedSpacesTest','capture');const state=await this.call('sharedSpacesTest','state');assert.equal(state.shared.blobs[this.sid].blob.tabs[this.navigated].nav.v.url,this.fixtureUrl('remote-navigation'));
 assert.equal(state.shared.pending[this.sid]?.tabs?.[this.navigated]?.nav,undefined);
});
When('the Worker does not support Spaces',async function(){this.sharedFixture.inject({type:'unknown-store',spacesOnly:true,times:100});});
Then('the sheet reports Spaces unavailable and Favorites still sync',{timeout:180000},async function(){
 this.sharedPage=await settingsPage(this);await this.sharedPage.locator('#sharedSpacesToggle').click();
 await waitForValue(()=>this.sharedPage.locator('#sharedSpacesControl').textContent(),text=>text.includes('Spaces sync is unavailable'),'unavailable notice',120000);
 assert.equal(await this.sharedPage.locator('#sharedSpacesToggle').isChecked(),false);
 const result=await this.call('sharedSpacesTest','pull',['bookmarks']);assert.equal(result.ok,true);assert.ok(this.sharedFixture.requests.some(r=>r.store==='bookmarks'&&r.status===200));
});
When('the shared tab navigates to an internal page',{timeout:180000},async function(){
 const state=await this.call('sharedSpacesTest','state'),sid=Object.keys(state.shared.blobs)[0];this.sid=sid;
 const blob=state.shared.blobs[sid].blob;this.retainedRecord=Object.keys(blob.tabs).find(id=>blob.tabs[id].nav.v.url===this.fixtureUrl('shared-second'));
 assert.ok(this.retainedRecord);this.retainedNav=blob.tabs[this.retainedRecord].nav.v;
 await this.call('navigateTab',this.secondTab,'blanc://mahjong/');
 await this.waitForState(s=>s.tabs.some(t=>t.id===this.secondTab&&t.url.startsWith('blanc://mahjong/')));
 await this.call('sharedSpacesTest','capture');
});
Then('device B still sees its last shareable web page',{timeout:180000},async function(){
 await this.call('sharedSpacesTest','pull',['space-'+this.sid]);
 const response=await fetch(`${this.sharedFixture.url}/v1/blob/${this.sharedKey.accountId}/space-${this.sid}`);assert.equal(response.status,200);
 const stored=await response.json(),blob=JSON.parse(decrypt(this.sharedKey.key,stored.blob)),record=blob.tabs[this.retainedRecord];
 assert.equal(record.deleted.v,false);assert.deepEqual(record.nav.v,this.retainedNav);
});
When('the account storage is full and I delete Work',{timeout:180000},async function(){
 const state=await this.call('sharedSpacesTest','state');this.sid=Object.keys(state.shared.blobs)[0];
 const usage=(await this.sharedFixture.quotaUsage(this.sharedKey.accountId)).bytes;
 this.sharedFixture.env.ACCOUNT_STORAGE_QUOTA_BYTES=String(usage);
 this.quotaProbe=()=>fetch(`${this.sharedFixture.url}/v1/blob/${this.sharedKey.accountId}/space-${'d'.repeat(32)}`,{method:'PUT',body:JSON.stringify({ifVersion:null,blob:encrypt(this.sharedKey.key,JSON.stringify({probe:'x'.repeat(100)}))})});
 const refused=await this.quotaProbe();assert.equal(refused.status,507);assert.deepEqual(await refused.json(),{error:'account-quota'});
 const local=state.workspaces.items.find(row=>row.name==='Work');assert.ok(local);
 assert.equal((await this.call('workspaceAction','remove',local.id)).ok,true);
 await this.call('sharedSpacesTest','pull',['space-'+this.sid]);
});
Then('the next encrypted write succeeds without waiting for retention expiry',{timeout:180000},async function(){
 const saved=this.sharedFixture.blobs.get(`blob:${this.sharedKey.accountId}:space-${this.sid}`);assert.ok(saved);
 const compact=JSON.parse(decrypt(this.sharedKey.key,JSON.parse(saved).blob));assert.deepEqual(compact.tabs,{});assert.deepEqual(compact.groups,{});
 assert.equal((await this.quotaProbe()).status,200);
 const state=await this.call('sharedSpacesTest','state');assert.equal(state.shared.index.spaces[this.sid].deleted.v,true);
});
Given('a second complete desktop client sharing Work',{timeout:300000},async function(){
 const endpoint=await this.sharedFixture.clientEndpoint('B');
 this.sharedPeer=await ctx.launchPeerApp({BLANC_TEST_SYNC_ENDPOINT:endpoint});
 this.peerCall=(method,...args)=>callTestHook(this.sharedPeer,method,args);
 await this.peerCall('reset');assert.equal((await this.peerCall('sharedSpacesTest','enable',{handle,passphrase})).ok,true);
 assert.equal((await this.peerCall('sharedSpacesTest','apply',{enabled:true,selections:[]})).ok,true);
 await this.peerCall('sharedSpacesTest','pull');
 const state=await waitForValue(()=>this.peerCall('sharedSpacesTest','state'),s=>s.workspaces.items.some(w=>w.name==='Work'),'peer Work import',15000);
 const work=state.workspaces.items.find(w=>w.name==='Work');assert.equal((await this.peerCall('workspaceAction','open',work.id)).ok,true);
 this.sid=Object.keys(state.shared.blobs)[0];
});
Then('both complete clients exchange quiet tabs in both directions',{timeout:600000},async function(){
 const a=this.call.bind(this),b=this.peerCall;
 this.fromA=this.fixtureUrl('two-client-a');this.fromB=this.fixtureUrl('two-client-b');
 // After joining, use ordinary autosave and scheduled synchronization only.
 // Explicit capture/pull hooks here would hide broken automatic discovery.
 this.newA=await a('openTab',this.fromA);
 let state=await waitForValue(()=>b('state'),s=>s.tabs.some(t=>t.url===this.fromA),'automatic A tab on B',300000);assert.equal(state.tabs.find(t=>t.url===this.fromA).asleep,true);
 this.newB=await b('openTab',this.fromB);
 state=await waitForValue(()=>a('state'),s=>s.tabs.some(t=>t.url===this.fromB),'automatic B tab on A',300000);assert.equal(state.tabs.find(t=>t.url===this.fromB).asleep,true);
});
Then('a complete client defers active navigation until its tab changes',{timeout:600000},async function(){
 const a=this.call.bind(this),b=this.peerCall,state=await b('state');this.peerActive=state.activeTabId;
 const active=state.tabs.find(t=>t.id===this.peerActive);assert.equal(active.url,this.fromB);
 const local=(await a('state')).tabs.find(t=>t.url===this.fromB);this.peerNavigated=this.fixtureUrl('two-client-nav');
 await a('activateTab',local.id);
 await this.waitForState(s=>s.tabs.some(t=>t.id===local.id&&!t.asleep&&!t.isLoading));
 await a('navigateTab',local.id,this.peerNavigated);
 await this.waitForState(s=>s.tabs.some(t=>t.id===local.id&&t.url===this.peerNavigated&&!t.isLoading));
 await waitForValue(()=>b('sharedSpacesTest','state'),s=>Object.values(s.shared.windows).some(w=>w.accepted.some(row=>row.op==='nav'&&row.value?.v?.url===this.peerNavigated)),'automatic deferred navigation receipt',300000);
 assert.equal((await b('state')).tabs.find(t=>t.id===this.peerActive).url,this.fromB);
 await b('openTab',this.fixtureUrl('two-client-unprotect'));
 await waitForValue(()=>b('state'),s=>s.tabs.some(t=>t.id===this.peerActive&&t.url===this.peerNavigated),'deferred navigation applied',15000);
});
Then('a complete client receives one remote close entry',{timeout:600000},async function(){
 const a=this.call.bind(this),b=this.peerCall;
 await b('openTab',this.fixtureUrl('two-client-close-unprotect'));
 await a('closeTab',this.newA);
 await waitForValue(()=>b('state'),s=>!s.tabs.some(t=>t.url===this.fromA),'automatic remote close applied',300000);
 const state=await waitForValue(()=>b('sharedSpacesTest','state'),s=>s.closed.some(row=>row.title.includes('two-client-a')),'automatic remote close band',300000);assert.equal(state.closed.filter(row=>row.title.includes('two-client-a')).length,1,JSON.stringify(state.closed));
});
Then('both complete clients rejoin dormant edits without duplicate tabs',{timeout:600000},async function(){
 const a=this.call.bind(this),b=this.peerCall;
 for(const call of [a,b])assert.equal((await call('sharedSpacesTest','apply',{enabled:false})).ok,true);
 const urls=[this.fixtureUrl('dormant-a'),this.fixtureUrl('dormant-b')];await a('openTab',urls[0]);await b('openTab',urls[1]);
 for(const call of [a,b]){const state=await call('sharedSpacesTest','state'),work=state.workspaces.items.find(w=>w.name==='Work');assert.equal((await call('sharedSpacesTest','apply',{enabled:true,selections:[{id:work.id,mode:'rejoin'}]})).ok,true);}
 for(const call of [a,b]){const state=await waitForValue(()=>call('state'),s=>urls.every(url=>s.tabs.some(t=>t.url===url)),'automatic dormant rejoin',300000);for(const url of urls)assert.equal(state.tabs.filter(t=>t.url===url).length,1);}
});
Then('the complete clients stay within their request budgets',{timeout:60000},async function(){
 const gets=this.sharedFixture.requests.filter(r=>r.method==='GET');
 for(const client of ['A','B']){const rows=gets.filter(r=>r.client===client),times=rows.map(r=>r.at);assert.ok(times.length>10,'audit the complete history across multiple windows');for(const at of times)assert.ok(times.filter(time=>time>at-60000&&time<=at).length<=10,client+' exceeded its rolling GET window: '+JSON.stringify(rows.filter(r=>r.at>at-60000&&r.at<=at).map(r=>({store:r.store,offset:r.at-at,status:r.status}))));}
 const minutes=new Map();for(const r of gets){const minute=Math.floor(r.at/60000);minutes.set(minute,(minutes.get(minute)??0)+1);}for(const count of minutes.values())assert.ok(count<=20);
 assert.equal(this.sharedFixture.requests.some(r=>r.status===429),false);
});
Then('the Shared Spaces peer driver verifies {string}',{timeout:180000},async function(name){
 await require('../support/shared-spaces-peer-cases').runPeerCase(name);
});
When('device B closes the active Work tab',{timeout:180000},async function(){
 await this.call('sharedSpacesTest','resetRequestWindow');
 this.closedActiveUrl=this.fixtureUrl('shared-second');
 await editPeer(this,blob=>{const id=Object.keys(blob.tabs).find(id=>blob.tabs[id].nav.v.url===this.closedActiveUrl);assert.ok(id);blob.tabs[id].deleted=model.field(true,Date.now()+1,'device-b');});
 const state=await this.call('sharedSpacesTest','state');assert.ok(Object.values(state.shared.windows).some(w=>w.accepted.some(row=>row.op==='close')),'remote close must be durably deferred before crashing');
});
When('the Shared Spaces client crashes and restores',{timeout:180000},async function(){await ctx.crashAndRelaunch();});
Then('cold restore applies the deferred close and resumes persistence',async function(){
 const state=await this.state();assert.equal(state.tabs.some(t=>t.url===this.closedActiveUrl),false);
 assert.equal(await this.call('startupReady'),true);
 const shared=await this.call('sharedSpacesTest','state');assert.equal(Object.values(shared.shared.windows).some(w=>w.accepted.some(row=>row.op==='close')),false);
});
Then('the merged remote tab survives the crash without a duplicate',async function(){
 const state=await this.state();assert.equal(state.tabs.filter(t=>t.url===this.remoteUrl).length,1);
 assert.equal(await this.call('startupReady'),true);
});
When('an index write fails after the new Space blob succeeds',{timeout:180000},async function(){
 this.indexFault=this.sharedFixture.inject({type:'network',method:'PUT',store:'spaces',times:Infinity});
 const state=await this.call('sharedSpacesTest','state'),row=state.workspaces.items.find(w=>w.name==='Work');
 assert.equal((await this.call('sharedSpacesTest','apply',{enabled:true,selections:[{id:row.id,mode:'copy'}]})).ok,true);
 this.sid=Object.keys((await this.call('sharedSpacesTest','state')).shared.blobs)[0];
 assert.ok(this.sharedFixture.blobs.has(`blob:${this.sharedKey.accountId}:space-${this.sid}`));
 assert.equal(this.sharedFixture.env.records.has(`blob:${this.sharedKey.accountId}:spaces`),false);
});
Then('the restored client retries the missing index entry',{timeout:300000},async function(){
 await this.call('sharedSpacesTest','resetRequestWindow');
 this.indexFault.remaining=0;
 await this.call('sharedSpacesTest','pull',['space-'+this.sid,'spaces']);
 const raw=this.sharedFixture.env.records.get(`blob:${this.sharedKey.accountId}:spaces`);assert.ok(raw);
 const index=JSON.parse(decrypt(this.sharedKey.key,JSON.parse(raw).blob));assert.ok(index.spaces[this.sid]);
 assert.ok(this.sharedFixture.blobs.has(`blob:${this.sharedKey.accountId}:space-${this.sid}`));
});

When('erasing the server copy fails once', {timeout:180000}, async function(){
 this.sharedPage=await settingsPage(this);
 const remove=this.sharedFixture.env.SYNC.delete;let fail=true;
 this.sharedFixture.env.SYNC.delete=async key=>{if(fail){fail=false;throw Error('erase failed once');}return remove(key);};
 // Turning sync off lives under More options in Settings → Sync.
 await this.sharedPage.locator('.sync-more').evaluate(details=>{details.open=true;});
 await this.sharedPage.locator('#syncWipe').check();
 await this.sharedPage.locator('#syncDisable').click();
});
Then('Settings keeps the credentials and offers an erasure retry', {timeout:180000}, async function(){
 await waitForValue(()=>this.sharedPage.locator('#syncStatusError').textContent(),text=>text.includes('server copy is still being erased'),'pending erasure message');
 assert.equal(await this.sharedPage.locator('#syncEraseRetry').isVisible(),true);
 assert.equal(await this.sharedPage.locator('#syncDisable').isVisible(),true);
 assert.equal(await this.sharedPage.locator('#syncWipe').isEnabled(),true);
 const state=await this.sharedPage.evaluate(()=>window.bowserPages.settings.syncGet());assert.equal(state.enabled,true);
});
When('I retry erasing the server copy', {timeout:180000}, async function(){
 await this.sharedPage.locator('#syncEraseRetry').click();
});
Then('the erasure completes and sync turns off', {timeout:180000}, async function(){
 await waitForValue(()=>this.sharedPage.locator('#syncEraseRetry').isVisible(),v=>!v,'erasure retry cleared');
 const state=await this.sharedPage.evaluate(()=>window.bowserPages.settings.syncGet());assert.equal(state.enabled,false);
 assert.equal([...this.sharedFixture.blobs.keys()].some(k=>k.startsWith(`blob:${this.sharedKey.accountId}:`)),false);
 assert.equal(this.sharedFixture.requests.filter(r=>r.method==='DELETE'&&!r.store&&r.status===204).length,1);
});
Given('the background Work tab has unsaved input',{timeout:60000},async function(){
 assert.notEqual((await this.state()).activeTabId,this.firstTab,'the first Work tab is in the background');
 await this.call('workspacePageScript',this.firstTab,"(()=>{const i=document.createElement('input');i.id='draft';document.body.append(i);i.value='typed draft';return true;})()");
});
When('device B navigates the background Work tab',{timeout:180000},async function(){
 this.backgroundUrl=this.fixtureUrl('shared-first');
 await editPeer(this,blob=>{const id=Object.keys(blob.tabs).find(id=>blob.tabs[id].nav.v.url===this.backgroundUrl);assert.ok(id);this.navigated=id;blob.tabs[id].nav=model.field({url:this.fixtureUrl('remote-navigation'),title:'Remote navigation'},Date.now()+1,'device-b');});
});
Then('the background tab keeps its page and its input',{timeout:60000},async function(){
 const tab=(await this.state()).tabs.find(t=>t.id===this.firstTab);assert.equal(tab.url,this.backgroundUrl);
 assert.equal(await this.call('workspacePageScript',this.firstTab,"document.getElementById('draft')?.value"),'typed draft');
});
When('its input is cleared and Shared Spaces applies again',{timeout:180000},async function(){
 await this.call('workspacePageScript',this.firstTab,"document.getElementById('draft').remove()");
 // A tab switch is one of the passes that retries deferred rows; switching
 // back leaves the first tab in the background again, now with nothing unsaved.
 const active=(await this.state()).activeTabId;
 await this.call('activateTab',this.firstTab);await this.waitForState(s=>s.activeTabId===this.firstTab);
 await this.call('activateTab',active);await this.waitForState(s=>s.activeTabId===active);
});
Then('the background tab follows the remote navigation',{timeout:60000},async function(){
 await this.waitForState(s=>s.tabs.some(t=>t.id===this.firstTab&&t.url===this.fixtureUrl('remote-navigation')),{timeout:30000});
});
// Gate D B1: a quit while a change is held must close no tab. Like Gate D's
// iana.org, the background tab is loaded, untouched and alone in a group that
// existed before the Space was shared.
Given('a Shared Spaces fixture whose shared Work Space has a tab alone in a group',{timeout:180000},async function(){
 await setup(this,true,{beforeSave:async()=>{
  await this.call('groupTabByName',this.firstTab,'Held');
  await this.waitForState(s=>s.tabs.some(t=>t.id===this.firstTab&&t.groupId));
 }});
 assert.notEqual((await this.state()).activeTabId,this.firstTab,'the grouped Work tab is in the background');
 const state=await this.call('sharedSpacesTest','state'),blob=Object.values(state.shared.blobs)[0].blob;
 const record=Object.values(blob.tabs).find(r=>r.nav.v.url===this.fixtureUrl('shared-first'));
 assert.ok(record?.groupId.v&&blob.groups[record.groupId.v]?.deleted.v===false,'the group is shared');
});
// An unpackaged Blanc keeps its data in "<profile>-Dev".
const sharedStoreOnDisk=profileDir=>JSON.parse(require('node:fs').readFileSync(require('node:path').join(profileDir+'-Dev','shared-spaces.json'),'utf8'));
When('the Shared Spaces client quits normally and relaunches',{timeout:180000},async function(){
 const state=await this.call('sharedSpacesTest','state');
 assert.ok(Object.values(state.shared.windows).some(w=>w.accepted.some(row=>row.op==='nav'&&row.id===this.navigated)),'the active navigation is held before the quit');
 this.deviceId=state.context.deviceId;
 await ctx.quitAndRelaunch(profileDir=>{this.storeAtQuit=sharedStoreOnDisk(profileDir);});
});
Then('the quit saved no closed Work tab and kept the held navigation',function(){
 const saved=this.storeAtQuit,blob=saved.blobs[this.sid].blob;
 const closed=Object.values(blob.tabs).filter(r=>r.deleted.v===true).map(r=>`${r.nav.v.url} (by ${r.deleted.by===this.deviceId?'this device':r.deleted.by})`);
 assert.deepEqual(closed,[],'the quit must not close a Work tab');
 assert.deepEqual(Object.entries(saved.pending[this.sid]?.tabs??{}).filter(([,edit])=>edit.deleted).map(([id])=>id),[],'no close is queued to send');
 assert.equal(Object.values(blob.groups).some(g=>g.deleted.v===true),false,'the group stays');
 assert.ok(Object.values(saved.windows).some(w=>w.spaceId===this.sid&&w.accepted.some(row=>row.op==='nav'&&row.id===this.navigated)),'the held navigation is still saved for the next launch');
});
Then('the relaunched client applies the held navigation and keeps every Work tab',{timeout:180000},async function(){
 const remote=this.fixtureUrl('remote-navigation');
 const state=await this.waitForState(s=>s.tabs.some(t=>t.url===remote),{timeout:30000});
 const first=state.tabs.filter(t=>t.url===this.fixtureUrl('shared-first'));
 assert.equal(first.length,1,'the grouped Work tab is still open');assert.ok(first[0].groupId,'and still grouped');
 assert.equal(state.tabs.filter(t=>t.url===remote).length,1);
 assert.equal(state.tabs.some(t=>t.url===this.oldUrl),false,'the held navigation replaced the old page');
 const shared=await this.call('sharedSpacesTest','state');
 assert.equal(Object.values(shared.shared.windows).some(w=>w.accepted.length),false,'nothing is still held');
 await this.call('sharedSpacesTest','pull',['space-'+this.sid]);
 const response=await fetch(`${this.sharedFixture.url}/v1/blob/${this.sharedKey.accountId}/space-${this.sid}`);assert.equal(response.status,200);
 const blob=JSON.parse(decrypt(this.sharedKey.key,(await response.json()).blob));
 assert.deepEqual(Object.values(blob.tabs).filter(r=>r.deleted.v===true).map(r=>r.nav.v.url),[],'the other device keeps every Work tab');
 assert.equal(blob.tabs[this.navigated].nav.v.url,remote);
 assert.equal(Object.values(blob.groups).some(g=>g.deleted.v===true),false,'the other device keeps the group');
});
