// What differs between the machines the fork's suite runs on: the owner's
// Mac, and a hosted Windows runner (docs/superpowers/specs/2026-11-17-windows-fork-design.md).
// Everything else in the harness is the same code on every platform.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';

// The tracker's and the reports' platform names.
const NAMES={darwin:'macos',win32:'windows',linux:'linux'};
export function hostPlatform(platform=process.platform){
 const name=NAMES[platform];
 if(!name)throw Error(`Unsupported test host: ${platform}`);
 return name;
}
// Where a Chrome to import from keeps its profiles, under the fixture's
// browser home. Must equal kBrowsers in blanc/browser/ui/first_run.inc.
const CHROME_ROOT={darwin:['Library','Application Support','Google','Chrome'],win32:['Google','Chrome','User Data'],linux:['.config','google-chrome']};
export function chromeProfileRoot(home,platform=process.platform){
 hostPlatform(platform);
 return path.join(home,...CHROME_ROOT[platform]);
}
// How a running Chrome marks its profile folder: a SingletonLock symlink on
// the Mac and Linux, the lockfile it holds open on Windows. Must match
// tab_import.inc's running check.
export function runningBrowserMarker(platform=process.platform){
 hostPlatform(platform);
 return platform==='win32'?{name:'lockfile',kind:'file'}:{name:'SingletonLock',kind:'symlink'};
}
// Shipping tags Windows-and-Linux behavior @test-platform-linux (its Electron
// harness fakes the platform). The native fork runs such a scenario on Linux,
// and on Windows when the scenario names Windows (W2 C2); @F45-7 is Linux's
// own Arc import. Elsewhere it is not applicable.
export function linuxTaggedScenarioRuns(tags,name,platform=process.platform){
 if(tags.includes('@F45-7'))return platform==='linux';
 if(!tags.includes('@test-platform-linux'))return true;
 return platform==='linux'||(platform==='win32'&&/\bWindows\b/.test(name));
}
// Windows refuses to open a file another process holds without sharing it
// (the browser's session and cache files while it runs). An administrator can
// still copy it through a volume shadow copy, as the hosted runner is; other
// platforms never refuse, so an error there stands.
export function copyHeldFile(file){
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-held-'));const copy=path.join(folder,path.basename(file));
 try{execFileSync('esentutl.exe',['/y',file,'/d',copy,'/vss','/o'],{stdio:'ignore',timeout:120000});return fs.readFileSync(copy);}
 finally{fs.rmSync(folder,{recursive:true,force:true});}
}
export function readHeldFile(file,{platform=process.platform,read=fs.readFileSync,copyHeld=copyHeldFile}={}){
 try{return read(file);}
 catch(error){if(platform!=='win32'||!['EBUSY','EPERM'].includes(error.code))throw error;return copyHeld(file);}
}
// The window a case starts in. Shipping's window is 1280x800 and its steps
// assume it; the Mac's Chromium default is at least that on the Mac Studio,
// but on the Windows runner's 1920x1080 display it is 929x1004.
export function initialWindowFlags(platform=process.platform){
 return platform==='win32'?['--window-size=1280,800']:[];
}
// The OS's preferred language for a launch, as each platform's Chromium reads
// it: the AppleLanguages default on the Mac, --lang on Windows (interface
// language and default page languages). Linux reads the environment, which
// this harness doesn't fake.
export function osLanguageFlags(tag,platform=process.platform){
 if(!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(String(tag)))throw Error('Not a language tag: '+tag);
 if(platform==='darwin')return ['-AppleLanguages',`(${tag})`];
 if(platform==='win32')return [`--lang=${tag}`];
 throw Error(`The OS language is not faked on ${platform}`);
}
// Every process as "pid command line", one per line.
export function processListCommand(platform=process.platform){
 if(platform==='win32')return ['powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }']];
 return ['/bin/ps',[platform==='darwin'?'-axo':'-eo','pid=,command=']];
}
export function parseProcessList(text){
 return text.split(/\r?\n/).map(line=>/^\s*(\d+)\s+(\S.*)$/.exec(line)).filter(Boolean).map(m=>({pid:Number(m[1]),command:m[2].trimEnd()}));
}
export function listProcesses(){
 const [tool,args]=processListCommand();
 return parseProcessList(execFileSync(tool,args,{encoding:'utf8',maxBuffer:64*1024*1024}));
}
// Holds the display awake for the run where a sleeping display would stop
// it. A hosted runner's display never sleeps.
export function keepAwake(pid=process.pid,platform=process.platform){
 if(platform!=='darwin')return false;
 spawn('/usr/bin/caffeinate',['-d','-i','-w',String(pid)],{stdio:'ignore'}).unref();
 return true;
}
// Linux identifies chrome itself. Mac and Windows also hash their main library.
export function candidateIdentityFiles(config){
 if(config.singleBinary===true){
  if(!config.executable||!config.executableSha256||config.framework!==undefined||config.dll!==undefined||
     config.frameworkSha256!==undefined||config.dllSha256!==undefined)
   throw Error('Single-binary candidate identity needs only an executable and its SHA-256');
  return [[config.executable,config.executableSha256]];
 }
 const library=config.framework!==undefined?['framework','frameworkSha256']:['dll','dllSha256'];
 if((config.framework!==undefined)===(config.dll!==undefined)||!config.executable||!config.executableSha256||!config[library[0]]||!config[library[1]])
  throw Error('Candidate identity needs an executable and either a framework or a dll, each with its SHA-256');
 return [[config.executable,config.executableSha256],[config[library[0]],config[library[1]]]];
}
export function candidateIdentity(config){
 candidateIdentityFiles(config);
 if(config.singleBinary===true)return {id:config.candidate,executableSha256:config.executableSha256,singleBinary:true};
 return config.framework!==undefined
  ?{id:config.candidate,frameworkSha256:config.frameworkSha256,executableSha256:config.executableSha256}
  :{id:config.candidate,dllSha256:config.dllSha256,executableSha256:config.executableSha256};
}
// Free memory in the form macOS's memory_pressure prints, which the memory
// guard parses. Linux counts file cache as used, so it reports nothing and
// the guard lets the run go on.
export function freeMemoryText(platform=process.platform,{free=os.freemem(),total=os.totalmem()}={}){
 if(platform==='darwin')return execFileSync('/usr/bin/memory_pressure',{encoding:'utf8'});
 if(platform!=='win32'||!total)return '';
 return `System-wide memory free percentage: ${Math.round(free/total*100)}%`;
}
