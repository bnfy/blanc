// N4 smoke (V4): a page-opened tab keeps the sandbox it inherited from its
// opener, and a rebuilt one (Recently closed, session restore) loads its page
// again under the same flags. Only tabs that inherited a sandbox are marked;
// Duplicate is refused for them. Covered for an opaque sandbox, a same-origin
// sandbox (a restriction origin can't show: forms), and an unsandboxed
// page-opened child as the control that is never marked.
//   node chromium/tests/document-policy-smoke.mjs runtime-config.json result.json
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {NativeFixture} from './lib/fixture.mjs';
import {waitFor} from './lib/cdp.mjs';
import {installDriver,nativeCall} from './lib/test-driver.mjs';
const [configPath,outFile]=process.argv.slice(2);
if(!configPath||!outFile)throw Error('Usage: document-policy-smoke.mjs runtime-config.json result.json');
const config=JSON.parse(fs.readFileSync(configPath));
const VARIANTS=[
 {name:'opaque',sandbox:'allow-scripts allow-popups',storage:'SecurityError',origin:'null'},
 {name:'same-origin',sandbox:'allow-same-origin allow-scripts allow-popups',storage:'allowed'},
 {name:'unsandboxed',sandbox:null,storage:'allowed'},
];
// Chromium's flag bits (web_sandbox_flags.mojom).
const FORMS=8,ORIGIN=4,PROPAGATES=2048;
// Targets are built from fixed-shape parameters, never taken as a URL. The
// target reports its origin, its storage access and whether a form posts.
const server=http.createServer((q,r)=>{
 const url=new URL(q.url,'http://x'),v=url.searchParams.get('v')??'',tag=url.searchParams.get('tag')??'';
 const variant=VARIANTS.find(x=>x.name===v);
 r.writeHead(200,{'content-type':'text/html'});
 if(url.pathname==='/source'&&variant){
  const target=`/target?v=${v}&tag=${encodeURIComponent(tag)}`;
  const link=`<a id="l" target="_blank" href="${base}${target}" style="display:block;width:300px;height:120px">open</a>`;
  r.end(variant.sandbox
   ?`<title>source</title><iframe id="f" sandbox="${variant.sandbox}" style="position:absolute;left:0;top:0;width:320px;height:140px;border:0" srcdoc='${link}'></iframe>`
   :`<title>source</title><div style="position:absolute;left:0;top:0">${link}</div>`);
  return;
 }
 if(url.pathname==='/target'){
  r.end(`<title>target ${v} ${tag}</title><iframe name="sink" style="display:none"></iframe>
<form id="form" action="/sent" target="sink" method="get"><input name="x" value="1"></form>
<script>window.probe={origin:self.origin,storage:(()=>{try{localStorage.setItem('k','v');return 'allowed'}catch(e){return e.name}})()};
window.formSent=false;document.querySelector('iframe').onload=()=>{try{window.formSent=frames.sink.location.pathname==='/sent'}catch{window.formSent=true}};
try{document.getElementById('form').submit()}catch{}</script>`);
  return;
 }
 if(url.pathname==='/sent'){r.end('<title>sent</title>');return;}
 r.end('<title>Native test fixture</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const fixture=new NativeFixture();
const result={candidate:config.candidate,checks:{},status:'started'};
let checks=0;
const check=(label,value)=>{result.checks[label]=value;checks++;};
const marks=()=>nativeCall(fixture.host,'inheritedSandbox');
const markFor=async url=>(await marks()).find(t=>t.url===url);
// The target page's own report, read over CDP once it has run its script and
// its form has had time to post.
async function probe(url,label){
 const target=await waitFor(async()=>(await fixture.targets()).find(t=>t.url===url),Boolean,label+' target');
 const page=await fixture.connectTarget(target);
 const report=await waitFor(()=>page.eval('window.probe&&document.readyState==="complete"?{...window.probe}:null'),Boolean,label+' probe');
 await new Promise(r=>setTimeout(r,1500));
 report.formSent=await page.eval('window.formSent');
 page.close();
 return report;
}
function assertPolicy(variant,report,mark,label){
 assert.equal(report.storage,variant.storage,label+': storage');
 if(variant.origin)assert.equal(report.origin,variant.origin,label+': origin');
 if(variant.sandbox){
  assert.ok(mark.flags&PROPAGATES,label+': marked with the inherited sandbox');
  assert.ok(mark.flags&FORMS,label+': forms sandboxed');
  assert.equal(report.formSent,false,label+': the form does not post');
  assert.equal(!!(mark.flags&ORIGIN),variant.name==='opaque',label+': origin flag');
  assert.equal((mark.documentFlags&mark.flags),mark.flags,label+': the document carries the inherited flags');
 }else{
  assert.equal(mark.flags,0,label+': not marked');
  assert.equal(report.formSent,true,label+': the form posts');
 }
}
// Opens the variant's source in a new tab and clicks its link with a real
// mouse event (a scripted click from a sandboxed frame is popup-blocked).
async function openChild(variant,tag){
 const sourceUrl=`${base}/source?v=${variant.name}&tag=${tag}`;
 await nativeCall(fixture.host,'createTab',[sourceUrl]);
 const target=await waitFor(async()=>(await fixture.targets()).find(t=>t.url===sourceUrl),Boolean,'source '+tag);
 const page=await fixture.connectTarget(target);
 await waitFor(()=>page.eval('document.readyState'),s=>s==='complete','source loaded '+tag);
 for(const type of ['mousePressed','mouseReleased'])
  await page.send('Input.dispatchMouseEvent',{type,x:100,y:50,button:'left',clickCount:1});
 page.close();
 const url=`${base}/target?v=${variant.name}&tag=${tag}`;
 const mark=await waitFor(()=>markFor(url),Boolean,'child '+tag);
 return {url,mark};
}
try{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-document-policy-'));
 await fixture.launch(config,root+'/case',{diskAssets:false,testHooks:true,pages:{base,close:()=>{}}});
 await installDriver(fixture.host);
 const kept=[];
 for(const variant of VARIANTS){
  // A live child: Chromium's own inheritance, and Blanc's mark of it.
  const child=await openChild(variant,'live');
  assertPolicy(variant,await probe(child.url,variant.name+' live'),child.mark,variant.name+' live');
  check(variant.name+' live flags',child.mark.flags);
  assert.equal(child.mark.canDuplicate,!variant.sandbox,variant.name+': Duplicate offered only unmarked');
  assert.equal(await nativeCall(fixture.host,'duplicateTab',[child.mark.id]),!variant.sandbox,variant.name+': duplicateTab');
  if(!variant.sandbox){
   const copies=(await marks()).filter(t=>t.url===child.url);
   assert.equal(copies.length,2,variant.name+': the control duplicates');
   await nativeCall(fixture.host,'closeTab',[copies.find(t=>t.id!==child.mark.id).id]);
  }
  check(variant.name+' duplicate refused',!child.mark.canDuplicate);
  // Recently closed: the rebuilt tab loads under the same flags.
  await nativeCall(fixture.host,'closeTab',[child.mark.id]);
  await waitFor(()=>markFor(child.url),m=>!m,variant.name+' closed');
  await nativeCall(fixture.host,'reopenClosedTab',[]);
  const reopened=await waitFor(()=>markFor(child.url),Boolean,variant.name+' reopened');
  assert.notEqual(reopened.id,child.mark.id,variant.name+': a rebuilt tab');
  assert.equal(reopened.flags,child.mark.flags,variant.name+': reopened with the same flags');
  assertPolicy(variant,await probe(child.url,variant.name+' reopened'),reopened,variant.name+' reopened');
  check(variant.name+' reopened flags',reopened.flags);
  kept.push({variant,url:child.url,flags:child.mark.flags});
 }
 // Relaunch: session restore rebuilds each tab under its saved flags.
 await fixture.stop();
 await fixture.start();
 await installDriver(fixture.host);
 for(const {variant,url,flags} of kept){
  const restored=await waitFor(()=>markFor(url),Boolean,variant.name+' restored');
  // A background restored tab loads when shown.
  await nativeCall(fixture.host,'switchTab',[restored.id]);
  assert.equal(restored.flags,flags,variant.name+': restored with the same flags');
  assertPolicy(variant,await probe(url,variant.name+' restored'),await markFor(url),variant.name+' restored');
  check(variant.name+' restored flags',restored.flags);
 }
 result.checkCount=checks;
 result.status='passed';
}catch(e){result.status='failed';result.error=String(e.stack||e);result.marks=await marks().catch(()=>null);}
finally{result.browserExit=await fixture.close();server.close();
 if(result.status==='passed'&&result.browserExit?.code!==0)result.status='failed';
 fs.writeFileSync(outFile,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({status:result.status,checks:result.checks,error:result.error?.split('\n')[0]}));}
if(result.status!=='passed')process.exitCode=1;
