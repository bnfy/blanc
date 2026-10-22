import fs from 'node:fs';import http from 'node:http';import {spawn,execFileSync} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-session-readiness',app=root+'/Blanc Chromium Preview.app';
const server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end('<title>Restore fixture</title><p>Restored fixture</p>');});await new Promise(r=>server.listen(9470,'127.0.0.1',r));
const results=[];
for(const [label,source,port,expected,mode] of [['retained','/private/tmp/blanc-preview-crash-repair/profile-one-3',9550,1,'default'],['multi','/private/tmp/blanc-restore-stall/multi-settled-profile',9551,3,'default'],['multi-repeat',null,9552,3,'default'],['encrypted','/private/tmp/blanc-restore-stall/multi-settled-profile',9553,3,'write_both_read_prefer_encrypted'],['encrypted-repeat',null,9554,3,'write_both_read_prefer_encrypted']]){
 const profile=root+'/'+(label.endsWith('-repeat')?label.replace('-repeat',''):label)+'-profile';if(source)execFileSync('/bin/cp',['-cR',source,profile]);
 const log=root+'/'+label+'.log',fd=fs.openSync(log,'w');const p=spawn(app+'/Contents/MacOS/Blanc Preview Launcher',['--user-data-dir='+profile,'--remote-debugging-port='+port,'--no-first-run','--use-mock-keychain','--restore-last-session',...(mode==='default'?[]:['--enable-features=EncryptSessionStorage:stage/'+mode])],{stdio:['ignore',fd,fd]});let done=false;p.on('exit',()=>done=true);const result={label,pid:p.pid,expected,mode};
 try{let states;for(let i=0;i<100&&!done;i++){
  try{const ts=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(400)}).then(r=>r.json());states=[];for(const t of ts.filter(t=>t.url.endsWith('/host.html'))){const c=await connect(t);const s=await c.eval('BlancPrototypeHost.api.getAllTabs()');c.close();states.push({urls:s.tabs.map(t=>t.url),selected:s.tabs.findIndex(t=>t.id===s.activeTabId)});}if(states.some(s=>s.urls.length===expected))break;}catch(e){result.lastReadError=String(e);}
  if(i===30){try{execFileSync('/usr/bin/sample',[String(p.pid),'2','-file',root+'/'+label+'.sample.txt'],{timeout:10000});result.sampled=true;}catch(e){result.sampleError=String(e);}}
  await pause(200);
 }
 result.states=states;result.ready=!!states?.some(s=>s.urls.length===expected);result.callbacks=fs.readFileSync(log,'utf8').split('\n').filter(l=>/BLANC_(RESTORE|READ)/.test(l));
 if(!result.ready)throw Error('restore readiness not reached');
 const v=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(2000)}).then(r=>r.json());const c=await connect(v);await c.send('Browser.close').catch(()=>{});c.close();for(let i=0;i<120&&!done;i++)await pause(100);result.cleanExit=done;if(!done)throw Error('shutdown deadline');
 }catch(e){result.error=String(e);if(!done){p.kill('SIGTERM');for(let i=0;i<100&&!done;i++)await pause(100);result.terminated=true;if(!done){p.kill('SIGKILL');result.killed=true;}}}
 results.push(result);fs.writeFileSync(root+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(result));if(result.error)break;
}
server.close();
