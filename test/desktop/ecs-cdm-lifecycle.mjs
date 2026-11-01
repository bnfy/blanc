// Native Linux only, real CDM bytes, normal packaged entrypoint and user restart.
// No main inspector, test IPC, signature bypass, or production profile/feed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';
const require = createRequire(import.meta.url);
const { prepareCdmFixtures, stageCdm, digest, assertCdmVersionAbsent } = require('./support/cdm-lifecycle.cjs');
const { inspectLinuxCdm } = require('./ecs-linux-sandbox.cjs');
const { protectedPage } = require('./support/ecs-protected-page.cjs');
const { browserStartupReady } = require('./support/ecs-startup.cjs');
assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
assert.equal(process.env.BLANC_UPDATE_CHANNEL, 'ecs-qualification-disabled');
assert(path.isAbsolute(process.env.BLANC_PACKAGED_EXECUTABLE || ''));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecs-real-cdm-'));
let profile = path.join(root, 'profile');
const createProfile=async()=>{
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({onboardingVersion:1,usagePing:false,searchSuggestions:false}));
};
await createProfile();
const token = crypto.randomBytes(16).toString('hex');
const report = { passed:false, scope:'real first-install/restart, vendor update and test-only real-binary cache rollback', stages:[] };
const checkpoint=async name=>{
  const stage={name};report.stages.push(stage);
  await fs.mkdir('output/ecs-production',{recursive:true});
  await fs.writeFile('output/ecs-production/cdm-lifecycle-linux.json',JSON.stringify(report,null,2));
  console.log(`CDM lifecycle: ${name}`);
  return stage;
};
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const wait = async (name, read, timeout=60000) => {
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=await read();if(value)return value;await sleep(200);}
  throw Error(`Timed out: ${name}`);
};
let playback;
const server = http.createServer(async (req,res) => {
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
const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
let app, browser, context, settings;
const launches=[];
const pages=()=>context.pages();
const alive=async pid=>{
  const state=await fs.readFile(`/proc/${pid}/status`,'utf8').catch(()=>null);
  return state!==null&&!/^State:\s+Z/m.test(state);
};
const processId=async()=>{
  const session=await browser.newBrowserCDPSession();
  try{return (await session.send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='browser').id;}
  finally{await session.detach();}
};
const openSettings=async()=>{
  const chrome=await wait('chrome',()=>pages().find(p=>p.url()==='blanc-chrome://index/'));
  await chrome.waitForFunction(()=>!!window.browserAPI);
  await wait('restored browser',()=>browserStartupReady({pages}));
  await chrome.evaluate(()=>window.browserAPI.openPage('settings'));
  settings=await wait('settings',()=>pages().find(p=>p.url().startsWith('blanc://settings/')));
  await settings.waitForFunction(()=>!!window.bowserPages?.settings?.drmStatus);
};
const status=()=>settings.evaluate(()=>window.bowserPages.settings.drmStatus());
const start=async(extra=[])=>{
  app=await launchPackagedOverCdp({executablePath:process.env.BLANC_PACKAGED_EXECUTABLE,
    args:[`--user-data-dir=${profile}`,...extra],debugPort:port,timeoutMs:30000,
    env:{...process.env,ELECTRON_RUN_AS_NODE:'',APPIMAGE_EXTRACT_AND_RUN:'1'}});
  launches.push(app);
  browser=app.browser;context=app.context;await openSettings();
};
const close=async()=>{
  if(!browser)return;
  const pid=await processId();
  const session=await browser.newBrowserCDPSession();
  await Promise.race([session.send('Browser.close').catch(()=>{}),sleep(1000)]);
  await session.detach().catch(()=>{});
  await Promise.race([browser.close().catch(()=>{}),sleep(1000)]);browser=null;
  await wait('owned browser exit',async()=>!await alive(pid),15000);
  if(app){await app.close();app=null;}
};
const restart=async(stage)=>{
  stage.beforeRestart=await status();assert.equal(stage.beforeRestart.state,'restart-required');
  const oldPid=await processId();
  await settings.locator('[data-group="help"]').click();
  await settings.locator('#drmRestart').scrollIntoViewIfNeeded();
  assert.equal(await settings.locator('#drmRestart').isVisible(),true);
  stage.visibleStatus=await settings.locator('#drmStatus').innerText();
  assert(stage.visibleStatus.includes('Restart Blanc'));
  await fs.mkdir('output/playwright',{recursive:true});
  await settings.screenshot({path:`output/playwright/cdm-${stage.name}.png`});
  await settings.locator('#drmRestart').click();
  await wait('old process exit',async()=>!await alive(oldPid),15000);
  await browser.close().catch(()=>{});browser=null;app=null;
  browser=await wait('automatic relaunch CDP',async()=>{
    try{return await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:1500});}catch{return false;}
  },30000);
  context=browser.contexts()[0];await openSettings();
  stage.automaticRestart=true;stage.newPid=await processId();assert.notEqual(stage.newPid,oldPid);
  stage.afterRestart=await wait('cached ready after restart',async()=>{const s=await status();return s.state==='ready'&&s;});
};
const play=async(stage,expectedBinary)=>{
  playback=null;
  const chrome=pages().find(p=>p.url()==='blanc-chrome://index/');
  await chrome.evaluate(url=>window.browserAPI.createTab(url),origin);
  const page=await wait('protected test page',()=>pages().find(p=>p.url()===origin));
  await page.waitForFunction(()=>!!window.shaka);
  await page.locator('#play').click();
  const result=await wait('unmuted protected playback',()=>playback);
  stage.playback=result;
  assert.equal(result.failure,undefined);assert.equal(result.error,null);
  assert.equal(result.mediaKeys,true);assert.equal(result.muted,false);assert.equal(result.paused,false);
  assert(result.encryptedEvents>0);assert.deepEqual(result.mediaErrors,[]);
  assert(result.second-result.first>2);assert.notEqual(result.status,1);assert.notEqual(result.status,null);
  stage.sandbox=await inspectLinuxCdm(await processId(),expectedBinary);
  stage.selectedBinarySha256=digest(await fs.readFile(expectedBinary));
  assert.equal(stage.sandbox.binarySha256,stage.selectedBinarySha256);
  await page.close();
};
try{
  const fixtureRoot=path.join(root,'fixtures');await fs.mkdir(fixtureRoot);
  const fixtures=await prepareCdmFixtures(fixtureRoot);
  report.fixtures=Object.fromEntries(Object.entries(fixtures).map(([name,f])=>[name,{version:f.version,sha256:f.sha256,archiveSha512:f.archiveSha512}]));
  const first=await checkpoint('first-install');
  const started=Date.now();await start(['--component-updater=initial-delay=100000']);
  first.browserReadyMs=Date.now()-started;assert(first.browserReadyMs<15000);
  first.installed=await wait('first install restart state',async()=>{const s=await status();assert.notEqual(s.state,'ready','fresh Linux process cannot preload a newly downloaded CDM');return s.state==='restart-required'&&s;},90000);
  assert.equal(first.installed.version,fixtures.current.version);
  let currentBinary=path.join(profile,'WidevineCdm',fixtures.current.version,'_platform_specific/linux_x64/libwidevinecdm.so');
  assert.equal(digest(await fs.readFile(currentBinary)),fixtures.current.sha256,'vendor-installed bytes match independently pinned package');
  await restart(first);await play(first,currentBinary);await close();
  // A separate legacy profile has never cached the current binary. The
  // update gate cannot pass by simply reactivating our first-install cache.
  profile=path.join(root,'legacy-profile');await createProfile();
  currentBinary=path.join(profile,'WidevineCdm',fixtures.current.version,'_platform_specific/linux_x64/libwidevinecdm.so');
  const baseline=await checkpoint('older-baseline');
  const previousBinary=await stageCdm(profile,fixtures.previous);
  await start(['--component-updater=initial-delay=100000']);
  baseline.status=await wait('older cache registered',async()=>{const s=await status();return s.state==='ready'&&s;});
  assert.equal(baseline.status.version,fixtures.previous.version);
  await play(baseline,previousBinary);await close();
  // Only the schedule changes. Real vendor URLs, CRX verification and the
  // sandbox stay enabled; no fabricated component-update response is used.
  const update=await checkpoint('vendor-update');
  await assertCdmVersionAbsent(profile, fixtures.current.version);
  await start(['--component-updater=initial-delay=1']);
  update.downloaded=await wait('vendor update requiring restart',async()=>{const s=await status();return s.state==='restart-required'&&s.version===fixtures.current.version&&s;},120000);
  assert.equal(digest(await fs.readFile(currentBinary)),fixtures.current.sha256);
  await restart(update);await play(update,currentBinary);await close();
  const rollback=await checkpoint('cache-rollback');rollback.automaticVendorRollback=false;
  await stageCdm(profile,fixtures.previous);await start(['--component-updater=initial-delay=100000']);
  rollback.status=await wait('rollback cache registered',async()=>{const s=await status();return s.state==='ready'&&s;});
  assert.equal(rollback.status.version,fixtures.previous.version);
  await play(rollback,previousBinary);await close();
  await start(['--host-resolver-rules=MAP * ~NOTFOUND']);
  report.offlineStatus=await wait('rollback cached offline readiness',async()=>{const s=await status();return s.state==='ready'&&s;});
  assert.equal(report.offlineStatus.version,fixtures.previous.version);await close();
  report.passed=true;
}catch(error){report.failure=error.message;report.sandboxFailure=error.sandboxEvidence;throw error;}
finally{
  try{await close();}finally{
    // AppImage restart successors can inherit the original wrapper's pipes.
    // Once the owned browsers have exited, those diagnostic streams must not
    // keep the harness alive through an unrelated crash-handler lifetime.
    for(const launch of launches){launch.process.stdout?.destroy();launch.process.stderr?.destroy();}
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    report.profileRemoved=!(await fs.stat(root).catch(()=>null));
    await fs.mkdir('output/ecs-production',{recursive:true});
    await fs.writeFile('output/ecs-production/cdm-lifecycle-linux.json',JSON.stringify(report,null,2));
  }
}
console.log(JSON.stringify(report));
