import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-split-divider',label=process.argv[2]||'fixed',profile=root+'/profile-'+label,port=9277;
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
await api(h,'groupTabByName',a,'Initiator');await api(h,'groupTabByName',b,'Other');
await api(h,'openIsland');
await wait(()=>h.eval("!!document.getElementById('overlay').contentDocument?.querySelector('[data-tab-id]')"),Boolean);
// Pass the tab identity as protocol data, never executable source.
const menuGlobal=await h.send('Runtime.evaluate',{expression:'globalThis'});
const menuResult=await h.send('Runtime.callFunctionOn',{
  objectId:menuGlobal.result.objectId,
  functionDeclaration:"function(tabId){const f=document.getElementById('overlay');const row=[...f.contentDocument.querySelectorAll('[data-tab-id]')].find(e=>e.dataset.tabId===tabId);if(!row)throw Error('missing initiating row');row.dispatchEvent(new f.contentWindow.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:150}));}",
  arguments:[{value:a}],returnByValue:true,awaitPromise:true,userGesture:true
});
await h.send('Runtime.releaseObject',{objectId:menuGlobal.result.objectId});
if(menuResult.exceptionDetails)throw Error(JSON.stringify(menuResult.exceptionDetails));
await wait(()=>h.eval("[...document.getElementById('overlay').contentDocument.querySelectorAll('.prototype-tab-menu button')].some(b=>b.textContent.startsWith('Split with '))"),Boolean);
record('public Split with menu '+privateMode,await h.eval("document.getElementById('overlay').contentDocument.querySelector('.prototype-tab-menu').innerText"));
await h.eval("[...document.getElementById('overlay').contentDocument.querySelectorAll('.prototype-tab-menu button')].find(b=>b.textContent.startsWith('Split with ')).click()");
await wait(()=>api(h,'getAllTabs'),x=>x?.splits.length===1);

s=await api(h,'getAllTabs');assert.equal(s.tabs.find(t=>t.id===a).groupId,s.tabs.find(t=>t.id===b).groupId);record('initiator group wins '+privateMode,s);
await wait(()=>h.eval("({hidden:document.getElementById('splitHeaders').hidden,count:document.querySelectorAll('.split-pane-header').length,height:document.getElementById('splitHeaders').getBoundingClientRect().height})"),x=>x&&!x.hidden&&x.count===2&&x.height===30);
record('two 30px pane headers '+privateMode,await h.eval("document.getElementById('splitHeaders').outerHTML"));
fs.writeFileSync(root+'/headers-'+privateMode+'.png',Buffer.from((await h.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
record('header geometry '+privateMode,await h.eval("({viewport:innerHeight,rect:document.getElementById('splitHeaders').getBoundingClientRect().toJSON(),private:document.getElementById('splitHeaders').dataset.private})"));
await h.eval("document.querySelectorAll('.split-pane-header')[1].querySelector('.split-pane-title').click()");
await wait(()=>api(h,'getAllTabs'),x=>x?.activeTabId===b);record('header focus routes to second pane '+privateMode,true);
if(!privateMode){const page=await attach((await list()).find(t=>t.url==='http://127.0.0.1:9278/#b'));await page.eval("document.title='Updated pane title'");await wait(()=>h.eval("document.getElementById('splitHeaders').innerText.includes('Updated pane title')"),Boolean);record('live header title update',true);}


const key = async (key, shiftKey = false) => h.eval(`document.getElementById('splitDivider').dispatchEvent(new KeyboardEvent('keydown', {key:${JSON.stringify(key)},shiftKey:${shiftKey},bubbles:true,cancelable:true}))`);
const ratio = async value => wait(()=>api(h,'getAllTabs'), x=>Math.abs(x?.splits?.[0]?.layout.widths[0]-value)<.001);
await key('ArrowRight');await ratio(.52);await key('ArrowLeft',true);await ratio(.47);
await key('Home');await ratio(.2);await key('End');await ratio(.8);await key('Enter');await ratio(.5);
record('keyboard resize, bounds and reset '+privateMode,true);
const r=await h.eval("document.getElementById('splitDivider').getBoundingClientRect().toJSON()");
await h.send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x+4,y:80,button:'left',clickCount:1});
await h.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x+104,y:80,button:'left',buttons:1});
await h.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x+104,y:80,button:'left',clickCount:1});
await wait(()=>api(h,'getAllTabs'),x=>x?.splits?.[0]?.layout.widths[0]>.55);
record('CDP pointer drag routes native widths '+privateMode,await api(h,'getAllTabs'));
await h.eval("document.getElementById('splitDivider').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");await ratio(.5);
assert.equal(await api(h,'resizeSplit',[b,a],.6),false);assert.equal(await api(h,'resizeSplit',[a,c],.6),false);assert.equal(await api(h,'resizeSplit',[a,b],.95),false);await ratio(.5);
record('stale reversed and invalid resize refused '+privateMode,true);
await h.eval("document.querySelectorAll('[data-pane-menu]')[1].click()");
await wait(()=>h.eval("!!document.getElementById('splitPaneMenu')"),Boolean);
await h.eval("document.getElementById('splitPaneMenu').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
await wait(()=>h.eval("!document.getElementById('splitPaneMenu') && document.activeElement?.dataset.paneMenu !== undefined"),Boolean);
record('pane menu Escape returns focus '+privateMode,true);
await h.eval("document.querySelectorAll('[data-pane-menu]')[1].click()");
await wait(()=>h.eval("!!document.getElementById('splitPaneMenu')"),Boolean);
await h.eval("[...document.querySelectorAll('#splitPaneMenu button')].find(x=>x.textContent==='Mute tab').click()");
await wait(()=>api(h,'getAllTabs'),x=>x?.tabs.find(t=>t.id===b)?.muted);
s=await api(h,'getAllTabs');assert.equal(s.tabs.find(t=>t.id===a).muted,false);
record('pane menu mute affects only chosen pane '+privateMode,true);
await key('ArrowRight',true);await ratio(.55);
await api(h,'switchTab',b);
if(!privateMode)assert.deepEqual((await api(h,'previewSpaceSave','Split source')).names,['Split source']);
const before=shape(await api(h,'getAllTabs'));
const admitted=await api(h,'previewGlancePair',c,d);record('Glance while split visible '+privateMode,{admitted,before,after:shape(await api(h,'getAllTabs'))});
assert.equal(admitted,false);assert.deepEqual(shape(await api(h,'getAllTabs')),before);
await api(h,'switchTab',c);assert.equal(await api(h,'previewGlancePair',c,d),true);record('inactive persistent split permits loose Glance '+privateMode,await api(h,'getAllTabs'));
assert.equal(await api(h,'previewGlanceClose',c),true);s=await api(h,'getAllTabs');assert.equal(s.splits.length,1);assert.deepEqual(s.splits[0].tabIds,[a,b]);record('Glance close preserves persistent split '+privateMode,s);
if(!privateMode){assert((await api(h,'previewSpaceSave','After Glance')).names.includes('After Glance'));record('immediate save after Glance close',true);assert.equal(await api(h,'previewSpaceOpen','Split source'),true);s=await api(h,'getAllTabs');assert.equal(s.splits.length,1);assert.deepEqual(s.splits[0].tabIds.map(id=>s.tabs.find(t=>t.id===id).url),['http://127.0.0.1:9278/#a','http://127.0.0.1:9278/#b']);assert(Math.abs(s.splits[0].layout.widths[0]-.55)<.001);record('saved Space preserves divider ratio',s)}
s=await api(h,'getAllTabs');const members=s.splits[0].tabIds;
const menuAction = async (index, label) => {
 await wait(()=>h.eval("document.querySelectorAll('[data-pane-menu]').length"),x=>x===2);
 await h.eval(`document.querySelectorAll('[data-pane-menu]')[${index}].click()`);
 await wait(()=>h.eval("!!document.getElementById('splitPaneMenu')"),Boolean);
 await h.eval(`[...document.querySelectorAll('#splitPaneMenu button')].find(x=>x.textContent===${JSON.stringify(label)}).click()`);
 await wait(()=>h.eval("!document.getElementById('splitPaneMenu')"),Boolean);
};
await menuAction(1,'Reload');await wait(()=>api(h,'getAllTabs'),x=>x?.tabs.every(t=>!t.isLoading));
record('pane menu reload keeps pair '+privateMode,await api(h,'getAllTabs'));
await menuAction(1,'Pin tab');await wait(()=>api(h,'getAllTabs'),x=>x?.splits.length===0&&x.tabs.find(t=>t.id===members[1])?.pinned);
record('pane pin dissolves pair retaining both tabs '+privateMode,await api(h,'getAllTabs'));
await api(h,'toggleTabPinned',members[1]);await api(h,'createSplit',members[0],members[1]);
await menuAction(0,'Remove from Split View');

await wait(()=>api(h,'getAllTabs'),x=>x?.splits.length===0);s=await api(h,'getAllTabs');assert.equal(s.splits.length,0);assert.equal(s.activeTabId,members[0]);assert.equal(s.tabs.findIndex(t=>t.id===members[0]),s.tabs.findIndex(t=>t.id===members[1])+1);record('remove first pane preserves tabs and places it after survivor '+privateMode,s);
await wait(()=>h.eval("document.getElementById('splitHeaders').hidden"),Boolean);
await api(h,'createSplit',members[0],members[1]);
await menuAction(1,'Close tab');
await wait(()=>api(h,'getAllTabs'),x=>x?.splits.length===0&&!x.tabs.some(t=>t.id===members[1]));
s=await api(h,'getAllTabs');assert(s.tabs.some(t=>t.id===members[0]));record('pane close retains survivor '+privateMode,s);
if(context)await browser.send('Target.disposeBrowserContext',{browserContextId:context});
}
await browser.send('Browser.close').catch(()=>{});await wait(async()=>proc.exitCode,x=>x!==null);assert.equal(proc.exitCode,0);proof.pass=true;
}catch(e){proof.pass=false;proof.error=e.stack;if(proc?.exitCode===null)proc.kill('SIGTERM')}finally{server.close();clients.forEach(c=>c.close());fs.writeFileSync(root+'/'+label+'.json',JSON.stringify(proof,null,2));console.log({pass:proof.pass,checks:proof.checks.length,error:proof.error})}if(!proof.pass)process.exitCode=1;
