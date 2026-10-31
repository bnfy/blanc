// Fork step definitions for commands-area S1 steps that shipping v1.45.1 never
// defined. Each follows its Gherkin text and spec row; no shipping source.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tabPage} from '../adapters/core.mjs';
const overlay=w=>w.frame('overlay');
const rows=w=>w.call('addressResultRows');
// The Quick Switcher's own tag for a result kind, in the running language.
const tag=(w,kind)=>overlay(w).evaluate(k=>blancI18n.t('result.tag.'+k),kind);
async function waitRows(w,accepts,label){return w.waitFor(()=>rows(w),accepts,label,5000);}
async function openNamed(w,name){const id=await w.call('openTab',w.fixtureUrl(name));
 await w.waitForState(s=>s.tabs.some(t=>t.id===id&&t.title===name&&!t.loading));return id;}
// Strip palette as the stylesheet resolves it: the private scope, else the
// colour scheme the document is drawn in.
const palette=page=>page.evaluate(()=>document.documentElement.dataset.theme==='private'?'private'
 :matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
// F44: the fork resolves its interface language from the browser's language
// list (strings.js) with no stored choice. The OS preference is simulated per
// process with macOS's -AppleLanguages argument; Chromium also opens that
// argument as a URL, so the runner closes that stray tab after the start.
const LABELS={System:'system',English:'en',Deutsch:'de'};
const stripLang=w=>w.frame('strip').evaluate(()=>document.documentElement.lang);
const noStoredLanguage=what=>{throw Error(`${what}: the fork stores no interface language choice (strings.js follows the browser language)`);};
export default function register(step){
 // F6-1: a favorite saved through the Island's own heart, on its page.
 step('a favorite for {string}',async function(name){
  const id=await openNamed(this,name);await this.api('toggleBookmark',[id]);
  await this.waitFor(()=>this.api('listFavorites'),list=>list.some(f=>f.url===this.fixtureUrl(name)),'favorite '+name,5000);
  await this.call('closeTab',id);
 });
 // Real key input into the open command bar.
 step('I type {string}',async function(text){
  await this.waitFor(()=>this.call('overlayRendererMode'),m=>m==='palette'||m==='panel','an open command bar',5000);
  await overlay(this).locator('#addressInput').type(text);
 });
 step('the results include the tab {string}',async function(name){
  const t=await tag(this,'tab');await waitRows(this,r=>r.some(x=>x.title===name&&x.tag===t),'tab result '+name);
 });
 step('the results include the favorite {string}',async function(name){
  const t=await tag(this,'favorite');await waitRows(this,r=>r.some(x=>x.title===name&&x.tag===t),'favorite result '+name);
 });
 // F6-2: the group's tabs are real fixture pages; a later ungrouped tab
 // stays active.
 step('a group named {string} with {int} tabs that is not active',async function(name,count){
  for(let i=1;i<=count;i++)await this.call('groupTabByName',await openNamed(this,`${name}-${i}`),name);
  await openNamed(this,`${name}-outside`);
  const s=await this.state();const g=s.groups.find(x=>x.name.toLowerCase()===name.toLowerCase());
  assert.ok(g,'group '+name);assert.equal(s.tabs.filter(t=>t.groupId===g.id).length,count);
  assert.notEqual(s.tabs.find(t=>t.id===s.activeTabId).groupId,g.id);
 });
 step('a group result {string} is listed above any tab results',async function(name){
  const [gt,tt]=[await tag(this,'group'),await tag(this,'tab')];
  const r=await waitRows(this,r=>r.some(x=>x.title===name&&x.tag===gt),'group result '+name);
  const g=r.findIndex(x=>x.title===name&&x.tag===gt),t=r.findIndex(x=>x.tag===tt);
  assert.ok(t<0||g<t,`group row ${g} above first tab row ${t}`);
 });
 step('I choose the group result {string}',async function(name){
  const gt=await tag(this,'group');const r=await waitRows(this,r=>r.some(x=>x.title===name&&x.tag===gt),'group result '+name);
  await overlay(this).locator('#islandList .island-row').nth(r.findIndex(x=>x.title===name&&x.tag===gt)).click();
 });
 step('the active tab is one of the tabs in {string}',async function(name){
  await this.waitForState(s=>{const g=s.groups.find(x=>x.name.toLowerCase()===name.toLowerCase());
   return g&&s.tabs.some(t=>t.id===s.activeTabId&&t.groupId===g.id);});
 });
 // F7-1
 step('the command {string} is listed',async function(cmd){await waitRows(this,r=>r.some(x=>x.cmd===cmd),'command '+cmd);});
 step('the command {string} is not listed',async function(cmd){
  await waitRows(this,r=>r.some(x=>x.cmd),'the command list');
  assert.ok(!(await rows(this)).some(x=>x.cmd===cmd),cmd+' is not listed');
 });
 // F15-1/F15-2: the Island strip and an open Start Page judged by the palette
 // their stylesheets resolve; the host document must not have reloaded.
 step('an internal blanc page is open',async function(){
  this.internalTabId=await this.call('newTab');
  this.hostOrigin=await this.hostEval('performance.timeOrigin');
 });
 step('I set the theme to {string}',async function(theme){await this.call('setAppearance',theme);});
 step('the chrome uses the {word} palette',async function(name){
  await this.waitFor(()=>palette(this.frame('strip')),p=>p===name,'the Island strip palette '+name,5000);
 });
 step('the open internal page uses the {word} palette',async function(name){
  const page=await tabPage(this,this.internalTabId);
  await this.waitFor(()=>palette(page),p=>p===name,'the internal page palette '+name,5000);
 });
 step('the OS prefers {string}',function(tag){this.fixture.extraArgs=['-AppleLanguages',`(${tag})`];this.osLanguageTag=tag;});
 step('German is selectable',async function(){
  // The candidate's own catalog file, from the asset directory it serves.
  const source=fs.readFileSync(path.join(this.fixture.config.assets,'strings.js'),'utf8');
  const codes=JSON.parse(/const codes=(\[[^\]]*\])/.exec(source)?.[1]??'[]');
  assert(codes.includes('de'),'the fork catalog should include German: '+codes);
 });
 step('Blanc starts',async function(){
  await this.relaunch();
  const stray=`http://(${String(this.osLanguageTag).toLowerCase()})/`;
  for(const t of (await this.snapshot()).tabs)if(this.osLanguageTag&&t.url===stray)await this.native('closeTab',[t.id]);
 });
 // Setting labels (System, English, Deutsch) are a stored choice; codes are
 // the resolved language the Island document is drawn in.
 step('the interface language is {string}',async function(value){
  if(value in LABELS){
   if(LABELS[value]==='system'){assert.equal(await this.frame('strip').evaluate(()=>window.__blancUiLanguage??null),null,'no language should be pinned');return;}
   noStoredLanguage('Pinning '+value);
  }
  await this.waitFor(()=>stripLang(this),l=>l===value,'interface language '+value,5000);
 });
 step('the user chooses {string} in Settings',async function(label){
  await this.api('openPage',['settings']);
  await this.waitForState(s=>s.tabs.some(t=>t.url.includes('settings')));
  this.settingsPage=await tabPage(this,(await this.snapshot()).activeTabId);
  const chosen=await this.settingsPage.evaluate(code=>{const c=document.getElementById('uiLanguage');if(!c)return false;
   c.value=code;c.dispatchEvent(new Event('change',{bubbles:true}));return c.value===code;},LABELS[label]);
  assert(chosen,`Fork Settings has no #uiLanguage control offering ${label}`);
 });
 step('Settings offers to relaunch to apply',async function(){
  await this.waitFor(()=>this.settingsPage.evaluate(()=>{const b=document.getElementById('uiLanguageRelaunch');return !!b&&!b.hidden;}),Boolean,'relaunch offer',5000);
 });
 step('after a relaunch the interface language is {string}',async function(code){await this.relaunch();await this.waitFor(()=>stripLang(this),l=>l===code,'interface language '+code,5000);});
 step('the stored interface language is {string}',()=>noStoredLanguage('Storing a language'));
 step('the stored interface language is still {string}',()=>noStoredLanguage('Reading the stored language'));
 step('a page is loaded with the interface language {string} and again with {string}',()=>noStoredLanguage('Switching the interface language'));
 step('no restart was required',async function(){assert.equal(await this.hostEval('performance.timeOrigin'),this.hostOrigin);});
}
