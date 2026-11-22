import assert from 'node:assert/strict';
import {inSettings} from '../adapters/commands.mjs';
// Shipping's chrome is a full-window WebContents. The fork's strip is only
// 68px high in Island mode; in vertical mode it fills the window for the rail.
// Keep the resize and rendered-size assertions, addressing the actual views.
async function resize(width, height) {
 await this.frame('strip').bringToFront();
 await this.call('setWindowContentSize', width, height);
 await this.waitFor(() => this.call('windowContentBounds'),
  b => b?.width === width && b?.height === height, `${width}x${height} content bounds`, 7000);
 if (await this.call('tabLayout') === 'vertical') {
  await this.waitFor(() => this.frame('strip').evaluate(() => ({width: innerWidth, height: innerHeight})),
   b => b.width === width && b.height === height, `${width}x${height} rail renderer viewport`, 7000);
 }
}
// Browser.setWindowBounds can finish before Views lays out the split and
// the Island polls it. A drag uses the Island's cached page area.
export async function waitForLinuxGlanceResize(w,width,height) {
 await w.waitFor(()=>w.hostEval('window.BlancPrototypeHost.refresh().then(()=>window.BlancPrototypeHost.api.getAllTabs())'),s=>{
  if (s.glanceTabId == null) return true;
  const area=s.glanceArea??s.splitGeometry?.pageArea;
  const islandY=s.glanceArea?.islandY??s.splitGeometry?.islandY??0;
  return area?.width===width && area.y+islandY+area.height===height;
 }, 'Glance layout after resize');
}
// Opening the editor changes the popup height and moves its scroll area.
async function openLinuxSpaceEditor(name) {
 const page=this.frame('overlay');
 const {items}=await this.call('workspaceAction','list');
 const space=items.find(s=>s.name===name);
 assert.ok(space,'Space to edit: '+name);
 await page.click(`[data-focus-key="edit:${space.id}"]`);
 await page.waitForSelector('#workspaceSwitcher[data-view="edit"]:not(.morphing)');
 return page;
}
export async function openLinuxSpacePicker(name) {
 const page=await openLinuxSpaceEditor.call(this,name);
 await page.click('[data-focus-key="color:custom"]');
 await page.waitForSelector('.space-picker-hex');
}
// The first card rectangle belongs to the opening morph. Aim relative to
// the fully expanded card, outside hover-panel-leave's eight-pixel slack.
export async function moveOffSettledPanel() {
 await this.frame('overlay').waitForSelector('body[data-mode="panel"] #islandPanel:not(.morph-start):not(.morph-run):not(.retracting)');
 const card=await this.call('overlayPanelRect');
 assert.ok(card?.left > 9,'space outside the expanded panel: '+JSON.stringify(card));
 const input={type:'mouseMove',x:Math.max(1,Math.floor(card.left)-60),y:Math.round(card.top+20)};
 assert.equal(await this.call('sendOverlayInput',input),true);
}
// F1-6, "motion inside the Island does not postpone opening", on Windows.
// Shipping's step waits for the host's hover state after every move and
// requires the panel within 600 ms of the first; on a hosted Windows runner
// those round trips alone use that up. Here moves are sent without waiting,
// and the panel opening while they still arrive proves the point only if no
// gap between them was as long as the dwell (island-hover-open.js, 300 ms):
// a postponing timer would then never have run out.
const HOVER_DWELL_MS=300;
export async function moveWithinIslandUntilOpen() {
 const rect=this.hoverIslandRect,offsets=[-10,-5,0,5,10,5,0,-5];
 const deadline=Date.now()+3000;
 let last=null,gap=0,move=0;
 while(Date.now()<deadline){
  const input={type:'mouseMove',x:Math.round(rect.x+rect.width/2+offsets[move++%offsets.length]),y:Math.round(rect.y+rect.height/2)};
  assert.equal(await this.call('sendChromeMouseInput',input),true,'chrome mouse input was not sent');
  const now=Date.now();
  if(last!==null)gap=Math.max(gap,now-last);
  last=now;
  if(await this.call('overlayMode')==='panel'){
   assert.ok(gap<HOVER_DWELL_MS,`a ${gap} ms gap between moves is as long as the hover dwell`);
   this.hoverOpenedDuringMotion=true;
   return;
  }
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 this.hoverOpenedDuringMotion=false;
}
// Linux and Windows both measure the panel mid-morph without the settled
// step (the first Windows nightly's island-and-commands:115).
export function windowLayoutSteps(platform=process.platform) {
 return new Map([
 ...(platform!=='darwin'?[['I move the pointer off the panel',moveOffSettledPanel]]:[]),
 ...(platform==='win32'?[['I move within the Island every 50 milliseconds',moveWithinIslandUntilOpen]]:[]),
 ...(platform==='linux'?[
 ['I open the color picker for {string}',openLinuxSpacePicker],
 ['I give {string} the custom color {string}',async function(name,hex){
  await openLinuxSpacePicker.call(this,name);
  await this.frame('overlay').fill('.space-picker-hex',hex);
 }],
 ['I delete {string} from its editor',async function(name){
  const page=await openLinuxSpaceEditor.call(this,name);
  await page.click('[data-focus-key="delete"]');
  await page.waitForSelector('[data-focus-key="undo"]');
 }],
 ["the window's page is {int} by {int}",async function(width,height){
  await resize.call(this,width,height);
  await waitForLinuxGlanceResize(this,width,height);
 }]]:[]),
 ['the window is 640 by 480 with the Island at 125%', async function(){await resize.call(this,640,480);}],
 ['the tab list keeps at least two rows and the footer stays in the window', async function(){
  const page=this.frame('overlay');await this.native('setIslandZoomFactor',[1.25]);
  try {
   await page.locator('#islandDrawer').waitFor({state:'visible'});
   const measure=()=>page.evaluate(()=>({listHeight:document.getElementById('islandList').getBoundingClientRect().height,
    drawerHeight:document.getElementById('islandDrawer').getBoundingClientRect().height,
    footerBottom:document.getElementById('islandFooter').getBoundingClientRect().bottom,height:innerHeight}));
   const settled=await this.waitFor(measure,m=>Math.abs(m.height-480/1.25)<=2,'125% Island viewport');
   assert.ok(settled.listHeight>=64,JSON.stringify(settled));
   assert.ok(settled.footerBottom<=settled.height+1,JSON.stringify(settled));
  } finally {await this.native('setIslandZoomFactor',[1]);await resize.call(this,1280,800);}
 }],
 ['I choose {string} vertical tab text in Settings', async function(size) {
  assert.equal(await this.call('tabLayout'),'vertical');
  const value=await inSettings(this,'appearance',async(size,d)=>{
   const control=d.find('#blancVerticalTabsTextSize');
   if(!control)return {missing:'vertical tab text size'};
   const select=control.shadowRoot.querySelector('select');
   select.value=size;select.dispatchEvent(new Event('change',{bubbles:true}));
   await new Promise(r=>setTimeout(r,300));
   return {value:control.pref.value};
  },size);
  assert.equal(value,size);
 }],
 ['I resize the desktop window to {int} by {int}', resize],
 ['a {int} by {int} desktop window with the vertical tab layout', async function(width, height) {
  await this.call('setTabLayout', 'vertical');
  await resize.call(this, width, height);
  this.verticalWindow = {width, height};
  if (width === 640 && height === 480) await this.call('groupActiveByName', 'minimum-window-group-label');
  await this.frame('strip').waitForFunction(() => document.documentElement.dataset.tabLayout === 'vertical');
  await this.frame('strip').locator('#verticalTabsRail:not([hidden])').waitFor();
 }],]);
}
export const WINDOW_LAYOUT_STEPS = windowLayoutSteps();
