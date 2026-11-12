// Real Mac CDM lifecycle in fresh profiles, using the existing signed app.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {launchPackagedOverCdp} from './support/packaged-cdp.mjs';
const require=createRequire(import.meta.url);
const {prepareCdmFixtures,stageCdm,digest,assertCdmVersionAbsent,binaryRelative}=require('./support/cdm-lifecycle.cjs');
const {inspectCdmProcess}=require('./ecs-drm-playback-smoke.cjs');
const {protectedPage}=require('./support/ecs-protected-page.cjs');
const {browserStartupReady}=require('./support/ecs-startup.cjs');
const {finishFixture}=require('./support/fixture-cleanup.cjs');
assert.equal(process.platform,'darwin');assert(['arm64','x64'].includes(process.arch));
assert.equal(process.env.BLANC_UPDATE_CHANNEL,'ecs-qualification-disabled');
const executable=await fs.realpath(process.env.BLANC_PACKAGED_EXECUTABLE);
const application=path.dirname(path.dirname(path.dirname(executable)));
assert.notEqual(application,'/Applications/Blanc.app','never test the installed production app');
assert.match(process.env.BLANC_EXPECTED_ASAR_SHA256||'',/^[a-f0-9]{64}$/);
assert.equal(digest(await fs.readFile(path.join(application,'Contents/Resources/app.asar'))),process.env.BLANC_EXPECTED_ASAR_SHA256);
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',application],{timeout:120000});
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ecs-mac-cdm-'));
let profile=path.join(root,'first-profile'),app,settings,playback;
const token=crypto.randomBytes(16).toString('hex');
const platform=`darwin-${process.arch}`;
const report={passed:false,arch:process.arch,scope:'Mac first install, real vendor update and controlled cache rollback',stages:[]};
const evidence=`output/ecs-production/cdm-lifecycle-mac-${process.arch}.json`;
const persist=async()=>{await fs.mkdir(path.dirname(evidence),{recursive:true});await fs.writeFile(evidence,JSON.stringify(report,null,2));};
const checkpoint=async name=>{const stage={name};report.stages.push(stage);await persist();console.log('Mac CDM lifecycle: '+name);return stage;};
const wait=async(name,read,timeout=90000)=>{
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=await read();if(value)return value;await new Promise(resolve=>setTimeout(resolve,200));}
  throw Error('Timed out: '+name);
};
const server=http.createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(protectedPage(token,{muted:false}));}
  if(req.method==='POST'&&req.headers['x-blanc-probe']===token&&['/result','/ready'].includes(req.url)){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return res.writeHead(413).end();}
    try{if(req.url==='/result')playback=JSON.parse(body);}catch{return res.writeHead(400).end();}
    return res.end('ok');
  }
  res.writeHead(404).end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}/`;
const createProfile=async()=>{await fs.mkdir(profile);await fs.writeFile(path.join(profile,'settings.json'),JSON.stringify({onboardingVersion:1,usagePing:false,searchSuggestions:false}));};
const start=async(extra=[])=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  app=await launchPackagedOverCdp({executablePath:executable,launchViaOpen:true,args:[`--user-data-dir=${profile}`,...extra],env,timeoutMs:30000});
  await wait('normal browser startup',()=>browserStartupReady(app));
  const chrome=app.pages().find(page=>page.url()==='blanc-chrome://index/');
  await chrome.evaluate(()=>window.browserAPI.openPage('settings'));
  settings=await wait('settings',()=>app.pages().find(page=>page.url().startsWith('blanc://settings/')));
  await settings.waitForFunction(()=>!!window.bowserPages?.settings?.drmStatus);
};
const close=async()=>{if(app){await app.close();app=null;}};
const status=()=>settings.evaluate(()=>window.bowserPages.settings.drmStatus());
const ready=version=>wait('ready '+version,async()=>{
  const value=await status();report.lastStatus=value;assert.equal(value.enabled,true);
  assert(!['installation-failed','updates-disabled','unsupported','timed-out'].includes(value.state),JSON.stringify(value));
  return value.state==='ready'&&value.version===version&&value;
});
const binary=version=>path.join(profile,'WidevineCdm',version,binaryRelative(platform));
const play=async(stage,fixture)=>{
  playback=null;
  const chrome=app.pages().find(page=>page.url()==='blanc-chrome://index/');
  await chrome.evaluate(url=>window.browserAPI.createTab(url),origin);
  const page=await wait('protected page',()=>app.pages().find(page=>page.url()===origin));
  await page.waitForFunction(()=>!!window.shaka);await page.locator('#play').click();
  const result=await wait('unmuted protected playback',()=>playback);stage.playback=result;
  assert.equal(result.failure,undefined);assert.equal(result.status,2);assert.equal(result.mediaKeys,true);
  assert.equal(result.muted,false);assert.equal(result.paused,false);assert.equal(result.error,null);
  assert(result.encryptedEvents>0);assert.deepEqual(result.mediaErrors,[]);assert(result.second-result.first>2);
  const cdp=await app.browser.newBrowserCDPSession();
  const main=(await cdp.send('SystemInfo.getProcessInfo')).processInfo.find(row=>row.type==='browser').id;
  await cdp.detach();
  stage.sandbox=await inspectCdmProcess(main,application);
  const library=binary(fixture.version);
  const mapped=execFileSync('/usr/sbin/lsof',['-Fn','-p',String(stage.sandbox.pid)],{encoding:'utf8',timeout:15000});
  assert(mapped.split('\n').includes('n'+await fs.realpath(library)),'exact expected CDM library must be mapped');
  stage.mappedSha256=digest(await fs.readFile(library));assert.equal(stage.mappedSha256,fixture.sha256);
  execFileSync('/usr/bin/codesign',['--verify','--strict',library],{timeout:30000});stage.signatureValid=true;
  await page.close();await persist();
};
try{
  const fixtureRoot=path.join(root,'fixtures');await fs.mkdir(fixtureRoot);
  const fixtures=await prepareCdmFixtures(fixtureRoot,platform);
  report.fixtures=Object.fromEntries(Object.entries(fixtures).map(([key,value])=>[key,{version:value.version,sha256:value.sha256,archiveSha512:value.archiveSha512}]));
  await createProfile();const first=await checkpoint('first-install');const at=Date.now();
  await start(['--component-updater=initial-delay=100000']);first.browserReadyMs=Date.now()-at;assert(first.browserReadyMs<15000);
  first.status=await ready(fixtures.current.version);await play(first,fixtures.current);await close();
  profile=path.join(root,'legacy-profile');await createProfile();await stageCdm(profile,fixtures.previous);
  const older=await checkpoint('older-baseline');await start(['--component-updater=initial-delay=100000']);
  older.status=await ready(fixtures.previous.version);await play(older,fixtures.previous);await close();
  const update=await checkpoint('vendor-update');await assertCdmVersionAbsent(profile,fixtures.current.version);
  await start(['--component-updater=initial-delay=1']);
  update.status=await wait('genuine vendor update',async()=>{const value=await status();return value.version===fixtures.current.version&&value;},120000);
  assert.equal(digest(await fs.readFile(binary(fixtures.current.version))),fixtures.current.sha256);
  await close();await start(['--component-updater=initial-delay=100000']);update.afterRelaunch=await ready(fixtures.current.version);
  await play(update,fixtures.current);await close();
  const rollback=await checkpoint('cache-rollback');rollback.automaticVendorRollback=false;
  await stageCdm(profile,fixtures.previous);await start(['--component-updater=initial-delay=100000']);
  rollback.status=await ready(fixtures.previous.version);await play(rollback,fixtures.previous);await close();
  await start(['--host-resolver-rules=MAP * ~NOTFOUND']);report.offlineStatus=await ready(fixtures.previous.version);await close();
  report.passed=true;
}catch(error){report.failure=String(error.message).slice(0,800);throw error;}
finally{
  await finishFixture(report,[
    ['owned-browser',close],
    ['loopback-server',async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}],
    ['owned-profiles',async()=>{await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200});report.profilesRemoved=!(await fs.stat(root).catch(()=>null));}],
  ],persist);
}
assert.equal(report.profilesRemoved,true);assert.deepEqual(report.cleanupErrors,[]);console.log(JSON.stringify(report));
