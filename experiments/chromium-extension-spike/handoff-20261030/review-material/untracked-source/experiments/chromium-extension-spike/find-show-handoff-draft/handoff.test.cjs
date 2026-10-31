'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for (const name of ['host-groups','host-combined']) {
 const s=fs.readFileSync(path.join(__dirname,name+'-candidate.js'),'utf8');
 const slice=(a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j)};
 const subscriptions=slice('  function subscribe(event, callback) {','  function request(method, args = []) {');
 const handoff=slice('  function invalidateFindShow() {','  async function close(focus = true) {');
 assert.match(s,/async function show\(prefill, mode = 'panel'\) \{\s+invalidateFindShow\(\);/);
 assert.match(s,/async function close\(focus = true\) \{\s+invalidateFindShow\(\);/);
 function fixture(){
  const c={console,events:[],frames:[],timers:[],micros:[],focused:0,geometryCalls:0,
   queueMicrotask:f=>c.micros.push(f),requestAnimationFrame:f=>c.frames.push(f),setTimeout:(f,ms)=>c.timers.push({f,ms}),
   refresh:async()=>{},request:async()=>{},notice:e=>{throw Error(e)},
   snapshot:{activeTabId:'a',focusedTabId:'a',tabs:[{id:'a',private:false},{id:'b',private:true}]},
   strip:{style:{}},extensionsPanel:{hide(){}},overlay:{dataset:{},hidden:true,contentDocument:{documentElement:{dataset:{}}},contentWindow:{focus(){c.focused++}}},
   currentSplitLayout:()=>null,reportGeometry:()=>{c.geometryCalls++}};
  c.globalThis=c;vm.createContext(c);
  vm.runInContext(`let findShowEpoch=0,pendingFindShow=null,opened=false,overlayMode=null,findTabId=null,extensionsOpened=false;const subscribers=new Map();\n${subscriptions}\n${handoff}\nglobalThis.api={subscribe,openFindBar,invalidateFindShow,get:()=>({findShowEpoch,pendingFindShow,opened,overlayMode,findTabId})};`,c);
  return c;
 }
 test(`${name}: normal frame delivers once and later timer is harmless`,async()=>{const c=fixture();c.api.subscribe('onOverlayShow',e=>c.events.push(e));await c.api.openFindBar();assert.equal(c.events.length,0);c.frames[0]();assert.equal(c.events.length,1);assert.equal(c.events[0].purpose.findTabId,'a');assert.equal(c.focused,1);c.timers[0].f();assert.equal(c.events.length,1)});
 test(`${name}: hidden frame uses timer without duplicate when frame returns`,async()=>{const c=fixture();c.api.subscribe('onOverlayShow',e=>c.events.push(e));await c.api.openFindBar();assert.equal(c.timers[0].ms,250);c.timers[0].f();assert.equal(c.events.length,1);c.frames[0]();assert.equal(c.events.length,1)});
 test(`${name}: late subscriber receives pending Find`,async()=>{const c=fixture();await c.api.openFindBar();c.frames[0]();c.timers[0].f();assert.equal(c.events.length,0);c.api.subscribe('onOverlayShow',e=>c.events.push(e));assert.equal(c.events.length,0);c.micros.forEach(f=>f());assert.equal(c.events.length,1);assert.equal(c.events[0].purpose.findTabId,'a')});
 test(`${name}: cancelled and superseded openings cannot deliver stale handoffs`,async()=>{const c=fixture();c.api.subscribe('onOverlayShow',e=>c.events.push(e));await c.api.openFindBar();c.api.invalidateFindShow();c.frames[0]();c.timers[0].f();assert.equal(c.events.length,0);await c.api.openFindBar();c.snapshot.activeTabId='b';c.snapshot.focusedTabId='b';await c.api.openFindBar();c.frames[1]();assert.equal(c.events.length,0);c.timers[2].f();assert.equal(c.events.length,1);assert.equal(c.events[0].purpose.findTabId,'b');assert.equal(c.overlay.contentDocument.documentElement.dataset.theme,'private')});
 test(`${name}: subscriber closing during delivery cannot refocus`,async()=>{const c=fixture();c.api.subscribe('onOverlayShow',()=>c.api.invalidateFindShow());await c.api.openFindBar();c.frames[0]();assert.equal(c.focused,0);assert.equal(c.geometryCalls,0)});
}
