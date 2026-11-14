import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
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
 for(const kind of ['regular','private']) {
  const profile=path.join(root,kind);fs.mkdirSync(profile);const log=path.join(root,kind+'.jsonl');fs.writeFileSync(log,'');let context;
  const row={kind};report.schedules.push(row);
  try {
   context=await pw.chromium.launchPersistentContext(profile,{executablePath:config.chromium,headless:false,chromiumSandbox:true,args:['--use-mock-keychain','--no-proxy-server',`--ignore-certificate-errors-spki-list=${spkiList(material)}`,'--host-resolver-rules=MAP page.blanc-fixture.test 127.0.0.1, MAP 000491b06a.com 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',`--blanc-blocker-assets=${config.engine}`,`--blanc-blocker-log=${log}`,`--blanc-prototype-assets=${config.ui}`,'--no-first-run','--disable-component-update','--disable-sync']});
   const browser=context.browser(),active=kind==='private'?await browser.newContext():context,page=await active.newPage();
   const cdp=await active.newCDPSession(page);await cdp.send('Preload.enable');row.preloadEvents=[];
   cdp.on('Preload.prefetchStatusUpdated',e=>row.preloadEvents.push(e));
   const target=(await cdp.send('Target.getTargetInfo')).targetInfo;
   const bc=await browser.newBrowserCDPSession();assert.equal((await bc.send('Target.getBrowserContexts')).browserContextIds.includes(target.browserContextId),kind==='private');
   const origin=`https://page.blanc-fixture.test:${server.address().port}`;
   await page.goto(origin+'/source');
   const urls=[origin+'/'+kind+'-allowed',`https://000491b06a.com:${server.address().port}/${kind}-blocked`];
   row.urls=urls;const at=arrivals.length;
   await page.evaluate(urls=>{const s=document.createElement('script');s.type='speculationrules';s.textContent=JSON.stringify({prefetch:[{source:'list',urls,eagerness:'immediate'}]});document.head.append(s);},urls);
   await pause(8000);
   row.beforeConsumption={arrivals:arrivals.slice(at),decisions:fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)};
   row.navigation=[];
   for(const url of urls){const before=arrivals.length;let error=null;try{await page.goto(url,{timeout:15000});}catch(e){error=String(e);}row.navigation.push({url,error,arrivals:arrivals.slice(before),currentUrl:page.url()});}
   row.finalDecisions=fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
   row.histograms=await bc.send('Browser.getHistograms',{query:'Prefetch',delta:false});
  }catch(e){row.error=String(e);process.exitCode=1;}finally{await context?.close();fs.rmSync(profile,{recursive:true,force:true});row.profileRemoved=!fs.existsSync(profile);}
 }
}finally{await new Promise(r=>server.close(r));fs.rmSync(path.join(root,'certificates'),{recursive:true,force:true});fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report.schedules.map(r=>({kind:r.kind,error:r.error,preload:r.preloadEvents,arrivals:r.beforeConsumption?.arrivals}))));
