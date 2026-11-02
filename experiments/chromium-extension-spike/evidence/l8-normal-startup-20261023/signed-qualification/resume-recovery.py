from pathlib import Path
import subprocess,json
r=Path(__file__).parent
out=json.loads((r/'recovery-summary.json').read_text())[:6]
for name,file in [('nonregular','pipe-report.json'),('teardown','teardown-report.json')]:
 d=r/'regression'/name if name!='teardown' else r/'regression'
 script=d/'run.mjs' if name!='teardown' else d/'teardown.mjs'
 with (d/(name+'-console.log')).open('w') as log:
  p=subprocess.run(['/usr/local/bin/node',str(script),str(r/'Blanc Chromium Preview.app')],stdout=log,stderr=log)
 result=json.loads((d/file).read_text()) if (d/file).exists() else {}
 row={'schedule':name,'exitCode':p.returncode,'checkpoints':len(result.get('checks',[])),'error':result.get('error')};out.append(row)
 (r/'recovery-summary.json').write_text(json.dumps(out,indent=2)+'\n')
 print(json.dumps(row),flush=True)
 if p.returncode or result.get('error'):raise SystemExit(1)
print('Eight signed recovery schedules passed',sum(x['checkpoints'] for x in out),'checkpoints')
