from pathlib import Path
import json,hashlib,gzip
r=Path(__file__).parent
d=json.loads((r/'ci.json').read_text());s=json.loads((r/'status.json').read_text())
assert d['headRevision']==s['reviewedHead'] and not d['hasMore'] and d['statuses']==[]
counts={}
for c in d['checks']:
 assert c['head_sha']==s['reviewedHead'] and c['status']=='completed'
 counts[c['conclusion']]=counts.get(c['conclusion'],0)+1
assert counts=={'success':25,'failure':2,'skipped':2}
assert {c['name'] for c in d['checks'] if c['conclusion']=='failure'}=={x['name'] for x in s['remainingFailures']}
assert next(c for c in d['checks'] if c['name']=='CodeQL')['output']['title']==s['codeql']
for n in ['120930424054.log.gz','120930424032.log.gz']:
 t=gzip.decompress((r/n).read_bytes()).decode();assert "'allowed'" in t and "'SecurityError'" in t and 'modified-link-click-smoke.mjs:168' in t
for label in ['desktop','site','tab-import-worker','tab-import-companions']:
 assert label+': no unsuppressed high or critical dependency findings' in gzip.decompress((r/'substrate-excerpt.log.gz').read_bytes()).decode()
for line in (r/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1);assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
print('Exact-head accounting, both failure assertions, four audit results, and archived hashes verified')
