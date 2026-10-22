import fs from 'node:fs';import http from 'node:http';import {spawn} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-close-loading-repair', label=process.argv[2]||'before', app=process.argv[3]||root+'/Blanc Chromium Preview.app', port=Number(process.argv[4]||9480);let hold=true;const hits=[];const sockets=new Set();
const server=http.createServer((q,r)=>{hits.push({url:q.url,method:q.method,held:hold});if(hold&&q.url.startsWith('/pending'))return;r.writeHead(200,{'Content-Type':'text/html'});r.end('<title>Isolation fixture</title><p>Loaded</p><form method=post action=/pending-post target=_blank><input name=value value=fixture></form>');});server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});await new Promise(r=>server.listen(9471,'127.0.0.1',r));
const mode=process.argv[5];const profile=root+'/'+label+'-profile';const results={label,hits};let running;
async function list(p){return fetch(`http://127.0.0.1:${p}/json/list`,{signal:AbortSignal.timeout(750)}).then(r=>r.json());}
async function launch(p){const fd=fs.openSync(root+'/'+label+'-'+p+'.log','w');const child=spawn(app+'/Contents/MacOS/Blanc Preview Launcher',['--user-data-dir='+profile,'--remote-debugging-port='+p,'--no-first-run','--use-mock-keychain','--restore-last-session'],{stdio:['ignore',fd,fd],env:{...process.env,DYLD_INSERT_LIBRARIES:root+'/fault.dylib',BLANC_SPACE_WRITE_BARRIER:root,BLANC_FAULT_PROFILE:profile}});child.done=false;child.on('exit',()=>child.done=true);running=child;for(let i=0;i<80;i++){try{const ts=await list(p);const t=ts.find(t=>t.url.endsWith('/host.html'));if(t){const c=await connect(t);const s=await c.eval('BlancPrototypeHost.api.getAllTabs()');if(s.tabs?.length)return c;c.close();}}catch{}await pause(200);}throw Error('startup timeout '+child.pid);}
async function stop(p){const v=await fetch(`http://127.0.0.1:${p}/json/version`,{signal:AbortSignal.timeout(2000)}).then(r=>r.json());const c=await connect(v);await c.send('Browser.close').catch(()=>{});c.close();for(let i=0;i<80&&!running.done;i++)await pause(125);if(!running.done)throw Error('shutdown timeout '+running.pid);}
const trim=s=>({tabs:s.tabs.map(t=>({url:t.url,isLoading:t.isLoading,private:t.private})),selected:s.tabs.findIndex(t=>t.id===s.activeTabId)});
try {
 let c=await launch(port);
 await c.eval("BlancPrototypeHost.api.createTab('http://127.0.0.1:9471/settled')");
 for(let i=0;i<100;i++){const s=await c.eval('BlancPrototypeHost.api.getAllTabs()');if(!s.tabs.some(t=>t.isLoading))break;await pause(100);}
 if(mode==='session'){
   await c.eval("BlancPrototypeHost.api.createTab('http://127.0.0.1:9471/pending-fault')");
   for(let i=0;i<100&&!hits.some(h=>h.url==='/pending-fault');i++)await pause(100);
   if(!hits.some(h=>h.url==='/pending-fault'))throw Error('no held request');
 }
 fs.rmSync(root+'/error.json',{force:true});fs.writeFileSync(root+'/arm',mode==='session'?'session-flush':'flush');
 try{await c.eval("(async()=>{const s=await BlancPrototypeHost.api.getAllTabs();return BlancPrototypeHost.api.closeTab(s.activeTabId);})()");}catch(e){results.closeError=String(e);}
 results.fault=JSON.parse(fs.readFileSync(root+'/error.json','utf8'));
 fs.rmSync(root+'/arm',{force:true});
 results.pass=!!results.closeError?.includes('history persistence failed')&&results.fault.errno===5;
 c.close();await stop(port);
}catch(e){results.error=String(e);if(running&&!running.done){running.kill('SIGTERM');results.forcedCleanup=true;}}
finally{fs.rmSync(root+'/arm',{force:true});fs.writeFileSync(root+'/'+label+'.json',JSON.stringify(results,null,2));for(const s of sockets)s.destroy();server.close();}console.log(JSON.stringify(results,null,2));
