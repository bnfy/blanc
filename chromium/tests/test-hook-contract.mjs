import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {waitFor} from './lib/cdp.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
const [configPath,mode,runName=mode]=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(runName))throw Error('Invalid fixture run name');
if(!configPath||!['enabled-regular','enabled-private','disabled'].includes(mode))throw Error('Usage: test-hook-contract.mjs local-config.json enabled-regular|enabled-private|disabled');
const config=JSON.parse(fs.readFileSync(configPath));
const directory=path.join(config.evidence,'test-hook-'+runName);
const fixture=new NativeFixture();
const result={status:'started',candidate:config.candidate,mode,checks:[],scope:'native preview hook gate, production dispatch and request replay; not F0.5 baseline'};
try{
 await fixture.launch(config,directory,{testHooks:mode!=='disabled',privateMode:mode==='enabled-private'});
 await installDriver(fixture.host);
 if(mode==='disabled'){
  const before=await fixture.snapshot();
  await assert.rejects(()=>nativeCall(fixture.host,'createTab',[fixture.base+'/must-not-open'],'1',700),/require --blanc-test/);
  const after=await fixture.snapshot();
  assert.equal(after.tabs.length,before.tabs.length);
  assert(!after.tabs.some(t=>t.url.endsWith('/must-not-open')));
  result.checks.push('without --blanc-test, native test channel does not dispatch');
 }else{
  const caps=await nativeCall(fixture.host,'capabilities',[],'1');
  assert.equal(caps.testHooks,true);assert.equal(caps.profilePrivate,mode==='enabled-private');
  const before=await nativeCall(fixture.host,'snapshot',[],'2');
  const shape=tabs=>tabs.map(t=>({id:String(t.id),url:t.url,private:t.private,pinned:t.pinned}));
  assert.deepEqual(shape(before.tabs),shape((await fixture.snapshot()).tabs));
  result.checks.push('native handshake and snapshot reflect actual profile and tabs');
  const url=fixture.base+'/created';
  const first=await nativeCall(fixture.host,'createTab',[url],'3');
  await waitFor(fixture.snapshot,s=>s.tabs.some(t=>t.url===url&&!t.isLoading),'native created tab');
  const replay=await nativeCall(fixture.host,'createTab',[url],'3');
  assert.deepEqual(replay,first);
  const after=await fixture.snapshot();assert.equal(after.tabs.filter(t=>t.url===url).length,1);
  assert(after.tabs.every(t=>t.private===(mode==='enabled-private')));
  result.checks.push('replayed mutation returns its original reply and creates only one native tab');
  await assert.rejects(()=>nativeCall(fixture.host,'createTab',[fixture.base+'/wrong'],'3'),/reused with different arguments/);
  await assert.rejects(()=>nativeCall(fixture.host,'seedHistory',[],'4'),/Unsupported fork test operation/);
  assert(!(await fixture.snapshot()).tabs.some(t=>t.url.endsWith('/wrong')));
  result.checks.push('changed replay payload and unsupported fixture seed are refused');
 }
 assert.equal(await fixture.page.eval('typeof window.chrome?.send'),'undefined');
 result.checks.push('ordinary fixture page has no WebUI send bridge');
 result.status='passed';
}catch(e){result.status='failed';result.error=String(e.stack||e);}
finally{
 result.browserExit=await fixture.close();
 if(result.status==='passed'&&result.browserExit?.code!==0)result.status='failed';
 if(fs.existsSync(directory))fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}
if(result.status!=='passed')process.exitCode=1;
