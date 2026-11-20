// Ctrl+Tab by most recent use with the real keyboard on Windows (W2 C1):
// keys go through Windows' own input queue (keybd_event), so the key state
// Chromium reads and the window's activation are real. native-tab-switch.mjs
// covers the whole gesture with keys posted to the app; this covers what
// posted keys can't: a real Control held over a real Tab, and another app
// coming to the front mid-switch, which cancels it (shipping's rule).
//
//   node chromium/tests/windows-tab-switch-keys.mjs CANDIDATE_FOLDER RESULTS_FOLDER
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertNodeRuntime} from './lib/render-guard.mjs';
import {realInput,clickSteps,holdKeySteps,releaseKeySteps,frontAppSteps} from './lib/windows-desktop.mjs';
import {createWorld} from './world.mjs';
import {runtimeConfig} from '../windows/candidate.mjs';

const [candidateFolder,resultsFolder]=process.argv.slice(2);
if(!candidateFolder||!resultsFolder)throw Error('Usage: windows-tab-switch-keys.mjs CANDIDATE_FOLDER RESULTS_FOLDER');
if(process.platform!=='win32')throw Error('The real-key Ctrl+Tab check runs on Windows');
assertNodeRuntime();
const directory=path.resolve(candidateFolder),out=path.resolve(resultsFolder);
if(fs.existsSync(out))throw Error('Refusing to overwrite earlier results');
fs.mkdirSync(out,{recursive:true});
const candidate=JSON.parse(fs.readFileSync(path.join(directory,'candidate.json'),'utf8'));
const config=runtimeConfig(directory,candidate);
const record={candidate:candidate.id,checks:{},details:{}};
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-tab-keys-'));
const VK={control:0x11,tab:0x09};
const pause=ms=>new Promise(r=>setTimeout(r,ms));

const f=new NativeFixture(),w=createWorld(f);
let failure=null;
try{
 await f.launch(config,path.join(scratch,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await w.reset();
 f.server.removeAllListeners('request');f.server.on('request',(q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(`<title>${q.url.slice(1)}</title><p>${q.url}</p>`);});
 if(await w.native('setTabSwitchOrder',['recent'])!=='recent')throw Error('Could not choose recent order');
 const ids={};
 for(const name of ['a','b','c'])ids[name]=String(await w.call('openTab',f.base+'/'+name));
 const active=async()=>String((await w.snapshot()).activeTabId);
 for(const name of ['a','b','c']){await w.call('activateTab',ids[name]);await w.waitFor(active,id=>id===ids[name],'tab '+name+' current',5000);await pause(80);}
 // Bring the window to the front with a real click in its page.
 const target=(await f.targets()).find(t=>t.type==='page'&&t.url===f.base+'/c');
 const {bounds}=await f.browser.send('Browser.getWindowForTarget',{targetId:target.id});
 realInput(clickSteps(bounds.left+bounds.width/2,bounds.top+bounds.height*0.7));

 // A real Ctrl+Tab tap lands on the tab used before c.
 realInput([...holdKeySteps(VK.control,[VK.tab]),...releaseKeySteps(VK.control)]);
 const afterTap=await w.waitFor(active,id=>id===ids.b,'a real Ctrl+Tab lands on b',5000).then(()=>true,()=>false);
 record.checks.realTapLandsOnPrevious=afterTap;record.details.afterTap=await active();

 // Another app comes to the front mid-switch: Control up changes nothing.
 realInput(clickSteps(bounds.left+bounds.width/2,bounds.top+bounds.height*0.7));
 const before=await active();
 realInput([...holdKeySteps(VK.control,[VK.tab]),...frontAppSteps(),...releaseKeySteps(VK.control)]);
 await pause(400);
 const afterFront=await active();
 // The Control release went to the other app, so an unchanged tab alone
 // proves nothing: the switch itself must have ended (no pick, no card).
 const switcher=await w.hostEval('window.BlancPrototypeHost.tabSwitchState()');
 record.checks.anotherAppCancels=afterFront===before&&switcher.pick===null&&switcher.card===false;
 record.details.anotherApp={before,after:afterFront,switcher};
}catch(error){failure=error;record.error=String(error.stack||error);}
finally{
 spawnSync('taskkill.exe',['/F','/IM','notepad.exe'],{stdio:'ignore'});
 try{record.exit=await f.close();}catch(error){record.closeError=String(error.message||error);}
 fs.rmSync(scratch,{recursive:true,force:true});
}
record.pass=!failure&&record.checks.realTapLandsOnPrevious===true&&record.checks.anotherAppCancels===true;
fs.writeFileSync(path.join(out,'tab-switch-keys.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record,null,2));
if(!record.pass)process.exitCode=1;
