import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateBetaBranding} from './preflight.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const temp=fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-beta-identity-'));try{return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}};
const python=(source,input)=>{const r=spawnSync('python3',['-B','-c',source],{input:JSON.stringify(input),encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
test('beta metadata changes only the outer identity and preserves web/document declarations',()=>{
  validateBetaBranding(read('blanc/branding/beta/BRANDING'));
  const result=python(`import sys,json,runpy
m=runpy.run_path(${JSON.stringify(path.join(root,'blanc/branding/beta/metadata.py'))})
x=json.load(sys.stdin)
y=m['metadata'](x,'2.0.0-beta.3',7)
assert x['CFBundleVersion']=='8127.2'
for version,build in [('1.0.0-beta.1',1),('2.0.0',1),('2.0.0-beta.0',1),('2.0.0-beta.1',0)]:
 try: m['metadata'](x,version,build)
 except ValueError: pass
 else: raise AssertionError('invalid metadata accepted')
print(json.dumps(y))`,{CFBundleVersion:'8127.2',CFBundleShortVersionString:'158.0.8127.2',CFBundleDocumentTypes:[{CFBundleTypeName:'HTML'}],CFBundleURLTypes:[{CFBundleURLSchemes:['http','https','file']},{CFBundleURLSchemes:['chromium']}],CrFrameworkVersion:'158.0.8127.2'});
  assert.equal(result.CFBundleIdentifier,'me.bnfy.blanc.beta');assert.equal(result.CrProductDirName,'Blanc Beta');
  assert.equal(result.CFBundleShortVersionString,'2.0.0-beta.3');assert.equal(result.CFBundleVersion,'7');
  assert.equal(result.CrFrameworkVersion,'158.0.8127.2');assert.equal(result.LSMinimumSystemVersion,'13.0');
  assert.deepEqual(result.CFBundleDocumentTypes,[{CFBundleTypeName:'HTML'}]);
  assert.deepEqual(result.CFBundleURLTypes.flatMap(x=>x.CFBundleURLSchemes),['http','https','file','blanc-beta']);
});
test('the actual native path guard rejects old profiles, aliases, traversal and files',{skip:process.platform!=='darwin'},()=>temp(dir=>{
  const source=path.join(dir,'guard.cc'),binary=path.join(dir,'guard');
  fs.writeFileSync(source,'#include "blanc/browser/mac/beta_profile_guard.h"\n#include <cstdio>\nint main(int n,char** v){if(n!=3)return 2;std::puts(blanc::beta::SafeDirectory(v[1],v[2])?"safe":"refused");}\n');
  const built=spawnSync('/usr/bin/clang++',['-std=c++20','-Wall','-Wextra','-Werror','-I',root,source,'-o',binary],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);
  const home=path.join(dir,'home'),support=path.join(home,'Library/Application Support');fs.mkdirSync(support,{recursive:true});
  const check=(candidate,expected)=>{const r=spawnSync(binary,[candidate,home],{encoding:'utf8'});assert.equal(r.status,0);assert.equal(r.stdout.trim(),expected?'safe':'refused');};
  check(path.join(support,'Blanc Beta/Default'),true);check(path.join(dir,'isolated/Profile 1'),true);
  for(const name of ['Blanc','Bowser','me.bnfy.bowser','Blanc Browser','Blanc Chromium Preview']){
    check(path.join(support,name),false);check(path.join(support,name,'Default/Absent'),false);
    check(path.join(home,'Library/Caches',name,'Cache'),false);
  }
  const old=path.join(support,'Blanc');fs.mkdirSync(old);
  const alias=path.join(dir,'alias');fs.symlinkSync(old,alias);check(path.join(alias,'Default'),false);
  check(path.join(support,'Blanc Beta copy'),true);check(support+'/Blanc/../Blanc Beta',false);check('relative/profile',false);
  const file=path.join(dir,'file');fs.writeFileSync(file,'fixture');check(file,false);check(file+'/child',false);
  const dangling=path.join(dir,'dangling');fs.symlinkSync(path.join(dir,'missing'),dangling);check(dangling,false);
  const outside=path.join(dir,'moved-stable');fs.mkdirSync(outside);fs.rmdirSync(old);fs.symlinkSync(outside,old);check(outside,false);check(path.join(outside,'Default'),false);
}));
test('beta build selection, Safe Storage and main-only entitlement template are explicit',()=>{
  const config=read('blanc/config.gni'),patch=read('patches/0046-blanc-beta-identity.patch');
  assert.match(config,/blanc_channel = "preview"/);assert.match(config,/blanc_beta_channel = blanc_channel == "beta"/);
  assert.match(config,/blanc_enable_test_hooks = blanc_channel == "preview" && !is_official_build/);
  assert.match(patch,/Blanc Beta Safe Storage/);assert.match(patch,/!enable_widevine && !bundle_widevine_cdm && !enable_updater/);
  assert.match(patch,/ConfigureDataDirectory[\s\S]*?TerminateCurrentProcessImmediately/);
  assert.match(read('blanc/branding/beta/app-entitlements.plist'),/CHROMIUM_BUNDLE_ID\}\.webauthn/);
  assert.doesNotMatch(read('blanc/branding/beta/app-entitlements.plist'),/disable-library-validation|allow-unsigned-executable-memory/);
});
