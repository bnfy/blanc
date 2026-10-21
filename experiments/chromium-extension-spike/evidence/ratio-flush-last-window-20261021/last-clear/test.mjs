import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-ratio-last-clear',label='test',port=9297,profile=root+'/profile';let held=true;let survivorLaunch=false;
const proof={checks:[]};const clients=[];let proc;let browser;
const record=(name,value=true)=>proof.checks.push({name,value});
const wait=async(fn,test)=>{for(let i=0;i<200;i++){const x=await fn().catch(()=>null);if(test(x))return x;await pause(100)}throw Error('wait timeout')};
const list=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const attach=async t=>{const c=await connect(t);clients.push(c);return c};
const call=async(c,fn,...args)=>{const g=await c.send('Runtime.evaluate',{expression:'globalThis'});try{const r=await c.send('Runtime.callFunctionOn',{objectId:g.result.objectId,functionDeclaration:fn.toString(),arguments:args.map(value=>({value})),returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}finally{await c.send('Runtime.releaseObject',{objectId:g.result.objectId}).catch(()=>{})}};
const api=(h,m,...args)=>call(h,async function(m,args){return await BlancPrototypeHost.api[m](...args)},m,args);
const snap=h=>api(h,'getAllTabs');
const launch=async()=>{const log=fs.openSync(root+'/'+label+'.browser.log','a');proc=spawn('/Users/anthonyjloria/Projects/BlancChromium157/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,`--profile-directory=${survivorLaunch?"Profile 1":"Default"}`,'--blanc-prototype-assets=/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/generated','--no-first-run','--no-default-browser-check','--use-mock-keychain','--disable-features=EncryptSessionStorage','--hide-crash-restore-bubble','--restore-last-session','about:blank'],{stdio:['ignore',log,log],env:held?{...process.env,DYLD_INSERT_LIBRARIES:root+'/hold.dylib',BLANC_SPACE_WRITE_BARRIER:root}:process.env});await wait(list,x=>x?.some(t=>t.url.includes('/host.html')));browser=await attach(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()))};
const host=privateMode=>wait(async()=>{for(const t of (await list()).filter(t=>t.url.includes('/host.html'))){const c=await attach(t);const s=await snap(c).catch(()=>null);if(s&&s.tabs.some(t=>t.private)===privateMode)return c}return null},Boolean);
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<title>Split rail fixture</title><h1>Fixture</h1>')});await new Promise(r=>server.listen(9298,'127.0.0.1',r));
try{
await launch();let h=await host(false);
for(const suffix of ['cancel-left','cancel-right'])await api(h,'createTab','http://127.0.0.1:9298/#'+suffix);
let state=await wait(()=>snap(h),x=>x.tabs.filter(t=>t.url.includes('9298')&&!t.isLoading).length===2);
for(const tab of state.tabs.filter(t=>!t.url.includes('9298')))await api(h,'closeTab',tab.id);
const ids=state.tabs.filter(t=>t.url.includes('9298')).map(t=>t.id);await api(h,'createSplit',...ids);await api(h,'previewSpaceSave','Saved source');record('named Space saved before cancellation');

await pause(5500);fs.writeFileSync(root+'/arm','write-hold');let result=null;const resizing=api(h,'resizeSplit',(await snap(h)).splits[0].tabIds,.65).then(()=>result={success:true},e=>result={error:e.message});await wait(async()=>{try{return JSON.parse(fs.readFileSync(root+'/error.json'))}catch{return null}},x=>x?.mode==='write-hold');record('ratio write pending before last-window shutdown');
const closing=browser.send('Browser.close').catch(()=>{});await pause(300);fs.rmSync(root+'/arm');fs.writeFileSync(root+'/release','release');await closing;await wait(async()=>proc.exitCode,x=>x!==null);assert.equal(proc.exitCode,0);record('last-window browser shutdown exits cleanly');await resizing;record('pending caller outcome',result);clients.forEach(c=>c.close());held=false;

await launch();h=await host(false);const restored=await wait(()=>snap(h),x=>x.tabs.filter(t=>t.url.includes('#cancel-')&&!t.isLoading).length===2&&x.splits.length===1);record('restored last session',restored);assert.equal(restored.tabs.filter(t=>t.url.includes('#cancel-')).length,2);record('exact source pair restored');
await browser.send('Browser.close').catch(()=>{});await wait(async()=>proc.exitCode,x=>x!==null);assert.equal(proc.exitCode,0);proof.pass=true;
}catch(e){proof.pass=false;proof.error=e.stack;fs.writeFileSync(root+'/release','release');if(proc?.exitCode===null)proc.kill('SIGTERM')}finally{server.close();clients.forEach(c=>c.close());fs.writeFileSync(root+'/'+label+'.json',JSON.stringify(proof,null,2));console.log({pass:proof.pass,checks:proof.checks.length,error:proof.error})}if(!proof.pass)process.exitCode=1;
