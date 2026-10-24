from pathlib import Path
import subprocess,json
r=Path(__file__).parent
reports=[]
for name,script,report in [('core',r/'tests/core/run.mjs',r/'tests/core/report.json'),('recovery',r/'tests/recovery/run.mjs',r/'tests/recovery/report.json'),('notice',r/'test-notice.mjs',r/'notice-test.json')]:
 with (r/(name+'-run.log')).open('w') as log:p=subprocess.run(['/usr/local/bin/node',str(script),str(r/'Blanc Chromium Preview.app')],stdout=log,stderr=log)
 d=json.loads(report.read_text()) if report.exists() else {}
 row={'schedule':name,'exitCode':p.returncode,'checks':len(d.get('checks',[])),'error':d.get('error')};reports.append(row);(r/'local-runtime-summary.json').write_text(json.dumps(reports,indent=2)+'\n');print(row,flush=True)
 if p.returncode or d.get('error'):raise SystemExit(1)
