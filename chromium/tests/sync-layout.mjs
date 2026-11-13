// Settings Sync visual/geometry checks on the native dialog and local Worker.
// --before captures the existing defect without granting it a passing result.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {createWorld} from './world.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {prepareSyncFixture} from './fork-steps/sync.mjs';
import {inSettings,readSettings} from './adapters/commands.mjs';
const [configFile,out,mode]=process.argv.slice(2),before=mode==='--before';
assertNodeRuntime();if(fs.existsSync(out))throw Error('Refusing to overwrite evidence');fs.mkdirSync(out,{recursive:true});
const config=JSON.parse(fs.readFileSync(configFile)),f=new NativeFixture(),w=createWorld(f);
const result={candidate:config.candidate,mode:before?'before-defect-capture':'after-verification',checks:[],captures:[]};
const open=async()=>{await w.api('openPage',['settings','sync']);await inSettings(w,'sync',()=>({value:true}));await w.waitFor(()=>w.call('settingsSyncPairingDom'),Boolean,'Sync page',15000);};
const audit=()=>readSettings(w,async(_a,d)=>{
 const host=d.find('settings-blanc-sync-page'),root=host.shadowRoot;
 const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
 const visible=e=>!!e&&!e.hidden&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
 const checks=['syncTabsShare','syncSpacesToggle','syncWipe'].map(id=>{const input=root.getElementById(id),label=input.closest('label');
  const text=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())??label.querySelector('span');
  let textBox=null;if(text){const range=document.createRange();range.selectNodeContents(text);textBox=box({getBoundingClientRect:()=>range.getBoundingClientRect()});}
  return {id,input:box(input),label:box(label),text:textBox,labelText:label.textContent.trim(),checked:input.checked};});
 const device=root.getElementById('syncDeviceName'),hint=root.getElementById('syncTurnOffHint'),off=root.getElementById('syncDisable');
 const cr=await import('chrome://resources/js/cr.js');const native=await cr.sendWithPromise('blancSettingsGet');
 return {themeEvents:window.__themeEvents,nativeTheme:native.theme,viewport:{width:innerWidth,height:innerHeight},dark:document.documentElement.dataset.blancAppearance?document.documentElement.dataset.blancAppearance==='dark':matchMedia('(prefers-color-scheme: dark)').matches,
  themeSource:document.documentElement.dataset.blancAppearance?'native-profile-choice':'system-media',background:getComputedStyle(document.documentElement).backgroundColor,
  checks,firstUpload:visible(root.getElementById('syncFirstUpload')),pending:host.state_?.pendingFirstUpload,
  device:device?{value:device.value,box:box(device),label:device.getAttribute('aria-label')}:null,
  deviceName:host.state_?.status?.deviceName,busy:host.busy_,account:root.getElementById('syncAccount').textContent.trim(),hint:hint?{text:hint.textContent.trim(),box:box(hint)}:null,
  off:box(off),content:box(root.querySelector('.sync-content')),scrollWidth:document.documentElement.scrollWidth};
});
try{
 await prepareSyncFixture(w);await f.launch(config,path.join(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-sync-layout-')),'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
 await w.call('seedFavorite',f.base+'/existing','Existing local Favorite');await open();
 assert.equal(await w.call('settingsSyncPairingAct','turn-on'),true);
 await w.waitFor(()=>w.call('settingsSyncPairingDom'),v=>v?.syncOn&&v.handle==='My Blanc'&&v.pendingFirstUpload,'Sync on with explicit first-upload choice',90000);
 assert.equal(await w.call('settingsSyncPairingAct','upload-continue'),true);
 await w.waitFor(()=>w.call('settingsSyncPairingDom'),v=>v?.syncOn&&!v.pendingFirstUpload,'first-upload choice accepted durably',180000);
 await w.call('closeUtilitySurface');await open();
 assert.equal((await audit()).firstUpload,false);
 result.checks.push({name:'accepted first-upload prompt stays hidden after reopening Settings',result:'pass'});
 if(!before){
  await readSettings(w,(_a,d)=>{const input=d.find('settings-blanc-sync-page').shadowRoot.getElementById('syncDeviceName');input.value='Fixture Mac';input.dispatchEvent(new Event('change',{bubbles:true}));});
  await w.waitFor(()=>audit(),v=>v.device?.value==='Fixture Mac'&&v.deviceName==='Fixture Mac'&&!v.busy,'editable device name');
  await w.call('closeUtilitySurface');await open();
  await w.waitFor(()=>audit(),v=>v.device?.value==='Fixture Mac','device name persisted across sheet reopen');
  result.checks.push({name:'device name is separate from account name and survives sheet reopen',result:'pass'});
 }
 await readSettings(w,async()=>{const cr=await import('chrome://resources/js/cr.js');window.__themeEvents=[];cr.addWebUiListener('blanc-settings-changed',s=>window.__themeEvents.push({theme:s.theme,at:Date.now()}));});
 for(const [size,width] of [['narrow',640],['wide',1280]]){
  await w.call('setWindowContentSize',width,900);
  for(const theme of ['light','dark']){
   assert.equal(await w.api('cycleTheme',[theme]),theme);
   const readFile=relative=>{try{return JSON.parse(fs.readFileSync(path.join(f.profile,'Default',relative)));}catch{return null;}};
   const desktop=readFile('BlancSyncDesktop/state.json'),runner=readFile('BlancSync/settings.json');
   console.log(JSON.stringify({phase:'theme-selected',theme,state:await audit(),syncSeen:desktop?.settingsSeen,syncIncoming:desktop?.settingsIncoming,runnerTheme:runner?.values?.theme}));
   if(before){
    // Existing Settings follows system media only, ignoring the explicit
    // profile choice. Emulate that media for before-layout captures; the
    // after run must use the real profile setting without media emulation.
    const target=(await f.targets()).find(t=>t.url.startsWith('chrome://settings/sync'));
    const page=await f.connectTarget(target);
    await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
   }
   await w.waitFor(()=>audit(),v=>v.dark===(theme==='dark'),'rendered '+theme+' theme');
   await readSettings(w,(_a,d)=>{const more=d.find('settings-blanc-sync-page').shadowRoot.getElementById('syncMore');if(more)more.open=true;d.find('settings-blanc-sync-page').shadowRoot.querySelector('.sync-content').scrollIntoView({block:'start',behavior:'instant'});});
   await assertRendering(e=>f.host.eval(e));
   const state=await audit();
   const target=(await f.targets()).find(t=>t.url.startsWith('chrome://settings/sync'));assert.ok(target);
   const page=await f.connectTarget(target);
   const name=`${size}-${theme}.png`;
   const shot=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,name),Buffer.from(shot.data,'base64'));
   result.captures.push({file:name,...state});
   await readSettings(w,(_a,d)=>{const root=d.find('settings-blanc-sync-page').shadowRoot;(root.getElementById('syncMore')??root.getElementById('syncDisable')).scrollIntoView({block:'end',behavior:'instant'});});
   const lower=`${size}-${theme}-turn-off.png`;
   const bottom=await page.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,lower),Buffer.from(bottom.data,'base64'));
   const lowerState=await audit();result.captures.push({file:lower,section:'turn-off',...lowerState});
   if(!before){const row=lowerState.checks.find(c=>c.id==='syncWipe');assert.ok(row.input.y>=0&&row.text.bottom<=lowerState.viewport.height&&lowerState.off.bottom<=lowerState.viewport.height,'turn-off capture includes checkbox, label and button');}
   if(!before){
    for(const row of state.checks){
     assert.ok(row.input.width<=20&&row.input.width>=10,JSON.stringify(row));
     assert.ok(row.input.x-row.label.x<=2,JSON.stringify(row));
     assert.ok(row.text&&row.text.x>=row.input.right+4&&row.text.x<=row.input.right+14,JSON.stringify(row));
     assert.ok(row.text.height<25,JSON.stringify(row));
     assert.ok(row.text.right<=state.viewport.width,JSON.stringify(row));
    }
    assert.equal(state.firstUpload,false);assert.equal(state.account,'My Blanc');assert.ok(state.device);
    assert.equal(state.hint.text,'This device stops syncing. Its favorites and settings stay as they are.');
    assert.ok(state.hint.box.y<=state.off.bottom,'turn-off explanation belongs beside the action');
    result.checks.push({name:`${size} ${theme}: aligned one-line checkboxes and grouped Sync controls`,result:'pass'});
   }
  }
 }
 await w.relaunch();await open();assert.equal((await audit()).firstUpload,false);if(!before)assert.equal((await audit()).device?.value,'Fixture Mac');
 result.checks.push({name:'accepted first-upload prompt stays hidden after browser restart',result:'pass'});
}catch(error){result.checks.push({result:error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail',error:String(error.stack)});process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.checks.push({result:'fail',exit});process.exitCode=1;}
 await w.syncServer?.close();if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 if(f.directory)fs.rmSync(path.dirname(f.directory),{recursive:true,force:true});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({candidate:result.candidate,checks:result.checks,captures:result.captures.map(c=>c.file)}));
}
