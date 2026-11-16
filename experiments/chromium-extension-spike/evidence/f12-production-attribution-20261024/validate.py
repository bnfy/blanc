from pathlib import Path
import hashlib,json
r=Path(__file__).parent;d=json.loads((r/'source-chain.json').read_text());s=json.loads((r/'status.json').read_text())
assert d['researchHooks']==0 and d['repoAndPreparedProxyEqual'] and d['repoAndPreparedUpdateWrapperEqual']
assert s['newRuntimeTests']==0 and s['newBuilds']==0 and not s['privateDiagnosticsEnabled']
for line in (r/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1);assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
print('Source-chain record verified; no runtime/build acceptance added')
