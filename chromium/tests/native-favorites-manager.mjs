// The Favorites manager (F63, V30): #1614's page in a tab of its own, its
// calls answered from Chromium's bookmark model. Opens the tab from its
// command and a typed address, then creates, nests, moves, reorders,
// renames, edits and removes through the page's own window.bowserPages,
// reading the result back through the Island's Favorites list.
//   node chromium/tests/native-favorites-manager.mjs CONFIG OUT
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {tabPage} from './adapters/core.mjs';
import {createWorld} from './world.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-favorites-manager-'));
const SEP=' › ';
const ids=async()=>(await w.snapshot()).tabs.map(t=>String(t.id));
const list=async()=>w.api('listFavorites');
const record=async url=>(await list()).find(item=>item.url===url);
let page;
// One call on the page's bridge, as the page makes it.
const call=(member,...args)=>page.evalExpression(`window.bowserPages.bookmarks.${member}(...${JSON.stringify(args)})`);
const tree=()=>call('tree');
const folderIn=(node,name)=>node.children.find(c=>c.kind==='folder'&&c.folder.name===name)?.folder;
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));
 await w.reset();
 const urls=['a','b','c'].map(n=>f.base+'/'+n);
 for(const [i,url] of urls.entries())await w.call('seedFavorite',url,'Favorite '+'ABC'[i]);

 // The command opens the Favorites tab; again, it switches to it.
 const before=await ids();
 assert.equal(await w.native('previewPageCommand',['bookmarks']),true);
 let s=await w.waitForState(x=>x.tabs.length===before.length+1&&x.tabs.find(t=>t.id===x.activeTabId)?.url==='blanc://bookmarks/',{timeout:10000});
 const favoritesTab=String(s.activeTabId);
 await w.waitFor(()=>w.call('favoritesPageReady'),Boolean,'the Favorites tab to load',10000);
 const sheet=await w.hostEval('window.BlancPrototypeHost.sheetState()');
 assert.equal(!!sheet?.visible,false,'no sheet');
 await w.call('activateTab',before[0]);await w.waitForState(x=>String(x.activeTabId)===before[0]);
 await w.api('navigate',[before[0],'blanc://bookmarks']);
 await w.waitForState(x=>String(x.activeTabId)===favoritesTab&&x.tabs.length===before.length+1);
 result.checks.push('the command and a typed blanc://bookmarks open, then switch to, one Favorites tab');

 page=await tabPage(w,favoritesTab);
 await w.waitFor(()=>page.evalExpression(`document.body.classList.contains('fav-page')&&document.body.classList.contains('fav-manager-page')&&!document.getElementById('manager').hidden`),Boolean,'the manager to draw',10000);
 assert.deepEqual(await call('capabilities'),{editable:true,tree:true,import:true});
 result.checks.push('the page draws the manager as a full page and reports the tree');

 // Folders, nested and found again without regard to case.
 assert.deepEqual(await call('createFolder',null,'Work'),{ok:true,path:'Work'});
 assert.deepEqual(await call('createFolder','Work','Clients'),{ok:true,path:'Work'+SEP+'Clients'});
 assert.deepEqual(await call('createFolder',null,'work'),{ok:true,path:'Work'});
 assert.equal((await call('createFolder','Nowhere','X')).error,'missing');
 assert.equal((await call('createFolder',null,'x'.repeat(101))).error,'invalid');
 let t=await tree();
 assert.ok(folderIn(folderIn(t,'Work'),'Clients'),'Clients is inside Work');
 result.checks.push('folders nest; a name in any case finds the same folder; a missing parent is refused');

 const a=await record(urls[0]),b=await record(urls[1]),c=await record(urls[2]);
 assert.deepEqual(await call('move',[a.id],'Work'+SEP+'Clients'),{ok:true});
 assert.equal((await record(urls[0])).folder,'Work'+SEP+'Clients');
 t=await tree();
 assert.deepEqual(folderIn(folderIn(t,'Work'),'Clients').children.map(x=>x.item?.url),[urls[0]]);
 result.checks.push('a favorite moves into a nested folder, and its folder is the whole path');

 // Order: the top level's favorites, reversed.
 const top=(await tree()).children;
 const keys=[...top.filter(x=>x.kind==='folder'),...top.filter(x=>x.kind==='favorite').reverse()].map(x=>x.key);
 assert.deepEqual(await call('reorder',null,keys),{ok:true});
 const order=(await tree()).children.filter(x=>x.kind==='favorite').map(x=>x.item.url);
 assert.deepEqual(order,top.filter(x=>x.kind==='favorite').reverse().map(x=>x.item.url));
 result.checks.push('reordering a folder\'s children keeps the order given');

 // Rename, a cycle refused, and removing a folder moves its contents up.
 assert.deepEqual(await call('renameFolder','Work'+SEP+'Clients','Accounts'),{ok:true,path:'Work'+SEP+'Accounts'});
 assert.equal((await record(urls[0])).folder,'Work'+SEP+'Accounts');
 assert.equal((await call('moveFolder','Work','Work'+SEP+'Accounts')).error,'cycle');
 assert.deepEqual(await call('removeFolder','Work'),{ok:true});
 t=await tree();
 assert.equal(folderIn(t,'Work'),undefined);
 assert.ok(folderIn(t,'Accounts'),'Accounts moved up');
 assert.equal((await record(urls[0])).folder,'Accounts');
 result.checks.push('rename, a refused cycle, and removing a folder keeps what was in it');

 // Edit: name and address; a taken or non-web address is refused; a pin follows.
 assert.deepEqual(await page.evalExpression(`window.bowserPages.pins.pin(${JSON.stringify(a.url)},'A')`),{ok:true});
 let changed=0;
 await page.evalExpression(`window.__changes=0;window.bowserPages.bookmarks.onChanged(()=>{window.__changes+=1;});true`);
 const edited=await call('edit',a.id,{title:'Acme',url:'example.org/acme'});
 assert.equal(edited.ok,true);assert.equal(edited.key,'n:'+a.id);
 const acme=await record('https://example.org/acme');
 assert.equal(acme?.title,'Acme');assert.equal(await record(urls[0]),undefined);
 assert.equal((await call('edit',a.id,{url:b.url})).error,'exists');
 assert.equal((await call('edit',a.id,{url:'javascript:alert(1)'})).error,'invalid-url');
 const pins=await page.evalExpression('window.bowserPages.pins.list()');
 assert.deepEqual(pins.pins.map(p=>p.url),['https://example.org/acme']);
 changed=await w.waitFor(()=>page.evalExpression('window.__changes'),n=>n>0,'a change notice',5000);
 result.checks.push('editing changes the name and address, refuses a taken or non-web address, and the pin follows');

 assert.deepEqual(await call('remove',b.id),{ok:true});
 assert.deepEqual(await call('removeMany',[c.id]),{ok:true});
 assert.equal(await record(b.url),undefined);assert.equal(await record(c.url),undefined);
 result.checks.push('remove and removeMany delete favorites');
 result.changeNotices=changed;
 await assertRendering(e=>f.host.eval(e));result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
