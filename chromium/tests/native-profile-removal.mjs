import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {verifyNativeProfileRemoval} from './fork-steps/profiles.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,qualification:'V18 native counterpart, not a pass for shipping typed-name confirmation',checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-profile-removal-'));
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
 const proof=await verifyNativeProfileRemoval(w);Object.assign(result,proof);
 // Chromium removes profile registration immediately and finishes disk cleanup
 // at shutdown/startup (DeleteProfileHelper::OnLoadProfileForProfileDeletion).
 await w.relaunch({afterStop:async()=>{const local=JSON.parse(fs.readFileSync(path.join(f.profile,'Local State')));assert.equal(local.profile.info_cache[proof.directory],undefined);result.checks.push('profile registry removed before restart');}});
 await w.waitFor(()=>Promise.resolve(fs.existsSync(path.join(f.profile,proof.directory))),exists=>!exists,'deleted profile directory removed',20000);
 await w.waitFor(()=>Promise.resolve(JSON.parse(fs.readFileSync(path.join(f.profile,'Local State'))).profile.info_cache),info=>info[proof.directory]===undefined,'deleted profile registry removed',20000);
 result.checks.push('native restart removes profile directory and saved Spaces');
 await assertRendering(e=>f.host.eval(e));result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
