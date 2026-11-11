// Real local TLS decisions: eviction affects future loads, never committed
// page security state, and a private profile cannot evict regular decisions.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const {loadShippingModule}=createRequire(import.meta.url)('./lib/shipping-core.cjs');
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const state=async id=>(await w.call('serializedTabsPayload')).find(t=>t.id===id)?.siteInfo?.state;
const waitState=(id,wanted)=>w.waitFor(()=>state(id),s=>s===wanted,'certificate '+wanted,10000);
const allow=async id=>{await waitState(id,'certificate-error');assert.deepEqual(await w.call('continueUnsafeInTab',id),{ok:true});await waitState(id,'certificate-exception');};
try{
 await f.launch(config,path.join(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-cert-bound-')),'fixture'),
  {testHooks:true,diskAssets:false,pages:await loadShippingModule('test/desktop/support/fixtures-server.js').start()});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();w.bindShippingContext();
 const nas=w.localFixtureUrl('bound-nas'),lab=w.localFixtureUrl('bound-lab','','lab.home.arpa');
 const first=await w.call('openTab',nas);await allow(first);
 assert.equal(await w.call('setCertificateExceptionCap',1),true);
 const second=await w.call('openTab',lab);await allow(second);
 await waitState(first,'certificate-exception');await waitState(second,'certificate-exception');
 const evicted=await w.call('openTab',nas+'?after-eviction');await waitState(evicted,'certificate-error');
 const kept=await w.call('openTab',lab+'?still-allowed');await waitState(kept,'certificate-exception');
 result.checks.push({name:'one-decision bound evicts oldest allowance; existing pages retain not-secure state',result:'pass'});
 const privateId=await w.call('openTab',nas+'?private',{private:true});await allow(privateId);
 assert.equal(await w.call('setCertificateExceptionCap',0),true);
 await waitState(privateId,'certificate-exception');
 await w.call('executeTab',privateId,'location.reload()');await waitState(privateId,'certificate-error');
 const regular=await w.call('openTab',lab+'?after-private-eviction');await waitState(regular,'certificate-exception');
 result.checks.push({name:'private eviction leaves regular allowance intact and affects only future private loads',result:'pass'});
 await assert.rejects(()=>w.call('setCertificateExceptionCap',65),/Invalid certificate bound/);
 result.checks.push({name:'preview transport cannot increase production bound',result:'pass'});
 await assertRendering(e=>f.host.eval(e));
}catch(error){result.checks.push({result:error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail',error:String(error.stack)});process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.checks.push({result:'fail',exit});process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 if(f.directory)fs.rmSync(path.dirname(f.directory),{recursive:true,force:true});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
