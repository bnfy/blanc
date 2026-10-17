// Pre-integration negative control. CDP observes Chromium; it never supplies decisions.
// This is not the independent native request-hook adapter required for acceptance.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {X509Certificate,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {sha} from './generate.mjs';
import {startSynthetic} from './transport.mjs';
import {createCertificateSet} from './certificate-set.mjs';
import {pageUrl} from './page.mjs';
import {compareBaseline} from './comparison.mjs';
const [executablePath,assets,playwrightPath,oraclePath,evidencePath]=process.argv.slice(2);
assert(evidencePath&&!fs.existsSync(evidencePath));
const {chromium}=await import(pathToFileURL(playwrightPath));
const sourceReport=JSON.parse(fs.readFileSync(path.join(oraclePath,'report.json')));
assert.equal(sourceReport.passed,true);
const manifest=JSON.parse(fs.readFileSync(path.join(oraclePath,'candidate-manifest.json')));
const fixtures=new Map(JSON.parse(fs.readFileSync(path.join(oraclePath,'responses.json'))));
const bundleSha256=sha(JSON.stringify([...fixtures]));assert.equal(bundleSha256,sourceReport.bundleSha256);
const hosts=[...new Set([...fixtures.keys()].map(u=>new URL(u).hostname))];
fs.mkdirSync(evidencePath);
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-f12-chromium-')));
const tlsMaterial=createCertificateSet(path.join(temp,'certificates'),hosts);
// Only these ephemeral fixture leaf keys. The proxy separately enforces exact
// CONNECT/SNI/Host/URL membership; no system trust changes or global ignore flag.
const spki=tlsMaterial.entries.map(m=>{
 const cert=new X509Certificate(m.cert);
 assert(cert.verify(new X509Certificate(m.ca).publicKey));
 for(const host of m.hosts)assert.equal(cert.checkHost(host,{wildcards:false}),host);
 return Buffer.from(sha(cert.publicKey.export({type:'spki',format:'der'})),'hex').toString('base64');
}).join(',');
const report={kind:'chromium-no-blocker-negative-control',started:new Date().toISOString(),passed:false,nativeBlockerInstalled:false,
 acceptance:false,oraclePath: path.basename(oraclePath),bundleSha256,sourceHashes:{},runs:[],cleanup:{},nativeBuilds:0,
 trust:{mechanism:'ephemeral leaf SPKI list plus exact CONNECT/SNI/Host/URL allowlist',systemTrustChanged:false,
 leafFingerprints:tlsMaterial.entries.map(e=>e.leafFingerprint)},
 gaps:['Native Mojo engine and browser request hook absent','CDP does not expose request_initiator; no substituted frame origin','Native hook timing and startup/crash holds unmeasured']};
for(const file of ['chromium-baseline.mjs','comparison.mjs','transport.mjs','certificate-set.mjs'])report.sourceHashes[file]=sha(fs.readFileSync(new URL(file,import.meta.url)));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let context,privateContext,replay;
try {
 for(const kind of ['regular','private']){
  for(const letter of ['a','b']){
   const label=kind+'-'+letter;
   const profile=path.join(temp,label);fs.mkdirSync(profile);
   replay=await startSynthetic({fixtures,tlsMaterial});
   context=await chromium.launchPersistentContext(profile,{executablePath,headless:false,chromiumSandbox:true,
    args:['--use-mock-keychain','--no-first-run','--no-default-browser-check','--disable-component-update','--disable-domain-reliability','--disable-sync',`--blanc-prototype-assets=${assets}`,
     `--proxy-server=http://127.0.0.1:${replay.port}`,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',`--ignore-certificate-errors-spki-list=${spki}`],timeout:60000});
   const browser=context.browser();assert(browser.version().startsWith('157.'));
   const browserSession=await browser.newBrowserCDPSession();
   let activeContext=context;
   if(kind==='private'){privateContext=await browser.newContext();activeContext=privateContext;}
   const page=await activeContext.newPage();const cdp=await activeContext.newCDPSession(page);
   const info=await cdp.send('Target.getTargetInfo');
   const contexts=await browserSession.send('Target.getBrowserContexts');
   const isOffTheRecord=contexts.browserContextIds.includes(info.targetInfo.browserContextId);
   assert.equal(isOffTheRecord,kind==='private');
   const requests=[],responses=[],finished=[],failures=[],unexpected=[];
   await cdp.send('Network.enable');
   cdp.on('Network.requestWillBeSent',r=>{
    if(!/^https?:/.test(r.request.url))return;
    if(!fixtures.has(r.request.url)){unexpected.push({code:'unmanifested-browser-request'});return;}
    requests.push({requestId:r.requestId,url:r.request.url,method:r.request.method,type:r.type,documentURL:r.documentURL,
     frameId:r.frameId,initiatorType:r.initiator.type,redirectResponsePresent:!!r.redirectResponse});
   });
   cdp.on('Network.responseReceived',r=>responses.push({requestId:r.requestId,status:r.response.status,protocol:r.response.protocol,fromDiskCache:r.response.fromDiskCache,fromServiceWorker:r.response.fromServiceWorker}));
   cdp.on('Network.loadingFinished',r=>finished.push(r.requestId));
   cdp.on('Network.loadingFailed',r=>failures.push({requestId:r.requestId,errorText:r.errorText,blockedReason:r.blockedReason||null}));
   await page.goto(pageUrl,{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>window.pilot?.done,null,{timeout:600000});
   await page.waitForFunction(()=>(window.blancFixtureChildren||[]).length===(window.blancFixtureExecuted||[]).length,null,{timeout:10000});
   await pause(200);
   const execution=await page.evaluate(()=>({executed:window.blancFixtureExecuted||[],children:window.blancFixtureChildren||[],loads:window.pilot.loads}));
   // Exact built-in service endpoints denied by the proxy outside this target's
   // CDP stream. Keep every denial; any unknown page request still faults above.
   const deniedServiceAuthorities=new Set(['clients2.google.com','www.google.com:443','accounts.google.com:443']);
   const serviceDenials=replay.faults.filter(f=>['plaintext-refused','connect-refused'].includes(f.code)&&deniedServiceAuthorities.has(f.authority));
   const fixtureFaults=replay.faults.filter(f=>!serviceDenials.includes(f));
   const run={runId:randomUUID(),profileKind:kind,isOffTheRecord,browserContextId:info.targetInfo.browserContextId,version:browser.version(),
    executableSha256:sha(fs.readFileSync(executablePath)),bundleSha256,complete:true,nativeBlockerInstalled:false,
    requests,responses,finished,failures,execution,connectionErrors:replay.connectionErrors,arrivals:replay.arrivals,serviceDenials,faults:[...fixtureFaults,...unexpected]};
   fs.writeFileSync(path.join(evidencePath,label+'-run.json'),JSON.stringify(run,null,2));
   const oracle=JSON.parse(fs.readFileSync(path.join(oraclePath,kind+'-stability.json')));assert(oracle.stable);
   const result=compareBaseline(manifest,oracle,run,fixtures);
   fs.writeFileSync(path.join(evidencePath,label+'-comparison.json'),JSON.stringify(result,null,2));
   assert(result.transportComplete,JSON.stringify(result.faults));
   report.runs.push({kind,letter,runId:run.runId,counts:result.counts,acceptance:false});
   if(privateContext){await privateContext.close();privateContext=null;}
   await context.close();context=null;await replay.close();replay=null;
   console.log(JSON.stringify({stage:label,counts:result.counts,acceptance:false}));
  }
 }
 report.passed=true;
} catch(error){report.error=String(error.message);process.exitCode=1;}
finally{
 if(privateContext)await privateContext.close();
 if(context)await context.close();
 if(replay)await replay.close();
 fs.rmSync(temp,{recursive:true,force:true});report.cleanup.disposableTreeRemoved=!fs.existsSync(temp);
 report.finished=new Date().toISOString();fs.writeFileSync(path.join(evidencePath,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,error:report.error,evidencePath,acceptance:false}));
}
