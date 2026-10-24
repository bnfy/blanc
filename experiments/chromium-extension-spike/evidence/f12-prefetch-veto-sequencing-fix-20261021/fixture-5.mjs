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
 for(const kind of ['regular','private']) for(const mode of ['delete-cancel','shutdown-veto']) {
  const profile=path.join(root,kind+'-'+mode);fs.mkdirSync(profile);const log=path.join(root,kind+'-'+mode+'.jsonl');fs.writeFileSync(log,'');let context,heldPid;
  const row={kind,mode};report.schedules.push(row);
  try {
   const launchOptions={executablePath:config.chromium,headless:false,chromiumSandbox:true,args:['--use-mock-keychain','--no-proxy-server',`--ignore-certificate-errors-spki-list=${spkiList(material)}`,'--host-resolver-rules=MAP page.blanc-fixture.test 127.0.0.1, MAP 000491b06a.com 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--blanc-blocker-assets=${config.engine}`,`--blanc-blocker-log=${log}`,`--blanc-prototype-assets=${config.ui}`,'--no-first-run','--disable-component-update','--disable-sync']};
   context=await pw.chromium.launchPersistentContext(profile,launchOptions);
   const browser=context.browser(),active=kind==='private'?await browser.newContext():context,page=await active.newPage();
   const cdp=await active.newCDPSession(page);await cdp.send('Preload.enable');await cdp.send('Network.enable');row.responses=[];cdp.on('Network.responseReceived',e=>row.responses.push(e));row.preloadEvents=[];
   cdp.on('Preload.prefetchStatusUpdated',e=>row.preloadEvents.push(e));
   const target=(await cdp.send('Target.getTargetInfo')).targetInfo;
   const bc=await browser.newBrowserCDPSession();assert.equal((await bc.send('Target.getBrowserContexts')).browserContextIds.includes(target.browserContextId),kind==='private');
   const origin=`https://page.blanc-fixture.test:${server.address().port}`;
   await page.goto(origin+'/source');
   const guard=await context.newPage();await guard.goto(origin+'/guard');
   const quit=mode==='shutdown-veto'?await context.newPage():null;
   let dialog;guard.on('dialog',d=>{dialog=d;});
   const guardCDP=await context.newCDPSession(guard);
   await guard.bringToFront();await guard.locator('main').click();
   await guardCDP.send('Runtime.evaluate',{expression:"window.onbeforeunload=e=>{e.preventDefault();e.returnValue='';}",userGesture:true});
   row.guardArmed=await guard.evaluate(()=>typeof onbeforeunload==='function'&&navigator.userActivation.hasBeenActive);assert(row.guardArmed);
   await page.bringToFront();
   let survivor;
   if(mode==='delete-cancel'){
    const launcher=spawn(config.chromium,[`--user-data-dir=${profile}`,'--profile-directory=Profile 1','--no-first-run',origin+'/#independent'],{stdio:'ignore'});
    await new Promise((resolve,reject)=>launcher.once('exit',c=>c===0?resolve():reject(Error('launcher '+c))));
    survivor=await until(()=>browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().endsWith('#independent')),15000);
    await until(()=>fs.existsSync(path.join(profile,'Profile 1/Preferences')),15000);
    await survivor.goto('chrome://profile-picker/');await survivor.waitForFunction(()=>typeof chrome.send==='function');
    await survivor.evaluate(p=>chrome.send('getProfileStatistics',[p]),path.join(profile,'Default'));await pause(300);
   }
   await page.bringToFront();
   const urls=[origin+'/'+kind+'-'+mode];
   row.urls=urls;const at=arrivals.length;
   await page.evaluate(urls=>{const s=document.createElement('script');s.type='speculationrules';s.textContent=JSON.stringify({prefetch:[{source:'list',urls,eagerness:'immediate'}]});document.head.append(s);},urls);
   await until(()=>row.preloadEvents.some(e=>e.prefetchUrl===urls[0]&&e.status==='Ready'),15000);
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
   assert(!settled);assert.equal(row.pending.decisions.length,0);assert.equal(row.pending.url,origin+'/source');
   if(mode==='delete-cancel'){
    void survivor.evaluate(p=>chrome.send('removeProfile',[p]),path.join(profile,'Default')).catch(e=>{row.triggerError=String(e);});
   }else{
    void quit.goto('chrome://quit/').catch(e=>{row.triggerError=String(e);});
   }
   row.waitingForPrompt=true;await until(()=>dialog,10000);assert.equal(dialog.type(),'beforeunload');row.nativePrompt=true;
   row.pendingAtPrompt={settled,url:page.url(),closed:page.isClosed()};
   assert(!settled,'prompt must precede native response timeout');assert.equal(row.pendingAtPrompt.url,origin+'/source');
   await dialog.dismiss();row.cancelled=true;
   assert(browser.isConnected());assert(!guard.isClosed());assert(!page.isClosed());
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
   const fresh=await active.newPage();await fresh.goto(origin+'/fresh-'+mode);assert.equal(await fresh.title(),'Prefetch fixture');row.freshPassed=true;
   row.passed=true;

  }catch(e){row.error=String(e);process.exitCode=1;}finally{if(heldPid){try{process.kill(heldPid,'SIGCONT');}catch(e){if(e.code!=='ESRCH')throw e;}heldPid=null;}await context?.close();fs.rmSync(profile,{recursive:true,force:true});row.profileRemoved=!fs.existsSync(profile);fs.writeFileSync(path.join(root,'progress.json'),JSON.stringify(report,null,2));}
 }
}finally{await new Promise(r=>server.close(r));fs.rmSync(path.join(root,'certificates'),{recursive:true,force:true});fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report.schedules.map(r=>({kind:r.kind,error:r.error,preload:r.preloadEvents,arrivals:r.beforeConsumption?.arrivals}))));
