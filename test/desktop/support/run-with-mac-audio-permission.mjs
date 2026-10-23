import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
assert.equal(process.platform,'darwin');assert.equal(process.arch,'x64');
assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.RUNNER_ARCH,'X64');
assert.equal(process.env.GITHUB_REF,'refs/heads/codex/ecs-production-integration');
assert.equal(process.env.BLANC_ECS_ALLOW_NATIVE_AUDIO_PROMPT,'1','explicit owner-authorized CI mode required');
const [script,...args]=process.argv.slice(2);
const allowed=['ecs-signed-audio-controls.mjs','ecs-production-drm-smoke.mjs','ecs-production-updater-mac.mjs'];
const desktop=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert(allowed.some(name=>path.resolve(script)===path.join(desktop,name)),'only the fixed qualification scripts may run');
const report={scope:'Blanc microphone OS dialog on disposable Intel runner',approved:false,observations:[]};
const dialogScript=fileURLToPath(new URL('./approve-mac-audio-dialog.applescript',import.meta.url));
const child=spawn(process.execPath,[script,...args],{env:process.env,stdio:'inherit'});
let done=false;
const completion=new Promise((resolve,reject)=>{
  child.once('error',error=>{done=true;reject(error);});
  child.once('exit',(code,signal)=>{done=true;resolve({code,signal});});
});
const watcher=(async()=>{
  while(!done&&!report.approved){
    try {
      const {stdout}=await exec('/usr/bin/osascript',[dialogScript],{timeout:5000,maxBuffer:4096});
      const result=stdout.trim();
      if(result.startsWith('approved|')){report.approved=true;report.systemProcess=result.split('|')[1];}
      else if(result!=='waiting'&&report.observations.length<5)report.observations.push(result);
    }catch(error){if(report.observations.length<5)report.observations.push({code:error.code??null,signal:error.signal??null,
      detail:String(error.stderr??'').slice(0,600)});}
    if(!done&&!report.approved)await new Promise(resolve=>setTimeout(resolve,500));
  }
})();
try {
  const result=await completion;report.childExit=result;
  await watcher;
  process.exitCode=result.code??1;
}finally{
  done=true;await watcher;
  await fs.mkdir('output/ecs-production',{recursive:true});
  await fs.writeFile(`output/ecs-production/${path.basename(script,'.mjs')}-permission.json`,JSON.stringify(report,null,2));
}
