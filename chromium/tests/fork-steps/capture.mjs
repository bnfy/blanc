import assert from 'node:assert/strict';
import {tabPage} from '../adapters/core.mjs';
const begin=()=>{window.__captureError=null;navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{window.__captureStream=stream;},e=>{window.__captureError=e.name;});};
const live=()=>window.__captureStream?.getAudioTracks().some(t=>t.readyState==='live')??false;
export default function register(step){
 step('a tab whose site was granted microphone access',async function(){
  this.captureTabId=await this.call('openTab',this.fixtureUrl('microphone'));
  this.capturePage=await tabPage(this,this.captureTabId);
  await this.capturePage.evaluate(begin);
  await this.app.refresh();
  const prompt=await this.waitFor(()=>this.frame('permission'),Boolean,'microphone permission surface');
  await prompt.locator('#permAllowBtn').waitFor({state:'visible'});
  assert.match(await prompt.locator('#permissionText').textContent(),/microphone/i);
  await prompt.locator('#permAllowBtn').click();
  await this.waitFor(()=>this.capturePage.evaluate(live),Boolean,'granted real synthetic audio stream');
  assert.equal(await this.capturePage.evaluate(()=>navigator.permissions.query({name:'microphone'}).then(p=>p.state)),'granted');
  await this.capturePage.evaluate(()=>window.__captureStream.getTracks().forEach(t=>t.stop()));
  await this.waitFor(()=>this.snapshot(),s=>s.captureChip?.audio===false,'initial grant stream stopped');
 });
 step('the site begins capturing audio',async function(){
  await this.capturePage.evaluate(begin);
  await this.waitFor(()=>this.capturePage.evaluate(live),Boolean,'new audio stream after saved grant');
 });
 step('the island pill shows the microphone-in-use chip',async function(){
  await this.waitFor(()=>this.snapshot(),s=>s.captureChip?.audio===true,'native microphone indicator');
  await this.frame('strip').locator('#pillCapture:not([hidden])').waitFor({state:'visible'});
  assert.equal(await this.frame('strip').evaluate(()=>document.getElementById('pillCaptureMic').hasAttribute('hidden')),false);
  // Window-wide: a background capturing tab must still light the chip.
  await this.call('newTab');
  assert.equal((await this.snapshot()).captureChip.audio,true);
  await this.frame('strip').locator('#pillCapture:not([hidden])').waitFor({state:'visible'});
 });
 step('I stop capture for that site from the capture popover',async function(){
  await this.frame('strip').locator('#pillCapture').click();
  const pop=this.frame('overlay');
  await pop.locator('#capturePop').waitFor({state:'visible'});
  const rows=await this.snapshot();assert.equal(rows.capturePopover.rows.length,1);
  assert.equal(rows.capturePopover.rows[0].surfaceId,String(this.captureTabId));
  await pop.locator('.capture-pop-stop').click();
 });
 step('the microphone-in-use chip is hidden',async function(){
  await this.waitFor(()=>this.capturePage.evaluate(live),value=>value===false,'native Stop ends actual audio track');
  await this.waitFor(()=>this.snapshot(),s=>s.captureChip.audio===false,'native capture indication cleared');
  await this.frame('strip').locator('#pillCapture').waitFor({state:'hidden'});
  await this.frame('overlay').locator('#capturePop').waitFor({state:'hidden'});
 });
}
