// Fork step definitions for pages-area S1 steps that shipping v1.45.1 never
// defined. Each follows its Gherkin text and spec row; no shipping source.
import assert from 'node:assert/strict';
import {UndefinedNativeAdapterError} from '../lib/adapters.mjs';
// Cucumber Expressions treat `/` as alternation and `(...)` as optional text.
const until=(world,read,ok,label,timeout=8000)=>world.waitFor(read,ok,label,timeout);
// The active Start Page document, through the pages adapters' own lookup.
async function startDom(world,expression){
 const value=await world.call('executeStartPage',expression);
 if(value===null)throw Error('The active tab is not the Start Page');
 return value;
}
// Shipping's find capsule lives in the Island overlay document.
const overlay=world=>world.frame('overlay');
export default function register(step){
 // ---- F8-1: find in page (spec row F8; Island overlay find capsule) ----
 step('a page containing the word {string} {int} times',async function(word,count){
  // The loopback fixture's body repeats "widget" three times; its name and
  // title must not add a fourth match.
  const url=this.fixtureUrl('find-page');const id=await this.call('openTab',url);
  this.findTabId=id;this.findWord=word;
  const found=await this.call('executeTab',id,`(document.body.innerText.match(new RegExp(${JSON.stringify(word)},'gi'))||[]).length`);
  assert.equal(found,count,`fixture page should contain ${word} ${count} times`);
 });
 step('I search for {string}',async function(query){
  await overlay(this).locator('#findInput').fill(query);
 });
 step('the match count shows {int}',async function(count){
  await until(this,()=>overlay(this).evaluate(()=>document.getElementById('findCount').textContent),
   text=>new RegExp(`/${count}$`).test(text||''),`find count to show ${count}`);
 });
 step('I can navigate to the next and previous match',async function(){
  const read=()=>overlay(this).evaluate(()=>document.getElementById('findCount').textContent);
  const ordinal=t=>Number(String(t).split('/')[0]);
  const start=ordinal(await read());
  await overlay(this).locator('#findNextBtn').click();
  const next=await until(this,read,t=>ordinal(t)!==start,'next match');
  await overlay(this).locator('#findPrevBtn').click();
  await until(this,read,t=>ordinal(t)===start,'previous match');
  assert.notEqual(ordinal(next),start);
 });
 // Clickable means no Island view lies over the page outside the capsule:
 // the Island's native view is the host document's viewport, and the page
 // starts below the resting strip.
 step('the page content outside the find bar remains clickable',async function(){
  const g=await this.hostEval(`(()=>{const strip=document.querySelector('#strip').getBoundingClientRect();
   const frame=document.querySelector('#overlay').getBoundingClientRect();
   const bar=document.querySelector('#overlay').contentDocument.getElementById('findBar').getBoundingClientRect();
   return {width:innerWidth,height:innerHeight,pageTop:strip.bottom,bar:{left:frame.left+bar.left,top:frame.top+bar.top,right:frame.left+bar.right,bottom:frame.top+bar.bottom}};})()`);
  const coveredRows=Math.max(0,g.height-g.pageTop);
  const covered=coveredRows*g.width-Math.max(0,Math.min(g.bar.bottom,g.height)-Math.max(g.bar.top,g.pageTop))*(g.bar.right-g.bar.left);
  assert.equal(covered,0,`Island view covers ${covered}px² of page outside the find capsule: ${JSON.stringify(g)}`);
 });
 // ---- F10-1: a visit is recorded with the final page title ----
 step('I visit {string} with title {string}',async function(name,title){
  const url=this.fixtureUrl(name);const id=await this.call('openTab',url);
  // The page sets its own final title, as a site does after load.
  await this.call('executeTab',id,`document.title=${JSON.stringify(title)}`);
  await this.waitForState(s=>s.tabs.some(t=>t.id===id&&t.title===title));
  this.visitedUrl=url;
 });
 step('history contains one entry for {string} titled {string}',async function(name,title){
  const url=this.fixtureUrl(name);
  const entries=await until(this,async()=>(await this.api('listHistory',[{limit:300}])).filter(h=>h.url===url),
   list=>list.length===1&&list[0].title===title,`one history entry for ${name} titled ${title}`);
  assert.equal(entries.length,1);
 });
 // ---- F16-1: the new-tab ledger ----
 step('at least one favorite and one resumable group exist',async function(){
  this.ledgerFavorite=this.fixtureUrl('ledger-favorite');
  await this.call('seedFavorite',this.ledgerFavorite,'Ledger favorite');
  const id=await this.call('openTab',this.fixtureUrl('ledger-group'));
  await this.call('groupTabByName',id,'research');
  await this.waitForState(s=>s.groups.some(g=>g.name.toLowerCase()==='research'));
 });
 step("the new-tab page shows today's date",async function(){
  const dom=await until(this,()=>startDom(this,`({shown:document.getElementById('startDate')?.textContent??'',
   today:new Date().toLocaleDateString(blancI18n.formatLocale(),{weekday:'long',month:'long',day:'numeric'})})`),d=>!!d.shown,'Start Page date');
  assert.equal(dom.shown,dom.today);
 });
 step('it shows the favorites section',async function(){
  const read=()=>startDom(this,`(()=>{const layout=document.body.dataset.layout;
   const root=document.getElementById('layout'+layout.charAt(0).toUpperCase()+layout.slice(1));
   return {layout,urls:[...root.querySelectorAll('[data-favorite-url]')].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.dataset.favoriteUrl)};})()`);
  const dom=await until(this,read,d=>d.urls.includes(this.ledgerFavorite),'the favorite on the rendered Start Page').catch(async e=>{throw Error(e.message+` (rendered layout: ${(await read()).layout})`);});
  assert.ok(dom.urls.includes(this.ledgerFavorite));
 });
 step('it shows resumable tab groups',async function(){
  await until(this,()=>startDom(this,`(()=>{const layout=document.body.dataset.layout;
   const root=document.getElementById('layout'+layout.charAt(0).toUpperCase()+layout.slice(1));
   return [...root.querySelectorAll('*')].filter(e=>e.children.length===0&&e.getBoundingClientRect().width>0).map(e=>e.textContent.trim().toLowerCase());})()`),
   texts=>texts.includes('research'),'the research group on the rendered Start Page');
 });
 step('it shows the weekly blocked count',async function(){
  await until(this,()=>startDom(this,`(()=>{const e=document.getElementById('footerLeft');return !!e&&!e.hidden&&e.getBoundingClientRect().width>0&&/\\d/.test(e.textContent);})()`),
   Boolean,'a visible weekly blocked count');
 });
 step('it shows no mascot',async function(){
  const count=await startDom(this,`document.querySelectorAll('[id*="mascot" i],[class*="mascot" i],[id*="sprite" i],[class*="sprite" i]').length`);
  assert.equal(count,0);
 });
 // ---- F11-1: downloads (spec row F11: the Downloads sheet) ----
 step('I start a download',async function(){
  // Keep the file inside the isolated fixture, never the user's Downloads.
  const dir=this.fixture.directory+'/downloads';
  await this.fixture.browser.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir,eventsEnabled:true});
  this.downloadEvents=[];
  for(const m of ['Browser.downloadWillBegin','Browser.downloadProgress'])this.fixture.browser.on(m,e=>this.downloadEvents.push({m,...e}));
  await this.call('openTab',this.fixture.base+'/workspace-download');
  await until(this,()=>this.downloadEvents,e=>e.some(x=>x.m==='Browser.downloadWillBegin'),'the download to begin');
 });
 const downloadsSheet=async world=>{
  await world.call('openDownloads');
  const surf=await until(world,()=>world.call('utilitySurface'),s=>s.visible&&s.ready,'the downloads page');
  assert.equal(surf.url,'blanc://downloads/','downloads should show in the Blanc downloads sheet');
  throw new UndefinedNativeAdapterError('Blanc downloads sheet rows need an adapter');
 };
 step('a downloads row shows progress',async function(){await downloadsSheet(this);});
 step('the row reaches a completed state',async function(){await downloadsSheet(this);});
}
