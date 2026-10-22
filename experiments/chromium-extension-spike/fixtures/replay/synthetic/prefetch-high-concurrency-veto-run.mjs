// Shutdown schedules require the temporary native Exit hook archived in
// evidence/f12-prefetch-readiness-reconciliation-20261022/temporary-native-probes.patch.
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
 for(const kind of (config.kinds??['regular','private'])) for(const mode of (config.modes??['delete-cancel','shutdown-veto'])) {
  const profile=path.join(root,kind+'-'+mode);fs.mkdirSync(profile);const log=path.join(root,kind+'-'+mode+'.jsonl');fs.writeFileSync(log,'');let context,heldPid;
  const schedule={kind,mode,cycles:[]};report.schedules.push(schedule);let row;
  try {
   const launchOptions={executablePath:config.chromium,headless:false,chromiumSandbox:true,args:['--blanc-prefetch-veto-fixture','--use-mock-keychain','--no-proxy-server',`--ignore-certificate-errors-spki-list=${spkiList(material)}`,'--host-resolver-rules=MAP page.blanc-fixture.test 127.0.0.1, MAP 000491b06a.com 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--blanc-blocker-assets=${config.engine}`,`--blanc-blocker-log=${log}`,`--blanc-prototype-assets=${config.ui}`,'--no-first-run','--disable-component-update','--disable-sync']};
   context=await pw.chromium.launchPersistentContext(profile,launchOptions);
   const browser=context.browser(),active=kind==='private'?await browser.newContext():context,guard=await (config.lastWindow?active:context).newPage(),page=await active.newPage();
   const cdp=await active.newCDPSession(page);await cdp.send('Preload.enable');await cdp.send('Network.enable');cdp.on('Network.responseReceived',e=>row?.responses.push(e));
   cdp.on('Preload.prefetchStatusUpdated',e=>row?.preloadEvents.push(e));
   for(const event of ['ruleSetUpdated','ruleSetRemoved','preloadingAttemptSourcesUpdated'])cdp.on('Preload.'+event,e=>row?.preloadDiagnostics.push({event,...e}));
   const target=(await cdp.send('Target.getTargetInfo')).targetInfo;
   const bc=await browser.newBrowserCDPSession();assert.equal((await bc.send('Target.getBrowserContexts')).browserContextIds.includes(target.browserContextId),kind==='private');
   for(let cycle=1;cycle<=1;cycle++){
   row={kind,mode,cycle,responses:[],preloadEvents:[],preloadDiagnostics:[],prompts:[]};schedule.cycles.push(row);
   const origin=`https://page.blanc-fixture.test:${server.address().port}`;
   await page.goto(origin+'/source?cycle='+cycle);
   await cdp.send('Preload.disable');await cdp.send('Preload.enable');
   await guard.goto(origin+'/guard');

   let dialog;row.dialogEvents=[];guard.on('dialog',d=>{dialog=d;row.dialogEvents.push({type:d.type()});});
   const guardCDP=await guard.context().newCDPSession(guard);
   await guard.bringToFront();await guard.locator('main').click();
   await guardCDP.send('Runtime.evaluate',{expression:"window.onbeforeunload=e=>{e.preventDefault();e.returnValue='';}",userGesture:true});
   row.guardArmed=await guard.evaluate(()=>typeof onbeforeunload==='function'&&navigator.userActivation.hasBeenActive);assert(row.guardArmed);
   await page.bringToFront();
   let survivor;
   {
    const launcher=spawn(config.chromium,[`--user-data-dir=${profile}`,'--profile-directory=Profile 1','--no-first-run',origin+'/#independent'],{stdio:'ignore'});
    await new Promise((resolve,reject)=>launcher.once('exit',c=>c===0?resolve():reject(Error('launcher '+c))));
    survivor=await until(()=>browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().endsWith('#independent')),15000);
    await until(()=>fs.existsSync(path.join(profile,'Profile 1/Preferences')),15000);
    await survivor.goto('chrome://profile-picker/');await survivor.waitForFunction(()=>typeof chrome.send==='function');
    await survivor.evaluate(p=>chrome.send('getProfileStatistics',[p]),path.join(profile,'Default'));await pause(300);
   }
   if(config.lastWindow){
    assert.equal(mode,'shutdown-veto');
    const stage=value=>{row.stage=value;fs.writeFileSync(path.join(root,'stage.json'),JSON.stringify(row,null,2));};
    stage('closing-survivor');await survivor.close();
    if(kind==='private')for(const regularPage of context.pages().filter(p=>p.url()!=='chrome://blanc-prototype/host.html')){
     stage('closing-regular:'+regularPage.url());await regularPage.close();
    }
    stage('checking-picker-disappearance');
    await until(async()=>!(await bc.send('Target.getTargets')).targetInfos.some(t=>t.url==='chrome://profile-picker/'),5000);
    stage('listing-targets');const targets=(await bc.send('Target.getTargets')).targetInfos;
    row.islandTargets=targets.filter(t=>t.url==='chrome://blanc-prototype/host.html');
    assert.equal(row.islandTargets.length,1);
    const windows=[];
    for(const t of targets.filter(t=>t.type==='page'&&t.url!=='chrome://blanc-prototype/host.html')){
     if(kind==='private')assert.equal(t.browserContextId,target.browserContextId);
     const w=await bc.send('Browser.getWindowForTarget',{targetId:t.targetId});windows.push({target:t.targetId,url:t.url,windowId:w.windowId,browserContextId:t.browserContextId});
    }
    row.privateContextId=kind==='private'?target.browserContextId:null;
    row.windowsBeforeVeto=windows;assert.equal(new Set(windows.map(w=>w.windowId)).size,1);
   }
   await page.bringToFront();
   await bc.send('Target.activateTarget',{targetId:target.targetId});
   row.sourceVisibility=await page.evaluate(()=>document.visibilityState);
   const nativeState=async(command)=>{
    const host=(await bc.send('Target.getTargets')).targetInfos.find(t=>t.url==='chrome://blanc-prototype/host.html');assert(host);
    const {sessionId}=await bc.send('Target.attachToTarget',{targetId:host.targetId,flatten:false});
    try{return await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>{bc.off('Target.receivedMessageFromTarget',receive);reject(Error('Native state response timeout'));},5000);
     const receive=event=>{if(event.sessionId!==sessionId)return;const message=JSON.parse(event.message);if(message.id!==77)return;clearTimeout(timer);bc.off('Target.receivedMessageFromTarget',receive);if(message.error||message.result?.exceptionDetails)reject(Error(JSON.stringify(message)));else resolve(message.result.result.value);};
     bc.on('Target.receivedMessageFromTarget',receive);
     void bc.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:77,method:'Runtime.evaluate',params:{expression:command==='fixtureQuit'?"BlancPrototypeHost.api.previewPageCommand('fixtureQuit')":"BlancPrototypeHost.api.previewPageCommand('fixturePrefetchState')",awaitPromise:true,returnByValue:true}})}).catch(error=>{clearTimeout(timer);bc.off('Target.receivedMessageFromTarget',receive);reject(error);});
    });}finally{await bc.send('Target.detachFromTarget',{sessionId});}
   };
   row.nativeVisibilitySamples=[];
   await until(async()=>{const tabs=await nativeState();row.nativeVisibilitySamples.push(tabs);return tabs.some(t=>t.url===page.url()&&t.active&&t.primary_active&&t.visibility===2);},10000);
   row.nativeBeforeCandidate=row.nativeVisibilitySamples.at(-1);
   const urls=[origin+'/'+kind+'-'+mode+'-cycle-'+cycle];
   row.urls=urls;const at=arrivals.length;
   await page.evaluate(urls=>{const s=document.createElement('script');s.type='speculationrules';s.textContent=JSON.stringify({prefetch:[{source:'list',urls,eagerness:'immediate'}]});document.head.append(s);},urls);
   try{await until(()=>row.preloadEvents.some(e=>e.prefetchUrl===urls[0]&&e.status==='Ready'),15000);}catch(error){
    row.readinessFailure={native:await nativeState(),arrivals:arrivals.slice(at),target:(await cdp.send('Target.getTargetInfo')).targetInfo,document:await page.evaluate(()=>({url:location.href,visibility:document.visibilityState,ready:document.readyState,rules:[...document.querySelectorAll('script[type=speculationrules]')].map(s=>s.textContent)})),decisions:fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)};throw error;
   }
   row.readyBeforeLoss=structuredClone(row.preloadEvents);
   const extra=[];row.extra=[];
   for(let index=1;index<=7;index++){
    const extraPage=await active.newPage(),extraCDP=await active.newCDPSession(extraPage);
    const item={index,url:urls[0]+'-extra-'+index,source:origin+'/extra-source-'+index,events:[],settled:false};row.extra.push(item);extra.push({page:extraPage,item});
    item.target=(await extraCDP.send('Target.getTargetInfo')).targetInfo;
    item.window=await bc.send('Browser.getWindowForTarget',{targetId:item.target.targetId});assert.equal(item.window.windowId,row.windowsBeforeVeto[0].windowId);
    if(kind==='private')assert.equal(item.target.browserContextId,row.privateContextId);
    await extraCDP.send('Preload.enable');extraCDP.on('Preload.prefetchStatusUpdated',e=>item.events.push(e));
    await extraPage.goto(item.source);await extraPage.bringToFront();
    await until(async()=> (await nativeState()).some(t=>t.url===item.source&&t.active&&t.primary_active&&t.visibility===2),10000);
    await extraPage.evaluate(url=>{const s=document.createElement('script');s.type='speculationrules';s.textContent=JSON.stringify({prefetch:[{source:'list',urls:[url],eagerness:'immediate'}]});document.head.append(s);},item.url);
    await until(()=>item.events.some(e=>e.prefetchUrl===item.url&&e.status==='Ready'),15000);
   }

   {
    const processes=execFileSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'}).split('\n').map(l=>{const m=l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);return m&&{pid:Number(m[1]),ppid:Number(m[2]),command:m[3]};}).filter(Boolean);
    const owners=processes.filter(p=>p.command.includes('--user-data-dir='+profile)&&!p.command.includes('--type='));assert.equal(owners.length,1);
    const utilities=processes.filter(p=>p.ppid===owners[0].pid&&p.command.includes('--utility-sub-type=blanc.mojom.Blocker'));assert.equal(utilities.length,1);row.heldUtility=utilities[0];heldPid=utilities[0].pid;process.kill(heldPid,'SIGSTOP');
   }
   const records=()=>fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
   row.beforeConsumption={arrivals:arrivals.slice(at),decisions:records()};
   for(const entry of extra){
    entry.navigation=entry.page.waitForNavigation({timeout:45000}).then(()=>({success:true}),e=>({error:String(e)})).finally(()=>{entry.item.settled=true;});
    await entry.page.evaluate(url=>{const a=document.createElement('a');a.href=url;document.body.append(a);a.click();},entry.item.url);
   }
   let settled=false;
   const navigation=page.waitForNavigation({timeout:45000}).then(()=>({success:true}),e=>({error:String(e)})).finally(()=>{settled=true;});
   await page.evaluate(url=>{const a=document.createElement('a');a.href=url;document.body.append(a);a.click();},urls[0]);
   await until(()=>row.preloadEvents.some(e=>e.prefetchUrl===urls[0]&&e.prefetchStatus==='PrefetchResponseUsed'),15000);
   for(const {item} of extra)await until(()=>item.events.some(e=>e.prefetchUrl===item.url&&e.prefetchStatus==='PrefetchResponseUsed'),15000);
   await pause(500);
   row.extraPending=extra.map(e=>({settled:e.item.settled,url:e.page.url()}));assert(row.extraPending.every(e=>!e.settled));
   row.pending={settled,url:page.url(),decisions:records().filter(d=>d.event==='navigation-response-decision'&&d.url===urls[0])};
   assert(!settled);assert.equal(row.pending.decisions.length,0);assert.equal(row.pending.url,origin+'/source?cycle='+cycle);
   for(let veto=1;veto<=(config.vetoCount??2);veto++){
   dialog=null;
   const requestExit=async()=>{const ack=await nativeState('fixtureQuit');(row.exitAcknowledgements??=[]).push(ack);assert.equal(ack,true);};
   const beforeDialogs=row.dialogEvents.length;
   await requestExit();
   row.waitingForPrompt=true;await until(()=>dialog,10000);assert.equal(dialog.type(),'beforeunload');row.nativePrompt=true;
   for(let overlap=0;overlap<3;overlap++)await requestExit();await pause(200);
   assert.equal(row.dialogEvents.length,beforeDialogs+1,'overlapping Exit should coalesce while prompt is open');
   assert(extra.every(e=>!e.item.settled&&e.page.url()===e.item.source));
   row.pendingAtPrompt={extraPending:extra.map(e=>({settled:e.item.settled,url:e.page.url()})),settled,url:page.url(),closed:page.isClosed()};
   assert(!settled,'prompt must precede native response timeout');assert.equal(row.pendingAtPrompt.url,origin+'/source?cycle='+cycle);
   await dialog.dismiss();row.cancelled=true;
   assert(browser.isConnected());assert(!guard.isClosed());assert(!page.isClosed());
   row.prompts.push({veto,...row.pendingAtPrompt,cancelled:true});
   }
   process.kill(heldPid,'SIGCONT');heldPid=null;
   await guardCDP.send('Runtime.evaluate',{expression:'window.onbeforeunload=null',userGesture:true});
   await until(()=>{try{return Object.hasOwn(JSON.parse(fs.readFileSync(path.join(profile,'Local State'))).profile.info_cache,'Default');}catch{return false;}},10000);
   row.profileRetained=true;
   for(const entry of extra){entry.item.navigation=await entry.navigation;assert(entry.item.navigation.success);}
   row.navigation=await navigation;
   assert(!row.navigation.error,JSON.stringify(row.navigation));
   await until(()=>records().some(d=>d.event==='navigation-response-decision'&&d.url===urls[0]&&d.engine_result===0),5000);
   for(const {item} of extra){assert(records().some(d=>d.event==='navigation-response-decision'&&d.url===item.url&&d.engine_result===0));assert.equal(arrivals.slice(at).filter(a=>a.url===new URL(item.url).pathname).length,1);}
   row.afterResume=records();row.arrivalsAfterConsumption=arrivals.slice(at);
   assert.equal(row.arrivalsAfterConsumption.filter(a=>a.url===new URL(urls[0]).pathname).length,1);
   assert.equal(await page.title(),'Prefetch fixture');row.consumptionRecovered=true;
   const fresh=await active.newPage();await fresh.goto(origin+'/fresh-'+mode);assert.equal(await fresh.title(),'Prefetch fixture');row.freshPassed=true;await fresh.close();
   row.passed=true;
   fs.writeFileSync(path.join(root,'progress.json'),JSON.stringify(report,null,2));
   }
   schedule.passed=true;

  }catch(e){schedule.error=String(e);if(row)row.error=String(e);process.exitCode=1;}finally{if(heldPid){try{process.kill(heldPid,'SIGCONT');}catch(e){if(e.code!=='ESRCH')throw e;}heldPid=null;}await context?.close();fs.rmSync(profile,{recursive:true,force:true});schedule.profileRemoved=!fs.existsSync(profile);fs.writeFileSync(path.join(root,'progress.json'),JSON.stringify(report,null,2));}
 }
}finally{await new Promise(r=>server.close(r));fs.rmSync(path.join(root,'certificates'),{recursive:true,force:true});fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report.schedules.map(s=>({kind:s.kind,passed:s.passed,error:s.error,cycles:s.cycles.length}))));
