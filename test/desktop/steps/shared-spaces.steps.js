'use strict';
const assert=require('node:assert/strict');
const {Before,After,Given,When,Then}=require('@cucumber/cucumber');
const {createSyncFixture}=require('../support/sync-fixture');
const {deriveKeys,encrypt,decrypt}=require('../../../src/main/sync-crypto');
const model=require('../../../src/main/shared-spaces-model');
const ctx=require('../support/context');
const {waitForValue}=require('../support/poll');
const handle='Shared Spaces acceptance',passphrase='correct horse battery staple Shared Spaces';
Before({tags:'@F57',timeout:180000},async function(){
 this.sharedFixture=await createSyncFixture();await ctx.relaunch({BLANC_TEST_SYNC_ENDPOINT:this.sharedFixture.url});
 await this.call('reset');
 this.sharedKey=deriveKeys(handle,passphrase);
});
After({tags:'@F57',timeout:180000},async function(scenario){
 if(scenario.result?.message)process.stderr.write(scenario.result.message+'\n');
 try{await this.call('sharedSpacesTest','disable');await ctx.relaunch();}finally{await this.sharedFixture?.close();this.sharedKey?.key.fill(0);}
});
async function setup(world,shared){
 world.firstTab=await world.call('openTab',world.fixtureUrl('shared-first'));
 world.secondTab=await world.call('openTab',world.fixtureUrl('shared-second'));
 await world.waitForState(s=>s.tabs.filter(t=>[world.firstTab,world.secondTab].includes(t.id)).every(t=>!t.isLoading));
 const saved=await world.call('workspaceAction','save','Work');assert.equal(saved.ok,true);
 const listing=await world.call('workspaceAction','list'),workspace=listing.items.find(row=>row.name==='Work');
 world.expectedSharedTabCount=(await world.call('workspaceAction','saved-urls',workspace.id)).filter(url=>/^https?:/.test(url)).length;
 await world.call('sharedSpacesTest','enable',{handle,passphrase});
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
