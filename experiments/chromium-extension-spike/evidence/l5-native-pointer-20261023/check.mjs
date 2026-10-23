import fs from 'node:fs';import http from 'node:http';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
import {connect,pause} from '/private/tmp/blanc-l5-owner/cdp.mjs';
const root=import.meta.dirname, mode=process.argv[2]||'regular',port=9873,base='http://127.0.0.1:9872',report={mode,checks:[]};let child,browser;const clients=[];
const check=(name,pass,details)=>{report.checks.push({name,pass:!!pass,details});assert(pass,name)};
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end(`<title>Pane ${q.url}</title><h1>Pane ${q.url}</h1><input id="typing" aria-label="Pane input"><button id="button" onclick="this.textContent='Clicked'">Click test</button><p style="height:2000px">Scroll area</p>`)});await new Promise(r=>server.listen(9872,'127.0.0.1',r));
const list=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
async function wait(f){for(let i=0;i<150;i++){try{const v=await f();if(v)return v}catch{}await pause(100)}throw Error('readiness timeout')}
async function client(t){const c=await connect(t);clients.push(c);return c}
async function invoke(host,method,args=[]){return host.eval(`new Promise((resolve,reject)=>{const id='pane-'+Math.random(),old=window.blancPrototypeReply;const timer=setTimeout(()=>{window.blancPrototypeReply=old;reject(Error('native request timeout'))},15000);window.blancPrototypeReply=(got,ok,value)=>{if(got!==id)return old?.(got,ok,value);clearTimeout(timer);window.blancPrototypeReply=old;ok?resolve(value):reject(Error(value))};chrome.send('blancPrototype',[id,${JSON.stringify(method)},${JSON.stringify(args)}])})`)}
try{
 const app=process.env.BLANC_PANE_APP||'/private/tmp/blanc-chromium157-update/src/out/BlancPrototype/Blanc Prototype.app';
 const binary=app+(process.env.BLANC_PANE_APP?'/Contents/MacOS/Blanc Preview Launcher':'/Contents/MacOS/Blanc Prototype');
 const args=['--user-data-dir='+root+'/profile-'+mode,'--remote-debugging-port='+port,'--no-first-run'];
 if(process.env.BLANC_PANE_MOCK)args.push('--use-mock-keychain');
 if(!process.env.BLANC_PANE_APP)args.push('--use-mock-keychain','--blanc-prototype-assets=/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/generated','--blanc-blocker-assets=/private/tmp/blanc-l5-repair/Blanc Chromium Preview.app/Contents/Resources/BlancBlocker');
 if(mode.startsWith('private'))args.push('--incognito');args.push(base+'/left');
 const fd=fs.openSync(root+'/launch-'+mode+'.log','w');child=spawn(binary,args,{stdio:['ignore',fd,fd]});child.on('exit',()=>child.done=true);
 console.log('phase host');const host=await client(await wait(async()=>(await list()).find(t=>t.url.endsWith('/host.html'))));
 console.log('phase snapshot');await wait(async()=>{const s=await invoke(host,'snapshot');return s.tabs?.length});
 const ver=await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json());browser=await client(ver);
 console.log('phase create right');await invoke(host,'createTab',[base+'/right']);
 console.log('phase pair');let state=await wait(async()=>{const s=await invoke(host,'snapshot');report.lastSnapshot=s;return s.tabs.filter(t=>t.url.startsWith(base)).length===2&&s});
 const left=state.tabs.find(t=>t.url===base+'/left'),right=state.tabs.find(t=>t.url===base+'/right');
 console.log('phase split');await invoke(host,'createSplit',[Number(left.id),Number(right.id)]);
 const lc=await client(await wait(async()=>(await list()).find(t=>t.url===base+'/left'))),rc=await client(await wait(async()=>(await list()).find(t=>t.url===base+'/right')));
 await wait(()=>lc.eval('document.readyState==="complete" && document.title==="Pane /left"'));await wait(()=>rc.eval('document.readyState==="complete" && document.title==="Pane /right"'));
 async function pointer(c,x,y,type='mousePressed'){await c.send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});if(type==='mousePressed')await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1})}
 if(process.env.BLANC_PANE_SETUP_ONLY){console.log('Native owner fixture ready');await new Promise(()=>{});}
 for(const [c,tab,name] of [[rc,right,'right'],[lc,left,'left'],[rc,right,'right-again'],[lc,left,'left-again']]){
  await pointer(c,80,40);const s=await wait(async()=>{const v=await invoke(host,'snapshot');return String(v.activeTabId)===String(tab.id)&&v});check('page click activates '+name,String(s.activeTabId)===String(tab.id),s.activeTabId);
 }
 const point=await rc.eval('(()=>{let r=document.querySelector("#typing").getBoundingClientRect();return {x:r.x+10,y:r.y+10}})()');await pointer(rc,point.x,point.y);await rc.send('Input.insertText',{text:'pane focus'});
 check('input click selects right and keeps typed content',String((await invoke(host,'snapshot')).activeTabId)===String(right.id)&&await rc.eval('document.querySelector("#typing").value==="pane focus"'));
 await invoke(host,'switchTab',[Number(left.id)]);await rc.eval('document.querySelector("#button").click()');await pause(300);check('script click does not activate inactive pane',String((await invoke(host,'snapshot')).activeTabId)===String(left.id));
 await pointer(lc,70,50,'mouseMoved');check('mouse movement does not change active pane',String((await invoke(host,'snapshot')).activeTabId)===String(left.id));
 if(process.env.BLANC_PANE_HOLD){console.log('Visual fixture ready');await new Promise(()=>{});}
 await invoke(host,'removeFromSplit',[Number(right.id)]);await invoke(host,'switchTab',[Number(left.id)]);await rc.eval('document.querySelector("#button").click()');const detached=await invoke(host,'snapshot');check('script action in detached background tab does not activate or split it',String(detached.activeTabId)===String(left.id)&&detached.splits.length===0);
 report.complete=true;
}catch(e){report.error=String(e);process.exitCode=1}finally{
 if(browser)await browser.send('Browser.close').catch(()=>{});for(let i=0;child&&!child.done&&i<100;i++)await pause(100);if(child&&!child.done)child.kill('SIGTERM');for(const c of clients)c.close();server.close();fs.writeFileSync(root+'/report-'+mode+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
