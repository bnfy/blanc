// Actual NSIS handoff from the public app, confined to a disposable Windows VM.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {protectedPage}=require('./support/ecs-protected-page.cjs');
const {extractFile}=require('@electron/asar');
const {runWindowsPowerShell}=require('./support/windows-powershell.cjs');
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.RUNNER_ARCH,'X64');
assert.equal(process.env.BLANC_ECS_DISPOSABLE_HOST,'1');
const [baselineInstaller,targetInstaller,targetRoot,targetVersion,evidence]=process.argv.slice(2);
for(const value of [baselineInstaller,targetInstaller,targetRoot,evidence])assert(path.isAbsolute(value));
assert(/^\d+\.\d+\.\d+-staging\.\d+$/.test(targetVersion));
const publisher=process.env.EXPECTED_WINDOWS_PUBLISHER;assert(publisher);
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ecs-windows-update-'));
assert(!/\s/.test(root),'NSIS /D fixture directory must not need quoting');
const install=path.join(root,'app'),executable=path.join(install,'Blanc.exe');
const profile=path.join(process.env.APPDATA,'Blanc');
assert.equal(await fs.stat(profile).catch(()=>null),null,'disposable runner must not have a production profile');
const marker=crypto.randomBytes(16).toString('hex');
await fs.mkdir(profile,{recursive:true});await fs.writeFile(path.join(profile,'ecs-handoff-owner'),marker);
await fs.writeFile(path.join(profile,'settings.json'),JSON.stringify({onboardingVersion:1,usagePing:false,searchSuggestions:false}));
const report={passed:false,nativeRestartNow:false,automaticRelaunch:false,feed:'owned-loopback-staging',requests:[]};
const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const expectedAsar=await hash(path.join(targetRoot,'resources/app.asar'));
const targetMetadata=JSON.parse(extractFile(path.join(targetRoot,'resources/app.asar'),'package.json'));
assert.equal(targetMetadata.version,targetVersion);assert.equal(targetMetadata.blancRuntime,'ecs');
const bytes=await fs.readFile(targetInstaller),sha512=crypto.createHash('sha512').update(bytes).digest('base64');
const ps=runWindowsPowerShell;
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const ui=(pid,action,url='')=>ps(`& ${quote(path.resolve('test/desktop/support/windows-owned-ui.ps1'))} -TargetProcessId ${pid} -Action ${action} -Url ${quote(url)}`);
const pids=()=>JSON.parse(ps(`ConvertTo-Json -InputObject @((Get-CimInstance Win32_Process -Filter "Name='Blanc.exe'" | Where-Object { $_.ExecutablePath -eq ${quote(executable)} -and $_.CommandLine -notmatch '--type=' }).ProcessId) -Compress`)).filter(Number.isInteger);
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const wait=async(name,read,timeout=120000)=>{const end=Date.now()+timeout;while(Date.now()<end){const v=await read();if(v)return v;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+name);};
const verify=file=>{
 const r=JSON.parse(ps(`$s=Get-AuthenticodeSignature ${quote(file)}; @{ status=[string]$s.Status; subject=$s.SignerCertificate.Subject; timestamp=($null -ne $s.TimeStamperCertificate) } | ConvertTo-Json -Compress`,120000));
 assert.equal(r.status,'Valid');assert.equal(r.subject,publisher);assert.equal(r.timestamp,true);return r;
};
let downloaded=false,ready=false,playback,oldPid,newPid;
const server=http.createServer(async(req,res)=>{
 const route=new URL(req.url,'http://127.0.0.1').pathname;
 if(route==='/staging.yml'){report.requests.push('metadata');return res.end(`version: ${targetVersion}\nfiles:\n  - url: update.exe\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: update.exe\nsha512: ${sha512}\n`);}
 if(route==='/update.exe'){report.requests.push('installer');res.on('finish',()=>{downloaded=true;});res.setHeader('Content-Length',bytes.length);return res.end(bytes);}
 if(route==='/'){report.probeRequests=(report.probeRequests||0)+1;res.setHeader('Content-Type','text/html');return res.end(protectedPage(marker,{muted:false}));}
 if(['/ready','/result'].includes(route)&&req.headers['x-blanc-probe']===marker){let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return res.writeHead(413).end();}const data=JSON.parse(body);if(route==='/ready'){ready=data.ready===true;report.probeReady=ready;}else playback=data;return res.end('ok');}
 res.writeHead(404).end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}/`;
try{
 report.baselineSignature=verify(baselineInstaller);report.targetSignature=verify(targetInstaller);
 report.targetInstallerSha256=await hash(targetInstaller);
 const installExit=ps(`$p=Start-Process -FilePath ${quote(baselineInstaller)} -ArgumentList ${quote('/S /D='+install)} -PassThru -Wait; $p.ExitCode`,180000);
 assert.equal(installExit,'0','baseline installer exit');verify(executable);
 const env={...process.env,BLANC_UPDATE_CHANNEL:'staging',BLANC_UPDATE_STAGING_URL:origin,BLANC_UPDATE_STAGING_ALLOW_HTTP:'1'};
 for(const key of ['ELECTRON_RUN_AS_NODE','BLANC_UPDATE_STAGING_AUTO_INSTALL','BLANC_UPDATE_STAGING_STATUS_FILE'])delete env[key];
 const child=spawn(executable,[],{env,stdio:'ignore'});oldPid=child.pid;
 await wait('download from owned staging feed',()=>downloaded);
 await wait('native Restart Now',()=>ui(oldPid,'restart')==='clicked');report.nativeRestartNow=true;
 await wait('old browser exit',()=>!alive(oldPid));
 await wait('exact installed target payload',async()=>{try{return await hash(path.join(install,'resources/app.asar'))===expectedAsar;}catch{return false;}});
 newPid=await wait('automatic successor',()=>pids().find(pid=>pid!==oldPid));report.automaticRelaunch=true;
 report.installedSignature=verify(executable);report.installedAsarSha256=await hash(path.join(install,'resources/app.asar'));
 await wait('automatic successor first CDM installation',async()=>{
  for(const version of await fs.readdir(path.join(profile,'WidevineCdm')).catch(()=>[])){
   if(!/^\d+(?:\.\d+){3}$/.test(version))continue;
   const component=path.join(profile,'WidevineCdm',version);
   if(await fs.readFile(path.join(component,'manifest.json'),'utf8').then(JSON.parse,()=>null)
    &&await fs.stat(path.join(component,'_platform_specific/win_x64/widevinecdm.dll')).catch(()=>null)){
    report.cdmVersion=version;return true;
   }
  }return false;
 });
 for(let attempt=1;attempt<=3;attempt++){
  await wait('foreground successor',()=>ui(newPid,'navigate',origin)==='done',30000);
  try{await wait('probe request',()=>report.probeRequests>0,15000);break;}catch(error){if(attempt===3)throw error;}
 }
 await wait('protected page ready',()=>{if(report.probeReady===false)throw Error('Protected player failed to initialize');return ready;});
 await wait('foreground playback',()=>ui(newPid,'play')==='done',30000);
 report.playback=await wait('successor protected playback',()=>playback);
 assert.equal(playback.failure,undefined);assert.equal(playback.status,2);assert.equal(playback.mediaKeys,true);
 assert.equal(playback.muted,false);assert.equal(playback.paused,false);assert.equal(playback.error,null);assert.deepEqual(playback.mediaErrors,[]);
 assert(playback.encryptedEvents>0);assert(playback.second-playback.first>2);report.passed=true;
}catch(error){
 report.failure=String(error.message).slice(0,600);
 try{const pid=pids()[0];if(pid)report.nativeUi=JSON.parse(ui(pid,'inspect'));}catch{}
 throw error;
}
finally{
 for(const pid of pids()){try{ui(pid,'close');await wait('owned app exit',()=>!alive(pid),10000);}catch{try{process.kill(pid,'SIGTERM');}catch{}}}
 server.closeAllConnections();await new Promise(r=>server.close(r));
 if(await fs.readFile(path.join(profile,'ecs-handoff-owner'),'utf8').catch(()=>null)===marker){await fs.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});report.profileRemoved=true;}
 await fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200});report.installationRemoved=true;
 await fs.mkdir(path.dirname(evidence),{recursive:true});await fs.writeFile(evidence,JSON.stringify(report,null,2));
}
assert.equal(report.profileRemoved,true);assert.equal(report.installationRemoved,true);console.log(JSON.stringify(report));
