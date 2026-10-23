// Real stable -> ECS -> ECS prompt handoffs, never a production installation.
// A real downloaded CDM is warmed first; first-ever CDM restart UX is a separate gate.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { launchPackagedOverCdp } from './support/packaged-cdp.mjs';
const require = createRequire(import.meta.url);
const { extractFile } = require('@electron/asar');
const { inspectLinuxCdm } = require('./ecs-linux-sandbox.cjs');
const { protectedPage } = require('./support/ecs-protected-page.cjs');
const { cleanRelaunchEnvironment } = require('../../src/main/drm-relaunch');
assert.equal(process.platform, 'linux');
assert.equal(process.env.BLANC_ECS_UPDATER_QUALIFICATION, '1');
const [oldImage, oldVersion, imageA, versionA, imageB, versionB, evidencePath] = process.argv.slice(2);
for (const file of [oldImage, imageA, imageB, evidencePath]) assert(path.isAbsolute(file));
for (const version of [oldVersion, versionA, versionB]) assert(/^\d+\.\d+\.\d+(?:-staging\.\d+)?$/.test(version));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecs-production-updater-'));
const profile = path.join(root, 'config/Blanc');
await fs.mkdir(profile, {recursive:true, mode:0o700});
await fs.writeFile(path.join(profile, 'settings.json'), JSON.stringify({onboardingVersion:1,usagePing:false,searchSuggestions:false}));
const token = crypto.randomBytes(16).toString('hex');
const report = {passed:false, from:oldVersion, publicFeed:false, preinstalledCdm:true,
  limitation:'CDM is warmed by a real ECS launch before migration; first-ever CDM restart UX is not qualified here.', requests:[], handoffs:[]};
const assets = await Promise.all([[imageA,versionA],[imageB,versionB]].map(async ([file,version]) => {
  const bytes = await fs.readFile(file);
  return {file,version,name:path.basename(file),size:bytes.length,sha512:crypto.createHash('sha512').update(bytes).digest('base64'),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}));
let offer = assets[0], hold = false, ready = false, playback = null;
const held = [];
const metadata = response => response.end(`version: ${offer.version}\nfiles:\n  - url: ${offer.name}\n    sha512: ${offer.sha512}\n    size: ${offer.size}\npath: ${offer.name}\nsha512: ${offer.sha512}\n`);
const server = http.createServer(async (request,response) => {
  const url = new URL(request.url,'http://127.0.0.1');
  if (url.pathname === '/favicon.ico') return response.writeHead(204).end();
  if (url.pathname === '/') { report.probeRequests=(report.probeRequests||0)+1; response.setHeader('Content-Type','text/html'); return response.end(protectedPage(token)); }
  if (['/ready','/result'].includes(url.pathname) && request.method === 'POST' && request.headers['x-blanc-probe']===token) {
    let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 4096) return response.writeHead(413).end(); }
    try { const data = JSON.parse(body); if (url.pathname.endsWith('/ready')) ready = data.ready === true; else playback = data; }
    catch { return response.writeHead(400).end(); }
    return response.end('ok');
  }
  const asset = assets.find(item => url.pathname === `/${item.name}`);
  const entry = {path:url.pathname === '/staging-linux.yml' || asset ? url.pathname : 'unexpected'};
  report.requests.push(entry);
  response.on('finish',()=>{entry.complete=true;});
  if (url.pathname === '/staging-linux.yml') { if (hold) held.push(response); else metadata(response); return; }
  if (!asset) return response.writeHead(404).end();
  response.setHeader('Content-Length',asset.size); syncFs.createReadStream(asset.file).pipe(response);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const wait = async (name, fn, timeout=90000) => {
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,200));}
  throw Error(`Timed out: ${name}`);
};
const hash = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const alive = async pid => { try {const status=await fs.readFile(`/proc/${pid}/status`,'utf8');return !/^State:\s+Z/m.test(status);}catch{return false;} };
const mainProcess = async version => {
  for(const pid of await fs.readdir('/proc')) {
    if(!/^\d+$/.test(pid))continue;
    try {
      const command=await fs.readFile(`/proc/${pid}/cmdline`,'utf8');
      if(!command.includes(`--user-data-dir=${profile}`) || command.includes('--type='))continue;
      const executable=await fs.readlink(`/proc/${pid}/exe`);
      const asar=path.join(path.dirname(executable),'resources/app.asar');
      const meta=JSON.parse(extractFile(asar,'package.json'));
      if(meta.version===version && meta.blancRuntime==='ecs')return {pid:Number(pid),executable};
    }catch{}
  }
  return null;
};
const x = args => execFileSync('xdotool',args,{stdio:['ignore','pipe','pipe'],encoding:'utf8'}).trim();
async function processState(pid) {
  const base=`/proc/${pid}`;
  const status=await fs.readFile(`${base}/status`,'utf8');
  const rawEnvironment=(await fs.readFile(`${base}/environ`,'utf8')).split('\0');
  const environment=Object.fromEntries(rawEnvironment.flatMap(entry=>{
    const at=entry.indexOf('=');const key=entry.slice(0,at);
    return ['DISPLAY','XAUTHORITY','APPDIR','APPIMAGE','LD_LIBRARY_PATH','CHROME_DEVEL_SANDBOX','CHROME_DESKTOP','APPIMAGE_SILENT_INSTALL','APPIMAGE_EXIT_AFTER_INSTALL'].includes(key)?[[key,entry.slice(at+1)]]:[];
  }));
  return {
    status:status.split('\n').filter(line=>/^(Name|State|PPid|Threads|SigBlk|SigIgn|SigCgt|NoNewPrivs|Seccomp):/.test(line)),environment,
    inheritedRuntimeKeys:rawEnvironment.map(entry=>entry.slice(0,entry.indexOf('='))).filter(key=>/^(?:LD_|ELECTRON_|CHROME_|BLANC_ECS_)/.test(key)),
  };
}
function prompt() {
  let ids;try{ids=x(['search','--onlyvisible','--name','.*']).split(/\s+/);}catch{return null;}
  for(const id of ids){try{const g=x(['getwindowgeometry','--shell',id]);const width=Number(g.match(/^WIDTH=(\d+)/m)?.[1]),height=Number(g.match(/^HEIGHT=(\d+)/m)?.[1]);if(width>=200&&width<=1000&&height>=50&&height<=400)return id;}catch{}}
  return null;
}
function browserWindow() {
  let ids;try{ids=x(['search','--onlyvisible','--name','.*']).split(/\s+/);}catch{return null;}
  for(const id of ids){try{
    // Xvfb's root also matches .* and is large; it has no Blanc WM_CLASS.
    const wmClass=execFileSync('xprop',['-id',id,'WM_CLASS'],{encoding:'utf8'});
    if(!/"blanc"/i.test(wmClass))continue;
    const g=x(['getwindowgeometry','--shell',id]);const width=Number(g.match(/^WIDTH=(\d+)/m)?.[1]),height=Number(g.match(/^HEIGHT=(\d+)/m)?.[1]);
    if(width>=800&&height>=500)return {id,width,height,blancClass:true};
  }catch{}}
  return null;
}
const nativeLog=path.join(root,'native-startup.log');
const env={...process.env,XDG_CONFIG_HOME:path.join(root,'config'),XDG_CACHE_HOME:path.join(root,'cache'),XDG_DATA_HOME:path.join(root,'data'),APPIMAGE_EXTRACT_AND_RUN:'1',BLANC_UPDATE_CHANNEL:'ecs-qualification-disabled',ELECTRON_ENABLE_LOGGING:'1',ELECTRON_LOG_FILE:nativeLog};
for(const key of ['ELECTRON_RUN_AS_NODE','LD_PRELOAD','BLANC_ECS_FULL_PROFILE','BLANC_ECS_CDM_PRELOAD_PATH','BLANC_ECS_LAUNCHER_ROOT','BLANC_UPDATE_STAGING_AUTO_INSTALL','BLANC_UPDATE_STAGING_STATUS_FILE'])delete env[key];
let warm, previous, baseline, inheritedHandoffEnv, output='';
const hiddenTrees=[];
const install=path.join(root,'blanc');
try {
  warm=await launchPackagedOverCdp({executablePath:imageA,env,timeoutMs:30000});
  report.cdmVersion=await wait('real Widevine installation',async()=>{
    for(const version of await fs.readdir(path.join(profile,'WidevineCdm')).catch(()=>[]))if(/^\d+(?:\.\d+){3}$/.test(version)&&await fs.stat(path.join(profile,'WidevineCdm',version,'manifest.json')).catch(()=>null))return version;
    return null;
  });
  await warm.close();warm=null;
  for(const asset of assets){
    const loose=path.join(path.dirname(asset.file),'linux-unpacked'),hidden=loose+'.unavailable';
    await fs.rename(loose,hidden);hiddenTrees.push({loose,hidden});
  }
  report.looseInstallationsUnavailable=true;
  await fs.copyFile(oldImage,install);await fs.chmod(install,0o755);
  baseline=spawn(install,[],{env:{...env,BLANC_UPDATE_CHANNEL:'staging',BLANC_UPDATE_STAGING_ALLOW_HTTP:'1',BLANC_UPDATE_STAGING_URL:origin+'/'},stdio:['ignore','pipe','pipe']});
  baseline.stdout.on('data',b=>{output=(output+b).slice(-6000);});baseline.stderr.on('data',b=>{output=(output+b).slice(-6000);});
  for(let index=0;index<assets.length;index++){
    const next=assets[index];offer=next;
    const handoff={from:index?assets[index-1].version:oldVersion,to:next.version,passed:false};report.handoffs.push(handoff);
    await wait('real staged download',()=>report.requests.some(r=>r.path===`/${next.name}`&&r.complete));
    handoff.downloaded=true;
    const dialog=await wait('Restart Now prompt',prompt);hold=true;
    const oldPid=previous?.pid;
    x(['windowfocus',dialog]);x(['key','--clearmodifiers','Return']);
    handoff.restartNowAccepted=true;
    if(oldPid)await wait('previous ECS process exit',async()=>!(await alive(oldPid)));
    else await wait('public baseline exit',()=>baseline.exitCode===0);
    await wait('exact renamed image replacement',async()=>await hash(install).catch(()=>null)===next.sha256);
    handoff.sha256=next.sha256;handoff.renamedFilePreserved=true;
    assert.equal(await fs.stat(path.join(root,next.name)).catch(()=>null),null);
    const successor=await wait('automatic ECS successor',()=>mainProcess(next.version));previous=successor;
    handoff.automaticSuccessorPid=successor.pid;
    handoff.initialNativeState=await processState(successor.pid).catch(()=>({unavailable:true}));
    const parentPid=Number(handoff.initialNativeState.status?.find(line=>line.startsWith('PPid:'))?.split(':')[1]);
    if(parentPid){
      handoff.parentNativeState=await processState(parentPid).catch(()=>({unavailable:true}));
      // Keep the exact inherited values in memory only; never serialize a
      // complete runner environment into logs or artifacts.
      inheritedHandoffEnv=Object.fromEntries((await fs.readFile(`/proc/${parentPid}/environ`,'utf8')).split('\0').filter(entry=>entry.includes('=')).map(entry=>{
        const at=entry.indexOf('=');return [entry.slice(0,at),entry.slice(at+1)];
      }));
    }
    ready=false;playback=null;
    // The display belongs solely to this rehearsal. X11 may attribute a
    // Chromium window to its GPU process rather than the verified browser PID.
    const window=await wait('successor window',async()=>{
      assert(await alive(successor.pid),'ECS successor exited before opening its window');
      return browserWindow();
    });handoff.window=window;
    x(['windowfocus',window.id]);x(['key','--clearmodifiers','ctrl+l']);
    x(['type','--clearmodifiers',`${origin}/`]);x(['key','Return']);
    await wait('protected-page readiness',()=>ready);x(['key','Return']);
    const result=await wait('protected-page result',()=>playback);
    assert.equal(result.failure,undefined);assert.equal(result.error,null);assert.equal(result.paused,false);
    assert.equal(result.mediaKeys,true);assert(result.encryptedEvents>0);assert.deepEqual(result.mediaErrors,[]);
    assert(result.second-result.first>2&&result.second-result.first<8);assert.notEqual(result.status,1);assert.notEqual(result.status,null);
    const cdm=await inspectLinuxCdm(successor.pid);
    Object.assign(handoff,{protectedPlayback:result,cdm,passed:true});
    if(assets[index+1])offer=assets[index+1];hold=false;for(const response of held.splice(0))metadata(response);
  }
  assert.equal(report.handoffs.length,2);assert(report.handoffs.every(h=>h.passed));assert(report.requests.every(r=>r.path!=='unexpected'));report.passed=true;
}catch(error){
  report.failure=error.message;report.logs=output;
  report.nativeLog=(await fs.readFile(nativeLog,'utf8').catch(()=>'' )).slice(-12000);
  report.updaterLog=(await fs.readFile(path.join(profile,'logs/updater.log'),'utf8').catch(()=>'' )).slice(-6000);
  // An existing PID does not prove that Electron reached app-ready. Keep
  // bounded native state when no X11 window appears, without dumping the
  // runner's environment (which can contain credentials).
  if(previous){
    report.successorAlive=await alive(previous.pid);
    try{
      const base=`/proc/${previous.pid}`;
      const status=await fs.readFile(`${base}/status`,'utf8');
      const environment=Object.fromEntries((await fs.readFile(`${base}/environ`,'utf8')).split('\0').flatMap(entry=>{
        const at=entry.indexOf('=');const key=entry.slice(0,at);
        return ['DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS','APPDIR','APPIMAGE','LD_LIBRARY_PATH','APPIMAGE_SILENT_INSTALL','APPIMAGE_EXIT_AFTER_INSTALL'].includes(key)?[[key,entry.slice(at+1)]]:[];
      }));
      report.successorNativeState={
        status:status.split('\n').filter(line=>/^(Name|State|PPid|Threads|SigIgn|SigCgt|NoNewPrivs|Seccomp):/.test(line)),
        waitChannel:(await fs.readFile(`${base}/wchan`,'utf8')).trim(),environment,
        threads:await Promise.all((await fs.readdir(`${base}/task`)).slice(0,40).map(async tid=>({tid,
          name:(await fs.readFile(`${base}/task/${tid}/comm`,'utf8').catch(()=>'' )).trim(),
          wait:(await fs.readFile(`${base}/task/${tid}/wchan`,'utf8').catch(()=>'' )).trim(),
        }))),
      };
    }catch{report.successorNativeStateUnavailable=true;}
  }
  try{report.windowTree=execFileSync('xwininfo',['-root','-tree'],{encoding:'utf8'}).slice(-10000);}catch{}
  try{
    report.visibleWindows=x(['search','--onlyvisible','--name','.*']).split(/\s+/).map(id=>{
      try{return {id,name:x(['getwindowname',id]),geometry:x(['getwindowgeometry','--shell',id]),wmClass:execFileSync('xprop',['-id',id,'WM_CLASS'],{encoding:'utf8'}).trim()};}catch{return {id};}
    });
  }catch{}
  // Diagnostic only: a later explicit launch never qualifies an automatic
  // handoff. Compare the same installed bytes/profile after the successor dies.
  if(previous && !(await alive(previous.pid))){
    try{
      if(inheritedHandoffEnv){
        report.environmentComparisons=[];
        const cleaned=cleanRelaunchEnvironment(inheritedHandoffEnv);
        const groups=[['inherited',inheritedHandoffEnv],['cleaned',cleaned],['original',env]];
        for(const [name,select] of [
          ['without-ld',key=>key.startsWith('LD_')],
          ['without-electron',key=>key.startsWith('ELECTRON_')],
          ['without-chrome',key=>key.startsWith('CHROME_')],
          ['without-paths',key=>['PATH','XDG_DATA_DIRS','APPDIR','ARGV0','OWD','GSETTINGS_SCHEMA_DIR'].includes(key)],
        ]){
          const scoped={...inheritedHandoffEnv};
          for(const key of Object.keys(scoped))if(select(key)){if(Object.hasOwn(cleaned,key))scoped[key]=cleaned[key];else delete scoped[key];}
          groups.push([name,scoped]);
        }
        for(const [name,diagnosticEnv] of groups){
          const attempt={name,window:false};report.environmentComparisons.push(attempt);
          const child=spawn(install,[],{env:diagnosticEnv,detached:true,stdio:'ignore'});
          try{
            previous=await wait('comparison process',()=>mainProcess(assets[report.handoffs.length-1].version),10000);
            const window=await wait('comparison window',async()=>{assert(await alive(previous.pid),'comparison exited');return browserWindow();},10000);
            attempt.window=true;x(['windowfocus',window.id]);x(['key','ctrl+q']);
            await wait('comparison quit',async()=>!(await alive(previous.pid)),10000);
          }catch(comparisonError){
            attempt.failure=comparisonError.message.slice(0,200);
            if(previous&&await alive(previous.pid)){process.kill(previous.pid,'SIGTERM');await wait('comparison cleanup',async()=>!(await alive(previous.pid)),10000);}
          }
          if(child.exitCode===null)child.kill('SIGTERM');
        }
      }
      const direct=spawn(install,[],{env,detached:true,stdio:['ignore','pipe','pipe']});
      let logs='';direct.stdout.on('data',b=>{logs=(logs+b).slice(-3000);});direct.stderr.on('data',b=>{logs=(logs+b).slice(-3000);});
      try{
        const next=assets[report.handoffs.length-1];
        const process=await wait('diagnostic direct process',()=>mainProcess(next.version),15000);
        previous=process;
        const window=await wait('diagnostic direct window',async()=>{assert(await alive(process.pid),'Direct successor exited');return browserWindow();},15000);
        report.directNoCdpDiagnostic={window,passed:true};
        x(['windowfocus',window.id]);x(['key','ctrl+q']);
        await wait('diagnostic direct exit',async()=>!(await alive(process.pid)),10000);
      }catch(diagnosticError){
        report.directNoCdpDiagnostic={failure:diagnosticError.message.slice(0,200),logs};
        if(previous&&await alive(previous.pid))process.kill(previous.pid,'SIGTERM');
      }finally{direct.stdout.destroy();direct.stderr.destroy();}
      warm=await launchPackagedOverCdp({executablePath:install,env,timeoutMs:30000});
      report.directRelaunchDiagnostic={cdpReady:true};
      await wait('diagnostic browser page',()=>warm.pages().some(page=>page.url().startsWith('blanc://newtab')),30000);
      report.directRelaunchDiagnostic.browserPage=true;
    }catch(diagnosticError){report.directRelaunchDiagnostic={failure:diagnosticError.message.slice(0,400)};}
  }
  throw error;
}
finally{
  try{if(warm)await warm.close();}catch{}
  previous ||= await mainProcess(versionA) || await mainProcess(versionB);
  if(previous&&await alive(previous.pid)){
    try{x(['windowfocus',browserWindow().id]);x(['key','ctrl+q']);await wait('final normal quit',async()=>!(await alive(previous.pid)),10000);}
    catch{process.kill(previous.pid,'SIGTERM');await wait('owned successor cleanup',async()=>!(await alive(previous.pid)),10000);}
  }
  if(baseline?.exitCode===null)baseline.kill('SIGTERM');
  baseline?.stdout.destroy();baseline?.stderr.destroy();
  for(const tree of hiddenTrees)await fs.rename(tree.hidden,tree.loose);
  for(const response of held)response.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});report.profileRemoved=!syncFs.existsSync(root);
  await fs.mkdir(path.dirname(evidencePath),{recursive:true});await fs.writeFile(evidencePath,JSON.stringify(report,null,2));
}
