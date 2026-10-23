from pathlib import Path
import subprocess,json
r=Path(__file__).parent
for name in ['regular','private','scope','core','recovery']:
 d=r/'regression'/name
 cmd=['/usr/local/bin/node',str(d/'run.mjs')]
 if name in ['core','recovery']:cmd += [str(r/'Blanc Chromium Preview.app')]
 with (d/'run.log').open('w') as out: p=subprocess.run(cmd,stdout=out,stderr=out)
 result=json.loads((d/'report.json').read_text()) if (d/'report.json').exists() else {}
 print(name,p.returncode,len(result.get('checks',[])),flush=True)
 if p.returncode: raise SystemExit(p.returncode)
