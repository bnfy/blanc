// Shipping hook adapters for the tabs area (see tests/adapters/core.mjs):
// windows, closed entries, the group and tab menus, Shield and site
// controls, and the chrome-document guards.
import {UndefinedNativeAdapterError,nativeId} from '../lib/adapters.mjs';
import {installDriver,nativeCall} from '../lib/test-driver.mjs';
import {waitFor} from '../lib/cdp.mjs';
import {shippingPageUrl} from '../lib/page-shim.mjs';
import {tabPage} from './core.mjs';
import {inSettings} from './commands.mjs';
import {jsLiteral} from '../lib/js-literal.mjs';
const HOST='chrome://blanc-prototype/host.html';
// A record whose absent fields raise instead of reading undefined. Shallow:
// nested arrays stay plain so shipping's deepEqual can compare them (a
// recursive observedState proxy fails deepStrictEqual's .size probe).
export function strict(record,label){
 return new Proxy(record,{get(t,k,r){
  if(typeof k==='symbol'||k in t||k==='then'||k==='toJSON')return Reflect.get(t,k,r);
  throw new UndefinedNativeAdapterError('Native snapshot adapter does not expose '+label+'.'+String(k));
 }});
}
const same=(a,b)=>String(a).toLocaleLowerCase()===String(b).toLocaleLowerCase();
// Shipping's exception-list hostname (shield-model blockableHostname).
export function blockableHostname(url){
 try{const u=new URL(url);if(u.protocol!=='http:'&&u.protocol!=='https:')return null;return u.hostname.toLowerCase().replace(/^www\./,'')||null;}catch{return null;}
}
// A shipping closed-entry summary from the native TabRestoreService row
// (oldest first, like Electron's per-window list). The fork exposes no entry
// kind; the live-view flag comes from the native parked-page holder.
export const closedSummary=e=>({id:String(e.id),url:e.url||null,tabCount:e.tabCount,...(typeof e.held==='boolean'?{held:e.held}:{})});
// A window runtime as shipping's windowRuntimeSnapshots() shapes it, from
// that window's own native snapshot. Profile, title, closed count (the fork's
// closed list is profile-wide) and Spaces residency have no per-window source.
export function runtimeRecord(id,snapshot){
 const tabs=snapshot.tabs.map(t=>({id:String(t.id),url:shippingPageUrl(t.url),private:!!t.private}));
 return {id,tabOrder:tabs.map(t=>t.id),activeTabId:snapshot.activeTabId==null?null:String(snapshot.activeTabId),
  glanceTabId:snapshot.glanceTabId==null?null:String(snapshot.glanceTabId),workspaceId:snapshot.spaceName||null,tabs,
  groups:(snapshot.groups||[]).map(g=>({id:String(g.id),name:g.name,collapsed:!!g.collapsed,color:g.color||null})),attached:true};
}
// Shipping tab-menu item ids, by the i18n keys the fork's Island menu
// (adapter.js) and shipping's model both label them with.
export const MENU_KEYS={
 'toggle-start-pin':['tabMenu.pinStartPage','tabMenu.unpinStartPage'],
 'return-pinned-home':['tabMenu.returnPinnedHome'],'set-pinned-home':['tabMenu.setPinnedHome'],
 'toggle-pin':['tabMenu.pin','tabMenu.unpin','tabMenu.pinSplit','tabMenu.unpinSplit'],
 'toggle-mute':['tabMenu.mute','tabMenu.unmute'],'toggle-site-mute':['tabMenu.muteSite','tabMenu.unmuteSite'],
 'toggle-favorite':['tabMenu.saveFavorite','tabMenu.removeFavorite'],'reload':['menu.reload'],
 'new-tab-below':['tabMenu.newTabBelow'],'close-above':['tabMenu.closeAbove'],'close-below':['tabMenu.closeBelow'],
 'close':['menu.closeTab'],'remove-from-split':['tabMenu.removeFromSplit'],'close-split':['tabMenu.closeSplit'],
 'copy-link':['tabMenu.copyLink'],'duplicate':['tabMenu.duplicate'],'rename':['tabMenu.rename'],'reset-title':['tabMenu.resetTitle'],
 'close-others':['tabMenu.closeOthers'],'new-tab':['menu.newTab'],'new-private-tab':['menu.newPrivateTab'],
 'glance':['tabMenu.glance'],'quiet':['tabMenu.quiet'],'group':['tabMenu.moveToGroup'],'space':['tabMenu.moveToSpace'],
 'send-to':['tabMenu.sendToDevice'],'split-with':['tabMenu.splitWith'],
};
// ---- windows: each native window has its own Island host target ----
async function primaryTargetId(w){
 return w._primaryTarget??=(await w.fixture.host.send('Target.getTargetInfo')).targetInfo.targetId;
}
// A window's reported id is its position in SessionID order ('primary' for
// the lowest, 'window-N' after), not its raw DevTools target id: a relaunch
// reassigns every target id but restores windows in save order, so this
// stays meaningful across one (native windowOrdinals; F32). The CDP
// connection to actually drive a window is still matched by its real
// target id, independent of that label.
export async function runtimes(w){
 const primary=await primaryTargetId(w);w._hosts??=new Map();
 const ordered=await w.native('windowOrdinals');
 const hosts=(await w.fixture.targets()).filter(t=>t.url===HOST);
 const out=[];
 for(const t of hosts){
  let cdp=t.id===primary?w.fixture.host:w._hosts.get(t.id);
  if(!cdp){cdp=await w.fixture.connectTarget(t);await installDriver(cdp);w._hosts.set(t.id,cdp);}
  const index=ordered.indexOf(t.id);
  out.push({id:index===0?'primary':index>0?`window-${index+1}`:t.id,cdp});
 }
 // Shipping lists runtimes in creation order, primary first; DevTools lists
 // targets newest first.
 out.reverse();out.sort((a,b)=>(b.id==='primary')-(a.id==='primary'));
 return out;
}
async function runtime(w,id){
 const r=(await runtimes(w)).find(r=>r.id===String(id));if(!r)throw Error('Unknown window runtime '+id);return r;
}
const snap=r=>nativeCall(r.cdp,'snapshot');
// ---- Island documents ----
const strip=w=>w.frame('strip'),overlay=w=>w.frame('overlay');
const overlayShown=w=>w.hostEval(`!document.getElementById('overlay').hidden`);
// Settings → Privacy and security's list (S1.7), through the settings sheet
// as a person reaches it; a Settings tab would move into the sheet anyway.
// Read through a test op: opening Settings would close an open popover.
const exceptionRows=async w=>(await w.native('blockingExceptions',[])).map(String);
async function activeTab(w){const s=await w.snapshot();return s.tabs.find(t=>String(t.id)===String(s.activeTabId))??null;}
// The fork's Island tab menu: a real right-click on the tab's row in the
// ⌘L panel, read back as rendered buttons.
export async function openTabMenu(w,tabId){
 if(!await overlayShown(w))await w.hostEval('window.BlancPrototypeHost.open(false)');
 const page=overlay(w);
 // A split is one row; its tabs are listed under its disclosure.
 const split=(await w.state()).splits.find(s=>s.tabIds.includes(String(tabId)));
 if(split){const splitRow=page.locator(`#islandList .split-row[data-split-id="${split.id}"]`);await splitRow.first().waitFor({state:'visible'});
  const disclosure=splitRow.locator('.split-row-disclosure:not(.open)');
  if(await disclosure.count())await disclosure.first().click();}
 const row=page.locator(`#islandList ${split?'.in-split':''}[data-tab-id="${String(tabId)}"]`).first();
 await row.click({button:'right'});
 await page.locator('.prototype-tab-menu').waitFor({state:'visible'});
 return page;
}
async function menuItem(w,tabId,itemId){
 const keys=MENU_KEYS[itemId];
 if(!keys)throw new UndefinedNativeAdapterError('No label mapping for shipping tab-menu item '+itemId);
 const page=await openTabMenu(w,tabId);
 const item=await page.evaluate(keys=>{
  const labels=new Set(keys.map(k=>window.blancI18n.t(k)));
  const buttons=[...document.querySelectorAll('.prototype-tab-menu button')];
  const i=buttons.findIndex(b=>labels.has(b.textContent));
  return i<0?null:{index:i,label:buttons[i].textContent,enabled:!buttons[i].disabled};
 },keys);
 return {page,item};
}
const domRead=(page,fn)=>page.evaluate(fn);
// Shipping's test actions on Spaces, through the host's bridge as the menu calls it.
async function spaceAction(api,action,args){
 const withRecord=result=>result?.workspaceId?{...result,workspace:{id:result.workspaceId}}:result;
 if(action==='list')return api('listWorkspaces',[]);
 if(action==='save')return withRecord(await api('saveWorkspaceAs',[args[0],args[1]]));
 if(action==='open')return api('openWorkspace',[args[0],args[1]??{}]);
 if(action==='create')return withRecord(await api('createBlankWorkspace',[args[0],args[1]??{}]));
 if(action==='remove')return api('removeWorkspace',[args[0]]);
 if(action==='undo-remove')return api('undoRemoveWorkspace',[args[0]]);
 if(action==='update')return api('updateWorkspace',[args[0],args[1]]);
 if(action==='flush')return {ok:true};
 if(action==='reset'){const p=await api('listWorkspaces',[]);for(const item of p.items)await api('removeWorkspace',[item.id]);
  for(const item of (await api('listWorkspaces',[])).deleted)await api('forgetWorkspace',[item.id]);return {ok:true};}
 throw new UndefinedNativeAdapterError('Space action needs an adapter: '+action);
}
export const tabs={
 selectTabRows:(w,id,mode)=>w.api('selectTab',[id==null?null:String(id),mode]),
 selectedTabIds:async w=>(await w.api('getAllTabs')).selectedTabIds,
 runSelectedTabsAction:(w,action,options={})=>{
  if(!['batch-close','batch-pin','batch-mute','batch-group-new','batch-group-move','batch-group-none','batch-quiet','batch-reload','batch-copy','batch-space-new','batch-space-move','batch-new-window'].includes(action))
   throw new UndefinedNativeAdapterError('Batch operation is not built: '+action);
  return w.api('runSelectedTabsAction',[action,options]);
 },
 // Windows (F32). The primary window keeps shipping's id 'primary'; others
 // are 'window-2', 'window-3' etc. by SessionID order (see runtimes()).
 async windowRuntimes(w){
  const out=[];for(const r of await runtimes(w))out.push(strict(runtimeRecord(r.id,await snap(r)),'windowRuntime'));
  return out;
 },
 // Chromium's own new-window path (Cmd+N is an accelerator CDP cannot press).
 async openNewWindow(w){
  const before=new Set((await runtimes(w)).map(r=>r.id));
  await w.fixture.browser.send('Target.createTarget',{url:'chrome://newtab/',newWindow:true});
  const r=await waitFor(async()=>(await runtimes(w)).find(r=>!before.has(r.id)),Boolean,'new window Island');
  await waitFor(()=>snap(r),s=>s.tabs.length>0&&s.tabs.every(t=>!t.isLoading),'new window tab');
  return r.id;
 },
 // Chromium's own Close Window command, run by that window's Island. Its
 // reply can be lost as the window goes, so the result is the window leaving.
 async closeWindowRuntime(w,id){
  const r=await runtime(w,id);
  const reply=await nativeCall(r.cdp,'previewPageCommand',['closeWindow'],null,5000).catch(e=>/closed|timed out/i.test(e.message)?'gone':Promise.reject(e));
  if(reply===false)return false;
  await waitFor(async()=>!(await runtimes(w)).some(x=>x.id===r.id),Boolean,'window '+id+' to close');
  return true;
 },
 async openTabInWindow(w,id,url,options){
  if(options&&Object.keys(options).length){
   if(Object.keys(options).some(k=>k!=='private'))throw new UndefinedNativeAdapterError('Tab creation options need an adapter: '+Object.keys(options));
   if(options.private){
    const r=await runtime(w,id);const known=new Set((await snap(r)).tabs.map(t=>String(t.id)));
    await r.cdp.eval(`window.BlancPrototypeHost.api.createTab(${jsLiteral(url)},${jsLiteral(options)})`);
    const s=await waitFor(()=>snap(r),s=>s.tabs.some(t=>t.private&&!known.has(String(t.id))&&!t.isLoading),'private tab in window '+id);
    return String(s.tabs.find(t=>t.private&&!known.has(String(t.id))).id);
   }
  }
  const r=await runtime(w,id);const tabId=String((await nativeCall(r.cdp,'createTab',[url])).tabId);
  await waitFor(()=>snap(r),s=>s.tabs.some(t=>String(t.id)===tabId&&!t.isLoading),'tab in window '+id);
  return tabId;
 },
 async closeTabInWindow(w,runtimeId,tabId){
  const r=await runtime(w,runtimeId);
  if(!(await snap(r)).tabs.some(t=>String(t.id)===String(tabId)))return false;
  await nativeCall(r.cdp,'closeTab',[Number(tabId)]);
  await waitFor(()=>snap(r),s=>!s.tabs.some(t=>String(t.id)===String(tabId)),'tab close in window');
  return true;
 },
 async reopenClosedInWindow(w,runtimeId){
  const r=await runtime(w,runtimeId);const before=String((await snap(r)).activeTabId);
  await nativeCall(r.cdp,'reopenClosedTab');
  const after=await waitFor(()=>snap(r),s=>!s.tabs.some(t=>t.isLoading),'reopen in window');
  return String(after.activeTabId)!==before?String(after.activeTabId):null;
 },
 moveTabToNewWindow:(w,id)=>w.api('moveTabToNewWindow',[String(id)]),
 async pinnedHome(w,id){
  for(const host of await runtimes(w)) {
   const tab=(await snap(host)).tabs.find(t=>String(t.id)===String(id));
   if(tab)return tab.pinnedHomeUrl??null;
  }
  throw Error('Missing native tab '+id);
 },
 setPinnedHome:(w,id)=>w.api('setPinnedHome',[String(id)]),
 returnPinnedHome:(w,id)=>w.api('returnPinnedHome',[String(id)]),
 async persistedSessionData(w){
  const data=await w.native('sessionWindows');
  for(const window of data.windows)for(const tab of window.tabs)for(const entry of tab.navigations){
   if(entry.pageStateBytes!==0)throw Error('Persisted navigation contains recovery page state: '+entry.pageStateBytes+' bytes');
  }
  return data;
 },
 // Closed entries (F2).
 async closedEntriesSummary(w){return (await w.snapshot()).closed.map(e=>strict(closedSummary(e),'closedEntry'));},
 // The tab payload the Island renders from: the host's processed snapshot.
 async serializedTabsPayload(w){
  await w.hostEval('window.BlancPrototypeHost.refresh()');
  return (await w.hostEval('window.BlancPrototypeHost.api.getAllTabs()')).tabs.map(t=>strict(t,'serializedTab'));
 },
 // Groups (F3).
 async setGroupColorByName(w,name,color){
  const g=(await w.snapshot()).groups.find(g=>same(g.name,name));if(!g)return false;
  try{return (await w.api('setGroupColor',[g.id,color]))===true;}
  catch(e){if(/Unknown group color/.test(e.message))return false;throw e;}
 },
 // F46: shipping's hooks for Rename Tab… and Reset Tab Title (null resets).
 beginRenameTab:(w,id)=>w.api('beginRenameTab',[String(id)]),
 renameTab:(w,id,name)=>w.api('renameTab',[String(id),name==null?'':String(name)]),
 async beginRenameGroupByName(w,name){
  const g=(await w.snapshot()).groups.find(g=>same(g.name,name));if(!g)return false;
  await w.api('beginRenameGroup',[g.id]);return true;
 },
 // Tab menu (F2/F46): the Island's own menu, by real right-click and click.
 async tabMenuItem(w,tabId,itemId){
  const {page,item}=await menuItem(w,tabId,itemId);
  await page.keyboard.press('Escape');
  return item&&{label:item.label,enabled:item.enabled};
 },
 async runTabMenuItem(w,tabId,itemId,options){
  // Split with ▸ opens its list in place; the pick is the tab it names.
  if(itemId==='split-with-tab'){
   const {page,item}=await menuItem(w,tabId,'split-with');
   if(!item?.enabled){await page.keyboard.press('Escape');return false;}
   await page.locator('.prototype-tab-menu button').nth(item.index).click();
   await page.locator(`.prototype-tab-menu button[data-tab-id="${String(options.otherTabId)}"]`).click();
   return true;
  }
  // Move to Space ▸ (F41): its list names each Space, then New Space….
  if(itemId==='space-move'||itemId==='space-new'){
   const {page,item}=await menuItem(w,tabId,'space');
   if(!item?.enabled){await page.keyboard.press('Escape');return itemId==='space-new'?false:{ok:false,error:'refused',moved:false};}
   await page.locator('.prototype-tab-menu button').nth(item.index).click();
   if(itemId==='space-new'){await page.locator('.prototype-tab-menu button[data-action="space-new"]').click();return true;}
   // The click starts the move; its result is the host's, so ask it directly
   // for the Space's row instead of racing the menu.
   const row=page.locator(`.prototype-tab-menu button[data-workspace-id="${options.workspaceId}"]`);
   if(!await row.count()){await page.keyboard.press('Escape');return {ok:false,error:'not-found',moved:false};}
   await row.click();
   return w.hostEval('window.BlancPrototypeHost.api.lastSpaceMove()');
  }
  const {page,item}=await menuItem(w,tabId,itemId);
  if(!item||!item.enabled){await page.keyboard.press('Escape');return false;}
  await page.locator('.prototype-tab-menu button').nth(item.index).click();
  return true;
 },
 // Split View (F53). Chromium's split holds two tabs, the shipped 2-pane view.
 async makeSplit(w,tabId,others){
  if(others.length!==1)throw new UndefinedNativeAdapterError('A native split holds two tabs');
  const active = (await w.state()).activeTabId;
  await w.api('createSplit',[tabId,others[0]]);
  if (active != null) await w.api('switchTab',[active]);
  return (await w.state()).splits.find(s=>s.tabIds.includes(String(tabId)))?.id??null;
 },
 async splitLayout(w){
  const s=await w.snapshot();const split=(s.splits||[]).find(x=>x.tabIds.includes(s.activeTabId));const g=s.splitGeometry;
  if(!split||!g?.frames||g.frames.length!==split.tabIds.length)return null;
  return {mode:g.mode,panes:split.tabIds.map((id,i)=>{const f=g.frames[i];
   return {tabId:String(id),focused:id===(s.focusedTabId??s.activeTabId),frame:{...f},content:{x:f.x+1,y:f.y+1,width:f.width-2,height:f.height-2}};})};
 },
 workspacePageScript:(w,id,source)=>w.call('executeTab',id,source),
 // Shipping reads the WebContents id; a mark in the document also changes if
 // the page reloads, which is what its steps rule out.
 async workspacePageIdentity(w,id){
  const identity=await w.call('executeTab',id,'window.__blancPageIdentity??=crypto.randomUUID()');
  (w.fixture.pageIdentities??=new Map()).set(identity,id);
  return identity;
 },
 moveGroupToSpaceByName:(w,name,id)=>nativeCall(w.fixture.host,'moveGroupToSpaceByName',[String(name),String(id)]),
 async beginNewSpaceForGroupByName(w,name){
  const group=(await w.snapshot()).groups.find(g=>same(g.name,name));
  return group ? w.api('beginNewSpaceForGroup',[group.id]) : false;
 },
 // Spaces (F41), through the host's bridge as the menu calls it.
 async runLinkSpaceMenuItem(w,id,url,title,item){
  const destination=item==='link-space-new'?'new':item.startsWith('link-space:')?item.slice(11):null;
  if(!destination)throw Error('Unknown link Space command');
  const token=await w.native('contextSpaceLink',[nativeId(id),url,title,destination]);
  const completed=await w.waitFor(()=>w.hostEval('window.BlancPrototypeHost.spaceLinkResult()'),row=>row?.token===token,'native link Space menu action');
  return completed.result;
 },
 async raceSwitchBackDuringQuiet(w,id){
  w.app.releasePages();
  const tabId=String(await w.native('heldQuietRaceStart',[String(id)]));
  try{
   const sleepingAtSwitch=await w.waitFor(()=>w.native('heldQuietRaceReady'),Boolean,'native held quiet probe in flight');
   const result=await w.call('workspaceAction','open',id);
   const outcome=await w.native('heldQuietRaceResume');
   if(outcome!=='done:0')throw Error('Restored page was quieted: '+outcome);
   return {tabId,result,sleepingAtSwitch};
  }finally{await w.native('heldQuietRaceResume');}
 },
 async workspaceAction(w,action,...args){
  if(action==='fail-session-commit'){
   if(!await w.native('spaceMoveFault',['session-commit','storage-failed']))throw Error('Session failure seam unavailable');
   return w.api('createBlankWorkspace',[args[0],{}]);
  }
  if(action==='metrics'){
   const [processes,spaces]=await Promise.all([
    w.fixture.browser.send('SystemInfo.getProcessInfo'),w.hostEval('window.BlancPrototypeHost.spaceHeldState()')]);
   return {processes:processes.processInfo,residentSpaces:spaces.held.length};
  }
  // Move to Space's test seams (shipping's arm-move-fault and saved-urls).
  if(action==='arm-move-fault')return {ok:await nativeCall(w.fixture.host,'spaceMoveFault',[String(args[0]),String(args[1]??'storage-failed')])};
  if(action==='saved-urls')return nativeCall(w.fixture.host,'spaceSavedUrls',[String(args[0])]);
  if(action==='saved-groups')return nativeCall(w.fixture.host,'spaceSavedGroups',[String(args[0])]);
  const before=new Set((await runtimes(w)).map(r=>r.id));
  if(action==='open'||action==='create')w.app.releasePages();
  const result=await spaceAction((method,list)=>w.api(method,list),action,args);
  if(action!=='open'||!args[1]?.newWindow||!result?.ok)return result;
  // The new window's Island does the switch, so wait for it to finish.
  const r=await waitFor(async()=>(await runtimes(w)).find(r=>!before.has(r.id)),Boolean,'the Space window');
  await waitFor(()=>snap(r),s=>s.spaceName===args[0]&&s.tabs.every(t=>!t.isLoading),'the Space to open in its window');
  return {...result,windowId:r.id};
 },
 async workspaceActionInWindow(w,id,action,...args){
  const r=(await runtimes(w)).find(item=>item.id===String(id));if(!r)throw Error('No window '+id);
  // A new window's native side answers before its Island has loaded.
  await waitFor(()=>r.cdp.eval('!!window.BlancPrototypeHost?.api'),Boolean,'the Island in window '+id);
  return spaceAction((method,list)=>r.cdp.eval(`window.BlancPrototypeHost.api[${jsLiteral(method)}](...${jsLiteral(list)})`),action,args);
 },
 async residentSpaces(w){
  const state=await w.hostEval('window.BlancPrototypeHost.spaceHeldState()');
  return state.held.map(id=>({id,name:state.meta.items[id]?.name,groups:state.heldGroups[id]||[],tabs:(state.heldTabs[id]||[]).map(t=>({...t,id:String(t.id)}))}));
 },
 roomPass:async w=>{const pass=(await w.hostEval('window.BlancPrototypeHost.spaceHeldState()')).roomPass||'';return {outcome:pass.split(':')[0]};},
 spaceMarkState:w=>strip(w).evalExpression("(() => { const mark = document.getElementById('pillSpace'); if (!mark) return null; const rect = mark.getBoundingClientRect(); const parts = [document.getElementById('pillSpaceSymbol'), document.getElementById('pillSpaceName')]; return { hidden: mark.hidden, state: mark.dataset.state, name: parts[1].textContent, label: mark.getAttribute('aria-label'), expanded: mark.getAttribute('aria-expanded'), fill: mark.style.getPropertyValue('--space-fill'), on: mark.style.getPropertyValue('--space-on'), edge: mark.dataset.edge ?? null, markBackground: getComputedStyle(mark).backgroundColor, squareBackground: getComputedStyle(parts[0]).backgroundColor, symbolColor: getComputedStyle(parts[0]).color, nameColor: getComputedStyle(parts[1]).color, islandText: getComputedStyle(document.getElementById('islandPill')).color, square: (() => { const b = parts[0].getBoundingClientRect(); return { width: b.width, height: b.height, inset: b.left - rect.left }; })(), nameTruncated: parts[1].scrollWidth > parts[1].clientWidth, symbol: parts[0].dataset.symbol ?? null, left: rect.left, bottom: rect.bottom, islandBottom: document.getElementById('islandPill').getBoundingClientRect().bottom, animatedProperties: [...new Set(parts.flatMap((p) => p.getAnimations()).flatMap((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k))))], animations: parts.flatMap((p) => p.getAnimations()).map((a) => ({ kind: a.constructor.name, time: a.currentTime, duration: a.effect.getTiming().duration })), reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, }; })()"),
 async clickPillSpace(w){await strip(w).locator('#pillSpace').click();},
 pressBrowserCommand:async(w,id,command)=>{
  if(command==='reload'){await w.api('reload',[id]);return true;}
  if(command==='back'){await w.api('goBack',[id]);return true;}
  const native={'close-tab':'close','zoom-in':'zoomIn','zoom-out':'zoomOut','zoom-reset':'zoomReset','find':'find','new-tab':'newTab'}[command];
  if(!native)throw new UndefinedNativeAdapterError('Browser command needs an adapter: '+command);
  return (await w.native('previewPageCommand',[native]))!==false;},
 sleepBackgroundTabsNow:w=>{w.app.releasePages();return w.api('sleepBackgroundTabs');},
 sleepTab:async(w,id)=>{
  w.app.releasePages();return w.api('quietTab',[id]);
 },
 keepGlanceAsSplit:w=>w.api('keepGlanceAsSplit'),
 moveGroupToNewWindow:async(w,id)=>{await w.api('moveGroupToNewWindow',[id]);return true;},
 closedEntrySummaries:async w=>[...(await w.snapshot()).closed].reverse().map(e=>({id:String(e.id),title:e.title,tabCount:e.tabCount})),
 // A native split lives on the tab strip, so no tab can name one that's gone;
 // the snapshot only lists splits with both tabs.
 straySplitIds:async w=>{const s=await w.snapshot();const open=new Set(s.tabs.map(t=>String(t.id)));
  return (s.splits||[]).filter(x=>x.tabIds.some(id=>!open.has(String(id)))).map(x=>String(x.id));},
 windowChildViewCount:async w=>({tabViews:(await w.snapshot()).tabs.filter(t=>t.viewBounds).length}),
 tabBounds:async(w,id)=>(await w.snapshot()).tabs.find(t=>String(t.id)===String(id))?.viewBounds??null,
 raiseTabView:(w,id)=>w.native('raiseTabView',[Number(id)]),
 attachedTabViewIds:async w=>(await w.snapshot()).tabs.filter(t=>t.viewBounds).map(t=>String(t.id)),
 focusPane:async(w,tabId)=>{await w.native('switchTab',[nativeId(tabId)]);return true;},
 focusedWebContentsId:async w=>(await w.snapshot()).focusedTabId??null,
 async splitCornerTabs(w){
  const s=await w.snapshot();const split=(s.splits||[]).find(x=>x.tabIds.includes(s.activeTabId));if(!split)return [];
  const rows=await w.hostEval(`[...document.querySelectorAll('#splitHeaders .split-pane-header')].map(pane=>{const r=pane.getBoundingClientRect();const title=pane.querySelector('.split-pane-title');
   const headers=document.getElementById('splitHeaders'),float=document.getElementById('floatPill');
   const hz=Number(getComputedStyle(headers).zIndex)||0,fz=float?(Number(getComputedStyle(float).zIndex)||0):0;
   const belowFloat=!!float&&(hz<fz||(hz===fz&&!!(headers.compareDocumentPosition(float)&Node.DOCUMENT_POSITION_FOLLOWING)));
   return {belowFloat,bounds:{x:r.x,y:r.y,width:r.width,height:r.height},width:r.width,shown:r.width>0,site:title.hidden?'':title.textContent};})`);
  return split.tabIds.map((id,i)=>({tabId:String(id),focused:id===s.activeTabId,...rows[i]}));
 },
 async clickSplitCorner(w,tabId,part){
  const s=await w.snapshot();const split=(s.splits||[]).find(x=>x.tabIds.map(String).includes(String(tabId)));if(!split)return false;
  const index=split.tabIds.map(String).indexOf(String(tabId));const selector=part==='close'?'.split-corner-close':'.split-pane-title';
  return w.hostEval(`(()=>{const button=document.querySelectorAll('#splitHeaders .split-pane-header')[${index}]?.querySelector(${jsLiteral(selector)});if(!button||button.hidden)return false;button.click();return true;})()`);
 },
 // Shield and site controls (F12). DOM reads match shipping's hooks; clicks
 // are real CDP pointer input on the Island frames.
 pillShieldState:w=>domRead(strip(w),()=>{const el=document.getElementById('pillShield');if(!el)return null;
  return {hidden:!!el.hidden,off:el.classList.contains('shield-off'),title:el.dataset.tooltip??el.title};}),
 async clickPillShield(w){await strip(w).locator('#pillShield').click();},
 async shieldPopoverState(w){
  const shown=await overlayShown(w);
  const s=await domRead(overlay(w),()=>{
   const pop=document.getElementById('shieldPop');if(!pop)return null;const row=document.getElementById('shieldPopConnection');
   return {visible:!pop.hidden,host:document.getElementById('shieldPopHost').textContent,
    on:document.getElementById('shieldPopToggle').classList.contains('on'),toggleShown:!document.getElementById('shieldPopToggle').hidden,
    connection:row&&!row.hidden?'Connection · '+document.getElementById('shieldPopConnectionValue').textContent:null,
    header:document.querySelector('.shield-pop-state')?.textContent.trim()??'',
    route:document.getElementById('shieldPopRoute')?.hidden===false?{label:document.getElementById('shieldPopRouteLabel').textContent,
     on:document.getElementById('shieldPopRouteToggle').getAttribute('aria-checked')==='true',note:document.getElementById('shieldPopRouteNote').textContent}:null};
  });
  // The overlay document lives in a host iframe; hidden iframe = not shown.
  return s&&{...s,visible:s.visible&&shown};
 },
 async clickShieldPopoverToggle(w){await overlay(w).locator('#shieldPopToggle').click();},
 async clickInsecureBadge(w){
  if(await domRead(strip(w),()=>{const b=document.getElementById('pillInsecure');return !b||b.hidden;}))return false;
  await strip(w).locator('#pillInsecure').click();return true;
 },
 pillInsecureHidden:w=>domRead(strip(w),()=>document.getElementById('pillInsecure')?.hidden??null),
 shieldAriaExpanded:w=>domRead(strip(w),()=>({shield:document.getElementById('pillShield')?.getAttribute('aria-expanded')??null,
  insecure:document.getElementById('pillInsecure')?.getAttribute('aria-expanded')??null})),
 chromeFocusedId:w=>domRead(strip(w),()=>document.activeElement?.id??null),
 async pressOverlayEscape(w){if(!await overlayShown(w))throw Error('overlay is not open');await overlay(w).keyboard.press('Escape');return true;},
 // Exceptions: Settings → Privacy and security's list (S1.7).
 exceptions:w=>exceptionRows(w),
 // As typed into that list's field (the handler normalizes it).
 addException:(w,h)=>inSettings(w,'privacy',async(host,d)=>{const rows=()=>d.all('.blanc-exception').length;
  const before=rows();d.find('#blancExceptionInput').value=host;d.find('#blancExceptionAdd').click();
  for(let i=0;i<50&&rows()===before;i++)await new Promise(r=>setTimeout(r,100));
  return {value:rows()>before};},String(h)),
 async activeHostname(w){const t=await activeTab(w);return t?blockableHostname(t.committedUrl||t.url):null;},
 allowAdsOnActive:w=>w.api('allowAdsOnActiveSite'),
 // A real mouse click on a tab's page element.
 async clickInTab(w,tabId,selector,modifiers=[]){
  // A person's click in the Glance page moves focus there first; a CDP click
  // reaches the page without going through Chromium's views.
  if(String((await w.snapshot()).glanceTabId)===String(tabId))await w.api('focusGlancePane',[String(tabId)]);
  const page=await tabPage(w,tabId);
  if(!await page.evaluate(s=>!!document.querySelector(s),String(selector)))return false;
  await page.locator(String(selector)).click({modifiers});return true;
 },
 // A tab's WebContents identity is its DevTools page target.
 tabWebContentsId:async(w,id)=>(await tabPage(w,id)).targetId??null,
 // Certificate decisions (N5, V8): Chromium's warning page and its
 // SSLHostStateDelegate. Continue is the page's own Advanced, then Proceed;
 // Stop allowing is site controls' native op, with or without the reload.
 async continueUnsafeInTab(w,id){
  const clicked=await w.call('executeTab',id,`(()=>{const advanced=document.getElementById('details-button');
   const proceed=document.getElementById('proceed-link');if(!advanced||!proceed)return false;advanced.click();proceed.click();return true;})()`);
  return clicked===true?{ok:true}:{ok:false};
 },
 forgetCertificateExceptionInTab:async(w,id)=>(await w.api('forgetCertificateExceptionInTab',[String(id),true]))===true,
 forgetCertificateExceptionOnly:async(w,id)=>(await w.api('forgetCertificateExceptionInTab',[String(id),false]))===true,
 setCertificateExceptionCap:(w,n)=>w.native('setCertificateExceptionCap',[Number(n)]),
 // Shipping's chrome document is blanc-chrome://index/, the fork's strip.
 attemptChromeNavigation:(w,url)=>strip(w).evalExpression(`location.href=${jsLiteral(String(url))}`),
 async chromeUrl(w){
  const [host,src]=await w.hostEval(`[location.href,document.getElementById('strip').contentWindow.location.href]`);
  return host===HOST&&src==='chrome://blanc-prototype/index.html'?'blanc-chrome://index/':src;
 },
};
