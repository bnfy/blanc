from pathlib import Path
import json,hashlib,subprocess,os
root=Path('/private/tmp/blanc-prerender-final-20261024');details=json.loads((root/'artifact-details.json').read_text());inventory=json.loads(next((root/'artifacts').glob('*.files.json')).read_text());found=[]
def command(args):
 p=subprocess.run(args,capture_output=True,text=True);return {'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
for base in [Path.home()/'Downloads',Path.home()/'Library/Mobile Documents/com~apple~CloudDocs/Downloads']:
 if not base.is_dir():continue
 for app in base.glob('Blanc Chromium Preview*.app'):
  metadata=app/'Contents/Resources/preview-build.json'
  if metadata.is_file() and json.loads(metadata.read_text()).get('revision')==details['source']:found.append(app)
assert len(found)==1,'Expected exactly one new corrected candidate; found '+str(len(found))
app=found[0];out={'source':details['source'],'path':str(app),'regularFilesVerified':0,'symlinksVerified':0}
for name,record in inventory['files'].items():
 p=app/name;assert p.is_file() and not p.is_symlink() and digest(p)==record['sha256'],name;out['regularFilesVerified']+=1
for name,target in inventory['symlinks'].items():assert os.readlink(app/name)==target;out['symlinksVerified']+=1
actual_files={str(p.relative_to(app)) for p in app.rglob('*') if p.is_file() and not p.is_symlink()};actual_links={str(p.relative_to(app)) for p in app.rglob('*') if p.is_symlink()};assert actual_files==set(inventory['files']);assert actual_links==set(inventory['symlinks'])
for name,args in [('quarantine',['xattr','-p','com.apple.quarantine',str(app)]),('codesign',['codesign','--verify','--deep','--strict',str(app)]),('gatekeeper',['spctl','--assess','--type','execute','--verbose=4',str(app)]),('stapler',['xcrun','stapler','validate',str(app)])]:
 out[name]=command(args);assert out[name]['exitCode']==0,out[name]
assert 'Safari' in out['quarantine']['stdout'],'Native Safari quarantine missing'
(root/'native-download.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
