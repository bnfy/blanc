from pathlib import Path
import subprocess,json,os,hashlib
r=Path(__file__).parent
assert (r/'notarization-complete').exists(), 'Notarization has not completed'
app=r/'Blanc Chromium Preview.app';node='/usr/local/bin/node'
env=dict(os.environ,PATH='/usr/local/bin:'+os.environ.get('PATH',''))
frozen=json.loads((r/'frozen-candidate.json').read_text())['files']
def verify():
 for n,v in frozen.items():
  p=app/n
  if 'symlink' in v:assert p.is_symlink() and os.readlink(p)==v['symlink'],n
  else:
   h=hashlib.sha256()
   with p.open('rb') as f:
    for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
   assert p.stat().st_size==v['size'] and h.hexdigest()==v['sha256'],n
cases=[('prerender-healthy',[node,str(r/'prerender-healthy.mjs')],r/'prerender-healthy/report.json',8),('prerender-loss',[node,str(r/'prerender-loss.mjs')],r/'prerender-loss/report.json',12),('prerender-timeout',[node,str(r/'prerender-timeout-final.mjs')],r/'prerender-timeout-final/report.json',6),('startup',[node,'--experimental-websocket',str(r/'checks/startup/run.mjs'),str(app),'final'],r/'checks/startup/verification-final.json',7),('recovery',[node,'--experimental-websocket',str(r/'checks/recovery/run.mjs'),str(app)],r/'checks/recovery/report.json',6),('core',[node,'--experimental-websocket',str(r/'checks/core/run.mjs'),str(app)],r/'checks/core/report.json',17),('notice',[node,'--experimental-websocket',str(r/'test-notice-focused.mjs')],r/'notice-test.json',16)]
rows=[]
for name,cmd,path,count in cases:
 with (r/('postnotary-'+name+'.log')).open('w') as log:p=subprocess.run(cmd,env=env,stdout=log,stderr=log,timeout=300)
 d=json.loads(path.read_text()) if path.exists() else {};checks=d.get('checks',[]) or [c for run in d.get('runs',[]) for c in run['checks']]
 row={'suite':name,'exit':p.returncode,'checks':len(checks),'expectedChecks':count,'pass':p.returncode==0 and len(checks)==count and all(c.get('pass') is True for c in checks) and not d.get('error'),'error':d.get('error')};rows.append(row);(r/'postnotary-summary.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(row),flush=True)
 verify()
 if not row['pass']:raise SystemExit(1)
print('All',sum(x['checks'] for x in rows),'post-notary checks pass; signed members unchanged',flush=True)
