#!/usr/bin/env node
// Future, explicitly authorized operator actions. Importing performs no actions.
// Not a release orchestrator: no tag, upload, publication or production Sync.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {CERT, TEAM, PRODUCT, check, equal, reason, sha256, validateRelease, validateProfile, assetName} from './policy.mjs';
import {run, readPlist, profileAt} from './native.mjs';
import {parts, inspectTree, validateLayout, validateAppInfo, macho, entitlements} from './verify.mjs';

export function orderedParts(r, libraries = []) {
  const prefix = `Contents/Frameworks/${PRODUCT} Framework.framework/Versions/${r.chromiumVersion}/Libraries/`;
  const allowed = ['libaperitif.dylib','libvk_swiftshader.dylib','libvulkan.dylib','libEGL.dylib','libGLESv2.dylib'];
  check(new Set(libraries).size === libraries.length, 'duplicate library');
  for (const file of libraries) check(file.startsWith(prefix) && allowed.includes(file.slice(prefix.length)), 'unreviewed native code payload');
  return [...parts(r), ...libraries.map(file=>({path:file,id:path.basename(file,'.dylib'),role:'none',runtime:false}))]
    .sort((a,b)=>(a.path==='.'?0:a.path.split('/').length)-(b.path==='.'?0:b.path.split('/').length)).reverse();
}
export function signArguments(part, file, entitlementFile) {
  const args = ['--force','--sign',CERT,'--timestamp','--identifier',part.id];
  if (part.runtime) args.push('--options',part.role==='jit'?'restrict,kill,runtime':'restrict,kill,runtime,library');
  // Sparkle's prebuilt services have no App Sandbox entitlement in this product.
  if (part.id.startsWith('org.sparkle-project.') && part.runtime) args[args.length-1]='runtime';
  if (entitlementFile) args.push('--entitlements',entitlementFile,'--generate-entitlement-der');
  args.push(file); return args;
}
export function signingPlan(app, r, arch) {
  validateRelease(r); check(r.arches.includes(arch),'unselected architecture');
  const tree=inspectTree(app); validateAppInfo(readPlist(path.join(app,'Contents/Info.plist')),r,arch);
  const expected=validateLayout(app,r,tree), covered=new Set();
  for (const p of expected) {
    const full=path.join(app,p.path);
    if (p.path==='.' || /\.(app|xpc)$/.test(p.path)) {
      const name=readPlist(path.join(full,'Contents/Info.plist')).CFBundleExecutable;
      check(typeof name==='string' && path.basename(name)===name,'unsafe bundle executable');
      covered.add(fs.realpathSync(path.join(full,'Contents/MacOS',name)));
    } else if (p.path.endsWith('.framework')) {
      const name=readPlist(path.join(full,'Resources/Info.plist')).CFBundleExecutable;
      check(typeof name==='string' && path.basename(name)===name,'unsafe framework executable');
      covered.add(fs.realpathSync(path.join(full,name)));
    } else covered.add(fs.realpathSync(full));
  }
  const native=tree.files.filter(macho);
  for (const file of native) {
    const arches=run('/usr/bin/lipo',['-archs',file]).trim().split(/\s+/);
    check(arches.includes(arch==='x64'?'x86_64':'arm64'),'native architecture mismatch');
  }
  return orderedParts(r,native.filter(file=>!covered.has(fs.realpathSync(file))).map(file=>path.relative(tree.root,file)));
}
export function submitNotary(file, env, spawn = spawnSync) {
  check(env.APPLE_TEAM_ID===TEAM && env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD,'notarization environment missing or wrong team');
  let result;
  try {
    result=spawn('/usr/bin/xcrun',['notarytool','submit',file,'--apple-id',env.APPLE_ID,'--password',env.APPLE_APP_SPECIFIC_PASSWORD,'--team-id',TEAM,'--wait','--output-format','json'],{encoding:'utf8',maxBuffer:4*1024*1024,env});
  } catch { check(false,'notarization command failed; private diagnostics withheld'); }
  check(result.status===0 && !result.error,'notarization command failed; private diagnostics withheld');
  let value; try { value=JSON.parse(result.stdout); } catch { check(false,'invalid notarization response; private diagnostics withheld'); }
  check(value.status==='Accepted','notarization was not accepted; private diagnostics withheld');
  check(/^[a-f0-9-]{36}$/i.test(value.id),'invalid notarization receipt');
  return {status:'Accepted',id:value.id};
}
export function signApp(app,r,arch,output,profileFile) {
  // Inspect all input paths, code and profile before accessing the signing key.
  const plan=signingPlan(app,r,arch);
  equal(sha256(fs.readFileSync(profileFile)),r.profileSHA256,'profile digest');
  const profile=profileAt(profileFile); validateProfile(profile.data,profile.certificates,r);
  check(!fs.existsSync(output) && path.basename(output)===`${PRODUCT}.app`,'new beta app output required');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  run('/usr/bin/ditto',[app,output]);
  fs.copyFileSync(profileFile,path.join(output,'Contents/embedded.provisionprofile'));
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-beta-sign-'));
  try {
    for (const part of plan) {
      const entitlementFile=path.join(scratch,`${part.role}.plist`);
      // Explicit empty entitlement file removes any inherited upstream grants.
      run('/usr/bin/python3',['-c','import sys,json,plistlib; plistlib.dump(json.load(sys.stdin),open(sys.argv[1],"wb"))',entitlementFile],JSON.stringify(entitlements(part.role,r)));
      run('/usr/bin/codesign',signArguments(part,path.join(output,part.path),entitlementFile));
      run('/usr/bin/codesign',['--verify','--strict',path.join(output,part.path)]);
    }
    run('/usr/bin/codesign',['--verify','--deep','--strict',output]);
  } finally { fs.rmSync(scratch,{recursive:true,force:true}); }
  return {status:'signed-copy-created',notarization:'owed',artifactVerification:'owed'};
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    check(process.platform==='darwin' && process.stdin.isTTY,'foreground macOS operator Terminal required');
    const [mode,...args]=process.argv.slice(2);
    if (mode==='sign-app') {
      check(args.length===5,'usage: operator.mjs sign-app RELEASE.json ARCH INPUT.app NEW_OUTPUT.app PROFILE');
      console.log(JSON.stringify(signApp(args[2],JSON.parse(fs.readFileSync(args[0])),args[1],args[3],args[4])));
    } else if (mode==='notarize') {
      check(args.length===1 && /\.(zip|dmg)$/.test(args[0]),'usage: operator.mjs notarize APP.zip_OR_DMG');
      console.log(JSON.stringify(submitNotary(args[0],process.env)));
    } else if (mode==='sign-dmg') {
      check(args.length===3,'usage: operator.mjs sign-dmg RELEASE.json ARCH DMG');
      const r=validateRelease(JSON.parse(fs.readFileSync(args[0])));
      check(r.arches.includes(args[1]) && path.basename(args[2])===assetName(r,args[1]),'wrong DMG name or architecture');
      run('/usr/bin/codesign',['--force','--sign',CERT,'--timestamp','--identifier',assetName(r,args[1]).replace(/\.dmg$/,''),args[2]]);
      run('/usr/bin/codesign',['--verify','--strict',args[2]]);
      console.log(JSON.stringify({status:'dmg-signed',notarization:'owed'}));
    } else check(false,'unknown operator action; nothing executed');
  } catch(error) { console.error(`Beta operator stopped: ${reason(error)}.`); process.exitCode=1; }
}
