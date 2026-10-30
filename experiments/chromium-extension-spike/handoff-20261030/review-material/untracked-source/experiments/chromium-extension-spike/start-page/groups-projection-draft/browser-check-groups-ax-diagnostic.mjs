// Diagnostic only: a disposable, owned regular browser fixture observes one
// real pointer-driven group activation. Native widget state is not exposed.
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {connect,pause} from '../../evidence/tab-selection-port-20261028/cdp.mjs';
import {observeChild} from '../launch-sunrise-integration-draft/fixture-child-state.mjs';
import {activeUrlMatches} from '../launch-sunrise-integration-draft/fixture-readiness.mjs';
import {hasPair,outsideVisiblePair} from '../launch-sunrise-integration-draft/foreground-fixture-predicates.mjs';
import {syncLineage} from './sync-lineage.mjs';
import {readyMarkerSource,usableControl,privateGroupPresent} from './fixture-groups-readiness.mjs';
import {installFocusObserver} from './focus-observer.mjs';
import {installRawReplyObserver} from './raw-reply-observer.mjs';
import {checkAXTrust,observeOwnedFixture,ObserverNotExitedError,AXDiagnosticError} from './ax-focus-diagnostic/bridge.mjs';
import {writeAndSync} from './ax-focus-diagnostic/writer.mjs';
import {redact} from './ax-focus-diagnostic/redact.mjs';

const preview='<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview';
const draft=preview+'/repo/experiments/chromium-extension-spike/start-page/groups-projection-draft';
const evidence=preview+'/evidence/start-page-groups-20261029',assets=draft+'/assets-visible-v2';
const chromium='<local-home>/Projects/BlancChromium158/src';
const app=chromium+'/out/BlancPrototype/Blanc Prototype.app/Contents';
const exe=app+'/MacOS/Blanc Prototype',framework=app+'/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework';
const [label,expectedFramework,receiptPath,scenario]=process.argv.slice(2);
const scenarios=['regular'];
if(!/^[a-z0-9-]+$/.test(label||'')||!/^[a-f0-9]{64}$/.test(expectedFramework||'')||!receiptPath?.startsWith('/')||!scenarios.includes(scenario))throw Error('usage: node browser-check-groups-raw-reply-diagnostic.mjs fresh-label verified-framework-sha256 trusted-build-receipt.json scenario');
// Record even a preflight failure; exclusive creation keeps old evidence intact.
fs.mkdirSync(evidence,{recursive:true});
syncLineage(fs,evidence,preview);
const preflightPath=`${evidence}/${label}-preflight.json`;
const preflight={label,scenario,status:'in-progress',startedEpoch:Date.now()/1000};
function syncEvidenceDir() { const fd=fs.openSync(evidence,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);} }
writeAndSync(preflightPath,preflight,'wx');syncEvidenceDir();
const savePreflight=()=>{const tmp=preflightPath+'.new';writeAndSync(tmp,preflight,'wx');fs.renameSync(tmp,preflightPath);syncEvidenceDir();};
const lockRoot=chromium+'/out/BlancPrototype';
const sunriseLock=lockRoot+'/.blanc-sunrise-transaction.lock',buildLock=lockRoot+'/.blanc-build-guard.lock';
const owner=JSON.stringify({pid:process.pid,createdEpoch:Date.now()/1000})+'\n';
let sunriseHeld=false,buildHeld=false,sunriseOwnerWritten=false,buildOwnerWritten=false,lockMayRelease=true;
function noActiveBuild(){
  const processes=execFileSync('/bin/ps',['-axo','pid=,comm='],{encoding:'utf8'});
  for(const line of processes.split('\n')){const match=line.trim().match(/^(\d+)\s+(.+)$/);if(match&&['ninja','autoninja','siso'].includes(match[2].split('/').at(-1).toLowerCase()))throw Error('build process active: '+match[1]);}
}
try {
  fs.mkdirSync(sunriseLock);sunriseHeld=true;
  fs.writeFileSync(sunriseLock+'/owner.json',owner,{flag:'wx'});sunriseOwnerWritten=true;
  fs.mkdirSync(buildLock);buildHeld=true;
  fs.writeFileSync(buildLock+'/owner.json',owner,{flag:'wx'});buildOwnerWritten=true;
  noActiveBuild();
  const profile=`${evidence}/profile-${label}`,result=`${evidence}/${label}.json`;
  if(fs.existsSync(profile)||fs.existsSync(result))throw Error('fixture already exists');
  const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const manifestPath=draft+'/manifest-visible-v2.json',baseManifestPath=draft+'/manifest.json',linkPath=draft+'/asset-only-visible-v2-link.json';
  const manifest=JSON.parse(fs.readFileSync(manifestPath)),baseManifest=JSON.parse(fs.readFileSync(baseManifestPath)),link=JSON.parse(fs.readFileSync(linkPath));
  const receipt=JSON.parse(fs.readFileSync(receiptPath));
  if(sha(linkPath)!=='f0ab9cb5054e7a67086302823de8b37b533736c21e0bff74f43f192ddb594e12'||
     link.kind!=='asset-only-group-visibility'||sha(receiptPath)!==link.nativeBuildReceiptSha256||
     expectedFramework!==link.nativeFrameworkSha256||sha(baseManifestPath)!==link.baseManifestSha256||
     sha(manifestPath)!==link.candidateManifestSha256||link.changedPath!=='pages/newtab-prototype.css'||
     baseManifest.assets[link.changedPath]!==link.baseCssSha256||manifest.assets[link.changedPath]!==link.candidateCssSha256||
     JSON.stringify(baseManifest.overlay)!==JSON.stringify(manifest.overlay))
    throw Error('asset-only candidate link is invalid');
  const delta=Object.keys(manifest.assets).filter(k=>manifest.assets[k]!==baseManifest.assets[k]);
  if(Object.keys(manifest.assets).length!==Object.keys(baseManifest.assets).length||delta.length!==1||delta[0]!==link.changedPath)
    throw Error('asset-only candidate has unexpected differences');
  if(receipt.status!=='verified' || receipt.frameworkSha256!==expectedFramework ||
     receipt.overlayManifestSha256!==sha(baseManifestPath) ||
     receipt.guardActions!==0 || receipt.buildExit!==0 || receipt.guardExit!==0)
    throw Error('trusted native build receipt mismatch');
  if(sha(framework)!==expectedFramework)throw Error('framework differs from supplied verified build');
  for(const [name,digest] of Object.entries(manifest.overlay))if(sha(`${chromium}/${name}`)!==digest)throw Error('checkout differs from reviewed overlay: '+name);
  const guard=receiptPath.replace(/[^/]+$/, 'guard.log');
  if(!/ninja: no work to do\./.test(fs.readFileSync(guard,'utf8'))||!/Build Succeeded: 0 steps/.test(fs.readFileSync(guard,'utf8')))throw Error('zero-action build guard missing');
  if(sha(guard)!==receipt.guardPlanSha256)throw Error('guard does not match build receipt');
  const guardTime=fs.statSync(guard).mtimeMs;
  for(const p of [framework,...Object.keys(manifest.overlay).map(name=>`${chromium}/${name}`)])if(fs.statSync(p).mtimeMs>guardTime)throw Error('guard predates output or staged source');
  const files=(root,prefix='')=>fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>{
    const p=prefix?`${prefix}/${e.name}`:e.name;if(e.isSymbolicLink())throw Error('unexpected symlink '+p);
    return e.isDirectory()?files(`${root}/${e.name}`,p):e.isFile()?[p]:[];
  });
  // The receipt must bind the entire candidate bundle, including its main
  // executable and framework resources; a framework hash alone is insufficient.
  const inventoryPath=receiptPath.replace(/[^/]+$/, 'app-inventory.json');
  if(fs.lstatSync(inventoryPath).isSymbolicLink()||!/^([a-f0-9]{64})$/.test(receipt.appInventorySha256||'')||sha(inventoryPath)!==receipt.appInventorySha256)
    throw Error('trusted receipt lacks exact app inventory');
  const expectedApp=JSON.parse(fs.readFileSync(inventoryPath));
  const bundle=app.slice(0,-'/Contents'.length),canonicalBundle=fs.realpathSync(bundle);
  const bundleInventory=(root,prefix='')=>Object.fromEntries(fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>{
    const name=prefix?`${prefix}/${e.name}`:e.name,p=`${root}/${e.name}`;
    if(e.isSymbolicLink()){const resolved=fs.realpathSync(p);if(!resolved.startsWith(canonicalBundle+'/'))throw Error('bundle symlink escapes: '+name);return [[name,{symlink:fs.readlinkSync(p)}]];}
    if(e.isDirectory())return Object.entries(bundleInventory(p,name));
    return e.isFile()?[[name,{sha256:sha(p)}]]:[];
  }).sort(([a],[b])=>a.localeCompare(b)));
  const normalized=o=>Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b)));
  if(!expectedApp['Contents/MacOS/Blanc Prototype']||!expectedApp['Contents/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework'])throw Error('inventory omits executable or framework');
  assert.deepEqual(bundleInventory(bundle),normalized(expectedApp));
  assert.deepEqual(files(assets).sort(),Object.keys(manifest.assets).sort());
  for(const [name,digest] of Object.entries(manifest.assets))if(sha(`${assets}/${name}`)!==digest)throw Error('asset mismatch '+name);
  const blocker=preview+'/artifacts/procedural-groups-combined-20261028';
  const blockers=JSON.parse(fs.readFileSync(preview+'/evidence/development-matched-20261028/blocker-current-sha256.json'));
  assert.deepEqual(files(blocker).sort(),Object.keys(blockers).sort());
  for(const [name,digest] of Object.entries(blockers))if(sha(`${blocker}/${name}`)!==digest)throw Error('blocker mismatch '+name);
  checkAXTrust(); // Read-only trust check; never request accessibility permission.
  preflight.axTrust='confirmed';
  preflight.status='passed';preflight.completedEpoch=Date.now()/1000;preflight.framework=expectedFramework;preflight.receiptSha256=sha(receiptPath);preflight.appInventorySha256=receipt.appInventorySha256;preflight.assetLinkSha256=sha(linkPath);preflight.candidateManifestSha256=sha(manifestPath);savePreflight();
  const sockets=new Set();const track=s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));};
  const proxy=net.createServer(socket=>{track(socket);socket.destroy()});
  const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<title>Sunrise isolated test</title>')});
  server.on('connection',track);
  const proof={label,scenario,framework:expectedFramework,manifest:sha(manifestPath),receiptSha256:sha(receiptPath),appInventorySha256:receipt.appInventorySha256,assetLinkSha256:sha(linkPath),baseManifestSha256:sha(baseManifestPath),checks:[],diagnostics:[],console:[],exits:[],errors:[],cleanup:[],pass:false,qualification:'Single real-pointer foreground group-focus diagnostic in an isolated profile. JS observation wraps the original handler and raw request/reply without issuing extra focus calls; AX samples approximate focus; native widget state remains unobserved. Loopback proxy/resolver do not prove host-wide outbound denial. No physical accessibility or installed-shipping comparison.'};
  let proc,childState,browser,host,hostContext,port,clients=[],phase=0,diagnosticPage=null,diagnosticGroupId=null,diagnosticLayout=null,axObserver=null;
  const exited=()=>!!childState&&childState.exited();
  const wait=async(fn,accept,what)=>{for(let n=0;n<300;n++){if(childState?.error)throw childState.error;if(exited())throw Error('owned browser exited while waiting for '+what);let v;try{v=await fn()}catch{}if(accept(v))return v;await pause(100)}throw Error('Timed out: '+what)};
  const waitForExit=async()=>{for(let n=0;n<80&&!exited();n++)await pause(100);return exited()};
  const list=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
  const rec=(name,detail=true)=>{proof.checks.push({name,detail});console.log(name,JSON.stringify(redact(detail)))};
  const api=(name,...args)=>host.eval(`BlancPrototypeHost.api.${name}(...${JSON.stringify(args)})`);
  const freshSnapshot=()=>host.eval('BlancPrototypeHost.refresh().then(() => BlancPrototypeHost.api.getAllTabs())');
  async function launch(privateMode=false) {
    noActiveBuild();
    phase++;const fd=fs.openSync('/dev/null','w'); // No browser log can capture titles or URLs.
    const activePort=profile+'/DevToolsActivePort';if(fs.existsSync(activePort))fs.unlinkSync(activePort);
    const started=Date.now();
    try{proc=spawn(exe,[`--user-data-dir=${profile}`,'--remote-debugging-port=0',`--blanc-prototype-assets=${assets}`,`--blanc-blocker-assets=${blocker}`,`--proxy-server=http://127.0.0.1:${proxy.address().port}`,'--proxy-bypass-list=127.0.0.1;localhost','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1','--disable-background-networking','--disable-quic',...(privateMode?['--incognito']:[]),'--no-first-run','--no-default-browser-check','--use-mock-keychain','about:blank'],{stdio:['ignore',fd,fd]});childState=observeChild(proc);}finally{fs.closeSync(fd);}
    const portData=await wait(()=>{try{return fs.readFileSync(activePort,'utf8').trim().split('\n')}catch{return null}},v=>v?.length===2&&/^\d+$/.test(v[0])&&/^\/devtools\/browser\/[a-f0-9-]+$/.test(v[1]),'owned DevToolsActivePort');
    port=Number(portData[0]);if(port<1024||port>65535)throw Error('invalid owned DevTools port');
    const version=await wait(()=>fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()),v=>v?.webSocketDebuggerUrl,'owned debugger');
    const ws=new URL(version.webSocketDebuggerUrl);
    if(exited()||ws.protocol!=='ws:'||ws.hostname!=='127.0.0.1'||Number(ws.port)!==port||ws.pathname!==portData[1])throw Error('debugger identity mismatch');
    browser=await connect(version);clients.push(browser);
    const selected=await wait(async()=>{
      const details=(await browser.send('Target.getTargets')).targetInfos;
      for(const target of (await list()).filter(t=>t.url.endsWith('/host.html'))){
        const info=details.find(t=>t.targetId===target.id);if(!info?.browserContextId)continue;
        let candidate;try{
          candidate=await connect(target);const tabs=await candidate.eval('BlancPrototypeHost.api.getAllTabs()');
          if(Array.isArray(tabs?.tabs)&&tabs.tabs.length&&tabs.activeTabId&&tabs.tabs.every(t=>t.private===privateMode)&&tabs.tabs.some(t=>t.id===tabs.activeTabId&&t.private===privateMode))
            return {candidate,context:info.browserContextId};
        }catch{}if(candidate)candidate.close();
      }
      return null;
    },Boolean,'host with matching context and active profile');
    host=selected.candidate;hostContext=selected.context;clients.push(host);
    return started;
  }
  async function close(){
    await browser.send('Browser.close');if(!await waitForExit())throw Error('browser did not exit after close');assert.equal(proc.exitCode,0,'browser exit');proof.exits.push({phase,exitCode:proc.exitCode});
    clients.forEach(c=>c.close());clients=[];host=null;browser=null;proc=null;childState=null;
  }
  async function target(url){const result=await wait(async()=>{const all=await list();const context=(await browser.send('Target.getTargets')).targetInfos;const matches=all.filter(t=>t.type==='page'&&t.url===url&&context.some(i=>i.targetId===t.id&&i.browserContextId===hostContext));return matches.length===1?{target:matches[0]}:matches.length>1?{ambiguous:matches.length}:null},Boolean,'fixture target');if(result.ambiguous)throw Error('ambiguous target: '+result.ambiguous);return result.target}
  async function attach(t){const c=await connect(t,msg=>{
    if(msg.method==='Runtime.exceptionThrown')proof.errors.push('runtime exception');
    if(msg.method==='Runtime.consoleAPICalled'&&proof.console.length<100)proof.console.push({type:msg.params.type});
  });clients.push(c);await c.send('Page.enable');await c.send('Runtime.enable');return c}
  async function clickVisible(page,selector){
    const hit=await wait(()=>page.eval(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return null;const r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,top=document.elementFromPoint(x,y),style=getComputedStyle(node);return {x,y,width:r.width,height:r.height,visible:r.width>0&&r.height>0&&style.visibility==='visible'&&style.display!=='none',disabled:node.disabled===true,hit:!!top&&(top===node||node.contains(top)),inViewport:x>=0&&y>=0&&x<innerWidth&&y<innerHeight}})()`),usableControl,'visible unoccluded control '+selector);
    if(selector==='#groupsList [data-group-id]')proof.diagnostics.push({point:'pointer-hit-test',groupId:diagnosticGroupId,hit});
    await page.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:hit.x,y:hit.y});
    if(selector==='#groupsList [data-group-id]'&&axObserver)await axObserver.mark('before-click');
    await page.send('Input.dispatchMouseEvent',{type:'mousePressed',x:hit.x,y:hit.y,button:'left',clickCount:1});
    await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:hit.x,y:hit.y,button:'left',clickCount:1});
    return hit;
  }
  async function selectLayout(page,layout){
    if(!await page.eval(`document.getElementById('customizePopover').matches(':popover-open')`))await clickVisible(page,'#customizeButton');
    await wait(()=>page.eval(`document.getElementById('customizePopover').matches(':popover-open')`),Boolean,'Customize popover');
    await clickVisible(page,`[data-layout-pick="${layout}"]`);
    await wait(()=>page.eval(`document.body.dataset.layout===${JSON.stringify(layout)}&&document.querySelector(${JSON.stringify(`[data-layout-pick="${layout}"]`)}).getAttribute('aria-pressed')==='true'`),Boolean,'selected layout '+layout);
    await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
    await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
    await wait(()=>page.eval(`!document.getElementById('customizePopover').matches(':popover-open')`),Boolean,'Customize popover closed');
  }
  async function setEnabled(enabled,page=null) {
    let expectedTabId=null;
    if(!page){
      await api('openPage','settings');const hub=await attach(await target('chrome://blanc-prototype/settings-home.html'));
      const hubSnap=await wait(freshSnapshot,s=>activeUrlMatches(s,'chrome://blanc-prototype/settings-home.html'),'active Settings hub snapshot');
      expectedTabId=hubSnap.activeTabId;
      await wait(()=>hub.eval('document.readyState'),v=>v==='complete','settings hub');
      const links=await hub.eval(`[...document.querySelectorAll('nav a')].map(a=>a.href)`);
      assert(links.includes('chrome://blanc-prototype/appearance-settings.html')&&links.includes('chrome://blanc-prototype/blocking-settings.html')&&links.includes('chrome://settings/'));
      await hub.eval(`document.querySelector('a[href="chrome://blanc-prototype/appearance-settings.html"]').click()`);
      page=await attach(await target('chrome://blanc-prototype/appearance-settings.html'));
    }
    await wait(freshSnapshot,s=>activeUrlMatches(s,'chrome://blanc-prototype/appearance-settings.html')&&
      (expectedTabId===null||s.activeTabId===expectedTabId),'active Appearance snapshot');
    const read=()=>page.eval(`({disabled:document.getElementById('launch-sunrise').disabled,checked:document.getElementById('launch-sunrise').checked,status:document.getElementById('setting-status').textContent})`);
    const before=await wait(read,v=>v&&!v.disabled,'appearance ready');assert.equal(before.checked,!enabled,'unexpected initial preference');
    await page.eval(`document.getElementById('launch-sunrise').click()`);
    const after=await wait(read,v=>v&&!v.disabled&&v.checked===enabled&&v.status==='Saved on this device.','persisted setting');
    rec('normal Settings hub exposes Appearance and saves '+enabled,{before,after});
    return page;
  }
  function readStored(){const value=JSON.parse(fs.readFileSync(profile+'/Local State','utf8'));return value?.blanc?.prototype?.launch_sunrise??false}
  async function startPage(tag,background=false){
    const before=await api('getAllTabs');const url=`http://127.0.0.1:${server.address().port}/${tag}`;
    await api('createTab',url);const page=await attach(await target(url));
    const snap=await api('getAllTabs'),id=snap.activeTabId,active=snap.tabs.find(t=>t.id===id);assert(id&&active&&active.url===url,'new seed target is not the active host tab');
    assert.equal(await page.eval('typeof window.chrome?.send'),'undefined','web page unexpectedly has WebUI message bridge');
    if(background){
      if(!before.activeTabId)throw Error('no background-control tab');await api('switchTab',before.activeTabId);
      const control=await wait(freshSnapshot,s=>s.activeTabId===before.activeTabId&&s.tabs.some(t=>t.id===id&&t.url===url),'background control active');
      if(!outsideVisiblePair(control,id,before.activeTabId))throw Error('background target is active, split-visible or Glance-visible before claim');
      const seedVisibility=await page.eval(`({visibility:document.visibilityState,hidden:document.hidden,focus:document.hasFocus()})`);
      proof.diagnostics.push({point:'before-navigation',controlId:before.activeTabId,targetId:id,activeId:control.activeTabId,focusedTabId:control.focusedTabId??null,glanceTabId:control.glanceTabId??null,splits:control.splits??null,seedVisibility});
    }
    const inject=`Object.defineProperty(window,'bowserPages',{configurable:true,set(value){const original=value.start.data;value.start.data=async function(...args){const call={visibility:document.visibilityState,hidden:document.hidden,focus:document.hasFocus()};const result=await original.apply(this,args);if(!('__observedRealGrant' in window)){window.__observedRealGrant=result.launchSunrise;window.__grantObservation={grant:result.launchSunrise,atCall:call,atResponse:{visibility:document.visibilityState,hidden:document.hidden,focus:document.hasFocus()}}}return result};Object.defineProperty(window,'bowserPages',{value,writable:true,configurable:true});}});`;
    await page.send('Page.addScriptToEvaluateOnNewDocument',{source:inject});await page.send('Page.navigate',{url:'chrome://newtab/'});
    const grant=await wait(()=>page.eval('window.__observedRealGrant'),v=>typeof v==='boolean','real start-data grant '+tag);
    if(background){
      const after=await freshSnapshot();const observation=await page.eval('window.__grantObservation');
      proof.diagnostics.push({point:'after-grant',controlId:before.activeTabId,targetId:id,activeId:after.activeTabId,focusedTabId:after.focusedTabId??null,glanceTabId:after.glanceTabId??null,splits:after.splits??null,observation});
      if(!outsideVisiblePair(after,id,before.activeTabId))throw Error('target became active, split-visible or Glance-visible after claim');
    }
    return {page,grant,id};
  }
  async function nativeGroupRequest(page,method,args=[]){
    return await page.eval(`new Promise((resolve,reject)=>{
      const id='fixture-native-group-request',previous=window.blancNewTabReply;
      const timer=setTimeout(()=>{window.blancNewTabReply=previous;reject(Error('native group request timed out'))},2000);
      window.blancNewTabReply=(replyId,ok,value)=>{if(replyId!==id)return previous(replyId,ok,value);clearTimeout(timer);window.blancNewTabReply=previous;ok?resolve(value):reject(Error(value));};
      chrome.send('blancNewTab',[id,${JSON.stringify(method)},${JSON.stringify(args)}]);
    })`);
  }
  const readNativeGroups=page=>nativeGroupRequest(page,'groupsRead');
  async function createSeed(tag){
    const url=`http://127.0.0.1:${server.address().port}/${tag}`;
    await api('createTab',url);const page=await attach(await target(url));
    const snapshot=await freshSnapshot(),id=snapshot.activeTabId;
    assert(id&&snapshot.tabs.some(t=>t.id===id&&t.url===url&&t.private===(scenario==='private')),'seed is not active expected-profile tab');
    assert.equal(await page.eval('typeof window.chrome?.send'),'undefined');
    return {page,id,url};
  }
  async function navigateSeed(seed){
    const inject=`Object.defineProperty(window,'bowserPages',{configurable:true,set(value){const original=value.start.data;value.start.data=async function(...args){const call={visibility:document.visibilityState,hidden:document.hidden,focus:document.hasFocus()};const result=await original.apply(this,args);if(!('__observedRealGrant' in window)){window.__observedRealGrant=result.launchSunrise;window.__grantObservation={grant:result.launchSunrise,atCall:call,atResponse:{visibility:document.visibilityState,hidden:document.hidden,focus:document.hasFocus()}}}return result};Object.defineProperty(window,'bowserPages',{value,writable:true,configurable:true});}});`;
    await seed.page.send('Page.addScriptToEvaluateOnNewDocument',{source:inject});
    await seed.page.send('Page.navigate',{url:'chrome://newtab/'});
    const grant=await wait(()=>seed.page.eval('window.__observedRealGrant'),v=>typeof v==='boolean','real split/Glance grant');
    const observation=await seed.page.eval('window.__grantObservation');return {grant,observation};
  }
  function pairVisible(s,kind,first,second){
    if(kind==='glance')return s.activeTabId===first&&s.glanceTabId===second;
    return s.activeTabId===first&&s.splits?.some(split=>Array.isArray(split.tabIds)&&split.tabIds.length===2&&split.tabIds.includes(first)&&split.tabIds.includes(second));
  }
  async function checkPair(kind,pane,started){
    const first=await createSeed(kind+'-main'),second=await createSeed(kind+'-reference');
    await api('switchTab',first.id);
    const create=kind==='glance'?'previewGlancePair':'createSplit';
    const result=await api(create,first.id,second.id);assert(result,'pair creation refused');
    const before=await wait(freshSnapshot,s=>pairVisible(s,kind,first.id,second.id),'visible '+kind+' pair');
    const targetSeed=pane==='main'?first:second;
    const actual=await navigateSeed(targetSeed);
    const after=await freshSnapshot();
    proof.diagnostics.push({kind,pane,first:first.id,second:second.id,before:{active:before.activeTabId,focused:before.focusedTabId,glance:before.glanceTabId,splits:before.splits},after:{active:after.activeTabId,focused:after.focusedTabId,glance:after.glanceTabId,splits:after.splits},observation:actual.observation});
    assert(pairVisible(after,kind,first.id,second.id),'pair no longer visible after grant');
    assert(Date.now()-started<30000,'fixture exceeded launch window');
    assert.equal(actual.grant,true,kind+' '+pane+' did not receive a grant');
    rec(kind+' '+pane+' receives real native grant');
  }
  async function checkInactiveSplit(started){
    const first=await createSeed('inactive-main'),second=await createSeed('inactive-reference');
    await api('switchTab',first.id);assert(await api('createSplit',first.id,second.id));
    await wait(freshSnapshot,s=>pairVisible(s,'split',first.id,second.id),'split before deactivation');
    const control=await createSeed('inactive-control');
    const before=await wait(freshSnapshot,s=>hasPair(s,first.id,second.id)&&outsideVisiblePair(s,second.id,control.id)&&outsideVisiblePair(s,first.id,control.id),'inactive split persists with control outside it');
    const actual=await navigateSeed(second),after=await freshSnapshot();
    proof.diagnostics.push({kind:'inactive-split',first:first.id,second:second.id,control:control.id,before:{active:before.activeTabId,glance:before.glanceTabId??null,splits:before.splits},after:{active:after.activeTabId,glance:after.glanceTabId??null,splits:after.splits},observation:actual.observation});
    assert(hasPair(after,first.id,second.id)&&outsideVisiblePair(after,second.id,control.id)&&outsideVisiblePair(after,first.id,control.id),'inactive pair or control identity changed after claim');
    assert(Date.now()-started<30000,'fixture exceeded launch window');
    assert.equal(actual.grant,false,'inactive split received a grant');rec('inactive split denied');
    const next=await startPage('inactive-then-visible');
    assert(Date.now()-started<30000,'fixture exceeded launch window before visible claim');
    assert.equal(next.grant,true,'denied inactive split consumed the one-shot grant');rec('visible tab receives unspent grant');
  }
  try {
    await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve)});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
    fs.mkdirSync(profile,{mode:0o700});
    await launch(scenario==='private');
    const first=await createSeed('group-first'),second=await createSeed('group-second');
    await api('groupTabByName',first.id,'work');
    const grouped=await wait(freshSnapshot,s=>s.groups?.some(g=>g.name==='work')&&s.tabs?.some(t=>t.id===first.id&&t.groupId),'first group created');
    const groupId=grouped.tabs.find(t=>t.id===first.id).groupId;diagnosticGroupId=groupId;
    await api('setTabGroup',second.id,groupId);
    await wait(freshSnapshot,s=>s.tabs?.filter(t=>t.groupId===groupId).length===2,'two group members');
    const start=await createSeed('group-start');diagnosticPage=start.page;diagnosticLayout='ledger';
    await start.page.send('Page.addScriptToEvaluateOnNewDocument',{source:readyMarkerSource});
    await start.page.send('Page.navigate',{url:'chrome://newtab/'});
    await wait(()=>start.page.eval('window.__groupsFixtureReady===true'),Boolean,'Start Page data-ready event');
    await start.page.send('Page.bringToFront');
    await wait(()=>start.page.eval(`document.hasFocus()&&document.visibilityState==='visible'`),Boolean,'owned fixture Start Page foreground');
    await selectLayout(start.page,'ledger');
    await wait(()=>start.page.eval(`document.body.dataset.layout==='ledger'&&[...document.querySelectorAll('#groupsList [data-group-id]')].some(x=>x.dataset.groupId===${JSON.stringify(groupId)}&&x.getClientRects().length>0&&getComputedStyle(x).visibility==='visible')`),Boolean,'visible ledger group');
    // Wrap the real handler only to observe the call made by the pointer
    // click; no extra focusGroup request or replacement outcome is supplied.
    await start.page.eval(`(${installFocusObserver.toString()})()`);
    await start.page.eval(`(${installRawReplyObserver.toString()})()`);
    const before=await freshSnapshot();
    const beforePage=await start.page.eval(`({focus:document.hasFocus(),visibility:document.visibilityState})`);
    assert.equal(before.activeTabId,start.id,'Start Page not active before click');
    proof.diagnostics.push({point:'before-real-group-click',groupId,startId:start.id,firstId:first.id,host:{activeTabId:before.activeTabId,groups:before.groups,tabs:before.tabs.map(t=>({id:t.id,groupId:t.groupId,private:t.private}))},page:beforePage,nativeWidgetState:'unobserved: no existing read-only probe'});
    proof.axDiagnostic={phase:'window_lookup',observerExit:'not_started'};
    let nativeBounds;try{nativeBounds=await start.page.send('Browser.getWindowForTarget');}catch{throw new AXDiagnosticError('window_lookup_failed',{observerExit:'not_started'});}
    proof.axDiagnostic.phase='observer_start';
    axObserver=await observeOwnedFixture(proc,nativeBounds.bounds);
    proof.axDiagnostic={phase:'before_click',observerExit:'running'};
    const hit=await clickVisible(start.page,'#groupsList [data-group-id]');
    proof.axDiagnostic.phase='reply_wait';
    proof.diagnostics.push({point:'pointer-dispatched',groupId,hit});
    const click=await wait(()=>start.page.eval(`window.__focusFixtureClicks?.at(-1)`),Boolean,'real group click observation');
    const observation=await wait(()=>start.page.eval(`window.__focusFixtureCalls?.at(-1)`),v=>!!v?.finished,'real focusGroup response');
    proof.axDiagnostic.phase='after_reply';
    await axObserver.mark('after-reply');
    proof.axObservation=await axObserver.stop(); axObserver=null;
    proof.axDiagnostic={phase:'complete',observerExit:'confirmed'};
    const raw=await start.page.eval(`({requests:window.__focusRawRequests,replies:window.__focusRawReplies})`);
    const after=await freshSnapshot();
    const afterPage=await start.page.eval(`({focus:document.hasFocus(),visibility:document.visibilityState})`);
    proof.diagnostics.push({point:'after-real-group-click',groupId,hit,click,observation,raw,host:{activeTabId:after.activeTabId,groups:after.groups,tabs:after.tabs.map(t=>({id:t.id,groupId:t.groupId,private:t.private}))},page:afterPage,nativeWidgetState:'unobserved: no existing read-only probe'});
    assert.equal(click.id,groupId,'clicked wrong group');assert.equal(click.trusted,true,'click was not trusted');
    assert.equal(observation.args[0],groupId,'focusGroup received unexpected ID');
    assert.equal(raw.requests.length,1,'expected one native focusGroup request');
    assert.equal(raw.requests[0].groupId,groupId,'raw request group differs');
    assert.equal(raw.replies.length,1,'expected one correlated native reply');
    assert.equal(raw.replies[0].id,raw.requests[0].id,'raw reply request mismatch');
    assert.equal(observation.result,true,'real focusGroup denied or failed');
    await wait(freshSnapshot,s=>s.activeTabId===first.id,'first group tab active');
    rec('real foreground group click returned success and activated first member');
    await close();
    assert.deepEqual(proof.errors,[]);proof.pass=true;
  }catch(e){
    if(e instanceof ObserverNotExitedError){lockMayRelease=false;proof.cleanup.push('AX observer exit uncertain; guard retained');if(proof.axDiagnostic)proof.axDiagnostic.observerExit='uncertain';}
    if(e instanceof AXDiagnosticError&&proof.axDiagnostic){proof.axDiagnostic.reason=e.code;Object.assign(proof.axDiagnostic,e.detail);}
    proof.error=e instanceof ObserverNotExitedError?'AX observer exit uncertain':'isolated fixture failed';
    const detail={point:'failure-context',layout:diagnosticLayout,groupId:diagnosticGroupId,console:proof.console.slice(-30),nativeWidgetState:'unobserved: no existing read-only probe'};
    const bounded=(p)=>Promise.race([p,pause(2500).then(()=>{throw Error('diagnostic timeout')})]);
    if(diagnosticPage) {
      try{detail.page=await bounded(diagnosticPage.eval(`(()=>{const content=document.getElementById('startContent'),r=content?.getBoundingClientRect(),style=content&&getComputedStyle(content);return {ready:document.readyState,marker:window.__groupsFixtureReady===true,layout:document.body?.dataset.layout,visibility:document.visibilityState,startContent:content?{hidden:content.hidden,display:style.display,visibility:style.visibility,width:r.width,height:r.height}:null,groups:['groupsList','bbGroups','shGroups','tlGroups'].map(id=>{const n=document.getElementById(id);return n?{id,hidden:n.hidden,text:n.textContent,items:[...n.querySelectorAll('[data-group-id]')].map(x=>({id:x.dataset.groupId,text:x.textContent,visible:x.getClientRects().length>0&&getComputedStyle(x).visibility==='visible'})),retry:!!n.querySelector('[data-group-retry]')}:{id,missing:true}})}})()`));}catch(err){detail.pageError='diagnostic unavailable';}
      try{detail.observer=await bounded(diagnosticPage.eval(`({focus:document.hasFocus(),visibility:document.visibilityState,calls:window.__focusFixtureCalls??null,clicks:window.__focusFixtureClicks??null,rawRequests:window.__focusRawRequests??null,rawReplies:window.__focusRawReplies??null})`));}catch(err){detail.observerError='diagnostic unavailable';}
      try{detail.nativeGroups=await bounded(readNativeGroups(diagnosticPage));}catch(err){detail.nativeError='diagnostic unavailable';}
    }
    if(host)try{const snapshot=await bounded(freshSnapshot());detail.host={activeTabId:snapshot.activeTabId,groups:snapshot.groups,tabs:snapshot.tabs.map(t=>({id:t.id,groupId:t.groupId,private:t.private}))};}catch(err){detail.hostError='diagnostic unavailable';}
    proof.diagnostics.push(detail);
  }
  finally{
    if(axObserver)try{proof.axObservation=await axObserver.stop();if(proof.axDiagnostic)proof.axDiagnostic.observerExit='confirmed';}catch(e){if(e instanceof ObserverNotExitedError){lockMayRelease=false;if(proof.axDiagnostic)proof.axDiagnostic.observerExit='uncertain';}proof.pass=false;proof.cleanup.push('AX observer cleanup failed; lock retained if exit uncertain');}
    if(proc&&!exited()) {
      if(browser)try{await browser.send('Browser.close');if(!await waitForExit())throw Error('timeout');proof.cleanup.push('Browser.close completed');}catch(e){proof.cleanup.push('Browser.close failed');}
      if(!exited())try{if(!proc.pid)throw Error('spawn has no child PID');proc.kill('SIGTERM');await waitForExit();proof.cleanup.push(!exited()?'owned process still live after SIGTERM':'owned process exited after SIGTERM');}catch(e){proof.cleanup.push('owned process termination failed');}
      if(!exited()){proof.pass=false;lockMayRelease=false;}
    }
    clients.forEach(c=>c.close());
    for(const s of sockets)s.destroy();
    async function shutdown(name,listener){if(!listener.listening){proof.cleanup.push(name+' not listening');return}try{await Promise.race([new Promise((resolve,reject)=>listener.close(e=>e?reject(e):resolve())),pause(3000).then(()=>{throw Error('timeout')})]);proof.cleanup.push(name+' closed');}catch(e){proof.pass=false;proof.cleanup.push(name+' cleanup failed');}}
    await Promise.all([shutdown('proxy',proxy),shutdown('HTTP server',server)]);
    proof.exitCode=proc?.exitCode??null;writeAndSync(result,proof,'wx');syncEvidenceDir();console.log(JSON.stringify(redact({pass:proof.pass,error:proof.error,exitCode:proof.exitCode,cleanup:proof.cleanup})));
  }
  if(!proof.pass)process.exitCode=1;

} catch(e) {
  if(e instanceof ObserverNotExitedError)lockMayRelease=false;
  if(e instanceof AXDiagnosticError)preflight.axReason=e.code;
  preflight.status='failed';preflight.completedEpoch=Date.now()/1000;preflight.error=e instanceof ObserverNotExitedError?'AX observer exit uncertain':'preflight failed';savePreflight();
  throw e;
 } finally {
  const lockErrors=[];
  function releaseOwned(lock,held,written){
    if(!held)return;
    if(!lockMayRelease||!written){lockErrors.push('retained lock with uncertain ownership or live fixture: '+lock);return;}
    try{
      const ownerPath=lock+'/owner.json';
      if(fs.readFileSync(ownerPath,'utf8')!==owner)throw Error('owner changed');
      fs.unlinkSync(ownerPath);fs.rmdirSync(lock);
    }catch(e){lockErrors.push('retained or uncertain lock '+lock+': '+String(e));}
  }
  releaseOwned(buildLock,buildHeld,buildOwnerWritten);
  releaseOwned(sunriseLock,sunriseHeld,sunriseOwnerWritten);
  if(lockErrors.length){
    console.error(lockErrors.join('\n'));process.exitCode=1;
    try{preflight.lockErrors=lockErrors;savePreflight();}catch(e){console.error('Could not update preflight lock status: '+String(e));}
  }
}
