import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../blanc/island/host.js',import.meta.url),'utf8');
const fn=name=>source.match(new RegExp(`  (?:async )?function ${name}\\([^]*?\\n  \\}`))[0];
function findHarness(){
 const frames=[],timers=[],events=[];
 const context=vm.createContext({pendingFindShow:null,pendingShieldOpen:null,findShowEpoch:0,findTabId:null,
  opened:false,overlayMode:null,overlayClosing:null,extensionsOpened:false,
  overlay:{style:{},dataset:{},hidden:true,contentDocument:{documentElement:{dataset:{}}},contentWindow:{focus(){}}},
  strip:{style:{}},extensionsPanel:{hide(){}},snapshot:{activeTabId:'1',tabs:[{id:'1'}]},
  hideSheet:async()=>{},refresh:async()=>{},request:async()=>{},reportGeometry(){},
  pruneOverlayShowSubscribers:()=>context.listener?new Set([1]):null,listener:true,
  emit:(name,value)=>events.push({name,value}),requestAnimationFrame:fn=>frames.push(fn),setTimeout:fn=>timers.push(fn)});
 vm.runInContext(['invalidateFindShow','deliverFindShow','openFindBar'].map(fn).join('\n'),context);
 return {context,frames,timers,events};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('Find opening resolves after current renderer initialization, including a late subscriber',async()=>{
 const {context:c,frames,timers,events}=findHarness();c.listener=false;
 let finished=false;const opening=c.openFindBar().then(()=>{finished=true;});await tick();
 assert.equal(finished,false);frames.shift()();await tick();assert.equal(finished,false);
 c.listener=true;timers.shift()();await opening;
 assert.equal(events.filter(e=>e.name==='onOverlayShow').length,1);assert.equal(finished,true);
 c.deliverFindShow(c.findShowEpoch);assert.equal(events.filter(e=>e.name==='onOverlayShow').length,1);
});
test('a cancelled Find opening settles and its queued callback cannot initialize a later opening',async()=>{
 const {context:c,frames,events}=findHarness();const first=c.openFindBar();await tick();
 c.invalidateFindShow();await first;const second=c.openFindBar();await tick();
 frames.shift()();assert.equal(events.filter(e=>e.name==='onOverlayShow').length,0);
 frames.shift()();await second;assert.equal(events.filter(e=>e.name==='onOverlayShow').length,1);
});
function glanceHarness(){
 const announcements=[],published=[];
 const context=vm.createContext({snapshot:{glanceTabId:2,activeTabId:1,tabs:[{id:1},{id:2}]},
  glance:{tabId:null,nativeTabId:null,nativeMainId:null,generation:0},area:null,
  glanceArea:()=>context.area,glanceSay:(...args)=>announcements.push(args),glanceTitle:id=>'page-'+id,
  flushGlanceSave(){},publishGlance:()=>published.push(context.glance.tabId),setTimeout(){},refresh(){}});
 vm.runInContext(fn('syncGlance'),context);return {context,announcements,published};
}
test('closing the main page before first Glance layout announces its surviving reference once',()=>{
 const {context:c,announcements,published}=glanceHarness();c.syncGlance();
 assert.equal(published.length,0);assert.equal(c.glance.nativeMainId,1);
 c.snapshot={glanceTabId:null,activeTabId:2,tabs:[{id:2}]};c.syncGlance();c.syncGlance();
 assert.equal(announcements.length,1);assert.equal(announcements[0][0],'glance.status.mainClosed');
 assert.equal(announcements[0][1].title,'page-2');
});
test('a reference closing before layout is announced, while replacing it preserves the current visual card',()=>{
 const {context:c,announcements,published}=glanceHarness();c.area={};c.syncGlance();
 c.area=null;c.snapshot={glanceTabId:3,activeTabId:1,tabs:[{id:1},{id:2},{id:3}]};c.syncGlance();
 assert.equal(c.glance.tabId,2);assert.deepEqual(published,[2]);
 c.snapshot={glanceTabId:null,activeTabId:1,tabs:[{id:1},{id:2}]};c.syncGlance();
 assert.equal(announcements.length,1);assert.equal(announcements[0][0],'glance.status.tabClosed');
});
function cancelHarness(){
 const closed=[],focus=[];
 const context=vm.createContext({overlayDragging:false,overlayMode:'glance',overlayPurpose:'change',
  glance:{requestEpoch:0},findShowEpoch:1,snapshot:{glanceTabId:2},
  refresh:async()=>{context.snapshot.glanceTabId=null;},close:async(...args)=>closed.push(args),emit(){},
  focusGlanceCard:async()=>focus.push('card'),glanceCardFrame:{contentDocument:{getElementById:()=>({focus:()=>focus.push('control')})}}});
 const close=vm.runInContext('('+source.match(/closeOverlay: (async reason => \{[^]*?\n    \}),\n    reportIslandRect/)[1]+')',context);
 return {context,closed,focus,close};
}
test('Change cancellation refreshes native ownership before choosing its focus target',async()=>{
 const {closed,focus,close}=cancelHarness();await close('escape');
 assert.deepEqual(closed,[['escape']]);assert.deepEqual(focus,[]);
});
test('a newer surface supersedes a cancellation waiting for its native snapshot',async()=>{
 const {context:c,closed,focus,close}=cancelHarness();let resume;
 c.refresh=()=>new Promise(resolve=>{resume=resolve;});const pending=close('escape');
 ++c.findShowEpoch;c.overlayMode='panel';resume();await pending;
 assert.deepEqual(closed,[]);assert.deepEqual(focus,[]);
});
