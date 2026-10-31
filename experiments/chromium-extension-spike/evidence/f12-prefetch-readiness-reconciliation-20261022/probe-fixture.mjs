// Shutdown schedules require the temporary native Exit hook archived in
// evidence/f12-prefetch-veto-sequencing-fix-20261021/temporary-native-exit.patch.
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
   for(let cycle=1;cycle<=3;cycle++){
   row={kind,mode,cycle,responses:[],preloadEvents:[],preloadDiagnostics:[],prompts:[]};schedule.cycles.push(row);
   const origin=`https://page.blanc-fixture.test:${server.address().port}`;
   await page.goto(origin+'/source?cycle='+cycle);
   await cdp.send('Preload.disable');await cdp.send('Preload.enable');
   await guard.goto(origin+'/guard');

   let dialog;guard.on('dialog',d=>{dialog=d;});
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
   const nativeState=async()=>{const host=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url()==='chrome://blanc-prototype/host.html');assert(host);return host.evaluate(()=>BlancPrototypeHost.api.previewPageCommand('fixturePrefetchState'));};
   row.nativeBeforeCandidate=await nativeState();
   const urls=[origin+'/'+kind+'-'+mode+'-cycle-'+cycle];
   row.urls=urls;const at=arrivals.length;
   await page.evaluate(urls=>{const s=document.createElement('script');s.type='speculationrules';s.textContent=JSON.stringify({prefetch:[{source:'list',urls,eagerness:'immediate'}]});document.head.append(s);},urls);
   try{await until(()=>row.preloadEvents.some(e=>e.prefetchUrl===urls[0]&&e.status==='Ready'),15000);}catch(error){
    row.readinessFailure={native:await nativeState(),arrivals:arrivals.slice(at),target:(await cdp.send('Target.getTargetInfo')).targetInfo,document:await page.evaluate(()=>({url:location.href,visibility:document.visibilityState,ready:document.readyState,rules:[...document.querySelectorAll('script[type=speculationrules]')].map(s=>s.textContent)})),decisions:fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)};throw error;
   }
   row.readyBeforeLoss=structuredClone(row.preloadEvents);
   {
    const processes=execFileSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'}).split('\n').map(l=>{const m=l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);return m&&{pid:Number(m[1]),ppid:Number(m[2]),command:m[3]};}).filter(Boolean);
    const owners=processes.filter(p=>p.command.includes('--user-data-dir='+profile)&&!p.command.includes('--type='));assert.equal(owners.length,1);
    const utilities=processes.filter(p=>p.ppid===owners[0].pid&&p.command.includes('--utility-sub-type=blanc.mojom.Blocker'));assert.equal(utilities.length,1);row.heldUtility=utilities[0];heldPid=utilities[0].pid;process.kill(heldPid,'SIGSTOP');
   }
   const records=()=>fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
   row.beforeConsumption={arrivals:arrivals.slice(at),decisions:records()};
   let settled=false;
   const navigation=page.waitForNavigation({timeout:45000}).then(()=>({success:true}),e=>({error:String(e)})).finally(()=>{settled=true;});
   await page.evaluate(url=>{const a=document.createElement('a');a.href=url;document.body.append(a);a.click();},urls[0]);
   await until(()=>row.preloadEvents.some(e=>e.prefetchUrl===urls[0]&&e.prefetchStatus==='PrefetchResponseUsed'),15000);
   await pause(500);
   row.pending={settled,url:page.url(),decisions:records().filter(d=>d.event==='navigation-response-decision'&&d.url===urls[0])};
   assert(!settled);assert.equal(row.pending.decisions.length,0);assert.equal(row.pending.url,origin+'/source?cycle='+cycle);
   for(let veto=1;veto<=(config.vetoCount??2);veto++){
   dialog=null;
   if(mode==='delete-cancel'){
    void survivor.evaluate(p=>chrome.send('removeProfile',[p]),path.join(profile,'Default')).catch(e=>{row.triggerError=String(e);});
   }else{
    const hosts=(await bc.send('Target.getTargets')).targetInfos.filter(t=>t.url==='chrome://blanc-prototype/host.html');assert(hosts.length);
    const attached=await bc.send('Target.attachToTarget',{targetId:hosts[0].targetId,flatten:false});
    await bc.send('Target.sendMessageToTarget',{sessionId:attached.sessionId,message:JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:"BlancPrototypeHost.api.previewPageCommand('fixtureQuit')",awaitPromise:false}})});

   }
   row.waitingForPrompt=true;await until(()=>dialog,10000);assert.equal(dialog.type(),'beforeunload');row.nativePrompt=true;
   row.pendingAtPrompt={settled,url:page.url(),closed:page.isClosed()};
   assert(!settled,'prompt must precede native response timeout');assert.equal(row.pendingAtPrompt.url,origin+'/source?cycle='+cycle);
   await dialog.dismiss();row.cancelled=true;
   assert(browser.isConnected());assert(!guard.isClosed());assert(!page.isClosed());
   row.prompts.push({veto,...row.pendingAtPrompt,cancelled:true});
   }
   process.kill(heldPid,'SIGCONT');heldPid=null;
   await guardCDP.send('Runtime.evaluate',{expression:'window.onbeforeunload=null',userGesture:true});
   await until(()=>{try{return Object.hasOwn(JSON.parse(fs.readFileSync(path.join(profile,'Local State'))).profile.info_cache,'Default');}catch{return false;}},10000);
   row.profileRetained=true;
   row.navigation=await navigation;
   assert(!row.navigation.error,JSON.stringify(row.navigation));
   await until(()=>records().some(d=>d.event==='navigation-response-decision'&&d.url===urls[0]&&d.engine_result===0),5000);
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
