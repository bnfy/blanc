// Authored synthetic fixtures, actual Electron decisions. No acquisition or upstream.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {generate,sha} from './generate.mjs';
import {fixturesFor,startSynthetic} from './transport.mjs';
import {createCertificateSet,publicTrust,spkiList} from './certificate-set.mjs';
import {pageUrl,pageResponse,coverageControls} from './page.mjs';
import {compareReplays} from './stability.mjs';
const [electronPath,asarPath,asarModulePath,playwrightModulePath,evidencePath,selectionMode='probe',referrerMode='default']=process.argv.slice(2);
assert(evidencePath&&!fs.existsSync(evidencePath),'New evidence directory required');
fs.mkdirSync(evidencePath,{recursive:true});
const asar=await import(pathToFileURL(asarModulePath));
const {_electron}=await import(pathToFileURL(playwrightModulePath));
const hash=data=>createHash('sha256').update(data).digest('hex');
const originalSha=hash(fs.readFileSync(asarPath));
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-record-replay-')));
const generated=generate(fileURLToPath(new URL('../../../../../adblock/sources',import.meta.url)));
assert(['probe','full'].includes(selectionMode));assert(['default','no-referrer'].includes(referrerMode));
const selected=[];
if(selectionMode==='full')selected.push(...generated.candidates.filter(c=>c.sourceHost==='page.blanc-fixture.test'));
else for(const resourceType of ['script','xhr','image','stylesheet']) {
 for(const kind of ['blocking-candidate','near-miss-candidate','exception-candidate']) {
  const cases=generated.candidates.filter(c=>c.kind===kind&&c.resourceType===resourceType&&c.sourceHost==='page.blanc-fixture.test').slice(0,2);
  assert.equal(cases.length,2);selected.push(...cases);
 }
}
selected.push(...coverageControls());
const fixtures=fixturesFor(selected);
fixtures.set(pageUrl,pageResponse(selected,{noReferrer:referrerMode==='no-referrer'}));
const urls={page:pageUrl};
const hosts=[...new Set([...fixtures.keys()].map(url=>new URL(url).hostname))];
const proxyCerts=createCertificateSet(path.join(temp,'proxy-certificates'),hosts);
const bundleSha=sha(JSON.stringify([...fixtures]));
fs.writeFileSync(path.join(evidencePath,'candidate-manifest.json'),JSON.stringify({...generated,candidates:selected,selection:selectionMode,referrerMode,coverageControlCount:4,excludedDomainScopedCandidates:generated.candidates.filter(c=>c.sourceHost!=='page.blanc-fixture.test').length},null,2));
fs.writeFileSync(path.join(evidencePath,'responses.json'),JSON.stringify([...fixtures],null,2));
const report={kind:'synthetic-electron-resource-replay',selectionMode,referrerMode,passed:false,started:new Date().toISOString(),runs:[],
  trust:{mode:'ephemeral-leaf-SPKI-and-exact-proxy-authorities',systemTrustChanged:false,sessionVerifierRetained:true},sourceAsarSha256:originalSha,acceptanceCorpusRequests:0,nativeBuilds:0,cleanup:{},sourceHashes:{}};
for(const file of ['generate.mjs','transport.mjs','stability.mjs','run.mjs','coverage.json','page.mjs','certificate-set.mjs','fixture-trust.cjs'])report.sourceHashes[file]=hash(fs.readFileSync(new URL('./'+file,import.meta.url)));
report.sourceHashes['../pipeline/transport.mjs']=hash(fs.readFileSync(new URL('../pipeline/transport.mjs',import.meta.url)));
report.sourceHashes['../pilot/fixture-trust.cjs']=hash(fs.readFileSync(new URL('../pilot/fixture-trust.cjs',import.meta.url)));
report.fixtureCertificateFingerprints=proxyCerts.entries.map(e=>({hosts:e.hosts,leafFingerprint:e.leafFingerprint}));
report.fixtureCandidates=selected.length;report.bundleSha256=bundleSha;
const ownedChildren=[];
let stage='setup';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const end=Date.now()+45000;while(Date.now()<end){const value=await fn();if(value)return value;await pause(100);}throw new Error('Wait failed');}
async function browserRun(label,kind,transport,bundleSha256){
  const runPath=path.join(temp,label),appPath=path.join(runPath,'app');fs.mkdirSync(runPath);
  asar.extractAll(asarPath,appPath);
  const pkg=JSON.parse(fs.readFileSync(path.join(appPath,'package.json')));assert.equal(pkg.version,'1.36.0');
  const installedPin=JSON.parse(fs.readFileSync(path.join(appPath,'adblock/sources/pinned.json')));
  assert.deepEqual(installedPin.lists.map(({file,sha256})=>({file,sha256})),generated.sources);
  const engineArtifactSha=hash(fs.readFileSync(path.join(appPath,'node_modules/@ghostery/adblocker-electron/dist/commonjs/index.js')));
  const bootstrap=fs.readFileSync(new URL('../pipeline/bootstrap.cjs',import.meta.url));
  fs.writeFileSync(path.join(appPath,'capture-bootstrap.cjs'),bootstrap);
  for(const name of ['scrub.cjs'])fs.copyFileSync(new URL('../pipeline/'+name,import.meta.url),path.join(appPath,name));
  fs.copyFileSync(new URL('../pilot/fixture-trust.cjs',import.meta.url),path.join(appPath,'single-fixture-trust.cjs'));
  fs.copyFileSync(new URL('./fixture-trust.cjs',import.meta.url),path.join(appPath,'fixture-trust.cjs'));
  fs.writeFileSync(path.join(appPath,'package.json'),JSON.stringify({...pkg,main:'capture-bootstrap.cjs'}));
  const profile=path.join(runPath,'profile');fs.mkdirSync(profile);fs.mkdirSync(profile+'-Dev');
  fs.writeFileSync(path.join(profile+'-Dev','settings.json'),JSON.stringify({onboardingVersion:1,adblockProvider:'blanc',adblockEnabled:true,usagePing:false,searchSuggestions:false,onePasswordEnabled:false}));
  const trust=path.join(runPath,'trust.json');fs.writeFileSync(trust,JSON.stringify(publicTrust(proxyCerts)));
  const log=path.join(evidencePath,label+'-decisions.jsonl');fs.writeFileSync(log,'');
  const trustLog=path.join(evidencePath,label+'-trust.jsonl');
  const env={...process.env,BLANC_TEST:'0',BLANC_UBLOCK_TEST:'0',BLANC_F12_PROFILE:profile,BLANC_F12_LOG:log,BLANC_F12_TRUST:trust,BLANC_F12_TRUST_LOG:trustLog};
  delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  let app,child,outcome,failure;const browserFailures=[];let stderrBytes=0;const runId=randomUUID();
  try {
    app=await _electron.launch({executablePath:electronPath,args:[appPath,`--ignore-certificate-errors-spki-list=${spkiList(proxyCerts)}`,'--use-mock-keychain',`--user-data-dir=${profile}`,`--proxy-server=http://127.0.0.1:${transport.port}`,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],env,chromiumSandbox:true,timeout:60000});
    child=app.process();ownedChildren.push(child);child.stderr.on('data',chunk=>stderrBytes+=chunk.length); // Never persist raw browser diagnostics.
    const state=await until(async()=>{const s=await app.evaluate(()=>globalThis.__blancF12Capture.state());assert.equal(fs.realpathSync(s.userData),fs.realpathSync(profile+'-Dev'));return s.activeGates===0&&s.providers.some(p=>p.status.id==='blanc'&&p.status.phase==='ready')&&s;});
    const island=await until(async()=>(await app.windows()).find(p=>p.url()==='blanc-chrome://index/'));
    await island.waitForFunction(()=>!!window.browserAPI);
    await island.evaluate(({url,isPrivate})=>window.browserAPI.createTab(url,{private:isPrivate}),{url:urls.page,isPrivate:kind==='private'});
    const page=await until(async()=>(await app.windows()).find(p=>p.url()===urls.page));
    page.on('requestfailed',r=>browserFailures.push({url:r.url(),error:r.failure()?.errorText}));
    await page.waitForFunction(()=>window.pilot?.done,null,{timeout:600000});
    const dom=await page.evaluate(()=>({href:location.href,pilot:window.pilot}));
    assert.equal(dom.href,urls.page);assert.equal(dom.pilot.loads.length,selected.length);
    try {
      await page.waitForFunction(()=> (window.blancFixtureChildren||[]).length===(window.blancFixtureExecuted||[]).length,null,{timeout:10000});
    } catch(error) {
      const execution=await page.evaluate(()=>({executed:window.blancFixtureExecuted||[],children:window.blancFixtureChildren||[],loads:window.pilot.loads}));
      fs.writeFileSync(path.join(evidencePath,label+'-execution.json'),JSON.stringify({execution,browserFailures,connectionErrors:transport.connectionErrors,arrivals:transport.arrivals},null,2));
      throw error;
    }
    await pause(200); // Bounded post-completion observation, not arbitrary network-idle inference.
    const rows=fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const records=rows.filter(r=>!r.fault);assert(records.length>=selected.length+1);assert(records.every(r=>r.profileKind===kind));
    if(referrerMode==='no-referrer')assert(records.every(r=>r.referrer===''));
    assert(records.filter(r=>r.resourceType!=='mainFrame').every(r=>r.initiatorOriginPresent&&r.initiatorOrigin===new URL(pageUrl).origin));
    const execution=await page.evaluate(()=>({executed:window.blancFixtureExecuted||[],children:window.blancFixtureChildren||[],loads:window.pilot.loads}));
    fs.writeFileSync(path.join(evidencePath,label+'-execution.json'),JSON.stringify({execution,browserFailures,connectionErrors:transport.connectionErrors,arrivals:transport.arrivals},null,2));
    const observedScripts=selected.filter(c=>c.resourceType==='script'&&records.some(r=>r.url===c.url&&r.result?.cancel!==true)).map(c=>c.id).sort();
    assert.deepEqual([...execution.executed].sort(),observedScripts);
    assert.deepEqual([...execution.children].sort(),observedScripts);
    for(const c of selected) {
      const observations=records.filter(r=>r.url===c.url);assert.equal(observations.length,1);
      assert.equal(execution.loads.find(l=>l.id===c.id)?.event,observations[0].result?.cancel===true?'error':'load');
    }
    const finalState=await app.evaluate(()=>globalThis.__blancF12Capture.state());
    outcome={runId,bundleSha256,execution,complete:true,faults:[...transport.faults,...rows.filter(r=>r.fault)],records,
      arrivals:transport.arrivals||[],connectionErrors:transport.connectionErrors,browserFailures,excludedInternal:finalState.excludedInternal,stderrBytes,
      environment:{engineArtifactSha,engineResourcesSha:installedPin.ghosteryResources.sha256,blockerSettings:{provider:'blanc',enabled:true,BLANC_TEST:'0'},appSha:originalSha,bootstrapSha:hash(bootstrap),engineSha:hash(fs.readFileSync(path.join(appPath,'src/main/adblock.js'))),filtersSha:hash(fs.readFileSync(path.join(appPath,'adblock/sources/pinned.json'))),policySha:hash(fs.readFileSync(new URL('../pipeline/scrub.cjs',import.meta.url))),electron:state.versions.electron,chromium:state.versions.chrome}};
  } catch(error) { fs.writeFileSync(path.join(evidencePath,label+'-failure.json'),JSON.stringify({stage:label,message:String(error.message)},null,2));failure=error; } finally {
    if(app)await app.close().catch(()=>child?.kill('SIGTERM'));
    if(child&&child.exitCode===null&&child.signalCode===null){await Promise.race([new Promise(r=>child.once('exit',r)),pause(3000)]);}
    if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await Promise.race([new Promise(r=>child.once('exit',r)),pause(3000)]);}
    if(child&&child.exitCode===null&&child.signalCode===null)failure ||= new Error('Owned process not exited');
    else fs.rmSync(runPath,{recursive:true,force:true});
  }
  if(failure)throw failure;
  return outcome;
}
let replay;
try {
  for(const kind of ['regular','private']){
    const runs=[];
    for(const letter of ['a','b']){
      stage=kind+'-'+letter;
      replay=await startSynthetic({fixtures,tlsMaterial:proxyCerts});
      const run=await browserRun(kind+'-'+letter,kind,replay,bundleSha);
      fs.writeFileSync(path.join(evidencePath,kind+'-'+letter+'-run.json'),JSON.stringify(run,null,2));
      await replay.close();replay=null;runs.push(run);report.runs.push({kind,letter,runId:run.runId,requests:run.records.length,faults:run.faults.length});
    }
    stage=kind+'-compare';
    const result=compareReplays(...runs);fs.writeFileSync(path.join(evidencePath,kind+'-stability.json'),JSON.stringify(result,null,2));
    assert(result.stable);assert(result.oracle.length>=selected.length+1);
    report.runs.at(-1).candidateDecisions=selected.filter(c=>c.kind!=='coverage-control').reduce((counts,c)=>{const d=result.oracle.find(r=>r.context.url===c.url)?.decision;assert(d);counts[d]++;return counts;},{block:0,allow:0});
    console.log(JSON.stringify({stage:kind+'-stable',observations:result.oracle.length,candidates:report.runs.at(-1).candidateDecisions}));
  }
  report.passed=true;
} catch {
  report.error='synthetic-probe-failed';report.failedStage=stage;process.exitCode=1;
} finally {
  if(replay)await replay.close();
  report.cleanup.sourceAsarUnchanged=hash(fs.readFileSync(asarPath))===originalSha;
  report.cleanup.ownedChildrenExited=ownedChildren.every(c=>c.exitCode!==null||c.signalCode!==null);
  if(report.cleanup.ownedChildrenExited)fs.rmSync(temp,{recursive:true,force:true});report.cleanup.disposableTreeRemoved=!fs.existsSync(temp);
  report.finished=new Date().toISOString();fs.writeFileSync(path.join(evidencePath,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,error:report.error,evidencePath,cleanup:report.cleanup}));
}
