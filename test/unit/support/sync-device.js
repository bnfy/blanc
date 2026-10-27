'use strict';
// An isolated CommonJS graph per simulated device. Only Electron's external
// boundary and clocks are substituted; sync, its stores and its queue are real.
const Module=require('node:module');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const main=path.resolve(__dirname,'../../../src/main');
function virtualClock(start=Date.now()) {
  let wall=start,mono=0,next=0;const timers=new Map();
  return {now:()=>wall,monotonic:()=>mono,nextDelay:()=>timers.size?Math.max(0,Math.min(...[...timers.values()].map(x=>x.at))-mono):Infinity,
    setTimer:(fn,delay)=>{timers.set(++next,{fn,at:mono+delay});return next;},clearTimer:id=>timers.delete(id),
    advance:async amount=>{wall+=amount;mono+=amount;for(const [id,timer] of [...timers])if(timer.at<=mono){timers.delete(id);timer.fn();}await new Promise(r=>setImmediate(r));}};
}
function syncDevice({fetch,clock,files={},key=Buffer.alloc(32,9),record={},endpoint,windowMs,packaged=false,testMode='1'}={}) {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-sync-device-')),cache=new Map(),stores=[],schedulerOptions=[];
  const initial={enabled:true,accountId:'a'.repeat(64),handle:'test',deviceId:'desktop',syncTabs:false,
    protectedKey:Buffer.from(key.toString('base64')).toString('base64'),key:'',lastError:null,lastSyncedAt:0,...record};
  for(const [name,data] of Object.entries({'sync.json':initial,'settings.json':{onboardingVersion:1},...files}))fs.writeFileSync(path.join(tmp,name),JSON.stringify(data));
  const electron={app:{getPath:()=>tmp,on:()=>{},isPackaged:packaged},nativeImage:{},net:{fetch},
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
      if(resolved===path.join(main,'sync-scheduler.js'))return {...exported,createScheduler:options=>{schedulerOptions.push(options);return exported.createScheduler(clock?{...options,now:clock.now,monotonic:clock.monotonic}:options);}};
      if(clock && resolved===path.join(main,'sync-request-queue.js'))return {...exported,createRequestQueue:options=>exported.createRequestQueue({...options,now:clock.now,setTimer:clock.setTimer,clearTimer:clock.clearTimer})};
      return exported;
    };
    mod._compile(fs.readFileSync(filename,'utf8'),filename);mod.loaded=true;
    if(filename===path.join(main,'store.js')) {
      const Base=mod.exports.JsonStore;mod.exports.JsonStore=class extends Base{constructor(...args){super(...args);stores.push(this);}};
    }
    return mod.exports;
  }
  const overrides=Object.entries({BLANC_TEST_SYNC_ENDPOINT:endpoint,BLANC_TEST_SYNC_WINDOW_MS:windowMs}).filter(([,value])=>value!==undefined);
  const previous=Object.fromEntries(['BLANC_TEST',...overrides.map(([key])=>key)].map(key=>[key,process.env[key]]));let sync;
  try {
    if(overrides.length){process.env.BLANC_TEST=testMode;for(const [key,value] of overrides)process.env[key]=value;}
    sync=load(path.join(main,'sync.js'));
  } finally {
    if(overrides.length)for(const [key,value] of Object.entries(previous)) {
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
  return {sync,schedulerOptions,workspaces:load(path.join(main,'workspaces.js')),tabsync:load(path.join(main,'tabsync.js')),spaces:load(path.join(main,'shared-spaces.js')),closed:load(path.join(main,'synced-closed.js')),sends:load(path.join(main,'sends.js')),record:initial,tmp,
    async dispose(){for(const store of stores)store.flushPending();for(const store of stores)await store.settled();fs.rmSync(tmp,{recursive:true,force:true});}};
}
module.exports={syncDevice,virtualClock};
