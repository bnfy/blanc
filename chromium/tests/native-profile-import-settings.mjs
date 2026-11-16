// The Electron profile importer, task 8 (plan
// docs/superpowers/plans/2026-11-16-electron-profile-importer.md): the
// command in Settings, About. The browser picks the released app's own
// folder (a test launch's stand-in), waits while that app is running, says
// what happened in the person's words, and after an import that created a
// profile keeps Chromium's profile picker from opening at the next launch.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {inSettings} from './adapters/commands.mjs';
import {makeImportSource,digestTree} from './lib/profile-import-fixture.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,'expected a new output folder');fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-profile-import-settings-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const here=path.dirname(fileURLToPath(import.meta.url));
const own=JSON.parse(fs.readFileSync(path.join(here,'../blanc/fork-strings.json'),'utf8'));
const text=name=>own['settings.profileImport.'+name].en;
// The row as a person reads it.
const row=()=>inSettings(w,'help',async(a,d)=>{
 const root=d.find('#blancImport')?.getRootNode();if(!root)return {missing:'#blancImport'};
 const button=root.getElementById('blancImportStart');
 return {value:{title:root.querySelector('#blancImport .flex > div').textContent.trim(),status:root.getElementById('blancImportStatus').textContent.trim(),
  button:button.textContent.trim(),busy:button.disabled}};});
// A person's click, and the row once the import has answered.
const click=()=>inSettings(w,'help',async(a,d)=>{
 const root=d.find('#blancImport').getRootNode(),button=root.getElementById('blancImportStart'),status=root.getElementById('blancImportStatus');
 const before=status.textContent.trim();button.click();
 const end=Date.now()+30000;
 while(Date.now()<end){await new Promise(r=>setTimeout(r,100));const now=status.textContent.trim();if(!button.disabled&&now!==before&&now!==a)break;}
 return {value:{status:status.textContent.trim(),button:button.textContent.trim(),busy:button.disabled}};},text('working'));
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();

 // 1. The row, before anything.
 let r=await row();
 assert.deepEqual(r,{title:text('title'),status:text('hint'),button:text('start'),busy:false});
 assert.equal(r.title,'Bring your data from the released Blanc app');
 result.checks.push('Settings, About offers the import in the owner\'s words');

 // 2. Nothing to import from: a test launch has no source until one is set.
 r=await click();assert.deepEqual(r,{status:text('noSource'),button:text('retry'),busy:false});
 result.checks.push('with no data from the released app the row says so and offers to try again');

 // 3. The released app running: the import waits, and reads nothing.
 const source=makeImportSource(parent);const before=digestTree(source.userData);
 await w.native('setImportSource',[source.userData]);await w.native('setImportElectronRunning',[true]);
 r=await click();assert.deepEqual(r,{status:text('running'),button:text('retry'),busy:false});
 assert.equal((await w.api('listFavorites')).length,0,'expected nothing imported while the released app runs');
 assert.deepEqual((await w.native('profileImportState')).profiles??{},{});
 result.checks.push('while the released app is running the import does not start');

 // 4. The import.
 await w.native('setImportElectronRunning',[false]);
 r=await click();assert.deepEqual(r,{status:text('done'),button:text('start'),busy:false});
 assert.deepEqual((await w.api('listFavorites')).map(x=>x.url),['https://personal.example.com/zeta','https://personal.example.com/alpha']);
 assert.equal((await w.native('profileImportProfiles')).length,2,'expected the named profile created');
 assert.equal(digestTree(source.userData),before,'expected the released app\'s folder unchanged');
 result.checks.push('the command imports from the released app\'s folder and says the data is here');

 // 5. Again: nothing new.
 r=await click();assert.deepEqual(r,{status:text('already'),button:text('start'),busy:false});
 result.checks.push('a second run says the data was already imported');

 // 6. Chromium's profile picker stays out of the way at the next launch.
 assert.equal((await w.native('profileImportPrefs',[['profile.show_picker_on_startup']])).prefs['profile.show_picker_on_startup'],false);
 await w.relaunch();await visible();
 assert.ok(!(await f.targets()).some(t=>/^chrome:\/\/profile-picker/.test(t.url)),'expected no profile picker at launch');
 assert.ok((await w.snapshot()).tabs.length>=1,'expected a Blanc window at launch');
 result.checks.push('after an import that created a profile, the next launch opens Blanc\'s windows, not Chromium\'s profile picker');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
