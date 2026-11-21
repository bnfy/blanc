// Native rail behavior behind the unchanged shipping assertions.
import {tabPage} from './core.mjs';
import {openTabMenu} from './tabs.mjs';
import {nativeId} from '../lib/adapters.mjs';
import {pause} from '../lib/cdp.mjs';
async function activePage(w){return tabPage(w,(await w.snapshot()).activeTabId);}
export const vertical={
 mergeRemoteTabLayout:(w,layout)=>w.native('desktopSyncReceiveLayout',[String(layout)]),
 islandLayoutToggleState:w=>w.frame('overlay').evaluate(()=>{
  const b=document.getElementById('footerTabLayout');
  return b?{title:b.dataset.tooltip??b.title,label:b.getAttribute('aria-label'),pressed:b.getAttribute('aria-pressed')}:null;
 }),
 async clickIslandLayoutToggle(w){
  const b=w.frame('overlay').locator('#footerTabLayout');
  if(!await b.isVisible()||!await b.isEnabled())return false;
  await b.click();return true;
 },
 async pressVerticalTabsShortcut(w){
  const p=w.frame('strip');await p.bringToFront();await p.keyboard.press('Meta+Alt+v');return true;
 },
 async activeWebContentsId(w){return (await activePage(w)).targetId;},
 async activePageState(w){return (await activePage(w)).evaluate(()=>({
  loadCounter:Number(sessionStorage.getItem('acceptance-load-count')||0),
  draft:document.getElementById('acceptance-draft')?.value??null,
 }));},
 async setActivePageDraft(w,value){return (await activePage(w)).evaluate(value=>{
  const input=document.getElementById('acceptance-draft');if(!input)return false;
  input.value=String(value);return true;
 },value);},
 // The retained assertion permits Island or native menus. Observe the real
 // Island menu, including disabled items, as shipping's main-menu reader does.
 async nativeMenuLabels(w){const p=await openTabMenu(w,(await w.snapshot()).activeTabId);
  return p.evaluate(()=>[...document.querySelectorAll('.prototype-tab-menu button')].map(b=>b.textContent));
 },
 beginTabFocusObservation:(w,id)=>w.native('beginTabFocusObservation',[nativeId(id)]),
 async finishTabFocusObservation(w){const s=await w.native('tabFocusObservation',[]);return {count:s.tabFocusCount};},
 async probeFocusAfterTabBroadcast(w,id){
  await pause(450);await w.call('focusTabContents',id);await pause(25);
  await w.native('beginTabFocusObservation',[nativeId(id)]);
  await (await tabPage(w,id)).evaluate(()=>{document.title=`${document.title||'Tab'} · focus probe`;});
  // The native title notification and ordinary Island snapshot both run.
  await pause(500);const s=await w.native('tabFocusObservation',[]);
  return {tabBlurCount:s.tabBlurCount,chromeFocusCount:s.chromeFocusCount};
 },
 railActivationSerial:w=>w.hostEval('window.BlancPrototypeHost.railActivationSerial()'),
};
