// Private lifecycle assertions use real documents, history and native tab
// creation. A virtual CDP authenticator cannot qualify Touch ID persistence.
import assert from 'node:assert/strict';
import {UndefinedNativeAdapterError} from '../lib/adapters.mjs';
import {tabPage} from '../adapters/core.mjs';
const active=async w=>(await w.state()).activeTabId;
export default function register(step){
 step('I register a device-bound passkey on a site in the private tab',async function(){
  throw new UndefinedNativeAdapterError('Device-bound Touch ID ceremony requires signed/entitled build and owner interaction; Apple/signing work is outside this queue. Native metadata isolation is checked separately.');
 });
 step('I open a private tab',async function(){
  this.privateId=await this.call('openTab','blanc://newtab/?private=1',{private:true});
 });
 step('I visit {string} in the private tab',async function(name){
  this.privateId=await active(this);
  await this.api('navigate',[this.privateId,this.fixtureUrl(name)]);
  await this.waitForState(s=>s.tabs.some(t=>t.id===this.privateId&&t.loadedUrl===this.fixtureUrl(name)&&!t.loading));
 });
 step('{string} is not in history',async function(name){
  // Positive control: prove the same history API sees an ordinary visit.
  const id=await this.call('openTab',this.fixtureUrl('ordinary-history-control'));
  await this.waitFor(()=>this.api('listHistory',[{limit:300}]),h=>h.some(x=>x.url===this.fixtureUrl('ordinary-history-control')),'ordinary history recorded');
  assert.ok(!(await this.api('listHistory',[{limit:300}])).some(x=>x.url===this.fixtureUrl(name)));
  await this.call('closeTab',id);await this.call('activateTab',this.privateId);
 });
 step('I close the private tab',async function(){await this.call('closeTab',this.privateId??await active(this));});
 step('no tab open on {string} is restored',async function(name){
  assert.ok(!(await this.state()).tabs.some(t=>t.url===this.fixtureUrl(name)));
  await this.relaunch();
  assert.ok(!(await this.state()).tabs.some(t=>t.url===this.fixtureUrl(name)));
  assert.ok(!(await this.api('listHistory',[{limit:300}])).some(x=>x.url===this.fixtureUrl(name)));
 });
 step('the island uses the private theme',async function(){
  this.privateId=await active(this);
  await this.waitFor(()=>this.frame('strip').evaluate(()=>document.documentElement.dataset.theme),v=>v==='private','private Island theme');
 });
 step('the island shows a {string} chip',async function(label){
  assert.equal(label,'private');
  const chip=await this.frame('strip').evaluate(()=>{const e=document.getElementById('pillPrivateChip');return {hidden:e.hidden,text:e.textContent.trim().toLowerCase(),width:e.getBoundingClientRect().width};});
  assert.equal(chip.hidden,false);assert.equal(chip.text,label);assert.ok(chip.width>0);
 });
 step('I activate the {string} chip',async function(label){
  assert.equal(label,'private');await this.frame('strip').locator('#pillPrivateChip').click();
 });
 step('the private tab closes',async function(){await this.waitForState(s=>!s.tabs.some(t=>t.id===this.privateId));});
 step('a link in the page opens a new tab',async function(){
  this.privateId=await active(this);
  await this.api('navigate',[this.privateId,this.fixtureUrl('private-parent')]);
  await this.waitForState(s=>s.tabs.some(t=>t.id===this.privateId&&t.loadedUrl===this.fixtureUrl('private-parent')&&!t.loading));
  this.beforeChild=new Set((await this.state()).tabs.map(t=>t.id));
  await (await tabPage(this,this.privateId)).evaluate(()=>{const a=document.createElement('a');a.href='/site/private-child';a.target='_blank';document.body.append(a);a.click();});
 });
 step('the new tab is private',async function(){
  const s=await this.waitForState(s=>s.tabs.some(t=>!this.beforeChild.has(t.id)&&!t.loading));
  const child=s.tabs.find(t=>!this.beforeChild.has(t.id));assert.equal(child.private,true);assert.equal(child.sessionPersistent,false);
  const targets=(await this.fixture.browser.send('Target.getTargets')).targetInfos;
  const parent=targets.find(t=>t.url===this.fixtureUrl('private-parent'));
  const opened=targets.find(t=>t.url===this.fixtureUrl('private-child'));
  const ordinary=targets.find(t=>t.url.includes('/host.html'));
  assert.ok(parent?.browserContextId);assert.equal(opened?.browserContextId,parent.browserContextId);
  assert.notEqual(opened.browserContextId,ordinary?.browserContextId);
 });
}
