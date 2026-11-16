import {inSettings} from './commands.mjs';
import {runtimes} from './tabs.mjs';
import {nativeCall} from '../lib/test-driver.mjs';
import {createProfile,removeProfile} from '../fork-steps/profiles.mjs';

export const linkRouting={
 async settingsLinkRoutes(w,action,...args){
  return inSettings(w,'people',async({action,args},d)=>{
   const host=d.find('settings-people-page'),card=d.find('#linkRoutesCard');
   if(!host||!card)return {value:{ready:false}};
   const rows=()=>[...card.querySelectorAll('.link-route-row')];
   if(action==='state')return {value:{ready:host.blancRouteState_?.ready===true,shown:!card.hidden,
    fallback:card.querySelector('.link-route-fallback').textContent.trim(),rows:rows().map(row=>({
     value:row.querySelector('[data-field="value"]').value,invalid:row.querySelector('[data-field="value"]').getAttribute('aria-invalid')==='true',
     error:row.querySelector('.link-route-error').textContent.trim(),label:row.getAttribute('aria-label'),
    }))}};
   if(action==='add'){
    card.querySelector('#linkRouteAdd').click();await host.updateComplete;return {value:rows().length};
   }
   if(action==='fill'||action==='profile'){
    const field=rows()[args[0]]?.querySelector(`[data-field="${action==='fill'?'value':'profile'}"]`);
    if(!field)return {value:false};field.value=args[1];field.dispatchEvent(new Event('change',{bubbles:true}));
    await host.blancRouteSave_;await host.updateComplete;return {value:true};
   }
   return {missing:'link routing action '+action};
  },{action,args});
 },
 async createProfileWindow(w,name){
  const host=await createProfile(w,name),profileId=host.directory==='Default'?'default':host.directory;
  const windows=await w.call('windowRuntimes'),window=windows.find(r=>r.profileId===profileId);
  if(!window)throw Error('Created native profile has no window');
  return {ok:true,profile:{id:profileId,name:host.name},runtimeId:window.id};
 },
 deleteProfile:async(w,id)=>removeProfile(w,id==='default'?'Default':id),
 async focusWindowRuntime(w,id){
  const runtime=(await runtimes(w)).find(r=>r.id===id);if(!runtime)return false;
  const state=await nativeCall(runtime.cdp,'snapshot');
  const targetId=(await nativeCall(runtime.cdp,'tabTargets'))[String(state.activeTabId)];
  const target=(await w.fixture.targets()).find(t=>t.id===targetId);
  if(!target)return false;
  const page=await w.fixture.connectTarget(target);
  try{await page.send('Page.bringToFront');}finally{page.close();}
  return (await w.waitFor(()=>nativeCall(runtime.cdp,'snapshot'),s=>s.windowActive,'native window focused')).windowActive;
 },
 async clickShieldRouteToggle(w){await w.frame('overlay').locator('#shieldPopRouteToggle').click();return true;},
};
