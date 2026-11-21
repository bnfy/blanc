import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-partial-restart-final-left-immediate-ready',label='test',port=9297,profile=root+'/profile';let held=false;
const proof={checks:[]};const clients=[];let proc;let browser;
const record=(name,value=true)=>proof.checks.push({name,value});
const wait=async(fn,test)=>{for(let i=0;i<200;i++){const x=await fn().catch(()=>null);if(test(x))return x;await pause(100)}throw Error('wait timeout')};
const list=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const attach=async t=>{const c=await connect(t);clients.push(c);return c};
const call=async(c,fn,...args)=>{const g=await c.send('Runtime.evaluate',{expression:'globalThis'});try{const r=await c.send('Runtime.callFunctionOn',{objectId:g.result.objectId,functionDeclaration:fn.toString(),arguments:args.map(value=>({value})),returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}finally{await c.send('Runtime.releaseObject',{objectId:g.result.objectId}).catch(()=>{})}};
const api=(h,m,...args)=>call(h,async function(m,args){return await BlancPrototypeHost.api[m](...args)},m,args);
const snap=h=>api(h,'getAllTabs');
const launch=async()=>{const log=fs.openSync(root+'/'+label+'.browser.log','a');proc=spawn('/Users/anthonyjloria/Projects/BlancChromium157/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--blanc-prototype-assets=/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/generated','--no-first-run','--no-default-browser-check','--use-mock-keychain','--enable-features=EncryptSessionStorage:stage/write_encrypted_read_prefer_encrypted','--hide-crash-restore-bubble','--restore-last-session','about:blank'],{stdio:['ignore',log,log],env:held?{...process.env,DYLD_INSERT_LIBRARIES:root+'/hold.dylib',BLANC_SPACE_WRITE_BARRIER:root}:process.env});await wait(list,x=>x?.some(t=>t.url.includes('/host.html')));browser=await attach(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()))};
const host=privateMode=>wait(async()=>{for(const t of (await list()).filter(t=>t.url.includes('/host.html'))){const c=await attach(t);const s=await snap(c).catch(()=>null);if(s&&s.tabs.some(t=>t.private)===privateMode)return c}return null},Boolean);
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<title>Split rail fixture</title><h1>Fixture</h1>')});await new Promise(r=>server.listen(9298,'127.0.0.1',r));
try{
await launch();let h=await host(false);
for(const suffix of ['cancel-left','cancel-right'])await api(h,'createTab','http://127.0.0.1:9298/#'+suffix);
let state=await wait(()=>snap(h),x=>x.tabs.filter(t=>t.url.includes('9298')&&!t.isLoading).length===2);
for(const tab of state.tabs.filter(t=>!t.url.includes('9298')))await api(h,'closeTab',tab.id);
const ids=state.tabs.filter(t=>t.url.includes('9298')).map(t=>t.id);await api(h,'createSplit',...ids);await api(h,'previewSpaceSave','Saved source');record('source session save acknowledged before cancellation');
const page=await attach((await list()).find(t=>t.url.endsWith('#cancel-left')));await page.send('Page.enable');await page.send('Runtime.evaluate',{expression:"window.__survivor = 'unchanged';document.body.innerHTML += '<input id=state>';document.querySelector('#state').value='unsaved';"});
await page.send('Runtime.evaluate',{expression:"window.onbeforeunload = e => { e.preventDefault(); e.returnValue = ''; };",userGesture:true});
await assert.rejects(api(h,'closeSplit',ids[0]),/pending or cancelled/);record('pending unload does not acknowledge durable batch close');
await page.send('Page.handleJavaScriptDialog',{accept:false});
state=await snap(h);assert(state.tabs.some(t=>t.id===ids[0]));record('cancel retains guarded pane',state);
await page.send('Runtime.evaluate',{expression:'window.onbeforeunload = null'});

proc.kill('SIGKILL');await wait(async()=>proc.signalCode,x=>x==='SIGKILL');clients.forEach(c=>c.close());record('crashed after cancellation before reconciliation');
await launch();h=await host(false);await wait(()=>snap(h),s=>s.tabs.every(t=>!t.isLoading));await pause(1500);
const snapshots=async()=>{const rows=[];for(const target of (await list()).filter(t=>t.url.includes('host.html'))){const c=await attach(target);rows.push({c,state:await wait(()=>snap(c),Boolean)})}return rows};
let rows=[];let selected=null;
for(let i=0;i<10;i++){rows=await snapshots();selected=rows.find(w=>w.state.tabs.some(t=>t.url.endsWith('#cancel-left')));if(selected)break;await api(h,'previewPageCommand','restore');await pause(400)}
record('windows before split reconciliation',rows.map(w=>w.state));assert(selected,'surviving pane must be recoverable');h=selected.c;
assert.equal(selected.state.splits.length,0,'must recover a lone session survivor before reconciling history');
assert.equal(selected.state.tabs.filter(t=>t.url.includes('9298')).length,1);
const beforeId=selected.state.tabs.find(t=>t.url.endsWith('#cancel-left')).id;
assert.equal(rows.flatMap(w=>w.state.tabs).filter(t=>t.url.endsWith('#cancel-left')).length,1);
if(!selected.state.splits.length){const closed=selected.state.closed.find(e=>e.title==='Split view');assert(closed,'partial Split history must remain');await api(h,'reopenClosedEntry',closed.id);}
rows=await snapshots();record('all windows after split reconciliation',rows.map(w=>w.state));
for(const suffix of ['#cancel-left','#cancel-right'])assert.equal(rows.flatMap(w=>w.state.tabs).filter(t=>t.url.endsWith(suffix)).length,1,'no duplicate after restart reconciliation');
state=await snap(h);assert.equal(state.splits.length,1);assert(state.tabs.some(t=>t.id===beforeId),'reuse the session-restored survivor');record('pair restored once with session survivor retained',state);
await browser.send('Browser.close').catch(()=>{});await wait(async()=>proc.exitCode,x=>x!==null);assert.equal(proc.exitCode,0);proof.pass=true;
}catch(e){proof.pass=false;proof.error=e.stack;fs.writeFileSync(root+'/release','release');if(proc?.exitCode===null)proc.kill('SIGTERM')}finally{server.close();clients.forEach(c=>c.close());fs.writeFileSync(root+'/'+label+'.json',JSON.stringify(proof,null,2));console.log({pass:proof.pass,checks:proof.checks.length,error:proof.error})}if(!proof.pass)process.exitCode=1;
