// N18: the Dock menu's current-tab row and the app menu's Check for
// Updates…, as shipping (src/main/dock-menu.js buildDockMenu and
// main.js dockActiveTabDescriptor: the title cut at 75 characters with an
// ellipsis, "Private tab" and no icon for a private tab; main.js's app menu
// puts Check for Updates… directly under About). The menus are read as
// AppController builds them, and items are sent their own actions; nothing
// opens on screen but what a person's choice would open.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,'expected a new output folder');fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-dock-menu-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
// A 1x1 PNG, as the fixture site's icon.
const ICON=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const LONG='A very long page title that keeps going well past the seventy-five characters the Dock row shows in full';
const dock=()=>w.native('dockMenu');
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 f.server.removeAllListeners('request');f.server.on('request',(q,r)=>{
  if(q.url==='/favicon.ico'){r.writeHead(200,{'content-type':'image/png'});r.end(ICON);return;}
  r.writeHead(200,{'content-type':'text/html'});
  r.end(`<title>${q.url==='/long'?LONG:'Dock row fixture'}</title><link rel="icon" href="/favicon.ico"><p>${q.url}</p>`);});
 await w.call('openTab',f.base+'/page');
 let menu=await w.waitFor(dock,m=>m.titles[0]==='Dock row fixture'&&m.activeTabIcon===true,'the Dock menu leads with the current tab and its icon',8000);
 assert.equal(menu.titles[1],'-','expected a separator under the current-tab row');
 for(const title of ['New Window','New Private Window','New Mini Window'])
  assert.ok(menu.titles.includes(title),`expected ${title} in the Dock menu; found ${JSON.stringify(menu.titles)}`);
 assert.equal(menu.titles.filter(t=>t==='Dock row fixture').length,1,'expected the current-tab row once');
 result.checks.push('the Dock menu leads with the current tab (title and icon), a separator, then New Window, New Private Window and New Mini Window');

 await w.call('openTab',f.base+'/long');
 menu=await w.waitFor(dock,m=>m.titles[0]?.startsWith('A very long'),'the row follows the current tab',8000);
 assert.equal(menu.titles[0],LONG.slice(0,74)+'…','expected the title cut at 75 characters with an ellipsis');
 result.checks.push('a long title is cut at 75 characters, the last an ellipsis');

 await w.call('openTab',f.base+'/private',{private:true});
 menu=await w.waitFor(dock,m=>m.titles[0]==='Private tab','a private tab shows only "Private tab"',8000);
 assert.equal(menu.activeTabIcon,false,'expected no icon for a private tab');
 assert.ok(!menu.titles.some(t=>t.includes('private')&&t!=='Private tab'&&t!=='New Private Window'),`expected nothing of the private page in the Dock menu; found ${JSON.stringify(menu.titles)}`);
 result.checks.push('a private tab shows as "Private tab" with no icon');

 assert.equal(await w.native('clickDockActiveTab'),true,'expected the current-tab row to act');
 assert.equal(menu.badge,'','expected no badge on the Dock tile');
 result.checks.push('choosing the row is handled, and the Dock tile carries no badge');

 const app=await w.native('appMenuItems');
 const about=app.findIndex(t=>/^About /.test(t));
 assert.ok(about>=0,`expected an About item; found ${JSON.stringify(app)}`);
 assert.equal(app[about+1],'Check for Updates…',`expected Check for Updates… directly under About; found ${JSON.stringify(app)}`);
 assert.equal(app.filter(t=>t==='Check for Updates…').length,1,`expected one Check for Updates…; found ${JSON.stringify(app)}`);
 result.checks.push('the application menu has Check for Updates… directly under About');

 // This build has no updater, so the item opens About (where the version is).
 const settings=async()=>(await f.targets()).some(t=>t.type==='page'&&t.url.startsWith('chrome://settings'));
 assert.equal(await settings(),false,'expected Settings closed before the click');
 assert.equal(await w.native('clickAppMenuCheckForUpdates'),true,'expected Check for Updates… to act');
 await w.waitFor(settings,Boolean,'Check for Updates… opens About in a build with no updater',8000);
 result.checks.push('in a build with no updater, Check for Updates… opens About');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
