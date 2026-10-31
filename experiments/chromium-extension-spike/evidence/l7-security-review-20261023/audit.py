from pathlib import Path
import json,hashlib,sqlite3,subprocess,shutil
r=Path(__file__).parent; app=Path('/private/tmp/blanc-preview-notice-final/Blanc Chromium Preview.app')
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
audit=json.loads(Path('/private/tmp/blanc-preview-notice-final/final-candidate-audit.json').read_text());out={'artifact':{},'storage':{}}
for f in audit['machO']:assert digest(app/f['path'])==f['sha256'],f['path']
out['artifact']['machOHashesMatch']=len(audit['machO'])
for args,name in [(['codesign','--verify','--deep','--strict',str(app)],'codesign'),(['spctl','--assess','--type','execute','-vv',str(app)],'gatekeeper'),(['xcrun','stapler','validate',str(app)],'staple')]:
 p=subprocess.run(args,capture_output=True,text=True);out['artifact'][name]={'exit':p.returncode,'output':p.stdout+p.stderr};assert p.returncode==0,name
out['artifact']['zipSha256']=digest(Path('/private/tmp/blanc-preview-notice-final/Blanc-Chromium-Preview-stapled.zip'))
assert out['artifact']['zipSha256']=='f177e0b5100db9a3fc83c7d5522cc343b86582add4d209d49696cef4f3729a55'
for mode in ['regular','private']:
 d=r/mode/'profile'; markers=[];files=[p for p in d.rglob('*') if p.is_file() and not p.is_symlink()]
 for f in files:
  if f.stat().st_size<64*1024*1024 and b'127.0.0.1:9890' in f.read_bytes():markers.append(str(f.relative_to(d)))
 h=d/'Default/History'; rows=[]
 if h.exists():
  copy=r/(mode+'-History.sqlite');before=digest(h);shutil.copy2(h,copy);c=sqlite3.connect(str(copy));rows=c.execute("select url from urls where url like '%127.0.0.1:9890%'").fetchall();c.close();assert digest(h)==before;copy.unlink()
 out['storage'][mode]={'files':len(files),'fixtureURLFiles':markers,'historyURLRows':len(rows),'blancFiles':[str(f.relative_to(d)) for f in files if 'Blanc' in f.name]}
 if mode=='private':assert not markers and not rows and not out['storage'][mode]['blancFiles']
shutil.copyfile('/private/tmp/blanc-preview-notice-final/final-candidate-audit.json',r/'candidate-audit.json')
(r/'artifact-storage.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
