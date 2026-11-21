// The Windows quit check (W2 Task A2): closing the last ordinary window with
// Windows' own close button ends the browser, whatever the session held.
// On the Mac the app stays open after its last window, so this is Windows'
// own rule (and shipping Blanc for Windows').
//
//   node chromium/tests/windows-quit.mjs CANDIDATE_FOLDER RESULTS_FOLDER
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {NativeFixture} from './lib/fixture.mjs';
import {waitFor,pause} from './lib/cdp.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
import {assertNodeRuntime} from './lib/render-guard.mjs';
import {realInput,clickSteps} from './lib/windows-desktop.mjs';
import {runtimeConfig} from '../windows/candidate.mjs';

const [candidateFolder,resultsFolder]=process.argv.slice(2);
if(!candidateFolder||!resultsFolder)throw Error('Usage: windows-quit.mjs CANDIDATE_FOLDER RESULTS_FOLDER');
if(process.platform!=='win32')throw Error('The quit check runs on Windows');
assertNodeRuntime();
const directory=path.resolve(candidateFolder),out=path.resolve(resultsFolder);
if(fs.existsSync(out))throw Error('Refusing to overwrite earlier results');
fs.mkdirSync(out,{recursive:true});
const candidate=JSON.parse(fs.readFileSync(path.join(directory,'candidate.json'),'utf8'));
const config=runtimeConfig(directory,candidate);
const record={candidate:candidate.id,checks:{},details:{}};
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-quit-'));
const EXIT_WITHIN_MS=10000;
// Chromium's close button: 45 DIPs wide, outermost, 22 from the right edge.
const CLOSE_FROM_RIGHT=22;
const api=(fixture,method,args=[])=>fixture.host.eval(`window.BlancPrototypeHost.api[${JSON.stringify(method)}](...${JSON.stringify(args)})`);

// What each case does before the last window closes.
const CASES={
 plainQuit:async()=>{},
 quitAfterTabClose:async fixture=>{
  await nativeCall(fixture.host,'createTab',[fixture.base+'/initial']);
  const tabs=(await nativeCall(fixture.host,'snapshot')).tabs;
  await nativeCall(fixture.host,'closeTab',[tabs[0].id]);
  await waitFor(fixture.snapshot,s=>s.tabs.length===tabs.length-1,'one tab closed');
 },
 quitAfterSpaceSwitch:async fixture=>{
  await api(fixture,'saveWorkspaceAs',['Quit one',{}]);
  await api(fixture,'createBlankWorkspace',['Quit two',{}]);
  await pause(1000);
 },
 quitWithMiniWindow:async fixture=>{
  if(await nativeCall(fixture.host,'openMiniWindow')!==true)throw Error('No mini window opened');
  await pause(1000);
 },
};

const fixtures=[];
async function runCase(name,setup){
 const fixture=new NativeFixture();fixtures.push(fixture);
 await fixture.launch(config,path.join(scratch,name),{testHooks:true,diskAssets:false});
 await installDriver(fixture.host);
 await setup(fixture);
 // The ordinary window, found through a marked page opened in it last (the
 // Island's host page is not a window of its own to CDP).
 const marker=fixture.base+'/initial?quit-check';
 await nativeCall(fixture.host,'createTab',[marker]);
 const markerTarget=await waitFor(async()=>(await fixture.targets()).find(t=>t.type==='page'&&t.url===marker),Boolean,'the marked page');
 const {bounds}=await fixture.browser.send('Browser.getWindowForTarget',{targetId:markerTarget.id});
 const i=await nativeCall(fixture.host,'windowFrameInsets');
 realInput(clickSteps(bounds.left+bounds.width-i.right-CLOSE_FROM_RIGHT,bounds.top+i.top+14));
 const pressed=Date.now();
 while(!fixture.exit&&Date.now()-pressed<EXIT_WITHIN_MS)await pause(100);
 const detail={exit:fixture.exit??null,exitAfterMs:fixture.exit?Date.now()-pressed:null};
 // Still running: what keeps it, from the browser's own endpoint, which
 // stays up as long as the process does.
 if(!fixture.exit){
  detail.targets=await fixture.browser.send('Target.getTargets').then(r=>r.targetInfos.map(t=>({type:t.type,url:t.url})),e=>String(e.message||e));
  detail.windows=await Promise.all((await fixture.targets()).map(t=>fixture.browser.send('Browser.getWindowForTarget',{targetId:t.id}).then(w=>({url:t.url,windowId:w.windowId,state:w.bounds.windowState}),()=>null))).catch(e=>String(e));
 }
 record.details[name]=detail;
 record.checks[name]=fixture.exit?.code===0;
 await fixture.close().catch(()=>{});
}

let failure=null;
try{
 for(const [name,setup] of Object.entries(CASES)){
  try{await runCase(name,setup);}catch(error){record.checks[name]=false;record.details[name]={error:String(error.stack||error)};}
 }
}catch(error){failure=error;record.error=String(error.stack||error);}
finally{
 for(const fixture of fixtures){try{await fixture.close();}catch{}}
 fs.rmSync(scratch,{recursive:true,force:true});
}
record.pass=!failure&&Object.keys(CASES).every(name=>record.checks[name]===true);
fs.writeFileSync(path.join(out,'quit.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record,null,2));
if(!record.pass)process.exitCode=1;
