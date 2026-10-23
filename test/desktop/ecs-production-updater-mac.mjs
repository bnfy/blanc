// Native Squirrel handoff in a disposable GitHub Intel account only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {protectedPage}=require('./support/ecs-protected-page.cjs');
assert.equal(process.platform,'darwin');assert.equal(process.arch,'x64');
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.BLANC_ECS_DISPOSABLE_HOST,'1');
const [sourceApp,archive,targetVersion,targetAsarHash,evidence]=process.argv.slice(2);
for(const file of [sourceApp,archive,evidence])assert(path.isAbsolute(file));
assert.match(targetVersion,/^\d+\.\d+\.\d+-staging\.\d+$/);assert.match(targetAsarHash,/^[a-f0-9]{64}$/);
// macOS reports executable paths through /private/var even when tmpdir is
// /var. Use one canonical path for launching and identifying the successor.
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'ecs-mac-update-')));
const app=path.join(root,'Blanc.app'),executable=path.join(app,'Contents/MacOS/Blanc');
const profile=path.join(os.homedir(),'Library/Application Support/Blanc');
assert.equal(await fs.stat(profile).catch(()=>null),null,'disposable runner must not have a Blanc profile');
const marker=crypto.randomBytes(16).toString('hex');
await fs.mkdir(profile,{recursive:true,mode:0o700});
await fs.writeFile(path.join(profile,'ecs-handoff-owner'),marker);
await fs.writeFile(path.join(profile,'settings.json'),JSON.stringify({onboardingVersion:1,usagePing:false,searchSuggestions:false}));
const bytes=await fs.readFile(archive),sha512=crypto.createHash('sha512').update(bytes).digest('base64');
const report={passed:false,targetVersion,sourceVersion:null,nativeRestartNow:false,automaticRelaunch:false,publicFeed:false,probeRequests:0};
let downloaded=false,ready=false,playback=null,child,successorPid;
const server=http.createServer(async(request,response)=>{
 const url=new URL(request.url,'http://127.0.0.1');
 if(url.pathname==='/staging-mac.yml')return response.end(`version: ${targetVersion}\nfiles:\n  - url: update.zip\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: update.zip\nsha512: ${sha512}\n`);
 if(url.pathname==='/update.zip'){response.on('finish',()=>{downloaded=true;});response.setHeader('Content-Length',bytes.length);return response.end(bytes);}
 if(url.pathname==='/') {report.probeRequests++;response.setHeader('Content-Type','text/html');return response.end(protectedPage(marker));}
 if(url.pathname==='/favicon.ico')return response.writeHead(204).end();
 if(['/ready','/result'].includes(url.pathname)&&request.headers['x-blanc-probe']===marker){let body='';for await(const chunk of request){body+=chunk;if(body.length>4096)return response.writeHead(413).end();}const data=JSON.parse(body);if(url.pathname==='/ready'){ready=data.ready===true;report.probeReady=data.ready===true;}else playback=data;return response.end('ok');}
 response.writeHead(404).end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const wait=async(name,read,timeout=120000)=>{const end=Date.now()+timeout;while(Date.now()<end){const result=await read();if(result)return result;await new Promise(resolve=>setTimeout(resolve,250));}throw Error(`Timed out: ${name}`);};
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:15000}).trim();
const processIds=()=>run('ps',['-axo','pid=,comm=']).split('\n').flatMap(line=>{const m=line.trim().match(/^(\d+)\s+(.+)$/);return m&&m[2]===executable?[Number(m[1])]:[];});
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
try{
 run('ditto',[sourceApp,app]);
 report.sourceVersion=run('plutil',['-extract','CFBundleShortVersionString','raw',path.join(app,'Contents/Info.plist')]);
 assert.notEqual(report.sourceVersion,targetVersion);
 const env={...process.env,BLANC_UPDATE_CHANNEL:'staging',BLANC_UPDATE_STAGING_URL:origin+'/',BLANC_UPDATE_STAGING_ALLOW_HTTP:'1'};
 for(const key of ['ELECTRON_RUN_AS_NODE','BLANC_UPDATE_STAGING_AUTO_INSTALL','BLANC_UPDATE_STAGING_STATUS_FILE'])delete env[key];
 child=spawn(executable,[],{env,stdio:'ignore'});
 await wait('download from private loopback feed',()=>downloaded);
 const script=`tell application "System Events"
 set matches to application processes whose unix id is ${child.pid}
 if (count of matches) is 0 then return "waiting"
 tell item 1 of matches
  set frontmost to true
  repeat with windowIndex from 1 to count of windows
   if exists button "Restart Now" of window windowIndex then
    click button "Restart Now" of window windowIndex
    return "clicked"
   end if
   if exists sheet 1 of window windowIndex then
    if exists button "Restart Now" of sheet 1 of window windowIndex then
     click button "Restart Now" of sheet 1 of window windowIndex
     return "clicked"
    end if
   end if
  end repeat
 end tell
 return "waiting"
end tell`;
 await wait('native Restart Now button',()=>run('/usr/bin/osascript',['-e',script])==='clicked');
 report.nativeRestartNow=true;
 await wait('old process exit',()=>!alive(child.pid));
 await wait('exact updated app payload',async()=>{try{return crypto.createHash('sha256').update(await fs.readFile(path.join(app,'Contents/Resources/app.asar'))).digest('hex')===targetAsarHash;}catch{return false;}});
 successorPid=await wait('automatic updated process',()=>processIds().find(pid=>pid!==child.pid));
 report.automaticRelaunch=true;
 assert.equal(run('plutil',['-extract','CFBundleShortVersionString','raw',path.join(app,'Contents/Info.plist')]),targetVersion);
 run('codesign',['--verify','--deep','--strict',app]);run('bash',[path.resolve('scripts/ci-intel-apple-tickets.sh'),app]);
 await wait('actual Widevine component installation',async()=>{
  for(const version of await fs.readdir(path.join(profile,'WidevineCdm')).catch(()=>[])){
   if(/^\d+(?:\.\d+){3}$/.test(version)&&await fs.stat(path.join(profile,'WidevineCdm',version,'manifest.json')).catch(()=>null))return true;
  }
  return false;
 });
 // The same loopback page used for Linux proves protected media in the
 // automatic successor, not in an independently relaunched test process.
 for(let attempt=1;attempt<=3;attempt++){
  report.navigationAttempts=attempt;
  const before=report.probeRequests;
  run('/usr/bin/osascript',['-e',`tell application "System Events"
   tell first application process whose unix id is ${successorPid}
    set frontmost to true
    repeat 20 times
     if frontmost is true and (count of windows) > 0 then exit repeat
     delay 0.1
    end repeat
    keystroke "l" using command down
    delay 0.2
    keystroke "a" using command down
    keystroke ${JSON.stringify(origin+'/')}
    key code 36
   end tell
  end tell`]);
  try{await wait('updated probe navigation request',()=>report.probeRequests>before,15000);break;}
  catch(error){if(attempt===3)throw error;}
 }
 // Retry only input that produced no request. An actual page/player failure
 // must remain a failure, not be hidden by reloading or restarting the app.
 await wait('updated protected page',()=>{
  if(report.probeReady===false)throw Error('Updated protected page loaded without its player');
  return ready;
 });
 run('/usr/bin/osascript',['-e','tell application "System Events" to key code 36']);
 const media=await wait('updated protected playback',()=>playback);
 assert.equal(media.failure,undefined);assert.equal(media.status,2);assert.equal(media.mediaKeys,true);
 assert(media.encryptedEvents>0);assert.deepEqual(media.mediaErrors,[]);assert.equal(media.error,null);assert.equal(media.paused,false);assert(media.second-media.first>2&&media.second-media.first<8);
 report.protectedPlayback=media;report.passed=true;
}catch(error){
 report.failure=error.message.slice(0,600);
 try{report.blancProcesses=run('ps',['-axo','pid=,comm=']).split('\n').filter(line=>line.includes('/Blanc.app/')).slice(0,30);}catch{}
 throw error;
}
finally{
 for(const pid of processIds()){try{run('/usr/bin/osascript',['-e',`tell application ${JSON.stringify(app)} to quit`]);await wait('owned app quit',()=>!alive(pid),10000);}catch{try{process.kill(pid,'SIGTERM');}catch{}}}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 if(await fs.readFile(path.join(profile,'ecs-handoff-owner'),'utf8').catch(()=>null)===marker){await fs.rm(profile,{recursive:true,force:true,maxRetries:3});report.profileRemoved=true;}
 try{await fs.rm(root,{recursive:true,force:true,maxRetries:3});report.installationRemoved=true;}catch{report.installationRemoved=false;}
 await fs.mkdir(path.dirname(evidence),{recursive:true});await fs.writeFile(evidence,JSON.stringify(report,null,2));
}
