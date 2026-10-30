// Prepared for a future, separately verified incremental build. Never points at
// the development profile. No synthetic Sunrise grant or preference is used.
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {connect,pause} from '../../evidence/tab-selection-port-20261028/cdp.mjs';
import {observeChild} from './fixture-child-state.mjs';
import {activeUrlMatches} from './fixture-readiness.mjs';

const preview='<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview';
const draft=preview+'/repo/experiments/chromium-extension-spike/start-page/launch-sunrise-integration-draft';
const evidence=preview+'/evidence/start-page-sunrise-20261029',assets=evidence+'/assets-v2';
const chromium='<local-home>/Projects/BlancChromium158/src';
const app=chromium+'/out/BlancPrototype/Blanc Prototype.app/Contents';
const exe=app+'/MacOS/Blanc Prototype',framework=app+'/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework';
const [label,expectedFramework,receiptPath]=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(label||'')||!/^[a-f0-9]{64}$/.test(expectedFramework||'')||!receiptPath)throw Error('usage: node browser-check.mjs fresh-label verified-framework-sha256 trusted-build-receipt.json');
const lockRoot=chromium+'/out/BlancPrototype';
const sunriseLock=lockRoot+'/.blanc-sunrise-transaction.lock',buildLock=lockRoot+'/.blanc-build-guard.lock';
const owner=JSON.stringify({pid:process.pid,createdEpoch:Date.now()/1000})+'\n';
let sunriseHeld=false,buildHeld=false,lockMayRelease=true;
function noActiveBuild(){
  const processes=execFileSync('/bin/ps',['-axo','pid=,comm='],{encoding:'utf8'});
  for(const line of processes.split('\n')){const match=line.trim().match(/^(\d+)\s+(.+)$/);if(match&&['ninja','autoninja','siso'].includes(match[2].split('/').at(-1).toLowerCase()))throw Error('build process active: '+match[1]);}
}
try {
  fs.mkdirSync(sunriseLock);sunriseHeld=true;
  fs.writeFileSync(sunriseLock+'/owner.json',owner,{flag:'wx'});
  fs.mkdirSync(buildLock);buildHeld=true;
  noActiveBuild();
  const profile=`${evidence}/profile-${label}`,result=`${evidence}/${label}.json`;
  if(fs.existsSync(profile)||fs.existsSync(result))throw Error('fixture already exists');
  const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const manifest=JSON.parse(fs.readFileSync(draft+'/overlay-manifest.json'));
  const receipt=JSON.parse(fs.readFileSync(receiptPath));
  if(receipt.status!=='verified' || receipt.frameworkSha256!==expectedFramework ||
     receipt.overlayManifestSha256!==sha(draft+'/overlay-manifest.json') ||
     receipt.guardActions!==0 || receipt.buildExit!==0 || receipt.guardExit!==0)
    throw Error('trusted build receipt does not bind this overlay, framework and zero-action guard');
  if(sha(framework)!==expectedFramework)throw Error('framework differs from supplied verified build');
  for(const [name,digest] of Object.entries(manifest.overlay))if(sha(`${chromium}/${name}`)!==digest)throw Error('checkout differs from reviewed overlay: '+name);
  const guard=chromium+'/out/BlancPrototype/blanc-build-plan.log';
  if(!/ninja: no work to do\./.test(fs.readFileSync(guard,'utf8'))||!/Build Succeeded: 0 steps/.test(fs.readFileSync(guard,'utf8')))throw Error('zero-action build guard missing');
  if(sha(guard)!==receipt.guardPlanSha256)throw Error('guard does not match build receipt');
  const guardTime=fs.statSync(guard).mtimeMs;
  for(const p of [framework,...Object.keys(manifest.overlay).map(name=>`${chromium}/${name}`)])if(fs.statSync(p).mtimeMs>guardTime)throw Error('guard predates output or staged source');
  const files=(root,prefix='')=>fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>{
    const p=prefix?`${prefix}/${e.name}`:e.name;if(e.isSymbolicLink())throw Error('unexpected symlink '+p);
    return e.isDirectory()?files(`${root}/${e.name}`,p):e.isFile()?[p]:[];
  });
  assert.deepEqual(files(assets).sort(),Object.keys(manifest.assets).sort());
  for(const [name,digest] of Object.entries(manifest.assets))if(sha(`${assets}/${name}`)!==digest)throw Error('asset mismatch '+name);
  const blocker=preview+'/artifacts/procedural-groups-combined-20261028';
  const blockers=JSON.parse(fs.readFileSync(preview+'/evidence/development-matched-20261028/blocker-current-sha256.json'));
  assert.deepEqual(files(blocker).sort(),Object.keys(blockers).sort());
  for(const [name,digest] of Object.entries(blockers))if(sha(`${blocker}/${name}`)!==digest)throw Error('blocker mismatch '+name);
  const sockets=new Set();const track=s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));};
  const proxy=net.createServer(socket=>{track(socket);socket.destroy()});
  const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<title>Sunrise isolated test</title>')});
  server.on('connection',track);
  const proof={label,framework:expectedFramework,manifest:sha(draft+'/overlay-manifest.json'),receiptSha256:sha(receiptPath),checks:[],exits:[],errors:[],cleanup:[],pass:false,qualification:'Focused isolated native/browser check. Loopback proxy and resolver constrain browser HTTP(S), but do not prove host-wide outbound denial. No physical accessibility or cross-platform claim.'};
  let proc,childState,browser,host,hostContext,port,clients=[],phase=0;
  const exited=()=>!!childState&&childState.exited();
  const wait=async(fn,accept,what)=>{for(let n=0;n<300;n++){if(childState?.error)throw childState.error;if(exited())throw Error('owned browser exited while waiting for '+what);let v;try{v=await fn()}catch{}if(accept(v))return v;await pause(100)}throw Error('Timed out: '+what)};
  const waitForExit=async()=>{for(let n=0;n<80&&!exited();n++)await pause(100);return exited()};
  const list=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
  const rec=(name,detail=true)=>{proof.checks.push({name,detail});console.log(name,JSON.stringify(detail))};
  const api=(name,...args)=>host.eval(`BlancPrototypeHost.api.${name}(...${JSON.stringify(args)})`);
  const freshSnapshot=()=>host.eval('BlancPrototypeHost.refresh().then(() => BlancPrototypeHost.api.getAllTabs())');
  async function launch(privateMode=false) {
    noActiveBuild();
    phase++;const fd=fs.openSync(`${evidence}/${label}-phase${phase}.browser.log`,'wx',0o600);
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
  async function target(url){const result=await wait(async()=>{const all=await list();const context=(await browser.send('Target.getTargets')).targetInfos;const matches=all.filter(t=>t.type==='page'&&t.url===url&&context.some(i=>i.targetId===t.id&&i.browserContextId===hostContext));return matches.length===1?{target:matches[0]}:matches.length>1?{ambiguous:matches.length}:null},Boolean,'target '+url);if(result.ambiguous)throw Error('ambiguous target '+url+': '+result.ambiguous);return result.target}
  async function attach(t){const c=await connect(t,msg=>{if(msg.method==='Runtime.exceptionThrown')proof.errors.push(msg.params.exceptionDetails.text)});clients.push(c);await c.send('Page.enable');await c.send('Runtime.enable');return c}
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
    if(background){if(!before.activeTabId)throw Error('no background-control tab');await api('switchTab',before.activeTabId)}
    const inject=`Object.defineProperty(window,'bowserPages',{configurable:true,set(value){const original=value.start.data;value.start.data=async function(...args){const result=await original.apply(this,args);if(!('__observedRealGrant' in window))window.__observedRealGrant=result.launchSunrise;return result};Object.defineProperty(window,'bowserPages',{value,writable:true,configurable:true});}});`;
    await page.send('Page.addScriptToEvaluateOnNewDocument',{source:inject});await page.send('Page.navigate',{url:'chrome://newtab/'});
    const grant=await wait(()=>page.eval('window.__observedRealGrant'),v=>typeof v==='boolean','real start-data grant '+tag);
    return {page,grant,id};
  }
  try {
    await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve)});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
    fs.mkdirSync(profile,{mode:0o700});
    await launch();await setEnabled(true);await close();assert.equal(readStored(),true);rec('enabled value persists in isolated Local State');
    await launch(true);const privateSettings=await setEnabled(false);await setEnabled(true,privateSettings);rec('primary private Settings can change only the shared device setting');let p=await startPage('private');assert.equal(p.grant,false);rec('private start receives no grant');await close();assert.equal(readStored(),true);
    const started=await launch();p=await startPage('background',true);assert.equal(p.grant,false);rec('background start receives no grant');
    await api('switchTab',p.id);assert.equal((await p.page.eval('bowserPages.start.data()')).launchSunrise,false);rec('revisiting same WebContents cannot retry claim');
    const next=await startPage('visible');assert(Date.now()-started<30000,'fixture exceeded launch window');assert.equal(next.grant,true);rec('visible regular start obtains one real native grant');
    const after=await startPage('second');assert.equal(after.grant,false);rec('second visible start cannot obtain another grant');
    await setEnabled(false);await close();assert.equal(readStored(),false);rec('disabled value persists in isolated Local State');
    await launch();p=await startPage('disabled');assert.equal(p.grant,false);rec('disabled restart receives no grant');await close();
    assert.deepEqual(proof.errors,[]);proof.pass=true;
  }catch(e){proof.error=e.stack;}
  finally{
    if(proc&&!exited()) {
      if(browser)try{await browser.send('Browser.close');if(!await waitForExit())throw Error('timeout');proof.cleanup.push('Browser.close completed');}catch(e){proof.cleanup.push('Browser.close failed: '+String(e));}
      if(!exited())try{if(!proc.pid)throw Error('spawn has no child PID');proc.kill('SIGTERM');await waitForExit();proof.cleanup.push(!exited()?'owned process still live after SIGTERM':'owned process exited after SIGTERM');}catch(e){proof.cleanup.push('owned process termination failed: '+String(e));}
      if(!exited()){proof.pass=false;lockMayRelease=false;}
    }
    clients.forEach(c=>c.close());
    for(const s of sockets)s.destroy();
    async function shutdown(name,listener){if(!listener.listening){proof.cleanup.push(name+' not listening');return}try{await Promise.race([new Promise((resolve,reject)=>listener.close(e=>e?reject(e):resolve())),pause(3000).then(()=>{throw Error('timeout')})]);proof.cleanup.push(name+' closed');}catch(e){proof.pass=false;proof.cleanup.push(name+' cleanup failed: '+String(e));}}
    await Promise.all([shutdown('proxy',proxy),shutdown('HTTP server',server)]);
    proof.exitCode=proc?.exitCode??null;fs.writeFileSync(result,JSON.stringify(proof,null,2));console.log(JSON.stringify({pass:proof.pass,error:proof.error,exitCode:proof.exitCode,cleanup:proof.cleanup}));
  }
  if(!proof.pass)process.exitCode=1;

} finally {
  if(!lockMayRelease) console.error('Fixture process may still be live; retaining both locks for inspection.');
  else {
    if(buildHeld)fs.rmdirSync(buildLock);
    if(sunriseHeld){if(fs.readFileSync(sunriseLock+'/owner.json','utf8')!==owner)throw Error('Sunrise lock owner changed');fs.unlinkSync(sunriseLock+'/owner.json');fs.rmdirSync(sunriseLock);}
  }
}
