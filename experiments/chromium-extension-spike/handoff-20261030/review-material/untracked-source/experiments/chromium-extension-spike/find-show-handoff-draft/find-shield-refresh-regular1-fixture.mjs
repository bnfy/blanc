import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {connect,pause} from '../evidence/tab-selection-port-20261028/cdp.mjs';
const base='<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview';
const evidence=base+'/repo/experiments/chromium-extension-spike/evidence/find-158-20261029';
const app=base+'/workspaces/Chromium158-combined-copy-20261029/src/out/BlancPrototype/Blanc Prototype.app/Contents';
const assets=base+'/artifacts/start-page-settings-shield-refresh-v2-20261030';
const blocker=base+'/artifacts/procedural-groups-combined-20261028';
const profile=evidence+'/profile-find-shield-refresh-regular1',result=evidence+'/find-shield-refresh-regular1.json';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const exe=app+'/MacOS/Blanc Prototype',framework=app+'/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework';
const proof={label:'find-shield-refresh-regular1',checks:[],status:'started',qualification:'Isolated regular 158 groups candidate; Host entry, wait for overlay find mode, and script-dispatched UI events; native Cmd-F shortcut, physical keyboard/focus and full platform parity not established. Loopback proxy and resolver do not prove host-wide network isolation.',assetsManifestSha256:sha(base+'/evidence/start-page-settings-shield-refresh-v2-20261030/manifest.json'),frameworkSha256:sha(framework),scriptSha256:sha(new URL(import.meta.url)),outputs:[]};
if(proof.frameworkSha256!=='237242c7e2ddfab4d8fa49528b98a130c1e11dff9f80ffa1db39c0cdc8c06fa1'||fs.existsSync(profile)||fs.existsSync(result))throw Error('unexpected framework or existing fixture');
const appRoot=app.slice(0,-'/Contents'.length);const appManifest=JSON.parse(fs.readFileSync(base+'/evidence/start-page-groups-20261029/build-closure1/app-inventory.json','utf8'));let appCount=0;for(const [rel,want] of Object.entries(appManifest)){const p=appRoot+'/'+rel,st=fs.lstatSync(p);if(want.symlink!==undefined){if(!st.isSymbolicLink()||fs.readlinkSync(p)!==want.symlink)throw Error('app symlink mismatch '+rel)}else if(!st.isFile()||sha(p)!==want.sha256)throw Error('app file mismatch '+rel);appCount++}if(appCount!==353)throw Error('app inventory count mismatch');proof.appInventoryEntries=appCount;
const manifest=JSON.parse(fs.readFileSync(base+'/evidence/start-page-settings-shield-refresh-v2-20261030/manifest.json','utf8'));for(const [rel,want] of Object.entries(manifest.files)){const p=assets+'/'+rel;if(fs.lstatSync(p).isSymbolicLink()||sha(p)!==want)throw Error('candidate asset mismatch '+rel)}if(Object.keys(manifest.files).length!==78||proof.assetsManifestSha256!=='e39e49680b9e82ba47708e3bca1200026c90301deafc372f1d56a755a3b4eeab')throw Error('candidate identity mismatch');
const sockets=new Set(),track=s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));};
const proxy=net.createServer(s=>{track(s);s.destroy()});
const server=http.createServer((req,res)=>{if(req.url==='/find'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<!doctype html><title>Find Keyboard Fixture</title><p>raven raven raven</p>');} else {res.writeHead(404);res.end();}});
server.on('connection',track);
const listen=s=>new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve)});
const wait=async(fn,condition,label)=>{let last;for(let i=0;i<120;i++){last=await fn();if(condition(last))return last;await pause(100)}throw Error('timeout '+label+' last='+JSON.stringify(last));};
let proc,browser,host,page,exit=null;
try {
 await listen(proxy);await listen(server);fs.mkdirSync(profile,{mode:0o700});
 const log=fs.openSync(evidence+'/find-shield-refresh-regular1-browser.log','wx');
 const url=`http://127.0.0.1:${server.address().port}/find`;
 proc=spawn(exe,[`--user-data-dir=${profile}`,'--remote-debugging-port=0',`--blanc-prototype-assets=${assets}`,`--blanc-blocker-assets=${blocker}`,`--proxy-server=http://127.0.0.1:${proxy.address().port}`,'--proxy-bypass-list=127.0.0.1;localhost','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1','--disable-background-networking','--disable-quic','--no-first-run','--no-default-browser-check','--use-mock-keychain',url],{stdio:['ignore',log,log]});fs.closeSync(log);proc.on('exit',(code,signal)=>{exit={code,signal}});
 const port=await wait(()=>{try{return +fs.readFileSync(profile+'/DevToolsActivePort','utf8').split('\n')[0]}catch{return 0}},x=>x>0,'owned CDP port');
 const list=async()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
 const version=await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json());browser=await connect(version);
 const hosts=await wait(list,x=>x.some(t=>t.url.includes('host.html'))&&x.some(t=>t.url===url),'owned host and page');
 host=await connect(hosts.find(t=>t.url.includes('host.html')));page=await connect(hosts.find(t=>t.url===url));
 const snapshot=await wait(()=>host.eval('window.BlancPrototypeHost?.api.getAllTabs()'),x=>x?.tabs?.some(t=>t.url===url&&t.id===x.activeTabId&&!t.private),'regular active tab');
 proof.checks.push({check:'isolated regular fixture',passed:true,activeTabId:snapshot.activeTabId});
 const pageReady=await wait(()=>page.eval(`({url:location.href,ready:document.readyState,text:document.body?.innerText??''})`),x=>x?.url===url&&x.ready==='complete'&&x.text.includes('raven raven raven'),'page content loaded');
 proof.checks.push({check:'actual target content and load ready',passed:true,ready:pageReady.ready});
 await page.send('Page.bringToFront');await pause(300);
 const key=async(client,key,code,modifiers=0,virtual=0)=>{await client.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code,modifiers,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual});await client.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual});};
 await host.eval(`(()=>{window.__findTrace=[];const originalSend=chrome.send.bind(chrome);chrome.send=(method,args)=>{if(method==='blancPrototype'&&args?.[1]==='find')window.__findTrace.push({event:'send',args});return originalSend(method,args)};const prior=window.BlancPrototypeHost.findResult;window.BlancPrototypeHost.findResult=(...args)=>{window.__findTrace.push({event:'result',args});return prior(...args)};window.BlancPrototypeHost.api.onFindResult(x=>window.__findTrace.push({event:'observer',data:x}));})();`);
 await host.eval('window.BlancPrototypeHost.api.openFindBar()');
 await wait(()=>host.eval("!document.querySelector('#overlay').hidden && !!document.querySelector('#overlay').contentDocument?.querySelector('#findInput')"),Boolean,'host-opened find capsule');
 proof.checks.push({check:'host entry opens visible capsule',passed:true});
 await wait(()=>host.eval("document.querySelector('#overlay').contentDocument?.body?.dataset?.mode"),x=>x==='find','overlay onOverlayShow find mode');
 proof.checks.push({check:'overlay received find mode before input',passed:true});
 await host.eval(`(()=>{const input=document.querySelector('#overlay').contentDocument.querySelector('#findInput');input.value='raven';input.dispatchEvent(new input.ownerDocument.defaultView.Event('input',{bubbles:true}));})()`);
 const count=await wait(()=>host.eval("document.querySelector('#overlay').contentDocument.querySelector('#findCount').textContent"),x=>x==='1/3','type to find first result');
 proof.checks.push({check:'typed query updates visible count',passed:count==='1/3',count});
 await host.eval(`(()=>{const f=document.querySelector('#overlay');f.contentDocument.querySelector('#findInput').dispatchEvent(new f.contentWindow.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);
 const next=await wait(()=>host.eval("document.querySelector('#overlay').contentDocument.querySelector('#findCount').textContent"),x=>x==='2/3','Enter next result');
 proof.checks.push({check:'Enter advances visible result',passed:next==='2/3',count:next});
 await host.eval(`document.querySelector('#overlay').contentDocument.querySelector('#findCloseBtn').click()`);
 await wait(()=>host.eval("document.querySelector('#overlay').hidden"),Boolean,'close button closes capsule');
 proof.checks.push({check:'close button closes capsule',passed:true});proof.status='passed';
} catch(e){proof.status='failed';proof.error=String(e?.stack||e);if(host)try{proof.diagnostic=await host.eval(`({trace:window.__findTrace??[],hostVisibility:document.visibilityState,status:document.querySelector('#status')?.textContent,mode:document.querySelector('#overlay')?.contentDocument?.body?.dataset?.mode,input:document.querySelector('#overlay')?.contentDocument?.querySelector('#findInput')?.value})`)}catch(e){proof.diagnosticError=String(e)}} finally {
 if(browser)try{await browser.send('Browser.close')}catch(e){proof.outputs.push('owned Browser.close: '+String(e))}
 for(const c of [host,page,browser])try{c?.close()}catch{}
 if(proc)for(let i=0;i<50&&!exit;i++)await pause(100);
 if(proc&&!exit){proof.outputs.push('owned browser remained running; profile preserved');try{proc.kill('SIGTERM')}catch{}for(let i=0;i<50&&!exit;i++)await pause(100)}
 proof.browserExit=exit;
 for(const s of sockets)s.destroy();await Promise.all([new Promise(r=>proxy.close(r)),new Promise(r=>server.close(r))]);
 if(proof.status==='passed'&&exit?.code===0){fs.rmSync(profile,{recursive:true});proof.profile='owned cleanly exited fixture profile removed'}else proof.profile='preserved for failure investigation';
 fs.writeFileSync(result,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(proof));
}
if(proof.status!=='passed'||proof.browserExit?.code!==0)process.exitCode=1;
