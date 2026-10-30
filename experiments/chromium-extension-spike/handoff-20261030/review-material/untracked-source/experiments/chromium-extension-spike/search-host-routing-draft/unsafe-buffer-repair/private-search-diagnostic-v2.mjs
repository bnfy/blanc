// Prepared-only exploratory fixture: never claims outbound isolation or release acceptance.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connect, pause } from '../../evidence/tab-selection-port-20261028/cdp.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)), draft=path.dirname(dir);
const preview='<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview';
const ev=path.join(preview,'evidence/search-host-routing-20261029');
const app=path.join(ev,'unverified-search-candidate.app');
const exe=path.join(app,'Contents/MacOS/Blanc Prototype');
const framework=path.join(app,'Contents/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework');
const assets=path.join(ev,'preserved-assets-v1');
const blocker=path.join(preview,'artifacts/procedural-groups-combined-20261028');
const nativeReceipt=path.join(dir,'native-receipt-built.json');
const preservedReceipt=path.join(ev,'preserved-candidate-receipt.json');
const manifest=path.join(draft,'proposed-assets-manifest.json');
const expectedFramework='7428bc301fdaf9e2a559133e0e1ce2de5f8e6785a022a36313bdbfbb5d2bcaad';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const wait=async(fn,predicate,description)=>{let last;for(let i=0;i<250;i++){let v;try{v=await fn();last=null}catch(e){last=e}if(predicate(v))return v;await pause(100)}throw Error(`Timed out: ${description}${last?`; ${last.message}`:''}`)};
function mapPrivateTargets(targetInfos,url){
 const pages=targetInfos.filter(t=>t.type==='page'&&t.url===url);
 if(pages.length!==1||!pages[0].browserContextId)return null;
 const hosts=targetInfos.filter(t=>typeof t.url==='string'&&t.url.endsWith('/host.html')&&t.browserContextId===pages[0].browserContextId);
 if(hosts.length!==1)return null;
 return {pageTargetId:pages[0].targetId,hostTargetId:hosts[0].targetId,browserContextId:pages[0].browserContextId,uniqueUrl:url};
}
function inventory(root){const result={};function visit(dir,prefix=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const rel=path.join(prefix,e.name),p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error(`Symlink in asset inventory: ${rel}`);if(e.isDirectory())visit(p,rel);else if(e.isFile())result[rel]=sha(p);else throw Error(`Unexpected asset: ${rel}`)}}visit(root);return result}
function verify(){
 assert.equal(sha(nativeReceipt),'efdf044a1af9428c90fa74a49ce98c3cd535b4c5142a12405e3ea6884b19c10b');
 assert.equal(sha(preservedReceipt),'ab141b1d916134af1df7a37a18f902c32a794ffad8490500c4dca70c5495f335');
 assert.equal(sha(manifest),'4402d3f13ffcf792808caf412279701b85b7f78bbc6083635b74e744629abd57');
 assert.equal(sha(exe),'356913e1d2e1c334715b7a41f0fd2d4ec4d1aea01cf2f12b8f8be7f29e6e177d');assert.equal(sha(framework),expectedFramework);
 const receipt=JSON.parse(fs.readFileSync(nativeReceipt));const saved=JSON.parse(fs.readFileSync(preservedReceipt));
 assert.equal(receipt.frameworkSha256,expectedFramework);assert.equal(saved.framework,expectedFramework);assert.equal(saved.archive,app);assert.equal(saved.assets,assets);
 assert.equal(receipt.buildSuccess,true);assert.equal(receipt.guardZeroActions,true);
 assert.equal(sha(path.join(draft,'blanc_prototype_ui.candidate.cc')),receipt.sourceSha256);
 const expected={...receipt.moduleSha256};assert.equal(Object.keys(expected).length,7);
 for(const [name,hash] of Object.entries(expected)){assert.match(name,/^(custom_template|selected_custom|selected_shipping)(?:_browser)?\.(?:cc|h)$/);const file=name==='custom_template.cc'?path.join(dir,'modules',name):path.join(draft,'modules',name);assert.equal(sha(file),hash,`archived module ${name}`)}
 assert.deepEqual(inventory(assets),JSON.parse(fs.readFileSync(manifest)).files);
 const blockerManifest=JSON.parse(fs.readFileSync(path.join(preview,'evidence/development-matched-20261028/blocker-current-sha256.json')));assert.deepEqual(inventory(blocker),blockerManifest);
 return receipt;
}
// Walk open shadow roots without using privileged Settings internals.
const deep = `function all(root){const out=[];for(const e of root.querySelectorAll('*')){out.push(e);if(e.shadowRoot)out.push(...all(e.shadowRoot))}return out}`;
async function settingsSelect(settings, name) {
  await wait(() => settings.eval(`(()=>{${deep};const x=all(document).find(e=>e.id==='openDialogButton');if(!x)return false;x.click();return true})()`), Boolean, 'Settings search picker button');
  const available = await wait(() => settings.eval(`(()=>{${deep};const d=all(document).find(e=>e.localName==='settings-search-engine-list-dialog');return d?.searchEngines?.map(e=>({id:e.id,name:e.name,default:e.default}))||null})()`), x => Array.isArray(x) && x.length, 'Settings search choices');
  const item = available.find(e => e.name.toLowerCase() === name.toLowerCase());
  if (!item) { await settings.eval(`(()=>{${deep};all(document).find(e=>e.id==='cancelButton')?.click()})()`); return { available: false, choices: available.map(x=>x.name) }; }
  const clicked = await settings.eval(`(()=>{${deep};const d=all(document).find(e=>e.localName==='settings-search-engine-list-dialog');const b=d&&all(d.shadowRoot).find(e=>e.localName==='cr-radio-button'&&e.getAttribute('name')===${JSON.stringify(String(item.id))});if(!b)return false;b.click();return true})()`);
  assert.equal(clicked, true, 'actual Settings radio control');
  await settings.eval(`(()=>{${deep};const d=all(document).find(e=>e.localName==='settings-search-engine-list-dialog');const b=d&&all(d.shadowRoot).find(e=>e.id==='setAsDefaultButton');if(!b||b.disabled)throw Error('Save button unavailable');b.click()})()`);
  await wait(() => settings.eval(`(()=>{${deep};return all(document).find(e=>e.classList?.contains('search-engine-name'))?.textContent?.trim()})()`), x => x?.toLowerCase() === name.toLowerCase(), `Settings selects ${name}`);
  return { available: true, selected: name };
}
async function addAndSelectLocalProvider(settings, serverPort) {
  await settings.send('Page.navigate',{url:'chrome://settings/searchEngines'});
  await wait(()=>settings.eval('document.readyState'),x=>x==='complete','search engine settings ready');
  await wait(()=>settings.eval(`(()=>{${deep};const b=all(document).find(e=>e.id==='addSearchEngine');if(!b)return false;b.click();return true})()`),Boolean,'add search engine');
  await wait(()=>settings.eval(`(()=>{${deep};return !!all(document).find(e=>e.localName==='settings-search-engine-edit-dialog')})()`),Boolean,'engine editor');
  const values={searchEngine:'Fixture Local',keyword:'fixture-local',queryUrl:`http://127.0.0.1:${serverPort}/search?q=%s`};
  await settings.eval(`(()=>{${deep};const d=all(document).find(e=>e.localName==='settings-search-engine-edit-dialog');for(const [id,value] of Object.entries(${JSON.stringify(values)})){const input=all(d.shadowRoot).find(e=>e.id===id);if(!input)throw Error('missing '+id);input.value=value;input.dispatchEvent(new CustomEvent('value-changed',{detail:{value},bubbles:true,composed:true}));input.dispatchEvent(new Event('input',{bubbles:true,composed:true}));}return true})()`);
  await wait(()=>settings.eval(`(()=>{${deep};const d=all(document).find(e=>e.localName==='settings-search-engine-edit-dialog');const b=d&&all(d.shadowRoot).find(e=>e.id==='actionButton');if(!b||b.disabled)return false;b.click();return true})()`),Boolean,'save fixture provider');
  await wait(()=>settings.eval(`(()=>{${deep};return all(document).some(e=>e.localName==='settings-search-engine-entry'&&e.engine?.displayName==='Fixture Local')})()`),Boolean,'fixture provider entry');
  await settings.eval(`(()=>{${deep};const e=all(document).find(x=>x.localName==='settings-search-engine-entry'&&x.engine?.displayName==='Fixture Local');const b=e&&all(e.shadowRoot).find(x=>x.classList?.contains('icon-more-vert'));if(!b||b.disabled)throw Error('fixture menu unavailable');b.click();return true})()`);
  await wait(()=>settings.eval(`(()=>{${deep};const e=all(document).find(x=>x.localName==='settings-search-engine-entry'&&x.engine?.displayName==='Fixture Local');const b=e&&all(e.shadowRoot).find(x=>['makeDefault','makeDefaultOption'].includes(x.id)&&!x.hidden&&!x.disabled);if(!b)return false;b.click();return true})()`),Boolean,'select fixture default');
  await settings.send('Page.navigate',{url:'chrome://settings/search'});
  await wait(()=>settings.eval(`(()=>{${deep};return all(document).find(e=>e.classList?.contains('search-engine-name'))?.textContent?.trim()})()`),x=>x==='Fixture Local','fixture default readback');
}

async function enter(host){await host.eval(`(()=>{const f=document.getElementById('overlay');const x=f.contentDocument.getElementById('addressInput');x.dispatchEvent(new f.contentWindow.KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}))})()`)}
async function overlayState(host){return host.eval(`(()=>{const f=document.getElementById('overlay'),d=f.contentDocument,x=d?.getElementById('addressInput');const n=d?.getElementById('addressSubmissionNotice');return {hidden:f.hidden,value:x?.value,invalid:x?.getAttribute('aria-invalid'),focused:d?.activeElement===x,notice:n?.textContent,noticeHidden:n?.hidden,role:n?.getAttribute('role')}})()`)}
async function run(label){
 if(!/^[a-zA-Z0-9_-]{1,40}$/.test(label||''))throw Error('A fresh safe fixture label is required');
 const receipt=verify(),profile=path.join(dir,`local-profile-${label}`),output=path.join(dir,`local-${label}.json`),log=path.join(dir,`local-${label}.log`);
 for(const p of [profile,output,log])if(fs.existsSync(p))throw Error(`Fixture path already exists: ${p}`);
 const proof={kind:'exploratory-private-search-diagnostic',hostWideOutboundDenied:false,acceptance:false,complete:false,frameworkSha256:expectedFramework,sourceSha256:receipt.sourceSha256,moduleSha256:receipt.moduleSha256,syntheticOnly:true,checks:[],proxyRejects:0,normalExit:false,privateContextMapping:null,firstAttemptFailed:null,retryRequired:false,recoveredAfterRetry:false};
 const clients=[],requests=[];let proc,browser;
 const server=http.createServer((req,res)=>{requests.push(req.url);res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Local fixture</title>')});
 const proxy=http.createServer((req,res)=>{proof.proxyRejects++;res.writeHead(403);res.end()});
 proxy.on('connect',(_req,socket)=>{proof.proxyRejects++;socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')});
 proxy.on('clientError',(_err,socket)=>{proof.proxyRejects++;socket.destroy()});
 const attach=async target=>{const c=await connect(target);clients.push(c);return c};
 const done=p=>p?.exitCode!==null || p?.signalCode!==null;
 const ownDebugPort=async(p,file)=>await wait(()=>done(p)?{exited:true,code:p.exitCode,signal:p.signalCode}:{port:fs.readFileSync(file,'utf8').split('\n')[0]},x=>{if(x?.exited)throw Error(`browser exited before debug port: ${JSON.stringify(x)}`);return /^\d+$/.test(x?.port||'')},'own debug port').then(x=>x.port);
 let port,proxyPort,args;
 try{
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  await new Promise((resolve,reject)=>proxy.once('error',reject).listen(0,'127.0.0.1',resolve));
  port=server.address().port;proxyPort=proxy.address().port;
  args=[`--user-data-dir=${profile}`,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--blanc-prototype-assets=${assets}`,`--blanc-blocker-assets=${blocker}`,'--no-first-run','--no-default-browser-check','--use-mock-keychain','--disable-background-networking','--disable-quic',`--proxy-server=http://127.0.0.1:${proxyPort}`,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE [::1]',`http://127.0.0.1:${port}/`];
  proof.args=args;
  // Checks the loopback proxy itself, not whether every browser connection uses it.
  const proxyStatus=await new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:proxyPort,path:'http://synthetic.invalid/',method:'GET'},res=>{res.resume();res.once('end',()=>resolve(res.statusCode))});r.once('error',reject);r.end()});
  assert.equal(proxyStatus,403,'rejecting proxy self-test');proof.proxySelfTest=true;
  fs.mkdirSync(profile,{mode:0o700});if(fs.lstatSync(profile).isSymbolicLink())throw Error('Fixture profile symlink');
  const fd=fs.openSync(log,'wx',0o600);proc=spawn(exe,args,{stdio:['ignore',fd,fd]});fs.closeSync(fd);proc.once('error',e=>{proof.processError=e.message});
  const debugFile=path.join(profile,'DevToolsActivePort');const debugPort=await ownDebugPort(proc,debugFile);
  const list=()=>fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r=>r.json());
  browser=await attach(await fetch(`http://127.0.0.1:${debugPort}/json/version`).then(r=>r.json()));
  const host=await attach(await wait(async()=>(await list()).find(t=>t.url.endsWith('/host.html')),Boolean,'Island'));
  await wait(async()=>(await list()).find(t=>t.url===`http://127.0.0.1:${port}/`),Boolean,'local page');
  const created=await browser.send('Target.createTarget',{url:'chrome://settings/search'});
  const settings=await attach(await wait(async()=>(await list()).find(t=>t.id===created.targetId),Boolean,'Settings'));
  await wait(()=>settings.eval('document.readyState'),x=>x==='complete','Settings ready');
  await addAndSelectLocalProvider(settings,port);proof.checks.push('Settings selected local fixture provider');
  proof.checks.push('regular setup only; no regular search repeated');
  await browser.send('Browser.close');await wait(()=>done(proc),Boolean,'regular browser exit');
  assert.equal(proc.exitCode,0,'regular browser must exit normally');proof.regularExit=true;
  for(const c of clients.splice(0))c.close?.();browser=null;proc=null;
  // The stale debugging-port receipt belongs only to this disposable profile.
  fs.unlinkSync(debugFile);
  assert.equal(proxy.listening,true,'rejecting proxy must remain active');
  const privateUrl=`http://127.0.0.1:${port}/private-probe-${label}`;
  const fd2=fs.openSync(log,'a',0o600);proc=spawn(exe,[...args.slice(0,-1),'--incognito',privateUrl],{stdio:['ignore',fd2,fd2]});fs.closeSync(fd2);proc.once('error',e=>{proof.processError=e.message});
  const privatePort=await ownDebugPort(proc,debugFile);
  const privateList=()=>fetch(`http://127.0.0.1:${privatePort}/json/list`).then(r=>r.json());
  browser=await attach(await fetch(`http://127.0.0.1:${privatePort}/json/version`).then(r=>r.json()));
  const mapping=await wait(async()=>{const info=await browser.send('Target.getTargets');return mapPrivateTargets(info.targetInfos,privateUrl)},Boolean,'unique page and Island share one CDP browser context');
  proof.privateContextMapping=mapping;
  const privateHost=await attach(await wait(async()=>(await privateList()).find(t=>t.id===mapping.hostTargetId),Boolean,'mapped private Island'));
  const privateState=await wait(()=>privateHost.eval('BlancPrototypeHost.api.getAllTabs()'),x=>x?.tabs?.some(t=>t.private&&t.url===privateUrl),'mapped private state');
  const mappedTab=privateState.tabs.find(t=>t.private&&t.url===privateUrl);
  assert.equal(privateState.tabs.every(t=>t.private),true,'only primary private tabs');
  assert.equal(privateState.activeTabId,mappedTab.id,'mapped synthetic private page must be active');
  proof.privateDiagnostics={nativeAttempts:[],island:null,requestPaths:[]};
  const probeQuery='synthetic-private-native-probe-398241';
  for(let attempt=0;attempt<2;attempt++) {
    await privateHost.eval('BlancPrototypeHost.refresh()');
    const current=await privateHost.eval('BlancPrototypeHost.api.getAllTabs()');
    const target=current.tabs.find(t=>t.id===current.activeTabId);
    assert.ok(target?.private,'current primary private tab required');
    const result=await privateHost.eval(`BlancPrototypeHost.api.search(${JSON.stringify(target.id)},${JSON.stringify(probeQuery)}).then(value=>({ok:true,value}),error=>({ok:false,error:String(error?.message||error)}))`);
    proof.privateDiagnostics.nativeAttempts.push({attempt:attempt+1,result,tabId:target.id,documentId:target.searchDocumentId,committedUrl:target.committedUrl,selectionEpoch:current.searchSelectionEpoch});
    if(attempt===0)proof.firstAttemptFailed=!result.ok;
    if(attempt===1&&result.ok)proof.recoveredAfterRetry=true;
    // The native message conflates unavailable and loading; this single retry
    // probes readiness without asserting which case occurred.
    if(result.ok || !/selected search provider is loading or unavailable/i.test(result.error||''))break;
    if(attempt===0){proof.retryRequired=true;await pause(1000)}
  }
  const islandQuery='synthetic-private-island-probe-398241';await privateHost.eval(`BlancPrototypeHost.open(true,${JSON.stringify(islandQuery)})`);
  await wait(()=>overlayState(privateHost),x=>!x.hidden&&x.value===islandQuery,'private synthetic input');await enter(privateHost);
  const islandPath=`/search?q=${encodeURIComponent(islandQuery)}`;
  await wait(async()=>({state:await overlayState(privateHost),arrived:requests.includes(islandPath)}),x=>x.arrived||x.state.invalid==='true','private island response').catch(e=>{proof.privateDiagnostics.islandWaitError=e.message});
  proof.privateDiagnostics.island={state:await overlayState(privateHost),loopbackArrived:requests.includes(islandPath)};
  proof.privateDiagnostics.requestPaths=requests.slice();
  const nativePath=`/search?q=${encodeURIComponent(probeQuery)}`;
  assert.ok(proof.privateDiagnostics.nativeAttempts.some(x=>x.result.ok)&&requests.includes(nativePath),'private native search must commit to loopback');
  assert.ok(proof.privateDiagnostics.island.loopbackArrived&&proof.privateDiagnostics.island.state.hidden,'private Island search must commit to loopback');
  proof.checks.push('private native and Island searches reached selected loopback provider');
  await browser.send('Browser.close');await wait(()=>done(proc),Boolean,'private browser exit');assert.equal(proc.exitCode,0,'private browser must exit normally');proof.privateExit=true;
  for(const c of clients.splice(0))c.close?.();browser=null;
  const history=path.join(profile,'Default/History');assert.ok(fs.existsSync(history),'owned regular History required');
  const count=Number(execFileSync('/usr/bin/sqlite3',['-readonly',history,"SELECT count(*) FROM urls WHERE instr(url, 'synthetic-private-') > 0;"],{encoding:'utf8'}).trim());
  assert.equal(count,0,'private marker absent from closed regular History');proof.checks.push('private marker absent from closed regular History');
  assert.doesNotMatch(fs.readFileSync(log,'utf8'),/sandbox initialization failed|Failed to initialize sandbox/i,'known native sandbox initialization failure');
  proof.exploratoryPass=proof.firstAttemptFailed===false;
  if(proof.firstAttemptFailed)proof.firstAttemptNote='First private native search failed; later recovery does not make this an exploratory pass.';
 }catch(e){proof.error=e.stack;proof.exploratoryPass=false}
 finally{
  if(browser)await browser.send('Browser.close').catch(()=>{});for(const c of clients)c.close?.();
  if(proc&&!done(proc))await wait(()=>done(proc),Boolean,'browser normal exit').catch(async e=>{proof.exitError=e.message;proc.kill('SIGTERM');await wait(()=>done(proc),Boolean,'owned browser SIGTERM exit').catch(x=>{proof.terminationError=x.message})});
  if(proc)proof.processExit={code:proc.exitCode,signal:proc.signalCode};
  proof.normalExit=proof.regularExit===true&&proof.privateExit===true;proof.proxyActive=proxy.listening;proof.requests=requests;
  if(server.listening)await new Promise(resolve=>server.close(resolve));if(proxy.listening)await new Promise(resolve=>proxy.close(resolve));
  fs.writeFileSync(output,JSON.stringify(proof,null,2),{flag:'wx',mode:0o600});
 }
 process.exitCode=proof.exploratoryPass&&proof.normalExit?0:1;
 console.log(JSON.stringify({exploratoryPass:!!proof.exploratoryPass,normalExit:proof.normalExit,firstAttemptFailed:proof.firstAttemptFailed,retryRequired:proof.retryRequired,recoveredAfterRetry:proof.recoveredAfterRetry,acceptance:false,error:proof.error||null}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run(process.argv[2]);
