'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for (const name of ['host-groups','host-combined']) {
 const s=fs.readFileSync(path.join(__dirname,name+'-candidate-v3.js'),'utf8');
 const slice=(a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j)};
 const show=slice('  async function show(prefill, mode = \'panel\') {','  async function close(focus = true) {');
 test(`${name}: older pending panel must not replace later Find`,async()=>{
  let resolvePanel;
  const c={snapshot:{activeTabId:'a',focusedTabId:'a',tabs:[{id:'a',private:false}]},tooltip:{hidden:false},strip:{style:{}},overlay:{dataset:{},hidden:true,contentDocument:{documentElement:{dataset:{}}},contentWindow:{focus(){}}},extensionsPanel:{hide(){}},refresh:async()=>{},request:(method,args)=>args[0]===640?new Promise(r=>resolvePanel=r):Promise.resolve(),emit(){},requestAnimationFrame(){},setTimeout(){},reportGeometry(){},pruneOverlayShowSubscribers:()=>({size:1})};
  c.globalThis=c;vm.createContext(c);vm.runInContext(`let findShowEpoch=0,pendingFindShow=null,opened=false,overlayMode=null,findTabId=null,extensionsOpened=false,pillRect=null;${show};globalThis.api={show,openFindBar,get:()=>({opened,overlayMode})};`,c);
  const oldPanel=c.api.show();for(let i=0;i<10&&!resolvePanel;i++)await Promise.resolve();assert.equal(typeof resolvePanel,'function');await c.api.openFindBar();assert.equal(c.api.get().overlayMode,'find');resolvePanel();await oldPanel;assert.equal(c.api.get().overlayMode,'find');
 });
}
