import fs from 'node:fs';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {connect,pause} from './cdp.mjs';
const root=import.meta.dirname,app=root+'/Blanc Chromium Preview.app';
const report={app,checks:[],runs:[]};
const check=(name,pass,details)=>{report.checks.push({name,pass:!!pass,details});if(!pass)throw Error(name)};
const flags=['--blanc-ubo-reload-probe','--blanc-ubo-document-start','--blanc-ubo-component-probe=/missing','--blanc-renderer-token-mismatch-probe','--blanc-worker-update-log=/missing'];
for(const flag of flags){const r=spawnSync(app+'/Contents/MacOS/Blanc Preview Launcher',[flag]);check('launcher refuses '+flag,r.status===64,{status:r.status});}
let hits=[],upgrades=[],child,browser;
const server=http.createServer((q,r)=>{hits.push({host:q.headers.host,url:q.url});if(q.url==='/sw.js'){r.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});r.end('self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",e=>e.waitUntil(clients.claim()));');return;}r.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});r.end('<title>L7 enforcement control</title>');});
server.on('upgrade',(q,s)=>{upgrades.push(q.headers.host);s.on('error',()=>{});const accept=createHash('sha1').update(q.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');s.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');s.write(Buffer.from([0x81,2,111,107]));});
await new Promise(r=>server.listen(9892,'127.0.0.1',r));
async function until(fn){for(let i=0;i<150;i++){try{const x=await fn();if(x)return x}catch{}await pause(100)}throw Error('readiness timeout')}
try{for(const mode of ['regular','private']){
 const d=root+'/hooks-'+mode;fs.mkdirSync(d,{recursive:true});fs.writeFileSync(d+'/worker.jsonl','');fs.writeFileSync(d+'/blocker.jsonl','');hits=[];upgrades=[];
 const fd=fs.openSync(d+'/launch.log','w');const args=['--user-data-dir='+d+'/profile','--remote-debugging-port=9893','--no-first-run','--proxy-server=direct://','--host-resolver-rules=MAP 000491b06a.com 127.0.0.1',...flags.slice(0,4),'--blanc-ubo-offline-probe','--blanc-ubo-component-manifest={}','--blanc-worker-update-log='+d+'/worker.jsonl','--blanc-blocker-log='+d+'/blocker.jsonl','--blanc-prototype-assets='+app+'/Contents/Resources/BlancAssets','--blanc-blocker-assets='+app+'/Contents/Resources/BlancBlocker'];if(mode==='private')args.push('--incognito');
 child=spawn(app+'/Contents/MacOS/Blanc Prototype',args,{stdio:['ignore',fd,fd]});child.on('exit',()=>child.done=true);
 const list=()=>fetch('http://127.0.0.1:9893/json/list').then(r=>r.json());
 browser=await connect(await until(()=>fetch('http://127.0.0.1:9893/json/version').then(r=>r.json())));
 const host=await connect(await until(async()=>(await list()).find(x=>x.url.endsWith('/host.html'))));
 await until(async()=> (await host.eval('BlancPrototypeHost.api.getAllTabs()'))?.tabs?.length);
 await host.eval("BlancPrototypeHost.api.createTab('http://127.0.0.1:9892/entry')");
 const page=await connect(await until(async()=>(await list()).find(x=>x.url==='http://127.0.0.1:9892/entry')));
 await until(()=>page.eval("document.title==='L7 enforcement control'"));check(mode+' native entry works despite obsolete probe switches',true);
 const httpResult=await page.eval("Promise.all(['http://127.0.0.1:9892/allow','http://000491b06a.com:9892/block'].map(async url=>{try{return {url,ok:(await fetch(url)).ok}}catch{return {url,ok:false}}}))");
 check(mode+' HTTP allow/block preserved',httpResult[0].ok&&!httpResult[1].ok,httpResult);
 const socketResult=await page.eval("Promise.all(['ws://127.0.0.1:9892/socket','ws://000491b06a.com:9892/socket'].map(url=>new Promise(resolve=>{const s=new WebSocket(url);const timer=setTimeout(()=>{s.close();resolve('timeout')},5000);s.onmessage=e=>{clearTimeout(timer);s.close();resolve(e.data)};s.onerror=()=>{clearTimeout(timer);resolve('blocked')}})))");
 check(mode+' WebSocket allow/block preserved',socketResult[0]==='ok'&&socketResult[1]==='blocked',socketResult);
 check(mode+' denied hosts never reach fixture',hits.every(x=>new URL('http://'+x.host).hostname!=='000491b06a.com')&&upgrades.every(x=>new URL('http://'+x).hostname!=='000491b06a.com'),{hits,upgrades});
 await page.eval("navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).then(r=>r.update()).then(()=>true)");
 await pause(500);check(mode+' worker diagnostic remains disabled',fs.readFileSync(d+'/worker.jsonl','utf8')==='');check(mode+' blocker diagnostic remains disabled',fs.readFileSync(d+'/blocker.jsonl','utf8')==='');
 page.close();host.close();await browser.send('Browser.close').catch(()=>{});browser.close();await until(()=>child.done);check(mode+' native instance exits cleanly',child.done);report.runs.push({mode,hits,upgrades});child=null;browser=null;
}report.complete=true;}catch(e){report.error=String(e);}finally{if(browser){await browser.send('Browser.close').catch(()=>{});browser.close()}if(child&&!child.done)child.kill('SIGTERM');server.closeAllConnections();server.close();fs.writeFileSync(root+'/hooks-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
