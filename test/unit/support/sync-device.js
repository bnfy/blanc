'use strict';
// An isolated CommonJS graph per simulated device. Only Electron's external
// boundary and clocks are substituted; sync, its stores and its queue are real.
const Module=require('node:module');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const main=path.resolve(__dirname,'../../../src/main');
function virtualClock(start=Date.now()) {
  let wall=start,mono=0,next=0;const timers=new Map();
  return {now:()=>wall,monotonic:()=>mono,
    setTimer:(fn,delay)=>{timers.set(++next,{fn,at:mono+delay});return next;},clearTimer:id=>timers.delete(id),
    advance:async amount=>{wall+=amount;mono+=amount;for(const [id,timer] of [...timers])if(timer.at<=mono){timers.delete(id);timer.fn();}await new Promise(r=>setImmediate(r));}};
}
function syncDevice({fetch,clock,files={},key=Buffer.alloc(32,9),record={}}={}) {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-sync-device-')),cache=new Map(),stores=[];
  const initial={enabled:true,accountId:'a'.repeat(64),handle:'test',deviceId:'desktop',syncTabs:false,
    protectedKey:Buffer.from(key.toString('base64')).toString('base64'),key:'',lastError:null,lastSyncedAt:0,...record};
  for(const [name,data] of Object.entries({'sync.json':initial,'settings.json':{onboardingVersion:1},...files}))fs.writeFileSync(path.join(tmp,name),JSON.stringify(data));
  const electron={app:{getPath:()=>tmp,on:()=>{},isPackaged:false},nativeImage:{},net:{fetch},
    safeStorage:{isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'test',encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()}};
  function load(filename) {
    if(cache.has(filename))return cache.get(filename).exports;
    const mod=new Module(filename);cache.set(filename,mod);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
    const ordinary=Module.createRequire(filename);
    mod.require=specifier=>{
      if(specifier==='electron')return electron;
      const resolved=ordinary.resolve(specifier);
      if(!resolved.startsWith(main+path.sep))return ordinary(specifier);
      const exported=load(resolved);
      if(clock && resolved===path.join(main,'sync-scheduler.js'))return {...exported,createScheduler:options=>exported.createScheduler({...options,now:clock.now,monotonic:clock.monotonic})};
      if(clock && resolved===path.join(main,'sync-request-queue.js'))return {...exported,createRequestQueue:options=>exported.createRequestQueue({...options,now:clock.now,setTimer:clock.setTimer,clearTimer:clock.clearTimer})};
      return exported;
    };
    mod._compile(fs.readFileSync(filename,'utf8'),filename);mod.loaded=true;
    if(filename===path.join(main,'store.js')) {
      const Base=mod.exports.JsonStore;mod.exports.JsonStore=class extends Base{constructor(...args){super(...args);stores.push(this);}};
    }
    return mod.exports;
  }
  return {sync:load(path.join(main,'sync.js')),spaces:load(path.join(main,'shared-spaces.js')),closed:load(path.join(main,'synced-closed.js')),sends:load(path.join(main,'sends.js')),record:initial,tmp,
    async dispose(){for(const store of stores)store.flushPending();for(const store of stores)await store.settled();fs.rmSync(tmp,{recursive:true,force:true});}};
}
module.exports={syncDevice,virtualClock};
