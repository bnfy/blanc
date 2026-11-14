from pathlib import Path
import hashlib,json
r=Path(__file__).parent;b=r.parent.parent
for n,h in json.loads((r/'source-bindings.json').read_text()).items():assert hashlib.sha256((b/n).read_bytes()).hexdigest()==h,n
d=json.loads((r/'existing-update-evidence.json').read_text());assert d['existingNativeJoins']==12 and d['uniqueTokens']==12 and d['newRuntimeTests']==0 and not d['crossRuntimeAcceptance']
f=json.loads((r/'effective-feature-summary.json').read_text());assert f['complete'] and f['exit']['code']==0 and all(not x['enable-features'] and not x['disable-features'] for x in f['features'].values())
assert all(x['removed'] for x in json.loads((r/'cleanup.json').read_text())['profiles'])
for line in (r/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1);assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
print('Bound source records, twelve existing joins and new effective-feature observation verified')
