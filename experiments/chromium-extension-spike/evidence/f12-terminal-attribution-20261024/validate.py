from pathlib import Path
import json,hashlib
r=Path(__file__).parent
for name,count in [('denied-report.json',10),('timeout-regular-accepted.json',6),('timeout-report.json',6)]:
 d=json.loads((r/name).read_text());assert d['complete'] and len(d['checks'])==count and all(x['pass'] for x in d['checks'])
assert not json.loads((r/'timeout-before-fix.json').read_text())['complete']
assert not json.loads((r/'timeout-mixed-before-settle.json').read_text())['complete']
for line in (r/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1);assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
print('Denied10, regular-timeout6, private-timeout6 verified; incomplete runs retained')
