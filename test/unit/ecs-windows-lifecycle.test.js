'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {binaryRelative,validateBinary,readCdmBinary}=require('../desktop/support/cdm-lifecycle.cjs');
const {runWindowsPowerShell}=require('../desktop/support/windows-powershell.cjs');
test('Windows harness resets inherited PowerShell module lookup and fails closed',()=>{
 let invocation;
 const result=runWindowsPowerShell('Get-AuthenticodeSignature test.exe',120000,(...args)=>{invocation=args;return ' valid \n';});
 assert.equal(result,'valid');assert.equal(invocation[0],'powershell.exe');
 assert.equal(invocation[2].env.PSModulePath,'');assert.equal(invocation[2].timeout,120000);
 assert.equal(invocation[2].windowsHide,true);assert.equal(invocation[2].encoding,'utf8');
 assert(invocation[1].includes('None'));assert.match(invocation[1].at(-1),/\$ErrorActionPreference = 'Stop'/);
 assert.match(invocation[1].at(-1),/OutputEncoding/);
 assert.throws(()=>runWindowsPowerShell('invalid',30000,()=>{throw Error('module unavailable');}),/module unavailable/);
});
test('Windows CDM fixtures use immutable upstream pins and reject wrong binaries',()=>{
 const pins=require('../desktop/fixtures/cdm-lifecycle-windows.json');
 assert.notEqual(pins.previous.version,pins.current.version);
 for(const pin of [pins.previous,pins.current]){
  assert.match(pin.source,/mozilla-firefox\/firefox\/blob\/[a-f0-9]{40}\//);
  assert.match(pin.url,/^https:\/\/www\.google\.com\/dl\/.*_win64_/);
  assert.match(pin.sha512,/^[a-f0-9]{128}$/);assert(pin.bytes>20000000);
 }
 const pe=Buffer.alloc(256);pe.write('MZ');pe.writeUInt32LE(64,0x3c);pe.writeUInt32LE(0x4550,64);pe.writeUInt16LE(0x8664,68);pe.writeUInt16LE(0x20b,88);
 validateBinary(pe,'win32-x64');
 const invalid=Buffer.from(pe);invalid.writeUInt16LE(0x14c,68);assert.throws(()=>validateBinary(invalid,'win32-x64'),/AMD64/);
 assert.throws(()=>validateBinary(pe,'linux-x64'),/ELF/);
 assert.throws(()=>binaryRelative('unknown'));
});
test('Windows binary reads preserve nested/flat fallback without masking IO errors',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'windows-cdm-layout-'));
 try{
  fs.writeFileSync(path.join(root,'widevinecdm.dll'),'flat');
  assert.equal((await readCdmBinary(root,'win32-x64')).bytes.toString(),'flat');
  const nested=path.join(root,binaryRelative('win32-x64'));fs.mkdirSync(path.dirname(nested),{recursive:true});fs.writeFileSync(nested,'nested');
  assert.equal((await readCdmBinary(root,'win32-x64')).bytes.toString(),'nested');
  fs.unlinkSync(nested);fs.mkdirSync(nested);await assert.rejects(readCdmBinary(root,'win32-x64'),{code:'EISDIR'});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Windows CDM command parsing identifies the exact broker, including quoted switches',()=>{
 const source=fs.readFileSync('test/desktop/support/windows-cdm-inspect.ps1','utf8');
 const pattern=source.match(/if \(\$command -match '([^']+)'\)/)[1];
 const re=new RegExp(pattern);
 for(const arg of ['--utility-sub-type=media.mojom.CdmServiceBroker','"--utility-sub-type=media.mojom.CdmServiceBroker"']){
  assert.equal(re.exec('Blanc.exe --type=utility '+arg+' --service-sandbox-type=cdm')[1],'media.mojom.CdmServiceBroker');
 }
 assert.notEqual(re.exec('Blanc.exe --utility-sub-type=media.mojom.CdmServiceBrokerOther')[1],'media.mojom.CdmServiceBroker');
 assert.equal(re.exec('Blanc.exe --service-sandbox-type=cdm'),null);
});
test('Windows lifecycle retains genuine update, unmuted VMP and kernel token checks',()=>{
 const source=fs.readFileSync('test/desktop/ecs-cdm-lifecycle-windows.mjs','utf8');
 assert.match(source,/assertCdmVersionAbsent\(profile,fixtures.current.version\)/);
 assert.match(source,/result.status,2/);assert.match(source,/result.muted,false/);
 assert.match(source,/state.enabled,true/);assert.doesNotMatch(source,/state.supported/);
 assert.match(source,/inspectWindowsCdm\(ids,binary\(fixture.version\),fixture.sha256\)/);
 assert.match(source,/automaticVendorRollback=false/);assert.match(source,/initial-delay=1/);
 assert.doesNotMatch(source,/--no-sandbox|disable-cup|updatesEnabled\s*=/);
 const inspect=fs.readFileSync('test/desktop/support/windows-cdm.cjs','utf8');
 for(const key of ['restrictedToken','inJob','cdmService','cdmSandbox'])assert(inspect.includes(`row.${key}, true`));
 assert.match(inspect,/<= 4096/);assert.match(inspect,/exact mapped CDM bytes/);
 assert.match(inspect,/runWindowsPowerShell\(command\)/);
 assert.match(inspect,/row.utilitySubtype, 'media.mojom.CdmServiceBroker'/);
 const native=fs.readFileSync('test/desktop/support/windows-cdm-inspect.ps1','utf8');
 assert.match(native,/-ceq 'media.mojom.CdmServiceBroker'/);
 assert.doesNotMatch(native,/-match 'cdm\\.mojom/);
});
test('Windows updater requires native Restart Now and exact automatic successor',()=>{
 const source=fs.readFileSync('test/desktop/ecs-production-updater-windows.mjs','utf8');
 assert.match(source,/GITHUB_ACTIONS,'true'/);assert.match(source,/BLANC_ECS_DISPOSABLE_HOST,'1'/);
 assert.match(source,/native Restart Now/);assert.match(source,/exact installed target payload/);
 assert.match(source,/automatic successor/);assert.match(source,/playback.status,2/);assert.match(source,/playback.muted,false/);
 assert.match(source,/report.exactTargetInstalled=true/);assert.match(source,/report.oldBrowserExited=true/);
 assert.match(source,/report.processEvidence=processEvidence\(\)/);
 assert.match(source,/processPath:\$process.Path|processPath=\$process.Path/);
 assert.match(source,/profileRemoved,true/);assert.match(source,/installationRemoved,true/);
 assert.doesNotMatch(source,/quitAndInstall\(|STAGING_AUTO_INSTALL:'1'|--no-sandbox/);
 const ui=fs.readFileSync('test/desktop/support/windows-owned-ui.ps1','utf8');
 assert.match(ui,/ProcessIdProperty,\$TargetProcessId/);assert.match(ui,/InvokePattern/);
 assert.match(ui,/GetClassName\(\$handle,\$class/);
 assert.match(ui,/\$class.ToString\(\) -ceq '#32770' -and \$owner -eq \$TargetProcessId/);
 assert.match(ui,/Update \$ExpectedVersion downloaded/);
 assert.match(ui,/NameProperty,'Later'/);
 assert.match(ui,/if\(\$buttons.Count -ne 1\)/);
 assert.match(ui,/if\(!\$dialog\)\{continue\}/);
 assert.match(source,/-ExpectedVersion \$\{quote\(targetVersion\)\}/);
 assert.match(ui,/TryGetCurrentPattern/);
 assert.match(ui,/\$owner -ne \$TargetProcessId/);
 assert.match(ui,/Automation\]::Compare/);
 assert.match(ui,/\$foregroundPid -ne \$TargetProcessId/);
});
test('Windows lifecycle dispatch is private, branch-scoped, signing-gated and cleans secrets before tests',()=>{
 const workflow=fs.readFileSync('.github/workflows/release-windows-linux.yml','utf8');
 assert.match(workflow,/ECS_WINDOWS_LIFECYCLE/);assert.match(workflow,/refs\/heads\/codex\/ecs-production-integration/);
 const job=workflow.split('  ecs-production-windows:')[1].split('  ecs-production-linux:')[0];
 assert.match(job,/environment: ecs-signing/);assert.match(job,/contents: read/);
 assert.match(job,/npm version 1.43.0-staging.3 --no-git-tag-version/);
 assert(job.indexOf('Remove EVS credentials before native tests')<job.indexOf('Real Windows CDM first-install'));
 assert.match(job,/ecs_package_verified.outcome == 'success'/);
 assert.match(job,/ecs-production-updater-windows.mjs/);
 assert.doesNotMatch(job,/gh release (?:create|upload|edit)|continue-on-error|contents: write/);
});
