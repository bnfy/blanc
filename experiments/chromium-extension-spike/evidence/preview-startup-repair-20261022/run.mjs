import fs from 'node:fs';import {spawn} from 'node:child_process';import {connect,pause} from './cdp.mjs';
const root='/private/tmp/blanc-preview-crash-repair', app=root+'/Blanc Chromium Preview.app';
const results=[];let nextPort=9290;
async function run(name,profile,negative=false){
 const port=nextPort++; const log=fs.openSync(root+'/'+name+'.log','w');const args=['--user-data-dir='+root+'/'+profile,'--remote-debugging-port='+port,'--no-first-run','--use-mock-keychain','--restore-last-session'];
 const exe=app+'/Contents/MacOS/'+(negative?'Blanc Prototype':'Blanc Preview Launcher');
 if(negative)args.push('--blanc-prototype-assets='+root+'/missing-assets','--blanc-blocker-assets='+app+'/Contents/Resources/BlancBlocker');
 const p=spawn(exe,args,{stdio:['ignore',log,log]});let exited=false;p.on('exit',()=>exited=true);let ts;
 for(let i=0;i<100;i++){if(exited)throw Error(name+' exited before readiness');try{ts=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());if(ts.some(t=>t.url.endsWith('/host.html')))break;}catch{} await pause(100);}
 await pause(1500);if(exited)throw Error(name+' crashed after startup');
 ts=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());const host=ts.find(t=>t.url.endsWith('/host.html'));if(!host)throw Error('No host');const c=await connect(host);
 const tree=await c.send('Page.getFrameTree');const record={name,alive:true,frame:tree.frameTree.frame};
 if(!negative){let s;for(let i=0;i<50;i++){try{s=await c.eval('BlancPrototypeHost.api.getAllTabs()');break;}catch{}await pause(100);}if(!s?.tabs.length)throw Error('No ready UI');record.urls=s.tabs.map(t=>t.url);record.selected=s.tabs.findIndex(t=>t.id===s.activeTabId);const page=ts.find(t=>t.url==='chrome://newtab/');const pc=await connect(page);record.startPage=(await pc.send('Accessibility.getFullAXTree')).nodes.some(n=>n.name?.value==='Blanc start page');pc.close();if(!record.startPage)throw Error('No start page');}
 else {record.errorDocument=Boolean(tree.frameTree.frame.unreachableUrl);if(!record.errorDocument)throw Error('Negative case did not reach error document');}
 c.close();const bc=await connect(await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()));await bc.send('Browser.close').catch(()=>{});bc.close();for(let i=0;i<50&&!exited;i++)await pause(100);record.cleanProcessExit=exited;if(!exited){p.kill('SIGTERM');for(let i=0;i<50&&!exited;i++)await pause(100);record.forcedCleanup=exited;if(!exited)throw Error('Cleanup failed');}results.push(record);fs.writeFileSync(root+'/results.json',JSON.stringify(results,null,2));
}
await run('fixed-missing-assets','negative-profile-3',true);
await run('fresh-one','profile-one-3');await run('restart-one','profile-one-3');await run('fresh-two','profile-two-3');await run('fresh-three','profile-three-3');
console.log(JSON.stringify(results.map(r=>({name:r.name,alive:r.alive,errorDocument:r.errorDocument,startPage:r.startPage,urls:r.urls}))));
