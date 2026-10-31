import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {connect,pause} from './cdp.mjs';
const root=process.env.TEST_ROOT || import.meta.dirname;
fs.mkdirSync(root,{recursive:true});
const oldArchive='/private/tmp/blanc-pending-read-repair/Blanc-Chromium-Preview-stapled.zip';
const newArchive='/private/tmp/blanc-beta15-upgrade/Blanc-Chromium-Preview-stapled.zip';
const profile=root+'/preview-profile';
const installed=root+'/apps/Blanc Chromium Preview.app';
const shipping={app:root+'/apps/Blanc.app',profile:root+'/shipping-profile',port:9871,api:'browserAPI',exe:'Blanc'};
const preview={app:installed,profile,port:9872,api:'BlancPrototypeHost.api',exe:'Blanc Preview Launcher'};
const report={started:new Date().toISOString(),head:'ad53757cb9bfe9c8859c129a37450db264296f2c',checks:[],events:[],limitations:['Local HTTP artifact download, not a public release endpoint','Existing macOS 27.2 host, not a freshly provisioned Mac','CDP controls only on disposable profiles; no physical-input acceptance','Rollback uses a matching closed backup, not the upgraded profile']};
const save=()=>fs.writeFileSync(root+'/report.json',JSON.stringify(report,null,2)+'\n');
function check(name,pass,details){report.checks.push({name,pass:!!pass,details});save();console.log(name+': '+!!pass);if(!pass)throw Error(name);}
function event(name,details){report.events.push({name,time:new Date().toISOString(),details});save();}
function copy(from,to){if(fs.existsSync(to))throw Error('Refusing overwrite '+to);execFileSync('/bin/cp',['-cR',from,to]);}
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8'}).trim();
function treeHash(dir){const h=crypto.createHash('sha256');let files=0;const walk=(p,r='')=>{for(const x of fs.readdirSync(p,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const f=path.join(p,x.name),rel=path.join(r,x.name);if(x.isSymbolicLink()){h.update('L'+rel+'\0'+fs.readlinkSync(f));}else if(x.isDirectory())walk(f,rel);else if(x.isFile()){h.update('F'+rel+'\0'+sha(f));files++;}}};walk(dir);return {sha256:h.digest('hex'),files};}
async function baseline(){const v={shipping:{},endpoints:{}};for(const f of ['Contents/Info.plist','Contents/MacOS/Blanc','Contents/Resources/app.asar'])v.shipping[f]=sha('/Applications/Blanc.app/'+f);for(const port of [9225,9248]){try{v.endpoints[port]=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1000)}).then(r=>r.json()).then(a=>a.map(({id,url,type})=>({id,url,type})));}catch(e){v.endpoints[port]={unavailable:String(e)}}}return v;}
async function browser(s){return connect(await fetch('http://127.0.0.1:'+s.port+'/json/version').then(r=>r.json()));}
async function targets(s){return fetch('http://127.0.0.1:'+s.port+'/json/list',{signal:AbortSignal.timeout(1000)}).then(r=>r.json());}
async function ready(s){for(let i=0;i<200;i++){try{for(const t of (await targets(s)).filter(t=>t.type==='page')){const c=await connect(t);try{const data=await c.eval(s.api+'.getAllTabs()');if(data.tabs?.some(t=>t.id===data.activeTabId)){s.c=c;const b=await browser(s);const procs=await b.send('SystemInfo.getProcessInfo');s.pid=procs.processInfo.find(p=>p.type==='browser')?.id;s.version=(await b.send('Browser.getVersion')).product;b.close();event('ready',{profile:s.profile,pid:s.pid,version:s.version});return;}}catch{}c.close();}}catch{}await pause(200);}throw Error('No ready host '+s.port);}
async function start(s,viaLaunchServices=false){if(s.pid&&alive(s.pid))throw Error('Competing instance');const args=['--user-data-dir='+s.profile,'--remote-debugging-port='+s.port,'--no-first-run','--restore-last-session'];if(viaLaunchServices){run('/usr/bin/open',['-n',s.app,'--args',...args]);event('LaunchServices requested',{app:s.app});}else{const fd=fs.openSync(root+'/launch-'+s.port+'.log','a');s.child=spawn(s.app+'/Contents/MacOS/'+s.exe,args,{env:{...process.env,BLANC_UPDATE_CHANNEL:'isolated-acceptance'},stdio:['ignore',fd,fd]});s.child.on('exit',(code,signal)=>event('process exit',{pid:s.child.pid,code,signal}));}await ready(s);}
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
async function stop(s){s.c?.close();const b=await browser(s);await b.send('Browser.close').catch(()=>{});b.close();for(let i=0;i<200&&alive(s.pid);i++)await pause(100);check('clean exit '+s.port,!alive(s.pid),{pid:s.pid});s.pid=null;s.port++;}
async function tabState(s){const d=await s.c.eval(s.api+'.getAllTabs()');return {urls:d.tabs.map(t=>t.url),selected:d.tabs.findIndex(t=>t.id===d.activeTabId),pinned:d.tabs.map(t=>!!t.pinned)};}
async function layout(s){for(const t of await targets(s)){if(!t.url.includes('newtab'))continue;const c=await connect(t);try{const value=await c.eval('document.body.dataset.layout');c.close();if(value)return value;}catch{c.close();}}throw Error('New tab layout unavailable');}
async function settled(s){for(let i=0;i<150;i++){const d=await s.c.eval(s.api+'.getAllTabs()');if(d.tabs.length===3&&!d.tabs.some(t=>t.isLoading))return;await pause(100);}throw Error('Tabs not settled');}
async function exact(s,wanted,name){for(let i=0;i<100;i++){if(JSON.stringify(await tabState(s))===JSON.stringify(wanted))break;await pause(150);}check(name,JSON.stringify(await tabState(s))===JSON.stringify(wanted),await tabState(s));}
function audit(app,label,expected){const value=run('/usr/bin/plutil',['-extract','CFBundleShortVersionString','raw','-o','-',app+'/Contents/Info.plist']);check(label+' version',value===expected,value);for(const [cmd,args,tag] of [['/usr/bin/codesign',['--verify','--deep','--strict',app],'signature'],['/usr/sbin/spctl',['--assess','--type','execute','--verbose=4',app],'gatekeeper'],['/usr/bin/xcrun',['stapler','validate',app],'stapler']]){const out=execFileSync(cmd,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});fs.writeFileSync(root+'/'+label+'-'+tag+'.log',out);check(label+' '+tag,true);}const identity=execFileSync('/usr/bin/codesign',['-d','--verbose=4',app],{encoding:'utf8',stdio:['ignore','pipe','pipe']});/* detailed identity is captured by separate audit */}
const downloadName='Blanc-Preview-157.0.8103.15-acceptance.zip';
let served=0;const server=http.createServer((q,r)=>{if(q.url==='/'+downloadName){served++;r.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="'+downloadName+'"','Content-Length':fs.statSync(newArchive).size});fs.createReadStream(newArchive).pipe(r);return;}r.writeHead(200,{'Content-Type':'text/html'});r.end('<!doctype html><title>Preview update acceptance</title><p>Disposable update fixture</p><a id="download" href="/'+downloadName+'">Download signed preview</a>');});
await new Promise(r=>server.listen(9870,'127.0.0.1',r));
try{
report.before=await baseline();save();fs.mkdirSync(root+'/apps',{recursive:true});fs.mkdirSync(root+'/downloads');fs.mkdirSync(shipping.profile);fs.mkdirSync(profile);
check('old archive pinned',sha(oldArchive)==='18272ab548d0117744209536bc24c0b6cc09ece38c01fec4976cf8e78899306f');check('new archive pinned',sha(newArchive)==='d9924b7e5398b95f21e1107cb146eaf0f1e53387e9c850fc720b33e4adbe50cb');
copy('/private/tmp/blanc-pending-read-repair/Blanc Chromium Preview.app',installed);copy('/Applications/Blanc.app',shipping.app);audit(installed,'A','157.0.8103.6');
await start(shipping);await shipping.c.eval("browserAPI.createTab('http://127.0.0.1:9870/shipping')");await pause(1000);const shippingExpected=await tabState(shipping);
await start(preview);check('A native runtime version',preview.version.includes('157.0.8103.6'),preview.version);
for(const t of await targets(preview)){if(!t.url.includes('newtab'))continue;const c=await connect(t);try{await c.eval("bowserPages.start.setLayout('shelf')");}finally{c.close();}}
for(const name of ['one','two'])await preview.c.eval("BlancPrototypeHost.api.createTab('http://127.0.0.1:9870/"+name+"')");await settled(preview);
await preview.c.eval('(async()=>{const s=await BlancPrototypeHost.api.getAllTabs();await BlancPrototypeHost.api.switchTab(s.tabs[1].id)})()');
const before=await tabState(preview);report.preUpdate=before;check('A seeded tabs',before.urls.length===3&&before.selected===1,before);check('A Shelf preference',await layout(preview)==='shelf');
const downloaded=root+'/downloads/'+downloadName;
if(process.env.DOWNLOADED_ZIP){copy(process.env.DOWNLOADED_ZIP,downloaded);report.nativeDownloadSource=process.env.DOWNLOADED_ZIP;}
else {
const b=await browser(preview);await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:root+'/downloads',eventsEnabled:true});b.close();const page=(await targets(preview)).find(t=>t.url.endsWith('/one'));const c=await connect(page);await c.eval("document.getElementById('download').click()");c.close();
for(let i=0;i<300;i++){if(fs.existsSync(downloaded)&&fs.statSync(downloaded).size===fs.statSync(newArchive).size)break;await pause(200);}
}
check('B archive matches native browser download',fs.existsSync(downloaded)&&sha(downloaded)===sha(newArchive),{served,path:downloaded});
let q;try{q=run('/usr/bin/xattr',['-p','com.apple.quarantine',downloaded]);}catch{q=null;}report.downloadQuarantine=q;check('native download carries macOS quarantine',!!q,q);
await stop(preview);copy(profile,root+'/pre-update-backup');report.backupDigest=treeHash(root+'/pre-update-backup');save();
event('download ready for native extraction',{path:downloaded});fs.writeFileSync(root+'/ready-for-extraction.json',JSON.stringify({downloaded}));
while(!fs.existsSync(root+'/continue.json'))await pause(300);
const extracted=root+'/downloads/Blanc Chromium Preview.app';check('Archive Utility extracted B',fs.existsSync(extracted));report.extractedQuarantine=run('/usr/bin/xattr',['-p','com.apple.quarantine',extracted]);check('extracted B retains quarantine',!!report.extractedQuarantine,report.extractedQuarantine);audit(extracted,'B','157.0.8103.15');
fs.renameSync(installed,root+'/A-retained.app');fs.renameSync(extracted,installed);report.newAppBefore=treeHash(installed);event('replaced only disposable Preview app',{});
await start(preview,true);check('quarantined B native version',preview.version.includes('157.0.8103.15'),preview.version);await exact(preview,before,'B preserves tab order and selection');check('B preserves Shelf',await layout(preview)==='shelf');await exact(shipping,shippingExpected,'shipping unchanged during update');
for(const url of before.urls.filter(u=>u.startsWith('http:'))){let loaded=false;let observations=[];for(let attempt=0;attempt<100&&!loaded;attempt++){const t=(await targets(preview)).find(t=>t.url===url);if(t){let c;try{c=await connect(t);loaded=await c.eval("document.title==='Preview update acceptance' && document.readyState==='complete'");}catch(e){observations.push(String(e));}finally{c?.close();}}if(!loaded)await pause(150);}check('B restored document rendered '+url,loaded,{observations});}
await stop(preview);await start(preview);await exact(preview,before,'B second clean restart preserves tabs');check('B second restart preserves Shelf',await layout(preview)==='shelf');await stop(preview);copy(profile,root+'/post-update-backup');report.postBackupDigest=treeHash(root+'/post-update-backup');
fs.renameSync(profile,root+'/preserved-newer-profile');copy(root+'/pre-update-backup',profile);fs.renameSync(installed,root+'/B-retained.app');fs.renameSync(root+'/A-retained.app',installed);
await start(preview);check('matching-backup rollback native version',preview.version.includes('157.0.8103.6'),preview.version);await exact(preview,before,'matching-backup rollback preserves tabs');check('matching-backup rollback preserves Shelf',await layout(preview)==='shelf');await exact(shipping,shippingExpected,'shipping unchanged during rollback');await stop(preview);
check('closed pre-update backup unchanged',JSON.stringify(treeHash(root+'/pre-update-backup'))===JSON.stringify(report.backupDigest));check('newer profile retained unchanged',JSON.stringify(treeHash(root+'/preserved-newer-profile'))===JSON.stringify(report.postBackupDigest));
fs.renameSync(profile,root+'/rollback-tested-profile');fs.renameSync(installed,root+'/A-rollback-tested.app');fs.renameSync(root+'/B-retained.app',installed);preview.profile=root+'/fresh-retreat-profile';fs.mkdirSync(preview.profile);await start(preview);check('fresh-profile retreat contains no old fixture tabs',(await tabState(preview)).urls.length===1&&!(await tabState(preview)).urls.some(u=>u.startsWith('http:')),await tabState(preview));await stop(preview);
check('signed B code and assets unchanged',JSON.stringify(treeHash(installed))===JSON.stringify(report.newAppBefore));fs.rmSync(installed,{recursive:true});check('withdrawal removes only preview app',!fs.existsSync(installed)&&fs.existsSync(root+'/preserved-newer-profile')&&fs.existsSync(shipping.app));await exact(shipping,shippingExpected,'shipping survives preview withdrawal');await stop(shipping);
report.after=await baseline();const stable=v=>({shipping:v.shipping,endpoints:Object.fromEntries(Object.entries(v.endpoints).map(([k,a])=>[k,Array.isArray(a)?a.filter(t=>t.type==='page'):a]))});check('permanent Shipping and Google/dev page targets unchanged',JSON.stringify(stable(report.before))===JSON.stringify(stable(report.after)),report.after);report.complete=true;
}catch(e){report.error=String(e);event('failure',String(e));for(const s of [preview,shipping]){if(s.pid&&alive(s.pid)){try{await stop(s);}catch(err){event('cleanup failure',String(err));}}}}finally{server.close();report.finished=new Date().toISOString();save();console.log(JSON.stringify({complete:report.complete,error:report.error,checks:report.checks.length}));}
