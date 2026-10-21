/* global chrome */
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {openSession,until,pause} from './session.mjs';import {startSynthetic} from './transport.mjs';import {createCertificateSet} from './certificate-set.mjs';
const [cfg,payload,evidence]=process.argv.slice(2),config={...JSON.parse(fs.readFileSync(cfg)),lifecycleProbe:true};assert(!fs.existsSync(evidence));fs.mkdirSync(evidence);
const host='https://page.blanc-fixture.test';
const body='<!doctype html><link rel="icon" href="data:,"><div id="marker">0</div><a id="activate" href="/prerender">activate</a><script>globalThis.life={initialPrerendering:document.prerendering,instance:crypto.randomUUID(),shows:[],activations:0};addEventListener("pageshow",e=>(life.shows.push({persisted:e.persisted}),document.documentElement.dataset.life=JSON.stringify(life)));document.addEventListener("prerenderingchange",()=>{life.activations++;document.documentElement.dataset.life=JSON.stringify(life);});</script>';
const fixtures=new Map(['/a','/b','/prerender','/queued'].map(p=>[host+p,{status:200,contentType:'text/html',body:body+(p==='/queued'?'<script src="/hold.js"></script>':'')} ]));
fixtures.set(host+'/hold.js',{status:200,contentType:'application/javascript',body:'void 0;'});let releaseHold;const gates=new Map([[host+'/hold.js',new Promise(resolve=>{releaseHold=resolve;})]]);
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-lifecycle-'))),certificates=createCertificateSet(path.join(root,'certificates'),[new URL(host).hostname]),replay=await startSynthetic({fixtures,tlsMaterial:certificates,gates});
const report={completed:false,cases:[],gaps:[],latencyMeasured:false,launch:{removedDefault:'--disable-back-forward-cache',forcedFeatures:[]},bfcacheNotUsed:[],preload:[],crashes:[]};let session;
try{
 session=await openSession({config,browserKind:'chromium',kind:'regular',label:'lifecycle',root,transport:replay,certificates,provider:'ublock-origin',uboPayload:payload});await session.uboConfigure();await session.uboSetFilters('');
 const popup=session.page.context().pages().find(p=>p.url().includes('/popup-fenix.html'));assert(popup);
 let cdp=await session.page.context().newCDPSession(session.page);await cdp.send('Page.enable');cdp.on('Page.backForwardCacheNotUsed',e=>report.bfcacheNotUsed.push(e));await cdp.send('Preload.enable');cdp.on('Preload.prerenderStatusUpdated',e=>report.preload.push(e));
 await session.page.goto(host+'/a');const tab=await popup.evaluate(async()=>{return (await chrome.tabs.query({})).find(t=>t.url==='https://page.blanc-fixture.test/a').id;});
 const snapshot=()=>popup.evaluate(tab=>chrome.webNavigation.getFrame({tabId:tab,frameId:0}),tab);
 const invoke=id=>popup.evaluate(({tab,id})=>new Promise(resolve=>chrome.tabs.executeScript(tab,{code:"document.querySelector('#marker').textContent=String(Number(document.querySelector('#marker').textContent)+1);true",blancDocumentId:id},result=>{const e=chrome.runtime.lastError;resolve(e?{error:e.message}:{result});})),{tab,id});
 const pageState=()=>session.page.evaluate(()=>({life:JSON.parse(document.documentElement.dataset.life||'null'),marker:document.querySelector('#marker').textContent,activationStart:performance.getEntriesByType('navigation')[0]?.activationStart}));
 const a=await snapshot(),aState=await pageState();assert.equal((await invoke(a.documentId)).result?.[0],true);
 await session.page.goto(host+'/b');const b=await snapshot(),cachedReject=await invoke(a.documentId);assert(cachedReject.error);assert.equal((await pageState()).marker,'0');
 const history=await cdp.send('Page.getNavigationHistory');await cdp.send('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex-1].id});await until(async()=>{try{return session.page.url()===host+'/a'&&await session.page.evaluate(()=>!!globalThis.life);}catch{return false;}});const restored=await snapshot(),restoreState=await pageState();
 if(restoreState.life.shows.some(s=>s.persisted)){
  assert.equal(restored.documentId,a.documentId);assert.equal(restoreState.life.instance,aState.life.instance);assert.equal(restoreState.marker,'1');
  const accepted=await invoke(a.documentId),wrong=await invoke(b.documentId);assert.equal(accepted.result?.[0],true);assert(wrong.error);assert.equal((await pageState()).marker,'2');
  report.cases.push({kind:'bfcache',status:'pass',a,aState,b,cachedReject,restored,restoreState,accepted,wrong});
 }else report.gaps.push({kind:'bfcache',reason:'No persisted pageshow: restoration not exercised',a,restored,restoreState,notUsed:report.bfcacheNotUsed});
 const browserCDP=await session.page.context().browser().newBrowserCDPSession();await cdp.detach();report.detachedDirectFrameSessionForPrerender=true;
 console.log('BFCache stage complete');report.prerenderSetting=await popup.evaluate(async()=>{const setting=chrome.privacy.network.networkPredictionEnabled;const before=await setting.get({});await setting.set({value:true});return {before,after:await setting.get({})};});
 assert.equal(report.prerenderSetting.after.value,true);
 await session.page.goto(host+'/b');const initiating=await snapshot();
 await session.page.evaluate(()=>{const s=document.createElement('script');s.type='speculationrules';s.textContent=JSON.stringify({prerender:[{source:'list',urls:['/prerender'],eagerness:'immediate'}]});document.head.append(s);});
 try{await until(async()=>{report.prerenderTargets=(await browserCDP.send('Target.getTargets')).targetInfos.filter(t=>t.url===host+'/prerender');return report.prerenderTargets.some(t=>t.subtype==='prerender');},15000);await pause(500);}catch(e){report.gaps.push({kind:'prerender-ready',reason:String(e)});}
 const statusesBeforeActivation=structuredClone(report.preload);await session.page.locator('#activate').click({noWaitAfter:true});await session.page.waitForURL(host+'/prerender');await pause(200);
 const activated=await snapshot(),activationState=await pageState(),stale=await invoke(initiating.documentId),current=await invoke(activated.documentId);assert(stale.error);assert.equal(current.result?.[0],true);
 if(activationState.life.initialPrerendering&&activationState.life.activations===1&&activationState.activationStart>0)report.cases.push({kind:'prerender',status:'pass',initiating,activated,activationState,statusesBeforeActivation,stale,current});
 else report.gaps.push({kind:'prerender',reason:'Activation evidence absent; ordinary navigation is not prerender acceptance',initiating,activated,activationState,statusesBeforeActivation,stale,current});
 cdp=await session.page.context().newCDPSession(session.page);
 console.log('Prerender stage complete');
 // A queued document_end call must not mutate a replacement after renderer loss.
 await session.page.goto(host+'/queued',{waitUntil:'commit'});await until(()=>replay.arrivals.some(a=>a.url===host+'/hold.js'));const beforeCrash=await snapshot();
 await popup.evaluate(({tab,id})=>{globalThis.__lifeQueued=null;chrome.tabs.executeScript(tab,{code:"document.querySelector('#marker').textContent='crashed-work';true",runAt:'document_end',blancDocumentId:id},result=>{const e=chrome.runtime.lastError;globalThis.__lifeQueued=e?{error:e.message}:{result};});},{tab,id:beforeCrash.documentId});await pause(200);assert.equal(await popup.evaluate(()=>globalThis.__lifeQueued),null);
 session.page.on('crash',()=>report.crashes.push({event:'page-crash'}));let crashCommandError=null;const crashCommand=cdp.send('Page.crash').catch(e=>{crashCommandError=String(e);});void crashCommand;await until(()=>report.crashes.length);await until(()=>popup.evaluate(()=>globalThis.__lifeQueued!==null));const queuedResult=await popup.evaluate(()=>globalThis.__lifeQueued);console.log('Crash observed',JSON.stringify(queuedResult));report.crashProgress={beforeCrash,queuedResult};
 await popup.evaluate(({tab,url})=>chrome.tabs.update(tab,{url}),{tab,url:host+'/a'});console.log('Browser recovery navigation requested');let recovered;await until(async()=>{recovered=await snapshot();return recovered?.documentId&&recovered.documentId!==beforeCrash.documentId&&recovered.url===host+'/a';});
 report.crashProgress.recovered=recovered;console.log('New browser document observed');let recoveredState;await until(async()=>{recoveredState=await popup.evaluate(({tab,id})=>new Promise(resolve=>chrome.tabs.executeScript(tab,{code:"({life:JSON.parse(document.documentElement.dataset.life||'null'),marker:document.querySelector('#marker')?.textContent})",blancDocumentId:id},result=>{void chrome.runtime.lastError;resolve(result?.[0]);})),{tab,id:recovered.documentId});return !!recoveredState?.life;});
 const crashStale=await invoke(beforeCrash.documentId),recoveryPositive=await invoke(recovered.documentId);
 assert.notEqual(recovered.documentId,beforeCrash.documentId);assert.equal(recoveredState.marker,'0');assert(crashStale.error);assert.equal(recoveryPositive.result?.[0],true);assert(queuedResult.error||(Array.isArray(queuedResult.result)&&queuedResult.result.every(x=>x===null)));
 report.cases.push({kind:'renderer-crash',status:'pass',queuedBeforeCrash:true,beforeCrash,crashCommandError,queuedResult,recovered,recoveredState,crashStale,recoveryPositive});
 report.completed=true;
}catch(e){report.error=String(e);process.exitCode=1;}finally{releaseHold();if(session)await session.close();report.faults=replay.faults;report.arrivals=replay.arrivals;await replay.close();fs.rmSync(root,{recursive:true,force:true});report.cleanup={removed:!fs.existsSync(root)};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({completed:report.completed,cases:report.cases.length,gaps:report.gaps.length,error:report.error}));}
