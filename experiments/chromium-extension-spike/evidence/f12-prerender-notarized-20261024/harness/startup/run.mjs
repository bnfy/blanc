import {callFunction} from '/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/cdp-function.mjs';
import fs from 'node:fs';import http from 'node:http';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';import {connect,pause} from './cdp.mjs';
const root=import.meta.dirname,app=process.argv[2],port=9953,origin='http://127.0.0.1:9952';
const report={app,checks:[],mode:process.argv[3]};const save=()=>fs.writeFileSync(root+'/verification-'+process.argv[3]+'.json',JSON.stringify(report,null,2));let child,host,browser;const clients=[];
const server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(`<title>Startup </title><h1>Startup </h1><script>const label=location.pathname;document.title+=label;document.querySelector("h1").textContent+=label;</script>`)});await new Promise((res,rej)=>server.once('error',rej).listen(9952,'127.0.0.1',res));
const list=()=>fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)}).then(r=>r.json());
const wait=async(fn,test)=>{for(let i=0;i<200;i++){let v=await fn().catch(()=>null);if(test(v))return v;await pause(100)}throw Error('Readiness deadline')};
const attach=async t=>{const c=await connect(t);clients.push(c);return c};
const state=()=>host.eval('BlancPrototypeHost.api.getAllTabs()');
const snapshot=async()=>{const s=await state();return {urls:s.tabs.map(t=>t.url),selected:s.tabs.findIndex(t=>t.id===s.activeTabId)}};
async function start(profile,extra=[]){const fd=fs.openSync(root+'/browser.log','a');child=spawn(app+'/Contents/MacOS/Blanc Preview Launcher',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--no-first-run',...extra],{stdio:['ignore',fd,fd]});child.on('exit',(code,signal)=>child.result={code,signal});host=await wait(async()=>{const t=(await list()).find(t=>t.url.endsWith('/host.html'));if(!t)return;const c=await attach(t);if((await c.eval('BlancPrototypeHost.api.getAllTabs()'))?.tabs?.length)return c},Boolean);browser=await attach(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()))}
async function stop(){await browser.send('Browser.close').catch(()=>{});await wait(async()=>child.result,Boolean);assert.equal(child.result.code,0);clients.splice(0).forEach(c=>c.close())}
async function setStartupPrefs(values){
 const {targetId}=await browser.send('Target.createTarget',{url:'chrome://settings/onStartup'});
 const target=await wait(async()=>(await list()).find(t=>t.id===targetId),Boolean);const c=await attach(target);
 await wait(()=>c.eval('typeof chrome.settingsPrivate?.setPref'),x=>x==='function');
 for(const [name,value]of Object.entries(values)){
  const result=await callFunction(c,function(name,value){return new Promise((r,j)=>chrome.settingsPrivate.setPref(name,value,'',ok=>chrome.runtime.lastError?j(Error(chrome.runtime.lastError.message)):r(ok)))},[name,value],true);assert.equal(result,true);
  const actual=await callFunction(c,function(name){return new Promise(r=>chrome.settingsPrivate.getPref(name,r))},[name],true);assert.deepEqual(actual.value,value);
 }
 await browser.send('Target.closeTarget',{targetId});await wait(state,s=>!s.tabs.some(t=>t.url.startsWith('chrome://settings')));c.close();
}
const base=root+'/'+process.argv[3];fs.mkdirSync(base,{recursive:false});
const check=(name,value,details)=>{report.checks.push({name,pass:!!value,details});save();assert(value,name)};
const clone=(name)=>{const dest=base+'/'+name;fs.cpSync(base+'/saved',dest,{recursive:true});return dest};
try{
 const profile=base+'/normal';await start(profile);
 await host.eval(`BlancPrototypeHost.api.createTab(${JSON.stringify(origin+'/one')})`);await host.eval(`BlancPrototypeHost.api.createTab(${JSON.stringify(origin+'/two')})`);
 await wait(state,s=>s.tabs.filter(t=>t.url.startsWith(origin)&&!t.isLoading).length===2);
 const before=await snapshot();check('two loaded pages and selection captured',before.urls.filter(u=>u.startsWith(origin)).length===2,before);await stop();fs.cpSync(profile,base+'/saved',{recursive:true});
 for(let i=1;i<=2;i++){await start(profile);await wait(state,s=>s.tabs.filter(t=>t.url.startsWith(origin)&&!t.isLoading).length===2);const after=await snapshot();check('normal restart '+i+' restores exact tabs and selection without restore flag',JSON.stringify(before)===JSON.stringify(after),after);await stop()}
 const blank=clone('explicit-newtab');await start(blank);await setStartupPrefs({'session.restore_on_startup':5});await stop();await start(blank);let s=await snapshot();check('explicit native New Tab preference is honored',!s.urls.some(u=>u.startsWith(origin)),s);await stop();
 const urls=clone('explicit-urls');await start(urls);await setStartupPrefs({'session.startup_urls':[origin+'/policy'],'session.restore_on_startup':4});await stop();await start(urls);await wait(state,s=>s.tabs.some(t=>t.url===origin+'/policy'&&!t.isLoading));s=await snapshot();check('explicit native startup URL preference is honored',s.urls.includes(origin+'/policy')&&!s.urls.includes(origin+'/one')&&!s.urls.includes(origin+'/two'),s);await stop();
 const privateProfile=clone('private');await start(privateProfile,['--incognito']);let privateState=await state();check('private-only launch does not restore regular pages',privateState.tabs.every(t=>t.private)&&!privateState.tabs.some(t=>t.url.startsWith(origin)),privateState.tabs.map(t=>({url:t.url,private:t.private})));await host.eval(`BlancPrototypeHost.api.createTab(${JSON.stringify(origin+'/private')})`);await wait(state,s=>s.tabs.some(t=>t.url===origin+'/private'&&!t.isLoading));await stop();
 await start(privateProfile);await wait(state,s=>s.tabs.filter(t=>t.url.startsWith(origin)&&!t.isLoading).length===2);s=await snapshot();check('regular session survives private-only quit and restart without private page',JSON.stringify(before)===JSON.stringify(s)&&!s.urls.includes(origin+'/private'),s);await stop();report.complete=true;
}catch(e){report.error=String(e);if(child&&!child.result){try{await stop()}catch{child.kill('SIGTERM')}}}
finally{server.close();save();console.log(JSON.stringify(report));}
if(report.error)process.exitCode=1;
