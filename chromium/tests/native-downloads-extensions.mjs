// The Island's Downloads reacts to the person's downloads, never to an
// extension being installed: the Web Store's installer downloads the package
// with its own download source, which the activity and the Downloads list
// skip. An ordinary
// download from the same page still shows (the control).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-downloads-ext-'));
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:process.env.DISK_ASSETS==="1"});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
 const activity=async()=>(await w.snapshot()).downloadsActivity;
 result.start=await activity();
 // An extension's package, downloaded as the Web Store's installer does.
 assert.equal(await w.native('testStartDownload',[f.base+'/extension.crx',true]),true);
 await new Promise(r=>setTimeout(r,2500));
 const afterInstall=await activity();result.afterInstall=afterInstall;
 const sources=await w.native('testDownloadSources',[]);result.sources=sources;
 assert.ok(sources.includes('extension-installer'),`the installer's download exists: ${JSON.stringify(sources)}`);
 assert.equal(afterInstall.hasRecent,false,`an extension install is not a download in the Island: ${JSON.stringify(afterInstall)}`);
 assert.equal(afterInstall.active,0);
 result.checks.push('an extension being installed (its download made) does not light Downloads in the Island');
 // The control: an ordinary download does.
 assert.equal(await w.native('testStartDownload',[f.base+'/report.html',false]),true);
 const afterDownload=await w.waitFor(activity,a=>a?.hasRecent===true,'the ordinary download in the Island',10000);
 result.afterDownload=afterDownload;
 result.checks.push('an ordinary download still lights Downloads');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result));
}catch(e){result.error=String(e.stack||e);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));console.log(JSON.stringify(result));process.exitCode=1;}
finally{await f.close();fs.rmSync(parent,{recursive:true,force:true});}
