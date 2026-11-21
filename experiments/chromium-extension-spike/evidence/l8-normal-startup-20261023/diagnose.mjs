import fs from 'node:fs';import http from 'node:http';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';import {connect,pause} from './cdp.mjs';
const root=import.meta.dirname,app='/private/tmp/blanc-l8-notices-final/Blanc Chromium Preview.app',port=9953,origin='http://127.0.0.1:9952';
const report={app,checks:[]};const save=()=>fs.writeFileSync(root+'/diagnosis.json',JSON.stringify(report,null,2));let child,host,browser;const clients=[];
const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(`<title>Startup </title><h1>Startup </h1><script>const label=location.pathname;document.title+=label;document.querySelector("h1").textContent+=label;</script>`)});await new Promise((res,rej)=>server.once('error',rej).listen(9952,'127.0.0.1',res));
const list=()=>fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)}).then(r=>r.json());
const wait=async(fn,test)=>{for(let i=0;i<200;i++){let v=await fn().catch(()=>null);if(test(v))return v;await pause(100)}throw Error('Readiness deadline')};
const attach=async t=>{const c=await connect(t);clients.push(c);return c};
const state=()=>host.eval('BlancPrototypeHost.api.getAllTabs()');
const snapshot=async()=>{const s=await state();return {urls:s.tabs.map(t=>t.url),selected:s.tabs.findIndex(t=>t.id===s.activeTabId)}};
async function start(profile,extra=[]){const fd=fs.openSync(root+'/browser.log','a');child=spawn(app+'/Contents/MacOS/Blanc Preview Launcher',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--no-first-run',...extra],{stdio:['ignore',fd,fd]});child.on('exit',(code,signal)=>child.result={code,signal});host=await wait(async()=>{const t=(await list()).find(t=>t.url.endsWith('/host.html'));if(!t)return;const c=await attach(t);if((await c.eval('BlancPrototypeHost.api.getAllTabs()'))?.tabs?.length)return c},Boolean);browser=await attach(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()))}
async function stop(){await browser.send('Browser.close').catch(()=>{});await wait(async()=>child.result,Boolean);assert.equal(child.result.code,0);clients.splice(0).forEach(c=>c.close())}
try{
 const profile=root+'/normal';await start(profile);
 await host.eval(`BlancPrototypeHost.api.createTab(${JSON.stringify(origin+'/one')})`);await host.eval(`BlancPrototypeHost.api.createTab(${JSON.stringify(origin+'/two')})`);
 await wait(state,s=>s.tabs.filter(t=>t.url.startsWith(origin)&&!t.isLoading).length===2);
 report.before=await snapshot();await stop();fs.cpSync(profile,root+'/control',{recursive:true});
 report.preferencesAfterClose=JSON.parse(fs.readFileSync(profile+'/Default/Preferences')).session??null;
 await start(profile);report.normalRestart=await snapshot();report.normalRestores=JSON.stringify(report.before)===JSON.stringify(report.normalRestart);await stop();
 await start(root+'/control',['--restore-last-session']);await wait(state,s=>s.tabs.filter(t=>t.url.startsWith(origin)&&!t.isLoading).length===2);report.forcedRestoreControl=await snapshot();report.controlRestores=JSON.stringify(report.before)===JSON.stringify(report.forcedRestoreControl);await stop();
 report.complete=true;
}catch(e){report.error=String(e);if(child&&!child.result)child.kill('SIGTERM')}
finally{server.close();save();console.log(JSON.stringify(report));}
if(!report.normalRestores||!report.controlRestores)process.exitCode=1;
