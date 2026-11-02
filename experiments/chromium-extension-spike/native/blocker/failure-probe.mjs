// Real process fault injection; only disposable profiles and a loopback HTTP fixture.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const [executablePath,uiAssets,engineAssets,playwrightPath,evidence]=process.argv.slice(2);
assert(evidence&&!fs.existsSync(evidence));fs.mkdirSync(evidence);
const {chromium}=await import(pathToFileURL(playwrightPath));
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-f12-failure-'))),results=[];
const tampered=path.join(root,'tampered');fs.mkdirSync(tampered);fs.writeFileSync(path.join(tampered,'engine.js'),fs.readFileSync(path.join(engineAssets,'engine.js'),'utf8')+'\n// tampered');
const hits=[];const server=http.createServer((req,res)=>{hits.push(req.url);res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Local blocker failure probe</title><link rel="icon" href="data:,">');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
let context;
try {
 for(const variant of ['missing','tampered','disconnect']){
  const profile=path.join(root,'profile-'+variant);fs.mkdirSync(profile);const log=path.join(root,variant+'.jsonl');fs.writeFileSync(log,'',{mode:0o600});
  const assets=variant==='missing'?path.join(root,'absent'):variant==='tampered'?tampered:engineAssets;
  context=await chromium.launchPersistentContext(profile,{executablePath,headless:false,chromiumSandbox:true,args:[`--blanc-prototype-assets=${uiAssets}`,`--blanc-blocker-assets=${assets}`,`--blanc-blocker-log=${log}`,'--use-mock-keychain','--no-first-run','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--proxy-server=http://127.0.0.1:1','--proxy-bypass-list=127.0.0.1']});
  const page=context.pages().find(p=>p.url()==='about:blank')||await context.newPage();
  const url=origin+'/'+variant;let error=null;
  if(variant==='disconnect'){
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});assert(hits.includes('/disconnect'));
   const cdp=await context.browser().newBrowserCDPSession();const info=await cdp.send('SystemInfo.getProcessInfo');
   const browserPid=info.processInfo.find(p=>p.type==='browser').id;
   const lines=execFileSync('/bin/ps',['-axo','pid=,ppid=,args='],{encoding:'utf8'}).split('\n');
   const owned=lines.map(line=>/^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)).filter(Boolean).filter(m=>Number(m[2])===browserPid&&m[3].includes('--utility-sub-type=blanc.mojom.Blocker')&&m[3].includes('--user-data-dir='+profile));
   assert.equal(owned.length,1);process.kill(Number(owned[0][1]),'SIGTERM');
   await new Promise(r=>setTimeout(r,300));
   error=await page.evaluate(async()=>{try{await fetch('/after-disconnect');return null;}catch(e){return String(e);}});
   assert(error);assert(!hits.includes('/after-disconnect'));
   results.push({variant,ownedUtilityTerminated:true,blockedAfterDisconnect:true,requestReachedServer:false});
  }else{
   try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});}catch(e){error=String(e.message);}
   assert(error?.includes('ERR_BLOCKED_BY_CLIENT'));assert(!hits.includes('/'+variant));
   results.push({variant,blocked:true,requestReachedServer:false,error});
  }
  await context.close();context=null;
  const records=fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r=>r.event==='engine-ready'||r.url?.startsWith(origin));
  assert(records.some(r=>r.event==='decision'&&r.engine_result===-1));
  fs.writeFileSync(path.join(evidence,variant+'.json'),JSON.stringify(records,null,2));
 }
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,results,startupDelayInjection:false,timeoutInjection:false},null,2));
}catch(e){fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:false,error:String(e),results},null,2));throw e;}
finally{if(context)await context.close();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
console.log(JSON.stringify({passed:true,results}));
