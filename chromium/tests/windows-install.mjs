// The Windows install check (W1 Part B gate, items 3 to 5): Chromium's own
// installer puts the preview beside an installed Electron Blanc, registers it
// under its own names, launches, and uninstalls without touching Blanc.
//
//   node chromium/tests/windows-install.mjs CANDIDATE_FOLDER RESULTS_FOLDER SHIPPING_INSTALLER [--installer=PATH [--signed]]
//
// --installer runs another installer of the same candidate (a repacked or
// signed one) instead of the candidate's own mini_installer.exe. --signed says
// the installer's files are signed: the launch then accepts chrome.exe and
// chrome.dll that differ from the candidate's only by their signature.
//
// SHIPPING_INSTALLER is Electron Blanc's public Windows installer, checked by
// the workflow against the release's SHA256SUMS. The check runs on a
// throwaway Windows runner: it installs and uninstalls for the current user.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pause} from './lib/cdp.mjs';

const [candidateFolder,resultsFolder,shippingInstaller,...installOptions]=process.argv.slice(2);
const installerOption=installOptions.find(o=>o.startsWith('--installer='))?.slice('--installer='.length)??null;
const signed=installOptions.includes('--signed');
if(installOptions.some(o=>!o.startsWith('--installer=')&&o!=='--signed'))throw Error('Unknown option: '+installOptions.join(' '));
if(signed&&!installerOption)throw Error('--signed needs the signed installer, through --installer');
if(!candidateFolder||!resultsFolder||!shippingInstaller)throw Error('Usage: windows-install.mjs CANDIDATE_FOLDER RESULTS_FOLDER SHIPPING_INSTALLER');
if(process.platform!=='win32')throw Error('The install check runs on Windows');
const directory=path.resolve(candidateFolder),out=path.resolve(resultsFolder);
if(fs.existsSync(out))throw Error('Refusing to overwrite earlier results');
fs.mkdirSync(out,{recursive:true});
const candidate=JSON.parse(fs.readFileSync(path.join(directory,'candidate.json'),'utf8'));
const record={candidate:candidate.id,signed,checks:{},details:{}};
const local=process.env.LOCALAPPDATA;
const product='Blanc Chromium Preview',appName='Blanc Prototype';
const application=path.join(local,product,'Application');
const userData=path.join(local,product,'User Data');
const electronExe=path.join(local,'Programs','Blanc','Blanc.exe');

// reg.exe query, as {valueName: data} for one key, or null if absent.
function regValues(key){
 const r=spawnSync('reg.exe',['query',key],{encoding:'utf8'});
 if(r.status!==0)return null;
 const values={};
 for(const line of r.stdout.split(/\r?\n/)){const m=/^\s{4}(.*?)\s{4}REG_\w+\s{4}?(.*)$/.exec(line);if(m)values[m[1]]=m[2];}
 return values;
}
const regSubkeys=key=>{const r=spawnSync('reg.exe',['query',key],{encoding:'utf8'});return r.status===0?r.stdout.split(/\r?\n/).filter(l=>/^HKEY_/.test(l)&&l!==key&&l.toUpperCase()!==key.toUpperCase()).map(l=>l.split('\\').pop()):[];};
const HKCU='HKEY_CURRENT_USER';
// What the Electron Blanc's installer and the user's defaults hold: it must
// be the same after the preview comes and goes.
function electronState(){
 return {
  exe:fs.existsSync(electronExe),
  client:regValues(`${HKCU}\\Software\\Clients\\StartMenuInternet\\Blanc\\Capabilities\\URLAssociations`),
  progId:regValues(`${HKCU}\\Software\\Classes\\BlancURL\\shell\\open\\command`),
  registered:regValues(`${HKCU}\\Software\\RegisteredApplications`)?.Blanc??null,
  userChoiceHttp:regValues(`${HKCU}\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice`)?.ProgId??null,
  userChoiceHttps:regValues(`${HKCU}\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice`)?.ProgId??null,
 };
}
const killAll=image=>spawnSync('taskkill.exe',['/F','/T','/IM',image],{stdio:'ignore'});
async function waitUntil(test,ms){for(let t=0;t<ms;t+=500){if(test())return true;await pause(500);}return test();}
let failure=null;
try{
 // 1. Electron Blanc, as people have it.
 execFileSync(path.resolve(shippingInstaller),['/S'],{stdio:'ignore',timeout:300000});
 await waitUntil(()=>fs.existsSync(electronExe),60000);
 await pause(3000);killAll('Blanc.exe');
 const before=electronState();
 record.details.electronBefore=before;
 record.checks.electronInstalled=before.exe&&!!before.client&&!!before.progId;

 // 2. The preview, through Chromium's installer, per user, not launched.
 const installer=installerOption?path.resolve(installerOption):path.join(directory,'mini_installer.exe');
 record.installer=installer;
 const run=spawnSync(installer,['--do-not-launch-chrome','--verbose-logging'],{timeout:600000});
 record.details.installerExit=run.status;
 const exe=path.join(application,'chrome.exe');
 record.checks.installed=run.status===0&&fs.existsSync(exe)&&fs.existsSync(path.join(application,candidate.version,'chrome.dll'));
 const uninstallKey=`${HKCU}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${product}`;
 const entry=regValues(uninstallKey);
 record.details.uninstallEntry=entry;
 record.checks.uninstallEntry=entry?.DisplayName===appName&&entry?.Publisher==='Bananify Creative'&&/setup\.exe/i.test(entry?.UninstallString??'');
 const startMenu=path.join(process.env.APPDATA,'Microsoft','Windows','Start Menu','Programs',`${appName}.lnk`);
 record.checks.startMenuShortcut=fs.existsSync(startMenu);
 // The version resources name Bananify Creative and the preview, in every
 // file the installer brings and in the installer itself (W2 A1).
 const versioned=[exe,path.join(application,candidate.version,'chrome.dll'),path.join(application,candidate.version,'Installer','setup.exe'),installer];
 const info=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
  `$f=@(${versioned.map(f=>`'${f.replace(/'/g,"''")}'`).join(',')});$f|ForEach-Object{$v=(Get-Item -LiteralPath $_).VersionInfo;[pscustomobject]@{file=$_;company=$v.CompanyName;product=$v.ProductName}}|ConvertTo-Json -Compress`],{encoding:'utf8'});
 const resources=info.status===0?[JSON.parse(info.stdout)].flat():[];
 record.details.versionResources=resources;
 record.checks.versionResources=resources.length===versioned.length&&resources.every(r=>r.company==='Bananify Creative'&&r.product===appName);
 for(const name of ['installer','setup'])for(const f of [path.join(os.tmpdir(),`chromium_installer.log`),path.join(os.tmpdir(),`${name}.log`)])if(fs.existsSync(f))fs.copyFileSync(f,path.join(out,path.basename(f)));

 // 3. Registration under its own names (Chromium's ShellUtil, per user).
 const registered=regValues(`${HKCU}\\Software\\RegisteredApplications`)??{};
 const ours=Object.keys(registered).filter(k=>k.startsWith(appName));
 const clients=regSubkeys(`${HKCU}\\Software\\Clients\\StartMenuInternet`).filter(k=>k.startsWith(appName));
 const assoc=clients.length?regValues(`${HKCU}\\Software\\Clients\\StartMenuInternet\\${clients[0]}\\Capabilities\\URLAssociations`):null;
 record.details.registration={registered:ours.map(k=>[k,registered[k]]),clients,assoc};
 record.checks.registeredAsBrowser=ours.length===1&&clients.length===1&&/^BlancPrvHTM/.test(assoc?.http??'')&&assoc?.https===assoc?.http&&
  !!regValues(`${HKCU}\\Software\\Classes\\${assoc.http}\\shell\\open\\command`);
 record.checks.electronUntouchedByInstall=JSON.stringify(electronState())===JSON.stringify(before);

 // 4. The installed copy launches, with no sandbox grant of the runner's.
 const smoke=spawnSync(process.execPath,[fileURLToPath(new URL('./windows-smoke.mjs',import.meta.url)),directory,path.join(out,'installed-smoke'),`--installed=${application}`,...(signed?['--signed']:[])],{encoding:'utf8',timeout:300000});
 record.details.installedSmoke=(smoke.stdout||'').slice(-1500);
 record.checks.installedLaunches=smoke.status===0;

 // 5. Uninstall, keeping the data folder; Electron Blanc still starts.
 fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'keep.txt'),'kept');
 const [setup,...rest]=entry.UninstallString.match(/"[^"]+"|\S+/g).map(a=>a.replace(/^"|"$/g,''));
 const un=spawnSync(setup,[...rest,'--force-uninstall'],{timeout:300000});
 record.details.uninstallExit=un.status;
 await waitUntil(()=>!fs.existsSync(exe),60000);
 const after=regValues(`${HKCU}\\Software\\RegisteredApplications`)??{};
 record.checks.uninstalled=!fs.existsSync(exe)&&!regValues(uninstallKey)&&!Object.keys(after).some(k=>k.startsWith(appName))&&
  !regSubkeys(`${HKCU}\\Software\\Clients\\StartMenuInternet`).some(k=>k.startsWith(appName))&&!fs.existsSync(startMenu);
 record.checks.dataKept=fs.existsSync(path.join(userData,'keep.txt'));
 const afterAll=electronState();record.details.electronAfter=afterAll;
 record.checks.electronUntouched=JSON.stringify(afterAll)===JSON.stringify(before);
 const electron=spawn(electronExe,[],{detached:true,stdio:'ignore'});
 await pause(8000);
 record.checks.electronStillStarts=electron.exitCode===null;
 killAll('Blanc.exe');
}catch(error){failure=error;record.error=String(error.stack||error);}
const required=['electronInstalled','installed','uninstallEntry','startMenuShortcut','versionResources','registeredAsBrowser','electronUntouchedByInstall',
 'installedLaunches','uninstalled','dataKept','electronUntouched','electronStillStarts'];
record.pass=!failure&&required.every(name=>record.checks[name]===true);
fs.writeFileSync(path.join(out,'install.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({candidate:record.candidate,pass:record.pass,checks:record.checks,error:record.error,
 installedSmoke:record.checks.installedLaunches===false?record.details.installedSmoke:undefined},null,2));
if(!record.pass)process.exitCode=1;
