// Local HTML files (N15): the open-file grant and the refusals around it,
// beyond the one shipping scenario (tabs-and-groups.feature:292).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {tabPage} from './adapters/core.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'blanc-local-files-')));
const files=path.join(parent,'files');fs.mkdirSync(files);
const write=(name,title)=>{const file=path.join(files,name);fs.writeFileSync(file,`<!doctype html><title>${title}</title><h1>${title}</h1>`);return pathToFileURL(file).href;};
const home=write('home.html','Granted home'),sibling=write('sibling.html','Sibling'),xhtml=write('page.XHTML','Upper case type');
fs.writeFileSync(path.join(files,'notes.txt'),'plain text');
fs.symlinkSync(path.join(files,'home.html'),path.join(files,'link.html'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const urls=async()=>(await w.state()).tabs.map(t=>t.url);
const title=async id=>(await tabPage(w,id)).evaluate(()=>document.title);
const loaded=url=>w.waitForState(s=>s.tabs.some(t=>t.url===url&&!t.loading));
const refused=async(open,what)=>{
 const before=await urls();assert.equal(await w.native('testOpenLocalFile',[open]),true,what+' is taken from Chromium');
 await pause(1500);assert.deepEqual(await urls(),before,what+' opens nothing');
};
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await visible();await w.reset();
 const webUrl=f.base+'/local-files-web',webId=await w.call('openTab',webUrl);

 const homeId=await w.call('openTab',home,{allowLocalFile:true});
 assert.equal(await title(homeId),'Granted home');
 result.checks.push('the open-file path opens a local HTML document in a tab');

 assert.equal(await w.native('testOpenLocalFile',[pathToFileURL(path.join(files,'link.html')).href]),true);
 await w.waitForState(s=>s.tabs.filter(t=>t.url===home&&!t.loading).length===2);
 assert.ok(!(await urls()).some(u=>u.endsWith('/link.html')));
 result.checks.push('a symlink opens at the canonical address of its file');

 assert.equal(await w.native('testOpenLocalFile',[xhtml]),true);await loaded(xhtml);
 result.checks.push('the document type is matched without regard to case');

 await refused(pathToFileURL(path.join(files,'notes.txt')).href,'a text file');
 await refused(pathToFileURL(files).href+'/','a folder');
 await refused(pathToFileURL(path.join(files,'missing.html')).href,'a missing file');
 result.checks.push('a text file, a folder and a missing file open nothing');

 // No grant: a browser-side navigation of a web tab to a local file is dropped.
 await w.native('testNavigateTabAnyScheme',[Number(webId),sibling]);
 await pause(1500);
 assert.equal((await w.state()).tabs.find(t=>t.id===webId).url,webUrl);
 result.checks.push('a tab without the grant cannot be sent to a local file');

 // The grant names one file: a link to its neighbour goes nowhere.
 const page=await tabPage(w,homeId);
 await page.evaluate(url=>{location.href=url;},sibling).catch(()=>{});
 await pause(1500);
 assert.equal((await w.state()).tabs.find(t=>t.id===homeId).url,home);
 assert.equal(await title(homeId),'Granted home');
 result.checks.push('a granted document cannot navigate to a neighbouring file');

 await w.call('activateTab',homeId);
 await w.relaunch();await visible();
 const activeHome=s=>s.tabs.find(t=>t.url===home&&t.id===s.activeTabId&&!t.loading);
 const restoredId=activeHome(await w.waitForState(s=>Boolean(activeHome(s)))).id;
 assert.equal(await title(restoredId),'Granted home');
 result.checks.push('the grant returns with the saved session and the file loads again');

 await w.call('closeTab',restoredId);
 await w.waitForState(s=>!s.tabs.some(t=>t.id===restoredId));
 await w.call('reopenClosed');
 assert.equal(await title(activeHome(await w.waitForState(s=>Boolean(activeHome(s)))).id),'Granted home');
 result.checks.push('a closed local HTML tab reopens with its grant');
 const homes=(await w.state()).tabs.filter(t=>t.url===home).length;
 await w.call('duplicateActive');
 const copy=await w.waitForState(s=>s.tabs.filter(t=>t.url===home).length===homes+1&&Boolean(activeHome(s)));
 assert.equal(await title(activeHome(copy).id),'Granted home');
 result.checks.push('a duplicate of a local HTML tab carries the grant');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
