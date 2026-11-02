/* global chrome */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {serve} from './fixtures/replay/pipeline/transport.mjs';
import {createCertificateSet,spkiList} from './fixtures/replay/synthetic/certificate-set.mjs';
import {readinessHosts,parseReadinessUrl,isBlockedReadinessUrl} from './ubo-readiness-fixtures.mjs';
const [configPath,payload,resultPath]=process.argv.slice(2);
const config=JSON.parse(fs.readFileSync(configPath));
const {chromium}=await import(pathToFileURL(config.playwright));
const root=fs.mkdtempSync('/private/tmp/blanc-ubo-readiness-');
const log=root+'/decisions.jsonl';fs.writeFileSync(log,'');
const hits=[],refusals=[];
const certificates=createCertificateSet(root+'/certificates',readinessHosts);
const server=await serve({hosts:readinessHosts,tlsMaterial:certificates,
 fault:(code,authority)=>refusals.push({code,authority}),respond:async(req,res)=>{
  const url=parseReadinessUrl('https://'+req.headers.host+req.url);
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  hits.push(url.href);const page=url.hostname==='page.blanc-fixture.test';
  res.writeHead(200,{'Content-Type':page?'text/html':'text/plain','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});
  res.end(page?'<!doctype html><title>uBO fixture</title>ready':'fixture');
 }});
const result={scope:'bounded offline blocking and cancellation hold',started:new Date().toISOString(),chromiumSandbox:true,fixtureTransport:{scheme:'https',offline:true,leafSpki:spkiList(certificates)},checks:[],hits,profileRemoved:false,sources:{}};let context;
for(const file of ['ubo-readiness-probe.mjs','ubo-readiness-fixtures.mjs','fixtures/replay/pipeline/transport.mjs','fixtures/replay/synthetic/certificate-set.mjs','ubo-component.mjs','ubo-reload-guard.js','native/blocker/blocker_proxy.cc'])result.sources[file]=crypto.createHash('sha256').update(fs.readFileSync(new URL(file,import.meta.url))).digest('hex');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const manifest=fs.readFileSync(payload+'/manifest.json','utf8').replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 context=await chromium.launchPersistentContext(root+'/profile',{executablePath:config.chromium,headless:false,chromiumSandbox:true,ignoreDefaultArgs:['--disable-extensions','--disable-component-extensions-with-background-pages'],args:[
  ...(config.documentStart?['--blanc-ubo-document-start']:[]),'--use-mock-keychain','--blanc-ubo-component-probe='+payload,'--blanc-ubo-component-manifest='+manifest,'--blanc-ubo-offline-probe','--blanc-ubo-reload-probe',
  '--blanc-blocker-log='+log,'--blanc-blocker-assets='+config.engine,'--blanc-prototype-assets='+config.ui,
  '--ignore-certificate-errors-spki-list='+spkiList(certificates),'--proxy-server=http://127.0.0.1:'+server.port,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1','--disable-sync','--disable-component-update']});
 if(process.argv.includes('--unready')){
  const page=await context.newPage();let cancelled=false;
  try{await page.goto('https://page.blanc-fixture.test/unready');}catch{cancelled=true;}
  assert(cancelled);assert(!hits.some(url=>parseReadinessUrl(url).pathname==='/unready'));
  result.checks.push({name:'missing-startup-handshake-fails-closed',passed:true});result.passed=true;
 }else{
 let popup=await context.newPage();
 // The pinned payload restarts itself on first Chromium install. Retain the
 // observed navigation interruption, then reacquire its actual extension page.
 result.startupNavigationErrors=[];
 for(let attempt=0;attempt<10;attempt++){
  try{await popup.goto('chrome-extension://oddhmofgkplblkmckempfepikkophank/popup-fenix.html');break;}
  catch(error){result.startupNavigationErrors.push(String(error));if(attempt===9)throw error;await delay(300);if(popup.isClosed())popup=await context.newPage();}
 }
 for(let i=0;i<600;i++){
  try{
   if(popup.isClosed()){popup=await context.newPage();await popup.goto('chrome-extension://oddhmofgkplblkmckempfepikkophank/popup-fenix.html');}
   if(await popup.evaluate(()=>Boolean(chrome.extension.getBackgroundPage()?.__blancUboProbe)))break;
  }catch(error){result.startupNavigationErrors.push(String(error));if(!popup.isClosed())await popup.close();}
  if(i===599)throw Error('uBO readiness timeout');await delay(100);
 }
 result.state=await popup.evaluate(()=>chrome.extension.getBackgroundPage().__blancUboProbe.state());assert.equal(result.state.readyToFilter,true);
 const baseline=await context.newPage();await baseline.goto('https://page.blanc-fixture.test/baseline');
 const pinnedDecision=await baseline.evaluate(async()=>{try{const r=await fetch('https://securepubads.g.doubleclick.net/tag/js/gpt.js');return {status:r.status,url:r.url,bytes:(await r.text()).length};}catch{return 'blocked';}});
 result.pinnedDecision=pinnedDecision;
 assert(!hits.some(isBlockedReadinessUrl));
 assert(pinnedDecision==='blocked'||pinnedDecision.url.startsWith('chrome-extension://oddhmofgkplblkmckempfepikkophank/')||pinnedDecision.url.startsWith('data:'));
 result.checks.push({name:'bundled-list-original-transfer-suppressed',passed:true,pinnedDecision});await baseline.close();
 await popup.evaluate(async()=>{const p=chrome.extension.getBackgroundPage().__blancUboProbe;p.setFilters('||blocked.blanc-fixture.test^');await p.reload();});
 const page=await context.newPage();await page.goto('https://page.blanc-fixture.test/');
 const fetches=async suffix=>page.evaluate(async suffix=>{const out={};for(const host of ['allowed','blocked']){try{out[host]=(await fetch(`https://${host}.blanc-fixture.test/${suffix}`)).status;}catch{out[host]='blocked';}}return out;},suffix);
 const initial=await fetches('initial');assert.deepEqual(initial,{allowed:200,blocked:'blocked'});result.checks.push({name:'real-ubo-filter',passed:true,initial});
 assert(!hits.some(isBlockedReadinessUrl));
 // HTTPS avoids a mixed-content short circuit. The native control handler
 // rejects this scheme as well as the page sender; this is a reachability and
 // fail-closed check, not an isolated proof of sender authorization.
 const rejectedBefore=fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(e=>e.event==='ubo-control'&&!e.accepted).length;
 const unauthenticated=await page.evaluate(async()=>{try{await fetch('https://blanc-ubo-control.invalid/ready?999');return false;}catch{return true;}});assert(unauthenticated);
 const rejectedAfter=fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(e=>e.event==='ubo-control'&&!e.accepted).length;
 assert.equal(rejectedAfter,rejectedBefore+1);result.checks.push({name:'page-cannot-release',passed:true,transport:'https',nativeRejectionObserved:true,isolatedSenderAuthorization:false});
 const epoch=await popup.evaluate(()=>chrome.extension.getBackgroundPage().__blancUboProbe.begin());
 const staleRefused=await popup.evaluate(async epoch=>{try{await chrome.extension.getBackgroundPage().fetch(`http://blanc-ubo-control.invalid/ready?${epoch-1}`);return false;}catch{return true;}},epoch);
 assert(staleRefused);result.checks.push({name:'stale-generation-refused',passed:true});
 const popupRefused=await popup.evaluate(async epoch=>{try{await fetch(`http://blanc-ubo-control.invalid/ready?${epoch}`);return false;}catch{return true;}},epoch);
 assert(popupRefused);result.checks.push({name:'same-extension-popup-cannot-release',passed:true});
 const held=await fetches('held');assert.deepEqual(held,{allowed:'blocked',blocked:'blocked'});result.checks.push({name:'hold-cancels',passed:true,held,epoch});
 const privateContext=await context.browser().newContext();
 try{
  const privatePage=await privateContext.newPage(),session=await privateContext.newCDPSession(privatePage),browserSession=await context.browser().newBrowserCDPSession();
  const target=await session.send('Target.getTargetInfo'),contexts=await browserSession.send('Target.getBrowserContexts');
  assert(contexts.browserContextIds.includes(target.targetInfo.browserContextId));
  await privatePage.goto('https://page.blanc-fixture.test/private-during-hold');
  const privateDecision=await privatePage.evaluate(async()=>{try{await fetch('https://securepubads.g.doubleclick.net/tag/js/gpt.js?private');return 'allowed';}catch{return 'blocked';}});
  assert.equal(privateDecision,'blocked');result.checks.push({name:'private-blanc-blocker-independent-of-hold',passed:true});
 }finally{await privateContext.close();}
 await popup.evaluate(()=>chrome.extension.getBackgroundPage().__blancUboProbe.complete());
 const released=await fetches('released');assert.deepEqual(released,{allowed:200,blocked:'blocked'});result.checks.push({name:'release-preserves-filtering',passed:true,released});
 await popup.evaluate(()=>chrome.extension.getBackgroundPage().__blancUboProbe.reload());
 const reloaded=await fetches('reloaded');assert.deepEqual(reloaded,{allowed:200,blocked:'blocked'});result.checks.push({name:'actual-list-reload',passed:true,reloaded});
 const cdp=await context.browser().newBrowserCDPSession();
 const targets=await cdp.send('Target.getTargets');const background=targets.targetInfos.find(t=>t.type==='background_page'&&t.url==='chrome-extension://oddhmofgkplblkmckempfepikkophank/background.html');assert(background);
 result.backgroundClose=await cdp.send('Target.closeTarget',{targetId:background.targetId});assert(result.backgroundClose.success);
 await delay(300);assert(!(await cdp.send('Target.getTargets')).targetInfos.some(t=>t.targetId===background.targetId));
 const departed=await fetches('background-departed');assert.deepEqual(departed,{allowed:'blocked',blocked:'blocked'});result.checks.push({name:'background-document-loss-fails-closed',passed:true,departed});
 result.passed=true;
 }
}catch(error){result.passed=false;result.error=String(error);}finally{
 if(context)await context.close();await server.close();
 result.events=fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 result.refusedHostCount=new Set(refusals.map(x=>x.authority)).size;result.refusals=refusals;
 result.socketErrors=server.connectionErrors;if(server.connectionErrors.some(error=>error.code!=='ECONNRESET')){result.passed=false;result.transportError='unexpected socket error';}
 fs.rmSync(root,{recursive:true,force:true});result.profileRemoved=true;
 result.finished=new Date().toISOString();
 fs.writeFileSync(resultPath,JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,error:result.error,checks:result.checks}));
 process.exitCode=result.passed?0:1;
}
