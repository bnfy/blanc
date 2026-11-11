// Fork step definitions for pages-area S1 steps that shipping v1.45.1 never
// defined. Each follows its Gherkin text and spec row; no shipping source.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {jsLiteral} from '../lib/js-literal.mjs';
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
 // ---- F21: telemetry (spec row F21) ----
 // A release build, with the real first-run state and the collector on a
 // loopback capture server. The preview has no release version and sends
 // nothing, so these flags are what makes this a "packaged build".
 const sent=(world,path)=>world.telemetry.filter(event=>event.path===path);
 const commitUsagePing=async(world,usagePing)=>{
  await world.call('openTab','blanc://newtab/');
  const saved=await startDom(world,`window.bowserPages.start.completePrivacy({searchSuggestions:false,usagePing:${usagePing}})`);
  assert.equal(saved?.completed,true);
  world.committedUsagePing=usagePing;
  const state=JSON.parse(fs.readFileSync(path.join(world.fixture.profile,'Local State')));
  const profile=JSON.parse(fs.readFileSync(path.join(world.fixture.profile,'Default','Preferences')));
  assert.equal(state.blanc.telemetry.usage_ping,usagePing);
  assert.ok(state.blanc.first_run.completed_at>0);
  assert.equal(profile.search.suggest_enabled,false);
 };
 step('this is a packaged build with a fresh profile',async function(){
  const world=this,events=this.telemetry=[];
  const server=http.createServer((request,response)=>{let body='';request.on('data',chunk=>{body+=chunk;});
   request.on('end',()=>{const disk=JSON.parse(fs.readFileSync(path.join(world.fixture.profile,'Local State')));
    events.push({path:request.url,body:JSON.parse(body||'{}'),consent:disk.blanc?.telemetry?.usage_ping,completed:disk.blanc?.first_run?.completed_at});response.writeHead(204);response.end();});});
  this.telemetryServer=server;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));server.unref();
  // The blocker starts with the first web request, and the fixture's relaunch
  // waits for it, so a web page has to come back with the session.
  await this.call('openTab',this.fixtureUrl('find-page'));
  this.fixture.extraArgs=['--blanc-test-first-run','--blanc-test-version=1.46.0',`--blanc-test-telemetry-host=http://127.0.0.1:${server.address().port}`];
  await this.relaunch();
 });
 step('the app launches',async function(){await this.relaunch();});
 step('the app launches again',async function(){await this.relaunch();
  const state=await this.native('firstRunState');assert.equal(state.complete,true);assert.equal(state.usagePing,this.committedUsagePing);
 });
 step('no usage ping is sent',async function(){
  await new Promise(resolve=>setTimeout(resolve,1500));
  assert.deepEqual(sent(this,'/ping'),[]);
 });
 step('I commit the enabled usage ping choice',async function(){await commitUsagePing(this,true);});
 step('I commit the disabled usage ping choice',async function(){await commitUsagePing(this,false);});
 step('exactly one launch ping is sent',async function(){
  await until(this,()=>sent(this,'/ping').length,count=>count>0,'the launch ping');
  await new Promise(resolve=>setTimeout(resolve,1000));
  assert.equal(sent(this,'/ping').length,1);
  for(const event of this.telemetry){assert.equal(event.consent,true);assert.ok(event.completed>0,'consent persisted before every event');}
 });
 step('it contains only an install id, session id, version, platform, architecture, and coarse operating-system version',async function(){
  const {body}=sent(this,'/ping')[0];
  assert.deepEqual(Object.keys(body).sort(),['arch','installId','osVersion','platform','sessionId','version']);
  assert.match(body.installId,/^[0-9a-f-]{36}$/);assert.ok(Number.isInteger(body.sessionId)&&body.sessionId>0);
  assert.equal(body.version,'1.46.0');assert.match(body.osVersion,/^\d+$/);
 });
 step('it contains no browsing data',async function(){
  assert.ok(!JSON.stringify(sent(this,'/ping')[0].body).includes('127.0.0.1'));
 });
 step('no telemetry install id exists',async function(){
  assert.equal((await this.native('telemetryState')).installId,false);
 });
 // ---- F8-1: find in page (spec row F8; Island overlay find capsule) ----
 step('a page containing the word {string} {int} times',async function(word,count){
  // The loopback fixture's body repeats "widget" three times; its name and
  // title must not add a fourth match.
  const url=this.fixtureUrl('find-page');const id=await this.call('openTab',url);
  this.findTabId=id;this.findWord=word;
  const found=await this.call('executeTab',id,`(document.body.innerText.match(new RegExp(${jsLiteral(word)},'gi'))||[]).length`);
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
 // Clickable means views' own targeting sends a click beside the capsule to
 // the page, while the capsule and the strip stay the Island's; points are in
 // the Island document, whose viewport is the Island view.
 step('the page content outside the find bar remains clickable',async function(){
  const g=await this.hostEval(`(()=>{const strip=document.querySelector('#strip').getBoundingClientRect();
   const frame=document.querySelector('#overlay').getBoundingClientRect();
   const bar=document.querySelector('#overlay').contentDocument.getElementById('findBar').getBoundingClientRect();
   return {width:innerWidth,height:innerHeight,pageTop:strip.bottom,bar:{left:frame.left+bar.left,top:frame.top+bar.top,right:frame.left+bar.right,bottom:frame.top+bar.bottom}};})()`);
  const r=Math.round,mid=r((g.bar.top+g.bar.bottom)/2),below=r(Math.min(g.height-2,g.bar.bottom+20));
  const points={beside:[r(Math.max(4,g.bar.left-30)),mid],right:[r(Math.min(g.width-4,g.bar.right+30)),mid],
   below:[r((g.bar.left+g.bar.right)/2),below],capsule:[r((g.bar.left+g.bar.right)/2),mid],strip:[4,r(g.pageTop/2)]};
  const hit={};for(const [name,[x,y]] of Object.entries(points))hit[name]=await this.native('hitTarget',[x,y]);
  const page=['beside','right'].concat(below>g.bar.bottom?['below']:[]);
  for(const name of page)assert.equal(hit[name],'other',`a click ${name} the find bar should reach the page: ${jsLiteral({hit,points,g})}`);
  assert.equal(hit.capsule,'island','the find bar keeps its own clicks');
  assert.equal(hit.strip,'island','the strip keeps its own clicks');
 });
 // ---- F10-1: a visit is recorded with the final page title ----
 step('I visit {string} with title {string}',async function(name,title){
  const url=this.fixtureUrl(name);const id=await this.call('openTab',url);
  // The page sets its own final title, as a site does after load.
  await this.call('executeTab',id,`document.title=${jsLiteral(title)}`);
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
  // The scenario is the Ledger's: favorites, groups and the footer count are
  // its content, and a fresh profile now starts on Billboard.
  assert.equal(await this.call('setNewtabLayout','ledger'),'ledger');
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
  // A file streamed over about four seconds, so its row is seen in flight.
  // It lands inside the isolated fixture, never the user's Downloads.
  const chunks=8,size=32*1024;
  this.downloadServer=http.createServer((q,r)=>{
   r.writeHead(200,{'content-type':'application/octet-stream','content-length':String(chunks*size),
    'content-disposition':'attachment; filename="slow-download.bin"'});
   let sent=0;const timer=setInterval(()=>{r.write(Buffer.alloc(size,65));if(++sent===chunks){clearInterval(timer);r.end();}},500);
   r.on('close',()=>clearInterval(timer));});
  this.downloadServer.unref();
  await new Promise(resolve=>this.downloadServer.listen(0,'127.0.0.1',resolve));
  const dir=this.fixture.directory+'/downloads';
  await this.fixture.browser.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir,eventsEnabled:true});
  this.downloadEvents=[];
  for(const m of ['Browser.downloadWillBegin','Browser.downloadProgress'])this.fixture.browser.on(m,e=>this.downloadEvents.push({m,...e}));
  // A tab opened straight at a download URL never commits a document and
  // closes itself almost immediately (confirmed live: it's present for one
  // state tick, gone the next) — openTab()'s created() helper waits for that
  // same tab id to finish loading, which never happens. Create it directly
  // and track only the download, which is what this step actually asserts.
  await this.native('createTab',[`http://127.0.0.1:${this.downloadServer.address().port}/slow-download.bin`]);
  await until(this,()=>this.downloadEvents,e=>e.some(x=>x.m==='Browser.downloadWillBegin'),'the download to begin');
 });
 // The Downloads sheet's row for the download, as shipping's page draws it.
 const downloadRow=async world=>{
  const surf=await world.call('utilitySurface');
  if(!surf.visible||surf.url!=='blanc://downloads/'){
   await world.call('openDownloads');
   const shown=await until(world,()=>world.call('utilitySurface'),s=>s.visible&&s.ready,'the downloads page');
   assert.equal(shown.url,'blanc://downloads/','downloads should show in the Blanc downloads sheet');
  }
  return world.hostEval(`(()=>{const row=[...(document.getElementById('sheet')?.contentDocument?.querySelectorAll('#list .row')??[])]
   .find(r=>r.querySelector('.file-name')?.title==='slow-download.bin');
   return row?{state:row.dataset.state,progress:row.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')??null,
    meta:row.querySelector('.meta')?.textContent??''}:null;})()`);
 };
 step('a downloads row shows progress',async function(){
  const row=await until(this,()=>downloadRow(this),r=>r?.state==='progressing'&&r.progress!==null,'a downloads row in progress');
  assert.ok(Number(row.progress)<100,JSON.stringify(row));
 });
 step('the row reaches a completed state',async function(){
  await until(this,()=>downloadRow(this),r=>r?.state==='completed','the download row to complete',15000);
  this.downloadServer?.close();
 });
}
