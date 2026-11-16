from pathlib import Path
import json,hashlib,os,subprocess
r=Path(__file__).parent;app=r/'Blanc Chromium Preview.app'
frozen=json.loads((r/'frozen-candidate.json').read_text())['files']
def validate():
 for rel,item in frozen.items():
  p=app/rel
  if 'symlink' in item: assert p.is_symlink() and os.readlink(p)==item['symlink'],rel
  else:
   h=hashlib.sha256()
   with p.open('rb') as f:
    for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
   assert h.hexdigest()==item['sha256'],rel
rows=[]
for name,script,report,extra in [('startup','checks/startup/run.mjs','checks/startup/verification-final.json',['final']),('recovery','checks/recovery/run.mjs','checks/recovery/report.json',[]),('core','checks/core/run.mjs','checks/core/report.json',[]),('notice','test-notice.mjs','notice-test.json',[])]:
 with (r/(name+'-console.log')).open('w') as f: p=subprocess.run(['/usr/local/bin/node',str(r/script),str(app),*extra],stdout=f,stderr=f,timeout=600)
 data=json.loads((r/report).read_text()) if (r/report).exists() else {}
 checks=data.get('checks',[])
 row={'suite':name,'exitCode':p.returncode,'checks':len(checks),'allChecksPass':all(c.get('pass') is True for c in checks),'error':data.get('error')}
 rows.append(row);(r/'checks-summary.json').write_text(json.dumps(rows,indent=2)+'\n');print(row,flush=True)
 validate()
 if p.returncode or row['error'] or not checks or not row['allChecksPass']: raise SystemExit(1)
print('Frozen signed candidate checks passed',sum(row['checks'] for row in rows),flush=True)
