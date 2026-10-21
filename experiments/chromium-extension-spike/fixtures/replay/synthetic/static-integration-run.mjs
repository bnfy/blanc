// Automatic provider static delivery: browser-owned context, no fixture selection or payload delivery.
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
const report = { completed: false, checks: [], latencyMeasured: false, mode: 'integrated', sources: {} };
for (const name of ['static-integration-run.mjs','nonhttp-context-fixtures.mjs','opaque-frame-fixtures.mjs','session.mjs']) report.sources[name] = sha(fs.readFileSync(new URL(name, import.meta.url)));
fs.writeFileSync(path.join(evidence, 'filters.txt'), filters);
let session;
const snapshot = frame => frame.evaluate(() => ({ first: window.first, origin: window.origin, secureContext: isSecureContext, randomUUID: typeof crypto.randomUUID, flag: window.opaqueFlag === true, counts: window.__blancScriptletGateCounts ?? null }));
try {
 session = await openSession({ config, browserKind: 'chromium', kind: 'regular', label: 'opaque-late', root, transport: replay, certificates, provider: 'ublock-origin', uboPayload: payload });
 report.source = session.source;
 await session.uboConfigure(); await session.uboSetFilters(filters);
 const popup = session.page.context().pages().find(p => p.url().includes('/popup-fenix.html')); assert(popup);
 report.manifest=await popup.evaluate(()=>globalThis.chrome.runtime.getManifest());
 for (const cycle of [0, 1]) for (const c of selected) {
  await popup.evaluate(()=>{globalThis.chrome.extension.getBackgroundPage().__blancStaticRows.length=0;});
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
  await pause(500);
  row.messages=await popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__blancStaticRows);
  row.targets=row.messages.filter(x=>x.sender.url===row.url&&x.sender.frameId>0&&x.stages.some(s=>s.stage==='browser-context'&&s.job.ancestors.length===(c.parent?2:1)));
  assert.equal(row.targets.length,c.mode==='http'?0:1,'exact leaf document context required');
  row.afterStatic=await snapshot(frame);
  assert.equal(row.afterStatic.counts.bodies,1);assert.equal(row.afterStatic.origin,c.origin);
  const target=row.targets.find(x=>x.replied&&x.stages.some(s=>s.stage==='confirmed'));
  if(target)assert(row.afterStatic.counts.attempts>=2,'actual automatic main-world arrival required');
  if(target&&!report.identityChecks){
   report.identityChecks=await popup.evaluate(async ({sender,generation})=>{
    const b=globalThis.chrome.extension.getBackgroundPage();
    const identity={documentId:sender.documentId,tabId:sender.tabId,frameId:sender.frameId,url:sender.url,origin:sender.origin};
    const ask=async(body,gen=generation)=>{const r=await b.fetch('http://blanc-ubo-control.invalid/late-context?'+gen,{method:'POST',body:JSON.stringify(body)});return {status:r.status,context:await r.json()};};
    // Fetch must originate in the authenticated background, not this popup.
    const values=[];for(const [name,body,gen] of [['live',identity,generation],['wrong-origin',{...identity,origin:'https://forged.test'},generation],['wrong-url',{...identity,url:'about:blank'},generation],['wrong-tab',{...identity,tabId:identity.tabId+1000},generation],['wrong-frame',{...identity,frameId:identity.frameId+1000},generation],['missing-document',{...identity,documentId:'invalid'},generation],['stale-generation',identity,generation-1]])values.push({name,...await ask(body,gen)});
    return {identity,generation,values};
   },{sender:target.sender,generation:target.stages.find(x=>x.stage==='confirmed').generation});
   assert.equal(report.identityChecks.values[0].status,200);assert(report.identityChecks.values.slice(1).every(x=>x.status===403));
  }

 }
 report.scopeControls=[];
 await popup.evaluate(()=>{globalThis.chrome.extension.getBackgroundPage().__blancStaticRows.length=0;});
 await session.page.goto(outside+'/control');await session.page.waitForSelector('#fixture-ready');
 await session.page.evaluate(()=>{const f=document.createElement('iframe');f.id='outside-child';f.sandbox='allow-scripts';f.srcdoc='<!doctype html><div id="fixture-ready">authored fixture outside-opaque</div>';document.body.append(f);});
 const outEl=await session.page.$('#outside-child'),outFrame=await until(()=>outEl.contentFrame());await outFrame.waitForSelector('#fixture-ready');await pause(500);
 for(const [name,frame] of [['outside-http',session.page],['outside-opaque',outFrame]])report.scopeControls.push({name,...await frame.evaluate(()=>({url:location.href,origin:self.origin,ready:!!document.querySelector('#fixture-ready'),counts:globalThis.__blancScriptletGateCounts??null,flag:globalThis.opaqueFlag===true,topSelection:globalThis.topSelection===true,childSelection:globalThis.childSelection===true}))});
 report.outsideMessages=await popup.evaluate(()=>globalThis.chrome.extension.getBackgroundPage().__blancStaticRows);
 assert(report.scopeControls.every(x=>x.ready&&!x.flag&&!x.topSelection&&!x.childSelection));

 if(report.identityChecks){
  const live=report.outsideMessages.find(x=>x.sender.url==='about:srcdoc'&&x.replied);
  assert(live,'live control needed before testing reload refusal');
  report.lifecycle=await popup.evaluate(async ({saved,live})=>{
   const b=globalThis.chrome.extension.getBackgroundPage();
   const ask=async(body,gen)=>{const r=await b.fetch('http://blanc-ubo-control.invalid/late-context?'+gen,{method:'POST',body:JSON.stringify(body)});return r.status;};
   const sender=live.sender,identity={documentId:sender.documentId,tabId:sender.tabId,frameId:sender.frameId,url:sender.url,origin:sender.origin};
   const generation=live.stages.find(x=>x.stage==='confirmed').generation;
   const liveBefore=await ask(identity,generation),staleDocument=await ask(saved.identity,generation);
   const next=await b.__blancUboProbe.begin();const held=await ask(identity,next);
   await b.__blancUboProbe.complete();const liveRestored=await ask(identity,next),priorGeneration=await ask(identity,generation);
   let popupRejected;
   try {const r=await fetch('http://blanc-ubo-control.invalid/late-context?'+next,{method:'POST',body:JSON.stringify(identity)});popupRejected=r.status!==200;}catch{popupRejected=true;}
   return {liveBefore,staleDocument,held,liveRestored,priorGeneration,popupRejected};
  },{saved:report.identityChecks,live});
  assert.deepEqual(report.lifecycle,{liveBefore:200,staleDocument:403,held:403,liveRestored:200,priorGeneration:403,popupRejected:true});
 }
 assert(report.identityChecks,'identity rejection tests must actually run');
 report.completed = true;
} catch (error) { report.error = String(error); process.exitCode = 1; }
finally {
 if (session) { report.records = session.records(); await session.close(); }
 report.arrivals = replay.arrivals; report.faults = replay.faults; await replay.close();
 fs.rmSync(root, { recursive: true, force: true }); report.cleanup = { removed: !fs.existsSync(root) };
 fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ completed: report.completed, mode:report.mode, checks: report.checks.length, error: report.error }));
}
