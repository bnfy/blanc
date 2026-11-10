import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {generateAppcast,validateAppcast,verifyEdDSA} from './appcast.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const vector=JSON.parse(fs.readFileSync(new URL('./fixtures/ed25519-vector.json',import.meta.url)));
const publicKey=Buffer.from(vector.publicKeyHex,'hex').toString('base64');
const bytes=Buffer.from(vector.messageHex,'hex'),signature=Buffer.from(vector.signatureHex,'hex').toString('base64');
const python=(code,input)=>{const r=spawnSync('python3',['-B','-c',code],{input:JSON.stringify(input),encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;};
test('beta plist pins the architecture feed, key and before-extraction verification',()=>{
  python(`import json,sys,runpy
m=runpy.run_path(${JSON.stringify(path.join(root,'blanc/branding/beta/metadata.py'))})
key=json.load(sys.stdin)
for arch in ('arm64','x64'):
 p=m['updater_metadata']({},key,arch)
 assert p['SUFeedURL']=='https://blanc.day/updates/chromium-beta/'+arch+'.xml'
 assert p['SUPublicEDKey']==key and p['SUVerifyUpdateBeforeExtraction'] is True
 assert p['SUAutomaticallyUpdate'] is False and p['SUShowReleaseNotes'] is False
for value in ('', 'bad', 'A'*43+'='):
 try: m['updater_metadata']({},value,'arm64')
 except ValueError: pass
 else: raise AssertionError('bad key accepted')
`,publicKey);
});
test('offline staging rejects altered archives, changed trees and unsafe links',()=>{
  python(`import json,sys,runpy,tempfile,pathlib,tarfile,plistlib,shutil
root=pathlib.Path(json.load(sys.stdin))
m=runpy.run_path(str(root/'release/stage-sparkle.py'))
v=runpy.run_path(str(root/'blanc/third_party/sparkle/verify.py'))
with tempfile.TemporaryDirectory() as t:
 d=pathlib.Path(t);source=d/'source';framework=source/'Sparkle.framework';b=framework/'Versions/B'
 for n in ['Sparkle','Autoupdate','Updater.app/Contents/MacOS/Updater','XPCServices/Installer.xpc/Contents/MacOS/Installer','XPCServices/Downloader.xpc/Contents/MacOS/Downloader']:
  p=b/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'not a native binary: staging fixture only');p.chmod(0o755)
 (b/'Resources').mkdir();(b/'Resources/Info.plist').write_bytes(plistlib.dumps({'CFBundleShortVersionString':'2.8.0','CFBundleVersion':'2049'}))
 (framework/'Versions/Current').symlink_to('B');(framework/'Sparkle').symlink_to('Versions/Current/Sparkle')
 shutil.copyfile(root/'blanc/third_party/sparkle/LICENSE',source/'LICENSE')
 archive=d/'fixture.tar.xz'
 with tarfile.open(archive,'w:xz') as tar:
  tar.add(framework,arcname='Sparkle.framework');tar.add(source/'LICENSE',arcname='LICENSE')
 sha=v['digest'](archive)
 def refused(fn):
  try: fn()
  except (ValueError,FileNotFoundError): return
  raise AssertionError('unsafe stage accepted')
 refused(lambda:m['stage'](archive,'0'*64,d/'out'))
 staged=m['stage'](archive,sha,d/'out');v['verify'](staged,sha)
 refused(lambda:m['stage'](archive,sha,d/'out'))
 (staged/'Sparkle.framework/Versions/B/Sparkle').write_bytes(b'changed')
 refused(lambda:v['verify'](staged,sha))
 (framework/'escape').symlink_to('/tmp')
 refused(lambda:v['tree'](framework))
`,root);
});
test('local appcast transport discovers a newer build and verifies public-vector bytes',async()=>{
  // Real HTTP, constrained to loopback. This is transport/crypto evidence,
  // explicitly not a Sparkle-framework or installable-DMG handoff.
  const r=JSON.parse(fs.readFileSync(new URL('./fixtures/release.json',import.meta.url)));
  Object.assign(r,{version:'2.0.0-beta.2',shortVersion:'2.0.0-beta.2',tag:'chromium-beta-2.0.0-beta.2',build:2,previousBuild:1});r.sparkle.publicKey=publicKey;
  const xml=generateAppcast(r,'arm64',bytes,signature),requests=[];
  const server=http.createServer((req,res)=>{requests.push(req.url);if(req.url==='/arm64.xml'){res.setHeader('Content-Type','application/rss+xml');res.end(xml);}else if(req.url==='/artifact'){res.end(bytes);}else{res.statusCode=404;res.end();}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const origin=`http://127.0.0.1:${server.address().port}`;
    const feed=await (await fetch(origin+'/arm64.xml')).text();
    assert.equal(Number(feed.match(/<sparkle:version>(\d+)</)[1]),2);assert.ok(r.build>1);
    const download=Buffer.from(await (await fetch(origin+'/artifact')).arrayBuffer());
    validateAppcast(feed,r,'arm64',download,signature);verifyEdDSA(download,signature,publicKey);
    assert.throws(()=>verifyEdDSA(Buffer.from('tampered'),signature,publicKey));
    assert.throws(()=>validateAppcast(feed.replace('<sparkle:version>2','<sparkle:version>1'),r,'arm64',download,signature));
    assert.deepEqual(requests,['/arm64.xml','/artifact']);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('the compiled native update policy refuses downgrade, wrong identity/host/arch and deltas',{skip:process.platform!=='darwin'},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blanc-beta-update-policy-'));
  try{
    const source=path.join(dir,'policy.cc'),binary=path.join(dir,'policy');
    fs.writeFileSync(source,'#include "blanc/browser/mac/beta_update_policy.h"\n#include <cstdio>\nint main(int n,char**v){if(n!=7)return 2;std::puts(blanc::beta::AllowUpdate(v[1],v[2],v[3],v[4],v[5],std::string_view(v[6])=="delta")?"allow":"refuse");}\n');
    const built=spawnSync('/usr/bin/clang++',['-std=c++20','-Wall','-Wextra','-Werror','-I',root,source,'-o',binary],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);
    const version='2.0.0-beta.2',url=`https://github.com/bnfy/blanc/releases/download/chromium-beta-${version}/Blanc-Beta-${version}-mac-arm64.dmg`;
    const base=['1','2',version,url,'arm64','full'];
    const check=(args,result)=>{const r=spawnSync(binary,args,{encoding:'utf8'});assert.equal(r.status,0);assert.equal(r.stdout.trim(),result);};
    check(base,'allow');
    for(const [index,value] of [[0,'2'],[0,'3'],[0,'0'],[1,'02'],[1,'10000'],[1,'2evil'],[2,'1.0.0-beta.2'],[2,'2.0.0'],[2,'2.0.0-beta.0'],[3,url.replace('https:','http:')],[3,url.replace('github.com','attacker.example')],[3,url+'?mirror=1'],[4,'x64'],[4,'other'],[5,'delta']]){const args=[...base];args[index]=value;check(args,'refuse');}
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
