// Native metadata-secret lifecycle, without a credential ceremony, Keychain
// lookup, Touch ID, Apple service, entitlement or signing operation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const [configPath,out]=process.argv.slice(2);
assertNodeRuntime();
const config=JSON.parse(fs.readFileSync(configPath)),f=new NativeFixture(),w=createWorld(f);
fs.mkdirSync(out,{recursive:true});
const result={candidate:config.candidate,qualification:'Touch ID metadata-secret isolation only; no passkey registration or assertion',checks:[]};
try{
 await f.launch(config,path.join(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-private-secret-')),'fixture'),{testHooks:true,diskAssets:config.diskAssets!==false});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));
 // Calling the actual config builder mints the regular secret first, so the
 // private profile's inherited prefs contain a secret and cannot mask the bug.
 const before=await w.native('privatePasskeySecrets');
 assert.equal(before.isolated,true);assert.equal(before.stable,true);
 result.checks.push({name:'private secret independent and stable within profile',result:'pass'});
 await w.relaunch();await assertRendering(e=>f.host.eval(e));
 const after=await w.native('privatePasskeySecrets');
 assert.equal(after.isolated,true);assert.equal(after.stable,true);
 assert.equal(after.regular,before.regular);assert.notEqual(after.private,before.private);
 result.checks.push({name:'regular secret survives restart; private secret rotates',result:'pass'});
}catch(error){result.checks.push({result:error.code==='BLANC_ENVIRONMENT_STOP'?'blocked':'fail',error:String(error.stack)});process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.checks.push({result:'fail',exit});process.exitCode=1;}
 fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(path.dirname(f.directory),{recursive:true,force:true});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
