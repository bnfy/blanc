import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-split-drag',label=process.argv[2]||'first',port=9291,profile=root+'/profile-'+label;
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
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<title>Split rail fixture</title><h1>Fixture</h1>')});await new Promise(r=>server.listen(9292,'127.0.0.1',r));
try{await launch();
for(const priv of [false,true]){
 let context;const regularHistory=priv?(await snap(await host(false))).closed:null;if(priv){context=(await browser.send('Target.createBrowserContext')).browserContextId;await browser.send('Target.createTarget',{url:'about:blank',browserContextId:context,newWindow:true})}
 const h=await host(priv);
 for(const n of ['a','b','c','d','e'])await api(h,'createTab','http://127.0.0.1:9292/#'+n);
 let s=await wait(()=>snap(h),s=>s?.tabs.filter(t=>t.url.includes('9292')).length===5&&s.tabs.every(t=>!t.isLoading));
 for(const t of s.tabs.filter(t=>!t.url.includes('9292')))await api(h,'closeTab',t.id);
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
 await api(h,'groupTabByName',a,'Split group');
 let g=(await snap(h)).groups[0];await api(h,'switchTab',e);await api(h,'toggleGroupCollapsed',g.id);
 await api(h,'previewPageCommand','slot1');s=await wait(()=>snap(h),x=>x?.activeTabId===a&&!x.groups[0].collapsed);record('group shortcut unfolds split cluster '+priv);
 await api(h,'previewPageCommand','slot2');await wait(()=>snap(h),x=>x?.activeTabId===c);record('loose run counts once alongside group '+priv);
 await api(h,'ungroupGroup',g.id);await api(h,'toggleTabPinned',e);await api(h,'previewPageCommand','slot1');await wait(()=>snap(h),x=>x?.activeTabId===e);record('pinned leading shortcut '+priv);await api(h,'toggleTabPinned',e);
 await api(h,'switchTab',b);
 const order=x=>x.tabs.map(t=>t.id);
 assert.equal(await api(h,'moveTab',b,{groupId:null,beforeId:null}),true);
 s=await wait(()=>snap(h),x=>order(x).join() === [c,d,e,a,b].join());assert.equal(s.splits.length,2);assert.equal(s.activeTabId,b);record('whole split moved to end '+priv,s);
 assert.equal(await api(h,'moveTab',a,{groupId:null,beforeId:d}),true);
 s=await wait(()=>snap(h),x=>order(x).join() === [a,b,c,d,e].join());record('drop on second destination pane normalizes boundary '+priv,s);
 await api(h,'groupTabByName',e,'Destination');let destination=(await snap(h)).groups[0].id;
 assert.equal(await api(h,'moveTab',b,{groupId:destination,beforeId:e}),true);
 s=await wait(()=>snap(h),x=>x.tabs.filter(t=>t.groupId===destination).length===3);assert.equal(s.splits.length,2);record('whole split enters group '+priv,s);
 assert.equal(await api(h,'moveTab',a,{groupId:null,beforeId:c}),true);
 s=await wait(()=>snap(h),x=>order(x).join()===[a,b,c,d,e].join()&&!x.tabs.find(t=>t.id===a).groupId);record('whole split leaves group '+priv,s);
 assert.equal(await api(h,'moveTab',a,{groupId:'invalid',beforeId:null}),false);record('unknown group refused '+priv);
 await api(h,'ungroupGroup',destination);
 await pause(300);
 await call(h,function(){const f=document.getElementById('strip');const doc=f.contentDocument;const list=doc.getElementById('verticalTabsList');const row=doc.querySelector('.vertical-split-row');const last=[...doc.querySelectorAll('[data-drag-tab]')].at(-1);const r=row.getBoundingClientRect(),end=last.getBoundingClientRect();const send=(el,type,x,y)=>el.dispatchEvent(new f.contentWindow.PointerEvent(type,{pointerId:7,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y,bubbles:true}));send(row,'pointerdown',r.x+30,r.y+15);send(list,'pointermove',r.x+30,end.bottom-1);send(list,'pointerup',r.x+30,end.bottom-1);list.dispatchEvent(new f.contentWindow.MouseEvent('click',{bubbles:true,cancelable:true}))});
 s=await wait(()=>snap(h),x=>order(x).join()===[c,d,e,a,b].join());record('rail pointer intent moves whole split '+priv,s);
 await api(h,'moveTab',a,{groupId:null,beforeId:c});await wait(()=>snap(h),x=>order(x).join()===[a,b,c,d,e].join());
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
  await api(h,'previewPageCommand','restore');s=await wait(()=>snap(h),x=>x?.splits.length===2);const recent=s.splits.find(p=>p.tabIds.some(id=>s.tabs.find(t=>t.id===id).url.endsWith('#a')));assert(s.tabs.find(t=>t.id===recent.focusedTabId).url.endsWith('#b'));record('native Restore Tab preserves right focus',s);await api(h,'closeSplit',recent.tabIds[0]);await wait(()=>snap(h),x=>x?.splits.length===1);
  await browser.send('Browser.close').catch(()=>{});await wait(async()=>proc.exitCode,x=>x!==null);assert.equal(proc.exitCode,0);await launch();
  const h2=await host(false);const restoredHistory=await wait(()=>snap(h2),x=>x?.closed.some(t=>t.tabCount===2&&t.title==='Split view'));record('history before restart reopen',restoredHistory.closed);assert.equal(await api(h2,'reopenClosedEntry',restoredHistory.closed.find(t=>t.tabCount===2&&t.title==='Split view').id),true);
  await pause(2000);record('restart raw snapshot',await snap(h2));s=await wait(()=>snap(h2),x=>x?.splits.length===2);const p=s.splits.find(p=>p.tabIds.some(id=>s.tabs.find(t=>t.id===id).url.endsWith('#a')));assert(p);assert(Math.abs(p.layout.widths[0]-.35)<.001);assert(s.tabs.find(t=>t.id===p.focusedTabId).url.endsWith('#b'));record('closed split survives restart with right focus',s);
 }
 if(priv){
  await api(h,'switchTab',c);await api(h,'previewPageCommand','close');
  s=await wait(()=>snap(h),x=>x?.tabs.length===2&&x.splits.length===0);
  assert(s.tabs.some(t=>t.id===d));assert(!s.tabs.some(t=>t.id===c));record('native Close command closes focused pane only');
 }
 if(context){await browser.send('Target.disposeBrowserContext',{browserContextId:context});assert.deepEqual((await snap(await host(false))).closed,regularHistory);record('private closure leaves regular history unchanged');}
}
await browser.send('Browser.close').catch(()=>{});await wait(async()=>proc.exitCode,x=>x!==null);assert.equal(proc.exitCode,0);proof.pass=true;
}catch(e){proof.pass=false;proof.error=e.stack;if(proc?.exitCode===null)proc.kill('SIGTERM')}finally{server.close();clients.forEach(c=>c.close());fs.writeFileSync(root+'/'+label+'.json',JSON.stringify(proof,null,2));console.log({pass:proof.pass,checks:proof.checks.length,error:proof.error})}if(!proof.pass)process.exitCode=1;
