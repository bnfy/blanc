import assert from 'node:assert/strict';
import {tabPage} from '../adapters/core.mjs';
// Observe from before the move through a settled frame after pointer delivery.
// CDP can acknowledge the input after the entire native reveal on arm64.
export async function observeLinuxGlanceSlide(read,reveal) {
 const seen=new Set();
 let slid=false;
 async function sample() {
  const {state,card,page}=await read();
  assert.ok(card?.width && page?.width,'visible Glance card and native page');
  seen.add(JSON.stringify({card,page}));
  slid ||= state.sliding;
  return state;
 }
 const start=await sample();
 assert.equal(start.revealed,false,'pushed Island is covered before pointer input');
 let delivering=true;
 async function watchDelivery() {
  while (delivering) await sample();
 }
 async function deliver() {
  try { await reveal(); } finally { delivering=false; }
 }
 await Promise.all([watchDelivery(),deliver()]);
 const until=Date.now()+5000;
 do {
  const final=await sample();
  if (final.revealed && !final.sliding) return {seen,slid,final};
 } while (Date.now()<until);
 throw Error('Timed out waiting for the pushed Island to finish revealing');
}

async function watchLinuxGlance() {
 await this.waitFor(()=>this.call('focusWindow'),Boolean,'the window to receive the pointer');
 const bounds=await this.call('windowContentBounds');
 const {activeTabId}=await this.state();
 const read=()=>this.hostEval(`(async () => {
  await new Promise(resolve => requestAnimationFrame(resolve));
  const [state,snap]=await Promise.all([window.__blancNativeCall('autoHideState'),window.__blancNativeCall('snapshot')]);
  const dy=snap.glanceArea?.islandY ?? snap.splitGeometry?.islandY ?? 0;
  const inWindow=r=>r && ({x:r.x,y:r.y+dy,width:r.width,height:r.height});
  const card=document.getElementById('glanceCardFrame').getBoundingClientRect();
  const page=snap.tabs.find(t=>t.id===snap.glanceTabId)?.viewBounds;
  return {state,card:inWindow(card),page:inWindow(page)};
 })()`);
 const watch=await observeLinuxGlanceSlide(read,async () => {
  assert.equal(await this.call('setTestCursorPoint',{x:bounds.x+400,y:bounds.y+2}),true);
  assert.equal(await this.call('sendMouseInput',activeTabId,{type:'mouseMove',x:400,y:2}),true);
 });
 this.glanceCardSeen=watch.seen;
 this.glanceIslandSlid=watch.slid;
 this.glanceIslandFinal=watch.final;
}
// Electron injects Escape into the overlay's WebContents. The fork sends the
// same key through CDP into the real overlay iframe. Keep busy/cancel/wake
// assertions; no mocked picker state or direct close action.
export const GLANCE_STEPS = new Map([
 ...(process.platform==='linux'?[[
  'I watch the Glance card while I point at the top edge of the window',watchLinuxGlance
 ]]:[]),
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
