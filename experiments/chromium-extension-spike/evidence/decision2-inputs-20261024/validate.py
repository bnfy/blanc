from pathlib import Path
import hashlib,json
r=Path(__file__).parent;d=json.loads((r/'inputs.json').read_text());base=r.parent.parent
for n,h in d['inputsSha256'].items():assert hashlib.sha256((base/n).read_bytes()).hexdigest()==h,n
assert d['upstreamFiles']==73 and d['hunks']==180 and d['newRuntimeTests']==0 and d['newBuilds']==0
assert not d['latencyMeasured'] and not d['engineSelected'] and not d['Decision2Approved'] and d['electron']=='paused'
for line in (r/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1);assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
print('Eight source records, recorded inventory and zero-new-test decision status verified')
