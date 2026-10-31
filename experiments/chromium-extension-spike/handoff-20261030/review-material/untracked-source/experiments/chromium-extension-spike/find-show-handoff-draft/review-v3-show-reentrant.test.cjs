'use strict';
// Review-only reproduction against frozen v3; not a browser qualification.
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for(const name of ['host-groups','host-combined']){
 const s=fs.readFileSync(path.join(__dirname,name+'-candidate-v3.js'),'utf8');
 const a=s.indexOf('  async function show(prefill, mode = \'panel\') {'), b=s.indexOf('  async function close(focus = true) {',a);assert(a>=0&&b>a);
 const code=s.slice(a,b);
 test(`${name}: old panel callback continues after synchronous invalidation`,async()=>{
  const c={frames:[],focus:0,inputEvents:0,snapshot:{activeTabId:'a',tabs:[{id:'a',private:false}]},tooltip:{hidden:true},strip:{style:{}},
   overlay:{dataset:{},hidden:true,contentDocument:{documentElement:{dataset:{}},getElementById:()=>({value:'',dispatchEvent:()=>c.inputEvents++})},contentWindow:{focus:()=>c.focus++,Event:class {}}},
   extensionsPanel:{hide(){}},refresh:async()=>{},request:async()=>{},reportGeometry(){},
   emit(event){if(event==='onOverlayShow')c.api.invalidateFindShow();},requestAnimationFrame:f=>c.frames.push(f),setTimeout(){},pruneOverlayShowSubscribers:()=>({size:1})};
  c.globalThis=c;vm.createContext(c);vm.runInContext(`let findShowEpoch=0,pendingFindShow=null,opened=false,overlayMode=null,findTabId=null,extensionsOpened=false,pillRect=null;${code};globalThis.api={show,invalidateFindShow};`,c);
  await c.api.show('query','palette');assert.equal(c.frames.length,1);c.frames[0]();
  assert.equal(c.inputEvents,1);assert.equal(c.focus,1);
 });
}
