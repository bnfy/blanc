// Shipping Sync setup assertions over the native Settings controls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ensureSyncPeer,freeRequestRoom,seedRemoteDevices,syncPump} from '../lib/sync-fixture.mjs';
import {inSettings} from '../adapters/commands.mjs';
import {nativeCall} from '../lib/test-driver.mjs';
const require=createRequire(import.meta.url);

// Start the actual local Worker before the fresh case browser launches. No
// account action, including startup, can use production in a @sync-server case.
export async function prepareSyncFixture(world){
 const {createSyncFixture}=require('../../../test/desktop/support/sync-fixture.js');
 world.syncServer=await createSyncFixture();
 const endpoint=new URL(world.syncServer.url);
 assert.equal(endpoint.hostname,'127.0.0.1');
 world.fixture.extraArgs=[...(world.fixture.extraArgs??[]).filter(a=>!a.startsWith('--blanc-sync-endpoint=')),
  `--blanc-sync-endpoint=${endpoint.origin}`];
}

const card=(w,predicate,label,timeout=8000)=>w.waitFor(
 ()=>w.call('settingsSyncPairingDom'),v=>!!v&&predicate(v),label,timeout);
export default function register(step){
 step('sync is enabled on this device',async function(){await ensureSyncPeer(this);});
 step('the "share this device\'s open tabs" setting is off',async function(){
  await this.api('openPage',['settings','sync']);await inSettings(this,'sync',()=>({value:true}));
  assert.equal((await card(this,v=>v.syncOn,'Sync on')).shareTabs,false);
 });
 step('no tab snapshot for this device is published',async function(){
  await syncPump(this);assert.equal(this.syncPeer.sync.listRemoteDevices().length,0);
 });
 step('a synced device {string} with {int} shared tabs',async function(name,count){
  await seedRemoteDevices(this,1,name,count);this.remoteName=name;
 });
 step('I open the palette, open Other devices and unfold {string}',async function(name){
  await this.call('openPanel');const page=this.frame('overlay');
  await page.locator('#footerDevices').click();
  await page.locator('#islandDrawer [data-device-id]').filter({hasText:name}).click();
 });
 step('I choose its first remote tab',async function(){
  this.beforeRemoteOpen=(await this.snapshot()).tabs.map(t=>t.id);
  this.chosenRemote=(await this.api('listRemoteTabs'))[0].tabs[0].url;
  await this.frame('overlay').locator('#islandDrawer .island-row').first().click();
 });
 step('it opens as a new ungrouped local tab',async function(){
  const state=await this.waitFor(()=>this.snapshot(),v=>v.tabs.some(t=>!this.beforeRemoteOpen.includes(t.id)&&t.url===this.chosenRemote),'new remote tab');
  const tab=state.tabs.find(t=>!this.beforeRemoteOpen.includes(t.id)&&t.url===this.chosenRemote);
  assert.equal(tab.groupId,null);assert.equal(tab.private,false);
 });
 step('sharing open tabs is on and synced',async function(){
  await ensureSyncPeer(this);this.sharedTabUrl=this.fixtureUrl('shared-tab');await this.call('openTab',this.sharedTabUrl,{});
  await this.api('openPage',['settings','sync']);await inSettings(this,'sync',()=>({value:true}));
  await this.waitFor(()=>this.call('settingsSyncPairingAct','share-tabs-on'),v=>v===true,'sharing control ready');
  await card(this,v=>v.shareTabs,'sharing switched on');
  await this.waitFor(async()=>{await syncPump(this);return this.syncPeer.sync.listRemoteDevices();},v=>v.some(d=>d.tabs.some(t=>t.url===this.sharedTabUrl)),'shared tab uploaded',180000);
 });
 step('I turn sharing off',async function(){assert.equal(await this.call('settingsSyncPairingAct','share-tabs-off'),true);});
 step('other devices no longer list this device',async function(){
  await this.waitFor(async()=>{await syncPump(this);return this.syncPeer.sync.listRemoteDevices();},v=>!v.some(d=>d.tabs.some(t=>t.url===this.sharedTabUrl)),'snapshot retracted',180000);
 });

 step('the Sync card offers Add this device to my sync before Start syncing from this device',async function(){
  const dom=await card(this,v=>v.turnOnVisible,'Sync setup choices');
  assert.equal(dom.pathOrder[0],'syncPathCode');
  assert.ok(dom.pathOrder.indexOf('syncPathCode')<dom.pathOrder.indexOf('syncPathStart'));
 });
 step('I choose Add this device to my sync',async function(){
  assert.equal(await this.call('settingsSyncPairingAct','choose-code'),true);
 });
 step('the code field replaces the name and passphrase fields',async function(){
  await card(this,v=>v.codeFormVisible&&!v.nameFormVisible&&!v.pathsVisible,'the code form');
 });
 step('I type {string} into the code field',async function(text){
  assert.equal(await this.call('settingsSyncPairingAct','type-code',text),true);
 });
 step('Connect is disabled',async function(){
  const dom=await card(this,v=>v.connectDisabled,'Connect disabled');
  assert.equal(dom.error,'That doesn’t look like a code. Check it and try again.');
 });
 step('Connect is enabled',async function(){
  const dom=await card(this,v=>!v.connectDisabled,'Connect enabled');
  assert.equal(dom.error,'');
 });
 step('I choose Use my sync name and passphrase instead',async function(){
  assert.equal(await this.call('settingsSyncPairingAct','use-passphrase'),true);
 });
 step('the name and passphrase fields replace the code field',async function(){
  await card(this,v=>v.nameFormVisible&&!v.codeFormVisible,'the name and passphrase form');
 });
 step('the Sync card leads with Turn on Sync and keeps the passphrase paths under Other ways',async function(){
  const dom=await card(this,v=>v.turnOnVisible,'Turn on Sync');
  assert.equal(dom.firstPath,'syncTurnOn');
  assert.deepEqual(dom.otherWays,['syncPathJoin','syncPathStart']);
  assert.equal(dom.otherWaysClosed,true);
  assert.equal(dom.nameFormVisible,false);
  assert.equal(dom.codeFormVisible,false);
 });
 step('I choose Turn on Sync',async function(){
  // Fail closed if the tagged setup hook was omitted. Never test account
  // creation against the production endpoint.
  assert.ok(this.syncServer,'Turn on Sync requires the local Worker fixture');
  assert.ok(this.fixture.extraArgs.includes(`--blanc-sync-endpoint=${this.syncServer.url}`));
  assert.equal(await this.call('settingsSyncPairingAct','turn-on'),true);
 });
 step('Sync is on under the name {string}',async function(name){
  await card(this,v=>v.syncOn&&v.handle===name,`Sync on as ${name}`,60000);
  await this.waitFor(()=>this.syncServer.requests,
   requests=>requests.some(r=>r.method==='PUT'&&r.status>=200&&r.status<300),
   'an encrypted upload accepted by the actual local Worker',60000);
 });
 step('the recovery-code prompt is shown',async function(){
  await card(this,v=>v.recoveryPromptVisible,'the recovery-code reminder');
 });
 step('I choose Add device',async function(){
  assert.equal(await this.call('settingsSyncPairingAct','add-device'),true);
 });
 step('the sheet shows a pairing code',async function(){
  await card(this,v=>v.sheetCodeValid&&v.sheetOpen,'a pairing code displayed',30000);
 });
 step('a new device named {string} joins the sync',async function(name){
  assert.ok(this.syncServer,'Pairing requires the local Worker');
  const {peer}=require('../android/support/sync-peer.cjs');
  this.syncPeer=peer(name,this.syncServer.url);
  const code=await this.call('settingsSyncPairingCode');
  assert.equal((await this.syncPeer.sync.joinWithCode(code)).ok,true,'independent peer joined');
  await this.syncPeer.pass();
  // Shipping's fixture injects an already-received session entry. Deliver
  // this real peer's entry through the Worker before the unchanged UI step.
  freeRequestRoom(this.syncServer);
  await nativeCall(this.fixture.host,'desktopSyncCall',['sync.resetRequestWindowForTest'],null,120000);
  await nativeCall(this.fixture.host,'desktopSyncCall',['sync.syncNow'],null,120000);
 });
 step('the sheet says {string}',async function(text){
  await card(this,v=>v.joinedTitle===text,'joined device named',30000);
 });
 step('the sheet asks to keep Spaces and groups in sync',async function(){
  const view=await card(this,v=>v.spacesQuestion,'Spaces question',30000);
  assert.match(view.spacesQuestionText,/Keep Spaces and groups in sync/);
 });
 step('I choose Not now in the sheet',async function(){
  assert.equal(await this.call('settingsSyncPairingAct','spaces-not-now'),true);
 });
 step('the sheet no longer asks and offers Done',async function(){
  await card(this,v=>!v.spacesQuestion&&v.pairDone,'Spaces answer retained and Done offered');
 });
 step('the window asks to be left out of screen capture',async function(){
  await this.waitFor(()=>this.call('windowsContentProtected'),n=>n===1,'one protected window');
 });
 step('no window asks to be left out of screen capture',async function(){
  await this.waitFor(()=>this.call('windowsContentProtected'),n=>n===0,'no protected window');
 });
 step('I choose Connect your iPhone',async function(){
  await card(this,v=>v.connectIphoneVisible,'Connect your iPhone');
  assert.equal(await this.call('settingsSyncPairingAct','connect-iphone'),true);
 });
 step('the sheet offers to turn on Sync for this computer',async function(){
  const view=await card(this,v=>v.startShown,'iPhone setup confirmation',30000);
  assert.equal(view.sheetTitle,'Connect your iPhone');
  assert.equal(view.sheetVisible,true);
  assert.equal(view.syncOn,false);
 });
 step('I choose to add this computer with a code first',async function(){
  assert.equal(await this.call('settingsSyncPairingAct','add-this-first'),true);
 });
 step('Sync is still off',async function(){
  await card(this,v=>!v.syncOn&&!v.sheetOpen,'Sync remains off');
 });
 step('I choose Continue in the sheet',async function(){
  assert.ok(this.syncServer,'Continue requires the local Worker');
  assert.equal(await this.call('settingsSyncPairingAct','continue'),true);
 });
 step("the sheet's QR encodes the pair link for that code",async function(){
  assert.equal(await this.call('settingsSyncQrMatches'),true,'QR matches shipping pair-link encoding');
 });

}
