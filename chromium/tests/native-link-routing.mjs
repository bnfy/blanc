// Routing across real profile/Space boundaries, with no external service access.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {createProfile} from './fork-steps/profiles.mjs';
import {tabPage} from './adapters/core.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-link-routing-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const rule=(id,profileId,spaceId=null,privateTab=false)=>({id,match:{kind:'contains',value:'/route-proof-'},destination:{profileId,spaceId,private:privateTab}});
const save=async rows=>assert.equal((await w.native('setLinkRoutes',[rows])).ok,true);
const receive=async url=>{
 assert.equal(await w.native('externalLink',[url]),true);
 return w.waitFor(()=>w.call('windowRuntimes'),rs=>rs.some(r=>r.tabs.some(t=>t.url===url&&!t.isLoading)),'routed destination');
};
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await visible();await w.reset();
 const work=await createProfile(w,'Routing Work'),profileId=work.directory;
 await work.cdp.eval(`window.BlancPrototypeHost.api.createTab(${JSON.stringify(f.base+'/space-home')})`);
 await w.waitFor(()=>nativeCall(work.cdp,'snapshot'),s=>s.tabs.every(t=>!t.isLoading),'Space source loaded');
 const saved=await work.cdp.eval("window.BlancPrototypeHost.api.saveWorkspaceAs('Routing Space')");assert.equal(saved.ok,true);
 const spaceId=saved.workspaceId;
 const windows=await w.call('windowRuntimes'),workId=windows.find(r=>r.profileId===profileId).id;
 await w.call('closeWindowRuntime',workId);
 await save([rule('space',profileId,spaceId)]);
 const url=f.base+'/route-proof-space';
 let all=await receive(url),receiver=all.find(r=>r.tabs.some(t=>t.url===url));
 assert.equal(receiver.profileId,profileId);assert.equal(receiver.workspaceId,spaceId);
 result.checks.push('a closed profile Space opens before receiving the native-held URL');
 await save([rule('private',profileId,spaceId,true)]);
 const privateUrl=f.base+'/route-proof-private';all=await receive(privateUrl);receiver=all.find(r=>r.tabs.some(t=>t.url===privateUrl));
 assert.equal(receiver.profileId,profileId);assert.equal(receiver.workspaceId,spaceId);
 assert.equal(receiver.tabs.find(t=>t.url===privateUrl).private,true);
 result.checks.push('the selected Space receives a genuine native private tab');
 await save([rule('deleted-space',profileId,'11111111-1111-4111-8111-111111111111'),rule('fallback','default')]);
 const fallbackUrl=f.base+'/route-proof-fallback';all=await receive(fallbackUrl);receiver=all.find(r=>r.tabs.some(t=>t.url===fallbackUrl));
 assert.equal(receiver.profileId,'default');result.checks.push('a deleted Space falls through to the next matching rule');
 await save([rule('trusted-only',profileId)]);await w.native('setLinkRoutesInApp',[true]);
 const sourceId=await w.call('openTab',f.base+'/activation-source'),source=await tabPage(w,sourceId);
 const scriptedUrl=f.base+'/route-proof-scripted-click';
 await source.evaluate(url=>{const a=document.createElement('a');a.href=url;a.target='_blank';document.body.append(a);a.click();},scriptedUrl);
 all=await w.waitFor(()=>w.call('windowRuntimes'),rs=>rs.some(r=>r.tabs.some(t=>t.url===scriptedUrl)),'scripted anchor stays in source');
 assert.equal(all.find(r=>r.tabs.some(t=>t.url===scriptedUrl)).profileId,'default');
 result.checks.push('a script-triggered anchor with transient activation stays in its source profile');
 const rows=await w.native('linkRoutes');
 assert.equal((await w.native('setLinkRoutes',[[{...rule('bad','default'),match:{kind:'domain',value:'user@127.0.0.1'}}]])).ok,false);
 assert.deepEqual(await w.native('linkRoutes'),rows);result.checks.push('invalid host rules leave the complete prior list intact');
 await visible();
 // Native writes are observed on disk, without modifying browser preferences.
 await w.waitFor(()=>{try{return JSON.parse(fs.readFileSync(path.join(f.profile,'Local State'))).blanc?.links?.routes;}catch{return null;}},v=>JSON.stringify(v)===JSON.stringify(rows),'durable device-local rules');
 result.checks.push('the ordered rules are durable in native Local State');result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
