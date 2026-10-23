// Real Windows CDM install/update/cache rollback in an owned temporary profile.
// No fabricated component response, main inspector, or sandbox bypass.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {launchPackagedOverCdp} from './support/packaged-cdp.mjs';
const require=createRequire(import.meta.url);
const {prepareCdmFixtures,stageCdm,digest,assertCdmVersionAbsent,binaryRelative}=require('./support/cdm-lifecycle.cjs');
const {inspectWindowsCdm}=require('./support/windows-cdm.cjs');
const {protectedPage}=require('./support/ecs-protected-page.cjs');
const {browserStartupReady}=require('./support/ecs-startup.cjs');
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.RUNNER_ARCH,'X64');
assert.equal(process.env.BLANC_UPDATE_CHANNEL,'ecs-qualification-disabled');
assert(path.isAbsolute(process.env.BLANC_PACKAGED_EXECUTABLE||''));
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ecs-windows-cdm-'));
let profile=path.join(root,'first-profile'),app,settings,playback;
const token=crypto.randomBytes(16).toString('hex');
const report={passed:false,scope:'real Windows first install, vendor update and controlled cache rollback',stages:[]};
const evidence='output/ecs-production/cdm-lifecycle-windows.json';
const persist=async()=>{await fs.mkdir(path.dirname(evidence),{recursive:true});await fs.writeFile(evidence,JSON.stringify(report,null,2));};
const checkpoint=async name=>{const s={name};report.stages.push(s);await persist();console.log('Windows CDM lifecycle: '+name);return s;};
const wait=async(name,read,timeout=90000)=>{const end=Date.now()+timeout;while(Date.now()<end){const v=await read();if(v)return v;await new Promise(r=>setTimeout(r,200));}throw Error('Timed out: '+name);};
const server=http.createServer(async(req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(protectedPage(token,{muted:false}));}
 if(req.method==='POST'&&req.headers['x-blanc-probe']===token&&['/result','/ready'].includes(req.url)){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return res.writeHead(413).end();}
  try{if(req.url==='/result')playback=JSON.parse(body);}catch{return res.writeHead(400).end();}return res.end('ok');
 }res.writeHead(404).end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}/`;
const createProfile=async()=>{await fs.mkdir(profile);await fs.writeFile(path.join(profile,'settings.json'),JSON.stringify({onboardingVersion:1,usagePing:false,searchSuggestions:false}));};
const start=async(extra=[])=>{
 app=await launchPackagedOverCdp({executablePath:process.env.BLANC_PACKAGED_EXECUTABLE,args:[`--user-data-dir=${profile}`,...extra],env:{...process.env,ELECTRON_RUN_AS_NODE:''},timeoutMs:30000});
 await wait('restored browser',()=>browserStartupReady(app));
 const chrome=await wait('chrome',()=>app.pages().find(p=>p.url()==='blanc-chrome://index/'));
 await chrome.evaluate(()=>window.browserAPI.openPage('settings'));
 settings=await wait('settings',()=>app.pages().find(p=>p.url().startsWith('blanc://settings/')));
 await settings.waitForFunction(()=>!!window.bowserPages?.settings?.drmStatus);
};
const close=async()=>{if(app){await app.close();app=null;}};
const status=()=>settings.evaluate(()=>window.bowserPages.settings.drmStatus());
const ready=async version=>wait('ready component '+version,async()=>{
 const state=await status();assert.equal(state.supported,true);
 assert(!['installation-failed','updates-disabled','unsupported','timed-out'].includes(state.state),JSON.stringify(state));
 return state.state==='ready'&&state.version===version&&state;
});
const binary=version=>path.join(profile,'WidevineCdm',version,binaryRelative('win32-x64'));
const play=async(stage,fixture)=>{
 playback=null;
 const chrome=app.pages().find(p=>p.url()==='blanc-chrome://index/');
 await chrome.evaluate(url=>window.browserAPI.createTab(url),origin);
 const page=await wait('protected page',()=>app.pages().find(p=>p.url()===origin));
 await page.waitForFunction(()=>!!window.shaka);await page.locator('#play').click();
 const result=await wait('unmuted protected playback',()=>playback);stage.playback=result;
 assert.equal(result.failure,undefined);assert.equal(result.status,2,'production VMP verified');
 assert.equal(result.mediaKeys,true);assert.equal(result.muted,false);assert.equal(result.paused,false);assert.equal(result.error,null);
 assert(result.encryptedEvents>0);assert.deepEqual(result.mediaErrors,[]);assert(result.second-result.first>2);
 const session=await app.browser.newBrowserCDPSession();
 const ids=(await session.send('SystemInfo.getProcessInfo')).processInfo.map(p=>p.id);await session.detach();
 stage.cdm=inspectWindowsCdm(ids,binary(fixture.version),fixture.sha256);
 await page.close();await persist();
};
try{
 const fixtureRoot=path.join(root,'fixtures');await fs.mkdir(fixtureRoot);
 const fixtures=await prepareCdmFixtures(fixtureRoot,'win32-x64');
 report.fixtures=Object.fromEntries(Object.entries(fixtures).map(([k,v])=>[k,{version:v.version,sha256:v.sha256,archiveSha512:v.archiveSha512}]));
 await createProfile();const first=await checkpoint('first-install');const at=Date.now();
 await start(['--component-updater=initial-delay=100000']);first.browserReadyMs=Date.now()-at;assert(first.browserReadyMs<15000);
 first.status=await ready(fixtures.current.version);
 assert.equal(digest(await fs.readFile(binary(fixtures.current.version))),fixtures.current.sha256);
 // Windows dynamically loads a newly installed CDM; unlike Linux it should
 // not require the native launcher restart. Prove actual first-process use.
 await play(first,fixtures.current);await close();
 profile=path.join(root,'legacy-profile');await createProfile();await stageCdm(profile,fixtures.previous);
 const old=await checkpoint('older-baseline');await start(['--component-updater=initial-delay=100000']);old.status=await ready(fixtures.previous.version);await play(old,fixtures.previous);await close();
 const update=await checkpoint('vendor-update');await assertCdmVersionAbsent(profile,fixtures.current.version);
 await start(['--component-updater=initial-delay=1']);
 update.status=await wait('genuine vendor update',async()=>{const s=await status();return s.version===fixtures.current.version&&s;},120000);
 assert.equal(digest(await fs.readFile(binary(fixtures.current.version))),fixtures.current.sha256);
 // Relaunch normally to unload any earlier DLL before attributing new bytes.
 await close();await start(['--component-updater=initial-delay=100000']);update.afterRelaunch=await ready(fixtures.current.version);await play(update,fixtures.current);await close();
 const rollback=await checkpoint('cache-rollback');rollback.automaticVendorRollback=false;
 await stageCdm(profile,fixtures.previous);await start(['--component-updater=initial-delay=100000']);rollback.status=await ready(fixtures.previous.version);await play(rollback,fixtures.previous);await close();
 await start(['--host-resolver-rules=MAP * ~NOTFOUND']);report.offlineStatus=await ready(fixtures.previous.version);await close();
 report.passed=true;
}catch(error){report.failure=String(error.message).slice(0,800);throw error;}
finally{try{await close();}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200});report.profileRemoved=!(await fs.stat(root).catch(()=>null));await persist();}}
assert.equal(report.profileRemoved,true);console.log(JSON.stringify(report));
