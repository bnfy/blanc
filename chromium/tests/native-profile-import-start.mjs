// The Electron profile importer and the Start Page (plan
// docs/superpowers/plans/2026-11-16-electron-profile-importer.md, task 8).
// The layout and the clock are preferences the browser sets. The wallpaper
// choices and the person's image belong to the Start Page's own storage, so
// they wait for the profile's next Start Page, which stores them once.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {makeImportSource,digestTree} from './lib/profile-import-fixture.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,'expected a new output folder');fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-profile-import-start-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const drawn=cdp=>w.waitFor(()=>cdp.eval(`document.body.classList.contains('layout-ready')`),Boolean,'the Start Page drawn',10000);
// A Start Page of the first profile: one already open, else a new tab.
const startPage=async()=>{
 const find=async()=>(await f.targets()).find(t=>t.type==='page'&&/newtab/.test(t.url));
 let t=await find();if(!t){await w.call('newTab');t=await w.waitFor(find,Boolean,'a Start Page',10000);}
 const cdp=await f.connectTarget(t);await drawn(cdp);return cdp;};
const reload=async cdp=>{await cdp.eval(`location.reload()`).catch(()=>{});await new Promise(r=>setTimeout(r,500));await drawn(cdp);};
// What the page shows a person, as its own data call reports it.
const shown=cdp=>cdp.eval(`window.bowserPages.start.data().then(d=>({source:d.wallpaper.source,hasImage:d.wallpaper.hasImage,style:d.wallpaper.style,wash:d.wallpaper.wash,
 preset:d.wallpaper.color.preset,fill:d.wallpaper.color.paint.fill,dynamic:d.dynamicWallpaperEnabled,widgets:{favorites:d.widgets.favorites,devices:d.widgets.devices,shortcuts:d.widgets.shortcuts},
 clock:d.clock?{font:d.clock.newtabClockFont??d.clock.font,weight:d.clock.newtabClockWeight??d.clock.weight}:null}))`,undefined,30000);
const pending=async()=>(await w.native('profileImportState')).startPage??null;
const change=values=>dir=>{const file=path.join(dir,'settings.json'),settings=JSON.parse(fs.readFileSync(file,'utf8'));
 fs.writeFileSync(file,JSON.stringify({...settings,...values}));};
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();

 // 1. Before: Sunrise, no image, Billboard with no widgets.
 let page=await startPage();
 let s=await shown(page);
 assert.deepEqual([s.source,s.hasImage,s.widgets],['sunrise',false,{favorites:false,devices:false,shortcuts:false}]);

 // 2. The import: the layout and the clock are set at once; the wallpaper waits.
 const source=makeImportSource(parent,change({newtabLayout:'ledger',newtabClockFont:'inter',newtabClockWeight:700,
  newtabDynamicWallpaper:true,newtabColorWallpaper:false,newtabWallpaperColor:'rose',newtabWallpaperFill:'solid',
  newtabCustomWallpaper:true,newtabWallpaperWash:40,newtabWallpaperStyle:'dark'}));
 const before=digestTree(source.userData);
 let r=await w.native('profileImportRun',[source.userData]);
 assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(r.errors,[]);
 assert.deepEqual(r.startPage,{layout:true,clock:2,wallpaper:true,image:true});
 const prefs=(await w.native('profileImportPrefs',[['blanc.prototype.start_layout','blanc.prototype.billboard_clock']])).prefs;
 assert.equal(prefs['blanc.prototype.start_layout'],'ledger');
 assert.equal(prefs['blanc.prototype.billboard_clock'].newtabClockFont,'inter');assert.equal(prefs['blanc.prototype.billboard_clock'].newtabClockWeight,700);
 const waiting=await w.waitFor(pending,Boolean,'the wallpaper left for the Start Page',10000);
 assert.deepEqual(waiting,{directory:'Default',image:true,wallpaper:{dynamic:true,color:false,custom:true,preset:'rose',fill:'solid',wash:40,style:'dark'}});
 assert.equal(digestTree(source.userData),before,'expected the released app\'s folder unchanged');
 result.checks.push('the import sets the layout and the clock and leaves the wallpaper choices and image for the Start Page');

 // 3. The next Start Page stores them: the person's image, its wash and style, and the widgets Ledger showed.
 await reload(page);s=await shown(page);
 assert.deepEqual(s,{source:'custom',hasImage:true,style:'dark',wash:40,preset:'rose',fill:'solid',dynamic:true,
  widgets:{favorites:true,devices:true,shortcuts:false},clock:{font:'inter',weight:700}});
 const blob=await page.eval(`(async()=>{const key=JSON.parse(localStorage.getItem('blanc.prototype.start.preferences.v1')).wallpaper.imageKey;
  const db=await new Promise((ok,no)=>{const o=indexedDB.open('blanc.prototype.wallpaper.v1',1);o.onsuccess=()=>ok(o.result);o.onerror=()=>no(o.error);});
  const b=await new Promise((ok,no)=>{const q=db.transaction('images').objectStore('images').get(key);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});db.close();
  const bytes=new Uint8Array(await b.arrayBuffer());return {type:b.type,size:b.size,head:[...bytes.slice(0,3)]};})()`,undefined,30000);
 const original=fs.readFileSync(path.join(source.userData,'wallpaper','current.jpg'));
 assert.deepEqual(blob,{type:'image/jpeg',size:original.length,head:[255,216,255]},'expected the released app\'s own image bytes');
 await w.waitFor(async()=>!(await pending()),Boolean,'nothing left waiting',10000);
 result.checks.push('the next Start Page shows the person\'s image with its wash and style, the clock, and Ledger\'s widgets');

 // 4. Once: a later choice is not overwritten by another load.
 assert.equal(await page.eval(`window.bowserPages.start.setWallpaper('sunrise').then(v=>v.source)`,undefined,30000),'sunrise');
 await reload(page);s=await shown(page);
 assert.deepEqual([s.source,s.dynamic],['sunrise',false],'expected the later choice kept');
 result.checks.push('the choices are taken once; a later change stays');

 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
