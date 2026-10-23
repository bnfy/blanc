from pathlib import Path
import hashlib,json,gzip
r=Path(__file__).parent
for row in (r/'SHA256SUMS').read_text().splitlines():
 h,p=row.split('  ',1);assert hashlib.sha256((r/p).read_bytes()).hexdigest()==h,p
s=json.loads((r/'status.json').read_text());assert s['trialReverted']
l=gzip.decompress((r/'native-clone-regression.log.gz').read_bytes()).decode()
assert "'allowed'" in l and "'SecurityError'" in l and 'modified-link-click-smoke.mjs:168' in l
print('Failed native-clone attempt retained; trial reverted; L11 remains open')

assert s['ownerDecision'] == 'Keep Electron builds pending; record L11 blocked'
assert s['secondTrial']['trialReverted']
assert 'modified-link-click-smoke.mjs:168' in gzip.decompress((r/'native-clone-history-regression.log.gz').read_bytes()).decode()
