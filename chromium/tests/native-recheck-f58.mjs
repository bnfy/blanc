// F58 in the fork: /reader is Chromium's own Reading Mode (owner decision,
// 2026-11-02, STATUS "Native-versus-port decisions"), not shipping's in-page
// reader, so shipping's three reader scenarios are excluded. This checks
// what the fork promises instead: the command opens Reading Mode over the
// page pane (Chromium 158 shows it as a full reading view, not a side
// panel) with the article's text, the Island knows it is open (shipping's
// readerActive, which keeps the panel's exit button), the command closes it
// again, and a private tab behaves the same.
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
assertNodeRuntime();assert.equal(fs.existsSync(out),false,'expected a new output folder');fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-recheck-f58-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const HEADING='An article about foxes';
const activeTab=async()=>{const s=await w.snapshot();return s.tabs.find(t=>String(t.id)===String(s.activeTabId));};
const pageView=async id=>(await tabPage(w,id)).evalExpression('({w:innerWidth,h:innerHeight})');
const toggle=()=>w.hostEval('window.BlancPrototypeHost.api.toggleReaderMode().then(()=>true)');
// Reading Mode's own document: every text node, through its shadow roots.
const reader=async()=>{
 const target=(await f.targets()).find(t=>t.url.startsWith('chrome-untrusted://read-anything-side-panel.top-chrome'));
 if(!target)return null;
 const cdp=await f.connectTarget(target);
 return cdp.eval(`(()=>{const out=[];const walk=n=>{if(n.nodeType===3)out.push(n.textContent);for(const c of n.childNodes??[])walk(c);if(n.shadowRoot)walk(n.shadowRoot);};walk(document);
  return {text:out.join(' ').replace(/\\s+/g,' '),w:innerWidth,h:innerHeight,shown:document.visibilityState==='visible'};})()`).catch(()=>null);
};
async function check(id,kind){
 const page=await pageView(id);
 assert.equal((await activeTab()).readerActive,false,`${kind}: expected Reading Mode closed before the command`);
 assert.equal(await toggle(),true);
 await w.waitFor(activeTab,t=>t?.readerActive===true,`${kind}: the Island reports Reading Mode open`,8000);
 const view=await w.waitFor(reader,r=>r?.shown===true&&r.text.includes(HEADING),`${kind}: Reading Mode is on screen with the article's heading`,15000);
 assert.deepEqual({w:view.w,h:view.h},page,`${kind}: expected Reading Mode to fill the page pane ${JSON.stringify(page)}; found ${view.w} by ${view.h}`);
 assert.ok(view.text.includes('The quick brown fox jumps over the lazy dog'),`${kind}: expected the article's body text in Reading Mode`);
 assert.equal(await toggle(),true);
 await w.waitFor(activeTab,t=>t?.readerActive===false,`${kind}: the command closes Reading Mode`,8000);
 await w.waitFor(reader,r=>r===null||r.shown===false,`${kind}: Reading Mode leaves the screen`,8000);
}
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 const paragraph='The quick brown fox jumps over the lazy dog near the quiet river bank at dawn. '.repeat(12);
 f.server.removeAllListeners('request');f.server.on('request',(q,r)=>{r.writeHead(200,{'content-type':'text/html'});
  r.end(`<title>An article</title><article><h1>${HEADING}</h1>${('<p>'+paragraph+'</p>').repeat(8)}</article>`);});
 const id=await w.call('openTab',f.base+'/article');
 await check(id,'an ordinary tab');
 result.checks.push('/reader opens Chromium\'s Reading Mode over the page pane with the article\'s text, the Island reports it, and the command closes it');
 const priv=await w.call('openTab',f.base+'/article-private',{private:true});
 assert.equal((await activeTab()).private,true,'expected a private tab');
 await check(priv,'a private tab');
 result.checks.push('a private tab opens and closes Reading Mode the same way');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
