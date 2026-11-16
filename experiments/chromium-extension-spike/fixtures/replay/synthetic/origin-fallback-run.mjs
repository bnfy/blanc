// Static content-script fallback experiment, using actual extension messaging.
// No direct Playwright payload evaluation; fixture-only rule selection remains diagnostic.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { startSynthetic } from './transport.mjs';
import { createCertificateSet } from './certificate-set.mjs';
import { openSession, until, pause } from './session.mjs';
import { top, child, blocked, cases, filters, fixtures, bodyFor } from './nonhttp-context-fixtures.mjs';
import { sha } from './generate.mjs';
const [configFile, payload, evidence] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configFile));
assert(config.documentStart); assert(!fs.existsSync(evidence)); fs.mkdirSync(evidence);
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-origin-fallback-')));
const outside='https://outside.blanc-fixture.test';
const certificates = createCertificateSet(path.join(root, 'certificates'), [top, child, blocked,outside].map(u => new URL(u).hostname));
const authored = fixtures();
authored.set(outside+'/control',{status:200,contentType:'text/html',body:'<!doctype html><div id=fixture-ready>authored fixture outside</div>'});
authored.set(outside+'/favicon.ico',{status:204,contentType:'image/x-icon',body:''});
for (const name of ['opaque-srcdoc','inherited-srcdoc','http-control']) for (const [host, pathname] of [[child, '/opaque-hit/'], [blocked, '/blanc-fixture/opaque/']]) authored.set(host + pathname + name, { status: 200, contentType: 'text/plain', body: 'authored control' });
authored.set(child+'/static-http',{status:200,contentType:'text/html',body:bodyFor({name:'http-control'})});
const replay = await startSynthetic({ fixtures: authored, tlsMaterial: certificates });
fs.writeFileSync(path.join(evidence, 'fixtures.json'), JSON.stringify([...authored], null, 2));
const selected = cases.filter(c => c.admitted);
selected.unshift({ name:'http-control',mode:'http',origin:child,admitted:true },{ name:'inherited-srcdoc',mode:'srcdoc',origin:top,admitted:true },{ name: 'opaque-srcdoc', mode: 'srcdoc', sandbox: true, origin: 'null', admitted: true });
const report = { completed: false, checks: [], latencyMeasured: false, mode: config.fallbackMode, receiverIdentifier: 'getRandomValues-128', sources: {} };
for (const name of ['origin-fallback-run.mjs','origin-fallback-content.js','origin-fallback-payload.mjs','nonhttp-context-fixtures.mjs','opaque-frame-fixtures.mjs','session.mjs']) report.sources[name] = sha(fs.readFileSync(new URL(name, import.meta.url)));
fs.writeFileSync(path.join(evidence, 'filters.txt'), filters);
let session;
const snapshot = frame => frame.evaluate(() => ({ first: window.first, origin: window.origin, flag: window.opaqueFlag === true, counts: window.__blancScriptletGateCounts ?? null }));
try {
 session = await openSession({ config, browserKind: 'chromium', kind: 'regular', label: 'opaque-late', root, transport: replay, certificates, provider: 'ublock-origin', uboPayload: payload });
 report.source = session.source;
 await session.uboConfigure(); await session.uboSetFilters(filters);
 const popup = session.page.context().pages().find(p => p.url().includes('/popup-fenix.html')); assert(popup);
 report.manifest=await popup.evaluate(()=>globalThis.chrome.runtime.getManifest());
 await popup.evaluate(() => {
  const b=globalThis.chrome.extension.getBackgroundPage();b.__blancFallbackRows=[];
  b.chrome.runtime.onMessage.addListener((message,sender)=>{
   if(message?.type==='blanc-fallback-hello'&&sender.id===b.chrome.runtime.id&&sender.tab&&sender.documentId){
    b.__blancFallbackRows.push({message,sender:{id:sender.id,frameId:sender.frameId,documentId:sender.documentId,url:sender.url,origin:sender.origin,tabId:sender.tab.id}});
   }
  });
 });
 for (const cycle of [0, 1]) for (const c of selected) {
  await popup.evaluate(()=>{globalThis.chrome.extension.getBackgroundPage().__blancFallbackRows=[];});
  await session.page.goto(top + '/nonhttp-root'); let parent = session.page;
  if (c.parent) {
   await session.page.evaluate(({ parent, child }) => { const f = document.createElement('iframe'); f.id = 'parent'; if (parent === 'opaque') { f.sandbox = 'allow-scripts'; f.srcdoc = '<!doctype html><body>opaque parent'; } else f.src = child + '/nonhttp-root'; document.body.append(f); }, { parent: c.parent, child });
   const el = await session.page.$('#parent'); parent = await until(() => el.contentFrame()); await parent.waitForSelector('body');
  }
  await parent.evaluate(({ c, body }) => { const f = document.createElement('iframe'); f.id = 'probe'; if (c.sandbox) f.sandbox = 'allow-scripts'; if(c.mode==='http') f.src='https://child.blanc-control.test/static-http'; else if (c.mode === 'srcdoc') f.srcdoc = body; else if (c.mode === 'data') f.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(body); else f.src = URL.createObjectURL(new Blob([body], { type: 'text/html' })); document.body.append(f); }, { c, body: bodyFor(c) });
  const el = await parent.$('#probe'), frame = await until(() => el.contentFrame());
  await frame.waitForSelector('#fixture-ready'); await frame.evaluate(() => window.requests); await pause(100);
  const row = { cycle, name: c.name, url: await frame.evaluate(() => location.href), playwrightUrl: frame.url(), before: await snapshot(frame) }; report.checks.push(row);
  assert(row.before.first.flag && row.before.first.getter); assert.equal(row.before.origin, c.origin); assert.equal(row.before.counts.bodies, 1);
  // Read only; no guessed frame id. Each hello includes actual browser sender
  // document identity and exact authored fixture metadata from the isolated realm.
  await pause(300);
  const delivery = await popup.evaluate(async ({ top,child,url,name }) => {
   const b=globalThis.chrome.extension.getBackgroundPage();
   const tab=(await b.chrome.tabs.query({})).find(t=>t.url===top+'/nonhttp-root');if(!tab)throw Error('missing fixture tab');
   const messages=b.__blancFallbackRows.filter(x=>x.sender.tabId===tab.id);
   const matches=messages.filter(x=>x.sender.url===url&&x.message.href===url&&x.message.frameName==='authored fixture '+name&&x.sender.frameId>0&&x.sender.documentId);
   if(matches.length>1)throw Error('ambiguous static receiver');const target=matches[0]??null;
   const selectedOrigin=['child-origin-blob','http-control'].includes(name)?child:top;
   const details=target?b.__blancScriptletEngine.retrieve({tabId:tab.id,frameId:target.sender.frameId,nocache:true,url:selectedOrigin+'/',hostname:new URL(selectedOrigin).hostname,domain:new URL(selectedOrigin).hostname.split('.').slice(-2).join('.'),ancestors:[]}):null;
   const attempts=[];
   if(target){
    if(!details?.mainWorld)throw Error('missing real payload');
    for(let i=0;i<2;i++)attempts.push(await new Promise(resolve=>b.chrome.tabs.sendMessage(tab.id,{type:'blanc-fallback-deliver',instance:target.message.instance,code:details.mainWorld},{documentId:target.sender.documentId},response=>{const error=b.chrome.runtime.lastError?.message??null;resolve({response:response??null,error});})));
   }
   return {tabId:tab.id,messages,target,attempts,selectedOrigin,mainWorld:details?.mainWorld??null};
  },{top,child,url:row.url,name:c.name});
  const {mainWorld,...metadata}=delivery;
  if(mainWorld)fs.writeFileSync(path.join(evidence,sha(mainWorld)+'.main-world.js'),mainWorld);
  row.delivery={...metadata,mainWorldSha256:mainWorld?sha(mainWorld):null};
  await pause(100);row.afterExtension=await snapshot(frame);
  assert.equal(row.afterExtension.counts.bodies,1);assert.equal(row.afterExtension.origin,c.origin);
  if(delivery.target)assert(row.afterExtension.counts.attempts>=row.before.counts.attempts+2,'real main-world arrival required');

 }
 report.scopeControls=[];
 await popup.evaluate(()=>{globalThis.chrome.extension.getBackgroundPage().__blancFallbackRows=[];});
 await session.page.goto(outside+'/control');await session.page.waitForSelector('#fixture-ready');
 await session.page.evaluate(()=>{const f=document.createElement('iframe');f.id='outside-child';f.sandbox='allow-scripts';f.srcdoc='<!doctype html><div id="fixture-ready">authored fixture outside-opaque</div>';document.body.append(f);});
 const outEl=await session.page.$('#outside-child'),outFrame=await until(()=>outEl.contentFrame());await outFrame.waitForSelector('#fixture-ready');await pause(500);
 for(const [name,frame] of [['outside-http',session.page],['outside-opaque',outFrame]])report.scopeControls.push({name,...await frame.evaluate(()=>({url:location.href,origin:self.origin,ready:!!document.querySelector('#fixture-ready'),counts:globalThis.__blancScriptletGateCounts??null,flag:globalThis.opaqueFlag===true,topSelection:globalThis.topSelection===true,childSelection:globalThis.childSelection===true}))});
 report.outsideMessages=await popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__blancFallbackRows);
 assert.equal(report.outsideMessages.length,0);assert(report.scopeControls.every(x=>x.ready&&!x.flag&&!x.topSelection&&!x.childSelection));

 report.completed = true;
} catch (error) { report.error = String(error); process.exitCode = 1; }
finally {
 if (session) { report.records = session.records(); await session.close(); }
 report.arrivals = replay.arrivals; report.faults = replay.faults; await replay.close();
 fs.rmSync(root, { recursive: true, force: true }); report.cleanup = { removed: !fs.existsSync(root) };
 fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ completed: report.completed, mode:report.mode, checks: report.checks.length, error: report.error }));
}
