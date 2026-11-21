// A regular non-Personal profile imports locally without constructing a Sync
// account/service, and keeps all new tabs and import metadata in that profile.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {sessionBytes} from './lib/import-fixture.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();if(fs.existsSync(out))throw Error('Refusing to overwrite evidence');fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
f.extraArgs=['--profile-directory=Profile 1'];
try{
 await f.launch(config,path.join(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-import-profile-')),'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
 const source=path.join(f.browserHome,'Library/Application Support/Google/Chrome/Default/Sessions');fs.mkdirSync(source,{recursive:true});
 const url=f.base+'/secondary-import';fs.writeFileSync(path.join(source,'Session_100'),sessionBytes([{url,title:'Local profile import',pinned:true}]));
 const sources=await w.native('importSources');const row=sources.sources.find(s=>s.browserId==='chrome'&&s.profile==='Acceptance profile');assert.ok(row,JSON.stringify(sources));
 const p=await w.native('importOpenSource',[row.id,{}]);assert.ok(!p.error,JSON.stringify(p));
 const request={generation:p.generation,groups:[],ungroupedCandidateIds:p.candidates.map(c=>c.candidateId)};
 const applied=await w.native('importApply',[p.sessionId,request]);assert.equal(applied.ok,true,JSON.stringify(applied));
 await w.waitForState(s=>s.tabs.some(t=>t.url===url&&t.pinned&&!t.loading));
 assert.ok(fs.existsSync(path.join(f.profile,'Profile 1')));
 assert.equal(fs.existsSync(path.join(f.profile,'Profile 1/BlancSyncDesktop')),false);
 assert.equal(fs.existsSync(path.join(f.profile,'Default/BlancSyncDesktop')),false);
 result.checks.push({name:'non-Personal regular profile imports pinned tabs without a Sync service',result:'pass'});
 await w.relaunch();await w.waitForState(s=>s.tabs.some(t=>t.url===url&&t.pinned));
 result.checks.push({name:'imported pinned home persists in the destination profile across restart',result:'pass'});
 await assertRendering(e=>f.host.eval(e));
}catch(error){result.checks.push({result:error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail',error:String(error.stack)});process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.checks.push({result:'fail',exit});process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 if(f.directory)fs.rmSync(path.dirname(f.directory),{recursive:true,force:true});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
