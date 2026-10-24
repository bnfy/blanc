import json,hashlib
from pathlib import Path
r=Path(__file__).parent;artifacts=Path('/private/tmp/blanc-prerender-final-20261024/artifacts');d=json.loads((r/'draft-uploaded.json').read_text());rows=[]
for a in d['assets']:
 p=artifacts/a['name'];h=hashlib.sha256(p.read_bytes()).hexdigest();assert a['size']==p.stat().st_size;assert a['digest']=='sha256:'+h,(a['name'],a['digest']);rows.append({'name':a['name'],'sha256':h,'size':a['size'],'matched':True})
(r/'uploaded-byte-verification.json').write_text(json.dumps(rows,indent=2)+'\n');print('Verified',len(rows),'uploaded asset digests; release remains draft=',d['draft'])
