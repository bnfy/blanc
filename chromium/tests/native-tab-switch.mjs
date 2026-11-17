// F59, Ctrl+Tab by most recent use (shipping's tab-switcher.js and the
// MRU switcher spec, docs/superpowers/specs/2026-10-24-mru-tab-switcher-design.md).
// The keys are real NSEvents posted to the app's own queue for its window
// (postTabSwitchKey), so Chromium's Select Next Tab command, the fork's
// TabSwitchCommand and its Control-release watcher all run. Nothing leaves
// the process. Shipping: nothing changes until Control comes up; the card
// waits 150 ms or a second Tab (main.js SWITCHER_CARD_DELAY_MS); Ctrl+W closes
// the pick; Esc cancels; Ctrl+PageDown and "list" go by position.
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
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-tab-switch-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const key=async name=>assert.equal(await w.native('postTabSwitchKey',[name]),true,'postTabSwitchKey '+name);
const state=()=>w.hostEval('window.BlancPrototypeHost.tabSwitchState()');
const active=async()=>String((await w.snapshot()).activeTabId);
const order=async()=>(await w.snapshot()).tabs.map(t=>String(t.id));
const until=(read,ok,what)=>w.waitFor(read,ok,what,5000);
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 f.server.removeAllListeners('request');f.server.on('request',(q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(`<title>${q.url.slice(1)}</title><p>${q.url}</p>`);});
 assert.equal(await w.native('setTabSwitchOrder',['recent']),'recent');
 const ids={};
 for(const name of ['a','b','c'])ids[name]=String(await w.call('openTab',f.base+'/'+name));
 // Used in the order a, b, c: c is current, b the one before.
 for(const name of ['a','b','c']){await w.call('activateTab',ids[name]);await until(active,id=>id===ids[name],'tab '+name+' current');await sleep(60);}

 await key('ctrlDown');await key('tab');
 let s=await until(state,s=>s.pick===ids.b,'the first Tab picks the previous tab');
 assert.equal(s.card,false,'a first Tab does not show the card at once');
 assert.equal(await active(),ids.c,'expected nothing to change before Control comes up');
 s=await until(state,s=>s.card===true,'the card shows once Control has been held 150 ms');
 assert.equal(await active(),ids.c,'expected the card to change nothing');
 await key('ctrlUp');await until(active,id=>id===ids.b,'Control up lands on the previous tab');
 assert.deepEqual(await state(),{pick:null,order:null,card:false},'expected the switch and its card gone after landing');
 result.checks.push('Ctrl+Tab picks the previously used tab, changes nothing while Control is held, shows the card after a hold, and lands on Control up');

 // Now b, c, a by last use.
 await key('ctrlDown');await key('tab');await key('tab');
 s=await until(state,s=>s.pick===ids.a&&s.card===true,'a second Tab picks the tab before and shows the card at once');
 assert.deepEqual(s.order.slice(0,3),[ids.b,ids.c,ids.a],'expected the order by last use, current first');
 assert.equal(await active(),ids.b);
 await key('shiftTab');await until(state,s=>s.pick===ids.c,'Shift+Tab steps back toward the current tab');
 await key('ctrlUp');await until(active,id=>id===ids.c,'landing on the Shift+Tab pick');
 result.checks.push('more Tabs walk back by last use, Shift+Tab walks forward, and the card shows at once on the second Tab');

 // A tap: down, Tab, up with no hold lands without the card ever showing.
 await key('ctrlDown');await key('tab');await key('ctrlUp');
 await until(active,id=>id===ids.b,'a tap returns to the previous tab');
 assert.equal((await state()).card,false,'expected no card after a tap');
 await sleep(300);assert.equal((await state()).card,false,'expected no late card after a tap');
 result.checks.push('a quick Ctrl+Tab tap flips to the previous tab and never shows the card');

 await key('ctrlDown');await key('tab');await until(state,s=>s.pick===ids.c,'pick before Esc');
 await key('escape');await until(state,s=>s.pick===null&&s.card===false,'Esc ends the switch');
 await key('ctrlUp');await sleep(300);
 assert.equal(await active(),ids.b,'expected Esc to stay on the current tab');
 result.checks.push('Esc cancels: Control up afterward changes nothing');

 await key('ctrlDown');await key('tab');await key('tab');await until(state,s=>s.pick===ids.a,'pick before another key');
 await key('a');await until(state,s=>s.pick===null,'another key ends the switch');
 await key('ctrlUp');await sleep(300);assert.equal(await active(),ids.b,'expected another key to cancel the switch');
 result.checks.push('any other key cancels the switch');

 // Ctrl+W closes the picked tab, not the current one, and the pick moves on.
 await key('ctrlDown');await key('tab');await until(state,s=>s.pick===ids.c,'pick before Ctrl+W');
 await key('w');
 await until(order,tabs=>!tabs.includes(ids.c)&&tabs.includes(ids.b)&&tabs.includes(ids.a),'Ctrl+W closes the picked tab only');
 s=await until(state,s=>s.pick===ids.a,'the pick moves to the next older tab');
 assert.equal(await active(),ids.b,'expected the current tab kept');
 await key('ctrlUp');await until(active,id=>id===ids.a,'landing on the moved pick');
 result.checks.push('Ctrl+W during a switch closes the picked tab and moves the pick one step older');

 // A click on a card entry lands on it at once and ends the switch.
 await key('ctrlDown');await key('tab');await key('tab');
 s=await until(state,s=>s.card===true&&s.order?.length>=2,'the card before a click');
 const want=s.order[s.order.length-1];
 const clicked=await w.hostEval(`(()=>{const d=document.getElementById('overlay').contentDocument,tiles=[...d.querySelectorAll('.switcher-tile')];
  const tile=tiles[tiles.length-1];if(!tile)return false;tile.dispatchEvent(new d.defaultView.MouseEvent('mousedown',{bubbles:true,cancelable:true}));return tiles.length;})()`);
 assert.equal(clicked,s.order.length,`expected one card tile per tab in the order (${s.order.length}); found ${clicked}`);
 await until(active,id=>id===want,'a click on a card entry lands on that tab');
 await until(state,s=>s.pick===null&&s.card===false,'the click ends the switch');
 await key('ctrlUp');await sleep(200);assert.equal(await active(),want,'expected Control up after a click to change nothing');
 result.checks.push('the card draws one tile per tab, and a click on a tile lands on that tab at once');

 // By position: the setting on "list" leaves Chromium's own step.
 assert.equal(await w.native('setTabSwitchOrder',['list']),'list');
 const tabs=await order(),at=tabs.indexOf(await active()),next=tabs[(at+1)%tabs.length];
 await key('ctrlDown');await key('tab');await until(active,id=>id===next,'list order moves to the next tab by position at once');
 assert.equal((await state()).pick,null,'expected no switch session in list order');
 await key('ctrlUp');await sleep(200);assert.equal(await active(),next);
 result.checks.push('with the setting on "list", Ctrl+Tab moves by position at once');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
