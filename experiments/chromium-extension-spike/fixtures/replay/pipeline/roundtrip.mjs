// Controlled upstream probe only. Never acquires public pages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {fixtureSet} from '../pilot/proxy.mjs';
import {createCertificates} from '../pilot/certificates.mjs';
import {startRecorder} from './recorder.mjs';
import {startReplay} from './offline.mjs';
import {compareReplays} from './stability.mjs';
const [electronPath,asarPath,asarModulePath,playwrightModulePath,evidencePath]=process.argv.slice(2);
assert(evidencePath&&!fs.existsSync(evidencePath),'New evidence directory required');
fs.mkdirSync(evidencePath,{recursive:true});
const asar=await import(pathToFileURL(asarModulePath));
const {_electron}=await import(pathToFileURL(playwrightModulePath));
const hash=data=>createHash('sha256').update(data).digest('hex');
const originalSha=hash(fs.readFileSync(asarPath));
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-record-replay-')));
const {urls,fixtures}=fixtureSet('https');
const hosts=[...new Set(Object.values(urls).map(url=>new URL(url).hostname))];
// This is controlled origin content, not a modification of acquired public pages.
const icon='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>');
fixtures.get(urls.page)[1]=fixtures.get(urls.page)[1].replace('<title>',`<link rel="icon" href="${icon}"><title>`);
const sourceCerts=createCertificates(path.join(temp,'upstream-certificates'),hosts);
const proxyCerts=createCertificates(path.join(temp,'proxy-certificates'),hosts);
const upstreamHits=[];
const upstream=https.createServer({...sourceCerts,ALPNProtocols:['http/1.1']},(req,res)=>{
  const url='https://'+req.headers.host+req.url;
  upstreamHits.push({url,cookiePresent:!!req.headers.cookie,authPresent:!!req.headers.authorization});
  const f=fixtures.get(url);
  if(!f){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':f[0],'Access-Control-Allow-Origin':'*','Set-Cookie':'fixture_session=never-persist-this-value'});res.end(f[1]);
});
const report={kind:'controlled-record-offline-replay',passed:false,started:new Date().toISOString(),runs:[],
  sourceAsarSha256:originalSha,acceptanceCorpusRequests:0,nativeBuilds:0,cleanup:{},sourceHashes:{}};
for(const file of ['scrub.cjs','recorder.mjs','offline.mjs','transport.mjs','stability.mjs','bootstrap.cjs','roundtrip.mjs'])report.sourceHashes[file]=hash(fs.readFileSync(new URL('./'+file,import.meta.url)));
const ownedChildren=[];
let stage='setup';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const end=Date.now()+45000;while(Date.now()<end){const value=await fn();if(value)return value;await pause(100);}throw new Error('Wait failed');}
async function browserRun(label,kind,transport,bundleSha256){
  const runPath=path.join(temp,label),appPath=path.join(runPath,'app');fs.mkdirSync(runPath);
  asar.extractAll(asarPath,appPath);
  const pkg=JSON.parse(fs.readFileSync(path.join(appPath,'package.json')));assert.equal(pkg.version,'1.36.0');
  const bootstrap=fs.readFileSync(new URL('./bootstrap.cjs',import.meta.url));
  fs.writeFileSync(path.join(appPath,'capture-bootstrap.cjs'),bootstrap);
  for(const name of ['scrub.cjs'])fs.copyFileSync(new URL('./'+name,import.meta.url),path.join(appPath,name));
  fs.copyFileSync(new URL('../pilot/fixture-trust.cjs',import.meta.url),path.join(appPath,'fixture-trust.cjs'));
  fs.writeFileSync(path.join(appPath,'package.json'),JSON.stringify({...pkg,main:'capture-bootstrap.cjs'}));
  const profile=path.join(runPath,'profile');fs.mkdirSync(profile);fs.mkdirSync(profile+'-Dev');
  fs.writeFileSync(path.join(profile+'-Dev','settings.json'),JSON.stringify({onboardingVersion:1,adblockProvider:'blanc',adblockEnabled:true,usagePing:false,searchSuggestions:false,onePasswordEnabled:false}));
  const trust=path.join(runPath,'trust.json');fs.writeFileSync(trust,JSON.stringify({ca:proxyCerts.ca,cert:proxyCerts.cert,hosts}));
  const log=path.join(evidencePath,label+'-decisions.jsonl');fs.writeFileSync(log,'');
  const trustLog=path.join(evidencePath,label+'-trust.jsonl');
  const env={...process.env,BLANC_TEST:'0',BLANC_UBLOCK_TEST:'0',BLANC_F12_PROFILE:profile,BLANC_F12_LOG:log,BLANC_F12_TRUST:trust,BLANC_F12_TRUST_LOG:trustLog};
  delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  let app,child,outcome,failure;let stderrBytes=0;const runId=randomUUID();
  try {
    app=await _electron.launch({executablePath:electronPath,args:[appPath,'--use-mock-keychain',`--user-data-dir=${profile}`,`--proxy-server=http://127.0.0.1:${transport.port}`,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],env,chromiumSandbox:true,timeout:60000});
    child=app.process();ownedChildren.push(child);child.stderr.on('data',chunk=>stderrBytes+=chunk.length); // Never persist raw browser diagnostics.
    const state=await until(async()=>{const s=await app.evaluate(()=>globalThis.__blancF12Capture.state());assert.equal(fs.realpathSync(s.userData),fs.realpathSync(profile+'-Dev'));return s.activeGates===0&&s.providers.some(p=>p.status.id==='blanc'&&p.status.phase==='ready')&&s;});
    const island=await until(async()=>(await app.windows()).find(p=>p.url()==='blanc-chrome://index/'));
    await island.waitForFunction(()=>!!window.browserAPI);
    await island.evaluate(({url,isPrivate})=>window.browserAPI.createTab(url,{private:isPrivate}),{url:urls.page,isPrivate:kind==='private'});
    const page=await until(async()=>(await app.windows()).find(p=>p.url()===urls.page));
    await page.waitForFunction(()=>window.pilot?.done,null,{timeout:15000});
    const dom=await page.evaluate(()=>({href:location.href,pilot:window.pilot}));
    assert.equal(dom.href,urls.page);assert(dom.pilot.allowedScript);assert.equal(dom.pilot.outcomes.data,'{"fixture":"allowed"}');assert.equal(dom.pilot.outcomes.noReferrerData,'{"fixture":"no-referrer"}');assert(!dom.pilot.blockedScriptExecuted);
    await pause(200); // Bounded post-completion observation, not arbitrary network-idle inference.
    const rows=fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const records=rows.filter(r=>!r.fault);assert.equal(records.length,6);assert(records.every(r=>r.profileKind===kind));
    const finalState=await app.evaluate(()=>globalThis.__blancF12Capture.state());
    outcome={runId,bundleSha256,complete:true,faults:[...transport.faults,...rows.filter(r=>r.fault)],records,
      arrivals:transport.arrivals||[],excludedInternal:finalState.excludedInternal,stderrBytes,
      environment:{appSha:originalSha,bootstrapSha:hash(bootstrap),engineSha:hash(fs.readFileSync(path.join(appPath,'src/main/adblock.js'))),filtersSha:hash(fs.readFileSync(path.join(appPath,'adblock/sources/pinned.json'))),policySha:report.sourceHashes['scrub.cjs'],electron:state.versions.electron,chromium:state.versions.chrome}};
  } catch(error) { failure=error; } finally {
    if(app)await app.close().catch(()=>child?.kill('SIGTERM'));
    if(child&&child.exitCode===null&&child.signalCode===null){await Promise.race([new Promise(r=>child.once('exit',r)),pause(3000)]);}
    if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await Promise.race([new Promise(r=>child.once('exit',r)),pause(3000)]);}
    if(child&&child.exitCode===null&&child.signalCode===null)failure ||= new Error('Owned process not exited');
    else fs.rmSync(runPath,{recursive:true,force:true});
  }
  if(failure)throw failure;
  return outcome;
}
let recorder,replay;
try {
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  recorder=await startRecorder({hosts,tlsMaterial:proxyCerts,testOrigin:{port:upstream.address().port,ca:sourceCerts.ca}});
  stage='acquisition';
  const acquisition=await browserRun('acquisition','regular',recorder,null);
  assert.equal(acquisition.faults.length,0);
  stage='freeze';
  const bundle=recorder.freeze(path.join(evidencePath,'bundle.json'));
  assert.equal(bundle.entries.length,4);await recorder.close();recorder=null;
  await new Promise(resolve=>{upstream.close(resolve);upstream.closeAllConnections();}); // Prove offline runs cannot use this upstream.
  report.acquisition={runId:acquisition.runId,requestCount:acquisition.records.length,bundleSha256:bundle.sha256,upstreamHits};
  for(const kind of ['regular','private']){
    const runs=[];
    for(const letter of ['a','b']){
      stage=kind+'-'+letter;
      replay=await startReplay({bundle,tlsMaterial:proxyCerts});
      const run=await browserRun(kind+'-'+letter,kind,replay,bundle.sha256);
      fs.writeFileSync(path.join(evidencePath,kind+'-'+letter+'-run.json'),JSON.stringify(run,null,2));
      await replay.close();replay=null;runs.push(run);report.runs.push({kind,letter,runId:run.runId,requests:run.records.length,faults:run.faults.length});
    }
    stage=kind+'-compare';
    const result=compareReplays(...runs);fs.writeFileSync(path.join(evidencePath,kind+'-stability.json'),JSON.stringify(result,null,2));
    assert(result.stable);assert.equal(result.oracle.length,6);
  }
  report.passed=true;
} catch {
  report.error='controlled-roundtrip-failed';report.failedStage=stage;process.exitCode=1;
} finally {
  if(recorder)await recorder.close();if(replay)await replay.close();
  if(upstream.listening)await new Promise(resolve=>{upstream.close(resolve);upstream.closeAllConnections();});
  report.cleanup.sourceAsarUnchanged=hash(fs.readFileSync(asarPath))===originalSha;
  report.cleanup.ownedChildrenExited=ownedChildren.every(c=>c.exitCode!==null||c.signalCode!==null);
  if(report.cleanup.ownedChildrenExited)fs.rmSync(temp,{recursive:true,force:true});report.cleanup.disposableTreeRemoved=!fs.existsSync(temp);
  report.finished=new Date().toISOString();fs.writeFileSync(path.join(evidencePath,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,error:report.error,evidencePath,cleanup:report.cleanup}));
}
