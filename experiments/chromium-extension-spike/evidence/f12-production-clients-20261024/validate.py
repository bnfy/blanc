from pathlib import Path
import json,hashlib
r=Path(__file__).parent;f=json.loads((r/'functional-report.json').read_text());i=json.loads((r/'identity-report.json').read_text())
assert not f['complete'] and len(f['checks'])==11 and sum(x['pass'] for x in f['checks'])==10
assert not f['checks'][-1]['pass'] and f['exit']['code']==0
assert i['complete'] and len(i['checks'])==1 and i['checks'][0]['pass'] and i['exit']['code']==0
assert all(x['removed'] for x in json.loads((r/'cleanup.json').read_text())['profiles'])
for line in (r/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1);assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
print('10 functional passes plus 1 separate protocol identity pass; initial failures retained')
