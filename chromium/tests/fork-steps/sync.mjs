// Shipping Sync setup assertions over the native Settings controls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
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
  // Keep the Worker's quota; only reset the runner's test request window.
  const deadline=Date.now()+125000;
  while(this.syncServer.requests.filter(r=>r.method==='GET'&&Date.now()-r.at<61000).length>=18){
   assert.ok(Date.now()<deadline,'Worker read budget available');
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  await nativeCall(this.fixture.host,'desktopSyncCall',['sync.resetRequestWindowForTest'],null,120000);
  await nativeCall(this.fixture.host,'desktopSyncCall',['sync.syncNow'],null,120000);
 });
 step('the sheet says {string}',async function(text){
  await card(this,v=>v.joinedTitle===text,'joined device named',30000);
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
