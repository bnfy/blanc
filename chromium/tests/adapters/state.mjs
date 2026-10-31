// Shipping test-hook state(), projected from the fork's native snapshot.
// Fields the fork snapshot cannot supply are left out, so reading one raises
// an undefined-adapter error instead of a guessed value.
import {createRequire} from 'node:module';
import {shippingPageUrl} from '../lib/page-shim.mjs';
const require=createRequire(import.meta.url);
const {loadShippingModule}=require('../lib/shipping-core.cjs');
const {sectionsOf}=loadShippingModule('src/renderer/tab-sections.js');
const id=value=>value==null?null:String(value);
export function shippingState(snapshot){
 const splitOf=new Map((snapshot.splits||[]).flatMap(s=>s.tabIds.map(t=>[String(t),String(s.id)])));
 const tabs=snapshot.tabs.map(t=>({
  id:String(t.id),url:shippingPageUrl(t.url),loadedUrl:t.committedUrl==null?null:shippingPageUrl(t.committedUrl),
  loading:!!t.isLoading,isLoading:!!t.isLoading,title:t.title||'',favicon:t.favicon||null,
  groupId:id(t.groupId),splitId:splitOf.get(String(t.id))??null,pinned:!!t.pinned,
  muted:!!(t.muted||t.siteMuted),audible:!!t.audible,canGoBack:!!t.canGoBack,canGoForward:!!t.canGoForward,
  private:!!t.private,asleep:!!t.asleep,
 }));
 const layout=tabs.map(t=>({id:t.id,groupId:t.groupId,pinned:t.pinned,splitId:t.splitId}));
 const groups=(snapshot.groups||[]).map(g=>({id:String(g.id),name:g.name,collapsed:!!g.collapsed,color:g.color||null}));
 const named=new Set(groups.map(g=>g.id));
 const clusters=sectionsOf(layout).filter(s=>s.groupId?named.has(s.groupId):s.key.startsWith('run:'))
  .map(s=>({key:s.key,groupId:s.groupId??null,tabIds:[...s.tabIds]}));
 const pins=tabs.filter(t=>t.pinned&&!t.groupId).map(t=>t.id);
 if(pins.length)clusters.unshift({key:'pinned',groupId:null,tabIds:pins});
 return {tabs,tabOrder:tabs.map(t=>t.id),clusters,groups,
  splits:(snapshot.splits||[]).map(s=>({id:String(s.id),tabIds:s.tabIds.map(String)})),
  activeTabId:id(snapshot.activeTabId),glanceTabId:id(snapshot.glanceTabId),focusedPaneTabId:id(snapshot.focusedTabId)};
}
