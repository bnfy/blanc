import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {inSettings} from '../adapters/commands.mjs';
import {nativeCall,installDriver} from '../lib/test-driver.mjs';
import {jsLiteral} from '../lib/js-literal.mjs';
const deep=`const find=(selector,root=document)=>{const own=root.querySelector(selector);if(own)return own;for(const el of root.querySelectorAll('*'))if(el.shadowRoot){const found=find(selector,el.shadowRoot);if(found)return found;}return null;};`;
const evaluate=(page,source)=>page.eval(`(()=>{${deep}${source}})()`);
async function documentAt(w,prefix){
 const target=await w.waitFor(async()=>(await w.fixture.targets()).find(t=>t.url.startsWith(prefix)),Boolean,prefix+' document');
 return w.fixture.connectTarget(target);
}
export async function profileHosts(w){
 w.profileHosts??=new Map();
 const targets=(await w.fixture.targets()).filter(t=>t.url==='chrome://blanc-prototype/host.html');
 const out=[];
 for(const target of targets){
  let cdp=w.profileHosts.get(target.id);
  if(!cdp){
   cdp=target.id===w.fixture.hostTargetId?w.fixture.host:await w.fixture.connectTarget(target);
   if(cdp!==w.fixture.host)await installDriver(cdp);
   w.profileHosts.set(target.id,cdp);
  }
  const info=await nativeCall(cdp,'profileInfo');out.push({...info,cdp,targetId:target.id});
 }
 return out;
}
async function profile(w,name){const accepts=p=>name==='Personal'?p.directory==='Default':p.name===name;const hosts=await w.waitFor(()=>profileHosts(w),items=>items.some(accepts),name+' profile window');return hosts.find(accepts);}
export async function picker(w){
 const exists=(await w.fixture.targets()).some(t=>t.url.startsWith('chrome://profile-picker'));
 if(!exists)await inSettings(w,'people',async(a,d)=>{const end=Date.now()+8000;let row;while(!(row=d.find('#blancProfiles'))){if(Date.now()>end)return {missing:'Profiles row'};await new Promise(r=>setTimeout(r,50));}row.click();return {value:true};});
 const page=await documentAt(w,'chrome://profile-picker');
 await w.waitFor(()=>evaluate(page,'return !!find("#addProfile");'),Boolean,'profile picker Add');return page;
}
export async function createProfile(w,name){
 const pick=await picker(w);await evaluate(pick,'find("#addProfile").click();return true;');
 const custom=await documentAt(w,'chrome://profile-customization');
 await w.waitFor(()=>evaluate(custom,'return !!find("#nameInput");'),Boolean,'profile name');
 await evaluate(custom,`const input=find('#nameInput');input.value=${jsLiteral(name)};input.dispatchEvent(new CustomEvent('value-changed',{detail:{value:input.value},bubbles:true,composed:true}));return true;`);
 await w.waitFor(()=>evaluate(custom,'return {name:find("profile-customization-app").profileName_,disabled:find("#doneButton").disabled};'),v=>v.name===name&&!v.disabled,'profile Done enabled for requested name');
 await evaluate(custom,'find("#doneButton").click();return true;').catch(error=>{if(!/closed/.test(String(error)))throw error;});
 return profile(w,name);
}
async function open(w,host,url,privateTab=false){
 const before=(await nativeCall(host.cdp,'snapshot')).tabs.map(t=>String(t.id));
 await host.cdp.eval(`window.BlancPrototypeHost.api.createTab(${jsLiteral(url)},{private:${privateTab}})`);
 const snap=await w.waitFor(()=>nativeCall(host.cdp,'snapshot'),s=>s.tabs.some(t=>!before.includes(String(t.id))&&t.url===url&&!t.isLoading),'profile page load');
 return String(snap.tabs.find(t=>!before.includes(String(t.id))&&t.url===url).id);
}
async function pageScript(w,host,id,script){
 const targets=await nativeCall(host.cdp,'tabTargets');
 const target=(await w.fixture.targets()).find(t=>t.id===targets[id]);
 const page=await w.fixture.connectTarget(target);try{return await page.eval(script);}finally{page.close();}
}
export default function register(step){
 step('Personal profile settings are open',async function(){
  assert.equal((await this.native('profileInfo')).directory,'Default');
  await this.api('openPage',['settings','profiles']);
 });
 step('I create a local profile named {string} from Settings',async function(name){await createProfile(this,name);});
 step('the Work profile owns a separate window',async function(){
  const personal=await profile(this,'Personal'),work=await profile(this,'Work');
  assert.notEqual(personal.targetId,work.targetId);assert.notEqual(personal.directory,work.directory);
 });
 step('I save distinct Favorites in Personal and Work',async function(){
  this.profileFavorites={};
  for(const name of ['Personal','Work']){
   const host=await profile(this,name),url=this.fixtureUrl('favorite-'+name.toLowerCase());
   const id=await open(this,host,url);await host.cdp.eval('window.BlancPrototypeHost.refresh()');assert.equal(await host.cdp.eval(`window.BlancPrototypeHost.api.toggleBookmark(${jsLiteral(id)})`),true);
   this.profileFavorites[name]=url;
  }
 });
 step('each profile sees only its own Favorites',async function(){
  for(const name of ['Personal','Work']){
   const host=await profile(this,name);
   const favorites=await host.cdp.eval('window.BlancPrototypeHost.api.listFavorites()');
   assert.deepEqual(favorites.map(f=>f.url),[this.profileFavorites[name]]);
  }
 });
 step('I open normal and private tabs in Work',async function(){
  const url=this.fixtureUrl('profile-cookie-probe'),personal=await profile(this,'Personal'),work=await profile(this,'Work');
  this.profileSessionProbes=[];
  for(const [name,host,privateTab] of [['personal',personal,false],['work',work,false],['private',work,true]]){
   const id=await open(this,host,url,privateTab);
   const before=await pageScript(this,host,id,'({cookie:document.cookie,storage:localStorage.getItem("q5-profile")})');
   assert.equal(before.cookie,'');assert.equal(before.storage,null);
   await pageScript(this,host,id,`document.cookie='q5_profile=${name}; path=/';localStorage.setItem('q5-profile',${jsLiteral(name)});true`);
   this.profileSessionProbes.push({name,host,id});
  }
 });
 step('both Work sessions are isolated from Personal',async function(){
  for(const {name,host,id} of this.profileSessionProbes){
   assert.deepEqual(await pageScript(this,host,id,'({cookie:document.cookie,storage:localStorage.getItem("q5-profile")})'),{cookie:'q5_profile='+name,storage:name});
  }
 });
 step('a saved Work profile workspace',async function(){
  const work=await createProfile(this,'Work'),personal=await profile(this,'Personal');
  this.profileRestore=[];
  for(const host of [personal,work]){
   const url=this.fixtureUrl('restore-'+host.directory),id=await open(this,host,url);
   await host.cdp.eval(`window.BlancPrototypeHost.api.groupTabByName(${jsLiteral(id)},'Profile session')`);
   await this.waitFor(()=>nativeCall(host.cdp,'snapshot'),s=>s.tabs.every(t=>!t.isLoading),'all profile tabs loaded');
   const saved=await host.cdp.eval(`window.BlancPrototypeHost.api.saveWorkspaceAs('Profile workspace')`);
   assert.equal(saved.ok,true,JSON.stringify(saved));
   this.profileRestore.push({directory:host.directory,name:host.name,url,spaceId:saved.workspaceId});
  }
  // V18: the native picker asks on startup by default with multiple profiles.
  // Choose its ordinary automatic-start option before testing restoration.
  const pick=await picker(this);
  await evaluate(pick,`const ask=find('#askOnStartup');if(ask.checked)ask.click();return true;`);
  await this.waitFor(()=>evaluate(pick,`return find('#askOnStartup').checked;`),v=>v===false,'profile picker disabled on startup');
  await evaluate(pick,`const main=find('profile-picker-main-view');const card=[...main.shadowRoot.querySelectorAll('profile-card')].find(c=>c.profileState.profilePath.endsWith('/Default'));if(!card)throw Error('Personal card missing');find('#profileCardButton',card.shadowRoot).click();return true;`);
 });
 step('I relaunch Blanc with local profiles',async function(){this.profileHosts=new Map();await this.relaunch({afterStop:async()=>{const root=this.fixture.profile;const local=JSON.parse(fs.readFileSync(path.join(root,'Local State')));assert.deepEqual([...local.profile.last_active_profiles].sort(),this.profileRestore.map(p=>p.directory).sort(),'both persistent profiles saved for startup');}});});
 step('Personal and Work restore with their original profile identities',async function(){
  const hosts=await this.waitFor(()=>profileHosts(this),h=>this.profileRestore.every(p=>h.some(x=>x.directory===p.directory)),'both profile windows restored');
  for(const expected of this.profileRestore){
   const host=hosts.find(p=>p.directory===expected.directory);assert.equal(host.name,expected.name);
   // The window appears first; its Space is bound as the restore settles.
   const snap=await this.waitFor(()=>nativeCall(host.cdp,'snapshot'),s=>s.spaceName===expected.spaceId&&s.tabs.some(t=>t.url===expected.url),'restored profile window with its Space',10000).catch(()=>nativeCall(host.cdp,'snapshot'));
   assert.ok(snap.tabs.some(t=>t.url===expected.url));
   assert.equal(snap.spaceName,expected.spaceId);
   assert.equal(snap.tabs.some(t=>this.profileRestore.some(p=>p.directory!==host.directory&&p.url===t.url)),false);
  }
 });
}
// V18's native delete dialog has Cancel/Remove, not a typed-name challenge.
// Verify that native behavior separately; do not count the incompatible
// shipping wrong-confirmation scenario as a pass.
export async function verifyNativeProfileRemoval(w){
 const work=await createProfile(w,'Work');
 await open(w,work,w.fixtureUrl('profile-removal'));
 assert.equal((await work.cdp.eval("window.BlancPrototypeHost.api.saveWorkspaceAs('Delete with profile')")).ok,true);
 const pick=await picker(w);
 const cardPrefix=`const cards=[...find('profile-picker-main-view').shadowRoot.querySelectorAll('profile-card')];`;
 const cardFor=name=>cardPrefix+`const card=cards.find(c=>c.profileState.localProfileName===${jsLiteral(name)});if(!card)throw Error('Profile card missing');`;
 await evaluate(pick,cardFor('Work')+`const input=find('#nameInput',card.shadowRoot);input.value='Studio';input.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
 await w.waitFor(()=>nativeCall(work.cdp,'profileInfo'),v=>v.name==='Studio','native profile renamed');
 const openRemove=async()=>{
  await evaluate(pick,cardFor('Studio')+`const menu=find('profile-card-menu',card.shadowRoot);find('#moreActionsButton',menu.shadowRoot).click();find('#actionMenu',menu.shadowRoot).querySelectorAll('button')[1].click();return true;`);
  await w.waitFor(()=>evaluate(pick,cardFor('Studio')+`return find('#removeConfirmationDialog',card.shadowRoot).open;`),Boolean,'native delete confirmation');
 };
 await openRemove();
 const typed=await evaluate(pick,cardFor('Studio')+`return !!find('#removeConfirmationDialog',card.shadowRoot).querySelector('input,cr-input');`);
 assert.equal(typed,false,'record V18 native confirmation construction');
 await evaluate(pick,cardFor('Studio')+`find('#removeConfirmationDialog',card.shadowRoot).querySelector('.cancel-button').click();return true;`);
 assert.equal((await nativeCall(work.cdp,'profileInfo')).name,'Studio');
 await openRemove();
 await evaluate(pick,cardFor('Studio')+`find('#removeConfirmationButton',card.shadowRoot).click();return true;`);
 await w.waitFor(()=>profileHosts(w),hosts=>!hosts.some(h=>h.directory===work.directory),'deleted profile windows gone');
 return {directory:work.directory,checks:['created through picker','renamed in picker and native profile','Cancel preserves profile','Remove closes profile windows'],typedNameConfirmation:false};
}

// V18's native confirmation: choose the actual registered profile card and
// press Remove. The shipping routing case does not assert a typed challenge.
export async function removeProfile(w,directory){
 const pick=await picker(w);
 const prefix=`const cards=[...find('profile-picker-main-view').shadowRoot.querySelectorAll('profile-card')];const card=cards.find(c=>c.profileState.profilePath.endsWith('/'+${jsLiteral(directory)}));if(!card)throw Error('Native profile card missing');`;
 await evaluate(pick,prefix+`const menu=find('profile-card-menu',card.shadowRoot);find('#moreActionsButton',menu.shadowRoot).click();find('#actionMenu',menu.shadowRoot).querySelectorAll('button')[1].click();return true;`);
 await w.waitFor(()=>evaluate(pick,prefix+`return find('#removeConfirmationDialog',card.shadowRoot).open;`),Boolean,'native profile remove confirmation');
 await evaluate(pick,prefix+`find('#removeConfirmationButton',card.shadowRoot).click();return true;`);
 await w.waitFor(()=>profileHosts(w),hosts=>!hosts.some(h=>h.directory===directory),'deleted profile windows gone');
 return {ok:true};
}
