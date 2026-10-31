import fs from 'node:fs';import http from 'node:http';import {spawn,execFileSync} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-encryption-faults',app=root+'/Blanc Chromium Preview.app',results=[];
const server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end('<title>Restore fixture</title><p>Restored fixture</p>');});await new Promise(r=>server.listen(9470,'127.0.0.1',r));
let port=9570;
for(const mode of ['delay','never']){
 const profile=root+'/'+mode+'-corrected-profile';execFileSync('/bin/cp',['-cR','/private/tmp/blanc-restore-stall/multi-settled-profile',profile]);
 for(const recovery of [false,true]){
 const label=mode+'-corrected'+(recovery?'-recovery':''),fd=fs.openSync(root+'/'+label+'.log','w'),env={...process.env};delete env.BLANC_ENCRYPTION_FAULT;if(!recovery)env.BLANC_ENCRYPTION_FAULT=mode;
 const currentPort=port++,p=spawn(app+'/Contents/MacOS/Blanc Preview Launcher',['--user-data-dir='+profile,'--remote-debugging-port='+currentPort,'--no-first-run','--use-mock-keychain','--restore-last-session'],{stdio:['ignore',fd,fd],env});let done=false; p.on('exit',()=>done=true);const out={label,pid:p.pid,mode:recovery?'normal':mode};
 try{
 let states;
 for(let i=0;i<150&&!done;i++){
  try{const ts=await fetch(`http://127.0.0.1:${currentPort}/json/list`,{signal:AbortSignal.timeout(400)}).then(r=>r.json());states=[];for(const t of ts.filter(t=>t.url.endsWith('/host.html'))){const c=await connect(t);const s=await c.eval('BlancPrototypeHost.api.getAllTabs()');if(recovery&&mode==='never'&&i>20&&s.tabs.length===1&&!out.restoreRequested){out.beforeNativeRestore={urls:s.tabs.map(t=>t.url)};await c.eval('BlancPrototypeHost.api.reopenClosedTab()');out.restoreRequested=true;}c.close();states.push({urls:s.tabs.map(t=>t.url),selected:s.tabs.findIndex(t=>t.id===s.activeTabId)});}if(states.some(s=>s.urls.length===3))break;}catch(e){out.lastReadError=String(e);}
  if(i===25){try{execFileSync('/usr/bin/sample',[String(p.pid),'2','-file',root+'/'+label+'.sample.txt'],{timeout:10000});out.sampled=true;}catch(e){out.sampleError=String(e);}}
  await pause(200);
 }
 out.states=states;out.ready=!!states?.some(s=>s.urls.length===3);out.callbacks=fs.readFileSync(root+'/'+label+'.log','utf8').split('\n').filter(l=>/BLANC_(READ|RESTORE|PROVIDER)/.test(l));
 if(out.ready){const v=await fetch(`http://127.0.0.1:${currentPort}/json/version`,{signal:AbortSignal.timeout(2000)}).then(r=>r.json());const c=await connect(v);await c.send('Browser.close').catch(()=>{});c.close();for(let i=0;i<120&&!done;i++)await pause(100);out.cleanExit=done;}
 if(!done){p.kill('SIGKILL');out.fixtureKilled=true;for(let i=0;i<100&&!done;i++)await pause(100);}
 out.exited=done;
 }catch(e){out.error=String(e);if(!done){p.kill('SIGKILL');out.fixtureKilled=true;for(let i=0;i<100&&!done;i++)await pause(100);}}
 results.push(out);fs.writeFileSync(root+'/corrected-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(out));
 if(!done)throw Error('owned process still alive');
 }
}
server.close();
