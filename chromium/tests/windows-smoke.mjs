// The Windows launch check (W0 exit gate 4): an unpacked candidate starts,
// draws the Island, starts the blocker and loads a page, on the machine it
// runs on. It makes its own run config from the candidate's candidate.json,
// so it needs no tracker entry and can run before the suite does.
//
//   node chromium/tests/windows-smoke.mjs CANDIDATE_FOLDER RESULTS_FOLDER [--installed=APPLICATION_FOLDER]
// With --installed it launches the installed copy (W1 Part B), which needs no
// sandbox grant of its own: the installer gives it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {NativeFixture} from './lib/fixture.mjs';
import {waitFor} from './lib/cdp.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {hostPlatform} from './lib/platform.mjs';
import {desktopCapture} from './lib/windows-desktop.mjs';
import {runtimeConfig} from '../windows/candidate.mjs';

const [candidateFolder,resultsFolder,...smokeOptions]=process.argv.slice(2);
const installed=smokeOptions.find(o=>o.startsWith('--installed='))?.slice('--installed='.length)??null;
if(smokeOptions.some(o=>!o.startsWith('--installed=')))throw Error('Unknown option: '+smokeOptions.join(' '));
if(!candidateFolder||!resultsFolder)throw Error('Usage: windows-smoke.mjs CANDIDATE_FOLDER RESULTS_FOLDER');
assertNodeRuntime();
const directory=path.resolve(candidateFolder),out=path.resolve(resultsFolder);
if(fs.existsSync(out))throw Error('Refusing to overwrite earlier results');
fs.mkdirSync(out,{recursive:true});
const candidate=JSON.parse(fs.readFileSync(path.join(directory,'candidate.json'),'utf8'));
const config=runtimeConfig(directory,candidate,path.join,installed&&path.resolve(installed));
const record={installed:installed??null,candidate:candidate.id,version:candidate.version,treeCommit:candidate.treeCommit,platform:hostPlatform(),host:`${os.type()} ${os.release()} ${os.arch()}`,checks:{}};
const save=()=>fs.writeFileSync(path.join(out,'smoke.json'),JSON.stringify(record,null,2)+'\n');
const png=async(connection,name)=>fs.writeFileSync(path.join(out,name),Buffer.from((await connection.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
const fixture=new NativeFixture();
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-smoke-'));
let failure=null;
try{
 // launch() itself waits for the Island's document, the blocker's ready
 // state and the fixture page; each is recorded again below from the app.
 await fixture.launch(config,path.join(scratch,'case'),{testHooks:true,diskAssets:false});
 record.checks.launched=true;
 const version=await fixture.browser.send('Browser.getVersion');
 record.product=version.product;record.userAgent=version.userAgent;
 await installDriver(fixture.host);
 record.checks.testHooks=(await nativeCall(fixture.host,'capabilities')).testHooks===true;
 await assertRendering(e=>fixture.host.eval(e));
 record.checks.islandDraws=true;
 const snapshot=await waitFor(fixture.snapshot,s=>s.blockerHealth==='ready'&&s.tabs.some(t=>t.url===fixture.base+'/initial'&&!t.isLoading),'blocker ready and page loaded');
 record.checks.blockerReady=snapshot.blockerHealth==='ready';
 record.checks.pageLoaded=await fixture.page.eval('document.title')==='Native test fixture';
 record.islandPlatform=await fixture.host.eval('navigator.platform');
 record.tabs=snapshot.tabs.map(t=>({url:t.url.replace(fixture.base,'<fixture>'),title:t.title}));
 await png(fixture.host,'island.png');await png(fixture.page,'page.png');
 record.checks.desktopCaptured=desktopCapture(path.join(out,'desktop.png'));
}catch(error){failure=error;record.error=String(error.stack||error);}
finally{
 try{record.exit=await fixture.close();}catch(error){record.closeError=String(error.message||error);}
 const log=path.join(scratch,'case','browser.log');
 if(fs.existsSync(log))fs.copyFileSync(log,path.join(out,'browser.log'));
 fs.rmSync(scratch,{recursive:true,force:true});
}
const required=['launched','testHooks','islandDraws','blockerReady','pageLoaded'];
record.pass=!failure&&required.every(name=>record.checks[name]===true)&&record.exit?.code===0;
save();
console.log(JSON.stringify(record,null,2));
if(!record.pass)process.exitCode=1;
