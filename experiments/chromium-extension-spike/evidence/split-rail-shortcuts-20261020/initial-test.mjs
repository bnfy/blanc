import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-split-rail',label=process.argv[2]||'first',port=9287,profile=root+'/profile-'+label;
const proof={checks:[]};const clients=[];let proc;let browser;
const record=(name,value=true)=>proof.checks.push({name,value});
const wait=async(fn,test)=>{for(let i=0;i<200;i++){const x=await fn().catch(()=>null);if(test(x))return x;await pause(100)}throw Error('wait timeout')};
const list=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const attach=async t=>{const c=await connect(t);clients.push(c);return c};
const call=async(c,fn,...args)=>{const g=await c.send('Runtime.evaluate',{expression:'globalThis'});try{const r=await c.send('Runtime.callFunctionOn',{objectId:g.result.objectId,functionDeclaration:fn.toString(),arguments:args.map(value=>({value})),returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}finally{await c.send('Runtime.releaseObject',{objectId:g.result.objectId}).catch(()=>{})}};
const api=(h,m,...args)=>call(h,async function(m,args){return await BlancPrototypeHost.api[m](...args)},m,args);
const snap=h=>api(h,'getAllTabs');
const launch=async()=>{const log=fs.openSync(root+'/'+label+'.browser.log','a');proc=spawn('/Users/anthonyjloria/Projects/BlancChromium157/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--blanc-prototype-assets=/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/generated','--no-first-run','--no-default-browser-check','--use-mock-keychain','--restore-last-session','about:blank'],{stdio:['ignore',log,log]});await wait(list,x=>x?.some(t=>t.url.includes('/host.html')));browser=await attach(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()))};
const host=privateMode=>wait(async()=>{for(const t of (await list()).filter(t=>t.url.includes('/host.html'))){const c=await attach(t);const s=await snap(c).catch(()=>null);if(s&&s.tabs.some(t=>t.private)===privateMode)return c}return null},Boolean);
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<title>Split rail fixture</title><h1>Fixture</h1>')});await new Promise(r=>server.listen(9288,'127.0.0.1',r));
try{await launch();
for(const priv of [false,true]){
 let context;if(priv){context=(await browser.send('Target.createBrowserContext')).browserContextId;await browser.send('Target.createTarget',{url:'about:blank',browserContextId:context,newWindow:true})}
 const h=await host(priv);
 for(const n of ['a','b','c','d','e'])await api(h,'createTab','http://127.0.0.1:9288/#'+n);
 let s=await wait(()=>snap(h),s=>s?.tabs.filter(t=>t.url.includes('9288')).length===5&&s.tabs.every(t=>!t.isLoading));
 for(const t of s.tabs.filter(t=>!t.url.includes('9288')))await api(h,'closeTab',t.id);
 s=await snap(h);const ids=['a','b','c','d','e'].map(n=>s.tabs.find(t=>t.url.endsWith('#'+n)).id);const [a,b,c,d,e]=ids;
 await api(h,'createSplit',a,b);await api(h,'resizeSplit',[a,b],.35);await api(h,'switchTab',b);
 await api(h,'createSplit',c,d);await api(h,'switchTab',d);await api(h,'switchTab',e);
 await api(h,'setTabLayout','vertical');
 await wait(()=>call(h,function(){return document.getElementById('strip').contentDocument.querySelectorAll('.vertical-split-row').length}),x=>x===2);
 record('two rail split rows '+priv,await call(h,function(){return [...document.getElementById('strip').contentDocument.querySelectorAll('.vertical-split-row')].map(x=>({text:x.textContent,aria:x.getAttribute('aria-label')}))}));
 await call(h,function(){document.getElementById('strip').contentDocument.querySelector('.vertical-split-row .vertical-tab-primary').click()});
 s=await wait(()=>snap(h),x=>x?.activeTabId===b);assert.equal(s.splits[0].focusedTabId,b);record('rail uses last focused pane '+priv);
 for(const [cmd,id] of [['slot1',a],['slot2',c],['slot3',e],['slot9',e]]){assert.equal(await api(h,'previewPageCommand',cmd),true);await wait(()=>snap(h),x=>x?.activeTabId===id);record('native '+cmd+' counts split once '+priv)}
 await api(h,'switchTab',a);await api(h,'previewPageCommand','nextTab');await wait(()=>snap(h),x=>x?.activeTabId===b);record('next tab visits next pane '+priv);
 await api(h,'switchTab',b);
 const before=(await snap(h)).closed;
 await call(h,function(){document.getElementById('strip').contentDocument.querySelector('.vertical-split-row .vertical-tab-close').click()});
 s=await wait(()=>snap(h),x=>x?.tabs.length===3&&x.splits.length===1);
 assert(!s.tabs.some(t=>t.id===a||t.id===b));record('rail close closes entire pair '+priv,s);
 if(priv){assert.deepEqual(s.closed,[]);assert.equal(await api(h,'reopenClosedTab'),false);record('private split creates no history');}
 else {
  assert.equal(s.closed.length,before.length+1);const entry=s.closed.at(-1);assert.equal(entry.tabCount,2);record('one native Recently Closed split',entry);
  assert.equal(await api(h,'reopenClosedEntry',entry.id),true);
  s=await wait(()=>snap(h),x=>x?.tabs.length===5&&x.splits.length===2);
  const split=s.splits.find(p=>p.tabIds.some(id=>s.tabs.find(t=>t.id===id).url.endsWith('#a')));assert(split);assert(Math.abs(split.layout.widths[0]-.35)<.001);assert(s.tabs.find(t=>t.id===split.focusedTabId).url.endsWith('#b'));record('Recently Closed restores pair ratio right focus',s);
  await api(h,'closeSplit',split.tabIds[0]);await wait(()=>snap(h),x=>x?.splits.length===1);
  await browser.send('Browser.close').catch(()=>{});await wait(async()=>proc.exitCode,x=>x!==null);assert.equal(proc.exitCode,0);await launch();
  const h2=await host(false);await wait(()=>snap(h2),x=>x?.closed.some(t=>t.tabCount===2));assert.equal(await api(h2,'reopenClosedTab'),true);
  s=await wait(()=>snap(h2),x=>x?.splits.length===2);const p=s.splits.find(p=>p.tabIds.some(id=>s.tabs.find(t=>t.id===id).url.endsWith('#a')));assert(p);assert(Math.abs(p.layout.widths[0]-.35)<.001);record('closed split survives restart',s);
 }
 if(context)await browser.send('Target.disposeBrowserContext',{browserContextId:context});
}
await browser.send('Browser.close').catch(()=>{});await wait(async()=>proc.exitCode,x=>x!==null);assert.equal(proc.exitCode,0);proof.pass=true;
}catch(e){proof.pass=false;proof.error=e.stack;if(proc?.exitCode===null)proc.kill('SIGTERM')}finally{server.close();clients.forEach(c=>c.close());fs.writeFileSync(root+'/'+label+'.json',JSON.stringify(proof,null,2));console.log({pass:proof.pass,checks:proof.checks.length,error:proof.error})}if(!proof.pass)process.exitCode=1;
