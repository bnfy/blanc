// Unrun fixture: one intercepted native snapshot reply per isolated phase.
// Never points to the user development profile.
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {connect,pause} from '../evidence/tab-selection-port-20261028/cdp.mjs';
import {observeChild} from '../start-page/launch-sunrise-integration-draft/fixture-child-state.mjs';
import {syncLineage} from '../start-page/groups-projection-draft/sync-lineage.mjs';
import {fileURLToPath} from 'node:url';

const preview='<local-home>/Documents/ChatGPT/Blanc Browser/Chromium Preview';
const draft=preview+'/repo/experiments/chromium-extension-spike/sticky-snapshot-notice-draft';
const groupDraft=preview+'/repo/experiments/chromium-extension-spike/start-page/groups-projection-draft';
const evidence=preview+'/evidence/sticky-snapshot-notice-20261029',assets=draft+'/assets-groups-native-v1';
const chromium='<local-home>/Projects/BlancChromium158/src';
const app=chromium+'/out/BlancPrototype/Blanc Prototype.app/Contents';
const exe=app+'/MacOS/Blanc Prototype',framework=app+'/Frameworks/Blanc Prototype Framework.framework/Versions/158.0.8127.2/Blanc Prototype Framework';
const [label,expectedFramework,receiptPath,scenario,fixturePin,probePin,predicatePin]=process.argv.slice(2);
const scenarios=['regular'];
if(!/^[a-z0-9-]+$/.test(label||'')||!/^[a-f0-9]{64}$/.test(expectedFramework||'')||!receiptPath?.startsWith('/')||!scenarios.includes(scenario)||![fixturePin,probePin,predicatePin].every(x=>/^[a-f0-9]{64}$/.test(x||'')))throw Error('usage: node browser-check-snapshot-notice.mjs fresh-label verified-framework-sha256 trusted-build-receipt.json regular fixture-sha256 probe-sha256 predicate-sha256');
// Record even a preflight failure; exclusive creation keeps old evidence intact.
fs.mkdirSync(evidence,{recursive:true});
syncLineage(fs,evidence,preview);
const preflightPath=`${evidence}/${label}-preflight.json`;
const preflight={label,scenario,status:'in-progress',startedEpoch:Date.now()/1000};
function writeAndSync(file,value,flags) {
  const fd=fs.openSync(file,flags,0o600);
  try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function readPinnedScript(file,expected) {
  const info=fs.lstatSync(file);
  if(info.isSymbolicLink()||!info.isFile())throw Error('script path is unsafe');
  const bytes=fs.readFileSync(file),actual=crypto.createHash('sha256').update(bytes).digest('hex');
  if(actual!==expected)throw Error('reviewed script identity changed');
  return bytes;
}
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
  const scriptPaths={fixture:fileURLToPath(import.meta.url),probe:draft+'/snapshot-reply-probe.mjs',predicate:draft+'/notice-fixture-verification.mjs'},scriptPins={fixture:fixturePin,probe:probePin,predicate:predicatePin};
  const verified=Object.fromEntries(Object.entries(scriptPaths).map(([key,file])=>[key,readPinnedScript(file,scriptPins[key])]));
  const {installSnapshotReplyProbe}=await import('data:text/javascript;base64,'+verified.probe.toString('base64'));
  const {phaseReady}=await import('data:text/javascript;base64,'+verified.predicate.toString('base64'));
  const profile=`${evidence}/profile-${label}`,result=`${evidence}/${label}.json`;
  if(fs.existsSync(profile)||fs.existsSync(result))throw Error('fixture already exists');
  const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const manifestPath=draft+'/assets-groups-native-v1.json',groupManifestPath=groupDraft+'/manifest-visible-v2.json',baseManifestPath=groupDraft+'/manifest.json',linkPath=groupDraft+'/asset-only-visible-v2-link.json';
  const manifest=JSON.parse(fs.readFileSync(manifestPath)),groupManifest=JSON.parse(fs.readFileSync(groupManifestPath)),baseManifest=JSON.parse(fs.readFileSync(baseManifestPath)),link=JSON.parse(fs.readFileSync(linkPath)),receipt=JSON.parse(fs.readFileSync(receiptPath));
  if(sha(manifestPath)!=='ecea0d13309677a169d7af59f5be465176eacb6ccb980ded8cda8e362a9c099b'||sha(receiptPath)!=='a67d16ce283ea4eeaf81533a8b891838b25d6052944ec946885621f50285dc23'||sha(groupManifestPath)!==manifest.baseManifestSha256||sha(linkPath)!=='f0ab9cb5054e7a67086302823de8b37b533736c21e0bff74f43f192ddb594e12'||manifest.groupsBuildReceiptSha256!==sha(receiptPath)||expectedFramework!==manifest.frameworkSha256||expectedFramework!==link.nativeFrameworkSha256||link.nativeBuildReceiptSha256!==sha(receiptPath)||link.candidateManifestSha256!==sha(groupManifestPath)||link.baseManifestSha256!==sha(baseManifestPath)||receipt.status!=='verified'||receipt.overlayManifestSha256!==sha(baseManifestPath)||receipt.guardActions!==0||receipt.buildExit!==0||receipt.guardExit!==0)throw Error('fixture provenance mismatch');
  const delta=Object.keys(manifest.assets).filter(k=>manifest.assets[k]!==groupManifest.assets[k]);
  if(manifest.assetCount!==78||Object.keys(groupManifest.assets).length!==78||delta.length!==1||delta[0]!=='host.js'||manifest.candidateHostSha256!=='03cd873bc28d791aef3028adecdfb29ca0292b334c53dc27855f4f1fce414537'||manifest.assets['host.js']!==manifest.candidateHostSha256)throw Error('fixture asset delta mismatch');
  const currentHost=preview+'/repo/experiments/chromium-extension-spike/prototype/host.js';if(fs.lstatSync(currentHost).isSymbolicLink()||sha(currentHost)!==manifest.candidateHostSha256||sha(draft+'/host-candidate.js')!==manifest.candidateHostSha256)throw Error('integrated host changed');
  if(sha(framework)!==expectedFramework)throw Error('framework differs from supplied verified build');
  for(const [name,digest] of Object.entries(groupManifest.overlay))if(sha(`${chromium}/${name}`)!==digest)throw Error('checkout differs from reviewed overlay: '+name);
  const guard=receiptPath.replace(/[^/]+$/, 'guard.log');
  if(!/ninja: no work to do\./.test(fs.readFileSync(guard,'utf8'))||!/Build Succeeded: 0 steps/.test(fs.readFileSync(guard,'utf8')))throw Error('zero-action build guard missing');
  if(sha(guard)!==receipt.guardPlanSha256)throw Error('guard does not match build receipt');
  const guardTime=fs.statSync(guard).mtimeMs;
  for(const p of [framework,...Object.keys(groupManifest.overlay).map(name=>`${chromium}/${name}`)])if(fs.statSync(p).mtimeMs>guardTime)throw Error('guard predates output or staged source');
  const files=(root,prefix='')=>fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>{
    const p=prefix?`${prefix}/${e.name}`:e.name;if(e.isSymbolicLink())throw Error('unexpected symlink '+p);
    if(e.isDirectory())return files(`${root}/${e.name}`,p);if(e.isFile())return [p];throw Error('unsupported file '+p);
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
    if(e.isFile())return [[name,{sha256:sha(p)}]];throw Error('unsupported bundle entry '+name);
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
  preflight.status='passed';preflight.completedEpoch=Date.now()/1000;preflight.framework=expectedFramework;preflight.receiptSha256=sha(receiptPath);preflight.appInventorySha256=receipt.appInventorySha256;preflight.assetLinkSha256=sha(linkPath);preflight.candidateManifestSha256=sha(manifestPath);preflight.scriptPins=scriptPins;savePreflight();
  const sockets=new Set();const track=s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));};
  const proxy=net.createServer(socket=>{track(socket);socket.destroy()});
  const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<title>Snapshot fixture</title>')});
  server.on('connection',track);
  const proof={label,scenario,framework:expectedFramework,fixtureAssetsSha256:sha(manifestPath),groupsReceiptSha256:sha(receiptPath),appInventorySha256:receipt.appInventorySha256,scriptPins,checks:[],diagnostics:[],exits:[],cleanup:[],pass:false,qualification:'Owned disposable browser; each phase suppresses one observed native snapshot reply. The unrelated warning is synthetic. Loopback proxy/resolver do not prove host-wide outbound denial. Launching may change system focus; no development profile is used.'};
  let proc,childState,browser,host,hostContext,port,clients=[],phase=0,diagnosticPage=null,diagnosticGroupId=null,diagnosticLayout=null;
  const exited=()=>!!childState&&childState.exited();
  const wait=async(fn,accept,what)=>{for(let n=0;n<300;n++){if(childState?.error)throw childState.error;if(exited())throw Error('owned browser exited while waiting for '+what);let v;try{v=await fn()}catch{}if(accept(v))return v;await pause(100)}throw Error('Timed out: '+what)};
  const waitForExit=async()=>{for(let n=0;n<80&&!exited();n++)await pause(100);return exited()};
  const list=()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
  const rec=(name,detail=true)=>{proof.checks.push({name,detail});console.log(name,JSON.stringify(detail))};
  const api=(name,...args)=>host.eval(`BlancPrototypeHost.api.${name}(...${JSON.stringify(args)})`);
  const freshSnapshot=()=>host.eval('BlancPrototypeHost.refresh().then(() => BlancPrototypeHost.api.getAllTabs())');
  async function launch(privateMode=false) {
    noActiveBuild();
    phase++;const fd=fs.openSync('/dev/null','w');
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
      const hosts=(await list()).filter(t=>t.type==='page'&&t.url.endsWith('/host.html'));if(hosts.length>1)return {ambiguous:true};
      for(const target of hosts){
        const info=details.find(t=>t.targetId===target.id);if(!info?.browserContextId)continue;
        let candidate;try{
          candidate=await connect(target);const tabs=await candidate.eval('BlancPrototypeHost.api.getAllTabs()');
          if(Array.isArray(tabs?.tabs)&&tabs.tabs.length&&tabs.activeTabId&&tabs.tabs.every(t=>t.private===privateMode)&&tabs.tabs.some(t=>t.id===tabs.activeTabId&&t.private===privateMode))
            return {candidate,context:info.browserContextId};
        }catch{}if(candidate)candidate.close();
      }
      return null;
    },Boolean,'host with matching context and active profile');
    if(selected.ambiguous)throw Error('ambiguous fixture host');
    host=selected.candidate;hostContext=selected.context;clients.push(host);
    return started;
  }
  async function close(){
    await browser.send('Browser.close');if(!await waitForExit())throw Error('browser did not exit after close');assert.equal(proc.exitCode,0,'browser exit');proof.exits.push({phase,exitCode:proc.exitCode});
    clients.forEach(c=>c.close());clients=[];host=null;browser=null;proc=null;childState=null;
  }
  try {
    await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve)});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
    fs.mkdirSync(profile,{mode:0o700});await launch(false);
    await host.eval(`(${installSnapshotReplyProbe.toString()})()`);
    async function runPhase(name){
      await host.eval(`window.__snapshotNoticeProbe.arm(${JSON.stringify(name)})`);
      const result=await wait(()=>host.eval(`window.__snapshotNoticeProbe.phase`),phase=>phaseReady(phase,name),'snapshot notice '+name);
      if(name==='recovery')assert(result.successes.some(s=>s.timeMs>=result.timeoutAt&&s.hidden&&!s.timeoutVisible),'successful newer snapshot did not clear timeout');
      else {assert.equal(result.warningInjected,true,'unrelated notice was not injected');assert(result.successes.some(s=>s.timeMs>=result.timeoutAt&&s.unrelatedVisible),'newer unrelated notice disappeared');}
      proof.diagnostics.push({phase:name,dropId:result.dropId,dropped:result.dropped,droppedSuccess:result.droppedSuccess,timeoutSeen:result.timeoutSeen,timeoutAt:result.timeoutAt,warningInjected:result.warningInjected,successes:result.successes});
      await host.eval('window.__snapshotNoticeProbe.phase.completed=true');rec(name+' verified');
    }
    await runPhase('recovery');await runPhase('unrelated');await close();proof.pass=true;
  }catch(e){
    proof.error=String(e?.stack||e);
    if(host)try{proof.diagnostics.push({phase:'failure',probe:await Promise.race([host.eval('window.__snapshotNoticeProbe?.phase ?? null'),pause(2500).then(()=>null)])});}catch{}
  }
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
    try{for(const [key,file] of Object.entries(scriptPaths))readPinnedScript(file,scriptPins[key]);proof.scriptsUnchanged=true;}
    catch{proof.pass=false;proof.scriptsUnchanged=false;proof.scriptIntegrityError='reviewed fixture script changed';}
    proof.exitCode=proc?.exitCode??null;writeAndSync(result,proof,'wx');syncEvidenceDir();console.log(JSON.stringify({pass:proof.pass,error:proof.error,exitCode:proof.exitCode,cleanup:proof.cleanup}));
  }
  if(!proof.pass)process.exitCode=1;

} catch(e) {
  preflight.status='failed';preflight.completedEpoch=Date.now()/1000;preflight.error=String(e?.stack||e);savePreflight();
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
