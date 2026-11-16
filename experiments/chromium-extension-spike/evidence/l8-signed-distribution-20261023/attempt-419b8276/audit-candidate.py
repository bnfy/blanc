import pathlib,hashlib,plistlib,subprocess,json,sys
r=pathlib.Path(__file__).parent; app=r/'Blanc Chromium Preview.app'
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
stage=sys.argv[1]; expected='157.0.8103.15'; records=[]; identifiers=[]
for p in sorted(app.rglob('Info.plist')):
 d=plistlib.loads(p.read_bytes()); i=d.get('CFBundleIdentifier',''); identifiers.append({'path':str(p.relative_to(app)),'id':i,'version':d.get('CFBundleShortVersionString')})
 if i.startswith('day.blanc.prototype'): raise AssertionError('Unconverted prototype ID: '+i)
main=plistlib.loads((app/'Contents/Info.plist').read_bytes()); assert main['CFBundleIdentifier']=='me.bnfy.blanc.chromium.preview'; assert not main.get('CFBundleURLTypes'); assert not main.get('CFBundleDocumentTypes'); assert main.get('CFBundleShortVersionString')==expected,main.get('CFBundleShortVersionString')
versions=app/'Contents/Frameworks/Blanc Prototype Framework.framework/Versions'; assert (versions/'Current').resolve().name==expected
assert [p.name for p in versions.iterdir() if p.is_dir() and not p.is_symlink()]==[expected]
magic={bytes.fromhex(x) for x in ['cffaedfe','cefaedfe','feedfacf','feedface','cafebabe','bebafeca','cafebabf','bfbafeca']}
for p in sorted(app.rglob('*')):
 if not p.is_file() or p.is_symlink():continue
 with p.open('rb') as f:m=f.read(4)
 if m not in magic:continue
 arch=subprocess.check_output(['lipo','-archs',str(p)],text=True).strip(); assert arch=='arm64',arch
 ent=subprocess.run(['codesign','-d','--entitlements',':-',str(p)],capture_output=True)
 data=ent.stdout; start=data.find(b'<?xml')
 e=plistlib.loads(data[start:]) if start>=0 else {}
 assert not e.get('com.apple.security.get-task-allow'); assert not e.get('com.apple.security.cs.disable-library-validation')
 records.append({'path':str(p.relative_to(app)),'sha256':digest(p),'architecture':arch,'entitlements':e})
assets={}
for rel in ['Contents/Resources/BlancAssets/host.css','Contents/Resources/BlancAssets/host.js','Contents/Resources/BlancAssets/host.html','Contents/Resources/BlancAssets/extensions.js','Contents/Resources/BlancAssets/extensions.css','Contents/Resources/BlancAssets/renderer.js','Contents/Resources/BlancBlocker/engine.js']:
 p=app/rel
 if p.exists(): assets[rel]=digest(p)
compliance={str(p.relative_to(app)):digest(p) for p in (app/'Contents/Resources/Compliance').rglob('*') if p.is_file()}
assert len(compliance)>=20
verification=subprocess.run(['codesign','--verify','--deep','--strict',str(app)],capture_output=True,text=True)
assert verification.returncode==0,verification.stderr
identity=subprocess.run(['codesign','-d','--verbose=4',str(app)],capture_output=True,text=True).stderr
assert 'TeamIdentifier=XYGUCY4498' in identity,identity
assert 'Authority=Developer ID Application: Anthony Loria (XYGUCY4498)' in identity,identity
out={'stage':stage,'version':expected,'identifiers':identifiers,'machO':records,'assets':assets,'compliance':compliance,'signingIdentity':identity}

(r/(stage+'-candidate-audit.json')).write_text(json.dumps(out,indent=2)+'\n')
if stage=='final':
 before=json.loads((r/'signed-candidate-audit.json').read_text());assert before['machO']==out['machO'];assert before['assets']==out['assets'];assert before['compliance']==out['compliance']
print(json.dumps({'stage':stage,'version':expected,'machO':len(records),'identities':len(identifiers),'hashesUnchanged':stage=='final'}))
