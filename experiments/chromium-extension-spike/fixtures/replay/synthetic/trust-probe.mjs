// Browser-level TLS security control, separate from all blocker/oracle counts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createCertificates} from '../pilot/certificates.mjs';
import {spkiList,publicTrust} from './certificate-set.mjs';
import {startSynthetic} from './transport.mjs';
const [electronPath,chromiumPath,assets,playwrightPath,output]=process.argv.slice(2);
assert(output&&!fs.existsSync(output));
const {_electron,chromium}=await import(pathToFileURL(playwrightPath));
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-f12-trust-probe-')));
const good=createCertificates(path.join(temp,'good'),['good.fixture.test']);
const bad=createCertificates(path.join(temp,'bad'),['bad.fixture.test']);
const material={entries:[good,bad]},trusted={entries:[good]};
const fixtures=new Map(['good','bad'].map(n=>['https://'+n+'.fixture.test/',{status:200,contentType:'text/html',body:'<!doctype html><link rel="icon" href="data:,"><title>Authored TLS control</title>'}]));
const report={kind:'fixture-tls-security-control',passed:false,rows:[],blockerObservations:0};
let proxy,app,context;
try{
 for(const engine of ['electron','chromium']){
  proxy=await startSynthetic({fixtures,tlsMaterial:material});
  const profile=path.join(temp,engine);fs.mkdirSync(profile);
  const args=[`--ignore-certificate-errors-spki-list=${spkiList(trusted)}`,`--proxy-server=http://127.0.0.1:${proxy.port}`,
   '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1','--use-mock-keychain'];
  let page,version;
  if(engine==='electron'){
   const appDir=path.join(temp,'app');fs.mkdirSync(appDir);
   fs.writeFileSync(path.join(appDir,'package.json'),JSON.stringify({main:'main.cjs'}));
   fs.copyFileSync(new URL('../pilot/fixture-trust.cjs',import.meta.url),path.join(appDir,'single-fixture-trust.cjs'));
   fs.copyFileSync(new URL('./fixture-trust.cjs',import.meta.url),path.join(appDir,'fixture-trust.cjs'));
   fs.writeFileSync(path.join(appDir,'trust.json'),JSON.stringify(publicTrust(trusted)));
   fs.writeFileSync(path.join(appDir,'main.cjs'),`const {app,BrowserWindow,session}=require('electron');const verify=require('./fixture-trust.cjs').createVerifier(require('./trust.json'));globalThis.trustChecks=[];app.whenReady().then(()=>{session.defaultSession.setCertificateVerifyProc((r,cb)=>{const accepted=verify(r.hostname,r.certificate.data);globalThis.trustChecks.push({host:r.hostname,accepted});cb(accepted?0:-2);});new BrowserWindow({show:false}).loadURL('about:blank');});`);
   app=await _electron.launch({executablePath:electronPath,args:[appDir,`--user-data-dir=${profile}`,...args],chromiumSandbox:true});
   page=await app.firstWindow({timeout:15000});version=await app.evaluate(()=>process.versions.chrome);
  }else{
   context=await chromium.launchPersistentContext(profile,{executablePath:chromiumPath,headless:false,chromiumSandbox:true,args:[...args,`--blanc-prototype-assets=${assets}`,'--disable-component-update']});
   page=await context.newPage();version=context.browser().version();
  }
  await page.goto('https://good.fixture.test/',{waitUntil:'load'});
  assert.equal(await page.title(),'Authored TLS control');
  let error='';try{await page.goto('https://bad.fixture.test/',{waitUntil:'load',timeout:15000});}catch(e){error=String(e.message);}
  const checks=app?await app.evaluate(()=>globalThis.trustChecks):null;
  if(engine==='electron'){assert.match(error,/ERR_FAILED/);assert(checks.some(c=>c.host==='bad.fixture.test'&&!c.accepted));}
  else assert.match(error,/ERR_CERT_AUTHORITY_INVALID|ERR_CERT_INVALID/);
  assert(proxy.arrivals.some(r=>r.url==='https://good.fixture.test/'));
  assert(!proxy.arrivals.some(r=>r.url==='https://bad.fixture.test/'));
  report.rows.push({engine,version,pinnedLeafLoaded:true,unpinnedLeafRejected:true,unpinnedHttpRequests:0,verifierChecks:checks,
   refusedConnections:proxy.faults,connectionErrors:proxy.connectionErrors});
  if(app){await app.close();app=null;}if(context){await context.close();context=null;}
  await proxy.close();proxy=null;
 }
 report.passed=true;
}catch(error){report.error=String(error.message);throw error;}finally{
 if(app)await app.close().catch(()=>{});if(context)await context.close().catch(()=>{});if(proxy)await proxy.close();
 fs.rmSync(temp,{recursive:true,force:true});report.disposableTreeRemoved=!fs.existsSync(temp);
 fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
