from pathlib import Path
import subprocess,json
r=Path(__file__).parent;rows=[]
for name,script,report in [('core',r/'tests/core/run.mjs',r/'tests/core/report.json'),('notice',r/'test-notice.mjs',r/'notice-test.json')]:
 with (r/(name+'-run.log')).open('w') as f:p=subprocess.run(['/usr/local/bin/node',str(script),str(r/'Blanc Chromium Preview.app')],stdout=f,stderr=f)
 d=json.loads(report.read_text());rows.append({'schedule':name,'exitCode':p.returncode,'checks':len(d.get('checks',[])),'error':d.get('error')});(r/'core-notice-summary.json').write_text(json.dumps(rows,indent=2)+'\n')
 if p.returncode or d.get('error'):raise SystemExit(1)
print(rows)
