import {callFunction} from '../../../cdp-function.mjs';
import fs from 'node:fs';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {connect,pause} from './cdp.mjs';
const root=import.meta.dirname, app='/private/tmp/blanc-l7-repair/Blanc Chromium Preview.app',port=9891;
const report={app,checks:[]}; let child,browser;const clients=[];
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<title>L7 scope sentinel</title><p>Untrusted document</p>')});
await new Promise(r=>server.listen(9890,'127.0.0.1',r));
const check=(name,pass,details)=>{report.checks.push({name,pass:!!pass,details});if(!pass)throw Error(name)};
const list=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
async function wait(fn){for(let i=0;i<150;i++){try{const x=await fn();if(x)return x}catch{}await pause(100)}throw Error('readiness timeout')}
async function client(t){const c=await connect(t);clients.push(c);return c}
async function raw(c,method,args=[],channel='blancPrototype'){
 return callFunction(c,function(channel,method,args){return new Promise(resolve=>{
  const name=channel==='blancPrototype'?'blancPrototypeReply':'blancNewTabReply',previous=window[name],id='l7-'+Math.random();let timer;
  window[name]=(replyId,ok,value)=>{if(replyId!==id)return previous?.(replyId,ok,value);clearTimeout(timer);window[name]=previous;resolve({ok,value})};
  timer=setTimeout(()=>{window[name]=previous;resolve({noReply:true})},1500);chrome.send(channel,[id,method,args]);
 })},[channel,method,args]);
}
try{
 const fd=fs.openSync(root+'/launch.log','w');child=spawn(app+'/Contents/MacOS/Blanc Preview Launcher',['--user-data-dir='+root+'/profile','--remote-debugging-port='+port,'--no-first-run'],{stdio:['ignore',fd,fd]});child.on('exit',()=>child.done=true);
 const t=await wait(async()=> (await list()).find(t=>t.url.endsWith('/host.html')));const host=await client(t);
 const state=await wait(async()=>{const s=await raw(host,'snapshot');return s.value?.tabs?.length&&s.value});
 check('owned Island responds',state.tabs.length===1);
 const id=Number(state.tabs[0].id);
 for(const url of ['javascript:alert(1)','file:///etc/passwd','chrome://settings/','data:text/html,bad']){
  const r=await raw(host,'createTab',[url]);check('createTab refuses '+url,r.ok===false,r);
  const n=await raw(host,'navigate',[id,url]);check('navigate refuses '+url,n.ok===false,n);
 }
 const missing=await raw(host,'switchTab',[2147483000]);check('foreign or stale tab ID refused',missing.ok===false,missing);
 const unknown=await raw(host,'executeShell',['echo should-not-run']);check('unknown method refused',unknown.ok===false,unknown);
 const search=await raw(host,'storeIcon',['http://127.0.0.1:9890/private']);check('store icon cannot target arbitrary endpoint',search.ok===false,search);
 await raw(host,'createTab',['http://127.0.0.1:9890/']);
 const page=await client(await wait(async()=> (await list()).find(t=>t.url==='http://127.0.0.1:9890/')));
 await wait(()=>page.eval("document.title==='L7 scope sentinel'"));
 const permission=await page.eval("Promise.all(['geolocation','camera','microphone'].map(async name=>({name,state:(await navigator.permissions.query({name})).state})))");
 check('web permission states are not pre-granted',permission.every(x=>x.state!=='granted'),permission);
 const newId=(await browserConnect()).targetId;
 const hosts=await wait(async()=>{const a=(await list()).filter(x=>x.url.endsWith('/host.html'));return a.length===2&&a});
 const other=await client(hosts.find(x=>x.id!==t.id));const otherState=await wait(async()=>{const r=await raw(other,'snapshot');return r.value?.tabs?.length&&r.value});
 const foreign=Number(otherState.tabs[0].id);const cross=await raw(host,'closeTab',[foreign]);check('one owner cannot close another window tab',cross.ok===false,cross);
 const after=await raw(other,'snapshot');check('foreign owner sentinel remains',after.value.tabs.some(x=>Number(x.id)===foreign),after.value.tabs.map(x=>x.url));
 const standalone=await browser.send('Target.createTarget',{url:'chrome://blanc-prototype/host.html'});
 const stand=await client(await wait(async()=> (await list()).find(x=>x.id===standalone.targetId)));
 await wait(()=>stand.eval('typeof window.blancPrototypeReply===\'function\''));
 const rejected=await raw(stand,'snapshot');check('navigating directly to host URL gives no native owner',rejected.ok===false,rejected);
 const tab=await browser.send('Target.createTarget',{url:'chrome://newtab/'});const newtab=await client(await wait(async()=> (await list()).find(x=>x.id===tab.targetId)));
 await wait(()=>newtab.eval('typeof window.blancNewTabReply===\'function\''));
 const escalation=await raw(newtab,'clearHistory',[]);check('start page cannot escalate to Island management',escalation.ok===false||escalation.noReply,escalation);
 const unsupported=await raw(newtab,'clearHistory',[],'blancNewTab');check('start-page channel refuses management method',unsupported.ok===false,unsupported);
 const paths=await host.eval("Promise.all(['../../etc/passwd','host.js?extra','not-allowed.js','theme-toolbar.png?aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'].map(async path=>{const r=await fetch('chrome://blanc-prototype/'+path).catch(()=>null);return {path,denied:!r||!r.ok}}))");
 check('privileged asset allowlist and theme identity enforced',paths.every(x=>x.denied),paths);
 report.complete=true;
}catch(e){report.error=String(e)}finally{
 if(child&&!child.done){if(browser)await browser.send('Browser.close').catch(()=>{});for(let i=0;i<100&&!child.done;i++)await pause(100);if(!child.done)child.kill('SIGTERM')}
 for(const c of clients)c.close();
 browser?.close();server.close();fs.writeFileSync(root+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
async function browserConnect(){browser=await client(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()));return browser.send('Target.createTarget',{url:'http://127.0.0.1:9890/other',newWindow:true})}
