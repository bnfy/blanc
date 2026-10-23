'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('Mac ECS handoff requires a disposable native Mac host and the normal Restart Now action',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../desktop/ecs-production-updater-mac.mjs'),'utf8');
 assert.match(source,/assert\(\['x64','arm64'\]\.includes\(process.arch\)\)/);
 assert.match(source,/assert.equal\(process.env.RUNNER_ARCH,\{x64:'X64',arm64:'ARM64'\}\[process.arch\]/);
 assert.match(source,/assert.equal\(process.env.GITHUB_ACTIONS,'true'\)/);
 assert.match(source,/BLANC_ECS_DISPOSABLE_HOST/);
 assert.match(source,/click button "Restart Now" of sheet 1 of window windowIndex/);
 assert.match(source,/click button "Restart Now" of window windowIndex/);
 assert.match(source,/automatic updated process/);
 assert.match(source,/exact updated app payload/);
 assert.match(source,/const root=await fs.realpath\(await fs.mkdtemp\(/);
 assert.match(source,/assert.equal\(media.status,2\)/);
 assert.match(source,/protectedPage\(marker,\{muted:false\}\)/);
 assert.match(source,/assert.equal\(media.muted,false/);
 assert.match(source,/ecs-handoff-owner/);
 assert.match(source,/probeRequests\+\+/);
 assert.match(source,/updated probe navigation request/);
 assert.match(source,/keystroke "a" using command down/);
 assert.match(source,/if\(report.probeReady===false\)throw Error/);
 assert.match(source,/const method=attempt<3\?'keystrokes':'launch-services'/);
 assert.match(source,/run\('\/usr\/bin\/open',\['-a',app,origin\+'\/'\]\)/);
 assert.match(source,/report.navigation.push\(evidence\)/);
 assert.match(source,/successor remains the only Blanc process/);
 assert.match(source,/pids.length===1&&pids\[0\]===successorPid/);
 assert.match(source,/if\(process.arch==='x64'\)run\('bash'/);
 assert.match(source,/ci-intel-apple-tickets.sh'\),app\],120000\)/);
 assert.match(source,/run\('xcrun',\['stapler','validate',app\],120000\)/);
 assert.match(source,/run\('spctl',\['--assess','--type','execute','--verbose=4',app\],120000\)/);
 assert.doesNotMatch(source,/quitAndInstall\(|AUTO_INSTALL:\s*'1'|\bHOME:\s*|--no-sandbox/);
});
test('retired Intel draft intake jobs and permissions are removed',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/ublock-origin.yml'),'utf8');
 assert.doesNotMatch(workflow,/ecs_intel_updater|ecs_signed_intel|ecs-updater-intel:|ecs-signed-intel:|ecs-private-intel-562ec1c87|ecs_fresh_mac|ecs-fresh-mac:|ecs-private-mac-fd8654147|contents: write/);
});
test('reusable Mac qualification tests survive the retired intake job',()=>{
 for(const file of ['../desktop/ecs-production-updater-mac.mjs','../desktop/ecs-cdm-lifecycle-mac.mjs','../desktop/ecs-signed-audio-controls.mjs','../desktop/support/run-with-mac-audio-permission.mjs','../desktop/support/approve-mac-audio-dialog.applescript']){
  assert(fs.existsSync(path.join(__dirname,file)),file);
 }
});
