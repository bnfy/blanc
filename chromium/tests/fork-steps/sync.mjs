// Shipping Sync setup assertions over the native Settings controls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
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
}
