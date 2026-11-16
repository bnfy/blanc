// The Electron profile importer, task 2 (plan
// docs/superpowers/plans/2026-11-16-electron-profile-importer.md): the
// Personal profile's Favorites, history, site icons, Start Page pins, Tab
// Archive and Spaces come across from an Electron Blanc data folder, which is
// left byte for byte as it was. The source is always the synthetic fixture in
// a temporary folder; no real profile, Keychain item or network is touched.
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
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-profile-import-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const run=dir=>w.native('profileImportRun',[dir]);
const AT=1794614400000;
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();

 // The test's own pages are already in history; imports are counted from here.
 const base=await w.native('profileImportHistoryCount');
 // 1. A damaged store: nothing of that profile is imported, and the store is named.
 const damaged=makeImportSource(parent,dir=>fs.writeFileSync(path.join(dir,'workspaces.json'),'{"workspaces": [}'));
 let r=await run(damaged.userData);
 assert.equal(r.ok,true);assert.deepEqual(r.errors,[{profile:'personal',store:'workspaces.json',reason:'invalid-json'}]);
 assert.equal(r.profiles.personal,undefined,'expected the damaged profile not imported');
 assert.equal((await w.api('listFavorites')).length,0,'expected no Favorite from a failed profile');
 assert.equal(await w.native('profileImportHistoryCount'),base,'expected no history from a failed profile');
 assert.deepEqual((await w.native('profileImportState')).profiles??{},{});
 result.checks.push('a damaged store leaves its profile untouched and is named in the result');

 // 2. Refusals: not a Blanc folder, and a source older than v1.40.0.
 const empty=path.join(parent,'empty');fs.mkdirSync(empty);
 assert.deepEqual(await run(empty),{ok:false,error:'no-source'});
 const old=makeImportSource(parent,dir=>{const file=path.join(dir,'settings.json');fs.writeFileSync(file,JSON.stringify({...JSON.parse(fs.readFileSync(file,'utf8')),lastRunVersion:'1.39.2'}));});
 assert.deepEqual(await run(old.userData),{ok:false,error:'unsupported-version',sourceVersion:'1.39.2'});
 assert.deepEqual(await run(path.join(parent,'missing')),{ok:false,error:'no-source'});
 result.checks.push('a folder that is not Blanc\'s, and one older than v1.40.0, are refused whole');

 // 3. The fixture: the Personal profile comes across.
 const source=makeImportSource(parent,dir=>{const file=path.join(dir,'settings.json');
  fs.writeFileSync(file,JSON.stringify({...JSON.parse(fs.readFileSync(file,'utf8')),islandSize:'large',islandHoverOpen:true,tabSleep:'6h',pageZoom:125,
   surfaceStyle:'bogus',tabSwitchOrder:'list',bangsEnabled:false,adblockExceptions:['example.org']}));});
 const before=digestTree(source.userData);
 r=await run(source.userData);
 assert.equal(r.ok,true,JSON.stringify(r).slice(0,400));assert.equal(r.sourceVersion,'1.49.1');assert.deepEqual(r.errors,[]);
 assert.deepEqual(r.profiles.personal,{favorites:2,history:5000,siteIcons:1,pins:1,archive:1,spaces:1});
 const favorites=await w.api('listFavorites');
 assert.deepEqual(favorites.map(x=>[x.url,x.title,x.folder??null]),[['https://personal.example.com/zeta','Zeta','Reading'],['https://personal.example.com/alpha','Alpha',null]]);
 assert.ok(!favorites.some(x=>/removed/.test(x.url)),'expected no tombstoned Favorite');
 result.checks.push('Favorites come across in order, with their folder, without tombstones');

 // 4. History: 5,000 visits with their own times and titles.
 assert.equal(await w.native('profileImportHistoryCount'),base+5000);
 const recent=(await w.api('listHistory',[{limit:20}])).filter(x=>x.url.startsWith('https://example.com/personal/')).slice(0,5);
 assert.deepEqual(recent.map(x=>[x.url,x.title]),[0,1,2,3,4].map(i=>[`https://example.com/personal/visit-${i}`,`Visit ${i}`]));
 const when=recent.map(x=>x.visitedAt??x.time??x.lastVisit);
 assert.deepEqual(when,[0,1,2,3,4].map(i=>AT-i),'expected each visit\'s own time: '+JSON.stringify(recent[0]));
 result.checks.push('history has the 5,000 newest visits with their own times and titles');

 // 5. Pins and the archive.
 assert.deepEqual(await w.native('profileImportPins'),[{url:'https://personal.example.com/pin',title:'Pinned fixture'}]);
 const archived=await w.api('archiveList');
 assert.deepEqual(archived.map(x=>[x.id,x.url,x.title,x.archivedAt,x.spaceName]),[[`arch-${AT}-1`,'https://personal.example.com/archived','Saved reading',AT,'Fixture space']]);
 result.checks.push('the Start Page pin and the archived tab come across');

 // 6. The Space, by name, with its tab.
 const spaces=(await w.api('listWorkspaces')).items;
 assert.deepEqual(spaces.map(x=>[x.name,x.tabCount]),[['Fixture space',1]]);
 const space=await w.native('profileImportSpace',[spaces[0].id]);
 assert.deepEqual(space.tabs.map(t=>[t.url,t.pinned,t.group]),[['https://named.example.com/page',false,-1]]);
 assert.equal(space.color,'#426c4c');assert.equal(space.symbol,'book');
 result.checks.push('the Space comes across with its name, color, symbol and tab');

 // 7. Settings and the install id.
 assert.equal(r.settings.synced>=3,true,JSON.stringify(r.settings));assert.deepEqual(r.settings.refused,[]);
 assert.deepEqual(r.settings.skipped,[{key:'surfaceStyle',reason:'invalid-value'}]);assert.equal(r.install,true);
 const names=['blanc.island.size','blanc.island.hover_open','blanc.prototype.quiet_delay','blanc.page_zoom','blanc.tabs.switch_order',
  'blanc.appearance.surface_style','blanc.telemetry.usage_ping','blanc.first_run.completed_at','blanc.telemetry.install'];
 const read=await w.native('profileImportPrefs',[names]);
 assert.deepEqual(read.prefs,{'blanc.island.size':'large','blanc.island.hover_open':true,'blanc.prototype.quiet_delay':'6h','blanc.page_zoom':125,
  'blanc.tabs.switch_order':'list','blanc.appearance.surface_style':'sunrise','blanc.telemetry.usage_ping':false,
  'blanc.first_run.completed_at':1794528000000,
  'blanc.telemetry.install':{id:'99999999-9999-4999-8999-999999999999',createdAt:1794528000000,day1Default:false,day1Browsed:true}});
 assert.equal(read.synced.theme,'dark');assert.equal(read.synced.bangsEnabled,false);assert.deepEqual(read.synced.adblockExceptions,['example.org']);
 result.checks.push('settings land in their preferences (a value the fork would refuse is skipped), and the install id is kept');

 // 8. The source is untouched, and a second run adds nothing.
 assert.equal(digestTree(source.userData),before,'expected the Electron folder byte for byte as it was');
 const state=await w.native('profileImportState');
 assert.equal(state.sourceVersion,'1.49.1');assert.deepEqual(Object.keys(state.profiles),['personal']);
 r=await run(source.userData);
 assert.equal(r.ok,true);assert.deepEqual(r.profiles,{},'expected nothing imported twice');assert.deepEqual(r.alreadyImported,['personal']);
 assert.equal((await w.api('listFavorites')).length,2);assert.equal(await w.native('profileImportHistoryCount'),base+5000);
 assert.equal((await w.api('listWorkspaces')).items.length,1);
 assert.equal(digestTree(source.userData),before);
 result.checks.push('the Electron folder is unchanged, and a second run imports nothing again');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
