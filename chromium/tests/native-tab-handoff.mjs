// N20, tab handoff (docs/superpowers/specs/2026-11-16-fork-tab-handoff-design.md):
// a blanc-import: link from the Bring Your Tabs extension, as shipping's
// main.js queueTabHandoff and tab-import-handoff.js handle one. The relay is
// this test's own server on 127.0.0.1 (the queueTabHandoff hook accepts no
// other origin), holding real AES-256-GCM envelopes; nothing reaches the
// network. Messages are shipping's, read from copy/messages/en.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {NativeFixture} from './lib/fixture.mjs';
import {installDriver} from './lib/test-driver.mjs';
import {assertRendering,assertNodeRuntime} from './lib/render-guard.mjs';
import {createWorld} from './world.mjs';
import {jsLiteral} from './lib/js-literal.mjs';
import {makeHandoff} from './lib/handoff-fixture.mjs';
import {nativeCall} from './lib/test-driver.mjs';
import {createProfile} from './fork-steps/profiles.mjs';
const [configFile,out]=process.argv.slice(2),config=JSON.parse(fs.readFileSync(configFile));
assertNodeRuntime();assert.equal(fs.existsSync(out),false,'expected a new output folder');fs.mkdirSync(out,{recursive:true});
const f=new NativeFixture(),w=createWorld(f),result={candidate:config.candidate,checks:[]};
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-tab-handoff-'));
const visible=()=>assertRendering(e=>f.host.eval(e));
const here=path.dirname(fileURLToPath(import.meta.url));
const messages=JSON.parse(fs.readFileSync(path.join(here,'../../copy/messages/en.json'),'utf8'));
const message=(key,values={})=>Object.entries(values).reduce((text,[k,v])=>text.replaceAll('{'+k+'}',String(v)),messages[key].message);
// The stand-in relay: one claim per handoff, as the real one.
const relay={records:new Map(),log:[]};
const serve=(q,r)=>{
 const claim=/^\/v1\/handoffs\/([A-Za-z0-9_-]+)\/claim$/.exec(q.url);
 if(!claim){r.writeHead(200,{'content-type':'text/html'});r.end(`<title>${q.url.slice(1)}</title><p>${q.url}</p>`);return;}
 relay.log.push({method:q.method,url:q.url,cookie:q.headers.cookie??null,accept:q.headers.accept??null,referer:q.headers.referer??null});
 const record=relay.records.get(claim[1]);
 if(q.method!=='POST'||!record){r.writeHead(404);r.end();return;}
 relay.records.delete(claim[1]);
 if(record.redirect){r.writeHead(302,{location:f.base+'/elsewhere'});r.end();return;}
 if(record.status){r.writeHead(record.status);r.end();return;}
 r.writeHead(200,{'content-type':'application/json'});r.end(record.reply);
};
const put=(options,extra={})=>{const h=makeHandoff(options);relay.records.set(h.id,{reply:h.reply,...extra});return h;};
const queue=link=>w.native('queueTabHandoff',[link,f.base]);
// The handoff sheet as a person reads it.
const sheetIn=cdp=>cdp.eval(`(()=>{const frame=[...document.querySelectorAll('iframe')].find(f=>!f.hidden&&/pages\\/tab-handoff\\.html/.test(f.src));
 const d=frame?.contentDocument;if(!d||d.readyState!=='complete'||!d.getElementById('summary'))return null;
 const text=id=>{const e=d.getElementById(id);return e&&!e.hidden?e.textContent.trim():null;};
 return {summary:text('summary'),error:text('error'),skipped:text('skipped'),accept:d.getElementById('accept').disabled?null:d.getElementById('accept').textContent.trim(),
  rows:d.getElementById('list').hidden?[]:[...d.querySelectorAll('.tab-handoff-row')].map(r=>({title:r.querySelector('.title').textContent,domain:r.querySelector('.url').textContent,first:!!r.querySelector('.tab-handoff-active')})),
  html:d.body.innerHTML};})()`);
const sheet=()=>sheetIn(f.host);
const press=id=>w.hostEval(`(()=>{const frame=[...document.querySelectorAll('iframe')].find(f=>/pages\\/tab-handoff\\.html/.test(f.src));frame.contentDocument.getElementById(${jsLiteral(id)}).click();return true;})()`);
const tabs=async()=>(await w.snapshot()).tabs.map(t=>({id:String(t.id),url:t.url,asleep:!!t.asleep}));
const shown=ok=>w.waitFor(sheet,s=>s&&ok(s),'the handoff sheet',10000);
const gone=()=>w.waitFor(sheet,s=>s===null,'the handoff sheet to close',8000);
try{
 await f.launch(config,path.join(parent,'fixture'),{testHooks:true,diskAssets:false});await installDriver(f.host);await visible();await w.reset();
 f.server.removeAllListeners('request');f.server.on('request',serve);
 const before=await tabs();

 // 1. A valid handoff: the sheet, before anything opens.
 let h=put({sourceBrowser:'firefox',tabs:[{url:f.base+'/one?token=secret-one',title:'Page one'},{url:'javascript:alert(1)',title:'bad'},
  {url:f.base+'/two',title:'Page two',active:true},{url:'file:///etc/passwd'},{url:f.base+'/three'}]});
 assert.equal(await queue(h.link),true,'expected the link taken');
 let s=await shown(s=>s.rows.length===3);
 assert.deepEqual(s.rows,[{title:'Page one',domain:'127.0.0.1',first:false},{title:'Page two',domain:'127.0.0.1',first:true},{title:'127.0.0.1',domain:'127.0.0.1',first:false}]);
 assert.match(s.summary,/3/);assert.match(s.summary,/Firefox/);assert.match(s.summary,/this Personal window/,'expected the first profile called Personal');assert.match(s.skipped,/2/);
 assert.ok(!s.html.includes('secret-one')&&!s.html.includes('/one')&&!s.html.includes(h.id),'expected no address, path or handoff id in the page');
 assert.deepEqual(await tabs(),before,'expected nothing opened before the person chooses');
 assert.ok(!(await tabs()).some(t=>t.url.startsWith('blanc-import')),'expected the link never to become a tab');
 assert.deepEqual(relay.log,[{method:'POST',url:`/v1/handoffs/${h.id}/claim`,cookie:null,accept:'application/json',referer:null}],'expected one bare claim request');
 result.checks.push('a valid handoff shows its count, source browser, titles and host names, with nothing opened and one bare claim request');

 // 2. A second link while one waits only brings the sheet forward.
 const second=put({});
 assert.equal(await queue(second.link),true);await new Promise(r=>setTimeout(r,600));
 assert.equal(relay.log.length,1,'expected no second claim while a handoff waits');
 assert.equal((await sheet())?.rows.length,3);
 result.checks.push('a second link while a handoff waits is not claimed');

 // 3. Open here: quiet tabs in order, the source's active one in front.
 await press('accept');await gone();
 let now=await w.waitFor(tabs,t=>t.length===before.length+3,'three tabs opened',8000);
 const added=now.slice(before.length);
 assert.deepEqual(added.map(t=>t.url),[f.base+'/one?token=secret-one',f.base+'/two',f.base+'/three']);
 assert.equal(String((await w.snapshot()).activeTabId),added[1].id,'expected the source\'s active tab in front');
 assert.deepEqual(added.map(t=>t.asleep),[true,false,true],'expected the others quiet');

 result.checks.push('Open in this window opens the web tabs in order, quiet, with the source\'s active tab in front');

 // 4. The same link again: the relay has deleted it.
 assert.equal(await queue(h.link),true);
 s=await shown(s=>s.error!==null);
 assert.equal(s.error,message('handoff.error.unavailable'));assert.equal(s.accept,null,'expected nothing to open from an error');
 await press('cancel');await gone();
 result.checks.push('a used link reports that the handoff is unavailable');

 // 5. Cancel discards the list.
 h=put({tabs:[{url:f.base+'/cancelled'}]});
 await queue(h.link);await shown(s=>s.rows.length===1);
 const count=(await tabs()).length;
 await press('cancel');await gone();
 assert.equal((await tabs()).length,count,'expected Cancel to open nothing');
 result.checks.push('Cancel opens nothing and discards the list');

 // 6. Each failure, in shipping's words.
 const failures=[
  ['unverified',()=>put({tamper:true})],
  ['unverified',()=>{const x=put({});return {...x,link:x.link.replace(/key=.*/,'key='+Buffer.alloc(32,7).toString('base64url'))};}],
  ['invalidExpiry',()=>put({expiresAt:Date.now()-1000})],
  ['invalidExpiry',()=>put({expiresAt:Date.now()+11*60*1000})],
  ['tooManyTabs',()=>put({tabs:Array.from({length:101},(_,i)=>({url:f.base+'/'+i}))})],
  ['empty',()=>put({tabs:[{url:'file:///x'}]})],
  ['multipleActive',()=>put({tabs:[{url:f.base+'/a',active:true},{url:f.base+'/b',active:true}]})],
  ['unavailable',()=>put({},{status:500})],
  ['offline',()=>put({},{redirect:true})],
  ['unverified',()=>{const x=makeHandoff({});relay.records.set(x.id,{reply:Buffer.alloc(Math.ceil(256*1024*4/3)+4096,0x20)});return x;}]];
 for(const [key,make] of failures){
  const bad=make(),claims=relay.log.length;
  await queue(bad.link);
  s=await shown(s=>s.error!==null);
  assert.equal(s.error,message('handoff.error.'+key,{limit:100}),key);
  assert.equal(relay.log.length,claims+1,key+': expected one claim');
  await press('cancel');await gone();
 }
 assert.ok(!relay.log.some(e=>e.url==='/elsewhere'),'expected the redirect not followed');
 assert.equal((await tabs()).length,count,'expected no failure to open a tab');
 result.checks.push('a changed list, a wrong key, an expiry out of range, 101 tabs, no web tabs, two active tabs, a relay error, a redirect and an oversized reply each show shipping\'s message and open nothing');

 // 7. A link that is not a handoff link is dropped without a sheet or a claim.
 const claims=relay.log.length;
 assert.equal(await queue('blanc-import://tabs?v=9&id=x&key=y'),true,'expected the scheme taken, never loaded');
 await new Promise(r=>setTimeout(r,1200));
 assert.equal(await sheet(),null);assert.equal(relay.log.length,claims);assert.equal((await tabs()).length,count);
 result.checks.push('a malformed blanc-import: link shows nothing, claims nothing and is never loaded');

 // 8. Open in a new window.
 h=put({tabs:[{url:f.base+'/nw-one'},{url:f.base+'/nw-two',active:true}]});
 const targetsBefore=await w.native('tabTargets');
 await queue(h.link);await shown(s=>s.rows.length===2);
 await press('newWindow');await press('accept');await gone();
 const targetsAfter=await w.waitFor(()=>w.native('tabTargets'),t=>Object.keys(t).length>=Object.keys(targetsBefore).length+2,'the new window\'s tabs',8000);
 const fresh=Object.keys(targetsAfter).filter(id=>!(id in targetsBefore));
 assert.equal((await tabs()).length,count,'expected this window\'s tabs unchanged');
 const mine=(await f.browser.send('Browser.getWindowForTarget',{targetId:targetsAfter[(await tabs())[0].id]})).windowId;
 const theirs=new Set();for(const id of fresh)theirs.add((await f.browser.send('Browser.getWindowForTarget',{targetId:targetsAfter[id]})).windowId);
 assert.equal(theirs.size,1);assert.ok(!theirs.has(mine),'expected the tabs in another window');
 assert.equal(fresh.length,2,'expected the new window to hold only the two tabs');
 result.checks.push('Open in a new window puts the tabs in a window of their own');
 // 9. A window of another profile is named in the sheet.
 const work=await createProfile(w,'Work');
 h=put({tabs:[{url:f.base+'/work-one',title:'Work one',active:true}]});
 assert.equal(await nativeCall(work.cdp,'queueTabHandoff',[h.link,f.base]),true);
 const named=await w.waitFor(()=>sheetIn(work.cdp),x=>x&&x.rows.length===1,'the handoff sheet in the Work window',10000);
 assert.match(named.summary,/this Work window/,'expected the Work profile named: '+named.summary);
 result.checks.push('the sheet names the window\'s profile: Personal for the first, its own name for another');
 await visible();result.result='pass';
}catch(error){result.result=error.code==='BLANC_ENVIRONMENT_STOP'?'blocked-environment':'fail';result.error=String(error.stack);process.exitCode=1;}
finally{
 result.relay=relay.log.length;
 const exit=await f.close();if(exit?.code!==0){result.exit=exit;result.result='fail';process.exitCode=1;}
 if(f.directory&&fs.existsSync(path.join(f.directory,'browser.log')))fs.copyFileSync(path.join(f.directory,'browser.log'),path.join(out,'browser.log'));
 fs.rmSync(parent,{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
