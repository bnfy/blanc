// F62 default page zoom over Chromium's own zoom: the profile's default page
// zoom, its per-site levels (HostZoomMap, saved in that profile's
// Preferences) and the Page zoom menu and Zoom levels list Chromium's
// Settings already has, shown in Blanc's Settings sheet.
import {nativeCall} from '../lib/test-driver.mjs';
import {inSettings} from './commands.mjs';
import {runtimes} from './tabs.mjs';
import {tabPage} from './core.mjs';
import {shippingPageUrl} from '../lib/page-shim.mjs';

const zoomTest=(w,...args)=>w.native('pageZoomTest',args);
const nativeId=id=>Number(id);
const DEEP=`const all=(sel,root=document,out=[])=>{out.push(...root.querySelectorAll(sel));for(const el of root.querySelectorAll('*'))if(el.shadowRoot)all(sel,el.shadowRoot,out);return out;};`;
const ROWS=`(()=>{${DEEP}return all('zoom-levels .list-item, .list-item').filter(r=>r.closest?.('#list')||r.parentElement?.id==='list')
 .map(r=>({name:r.querySelector('.url-directionality')?.textContent.trim(),detail:r.querySelector('.zoom-label')?.textContent.trim()}))
 .filter(r=>r.name);})()`;
async function runtime(w,id){
 const r=(await runtimes(w)).find(x=>x.id===String(id));if(!r)throw Error('No window '+id);return r;
}
// The settings page a window's sheet shows, connected directly.
async function sheetTarget(w){
 const target=(await w.fixture.targets()).find(t=>t.type==='page'&&/^chrome:\/\/settings\//.test(t.url));
 return target?w.fixture.connectTarget(target):null;
}
async function zoomLevelRows(w){
 const cdp=await sheetTarget(w);if(!cdp)return [];
 if(!/^chrome:\/\/settings\/content\/zoomLevels/.test(await cdp.eval('location.href')))
  await cdp.eval(`location.href='chrome://settings/content/zoomLevels';1`).catch(()=>{});
 const until=Date.now()+8000;let rows=[];
 while(Date.now()<until){
  rows=await cdp.eval(ROWS).catch(()=>[]);
  if(rows.length)break;await new Promise(r=>setTimeout(r,100));
 }
 return rows;
}
export const zoom={
 setPageZoom:(w,percent)=>zoomTest(w,'default',Number(percent)),
 pageZoom:w=>zoomTest(w,'default'),
 siteZoomSites:w=>zoomTest(w,'sites'),
 async clearSiteZoom(w){await zoomTest(w,'clear');return true;},
 chromiumZoomHosts:w=>zoomTest(w,'prefsHosts'),
 async zoomPercent(w,id){return (await zoomTest(w,'tab',nativeId(id)))?.percent??null;},
 async zoomMode(w,id){return (await zoomTest(w,'tab',nativeId(id)))?.mode??null;},
 // What the page is drawn at: its view's width over the page's own width in
 // CSS pixels, as shipping measures it.
 async drawnZoomPercent(w,id){
  const tab=await zoomTest(w,'tab',nativeId(id));if(!tab?.width)return null;
  const inner=await (await tabPage(w,id)).evalExpression('innerWidth').catch(()=>null);
  return inner?Math.round(100*tab.width/inner):null;
 },
 crashTabRenderer:(w,id)=>zoomTest(w,'crash',nativeId(id)),
 // The tab's address; a crashed page reads as shipping's crash page.
 async tabUrl(w,id){
  // Any window's tab: the Work profile's window is not the primary one.
  const tab=await zoomTest(w,'tab',nativeId(id));if(!tab)return null;
  if(tab.crashed)return `blanc://error/?kind=crash&url=${encodeURIComponent(tab.url)}`;
  return shippingPageUrl(tab.url);
 },
 // Chromium's Settings → Appearance → Page zoom, in Blanc's Settings sheet.
 settingsChoosePageZoom:(w,percent)=>inSettings(w,'appearance',async(a,d)=>{
  const select=d.find('#zoomLevel');if(!select)return {missing:'#zoomLevel'};
  const option=[...select.options].find(o=>Math.round(Number(o.value)*100)===a.percent);
  if(!option)return {value:false};
  select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));
  return {value:true};
 },{percent:Number(percent)}),
 // Chromium's Zoom levels list (Site settings), the saved sites with Remove.
 settingsSiteZoomRows:w=>zoomLevelRows(w),
 async settingsRemoveSiteZoom(w,host){
  const cdp=await sheetTarget(w);if(!cdp)return false;
  await zoomLevelRows(w);
  return cdp.eval(`(()=>{${DEEP}const row=all('.list-item').find(r=>r.querySelector('.url-directionality')?.textContent.trim()===${JSON.stringify(host)});
   const button=row?.querySelector('cr-icon-button.icon-clear');if(!button)return false;button.click();return true;})()`);
 },
 async activateTabInWindow(w,runtimeId,tabId){
  const r=await runtime(w,runtimeId);await nativeCall(r.cdp,'switchTab',[nativeId(tabId)]);return true;
 },
 async zoomInWindow(w,runtimeId){
  const r=await runtime(w,runtimeId);return (await nativeCall(r.cdp,'previewPageCommand',['zoomIn']))!==false;
 },
 async openSettingsInWindow(w,runtimeId){
  const r=await runtime(w,runtimeId);await r.cdp.eval(`window.BlancPrototypeHost.api.openPage('settings')`);
  await w.waitFor(()=>sheetTarget(w),Boolean,'the Work window settings sheet',8000);return true;
 },
 async settingsSiteZoomRowsInWindow(w){return (await zoomLevelRows(w)).map(r=>r.name);},
 async closeUtilitySurfaceInWindow(w,runtimeId){
  const r=await runtime(w,runtimeId);await r.cdp.eval('window.BlancPrototypeHost.closeSheet()');return true;
 },
};
