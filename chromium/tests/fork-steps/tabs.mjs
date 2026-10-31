// Fork step definitions for tabs-area S1 steps that shipping v1.45.1 never
// defined. Each follows its Gherkin text and spec row; no shipping source.
import assert from 'node:assert/strict';
import {blockableHostname} from '../adapters/tabs.mjs';
// Well-known EasyPrivacy tracker scripts. The page itself requests them; the
// resolver sends anything that escapes the blocker to NOTFOUND, so nothing
// leaves loopback either way.
export const TRACKERS=['https://www.google-analytics.com/analytics.js','https://www.googletagmanager.com/gtag/js?id=G-TEST',
 'https://connect.facebook.net/en_US/fbevents.js'];
const requestTrackers=`Promise.all(${JSON.stringify(TRACKERS)}.map(src=>new Promise(done=>{const s=document.createElement('script');s.src=src;s.onload=s.onerror=()=>done();document.head.append(s);}))).then(()=>true)`;
async function nativeTab(world,id){return (await world.snapshot()).tabs.find(t=>String(t.id)===String(id));}
async function loadTrackers(world,name){
 const id=await world.call('openTab',world.fixtureUrl(name));
 world.named.set(name,id);world.activeName=name;
 assert.equal(await world.call('executeTab',id,requestTrackers),true);
 return id;
}
const blocked=(world,id,accept,label)=>world.waitFor(()=>nativeTab(world,id),t=>t&&accept(t.blockedCount),label,10000);
async function groupId(world,name){
 const g=(await world.snapshot()).groups.find(g=>g.name.toLocaleLowerCase()===name.toLocaleLowerCase());
 assert.ok(g,`group ${name} should exist`);return String(g.id);
}
export default function register(step){
 // F12-1
 step('I load a page that requests known trackers',async function(){this.trackerTabId=await loadTrackers(this,'trackers');});
 step('the shield count for the tab is greater than 0',async function(){
  await blocked(this,this.trackerTabId,n=>n>0,'a blocked tracker on the tab');
 });
 // F12-2
 step('the active tab is on {string} with a shield count greater than 0',async function(name){
  const id=await loadTrackers(this,name);await blocked(this,id,n=>n>0,`a blocked tracker on ${name}`);
 });
 step('the shield count for {string} becomes 0',async function(name){
  await blocked(this,this.named.get(name),n=>n===0,`${name}'s shield count to reach 0`);
 });
 step('{string} is in the ad-block exceptions',async function(name){
  const host=blockableHostname((await nativeTab(this,this.named.get(name))).committedUrl);
  assert.ok(host,`${name} should have an exception-list hostname`);
  const ex=await this.call('exceptions');assert.ok(ex.includes(host),`exceptions ${JSON.stringify(ex)} should contain ${host}`);
 });
 step('I reload {string}',async function(name){
  const id=this.named.get(name);await this.api('reload',[id]);
  await this.waitFor(()=>nativeTab(this,id),t=>t&&!t.isLoading,`${name} to reload`,10000);
 });
 step('ads are still allowed on {string}',async function(name){
  const id=this.named.get(name);
  assert.equal(await this.call('executeTab',id,requestTrackers),true);
  const tab=await nativeTab(this,id);
  assert.equal(tab.adblockExcepted,true,`${name} should still be excepted`);
  assert.equal(tab.blockedCount,0,`${name} should block nothing while allowed`);
  const host=blockableHostname(tab.committedUrl);
  assert.ok((await this.call('exceptions')).includes(host));
 });
 // F13-1: the Blanc prompt's own Block button, then the page's own view.
 step('I deny the request',async function(){
  assert.ok(this.hoverPermissionPrompt,'the Blanc permission prompt should be showing');
  await this.hoverPermissionPrompt.locator('#permBlockBtn').click();
 });
 step('the denial persists for that origin',async function(){
  const id=this.hoverPermissionTabId;const query=`navigator.permissions.query({name:'geolocation'}).then(p=>p.state)`;
  await this.waitFor(()=>this.call('executeTab',id,query),s=>s==='denied','geolocation to read denied');
  await this.api('reload',[id]);
  await this.waitFor(()=>nativeTab(this,id),t=>t&&!t.isLoading,'permission page reload',10000);
  assert.equal(await this.call('executeTab',id,query),'denied');
 });
 // F3-3: the group header in the ⌘L panel folds the group.
 step('I collapse the group {string}',async function(name){
  const id=await groupId(this,name);
  const page=this.frame('overlay');
  const header=page.locator(`#islandList .island-ghead[data-group-id="${id}"]`);
  // As a person would: once the opening morph has uncovered the header.
  await page.waitForFunction(id=>{const h=document.querySelector(`#islandList .island-ghead[data-group-id="${CSS.escape(id)}"]`);
   if(!h)return false;const r=h.getBoundingClientRect();return h.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));},id);
  if(await header.getAttribute('aria-expanded')!=='false')await header.click();
  await this.waitFor(async()=>(await this.snapshot()).groups.find(g=>String(g.id)===id)?.collapsed,Boolean,`${name} to collapse`);
 });
 step('the panel shows a {string} row for {string}',async function(text,name){
  const id=await groupId(this,name);
  await this.waitFor(()=>this.frame('overlay').evaluate(([id,text])=>{
   const head=document.querySelector(`#islandList .island-ghead[data-group-id="${CSS.escape(id)}"]`);
   const band=head?.closest('[data-drag-section]')??head?.parentElement;
   return !!band&&[...band.querySelectorAll('*')].some(el=>el!==head&&!head.contains(el)&&el.children.length===0&&el.textContent.trim()===text);
  },[id,text]),Boolean,`a "${text}" row for ${name}`);
 });
}
