import assert from 'node:assert/strict';
import {tabPage} from '../adapters/core.mjs';
// Electron injects Escape into the overlay's WebContents. The fork sends the
// same key through CDP into the real overlay iframe. Keep busy/cancel/wake
// assertions; no mocked picker state or direct close action.
export const GLANCE_STEPS = new Map([
 ['I press the close-tab command in the find bar',async function(){
  await this.waitFor(()=>this.call('overlayMode'),mode=>mode==='find','find capsule');
  await this.frame('overlay').locator('#findInput').waitFor();
  assert.equal(await this.native('previewPageCommand',['close']),true);
 }],
 ['I dismiss the orphaned Change picker with Escape',async function(){
  assert.equal(await this.call('focusWindow'),true,'the keyboard target window is active');
  await this.frame('glanceCardFrame').evaluate(()=>{
   window.__glanceRestoreTriggerProbe='unset';
   window.browserAPI.onIslandState(({restoreTrigger})=>{window.__glanceRestoreTriggerProbe=restoreTrigger;});
  });
  await this.call('pressOverlayKey','Escape');
  await this.waitFor(()=>this.call('overlayMode'),mode=>mode===null,'dismissed orphaned picker');
 }],
 ['I choose the slow quiet tab and cancel with Escape before it wakes', async function(){
  const page=this.frame('overlay');
  await page.fill('#glancePickerInput','reference');
  await page.locator('.glance-picker-option').first().waitFor();
  await page.press('#glancePickerInput','Enter');
  await page.locator('#glancePickerInput[aria-busy="true"]').waitFor();
  await page.keyboard.press('Escape');
  await this.waitFor(()=>this.call('overlayMode'),mode=>mode===null,'picker cancelled mid-wake');
 }],
 ['keyboard focus is not stranded on the chrome strip', async function(){
  // Shipping installs its probe on the Glance document. In the fork that is
  // an iframe distinct from the strip; read the document that owns the probe.
  const page=this.frame('glanceCardFrame');
  const trigger=await this.waitFor(()=>page.evaluate(()=>window.__glanceRestoreTriggerProbe),
   value=>value!==undefined&&value!=='unset','the dismissal island-state broadcast');
  assert.equal(trigger,null,'cancel restored focus toward a control that no longer exists');
  await this.waitFor(()=>this.snapshot(),s=>String(s.focusedTabId)===String(this.glanceMainId),'main page native focus');
  const main=await tabPage(this,this.glanceMainId);
  await this.waitFor(()=>main.evaluate(()=>document.hasFocus()),Boolean,'main page document keyboard focus');
  assert.equal(await main.evaluate(()=>document.hasFocus()),true,'main page owns keyboard focus');
 }],
]);
