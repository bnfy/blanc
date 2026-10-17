// Disposable real-browser sessions shared by path and latency probes.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
import {freePort,observeWorkers} from './worker-observer.mjs';
import {sha} from './generate.mjs';import {publicTrust,spkiList} from './certificate-set.mjs';
export const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function until(fn,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await pause(100);}throw Error('Probe wait timed out');}
export async function openSession({config,browserKind,kind,label,root,transport,certificates,workerObservation=false,fixtureUrls=[]}){
 const pw=await import(pathToFileURL(config.playwright));const dir=path.join(root,label);fs.mkdirSync(dir);const profile=path.join(dir,'profile');fs.mkdirSync(profile);
 const log=path.join(dir,'decisions.jsonl');fs.writeFileSync(log,'',{mode:0o600});let app,context,privateContext,page,workerObserver;
 const args=[`--ignore-certificate-errors-spki-list=${spkiList(certificates)}`,'--use-mock-keychain',`--proxy-server=http://127.0.0.1:${transport.port}`,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'];
 const source={browserKind,kind};const observerPort=workerObservation?await freePort():null;
 if(observerPort)args.push('--remote-debugging-address=127.0.0.1','--remote-debugging-port='+observerPort);
 try{
 if(browserKind==='electron'){
  assert.equal(sha(fs.readFileSync(config.asar)),'5b4b78c8790c3af193a2c893564c674f2b05c75481d1b5673c0428dde60203ab');
  const asar=await import(pathToFileURL(config.asarModule));const appPath=path.join(dir,'app');asar.extractAll(config.asar,appPath);
  const pkg=JSON.parse(fs.readFileSync(path.join(appPath,'package.json')));assert.equal(pkg.version,'1.36.0');
  let bootstrap=fs.readFileSync(new URL('../pipeline/bootstrap.cjs',import.meta.url),'utf8');
  // A monotonic JS observer reference, not an invented Electron base::TimeTicks hook.
  for(const [a,b] of [["observer.decide = async function(event, details) {","observer.decide = async function(event, details) { const entered=process.hrtime.bigint();"],["saveDecision({ ...observed, result: result ?? {} });","saveDecision({ ...observed, result: result ?? {}, observer_to_result_us: Number(process.hrtime.bigint()-entered)/1000 });"]]){assert.equal(bootstrap.split(a).length,2);bootstrap=bootstrap.replace(a,b);}
  // Preserve the observed about:blank sentinel on initial navigation while
  // validating all actual network fields with the unchanged public scrubber.
  const scrubAnchor="const scrub = require('./scrub.cjs');";
  assert.equal(bootstrap.split(scrubAnchor).length,2);
  bootstrap=bootstrap.replace(scrubAnchor,`const baseScrub = require('./scrub.cjs');
const scrub={...baseScrub,decision(row){const checked={...row,frame:row.frame&&{...row.frame}};
for(const key of ['tabUrl'])if(checked[key]==='about:blank')checked[key]=null;
if(checked.frame)for(const key of ['url','topUrl'])if(checked.frame[key]==='about:blank')checked.frame[key]=null;
baseScrub.decision(checked);return row;}};`);
  fs.writeFileSync(path.join(appPath,'capture-bootstrap.cjs'),bootstrap);source.bootstrapSha256=sha(bootstrap);source.asarSha256=sha(fs.readFileSync(config.asar));
  for(const [src,dst] of [['../pipeline/scrub.cjs','scrub.cjs'],['../pilot/fixture-trust.cjs','single-fixture-trust.cjs'],['./fixture-trust.cjs','fixture-trust.cjs']])fs.copyFileSync(new URL(src,import.meta.url),path.join(appPath,dst));
  fs.writeFileSync(path.join(appPath,'package.json'),JSON.stringify({...pkg,main:'capture-bootstrap.cjs'}));fs.mkdirSync(profile+'-Dev');
  fs.writeFileSync(path.join(profile+'-Dev','settings.json'),JSON.stringify({onboardingVersion:1,adblockProvider:'blanc',adblockEnabled:true,usagePing:false,searchSuggestions:false,onePasswordEnabled:false}));
  const trust=path.join(dir,'trust.json');fs.writeFileSync(trust,JSON.stringify(publicTrust(certificates)));
  const env={...process.env,BLANC_TEST:'0',BLANC_UBLOCK_TEST:'0',BLANC_F12_PROFILE:profile,BLANC_F12_LOG:log,BLANC_F12_TRUST:trust,BLANC_F12_TRUST_LOG:path.join(dir,'trust.jsonl')};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  app=await pw._electron.launch({executablePath:config.electron,args:[appPath,`--user-data-dir=${profile}`,...args],env,chromiumSandbox:true,timeout:60000});
  const state=await until(async()=>{const s=await app.evaluate(()=>globalThis.__blancF12Capture.state());assert.equal(fs.realpathSync(s.userData),fs.realpathSync(profile+'-Dev'));return s.activeGates===0&&s.providers.some(p=>p.status.id==='blanc'&&p.status.phase==='ready')&&s;});source.versions=state.versions;
  const island=await until(async()=>(await app.windows()).find(p=>p.url()==='blanc-chrome://index/'));await island.waitForFunction(()=>!!window.browserAPI);
  await island.evaluate(isPrivate=>window.browserAPI.createTab('about:blank',{private:isPrivate}),kind==='private');
  page=await until(async()=>(await app.windows()).filter(p=>p.url()==='about:blank').at(-1));
 }else{
  context=await pw.chromium.launchPersistentContext(profile,{executablePath:config.chromium,headless:false,chromiumSandbox:true,args:[...args,`--blanc-blocker-assets=${config.engine}`,`--blanc-blocker-log=${log}`,`--blanc-prototype-assets=${config.ui}`,'--no-first-run','--no-default-browser-check','--disable-component-update','--disable-domain-reliability','--disable-sync'],timeout:60000});
  const browser=context.browser();assert(browser.version().startsWith('157.'));let active=context;
  if(kind==='private'){privateContext=await browser.newContext();active=privateContext;}
  page=await active.newPage();const cdp=await active.newCDPSession(page),session=await browser.newBrowserCDPSession();
  const info=await cdp.send('Target.getTargetInfo'),contexts=await session.send('Target.getBrowserContexts');source.isOffTheRecord=contexts.browserContextIds.includes(info.targetInfo.browserContextId);assert.equal(source.isOffTheRecord,kind==='private');source.version=browser.version();
 }
 if(workerObservation){workerObserver=await observeWorkers(observerPort,new Set(fixtureUrls));const cdp=await page.context().newCDPSession(page);const info=await cdp.send('Target.getTargetInfo');source.observedPageTarget=info.targetInfo;await workerObserver.attachPage(info.targetInfo.targetId);await cdp.detach();}
 const records=()=>fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 return {page,source,records,workerEvidence:()=>workerObserver?{events:workerObserver.events,faults:workerObserver.faults}:null,close:async()=>{if(workerObserver)await workerObserver.close();if(privateContext)await privateContext.close();if(context)await context.close();if(app)await app.close();}};
 }catch(e){if(workerObserver)await workerObserver.close();if(privateContext)await privateContext.close();if(context)await context.close();if(app)await app.close();throw e;}
}
