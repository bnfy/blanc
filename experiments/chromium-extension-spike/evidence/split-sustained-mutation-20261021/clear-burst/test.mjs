import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-sustained-clear-burst',label='test',port=9297,profile=root+'/profile';let held=true;
const proof={checks:[]};const clients=[];let proc;let browser;
const record=(name,value=true)=>proof.checks.push({name,value});
const wait=async(fn,test)=>{for(let i=0;i<200;i++){const x=await fn().catch(()=>null);if(test(x))return x;await pause(100)}throw Error('wait timeout')};
const list=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const attach=async t=>{const c=await connect(t);clients.push(c);return c};
const call=async(c,fn,...args)=>{const g=await c.send('Runtime.evaluate',{expression:'globalThis'});try{const r=await c.send('Runtime.callFunctionOn',{objectId:g.result.objectId,functionDeclaration:fn.toString(),arguments:args.map(value=>({value})),returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}finally{await c.send('Runtime.releaseObject',{objectId:g.result.objectId}).catch(()=>{})}};
const api=(h,m,...args)=>call(h,async function(m,args){return await BlancPrototypeHost.api[m](...args)},m,args);
const snap=h=>api(h,'getAllTabs');
const launch=async()=>{const log=fs.openSync(root+'/'+label+'.browser.log','a');proc=spawn('/Users/anthonyjloria/Projects/BlancChromium157/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--blanc-prototype-assets=/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/generated','--no-first-run','--no-default-browser-check','--use-mock-keychain','--disable-features=EncryptSessionStorage','--hide-crash-restore-bubble','--restore-last-session','about:blank'],{stdio:['ignore',log,log],env:held?{...process.env,DYLD_INSERT_LIBRARIES:root+'/hold.dylib',BLANC_SPACE_WRITE_BARRIER:root}:process.env});await wait(list,x=>x?.some(t=>t.url.includes('/host.html')));browser=await attach(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()))};
const host=privateMode=>wait(async()=>{for(const t of (await list()).filter(t=>t.url.includes('/host.html'))){const c=await attach(t);const s=await snap(c).catch(()=>null);if(s&&s.tabs.some(t=>t.private)===privateMode)return c}return null},Boolean);
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<title>Split rail fixture</title><h1>Fixture</h1>')});await new Promise(r=>server.listen(9298,'127.0.0.1',r));
try{
await launch();let h=await host(false);
for(const suffix of ['cancel-left','cancel-right'])await api(h,'createTab','http://127.0.0.1:9298/#'+suffix);
let state=await wait(()=>snap(h),x=>x.tabs.filter(t=>t.url.includes('9298')&&!t.isLoading).length===2);
for(const tab of state.tabs.filter(t=>!t.url.includes('9298')))await api(h,'closeTab',tab.id);
const ids=state.tabs.filter(t=>t.url.includes('9298')).map(t=>t.id);await api(h,'createSplit',...ids);await api(h,'previewSpaceSave','Saved source');record('named Space saved before cancellation');
for(let cycle=0;cycle<3;cycle++){const cycleIds=(await snap(h)).splits[0].tabIds;fs.rmSync(root+'/error.json',{force:true});
const page=await attach((await list()).find(t=>t.url.endsWith('#cancel-right')));await page.send('Page.enable');await page.send('Runtime.evaluate',{expression:"window.__survivor = 'unchanged';document.body.innerHTML += '<input id=state>';document.querySelector('#state').value='unsaved';"});
await page.send('Runtime.evaluate',{expression:"window.onbeforeunload = e => { e.preventDefault(); e.returnValue = ''; };",userGesture:true});
fs.writeFileSync(root+'/arm','write-error');let outcome=null;const closing=api(h,'closeSplit',cycleIds[0]).then(()=>{outcome={success:true}},e=>{outcome={error:e.message}});await pause(250);record('close awaits unload outcome');
await page.send('Page.handleJavaScriptDialog',{accept:false});await wait(async()=>(()=>{try{return JSON.parse(fs.readFileSync(root+'/error.json'))}catch{return null}})(),Boolean);record('actual write boundary intercepted',JSON.parse(fs.readFileSync(root+'/error.json')));await closing;assert.match(outcome.error,/persistence failed/);record('write failure rejects durability',outcome);fs.rmSync(root+'/arm');await page.send('Runtime.evaluate',{expression:'window.onbeforeunload = null'});const partial=await wait(()=>snap(h),x=>x.closed.some(e=>e.title==='Split view'));await api(h,'reopenClosedEntry',partial.closed.find(e=>e.title==='Split view').id);await wait(()=>snap(h),x=>x.splits.length===1&&x.tabs.every(t=>!t.isLoading));await api(h,'previewSpaceSave','Recovered source');await api(h,'createTab','http://127.0.0.1:9298/#flush-retry');const retry=await wait(()=>snap(h),x=>x.tabs.some(t=>t.url.endsWith('#flush-retry')&&!t.isLoading));fs.rmSync(root+'/error.json',{force:true});record('retry uses normal writes with interposer unarmed');const current=await snap(h);await api(h,'switchTab',current.splits[0].tabIds[0]);await api(h,'resizeSplit',current.splits[0].tabIds,.31);await wait(()=>snap(h),x=>Math.abs(x.splits[0].layout.widths[0]-.31)<.001);record('live ratio changed before retry');let result=null;const started=Date.now();const pending=api(h,'closeTab',retry.tabs.find(t=>t.url.endsWith('#flush-retry')).id).then(()=>{result={success:true}},e=>{result={error:e.message}});
let mutations=0;const observed=[];
while(!result && Date.now()-started<14000){
 const ratios=Array.from({length:32},()=>.30+((++mutations)%100)*.001);
 const accepted=await call(h,async function(ids,ratios){return await Promise.all(ratios.map(r=>BlancPrototypeHost.api.resizeSplit(ids,r)))},current.splits[0].tabIds,ratios);
 assert(accepted.every(Boolean));const live=await snap(h);observed.push({requested:ratios.at(-1),actual:live.splits[0].layout.widths[0],pending:!result});
}
await pending;record('continuous mutation result',{result,cycle,elapsed:Date.now()-started,mutations,observed});assert(mutations>0);assert(Date.now()-started<14000);if(result.error)assert.match(result.error,/persistence failed or timed out/);else assert.equal(result.success,true);record('bounded mutation-only outcome',result);assert(!fs.existsSync(root+'/error.json'),'no retry write interception');
await pause(300);record('mutation stopped; starting stable save');
await api(h,'resizeSplit',current.splits[0].tabIds,.35);await wait(()=>snap(h),x=>Math.abs(x.splits[0].layout.widths[0]-.35)<.001);
await api(h,'createTab','http://127.0.0.1:9298/#stable-retry');const stable=await wait(()=>snap(h),x=>x.tabs.some(t=>t.url.endsWith('#stable-retry')&&!t.isLoading));await api(h,'closeTab',stable.tabs.find(t=>t.url.endsWith('#stable-retry')).id);record('subsequent close acknowledged');
state=await snap(h);assert(state.tabs.some(t=>t.id===cycleIds[1]));record('cancel retains guarded pane',state);
await page.send('Runtime.evaluate',{expression:'window.onbeforeunload = null'});

}
record('normal-speed save and subsequent close remain usable',await snap(h));
await browser.send('Browser.close').catch(()=>{});await wait(async()=>proc.exitCode,x=>x!==null);assert.equal(proc.exitCode,0);proof.pass=true;
}catch(e){proof.pass=false;proof.error=e.stack;fs.writeFileSync(root+'/release','release');if(proc?.exitCode===null)proc.kill('SIGTERM')}finally{server.close();clients.forEach(c=>c.close());fs.writeFileSync(root+'/'+label+'.json',JSON.stringify(proof,null,2));console.log({pass:proof.pass,checks:proof.checks.length,error:proof.error})}if(!proof.pass)process.exitCode=1;
