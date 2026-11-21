from pathlib import Path
import subprocess,hashlib,json,os,mmap
r=Path(__file__).parent;app=r/'Blanc Chromium Preview.app'
assert (r/'notarization-complete').exists(),'Notarization/stapling must finish before acceptance'
assert json.loads((r/'notary-result.json').read_text())['status']=='Accepted'
def snapshot():
 out={}
 for p in sorted(app.rglob('*')):
  if p.is_symlink():out[str(p.relative_to(app))]={'symlink':os.readlink(p)}
  elif p.is_file():
   h=hashlib.sha256()
   with p.open('rb') as f:
    for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
   out[str(p.relative_to(app))]={'sha256':h.hexdigest(),'size':p.stat().st_size}
 return out
before=snapshot();(r/'frozen-before.json').write_text(json.dumps(before,indent=2))
f=app/'Contents/Frameworks/Blanc Prototype Framework.framework/Versions/157.0.8103.15/Blanc Prototype Framework'
with f.open('rb') as h:
 with mmap.mmap(h.fileno(),0,access=mmap.ACCESS_READ) as data:assert data.find(b'RESTORE_DIAG')==-1 and data.find(b'blanc-restore-diagnostic')==-1
rows=[]
for name,command in [('startup',['/usr/local/bin/node',str(r/'tests/startup/run.mjs'),str(app),'final']),('recovery',['python3',str(r/'run-recovery.py')]),('core-notice',['python3',str(r/'run-core-notice.py')]),('repeated-targeted',['python3',str(r/'repeat-targeted.py')])]:
 with (r/(name+'-frozen.log')).open('w') as f:p=subprocess.run(command,stdout=f,stderr=f,timeout=600)
 rows.append({'suite':name,'exitCode':p.returncode});(r/'frozen-suites.json').write_text(json.dumps(rows,indent=2));assert snapshot()==before,'Candidate changed during '+name
 print(rows[-1],flush=True)
 if p.returncode:raise SystemExit(p.returncode)
after=snapshot();(r/'frozen-after.json').write_text(json.dumps(after,indent=2));assert after==before
(r/'frozen-complete.json').write_text(json.dumps({'source':(r/'source-revision').read_text().strip(),'notarizationCompletedBeforeTests':True,'allMemberBytesAndSymlinksUnchanged':True,'members':len(before),'temporaryDiagnosticsAbsent':True,'suites':rows},indent=2)+'\n')
