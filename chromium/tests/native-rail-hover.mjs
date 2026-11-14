// Rail hover previews (docs/superpowers/specs/2026-11-14-rail-hover-previews-design.md),
// on a real build: with vertical tabs, a rest on a tab row shows the picture
// card with Chromium's thumbnail; the next row swaps it at once; leaving the
// rail closes it; a collapsed group's header shows the list card, whose row
// shows the picture card beside it and opens the group on a click; a private
// tab's card has no picture; a split row shows each pane; a key typed in
// the page closes the card; Dark draws the dark card.
//   node chromium/tests/native-rail-hover.mjs <runtime-config.json> <out>
// Moves are simulated on the Island host; a real mouse over the test window
// sends its own, so run it where nobody is using the mouse. Screen captures
// (screencapture) need the test window in front.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {tabPage} from './adapters/core.mjs';
import {jsLiteral} from './lib/js-literal.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-rail-hover-'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const STRIP="document.getElementById('strip').contentDocument";
const box=sel=>w.hostEval(`(()=>{const s=document.getElementById('strip').getBoundingClientRect(),e=${STRIP}.querySelector(${jsLiteral(sel)});
 if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+s.x,y:r.y+s.y,width:r.width,height:r.height,cx:r.x+s.x+r.width/2,cy:r.y+s.y+r.height/2};})()`);
const card=kind=>w.hostEval(`(()=>{const c=document.querySelector('.rail-card-${kind}');if(!c||c.hidden||!c.classList.contains('shown'))return null;
 const r=c.getBoundingClientRect(),img=c.querySelector('.rail-card-image img');
 return {x:r.x,y:r.y,width:r.width,height:r.height,title:c.querySelector('.rail-card-title')?.textContent??null,
  host:c.querySelector('.rail-card-host')?.textContent??null,image:img?img.src.slice(0,23):null,images:c.querySelectorAll('.rail-card-image').length,
  private:c.dataset.private,rows:[...c.querySelectorAll('.rail-card-row')].map(e=>e.textContent),bg:getComputedStyle(c).backgroundColor};})()`);
const move=(x,y)=>f.host.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:Math.round(x),y:Math.round(y),button:'none',buttons:0});
let bounds=null;
const shot=async name=>{
 bounds??=await w.call('windowContentBounds');
 await pause(300); // past the card's 120ms fade in
 execFileSync('screencapture',['-x',`-R${bounds.x},${bounds.y},${Math.min(bounds.width,1100)},${Math.min(bounds.height,620)}`,path.join(out,name+'.png')]);
};
const check=text=>{result.checks.push(text);console.log('ok -',text);};
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:process.env.DISK_ASSETS==="1"});
 await installDriver(f.host);await assertRendering(e=>f.host.eval(e));await w.reset();
 const colors={red:'#d64545',green:'#2f9e6a',blue:'#3b6fd6',amber:'#d69a2f',grey:'#8a8f98',purple:'#7a4fd6'};
 f.server.removeAllListeners('request');
 f.server.on('request',(q,r)=>{const name=q.url.slice(1).split('?')[0]||'grey';
  r.writeHead(200,{'content-type':'text/html'});
  if(name==='links')return r.end('<title>Links page</title><a id="purple" href="/purple" style="font:60px system-ui">purple</a>');
  r.end(`<title>${name[0].toUpperCase()+name.slice(1)} page</title><body style="margin:0;background:${colors[name]??'#888'};font:48px system-ui;color:#fff"><h1 style="margin:40px">${name}</h1></body>`);});
 const ids={};
 for(const name of ['red','green','blue','amber'])ids[name]=String(await w.call('openTab',f.base+'/'+name));
 // Each page goes to the background once, so Chromium takes its picture.
 for(const name of ['red','green','blue','amber']){await w.api('switchTab',[ids[name]]);await pause(700);}
 await w.api('setTabLayout',['vertical']);
 await w.api('switchTab',[ids.amber]);
 const page=await tabPage(w,ids.amber);await page.bringToFront();
 await w.waitFor(()=>w.snapshot(),s=>s.windowActive===true,'the test window in front',4000);
 execFileSync('osascript',['-e',`tell application "System Events" to set frontmost of (first process whose unix id is ${f.process.pid}) to true`]);
 await pause(800);
 const row=id=>box(`#verticalTabsRail .vertical-tab-primary[data-tab-id="${id}"]`);
 const rail=await box('#verticalTabsRail');assert.ok(rail,'the vertical rail shows');
 const away=async()=>{await move(rail.x+rail.width+400,rail.y+300);await pause(400);};

 // A rest on a background tab's row: the picture card, with Chromium's picture.
 const red=await row(ids.red);await move(red.cx,red.cy);
 await pause(250);assert.equal(await card('picture'),null,'no card before the rest');
 const first=await w.waitFor(()=>card('picture'),Boolean,'the picture card',2000);
 assert.equal(first.title,'Red page');assert.match(first.host,/^127\.0\.0\.1:\d+$/);
 assert.ok(first.x>=rail.x+rail.width,'beside the rail');
 const pictured=await w.waitFor(()=>card('picture'),c=>c?.image==='data:image/jpeg;base64,','Chromium\'s picture',4000);
 result.picture=pictured;await shot('1-tab-card-light');
 check('a rest on a tab row shows its card beside the rail, with Chromium\'s picture of the page');

 // The next row swaps the card at once.
 const green=await row(ids.green);await move(green.cx,green.cy);await pause(120);
 assert.equal((await card('picture'))?.title,'Green page','swapped within 120ms');
 check('the next row swaps the card at once');

 // Leaving the rail closes it after the grace.
 await away();assert.equal(await card('picture'),null);
 check('leaving the rail closes the card');

 // The current tab: title and host, no picture.
 const amber=await row(ids.amber);await move(amber.cx,amber.cy);
 const current=await w.waitFor(()=>card('picture'),Boolean,'the current tab\'s card',2000);
 assert.equal(current.images,0,'no picture of the page already in view');
 check('the current tab\'s card has no picture');

 // A key typed into the page closes the card.
 await page.keyboard.press('a');
 await w.waitFor(()=>card('picture'),c=>c===null,'the card closing on a page key',2000);
 check('a key typed into the page closes the card');
 await away();
 const front=()=>execFileSync('osascript',['-e',`tell application "System Events" to set frontmost of (first process whose unix id is ${f.process.pid}) to true`]);

 // Another app in front (⌘-Tab with the page focused) closes the card.
 front();await w.waitFor(()=>w.snapshot(),s=>s.windowActive===true,'the test window in front',4000);await pause(400);
 await move(green.cx,green.cy);
 await w.waitFor(()=>card('picture'),Boolean,'a card before switching apps',2000);
 execFileSync('osascript',['-e','tell application "Finder" to activate']);
 await w.waitFor(()=>card('picture'),c=>c===null,'the card closing when another app is in front',3000);
 front();await w.waitFor(()=>w.snapshot(),s=>s.windowActive===true,'the test window in front again',4000);await away();
 check('another app coming to the front closes the card');

 // A site's permission prompt closes the card.
 await move(green.cx,green.cy);
 await w.waitFor(()=>card('picture'),Boolean,'a card before the prompt',2000);
 await page.evaluate('navigator.geolocation.getCurrentPosition(()=>{},()=>{})');
 await w.waitFor(()=>card('picture'),c=>c===null,'the card closing for the permission prompt',3000);
 const prompt=await w.waitFor(()=>w.hostEval("!document.getElementById('permission').hidden"),Boolean,'the permission prompt',3000);
 assert.ok(prompt);
 check('a permission prompt closes the card');
 await w.hostEval("document.getElementById('permission').contentDocument.querySelector('button')?.click()");
 await w.waitFor(()=>w.hostEval("document.getElementById('permission').hidden"),Boolean,'the prompt answered',3000).catch(()=>{});
 await away();

 // Dark.
 await f.host.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
 await move(green.cx,green.cy);
 const dark=await w.waitFor(()=>card('picture'),c=>c?.image,'the dark card',4000);
 assert.equal(dark.bg,'rgb(31, 31, 31)');await shot('2-tab-card-dark');
 await away();
 await f.host.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
 check('Dark draws the dark card');

 // A collapsed group: the list card, then a row's picture beside it.
 await w.api('groupTabByName',[ids.red,'Reading']);await w.api('groupTabByName',[ids.blue,'Reading']);
 let snap=await w.snapshot();const group=snap.groups.find(g=>g.name==='Reading');assert.ok(group,'the group');
 await w.api('toggleGroupCollapsed',[String(group.id)]);
 await w.waitFor(()=>w.snapshot(),s=>s.groups.find(g=>g.id===group.id)?.collapsed,'the group collapsed',3000);
 await pause(400);
 const header=await box(`#verticalTabsRail [data-drag-header][data-group-id="${group.id}"]`);assert.ok(header,'the group header');
 await move(header.cx,header.cy);
 const list=await w.waitFor(()=>card('list'),Boolean,'the list card',2000);
 assert.deepEqual(list.rows,['Red page','Blue page']);
 const listRow=await w.hostEval(`(()=>{const r=document.querySelector('.rail-card-row[data-tab-id="${ids.blue}"]').getBoundingClientRect();return {cx:r.x+r.width/2,cy:r.y+r.height/2};})()`);
 await move(header.x+header.width-4,header.cy);await move(list.x+10,header.cy);await move(listRow.cx,listRow.cy);
 const inList=await w.waitFor(()=>card('picture'),c=>c?.title==='Blue page','the list row\'s picture card',2500);
 assert.ok(inList.x>=list.x+list.width,'beside the list card');
 await w.waitFor(()=>card('picture'),c=>c?.image,'the list row\'s picture',4000);
 await shot('3-group-list-and-picture');
 check('a collapsed group\'s header shows the list card, and its row shows the picture card beside it');
 await f.host.send('Input.dispatchMouseEvent',{type:'mousePressed',x:Math.round(listRow.cx),y:Math.round(listRow.cy),button:'left',buttons:1,clickCount:1});
 await f.host.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:Math.round(listRow.cx),y:Math.round(listRow.cy),button:'left',buttons:0,clickCount:1});
 snap=await w.waitFor(()=>w.snapshot(),s=>String(s.activeTabId)===ids.blue,'the row\'s tab current',3000);
 assert.equal(snap.groups.find(g=>g.id===group.id).collapsed,false,'the group opened');
 assert.equal(await card('list'),null);
 check('clicking a list row opens the group and switches to that tab');
 await away();

 // A private tab: no picture, ever.
 await w.api('createTab',[f.base+'/grey',{private:true}]);
 snap=await w.snapshot();const priv=snap.tabs.find(t=>t.private);assert.ok(priv,'a private tab');
 await w.api('switchTab',[ids.amber]);await pause(800);
 const privRow=await row(priv.id);await move(privRow.cx,privRow.cy);
 const privCard=await w.waitFor(()=>card('picture'),Boolean,'the private card',2000);
 await pause(600);const privAfter=await card('picture');
 assert.equal(privAfter.private,'true');assert.equal(privAfter.images,0,'no picture');
 const chip=await w.hostEval(`${STRIP}.querySelector('#verticalTabsRail .vertical-tab-private')?.textContent??null`);
 assert.equal(privAfter.host.split(' · ')[1],chip,'the card names it as the rail\'s chip does');
 await shot('4-private-card');
 check('a private tab\'s card shows no picture');
 await away();

 // A split row: one picture per pane.
 await w.api('createSplit',[ids.green,ids.red]);await w.api('switchTab',[ids.amber]);await pause(800);
 snap=await w.snapshot();const split=snap.splits?.find(s=>s.tabIds.map(String).includes(ids.green));assert.ok(split,'the split');
 const splitRow=await box(`#verticalTabsRail .vertical-split-row[data-split-id="${split.id}"]`);assert.ok(splitRow,'the split row');
 await move(splitRow.cx,splitRow.cy);
 const splitCard=await w.waitFor(()=>card('picture'),c=>c?.images===2,'the split card',3000);
 assert.equal(splitCard.title,'Green page + Red page','the split row\'s own label');
 await pause(800);await shot('5-split-card');
 result.split=splitCard;check('a split row\'s card shows each pane');
 await away();
 // Pictures ahead of time: a tab opened in the background and never shown
 // has its picture by the time its first card opens.
 const links=String(await w.call('openTab',f.base+'/links'));
 const linksPage=await tabPage(w,links);await linksPage.bringToFront();await pause(800);
 await linksPage.locator('#purple').click({modifiers:['Meta']});
 snap=await w.waitFor(()=>w.snapshot(),s=>s.tabs.some(t=>/\/purple$/.test(t.url)&&!t.isLoading),'the background tab loaded',5000);
 const purple=snap.tabs.find(t=>/\/purple$/.test(t.url));assert.notEqual(String(snap.activeTabId),String(purple.id),'opened in the background');
 await pause(2500);
 let purpleRow=await row(purple.id);await move(purpleRow.cx,purpleRow.cy);
 const firstCard=await w.waitFor(()=>card('picture'),Boolean,'the background tab\'s card',2000);
 assert.equal(firstCard.image,'data:image/jpeg;base64,','the picture is there as the card opens');
 await shot('6-background-tab-card');
 check('a tab opened in the background has its picture when its first card opens');
 await away();

 // The card's picture watch never holds a quiet tab: Chromium doesn't quiet
 // a tab while its thumbnail is being drawn, so the tab under a card stays
 // awake (the others go quiet) and goes quiet once the card has closed.
 const asleepNow=async id=>(await w.snapshot()).tabs.find(t=>String(t.id)===String(id)).asleep;
 purpleRow=await row(purple.id);await move(purpleRow.cx,purpleRow.cy);
 await w.waitFor(()=>card('picture'),c=>c?.image,'the awake tab\'s card',3000);
 await w.api('sleepBackgroundTabs');
 await w.waitFor(()=>w.snapshot(),s=>s.tabs.find(t=>String(t.id)===String(ids.green))?.asleep,'the other background tabs quiet',8000);
 assert.equal(await asleepNow(purple.id),false,'the tab under the card stays awake');
 assert.ok(await card('picture'),'its card stays');
 await away();
 await w.api('sleepBackgroundTabs');
 await w.waitFor(()=>w.snapshot(),s=>s.tabs.find(t=>String(t.id)===String(purple.id))?.asleep,'the tab quiet once its card closed',8000);
 check('the tab under a card stays awake while it shows, and goes quiet once it closes');

 // A quiet tab: its card shows the picture Chromium kept, and the rest
 // doesn't wake it.
 const quietRow=await row(purple.id);await move(quietRow.cx,quietRow.cy);
 const quietCard=await w.waitFor(()=>card('picture'),c=>c?.image,'the quiet tab\'s card with its kept picture',3000);
 assert.match(quietCard.host,/ · quiet$/,'named quiet as the rail\'s states say it');
 await pause(2000);
 assert.equal((await w.snapshot()).tabs.find(t=>String(t.id)===String(purple.id)).asleep,true,'still quiet after the rest');
 await shot('7-quiet-tab-card');
 check('a quiet tab\'s card shows the picture Chromium kept, and resting on it doesn\'t wake it');
 await away();
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,1));
 console.log(`${result.checks.length} checks passed on ${config.candidate}`);
}finally{await f.close();fs.rmSync(parent,{recursive:true,force:true});}
