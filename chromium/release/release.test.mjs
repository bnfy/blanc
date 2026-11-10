import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { validateRelease, validateProfile, validateIdentityList, validateGN, validateLedger, reason, ReleaseCheckError, ROOT_ID, TEAM, CERT, sha256, assetName, feedURL } from './policy.mjs';
import { generateAppcast, validateAppcast } from './appcast.mjs';
import { validatePart, validateAppInfo, entitlements, inspectTree, parts } from './verify.mjs';
import { fileURLToPath } from 'node:url';
import { derEntitlements, profileAt } from './native.mjs';
import { inputInventory, validateLocalInputs, validateBetaBranding } from './preflight.mjs';
import { makeManifest, verifyManifest, verifyEvidenceFiles, readPayloads, GATES } from './manifest.mjs';
const fixture = () => JSON.parse(fs.readFileSync(new URL('./fixtures/release.json', import.meta.url)));
const temp = fn => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beta-release-test-')); try { return fn(dir); } finally {fs.rmSync(dir,{recursive:true,force:true});} };
const keyFixture = () => {const r = fixture(), keys = generateKeyPairSync('ed25519'); r.sparkle.publicKey = keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64'); return {r, privateKey:keys.privateKey};};
const gn = arch => `target_os = "mac"\ntarget_cpu = "${arch}"\nis_official_build = true\nis_debug = false\nis_component_build = false\nis_chrome_branded = false\nblanc_channel = "beta"\nenable_widevine = false\nbundle_widevine_cdm = false\nenable_updater = false\n`;
test('preflight pins actual GN, profile and Sparkle bytes; refuses preview/DRM/expressions',()=>temp(dir=>{
  const r=fixture(),inputs={profile:path.join(dir,'profile'),sparkleArchive:path.join(dir,'sparkle'),gnArgs:{}};
  fs.writeFileSync(inputs.profile,'profile');r.profileSHA256=sha256('profile');fs.writeFileSync(inputs.sparkleArchive,'sparkle');r.sparkle.archiveSHA256=sha256('sparkle');
  for(const arch of r.arches){inputs.gnArgs[arch]=path.join(dir,arch);fs.writeFileSync(inputs.gnArgs[arch],gn(arch));r.gnArgsSHA256[arch]=sha256(gn(arch));}
  validateLocalInputs(r,inputs);
  for(const changed of [gn('arm64').replace('is_official_build = true','is_official_build = false'),gn('arm64').replace('enable_widevine = false','enable_widevine = true'),gn('arm64').replace('"beta"','"release"'),gn('arm64')+'import("other.gni")',gn('arm64')+'target_cpu = "x64"',gn('arm64')+'dcheck_always_on = true',gn('arm64')+'is_asan = true'])assert.throws(()=>validateGN(changed,'arm64'));
  fs.writeFileSync(inputs.sparkleArchive,'changed');assert.throws(()=>validateLocalInputs(r,inputs));
}));
test('release policy accepts isolated beta and requires immutable monotonic versions', () => {
  assert.equal(validateRelease(fixture()).build,1);
  for (const change of [r=>r.bundleId='me.bnfy.bowser',r=>r.userDataDir='Blanc',r=>r.product='Blanc',r=>r.keychainGroup=`${TEAM}.me.bnfy.bowser`,r=>r.tag='v1.0.0-beta.1',r=>r.shortVersion='1.0.0',r=>r.prerelease=false,r=>r.makeLatest=true,r=>r.previousBuild=1,r=>r.build=1.1,r=>r.build=10000,r=>r.upstream='a'.repeat(40),r=>r.certificateSHA1='a'.repeat(40),r=>r.sparkle.publicKey='bad',r=>r.sparkle.version='latest',r=>r.candidates={},r=>r.gnArgsSHA256={}]) {
    const r=fixture();change(r);assert.throws(()=>validateRelease(r));
  }
  const single=fixture();single.arches=['arm64'];delete single.candidates.x64;
  assert.throws(()=>validateRelease(single),/waiver/);single.archWaiver='Owner: Intel deferred pending machine qualification.';validateRelease(single);
});
test('current release branding cannot masquerade as beta source',()=>{
  assert.throws(()=>validateBetaBranding(fs.readFileSync(new URL('../blanc/branding/release/BRANDING',import.meta.url),'utf8')));
  validateBetaBranding(`MAC_BUNDLE_ID=${ROOT_ID}\nMAC_TEAM_ID=${TEAM}\nPRODUCT_FULLNAME=Blanc Beta\nPRODUCT_SHORTNAME=Blanc Beta\n`);
});
const profileFixture = () => ({ProvisionsAllDevices:true, Platform:['OSX'], ExpirationDate:'2030-01-01T00:00:00Z',TeamIdentifier:[TEAM],Entitlements:{'com.apple.application-identifier':`${TEAM}.${ROOT_ID}`,'com.apple.developer.team-identifier':TEAM,'keychain-access-groups':[`${TEAM}.${ROOT_ID}.webauthn`]}});
const certs = [{fingerprint:CERT, validFrom:'2025-01-01',validTo:'2027-02-01',subject:`CN=Developer ID Application: Fixture (${TEAM})\nOU=${TEAM}`}];
test('profile rejects expiry, development devices, wrong cert/team/group and wildcards',()=>{
  const r=fixture(),now=Date.parse('2026-11-09');validateProfile(profileFixture(),certs,r,now);
  for(const change of [p=>p.ProvisionsAllDevices=false,p=>p.ProvisionedDevices=[],p=>p.Platform=['iOS'],p=>p.ExpirationDate='invalid',p=>p.ExpirationDate='2020-01-01',p=>p.TeamIdentifier=['OTHER'],p=>p.Entitlements['get-task-allow']=true,p=>p.Entitlements['keychain-access-groups']=['OTHERTEAM01.*'],p=>p.Entitlements['keychain-access-groups']=[`${TEAM}.*`,`${TEAM}.me.bnfy.bowser`],p=>p.Entitlements['keychain-access-groups']=[],p=>delete p.Entitlements['keychain-access-groups'],p=>p.Entitlements['com.apple.application-identifier']=`${TEAM}.me.bnfy.bowser`]){
    const p=profileFixture();change(p);assert.throws(()=>validateProfile(p,certs,r,now));
  }
  assert.throws(()=>validateProfile(profileFixture(),[],r,now));
  assert.throws(()=>validateProfile(profileFixture(),certs,r,Date.parse('2028-01-01')));
  validateIdentityList(`  1) ${CERT} "Developer ID Application: Fixture (${TEAM})"`,r);
  assert.throws(()=>validateIdentityList(`  1) ${CERT} "Apple Development: Fixture (${TEAM})"`,r));
});
// The committed beta profile: its bytes are pinned, and the policy must accept the
// shape Apple actually issues (team-wildcard keychain group, one pinned certificate).
const PROFILE = new URL('./blanc-beta.provisionprofile', import.meta.url);
const PROFILE_SHA256 = 'c4d6ef484cb449f4c3bd730aeccc5561b1a536223b7f36e0ac26d50b698b581c';
test('committed beta profile is pinned and its observed contents pass policy',()=>{
  assert.equal(sha256(fs.readFileSync(PROFILE)),PROFILE_SHA256);
  const observed=JSON.parse(fs.readFileSync(new URL('./fixtures/blanc-beta.profile.json',import.meta.url))),now=Date.parse('2026-11-10');
  assert.deepEqual(observed.data.Entitlements['keychain-access-groups'],[`${TEAM}.*`]);
  assert.deepEqual(observed.certificates.map(c=>c.fingerprint),[CERT]);
  validateProfile(observed.data,observed.certificates,fixture(),now);
  // The pinned certificate expires 2027-02-01; the profile is unusable after that.
  assert.throws(()=>validateProfile(observed.data,observed.certificates,fixture(),Date.parse('2027-02-02')));
});
test('committed beta profile decodes to the recorded observation',{skip:process.platform!=='darwin'&&'security cms is macOS-only'},()=>{
  const observed=JSON.parse(fs.readFileSync(new URL('./fixtures/blanc-beta.profile.json',import.meta.url))),decoded=profileAt(fileURLToPath(PROFILE));
  const {DeveloperCertificates,'DER-Encoded-Profile':der,...data}=decoded.data;
  assert.deepEqual(data,observed.data);assert.deepEqual(decoded.certificates,observed.certificates);
  validateProfile(decoded.data,decoded.certificates,fixture(),Date.parse('2026-11-10'));
});
test('per-helper policy catches excessive entitlements, stable IDs and missing hardened runtime',()=>{
  const r=fixture();
  for(const part of parts(r)){
    const observation={identifier:part.id,fingerprint:CERT,team:TEAM,authority:`Developer ID Application: Fixture (${TEAM})`,timestamp:true,runtime:true,entitlements:entitlements(part.role,r)};
    validatePart(observation,part,r);
    for(const change of [o=>o.identifier='me.bnfy.bowser',o=>o.fingerprint='F'.repeat(40),o=>o.timestamp=false,o=>o.entitlements['com.apple.security.get-task-allow']=true,o=>o.entitlements['com.apple.security.cs.disable-library-validation']=true]){
      const changed=structuredClone(observation);change(changed);assert.throws(()=>validatePart(changed,part,r));
    }
    if(part.runtime)assert.throws(()=>validatePart({...observation,runtime:false},part,r));
  }
});
test('Info.plist binds feed, profile, build, name and direct-launch scheme',()=>{
  const r=fixture(),p={CFBundleIdentifier:ROOT_ID,CFBundleName:r.product,CFBundleDisplayName:r.product,CFBundleExecutable:r.product,CrProductDirName:r.product,CFBundleVersion:'1',CFBundleShortVersionString:r.version,SUFeedURL:feedURL('arm64'),SUPublicEDKey:r.sparkle.publicKey,SUVerifyUpdateBeforeExtraction:true,LSMinimumSystemVersion:r.minimumSystemVersion,CFBundleURLTypes:[{CFBundleURLSchemes:['http','https','file','blanc-beta']}]};
  validateAppInfo(p,r,'arm64');
  for(const change of [v=>v.CFBundleIdentifier='me.bnfy.bowser',v=>v.CrProductDirName='Blanc',v=>v.SUFeedURL=feedURL('x64'),v=>v.SUVerifyUpdateBeforeExtraction=false,v=>v.CFBundleVersion='158.0.8127.2',v=>v.CFBundleShortVersionString='1.0.0',v=>v.CFBundleURLTypes[0].CFBundleURLSchemes.push('blanc'),v=>v.SUEnableInstallerLauncherService=true]){const v=structuredClone(p);change(v);assert.throws(()=>validateAppInfo(v,r,'arm64'));}
});
test('DER parsing distinguishes typed booleans, arrays and rejects unknown values',()=>{
  const listing='0:d=0 cons: SEQUENCE\n1:d=3 prim: UTF8STRING :com.apple.security.cs.allow-jit\n2:d=3 prim: BOOLEAN :255\n3:d=3 prim: UTF8STRING :keychain-access-groups\n4:d=3 cons: SEQUENCE\n5:d=4 prim: UTF8STRING :beta.group';
  assert.deepEqual(derEntitlements(listing),{'com.apple.security.cs.allow-jit':true,'keychain-access-groups':['beta.group']});
  assert.throws(()=>derEntitlements(listing.replace('BOOLEAN :255','INTEGER :1')));
  assert.throws(()=>derEntitlements(listing.replace('d=3','d=2')));
});
test('payload walk refuses a CDM and links escaping the app',()=>temp(dir=>{
  fs.writeFileSync(path.join(dir,'notice'),'fixture');assert.equal(inspectTree(dir).files.length,1);
  fs.mkdirSync(path.join(dir,'WidevineCdm'));assert.throws(()=>inspectTree(dir),/Widevine/);fs.rmdirSync(path.join(dir,'WidevineCdm'));
  fs.symlinkSync(os.tmpdir(),path.join(dir,'escape'));assert.throws(()=>inspectTree(dir),/escapes/);
}));
test('appcast verifies real Ed25519 archive signature and rejects tampered feed, key or archive',()=>{
  const {r,privateKey}=keyFixture(),bytes=Buffer.from('fixture DMG bytes'),signature=sign(null,bytes,privateKey).toString('base64');
  const xml=generateAppcast(r,'arm64',bytes,signature);assert.equal(validateAppcast(xml,r,'arm64',bytes,signature),true);
  for(const changed of [xml.replace('https://github.com','http://github.com'),xml.replace('<sparkle:version>1','<sparkle:version>2'),xml+'<!-- extra -->',xml.replace('length="17"','length="18"')])assert.throws(()=>validateAppcast(changed,r,'arm64',bytes,signature));
  assert.throws(()=>generateAppcast(r,'arm64',Buffer.from('tampered'),signature));
  assert.throws(()=>generateAppcast(fixture(),'arm64',bytes,signature));
  assert.throws(()=>generateAppcast(r,'arm64',bytes,'A'.repeat(88)));
});
function payloadFixture(){
  const {r,privateKey}=keyFixture(),payloads={},e={sourceCommit:r.sourceCommit,inputDigest:r.inputDigest,build:r.build,arches:{}};
  for(const arch of r.arches){const bytes=Buffer.from(`fixture ${arch}`);payloads[assetName(r,arch)]=bytes;payloads[`appcast-${arch}.xml`]=Buffer.from(generateAppcast(r,arch,bytes,sign(null,bytes,privateKey).toString('base64')));e.arches[arch]={candidate:r.candidates[arch],dmgSHA256:sha256(bytes),gnArgsSHA256:r.gnArgsSHA256[arch],gates:Object.fromEntries(GATES.map(g=>[g,{status:'pass',evidenceSHA256:'a'.repeat(64)}]))};}
  payloads['release.json']=Buffer.from(JSON.stringify(r));payloads['acceptance.json']=Buffer.from(JSON.stringify(e));payloads['NOTICES.txt']=Buffer.from('fixture notices');
  payloads['Blanc-Beta.cdx.json']=Buffer.from(JSON.stringify({bomFormat:'CycloneDX',specVersion:'1.6',version:1,components:[{name:'Chromium',version:r.chromiumVersion,licenses:[{license:{id:'BSD-3-Clause'}}]},{name:'Sparkle',version:r.sparkle.version,licenses:[{license:{id:'MIT'}}]}]}));
  return {r,payloads,e};
}
test('manifest covers every payload, itself in checksums, excludes signature recursion',()=>temp(dir=>{
  const {r,payloads}=payloadFixture(),m=makeManifest(r,payloads);assert.equal(m.checksums.split('\n').filter(Boolean).length,Object.keys(payloads).length+1);
  for(const [name,bytes] of Object.entries(payloads))fs.writeFileSync(path.join(dir,name),bytes);
  assert.deepEqual(readPayloads(dir,r),payloads);
  fs.writeFileSync(path.join(dir,'RELEASE-MANIFEST.json'),m.json);fs.writeFileSync(path.join(dir,'SHA256SUMS'),m.checksums);fs.writeFileSync(path.join(dir,'SHA256SUMS.sigstore.json'),'{}');
  assert.throws(()=>verifyManifest(dir,r));fs.writeFileSync(path.join(dir,'SHA256SUMS.sigstore.json'),'{"fixture":true}');
  assert.match(verifyManifest(dir,r).sigstoreAuthentication,/REQUIRES cosign/);
  fs.appendFileSync(path.join(dir,'NOTICES.txt'),'changed');assert.throws(()=>verifyManifest(dir,r));
}));
test('manifest rejects stable metadata, missing evidence, mismatched candidate and partial SBOM',()=>{
  for(const alter of [p=>p['latest-mac.yml']=Buffer.from('bad'),p=>delete p['NOTICES.txt'],p=>p['Blanc-Beta.cdx.json']=Buffer.from('{}'),p=>{const e=JSON.parse(p['acceptance.json']);e.arches.arm64.candidate='wrong';p['acceptance.json']=Buffer.from(JSON.stringify(e));},p=>{const e=JSON.parse(p['acceptance.json']);e.arches.arm64.gates['production-sync-real-device'].status='pending';p['acceptance.json']=Buffer.from(JSON.stringify(e));}]){const {r,payloads}=payloadFixture();alter(payloads);assert.throws(()=>makeManifest(r,payloads));}
});
test('source inventory detects changed patch and pristine inputs without a Chromium checkout',()=>temp(root=>{
  const write=(name,value)=>{fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),value);};
  write('chromium/lanes/desktop.json',JSON.stringify({upstream:'a',patches:['patches/test.patch']}));
  write('chromium/upstream/manifest.json',JSON.stringify({upstream:'a',files:{'file.cc':sha256('upstream')}}));write('chromium/upstream/file.cc','upstream');write('chromium/source-map.json','{}');write('chromium/patches/test.patch','patch');write('chromium/blanc/file.cc','custom');
  const list=()=>['chromium/blanc/file.cc'];
  const before=inputInventory(root,list).digest;write('chromium/patches/test.patch','changed');assert.notEqual(inputInventory(root,list).digest,before);
  write('chromium/upstream/file.cc','tampered');assert.throws(()=>inputInventory(root,list));
}));
test('source inventory hashes only tracked files, so an ignored file cannot change the digest',{skip:process.platform==='win32'&&'uses /usr/bin/git'},()=>temp(root=>{
  const write=(name,value)=>{fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),value);};
  write('chromium/lanes/desktop.json',JSON.stringify({upstream:'a',patches:['patches/test.patch']}));
  write('chromium/upstream/manifest.json',JSON.stringify({upstream:'a',files:{}}));write('chromium/source-map.json','{}');write('chromium/patches/test.patch','patch');write('chromium/blanc/file.cc','custom');write('.gitignore','.DS_Store\n');
  const git=(...args)=>assert.equal(spawnSync('/usr/bin/git',['-C',root,...args],{encoding:'utf8'}).status,0);
  git('init','-q');git('add','-A');
  const before=inputInventory(root);assert.ok(before.files.some(f=>f.path==='chromium/blanc/file.cc'));
  write('chromium/blanc/.DS_Store','finder');assert.equal(inputInventory(root).digest,before.digest);
  write('chromium/blanc/file.cc','edited');assert.notEqual(inputInventory(root).digest,before.digest);
}));
test('build ledger decides previousBuild and refuses reused builds, versions and tags',()=>{
  const r=fixture();validateLedger({schema:1,builds:[]},r);
  assert.throws(()=>validateLedger({schema:1,builds:[{build:1,version:'1.0.0-beta.0'}]},r));
  assert.throws(()=>validateLedger({},r));
  const next={...r,version:'1.0.0-beta.3',tag:'chromium-beta-1.0.0-beta.3',build:4,previousBuild:3},used=[{build:1,version:'1.0.0-beta.1',tag:'chromium-beta-1.0.0-beta.1'},{build:3,version:'1.0.0-beta.2'}];
  validateLedger({schema:1,builds:used},next);
  assert.throws(()=>validateLedger({schema:1,builds:used},{...next,previousBuild:1}));
  assert.throws(()=>validateLedger({schema:1,builds:used},{...next,version:'1.0.0-beta.2'}));
  assert.throws(()=>validateLedger({schema:1,builds:[used[1],used[0]]},next));
  validateLedger(JSON.parse(fs.readFileSync(new URL('./ledger.json',import.meta.url))),r);
});
test('failures name the check without leaking compared values or unexpected errors',()=>{
  const r=fixture();r.bundleId='me.bnfy.bowser';
  try{validateRelease(r);assert.fail('accepted');}catch(error){assert.ok(error instanceof ReleaseCheckError);assert.equal(reason(error),'beta identity must not be the shipping identity');assert.ok(!error.message.includes('bowser'));}
  assert.equal(reason(new Error('/private/path secret')),'unexpected error (details withheld)');
});
test('manifest build requires each gate evidence bundle to match its recorded digest',()=>temp(dir=>{
  const {r,e}=payloadFixture();
  for(const arch of r.arches){fs.mkdirSync(path.join(dir,arch));for(const gate of GATES){fs.writeFileSync(path.join(dir,arch,`${gate}.evidence`),`${arch} ${gate}`);e.arches[arch].gates[gate].evidenceSHA256=sha256(`${arch} ${gate}`);}}
  verifyEvidenceFiles(e,r,dir);
  fs.writeFileSync(path.join(dir,'arm64','acceptance.evidence'),'changed');assert.throws(()=>verifyEvidenceFiles(e,r,dir),/digest mismatch: arm64\/acceptance/);
  fs.rmSync(path.join(dir,'x64','gatekeeper.evidence'));fs.writeFileSync(path.join(dir,'arm64','acceptance.evidence'),'arm64 acceptance');assert.throws(()=>verifyEvidenceFiles(e,r,dir),/missing evidence bundle: x64\/gatekeeper/);
}));
test('draft has no execution escape hatch or service contact, even with release environment',()=>{
  const script=path.resolve(import.meta.dirname,'../../scripts/release-chromium-beta.sh');
  for(const args of [[],['--execute'],['--plan','extra']]){const result=spawnSync('/bin/bash',[script,...args],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',BLANC_RELEASE_MODE:'stable',BLANC_CHROMIUM_BETA_EXECUTE:'1'}});assert.equal(result.status,78);}
  const plan=spawnSync('/bin/bash',[script,'--plan'],{encoding:'utf8',env:{PATH:'/usr/bin:/bin'}});assert.equal(plan.status,0);assert.match(plan.stdout,/all disabled/);
});
