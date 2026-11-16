// X2, the protected-video notice (replacement spec D3; owner's design,
// 2026-11-16): a page that asks for protected playback gets a notice under
// the Island with Not now and Open in Blanc. Blanc Beta has no Widevine, so
// the request itself is the signal. Nothing leaves the machine: the pages are
// this test's own, and a test launch records the handoff instead of starting
// the Electron app.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,'expected a new output folder');fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-protected-media-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const here=path.dirname(fileURLToPath(import.meta.url));
const own=JSON.parse(fs.readFileSync(path.join(here,'../blanc/fork-strings.json'),'utf8'));
const shipping=JSON.parse(fs.readFileSync(path.join(here,'../../copy/messages/en.json'),'utf8'));
const text=key=>own[key]?.en??shipping[key].message;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// A page that asks for Widevine, as a streaming site does, and one that asks for nothing.
const serve=(q,r)=>{r.writeHead(200,{'content-type':'text/html'});
 r.end(q.url.startsWith('/protected')
  ?`<title>Protected</title><video></video><script>navigator.requestMediaKeySystemAccess('com.widevine.alpha',[{initDataTypes:['cenc'],videoCapabilities:[{contentType:'video/mp4; codecs="avc1.42E01E"'}]}]).then(()=>{document.title='granted'},e=>{document.title='refused '+e.name});</script>`
  :`<title>Plain ${q.url}</title><p>${q.url}</p>`);};
// The notice as a person reads it.
const notice=()=>w.hostEval(`(()=>{const frame=document.getElementById('protectedNotice');const d=frame.contentDocument;
 if(frame.hidden||!d||d.readyState!=='complete'||!d.getElementById('protectedOpen'))return {visible:false};
 const r=frame.getBoundingClientRect(),strip=document.getElementById('strip').getBoundingClientRect();
 return {visible:true,title:d.getElementById('protectedTitle').textContent,body:d.getElementById('protectedBody').textContent,
  buttons:[...d.querySelectorAll('button')].map(b=>b.textContent.trim()),belowIsland:r.top>=strip.bottom,centered:Math.abs((r.left+r.width/2)-innerWidth/2)<=2,
  focused:document.activeElement===frame};})()`);
const press=id=>w.hostEval(`(()=>{document.getElementById('protectedNotice').contentDocument.getElementById(${JSON.stringify(id)}).click();return true;})()`);
const shown=label=>w.waitFor(notice,n=>n.visible,'the protected-video notice '+label,12000);
const hidden=label=>w.waitFor(notice,n=>!n.visible,'no protected-video notice '+label,8000);
const open=async url=>{const id=await w.call('openTab',url);await w.waitForState(s=>s.activeTabId===id&&s.tabs.some(t=>t.id===id&&!t.loading));return id;};
const urls=async()=>(await w.snapshot()).tabs.map(t=>t.url);
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 f.server.removeAllListeners('request');f.server.on('request',serve);
 const other=f.base.replace('127.0.0.1','localhost');
 await w.native('setProtectedMediaBlancInstalled',[true]);

 // 1. An ordinary page: nothing.
 const plain=await open(f.base+'/plain');await sleep(2500);
 assert.equal((await notice()).visible,false,'expected no notice on a page that asks for nothing');
 result.checks.push('a page that asks for nothing shows no notice');

 // 2. A page asking for protected playback: the notice, under the Island.
 const protectedTab=await open(f.base+'/protected');
 let n=await shown('on a page asking for protected playback');
 assert.equal(n.title,text('protectedMedia.title'));assert.equal(n.body,text('protectedMedia.body'));
 assert.deepEqual(n.buttons,[text('sharedSpaces.notNow'),text('protectedMedia.open')]);
 assert.equal(n.title,"Blanc Beta can't play this video yet");assert.equal(n.body,'Protected video works in the released Blanc app.');
 assert.deepEqual(n.buttons,['Not now','Open in released Blanc']);
 assert.ok(n.belowIsland,'expected the notice below the Island');assert.ok(n.centered,'expected it centered');
 assert.equal(n.focused,false,'expected the notice not to take focus');
 result.checks.push('a page asking for protected playback shows the notice under the Island, in the owner\'s words, without taking focus');

 // 3. It belongs to that tab.
 await w.call('activateTab',plain);await hidden('on another tab');
 await w.call('activateTab',protectedTab);await shown('back on its tab');
 result.checks.push('the notice shows only while its tab is the current one');

 // 4. The Island panel takes its place while open.
 await w.call('openPanel');await hidden('while the Island panel is open');
 await w.call('closeOverlay');await shown('after the panel closes');
 result.checks.push('the open Island panel hides the notice, and closing it brings it back');

 // 5. Not now puts it away for the site, across a reload.
 await press('protectedLater');await hidden('after Not now');
 await w.call('navigateTab',protectedTab,f.base+'/protected?again');await sleep(3000);
 assert.equal((await notice()).visible,false,'expected Not now to hold for the site');
 result.checks.push('Not now puts the notice away for that site, across a reload');

 // 6. Another site asks afresh; leaving it takes the notice away.
 const second=await open(other+'/protected');await shown('on another site');
 await w.call('navigateTab',second,other+'/plain');await hidden('after leaving the site\'s protected page');
 result.checks.push('another site gets its own notice, and it goes when the tab leaves that page');

 // 7. Open in Blanc hands the page's address to the Electron app.
 await w.native('resetProtectedMedia');const before=await urls();
 await w.call('navigateTab',second,other+'/protected?watch=1');await shown('before Open in Blanc');
 await press('protectedOpen');await hidden('after Open in Blanc');
 assert.deepEqual(await w.native('protectedMediaHandoffs'),[{url:other+'/protected?watch=1',handedOff:true}]);
 assert.equal((await urls()).length,before.length,'expected no tab opened by the handoff');
 result.checks.push('Open in Blanc hands the current page\'s address to the Electron app and puts the notice away');

 // 8. With the Electron app absent, the action is getting it.
 await w.native('resetProtectedMedia');await w.native('setProtectedMediaBlancInstalled',[false]);
 await w.call('navigateTab',second,other+'/protected?watch=2');n=await shown('with Blanc absent');
 assert.deepEqual(n.buttons,[text('sharedSpaces.notNow'),text('protectedMedia.getBlanc')]);
 await press('protectedOpen');
 await w.waitForState(s=>s.tabs.some(t=>/blanc\.day\/download/.test(t.url)||/blanc\.day\/download/.test(t.loadedUrl||'')));
 assert.deepEqual(await w.native('protectedMediaHandoffs'),[{url:other+'/protected?watch=2',handedOff:false}]);
 result.checks.push('with the released app absent the button reads Get released Blanc and opens its download page');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
