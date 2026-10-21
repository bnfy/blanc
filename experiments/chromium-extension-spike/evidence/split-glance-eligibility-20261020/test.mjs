import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-split-eligibility',label=process.argv[2]||'fixed',profile=root+'/profile-'+label,port=9277;
const proof={label,checks:[]},clients=[];let proc;
const record=(name,value)=>proof.checks.push({name,value});
const wait=async(fn,test)=>{for(let i=0;i<200;i++){const x=await fn().catch(()=>null);if(test(x))return x;await pause(100)}throw Error('wait timeout')};
const list=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
const attach=async(t)=>{const c=await connect(t);clients.push(c);return c};
const api=(h,m,...a)=>h.eval(`BlancPrototypeHost.api.${m}(...${JSON.stringify(a)})`);
const shape=s=>({tabs:s.tabs.map(t=>({id:t.id,url:t.url,private:t.private})),splits:s.splits,active:s.activeTabId,glance:s.glanceTabId});
const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html');r.end('<title>Split eligibility fixture</title><h1>Fixture</h1>')});await new Promise(r=>server.listen(9278,'127.0.0.1',r));
try{
const log=fs.openSync(root+'/'+label+'.browser.log','a');
proc=spawn('/Users/anthonyjloria/Projects/BlancChromium157/src/out/BlancPrototype/Blanc Prototype.app/Contents/MacOS/Blanc Prototype',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'--blanc-prototype-assets=/private/tmp/blanc-chromium157-work/experiments/chromium-extension-spike/generated','--no-first-run','--no-default-browser-check','--use-mock-keychain','about:blank'],{stdio:['ignore',log,log]});
await wait(list,x=>x?.some(t=>t.url.includes('/host.html')));const browser=await attach(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()));
for(const privateMode of [false,true]){
let context;
if(privateMode){context=(await browser.send('Target.createBrowserContext')).browserContextId;await browser.send('Target.createTarget',{url:'about:blank',browserContextId:context,newWindow:true})}
const h=await wait(async()=>{for(const t of (await list()).filter(t=>t.url.includes('/host.html'))){const c=await attach(t);const s=await api(c,'getAllTabs').catch(()=>null);if(s&&s.tabs.some(t=>t.private)===privateMode)return c}return null},Boolean);
for(const n of ['a','b','c','d'])await api(h,'createTab',`http://127.0.0.1:9278/#${n}`);
let s=await wait(()=>api(h,'getAllTabs'),s=>s?.tabs.filter(t=>t.url.includes('9278')).length===4 && s.tabs.every(t=>!t.isLoading));const id=n=>s.tabs.find(t=>t.url.endsWith('#'+n)).id;
for(const t of s.tabs.filter(t=>!t.url.includes('9278')))await api(h,'closeTab',t.id);
const a=id('a'),b=id('b'),c=id('c'),d=id('d');
assert.equal(await api(h,'previewSplitPair',a,b),true);await api(h,'switchTab',b);
if(!privateMode)assert.deepEqual((await api(h,'previewSpaceSave','Split source')).names,['Split source']);
const before=shape(await api(h,'getAllTabs'));
const admitted=await api(h,'previewGlancePair',c,d);record('Glance while split visible '+privateMode,{admitted,before,after:shape(await api(h,'getAllTabs'))});
assert.equal(admitted,false);assert.deepEqual(shape(await api(h,'getAllTabs')),before);
await api(h,'switchTab',c);assert.equal(await api(h,'previewGlancePair',c,d),true);record('inactive persistent split permits loose Glance '+privateMode,await api(h,'getAllTabs'));
assert.equal(await api(h,'previewGlanceClose',c),true);s=await api(h,'getAllTabs');assert.equal(s.splits.length,1);assert.deepEqual(s.splits[0].tabIds,[a,b]);record('Glance close preserves persistent split '+privateMode,s);
if(!privateMode){assert((await api(h,'previewSpaceSave','After Glance')).names.includes('After Glance'));record('immediate save after Glance close',true);assert.equal(await api(h,'previewSpaceOpen','Split source'),true);s=await api(h,'getAllTabs');assert.equal(s.splits.length,1);assert.deepEqual(s.splits[0].tabIds.map(id=>s.tabs.find(t=>t.id===id).url),['http://127.0.0.1:9278/#a','http://127.0.0.1:9278/#b']);record('saved Space survives rejected Glance and roundtrip',s)}
if(context)await browser.send('Target.disposeBrowserContext',{browserContextId:context});
}
await browser.send('Browser.close').catch(()=>{});await wait(async()=>proc.exitCode,x=>x!==null);assert.equal(proc.exitCode,0);proof.pass=true;
}catch(e){proof.pass=false;proof.error=e.stack;if(proc?.exitCode===null)proc.kill('SIGTERM')}finally{server.close();clients.forEach(c=>c.close());fs.writeFileSync(root+'/'+label+'.json',JSON.stringify(proof,null,2));console.log({pass:proof.pass,checks:proof.checks.length,error:proof.error})}if(!proof.pass)process.exitCode=1;
