// Fork step definitions for island-area S1 steps that shipping v1.45.1 never
// defined. Each follows its Gherkin text and spec row; no shipping source.
import assert from 'node:assert/strict';
// Distinct EasyPrivacy tracker scripts, requested by the page itself; the
// resolver sends anything the blocker lets through to NOTFOUND.
const TRACKERS=['https://www.google-analytics.com/analytics.js','https://www.googletagmanager.com/gtag/js?id=G-ISLAND',
 'https://connect.facebook.net/en_US/fbevents.js'];
const request=urls=>`Promise.all(${JSON.stringify(urls)}.map(src=>new Promise(done=>{const s=document.createElement('script');s.src=src;s.onload=s.onerror=()=>done();document.head.append(s);}))).then(()=>true)`;
const strip=w=>w.frame('strip');
// Visible elements of the resting strip, measured in its own document.
const shown=(w,selector)=>strip(w).evaluate(sel=>[...document.querySelectorAll(sel)].filter(e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);
 return !e.hidden&&r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';}).map(e=>({id:e.id,cls:e.className,label:e.getAttribute('aria-label'),text:e.textContent})),selector);
async function nativeTab(w,id){return (await w.snapshot()).tabs.find(t=>String(t.id)===String(id));}
export default function register(step){
 // F1-1
 step('a group named {string} with {int} tabs',async function(name,count){
  this.islandGroups??={};this.islandGroups[name]=[];
  for(let i=1;i<=count;i++){
   const id=await this.call('openTab',this.fixtureUrl(`${name}-${i}`));
   await this.call('groupTabByName',id,name);this.islandGroups[name].push(id);
  }
  await this.waitForState(s=>{const g=s.groups.find(g=>g.name.toLocaleLowerCase()===name.toLocaleLowerCase());
   return g&&s.tabs.filter(t=>t.groupId===g.id).length===count;});
 });
 step('the active tab is in {string} on a page where {int} requests were blocked',async function(name,count){
  const id=this.islandGroups?.[name]?.[0];assert.ok(id,`group ${name} should have a tab`);
  assert.ok(count<=TRACKERS.length,`only ${TRACKERS.length} tracker requests are available`);
  await this.call('activateTab',id);await this.waitForState(s=>s.activeTabId===id);
  assert.equal(await this.call('executeTab',id,request(TRACKERS.slice(0,count))),true);
  await this.waitFor(()=>nativeTab(this,id),t=>t?.blockedCount===count,`${count} blocked requests on the active tab`,10000);
  this.islandActiveId=id;
 });
 step('the island is at rest',async function(){
  await this.call('closeOverlay');
  await this.waitFor(()=>this.call('overlayMode'),m=>m==null,'the island at rest');
 });
 step('the island shows back and forward controls',async function(){
  const buttons=await shown(this,'#islandPill #pillNav button');
  assert.equal(buttons.length,2,JSON.stringify(buttons));
 });
 step("the island shows the active page's domain",async function(){
  const tab=await nativeTab(this,(await this.snapshot()).activeTabId);
  const host=new URL(tab.url).host;
  await this.waitFor(()=>strip(this).evaluate(()=>document.getElementById('pillDomain')?.textContent??null),t=>t===host,`the pill to show ${host}`);
 });
 step('the island shows a shield count of {int}',async function(count){
  const read=()=>strip(this).evaluate(()=>{const chip=document.getElementById('pillShield');const n=document.getElementById('pillShieldCount');
   return {hidden:!chip||chip.hidden,count:n?.textContent?.trim()??null};});
  const chip=await this.waitFor(read,c=>!c.hidden&&c.count===String(count),`a shield count of ${count}`);
  assert.equal(chip.count,String(count));
 });
 step('the island shows the trailing action cluster',async function(){
  const actions=await shown(this,'#islandPill #pillActions > button');
  // Reload, favorite and close tab; downloads joins only while there is one.
  assert.ok(actions.length>=3,JSON.stringify(actions));
  assert.ok(actions.some(a=>a.id==='pillHeart'),'favorite button');
  assert.ok(actions.some(a=>/\bpill-close\b/.test(a.cls)),'close-tab button');
 });
 // F1-2
 step('{int} tabs are open',async function(count){
  let n=(await this.snapshot()).tabs.length;
  for(;n<count;n++)await this.call('openTab',this.fixtureUrl(`tab-${n+1}`));
  await this.waitForState(s=>s.tabs.length===count);
 });
 step('the command bar is shown over the page content',async function(){
  await this.waitFor(()=>this.call('overlayMode'),m=>m==='palette'||m==='panel','the command bar');
  const read=()=>this.hostEval(`(()=>{const f=document.getElementById('overlay');if(f.hidden)return null;const r=f.getBoundingClientRect();
   const p=f.contentDocument.getElementById('islandPanel')?.getBoundingClientRect();return {frameBottom:r.bottom,innerHeight,panel:p&&{top:p.top+r.y,bottom:p.bottom+r.y,width:p.width}}})()`);
  const r=await this.waitFor(read,v=>v?.panel?.width>0&&v.panel.bottom>68,'the command bar to be drawn over the page').catch(()=>read());
  assert.ok(r?.panel?.width>0,'the command bar is drawn: '+JSON.stringify(r));
  // The Island's own band is 68 px; over the page means the bar reaches below it.
  assert.ok(r.panel.bottom>68,'the command bar extends over the page: '+JSON.stringify(r));
 });
 step('the list area shows the tab switcher',async function(){
  const ids=(await this.snapshot()).tabs.map(t=>String(t.id));
  const rows=await this.waitFor(()=>this.frame('overlay').evaluate(()=>[...document.querySelectorAll('#islandList [data-tab-id]')].map(e=>e.dataset.tabId)),
   r=>ids.every(id=>r.includes(id)),'a row for every open tab');
  assert.ok(ids.every(id=>rows.includes(id)));
 });
}
