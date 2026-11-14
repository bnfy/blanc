// F62 under the owner's 2026-11-12 decision: the default page zoom is
// device-wide, every profile follows it, and Settings links Page zoom to
// Chromium's Zoom levels list.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {runtimes} from './adapters/tabs.mjs';
import {inSettings} from './adapters/commands.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-device-zoom-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await visible();await w.reset();
 const work=await w.call('createProfileWindow','Zoom Work');assert.equal(work.ok,true);
 const host=(await runtimes(w)).find(r=>r.id===work.runtimeId);assert.ok(host,'Work window');
 const workDefault=()=>nativeCall(host.cdp,'pageZoomTest',['default']);
 assert.equal(await w.call('setPageZoom',75),75);
 await w.waitFor(workDefault,p=>p===75,'the Work profile follows Personal');
 result.checks.push('a default chosen in Personal reaches the Work profile');
 assert.equal(await nativeCall(host.cdp,'pageZoomTest',['default',125]),125);
 await w.waitFor(()=>w.call('pageZoom'),p=>p===125,'Personal follows the Work profile');
 result.checks.push('a default chosen in the Work profile reaches Personal');
 const row=await inSettings(w,'appearance',async(a,d)=>{
  const link=d.find('#blancSiteZoom');if(!link)return {missing:'#blancSiteZoom'};
  const text=link.shadowRoot?.textContent.replace(/\s+/g,' ').trim()??'';link.click();
  await new Promise(r=>setTimeout(r,600));
  return {value:{text,at:location.href}};
 });
 assert.match(row.text,/Zoom levels/);assert.match(row.text,/These sites have their own zoom/);
 assert.match(row.at,/\/content\/zoomLevels$/);
 result.checks.push('Settings links Page zoom to the Zoom levels list');
 // The device's value is kept in Local State, which every profile reads.
 assert.equal(await w.call('setPageZoom',110),110);
 await w.waitFor(workDefault,p=>p===110,'the Work profile follows again');
 result.checks.push('the device value is the one both profiles show');
 await w.call('setPageZoom',100);
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
