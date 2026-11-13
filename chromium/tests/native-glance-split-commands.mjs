// A Glance floating over a split (F53-29): page commands follow focus into
// the Glance page and back to the split's pane, as shipping's commands follow
// focus into the card (#1441).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {tabPage} from './adapters/core.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-glance-split-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
// Zoom is kept per site, so the Glance page is on another host than the panes.
const loaded=async(name,other=false)=>{const url=other?w.insecureFixtureUrl(name):f.base+'/'+name;const id=await w.call('openTab',url);
 await w.waitForState(s=>s.tabs.some(t=>t.id===id&&!t.loading));return id;};
const loads=async id=>(await tabPage(w,id)).evalExpression("(sessionStorage.loads=String(Number(sessionStorage.loads||0)+(window.__counted?0:1)),window.__counted=true,Number(sessionStorage.loads))");
const zoom=id=>w.call('zoomPercent',id);
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});
 await installDriver(f.host);await visible();await w.reset();
 const a=await loaded('split-a'),b=await loaded('split-b'),g=await loaded('split-other',true);
 assert.ok(await w.call('makeSplit',a,[b]));await w.call('activateTab',a);
 await w.waitForState(s=>s.activeTabId===a&&s.splits.some(x=>x.tabIds.join()===[a,b].join()));
 assert.equal(await w.api('setGlanceTab',[g]),true);
 await w.waitForState(s=>s.glanceTabId===g);
 await w.waitFor(()=>w.call('glancePageViewVisible'),Boolean,'the Glance page shown',8000);
 const before={a:await loads(a),g:await loads(g)};

 // Focus into the Glance page: zoom and Reload act on it, not on the pane.
 await w.native('testFocusTabContents',[Number(g)]);
 await w.waitFor(()=>w.snapshot(),s=>String(s.focusedTabId)===g,'focus in the Glance page',5000);
 await w.call('pressBrowserCommand',g,'zoom-in');
 await w.waitFor(()=>zoom(g),p=>p===110,'the Glance page zoomed in',5000);
 assert.equal(await zoom(a),100,'the split pane keeps its zoom');
 result.checks.push('⌘+ in the Glance page zooms the Glance page, not the focused split pane');
 await w.native('previewPageCommand',['hardReload']);
 await w.waitFor(()=>loads(g),n=>n===before.g+1,'the Glance page reloaded',8000);
 assert.equal(await loads(a),before.a,'the split pane did not reload');
 result.checks.push('Reload in the Glance page reloads the Glance page only');
 assert.equal(String((await w.snapshot()).glanceTabId),g,'the Glance stays open');

 // Find opened from the Glance searches the Glance page.
 await (await tabPage(w,g)).evalExpression("document.body.insertAdjacentHTML('beforeend','<p>glance-needle</p>'),1");
 await w.native('previewPageCommand',['find']);
 await w.waitFor(()=>w.call('overlayMode'),m=>m==='find','the find bar',5000);
 assert.equal(String(await w.hostEval('window.BlancPrototypeHost.findState().tabId')),g,'the find bar targets the Glance page');
 // Record the results Blanc reports to the Island (harness instrumentation).
 await w.hostEval(`(()=>{const host=window.BlancPrototypeHost,report=host.findResult;window.__findResults=[];
  host.findResult=(...args)=>{window.__findResults.push(args);return report(...args);};return true;})()`);
 await w.api('findInPage',[g,'glance-needle',{}]);
 const last=await w.waitFor(()=>w.hostEval('window.__findResults.at(-1) ?? null'),r=>r&&String(r[0])===g&&r[2]===1,'one match in the Glance page',5000);
 assert.equal(last[2],1);
 result.checks.push('find opened from the Glance page searches the Glance page');
 await w.call('closeOverlay');

 // Focus back in a split pane: commands act on that pane again.
 await w.native('testFocusTabContents',[Number(a)]);
 await w.waitFor(()=>w.snapshot(),s=>String(s.focusedTabId)===a,'focus back in the split pane',5000);
 await w.call('pressBrowserCommand',a,'zoom-in');
 await w.waitFor(()=>zoom(a),p=>p===110,'the split pane zoomed in',5000);
 assert.equal(await zoom(g),110,'the Glance page keeps its own zoom');
 result.checks.push('back in the split pane, ⌘+ zooms that pane');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
