// Shutdown schedules require the temporary native Exit hook archived in
// evidence/f12-prefetch-private-cross-profile-20261022/temporary-native-probes.patch.
// Restore normal native source/binary after use; Browser.close cannot test veto.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import {execFileSync,spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createCertificateSet,spkiList} from './certificate-set.mjs';
import {pause,until} from './session.mjs';
const [configFile,root]=process.argv.slice(2);
const config=JSON.parse(fs.readFileSync(configFile));fs.mkdirSync(root);
const material=createCertificateSet(path.join(root,'certificates'),['page.blanc-fixture.test','000491b06a.com']);
const arrivals=[];
const server=https.createServer(material.entries[0],(req,res)=>{
 arrivals.push({url:req.url,host:req.headers.host,headers:req.headers});
 res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'public, max-age=600'});
 res.end('<!doctype html><title>Prefetch fixture</title><link rel="icon" href="data:,"><main>prefetch proof</main>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const pw=await import(pathToFileURL(config.playwright));const report={schedules:[],forcedFeatures:[],latencyMeasured:false};
try {
 for(const guardOwner of ['cancel-first','accept-first-cancel-second']){
  const profile=path.join(root,guardOwner.replaceAll(' ','-'));fs.mkdirSync(profile);
  const log=path.join(root,guardOwner.replaceAll(' ','-')+'.jsonl');fs.writeFileSync(log,'');
  const row={guardOwner,consumers:[],prompts:[],exitAcknowledgements:[]};report.schedules.push(row);
  let context;const held=[];
  const origin=`https://page.blanc-fixture.test:${server.address().port}`;
  try{
   context=await pw.chromium.launchPersistentContext(profile,{executablePath:config.chromium,headless:false,chromiumSandbox:true,args:['--blanc-prefetch-veto-fixture','--use-mock-keychain','--no-proxy-server',`--ignore-certificate-errors-spki-list=${spkiList(material)}`,'--host-resolver-rules=MAP page.blanc-fixture.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--blanc-blocker-assets=${config.engine}`,`--blanc-blocker-log=${log}`,`--blanc-prototype-assets=${config.ui}`,'--no-first-run','--disable-component-update','--disable-sync']});
   const browser=context.browser(),bc=await browser.newBrowserCDPSession();
   const findPage=url=>until(()=>browser.contexts().flatMap(c=>c.pages()).find(p=>p.url()===url),15000);
   for(const owner of ['Default','Profile 1']){
    const suffix=owner==='Default'?'default':'profile1';
    const launcher=spawn(config.chromium,[`--user-data-dir=${profile}`,'--profile-directory='+owner,'--incognito','--no-first-run',origin+'/source-'+suffix,origin+'/guard-'+suffix],{stdio:'ignore'});
    await new Promise((resolve,reject)=>launcher.once('exit',c=>c===0?resolve():reject(Error('launcher '+c))));
   }
   const first=await findPage(origin+'/source-default'),firstGuard=await findPage(origin+'/guard-default');
   const second=await findPage(origin+'/source-profile1'),secondGuard=await findPage(origin+'/guard-profile1');
   const guards=[{owner:'Default',page:firstGuard},{owner:'Profile 1',page:secondGuard}];
   const native=async(hostId,quit=false)=>{
    const {sessionId}=await bc.send('Target.attachToTarget',{targetId:hostId,flatten:false});
    try{return await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>{bc.off('Target.receivedMessageFromTarget',receive);reject(Error('Native response timeout'));},5000);
     const receive=e=>{if(e.sessionId!==sessionId)return;const m=JSON.parse(e.message);if(m.id!==77)return;clearTimeout(timer);bc.off('Target.receivedMessageFromTarget',receive);if(m.error||m.result?.exceptionDetails)reject(Error(JSON.stringify(m)));else resolve(m.result.result.value);};
     bc.on('Target.receivedMessageFromTarget',receive);
     void bc.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:77,method:'Runtime.evaluate',params:{expression:quit?"BlancPrototypeHost.api.previewPageCommand('fixtureQuit')":"globalThis.BlancPrototypeHost?.api ? BlancPrototypeHost.api.previewPageCommand('fixturePrefetchState') : null",awaitPromise:true,returnByValue:true}})}).catch(reject);
    });}finally{await bc.send('Target.detachFromTarget',{sessionId});}
   };
   const hosts=(await bc.send('Target.getTargets')).targetInfos.filter(t=>t.url==='chrome://blanc-prototype/host.html');assert(hosts.length>=2);
   const hostFor=url=>until(async()=>{for(const h of hosts){const tabs=await native(h.targetId);if(tabs?.some(t=>t.url===url))return h.targetId;}return null;},10000);
   const firstHost=await hostFor(first.url()),secondHost=await hostFor(second.url());assert.notEqual(firstHost,secondHost);
   const dialogs=[];row.dialogEvents=[];
   row.guardOwnership=[];
   for(const g of guards){
    const host=await hostFor(g.page.url());const state=(await native(host)).find(t=>t.url===g.page.url());assert(state.fixture_private);assert.equal(state.fixture_profile,g.owner);row.guardOwnership.push({owner:g.owner,host,state});
    g.page.on('dialog',d=>{dialogs.push({owner:g.owner,dialog:d});row.dialogEvents.push({owner:g.owner,type:d.type()});});
    await g.page.bringToFront();await g.page.locator('main').click();
    await g.page.evaluate(()=>{window.onbeforeunload=e=>{e.preventDefault();e.returnValue='';};});
    assert(await g.page.evaluate(()=>typeof onbeforeunload==='function'&&navigator.userActivation.hasBeenActive));
   }
   row.armedOwners=guards.map(g=>g.owner);
   const entries=[{page:first,owner:'Default',host:firstHost},{page:second,owner:'Profile 1',host:secondHost}];
   const at=arrivals.length;
   for(const entry of entries){
    const item={owner:entry.owner,source:entry.page.url(),url:origin+'/consume-'+entry.owner.replaceAll(' ','-'),events:[],settled:false};entry.item=item;row.consumers.push(item);
    const cd=await entry.page.context().newCDPSession(entry.page);item.target=(await cd.send('Target.getTargetInfo')).targetInfo;
    item.window=await bc.send('Browser.getWindowForTarget',{targetId:item.target.targetId});
    await cd.send('Preload.enable');cd.on('Preload.prefetchStatusUpdated',e=>item.events.push(e));
    const state=(await native(entry.host)).find(t=>t.url===item.source);assert(state.fixture_private);assert.equal(state.fixture_profile,entry.owner);item.nativeOwnership=state;
    await entry.page.bringToFront();await until(async()=>(await native(entry.host)).some(t=>t.url===item.source&&t.active&&t.primary_active&&t.visibility===2),10000);
    await entry.page.evaluate(url=>{const s=document.createElement('script');s.type='speculationrules';s.textContent=JSON.stringify({prefetch:[{source:'list',urls:[url],eagerness:'immediate'}]});document.head.append(s);},item.url);
    await until(()=>item.events.some(e=>e.prefetchUrl===item.url&&e.status==='Ready'),15000);
   }
   assert.notEqual(row.consumers[0].window.windowId,row.consumers[1].window.windowId);
   for(const name of ['Default','Profile 1'])await until(()=>fs.existsSync(path.join(profile,name,'Preferences')),10000);
   const processes=execFileSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'}).split('\n').map(l=>{const m=l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);return m&&{pid:Number(m[1]),ppid:Number(m[2]),command:m[3]};}).filter(Boolean);
   const owners=processes.filter(p=>p.command.includes('--user-data-dir='+profile)&&!p.command.includes('--type='));assert.equal(owners.length,1);
   row.utilities=processes.filter(p=>p.ppid===owners[0].pid&&p.command.includes('--utility-sub-type=blanc.mojom.Blocker'));assert(row.utilities.length>=1);
   for(const p of row.utilities){process.kill(p.pid,'SIGSTOP');held.push(p.pid);}
   const records=()=>fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
   for(const entry of entries){
    entry.navigation=entry.page.waitForNavigation({timeout:45000}).then(()=>({success:true}),e=>({error:String(e)})).finally(()=>{entry.item.settled=true;});
    await entry.page.evaluate(url=>{location.href=url;},entry.item.url);
   }
   for(const {item} of entries)await until(()=>item.events.some(e=>e.prefetchUrl===item.url&&e.prefetchStatus==='PrefetchResponseUsed'),15000);
   for(let round=1;round<=2;round++){
    const before=dialogs.length;
    row.exitAcknowledgements.push(await native(firstHost,true));await until(()=>dialogs.length>before,10000);
    const firstPrompt=dialogs[before];assert.equal(firstPrompt.dialog.type(),'beforeunload');
    row.exitAcknowledgements.push(await native(secondHost,true));await pause(200);assert.equal(dialogs.length,before+1);
    const snapshot=()=>entries.map(e=>({owner:e.owner,settled:e.item.settled,closed:e.page.isClosed(),url:e.page.url()}));
    const check=pending=>{assert(pending.every((p,i)=>!p.settled&&!p.closed&&p.url===entries[i].item.source));assert(entries.every(e=>!records().some(d=>d.event==='navigation-response-decision'&&d.url===e.item.url)));};
    const pending=snapshot();check(pending);
    const prompts=[{owner:firstPrompt.owner,action:guardOwner==='cancel-first'?'cancel':'accept',pending}];
    if(guardOwner==='cancel-first')await firstPrompt.dialog.dismiss();
    else{
     await firstPrompt.dialog.accept();await until(()=>dialogs.length>before+1,10000);
     const secondPrompt=dialogs[before+1];assert.equal(secondPrompt.dialog.type(),'beforeunload');assert.notEqual(secondPrompt.owner,firstPrompt.owner);
     const secondPending=snapshot();check(secondPending);prompts.push({owner:secondPrompt.owner,action:'cancel',pending:secondPending});
     await secondPrompt.dialog.dismiss();
    }
    await pause(200);assert.equal(dialogs.length,before+prompts.length);assert(browser.isConnected());
    assert(guards.every(g=>!g.page.isClosed()));check(snapshot());row.prompts.push({round,steps:prompts,cancelled:true});
   }
   assert(row.exitAcknowledgements.every(a=>a===true));
   for(const pid of held)process.kill(pid,'SIGCONT');held.length=0;
   for(const g of guards)await g.page.evaluate(()=>{window.onbeforeunload=null;});
   for(const entry of entries){entry.item.navigation=await entry.navigation;assert(entry.item.navigation.success);assert.equal(await entry.page.title(),'Prefetch fixture');}
   row.decisions=records();row.arrivals=arrivals.slice(at);
   for(const {item} of entries){
    assert(row.decisions.some(d=>d.event==='navigation-response-decision'&&d.url===item.url&&d.engine_result===0&&d.private===true));
    assert.equal(row.arrivals.filter(a=>a.url===new URL(item.url).pathname).length,1);
   }
   for(const entry of entries){await entry.page.goto(origin+'/fresh-'+entry.owner.replaceAll(' ','-'));assert.equal(await entry.page.title(),'Prefetch fixture');entry.item.freshPassed=true;}
   row.passed=true;
  }catch(e){row.error=String(e);process.exitCode=1;}finally{
   for(const pid of held){try{process.kill(pid,'SIGCONT');}catch(e){if(e.code!=='ESRCH')throw e;}}
   await context?.close();fs.rmSync(profile,{recursive:true,force:true});row.profileRemoved=!fs.existsSync(profile);fs.writeFileSync(path.join(root,'progress.json'),JSON.stringify(report,null,2));
  }
 }
}finally{await new Promise(r=>server.close(r));fs.rmSync(path.join(root,'certificates'),{recursive:true,force:true});fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report.schedules.map(s=>({guardOwner:s.guardOwner,passed:s.passed,error:s.error}))));
