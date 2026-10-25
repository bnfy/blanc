import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
const root=path.resolve('flatpak-evidence');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const run=args=>spawnSync('flatpak',args,{encoding:'utf8'});
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<title>Blanc Flatpak sandbox probe</title><h1 id="probe">blanc-flatpak-1431</h1><script>localStorage.setItem("probe","persisted")</script>');}).listen(8771,'127.0.0.1');
async function cdp(url){
 const socket=new WebSocket(url);
 await new Promise((res,rej)=>{socket.onopen=res;socket.onerror=rej;});let id=0;const pending=new Map();
 socket.onmessage=e=>{const d=JSON.parse(e.data);const p=pending.get(d.id);if(p){pending.delete(d.id);d.error?p.reject(Error(JSON.stringify(d.error))):p.resolve(d.result);}};
 return {send:(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));}),close:()=>socket.close()};
}
let outcomes=[];
for(const mode of ['baseline','profile','unset','profile-unset','original-launcher','integrated-launcher']){
 run(['kill','com.blancbrowser.Blanc']); await delay(1000);
 const remove=['unset','profile-unset','original-launcher','integrated-launcher'].includes(mode);
 const ov=run(['override','--user',remove?'--unset-env=CHROME_DESKTOP':'--env=CHROME_DESKTOP=com.blancbrowser.Blanc.desktop','com.blancbrowser.Blanc']);
 if(ov.status)throw Error(ov.stderr);
 fs.writeFileSync(`${root}/${mode}.overrides`,run(['override','--user','--show','com.blancbrowser.Blanc']).stdout);
 const log=fs.openSync(`${root}/${mode}.log`,'w');
 const child=spawn('flatpak',['run',`--env=BLANC_FLATPAK_CASE=${mode}`,'com.blancbrowser.Blanc'],{stdio:['ignore',log,log]});
 let pages=[];let ready=false;
 for(let i=0;i<45;i++){await delay(1000);try{pages=await(await fetch('http://127.0.0.1:9222/json/list')).json();if(pages.some(p=>p.type==='page'&&!p.url.startsWith('devtools:'))){ready=true;break;}}catch{}if(child.exitCode!==null)break;}
 const result={mode,removeDesktop:remove,exitCode:child.exitCode,pages,ready};
 if(ready){try{
  const target=pages.find(p=>p.type==='page'&&!p.url.startsWith('blanc-chrome:')&&!p.url.startsWith('devtools:'));
  if(!target)throw Error('No real content page');
  const client=await cdp(target.webSocketDebuggerUrl);
  await client.send('Page.enable');await client.send('Page.navigate',{url:'http://127.0.0.1:8771/probe'});await delay(2500);
  result.browsing=await client.send('Runtime.evaluate',{expression:'({title:document.title,probe:document.querySelector("#probe")?.textContent,nodeExposed:typeof require!=="undefined",storage:localStorage.getItem("probe")})',returnByValue:true});
  await client.send('Page.reload');await delay(1500);
  result.reload=await client.send('Runtime.evaluate',{expression:'({title:document.title,storage:localStorage.getItem("probe")})',returnByValue:true});
  const shot=await client.send('Page.captureScreenshot');fs.writeFileSync(`${root}/${mode}.png`,Buffer.from(shot.data,'base64'));client.close();
 }catch(e){result.browsingError=String(e);}}
 const inspection=spawnSync('sudo',['python3','scripts/flatpak-inspect.py'],{encoding:'utf8'});
 fs.writeFileSync(`${root}/${mode}.processes.json`,inspection.stdout);
 try{result.processes=JSON.parse(inspection.stdout);}catch{result.inspectionError=inspection.stderr;}
 fs.writeFileSync(`${root}/${mode}.result.json`,JSON.stringify(result,null,2));outcomes.push(result);
 console.log(JSON.stringify({mode,ready,exitCode:result.exitCode,browsing:result.browsing,browsingError:result.browsingError}));
 run(['kill','com.blancbrowser.Blanc']);await delay(1000);fs.closeSync(log);
}
server.close();fs.writeFileSync(`${root}/results.json`,JSON.stringify(outcomes,null,2));
const candidate=outcomes.find(r=>r.mode==='integrated-launcher');
if(!candidate?.ready||candidate.browsing?.result?.value?.probe!=='blanc-flatpak-1431')throw Error('Integrated launcher browsing failed');
const rows=candidate.processes||[];const browser=rows.find(r=>!r.cmd.includes('--type='));const renderers=rows.filter(r=>r.cmd.includes('--type=renderer'));
if(!browser||!renderers.length)throw Error('Missing browser/renderer process evidence');
for(const renderer of renderers){
 if(/--(?:no-sandbox|no-zygote-sandbox|disable-seccomp-filter-sandbox|disable-setuid-sandbox)(?:\s|=|$)/.test(renderer.cmd))throw Error('Sandbox-disabling argument');
 if(renderer.status.Seccomp!=='2'||renderer.status.NoNewPrivs!=='1')throw Error('Renderer kernel sandbox missing');
 if(renderer.ns.pid===browser.ns.pid||renderer.ns.net===browser.ns.net)throw Error('Renderer namespace isolation missing');
 if(!renderer.maps.some(m=>m.includes('libzypak')))throw Error('zypak preload missing');
}
console.log('Candidate browsing and renderer sandbox checks passed');
