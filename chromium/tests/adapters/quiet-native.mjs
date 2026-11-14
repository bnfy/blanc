// Native history, lazy restore, quiet lifecycle and the existing scheduler.
import {forkUrl} from './core.mjs';
import {nativeId} from '../lib/adapters.mjs';
async function settled(w,id){return w.waitForState(s=>s.tabs.some(t=>t.id===String(id)&&!t.loading));}
export const quietNative={
 setTabIdleSince:(w,id,ms)=>w.native('quietIdleAge',[nativeId(id),ms]),
 async sessionSyncSnapshot(w){
  const tab=(await w.snapshot()).tabs.find(t=>String(t.id)===String(w.quietCandidateId));
  if(!tab)throw Error('Quiet candidate missing from native tab model');
  // Wait for the real utility process to acknowledge this native snapshot.
  // This is the actual sync input, not a locally manufactured URL-only list.
  return w.waitFor(()=>w.native('quietSyncSnapshot'),v=>Array.isArray(v)&&
   v[0].some(t=>t.url===tab.url),'quiet tab in runner-accepted sync snapshot');
 },
 async navigateTab(w,id,url){await w.native(/^https?:/i.test(url)?'navigate':'testNavigateTabAnyScheme',[nativeId(id),forkUrl(url)]);await settled(w,id);return true;},
 tabNavigation:(w,id)=>w.native('quietNavigation',[nativeId(id)]),
 sleepState:(w,id)=>w.native('quietSleepState',[nativeId(id)]),
 async wakeTab(w,id,url){
  if(url)await w.native('navigate',[nativeId(id),url]);
  else await w.native('switchTab',[nativeId(id)]);
  await settled(w,id);return true;
 },
 async wakeTabAtIndex(w,id,index){
  await w.native('quietHistoryIndex',[nativeId(id),index]);
  await w.native('switchTab',[nativeId(id)]);await settled(w,id);return true;
 },
 setSleepThresholdOverride:(w,ms)=>w.native('quietThreshold',[ms]),
 async runSleepSweep(w){
  w.app.releasePages();const before=await w.snapshot();
  await w.native('quietSweep');const after=await w.snapshot();
  return {quieted:after.tabs.filter(t=>t.asleep&&!before.tabs.find(b=>b.id===t.id)?.asleep).map(t=>String(t.id))};
 },
 async createQuietTab(w,url,title){return String(await w.native('createQuietTab',[url,title]));},
 setTabSleep:async(w,delay)=>w.native('quietDelay',[(await w.snapshot()).activeTabId,delay]),
 tabSleep:async w=>w.native('quietDelay',[(await w.snapshot()).activeTabId]),
};
