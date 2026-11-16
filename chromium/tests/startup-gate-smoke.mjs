// N22 smoke: web requests wait for Blanc Blocker, and fail closed when it
// can't start. The fork's native blocker holds every decision until its
// engine is ready (shipping cancels and replays instead); with the engine's
// bundle missing, nothing a tab asks for reaches the network.
//   node chromium/tests/startup-gate-smoke.mjs runtime-config.json result.json
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {connect,waitFor,pause} from './lib/cdp.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
const [configPath,outFile]=process.argv.slice(2);
if(!configPath||!outFile)throw Error('Usage: startup-gate-smoke.mjs runtime-config.json result.json');
const config=JSON.parse(fs.readFileSync(configPath));
let requests=0;
const server=http.createServer((q,r)=>{requests++;r.writeHead(200,{'content-type':'text/html'});r.end('<title>reached</title>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
// The fixture's start waits for a ready blocker; this one stops at the Island.
class UnreadyFixture extends NativeFixture {
 async start(url=null){
  this.exit=null;fs.rmSync(path.join(this.profile,'DevToolsActivePort'),{force:true});
  const {spawn}=await import('node:child_process');
  const fd=fs.openSync(path.join(this.directory,'browser.log'),'a');
  const child=this.process=spawn(this.config.executable,[...this.flags,...(url?[url]:[])],{stdio:['ignore',fd,fd]});
  fs.closeSync(fd);this.launches++;
  child.on('exit',(code,signal)=>{this.exits.push({code,signal});if(this.process===child)this.exit={code,signal};});
  this.port=await waitFor(()=>+fs.readFileSync(path.join(this.profile,'DevToolsActivePort'),'utf8').split('\n')[0],p=>p>0,'debug port');
  this.targets=()=>fetch(`http://127.0.0.1:${this.port}/json/list`).then(r=>r.json());
  this.browser=await connect(await fetch(`http://127.0.0.1:${this.port}/json/version`).then(r=>r.json()));this.connections.push(this.browser);
  const targets=await waitFor(this.targets,ts=>ts.some(t=>t.url.includes('/host.html')),'Island');
  this.host=await connect(targets.find(t=>t.url.includes('/host.html')));this.connections.push(this.host);
  this.snapshot=()=>this.host.eval('window.BlancPrototypeHost.api.getAllTabs()');
 }
}
const result={candidate:config.candidate,checks:{},status:'started'};
const fixture=new UnreadyFixture();
try{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-startup-gate-'));
 // An empty folder in place of the blocker's pinned bundle: the engine can't start.
 const missing=path.join(root,'no-blocker-assets');fs.mkdirSync(missing);
 try{await fixture.launch({...config,blockerAssets:missing},root+'/case',{diskAssets:false,testHooks:true,pages:{base,close:()=>{}}});}
 catch(e){result.launchNote=String(e.message).split('\n')[0];}
 const health=await waitFor(async()=>(await fixture.snapshot()).blockerHealth,h=>h==='unavailable','blocker unavailable',30000);
 result.checks.blockerHealth=health;
 await installDriver(fixture.host);
 await nativeCall(fixture.host,'createTab',[base+'/later']);
 await pause(3000);
 assert.equal(requests,0,'no request reached the network');
 result.checks.requestsReached=requests;
 result.status='passed';
}catch(e){result.status='failed';result.error=String(e.stack||e);result.requestsReached=requests;}
finally{
 // The recovery dialog ("Blocking is unavailable") stays up; quit regardless.
 result.browserExit=await fixture.close().catch(e=>({error:e.message}));server.close();
 fs.writeFileSync(outFile,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({status:result.status,checks:result.checks,launchNote:result.launchNote,error:result.error?.split('\n')[0]}));}
if(result.status!=='passed')process.exitCode=1;
