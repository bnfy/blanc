// Owner-authorized ten-page feasibility probe. Aggregate diagnostics only;
// never freeze a bundle or persist provider URLs, bodies, browser logs or HARs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createCertificates} from '../pilot/certificates.mjs';
import {startRecorder} from './recorder.mjs';
const [electronPath,asarPath,asarModulePath,playwrightModulePath,evidencePath]=process.argv.slice(2);
assert(evidencePath&&!fs.existsSync(evidencePath),'Fresh evidence path required');
const pages=[
  'https://en.wikipedia.org/wiki/Web_browser',
  'https://developer.mozilla.org/en-US/docs/Web',
  'https://www.bbc.com/',
  'https://www.theguardian.com/international',
  'https://www.reuters.com/',
  'https://apnews.com/',
  'https://www.nytimes.com/',
  'https://www.theverge.com/',
  'https://arstechnica.com/',
  'https://www.nasa.gov/',
];
const hosts=pages.map(url=>new URL(url).hostname);
const hash=data=>createHash('sha256').update(data).digest('hex');
const originalSha=hash(fs.readFileSync(asarPath));
const asar=await import(pathToFileURL(asarModulePath));
const {_electron}=await import(pathToFileURL(playwrightModulePath));
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-public-feasibility-')));
fs.mkdirSync(evidencePath,{recursive:true,mode:0o700});
const tlsMaterial=createCertificates(path.join(temp,'certificates'),hosts);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const alive=child=>child&&child.exitCode===null&&child.signalCode===null;
async function until(fn){const end=Date.now()+45000;while(Date.now()<end){const result=await fn();if(result)return result;await pause(100);}throw new Error('probe-timeout');}
const report={kind:'ten-public-page-feasibility',started:new Date().toISOString(),pages:[],
  sourceAsarSha256:originalSha,sourceHashes:{},hosts,
  policy:'existing scrub; explicit entry-host allowlist; no redirects; aggregate-only; real blocker enabled',
  observation:'15 seconds after starting each navigation; no claim of page completeness',
  profileKind:'regular',acceptanceCorpusRequests:0,bundlesWritten:0,nativeBuilds:0};
for(const name of ['feasibility.mjs','bootstrap.cjs','recorder.mjs','scrub.cjs','transport.mjs'])report.sourceHashes[name]=hash(fs.readFileSync(new URL('./'+name,import.meta.url)));
const owned=[];
try {
  for(const [index,url] of pages.entries()){
    const row={index,entrypoint:url,started:new Date().toISOString(),completed:false};
    const dir=path.join(temp,'page-'+index),appPath=path.join(dir,'app'),profile=path.join(dir,'profile');
    fs.mkdirSync(dir);asar.extractAll(asarPath,appPath);fs.mkdirSync(profile);fs.mkdirSync(profile+'-Dev');
    const pkg=JSON.parse(fs.readFileSync(path.join(appPath,'package.json')));assert.equal(pkg.version,'1.36.0');
    for(const name of ['bootstrap.cjs','scrub.cjs'])fs.copyFileSync(new URL('./'+name,import.meta.url),path.join(appPath,name));
    fs.copyFileSync(new URL('../pilot/fixture-trust.cjs',import.meta.url),path.join(appPath,'fixture-trust.cjs'));
    fs.writeFileSync(path.join(appPath,'package.json'),JSON.stringify({...pkg,main:'bootstrap.cjs'}));
    fs.writeFileSync(path.join(profile+'-Dev','settings.json'),JSON.stringify({onboardingVersion:1,adblockProvider:'blanc',adblockEnabled:true,usagePing:false,searchSuggestions:false,onePasswordEnabled:false}));
    const trustPath=path.join(dir,'trust.json');fs.writeFileSync(trustPath,JSON.stringify({ca:tlsMaterial.ca,cert:tlsMaterial.cert,hosts}));
    const env={...process.env,BLANC_TEST:'0',BLANC_UBLOCK_TEST:'0',BLANC_F12_PROFILE:profile,BLANC_F12_SUMMARY_ONLY:'1',
      BLANC_F12_LOG:path.join(dir,'must-not-be-written.jsonl'),BLANC_F12_TRUST:trustPath,BLANC_F12_TRUST_LOG:path.join(dir,'must-not-be-written-trust.jsonl')};
    delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
    let recorder,app,child,stderrBytes=0;
    try {
      recorder=await startRecorder({hosts,tlsMaterial}); // No testOrigin: actual public client.
      app=await _electron.launch({executablePath:electronPath,args:[appPath,'--use-mock-keychain',`--user-data-dir=${profile}`,
        `--proxy-server=http://127.0.0.1:${recorder.port}`,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],env,chromiumSandbox:true,timeout:60000});
      child=app.process();owned.push(child);child.stderr.on('data',b=>stderrBytes+=b.length);
      const ready=await until(async()=>{const state=await app.evaluate(()=>globalThis.__blancF12Capture.state());assert.equal(fs.realpathSync(state.userData),fs.realpathSync(profile+'-Dev'));return state.activeGates===0&&state.providers.some(p=>p.status.id==='blanc'&&p.status.phase==='ready')&&state;});
      row.versions={electron:ready.versions.electron,chromium:ready.versions.chrome};
      const island=await until(async()=>(await app.windows()).find(p=>p.url()==='blanc-chrome://index/'));
      await island.waitForFunction(()=>!!window.browserAPI);
      await app.evaluate(()=>globalThis.__blancF12Capture.resetMetrics());
      recorder.audit.length=0;recorder.faults.length=0;
      await island.evaluate(url=>window.browserAPI.createTab(url,{private:false}),url);
      await pause(15000);
      row.observer=(await app.evaluate(()=>globalThis.__blancF12Capture.state())).metrics;
      row.completed=true;
    } catch {row.error='probe-failed';process.exitCode=1;}
    finally {
      if(app)await app.close().catch(()=>child?.kill('SIGTERM'));
      if(alive(child))await Promise.race([new Promise(r=>child.once('exit',r)),pause(3000)]);
      if(alive(child)){child.kill('SIGKILL');await Promise.race([new Promise(r=>child.once('exit',r)),pause(3000)]);}
      if(recorder){
        await recorder.close();
        for(let i=0;i<170&&recorder.pending();i++)await pause(100);
        row.transport={audit:structuredClone(recorder.audit),faults:structuredClone(recorder.faults),pending:recorder.pending()};
      }
      row.ownedChildExited=!alive(child);row.stderrBytes=stderrBytes;
      row.rawObservationFilesAbsent=!fs.existsSync(env.BLANC_F12_LOG)&&!fs.existsSync(env.BLANC_F12_TRUST_LOG);
      if(row.ownedChildExited)fs.rmSync(dir,{recursive:true,force:true});
      row.finished=new Date().toISOString();report.pages.push(row);
      fs.writeFileSync(path.join(evidencePath,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
      console.log(JSON.stringify({page:index+1,completed:row.completed,audit:row.transport?.audit,childExited:row.ownedChildExited}));
    }
    if(!row.ownedChildExited||!row.rawObservationFilesAbsent)throw new Error('probe-cleanup-failed');
  }
} catch {report.error='feasibility-incomplete';process.exitCode=1;}
finally {
  report.cleanup={ownedChildrenExited:owned.every(c=>!alive(c)),sourceAsarUnchanged:hash(fs.readFileSync(asarPath))===originalSha};
  if(report.cleanup.ownedChildrenExited)fs.rmSync(temp,{recursive:true,force:true});
  report.cleanup.disposableTreeRemoved=!fs.existsSync(temp);report.finished=new Date().toISOString();
  fs.writeFileSync(path.join(evidencePath,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
}
