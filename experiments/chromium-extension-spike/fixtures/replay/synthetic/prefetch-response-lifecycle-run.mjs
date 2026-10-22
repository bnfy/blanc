import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import {execFileSync} from 'node:child_process';
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
 for(const kind of ['regular','private']) for(const mode of ['timeout','tab-close']) {
  const profile=path.join(root,kind+'-'+mode);fs.mkdirSync(profile);const log=path.join(root,kind+'-'+mode+'.jsonl');fs.writeFileSync(log,'');let context,heldPid;
  const row={kind,mode};report.schedules.push(row);
  try {
   context=await pw.chromium.launchPersistentContext(profile,{executablePath:config.chromium,headless:false,chromiumSandbox:true,args:['--use-mock-keychain','--no-proxy-server',`--ignore-certificate-errors-spki-list=${spkiList(material)}`,'--host-resolver-rules=MAP page.blanc-fixture.test 127.0.0.1, MAP 000491b06a.com 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--blanc-blocker-assets=${config.engine}`,`--blanc-blocker-log=${log}`,`--blanc-prototype-assets=${config.ui}`,'--no-first-run','--disable-component-update','--disable-sync']});
   const browser=context.browser(),active=kind==='private'?await browser.newContext():context,page=await active.newPage();
   const cdp=await active.newCDPSession(page);await cdp.send('Preload.enable');await cdp.send('Network.enable');row.responses=[];cdp.on('Network.responseReceived',e=>row.responses.push(e));row.preloadEvents=[];
   cdp.on('Preload.prefetchStatusUpdated',e=>row.preloadEvents.push(e));
   const target=(await cdp.send('Target.getTargetInfo')).targetInfo;
   const bc=await browser.newBrowserCDPSession();assert.equal((await bc.send('Target.getBrowserContexts')).browserContextIds.includes(target.browserContextId),kind==='private');
   const origin=`https://page.blanc-fixture.test:${server.address().port}`;
   await page.goto(origin+'/source');
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
   if(mode==='tab-close'){await page.close();assert(page.isClosed());}
   row.navigation=await navigation;assert(row.navigation.error);assert(!row.navigation.error.includes('Timeout 45000'),'fixture timeout is not native refusal');
   row.beforeResume=records();
   if(mode==='timeout')assert(row.beforeResume.some(d=>d.event==='navigation-response-decision'&&d.url===urls[0]&&d.engine_result===-1));
   process.kill(heldPid,'SIGCONT');heldPid=null;await pause(1500);
   row.afterResume=records();row.arrivalsAfterConsumption=arrivals.slice(at);
   const decisions=row.afterResume.filter(d=>d.event==='navigation-response-decision'&&d.url===urls[0]);
   assert.equal(decisions.length,mode==='timeout'?1:0);
   assert.equal(row.arrivalsAfterConsumption.length,1);
   // Same-profile fresh navigation proves the resumed utility and browser survive.
   const fresh=await active.newPage();await fresh.goto(origin+'/after-'+mode);
   assert.equal(await fresh.title(),'Prefetch fixture');row.freshNavigationPassed=true;
   if(mode==='timeout'){row.titleAfterLateReply=await page.title();assert.notEqual(row.titleAfterLateReply,'Prefetch fixture');}
   row.passed=true;
   row.histograms=await bc.send('Browser.getHistograms',{query:'Prefetch',delta:false});
  }catch(e){row.error=String(e);process.exitCode=1;}finally{if(heldPid){try{process.kill(heldPid,'SIGCONT');}catch(e){if(e.code!=='ESRCH')throw e;}heldPid=null;}await context?.close();fs.rmSync(profile,{recursive:true,force:true});row.profileRemoved=!fs.existsSync(profile);}
 }
}finally{await new Promise(r=>server.close(r));fs.rmSync(path.join(root,'certificates'),{recursive:true,force:true});fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report.schedules.map(r=>({kind:r.kind,error:r.error,preload:r.preloadEvents,arrivals:r.beforeConsumption?.arrivals}))));
