import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createCertificateSet,spkiList} from './certificate-set.mjs';
import {pause} from './session.mjs';
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
 for(const kind of ['regular','private']) for(const mode of ['consume','utility-loss']) {
  const profile=path.join(root,kind+'-'+mode);fs.mkdirSync(profile);const log=path.join(root,kind+'-'+mode+'.jsonl');fs.writeFileSync(log,'');let context;
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
   if(mode==='utility-loss'){
    const processes=execFileSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'}).split('\n').map(l=>{const m=l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);return m&&{pid:Number(m[1]),ppid:Number(m[2]),command:m[3]};}).filter(Boolean);
    const owners=processes.filter(p=>p.command.includes('--user-data-dir='+profile)&&!p.command.includes('--type='));assert.equal(owners.length,1);
    const utilities=processes.filter(p=>p.ppid===owners[0].pid&&p.command.includes('--utility-sub-type=blanc.mojom.Blocker'));assert.equal(utilities.length,1);row.killedUtility=utilities[0];process.kill(utilities[0].pid,'SIGKILL');await pause(500);
   }
   row.urls=urls;const at=arrivals.length;
   await page.evaluate(urls=>{const s=document.createElement('script');s.type='speculationrules';s.textContent=JSON.stringify({prefetch:[{source:'list',urls,eagerness:'immediate'}]});document.head.append(s);},urls);
   await pause(8000);
   row.beforeConsumption={arrivals:arrivals.slice(at),decisions:fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)};
   row.navigation=[];
   for(const url of urls){const before=arrivals.length;let error=null;try{await Promise.all([page.waitForNavigation({timeout:15000}),page.evaluate(url=>{const a=document.createElement('a');a.href=url;a.textContent='consume';document.body.append(a);a.click();},url)]);}catch(e){error=String(e);}row.navigation.push({url,error,arrivals:arrivals.slice(before),currentUrl:page.url()});}
   row.finalDecisions=fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
   row.documentResponses=row.responses.filter(e=>e.type==='Document').map(e=>e.response);
   if(mode==='consume'){assert(row.documentResponses.some(r=>r.url===urls[0]&&r.fromPrefetchCache===true),'dedicated prefetch response required');assert.equal(row.navigation[0].arrivals.length,0);}
   else {assert.equal(row.beforeConsumption.arrivals.length,0);assert.equal(row.navigation[0].arrivals.length,0);assert(row.finalDecisions.some(d=>d.url===urls[0]&&d.decision==='block'),'native refusal required');}
   row.passed=true;
   row.histograms=await bc.send('Browser.getHistograms',{query:'Prefetch',delta:false});
  }catch(e){row.error=String(e);process.exitCode=1;}finally{await context?.close();fs.rmSync(profile,{recursive:true,force:true});row.profileRemoved=!fs.existsSync(profile);}
 }
}finally{await new Promise(r=>server.close(r));fs.rmSync(path.join(root,'certificates'),{recursive:true,force:true});fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report.schedules.map(r=>({kind:r.kind,error:r.error,preload:r.preloadEvents,arrivals:r.beforeConsumption?.arrivals}))));
