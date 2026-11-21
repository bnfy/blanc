// A real preference-write failure, recovery, and loopback-only telemetry.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const [configPath,out]=process.argv.slice(2);
assertNodeRuntime();
const config=JSON.parse(fs.readFileSync(configPath)),f=new NativeFixture(),w=createWorld(f),events=[];
fs.mkdirSync(out,{recursive:true});
const result={candidate:config.candidate,checks:[]};
const server=http.createServer((q,r)=>{q.resume();q.on('end',()=>{
 const disk=JSON.parse(fs.readFileSync(path.join(f.profile,'Local State')));
 events.push({path:q.url,consent:disk.blanc?.telemetry?.usage_ping,completed:disk.blanc?.first_run?.completed_at});r.writeHead(204);r.end();
});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
f.extraArgs=['--blanc-test-first-run','--blanc-test-version=1.46.0',`--blanc-test-telemetry-host=http://127.0.0.1:${server.address().port}`];
const commit=usage=>w.call('executeStartPage',`window.bowserPages.start.completePrivacy({searchSuggestions:false,usagePing:${usage}})`);
let local,backup;
try{
 await f.launch(config,path.join(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-consent-')),'fixture'),{testHooks:true,diskAssets:config.diskAssets!==false});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.call('openTab','blanc://newtab/');
 local=path.join(f.profile,'Local State');backup=local+'.before-fault';
 await w.waitFor(()=>fs.existsSync(local),Boolean,'initial Local State file');
 // A directory at the destination makes the actual atomic rename fail,
 // without a fake success response or a product-only failure switch.
 fs.renameSync(local,backup);fs.mkdirSync(local);
 assert.equal((await commit(true)).completed,false);
 assert.equal((await w.native('firstRunState')).complete,false);
 assert.deepEqual(events,[]);assert.equal((await w.native('telemetryState')).installId,false);
 result.checks.push({name:'failed consent write acknowledged as failure; no event or install id',result:'pass'});
 fs.rmdirSync(local);fs.renameSync(backup,local);backup=null;
 assert.equal((await commit(false)).completed,true);assert.deepEqual(events,[]);
 assert.equal((await commit(true)).completed,true);
 await w.waitFor(()=>events.filter(e=>e.path==='/ping').length,n=>n===1,'one consented launch ping');
 for(const e of events){assert.equal(e.consent,true);assert.ok(e.completed>0);}
 result.checks.push({name:'write retry succeeds before any loopback event',result:'pass'});
 await w.native('setUsagePing',[false]);
 assert.equal(JSON.parse(fs.readFileSync(local)).blanc.telemetry.usage_ping,false);
 result.checks.push({name:'post-onboarding consent change persists before reply',result:'pass'});
 await assertRendering(e=>f.host.eval(e));
}catch(error){result.checks.push({result:error.code==='BLANC_ENVIRONMENT_STOP'?'blocked':'fail',error:String(error.stack)});process.exitCode=1;}
finally{
 if(backup&&fs.existsSync(backup)){fs.rmSync(local,{recursive:true,force:true});fs.renameSync(backup,local);}
 const exit=await f.close();if(exit?.code!==0){result.checks.push({result:'fail',exit});process.exitCode=1;}
 server.closeAllConnections();await new Promise(r=>server.close(r));
 fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(path.dirname(f.directory),{recursive:true,force:true});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
