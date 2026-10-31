from pathlib import Path
import json,hashlib,mmap,subprocess,os
r=Path(__file__).parent;app=r/'Blanc Chromium Preview.app'
# Pre-notary signed test snapshot; acceptance still requires Apple notarization.

metadata=json.loads((app/'Contents/Resources/preview-build.json').read_text())
assert metadata['revision']==(r/'source-revision').read_text().strip()
framework=app/'Contents/Frameworks/Blanc Prototype Framework.framework/Versions/157.0.8103.15/Blanc Prototype Framework'
rows=json.loads(Path('/private/tmp/blanc-l11-fix/spki-api-verification.json').read_text())['checks']
keys=sorted(set(x['spkiSha256'] for x in rows));assert len(keys)==8
with framework.open('rb') as f:
 with mmap.mmap(f.fileno(),0,access=mmap.ACCESS_READ) as data:
  coverage={key:data.find(bytes.fromhex(key))>=0 for key in keys}
assert all(coverage.values()),coverage
inventory={}
for p in sorted(app.rglob('*')):
 if p.is_symlink():inventory[str(p.relative_to(app))]={'symlink':os.readlink(p)}
 elif p.is_file():
  h=hashlib.sha256()
  with p.open('rb') as f:
   for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
  inventory[str(p.relative_to(app))]={'sha256':h.hexdigest(),'size':p.stat().st_size}
checks=[]
for command in [['codesign','--verify','--deep','--strict',str(app)]]:
 p=subprocess.run(command,capture_output=True,text=True);checks.append({'tool':command[0],'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr});assert p.returncode==0
result={'metadata':metadata,'newCertificateKeysInSignedFramework':coverage,'verification':checks,'files':inventory}
(r/'frozen-candidate.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'source':metadata['revision'],'certificateKeys':len(coverage),'members':len(inventory),'phase':'Developer-ID-signed, notarization pending'}))
