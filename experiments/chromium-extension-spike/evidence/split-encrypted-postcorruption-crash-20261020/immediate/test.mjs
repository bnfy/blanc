import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-encrypted-crash-immediate',label='test',port=9297,profile=root+'/profile';let held=false;
const proof={checks:[]};const clients=[];let proc;let browser;
const record=(name,value=true)=>proof.checks.push({name,value});
const wait=async(fn,test)=>{for(let i=0;i<200;i++){const x=await fn().catch(()=>null);if(test(x))return x;await pause(100)}throw Error('wait timeout')};
const list=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const attach=async t=>{const c=await connect(t);clients.push(c);return c};
const call=async(c,fn,...args)=>{const g=await c.send('Runtime.evaluate',{expression:'globalThis'});try{const r=await c.send('Runtime.callFunctionOn',{objectId:g.result.objectId,functionDeclaration:fn.toString(),arguments:args.map(value=>({value})),returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}finally{await c.send('Runtime.releaseObject',{objectId:g.result.objectId}).catch(()=>{})}};
const api=(h,m,...args)=>call(h,async function(m,args){return await BlancPrototypeHost.api[m](...args)},m,args);
const snap=h=>api(h,'getAllTabs');
const launch=async()=>{const log=fs.openSync(root+'/'+label+'.browser.log','a');proc=spawn('/Users/anthonyjloria/Projects/BlancChromium157/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--blanc-prototype-assets=/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/generated','--no-first-run','--no-default-browser-check','--use-mock-keychain','--enable-features=EncryptSessionStorage:stage/write_encrypted_read_prefer_encrypted','--hide-crash-restore-bubble','about:blank'],{stdio:['ignore',log,log],env:held?{...process.env,DYLD_INSERT_LIBRARIES:root+'/hold.dylib',BLANC_HISTORY_HOLD:root}:process.env});await wait(list,x=>x?.some(t=>t.url.includes('/host.html')));browser=await attach(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()))};
const host=privateMode=>wait(async()=>{for(const t of (await list()).filter(t=>t.url.includes('/host.html'))){const c=await attach(t);const s=await snap(c).catch(()=>null);if(s&&s.tabs.some(t=>t.private)===privateMode)return c}return null},Boolean);
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<title>Split rail fixture</title><h1>Fixture</h1>')});await new Promise(r=>server.listen(9298,'127.0.0.1',r));
try{
await launch();let h=await host(false);
for(const n of ['a','b','keep'])await api(h,'createTab','http://127.0.0.1:9298/#'+n);
let s=await wait(()=>snap(h),s=>s?.tabs.filter(t=>t.url.includes('9298')).length===3&&s.tabs.every(t=>!t.isLoading));
for(const t of s.tabs.filter(t=>!t.url.includes('9298')))await api(h,'closeTab',t.id);
const a=s.tabs.find(t=>t.url.endsWith('#a')).id,b=s.tabs.find(t=>t.url.endsWith('#b')).id;
await api(h,'createSplit',a,b);await api(h,'resizeSplit',[a,b],.35);await api(h,'switchTab',b);
await browser.send('Target.createTarget',{url:'http://127.0.0.1:9298/#decoy',newWindow:true});
const other=await wait(async()=>{for(const t of (await list()).filter(t=>t.url.includes('host.html'))){const c=await attach(t);const x=await snap(c);if(x.tabs.some(t=>t.url.endsWith('#decoy')))return c}return null},Boolean);
const sourceBefore=await snap(h),otherBefore=await snap(other),foreign=otherBefore.tabs.find(t=>t.url.endsWith('#decoy')).id;
await assert.rejects(api(other,'moveTab',a,{groupId:null,beforeId:foreign}),/Tab no longer exists/);
assert.equal(await api(h,'moveTab',a,{groupId:null,beforeId:foreign}),false);
assert.deepEqual((await snap(h)).tabs.map(t=>t.id),sourceBefore.tabs.map(t=>t.id));assert.deepEqual((await snap(other)).tabs.map(t=>t.id),otherBefore.tabs.map(t=>t.id));record('foreign-window move source and destination refused unchanged',{source:await snap(h),destination:await snap(other)});
await api(h,'closeSplit',a);s=await wait(()=>snap(h),x=>x.closed.at(-1)?.title==='Split view');record('seed latest closed split',s.closed);
await pause(5000);proc.kill('SIGKILL');await wait(async()=>proc.signalCode,x=>x==='SIGKILL');clients.forEach(c=>c.close());
const clear=profile+'/Default/Sessions';const removed=[];for(const n of fs.readdirSync(clear).filter(n=>n.startsWith('Session_')||n.startsWith('Tabs_'))){fs.rmSync(clear+'/'+n);removed.push(n);}const encrypted=fs.readdirSync(profile+'/Default/Sessions_Encrypted');assert(encrypted.some(n=>n.startsWith('Session_')));assert(encrypted.some(n=>n.startsWith('Tabs_')));record('encrypted open and closed history retained; clear records removed',{removed,encrypted});const damaged=[];for(const n of encrypted){if(!(n.startsWith('Tabs_')||n.startsWith('Session_')))continue;if('both'==='tabs'&&!n.startsWith('Tabs_'))continue;if('both'==='session'&&!n.startsWith('Session_'))continue;const p=profile+'/Default/Sessions_Encrypted/'+n;const bytes=fs.readFileSync(p);const altered='both'==='both'?bytes.subarray(0,3):Buffer.concat([Buffer.alloc(8,255),bytes.subarray(8)]);fs.writeFileSync(p,altered);damaged.push({file:n,before:bytes.length,after:altered.length});}assert(damaged.length);record('corrupted encrypted records with plaintext absent',damaged);
await launch();h=await host(false);await pause(1500);
const snapshots=async()=>{const result=[];for(const t of (await list()).filter(t=>t.url.includes('host.html'))){const ready=await attach(t);result.push(await wait(()=>snap(ready),Boolean))}return result};
for(let i=0;i<6;i++){if(!(await snap(h)).closed.length)break;await api(h,'previewPageCommand','restore');await pause(300);}
let all=await snapshots();record('bounded restoration after corruption',all);const tabs=all.flatMap(w=>w.tabs);
if('both'!=='session'){assert.equal(all.flatMap(w=>w.splits).length,0);assert(!tabs.some(t=>t.url.endsWith('#a')||t.url.endsWith('#b')));}else{assert.equal(all.flatMap(w=>w.splits).length,1);}
if('both'!=='tabs'){assert(!tabs.some(t=>t.url.endsWith('#keep')||t.url.endsWith('#decoy')));}else{for(const suffix of ['#keep','#decoy'])assert.equal(tabs.filter(t=>t.url.endsWith(suffix)).length,1);}
record('unaffected store survives and damaged history is not claimed recovered');
await api(h,'createTab','http://127.0.0.1:9298/#fresh');let fresh=await wait(()=>snap(h),x=>x.tabs.some(t=>t.url.endsWith('#fresh')&&!t.isLoading));const fid=fresh.tabs.find(t=>t.url.endsWith('#fresh')).id;await api(h,'closeTab',fid);await api(h,'previewPageCommand','restore');fresh=await wait(()=>snap(h),x=>x.tabs.some(t=>t.url.endsWith('#fresh')));record('new close and restore works after corruption',fresh);
const newId=fresh.tabs.find(t=>t.url.endsWith('#fresh')).id;await api(h,'closeTab',newId);
proc.kill('SIGKILL');await wait(async()=>proc.signalCode,x=>x==='SIGKILL');record('abrupt crash after fresh close');clients.forEach(c=>c.close());
const clearAgain=profile+'/Default/Sessions';for(const n of fs.readdirSync(clearAgain).filter(n=>n.startsWith('Session_')||n.startsWith('Tabs_')))fs.rmSync(clearAgain+'/'+n);record('plaintext records removed before fresh-history restart');
await launch();h=await host(false);await pause(1500);let restored=[];
for(let i=0;i<10;i++){restored=await snapshots();if(restored.flatMap(w=>w.tabs).some(t=>t.url.endsWith('#fresh')))break;if(!(await snap(h)).closed.length)break;await api(h,'previewPageCommand','restore');await pause(300);}
restored=await snapshots();const count=restored.flatMap(w=>w.tabs).filter(t=>t.url.endsWith('#fresh')).length;assert(count<=1);record('fresh history after abrupt crash',{count,windows:restored});proof.freshRecovered=count===1;
await browser.send('Browser.close').catch(()=>{});await wait(async()=>proc.exitCode,x=>x!==null);assert.equal(proc.exitCode,0);proof.pass=true;
}catch(e){proof.pass=false;proof.error=e.stack;fs.writeFileSync(root+'/release','release');if(proc?.exitCode===null)proc.kill('SIGTERM')}finally{server.close();clients.forEach(c=>c.close());fs.writeFileSync(root+'/'+label+'.json',JSON.stringify(proof,null,2));console.log({pass:proof.pass,checks:proof.checks.length,error:proof.error})}if(!proof.pass)process.exitCode=1;
