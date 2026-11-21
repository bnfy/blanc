import {chromium} from '/private/tmp/blanc-chromium157-work/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';import http from 'node:http';import {spawn} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-close-loading-repair', label=process.argv[2]||'before', app=process.argv[3]||root+'/Blanc Chromium Preview.app', port=Number(process.argv[4]||9480);let hold=true;const hits=[];const sockets=new Set();
const server=http.createServer((q,r)=>{hits.push({url:q.url,method:q.method,held:hold});if(hold&&q.url.startsWith('/pending'))return;r.writeHead(200,{'Content-Type':'text/html'});r.end('<title>Isolation fixture</title><p>Loaded</p>');});server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});await new Promise(r=>server.listen(9471,'127.0.0.1',r));
const profile=root+'/'+label+'-profile';const results={label,hits};let running;
async function list(p){return fetch(`http://127.0.0.1:${p}/json/list`,{signal:AbortSignal.timeout(750)}).then(r=>r.json());}
async function launch(p){const fd=fs.openSync(root+'/'+label+'-'+p+'.log','w');const child=spawn(app+'/Contents/MacOS/Blanc Preview Launcher',['--user-data-dir='+profile,'--remote-debugging-port='+p,'--no-first-run','--use-mock-keychain','--restore-last-session'],{stdio:['ignore',fd,fd]});child.done=false;child.on('exit',()=>child.done=true);running=child;for(let i=0;i<80;i++){try{const ts=await list(p);const t=ts.find(t=>t.url.endsWith('/host.html'));if(t){const c=await connect(t);const s=await c.eval('BlancPrototypeHost.api.getAllTabs()');if(s.tabs?.length)return c;c.close();}}catch{}await pause(200);}throw Error('startup timeout '+child.pid);}
async function stop(p){const v=await fetch(`http://127.0.0.1:${p}/json/version`,{signal:AbortSignal.timeout(2000)}).then(r=>r.json());const c=await connect(v);await c.send('Browser.close').catch(()=>{});c.close();for(let i=0;i<80&&!running.done;i++)await pause(125);if(!running.done)throw Error('shutdown timeout '+running.pid);}
const trim=s=>({tabs:s.tabs.map(t=>({url:t.url,isLoading:t.isLoading,private:t.private})),selected:s.tabs.findIndex(t=>t.id===s.activeTabId)});
try {
 let c=await launch(port);
 await c.eval("BlancPrototypeHost.api.createTab('http://127.0.0.1:9471/guard')");
 const pw=await chromium.connectOverCDP('http://127.0.0.1:'+port),context=pw.contexts()[0];
 let guard;for(let i=0;i<100;i++){guard=context.pages().find(p=>p.url()==='http://127.0.0.1:9471/guard');if(guard)break;await pause(100);}
 await guard.waitForLoadState();await guard.locator('p').click();
 await guard.evaluate(()=>{window.onbeforeunload=e=>{e.preventDefault();e.returnValue='';};});
 let dialog;guard.on('dialog',d=>dialog=d);
 const closing=c.eval("(async()=>{const s=await BlancPrototypeHost.api.getAllTabs();return BlancPrototypeHost.api.closeTab(s.activeTabId);})()");
 for(let i=0;i<100&&!dialog;i++)await pause(50);
 if(dialog?.type()!=='beforeunload')throw Error('missing close cancellation prompt');
 await dialog.dismiss();await closing;results.cancelCompleted=true;
 results.afterCancel=trim(await c.eval('BlancPrototypeHost.api.getAllTabs()'));
 if(!results.afterCancel.tabs.some(t=>t.url.endsWith('/guard')))throw Error('cancel removed tab');
 await guard.evaluate(()=>{window.onbeforeunload=null;});
 await c.eval("(async()=>{const s=await BlancPrototypeHost.api.getAllTabs();return BlancPrototypeHost.api.closeTab(s.activeTabId);})()");
 results.afterClose=trim(await c.eval('BlancPrototypeHost.api.getAllTabs()'));
 if(results.afterClose.tabs.some(t=>t.url.endsWith('/guard')))throw Error('close retained tab');
 await c.eval('BlancPrototypeHost.api.reopenClosedTab()');await pause(500);
 results.restored=trim(await c.eval('BlancPrototypeHost.api.getAllTabs()'));
 if(results.restored.tabs.filter(t=>t.url.endsWith('/guard')).length!==1)throw Error('history restore wrong');
 c.close();await stop(port);c=await launch(port+1);await pause(1000);
 results.restarted=trim(await c.eval('BlancPrototypeHost.api.getAllTabs()'));
 results.pass=results.cancelCompleted===true&&JSON.stringify(results.restored.tabs.map(t=>t.url))===JSON.stringify(results.restarted.tabs.map(t=>t.url));
 c.close();await stop(port+1);
}catch(e){results.error=String(e);if(running&&!running.done){running.kill('SIGTERM');results.forcedCleanup=true;}}
finally{fs.writeFileSync(root+'/'+label+'.json',JSON.stringify(results,null,2));for(const s of sockets)s.destroy();server.close();}console.log(JSON.stringify(results,null,2));
